import * as React from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { KpiHero } from "@/components/domain/KpiHero";
import { AmountText } from "@/components/money/AmountText";
import { ListGroup, ListItemBody, ListRow, ListTile } from "@/components/ui/list";
import { Section } from "@/components/ui/section";
import { EUR, Money, formatMoney, formatMoneyWhole } from "@/lib/money";
import { monthNameDe, monthNameDeShort } from "@/lib/statistics/dates";
import { cn } from "@/lib/utils/cn";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { useBackState } from "@/lib/hooks/useBackState";
import { useOpenKeys } from "@/lib/hooks/useOpenKeys";
import { ForecastGate } from "@/features/securities/ForecastGate";
import {
  monthGaps,
  type MonthGap,
  type TwelveMonthForecast,
} from "@/features/securities/forecast";
import {
  DEFAULT_FORECAST_SETTINGS,
  useForecastSettings,
} from "@/features/securities/forecastSettings";
import { rhythm } from "./format";
import { POSITION_CAP_DEFAULT, usePositionCaps } from "./positionCaps";

/**
 * Planer › **Optimierungen** (bis 2.26 „Monatslücken", die Adresse blieb):
 * Monate unter dem Ø der Prognose, je mit den Zukäufen gehaltener Positionen,
 * die die Lücke schließen
 * (CALCULATION_RULES.md §14.3). Zog mit 2.20.0 aus Bestand › Prognose hierher.
 * Jedes Asset führt zu seiner Seite; „Im Nachkauf rechnen" öffnet den
 * Nachkauf mit dem Schwerpunkt „Monate glätten".
 */
export function GapsTab() {
  const settings = useForecastSettings().data ?? DEFAULT_FORECAST_SETTINGS;
  const caps = usePositionCaps().data;
  return (
    <ForecastGate emptyDescription="Die Optimierungen zeigen, welche Monate unter deinem Ø liegen und welche Assets aus deinem Bestand sie auffüllen. Dafür brauchen sie einen Depotstand aus dem DivvyDiary-Portfolio-Export.">
      {({ forecast }) => (
        <MonthGaps
          forecast={forecast}
          excluded={settings.excluded}
          capPercent={POSITION_CAP_DEFAULT}
          caps={caps}
        />
      )}
    </ForecastGate>
  );
}

function MonthGaps({
  forecast,
  excluded,
  capPercent,
  caps,
}: {
  forecast: TwelveMonthForecast;
  excluded: readonly string[];
  capPercent: number;
  caps: ReadonlyMap<string, number> | undefined;
}) {
  const { average, gaps } = React.useMemo(
    () => monthGaps(forecast, new Set(excluded), capPercent, caps),
    [forecast, excluded, capPercent, caps],
  );
  const missing = gaps.reduce((sum, gap) => sum.add(gap.gap), Money.zero(EUR));
  return (
    <div className="space-y-10 lg:space-y-12">
      <KpiHero
        label="Ø im Monat · netto"
        value={<AmountText amount={average} />}
        caption="Nächste 12 Monate, geschätzt"
        stats={[
          {
            label: "Unter Ø",
            value: formatCountNoun(gaps.length, "Monat", "Monate"),
            caption: "von 12",
          },
          {
            label: "Lücken",
            value: formatMoneyWhole(missing),
            caption: "zusammen",
          },
        ]}
      />
      <Section title="Monate unter Ø">
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Kein Monat liegt unter deinem Ø.
          </p>
        ) : (
          <ListGroup>
            {gaps.map((gap) => (
              <li key={`${String(gap.year)}-${String(gap.month)}`}>
                <GapRow gap={gap} />
              </li>
            ))}
          </ListGroup>
        )}
      </Section>
    </div>
  );
}

/**
 * Eine Lücke als ruhige, einzeilige Zeile: Monat, Fehlbetrag, erwartete Summe.
 * Die Assets aus dem Bestand, die sie schließen (bis zu drei, kleinster Zukauf
 * zuerst), klappen erst auf Klick auf (seit 2.17.0). Zuvor stand der beste
 * Füller mit zwei Zeilen in jeder Lücke und darunter ein eigener Knopf für
 * die übrigen — die Liste las sich unruhig.
 */
function GapRow({ gap }: { gap: MonthGap }) {
  const fillersId = `luecke-${String(gap.year)}-${String(gap.month)}`;
  const openKeys = useOpenKeys("luecke");
  const open = openKeys.isOpen(fillersId);
  const backState = useBackState();
  const count = gap.fillers.length;
  const body = (
    <>
      <ListTile primary={monthNameDeShort(gap.month)} secondary={String(gap.year)} />
      <ListItemBody
        title={
          <>
            <span className="sr-only">
              {monthNameDe(gap.month)} {gap.year}:{" "}
            </span>
            {formatMoneyWhole(gap.gap)} unter Ø
          </>
        }
        meta={
          count > 0
            ? formatCountNoun(count, "Asset zum Auffüllen", "Assets zum Auffüllen")
            : "Kein passendes Asset mit Zielgewichtung"
        }
        trailing={
          <>
            {formatMoneyWhole(gap.total)}
            <span className="sr-only"> erwartet</span>
          </>
        }
      />
    </>
  );
  if (count === 0) return <ListRow>{body}</ListRow>;
  return (
    <>
      <ListRow asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? fillersId : undefined}
          onClick={() => {
            openKeys.toggle(fillersId);
          }}
        >
          {body}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </ListRow>
      {open && (
        // Eingerückt auf die Textspalte der Zeile: Kachel (44px) + Abstand.
        <ul id={fillersId} className="reveal space-y-0.5 pb-2 pl-[4.25rem] pr-3">
          {gap.fillers.map((filler) => (
            <li key={filler.securityId}>
              <Link
                to={`/depot/${filler.securityId}`}
                state={backState}
                className="-mx-3 flex flex-col gap-0.5 rounded-xl px-3 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
              >
                <span className="truncate-fade">
                  <span className="font-medium text-foreground">{filler.name}</span> ·{" "}
                  {rhythm(filler.payouts)}
                </span>
                <span className="tabular-amount">
                  +{formatMoney(filler.perThousand)} je 1.000 € ·{" "}
                  {filler.partial
                    ? `${formatMoneyWhole(filler.invest)} bis zur Zielgewichtung schließen ${formatMoneyWhole(filler.closes)}`
                    : `bis Ø ${formatMoneyWhole(filler.invest)}`}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              to={`/planer?fokus=monate&betrag=${gap.fillers[0].invest.toDecimal().toFixed(0)}`}
              className="-mx-3 inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-foreground underline underline-offset-4 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              Im Nachkauf rechnen
            </Link>
          </li>
        </ul>
      )}
    </>
  );
}
