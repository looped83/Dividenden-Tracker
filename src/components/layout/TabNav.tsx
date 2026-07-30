import * as React from "react";
import { NavLink, useLocation } from "react-router";
import { prefetchProps } from "@/app/routeChunks";
import { cn } from "@/lib/utils/cn";

export interface TabNavItem {
  to: string;
  label: string;
  /** Nur bei exakter Pfadgleichheit aktiv (Elternpfad eines Unterbereichs). */
  end?: boolean;
}

/**
 * Navigation der Unterbereiche (Statistik, Einstellungen).
 *
 * Immer eine Zeile: Passen die Reiter nicht nebeneinander, laesst sich die
 * Zeile seitlich schieben. Ein Umbruch verlaengerte den Seitenkopf auf schmalen
 * Geraeten um eine ganze Zeile und stellte Reiter in eine zweite Reihe, die
 * dort wie eine untergeordnete Ebene wirkte. Der aktive Reiter rueckt beim
 * Wechsel in Sicht — sonst faende ihn nach einem Direktlink niemand.
 */
export function TabNav({ label, tabs }: { label: string; tabs: readonly TabNavItem[] }) {
  const listRef = React.useRef<HTMLUListElement>(null);
  const { pathname } = useLocation();

  React.useEffect(() => {
    // NavLink kennzeichnet den aktiven Eintrag mit aria-current="page".
    listRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label={label} className="border-b border-border">
      <ul
        ref={listRef}
        className={cn(
          "-mb-px flex gap-1 overflow-x-auto overscroll-x-contain",
          // Der Bereich reicht auf schmalen Geraeten bis an den Bildschirmrand
          // (Innenabstand der Seite als Polster im Inneren). Sonst endete er
          // am Textrand, und der naechste Reiter waere je nach Breite gar
          // nicht mehr angeschnitten — dass es weitergeht, waere unsichtbar.
          "-mx-4 px-4 sm:mx-0 sm:px-0",
          // Ohne Bildlaufleiste: Sie laege auf der Trennlinie und verdoppelte
          // sie. Dass es weitergeht, zeigt der angeschnittene naechste Reiter.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {tabs.map((tab) => (
          <li key={tab.to} className="shrink-0">
            <NavLink
              to={tab.to}
              end={tab.end ?? false}
              {...prefetchProps(tab.to)}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center whitespace-nowrap rounded-t-md border-b-2 px-3 py-2",
                  "pointer-coarse:min-h-11 text-sm font-medium outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring",
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
  );
}
