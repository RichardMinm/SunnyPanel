"use client";

import { AnimatePresence, motion } from "motion/react";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import type { AgentThreadSummary, AgentRunSummary } from "@/components/dashboard/agent/types";
import { ContextCard } from "./ContextCard";
import { PendingActionsCard } from "./PendingActionsCard";
import { HistoryCard } from "./HistoryCard";

type DashboardRightPanelProps = {
  panelOpen: boolean;
  /* Context */
  threadId: null | number;
  threadTitle?: string;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  tokenUsage: AgentTokenUsage;
  tokenCountStr?: string;

  /* Pending */
  pendingAction: null | PendingAction;
  suggestions: AgentInboxSuggestion[];
  quickPrompts: AgentQuickPrompt[];
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onRunPrompt: (prompt: string) => void;
  onCancelApproval: () => void;
  onConfirmApproval: () => void;

  /* History */
  threads: AgentThreadSummary[];
  recentRuns: AgentRunSummary[];
  onLoadThread: (threadId: number) => void;
  onSelectRun?: (runId: number) => void;
};

const cardVariants = {
  initial: { opacity: 0, x: 20, scale: 0.97 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 20, scale: 0.97 },
};

export function DashboardRightPanel(props: DashboardRightPanelProps) {
  return (
    <aside className="sunny-dashboard-right-panel" aria-label="右侧面板">
      <AnimatePresence mode="wait">
        {props.panelOpen ? (
          <motion.div
            key="right-panel-cards"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={{ initial: {}, animate: {}, exit: {} }}
            transition={{ staggerChildren: 0.06 }}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <motion.div variants={cardVariants} transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}>
              <ContextCard
                threadId={props.threadId}
                threadTitle={props.threadTitle}
                messages={props.messages}
                traceSteps={props.traceSteps}
                tokenUsage={props.tokenUsage}
                tokenCountStr={props.tokenCountStr}
              />
            </motion.div>
            <motion.div variants={cardVariants} transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1], delay: 0.04 }}>
              <PendingActionsCard
                pendingAction={props.pendingAction}
                suggestions={props.suggestions}
                quickPrompts={props.quickPrompts}
                onRunSuggestion={props.onRunSuggestion}
                onRunPrompt={props.onRunPrompt}
                onCancelApproval={props.onCancelApproval}
                onConfirmApproval={props.onConfirmApproval}
              />
            </motion.div>
            <motion.div variants={cardVariants} transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1], delay: 0.08 }}>
              <HistoryCard
                threads={props.threads}
                threadId={props.threadId}
                recentRuns={props.recentRuns}
                traceSteps={props.traceSteps}
                onLoadThread={props.onLoadThread}
                onSelectRun={props.onSelectRun}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
}
