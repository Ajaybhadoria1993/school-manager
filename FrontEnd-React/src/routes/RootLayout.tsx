import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { useAuthSession } from "../hooks/useAuthSession";
import { AppThemeProvider } from "../theme/AppThemeProvider";

/** A new page opens at its top, as a page load does (links to a place on the same page, like "#features", keep their place). */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash]);
  return null;
}

/** The outermost route: the session wiring every page needs (see hooks/useAuthSession.ts). */
export function RootLayout() {
  useAuthSession();
  return (
    <AppThemeProvider>
      <ScrollToTop />
      <Outlet />
    </AppThemeProvider>
  );
}
