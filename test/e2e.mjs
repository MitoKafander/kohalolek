// Läbiv test päris brauseris: õpetaja leht + mitu "telefoni" (eraldi brauserikontekstid).
import { startShim } from './shim.mjs';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';
const P = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, ''), SHOTS = P + '/test/shots';
import fs from 'node:fs'; fs.mkdirSync(SHOTS, { recursive: true });
const { db, server, base } = await startShim({ siteDir: P + '/site', migration: P + '/supabase/migrations/20261126000000_init.sql', port: 8793 });
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
await db.query(`insert into kohalolek.invite(code_hash, uses_left) values ($1, 1)`, [sha('kutse-test')]);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page, tag) => { page.on('pageerror', e => errors.push(tag + ': ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(tag + ' console: ' + m.text()); }); };

// --- õpetaja: tööruum, rühm, tund ---
const tctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
const T = await tctx.newPage(); watch(T, 'teacher');
await T.goto(base + '/opetaja/');
await T.click('button[data-tab=create]');
await T.fill('#lCode', 'Õpetaja Proov'); await T.fill('#lPw', 'salajane-parool-1'); await T.fill('#lPw2', 'teine-parool-12'); await T.fill('#lInv', 'kutse-test'); await T.fill('#lTeacher', 'Proovija');
await T.click('button[type=submit]');
await T.waitForSelector('#lMsg .banner.crit');
ok(await T.inputValue('#lInv') === 'kutse-test' && await T.inputValue('#lPw') === 'salajane-parool-1' && await T.inputValue('#lTeacher') === 'Proovija', 'validation error keeps the other fields');
ok(await T.inputValue('#lCode') === 'opetaja-proov', 'name with space, capitals and õ is normalised: ' + await T.inputValue('#lCode'));
await T.fill('#lPw2', 'salajane-parool-1');
await T.click('button[type=submit]');
await T.waitForSelector('button[data-act=new-group]', { timeout: 20000 });
ok(true, 'workspace created + logged in');
await T.click('button[data-act=new-group]');
// kleebi Tahvli nimekiri (JSON) → täidab nime ja õpilased
await T.evaluate(() => { const ta = document.getElementById('gNames'); const dt = new DataTransfer(); dt.setData('text', JSON.stringify({ v: 1, kind: 'nimekiri', group: 'NÄIDIS-26', students: [{ name: 'Näidis Aleksander', tid: 101 }, { name: 'Näidis Brita', tid: 102 }, { name: 'Näidis Carl', tid: 103 }, { name: 'Näidis Diana', tid: 104 }] })); ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
ok(await T.inputValue('#gLabel') === 'NÄIDIS-26', 'paste filled label');
ok((await T.inputValue('#gNames')).split('\n').length === 4, 'paste filled 4 names');
await T.click('button[data-act=save-group]');
await T.waitForSelector('button[data-act=start]');
ok((await T.textContent('.card .small')).includes('4 õpilast'), 'group card shows 4 students');
await T.screenshot({ path: SHOTS + '/1-home.png' });
await T.click('button[data-act=start]');
await T.waitForFunction(() => window.__kohUrl && document.querySelector('#qr svg'));
const url = () => T.evaluate(() => window.__kohUrl);
ok((await url()).startsWith(base + '/#'), 'QR url points at student page: ' + (await url()).length + ' chars');
ok((await T.textContent('#count')).trim() === 'Kohal 0 / 4', 'count 0/4');

// --- õpilased ---
const phone = async tag => { const c = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); const p = await c.newPage(); watch(p, tag); return p; };
const S1 = await phone('s1'), S2 = await phone('s2'), S3 = await phone('s3');
await S1.goto(await url());
await S1.waitForSelector('button[data-slot]');
ok(await S1.locator('button[data-slot]').count() === 4, 's1 sees 4 names');
await S1.screenshot({ path: SHOTS + '/2-student-pick.png' });
await S1.click('button[data-slot]:has-text("Näidis Brita")');
await S1.click('#yes');
await S1.waitForSelector('.card.ok');
ok((await S1.textContent('.card.ok')).includes('Näidis Brita'), 's1 bound + checked in as Brita');
ok(!(await S1.evaluate(() => location.hash)), 's1 hash cleared from address bar');
await S1.screenshot({ path: SHOTS + '/3-student-ok.png' });
// teine skaneerimine samast telefonist → kohe kohal
await S1.goto('about:blank'); await S1.goto(await url());
await S1.waitForSelector('.card.ok');
ok((await S1.textContent('.card.ok')).includes('Näidis Brita'), 's1 rescan → ok without picking');
// s2 valib teise nime; hõivatud nimi on peidus
await S2.goto(await url()); await S2.waitForSelector('button[data-slot]');
ok(await S2.locator('.list > button[data-slot]:visible').count() === 3, 's2 sees 3 free names');
await S2.click('button[data-slot]:has-text("Näidis Carl")'); await S2.click('#yes'); await S2.waitForSelector('.card.ok');
// s3 = Brita uus telefon → ootel → õpetaja lubab
await S3.goto(await url()); await S3.waitForSelector('button[data-slot]');
await S3.click('summary'); await S3.click('button.taken:has-text("Näidis Brita")'); await S3.click('#yes');
await S3.waitForSelector('.card.wait');
ok(true, 's3 pending on taken name');
await T.waitForSelector('button[data-act=claim][data-ok="1"]', { timeout: 8000 });
await T.screenshot({ path: SHOTS + '/4-teacher-live.png' });
await T.click('button[data-act=claim][data-ok="1"]');
await S3.waitForSelector('.card.ok', { timeout: 10000 });
ok((await S3.textContent('.card.ok')).includes('Näidis Brita'), 's3 approved as Brita');
// aegunud kood
const bad = (await url()).replace(/#([^.]+)\.[^.]+\./, '#$1.00000000.');
const S4 = await phone('s4'); await S4.goto(bad); await S4.waitForSelector('.card.bad');
ok((await S4.textContent('.card.bad')).includes('aegus'), 'wrong token → expired message');
await S4.screenshot({ path: SHOTS + '/5-student-expired.png' });

// --- õpetaja: nimekiri, käsitsi parandus, uus kontroll, lõpp, eksport ---
await T.waitForFunction(() => document.getElementById('count').textContent.trim() === 'Kohal 2 / 4', null, { timeout: 8000 });
ok(true, 'teacher count 2/4');
const chip = name => T.locator(`button.st:has-text("${name}") .chip`).textContent();
ok(await chip('Näidis Brita') === 'K' && await chip('Näidis Carl') === 'K' && await chip('Näidis Diana') === '·', 'chips K/K/waiting');
await T.click('button.st:has-text("Näidis Diana")');
await T.click('button[data-act=mark][data-st="H"]');
await T.waitForFunction(() => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes('Näidis Diana')).querySelector('.chip').textContent === 'H');
ok(true, 'manual mark H for Diana');
// tunni algus 20 min varasemaks → Brita ja Carl muutuvad P-ks (saabus +20), Aleksander P
const early = await T.evaluate(() => { const d = new Date(Date.now() - 20 * 60000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });
await T.fill('#startAt', early); await T.dispatchEvent('#startAt', 'change');
await T.waitForFunction(() => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes('Näidis Carl')).querySelector('.chip').textContent === 'P', null, { timeout: 8000 });
ok(await chip('Näidis Aleksander') === 'P' && await chip('Näidis Diana') === 'H', 'start moved 20 min back → late arrivals P, no-show P, manual H kept');
// 8 min tagasi → H
const mid = await T.evaluate(() => { const d = new Date(Date.now() - 8 * 60000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });
await T.fill('#startAt', mid); await T.dispatchEvent('#startAt', 'change');
await T.waitForFunction(() => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes('Näidis Carl')).querySelector('.chip').textContent === 'H', null, { timeout: 8000 });
ok(await chip('Näidis Aleksander') === '·', 'start 8 min back → H for scanned, waiting for no-show');
await T.screenshot({ path: SHOTS + '/6-teacher-statuses.png' });
// uus kontroll: Carl skaneerib, Brita mitte
await T.click('button[data-act=round]'); await T.click('button[data-act=round]');
await T.waitForFunction(() => document.getElementById('roundLbl').textContent.includes('kontroll 2'));
await T.waitForFunction(u => window.__kohUrl !== u, await url().catch(() => ''), { timeout: 15000 }).catch(() => {});
await new Promise(r => setTimeout(r, 800));
await S2.goto('about:blank'); await S2.goto(await url()); await S2.waitForSelector('.card.ok');
ok((await S2.textContent('.card.ok')).includes('kontroll 2'), 's2 round 2 check-in');
// lõpeta tund
await T.click('button[data-act=end]'); await T.click('button[data-act=end]');
await T.waitForSelector('button[data-act=copy-tahvel]');
await T.waitForFunction(() => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes('Näidis Brita')).textContent.includes('puudus kontrollis 2'));
ok(true, 'ended: Brita flagged as missing in round 2');
await T.click('button[data-act=copy-tahvel]');
const exp = JSON.parse(await T.evaluate(() => navigator.clipboard.readText()));
const byName = Object.fromEntries(exp.students.map(s => [s.name, s]));
ok(exp.kind === 'kohalolek' && exp.group === 'NÄIDIS-26' && exp.students.length === 4, 'export header');
ok(byName['Näidis Aleksander'].status === 'P' && byName['Näidis Brita'].status === 'H' && byName['Näidis Carl'].status === 'H' && byName['Näidis Diana'].status === 'H', 'export statuses: ' + JSON.stringify(exp.students.map(s => s.status)));
ok(byName['Näidis Brita'].tid === 102 && byName['Näidis Brita'].missed.join() === '2' && byName['Näidis Carl'].missed.length === 0, 'export keeps Tahvel id + missed rounds');
await T.click('button[data-act="copy-text"]');
const txt = await T.evaluate(() => navigator.clipboard.readText());
ok(txt.includes('Puudus (1): Näidis Aleksander') && txt.includes('Hilines (3)'), 'text export: ' + txt.replace(/\n/g, ' | '));
await T.screenshot({ path: SHOTS + '/7-teacher-ended.png' });
// lõppenud tunni skaneerimine
await S1.goto('about:blank'); await S1.goto(bad); await S1.waitForSelector('.card.bad');
ok((await S1.textContent('.card.bad')).includes('lõpetatud'), 'ended session message');
// ajalugu + uuesti sisselogimine teises seadmes (võtmed tuletatakse paroolist)
await T.click('button[data-act=home]'); await T.waitForSelector('button[data-act=history]');
ok((await T.textContent('.card .small')).includes('2 telefoni seotud'), 'home shows 2 bound phones');
await T.click('button[data-act=history]'); await T.waitForSelector('button.st[data-act=resume]');
ok((await T.textContent('button.st[data-act=resume]')).includes('Proovija'), 'history lists the session with teacher name');
const t2 = await browser.newContext({ viewport: { width: 1100, height: 800 } }); const T2 = await t2.newPage(); watch(T2, 'teacher2');
await T2.goto(base + '/opetaja/'); await T2.fill('#lCode', 'Õpetaja  proov'); await T2.fill('#lPw', 'vale-parool-123'); await T2.click('button[type=submit]');
await T2.waitForSelector('.banner.crit'); ok(await T2.inputValue('#lCode') === 'opetaja-proov', 'wrong password rejected, name kept');
await T2.fill('#lPw', 'salajane-parool-1'); await T2.click('button[type=submit]');
await T2.waitForSelector('button[data-act=edit-group]', { timeout: 20000 });
await T2.click('button[data-act=edit-group]');
ok((await T2.inputValue('#gNames')).includes('Näidis Diana'), 'second device decrypts roster after login');
// server ei näe nimesid
const leak = (await db.query(`select roster_enc || list_enc as blob from kohalolek.grp`)).rows[0].blob;
ok(!/Näidis|Brita/.test(leak), 'no names in server blobs');
console.log(`E2E: ${pass} passed, ${fail} failed`);
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close(); server.close(); await db.close(); process.exit(fail || errors.length ? 1 : 0);
