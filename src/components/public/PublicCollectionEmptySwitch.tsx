import type { ReactNode } from "react";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";

type PublicCollectionEmptySwitchProps = {
  body: string;
  children: ReactNode;
  isEmpty: boolean;
  title: string;
};

export function PublicCollectionEmptySwitch({
  body,
  children,
  isEmpty,
  title,
}: PublicCollectionEmptySwitchProps) {
  if (isEmpty) {
    return <CollectionEmptyState body={body} title={title} />;
  }

  return <>{children}</>;
}
