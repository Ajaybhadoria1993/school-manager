import { UserRound } from "lucide-react";
import { staffRoleLabel } from "../../constants/staffMembers";
import { useAuth } from "../../hooks/useAuth";
import { Block, Row } from "../teachers/DetailBlocks";
import { WelcomeHeader } from "./school/WelcomeHeader";

/**
 * The home of a staff member who works for the school without teaching (a receptionist, the management): a greeting and who they are
 * signed in as. What more they can open is what their role is given in the menu (the calendar for now): each module of the school lists
 * the roles that may use it, so a role gets its pages as its modules are built.
 */
export function StaffHome() {
  const { user, tenant } = useAuth();
  if (!user) return null;
  return (
    <div className="space-y-6">
      <WelcomeHeader firstName={user.name.split(" ")[0]} schoolName={tenant?.name ?? "your school"} shortcuts={false} />
      <Block icon={UserRound} tone="primary" title="About you">
        <Row label="Name">{user.name}</Row>
        <Row label="Role">{staffRoleLabel(user.role)}</Row>
        <Row label="Email">{user.email ?? ""}</Row>
        <Row label="School">{tenant?.name ?? ""}</Row>
      </Block>
    </div>
  );
}
