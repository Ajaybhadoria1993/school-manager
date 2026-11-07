import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, ClassExams, Exam, ExamDetail, ExamInput, ExamPaper, MarksInput, MarksSheet, PaperInput } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * Test & Exam (Manage school): the year's exams and tests, and each one's papers. The list is one read (its tag "Exams"); an exam's page is
 * another, tagged with the exam, so changing a paper reads again only that exam and the list's counts.
 */
export const examsApi = createApi({
  reducerPath: "examsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Exams", "Exam", "ClassExams", "MarksSheet"],
  refetchOnMountOrArgChange: 60,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getExams: build.query<ApiResponse<{ items: Exam[] }>, void>({
      query: () => "/exams",
      providesTags: ["Exams"],
    }),
    getExam: build.query<ApiResponse<ExamDetail>, string>({
      query: (id) => `/exams/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Exam", id }],
    }),
    createExam: build.mutation<ApiResponse<Exam>, ExamInput>({
      query: (body) => ({ url: "/exams", method: "POST", body }),
      invalidatesTags: ["Exams", "ClassExams"],
    }),
    updateExam: build.mutation<ApiResponse<Exam>, { id: string } & Partial<ExamInput>>({
      query: ({ id, ...body }) => ({ url: `/exams/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { id }) => ["Exams", "ClassExams", "MarksSheet", { type: "Exam", id }],
    }),
    deleteExam: build.mutation<ApiResponse<{ id: string }>, string>({
      query: (id) => ({ url: `/exams/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, id) => ["Exams", "ClassExams", "MarksSheet", { type: "Exam", id }],
    }),

    // ---- Papers: a timetable for some classes at once, then one paper at a time ---------------------------------------------------------
    addPapers: build.mutation<ApiResponse<{ items: ExamPaper[] }>, { examId: string; classIds: string[]; papers: PaperInput[] }>({
      query: ({ examId, ...body }) => ({ url: `/exams/${examId}/papers`, method: "POST", body }),
      invalidatesTags: (_result, _error, { examId }) => ["Exams", "ClassExams", { type: "Exam", id: examId }],
    }),
    updatePaper: build.mutation<ApiResponse<ExamPaper>, { examId: string; paperId: string; classIds?: string[] } & Partial<PaperInput>>({
      query: ({ examId, paperId, ...body }) => ({ url: `/exams/${examId}/papers/${paperId}`, method: "PATCH", body }),
      // Its out-of, day or time show on the marks sheet too.
      invalidatesTags: (_result, _error, { examId }) => ["Exams", "ClassExams", "MarksSheet", { type: "Exam", id: examId }],
    }),
    deletePaper: build.mutation<ApiResponse<{ id: string }>, { examId: string; paperId: string }>({
      query: ({ examId, paperId }) => ({ url: `/exams/${examId}/papers/${paperId}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, { examId }) => ["Exams", "ClassExams", "MarksSheet", { type: "Exam", id: examId }],
    }),

    // ---- A class's exams, and the marks (the teachers of the class and the school) ----------------------------------------------------
    getClassExams: build.query<ApiResponse<ClassExams>, { classId: string; sectionId: string | null; date?: string }>({
      query: ({ classId, sectionId, date }) => ({ url: "/exams/class", params: { classId, sectionId: sectionId ?? "none", ...(date ? { date } : {}) } }),
      providesTags: ["ClassExams"],
    }),
    getMarksSheet: build.query<ApiResponse<MarksSheet>, { paperId: string; classId: string; sectionId: string | null }>({
      query: ({ paperId, classId, sectionId }) => ({ url: `/exams/papers/${paperId}/marks`, params: { classId, sectionId: sectionId ?? "none" } }),
      providesTags: ["MarksSheet"],
    }),
    saveExamMarks: build.mutation<ApiResponse<MarksSheet>, { paperId: string } & MarksInput>({
      query: ({ paperId, ...body }) => ({ url: `/exams/papers/${paperId}/marks`, method: "PUT", body }),
      // The class's list (its counts), the admin's exam page (its counts) and the marks sheets (a sheet opened again must show what was saved, not the copy kept from before).
      invalidatesTags: ["ClassExams", "Exams", "Exam", "MarksSheet"],
    }),
  }),
});

export const {
  useGetExamsQuery,
  useGetExamQuery,
  useCreateExamMutation,
  useUpdateExamMutation,
  useDeleteExamMutation,
  useAddPapersMutation,
  useUpdatePaperMutation,
  useDeletePaperMutation,
  useGetClassExamsQuery,
  useGetMarksSheetQuery,
  useSaveExamMarksMutation,
} = examsApi;
