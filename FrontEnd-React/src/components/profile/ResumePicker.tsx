import { useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { getApiError } from "../../utils/apiErrors";
import { RESUME_ACCEPT, fileSizeText, resumeProblem } from "../../utils/resume";
import { Button } from "../ui/Button";

/**
 * A teacher's resume: the file's name and size, with Upload / Replace, Download and Remove. A wrong file (not PDF or Word, over 2 MB) is
 * said at once and not taken. What happens to a chosen file is the owner's: `onPick` saves it, or keeps it until the teacher is added.
 */
export function ResumePicker({
  optional = false,
  file,
  onPick,
  onRemove,
  onDownload,
  saving = false,
  removing = false,
  downloading = false,
  className,
}: {
  optional?: boolean;
  file: { name: string; size: number } | null;
  /** Left out: the resume is only downloaded. A rejected promise is shown under it. */
  onPick?: (file: File) => unknown;
  onRemove?: () => unknown;
  onDownload?: () => unknown;
  saving?: boolean;
  removing?: boolean;
  downloading?: boolean;
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

  async function choose(chosen: File | undefined) {
    if (input.current) input.current.value = "";
    if (!chosen || !onPick) return;
    const wrong = resumeProblem(chosen);
    setProblem(wrong);
    if (!wrong) await run(() => onPick(chosen), "The resume could not be saved. Please try again.");
  }

  return (
    <div className={className}>
      <p className="mb-1.5 text-sm font-semibold text-foreground">
        Resume {optional && <span className="font-normal text-foreground-muted">(optional)</span>}
      </p>
      <div className="flex min-h-16 flex-wrap items-center gap-3">
        {file ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <FileText className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block max-w-56 truncate text-sm font-semibold text-foreground">{file.name}</span>
              <span className="block text-xs text-foreground-muted">{fileSizeText(file.size)}</span>
            </span>
          </span>
        ) : (
          !onPick && <span className="text-sm text-foreground-muted">No resume uploaded</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {file && onDownload && (
            <Button type="button" variant="outline" size="sm" loading={downloading} disabled={downloading} onClick={() => void run(onDownload, "The resume could not be downloaded.")}>
              <Download className="size-4" aria-hidden />
              Download
            </Button>
          )}
          {onPick && (
            <>
              <input ref={input} type="file" accept={RESUME_ACCEPT} aria-label="Choose a resume" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" loading={saving} disabled={busy} onClick={() => input.current?.click()}>
                <Upload className="size-4" aria-hidden />
                {file ? "Replace" : "Upload resume"}
              </Button>
            </>
          )}
          {file && onRemove && (
            <Button type="button" variant="ghost" size="sm" aria-label="Remove the resume" loading={removing} disabled={busy} onClick={() => void run(onRemove, "The resume could not be removed.")}>
              <Trash2 className="size-4" aria-hidden />
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
