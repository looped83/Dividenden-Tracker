import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import {
  ListDateTile,
  ListGroup,
  ListItemBody,
  ListRow,
  ListSection,
} from "@/components/ui/list";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/money";
import { buildAgenda } from "@/lib/calendar/agenda";
import {
  eventTime,
  eventTitle,
  eventTypeLabel,
  spokenDate,
  weekdayShort,
} from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * Listenansicht: je Abschnitt eine Liste, je Termin eine Zeile mit Datumsfeld.
 *
 * Die frühere Fassung setzte eine Datumsüberschrift über eine Reihe reiner
 * Textzeilen — auf dem Bildschirm war das eine Textwüste, in der das Datum
 * einmal oben stand und danach mitgedacht werden musste. Jetzt trägt jede
 * Zeile ihr Datum selbst: Der Tag ist die groesste Zahl der Zeile, der Rest
 * ordnet sich darunter.
 *
 * Eine Fläche je Abschnitt statt einer Karte je Termin — dieselbe Form wie die
 * Dividendenliste (`ListSection`, `ListGroup`). Einzelne Karten kosteten je
 * Termin zwei Rahmen und eine Lücke.
 *
 * Rechts neben jeder Abschnittsueberschrift steht die erwartete Summe — wie
 * die Monatssumme in der Dividendenliste. Fehlt sie (keine Betraege, mehrere
 * Waehrungen), bleibt die Stelle leer statt eine Null zu behaupten.
 *
 * Ueberschriftenhierarchie: Die Seite traegt die h1, jeder Monat eine h2. Das Datum jeder Zeile steht vollstaendig
 * in ihrer zugaenglichen Bezeichnung.
 */
export function AgendaView({
  events,
  today,
  onSelect,
}: {
  events: readonly CalendarEvent[];
  today: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const sections = buildAgenda(events, today);

  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <ListSection
          key={section.key}
          title={section.label}
          aside={
            section.expected ? (
              <>
                {/* Vorgelesen als „September 2026 erwartet 64,00 €": Die Summe
                    ist angekündigt, nicht erhalten. */}
                <span className="sr-only">erwartet </span>
                <AmountText amount={section.expected} />
              </>
            ) : undefined
          }
        >
          <ListGroup>
            {section.days
              .flatMap((day) => day.events)
              .map((event) => (
                <li key={event.id}>
                  <EventTile event={event} onSelect={onSelect} />
                </li>
              ))}
          </ListGroup>
        </ListSection>
      ))}
    </div>
  );
}

/**
 * Terminzeile — dieselbe in der Liste wie in der Tagesspalte des Monats: Ein
 * Termin soll ueberall gleich aussehen.
 *
 * `showDate` ist die eine Ausnahme: In der Tagesspalte steht das Datum bereits
 * als Ueberschrift unmittelbar darueber. Zweimal dasselbe Datum in zwei
 * Schriftgroessen liest sich wie zwei Angaben; unter dem Namen bleibt dort nur
 * das Depot. In der Liste traegt jede Zeile ihr Datum weiterhin selbst — dort
 * gibt es keine Ueberschrift je Tag: Tag und Monat im Datumsfeld, daneben nur
 * der Wochentag. Ohne Pfeil am Rand, wie alle Listen (`ListItemBody`).
 */
export function EventTile({
  event,
  onSelect,
  showDate = true,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
  showDate?: boolean;
}) {
  const time = eventTime(event);
  const cancelled = event.eventState === "cancelled";
  const amountLabel = event.expectedAmount
    ? `, erwartet ${formatMoney(event.expectedAmount)}`
    : "";
  const meta = [showDate ? weekdayShort(event.date) : null, time, event.sourcePortfolio]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <ListRow asChild>
      <button
        type="button"
        onClick={() => {
          onSelect(event);
        }}
        aria-label={`${eventTitle(event)}, ${eventTypeLabel(event)} am ${spokenDate(event.date)}${amountLabel}${time ? `, ${time}` : ""}${cancelled ? ", abgesagt" : ""}. Details anzeigen`}
      >
        <ListItemBody
          // Abgesagt bleibt durch blasse Ziffern und den durchgestrichenen
          // Titel erkennbar.
          leading={<ListDateTile iso={event.date} muted={cancelled} />}
          title={
            <span className={cn(cancelled && "text-muted-foreground line-through")}>
              {eventTitle(event)}
            </span>
          }
          meta={
            <>
              {/* Nur der Ex-Tag traegt ein Etikett: „Zahltag" stand an praktisch
                  jedem Termin dieses Kalenders und sagte damit nichts. Der
                  Ex-Tag ist die Ausnahme und bleibt deshalb gekennzeichnet;
                  vorgelesen wird die Art weiterhin in beiden Faellen. */}
              {event.eventType === "ex_date" && (
                <Badge variant={cancelled ? "neutral" : "primary"}>
                  {eventTypeLabel(event)}
                </Badge>
              )}
              {cancelled && <Badge variant="negative">Abgesagt</Badge>}
              {meta && <span>{meta}</span>}
            </>
          }
          trailing={
            event.expectedAmount ? (
              <span
                aria-hidden
                className={cn(cancelled && "text-muted-foreground line-through")}
              >
                <AmountText amount={event.expectedAmount} />
              </span>
            ) : undefined
          }
        />
      </button>
    </ListRow>
  );
}
