import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createImportRunCoordinator, type ImportRun } from "../../domain/imports";
import type { PlannerCustomBase, PlannerItem, Trip } from "../../domain/trip/types";
import { gmailImportProvider, type GmailImportState } from "../../providers/gmailImportProvider";

export type GmailAutoImportStatus = GmailImportState & {
  isRunning: boolean;
  lastRun?: ImportRun;
  connect: () => void;
  disconnect: () => void;
  trigger: () => void;
};

export function useGmailAutoImport({
  activeTrip,
  plannerItems,
  customBases,
  setPlannerItems,
  setCustomBases,
}: {
  activeTrip?: Trip;
  plannerItems: PlannerItem[];
  customBases: PlannerCustomBase[];
  setPlannerItems: Dispatch<SetStateAction<PlannerItem[]>>;
  setCustomBases: Dispatch<SetStateAction<PlannerCustomBase[]>>;
}): GmailAutoImportStatus {
  const [state, setState] = useState<GmailImportState>(() => gmailImportProvider.getState());
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<ImportRun | undefined>(undefined);
  const contextRef = useRef({ activeTrip, plannerItems, customBases });

  useEffect(() => {
    contextRef.current = { activeTrip, plannerItems, customBases };
  }, [activeTrip, customBases, plannerItems]);

  const runImport = useCallback(async () => {
    const context = contextRef.current;
    if (!context.activeTrip || !state.connected) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    setIsRunning(true);
    try {
      const result = await gmailImportProvider.sync({
        trip: context.activeTrip,
        planner: {
          items: context.plannerItems,
          customBases: context.customBases,
        },
      });
      setState(result.state);
      setLastRun(result.run);
      if (result.planner) {
        setPlannerItems(result.planner.items);
        setCustomBases(result.planner.customBases);
      }
    } finally {
      setIsRunning(false);
    }
  }, [setCustomBases, setPlannerItems, state.connected]);

  const coordinator = useMemo(() => createImportRunCoordinator(runImport), [runImport]);

  const trigger = useCallback(() => {
    void coordinator.trigger();
  }, [coordinator]);

  const connect = useCallback(() => {
    const next = gmailImportProvider.connect();
    setState(next);
  }, []);

  const disconnect = useCallback(() => {
    const next = gmailImportProvider.disconnect();
    setState(next);
  }, []);

  useEffect(() => {
    if (!activeTrip || !state.connected) return;
    trigger();
  }, [activeTrip?.id, state.connected, trigger]);

  useEffect(() => {
    if (!activeTrip || !state.connected) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") trigger();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", trigger);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") trigger();
    }, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", trigger);
      window.clearInterval(interval);
    };
  }, [activeTrip, state.connected, trigger]);

  return {
    ...state,
    isRunning,
    lastRun,
    connect,
    disconnect,
    trigger,
  };
}

