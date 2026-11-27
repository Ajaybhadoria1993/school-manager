import { createApi } from "@reduxjs/toolkit/query/react";
import type {
  ApiResponse,
  ClassExams,
  DutyTeacher,
  Exam,
  ExamDetail,
  ExamInput,
  ExamPaper,
  ExamRoom,
  ExamRoomDuty,
  ExamRoomInput,
  ExamRooms,
  ExamRoster,
  MarksInput,
  MarksSheet,
  MyExamDuty,
  PaperInput,
} from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * Exam (the menu's own row; it was Test & Exam under Manage school): the year's exams and tests, and each one's papers. The list is one read (its tag "Exams"); an exam's page is
 * another, tagged with the exam, so changing a paper reads again only that exam and the list's counts.
 */
export const examsApi = createApi({
  reducerPath: "examsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Exams", "Exam", "ClassExams", "MarksSheet", "ExamRoster", "ExamRooms", "MyExamDuties"],
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

    // ---- The children of an exam, their roll numbers and rooms (2026-11-27) ----------------------------------------------------------
    getExamRoster: build.query<ApiResponse<ExamRoster>, { examId: string; classId: string; sectionId?: string | null }>({
      query: ({ examId, classId, sectionId }) => ({ url: `/exams/${examId}/students`, params: { classId, ...(sectionId ? { sectionId } : {}) } }),
      providesTags: ["ExamRoster"],
    }),
    saveRollNumbers: build.mutation<ApiResponse<{ updated: number }>, { examId: string; rows: { studentId: string; rollNumber: number | null }[] }>({
      query: ({ examId, rows }) => ({ url: `/exams/${examId}/roll-numbers`, method: "PUT", body: { rows } }),
      // A roll number finds its room, and a child's class sheets list it too.
      invalidatesTags: ["ExamRoster", "ExamRooms", "ClassExams", "MarksSheet"],
    }),
    getExamRooms: build.query<ApiResponse<ExamRooms>, string>({
      query: (examId) => `/exams/${examId}/rooms`,
      providesTags: ["ExamRooms"],
    }),
    addExamRoom: build.mutation<ApiResponse<ExamRoom>, { examId: string } & ExamRoomInput>({
      query: ({ examId, ...body }) => ({ url: `/exams/${examId}/rooms`, method: "POST", body }),
      invalidatesTags: ["ExamRooms", "ExamRoster"],
    }),
    updateExamRoom: build.mutation<ApiResponse<ExamRoom>, { examId: string; roomId: string } & ExamRoomInput>({
      query: ({ examId, roomId, ...body }) => ({ url: `/exams/${examId}/rooms/${roomId}`, method: "PATCH", body }),
      invalidatesTags: ["ExamRooms", "ExamRoster"],
    }),
    deleteExamRoom: build.mutation<ApiResponse<{ id: string }>, { examId: string; roomId: string }>({
      query: ({ examId, roomId }) => ({ url: `/exams/${examId}/rooms/${roomId}`, method: "DELETE" }),
      invalidatesTags: ["ExamRooms", "ExamRoster"],
    }),

    // ---- Exam duty: the teachers who watch a room (2026-11-27) -------------------------------------------------------------------------
    /** The school's teachers to choose from: read only when a room's duty is being written. */
    getExamDutyTeachers: build.query<ApiResponse<{ items: DutyTeacher[] }>, string>({
      query: (examId) => `/exams/${examId}/teachers`,
    }),
    saveExamDuty: build.mutation<ApiResponse<ExamRoomDuty>, { examId: string; room: string; teacherIds: string[] }>({
      query: ({ examId, ...body }) => ({ url: `/exams/${examId}/duties`, method: "PUT", body }),
      invalidatesTags: ["ExamRooms"],
    }),
    /** The rooms the signed-in teacher watches (their home). */
    getMyExamDuties: build.query<ApiResponse<{ items: MyExamDuty[] }>, void>({
      query: () => "/exams/my-duties",
      providesTags: ["MyExamDuties"],
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
  useGetExamRosterQuery,
  useSaveRollNumbersMutation,
  useGetExamRoomsQuery,
  useAddExamRoomMutation,
  useUpdateExamRoomMutation,
  useDeleteExamRoomMutation,
  useGetExamDutyTeachersQuery,
  useSaveExamDutyMutation,
  useGetMyExamDutiesQuery,
  useGetClassExamsQuery,
  useGetMarksSheetQuery,
  useSaveExamMarksMutation,
} = examsApi;
