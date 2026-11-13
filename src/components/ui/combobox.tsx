import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ComboboxOption {
  value: string;
  /** Angezeigter Text; zugleich Grundlage der Suche. */
  label: string;
  /** Optionaler Zusatz (z. B. Ticker), wird mitdurchsucht. */
  hint?: string | undefined;
}

interface ComboboxProps {
  id: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  /** Beim Einhaengen fokussieren — ohne den Text zu markieren. */
  autoFocus?: boolean;
  "aria-describedby"?: string;
}

/** Normalisiert fuer die Suche: Gross-/Kleinschreibung und Akzente egal. */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Suchfeld mit Vorschlagsliste (ARIA-1.2-Combobox-Muster). Ersetzt eine
 * Auswahlliste dort, wo viele Eintraege zur Wahl stehen: tippen filtert,
 * statt zu scrollen.
 *
 * Bewusst ohne zusaetzliche Abhaengigkeit und ohne Portal — die Liste ist
 * ein Kind des Feldes (`relative`), damit sie weder aus dem Container
 * herauslaeuft noch das Dokument verbreitert.
 *
 * **Die Liste oeffnet nur auf ausdrueckliche Absicht** — Antippen, Tippen,
 * Pfeil-nach-unten —, nicht schon beim Fokussieren: Als erstes Feld eines
 * Formulars verdeckte sie sonst alles darunter, sobald der Fokus sie streifte.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Suchen …",
  emptyMessage = "Kein Treffer",
  autoFocus,
  "aria-describedby": describedBy,
}: ComboboxProps) {
  const listId = `${id}-listbox`;
  const selected = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // -1 = keine Zeile markiert. Beim Tippen bleibt das so, damit der erste
  // Pfeil nach unten den **ersten** Vorschlag markiert — nicht den zweiten.
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Solange geschlossen, zeigt das Feld die getroffene Auswahl; erst beim
  // Tippen wird daraus die Suchanfrage.
  const inputValue = open ? query : (selected?.label ?? "");

  const matches = React.useMemo(() => {
    const needle = fold(query.trim());
    if (!open || needle === "") return options;
    return options.filter((option) =>
      fold(`${option.label} ${option.hint ?? ""}`).includes(needle),
    );
  }, [open, options, query]);

  // Bereichsgeprueft: activeIndex kann nach dem Filtern hinter das Ende zeigen.
  const activeOption =
    activeIndex >= 0 && activeIndex < matches.length ? matches[activeIndex] : undefined;

  // Beim Aufklappen die ganze Liste in Sicht holen: Steht das Feld weit unten
  // (oder ueber der Bildschirmtastatur), laege sie sonst ausserhalb.
  React.useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  // Aktive Zeile in Sicht halten (Tastaturbedienung bei langen Listen).
  React.useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Klick ausserhalb schliesst und verwirft die Sucheingabe.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Beim Aufklappen steht die Markierung auf der getroffenen Auswahl (sonst
  // auf keiner Zeile). Per Pfeil geoeffnet, auf der ersten Zeile — damit
  // Enter danach sofort uebernimmt.
  const openList = (markFirst = false) => {
    const selectedIndex = options.findIndex((o) => o.value === value);
    setQuery("");
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : markFirst ? 0 : -1);
    setOpen(true);
  };

  // Fokus zurueck ins Feld **vor** `onChange`: So darf der Aufrufer den Fokus
  // gleich weiterreichen (etwa ans naechste Feld), ohne dass er hier wieder
  // eingefangen wird.
  const commit = (option: ComboboxOption) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.focus();
    onChange(option.value);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      openList(true);
      return;
    }
    if (!open) return;

    // Von „keine Zeile" (-1) aus fuehrt Pfeil nach unten zur ersten, Pfeil
    // nach oben zur letzten Zeile; an den Enden geht es rundherum.
    const count = matches.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (count === 0 ? -1 : (i + 1) % count));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (count === 0 ? -1 : i <= 0 ? count - 1 : i - 1));
    } else if (event.key === "Enter") {
      // Ohne Markierung uebernimmt Enter den ersten Treffer einer Suche —
      // wer „rea" tippt und Enter drueckt, meint Realty Income.
      const option = activeOption ?? (query.trim() !== "" ? matches[0] : undefined);
      // Nie das Formular abschicken, solange die Liste offen ist.
      event.preventDefault();
      if (option) commit(option);
    } else if (event.key === "Escape") {
      // Nur die Liste schliessen, nicht den umgebenden Dialog (siehe
      // ui/dialog.tsx, onEscapeKeyDown).
      event.preventDefault();
      setOpen(false);
      setQuery("");
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        id={id}
        type="text"
        // Ausdruecklich, nicht implizit: iOS behaelt sonst die Tastatur des
        // zuvor fokussierten Feldes bei — aus dem Betragsfeld heraus stand im
        // Suchfeld der Zahlenblock (siehe ui/input.tsx).
        inputMode="text"
        // Keine Vorschlaege der Tastatur: Gesucht wird ein Asset, kein Kontakt
        // und kein Wort. `autoComplete="off"` allein uebergeht iOS — es bot
        // ueber der Tastatur Kontakte an. Abgeschaltet werden deshalb auch
        // Autokorrektur, Grossschreibung und Rechtschreibpruefung; das
        // Wort „Name" bleibt aus Platzhalter und Beschriftung, weil Safari
        // ein Feld daran als Namensfeld erkennt.
        role="combobox"
        name={`${id}-search`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        data-1p-ignore
        data-lpignore="true"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeOption ? `${id}-option-${activeOption.value}` : undefined
        }
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => {
          if (!open) setOpen(true);
          setQuery(event.target.value);
          setActiveIndex(-1);
        }}
        // Bewusst **nicht** `onFocus`: Fokus allein ist keine Absicht. Wer das
        // Formular betritt oder mit der Tabulatortaste durchgeht, stand sonst
        // sofort vor einer aufgeklappten Liste, die den Rest des Formulars
        // verdeckte. Geoeffnet wird durch Antippen des Feldes, durch Tippen und
        // durch Pfeil-nach-unten (siehe onKeyDown).
        //
        // Und bewusst `onClick` statt `onPointerDown`: iOS liest den
        // `inputmode` **nur** in dem Moment, in dem der Fokus gesetzt wird.
        // `pointerdown` faellt dort schon beim Beruehren an — also vor dem
        // Fokus. Das Aufklappen der Liste aenderte damit den Baum mitten in
        // der Fokusvergabe, und iOS behielt die Tastatur des vorherigen
        // Feldes: Aus dem Betragsfeld heraus stand beim ersten Antippen der
        // Zahlenblock, erst das zweite (das nichts mehr aendert) brachte die
        // Buchstaben. `click` faellt nach dem Fokus an — die Liste geht auf,
        // wenn die Tastatur bereits feststeht.
        onClick={() => {
          if (!open) openList();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          // 16 px auf schmalen Geraeten — sonst zoomt iOS Safari beim Fokussieren.
          "flex h-11 w-full rounded-md border border-input bg-background py-2 pl-9 pr-9",
          "text-base sm:text-sm",
          "placeholder:text-muted-foreground outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          // Auswahl per Zeigegeraet darf das Feld nicht vorher unfokussieren.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          className={cn(
            "absolute z-50 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain",
            "rounded-md border border-border bg-card py-1 shadow-md",
          )}
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-base text-muted-foreground sm:text-sm">
              {emptyMessage}
            </li>
          ) : (
            matches.map((option, index) => {
              const isActive = index === activeIndex;
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${id}-option-${option.value}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    commit(option);
                  }}
                  onPointerMove={() => {
                    setActiveIndex(index);
                  }}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-base sm:text-sm",
                    // `accent` statt `muted`: Im Dunkelmodus war die
                    // markierte Zeile vom Listenhintergrund kaum zu trennen.
                    isActive && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check
                    className={cn("size-4 shrink-0", !isSelected && "opacity-0")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
