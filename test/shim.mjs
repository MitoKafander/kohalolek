// Kohalik testserver: PGlite andmebaas + PostgREST-i moodi /rest/v1/rpc/<fn> + staatiline sait.
import { PGlite } from '@electric-sql/pglite';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export async function startShim({ siteDir, migration, port = 8791 }) {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated;');
  const dir = path.dirname(migration);
  for (const m of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(dir, m), 'utf8'));
  const sigs = {};
  const rows = (await db.query(`select p.proname, p.proargnames, p.proargtypes::regtype[]::text[] as types from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'koh_%'`)).rows;
  for (const r of rows) sigs[r.proname] = { names: r.proargnames || [], types: r.types || [] };
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop(), sig = sigs[fn];
      let body = ''; for await (const c of req) body += c;
      if (!sig) { res.writeHead(404); res.end('{}'); return; }
      try {
        const args = JSON.parse(body || '{}');
        const params = [], parts = [];
        sig.names.forEach((n, i) => { if (n in args) { params.push(Array.isArray(args[n]) ? args[n] : args[n]); parts.push(`${n} => $${params.length}::${sig.types[i]}`); } });
        if (parts.length !== sig.names.length) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'arg mismatch', want: sig.names, got: Object.keys(args) })); return; }
        const r = await db.transaction(async tx => { await tx.exec('set local role anon'); return tx.query(`select public.${fn}(${parts.join(', ')}) as r`, params); });
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r.rows[0].r));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: String(e) })); }
      return;
    }
    let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': mime['.js'] }); res.end(`window.KOH_CONFIG={url:'http://localhost:${port}',key:'test'};`); return; }
    const f = path.join(siteDir, p);
    if (!f.startsWith(siteDir) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return { db, server, base: `http://localhost:${port}` };
}
