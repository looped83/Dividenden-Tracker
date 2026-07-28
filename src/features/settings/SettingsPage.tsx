import { NavLink, Outlet } from "react-router";
import { SETTINGS_TABS } from "@/app/navigation";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * Rahmen der Einstellungen mit Unterbereichs-Navigation, analog zum
 * Statistikbereich. Depots, Importe und Datensicherung sind hierher
 * verschoben — Verwaltungsaufgaben, die die Hauptnavigation nicht taeglich
 * braucht. Ihre alten Pfade leiten dauerhaft hierher um (router.tsx).
 */
export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Einstellungen" />

      <nav aria-label="Einstellungsbereiche" className="border-b border-border">
        <ul className="-mb-px flex flex-wrap gap-1">
          {SETTINGS_TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end ?? false}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
}
