import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { useCreateSubjectMutation, useGetSubjectsQuery } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";

/** The server's limit on a subject's name (backend/src/main/subjects/constants.ts). */
const MAX_SUBJECT_NAME = 40;

const chip = "h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";
const chipOn = "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/25";
const chipOff = "border-border bg-surface text-foreground-muted hover:border-primary/50";

/**
 * The subjects a teacher can teach, as chips to switch on and off, and **Other** at the end for a subject the school does not have
 * yet: its name is typed, Enter adds it to the school's subjects (the timetable has it from then on) and picks it. A name the school
 * already has (whatever the capitals) is picked, not made again.
 */
export function SubjectChips({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const subjects = useGetSubjectsQuery("active").data?.data.items ?? [];
  const [createSubject, { isLoading: adding }] = useCreateSubjectMutation();
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const pick = (id: string) => onChange(value.includes(id) ? value : [...value, id]);

  function close() {
    setTyping(false);
    setName("");
    setError(null);
  }

  async function add() {
    if (adding) return;
    const wanted = name.trim().replace(/\s+/g, " ");
    if (wanted === "") return close();
    if (wanted.length > MAX_SUBJECT_NAME) return setError(`Keep the subject name under ${MAX_SUBJECT_NAME} characters`);
    const same = subjects.find((s) => s.name.toLowerCase() === wanted.toLowerCase());
    if (same) {
      pick(same.id);
      return close();
    }
    try {
      const made = await createSubject({ name: wanted }).unwrap();
      pick(made.data.id);
      close();
    } catch (err) {
      const problem = getApiError(err);
      const about = Array.isArray(problem?.details) ? (problem.details as { path?: string; message?: string }[]).find((d) => d.path === "name")?.message : undefined;
      setError(about ?? problem?.message ?? "Could not add the subject. Please try again.");
    }
  }

  return (
    <div>
      <div role="group" aria-label="Subjects they can teach" className="flex flex-wrap items-center gap-2">
        {subjects.map((s) => {
          const on = value.includes(s.id);
          return (
            <button key={s.id} type="button" aria-pressed={on} onClick={() => toggle(s.id)} className={cn(chip, on ? chipOn : chipOff)}>
              {s.name}
            </button>
          );
        })}
        {typing ? (
          <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary bg-surface pl-2.5 pr-1 ring-4 ring-primary/15">
            <input
              autoFocus
              aria-label="New subject"
              value={name}
              maxLength={MAX_SUBJECT_NAME + 10}
              placeholder="Subject name"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                // Enter adds the subject (it must not send the form); Escape puts Other back.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                }
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "new-subject-error" : undefined}
              className="w-36 bg-transparent text-xs font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-[#94a3b8]"
            />
            <button
              type="button"
              aria-label="Add subject"
              disabled={adding}
              onClick={() => void add()}
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-primary-deep hover:bg-primary-soft disabled:opacity-50"
            >
              <Check className="size-3.5" aria-hidden />
            </button>
            <button type="button" aria-label="Cancel" onClick={close} className="flex size-6 cursor-pointer items-center justify-center rounded-md text-foreground-muted hover:bg-background">
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setTyping(true)} className={cn(chip, "inline-flex items-center gap-1 border-dashed text-primary-deep hover:border-primary/60 hover:bg-primary-soft/50")}>
            <Plus className="size-3.5" aria-hidden />
            Other
          </button>
        )}
      </div>
      {error && (
        <p id="new-subject-error" role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
