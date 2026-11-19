import { createApi } from "@reduxjs/toolkit/query/react";
import type { AdmitCard, ApiResponse, Certificate, CertificateSheet, CertificateType, DocumentOptions, DocumentSettings, GradeBand, IdCard, ReportCard } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * What the school prints for a student (2026-11-19): the ID card and the exam report card (one student, or a whole class or section), and the
 * student's photo for the card. One tag: a new photo makes the cards and the photo stale, so each asks again once, only while it is open.
 */
export const documentsApi = createApi({
  reducerPath: "documentsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Documents"],
  refetchOnMountOrArgChange: true,
  endpoints: (build) => ({
    getDocumentOptions: build.query<ApiResponse<DocumentOptions>, void>({ query: () => "/documents/options", providesTags: ["Documents"] }),
    getIdCard: build.query<ApiResponse<IdCard>, string>({ query: (studentId) => `/documents/students/${studentId}/id-card`, providesTags: ["Documents"] }),
    getReportCard: build.query<ApiResponse<ReportCard>, { studentId: string; examId: string }>({
      query: ({ studentId, examId }) => ({ url: `/documents/students/${studentId}/report-card`, params: { examId } }),
      providesTags: ["Documents"],
    }),
    getClassIdCards: build.query<ApiResponse<{ items: IdCard[] }>, { classId: string; sectionId?: string }>({
      query: ({ classId, sectionId }) => ({ url: `/documents/classes/${classId}/id-cards`, params: sectionId ? { sectionId } : {} }),
      providesTags: ["Documents"],
    }),
    getClassReportCards: build.query<ApiResponse<{ items: ReportCard[] }>, { classId: string; examId: string; sectionId?: string }>({
      query: ({ classId, examId, sectionId }) => ({ url: `/documents/classes/${classId}/report-cards`, params: { examId, ...(sectionId ? { sectionId } : {}) } }),
      providesTags: ["Documents"],
    }),
    getAdmitCard: build.query<ApiResponse<AdmitCard>, { studentId: string; examId: string }>({
      query: ({ studentId, examId }) => ({ url: `/documents/students/${studentId}/admit-card`, params: { examId } }),
      providesTags: ["Documents"],
    }),
    getClassAdmitCards: build.query<ApiResponse<{ items: AdmitCard[] }>, { classId: string; examId: string; sectionId?: string }>({
      query: ({ classId, examId, sectionId }) => ({ url: `/documents/classes/${classId}/admit-cards`, params: { examId, ...(sectionId ? { sectionId } : {}) } }),
      providesTags: ["Documents"],
    }),
    saveRemark: build.mutation<ApiResponse<{ remark: string | null }>, { studentId: string; examId: string; remark: string }>({
      query: (body) => ({ url: "/documents/remarks", method: "PUT", body }),
      invalidatesTags: ["Documents"],
    }),
    getDocumentSettings: build.query<ApiResponse<DocumentSettings>, void>({ query: () => "/documents/settings", providesTags: ["Documents"] }),
    saveDocumentSettings: build.mutation<ApiResponse<DocumentSettings>, { passPercent: number; gradeBands: GradeBand[]; showRank: boolean; principalName: string }>({
      query: (body) => ({ url: "/documents/settings", method: "PUT", body }),
      invalidatesTags: ["Documents"],
    }),
    resetDocumentSettings: build.mutation<ApiResponse<DocumentSettings>, void>({ query: () => ({ url: "/documents/settings", method: "DELETE" }), invalidatesTags: ["Documents"] }),
    getCertificates: build.query<ApiResponse<{ items: Certificate[]; limit: number }>, { type?: CertificateType; studentId?: string }>({
      query: (params) => ({ url: "/documents/certificates", params }),
      providesTags: ["Documents"],
    }),
    getCertificate: build.query<ApiResponse<CertificateSheet>, string>({ query: (id) => `/documents/certificates/${id}`, providesTags: ["Documents"] }),
    issueCertificate: build.mutation<ApiResponse<Certificate>, { studentId: string; type: CertificateType; purpose: string; conduct: string }>({
      query: ({ studentId, ...body }) => ({ url: `/documents/students/${studentId}/certificates`, method: "POST", body }),
      invalidatesTags: ["Documents"],
    }),
    cancelCertificate: build.mutation<ApiResponse<Certificate>, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/documents/certificates/${id}/cancel`, method: "POST", body: { reason } }),
      invalidatesTags: ["Documents"],
    }),
    /** Students to issue a certificate for, by what is typed (a name or an admission number). */
    searchDocumentStudents: build.query<ApiResponse<{ items: { id: string; name: string; admissionNumber: string; classLabel: string | null }[] }>, string>({ query: (q) => ({ url: "/documents/students/search", params: { q } }) }),
    getStudentPhoto: build.query<ApiResponse<{ photo: string | null }>, string>({ query: (studentId) => `/documents/students/${studentId}/photo`, providesTags: ["Documents"] }),
    saveStudentPhoto: build.mutation<ApiResponse<{ photo: string | null }>, { studentId: string; body: FormData }>({
      query: ({ studentId, body }) => ({ url: `/documents/students/${studentId}/photo`, method: "PUT", body }),
      invalidatesTags: ["Documents"],
    }),
    removeStudentPhoto: build.mutation<ApiResponse<{ photo: null }>, string>({ query: (studentId) => ({ url: `/documents/students/${studentId}/photo`, method: "DELETE" }), invalidatesTags: ["Documents"] }),
  }),
});

export const {
  useGetDocumentOptionsQuery,
  useGetIdCardQuery,
  useGetReportCardQuery,
  useGetClassIdCardsQuery,
  useGetClassReportCardsQuery,
  useGetAdmitCardQuery,
  useGetClassAdmitCardsQuery,
  useSaveRemarkMutation,
  useGetDocumentSettingsQuery,
  useSaveDocumentSettingsMutation,
  useResetDocumentSettingsMutation,
  useGetCertificatesQuery,
  useGetCertificateQuery,
  useIssueCertificateMutation,
  useCancelCertificateMutation,
  useSearchDocumentStudentsQuery,
  useGetStudentPhotoQuery,
  useSaveStudentPhotoMutation,
  useRemoveStudentPhotoMutation,
} = documentsApi;
