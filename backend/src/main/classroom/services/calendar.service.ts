import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { Notify } from "../../notifications/services/events";
import { CalendarEvent, type CalendarKind, type ICalendarEvent } from "../models/CalendarEvent";
import type { CalendarQuery, CreateEventInput, UpdateEventInput } from "../schemas/classroom.schemas";

export interface CalendarEventDto {
  id: string;
  title: string;
  kind: CalendarKind;
  startDate: string;
  endDate: string;
  note: string | null;
}

export const toDay = (d: Date) => d.toISOString().slice(0, 10);
export const fromDay = (day: string) => new Date(`${day}T00:00:00.000Z`);

const toDto = (e: ICalendarEvent): CalendarEventDto => ({ id: e._id.toString(), title: e.title, kind: e.kind, startDate: toDay(e.startDate), endDate: toDay(e.endDate), note: e.note ?? null });
const NOT_FOUND = () => ApiError.notFound("This day is not on the calendar any more", "EVENT_NOT_FOUND");

/** The school's holidays and events (docs/parent-teacher-flow.md, phase 1). */
export class CalendarService {
  /** In date order; with `from` / `to`, the ones that touch those days. */
  static async list(tenantId: string, query: CalendarQuery): Promise<{ items: CalendarEventDto[] }> {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (query.to) filter.startDate = { $lte: fromDay(query.to) };
    if (query.from) filter.endDate = { $gte: fromDay(query.from) };
    const events = await CalendarEvent.find(filter).sort({ startDate: 1, title: 1 }).lean();
    return { items: events.map(toDto) };
  }

  /** Everyone of the school hears of it (but `actorId`, who put it there). */
  static async create(tenantId: string, input: CreateEventInput, actorId: string | null = null): Promise<CalendarEventDto> {
    const made = await CalendarEvent.create({
      tenantId: new Types.ObjectId(tenantId),
      title: input.title,
      kind: input.kind,
      startDate: fromDay(input.startDate),
      endDate: fromDay(input.endDate ?? input.startDate),
      note: input.note ?? null,
    });
    const dto = toDto(made.toObject());
    if (actorId) Notify.calendar(tenantId, actorId, "added", dto);
    return dto;
  }

  static async update(tenantId: string, id: string, input: UpdateEventInput, actorId: string | null = null): Promise<CalendarEventDto> {
    const school = new Types.ObjectId(tenantId);
    const current = await CalendarEvent.findOne({ _id: id, tenantId: school }).lean();
    if (!current) throw NOT_FOUND();
    const start = input.startDate ?? toDay(current.startDate);
    const end = input.endDate ?? (input.startDate && input.startDate > toDay(current.endDate) ? input.startDate : toDay(current.endDate));
    if (end < start) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "endDate", message: "The last day cannot be before the first day" }]);
    const set: Record<string, unknown> = { startDate: fromDay(start), endDate: fromDay(end) };
    if (input.title !== undefined) set.title = input.title;
    if (input.kind !== undefined) set.kind = input.kind;
    if (input.note !== undefined) set.note = input.note;
    const updated = await CalendarEvent.findOneAndUpdate({ _id: id, tenantId: school }, { $set: set }, { new: true }).lean();
    if (!updated) throw NOT_FOUND();
    const dto = toDto(updated);
    if (actorId) Notify.calendar(tenantId, actorId, "changed", dto);
    return dto;
  }

  static async remove(tenantId: string, id: string, actorId: string | null = null): Promise<void> {
    const gone = await CalendarEvent.findOneAndDelete({ _id: id, tenantId: new Types.ObjectId(tenantId) }).lean();
    if (!gone) throw NOT_FOUND();
    if (actorId) Notify.calendar(tenantId, actorId, "removed", toDto(gone));
  }

  /** The holidays touching these days (attendance is not taken on them). */
  static async holidaysBetween(tenantId: string | Types.ObjectId, from: string, to: string): Promise<{ startDate: string; endDate: string; title: string }[]> {
    const events = await CalendarEvent.find({ tenantId: new Types.ObjectId(String(tenantId)), kind: "holiday", startDate: { $lte: fromDay(to) }, endDate: { $gte: fromDay(from) } }).lean();
    return events.map((e) => ({ startDate: toDay(e.startDate), endDate: toDay(e.endDate), title: e.title }));
  }
}
