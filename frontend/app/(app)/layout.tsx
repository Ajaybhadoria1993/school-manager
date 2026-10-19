"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { postLoginPath } from "@/lib/postLoginPath";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { PendingProvider } from "@/components/layout/PendingProvider";
import { NAV_ITEMS } from "@/components/layout/nav-config";

/** The signed-in app shell. Everything under app/(app)/ requires a session and an approved school. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, tenant, loading, loginPath } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // A school admin whose school is still being set up or waiting for approval belongs on /onboarding.
  const needsOnboarding =
    !!user && postLoginPath(user, tenant) === "/onboarding";

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(loginPath);
    else if (needsOnboarding) router.replace("/onboarding");
  }, [loading, user, needsOnboarding, loginPath, router]);

  if (loading || !user || needsOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2
          className="size-6 animate-spin text-primary"
          aria-label="Loading"
        />
      </div>
    );
  }

  const active = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );

  return (
    <PendingProvider>
      <div className="flex min-h-screen bg-background print:block">
        <div className="print:hidden">
          <Sidebar
            mobileOpen={mobileOpen}
            onClose={() => setMobileOpen(false)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col print:block">
          <div className="print:hidden">
            <Topbar
              onMenuClick={() => setMobileOpen(true)}
              title={active?.label ?? "Dashboard"}
            />
          </div>
          <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 lg:p-8 print:p-0">
            {/* A new key on every page, so each page eases in instead of snapping. */}
            <div key={pathname} className="rise-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </PendingProvider>
  );
}
