import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { useStudentForm } from "../../../hooks/useStudentForm";
import { useGetCapacityQuery } from "../../../redux/api/studentsApi";
import { useGetStructureQuery } from "../../../redux/api/academicsApi";
import { stepsFor } from "../../../utils/admitSteps";
import type { FieldsDraft } from "../../../utils/exportLayout";
import { emptyStudentForm } from "../../../utils/students";
import { AdmitSidebar } from "../form/AdmitSidebar";
import { AdmitStepBody } from "../form/AdmitStepBody";
import { AppModal } from "../../ui/AppModal";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Steps } from "../../ui/Steps";

/**
 * The Add student page as it will look with the school's form as arranged now (not saved yet): the same header, the same stepper (a step
 * with nothing asked in it is not there, as on the page itself), the same cards and boxes, the same side column. It is drawn by the same
 * components as the page (`AdmitStepBody`), so nothing here is a picture of it. The steps can be opened to look at; the boxes cannot be
 * typed in. The school's classes are read once, when the preview opens (they are on the page's class card).
 */
export function AddStudentPreview({ draft, onClose }: { draft: FieldsDraft; onClose: () => void }) {
  const structure = useGetStructureQuery().data?.data;
  const capacity = useGetCapacityQuery().data?.data;
  const form = useStudentForm(emptyStudentForm(draft.rules), { mode: "admit", classHasSections: () => false, rules: draft.rules, custom: draft.custom });
  const stepList = useMemo(() => stepsFor(draft.rules, draft.custom, draft.placements, draft.steps), [draft.rules, draft.custom, draft.placements, draft.steps]);
  const [position, setPosition] = useState(0);
  const at = Math.min(position, stepList.length - 1);
  const step = stepList[at];
  const year = structure?.academicYear?.name;

  return (
    <AppModal
      title="Preview of Add student"
      icon={Eye}
      size="cover"
      onClose={onClose}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close the preview
        </Button>
      }
    >
      <div className="space-y-5">
        <header className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-foreground">Add student</h2>
          {year && <p className="text-sm text-foreground-muted">Academic year {year}</p>}
        </header>

        <Card className="px-5 py-4 sm:px-7 sm:py-5">
          <Steps steps={stepList} active={at} completed={[]} furthest={stepList.length - 1} onSelect={setPosition} />
          <p className="mt-3 hidden text-sm text-foreground-muted lg:block">{step.hint}</p>
        </Card>

        {/* The boxes are for looking at: nothing can be typed in them. */}
        <div inert className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-label={`Preview of ${step.label}`} role="group">
          <div key={step.key} className="rise-in min-w-0 space-y-6">
            <AdmitStepBody form={form} stepKey={step.key} placements={draft.placements} steps={draft.steps} structure={structure} capacity={capacity} />
          </div>
          {structure ? <AdmitSidebar values={form.values} problems={form.problems} rules={form.rules ?? draft.rules} custom={draft.custom} structure={structure} /> : <div />}
        </div>
      </div>
    </AppModal>
  );
}
