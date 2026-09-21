import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite auto-discovers postcss.config.mjs, which uses Tailwind v4's
  // string-based plugin syntax -- fine for Next.js's own build, but Vite's
  // PostCSS loader chokes on it ("Invalid PostCSS Plugin"). None of these
  // tests touch CSS, so short-circuit css processing entirely rather than
  // pulling in a Tailwind-compatible PostCSS pipeline just to satisfy the
  // test runner.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
