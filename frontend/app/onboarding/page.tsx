"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wizard } from "@/components/onboarding/Wizard";
import { WaitingView } from "@/components/onboarding/WaitingView";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ApiResponse, OnboardingState } from "@/types";

const POLL_MS = 20_000;

export default function OnboardingPage() {
  const router = useRouter();
  const { push } = useToast();
  const { user, tenant, refreshMe } = useAuth();
  const status = tenant?.approvalStatus;

  const [state, setState] = useState<OnboardingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Read the saved form whenever we arrive, and again whenever the school's stage changes
  // (for example it was sent back, so the form must open again).
  useEffect(() => {
    if (!status || status === "approved") return;
    let cancelled = false;
    api
      .get<ApiResponse<OnboardingState>>("/onboarding")
      .then((res) => {
        if (cancelled) return;
        setState(res.data);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : "Could not load your form.");
      });
    return () => {
      cancelled = true;
    };
  }, [status, reloadKey]);

  // Switching between the form, the waiting screen and the sent-back form starts at the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [status]);

  // Approved while the page was open: go to the dashboard.
  useEffect(() => {
    if (status === "approved") {
      push("success", "Your school is approved. Welcome aboard!");
      router.replace("/dashboard");
    }
  }, [status, push, router]);

  // While waiting, ask the server every so often (only when the tab is visible), and when the tab is shown again.
  const check = useCallback(async () => {
    try {
      await refreshMe();
    } catch {
      // A failed check is not worth interrupting the page for; the next one will try again.
    }
  }, [refreshMe]);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, check]);

  if (!user) return null;

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!state) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading your form">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  // `state` is what the server last said; `status` (from the session) can be newer, so trust that for the view.
  if (status === "pending") {
    return <WaitingView state={state} email={user.email} onCheck={check} />;
  }

  return (
    <Wizard
      state={state}
      onStateChange={setState}
      onSubmitted={async (next) => {
        setState(next);
        await check(); // the session now says "pending", which switches the view
      }}
      onLocked={() => {
        push("error", "This application was already submitted.");
        check();
      }}
    />
  );
}
