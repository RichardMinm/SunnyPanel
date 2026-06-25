"use client";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AppIconButton } from "@/components/primitives/AppIconButton";

type WritingLibraryHeaderProps = {
  onClose?: () => void;
  showClose?: boolean;
};

export function WritingLibraryHeader({ onClose, showClose = true }: WritingLibraryHeaderProps) {
  return (
    <div className="sunny-writing-library-head">
      <div className="sunny-writing-library-space-label">
        <span aria-hidden="true" className="sunny-writing-library-space-icon">
          <DashboardIcon name="layers" />
        </span>
        <span className="sunny-writing-library-space-title">文档集</span>
      </div>
      {onClose && showClose ? (
        <AppIconButton
          aria-label="收起内容库"
          className="sunny-writing-icon-button"
          icon={<DashboardIcon name="chevronLeft" />}
          onClick={onClose}
          tooltip="收起内容库"
          variant="ghost"
        />
      ) : null}
    </div>
  );
}
