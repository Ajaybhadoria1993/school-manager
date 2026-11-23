import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useDebouncedValue } from "./useDebouncedValue";

/**
 * A search box whose words the SERVER searches (2026-11-22: the attendance pages): `text` is what is typed (shown at once), `search` is what to
 * ask the server: the words once the typing has stopped for `delay` ms (one request for a word, not one per key); emptying the box is not waited
 * for (everyone is back at once). The address keeps the words asked for (`?q=`), so a reload or a link opens on them.
 */
export function useAddressSearch(key = "q", delay = 300) {
  const [params, setParams] = useSearchParams();
  const q = params.get(key) ?? "";
  const [text, setText] = useState(q);
  const typed = useDebouncedValue(text.trim(), delay);
  const search = text.trim() ? typed : "";
  const latest = useRef({ q, setParams });
  useEffect(() => {
    latest.current = { q, setParams };
  });
  useEffect(() => {
    if (latest.current.q === search) return;
    latest.current.setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (search) next.set(key, search);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  }, [search, key]);
  return { text, setText, search };
}
