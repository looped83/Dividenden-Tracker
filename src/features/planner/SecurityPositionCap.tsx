import * as React from "react";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { MoneyDecimal, formatPercent, type DecimalInstance } from "@/lib/money";
import { useSecuritySnapshots } from "@/features/securities/hooks";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import {
  DEFAULT_FORECAST_SETTINGS,
  useForecastSettings,
} from "@/features/securities/forecastSettings";
import {
  POSITION_CAP_CHOICES,
  usePositionCaps,
  useSavePositionCap,
} from "./positionCaps";

/**
 * Abschnitt „Positionsgrenze" auf der Seite eines Assets (seit 2.22.0):
 * Anteil am Depot heute und die Grenze, bis zu der der Nachkauf das Asset
 * aufstockt — der Standard des Nachkaufs oder eine eigene (CALCULATION_RULES.md
 * §16). Gespeichert wird nur eine Abweichung vom Standard.
 */
export function SecurityPositionCap({ securityId }: { securityId: string }) {
  const standard = (useForecastSettings().data ?? DEFAULT_FORECAST_SETTINGS).positionCap;
  const { data: caps, isLoading } = usePositionCaps();
  const { data: snapshots = [] } = useSecuritySnapshots();
  const save = useSavePositionCap();

  const share = React.useMemo(() => {
    let total = new MoneyDecimal(0);
    let own: DecimalInstance | null = null;
    for (const row of snapshotsAt(snapshots, latestAsOf(snapshots))) {
      if (row.market_value === null) continue;
      const value = new MoneyDecimal(row.market_value);
      total = total.plus(value);
      if (row.security_id === securityId) own = value;
    }
    return own && total.greaterThan(0) ? own.dividedBy(total).times(100) : null;
  }, [snapshots, securityId]);

  if (isLoading || caps === undefined) return null;
  const own = caps.get(securityId);
  const cap = own ?? standard;
  const over = share?.greaterThan(cap) ?? false;

  return (
    <Section title="Positionsgrenze">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {share === null ? (
            "Nicht im aktuellen Depotstand."
          ) : (
            <>
              Heute{" "}
              <span className={over ? "font-medium text-negative" : "text-foreground"}>
                {formatPercent(share, 1)}
              </span>{" "}
              des Depots
              {over && " · über der Grenze, der Nachkauf schlägt es nicht vor"}.
            </>
          )}
        </p>
        <div className="max-w-56">
          <label htmlFor="position-cap" className="sr-only">
            Höchstens so viel Prozent des Depots im Nachkauf
          </label>
          <Select
            id="position-cap"
            value={own === undefined ? "" : String(own)}
            disabled={save.isPending}
            onChange={(event) => {
              const next = new Map(caps);
              if (event.target.value === "") next.delete(securityId);
              else next.set(securityId, Number.parseInt(event.target.value, 10));
              save.mutate({ caps: next });
            }}
          >
            <option value="">Standard ({String(standard)} %)</option>
            {POSITION_CAP_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                höchstens {choice} %
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Section>
  );
}
