"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { EditorPanel } from "./editor-panel";
import {
  type EditorState,
  type EditMode,
  type HistoryEntry,
  loadState,
  saveState,
  applyEdits,
  getEditId,
  resetState,
} from "./editor-utils";

export function VisualEditor() {
  const [allowed] = useState(() => {
    if (typeof window === "undefined") return false;
    const isDev = process.env.NODE_ENV === "development";
    const forceEdit = new URL(window.location.href).searchParams.get("edit") === "1";
    return isDev || forceEdit;
  });
  // Panel starts closed so the app (chat bubble, tabs, pins) stays
  // tappable in dev. Opening it enables click-to-select.
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Element | null>(null);
  const [mode, setMode] = useState<EditMode>("element");
  const [state, setState] = useState<EditorState>(() => loadState() ?? resetState());
  const [history, setHistory] = useState<HistoryEntry[]>(() => [
    { state: loadState() ?? resetState(), description: "initial" },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Apply edits whenever state changes.
  useEffect(() => {
    applyEdits(state);
    saveState(state);
  }, [state]);

  // Selection listener — only active while the panel is open, so taps
  // and clicks pass through to the app normally when it is closed.
  useEffect(() => {
    if (!allowed || !open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // Ignore clicks inside the editor UI.
      if (rootRef.current?.contains(target)) return;

      // Find the clicked element; ignore body/html.
      let el = e.target as Element | null;
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.nodeType === 1) break;
        el = el.parentElement;
      }
      if (!el || el === document.body || el === document.documentElement) return;

      // Promote to the nearest ancestor that has a visual surface, so
      // clicking text inside a glass bar selects the bar, not the span.
      while (el && el !== document.body) {
        const s = getComputedStyle(el as HTMLElement);
        const hasVisual =
          s.backgroundColor !== "rgba(0, 0, 0, 0)" ||
          s.borderWidth !== "0px" ||
          s.boxShadow !== "none" ||
          el.classList.contains("glass-dark");
        if (hasVisual) break;
        el = el.parentElement;
      }
      if (!el || el === document.body) return;

      e.preventDefault();
      e.stopPropagation();
      getEditId(el);
      setSelected(el);
      setMode("element");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [allowed, open]);

  // Update highlight overlay position directly on the DOM node.
  useEffect(() => {
    const node = overlayRef.current;
    if (!node) return;
    if (!selected) {
      node.style.display = "none";
      return;
    }
    const place = () => {
      const r = selected.getBoundingClientRect();
      node.style.display = "block";
      node.style.left = `${r.left}px`;
      node.style.top = `${r.top}px`;
      node.style.width = `${r.width}px`;
      node.style.height = `${r.height}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [selected]);

  const pushState = useCallback(
    (next: EditorState, description: string) => {
      setState(next);
      const trimmed = history.slice(0, historyIndex + 1);
      const last = trimmed[trimmed.length - 1]?.state;
      if (JSON.stringify(last) === JSON.stringify(next)) return;
      const nextHistory = [...trimmed, { state: next, description }];
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    },
    [history, historyIndex],
  );

  const onChange = useCallback(
    (next: EditorState) => {
      pushState(next, "edit");
    },
    [pushState],
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setState(history[idx].state);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setState(history[idx].state);
  }, [history, historyIndex]);

  // Keyboard shortcuts for undo/redo.
  useEffect(() => {
    if (!allowed || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed, open, undo, redo]);

  if (!allowed) return null;

  // Closed: a small floating button over the map (left side, above the
  // bottom nav) so the chat bubble, tabs, and search bars stay tappable.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="open visual editor"
        style={{
          position: "fixed",
          left: 12,
          bottom: 110,
          zIndex: 999999,
          background: "#1e1e1e",
          color: "#fff",
          border: "1px solid #333",
          borderRadius: 4,
          padding: "6px 10px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Edit
      </button>
    );
  }

  const selectedInfo = selected
    ? `${selected.tagName.toLowerCase()}${
        typeof selected.className === "string" && selected.className
          ? ` .${selected.className.split(/\s+/).slice(0, 3).join(".")}`
          : ""
      }`
    : "";

  return (
    <div ref={rootRef}>
      {/* Selection highlight overlay */}
      <div
        ref={overlayRef}
        style={{
          position: "fixed",
          display: "none",
          pointerEvents: "none",
          zIndex: 999998,
          boxSizing: "border-box",
          border: "1px solid #0d99ff",
          background: "rgba(13, 153, 255, 0.08)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -20,
            left: 0,
            background: "#0d99ff",
            color: "#fff",
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: "3px 3px 0 0",
            whiteSpace: "nowrap",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {selectedInfo}
        </div>
      </div>

      {/* Properties panel */}
      <EditorPanel
        selected={selected}
        state={state}
        mode={mode}
        setMode={setMode}
        onChange={onChange}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        initialState={history[0].state}
        onSelectParent={() => setSelected((s) => s?.parentElement ?? s)}
        onClose={() => {
          setOpen(false);
          setSelected(null);
        }}
      />
    </div>
  );
}
