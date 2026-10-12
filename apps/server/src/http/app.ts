// The web server: one WebSocket channel for live updates, the theme, the API and the web app.
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { clientMessageSchema, SCREENS, themeToCss, type Screen, type ServerMessage } from '@lan-os/shared';
import { adminRoutes } from './admin-routes.ts';
import { authRoutes } from './auth-routes.ts';
import { helpers, type AppContext } from './context.ts';
import { playerRoutes } from './player-routes.ts';
import { serveWebApp } from './static.ts';

export type { AppContext } from './context.ts';

/** Keep-alive: every screen gets a snapshot at least this often, so a dead link is noticed. */
const KEEPALIVE_MS = 20_000;

export async function buildApp(c: AppContext) {
  const app = Fastify({ logger: false, trustProxy: false, bodyLimit: 64 * 1024 });
  await app.register(websocket);
  const h = helpers(c);

  app.get('/ws', { websocket: true }, (socket, request) => {
    const query = request.query as { screen?: string };
    const screen: Screen = SCREENS.includes(query.screen as Screen) ? (query.screen as Screen) : 'wall';
    const session = screen === 'wall' ? null : h.sessionOf(request);
    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const unsubscribe = c.hub.subscribe({ screen, session, send: snapshot => send({ type: 'snapshot', snapshot }) });
    const keepAlive = setInterval(() => send({ type: 'snapshot', snapshot: c.hub.snapshot(screen, session) }), KEEPALIVE_MS);
    socket.on('message', (raw: Buffer) => {
      let data: unknown = null;
      try { data = JSON.parse(raw.toString()); } catch { /* ignored below */ }
      // Browsers only send keep-alive pings; anything else is dropped.
      if (!clientMessageSchema.safeParse(data).success) socket.close(1003, 'Unsupported message');
    });
    socket.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.get('/theme.css', async (_request, reply) =>
    reply.type('text/css; charset=utf-8').header('Cache-Control', 'no-cache').send(themeToCss(c.store.get('theme'))));

  authRoutes(app, c, h);
  playerRoutes(app, c, h);
  adminRoutes(app, c, h);

  app.setErrorHandler((error, request, reply) => {
    c.crashLog.write(error, `${request.method} ${request.url}`);
    void reply.code(500).send({ error: 'Something went wrong on the server. It is in the crash log on the admin page.' });
  });

  serveWebApp(app, c.webDistDir);
  return app;
}
