import { QRCodeSVG } from "qrcode.react";
import { API_URL } from "../../redux/api/baseQueryWithReauth";
import type { IdCard } from "../../types";
import { formatDay } from "../../utils/academicYear";
import "./documents.css";

function Band({ school }: { school: IdCard["school"] }) {
  return (
    <div className="id-band">
      {school.logoUrl && <img src={`${API_URL}${school.logoUrl}`} alt="" />}
      <b>{school.name}</b>
    </div>
  );
}

/**
 * A student's ID card, front and back, credit-card sized (85.6 x 54 mm). Front: the school, the photo (or a blank box where it is pasted), name, class,
 * roll and admission number, date of birth, blood group. Back: the parent to call, the address, the school's address and phone, and what to do when
 * the card is found.
 */
export function IdCardView({ card }: { card: IdCard }) {
  const { school, student: s, guardian } = card;
  return (
    <div className="id-pair" aria-label={`ID card of ${s.name}`} role="group">
      <article className="id-card" aria-label="Front">
        <Band school={school} />
        <div className="id-body">
          {s.photo ? <img className="id-photo" src={s.photo} alt={`Photo of ${s.name}`} /> : <div className="id-photo id-photo-empty">Paste photo here</div>}
          <div style={{ minWidth: 0 }}>
            <p className="id-name" style={{ margin: 0 }}>
              {s.name}
            </p>
            <dl className="id-facts">
              <dt>Class</dt>
              <dd>{s.classLabel ?? "-"}</dd>
              {s.rollNumber !== null && (
                <>
                  <dt>Roll no.</dt>
                  <dd>{s.rollNumber}</dd>
                </>
              )}
              <dt>Adm. no.</dt>
              <dd>{s.admissionNumber}</dd>
              <dt>DOB</dt>
              <dd>{formatDay(s.dateOfBirth)}</dd>
              {s.bloodGroup && (
                <>
                  <dt>Blood</dt>
                  <dd>{s.bloodGroup}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
        <div className="id-foot">
          <span>Session {card.year.name}</span>
          <span>Valid till {formatDay(card.year.endDate)}</span>
        </div>
      </article>

      <article className="id-card" aria-label="Back">
        <Band school={school} />
        <div className="id-back-body">
          {guardian && (
            <>
              <h4>{guardian.relation}</h4>
              <p>
                {guardian.name}
                {guardian.mobile ? ` · ${guardian.mobile}` : ""}
              </p>
            </>
          )}
          {s.address && (
            <>
              <h4>Address</h4>
              <p>{s.address}</p>
            </>
          )}
          <h4>School</h4>
          <p>{[school.address, school.phone].filter(Boolean).join(" · ") || school.name}</p>
          <p style={{ fontWeight: 400, color: "#475569", maxWidth: "58mm" }}>If found, please return this card to the school.</p>
        </div>
        {/* The school and the admission number, for a scanner at the gate or the library. */}
        <div className="id-qr" aria-label={`QR code of ${s.admissionNumber}`} role="img">
          <QRCodeSVG value={`${school.name}|${s.admissionNumber}`} size={56} level="M" marginSize={0} />
        </div>
      </article>
    </div>
  );
}
