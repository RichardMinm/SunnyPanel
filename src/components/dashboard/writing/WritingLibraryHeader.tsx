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
      <p className="sunny-writing-library-eyebrow">文档集</p>
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
