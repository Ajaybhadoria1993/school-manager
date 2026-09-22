"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { useToast } from "@/components/ui/toast-context";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input, Textarea, FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";
import type { ApiResponse, Homework, Subject } from "@/types";

export function HomeworkTab({ canCreate }: { canCreate: boolean }) {
  const { push } = useToast();
  const { classes, sectionsForClass, activeAcademicYear } = useAcademicSetup();
  const [sectionId, setSectionId] = useState("");
  const [classId, setClassId] = useState("");
  const [items, setItems] = useState<Homework[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    const res = await api.get<ApiResponse<Homework[]>>("/homework", { sectionId: sectionId || undefined });
    setItems(res.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Select
            className="w-48"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
            }}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select className="w-40" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
            <option value="">All sections</option>
            {sectionsForClass(classId).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {canCreate && (
          <Button onClick={() => setModalOpen(true)} disabled={!sectionId}>
            <Plus className="size-4" />
            Assign Homework
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState title="No homework yet" description="Select a section and assign homework to publish it." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((hw) => (
            <Card key={hw._id} className="p-4">
              <div className="flex items-start justify-between">
                <p className="font-medium text-foreground">{hw.title}</p>
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                  {(hw.subjectId as Subject)?.name}
                </span>
              </div>
              <p className="mt-1 text-sm text-foreground-muted">{hw.description}</p>
              <p className="mt-2 text-xs text-foreground-muted">Due {formatDate(hw.dueDate)}</p>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Assign Homework">
        <HomeworkForm
          classId={classId}
          sectionId={sectionId}
          onSave={async (data) => {
            if (!activeAcademicYear) return;
            try {
              await api.post("/homework", { academicYearId: activeAcademicYear._id, classId, sectionId, ...data });
              push("success", "Homework published — guardians notified");
              setModalOpen(false);
              load();
            } catch (err) {
              push("error", err instanceof ApiRequestError ? err.message : "Failed to publish homework");
            }
          }}
        />
      </Modal>
    </div>
  );
}

function HomeworkForm({
  classId,
  onSave,
}: {
  classId: string;
  sectionId: string;
  onSave: (data: { subjectId: string; title: string; description: string; dueDate: string }) => void;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    api.get<ApiResponse<Subject[]>>("/academics/subjects").then((res) => setSubjects(res.data.filter((s) => s.classId === classId)));
  }, [classId]);

  return (
    <div className="space-y-4">
      <FormField label="Subject">
        <Select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">Select subject</option>
          {subjects.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Title">
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormField>
      <FormField label="Description">
        <Textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <FormField label="Due Date">
        <Input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </FormField>
      <Button
        className="w-full"
        disabled={!subjectId || !title || !description || !dueDate}
        onClick={() => onSave({ subjectId, title, description, dueDate })}
      >
        Publish Homework
      </Button>
    </div>
  );
}
