"use client";

import { useEffect, useState } from "react";

import { DashboardIcon } from "../icons";

type AgentMessageActionsProps = {
  content: string;
};

export function AgentMessageActions({ content }: AgentMessageActionsProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="sunny-agent-message-actions" aria-label="回答操作">
      <button
        aria-label={copied ? "回答已复制" : "复制回答"}
        className="sunny-agent-message-action"
        onClick={handleCopy}
        title={copied ? "已复制" : "复制回答"}
        type="button"
      >
        <DashboardIcon name="copy" />
      </button>
      {copied ? <span className="sunny-agent-message-action-feedback" role="status">已复制</span> : null}
    </div>
  );
}
