import { useEffect } from "react";
import { useNavigate } from "react-router";
import { authApi } from "../redux/api/authApi";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { authChecked, profileLoaded, signedOut } from "../redux/slices/authSlice";
import { getRefreshToken, getToken, onRemoteLogout } from "../utils/auth";

/**
 * Wires the session into the app. Call it once, near the top (routes/RootLayout.tsx):
 *  - restores the saved session when the page loads,
 *  - sends the person to the sign-in page when a request ended their session (the reason goes in the address),
 *  - signs this tab out when another tab signs out.
 */
export function useAuthSession() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const endedReason = useAppSelector((state) => state.auth.endedReason);

  // Restore the session on page load.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!getToken() && !getRefreshToken()) {
        dispatch(authChecked());
        return;
      }
      try {
        const res = await dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true, subscribe: false })).unwrap();
        if (!cancelled) dispatch(profileLoaded(res.data));
      } catch {
        // A rejected session was already cleared by the request layer. If the server was just
        // unreachable we keep the cookies so a reload can recover; either way, show signed out.
      } finally {
        if (!cancelled) dispatch(authChecked());
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // A session that ended inside any request (refresh rejected, account disabled): go to /login.
  useEffect(() => {
    if (endedReason) navigate(`/login?reason=${endedReason}`, { replace: true });
  }, [endedReason, navigate]);

  // Signing out in one tab signs out the others.
  useEffect(
    () =>
      onRemoteLogout(() => {
        dispatch(signedOut());
        navigate("/login", { replace: true });
      }),
    [dispatch, navigate],
  );
}
