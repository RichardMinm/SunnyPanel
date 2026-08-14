"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  WritingCategoryIcon,
  WritingCategoryListItem,
  WritingCategoryTint,
} from "@/lib/dashboard/writing-categories/normalize";

type CategoryListResponse = {
  categories?: WritingCategoryListItem[];
  message?: string;
};

type CategoryResponse = {
  category?: WritingCategoryListItem;
  message?: string;
};

const readDashboardJson = async <T extends { message?: string }>(response: Response): Promise<T> => {
  const body = (await response.json().catch(() => null)) as null | T;

  if (!response.ok) {
    throw new Error(body?.message ?? "请求失败");
  }

  if (!body) {
    throw new Error("响应为空");
  }

  return body;
};

export function useWritingCategories() {
  const [categories, setCategories] = useState<WritingCategoryListItem[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<null | number>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<null | string>(null);

  const loadCategories = useCallback(async (options?: { includeArchived?: boolean }) => {
    setIsLoadingCategories(true);
    setCategoryError(null);

    try {
      const params = new URLSearchParams();
      if (options?.includeArchived) {
        params.set("archived", "true");
      }

      const endpoint = `/api/dashboard/writing-categories${params.size ? `?${params.toString()}` : ""}`;
      const data = await readDashboardJson<CategoryListResponse>(await fetch(endpoint));
      setCategories(data.categories ?? []);
    } catch (nextError) {
      setCategoryError(nextError instanceof Error ? nextError.message : "加载文档集失败");
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  const createCategory = useCallback(
    async (input: {
      icon?: WritingCategoryIcon;
      parentId?: null | number;
      title: string;
      tint?: WritingCategoryTint;
    }) => {
      setCategoryError(null);

      try {
        const data = await readDashboardJson<CategoryResponse>(
          await fetch("/api/dashboard/writing-categories", {
            body: JSON.stringify(input),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }),
        );

        const category = data.category;
        if (!category) {
          throw new Error("创建文档集失败");
        }

        setCategories((current) =>
          [...current.filter((item) => item.id !== category.id), category].sort(
            (left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, "zh-CN"),
          ),
        );
        setActiveCategoryId(category.id);
        return category;
      } catch (nextError) {
        setCategoryError(nextError instanceof Error ? nextError.message : "创建文档集失败");
        return null;
      }
    },
    [],
  );

  const updateCategory = useCallback(
    async (
      id: number,
      patch: Partial<Pick<WritingCategoryListItem, "archived" | "icon" | "parentId" | "sortOrder" | "tint" | "title">>,
    ) => {
      setCategoryError(null);

      try {
        const data = await readDashboardJson<CategoryResponse>(
          await fetch(`/api/dashboard/writing-categories/${id}`, {
            body: JSON.stringify(patch),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }),
        );

        const category = data.category;
        if (!category) {
          throw new Error("更新文档集失败");
        }

        setCategories((current) =>
          current
            .map((item) => (item.id === category.id ? category : item))
            .sort(
              (left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, "zh-CN"),
            ),
        );
        return category;
      } catch (nextError) {
        setCategoryError(nextError instanceof Error ? nextError.message : "更新文档集失败");
        return null;
      }
    },
    [],
  );

  const archiveCategory = useCallback(
    async (id: number) => updateCategory(id, { archived: true }),
    [updateCategory],
  );

  const deleteCategory = useCallback(async (id: number) => {
    setCategoryError(null);

    try {
      await readDashboardJson<{ message?: string }>(
        await fetch(`/api/dashboard/writing-categories/${id}`, {
          method: "DELETE",
        }),
      );
      setCategories((current) => current.filter((item) => item.id !== id));
      setActiveCategoryId((current) => (current === id ? null : current));
      return true;
    } catch (nextError) {
      setCategoryError(nextError instanceof Error ? nextError.message : "删除文档集失败");
      return false;
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- initial category fetch hydrates hook state from the dashboard API */
    void loadCategories();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadCategories]);

  return {
    activeCategoryId,
    archiveCategory,
    categories,
    categoryError,
    createCategory,
    deleteCategory,
    isLoadingCategories,
    loadCategories,
    setActiveCategoryId,
    updateCategory,
  };
}
