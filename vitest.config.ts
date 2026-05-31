import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    // Only pick up files explicitly named *.test.ts so we don't accidentally
    // pull integration suites that need a live DB into the unit run.
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["**/*.test.ts", "src/lib/db/**", "src/lib/scheduler/**"],
    },
  },
});
