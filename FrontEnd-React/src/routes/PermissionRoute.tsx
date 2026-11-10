import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { can } from "../utils/permissions";

/**
 * A page for the people the school has allowed (the Permissions page): the school admin and the principal always, anyone else when their
 * kind of person has one of `keys`. Others are sent to their home. The API checks every request too; this only avoids a page whose
 * buttons would all be refused.
 */
export default function PermissionRoute({ keys }: { keys: string[] }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowed = can(user, ...keys);

  useEffect(() => {
    if (user && !allowed) navigate("/dashboard", { replace: true });
  }, [user, allowed, navigate]);

  return allowed ? <Outlet /> : null;
}
