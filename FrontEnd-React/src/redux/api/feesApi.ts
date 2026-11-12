import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, Concession, ConcessionBody, FeeHead, FeeHeadBody, FeeLine, FeeLineBody, FeeLinePatch, FeeRules, FeeStatus, FeeStructure, SavedFeeRules } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The school's fees (2026-11-12): the fee heads, each class's fee chart for a session, the concessions and the fee rules. Every change marks
 * what is on screen as stale (one tag), so each page asks again once, only while it is open.
 */
export const feesApi = createApi({
  reducerPath: "feesApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Fees"],
  refetchOnMountOrArgChange: true,
  endpoints: (build) => ({
    getFeeHeads: build.query<ApiResponse<{ items: FeeHead[] }>, FeeStatus>({
      query: (status) => ({ url: "/fees/heads", params: { status } }),
      providesTags: ["Fees"],
    }),
    createFeeHead: build.mutation<ApiResponse<FeeHead>, FeeHeadBody>({ query: (body) => ({ url: "/fees/heads", method: "POST", body }), invalidatesTags: ["Fees"] }),
    createFeeHeads: build.mutation<ApiResponse<{ created: number; skipped: number; items: FeeHead[] }>, { heads: FeeHeadBody[] }>({
      query: (body) => ({ url: "/fees/heads/many", method: "POST", body }),
      invalidatesTags: ["Fees"],
    }),
    updateFeeHead: build.mutation<ApiResponse<FeeHead>, { id: string; body: Partial<FeeHeadBody> }>({
      query: ({ id, body }) => ({ url: `/fees/heads/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Fees"],
    }),
    deleteFeeHead: build.mutation<ApiResponse<null>, string>({ query: (id) => ({ url: `/fees/heads/${id}`, method: "DELETE" }), invalidatesTags: ["Fees"] }),

    getFeeStructure: build.query<ApiResponse<FeeStructure>, { yearId?: string }>({
      query: ({ yearId }) => ({ url: "/fees/structure", params: yearId ? { yearId } : undefined }),
      providesTags: ["Fees"],
    }),
    createFeeLines: build.mutation<ApiResponse<{ created: number }>, FeeLineBody>({ query: (body) => ({ url: "/fees/structure/lines", method: "POST", body }), invalidatesTags: ["Fees"] }),
    updateFeeLine: build.mutation<ApiResponse<FeeLine>, { id: string; body: FeeLinePatch }>({
      query: ({ id, body }) => ({ url: `/fees/structure/lines/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Fees"],
    }),
    deleteFeeLine: build.mutation<ApiResponse<null>, string>({ query: (id) => ({ url: `/fees/structure/lines/${id}`, method: "DELETE" }), invalidatesTags: ["Fees"] }),
    copyFeesToClasses: build.mutation<ApiResponse<{ added: number; replaced: number; skipped: number }>, { yearId?: string; fromClassId: string; toClassIds: string[]; replace: boolean }>({
      query: (body) => ({ url: "/fees/structure/copy-class", method: "POST", body }),
      invalidatesTags: ["Fees"],
    }),
    copyFeesFromLastYear: build.mutation<ApiResponse<{ added: number; skipped: number; from: string; raisePercent: number }>, { yearId?: string; raisePercent: number }>({
      query: (body) => ({ url: "/fees/structure/copy-year", method: "POST", body }),
      invalidatesTags: ["Fees"],
    }),

    getConcessions: build.query<ApiResponse<{ items: Concession[] }>, FeeStatus>({
      query: (status) => ({ url: "/fees/concessions", params: { status } }),
      providesTags: ["Fees"],
    }),
    createConcession: build.mutation<ApiResponse<Concession>, ConcessionBody>({ query: (body) => ({ url: "/fees/concessions", method: "POST", body }), invalidatesTags: ["Fees"] }),
    updateConcession: build.mutation<ApiResponse<Concession>, { id: string; body: Partial<ConcessionBody> }>({
      query: ({ id, body }) => ({ url: `/fees/concessions/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Fees"],
    }),
    deleteConcession: build.mutation<ApiResponse<null>, string>({ query: (id) => ({ url: `/fees/concessions/${id}`, method: "DELETE" }), invalidatesTags: ["Fees"] }),

    getFeeRules: build.query<ApiResponse<SavedFeeRules>, void>({ query: () => "/fees/rules", providesTags: ["Fees"] }),
    saveFeeRules: build.mutation<ApiResponse<SavedFeeRules>, FeeRules>({ query: (body) => ({ url: "/fees/rules", method: "PUT", body }), invalidatesTags: ["Fees"] }),
  }),
});

export const {
  useGetFeeHeadsQuery,
  useCreateFeeHeadMutation,
  useCreateFeeHeadsMutation,
  useUpdateFeeHeadMutation,
  useDeleteFeeHeadMutation,
  useGetFeeStructureQuery,
  useCreateFeeLinesMutation,
  useUpdateFeeLineMutation,
  useDeleteFeeLineMutation,
  useCopyFeesToClassesMutation,
  useCopyFeesFromLastYearMutation,
  useGetConcessionsQuery,
  useCreateConcessionMutation,
  useUpdateConcessionMutation,
  useDeleteConcessionMutation,
  useGetFeeRulesQuery,
  useSaveFeeRulesMutation,
} = feesApi;
