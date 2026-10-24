import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, InviteInfo, MePayload, SessionPayload } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

// For these, a 401 is the answer to the request (wrong password, bad token), not an expired session.
const ANSWER_ON_401 = { skipAuthRefresh: true } as const;

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: baseQueryWithReauth,
  refetchOnMountOrArgChange: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getMe: build.query<ApiResponse<MePayload>, void>({
      query: () => "/auth/me",
    }),

    login: build.mutation<ApiResponse<SessionPayload>, { email: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      extraOptions: ANSWER_ON_401,
    }),

    logout: build.mutation<ApiResponse<unknown>, { refreshToken: string }>({
      query: (body) => ({ url: "/auth/logout", method: "POST", body }),
      extraOptions: ANSWER_ON_401,
    }),

    signup: build.mutation<ApiResponse<{ ttlHours?: number }>, { schoolName: string; email: string }>({
      query: (body) => ({ url: "/auth/signup", method: "POST", body }),
      extraOptions: ANSWER_ON_401,
    }),

    forgotPassword: build.mutation<ApiResponse<{ ttlMinutes?: number }>, { email: string }>({
      query: (body) => ({ url: "/auth/forgot-password", method: "POST", body }),
      extraOptions: ANSWER_ON_401,
    }),

    resetPassword: build.mutation<ApiResponse<SessionPayload>, { token: string | null; newPassword: string }>({
      query: (body) => ({ url: "/auth/reset-password", method: "POST", body }),
      extraOptions: ANSWER_ON_401,
    }),

    // POST, so the one-time token travels in the body and never lands in a server's access log.
    checkInvite: build.mutation<ApiResponse<InviteInfo>, { token: string }>({
      query: (body) => ({ url: "/auth/invite/check", method: "POST", body }),
      extraOptions: ANSWER_ON_401,
    }),

    acceptInvite: build.mutation<ApiResponse<SessionPayload>, { token: string; name: string; password: string }>({
      query: (body) => ({ url: "/auth/accept-invite", method: "POST", body }),
      extraOptions: ANSWER_ON_401,
    }),
  }),
});

export const {
  useSignupMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useCheckInviteMutation,
  useAcceptInviteMutation,
} = authApi;
