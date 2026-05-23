"use client";

import dynamic from "next/dynamic";

import { AgentConversationSkeleton } from "@/components/dashboard/agent/AgentSkeleton";

import type { AgentChatPanelProps } from "./AgentChatPanel";

const AgentChatPanelDynamic = dynamic(
  () => import("./AgentChatPanel").then((module) => module.AgentChatPanel),
  {
    loading: () => (
      <div className="sunny-agent-panel-loading" aria-busy="true" aria-label="加载 Agent 工作台">
        <AgentConversationSkeleton />
      </div>
    ),
    ssr: false,
  },
);

export function AgentChatPanel(props: AgentChatPanelProps) {
  return <AgentChatPanelDynamic {...props} />;
}

export type { AgentChatPanelProps };
