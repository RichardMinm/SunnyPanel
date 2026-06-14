"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useDashboardMotion } from "./dashboard-motion";

type DashboardInspectorTransitionProps = {
  panelKey: string;
  children: ReactNode;
};

export function DashboardInspectorTransition({ panelKey, children }: DashboardInspectorTransitionProps) {
  const { inspectorView } = useDashboardMotion();

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={panelKey}
        className="sunny-dashboard-inspector-transition"
        initial={inspectorView.initial}
        animate={inspectorView.animate}
        exit={inspectorView.exit}
        transition={inspectorView.transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
