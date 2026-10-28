import * as React from "react";
import { useNavigate } from "react-router";

/**
 * Macht eine Tabellenzeile zur Klickfläche für ihre Detailseite. Der Link in
 * der Zeile bleibt das Ziel für Tastatur und Sprachausgabe; der Klick auf den
 * Rest der Zeile führt per `navigate` dorthin.
 *
 * Bewusst kein über die Zeile gespannter Link (`after:absolute` mit
 * `relative` am `tr`): Safari macht eine Tabellenzeile nicht zum Bezugsrahmen,
 * das Pseudoelement deckte dort die ganze Tabelle samt Spaltenköpfen ab.
 */
export function useRowLink(): (
  to: string,
  state?: unknown,
) => (event: React.MouseEvent<HTMLElement>) => void {
  const navigate = useNavigate();
  return React.useCallback(
    (to, state) => (event) => {
      // Links und Knöpfe in der Zeile handeln selbst; markierter Text bleibt
      // markierbar.
      if ((event.target as Element).closest("a, button")) return;
      if (window.getSelection()?.toString()) return;
      void navigate(to, { state });
    },
    [navigate],
  );
}
