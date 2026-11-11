import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useRemoveLogoMutation, useSaveLogoMutation } from "../../redux/api/onboardingApi";
import { API_URL } from "../../redux/api/baseQueryWithReauth";
import { getApiError } from "../../utils/apiErrors";
import { Button } from "../ui/Button";

const TOO_BIG_BYTES = 500 * 1024;

/**
 * The school's logo, for its report cards, certificates and receipts. Optional. It saves as soon as a picture is chosen, on its own (it is
 * not a box of the form), so going Back and forth never loses it.
 */
export function LogoField({ logoUrl }: { logoUrl: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [saveLogo, saving] = useSaveLogoMutation();
  const [removeLogo, removing] = useRemoveLogoMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const busy = saving.isLoading || removing.isLoading;

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (file.size > TOO_BIG_BYTES) {
      setProblem("The logo is bigger than 500 KB. Choose a smaller picture.");
      return;
    }
    setProblem(null);
    const form = new FormData();
    form.append("logo", file);
    try {
      await saveLogo(form).unwrap();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "The logo could not be saved. Please try again.");
    }
  }

  async function remove() {
    setProblem(null);
    try {
      await removeLogo().unwrap();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "The logo could not be removed. Please try again.");
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-foreground">
        School logo <span className="font-normal text-foreground-muted">(optional)</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-surface-muted/60">
          {logoUrl ? <img src={`${API_URL}${logoUrl}`} alt="School logo" className="size-full object-contain" /> : <ImagePlus className="size-5 text-foreground-muted/60" aria-hidden />}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose a logo" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" loading={saving.isLoading} disabled={busy} onClick={() => input.current?.click()}>
            {logoUrl ? "Change logo" : "Upload logo"}
          </Button>
          {logoUrl && (
            <Button type="button" variant="outline" size="sm" loading={removing.isLoading} disabled={busy} onClick={remove}>
              <Trash2 className="size-4" aria-hidden />
              Remove
            </Button>
          )}
        </div>
      </div>
      {problem && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
