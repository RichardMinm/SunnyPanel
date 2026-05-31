"use client";

import { StatusBadge } from "./StatusBadge";

export type ResultCardProps = {
  title: string;
  fields: Array<{ label: string; value: string }>;
  actions?: Array<{ label: string; href: string }>;
};

export function ResultCard({ title, fields, actions }: ResultCardProps) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3 dark:border-green-800 dark:bg-green-950/30">
      <div className="flex items-center gap-2">
        <StatusBadge tone="green">已完成</StatusBadge>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {fields.map((field) => (
          <div key={field.label}>
            <span className="text-muted">{field.label}</span>
            <p className="font-medium text-foreground">{field.value}</p>
          </div>
        ))}
      </div>
      {actions && actions.length > 0 ? (
        <div className="flex gap-2 pt-1">
          {actions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="rounded-md border border-border px-3 py-1 text-sm font-medium text-foreground hover:bg-surface"
            >
              {action.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
