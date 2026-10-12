import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 开发时页面由 Vite 提供（5173），/api 转给本地 FastAPI；构建产物 dist/ 由 FastAPI 同源托管。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // three.js 和 3D 图谱库单独成块，压缩前约 1.4 MB（gzip 后约 370 KB），属于预期体积。
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        manualChunks: id => (id.includes("node_modules/three") ? "three" : undefined),
      },
    },
  },
});
