"use client";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AppIconButton } from "@/components/primitives/AppIconButton";

type WritingLibraryHeaderProps = {
  libraryOpen?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
  showClose?: boolean;
};

export function WritingLibraryHeader({
  libraryOpen = true,
  onClose,
  onToggle,
  showClose = true,
}: WritingLibraryHeaderProps) {
  const showButton = showClose && (onClose || onToggle);

  return (
    <div
      className="sunny-writing-library-head"
      onClick={libraryOpen ? undefined : onToggle}
      role={libraryOpen ? undefined : "button"}
      tabIndex={libraryOpen ? undefined : 0}
      title={libraryOpen ? undefined : "展开文档集"}
    >
      <div className="sunny-writing-library-space-label">
        <span aria-hidden="true" className="sunny-writing-library-space-icon">
          <DashboardIcon name="layers" />
        </span>
        <span className="sunny-writing-library-space-title">文档集</span>
      </div>
      {showButton ? (
        <AppIconButton
          aria-label={libraryOpen ? "收起文档集" : "展开文档集"}
          className="sunny-writing-icon-button"
          icon={
            <DashboardIcon name={libraryOpen ? "chevronLeft" : "chevronRight"} />
          }
          onClick={libraryOpen ? onClose : onToggle}
          tooltip={libraryOpen ? "收起文档集" : "展开文档集"}
          variant="ghost"
        />
      ) : null}
    </div>
  );
}
