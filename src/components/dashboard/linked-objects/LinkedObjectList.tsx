"use client";

import { useState } from "react";

import { AppButton } from "@/components/primitives";
import type { LinkedObjectSummary } from "@/lib/core-linkage/contracts";

import {
  LinkedObjectLink,
  type LinkedObjectSelectHandler,
} from "./LinkedObjectLink";

const COLLAPSED_ITEM_LIMIT = 3;

export type LinkedObjectListProps = {
  defaultExpanded?: boolean;
  expanded?: boolean;
  isUnavailable?: (summary: LinkedObjectSummary) => boolean;
  items: LinkedObjectSummary[];
  onExpandedChange?: (expanded: boolean) => void;
  onSelect?: LinkedObjectSelectHandler;
};

export function LinkedObjectList({
  defaultExpanded = false,
  expanded,
  isUnavailable,
  items,
  onExpandedChange,
  onSelect,
}: LinkedObjectListProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const isExpanded = expanded ?? internalExpanded;

  if (items.length === 0) {
    return (
      <p className="sunny-linked-object-list__empty">暂无关联对象</p>
    );
  }

  const visibleItems = isExpanded
    ? items
    : items.slice(0, COLLAPSED_ITEM_LIMIT);
  const remainingCount = items.length - visibleItems.length;
  const canToggle = !isControlled || Boolean(onExpandedChange);
  const setExpanded = (nextExpanded: boolean) => {
    if (!isControlled) {
      setInternalExpanded(nextExpanded);
    }
    onExpandedChange?.(nextExpanded);
  };

  return (
    <div className="sunny-linked-object-list">
      <ul className="sunny-linked-object-list__items">
        {visibleItems.map((item) => (
          <li key={`${item.type}:${item.id}`}>
            <LinkedObjectLink
              onSelect={onSelect}
              summary={item}
              unavailable={isUnavailable?.(item) ?? false}
            />
          </li>
        ))}
      </ul>
      {remainingCount > 0 ? (
        <AppButton
          className="sunny-linked-object-list__toggle"
          disabled={!canToggle}
          onClick={() => setExpanded(true)}
          size="sm"
          variant="ghost"
        >
          展开其余 {remainingCount} 项
        </AppButton>
      ) : items.length > COLLAPSED_ITEM_LIMIT ? (
        <AppButton
          className="sunny-linked-object-list__toggle"
          disabled={!canToggle}
          onClick={() => setExpanded(false)}
          size="sm"
          variant="ghost"
        >
          收起关联对象
        </AppButton>
      ) : null}
    </div>
  );
}
