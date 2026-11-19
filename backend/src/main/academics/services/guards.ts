import { ApiError } from "../../../utils/ApiError";

/** A class that is inactive is read, not changed: the school makes it active first (nothing is changed behind its back). */
export const classInactive = (name: string): ApiError =>
  ApiError.conflict(`${name} is inactive. Make it active first to change it.`, "CLASS_INACTIVE");

/** A department that is inactive takes no class, and is not renamed, until it is active again. */
export const departmentInactive = (name: string): ApiError =>
  ApiError.conflict(`${name} is inactive. Make it active first.`, "DEPARTMENT_INACTIVE");

/** The same name in any case or spacing is the same class (or department): says which one holds it, and whether it is inactive. */
export function nameTaken(kind: "class" | "department", existing: { name: string; status?: string | null } | null, typed: string): ApiError {
  const name = existing?.name ?? typed;
  const code = kind === "class" ? "CLASS_EXISTS" : "DEPARTMENT_EXISTS";
  if (existing?.status === "inactive") {
    return ApiError.conflict(`You already have a ${kind} called "${name}", and it is inactive. Make it active again instead of adding it a second time.`, code);
  }
  return ApiError.conflict(`You already have a ${kind} called "${name}".`, code);
}
