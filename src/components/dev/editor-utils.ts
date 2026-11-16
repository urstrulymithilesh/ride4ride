"use client";

export type EditMode = "element" | "shared";

export interface VarEdits {
  [name: string]: string;
}

export interface ElementEdits {
  [editId: string]: {
    [property: string]: string;
  };
}

export interface EditorState {
  vars: VarEdits;
  elements: ElementEdits;
  hidden: string[];
}

export interface HistoryEntry {
  state: EditorState;
  description: string;
}

const STORAGE_KEY = "r4r-visual-editor";

export function loadState(): EditorState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EditorState;
  } catch {
    return null;
  }
}

export function saveState(state: EditorState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function resetState(): EditorState {
  return { vars: {}, elements: {}, hidden: [] };
}

export function getEditId(el: Element): string {
  if (!el.hasAttribute("data-edit-id")) {
    const id = `edit-${Math.random().toString(36).slice(2, 9)}`;
    el.setAttribute("data-edit-id", id);
  }
  return el.getAttribute("data-edit-id")!;
}

export function selectorFor(el: Element): string {
  const id = el.getAttribute("data-edit-id");
  if (id) return `[data-edit-id="${id}"]`;
  // fallback: tag + class + nth-of-type path
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body) {
    let seg = node.tagName.toLowerCase();
    if (node.className && typeof node.className === "string") {
      const cls = node.className
        .split(/\s+/)
        .filter((c) => c && !c.startsWith("[") && !c.includes(":"))
        .slice(0, 2)
        .join(".");
      if (cls) seg += `.${cls}`;
    }
    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === node!.tagName,
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(node) + 1;
        seg += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(seg);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

const previousApplied: EditorState = { vars: {}, elements: {}, hidden: [] };

export function applyEdits(state: EditorState) {
  if (typeof document === "undefined") return;

  // Apply CSS variable edits to :root. Remove vars that disappeared.
  const root = document.documentElement;
  for (const name of Object.keys(previousApplied.vars)) {
    if (!(name in state.vars)) {
      root.style.removeProperty(name);
    }
  }
  for (const [name, value] of Object.entries(state.vars)) {
    if (value === "" || value == null) {
      root.style.removeProperty(name);
    } else {
      root.style.setProperty(name, value);
    }
  }

  // Clear previous element edits (we re-apply all)
  document.querySelectorAll("[data-edit-style]").forEach((el) => {
    const styleAttr = el.getAttribute("data-edit-style") || "";
    for (const prop of styleAttr.split(";")) {
      const key = prop.split(":")[0]?.trim();
      if (key) (el as HTMLElement).style.removeProperty(key);
    }
    el.removeAttribute("data-edit-style");
  });

  // Apply element edits
  for (const [editId, props] of Object.entries(state.elements)) {
    const el = document.querySelector(`[data-edit-id="${editId}"]`) as HTMLElement | null;
    if (!el) continue;
    const keys: string[] = [];
    for (const [prop, value] of Object.entries(props)) {
      if (value === "" || value == null) {
        el.style.removeProperty(prop);
      } else {
        el.style.setProperty(prop, value, "important");
        keys.push(prop);
      }
    }
    if (keys.length) el.setAttribute("data-edit-style", keys.join(";"));
  }

  // Apply hidden / unhide
  const prevHidden = new Set(previousApplied.hidden);
  const nextHidden = new Set(state.hidden);
  for (const editId of prevHidden) {
    if (!nextHidden.has(editId)) {
      const el = document.querySelector(`[data-edit-id="${editId}"]`) as HTMLElement | null;
      if (el) el.style.removeProperty("display");
    }
  }
  for (const editId of nextHidden) {
    const el = document.querySelector(`[data-edit-id="${editId}"]`) as HTMLElement | null;
    if (el) el.style.setProperty("display", "none", "important");
  }

  previousApplied.vars = { ...state.vars };
  previousApplied.elements = JSON.parse(JSON.stringify(state.elements));
  previousApplied.hidden = [...state.hidden];

  // Live-drive the feed map limits from --r4r-min-zoom / --r4r-max-zoom.
  // The map reads these at creation too, so a reload keeps the values.
  try {
    const w = window as unknown as {
      __r4rMap?: { setMinZoom: (z: number) => void; setMaxZoom: (z: number) => void };
    };
    const map = w.__r4rMap;
    if (map) {
      const cs = getComputedStyle(document.documentElement);
      const min = parseFloat(
        state.vars["--r4r-min-zoom"] ?? cs.getPropertyValue("--r4r-min-zoom"),
      );
      const max = parseFloat(
        state.vars["--r4r-max-zoom"] ?? cs.getPropertyValue("--r4r-max-zoom"),
      );
      if (Number.isFinite(min)) map.setMinZoom(min);
      if (Number.isFinite(max)) map.setMaxZoom(max);
    }
  } catch {
    // map may not exist on this page — ignore
  }
}

export function parseRgba(input: string): { r: number; g: number; b: number; a: number } | null {
  if (!input) return null;
  const s = input.trim();
  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length === 4) hex = hex.split("").map((c) => c + c).join("");
    const num = parseInt(hex, 16);
    if (hex.length === 6) {
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: (num >> 24) & 255,
        g: (num >> 16) & 255,
        b: (num >> 8) & 255,
        a: (num & 255) / 255,
      };
    }
  }
  const rgbMatch = s.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((p) => p.trim());
    const toNum = (v: string) => {
      if (v.endsWith("%")) return Math.round((parseFloat(v) / 100) * 255);
      return parseFloat(v);
    };
    return {
      r: toNum(parts[0]),
      g: toNum(parts[1]),
      b: toNum(parts[2]),
      a: parts[3] != null ? parseFloat(parts[3]) : 1,
    };
  }
  // named colors fallback via a temporary element
  if (typeof document !== "undefined") {
    const tmp = document.createElement("div");
    tmp.style.color = s;
    document.body.appendChild(tmp);
    const cs = getComputedStyle(tmp).color;
    document.body.removeChild(tmp);
    return parseRgba(cs);
  }
  return null;
}

export function toRgbaString(r: number, g: number, b: number, a: number) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a).toFixed(2)})`;
}

export function toHexString(r: number, g: number, b: number) {
  const c = (n: number) => n.toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function parseShadow(input: string) {
  if (!input || input === "none") {
    return { x: 0, y: 0, blur: 0, spread: 0, r: 0, g: 0, b: 0, a: 0, inset: false };
  }
  const inset = input.includes("inset");
  const s = input.replace(/inset/g, "").trim();
  const colorPart = s.match(/(#[0-9a-fA-F]+|rgba?\([^)]+\))/i)?.[0] ?? "";
  const color = colorPart ? parseRgba(colorPart) : { r: 0, g: 0, b: 0, a: 1 };
  const nums = s.replace(/#[0-9a-fA-F]+|rgba?\([^)]+\)/g, "").match(/-?[\d.]+/g)?.map(Number) || [];
  return {
    x: nums[0] ?? 0,
    y: nums[1] ?? 0,
    blur: nums[2] ?? 0,
    spread: nums[3] ?? 0,
    r: color?.r ?? 0,
    g: color?.g ?? 0,
    b: color?.b ?? 0,
    a: color?.a ?? 1,
    inset,
  };
}

export function shadowToString(s: ReturnType<typeof parseShadow>) {
  if (!s.blur && !s.x && !s.y && !s.spread) return "none";
  return `${s.inset ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${toRgbaString(s.r, s.g, s.b, s.a)}`;
}

export function parseBackdropFilter(input: string) {
  const s = input || "none";
  const blur = s.match(/blur\(([^)]+)\)/)?.[1] ?? "0px";
  const saturate = s.match(/saturate\(([^)]+)\)/)?.[1] ?? "100%";
  const brightness = s.match(/brightness\(([^)]+)\)/)?.[1] ?? "100%";
  return {
    blur: parseFloat(blur),
    saturate: parseFloat(saturate),
    brightness: parseFloat(brightness),
  };
}

export function backdropFilterToString(blur: number, saturate: number, brightness: number) {
  const parts: string[] = [];
  if (blur) parts.push(`blur(${blur}px)`);
  if (saturate !== 100) parts.push(`saturate(${saturate}%)`);
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  return parts.join(" ") || "none";
}

export function parsePadding(input: string): [number, number, number, number] {
  const vals = input.split(/\s+/).map((v) => parseFloat(v) || 0);
  if (vals.length === 1) return [vals[0], vals[0], vals[0], vals[0]];
  if (vals.length === 2) return [vals[0], vals[1], vals[0], vals[1]];
  if (vals.length === 3) return [vals[0], vals[1], vals[2], vals[1]];
  return [vals[0] || 0, vals[1] || 0, vals[2] || 0, vals[3] || 0];
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Async clipboard API (needs a secure context + permission).
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  // Legacy fallback: hidden textarea + execCommand. Works on plain-http
  // hosts (e.g. a phone on a LAN IP) where navigator.clipboard is missing.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function exportCss(state: EditorState, selectedId?: string): string {
  const lines: string[] = [];
  if (Object.keys(state.vars).length) {
    lines.push(":root {");
    for (const [k, v] of Object.entries(state.vars)) {
      lines.push(`  ${k}: ${v};`);
    }
    lines.push("}");
  }
  for (const [editId, props] of Object.entries(state.elements)) {
    if (selectedId && editId !== selectedId) continue;
    if (!Object.keys(props).length) continue;
    lines.push(`[data-edit-id="${editId}"] {`);
    for (const [prop, value] of Object.entries(props)) {
      lines.push(`  ${prop}: ${value} !important;`);
    }
    lines.push("}");
  }
  for (const editId of state.hidden) {
    if (selectedId && editId !== selectedId) continue;
    lines.push(`[data-edit-id="${editId}"] { display: none !important; }`);
  }
  return lines.join("\n");
}

export function exportChangeList(
  before: EditorState,
  after: EditorState,
): { element: string; property: string; oldValue: string; newValue: string }[] {
  const out: { element: string; property: string; oldValue: string; newValue: string }[] = [];
  for (const [name, value] of Object.entries(after.vars)) {
    const oldValue = before.vars[name] ?? "";
    if (oldValue !== value) {
      out.push({ element: ":root", property: name, oldValue, newValue: value });
    }
  }
  for (const [name, value] of Object.entries(before.vars)) {
    if (!(name in after.vars)) {
      out.push({ element: ":root", property: name, oldValue: value, newValue: "" });
    }
  }
  const allIds = new Set([...Object.keys(before.elements), ...Object.keys(after.elements)]);
  for (const id of allIds) {
    const b = before.elements[id] || {};
    const a = after.elements[id] || {};
    const allProps = new Set([...Object.keys(b), ...Object.keys(a)]);
    for (const prop of allProps) {
      const oldValue = b[prop] ?? "";
      const newValue = a[prop] ?? "";
      if (oldValue !== newValue) {
        out.push({ element: `[data-edit-id="${id}"]`, property: prop, oldValue, newValue });
      }
    }
  }
  return out;
}
