import { useEffect, useRef } from "react";

type TimingSample = {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
};

type LbtPerformanceMetrics = {
  renders: Record<string, number>;
  timings: Record<string, TimingSample>;
  counters: Record<string, number>;
  reset: () => void;
  snapshot: () => {
    renders: Record<string, number>;
    timings: Record<string, TimingSample>;
    counters: Record<string, number>;
  };
};

declare global {
  interface Window {
    __LBT_PERF__?: LbtPerformanceMetrics;
  }
}

function performanceAuditEnabled() {
  const viteEnv = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (!viteEnv?.DEV || typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem("lbt-performance-audit") === "1";
  } catch {
    return false;
  }
}

function createMetrics(): LbtPerformanceMetrics {
  const metrics: LbtPerformanceMetrics = {
    renders: {},
    timings: {},
    counters: {},
    reset: () => {
      metrics.renders = {};
      metrics.timings = {};
      metrics.counters = {};
    },
    snapshot: () => ({
      renders: { ...metrics.renders },
      timings: Object.fromEntries(
        Object.entries(metrics.timings).map(([name, sample]) => [name, { ...sample }]),
      ),
      counters: { ...metrics.counters },
    }),
  };

  return metrics;
}

function metrics() {
  if (!performanceAuditEnabled()) return undefined;
  window.__LBT_PERF__ ??= createMetrics();
  return window.__LBT_PERF__;
}

export function RenderMetric({ name }: { name: string }) {
  useRenderMetric(name);
  return null;
}

export function useRenderMetric(name: string) {
  const renders = useRef(0);
  renders.current += 1;

  useEffect(() => {
    const currentMetrics = metrics();
    if (!currentMetrics) return;
    currentMetrics.renders[name] = (currentMetrics.renders[name] ?? 0) + 1;
  });
}

export async function measurePerformance<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (!performanceAuditEnabled()) return action();

  const startedAt = window.performance.now();
  try {
    return await action();
  } finally {
    const durationMs = window.performance.now() - startedAt;
    const currentMetrics = metrics();
    if (currentMetrics) {
      const previous = currentMetrics.timings[name];
      currentMetrics.timings[name] = previous
        ? {
            count: previous.count + 1,
            totalMs: previous.totalMs + durationMs,
            minMs: Math.min(previous.minMs, durationMs),
            maxMs: Math.max(previous.maxMs, durationMs),
            lastMs: durationMs,
          }
        : {
            count: 1,
            totalMs: durationMs,
            minMs: durationMs,
            maxMs: durationMs,
            lastMs: durationMs,
      };
    }
  }
}

export function recordPerformanceTiming(name: string, durationMs: number) {
  const currentMetrics = metrics();
  if (!currentMetrics) return;

  const previous = currentMetrics.timings[name];
  currentMetrics.timings[name] = previous
    ? {
        count: previous.count + 1,
        totalMs: previous.totalMs + durationMs,
        minMs: Math.min(previous.minMs, durationMs),
        maxMs: Math.max(previous.maxMs, durationMs),
        lastMs: durationMs,
      }
    : {
        count: 1,
        totalMs: durationMs,
        minMs: durationMs,
        maxMs: durationMs,
        lastMs: durationMs,
      };
}

export function measureSyncPerformance<T>(name: string, action: () => T): T {
  if (!performanceAuditEnabled()) return action();

  const startedAt = window.performance.now();
  try {
    return action();
  } finally {
    recordPerformanceTiming(name, window.performance.now() - startedAt);
  }
}

export function incrementPerformanceCounter(name: string, amount = 1) {
  const currentMetrics = metrics();
  if (!currentMetrics) return;

  currentMetrics.counters[name] = (currentMetrics.counters[name] ?? 0) + amount;
}
