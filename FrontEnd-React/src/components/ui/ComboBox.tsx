import { useEffect, useRef } from "react";
import { ComboBox as HeroComboBox, Input as HeroInput, ListBox } from "@heroui/react";
import { cn } from "../../utils/helpers";
import { controlClass, controlHeight, useControlStyle } from "./Input";

export interface ComboOption {
  value: string;
  /** A small grey word on the right of the row, for example "Already in your school". */
  note?: string;
  /** Shown but cannot be picked (the note says why). */
  disabled?: boolean;
}

/**
 * A dropdown that can be searched and that also takes an answer of its own: open it to pick from the list, or type
 * to narrow the list, or type something that is not in it and keep it (when nothing matches the list simply closes; say
 * what will happen with the text in the field's hint). The value is always the text in the box (picking
 * a row simply puts that row's text there), so the form never has to tell "picked" from "typed". It looks like Select
 * and follows the same rules as Input, including the soft "filled" look inside FilledControls.
 * With `onSelect` the box does something the moment a row is picked (and then holds no selection of its own), so "pick a
 * class" can be one click; typing something of your own and pressing Enter is for the form around it to handle.
 */
export function ComboBox({
  id,
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  invalid,
  disabled,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: {
  /** Shared with the Field around it: ties the label and the error message to the control. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called with the picked row's value, once, when a row is picked from the list. */
  onSelect?: (value: string) => void;
  options: readonly ComboOption[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Focus the box when it appears. */
  autoFocus?: boolean;
  className?: string;
  /** Only when there is no visible label to point at. */
  "aria-label"?: string;
}) {
  const style = useControlStyle();
  const input = useRef<HTMLInputElement>(null);

  // "autoFocus" the way a person focuses: the box gets the focus after it is drawn, so it opens its list like a click would
  // (the HTML autofocus attribute focuses it too early for the list to open).
  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  return (
    <HeroComboBox
      allowsCustomValue
      fullWidth
      menuTrigger="focus"
      inputValue={value}
      onInputChange={onChange}
      selectedKey={onSelect ? null : undefined}
      onSelectionChange={onSelect ? (key) => key !== null && onSelect(String(key)) : undefined}
      disabledKeys={options.filter((o) => o.disabled).map((o) => o.value)}
      isDisabled={disabled}
      isInvalid={invalid}
      className={cn("group", className)}
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel && id ? `${id}-label` : undefined}
      aria-describedby={invalid && id ? `${id}-error` : undefined}
    >
      <HeroComboBox.InputGroup>
        <HeroInput
          id={id}
          placeholder={placeholder}
          ref={input}
          autoComplete="off"
          className={cn(
            controlClass(style),
            controlHeight(style),
            "py-0 pl-3.5 pr-10 shadow-none ring-offset-0",
            "group-data-[invalid=true]:border-danger group-data-[invalid=true]:ring-2 group-data-[invalid=true]:ring-danger/30"
          )}
        />
        <HeroComboBox.Trigger />
      </HeroComboBox.InputGroup>
      <HeroComboBox.Popover className="rounded-xl border border-border bg-surface shadow-float">
        <ListBox className="max-h-64 overflow-y-auto p-1.5">
          {options.map((option) => (
            <ListBox.Item
              key={option.value}
              id={option.value}
              textValue={option.value}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-foreground data-[focused=true]:bg-primary-soft data-[selected=true]:font-semibold data-[selected=true]:text-primary-deep data-[disabled=true]:cursor-not-allowed data-[disabled=true]:text-foreground-muted/70"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="truncate">{option.value}</span>
                {option.note && <span className="shrink-0 text-xs font-normal text-foreground-muted">{option.note}</span>}
              </span>
            </ListBox.Item>
          ))}
        </ListBox>
      </HeroComboBox.Popover>
    </HeroComboBox>
  );
}
