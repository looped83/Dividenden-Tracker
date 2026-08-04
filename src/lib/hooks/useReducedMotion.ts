import * as React from "react";

/**
 * `prefers-reduced-motion: reduce` als React-Zustand.
 *
 * Lag zuvor doppelt in den beiden Diagrammdateien — zweimal derselbe Listener,
 * zweimal zu pflegen. Die Diagramme schalten damit ihre Einblendanimation ab
 * (UX_AND_DESIGN_SYSTEM.md §1: „`prefers-reduced-motion` schaltet alles ab").
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);
  return reduced;
}
