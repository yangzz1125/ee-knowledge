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
    // 只有一个入口包，压缩前约 610 KB（gzip 后约 200 KB），主要是 KaTeX、force-graph 和 Vue，属于预期体积。
    chunkSizeWarningLimit: 700,
  },
});
