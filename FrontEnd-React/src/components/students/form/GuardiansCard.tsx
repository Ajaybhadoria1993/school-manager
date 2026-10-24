import { Plus, UsersRound } from "lucide-react";
import { MAX_GUARDIANS } from "../../../constants/students";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { Button } from "../../ui/Button";
import { WithTip } from "../../ui/Hint";
import { FormCard } from "./FormCard";
import { GuardianFields } from "./GuardianFields";

/** The parents and guardians: one to four, exactly one the primary contact. Another one is added with the button at the top. */
export function GuardiansCard({ form, mode, index = 0 }: { form: StudentForm; mode: "admit" | "edit"; index?: number }) {
  const { guardians } = form.values;
  const problem = form.errorOf("guardians");

  return (
    <FormCard
      index={index}
      icon={UsersRound}
      tone="warning"
      title="Parents and guardians"
      description={
        mode === "admit"
          ? form.rules?.secondParent === "required"
            ? "The father and the mother. Start with a mobile number: a parent who already has a child here is found and linked."
            : "Start with the mobile number. A parent who already has a child here is found and linked, never typed twice."
          : "Their own details: a change shows on every child of theirs."
      }
      tip="One parent is one record, however many children they have here: a brother or sister is linked to the same parent. The primary contact's mobile number will be their sign-in to the parent app later."
      action={
        mode === "admit" &&
        guardians.length < MAX_GUARDIANS && (
          <WithTip tip={`Add a second parent or another guardian (up to ${MAX_GUARDIANS}).`}>
            <Button type="button" variant="outline" size="sm" onClick={form.addGuardian}>
              <Plus className="size-4" aria-hidden />
              Add another guardian
            </Button>
          </WithTip>
        )
      }
    >
      {problem && (
        <p id={fieldId("guardians")} tabIndex={-1} role="alert" className="mb-3 text-xs font-medium text-danger outline-none">
          {problem}
        </p>
      )}
      <div className="space-y-4">
        {guardians.map((g, i) => (
          <GuardianFields key={g.key} form={form} index={i} mode={mode} canRemove={mode === "admit" && guardians.length > 1} />
        ))}
      </div>
    </FormCard>
  );
}
