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

type AffectedDocumentInput = {
  collection?: unknown;
  documentId?: unknown;
};

type DomainRefreshLoader = () => (() => void) | Promise<void> | void;

type NotifyDomainRefreshOptions = {
  affectedDocuments?: unknown;
  fallback?: AffectedDocumentInput | null;
  reason: DomainRefreshDetail["reason"];
  target?: EventTarget | null;
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
    if (
      typeof document.collection !== "string"
      || !isPositiveSafeInteger(document.documentId)
    ) {
      continue;
    }

    const domain = collectionDomainMap.get(document.collection);
    if (!domain) {
      continue;
    }

    domains.add(domain);
    ids.add(document.documentId);
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
    const cleanup = loader();
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
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  useEffect(
    () =>
      subscribeToDomainRefresh(
        domain,
        () => loaderRef.current(),
      ),
    [domain],
  );
}
