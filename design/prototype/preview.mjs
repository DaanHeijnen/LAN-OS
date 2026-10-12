/* LAN OS no-dependency localhost preview server. `node preview.mjs` */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.yaml':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const port=Number(process.env.PORT||8765);
http.createServer((req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400).end();return;}
 const clean=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
 const absolute=path.resolve(root,'.'+clean);
 if(!absolute.startsWith(root+path.sep)){res.writeHead(403).end('Forbidden');return;}
 fs.stat(absolute,(err,stat)=>{
  if(err||!stat.isFile()){res.writeHead(404).end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(absolute)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(absolute).pipe(res);
 });
}).listen(port,'127.0.0.1',()=>console.log(`LAN OS preview: http://127.0.0.1:${port}/ (Ctrl+C to quit)`));
