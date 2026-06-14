"use client";

type SuggestionChip = {
  label: string;
  prompt: string;
};

const DEFAULT_SUGGESTIONS: SuggestionChip[] = [
  { label: "安排今天", prompt: "帮我安排今天的日程" },
  { label: "查看最近日程", prompt: "帮我查看最近的日程安排" },
  { label: "总结学习进度", prompt: "总结一下当前的学习进度" },
  { label: "创建清单", prompt: "帮我创建一个待办清单" },
];

type AgentSuggestionChipsProps = {
  disabled?: boolean;
  onSelect: (prompt: string) => void;
};

export function AgentSuggestionChips({ disabled, onSelect }: AgentSuggestionChipsProps) {
  return (
    <div className="sunny-agent-suggestion-chips" aria-label="快捷操作建议">
      {DEFAULT_SUGGESTIONS.map((chip) => (
        <button
          key={chip.label}
          type="button"
          className="sunny-agent-suggestion-chip"
          disabled={disabled}
          onClick={() => onSelect(chip.prompt)}
          title={chip.prompt}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
