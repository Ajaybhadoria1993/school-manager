import { createApi } from "@reduxjs/toolkit/query/react";
import type {
  ApiResponse,
  CollectBody,
  CollectionSummary,
  Concession,
  ConcessionBody,
  Dues,
  FeeAccount,
  FeeHead,
  FeeHeadBody,
  FeeLine,
  FeeLineBody,
  FeeLinePatch,
  FeeRules,
  FeeStatus,
  FeeStructure,
  PaymentMode,
  Receipt,
  ReceiptSheet,
  SavedFeeRules,
  StudentToCollect,
} from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The school's fees (2026-11-12): the fee heads, each class's fee chart for a session, the concessions and the fee rules. Every change marks
 * what is on screen as stale (one tag), so each page asks again once, only while it is open.
 */
export const feesApi = createApi({
  reducerPath: "feesApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Fees", "Collect"],
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

    // ---- collecting (2026-11-19): a student's fee account, payments, receipts, the dues and the day's collection. One tag, `Collect`: every
    // payment, cancellation, concession or fee added makes what is on screen stale, and each page asks again once.
    searchFeeStudents: build.query<ApiResponse<{ items: StudentToCollect[] }>, string>({ query: (q) => ({ url: "/fees/students/search", params: { q } }) }),
    getFeeAccount: build.query<ApiResponse<FeeAccount>, string>({ query: (id) => `/fees/students/${id}/account`, providesTags: ["Collect"] }),
    addOptionalFee: build.mutation<ApiResponse<FeeAccount>, { studentId: string; lineId: string }>({
      query: ({ studentId, lineId }) => ({ url: `/fees/students/${studentId}/optional`, method: "POST", body: { lineId } }),
      invalidatesTags: ["Collect"],
    }),
    removeOptionalFee: build.mutation<ApiResponse<FeeAccount>, { studentId: string; lineId: string }>({
      query: ({ studentId, lineId }) => ({ url: `/fees/students/${studentId}/optional/${lineId}`, method: "DELETE" }),
      invalidatesTags: ["Collect"],
    }),
    giveStudentConcession: build.mutation<ApiResponse<FeeAccount>, { studentId: string; concessionId: string; note: string }>({
      query: ({ studentId, ...body }) => ({ url: `/fees/students/${studentId}/concessions`, method: "POST", body }),
      invalidatesTags: ["Collect"],
    }),
    approveStudentConcession: build.mutation<ApiResponse<FeeAccount>, string>({ query: (id) => ({ url: `/fees/student-concessions/${id}/approve`, method: "POST" }), invalidatesTags: ["Collect"] }),
    revokeStudentConcession: build.mutation<ApiResponse<FeeAccount>, string>({ query: (id) => ({ url: `/fees/student-concessions/${id}`, method: "DELETE" }), invalidatesTags: ["Collect"] }),
    generateFeeAccounts: build.mutation<ApiResponse<{ students: number; charges: number }>, { classId?: string }>({
      query: (body) => ({ url: "/fees/generate", method: "POST", body }),
      invalidatesTags: ["Collect"],
    }),
    collectFees: build.mutation<ApiResponse<Receipt>, CollectBody>({ query: (body) => ({ url: "/fees/collect", method: "POST", body }), invalidatesTags: ["Collect"] }),
    getReceipts: build.query<ApiResponse<{ items: Receipt[]; limit: number }>, { from?: string; to?: string; mode?: PaymentMode; status?: "valid" | "cancelled" | "all" }>({
      query: (params) => ({ url: "/fees/receipts", params }),
      providesTags: ["Collect"],
    }),
    getReceipt: build.query<ApiResponse<ReceiptSheet>, string>({ query: (id) => `/fees/receipts/${id}`, providesTags: ["Collect"] }),
    cancelReceipt: build.mutation<ApiResponse<Receipt>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/fees/receipts/${id}/cancel`, method: "POST", body: { reason } }),
      invalidatesTags: ["Collect"],
    }),
    getDues: build.query<ApiResponse<Dues>, { classId?: string; search?: string }>({ query: (params) => ({ url: "/fees/dues", params }), providesTags: ["Collect"] }),
    getCollection: build.query<ApiResponse<CollectionSummary>, { from?: string; to?: string }>({ query: (params) => ({ url: "/fees/collection", params }), providesTags: ["Collect"] }),
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
  useSearchFeeStudentsQuery,
  useGetFeeAccountQuery,
  useAddOptionalFeeMutation,
  useRemoveOptionalFeeMutation,
  useGiveStudentConcessionMutation,
  useApproveStudentConcessionMutation,
  useRevokeStudentConcessionMutation,
  useGenerateFeeAccountsMutation,
  useCollectFeesMutation,
  useGetReceiptsQuery,
  useGetReceiptQuery,
  useCancelReceiptMutation,
  useGetDuesQuery,
  useGetCollectionQuery,
} = feesApi;
