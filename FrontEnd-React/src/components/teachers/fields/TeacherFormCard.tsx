import { Pencil, Plus, UserRoundPlus } from "lucide-react";
import { MAX_CUSTOM_FIELDS, CUSTOM_FIELD_TYPES, type CustomFieldDef } from "../../../constants/studentFields";
import { TEACHER_DETAILS } from "../../../constants/teacherFields";
import { cn } from "../../../utils/helpers";
import { isAskedDetail, isRequiredDetail, setTeacherAsked, setTeacherMandatory, type TeacherDetail, type TeacherFieldsDraft } from "../../../utils/teacherLayout";
import { Toggle } from "../../students/export/Toggle";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { TeacherMandatoryCell } from "./TeacherMandatoryCell";

interface FormRow {
  /** The key the row is told apart by: a usual detail's, an own field's `c_` key, or one of the details Add teacher always asks. */
  key: string;
  label: string;
  /** Always asked (the person and the login), or one the school decides about. */
  detail: TeacherDetail | null;
  own?: CustomFieldDef;
}

/** The people and the login Add teacher always asks, and the usual details the school decides about, by section. */
const SECTIONS: { title: string; rows: FormRow[] }[] = [
  {
    title: "Personal",
    rows: [
      { key: "name", label: "Name", detail: null },
      { key: "mobile", label: "Mobile number", detail: null },
      { key: "gender", label: "Gender", detail: null },
      ...TEACHER_DETAILS.filter((d) => d.group === "Personal").map((d) => ({ key: d.key, label: d.label, detail: { kind: "rule", rule: d.key } as TeacherDetail })),
    ],
  },
  { title: "Address", rows: TEACHER_DETAILS.filter((d) => d.group === "Address").map((d) => ({ key: d.key, label: d.label, detail: { kind: "rule", rule: d.key } as TeacherDetail })) },
  { title: "Job", rows: TEACHER_DETAILS.filter((d) => d.group === "Job").map((d) => ({ key: d.key, label: d.label, detail: { kind: "rule", rule: d.key } as TeacherDetail })) },
  { title: "Teaching", rows: TEACHER_DETAILS.filter((d) => d.group === "Teaching").map((d) => ({ key: d.key, label: d.label, detail: { kind: "rule", rule: d.key } as TeacherDetail })) },
  { title: "Login", rows: [{ key: "username", label: "Username and password", detail: null }] },
];

const GRID = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_3.25rem_6.75rem_2.25rem]";
const kindOf = (field: CustomFieldDef) => `${CUSTOM_FIELD_TYPES.find((t) => t.type === field.type)?.label ?? ""}${field.type === "choice" ? ` (${field.options.length})` : ""}`;

/**
 * Teacher > Manage fields > Add teacher form: what Add teacher asks, detail by detail, in sections like the form. Each usual detail has
 * **Asked** (the form shows the box) and **Mandatory** (the box must be answered: the same setting as in the Excel's list, so a mandatory
 * detail is a column of the file too); the person and the login are always asked. The school's own fields are the last section, each with
 * a pencil, and **Add your own field** opens the dialog. Nothing is saved here: the page's Save sends it.
 */
export function TeacherFormCard({
  draft,
  onChange,
  onAdd,
  onEdit,
}: {
  draft: TeacherFieldsDraft;
  onChange: (draft: TeacherFieldsDraft) => void;
  onAdd: () => void;
  onEdit: (field: CustomFieldDef) => void;
}) {
  const own: FormRow[] = draft.custom.map((f) => ({ key: f.key, label: f.label, detail: { kind: "custom", key: f.key } as TeacherDetail, own: f }));
  const all = [...SECTIONS, ...(own.length > 0 ? [{ title: "Your own fields", rows: own }] : [])];
  const decided = all.flatMap((s) => s.rows).filter((r) => r.detail);
  const asked = decided.filter((r) => isAskedDetail(draft, r.detail!)).length;
  const needed = decided.filter((r) => isRequiredDetail(draft, r.detail!)).length;

  return (
    <Card className="p-4 sm:p-5" role="region" aria-label="Add teacher form">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-deep">
            <UserRoundPlus className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground">
              Add teacher form
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary-deep">
                {asked} asked · {needed} mandatory
              </span>
            </h2>
            <p className="text-xs text-foreground-muted">The boxes Add teacher shows. A mandatory detail is a column of the Excel too.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" disabled={draft.custom.length >= MAX_CUSTOM_FIELDS} onClick={onAdd}>
          <Plus className="size-4" aria-hidden />
          Add your own field
        </Button>
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-5 xl:grid-cols-2">
        {all.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <div aria-hidden className={cn(GRID, "hidden px-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-foreground-muted sm:grid")}>
              <span>{section.title}</span>
              <span className="text-center">Asked</span>
              <span>Mandatory</span>
              <span />
            </div>
            <h3 className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-foreground-muted sm:hidden">{section.title}</h3>
            <ul className="space-y-1.5">
              {section.rows.map((r) => {
                const on = r.detail ? isAskedDetail(draft, r.detail) : true;
                return (
                  <li
                    key={r.key}
                    className={cn(GRID, "rounded-lg border px-2.5 py-1.5 transition-colors", on ? "border-border bg-surface" : "border-dashed border-border bg-background opacity-70")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{r.label}</span>
                      {r.own && <span className="block truncate text-[11px] font-semibold text-primary-deep">Your own field · {kindOf(r.own)}</span>}
                    </span>
                    <span className="flex justify-center">
                      {r.detail ? (
                        <Toggle checked={on} onChange={(next) => onChange(setTeacherAsked(draft, r.detail!, next))} label={`${r.label} asked`} title={on ? "Add teacher does not ask this" : "Add teacher asks this"} tone="success" />
                      ) : (
                        <Toggle checked label={`${r.label} asked`} title="Always asked" tone="success" disabled onChange={() => undefined} />
                      )}
                    </span>
                    <span className="col-start-1 sm:col-start-auto">
                      <TeacherMandatoryCell draft={draft} rowKey={r.key} onRequired={(required) => onChange(setTeacherMandatory(draft, r.key, required))} />
                    </span>
                    <span className="col-start-2 row-start-1 flex justify-end sm:col-start-auto sm:row-start-auto">
                      {r.own && (
                        <button
                          type="button"
                          aria-label={`Change ${r.label}`}
                          title="Change this field"
                          onClick={() => onEdit(r.own!)}
                          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
