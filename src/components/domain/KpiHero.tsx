import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

export interface KpiStat {
  label: string;
  /** Bereits formatierter Wert (z. B. via AmountText) — keine Berechnung hier. */
  value: ReactNode;
  caption?: ReactNode;
  /** Drill-down; das ganze Feld ist dann die Tippfläche. */
  to?: string | undefined;
  /** Name des Drill-downs für Screenreader, sonst die Beschriftung. */
  drillLabel?: string | undefined;
}

const stretched = cn(
  "rounded-sm outline-none after:absolute after:inset-0",
  "focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
);

/**
 * Kennzahlkopf einer Seite (UX_AND_DESIGN_SYSTEM.md §2 `KpiHero`): **eine**
 * Hauptzahl groß, darunter bis zu drei Nebenkennzahlen in einer Leiste.
 *
 * Er ersetzt das Raster gleich großer Kacheln. Vier bis sechs Kacheln kosteten
 * auf dem Telefon 300 bis 700px, bevor der Inhalt der Seite begann — und
 * ließen offen, welche Zahl zählt. Hier trägt die Größe die Rangfolge: Jede
 * Seite beantwortet zuerst ihre eine Frage.
 *
 * Seit 1.7.0 ohne Kartenrahmen, in der Form des Kopfes der Übersicht: Zahl
 * 40px, darunter die Nebenkennzahlen auf einer gedämpften Fläche ohne
 * Trennlinien. Die Größe trägt die Rangfolge, nicht ein Rahmen.
 *
 * Reine Darstellung: Werte kommen fertig formatiert, gerechnet wird in den
 * Fachmodulen. Ein Drill-down macht die ganze Fläche zur Tippfläche (Link
 * auf dem Wert, per `::after` gedehnt) — für die Hauptzahl der obere Teil, für
 * jede Nebenkennzahl ihr Feld.
 */
export function KpiHero({
  label,
  value,
  trend,
  caption,
  to,
  drillLabel,
  footer,
  stats,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Vergleich neben der Hauptzahl ({@link TrendPill}). */
  trend?: ReactNode;
  caption?: ReactNode;
  to?: string | undefined;
  drillLabel?: string | undefined;
  /**
   * Zusatz unter der Hauptzahl, etwa der Zielfortschritt. Liegt über einem
   * gedehnten Drill-down und bleibt damit selbst bedienbar.
   */
  footer?: ReactNode;
  stats?: readonly KpiStat[];
  className?: string;
}) {
  const valueClass =
    "text-[2.5rem] font-bold leading-[1.05] tracking-[-0.035em] tabular-amount";

  return (
    <section className={cn("flex flex-col", className)}>
      <div className="relative space-y-2">
        <p className="text-[0.9375rem] font-medium text-muted-foreground">{label}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {to !== undefined ? (
            <Link
              to={to}
              aria-label={drillLabel}
              className={cn(valueClass, stretched, "after:rounded-sm")}
            >
              {value}
            </Link>
          ) : (
            <span className={valueClass}>{value}</span>
          )}
          {trend}
        </div>
        {caption !== undefined && (
          <p className="text-[0.9375rem] text-muted-foreground">{caption}</p>
        )}
        {footer !== undefined && <div className="relative z-10 pt-2">{footer}</div>}
      </div>
      {stats && stats.length > 0 && (
        <dl
          className={cn(
            "mt-5 grid gap-1 rounded-2xl bg-muted p-1.5",
            stats.length === 1
              ? "grid-cols-1"
              : stats.length === 2
                ? "grid-cols-2"
                : "grid-cols-3",
          )}
        >
          {stats.map((stat) => (
            // Erst die Beschriftung, dann der Wert — als `dt`/`dd`, damit
            // Sprachausgaben beides zusammen nennen.
            <div
              key={stat.label}
              className={cn(
                "relative flex min-w-0 flex-col rounded-xl px-2.5 py-2 sm:px-4 sm:py-3",
                stat.to !== undefined &&
                  "transition-colors hover:bg-accent motion-reduce:transition-none",
              )}
            >
              <dt className="truncate text-[0.8125rem] text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-0.5 truncate text-[1.0625rem] font-semibold tracking-[-0.01em] tabular-amount">
                {stat.to !== undefined ? (
                  <Link
                    to={stat.to}
                    aria-label={stat.drillLabel ?? stat.label}
                    className={stretched}
                  >
                    {stat.value}
                  </Link>
                ) : (
                  stat.value
                )}
              </dd>
              {stat.caption !== undefined && (
                <dd className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                  {stat.caption}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * Vergleich neben der Hauptzahl: Pfeil und Prozent in Grün bzw. Rot, ohne
 * Hintergrund (seit 1.7.0, wie im Kopf der Übersicht). Die Richtung steckt in Form
 * **und** Farbe (Pfeil, Vorzeichen im Text), nie in der Farbe allein
 * (UX_AND_DESIGN_SYSTEM.md §1). Wofür der Vergleich steht, sagt `title` —
 * für Sprachausgaben zusätzlich als versteckter Text.
 */
export function TrendPill({
  tone,
  children,
  title,
}: {
  tone: "positive" | "negative" | "neutral";
  children: ReactNode;
  title: string;
}) {
  const Icon = tone === "negative" ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 text-[0.9375rem] font-semibold tabular-amount",
        tone === "positive" && "text-positive",
        tone === "negative" && "text-negative",
        tone === "neutral" && "text-muted-foreground",
      )}
    >
      {tone !== "neutral" && <Icon className="size-4" aria-hidden strokeWidth={2.5} />}
      {children}
      <span className="sr-only"> {title}</span>
    </span>
  );
}

/**
 * Ladegerüst in der Form des Kennzahlkopfs: Sonst sprang die Seite, sobald
 * die Daten da waren, von einem Kachelraster auf einen Kopf um.
 */
export function KpiHeroSkeleton({ stats = 3 }: { stats?: 2 | 3 }) {
  return (
    <div className="flex flex-col" aria-hidden>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-10 w-52" />
      <Skeleton className="mt-3 h-4 w-40" />
      <div
        className={cn(
          "mt-5 grid gap-1 rounded-2xl bg-muted p-1.5",
          stats === 2 ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        {Array.from({ length: stats }).map((_, index) => (
          <div key={index} className="space-y-2 px-2.5 py-2 sm:px-4 sm:py-3">
            <Skeleton className="h-3 w-14 bg-background" />
            <Skeleton className="h-5 w-20 bg-background" />
          </div>
        ))}
      </div>
    </div>
  );
}
