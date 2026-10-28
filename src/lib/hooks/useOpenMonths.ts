import { useSearchParams } from "react-router";

/**
 * Welche Monate einer einklappbaren Liste offen sind — dieselbe Regel in der
 * Dividendenliste und im Kalender: Offen ist der aktuelle Monat, oder, solange
 * er fehlt, der naechstliegende (in absteigender Folge der juengste vergangene,
 * in aufsteigender der erste). Die Auswahl steht in der Adresse (`offen`), so
 * findet der Weg zurueck von einem Eintrag sie wieder.
 *
 * `keys` ist `null`, wenn die Liste gerade nicht einklappt: Dann ist alles
 * offen.
 */
export function useOpenMonths(keys: readonly string[] | null, currentMonth: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const openParam = searchParams.get("offen");
  const defaultOpen = keys?.find((key) => key <= currentMonth) ?? keys?.[0];
  const openMonths = new Set<string>(
    openParam !== null ? openParam.split(",") : defaultOpen ? [defaultOpen] : [],
  );
  const toggle = (key: string) => {
    const next = new Set(openMonths);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        // „-": alle zu — ein leerer Wert fiele aus der Adresse und oeffnete
        // wieder den aktuellen Monat.
        params.set("offen", next.size > 0 ? [...next].join(",") : "-");
        return params;
      },
      { replace: true },
    );
  };
  const isOpen = (key: string) => keys === null || openMonths.has(key);
  return { isOpen, toggle };
}
