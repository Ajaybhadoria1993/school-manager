import { useState } from "react";
import { Wand2 } from "lucide-react";
import { levelToClass } from "../../constants/academics";
import { CLASS_LEVELS } from "../../constants/schoolOptions";
import { useQuickSetupMutation } from "../../redux/api/academicsApi";
import { TONES } from "../../constants/tones";
import { departmentIcon, departmentTone, describeSections, plural, quickSetupPlan } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { useToast } from "../ui/toast-context";
import { ModalError } from "../ui/AppModal";
import { useSave } from "./useSave";

const LEVEL_OPTIONS = CLASS_LEVELS.map((level) => ({ value: level, label: levelToClass(level).name }));
const SECTION_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map((n) => ({
  value: String(n),
  label: n === 0 ? "None yet (I will add them class by class)" : `${plural(n, "section")} (${describeSections(n)})`,
}));

/**
 * "Create all my classes at once": pick the first and the last class, and how many sections each has, and see
 * exactly what will be made before pressing the button. Classes the school already has are left alone.
 */
export function QuickSetupForm({
  defaultFrom,
  defaultTo,
  onDone,
}: {
  defaultFrom: string;
  defaultTo: string;
  onDone?: () => void;
}) {
  const { push } = useToast();
  const [quickSetup] = useQuickSetupMutation();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  // Most schools do not have the same number of sections in every class, so the default adds none: each class gets its own.
  const [sections, setSections] = useState("0");
  const { busy, error, run } = useSave(() => onDone?.());

  const plan = quickSetupPlan(from, to);
  const classCount = plan.reduce((sum, group) => sum + group.classes.length, 0);
  const backwards = classCount === 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (backwards) return;
    run(async () => {
      const { data } = await quickSetup({ fromClass: from, toClass: to, sectionsPerClass: Number(sections) }).unwrap();
      push(
        "success",
        `Created ${plural(data.classesCreated, "class")}` +
          (data.sectionsCreated > 0 ? ` with ${plural(data.sectionsCreated, "section")}` : "") +
          (data.classesSkipped > 0 ? `. ${plural(data.classesSkipped, "class")} you already had were left as they are.` : "")
      );
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="quick-from" label="First class">
          <Select id="quick-from" value={from} onChange={setFrom} options={LEVEL_OPTIONS} />
        </Field>
        <Field id="quick-to" label="Last class" error={backwards ? "The last class must come after the first." : undefined}>
          <Select id="quick-to" value={to} onChange={setTo} options={LEVEL_OPTIONS} invalid={backwards} />
        </Field>
        <Field id="quick-sections" label="Sections in each class" hint="You can add or remove sections of any class later.">
          <Select id="quick-sections" value={sections} onChange={setSections} options={SECTION_OPTIONS} />
        </Field>
      </div>

      {!backwards && (
        <div className="rounded-2xl border border-border bg-background p-4" aria-live="polite">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-foreground-muted">
            This will create {plural(classCount, "class")}
            {Number(sections) > 0 && <> and {plural(classCount * Number(sections), "section")}</>}
          </p>
          <ul className="space-y-2.5">
            {plan.map((group, i) => {
              const t = TONES[departmentTone(i)];
              const Icon = departmentIcon(group.department);
              return (
                <li key={group.department} className="pop-in flex flex-wrap items-center gap-x-3 gap-y-1.5" style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="flex w-40 shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
                    <span className={cn("flex size-7 items-center justify-center rounded-lg", t.gradient)}>
                      <Icon className="size-3.5" aria-hidden />
                    </span>
                    {group.department}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {group.classes.map((name) => (
                      <span key={name} className={cn("rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", t.chip)}>
                        {name}
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ModalError message={error?.message ?? null} />

      <Button type="submit" size="lg" loading={busy} disabled={backwards}>
        <Wand2 className="size-4" aria-hidden />
        {backwards ? "Create classes" : `Create ${plural(classCount, "class")}`}
      </Button>
    </form>
  );
}
