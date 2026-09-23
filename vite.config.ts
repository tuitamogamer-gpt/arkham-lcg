import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 5187, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "card-data", test: /core-2026\.json/ },
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
});
