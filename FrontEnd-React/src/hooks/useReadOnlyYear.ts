import { useAppSelector } from "../redux/hooks";

/**
 * True while a year that is over is open (hooks/useYearView.ts): nothing is changed then, so a page does not offer what would change
 * something (the server refuses it too, `YEAR_READ_ONLY`). Read straight from the store, so it needs no request.
 */
export function useReadOnlyYear(): boolean {
  return useAppSelector((state) => state.yearView.yearId !== null);
}
