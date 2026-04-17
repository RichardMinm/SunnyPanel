import { RichText } from "@payloadcms/richtext-lexical/react";

import type { Post } from "@/payload-types";

type RichTextContentProps = {
  data: Post["content"];
};

export function RichTextContent({ data }: RichTextContentProps) {
  return (
    <div className="prose prose-zinc max-w-none prose-headings:font-semibold prose-a:text-accent-strong">
      <RichText data={data} />
    </div>
  );
}
