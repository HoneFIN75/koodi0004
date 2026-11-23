import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { COMPETITION_FILE } from './src/models/competition.ts';

const databaseUrl = new URL('./jsondb/seurat.json', import.meta.url);
const competitionUrl = new URL(`./${COMPETITION_FILE}`, import.meta.url);
const regionsUrl = new URL('./jsondb/regions.json', import.meta.url);
const plannerApiUrl = new URL('./server/planner.php', import.meta.url);
const clubsApiUrl = new URL('./server/clubs.php', import.meta.url);
const clubsServiceUrl = new URL('./server/clubs-api.php', import.meta.url);

function serveDatabase(): Plugin {
  return {
    name: 'serve-seurat-database',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0];
        if (path === '/api/clubs.php') {
          try {
            const database = await readFile(databaseUrl);
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(database);
          } catch (error) {
            next(error);
          }
          return;
        }
        const source = path === `/${COMPETITION_FILE}` ? competitionUrl
            : path === '/jsondb/regions.json' ? regionsUrl : null;
        if (!source) {
          next();
          return;
        }
        try {
          const database = await readFile(source);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(database);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ error: `Missing ${path}` }));
            return;
          }
          next(error);
        }
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: COMPETITION_FILE, source: await readFile(competitionUrl) });
      this.emitFile({ type: 'asset', fileName: 'jsondb/regions.json', source: await readFile(regionsUrl) });
      this.emitFile({
        type: 'asset',
        fileName: 'api/planner.php',
        source: await readFile(plannerApiUrl),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'api/clubs.php',
        source: await readFile(clubsApiUrl),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'api/clubs-api.php',
        source: await readFile(clubsServiceUrl),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serveDatabase()],
});
