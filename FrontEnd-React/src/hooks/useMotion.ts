import { useEffect, useState } from "react";

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts from 0 up to `target` with an ease-out, so numbers settle instead of just appearing. */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    if (reduced()) {
      raf = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(raf);
    }
    // The count starts at the first frame, by the frames' own clock: it is not always the clock of performance.now(), and a start taken from
    // that one can lie after the frame, which counted backwards (a tile showing 0 read "-0").
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** False on the first paint, true right after: flip a CSS property on it and the transition plays on arrival. */
export function useEntered() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return entered;
}
