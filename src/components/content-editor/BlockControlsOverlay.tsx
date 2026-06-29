"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AppDropdownMenu,
  AppDropdownMenuItem,
} from "@/components/primitives/AppDropdownMenu";
import { AppIconButton } from "@/components/primitives/AppIconButton";
import { DashboardIcon } from "@/components/dashboard/icons";

type BlockAnchor = {
  left: number;
  pos: number;
  right: number;
  top: number;
};

const BLOCK_TYPES = new Set([
  "blockquote",
  "callout",
  "codeBlock",
  "heading",
  "listItem",
  "paragraph",
  "taskItem",
]);

function findBlockPos(editor: Editor, clientX: number, clientY: number): BlockAnchor | null {
  const result = editor.view.posAtCoords({ left: clientX, top: clientY });
  if (!result) return null;

  const $pos = editor.state.doc.resolve(result.pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (BLOCK_TYPES.has(node.type.name) || node.isBlock) {
      const pos = $pos.before(depth);
      const dom = editor.view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) continue;
      const rect = dom.getBoundingClientRect();
      return { left: rect.left, pos, right: rect.right, top: rect.top + rect.height / 2 };
    }
  }

  return null;
}

/** Minimum gutter (px) required for left-side controls to be visible on screen. */
const MIN_LEFT_GUTTER = 54;

/** Delay (ms) before controls appear after hovering a block. */
const SHOW_DELAY = 400;

/** Delay (ms) before controls disappear after the mouse leaves. */
const HIDE_DELAY = 300;

type BlockControlsOverlayProps = {
  editor: Editor | null;
};

export function BlockControlsOverlay({ editor }: BlockControlsOverlayProps) {
  const [anchor, setAnchor] = useState<BlockAnchor | null>(null);
  const [hoveringControls, setHoveringControls] = useState(false);
  const moveFrameRef = useRef<number | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastAnchorPosRef = useRef<number | null>(null);

  /* Keep a ref copy so the event listeners (registered once) always read the
     latest value without needing to re-register on every change. */
  const hoveringRef = useRef(hoveringControls);

  useEffect(() => {
    hoveringRef.current = hoveringControls;
  }, [hoveringControls]);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = undefined;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
  }, [clearShowTimer, clearHideTimer]);

  /** Start the hide countdown.  If the mouse reaches the controls before it
      fires the controls stay visible (cancelHide is called). */
  const scheduleHide = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = undefined;
      lastAnchorPosRef.current = null;
      setAnchor(null);
    }, HIDE_DELAY);
  }, [clearShowTimer, clearHideTimer]);

  useEffect(() => {
    if (!editor) return;

    const root = editor.view.dom.closest(".sunny-writing-tiptap-editor");
    if (!(root instanceof HTMLElement)) return;

    const onMove = (event: MouseEvent) => {
      /* While the user is interacting with the controls themselves, ignore
         editor mousemove events so we don't steal focus. */
      if (hoveringRef.current) return;

      if (moveFrameRef.current !== null) {
        cancelAnimationFrame(moveFrameRef.current);
      }

      moveFrameRef.current = requestAnimationFrame(() => {
        moveFrameRef.current = null;
        const target = event.target;
        if (!(target instanceof Node) || !root.contains(target)) {
          scheduleHide();
          return;
        }

        const next = findBlockPos(editor, event.clientX, event.clientY);

        /* No block under cursor — may be moving toward the controls in the
           gutter.  Use a hide delay so the mouse can reach them. */
        if (!next) {
          scheduleHide();
          return;
        }

        /* Same block → keep existing show timer (don't restart).  Also cancel
           any pending hide (e.g. mouse briefly left then returned). */
        if (next.pos === lastAnchorPosRef.current) {
          clearHideTimer();
          return;
        }

        /* Different block → hide current controls immediately and start the
           show timer for the new block. */
        clearAllTimers();
        lastAnchorPosRef.current = next.pos;
        setAnchor(null);

        showTimerRef.current = setTimeout(() => {
          showTimerRef.current = undefined;
          setAnchor(next);
        }, SHOW_DELAY);
      });
    };

    const onLeave = () => {
      if (!hoveringRef.current) {
        scheduleHide();
      }
    };

    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
      if (moveFrameRef.current !== null) {
        cancelAnimationFrame(moveFrameRef.current);
      }
      clearAllTimers();
    };
  }, [editor, scheduleHide, clearHideTimer, clearAllTimers]);

  const runAtBlock = useCallback(
    (fn: (editor: Editor, pos: number) => void) => {
      if (!editor || !anchor) return;
      fn(editor, anchor.pos);
    },
    [anchor, editor],
  );

  if (!editor || !anchor) {
    return null;
  }

  /* Adaptive positioning: left side when gutter is wide enough, right side otherwise.
     Controls are positioned relative to the text edge via CSS transform, so they
     never overlap the text column regardless of their pixel width. */
  const placeLeft = anchor.left >= MIN_LEFT_GUTTER;
  const positionClass = placeLeft ? "sunny-block-controls--left" : "sunny-block-controls--right";
  const style: React.CSSProperties = placeLeft
    ? { left: anchor.left, top: anchor.top }
    : { left: anchor.right, top: anchor.top };

  return (
    <div
      className={`sunny-block-controls ${positionClass}`}
      onMouseEnter={() => {
        clearAllTimers();
        setHoveringControls(true);
      }}
      onMouseLeave={() => {
        setHoveringControls(false);
        scheduleHide();
      }}
      style={style}
    >
      <AppIconButton
        aria-label="在下方添加块"
        className="sunny-block-controls-add"
        icon={<DashboardIcon name="plus" />}
        onClick={() =>
          runAtBlock((ed, pos) => {
            ed.chain().focus().insertContentAt(pos + 1, { type: "paragraph" }).run();
          })
        }
        size="sm"
        title="添加块"
      />
      <AppDropdownMenu
        align="start"
        side="bottom"
        trigger="···"
        triggerAriaLabel="块操作"
        triggerClassName="sunny-block-controls-menu-trigger"
      >
        <AppDropdownMenuItem
          onSelect={() =>
            runAtBlock((ed, pos) => {
              ed.chain().focus().setTextSelection(pos).toggleHeading({ level: 2 }).run();
            })
          }
        >
          转为标题
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() =>
            runAtBlock((ed, pos) => {
              ed.chain().focus().setTextSelection(pos).toggleBulletList().run();
            })
          }
        >
          转为列表
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() =>
            runAtBlock((ed, pos) => {
              const node = ed.state.doc.nodeAt(pos);
              if (!node) return;
              const json = node.toJSON();
              void navigator.clipboard?.writeText(JSON.stringify(json));
            })
          }
        >
          复制
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          onSelect={() =>
            runAtBlock((ed, pos) => {
              ed.chain().focus().deleteRange({ from: pos, to: pos + (ed.state.doc.nodeAt(pos)?.nodeSize ?? 0) }).run();
            })
          }
        >
          删除
        </AppDropdownMenuItem>
      </AppDropdownMenu>
    </div>
  );
}
