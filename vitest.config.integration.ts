import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30000,
    globals: true,
  },
});
