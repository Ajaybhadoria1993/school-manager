import { useEffect, useState } from "react";

/** The current time, taken once and again whenever `refreshOn` changes (for example when fresh data arrives). */
export function useNow(refreshOn?: unknown) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (refreshOn !== undefined) setNow(Date.now());
  }, [refreshOn]);
  return now;
}
