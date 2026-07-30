import * as React from "react";
import { Outlet, ScrollRestoration } from "react-router";
import { Sidebar, CompactSidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteAnnouncer } from "@/components/layout/RouteAnnouncer";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

/**
 * Responsive App-Shell (IMPLEMENTATION_PLAN.md Phase 1):
 * - Desktop (>= lg): dauerhafte Sidebar mit Beschriftung
 * - iPad (md..lg): kompakte Icon-Sidebar
 * - iPhone (< md): Bottom Navigation, Sidebar ausgeblendet
 */
export function AppShell() {
  return (
    <>
      {/* Sprungmarke (WCAG 2.4.1): erster Tabstopp, ueberspringt die Navigation. */}
      <a
        href="#inhalt"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      >
        Zum Inhalt springen
      </a>
      <RouteAnnouncer contentId="inhalt" />
      {/* Ohne dies behielt die Seite ihre Bildlaufposition ueber die
          Navigation hinweg: Wer weit unten in der Unternehmensliste eines
          anklickte, landete auf der Detailseite mitten im Inhalt.
          `getKey` auf den Pfad statt auf den Standardwert (die Id des
          Eintrags in der Chronik): Filter, Sortierung und Seitenzahl stehen
          in der Adresse: Jeder Filterklick waere sonst ein neuer Ort und
          risse die Liste nach oben. So zaehlt nur der Wechsel des Bereichs —
          und der Weg zurueck landet wieder dort, wo man aufgehoert hat. */}
      <ScrollRestoration getKey={(location) => location.pathname} />
      <ErrorBoundary>
        <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
          <Sidebar />
          <CompactSidebar />
          {/* Der untere Abstand traegt die Bottom-Navigation **plus** die
              sichere Flaeche des Geraets. Mit festem `pb-20` (5rem) lagen auf
              iPhones mit Home-Indikator die letzten Pixel der Seite unter der
              Leiste: Die Leiste ist rund 3,75rem hoch und waechst um
              `safe-area-inset-bottom`. */}
          <main
            id="inhalt"
            tabIndex={-1}
            className="min-w-0 flex-1 overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none md:pb-6"
          >
            <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
              {/* Bereiche werden erst beim Aufruf geladen (siehe router.tsx);
                  der Rahmen der App steht dabei bereits. */}
              <React.Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </React.Suspense>
            </div>
          </main>
          <BottomNav />
        </div>
      </ErrorBoundary>
    </>
  );
}
