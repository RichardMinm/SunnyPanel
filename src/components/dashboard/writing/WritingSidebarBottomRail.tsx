"use client";

import { useState } from "react";

import { DashboardSettingsMenu } from "@/components/dashboard/DashboardSettingsMenu";
import { DashboardIcon } from "@/components/dashboard/icons";
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
} from "@/components/primitives/AppDropdownMenu";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";
import {
  dashboardContentCollections,
  dashboardContentLabels,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";

import { CreateWritingCategoryDialog } from "./CreateWritingCategoryDialog";
import { useWritingDocumentsContext } from "./WritingDocumentsContext";
import { useWritingLibraryFiltersContext } from "./WritingLibraryFiltersContext";
import { WritingLibrarySearchDialog } from "./WritingLibrarySearchDialog";

const createOptions = dashboardContentCollections.map((collection) => ({
  collection,
  label: `新${dashboardContentLabels[collection]}`,
}));

export function WritingSidebarBottomRail() {
  const { locale, palette } = useSitePreferences();
  const {
    activeCategoryId,
    createCategory,
    createDocument,
    documents,
    handleSelectDocument,
    loadCategories,
  } = useWritingDocumentsContext();

  const {
    createCategoryOpen,
    draftFilter,
    searchOpen,
    setCreateCategoryOpen,
    setSearchOpen,
    showArchivedCategories,
    toggleArchivedCategories,
    toggleDraftFilter,
  } = useWritingLibraryFiltersContext();

  const [createCategoryBusy, setCreateCategoryBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleCreateCategory = async (
    input: Parameters<typeof createCategory>[0],
  ) => {
    setCreateCategoryBusy(true);
    const created = await createCategory(input);
    setCreateCategoryBusy(false);

    if (created) {
      setCreateCategoryOpen(false);
    }
  };

  const handleCreateDocument = (collection: DashboardContentCollection) => {
    void createDocument(collection, { categoryId: activeCategoryId });
  };

  const handleToggleArchivedCategories = () => {
    const next = !showArchivedCategories;
    toggleArchivedCategories();
    void loadCategories({ includeArchived: next });
  };

  return (
    <>
      <div className="sunny-writing-sidebar-bottom-rail">
        <div className="sunny-writing-rail-section">
          <span className="sunny-writing-rail-section-label">内容</span>
          <div className="sunny-writing-rail-section-actions">
            <button
              className="sunny-dashboard-sidebar-action"
              onClick={() => setCreateCategoryOpen(true)}
              type="button"
            >
              <span className="sunny-dashboard-sidebar-icon">
                <DashboardIcon name="plus" />
              </span>
              <span className="sunny-dashboard-sidebar-label">新建文档集</span>
            </button>
            <AppDropdownMenu
              align="start"
              className="sunny-writing-menu"
              side="top"
              sideOffset={6}
              trigger={
                <>
                  <span className="sunny-dashboard-sidebar-icon">
                    <DashboardIcon name="plus" />
                  </span>
                  <span className="sunny-dashboard-sidebar-label">新建</span>
                </>
              }
              triggerAriaLabel="新建内容"
              triggerClassName="sunny-dashboard-sidebar-action"
            >
              <AppDropdownMenuLabel>新建</AppDropdownMenuLabel>
              {createOptions.map((option) => (
                <AppDropdownMenuItem
                  key={option.collection}
                  onSelect={() => handleCreateDocument(option.collection)}
                >
                  {option.label}
                </AppDropdownMenuItem>
              ))}
            </AppDropdownMenu>
            <button
              aria-pressed={draftFilter}
              className={`sunny-dashboard-sidebar-action${draftFilter ? " is-active" : ""}`}
              onClick={toggleDraftFilter}
              type="button"
            >
              <span className="sunny-dashboard-sidebar-icon">
                <DashboardIcon name="archive" />
              </span>
              <span className="sunny-dashboard-sidebar-label">草稿</span>
            </button>
            <button
              aria-pressed={showArchivedCategories}
              className={`sunny-dashboard-sidebar-action${showArchivedCategories ? " is-active" : ""}`}
              onClick={handleToggleArchivedCategories}
              type="button"
            >
              <span className="sunny-dashboard-sidebar-icon">
                <DashboardIcon name="layers" />
              </span>
              <span className="sunny-dashboard-sidebar-label">归档</span>
            </button>
          </div>
        </div>

        <div className="sunny-writing-rail-section">
          <span className="sunny-writing-rail-section-label">工具</span>
          <div className="sunny-writing-rail-section-actions">
            <button
              className="sunny-dashboard-sidebar-action"
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <span className="sunny-dashboard-sidebar-icon">
                <DashboardIcon name="search" />
              </span>
              <span className="sunny-dashboard-sidebar-label">搜索</span>
            </button>
            <DashboardSettingsMenu
              locale={locale}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              palette={palette}
              triggerClassName="sunny-dashboard-sidebar-action sunny-dashboard-sidebar-settings-trigger"
              trigger={
                <>
                  <span className="sunny-dashboard-sidebar-icon">
                    <DashboardIcon name="settings" />
                  </span>
                  <span className="sunny-dashboard-sidebar-label">设置</span>
                </>
              }
            />
          </div>
        </div>
      </div>

      <WritingLibrarySearchDialog
        documents={documents}
        onOpenChange={setSearchOpen}
        onSelectDocument={(document) => void handleSelectDocument(document)}
        open={searchOpen}
      />

      <CreateWritingCategoryDialog
        busy={createCategoryBusy}
        onCancel={() => setCreateCategoryOpen(false)}
        onCreate={handleCreateCategory}
        open={createCategoryOpen}
      />
    </>
  );
}
