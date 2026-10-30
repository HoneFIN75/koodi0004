import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';

const databaseUrl = new URL('./jsondb/seurat.json', import.meta.url);

function serveDatabase(): Plugin {
  return {
    name: 'serve-seurat-database',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/jsondb/seurat.json') {
          next();
          return;
        }
        try {
          const database = await readFile(databaseUrl);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(database);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ error: 'Missing jsondb/seurat.json' }));
            return;
          }
          next(error);
        }
      });
    },
    async generateBundle() {
      const database = await readFile(databaseUrl);
      this.emitFile({
        type: 'asset',
        fileName: 'jsondb/seurat.json',
        source: database,
      });
    },
  };
}

export default defineConfig({ plugins: [react(), serveDatabase()] });
