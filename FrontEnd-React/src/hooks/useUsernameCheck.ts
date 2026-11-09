import { useEffect, useRef } from "react";
import { useCheckUsernameQuery } from "../redux/api/timetableApi";
import { isUsername } from "../utils/validators";
import { useDebouncedValue } from "./useDebouncedValue";

/** Where the username in the box stands: not asked (empty, not a username, or the server could not say), being asked, free or taken. */
export type UsernameStatus = { state: "idle" | "checking" | "free" } | { state: "taken"; suggestions: string[] };

/**
 * Asks the server whether the username in the box is free (on the whole platform: the login box has no school), once the typing has
 * paused, and only for a username that could be one. `enabled`: the Login step is on the screen. Adding the teacher is the last word:
 * a username taken a moment after it was checked is refused then, with the same kind of suggestions.
 */
export function useUsernameCheck(username: string, enabled: boolean): UsernameStatus {
  const wanted = username.trim().toLowerCase();
  const settled = useDebouncedValue(wanted, 400);
  const asks = enabled && isUsername(wanted);
  const res = useCheckUsernameQuery(settled, { skip: !asks || settled !== wanted });
  if (!asks) return { state: "idle" };
  if (settled !== wanted || res.isUninitialized || res.isFetching) return { state: "checking" };
  const answer = res.currentData?.data;
  if (!answer) return { state: "idle" };
  return answer.available ? { state: "free" } : { state: "taken", suggestions: answer.suggestions };
}

/**
 * A username the screen made (from the name, with a number) is never one somebody already has, in any school (2026-11-04, the user): when
 * the check says it is taken, the first free one the server offers takes its place at once. One the person typed is left as typed (the
 * box says it is taken, with free ones to click).
 */
export function useFreeUsername(check: UsernameStatus, typed: boolean, apply: (username: string) => void): void {
  const first = check.state === "taken" ? check.suggestions[0] : undefined;
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (typed || !first || applied.current === first) return;
    applied.current = first;
    apply(first);
  });
}
