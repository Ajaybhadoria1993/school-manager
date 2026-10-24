import { useCallback } from "react";
import { useNavigate } from "react-router";
import { authApi } from "../redux/api/authApi";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { profileLoaded, sessionStarted, signedOut } from "../redux/slices/authSlice";
import type { SessionPayload } from "../types";
import { broadcastLogout, clearTokens, getRefreshToken, setTokens } from "../utils/auth";

/**
 * The signed-in user and everything done to the session. The tokens live in cookies (utils/auth.ts), who is
 * signed in lives in the Redux store (redux/slices/authSlice.ts), and the requests go through RTK Query.
 */
export function useAuth() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, tenant, loading, endedReason } = useAppSelector((state) => state.auth);

  /** Stores a session returned by an endpoint (login, reset-password, accept-invite). */
  const applySession = useCallback(
    (session: SessionPayload, rememberMe = true) => {
      setTokens(session.accessToken, session.refreshToken, rememberMe);
      dispatch(sessionStarted({ user: session.user, tenant: session.tenant }));
    },
    [dispatch],
  );

  /** Signs in and returns the session so the caller can route (see utils/postLoginPath). */
  const login = useCallback(
    async (email: string, password: string, rememberMe = true) => {
      const res = await dispatch(authApi.endpoints.login.initiate({ email, password })).unwrap();
      applySession(res.data, rememberMe);
      return res.data;
    },
    [dispatch, applySession],
  );

  /** Re-reads user and school from the server (e.g. to notice an approval). */
  const refreshMe = useCallback(async () => {
    const res = await dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true, subscribe: false })).unwrap();
    dispatch(profileLoaded(res.data));
  }, [dispatch]);

  /** Signs out. Pass { redirect: false } to stay on the current page (e.g. before accepting an invitation). */
  const logout = useCallback(
    async (options?: { redirect?: boolean }) => {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          await dispatch(authApi.endpoints.logout.initiate({ refreshToken })).unwrap();
        } catch {
          // Offline or already expired: signing out locally is what matters.
        }
      }
      clearTokens();
      dispatch(signedOut());
      broadcastLogout();
      if (options?.redirect !== false) navigate("/login", { replace: true });
    },
    [dispatch, navigate],
  );

  return {
    user,
    tenant,
    loading,
    /** Where to send someone who is signed out: the sign-in page, saying why when the session was ended for them. */
    loginPath: endedReason ? `/login?reason=${endedReason}` : "/login",
    login,
    applySession,
    refreshMe,
    logout,
  };
}
