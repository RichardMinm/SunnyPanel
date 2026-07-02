import {
  parsePendingAction,
  sanitizeChatMessages,
  isConversationalIntent,
  type AgentChatMessage,
  type AgentChatResponse,
  type AgentEngine,
  type AgentIntent,
  type PendingAction,
} from "@/lib/agent/schemas";
import { buildAgentThreadSummary } from "@/lib/agent/thread-summary";
import type { AgentThread } from "@/payload-types";

export const AGENT_THREAD_EVENT_SCHEMA_VERSION = 1;

export type AgentThreadEventType =
  | "assistant_completed"
  | "legacy_bootstrap"
  | "projection_failed"
  | "turn_failed"
  | "user_received";

export type AgentSuggestionTurnSource = {
  suggestedPrompt: string;
  suggestionId: number;
};

export type AgentThreadEventPayload =
  | {
      eventType: "legacy_bootstrap";
      lastConfidence?: null | number;
      lastEngine?: null | AgentEngine;
      lastIntent?: null | AgentIntent["intent"];
      messages: AgentChatMessage[];
      pendingAction: null | PendingAction;
    }
  | {
      eventType: "user_received";
      message: string;
      suggestionSource?: AgentSuggestionTurnSource;
      workbenchMode?: null | string;
    }
  | {
      eventType: "assistant_completed";
      pendingAfter: null | PendingAction;
      response: AgentChatResponse;
    }
  | {
      error: string;
      eventType: "turn_failed";
      pendingAfter: null | PendingAction;
      response: AgentChatResponse;
    }
  | {
      error: string;
      eventType: "projection_failed";
      sourceEventKey: string;
    };

type PayloadFor<TEventType extends AgentThreadEventType> = Omit<
  Extract<AgentThreadEventPayload, { eventType: TEventType }>,
  "eventType"
>;

export type AgentThreadEventAppendInput<
  TEventType extends AgentThreadEventType = AgentThreadEventType,
> = {
  eventKey: string;
  eventType: TEventType;
  payload: PayloadFor<TEventType>;
  recordedAt: string;
  schemaVersion: number;
  threadId: number;
  turnId: string;
  userId: number;
};

export type AgentThreadEventRecord = AgentThreadEventAppendInput & {
  id: number;
};

export type AgentThreadEventStore = {
  append: (
    input: AgentThreadEventAppendInput,
  ) => Promise<AgentThreadEventRecord>;
  findByEventKey: (
    eventKey: string,
  ) => Promise<AgentThreadEventRecord | null>;
  listByThread: (
    threadId: number,
  ) => Promise<AgentThreadEventRecord[]>;
  listByTurn: (
    threadId: number,
    turnId: string,
  ) => Promise<AgentThreadEventRecord[]>;
};

export type HydratedAgentThreadState = {
  lastConfidence: null | number;
  lastEngine: AgentEngine | null;
  lastIntent: AgentIntent["intent"] | null;
  lastInteractionAt: null | string;
  messages: AgentChatMessage[];
  pendingAction: null | PendingAction;
};

type AgentThreadJsonField =
  | {
      [k: string]: unknown;
    }
  | boolean
  | null
  | number
  | string
  | unknown[];

export type AgentThreadProjection = {
  conversationState?: AgentThreadJsonField;
  lastConfidence: AgentThread["lastConfidence"];
  lastEngine: AgentThread["lastEngine"];
  lastIntent: AgentThread["lastIntent"];
  lastInteractionAt: string;
  messages: AgentChatMessage[];
  pendingAction: null | PendingAction;
  status: "active";
  summary: string;
  summaryMessageCount: number;
  summaryUpdatedAt: string;
};

const eventKeyFor = (
  threadId: number,
  turnId: string,
  suffix: "assistant" | "failed" | "user",
) => `thread:${threadId}:turn:${turnId}:${suffix}`;

const projectableLastIntent = (intent: AgentIntent["intent"]): NonNullable<AgentThread["lastIntent"]> | null => {
  if (isConversationalIntent(intent)) {
    return "answer_question";
  }

  return intent as NonNullable<AgentThread["lastIntent"]>;
};

const sortEvents = (events: AgentThreadEventRecord[]) =>
  [...events].sort((left, right) => left.id - right.id);

const responseFromTerminalEvent = (
  event: AgentThreadEventRecord,
): AgentChatResponse | null => {
  if (
    event.eventType !== "assistant_completed" &&
    event.eventType !== "turn_failed"
  ) {
    return null;
  }

  const response = (
    event.payload as PayloadFor<
      "assistant_completed" | "turn_failed"
    >
  ).response;

  return response &&
    typeof response === "object" &&
    typeof response.assistantMessage === "string"
    ? response
    : null;
};

const inspectTurn = (events: AgentThreadEventRecord[]) => {
  const ordered = sortEvents(events);
  const terminal = ordered
    .map((event) => ({
      event,
      response: responseFromTerminalEvent(event),
    }))
    .findLast((item) => item.response !== null);

  if (terminal?.response?.assistantMessage?.trim()) {
    return {
      response: terminal.response,
      status: "replay" as const,
    };
  }

  if (ordered.some((event) => event.eventType === "user_received")) {
    return { status: "blocked" as const };
  }

  return null;
};

export const claimAgentTurn = async ({
  message,
  now = () => new Date().toISOString(),
  store,
  suggestionSource,
  threadId,
  turnId,
  userId,
  workbenchMode,
}: {
  message: string;
  now?: () => string;
  store: AgentThreadEventStore;
  suggestionSource?: AgentSuggestionTurnSource | null;
  threadId: number;
  turnId: string;
  userId: number;
  workbenchMode?: null | string;
}): Promise<
  | { event: AgentThreadEventRecord; status: "claimed" }
  | { response: AgentChatResponse; status: "replay" }
  | { status: "blocked" }
> => {
  const existing = inspectTurn(
    await store.listByTurn(threadId, turnId),
  );

  if (existing) {
    return existing;
  }

  try {
    const event = await store.append({
      eventKey: eventKeyFor(threadId, turnId, "user"),
      eventType: "user_received",
      payload: {
        message,
        ...(suggestionSource ? { suggestionSource } : {}),
        ...(workbenchMode ? { workbenchMode } : {}),
      },
      recordedAt: now(),
      schemaVersion: AGENT_THREAD_EVENT_SCHEMA_VERSION,
      threadId,
      turnId,
      userId,
    });

    return { event, status: "claimed" };
  } catch (error) {
    const raced = inspectTurn(
      await store.listByTurn(threadId, turnId),
    );

    if (raced) {
      return raced;
    }

    throw error;
  }
};

export const ensureLegacyThreadEvents = async ({
  now = () => new Date().toISOString(),
  store,
  thread,
  userId,
}: {
  now?: () => string;
  store: AgentThreadEventStore;
  thread: {
    id: number;
    lastConfidence?: null | number;
    lastEngine?: null | string;
    lastIntent?: null | string;
    messages?: unknown;
    pendingAction?: unknown;
  };
  userId: number;
}) => {
  const eventKey = `thread:${thread.id}:legacy-bootstrap:v1`;
  const existing = await store.findByEventKey(eventKey);

  if (existing) {
    return existing;
  }

  const lastEngine =
    typeof thread.lastEngine === "string"
      ? (thread.lastEngine as AgentEngine)
      : null;
  const lastIntent =
    typeof thread.lastIntent === "string"
      ? (thread.lastIntent as AgentIntent["intent"])
      : null;

  try {
    return await store.append({
      eventKey,
      eventType: "legacy_bootstrap",
      payload: {
        lastConfidence:
          typeof thread.lastConfidence === "number"
            ? thread.lastConfidence
            : null,
        lastEngine,
        lastIntent,
        messages: sanitizeChatMessages(thread.messages),
        pendingAction: parsePendingAction(thread.pendingAction),
      },
      recordedAt: now(),
      schemaVersion: AGENT_THREAD_EVENT_SCHEMA_VERSION,
      threadId: thread.id,
      turnId: `legacy-bootstrap:${thread.id}`,
      userId,
    });
  } catch (error) {
    const raced = await store.findByEventKey(eventKey);

    if (raced) {
      return raced;
    }

    throw error;
  }
};

export const hydrateAgentThreadState = async ({
  store,
  threadId,
}: {
  store: AgentThreadEventStore;
  threadId: number;
}): Promise<HydratedAgentThreadState> => {
  const state: HydratedAgentThreadState = {
    lastConfidence: null,
    lastEngine: null,
    lastIntent: null,
    lastInteractionAt: null,
    messages: [],
    pendingAction: null,
  };

  for (const event of sortEvents(await store.listByThread(threadId))) {
    state.lastInteractionAt = event.recordedAt;

    if (event.eventType === "legacy_bootstrap") {
      const payload = event.payload as PayloadFor<"legacy_bootstrap">;
      state.messages = sanitizeChatMessages(payload.messages);
      state.pendingAction = parsePendingAction(payload.pendingAction);
      state.lastConfidence = payload.lastConfidence ?? null;
      state.lastEngine = payload.lastEngine ?? null;
      state.lastIntent = payload.lastIntent ?? null;
      continue;
    }

    if (event.eventType === "user_received") {
      const payload = event.payload as PayloadFor<"user_received">;
      state.messages.push({
        content: payload.message,
        role: "user",
      });
      continue;
    }

    const response = responseFromTerminalEvent(event);
    if (response) {
      state.messages.push({
        content: response.assistantMessage,
        role: "assistant",
      });
      state.pendingAction = parsePendingAction(response.pendingAction);
      state.lastConfidence = response.confidence ?? null;
      state.lastEngine = response.engine;
      state.lastIntent = projectableLastIntent(response.intent) ?? null;
    }
  }

  state.messages = state.messages.slice(-40);

  return state;
};

export const buildAgentThreadProjection = (
  state: HydratedAgentThreadState,
): AgentThreadProjection => {
  const summary = buildAgentThreadSummary({
    messages: state.messages,
    pendingAction: state.pendingAction,
    previousSummary: null,
  });

  return {
    conversationState: null,
    lastConfidence: state.lastConfidence,
    lastEngine: state.lastEngine,
    lastIntent: state.lastIntent ? projectableLastIntent(state.lastIntent) : null,
    lastInteractionAt:
      state.lastInteractionAt ?? new Date().toISOString(),
    messages: state.messages,
    pendingAction: state.pendingAction,
    status: "active" as const,
    summary: summary.summary,
    summaryMessageCount: summary.messageCount,
    summaryUpdatedAt:
      state.lastInteractionAt ?? new Date().toISOString(),
  };
};

export const projectAgentThreadFromEvents = async ({
  now = () => new Date().toISOString(),
  project,
  store,
  threadId,
  turnId,
  userId,
}: {
  now?: () => string;
  project: (
    projection: ReturnType<typeof buildAgentThreadProjection>,
  ) => Promise<unknown>;
  store: AgentThreadEventStore;
  threadId: number;
  turnId: string;
  userId: number;
}) => {
  const state = await hydrateAgentThreadState({ store, threadId });

  try {
    await project(buildAgentThreadProjection(state));

    return { state, status: "projected" as const };
  } catch (error) {
    const sourceEventKey =
      eventKeyFor(threadId, turnId, "assistant");
    const eventKey = `projection:${turnId}:failed`;
    const existing = await store.findByEventKey(eventKey);

    if (!existing) {
      try {
        await store.append({
          eventKey,
          eventType: "projection_failed",
          payload: {
            error:
              error instanceof Error ? error.message : String(error),
            sourceEventKey,
          },
          recordedAt: now(),
          schemaVersion: AGENT_THREAD_EVENT_SCHEMA_VERSION,
          threadId,
          turnId,
          userId,
        });
      } catch {
        // Projection failure reporting is best-effort; canonical events
        // remain intact even if this diagnostic event races or also fails.
      }
    }

    return { error, state, status: "failed" as const };
  }
};

export const agentThreadEventKeys = {
  assistant: (threadId: number, turnId: string) =>
    eventKeyFor(threadId, turnId, "assistant"),
  failed: (threadId: number, turnId: string) =>
    eventKeyFor(threadId, turnId, "failed"),
  user: (threadId: number, turnId: string) =>
    eventKeyFor(threadId, turnId, "user"),
};

type PayloadEventDocument = {
  eventKey: string;
  eventType: AgentThreadEventType;
  id: number;
  payload: unknown;
  recordedAt: string;
  schemaVersion: number;
  thread: number | { id: number };
  turnId: string;
  user: number | { id: number };
};

export type AgentThreadEventPayloadClient = {
  create: (input: {
    collection: "agent-thread-events";
    data: Record<string, unknown>;
    overrideAccess: true;
  }) => Promise<PayloadEventDocument>;
  find: (input: {
    collection: "agent-thread-events";
    depth: 0;
    limit: number;
    overrideAccess: true;
    pagination: false;
    sort?: string;
    where: Record<string, unknown>;
  }) => Promise<{ docs: PayloadEventDocument[] }>;
  update: (input: {
    collection: "agent-threads";
    data: Record<string, unknown>;
    id: number;
    overrideAccess: true;
  }) => Promise<unknown>;
};

const relationId = (value: number | { id: number }) =>
  typeof value === "number" ? value : value.id;

const toEventRecord = (
  document: PayloadEventDocument,
): AgentThreadEventRecord => ({
  eventKey: document.eventKey,
  eventType: document.eventType,
  id: document.id,
  payload: document.payload as AgentThreadEventAppendInput["payload"],
  recordedAt: document.recordedAt,
  schemaVersion: document.schemaVersion,
  threadId: relationId(document.thread),
  turnId: document.turnId,
  userId: relationId(document.user),
});

export const createPayloadAgentThreadEventStore = (
  payload: AgentThreadEventPayloadClient,
): AgentThreadEventStore => ({
  append: async (input) =>
    toEventRecord(
      await payload.create({
        collection: "agent-thread-events",
        data: {
          eventKey: input.eventKey,
          eventType: input.eventType,
          payload: input.payload,
          recordedAt: input.recordedAt,
          schemaVersion: input.schemaVersion,
          thread: input.threadId,
          turnId: input.turnId,
          user: input.userId,
        },
        overrideAccess: true,
      }),
    ),
  findByEventKey: async (eventKey) => {
    const result = await payload.find({
      collection: "agent-thread-events",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        eventKey: {
          equals: eventKey,
        },
      },
    });

    return result.docs[0] ? toEventRecord(result.docs[0]) : null;
  },
  listByThread: async (threadId) => {
    const result = await payload.find({
      collection: "agent-thread-events",
      depth: 0,
      limit: 1000,
      overrideAccess: true,
      pagination: false,
      sort: "id",
      where: {
        thread: {
          equals: threadId,
        },
      },
    });

    return result.docs.map(toEventRecord);
  },
  listByTurn: async (threadId, turnId) => {
    const result = await payload.find({
      collection: "agent-thread-events",
      depth: 0,
      limit: 20,
      overrideAccess: true,
      pagination: false,
      sort: "id",
      where: {
        and: [
          {
            thread: {
              equals: threadId,
            },
          },
          {
            turnId: {
              equals: turnId,
            },
          },
        ],
      },
    });

    return result.docs.map(toEventRecord);
  },
});

export const rebuildAgentThreadProjection = ({
  payload,
  store = createPayloadAgentThreadEventStore(payload),
  threadId,
  turnId = `projection-rebuild:${threadId}`,
  userId,
}: {
  payload: AgentThreadEventPayloadClient;
  store?: AgentThreadEventStore;
  threadId: number;
  turnId?: string;
  userId: number;
}) =>
  projectAgentThreadFromEvents({
    project: (projection) =>
      payload.update({
        collection: "agent-threads",
        data: projection,
        id: threadId,
        overrideAccess: true,
      }),
    store,
    threadId,
    turnId,
    userId,
  });
