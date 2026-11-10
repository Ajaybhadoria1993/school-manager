import { useCallback } from "react";
import { useAppSelector } from "../redux/hooks";
import { can } from "../utils/permissions";

/** `can(...keys)` for the signed-in person: may they do what any of these permissions say (the school's Permissions page)? */
export function useCan() {
  const user = useAppSelector((state) => state.auth.user);
  return useCallback((...keys: string[]) => can(user, ...keys), [user]);
}
