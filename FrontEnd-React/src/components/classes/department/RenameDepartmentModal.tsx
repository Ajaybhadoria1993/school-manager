import { Archive, Pencil } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useRenameDepartmentMutation } from "../../../redux/api/academicsApi";
import { getApiError } from "../../../utils/apiErrors";
import { departmentNameRows, plural } from "../../../utils/academics";
import type { AcademicStructure, DepartmentItem } from "../../../types";
import { AppModal } from "../../ui/AppModal";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/toast-context";
import { OtherSelect } from "./OtherSelect";

/**
 * Change a department in a small window: its name (a dropdown of the usual names no department uses yet, or "Other..." to type a
 * name of your own; picking one renames it at once, and a name another department uses is refused with a message while the box
 * stays open), or Make inactive (the caller asks "are you sure?" after this window has closed). A department is never deleted: it is
 * made inactive when the school no longer uses it, which needs all of its classes to be inactive first. It is only a heading, so neither
 * changes anything else.
 */
export function RenameDepartmentModal({
  department,
  structure,
  onClose,
  onDeactivate,
}: {
  department: DepartmentItem;
  structure: AcademicStructure;
  onClose: () => void;
  onDeactivate: () => void;
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

  const blocked = department.classCount > 0;

  return (
    <AppModal
      title={`Rename or make ${department.name} inactive`}
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
        <p className="mt-1.5 text-xs text-foreground-muted">Pick a name from the list, or choose Other... to type your own.</p>
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-semibold text-foreground">Make this department inactive</p>
        <p className="mt-1 text-xs text-foreground-muted">
          {blocked
            ? `It still has ${plural(department.classCount, "active class")}. Make ${department.classCount === 1 ? "it" : "them"} inactive first.`
            : "Nothing is deleted. You can make it active again from the Inactive list on the Classes & Sections page."}
        </p>
        <Button
          variant="outline"
          className="mt-3"
          disabled={blocked}
          onClick={() => {
            onClose();
            onDeactivate();
          }}
        >
          <Archive className="size-4" aria-hidden />
          Make inactive
        </Button>
      </div>
    </AppModal>
  );
}
