import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, MyProfile, MyProfileInput, PhotoPerson, ProfilePhoto, ResumeInfo } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

const personUrl = ({ kind, id }: PhotoPerson) => `/staff/${kind === "teacher" ? "teachers" : "members"}/${id}/photo`;

/** "mine": the signed-in teacher's own; else a teacher's id. */
const resumeUrl = (owner: string) => (owner === "mine" ? "/profile/resume" : `/staff/teachers/${owner}/resume`);
type ResumeAnswer = ApiResponse<{ resume: ResumeInfo | null }>;

/**
 * The signed-in person's own details and photo, teachers' resumes, and the photos the school keeps of teachers and staff (docs/profiles.md). A photo's save
 * and removal answer with the picture, which goes straight into the cache: it is not asked for again.
 */
export const profileApi = createApi({
  reducerPath: "profileApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Profile"],
  refetchOnMountOrArgChange: 60,
  refetchOnReconnect: true,
  endpoints: (build) => {
    /** Puts the answer's picture where the person's photo is read from. */
    const intoMine = async (_arg: unknown, { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<{ data: ApiResponse<ProfilePhoto> }> }) => {
      try {
        const { data } = await queryFulfilled;
        dispatch(profileApi.util.upsertQueryData("getMyPhoto", undefined, data));
      } catch {
        // The caller shows the error; the cache stays as it was.
      }
    };
    const intoTheirs = async (person: PhotoPerson, { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<{ data: ApiResponse<ProfilePhoto> }> }) => {
      try {
        const { data } = await queryFulfilled;
        dispatch(profileApi.util.upsertQueryData("getPersonPhoto", { kind: person.kind, id: person.id }, data));
      } catch {
        // The caller shows the error; the cache stays as it was.
      }
    };
    /** The same for a resume: the answer says what is kept now. */
    const intoResume = async (owner: string, { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<{ data: ResumeAnswer }> }) => {
      try {
        const { data } = await queryFulfilled;
        dispatch(profileApi.util.upsertQueryData("getResume", owner, data));
      } catch {
        // The caller shows the error; the cache stays as it was.
      }
    };
    return {
      getResume: build.query<ResumeAnswer, string>({ query: resumeUrl }),
      saveResume: build.mutation<ResumeAnswer, { owner: string; body: FormData }>({
        query: ({ owner, body }) => ({ url: resumeUrl(owner), method: "PUT", body }),
        onQueryStarted: ({ owner }, api) => intoResume(owner, api),
      }),
      removeResume: build.mutation<ResumeAnswer, string>({ query: (owner) => ({ url: resumeUrl(owner), method: "DELETE" }), onQueryStarted: intoResume }),
      getMyProfile: build.query<ApiResponse<MyProfile>, void>({ query: () => "/profile", providesTags: ["Profile"] }),
      updateMyProfile: build.mutation<ApiResponse<MyProfile>, MyProfileInput>({
        query: (body) => ({ url: "/profile", method: "PUT", body }),
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          try {
            const { data } = await queryFulfilled;
            dispatch(profileApi.util.upsertQueryData("getMyProfile", undefined, data));
          } catch {
            // The caller shows the error.
          }
        },
      }),
      getMyPhoto: build.query<ApiResponse<ProfilePhoto>, void>({ query: () => "/profile/photo" }),
      saveMyPhoto: build.mutation<ApiResponse<ProfilePhoto>, FormData>({ query: (body) => ({ url: "/profile/photo", method: "PUT", body }), onQueryStarted: intoMine }),
      removeMyPhoto: build.mutation<ApiResponse<ProfilePhoto>, void>({ query: () => ({ url: "/profile/photo", method: "DELETE" }), onQueryStarted: intoMine }),
      getPersonPhoto: build.query<ApiResponse<ProfilePhoto>, PhotoPerson>({ query: personUrl }),
      savePersonPhoto: build.mutation<ApiResponse<ProfilePhoto>, PhotoPerson & { body: FormData }>({ query: ({ body, ...person }) => ({ url: personUrl(person), method: "PUT", body }), onQueryStarted: intoTheirs }),
      removePersonPhoto: build.mutation<ApiResponse<ProfilePhoto>, PhotoPerson>({ query: (person) => ({ url: personUrl(person), method: "DELETE" }), onQueryStarted: intoTheirs }),
    };
  },
});

export const {
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  useGetMyPhotoQuery,
  useSaveMyPhotoMutation,
  useRemoveMyPhotoMutation,
  useGetPersonPhotoQuery,
  useSavePersonPhotoMutation,
  useRemovePersonPhotoMutation,
  useGetResumeQuery,
  useSaveResumeMutation,
  useRemoveResumeMutation,
} = profileApi;
