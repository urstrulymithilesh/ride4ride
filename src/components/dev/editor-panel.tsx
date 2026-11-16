"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import {
  NumInput,
  HexColor,
  Select,
  Btn,
  IconBtn,
  Section,
  Row,
  FIG,
  parseRgba,
  toRgba,
} from "./editor-inputs";
import {
  type EditorState,
  type EditMode,
  parseShadow,
  shadowToString,
  parsePadding,
  exportCss,
  exportChangeList,
  copyToClipboard,
} from "./editor-utils";

const alignOptions = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

function parseTranslate(v: string): [number, number] {
  if (!v || v === "none") return [0, 0];
  const p = v.split(/\s+/).map((s) => parseFloat(s) || 0);
  return [p[0] || 0, p[1] ?? p[0] ?? 0];
}

function parseRotate(v: string) {
  if (!v || v === "none") return 0;
  return parseFloat(v) || 0;
}

export function EditorPanel({
  selected,
  state,
  mode,
  setMode,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  initialState,
  onSelectParent,
  onClose,
}: {
  selected: Element | null;
  state: EditorState;
  mode: EditMode;
  setMode: (m: EditMode) => void;
  onChange: (next: EditorState) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  initialState: EditorState;
  onSelectParent: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const cs = useMemo(() => {
    if (!selected || typeof window === "undefined") return null;
    return getComputedStyle(selected as HTMLElement);
  }, [selected]);

  const editId = useMemo(
    () => (selected ? selected.getAttribute("data-edit-id") : null),
    [selected],
  );

  const glassAncestor = useMemo(() => {
    if (!selected) return null;
    let node: Element | null = selected;
    while (node) {
      if (node.classList?.contains("glass-dark")) return node;
      node = node.parentElement;
    }
    return null;
  }, [selected]);
  const hasGlass = Boolean(glassAncestor);

  // Glass surfaces should edit the shared token by default, otherwise every
  // bar gets its own background-color / box-shadow copy pasted into the DOM.
  useEffect(() => {
    if (hasGlass && mode !== "shared") {
      setMode("shared");
    }
  }, [hasGlass, mode, setMode]);

  const hasBarRadius = useMemo(() => {
    if (!selected || typeof document === "undefined") return false;
    const barRadius = getComputedStyle(document.documentElement)
      .getPropertyValue("--bar-radius")
      .trim();
    let node: Element | null = selected;
    while (node) {
      if (getComputedStyle(node as HTMLElement).borderRadius.includes(barRadius)) return true;
      node = node.parentElement;
    }
    return false;
  }, [selected]);

  const readVar = useCallback(
    (name: string, fallback: string) => {
      if (typeof document === "undefined") return fallback;
      const raw =
        state.vars[name] ??
        getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return raw || fallback;
    },
    [state.vars],
  );

  const updateMany = useCallback(
    (props: Record<string, string>) => {
      if (!editId) return;
      const next: EditorState = {
        ...state,
        elements: { ...state.elements, [editId]: { ...state.elements[editId], ...props } },
      };
      for (const [k, v] of Object.entries(props)) {
        if (v === "" || v == null) delete next.elements[editId][k];
      }
      onChange(next);
    },
    [editId, state, onChange],
  );
  const updateElement = useCallback(
    (prop: string, value: string) => updateMany({ [prop]: value }),
    [updateMany],
  );

  const updateVar = useCallback(
    (name: string, value: string) => {
      const next: EditorState = { ...state, vars: { ...state.vars, [name]: value } };
      if (value === "" || value == null) delete next.vars[name];
      onChange(next);
    },
    [state, onChange],
  );

  const setHidden = useCallback(
    (hidden: boolean) => {
      if (!editId) return;
      onChange({
        ...state,
        hidden: hidden
          ? [...new Set([...state.hidden, editId])]
          : state.hidden.filter((id) => id !== editId),
      });
    },
    [editId, state, onChange],
  );
  const isHidden = editId ? state.hidden.includes(editId) : false;

  const getRaw = useCallback(
    (prop: string, fallback = "") => {
      if (!cs) return fallback;
      const edited = editId ? state.elements[editId]?.[prop] : undefined;
      return edited ?? cs.getPropertyValue(prop) ?? fallback;
    },
    [cs, editId, state.elements],
  );
  const getNum = useCallback(
    (prop: string, parser: (v: string) => number, fallback = 0) => {
      if (!cs) return fallback;
      const edited = editId ? state.elements[editId]?.[prop] : undefined;
      if (edited != null) return parser(edited);
      return parser(cs.getPropertyValue(prop));
    },
    [cs, editId, state.elements],
  );

  const resetAll = () => {
    if (!confirm("Reset all visual editor changes?")) return;
    onChange({ vars: {}, elements: {}, hidden: [] });
  };

  const hasMap =
    typeof document !== "undefined" && Boolean(document.querySelector(".r4r-map"));

  if (!selected || !cs) {
    return (
      <Panel onPointerDown={(e) => e.stopPropagation()}>
        <div style={{ padding: 40, color: FIG.label, fontSize: 12, textAlign: "center" }}>
          Click an element to edit
        </div>
      </Panel>
    );
  }

  const tag = selected.tagName.toLowerCase();
  const cls =
    typeof selected.className === "string"
      ? selected.className.split(/\s+/).slice(0, 3).join(" ")
      : "";
  const sharedAvailable = hasGlass || hasBarRadius;
  const shared = mode === "shared" && sharedAvailable;

  /* layout values */
  const [tx, ty] = parseTranslate(getRaw("translate", "none"));
  const rot = parseRotate(getRaw("rotate", "none"));
  const rect = selected.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  /* appearance */
  const opacity = getNum("opacity", parseFloat, 1);
  const radii = {
    tl: parseFloat(cs.borderTopLeftRadius) || 0,
    tr: parseFloat(cs.borderTopRightRadius) || 0,
    bl: parseFloat(cs.borderBottomLeftRadius) || 0,
    br: parseFloat(cs.borderBottomRightRadius) || 0,
  };
  const editedRadius = editId ? state.elements[editId]?.borderRadius : undefined;
  if (editedRadius) {
    const p = parsePadding(editedRadius);
    [radii.tl, radii.tr, radii.br, radii.bl] = p;
  }
  const barRadiusVal = parseFloat(readVar("--bar-radius", "16"));

  /* fill */
  const fillValue = shared
    ? readVar("--glass-dark-bg", "rgba(0, 0, 0, 0.8)")
    : getRaw("background-color", "rgba(0, 0, 0, 0)");

  /* stroke */
  const borderW = parseFloat(cs.borderTopWidth) || 0;
  const strokeColor = getRaw("border-color", "rgba(255,255,255,1)");

  /* shadow: per-element in element mode, shared glass shadow in shared mode */
  const shadow = parseShadow(
    shared
      ? readVar("--glass-dark-shadow", "0 18px 40px -12px rgba(0, 0, 0, 0.7)")
      : getRaw("box-shadow", "none"),
  );

  /* text */
  const fontSize = getNum("font-size", parseFloat, 16);
  const fontWeight = getNum("font-weight", parseFloat, 400);
  const lineHeight = getNum(
    "line-height",
    (v) => (v === "normal" ? 1.2 : parseFloat(v) || 1.2),
    1.2,
  );
  const letterSpacing = getNum(
    "letter-spacing",
    (v) => (v === "normal" ? 0 : parseFloat(v) || 0),
    0,
  );
  const textAlign = getRaw("text-align", "left");
  const textColor = getRaw("color", "#fff");
  const hasText = (selected.textContent?.trim().length ?? 0) > 0;

  /* shared glass vars */
  const glassBlur = parseFloat(readVar("--glass-dark-blur", "24"));
  const glassSaturate = parseFloat(readVar("--glass-dark-saturate", "150"));
  const glassBrightness = parseFloat(readVar("--glass-dark-brightness", "100"));
  const minZoom = parseFloat(readVar("--r4r-min-zoom", "10"));
  const maxZoom = parseFloat(readVar("--r4r-max-zoom", "17"));

  return (
    <Panel onPointerDown={(e) => e.stopPropagation()}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${FIG.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: FIG.blue, textTransform: "uppercase" }}>{tag}</span>
        <span style={{ fontSize: 10, color: FIG.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {cls || "<no classes>"}
        </span>
        <IconBtn title="Hide/show" onClick={() => setHidden(!isHidden)} active={isHidden}>👁</IconBtn>
        <IconBtn title="Select parent" onClick={onSelectParent}>↑</IconBtn>
        <IconBtn title="Close" onClick={onClose}>✕</IconBtn>
      </div>

      {/* toolbar */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${FIG.border}`, flexWrap: "wrap" }}>
        <Btn onClick={onUndo} disabled={!canUndo}>↩ Undo</Btn>
        <Btn onClick={onRedo} disabled={!canRedo}>↪ Redo</Btn>
        {sharedAvailable ? (
          <Btn active={shared} onClick={() => setMode(shared ? "element" : "shared")}>
            {shared ? "Shared style" : "Element only"}
          </Btn>
        ) : null}
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* layout */}
        <Section title="Layout">
          <Row>
            <NumInput label="X" value={Math.round(tx)} onChange={(v) => updateElement("translate", `${v}px ${ty}px`)} suffix="px" />
            <NumInput label="Y" value={Math.round(ty)} onChange={(v) => updateElement("translate", `${tx}px ${v}px`)} suffix="px" />
            <NumInput label="Rotate" value={Math.round(rot)} onChange={(v) => updateElement("rotate", `${v}deg`)} suffix="°" />
          </Row>
          <Row>
            <NumInput label="W" value={width} onChange={(v) => updateElement("width", `${v}px`)} suffix="px" min={0} />
            <NumInput label="H" value={height} onChange={(v) => updateElement("height", `${v}px`)} suffix="px" min={0} />
          </Row>
          <Row>
            <NumInput label="Padding" value={Math.round(parseFloat(cs.paddingTop) || 0)} onChange={(v) => updateElement("padding", `${v}px`)} suffix="px" min={0} />
            <NumInput label="Margin" value={Math.round(parseFloat(cs.marginTop) || 0)} onChange={(v) => updateElement("margin", `${v}px`)} suffix="px" />
            <NumInput label="Gap" value={getNum("gap", (v) => (v === "normal" || !v ? 0 : parseFloat(v) || 0), 0)} onChange={(v) => updateElement("gap", `${v}px`)} min={0} suffix="px" />
          </Row>
        </Section>

        {/* appearance */}
        <Section title="Appearance">
          <Row>
            <NumInput label="Opacity" value={Math.round(opacity * 100)} onChange={(v) => updateElement("opacity", String(v / 100))} min={0} max={100} suffix="%" />
            <NumInput label="Radius" value={Math.round(radii.tl)} onChange={(v) => updateElement("border-radius", `${v}px`)} min={0} suffix="px" />
          </Row>
          {shared && hasBarRadius ? (
            <Row>
              <NumInput label="Bar radius" value={barRadiusVal} onChange={(v) => updateVar("--bar-radius", `${v}px`)} min={0} max={100} suffix="px" />
            </Row>
          ) : null}
        </Section>

        {/* fill */}
        <Section title={shared ? "Fill · shared glass" : "Fill"}>
          <HexColor
            value={fillValue}
            onChange={(v) => {
              if (shared) updateVar("--glass-dark-bg", v);
              else updateElement("background-color", v);
            }}
          />
        </Section>

        {/* stroke — hidden for glass; glass has no edge strokes */}
        {!shared ? (
          <Section title="Stroke">
            <Row>
              <NumInput label="Width" value={Math.round(borderW * 100) / 100} onChange={(v) => updateMany({ "border-width": `${v}px`, "border-style": v > 0 ? "solid" : "none" })} min={0} max={40} step={0.5} suffix="px" />
            </Row>
            <HexColor
              value={strokeColor}
              onChange={(v) => updateMany({ "border-color": v })}
            />
          </Section>
        ) : null}

        {/* shadow — shared for glass, element otherwise */}
        <Section title={shared ? "Shadow · shared glass" : "Shadow"}>
          <Row>
            <NumInput label="X" value={Math.round(shadow.x)} onChange={(v) => {
              const next = shadowToString({ ...shadow, x: v });
              if (shared) updateVar("--glass-dark-shadow", next);
              else updateElement("box-shadow", next);
            }} suffix="px" />
            <NumInput label="Y" value={Math.round(shadow.y)} onChange={(v) => {
              const next = shadowToString({ ...shadow, y: v });
              if (shared) updateVar("--glass-dark-shadow", next);
              else updateElement("box-shadow", next);
            }} suffix="px" />
            <NumInput label="Blur" value={Math.round(shadow.blur)} onChange={(v) => {
              const next = shadowToString({ ...shadow, blur: v });
              if (shared) updateVar("--glass-dark-shadow", next);
              else updateElement("box-shadow", next);
            }} suffix="px" min={0} />
            <NumInput label="Spread" value={Math.round(shadow.spread)} onChange={(v) => {
              const next = shadowToString({ ...shadow, spread: v });
              if (shared) updateVar("--glass-dark-shadow", next);
              else updateElement("box-shadow", next);
            }} suffix="px" />
          </Row>
          <HexColor
            value={toRgba(shadow.r, shadow.g, shadow.b, shadow.a)}
            onChange={(v) => {
              const c = parseRgba(v);
              if (!c) return;
              const next = shadowToString({ ...shadow, ...c });
              if (shared) updateVar("--glass-dark-shadow", next);
              else updateElement("box-shadow", next);
            }}
          />
        </Section>

        {/* text */}
        <Section title="Text">
          <Row>
            <NumInput label="Size" value={Math.round(fontSize)} onChange={(v) => updateElement("font-size", `${v}px`)} min={8} max={120} suffix="px" />
            <NumInput label="Weight" value={Math.round(fontWeight)} onChange={(v) => updateElement("font-weight", String(v))} min={100} max={900} step={100} />
            <NumInput label="Line" value={Math.round(lineHeight * 100) / 100} onChange={(v) => updateElement("line-height", String(v))} min={0.5} max={5} step={0.05} />
          </Row>
          <Row>
            <NumInput label="Spacing" value={Math.round(letterSpacing * 100) / 100} onChange={(v) => updateElement("letter-spacing", `${v}px`)} min={-10} max={40} step={0.1} suffix="px" />
            <Select label="Align" value={textAlign} options={alignOptions} onChange={(v) => updateElement("text-align", v)} />
          </Row>
          <HexColor value={textColor} onChange={(v) => updateElement("color", v)} />
          {!hasText ? <span style={{ fontSize: 10, color: FIG.label }}>Element has no text content.</span> : null}
        </Section>

        {/* shared glass material */}
        {shared ? (
          <Section title="Glass · shared">
            <Row>
              <NumInput label="Blur" value={Math.round(glassBlur)} onChange={(v) => updateVar("--glass-dark-blur", `${v}px`)} min={0} max={100} suffix="px" />
              <NumInput label="Saturate" value={Math.round(glassSaturate)} onChange={(v) => updateVar("--glass-dark-saturate", `${v}%`)} min={0} max={500} suffix="%" />
              <NumInput label="Brightness" value={Math.round(glassBrightness)} onChange={(v) => updateVar("--glass-dark-brightness", `${v}%`)} min={0} max={300} suffix="%" />
            </Row>
          </Section>
        ) : null}

        {/* map zoom limits — live, works on any selection */}
        {hasMap ? (
          <Section title="Map · zoom">
            <Row>
              <NumInput label="Min zoom" value={Math.round(minZoom * 10) / 10} onChange={(v) => updateVar("--r4r-min-zoom", `${v}`)} min={0} max={22} step={0.5} />
              <NumInput label="Max zoom" value={Math.round(maxZoom * 10) / 10} onChange={(v) => updateVar("--r4r-max-zoom", `${v}`)} min={0} max={22} step={0.5} />
            </Row>
          </Section>
        ) : null}
      </div>

      {/* footer */}
      <div style={{ padding: 12, borderTop: `1px solid ${FIG.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={async () => {
            const css = exportCss(state, editId ?? undefined);
            if (!css.trim()) { setCopied("empty"); return; }
            const ok = await copyToClipboard(css);
            setCopied(ok ? "CSS" : "failed");
          }}>Copy CSS</Btn>
          <Btn onClick={async () => {
            const list = exportChangeList(initialState, state);
            const text = list.map((c) => `${c.element} · ${c.property}: ${c.oldValue || "(none)"} → ${c.newValue || "(none)"}`).join("\n") || "No changes";
            const ok = await copyToClipboard(text);
            setCopied(ok ? "all" : "failed");
          }}>Copy all changes</Btn>
        </div>
        {copied === "failed" ? (
          <div style={{ color: "#ff6b6b", fontSize: 11 }}>Copy failed — select the text manually.</div>
        ) : copied === "empty" ? (
          <div style={{ color: FIG.label, fontSize: 11 }}>No changes yet — edit something first.</div>
        ) : copied ? (
          <div style={{ color: FIG.blue, fontSize: 11 }}>Copied {copied === "CSS" ? "CSS" : "change list"}</div>
        ) : null}
        <Btn onClick={resetAll}>Reset all</Btn>
      </div>
    </Panel>
  );
}

function Panel({
  children,
  onPointerDown,
}: {
  children: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 300,
        height: "100vh",
        background: FIG.bg,
        color: FIG.text,
        borderLeft: `1px solid ${FIG.border}`,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        zIndex: 999999,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </div>
  );
}
