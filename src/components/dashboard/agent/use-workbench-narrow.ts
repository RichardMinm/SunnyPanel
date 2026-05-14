"use client";

import { useEffect, useState } from "react";

/** 与 `globals.css` 中 Inspector 抽屉断点一致 */
export const WORKBENCH_INSPECTOR_DRAWER_MEDIA = "(max-width: 820px)";

export const useWorkbenchNarrow = () => {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(WORKBENCH_INSPECTOR_DRAWER_MEDIA);
    const apply = () => setNarrow(mq.matches);

    apply();
    mq.addEventListener("change", apply);

    return () => {
      mq.removeEventListener("change", apply);
    };
  }, []);

  return narrow;
};
