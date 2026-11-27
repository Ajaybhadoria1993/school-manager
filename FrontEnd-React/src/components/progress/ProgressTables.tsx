import { useState } from "react";
import { shortDay } from "../../utils/calendar";
import { byTeacher } from "../../utils/teachingProgress";
import type { ProgressRow } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Table, Td, Th, Thead, Tr } from "../ui/Table";
import { ChapterBar } from "./ChapterBar";
import { ChapterListDialog } from "./ChapterListDialog";

const NONE = <Card className="px-5 py-10 text-center text-sm text-foreground-muted">No class or subject to show</Card>;

/**
 * Each class's subjects: how far the chapters are (and how many are late), the one going on, and the updates of the days asked. View lists
 * every chapter. When something is late, a tick leaves only those subjects.
 */
export function ChapterProgressTable({ rows, onlyBehind, onOnlyBehind }: { rows: ProgressRow[]; onlyBehind: boolean; onOnlyBehind: (only: boolean) => void }) {
  const [open, setOpen] = useState<ProgressRow | null>(null);
  if (rows.length === 0) return NONE;
  const shown = onlyBehind ? rows.filter((r) => r.late > 0) : rows;

  return (
    <div className="space-y-3">
      {(onlyBehind || rows.some((r) => r.late > 0)) && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
          <input type="checkbox" className="size-4 accent-primary" checked={onlyBehind} onChange={(e) => onOnlyBehind(e.target.checked)} />
          Only behind schedule
        </label>
      )}
      {shown.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-foreground-muted">Nothing is behind schedule</Card>
      ) : (
      <Table aria-label="Chapter progress">
        <Thead>
          <tr>
            <Th>Class</Th>
            <Th>Subject</Th>
            <Th>Chapters</Th>
            <Th>Running chapter</Th>
            <Th>Last update</Th>
            <Th>Updates</Th>
            <Th>Homework</Th>
            <Th>
              <span className="sr-only">Chapters of the subject</span>
            </Th>
          </tr>
        </Thead>
        <tbody>
          {shown.map((r) => (
            <Tr key={`${r.classId}:${r.sectionId ?? ""}:${r.subjectId}`}>
              <Td className="whitespace-nowrap">{r.classLabel}</Td>
              <Td>
                <span className="block font-semibold">{r.subjectName}</span>
                <span className="block text-xs text-foreground-muted">{r.teacherName ?? "No teacher"}</span>
              </Td>
              <Td>
                {r.chapters.length > 0 ? <ChapterBar done={r.chapters.filter((c) => c.done).length} total={r.chapters.length} /> : <span className="text-foreground-muted">Not added</span>}
                {r.late > 0 && (
                  <Badge tone="danger" className="mt-1">
                    {r.late} late
                  </Badge>
                )}
              </Td>
              <Td className="min-w-[9rem]">{r.current ? `${r.current.number}. ${r.current.name}` : "-"}</Td>
              <Td className="min-w-[12rem]">
                {r.last ? (
                  <>
                    <span className="block text-xs font-semibold text-foreground-muted">{shortDay(r.last.date)}</span>
                    <span className="block">{r.last.taught || r.last.homework || r.last.chapter?.name}</span>
                  </>
                ) : (
                  <Badge tone="warning">No update</Badge>
                )}
              </Td>
              <Td className="font-semibold">{r.updates}</Td>
              <Td className="font-semibold">{r.homework}</Td>
              <Td className="text-right">
                <Button variant="outline" size="sm" aria-label={`View ${r.subjectName} of ${r.classLabel}`} onClick={() => setOpen(r)}>
                  View
                </Button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      )}
      {open && <ChapterListDialog row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** The same rows added up by teacher. View shows that teacher's daily updates. */
export function TeacherTable({ rows, onView }: { rows: ProgressRow[]; onView: (teacherId: string) => void }) {
  const teachers = byTeacher(rows);
  if (teachers.length === 0) return NONE;

  return (
    <Table aria-label="Teachers">
      <Thead>
        <tr>
          <Th>Teacher</Th>
          <Th>Class subjects</Th>
          <Th>Updates</Th>
          <Th>Homework</Th>
          <Th>Chapters</Th>
          <Th>Late chapters</Th>
          <Th>Without an update</Th>
          <Th>
            <span className="sr-only">Updates of the teacher</span>
          </Th>
        </tr>
      </Thead>
      <tbody>
        {teachers.map((t) => (
          <Tr key={t.teacherId}>
            <Td className="font-semibold">{t.name}</Td>
            <Td>{t.subjects}</Td>
            <Td className="font-semibold">{t.updates}</Td>
            <Td className="font-semibold">{t.homework}</Td>
            <Td>{t.chaptersTotal > 0 ? <ChapterBar done={t.chaptersDone} total={t.chaptersTotal} /> : <span className="text-foreground-muted">Not added</span>}</Td>
            <Td>{t.late > 0 ? <Badge tone="danger">{t.late}</Badge> : 0}</Td>
            <Td>{t.withoutUpdate > 0 ? <Badge tone="warning">{t.withoutUpdate}</Badge> : 0}</Td>
            <Td className="text-right">
              <Button variant="outline" size="sm" aria-label={`View updates of ${t.name}`} onClick={() => onView(t.teacherId)}>
                View
              </Button>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
