"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { useDashboardStaggerVariants } from "./dashboard-motion";

type DashboardStaggerProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardStagger({ children, className }: DashboardStaggerProps) {
  const { container } = useDashboardStaggerVariants();

  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

type DashboardStaggerItemProps = {
  children: ReactNode;
  className?: string;
};

export function DashboardStaggerItem({ children, className }: DashboardStaggerItemProps) {
  const { item } = useDashboardStaggerVariants();

  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
