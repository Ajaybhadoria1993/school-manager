import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { User } from "lucide-react";
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
      title="Sign in to your account"
      subtitle="Enter your email or username and password."
      footer={
        <span>
          New school?{" "}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
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
          <Label htmlFor="identifier">Email or username</Label>
          <Input
            icon={User}
            id="identifier"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@school.in or username"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password" className="mb-0">
              Password
            </Label>
            <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
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

        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!identifier || !password}>
          {submitting ? "Signing in" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
