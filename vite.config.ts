import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function localDataSyncPlugin(): Plugin {
  const syncFile = path.resolve(__dirname, '.local-data-sync.json');

  return {
    name: 'local-data-sync',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/__local_sync') {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            if (fs.existsSync(syncFile)) {
              const data = fs.readFileSync(syncFile, 'utf-8');
              res.end(data);
            } else {
              res.end(JSON.stringify({ empty: true }));
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                fs.writeFileSync(syncFile, body, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: String(e) }));
              }
            });
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localDataSyncPlugin()],
  server: {
    host: true, // 允许局域网与手机直接访问
    port: 3000,
    open: false,
  },
});
