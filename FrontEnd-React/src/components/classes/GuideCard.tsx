import { ArrowRight, FolderTree, Layers, Rows3, X } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import { Card } from "../ui/Card";

const STEPS: { icon: typeof Layers; title: string; text: string; example: string; tone: Tone }[] = [
  {
    icon: Layers,
    title: "Department",
    text: "A heading that groups classes: Primary, Middle, Senior Secondary. Optional.",
    example: "Primary",
    tone: "info",
  },
  {
    icon: FolderTree,
    title: "Class",
    text: "A year of study. Each class has its own place in the teaching order.",
    example: "Class 5",
    tone: "success",
  },
  {
    icon: Rows3,
    title: "Section",
    text: "A group of students of one class who sit together. Optional: a class that is not split needs none.",
    example: "Class 5 - A",
    tone: "warning",
  },
];

/** A short "how this page works" for someone seeing it for the first time. Closes with the X; the Guide button opens it again. */
export function GuideCard({ onClose }: { onClose: () => void }) {
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
        <h2 className="text-base font-bold text-foreground">How this page works</h2>
        <p className="mt-0.5 text-sm text-foreground-muted">
          Your school is arranged in three levels. You can reopen this guide any time with the Guide button.
        </p>
        <ol className="mt-4 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {STEPS.map((step, i) => {
            const t = TONES[step.tone];
            return (
              <li key={step.title} className="contents">
                <div
                  className="stagger-item flex gap-3 rounded-2xl border border-border bg-background/60 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-surface hover:shadow-float"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", t.gradient)}>
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {i + 1}. {step.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-foreground-muted">{step.text}</p>
                    <p className={cn("mt-1.5 text-xs font-bold", t.text)}>For example: {step.example}</p>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight aria-hidden className="hidden size-5 self-center text-foreground-muted/50 md:block" />
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-foreground-muted">
          Tip: hover over a <span className="font-semibold text-foreground">?</span> or an icon to see what it does.
        </p>
      </div>
    </Card>
  );
}
