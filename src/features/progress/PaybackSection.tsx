import * as React from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import { CollapsibleMonth, MonthSections } from "@/components/ui/month-section";
import { Section } from "@/components/ui/section";
import { useBackState } from "@/lib/hooks/useBackState";
import { useOpenKeys } from "@/lib/hooks/useOpenKeys";
import { formatMoneyWhole, formatPercent } from "@/lib/money";
import type { PaybackItem, PaybackResult, PaybackStatus } from "@/lib/progress";
import { cn } from "@/lib/utils/cn";
import { formatCountNumber } from "@/lib/utils/formatNumber";
import { ProgressBar } from "./ProgressBar";

const GROUP_TITLE: Record<PaybackStatus, string> = {
  full: "Ganz zurück",
  half: "Über die Hälfte",
  started: "Unter der Hälfte",
};

/**
 * Kaufpreis zurückverdient (seit 2.18.0): wie viel vom Einstand die
 * Dividenden schon zurückgezahlt haben (CALCULATION_RULES.md §15.3). Aufbau
 * wie „Was Dividenden decken“: das nächste Asset offen, die Gruppen
 * eingeklappt.
 */
export function PaybackSection({ payback }: { payback: PaybackResult }) {
  const { isOpen, toggle } = useOpenKeys("zurueck");
  const groups = React.useMemo(
    () =>
      (["full", "half", "started"] as const)
        .map((status) => ({
          status,
          items: payback.items.filter(
            (item) => item.status === status && item !== payback.next,
          ),
        }))
        .filter((group) => group.items.length > 0),
    [payback],
  );

  if (payback.percent === null) return null;
  const missing = payback.buyin.subtract(payback.received);

  return (
    <Section title="Kaufpreis zurückverdient">
      <div className="space-y-2">
        <div className="space-y-3 rounded-2xl bg-muted p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[0.8125rem] font-medium text-muted-foreground">
              Insgesamt zurück
            </span>
            <span className="text-[0.8125rem] text-muted-foreground tabular-amount">
              Einstand {formatMoneyWhole(payback.buyin)}
            </span>
          </div>
          <span className="block text-xl font-bold tracking-[-0.02em] tabular-amount">
            {formatMoneyWhole(payback.received)}
          </span>
          <div className="space-y-1.5">
            <ProgressBar
              percent={payback.percent.toNumber()}
              label="Anteil des Einstands, den die Dividenden zurückgezahlt haben"
            />
            <p className="text-xs text-muted-foreground tabular-amount">
              {formatPercent(payback.percent, 0)}
              {missing.isPositive() && ` · noch ${formatMoneyWhole(missing)}`}
            </p>
          </div>
        </div>
        {payback.next && (
          <ListGroup aria-label="Als Nächstes">
            <PaybackRow item={payback.next} next />
          </ListGroup>
        )}
        <MonthSections>
          {groups.map((group) => (
            <CollapsibleMonth
              key={group.status}
              id={`zurueck-${group.status}`}
              title={GROUP_TITLE[group.status]}
              aside={formatCountNumber(group.items.length)}
              open={isOpen(group.status)}
              onToggle={() => {
                toggle(group.status);
              }}
            >
              <ListGroup>
                {group.items.map((item) => (
                  <PaybackRow key={item.securityId} item={item} />
                ))}
              </ListGroup>
            </CollapsibleMonth>
          ))}
        </MonthSections>
      </div>
    </Section>
  );
}

function PaybackRow({ item, next = false }: { item: PaybackItem; next?: boolean }) {
  const backState = useBackState();
  const full = item.status === "full";
  const percent = formatPercent(item.percent, 0);
  return (
    <li>
      <ListRow asChild>
        <Link to={`/depot/${item.securityId}`} state={backState}>
          <ListItemBody
            leading={
              <span
                aria-hidden
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold tabular-amount",
                  full ? "text-positive" : "text-muted-foreground",
                )}
              >
                {full ? <Check className="size-5" strokeWidth={2.5} /> : percent}
              </span>
            }
            title={item.name}
            meta={
              <span className="tabular-amount">
                {next && <span className="sr-only">Als Nächstes, </span>}
                {full
                  ? `${percent} zurück`
                  : `${percent} zurück · noch ${formatMoneyWhole(item.missing)}`}
              </span>
            }
            trailing={
              <>
                {formatMoneyWhole(item.buyin)}
                <span className="sr-only"> Einstand</span>
              </>
            }
          />
        </Link>
      </ListRow>
    </li>
  );
}
