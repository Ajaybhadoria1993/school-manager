import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * Where the school admin is in the sign-up form. The page (the wizard, or the waiting screen) decides; the frame around it (the side
 * panel's list of steps and the card at the top) reads it, so both always say the same thing.
 */
export interface OnboardingProgress {
  /** The screen that is open (1 to 5); one more once the form has been sent, when everything is done. */
  active: number;
  /** The screens that are done. */
  done: number[];
  /** The furthest screen that may be opened by pressing it in the list. */
  reachable: number;
  /** Opens a screen; without it the list is only a picture (the waiting screen). */
  onSelect?: (stage: number) => void;
  /** Replaces the line under the heading of the top card for this screen (Class Sections names its range). */
  subtitle?: string;
}

const START: OnboardingProgress = { active: 1, done: [], reachable: 1 };

/**
 * Two places in the frame where a screen may put its own controls, next to the heading card: `below` is under the card (Class Sections
 * puts the academic year and the class range there) and `side` is at the right, under the handwritten line (Quick Fill). They are empty
 * elements the frame draws; a screen fills one with a portal while it is open. Without a frame (a test) they are null.
 */
export interface HeaderSlots {
  below: HTMLElement | null;
  side: HTMLElement | null;
}

const StageContext = createContext<{
  progress: OnboardingProgress;
  setProgress: (progress: OnboardingProgress) => void;
  slots: HeaderSlots;
  setSlot: (name: keyof HeaderSlots, element: HTMLElement | null) => void;
}>({
  progress: START,
  setProgress: () => {},
  slots: { below: null, side: null },
  setSlot: () => {},
});

export function StageProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<OnboardingProgress>(START);
  const [slots, setSlots] = useState<HeaderSlots>({ below: null, side: null });
  // Stable: a ref callback that changed every render would be called with null and then the element again, forever.
  const setSlot = useCallback((name: keyof HeaderSlots, element: HTMLElement | null) => setSlots((current) => (current[name] === element ? current : { ...current, [name]: element })), []);
  const value = useMemo(() => ({ progress, setProgress, slots, setSlot }), [progress, slots, setSlot]);
  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useProgress(): OnboardingProgress {
  return useContext(StageContext).progress;
}

/** The places in the frame a screen may fill (see `HeaderSlots`). */
export function useHeaderSlots(): HeaderSlots {
  return useContext(StageContext).slots;
}

/** For the frame: the ref callback of one of the two places. */
export function useSlotRef(name: keyof HeaderSlots) {
  const { setSlot } = useContext(StageContext);
  return useCallback((element: HTMLElement | null) => setSlot(name, element), [name, setSlot]);
}

/** Call from the page to say where the school is. Handlers may change on every render; the frame is only told when what it draws changes. */
export function useReportProgress(next: OnboardingProgress) {
  const { setProgress } = useContext(StageContext);
  const latest = useRef(next);
  latest.current = next;
  const hasSelect = !!next.onSelect;
  const shown = JSON.stringify([next.active, next.done, next.reachable, next.subtitle ?? "", hasSelect]);
  useEffect(() => {
    const { onSelect: _onSelect, ...rest } = latest.current;
    setProgress({ ...rest, ...(hasSelect ? { onSelect: (stage: number) => latest.current.onSelect?.(stage) } : {}) });
  }, [shown, hasSelect, setProgress]);
}
