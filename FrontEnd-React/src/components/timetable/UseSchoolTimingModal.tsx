import { RotateCcw } from "lucide-react";
import { Button } from "@heroui/react";
import { useSaveClassDayMutation } from "../../redux/api/timetableApi";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { useToast } from "../ui/toast-context";

/**
 * "Are you sure?" before a class goes back to the school's timing (2026-11-17, from the pencil's neighbour in the Class timings card and from
 * the *Use the school's timing* button of the class window): never done at the first click. Yes takes the class's own timing away
 * (`PUT /timetable/class-day` with no days of its own); a class with lessons in periods the school's day does not have is asked a second
 * time, in the same window, before those lessons are taken out.
 */
export function UseSchoolTimingModal({ klass, onClose }: { klass: { id: string; name: string }; onClose: () => void }) {
  const { push } = useToast();
  const [saveClassDay] = useSaveClassDayMutation();
  const { busy, error, run, clearError } = useSave(onClose);
  const asked = error?.code === "LESSONS_IN_REMOVED_PERIODS";

  const go = (removeLessons: boolean) =>
    run(async () => {
      await saveClassDay({ classId: klass.id, days: [], removeLessons }).unwrap();
      push("success", `${klass.name} follows the school's timing`);
    });

  return (
    <AppModal
      title={asked ? "Take those lessons out?" : "Are you sure?"}
      icon={RotateCcw}
      tone={asked ? "danger" : "primary"}
      busy={busy}
      onClose={onClose}
      footer={
        asked ? (
          <>
            <Button variant="secondary" onPress={clearError} isDisabled={busy}>
              Go back
            </Button>
            <Button variant="danger" isPending={busy} onPress={() => void go(true)}>
              Take those lessons out and use the school's timing
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isPending={busy} onPress={() => void go(false)}>
              Yes, use the school's timing
            </Button>
          </>
        )
      }
    >
      {asked ? (
        <div role="alert" className="space-y-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="font-semibold">{error?.message}</p>
          <p>If you go on, those lessons are taken out of the timetable of every section of {klass.name}. This cannot be undone.</p>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-foreground">{klass.name} will follow the school's timing again.</p>
          <p className="text-foreground-muted">Its own timing is taken away. You can give {klass.name} a timing of its own again at any time.</p>
          <ModalError message={error ? error.message : null} />
        </div>
      )}
    </AppModal>
  );
}
