import { useCallback, useState } from "react";
import { useSaveResumeMutation } from "../redux/api/profileApi";
import { getApiError } from "../utils/apiErrors";
import { resumeForm } from "../utils/resume";

/**
 * The resume chosen on Add teacher: the teacher does not exist yet, so it is kept until they are added, then saved with `saveFor`. A file
 * that cannot be saved never undoes the teacher: `problem` says so.
 */
export function useNewResume() {
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [save] = useSaveResumeMutation();

  const clear = useCallback(() => {
    setFile(null);
    setProblem(null);
  }, []);
  const saveFor = useCallback(
    async (teacherId: string) => {
      setProblem(null);
      if (!file) return;
      try {
        await save({ owner: teacherId, body: resumeForm(file) }).unwrap();
      } catch (err) {
        setProblem(`The resume was not saved. ${getApiError(err)?.message ?? "Add it from the teacher's page."}`);
      }
    },
    [file, save]
  );

  return { file, pick: setFile, clear, saveFor, problem };
}
