import * as React from "react";
import { Outlet } from "react-router";
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
      <ErrorBoundary>
        <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
          <Sidebar />
          <CompactSidebar />
          <main
            id="inhalt"
            tabIndex={-1}
            className="min-w-0 flex-1 overflow-x-hidden pb-20 outline-none md:pb-6"
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
