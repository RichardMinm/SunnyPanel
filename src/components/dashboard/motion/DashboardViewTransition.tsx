"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useDashboardMotion } from "./dashboard-motion";

type DashboardViewTransitionProps = {
  children: ReactNode;
  modeKey: string;
};

export function DashboardViewTransition({ children, modeKey }: DashboardViewTransitionProps) {
  const { modeView } = useDashboardMotion();

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={modeKey}
        className="sunny-dashboard-view-transition"
        initial={modeView.initial}
        animate={modeView.animate}
        exit={modeView.exit}
        transition={modeView.transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
