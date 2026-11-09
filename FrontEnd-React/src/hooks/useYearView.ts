import { useCallback, useEffect } from "react";
import { useGetAcademicYearsQuery } from "../redux/api/academicsApi";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { yearViewChanged } from "../redux/slices/yearViewSlice";
import type { AcademicYear } from "../types";

/** Who may open a year that is over: the people who run the school. */
const LOOKERS = ["school_admin", "principal"];

/**
 * Looking at a past academic year (backend: academics/services/viewedYear.ts). Which year the school admin has open lives in the store
 * (redux/slices/yearViewSlice.ts); this reads it next to the school's years, so the top bar's picker and the bar that says "Viewing ..."
 * agree. The list of years is one cached read; a person who cannot look at past years never asks for it.
 */
export function useYearView() {
  const dispatch = useAppDispatch();
  const role = useAppSelector((state) => state.auth.user?.role);
  const signedIn = useAppSelector((state) => state.auth.user !== null);
  const yearId = useAppSelector((state) => state.yearView.yearId);
  const canLook = !!role && LOOKERS.includes(role);
  const { data } = useGetAcademicYearsQuery(undefined, { skip: !canLook });

  const years: AcademicYear[] = data?.data ?? [];
  const running = years.find((y) => y.status === "active") ?? null;
  const over = years.filter((y) => y.status === "closed");
  const viewing = over.find((y) => y.id === yearId) ?? null;

  // A year remembered by the tab that is not one of this school's years that are over (another school, a year that waits): forgotten
  // once the school's years are known. Someone who cannot look at past years never has one open.
  const known = !!data;
  useEffect(() => {
    if (yearId && ((canLook && known && !viewing) || (signedIn && !canLook))) dispatch(yearViewChanged(null));
  }, [yearId, canLook, signedIn, known, viewing, dispatch]);

  const choose = useCallback((id: string | null) => dispatch(yearViewChanged(id)), [dispatch]);

  return {
    canLook,
    /** The running year, or null. */
    running,
    /** The year that is open (a year that is over), or null when the running year is. */
    viewing,
    /** Every year that has started, newest first: what the picker offers (a year that waits is not one to look at). */
    offered: years.filter((y) => y.status !== "pending"),
    /** The school has a year that is over: only then is there anything to pick. */
    hasPast: over.length > 0,
    choose,
  };
}
