import * as React from "react";
import { useLocation } from "react-router";
import { areaNameFor } from "@/components/layout/areaNames";

/**
 * Sagt den Bereichswechsel an und holt den Fokus in den Inhalt.
 *
 * In einer Anwendung ohne Seitenwechsel merkt ein Screenreader von einer
 * Navigation nichts: Es gibt kein neues Dokument, das er ansagen koennte, und
 * der Fokus bleibt auf dem angeklickten Navigationspunkt — die naechste
 * Tabulatortaste fuehrt dann zurueck in die Navigation statt in den neuen
 * Inhalt. Beides wird hier nachgeholt.
 *
 * Der erste Aufruf sagt nichts an: Beim Laden der Seite liest der Screenreader
 * das Dokument ohnehin vor, eine zusaetzliche Meldung waere Doppelung.
 */
export function RouteAnnouncer({ contentId }: { contentId: string }) {
  const { pathname } = useLocation();
  const [message, setMessage] = React.useState("");
  const firstRender = React.useRef(true);

  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const name = areaNameFor(pathname);
    setMessage(name ?? "");

    // Der Inhaltsbereich traegt `tabIndex={-1}`; ohne dieses Setzen bliebe der
    // Fokus in der Navigation.
    const content = document.getElementById(contentId);
    content?.focus({ preventScroll: true });
  }, [pathname, contentId]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
