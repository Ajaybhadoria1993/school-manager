import { Lock } from "lucide-react";
import { cn } from "../../../utils/helpers";
import { infoOf, type TeacherFieldsDraft } from "../../../utils/teacherLayout";
import { Toggle } from "../../students/export/Toggle";

/** A column the software always needs (the name, the mobile number, the gender, the username): Add teacher asks it whatever the Excel has. */
function Always({ title }: { title?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground-muted" title={title ?? "Always asked on Add teacher: the login needs it"}>
      <Lock className="size-3" aria-hidden />
      Always
    </span>
  );
}

/**
 * The Mandatory column of a column of the Excel. It is the same setting as on Add teacher's form: a switch where the school decides and
 * the form asks the detail (mandatory is then in the Excel and on the form alike), else what it always is.
 */
export function TeacherMandatoryCell({ draft, rowKey, onRequired }: { draft: TeacherFieldsDraft; rowKey: string; onRequired: (required: boolean) => void }) {
  const { heading, need } = infoOf(rowKey, draft.custom);
  if (need.kind === "always") return <Always />;
  if (need.kind === "auto") {
    return (
      <span className="text-xs font-bold text-foreground-muted" title="Made by the software">
        Auto
      </span>
    );
  }
  const mode = need.kind === "rule" ? draft.rules[need.rule] : need.field.mode;
  // A yes / no tick is never mandatory.
  if (need.kind === "custom" && need.field.type === "yesNo") {
    return (
      <span className="text-xs font-semibold text-foreground-muted/80" title="A yes / no tick">
        Optional
      </span>
    );
  }
  // Add teacher does not ask it: there is nothing to make mandatory until the form asks it (Manage fields > Add teacher form).
  if (mode === "hidden") {
    return (
      <span className="text-xs text-foreground-muted/60" title="Add teacher does not ask this detail">
        —
      </span>
    );
  }
  const required = mode === "required";
  return (
    <span className="flex items-center gap-1.5">
      <Toggle
        checked={required}
        onChange={onRequired}
        label={`${heading} mandatory`}
        title={required ? "Mandatory on Add teacher and in the Excel. Press to make it optional in both." : "Press to make it mandatory on Add teacher and in the Excel."}
      />
      <span className={cn("text-xs font-bold transition-colors", required ? "text-primary-deep" : "text-foreground-muted")}>{required ? "Mandatory" : "Optional"}</span>
    </span>
  );
}
