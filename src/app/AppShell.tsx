import * as React from "react";
import {
  NavigationType,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigationType,
  type ScrollRestorationProps,
} from "react-router";
import { Sidebar, CompactSidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { AreaErrorBoundary, ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteAnnouncer } from "@/components/layout/RouteAnnouncer";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { PaymentComposerProvider } from "@/features/payments/PaymentComposer";
import { RequireAuth } from "@/app/auth/RequireAuth";

/** Schluessel der Bildlaufposition: Detailseite je Besuch, Bereich je Pfad. */
const scrollKey: NonNullable<ScrollRestorationProps["getKey"]> = (location, matches) =>
  matches.some((match) => Object.keys(match.params).length > 0)
    ? location.key
    : location.pathname;

/**
 * Wer einen Bereich neu aufruft (Menue, Link, Reiter), beginnt oben — auch
 * wenn er ihn vorher weiter unten verlassen hatte. Der Pfad als Schluessel von
 * `ScrollRestoration` stellte sonst die alte Position wieder her. Nur der Weg
 * zurueck oder vor (POP) nimmt sie wieder ein. Laeuft nach
 * `ScrollRestoration`, weil Geschwister-Effekte der Reihe nach laufen.
 */
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previous = React.useRef(pathname);
  React.useLayoutEffect(() => {
    if (previous.current !== pathname && navigationType !== NavigationType.Pop)
      window.scrollTo(0, 0);
    previous.current = pathname;
  }, [pathname, navigationType]);
  return null;
}

/**
 * Responsive App-Shell (IMPLEMENTATION_PLAN.md Phase 1):
 * - Desktop (>= lg): dauerhafte Sidebar mit Beschriftung
 * - iPad (md..lg): kompakte Icon-Sidebar
 * - iPhone (< md): Bottom Navigation, Sidebar ausgeblendet
 */
/** Bereiche, deren Auftritt in dieser Sitzung schon gespielt hat. */
const introduced = new Set<string>();

/**
 * So lange nach dem Aufruf darf Erscheinendes sich bewegen: Reicht fuer
 * nachgeladene Daten, endet aber, bevor jemand mit der Seite arbeitet.
 */
const INTRO_MS = 2500;

/**
 * Markiert den ersten Aufruf eines Bereichs in der Sitzung mit `data-intro`
 * (Bewegung in index.css, seit 2.44.0). Als erledigt zaehlt er erst nach
 * Ablauf der Zeit — wer sofort weiterwechselt, sieht ihn beim naechsten Mal.
 * Ohne Zustand, damit der Wechsel nichts neu zeichnet.
 */
function useIntro(pathname: string) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element || introduced.has(pathname)) return;
    element.setAttribute("data-intro", "");
    const timer = window.setTimeout(() => {
      element.removeAttribute("data-intro");
      introduced.add(pathname);
    }, INTRO_MS);
    return () => {
      window.clearTimeout(timer);
      element.removeAttribute("data-intro");
    };
  }, [pathname]);
  return ref;
}

/**
 * Inhalt des Bereichs mit eigener Fehlergrenze. Liest den Pfad selbst, damit
 * nicht die ganze Huelle bei jedem Wechsel neu zeichnet.
 */
function AreaContent() {
  const { pathname } = useLocation();
  const intro = useIntro(pathname);
  return (
    // `contents`: traegt nur die Markierung, das Layout sieht ihn nicht.
    <div ref={intro} className="contents">
      <AreaErrorBoundary resetKey={pathname}>
        <React.Suspense fallback={<PageSkeleton />}>
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        </React.Suspense>
      </AreaErrorBoundary>
    </div>
  );
}

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
          und der Weg zurueck landet wieder dort, wo man aufgehoert hat;
          ein neuer Aufruf des Bereichs beginnt oben (ScrollToTopOnNavigate).
          Detailseiten (Routen mit `:id`) dagegen nach dem Chronikeintrag:
          Mit dem Pfad als Schluessel oeffnete ein schon einmal besuchtes
          Asset dort, wo man es zuletzt verlassen hatte, statt oben. */}
      <ScrollRestoration getKey={scrollKey} />
      <ScrollToTopOnNavigate />
      <ErrorBoundary>
        <PaymentComposerProvider>
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
              {/* Im dunklen Design laeuft die Seite in der Home-Bildschirm-App
                unter die Statusleiste (index.html). iOS 27 legt darunter einen
                Verlauf mit Unschaerfe, rund 40 px tief, den keine Einstellung
                abschaltet: Der Seitenkopf beginnt deshalb erst darunter. Ohne
                sichere Flaeche (Browser, helles Design) gilt der feste Abstand. */}
              <div className="mx-auto max-w-6xl px-4 pt-[max(1rem,calc(env(safe-area-inset-top)+39px))] pb-6 sm:px-6 sm:pt-[max(1.5rem,calc(env(safe-area-inset-top)+39px))] lg:px-8">
                {/* Bereiche werden erst beim Aufruf geladen (siehe router.tsx);
                  der Rahmen der App steht dabei bereits. Dasselbe gilt fuer die
                  Anmeldepruefung: Erst sie gibt den Inhalt frei, die
                  Navigation zeigt keine Daten und steht vorher. */}
                <AreaContent />
              </div>
            </main>
            <BottomNav />
          </div>
        </PaymentComposerProvider>
      </ErrorBoundary>
    </>
  );
}
