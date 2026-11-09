import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, LoginAccount, StaffMember, StaffMemberInput, StaffMemberList, StaffMemberQuery } from "../../types";
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
    /** Adds the person and makes their login (the username and the password in `login`). */
    createStaffMember: build.mutation<ApiResponse<StaffMember>, StaffMemberInput>({
      query: (body) => ({ url: "/staff/members", method: "POST", body }),
      invalidatesTags: ["StaffMember"],
    }),
    updateStaffMember: build.mutation<ApiResponse<StaffMember>, { id: string } & Partial<Omit<StaffMemberInput, "login">> & { isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/staff/members/${id}`, method: "PATCH", body }),
      invalidatesTags: ["StaffMember"],
    }),
    /** A login for a person added before the school made logins itself. */
    makeStaffLogin: build.mutation<ApiResponse<StaffMember>, { id: string } & LoginAccount>({
      query: ({ id, ...body }) => ({ url: `/staff/members/${id}/login`, method: "POST", body }),
      invalidatesTags: ["StaffMember"],
    }),
    /** A new password the school made: the old one stops and their sessions end. */
    resetStaffPassword: build.mutation<ApiResponse<Record<string, never>>, { id: string; password: string }>({
      query: ({ id, ...body }) => ({ url: `/staff/members/${id}/reset-password`, method: "POST", body }),
    }),
    changeStaffUsername: build.mutation<ApiResponse<StaffMember>, { id: string; username: string }>({
      query: ({ id, ...body }) => ({ url: `/staff/members/${id}/login`, method: "PATCH", body }),
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
  useMakeStaffLoginMutation,
  useResetStaffPasswordMutation,
  useChangeStaffUsernameMutation,
  useRemoveStaffMemberMutation,
} = staffApi;
