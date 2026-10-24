import { useSearchParams } from "react-router";

/**
 * Welche Abschnitte einer einklappbaren Liste offen sind, wenn anfangs alles
 * zu ist (Fixkosten, Rangbalken, Monatslücken). Die Auswahl steht in der
 * Adresse (`param`, je Abschnitt ein Wert), so findet der Weg zurück von einer
 * Detailseite sie wieder — im React-Zustand ging sie beim Verlassen verloren.
 * `replace`: Auf- und Zuklappen legt keinen Eintrag im Verlauf an.
 */
export function useOpenKeys(param: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const open = searchParams.getAll(param);
  const isOpen = (key: string) => open.includes(key);
  const setOpen = (key: string, value: boolean) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        const next = params.getAll(param).filter((entry) => entry !== key);
        if (value) next.push(key);
        params.delete(param);
        for (const entry of next) params.append(param, entry);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  };
  const toggle = (key: string) => {
    setOpen(key, !isOpen(key));
  };
  return { isOpen, setOpen, toggle };
}
