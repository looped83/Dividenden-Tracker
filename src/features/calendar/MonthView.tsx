import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { monthNameDe } from "@/lib/statistics";
import {
  buildMonthGrid,
  groupByDate,
  WEEKDAYS_DE,
  WEEKDAYS_DE_SHORT,
} from "@/lib/calendar/month";
import { dayCellLabel, longDate } from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";
import { EventTile } from "./AgendaView";

/**
 * Monatsraster (Auftrag §10).
 *
 * Als Tabelle ausgezeichnet, nicht als Gitter aus `div`-Elementen: Ein
 * Monatskalender **ist** eine Tabelle aus Wochentagsspalten und Wochenzeilen.
 * Sprachausgaben nennen damit beim Wandern durch die Zellen den Wochentag mit.
 *
 * **Eine Logik fuer alle Breiten: Raster plus Tagesspalte.** Sieben Spalten
 * teilen sich die Seitenbreite — auf dem Telefon sind das 46px, auf dem
 * Schreibtisch rund 110px. In beiden blieb von „Johnson & Johnson" ein
 * abgeschnittener Wortanfang; die frueher ab `lg` in die Zelle geschriebenen
 * Namen waren dort ebenso wenig lesbar wie darunter. Die Zelle traegt deshalb
 * ueberall nur **Punkte** (einen je Termin), und die Termine des gewaehlten
 * Tages stehen als volle Kacheln daneben — dieselben Kacheln wie in der Liste.
 *
 * Wo diese Kacheln stehen, entscheidet allein der Platz und damit CSS: bis `xl`
 * unter dem Raster, darueber in einer eigenen Spalte rechts daneben — erst dort
 * bleiben neben einer 20rem breiten Tagesspalte noch sieben lesbare
 * Rasterspalten uebrig. Beides ist derselbe Baum: kein zweiter Satz Termine im
 * Dokument, keine Media Query in JavaScript.
 *
 * Tage mit Terminen sind nie allein farblich markiert (Auftrag §16): Die Zelle
 * traegt eine vollstaendige Bezeichnung fuer Sprachausgaben, ihre Termine
 * stehen beschriftet in der Tagesspalte.
 *
 * Bewusst ohne Kappung der Termine je Tag: Ein verstecktes „+2 weitere" waere
 * genau der abgeschnittene Inhalt, den es zu vermeiden gilt.
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

  // Der ausgewaehlte Tag gehoert zum angezeigten Monat. Beim Blaettern faellt
  // die Wahl auf den ersten Tag mit Terminen (heute, wenn er dazugehoert) —
  // sonst stuende neben dem Raster ein leerer Kasten und die Ansicht muesste
  // erst durch einen Klick nuetzlich werden.
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
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6">
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
                return (
                  <td
                    key={day.date}
                    className={cn(
                      "h-16 min-w-0 rounded-md border border-border/60 p-1 align-top lg:h-20",
                      day.inMonth ? "bg-card" : "bg-muted/40",
                    )}
                  >
                    <DayButton
                      label={dayCellLabel(day.date, dayEvents.length, day.date === today)}
                      day={day.dayOfMonth}
                      today={day.date === today}
                      dim={!day.inMonth}
                      events={dayEvents}
                      selected={day.date === selected}
                      onSelect={() => {
                        setSelected(day.date);
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Die Termine des gewaehlten Tages: bis `xl` unter dem Raster, darueber
          rechts daneben. */}
      <section
        className="space-y-2"
        aria-label={
          selected === null ? "Termine des Monats" : `Termine am ${longDate(selected)}`
        }
      >
        {selected === null ? (
          <p className="text-sm text-muted-foreground">
            In diesem Monat ist kein Zahltag angekündigt.
          </p>
        ) : (
          <>
            <h3 className="text-base font-semibold tracking-tight">
              {longDate(selected)}
            </h3>
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
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Ein Tag als Schaltflaeche: Tageszahl und ein Punkt je Termin. Die ganze Zelle
 * ist die Zielflaeche — bei 46px Spaltenbreite waere ein Punkt allein kein Ziel,
 * das sich zuverlaessig treffen laesst (WCAG 2.5.5).
 *
 * Tage ohne Termine sind keine Schaltflaeche: Sie haetten nichts zu zeigen, und
 * sechs Wochen leerer Tabstopps stuenden vor jedem Tag, der etwas traegt.
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
        "transition-colors hover:bg-accent/60",
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
