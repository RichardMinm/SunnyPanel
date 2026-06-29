"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AppSearchInput } from "@/components/primitives/AppSearchInput";
import { DashboardStagger, DashboardStaggerItem } from "../motion/DashboardStagger";

type MemorySummary = {
  id: number;
  title: string;
  type: string;
  confidence: number;
  content: string;
  lastUsedAt: null | string;
  updatedAt: string;
};

type MemoryCardGridProps = {
  onBackToWorkbench: () => void;
  threadId: null | number;
};

const TYPE_LABELS: Record<string, string> = {
  fact: "事实",
  preference: "偏好",
  project_context: "项目上下文",
  workflow_rule: "工作流规则",
  writing_style: "写作风格",
};

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "preference", label: "偏好" },
  { value: "project_context", label: "项目上下文" },
  { value: "writing_style", label: "写作风格" },
  { value: "workflow_rule", label: "工作流规则" },
  { value: "fact", label: "事实" },
];

function relativeTime(iso: null | string): string {
  if (!iso) return "从未使用";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function MemoryCardGrid({ onBackToWorkbench }: MemoryCardGridProps) {
  const [memories, setMemories] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<null | number>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchMemories = useCallback((q: string, type: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", "30");

    fetch(`/api/agent/memory?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            typeof data?.message === "string" ? data.message : "加载失败",
          );
        }
        return res.json();
      })
      .then((data: { memories: MemorySummary[] }) =>
        setMemories(data.memories ?? []),
      )
      .catch((err) =>
        setError(err instanceof Error ? err.message : "加载记忆失败"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern consistent with dashboard views
    fetchMemories("", "");
  }, [fetchMemories]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => fetchMemories(value, typeFilter),
        300,
      );
    },
    [fetchMemories, typeFilter],
  );

  const handleTypeChange = useCallback(
    (value: string) => {
      setTypeFilter(value);
      fetchMemories(query, value);
    },
    [fetchMemories, query],
  );

  const renderMemoryCard = (mem: MemorySummary) => (
    <div
      className={`sunny-memory-card${expandedId === mem.id ? " is-expanded" : ""}`}
      onClick={() => setExpandedId(expandedId === mem.id ? null : mem.id)}
    >
      <div className="sunny-memory-card-header">
        <span className={`sunny-memory-type-badge is-${mem.type}`}>
          {TYPE_LABELS[mem.type] ?? mem.type}
        </span>
        {mem.confidence >= 0.8 ? (
          <span className="sunny-memory-star" title="高置信度">
            ★
          </span>
        ) : null}
      </div>
      <h3 className="sunny-memory-card-title">{mem.title}</h3>
      <span className="sunny-memory-card-time">{relativeTime(mem.lastUsedAt)}</span>
      {expandedId === mem.id ? (
        <p className="sunny-memory-card-content">{mem.content}</p>
      ) : null}
    </div>
  );

  return (
    <div className="sunny-memory-card-grid">
      <div className="sunny-memory-head">
        <button
          type="button"
          className="sunny-memory-back-btn"
          onClick={onBackToWorkbench}
        >
          ← 返回工作台
        </button>
        <div className="sunny-memory-toolbar">
          <AppSearchInput
            className="sunny-memory-search"
            onClear={() => handleQueryChange("")}
            placeholder="搜索记忆标题..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          <select
            className="sunny-memory-type-filter"
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <span className="sunny-memory-count">
          {loading
            ? "加载中..."
            : error
              ? `错误: ${error}`
              : `${memories.length} 条记忆`}
        </span>
      </div>

      <DashboardStagger className="sunny-memory-cards">
        {memories.map((mem, index) =>
          index < 6 ? (
            <DashboardStaggerItem key={mem.id}>{renderMemoryCard(mem)}</DashboardStaggerItem>
          ) : (
            <div key={mem.id}>{renderMemoryCard(mem)}</div>
          ),
        )}
        {!loading && memories.length === 0 ? (
          <p className="sunny-memory-empty">暂无记忆记录</p>
        ) : null}
      </DashboardStagger>
    </div>
  );
}
