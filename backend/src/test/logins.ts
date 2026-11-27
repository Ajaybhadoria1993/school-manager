import request from "supertest";
import app from "../app";

/**
 * Logins of teachers and staff in tests (2026-11-26: a login is the person's email, given with an invitation; they choose the password from
 * the link). The tests that only need "a teacher who can sign in" keep their old shorthand `login: { username, password }`: it becomes the
 * real flow here, with the email `<username>@mail.test` (unless the body has an email), and the invitation accepted with that password. They
 * sign in with that email (`emailOf`).
 */
export const emailOf = (username: string) => `${username}@mail.test`;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The raw token of an invitation link the API gave (`devInviteLink`: no email service in tests). */
export function tokenOfLink(link: string | undefined): string {
  if (!link) throw new Error("No invitation link in the answer (is an email service configured in the tests?)");
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error(`No token in ${link}`);
  return token;
}

/** Opens the invitation and chooses the password; the answer is the session (or the refusal). */
export function acceptLoginInvite(link: string | undefined, password: string) {
  return request(app).post("/api/v1/auth/login-invite/accept").send({ token: tokenOfLink(link), password });
}

// Any body the API takes, with the old login shorthand allowed.
type Shorthand = object;

/** The body as the API takes it now, and the password to choose once it is made. */
function expand(body: Shorthand): { body: Record<string, unknown>; password: string | null } {
  const { login, ...rest } = body as { login?: { username: string; password: string } } & Record<string, unknown>;
  if (!login) return { body: rest, password: null };
  return { body: { ...rest, email: rest.email ?? emailOf(login.username), giveLogin: true }, password: login.password };
}

async function make(path: string, token: string, shorthand: Shorthand) {
  const { body, password } = expand(shorthand);
  const res = await request(app).post(path).set(as(token)).send(body);
  if (password && res.status === 201) {
    const accepted = await acceptLoginInvite(res.body.data.invite?.devInviteLink, password);
    if (accepted.status !== 200) throw new Error(`The invitation was not accepted: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  }
  return res;
}

/** `POST /staff/teachers`, with the old login shorthand turned into the invitation, accepted. */
export const postTeacher = (token: string, body: Shorthand) => make("/api/v1/staff/teachers", token, body);

/** `POST /staff/members`, the same. */
export const postStaff = (token: string, body: Shorthand) => make("/api/v1/staff/members", token, body);

/** Give login access to a teacher or a staff member who has none, and open the invitation with this password. */
export async function giveLoginAndAccept(token: string, path: string, password: string, email?: string) {
  const res = await request(app).post(`${path}/login`).set(as(token)).send(email ? { email } : {});
  if (res.status !== 200) throw new Error(`Give login access was refused: ${res.status} ${JSON.stringify(res.body)}`);
  const accepted = await acceptLoginInvite(res.body.data.invite?.devInviteLink, password);
  if (accepted.status !== 200) throw new Error(`The invitation was not accepted: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  return res;
}
