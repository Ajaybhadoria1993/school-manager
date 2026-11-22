import type { ReactNode } from "react";
import { cn } from "../../utils/helpers";
import { SoftControls } from "../ui/Input";

/**
 * The frame of every screen of the sign-in family (2026-11-21, from the school's own picture): sign in, register your school, forgot
 * password, choose a new password and set up the school's account. The picture (`School Login.webp`, 3952 x 1882) fills the window as it
 * is, with the logo and the children at the left and a big circle at the right; **the form is a round white card ON that circle** (the user:
 * "wahi login form rakho circle mein hi", then "forget aur registration par bhi same ui rkho, puran hta do": the old split screen with a
 * campus photo and three points is gone). The circle's place and size are worked out from the picture's own numbers (`.login-page` in
 * index.css), so the form stays in the circle however the window is shaped.
 *
 *  - A short form (a couple of boxes and a button) is the circle itself. A form too tall for a circle (a password, the rules of a password,
 *    its confirmation: `tall`) is a round-cornered card on the same spot, as wide as the circle.
 *  - A phone or a window with no room for a circle gets a card in the middle of the picture, with the logo in it.
 *  - The picture fills the window by `.login-picture` (index.css): a squeeze or a stretch of 5% at most (too little to see), then a thin trim;
 *    a window narrower than the picture loses a strip at its right (the circle's form then slides left to stay whole). The user turned down
 *    blur, fading edges, margins at the sides, a plain 15% stretch (faces pulled wide) and a cut at the bottom.
 *  - The form's sizes follow the height of the screen (`.login-card` in index.css), and in the circle follow the circle's own size.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  tall = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** What stands under the form: the way to another screen of the family (the sign-in page has "or" and a way to register). */
  footer?: ReactNode;
  /** The form is too tall for a circle: it is a card on the circle's spot. */
  tall?: boolean;
}) {
  return (
    <div className="login-card login-page relative isolate min-h-dvh overflow-hidden bg-[#d6ebfb]">
      {/* The picture: decoration, so no text of its own. */}
      <img
        src="/images/School%20Login.webp"
        alt=""
        aria-hidden
        width={3952}
        height={1882}
        className="login-picture absolute -z-10"
        fetchPriority="high"
        decoding="async"
      />

      <div className="login-slot mx-auto flex min-h-dvh w-full items-center justify-center px-4 py-4 sm:px-8 lg:justify-end lg:py-6 lg:pr-[6vw]">
        <main
          className={cn(
            "login-main rise-in w-full max-w-[34rem] rounded-[1.75rem] border border-white/70 bg-white/95 px-6 pb-[var(--lp-pb)] pt-[var(--lp-pt)] shadow-float backdrop-blur-sm sm:px-10",
            tall && "login-main--tall"
          )}
        >
          <div className="login-content">
            {/* The logo is in the picture when the form is in its circle; a card on a small screen has it here. */}
            <img src="/images/EduShiksha_logo.png" alt="EduShiksha" width={1520} height={1049} className="login-logo mx-auto h-auto w-[var(--lp-logo)]" decoding="async" />

            <p className="login-portal mt-[calc(var(--lp-gap)*0.75)] flex items-center gap-4 text-sm font-semibold text-primary-deep">
              <span aria-hidden className="h-px flex-1 bg-primary-deep/25" />
              Student &amp; School Portal
              <span aria-hidden className="h-px flex-1 bg-primary-deep/25" />
            </p>

            <h1 className="mt-[var(--lp-block)] text-center text-[length:var(--lp-title)] font-bold leading-tight text-primary-deep">{title}</h1>
            {subtitle && <p className="login-subtitle mt-[calc(var(--lp-gap)*0.5)] text-center text-[15px] text-foreground-muted">{subtitle}</p>}

            <div className="mt-[var(--lp-block)]">
              {/* The tall white boxes with a blue icon inside, like the sign-up form's. */}
              <SoftControls>{children}</SoftControls>
            </div>

            {footer && <div className="login-footer mt-[var(--lp-block)] text-center">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
