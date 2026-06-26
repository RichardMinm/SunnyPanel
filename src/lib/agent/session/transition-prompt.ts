/**
 * Transition Prompt — System & User prompt builder for LLM Transition Engine.
 *
 * Constructs prompts that instruct the LLM to analyze the current session state
 * and user message, then output a TransitionOutput JSON object.
 *
 * The LLM is scoped to semantic state transitions ONLY:
 * - ❌ Never select tools
 * - ❌ Never call execute / dry-run
 * - ❌ Never write to DB
 * - ✅ Output sessionPatch + routeHint + transitionType + reason
 */

import type { AgentSessionState } from "./types";

/* ═══════════════════════════════════════════════════════════════════════
   System Prompt
   ═══════════════════════════════════════════════════════════════════════ */

export const TRANSITION_SYSTEM_PROMPT = `You are a Semantic Session Coordinator for an AI agent system. Your ONLY job is to analyze the current conversation session state and the user's latest message, then output a structured JSON object describing the semantic state transition.

## Your Scope (what you CAN do)
- Determine the user's domain (general, learning, memory, planning, schedule, security, writing)
- Determine the dialogue stage (exploring, drafting, refining, confirming, executing, reviewing, completed)
- Determine the active workflow (none, writing_creation, writing_revision, plan_creation, etc.)
- Provide routing hints (suggestedAction, suggestedTarget, expectedIntents, contextualClues)
- Decide whether the session should be updated (shouldUpdateSession)

## Your Constraints (what you MUST NOT do)
- NEVER output tool names, tool calls, or execution instructions
- NEVER output "executeTool", "toolCall", "dryRun", "runTool", "callTool"
- NEVER suggest specific API endpoints or database operations
- NEVER output code or function calls
- Your output is advisory — it guides the Router, it does NOT execute actions

## Output Format
You MUST output a single JSON object with these fields:
{
  "shouldUpdateSession": boolean,
  "sessionPatch": {
    "domain"?: "general"|"learning"|"memory"|"planning"|"schedule"|"security"|"writing",
    "stage"?: "exploring"|"drafting"|"refining"|"confirming"|"executing"|"reviewing"|"completed",
    "currentTarget"?: { "entityType"?: string|null, "entityName"?: string|null, "entityId"?: string|number|null, "topic"?: string|null },
    "workflow"?: "none"|"writing_creation"|"writing_revision"|"plan_creation"|"plan_iteration"|"schedule_composition"|"learning_explanation"|"learning_plan"|"memory_curation"|"general_query"|"weekly_review"
  },
  "routeHint": {
    "suggestedAction"?: "cancel"|"capability"|"chat"|"clarify"|"create"|"delete"|"expand_answer"|"explain"|"query"|"summarize"|"update",
    "suggestedTarget"?: "agent"|"checklist"|"last_topic"|"memory"|"plan"|"schedule"|"timeline"|"unknown"|"writing",
    "contextualClues": string[],
    "expectedIntents": string[],
    "confidence": number (0-1),
    "source": "transition_engine"
  },
  "transitionType": "continue_current_flow"|"deepen_current_flow"|"switch_domain"|"complete_flow"|"restart_flow"|"confirm_pending_action"|"cancel_pending_action"|"fallback",
  "reason": string (a brief explanation of why you chose this transition)
}

## Key Rules
1. If the user continues the same topic/domain, use continue_current_flow.
2. If the user asks to go deeper on the current topic, use deepen_current_flow.
3. If the user switches to a clearly different domain, use switch_domain.
4. If the user seems done with the current workflow, use complete_flow.
5. Only use fallback when you are truly uncertain — this is expensive.
6. The routeHint.source MUST be "transition_engine".
7. Be conservative: prefer continue_current_flow over switch_domain when uncertain.
8. Prefer exploring stage when entering a new domain.
9. Prefer drafting stage when the user starts composing/creating.
10. Prefer refining stage when the user is editing/modifying.`;

/* ═══════════════════════════════════════════════════════════════════════
   User Prompt Builder
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Build a user prompt from the current session state and user message.
 * The prompt contains the session context as a JSON block, followed by
 * the user's message and instructions to output the transition JSON.
 */
export const buildTransitionUserPrompt = (
  session: AgentSessionState,
  message: string,
): string => {
  const sessionSummary = {
    schemaVersion: session.schemaVersion,
    semantic: {
      domain: session.semantic.domain,
      stage: session.semantic.stage,
      currentTarget: session.semantic.currentTarget,
      workflow: session.semantic.workflow,
    },
    conversation: {
      lastTopic: session.conversation.lastTopic ?? null,
      lastAnswerDepth: session.conversation.lastAnswerDepth ?? null,
      lastMentionedEntities: session.conversation.lastMentionedEntities ?? [],
      lastUserIntent: session.conversation.lastUserIntent ?? null,
    },
    pending: {
      hasConfirmation: session.pending?.confirmation != null,
      confirmationSummary: session.pending?.confirmation?.summary ?? null,
      hasClarification: session.pending?.clarification != null,
      clarificationQuestion: session.pending?.clarification?.question ?? null,
    },
    lastTransition: session.lastTransition
      ? {
          transitionType: session.lastTransition.transitionType,
          reason: session.lastTransition.reason,
        }
      : null,
  };

  return `## Current Session State
\`\`\`json
${JSON.stringify(sessionSummary, null, 2)}
\`\`\`

## Latest User Message
${message}

## Instructions
Based on the session state and user message above, output a single JSON object describing the semantic state transition. Follow the system prompt rules exactly.

Output ONLY the JSON object. No commentary, no markdown fences, no additional text.`;
};

/* ═══════════════════════════════════════════════════════════════════════
   Retry Prompt Builder
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Build a prompt for retry when the previous LLM output failed validation.
 */
export const buildRetryPrompt = (
  originalUserPrompt: string,
  previousOutput: string,
  validationError: string,
): string => {
  return `${originalUserPrompt}

---
## ⚠️ Your previous output was INVALID

Previous output:
\`\`\`json
${previousOutput}
\`\`\`

Validation error: ${validationError}

## Fix Instructions
Please output a CORRECTED JSON object that:
1. Follows the exact field types and enum values specified in the system prompt
2. Does NOT contain any forbidden tokens (executeTool, toolCall, dryRun, etc.)
3. Has valid enum values for all fields
4. Has confidence between 0 and 1
5. Has contextualClues and expectedIntents as arrays of strings

Output ONLY the corrected JSON object. No commentary.`;
};
