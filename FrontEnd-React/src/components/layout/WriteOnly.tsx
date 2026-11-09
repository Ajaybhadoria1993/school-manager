import type { ReactNode } from "react";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";

/** What is inside is a button that changes something: not shown while a year that is over is open (it is only read then). */
export function WriteOnly({ children }: { children: ReactNode }) {
  return useReadOnlyYear() ? null : <>{children}</>;
}
