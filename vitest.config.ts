import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@cs/shared/lifecycle": resolvePath("./packages/shared/src/lifecycle.ts"),
      "@cs/shared/paths": resolvePath("./packages/shared/src/paths.ts"),
      "@cs/shared": resolvePath("./packages/shared/src/index.ts"),
      "@cs/db/testing": resolvePath("./packages/db/src/testing.ts"),
      "@cs/db": resolvePath("./packages/db/src/index.ts"),
      "@": resolvePath("./apps/web/src"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "apps/**/src/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
