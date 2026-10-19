# Design system: "Modern Corporate & Clean Precision"

The look of the app comes from a design system exported from Google Stitch (a blue and navy school-ERP theme).
Only its **visual rules** are used: colours, type, radii, shadows, component shapes. The product is **EduShiksha**, and none of the marketing text or numbers from the Stitch sample screens are used (uptime, campus
counts, certifications, 2FA and similar). Every sentence in the UI describes something the product does today.

All tokens live in one place, [`frontend/app/globals.css`](../../frontend/app/globals.css). Components use the
Tailwind names below, never raw hex values (except the few one-off tints noted in the component files).

## Colour

| Token (Tailwind name) | Value | Used for |
| :-- | :-- | :-- |
| `primary` / `primary-hover` | `#2563EB` / `#1D4ED8` | Actions, active navigation, links |
| `primary-deep` | `#004AC6` | Wordmark, text on soft blue |
| `primary-soft` | `#EFF4FF` | Active menu item, filled inputs, soft tiles |
| `navy` | `#0F172A` | Modal backdrop (45%), strong text |
| `panel` | `#213145` | The dark panel beside sign-in and onboarding |
| `sky` | `#38BDF8` | Accent on dark panels, live indicators |
| `background` / `surface` / `surface-muted` | `#F8FAFC` / `#FFFFFF` / `#F1F5F9` | Page canvas, cards, subtle containers |
| `border` | `#E2E8F0` | Hairlines |
| `foreground` / `foreground-muted` | `#0F172A` / `#64748B` | Headings and body, captions |
| `success`, `warning`, `danger`, `info` (+ `-soft`, `-line`) | see `globals.css` | Badge text, tint and 1px border; notices |

Badges are pills 24px high with a tint, darker text and a 1px border of the same hue.

## Type

Plus Jakarta Sans, loaded with `next/font` (weights 400 to 800), variable `--font-jakarta`. Headings are bold with a
tight letter-spacing (`-0.02em` to `-0.03em`); page titles are 32px on desktop and 24px on a phone; table headers are
11px, bold, uppercase.

The public pages (landing, sign-in, registration and the other auth screens) also use a serif, Merriweather bold, for
their headlines. It lives in `frontend/lib/fonts.ts` and only those pages apply it, so the signed-in app does not
download it.

## Shape and depth

| Thing | Rule |
| :-- | :-- |
| Buttons, inputs, selects | 8px radius (`rounded-lg`), 40px high (44px, `size="lg"`, on sign-in screens) |
| Cards, tables, modals | 16px radius (`--radius-card`), 24px for the large sign-in frame and landing photo |
| Pills, avatars | fully round |
| Shadow level 1 to 4 | `shadow-card`, `shadow-raised`, `shadow-float`, `shadow-modal` |
| Focus | border turns primary plus a `0 0 0 3px rgba(37,99,235,.15)` ring |
| Pressed buttons | `scale(0.99)` |

## Layout

Sidebar 260px, content on a 12-column fluid grid, 32px page margin on desktop and 16px on a phone. Tables turn into a
card per row below the `md` breakpoint.

## Where we chose differently from the Stitch sample

- **Sign-in stays Email + Password.** No role tabs, campus code, OTP or 2FA: those are not features of this app.
- **Filled inputs only on the sign-in screens.** A soft-blue, borderless field with a white focus state, applied by
  `AuthShell` through `FilledControls`; inside the app, inputs are white with a hairline border.
- **Light theme only.** The sign-in and onboarding screens are designed around the white card and navy panel.
- **Truthful copy.** The side-panel highlights say what is true now: schools are kept apart, every school is reviewed
  by a person before it opens, passwords are hashed and sessions are short-lived, and India-specific fields (UDISE+,
  boards, PIN codes, an April session) are built in.

## Logo

A blue badge with a graduation cap and an open book, from the Stitch export. Files in `frontend/public/brand/`:
`logo.svg` (the original, with its soft shadow and margin) and `logo-mark.svg` (cropped to the badge, no shadow; used by
`BrandMark` in the header, sidebar and side panels). The browser tab icon is `frontend/app/icon.svg` (same as
`logo-mark.svg`); the scaffold's default `favicon.ico` was removed so it does not compete with it.

## Photos

`frontend/public/images/`: `hero-campus.jpg` (landing hero, and the same photo under a navy wash on the sign-in and
onboarding panels, so the three feel like one place), `auth-campus.jpg` and `school-collab.jpg` (the two photo rows
on the landing page). All three (100 to 150 KB each) come from the Stitch export. Their licence is not documented, so treat
them as placeholders: replace them with your own photos before a public launch, and keep each under about 150 KB.
