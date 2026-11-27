import { SCHOOL_TYPES, STATES } from "../../constants/schoolOptions";
import type { ProfileDraft } from "../../utils/schoolProfile";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

/**
 * The boxes of an approved school's details (name, type, address, contact): the School Details window and Settings > School details. The
 * `<form>` and its Save button are the page's.
 */
export function SchoolProfileFields({ draft, setDraft }: { draft: ProfileDraft; setDraft: (next: ProfileDraft) => void }) {
  return (
    <>
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">School information</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="school-profile-name" label="School name">
            <Input id="school-profile-name" value={draft.schoolName} onChange={(e) => setDraft({ ...draft, schoolName: e.target.value })} required maxLength={150} />
          </Field>
          <Field id="school-profile-type" label="School type">
            <Select id="school-profile-type" value={draft.schoolType} options={SCHOOL_TYPES} onChange={(schoolType) => setDraft({ ...draft, schoolType })} placeholder="Choose school type" />
          </Field>
          <Field id="school-profile-students" label="Approx. students">
            <Input id="school-profile-students" type="number" min={1} max={50000} value={draft.approxStudents} onChange={(e) => setDraft({ ...draft, approxStudents: e.target.value })} required />
          </Field>
          <Field id="school-profile-udise" label="UDISE+ code" optional>
            <Input id="school-profile-udise" value={draft.udiseCode} onChange={(e) => setDraft({ ...draft, udiseCode: e.target.value })} inputMode="numeric" pattern="[0-9]{11}" maxLength={11} />
          </Field>
          <Field id="school-profile-established" label="Established year" optional>
            <Input id="school-profile-established" type="number" min={1800} max={new Date().getFullYear()} value={draft.establishedYear} onChange={(e) => setDraft({ ...draft, establishedYear: e.target.value })} />
          </Field>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">Address and contact</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="school-profile-address1" label="Address line 1" className="sm:col-span-2">
            <Input id="school-profile-address1" value={draft.addressLine1} onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })} required maxLength={200} />
          </Field>
          <Field id="school-profile-address2" label="Address line 2" optional className="sm:col-span-2">
            <Input id="school-profile-address2" value={draft.addressLine2} onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })} maxLength={200} />
          </Field>
          <Field id="school-profile-city" label="City">
            <Input id="school-profile-city" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} required maxLength={80} />
          </Field>
          <Field id="school-profile-state" label="State or union territory">
            <Select id="school-profile-state" value={draft.state} options={STATES} onChange={(state) => setDraft({ ...draft, state })} placeholder="Choose state" />
          </Field>
          <Field id="school-profile-district" label="District">
            <Input id="school-profile-district" value={draft.district} onChange={(e) => setDraft({ ...draft, district: e.target.value })} required maxLength={80} />
          </Field>
          <Field id="school-profile-division" label="Division" optional>
            <Input id="school-profile-division" value={draft.division} onChange={(e) => setDraft({ ...draft, division: e.target.value })} maxLength={80} />
          </Field>
          <Field id="school-profile-pincode" label="PIN code">
            <Input id="school-profile-pincode" value={draft.pincode} onChange={(e) => setDraft({ ...draft, pincode: e.target.value })} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} />
          </Field>
          <Field id="school-profile-phone" label="School phone">
            <Input id="school-profile-phone" type="tel" value={draft.schoolPhone} onChange={(e) => setDraft({ ...draft, schoolPhone: e.target.value })} required />
          </Field>
          <Field id="school-profile-email" label="School email">
            <Input id="school-profile-email" type="email" value={draft.schoolEmail} onChange={(e) => setDraft({ ...draft, schoolEmail: e.target.value })} required maxLength={254} />
          </Field>
          <Field id="school-profile-website" label="Website" optional className="sm:col-span-2">
            <Input id="school-profile-website" type="url" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://school.in" maxLength={200} />
          </Field>
        </div>
      </section>
    </>
  );
}
