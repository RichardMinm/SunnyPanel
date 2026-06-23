"use client";

import { useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
} from "@/components/primitives/AppDropdownMenu";

export type ThreadRowMenuAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

export type ThreadRowMenuProps = {
  threadId: number;
  threadTitle: string;
  menuItems?: ThreadRowMenuAction[];
  onArchive?: (id: number) => void;
};

export function ThreadRowMenu({
  threadId,
  threadTitle,
  menuItems,
  onArchive,
}: ThreadRowMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleArchiveClick = useCallback(() => {
    setMenuOpen(false);
    setConfirmOpen(true);
  }, []);

  const handleConfirmArchive = useCallback(() => {
    setConfirmOpen(false);
    onArchive?.(threadId);
  }, [onArchive, threadId]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  const handleMenuItemClick = useCallback((item: ThreadRowMenuAction) => {
    setMenuOpen(false);
    item.onClick();
  }, []);

  return (
    <>
      <div className="sunny-thread-row-menu">
        <AppDropdownMenu
        align="end"
        collisionPadding={16}
        onOpenChange={setMenuOpen}
        open={menuOpen}
        side="bottom"
        sideOffset={4}
        trigger="⋮"
        triggerAriaLabel={`会话「${threadTitle}」操作`}
        triggerClassName="sunny-thread-row-menu-trigger"
        onTriggerClick={(event) => event.stopPropagation()}
      >
        {menuItems ? (
          menuItems.map((item, index) => (
            <AppDropdownMenuItem
              key={index}
              className={item.danger ? "is-danger" : undefined}
              onSelect={() => handleMenuItemClick(item)}
            >
              {item.label}
            </AppDropdownMenuItem>
          ))
        ) : (
          <AppDropdownMenuItem onSelect={handleArchiveClick}>归档</AppDropdownMenuItem>
        )}
      </AppDropdownMenu>
      </div>
      <ConfirmDialog
        confirmLabel="确认归档"
        message={`归档后可在「已归档」区找回。确定归档会话「${threadTitle}」？`}
        onCancel={handleCancelConfirm}
        onConfirm={handleConfirmArchive}
        open={confirmOpen}
        title="确认归档"
        variant="warning"
      />
    </>
  );
}
