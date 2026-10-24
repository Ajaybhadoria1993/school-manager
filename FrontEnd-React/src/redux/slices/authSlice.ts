import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthUser, SessionEndReason, TenantState } from "../../types";

interface AuthState {
  user: AuthUser | null;
  /** The signed-in user's school (null for the super admin and when signed out). */
  tenant: TenantState | null;
  /** True until the saved session (if there is one) has been checked with the server. */
  loading: boolean;
  /** Set when a session was ended for the user rather than by them; the sign-in page says why. */
  endedReason: SessionEndReason | null;
}

const initialState: AuthState = {
  user: null,
  tenant: null,
  loading: true,
  endedReason: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /** Signed in (login, reset-password, accept-invite). The tokens are stored by the caller. */
    sessionStarted(state, action: PayloadAction<{ user: AuthUser; tenant: TenantState | null }>) {
      state.user = action.payload.user;
      state.tenant = action.payload.tenant;
      state.endedReason = null;
    },
    /** The user and school as the server sees them now (page load, or a re-check such as waiting for approval). */
    profileLoaded(state, action: PayloadAction<{ user: AuthUser; tenant: TenantState | null }>) {
      state.user = action.payload.user;
      state.tenant = action.payload.tenant;
    },
    /** The saved session has been checked: pages may now decide between the app and the sign-in screen. */
    authChecked(state) {
      state.loading = false;
    },
    /** The session ended inside a request (refresh rejected, account disabled, school suspended). */
    sessionEnded(state, action: PayloadAction<SessionEndReason>) {
      state.user = null;
      state.tenant = null;
      state.loading = false;
      state.endedReason = action.payload;
    },
    /** The user signed out, here or in another tab. */
    signedOut(state) {
      state.user = null;
      state.tenant = null;
      state.loading = false;
      state.endedReason = null;
    },
  },
});

export const { sessionStarted, profileLoaded, authChecked, sessionEnded, signedOut } = authSlice.actions;
export default authSlice.reducer;
