import type { CustomFieldDef } from "../constants/studentFields";
import { formatDay } from "./academicYear";
import { readOwnAnswer } from "./teacherImport";

/**
 * The school's own fields on the teacher forms (Add teacher, Change teacher) and the teacher's page: the answers as the boxes hold them
 * (always text: a yes / no is "yes" or "no", a number and a day are typed), what is wrong with them in the server's words, and what is
 * sent. The fields a school does not ask (Not asked) are not shown at all.
 */
export type OwnValues = Record<string, string>;

/** The fields the forms and the page show: the ones the school asks. */
export const askedFields = (fields: readonly CustomFieldDef[] | undefined): CustomFieldDef[] => (fields ?? []).filter((f) => f.mode !== "hidden");

/** A needed field must be answered (a yes / no is a tick: never needed). */
const isNeeded = (f: CustomFieldDef) => f.mode === "required" && f.type !== "yesNo";

/** The boxes of a teacher who has answers (or none): every asked field has one, empty when there is no answer. */
export function ownValuesOf(fields: readonly CustomFieldDef[], custom: Readonly<Record<string, string | number | boolean>> | undefined): OwnValues {
  const values: OwnValues = {};
  for (const f of fields) {
    const answer = custom?.[f.key];
    values[f.key] = answer === undefined ? "" : f.type === "yesNo" ? (answer ? "yes" : "no") : String(answer);
  }
  return values;
}

/** What is wrong with each box, by field key: a needed one left empty, or an answer that does not fit its kind. */
export function ownProblems(fields: readonly CustomFieldDef[], values: OwnValues): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const f of fields) {
    const raw = (values[f.key] ?? "").trim();
    if (raw === "") {
      if (isNeeded(f)) problems[f.key] = `${f.type === "choice" || f.type === "date" ? "Choose" : "Enter"} the ${f.label}`;
      continue;
    }
    const answer = readOwnAnswer(f, raw);
    if (answer && "problem" in answer) problems[f.key] = answer.problem;
  }
  return problems;
}

/**
 * What is sent: an answer given, as its kind; when the teacher is changed (`change`) an empty box is `null` (it clears the answer), when
 * a teacher is added it is left out.
 */
export function ownAnswersOf(fields: readonly CustomFieldDef[], values: OwnValues, kind: "add" | "change"): Record<string, string | number | boolean | null> {
  const answers: Record<string, string | number | boolean | null> = {};
  for (const f of fields) {
    const answer = readOwnAnswer(f, values[f.key] ?? "");
    if (answer && "value" in answer) answers[f.key] = answer.value;
    else if (!answer && kind === "change") answers[f.key] = null;
  }
  return answers;
}

/** An answer as the teacher's page shows it: a day as it is written here, a yes / no as Yes or No; null when there is none. */
export function ownAnswerText(f: CustomFieldDef, answer: string | number | boolean | undefined): string | null {
  if (answer === undefined || answer === null || answer === "") return null;
  if (f.type === "yesNo") return answer ? "Yes" : "No";
  if (f.type === "date") return formatDay(String(answer));
  return String(answer);
}

/** What the server refused about the school's own fields (`details` paths like `custom.c_pan00001`), by field key. */
export function refusedOwn(details: unknown): Record<string, string> {
  const found: Record<string, string> = {};
  if (!Array.isArray(details)) return found;
  for (const row of details as { path?: unknown; message?: unknown }[]) {
    if (typeof row.path === "string" && row.path.startsWith("custom.") && typeof row.message === "string" && found[row.path.slice(7)] === undefined) found[row.path.slice(7)] = row.message;
  }
  return found;
}

/** The id of a field's box on the teacher forms (the page puts the cursor in it). */
export const ownFieldId = (key: string) => `teacher-own-${key}`;
