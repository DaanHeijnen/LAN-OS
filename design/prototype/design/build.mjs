/**
 * LAN OS interface prototype generator.
 * Usage: node design/build.mjs
 * Theme tokens are read from config/theme.yaml. Generated HTML files keep their
 * actual markup in design/templates and share generated assets/theme.css.
 * No packages or internet connection needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(project,p), 'utf8');
const put = (p,s) => { fs.mkdirSync(path.dirname(path.join(project,p)),{recursive:true}); fs.writeFileSync(path.join(project,p),s); };
const cfg = {}; let group = null;
for (const raw of read('config/theme.yaml').split(/\r?\n/)) {
  const clean = raw.replace(/\s+#.*$/, '').trimEnd();
  if(!clean.trim() || clean.trim().startsWith('#'))continue;
  const match=clean.match(/^(\s*)([a-z0-9_]+):\s*(.*?)\s*$/i);
  if(!match)continue;
  if(!match[1]) {group=match[2]; cfg[group]={};}
  else if(group) cfg[group][match[2]]=match[3].replace(/^['"]|['"]$/g,'');
}
const day={...cfg.surfaces,...cfg.text,...cfg.status,...cfg.accent};
const night={...day,...cfg.night_mode};
const token=k=> k==='accent_main'?'--accent': k.startsWith('status_')?`--status-${k.slice(7).replaceAll('_','-')}`:`--${k.replaceAll('_','-')}`;
const css=(p)=>Object.entries(p).map(([k,v])=>`  ${token(k)}: ${v};`).join('\n');
put('assets/theme.css',`/* Generated from config/theme.yaml. Edit YAML and run node design/build.mjs. */\n:root {\n${css(day)}\n  --font-family: ${cfg.typography.font_family};\n  --wall-clock: ${cfg.typography.size_clock}px;\n  --wall-headline: ${cfg.typography.size_headline}px;\n  --wall-duration: ${cfg.typography.size_duration}px;\n  --wall-name: ${cfg.typography.size_name}px;\n  --wall-body: ${cfg.typography.size_body}px;\n  --wall-secondary: ${cfg.typography.size_secondary}px;\n  --wall-minimum: ${cfg.typography.size_minimum}px;\n  --space-frame: ${cfg.spacing.space_frame}px;\n  --space-gap: ${cfg.spacing.space_gap}px;\n  --radius-card: ${cfg.spacing.radius_card}px;\n  --radius-group: ${cfg.spacing.radius_group}px;\n  --radius-pill: ${cfg.spacing.radius_pill}px;\n}\n:root[data-theme="night"] {\n${css(night)}\n}\n`);
for(const name of ['index','admin','player','wall'])put(`${name}.html`,read(`design/templates/${name}.html`));
// Single-file copies for opening one screen outside the project folder.
// The full package / localhost preview is recommended for same-origin sync.
for (const name of ['admin','player','wall']) {
  let html=read(`design/templates/${name}.html`);
  for(const asset of ['theme',name==='wall'?'wall':'app'])
    html=html.replace(`<link rel="stylesheet" href="assets/${asset}.css">`,()=>`<style>\n${read(`assets/${asset}.css`)}\n</style>`);
  html=html.replace('<script src="assets/app.js" defer></script>',()=>`<script>\n${read('assets/app.js')}\n</script>`);
  for(const other of ['wall','player','admin'])html=html.replaceAll(`href="${other}.html"`,`href="${other}-standalone.html"`);
  put(`${name}-standalone.html`,html);
}

const rgb = h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin = c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
const lum = h=>{const [r,g,b]=rgb(h).map(lin);return .2126*r+.7152*g+.0722*b};
const contrast=(a,b)=>{const l=[lum(a),lum(b)].sort((a,b)=>b-a);return(l[0]+.05)/(l[1]+.05)};
let fails=[];
const check=(name,a,b,minimum)=>{const ratio=contrast(a,b);if(ratio<minimum)fails.push(`${name}: ${ratio.toFixed(2)} < ${minimum}`);return `<span class="${ratio>=minimum?'pass':'fail'}">${ratio.toFixed(1)}:1</span>`};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const swatches=p=>Object.entries(p).filter(([k])=>!k.startsWith('status_')).map(([k,v])=>`<div class="swatch" style="--sw:${v}"><div class="sample"></div><b>${esc(k)}</b><code>${v}</code><small>${token(k)}</small></div>`).join('');
const sts=[['in_game','In game','▶'],['desktop','Desktop','▣'],['away','Away','◕'],['offline','Offline','○'],['hidden','Hidden','◌'],['looking','Looking for players','⌕']];
const tests=(p,mode)=>{
 const pairs=[['Primary on wall',p.text_primary,p.surface_wall,7],['Primary on card',p.text_primary,p.surface_card,7],['Secondary on card',p.text_secondary,p.surface_card,4.5],['Quiet on card',p.text_quiet,p.surface_card,4.5],['Accent on card',p.accent_main,p.surface_card,4.5],['Wall/Card surfaces',p.surface_wall,p.surface_card,1.3],['Card/Raised surfaces',p.surface_card,p.surface_raised,1.3]];
 return `<table><thead><tr><th>Pair</th><th>Contrast</th><th>Minimum</th></tr></thead><tbody>${pairs.map(([n,a,b,m])=>`<tr><td>${n}</td><td>${check(`${mode}/${n}`,a,b,m)}</td><td>${m}:1</td></tr>`).join('')}</tbody></table>`;
};
const states=(p,mode)=>`<table><thead><tr><th>Status</th><th>Token</th><th>Hex</th><th>Contrast on card</th></tr></thead><tbody>${sts.map(([k,label,i])=>{const hex=p['status_'+k];return `<tr><td><span class="status" style="color:${hex}"><b>${i}</b>${label}</span></td><td><code>${token('status_'+k)}</code></td><td>${hex}</td><td>${check(`${mode}/status ${label}`,hex,p.surface_card,4.5)}</td></tr>`}).join('')}</tbody></table>`;
const palette=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LAN OS · Design tokens</title><style>*{box-sizing:border-box}body{margin:0;background:#0A0F1A;color:#E9EFF8;font:15px/1.55 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:52px 30px 90px}h1{font-size:40px;letter-spacing:-.04em;margin:0 0 5px}h2{font-size:26px;margin:0 0 18px}h3{font-size:18px;margin:26px 0 12px}.muted{color:#B0BDD2}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:30px}.top a{color:#B9B3E6;text-decoration:none}section{background:#1E2A43;border:1px solid #354563;border-radius:22px;padding:26px;margin-bottom:24px}.swatches{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px}.swatch{border-radius:14px;background:#111c30;border:1px solid #394765;padding:9px;display:flex;flex-direction:column;gap:5px;overflow:hidden}.swatch .sample{background:var(--sw);height:105px;border-radius:9px;margin-bottom:6px}.swatch b{font-size:12px;overflow-wrap:anywhere}.swatch code,.swatch small{font-size:11px;color:#B0BDD2;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px 9px;border-bottom:1px solid #354563;text-align:left}th{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:#B0BDD2}td code{color:#B0BDD2}.pass{color:#70C49A;font-weight:700}.fail{color:#ff928a;font-weight:700}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}.status{display:inline-flex;align-items:center;gap:8px;font-weight:650}.status b{width:20px}.foot{color:#8996B0;padding-top:12px}@media(max-width:900px){.swatches{grid-template-columns:repeat(3,1fr)}.cols{grid-template-columns:1fr}}@media(max-width:540px){.swatches{grid-template-columns:repeat(2,1fr)}} </style></head><body><main><div class="top"><div><p class="muted">FOUNDATION / 01</p><h1>Colour & type system</h1><p class="muted">Source of truth: <code>config/theme.yaml</code>. Regenerate with <code>node design/build.mjs</code>.</p></div><a href="../index.html">← All screens</a></div><section><h2>Day palette</h2><div class="swatches">${swatches(day)}</div><div class="cols"><div><h3>Contrast checks</h3>${tests(day,'Day')}</div><div><h3>Semantic statuses</h3>${states(day,'Day')}</div></div></section><section><h2>Night palette</h2><div class="swatches">${swatches(night)}</div><div class="cols"><div><h3>Contrast checks</h3>${tests(night,'Night')}</div><div><h3>Semantic statuses</h3>${states(night,'Night')}</div></div></section><section><h2>Wall display sizing</h2><p class="muted">1920×1080 reference canvas, scaled to 2560×1440. Never render text below ${cfg.typography.size_minimum}px at 1080p.</p><table>${Object.entries(cfg.typography).filter(([k])=>k.startsWith('size_')).map(([k,v])=>`<tr><td>${k.slice(5).replaceAll('_',' ')}</td><td><strong>${v}px</strong></td></tr>`).join('')}</table><h3>Spacing</h3><p class="muted">Card radius ${cfg.spacing.radius_card}px · grouped players ${cfg.spacing.radius_group}px · frame ${cfg.spacing.space_frame}px · gaps ${cfg.spacing.space_gap}px</p></section><p class="foot">Contrast is calculated from the configured tokens. In the UI, status is always encoded by colour, icon and word.</p></main></body></html>`;
put('design/palette.html',palette);
for(const name of ['admin','player','wall'])put(`design/mockups/${name}.html`,`<!doctype html><html lang="en"><head><meta http-equiv="refresh" content="0;url=../../${name}.html"><title>${name}</title></head><body><a href="../../${name}.html">View ${name} prototype</a></body></html>`);
console.log(fails.length?`Contrast warnings:\n${fails.join('\n')}`:'All theme colour contrast checks pass.');
console.log('Built: index.html, admin.html, player.html, wall.html, assets/theme.css, single-file previews, design/palette.html');
