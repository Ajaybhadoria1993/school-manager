import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { mediumChanged } from "../redux/slices/mediumSlice";

/**
 * The mediums a person can move between and which one is open (backend: tenants/services/medium.service.ts): all of the school's for its
 * administrator, the ones they teach in for a teacher. A school with one medium has nothing to switch, and everyone else simply works on the
 * medium their login belongs to.
 */
export function useMedium() {
  const dispatch = useAppDispatch();
  const mediumId = useAppSelector((state) => state.medium.mediumId);
  const role = useAppSelector((state) => state.auth.user?.role);
  const sides = useAppSelector((state) => state.auth.tenant?.mediums);
  const isAdmin = role === "school_admin";
  const mediums = (isAdmin || role === "teacher") && sides && sides.length > 1 ? sides : [];
  const first = mediums[0] ?? null;
  const current = mediums.find((m) => m.id === mediumId) ?? first;

  // A medium remembered by the tab that this school does not have (another school's, one that is gone): forgotten once the school is known.
  const known = !!sides;
  const stale = !!mediumId && known && !mediums.some((m) => m.id === mediumId);
  useEffect(() => {
    if (stale) dispatch(mediumChanged(null));
  }, [stale, dispatch]);

  // The first medium is the school's own record, so it needs no naming.
  const firstId = first?.id;
  const choose = useCallback((id: string) => dispatch(mediumChanged(id === firstId ? null : id)), [dispatch, firstId]);

  return { mediums, current, choose, isAdmin };
}
