"use client";

import { useCallback, useEffect, useState } from "react";
import { useSpring, useTransform, motion, AnimatePresence } from "motion/react";

import type { AgentTokenUsage } from "@/lib/agent/schemas";

import { formatTokenCount, getUsagePercent } from "./utils";

type AgentTokenMeterProps = {
  inputTokenEstimate: number;
  tokenUsage: AgentTokenUsage;
};

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(0, { damping: 30, stiffness: 100 });
  const display = useTransform(spring, (v) => formatTokenCount(Math.round(v)));
  const [text, setText] = useState(() => formatTokenCount(value));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    const unsubscribe = display.on("change", setText);

    return unsubscribe;
  }, [display]);

  return <motion.span>{text}</motion.span>;
}

type TokenDetailRowProps = {
  label: string;
  tooltip: string;
  value: number;
};

function TokenDetailRow({ label, tooltip, value }: TokenDetailRowProps) {
  return (
    <tr className="sunny-agent-token-meter-detail-row">
      <td className="sunny-agent-token-meter-detail-label" title={tooltip}>{label}</td>
      <td className="sunny-agent-token-meter-detail-value"><AnimatedNumber value={value} /></td>
    </tr>
  );
}

export function AgentTokenMeter({ inputTokenEstimate, tokenUsage }: AgentTokenMeterProps) {
  const [showDetail, setShowDetail] = useState(false);
  const total = Math.max(tokenUsage.totalTokens, 1);
  const contextPct = getUsagePercent(tokenUsage.contextTokens, total);
  const sourceLabel = tokenUsage.source === "provider" ? "Provider 上报" : "本地估算";
  const hasProviderData =
    typeof tokenUsage.providerTotalTokens === "number" && tokenUsage.providerTotalTokens > 0;

  const toggleDetail = useCallback(() => {
    setShowDetail((prev) => !prev);
  }, []);

  return (
    <div className="sunny-agent-token-meter">
      <div className="sunny-agent-token-meter-head">
        <span className="sunny-agent-token-meter-label">用量（{sourceLabel}）</span>
        <strong className="sunny-agent-token-meter-total"><AnimatedNumber value={tokenUsage.totalTokens} /></strong>
        <button
          type="button"
          className="sunny-agent-token-meter-toggle"
          onClick={toggleDetail}
          aria-expanded={showDetail}
          aria-label={showDetail ? "收起用量详情" : "展开用量详情"}
        >
          {showDetail ? "收起" : "详情"}
        </button>
      </div>
      <div className="sunny-agent-token-meter-bar" aria-hidden="true">
        <motion.span
          animate={{ width: `${contextPct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <AnimatePresence mode="wait">
        {showDetail ? (
          <motion.table
            key="detail"
            className="sunny-agent-token-meter-detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <tbody>
              <TokenDetailRow
                label="上下文"
                tooltip="Agent 加载的历史对话和工作区数据量"
                value={tokenUsage.contextTokens}
              />
              <TokenDetailRow
                label="输入"
                tooltip="本轮用户消息预估 token 数"
                value={tokenUsage.inputTokens}
              />
              <TokenDetailRow
                label="输出"
                tooltip="Agent 回复内容预估 token 数"
                value={tokenUsage.outputTokens}
              />
              <TokenDetailRow
                label="用户输入估算"
                tooltip="当前输入框中文本的预估 token 数"
                value={inputTokenEstimate}
              />
              {hasProviderData ? (
                <>
                  <tr className="sunny-agent-token-meter-detail-separator">
                    <td colSpan={2}>Provider 上报</td>
                  </tr>
                  <TokenDetailRow
                    label="Provider 输入"
                    tooltip="模型提供商上报的实际输入 token 数"
                    value={tokenUsage.providerInputTokens ?? 0}
                  />
                  <TokenDetailRow
                    label="Provider 输出"
                    tooltip="模型提供商上报的实际输出 token 数"
                    value={tokenUsage.providerOutputTokens ?? 0}
                  />
                  <TokenDetailRow
                    label="Provider 合计"
                    tooltip="模型提供商上报的总 token 数"
                    value={tokenUsage.providerTotalTokens ?? 0}
                  />
                </>
              ) : null}
            </tbody>
          </motion.table>
        ) : (
          <motion.p
            key="note"
            className="sunny-agent-token-meter-note"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            输入约 <AnimatedNumber value={inputTokenEstimate} /> · 上下文{" "}
            <AnimatedNumber value={tokenUsage.contextTokens} /> · 输出 <AnimatedNumber value={tokenUsage.outputTokens} />
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
