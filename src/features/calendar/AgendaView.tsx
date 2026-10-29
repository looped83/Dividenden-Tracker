import * as React from "react";
import { AmountText } from "@/components/money/AmountText";
import { ReinvestMark } from "@/components/domain/ReinvestMark";
import { Badge } from "@/components/ui/badge";
import { ListDateTile, ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { CollapsibleMonth, MonthSections } from "@/components/ui/month-section";
import { useOpenMonths } from "@/lib/hooks/useOpenMonths";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/money";
import { buildAgenda } from "@/lib/calendar/agenda";
import {
  eventTime,
  eventTitle,
  eventTypeLabel,
  isReinvested,
  spokenDate,
  weekdayShort,
} from "@/lib/calendar/format";
import type { CalendarEvent, CalendarEventType } from "@/lib/calendar/types";

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
 * Die Monate klappen ein wie dort (seit 2.9.0, `useOpenMonths`): Offen ist der
 * aktuelle Monat, sonst der erste mit Terminen.
 *
 * Ueberschriftenhierarchie: Die Seite traegt die h1, jeder Monat eine h2. Das Datum jeder Zeile steht vollstaendig
 * in ihrer zugaenglichen Bezeichnung.
 */
export function AgendaView({
  events,
  type,
  today,
  onSelect,
}: {
  events: readonly CalendarEvent[];
  type: CalendarEventType;
  today: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  // Nur bei neuen Terminen neu gegliedert, nicht bei jedem Auf- und Zuklappen.
  const sections = React.useMemo(
    () => buildAgenda(events, today, type),
    [events, today, type],
  );
  const { isOpen, toggle } = useOpenMonths(
    sections.map((section) => section.key),
    today.slice(0, 7),
  );

  return (
    <MonthSections>
      {sections.map((section) => (
        <CollapsibleMonth
          key={section.key}
          id={`monat-${section.key}`}
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
          open={isOpen(section.key)}
          onToggle={() => {
            toggle(section.key);
          }}
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
        </CollapsibleMonth>
      ))}
    </MonthSections>
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
  const reinvested = !cancelled && isReinvested(event);
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
        aria-label={`${eventTitle(event)}, ${eventTypeLabel(event)} am ${spokenDate(event.date)}${amountLabel}${time ? `, ${time}` : ""}${cancelled ? ", abgesagt" : ""}${reinvested ? ", wird reinvestiert" : ""}. Details anzeigen`}
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
          titleAside={reinvested ? <ReinvestMark /> : undefined}
          meta={
            <>
              {/* Ohne Etikett der Ereignisart: Zahltage und Ex-Tage stehen in
                  getrennten Kalendern, die Art steht im Umschalter darueber.
                  Vorgelesen wird sie weiterhin. */}
              {cancelled && <Badge variant="negative">Abgesagt</Badge>}
              {meta && <span>{meta}</span>}
            </>
          }
          // Ohne Betrag (der Ex-Tag-Feed nennt keinen) bleibt die Stelle
          // leer, aber so hoch wie ein Betrag: Sonst waeren Zeilen ohne Betrag
          // 4px niedriger, und die Linien sprangen beim Wechsel der Kalender.
          trailing={
            event.expectedAmount ? (
              <span
                aria-hidden
                className={cn(cancelled && "text-muted-foreground line-through")}
              >
                <AmountText amount={event.expectedAmount} />
              </span>
            ) : (
              <span aria-hidden className="invisible">
                0
              </span>
            )
          }
        />
      </button>
    </ListRow>
  );
}
