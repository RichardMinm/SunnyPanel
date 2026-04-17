const longDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "long",
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
