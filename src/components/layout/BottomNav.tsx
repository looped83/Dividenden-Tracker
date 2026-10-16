import { Plus, MoreHorizontal } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { BOTTOM_NAV_MORE_ITEMS, BOTTOM_NAV_PRIMARY_ITEMS } from "@/app/navigation";
import { prefetchProps } from "@/app/routeChunks";
import { usePaymentComposer } from "@/features/payments/PaymentComposer";
import { cn } from "@/lib/utils/cn";

const ACTIVE = "font-semibold text-foreground";
const INACTIVE = "text-muted-foreground";

/**
 * iPhone Bottom Navigation (UX_AND_DESIGN_SYSTEM.md #4): fuenf Slots,
 * zentrale Erfassen-Aktion, "Mehr" fasst die restlichen Bereiche zusammen.
 * Beruecksichtigt Safe-Area-Insets fuer den Home-Indicator. Sichtbar
 * unterhalb der `md`-Breite (< 768px).
 *
 * **Erfassen sitzt in der Leiste, nicht darueber.** Der frueher 32px
 * herausragende Knopf verdeckte beim Scrollen Inhalt. Hervorgehoben bleibt
 * er durch Form und Farbe: der einzige gefuellte Kreis, in der Akzentfarbe Orange.
 *
 * **Aktiv heisst Vordergrund und Gewicht, nicht Orange.** Orange markiert in der
 * App, was eine Aktion ausloest; der aktive Bereich ist ein Ort. Die Leiste
 * ist leicht durchscheinend, damit beim Scrollen sichtbar bleibt, dass die
 * Seite darunter weitergeht.
 *
 * **Erfassen oeffnet einen Dialog, keine Seite.** Das Formular liegt mittig
 * ueber der aktuellen Seite; nach dem Speichern oder Abbrechen steht man wieder
 * genau dort, wo man war (siehe `PaymentComposerProvider`).
 */
export function BottomNav() {
  // „Mehr" steht fuer alle Bereiche dahinter: In Kalender, Depot, Zielen oder
  // Einstellungen war zuvor kein Eintrag markiert, und man verlor die
  // Orientierung, wo man sich befindet.
  const { pathname } = useLocation();
  const inMoreArea = BOTTOM_NAV_MORE_ITEMS.some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  const newPayment = usePaymentComposer();

  return (
    <nav
      aria-label="Hauptnavigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around",
        "border-t border-border bg-card/90 backdrop-blur-xl md:hidden",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {BOTTOM_NAV_PRIMARY_ITEMS.slice(0, 2).map((item) => (
        <BottomNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
      ))}

      <button
        type="button"
        aria-label="Neue Dividende erfassen"
        aria-haspopup="dialog"
        {...newPayment}
        className="group flex flex-1 items-center justify-center py-2 outline-none"
      >
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground",
            "transition-colors group-hover:bg-primary/90 motion-reduce:transition-none",
            "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 ring-offset-card",
          )}
        >
          <Plus className="size-6" aria-hidden strokeWidth={2.25} />
        </span>
      </button>

      {BOTTOM_NAV_PRIMARY_ITEMS.slice(2).map((item) => (
        <BottomNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
      ))}

      <NavLink
        to="/mehr"
        {...prefetchProps("/mehr")}
        className={({ isActive }) =>
          cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring",
            isActive || inMoreArea ? ACTIVE : INACTIVE,
          )
        }
      >
        <MoreHorizontal className="size-6" aria-hidden />
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
      {...prefetchProps(to)}
      className={({ isActive }) =>
        cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          isActive ? ACTIVE : INACTIVE,
        )
      }
    >
      <Icon className="size-6" aria-hidden />
      {label}
    </NavLink>
  );
}
