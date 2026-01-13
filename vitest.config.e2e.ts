import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/e2e/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    testTimeout: 60000,
    globals: true,
  },
});
