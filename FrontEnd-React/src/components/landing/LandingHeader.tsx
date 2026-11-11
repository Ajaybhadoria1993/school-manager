import { useEffect, useState } from "react";
import { Link } from "react-router";
import { LogIn, Menu, X } from "lucide-react";
import { BrandMark } from "../brand/BrandMark";
import { useActiveSection } from "../../hooks/useActiveSection";
import { cn } from "../../utils/helpers";
import { LANDING_NAV } from "./nav";

const SECTION_IDS = LANDING_NAV.map((item) => item.href.slice(1));

/**
 * Sticky top bar. Left: logo. Middle: the section links (truly centred on a laptop screen, the current section lit up).
 * Right: "Login" and "Register your school", always in the bar at every width. Below a laptop width only the section links move into a menu.
 */
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const active = useActiveSection(SECTION_IDS);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // A soft shadow appears once the page has moved, so the bar reads as floating above the content.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-md transition-shadow duration-200",
        scrolled && "shadow-raised"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-8 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        {/* On a phone the logo is a size smaller, and under 360px wide the name gives way, so Login and Register always fit beside it. */}
        <BrandMark className="gap-2 max-sm:[&>img]:size-9 max-[359px]:[&>span]:sr-only sm:gap-3 lg:justify-self-start" />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections">
          {LANDING_NAV.map((item) => {
            const current = active === item.href.slice(1);
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  current ? "bg-primary-soft text-primary" : "text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                )}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2.5 lg:justify-self-end">
          <Link
            to="/login"
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary sm:px-4"
          >
            <LogIn className="hidden size-4 sm:block" aria-hidden />
            Login
          </Link>
          <Link
            to="/signup"
            className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-2.5 text-sm font-semibold text-primary-foreground shadow-[0_6px_14px_-4px_rgb(37_99_235/0.55)] transition-all hover:-translate-y-px hover:bg-primary-hover sm:px-5"
          >
            <span>
              Register<span className="hidden sm:inline"> your school</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-lg p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground sm:p-2 lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="landing-menu" className="border-t border-border bg-surface px-4 py-3 lg:hidden" aria-label="Sections">
          <ul className="mx-auto max-w-7xl space-y-1">
            {LANDING_NAV.map((item) => {
              const current = active === item.href.slice(1);
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={current ? "location" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                      current ? "bg-primary-soft text-primary" : "text-foreground hover:bg-surface-muted"
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
