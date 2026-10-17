import { Copy } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

/**
 * Eine Kennung (Ticker, ISIN, WKN), die ein Klick in die Zwischenablage legt —
 * etwa um sie bei der Bank oder einem Kursportal einzufuegen. Der Text bleibt
 * so stehen, wie er war; nur das kleine Kopiersymbol daneben und der Hover
 * zeigen, dass er antippbar ist. Die Bestaetigung kommt als Toast, wie nach
 * jeder anderen abgeschlossenen Aktion.
 */
export function CopyText({
  value,
  label,
  className,
}: {
  value: string;
  /** Wie die Kennung in Bestaetigung und Bildschirmleser heisst, z. B. „ISIN". */
  label: string;
  className?: string;
}) {
  const { notify } = useToast();

  async function copy() {
    // writeText laeuft noch synchron im Klick an — Safari verlangt das, sonst
    // fehlt ihm die Nutzergeste. Ohne Clipboard-API (nur in sicheren
    // Kontexten vorhanden) meldet der Toast den Fehler statt still nichts.
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} kopiert`);
    } catch {
      notify(`${label} konnte nicht kopiert werden`, "negative");
    }
  }

  return (
    <button
      type="button"
      title={`${label} kopieren`}
      aria-label={`${label} ${value} kopieren`}
      onClick={() => {
        void copy();
      }}
      className={cn(
        // Negativer Rand gleicht das Polster aus: Der Text steht exakt dort,
        // wo er ohne Schaltflaeche stuende, die Trefferflaeche ist trotzdem
        // etwas groesser als die Buchstaben.
        "-mx-1 inline-flex items-center gap-1 rounded px-1 text-inherit",
        "outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="whitespace-nowrap">{value}</span>
      <Copy className="size-3.5 shrink-0 opacity-50" aria-hidden />
    </button>
  );
}
