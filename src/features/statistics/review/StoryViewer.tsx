import * as React from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export interface StorySlide {
  id: string;
  /** Kurzname fuer die Ansage an Hilfsmittel („Seite 3 von 9: Rekordmonat"). */
  label: string;
  content: React.ReactNode;
  /** Standzeit in Millisekunden, bevor die Story von allein weiterblaettert. */
  duration?: number;
}

/** Standzeit einer Karte ohne eigene Angabe. */
const DEFAULT_DURATION = 7000;
/**
 * Laengster Zeitschritt, den ein Bild zaehlt: Nach einem Tab-Wechsel oder
 * einer Ruckelpause springt der Balken nicht um Sekunden vor.
 */
const MAX_FRAME_STEP = 100;

/** Mindeststrecke eines Wischers in Pixeln; darunter gilt die Geste als Tippen. */
const SWIPE_THRESHOLD = 48;
/** Mindeststrecke eines Wischers nach unten, der die Story schliesst. */
const CLOSE_THRESHOLD = 96;

/**
 * Elemente, auf denen ein Tippen **nicht** weiterblaettert: Bedienelemente und
 * Diagramme (dort oeffnet das Tippen den Tooltip).
 */
const INTERACTIVE = "a, button, summary, input, select, table, [data-story-keep]";

/**
 * Vollbild-Story im Stil eines Jahresrueckblicks: eine Karte nach der anderen,
 * Fortschritt als Segmente oben.
 *
 * Bedienung auf jedem Weg: Tippen (linkes Drittel zurueck, sonst weiter),
 * Wischen, Pfeiltasten, Escape zum Schliessen und sichtbare Knoepfe unten.
 *
 * Jede Karte blaettert nach ihrer Standzeit von allein weiter; das aktive
 * Segment oben fuellt sich dabei. Gedrueckt halten haelt an, der
 * Pause-Knopf (oder die Leertaste) haelt die Karte an (WCAG 2.2.2). Wer
 * ein Diagramm antippt, will lesen: Das haelt ebenfalls an. Eine Pause gilt
 * nur fuer ihre Karte — vor oder zurueck laeuft die Zeit wieder. Nach der
 * letzten Karte schliesst sich die Story; ein Wisch nach unten schliesst sie
 * jederzeit.
 *
 * Der Balken wird per `requestAnimationFrame` direkt am Element gesetzt —
 * kein Neuzeichnen von React je Bild.
 */
export function StoryViewer({
  title,
  slides,
  onClose,
}: {
  title: string;
  slides: readonly StorySlide[];
  onClose: () => void;
}) {
  const [index, setIndex] = React.useState(0);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);
  const swiped = React.useRef(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fillRef = React.useRef<HTMLSpanElement>(null);
  // Eine Pause gilt der aktuellen Karte; jeder Wechsel hebt sie auf.
  const [paused, setPaused] = React.useState(false);
  const [holding, setHolding] = React.useState(false);

  const last = slides.length - 1;
  const current = Math.min(index, last);
  const slide = slides[current];
  const duration = slide.duration ?? DEFAULT_DURATION;
  const running = !paused && !holding;
  const togglePause = React.useCallback(() => {
    setPaused((value) => !value);
  }, []);

  const go = React.useCallback(
    (delta: number) => {
      setPaused(false);
      setIndex((value) => Math.max(0, Math.min(last, value + delta)));
    },
    [last],
  );

  // Hintergrund steht still, solange die Story offen ist; der Fokus liegt
  // im Dialog, damit Pfeiltasten und Screenreader dort beginnen.
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Jede Karte beginnt oben, auch wenn die vorige gescrollt war.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [current]);

  // Ablauf der Standzeit. `elapsed` lebt im Effekt: Ein Seitenwechsel
  // beginnt bei null, eine Pause friert den Stand ein.
  const elapsedRef = React.useRef(0);
  React.useEffect(() => {
    elapsedRef.current = 0;
  }, [current]);
  React.useEffect(() => {
    const fill = fillRef.current;
    if (!running) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      elapsedRef.current += Math.min(now - previous, MAX_FRAME_STEP);
      previous = now;
      const progress = Math.min(1, elapsedRef.current / duration);
      if (fill) fill.style.transform = `scaleX(${String(progress)})`;
      if (progress < 1) frame = requestAnimationFrame(tick);
      else if (current < last) go(1);
      else onClose();
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [running, current, duration, last, go, onClose]);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === " ") {
        event.preventDefault();
        togglePause();
      } else if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose, togglePause]);

  // Wisch nach unten schliesst. Ueber Touch-Ereignisse, weil der Browser
  // senkrechte Gesten (touch-pan-y) selbst uebernimmt und den Zeiger dann
  // abbricht. Nur am oberen Rand der Karte — sonst ist es Scrollen.
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches.item(0);
    touchStart.current =
      event.touches.length === 1 && (scrollRef.current?.scrollTop ?? 0) <= 0
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  }
  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches.item(0);
    if (!start) return;
    if (isCloseSwipe(touch.clientX - start.x, touch.clientY - start.y)) {
      swiped.current = true;
      onClose();
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    swipeStart.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
    if ((event.target as Element).closest("[data-story-keep]")) setPaused(true);
    setHolding(true);
  }

  function onPointerUp(event: React.PointerEvent) {
    setHolding(false);
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      go(dx < 0 ? 1 : -1);
    } else if (event.pointerType === "mouse" && isCloseSwipe(dx, dy)) {
      // Touch schliesst ueber onTouchEnd; hier nur das Ziehen mit der Maus.
      swiped.current = true;
      onClose();
    }
  }

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if ((event.target as Element).closest(INTERACTIVE)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    go(event.clientX - bounds.left < bounds.width / 3 ? -1 : 1);
  }

  return (
    // Auf dem Telefon fuellt die Story den Bildschirm; ab `sm` steht sie als
    // hochformatige Tafel auf gedaempftem Grund — eine Zeile Text ueber die
    // volle Desktopbreite liest sich nicht wie eine Geschichte.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background sm:bg-muted sm:p-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex h-full w-full flex-col bg-background text-foreground outline-none sm:h-[min(52rem,100%)] sm:max-w-lg sm:rounded-3xl sm:border sm:border-border sm:bg-card"
      >
        <div className="flex flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-8 sm:pt-6">
          <div className="flex gap-1" aria-hidden>
            {slides.map((entry, position) => (
              <span
                key={entry.id}
                className="h-1 flex-1 overflow-hidden rounded-full bg-border"
              >
                <span
                  ref={position === current ? fillRef : undefined}
                  className={cn(
                    "block h-full origin-left bg-foreground",
                    position > current && "scale-x-0",
                  )}
                  style={position === current ? { transform: "scaleX(0)" } : undefined}
                />
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="-mr-3 flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePause}
                aria-label={paused ? "Automatisch weiterblättern" : "Anhalten"}
                aria-pressed={paused}
              >
                {paused ? <Play /> : <Pause />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Rückblick schließen"
              >
                <X />
              </Button>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="relative flex-1 touch-pan-y overflow-y-auto select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onPointerCancel={() => {
            setHolding(false);
          }}
          onPointerLeave={() => {
            setHolding(false);
          }}
          onClick={onClick}
        >
          {/* Jede Karte ist ein erster Auftritt (`data-intro`): Bausteine
              gleiten nacheinander ein, Zahlen zaehlen hoch, Balken wachsen
              (`.story-slide` in index.css). Der Schluessel baut die Karte bei
              jedem Wechsel neu auf, auch beim Zurueckblaettern. */}
          <section
            key={slide.id}
            aria-label={slide.label}
            data-intro=""
            className="story-slide flex min-h-full w-full flex-col justify-center px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:pb-10 sm:px-8"
          >
            {slide.content}
          </section>
        </div>

        <p className="sr-only" aria-live="polite">
          {`Seite ${String(current + 1)} von ${String(slides.length)}: ${slide.label}`}
        </p>

        {/* Ohne sichtbare Fusszeile: Geblaettert wird per Tippen, Wischen und
            Pfeiltasten. Fuer Screenreader und Tastatur bleiben die Knoepfe da
            und erscheinen, sobald sie den Fokus haben. */}
        <div className="flex justify-between px-4 sm:px-8">
          <Button
            variant="outline"
            className="sr-only focus-visible:not-sr-only focus-visible:mb-4"
            onClick={() => {
              go(-1);
            }}
            disabled={current === 0}
            aria-label="Vorherige Seite"
          >
            <ChevronLeft />
            Zurück
          </Button>
          <Button
            className="sr-only focus-visible:not-sr-only focus-visible:mb-4"
            onClick={() => {
              if (current < last) go(1);
              else onClose();
            }}
            aria-label={current < last ? "Nächste Seite" : "Rückblick beenden"}
          >
            {current < last ? "Weiter" : "Fertig"}
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

function isCloseSwipe(dx: number, dy: number): boolean {
  return dy >= CLOSE_THRESHOLD && dy > Math.abs(dx) * 1.5;
}
