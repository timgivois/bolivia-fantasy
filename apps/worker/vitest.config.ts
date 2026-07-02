import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Integration tests share the local Postgres database; run files
    // sequentially so their seeds/cleanups never interleave.
    fileParallelism: false,
  },
});
