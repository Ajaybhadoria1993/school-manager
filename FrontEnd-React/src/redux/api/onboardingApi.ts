import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, OnboardingState } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

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
} = onboardingApi;
