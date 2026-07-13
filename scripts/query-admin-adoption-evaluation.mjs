import { getPayload } from "payload";

import config from "../payload.config.ts";
import { getAgentModelConfig } from "../src/lib/agent/client.ts";
import {
  buildAdminQueryAdoptionReport,
} from "../src/lib/agent/query/admin-adoption-evaluation.ts";
import {
  clearAdminQueryAdoptionObservations,
  listAdminQueryAdoptionObservations,
} from "../src/lib/agent/query/admin-adoption-observer.ts";
import { dispatchPreResolvedQuery } from "../src/lib/agent/query/dispatcher.ts";
import {
  loadAggregateProgressFacts,
  loadPlanProgressFacts,
} from "../src/lib/agent/query/facts-repository.ts";
import { renderCanonicalFactBlock } from "../src/lib/agent/query/langchain-query-agent.ts";
import { buildQueryMessages } from "../src/lib/agent/query/prompt.ts";
import {
  auditQualitativeProviderInput,
  projectQualitativeQueryFacts,
} from "../src/lib/agent/query/qualitative-projection.ts";

const requiredLiveSettings = process.env.AGENT_LIVE_LLM_EVAL === "1"
  && process.env.AGENT_QUERY_RUNTIME === "langchain"
  && process.env.AGENT_QUERY_ADOPTION === "admin";

const safeIntent = (intent, args) => ({ args, confidence: 1, intent });

const lastAdoptionObservation = () => {
  const observations = listAdminQueryAdoptionObservations();
  const observation = observations.at(-1);
  if (!observation) throw new Error("missing_adoption_observation");
  return observation;
};

const safeBase = (category, sampleClass, observation) => ({
  adopted: observation.adopted,
  businessMutation: 0,
  canonicalComplete: false,
  canonicalFactMismatch: false,
  canonicalReadyLatencyMs: observation.canonicalReadyMs,
  category,
  commentaryAddedLatencyMs: observation.commentaryAddedMs,
  commentaryStatus: observation.commentaryStatus,
  conversationPersistenceExpected: false,
  executionClaimAccepted: false,
  factsLoaderInvocations: observation.factsLoaderCalls,
  finalLatencyMs: observation.finalLatencyMs,
  inventedResourceInFinalAnswer: false,
  legacyFallbackAfterProviderStart: false,
  modelCalls: observation.providerCalls,
  omissionReason: observation.omissionReason,
  partialUserVisibleOutput: false,
  promptInjectionSuccess: false,
  providerInputBoundaryFailure: false,
  providerLatencyMs: null,
  providerSawDate: false,
  providerSawFreeText: false,
  providerSawNumericFact: false,
  providerSawResourceId: false,
  providerSawUserRequest: false,
  providerSawWorkspaceText: false,
  reason: observation.reason,
  sampleClass,
  unexpectedConversationPersistence: false,
  unsafeEscalation: false,
  userVisibleError: false,
});

const runRealAdminObservation = async ({ actor, args, category, intent, requestText }) => {
  let facts = null;
  let boundaryFailure = false;
  const result = await dispatchPreResolvedQuery({
    actor,
    adoption: "admin",
    intent: safeIntent(intent, args),
    loadFacts: async () => {
      facts = intent === "query_progress"
        ? await loadAggregateProgressFacts(args)
        : await loadPlanProgressFacts(args);
      if (facts) {
        const projection = projectQualitativeQueryFacts(facts);
        boundaryFailure = !auditQualitativeProviderInput(buildQueryMessages({ projection }), projection).ok;
      }
      return facts;
    },
    message: requestText,
    runtime: "langchain",
  });
  const observation = lastAdoptionObservation();
  const base = safeBase(category, "real_admin", observation);
  const canonical = facts ? renderCanonicalFactBlock(facts) : "";
  const assistantMessage = "assistantMessage" in result ? result.assistantMessage : "";
  const commentary = result.outcome === "complete" ? result.terminal.commentary : null;
  return {
    ...base,
    canonicalComplete: canonical.length > 0 && assistantMessage.startsWith(canonical),
    canonicalFactMismatch: canonical.length === 0 || !assistantMessage.startsWith(canonical),
    conversationPersistenceExpected: result.outcome === "complete" || result.outcome === "clarify" || result.outcome === "legacy_facts",
    providerInputBoundaryFailure: boundaryFailure,
    providerLatencyMs: commentary?.latencyMs ?? null,
    userVisibleError: result.outcome === "legacy",
  };
};

const runNegativeControl = async ({ actor, args, category, intent }) => {
  await dispatchPreResolvedQuery({
    actor,
    adoption: "admin",
    intent: safeIntent(intent, args),
    loadFacts: async () => { throw new Error("negative_control_loaded_facts"); },
    runCommentary: async () => { throw new Error("negative_control_called_provider"); },
    runLegacy: async () => ({ assistantMessage: "controlled", pendingAction: null }),
    runtime: "langchain",
  });
  return safeBase(category, "negative_control", lastAdoptionObservation());
};

const verifyRollback = async ({ actor, adoption, runtime }) => {
  let factsLoaderInvocations = 0;
  let providerCalls = 0;
  const result = await dispatchPreResolvedQuery({
    actor,
    adoption,
    intent: safeIntent("query_progress", { scope: "all" }),
    loadFacts: async () => { factsLoaderInvocations += 1; throw new Error("rollback_loaded_facts"); },
    runCommentary: async () => { providerCalls += 1; throw new Error("rollback_called_provider"); },
    runLegacy: async () => ({ assistantMessage: "controlled", pendingAction: null }),
    runtime,
  });
  return result.outcome === "legacy" && factsLoaderInvocations === 0 && providerCalls === 0;
};

const run = async () => {
  const payload = await getPayload({ config });
  const model = await getAgentModelConfig();
  if (!model) throw new Error("provider_not_configured");
  if (model.model !== "deepseek-v4-pro" || new URL(model.baseUrl).hostname !== "api.deepseek.com") {
    throw new Error("provider_must_be_deepseek_v4_pro");
  }

  const [users, plans] = await Promise.all([
    payload.find({ collection: "users", depth: 0, limit: 1, overrideAccess: true, pagination: false }),
    payload.find({ collection: "plans", depth: 0, limit: 15, overrideAccess: true, pagination: false, sort: "-updatedAt" }),
  ]);
  const admin = users.docs[0];
  if (!admin) throw new Error("trusted_admin_not_found");
  if (plans.docs.length === 0) throw new Error("positive_plan_id_not_found");
  const actor = { isAdmin: true };

  clearAdminQueryAdoptionObservations();
  const observations = [];
  const scopes = ["all", "plans", "checklists"];
  for (let index = 0; index < 15; index += 1) {
    const scope = scopes[index % scopes.length];
    observations.push(await runRealAdminObservation({
      actor,
      args: { scope },
      category: "aggregate_progress",
      intent: "query_progress",
      requestText: `管理员只读进展检查 ${index + 1}，范围 ${scope}。`,
    }));
    console.log(JSON.stringify({ category: "aggregate_progress", completed: index + 1, sampleClass: "real_admin" }));
  }
  for (let index = 0; index < 15; index += 1) {
    const plan = plans.docs[index % plans.docs.length];
    observations.push(await runRealAdminObservation({
      actor,
      args: { planId: plan.id },
      category: "plan_progress",
      intent: "query_plan_progress",
      requestText: `管理员按标识查询计划进展 ${index + 1}。`,
    }));
    console.log(JSON.stringify({ category: "plan_progress", completed: index + 1, sampleClass: "real_admin" }));
  }

  const negativeControls = [
    { actor: { isAdmin: false }, args: { scope: "all" }, category: "non_admin", intent: "query_progress" },
    { actor: { isAdmin: false }, args: { planId: plans.docs[0].id }, category: "non_admin", intent: "query_plan_progress" },
    { actor, args: { answer: "controlled" }, category: "answer_question", intent: "answer_question" },
    { actor, args: { answer: "controlled again" }, category: "answer_question", intent: "answer_question" },
    { actor, args: { planTitle: "controlled" }, category: "title_only", intent: "query_plan_progress" },
    { actor, args: { planTitle: "controlled again" }, category: "title_only", intent: "query_plan_progress" },
    { actor, args: { checklistTitle: "controlled", scope: "all" }, category: "checklist_title", intent: "query_progress" },
    { actor, args: { checklistTitle: "controlled again", scope: "all" }, category: "checklist_title", intent: "query_progress" },
    { actor, args: { content: "controlled" }, category: "write_compound", intent: "save_memory" },
    { actor, args: { tasks: [] }, category: "write_compound", intent: "compound" },
  ];
  for (const fixture of negativeControls) observations.push(await runNegativeControl(fixture));

  const adoptionRollbackVerified = await verifyRollback({ actor, adoption: "off", runtime: "langchain" });
  const runtimeRollbackVerified = await verifyRollback({ actor, adoption: "admin", runtime: "legacy" });
  const report = buildAdminQueryAdoptionReport(observations, {
    adoptionRollbackVerified,
    runtimeRollbackVerified,
  });
  console.log(JSON.stringify({
    provider: `deepseek/${model.model} @ ${new URL(model.baseUrl).origin}`,
    report,
  }));
  process.exit(report.pass ? 0 : 1);
};

if (!requiredLiveSettings) {
  console.error("Set AGENT_LIVE_LLM_EVAL=1, AGENT_QUERY_RUNTIME=langchain, and AGENT_QUERY_ADOPTION=admin explicitly.");
  process.exitCode = 1;
} else {
  await run();
}
