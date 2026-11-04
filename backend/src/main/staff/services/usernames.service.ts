import { randomInt } from "crypto";
import { User } from "../../users/models/User";

/** What Add teacher asks while a username is typed: is it free, and if not, which ones are. */
export interface UsernameCheck {
  available: boolean;
  suggestions: string[];
}

const SUGGESTIONS = 4;
const MAX_USERNAME = 30;

/**
 * Where the numbers come from: two digits first (meena.singh_41), then three, then four, each only when the shorter ones did not
 * give enough free names. `tries` is how many names are looked up at once.
 */
const RANGES = [
  { digits: 2, low: 10, high: 100, tries: 16 },
  { digits: 3, low: 100, high: 1000, tries: 24 },
  { digits: 4, low: 1000, high: 10000, tries: 24 },
] as const;

/** `meena.singh_30` and `meena.singh30` both come from `meena.singh`: a number at the end of a username is a suggestion, not part of the name. */
export const baseOf = (username: string): string => username.replace(/[._]?\d+$/, "") || username;

/** Names from `candidates` that nobody has (one look-up for all of them). */
async function freeOnes(candidates: string[]): Promise<string[]> {
  const taken = new Set((await User.find({ username: { $in: candidates } }).select("username").lean()).map((u) => u.username));
  return candidates.filter((c) => !taken.has(c));
}

/** A few free usernames like `wanted`: the name, an underscore and a number. */
export async function suggestUsernames(wanted: string, count = SUGGESTIONS): Promise<string[]> {
  const found: string[] = [];
  for (const { digits, low, high, tries } of RANGES) {
    const base = baseOf(wanted).slice(0, MAX_USERNAME - 1 - digits);
    const numbers = new Set<number>();
    while (numbers.size < Math.min(tries, high - low)) numbers.add(randomInt(low, high));
    const free = await freeOnes([...numbers].map((n) => `${base}_${n}`));
    found.push(...free.filter((name) => !found.includes(name)));
    if (found.length >= count) break;
  }
  return found.slice(0, count);
}

/** Free or taken, on the whole platform (the login box has no school). A taken one comes with free ones; a free one needs none. */
export async function checkUsername(username: string): Promise<UsernameCheck> {
  if (!(await User.exists({ username }))) return { available: true, suggestions: [] };
  return { available: false, suggestions: await suggestUsernames(username) };
}
