import type { WritingSaveState } from "@/components/dashboard/writing/writing-types";

type WritingSaveStatusInput = {
  error?: null | string;
  isDirty?: boolean;
  saveState: WritingSaveState;
};

export const formatWritingSaveStatusLabel = ({
  error,
  isDirty = false,
  saveState,
}: WritingSaveStatusInput): string => {
  if (saveState === "error" || error) {
    return error ?? "保存失败";
  }

  if (saveState === "saving") {
    return "保存中...";
  }

  if (isDirty || saveState === "dirty") {
    return "有未保存修改";
  }

  return "已保存";
};

export const formatWritingSaveStatusDisplay = (input: WritingSaveStatusInput) => {
  const label = formatWritingSaveStatusLabel(input);
  const isError = input.saveState === "error" || Boolean(input.error);
  const isDirty = input.isDirty || input.saveState === "dirty";

  return {
    className: [
      "sunny-dashboard-status-writing",
      isError ? "is-error" : "",
      isDirty ? "is-dirty" : "",
    ]
      .filter(Boolean)
      .join(" "),
    label,
  };
};
