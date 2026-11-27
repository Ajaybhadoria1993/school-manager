import type { LoginAction, TeacherLogin } from "../types";

/**
 * A teacher's or a staff member's login (2026-11-26): their email, Pending until they open the emailed invitation and choose a password.
 * The words the list, the person's page and the Give login access dialog share.
 */

/** What the login button does, by the login the person has now: none (give it), Pending (the invitation again), or one that works (a password link). */
export const loginActionOf = (login: TeacherLogin | null): LoginAction => (!login ? "give" : login.pending ? "resend" : "reset");

/** The button's words for each action. */
export const LOGIN_ACTION_LABELS: Record<LoginAction, string> = {
  give: "Give login access",
  resend: "Resend invitation",
  reset: "Send password link",
};

/** The words for a login's state: No login, Pending, Active, or Closed (they have left / are inactive). */
export const loginStatusText = (login: TeacherLogin | null): string => (!login ? "No login" : !login.isActive ? "Closed" : login.pending ? "Pending" : "Active");
