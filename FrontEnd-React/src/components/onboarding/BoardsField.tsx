import { BookOpen, FileText, Languages, Map, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { MultiSelect, Select } from "../ui/Select";
import { BOARDS, MAX_BOARDS, MEDIUMS, OTHER_CHOICE, STATE_BOARDS, STATE_BOARD_CHOICE } from "../../constants/schoolOptions";
import { syncPlans } from "../../utils/mediumPlans";
import type { BoardDraft, BoardEntry } from "../../types";
import { PAGE_GRID } from "../students/form/formGrid";
import type { FieldErrors } from "./useFormValues";

export const emptyBoard = (): BoardDraft => ({ board: "", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: [], plans: [] });

/**
 * The boards a school follows, each with its own medium(s) and its own affiliation number: CBSE in English,
 * the M.P. Board in Hindi and English. One row to begin with; "Add another board" adds more. A "State Board"
 * row also asks which one, an "Other" row asks its name, and a board (or state board) already taken by
 * another row is greyed out in the list. Every medium chosen gets its own plan (its classes, sections, seats and
 * timing), which is filled in on the next screen, Class Sections.
 */
export function BoardsField({
  value,
  onChange,
  errors,
}: {
  value: BoardDraft[];
  onChange: (next: BoardDraft[]) => void;
  /** All the form's errors; this reads "boards.<row>.<part>" for board, stateBoard, otherBoard, mediums and affiliationNumber. */
  errors: FieldErrors;
}) {
  // A board saved before a field existed (or still held by a page that was opened earlier) can lack it. Filling
  // the gaps keeps every box controlled; an input whose value starts as undefined makes React warn once typed in.
  const rows = value.map((entry) => ({ ...emptyBoard(), ...entry }));
  const update = (index: number, patch: Partial<BoardDraft>) =>
    onChange(rows.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  const others = (index: number) => rows.filter((_, i) => i !== index);


  return (
    <div className="space-y-4">
      {rows.map((entry, i) => {
        const askState = entry.board === STATE_BOARD_CHOICE;
        const askName = entry.board === OTHER_CHOICE;
        const error = (part: keyof BoardEntry) => errors[`boards.${i}.${part}`];
        return (
          <div key={i} className="rounded-xl border border-border bg-surface-muted/40 p-3 sm:p-4">
            {rows.length > 1 && (
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Board {i + 1}</p>
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold text-foreground-muted transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </button>
              </div>
            )}
            <div className={PAGE_GRID}>
              <Field id={`board-${i}`} label="Board" error={error("board")}>
                <Select
                  id={`board-${i}`}
                  icon={BookOpen}
                  value={entry.board}
                  onChange={(board) =>
                    update(i, {
                      board,
                      stateBoard: board === STATE_BOARD_CHOICE ? entry.stateBoard : "",
                      otherBoard: board === OTHER_CHOICE ? entry.otherBoard : "",
                    })
                  }
                  options={BOARDS}
                  // The same board twice is a slip; a state board (or an "Other" board) can repeat, as each is a different board.
                  disabledValues={others(i)
                    .map((e) => e.board)
                    .filter((b) => b !== STATE_BOARD_CHOICE && b !== OTHER_CHOICE)}
                  placeholder="Choose board"
                  invalid={!!error("board")}
                />
              </Field>
              {askState && (
                <Field id={`stateBoard-${i}`} label="Which state board?" error={error("stateBoard")}>
                  <Select
                    id={`stateBoard-${i}`}
                    icon={Map}
                    value={entry.stateBoard}
                    onChange={(stateBoard) => update(i, { stateBoard })}
                    options={STATE_BOARDS}
                    disabledValues={others(i)
                      .map((e) => e.stateBoard)
                      .filter(Boolean)}
                    placeholder="Choose state board"
                    invalid={!!error("stateBoard")}
                  />
                </Field>
              )}
              {askName && (
                <Field id={`otherBoard-${i}`} label="Which board?" error={error("otherBoard")}>
                  <Input
                    id={`otherBoard-${i}`}
                    icon={Pencil}
                    value={entry.otherBoard}
                    onChange={(e) => update(i, { otherBoard: e.target.value })}
                    maxLength={80}
                    placeholder="Name of the board"
                    aria-invalid={!!error("otherBoard")}
                  />
                </Field>
              )}
              <Field id={`mediums-${i}`} label="Medium" error={error("mediums")}>
                <MultiSelect
                  id={`mediums-${i}`}
                  icon={Languages}
                  value={entry.mediums}
                  onChange={(mediums) => update(i, { mediums, plans: syncPlans(entry.plans, mediums) })}
                  options={MEDIUMS}
                  placeholder="Choose medium"
                  invalid={!!error("mediums")}
                />
              </Field>
              <Field id={`affiliationNumber-${i}`} label="Affiliation no." optional error={error("affiliationNumber")}>
                <Input
                  id={`affiliationNumber-${i}`}
                  icon={FileText}
                  value={entry.affiliationNumber}
                  onChange={(e) => update(i, { affiliationNumber: e.target.value })}
                  maxLength={50}
                  placeholder="This board's number"
                  aria-invalid={!!error("affiliationNumber")}
                />
              </Field>
            </div>

          </div>
        );
      })}

      {rows.length < MAX_BOARDS && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyBoard()])}>
          <Plus className="size-4" aria-hidden />
          Add another board
        </Button>
      )}
    </div>
  );
}
