import { Link } from "react-router";
import { AmountText } from "@/components/money/AmountText";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import {
  historicalSummary,
  monthOf,
  yearOf,
  type AnalyticsPayment,
  type YearSelection,
} from "@/lib/statistics";
import { formatMonthYear } from "./format";

interface HistoricalOverviewProps {
  payments: AnalyticsPayment[];
  selection: YearSelection;
}

/**
 * §12 Historische Gesamtsumme: eine Zeile mit der Summe der gesamten aktiven
 * Historie, unabhaengig von der Jahresauswahl; antippen oeffnet die Statistik.
 *
 * Zuvor stand hier eine Karte mit sechs Eckdaten. Fast alle standen schon
 * anderswo: der letzte Eingang direkt darueber in „Letzte Eingänge", Zahlungen
 * und Unternehmen in den Kennzahlen, Summe und Zeitraum in der Statistik. Was
 * nur hier stand, ist die Summe seit Beginn, solange ein einzelnes Jahr gewaehlt
 * ist — genau das zeigt die Zeile. Sie sieht aus wie die Eingaenge darueber.
 *
 * Bei „Alle Jahre" entfaellt sie: Die Kennzahlen oben nennen dann dieselbe
 * Summe und dieselbe Zahl der Zahlungen.
 */
export function HistoricalOverview({ payments, selection }: HistoricalOverviewProps) {
  if (selection === "all") return null;

  const summary = historicalSummary(payments);
  const first = summary.firstPayDate;
  if (first === null) return null;

  return (
    <ListGroup aria-label="Historische Gesamtsumme">
      <li>
        <ListRow asChild>
          <Link to="/statistiken">
            <ListItemBody
              title={`Gesamt seit ${formatMonthYear(yearOf(first), monthOf(first))}`}
              meta={formatCountNoun(summary.count, "Zahlung", "Zahlungen")}
              trailing={<AmountText amount={summary.net} />}
              chevron
            />
          </Link>
        </ListRow>
      </li>
    </ListGroup>
  );
}
