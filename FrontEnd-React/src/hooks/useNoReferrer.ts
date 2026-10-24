import { useEffect } from "react";

/**
 * Pages that open from an emailed link carry a one-time token in the address. While one of them is shown,
 * ask the browser never to send the address on as a Referer (the Next.js version did this with a response header).
 */
export function useNoReferrer() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}
