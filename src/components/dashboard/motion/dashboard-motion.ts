"use client";

import type { Transition, Variants } from "motion/react";
import { useReducedMotion } from "motion/react";

export const dashboardModeTransition = {
  duration: 0.24,
  ease: "easeOut" as const,
};

export const dashboardInspectorTransition = {
  duration: 0.2,
  ease: "easeOut" as const,
};

export const dashboardLayoutTransition = {
  duration: 0.28,
  ease: "easeOut" as const,
};

export const agentMotionTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

export function useDashboardMotion() {
  const prefersReducedMotion = useReducedMotion();

  const modeView = {
    initial: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    exit: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 },
    transition: {
      duration: prefersReducedMotion ? 0.16 : dashboardModeTransition.duration,
      ease: dashboardModeTransition.ease,
    } satisfies Transition,
  };

  const inspectorView = {
    initial: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 8 },
    animate: { opacity: 1, x: 0 },
    exit: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -6 },
    transition: {
      duration: prefersReducedMotion ? 0.16 : dashboardInspectorTransition.duration,
      ease: dashboardInspectorTransition.ease,
    } satisfies Transition,
  };

  const messageView = {
    initial: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 0 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0 },
    transition: {
      duration: prefersReducedMotion ? 0.12 : agentMotionTransition.duration,
      ease: agentMotionTransition.ease,
    },
  };

  const agentSurfaceView = {
    initial: prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.992, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.996, y: -4 },
    transition: {
      duration: prefersReducedMotion ? 0.12 : agentMotionTransition.duration,
      ease: agentMotionTransition.ease,
    },
  };

  const agentDisclosureView = {
    initial: prefersReducedMotion
      ? { opacity: 0 }
      : { height: 0, opacity: 0, y: -4 },
    animate: prefersReducedMotion
      ? { opacity: 1 }
      : { height: "auto", opacity: 1, y: 0 },
    exit: prefersReducedMotion
      ? { opacity: 0 }
      : { height: 0, opacity: 0, y: -4 },
    transition: {
      duration: prefersReducedMotion ? 0.1 : 0.2,
      ease: agentMotionTransition.ease,
    },
  };

  const agentStatusView = {
    initial: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 5 },
    animate: { opacity: 1, y: 0 },
    exit: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -3 },
    transition: {
      duration: prefersReducedMotion ? 0.1 : 0.18,
      ease: agentMotionTransition.ease,
    },
  };

  const layoutTransition = prefersReducedMotion
    ? { duration: 0 }
    : dashboardLayoutTransition;

  return {
    prefersReducedMotion,
    modeView,
    inspectorView,
    messageView,
    agentSurfaceView,
    agentDisclosureView,
    agentStatusView,
    layoutTransition,
  };
}

export const dashboardStaggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const dashboardStaggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: "easeOut" },
  },
};

export const dashboardStaggerContainerReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.16 } },
};

export const dashboardStaggerItemReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.16 } },
};

export function useDashboardStaggerVariants() {
  const prefersReducedMotion = useReducedMotion();
  return prefersReducedMotion
    ? { container: dashboardStaggerContainerReduced, item: dashboardStaggerItemReduced }
    : { container: dashboardStaggerContainer, item: dashboardStaggerItem };
}
