import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, GraduationCap, Mail } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { getApiError } from "../../utils/apiErrors";
import { PageSpinner } from "../../components/shared/PageSpinner";
import { postLoginPath } from "../../utils/postLoginPath";
import { isEmail, isUsername } from "../../utils/validators";
import { AuthShell } from "../../components/auth/AuthShell";
import { PasswordInput } from "../../components/auth/PasswordInput";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";

const REASON_MESSAGES: Record<string, string> = {
  expired: "Your session has expired. Please sign in again.",
  disabled: "Your account has been disabled. Please contact your administrator.",
  suspended: "Your school has been suspended, so you were signed out. Please contact the platform administrator.",
};

export default function Login() {
  const { user, tenant, loading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (or just signed in): leave this page.
  useEffect(() => {
    if (!authLoading && user) navigate(postLoginPath(user, tenant), { replace: true });
  }, [authLoading, user, tenant, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // An email has the @ and a username never can: the server tells them apart the same way.
    const who = identifier.trim().toLowerCase();
    if (!isEmail(who) && !isUsername(who)) {
      setError("Enter a valid email address or username.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await login(who, password, rememberMe);
      navigate(postLoginPath(session.user, session.tenant), { replace: true });
    } catch (err) {
      setError(getApiError(err)?.message ?? "Unable to sign in right now.");
      setSubmitting(false);
    }
  }

  if (authLoading || user) return <PageSpinner />;

  const notice = reason ? REASON_MESSAGES[reason] : undefined;

  return (
    <AuthShell
      title="Login to Your Account"
      subtitle="Access your dashboard and explore more"
      footer={
        // Where the design has "or / Login as Student": students have no login of their own, so this is the way to a new school
        // (the landing page, which used to lead there, is gone).
        <>
          <p aria-hidden className="flex items-center gap-4 text-sm text-foreground-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </p>
          <Link
            to="/signup"
            className="login-register mt-[var(--lp-gap)] inline-flex h-[var(--lp-field)] w-full items-center justify-center gap-2.5 rounded-full border border-primary/25 bg-primary-soft text-[15px] font-semibold text-primary-deep transition-colors hover:border-primary/50 hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
          >
            <GraduationCap className="size-5" aria-hidden />
            Register your school
          </Link>
        </>
      }
    >
      {notice && (
        <p role="status" className="mb-4 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info">
          {notice}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-[var(--lp-gap)]" noValidate>
        {/* The design shows the words inside the boxes; the labels stay for screen readers. */}
        <div>
          <Label htmlFor="identifier" className="sr-only">
            Email or username
          </Label>
          <Input
            icon={Mail}
            id="identifier"
            type="text"
            lowercase
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Email or username"
            className="h-[var(--lp-field)]"
          />
        </div>
        <div>
          <Label htmlFor="password" className="sr-only">
            Password
          </Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="h-[var(--lp-field)]"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[15px] text-foreground">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="size-[18px] rounded border-border accent-[var(--primary)]"
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-[15px] font-semibold text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="h-[var(--lp-btn)] w-full rounded-full text-lg" loading={submitting} disabled={!identifier || !password}>
          {submitting ? "Logging in" : "Login"}
          {!submitting && (
            <span aria-hidden className="ml-1 flex size-8 items-center justify-center rounded-full bg-white text-primary">
              <ArrowRight className="size-5" />
            </span>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
