"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

import type { AgentInspectorTab } from "@/components/dashboard/agent/types";
import type { DashboardIconMode } from "@/components/dashboard/DashboardIconBar";
import type { LinkedObjectSummary } from "@/lib/core-linkage/contracts";

export type LinkedObjectNavigationTarget =
  | { type: "plan"; id: number }
  | { type: "checklist"; id: number }
  | { type: "schedule"; id: number; date: string }
  | { type: "timeline"; id: number; date: string };

export type LinkedObjectNavigationDestination =
  | {
      activeInspectorTab: AgentInspectorTab;
      activeMode: "agent";
      panelOpen: true;
      target: Extract<LinkedObjectNavigationTarget, { type: "plan" }>;
    }
  | {
      activeMode: "checklist";
      target: Extract<LinkedObjectNavigationTarget, { type: "checklist" }>;
    }
  | {
      activeMode: "schedule";
      month: string;
      target: Extract<LinkedObjectNavigationTarget, { type: "schedule" }>;
    }
  | {
      activeMode: "timeline";
      month: string;
      target: Extract<LinkedObjectNavigationTarget, { type: "timeline" }>;
    };

type LinkedObjectSummarySelectHandler = (
  summary: LinkedObjectSummary,
) => void;

type LinkedObjectNavigationProviderProps = {
  children: ReactNode;
  onNavigate: (target: LinkedObjectNavigationTarget) => void;
};

type FocusDelayHandle = number | ReturnType<typeof setTimeout>;

type FocusRuntime = {
  cancelFrame: (handle: number) => void;
  clearDelay: (handle: FocusDelayHandle) => void;
  requestFrame: (callback: () => void) => number;
  setDelay: (
    callback: () => void,
    delayMs: number,
  ) => FocusDelayHandle;
};

const LinkedObjectNavigationContext =
  createContext<LinkedObjectSummarySelectHandler | undefined>(undefined);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isNormalizedDate = (value: unknown): value is string => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
};

export function toLinkedObjectNavigationTarget(
  summary: unknown,
): LinkedObjectNavigationTarget | null {
  if (
    !isRecord(summary) ||
    !isPositiveInteger(summary.id) ||
    !isNonEmptyString(summary.title)
  ) {
    return null;
  }

  if (summary.type === "plan" || summary.type === "checklist") {
    return { id: summary.id, type: summary.type };
  }

  if (
    (summary.type === "schedule" || summary.type === "timeline") &&
    isNormalizedDate(summary.date) &&
    (summary.status === null || typeof summary.status === "string")
  ) {
    return {
      date: summary.date,
      id: summary.id,
      type: summary.type,
    };
  }

  return null;
}

export function getLinkedObjectNavigationDestination(
  target: LinkedObjectNavigationTarget,
): LinkedObjectNavigationDestination {
  switch (target.type) {
    case "plan":
      return {
        activeInspectorTab: "plans",
        activeMode: "agent",
        panelOpen: true,
        target,
      };
    case "checklist":
      return {
        activeMode: "checklist",
        target,
      };
    case "schedule":
      return {
        activeMode: "schedule",
        month: target.date.slice(0, 7),
        target,
      };
    case "timeline":
      return {
        activeMode: "timeline",
        month: target.date.slice(0, 7),
        target,
      };
  }
}

export function resolveLinkedObjectSelectHandler(
  explicit: LinkedObjectSummarySelectHandler | undefined,
  contextual: LinkedObjectSummarySelectHandler | undefined,
): LinkedObjectSummarySelectHandler | undefined {
  return explicit ?? contextual;
}

export function findExactNavigationTarget<T extends { id: number }>(
  records: readonly T[],
  targetId: number | null | undefined,
): T | null {
  if (!isPositiveInteger(targetId)) {
    return null;
  }
  return records.find((record) => record.id === targetId) ?? null;
}

export function replaceDashboardModeInSearch(
  search: string,
  mode: DashboardIconMode,
): string {
  const params = new URLSearchParams(search);
  if (mode === "agent") {
    params.delete("mode");
  } else {
    params.set("mode", mode);
  }
  const nextQuery = params.toString();
  return nextQuery ? `/dashboard?${nextQuery}` : "/dashboard";
}

const defaultFocusRuntime: FocusRuntime = {
  cancelFrame: (handle) => window.cancelAnimationFrame(handle),
  clearDelay: (handle) => window.clearTimeout(handle as number),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  setDelay: (callback, delayMs) => window.setTimeout(callback, delayMs),
};

export function startLinkedObjectFocus(
  element: HTMLElement,
  runtime: FocusRuntime = defaultFocusRuntime,
): () => void {
  let delayHandle: FocusDelayHandle | undefined;
  const frameHandle = runtime.requestFrame(() => {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("is-linked-object-target");
    delayHandle = runtime.setDelay(() => {
      element.classList.remove("is-linked-object-target");
    }, 1_800);
  });

  return () => {
    runtime.cancelFrame(frameHandle);
    if (delayHandle !== undefined) {
      runtime.clearDelay(delayHandle);
    }
    element.classList.remove("is-linked-object-target");
  };
}

export function useLinkedObjectFocus<T extends HTMLElement>(
  active: boolean,
  focusKey: null | number | string,
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active || !ref.current) {
      return;
    }
    return startLinkedObjectFocus(ref.current);
  }, [active, focusKey]);

  return ref;
}

export function useLinkedObjectNavigation():
  | LinkedObjectSummarySelectHandler
  | undefined {
  return useContext(LinkedObjectNavigationContext);
}

export function LinkedObjectNavigationProvider({
  children,
  onNavigate,
}: LinkedObjectNavigationProviderProps) {
  const navigateSummary = useCallback(
    (summary: LinkedObjectSummary) => {
      const target = toLinkedObjectNavigationTarget(summary);
      if (target) {
        onNavigate(target);
      }
    },
    [onNavigate],
  );
  return (
    <LinkedObjectNavigationContext.Provider value={navigateSummary}>
      {children}
    </LinkedObjectNavigationContext.Provider>
  );
}
