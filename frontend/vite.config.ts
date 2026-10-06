import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Keep shared icon helpers together rather than dozens of tiny requests.
          // Pages and editors still use their actual on-demand import boundaries.
          groups: [{ name: "ui-icons", test: /[\\/]node_modules[\\/]lucide-react[\\/]/ }]
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
