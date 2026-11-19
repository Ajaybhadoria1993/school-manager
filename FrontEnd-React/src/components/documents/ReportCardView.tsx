import { API_URL } from "../../redux/api/baseQueryWithReauth";
import type { ReportCard } from "../../types";
import { formatDay } from "../../utils/academicYear";
import "./documents.css";

/** "7:12" style marks: whole numbers without a decimal, half marks with one. */
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * One student's exam report card on an A4 page: the school's header, the student, each subject's marks out of its maximum with the percentage and
 * the grade, the total, the grade and the result (a pass needs every subject with a mark at or above the pass mark), the attendance of the session,
 * and the lines to sign. A subject with no mark in yet shows "-" and an absent paper "Absent"; neither is counted in the total.
 */
export function ReportCardView({ card }: { card: ReportCard }) {
  const { school, student: s, totals, attendance: a } = card;
  return (
    <article className="report-card" aria-label={`Report card of ${s.name}`}>
      <header>
        {school.logoUrl && <img src={`${API_URL}${school.logoUrl}`} alt="" />}
        <div>
          <h1>{school.name}</h1>
          {school.address && <p style={{ margin: 0 }}>{school.address}</p>}
          <p className="small" style={{ margin: 0 }}>
            {[school.phone && `Phone ${school.phone}`, school.email, school.board && `${school.board}${school.affiliationNumber ? ` Affiliation ${school.affiliationNumber}` : ""}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      <h2>
        REPORT CARD · {card.exam.name} · {card.year.name}
      </h2>

      {s.photo && <img className="photo" src={s.photo} alt={`Photo of ${s.name}`} />}
      <dl className="student">
        <div>
          <dt>Student</dt>
          <dd>{s.name}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd>{[s.className, s.sectionName].filter(Boolean).join(" - ") || "-"}</dd>
        </div>
        <div>
          <dt>Admission no.</dt>
          <dd>{s.admissionNumber}</dd>
        </div>
        <div>
          <dt>Roll no.</dt>
          <dd>{s.rollNumber ?? "-"}</dd>
        </div>
        <div>
          <dt>Date of birth</dt>
          <dd>{formatDay(s.dateOfBirth)}</dd>
        </div>
        <div>
          <dt>Father</dt>
          <dd>{s.fatherName ?? "-"}</dd>
        </div>
        <div>
          <dt>Mother</dt>
          <dd>{s.motherName ?? "-"}</dd>
        </div>
      </dl>

      <table>
        <caption className="sr-only">Marks in {card.exam.name}</caption>
        <thead>
          <tr>
            <th scope="col">Subject</th>
            <th scope="col" className="num">
              Marks
            </th>
            <th scope="col" className="num">
              Out of
            </th>
            <th scope="col" className="num">
              %
            </th>
            <th scope="col">Grade</th>
          </tr>
        </thead>
        <tbody>
          {card.subjects.length === 0 ? (
            <tr>
              <td colSpan={5}>No paper of this exam is set for this class.</td>
            </tr>
          ) : (
            card.subjects.map((r) => (
              <tr key={r.subject}>
                <th scope="row" style={{ background: "transparent" }}>
                  {r.subject}
                </th>
                <td className={r.passed === false ? "num fail" : "num"}>{r.absent ? "Absent" : r.marks === null ? "-" : num(r.marks)}</td>
                <td className="num">{r.marks === null ? "-" : r.outOf}</td>
                <td className="num">{r.percent === null ? "-" : r.percent}</td>
                <td>{r.grade ?? "-"}</td>
              </tr>
            ))
          )}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">
                <b>{num(totals.marks)}</b>
              </td>
              <td className="num">{totals.outOf}</td>
              <td className="num">
                <b>{totals.percent}</b>
              </td>
              <td>
                <b>{totals.grade}</b>
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      <p style={{ margin: "3mm 0 0" }}>
        <b>Result:</b>{" "}
        {totals === null ? (
          "Marks are not in yet."
        ) : (
          <b className={totals.result === "fail" ? "fail" : undefined}>{totals.result === "pass" ? "Pass" : "Not passed (below the pass mark in a subject)"}</b>
        )}
      </p>
      {card.rank && (
        <p style={{ margin: "1mm 0 0" }}>
          <b>Rank in class:</b> {card.rank.position} of {card.rank.of}
        </p>
      )}
      <p style={{ margin: "1mm 0 0" }}>
        <b>Attendance:</b> {a.days === 0 ? "not taken yet" : `${a.present + a.late} of ${a.days} days (${a.percent}%)`}
      </p>
      {card.remark && (
        <p style={{ margin: "3mm 0 0" }}>
          <b>Class teacher&apos;s remark:</b> {card.remark}
        </p>
      )}
      <p className="small" style={{ margin: "3mm 0 0" }}>
        Pass mark {card.passPercent}%. Grades: {card.gradeBands.map((b, i) => (i === card.gradeBands.length - 1 ? `${b.grade} below ${card.gradeBands[i - 1]?.min ?? 100}` : `${b.grade} ${b.min}+`)).join(", ")}.
      </p>

      <div className="signs">
        <div>Class teacher{card.classTeacher ? `: ${card.classTeacher}` : ""}</div>
        <div>Parent</div>
        <div>Principal{card.principalName ? `: ${card.principalName}` : ""}</div>
      </div>
      <p className="small" style={{ margin: "4mm 0 0", textAlign: "right" }}>
        Printed on {formatDay(card.generatedOn)}
      </p>
    </article>
  );
}
