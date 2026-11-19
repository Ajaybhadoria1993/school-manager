import { createApi } from "@reduxjs/toolkit/query/react";
import type { AdmitCard, ApiResponse, ChildAttendance, ChildBus, IdCard, ReportCard, ChildDetail, ChildDiary, ChildExams, ChildFees, ChildTests, ChildTimetable, Leave, LeaveInput, MyChildren } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * What a signed-in parent reads and sends (2026-11-04): their children (the home page), one child's record and its published week, and
 * the child's leave (send, see, take back). The server answers only for the parent's own children.
 */
export const parentApi = createApi({
  reducerPath: "parentApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Children", "Child", "ChildLeaves", "ChildAttendance", "ChildDiary", "ChildTests", "ChildExams", "ChildBus", "ChildFees"],
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
    // Where the bus is changes every few seconds, so the screen asks again on its own (`pollingInterval` where it is used); the fee chart changes rarely.
    getChildBus: build.query<ApiResponse<ChildBus>, string>({
      query: (id) => `/parent/children/${id}/bus`,
      providesTags: (_result, _error, id) => [{ type: "ChildBus", id }],
    }),
    getChildFees: build.query<ApiResponse<ChildFees>, string>({
      query: (id) => `/parent/children/${id}/fees`,
      providesTags: (_result, _error, id) => [{ type: "ChildFees", id }],
    }),
    // The child's own ID card and exam report card, to read and print (2026-11-19).
    getChildIdCard: build.query<ApiResponse<IdCard>, string>({ query: (id) => `/parent/children/${id}/id-card`, providesTags: (_r, _e, id) => [{ type: "Child", id }] }),
    getChildReportCard: build.query<ApiResponse<ReportCard>, { id: string; examId: string }>({
      query: ({ id, examId }) => ({ url: `/parent/children/${id}/report-card`, params: { examId } }),
      providesTags: (_r, _e, { id }) => [{ type: "ChildExams", id }],
    }),
    getChildAdmitCard: build.query<ApiResponse<AdmitCard>, { id: string; examId: string }>({
      query: ({ id, examId }) => ({ url: `/parent/children/${id}/admit-card`, params: { examId } }),
      providesTags: (_r, _e, { id }) => [{ type: "ChildExams", id }],
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
  useGetChildBusQuery,
  useGetChildFeesQuery,
  useGetChildIdCardQuery,
  useGetChildReportCardQuery,
  useGetChildAdmitCardQuery,
  useGetChildLeavesQuery,
  useApplyLeaveMutation,
  useCancelLeaveMutation,
} = parentApi;
