import { Plus, UsersRound } from "lucide-react";
import { MAX_GUARDIANS } from "../../../constants/students";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { modeOf } from "../../../utils/fieldRules";
import { freeRelation } from "../../../utils/students";
import { Button } from "../../ui/Button";
import { WithTip } from "../../ui/Hint";
import { FormSection } from "./FormSection";
import { GuardianFields } from "./GuardianFields";

/** The parents and guardians: one to four, exactly one the primary contact. Another one is added with the button at the top. */
export function GuardiansCard({ form, mode, index = 0 }: { form: StudentForm; mode: "admit" | "edit"; index?: number }) {
  const { guardians } = form.values;
  const problem = form.errorOf("guardians");
  // A school that needs both parents has only the father and the mother to add: once both are there, there is no one else.
  const onlyParents = modeOf(form.rules, "secondParent") === "required";
  const canAdd = guardians.length < MAX_GUARDIANS && !(onlyParents && freeRelation(guardians) === "Guardian");

  return (
    <FormSection
      index={index}
      icon={UsersRound}
      title="Parents and guardians"
      tip="One parent is one record, however many children they have here: a brother or sister is linked to the same parent. The primary contact's mobile number will be their sign-in to the parent app later."
      action={
        mode === "admit" &&
        canAdd && (
          <WithTip tip={onlyParents ? "Add the father or the mother." : `Add a second parent or another guardian (up to ${MAX_GUARDIANS}).`}>
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
    </FormSection>
  );
}
