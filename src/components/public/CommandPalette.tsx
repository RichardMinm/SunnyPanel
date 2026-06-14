"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  commandItemMatchesQuery,
  getStaticCommandItems,
  groupCommandItems,
  type CommandSearchGroup,
  type CommandSearchItem,
  type CommandSearchResponse,
} from "@/lib/command/palette";
import { useFloatingCommandTrigger } from "@/lib/command/use-floating-command-trigger";
import type { SiteLocale } from "@/lib/site-copy";

const commandCopy = {
  en: {
    close: "Close",
    empty: "No result found",
    error: "Search is unavailable. Static commands are still available.",
    loading: "Searching...",
    open: "Command",
    placeholder: "Search actions, pages, writing, plans...",
    results: "results",
    shortcut: "Cmd K",
    title: "Command Center",
    triggerHint: "Drag to move. Double-click to reset to bottom-right.",
  },
  zh: {
    close: "关闭",
    empty: "没有找到匹配结果",
    error: "搜索暂时不可用，仍可使用静态命令。",
    loading: "正在搜索...",
    open: "命令",
    placeholder: "搜索操作、页面、文章、计划...",
    results: "项结果",
    shortcut: "⌘K",
    title: "命令中心",
    triggerHint: "拖动可移动；双击回右下角",
  },
} as const;

const debounceMs = 160;

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

const getFallbackGroups = (locale: SiteLocale, query: string) =>
  groupCommandItems(
    getStaticCommandItems(locale).filter((item) => commandItemMatchesQuery(item, query)),
    locale,
  );

const flattenGroups = (groups: CommandSearchGroup[]) => groups.flatMap((group) => group.items);

const getFocusableElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

export function CommandPalette({ locale }: { locale: SiteLocale }) {
  const router = useRouter();
  const pathname = usePathname();
  const copy = commandCopy[locale];
  const titleId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    consumeDragClick,
    handlePointerDown,
    isDragging,
    resetPosition,
    triggerRef,
    triggerStyle,
  } = useFloatingCommandTrigger();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [groups, setGroups] = useState<CommandSearchGroup[]>(() => getFallbackGroups(locale, ""));
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const flatItems = useMemo(() => flattenGroups(groups), [groups]);
  const resolvedActiveIndex = flatItems.length === 0 ? 0 : Math.min(activeIndex, flatItems.length - 1);
  const activeItem = flatItems[resolvedActiveIndex] ?? null;
  const activeOptionId = activeItem ? `${listboxId}-option-${resolvedActiveIndex}` : undefined;

  const openPalette = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setDebouncedQuery("");
    setActiveIndex(0);
    setErrorMessage(null);
    setGroups(getFallbackGroups(locale, ""));
  }, [locale]);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setActiveIndex(0);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const runCommand = useCallback((command: CommandSearchItem) => {
    closePalette();
    router.push(command.href);
  }, [closePalette, router]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [isOpen, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const controller = new AbortController();
    const fallbackGroups = getFallbackGroups(locale, debouncedQuery);
    const startTimer = window.setTimeout(() => {
      setIsLoading(true);
      setErrorMessage(null);
      setGroups(fallbackGroups);
    }, 0);

    const params = new URLSearchParams({
      locale,
      q: debouncedQuery,
      scope: pathname === "/dashboard" || pathname.startsWith("/dashboard/") ? "private" : "public",
    });

    fetch(`/api/command/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Command search failed with ${response.status}`);
        }

        return (await response.json()) as CommandSearchResponse;
      })
      .then((data) => {
        setGroups(data.groups.length > 0 ? data.groups : fallbackGroups);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setErrorMessage(copy.error);
        setGroups(fallbackGroups);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      window.clearTimeout(startTimer);
      controller.abort();
    };
  }, [copy.error, debouncedQuery, isOpen, locale, pathname]);

  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);

      if (isCommandK) {
        event.preventDefault();
        openPalette();
        return;
      }

      if (!isOpen) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
        return;
      }

      if (event.key === "Tab" && panelRef.current) {
        const focusableElements = getFocusableElements(panelRef.current);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) {
          return;
        }

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
          return;
        }

        if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
          return;
        }
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (flatItems.length === 0 ? 0 : (current + 1) % flatItems.length));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (flatItems.length === 0 ? 0 : (current - 1 + flatItems.length) % flatItems.length));
        return;
      }

      if (event.key === "Enter" && !event.isComposing) {
        const target = event.target;
        const shouldSelectActive =
          target === inputRef.current ||
          (target instanceof HTMLElement && target.getAttribute("role") === "option");

        if (!shouldSelectActive) {
          return;
        }

        event.preventDefault();
        const command = flatItems[resolvedActiveIndex];

        if (command) {
          runCommand(command);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closePalette, flatItems, isOpen, openPalette, resolvedActiveIndex, runCommand]);

  return (
    <>
      <button
        ref={triggerRef}
        aria-label={copy.title}
        className={`sunny-command-trigger${isDragging ? " is-dragging" : ""}`}
        onClick={(event) => {
          if (consumeDragClick()) {
            event.preventDefault();
            return;
          }
          openPalette();
        }}
        onDoubleClick={resetPosition}
        onPointerDown={handlePointerDown}
        style={triggerStyle}
        title={copy.triggerHint}
        type="button"
      >
        <span>{copy.open}</span>
        <kbd>{copy.shortcut}</kbd>
      </button>

      {isOpen ? (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="sunny-command-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isEditableTarget(event.target)) {
              closePalette();
            }
          }}
          role="dialog"
        >
          <div ref={panelRef} className="sunny-command-panel">
            <div className="sunny-command-input-row">
              <div className="sunny-command-input-shell">
                <h2 id={titleId} className="sr-only">
                  {copy.title}
                </h2>
                <input
                  ref={inputRef}
                  aria-activedescendant={activeOptionId}
                  aria-controls={listboxId}
                  aria-expanded={isOpen}
                  aria-label={copy.placeholder}
                  className="sunny-command-input"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  placeholder={copy.placeholder}
                  role="combobox"
                  value={query}
                />
              </div>
              <button className="sunny-command-close" onClick={closePalette} type="button">
                {copy.close}
              </button>
            </div>

            <div className="sunny-command-meta">
              <span>{isLoading ? copy.loading : `${flatItems.length} ${copy.results}`}</span>
              {errorMessage ? <span>{errorMessage}</span> : null}
            </div>

            <div id={listboxId} className="sunny-command-list" role="listbox">
              {flatItems.length > 0 ? (
                groups.map((group) => (
                  <div key={group.id} className="sunny-command-section">
                    <p className="sunny-command-section-label">{group.label}</p>
                    {group.items.map((command) => {
                      const commandIndex = flatItems.indexOf(command);
                      const isActive = commandIndex === resolvedActiveIndex;

                      return (
                        <button
                          key={command.id}
                          id={`${listboxId}-option-${commandIndex}`}
                          aria-selected={isActive}
                          className={`sunny-command-item ${isActive ? "sunny-command-item-active" : ""}`}
                          onMouseEnter={() => setActiveIndex(commandIndex)}
                          onClick={() => runCommand(command)}
                          role="option"
                          type="button"
                        >
                          <span className="sunny-command-item-main">
                            <span>{command.title}</span>
                            {command.subtitle ? <small>{command.subtitle}</small> : null}
                          </span>
                          <span className="sunny-command-item-kind">{command.kind}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="sunny-command-empty">{copy.empty}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
