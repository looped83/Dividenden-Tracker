import { ChevronRight } from "lucide-react";
import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/money";
import { buildAgenda } from "@/lib/calendar/agenda";
import {
  dateTile,
  eventTime,
  eventTitle,
  eventTypeLabel,
  shortDate,
  spokenDate,
} from "@/lib/calendar/format";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * Listenansicht: je Termin eine Kachel mit Datumsfeld.
 *
 * Die frühere Fassung setzte eine Datumsüberschrift über eine Reihe reiner
 * Textzeilen — auf dem Bildschirm war das eine Textwüste, in der das Datum
 * einmal oben stand und danach mitgedacht werden musste. Jetzt trägt jede
 * Kachel ihr Datum selbst: Der Tag ist die groesste Zahl der Kachel, der Rest
 * ordnet sich darunter. Mehrere Termine desselben Tages sind dadurch einzeln
 * lesbar, und auf breiten Bildschirmen stehen sie nebeneinander statt in einer
 * schmalen Spalte.
 *
 * Ueberschriftenhierarchie: Die Seite traegt die h1, jeder Abschnitt („Heute",
 * „Diese Woche", „Später") eine h2. Das Datum jeder Kachel steht vollstaendig
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
    <div className="space-y-6">
      {sections.map((section) => {
        const sectionEvents = section.days.flatMap((day) => day.events);
        return (
          <section key={section.key} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </h2>
            {/* Hoechstens zwei Spalten: Mit Betrag und Depot braucht eine Kachel
                Breite. Dreispaltig kuerzte sie „Verizon Communications Inc" auf
                „Verizon Commun…" und das Depot auf „Tr…" — abgeschnittene
                Namen sind schlimmer als eine Spalte weniger. */}
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {sectionEvents.map((event) => (
                <li key={event.id}>
                  <EventTile event={event} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EventTile({
  event,
  onSelect,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
}) {
  const { day, month } = dateTile(event.date);
  const time = eventTime(event);
  const cancelled = event.eventState === "cancelled";
  // „erwartet" gehoert in die Ansage: Der Betrag ist eine Ankuendigung der
  // Quelle, keine erhaltene Zahlung.
  const amountLabel = event.expectedAmount
    ? `, erwartet ${formatMoney(event.expectedAmount)}`
    : "";

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(event);
      }}
      aria-label={`${eventTitle(event)}, ${eventTypeLabel(event)} am ${spokenDate(event.date)}${amountLabel}${time ? `, ${time}` : ""}${cancelled ? ", abgesagt" : ""}. Details anzeigen`}
      className={cn(
        "flex h-full min-h-11 w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left",
        "outline-none transition-colors hover:border-primary/40 hover:bg-accent",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
      )}
    >
      {/* Das Datumsfeld ist rein dekorativ — die vollstaendige Angabe steht in
          der Bezeichnung der Schaltflaeche. Zweimal vorgelesen waere es Laerm. */}
      <span
        aria-hidden
        className={cn(
          "flex size-12 shrink-0 flex-col items-center justify-center rounded-md",
          cancelled ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <span className="text-lg font-semibold leading-none tabular-amount">{day}</span>
        <span className="mt-0.5 text-[0.625rem] font-medium uppercase leading-none">
          {month}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            cancelled && "text-muted-foreground line-through",
          )}
        >
          {eventTitle(event)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Nur der Ex-Tag traegt ein Etikett: „Zahltag" stand an praktisch
              jedem Termin dieses Kalenders und sagte damit nichts — ein
              Etikett, das immer dasselbe behauptet, ist Farbe ohne Auskunft.
              Der Ex-Tag ist die Ausnahme und bleibt deshalb gekennzeichnet;
              vorgelesen wird die Art weiterhin in beiden Faellen. */}
          {event.eventType === "ex_date" && (
            <Badge variant={cancelled ? "neutral" : "primary"}>
              {eventTypeLabel(event)}
            </Badge>
          )}
          {cancelled && <Badge variant="negative">Abgesagt</Badge>}
          <span className="truncate text-xs text-muted-foreground">
            {shortDate(event.date)}
            {time && ` · ${time}`}
            {event.sourcePortfolio && ` · ${event.sourcePortfolio}`}
          </span>
        </span>
      </span>

      {/* Der Betrag steht rechts an der Kante: In einer Spalte untereinander
          lassen sich Betraege vergleichen, mitten im Text nicht. */}
      {event.expectedAmount && (
        <span
          aria-hidden
          className={cn(
            "shrink-0 text-sm font-semibold",
            cancelled ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          <AmountText amount={event.expectedAmount} />
        </span>
      )}

      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
