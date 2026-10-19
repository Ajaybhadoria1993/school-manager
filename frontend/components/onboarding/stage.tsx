"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Which of the five stages (four steps, then verification) the school admin is looking at.
 * The page decides; the side panel in the layout reads it to change its headline.
 */
const StageContext = createContext<{ stage: number; setStage: (stage: number) => void }>({
  stage: 1,
  setStage: () => {},
});

export function StageProvider({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState(1);
  const value = useMemo(() => ({ stage, setStage }), [stage]);
  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStage() {
  return useContext(StageContext).stage;
}

/** Call from a screen to say which stage it shows. */
export function useReportStage(stage: number) {
  const { setStage } = useContext(StageContext);
  useEffect(() => setStage(stage), [stage, setStage]);
}
