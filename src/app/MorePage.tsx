import { NavLink } from "react-router";
import { ChevronRight } from "lucide-react";
import { BOTTOM_NAV_MORE_ITEMS } from "@/app/navigation";

/**
 * "Mehr"-Uebersicht der iPhone Bottom Navigation (UX_AND_DESIGN_SYSTEM.md #4):
 * fasst die Bereiche zusammen, die auf dem iPhone nicht als eigener
 * Bottom-Nav-Slot Platz finden. Auf Desktop/iPad nicht verlinkt (dort sind
 * alle Bereiche direkt in der Sidebar erreichbar).
 */
export function MorePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Mehr</h1>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {BOTTOM_NAV_MORE_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className="flex min-h-11 items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
