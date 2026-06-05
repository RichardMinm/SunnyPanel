type RiskBadgeTone = "danger" | "info" | "muted" | "suggestion" | "warning";

const toneByText = (value: string): RiskBadgeTone => {
  if (/高风险|高优先级|失败|错误/.test(value)) return "danger";
  if (/中风险|中优先级|警告|待处理/.test(value)) return "warning";
  if (/建议|记忆|规划/.test(value)) return "suggestion";
  if (/低风险|低优先级|成功|就绪/.test(value)) return "info";

  return "muted";
};

export function RiskBadge({
  children,
  tone,
}: {
  children: string;
  tone?: RiskBadgeTone;
}) {
  return (
    <span className={`sunny-risk-badge sunny-risk-badge-${tone ?? toneByText(children)}`}>
      {children}
    </span>
  );
}
