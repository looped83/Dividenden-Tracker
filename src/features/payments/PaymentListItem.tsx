import type * as React from "react";
import { Link } from "react-router";
import { DateText } from "@/components/DateText";
import { AmountText } from "@/components/money/AmountText";
import { Badge } from "@/components/ui/badge";
import { ListItemBody, ListRow } from "@/components/ui/list";
import type { Money } from "@/lib/money";

/**
 * Ein Dividendeneingang als Listenzeile — **eine** Form fuer Dividendenliste,
 * Uebersicht und Assetseite. Zuvor sah dieselbe Zahlung an drei Stellen
 * verschieden aus: als Karte ohne Depot, als Zeile mit Depot, mit dem Datum als
 * Titel.
 *
 * Zeile 1 traegt den Namen, Zeile 2 Datum und Depot links, den Betrag rechts.
 * Die ganze Zeile fuehrt zur Detailseite; dort stehen Bearbeiten, Stornieren
 * und Loeschen.
 *
 * Das Depot steht immer mit: Wer nach Depot filtert oder nur eines fuehrt,
 * liest es mit, ohne dass es stoert — wer mehrere fuehrt, braucht es.
 *
 * Auf der Assetseite waere der Name in jeder Zeile derselbe wie in der
 * Ueberschrift; dort ist das Datum der Titel und `date` entfaellt.
 */
export function PaymentListItem({
  to,
  state,
  title,
  date,
  depot,
  amount,
  cancelled = false,
  badge,
  indicator,
}: {
  to: string;
  state?: unknown;
  title: React.ReactNode;
  /** Bereits formatiertes Datum (`formatCalendarDate`) — entfaellt, wenn es der Titel ist. */
  date?: React.ReactNode;
  depot?: string | null | undefined;
  amount: Money;
  cancelled?: boolean;
  /** Zusaetzliches Abzeichen am Titel (etwa „Archiviert"). */
  badge?: React.ReactNode;
  /** Vorjahresvergleich links vom Betrag (`YearOverYearIndicator`). */
  indicator?: React.ReactNode;
}) {
  return (
    <li>
      <ListRow asChild>
        <Link to={to} state={state}>
          <ListItemBody
            title={
              <>
                {title}
                {badge}
                {cancelled && (
                  <Badge variant="warning" className="ml-2 align-middle">
                    Storniert
                  </Badge>
                )}
              </>
            }
            // Datum und Depot bleiben eine Zeile: Reicht die Breite neben dem
            // Betrag nicht, wird das Depot gekuerzt — die Zeile wird nicht
            // hoeher als ihre Nachbarn.
            meta={
              <span className="flex min-w-0 items-center">
                {date !== undefined && <DateText className="shrink-0">{date}</DateText>}
                {depot && (
                  <span className="truncate">
                    {date !== undefined && "\u00A0· "}
                    {depot}
                  </span>
                )}
              </span>
            }
            trailing={
              <span className="flex items-center gap-1.5">
                {indicator}
                <AmountText amount={amount} />
              </span>
            }
            chevron
          />
        </Link>
      </ListRow>
    </li>
  );
}
