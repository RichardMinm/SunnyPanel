"use client";

import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type SettingsPopoverProps = {
  children: ReactNode;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const POPOVER_WIDTH = 360;
const POPOVER_MAX_WIDTH = "calc(100vw - 32px)";
const POPOVER_OFFSET = 10;
const FLIP_PADDING = 16;
const SHIFT_PADDING = 12;
const ANIM_DURATION = 160;

export function SettingsPopover({
  children,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: SettingsPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState("bottom-end");
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<() => void>(() => {});

  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) {
        controlledOnOpenChange?.(next);
      } else {
        setInternalOpen(next);
      }
    },
    [isControlled, controlledOnOpenChange],
  );

  // ── Position the popover ──
  const updatePosition = useCallback(() => {
    const reference = triggerRef.current;
    const floating = popoverRef.current;
    if (!reference || !floating) return;

    computePosition(reference, floating, {
      placement: "bottom-end",
      middleware: [
        offset(POPOVER_OFFSET),
        flip({ padding: FLIP_PADDING }),
        shift({ padding: SHIFT_PADDING }),
      ],
    }).then(({ x, y, placement: p }) => {
      setPlacement(p);
      setPopoverStyle({
        position: "fixed",
        top: Math.round(y),
        left: Math.round(x),
      });
    });
  }, []);

  // ── Open/close lifecycle ──
  useEffect(() => {
    if (open) {
      // Mount instantly, then animate in
      setVisible(true);
      const raf = requestAnimationFrame(() => updatePosition());
      // Start autoUpdate for scroll/resize tracking
      const reference = triggerRef.current;
      const floating = popoverRef.current;
      if (reference && floating) {
        cleanupRef.current = autoUpdate(reference, floating, updatePosition);
      }
      return () => {
        cancelAnimationFrame(raf);
        cleanupRef.current();
      };
    } else {
      // Animate out then unmount
      setVisible(false);
      const timer = setTimeout(() => {
        cleanupRef.current();
      }, ANIM_DURATION);
      return () => clearTimeout(timer);
    }
  }, [open, updatePosition]);

  // ── Click outside / Escape ──
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      const popover = popoverRef.current;
      const trigger = triggerRef.current;
      if (!popover || !trigger) return;
      if (popover.contains(e.target as Node)) return;
      if (trigger.contains(e.target as Node)) return;
      setOpen(false);
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    // Delay to avoid the opening click itself closing it
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick, true);
      document.addEventListener("keydown", handleEsc);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, setOpen]);

  // ── Focus return on close ──
  useEffect(() => {
    if (!open) {
      triggerRef.current?.focus();
    }
  }, [open]);

  const animStyle: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible
      ? "translateY(0) scale(1)"
      : "translateY(6px) scale(0.96)",
    transition: `opacity ${ANIM_DURATION}ms ease, transform ${ANIM_DURATION}ms ease`,
    pointerEvents: visible ? "auto" : "none",
    transformOrigin: placement.startsWith("bottom") ? "top right" : "bottom right",
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="settings-popover-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        type="button"
      >
        {trigger}
      </button>

      {(open || visible) &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="settings-popover"
            style={{
              ...popoverStyle,
              ...animStyle,
              width: POPOVER_WIDTH,
              maxWidth: POPOVER_MAX_WIDTH,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
