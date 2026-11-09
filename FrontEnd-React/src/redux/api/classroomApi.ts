import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, AttendanceSheet, AttendanceStatus, CalendarDays, CalendarEvent, CalendarEventInput, ClassTestDetail, ClassTestItem, DiaryDay, Leave, MyClass } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The daily flow of parents and teachers (docs/parent-teacher-flow.md): the school's calendar (holidays and events), and, as they are
 * built, leave, attendance, the diary, tests and marks. Each read has its own tag, so a change reads again only what it changed.
 */
export const classroomApi = createApi({
  reducerPath: "classroomApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Calendar", "Leaves", "MyClasses", "Attendance", "Diary", "Tests"],
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
    getAttendance: build.query<ApiResponse<AttendanceSheet>, { classId: string; sectionId: string | null; date: string }>({
      query: ({ classId, sectionId, date }) => ({ url: "/classroom/attendance", params: { classId, sectionId: sectionId ?? "none", date } }),
      providesTags: ["Attendance"],
      keepUnusedDataFor: 0,
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
    saveDiary: build.mutation<ApiResponse<DiaryDay>, { classId: string; sectionId: string | null; date: string; subjectId: string; taught: string; homework: string }>({
      query: (body) => ({ url: "/classroom/diary", method: "PUT", body }),
      invalidatesTags: ["Diary"],
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
  useSaveAttendanceMutation,
  useGetDiaryQuery,
  useSaveDiaryMutation,
  useGetTestsQuery,
  useAddTestMutation,
  useGetTestQuery,
  useSaveMarksMutation,
  useRemoveTestMutation,
} = classroomApi;
