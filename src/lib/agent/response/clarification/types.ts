export type ClarificationWorkflow = "plan_creation" | "schedule_creation";

export type ClarificationTone = "concise" | "supportive" | "warm";

export type ClarificationMissingNeed = {
  /** Internal key for validation only — never exposed to user or LLM */
  key: string;
  /** Human-readable label for LLM prompt context */
  label: string;
  /** Optional reason why this is needed */
  reason?: string;
  /** Optional natural-language examples */
  examples?: string[];
};

export type ClarificationComposerInput = {
  workflow: ClarificationWorkflow;
  userMessage: string;
  /** Short summary of what the user wants, derived from slots */
  userGoalSummary?: string;
  /** Already-known facts in natural language (not raw slots) */
  knownFacts: string[];
  /** What's still needed, with human-readable labels */
  missingNeeds: ClarificationMissingNeed[];
  /** Maximum number of questions to ask */
  maxQuestions: number;
  tone: ClarificationTone;
  safetyBoundary: {
    willNotWriteYet: true;
    /** Human-readable next step, e.g. "先生成草案" */
    nextStep: string;
  };
};

export type ClarificationComposerOutput = {
  message: string;
  questions: string[];
  suggestedReply?: string;
  safetyNote: string;
  source: "fallback" | "llm";
};
