import {
  fetchBaseQuery,
  type BaseQueryApi,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { clearTokens, getRefreshToken, getRememberMe, getToken, setTokens } from "../../utils/auth";
import type { ApiResponse, SessionEndReason } from "../../types";
import { sessionEnded } from "../slices/authSlice";

/** "/api/v1" in development (the Vite dev server forwards it to the backend); a full URL in production. */
export const API_URL: string = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/+$/, "");

/** Options an endpoint can pass as `extraOptions`. */
export interface AuthExtraOptions {
  /** For login, refresh, logout, forgot/reset password: a 401 there is an answer, not an expired session. */
  skipAuthRefresh?: boolean;
}

const REFRESH_LOCK_NAME = "school-erp-refresh";
const REFRESH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Silent token refresh
//
// The access token is short-lived. When a request comes back 401 we swap the refresh token for a new pair and
// send the SAME request again, so the person never notices the expiry.
//
// The API keeps one session per browser and rotates the refresh token on every use, so two refreshes at once
// would log the loser out. Within a tab, requests share one in-flight refresh; across tabs, a Web Lock makes them
// take turns, and a tab that waited re-reads the cookie and adopts the token the other tab just got.
// ---------------------------------------------------------------------------

type RefreshOutcome = "ok" | "rejected" | "transient";

let inFlightRefresh: Promise<RefreshOutcome> | null = null;

async function callRefreshEndpoint(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return "rejected";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch {
    return "transient"; // offline, server down or too slow: not proof the session is invalid
  }

  if (res.status === 401 || res.status === 403) return "rejected";
  if (!res.ok) return "transient";

  const json = (await res.json().catch(() => null)) as ApiResponse<{ accessToken?: string; refreshToken?: string }> | null;
  const data = json?.data;
  if (!data?.accessToken || !data?.refreshToken) return "transient";

  setTokens(data.accessToken, data.refreshToken, getRememberMe());
  return "ok";
}

function refreshSession(failedAccessToken: string | undefined): Promise<RefreshOutcome> {
  inFlightRefresh ??= (async () => {
    const run = async (): Promise<RefreshOutcome> => {
      const current = getToken();
      if (current && current !== failedAccessToken) return "ok"; // someone already refreshed
      return callRefreshEndpoint();
    };
    try {
      return typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request(REFRESH_LOCK_NAME, run)
        : await run();
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

function endSession(api: BaseQueryApi, reason: SessionEndReason) {
  clearTokens();
  api.dispatch(sessionEnded(reason));
}

// ---------------------------------------------------------------------------
// The base query every API slice is built on
// ---------------------------------------------------------------------------

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  cache: "no-store",
  // Read on every request, so a token that was just refreshed (here or in another tab) is used straight away.
  prepareHeaders: (headers) => {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, AuthExtraOptions> = async (
  args,
  api,
  extraOptions,
) => {
  const skipAuthRefresh = extraOptions?.skipAuthRefresh === true;

  // A refresh is under way: wait for it, so this request goes out with the new token instead of failing first.
  if (!skipAuthRefresh && inFlightRefresh) await inFlightRefresh;

  const usedToken = getToken();
  let result = await rawBaseQuery(args, api, extraOptions ?? {});

  if (result.error?.status === 401 && !skipAuthRefresh && (usedToken || getRefreshToken())) {
    const outcome = await refreshSession(usedToken);
    if (outcome === "ok") {
      result = await rawBaseQuery(args, api, extraOptions ?? {}); // the same request, now with the new token
    } else if (outcome === "rejected") {
      endSession(api, "expired");
    }
    // "transient": keep the session, surface the original error; the next request retries.
  }

  // Only a disabled account or a suspended school ends a session on 403. Any other 403 just means "not allowed here".
  if (result.error?.status === 403 && !skipAuthRefresh && usedToken) {
    const code = (result.error.data as { code?: string } | undefined)?.code;
    if (code === "ACCOUNT_DISABLED" || code === "TENANT_INACTIVE") {
      endSession(api, code === "TENANT_INACTIVE" ? "suspended" : "disabled");
    }
  }

  // The API answers failures with an error status; a 2xx that says `success: false` is treated as one too.
  if (!result.error && (result.data as { success?: boolean } | undefined)?.success === false) {
    return { error: { status: result.meta?.response?.status ?? 500, data: result.data }, meta: result.meta };
  }

  return result;
};
