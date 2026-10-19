"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { LANDING_NAV } from "./nav";

/** Sticky top bar: logo, section links, and the two ways in. Below a laptop width the links move into a menu. */
export function LandingHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
        <BrandMark />

        <nav className="hidden items-center gap-8 text-sm font-semibold text-foreground-muted lg:flex" aria-label="Sections">
          {LANDING_NAV.map((item) => (
            <a key={item.href} href={item.href} className="py-2 transition-colors hover:text-primary">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="hidden whitespace-nowrap rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-[#cbd5e1] hover:bg-background sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="whitespace-nowrap rounded-lg bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] transition-colors hover:bg-primary-hover sm:px-4"
          >
            Register<span className="hidden sm:inline"> your school</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="landing-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-lg p-2 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="landing-menu" className="border-t border-border bg-surface px-4 py-3 lg:hidden" aria-label="Sections">
          <ul className="mx-auto max-w-7xl space-y-1">
            {LANDING_NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="sm:hidden">
              <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary-soft">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
