// LAN Wrapped as one self-contained HTML file: no internet, no LAN OS needed to open it.
import type { RecapData, ThemeConfig } from '@lan-os/shared';
import { formatDuration, themeToCss } from '@lan-os/shared';

const esc = (s: unknown) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const when = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export function renderRecapHtml(r: RecapData, theme: ThemeConfig): string {
  const tz = r.lan.timezone;
  const maxHour = Math.max(1, ...r.hourly);
  const bars = r.hourly.map((h, i) => `<div class="bar" title="${i}:00 · ${h}h"><i style="height:${Math.round((h / maxHour) * 100)}%"></i><span>${i % 3 === 0 ? i : ''}</span></div>`).join('');
  const list = <T,>(items: T[], row: (x: T) => string, empty: string) => (items.length ? items.map(row).join('') : `<p class="quiet">${empty}</p>`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.lan.name)} · LAN Wrapped</title>
<style>
${themeToCss(theme)}
*{box-sizing:border-box}body{margin:0;background:var(--surface-wall);color:var(--text-primary);font:16px/1.5 var(--font-family)}
main{max-width:1100px;margin:auto;padding:48px 24px 80px}h1{font-size:48px;letter-spacing:-.04em;margin:0}h2{font-size:22px;margin:0 0 16px}
.eyebrow{color:var(--accent);letter-spacing:.12em;font-weight:700;font-size:13px}.quiet{color:var(--text-quiet)}.sub{color:var(--text-secondary)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-top:28px}
section{background:var(--surface-card);border-radius:var(--radius-card);padding:24px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-top:28px}
.stat{background:var(--surface-card);border-radius:16px;padding:18px}.stat b{display:block;font-size:34px;letter-spacing:-.03em}.stat span{color:var(--text-secondary);font-size:13px}
.row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid rgba(176,189,210,.12)}.row:last-child{border:0}
.award{padding:12px 0;border-bottom:1px solid rgba(176,189,210,.12)}.award b{color:var(--accent)}
.hours{display:flex;align-items:flex-end;gap:4px;height:140px}.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%}
.bar i{display:block;background:var(--accent);border-radius:4px 4px 0 0;min-height:2px}.bar span{font-size:11px;color:var(--text-quiet);text-align:center;height:16px}
.person{background:var(--surface-raised);border-radius:14px;padding:14px;margin-bottom:10px}
</style></head><body><main>
<p class="eyebrow">LAN WRAPPED${r.range.final ? '' : ' · SO FAR'}</p>
<h1>${esc(r.lan.name)}</h1>
<p class="sub">${esc(r.range.label)} · ${when(r.range.from, tz)} – ${when(r.range.to, tz)}</p>
<div class="stats">
  <div class="stat"><b>${r.totals.hours}h</b><span>played together</span></div>
  <div class="stat"><b>${r.totals.uniqueGames}</b><span>different games</span></div>
  <div class="stat"><b>${r.totals.sessions}</b><span>game sessions</span></div>
  <div class="stat"><b>${r.totals.songs}</b><span>songs on LAN Radio</span></div>
  <div class="stat"><b>${r.totals.votes}</b><span>votes cast</span></div>
  <div class="stat"><b>${r.totals.activities}</b><span>activities</span></div>
</div>
<div class="grid">
<section><h2>Awards</h2>${list(r.awards, a => `<div class="award"><b>${esc(a.title)}</b><br>${esc(a.player)} <span class="quiet">· ${esc(a.reason)}</span></div>`, 'No awards yet.')}</section>
<section><h2>Most played</h2>${list(r.topGames, g => `<div class="row"><span>${esc(g.name)}</span><span class="sub">${g.hours}h · ${g.players} players</span></div>`, 'No games yet.')}</section>
<section><h2>Longest sessions</h2>${list(r.longestSessions, s => `<div class="row"><span>${esc(s.player)} · ${esc(s.game)}</span><span class="sub">${formatDuration(s.seconds)}</span></div>`, 'No sessions yet.')}</section>
<section><h2>Biggest groups</h2>${list(r.biggestGroups, g => `<div class="row"><span>${esc(g.game)}</span><span class="sub">${g.players.length} · ${esc(g.players.join(', '))}</span></div>`, 'Nobody played together yet.')}</section>
<section><h2>When we played</h2><div class="hours">${bars}</div></section>
<section><h2>LAN Radio</h2>
${list(r.music.topSongs, s => `<div class="row"><span>${esc(s.title)} <span class="quiet">· ${esc(s.artist)}</span></span><span class="sub">${s.count}×</span></div>`, 'No songs yet.')}
${r.music.perPlayer.length ? `<p class="sub">Requests: ${r.music.perPlayer.map(p => `${esc(p.player)} ${p.count}`).join(' · ')}</p>` : ''}
${r.music.topArtists.length ? `<p class="sub">Top artists: ${r.music.topArtists.map(a => esc(a.artist)).join(', ')}</p>` : ''}</section>
</div>
<div class="grid">
<section><h2>Everyone</h2>${list(r.players, p => `<div class="person"><b>${esc(p.nickname)}</b>${p.award ? ` <span class="eyebrow">${esc(p.award)}</span>` : ''}<br>
<span class="sub">${p.hours}h · ${p.sessions} sessions · ${p.songs} songs${p.favouriteHour !== null ? ` · most active around ${p.favouriteHour}:00` : ''}</span><br>
<span class="quiet">${p.games.slice(0, 4).map(g => `${esc(g.name)} ${g.hours}h`).join(' · ')}</span></div>`, 'Nobody yet.')}</section>
<section><h2>Timeline</h2>${list(r.timeline, t => `<div class="row"><span>${esc(t.text)}</span><span class="quiet">${when(t.at, tz)}</span></div>`, 'Nothing yet.')}</section>
<section><h2>The weekend playlist</h2>${list(r.music.playlist, s => `<div class="row"><span>${esc(s.title)} <span class="quiet">· ${esc(s.artist)}</span></span><span class="sub">${esc(s.requester ?? '')}</span></div>`, 'No requests yet.')}</section>
</div>
<p class="quiet" style="margin-top:40px">Made with LAN OS · ${new Date().toISOString().slice(0, 10)}</p>
</main></body></html>`;
}
