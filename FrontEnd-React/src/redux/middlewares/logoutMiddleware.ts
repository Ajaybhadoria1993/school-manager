import type { Middleware } from "@reduxjs/toolkit";
import { allApiSlices } from "../api/apiRoot";
import { sessionEnded, signedOut } from "../slices/authSlice";

/** When a session ends, forget everything it fetched, so the next person on this browser never sees it. */
export const logoutMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  if (signedOut.match(action) || sessionEnded.match(action)) {
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  }
  return result;
};
