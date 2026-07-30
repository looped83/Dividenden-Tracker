import { Link, NavLink } from "react-router";
import { Plus } from "lucide-react";
import { PRIMARY_NAV_ITEMS } from "@/app/navigation";
import { prefetchProps } from "@/app/routeChunks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * Desktop-Sidebar (>= lg, UX_AND_DESIGN_SYSTEM.md #4 "Mac / grosser Desktop"):
 * dauerhaft sichtbar, mit Beschriftung. Ab `md` (iPad) wird zusaetzlich eine
 * kompakte Icon-Variante gerendert (siehe CompactSidebar) — die adaptive
 * iPad-Sidebar (einklappbar, Overlay im Hochformat) wird in Phase 9 (PWA und
 * mobile Optimierung) vollstaendig ausgebaut.
 */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center px-6">
        <span className="text-base font-semibold">Dividend Tracker</span>
      </div>
      {/* Erfassen ist die haeufigste Aktion und steht deshalb — wie die
          hervorgehobene Schaltflaeche der Bottom-Navigation auf dem iPhone — in
          der Navigation statt im Kopf einzelner Seiten: eine Stelle, ueberall
          erreichbar. */}
      <div className="px-3 pb-3">
        <Button asChild className="w-full">
          {/* Der Bereich wird schon beim Zeigen geholt (routeChunks.ts). */}
          <Link to="/eingaenge/neu" {...prefetchProps("/eingaenge/neu")}>
            <Plus aria-hidden /> Neue Dividende
          </Link>
        </Button>
      </div>
      <nav aria-label="Hauptnavigation" className="flex-1 space-y-1 px-3">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            {...prefetchProps(item.to)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )
            }
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

/**
 * Kompakte, beschriftungslose Sidebar fuer iPad-Breiten (md..lg) —
 * adaptive Sidebar (UX_AND_DESIGN_SYSTEM.md #4 "iPad").
 */
export function CompactSidebar() {
  return (
    <aside className="hidden w-16 shrink-0 flex-col items-center border-r border-border bg-card py-4 md:flex lg:hidden">
      {/* Gegenstueck zur hervorgehobenen Erfassen-Aktion der Bottom-Navigation. */}
      <Button asChild size="icon" className="mb-3 rounded-full">
        <Link
          to="/eingaenge/neu"
          title="Neue Dividende"
          aria-label="Neue Dividende erfassen"
          {...prefetchProps("/eingaenge/neu")}
        >
          <Plus className="size-5" aria-hidden />
        </Link>
      </Button>
      <nav
        aria-label="Hauptnavigation"
        className="flex flex-1 flex-col items-center gap-1"
      >
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            title={item.label}
            aria-label={item.label}
            {...prefetchProps(item.to)}
            className={({ isActive }) =>
              cn(
                "flex size-11 items-center justify-center rounded-md outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )
            }
          >
            <item.icon className="size-5" aria-hidden />
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
