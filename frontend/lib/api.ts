import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

const ACCESS_COOKIE = "school_erp_token";
const REFRESH_COOKIE = "school_erp_refresh";
const REMEMBER_COOKIE = "school_erp_remember";
const REMEMBER_DAYS = 30;

// ---------------------------------------------------------------------------
// Token storage. Cookies (not localStorage) so the server component at "/" can
// see that someone is signed in. They are readable by page scripts, like any
// browser-stored token, so never render untrusted HTML.
// ---------------------------------------------------------------------------

function cookieOptions(remember: boolean): Cookies.CookieAttributes {
  return {
    sameSite: "lax",
    secure: typeof window !== "undefined" && window.location.protocol === "https:",
    // "Remember me" off => session cookies that vanish when the browser closes.
    ...(remember ? { expires: REMEMBER_DAYS } : {}),
  };
}

export function getToken(): string | undefined {
  return Cookies.get(ACCESS_COOKIE);
}

export function getRefreshToken(): string | undefined {
  return Cookies.get(REFRESH_COOKIE);
}

export function setTokens(accessToken: string, refreshToken: string, remember = true) {
  const options = cookieOptions(remember);
  Cookies.set(ACCESS_COOKIE, accessToken, options);
  Cookies.set(REFRESH_COOKIE, refreshToken, options);
  Cookies.set(REMEMBER_COOKIE, remember ? "1" : "0", options);
}

export function clearTokens() {
  Cookies.remove(ACCESS_COOKIE);
  Cookies.remove(REFRESH_COOKIE);
  Cookies.remove(REMEMBER_COOKIE);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ApiRequestError extends Error {
  status: number;
  details?: unknown;
  /** Stable machine-readable id from the API (e.g. "RESET_INVALID"); branch on this, not on `message`. */
  code?: string;
  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";

// ---------------------------------------------------------------------------
// Session end notifications: the auth provider listens and sends the user to /login.
// ---------------------------------------------------------------------------

export type SessionEndReason = "expired" | "disabled" | "suspended";
const sessionListeners = new Set<(reason: SessionEndReason) => void>();

export function onSessionEnded(listener: (reason: SessionEndReason) => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function endSession(reason: SessionEndReason) {
  clearTokens();
  sessionListeners.forEach((listener) => listener(reason));
}

// ---------------------------------------------------------------------------
// Silent token refresh
//
// The API keeps one session per browser and rotates the refresh token on every
// use, so two refreshes at once would log the loser out. Within a tab, requests
// share one in-flight refresh; across tabs, a Web Lock makes them take turns, and
// a tab that waited re-reads the cookie and adopts the token the other tab just got.
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
    });
  } catch {
    return "transient"; // offline or server down: not proof the session is invalid
  }

  if (res.status === 401 || res.status === 403) return "rejected";
  if (!res.ok) return "transient";

  const json = await res.json().catch(() => null);
  const data = json?.data;
  if (!data?.accessToken || !data?.refreshToken) return "transient";

  setTokens(data.accessToken, data.refreshToken, Cookies.get(REMEMBER_COOKIE) === "1");
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
        ? await navigator.locks.request("school-erp-refresh", run)
        : await run();
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  /** For login, refresh, logout, forgot/reset password: a 401 there is an answer, not an expired session. */
  skipAuthRefresh?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }

  const send = async (token: string | undefined): Promise<Response> => {
    try {
      return await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
      });
    } catch {
      throw new ApiRequestError(0, NETWORK_MESSAGE, undefined, "NETWORK_ERROR");
    }
  };

  let usedToken = getToken();
  let res = await send(usedToken);

  if (res.status === 401 && !options.skipAuthRefresh && (usedToken || getRefreshToken())) {
    const outcome = await refreshSession(usedToken);
    if (outcome === "ok") {
      usedToken = getToken();
      res = await send(usedToken);
    } else if (outcome === "rejected") {
      endSession("expired");
    }
    // "transient": keep the session, surface the original error; the next request retries.
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok || json.success === false) {
    const error = new ApiRequestError(res.status, json.message ?? "Something went wrong", json.details, json.code);
    // Only a disabled account or a suspended school ends a session on 403. Any other 403 just means "not allowed here".
    if (
      res.status === 403 &&
      (error.code === "ACCOUNT_DISABLED" || error.code === "TENANT_INACTIVE") &&
      usedToken &&
      !options.skipAuthRefresh
    ) {
      endSession(error.code === "TENANT_INACTIVE" ? "suspended" : "disabled");
    }
    throw error;
  }

  return json as T;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions["params"]) => apiFetch<T>(path, { method: "GET", params }),
  post: <T>(path: string, body?: unknown, options?: Pick<RequestOptions, "skipAuthRefresh">) =>
    apiFetch<T>(path, { method: "POST", body, ...options }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
