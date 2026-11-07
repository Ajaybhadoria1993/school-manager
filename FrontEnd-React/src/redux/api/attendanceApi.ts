import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, DateRange, MyDay, StudentRange, StudentsToday, TeacherDayInput, TeacherMonth, TeacherRecord, TeacherSheet } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * Attendance for the people who run the school (2026-11-06): the students of any class and the teachers for any days (read here; the
 * students' attendance is TAKEN in `classroomApi` by the class teacher), and a teacher's own mark. These sheets are read fresh every time the
 * page opens: what the class teachers and the teachers themselves do all day must not be served from a copy.
 */
export const attendanceApi = createApi({
  reducerPath: "attendanceApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["StudentAttendance", "TeacherAttendance", "MyAttendance"],
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getStudentsAttendance: build.query<ApiResponse<StudentRange>, DateRange & { classId: string; sectionId: string }>({
      query: ({ classId, sectionId, from, to }) => ({ url: "/attendance/students", params: { classId, sectionId, from, to } }),
      providesTags: ["StudentAttendance"],
    }),
    getTeachersAttendance: build.query<ApiResponse<TeacherSheet>, DateRange>({
      query: ({ from, to }) => ({ url: "/attendance/teachers", params: { from, to } }),
      providesTags: ["TeacherAttendance"],
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
  useGetStudentsTodayQuery,
  useGetMyMonthQuery,
  useSetTeacherDayMutation,
  useGetMyAttendanceQuery,
  useMarkMePresentMutation,
} = attendanceApi;
