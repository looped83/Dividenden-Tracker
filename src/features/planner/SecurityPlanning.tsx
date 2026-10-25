import * as React from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionLink } from "@/components/ui/section";
import { AmountInput } from "@/components/ui/amount-input";
import {
  MoneyDecimal,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import { useToday } from "@/lib/hooks/useToday";
import { formatDayMonth } from "@/lib/utils/formatDate";
import { useDepots } from "@/features/depots/hooks";
import { useSecuritySnapshots } from "@/features/securities/hooks";
import { latestAsOf, snapshotsAt } from "@/features/securities/snapshots";
import { parseGermanNumber } from "@/features/securities/forecastSettings";
import { SavingsPlanDialog } from "./SavingsPlanDialog";
import { useSavingsPlans } from "./savingsPlanHooks";
import {
  INTERVAL_LABEL,
  SAVINGS_PLANS_MAX,
  nextExecution,
  type SavingsPlan,
} from "./savingsPlans";
import { formatDecimal } from "./format";
import {
  POSITION_CAP_DEFAULT,
  POSITION_CAP_MAX,
  POSITION_CAP_MIN,
  usePositionCaps,
  useSavePositionCap,
} from "./positionCaps";

// Wie DetailRow: dieselbe Zeilenhoehe und Schrift wie die Stammdaten daneben.
const ROW =
  "flex w-full items-center justify-between gap-4 border-b border-border py-3 text-[0.9375rem] last:border-0";

/**
 * Abschnitt „Planung" auf der Seite eines Assets (seit 2.24.0): was mit dem
 * Asset vorgesehen ist — Sparpläne (CALCULATION_RULES.md §17) und die
 * Gewichtung fuer den Nachkauf (§16). Zuvor zwei eigene Abschnitte mit je
 * Ueberschrift; als Zeilen stehen sie kompakt neben den Stammdaten.
 */
export function SecurityPlanning({
  securityId,
  archived,
}: {
  securityId: string;
  archived: boolean;
}) {
  const { data: plans = [], isLoading } = useSavingsPlans();
  const { data: depots = [] } = useDepots();
  const today = useToday();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<SavingsPlan | null>(null);
  const own = plans.filter((plan) => plan.securityId === securityId);
  // Ein archiviertes Asset ohne Plan braucht den Abschnitt nicht: Die Grenze
  // gilt nur fuer den Nachkauf, und der schlaegt es nicht mehr vor.
  if (isLoading || (archived && own.length === 0)) return null;

  return (
    <Section
      title="Planung"
      action={
        own.length > 0 ? (
          <SectionLink to="/planer/sparplaene">Alle Sparpläne</SectionLink>
        ) : undefined
      }
    >
      <div>
        {own.map((plan) => {
          const next = plan.paused ? null : nextExecution(plan, today);
          const depot = depots.find((entry) => entry.id === plan.depotId)?.name;
          const meta = [
            plan.paused ? "pausiert" : next && `nächste ${formatDayMonth(next)}`,
            depot,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={plan.id}
              type="button"
              className={`${ROW} rounded-sm text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring`}
              onClick={() => {
                setEditing(plan);
              }}
            >
              <span className="text-muted-foreground">Sparplan</span>
              <span className="flex items-center gap-1 text-right">
                <span>
                  <span className="block">
                    {formatMoneyWhole(plan.amount)} {INTERVAL_LABEL[plan.interval]}
                  </span>
                  {meta && (
                    <span className="block text-[0.8125rem] text-muted-foreground">
                      {meta}
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </span>
            </button>
          );
        })}
        {/* Ein weiterer Plan auf dasselbe Asset ist selten; er steht unter
            „Alle Sparpläne". Hier bliebe er eine zusaetzliche Zeile. */}
        {!archived && own.length === 0 && (
          <div className={ROW}>
            <span className="text-muted-foreground">Sparplan</span>
            <Button
              variant="outline"
              size="sm"
              disabled={plans.length >= SAVINGS_PLANS_MAX}
              onClick={() => {
                setAdding(true);
              }}
            >
              <Plus aria-hidden /> Sparplan
            </Button>
          </div>
        )}
        {!archived && <WeightingRow securityId={securityId} />}
      </div>
      <SavingsPlanDialog
        open={adding}
        onOpenChange={setAdding}
        plans={plans}
        securityId={securityId}
      />
      <SavingsPlanDialog
        key={editing?.id}
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        plans={plans}
        plan={editing ?? undefined}
      />
    </Section>
  );
}

/**
 * Gewichtung (seit 2.24.0, zuvor „Positionsgrenze"): Anteil am Depot heute und
 * der Anteil, bis zu dem der Nachkauf das Asset aufstockt — der Standard oder
 * ein eigener, auf eine Nachkommastelle (CALCULATION_RULES.md §16). Ein leeres
 * Feld folgt dem Standard; gespeichert wird nur eine Abweichung davon.
 * Gespeichert wird erst beim Verlassen des Felds, nicht bei jedem Tastendruck.
 */
function WeightingRow({ securityId }: { securityId: string }) {
  const { data: caps, isLoading } = usePositionCaps();
  const { data: snapshots = [] } = useSecuritySnapshots();
  const save = useSavePositionCap();
  const ownCap = caps?.get(securityId);
  const shown = ownCap === undefined ? "" : formatDecimal(ownCap);
  const [draft, setDraft] = React.useState(shown);
  // Gespeicherter Wert hat sich geaendert (Laden, anderes Geraet, verworfene
  // Eingabe): Entwurf nachziehen — waehrend des Renderns, nicht in einem Effekt.
  const [lastShown, setLastShown] = React.useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    setDraft(shown);
  }

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
  const cap = ownCap ?? POSITION_CAP_DEFAULT;
  const over = share?.greaterThan(cap) ?? false;

  const commit = () => {
    const parsed = parseGermanNumber(draft);
    // Unsinn oder ausserhalb des Bereichs stellt den gespeicherten Wert wieder
    // her. 0 ist wie leer: keine Gewichtung, kein Nachkauf.
    if (
      parsed === undefined ||
      (parsed !== null &&
        parsed !== 0 &&
        (parsed < POSITION_CAP_MIN || parsed > POSITION_CAP_MAX))
    ) {
      setDraft(shown);
      return;
    }
    const value = parsed === null || parsed === 0 ? undefined : parsed;
    if (value === ownCap) {
      setDraft(shown);
      return;
    }
    const next = new Map(caps);
    if (value === undefined) next.delete(securityId);
    else next.set(securityId, value);
    save.mutate({ caps: next });
  };

  return (
    <div className={`${ROW} items-start`}>
      <label htmlFor="weighting" className="pt-2 text-muted-foreground">
        Gewichtung
      </label>
      <div className="flex flex-col items-end gap-1 text-right">
        <div className="relative w-24">
          <AmountInput
            id="weighting"
            maxFractionDigits={1}
            aria-describedby="weighting-share"
            value={draft}
            placeholder={formatDecimal(POSITION_CAP_DEFAULT)}
            disabled={save.isPending}
            className="h-10 pr-7 text-right tabular-nums"
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground"
          >
            %
          </span>
        </div>
        <span id="weighting-share" className="text-[0.8125rem] text-muted-foreground">
          {share === null ? (
            "nicht im aktuellen Depotstand"
          ) : (
            <>
              heute{" "}
              <span
                className={
                  over && ownCap !== undefined
                    ? "font-medium text-negative"
                    : "text-foreground"
                }
              >
                {formatPercent(share, 1)}
              </span>
            </>
          )}
          {ownCap === undefined
            ? " · ohne Gewichtung kein Nachkauf"
            : over && " · kein Nachkauf"}
        </span>
      </div>
    </div>
  );
}
