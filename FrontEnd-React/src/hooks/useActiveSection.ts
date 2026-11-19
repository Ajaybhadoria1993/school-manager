import { useEffect, useState } from "react";

/**
 * Which of the page's sections (by element id) is crossing the middle of the screen right now, or null while none is
 * (the hero at the top). Used to light up the matching link in the landing top bar.
 * A browser without IntersectionObserver (or a test) simply never highlights anything.
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const wanted = key ? key.split("|") : [];
    const elements = wanted.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const inView = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inView.add(entry.target.id);
          else inView.delete(entry.target.id);
        }
        // The section highest on the page that is still on the middle line wins.
        setActive(wanted.find((id) => inView.has(id)) ?? null);
      },
      // A thin band across the middle of the screen: a section counts once its top passes the middle.
      { rootMargin: "-45% 0px -54% 0px" }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return active;
}
