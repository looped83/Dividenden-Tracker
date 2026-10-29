import type * as React from "react";
import { Link } from "react-router";
import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import { ListDateTile, ListItemBody, ListRow } from "@/components/ui/list";
import { weekdayShort } from "@/lib/calendar/format";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import type { Money } from "@/lib/money";

/**
 * Ein Dividendeneingang als Listenzeile — **eine** Form fuer Dividendenliste,
 * Uebersicht und Assetseite.
 *
 * Seit 1.11.0 wie ein Termin im Kalender: links das Datumsfeld (Tag und
 * Monat), Zeile 1 der Name, Zeile 2 Wochentag bzw. Jahr und Depot links, der
 * Betrag rechts. Ein Eingang und ein angekuendigter Termin sehen damit gleich
 * aus; zuvor stand das Datum als „11.10." klein in der zweiten Zeile.
 *
 * Neben dem Datumsfeld steht der Wochentag, wenn das Jahr anderswo steht
 * (Monatsueberschrift, juengste Eingaenge), sonst das Jahr (`showYear`) — das
 * Feld selbst nennt nur Tag und Monat. Das vollstaendige Datum hoeren
 * Sprachausgaben in jedem Fall.
 *
 * Die ganze Zeile fuehrt zur Detailseite; dort stehen Bearbeiten, Stornieren
 * und Loeschen. Das Depot steht immer mit: Wer mehrere fuehrt, braucht es.
 */
export function PaymentListItem({
  to,
  state,
  title,
  titleAside,
  date,
  showYear = false,
  note,
  depot,
  amount,
  cancelled = false,
  badge,
  indicator,
}: {
  to: string;
  state?: unknown;
  title: React.ReactNode;
  /** Kleines Zeichen hinter dem Namen, etwa `ReinvestMark` (seit 2.53.0). */
  titleAside?: React.ReactNode;
  /** Datum des Eingangs (ISO). */
  date: string;
  /** Jahr statt Wochentag neben dem Datumsfeld, wenn es nirgends sonst steht. */
  showYear?: boolean;
  /** Zusatz zum Datum, etwa „tatsächlich 14.10.". */
  note?: string | undefined;
  depot?: string | null | undefined;
  amount: Money;
  cancelled?: boolean;
  /** Zusaetzliches Abzeichen vor dem Datum (etwa „Archiviert"). */
  badge?: React.ReactNode;
  /** Vorjahresvergleich links vom Betrag (`YearOverYearIndicator`). */
  indicator?: React.ReactNode;
}) {
  const when = [showYear ? date.slice(0, 4) : weekdayShort(date), note]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <ListRow asChild>
        <Link to={to} state={state}>
          <ListItemBody
            leading={<ListDateTile iso={date} muted={cancelled} />}
            title={title}
            titleAside={titleAside}
            // Eine Zeile: Reicht die Breite neben dem Betrag nicht, wird das
            // Depot gekuerzt — die Zeile wird nicht hoeher als ihre Nachbarn.
            // Abzeichen stehen vorn wie „Ex-Tag" im Kalender.
            meta={
              <span className="flex min-w-0 items-center">
                {cancelled && (
                  <Badge variant="warning" className="mr-2 shrink-0">
                    Storniert
                  </Badge>
                )}
                {badge}
                <span className="sr-only">{formatCalendarDate(date)}, </span>
                <span className="shrink-0">{when}</span>
                {depot && (
                  <span className="truncate">
                    <span aria-hidden>{" · "}</span>
                    {depot}
                  </span>
                )}
              </span>
            }
            trailing={
              <span className="flex items-baseline gap-1.5">
                {indicator}
                <AmountText amount={amount} />
              </span>
            }
          />
        </Link>
      </ListRow>
    </li>
  );
}
