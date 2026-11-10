import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, PermissionProfile, PermissionsOverview } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/** What each kind of person of the school (Receptionist, Teacher, Parent...) may do: the Permissions page. */
export const permissionsApi = createApi({
  reducerPath: "permissionsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Permissions"],
  refetchOnMountOrArgChange: true,
  endpoints: (build) => ({
    getPermissions: build.query<ApiResponse<PermissionsOverview>, void>({
      query: () => "/permissions",
      providesTags: ["Permissions"],
    }),
    // One kind at a time: the list ticked (the server adds what each needs and answers with the saved list).
    savePermissions: build.mutation<ApiResponse<PermissionProfile>, { profile: string; permissions: string[] }>({
      query: ({ profile, permissions }) => ({ url: `/permissions/${profile}`, method: "PUT", body: { permissions } }),
      invalidatesTags: ["Permissions"],
    }),
    // Back to the usual list of that kind.
    resetPermissions: build.mutation<ApiResponse<PermissionProfile>, string>({
      query: (profile) => ({ url: `/permissions/${profile}`, method: "DELETE" }),
      invalidatesTags: ["Permissions"],
    }),
  }),
});

export const { useGetPermissionsQuery, useSavePermissionsMutation, useResetPermissionsMutation } = permissionsApi;
