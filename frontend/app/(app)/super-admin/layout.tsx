"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/** Everything under /super-admin is for the platform owner. The API enforces this too; this just avoids showing a dead page. */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = user?.role === "super_admin";

  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [user, allowed, router]);

  return allowed ? <>{children}</> : null;
}
