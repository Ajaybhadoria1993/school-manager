import { useEffect, useRef, type HTMLAttributes } from "react";

/**
 * What a tab shows (2026-11-23, user: "tab change karte hi jhatka lagta hai, sab kuch smooth change ho"): when `tab` changes, the content fades in and
 * rises a few pixels instead of snapping into its place. Nothing is mounted again (the page keeps what it holds: a list its search, a form its boxes);
 * only the box is animated, by the browser (Web Animations). Nothing moves for a person who asked for less motion, nor in a browser that cannot animate.
 * The first time it is shown there is no animation: only a change of tab has one.
 */
export function TabPanel({ tab, children, ...rest }: { tab: string } & HTMLAttributes<HTMLDivElement>) {
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef(tab);
  useEffect(() => {
    if (shown.current === tab) return;
    shown.current = tab;
    const el = box.current;
    if (!el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 220, easing: "ease-out" }
    );
  }, [tab]);
  return (
    <div ref={box} {...rest}>
      {children}
    </div>
  );
}
