"use client";

import { useState } from "react";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { initials, cn } from "@/lib/utils";
import { ROLE_LABELS } from "./nav-config";

export function Topbar({ onMenuClick, title }: { onMenuClick: () => void; title: string }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-foreground-muted hover:bg-surface-muted lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
      </div>

      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-muted"
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
            {initials(user.name)}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium leading-tight text-foreground">{user.name}</p>
            <p className="text-xs leading-tight text-foreground-muted">{ROLE_LABELS[user.role]}</p>
          </div>
          <ChevronDown className={cn("size-4 text-foreground-muted transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-border bg-surface py-1 shadow-lg">
              <div className="border-b border-border px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                <p className="truncate text-xs text-foreground-muted">{user.email}</p>
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
