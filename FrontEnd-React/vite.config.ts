import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the browser talks to this server only; Vite forwards /api to the backend, so there is no
// cross-origin request and the backend's CORS list does not matter. Set VITE_DEV_API_TARGET if the backend
// is not on localhost:5000.
const apiTarget = process.env.VITE_DEV_API_TARGET ?? "http://localhost:5000";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    rollupOptions: {
      output: {
        // Heavy, rarely-changing libraries get their own chunks so browsers can cache them across deploys.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router", "react-redux", "@reduxjs/toolkit"],
          "vendor-heroui": ["@heroui/react", "react-aria-components"],
        },
      },
    },
  },

  plugins: [react(), tailwindcss()],
});
