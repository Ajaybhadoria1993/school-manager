import { useState } from "react";
import { Ban, Search, Stamp } from "lucide-react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useCancelCertificateMutation, useGetCertificateQuery, useIssueCertificateMutation, useSearchDocumentStudentsQuery } from "../../redux/api/documentsApi";
import type { Certificate, CertificateType } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { CertificateView, CERTIFICATE_TITLE } from "./CertificateView";
import { DocumentDialog } from "./DocumentDialog";

export const CERTIFICATE_LABEL: Record<CertificateType, string> = { bonafide: "Bonafide certificate", character: "Character certificate", transfer: "Transfer certificate (TC)" };

/** One certificate, to read and print. */
export function CertificateDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const res = useGetCertificateQuery(id);
  const c = res.data?.data;
  return (
    <DocumentDialog title={c ? CERTIFICATE_TITLE[c.type].toLowerCase().replace(/^./, (x) => x.toUpperCase()) : "Certificate"} onClose={onClose}>
      {c ? <CertificateView certificate={c} /> : res.error ? <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the certificate."}</p> : <Skeleton className="h-64 rounded-xl" />}
    </DocumentDialog>
  );
}

/**
 * Issue a certificate: for the student the person is on (a student's page), or one found by name or admission number. A transfer certificate is only for
 * a student who has left; the other two are for one who is here. The certificate is numbered and written in the register, then shown to print.
 */
export function IssueCertificateDialog({ student, onClose, onIssued }: { student?: { id: string; name: string; left: boolean }; onClose: () => void; onIssued: (c: Certificate) => void }) {
  const [typed, setTyped] = useState("");
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(student ? { id: student.id, name: student.name } : null);
  const [type, setType] = useState<CertificateType>(student?.left ? "transfer" : "bonafide");
  const [purpose, setPurpose] = useState("");
  const [conduct, setConduct] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const query = useDebouncedValue(typed.trim(), 250);
  const found = useSearchDocumentStudentsQuery(query, { skip: chosen !== null || query.length < 2 });
  const [issue, issuing] = useIssueCertificateMutation();
  const { push } = useToast();
  const kinds: CertificateType[] = student ? (student.left ? ["transfer"] : ["bonafide", "character"]) : ["bonafide", "character"];

  async function submit() {
    if (!chosen) return setProblem("Choose the student");
    setProblem(null);
    try {
      const made = await issue({ studentId: chosen.id, type, purpose: purpose.trim(), conduct: conduct.trim() }).unwrap();
      push("success", `${made.data.number} issued`);
      onIssued(made.data);
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not issue the certificate. Please try again.");
    }
  }

  return (
    <AppModal
      title="Issue a certificate"
      icon={Stamp}
      busy={issuing.isLoading}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={issuing.isLoading}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={issuing.isLoading} disabled={!chosen}>
            Issue
          </Button>
        </>
      }
    >
      {student ? (
        <p className="text-sm text-foreground-secondary">
          For <b className="text-foreground">{student.name}</b>.
        </p>
      ) : (
        <>
          <Field id="cert-student" label="Student" hint="Type a name or an admission number.">
            <Input id="cert-student" icon={Search} value={chosen ? chosen.name : typed} readOnly={chosen !== null} placeholder="Search a student" autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          </Field>
          {chosen ? (
            <Button variant="ghost" size="sm" onClick={() => setChosen(null)}>
              Change student
            </Button>
          ) : query.length >= 2 ? (
            (found.data?.data.items.length ?? 0) === 0 ? (
              found.isFetching ? (
                <Skeleton className="h-10 rounded-lg" />
              ) : (
                <p className="text-sm text-foreground-muted">No student matches “{query}”.</p>
              )
            ) : (
              <ul aria-label="Students found" className="max-h-44 divide-y divide-border overflow-auto rounded-lg border border-border">
                {found.data!.data.items.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => setChosen({ id: s.id, name: s.name })}>
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-xs text-foreground-muted">{[s.classLabel, s.admissionNumber].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          <p className="text-xs text-foreground-muted">A transfer certificate is made from the page of a student who has left.</p>
        </>
      )}

      <Field id="cert-type" label="Kind of certificate">
        <Select id="cert-type" options={kinds.map((k) => ({ value: k, label: CERTIFICATE_LABEL[k] }))} value={type} onChange={(v) => setType(v as CertificateType)} disabled={kinds.length === 1} />
      </Field>
      {type === "bonafide" && (
        <Field id="cert-purpose" label="What it is needed for" optional hint="For example: opening a bank account, a passport.">
          <Input id="cert-purpose" value={purpose} maxLength={200} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
      )}
      {type === "character" && (
        <Field id="cert-conduct" label="Conduct" optional hint="Good if left empty.">
          <Input id="cert-conduct" value={conduct} maxLength={60} placeholder="Good" onChange={(e) => setConduct(e.target.value)} />
        </Field>
      )}
      {type === "transfer" && (
        <Field id="cert-remarks" label="Remarks" optional hint="Printed in the Remarks line of the certificate.">
          <Textarea id="cert-remarks" value={purpose} maxLength={200} rows={2} onChange={(e) => setPurpose(e.target.value)} />
        </Field>
      )}
      <ModalError message={problem} />
    </AppModal>
  );
}

/** Cancel a certificate: its number stays in the register, marked cancelled, with the reason. */
export function CancelCertificateDialog({ certificate, onClose }: { certificate: Pick<Certificate, "id" | "number">; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [cancel, cancelling] = useCancelCertificateMutation();
  const { push } = useToast();

  async function submit() {
    if (reason.trim() === "") return setProblem("Write why it is cancelled");
    setProblem(null);
    try {
      await cancel({ id: certificate.id, reason: reason.trim() }).unwrap();
      push("success", `${certificate.number} cancelled`);
      onClose();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not cancel the certificate. Please try again.");
    }
  }

  return (
    <AppModal
      title={`Cancel ${certificate.number}`}
      icon={Ban}
      tone="danger"
      busy={cancelling.isLoading}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={cancelling.isLoading}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={cancelling.isLoading}>
            Cancel the certificate
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground-secondary">The number stays in the register, marked cancelled. Issue a new certificate if one is still needed.</p>
      <Field id="cert-cancel-reason" label="Why is it cancelled?">
        <Textarea id="cert-cancel-reason" value={reason} maxLength={200} rows={2} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ModalError message={problem} />
    </AppModal>
  );
}
