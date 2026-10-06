import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages 项目站点地址为 https://hiteater-wzm.github.io/eeo/，base 必须是 /eeo/。
// 自建部署在 /geo/ 路径下时，用 `VITE_BASE=/geo/ vite build` 重建（路由前缀会跟随 base）。
const BASE = process.env.VITE_BASE || '/eeo/';

// GitHub Pages 静态托管没有 SPA 重写规则：把 index.html 复制一份为 404.html，
// 深链（如 /eeo/directory）落到 404.html 时照样拉起 SPA，路由按 pathname 正常渲染。
const spa404Fallback = {
  name: 'spa-404-fallback',
  closeBundle() {
    const dist = fileURLToPath(new URL('./dist/', import.meta.url));
    fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
  },
};

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), spa404Fallback],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    proxy: {
      [`${BASE}api`]: {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        rewrite: (p) => p.replace(new RegExp(`^${BASE}api`), ''),
      },
    },
  },
  preview: {
    port: 5181,
  },
});
