"use client";

import dynamic from "next/dynamic";

const VisualEditor = dynamic(
  () => import("./visual-editor").then((m) => m.VisualEditor),
  { ssr: false },
);

export function VisualEditorWrapper() {
  return <VisualEditor />;
}
