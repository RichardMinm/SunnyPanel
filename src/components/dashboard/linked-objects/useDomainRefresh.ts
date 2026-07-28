"use client";

import { useEffect, useRef } from "react";

export const DOMAIN_REFRESH_EVENT = "sunny:domain-refresh";

export type DomainRefreshDomain =
  | "plans"
  | "checklists"
  | "schedule"
  | "timeline";

export type DomainRefreshDetail = {
  domains: DomainRefreshDomain[];
  ids?: number[];
  reason:
    | "agent_execute"
    | "manual_update"
    | "completion"
    | "rollback";
};

export type DomainLoadMode = "background" | "foreground";

type AffectedDocumentInput = {
  collection?: unknown;
  documentId?: unknown;
};

type DomainRefreshLoader = (
  mode: DomainLoadMode,
) => (() => void) | void;

type NotifyDomainRefreshOptions = {
  affectedDocuments?: unknown;
  fallback?: AffectedDocumentInput | null;
  reason: DomainRefreshDetail["reason"];
  target?: EventTarget | null;
};

type AgentTerminalDomainRefreshOptions = {
  affectedDocuments?: unknown;
  assistantMessage?: unknown;
  pendingAction?: unknown;
  responseOk: boolean;
  target?: EventTarget | null;
};

type RollbackDomainRefreshResult = AffectedDocumentInput & {
  affectedDocuments?: unknown;
  strategy?: unknown;
};

type RollbackDomainRefreshOptions = {
  responseOk: boolean;
  result: RollbackDomainRefreshResult | null;
  target?: EventTarget | null;
};

type ScheduleCompletionDomainRefreshOptions = {
  affectedDocuments?: unknown;
  item?: {
    id?: unknown;
    status?: unknown;
  } | null;
  requestedItemId: unknown;
  responseOk: boolean;
  target?: EventTarget | null;
};

type RetainedDomainRequestOptions<T> = {
  clearError: () => void;
  load: () => Promise<T>;
  mode: DomainLoadMode;
  onData: (data: T) => void;
  onError: (error: unknown) => void;
  setForegroundLoading: (loading: boolean) => void;
};

const collectionDomainEntries = [
  ["plans", "plans"],
  ["checklists", "checklists"],
  ["schedule-items", "schedule"],
  ["timeline-events", "timeline"],
] as const satisfies ReadonlyArray<readonly [string, DomainRefreshDomain]>;

const collectionDomainMap = new Map<string, DomainRefreshDomain>(
  collectionDomainEntries,
);

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const toAffectedDocumentInputs = (
  affectedDocuments: unknown,
): AffectedDocumentInput[] =>
  Array.isArray(affectedDocuments)
    ? affectedDocuments.filter(
        (document): document is AffectedDocumentInput =>
          Boolean(document && typeof document === "object" && !Array.isArray(document)),
      )
    : [];

export function buildDomainRefreshDetail(
  affectedDocuments: unknown,
  reason: DomainRefreshDetail["reason"],
  fallback?: AffectedDocumentInput | null,
): DomainRefreshDetail | null {
  const documents = toAffectedDocumentInputs(affectedDocuments);
  const inputs = documents.length > 0
    ? documents
    : fallback
      ? [fallback]
      : [];
  const domains = new Set<DomainRefreshDomain>();
  const ids = new Set<number>();

  for (const document of inputs) {
    if (typeof document.collection !== "string") {
      continue;
    }

    const domain = collectionDomainMap.get(document.collection);
    if (!domain) {
      continue;
    }

    domains.add(domain);
    if (isPositiveSafeInteger(document.documentId)) {
      ids.add(document.documentId);
    }
  }

  const orderedDomains = collectionDomainEntries.flatMap(([, domain]) =>
    domains.has(domain) ? [domain] : [],
  );
  if (orderedDomains.length === 0) {
    return null;
  }

  const orderedIds = [...ids].sort((left, right) => left - right);

  return {
    domains: orderedDomains,
    ...(orderedIds.length > 0 ? { ids: orderedIds } : {}),
    reason,
  };
}

const getBrowserEventTarget = (): EventTarget | null =>
  typeof window !== "undefined" ? window : null;

const createDomainRefreshEvent = (
  detail: DomainRefreshDetail,
  target: EventTarget,
): Event => {
  const targetCustomEvent = (
    target as EventTarget & {
      CustomEvent?: typeof CustomEvent;
    }
  ).CustomEvent;
  const CustomEventConstructor =
    typeof targetCustomEvent === "function"
      ? targetCustomEvent
      : typeof CustomEvent === "function"
        ? CustomEvent
        : null;

  if (CustomEventConstructor) {
    return new CustomEventConstructor(DOMAIN_REFRESH_EVENT, {
      detail,
    });
  }

  const event = new Event(DOMAIN_REFRESH_EVENT);
  Object.defineProperty(event, "detail", {
    value: detail,
  });
  return event;
};

export function notifyDomainRefresh({
  affectedDocuments,
  fallback,
  reason,
  target = getBrowserEventTarget(),
}: NotifyDomainRefreshOptions): boolean {
  if (!target) {
    return false;
  }

  const detail = buildDomainRefreshDetail(
    affectedDocuments,
    reason,
    fallback,
  );
  if (!detail) {
    return false;
  }

  target.dispatchEvent(createDomainRefreshEvent(detail, target));
  return true;
}

export function notifyAgentTerminalDomainRefresh({
  affectedDocuments,
  assistantMessage,
  responseOk,
  target,
}: AgentTerminalDomainRefreshOptions): boolean {
  if (
    !responseOk
    || typeof assistantMessage !== "string"
    || assistantMessage.length === 0
  ) {
    return false;
  }

  return notifyDomainRefresh({
    affectedDocuments,
    reason: "agent_execute",
    target,
  });
}

export function notifyRollbackDomainRefresh({
  responseOk,
  result,
  target,
}: RollbackDomainRefreshOptions): boolean {
  if (!responseOk || !result) {
    return false;
  }

  return notifyDomainRefresh({
    affectedDocuments: result.affectedDocuments,
    fallback: result,
    reason: "rollback",
    target,
  });
}

export function notifyScheduleCompletionDomainRefresh({
  affectedDocuments,
  item,
  requestedItemId,
  responseOk,
  target,
}: ScheduleCompletionDomainRefreshOptions): boolean {
  if (
    !responseOk
    || !Array.isArray(affectedDocuments)
    || !isPositiveSafeInteger(requestedItemId)
    || !isPositiveSafeInteger(item?.id)
    || item.id !== requestedItemId
    || item.status !== "done"
  ) {
    return false;
  }

  return notifyDomainRefresh({
    affectedDocuments,
    reason: "completion",
    target,
  });
}

export function createRetainedDomainRequestRunner() {
  let latestGeneration = 0;
  let foregroundLoading = false;

  return {
    run<T>({
      clearError,
      load,
      mode,
      onData,
      onError,
      setForegroundLoading,
    }: RetainedDomainRequestOptions<T>) {
      const generation = ++latestGeneration;
      let cancelled = false;

      clearError();
      if (mode === "foreground") {
        foregroundLoading = true;
        setForegroundLoading(true);
      }

      void (async () => {
        try {
          const data = await load();
          if (!cancelled && generation === latestGeneration) {
            onData(data);
          }
        } catch (error) {
          if (!cancelled && generation === latestGeneration) {
            onError(error);
          }
        } finally {
          if (
            !cancelled
            && generation === latestGeneration
            && foregroundLoading
          ) {
            foregroundLoading = false;
            setForegroundLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    },
  };
}

export function createLatestDomainRefreshLoaderProxy(
  initialLoader: DomainRefreshLoader,
) {
  let latestLoader = initialLoader;

  return {
    invoke: (mode: DomainLoadMode) => latestLoader(mode),
    update(loader: DomainRefreshLoader) {
      latestLoader = loader;
    },
  };
}

export function createNavigationApplicationTracker() {
  let lastAppliedKey: string | null = null;

  return {
    shouldApply(key: string | null, ready: boolean) {
      if (key === null) {
        lastAppliedKey = null;
        return false;
      }

      if (!ready || lastAppliedKey === key) {
        return false;
      }

      lastAppliedKey = key;
      return true;
    },
  };
}

const getDomainRefreshDetail = (event: Event): DomainRefreshDetail | null => {
  const detail = (event as Event & { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }

  const domains = (detail as { domains?: unknown }).domains;
  return Array.isArray(domains)
    ? detail as DomainRefreshDetail
    : null;
};

export function subscribeToDomainRefresh(
  domain: DomainRefreshDomain,
  loader: DomainRefreshLoader,
  target: EventTarget | null = getBrowserEventTarget(),
): () => void {
  if (!target) {
    return () => undefined;
  }

  let activeCleanup: (() => void) | undefined;
  const listener = (event: Event) => {
    const detail = getDomainRefreshDetail(event);
    if (!detail?.domains.includes(domain)) {
      return;
    }

    activeCleanup?.();
    const cleanup = loader("background");
    activeCleanup = typeof cleanup === "function" ? cleanup : undefined;
  };

  target.addEventListener(DOMAIN_REFRESH_EVENT, listener);
  return () => {
    activeCleanup?.();
    target.removeEventListener(DOMAIN_REFRESH_EVENT, listener);
  };
}

export function useDomainRefresh(
  domain: DomainRefreshDomain,
  loader: DomainRefreshLoader,
) {
  const loaderProxyRef = useRef(
    createLatestDomainRefreshLoaderProxy(loader),
  );
  /* eslint-disable-next-line react-hooks/refs -- the domain event must observe the latest render before passive effects run */
  loaderProxyRef.current.update(loader);

  useEffect(
    () =>
      subscribeToDomainRefresh(
        domain,
        loaderProxyRef.current.invoke,
      ),
    [domain],
  );
}
