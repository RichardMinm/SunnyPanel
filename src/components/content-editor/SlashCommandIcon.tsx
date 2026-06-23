import type { ReactNode } from "react";

export type SlashCommandIconName =
  | "attachment"
  | "bulletList"
  | "calloutInfo"
  | "calloutSuccess"
  | "calloutWarning"
  | "codeBlock"
  | "date"
  | "datetime"
  | "divider"
  | "heading1"
  | "heading2"
  | "heading3"
  | "image"
  | "math"
  | "orderedList"
  | "pageBreak"
  | "paragraph"
  | "pdf"
  | "quote"
  | "table"
  | "taskList"
  | "time"
  | "toggle"
  | "video";

const ICON_PATHS: Record<SlashCommandIconName, ReactNode> = {
  attachment: (
    <>
      <path d="M7.5 11.75 12.25 7a2.25 2.25 0 1 1 3.18 3.18l-5.43 5.43a3.5 3.5 0 1 1-4.95-4.95l5.75-5.75" />
    </>
  ),
  bulletList: (
    <>
      <path d="M7.25 6.25h7.5M7.25 10h7.5M7.25 13.75h7.5" />
      <path d="M4.75 6.25h.05M4.75 10h.05M4.75 13.75h.05" />
    </>
  ),
  calloutInfo: (
    <>
      <path d="M10 5.75v.05" />
      <path d="M10 8.75v4.5" />
      <path d="M10 3.75a6.25 6.25 0 1 1 0 12.5 6.25 6.25 0 0 1 0-12.5Z" />
    </>
  ),
  calloutSuccess: (
    <>
      <path d="m7.25 10.25 1.75 1.75 3.75-3.75" />
      <path d="M10 3.75a6.25 6.25 0 1 1 0 12.5 6.25 6.25 0 0 1 0-12.5Z" />
    </>
  ),
  calloutWarning: (
    <>
      <path d="M10 8.25v3.25" />
      <path d="M10 5.75v.05" />
      <path d="m4.75 15.25 5.25-9 5.25 9z" />
    </>
  ),
  codeBlock: (
    <>
      <path d="m7.25 6.5-2 3.5 2 3.5M12.75 6.5l2 3.5-2 3.5" />
    </>
  ),
  date: (
    <>
      <path d="M5.25 4.75h9.5v10.5h-9.5zM7.25 3.75v2M12.75 3.75v2M5.25 8h9.5" />
    </>
  ),
  datetime: (
    <>
      <path d="M5.25 4.75h9.5v10.5h-9.5zM7.25 3.75v2M12.75 3.75v2M5.25 8h9.5" />
      <path d="M13.25 11.25h2.25v2.25h-2.25z" />
    </>
  ),
  divider: <path d="M4.75 10h10.5" />,
  heading1: (
    <>
      <path d="M5.25 6.25V14M5.25 10h4.5M12.75 6.25V14" />
      <path d="M12.75 6.25h3v3.25h-3" />
    </>
  ),
  heading2: (
    <>
      <path d="M5.25 6.75V14M5.25 10.25h4M12.25 6.75V14" />
      <path d="M12.25 6.75h2.75v2.5h-2.75" />
    </>
  ),
  heading3: (
    <>
      <path d="M5.25 7.25V14M5.25 10.5h3.5M11.75 7.25V14" />
      <path d="M11.75 7.25h2.25v2h-2.25" />
    </>
  ),
  image: (
    <>
      <path d="M4.75 6.25h10.5v8.5H4.75z" />
      <path d="m5.75 12.25 2.25-2 2.5 2.25L13.25 9l2 2.25" />
      <path d="M8.25 8.25h.05" />
    </>
  ),
  math: (
    <>
      <path d="M6.25 14 8.5 6.25 10 11.25 11.5 6.25 13.75 14" />
      <path d="M4.75 6.25h10.5" />
    </>
  ),
  orderedList: (
    <>
      <path d="M7.25 6.25h7.5M7.25 10h7.5M7.25 13.75h7.5" />
      <path d="M4.75 6.75h.05M4.75 10h.05M4.75 13.75h.05" />
      <path d="M4.25 5.75v1.5M4.25 9.5v1.5M4.25 13.25v1.5" />
    </>
  ),
  pageBreak: (
    <>
      <path d="M5.25 5.25h9.5v9.5H5.25z" />
      <path d="M5.25 10h9.5" strokeDasharray="1.5 1.5" />
    </>
  ),
  paragraph: (
    <>
      <path d="M5.25 6.25h9.5M5.25 10h6.5M5.25 13.75h8.5" />
    </>
  ),
  pdf: (
    <>
      <path d="M6.25 4.25h4.5l3 3v8.5h-7.5z" />
      <path d="M10.75 4.25v3h3" />
      <path d="M7.5 12.25h5" />
    </>
  ),
  quote: (
    <>
      <path d="M7.25 8.5c0-1.35-.75-2.25-2-2.25-1.1 0-2 .9-2 2.05 0 2.2 2 3.45 2 5.2H3.75c0-2.35 1.35-3.65 2.35-4.55.55-.5.85-1 .85-1.45Z" />
      <path d="M14.25 8.5c0-1.35-.75-2.25-2-2.25-1.1 0-2 .9-2 2.05 0 2.2 2 3.45 2 5.2h-1.6c0-2.35 1.35-3.65 2.35-4.55.55-.5.85-1 .85-1.45Z" />
    </>
  ),
  table: (
    <>
      <path d="M5.25 5.25h9.5v9.5h-9.5z" />
      <path d="M5.25 9.25h9.5M5.25 13.25h9.5M10 5.25v9.5" />
    </>
  ),
  taskList: (
    <>
      <path d="M7.25 6.25h7.5M7.25 10h7.5M7.25 13.75h7.5" />
      <path d="m4.75 6.25 1 1 1.75-1.75M4.75 10l1 1 1.75-1.75" />
    </>
  ),
  time: (
    <>
      <path d="M10 5.75a4.25 4.25 0 1 1 0 8.5 4.25 4.25 0 0 1 0-8.5Z" />
      <path d="M10 8.25V11l2 1.25" />
    </>
  ),
  toggle: (
    <>
      <path d="M7.25 8.25 10 11l2.75-2.75" />
      <path d="M5.25 5.25h9.5v9.5H5.25z" />
    </>
  ),
  video: (
    <>
      <path d="M5.25 6.25h6.5v7.5h-6.5z" />
      <path d="m11.75 9.25 3-1.75v5.5l-3-1.75z" />
    </>
  ),
};

export function SlashCommandIcon({ name }: { name: SlashCommandIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="sunny-rich-editor-slash-icon-svg"
      viewBox="0 0 20 20"
      fill="none"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45">
        {ICON_PATHS[name]}
      </g>
    </svg>
  );
}
