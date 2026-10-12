// Regenerates design/palette.html and design/mockups/*.html from config/theme.yaml.  Run:  node design/build.mjs
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.join(here,'..');
// ---- tiny YAML reader: groups, "key: value", comments ----
const cfg={}; let g=null;
for(const raw of fs.readFileSync(path.join(root,'config/theme.yaml'),'utf8').split(/\r?\n/)){
  const l=raw.replace(/^\s*#.*$/,''); if(!l.trim())continue;
  const m=l.match(/^(\s*)([a-z_0-9]+):\s*(.*)$/); if(!m)continue;
  if(!m[1].length){g=m[2];cfg[g]={};} else cfg[g][m[2]]=m[3].replace(/^"|"$/g,'');
}
const day={...cfg.surfaces,...cfg.text,...cfg.status,...cfg.accent}, night={...day,...cfg.night_mode}, ty=cfg.typography, sp=cfg.spacing;
// ---- colour maths ----
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)), lin=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
const gam=c=>255*(c<=.0031308?c*12.92:1.055*c**(1/2.4)-.055);
const lum=h=>{const[r,g,b]=rgb(h).map(lin);return .2126*r+.7152*g+.0722*b};
const cr=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return(x+.05)/(y+.05)};
const hex=a=>'#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('').toUpperCase();
const CVD={Deuteranopia:[[.367322,.860646,-.227968],[.280085,.672501,.047413],[-.01182,.04294,.968881]],Protanopia:[[.152286,1.052583,-.204868],[.114503,.786281,.099216],[-.003882,-.048116,1.051998]]};
const sim=(h,k)=>{const l=rgb(h).map(lin);return hex(CVD[k].map(r=>gam(Math.max(0,Math.min(1,r[0]*l[0]+r[1]*l[1]+r[2]*l[2]))))) };
const ink=h=>cr(h,'#FFFFFF')>cr(h,'#000000')?'#fff':'#000';
const ST=[['in_game','game','In game'],['desktop','desktop','Desktop'],['away','away','Away'],['offline','offline','Offline'],['hidden','hidden','Hidden'],['looking','looking','Looking for players']];
const IC={game:'<path d="M8 5v14l11-7z" fill="currentColor"/>',desktop:'<path d="M3 4h18v12H3zM8 20h8M12 16v4"/>',away:'<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',offline:'<path d="M12 3v8M6.3 6.5a8 8 0 1 0 11.4 0"/>',hidden:'<path d="M3 3l18 18M10.6 6.2A10 10 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.5 1-1.6 2.5-3.2 3.7M6.4 7.9C4.4 9.2 3 11.1 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9"/>',looking:'<path d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM16 16l5 5"/>'};
IC.join='<path d="M14 4h6v16h-6M10 8l4 4-4 4M14 12H4"/>';
const ic=(k,s=28)=>`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;
// ---- shared CSS variables ----
const vars=p=>`--surface-wall:${p.surface_wall};--surface-card:${p.surface_card};--surface-raised:${p.surface_raised};--text-primary:${p.text_primary};--text-secondary:${p.text_secondary};--text-quiet:${p.text_quiet};--accent:${p.accent_main};`+ST.map(s=>`--status-${s[0].replace('_','-')}:${p['status_'+s[0]]};`).join('')
 +`--font-family:${ty.font_family};--fs-clock:${ty.size_clock}px;--fs-duration:${ty.size_duration}px;--fs-headline:${ty.size_headline}px;--fs-name:${ty.size_name}px;--fs-body:${ty.size_body}px;--fs-secondary:${ty.size_secondary}px;--fs-minimum:${ty.size_minimum}px;--fw-bold:${ty.weight_bold};--space-frame:${sp.space_frame}px;--space-gap:${sp.space_gap}px;--space-list:${sp.space_list}px;--space-panel:${sp.space_panel}px;--radius-card:${sp.radius_card}px;--radius-group:${sp.radius_group}px;--radius-pill:${sp.radius_pill}px;`;
// ---- wall ----
const PL=[['Mara','in_game','Deep Rock Galactic','2h 14m',0,1],['Joris','in_game','Deep Rock Galactic','2h 09m',0,1],['Sam','in_game','Valheim','6h 40m'],['Nick','in_game','Valheim','3m','looking'],['Alex','away','Rocket League','1h 52m'],['Lisa','desktop','','12m'],['Tom','offline','Last: Counter-Strike 2','3h ago']];
const lbl=Object.fromEntries(ST.map(s=>[s[0],s[2]])), icn=Object.fromEntries(ST.map(s=>[s[0],s[1]]));
const Q=[['Mr. Brightside','The Killers','Mara'],['Africa','Toto','Alex'],['Blinding Lights','The Weeknd','Sam'],['Take Five','Dave Brubeck','Lisa']];
const row=([n,s,gm,du,extra,jn])=>`<div class="row${s==='offline'?' off':''}"><div class="av"></div><div class="tx"><div class="nm">${n}${jn?`<span class="join">${ic('join',22)}Join game</span>`:''}${extra?`<span class="chip" style="color:var(--status-looking)">${ic('looking',22)}Looking for players</span>`:''}</div><div class="sl" style="color:var(--status-${s.replace('_','-')})">${ic(icn[s],26)}<b>${lbl[s]}</b>${gm?`<span class="gn">${gm}</span>`:''}</div></div>${gm&&s!=='offline'?'<i class="cv"></i>':'<i></i>'}<div class="du">${du}</div></div>`;
const wallCss=`*{box-sizing:border-box}html,body{margin:0}body{background:#05070c;font-family:var(--font-family);color:var(--text-primary)}
.bar-top{position:sticky;top:0;z-index:5;display:flex;gap:8px;align-items:center;padding:10px 16px;background:#161b22;color:#cfd8e3;font:14px system-ui,sans-serif}
.bar-top button{font:inherit;color:inherit;background:#232b36;border:1px solid #39434f;border-radius:8px;padding:6px 12px;cursor:pointer}.bar-top button[aria-pressed=true]{background:#d5dbe3;color:#111}
#stage{overflow:auto}#holder{transform-origin:0 0}
.frame{width:1920px;height:1080px;background:var(--surface-wall);color:var(--text-primary);display:grid;grid-template-columns:760px 1fr;gap:var(--space-gap);padding:var(--space-frame);font-size:var(--fs-body);line-height:1.2;font-variant-numeric:tabular-nums;overflow:hidden}
.frame{column-gap:32px}.list{display:flex;flex-direction:column;gap:var(--space-list);min-height:0}.single{flex:1;display:flex}.grp{flex:2;display:grid;grid-template-rows:1fr 1fr;gap:6px;background:var(--surface-raised);border-radius:var(--radius-group);padding:8px}
.row{flex:1;background:var(--surface-card);border-radius:var(--radius-card);display:grid;grid-template-columns:72px 1fr 56px 180px;gap:18px;align-items:center;padding:0 22px 0 16px;min-width:0}
.single .row{border-radius:var(--radius-card)}.grp .row{border-radius:calc(var(--radius-group) - 8px)}
.av{width:72px;height:72px;border-radius:16px;background:var(--surface-raised)}
.nm{font-size:var(--fs-name);font-weight:var(--fw-bold);display:flex;align-items:center;gap:14px;white-space:nowrap}.chip{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-minimum);font-weight:600;background:var(--surface-wall);padding:2px 12px 2px 8px;border-radius:var(--radius-pill)}
.sl{display:flex;align-items:center;gap:8px;font-size:var(--fs-secondary);white-space:nowrap;overflow:hidden;margin-top:2px}.sl b{font-weight:600}.gn{color:var(--text-secondary);margin-left:6px;overflow:hidden;text-overflow:ellipsis}
.cv{width:56px;height:56px;border-radius:12px;background:var(--surface-raised)}.du{font-size:var(--fs-duration);font-weight:var(--fw-bold);text-align:right;white-space:nowrap}
.off .nm,.off .du{color:var(--text-secondary)}.off .du{font-size:var(--fs-name);font-weight:500}
.side{display:flex;flex-direction:column;gap:var(--space-gap);min-height:0}.panel{background:var(--surface-card);border-radius:var(--radius-card);padding:var(--space-panel)}
.lab{font-size:var(--fs-secondary);color:var(--text-secondary)}.hd{font-size:var(--fs-headline);font-weight:var(--fw-bold);line-height:1.1}
.mus{flex:0 0 380px;display:grid;grid-template-columns:580px 1fr;gap:40px}.nowp{display:flex;flex-direction:column;justify-content:center}.nrow{display:flex;gap:24px;align-items:center;margin-bottom:22px}.art{width:168px;height:168px;flex:none;border-radius:16px;background:var(--surface-raised)}.ar{font-size:34px;color:var(--text-secondary);margin-top:6px}
.qh{display:flex;justify-content:space-between;margin-bottom:2px}.qi{display:grid;grid-template-columns:34px 1fr;margin-top:12px}.qi .n{color:var(--text-quiet);font-size:var(--fs-secondary);padding-top:2px}.qt{font-size:var(--fs-body);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.qs{font-size:var(--fs-secondary);color:var(--text-secondary);white-space:nowrap}
.join{display:inline-flex;align-items:center;gap:8px;font-size:var(--fs-secondary);font-weight:var(--fw-bold);background:var(--accent);color:var(--surface-wall);padding:3px 16px 3px 12px;border-radius:var(--radius-pill)}
.track{height:20px;border-radius:var(--radius-pill);background:var(--surface-raised);overflow:hidden}.track b{display:block;height:100%;background:var(--accent);border-radius:var(--radius-pill)}
.nowp .tm{display:flex;justify-content:space-between;font-size:var(--fs-secondary);color:var(--text-secondary);margin-top:10px}.nowp .rq{margin-top:14px;font-size:var(--fs-body)}
.vt{flex:1;display:flex;flex-direction:column;min-height:0}.vh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}.vh b{font-size:38px}
.vo{flex:1;display:flex;flex-direction:column;justify-content:center}.vl{display:flex;justify-content:space-between;font-size:var(--fs-body);margin-bottom:6px}.vl b{font-size:var(--fs-name)}.vo.t .track b{background:var(--text-quiet)}
.bot{flex:0 0 224px;display:flex;gap:var(--space-gap)}.act{flex:1;display:flex;flex-direction:column;justify-content:center;gap:8px}.act .hd{font-size:50px}.act .in{font-size:var(--fs-body);color:var(--text-secondary)}
.ck{flex:0 0 470px;display:flex;flex-direction:column;justify-content:center;gap:12px}.ck .top{display:flex;justify-content:space-between;align-items:center}.ck .tmx{font-size:var(--fs-clock);font-weight:var(--fw-bold);line-height:1}.ck .dd{text-align:right;font-size:var(--fs-secondary);line-height:1.25}
.dots{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:var(--fs-minimum);color:var(--text-secondary)}.dt{display:flex;align-items:center;gap:7px}.dt i{width:14px;height:14px;border-radius:50%;background:var(--status-in-game)}.dt.q{color:var(--text-quiet)}`;
const wall=(mode)=>{const p=mode==='night'?night:day;
 const list=`<div class="list"><div class="grp">${row(PL[0])}${row(PL[1])}</div><div class="grp">${row(PL[2])}${row(PL[3])}</div>${PL.slice(4).map(x=>`<div class="single">${row(x)}</div>`).join('')}</div>`;
 const side=`<div class="side"><div class="panel mus"><div class="nowp"><div class="nrow"><div class="art"></div><div><div class="lab">Now playing</div><div class="hd">Take On Me</div><div class="ar">a-ha</div></div></div><div class="track"><b style="width:58%"></b></div><div class="tm"><span>2:14</span><span>3:41</span></div><div class="rq">Requested by Nick</div></div>
 <div class="queue"><div class="qh"><span class="lab">Up next</span><span class="lab">${Q.length} in queue</span></div>${Q.map((q,i)=>`<div class="qi"><span class="n">${i+1}</span><div><div class="qt">${q[0]}</div><div class="qs">${q[1]} · ${q[2]}</div></div></div>`).join('')}</div></div>
 <div class="panel vt"><div class="vh"><b>Next break?</b><span class="lab">6 of 7 voted</span></div>
 <div class="vo"><div class="vl"><span>Pizza</span><b>3</b></div><div class="track"><b style="width:100%"></b></div></div>
 <div class="vo t"><div class="vl"><span>Walk outside</span><b>2</b></div><div class="track"><b style="width:66%"></b></div></div>
 <div class="vo t"><div class="vl"><span>Keep playing</span><b>1</b></div><div class="track"><b style="width:33%"></b></div></div></div>
 <div class="bot"><div class="panel act"><div class="lab">Next activity</div><div class="hd">Pizza break</div><div class="in">in 18 min · 5 joined</div></div>
 <div class="panel ck"><div class="top"><div class="tmx">02:47</div><div class="dd">Day 2<br>41h left</div></div><div class="dots"><span class="dt"><i></i>Steam</span><span class="dt"><i></i>Spotify</span><span class="dt"><i></i>Server</span><span class="dt q">Up 31h 12m</span></div></div></div></div>`;
 return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>LAN OS wall${mode==='night'?' (night)':''}</title><style>:root{${vars(p)}}${wallCss}</style></head><body>
<div class="bar-top"><span>Wall preview</span><button data-s="1" aria-pressed="true">1920×1080</button><button data-s="1.3333" aria-pressed="false">2560×1440</button><button data-s="fit" aria-pressed="false">Fit window</button></div>
<div id="stage"><div id="holder"><div class="frame">${list}${side}</div></div></div>
<script>var h=document.getElementById('holder'),st=document.getElementById('stage'),bs=document.querySelectorAll('.bar-top button');
function go(v){var k=v==='fit'?Math.min(innerWidth/1920,(innerHeight-52)/1080):+v;h.style.transform='scale('+k+')';st.style.width=1920*k+'px';st.style.height=1080*k+'px';st.style.overflow='hidden';bs.forEach(function(b){b.setAttribute('aria-pressed',b.dataset.s===v)})}
bs.forEach(function(b){b.onclick=function(){go(b.dataset.s)}});addEventListener('resize',function(){if(document.querySelector('[data-s=fit]').getAttribute('aria-pressed')==='true')go('fit')});go('1');</script></body></html>`};
fs.mkdirSync(path.join(here,'mockups'),{recursive:true});
fs.writeFileSync(path.join(here,'mockups/wall.html'),wall('day'));
// ---- palette page ----
let fails=[];const need=(lab,a,b,min)=>{const r=cr(a,b);if(r<min)fails.push(lab+' '+r.toFixed(2)+' < '+min);return `<td class="${r>=min?'ok':'bad'}">${r.toFixed(1)}:1 <small>(min ${min})</small></td>`};
const sw=(k,h,use,css)=>`<div class="sw" style="background:${h};color:${ink(h)}"><b>${k}</b><span>${h}</span><span>${css}</span></div>`;
const css=k=>'--'+k.replace(/^(surface|text|status)_/,'$1-').replace(/_/g,'-').replace('accent-main','accent');
const tr=(pp)=>{const c=pp.surface_card,w=pp.surface_wall;return `<table><tr><th>Pair</th><th>Ratio</th></tr>
<tr><td>Primary text on wall</td>${need('primary/wall',pp.text_primary,w,7)}</tr><tr><td>Primary text on card</td>${need('primary/card',pp.text_primary,c,7)}</tr>
<tr><td>Secondary text on card</td>${need('secondary/card',pp.text_secondary,c,4.5)}</tr><tr><td>Quiet text on card</td>${need('quiet/card',pp.text_quiet,c,4.5)}</tr><tr><td>Accent on card</td>${need('accent/card',pp.accent_main,c,4.5)}</tr>
<tr><td>Text on Join game button</td>${need('join button',pp.surface_wall,pp.accent_main,7)}</tr><tr><td>Wall to card step</td>${need('wall/card step',w,c,1.3)}</tr><tr><td>Card to raised step</td>${need('card/raised step',c,pp.surface_raised,1.3)}</tr></table>`};
const stt=(pp)=>`<table><tr><th>State</th><th>Hex</th><th>Token</th><th>vs card</th><th>Deutan</th><th>Protan</th></tr>${ST.map(([k,i,l])=>{const h=pp['status_'+k];return `<tr><td><span class="chip" style="color:${h}">${ic(i,22)}${l}</span></td><td>${h}</td><td>${css('status_'+k)}</td>${need(l,h,pp.surface_card,4.5)}<td><i class="dot" style="background:${sim(h,'Deuteranopia')}"></i></td><td><i class="dot" style="background:${sim(h,'Protanopia')}"></i></td></tr>`}).join('')}</table>`;
const swg=pp=>Object.keys(day).filter(k=>!k.startsWith('status')).map(k=>sw(k,pp[k],'',css(k))).join('');
const tsc=[['size_clock','Clock','02:47'],['size_headline','Headline','Take On Me'],['size_duration','Duration','2h 14m'],['size_name','Player name','Mara'],['size_body','Body','Deep Rock Galactic'],['size_secondary','Secondary','In game'],['size_minimum','Minimum','Up 31h 12m']];
const pal=`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>LAN OS palette</title><style>*{box-sizing:border-box}body{margin:0;background:#e8eaec;color:#1b2127;font:16px/1.5 "Segoe UI Variable","Segoe UI",system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:40px 24px 64px}h1{font-size:30px;margin:0 0 6px}h2{font-size:22px;margin:0 0 12px}section{background:#fff;border-radius:14px;padding:24px;margin:0 0 24px}p{color:#4d5862;max-width:70ch}
.sws{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:16px}.sw{border-radius:8px;padding:10px;font-size:13px;line-height:1.35;min-height:84px;display:flex;flex-direction:column}table{border-collapse:collapse;width:100%;font-size:14px;margin-bottom:12px}th{text-align:left;color:#4d5862;padding:4px 6px}td{padding:6px;border-top:1px solid #e1e4e7}td.ok{color:#1b6e3e}td.bad{color:#b3261e;font-weight:700}small{color:#6b7782}
.chip{display:inline-flex;gap:6px;align-items:center;background:#161b22;padding:3px 10px;border-radius:99px;font-weight:600}.dot{display:inline-block;width:22px;height:22px;border-radius:50%}.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:900px){.two{grid-template-columns:1fr}}
.type div{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-top:1px solid #e1e4e7;gap:16px}.type code{color:#4d5862;font-size:13px;white-space:nowrap}.sp{display:flex;gap:16px;flex-wrap:wrap}.sp span{background:#eef0f2;padding:6px 12px;border-radius:8px}</style></head><body><main>
<h1>LAN OS palette: deep blue-grey</h1><p>Generated from <code>config/theme.yaml</code>. Edit the file, run <code>node design/build.mjs</code>, and this page and every mockup update. Failing ratios turn red.</p>
<section><h2>Day (default)</h2><div class="sws">${swg(day)}</div><div class="two"><div>${tr(day)}</div><div><p>Wall text sizes at 1080p: nothing below ${ty.size_minimum}px, body ${ty.size_body}px, key numbers ${ty.size_duration}–${ty.size_clock}px.</p></div></div></section>
<section><h2>Player states: colour, icon and word together</h2>${stt(day)}<p>Deutan and Protan columns show how each colour looks with those types of colour blindness. States stay apart by brightness, and the icon and word always appear with the colour.</p></section>
<section><h2>Night mode (dimmer, warmer, same theme)</h2><div class="sws">${swg(night)}</div><div class="two"><div>${tr(night)}</div><div></div></div>${stt(night)}</section>
<section><h2>Type</h2><p>${ty.font_family}. Tabular numbers on all durations and the clock. At 1440p everything scales by 1.33.</p><div class="type">${tsc.map(([k,l,s])=>`<div><span style="font-size:${Math.min(ty[k],56)}px;font-weight:${k.match(/clock|headline|duration|name/)?700:400}">${s}</span><code>${l} · ${ty[k]}px</code></div>`).join('')}</div></section>
<section><h2>Spacing and shape</h2><div class="sp"><span>frame margin ${sp.space_frame}px</span><span>panel gap ${sp.space_gap}px</span><span>row gap ${sp.space_list}px</span><span>panel padding ${sp.space_panel}px</span><span>card radius ${sp.radius_card}px</span><span>group radius ${sp.radius_group}px</span></div></section></main></body></html>`;
fs.writeFileSync(path.join(here,'palette.html'),pal);
console.log(fails.length?'CONTRAST FAILURES:\n'+fails.join('\n'):'All contrast checks pass.');
