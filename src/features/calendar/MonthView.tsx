import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { monthNameDe } from "@/lib/statistics";
import { LG_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
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
  longDate,
} from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";
import { EventTile } from "./AgendaView";

/**
 * Monatsraster (Auftrag §10).
 *
 * Als Tabelle ausgezeichnet, nicht als Gitter aus `div`-Elementen: Ein
 * Monatskalender **ist** eine Tabelle aus Wochentagsspalten und Wochenzeilen.
 * Sprachausgaben nennen damit beim Wandern durch die Zellen den Wochentag mit.
 *
 * **Zwei Darstellungen, weil sieben Spalten auf einem Telefon nur 46px breit
 * sind.** Darin blieb von „Johnson & Johnson" ein „Jo…" — sieben Spalten
 * abgeschnittener Wortanfaenge, aus denen sich nichts lesen laesst. Erst ab
 * `lg` ist eine Spalte mit rund 136px breit genug fuer einen Namen; dort
 * traegt jeder Termin ihn deshalb weiterhin in der Tageszelle,
 * darunter zeigt die Zelle nur noch **Punkte** (einen je Termin), und der
 * angetippte Tag stellt seine Termine als volle Kacheln unter das Raster —
 * dieselben Kacheln wie in der Liste. Umgeschaltet wird ueber
 * {@link useMediaQuery}, nicht ueber CSS: Beide Baeume gleichzeitig im Dokument
 * zu halten hiesse, jeden Termin zweimal auszuliefern.
 *
 * Tage mit Terminen sind nie allein farblich markiert (Auftrag §16): Die Zelle
 * traegt eine vollstaendige Bezeichnung fuer Sprachausgaben, und in der breiten
 * Darstellung steht jeder Termin als eigene, beschriftete Schaltflaeche darin.
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
  const isWide = useMediaQuery(LG_BREAKPOINT_QUERY);
  const grid = buildMonthGrid(year, month);
  const byDate = groupByDate(events);

  // Der ausgewaehlte Tag gehoert zum angezeigten Monat. Beim Blaettern faellt
  // die Wahl auf den ersten Tag mit Terminen (heute, wenn er dazugehoert) —
  // sonst stuende unter dem Raster ein leerer Kasten und die Ansicht muesste
  // erst durch einen Tipp nuetzlich werden.
  const daysWithEvents = grid.weeks
    .flat()
    .filter((day) => day.inMonth && (byDate.get(day.date)?.length ?? 0) > 0)
    .map((day) => day.date);
  // `at(0)` statt `[0]`: Der Index-Zugriff verspricht hier einen Treffer, den es
  // in einem Monat ohne Termine nicht gibt.
  const preferred = daysWithEvents.includes(today)
    ? today
    : (daysWithEvents.at(0) ?? null);

  const [selected, setSelected] = React.useState<string | null>(preferred);
  const [lastMonth, setLastMonth] = React.useState(`${String(year)}-${String(month)}`);
  const key = `${String(year)}-${String(month)}`;
  if (key !== lastMonth) {
    setLastMonth(key);
    setSelected(preferred);
  }

  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <div className="space-y-4">
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
                      "min-w-0 rounded-md border border-border/60 p-1 align-top",
                      isWide ? "h-24" : "h-16",
                      day.inMonth ? "bg-card" : "bg-muted/40",
                    )}
                  >
                    {isWide ? (
                      <>
                        <span className="sr-only">
                          {dayCellLabel(day.date, dayEvents.length, isToday)}
                        </span>
                        <DayNumber
                          day={day.dayOfMonth}
                          today={isToday}
                          dim={!day.inMonth}
                        />
                        <ul className="space-y-0.5">
                          {dayEvents.map((event) => (
                            <li key={event.id}>
                              <EventChip event={event} onSelect={onSelect} />
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <DayButton
                        label={dayCellLabel(day.date, dayEvents.length, isToday)}
                        day={day.dayOfMonth}
                        today={isToday}
                        dim={!day.inMonth}
                        events={dayEvents}
                        selected={day.date === selected}
                        onSelect={() => {
                          setSelected(day.date);
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Nur schmal: die Termine des gewaehlten Tages in voller Breite. */}
      {!isWide && selected !== null && (
        <section className="space-y-2" aria-label={`Termine am ${longDate(selected)}`}>
          <h3 className="text-base font-semibold tracking-tight">{longDate(selected)}</h3>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine angekündigten Zahltage an diesem Tag.
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((event) => (
                <li key={event.id}>
                  <EventTile event={event} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Die Tageszahl in der Ecke der Zelle — rein optisch, die Zelle ist benannt. */
function DayNumber({ day, today, dim }: { day: number; today: boolean; dim: boolean }) {
  return (
    <div aria-hidden className="mb-1 flex justify-end">
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-xs",
          today && "bg-primary font-semibold text-primary-foreground",
          !today && !dim && "text-foreground",
          !today && dim && "text-muted-foreground",
        )}
      >
        {day}
      </span>
    </div>
  );
}

/**
 * Ein Tag als Schaltflaeche (schmale Darstellung): Tageszahl und ein Punkt je
 * Termin. Die ganze Zelle ist die Zielflaeche — bei 46px Spaltenbreite waere
 * ein Punkt allein kein Ziel, das sich zuverlaessig treffen laesst (WCAG 2.5.5).
 */
function DayButton({
  label,
  day,
  today,
  dim,
  events,
  selected,
  onSelect,
}: {
  label: string;
  day: number;
  today: boolean;
  dim: boolean;
  events: readonly CalendarEvent[];
  selected: boolean;
  onSelect: () => void;
}) {
  const hasEvents = events.length > 0;

  if (!hasEvents) {
    return (
      <div className="flex h-full flex-col items-center justify-start">
        <span className="sr-only">{label}</span>
        <DayMark day={day} today={today} dim={dim} />
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex h-full w-full flex-col items-center justify-start gap-1 rounded outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-accent",
      )}
    >
      <DayMark day={day} today={today} dim={dim} />
      {/* Die Punkte sind eine Zusammenfassung, kein Inhalt: Wie viele Termine
          der Tag traegt, steht in seiner Bezeichnung. */}
      <span aria-hidden className="flex flex-wrap items-center justify-center gap-0.5">
        {events.slice(0, 3).map((event) => (
          <span
            key={event.id}
            className={cn(
              "size-1.5 rounded-full",
              event.eventState === "cancelled" ? "bg-muted-foreground/50" : "bg-primary",
            )}
          />
        ))}
        {events.length > 3 && (
          <span className="text-[0.625rem] leading-none text-muted-foreground">
            +{events.length - 3}
          </span>
        )}
      </span>
    </button>
  );
}

/** Tageszahl mit Heute-Markierung, mittig — die schmale Zelle hat keine Ecke. */
function DayMark({ day, today, dim }: { day: number; today: boolean; dim: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 items-center justify-center rounded-full text-xs",
        today && "bg-primary font-semibold text-primary-foreground",
        !today && !dim && "text-foreground",
        !today && dim && "text-muted-foreground",
      )}
    >
      {day}
    </span>
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
