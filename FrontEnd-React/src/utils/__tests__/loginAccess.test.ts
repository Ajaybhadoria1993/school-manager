import { describe, expect, it } from "vitest";
import { LOGIN_ACTION_LABELS, loginActionOf, loginStatusText } from "../loginAccess";

const login = (over: Partial<{ username: string | null; email: string | null; isActive: boolean; pending: boolean }> = {}) => ({ username: null, email: "meena@school.example", isActive: true, pending: false, ...over });

describe("a teacher's or a staff member's login (2026-11-26)", () => {
  it("is No login, Pending (the invitation not opened), Active, or Closed (they have left)", () => {
    expect(loginStatusText(null)).toBe("No login");
    expect(loginStatusText(login({ pending: true }))).toBe("Pending");
    expect(loginStatusText(login())).toBe("Active");
    expect(loginStatusText(login({ isActive: false }))).toBe("Closed");
    expect(loginStatusText(login({ isActive: false, pending: true }))).toBe("Closed");
  });

  it("has one button for each: Give login access, Resend invitation, Send password link (also for an older login with a username)", () => {
    expect(LOGIN_ACTION_LABELS[loginActionOf(null)]).toBe("Give login access");
    expect(LOGIN_ACTION_LABELS[loginActionOf(login({ pending: true }))]).toBe("Resend invitation");
    expect(LOGIN_ACTION_LABELS[loginActionOf(login())]).toBe("Send password link");
    expect(LOGIN_ACTION_LABELS[loginActionOf(login({ username: "meena.singh", email: null }))]).toBe("Send password link");
  });
});
