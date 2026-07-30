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
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Suchen …",
  emptyMessage = "Kein Treffer",
  "aria-describedby": describedBy,
}: ComboboxProps) {
  const listId = `${id}-listbox`;
  const selected = React.useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
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

  // Aktive Zeile in Sicht halten (Tastaturbedienung bei langen Listen).
  React.useEffect(() => {
    if (!open) return;
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

  const openList = () => {
    setQuery("");
    setActiveIndex(
      Math.max(
        0,
        matches.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };

  const commit = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
    setQuery("");
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      openList();
      return;
    }
    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) =>
        matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length,
      );
    } else if (event.key === "Enter") {
      if (activeOption) {
        event.preventDefault();
        commit(activeOption);
      }
    } else if (event.key === "Escape") {
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
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeOption ? `${id}-option-${activeOption.value}` : undefined
        }
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => {
          if (!open) setOpen(true);
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onFocus={() => {
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
                    isActive && "bg-muted",
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
