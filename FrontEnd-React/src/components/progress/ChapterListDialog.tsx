import { ListOrdered } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { Link } from "react-router";
import { useCan } from "../../hooks/useCan";
import { shortDay } from "../../utils/calendar";
import type { ProgressChapter, ProgressRow } from "../../types";
import { AppModal } from "../ui/AppModal";
import { Badge } from "../ui/Badge";

function Status({ chapter, running }: { chapter: ProgressChapter; running: boolean }) {
  if (chapter.done) return <Badge tone="success">Finished{chapter.completedOn ? ` ${shortDay(chapter.completedOn)}` : ""}</Badge>;
  if (running) return <Badge tone="primary">Running</Badge>;
  return chapter.days > 0 ? <Badge tone="warning">Started</Badge> : <Badge>Not started</Badge>;
}

/** "3 days, from 30 Oct · finish by 10 Nov": on how many days it was taught, and the day it is planned for. */
function facts(c: ProgressChapter): string {
  const taught = c.days > 0 ? `${c.days} ${c.days === 1 ? "day" : "days"}${c.startedOn ? `, from ${shortDay(c.startedOn)}` : ""}` : "";
  return [taught, c.plannedOn ? `finish by ${shortDay(c.plannedOn)}` : ""].filter(Boolean).join(" · ");
}

/** Every chapter of one class's subject: finished, late, running or not started, when it was taught and is due. To read only. */
export function ChapterListDialog({ row, onClose }: { row: ProgressRow; onClose: () => void }) {
  const can = useCan();
  const section = row.sectionId ? `section=${row.sectionId}&` : "";

  return (
    <AppModal
      title={`${row.subjectName}, ${row.classLabel}`}
      icon={ListOrdered}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose}>
            Close
          </HeroButton>
          {can("classwork.view") && (
            <Link to={`/class-work/${row.classId}?${section}tab=diary`} className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white">
              Open diary
            </Link>
          )}
        </>
      }
    >
      <p className="text-sm text-foreground-muted">{row.teacherName ?? "No teacher"}</p>
      {row.chapters.length === 0 ? (
        <p className="text-center text-sm text-foreground-muted">No chapters added yet</p>
      ) : (
        <ol className="divide-y divide-border">
          {row.chapters.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {c.number}. {c.name}
                </p>
                {facts(c) && <p className="text-xs text-foreground-muted">{facts(c)}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {c.late && <Badge tone="danger">Late</Badge>}
                <Status chapter={c} running={row.current?.number === c.number} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </AppModal>
  );
}
