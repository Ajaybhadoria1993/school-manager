import { useGetTeachingLogQuery } from "../../redux/api/classroomApi";
import { getApiError } from "../../utils/apiErrors";
import { shortDay } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import type { ProgressFilter } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { Table, Td, Th, Thead, Tr } from "../ui/Table";

/** The days asked entry by entry, newest first: the class, the subject and its teacher, the chapter, what was taught and the homework. */
export function DailyUpdates({ filter, page, onPage }: { filter: ProgressFilter; page: number; onPage: (page: number) => void }) {
  const res = useGetTeachingLogQuery({ ...filter, page });
  const data = res.isError ? undefined : res.data?.data;

  if (res.isFetching && !data) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data) return <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the updates."}</Card>;
  if (data.total === 0) return <Card className="px-5 py-10 text-center text-sm text-foreground-muted">Nothing written for these days</Card>;
  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div aria-busy={res.isFetching || undefined} className={cn("space-y-3 transition-opacity", res.isFetching && "opacity-70")}>
      <Table aria-label="Daily updates">
        <Thead>
          <tr>
            <Th>Day</Th>
            <Th>Class</Th>
            <Th>Subject</Th>
            <Th>Chapter</Th>
            <Th>Taught</Th>
            <Th>Homework</Th>
          </tr>
        </Thead>
        <tbody>
          {data.items.map((e) => (
            <Tr key={e.id}>
              <Td className="whitespace-nowrap font-semibold">{shortDay(e.date)}</Td>
              <Td className="whitespace-nowrap">{e.classLabel}</Td>
              <Td>
                <span className="block font-semibold">{e.subjectName}</span>
                <span className="block text-xs text-foreground-muted">{e.teacherName ?? "No teacher"}</span>
                {e.writtenBy !== e.teacherName && <span className="block text-xs text-foreground-muted">by {e.writtenBy}</span>}
              </Td>
              <Td className="min-w-[9rem]">{e.chapter ? `${e.chapter.number}. ${e.chapter.name}` : "-"}</Td>
              <Td className="min-w-[12rem] whitespace-pre-line">{e.taught || "-"}</Td>
              <Td className="min-w-[12rem] whitespace-pre-line">{e.homework || "-"}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-end gap-3">
          <p className="text-sm text-foreground-muted">
            Page {data.page} of {pages}
          </p>
          <Button variant="outline" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
