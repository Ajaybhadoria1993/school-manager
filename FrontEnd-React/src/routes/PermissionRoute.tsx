import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { can, canOnSchool } from "../utils/permissions";

/**
 * A page for the people the school has allowed (the Permissions page): the school admin and the principal always, anyone else when their
 * kind of person has one of `keys`. Others are sent to their home. The API checks every request too; this only avoids a page whose
 * buttons would all be refused. `schoolWide`: a page about the whole school, where a teacher's own list does not count (only what a staff
 * role gives them: utils/permissions.ts `canOnSchool`).
 */
export default function PermissionRoute({ keys, schoolWide = false }: { keys: string[]; schoolWide?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowed = schoolWide ? canOnSchool(user, ...keys) : can(user, ...keys);

  useEffect(() => {
    if (user && !allowed) navigate("/dashboard", { replace: true });
  }, [user, allowed, navigate]);

  return allowed ? <Outlet /> : null;
}
