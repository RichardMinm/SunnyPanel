"use client";

import Link from "next/link";

import { useDashboardInspectorControl } from "@/components/dashboard/DashboardInspectorControlContext";
import { AppButton } from "@/components/primitives/AppButton";

type ResultWorkspace = "checklist" | "plan" | "schedule";

type AgentResultDeliveryProps = {
  rollbackAvailable?: boolean;
  statusLabel: string;
  workspace: ResultWorkspace;
};

const workspaceLabels: Record<ResultWorkspace, string> = {
  checklist: "打开清单",
  plan: "打开计划",
  schedule: "打开日程",
};

const workspaceHrefs: Partial<Record<ResultWorkspace, string>> = {
  checklist: "/dashboard?mode=checklist",
  schedule: "/dashboard?mode=schedule",
};

export function AgentResultDelivery({
  rollbackAvailable = false,
  statusLabel,
  workspace,
}: AgentResultDeliveryProps) {
  const { openInspector } = useDashboardInspectorControl();
  const href = workspaceHrefs[workspace];

  return (
    <footer className="sunny-agent-result-delivery">
      <div className="sunny-agent-result-delivery-status">
        <span aria-hidden="true" className="sunny-agent-result-delivery-dot" />
        <span>{statusLabel}</span>
        {rollbackAvailable ? <small>可撤销</small> : null}
      </div>

      {href ? (
        <Link className="sunny-agent-result-delivery-action" href={href}>
          {workspaceLabels[workspace]}
        </Link>
      ) : (
        <AppButton
          className="sunny-agent-result-delivery-action"
          onClick={() => openInspector("plans")}
          size="sm"
          variant="ghost"
        >
          {workspaceLabels[workspace]}
        </AppButton>
      )}
    </footer>
  );
}
