import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.browser.{test,spec}.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        { browser: "chromium" },
      ],
    },
  },
});

