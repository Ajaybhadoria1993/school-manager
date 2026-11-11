import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, SchoolDashboard, SchoolTrend } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The home pages' numbers, each in ONE request (2026-11-09). The school's page is about today (who came, what waits), so it is read again
 * every time the page opens instead of being served from a copy.
 */
export const dashboardApi = createApi({
  reducerPath: "dashboardApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Dashboard"],
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    // The days the head picked: one request answers the figures, the cards and today's hours.
    getSchoolDashboard: build.query<ApiResponse<SchoolDashboard>, { from: string; to: string }>({
      query: (days) => ({ url: "/dashboard/school", params: days }),
      providesTags: ["Dashboard"],
    }),
    // The chart's own week or month (its choice is separate from the days above).
    getSchoolTrend: build.query<ApiResponse<SchoolTrend>, "week" | "month">({
      query: (period) => ({ url: "/dashboard/school/trend", params: { period } }),
      providesTags: ["Dashboard"],
    }),
  }),
});

export const { useGetSchoolDashboardQuery, useGetSchoolTrendQuery } = dashboardApi;
