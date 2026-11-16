"use client";

import { useRef, useEffect } from "react";

export const FIG = {
  bg: "#1e1e1e",
  input: "#2c2c2c",
  border: "#333",
  text: "#e6e6e6",
  label: "#8a8a8a",
  blue: "#0d99ff",
} as const;

const inputBase: React.CSSProperties = {
  background: FIG.input,
  border: "1px solid transparent",
  borderRadius: 6,
  color: FIG.text,
  fontSize: 11,
  height: 28,
  outline: "none",
  width: "100%",
  minWidth: 0,
  padding: "0 8px",
};

function nextHex(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

function parseHex(hex: string) {
  const s = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function parseRgba(input: string) {
  const m = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
  const h = parseHex(input);
  if (h) return { ...h, a: 1 };
  return null;
}

export function toHex(r: number, g: number, b: number) {
  return `#${nextHex(r)}${nextHex(g)}${nextHex(b)}`.toUpperCase();
}

export function toRgba(r: number, g: number, b: number, a: number) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

export function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: flex ?? 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: FIG.label }}>{label}</span>
      {children}
    </label>
  );
}

export function Row({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) {
  return <div style={{ display: "flex", gap, alignItems: "flex-end" }}>{children}</div>;
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: `1px solid ${FIG.border}`, padding: "10px 12px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: FIG.text }}>{title}</span>
        {right ? <span style={{ display: "flex", gap: 4 }}>{right}</span> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  min = -9999,
  max = 9999,
  step = 1,
  suffix = "",
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = String(value);
  }, [value]);

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isNaN(n)) {
      if (ref.current) ref.current.value = String(value);
      return;
    }
    onChange(Math.min(max, Math.max(min, n)));
  };

  return (
    <Field label={label ?? ""}>
      <div style={{ display: "flex", alignItems: "center", background: FIG.input, borderRadius: 6, height: 28, padding: "0 6px" }}>
        <input
          ref={ref}
          type="text"
          defaultValue={String(value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onChange(Math.min(max, value + step));
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.max(min, value - step));
            } else if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          }}
          style={{ ...inputBase, background: "transparent", border: "none", height: 26, padding: 0 }}
        />
        {suffix ? <span style={{ fontSize: 10, color: FIG.label, marginLeft: 2, whiteSpace: "nowrap" }}>{suffix}</span> : null}
      </div>
    </Field>
  );
}

export function HexColor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const c = parseRgba(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  const hex = toHex(c.r, c.g, c.b);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = hex;
  }, [hex]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
      <div style={{ position: "relative", width: 28, height: 28, borderRadius: 6, overflow: "hidden", border: "1px solid #444", flexShrink: 0, background: hex }}>
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            const p = parseHex(e.target.value);
            if (p) onChange(toRgba(p.r, p.g, p.b, c.a));
          }}
          style={{ position: "absolute", inset: -8, width: 44, height: 44, opacity: 0, cursor: "pointer" }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", background: FIG.input, borderRadius: 6, height: 28, padding: "0 6px", flex: 1 }}>
        <span style={{ color: FIG.label, fontSize: 11, marginRight: 3 }}>#</span>
        <input
          ref={ref}
          type="text"
          defaultValue={hex.slice(1)}
          maxLength={6}
          spellCheck={false}
          onBlur={(e) => {
            const p = parseHex(e.target.value);
            if (p) onChange(toRgba(p.r, p.g, p.b, c.a));
            else if (ref.current) ref.current.value = hex.slice(1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const p = parseHex((e.target as HTMLInputElement).value);
              if (p) onChange(toRgba(p.r, p.g, p.b, c.a));
            }
          }}
          style={{ ...inputBase, background: "transparent", border: "none", height: 26, padding: 0, fontFamily: "ui-monospace, monospace" }}
        />
      </div>
      <NumInput value={Math.round(c.a * 100)} onChange={(v) => onChange(toRgba(c.r, c.g, c.b, v / 100))} min={0} max={100} suffix="%" />
    </div>
  );
}

export function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <Field label={label ?? ""}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputBase, padding: "0 6px" }}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", color: FIG.label, fontSize: 11, cursor: "pointer", padding: 0 }}>
      <span style={{ width: 28, height: 16, borderRadius: 8, background: value ? FIG.blue : "#444", position: "relative" }}>
        <span style={{ position: "absolute", top: 2, left: value ? 14 : 2, width: 12, height: 12, borderRadius: 6, background: "#fff" }} />
      </span>
      {label}
    </button>
  );
}

export function Btn({ children, onClick, active, disabled }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: active ? FIG.blue : FIG.input,
        color: disabled ? "#666" : "#fff",
        border: "none",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 11,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function IconBtn({ title, onClick, active, children }: { title: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        background: active ? "rgba(13,153,255,0.2)" : "transparent",
        color: active ? FIG.blue : FIG.label,
        border: "none",
        borderRadius: 4,
        width: 26,
        height: 26,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}
