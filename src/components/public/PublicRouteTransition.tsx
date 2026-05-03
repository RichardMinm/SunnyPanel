"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname, useSearchParams } from "next/navigation";

type PublicRouteTransitionProps = {
  aside?: ReactNode;
  children: ReactNode;
  showTimelineRail: boolean;
};

export function PublicRouteTransition({
  aside,
  children,
  showTimelineRail,
}: PublicRouteTransitionProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const routeKey = `${pathname}?${searchParams.toString()}::${showTimelineRail ? "rail" : "full"}`;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [pathname, prefersReducedMotion, searchParams]);

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={routeKey}
        animate={{ opacity: 1, y: 0 }}
        className={`mt-5 flex-1 ${showTimelineRail ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start" : ""} md:mt-6`}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
        transition={{ duration: prefersReducedMotion ? 0.16 : 0.28, ease: "easeOut" }}
      >
        <div className="min-w-0">{children}</div>
        {showTimelineRail ? aside : null}
      </motion.div>
    </AnimatePresence>
  );
}
