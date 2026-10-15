// What players do from their dashboard: status, music, polls, activities, and the recap.
import type { FastifyInstance } from 'fastify';
import {
  activityActionSchema, dashboardLayoutSchema, myStatusSchema, newActivitySchema, newPollSchema, pinSchema,
  radioControlSchema, rsvpSchema, songRequestSchema, voteSchema, closePollSchema, bingoTickSchema,
} from '@lan-os/shared';
import { updatePlayer } from '../config/players.ts';
import { buildRecap, lanSummaries } from '../history/recap.ts';
import { renderRecapHtml } from '../history/export.ts';
import type { AppContext, Helpers } from './context.ts';

const HOUR = 3_600_000;

export function playerRoutes(app: FastifyInstance, c: AppContext, h: Helpers): void {
  const id = (request: { params: unknown }) => Number((request.params as { id: string }).id);

  // --- Your status ---

  app.post('/api/me/status', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const input = playerId && h.body(myStatusSchema, request, reply);
    if (!playerId || !input) return;
    return h.attempt(reply, () => {
      if (input.hiddenFromWall !== undefined) updatePlayer(c.store, playerId, { hidden_from_wall: input.hiddenFromWall });
      const changes: { looking?: boolean; manualGame?: string | null } = {};
      if (input.looking !== undefined) changes.looking = input.looking;
      if (input.manualGame !== undefined) changes.manualGame = input.manualGame || null;
      if (Object.keys(changes).length) c.hub.updateProfile(playerId, changes);
    });
  });

  app.post('/api/me/layout', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const layout = playerId && h.body(dashboardLayoutSchema, request, reply);
    if (!playerId || !layout) return;
    c.hub.updateProfile(playerId, { layout });
    return reply.send({ ok: true });
  });

  app.post('/api/me/pin', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const input = playerId && h.body(pinSchema, request, reply);
    if (!playerId || !input) return;
    c.accounts.setPin(playerId, input.pin);
    if (input.pin && !c.accounts.joinLinkFor(playerId)) c.accounts.createJoinLink(playerId);
    c.hub.push();
    return reply.send({ ok: true });
  });

  // --- LAN Radio ---

  app.get('/api/radio/search', async (request, reply) => {
    if (!h.requirePlayer(request, reply)) return;
    const { q } = request.query as { q?: string };
    return h.attempt(reply, async () => ({ tracks: await c.hub.radio.search((q ?? '').slice(0, 100)) }));
  });

  app.post('/api/radio/request', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const input = playerId && h.body(songRequestSchema, request, reply);
    if (!playerId || !input) return;
    return h.attempt(reply, async () => ({ track: await c.hub.radio.request(playerId, input) }));
  });

  app.delete('/api/radio/request/:id', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    if (!playerId) return;
    return h.attempt(reply, () => c.hub.radio.remove(playerId, id(request), false));
  });

  app.post('/api/radio/skip-vote', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    if (!playerId) return;
    return h.attempt(reply, () => c.hub.radio.voteSkip(playerId, c.hub.players.length));
  });

  /** Pause, skip and volume, for whoever music.yaml allows. */
  app.post('/api/radio/control', async (request, reply) => {
    const input = h.body(radioControlSchema, request, reply);
    if (!input) return;
    const session = h.sessionOf(request);
    const music = c.store.get('music');
    const who = input.action === 'skip' ? music.who_can_skip : input.action === 'volume' ? music.who_can_change_volume : music.who_can_pause;
    if (!session || (who === 'admins' && !c.hub.isAdmin(session))) {
      return reply.code(403).send({ error: 'Only admins can do that. Start a skip vote instead.' });
    }
    return h.attempt(reply, () => c.hub.radio.control(input.action, input.volume));
  });

  // --- Polls ---

  app.post('/api/polls', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const input = playerId && h.body(newPollSchema, request, reply);
    if (!playerId || !input) return;
    return h.attempt(reply, () => ({ id: c.hub.polls.create(playerId, input) }));
  });

  app.post('/api/polls/:id/vote', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const input = playerId && h.body(voteSchema, request, reply);
    if (!playerId || !input) return;
    return h.attempt(reply, () => c.hub.polls.vote(playerId, id(request), input.option));
  });

  app.post('/api/polls/:id/close', async (request, reply) => {
    const session = h.sessionOf(request);
    const input = h.body(closePollSchema, request, reply);
    if (!input) return;
    if (!session) return reply.code(401).send({ error: 'Sign in first.' });
    return h.attempt(reply, () => c.hub.polls.close(id(request), { playerId: session.playerId, isAdmin: c.hub.isAdmin(session) }, input.winner));
  });

  // --- Activities ---

  app.post('/api/activities', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const input = playerId && h.body(newActivitySchema, request, reply);
    if (!playerId || !input) return;
    return h.attempt(reply, () => ({ id: c.hub.activities.create(playerId, input) }));
  });

  app.post('/api/activities/:id/rsvp', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const input = playerId && h.body(rsvpSchema, request, reply);
    if (!playerId || !input) return;
    return h.attempt(reply, () => c.hub.activities.rsvp(playerId, id(request), input.answer, input.etaMinutes));
  });

  app.post('/api/activities/:id', async (request, reply) => {
    const session = h.sessionOf(request);
    const input = h.body(activityActionSchema, request, reply);
    if (!input) return;
    if (!session) return reply.code(401).send({ error: 'Sign in first.' });
    return h.attempt(reply, () => c.hub.activities.act(id(request), input.action, { playerId: session.playerId, isAdmin: c.hub.isAdmin(session) }));
  });

  // --- Tournament bingo ---

  app.post('/api/tournament/bingo/:id', async (request, reply) => {
    const playerId = h.requirePlayer(request, reply);
    const input = playerId && h.body(bingoTickSchema, request, reply);
    if (!playerId || !input) return;
    return h.attempt(reply, () => c.hub.tournament.tick(playerId, id(request), input.ticked));
  });

  // --- History and LAN Wrapped (visible to everyone on the LAN) ---

  const recapFor = (lan: string | undefined, range: string | undefined) => {
    const lanId = lan || c.hub.lanId;
    const final = c.hub.runtime().recap_published.includes(lanId);
    const nickname = (pid: string) => c.hub.nickname(pid);
    const base = buildRecap(c.db, { lanId, nickname, final });
    if (!base || !range || range === 'all') return base;
    const start = Date.parse(base.lan.startsAt);
    const now = Date.now();
    if (range === 'last-24h') return buildRecap(c.db, { lanId, nickname, range: { from: new Date(now - 24 * HOUR), to: new Date(now), label: 'The last 24 hours' } });
    const day = /^day-(\d+)$/.exec(range);
    if (day) {
      const n = Number(day[1]);
      return buildRecap(c.db, { lanId, nickname, range: { from: new Date(start + (n - 1) * 24 * HOUR), to: new Date(start + n * 24 * HOUR), label: `Day ${n}` } });
    }
    return base;
  };

  app.get('/api/recap', async (request, reply) => {
    const { lan, range } = request.query as { lan?: string; range?: string };
    const recap = recapFor(lan, range);
    return recap ? reply.send(recap) : reply.code(404).send({ error: 'No LAN with that name.' });
  });

  app.get('/api/recap/lans', async (_request, reply) =>
    reply.send(lanSummaries(c.db, pid => c.hub.nickname(pid), lanId => c.hub.runtime().recap_published.includes(lanId))));

  app.get('/recap/:lan/export.html', async (request, reply) => {
    const recap = recapFor((request.params as { lan: string }).lan, 'all');
    if (!recap) return reply.code(404).type('text/plain').send('No LAN with that name.');
    return reply.type('text/html; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${recap.lan.id}-wrapped.html"`)
      .send(renderRecapHtml(recap, c.store.get('theme')));
  });

}
