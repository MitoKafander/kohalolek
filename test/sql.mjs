// SQL-loogika test otse andmebaasi vastu (ilma brauserita).
import { startShim } from './shim.mjs';
import crypto from 'node:crypto';
const P = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const { db, server, base } = await startShim({ siteDir: P + '/site', migration: P + '/supabase/migrations/20261126000000_init.sql', port: 8792 });
const rpc = async (fn, args) => { const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }); const j = await r.json(); if (!r.ok) throw new Error(fn + ' ' + JSON.stringify(j)); return j; };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const AUTH = 'a'.repeat(64), C = { p_code: 'test', p_auth: AUTH };

await db.query(`insert into kohalolek.invite(code_hash, uses_left) values ($1, 1)`, [sha('kutse1')]);
ok((await rpc('koh_ws_create', { p_code: 'test', p_auth: AUTH, p_invite: 'vale' })).err === 'invite', 'bad invite rejected');
ok((await rpc('koh_ws_create', { p_code: 'Te', p_auth: AUTH, p_invite: 'kutse1' })).err === 'code', 'short code rejected');
ok((await rpc('koh_ws_create', { p_code: 'test', p_auth: AUTH, p_invite: 'kutse1' })).ok === true, 'workspace created');
ok((await rpc('koh_ws_create', { p_code: 'teine', p_auth: AUTH, p_invite: 'kutse1' })).err === 'invite', 'invite single use');
ok((await rpc('koh_ws_login', { p_code: 'test', p_auth: 'b'.repeat(64) })).ok === false, 'wrong auth rejected');
ok((await rpc('koh_ws_login', C)).groups.length === 0, 'login ok, no groups');

const gs = await rpc('koh_group_save', { ...C, p_id: null, p_label: 'G1', p_roster_enc: 'r', p_list_enc: 'l', p_slots: ['aaaa', 'bbbb', 'cccc'] });
ok(gs.ok && gs.id, 'group saved');
ok((await rpc('koh_group_save', { p_code: 'test', p_auth: 'b'.repeat(64), p_id: gs.id, p_label: 'X', p_roster_enc: 'r', p_list_enc: 'l', p_slots: [] })).err === 'auth', 'group save needs auth');
const ss = await rpc('koh_session_start', { ...C, p_group: gs.id, p_start_at: new Date().toISOString(), p_ontime: 5, p_teacher: 'T' });
ok(ss.ok, 'session started');
let st = await rpc('koh_session_state', { ...C, p_session: ss.id });
const seed = st.session.seed;
const tok = (round, dw = 0) => sha(`${seed}:${round}:${Math.floor(st.now / 10000) + dw}`).slice(0, 8);
const D1 = 'device-0000-0000-0001', D2 = 'device-0000-0000-0002', D3 = 'device-0000-0000-0003';

ok((await rpc('koh_checkin', { p_session: ss.id, p_token: 'deadbeef', p_device: D1 })).status === 'expired', 'bad token → expired');
ok((await rpc('koh_checkin', { p_session: ss.id, p_token: tok(1, -5), p_device: D1 })).status === 'expired', 'old token → expired');
ok((await rpc('koh_checkin', { p_session: 'nope', p_token: tok(1), p_device: D1 })).status === 'unknown', 'unknown session');
ok((await rpc('koh_checkin', { p_session: ss.id, p_token: tok(1), p_device: 'x' })).status === 'error', 'bad device id');
ok((await rpc('koh_bind', { p_session: ss.id, p_device: D1, p_slot: 'aaaa' })).status === 'expired', 'bind without scan rejected');
let r = await rpc('koh_checkin', { p_session: ss.id, p_token: tok(1), p_device: D1 });
ok(r.status === 'bind' && r.list_enc === 'l' && r.taken.length === 0, 'first scan → bind');
ok((await rpc('koh_bind', { p_session: ss.id, p_device: D1, p_slot: 'zzzz' })).status === 'error', 'bind to unknown slot rejected');
r = await rpc('koh_bind', { p_session: ss.id, p_device: D1, p_slot: 'aaaa' });
ok(r.status === 'ok' && r.slot === 'aaaa', 'bind ok');
r = await rpc('koh_checkin', { p_session: ss.id, p_token: tok(1, -1), p_device: D1 });
ok(r.status === 'ok' && r.slot === 'aaaa', 'second scan (previous window) → ok');
// second device tries the same name → pending claim
r = await rpc('koh_checkin', { p_session: ss.id, p_token: tok(1), p_device: D2 });
ok(r.status === 'bind' && r.taken.includes('aaaa'), 'second device sees taken slot');
ok((await rpc('koh_bind', { p_session: ss.id, p_device: D2, p_slot: 'aaaa' })).status === 'pending', 'taken slot → pending');
ok((await rpc('koh_status', { p_session: ss.id, p_device: D2 })).status === 'pending', 'status pending');
st = await rpc('koh_session_state', { ...C, p_session: ss.id });
ok(st.claims.length === 1 && st.checkins.length === 1 && st.checkins[0].fresh === true && st.picking === 0, 'state shows claim + 1 fresh checkin');
await rpc('koh_claim_resolve', { ...C, p_session: ss.id, p_device: st.claims[0].device, p_approve: false });
ok((await rpc('koh_status', { p_session: ss.id, p_device: D2 })).status === 'denied', 'claim denied');
// D2 picks another name instead
ok((await rpc('koh_bind', { p_session: ss.id, p_device: D2, p_slot: 'bbbb' })).status === 'ok', 'D2 binds bbbb');
// D3 = new phone for aaaa, approved
await rpc('koh_checkin', { p_session: ss.id, p_token: tok(1), p_device: D3 });
ok((await rpc('koh_bind', { p_session: ss.id, p_device: D3, p_slot: 'aaaa' })).status === 'pending', 'D3 claims aaaa');
st = await rpc('koh_session_state', { ...C, p_session: ss.id });
await rpc('koh_claim_resolve', { ...C, p_session: ss.id, p_device: st.claims[0].device, p_approve: true });
ok((await rpc('koh_status', { p_session: ss.id, p_device: D3 })).status === 'ok', 'D3 approved → ok');
ok((await rpc('koh_checkin', { p_session: ss.id, p_token: tok(1), p_device: D1 })).status === 'bind', 'old phone D1 is unbound now');
// marks
await rpc('koh_mark', { ...C, p_session: ss.id, p_slot: 'cccc', p_status: 'H' });
ok((await rpc('koh_mark', { ...C, p_session: ss.id, p_slot: 'cccc', p_status: 'Q' })).err === 'status', 'bad mark rejected');
st = await rpc('koh_session_state', { ...C, p_session: ss.id });
ok(st.marks.cccc === 'H' && st.bound.length === 2, 'mark stored, 2 bound');
await rpc('koh_mark', { ...C, p_session: ss.id, p_slot: 'cccc', p_status: null });
// round 2
ok((await rpc('koh_session_round', { ...C, p_session: ss.id })).round === 2, 'round 2');
ok((await rpc('koh_checkin', { p_session: ss.id, p_token: tok(1), p_device: D2 })).status === 'expired', 'round 1 token invalid in round 2');
r = await rpc('koh_checkin', { p_session: ss.id, p_token: tok(2), p_device: D2 });
ok(r.status === 'ok' && r.round === 2, 'round 2 checkin');
st = await rpc('koh_session_state', { ...C, p_session: ss.id });
ok(st.session.round === 2 && st.session.rounds.length === 2 && st.checkins.filter(c => c.r === 2).length === 1 && Object.keys(st.marks).length === 0, 'state after round 2');
// unbind, update, end
await rpc('koh_unbind', { ...C, p_group: gs.id, p_slot: 'bbbb' });
ok((await rpc('koh_checkin', { p_session: ss.id, p_token: tok(2), p_device: D2 })).status === 'bind', 'unbound device must bind again');
await rpc('koh_session_update', { ...C, p_session: ss.id, p_start_at: null, p_ontime: 99 });
ok((await rpc('koh_session_state', { ...C, p_session: ss.id })).session.ontime_min === 60, 'ontime clamped');
// other workspace cannot read
await db.query(`insert into kohalolek.invite(code_hash, uses_left) values ($1, 1)`, [sha('kutse2')]);
await rpc('koh_ws_create', { p_code: 'muu', p_auth: 'c'.repeat(64), p_invite: 'kutse2' });
const O = { p_code: 'muu', p_auth: 'c'.repeat(64) };
ok((await rpc('koh_session_state', { ...O, p_session: ss.id })).err === 'notfound', 'other workspace cannot read session');
ok((await rpc('koh_mark', { ...O, p_session: ss.id, p_slot: 'aaaa', p_status: 'P' })).err === 'notfound', 'other workspace cannot mark');
ok((await rpc('koh_sessions', { ...O, p_group: gs.id })).sessions.length === 0, 'other workspace sees no sessions');
await rpc('koh_group_save', { ...O, p_id: gs.id, p_label: 'hack', p_roster_enc: 'x', p_list_enc: 'x', p_slots: [] });
ok((await rpc('koh_ws_login', C)).groups[0].label === 'G1', 'other workspace cannot overwrite group');
await rpc('koh_session_end', { ...C, p_session: ss.id, p_end: true });
ok((await rpc('koh_checkin', { p_session: ss.id, p_token: tok(2), p_device: D3 })).status === 'ended', 'ended session rejects');
ok((await rpc('koh_sessions', { ...C, p_group: gs.id })).sessions.length === 1, 'history lists session');
// slot removal drops binding
await rpc('koh_group_save', { ...C, p_id: gs.id, p_label: 'G1', p_roster_enc: 'r', p_list_enc: 'l', p_slots: ['bbbb', 'cccc'] });
ok((await rpc('koh_ws_login', C)).groups[0].bound.length === 0, 'removed slot → binding gone');
// no table leaks: device ids stored hashed
const raw = (await db.query(`select device from kohalolek.arrival limit 1`)).rows[0].device;
ok(/^[0-9a-f]{64}$/.test(raw), 'device stored as hash');
// privileges: anon cannot touch tables, can execute rpc
const priv = (await db.query(`select has_schema_privilege('anon','kohalolek','usage') as s, has_table_privilege('anon','kohalolek.session','select') as t, has_function_privilege('anon','public.koh_checkin(text,text,text)','execute') as f, has_function_privilege('anon','kohalolek.ws(text,text)','execute') as h`)).rows[0];
ok(priv.s === false && priv.t === false && priv.f === true && priv.h === false, 'anon privileges: ' + JSON.stringify(priv));
console.log(`SQL tests: ${pass} passed, ${fail} failed`);
server.close(); await db.close(); process.exit(fail ? 1 : 0);
