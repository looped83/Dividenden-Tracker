import { NavLink } from "react-router";
import { BOTTOM_NAV_MORE_ITEMS } from "@/app/navigation";
import { prefetchProps } from "@/app/routeChunks";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * "Mehr"-Uebersicht der iPhone Bottom Navigation (UX_AND_DESIGN_SYSTEM.md #4):
 * fasst die Bereiche zusammen, die auf dem iPhone nicht als eigener
 * Bottom-Nav-Slot Platz finden. Auf Desktop/iPad nicht verlinkt (dort sind
 * alle Bereiche direkt in der Sidebar erreichbar).
 *
 * **Kacheln statt Listenzeilen.** Zuvor standen hier vier schmale Zeilen mit
 * grauem Symbol und Pfeil — auf dem Geraet, auf dem dieser Bildschirm die
 * halbe App erschliesst, die unauffaelligste Flaeche ueberhaupt. Jede Kachel
 * traegt jetzt ihr Symbol in der Akzentfarbe und einen Satzteil, der sagt,
 * was der Bereich beantwortet; angetippt wird die ganze Kachel statt einer
 * 44px hohen Zeile. Zwei Spalten, weil die vier Bereiche so ohne Blaettern in
 * einen Blick passen. Optik und Verhalten wie die Terminkacheln des Kalenders
 * — dieselbe Sache soll ueberall gleich aussehen.
 */
export function MorePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Mehr" />
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {BOTTOM_NAV_MORE_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              {...prefetchProps(item.to)}
              className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 outline-none transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <item.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
