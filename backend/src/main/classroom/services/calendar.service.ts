import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { Notify } from "../../notifications/services/events";
import { CalendarEvent, type CalendarKind, type ICalendarEvent } from "../models/CalendarEvent";
import { HiddenHoliday } from "../models/HiddenHoliday";
import { standardHolidayByKey, standardHolidaysBetween, type StandardHoliday } from "../data/standardHolidays";
import type { CalendarQuery, CreateEventInput, UpdateEventInput } from "../schemas/classroom.schemas";

/** Who put it on the calendar: the school, or the standard list (national: stays; festival: the school may take it off). */
export type CalendarSource = "school" | "national" | "festival";

export interface CalendarEventDto {
  /** The school's own: a record id. A standard holiday: its key ("2026-11-08-diwali"). */
  id: string;
  title: string;
  kind: CalendarKind;
  startDate: string;
  endDate: string;
  note: string | null;
  source: CalendarSource;
}

export const toDay = (d: Date) => d.toISOString().slice(0, 10);
export const fromDay = (day: string) => new Date(`${day}T00:00:00.000Z`);

const toDto = (e: ICalendarEvent): CalendarEventDto => ({ id: e._id.toString(), title: e.title, kind: e.kind, startDate: toDay(e.startDate), endDate: toDay(e.endDate), note: e.note ?? null, source: "school" });
const standardDto = (h: StandardHoliday): CalendarEventDto => ({ id: h.key, title: h.title, kind: "holiday", startDate: h.day, endDate: h.day, note: null, source: h.source });
const NOT_FOUND = () => ApiError.notFound("This day is not on the calendar any more", "EVENT_NOT_FOUND");
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The standard holidays can be switched off as a whole (STANDARD_HOLIDAYS=off). Tests run with them off so that a test taking
 * attendance "today" does not depend on today being Diwali; the tests of the standard holidays switch them on. Never set in production.
 */
const standardIsOn = () => process.env.STANDARD_HOLIDAYS !== "off";

/** The school's holidays and events (docs/parent-teacher-flow.md, phase 1), on top of the standard holidays every calendar starts with. */
export class CalendarService {
  /**
   * In date order; with `from` / `to`, the ones that touch those days. With both days given the standard holidays come too (`items`
   * has the ones on the school's calendar, `hidden` the ones the school took off in those days); a holiday the school put on with
   * the same name on that day takes the standard one's place.
   */
  static async list(tenantId: string, query: CalendarQuery): Promise<{ items: CalendarEventDto[]; hidden: CalendarEventDto[] }> {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (query.to) filter.startDate = { $lte: fromDay(query.to) };
    if (query.from) filter.endDate = { $gte: fromDay(query.from) };
    const events = (await CalendarEvent.find(filter).sort({ startDate: 1, title: 1 }).lean()).map(toDto);
    if (!query.from || !query.to) return { items: events, hidden: [] };

    const { shown, hidden } = await CalendarService.standardBetween(tenantId, query.from, query.to);
    const mine = events.filter((e) => e.kind === "holiday");
    const stand = shown.filter((h) => !mine.some((e) => sameName(e.title, h.title) && e.startDate <= h.day && e.endDate >= h.day));
    const items = [...events, ...stand.map(standardDto)].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
    return { items, hidden: hidden.map(standardDto) };
  }

  /** The standard holidays in these days that are on the school's calendar, and the ones it took off. */
  private static async standardBetween(tenantId: string | Types.ObjectId, from: string, to: string): Promise<{ shown: StandardHoliday[]; hidden: StandardHoliday[] }> {
    const all = standardIsOn() ? standardHolidaysBetween(from, to) : [];
    if (all.length === 0) return { shown: [], hidden: [] };
    const off = await HiddenHoliday.find({ tenantId: new Types.ObjectId(String(tenantId)), day: { $gte: fromDay(from), $lte: fromDay(to) } }).lean();
    const keys = new Set(off.map((h) => h.key));
    return { shown: all.filter((h) => !keys.has(h.key)), hidden: all.filter((h) => keys.has(h.key)) };
  }

  /**
   * The school takes a standard festival holiday off its calendar (`shown` false) or brings it back. A national day stays; taking
   * off what is already off (or bringing back what is on) changes nothing and tells nobody. Everyone of the school hears of a change.
   */
  static async setStandardShown(tenantId: string, key: string, shown: boolean, actorId: string | null = null): Promise<{ key: string; title: string; shown: boolean }> {
    const holiday = standardHolidayByKey(key);
    if (!holiday) throw ApiError.notFound("This holiday is not on the standard list", "HOLIDAY_NOT_FOUND");
    if (holiday.source === "national") throw ApiError.conflict(`${holiday.title} is a national holiday: it stays on every school's calendar.`, "HOLIDAY_LOCKED");
    const school = new Types.ObjectId(tenantId);
    const changed = shown
      ? (await HiddenHoliday.deleteOne({ tenantId: school, key })).deletedCount > 0
      : (await HiddenHoliday.updateOne({ tenantId: school, key }, { $setOnInsert: { day: fromDay(holiday.day) } }, { upsert: true })).upsertedCount > 0;
    if (changed && actorId) Notify.calendar(tenantId, actorId, shown ? "added" : "removed", standardDto(holiday));
    return { key, title: holiday.title, shown };
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

  /** The holidays touching these days, the school's own first and then the standard ones it has not taken off (attendance is not taken on them). */
  static async holidaysBetween(tenantId: string | Types.ObjectId, from: string, to: string): Promise<{ startDate: string; endDate: string; title: string }[]> {
    const events = await CalendarEvent.find({ tenantId: new Types.ObjectId(String(tenantId)), kind: "holiday", startDate: { $lte: fromDay(to) }, endDate: { $gte: fromDay(from) } }).lean();
    const { shown } = await CalendarService.standardBetween(tenantId, from, to);
    return [...events.map((e) => ({ startDate: toDay(e.startDate), endDate: toDay(e.endDate), title: e.title })), ...shown.map((h) => ({ startDate: h.day, endDate: h.day, title: h.title }))];
  }
}
