import { API_URL } from "../../redux/api/baseQueryWithReauth";
import type { CertificateSheet, CertificateType } from "../../types";
import { formatDay } from "../../utils/academicYear";
import "./documents.css";

export const CERTIFICATE_TITLE: Record<CertificateType, string> = { bonafide: "BONAFIDE CERTIFICATE", character: "CHARACTER CERTIFICATE", transfer: "TRANSFER CERTIFICATE" };

/** "son of", "daughter of" by the student's gender, and the pronoun that goes with it. */
function wordsFor(gender: string) {
  if (gender === "Male") return { child: "son", he: "He", his: "his" };
  if (gender === "Female") return { child: "daughter", he: "She", his: "her" };
  return { child: "child", he: "The student", his: "their" };
}
const parents = (father: string | null, mother: string | null) => [father && `Mr. ${father}`, mother && `Mrs. ${mother}`].filter(Boolean).join(" and ");

/**
 * A certificate of the school on an A4 page: a bonafide ("is a student of this school"), a character certificate, or a transfer certificate (a table of
 * what the school keeps about the student who left). The number and the day are at the top; the lines to sign at the foot. A cancelled one says so
 * across the top, so a copy that was cancelled is never taken for a good one.
 */
export function CertificateView({ certificate: c }: { certificate: CertificateSheet }) {
  const f = c.facts;
  const w = wordsFor(f.gender);
  const family = parents(f.fatherName, f.motherName);
  return (
    <article className="report-card compact" aria-label={`${CERTIFICATE_TITLE[c.type]} ${c.number}`} style={{ minHeight: "200mm" }}>
      <header>
        {c.school.logoUrl && <img src={`${API_URL}${c.school.logoUrl}`} alt="" />}
        <div>
          <h1>{c.school.name}</h1>
          {c.school.address && <p style={{ margin: 0 }}>{c.school.address}</p>}
          <p className="small" style={{ margin: 0 }}>
            {[c.school.phone && `Phone ${c.school.phone}`, c.school.board && `${c.school.board}${c.school.affiliationNumber ? ` Affiliation ${c.school.affiliationNumber}` : ""}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>
      {c.status === "cancelled" && (
        <p className="fail" style={{ margin: "3mm 0 0", textAlign: "center", fontWeight: 700 }}>
          CANCELLED{c.cancelReason ? `: ${c.cancelReason}` : ""}
        </p>
      )}
      <div className="meta">
        <span>
          <b>No.</b> {c.number}
        </span>
        <span>
          <b>Date</b> {formatDay(c.issuedOn)}
        </span>
      </div>
      <h2 style={{ margin: "8mm 0 4mm", textDecoration: "underline" }}>{CERTIFICATE_TITLE[c.type]}</h2>

      {c.type === "bonafide" && (
        <p className="body-text">
          This is to certify that <b>{f.studentName}</b>, {w.child} of {family || "the parents named in the school's records"}, bearing Admission No. <b>{f.admissionNumber}</b>, is a bonafide student of this school, studying in{" "}
          <b>{f.classLabel ?? "this school"}</b> in the session {c.year}. {w.his[0].toUpperCase() + w.his.slice(1)} date of birth as recorded in the school's register is <b>{formatDay(f.dateOfBirth)}</b>.
          {c.purpose ? ` This certificate is issued at the request of the parent for ${c.purpose}.` : " This certificate is issued at the request of the parent."}
        </p>
      )}

      {c.type === "character" && (
        <p className="body-text">
          This is to certify that <b>{f.studentName}</b>, {w.child} of {family || "the parents named in the school's records"}, bearing Admission No. <b>{f.admissionNumber}</b>, has been a student of this school since{" "}
          {formatDay(f.admissionDate)} and is studying in <b>{f.classLabel ?? "this school"}</b>. As far as the school knows, {w.his} conduct and character have been <b>{c.conduct ?? "good"}</b>. {w.he} bears no
          disciplinary record that stops this certificate.
        </p>
      )}

      {c.type === "transfer" && (
        <table style={{ marginTop: "4mm" }}>
          <tbody>
            {(
              [
                ["Name of the student", f.studentName],
                ["Admission number", f.admissionNumber],
                ["Father's name", f.fatherName ?? "-"],
                ["Mother's name", f.motherName ?? "-"],
                ["Date of birth", formatDay(f.dateOfBirth)],
                ["Date of admission", formatDay(f.admissionDate)],
                ["Class last studied", f.classLabel ?? "-"],
                ["Date of leaving", f.leftOn ? formatDay(f.leftOn) : "-"],
                ["Reason for leaving", f.leavingReason ?? "-"],
                ["Going to", f.goingTo ?? "-"],
                ["Remarks", c.purpose ?? "-"],
              ] as const
            ).map(([label, value]) => (
              <tr key={label}>
                <th scope="row" style={{ width: "60mm" }}>
                  {label}
                </th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="signs">
        <div>Class teacher</div>
        <div>Principal{c.principalName ? `: ${c.principalName}` : ""}</div>
      </div>
    </article>
  );
}
