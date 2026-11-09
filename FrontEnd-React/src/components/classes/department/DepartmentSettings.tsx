import { useState } from "react";
import { Pencil } from "lucide-react";
import type { AcademicStructure, DepartmentItem } from "../../../types";
import { TipButton } from "../../ui/Hint";
import { RenameDepartmentModal } from "./RenameDepartmentModal";

/**
 * The small pencil next to a department's name on its own screen: it opens the window where the department is renamed or deleted.
 * It has no labelled button of its own on the page, because it is rarely needed. It is the only way to do either: the list page's
 * heading has just Manage.
 */
export function DepartmentSettings({
  department,
  structure,
  onDelete,
}: {
  department: DepartmentItem;
  structure: AcademicStructure;
  /** Called after the window has closed, to ask "delete it?" */
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TipButton label={`Rename or delete ${department.name}`} icon={Pencil} onPress={() => setOpen(true)} />
      {open && <RenameDepartmentModal department={department} structure={structure} onClose={() => setOpen(false)} onDelete={onDelete} />}
    </>
  );
}
