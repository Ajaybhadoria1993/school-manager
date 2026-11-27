import type { TeacherLogin } from "../../types";
import { loginStatusText } from "../../utils/loginAccess";
import { Badge } from "../ui/Badge";

/**
 * A teacher's or a staff member's login in one pill (2026-11-26): No login, Pending (the invitation was emailed and not opened yet: they
 * cannot sign in until they choose a password), Active, or Closed (they have left / are inactive).
 */
export function LoginStatusBadge({ login, long = false }: { login: TeacherLogin | null; /** "Login pending": out of a Login column (under a name). */ long?: boolean }) {
  const text = loginStatusText(login);
  const tone = text === "Active" ? "success" : text === "Pending" ? "info" : text === "Closed" ? "warning" : undefined;
  return (
    <Badge tone={tone} className="whitespace-nowrap">
      {long && login ? `Login ${text.toLowerCase()}` : text}
    </Badge>
  );
}
