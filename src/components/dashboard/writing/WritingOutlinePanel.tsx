"use client";

import type { ContentOutlineItem } from "@/lib/rich-content/types";

type WritingOutlinePanelProps = {
  outline: ContentOutlineItem[];
};

export function WritingOutlinePanel({ outline }: WritingOutlinePanelProps) {
  return (
    <section className="sunny-writing-side-section" aria-label="内容层次">
      <h3>层次</h3>
      {outline.length ? (
        <ol className="sunny-writing-outline-list">
          {outline.map((item) => (
            <li className={`is-level-${item.level}`} key={item.id}>
              <a href={`#${item.id}`}>{item.text}</a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="sunny-writing-side-muted">使用 H2/H3 建立结构，Agent 会更容易整理。</p>
      )}
    </section>
  );
}
