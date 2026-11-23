import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Mail, MailCheck } from "lucide-react";
import { useForgotPasswordMutation } from "../../redux/api/authApi";
import { getApiError } from "../../utils/apiErrors";
import { isEmail } from "../../utils/validators";
import { AuthShell } from "../../components/auth/AuthShell";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";

// Matches the server, which ignores a second request for the same account within a minute.
const RESEND_SECONDS = 60;

/** Under the form of every screen here: the way back (small words, in the middle of the circle). */
const BACK = (
  <p className="text-center text-sm text-foreground-muted">
    <Link to="/login" className="font-semibold text-primary hover:underline">
      Back to sign in
    </Link>
  </p>
);

export default function ForgotPassword() {
  const [forgotPassword] = useForgotPasswordMutation();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [ttlMinutes, setTtlMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await forgotPassword({ email: email.trim() }).unwrap();
      setTtlMinutes(res.data?.ttlMinutes ?? null);
      setSentTo(email.trim());
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(getApiError(err)?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email" footer={BACK}>
        <div className="space-y-3 text-center text-sm text-foreground-muted">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <MailCheck className="size-6" aria-hidden />
          </div>
          {/* Same wording whether or not the account exists, on purpose. */}
          <p>
            If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we have sent a link
            to reset the password. It works once and expires {ttlMinutes ? `in ${ttlMinutes} minutes` : "soon"}.
          </p>
          <p>Nothing in your inbox? Check the spam folder.</p>
          <Button variant="outline" size="lg" className="h-[var(--lp-field)] w-full rounded-full" onClick={() => send()} loading={submitting} disabled={cooldown > 0}>
            {cooldown > 0 ? `Send again in ${cooldown}s` : "Send again"}
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we will send you a link to choose a new one." footer={BACK}>
      <form onSubmit={send} className="space-y-[var(--lp-gap)]" noValidate>
        <div>
          <Label htmlFor="email" className="sr-only">
            Email
          </Label>
          <Input
            icon={Mail}
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="h-[var(--lp-field)]"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="h-[var(--lp-btn)] w-full rounded-full text-lg" loading={submitting} disabled={!email}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
