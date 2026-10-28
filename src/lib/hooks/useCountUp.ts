import * as React from "react";
import { easeOut, formatFigure, parseFigure } from "@/lib/utils/countUp";

/** Dauer des Hochzaehlens. */
const DURATION_MS = 600;

/** Erster Textknoten mit einer Ziffer — dort steht die Zahl. */
function figureNode(root: HTMLElement): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      /\d/.test(node.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  return walker.nextNode() as Text | null;
}

interface CountState {
  element: HTMLElement | null;
  node: Text | null;
  /** Was zuletzt im Knoten stand — von React oder von hier. */
  written: string | null;
  /** Gerade gezeigter Zahlenwert. */
  shown: number | null;
  trigger: unknown;
  /** Text der Endzahl, solange gezaehlt wird. */
  target: string | null;
  frame: number;
}

/**
 * Hauptzahl zaehlt auf ihren Wert (seit 2.44.0): beim ersten Aufruf des
 * Bereichs von null, bei jedem spaeteren Wechsel (Jahr, Filter) vom alten auf
 * den neuen Wert. Mit `trigger` nur, wenn dieser sich geaendert hat: Beim
 * Tippen durch die Monate des Diagramms soll die Zahl folgen, nicht zaehlen.
 *
 * Die Zahl kommt fertig formatiert (Betrag, Prozent); gezaehlt wird im Text
 * selbst, im Format der Endzahl. Die Bilder schreiben direkt in den
 * Textknoten statt ueber React: 36 Bilder sollen keine 36 Renderlaeufe
 * kosten. React behaelt seinen Knoten; am Ende steht wieder genau sein Text
 * darin. Die Breite der Endzahl gilt waehrend des Zaehlens als Mindestbreite —
 * sonst schoebe der Vergleich daneben bei jedem Bild hin und her.
 */
export function useCountUp<T extends HTMLElement>({
  trigger,
}: { trigger?: unknown } = {}): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);
  const state = React.useRef<CountState>({
    element: null,
    node: null,
    written: null,
    shown: null,
    trigger: undefined,
    target: null,
    frame: 0,
  });

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const current = state.current;
    const node = figureNode(element);
    if (!node) return;
    const text = node.data;
    // Neu gezeichnet, aber derselbe Wert: Das laufende Zaehlen bleibt.
    if (node === current.node && text === current.written) return;

    const figure = parseFigure(text);
    const from =
      current.node === null
        ? element.closest("[data-intro]")
          ? 0
          : null
        : trigger !== undefined && trigger === current.trigger
          ? null
          : current.shown;
    current.trigger = trigger;
    window.cancelAnimationFrame(current.frame);
    element.style.minWidth = "";
    current.element = element;
    current.node = node;
    current.written = text;
    current.shown = figure?.value ?? null;
    if (
      figure === null ||
      from === null ||
      from === figure.value ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    element.style.minWidth = `${String(element.getBoundingClientRect().width)}px`;
    const write = (value: string) => {
      node.nodeValue = value;
      current.written = value;
    };
    // Die Zeit des ersten Bildes ist der Start — dieselbe Uhr wie alle
    // folgenden Bilder.
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / DURATION_MS);
      if (progress < 1) {
        current.shown = from + (figure.value - from) * easeOut(progress);
        write(formatFigure(figure, current.shown));
        current.frame = window.requestAnimationFrame(step);
      } else {
        current.shown = figure.value;
        current.target = null;
        write(text);
        element.style.minWidth = "";
      }
    };
    current.target = text;
    write(formatFigure(figure, from));
    current.shown = from;
    current.frame = window.requestAnimationFrame(step);
  });

  // Abbruch mitten im Zaehlen: Die Endzahl gehoert wieder in den Knoten.
  React.useEffect(() => {
    const current = state.current;
    return () => {
      window.cancelAnimationFrame(current.frame);
      if (current.node && current.target !== null) {
        current.node.nodeValue = current.target;
        current.written = current.target;
        current.shown = parseFigure(current.target)?.value ?? null;
        current.target = null;
      }
      current.element?.style.removeProperty("min-width");
    };
  }, []);

  return ref;
}
