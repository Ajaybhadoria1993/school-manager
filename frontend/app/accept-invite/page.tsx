"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2, Mail, UserRound } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { postLoginPath } from "@/lib/postLoginPath";
import { isPasswordValid } from "@/lib/validators";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordChecklist } from "@/components/auth/PasswordChecklist";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/toast-context";
import type { ApiResponse, InviteInfo, SessionPayload } from "@/types";

type LinkState =
  | { kind: "checking" }
  | { kind: "valid"; info: InviteInfo }
  | { kind: "problem"; code: string; message: string };

const PROBLEM_TITLES: Record<string, string> = {
  INVITE_EXPIRED: "This link has expired",
  ALREADY_REGISTERED: "This link was already used",
  SCHOOL_EXISTS: "That school name was just taken",
};

const LINK_CODES = [
  "INVITE_INVALID",
  "INVITE_EXPIRED",
  "ALREADY_REGISTERED",
  "SCHOOL_EXISTS",
];

function fieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(details)) {
    for (const d of details as { path?: string; message?: string }[]) {
      if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
    }
  }
  return out;
}

/**
 * Where both email links land: the platform team's invitation, and the confirmation link sent to
 * someone who registered a school from the sign-in page. Either way the person chooses their name
 * and a password and is signed in as the school's administrator.
 */
function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading, applySession, logout } = useAuth();
  const { push } = useToast();

  // Captured once, on the first render, before the address is cleaned below.
  const [token] = useState<string | null>(() => searchParams.get("token"));
  const [link, setLink] = useState<LinkState>({ kind: "checking" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The one-time token should not linger in history, screenshots or a copied address.
  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  // Ask the server what this link is for.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // POST, so the one-time token travels in the body and never lands in a server's access log.
    api
      .post<ApiResponse<InviteInfo>>("/auth/invite/check", { token }, { skipAuthRefresh: true })
      .then((res) => !cancelled && setLink({ kind: "valid", info: res.data }))
      .catch((err) => {
        if (cancelled) return;
        const e = err instanceof ApiRequestError ? err : null;
        setLink({
          kind: "problem",
          code: e?.code ?? "UNKNOWN",
          message: e?.message ?? "Something went wrong. Please try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setFormError(null);
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Enter your full name.";
    if (!isPasswordValid(password))
      next.password = "The password does not meet all the requirements below.";
    if (password !== confirm) next.confirm = "The two passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const res = await api.post<ApiResponse<SessionPayload>>(
        "/auth/accept-invite",
        { token, name: name.trim(), password },
        { skipAuthRefresh: true },
      );
      // If someone else was signed in on this browser (for example the platform owner trying the link),
      // end that session properly first, then continue as the new administrator.
      if (user) await logout({ redirect: false });
      applySession(res.data, false);
      push("success", "Your account is ready.");
      router.replace(postLoginPath(res.data.user, res.data.tenant));
    } catch (err) {
      const apiErr = err instanceof ApiRequestError ? err : null;
      if (apiErr?.code && LINK_CODES.includes(apiErr.code)) {
        setLink({
          kind: "problem",
          code: apiErr.code,
          message: apiErr.message,
        });
      } else if (apiErr?.code === "VALIDATION_ERROR") {
        const fromServer = fieldErrors(apiErr.details);
        setErrors({
          name: fromServer.name ?? "",
          password: fromServer.password ?? "",
        });
        setFormError(Object.keys(fromServer).length ? null : apiErr.message);
      } else {
        setFormError(
          apiErr?.message ?? "Something went wrong. Please try again.",
        );
      }
      setSubmitting(false);
    }
  }

  const spinner = (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2
        className="size-6 animate-spin text-primary"
        aria-label="Loading"
      />
    </div>
  );

  if (authLoading) return spinner;

  if (!token) {
    return (
      <AuthShell title="This link doesn't work">
        <p className="text-sm text-foreground-muted">
          The link is incomplete. Open the link from your email again, or
          register your school again to get a new one.
        </p>
      </AuthShell>
    );
  }

  if (link.kind === "checking") return spinner;

  if (link.kind === "problem") {
    return (
      <AuthShell title={PROBLEM_TITLES[link.code] ?? "This link doesn't work"}>
        <div className="space-y-4 text-sm text-foreground-muted">
          <p>{link.message}</p>
          {link.code === "ALREADY_REGISTERED" && (
            <Link href="/login">
              <Button size="lg" className="w-full">
                Go to sign in
              </Button>
            </Link>
          )}
          {(link.code === "SCHOOL_EXISTS" ||
            link.code === "INVITE_EXPIRED" ||
            link.code === "INVITE_INVALID") && (
            <Link href="/signup">
              <Button variant="outline" size="lg" className="w-full">
                Register your school again
              </Button>
            </Link>
          )}
        </div>
      </AuthShell>
    );
  }

  const info = link.info;
  const isSignup = info.kind === "signup";
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <AuthShell
      variant="register"
      title={isSignup ? "Confirm your email" : `Set up ${info.schoolName}`}
      subtitle={
        isSignup
          ? "Your email is confirmed by opening this link. Choose your name and a password to create your account."
          : "Choose your name and a password to create the school administrator account."
      }
      footer={
        <Link
          href="/login"
          className="font-semibold text-primary hover:underline"
        >
          Already have an account? Sign in
        </Link>
      }
    >
      {user && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-sm text-info"
        >
          You are signed in as {user.email}. Creating this account will sign you
          out of that one.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="school" label="School">
          <Input
            id="school"
            icon={Building2}
            value={info.schoolName}
            readOnly
            disabled
          />
        </Field>
        <Field
          id="email"
          label="Email"
          hint="This is the email you will sign in with."
        >
          <Input
            id="email"
            icon={Mail}
            type="email"
            value={info.email}
            readOnly
            disabled
            autoComplete="username"
          />
        </Field>

        <Field
          id="name"
          label="Your full name"
          error={errors.name || undefined}
        >
          <Input
            icon={UserRound}
            id="name"
            autoComplete="name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
          />
        </Field>

        <div>
          <Field
            id="password"
            label="Password"
            error={errors.password || undefined}
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
            />
          </Field>
          <PasswordChecklist password={password} />
        </div>

        <Field
          id="confirm"
          label="Confirm password"
          error={
            mismatch || errors.confirm
              ? "The passwords do not match."
              : undefined
          }
        >
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch || !!errors.confirm}
          />
        </Field>

        {formError && (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={!name || !password || !confirm}
        >
          Create my account
        </Button>
      </form>
    </AuthShell>
  );
}

export default function AcceptInvitePage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
