"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export const COMMAND_TRIGGER_DRAG_THRESHOLD_PX = 6;
export const COMMAND_TRIGGER_STORAGE_KEY = "sunny-command-trigger-position";

const BOUNDS_PADDING = 12;
const HIDDEN_QUERY = "(max-width: 900px)";

type TriggerPosition = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTriggerHidden() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(HIDDEN_QUERY).matches;
}

function readStoredPosition(): TriggerPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMMAND_TRIGGER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TriggerPosition;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPosition(position: TriggerPosition | null) {
  if (typeof window === "undefined") return;
  try {
    if (!position) {
      window.localStorage.removeItem(COMMAND_TRIGGER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(COMMAND_TRIGGER_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // ignore quota / privacy mode
  }
}

export function useFloatingCommandTrigger() {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState<TriggerPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const didDragRef = useRef(false);
  const isDraggingRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const clampPosition = useCallback((next: TriggerPosition): TriggerPosition => {
    const trigger = triggerRef.current;
    const width = trigger?.offsetWidth ?? 120;
    const height = trigger?.offsetHeight ?? 40;
    const maxX = window.innerWidth - width - BOUNDS_PADDING;
    const maxY = window.innerHeight - height - BOUNDS_PADDING;

    return {
      x: clamp(next.x, BOUNDS_PADDING, Math.max(BOUNDS_PADDING, maxX)),
      y: clamp(next.y, BOUNDS_PADDING, Math.max(BOUNDS_PADDING, maxY)),
    };
  }, []);

  const applyPosition = useCallback(
    (next: TriggerPosition | null, persist = false) => {
      if (isTriggerHidden()) {
        setPosition(null);
        if (persist) writeStoredPosition(null);
        return;
      }

      if (!next) {
        setPosition(null);
        if (persist) writeStoredPosition(null);
        return;
      }

      const clamped = clampPosition(next);
      setPosition(clamped);
      if (persist) writeStoredPosition(clamped);
    },
    [clampPosition],
  );

  const resetPosition = useCallback(() => {
    didDragRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);
    document.documentElement.classList.remove("sunny-command-trigger-is-dragging");
    applyPosition(null, true);
  }, [applyPosition]);

  const ensureFloatingPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    return clampPosition({ x: rect.left, y: rect.top });
  }, [clampPosition]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (isTriggerHidden() || event.button !== 0) return;

      pointerStartRef.current = { x: event.clientX, y: event.clientY };
      didDragRef.current = false;
      isDraggingRef.current = false;
      setIsDragging(false);

      const basePosition = position ?? ensureFloatingPosition();
      if (!basePosition) return;

      dragOffsetRef.current = {
        x: event.clientX - basePosition.x,
        y: event.clientY - basePosition.y,
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - pointerStartRef.current.x;
        const deltaY = moveEvent.clientY - pointerStartRef.current.y;
        const distance = Math.hypot(deltaX, deltaY);

        if (!isDraggingRef.current && distance > COMMAND_TRIGGER_DRAG_THRESHOLD_PX) {
          isDraggingRef.current = true;
          setIsDragging(true);
          document.documentElement.classList.add("sunny-command-trigger-is-dragging");
          applyPosition(basePosition);
        }

        if (!isDraggingRef.current) return;

        applyPosition({
          x: moveEvent.clientX - dragOffsetRef.current.x,
          y: moveEvent.clientY - dragOffsetRef.current.y,
        });
      };

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);

        if (isDraggingRef.current) {
          didDragRef.current = true;
          const trigger = triggerRef.current;
          if (trigger) {
            const rect = trigger.getBoundingClientRect();
            applyPosition({ x: rect.left, y: rect.top }, true);
          }
        }

        isDraggingRef.current = false;
        setIsDragging(false);
        document.documentElement.classList.remove("sunny-command-trigger-is-dragging");
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [applyPosition, ensureFloatingPosition, position],
  );

  const consumeDragClick = useCallback(() => {
    if (!didDragRef.current) return false;
    didDragRef.current = false;
    return true;
  }, []);

  useEffect(() => {
    if (isTriggerHidden()) {
      setPosition(null);
      return;
    }

    const stored = readStoredPosition();
    if (!stored) return;

    requestAnimationFrame(() => {
      applyPosition(stored);
    });
  }, [applyPosition]);

  useEffect(() => {
    const syncPosition = () => {
      if (isTriggerHidden()) {
        setPosition(null);
        return;
      }
      if (position) {
        applyPosition(position);
      }
    };

    window.addEventListener("resize", syncPosition);

    const mediaQuery = window.matchMedia(HIDDEN_QUERY);
    const onHiddenChange = () => {
      if (mediaQuery.matches) {
        setPosition(null);
      } else {
        const stored = readStoredPosition();
        if (stored) applyPosition(stored);
      }
    };
    mediaQuery.addEventListener("change", onHiddenChange);

    return () => {
      window.removeEventListener("resize", syncPosition);
      mediaQuery.removeEventListener("change", onHiddenChange);
    };
  }, [applyPosition, position]);

  const triggerStyle: CSSProperties | undefined =
    position && !isTriggerHidden()
      ? {
          position: "fixed",
          left: position.x,
          top: position.y,
          right: "auto",
          bottom: "auto",
        }
      : undefined;

  return {
    consumeDragClick,
    handlePointerDown,
    isDragging,
    resetPosition,
    triggerRef: triggerRef as RefObject<HTMLButtonElement>,
    triggerStyle,
  };
}
