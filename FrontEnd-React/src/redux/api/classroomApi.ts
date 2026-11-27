import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, AttendanceSheet, AttendanceStatus, CalendarDays, CalendarEvent, CalendarEventInput, Chapter, ChapterSource, ClassTestDetail, ClassworkReminder, ClassTestItem, DateRange, DiaryDay, Leave, MarkStudentInput, MyClass, ProgressFilter, StudentRange, TeachingLog, TeachingProgress } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The daily flow of parents and teachers (docs/parent-teacher-flow.md): the school's calendar (holidays and events), and, as they are
 * built, leave, attendance, the diary, tests and marks. Each read has its own tag, so a change reads again only what it changed.
 */
export const classroomApi = createApi({
  reducerPath: "classroomApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Calendar", "Leaves", "MyClasses", "Attendance", "Diary", "Tests", "Progress", "Reminder"],
  refetchOnMountOrArgChange: 60,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getCalendar: build.query<ApiResponse<CalendarDays>, { from?: string; to?: string } | void>({
      query: (range) => ({ url: "/classroom/calendar", params: range ?? {} }),
      providesTags: ["Calendar"],
    }),
    createEvent: build.mutation<ApiResponse<CalendarEvent>, CalendarEventInput>({
      query: (body) => ({ url: "/classroom/calendar", method: "POST", body }),
      invalidatesTags: ["Calendar"],
    }),
    updateEvent: build.mutation<ApiResponse<CalendarEvent>, { id: string } & Partial<CalendarEventInput>>({
      query: ({ id, ...body }) => ({ url: `/classroom/calendar/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Calendar"],
    }),
    deleteEvent: build.mutation<ApiResponse<{ id: string }>, string>({
      query: (id) => ({ url: `/classroom/calendar/${id}`, method: "DELETE" }),
      invalidatesTags: ["Calendar"],
    }),
    // A standard festival holiday (its key is the id of the item): off the school's calendar (shown false), or back on it.
    setStandardHoliday: build.mutation<ApiResponse<{ key: string; title: string; shown: boolean }>, { key: string; shown: boolean }>({
      query: ({ key, shown }) => ({ url: `/classroom/calendar/standard/${key}`, method: "PUT", body: { shown } }),
      invalidatesTags: ["Calendar"],
    }),

    // ---- Leave (the school's side): a class teacher's classes', or every one for the people who run the school ----------------------
    getLeaves: build.query<ApiResponse<{ items: Leave[] }>, "pending" | "all">({
      query: (status) => ({ url: "/classroom/leaves", params: { status } }),
      providesTags: ["Leaves"],
    }),
    decideLeave: build.mutation<ApiResponse<Leave>, { id: string; status: "approved" | "declined"; note?: string | null }>({
      query: ({ id, ...body }) => ({ url: `/classroom/leaves/${id}/decide`, method: "POST", body }),
      invalidatesTags: ["Leaves", "Attendance"],
    }),

    // ---- A teacher's own classes, and a class's attendance -----------------------------------------------------------------------------
    getMyClasses: build.query<ApiResponse<{ items: MyClass[] }>, void>({
      query: () => "/classroom/my-classes",
      providesTags: ["MyClasses"],
    }),
    // `search` (the school's search box on Attendance > Student): the server lists only the children whose name, admission number or roll number holds it.
    getAttendance: build.query<ApiResponse<AttendanceSheet>, { classId: string; sectionId: string | null; date: string; search?: string }>({
      query: ({ classId, sectionId, date, search }) => ({ url: "/classroom/attendance", params: { classId, sectionId: sectionId ?? "none", date, ...(search ? { search } : {}) } }),
      providesTags: ["Attendance"],
      keepUnusedDataFor: 0,
    }),
    /**
     * One class's (or section's) register for the days asked (2026-11-17), in the class teacher's class page: the same sheet the school reads in
     * Attendance > Student, for the one class. It reads again after every mark and every saved sheet (the "Attendance" tag).
     */
    getRegister: build.query<ApiResponse<StudentRange>, { classId: string; sectionId: string | null } & DateRange>({
      query: ({ classId, sectionId, from, to }) => ({ url: "/classroom/attendance/register", params: { classId, sectionId: sectionId ?? "none", from, to } }),
      providesTags: ["Attendance"],
    }),
    /** The class teacher marks ONE child on ONE day (a cell of the register): Present or Absent. Nobody else is marked. */
    markStudentDay: build.mutation<ApiResponse<MarkStudentInput>, MarkStudentInput>({
      query: (body) => ({ url: "/classroom/attendance/student", method: "PUT", body }),
      invalidatesTags: ["Attendance"],
    }),
    saveAttendance: build.mutation<ApiResponse<AttendanceSheet>, { classId: string; sectionId: string | null; date: string; marks: { studentId: string; status: AttendanceStatus; reason?: string | null }[] }>({
      query: (body) => ({ url: "/classroom/attendance", method: "PUT", body }),
      invalidatesTags: ["Attendance"],
    }),

    // ---- The diary, and tests with their marks -----------------------------------------------------------------------------------------
    getDiary: build.query<ApiResponse<DiaryDay>, { classId: string; sectionId: string | null; date: string }>({
      query: ({ classId, sectionId, date }) => ({ url: "/classroom/diary", params: { classId, sectionId: sectionId ?? "none", date } }),
      providesTags: ["Diary"],
    }),
    saveDiary: build.mutation<
      ApiResponse<DiaryDay>,
      { classId: string; sectionId: string | null; date: string; subjectId: string; taught: string; homework: string; chapterId?: string | null; chapterDone?: boolean }
    >({
      query: (body) => ({ url: "/classroom/diary", method: "PUT", body }),
      invalidatesTags: ["Diary", "Progress"],
    }),
    // The chapters of one subject of a class, saved as one list (a chapter without an id is a new one).
    saveSyllabus: build.mutation<
      ApiResponse<{ chapters: Chapter[] }>,
      { classId: string; sectionId: string | null; subjectId: string; chapters: { id?: string; name: string; done: boolean; plannedOn: string | null }[] }
    >({
      query: (body) => ({ url: "/classroom/syllabus", method: "PUT", body }),
      invalidatesTags: ["Diary", "Progress"],
    }),
    // The lists a subject's chapters can be copied from, asked when wanted (never kept: another section may have changed).
    getChapterSources: build.query<ApiResponse<ChapterSource[]>, { classId: string; sectionId: string | null; subjectId: string }>({
      query: ({ classId, sectionId, subjectId }) => ({ url: "/classroom/syllabus/sources", params: { classId, sectionId: sectionId ?? "none", subjectId } }),
      keepUnusedDataFor: 0,
    }),
    // The school's daily diary reminder to teachers.
    getReminder: build.query<ApiResponse<ClassworkReminder>, void>({
      query: () => "/classroom/reminder",
      providesTags: ["Reminder"],
    }),
    saveReminder: build.mutation<ApiResponse<ClassworkReminder>, ClassworkReminder>({
      query: (body) => ({ url: "/classroom/reminder", method: "PUT", body }),
      invalidatesTags: ["Reminder"],
    }),
    // Teaching progress: each class's subjects, and the day by day list in pages.
    getTeachingProgress: build.query<ApiResponse<TeachingProgress>, ProgressFilter>({
      query: (params) => ({ url: "/classroom/progress", params }),
      providesTags: ["Progress"],
    }),
    getTeachingLog: build.query<ApiResponse<TeachingLog>, ProgressFilter & { page: number }>({
      query: (params) => ({ url: "/classroom/progress/log", params }),
      providesTags: ["Progress"],
    }),
    getTests: build.query<ApiResponse<{ label: string; items: ClassTestItem[] }>, { classId: string; sectionId: string | null }>({
      query: ({ classId, sectionId }) => ({ url: "/classroom/tests", params: { classId, sectionId: sectionId ?? "none" } }),
      providesTags: ["Tests"],
    }),
    addTest: build.mutation<ApiResponse<ClassTestItem>, { classId: string; sectionId: string | null; subjectId: string; date: string; topic: string; maxMarks: number }>({
      query: (body) => ({ url: "/classroom/tests", method: "POST", body }),
      invalidatesTags: ["Tests"],
    }),
    getTest: build.query<ApiResponse<ClassTestDetail>, string>({
      query: (id) => `/classroom/tests/${id}`,
      providesTags: ["Tests"],
      keepUnusedDataFor: 0,
    }),
    saveMarks: build.mutation<ApiResponse<ClassTestDetail>, { id: string; marks: { studentId: string; marks: number | null; absent: boolean }[] }>({
      query: ({ id, ...body }) => ({ url: `/classroom/tests/${id}/marks`, method: "PUT", body }),
      invalidatesTags: ["Tests"],
    }),
    removeTest: build.mutation<ApiResponse<{ id: string }>, string>({
      query: (id) => ({ url: `/classroom/tests/${id}`, method: "DELETE" }),
      invalidatesTags: ["Tests"],
    }),
  }),
});

export const {
  useGetCalendarQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
  useSetStandardHolidayMutation,
  useGetLeavesQuery,
  useDecideLeaveMutation,
  useGetMyClassesQuery,
  useGetAttendanceQuery,
  useGetRegisterQuery,
  useMarkStudentDayMutation,
  useSaveAttendanceMutation,
  useGetDiaryQuery,
  useSaveDiaryMutation,
  useSaveSyllabusMutation,
  useLazyGetChapterSourcesQuery,
  useGetReminderQuery,
  useSaveReminderMutation,
  useGetTeachingProgressQuery,
  useGetTeachingLogQuery,
  useGetTestsQuery,
  useAddTestMutation,
  useGetTestQuery,
  useSaveMarksMutation,
  useRemoveTestMutation,
} = classroomApi;
