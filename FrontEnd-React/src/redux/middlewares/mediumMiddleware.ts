import type { Middleware } from "@reduxjs/toolkit";
import { allApiSlices } from "../api/apiRoot";
import { authApi } from "../api/authApi";
import { onboardingApi } from "../api/onboardingApi";
import { tenantApi } from "../api/tenantApi";
import { sessionEnded, signedOut } from "../slices/authSlice";
import { MEDIUM_KEY, mediumChanged } from "../slices/mediumSlice";
import { yearViewChanged } from "../slices/yearViewSlice";

const remember = (mediumId: string | null) => {
  try {
    if (mediumId) sessionStorage.setItem(MEDIUM_KEY, mediumId);
    else sessionStorage.removeItem(MEDIUM_KEY);
  } catch {
    // The tab just goes back to the first medium when it reloads.
  }
};

/** What is about the school itself and is the same on every side. */
const SAME_ON_EVERY_SIDE = new Set<unknown>([authApi, tenantApi, onboardingApi]);

/**
 * When the administrator moves to another medium: the tab remembers it, a past year that was open closes (it was the other side's year), and
 * everything read so far is dropped, because all of it was the other side's. What is on screen is read again; the rest when it is next needed.
 */
export const mediumMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  if (mediumChanged.match(action)) {
    remember(action.payload);
    store.dispatch(yearViewChanged(null));
    for (const api of allApiSlices) if (!SAME_ON_EVERY_SIDE.has(api)) store.dispatch(api.util.resetApiState());
  } else if (signedOut.match(action) || sessionEnded.match(action)) {
    remember(null);
  }
  return result;
};
