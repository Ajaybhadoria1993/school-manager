import { ArrowRight, FolderTree, UserPlus, UsersRound, X } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import { Card } from "../ui/Card";

const STEPS: { icon: typeof UserPlus; title: string; text: string; tone: Tone }[] = [
  {
    icon: UserPlus,
    title: "Admit",
    text: "Admit student opens one page: the child, the class and section, a parent, the address. Press Admit at the top: the admission number is made for you.",
    tone: "info",
  },
  {
    icon: UsersRound,
    title: "Parents",
    text: "Start a parent with their mobile number. If they already have a child here we find them, so a brother or sister is linked to the same parent.",
    tone: "warning",
  },
  {
    icon: FolderTree,
    title: "One place a year",
    text: "A student sits in one class and section each academic year. A full section asks before it takes one more. Last year's class stays in their history.",
    tone: "success",
  },
];

/** A short "how this page works" for someone seeing it for the first time. Closes with the X; the Guide button opens it again. */
export function StudentsGuide({ onClose }: { onClose: () => void }) {
  return (
    <Card className="fade-in relative overflow-hidden p-5">
      <div aria-hidden className="absolute -right-12 -top-12 size-44 rounded-full bg-gradient-to-br from-primary/15 to-transparent blur-2xl" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the guide"
        className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
      <div className="relative">
        <h2 className="text-base font-bold text-foreground">How students work</h2>
        <p className="mt-0.5 pr-8 text-sm text-foreground-muted">Three ideas, then you are ready. You can reopen this guide any time with the Guide button.</p>
        <ol className="mt-4 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STEPS.map((step, i) => (
            <li key={step.title} className="contents">
              <div
                className="stagger-item flex gap-3 rounded-2xl border border-border bg-background/60 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-surface hover:shadow-float"
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES[step.tone].gradient)}>
                  <step.icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">{step.text}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && <ArrowRight aria-hidden className="hidden size-5 self-center text-foreground-muted/50 md:block" />}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-foreground-muted">
          Tip: hover over a <span className="font-semibold text-foreground">?</span> or a button to see what it does.
        </p>
      </div>
    </Card>
  );
}
