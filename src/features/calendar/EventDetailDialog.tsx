import type { ReactNode, RefObject } from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import { eventTime, eventTitle, eventTypeLabel, longDate } from "@/lib/calendar/format";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * Detailansicht eines angekuendigten Termins.
 *
 * Zeigt ausschliesslich, was tatsaechlich im Feed steht (Auftrag §11): kein
 * geschaetzter Betrag, keine abgeleitete Waehrung, keine Aussage darueber, ob
 * die Zahlung eingegangen ist. Fehlende Felder entfallen ersatzlos, statt mit
 * einem Platzhalter zu suggerieren, es gaebe sie.
 *
 * Fokusfalle und Escape uebernimmt der Dialog des Designsystems (Radix); die
 * Rueckgabe des Fokus regelt `returnFocusTo` (siehe unten).
 */
export function EventDetailDialog({
  event,
  returnFocusTo,
  onClose,
}: {
  event: CalendarEvent | null;
  /** Element, das den Dialog geoeffnet hat — dorthin kehrt der Fokus zurueck. */
  returnFocusTo: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const time = event ? eventTime(event) : null;

  return (
    <Dialog
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-sm sm:max-w-md"
        // Der Dialog wird nicht von einem `DialogTrigger` geoeffnet, sondern
        // von einem Termin im Raster oder in der Liste. Ohne Trigger gibt Radix
        // den Fokus an den Seitenkoerper zurueck — wer den Dialog per Tastatur
        // geoeffnet hat, stuende danach wieder ganz am Anfang der Seite.
        onCloseAutoFocus={(nativeEvent) => {
          nativeEvent.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        {event && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{eventTitle(event)}</DialogTitle>
              <DialogDescription>
                Angekündigter {eventTypeLabel(event)} am {formatCalendarDate(event.date)}
              </DialogDescription>
            </DialogHeader>

            {/* Kein Etikett fuer die Terminart: Die Zeile darueber nennt sie
                bereits im Satz („Angekündigter Zahltag am 13.08.2026"). */}
            <div className="flex flex-wrap items-center gap-2 empty:hidden">
              {event.eventState === "cancelled" && (
                <Badge variant="negative">Abgesagt</Badge>
              )}
              {event.categories.map((category) => (
                <Badge key={category}>{category}</Badge>
              ))}
            </div>

            <dl className="grid gap-3 text-sm">
              {event.expectedAmount && (
                <Detail term="Erwarteter Betrag">
                  <AmountText
                    amount={event.expectedAmount}
                    className="text-base font-semibold"
                  />
                </Detail>
              )}
              <Detail term="Datum">
                {longDate(event.date)}
                {event.endDate && ` bis ${longDate(event.endDate)}`}
              </Detail>
              {time && <Detail term="Uhrzeit">{time}</Detail>}
              {event.sourcePortfolio && (
                <Detail term="Depot laut Quelle">{event.sourcePortfolio}</Detail>
              )}
              {event.location && <Detail term="Ort">{event.location}</Detail>}
              {event.description && (
                <Detail term="Beschreibung">
                  <span className="whitespace-pre-line">{event.description}</span>
                </Detail>
              )}
              {event.externalUrl && (
                <Detail term="Details">
                  <a
                    href={event.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Bei der Quelle öffnen
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                </Detail>
              )}
            </dl>

            <p className="text-xs text-muted-foreground">
              Angekündigter Termin der Kalenderquelle — der Betrag ist eine Ankündigung,
              keine erhaltene Zahlung. Ob sie eingegangen ist, steht unter „Dividenden“.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {term}
      </dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}
