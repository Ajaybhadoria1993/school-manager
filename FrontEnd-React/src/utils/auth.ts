import Cookies from "js-cookie";

const ACCESS_COOKIE = "school_erp_token";
const REFRESH_COOKIE = "school_erp_refresh";
const REMEMBER_COOKIE = "school_erp_remember";
const REMEMBER_DAYS = 30;

// ---------------------------------------------------------------------------
// Token storage. Cookies (not localStorage) so every tab of the browser reads the same, current token,
// including the one a sibling tab has just refreshed. They are readable by page scripts, like any
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

/** Whether this sign-in was made with "keep me signed in". */
export function getRememberMe(): boolean {
  return Cookies.get(REMEMBER_COOKIE) === "1";
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
// Sign-out in one tab signs out the others.
// ---------------------------------------------------------------------------

const CHANNEL_NAME = "school-erp-auth";

export function broadcastLogout() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage("logout");
  channel.close();
}

/** Calls `listener` when another tab signs out. Returns the function that stops listening. */
export function onRemoteLogout(listener: () => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    if (event.data === "logout") listener();
  };
  return () => channel.close();
}
