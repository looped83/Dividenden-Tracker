/**
 * Prognose der naechsten zwoelf Monate (Bestand › Prognose).
 *
 * Reine Funktionen wie `analysis.ts`: ohne Oberflaeche, ohne Datenbank. Das
 * Ergebnis ist eine **Schaetzung** und wird nirgends gespeichert; es fliesst
 * weder in Statistik noch in Ziele (PRODUCT_SPEC.md Grundsatz 8,
 * CALCULATION_RULES.md §14).
 *
 * Grundlage ist die erwartete Jahresdividende des juengsten Depotstands,
 * verteilt auf die Ausschuettungsmonate der Position und mit der eigenen
 * Netto-Quote auf netto gerechnet. Die Jahresdividende des Exports ist brutto
 * (Dividendenrate × Stueck). Angekuendigte Kalendertermine fliessen bewusst
 * nicht ein: Der Kalender reicht nur ein, zwei Monate voraus und wuerde die
 * Reihe nur am Anfang anders faerben.
 */
import {
  EUR,
  Money,
  MoneyDecimal,
  toCurrencyCode,
  type CurrencyCode,
  type DecimalInstance,
} from "@/lib/money";
import {
  isInRange,
  isoDate,
  monthOf,
  trailingYearRange,
  type RefDate,
} from "@/lib/statistics/dates";
import { normalizePayoutMonths } from "@/lib/statistics/payoutMonths";
import type { AnalyticsPayment } from "@/lib/statistics/types";
import type { SecuritySnapshot } from "@/lib/supabase/repositories/securitySnapshots";
import type { DividendFrequency } from "@/lib/supabase/database.types";
import { effectiveFrequency } from "./analysis";
import { latestAsOf, snapshotsAt } from "./snapshots";

/** Stammdaten je Position, die der Depotstand nicht traegt. */
export interface ForecastFacets {
  name: string;
  /** Gepflegte Ausschuettungsmonate (1–12); leer, wenn nicht gepflegt. */
  payoutMonths: readonly number[];
  /** Land (ISO-Code) fuer die Netto-Quote je Land; fehlt ohne Angabe. */
  country?: string | null | undefined;
  /** Branche, nur fuer die Streuung im Planer. */
  sector?: string | null | undefined;
}

/** Stammdaten je Asset für {@link forecastTwelveMonths}. */
export function forecastFacets(
  securities: readonly {
    id: string;
    name: string;
    payout_months: readonly number[] | null;
    country: string | null;
    sector: string | null;
  }[],
): Map<string, ForecastFacets> {
  const facets = new Map<string, ForecastFacets>();
  for (const security of securities) {
    facets.set(security.id, {
      name: security.name,
      payoutMonths: normalizePayoutMonths(security.payout_months),
      country: security.country,
      sector: security.sector,
    });
  }
  return facets;
}

/** Ein Beitrag zu einem Monat. */
export interface ForecastContribution {
  securityId: string;
  name: string;
  amount: Money;
  /** Zahlungen im Jahr (Zahl der Ausschuettungsmonate). */
  payouts: number;
  /** Marktwert laut Depotstand; `null`, wenn die Quelle keinen nennt. */
  marketValue: Money | null;
}

export interface ForecastMonth {
  year: number;
  /** 1–12 */
  month: number;
  total: Money;
  /** Groesster Beitrag zuerst. */
  contributions: ForecastContribution[];
}

export interface TwelveMonthForecast {
  asOf: string;
  months: ForecastMonth[];
  total: Money;
  /** Erhalten in den zwoelf Monaten, die heute enden (netto). */
  receivedLast12: Money;
  /** Netto ÷ brutto der letzten zwoelf Monate; `null` ohne Bruttobetraege. */
  netRatio: DecimalInstance | null;
  /** Marktwert aller Positionen des Stands (auch ohne Dividende). */
  depotValue: Money;
  /** Gehaltene Positionen, fuer die die Quelle keine Jahresdividende nennt. */
  withoutAmount: number;
}

export type ForecastResult =
  | { kind: "ok"; forecast: TwelveMonthForecast }
  | { kind: "empty" }
  | { kind: "mixedCurrency" };

const ONE = new MoneyDecimal(1);
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const STEP_BY_FREQUENCY: Partial<Record<DividendFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  biannually: 6,
  annually: 12,
};

/**
 * Anteil, der von brutto netto ankommt, ueber die zwoelf Monate bis heute.
 *
 * Bewusst die eigene Quote statt eines Steuersatzes: Sie enthaelt
 * Quellensteuer, Abgeltungsteuer und Freistellungsauftrag so, wie sie
 * tatsaechlich gewirkt haben, ohne dass die App Steuerregeln kennen muss.
 * Begrenzt auf hoechstens 1 — Korrekturbuchungen koennen netto ueber brutto
 * heben, mehr als alles kommt aber nie an.
 */
export function netRatio(
  payments: readonly AnalyticsPayment[],
  todayIso: string,
): DecimalInstance | null {
  const range = trailingYearRange(todayIso);
  let net = new MoneyDecimal(0);
  let gross = new MoneyDecimal(0);
  for (const payment of payments) {
    if (!isInRange(payment.payDate, range)) continue;
    if (payment.grossAmount.currency !== EUR || payment.netAmount.currency !== EUR)
      continue;
    net = net.plus(payment.netAmount.toDecimal());
    gross = gross.plus(payment.grossAmount.toDecimal());
  }
  if (!gross.greaterThan(0) || !net.greaterThan(0)) return null;
  return MoneyDecimal.min(net.dividedBy(gross), ONE);
}

/** Mindestens so viele Zahlungen, damit ein Land eine eigene Netto-Quote hat. */
const COUNTRY_MIN_PAYMENTS = 3;

/**
 * Netto-Quote je Land (seit 2.22.0): wie {@link netRatio}, aber nur ueber die
 * Zahlungen von Assets eines Landes. So traegt ein US-Titel seine
 * Quellensteuer, ein irischer ETF keine. Bewusst nicht je Asset: Der
 * Freistellungsauftrag ist am Jahresanfang aufgebraucht, und ein Asset, das
 * nur im Januar zahlt, saehe sonst steuerfrei aus. Ueber ein Land mitteln
 * sich die Zeitpunkte. Laender mit weniger als drei Zahlungen fehlen.
 */
export function netRatioByCountry(
  payments: readonly AnalyticsPayment[],
  facets: ReadonlyMap<string, ForecastFacets>,
  todayIso: string,
): Map<string, DecimalInstance> {
  const range = trailingYearRange(todayIso);
  const sums = new Map<
    string,
    { net: DecimalInstance; gross: DecimalInstance; count: number }
  >();
  for (const payment of payments) {
    if (!isInRange(payment.payDate, range)) continue;
    if (payment.grossAmount.currency !== EUR || payment.netAmount.currency !== EUR)
      continue;
    const country = facets.get(payment.securityId)?.country;
    if (!country) continue;
    const sum = sums.get(country) ?? {
      net: new MoneyDecimal(0),
      gross: new MoneyDecimal(0),
      count: 0,
    };
    sums.set(country, {
      net: sum.net.plus(payment.netAmount.toDecimal()),
      gross: sum.gross.plus(payment.grossAmount.toDecimal()),
      count: sum.count + 1,
    });
  }
  const ratios = new Map<string, DecimalInstance>();
  for (const [country, sum] of sums) {
    if (sum.count < COUNTRY_MIN_PAYMENTS) continue;
    if (!sum.gross.greaterThan(0) || !sum.net.greaterThan(0)) continue;
    ratios.set(country, MoneyDecimal.min(sum.net.dividedBy(sum.gross), ONE));
  }
  return ratios;
}

/** Die zwoelf vollen Monate nach dem laufenden. */
export function forecastWindow(today: RefDate): { year: number; month: number }[] {
  return Array.from({ length: 12 }, (_, index) => {
    const offset = today.month + index; // 0-basiert ab Januar des Jahres
    return { year: today.year + Math.floor(offset / 12), month: (offset % 12) + 1 };
  });
}

/**
 * Monate, in denen eine Position zahlt — in dieser Rangfolge:
 * gepflegte Ausschuettungsmonate, die Monate ihrer Zahlungen der letzten zwoelf
 * Monate, der Rhythmus des Exports ab dem naechsten Zahltag. Ohne jede Angabe
 * verteilt sich die Jahresdividende gleichmaessig — als Schaetzung beschriftet,
 * wie alles hier.
 */
export function payoutMonthsOf(
  facets: ForecastFacets | undefined,
  recentMonths: ReadonlySet<number> | undefined,
  snapshot: SecuritySnapshot,
): readonly number[] {
  const maintained = facets?.payoutMonths ?? [];
  if (maintained.length > 0) return maintained;
  if (recentMonths && recentMonths.size > 0)
    return [...recentMonths].sort((a, b) => a - b);

  const frequency = effectiveFrequency(snapshot.dividend_frequency, maintained);
  const step = frequency ? STEP_BY_FREQUENCY[frequency] : undefined;
  if (step !== undefined && snapshot.next_pay_date !== null) {
    const anchor = monthOf(snapshot.next_pay_date);
    return ALL_MONTHS.filter((month) => (month - anchor + 12) % step === 0);
  }
  return ALL_MONTHS;
}

/**
 * Prognose fuer die zwoelf vollen Monate nach dem laufenden.
 */
export function forecastTwelveMonths({
  snapshots,
  facets,
  payments,
  today,
}: {
  snapshots: readonly SecuritySnapshot[];
  facets: ReadonlyMap<string, ForecastFacets>;
  payments: readonly AnalyticsPayment[];
  today: RefDate;
}): ForecastResult {
  const asOf = latestAsOf(snapshots);
  const rows = snapshotsAt(snapshots, asOf);
  if (asOf === null || rows.length === 0) return { kind: "empty" };
  if (new Set(rows.map((row) => row.currency)).size > 1) return { kind: "mixedCurrency" };
  const currency: CurrencyCode = toCurrencyCode(rows[0].currency);
  // Die Zahlungen stehen in Euro; ein Stand in anderer Waehrung liesse sich
  // mit ihrer Netto-Quote nicht ehrlich verrechnen.
  if (currency !== EUR) return { kind: "mixedCurrency" };

  const todayIso = isoDate(today.year, today.month, today.day);
  const ratio = netRatio(payments, todayIso);
  const byCountry = netRatioByCountry(payments, facets, todayIso);
  const factorOf = (securityId: string) => {
    const country = facets.get(securityId)?.country;
    return (country ? byCountry.get(country) : undefined) ?? ratio ?? ONE;
  };

  const recentRange = trailingYearRange(todayIso);
  const recentMonthsBySecurity = new Map<string, Set<number>>();
  let receivedLast12 = Money.zero(EUR);
  for (const payment of payments) {
    if (!isInRange(payment.payDate, recentRange)) continue;
    if (payment.netAmount.currency === EUR)
      receivedLast12 = receivedLast12.add(payment.netAmount);
    const months = recentMonthsBySecurity.get(payment.securityId);
    if (months) months.add(monthOf(payment.payDate));
    else
      recentMonthsBySecurity.set(payment.securityId, new Set([monthOf(payment.payDate)]));
  }

  const months: ForecastMonth[] = forecastWindow(today).map(({ year, month }) => ({
    year,
    month,
    total: Money.zero(currency),
    contributions: [],
  }));

  let withoutAmount = 0;
  let depotValue = Money.zero(currency);
  for (const row of rows) {
    if (row.market_value !== null)
      depotValue = depotValue.add(Money.fromString(row.market_value, currency));
    if (row.annual_dividend_total === null) {
      withoutAmount += 1;
      continue;
    }
    if (row.dividend_frequency === "none") continue;
    const annual = new MoneyDecimal(row.annual_dividend_total);
    if (!annual.greaterThan(0)) continue;

    const payout = new Set(
      payoutMonthsOf(
        facets.get(row.security_id),
        recentMonthsBySecurity.get(row.security_id),
        row,
      ),
    );
    const amount = Money.fromDecimal(
      annual.times(factorOf(row.security_id)).dividedBy(payout.size),
      currency,
    );
    const name = facets.get(row.security_id)?.name ?? "Unbekannt";
    const marketValue =
      row.market_value === null ? null : Money.fromString(row.market_value, currency);
    for (const month of months) {
      if (!payout.has(month.month)) continue;
      month.total = month.total.add(amount);
      month.contributions.push({
        securityId: row.security_id,
        name,
        amount,
        payouts: payout.size,
        marketValue,
      });
    }
  }

  let total = Money.zero(currency);
  for (const month of months) {
    month.contributions.sort((a, b) => b.amount.compareTo(a.amount));
    total = total.add(month.total);
  }

  if (total.isZero() && receivedLast12.isZero()) return { kind: "empty" };

  return {
    kind: "ok",
    forecast: {
      asOf,
      months,
      total,
      receivedLast12,
      netRatio: ratio,
      depotValue,
      withoutAmount,
    },
  };
}

/** Gehaltene Position, deren Zukauf eine Monatsluecke schliesst. */
export interface GapFiller {
  securityId: string;
  name: string;
  payouts: number;
  /**
   * Zukauf, der die Luecke bis zum Ø schliesst — oder, wo die Gewichtung
   * vorher endet, der groesste, der noch darunter passt (`partial`).
   */
  invest: Money;
  /** Mehr in diesem Monat durch `invest` (netto), hoechstens die Luecke. */
  closes: Money;
  /** Der Zukauf schliesst die Luecke nur zum Teil (seit 2.27.0). */
  partial: boolean;
  /** Mehr in diesem Monat je 1.000 € Zukauf (netto). */
  perThousand: Money;
}

/** Ein Monat unter dem Durchschnitt der Prognose. */
export interface MonthGap {
  year: number;
  month: number;
  total: Money;
  /** Abstand zum Ø-Monat. */
  gap: Money;
  /** Bis zu {@link MAX_FILLERS} Fueller, der kleinste Zukauf zuerst. */
  fillers: GapFiller[];
}

const INVEST_STEP = new MoneyDecimal(100);
const THOUSAND = new MoneyDecimal(1000);
const MAX_FILLERS = 3;

/**
 * Monatsluecken (CALCULATION_RULES.md §14.3): Monate der Prognose unter ihrem
 * Ø-Monat, je mit bis zu drei Fuellern aus dem eigenen Bestand.
 *
 * Fueller ist eine Position, die in dem Monat zahlt, aber nicht monatlich —
 * ein Monatszahler hebt alle Monate gleich und schliesst keine Luecke. Je
 * hoeher die Ausschuettung je Zahlung im Verhaeltnis zum Marktwert, desto
 * kleiner der Zukauf; danach sind sie geordnet. Der Zukauf ist
 * `Luecke × Marktwert ÷ Betrag je Zahlung`, auf volle 100 € aufgerundet;
 * dazu, was 1.000 € Zukauf in dem Monat bringen. Im Planer ausgeschlossene
 * Assets (`excluded`) fuellen keine Luecke, zaehlen aber in der Prognose.
 * Mit `capPercent` (seit 2.22.0) waechst kein Fueller ueber diesen Anteil am
 * Depot (Gewichtung des Nachkaufs); eigene Grenzen je Asset (`caps`) gehen
 * vor. Passt der ganze Zukauf nicht darunter, gilt seit 2.27.0 der groesste,
 * der passt (`partial`) — vorher fiel das Asset weg, und bei Gewichtungen von
 * wenigen Prozent blieb fast jede Luecke ohne Fueller. Unter 100 € Platz
 * faellt es weiter weg. Geordnet nach geschlossenem Betrag, dann Zukauf.
 */
export function monthGaps(
  forecast: TwelveMonthForecast,
  excluded: ReadonlySet<string> = new Set(),
  capPercent: number | null = null,
  caps: ReadonlyMap<string, number> = new Map(),
): {
  average: Money;
  gaps: MonthGap[];
} {
  const average = Money.fromDecimal(forecast.total.toDecimal().dividedBy(12), EUR);
  const gaps = forecast.months
    .filter((month) => month.total.compareTo(average) < 0)
    .map((month): MonthGap => {
      const gap = average.subtract(month.total);
      const fillers: GapFiller[] = [];
      for (const item of month.contributions) {
        if (item.payouts >= 12 || item.marketValue === null) continue;
        if (excluded.has(item.securityId)) continue;
        if (!item.marketValue.isPositive() || !item.amount.isPositive()) continue;
        const value = item.marketValue.toDecimal();
        const amount = item.amount.toDecimal();
        const needed = gap
          .toDecimal()
          .times(value)
          .dividedBy(amount)
          .dividedBy(INVEST_STEP)
          .ceil()
          .times(INVEST_STEP);
        let invest = needed;
        const cap = caps.get(item.securityId) ?? capPercent;
        if (cap !== null) {
          // W + x ≤ g·(D + x)  ⇔  x ≤ (g·D − W) ÷ (1 − g), g als Anteil
          const share = new MoneyDecimal(cap).dividedBy(100);
          if (share.lessThan(1)) {
            const room = share
              .times(forecast.depotValue.toDecimal())
              .minus(value)
              .dividedBy(ONE.minus(share));
            const fits = room.dividedBy(INVEST_STEP).floor().times(INVEST_STEP);
            if (fits.lessThan(INVEST_STEP)) continue;
            if (fits.lessThan(invest)) invest = fits;
          }
        }
        const closes = Money.fromDecimal(
          MoneyDecimal.min(invest.times(amount).dividedBy(value), gap.toDecimal()),
          EUR,
        );
        fillers.push({
          securityId: item.securityId,
          name: item.name,
          payouts: item.payouts,
          invest: Money.fromDecimal(invest, EUR),
          closes,
          partial: invest.lessThan(needed),
          perThousand: Money.fromDecimal(
            THOUSAND.times(item.amount.toDecimal()).dividedBy(
              item.marketValue.toDecimal(),
            ),
            EUR,
          ),
        });
      }
      fillers.sort(
        (a, b) =>
          b.closes.compareTo(a.closes) ||
          a.invest.compareTo(b.invest) ||
          b.perThousand.compareTo(a.perThousand) ||
          a.name.localeCompare(b.name, "de"),
      );
      return {
        year: month.year,
        month: month.month,
        total: month.total,
        gap,
        fillers: fillers.slice(0, MAX_FILLERS),
      };
    });
  return { average, gaps };
}
