import * as React from "react";
import type { Money } from "@/lib/money";
import { MONTH_NAMES_DE_SHORT } from "@/lib/statistics";
import type { HeroPoint, HeroSeries } from "./heroSeries";

/** Platz über der höchsten Marke für die Beschriftung der Vorjahreslinie. */
const TOP = 20;
/** Platz unter der Nulllinie für Monats- und Jahresbeschriftungen. */
const LABELS = 22;
/** Seitlicher Rand, damit Endpunkte nicht am Rand abgeschnitten werden. */
const INSET = 5;

function useElementWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width];
}

const num = (money: Money): number => money.toChartNumber();

/**
 * Diagramm im Kopf der Übersicht — ein eigenes, kleines SVG statt Recharts:
 * Es steht im ersten Bildschirm, und die Bibliothek wöge dort rund 108 kB.
 *
 * **Wischen statt Tooltip.** Wer über das Diagramm fährt oder wischt, wählt
 * einen Punkt; der Kopf darüber zeigt dann dessen Betrag und Vergleich
 * (`onActiveChange`). Mit der Maus endet die Auswahl beim Verlassen, mit dem
 * Finger bleibt sie stehen, bis man denselben Punkt erneut antippt — so lässt
 * sich der Betrag danach noch antippen und öffnet die passenden Zahlungen.
 *
 * **Tastatur und Screenreader.** Das Diagramm ist ein Schieberegler über die
 * Punkte (`role="slider"`): Pfeiltasten, Pos1/Ende, Escape setzt zurück. Der
 * Wert wird über `aria-valuetext` angesagt; die vollständigen Zahlen stehen
 * zusätzlich in der Datentabelle darunter (§17).
 *
 * „Alle Jahre" ist eine Linie: Gefragt ist der Verlauf über viele Jahre, und
 * fünfzehn Säulen wurden auf dem Telefon zu Strichen.
 *
 * Farben: aktuelles Jahr in Vordergrundfarbe, Vorjahr in `--series-prior` und
 * — als Linie — gestrichelt. Die Identität trägt nie die Farbe allein.
 */
export function HeroChart({
  series,
  active,
  onActiveChange,
  label,
  describe,
  onOpen,
}: {
  series: HeroSeries;
  active: number | null;
  onActiveChange: (index: number | null) => void;
  /** Name des Reglers für Hilfsmittel. */
  label: string;
  /** Ansage eines Punktes (`aria-valuetext`). */
  describe: (point: HeroPoint) => string;
  /** Klick (Maus) bzw. Enter: die Zahlungen hinter dem Punkt öffnen. */
  onOpen: (point: HeroPoint) => void;
}) {
  const [ref, width] = useElementWidth();
  // Nur eine Tastaturauswahl endet mit dem Fokus. Eine Auswahl per Finger muss
  // stehen bleiben, wenn man danach den Betrag im Kopf antippt.
  const viaKeyboard = React.useRef(false);
  const pointer = React.useRef("");
  const height = width >= 640 ? 200 : 140;
  const { points } = series;
  const slots = series.kind === "years" ? series.bars.length : 12;
  const x = (slot: number) => INSET + (slot / slots) * (width - 2 * INSET);

  const nearest = (clientX: number): number => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || points.length === 0) return 0;
    const px = clientX - box.left;
    let best = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(x(points[index].x) - px) < Math.abs(x(points[best].x) - px)) {
        best = index;
      }
    }
    return best;
  };

  const shown = active ?? points.length - 1;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, points.length - 1)}
      aria-valuenow={shown}
      aria-valuetext={points[shown] ? describe(points[shown]) : undefined}
      className="relative touch-pan-y select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 ring-offset-background"
      style={{ height: height + (series.kind === "cumulative" ? 0 : LABELS) }}
      onPointerMove={(event) => {
        // Mit dem Finger nur beim Ziehen; ein Antippen wählt per pointerdown.
        if (event.pointerType === "mouse" || event.buttons > 0) {
          onActiveChange(nearest(event.clientX));
        }
      }}
      onPointerDown={(event) => {
        viaKeyboard.current = false;
        pointer.current = event.pointerType;
        const index = nearest(event.clientX);
        onActiveChange(event.pointerType !== "mouse" && index === active ? null : index);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onActiveChange(null);
      }}
      onClick={(event) => {
        // Mit der Maus öffnet ein Klick die Zahlungen — wie zuvor ein Balken.
        if (pointer.current !== "mouse") return;
        onOpen(points[nearest(event.clientX)]);
      }}
      onKeyDown={(event) => {
        viaKeyboard.current = true;
        const last = points.length - 1;
        let next: number | null;
        switch (event.key) {
          case "ArrowLeft":
          case "ArrowDown":
            next = Math.max(0, (active ?? last + 1) - 1);
            break;
          case "ArrowRight":
          case "ArrowUp":
            next = Math.min(last, (active ?? -1) + 1);
            break;
          case "Home":
            next = 0;
            break;
          case "End":
            next = last;
            break;
          case "Escape":
            next = null;
            break;
          case "Enter":
            if (active !== null) onOpen(points[active]);
            return;
          default:
            return;
        }
        event.preventDefault();
        onActiveChange(next);
      }}
      onBlur={() => {
        if (viaKeyboard.current) onActiveChange(null);
      }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height + (series.kind === "cumulative" ? 0 : LABELS)}
          aria-hidden
          className="block overflow-visible"
        >
          {series.kind === "cumulative" ? (
            <Cumulative
              series={series}
              x={x}
              width={width}
              height={height}
              active={active}
            />
          ) : series.kind === "years" ? (
            <Years series={series} x={x} width={width} height={height} active={active} />
          ) : (
            <Bars series={series} x={x} width={width} height={height} active={active} />
          )}
        </svg>
      )}
    </div>
  );
}

interface Geometry {
  x: (slot: number) => number;
  width: number;
  height: number;
  active: number | null;
}

function Cumulative({
  series,
  x,
  width,
  height,
  active,
}: Geometry & { series: Extract<HeroSeries, { kind: "cumulative" }> }) {
  const max =
    Math.max(
      ...series.priorLine.map(num),
      ...series.line.map((point) => num(point.value)),
      1,
    ) * 1.06;
  const y = (value: number) => TOP + (1 - value / max) * (height - TOP - 2);
  const path = (values: { x: number; value: number }[]) =>
    values
      .map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join("");
  const prior = series.priorLine.map((value, i) => ({ x: i, value: num(value) }));
  const line = series.line.map((p) => ({ x: p.x, value: num(p.value) }));
  const end = line[line.length - 1];
  const point = active === null ? null : series.points[active];
  const priorEnd = prior[prior.length - 1];

  return (
    <>
      <line
        x1={x(0)}
        x2={x(12)}
        y1={y(0)}
        y2={y(0)}
        stroke="var(--border)"
        strokeWidth={1}
      />
      <path
        d={path(prior)}
        fill="none"
        stroke="var(--series-prior)"
        strokeWidth={1.75}
        strokeDasharray="1 5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {priorEnd.value > 0 && (
        <text
          x={width - INSET}
          y={y(priorEnd.value) - 9}
          textAnchor="end"
          fontSize={12}
          fill="var(--muted-foreground)"
        >
          {series.year - 1}
        </text>
      )}
      <path
        d={path(line)}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {point ? (
        <>
          <line
            x1={x(point.x)}
            x2={x(point.x)}
            y1={TOP - 8}
            y2={y(0)}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          {point.prior && (
            <circle
              cx={x(point.x)}
              cy={y(num(point.prior))}
              r={3.5}
              fill="var(--background)"
              stroke="var(--series-prior)"
              strokeWidth={1.75}
            />
          )}
          <circle
            cx={x(point.x)}
            cy={y(num(point.value))}
            r={5}
            fill="var(--foreground)"
            stroke="var(--background)"
            strokeWidth={2}
          />
        </>
      ) : (
        <circle
          cx={x(end.x)}
          cy={y(end.value)}
          r={4.5}
          fill="var(--foreground)"
          stroke="var(--background)"
          strokeWidth={2}
        />
      )}
    </>
  );
}

/** Mindestbreite je Jahresbeschriftung („2026" in 11 px samt Luft). */
const YEAR_TICK_WIDTH = 36;

function Years({
  series,
  x,
  height,
  active,
}: Geometry & { series: Extract<HeroSeries, { kind: "years" }> }) {
  const { bars, points } = series;
  const max = Math.max(...bars.map((bar) => num(bar.value)), 1) * 1.06;
  const y = (value: number) => TOP + (1 - value / max) * (height - TOP - 2);
  const coords = bars.map((bar, index) => ({
    x: x(index + 0.5),
    y: y(Math.max(0, num(bar.value))),
  }));
  const path = coords
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join("");
  // Passen nicht alle Jahre nebeneinander, steht jedes n-te — gezählt vom
  // letzten Jahr aus, damit das laufende Jahr immer beschriftet ist.
  const step = Math.max(1, Math.ceil(YEAR_TICK_WIDTH / (x(1) - x(0))));
  const last = bars.length - 1;
  const marked = active ?? last;
  const point = points[marked];
  const dot = coords[marked];

  return (
    <>
      <line
        x1={x(0)}
        x2={x(bars.length)}
        y1={y(0)}
        y2={y(0)}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {active !== null && (
        <line
          x1={x(point.x)}
          x2={x(point.x)}
          y1={TOP - 8}
          y2={y(0)}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={dot.x}
        cy={dot.y}
        r={active === null ? 4.5 : 5}
        fill="var(--foreground)"
        stroke="var(--background)"
        strokeWidth={2}
      />
      {bars.map((bar, index) => {
        const strong = index === marked;
        // Ein gewähltes Jahr zwischen zwei Beschriftungen verdrängt seine
        // Nachbarn, statt sie zu überdecken.
        if (!strong && ((last - index) % step !== 0 || Math.abs(index - marked) < step)) {
          return null;
        }
        return (
          <text
            key={bar.year}
            x={x(index + 0.5)}
            y={height + LABELS - 6}
            textAnchor="middle"
            fontSize={11}
            fontWeight={strong ? 700 : 500}
            fill={strong ? "var(--foreground)" : "var(--muted-foreground)"}
          >
            {bar.year}
          </text>
        );
      })}
    </>
  );
}

function Bars({
  series,
  x,
  height,
  active,
}: Geometry & { series: Extract<HeroSeries, { kind: "monthly" }> }) {
  const groups = series.months.map((bar) => ({
    key: String(bar.month),
    month: bar.month,
    tick: (MONTH_NAMES_DE_SHORT[bar.month - 1] ?? "").charAt(0),
    prior: bar.prior,
    current: bar.current,
  }));
  const slots = groups.length;
  const slotWidth = x(1) - x(0);
  const barWidth = Math.min(12, slotWidth * 0.3);
  const max =
    Math.max(
      ...groups.flatMap((g) => [num(g.prior), g.current ? num(g.current) : 0]),
      1,
    ) * 1.08;
  const y = (value: number) => 6 + (1 - value / max) * (height - 6);
  const activeKey =
    active === null
      ? null
      : (groups[Math.round((series.points[active]?.x ?? 0) - 0.5)]?.key ?? null);
  // Der aktuelle Monat steht in der Beschriftung kräftiger.
  const thisMonth = [...series.months]
    .reverse()
    .find((bar) => bar.current !== null)?.month;

  const rect = (left: number, value: number, fill: string) => {
    const top = y(Math.max(0, value));
    return (
      <rect
        x={left}
        y={top}
        width={barWidth}
        height={Math.max(0, y(0) - top)}
        rx={2}
        fill={fill}
      />
    );
  };

  return (
    <>
      <line
        x1={x(0)}
        x2={x(slots)}
        y1={y(0)}
        y2={y(0)}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {groups.map((group, index) => {
        const center = x(index + 0.5);
        const strong = group.month === thisMonth;
        return (
          <g
            key={group.key}
            className="transition-opacity motion-reduce:transition-none"
            opacity={activeKey === null || activeKey === group.key ? 1 : 0.3}
          >
            {rect(center - barWidth - 1.5, num(group.prior), "var(--series-prior)")}
            {group.current && rect(center + 1.5, num(group.current), "var(--foreground)")}
            <text
              x={center}
              y={height + LABELS - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={strong ? 700 : 500}
              fill={strong ? "var(--foreground)" : "var(--muted-foreground)"}
            >
              {group.tick}
            </text>
          </g>
        );
      })}
    </>
  );
}
