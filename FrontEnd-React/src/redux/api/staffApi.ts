import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, StaffInviteDelivery, StaffMember, StaffMemberInput, StaffMemberList, StaffMemberQuery } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The school's staff: the people who work for it without teaching, invited by email with a role (`/staff/members`). One read for the
 * list (with the count of each status), one for a person; every change marks the list stale so the page on screen reads it again.
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
    /** Adds the person and sends the invitation email. */
    createStaffMember: build.mutation<ApiResponse<StaffMember & StaffInviteDelivery>, StaffMemberInput>({
      query: (body) => ({ url: "/staff/members", method: "POST", body }),
      invalidatesTags: ["StaffMember"],
    }),
    updateStaffMember: build.mutation<ApiResponse<StaffMember>, { id: string } & Partial<Omit<StaffMemberInput, "email">> & { isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/staff/members/${id}`, method: "PATCH", body }),
      invalidatesTags: ["StaffMember"],
    }),
    resendStaffInvite: build.mutation<ApiResponse<StaffMember & StaffInviteDelivery>, string>({
      query: (id) => ({ url: `/staff/members/${id}/resend-invite`, method: "POST" }),
      invalidatesTags: ["StaffMember"],
    }),
    cancelStaffInvite: build.mutation<ApiResponse<Record<string, never>>, string>({
      query: (id) => ({ url: `/staff/members/${id}`, method: "DELETE" }),
      invalidatesTags: ["StaffMember"],
    }),
  }),
});

export const { useGetStaffMembersQuery, useGetStaffMemberQuery, useCreateStaffMemberMutation, useUpdateStaffMemberMutation, useResendStaffInviteMutation, useCancelStaffInviteMutation } = staffApi;
