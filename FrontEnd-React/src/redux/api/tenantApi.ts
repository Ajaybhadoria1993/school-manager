import { createApi } from "@reduxjs/toolkit/query/react";
import type {
  ApiResponse,
  InviteDelivery,
  InviteResult,
  InviteSchoolInput,
  SchoolOverview,
  SchoolReview,
  StatusCounts,
  TenantDecision,
  TenantListItem,
} from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/** What each decision sends. An empty note is left out, as the API expects. */
function decisionBody(decision: TenantDecision, text: string) {
  switch (decision) {
    case "approve":
    case "reactivate":
      return text ? { note: text } : {};
    case "reject":
    case "suspend":
      return { reason: text };
  }
}

export const tenantApi = createApi({
  reducerPath: "tenantApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Tenants", "Counts", "Overview", "Review"],
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getTenants: build.query<ApiResponse<TenantListItem[]>, void>({
      query: () => "/tenants",
      providesTags: ["Tenants"],
    }),

    /** Stage totals; the sidebar badge ("waiting for approval") reads `pending` from here. */
    getTenantCounts: build.query<ApiResponse<StatusCounts>, void>({
      query: () => "/tenants/counts",
      providesTags: ["Counts"],
    }),

    getTenantOverview: build.query<ApiResponse<SchoolOverview>, void>({
      query: () => "/tenants/overview",
      providesTags: ["Overview"],
    }),

    getSchoolReview: build.query<ApiResponse<SchoolReview>, string>({
      query: (id) => `/tenants/${id}/review`,
      providesTags: (_result, _error, id) => [{ type: "Review", id }],
    }),

    inviteSchool: build.mutation<ApiResponse<InviteResult>, InviteSchoolInput>({
      query: (body) => ({ url: "/tenants/invite", method: "POST", body }),
      invalidatesTags: ["Tenants", "Counts", "Overview"],
    }),

    resendInvite: build.mutation<ApiResponse<InviteDelivery>, string>({
      query: (id) => ({ url: `/tenants/${id}/resend-invite`, method: "POST" }),
      invalidatesTags: ["Tenants", "Counts", "Overview"],
    }),

    decideTenant: build.mutation<ApiResponse<unknown>, { id: string; decision: TenantDecision; text: string }>({
      query: ({ id, decision, text }) => ({
        url: `/tenants/${id}/${decision}`,
        method: "POST",
        body: decisionBody(decision, text),
      }),
      invalidatesTags: (_result, _error, { id }) => ["Tenants", "Counts", "Overview", { type: "Review", id }],
    }),
  }),
});

export const {
  useGetTenantsQuery,
  useGetTenantCountsQuery,
  useGetTenantOverviewQuery,
  useGetSchoolReviewQuery,
  useInviteSchoolMutation,
  useResendInviteMutation,
  useDecideTenantMutation,
} = tenantApi;
