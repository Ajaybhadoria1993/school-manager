import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useInviteSchoolMutation } from "../../redux/api/tenantApi";
import { getApiError } from "../../utils/apiErrors";
import { isEmail } from "../../utils/validators";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { Select } from "../ui/Select";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/toast-context";
import type { InviteResult, SubscriptionTier } from "../../types";

const PLAN_OPTIONS: { value: SubscriptionTier; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium" },
];

export function InviteSchoolModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { push } = useToast();
  const [inviteSchool] = useInviteSchoolMutation();
  const [schoolName, setSchoolName] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<SubscriptionTier>("basic");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setSchoolName("");
    setEmail("");
    setTier("basic");
    setError(null);
    setResult(null);
    setCopied(false);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (schoolName.trim().length < 2) return setError("Enter the school name.");
    if (!isEmail(email)) return setError("Enter a valid email address for the school administrator.");

    setSubmitting(true);
    try {
      const res = await inviteSchool({
        schoolName: schoolName.trim(),
        contactEmail: email.trim(),
        subscriptionTier: tier,
      }).unwrap();
      if (res.data.emailSent) {
        push("success", `Invitation sent to ${res.data.tenant.contactEmail}`);
      } else {
        push("error", "School created, but the email could not be sent. Use “Resend invite” on that school.");
      }
      // In development without SMTP the link is shown so the flow can be tried without a mailbox.
      if (res.data.devInviteLink) setResult(res.data);
      else close();
    } catch (err) {
      setError(getApiError(err)?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!result?.devInviteLink) return;
    try {
      await navigator.clipboard.writeText(result.devInviteLink);
      setCopied(true);
    } catch {
      push("error", "Could not copy. Select the link and copy it manually.");
    }
  }

  return (
    <Modal open={open} onClose={close} title={result ? "Invitation created" : "Invite a school"}>
      {result?.devInviteLink ? (
        <div className="space-y-4 text-sm">
          <p className="text-foreground-muted">
            Email is not configured on the server, so nothing was sent. Open this link yourself to continue as the
            school admin:
          </p>
          <div className="break-all rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-xs text-foreground">
            {result.devInviteLink}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={copyLink}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-sm text-foreground-muted">
            We will email the school administrator a link to create their account. They will then fill in the school
            details for your approval.
          </p>

          <div>
            <Label htmlFor="schoolName">School name</Label>
            <Input
              id="schoolName"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Green Valley Public School, Pune"
              autoFocus
              required
            />
          </div>

          <div>
            <Label htmlFor="adminEmail">School administrator&apos;s email</Label>
            <Input
              id="adminEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="principal@school.in"
              required
            />
            <p className="mt-1 text-xs text-foreground-muted">The invitation goes here, and they will sign in with it.</p>
          </div>

          <div>
            <Label id="tier-label" htmlFor="tier">
              Plan
            </Label>
            <Select id="tier" value={tier} onChange={(value) => setTier(value as SubscriptionTier)} options={PLAN_OPTIONS} />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Send invitation
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
