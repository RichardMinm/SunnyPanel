const longDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "long",
});

const shortDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatDate = (value?: null | string) => {
  if (!value) {
    return "未设置日期";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "无效日期";
  }

  return longDateFormatter.format(date);
};

export const formatShortDate = (value?: null | string) => {
  if (!value) {
    return "未设置日期";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "无效日期";
  }

  return shortDateFormatter.format(date);
};

export const formatDateTime = (value?: null | string) => {
  if (!value) {
    return "未设置时间";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "无效时间";
  }

  return dateTimeFormatter.format(date);
};
