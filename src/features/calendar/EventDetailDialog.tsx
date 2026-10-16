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
import { Button } from "@/components/ui/button";
import { eventTime, eventTitle, eventTypeLabel, longDate } from "@/lib/calendar/format";
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
  return (
    <Dialog
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-md"
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
            {/* Termin in einer Zeile unter dem Namen: Art, Datum, Uhrzeit.
                Zuvor stand das Datum zweimal — im Satz unter dem Titel und als
                eigene Zeile „Datum". */}
            <DialogHeader>
              <DialogTitle className="pr-8">{eventTitle(event)}</DialogTitle>
              <DialogDescription>
                {[
                  eventTypeLabel(event),
                  event.endDate
                    ? `${longDate(event.date)} bis ${longDate(event.endDate)}`
                    : longDate(event.date),
                  eventTime(event),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2 empty:hidden">
              {event.eventState === "cancelled" && (
                <Badge variant="negative">Abgesagt</Badge>
              )}
              {event.categories.map((category) => (
                <Badge key={category}>{category}</Badge>
              ))}
            </div>

            {/* Der Betrag ist die Hauptsache des Termins und steht gross —
                „erwartet" sagt, dass er angekuendigt und nicht eingegangen ist. */}
            {event.expectedAmount && (
              <div>
                <p className="text-sm text-muted-foreground">Erwarteter Betrag</p>
                <AmountText
                  amount={event.expectedAmount}
                  className="text-3xl font-semibold tracking-tight"
                />
              </div>
            )}

            {/* Nur, was der Feed zusaetzlich nennt. Die Schreibweise des
                Assets in der Quelle entfaellt: Sie wiederholte den Titel. */}
            <dl className="divide-y divide-border text-sm empty:hidden">
              {event.sourcePortfolio && (
                <Detail term="Depot">{event.sourcePortfolio}</Detail>
              )}
              {event.location && <Detail term="Ort">{event.location}</Detail>}
            </dl>

            {event.description && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {event.description}
              </p>
            )}

            {event.externalUrl && (
              <Button variant="outline" className="w-full" asChild>
                <a href={event.externalUrl} target="_blank" rel="noreferrer noopener">
                  {sourceLinkLabel(event.externalUrl)}
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words text-right text-foreground">{children}</dd>
    </div>
  );
}

/** „DivvyDiary öffnen", wenn der Link dorthin führt — sonst neutral. */
function sourceLinkLabel(url: string): string {
  try {
    if (new URL(url).hostname.endsWith("divvydiary.com")) return "DivvyDiary öffnen";
  } catch {
    // Kein gueltiger Link: neutral beschriften.
  }
  return "Bei der Quelle öffnen";
}
