import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";

/** Everything under /super-admin is for the platform owner. The API enforces this too; this just avoids showing a dead page. */
export default function SuperAdminRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowed = user?.role === "super_admin";

  useEffect(() => {
    if (user && !allowed) navigate("/dashboard", { replace: true });
  }, [user, allowed, navigate]);

  return allowed ? <Outlet /> : null;
}
