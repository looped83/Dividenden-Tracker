import { Section, SectionLink } from "@/components/ui/section";
import { DetailRow } from "@/components/ui/detail-row";
import { formatMoneyWhole, formatPercent } from "@/lib/money";
import { useToday } from "@/lib/hooks/useToday";
import { formatDayMonth } from "@/lib/utils/formatDate";
import { useDepots } from "@/features/depots/hooks";
import { useSavingsPlans } from "./savingsPlanHooks";
import { INTERVAL_LABEL, nextExecution } from "./savingsPlans";
import { formatDecimal } from "./format";
import { POSITION_CAP_DEFAULT, useDepotShare, usePositionCaps } from "./positionCaps";

/**
 * Abschnitt „Planung" auf der Seite eines Assets (seit 2.24.0): was mit dem
 * Asset vorgesehen ist — Sparpläne (CALCULATION_RULES.md §17) und die
 * Zielgewichtung fuer den Nachkauf (§16). Seit 2.45.0 nur Anzeige: Geaendert
 * wird beides im Formular „Asset bearbeiten", wie alles andere am Asset.
 */
export function SecurityPlanning({
  securityId,
  archived,
}: {
  securityId: string;
  archived: boolean;
}) {
  const { data: plans = [], isLoading } = useSavingsPlans();
  const { data: caps, isLoading: capsLoading } = usePositionCaps();
  const { data: depots = [] } = useDepots();
  const share = useDepotShare(securityId);
  const today = useToday();
  const own = plans.filter((plan) => plan.securityId === securityId);
  // Ein archiviertes Asset ohne Plan braucht den Abschnitt nicht: Die
  // Zielgewichtung gilt nur fuer den Nachkauf, und der schlaegt es nicht mehr vor.
  if (isLoading || capsLoading || (archived && own.length === 0)) return null;

  const ownCap = caps?.get(securityId);
  const over = share?.greaterThan(ownCap ?? POSITION_CAP_DEFAULT) ?? false;
  // Rot nur über einer echten Zielgewichtung: 0 ist eine Entscheidung, kein
  // Überschreiten.
  const warn = over && ownCap !== undefined && ownCap > 0;

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
            <DetailRow key={plan.id} label="Sparplan">
              <span className="block">
                {formatMoneyWhole(plan.amount)} {INTERVAL_LABEL[plan.interval]}
              </span>
              {meta && (
                <span className="block text-[0.8125rem] text-muted-foreground">
                  {meta}
                </span>
              )}
            </DetailRow>
          );
        })}
        {!archived && own.length === 0 && (
          <DetailRow label="Sparplan">
            <span className="text-muted-foreground">Kein Sparplan</span>
          </DetailRow>
        )}
        {!archived && (
          <DetailRow label="Zielgewichtung">
            <span className="block">
              {ownCap === undefined ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                `${formatDecimal(ownCap)}\u00A0%`
              )}
            </span>
            <span className="block text-[0.8125rem] text-muted-foreground">
              {share === null ? (
                "nicht im aktuellen Depotstand"
              ) : (
                <>
                  Gewichtung{" "}
                  <span
                    className={warn ? "font-medium text-negative" : "text-foreground"}
                  >
                    {formatPercent(share, 1)}
                  </span>
                </>
              )}
              {ownCap === undefined
                ? " · ohne Zielgewichtung kein Nachkauf"
                : over && " · kein Nachkauf"}
            </span>
          </DetailRow>
        )}
      </div>
    </Section>
  );
}
