import { createApi } from "@reduxjs/toolkit/query/react";
import type {
  ApiResponse,
  DateRange,
  MyDay,
  StaffSheet,
  StaffSheetQuery,
  StudentRange,
  StudentsDay,
  StudentsDayQuery,
  StudentsToday,
  TeacherDayInput,
  TeacherMonth,
  TeacherRecord,
  TeacherSheet,
  TeacherSheetQuery,
} from "../../types";

/** Only the parts of a sheet's question that are set go in the address (no empty class, department or search). */
const setOnly = (params: Record<string, string | undefined>) => Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * Attendance for the people who run the school (2026-11-06): the students of any class and the teachers for any days (read here; the
 * students' attendance is TAKEN in `classroomApi` by the class teacher), and a teacher's own mark. These sheets are read fresh every time the
 * page opens: what the class teachers and the teachers themselves do all day must not be served from a copy.
 */
export const attendanceApi = createApi({
  reducerPath: "attendanceApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["StudentAttendance", "TeacherAttendance", "MyAttendance", "StaffAttendance", "MyStaffAttendance"],
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getStudentsAttendance: build.query<ApiResponse<StudentRange>, DateRange & { classId: string; sectionId: string }>({
      query: ({ classId, sectionId, from, to }) => ({ url: "/attendance/students", params: { classId, sectionId, from, to } }),
      providesTags: ["StudentAttendance"],
    }),
    // A class (its teachers) and a search narrow it on the server (2026-11-22).
    getTeachersAttendance: build.query<ApiResponse<TeacherSheet>, TeacherSheetQuery>({
      query: ({ from, to, classId, search }) => ({ url: "/attendance/teachers", params: setOnly({ from, to, classId, search }) }),
      providesTags: ["TeacherAttendance"],
    }),
    // ---- The staff's attendance (2026-11-22), kept like the teachers' ----------------------------------------------------------------------
    /** Every staff member who does not teach (or one department's), with a search, for the days asked. */
    getStaffAttendance: build.query<ApiResponse<StaffSheet>, StaffSheetQuery>({
      query: ({ from, to, role, search }) => ({ url: "/attendance/staff", params: setOnly({ from, to, role, search }) }),
      providesTags: ["StaffAttendance"],
    }),
    /** The signed-in staff member's own day (today). Only they mark it: the school reads the sheet and never marks a staff day. */
    getMyStaffDay: build.query<ApiResponse<MyDay>, void>({
      query: () => "/attendance/staff/me",
      providesTags: ["MyStaffAttendance"],
    }),
    /** The signed-in staff member marks themselves present now. */
    markMeStaffPresent: build.mutation<ApiResponse<MyDay>, void>({
      query: () => ({ url: "/attendance/staff/me/present", method: "POST" }),
      invalidatesTags: ["MyStaffAttendance"],
    }),
    /** The signed-in staff member's own month (this month, or "2026-10"). */
    getMyStaffMonth: build.query<ApiResponse<TeacherMonth>, string | void>({
      query: (month) => ({ url: "/attendance/staff/me/month", params: month ? { month } : {} }),
      providesTags: ["MyStaffAttendance"],
    }),
    /**
     * One day of every class (2026-11-22), each class with its children and their marks; a class (or a section) to see only it; `search` finds
     * children of every class on the server. Only what is set goes in the address.
     */
    getStudentsDay: build.query<ApiResponse<StudentsDay>, StudentsDayQuery>({
      query: ({ date, classId, sectionId, search }) => ({
        url: "/attendance/students/day",
        params: { date, ...(classId ? { classId } : {}), ...(classId && sectionId ? { sectionId } : {}), ...(search ? { search } : {}) },
      }),
      providesTags: ["StudentAttendance"],
    }),
    /** The classes that have not taken today's attendance. */
    getStudentsToday: build.query<ApiResponse<StudentsToday>, void>({
      query: () => "/attendance/students/today",
      providesTags: ["StudentAttendance"],
    }),
    /** The signed-in teacher's own month (this month, or "2026-10"). */
    getMyMonth: build.query<ApiResponse<TeacherMonth>, string | void>({
      query: (month) => ({ url: "/attendance/teachers/me/month", params: month ? { month } : {} }),
      providesTags: ["MyAttendance"],
    }),
    /** The school marks or corrects a teacher's day. */
    setTeacherDay: build.mutation<ApiResponse<TeacherRecord>, TeacherDayInput>({
      query: ({ teacherId, ...body }) => ({ url: `/attendance/teachers/${teacherId}/day`, method: "PUT", body }),
      invalidatesTags: ["TeacherAttendance"],
    }),
    /** The signed-in teacher's own day (today). */
    getMyAttendance: build.query<ApiResponse<MyDay>, void>({
      query: () => "/attendance/teachers/me",
      providesTags: ["MyAttendance"],
    }),
    /** The signed-in teacher marks themselves present now. */
    markMePresent: build.mutation<ApiResponse<MyDay>, void>({
      query: () => ({ url: "/attendance/teachers/me/present", method: "POST" }),
      invalidatesTags: ["MyAttendance"],
    }),
  }),
});

export const {
  useGetStudentsAttendanceQuery,
  useGetTeachersAttendanceQuery,
  useGetStaffAttendanceQuery,
  useGetMyStaffDayQuery,
  useMarkMeStaffPresentMutation,
  useGetMyStaffMonthQuery,
  useGetStudentsDayQuery,
  useGetStudentsTodayQuery,
  useGetMyMonthQuery,
  useSetTeacherDayMutation,
  useGetMyAttendanceQuery,
  useMarkMePresentMutation,
} = attendanceApi;
