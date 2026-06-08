"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ThreadRowMenuProps = {
  threadId: number;
  threadTitle: string;
  onArchive: (id: number) => void;
};

export function ThreadRowMenu({ threadId, threadTitle, onArchive }: ThreadRowMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, closeMenu]);

  const handleArchiveClick = useCallback(() => {
    setMenuOpen(false);
    setConfirmOpen(true);
  }, []);

  const handleConfirmArchive = useCallback(() => {
    setConfirmOpen(false);
    onArchive(threadId);
  }, [onArchive, threadId]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  return (
    <>
      <div className="sunny-thread-row-menu" ref={menuRef}>
        <button
          type="button"
          className="sunny-thread-row-menu-trigger"
          aria-label={`会话「${threadTitle}」操作`}
          onClick={(e) => {
            e.stopPropagation();
            const nextOpen = !menuOpen;
            setMenuOpen(nextOpen);
            if (nextOpen) {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setDropUp(window.innerHeight - rect.bottom < 96);
            }
          }}
        >
          ⋮
        </button>
        {menuOpen && (
          <div className={`sunny-thread-row-menu-dropdown${dropUp ? " is-drop-up" : ""}`} role="menu">
            <button
              type="button"
              className="sunny-thread-row-menu-item"
              role="menuitem"
              onClick={handleArchiveClick}
            >
              归档
            </button>
          </div>
        )}
      </div>
      {confirmOpen && (
        <div
          className="sunny-confirm-overlay"
          onClick={handleCancelConfirm}
          role="dialog"
          aria-modal="true"
          aria-label="确认归档"
        >
          <div
            className="sunny-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="sunny-confirm-title">确认归档</p>
            <p className="sunny-confirm-message">
              归档后可在「已归档」区找回。确定归档会话「{threadTitle}」？
            </p>
            <div className="sunny-confirm-actions">
              <button
                type="button"
                className="sunny-confirm-btn-cancel"
                onClick={handleCancelConfirm}
              >
                取消
              </button>
              <button
                type="button"
                className="sunny-confirm-btn-warning"
                onClick={handleConfirmArchive}
              >
                确认归档
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
