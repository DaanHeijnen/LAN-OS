// The admin page and the first-run setup. The host PC itself always counts as admin.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isSeq } from 'yaml';
import {
  activityActionSchema, closePollSchema, discordSettingsSchema, eventSettingsSchema, newPlayerSchema, newTournamentGameSchema,
  newTournamentSchema, playerFieldsSchema, radioControlSchema, safetySchema, setupSecretSchema, steamPauseSchema,
  tournamentGameChangeSchema, tournamentRoundSchema, tournamentStateSchema, wallMessageSchema, wallSettingsSchema,
} from '@lan-os/shared';
import { z } from 'zod';
import { addPlayer, removePlayer, updatePlayer } from '../config/players.ts';
import { removeEvent } from '../db/events.ts';
import { fromHostPc, type AppContext, type Helpers } from './context.ts';

const SECRET_LABELS = {
  ADMIN_PASSWORD: 'Admin password', STEAM_API_KEY: 'Steam API key', SPOTIFY_CLIENT_ID: 'Spotify Client ID',
  DISCORD_BOT_TOKEN: 'Discord bot token', AI_API_KEY: 'AI key',
} as const;

export function adminRoutes(app: FastifyInstance, c: AppContext, h: Helpers): void {
  const id = (request: { params: unknown }) => (request.params as { id: string }).id;
  /** Runs the handler only for admins (or the host PC). */
  const admin = (handler: (request: FastifyRequest, reply: FastifyReply) => unknown) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!h.requireAdmin(request, reply)) return;
      return handler(request, reply);
    };

  // --- Setup: keys and passwords, written to .env ---

  app.post('/api/setup/secret', admin(async (request, reply) => {
    const input = h.body(setupSecretSchema, request, reply);
    if (!input) return;
    if (input.name === 'ADMIN_PASSWORD' && input.value !== null && input.value.length < 6) {
      return reply.code(400).send({ error: 'Choose an admin password of at least 6 characters.' });
    }
    if (input.name === 'SPOTIFY_CLIENT_ID' && input.value && !/^[0-9a-f]{32}$/i.test(input.value)) {
      return reply.code(400).send({ error: 'A Spotify Client ID is 32 letters and numbers. Copy it from your Spotify app\'s Settings page.' });
    }
    if (input.name === 'STEAM_API_KEY' && input.value && !/^[0-9A-F]{32}$/i.test(input.value)) {
      return reply.code(400).send({ error: 'A Steam API key is 32 letters and numbers. Copy it from steamcommunity.com/dev/apikey.' });
    }
    c.secrets.set(input.name, input.value || null);
    if (input.name === 'SPOTIFY_CLIENT_ID') c.spotifyTokens.clear();
    c.hub.onSecretsChange();
    return reply.send({ ok: true, message: `${SECRET_LABELS[input.name]} ${input.value ? 'saved' : 'removed'}.` });
  }));

  app.get('/api/setup/status', async (request, reply) => reply.send({
    hostPc: fromHostPc(request),
    adminPasswordSet: c.secrets.get('ADMIN_PASSWORD') !== null,
  }));

  app.post('/api/admin/event', admin(async (request, reply) => {
    const input = h.body(eventSettingsSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.store.update('event', document => {
      document.set('name', input.name);
      document.set('starts_at', input.startsAt);
      document.set('ends_at', input.endsAt);
      if (input.newLan) {
        // A new code keeps this LAN's stats apart from earlier ones.
        const base = `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'lan'}-${input.startsAt.slice(0, 7)}`;
        document.set('lan_id', base);
      }
    }));
  }));

  app.post('/api/admin/spotify/disconnect', admin(async (_request, reply) => {
    c.spotifyTokens.clear();
    c.hub.resetMusic();
    return reply.send({ ok: true });
  }));

  // --- People ---

  app.post('/api/admin/players', admin(async (request, reply) => {
    const input = h.body(newPlayerSchema, request, reply);
    if (!input) return;
    if (c.hub.player(input.id)) return reply.code(400).send({ error: `There is already a player with id "${input.id}".` });
    return h.attempt(reply, () => {
      addPlayer(c.store, { id: input.id, nickname: input.nickname, steam_id: input.steamId, role: input.role, hidden_from_wall: input.hiddenFromWall });
      c.accounts.createJoinLink(input.id);
    });
  }));

  app.patch('/api/admin/players/:id', admin(async (request, reply) => {
    const input = h.body(playerFieldsSchema.partial(), request, reply);
    if (!input) return;
    return h.attempt(reply, () => updatePlayer(c.store, id(request), {
      nickname: input.nickname, steam_id: input.steamId, role: input.role, hidden_from_wall: input.hiddenFromWall,
    }));
  }));

  app.delete('/api/admin/players/:id', admin(async (request, reply) => h.attempt(reply, () => {
    removePlayer(c.store, id(request));
    c.accounts.revokeJoinLinks(id(request));
    c.accounts.endPlayerSessions(id(request));
  })));

  app.post('/api/admin/players/:id/join-link', admin(async (request, reply) => {
    if (!c.hub.player(id(request))) return reply.code(404).send({ error: 'No such player.' });
    c.accounts.createJoinLink(id(request));
    c.hub.push();
    return reply.send({ ok: true });
  }));

  // --- Projector ---

  app.post('/api/admin/wall', admin(async (request, reply) => {
    const input = h.body(wallSettingsSchema, request, reply);
    if (!input) return;
    if (input.blanked !== undefined || input.paused !== undefined) {
      c.hub.setRuntime({
        ...(input.blanked !== undefined && { wall_blanked: input.blanked }),
        ...(input.paused !== undefined && { wall_paused: input.paused }),
      });
    }
    if (input.nightMode === undefined && input.brightness === undefined && input.panels === undefined) return reply.send({ ok: true });
    return h.attempt(reply, () => c.store.update('wall', document => {
      if (input.nightMode !== undefined) document.set('night_mode', input.nightMode);
      if (input.brightness !== undefined) document.set('brightness', input.brightness);
      if (input.panels !== undefined) {
        const current = document.get('panels');
        const list = document.createNode(input.panels);
        // Keep the one-line [music, poll, activity] style the owner sees in the file.
        if (isSeq(current) && current.flow) list.flow = true;
        document.set('panels', list);
      }
    }));
  }));

  app.post('/api/admin/message', admin(async (request, reply) => {
    const input = h.body(wallMessageSchema, request, reply);
    if (!input) return;
    c.hub.setRuntime({ wall_message: input.text || null });
    return reply.send({ ok: true });
  }));

  // --- Moderation and safety ---

  app.post('/api/admin/safety', admin(async (request, reply) => {
    const input = h.body(safetySchema, request, reply);
    if (!input) return;
    c.hub.setRuntime({
      ...(input.submissionsDisabled !== undefined && { submissions_disabled: input.submissionsDisabled }),
      ...(input.hidePublic !== undefined && { hide_public: input.hidePublic }),
      ...(input.radioRequestsClosed !== undefined && { radio_requests_closed: input.radioRequestsClosed }),
    });
    return reply.send({ ok: true });
  }));

  app.post('/api/admin/radio', admin(async (request, reply) => {
    const input = h.body(radioControlSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.hub.radio.control(input.action, input.volume));
  }));

  app.delete('/api/admin/radio/:id', admin(async (request, reply) => h.attempt(reply, () => c.hub.radio.remove(null, Number(id(request)), true))));

  app.post('/api/admin/polls/:id/close', admin(async (request, reply) => {
    const input = h.body(closePollSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.hub.polls.close(Number(id(request)), { playerId: null, isAdmin: true }, input.winner));
  }));

  app.delete('/api/admin/polls/:id', admin(async (request, reply) => h.attempt(reply, () => c.hub.polls.remove(Number(id(request))))));

  app.post('/api/admin/activities/:id', admin(async (request, reply) => {
    const input = h.body(activityActionSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.hub.activities.act(Number(id(request)), input.action, { playerId: null, isAdmin: true }));
  }));

  app.post('/api/admin/steam', admin(async (request, reply) => {
    const input = h.body(steamPauseSchema, request, reply);
    if (!input) return;
    c.hub.setRuntime({ steam_paused: input.paused });
    return reply.send({ ok: true });
  }));

  // --- Tournament ---

  app.post('/api/admin/tournament', admin(async (request, reply) => {
    const input = h.body(newTournamentSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.hub.tournament.create(input.name));
  }));

  app.post('/api/admin/tournament/state', admin(async (request, reply) => {
    const input = h.body(tournamentStateSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.hub.tournament.setState(input.state));
  }));

  app.post('/api/admin/tournament/games', admin(async (request, reply) => {
    const input = h.body(newTournamentGameSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.hub.tournament.addGame(input));
  }));

  app.patch('/api/admin/tournament/games/:id', admin(async (request, reply) => {
    const input = h.body(tournamentGameChangeSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.hub.tournament.changeGame(Number(id(request)), input));
  }));

  app.delete('/api/admin/tournament/games/:id', admin(async (request, reply) =>
    h.attempt(reply, () => c.hub.tournament.removeGame(Number(id(request))))));

  app.post('/api/admin/tournament/games/:id/start', admin(async (request, reply) =>
    h.attempt(reply, () => c.hub.tournament.startGame(Number(id(request))))));

  app.post('/api/admin/tournament/games/:id/finish', admin(async (request, reply) =>
    h.attempt(reply, () => c.hub.tournament.finishGame(Number(id(request))))));

  app.post('/api/admin/tournament/games/:id/rounds', admin(async (request, reply) => {
    const input = h.body(tournamentRoundSchema, request, reply);
    if (!input) return;
    return h.attempt(reply, () => c.hub.tournament.recordRound(Number(id(request)), input.placings));
  }));

  app.delete('/api/admin/tournament/games/:id/rounds/last', admin(async (request, reply) =>
    h.attempt(reply, () => c.hub.tournament.removeLastRound(Number(id(request))))));

  app.delete('/api/admin/tournament/games/:id/bingo/:player/:square', admin(async (request, reply) => {
    const params = request.params as { player: string; square: string };
    return h.attempt(reply, () => c.hub.tournament.untick(Number(id(request)), params.player, Number(params.square)));
  }));

  // --- History, backups, Discord ---

  app.delete('/api/admin/events/:id', admin(async (request, reply) => {
    const removed = removeEvent(c.db, Number(id(request)));
    c.hub.push();
    return removed ? reply.send({ ok: true }) : reply.code(404).send({ error: 'That event was already removed.' });
  }));

  app.post('/api/admin/backup', admin(async (_request, reply) => {
    await c.hub.runBackup();
    return reply.send({ ok: true });
  }));

  app.post('/api/admin/recap', admin(async (request, reply) => {
    const input = h.body(z.strictObject({ published: z.boolean() }), request, reply);
    if (!input) return;
    c.hub.publishRecap(input.published);
    return reply.send({ ok: true });
  }));

  app.post('/api/admin/discord', admin(async (request, reply) => {
    const input = h.body(discordSettingsSchema, request, reply);
    if (!input) return;
    if (input.selected) c.hub.setRuntime({ discord_selected: input.selected });
    if (input.channelId !== undefined) {
      return h.attempt(reply, () => {
        c.store.update('integrations', document => {
          document.set('discord_channel_id', input.channelId ?? '');
          if (input.channelId) document.set('discord_enabled', true);
        });
        void c.hub.refreshDiscord();
      });
    }
    return reply.send({ ok: true });
  }));
}
