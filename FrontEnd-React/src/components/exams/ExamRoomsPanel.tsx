import { useState } from "react";
import { DoorOpen, Pencil, Plus, Trash2, TriangleAlert, UserPlus, UserRound } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import {
  useAddExamRoomMutation,
  useDeleteExamRoomMutation,
  useGetExamDutyTeachersQuery,
  useGetExamRoomsQuery,
  useSaveExamDutyMutation,
  useUpdateExamRoomMutation,
} from "../../redux/api/examsApi";
import type { ExamDetail, ExamRoom } from "../../types";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { getApiError } from "../../utils/apiErrors";
import { classesOfExam } from "../../utils/exams";
import { AppModal } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { MultiSelect, Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

/** The highest roll number a school gives (the server's MAX_ROLL_NUMBER). */
const MAX_ROLL = 999;
/** How many roll numbers a new run takes by default: a room of thirty. */
const ROOM_SIZE = 30;
/** The most teachers on duty in a room (the server's MAX_DUTY_TEACHERS). */
const MAX_DUTY = 2;

interface Draft {
  room: string;
  classId: string;
  sectionId: string;
  fromRoll: string;
  toRoll: string;
}

const placeName = (className: string, sectionName: string | null) => (sectionName ? `${className} - ${sectionName}` : className);

/** "  Room  101 " and "room 101" are one room (the server's `roomKeyOf`). */
const roomKeyOf = (room: string) => room.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Exam > Rooms (2026-11-27, the user: "Room number: kitne se kitne bacche kis room mein rahenge"): each room with the run of roll numbers of a class
 * (or section) that sits in it, and how many children that is; a room can hold runs of several classes. Add room (and a run's pencil) writes a row:
 * the room, the class, its section, from and to (a new run starts after the last one of that class, thirty long), and its Children cell counts the
 * run while it is written (from the roll numbers the rooms read brings); the bin takes a run away. The classes or sections with children still out
 * of a room are said on top (and the ones with no roll number yet, which are given on Students). The school's sections are read only when a row is
 * written.
 *
 * **On duty** (2026-11-27, the user: "kis room mein kaun sa teacher rahega, ek room mein 1 ya 2 teacher"): the first row of each room says its teachers;
 * Add teacher (or the pencil) picks one or two of the school's teachers (read only then; a teacher on duty in another room is greyed out) and Save
 * duty sends them; none picked takes them off. The teachers hear it and see it on their home.
 */
export function ExamRoomsPanel({ exam }: { exam: ExamDetail }) {
  const readOnly = useReadOnlyYear();
  const toast = useToast();
  const res = useGetExamRoomsQuery(exam.id);
  const data = res.currentData?.data;
  const [editing, setEditing] = useState<{ room: ExamRoom | null } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [asking, setAsking] = useState<ExamRoom | null>(null);
  // The room whose duty is being written (the row that shows it), the teachers picked, and what the server said.
  const [duty, setDuty] = useState<{ rowId: string; room: string } | null>(null);
  const [dutyDraft, setDutyDraft] = useState<string[]>([]);
  const [dutyFailed, setDutyFailed] = useState<string | null>(null);
  const structure = useGetStructureQuery(undefined, { skip: editing === null });
  const teachers = useGetExamDutyTeachersQuery(exam.id, { skip: duty === null });
  const [add, adding] = useAddExamRoomMutation();
  const [change, changing] = useUpdateExamRoomMutation();
  const [remove, removing] = useDeleteExamRoomMutation();
  const [saveDutyOf, savingDuty] = useSaveExamDutyMutation();
  const classes = classesOfExam(exam);
  const sectionsOf = (classId: string) => structure.data?.data.classes.find((c) => c.id === classId)?.sections ?? [];

  /** Where a new run of this class (or section) starts: after the last run of it. */
  const nextRun = (classId: string, sectionId: string) => {
    const top = Math.max(0, ...(data?.items ?? []).filter((r) => r.classId === classId && (r.sectionId ?? "") === sectionId).map((r) => r.toRoll));
    const from = Math.min(top + 1, MAX_ROLL);
    return { fromRoll: String(from), toRoll: String(Math.min(from + ROOM_SIZE - 1, MAX_ROLL)) };
  };

  function open(room: ExamRoom | null) {
    const classId = room?.classId ?? data?.left[0]?.classId ?? classes[0]?.id ?? "";
    const sectionId = room ? (room.sectionId ?? "") : (data?.left[0]?.classId === classId ? (data.left[0].sectionId ?? "") : "");
    setEditing({ room });
    setDraft(room ? { room: room.room, classId, sectionId, fromRoll: String(room.fromRoll), toRoll: String(room.toRoll) } : { room: "", classId, sectionId, ...nextRun(classId, sectionId) });
    setTried(false);
    setFailed(null);
  }
  const close = () => {
    setEditing(null);
    setDraft(null);
  };

  const sections = draft ? sectionsOf(draft.classId) : [];
  const from = Number(draft?.fromRoll);
  const to = Number(draft?.toRoll);
  const problems = draft
    ? {
        room: draft.room.trim() === "" ? "Enter the room" : undefined,
        section: sections.length > 0 && draft.sectionId === "" ? "Choose the section" : undefined,
        rolls:
          !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1 || from > MAX_ROLL || to > MAX_ROLL
            ? `A roll number is 1 to ${MAX_ROLL}`
            : to < from
              ? "The last roll number cannot be before the first"
              : undefined,
      }
    : {};
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);

  function chooseClass(classId: string) {
    if (!draft) return;
    const first = sectionsOf(classId)[0]?.id ?? "";
    setDraft({ ...draft, classId, sectionId: first, ...(editing?.room ? {} : nextRun(classId, first)) });
  }
  function chooseSection(sectionId: string) {
    if (!draft) return;
    setDraft({ ...draft, sectionId, ...(editing?.room ? {} : nextRun(draft.classId, sectionId)) });
  }

  async function save() {
    if (!editing || !draft) return;
    setTried(true);
    setFailed(null);
    if (Object.values(problems).some(Boolean)) return;
    const body = { room: draft.room.trim(), classId: draft.classId, sectionId: draft.sectionId || null, fromRoll: from, toRoll: to };
    try {
      if (editing.room) await change({ examId: exam.id, roomId: editing.room.id, ...body }).unwrap();
      else await add({ examId: exam.id, ...body }).unwrap();
      toast.push("success", `${body.room} is saved.`);
      close();
    } catch (err) {
      const e = getApiError(err);
      const detail = Array.isArray(e?.details) ? (e.details as { message?: string }[]).find((d) => typeof d?.message === "string")?.message : undefined;
      setFailed(detail ?? e?.message ?? "Could not save the room. Please try again.");
    }
  }

  function openDuty(rowId: string, room: string, current: string[]) {
    setDuty({ rowId, room });
    setDutyDraft(current);
    setDutyFailed(null);
  }

  async function saveDuty() {
    if (!duty) return;
    setDutyFailed(null);
    try {
      await saveDutyOf({ examId: exam.id, room: duty.room, teacherIds: dutyDraft }).unwrap();
      toast.push("success", `Duty in ${duty.room} is saved.`);
      setDuty(null);
    } catch (err) {
      const e = getApiError(err);
      const detail = Array.isArray(e?.details) ? (e.details as { message?: string }[]).find((d) => typeof d?.message === "string")?.message : undefined;
      setDutyFailed(detail ?? e?.message ?? "Could not save the duty. Please try again.");
    }
  }

  async function takeAway() {
    if (!asking) return;
    try {
      await remove({ examId: exam.id, roomId: asking.id }).unwrap();
      toast.push("success", `${asking.room} is taken away.`);
    } catch (err) {
      toast.push("error", getApiError(err)?.message ?? "Could not take it away. Please try again.");
    }
    setAsking(null);
  }

  if (res.isFetching && !data) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data) return <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the rooms."}</Card>;

  const busy = adding.isLoading || changing.isLoading;
  /** How many children the run being written holds: the roll numbers of its class or section between from and to ("–" until it is a run). */
  const liveCount = (() => {
    if (!draft || problems.rolls || (sections.length > 0 && draft.sectionId === "")) return null;
    const numbers = data.rolls?.find((r) => r.classId === draft.classId && (r.sectionId ?? "") === draft.sectionId)?.numbers;
    return numbers ? numbers.filter((n) => n >= from && n <= to).length : null;
  })();

  // Each room's teachers show on its first row (the runs of one room follow each other); a run being changed hands that to the next one.
  const dutyOf = new Map((data.duties ?? []).map((d) => [roomKeyOf(d.room), d]));
  const leads = new Set<string>();
  const seen = new Set<string>();
  for (const r of data.items) {
    if (editing?.room?.id === r.id || seen.has(roomKeyOf(r.room))) continue;
    seen.add(roomKeyOf(r.room));
    leads.add(r.id);
  }
  const anyEditor = editing !== null || duty !== null;

  /** The teachers to pick from: the school's (read when the duty is opened), each on duty in another room greyed out and saying the room. */
  const dutyChoices = (room: string) => {
    const elsewhere = new Map((data.duties ?? []).filter((d) => roomKeyOf(d.room) !== roomKeyOf(room)).flatMap((d) => d.teachers.map((t) => [t.id, d.room] as const)));
    const list = teachers.data?.data.items ?? dutyOf.get(roomKeyOf(room))?.teachers ?? [];
    return {
      options: list.map((t) => ({ value: t.id, label: elsewhere.has(t.id) ? `${t.name} · ${elsewhere.get(t.id)}` : t.name })),
      // Two picked: no third.
      disabled: list.filter((t) => elsewhere.has(t.id) || (dutyDraft.length >= MAX_DUTY && !dutyDraft.includes(t.id))).map((t) => t.id),
    };
  };

  const dutyCell = (r: ExamRoom) => {
    const current = dutyOf.get(roomKeyOf(r.room))?.teachers ?? [];
    if (duty?.rowId === r.id) {
      const choices = dutyChoices(r.room);
      return (
        <td className="px-3 py-2.5">
          <MultiSelect
            id={`duty-${r.id}`}
            aria-label={`Teachers on duty in ${r.room}`}
            placeholder={teachers.isFetching && !teachers.data ? "Loading…" : "Pick 1 or 2 teachers"}
            value={dutyDraft}
            options={choices.options}
            disabledValues={choices.disabled}
            onChange={setDutyDraft}
          />
          {dutyFailed && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger">
              {dutyFailed}
            </p>
          )}
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" aria-label="Save duty" onClick={() => void saveDuty()} disabled={savingDuty.isLoading}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDuty(null)} disabled={savingDuty.isLoading}>
              Cancel
            </Button>
          </div>
        </td>
      );
    }
    return (
      <td className="px-4 py-3">
        {current.length > 0 ? (
          <span className="flex items-start justify-between gap-2">
            <span className="space-y-0.5">
              {current.map((t) => (
                <span key={t.id} className="flex items-center gap-1.5 font-semibold text-foreground">
                  <UserRound className="size-3.5 shrink-0 text-foreground-muted" aria-hidden />
                  {t.name}
                </span>
              ))}
            </span>
            {!readOnly && (
              <Button variant="ghost" size="sm" aria-label={`Change duty in ${r.room}`} onClick={() => openDuty(r.id, r.room, current.map((t) => t.id))} disabled={anyEditor}>
                <Pencil className="size-4" aria-hidden />
              </Button>
            )}
          </span>
        ) : readOnly ? (
          <span className="text-foreground-muted">–</span>
        ) : (
          <button
            type="button"
            aria-label={`Add teacher to ${r.room}`}
            onClick={() => openDuty(r.id, r.room, [])}
            disabled={anyEditor}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-3 text-xs font-semibold text-primary-deep transition-colors hover:bg-primary-soft/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus className="size-3.5" aria-hidden />
            Add teacher
          </button>
        )}
      </td>
    );
  };

  const editorRow = (key: string) =>
    draft && (
      <tr key={key} className="bg-primary-soft/30 align-top">
        <td className="px-4 py-2.5">
          <Input aria-label="Room" placeholder="Room 101" maxLength={40} value={draft.room} aria-invalid={shown("room") ? true : undefined} onChange={(e) => setDraft({ ...draft, room: e.target.value })} />
          {shown("room") && <p className="mt-1 text-xs font-medium text-danger">{shown("room")}</p>}
          {failed && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger">
              {failed}
            </p>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex gap-2">
            <Select id={`room-class-${key}`} aria-label="Class" value={draft.classId} options={classes.map((c) => ({ value: c.id, label: c.name }))} onChange={chooseClass} />
            {sections.length > 0 && (
              <Select id={`room-section-${key}`} aria-label="Section" placeholder="Section" value={draft.sectionId} invalid={!!shown("section")} options={sections.map((s) => ({ value: s.id, label: s.name }))} onChange={chooseSection} className="w-32 shrink-0" />
            )}
          </div>
          {shown("section") && <p className="mt-1 text-xs font-medium text-danger">{shown("section")}</p>}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Input type="number" aria-label="From roll" min={1} max={MAX_ROLL} value={draft.fromRoll} aria-invalid={shown("rolls") ? true : undefined} onChange={(e) => setDraft({ ...draft, fromRoll: e.target.value })} className="w-24" />
            <span className="text-foreground-muted">to</span>
            <Input type="number" aria-label="To roll" min={1} max={MAX_ROLL} value={draft.toRoll} aria-invalid={shown("rolls") ? true : undefined} onChange={(e) => setDraft({ ...draft, toRoll: e.target.value })} className="w-24" />
          </div>
          {shown("rolls") && <p className="mt-1 text-xs font-medium text-danger">{shown("rolls")}</p>}
        </td>
        <td className="px-4 py-3">
          <output aria-label="Children in this run" className={liveCount === null ? "text-foreground-muted" : "font-semibold text-foreground"}>
            {liveCount === null ? "–" : liveCount}
          </output>
        </td>
        <td className="px-4 py-3 text-foreground-muted">–</td>
        <td className="px-3 py-2.5">
          <div className="flex justify-end gap-1.5">
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );

  return (
    <div className="space-y-4">
      {data.left.length > 0 && (
        <Card role="region" aria-label="Not in a room yet" className="flex flex-wrap items-center gap-2 border-warning-line bg-warning-soft/60 px-5 py-3 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <span className="font-semibold text-foreground">Not in a room yet:</span>
          {data.left.map((l) => (
            <span key={`${l.classId}:${l.sectionId ?? ""}`} className="rounded-lg bg-surface px-2.5 py-1 font-semibold text-foreground ring-1 ring-inset ring-border">
              {placeName(l.className, l.sectionName)}
              {l.withoutRoom > 0 && <span className="font-normal text-foreground-muted">{` · ${l.withoutRoom} ${l.withoutRoom === 1 ? "child" : "children"}`}</span>}
              {l.withoutRoll > 0 && <span className="font-normal text-foreground-muted">{` · ${l.withoutRoll} without a roll number`}</span>}
            </span>
          ))}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <DoorOpen className="size-4 text-foreground-muted" aria-hidden />
            {`${new Set(data.items.map((r) => r.room.toLowerCase())).size} ${new Set(data.items.map((r) => r.room.toLowerCase())).size === 1 ? "room" : "rooms"}`}
            <span className="font-normal text-foreground-muted">{`· ${data.items.reduce((n, r) => n + r.students, 0)} children seated`}</span>
          </p>
          {!readOnly && (
            <Button size="sm" onClick={() => open(null)} disabled={anyEditor}>
              <Plus className="size-4" aria-hidden />
              Add room
            </Button>
          )}
        </div>
        {data.items.length === 0 && !editing ? (
          <p className="px-5 py-12 text-center text-sm font-semibold text-foreground-muted">No rooms yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Rooms" className="w-full min-w-[64rem] text-left text-sm">
              <colgroup>
                <col className="w-48" />
                <col className="w-72" />
                <col className="w-60" />
                <col className="w-24" />
                <col className="w-72" />
                <col className="w-36" />
              </colgroup>
              <thead className="bg-surface-muted/50">
                <tr className="text-xs font-bold uppercase tracking-wide text-foreground-muted">
                  <th scope="col" className="px-4 py-3">Room</th>
                  <th scope="col" className="px-4 py-3">Class</th>
                  <th scope="col" className="px-4 py-3">Roll numbers</th>
                  <th scope="col" className="px-4 py-3">Children</th>
                  <th scope="col" className="px-4 py-3">On duty</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Change</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {editing && editing.room === null && editorRow("new")}
                {data.items.map((r) =>
                  editing?.room?.id === r.id ? (
                    editorRow(r.id)
                  ) : (
                    <tr key={r.id} className="align-top transition-colors hover:bg-surface-muted/40">
                      <td className="px-4 py-3 font-bold text-foreground">{leads.has(r.id) ? r.room : ""}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{placeName(r.className, r.sectionName)}</td>
                      <td className="px-4 py-3 text-foreground">{r.fromRoll === r.toRoll ? `${r.fromRoll}` : `${r.fromRoll} to ${r.toRoll}`}</td>
                      <td className="px-4 py-3 text-foreground">{r.students}</td>
                      {leads.has(r.id) ? dutyCell(r) : <td className="px-4 py-3" />}
                      <td className="px-3 py-2">
                        {!readOnly && (
                          <span className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" aria-label={`Change ${r.room}, ${placeName(r.className, r.sectionName)}`} onClick={() => open(r)} disabled={anyEditor}>
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button variant="ghost" size="sm" aria-label={`Take ${r.room}, ${placeName(r.className, r.sectionName)} away`} className="hover:text-danger" onClick={() => setAsking(r)} disabled={duty !== null}>
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {asking && (
        <AppModal
          title={`Take ${asking.room} away?`}
          icon={Trash2}
          tone="danger"
          size="sm"
          busy={removing.isLoading}
          onClose={() => setAsking(null)}
          footer={
            <>
              <HeroButton variant="secondary" onPress={() => setAsking(null)} isDisabled={removing.isLoading}>
                Cancel
              </HeroButton>
              <HeroButton variant="danger" isPending={removing.isLoading} onPress={() => void takeAway()}>
                Take away
              </HeroButton>
            </>
          }
        >
          <p className="text-sm text-foreground">{`${placeName(asking.className, asking.sectionName)} roll ${asking.fromRoll} to ${asking.toRoll} will have no room.`}</p>
        </AppModal>
      )}
    </div>
  );
}
