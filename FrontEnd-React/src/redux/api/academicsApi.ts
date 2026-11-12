import { createApi } from "@reduxjs/toolkit/query/react";
import type {
  AcademicSettings,
  AcademicStructure,
  AcademicYear,
  AcademicYearInput,
  ActivatedAcademicYear,
  CurrentAcademicYear,
  NextAcademicYear,
  NextAcademicYearInput,
  AddClassesInput,
  AddClassesResult,
  ApiResponse,
  ClassListQuery,
  ClassPage,
  AssignDepartmentInput,
  AssignDepartmentResult,
  ClassInput,
  ClassItem,
  DepartmentItem,
  DivideClassInput,
  DivideClassResult,
  NewClassInput,
  QuickSetupInput,
  QuickSetupResult,
  SectionInput,
  SectionItem,
} from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";
import { studentsApi } from "./studentsApi";

/**
 * Classes, sections and departments, and which request each screen really needs.
 *
 * Three reads, each with its own tag, so a change refreshes only what it changed (never "everything"):
 *   Structure  the whole layout (departments, classes with sections, totals, the year, the settings): the list page, the headings
 *   ClassList  one page of the class list (rows with their section and seat counts): the list of a department's own screen
 *   Class      one class with its sections: the class on the right
 * What each change touches is written next to it. A change that touches none of them (the school's settings) writes its answer into
 * the cache instead of asking again. A read that is not on screen is not asked for: RTK Query drops its cached copy when it is
 * invalidated and reads it again when it is next needed.
 */
export const academicsApi = createApi({
  reducerPath: "academicsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Structure", "ClassList", "Class", "AcademicYear"],
  // A copy younger than a minute is shown as it is when a screen comes back (list page <-> a department's page); our own changes
  // already refresh what they touch, so asking again would only repeat what is known. Older than that, it is read again.
  refetchOnMountOrArgChange: 60,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getStructure: build.query<ApiResponse<AcademicStructure>, void>({
      query: () => "/academics/structure",
      providesTags: ["Structure"],
    }),

    /** The class list: filtered, sorted and paged by the server. */
    getClasses: build.query<ApiResponse<ClassPage>, ClassListQuery>({
      query: (params) => ({ url: "/academics/classes", params }),
      providesTags: ["ClassList"],
    }),
    getClass: build.query<ApiResponse<ClassItem>, string>({
      query: (id) => `/academics/classes/${id}`,
      providesTags: ["Class"],
    }),

    /** The school's current session, for the dashboard. */
    getCurrentAcademicYear: build.query<ApiResponse<CurrentAcademicYear>, void>({
      query: () => "/academics/academic-years/current",
      providesTags: ["AcademicYear"],
    }),
    /** Every year of the school, the newest first: the next one waiting, the running one, the closed ones. */
    getAcademicYears: build.query<ApiResponse<AcademicYear[]>, void>({
      query: () => "/academics/academic-years",
      providesTags: ["AcademicYear"],
    }),
    /** The next session, made waiting (the sections of the running year are copied into it unless said not). It changes nothing that is shown today. */
    createNextAcademicYear: build.mutation<ApiResponse<NextAcademicYear>, NextAcademicYearInput>({
      query: (body) => ({ url: "/academics/academic-years", method: "POST", body }),
      invalidatesTags: ["AcademicYear"],
    }),
    /**
     * Switches the waiting year on (the school admin): the running year closes. Everything of the school is about another year from then
     * on, so the class layout and every student list, seat count and promotion list are read again where they are on screen.
     */
    activateAcademicYear: build.mutation<ApiResponse<ActivatedAcademicYear>, string>({
      query: (id) => ({ url: `/academics/academic-years/${id}/activate`, method: "POST", body: {} }),
      invalidatesTags: ["AcademicYear", "Structure", "ClassList", "Class"],
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(studentsApi.util.invalidateTags(["StudentList", "Capacity", "Student", "StudentInactive", "StudentPromotion"]));
        } catch {
          // The screen shows the reason.
        }
      },
    }),
    /** Only for a school with no academic year at all (approved before academic years existed): names the running session, once. */
    setUpFirstAcademicYear: build.mutation<ApiResponse<AcademicYear>, AcademicYearInput>({
      query: (body) => ({ url: "/academics/academic-years/initial", method: "POST", body }),
      // Its existing sections are given this year, so every read of a section changes with it.
      invalidatesTags: ["AcademicYear", "Structure", "ClassList", "Class"],
    }),

    /**
     * The school's switches (is a section's seats and room required...). The server keeps and enforces them. It changes nothing that
     * is read as a layout or a list, so it asks for nothing again: the switch is moved in the cached layout (at once, and put back if
     * the server says no) and then set to what the server answered.
     */
    updateAcademicSettings: build.mutation<ApiResponse<AcademicSettings>, AcademicSettings>({
      query: (body) => ({ url: "/academics/settings", method: "PUT", body }),
      async onQueryStarted(settings, { dispatch, queryFulfilled }) {
        const shown = dispatch(
          academicsApi.util.updateQueryData("getStructure", undefined, (draft) => {
            draft.data.settings = settings;
          })
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            academicsApi.util.updateQueryData("getStructure", undefined, (draft) => {
              draft.data.settings = data.data;
            })
          );
        } catch {
          shown.undo();
        }
      },
    }),

    quickSetup: build.mutation<ApiResponse<QuickSetupResult>, QuickSetupInput>({
      query: (body) => ({ url: "/academics/quick-setup", method: "POST", body }),
      invalidatesTags: ["Structure", "ClassList"],
    }),

    /** A department with no classes yet: only the layout has it. */
    createDepartment: build.mutation<ApiResponse<DepartmentItem>, { name: string }>({
      query: (body) => ({ url: "/academics/departments", method: "POST", body }),
      invalidatesTags: ["Structure"],
    }),
    /** Picks or makes a department by name and puts the given classes in it, in one request. */
    assignDepartment: build.mutation<ApiResponse<AssignDepartmentResult>, AssignDepartmentInput>({
      query: (body) => ({ url: "/academics/departments/assign", method: "POST", body }),
      invalidatesTags: ["Structure", "ClassList", "Class"],
    }),
    /** Fills one department: moves classes the school has into it and creates the ones it does not. */
    addClassesToDepartment: build.mutation<ApiResponse<AddClassesResult>, { id: string } & AddClassesInput>({
      query: ({ id, ...body }) => ({ url: `/academics/departments/${id}/classes`, method: "POST", body }),
      invalidatesTags: ["Structure", "ClassList", "Class"],
    }),
    /** A name only: no class changes (a row of the class list does not carry its department's name), so only the layout is read again. */
    renameDepartment: build.mutation<ApiResponse<DepartmentItem>, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/academics/departments/${id}`, method: "PATCH", body: { name } }),
      invalidatesTags: ["Structure"],
    }),
    /**
     * A department is never deleted: it is made inactive (the server allows it only when none of its classes is active) and made active
     * again. Its classes do not change either way, so only the layout is read again.
     */
    deactivateDepartment: build.mutation<ApiResponse<DepartmentItem>, string>({
      query: (id) => ({ url: `/academics/departments/${id}/deactivate`, method: "POST", body: {} }),
      invalidatesTags: ["Structure"],
    }),
    reactivateDepartment: build.mutation<ApiResponse<DepartmentItem>, string>({
      query: (id) => ({ url: `/academics/departments/${id}/reactivate`, method: "POST", body: {} }),
      invalidatesTags: ["Structure"],
    }),

    /** A new class cannot be on screen yet: the layout and the list gain a row. */
    createClass: build.mutation<ApiResponse<ClassItem>, NewClassInput>({
      query: (body) => ({ url: "/academics/classes", method: "POST", body }),
      invalidatesTags: ["Structure", "ClassList"],
    }),
    /**
     * Sends only what is given: a name change must not undo a department change made a moment ago, and the other way round.
     * `refresh: false` is for a caller that sends several changes in a row and asks for the new state once at the end (`refreshClass`).
     */
    updateClass: build.mutation<ApiResponse<ClassItem>, { id: string; refresh?: boolean } & Partial<ClassInput>>({
      query: ({ id, refresh: _refresh, ...body }) => ({ url: `/academics/classes/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { refresh }) => (refresh === false ? [] : ["Structure", "ClassList", "Class"]),
    }),
    /**
     * A class is never deleted (its students and their history belong to it): it is made inactive, which the server allows only when no
     * student is left in it, and made active again. The layout and the list lose it (or gain it); the open class is not asked for again
     * when it goes, and is when it comes back.
     */
    deactivateClass: build.mutation<ApiResponse<ClassItem>, string>({
      query: (id) => ({ url: `/academics/classes/${id}/deactivate`, method: "POST", body: {} }),
      // The class stays in its department's list, marked inactive, and the one that is open is read again to show it so.
      invalidatesTags: ["Structure", "ClassList", "Class"],
    }),
    reactivateClass: build.mutation<ApiResponse<ClassItem>, string>({
      query: (id) => ({ url: `/academics/classes/${id}/reactivate`, method: "POST", body: {} }),
      invalidatesTags: ["Structure", "ClassList", "Class"],
    }),
    /**
     * A class with students in it itself is divided into sections and the students are shared out between them. It changes the class, its
     * sections and where its students sit, so those are read again where they are on screen (the student lists and the seat counts too).
     */
    divideClass: build.mutation<ApiResponse<DivideClassResult>, { id: string } & DivideClassInput>({
      query: ({ id, ...body }) => ({ url: `/academics/classes/${id}/divide`, method: "POST", body }),
      invalidatesTags: ["Structure", "ClassList", "Class"],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(studentsApi.util.invalidateTags(["StudentList", "Capacity", "Student"]));
        } catch {
          // The screen shows the reason.
        }
      },
    }),

    createSection: build.mutation<ApiResponse<SectionItem>, { classId: string } & SectionInput>({
      query: ({ classId, ...body }) => ({ url: `/academics/classes/${classId}/sections`, method: "POST", body }),
      invalidatesTags: ["Structure", "ClassList", "Class"],
    }),
    /**
     * Sends only what is given: saving the seats must not put back an old room that was saved a moment ago.
     * `refresh: false`: see `updateClass`.
     */
    updateSection: build.mutation<ApiResponse<SectionItem>, { id: string; refresh?: boolean } & Partial<SectionInput>>({
      query: ({ id, refresh: _refresh, ...body }) => ({ url: `/academics/sections/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, { refresh }) => (refresh === false ? [] : ["Structure", "ClassList", "Class"]),
    }),
    deleteSection: build.mutation<ApiResponse<null>, string>({
      query: (id) => ({ url: `/academics/sections/${id}`, method: "DELETE" }),
      invalidatesTags: ["Structure", "ClassList", "Class"],
    }),
  }),
});

/** Asks once, after several changes were sent with `refresh: false`, for exactly the reads that a change to a class touches. */
export const refreshClass = () => academicsApi.util.invalidateTags(["Structure", "ClassList", "Class"]);

export const {
  useGetStructureQuery,
  useGetClassesQuery,
  useGetClassQuery,
  useGetCurrentAcademicYearQuery,
  useSetUpFirstAcademicYearMutation,
  useGetAcademicYearsQuery,
  useCreateNextAcademicYearMutation,
  useActivateAcademicYearMutation,
  useUpdateAcademicSettingsMutation,
  useQuickSetupMutation,
  useAddClassesToDepartmentMutation,
  useAssignDepartmentMutation,
  useCreateDepartmentMutation,
  useRenameDepartmentMutation,
  useDeactivateDepartmentMutation,
  useReactivateDepartmentMutation,
  useCreateClassMutation,
  useUpdateClassMutation,
  useDeactivateClassMutation,
  useReactivateClassMutation,
  useDivideClassMutation,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
} = academicsApi;
