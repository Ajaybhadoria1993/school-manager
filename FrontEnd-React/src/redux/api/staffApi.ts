import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, StaffMember, StaffMemberInput, StaffMemberList, StaffMemberQuery } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The school's staff: the people who work for it without teaching, each added with a username and a password the school makes
 * (`/staff/members`). One read for the list (with the count of each status), one for a person; every change marks the list stale so
 * the page on screen reads it again.
 */
export const staffApi = createApi({
  reducerPath: "staffApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["StaffMember"],
  refetchOnMountOrArgChange: 60,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getStaffMembers: build.query<ApiResponse<StaffMemberList>, StaffMemberQuery>({
      query: (params) => ({ url: "/staff/members", params }),
      providesTags: ["StaffMember"],
    }),
    getStaffMember: build.query<ApiResponse<StaffMember>, string>({
      query: (id) => `/staff/members/${id}`,
      providesTags: ["StaffMember"],
    }),
    /** Adds the person; with `giveLogin` their email becomes their login and the invitation is emailed. */
    createStaffMember: build.mutation<ApiResponse<StaffMember>, StaffMemberInput>({
      query: (body) => ({ url: "/staff/members", method: "POST", body }),
      invalidatesTags: ["StaffMember"],
    }),
    updateStaffMember: build.mutation<ApiResponse<StaffMember>, { id: string } & Partial<Omit<StaffMemberInput, "giveLogin">> & { isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/staff/members/${id}`, method: "PATCH", body }),
      invalidatesTags: ["StaffMember"],
    }),
    /** Give login access (as for a teacher): a login with an invitation, the invitation again, or a link to choose a new password. */
    giveStaffLogin: build.mutation<ApiResponse<StaffMember>, { id: string; email?: string }>({
      query: ({ id, ...body }) => ({ url: `/staff/members/${id}/login`, method: "POST", body }),
      invalidatesTags: ["StaffMember"],
    }),
    /** Takes away a person who has no login yet (one with a login is made inactive instead). */
    removeStaffMember: build.mutation<ApiResponse<Record<string, never>>, string>({
      query: (id) => ({ url: `/staff/members/${id}`, method: "DELETE" }),
      invalidatesTags: ["StaffMember"],
    }),
  }),
});

export const {
  useGetStaffMembersQuery,
  useGetStaffMemberQuery,
  useCreateStaffMemberMutation,
  useUpdateStaffMemberMutation,
  useGiveStaffLoginMutation,
  useRemoveStaffMemberMutation,
} = staffApi;
