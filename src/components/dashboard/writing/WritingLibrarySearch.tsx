"use client";

type WritingLibrarySearchProps = {
  onChange: (value: string) => void;
  value: string;
};

export function WritingLibrarySearch({ onChange, value }: WritingLibrarySearchProps) {
  return (
    <label className="sunny-writing-library-search">
      <span className="sr-only">搜索内容</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索文章、动态、页面..."
        type="search"
        value={value}
      />
    </label>
  );
}
