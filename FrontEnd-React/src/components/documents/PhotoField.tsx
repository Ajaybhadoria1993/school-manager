import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useGetStudentPhotoQuery, useRemoveStudentPhotoMutation, useSaveStudentPhotoMutation } from "../../redux/api/documentsApi";
import { getApiError } from "../../utils/apiErrors";
import { MAX_PHOTO_BYTES, shrinkPhoto } from "../../utils/image";
import { Button } from "../ui/Button";

/**
 * A student's photo, for their ID card: shown small, with Upload / Change / Remove for a person who may edit students. A chosen picture is made small
 * in the browser first and saved at once, on its own (it is not a box of the student's form).
 */
export function PhotoField({ studentId, name, canChange }: { studentId: string; name: string; canChange: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const res = useGetStudentPhotoQuery(studentId);
  const [save, saving] = useSaveStudentPhotoMutation();
  const [remove, removing] = useRemoveStudentPhotoMutation();
  const photo = res.data?.data.photo ?? null;
  const busy = saving.isLoading || removing.isLoading;

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setProblem(null);
    const small = await shrinkPhoto(file);
    if (small.size > MAX_PHOTO_BYTES) {
      setProblem("The photo is too big. Choose a smaller picture.");
      return;
    }
    const body = new FormData();
    body.append("photo", small, file.name);
    try {
      await save({ studentId, body }).unwrap();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "The photo could not be saved. Please try again.");
    }
  }

  async function take() {
    setProblem(null);
    try {
      await remove(studentId).unwrap();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "The photo could not be removed. Please try again.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted/60">
        {photo ? <img src={photo} alt={`Photo of ${name}`} className="size-full object-cover" /> : <ImagePlus className="size-5 text-foreground-muted/60" aria-hidden />}
      </span>
      {canChange && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose a photo" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
            <Button type="button" variant="outline" size="sm" loading={saving.isLoading} disabled={busy} onClick={() => input.current?.click()}>
              {photo ? "Change photo" : "Add photo"}
            </Button>
            {photo && (
              <Button type="button" variant="ghost" size="sm" aria-label="Remove the photo" loading={removing.isLoading} disabled={busy} onClick={() => void take()}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>
          {problem && (
            <p role="alert" className="text-xs text-danger">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
