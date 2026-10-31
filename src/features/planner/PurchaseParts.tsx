import * as React from "react";
import { Link } from "react-router";
import { ChevronDown, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMoney,
  formatMoneyWhole,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import { useBackState } from "@/lib/hooks/useBackState";
import { MD_BREAKPOINT_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils/cn";
import { formatCountNoun } from "@/lib/utils/formatNumber";
import { AssetLink } from "./AssetLink";
import { payoutText } from "./format";
import type { concentrationAfter, PlannedBuy, PurchasePlan } from "./purchase";

/**
 * Teile der Ergebnisanzeige, die Nachkauf und Tausch (seit 2.62.0) teilen:
 * Streuungszeile, Käufe und ausgeschlossene Assets.
 */

const sharesFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/**
 * Streuung nach dem Kauf in einer Zeile (seit 2.22.0): größte Position,
 * Branche und Land. Eine Position über der Grenze ist hervorgehoben — das
 * kann nur eine sein, die schon vorher darüber lag.
 */
export function SpreadLine({
  spread,
  cap,
  plan,
}: {
  spread: ReturnType<typeof concentrationAfter>;
  /**
   * Gewichtung der größten Position; `null` ohne eigene. Dann gibt es nichts
   * zu überschreiten: Der Standard 0 % hieße sonst „immer darüber".
   */
  cap: number | null;
  plan: PurchasePlan;
}) {
  if (spread === null) return null;
  const over = cap !== null && spread.position.percent.greaterThan(cap);
  const part = (label: string, entry: { name: string; percent: DecimalInstance }) =>
    `${label} ${entry.name} ${formatPercent(entry.percent, 1)}`;
  return (
    <div className="space-y-1 px-1 text-sm text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Nach dem Kauf:</span>{" "}
        <span className={cn(over && "font-medium text-negative")}>
          {part("größte Position", spread.position)}
        </span>
        {spread.sector && <> · {part("Branche", spread.sector)}</>}
        {spread.country && <> · {part("Land", spread.country)}</>}
      </p>
      {plan.unplaced.isPositive() && (
        <p>
          {formatMoneyWhole(plan.unplaced)} finden unter den Zielgewichtungen keinen
          Platz. Mehr Käufe oder höhere Zielgewichtungen verteilen sie.
        </p>
      )}
    </div>
  );
}

function sharesText(buy: PlannedBuy): string | null {
  return buy.shares?.greaterThanOrEqualTo("0.1")
    ? `≈ ${sharesFormat.format(buy.shares.toNumber())} Stück`
    : null;
}

/**
 * Käufe des Plans: ab `md` als Tabelle wie Bestand › Assets (seit 2.32.0),
 * auf dem Telefon als Liste.
 */
export function BuyList({
  plan,
  canExclude,
  onExclude,
}: {
  plan: PurchasePlan;
  canExclude: boolean;
  onExclude: (securityId: string) => void;
}) {
  const isWide = useMediaQuery(MD_BREAKPOINT_QUERY);
  if (!isWide) {
    return (
      <ListGroup>
        {plan.buys.map((buy) => (
          <li key={buy.securityId}>
            <BuyRow
              buy={buy}
              canExclude={canExclude}
              onExclude={() => {
                onExclude(buy.securityId);
              }}
            />
          </li>
        ))}
      </ListGroup>
    );
  }
  return (
    <Table>
      <caption className="sr-only">Vorgeschlagene Käufe</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Ausschüttung</TableHead>
          <TableHead className="whitespace-nowrap text-right">Stück</TableHead>
          <TableHead className="whitespace-nowrap text-right">Betrag</TableHead>
          <TableHead className="whitespace-nowrap text-right">Mehr im Jahr</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Aktionen</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {plan.buys.map((buy) => {
          const payout = payoutText(buy.months);
          const shares = sharesText(buy);
          return (
            <TableRow key={buy.securityId}>
              <TableCell>
                <AssetLink id={buy.securityId} name={buy.name} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {payout.rhythm}
                {payout.months && <span className="block text-xs">{payout.months}</span>}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-amount text-muted-foreground">
                {shares ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold tabular-amount">
                {formatMoneyWhole(buy.invest)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-amount">
                +{formatMoney(buy.annual)}
              </TableCell>
              <TableCell className="text-right">
                {canExclude && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${buy.name} nicht mehr vorschlagen`}
                    title="Nicht mehr vorschlagen"
                    onClick={() => {
                      onExclude(buy.securityId);
                    }}
                  >
                    <EyeOff aria-hidden />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function BuyRow({
  buy,
  canExclude,
  onExclude,
}: {
  buy: PlannedBuy;
  canExclude: boolean;
  onExclude: () => void;
}) {
  const backState = useBackState();
  const payout = payoutText(buy.months);
  const shares = sharesText(buy);
  return (
    <ListRow className="gap-1 py-0 pr-0">
      <Link
        to={`/depot/${buy.securityId}`}
        state={backState}
        className="-ml-3 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
      >
        <ListItemBody
          title={buy.name}
          meta={
            <>
              <span>{payout.rhythm}</span>
              {payout.months && <span>{payout.months}</span>}
              {shares && <span className="tabular-amount">{shares}</span>}
            </>
          }
          trailing={
            <span className="flex flex-col items-end">
              <span className="font-medium text-foreground">
                {formatMoneyWhole(buy.invest)}
              </span>
              <span>+{formatMoney(buy.annual)} im Jahr</span>
            </span>
          }
        />
      </Link>
      {canExclude && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={`${buy.name} nicht mehr vorschlagen`}
          title="Nicht mehr vorschlagen"
          onClick={onExclude}
        >
          <EyeOff aria-hidden className="size-4" />
        </Button>
      )}
    </ListRow>
  );
}

/** Ausgeschlossene Assets, eingeklappt; jedes lässt sich zurücknehmen. */
export function ExcludedList({
  excluded,
  names,
  onRestore,
}: {
  excluded: readonly string[];
  names: ReadonlyMap<string, string>;
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (excluded.length === 0) return null;
  const listId = "planer-ausgeschlossen";
  return (
    <section aria-label="Ausgeschlossene Assets">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
      >
        {formatCountNoun(
          excluded.length,
          "Asset ausgeschlossen",
          "Assets ausgeschlossen",
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ListGroup id={listId} className="reveal">
          {excluded.map((id) => {
            const name = names.get(id) ?? "Unbekanntes Asset";
            return (
              <li key={id}>
                <ListRow className="py-0 pr-0">
                  <span className="min-w-0 flex-1 truncate-fade text-sm">{name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    aria-label={`${name} wieder vorschlagen`}
                    onClick={() => {
                      onRestore(id);
                    }}
                  >
                    <RotateCcw aria-hidden className="size-4" />
                    Wieder vorschlagen
                  </Button>
                </ListRow>
              </li>
            );
          })}
        </ListGroup>
      )}
    </section>
  );
}
