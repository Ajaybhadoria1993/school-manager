import { useRef, useState } from "react";
import { ComboBox as HeroComboBox, Input as HeroInput, ListBox, type Key } from "@heroui/react";
import { Plus } from "lucide-react";
import { cn } from "../../utils/helpers";
import { controlClass, controlHeight, useControlStyle } from "./Input";
import type { SelectOption } from "./Select";

/** What the row at the end of the list says, and does, for an answer the list does not have. */
export interface SearchSelectCreate {
  /** With nothing typed: for example "Add a new field…". */
  idle: string;
  /** With a word typed that is none of the choices: for example `Add “Bus route” as a new field`. */
  typed: (text: string) => string;
  /** The word typed ("" when nothing was typed). */
  onCreate: (text: string) => void;
  /** Why a word typed cannot be made into a new answer (it is taken); the last row then says so, and cannot be picked. Null: it can. */
  refuse?: (text: string) => string | null;
}

/** Only the last row has this text; it always stays in the list, whatever is typed. */
const CREATE_TEXT = "\u0000create";

const contains = (text: string, typed: string) => text.toLowerCase().includes(typed.trim().toLowerCase());

/**
 * The dropdown that can be searched: it looks like Select (one answer, the chosen one shown in the box), and opening it shows every
 * choice; typing narrows the list to the choices that have those letters. With `create`, the list ends in a row for an answer that
 * is not in it (a word typed that is none of the choices offers itself by name), which hands the word to the page instead of
 * choosing something. Leaving the box without picking puts the chosen answer's name back. The box takes the soft "filled" look
 * inside FilledControls, like Input and Select.
 */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  create,
  placeholder,
  disabled,
  className,
  inputClassName,
  popoverClassName,
  "aria-label": ariaLabel,
}: {
  /** Shared with the Field around it: ties the label and the error message to the control. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  create?: SearchSelectCreate;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Classes for the box itself, merged over its own (a smaller box in a table heading, a coloured one). */
  inputClassName?: string;
  popoverClassName?: string;
  /** Only when there is no visible label to point at. */
  "aria-label"?: string;
}) {
  const style = useControlStyle();
  const chosen = options.find((o) => o.value === value)?.label ?? "";

  // The text in the box: the chosen answer's name until the person types. It follows the answer when the page changes it.
  const [text, setText] = useState(chosen);
  const [seen, setSeen] = useState(chosen);
  if (chosen !== seen) {
    setSeen(chosen);
    setText(chosen);
  }

  const input = useRef<HTMLInputElement>(null);
  // Whether the list is open: a box that keeps the focus after a pick opens its list again only on a click, which is asked of the arrow.
  const [open, setOpen] = useState(false);
  // The first mouse-up after the box took the focus must not undo the selecting of its text (a click would put the caret in it).
  const justFocused = useRef(false);

  const search = text.trim();
  const searching = search !== "" && search.toLowerCase() !== chosen.toLowerCase();
  const alreadyThere = options.some((o) => o.label.toLowerCase() === search.toLowerCase());
  const offer = !create ? null : !searching ? create.idle : alreadyThere ? null : create.typed(search);
  // A word that cannot become a new answer says why, in the place of the offer.
  const refusal = create && searching && !alreadyThere ? (create.refuse?.(search) ?? null) : null;

  return (
    <HeroComboBox
      fullWidth
      menuTrigger="focus"
      onOpenChange={setOpen}
      // Both are ours (the text and the chosen answer), so the box does not put the chosen answer's name back by itself: it asks, through
      // onSelectionChange, when the person leaves it or presses Escape.
      inputValue={text}
      onInputChange={setText}
      selectedKey={value || null}
      onSelectionChange={(key: Key | null) => {
        if (key === null) return;
        setText(chosen);
        if (key === CREATE_TEXT) {
          const word = searching ? search : "";
          // The list closes with the focus (the page opens its own window next).
          input.current?.blur();
          create?.onCreate(word);
        } else if (String(key) !== value) onChange(String(key));
      }}
      defaultFilter={(label, typed) => label === CREATE_TEXT || contains(label, typed)}
      isDisabled={disabled}
      className={cn("group", className)}
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel && id ? `${id}-label` : undefined}
    >
      <HeroComboBox.InputGroup>
        <HeroInput
          id={id}
          ref={input}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={(e) => {
            // The chosen answer's name is selected, so typing replaces it. Not when words are already typed: the box is given the focus
            // again when its list opens, and that must not select (and so replace) them.
            const box = e.currentTarget;
            if (box.value !== chosen) return;
            justFocused.current = true;
            box.select();
          }}
          onClick={() => {
            if (!open) input.current?.closest("[data-slot='combo-box-input-group']")?.querySelector<HTMLButtonElement>("[data-slot='combo-box-trigger']")?.click();
          }}
          onMouseUp={(e) => {
            if (!justFocused.current) return;
            justFocused.current = false;
            e.preventDefault();
          }}
          className={cn(controlClass(style), controlHeight(style), "cursor-pointer truncate py-0 pl-3.5 pr-10 text-left shadow-none ring-offset-0", inputClassName)}
        />
        {/* The arrow is for the mouse: Tab leaves the box (and puts the chosen answer's name back) in one step. */}
        <HeroComboBox.Trigger excludeFromTabOrder />
      </HeroComboBox.InputGroup>
      <HeroComboBox.Popover className={cn("min-w-60 max-w-72 rounded-xl border border-border bg-surface shadow-float", popoverClassName)}>
        <ListBox className="max-h-64 overflow-y-auto p-1.5">
          {[
            ...options.map((option) => (
              <ListBox.Item
                key={option.value}
                id={option.value}
                textValue={option.label}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-foreground data-[focused=true]:bg-primary-soft data-[selected=true]:font-semibold data-[selected=true]:text-primary-deep"
              >
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )),
            ...(refusal
              ? [
                  <ListBox.Item
                    key={CREATE_TEXT}
                    id={CREATE_TEXT}
                    textValue={CREATE_TEXT}
                    isDisabled
                    // Disabled only so it cannot be picked: it is read, so it keeps its full colour.
                    className="cursor-default whitespace-normal rounded-lg border-t border-border/60 px-3 py-2 text-xs leading-snug text-foreground opacity-100 data-[disabled=true]:opacity-100 aria-disabled:opacity-100"
                  >
                    {refusal}
                  </ListBox.Item>,
                ]
              : offer
              ? [
                  <ListBox.Item
                    key={CREATE_TEXT}
                    id={CREATE_TEXT}
                    textValue={CREATE_TEXT}
                    className="cursor-pointer rounded-lg border-t border-border/60 px-3 py-1.5 text-sm font-semibold text-primary-deep data-[focused=true]:bg-primary-soft"
                  >
                    <span className="flex items-center gap-1.5">
                      <Plus className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{offer}</span>
                    </span>
                  </ListBox.Item>,
                ]
              : []),
          ]}
        </ListBox>
      </HeroComboBox.Popover>
    </HeroComboBox>
  );
}
