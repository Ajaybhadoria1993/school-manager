import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";

/**
 * The pages that change how the school is set up (classes and sections, and later more) are for the people who run
 * it. The API enforces this too; this just avoids showing a page whose buttons would all be refused.
 */
export default function SchoolManagerRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowed = user?.role === "school_admin" || user?.role === "principal";

  useEffect(() => {
    if (user && !allowed) navigate("/dashboard", { replace: true });
  }, [user, allowed, navigate]);

  return allowed ? <Outlet /> : null;
}
