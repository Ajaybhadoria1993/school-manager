import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Eye, GripVertical, ListPlus, Lock, PencilLine, Plus, Trash2 } from "lucide-react";
import { MAX_CUSTOM_FIELDS, MAX_CUSTOM_STEPS, type AdmitStepKey, type CustomFieldDef } from "../../../constants/studentFields";
import { addCustom, addStep, editCustom, moveStep, removeCustom, removeStep, renameStep, setAsked, setPlacements, setRequired, type FieldsDraft } from "../../../utils/exportLayout";
import { formSteps, type FormRow } from "../../../utils/formDetails";
import { cn } from "../../../utils/helpers";
import { allSteps, placeIn } from "../../../utils/placement";
import { AskDialog } from "../form/AskDialog";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Select } from "../../ui/Select";
import { AddStudentPreview } from "./AddStudentPreview";
import { CustomFieldDialog } from "./CustomFieldDialog";
import { StepNameDialog } from "./StepNameDialog";
import { Toggle } from "./Toggle";

/** The widths of the switch columns: the header and every row share them, so the switches stand in line. */
const ASKED = "w-[4.5rem] shrink-0";
const MANDATORY = "w-[6.75rem] shrink-0";
const MOVE = "w-[5.75rem] shrink-0";
const STEP_BUTTON = "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-primary-soft hover:text-primary-deep disabled:pointer-events-none disabled:opacity-30";

/**
 * Manage fields' picture of the Add student form: its steps (Personal info, Academic, Parents, More details and the steps the school
 * adds), each with the boxes the form has, in the order the form has them. The boxes the software always asks have no switch; the
 * details the school decides about have **Asked** and **Mandatory**; the ones it may move (and its own fields) can be dragged to
 * another step, or sent with the Move list (the app's dropdown, listing the other steps). Mandatory is one setting for the form and the
 * Excel: a mandatory detail is a column of the file too. **Preview** shows the page as Add student will draw it. **Add a step** makes a
 * step of the school's own (it can be renamed, put earlier or later, or taken out; a step with nothing asked is not on Add student).
 * Changes wait for the page's Save. The school's own fields are made here ("Add your own field").
 */
export function FormFieldsCard({ draft, onChange }: { draft: FieldsDraft; onChange: (draft: FieldsDraft) => void }) {
  const [open, setOpen] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ field: CustomFieldDef | null } | null>(null);
  const [stepDialog, setStepDialog] = useState<{ key: string | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const rows = formSteps(draft);
  const steps = allSteps(draft.steps);

  const drop = (step: AdmitStepKey, beforeKey?: string) => {
    if (dragging) onChange(setPlacements(draft, placeIn(draft.placements, dragging, step, beforeKey)));
    setDragging(null);
    setOver(null);
  };

  const askedCell = (row: FormRow) => {
    if (row.control !== "asked" || !row.detail) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground-muted" title="Always asked">
          <Lock className="size-3" aria-hidden />
          Always
        </span>
      );
    }
    return <Toggle checked={row.asked} onChange={(next) => onChange(setAsked(draft, row.detail!, next))} label={`${row.label} asked`} title={row.asked ? "Press to stop asking it on Add student" : "Press to ask it on Add student"} tone="success" />;
  };

  const mandatoryCell = (row: FormRow) => {
    if (row.control === "always") return <span className="text-xs font-semibold text-foreground-muted">{row.mandatory ? "Mandatory" : "Optional"}</span>;
    if (row.control === "fixed") {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground-muted" title="The software needs it">
          <Lock className="size-3" aria-hidden />
          Mandatory
        </span>
      );
    }
    if (!row.asked) return <span className="text-xs text-foreground-muted/60">—</span>;
    if (!row.canRequire) return <span className="text-xs font-semibold text-foreground-muted/80">Optional</span>;
    return (
      <span className="flex items-center gap-1.5">
        <Toggle
          checked={row.mandatory}
          onChange={(next) => onChange(setRequired(draft, row.detail!, next))}
          label={`${row.label} mandatory`}
          title={row.mandatory ? "Mandatory on Add student and in the Excel. Press to make it optional in both." : "Press to make it mandatory on Add student and in the Excel."}
        />
        <span className={cn("text-xs font-bold", row.mandatory ? "text-primary-deep" : "text-foreground-muted")}>{row.mandatory ? "Mandatory" : "Optional"}</span>
      </span>
    );
  };

  const rowView = (row: FormRow) => {
    const dim = row.control === "asked" && !row.asked;
    return (
      <li
        key={row.id}
        data-detail={row.id}
        draggable={row.movable}
        onDragStart={(e) => {
          if (!row.movable) return;
          setDragging(row.id);
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            // Firefox starts a drag only when something is set.
            e.dataTransfer.setData("text/plain", row.id);
          }
        }}
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          if (over !== row.id) setOver(row.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          // The step's own drop must not take it again. Dropped on a box that cannot move, it goes to the end of the step.
          e.stopPropagation();
          drop(row.step, row.movable ? row.id : undefined);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
        }}
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2 py-1.5 transition-[opacity,border-color,box-shadow]",
          row.movable && "cursor-grab active:cursor-grabbing",
          dim ? "border-dashed border-border bg-background opacity-70 hover:opacity-100" : "border-border bg-surface",
          dragging === row.id && "opacity-40",
          over === row.id && dragging !== null && dragging !== row.id && "border-primary ring-2 ring-primary/20"
        )}
      >
        <GripVertical className={cn("size-4 shrink-0", row.movable ? "text-foreground-muted/60" : "text-transparent")} aria-hidden />
        <span className="min-w-0 flex-1 basis-40">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{row.label}</span>
            {row.own && (
              <>
                <span className="shrink-0 rounded-full bg-success-soft px-1.5 py-px text-[10px] font-bold text-success">Your own</span>
                <button
                  type="button"
                  aria-label={`Change or delete ${row.label}`}
                  title="Change or delete this field of your own"
                  onClick={() => setDialog({ field: draft.custom.find((f) => f.key === row.id) ?? null })}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground-muted hover:bg-primary-soft hover:text-primary-deep"
                >
                  <PencilLine className="size-3.5" aria-hidden />
                </button>
              </>
            )}
          </span>
          {row.note && <span className="block text-[11px] text-foreground-muted">{row.note}</span>}
        </span>
        <span className={MOVE}>
          {row.movable && (
            <Select
              aria-label={`Move ${row.label}`}
              value=""
              placeholder="Move"
              options={steps.filter((s) => s.key !== row.step).map((s) => ({ value: s.key, label: s.name }))}
              triggerClassName="h-7 min-h-0 pl-2 pr-6 text-xs font-semibold text-foreground-muted"
              onChange={(to) => to && onChange(setPlacements(draft, placeIn(draft.placements, row.id, to)))}
            />
          )}
        </span>
        <span className={cn(ASKED, "flex justify-center")}>{askedCell(row)}</span>
        <span className={MANDATORY}>{mandatoryCell(row)}</span>
      </li>
    );
  };

  const block = (step: { key: string; name: string }, i: number) => {
    const { fixed, asked, notAsked } = rows[step.key];
    const flexible = i >= 3;
    const own = flexible && step.key !== "more";
    const at = draft.steps.findIndex((s) => s.key === step.key);
    return (
      <div
        key={step.key}
        role="group"
        aria-label={`${step.name} step`}
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          setOver(`step:${step.key}`);
        }}
        onDrop={(e) => {
          e.preventDefault();
          drop(step.key);
        }}
        className={cn("min-w-0 space-y-2 rounded-xl border bg-background p-2.5 transition-colors", over === `step:${step.key}` && dragging !== null ? "border-primary bg-primary-soft/40" : "border-border")}
      >
        <div className="flex items-center gap-1.5 px-1">
          <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
            {i + 1}
          </span>
          <h3 className="min-w-0 truncate text-sm font-bold text-foreground">{step.name}</h3>
          {flexible && (
            <span className="flex shrink-0 items-center">
              {draft.steps.length > 1 && (
                <>
                  <button type="button" className={STEP_BUTTON} aria-label={`Move ${step.name} earlier`} title="Earlier in the stepper" disabled={at <= 0} onClick={() => onChange(moveStep(draft, step.key, -1))}>
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <button type="button" className={STEP_BUTTON} aria-label={`Move ${step.name} later`} title="Later in the stepper" disabled={at >= draft.steps.length - 1} onClick={() => onChange(moveStep(draft, step.key, 1))}>
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </>
              )}
              {own && (
                <>
                  <button type="button" className={STEP_BUTTON} aria-label={`Rename ${step.name}`} title="Rename this step" onClick={() => setStepDialog({ key: step.key })}>
                    <PencilLine className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" className={cn(STEP_BUTTON, "hover:bg-danger-soft hover:text-danger")} aria-label={`Delete ${step.name}`} title="Delete this step" onClick={() => setDeleting(step.key)}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </>
              )}
            </span>
          )}
          <div aria-hidden className="ml-auto flex shrink-0 gap-x-2 text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
            <span className={cn(MOVE, "hidden sm:block")} />
            <span className={cn(ASKED, "text-center")}>Asked</span>
            <span className={MANDATORY}>Mandatory</span>
          </div>
        </div>
        {fixed.length + asked.length > 0 ? (
          <ul aria-label={`Details in ${step.name}`} className="space-y-1.5">
            {[...fixed, ...asked].map(rowView)}
          </ul>
        ) : (
          notAsked.length === 0 && (
            <p className="px-1 pb-1 text-xs text-foreground-muted">
              Nothing is placed in this step. Drag a detail here, or choose this step in the Move list of a detail. A step with nothing asked is not shown on Add student.
            </p>
          )
        )}
        {notAsked.length > 0 && (
          <div>
            <p className="px-1 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-foreground-muted">Not asked: switch on to ask it here</p>
            <ul aria-label={`Not asked in ${step.name}`} className="space-y-1.5">
              {notAsked.map(rowView)}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const stepOfDialog = stepDialog?.key ? (draft.steps.find((s) => s.key === stepDialog.key) ?? null) : null;
  const deletingStep = deleting ? draft.steps.find((s) => s.key === deleting) : undefined;
  const placedInDeleting = deleting ? draft.placements.filter((p) => p.step === deleting).length : 0;

  return (
    <Card className="overflow-hidden" role="region" aria-label="Add student form">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        <div aria-hidden onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 basis-56 cursor-pointer select-none items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ClipboardList className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold text-foreground">Add student form</span>
            <span className="block truncate text-xs text-foreground-muted">What Add student asks, step by step. Mandatory is the same in the Excel.</span>
          </span>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" aria-label="Preview of Add student" onClick={() => setPreviewing(true)}>
          <Eye className="size-4" aria-hidden />
          Preview
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" aria-label="Add a step" disabled={draft.steps.length - 1 >= MAX_CUSTOM_STEPS} onClick={() => setStepDialog({ key: null })}>
          <ListPlus className="size-4" aria-hidden />
          <span className="hidden sm:inline">Add a step</span>
          <span className="sm:hidden">Step</span>
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" aria-label="Add your own field" disabled={draft.custom.length >= MAX_CUSTOM_FIELDS} onClick={() => setDialog({ field: null })}>
          <Plus className="size-4" aria-hidden />
          <span className="hidden sm:inline">Add your own field</span>
          <span className="sm:hidden">Add field</span>
        </Button>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="form-fields"
          aria-label={open ? "Hide the form" : "Show the form"}
          title={open ? "Hide the form" : "Show the form"}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
            open ? "border-primary/30 bg-primary-soft text-primary-deep" : "border-border bg-surface text-foreground-muted hover:border-primary/30 hover:text-primary-deep"
          )}
        >
          <ChevronDown className={cn("size-5 transition-transform duration-300", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      <div id="form-fields" className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} inert={!open}>
        <div className="overflow-hidden">
          <div className="space-y-4 border-t border-border px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
            <p className="text-xs text-foreground-muted">Drag a detail with the grip to the step you want, or use its Move list. The boxes with a lock are always asked.</p>
            <div className="grid gap-3 min-[1350px]:grid-cols-2">{steps.map(block)}</div>
          </div>
        </div>
      </div>

      {dialog && (
        <CustomFieldDialog
          field={dialog.field}
          others={draft.custom.filter((f) => f.key !== dialog.field?.key)}
          onClose={() => setDialog(null)}
          onSave={(field) => {
            onChange(dialog.field ? editCustom(draft, field) : addCustom(draft, field));
            setDialog(null);
          }}
          onDelete={
            dialog.field
              ? () => {
                  onChange(removeCustom(draft, dialog.field!.key));
                  setDialog(null);
                }
              : undefined
          }
        />
      )}
      {stepDialog && (
        <StepNameDialog
          step={stepOfDialog}
          steps={draft.steps}
          onClose={() => setStepDialog(null)}
          onSave={(name) => {
            onChange(stepOfDialog ? renameStep(draft, stepOfDialog.key, name) : addStep(draft, name));
            setStepDialog(null);
          }}
        />
      )}
      {deletingStep && (
        <AskDialog title={`Delete ${deletingStep.name}?`} icon={Trash2} confirmLabel="Delete the step" onClose={() => setDeleting(null)} onConfirm={() => onChange(removeStep(draft, deletingStep.key))}>
          <p>
            {placedInDeleting > 0
              ? `Its ${placedInDeleting} detail${placedInDeleting === 1 ? "" : "s"} go${placedInDeleting === 1 ? "es" : ""} to More details. Nothing is deleted from your school.`
              : "Nothing is placed in it. Nothing is deleted from your school."}{" "}
            It is gone from Add student when you press Save.
          </p>
        </AskDialog>
      )}
      {previewing && <AddStudentPreview draft={draft} onClose={() => setPreviewing(false)} />}
    </Card>
  );
}
