import { useState } from "react";
import { Save } from "lucide-react";
import { useSchoolProfile } from "../../hooks/useSchoolProfile";
import { useSchoolProfileSave } from "../../hooks/useSchoolProfileSave";
import type { SchoolSteps } from "../../types";
import { draftFrom } from "../../utils/schoolProfile";
import { LogoField } from "../onboarding/LogoField";
import { SchoolProfileFields } from "../school/SchoolProfileForm";
import { ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

function SchoolForm({ steps }: { steps: SchoolSteps }) {
  const saved = draftFrom(steps);
  // What was typed; null while nothing was, so a fresh answer of the server shows through.
  const [typed, setTyped] = useState<typeof saved | null>(null);
  const draft = typed ?? saved;
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const { save, saving, error } = useSchoolProfileSave();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (await save(draft)) setTyped(null);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <ModalError message={error} />
      <SchoolProfileFields draft={draft} setDraft={setTyped} />
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!changed}>
          {!saving && <Save className="size-4" aria-hidden />}
          Save changes
        </Button>
      </div>
    </form>
  );
}

/** Settings > School details (the school's administrator): the logo, which saves as soon as it is chosen, and the school's details. */
export function SchoolDetailsTab() {
  const profile = useSchoolProfile();
  if (!profile) return <Skeleton className="h-96 rounded-2xl" />;
  return (
    <Card className="space-y-6 p-5 sm:p-6">
      <LogoField logoUrl={profile.steps[1].logoUrl} />
      <SchoolForm steps={profile.steps} />
    </Card>
  );
}
