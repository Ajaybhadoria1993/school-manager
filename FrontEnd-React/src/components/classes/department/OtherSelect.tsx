import { useState } from "react";
import { Check, X } from "lucide-react";
import { OTHER } from "../../../utils/academics";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select, type SelectOption } from "../../ui/Select";

/**
 * A dropdown with an "Other..." row. Picking any other row calls `onPick` at once; picking "Other..." opens a box under
 * it to type a name of your own, and Enter (or the tick) calls `onCustom` with it. `onCustom` says whether it worked: if so
 * the box closes, if not it stays so the name can be fixed. Escape (or the cross) puts everything back.
 */
export function OtherSelect({
  id,
  label,
  value,
  options,
  placeholder = "Type a name",
  onPick,
  onCustom,
}: {
  id?: string;
  /** For a screen reader, since the box has no visible label of its own. */
  label: string;
  value: string;
  /** Must include a row whose value is `OTHER`. */
  options: readonly SelectOption[];
  placeholder?: string;
  onPick: (value: string) => void;
  onCustom: (name: string) => Promise<boolean>;
}) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = text.trim().replace(/\s+/g, " ");
    if (!name || busy) return;
    setBusy(true);
    const worked = await onCustom(name);
    setBusy(false);
    if (worked) {
      setTyping(false);
      setText("");
    }
  }

  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        aria-label={label}
        value={typing ? OTHER : value}
        options={options}
        onChange={(next) => {
          if (next === OTHER) {
            setTyping(true);
            return;
          }
          setTyping(false);
          onPick(next);
        }}
      />
      {typing && (
        <form onSubmit={submit} className="fade-in flex items-center gap-1.5">
          <Input
            aria-label={`${label}: type a name`}
            value={text}
            maxLength={60}
            autoFocus
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setTyping(false);
                setText("");
              }
            }}
          />
          <Button type="submit" size="sm" loading={busy} disabled={!text.trim()} aria-label="Use this name" className="shrink-0 px-3">
            {!busy && <Check className="size-4" aria-hidden />}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Cancel"
            className="shrink-0 px-3"
            onClick={() => {
              setTyping(false);
              setText("");
            }}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </form>
      )}
    </div>
  );
}
