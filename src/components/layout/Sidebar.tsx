import { Fragment } from "react";
import { NavLink } from "react-router";
import { Plus } from "lucide-react";
import { PRIMARY_NAV_ITEMS, type NavItem } from "@/app/navigation";
import { prefetchProps } from "@/app/routeChunks";
import { Button } from "@/components/ui/button";
import { usePaymentComposer } from "@/features/payments/PaymentComposer";
import { cn } from "@/lib/utils/cn";

/**
 * Desktop-Sidebar (>= lg, UX_AND_DESIGN_SYSTEM.md #4 "Mac / grosser Desktop"):
 * dauerhaft sichtbar, mit Beschriftung. Ab `md` (iPad) wird zusaetzlich eine
 * kompakte Icon-Variante gerendert (siehe CompactSidebar) — die adaptive
 * iPad-Sidebar (einklappbar, Overlay im Hochformat) wird in Phase 9 (PWA und
 * mobile Optimierung) vollstaendig ausgebaut.
 */
export function Sidebar() {
  const newPayment = usePaymentComposer();
  return (
    // Fix am linken Rand: klebt in Viewport-Höhe, nur der Inhalt rechts
    // scrollt. Ohne das richtete sich der Fuß (Einstellungen) nach der Höhe
    // des Inhalts und lag auf dem iPad unterhalb des Sichtbereichs.
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center px-6">
        <span className="text-base font-semibold">Dividenden-Tracker</span>
      </div>
      {/* Erfassen ist die haeufigste Aktion und steht deshalb — wie die
          hervorgehobene Schaltflaeche der Bottom-Navigation auf dem iPhone — in
          der Navigation statt im Kopf einzelner Seiten: eine Stelle, ueberall
          erreichbar. Auf dieser Breite oeffnet sie ein Overlay ueber der
          aktuellen Seite, statt sie zu verlassen. */}
      <div className="px-3 pb-3">
        <Button className="w-full rounded-full" {...newPayment}>
          <Plus aria-hidden /> Neue Dividende
        </Button>
      </div>
      <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col gap-1 px-3 pb-3">
        {LIST_ITEMS.map((item) => (
          <Fragment key={item.to}>
            {item.groupStart && <div aria-hidden className="mx-3 my-2 h-px bg-border" />}
            <SidebarLink item={item} />
          </Fragment>
        ))}
        {/* Einstellungen am Fuß: Verwaltung, kein täglicher Arbeitsbereich (seit 2.27.0). */}
        <div className="mt-auto border-t border-border pt-3">
          {FOOTER_ITEMS.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

const LIST_ITEMS = PRIMARY_NAV_ITEMS.filter((item) => !item.footer);
const FOOTER_ITEMS = PRIMARY_NAV_ITEMS.filter((item) => item.footer);

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      {...prefetchProps(item.to)}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "bg-accent font-semibold text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )
      }
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </NavLink>
  );
}

/**
 * Kompakte, beschriftungslose Sidebar fuer iPad-Breiten (md..lg) —
 * adaptive Sidebar (UX_AND_DESIGN_SYSTEM.md #4 "iPad").
 */
export function CompactSidebar() {
  const newPayment = usePaymentComposer();
  return (
    // Fix wie die große Sidebar (siehe dort).
    <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center overflow-y-auto border-r border-border bg-card pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:flex lg:hidden">
      {/* Gegenstueck zur hervorgehobenen Erfassen-Aktion der Bottom-Navigation. */}
      <Button
        size="icon"
        className="mb-3 rounded-full"
        title="Neue Dividende"
        aria-label="Neue Dividende erfassen"
        {...newPayment}
      >
        <Plus className="size-5" aria-hidden />
      </Button>
      <nav
        aria-label="Hauptnavigation"
        className="flex flex-1 flex-col items-center gap-1"
      >
        {LIST_ITEMS.map((item) => (
          <Fragment key={item.to}>
            {item.groupStart && <div aria-hidden className="my-1 h-px w-8 bg-border" />}
            <CompactLink item={item} />
          </Fragment>
        ))}
        <div className="mt-auto flex flex-col items-center gap-1">
          <div aria-hidden className="my-1 h-px w-8 bg-border" />
          {FOOTER_ITEMS.map((item) => (
            <CompactLink key={item.to} item={item} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

function CompactLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      title={item.label}
      aria-label={item.label}
      {...prefetchProps(item.to)}
      className={({ isActive }) =>
        cn(
          "flex size-11 items-center justify-center rounded-xl outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "bg-accent font-semibold text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )
      }
    >
      <item.icon className="size-5" aria-hidden />
    </NavLink>
  );
}
