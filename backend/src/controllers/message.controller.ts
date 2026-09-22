import { Request, Response } from "express";
import { z } from "zod";
import { Conversation, Message, SenderRole } from "../models/Message";
import { Student } from "../models/Student";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { assertStudentAccess } from "../utils/studentAccess";
import { assertConversationParticipant } from "../utils/conversationAccess";
import { emitToConversation } from "../realtime/socket";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

async function assertParticipant(req: Request, conversation: InstanceType<typeof Conversation>) {
  await assertConversationParticipant(req.user!.userId, req.user!.role, conversation);
}

const startSchema = z.object({
  studentId: z.string(),
  teacherStaffId: z.string(),
  subject: z.string().min(1),
});

// FR-7.2: a parent starts a conversation with a teacher, scoped to one child.
export const startConversation = asyncHandler(async (req: Request, res: Response) => {
  const payload = startSchema.parse(req.body);
  if (req.user?.role === "parent") {
    await assertStudentAccess(req, payload.studentId);
  }

  const user = await User.findById(req.user?.userId);
  const guardianId =
    req.user?.role === "parent" ? user?.guardianProfileId : req.body.guardianId;
  if (!guardianId) throw ApiError.badRequest("guardianId is required");

  const student = await Student.findById(payload.studentId);
  if (!student) throw ApiError.notFound("Student not found");

  const conversation = await Conversation.findOneAndUpdate(
    { studentId: payload.studentId, teacherStaffId: payload.teacherStaffId, guardianId },
    {
      tenantId: student.tenantId,
      branchId: student.branchId,
      studentId: payload.studentId,
      teacherStaffId: payload.teacherStaffId,
      guardianId,
      subject: payload.subject,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ success: true, data: conversation });
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = { ...scopeFilter(req) };

  if (req.user?.role === "teacher") {
    const user = await User.findById(req.user.userId);
    if (!user?.staffProfileId) return res.json({ success: true, data: [] });
    filter.teacherStaffId = user.staffProfileId;
  } else if (req.user?.role === "parent") {
    const user = await User.findById(req.user.userId);
    if (!user?.guardianProfileId) return res.json({ success: true, data: [] });
    filter.guardianId = user.guardianProfileId;
  }

  const conversations = await Conversation.find(filter)
    .populate("studentId", "firstName lastName")
    .populate("teacherStaffId", "name")
    .populate("guardianId", "name")
    .sort({ lastMessageAt: -1 });
  res.json({ success: true, data: conversations });
});

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!conversation) throw ApiError.notFound("Conversation not found");
  await assertParticipant(req, conversation);

  const messages = await Message.find({ conversationId: conversation._id })
    .populate("senderUserId", "name role")
    .sort({ createdAt: 1 });
  res.json({ success: true, data: { conversation, messages } });
});

const sendSchema = z.object({ body: z.string().min(1) });

// FR-7.2 acceptance criteria: timestamped, non-deletable (no delete route
// exists anywhere in this file).
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const payload = sendSchema.parse(req.body);
  const conversation = await Conversation.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!conversation) throw ApiError.notFound("Conversation not found");
  await assertParticipant(req, conversation);

  if (!req.user) throw ApiError.unauthorized();
  const message = await Message.create({
    conversationId: conversation._id,
    senderUserId: req.user.userId,
    senderRole: req.user.role as SenderRole,
    body: payload.body,
  });

  conversation.lastMessageAt = new Date();
  await conversation.save();

  const populated = await message.populate("senderUserId", "name role");
  emitToConversation(conversation._id.toString(), "message:new", {
    conversationId: conversation._id.toString(),
    message: populated,
  });

  res.status(201).json({ success: true, data: message });
});
