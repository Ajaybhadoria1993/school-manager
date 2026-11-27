import { useCallback, useState } from "react";
import { useSavePersonPhotoMutation } from "../redux/api/profileApi";
import type { PhotoPerson } from "../types";
import { getApiError } from "../utils/apiErrors";
import { photoForm } from "../utils/image";

/**
 * The photo chosen on Add teacher / Add staff: the person does not exist yet, so it is kept (and previewed) until they are added, then saved
 * with `saveFor`. A photo that cannot be saved never undoes the person: `problem` says so.
 */
export function useNewPhoto() {
  const [chosen, setChosen] = useState<{ picture: Blob; fileName: string; preview: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [save] = useSavePersonPhotoMutation();

  const pick = useCallback((picture: Blob, fileName: string) => {
    const reader = new FileReader();
    reader.onload = () => setChosen({ picture, fileName, preview: String(reader.result) });
    reader.readAsDataURL(picture);
  }, []);
  const clear = useCallback(() => {
    setChosen(null);
    setProblem(null);
  }, []);
  const saveFor = useCallback(
    async (person: PhotoPerson) => {
      setProblem(null);
      if (!chosen) return;
      try {
        await save({ ...person, body: photoForm(chosen.picture, chosen.fileName) }).unwrap();
      } catch (err) {
        setProblem(`The photo was not saved. ${getApiError(err)?.message ?? "Add it from their page."}`);
      }
    },
    [chosen, save]
  );

  return { preview: chosen?.preview ?? null, pick, clear, saveFor, problem };
}
