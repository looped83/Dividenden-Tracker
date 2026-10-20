import { Eyebrow, Hero, Lead, RankedList } from "./ReviewParts";
import { TrendPill } from "@/components/domain/KpiHero";
import {
  EUR,
  Money,
  formatMoney,
  formatPercent,
  type DecimalInstance,
} from "@/lib/money";
import { monthNameDe, monthNameDeShort, type AnnualReview } from "@/lib/statistics";
import { formatCalendarDate } from "@/lib/utils/formatDate";
import { CategoryBarChart, type CategoryDatum } from "../components/charts";
import {
  formatCountNoun,
  formatMonthYear,
  splitComparison,
  withoutSign,
} from "../format";
import type { StorySlide } from "./StoryViewer";

/**
 * Die Karten des Jahresrueckblicks. Jede Karte erzaehlt **eine** Zahl gross
 * und ordnet sie in einem Satz ein; Karten ohne Datengrundlage (keine
 * Branchen hinterlegt, keine Abzuege) entfallen, statt leer zu erscheinen.
 * Alle Werte stammen aus `annualReview` — hier wird nur gesetzt.
 */

function percent(value: DecimalInstance | null): string {
  return value === null ? "—" : formatPercent(value);
}

const NAME_LIST = new Intl.ListFormat("de-DE", { type: "conjunction" });

/** „A, B und C" */
function joinNames(names: readonly string[]): string {
  return NAME_LIST.format(names);
}

const FACTOR = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** „3,2×" */
function formatFactor(value: DecimalInstance): string {
  return `${FACTOR.format(value.toDecimalPlaces(1).toNumber())}×`;
}

/** Diagramm-Standzeit: Wer Balken liest, braucht etwas laenger. */
const CHART_DURATION = 9000;

export function buildReviewSlides(
  review: AnnualReview,
  nameOf: (securityId: string) => string,
): StorySlide[] {
  const { year } = review;
  const yearLabel = review.isPartial ? `${String(year)} bis heute` : String(year);
  const comparison = splitComparison(review.change, `gegenüber ${String(year - 1)}`);
  const slides: StorySlide[] = [];

  slides.push({
    id: "intro",
    label: "Einleitung",
    content: (
      <>
        <Eyebrow>Dein Dividendenjahr</Eyebrow>
        <Hero className="text-[clamp(5rem,30vw,9rem)] text-primary">{year}</Hero>
        <Lead>
          {formatCountNoun(review.count, "Dividende", "Dividenden")} von{" "}
          {formatCountNoun(review.distinctSecurities, "Asset", "Assets")}
          {review.isPartial ? " bis heute" : ""}. Zeit für einen Blick zurück.
        </Lead>
      </>
    ),
  });

  const rankText =
    review.yearCount < 2
      ? "Dein erstes Jahr mit Dividenden."
      : review.rank === 1
        ? "Dein bisher bestes Dividendenjahr."
        : `Platz ${String(review.rank)} von ${String(review.yearCount)} Jahren.`;
  slides.push({
    id: "summe",
    label: "Gesamtsumme",
    content: (
      <>
        <Eyebrow>Netto erhalten</Eyebrow>
        <Hero>{formatMoney(review.net)}</Hero>
        {review.priorYearNet !== null && (
          <p className="mt-4">
            <TrendPill tone={comparison.tone} title={comparison.caption}>
              {withoutSign(comparison.value)}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {withoutSign(comparison.caption)}
              </span>
            </TrendPill>
          </p>
        )}
        <Lead>{rankText}</Lead>
      </>
    ),
  });

  const factor = review.growthFactor;
  if (factor?.gt(1)) {
    const average = review.priorAverage;
    const aboveAverage =
      average?.isPositive() && review.net.compareTo(average) > 0
        ? review.net.toDecimal().div(average.toDecimal()).minus(1).times(100)
        : null;
    slides.push({
      id: "wachstum",
      label: "Dein Weg",
      duration: CHART_DURATION,
      content: (
        <>
          <Eyebrow>Dein Weg seit {review.firstYear}</Eyebrow>
          <Hero className="text-primary">{formatFactor(factor)}</Hero>
          <Lead>so viel wie in deinem ersten Dividendenjahr {review.firstYear}.</Lead>
          <div className="mt-8" data-story-keep>
            <CategoryBarChart
              data={review.years.map((bucket) => ({
                key: String(bucket.year),
                label: String(bucket.year),
                value: bucket.net.toChartNumber(),
                money: bucket.net,
                count: bucket.count,
                detail: String(bucket.year),
                highlight: bucket.year === year,
              }))}
              ariaLabel={`Nettodividende je Jahr bis ${String(year)}`}
              categoryHeader="Jahr"
            />
          </div>
          {aboveAverage && average && (
            <p className="mt-6 text-base text-muted-foreground">
              {formatPercent(aboveAverage, 0)} über deinem bisherigen Jahresschnitt von{" "}
              {formatMoney(average)}.
            </p>
          )}
        </>
      ),
    });
  }

  slides.push({
    id: "tag",
    label: "Pro Tag",
    content: (
      <>
        <Eyebrow>Passives Einkommen</Eyebrow>
        <Hero>{formatMoney(review.perDay)}</Hero>
        <Lead>
          an jedem einzelnen Tag
          {review.isPartial ? " dieses Jahres" : ` des Jahres ${String(year)}`}, ganz ohne
          Zutun.
        </Lead>
        <p className="mt-6 text-base text-muted-foreground">
          Im Schnitt {formatMoney(review.perMonth)} pro Monat.{" "}
          {review.activeMonths === 12
            ? "In jedem Monat kam Geld."
            : `In ${String(review.activeMonths)} von 12 Monaten kam Geld.`}
        </p>
      </>
    ),
  });

  if (review.net.isPositive()) {
    const perDay = review.perDay.toDecimal();
    const rates = [
      { label: "pro Stunde", value: perDay.div(24) },
      { label: "pro Woche", value: perDay.times(7) },
      { label: "pro Monat", value: review.perMonth.toDecimal() },
    ];
    slides.push({
      id: "nebenbei",
      label: "Ganz nebenbei",
      content: (
        <>
          <Eyebrow>Ganz nebenbei</Eyebrow>
          <Hero>{formatMoney(Money.fromDecimal(perDay.div(3), EUR))}</Hero>
          <Lead>
            verdient dein Depot in jeder Nacht, während du acht Stunden schläfst.
          </Lead>
          <dl className="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
            {rates.map((rate) => (
              <div key={rate.label} className="rounded-2xl bg-muted p-3 sm:p-4">
                <dt className="text-xs text-muted-foreground sm:text-sm">{rate.label}</dt>
                <dd className="mt-1 truncate text-base font-bold tracking-[-0.02em] tabular-amount sm:text-lg">
                  {formatMoney(Money.fromDecimal(rate.value, EUR))}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ),
    });
  }

  if (review.bestMonth) {
    const best = review.bestMonth;
    const data: CategoryDatum[] = review.months.map((bucket) => ({
      key: String(bucket.month),
      label: monthNameDeShort(bucket.month),
      value: bucket.net.toChartNumber(),
      money: bucket.net,
      count: bucket.count,
      detail: formatMonthYear(year, bucket.month),
      highlight: bucket.month === best.month,
    }));
    slides.push({
      id: "monat",
      label: "Rekordmonat",
      duration: CHART_DURATION,
      content: (
        <>
          <Eyebrow>Dein Rekordmonat</Eyebrow>
          <Hero>{monthNameDe(best.month)}</Hero>
          <Lead>
            {formatMoney(best.net)} in einem Monat, so viel wie nie sonst im Jahr {year}.
          </Lead>
          <div className="mt-8" data-story-keep>
            <CategoryBarChart
              data={data}
              ariaLabel={`Nettodividende je Monat ${String(year)}`}
              categoryHeader="Monat"
            />
          </div>
        </>
      ),
    });
  }

  const top = review.topPayers.at(0);
  const rest = review.topPayers.slice(1);
  if (top) {
    slides.push({
      id: "top",
      label: "Top-Zahler",
      content: (
        <>
          <Eyebrow>Dein größter Zahler</Eyebrow>
          <Hero className="text-[clamp(2rem,9vw,3.25rem)]">{nameOf(top.securityId)}</Hero>
          <Lead>
            {formatMoney(top.net)}, das sind {percent(top.share)} deiner Dividenden.
          </Lead>
          {rest.length > 0 && (
            <RankedList
              start={2}
              rows={rest.map((entry) => ({
                key: entry.securityId,
                name: nameOf(entry.securityId),
                value: formatMoney(entry.net),
                caption: percent(entry.share),
              }))}
            />
          )}
        </>
      ),
    });
  }

  if (review.newcomers.length > 0 || review.biggestRaise) {
    const shown = review.newcomers.slice(0, 3);
    const more = review.newcomers.length - shown.length;
    const raise = review.biggestRaise;
    slides.push({
      id: "neu",
      label: "Neu und gewachsen",
      content: (
        <>
          <Eyebrow>Neu und gewachsen</Eyebrow>
          {review.newcomers.length > 0 ? (
            <>
              <Hero>
                {formatCountNoun(review.newcomers.length, "neuer Zahler", "neue Zahler")}
              </Hero>
              <Lead>
                {joinNames([
                  ...shown.map((entry) => nameOf(entry.securityId)),
                  ...(more > 0 ? [`${String(more)} weitere`] : []),
                ])}{" "}
                {review.newcomers.length === 1 ? "hat" : "haben"} {year} zum ersten Mal
                gezahlt.
              </Lead>
            </>
          ) : (
            raise && <Hero>+{formatMoney(raise.absolute)}</Hero>
          )}
          {raise && (
            <div className="mt-8 rounded-2xl bg-muted p-4 sm:p-5">
              <p className="text-sm font-medium text-muted-foreground">
                Größte Steigerung
              </p>
              <p className="mt-1 text-lg font-semibold">{nameOf(raise.securityId)}</p>
              <p className="mt-1 text-muted-foreground tabular-amount">
                <span className="font-semibold text-positive">
                  +{formatMoney(raise.absolute)}
                </span>{" "}
                · von {formatMoney(raise.priorNet)} auf {formatMoney(raise.net)}
              </p>
            </div>
          )}
        </>
      ),
    });
  }

  if (review.sectors.length > 0 || review.countries > 0) {
    const headline = [
      review.countries > 0 ? formatCountNoun(review.countries, "Land", "Länder") : null,
      review.sectors.length > 0
        ? formatCountNoun(review.sectors.length, "Branche", "Branchen")
        : null,
    ]
      .filter(Boolean)
      .join(", ");
    slides.push({
      id: "streuung",
      label: "Streuung",
      content: (
        <>
          <Eyebrow>Breit aufgestellt</Eyebrow>
          <Hero className="text-[clamp(2rem,9vw,3.25rem)]">{headline}</Hero>
          {review.sectors.length > 0 && (
            <>
              <Lead>Hier kamen die meisten Dividenden her:</Lead>
              <RankedList
                start={1}
                rows={review.sectors.slice(0, 3).map((entry) => ({
                  key: entry.key,
                  name: entry.key,
                  value: percent(entry.share),
                  caption: formatMoney(entry.net),
                }))}
              />
            </>
          )}
        </>
      ),
    });
  }

  if (review.deductions.isPositive()) {
    slides.push({
      id: "steuern",
      label: "Steuern und Abzüge",
      content: (
        <>
          <Eyebrow>Steuern und Abzüge</Eyebrow>
          <Hero>{formatMoney(review.deductions)}</Hero>
          <Lead>
            {percent(review.deductionShare)} deiner Bruttodividende von{" "}
            {formatMoney(review.gross)} gingen an Quellensteuer, Abgeltungsteuer und
            Gebühren.
          </Lead>
        </>
      ),
    });
  }

  const largest = review.largestPayment;
  slides.push({
    id: "meilenstein",
    label: "Meilenstein",
    content: (
      <>
        <Eyebrow>Seit {review.firstYear}</Eyebrow>
        <Hero>{formatMoney(review.cumulativeNet)}</Hero>
        <Lead>
          Dividenden insgesamt bis {review.isPartial ? "heute" : `Ende ${String(year)}`}
          {review.yearCount > 1
            ? `, gesammelt in ${formatCountNoun(review.yearCount, "Jahr", "Jahren")}.`
            : "."}
        </Lead>
        {largest && (
          <div className="mt-8 rounded-2xl bg-muted p-4 sm:p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Größte Einzelzahlung {year}
            </p>
            <p className="mt-1 text-lg font-semibold">{nameOf(largest.securityId)}</p>
            <p className="mt-1 text-muted-foreground tabular-amount">
              <span className="font-semibold text-foreground">
                {formatMoney(largest.net)}
              </span>{" "}
              am {formatCalendarDate(largest.payDate)}
            </p>
          </div>
        )}
      </>
    ),
  });

  const milestone = review.nextMilestone;
  if (milestone) {
    const pace =
      milestone.yearsToGo === null
        ? null
        : milestone.yearsToGo <= 1
          ? "Im Tempo dieses Jahres schaffst du das schon im nächsten."
          : `Im Tempo dieses Jahres bist du in rund ${String(milestone.yearsToGo)} Jahren da.`;
    slides.push({
      id: "ausblick",
      label: "Nächstes Ziel",
      content: (
        <>
          <Eyebrow>Dein nächstes Ziel</Eyebrow>
          <Hero className="text-primary">{formatMoney(milestone.target)}</Hero>
          <Lead>
            Dividenden seit Beginn. Bis dahin fehlen noch{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(milestone.remaining)}
            </span>
            .
          </Lead>
          {pace && <p className="mt-6 text-base text-muted-foreground">{pace}</p>}
        </>
      ),
    });
  }

  const summary: { label: string; value: string }[] = [
    { label: "Netto", value: formatMoney(review.net) },
    { label: "Ø pro Monat", value: formatMoney(review.perMonth) },
    { label: "Pro Tag", value: formatMoney(review.perDay) },
    {
      label: "Rekordmonat",
      value: review.bestMonth ? monthNameDe(review.bestMonth.month) : "—",
    },
    { label: "Dividenden", value: String(review.count) },
    { label: "Assets", value: String(review.distinctSecurities) },
  ];
  slides.push({
    id: "fazit",
    label: "Zusammenfassung",
    content: (
      <>
        <Eyebrow>Dein Jahr {yearLabel} in Zahlen</Eyebrow>
        <dl className="mt-6 grid grid-cols-2 gap-3">
          {summary.map((entry) => (
            <div key={entry.label} className="rounded-2xl bg-muted p-4">
              <dt className="text-sm text-muted-foreground">{entry.label}</dt>
              <dd className="mt-1 truncate text-xl font-bold tracking-[-0.02em] tabular-amount">
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
        {top && (
          <p className="mt-6 text-base text-muted-foreground">
            Größter Zahler:{" "}
            <span className="font-medium text-foreground">{nameOf(top.securityId)}</span>
          </p>
        )}
      </>
    ),
  });

  return slides;
}
