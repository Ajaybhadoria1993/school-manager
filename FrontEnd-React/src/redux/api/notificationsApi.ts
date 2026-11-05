import { createApi } from "@reduxjs/toolkit/query/react";
import type { ApiResponse, NotificationItem, NotificationPage } from "../../types";
import { baseQueryWithReauth } from "./baseQueryWithReauth";

/**
 * The signed-in person's bell (docs/notifications.md). One read when the app opens (the newest page and the unread count); after that new
 * ones come on the socket (hooks/useLiveNotifications.ts) and are put into this cache, so the bell never polls. Reading changes the cache
 * at once and is not read back.
 */
export const notificationsApi = createApi({
  reducerPath: "notificationsApi",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Notifications"],
  endpoints: (build) => ({
    getNotifications: build.query<ApiResponse<NotificationPage>, void>({
      query: () => ({ url: "/notifications", params: { limit: 20 } }),
      providesTags: ["Notifications"],
    }),
    /** An older page, for Show older (kept by the bell itself, not cached). */
    getOlderNotifications: build.query<ApiResponse<NotificationPage>, string>({
      query: (before) => ({ url: "/notifications", params: { limit: 20, before } }),
      keepUnusedDataFor: 0,
    }),
    readNotification: build.mutation<ApiResponse<{ unread: number }>, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: "POST" }),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          notificationsApi.util.updateQueryData("getNotifications", undefined, (draft) => {
            const found = draft.data.items.find((n) => n.id === id);
            if (found && !found.readAt) {
              found.readAt = new Date().toISOString();
              draft.data.unread = Math.max(0, draft.data.unread - 1);
            }
          })
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(setUnread(data.data.unread));
        } catch {
          patch.undo();
        }
      },
    }),
    readAllNotifications: build.mutation<ApiResponse<{ unread: number }>, void>({
      query: () => ({ url: "/notifications/read-all", method: "POST" }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const patch = dispatch(setUnread(0));
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
  }),
});

/** The unread count the server gave (none unread: every line in the cache is read). */
export function setUnread(unread: number, readId?: string) {
  return notificationsApi.util.updateQueryData("getNotifications", undefined, (draft) => {
    draft.data.unread = unread;
    const now = new Date().toISOString();
    for (const n of draft.data.items) if (!n.readAt && (unread === 0 || n.id === readId)) n.readAt = now;
  });
}

/** A notification that just came on the socket goes on top (once, even if it also came in a read). */
export function addLive(item: NotificationItem) {
  return notificationsApi.util.updateQueryData("getNotifications", undefined, (draft) => {
    if (draft.data.items.some((n) => n.id === item.id)) return;
    draft.data.items.unshift(item);
    if (!item.readAt) draft.data.unread += 1;
  });
}

export const { useGetNotificationsQuery, useLazyGetOlderNotificationsQuery, useReadNotificationMutation, useReadAllNotificationsMutation } = notificationsApi;
