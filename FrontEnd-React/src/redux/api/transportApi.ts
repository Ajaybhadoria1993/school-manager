import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, CrewBody, CrewMember, CrewRole, DriverSession, LiveTracking, RouteBody, RouteRiders, StudentChoice, TransportRoute, TransportStatus, TransportSummary, Vehicle, VehicleBody } from "../../types";
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

    /** The driver's private link for a vehicle. The link comes back once; making a new one replaces the old. */
    issueTrackingKey: build.mutation<ApiResponse<{ key: string }>, string>({ query: (id) => ({ url: `/transport/vehicles/${id}/tracking-key`, method: "POST" }), invalidatesTags: ["Transport"] }),
    revokeTrackingKey: build.mutation<ApiResponse<null>, string>({ query: (id) => ({ url: `/transport/vehicles/${id}/tracking-key`, method: "DELETE" }), invalidatesTags: ["Transport"] }),
    /** Every vehicle with a driver link and its last position; the socket brings each new one after this. */
    getLiveTracking: build.query<ApiResponse<LiveTracking>, void>({ query: () => "/transport/tracking/live", providesTags: ["Transport"] }),

    // The driver's phone has no sign-in: the private link goes in X-Tracking-Link (the Authorization header is a signed-in person's own), and a 401
    // is an answer ("this link is no longer valid"), not an expired session.
    driverSession: build.mutation<ApiResponse<DriverSession>, string>({
      query: (link) => ({ url: "/transport/tracking/session", method: "POST", headers: { "X-Tracking-Link": link } }),
      extraOptions: { skipAuthRefresh: true },
    }),
    driverPing: build.mutation<ApiResponse<null>, { link: string; position: { lat: number; lng: number; speedKmph: number | null; heading: number | null; accuracy: number | null } }>({
      query: ({ link, position }) => ({ url: "/transport/tracking/ping", method: "POST", headers: { "X-Tracking-Link": link }, body: position }),
      extraOptions: { skipAuthRefresh: true },
    }),
    driverStop: build.mutation<ApiResponse<null>, string>({
      query: (link) => ({ url: "/transport/tracking/stop", method: "POST", headers: { "X-Tracking-Link": link } }),
      extraOptions: { skipAuthRefresh: true },
    }),

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

    /** The students of a route (who, which class, which stop). Adding or taking off one makes the routes' counts stale too. */
    getRouteRiders: build.query<ApiResponse<RouteRiders>, string>({ query: (id) => `/transport/routes/${id}/riders`, providesTags: ["Transport"] }),
    addRider: build.mutation<ApiResponse<RouteRiders>, { routeId: string; studentId: string; stopName: string }>({
      query: ({ routeId, ...body }) => ({ url: `/transport/routes/${routeId}/riders`, method: "POST", body }),
      invalidatesTags: ["Transport"],
    }),
    removeRider: build.mutation<ApiResponse<RouteRiders>, { routeId: string; studentId: string }>({
      query: ({ routeId, studentId }) => ({ url: `/transport/routes/${routeId}/riders/${studentId}`, method: "DELETE" }),
      invalidatesTags: ["Transport"],
    }),
    /** Students to choose from, by what is typed (a name or an admission number). */
    searchRiderStudents: build.query<ApiResponse<{ items: StudentChoice[] }>, string>({ query: (q) => ({ url: "/transport/students/search", params: { q } }) }),
  }),
});

export const {
  useGetTransportSummaryQuery,
  useGetVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
  useDeleteVehicleMutation,
  useIssueTrackingKeyMutation,
  useRevokeTrackingKeyMutation,
  useGetLiveTrackingQuery,
  useDriverSessionMutation,
  useDriverPingMutation,
  useDriverStopMutation,
  useGetCrewQuery,
  useCreateCrewMutation,
  useUpdateCrewMutation,
  useDeleteCrewMutation,
  useGetRoutesQuery,
  useCreateRouteMutation,
  useUpdateRouteMutation,
  useDeleteRouteMutation,
  useGetRouteRidersQuery,
  useAddRiderMutation,
  useRemoveRiderMutation,
  useSearchRiderStudentsQuery,
} = transportApi;
