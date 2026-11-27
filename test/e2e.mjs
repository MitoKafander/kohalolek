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
ok(await T.inputValue('#gCampus') === 'K', 'campus guessed from label');
ok((await T.inputValue('#gNames')).split('\n').length === 4, 'paste filled 4 names');
await T.click('button[data-act=save-group]');
await T.waitForSelector('button[data-act=start]');
ok((await T.textContent('.card .small')).includes('4 õpilast'), 'group card shows 4 students');
ok(await T.inputValue('#retDays') === '7', 'retention setting shown, default 7 days');
await T.selectOption('#retDays', '14'); await T.waitForSelector('.banner');
ok((await T.textContent('.banner')).includes('14 päeva') && await T.inputValue('#retDays') === '14', 'retention changed to 14 days');
await T.screenshot({ path: SHOTS + '/1-home.png' });
await T.click('button[data-act=start]');
await T.waitForFunction(() => window.__kohUrl && document.querySelector('#qr svg'));
const url = () => T.evaluate(() => window.__kohUrl);
ok((await url()).startsWith(base + '/#'), 'QR url points at student page: ' + (await url()).length + ' chars');
ok((await T.textContent('#count')).trim() === 'Kohal 0 / 4', 'count 0/4');
ok(!(await T.isVisible('#toast')), 'no empty toast on screen before anything is marked');
ok(await T.inputValue('#mN') === '3' && /^\d+$/.test(await T.inputValue('#mNr')) && (await T.textContent('#ttNote')).includes('Proovitund'), 'lesson count and start lesson prefilled from the timetable: n=' + await T.inputValue('#mN') + ' ' + (await T.textContent('#ttNote')).trim());
await T.fill('#mN', '1'); await T.dispatchEvent('#mN', 'change');
await T.selectOption('#mType', 'Tund'); await T.check('input[data-cap="Auditoorne õpe"]');

// --- tunnikaupa arvestus: puhas funktsioon kindlate kellaaegadega ---
const calc = await T.evaluate(() => {
  const { calcPer } = window.__kohCalc, m = 60000, t0 = Date.UTC(2026, 10, 26, 6, 30);
  const refs = [t0, t0 + 45 * m, t0 + 105 * m, t0 + 150 * m], on = 5 * m;      // 4 tundi, 15 min vahetund pärast teist
  const run = (scans, rounds) => { const r = calcPer(refs, on, scans.map(([min, round]) => ({ at: t0 + min * m, r: round || 1 })), (rounds || []).map(([n, min, closed]) => ({ n, at: t0 + min * m, closed: closed !== false }))); return r.per.join('') + (r.missed.length ? ' m' + r.missed.join(',') : ''); };
  return {
    onTime: run([[2]]), late7: run([[7]]), late20: run([[20]]), none: run([]),
    lesson3plus4: run([[109]]), lesson3plus8: run([[113]]), lesson3plus20: run([[125]]),
    leftAfterL1: run([[1]], [[2, 60]]), leftAndBack: run([[1], [108, 3]], [[2, 60], [3, 100]]), backSameLesson: run([[1], [70, 3]], [[2, 60], [3, 65]]),
    goneInBreak: run([[1]], [[2, 95]]), openRound: run([[1]], [[2, 60, false]]), arrivedInRound2: run([[70, 2]], [[2, 50]]),
    scannedBoth: run([[1], [61, 2]], [[2, 60]]),
  };
});
const want = { onTime: 'KKKK', late7: 'HKKK', late20: 'PKKK', none: 'PPPP', lesson3plus4: 'PPKK', lesson3plus8: 'PPHK', lesson3plus20: 'PPPK',
  leftAfterL1: 'KPPP m2', leftAndBack: 'KPKK m2', backSameLesson: 'KKKK', goneInBreak: 'KKPP m2', openRound: 'KKKK', arrivedInRound2: 'PPKK', scannedBoth: 'KKKK' };
for (const k of Object.keys(want)) ok(calc[k] === want[k], `per-lesson ${k}: got ${calc[k]}, want ${want[k]}`);

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
ok((await S1.textContent('footer')).includes('kustutatakse serverist 14 päeva pärast'), 'student page states the retention period');
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
// --- nime lukustamine: Diana on lukus → s1 (nüüd sidumata telefon) saab ta valida, aga jääb õpetaja loa ootele ---
const diana = () => T.locator('button.st:has-text("Näidis Diana")');
const tagIs = (name, text, on) => T.waitForFunction(([n, t, on]) => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes(n)).textContent.includes(t) === on, [name, text, on], { timeout: 8000 });
await diana().click(); await T.click('button[data-act=lock]'); await tagIs('Näidis Diana', 'lukus', true);
await T.waitForFunction(() => document.querySelector('button[data-act=lock]').textContent.includes('Ava nime lukk'));
ok(true, 'teacher locks a name → tag „lukus“, the button now offers to unlock');
await S1.goto('about:blank'); await S1.goto(await url()); await S1.waitForSelector('button[data-slot]');
ok(await S1.locator('.list > button[data-slot]:visible').count() === 2, 'locked name is still offered among the free names');
await S1.click('button[data-slot]:has-text("Näidis Diana")'); await S1.click('#yes'); await S1.waitForSelector('.card.wait');
ok((await S1.textContent('.card.wait')).includes('ainult õpetaja loal'), 'locked name → student is told to turn to the teacher');
await S1.screenshot({ path: SHOTS + '/10-student-locked.png' });
await T.waitForSelector('#claims .banner:has-text("nimi on lukus")', { timeout: 8000 });
ok((await T.textContent('#count')).trim() === 'Kohal 2 / 4', 'locked name is not bound or checked in without the teacher');
await T.screenshot({ path: SHOTS + '/9-teacher-locked.png' });
// „Valisin vale nime“ → tagasi nimede juurde; vana ootamine ei kirjuta valikut üle, kui õpetaja vahepeal keelab
await S1.click('#back'); await S1.waitForSelector('button[data-slot]');
await T.click('#claims button[data-act=claim][data-ok="0"]');
await T.waitForFunction(() => !document.getElementById('claims').children.length, null, { timeout: 8000 });
await new Promise(r => setTimeout(r, 3500));
ok(await S1.locator('.list > button[data-slot]:visible').count() === 2, 'after „Valisin vale nime“ the picker stays (the old wait is cancelled)');
// sama nimi uuesti → õpetaja keelab → õpilane näeb keeldu
await S1.click('button[data-slot]:has-text("Näidis Diana")'); await S1.click('#yes'); await S1.waitForSelector('.card.wait');
await T.waitForSelector('#claims button[data-act=claim][data-ok="0"]', { timeout: 8000 }); await T.click('#claims button[data-act=claim][data-ok="0"]');
await S1.waitForSelector('.card.bad', { timeout: 10000 });
ok((await S1.textContent('.card.bad')).includes('ei lubanud'), 'teacher denies the locked name → student sees it');
// lukk maha ja uuesti peale; rida jääb lõpuks kinni
await T.click('button[data-act=lock]'); await tagIs('Näidis Diana', 'lukus', false);
await T.click('button[data-act=lock]'); await tagIs('Näidis Diana', 'lukus', true);
ok(true, 'lock can be removed and set again');
await diana().click(); await T.waitForSelector('button[data-act=lock]', { state: 'detached' });

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
await T.fill('#mN', '2'); await T.dispatchEvent('#mN', 'change');
await T.waitForFunction(() => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes('Näidis Carl')).querySelector('.chip').textContent === 'osa', null, { timeout: 8000 });
ok(await T.locator('button.st:has-text("Näidis Carl") .mini').allTextContents().then(a => a.join('')) === 'PK', 'two lessons: missed the first, present in the second → osa, strip PK');
ok((await T.textContent('#count')).trim() === 'Kohal 2 / 4' || (await T.textContent('#count')).trim() === 'Kohal 3 / 4', 'partially present students count as present: ' + (await T.textContent('#count')).trim());
// --- tunnikaupa käsitsi parandus (Carl: automaatne tulemus PK) ---
const carl = () => T.locator('button.st:has-text("Näidis Carl")');
const chipIs = (name, v) => T.waitForFunction(([n, v]) => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes(n)).querySelector('.chip').textContent === v, [name, v], { timeout: 8000 });
const perBtn = (i, v) => T.locator('.acts.per .lk').nth(i).locator(`button[data-st="${v}"]`);
const perRows = async () => (await db.query(`select count(*)::int as n from kohalolek.note`)).rows[0].n;
const waitRows = async n => { for (let i = 0; i < 60; i++) { if (await perRows() === n) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
await carl().click(); await T.waitForSelector('.acts.per');
ok(await T.locator('.acts.per button.pb').count() === 6 && await T.locator('.acts.per button.pb.on').allTextContents().then(a => a.join('')) === 'PK', 'per-lesson buttons for 2 lessons, current statuses highlighted');
await perBtn(0, 'K').click(); await chipIs('Näidis Carl', 'K');
ok((await carl().textContent()).includes('käsitsi') && await perBtn(0, 'K').getAttribute('class').then(c => c.includes('man')) && await waitRows(1), 'lesson 1 set to K by hand → present in both, one encrypted record on the server');
ok(await T.isVisible('.acts.per'), 'row stays open after a per-lesson change');
await perBtn(1, 'P').click(); await chipIs('Näidis Carl', 'osa');
ok(await carl().locator('.mini').allTextContents().then(a => a.join('')) === 'KP' && await waitRows(1), 'lesson 2 set to P → strip KP, the old record is replaced');
await new Promise(r => setTimeout(r, 3200));   // vähemalt üks seisupäring serverist vahepeal
ok(await carl().locator('.mini').allTextContents().then(a => a.join('')) === 'KP', 'override survives a fresh state from the server');
await perBtn(0, 'K').click(); await chipIs('Näidis Carl', 'P');
ok(await waitRows(1), 'pressing the pinned status again removes that lesson\'s override (auto P + pinned P)');
await perBtn(1, 'P').click(); await chipIs('Näidis Carl', 'osa');
ok(await carl().locator('.mini').allTextContents().then(a => a.join('')) === 'PK' && await waitRows(0) && !(await carl().textContent()).includes('käsitsi'), 'all overrides removed → automatic again, nothing left on the server');
await perBtn(0, 'H').click(); await chipIs('Näidis Carl', 'H');
await T.click('button[data-act=mark][data-st="P"]'); await chipIs('Näidis Carl', 'P');
ok(await waitRows(0), 'a whole-block mark replaces the per-lesson overrides');
await carl().click(); await T.click('button[data-act=mark][data-st=""]'); await chipIs('Näidis Carl', 'osa');
ok(await carl().locator('.mini').allTextContents().then(a => a.join('')) === 'PK', '„Automaatne“ restores the scanned result');
await T.click('button[data-act=copy-text]').catch(() => {});
await T.fill('#mN', '1'); await T.dispatchEvent('#mN', 'change');
await T.waitForFunction(() => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes('Näidis Carl')).querySelector('.chip').textContent === 'P', null, { timeout: 8000 });
// 8 min tagasi → H
const mid = await T.evaluate(() => { const d = new Date(Date.now() - 8 * 60000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });
await T.fill('#startAt', mid); await T.dispatchEvent('#startAt', 'change');
await T.waitForFunction(() => [...document.querySelectorAll('button.st')].find(b => b.textContent.includes('Näidis Carl')).querySelector('.chip').textContent === 'H', null, { timeout: 8000 });
ok(await chip('Näidis Aleksander') === '·', 'start 8 min back → H for scanned, waiting for no-show');
await T.screenshot({ path: SHOTS + '/6-teacher-statuses.png' });
// --- märkused ja kiitused ---
await T.click('button[data-act=pane][data-pane=mark]');
await T.waitForSelector('table.mx button.cell');
const cell = (name, label) => T.locator(`table.mx tr:has(td.n:text-is("${name}")) td`).nth(1 + ['Telefon', 'Räägib', 'Segab', 'Magab', 'Klapid', 'Ei tööta', 'Tubli', 'Aitas'].indexOf(label)).locator('button.cell');
await cell('Näidis Brita', 'Telefon').click(); await T.waitForFunction(() => !document.getElementById('toast').hidden);
await cell('Näidis Brita', 'Telefon').click(); await T.waitForFunction(() => document.getElementById('toastMsg').textContent.includes('(2.)'));
await cell('Näidis Carl', 'Tubli').click(); await T.waitForFunction(() => document.getElementById('toastMsg').textContent.includes('Carl'));
await cell('Näidis Diana', 'Magab').click(); await T.waitForFunction(() => document.getElementById('toastMsg').textContent.includes('Diana'));
await cell('Näidis Diana', 'Aitas').click(); await T.waitForFunction(() => document.getElementById('toastMsg').textContent.includes('aitas'));
await cell('Näidis Aleksander', 'Segab').click(); await T.waitForFunction(() => document.getElementById('toastMsg').textContent.includes('Aleksander'));
await T.click('#toastUndo');   // viimane märge tagasi
await T.waitForFunction(() => document.getElementById('noteCount').textContent === '(5)', null, { timeout: 8000 });
ok(await cell('Näidis Brita', 'Telefon').textContent() === '2' && await cell('Näidis Aleksander', 'Segab').textContent() === '+', 'notes: counts shown, undo removes the last one');
ok(await cell('Näidis Carl', 'Tubli').getAttribute('class').then(c => c.includes('k1')), 'praise cells are styled as praise');
const sent = await T.locator('#matrix .txt').allTextContents();
ok(sent.length === 3 && /^Kasutas tunnis telefoni ilma õpetaja loata \(2 korda, kell \d\d\.\d\d, \d\d\.\d\d; ÕKE p 23\.4\.10\)\.$/.test(sent[0]) && sent[1] === 'Töötas tunnis keskendunult ja tegi ettenähtud töö ära.' && /^Magas tunnis \(kell \d\d\.\d\d; ÕKE p 23\.4\.20\)\. Aitas kaasõpilasi\.$/.test(sent[2]), 'sentences for Tahvel: ' + JSON.stringify(sent));
await T.setViewportSize({ width: 390, height: 800 });
ok(!(await T.isVisible('#startAt')) && await T.isVisible('table.mx'), 'phone width: lesson settings hidden in the notes view');
await T.setViewportSize({ width: 1280, height: 800 });
ok(await T.isVisible('#startAt'), 'wide screen: lesson settings stay visible in the notes view');
await T.click('button[data-act=pane][data-pane=koh]'); await T.waitForSelector('#qr svg');
ok((await T.textContent('button.st:has-text("Näidis Brita")')).includes('märkeid 2'), 'attendance list shows the note count');
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
ok(exp.v === 2 && exp.entry.lessons === 1 && exp.entry.type === 'Tund' && exp.entry.cap.join() === 'Auditoorne õpe' && /^\d\d\.\d\d\.\d{4}$/.test(exp.entry.date) && exp.entry.startNr >= 1, 'export carries entry details: ' + JSON.stringify(exp.entry));
ok(exp.students.every(s => Array.isArray(s.per) && s.per.length === 1), 'export has per-lesson statuses');
ok(byName['Näidis Brita'].remarkKind === 'M' && byName['Näidis Brita'].remark.startsWith('Kasutas tunnis telefoni') && byName['Näidis Carl'].remarkKind === 'K' && byName['Näidis Diana'].remarkKind === 'M' && byName['Näidis Diana'].remark.endsWith('Aitas kaasõpilasi.') && byName['Näidis Aleksander'].remark === null, 'export carries remarks and praises');
// Brita skaneeris alguses (hilinemisega), aga jäi 2. kontrollis skaneerimata → selle tunni eest P
ok(byName['Näidis Aleksander'].status === 'P' && byName['Näidis Brita'].status === 'P' && byName['Näidis Carl'].status === 'H' && byName['Näidis Diana'].status === 'H', 'export statuses: ' + JSON.stringify(exp.students.map(s => s.status)));
ok(byName['Näidis Brita'].tid === 102 && byName['Näidis Brita'].missed.join() === '2' && byName['Näidis Carl'].missed.length === 0, 'export keeps Tahvel id + missed rounds');
await T.click('button[data-act="copy-text"]');
const txt = await T.evaluate(() => navigator.clipboard.readText());
ok(txt.includes('Puudus (2): Näidis Aleksander, Näidis Brita') && txt.includes('Hilines (2)') && txt.includes('tunnid '), 'text export: ' + txt.replace(/\n/g, ' | '));
await T.screenshot({ path: SHOTS + '/7-teacher-ended.png' });
// lõppenud tunnis: tunnikaupa parandus jõuab Tahvli eksporti (Aleksander ei skanninud: PP → käsitsi PK)
await T.fill('#mN', '2'); await T.dispatchEvent('#mN', 'change');
await T.click('button.st:has-text("Näidis Aleksander")'); await T.waitForSelector('.acts.per');
await perBtn(1, 'K').click(); await chipIs('Näidis Aleksander', 'osa');
await T.screenshot({ path: SHOTS + '/8-per-lesson.png' });
await T.click('button[data-act=copy-tahvel]');
const exp2 = JSON.parse(await T.evaluate(() => navigator.clipboard.readText()));
const al = exp2.students.find(s => s.name === 'Näidis Aleksander');
ok(exp2.entry.lessons === 2 && al.per.join('') === 'PK' && al.status === 'P', 'ended session: per-lesson override reaches the Tahvel export: ' + JSON.stringify(al.per));
await T.click('button[data-act="copy-text"]');
ok((await T.evaluate(() => navigator.clipboard.readText())).includes('Osaliselt puudus') , 'text export lists the partially absent student');
await perBtn(1, 'K').click(); await chipIs('Näidis Aleksander', 'P');
await T.fill('#mN', '1'); await T.dispatchEvent('#mN', 'change');
await T.waitForSelector('.acts.per', { state: 'detached' });
await T.click('button.st:has-text("Näidis Aleksander")');
// sidumise eemaldamine: silt „uus sidumine“ kaob, skaneering ise jääb alles
ok((await carl().textContent()).includes('uus sidumine'), 'phone bound in this session → tag shown');
await carl().click(); await T.click('button[data-act=unbind]'); await T.click('button[data-act=unbind]');
await T.waitForFunction(() => ![...document.querySelectorAll('button.st')].find(b => b.textContent.includes('Näidis Carl')).textContent.includes('uus sidumine'), null, { timeout: 8000 });
ok(await chip('Näidis Carl') === 'H' && !(await T.isVisible('button[data-act=unbind]')), 'binding removed → tag gone, the scan itself stays');
// lukk lõpetatud tunni vaates (ajalugu): lukk kuulub rühmale, nii et seda saab muuta ka siit
await diana().click(); await T.waitForSelector('button[data-act=lock]');
await T.click('button[data-act=lock]'); await tagIs('Näidis Diana', 'lukus', false);
await T.click('button[data-act=lock]'); await tagIs('Näidis Diana', 'lukus', true);
ok(true, 'ended session: the lock can be removed and set');
await diana().click(); await T.waitForSelector('button[data-act=lock]', { state: 'detached' });
// lõppenud tunni skaneerimine
await S1.goto('about:blank'); await S1.goto(bad); await S1.waitForSelector('.card.bad');
ok((await S1.textContent('.card.bad')).includes('lõpetatud'), 'ended session message');
// ajalugu + uuesti sisselogimine teises seadmes (võtmed tuletatakse paroolist)
await T.click('button[data-act=home]'); await T.waitForSelector('button[data-act=history]');
ok((await T.textContent('.card .small')).includes('1 telefoni seotud · 1 nimi lukus'), 'home shows 1 bound phone (one of two was removed above) and 1 locked name: ' + await T.textContent('.card .small'));
await T.click('button[data-act=history]'); await T.waitForSelector('button.st[data-act=resume]');
ok((await T.textContent('button.st[data-act=resume]')).includes('Proovija'), 'history lists the session with teacher name');
const t2 = await browser.newContext({ viewport: { width: 1100, height: 800 } }); const T2 = await t2.newPage(); watch(T2, 'teacher2');
await T2.goto(base + '/opetaja/'); await T2.fill('#lCode', 'Õpetaja  proov'); await T2.fill('#lPw', 'vale-parool-123'); await T2.click('button[type=submit]');
await T2.waitForSelector('.banner.crit'); ok(await T2.inputValue('#lCode') === 'opetaja-proov', 'wrong password rejected, name kept');
await T2.fill('#lPw', 'salajane-parool-1'); await T2.click('button[type=submit]');
await T2.waitForSelector('button[data-act=edit-group]', { timeout: 20000 });
await T2.click('button[data-act=edit-group]');
ok((await T2.inputValue('#gNames')).includes('Näidis Diana'), 'second device decrypts roster after login');
// tüüpide seaded: muuda ühes seadmes, teine näeb pärast sisselogimist
await T2.click('button[data-act=home]'); await T2.waitForSelector('#ntTypes', { state: 'attached' });
await T2.evaluate(() => { document.querySelector('details.card').open = true; });
await T2.fill('#ntTypes', 'Telefon | kasutas tunnis telefoni ilma õpetaja loata | 23.4.10\nHilineb | tuli pausilt hilinemisega tundi\n+Tubli | töötas tunnis keskendunult');
await T2.click('button[data-act=save-types]'); await T2.waitForSelector('.banner');
ok((await T2.textContent('.banner')).includes('salvestatud'), 'note types saved');
await T.click('button[data-act=home]'); await T.waitForSelector('#ntTypes', { state: 'attached' });
ok((await T.inputValue('#ntTypes')).includes('Hilineb | tuli pausilt') && (await T.inputValue('#ntTypes')).split('\n').length === 3, 'note types reach the other device');
// kaks õpetaja seadet samas tunnis: teises seadmes tehtud muudatused jõuavad esimesse
await T.waitForSelector('button[data-act=start]'); await T.click('button[data-act=start]');
await T.waitForFunction(() => window.__kohUrl && document.querySelector('#qr svg'));
ok((await diana().textContent()).includes('lukus'), 'a lock set in an ended session applies in the next lesson of the group');
const S5 = await phone('s5'); await S5.goto(await url()); await S5.waitForSelector('button[data-slot]');
await S5.click('button[data-slot]:has-text("Näidis Diana")'); await S5.click('#yes'); await S5.waitForSelector('.card.wait');
ok((await S5.textContent('.card.wait')).includes('ainult õpetaja loal'), 'next lesson: the locked name still needs the teacher');
await T.waitForSelector('#claims button[data-act=claim][data-ok="0"]', { timeout: 8000 }); await T.click('#claims button[data-act=claim][data-ok="0"]');
await T.waitForFunction(() => !document.getElementById('claims').children.length, null, { timeout: 8000 });
// T2: rühmade leht uuesti, et näha käimasolevat tundi
await T2.click('button[data-act=edit-group]'); await T2.click('button[data-act=home]'); await T2.waitForSelector('button[data-act=resume]'); await T2.click('button[data-act=resume]');
await T2.waitForFunction(() => window.__kohUrl && document.querySelector('#qr svg'));
await T2.check('input[data-cap="Iseseisev õpe"]'); await T2.focus('#mNr');   // teises seadmes on päises väli valitud
await T.waitForTimeout(700);                                                  // inimese tempo: kaks seadet ei salvesta samal sekundimurdosal
await T.fill('#mN', '5'); await T.dispatchEvent('#mN', 'change'); await T.selectOption('#mType', 'Praktiline töö');
await T.waitForFunction(() => document.querySelector('input[data-cap="Iseseisev õpe"]').checked, null, { timeout: 9000 });
await T2.waitForFunction(() => document.getElementById('mN').value === '5' && document.getElementById('mType').value === 'Praktiline töö', null, { timeout: 9000 });
ok(true, 'lesson details changed on one device appear on the other');
await T.click('button[data-act=end]'); await T.click('button[data-act=end]');
await T.waitForSelector('button[data-act=copy-tahvel]', { timeout: 8000 });
ok(true, 'ending shows the summary on the device that ended it');
await T2.waitForSelector('button[data-act=copy-tahvel]', { timeout: 9000 });
ok(!(await T2.$('#qr svg')), 'ending on one device switches the other device to the summary');
// lõpetamine täpselt taustapäringu ajal (varem jäi vaade vana seisu peale): 5 korda järjest
for (let i = 0; i < 5; i++) {
  await T.click('button[data-act=reopen]'); await T.waitForFunction(() => window.__kohUrl && document.querySelector('#qr svg') && document.querySelector('button[data-act=end]'));
  await T.waitForTimeout(2440 - i * 30);
  await T.click('button[data-act=end]'); await T.click('button[data-act=end]');
  await T.waitForSelector('button[data-act=copy-tahvel]', { timeout: 8000 });
}
ok(true, 'end → summary is reliable when it races the background poll (5 rounds)');
// server ei näe nimesid
const leak = (await db.query(`select roster_enc || list_enc as blob from kohalolek.grp`)).rows[0].blob;
ok(!/Näidis|Brita/.test(leak), 'no names in server blobs');
console.log(`E2E: ${pass} passed, ${fail} failed`);
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close(); server.close(); await db.close(); process.exit(fail || errors.length ? 1 : 0);
