import { Building2, Hash, Home, MapPin } from "lucide-react";
import { STATES } from "../../../constants/schoolOptions";
import type { FormFieldKey } from "../../../constants/studentFields";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { FormCard } from "./FormCard";
import { ChoiceSelect } from "./ChoiceSelect";
import { FORM_GRID } from "./formGrid";

const ADDRESS_RULES: FormFieldKey[] = ["addressLine1", "addressArea", "addressCity", "addressState", "addressPincode"];

/**
 * Where the student lives: house and street, area and city in one row, then the state and the PIN code. Each part as the school wants
 * it (needed, optional, or not asked); a school that keeps no address at all gets no card.
 */
export function AddressFields({ form, index = 0 }: { form: StudentForm; index?: number }) {
  const r = form.rules;
  if (!ADDRESS_RULES.some((k) => asks(r, k))) return null;
  return (
    <FormCard index={index} icon={MapPin} tone="info" title="Address" description="Where the student lives now.">
      <div className={FORM_GRID}>
        {asks(r, "addressLine1") && (
          <Field id={fieldId("address.line1")} label="House and street" optional={mayLeave(r, "addressLine1")} error={form.errorOf("address.line1")}>
            <Input {...form.bind("address.line1")} icon={Home} maxLength={200} placeholder="12, MG Road" />
          </Field>
        )}
        {asks(r, "addressArea") && (
          <Field id={fieldId("address.line2")} label="Area or landmark" optional={mayLeave(r, "addressArea")} error={form.errorOf("address.line2")}>
            <Input {...form.bind("address.line2")} maxLength={200} placeholder="Near the bus stand" />
          </Field>
        )}
        {asks(r, "addressCity") && (
          <Field id={fieldId("address.city")} label="City or village" optional={mayLeave(r, "addressCity")} error={form.errorOf("address.city")}>
            <Input {...form.bind("address.city")} icon={Building2} maxLength={80} />
          </Field>
        )}
        {asks(r, "addressState") && (
          <Field id={fieldId("address.state")} label="State" optional={mayLeave(r, "addressState")} error={form.errorOf("address.state")}>
            <ChoiceSelect form={form} path="address.state" options={STATES} placeholder="Choose the state" />
          </Field>
        )}
        {asks(r, "addressPincode") && (
          <Field id={fieldId("address.pincode")} label="PIN code" optional={mayLeave(r, "addressPincode")} error={form.errorOf("address.pincode")}>
            <Input {...form.bind("address.pincode", "digits")} icon={Hash} inputMode="numeric" maxLength={6} placeholder="6 digits" />
          </Field>
        )}
      </div>
    </FormCard>
  );
}
