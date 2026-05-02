import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createImportRunCoordinator, type ImportRun } from "../../domain/imports";
import type { PlannerCustomBase, PlannerItem, Trip } from "../../domain/trip/types";
import { gmailImportProvider, projectGmailImportStateForTrip, type GmailImportState, type GmailSyncOptions } from "../../providers/gmailImportProvider";

export type GmailAutoImportStatus = GmailImportState & {
  isRunning: boolean;
  isConnecting: boolean;
  lastRun?: ImportRun;
  connect: () => void;
  disconnect: () => void;
  trigger: (options?: GmailSyncOptions) => void;
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastRun, setLastRun] = useState<ImportRun | undefined>(undefined);
  const contextRef = useRef({ activeTrip, plannerItems, customBases });
  const nextSyncOptionsRef = useRef<GmailSyncOptions>({});
  const activeTripId = activeTrip?.id;

  useEffect(() => {
    contextRef.current = { activeTrip, plannerItems, customBases };
  }, [activeTrip, customBases, plannerItems]);

  const runImport = useCallback(async () => {
    const context = contextRef.current;
    const syncOptions = nextSyncOptionsRef.current;
    nextSyncOptionsRef.current = {};
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
      }, syncOptions);
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

  const trigger = useCallback((options: GmailSyncOptions = {}) => {
    if (options.forceFullSearch) nextSyncOptionsRef.current.forceFullSearch = true;
    void coordinator.trigger();
  }, [coordinator]);

  const connect = useCallback(() => {
    setIsConnecting(true);
    void gmailImportProvider
      .connect()
      .then((next) => setState(next))
      .finally(() => setIsConnecting(false));
  }, []);

  const disconnect = useCallback(() => {
    setIsConnecting(true);
    void gmailImportProvider
      .disconnect()
      .then((next) => setState(next))
      .finally(() => setIsConnecting(false));
  }, []);

  useEffect(() => {
    setLastRun(undefined);
    setState(gmailImportProvider.getState());
  }, [activeTripId]);

  useEffect(() => {
    if (!activeTrip || !state.connected) return;
    trigger();
  }, [activeTripId, state.connected, trigger]);

  useEffect(() => {
    if (!activeTrip || !state.connected) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") trigger();
    };
    const handleOnline = () => trigger();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") trigger();
    }, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.clearInterval(interval);
    };
  }, [activeTripId, state.connected, trigger]);

  return {
    ...projectGmailImportStateForTrip(state, activeTripId),
    isRunning,
    isConnecting,
    lastRun,
    connect,
    disconnect,
    trigger,
  };
}
