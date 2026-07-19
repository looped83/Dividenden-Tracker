import { Plus, MoreHorizontal } from "lucide-react";
import { NavLink } from "react-router";
import { BOTTOM_NAV_PRIMARY_ITEMS } from "@/app/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * iPhone Bottom Navigation (UX_AND_DESIGN_SYSTEM.md #4): fuenf Slots,
 * zentrale hervorgehobene Erfassen-Aktion, "Mehr" fasst die restlichen
 * Bereiche zusammen. Beruecksichtigt Safe-Area-Insets fuer den
 * Home-Indicator. Sichtbar unterhalb der `md`-Breite (< 768px).
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Hauptnavigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around",
        "border-t border-border bg-card md:hidden",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {BOTTOM_NAV_PRIMARY_ITEMS.slice(0, 2).map((item) => (
        <BottomNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
      ))}

      <NavLink
        to="/eingaenge/neu"
        aria-label="Neuen Dividendeneingang erfassen"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plus className="size-5" aria-hidden />
        </span>
      </NavLink>

      {BOTTOM_NAV_PRIMARY_ITEMS.slice(2).map((item) => (
        <BottomNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
      ))}

      <NavLink
        to="/mehr"
        className={({ isActive }) =>
          cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring",
            isActive ? "text-primary" : "text-muted-foreground",
          )
        }
      >
        <MoreHorizontal className="size-5" aria-hidden />
        Mehr
      </NavLink>
    </nav>
  );
}

function BottomNavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: (typeof BOTTOM_NAV_PRIMARY_ITEMS)[number]["icon"];
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          isActive ? "text-primary" : "text-muted-foreground",
        )
      }
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </NavLink>
  );
}
