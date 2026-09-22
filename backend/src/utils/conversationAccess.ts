import { Conversation } from "../models/Message";
import { User } from "../models/User";
import { ApiError } from "./ApiError";

const OVERSIGHT_ROLES = new Set(["school_admin", "principal", "super_admin"]);

/**
 * Shared by the REST message routes and the realtime socket layer, so a
 * conversation's access rule only lives in one place. Teacher/parent must
 * be the actual participant; School Admin/Principal get audit access (FR-7.2).
 */
export async function assertConversationParticipant(
  userId: string,
  role: string,
  conversation: InstanceType<typeof Conversation>
): Promise<void> {
  if (OVERSIGHT_ROLES.has(role)) return;
  const user = await User.findById(userId);

  if (role === "teacher") {
    if (user?.staffProfileId?.toString() === conversation.teacherStaffId.toString()) return;
    throw ApiError.forbidden();
  }
  if (role === "parent") {
    if (user?.guardianProfileId?.toString() === conversation.guardianId.toString()) return;
    throw ApiError.forbidden();
  }
  throw ApiError.forbidden();
}
