import { createApi } from "@reduxjs/toolkit/query/react";
import type {
  AdmitStudentInput,
  ApiResponse,
  ExportPreview,
  GuardianMatch,
  ImportResult,
  ImportRowInput,
  ImportSheet,
  MoveStudentInput,
  StudentCapacity,
  StudentDetail,
  StudentListQuery,
  StudentPage,
  StudentPlace,
  StudentSettings,
  UpdateGuardianInput,
  UpdateStudentInput,
  UpdateStudentSettingsInput,
} from "../../types";
import { MAX_ROLL_NUMBER } from "../../constants/students";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

type Seat = (Pick<StudentPlace, "classId" | "sectionId"> & Partial<Pick<StudentPlace, "rollNumber">>) | null | undefined;

/** The name the server gave a downloaded file (Content-Disposition), or null. */
function fileNameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
}

/** Hands a file to the browser to save, under its name. */
function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A student took a seat (`to`) and/or left one (`from`): the cached seat counts follow the server's answer, so the tiles and the
 * chips are right without asking again. (An admission is `from` null; a move has both.) Anything else that changed them, such as
 * another person's admission, is picked up when the copy is read again (after a minute, see refetchOnMountOrArgChange).
 */
function seatsMoved(draft: StudentCapacity, from: Seat, to: Seat) {
  const shift = (seat: Seat, by: 1 | -1) => {
    if (!seat) return;
    const klass = draft.classes.find((c) => c.classId === seat.classId);
    if (klass) klass.enrolled = Math.max(0, klass.enrolled + by);
    else if (by > 0) draft.classes.push({ classId: seat.classId, enrolled: 1, nextRollNumber: 1 });
    const section = seat.sectionId ? draft.sections.find((s) => s.sectionId === seat.sectionId) : undefined;
    if (section) {
      section.enrolled = Math.max(0, section.enrolled + by);
      section.seatsLeft = section.capacity === null ? null : Math.max(0, section.capacity - section.enrolled);
    }
    // A roll number given in the seat taken moves "next free" past it (the one after the highest), as the server counts it.
    const roll = by > 0 && "rollNumber" in seat ? seat.rollNumber : null;
    if (roll) {
      const holder = section ?? (seat.sectionId ? undefined : draft.classes.find((c) => c.classId === seat.classId));
      if (holder && holder.nextRollNumber !== null && roll >= holder.nextRollNumber) holder.nextRollNumber = roll + 1 > MAX_ROLL_NUMBER ? null : roll + 1;
    }
  };
  shift(from, -1);
  shift(to, 1);
  if (!from && to) draft.totals.students += 1;
  const limited = draft.sections.filter((s) => s.capacity !== null);
  draft.totals.seatsLeft = limited.reduce((sum, s) => sum + (s.seatsLeft ?? 0), 0);
  draft.totals.fullSections = limited.filter((s) => s.seatsLeft === 0).length;
}

/**
 * Students, their guardians and their place this year, and which request each screen really needs.
 *
 * Three reads, each with its own tag, so a change refreshes only what it changed:
 *   StudentList     one page of the list (search, filters, sort and page are the server's)
 *   Student (id)    one student's page; a change to one student never re-reads another's
 *   Capacity        how full each section is this year (the list's tiles, the admission form's "seats left")
 * A change answers with the student as they are now, and that answer is written straight into the student's cached page, so the
 * page on screen is never read again after a save; an admission or a move also moves one seat in the cached seat counts (from the
 * answer) instead of reading them again while the form is still on screen. Other students whose page shows this one (brothers and sisters, the other
 * children of a guardian) are marked stale by id: RTK Query reads them again only if they are on screen, else when next opened.
 * The guardian lookup is a POST (a mobile number must never travel in an address) and is not cached.
 */
export const studentsApi = createApi({
  reducerPath: "studentsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["StudentList", "Student", "Capacity", "StudentSettings"],
  // Like the classes screens: a copy younger than a minute is shown as it is when a screen comes back; our own changes already
  // refresh what they touch.
  refetchOnMountOrArgChange: 60,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getStudents: build.query<ApiResponse<StudentPage>, StudentListQuery>({
      query: (params) => ({ url: "/students", params }),
      providesTags: ["StudentList"],
    }),
    getStudent: build.query<ApiResponse<StudentDetail>, string>({
      query: (id) => `/students/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Student", id }],
    }),
    getCapacity: build.query<ApiResponse<StudentCapacity>, void>({
      query: () => "/students/capacity",
      providesTags: ["Capacity"],
    }),

    /**
     * How this school keeps its students' records: what the admission form needs (required / optional / not asked) and the export's
     * columns. Read once and shared by the admission form, the edit form, the Fields screen and the Export screen.
     */
    getStudentSettings: build.query<ApiResponse<StudentSettings>, void>({
      query: () => "/students/settings",
      providesTags: ["StudentSettings"],
    }),
    /** Saves what is sent; the screens that read the settings take the answer (nothing is read again). */
    updateStudentSettings: build.mutation<ApiResponse<StudentSettings>, UpdateStudentSettingsInput>({
      query: (body) => ({ url: "/students/settings", method: "PUT", body }),
      async onQueryStarted(_input, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(studentsApi.util.upsertQueryData("getStudentSettings", undefined, data));
        } catch {
          // The screen shows the reason.
        }
      },
    }),
    /** The first students of the export (every column's value) and how many there are: the Export screen's preview. */
    getExportPreview: build.query<ApiResponse<ExportPreview>, { q?: string; classId?: string; sectionId?: string }>({
      query: (params) => ({ url: "/students/export/preview", params }),
      // An admission or a change shows in the preview too.
      providesTags: ["StudentList"],
    }),

    /** "Is this parent already in the school?" One POST when a full mobile number is typed. Nothing is cached. */
    lookupGuardian: build.mutation<ApiResponse<{ guardian: GuardianMatch | null }>, { mobile: string }>({
      query: (body) => ({ url: "/students/guardians/lookup", method: "POST", body }),
    }),

    /**
     * One admission. The new student's page is filled from the answer (opening it asks for nothing); the list gains a student; the
     * seat counts take the new seat from the answer; the brothers and sisters' pages gain a sibling.
     */
    admitStudent: build.mutation<ApiResponse<StudentDetail>, AdmitStudentInput>({
      query: (body) => ({ url: "/students", method: "POST", body }),
      invalidatesTags: (result) => (result ? ["StudentList", ...result.data.siblings.map((s) => ({ type: "Student" as const, id: s.id }))] : []),
      async onQueryStarted(_input, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(studentsApi.util.upsertQueryData("getStudent", data.data.id, data));
          dispatch(studentsApi.util.updateQueryData("getCapacity", undefined, (draft) => seatsMoved(draft.data, null, data.data.place)));
        } catch {
          // The form shows the reason.
        }
      },
    }),

    /**
     * The student's own details (only what is sent). The page on screen takes the answer; the list re-reads (a name), and so do the
     * brothers and sisters (they show this name). `refresh: false` is for the one Save that sends several changes and refreshes
     * once at the end (`refreshAfterSave`).
     */
    updateStudent: build.mutation<ApiResponse<StudentDetail>, { id: string; refresh?: boolean } & UpdateStudentInput>({
      query: ({ id, refresh: _refresh, ...body }) => ({ url: `/students/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, _error, { refresh }) =>
        result && refresh !== false ? ["StudentList", ...result.data.siblings.map((s) => ({ type: "Student" as const, id: s.id }))] : [],
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(studentsApi.util.upsertQueryData("getStudent", id, data));
        } catch {
          // The form shows the reason.
        }
      },
    }),

    /** Another class, section or roll number this year: as above, and the seat counts move the seat (from the answer). */
    moveStudent: build.mutation<ApiResponse<StudentDetail>, { id: string; refresh?: boolean } & MoveStudentInput>({
      query: ({ id, refresh: _refresh, ...body }) => ({ url: `/students/${id}/enrolment`, method: "PATCH", body }),
      invalidatesTags: (result, _error, { refresh }) =>
        result && refresh !== false ? ["StudentList", ...result.data.siblings.map((s) => ({ type: "Student" as const, id: s.id }))] : [],
      async onQueryStarted({ id }, { dispatch, getState, queryFulfilled }) {
        // Where the student sat before (from the page on screen), to give that seat back.
        const before = studentsApi.endpoints.getStudent.select(id)(getState())?.data?.data.place;
        try {
          const { data } = await queryFulfilled;
          dispatch(studentsApi.util.upsertQueryData("getStudent", id, data));
          const after = data.data.place;
          if (before?.sectionId !== after?.sectionId || before?.classId !== after?.classId) {
            dispatch(studentsApi.util.updateQueryData("getCapacity", undefined, (draft) => seatsMoved(draft.data, before, after)));
          }
        } catch {
          // The form shows the reason.
        }
      },
    }),

    /**
     * A spreadsheet the server makes (the sample template, the export): saved by the browser under the server's name. Nothing is
     * cached (only a null lands in the store; the file goes straight to the browser).
     */
    downloadSheet: build.mutation<null, { url: "/students/import/template" | "/students/export"; params?: Record<string, string>; fallbackName: string }>({
      async queryFn({ url, params, fallbackName }, _api, _extra, baseQuery) {
        const result = await baseQuery({
          url,
          params,
          responseHandler: async (response) => {
            if (!response.ok) return response.json().catch(() => null);
            saveFile(await response.blob(), fileNameOf(response.headers.get("content-disposition")) ?? fallbackName);
            return null;
          },
        });
        return result.error ? { error: result.error } : { data: null };
      },
    }),

    /** Reads an uploaded students file (it is not kept): its column titles and rows, for the screen to match the columns. */
    readImportFile: build.mutation<ApiResponse<ImportSheet>, FormData>({
      query: (body) => ({ url: "/students/import/read", method: "POST", body }),
    }),

    /**
     * A part of a bulk import (up to 100 rows): checked (`dryRun`) or admitted. Marks nothing stale by itself: the import screen sends
     * every part and then refreshes once (`refreshAfterImport`).
     */
    importStudents: build.mutation<ApiResponse<ImportResult>, { dryRun: boolean; allowOverCapacity: boolean; rows: ImportRowInput[] }>({
      query: (body) => ({ url: "/students/import", method: "POST", body }),
    }),

    /** A guardian's own details: every child of theirs shows them, and the list shows the primary guardian's name and number. */
    updateGuardian: build.mutation<ApiResponse<GuardianMatch>, { id: string; refresh?: boolean } & UpdateGuardianInput>({
      query: ({ id, refresh: _refresh, ...body }) => ({ url: `/students/guardians/${id}`, method: "PATCH", body }),
      invalidatesTags: (result, _error, { refresh }) =>
        result && refresh !== false ? ["StudentList", ...result.data.children.map((c) => ({ type: "Student" as const, id: c.id }))] : [],
    }),
  }),
});

/**
 * After a Save that sent several changes with `refresh: false`: marks stale, once, exactly what those changes touched. The student on
 * screen is not among them (it already holds the server's answer), nor the seats (a move updates them from the answer).
 */
export const refreshAfterSave = (touched: { studentIds: string[] }) =>
  studentsApi.util.invalidateTags(["StudentList", ...touched.studentIds.map((id) => ({ type: "Student" as const, id }))]);

/**
 * After a bulk import: the list and the seats changed, and parents already in the school may have gained children (their children's
 * pages show brothers and sisters), so every cached student page is dropped too. Only what is on screen is read again.
 */
export const refreshAfterImport = () => studentsApi.util.invalidateTags(["StudentList", "Capacity", "Student"]);

export const {
  useGetStudentSettingsQuery,
  useUpdateStudentSettingsMutation,
  useGetExportPreviewQuery,
  useDownloadSheetMutation,
  useReadImportFileMutation,
  useImportStudentsMutation,
  useGetStudentsQuery,
  useGetStudentQuery,
  useGetCapacityQuery,
  useLookupGuardianMutation,
  useAdmitStudentMutation,
  useUpdateStudentMutation,
  useMoveStudentMutation,
  useUpdateGuardianMutation,
} = studentsApi;
