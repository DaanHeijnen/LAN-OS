// Serves the built web app (apps/web/dist). Every screen route gets index.html.
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

export function serveWebApp(app: FastifyInstance, distDir: string): void {
  const index = path.join(distDir, 'index.html');
  app.get('/*', async (request, reply) => {
    const urlPath = decodeURIComponent(request.url.split('?')[0]!);
    const file = path.normalize(path.join(distDir, urlPath));
    if (file.startsWith(distDir + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const immutable = urlPath.startsWith('/assets/');
      return reply
        .type(TYPES[path.extname(file)] ?? 'application/octet-stream')
        .header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
        .send(fs.createReadStream(file));
    }
    if (/^\/(wall|app|admin)(\/|$)/.test(urlPath)) {
      if (!fs.existsSync(index)) {
        return reply.code(503).type('text/plain').send('The web app is not built yet. Run "npm run build", then start LAN OS again.');
      }
      return reply.type(TYPES['.html']!).header('Cache-Control', 'no-cache').send(fs.createReadStream(index));
    }
    return reply.code(404).type('text/plain').send('Not found');
  });
}
