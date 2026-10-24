import { CheckCircle2, Wand2 } from "lucide-react";
import { levelToClass } from "../../constants/academics";
import { Card } from "../ui/Card";
import { InfoTip } from "../ui/Hint";
import { QuickSetupForm } from "./QuickSetupForm";

const POINTS = [
  "Check the first and the last class",
  "Departments and classes are made for you",
  "Then add sections to each class with one click",
];

/**
 * What a school with no classes sees first: a one-click setup, with a navy side panel in the dashboard's style. A school
 * is normally given its classes when it is approved, so this is for one that has none (or deleted them all).
 */
export function QuickSetupPanel({
  defaultFrom,
  defaultTo,
  fromSignup,
  onAddSingle,
}: {
  defaultFrom: string;
  defaultTo: string;
  /** True when the range is the one the school gave at sign-up, so the panel can say so. */
  fromSignup: boolean;
  onAddSingle: () => void;
}) {
  return (
    <Card className="stagger-item overflow-hidden lg:grid lg:grid-cols-[19rem_1fr]">
      <div className="relative overflow-hidden bg-gradient-to-br from-navy via-[#14307a] to-primary p-6 text-white">
        <div aria-hidden className="float-slow absolute -right-10 -top-10 size-44 rounded-full bg-sky/30 blur-3xl" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div className="relative">
          <span className="float-slow flex size-14 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur">
            <Wand2 className="size-7 text-sky" aria-hidden />
          </span>
          <h2 className="mt-5 flex items-center gap-2 text-xl font-extrabold tracking-tight">
            Add your classes
            <span className="text-white/70">
              <InfoTip label="What does this do?">
                Creates every class between the two you pick, each in its usual department. You see the full list before anything is
                saved.
              </InfoTip>
            </span>
          </h2>
          <p className="mt-2 text-sm text-slate-200">
            {fromSignup
              ? `At sign-up you told us your classes run from ${levelToClass(defaultFrom).name} to ${levelToClass(defaultTo).name}.`
              : "Most schools run from Nursery or LKG up to Class 10 or 12."}{" "}
            Check them and we create them all.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-slate-100">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="p-6">
        <QuickSetupForm defaultFrom={defaultFrom} defaultTo={defaultTo} />
        <p className="mt-4 text-sm text-foreground-muted">
          Rather do it by hand?{" "}
          <button
            type="button"
            onClick={onAddSingle}
            className="font-semibold text-primary-deep underline-offset-2 hover:underline"
          >
            Add a single class
          </button>
          .
        </p>
      </div>
    </Card>
  );
}
