import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { getApiError } from "../../utils/apiErrors";
import { cn, initials } from "../../utils/helpers";
import { MAX_PHOTO_BYTES, shrinkPhoto } from "../../utils/image";
import { Button } from "../ui/Button";

/**
 * A person's photo as a round picture (their initials until there is one), with Add / Change / Remove. A chosen picture is made small in
 * the browser first (`shrinkPhoto`). What happens to it is the owner's: `onPick` saves it at once, or keeps it until the person is added.
 */
export function PhotoPicker({
  label,
  optional = false,
  name,
  photo,
  onPick,
  onRemove,
  saving = false,
  removing = false,
  className,
}: {
  /** The words above the picture ("Your photo"); left out, the picture stands alone. */
  label?: string;
  optional?: boolean;
  name: string;
  photo: string | null;
  /** Left out: the picture is only looked at. A rejected promise is shown under it. */
  onPick?: (picture: Blob, fileName: string) => unknown;
  onRemove?: () => unknown;
  saving?: boolean;
  removing?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = saving || removing;

  async function run(action: () => unknown, failed: string) {
    setProblem(null);
    try {
      await action();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? failed);
    }
  }

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file || !onPick) return;
    setProblem(null);
    const small = await shrinkPhoto(file);
    if (small.size > MAX_PHOTO_BYTES) {
      setProblem("The photo is too big. Choose a smaller picture.");
      return;
    }
    await run(() => onPick(small, file.name), "The photo could not be saved. Please try again.");
  }

  return (
    <div className={className}>
      {label && (
        <p className="mb-1.5 text-sm font-semibold text-foreground">
          {label}{" "}
          {optional && (
            <span data-photo-optional className="font-normal text-foreground-muted">
              (optional)
            </span>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary-soft text-lg font-bold text-primary-deep")}>
          {photo ? <img src={photo} alt={`Photo of ${name || "this person"}`} className="size-full object-cover" /> : <span aria-hidden>{initials(name)}</span>}
        </span>
        {onPick && (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose a photo" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" loading={saving} disabled={busy} onClick={() => input.current?.click()}>
              {photo ? "Change photo" : "Add photo"}
            </Button>
            {photo && onRemove && (
              <Button type="button" variant="ghost" size="sm" aria-label="Remove the photo" loading={removing} disabled={busy} onClick={() => void run(onRemove, "The photo could not be removed. Please try again.")}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
