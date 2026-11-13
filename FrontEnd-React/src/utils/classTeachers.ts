import type { GridView } from "../types";

export interface ClassTeacherLine {
  id: string;
  name: string;
  /** The subjects of the class this teacher teaches, in the order of the class's list. */
  subjects: string[];
  /** The class teacher of this class. */
  head: boolean;
}

export interface ClassTeachers {
  /** The class teacher first, then the others by name. */
  teachers: ClassTeacherLine[];
  /** Subjects of the class that nobody teaches yet. */
  withoutTeacher: string[];
}

/**
 * Who teaches what in one class, read from its week (`GET /timetable/grid`): each teacher with the subjects the class's list gives them (and
 * those a lesson names them for on purpose, a cover), the class teacher marked, and the subjects that have nobody yet. Assign class shows it
 * beside the form so the person sees the class's teachers before giving it one more.
 */
export function teachersOfClass(grid: GridView): ClassTeachers {
  const names = new Map(grid.teachers.map((t) => [t.id, t.name]));
  const subjectsOf = new Map<string, string[]>();
  const add = (teacherId: string, subject: string) => {
    const list = subjectsOf.get(teacherId) ?? [];
    if (!list.includes(subject)) subjectsOf.set(teacherId, [...list, subject]);
  };
  const withoutTeacher: string[] = [];
  for (const a of grid.allotments) {
    if (a.teacherId) add(a.teacherId, a.subjectName);
    else withoutTeacher.push(a.subjectName);
  }
  for (const cell of grid.cells) {
    for (const lesson of cell.lessons) {
      if (!lesson.teacherId) continue;
      const subject = grid.allotments.find((a) => a.subjectId === lesson.subjectId)?.subjectName;
      if (subject) add(lesson.teacherId, subject);
    }
  }
  const head = grid.classTeacher ?? null;
  if (head && !subjectsOf.has(head.id)) subjectsOf.set(head.id, []);
  const teachers = [...subjectsOf].map(([id, subjects]) => ({ id, name: names.get(id) ?? (head?.id === id ? head.name : "A teacher"), subjects, head: head?.id === id }));
  teachers.sort((a, b) => Number(b.head) - Number(a.head) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return { teachers, withoutTeacher };
}
