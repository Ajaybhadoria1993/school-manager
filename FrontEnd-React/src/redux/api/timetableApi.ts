import { createApi } from "@reduxjs/toolkit/query/react";
import type {
  ApiResponse,
  AllotmentView,
  AssignTeacherInput,
  AutofillAnswer,
  ClassTeacherAnswer,
  ClassTeacherInput,
  ClassDayInput,
  CopyAnswer,
  CopyInput,
  GridCell,
  GridView,
  ImportSheet,
  LoginAccount,
  OverviewQuery,
  PublishedUnits,
  QuickAddSubjectsResult,
  ReplaceTeacherInput,
  SaveAllotmentsInput,
  SaveUnitTeachersInput,
  Schedule,
  ScheduleInput,
  SchoolDayInput,
  Subject,
  SubjectInput,
  TeacherImportResult,
  TeacherSettings,
  TeacherImportRowInput,
  Teacher,
  TeacherClasses,
  TeacherInput,
  TeacherQuery,
  TeacherSummary,
  TeacherWeek,
  TimetableOverview,
  UnitRef,
  UsernameCheck,
} from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";
import { studentsApi } from "./studentsApi";

const sectionOf = (unit: UnitRef) => unit.sectionId ?? "none";
export const unitTag = (unit: UnitRef) => `${unit.classId}:${sectionOf(unit)}`;

/**
 * Subjects, teachers, the school's timings and every class's timetable, and which request each screen really needs.
 *
 * Reads, each with its own tag so a change refreshes only what it changed:
 *   Subject / Teacher / Schedule   the school's lists (one read each, shared by every page that needs them)
 *   Allotment                      what one class (or section) studies
 *   Overview                       the set-up at a glance (the flow page)
 *   TeacherWeek                    one teacher's week
 * The class's timetable (`getGrid`) is the workspace of its page: it is read when the page opens and not kept after it closes
 * (`keepUnusedDataFor: 0`), so opening another class never shows a copy that other classes' changes have made out of date. Saving a
 * timetable puts the server's answer into that read, so saving asks for nothing again.
 */
export const timetableApi = createApi({
  reducerPath: "timetableApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Subject", "Teacher", "Schedule", "Allotment", "Overview", "TeacherWeek", "Grid", "TeacherSettings"],
  refetchOnMountOrArgChange: 60,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    // ---- Subjects -------------------------------------------------------------------------------------------------------------------
    getSubjects: build.query<ApiResponse<{ items: Subject[] }>, "active" | "archived" | "all">({
      query: (status) => ({ url: "/subjects", params: { status } }),
      providesTags: ["Subject"],
    }),
    createSubject: build.mutation<ApiResponse<Subject>, SubjectInput>({
      query: (body) => ({ url: "/subjects", method: "POST", body }),
      invalidatesTags: ["Subject", "Overview"],
    }),
    quickAddSubjects: build.mutation<ApiResponse<QuickAddSubjectsResult>, string[]>({
      query: (names) => ({ url: "/subjects/quick-add", method: "POST", body: { names } }),
      invalidatesTags: ["Subject", "Overview"],
    }),
    updateSubject: build.mutation<ApiResponse<Subject>, { id: string } & Partial<SubjectInput> & { isActive?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/subjects/${id}`, method: "PATCH", body }),
      // A renamed subject is renamed in every class's list and timetable that shows it.
      invalidatesTags: ["Subject", "Overview", "Allotment", "Teacher"],
    }),

    // ---- Teachers -------------------------------------------------------------------------------------------------------------------
    getTeachers: build.query<ApiResponse<{ items: Teacher[] }>, TeacherQuery>({
      query: (params) => ({ url: "/staff/teachers", params }),
      providesTags: ["Teacher"],
    }),
    // The numbers on top of the Teacher page: the school's, whatever the filters (a class given or taken changes them too).
    getTeacherSummary: build.query<ApiResponse<TeacherSummary>, void>({
      query: () => "/staff/teachers/summary",
      providesTags: ["Teacher", "Allotment"],
    }),
    // One teacher with everything about them (their page and the change form).
    getTeacher: build.query<ApiResponse<Teacher>, string>({
      query: (id) => `/staff/teachers/${id}`,
      providesTags: ["Teacher"],
    }),
    // The signed-in teacher's own record (a teacher's home).
    getMyTeacher: build.query<ApiResponse<Teacher>, void>({
      query: () => "/staff/teachers/me",
      providesTags: ["Teacher"],
    }),
    createTeacher: build.mutation<ApiResponse<Teacher>, TeacherInput>({
      query: (body) => ({ url: "/staff/teachers", method: "POST", body }),
      invalidatesTags: ["Teacher", "Overview"],
    }),
    updateTeacher: build.mutation<ApiResponse<Teacher>, { id: string } & TeacherInput>({
      query: ({ id, ...body }) => ({ url: `/staff/teachers/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Teacher", "Overview", "Allotment", "TeacherWeek"],
    }),

    // A login for a teacher who has none, and a new password for one who has (the school hands it over; nothing on a screen changes).
    createTeacherLogin: build.mutation<ApiResponse<Teacher>, { id: string } & LoginAccount>({
      query: ({ id, ...body }) => ({ url: `/staff/teachers/${id}/login`, method: "POST", body }),
      invalidatesTags: ["Teacher"],
    }),
    resetTeacherPassword: build.mutation<ApiResponse<Record<string, never>>, { id: string; password: string }>({
      query: ({ id, ...body }) => ({ url: `/staff/teachers/${id}/reset-password`, method: "POST", body }),
    }),
    // Another username for a teacher's login (the password stays).
    changeTeacherUsername: build.mutation<ApiResponse<Teacher>, { id: string; username: string }>({
      query: ({ id, ...body }) => ({ url: `/staff/teachers/${id}/login`, method: "PATCH", body }),
      invalidatesTags: ["Teacher"],
    }),
    // What a teacher has been given (their page): class teacher of, and the subjects of classes they teach.
    getTeacherClasses: build.query<ApiResponse<TeacherClasses>, string>({
      query: (id) => `/staff/teachers/${id}/classes`,
      providesTags: ["Teacher", "Allotment"],
    }),
    // The class teacher of a section (a class's page or a teacher's page); the class pages (School Class) read it too.
    setClassTeacher: build.mutation<ApiResponse<ClassTeacherAnswer>, ClassTeacherInput>({
      query: (body) => ({ url: "/staff/class-teachers", method: "PUT", body }),
      invalidatesTags: ["Teacher"],
      async onQueryStarted(_input, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(studentsApi.util.invalidateTags(["Capacity"]));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    // One subject's teacher in one unit, the rest of its list as it is: the timetable reads the same list.
    assignTeacher: build.mutation<ApiResponse<AllotmentView>, AssignTeacherInput>({
      query: (body) => ({ url: "/subjects/allotments/teacher", method: "PUT", body }),
      invalidatesTags: ["Teacher", "Allotment", "Overview", "Subject", "TeacherWeek", "Grid"],
    }),
    // The school's own fields for its teachers (one read, kept until they are changed).
    getTeacherSettings: build.query<ApiResponse<TeacherSettings>, void>({
      query: () => "/staff/teachers/settings",
      providesTags: ["TeacherSettings"],
    }),
    updateTeacherSettings: build.mutation<ApiResponse<TeacherSettings>, TeacherSettings>({
      query: (body) => ({ url: "/staff/teachers/settings", method: "PUT", body }),
      // The answer is the list as it is now: it is put into the read.
      async onQueryStarted(_input, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getTeacherSettings", undefined, () => data));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    // Bringing many teachers in from a file (Teacher > Bulk upload): the file is read (nothing is kept), then its rows are made in parts of 10.
    // Nothing is marked stale by a part: the page sends every part and then refreshes once (`refreshAfterTeacherImport`).
    readTeacherFile: build.mutation<ApiResponse<ImportSheet>, FormData>({
      query: (body) => ({ url: "/staff/teachers/import/read", method: "POST", body }),
    }),
    importTeachers: build.mutation<ApiResponse<TeacherImportResult>, { rows: TeacherImportRowInput[] }>({
      query: (body) => ({ url: "/staff/teachers/import", method: "POST", body }),
    }),
    // A class's Save button (2026-11-06): its class teacher and the main + backup teachers of the subjects changed, all or nothing.
    saveUnitTeachers: build.mutation<ApiResponse<AllotmentView & { classTeacher: { id: string; name: string } | null }>, SaveUnitTeachersInput>({
      query: (body) => ({ url: "/subjects/allotments/teachers", method: "PUT", body }),
      // The answer is the unit's list as it is now: it is put into the read (no second read); the week below it is read again.
      invalidatesTags: ["Teacher", "Overview", "Subject", "TeacherWeek", "Grid"],
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getAllotments", { classId: input.classId, sectionId: input.sectionId }, () => data));
          dispatch(studentsApi.util.invalidateTags(["Capacity"]));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    // Is this username free on the whole platform (Add teacher, while it is typed)? Never kept: someone may take it any moment.
    checkUsername: build.query<ApiResponse<UsernameCheck>, string>({
      query: (username) => ({ url: "/staff/usernames/check", params: { username } }),
      keepUnusedDataFor: 0,
    }),

    // ---- The school's timings -------------------------------------------------------------------------------------------------------
    getSchedules: build.query<ApiResponse<{ items: Schedule[] }>, void>({
      query: () => "/timetable/schedules",
      providesTags: ["Schedule"],
    }),
    createSchedule: build.mutation<ApiResponse<Schedule>, ScheduleInput>({
      query: (body) => ({ url: "/timetable/schedules", method: "POST", body }),
      invalidatesTags: ["Schedule", "Overview", "Allotment"],
    }),
    updateSchedule: build.mutation<ApiResponse<Schedule>, { id: string } & Partial<ScheduleInput>>({
      query: ({ id, ...body }) => ({ url: `/timetable/schedules/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Schedule", "Overview", "Allotment", "TeacherWeek"],
    }),
    /** The whole week for all classes in one save; the answer (every timing as it is now) is put into the read, so nothing is asked again. */
    saveSchoolDay: build.mutation<ApiResponse<{ items: Schedule[] }>, SchoolDayInput>({
      query: (body) => ({ url: "/timetable/school-day", method: "PUT", body }),
      invalidatesTags: ["Overview", "Allotment", "TeacherWeek"],
      async onQueryStarted(_input, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getSchedules", undefined, () => data));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    /** A class's own days (more or fewer periods, a holiday) in one save; the answer (every timing as it is now) is put into the read. */
    saveClassDay: build.mutation<ApiResponse<{ items: Schedule[] }>, ClassDayInput>({
      query: (body) => ({ url: "/timetable/class-day", method: "PUT", body }),
      invalidatesTags: ["Overview", "Allotment", "TeacherWeek"],
      async onQueryStarted(_input, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getSchedules", undefined, () => data));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    /** A department follows the school's timing again; the answer (every timing as it is now) is put into the read. */
    removeDepartmentDay: build.mutation<ApiResponse<{ items: Schedule[] }>, string>({
      query: (departmentId) => ({ url: `/timetable/school-day/${departmentId}`, method: "DELETE" }),
      invalidatesTags: ["Overview", "Allotment", "TeacherWeek"],
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getSchedules", undefined, () => data));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    deleteSchedule: build.mutation<ApiResponse<{ id: string }>, string>({
      query: (id) => ({ url: `/timetable/schedules/${id}`, method: "DELETE" }),
      invalidatesTags: ["Schedule", "Overview", "Allotment", "TeacherWeek"],
    }),

    // ---- What each class studies ----------------------------------------------------------------------------------------------------
    // A class's list is the workspace of its page (like its timetable): read when the page opens, not kept after it closes.
    getAllotments: build.query<ApiResponse<AllotmentView>, UnitRef>({
      query: (unit) => ({ url: "/subjects/allotments", params: { classId: unit.classId, sectionId: sectionOf(unit) } }),
      providesTags: ["Allotment"],
      keepUnusedDataFor: 0,
    }),
    /** Saving answers with the list as it is now, which is put into the read, so saving asks for nothing again. */
    saveAllotments: build.mutation<ApiResponse<AllotmentView>, SaveAllotmentsInput>({
      query: (body) => ({ url: "/subjects/allotments", method: "PUT", body }),
      invalidatesTags: ["Overview", "Subject", "Teacher", "TeacherWeek"],
      async onQueryStarted(input, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getAllotments", { classId: input.classId, sectionId: input.sectionId }, () => data));
        } catch {
          // The page shows the reason.
        }
      },
    }),

    // ---- A class's weekly timetable -------------------------------------------------------------------------------------------------
    getGrid: build.query<ApiResponse<GridView>, UnitRef>({
      query: (unit) => ({ url: "/timetable/grid", params: { classId: unit.classId, sectionId: sectionOf(unit) } }),
      // Only a change of who teaches (a class's Save, one subject's teacher, a teacher replaced) asks for the week again.
      providesTags: ["Grid"],
      keepUnusedDataFor: 0,
    }),
    saveGrid: build.mutation<ApiResponse<GridView>, UnitRef & { cells: GridCell[] }>({
      query: (body) => ({ url: "/timetable/grid", method: "PUT", body }),
      invalidatesTags: ["Overview", "TeacherWeek", "Teacher"],
      async onQueryStarted(unit, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getGrid", { classId: unit.classId, sectionId: unit.sectionId }, () => data));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    publishGrid: build.mutation<ApiResponse<GridView>, UnitRef>({
      query: (body) => ({ url: "/timetable/grid/publish", method: "POST", body }),
      invalidatesTags: ["Overview", "TeacherWeek"],
      async onQueryStarted(unit, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getGrid", { classId: unit.classId, sectionId: unit.sectionId }, () => data));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    unpublishGrid: build.mutation<ApiResponse<GridView>, UnitRef>({
      query: (body) => ({ url: "/timetable/grid/unpublish", method: "POST", body }),
      invalidatesTags: ["Overview", "TeacherWeek"],
      async onQueryStarted(unit, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(timetableApi.util.updateQueryData("getGrid", { classId: unit.classId, sectionId: unit.sectionId }, () => data));
        } catch {
          // The page shows the reason.
        }
      },
    }),
    /** The program's proposal for the empty periods; nothing is stored, so nothing is invalidated. */
    autofillGrid: build.mutation<ApiResponse<AutofillAnswer>, UnitRef & { cells: GridCell[]; seed?: number }>({
      query: (body) => ({ url: "/timetable/grid/autofill", method: "POST", body }),
    }),
    copyGrid: build.mutation<ApiResponse<CopyAnswer>, CopyInput>({
      query: (body) => ({ url: "/timetable/grid/copy", method: "POST", body }),
      invalidatesTags: ["Overview", "TeacherWeek"],
    }),

    // ---- Teachers' weeks, the overview ----------------------------------------------------------------------------------------------
    getTeacherWeek: build.query<ApiResponse<TeacherWeek>, string>({
      query: (id) => `/timetable/teachers/${id}`,
      providesTags: ["TeacherWeek"],
      keepUnusedDataFor: 0,
    }),
    replaceTeacher: build.mutation<ApiResponse<{ allotments: number; lessons: number }>, { id: string } & ReplaceTeacherInput>({
      query: ({ id, ...body }) => ({ url: `/timetable/teachers/${id}/replace`, method: "POST", body }),
      invalidatesTags: ["Teacher", "Allotment", "Overview", "TeacherWeek", "Grid"],
    }),
    /** The set-up at a glance; the class list is filtered by the server (by name, by where the timetable stands). */
    getOverview: build.query<ApiResponse<TimetableOverview>, OverviewQuery>({
      query: (params) => ({ url: "/timetable/overview", params }),
      providesTags: ["Overview"],
    }),
    getPublishedUnits: build.query<ApiResponse<PublishedUnits>, void>({
      query: () => "/timetable/published",
      providesTags: ["Overview"],
    }),
  }),
});

export const {
  useGetSubjectsQuery,
  useCreateSubjectMutation,
  useQuickAddSubjectsMutation,
  useUpdateSubjectMutation,
  useGetTeachersQuery,
  useGetTeacherSummaryQuery,
  useGetTeacherQuery,
  useGetMyTeacherQuery,
  useCreateTeacherLoginMutation,
  useResetTeacherPasswordMutation,
  useCheckUsernameQuery,
  useChangeTeacherUsernameMutation,
  useGetTeacherClassesQuery,
  useSetClassTeacherMutation,
  useAssignTeacherMutation,
  useSaveUnitTeachersMutation,
  useReadTeacherFileMutation,
  useGetTeacherSettingsQuery,
  useUpdateTeacherSettingsMutation,
  useImportTeachersMutation,
  useCreateTeacherMutation,
  useUpdateTeacherMutation,
  useGetSchedulesQuery,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
  useSaveSchoolDayMutation,
  useSaveClassDayMutation,
  useRemoveDepartmentDayMutation,
  useDeleteScheduleMutation,
  useGetAllotmentsQuery,
  useSaveAllotmentsMutation,
  useGetGridQuery,
  useSaveGridMutation,
  usePublishGridMutation,
  useUnpublishGridMutation,
  useAutofillGridMutation,
  useCopyGridMutation,
  useGetTeacherWeekQuery,
  useReplaceTeacherMutation,
  useGetOverviewQuery,
  useGetPublishedUnitsQuery,
} = timetableApi;

/** After a bulk upload of teachers: the teacher lists and numbers, and the subjects a file may have added, are read again (the ones on screen only). */
export const refreshAfterTeacherImport = () => timetableApi.util.invalidateTags(["Teacher", "Overview", "Subject"]);
