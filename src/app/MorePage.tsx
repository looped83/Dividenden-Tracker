import { NavLink } from "react-router";
import { BOTTOM_NAV_MORE_ITEMS, type NavItem } from "@/app/navigation";
import { prefetchProps } from "@/app/routeChunks";
import { PageHeader } from "@/components/layout/PageHeader";
import { ListGroup, ListItemBody, ListRow } from "@/components/ui/list";

/**
 * Gruppen wie in der Seitenleiste (groupStart), Einstellungen fuer sich
 * (footer). Einmal beim Laden des Moduls, die Liste ist fest.
 */
const GROUPS: readonly (readonly NavItem[])[] = BOTTOM_NAV_MORE_ITEMS.reduce<NavItem[][]>(
  (groups, item) => {
    const last = groups.at(-1);
    if (!last || item.groupStart || item.footer) groups.push([item]);
    else last.push(item);
    return groups;
  },
  [],
);

/**
 * "Mehr"-Uebersicht der iPhone Bottom Navigation (UX_AND_DESIGN_SYSTEM.md #4):
 * fasst die Bereiche zusammen, die auf dem iPhone nicht als eigener
 * Bottom-Nav-Slot Platz finden. Auf Desktop/iPad nicht verlinkt (dort sind
 * alle Bereiche direkt in der Sidebar erreichbar).
 *
 * **Gruppierte Liste statt Kacheln (seit 2.28.0).** Die Kacheln trugen je eine
 * Unterzeile und brauchten dafuer drei hohe Reihen. Jetzt steht jeder Bereich
 * in einer Zeile mit Symbol, Name und Pfeil (`ListRow` mit `chevron`, wie
 * einzelne Navigationszeilen), gruppiert nach denselben Themen wie die
 * Seitenleiste: Kalender · Bestand und
 * Planer · Ziele und Fortschritt · Einstellungen. Die gedaempfte Flaeche ohne
 * Rahmen bleibt, wie bei den Kennzahlen der Uebersicht.
 */
export function MorePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Mehr" />
      <nav aria-label="Weitere Bereiche" className="max-w-xl space-y-4">
        {GROUPS.map((group) => (
          // Die Listenform der App (ListGroup/ListRow) auf gedaempfter Flaeche:
          // gleiche Trennlinien, Tippflaeche und Schrift wie in jeder Liste.
          <ListGroup
            key={group[0]?.to}
            className="mx-0 overflow-hidden rounded-2xl bg-muted"
          >
            {group.map((item) => (
              <li key={item.to}>
                <ListRow asChild className="rounded-none">
                  <NavLink to={item.to} {...prefetchProps(item.to)}>
                    <ListItemBody
                      leading={
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-foreground dark:bg-accent">
                          <item.icon className="size-5" aria-hidden />
                        </span>
                      }
                      title={item.label}
                      chevron
                    />
                  </NavLink>
                </ListRow>
              </li>
            ))}
          </ListGroup>
        ))}
      </nav>
    </div>
  );
}
