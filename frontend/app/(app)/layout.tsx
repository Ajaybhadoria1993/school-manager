"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { NAV_ITEMS } from "@/components/layout/nav-config";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const active = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <div className="flex min-h-screen bg-background print:block">
      <div className="print:hidden">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="print:hidden">
          <Topbar onMenuClick={() => setMobileOpen(true)} title={active?.label ?? "Dashboard"} />
        </div>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}
