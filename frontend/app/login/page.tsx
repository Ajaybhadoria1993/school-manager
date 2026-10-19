"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiRequestError } from "@/lib/api";
import { postLoginPath } from "@/lib/postLoginPath";
import { isEmail } from "@/lib/validators";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

const REASON_MESSAGES: Record<string, string> = {
  expired: "Your session has expired. Please sign in again.",
  disabled: "Your account has been disabled. Please contact your administrator.",
  suspended: "Your school has been suspended, so you were signed out. Please contact the platform administrator.",
};

function LoginForm() {
  const { user, tenant, loading: authLoading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (or just signed in): leave this page.
  useEffect(() => {
    if (!authLoading && user) router.replace(postLoginPath(user, tenant));
  }, [authLoading, user, tenant, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await login(email.trim(), password, rememberMe);
      router.replace(postLoginPath(session.user, session.tenant));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to sign in right now.");
      setSubmitting(false);
    }
  }

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  const notice = reason ? REASON_MESSAGES[reason] : undefined;

  return (
    <AuthShell
      title="Sign in to your account"
      subtitle="Enter your email and password."
      footer={
        <span>
          New school?{" "}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            Register your school
          </Link>
        </span>
      }
    >
      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          {notice}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            icon={Mail}
            id="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.in"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password" className="mb-0">
              Password
            </Label>
            <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground-muted">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="size-4 rounded border-border accent-[var(--primary)]"
          />
          Keep me signed in on this device
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!email || !password}>
          {submitting ? "Signing in" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary (Next.js: it opts this part into client rendering).
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
