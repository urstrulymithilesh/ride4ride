"use client";

import dynamic from "next/dynamic";

const VisualEditor = dynamic(
  () => import("./visual-editor").then((m) => m.VisualEditor),
  { ssr: false },
);

const GridOverlay = dynamic(
  () => import("./grid-overlay").then((m) => m.GridOverlay),
  { ssr: false },
);

export function VisualEditorWrapper() {
  return (
    <>
      <VisualEditor />
      <GridOverlay />
    </>
  );
}
