"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { NoticesTab } from "@/components/communication/NoticesTab";
import { MessagesTab } from "@/components/communication/MessagesTab";

const TABS = ["Notices", "Messages"] as const;

export default function CommunicationPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Notices");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Communication</h2>
        <p className="text-sm text-foreground-muted">Notices &amp; circulars, and two-way parent-teacher messaging.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Notices" && <NoticesTab />}
      {tab === "Messages" && <MessagesTab />}
    </div>
  );
}
