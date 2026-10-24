import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../utils/helpers";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.4)] hover:bg-primary-hover hover:shadow-[0_6px_14px_-2px_rgb(37_99_235/0.45)]",
  secondary: "bg-primary-soft text-primary-deep hover:bg-[#dbe7ff]",
  outline: "border border-border bg-surface text-foreground shadow-sm hover:bg-background hover:border-[#cbd5e1]",
  ghost: "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
  danger: "bg-[#dc2626] text-white shadow-sm hover:bg-danger",
};

// 40px is the desktop height, 44px (lg) is for touch-first screens such as sign-in.
const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
