import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Building2, Mail } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useNoReferrer } from "../../hooks/useNoReferrer";
import { useAcceptLoginInviteMutation, useCheckLoginInviteMutation } from "../../redux/api/authApi";
import { getApiError } from "../../utils/apiErrors";
import { postLoginPath } from "../../utils/postLoginPath";
import { isPasswordValid } from "../../utils/validators";
import { AuthShell } from "../../components/auth/AuthShell";
import { PasswordChecklist } from "../../components/auth/PasswordChecklist";
import { PasswordInput } from "../../components/auth/PasswordInput";
import { PageSpinner } from "../../components/shared/PageSpinner";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { useToast } from "../../components/ui/toast-context";
import type { LoginInviteInfo } from "../../types";

type LinkState = { kind: "checking" } | { kind: "valid"; info: LoginInviteInfo } | { kind: "problem"; code: string; message: string };

const PROBLEM_TITLES: Record<string, string> = {
  INVITE_EXPIRED: "This link has expired",
  ALREADY_REGISTERED: "This link was already used",
};
const LINK_CODES = ["INVITE_INVALID", "INVITE_EXPIRED", "ALREADY_REGISTERED"];

/**
 * `/set-password?token=` (2026-11-26): where the invitation lands that a teacher or a staff member gets when their school gives them login
 * access. It shows the school and the email (their login), they choose a password, and they are signed in; from then on they sign in with that
 * email and password (and can use Forgot password). The school's link for a login that already works (a new password) lands here too.
 */
export default function SetPassword() {
  useNoReferrer();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading, applySession, logout } = useAuth();
  const { push } = useToast();
  const [checkLink] = useCheckLoginInviteMutation();
  const [accept] = useAcceptLoginInviteMutation();

  // Captured once, on the first render, before the address is cleaned below.
  const [token] = useState<string | null>(() => searchParams.get("token"));
  const [link, setLink] = useState<LinkState>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The one-time token should not linger in history, screenshots or a copied address.
  useEffect(() => {
    if (token) navigate(pathname, { replace: true });
  }, [token, pathname, navigate]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    // POST, so the one-time token travels in the body and never lands in a server's access log.
    checkLink({ token })
      .unwrap()
      .then((res) => !cancelled && setLink({ kind: "valid", info: res.data }))
      .catch((err) => {
        if (cancelled) return;
        const e = getApiError(err);
        setLink({ kind: "problem", code: e?.code ?? "UNKNOWN", message: e?.message ?? "Something went wrong. Please try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [token, checkLink]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    if (!isPasswordValid(password)) {
      setError("The password does not meet all the requirements below.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await accept({ token, password }).unwrap();
      // Somebody else signed in on this browser (the school admin trying the link): end that session first.
      if (user) await logout({ redirect: false });
      // Not "remember": the person may be on a shared computer, and they chose no such thing here.
      applySession(res.data, false);
      push("success", "Your password is set. You are signed in.");
      navigate(postLoginPath(res.data.user, res.data.tenant), { replace: true });
    } catch (err) {
      const apiErr = getApiError(err);
      if (apiErr?.code && LINK_CODES.includes(apiErr.code)) setLink({ kind: "problem", code: apiErr.code, message: apiErr.message });
      else setError(apiErr?.message ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (authLoading) return <PageSpinner />;

  if (!token) {
    return (
      <AuthShell title="This link doesn't work" tall>
        <p className="text-sm text-foreground-muted">The link is incomplete. Open the link from your email again, or ask your school to send it again.</p>
      </AuthShell>
    );
  }

  if (link.kind === "checking") return <PageSpinner />;

  if (link.kind === "problem") {
    return (
      <AuthShell title={PROBLEM_TITLES[link.code] ?? "This link doesn't work"} tall>
        <div className="space-y-4 text-sm text-foreground-muted">
          <p>{link.message}</p>
          <Link to="/login">
            <Button size="lg" className="h-[var(--lp-btn)] w-full rounded-full text-lg">
              Go to sign in
            </Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  const { info } = link;
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <AuthShell tall title="Set your password" subtitle={`Hi ${info.name}, choose a password. You will sign in with your email and this password.`}>
      {user && (
        <p role="status" className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          You are signed in as {user.email ?? user.username}. Setting this password signs you out of that account.
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {info.schoolName && (
          <Field id="school" label="School">
            <Input id="school" icon={Building2} value={info.schoolName} readOnly disabled className="h-[var(--lp-field)]" />
          </Field>
        )}
        <Field id="email" label="Email">
          <Input id="email" icon={Mail} type="email" value={info.email} readOnly disabled autoComplete="username" className="h-[var(--lp-field)]" />
        </Field>
        <div>
          <Field id="password" label="Password">
            <PasswordInput id="password" autoComplete="new-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="h-[var(--lp-field)]" />
          </Field>
          <PasswordChecklist password={password} />
        </div>
        <Field id="confirm" label="Confirm password" error={mismatch ? "The passwords do not match." : undefined}>
          <PasswordInput id="confirm" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} className="h-[var(--lp-field)]" />
        </Field>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="h-[var(--lp-btn)] w-full rounded-full text-lg" loading={submitting} disabled={!password || !confirm}>
          Set password
        </Button>
      </form>
    </AuthShell>
  );
}
