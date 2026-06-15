"use client";

import { useEffect, useRef, useState } from "react";

import {
  dashboardContentCollections,
  dashboardContentLabels,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";

type WritingLibraryHeaderProps = {
  onClose?: () => void;
  onCreateDocument: (collection: DashboardContentCollection) => void;
};

const createOptions = dashboardContentCollections.map((collection) => ({
  collection,
  label: `新${dashboardContentLabels[collection]}`,
}));

export function WritingLibraryHeader({ onClose, onCreateDocument }: WritingLibraryHeaderProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className="sunny-writing-library-head" ref={rootRef}>
      <div>
        <p className="sunny-writing-eyebrow">Dashboard Studio</p>
        <h2>写作</h2>
      </div>
      <div className="sunny-writing-library-actions">
        <div className="sunny-writing-create-dropdown">
          <button
            aria-expanded={open}
            aria-haspopup="menu"
            className="sunny-writing-primary-button"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            新建 ▾
          </button>
          {open ? (
            <div className="sunny-writing-create-menu" role="menu">
              {createOptions.map((option) => (
                <button
                  key={option.collection}
                  onClick={() => {
                    onCreateDocument(option.collection);
                    setOpen(false);
                  }}
                  role="menuitem"
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {onClose ? (
          <button
            aria-label="收起内容库"
            className="sunny-writing-icon-button"
            onClick={onClose}
            title="收起内容库"
            type="button"
          >
            ◂
          </button>
        ) : null}
      </div>
    </div>
  );
}
