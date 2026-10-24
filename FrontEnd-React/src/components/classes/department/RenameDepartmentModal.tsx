import { Pencil, Trash2 } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useRenameDepartmentMutation } from "../../../redux/api/academicsApi";
import { getApiError } from "../../../utils/apiErrors";
import { departmentNameRows } from "../../../utils/academics";
import type { AcademicStructure, DepartmentItem } from "../../../types";
import { AppModal } from "../../ui/AppModal";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/toast-context";
import { OtherSelect } from "./OtherSelect";

/**
 * Change a department's name in a small window: a dropdown of the usual names no department uses yet, or "Other..." to type a
 * name of your own; picking one renames it at once, and a name another department uses is refused with a message while the box
 * stays open. It is only a heading, so renaming changes nothing else. With `onDelete` the window also offers Delete department
 * (the caller asks "are you sure?" after this window has closed; the classes stay, in no department).
 */
export function RenameDepartmentModal({
  department,
  structure,
  onClose,
  onDelete,
}: {
  department: DepartmentItem;
  structure: AcademicStructure;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { push } = useToast();
  const [rename] = useRenameDepartmentMutation();

  async function renameTo(name: string): Promise<boolean> {
    try {
      await rename({ id: department.id, name }).unwrap();
      push("success", `Renamed to ${name}`);
      return true;
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not rename the department.");
      return false;
    }
  }

  return (
    <AppModal
      title={onDelete ? `Rename or delete ${department.name}` : `Rename ${department.name}`}
      icon={Pencil}
      onClose={onClose}
      footer={
        <HeroButton variant="secondary" onPress={onClose}>
          Close
        </HeroButton>
      }
    >
      <div>
        <p className="mb-1.5 text-sm font-semibold text-foreground">Department name</p>
        <OtherSelect
          label="Department name"
          value={`dept:${department.id}`}
          options={departmentNameRows(structure.departments, department)}
          placeholder="Type the department name"
          onPick={(value) => value.startsWith("new:") && renameTo(value.slice(4))}
          onCustom={renameTo}
        />
        <p className="mt-1.5 text-xs text-foreground-muted">
          Pick a usual name from the list, or choose Other... and type your own. It is only a heading: renaming it changes nothing else.
        </p>
      </div>

      {onDelete && (
        <div className="rounded-xl border border-danger/25 p-4">
          <p className="text-sm font-semibold text-foreground">Delete this department</p>
          <p className="mt-1 text-xs text-foreground-muted">
            Only the heading is deleted.{" "}
            {department.classCount > 0
              ? `Its ${department.classCount === 1 ? "class stays" : `${department.classCount} classes stay`} in your school, in no department.`
              : "It has no classes."}
          </p>
          <Button
            variant="ghost"
            className="mt-3 text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => {
              onClose();
              onDelete();
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete department
          </Button>
        </div>
      )}
    </AppModal>
  );
}
