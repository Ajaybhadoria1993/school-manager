import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Building2, Mail, MailCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSignupMutation } from "../../redux/api/authApi";
import { getApiError } from "../../utils/apiErrors";
import { PageSpinner } from "../../components/shared/PageSpinner";
import { postLoginPath } from "../../utils/postLoginPath";
import { isEmail } from "../../utils/validators";
import { AuthShell } from "../../components/auth/AuthShell";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";

const RESEND_SECONDS = 60;

export default function SignupPage() {
  const navigate = useNavigate();
  const { user, tenant, loading: authLoading } = useAuth();
  const [signup] = useSignupMutation();

  const [schoolName, setSchoolName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{
    schoolName?: string;
    email?: string;
    form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [ttlHours, setTtlHours] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!authLoading && user) navigate(postLoginPath(user, tenant), { replace: true });
  }, [authLoading, user, tenant, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const next: typeof errors = {};
    if (schoolName.trim().length < 2)
      next.schoolName = "Enter your school's name.";
    if (!isEmail(email)) next.email = "Enter a valid email address.";
    setErrors(next);
    if (next.schoolName || next.email) return;

    setSubmitting(true);
    try {
      const res = await signup({ schoolName: schoolName.trim(), email: email.trim() }).unwrap();
      setTtlHours(res.data?.ttlHours ?? null);
      setSentTo(email.trim());
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      const apiErr = getApiError(err);
      if (apiErr?.code === "SCHOOL_EXISTS")
        setErrors({ schoolName: apiErr.message });
      else
        setErrors({
          form: apiErr?.message ?? "Something went wrong. Please try again.",
        });
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || user) return <PageSpinner />;

  if (sentTo) {
    return (
      <AuthShell title="Check your email" variant="register" footer={<span />}>
        <div className="space-y-4 text-sm text-foreground-muted">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <MailCheck className="size-6" aria-hidden />
          </div>
          <p>
            We sent a link to{" "}
            <span className="font-medium text-foreground">{sentTo}</span>. Open
            it to confirm your email and create your administrator account.
          </p>
          <p>
            The link works once and is valid for{" "}
            {ttlHours ? `${ttlHours} hours` : "a limited time"}. Nothing in your
            inbox? Check the spam folder.
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <Button
              variant="outline"
              size="lg"
              onClick={() => submit()}
              loading={submitting}
              disabled={cooldown > 0}
            >
              {cooldown > 0
                ? `Send again in ${cooldown}s`
                : "Send the link again"}
            </Button>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Use a different email or school name
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      variant="register"
      title="Register your school"
      subtitle="We will email you a link to confirm your address. It takes about five minutes."
      footer={
        <span>
          Already registered?{" "}
          <Link
            to="/login"
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field
          id="schoolName"
          label="School name"
          error={errors.schoolName}
          hint="As it should appear on the platform. Add the city if the name is common."
        >
          <Input
            icon={Building2}
            id="schoolName"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="Green Valley Public School, Pune"
            autoComplete="organization"
            autoFocus
            required
            aria-invalid={!!errors.schoolName}
            aria-describedby={
              errors.schoolName ? "schoolName-error" : undefined
            }
          />
        </Field>

        <Field
          id="email"
          label="Your email"
          error={errors.email}
          hint="You will sign in with this. We send the confirmation link here."
        >
          <Input
            icon={Mail}
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="principal@school.in"
            autoComplete="email"
            required
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
        </Field>

        {errors.form && (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {errors.form}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={!schoolName || !email}
        >
          Continue
        </Button>
        <p className="text-xs leading-relaxed text-foreground-muted">
          By continuing you agree to be contacted about your registration. Our
          team reviews every school.
        </p>
      </form>
    </AuthShell>
  );
}
