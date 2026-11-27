import { useEffect, useRef } from "react";
import { authApi } from "../redux/api/authApi";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { profileLoaded } from "../redux/slices/authSlice";
import type { AuthUser } from "../types";

/** The least time between two looks at the session, whatever the window does. */
const EVERY_MS = 15_000;

/**
 * What the person may do, to tell a change: what works on the whole school too, since a staff member who also teaches can be given a key their
 * teacher's list already has (2026-11-26).
 */
const signature = (u: Pick<AuthUser, "role" | "permissions" | "schoolPermissions"> | null | undefined) => JSON.stringify([u?.role, u?.permissions ?? null, u?.schoolPermissions ?? null]);

/**
 * Keeps what the signed-in person may do up to date (the school's Permissions page): when the window is opened again (a tab brought back, the
 * laptop woken) the session is read once more, so a box the school ticked or cleared reaches the menu without signing in again. The server
 * checks every request by the school's current list anyway; this only keeps the menu and the pages honest. Nothing is stored when nothing changed.
 */
export function usePermissionRefresh() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const signedIn = !!user && user.role !== "super_admin";
  const seen = useRef<string>("");
  seen.current = signature(user);
  const last = useRef(0);

  useEffect(() => {
    if (!signedIn) return;
    const look = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last.current < EVERY_MS) return;
      last.current = Date.now();
      try {
        const res = await dispatch(authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true, subscribe: false })).unwrap();
        if (signature(res.data.user) !== seen.current) dispatch(profileLoaded(res.data));
      } catch {
        // A session that is over was already ended by the request layer; a server that cannot be reached is tried again next time.
      }
    };
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", look);
    return () => {
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", look);
    };
  }, [dispatch, signedIn]);
}
