import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, NamedRoleChoice, PermissionProfile, PermissionsOverview } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/** What each kind of person of the school (Receptionist, Teacher, Parent, a role the school made...) may do: the Permissions page. */
export const permissionsApi = createApi({
  reducerPath: "permissionsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Permissions", "RoleChoices"],
  refetchOnMountOrArgChange: true,
  endpoints: (build) => ({
    getPermissions: build.query<ApiResponse<PermissionsOverview>, void>({
      query: () => "/permissions",
      providesTags: ["Permissions"],
    }),
    // One kind at a time: the list ticked (the server adds what each needs and answers with the saved list).
    // A role the school named is "other:<name>": the key goes in the address encoded.
    savePermissions: build.mutation<ApiResponse<PermissionProfile>, { profile: string; permissions: string[] }>({
      query: ({ profile, permissions }) => ({ url: `/permissions/${encodeURIComponent(profile)}`, method: "PUT", body: { permissions } }),
      invalidatesTags: ["Permissions"],
    }),
    // Back to the usual list of that kind.
    resetPermissions: build.mutation<ApiResponse<PermissionProfile>, string>({
      query: (profile) => ({ url: `/permissions/${encodeURIComponent(profile)}`, method: "DELETE" }),
      invalidatesTags: ["Permissions"],
    }),
    // The roles the school named (2026-11-26): Add staff's Role list.
    getRoleChoices: build.query<ApiResponse<{ items: NamedRoleChoice[] }>, void>({
      query: () => "/permissions/roles",
      providesTags: ["RoleChoices"],
    }),
    // The school admin makes a role with its name; it answers as a kind of the page.
    createRole: build.mutation<ApiResponse<PermissionProfile>, { name: string }>({
      query: (body) => ({ url: "/permissions/roles", method: "POST", body }),
      invalidatesTags: ["Permissions", "RoleChoices"],
    }),
    // ...and deletes one it made while nobody has it.
    deleteRole: build.mutation<ApiResponse<{ key: string }>, string>({
      query: (profile) => ({ url: `/permissions/roles/${encodeURIComponent(profile)}`, method: "DELETE" }),
      invalidatesTags: ["Permissions", "RoleChoices"],
    }),
  }),
});

export const { useGetPermissionsQuery, useSavePermissionsMutation, useResetPermissionsMutation, useGetRoleChoicesQuery, useCreateRoleMutation, useDeleteRoleMutation } = permissionsApi;
