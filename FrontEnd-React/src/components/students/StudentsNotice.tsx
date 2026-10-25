import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import { Card } from "../ui/Card";

/**
 * A full-width card that says why the list is empty and what to do next (no academic year yet, no classes yet, no students yet, or
 * nobody matches the search): a few lines of explanation (`children`, none when the title says it all) and the next step as buttons or
 * links (`actions`).
 */
export function StudentsNotice({ icon: Icon, tone, title, children, actions }: { icon: LucideIcon; tone: Tone; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Card className="fade-in relative overflow-hidden px-6 py-10 text-center sm:py-12">
      <div aria-hidden className={cn("absolute -right-16 -top-16 size-56 rounded-full bg-gradient-to-br to-transparent blur-3xl", TONES[tone].glow)} />
      <span aria-hidden className={cn("relative mx-auto flex size-14 items-center justify-center rounded-2xl", TONES[tone].gradient)}>
        <Icon className="size-7" />
      </span>
      <h2 className="relative mt-4 text-lg font-bold tracking-tight text-foreground">{title}</h2>
      {children && <div className="relative mx-auto mt-1.5 max-w-xl space-y-1 text-sm text-foreground-muted">{children}</div>}
      {actions && <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2.5">{actions}</div>}
    </Card>
  );
}
