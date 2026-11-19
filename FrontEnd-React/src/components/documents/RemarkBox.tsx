import { useState } from "react";
import { useSaveRemarkMutation } from "../../redux/api/documentsApi";
import { getApiError } from "../../utils/apiErrors";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Textarea } from "../ui/Input";
import { useToast } from "../ui/toast-context";

/** The class teacher's remark on one child's report card for one exam: written here, saved on its own, and printed on the card. Emptied, it goes. */
export function RemarkBox({ studentId, examId, saved }: { studentId: string; examId: string; saved: string | null }) {
  const [text, setText] = useState(saved ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [save, saving] = useSaveRemarkMutation();
  const { push } = useToast();
  const changed = text.trim() !== (saved ?? "");

  async function submit() {
    setProblem(null);
    try {
      await save({ studentId, examId, remark: text.trim() }).unwrap();
      push("success", text.trim() === "" ? "Remark taken away" : "Remark saved");
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not save the remark. Please try again.");
    }
  }

  return (
    <div className="max-w-2xl space-y-2">
      <Field id="report-remark" label="Class teacher's remark" optional error={problem ?? undefined} hint="Printed on the report card. Up to 300 characters.">
        <Textarea id="report-remark" value={text} maxLength={300} rows={2} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button variant="outline" size="sm" onClick={() => void submit()} loading={saving.isLoading} disabled={!changed}>
        Save remark
      </Button>
    </div>
  );
}
