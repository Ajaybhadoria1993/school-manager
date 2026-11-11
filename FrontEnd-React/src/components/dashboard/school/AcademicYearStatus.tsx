import { useRef, useState } from "react";
import { AlertTriangle, CalendarRange, RefreshCw } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useGetCurrentAcademicYearQuery, useSetUpFirstAcademicYearMutation } from "../../../redux/api/academicsApi";
import { checkAcademicYear, formatDayRange } from "../../../utils/academicYear";
import { getApiError } from "../../../utils/apiErrors";
import { AcademicYearFields, type AcademicYearValues } from "../../onboarding/AcademicYearFields";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { useToast } from "../../ui/toast-context";

const line = "inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm";

/**
 * The school's current session for the dashboard's status strip, read from the server ("Current Academic Year: 2026-2027",
 * with its first and last day). While it loads it shows a placeholder; if the request fails it says so and offers Retry; a
 * school with no year says that (the card under the header lets its administrator set it up).
 */
export function AcademicYearBadge() {
  const { data, isLoading, isError, refetch, isFetching } = useGetCurrentAcademicYearQuery();
  const year = data?.data.year;

  if (isLoading) {
    return (
      <span aria-busy="true" className="inline-flex w-64 items-center">
        <span className="sr-only">Loading the academic year</span>
        <span aria-hidden className="h-3.5 w-full animate-pulse rounded-full bg-surface-muted" />
      </span>
    );
  }
  if (isError || !data) {
    return (
      <span role="alert" className={`${line} font-medium text-danger`}>
        <AlertTriangle className="size-4" aria-hidden />
        Could not load the academic year
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-60"
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
          Retry
        </button>
      </span>
    );
  }
  if (!year) {
    return (
      <span className={`${line} font-medium text-warning`}>
        <AlertTriangle className="size-4" aria-hidden />
        Academic year not set up yet
      </span>
    );
  }
  return (
    <span className={`${line} text-foreground`}>
      <CalendarRange className="size-4 text-primary" aria-hidden />
      <span>
        Current Academic Year: <strong className="font-bold">{year.name}</strong>
      </span>
      <span className="hidden text-foreground-muted sm:inline">· {formatDayRange(year.startDate, year.endDate)}</span>
    </span>
  );
}

const EMPTY: AcademicYearValues = { name: "", startDate: "", endDate: "" };

/**
 * Only for a school that has no academic year at all, which happens to a school approved before academic years existed:
 * its administrator names the session that is running now, once. Nothing is guessed for it. Shown to anyone else at the
 * school as a note to ask the administrator.
 */
export function AcademicYearSetUp() {
  const { user } = useAuth();
  const { push } = useToast();
  const { data } = useGetCurrentAcademicYearQuery();
  const [setUp, { isLoading }] = useSetUpFirstAcademicYearMutation();
  const [values, setValues] = useState<AcademicYearValues>(EMPTY);
  const latest = useRef(values);
  const [errors, setErrors] = useState<Partial<Record<keyof AcademicYearValues | "_form", string>>>({});

  if (!data?.data.needsSetUp || data.data.year) return null;
  const canSetUp = user?.role === "school_admin" || user?.role === "principal";

  function change(field: keyof AcademicYearValues, value: string) {
    latest.current = { ...latest.current, [field]: value };
    setValues(latest.current);
    setErrors((e) => ({ ...e, [field]: undefined, _form: undefined }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local = checkAcademicYear(values.name, values.startDate, values.endDate);
    if (Object.values(local).some(Boolean)) return setErrors(local);
    try {
      const res = await setUp({ name: values.name.trim(), startDate: values.startDate, endDate: values.endDate }).unwrap();
      push("success", `Academic year ${res.data.name} set up`);
    } catch (err) {
      const apiErr = getApiError(err);
      const next: typeof errors = {};
      for (const d of (Array.isArray(apiErr?.details) ? apiErr.details : []) as { path?: string; message?: string }[]) {
        const field = d.path?.replace(/^academicYear\./, "") as keyof AcademicYearValues | undefined;
        if (field && d.message && !next[field]) next[field] = d.message;
      }
      if (Object.keys(next).length === 0) next._form = apiErr?.message ?? "Could not set up the academic year. Please try again.";
      setErrors(next);
    }
  }

  return (
    <Card className="border-amber-300/60 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <CalendarRange className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-section-heading">Set up your current academic year</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Your school was approved before academic years were added, so none is set yet. Name the session that is running now,
            with its own first and last day. It becomes your current academic year, and the sections you already made are kept for it.
          </p>
        </div>
      </div>

      {canSetUp ? (
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <AcademicYearFields idPrefix="first-academic-year" values={values} errors={errors} onChange={change} />
          {errors._form && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {errors._form}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={isLoading}>
              Set up academic year
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground-muted">
          Ask your school administrator to set it up.
        </p>
      )}
    </Card>
  );
}
