import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
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
    "text-[2rem] font-semibold leading-none tracking-tight tabular-amount";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="relative space-y-2 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {to !== undefined ? (
            <Link
              to={to}
              aria-label={drillLabel}
              className={cn(valueClass, stretched, "after:rounded-t-lg")}
            >
              {value}
            </Link>
          ) : (
            <span className={valueClass}>{value}</span>
          )}
          {trend}
        </div>
        {caption !== undefined && (
          <p className="text-sm text-muted-foreground">{caption}</p>
        )}
        {footer !== undefined && <div className="relative z-10 pt-2">{footer}</div>}
      </div>
      {stats && stats.length > 0 && (
        <dl
          className={cn(
            "grid divide-x divide-border border-t border-border",
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
                "relative flex min-w-0 flex-col px-3 py-3 first:pl-4 sm:px-6 sm:first:pl-6",
                stat.to !== undefined &&
                  "transition-colors hover:bg-accent/50 active:bg-accent motion-reduce:transition-none",
              )}
            >
              <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 truncate text-base font-semibold tabular-amount">
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
                <dd className="mt-0.5 truncate text-xs text-muted-foreground">
                  {stat.caption}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

/**
 * Vergleich als kleine Marke neben der Hauptzahl. Die Richtung steckt in Form
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
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm font-medium tabular-amount",
        tone === "positive" && "bg-positive-surface text-positive",
        tone === "negative" && "bg-negative-surface text-negative",
        tone === "neutral" && "bg-muted text-muted-foreground",
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
    <Card className="overflow-hidden" aria-hidden>
      <div className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div
        className={cn(
          "grid divide-x divide-border border-t border-border",
          stats === 2 ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        {Array.from({ length: stats }).map((_, index) => (
          <div
            key={index}
            className="space-y-2 px-3 py-3 first:pl-4 sm:px-6 sm:first:pl-6"
          >
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}
