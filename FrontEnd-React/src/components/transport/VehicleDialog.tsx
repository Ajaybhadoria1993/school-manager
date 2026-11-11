import { useState } from "react";
import { Bus } from "lucide-react";
import { useCreateVehicleMutation, useUpdateVehicleMutation } from "../../redux/api/transportApi";
import type { Vehicle, VehicleBody, VehicleType } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/toast-context";
import { fieldErrorsOf } from "../../utils/transport";

const TYPES: { value: VehicleType; label: string }[] = [
  { value: "bus", label: "Bus" },
  { value: "mini_bus", label: "Mini bus" },
  { value: "van", label: "Van" },
  { value: "auto", label: "Auto / e-rickshaw" },
  { value: "other", label: "Other" },
];

const emptyBody = (): VehicleBody => ({ number: "", registrationNumber: "", type: "bus", seats: "", model: "", insuranceExpiry: "", fitnessExpiry: "", pollutionExpiry: "", permitExpiry: "", notes: "" });
const bodyOf = (v: Vehicle): VehicleBody => ({
  number: v.number,
  registrationNumber: v.registrationNumber,
  type: v.type,
  seats: v.seats,
  model: v.model ?? "",
  insuranceExpiry: v.insuranceExpiry ?? "",
  fitnessExpiry: v.fitnessExpiry ?? "",
  pollutionExpiry: v.pollutionExpiry ?? "",
  permitExpiry: v.permitExpiry ?? "",
  notes: v.notes ?? "",
  isActive: v.isActive,
});

/** Add a vehicle, or change one: its number and plate, the kind and the seats, and the last day of each paper it must keep valid. */
export function VehicleDialog({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const [form, setForm] = useState<VehicleBody>(() => (vehicle ? bodyOf(vehicle) : emptyBody()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [create, creating] = useCreateVehicleMutation();
  const [update, updating] = useUpdateVehicleMutation();
  const { push } = useToast();
  const busy = creating.isLoading || updating.isLoading;
  const set = <K extends keyof VehicleBody>(key: K, value: VehicleBody[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setProblem(null);
    const local: Record<string, string> = {};
    if (!form.number.trim()) local.number = "Enter the vehicle number (like Bus 1)";
    if (!form.registrationNumber.trim()) local.registrationNumber = "Enter the registration number";
    if (!Number(form.seats) || Number(form.seats) < 1) local.seats = "Enter the seats";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    try {
      const body = { ...form, seats: Number(form.seats) };
      if (vehicle) await update({ id: vehicle.id, body }).unwrap();
      else await create(body).unwrap();
      push("success", vehicle ? "Vehicle saved" : "Vehicle added");
      onClose();
    } catch (err) {
      setErrors(fieldErrorsOf(err, getApiError));
      setProblem(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  const day = (key: "insuranceExpiry" | "fitnessExpiry" | "pollutionExpiry" | "permitExpiry", label: string) => (
    <Field id={`vehicle-${key}`} label={label} optional error={errors[key]} hint="The last day it is valid">
      <Input id={`vehicle-${key}`} type="date" value={form[key]} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );

  return (
    <AppModal
      title={vehicle ? `Change ${vehicle.number}` : "Add vehicle"}
      icon={Bus}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {vehicle ? "Save" : "Add vehicle"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="vehicle-number" label="Vehicle number" error={errors.number} hint="Your own name for it: Bus 1, Van 3">
          <Input id="vehicle-number" value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="Bus 1" maxLength={60} />
        </Field>
        <Field id="vehicle-registrationNumber" label="Registration number" error={errors.registrationNumber} hint="The number on the plate">
          <Input id="vehicle-registrationNumber" value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value.toUpperCase())} placeholder="MP09 AB 1234" maxLength={20} />
        </Field>
        <Field id="vehicle-type" label="Kind of vehicle" error={errors.type}>
          <Select id="vehicle-type" value={form.type} onChange={(v) => set("type", v as VehicleType)} options={TYPES} />
        </Field>
        <Field id="vehicle-seats" label="Seats" error={errors.seats} hint="How many children it can carry">
          <Input id="vehicle-seats" type="number" min={1} max={120} inputMode="numeric" value={form.seats} onChange={(e) => set("seats", e.target.value)} placeholder="40" />
        </Field>
        <Field id="vehicle-model" label="Make and model" optional error={errors.model} className="sm:col-span-2">
          <Input id="vehicle-model" value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Tata Starbus" maxLength={60} />
        </Field>
        {day("insuranceExpiry", "Insurance")}
        {day("fitnessExpiry", "Fitness certificate")}
        {day("pollutionExpiry", "Pollution certificate (PUC)")}
        {day("permitExpiry", "Permit")}
        <Field id="vehicle-notes" label="Note" optional error={errors.notes} className="sm:col-span-2">
          <Textarea id="vehicle-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={300} />
        </Field>
      </div>
      {vehicle && (
        <Switch checked={form.isActive ?? true} onChange={(on) => set("isActive", on)}>
          In use (switch off when the vehicle is sold or off the road)
        </Switch>
      )}
      <ModalError message={problem} />
    </AppModal>
  );
}
