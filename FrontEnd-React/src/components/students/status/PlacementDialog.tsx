import { useState } from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@heroui/react";
import { useGetStructureQuery } from "../../../redux/api/academicsApi";
import { useReactivateStudentsMutation } from "../../../redux/api/studentsApi";
import { namesPreview } from "../../../utils/students";
import { useSave } from "../../classes/useSave";
import { AppModal, ModalError } from "../../ui/AppModal";
import { Field } from "../../ui/Field";
import { Select } from "../../ui/Select";
import { useToast } from "../../ui/toast-context";

/**
 * "Where does this student study this year?": a student who left in an earlier year has no class in the running year, so making them
 * active needs one. The class and section are the running year's; their old classes stay in their history as they were. One request
 * for every student chosen (a student who already has a class this year keeps it). A full section is refused by the server and said here.
 */
export function PlacementDialog({ students, onClose, onDone }: { students: { id: string; name: string }[]; onClose: () => void; onDone?: () => void }) {
  const structureRes = useGetStructureQuery();
  const [reactivate] = useReactivateStudentsMutation();
  const { push } = useToast();
  const { busy, error, run } = useSave(onClose);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [problem, setProblem] = useState<{ field: "class" | "section"; message: string } | null>(null);
  const classes = structureRes.data?.data.classes ?? [];
  const klass = classes.find((c) => c.id === classId);
  const one = students.length === 1 ? students[0] : null;

  async function send() {
    setProblem(null);
    if (!klass) return setProblem({ field: "class", message: "Choose the class" });
    if (klass.sections.length > 0 && !sectionId) return setProblem({ field: "section", message: "Choose the section" });
    await run(async () => {
      const res = await reactivate({ ids: students.map((s) => s.id), placement: { classId: klass.id, ...(sectionId ? { sectionId } : {}) } }).unwrap();
      push("success", res.message ?? "Active again");
      onDone?.();
    });
  }

  return (
    <AppModal
      title={one ? `Where does ${one.name} study this year?` : "Where do these students study this year?"}
      icon={UserCheck}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isPending={busy} onPress={() => void send()}>
            Make active
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground-muted">
        {one ? `${one.name} has` : `${namesPreview(students.map((s) => s.name))} have`} no class in this academic year (they left earlier), so choose where to put them. Their old classes stay in their history.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="placement-class" label="Class" error={problem?.field === "class" ? problem.message : undefined}>
          <Select
            id="placement-class"
            aria-label="Class"
            value={classId}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Pick the class"
            onChange={(id) => {
              setClassId(id);
              setSectionId("");
            }}
          />
        </Field>
        <Field id="placement-section" label="Section" optional={!klass || klass.sections.length === 0} error={problem?.field === "section" ? problem.message : undefined}>
          <Select
            id="placement-section"
            aria-label="Section"
            value={sectionId}
            options={(klass?.sections ?? []).map((s) => ({ value: s.id, label: `Section ${s.name}` }))}
            disabled={!klass || klass.sections.length === 0}
            placeholder={klass && klass.sections.length === 0 ? "No sections" : "Pick the section"}
            onChange={setSectionId}
          />
        </Field>
      </div>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}
