import * as React from "react";
import { Link } from "react-router";
import { Section, SectionLink } from "@/components/ui/section";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { AmountText } from "@/components/money/AmountText";
import { formatMoney } from "@/lib/money";
import { buildCalendarSummary, daysBetween } from "@/lib/calendar/summary";
import { dateTile, eventTitle, relativeDayLabel } from "@/lib/calendar/format";
import { useResolvedCalendarEvents } from "@/features/calendar/resolvedEvents";

/** Drei Termine: genug für „was kommt als Nächstes", ohne den Kalender zu ersetzen. */
const SHOWN = 3;

/**
 * „Demnächst" auf der Übersicht: die nächsten angekündigten Zahltage aus dem
 * Dividendenkalender und die erwartete Summe der nächsten 30 Tage.
 *
 * Die Übersicht zeigte nur Vergangenes; was in den nächsten Tagen kommt, stand
 * allein im Kalender hinter „Mehr". Für eine Dividendenstrategie ist genau das
 * eine der häufigsten Fragen.
 *
 * Die Beträge sind die **angekündigten** der Kalenderquelle, keine Eingänge
 * (PRODUCT_SPEC.md Grundsatz 8) — deshalb „erwartet" in der Beschriftung und
 * keine Verrechnung mit den Kennzahlen darüber. Ohne kommende Zahltage
 * (oder solange der Kalender lädt) entfällt die Karte ganz: Ein leerer Kasten
 * wäre kein Inhalt.
 */
export function UpcomingPayments({ today }: { today: string }) {
  const { events } = useResolvedCalendarEvents();

  const { next, next30Days } = React.useMemo(() => {
    const upcoming = events
      .filter(
        (event) =>
          event.date >= today &&
          event.eventState !== "cancelled" &&
          event.eventType === "payment",
      )
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return {
      next: upcoming.slice(0, SHOWN),
      next30Days: buildCalendarSummary(events, today).next30Days,
    };
  }, [events, today]);

  if (next.length === 0) return null;

  return (
    <Section
      title="Demnächst"
      description={
        next30Days.total ? (
          <>
            <AmountText amount={next30Days.total} /> erwartet in 30 Tagen
          </>
        ) : undefined
      }
      // Der Weg zum ganzen Bereich als Textlink in Primärblau — wie „Alle"
      // bei den Eingängen. Ein Symbol allein musste man deuten.
      action={<SectionLink to="/kalender">Kalender</SectionLink>}
    >
      <ListGroup inset aria-label="Nächste angekündigte Zahltage">
        {next.map((event) => {
          const { day, month } = dateTile(event.date);
          const when = relativeDayLabel(daysBetween(today, event.date));
          const amount = event.expectedAmount;
          return (
            <li key={event.id}>
              <ListRow asChild>
                <Link
                  to="/kalender"
                  aria-label={`${eventTitle(event)}, ${when}${amount ? `, erwartet ${formatMoney(amount)}` : ""}`}
                >
                  <ListItemBody
                    // Dasselbe Datumsfeld wie im Kalender, eine Stufe kleiner.
                    leading={
                      <span
                        aria-hidden
                        className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-muted"
                      >
                        <span className="text-base font-semibold leading-none tabular-amount">
                          {day}
                        </span>
                        <span className="mt-0.5 text-[0.625rem] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
                          {month}
                        </span>
                      </span>
                    }
                    title={eventTitle(event)}
                    meta={<span>{when}</span>}
                    trailing={amount ? <AmountText amount={amount} /> : undefined}
                  />
                </Link>
              </ListRow>
            </li>
          );
        })}
      </ListGroup>
    </Section>
  );
}
