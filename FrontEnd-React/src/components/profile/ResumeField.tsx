import { useGetResumeQuery, useRemoveResumeMutation, useSaveResumeMutation } from "../../redux/api/profileApi";
import { useDownloadSheetMutation } from "../../redux/api/studentsApi";
import { resumeForm } from "../../utils/resume";
import { ResumePicker } from "./ResumePicker";

/**
 * A saved teacher's resume (`teacherId`), or the signed-in teacher's own without one: uploaded and removed at once; only downloaded without
 * `canChange`.
 */
export function ResumeField({ teacherId, canChange }: { teacherId?: string; canChange: boolean }) {
  const owner = teacherId ?? "mine";
  const res = useGetResumeQuery(owner);
  const [save, saving] = useSaveResumeMutation();
  const [remove, removing] = useRemoveResumeMutation();
  const [download, downloading] = useDownloadSheetMutation();
  if (!res.data) return null;
  const resume = res.data.data.resume;
  const url = teacherId ? (`/staff/teachers/${teacherId}/resume/file` as const) : ("/profile/resume/file" as const);

  return (
    <ResumePicker
      file={resume}
      saving={saving.isLoading}
      removing={removing.isLoading}
      downloading={downloading.isLoading}
      onDownload={() => download({ url, fallbackName: resume?.name ?? "resume" }).unwrap()}
      onPick={canChange ? (file) => save({ owner, body: resumeForm(file) }).unwrap() : undefined}
      onRemove={canChange ? () => remove(owner).unwrap() : undefined}
    />
  );
}
