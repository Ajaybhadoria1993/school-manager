import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Wizard } from "../../components/onboarding/Wizard";
import { WaitingView } from "../../components/onboarding/WaitingView";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";
import { useAuth } from "../../hooks/useAuth";
import { useLazyGetOnboardingQuery } from "../../redux/api/onboardingApi";
import { getApiError } from "../../utils/apiErrors";

const POLL_MS = 20_000;

export default function Onboarding() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { user, tenant, refreshMe } = useAuth();
  const status = tenant?.approvalStatus;

  // The saved form. Saving a step or submitting replaces it in the cache (see redux/api/onboardingApi.ts).
  const [loadForm, { data: formRes, error: loadError }] = useLazyGetOnboardingQuery();
  const state = formRes?.data ?? null;
  const error = loadError ? (getApiError(loadError)?.message ?? "Could not load your form.") : null;
  const [reloadKey, setReloadKey] = useState(0);

  // Read the saved form whenever we arrive, and again whenever the school's stage changes
  // (for example it was sent back, so the form must open again).
  useEffect(() => {
    if (!status || status === "approved") return;
    loadForm(undefined, false);
  }, [status, reloadKey, loadForm]);

  // Switching between the form, the waiting screen and the sent-back form starts at the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [status]);

  // Approved while the page was open: go to the dashboard.
  useEffect(() => {
    if (status === "approved") {
      push("success", "Your school is approved. Welcome aboard!");
      navigate("/dashboard", { replace: true });
    }
  }, [status, push, navigate]);

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
      onSubmitted={check} // the session now says "pending", which switches the view
      onLocked={() => {
        push("error", "This application was already submitted.");
        check();
      }}
    />
  );
}
