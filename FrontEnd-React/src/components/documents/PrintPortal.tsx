import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./documents.css";

/**
 * Prints what it is given: while it is on screen it puts a copy of its children straight under <body> (the stylesheet hides everything else while
 * printing), opens the browser's print window, and tells its owner when that window is closed (`onDone`), so the copy goes. It is rendered only when
 * the person has pressed Print, so the screen never shows the documents twice. The browser's print window can also save them as a PDF.
 */
export function PrintPortal({ children, onDone }: { children: ReactNode; onDone: () => void }) {
  useEffect(() => {
    window.addEventListener("afterprint", onDone);
    // After this render has reached the page: the print window shows what is there when it opens.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", onDone);
    };
  }, [onDone]);
  return createPortal(<div className="print-root">{children}</div>, document.body);
}
