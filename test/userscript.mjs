// Userscripti nimekirjanupu paigutus võlts-DOM-is (päris Tahvlit ei puuduta).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../userscript/kohalolek-tahvel.user.js', import.meta.url), 'utf8');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route('https://tahvel.edu.ee/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="app"></div></body></html>' }));
await p.goto('https://tahvel.edu.ee/#/');
await p.addScriptTag({ content: src });
const state = () => p.evaluate(() => { const x = document.querySelector('[data-koh="roster"]'); return x ? { floating: x.dataset.floating, journal: x.dataset.journal, inRow: !!x.closest('.tahvel-form-buttons-left'), n: document.querySelectorAll('[data-koh="roster"]').length } : null; });
const wait = ms => p.waitForTimeout(ms);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
await wait(500); ok(await state() === null, 'no button outside a journal');
// 1) päevik ilma nupureata (nt vaaterežiim või teine keel/õigused) → ujuv nupp
await p.evaluate(() => { location.hash = '#/journal/111/view'; }); await wait(900);
let s = await state(); ok(s && s.floating === '1' && s.journal === '111' && s.n === 1, 'floating button on a journal without the button row: ' + JSON.stringify(s));
// 2) nupurida tekib (ingliskeelsed sildid) → nupp kolib ritta
await p.evaluate(() => { location.hash = '#/journal/111/edit'; document.getElementById('app').innerHTML = '<dg-journal-edit-component><div class="tahvel-form-buttons-left pad-top"><tahvel-button>ADD NEW ENTRY</tahvel-button><tahvel-button>TO EXCEL</tahvel-button></div></dg-journal-edit-component>'; }); await wait(900);
s = await state(); ok(s && s.floating === '0' && s.inRow && s.n === 1, 'button moves into the row, English labels, no "Lisa õppijad": ' + JSON.stringify(s));
// 3) teine päevik → nupp käib uue päeviku kohta
await p.evaluate(() => { location.hash = '#/journal/222/edit'; }); await wait(900);
s = await state(); ok(s && s.journal === '222' && s.n === 1, 'button follows journal change: ' + JSON.stringify(s));
// 4) päevikust lahkumine → nupp kaob
await p.evaluate(() => { location.hash = '#/timetable'; document.getElementById('app').innerHTML = ''; }); await wait(900);
ok(await state() === null, 'button removed after leaving the journal');
// 5) kande aken: riba tekib tabeli kohale
await p.evaluate(() => { document.getElementById('app').innerHTML = '<add-entry><table class="tahvel-table"><tbody><tr><td>1</td><td><div class="student-cell"><span><span>Näidis Brita</span><span>, G</span></span></div></td></tr></tbody></table></add-entry>'; }); await wait(900);
ok(await p.evaluate(() => !!document.querySelector('add-entry [data-koh="bar"]')), 'entry toolbar appears');
console.log(`userscript DOM: ${pass} passed, ${fail} failed` + (errs.length ? ' | errors: ' + errs.join('; ') : ''));
await b.close(); process.exit(fail || errs.length ? 1 : 0);
