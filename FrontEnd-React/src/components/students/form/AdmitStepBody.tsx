import { FolderTree } from "lucide-react";
import type { Placement, StepDef } from "../../../constants/studentFields";
import type { StudentForm } from "../../../hooks/useStudentForm";
import { stepName } from "../../../utils/placement";
import type { AcademicStructure, SectionItem, SectionLoad, StudentCapacity } from "../../../types";
import { AddressFields } from "./AddressFields";
import { AdmissionCard } from "./AdmissionCard";
import { FormSection } from "./FormSection";
import { GuardiansCard } from "./GuardiansCard";
import { PlacedFields } from "./PlacedFields";
import { PlacementFields } from "./PlacementFields";
import { PreviousSchoolFields } from "./RecordsFields";
import { StudentFields } from "./StudentFields";

/**
 * What one step of Add student shows, card by card: Personal info (the student, the address), Academic (class and section, the
 * admission date, the previous school), Parents, and every other step (More details, a step the school added) its placed details.
 * Each step ends with the details the school placed in it. The admission page and the preview on Manage fields draw their steps with
 * this one component, so the preview is the page. Without `structure` (the preview of a school that has no classes yet) the class card
 * is a note.
 */
export function AdmitStepBody({
  form,
  stepKey,
  placements,
  steps,
  structure,
  capacity,
  onPickFull,
  onAddField,
}: {
  form: StudentForm;
  stepKey: string;
  placements: readonly Placement[];
  steps: readonly StepDef[];
  structure?: AcademicStructure;
  capacity?: StudentCapacity;
  /** A full section was pressed: the page asks first. */
  onPickFull?: (section: SectionItem, load: SectionLoad) => void;
  /** Adds "Add your own field" to the steps after Parents: the page says which step the button is on. */
  onAddField?: (step: string) => void;
}) {
  if (stepKey === "academic") {
    return (
      <>
        {structure ? (
          <PlacementFields form={form} structure={structure} capacity={capacity} index={0} onPickFull={onPickFull ?? (() => {})} />
        ) : (
          <FormSection index={0} icon={FolderTree} title="Class and section">
            <p className="text-sm text-foreground-muted">Your classes and sections are shown here once they are set up in Classes & Sections.</p>
          </FormSection>
        )}
        <AdmissionCard form={form} index={1} />
        <PreviousSchoolFields form={form} index={2} />
        <PlacedFields form={form} step="academic" placements={placements} index={3} />
      </>
    );
  }
  if (stepKey === "personal") {
    return (
      <>
        <StudentFields form={form} mode="admit" index={0} admissionDate={false} extras={false} />
        <AddressFields form={form} index={1} />
        <PlacedFields form={form} step="personal" placements={placements} index={2} />
      </>
    );
  }
  if (stepKey === "parents") {
    return (
      <>
        <GuardiansCard form={form} mode="admit" index={0} />
        <PlacedFields form={form} step="parents" placements={placements} index={1} />
      </>
    );
  }
  return <PlacedFields form={form} step={stepKey} placements={placements} title={stepName(stepKey, steps)} index={0} onAddField={onAddField ? () => onAddField(stepKey) : undefined} />;
}
