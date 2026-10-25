# CLAUDE.md: FrontEnd-React

React 19 + TypeScript + Vite + Tailwind v4 + HeroUI v3 + Redux Toolkit / RTK Query. It is the React port of `../frontend`
(Next.js, left untouched) and follows the layout of the Infinity Medisetu web app. `README.md` has the layout and the
token-refresh rules. The backend is `../backend`; do not change it from here.

- **Same UI as `../frontend`.** Components were ported file for file; a visual change needs an explicit request. Colours,
  shadows and radii come from the one token block in `src/index.css`; use the Tailwind token names, no raw hex.
- **Imports are relative** (no `@/` alias). Types go in `src/types/<domain>.ts`, not inline in components.
- **API calls only through RTK Query** (`src/redux/api/*Api.ts`, built on `baseQueryWithReauth`). Register a new slice in
  `redux/api/apiRoot.ts`. Mutations that change a list invalidate its tags. Never call `fetch` in a component.
- **Errors:** `getApiError(err)` (`utils/apiErrors.ts`) turns anything an RTK `.unwrap()` threw into `{ status, message, code, details }`
  or `null`; branch on `code`, not on `message`.
- **Auth:** tokens in cookies (`utils/auth.ts`), who is signed in in `redux/slices/authSlice.ts`, everything else through `hooks/useAuth.ts`.
  An endpoint where a 401 is an answer (login, reset, invite) passes `extraOptions: { skipAuthRefresh: true }`.
- **Dropdowns:** only `components/ui/Select.tsx` (HeroUI), never a native `<select>`.
- **Dialogs and help:** dialogs are `components/ui/AppModal.tsx` (HeroUI Modal, no trigger); first-time help is `components/ui/Hint.tsx`
  (`InfoTip`, `WithTip`, `TipButton`) plus a hint under every form field. "Manage school" pages follow `README.md` > Classes & Sections.
- No Prettier. Checks: `npm test && npm run typecheck && npm run lint && npm run build`.
- **Tests:** Vitest + Testing Library, in a `__tests__` folder next to the code (`README.md` > Tests). A rule in `src/utils` gets a unit
  test; a fixed bug gets the test that failed first. Page tests stub `fetch`; never call a real server from a test.
- Dev server is on 5173 and proxies `/api` to `localhost:5000`. The user's own servers use 5000 (API) and 3000 (Next); this
  app defaults to 5173. For tests use other ports (for example API 5001, this app `npx vite --port 5174`) and a throwaway DB.
