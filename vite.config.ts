import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["sigil.svg", "fonts/*.ttf", "icons/*.png"],
      manifest: {
        name: "Arkham Chronicle",
        short_name: "Arkham Chronicle",
        description:
          "A scripted Arkham Horror: The Card Game investigation for one to three investigators.",
        theme_color: "#101e1b",
        background_color: "#0b1412",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The app shell, fonts and card data are precached; card art is cached
        // as it is seen, so a played scenario keeps working offline.
        globPatterns: ["**/*.{js,css,html,svg,ttf,png,webmanifest}"],
        globIgnores: ["**/art/**"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/art/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "arkham-art",
              // Artwork has stable filenames. Revalidate even an older
              // browser response marked immutable by a previous deployment.
              fetchOptions: { cache: "no-cache" },
              expiration: {
                maxEntries: 900,
                maxAgeSeconds: 60 * 60 * 24 * 180,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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
