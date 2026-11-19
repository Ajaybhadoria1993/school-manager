import { useState } from "react";
import { MAX_SECTION_CAPACITY } from "../constants/academics";
import { divisionPlan } from "../utils/academics";

const asNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : NaN);
/** The seats each new section starts with: what it needs, rounded up to a multiple of 5 so there is a little room. */
const roundUp5 = (n: number) => Math.ceil(n / 5) * 5;

/**
 * The boxes of "divide this class into sections": how many sections, the seats of each and (when the school asks for rooms) a room for
 * each, with what is wrong with them. `newcomer` is true when one more student is being admitted at the same time (a full class): that
 * student needs a seat in the section that gets them, so the least seats are one more. The seats start at what is needed rounded up to a
 * multiple of 5, until the person types their own.
 */
export function useDivideForm({
  enrolled,
  newcomer,
  needsRooms,
}: {
  /** The students sitting in the class itself now. */
  enrolled: number;
  newcomer: boolean;
  needsRooms: boolean;
}) {
  const [count, setCountState] = useState(2);
  const [typed, setTyped] = useState<string | null>(null);
  const [rooms, setRooms] = useState<string[]>([]);

  const plan = divisionPlan(enrolled, count, newcomer);
  const letters = Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
  const eachText = typed ?? String(Math.min(MAX_SECTION_CAPACITY, roundUp5(plan.minSeats)));
  const each = asNumber(eachText);

  const eachProblem = Number.isNaN(each)
    ? "Enter the seats as a number."
    : each < plan.minSeats
      ? newcomer
        ? `At least ${plan.minSeats} seats each: ${letters[plan.newcomerIn]} gets the new student and has ${plan.sizes[plan.newcomerIn]} students already.`
        : `At least ${plan.minSeats} seats each: the biggest section has ${plan.minSeats} students.`
      : each > MAX_SECTION_CAPACITY
        ? `At most ${MAX_SECTION_CAPACITY} seats in a section.`
        : null;
  const roomMissing = needsRooms && letters.some((_, i) => !(rooms[i] ?? "").trim());

  return {
    count,
    /** Changing the number of sections starts the seats again from what is needed (unless the person typed their own). */
    setCount: (n: number) => {
      setCountState(n);
      setTyped(null);
    },
    letters,
    plan,
    eachText,
    each,
    setEach: setTyped,
    rooms,
    setRoom: (i: number, value: string) =>
      setRooms((current) => {
        const next = [...current];
        next[i] = value;
        return next;
      }),
    needsRooms,
    eachProblem,
    roomMissing,
    /** What is wrong, as one sentence, or null when it can be sent. */
    problem: eachProblem ?? (roomMissing ? "Enter the room of every section." : null),
    /** The request: how many, the seats of each and the rooms (when asked for). */
    request: () => ({ count, capacity: each, ...(needsRooms ? { rooms: letters.map((_, i) => (rooms[i] ?? "").trim()) } : {}) }),
  };
}

export type DivideForm = ReturnType<typeof useDivideForm>;
