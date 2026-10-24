import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../utils/helpers";

/** Under the top bar (64px) with a little air. */
const TOP = 80;
/** Above a form's bar pinned to the bottom of the screen (about 70px) with a little air. */
const BOTTOM = 96;

/**
 * The column beside a long form (a preview, a checklist, tips): it scrolls with the page only until it is all in view, then stays put
 * while the form goes on scrolling. A column shorter than the screen stops under the top bar; a taller one stops when its bottom
 * reaches the form's bar at the bottom, so nothing of it is ever out of reach. Only on a wide screen (on a phone it comes after the
 * form, in the flow).
 */
export function StickyAside({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [top, setTop] = useState(TOP);

  useEffect(() => {
    const aside = ref.current;
    if (!aside) return;
    const place = () => setTop(Math.min(TOP, window.innerHeight - aside.offsetHeight - BOTTOM));
    place();
    const observer = new ResizeObserver(place);
    observer.observe(aside);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <aside ref={ref} aria-label={label} style={{ top }} className={cn("space-y-5 lg:sticky lg:self-start", className)}>
      {children}
    </aside>
  );
}
