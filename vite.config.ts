import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 允许局域网与手机直接访问
    port: 3000,
    open: false,
  },
});
