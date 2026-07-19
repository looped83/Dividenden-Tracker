import { Outlet } from "react-router";
import { Sidebar, CompactSidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

/**
 * Responsive App-Shell (IMPLEMENTATION_PLAN.md Phase 1):
 * - Desktop (>= lg): dauerhafte Sidebar mit Beschriftung
 * - iPad (md..lg): kompakte Icon-Sidebar
 * - iPhone (< md): Bottom Navigation, Sidebar ausgeblendet
 */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
      <Sidebar />
      <CompactSidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden pb-20 md:pb-6">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
