import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, OnboardingState } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/** The server answers with the whole form: only the logo's address changes, so the boxes being typed in are not disturbed. */
async function replaceForm(_arg: unknown, { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<{ data: ApiResponse<OnboardingState> }> }) {
  try {
    const { data } = await queryFulfilled;
    dispatch(
      onboardingApi.util.updateQueryData("getOnboarding", undefined, (draft) => {
        if (draft.data) draft.data.steps[1].logoUrl = data.data.steps[1].logoUrl;
      }),
    );
  } catch {
    // The caller shows the error; the cache stays as it was.
  }
}

export const onboardingApi = createApi({
  reducerPath: "onboardingApi",
  baseQuery: baseQueryWithReauth,
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getOnboarding: build.query<ApiResponse<OnboardingState>, void>({
      query: () => "/onboarding",
    }),

    /** Saves one step (1 to 3) of the form. The server answers with the whole form, which replaces the cached one. */
    saveOnboardingStep: build.mutation<ApiResponse<OnboardingState>, { step: 1 | 2 | 3; values: unknown }>({
      query: ({ step, values }) => ({ url: `/onboarding/steps/${step}`, method: "PUT", body: values }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            onboardingApi.util.updateQueryData("getOnboarding", undefined, (draft) => {
              draft.data = data.data;
            }),
          );
        } catch {
          // The caller sees the error; the cache stays as it was.
        }
      },
    }),

    /** The school's logo saves on its own, as soon as a picture is chosen. */
    saveLogo: build.mutation<ApiResponse<OnboardingState>, FormData>({
      query: (body) => ({ url: "/onboarding/logo", method: "PUT", body }),
      onQueryStarted: replaceForm,
    }),

    removeLogo: build.mutation<ApiResponse<OnboardingState>, void>({
      query: () => ({ url: "/onboarding/logo", method: "DELETE" }),
      onQueryStarted: replaceForm,
    }),

    /** Step 4: the school confirms that everything it entered is true. */
    confirmOnboarding: build.mutation<ApiResponse<unknown>, void>({
      query: () => ({ url: "/onboarding/steps/4", method: "PUT", body: { confirmed: true } }),
    }),

    submitOnboarding: build.mutation<ApiResponse<OnboardingState>, void>({
      query: () => ({ url: "/onboarding/submit", method: "POST" }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            onboardingApi.util.updateQueryData("getOnboarding", undefined, (draft) => {
              draft.data = data.data;
            }),
          );
        } catch {
          // The caller sees the error; the cache stays as it was.
        }
      },
    }),
  }),
});

export const {
  useGetOnboardingQuery,
  useLazyGetOnboardingQuery,
  useSaveOnboardingStepMutation,
  useConfirmOnboardingMutation,
  useSubmitOnboardingMutation,
  useSaveLogoMutation,
  useRemoveLogoMutation,
} = onboardingApi;
