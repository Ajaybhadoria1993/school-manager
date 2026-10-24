import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import { useNoReferrer } from "../../hooks/useNoReferrer";
import { useResetPasswordMutation } from "../../redux/api/authApi";
import { getApiError } from "../../utils/apiErrors";
import { postLoginPath } from "../../utils/postLoginPath";
import { isPasswordValid } from "../../utils/validators";
import { AuthShell } from "../../components/auth/AuthShell";
import { PasswordChecklist } from "../../components/auth/PasswordChecklist";
import { PasswordInput } from "../../components/auth/PasswordInput";
import { useToast } from "../../components/ui/toast-context";
import { Button } from "../../components/ui/Button";
import { Label } from "../../components/ui/Input";

export default function ResetPassword() {
  useNoReferrer();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [resetPassword] = useResetPasswordMutation();
  const { push } = useToast();

  // Captured once, on the first render, before the address is cleaned below.
  const [token] = useState<string | null>(() => searchParams.get("token"));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Take the token out of the address bar right away so it does not linger in history,
  // screenshots or a copied URL.
  useEffect(() => {
    if (token) navigate(pathname, { replace: true });
  }, [token, pathname, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isPasswordValid(password)) {
      setError("Your new password does not meet all the requirements below.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await resetPassword({ token, newPassword: password }).unwrap();
      // Not "remember": the person may be on a shared computer, and they chose no such thing here.
      applySession(res.data, false);
      push("success", "Password updated. You are signed in.");
      navigate(postLoginPath(res.data.user, res.data.tenant), { replace: true });
    } catch (err) {
      const apiErr = getApiError(err);
      if (apiErr?.code === "RESET_INVALID") {
        setLinkInvalid(true);
      } else {
        setError(apiErr?.message ?? "Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  if (!token || linkInvalid) {
    return (
      <AuthShell title="This link doesn't work">
        <div className="space-y-4 text-sm text-foreground-muted">
          <p>The reset link is invalid, has already been used, or has expired. Reset links work only once and expire after a short time.</p>
          <Link to="/forgot-password">
            <Button size="lg" className="w-full">Get a new link</Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <AuthShell title="Choose a new password" subtitle="You will be signed in on this device and signed out everywhere else.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordChecklist password={password} />
        </div>
        <div>
          <Label htmlFor="confirm">Confirm new password</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
          />
          {mismatch && <p className="mt-1 text-xs text-danger">The passwords do not match.</p>}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!password || !confirm}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
