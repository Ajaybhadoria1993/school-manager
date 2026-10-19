"use client";

import { ListBox, Select as HeroSelect, type Key } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass, controlHeight, iconClass, useControlStyle } from "./Input";

export interface SelectOption {
  value: string;
  label: string;
}

interface FieldProps {
  /** Shared with the Field around it: ties the label and the error message to the control. */
  id?: string;
  /** Plain strings are their own label. */
  options: readonly (string | SelectOption)[];
  placeholder?: string;
  /** Values that cannot be picked (already taken elsewhere); they stay in the list, greyed out. */
  disabledValues?: readonly string[];
  /** A small icon inside the left edge, like Input. */
  icon?: LucideIcon;
  invalid?: boolean;
  disabled?: boolean;
  name?: string;
  className?: string;
  /** Only when there is no visible label to point at. */
  "aria-label"?: string;
}

interface SelectProps extends FieldProps {
  /** "" means nothing chosen yet (the placeholder is shown). */
  value: string;
  onChange: (value: string) => void;
}

interface MultiSelectProps extends FieldProps {
  /** The chosen values, in any order. [] means nothing chosen yet. */
  value: string[];
  /** The chosen values, always in the order of `options`. */
  onChange: (values: string[]) => void;
}

/** More chips than this collapse into "+N" so the box never wraps. */
const MAX_CHIPS = 3;

function Chips({ labels }: { labels: string[] }) {
  const shown = labels.slice(0, MAX_CHIPS);
  const rest = labels.length - shown.length;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {shown.map((label) => (
        <span
          key={label}
          className="truncate rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-deep ring-1 ring-inset ring-primary/20"
        >
          {label}
        </span>
      ))}
      {rest > 0 && <span className="shrink-0 text-xs font-semibold text-foreground-muted">+{rest}</span>}
    </span>
  );
}

/**
 * The box, the icon and the list that Select and MultiSelect share. HeroUI (React Aria underneath) does
 * the work that a styled native <select> cannot: the list is ours to style, it is a proper listbox for
 * keyboard and screen readers (arrows, type-ahead, Escape), and it looks the same in every browser. The
 * box follows the same rules as Input, including the soft "filled" look inside FilledControls.
 */
function SelectField({
  id,
  options,
  placeholder = "Select",
  disabledValues,
  icon: Icon,
  invalid,
  disabled,
  name,
  className,
  "aria-label": ariaLabel,
  multiple,
  value,
  onChange,
}: FieldProps & {
  multiple: boolean;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  const style = useControlStyle();
  const items = options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));

  const selection = multiple
    ? {
        selectionMode: "multiple" as const,
        value: value as string[],
        onChange: (keys: Key | Key[] | null) => {
          const picked = new Set((Array.isArray(keys) ? keys : keys === null ? [] : [keys]).map(String));
          onChange(items.map((item) => item.value).filter((v) => picked.has(v)));
        },
      }
    : {
        value: (value as string) || null,
        onChange: (key: Key | Key[] | null) => onChange(key === null || Array.isArray(key) ? "" : String(key)),
      };

  return (
    <HeroSelect
      {...(selection as object)}
      id={id}
      name={name}
      fullWidth
      className={cn("group", className)}
      placeholder={placeholder}
      isDisabled={disabled}
      disabledKeys={disabledValues}
      isInvalid={invalid}
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel && id ? `${id}-label` : undefined}
      aria-describedby={invalid && id ? `${id}-error` : undefined}
    >
      <HeroSelect.Trigger
        className={cn(
          controlClass(style),
          controlHeight(style),
          // ring-offset-0: HeroUI sets a ring offset on its fields, which would make our rings thicker than Input's.
          "cursor-pointer items-center justify-between py-0 pl-3.5 pr-10 text-left shadow-none ring-offset-0",
          // HeroUI marks the root data-invalid; Input's invalid look (red border + soft ring) is repeated here.
          "group-data-[invalid=true]:border-danger group-data-[invalid=true]:ring-2 group-data-[invalid=true]:ring-danger/30",
          // While the list is open the focus is inside it, so the box shows its focus look from aria-expanded.
          style === "filled"
            ? "aria-expanded:border-primary aria-expanded:bg-surface aria-expanded:ring-4 aria-expanded:ring-primary/15"
            : "aria-expanded:border-primary aria-expanded:ring-4 aria-expanded:ring-primary/15",
          Icon && "pl-11"
        )}
      >
        {Icon && <Icon className={iconClass} aria-hidden />}
        <HeroSelect.Value className="min-w-0 overflow-hidden">
          {({ defaultChildren, isPlaceholder, state }) =>
            multiple && !isPlaceholder && state.selectedItems.length > 0 ? (
              <Chips labels={state.selectedItems.map((item) => item.textValue)} />
            ) : (
              defaultChildren
            )
          }
        </HeroSelect.Value>
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover className="rounded-xl border border-border bg-surface shadow-float">
        <ListBox className="max-h-64 overflow-y-auto p-1.5" selectionMode={multiple ? "multiple" : "single"}>
          {items.map((item) => (
            <ListBox.Item
              key={item.value}
              id={item.value}
              textValue={item.label}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-foreground data-[focused=true]:bg-primary-soft data-[selected=true]:font-semibold data-[selected=true]:text-primary-deep data-[disabled=true]:cursor-not-allowed data-[disabled=true]:text-foreground-muted/60"
            >
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}

/** The one dropdown of the app: pick one. */
export function Select({ value, onChange, ...field }: SelectProps) {
  return <SelectField {...field} multiple={false} value={value} onChange={(next) => onChange(next as string)} />;
}

/** The same dropdown for a choice that can have several answers (more than one board, more than one medium). */
export function MultiSelect({ value, onChange, ...field }: MultiSelectProps) {
  return <SelectField {...field} multiple value={value} onChange={(next) => onChange(next as string[])} />;
}
