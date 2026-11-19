import { API_URL } from "../../redux/api/baseQueryWithReauth";
import type { AdmitCard } from "../../types";
import { formatDay } from "../../utils/academicYear";
import { clock } from "../../utils/transport";
import "./documents.css";

/**
 * A student's admit card (hall ticket) for one exam: the school, the student and their photo, and the class's papers in the order they are written
 * (day, subject, start and end), with what to bring and what is not allowed, and the line for the principal.
 */
export function AdmitCardView({ card }: { card: AdmitCard }) {
  const { school, student: s, exam } = card;
  return (
    <article className="report-card compact" aria-label={`Admit card of ${s.name}`}>
      <header>
        {school.logoUrl && <img src={`${API_URL}${school.logoUrl}`} alt="" />}
        <div>
          <h1>{school.name}</h1>
          {school.address && <p style={{ margin: 0 }}>{school.address}</p>}
        </div>
      </header>
      <h2>
        ADMIT CARD · {exam.name} · {card.year.name}
      </h2>

      {s.photo && <img className="photo" src={s.photo} alt={`Photo of ${s.name}`} />}
      <dl className="student">
        <div>
          <dt>Student</dt>
          <dd>{s.name}</dd>
        </div>
        <div>
          <dt>Class</dt>
          <dd>{s.classLabel ?? "-"}</dd>
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
      </dl>

      <table>
        <caption className="sr-only">Papers of {exam.name}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Day</th>
            <th scope="col">Subject</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {card.papers.length === 0 ? (
            <tr>
              <td colSpan={4}>The timetable of this class is not made yet.</td>
            </tr>
          ) : (
            card.papers.map((p) => (
              <tr key={`${p.date}-${p.start}-${p.subject}`}>
                <td>{formatDay(p.date)}</td>
                <td>{p.day}</td>
                <th scope="row" style={{ background: "transparent" }}>
                  {p.subject}
                </th>
                <td>
                  {clock(p.start)} to {clock(p.end)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p style={{ margin: "4mm 0 0" }}>
        <b>Instructions</b>
      </p>
      <ol>
        {card.instructions.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ol>

      <div className="signs" style={{ marginTop: "14mm" }}>
        <div>Student</div>
        <div>Principal{card.principalName ? `: ${card.principalName}` : ""}</div>
      </div>
    </article>
  );
}
