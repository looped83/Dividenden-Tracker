import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { buildAgenda } from "@/lib/calendar/agenda";
import { eventTime, eventTitle, eventTypeLabel, longDate } from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * Listenansicht (Auftrag §10). Auf dem Telefon die Standardansicht: Termine
 * stehen chronologisch untereinander, nach Tag gruppiert, mit Zielflaechen ueber
 * die volle Breite.
 *
 * Ueberschriftenhierarchie: Die Seite traegt die h1, jeder Abschnitt („Heute",
 * „Diese Woche", „Später") eine h2, jeder Tag eine h3 — so laesst sich die
 * Liste mit einer Sprachausgabe ueberspringen statt durchhoeren.
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
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {section.label}
          </h2>
          {section.days.map((day) => (
            <div key={day.date} className="space-y-1.5">
              <h3 className="text-sm font-medium text-foreground">
                {longDate(day.date)}
              </h3>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {day.events.map((event) => (
                  <li key={event.id}>
                    <AgendaRow event={event} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function AgendaRow({
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
        "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left outline-none",
        "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            cancelled && "text-muted-foreground line-through",
          )}
        >
          {eventTitle(event)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="primary">{eventTypeLabel(event)}</Badge>
          {cancelled && <Badge variant="negative">Abgesagt</Badge>}
          {time && <span className="text-xs text-muted-foreground">{time}</span>}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
