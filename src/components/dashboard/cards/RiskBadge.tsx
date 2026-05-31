/* src/components/dashboard/cards/RiskBadge.tsx */
import { StatusBadge, type StatusTone } from "./StatusBadge";

const riskToneMap: Record<string, StatusTone> = {
  high: "red",
  medium: "yellow",
  low: "green",
};

const riskLabelMap: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

export function RiskBadge({ level }: { level: "high" | "medium" | "low" }) {
  return <StatusBadge tone={riskToneMap[level]}>{riskLabelMap[level]}</StatusBadge>;
}
