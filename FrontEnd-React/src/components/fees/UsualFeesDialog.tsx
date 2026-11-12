import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { FEE_KINDS, FREQUENCY_LABEL, USUAL_FEES } from "../../constants/fees";
import { useCreateFeeHeadsMutation } from "../../redux/api/feesApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { useToast } from "../ui/toast-context";

const keyOf = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * "Add the usual fees": the fees most Indian schools have, grouped by what they are about, with what nearly every school has already
 * ticked and a line on each (what it is, how schools charge it). A fee the school already has is shown as added. One request adds them all.
 */
export function UsualFeesDialog({ have, onClose }: { have: string[]; onClose: () => void }) {
  const added = useMemo(() => new Set(have.map(keyOf)), [have]);
  const [picked, setPicked] = useState<string[]>(() => USUAL_FEES.filter((u) => u.core && !added.has(keyOf(u.name))).map((u) => u.name));
  const [problem, setProblem] = useState<string | null>(null);
  const [create, creating] = useCreateFeeHeadsMutation();
  const { push } = useToast();
  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  async function save() {
    setProblem(null);
    try {
      const heads = USUAL_FEES.filter((u) => picked.includes(u.name)).map((u) => ({
        name: u.name,
        kind: u.kind,
        refundable: !!u.refundable,
        defaultFrequency: u.frequency,
        defaultAppliesTo: u.appliesTo,
        defaultOptional: u.optional,
      }));
      const res = await create({ heads }).unwrap();
      push("success", res.data.created === 1 ? "1 fee added" : `${res.data.created} fees added`);
      onClose();
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not add the fees. Please try again.");
    }
  }

  return (
    <AppModal
      title="Add the usual fees"
      icon={ListChecks}
      size="lg"
      busy={creating.isLoading}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={creating.isLoading}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={creating.isLoading} disabled={picked.length === 0}>
            {picked.length === 1 ? "Add 1 fee" : `Add ${picked.length} fees`}
          </Button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        {FEE_KINDS.map((kind) => {
          const list = USUAL_FEES.filter((u) => u.kind === kind.value);
          if (list.length === 0) return null;
          return (
            <section key={kind.value} aria-label={kind.label}>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-foreground-muted">{kind.label}</h3>
              <ul className="space-y-1">
                {list.map((u) => {
                  const done = added.has(keyOf(u.name));
                  return (
                    <li key={u.name}>
                      <label className={cn("flex items-start gap-3 rounded-xl border border-border px-3 py-2", done ? "opacity-60" : "cursor-pointer hover:bg-surface-muted", picked.includes(u.name) && "border-primary/40 bg-primary-soft/50")}>
                        <input type="checkbox" className="mt-1 size-4 accent-[var(--color-primary)]" checked={done || picked.includes(u.name)} disabled={done} onChange={() => toggle(u.name)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-semibold text-foreground">{u.name}</span>
                            <span className="text-xs font-medium text-foreground-muted">{done ? "Already added" : `${FREQUENCY_LABEL[u.frequency]}${u.optional ? " · optional" : ""}${u.refundable ? " · refundable" : ""}`}</span>
                          </span>
                          <span className="block text-xs text-foreground-muted">{u.note}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <ModalError message={problem} />
    </AppModal>
  );
}
