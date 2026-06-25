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
      return { left: rect.left, pos, top: rect.top + rect.height / 2 };
    }
  }

  return null;
}

type BlockControlsOverlayProps = {
  editor: Editor | null;
};

export function BlockControlsOverlay({ editor }: BlockControlsOverlayProps) {
  const [anchor, setAnchor] = useState<BlockAnchor | null>(null);
  const [hoveringControls, setHoveringControls] = useState(false);
  const moveFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editor) return;

    const root = editor.view.dom.closest(".sunny-writing-tiptap-editor");
    if (!(root instanceof HTMLElement)) return;

    const onMove = (event: MouseEvent) => {
      if (hoveringControls) return;

      if (moveFrameRef.current !== null) {
        cancelAnimationFrame(moveFrameRef.current);
      }

      moveFrameRef.current = requestAnimationFrame(() => {
        moveFrameRef.current = null;
        const target = event.target;
        if (!(target instanceof Node) || !root.contains(target)) {
          setAnchor(null);
          return;
        }

        const next = findBlockPos(editor, event.clientX, event.clientY);
        setAnchor(next);
      });
    };

    const onLeave = () => {
      if (!hoveringControls) setAnchor(null);
    };

    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
      if (moveFrameRef.current !== null) {
        cancelAnimationFrame(moveFrameRef.current);
      }
    };
  }, [editor, hoveringControls]);

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

  return (
    <div
      className="sunny-block-controls"
      onMouseEnter={() => setHoveringControls(true)}
      onMouseLeave={() => setHoveringControls(false)}
      style={{ left: anchor.left - 36, top: anchor.top }}
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
