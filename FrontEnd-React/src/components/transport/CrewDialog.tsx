import { useState } from "react";
import { UserRoundCog } from "lucide-react";
import { useCreateCrewMutation, useUpdateCrewMutation } from "../../redux/api/transportApi";
import type { CrewBody, CrewMember, CrewRole } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/toast-context";
import { fieldErrorsOf } from "../../utils/transport";

const ROLES: { value: CrewRole; label: string }[] = [
  { value: "driver", label: "Driver" },
  { value: "attendant", label: "Attendant (conductor, bus aunty / uncle)" },
];

const bodyOf = (p: CrewMember | undefined, role: CrewRole): CrewBody =>
  p
    ? { name: p.name, role: p.role, mobile: p.mobile, emergencyMobile: p.emergencyMobile ?? "", licenseNumber: p.licenseNumber ?? "", licenseExpiry: p.licenseExpiry ?? "", address: p.address ?? "", joiningDate: p.joiningDate ?? "", notes: p.notes ?? "", isActive: p.isActive }
    : { name: "", role, mobile: "", emergencyMobile: "", licenseNumber: "", licenseExpiry: "", address: "", joiningDate: "", notes: "" };

/** Add a driver or an attendant, or change one: who they are, how to reach them, and a driver's licence. */
export function CrewDialog({ person, role = "driver", onClose }: { person?: CrewMember; role?: CrewRole; onClose: () => void }) {
  const [form, setForm] = useState<CrewBody>(() => bodyOf(person, role));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [create, creating] = useCreateCrewMutation();
  const [update, updating] = useUpdateCrewMutation();
  const { push } = useToast();
  const busy = creating.isLoading || updating.isLoading;
  const set = <K extends keyof CrewBody>(key: K, value: CrewBody[K]) => setForm((f) => ({ ...f, [key]: value }));
  const driver = form.role === "driver";

  async function save() {
    setProblem(null);
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = "Enter the name";
    if (form.mobile.replace(/\D/g, "").length < 10) local.mobile = "Enter the 10-digit mobile number";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    try {
      // An attendant has no licence.
      const body = driver ? form : { ...form, licenseNumber: "", licenseExpiry: "" };
      if (person) await update({ id: person.id, body }).unwrap();
      else await create(body).unwrap();
      push("success", person ? "Saved" : driver ? "Driver added" : "Attendant added");
      onClose();
    } catch (err) {
      setErrors(fieldErrorsOf(err, getApiError));
      setProblem(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  return (
    <AppModal
      title={person ? `Change ${person.name}` : form.role === "driver" ? "Add driver" : "Add attendant"}
      icon={UserRoundCog}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {person ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="crew-name" label="Name" error={errors.name}>
          <Input id="crew-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ramesh Yadav" maxLength={60} />
        </Field>
        <Field id="crew-role" label="Works as" error={errors.role}>
          <Select id="crew-role" value={form.role} onChange={(v) => set("role", v as CrewRole)} options={ROLES} />
        </Field>
        <Field id="crew-mobile" label="Mobile number" error={errors.mobile}>
          <Input id="crew-mobile" type="tel" inputMode="numeric" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="98765 43210" maxLength={16} />
        </Field>
        <Field id="crew-emergencyMobile" label="Emergency number" optional error={errors.emergencyMobile} hint="A family member to call">
          <Input id="crew-emergencyMobile" type="tel" inputMode="numeric" value={form.emergencyMobile} onChange={(e) => set("emergencyMobile", e.target.value)} maxLength={16} />
        </Field>
        {driver && (
          <>
            <Field id="crew-licenseNumber" label="Driving licence number" optional error={errors.licenseNumber}>
              <Input id="crew-licenseNumber" value={form.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value.toUpperCase())} placeholder="MP09 20110012345" maxLength={25} />
            </Field>
            <Field id="crew-licenseExpiry" label="Licence valid till" optional error={errors.licenseExpiry} hint="The last day it is valid">
              <Input id="crew-licenseExpiry" type="date" value={form.licenseExpiry} onChange={(e) => set("licenseExpiry", e.target.value)} />
            </Field>
          </>
        )}
        <Field id="crew-joiningDate" label="Joined on" optional error={errors.joiningDate}>
          <Input id="crew-joiningDate" type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} />
        </Field>
        <Field id="crew-address" label="Address" optional error={errors.address}>
          <Input id="crew-address" value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={200} />
        </Field>
        <Field id="crew-notes" label="Note" optional error={errors.notes} className="sm:col-span-2">
          <Textarea id="crew-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={300} />
        </Field>
      </div>
      {person && (
        <Switch checked={form.isActive ?? true} onChange={(on) => set("isActive", on)}>
          Working with the school (switch off when they leave)
        </Switch>
      )}
      <ModalError message={problem} />
    </AppModal>
  );
}
