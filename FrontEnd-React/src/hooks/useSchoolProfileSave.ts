import { useState } from "react";
import { useUpdateSchoolProfileMutation } from "../redux/api/onboardingApi";
import { getApiError } from "../utils/apiErrors";
import { toProfileInput, type ProfileDraft } from "../utils/schoolProfile";
import { useAuth } from "./useAuth";
import { useToast } from "../components/ui/toast-context";

/** Saves an approved school's details and says so; `save` answers true when it worked, and `error` keeps what was wrong when it did not. */
export function useSchoolProfileSave() {
  const { refreshMe } = useAuth();
  const [update, { isLoading: saving }] = useUpdateSchoolProfileMutation();
  const { push } = useToast();
  const [error, setError] = useState<string | null>(null);

  async function save(draft: ProfileDraft): Promise<boolean> {
    setError(null);
    if (!draft.schoolType || !draft.state) {
      setError("Choose a school type and state before saving.");
      return false;
    }
    try {
      await update(toProfileInput(draft)).unwrap();
      // The school's name is also in the top bar.
      await refreshMe().catch(() => undefined);
      push("success", "School details have been updated.");
      return true;
    } catch (err) {
      setError(getApiError(err)?.message ?? "Could not save the school details. Please try again.");
      return false;
    }
  }

  return { save, saving, error, clearError: () => setError(null) };
}
