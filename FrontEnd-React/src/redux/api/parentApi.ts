import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, ChildAttendance, ChildDetail, ChildDiary, ChildExams, ChildTests, ChildTimetable, Leave, LeaveInput, MyChildren } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * What a signed-in parent reads and sends (2026-11-04): their children (the home page), one child's record and its published week, and
 * the child's leave (send, see, take back). The server answers only for the parent's own children.
 */
export const parentApi = createApi({
  reducerPath: "parentApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Children", "Child", "ChildLeaves", "ChildAttendance", "ChildDiary", "ChildTests", "ChildExams"],
  refetchOnMountOrArgChange: 60,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getMyChildren: build.query<ApiResponse<MyChildren>, void>({
      query: () => "/parent/children",
      providesTags: ["Children"],
    }),
    getMyChild: build.query<ApiResponse<ChildDetail>, string>({
      query: (id) => `/parent/children/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Child", id }],
    }),
    getMyChildTimetable: build.query<ApiResponse<ChildTimetable | null>, string>({
      query: (id) => `/parent/children/${id}/timetable`,
      providesTags: (_result, _error, id) => [{ type: "Child", id }],
    }),
    getChildAttendance: build.query<ApiResponse<ChildAttendance>, { id: string; month?: string }>({
      query: ({ id, month }) => ({ url: `/parent/children/${id}/attendance`, params: month ? { month } : {} }),
      // Each part of the child has its own tag, so a notification refreshes only that part (hooks/useLiveNotifications.ts).
      providesTags: (_result, _error, { id }) => [{ type: "ChildAttendance", id }],
    }),
    getChildDiary: build.query<ApiResponse<ChildDiary>, { id: string; date?: string }>({
      query: ({ id, date }) => ({ url: `/parent/children/${id}/diary`, params: date ? { date } : {} }),
      providesTags: (_result, _error, { id }) => [{ type: "ChildDiary", id }],
    }),
    getChildTests: build.query<ApiResponse<ChildTests>, string>({
      query: (id) => `/parent/children/${id}/tests`,
      providesTags: (_result, _error, id) => [{ type: "ChildTests", id }],
    }),
    getChildExams: build.query<ApiResponse<ChildExams>, string>({
      query: (id) => `/parent/children/${id}/exams`,
      providesTags: (_result, _error, id) => [{ type: "ChildExams", id }],
    }),
    getChildLeaves: build.query<ApiResponse<{ items: Leave[] }>, string>({
      query: (id) => `/parent/children/${id}/leaves`,
      providesTags: (_result, _error, id) => [{ type: "ChildLeaves", id }],
    }),
    applyLeave: build.mutation<ApiResponse<Leave>, { id: string } & LeaveInput>({
      query: ({ id, ...body }) => ({ url: `/parent/children/${id}/leaves`, method: "POST", body }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "ChildLeaves", id }],
    }),
    cancelLeave: build.mutation<ApiResponse<Leave>, { id: string; leaveId: string }>({
      query: ({ id, leaveId }) => ({ url: `/parent/children/${id}/leaves/${leaveId}/cancel`, method: "POST" }),
      invalidatesTags: (_result, _error, { id }) => [{ type: "ChildLeaves", id }],
    }),
  }),
});

export const {
  useGetMyChildrenQuery,
  useGetMyChildQuery,
  useGetMyChildTimetableQuery,
  useGetChildAttendanceQuery,
  useGetChildDiaryQuery,
  useGetChildTestsQuery,
  useGetChildExamsQuery,
  useGetChildLeavesQuery,
  useApplyLeaveMutation,
  useCancelLeaveMutation,
} = parentApi;
