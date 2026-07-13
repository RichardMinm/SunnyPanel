import type { AgentIntent } from "../schemas";
import type { AdminQueryAdoptionReason } from "./admin-adoption";
import type { CommentaryOmissionReason } from "./qualitative-projection";
import type { QueryAdoption, QueryRuntime } from "./types";

export const ADMIN_QUERY_ADOPTION_OBSERVATION_CAPACITY = 200;

export type AdminQueryAdoptionObservation = {
  adopted: boolean;
  adoption: QueryAdoption;
  canonicalReadyMs: null | number;
  commentaryAddedMs: null | number;
  commentaryStatus: "accepted" | "not_started" | "omitted";
  factsLoaderCalls: 0 | 1;
  finalLatencyMs: number;
  intentCategory: AgentIntent["intent"];
  omissionReason: CommentaryOmissionReason | null;
  providerCalls: 0 | 1;
  queryResult: "clarify" | "complete" | "legacy" | "legacy_facts";
  reason: AdminQueryAdoptionReason;
  runtime: QueryRuntime;
};

const observations: AdminQueryAdoptionObservation[] = [];

const boundedLatency = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const recordAdminQueryAdoptionObservation = (observation: AdminQueryAdoptionObservation) => {
  observations.push({
    ...observation,
    canonicalReadyMs: observation.canonicalReadyMs === null ? null : boundedLatency(observation.canonicalReadyMs),
    commentaryAddedMs: observation.commentaryAddedMs === null ? null : boundedLatency(observation.commentaryAddedMs),
    finalLatencyMs: boundedLatency(observation.finalLatencyMs),
  });
  if (observations.length > ADMIN_QUERY_ADOPTION_OBSERVATION_CAPACITY) {
    observations.splice(0, observations.length - ADMIN_QUERY_ADOPTION_OBSERVATION_CAPACITY);
  }
};

export const listAdminQueryAdoptionObservations = () => observations.map((observation) => ({ ...observation }));

export const clearAdminQueryAdoptionObservations = () => {
  observations.length = 0;
};
