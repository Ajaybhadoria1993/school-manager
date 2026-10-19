"use client";

import { useSyncExternalStore } from "react";

const KEY = "edushiksha_sidebar_collapsed";
const listeners = new Set<() => void>();
// Used when the browser will not let us store anything (private window, blocked site data).
let memory = false;

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return memory;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Whether the desktop sidebar is folded to icons. It is remembered on this device. */
export function useSidebarCollapsed(): [boolean, (value: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const set = (value: boolean) => {
    memory = value;
    try {
      localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      // keep the in-memory value
    }
    listeners.forEach((l) => l());
  };
  return [collapsed, set];
}
