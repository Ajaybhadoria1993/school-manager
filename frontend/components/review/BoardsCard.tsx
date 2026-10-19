import { BookOpen, Languages } from "lucide-react";
import { Chip } from "@heroui/react";
import { boardLabel } from "@/lib/schoolOptions";
import type { BoardEntry } from "@/types";
import { DetailCard } from "./DetailCard";
import { CopyButton } from "./RowActions";

/** Each board the school follows, with its medium(s) and its own affiliation number. */
export function BoardsCard({ boards, index }: { boards: BoardEntry[]; index: number }) {
  return (
    <DetailCard
      icon={BookOpen}
      title="Boards and medium"
      subtitle={boards.length === 0 ? "None added yet" : `${boards.length} board${boards.length === 1 ? "" : "s"}, each with its own medium and number`}
      tone="success"
      index={index}
      plain
    >
      {boards.length === 0 ? (
        <p className="py-4 text-sm text-foreground-muted">The school has not added a board yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {boards.map((entry) => (
            <li key={`${entry.board}-${entry.stateBoard}-${entry.otherBoard}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">{boardLabel(entry)}</p>
                {entry.board === "State Board" && <p className="text-xs text-foreground-muted">State board</p>}
                {entry.board === "Other" && <p className="text-xs text-foreground-muted">Board named by the school</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
                  <Languages className="size-4" aria-hidden />
                  Medium
                </span>
                {entry.mediums.map((medium) => (
                  <Chip key={medium} color="accent" variant="soft" size="sm">
                    <Chip.Label>{medium}</Chip.Label>
                  </Chip>
                ))}
                <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
                {entry.affiliationNumber ? (
                  <span className="inline-flex items-center gap-1">
                    <Chip color="default" variant="secondary" size="sm">
                      <Chip.Label>
                        Affiliation no. <span className="font-mono tracking-wide">{entry.affiliationNumber}</span>
                      </Chip.Label>
                    </Chip>
                    <CopyButton text={entry.affiliationNumber} label={`${boardLabel(entry)} affiliation number`} />
                  </span>
                ) : (
                  <Chip color="warning" variant="soft" size="sm">
                    <Chip.Label>No affiliation number</Chip.Label>
                  </Chip>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}
