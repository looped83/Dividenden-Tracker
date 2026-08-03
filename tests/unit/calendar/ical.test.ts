import { describe, expect, it } from "vitest";
import {
  IcalParseError,
  parseIcalCalendar,
} from "../../../supabase/functions/_shared/ical.ts";

/**
 * iCal-Verarbeitung der Kalendersynchronisation (Auftrag §20).
 *
 * Die Beispiele sind vollstaendig erfunden und enthalten weder eine echte
 * Feed-Adresse noch einen Token — sie beschreiben nur die Struktur, die
 * DivvyDiary liefert.
 */

function feed(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Beispiel//Dividendenkalender//DE",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

const GANZTAGS = [
  "BEGIN:VEVENT",
  "UID:pay-apple-2026-08-13",
  "DTSTAMP:20260801T060000Z",
  "DTSTART;VALUE=DATE:20260813",
  "DTEND;VALUE=DATE:20260814",
  "SUMMARY:Apple Inc.",
  "END:VEVENT",
].join("\r\n");

describe("parseIcalCalendar — gueltige Feeds", () => {
  it("liest ein einzelnes ganztaegiges Ereignis am richtigen Kalendertag", () => {
    const { events, skipped } = parseIcalCalendar(feed(GANZTAGS));

    expect(skipped).toBe(0);
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.externalUid).toBe("pay-apple-2026-08-13");
    expect(event.title).toBe("Apple Inc.");
    expect(event.eventDate).toBe("2026-08-13");
    expect(event.isAllDay).toBe(true);
    expect(event.startsAt).toBeNull();
    expect(event.endsAt).toBeNull();
    // DTEND ist bei ganztaegigen Terminen exklusiv: ein Tag, kein Zeitraum.
    expect(event.endDate).toBeNull();
    expect(event.eventType).toBe("payment");
    expect(event.eventState).toBe("active");
  });

  it("liest mehrere Ereignisse in der Reihenfolge des Feeds", () => {
    const zweites = [
      "BEGIN:VEVENT",
      "UID:pay-allianz-2026-05-08",
      "DTSTART;VALUE=DATE:20260508",
      "SUMMARY:Allianz SE",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(GANZTAGS, zweites));

    expect(events.map((event) => event.externalUid)).toEqual([
      "pay-apple-2026-08-13",
      "pay-allianz-2026-05-08",
    ]);
  });

  it("uebernimmt mehrtaegige ganztaegige Termine mit inklusivem Enddatum", () => {
    const mehrtaegig = [
      "BEGIN:VEVENT",
      "UID:pay-mehrtaegig",
      "DTSTART;VALUE=DATE:20260813",
      "DTEND;VALUE=DATE:20260816",
      "SUMMARY:Sammelzahlung",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(mehrtaegig));

    expect(events[0].eventDate).toBe("2026-08-13");
    expect(events[0].endDate).toBe("2026-08-15");
  });

  it("liest optionale Felder, wenn sie vorhanden sind", () => {
    const vollstaendig = [
      "BEGIN:VEVENT",
      "UID:pay-voll",
      "DTSTART;VALUE=DATE:20260813",
      "SUMMARY:Coca-Cola Co.",
      "DESCRIPTION:Quartalsdividende 0\\,46 USD je Aktie",
      "LOCATION:Depot A",
      "URL:https://example.test/dividende/1",
      "CATEGORIES:Dividende,Zahltag",
      "SEQUENCE:3",
      "CREATED:20260701T080000Z",
      "LAST-MODIFIED:20260728T090000Z",
      "RRULE:FREQ=YEARLY;COUNT=4",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(vollstaendig));
    const event = events[0];

    expect(event.description).toBe("Quartalsdividende 0,46 USD je Aktie");
    expect(event.location).toBe("Depot A");
    expect(event.externalUrl).toBe("https://example.test/dividende/1");
    expect(event.categories).toEqual(["Dividende", "Zahltag"]);
    expect(event.sequenceNumber).toBe(3);
    expect(event.sourceCreatedAt).toBe("2026-07-01T08:00:00.000Z");
    expect(event.sourceUpdatedAt).toBe("2026-07-28T09:00:00.000Z");
    expect(event.recurrenceRule).toContain("FREQ=YEARLY");
    expect(event.rawData["summary"]).toBe("Coca-Cola Co.");
  });

  it("toleriert fehlende optionale Felder", () => {
    const minimal = [
      "BEGIN:VEVENT",
      "UID:pay-minimal",
      "DTSTART;VALUE=DATE:20260813",
      "END:VEVENT",
    ].join("\r\n");

    const { events, skipped } = parseIcalCalendar(feed(minimal));

    expect(skipped).toBe(0);
    expect(events[0].title).toBeNull();
    expect(events[0].description).toBeNull();
    expect(events[0].categories).toBeNull();
    expect(events[0].sequenceNumber).toBeNull();
    expect(events[0].eventDate).toBe("2026-08-13");
  });

  it("setzt gefaltete Zeilen wieder zusammen", () => {
    const gefaltet = [
      "BEGIN:VEVENT",
      "UID:pay-gefaltet",
      "DTSTART;VALUE=DATE:20260813",
      "SUMMARY:Ein sehr langer Unternehmensname mit Fortsetzung in der",
      "  naechsten Zeile",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(gefaltet));

    expect(events[0].title).toBe(
      "Ein sehr langer Unternehmensname mit Fortsetzung in der naechsten Zeile",
    );
  });
});

describe("parseIcalCalendar — Zeitzonen (Auftrag §14)", () => {
  it("rechnet einen UTC-Zeitpunkt auf den Berliner Kalendertag um", () => {
    // 23:30 UTC ist in Berlin bereits der Folgetag (Sommerzeit, UTC+2).
    const spaet = [
      "BEGIN:VEVENT",
      "UID:pay-spaet",
      "DTSTART:20260813T233000Z",
      "SUMMARY:Spaeter Termin",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(spaet));

    expect(events[0].isAllDay).toBe(false);
    expect(events[0].startsAt).toBe("2026-08-13T23:30:00.000Z");
    expect(events[0].eventDate).toBe("2026-08-14");
  });

  it("liest einen Termin mit TZID in der angegebenen Zone", () => {
    const newYork = [
      "BEGIN:VEVENT",
      "UID:pay-ny",
      "DTSTART;TZID=America/New_York:20260813T090000",
      "DTEND;TZID=America/New_York:20260813T100000",
      "SUMMARY:Boersenoeffnung",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(newYork));

    // 09:00 New York (UTC-4 im August) = 13:00 UTC = 15:00 Berlin.
    expect(events[0].startsAt).toBe("2026-08-13T13:00:00.000Z");
    expect(events[0].endsAt).toBe("2026-08-13T14:00:00.000Z");
    expect(events[0].eventDate).toBe("2026-08-13");
    expect(events[0].isAllDay).toBe(false);
  });

  it("liest einen Termin ohne Zeitzonenangabe als Berliner Zeit", () => {
    const floating = [
      "BEGIN:VEVENT",
      "UID:pay-floating",
      "DTSTART:20260813T080000",
      "SUMMARY:Ohne Zeitzone",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(floating));

    // 08:00 Berlin im Sommer = 06:00 UTC.
    expect(events[0].startsAt).toBe("2026-08-13T06:00:00.000Z");
    expect(events[0].eventDate).toBe("2026-08-13");
  });

  it("verschiebt ganztaegige Termine nicht ueber Zeitzonen", () => {
    // Der Klassiker: 01.01. als UTC-Mitternacht gelesen waere westlich von
    // Greenwich der 31.12. des Vorjahres.
    const neujahr = [
      "BEGIN:VEVENT",
      "UID:pay-neujahr",
      "DTSTART;VALUE=DATE:20260101",
      "SUMMARY:Neujahrszahlung",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(neujahr));

    expect(events[0].eventDate).toBe("2026-01-01");
  });
});

describe("parseIcalCalendar — fehlerhafte Eingaben", () => {
  it("ueberspringt ein Ereignis ohne UID", () => {
    const ohneUid = [
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260813",
      "SUMMARY:Ohne Kennung",
      "END:VEVENT",
    ].join("\r\n");

    const { events, skipped } = parseIcalCalendar(feed(ohneUid, GANZTAGS));

    expect(skipped).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].externalUid).toBe("pay-apple-2026-08-13");
  });

  it("ueberspringt ein Ereignis ohne Startdatum", () => {
    const ohneStart = [
      "BEGIN:VEVENT",
      "UID:pay-ohne-start",
      "SUMMARY:Ohne Datum",
      "END:VEVENT",
    ].join("\r\n");

    const { events, skipped } = parseIcalCalendar(feed(ohneStart, GANZTAGS));

    expect(skipped).toBe(1);
    expect(events).toHaveLength(1);
  });

  it("behaelt bei doppelter UID den spaeteren Eintrag", () => {
    const zweiteFassung = [
      "BEGIN:VEVENT",
      "UID:pay-apple-2026-08-13",
      "DTSTART;VALUE=DATE:20260814",
      "SUMMARY:Apple Inc. (verschoben)",
      "END:VEVENT",
    ].join("\r\n");

    const { events, skipped } = parseIcalCalendar(feed(GANZTAGS, zweiteFassung));

    expect(events).toHaveLength(1);
    expect(events[0].eventDate).toBe("2026-08-14");
    expect(skipped).toBe(1);
  });

  it("erkennt ein abgesagtes Ereignis", () => {
    const abgesagt = [
      "BEGIN:VEVENT",
      "UID:pay-abgesagt",
      "DTSTART;VALUE=DATE:20260813",
      "SUMMARY:Entfallene Zahlung",
      "STATUS:CANCELLED",
      "END:VEVENT",
    ].join("\r\n");

    const { events } = parseIcalCalendar(feed(abgesagt));

    expect(events[0].eventState).toBe("cancelled");
  });

  it("weist Inhalte zurueck, die kein iCalendar sind", () => {
    expect(() => parseIcalCalendar("<html><body>Fehler</body></html>")).toThrow(
      IcalParseError,
    );
    expect(() => parseIcalCalendar("")).toThrow(IcalParseError);
  });

  it("weist einen leeren, aber gueltigen Kalender nicht zurueck", () => {
    const { events, skipped } = parseIcalCalendar(feed());

    expect(events).toHaveLength(0);
    expect(skipped).toBe(0);
  });
});
