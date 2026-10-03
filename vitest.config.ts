import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig paths ("@/*" -> "./src/*") without adding a dep.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: { environment: "node" },
});
