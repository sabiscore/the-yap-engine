import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // More-specific sub-path aliases MUST come before the bare @swarmx/types alias
      // to prevent the prefix match from incorrectly rewriting sub-path imports.
      { find: "@swarmx/types/operator-map", replacement: path.resolve(__dirname, "../../packages/swarmx-types/src/operator-map.ts") },
      { find: "@swarmx/types/operation-types", replacement: path.resolve(__dirname, "../../packages/swarmx-types/src/operation-types.ts") },
      { find: "@swarmx/types/video-types", replacement: path.resolve(__dirname, "../../packages/swarmx-types/src/video-types.ts") },
      { find: "@swarmx/types/series-types", replacement: path.resolve(__dirname, "../../packages/swarmx-types/src/series-types.ts") },
      { find: "@swarmx/types", replacement: path.resolve(__dirname, "../../packages/swarmx-types/src/index.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/services/reasoning-sanitizer.ts",
        "src/services/video-queue.ts",
        "src/services/video-runtime-config.ts",
        "src/lib/env.ts",
        "src/services/series-registry.ts",
        "src/services/video-episode-preproducer.ts",
      ],
      thresholds: { lines: 60 },
    },
  },
});
