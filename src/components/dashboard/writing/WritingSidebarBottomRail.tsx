"use client";

import { useState } from "react";

import { DashboardSettingsMenu } from "@/components/dashboard/DashboardSettingsMenu";
import { DashboardIcon } from "@/components/dashboard/icons";
import { SidebarItem } from "@/components/layout/SidebarItem";
import { SidebarSection } from "@/components/layout/SidebarSection";
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
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
        <SidebarSection
          className="sunny-writing-rail-section"
          title="内容"
        >
          <div className="sunny-writing-rail-section-actions">
            <AppDropdownMenu
              align="start"
              className="sunny-writing-menu"
              side="top"
              sideOffset={6}
              triggerAriaLabel="新建"
              triggerAsChild
              trigger={
                <SidebarItem
                  className="sunny-dashboard-sidebar-action"
                  icon={<DashboardIcon name="plus" />}
                  label="新建"
                />
              }
            >
              <AppDropdownMenuLabel>新建文章</AppDropdownMenuLabel>
              {createOptions.map((option) => (
                <AppDropdownMenuItem
                  key={option.collection}
                  onSelect={() => handleCreateDocument(option.collection)}
                >
                  {option.label}
                </AppDropdownMenuItem>
              ))}
              <AppDropdownMenuSeparator />
              <AppDropdownMenuItem onSelect={() => setCreateCategoryOpen(true)}>
                新建文档集
              </AppDropdownMenuItem>
            </AppDropdownMenu>
            <SidebarItem
              active={draftFilter}
              className="sunny-dashboard-sidebar-action"
              icon={<DashboardIcon name="archive" />}
              label="草稿"
              onClick={toggleDraftFilter}
            />
            <SidebarItem
              active={showArchivedCategories}
              className="sunny-dashboard-sidebar-action"
              icon={<DashboardIcon name="layers" />}
              label="归档"
              onClick={handleToggleArchivedCategories}
            />
          </div>
        </SidebarSection>

        <SidebarSection
          className="sunny-writing-rail-section"
          title="工具"
        >
          <div className="sunny-writing-rail-section-actions">
            <SidebarItem
              className="sunny-dashboard-sidebar-action"
              icon={<DashboardIcon name="search" />}
              label="搜索"
              onClick={() => setSearchOpen(true)}
            />
            <DashboardSettingsMenu
              locale={locale}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              palette={palette}
              triggerAsChild
              trigger={
                <SidebarItem
                  className="sunny-dashboard-sidebar-action sunny-dashboard-sidebar-settings-trigger"
                  icon={<DashboardIcon name="settings" />}
                  label="设置"
                  tooltip="设置"
                />
              }
            />
          </div>
        </SidebarSection>
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
