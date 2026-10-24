import { cloneElement, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { CircleHelp, type LucideIcon } from "lucide-react";
import { Button, Tooltip } from "@heroui/react";
import { cn } from "../../utils/helpers";

/**
 * A small "?" that explains something when you hover it, tab to it or tap it. Put it next to a heading or a
 * label the first-time user might wonder about. Keep the text to a sentence or two.
 */
export function InfoTip({ label = "What is this?", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger
        aria-label={label}
        className={cn(
          "inline-flex size-5 cursor-help items-center justify-center rounded-full text-foreground-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          className
        )}
      >
        <CircleHelp className="size-4" aria-hidden />
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-64 text-left leading-snug">{children}</Tooltip.Content>
    </Tooltip>
  );
}

/** Shows `tip` when the button inside is hovered or focused. The child must be our `Button`. */
export function WithTip({ tip, children }: { tip: ReactNode; children: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>> }) {
  return (
    <Tooltip delay={400}>
      <Tooltip.Trigger
        render={(props) => {
          // The trigger brings its own className and children; the button keeps its own. Its role="button" is dropped so a
          // link wrapped in a tip stays a link for a screen reader (a real button is a button already).
          const { className, children: _children, role: _role, ...behaviour } = props;
          return cloneElement(children, behaviour as ButtonHTMLAttributes<HTMLButtonElement>);
        }}
      />
      <Tooltip.Content className="max-w-64 text-left leading-snug">{tip}</Tooltip.Content>
    </Tooltip>
  );
}

/** A square icon button whose label shows on hover (and is what a screen reader reads). */
export function TipButton({
  label,
  icon: Icon,
  onPress,
  danger,
  disabled,
  onDark,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** For a button on a dark banner: light icon, frosted hover. */
  onDark?: boolean;
}) {
  return (
    <Tooltip delay={250}>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        aria-label={label}
        onPress={onPress}
        isDisabled={disabled}
        className={
          onDark
            ? "text-white/80 hover:bg-white/15 hover:text-white"
            : danger
              ? "text-foreground-muted hover:bg-danger-soft hover:text-danger"
              : "text-foreground-muted hover:bg-primary-soft hover:text-primary"
        }
      >
        <Icon className="size-4" aria-hidden />
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
