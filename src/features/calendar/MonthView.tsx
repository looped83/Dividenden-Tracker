import { cn } from "@/lib/utils/cn";
import { monthNameDe } from "@/lib/statistics";
import {
  buildMonthGrid,
  groupByDate,
  WEEKDAYS_DE,
  WEEKDAYS_DE_SHORT,
} from "@/lib/calendar/month";
import {
  dayCellLabel,
  eventTime,
  eventTitle,
  eventTypeLabel,
} from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * Monatsraster (Auftrag §10).
 *
 * Als Tabelle ausgezeichnet, nicht als Gitter aus `div`-Elementen: Ein
 * Monatskalender **ist** eine Tabelle aus Wochentagsspalten und Wochenzeilen.
 * Sprachausgaben nennen damit beim Wandern durch die Zellen den Wochentag mit.
 *
 * Tage mit Terminen sind nicht allein farblich markiert (Auftrag §16): Jeder
 * Termin steht als eigene, beschriftete Schaltflaeche in der Zelle, und die
 * Zelle traegt eine vollstaendige Bezeichnung fuer Sprachausgaben.
 *
 * Bewusst ohne Kappung der Termine je Tag: Ein verstecktes „+2 weitere" waere
 * genau der abgeschnittene Inhalt, den es zu vermeiden gilt. Die Zeile waechst
 * stattdessen mit.
 */
export function MonthView({
  year,
  month,
  events,
  today,
  onSelect,
}: {
  year: number;
  month: number;
  events: readonly CalendarEvent[];
  today: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const grid = buildMonthGrid(year, month);
  const byDate = groupByDate(events);

  return (
    <table className="w-full table-fixed border-separate border-spacing-1">
      <caption className="sr-only">
        Dividendenkalender {monthNameDe(month)} {year}
      </caption>
      <thead>
        <tr>
          {WEEKDAYS_DE_SHORT.map((short, index) => (
            <th
              key={short}
              scope="col"
              className="pb-1 text-center text-xs font-medium text-muted-foreground"
            >
              <span aria-hidden>{short}</span>
              <span className="sr-only">{WEEKDAYS_DE[index]}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.weeks.map((week) => (
          <tr key={week[0].date}>
            {week.map((day) => {
              const dayEvents = byDate.get(day.date) ?? [];
              const isToday = day.date === today;
              return (
                <td
                  key={day.date}
                  className={cn(
                    "h-20 min-w-0 rounded-md border border-border/60 p-1 align-top sm:h-24",
                    day.inMonth ? "bg-card" : "bg-muted/40",
                  )}
                >
                  <span className="sr-only">
                    {dayCellLabel(day.date, dayEvents.length, isToday)}
                  </span>
                  <div aria-hidden className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs",
                        isToday && "bg-primary font-semibold text-primary-foreground",
                        !isToday && day.inMonth && "text-foreground",
                        !isToday && !day.inMonth && "text-muted-foreground",
                      )}
                    >
                      {day.dayOfMonth}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {dayEvents.map((event) => (
                      <li key={event.id}>
                        <EventChip event={event} onSelect={onSelect} />
                      </li>
                    ))}
                  </ul>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventChip({
  event,
  onSelect,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
}) {
  const time = eventTime(event);
  const cancelled = event.eventState === "cancelled";

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(event);
      }}
      aria-label={`${eventTitle(event)} — ${eventTypeLabel(event)}${time ? `, ${time}` : ""}${cancelled ? ", abgesagt" : ""}. Details anzeigen`}
      className={cn(
        "flex w-full items-center rounded px-1 py-0.5 text-left text-xs leading-tight outline-none",
        // Auf Touchgeraeten (iPad) waechst der Eintrag auf die Mindest-
        // Zielgroesse; mit Maus bleibt die dichtere Darstellung.
        "pointer-coarse:min-h-11",
        "focus-visible:ring-2 focus-visible:ring-ring",
        cancelled
          ? "bg-muted text-muted-foreground line-through"
          : "bg-primary/10 text-primary hover:bg-primary/20",
      )}
    >
      <span className="truncate">{eventTitle(event)}</span>
    </button>
  );
}
