import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, CrewBody, CrewMember, CrewRole, RouteBody, TransportRoute, TransportStatus, TransportSummary, Vehicle, VehicleBody } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The school's transport (2026-11-10): vehicles, drivers and attendants, routes with their stops. Every change marks the lists and the numbers
 * on top as stale (one tag), so each page asks again once, only while it is open.
 */
export const transportApi = createApi({
  reducerPath: "transportApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Transport"],
  refetchOnMountOrArgChange: true,
  endpoints: (build) => ({
    getTransportSummary: build.query<ApiResponse<TransportSummary>, void>({ query: () => "/transport/summary", providesTags: ["Transport"] }),

    getVehicles: build.query<ApiResponse<{ items: Vehicle[] }>, { search?: string; status: TransportStatus }>({
      query: (params) => ({ url: "/transport/vehicles", params: { ...params, search: params.search || undefined } }),
      providesTags: ["Transport"],
    }),
    createVehicle: build.mutation<ApiResponse<Vehicle>, VehicleBody>({ query: (body) => ({ url: "/transport/vehicles", method: "POST", body }), invalidatesTags: ["Transport"] }),
    updateVehicle: build.mutation<ApiResponse<Vehicle>, { id: string; body: Partial<VehicleBody> }>({
      query: ({ id, body }) => ({ url: `/transport/vehicles/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Transport"],
    }),
    deleteVehicle: build.mutation<ApiResponse<null>, string>({ query: (id) => ({ url: `/transport/vehicles/${id}`, method: "DELETE" }), invalidatesTags: ["Transport"] }),

    getCrew: build.query<ApiResponse<{ items: CrewMember[] }>, { search?: string; status: TransportStatus; role: CrewRole | "all" }>({
      query: (params) => ({ url: "/transport/drivers", params: { ...params, search: params.search || undefined } }),
      providesTags: ["Transport"],
    }),
    createCrew: build.mutation<ApiResponse<CrewMember>, CrewBody>({ query: (body) => ({ url: "/transport/drivers", method: "POST", body }), invalidatesTags: ["Transport"] }),
    updateCrew: build.mutation<ApiResponse<CrewMember>, { id: string; body: Partial<CrewBody> }>({
      query: ({ id, body }) => ({ url: `/transport/drivers/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Transport"],
    }),
    deleteCrew: build.mutation<ApiResponse<null>, string>({ query: (id) => ({ url: `/transport/drivers/${id}`, method: "DELETE" }), invalidatesTags: ["Transport"] }),

    getRoutes: build.query<ApiResponse<{ items: TransportRoute[] }>, { search?: string; status: TransportStatus }>({
      query: (params) => ({ url: "/transport/routes", params: { ...params, search: params.search || undefined } }),
      providesTags: ["Transport"],
    }),
    createRoute: build.mutation<ApiResponse<TransportRoute>, RouteBody>({ query: (body) => ({ url: "/transport/routes", method: "POST", body }), invalidatesTags: ["Transport"] }),
    updateRoute: build.mutation<ApiResponse<TransportRoute>, { id: string; body: Partial<RouteBody> }>({
      query: ({ id, body }) => ({ url: `/transport/routes/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Transport"],
    }),
    deleteRoute: build.mutation<ApiResponse<null>, string>({ query: (id) => ({ url: `/transport/routes/${id}`, method: "DELETE" }), invalidatesTags: ["Transport"] }),
  }),
});

export const {
  useGetTransportSummaryQuery,
  useGetVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
  useDeleteVehicleMutation,
  useGetCrewQuery,
  useCreateCrewMutation,
  useUpdateCrewMutation,
  useDeleteCrewMutation,
  useGetRoutesQuery,
  useCreateRouteMutation,
  useUpdateRouteMutation,
  useDeleteRouteMutation,
} = transportApi;
