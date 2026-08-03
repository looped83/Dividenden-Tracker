/**
 * iCal-Verarbeitung der Kalendersynchronisation (Auftrag §2/§3).
 *
 * Geparst wird mit ICAL.js (kewisch/ical.js) — der etablierten, gepflegten und
 * abhaengigkeitsfreien RFC-5545-Implementierung, die sowohl unter Deno (Edge
 * Function) als auch unter Node (Tests) laeuft. Ein eigener vollstaendiger
 * Parser waere an Zeilenfaltung, Escaping, Parametern und Zeitzonen absehbar
 * fehleranfaellig.
 *
 * Diese Datei enthaelt bewusst **keine** Laufzeit-spezifischen Aufrufe (kein
 * `Deno`, kein `fetch`, keine Datenbank): so laeuft exakt derselbe Code in der
 * Edge Function und im Unit-Test.
 */
import ICAL from "ical.js";
import { parseSummary } from "./summary.ts";
import {
  DISPLAY_TIME_ZONE,
  addDays,
  calendarDayInZone,
  isValidTimeZone,
  isoDate,
  wallClockToInstant,
} from "./datetime.ts";

/**
 * ICAL.js liefert seine Typen ueber einen Standard-Export; die Klassen sind
 * darin Werte. Die drei hier gebrauchten Instanztypen werden deshalb einmal
 * abgeleitet, statt an jeder Signatur erneut hergeleitet zu werden.
 */
type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalProperty = InstanceType<typeof ICAL.Property>;
type IcalTime = InstanceType<typeof ICAL.Time>;

export type CalendarEventType = "payment" | "ex_date";
export type CalendarEventState = "active" | "cancelled" | "removed_from_source";

/** Ein fertig geprueftes Ereignis des Feeds, bereit fuer die Datenbank. */
export interface ParsedCalendarEvent {
  externalUid: string;
  eventType: CalendarEventType;
  eventState: Exclude<CalendarEventState, "removed_from_source">;
  /** SUMMARY unveraendert; fehlt sie im Feed, bleibt sie leer. */
  title: string | null;
  /** Unternehmensname aus der SUMMARY, ohne Betrag, Ereignisart und Depot. */
  companyName: string | null;
  /** Erwarteter Betrag **laut Quelle**, kanonischer Dezimalstring. */
  expectedAmount: string | null;
  /** ISO-4217-Code zum erwarteten Betrag. */
  expectedCurrency: string | null;
  /** Depot oder Broker, den die Quelle zu diesem Termin nennt. */
  sourcePortfolio: string | null;
  description: string | null;
  location: string | null;
  externalUrl: string | null;
  categories: string[] | null;
  /** Maszgeblicher Kalendertag ("YYYY-MM-DD"). */
  eventDate: string;
  /** Letzter Kalendertag mehrtaegiger Termine, inklusiv. */
  endDate: string | null;
  /** Nur bei Terminen mit Uhrzeit (ISO-8601 mit Zeitzone), sonst null. */
  startsAt: string | null;
  endsAt: string | null;
  isAllDay: boolean;
  sequenceNumber: number | null;
  recurrenceRule: string | null;
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  /** Alle Eigenschaften des VEVENT als Text — fuer spaetere Auswertungen. */
  rawData: Record<string, string | string[]>;
}

export interface ParsedCalendar {
  events: ParsedCalendarEvent[];
  /** Ereignisse ohne UID oder ohne Startdatum sowie Dubletten derselben UID. */
  skipped: number;
}

/** Der Inhalt ist kein verwertbarer iCalendar-Datenstrom. */
export class IcalParseError extends Error {
  constructor(message = "Der Kalenderinhalt konnte nicht gelesen werden.") {
    super(message);
    this.name = "IcalParseError";
  }
}

/**
 * ICAL.js ist in JavaScript geschrieben; zwei Methoden liefern in den
 * mitgelieferten Typen `any[]`. Statt diese Unsicherheit durch den ganzen
 * Modulcode zu tragen, wird sie hier einmal an der Systemgrenze eingefangen
 * und in `unknown` ueberfuehrt — alles Weitere ist streng typisiert.
 */
function propertyValues(property: IcalProperty): unknown[] {
  return property.getValues() as unknown[];
}

function firstParameter(property: IcalProperty, name: string): string | null {
  const value: unknown = property.getFirstParameter(name);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function trimmedOrNull(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  // Time, Recur, Duration, Period und UtcOffset besitzen alle eine eigene
  // Textdarstellung. Ein Wert ohne eine solche (etwa das Objekt eines
  // GEO-Feldes) wird uebergangen statt als „[object Object]" gespeichert.
  if (typeof value === "object") {
    const text = (value as { toString: () => string }).toString();
    return text === "[object Object]" ? "" : text;
  }
  return "";
}

/** Kalenderfelder eines Zeitpunkts ohne Zeitzonenbezug. */
function wallClockOf(time: IcalTime): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  return {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
  };
}

/**
 * Absoluter Zeitpunkt eines Termins mit Uhrzeit.
 *
 * Die Zeitzone stammt zuerst aus dem `TZID`-Parameter der Eigenschaft, sonst
 * aus dem Wert selbst (`...Z` = UTC). Ein Feed ohne beides ist „floating"; ein
 * solcher Termin gilt nach RFC 5545 in der lokalen Zeit des Betrachters —
 * hier also Europe/Berlin (Auftrag §14). Bewusst nicht ueber
 * `ICAL.Time#toJSDate()`: das rechnet floating in der Zeitzone des Servers,
 * die in einer Edge Function UTC ist.
 */
function instantOf(time: IcalTime, property: IcalProperty): Date {
  const declared = firstParameter(property, "tzid") ?? time.zone.tzid;
  const zone = declared && isValidTimeZone(declared) ? declared : DISPLAY_TIME_ZONE;
  return wallClockToInstant(wallClockOf(time), zone);
}

interface EventTime {
  /** Kalendertag des Beginns. */
  date: string;
  /** Zeitpunkt des Beginns; null bei ganztaegigen Terminen. */
  instant: Date | null;
}

function readTime(property: IcalProperty): EventTime | null {
  const value: unknown = property.getFirstValue();
  if (!(value instanceof ICAL.Time)) return null;

  if (value.isDate) {
    return { date: isoDate(value.year, value.month, value.day), instant: null };
  }

  const instant = instantOf(value, property);
  return { date: calendarDayInZone(instant, DISPLAY_TIME_ZONE), instant };
}

function readCategories(vevent: IcalComponent): string[] | null {
  const categories: string[] = [];
  for (const property of vevent.getAllProperties("categories")) {
    for (const value of propertyValues(property)) {
      const text = trimmedOrNull(asText(value), 200);
      if (text && !categories.includes(text)) categories.push(text);
    }
  }
  return categories.length > 0 ? categories : null;
}

function readTimestamp(vevent: IcalComponent, name: string): string | null {
  const value: unknown = vevent.getFirstPropertyValue(name);
  if (!(value instanceof ICAL.Time)) return null;
  const property = vevent.getFirstProperty(name);
  if (!property) return null;
  const instant = value.isDate
    ? wallClockToInstant(
        { ...wallClockOf(value), hour: 0, minute: 0, second: 0 },
        DISPLAY_TIME_ZONE,
      )
    : instantOf(value, property);
  return instant.toISOString();
}

function readSequence(vevent: IcalComponent): number | null {
  const value: unknown = vevent.getFirstPropertyValue("sequence");
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

/**
 * Alle Eigenschaften des Ereignisses als Text, alphabetisch geordnet.
 *
 * Die feste Ordnung macht das Ergebnis vorhersagbar — fuer Tests und fuer den
 * Blick in die Datenbank. Der Abgleich selbst vergleicht ohnehin
 * reihenfolgeunabhaengig (`sync.ts`), denn `jsonb` bewahrt die Schluessel-
 * ordnung nicht — ohne das schriebe jede Synchronisation jede Zeile neu.
 */
function readRawData(vevent: IcalComponent): Record<string, string | string[]> {
  const raw: Record<string, string | string[]> = {};
  for (const property of vevent.getAllProperties()) {
    const values = propertyValues(property).map(asText);
    if (values.length === 0) continue;
    const single = values.length === 1 ? values[0] : undefined;
    raw[property.name] = single ?? values;
  }
  return Object.fromEntries(
    Object.entries(raw).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/**
 * Ereignistyp. Maszgeblich ist das Schlagwort der SUMMARY („Zahltag", „Ex-Tag"),
 * das `parseSummary` bereits herausgeloest hat. Fehlt es, entscheiden die
 * CATEGORIES; ohne jeden Hinweis bleibt es beim Zahltag — dem einzigen Typ, den
 * der aktuell verwendete Feed (`dates=pay`) enthaelt.
 */
function readEventType(
  fromSummary: CalendarEventType | null,
  categories: string[] | null,
): CalendarEventType {
  if (fromSummary !== null) return fromSummary;
  const haystack = (categories ?? []).join(" ").toLowerCase();
  if (/\bex[- ]?(date|tag|dividende)\b/.test(haystack)) return "ex_date";
  return "payment";
}

function parseEvent(vevent: IcalComponent): ParsedCalendarEvent | null {
  const externalUid = trimmedOrNull(vevent.getFirstPropertyValue("uid"), 512);
  if (!externalUid) return null;

  const dtstart = vevent.getFirstProperty("dtstart");
  if (!dtstart) return null;
  const start = readTime(dtstart);
  if (!start) return null;

  const dtend = vevent.getFirstProperty("dtend");
  const end = dtend ? readTime(dtend) : null;
  const isAllDay = start.instant === null;

  // DTEND ist bei ganztaegigen Terminen **exklusiv** (RFC 5545): ein eintaegiger
  // Termin am 15. traegt DTEND 16. Gespeichert wird der letzte belegte Tag.
  let endDate: string | null = null;
  if (end && isAllDay) {
    const lastDay = addDays(end.date, -1);
    endDate = lastDay > start.date ? lastDay : null;
  } else if (end && !isAllDay && end.date > start.date) {
    endDate = end.date;
  }

  const title = trimmedOrNull(vevent.getFirstPropertyValue("summary"), 500);
  const summary = parseSummary(title);
  const categories = readCategories(vevent);
  const status = trimmedOrNull(vevent.getFirstPropertyValue("status"), 50);
  const recurrence = vevent.getFirstPropertyValue("rrule");

  return {
    externalUid,
    eventType: readEventType(summary.eventType, categories),
    eventState: status?.toUpperCase() === "CANCELLED" ? "cancelled" : "active",
    title,
    companyName: summary.company,
    expectedAmount: summary.amount,
    expectedCurrency: summary.currency,
    sourcePortfolio: summary.portfolio,
    description: trimmedOrNull(vevent.getFirstPropertyValue("description"), 4000),
    location: trimmedOrNull(vevent.getFirstPropertyValue("location"), 500),
    externalUrl: trimmedOrNull(vevent.getFirstPropertyValue("url"), 2000),
    categories,
    eventDate: start.date,
    endDate,
    startsAt: start.instant?.toISOString() ?? null,
    endsAt: isAllDay ? null : (end?.instant?.toISOString() ?? null),
    isAllDay,
    sequenceNumber: readSequence(vevent),
    recurrenceRule: recurrence ? trimmedOrNull(asText(recurrence), 1000) : null,
    sourceCreatedAt: readTimestamp(vevent, "created"),
    sourceUpdatedAt:
      readTimestamp(vevent, "last-modified") ?? readTimestamp(vevent, "dtstamp"),
    rawData: readRawData(vevent),
  };
}

/**
 * Liest einen iCalendar-Datenstrom und liefert die verwertbaren Ereignisse.
 *
 * Fehlerhafte einzelne Ereignisse (ohne UID oder ohne Startdatum) beenden den
 * Lauf nicht — sie werden gezaehlt und uebersprungen. Nur ein Inhalt, der
 * insgesamt kein iCalendar ist, fuehrt zum Abbruch: dann ist der Feed kaputt,
 * und ein Abgleich haette keine Grundlage.
 */
export function parseIcalCalendar(text: string): ParsedCalendar {
  let root: IcalComponent;
  try {
    // `ICAL.parse` ist untypisiert (jCal-Array); die Struktur wird hier einmal
    // benannt, statt `any` weiterzureichen.
    const jcal = ICAL.parse(text) as unknown as [string, unknown[], unknown[]];
    root = new ICAL.Component(jcal);
  } catch {
    throw new IcalParseError();
  }
  if (root.name !== "vcalendar") {
    throw new IcalParseError();
  }

  // Zeitzonendefinitionen des Feeds bekannt machen, bevor Zeiten gelesen werden.
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    const tzid = trimmedOrNull(vtimezone.getFirstPropertyValue("tzid"), 100);
    if (!tzid || ICAL.TimezoneService.has(tzid)) continue;
    try {
      ICAL.TimezoneService.register(vtimezone);
    } catch {
      // Eine unbrauchbare VTIMEZONE darf den Lauf nicht beenden; die Zeitzone
      // wird dann ueber die IANA-Kennung der Laufzeit aufgeloest.
    }
  }

  const events: ParsedCalendarEvent[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  for (const vevent of root.getAllSubcomponents("vevent")) {
    const event = parseEvent(vevent);
    if (!event) {
      skipped += 1;
      continue;
    }
    // Dieselbe UID zweimal im selben Feed: der spaetere Eintrag gewinnt. Ohne
    // das erzeugte ein Upsert zwei konkurrierende Schreibvorgaenge auf
    // dieselbe Zeile.
    const existingIndex = seen.get(event.externalUid);
    if (existingIndex === undefined) {
      seen.set(event.externalUid, events.length);
      events.push(event);
    } else {
      events[existingIndex] = event;
      skipped += 1;
    }
  }

  return { events, skipped };
}
