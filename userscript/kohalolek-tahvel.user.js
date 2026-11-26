// ==UserScript==
// @name         Kohalolek → Tahvel
// @namespace    https://mitokafander.github.io/kohalolek/
// @version      0.3.0
// @description  Täidab Tahvli päevikukandes puudumised (P/H), märkused ja kiitused kohaloleku lehelt kopeeritud andmetest. Ise ei salvesta midagi: õpetaja vaatab üle ja vajutab „Salvesta“.
// @match        https://tahvel.edu.ee/*
// @updateURL    https://mitokafander.github.io/kohalolek/kohalolek-tahvel.user.js
// @downloadURL  https://mitokafander.github.io/kohalolek/kohalolek-tahvel.user.js
// @grant        none
// ==/UserScript==

/* Mida see teeb
 * 1. Päeviku lehel: nupp „Kopeeri nimekiri kohaloleku lehele“ (nimed + Tahvli õpilase id lõikelauale).
 * 2. Kande aknas („Lisa uus sissekanne“ või kande muutmine): nupp „Kleebi kohalolek või märkused“.
 *    - kohaloleku lehe „Kopeeri Tahvli jaoks“ → täidab kande päise (liik, maht, kuupäev, algustund, tundide arv)
 *      ja paneb P ja H linnukesed, mitme tunni korral tunni kaupa (veerg „123?“); tunni ajal tehtud märkused ja
 *      kiitused lähevad selgituse lahtrisse linnukesega „Märkus“ või „Kiitus“;
 *    - Tunnimärkmete „Kopeeri kõik nimedega“ (read „Nimi: tekst“) → kirjutab selgituse ja paneb linnukese „Märkus“.
 * Skript ainult täidab vormi. Salvestamise nuppu ta ei puuduta.
 */
(function () {
  'use strict';
  const MARK = 'data-koh';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const tokens = s => norm(s).split(' ').sort().join(' ');
  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  const BTN = 'font:inherit;font-size:13px;font-weight:700;padding:6px 10px;border-radius:6px;border:1px solid #2C6A5D;background:#2C6A5D;color:#fff;cursor:pointer';
  const BTN2 = 'font:inherit;font-size:13px;padding:6px 10px;border-radius:6px;border:1px solid #9aa5a2;background:#fff;color:#1C2827;cursor:pointer';

  /* ---------- sisendi lugemine ---------- */
  function parse(text) {
    text = String(text || '').trim();
    if (!text) return null;
    try {
      const o = JSON.parse(text);
      if (o && Array.isArray(o.students)) {
        return { kind: o.kind === 'kohalolek' ? 'kohalolek' : 'markused', title: [o.group, o.date, o.start].filter(Boolean).join(' · '), entry: o.entry || null,
          students: o.students.map(s => ({ name: s.name, status: s.status || null, per: Array.isArray(s.per) ? s.per : null, min: s.min, missed: s.missed || [], remark: s.remark || null, remarkKind: s.remarkKind === 'K' ? 'K' : 'M' })) };
      }
      return null;
    } catch (e) { /* ei ole JSON: proovi „Nimi: tekst“ ridu */ }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = lines.map(l => l.match(/^([^:]{3,80}):\s+(.+)$/)).filter(Boolean).map(m => ({ name: m[1], status: null, missed: [], remark: m[2] }));
    if (!rows.length) return null;
    const head = lines[0] && !/^[^:]{3,80}:\s+.+$/.test(lines[0]) ? lines[0] : '';
    return { kind: 'markused', title: head, students: rows };
  }

  /* ---------- kande vormi täitmine ---------- */
  const isChecked = cb => !!(cb && cb.querySelector('.box.checked'));
  const isDisabled = cb => { const b = cb && cb.querySelector('button'); return !b || b.disabled || cb.classList.contains('disabled') || b.classList.contains('disabled'); };
  async function setBox(cb, want) {
    if (!cb) return want ? null : false;     // linnukest ei ole: sisse panna ei saa, maha võtta pole vaja
    if (isChecked(cb) === want) return false;
    if (isDisabled(cb)) return null;
    cb.querySelector('button').click();
    await sleep(30);
    if (!cb.isConnected) return null;   // Tahvel joonistas lahtri ümber (nt P muutus V-ks)
    return isChecked(cb) === want ? true : null;
  }
  /* Kinnitatud puudumistõendi korral muudab Tahvel P ise V-ks (praktika puhul PR-ks) ja võib H/P linnukesed ära võtta. */
  const excusedIn = scope => !!scope && (!!scope.querySelector('checkbox[formcontrolname="absenceExcused"] .box.checked, checkbox[formcontrolname="absencePractice"] .box.checked')
    || [...scope.querySelectorAll('span, button, div, label')].some(e => e.children.length === 0 && /^(V|PR)$/.test(e.textContent.trim())));
  function setText(ta, value) {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function rowsOf(dialog) {
    return [...dialog.querySelectorAll('table.tahvel-table tbody tr')].map(tr => {
      const nameEl = tr.querySelector('.student-cell span > span');
      return nameEl ? { tr, name: nameEl.textContent.trim() } : null;
    }).filter(Boolean);
  }

  /* Kande päis: täidab ainult tühjad väljad. Kui väljal on juba teine väärtus, jätab selle alles ja ütleb aruandes. */
  async function fillHeader(dialog, e, rep) {
    const sel = name => dialog.querySelector(`tahvel-select[formcontrolname="${name}"]`);
    const chosen = el0 => ((el0 && el0.querySelector('.selected-option')) || { textContent: '' }).textContent.trim();
    const choose = async (name, text, label) => {
      const el0 = sel(name); if (!el0) { rep.headFail.push(label); return; }
      const cur = chosen(el0);
      if (cur === text) { rep.head.push(`${label} ${text}`); return; }
      if (cur) { rep.headKept.push(`${label} on juba „${cur}“ (andmetes „${text}“)`); return; }
      const item = [...el0.querySelectorAll('.dropdown-item')].find(x => x.textContent.trim() === text);
      if (!item) { rep.headFail.push(`${label} „${text}“`); return; }
      item.click(); await sleep(250);
      (chosen(el0) === text ? rep.head : rep.headFail).push(`${label} ${text}`);
    };
    if (e.type) await choose('entryType', e.type, 'liik');
    for (const cap of e.cap || []) {
      const cb = [...dialog.querySelectorAll('[formarrayname="capacityTypes"] checkbox[formcontrolname="selected"]')].find(c => c.innerText.trim() === cap);
      const r = cb ? await setBox(cb, true) : null;
      (r === null ? rep.headFail : rep.head).push(cap.toLowerCase());
    }
    if (e.date) {
      const dp = dialog.querySelector('date-picker[formcontrolname="entryDate"]'), inp = dp && dp.querySelector('input');
      const picked = chosen(sel('entryDateString'));
      if (!inp) rep.headFail.push('kuupäev');
      else if (inp.value === e.date) rep.head.push('kuupäev ' + e.date);
      else if (inp.value || picked) rep.headKept.push(`kuupäev on juba „${inp.value || picked}“ (andmetes „${e.date}“)`);
      else {
        inp.focus(); inp.value = e.date;
        inp.dispatchEvent(new InputEvent('input', { bubbles: true, data: e.date, inputType: 'insertText' }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(400);
        (inp.value === e.date && !dp.classList.contains('ng-invalid') ? rep.head : rep.headFail).push('kuupäev ' + e.date);
      }
    }
    if (e.startNr != null) await choose('startLessonNr', String(e.startNr), 'algustund');
    if (e.lessons != null) {
      const inp = dialog.querySelector('tahvel-input[formcontrolname="lessons"] input'), want = String(e.lessons);
      if (!inp) rep.headFail.push('tundide arv');
      else if (inp.value === want) rep.head.push('tunde ' + want);
      else if (inp.value) rep.headKept.push(`tundide arv on juba ${inp.value} (andmetes ${want})`);
      else {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, want);
        for (const ev of ['input', 'change', 'blur']) inp.dispatchEvent(new Event(ev, { bubbles: true }));
        await sleep(300);
        (inp.value === want ? rep.head : rep.headFail).push('tunde ' + want);
      }
    }
    await sleep(700);   // Tahvel arvutab read ümber (tunnikaupa lahtrid, kinnitatud puudumised)
  }

  /* Ühe õpilase puudumine tunni kaupa: lülitab sisse „123?“ ja paneb iga tunni H/P. */
  async function setPerLesson(tr, per) {
    const q = n => tr.querySelector(`checkbox[formcontrolname="${n}"]`);
    if ((await setBox(q('isLessonAbsence'), true)) === null) return false;
    await sleep(350);
    const rows = [...tr.querySelectorAll('[formarrayname="lessonAbsences"] > .checkbox-row')];
    if (rows.length !== per.length) return false;
    let okAll = true, excused = 0;
    for (let i = 0; i < rows.length; i++) {
      const c = n => rows[i].querySelector(`checkbox[formcontrolname="${n}"]`);
      if (excusedIn(rows[i])) { excused++; continue; }             // selle tunni kohta on Tahvlis juba V või PR
      let bad = false;
      for (const [name, want] of [['absenceLate', per[i] === 'H'], ['absenceWithoutReason', per[i] === 'P']].sort((x, y) => x[1] - y[1])) {
        if ((await setBox(c(name), want)) === null) bad = true;
      }
      if (bad && per[i] === 'P' && excusedIn(rows[i])) excused++;   // P pandi ja Tahvel muutis selle V-ks
      else if (bad) okAll = false;
    }
    return okAll ? { excused } : false;
  }

  async function apply(dialog, data) {
    const rep = { P: [], H: [], partial: [], cleared: [], excused: [], remarks: [], praises: [], skipped: [], notInData: [], late: [], missed: [], head: [], headKept: [], headFail: [] };
    if (data.kind === 'kohalolek' && data.entry) await fillHeader(dialog, data.entry, rep);
    const rows = rowsOf(dialog);
    const lessonsInp = dialog.querySelector('tahvel-input[formcontrolname="lessons"] input');
    const formLessons = lessonsInp ? parseInt(lessonsInp.value, 10) || 0 : 0;
    const byName = new Map(), byTokens = new Map();
    data.students.forEach(s => { byName.set(norm(s.name), s); byTokens.set(tokens(s.name), s); });
    const used = new Set();
    for (const row of rows) {
      const s = byName.get(norm(row.name)) || byTokens.get(tokens(row.name));
      row.tr.style.boxShadow = '';
      if (!s) { if (data.kind === 'kohalolek') rep.notInData.push(row.name); continue; }
      used.add(s);
      const q = n => row.tr.querySelector(`checkbox[formcontrolname="${n}"]`);
      if (data.kind === 'kohalolek' && s.status) {
        const perLesson = isChecked(q('isLessonAbsence'));
        // puudumiste lahter: seal on H/P linnukesed või (tõendi korral) ainult märge V/PR; asub „123?“ lahtri järel
        const anchor = row.tr.querySelector('checkbox[formcontrolname="absenceWithoutReason"], checkbox[formcontrolname="absenceLate"], [formarrayname="lessonAbsences"]');
        const cell = anchor ? anchor.closest('td') : (q('isLessonAbsence') && q('isLessonAbsence').closest('td') ? q('isLessonAbsence').closest('td').nextElementSibling : null);
        const excused = !perLesson && excusedIn(cell);
        // tunnikaupa jaotus on vaja ainult siis, kui tunnid erinevad (v.a „hilines esimesse tundi“ = tavaline H)
        const per = s.per && s.per.length > 1 ? s.per : null;
        const mixed = per && !(per.every(x => x === per[0]) || (per[0] === 'H' && per.slice(1).every(x => x === 'K')));
        const short = p => p.map((x, i) => x === 'K' ? null : `${i + 1}. ${x}`).filter(Boolean).join(', ');
        if (excused) { rep.skipped.push(s.status === 'K' ? `${row.name} (Tahvlis on V või PR, aga kohaloleku järgi oli kohal: otsusta ise)` : `${row.name} (Tahvlis juba V või PR)`); }
        else if (perLesson && !per) { rep.skipped.push(`${row.name} (puudumine on juba märgitud tunni kaupa)`); }
        else if ((perLesson || mixed) && formLessons !== per.length) { rep.skipped.push(`${row.name} (tunnikaupa: ${short(per) || 'kohal'}; kande tundide arv ${formLessons || 'on tühi'}, andmetes ${per.length})`); }
        else if (perLesson || mixed) {
          // rida on (või läheb) tunnikaupa režiimi: uuenda iga tunni linnukesed, nii töötab ka korduv kleepimine
          const res = await setPerLesson(row.tr, per);
          if (!res) rep.skipped.push(`${row.name} (tunnikaupa märkimine ei õnnestunud: ${short(per)})`);
          else if (per.every(x => x === 'K')) rep.cleared.push(row.name);
          else { rep.partial.push(`${row.name} (${short(per)})`); row.tr.style.boxShadow = 'inset 4px 0 0 #A9690F'; }
          if (res && res.excused) rep.excused.push(`${row.name} (${res.excused} tundi)`);
        }
        else {
          const st = per ? (per[0] === 'P' ? 'P' : per[0] === 'H' ? 'H' : 'K') : s.status;
          const wantP = st === 'P', wantH = st === 'H';
          let changed = false, failed = false;
          // Tahvel võtab ise H maha, kui P pannakse (ja vastupidi), seega kõigepealt eemaldamised.
          for (const [name, want] of [['absenceLate', wantH], ['absenceWithoutReason', wantP]].sort((a, b) => a[1] - b[1])) {
            const r = await setBox(q(name), want);
            if (r === true) changed = true; else if (r === null) failed = true;
          }
          // P pandi, aga Tahvel muutis selle kinnitatud tõendi tõttu V-ks (või PR-ks): see on õige tulemus
          if (wantP && excusedIn(cell) && !isChecked(q('absenceWithoutReason'))) { rep.excused.push(row.name); row.tr.style.boxShadow = 'inset 4px 0 0 #2C6A5D'; failed = false; }
          else if (failed) rep.skipped.push(`${row.name} (linnuke on lukus)`);
          else if (wantP) rep.P.push(row.name); else if (wantH) rep.H.push(row.name); else if (changed) rep.cleared.push(row.name);
          if (!failed && (wantP || wantH) && !rep.excused.includes(row.name)) row.tr.style.boxShadow = `inset 4px 0 0 ${wantP ? '#A63C27' : '#A9690F'}`;
          if (!per && wantP && s.min != null) rep.late.push(`${row.name} (saabus +${s.min} min)`);
          if (!per && s.missed && s.missed.length && !wantP) rep.missed.push(`${row.name} (kontroll ${s.missed.join(', ')})`);
        }
      }
      if (s.remark) {
        const ta = row.tr.querySelector('tahvel-textarea[formcontrolname="description"] textarea');
        if (!ta || ta.disabled) rep.skipped.push(`${row.name} (selgituse väli on lukus)`);
        else if (ta.value.trim() && ta.value.trim() !== s.remark.trim()) rep.skipped.push(`${row.name} (selgitus on juba kirjas, ei kirjutanud üle)`);
        else {
          setText(ta, s.remark.slice(0, 1000));
          const praise = s.remarkKind === 'K';      // Tahvel lubab korraga ainult ühe: Kiitus või Märkus
          await setBox(q(praise ? 'praise' : 'remark'), true);
          (praise ? rep.praises : rep.remarks).push(row.name);
          if (!row.tr.style.boxShadow) row.tr.style.boxShadow = 'inset 4px 0 0 #2C6A5D';
        }
      }
    }
    rep.notInTahvel = data.students.filter(s => !used.has(s)).map(s => s.name);
    rep.rows = rows.length;
    return rep;
  }

  function reportHtml(data, rep) {
    const line = (label, list, color) => list.length ? `<div style="margin-top:3px"><strong${color ? ` style="color:${color}"` : ''}>${label} (${list.length}):</strong> ${list.map(x => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))).join(', ')}</div>` : '';
    let h = `<div><strong>Täidetud${data.title ? ' · ' + data.title.replace(/[&<>]/g, '') : ''}.</strong> Vaata üle ja vajuta ise „Salvesta“.</div>`;
    h += line('Päis täidetud', rep.head) + line('Päises jäi muutmata', rep.headKept, '#A63C27') + line('Päises ei õnnestunud', rep.headFail, '#A63C27');
    if (data.kind === 'kohalolek') h += line('P pandud', rep.P, '#A63C27') + line('H pandud', rep.H, '#A9690F') + line('Tunni kaupa märgitud', rep.partial, '#A9690F') + line('Tahvel märkis ise V või PR (kinnitatud puudumine)', rep.excused, '#2C6A5D') + line('Linnuke eemaldatud', rep.cleared);
    h += line('Märkus kirjutatud', rep.remarks, '#A9690F') + line('Kiitus kirjutatud', rep.praises, '#2C6A5D');
    h += line('P, sest saabus hiljem kui 15 min (mitmetunnise kande puhul otsusta ise)', rep.late);
    h += line('Skaneeris alguses, aga puudus hilisemas kontrollis (otsusta ise)', rep.missed, '#A63C27');
    h += line('Jäi vahele', rep.skipped, '#A63C27');
    h += line('Andmetes on, Tahvli kandes ei ole', rep.notInTahvel, '#A63C27');
    h += line('Tahvli kandes on, andmetes ei ole (jäi muutmata)', rep.notInData, '#A63C27');
    if (!rep.P.length && !rep.H.length && !rep.partial.length && !rep.remarks.length && !rep.praises.length && !rep.cleared.length && rep.notInTahvel.length === data.students.length) h += '<div style="margin-top:3px;color:#A63C27"><strong>Ühtegi nime ei leitud. Kas on õige rühm?</strong></div>';
    return h;
  }

  function addEntryToolbar(dialog) {
    const table = dialog.querySelector('table.tahvel-table');
    if (!table || dialog.querySelector(`[${MARK}="bar"]`)) return;
    const bar = el('div', 'margin:10px 0;padding:10px 12px;border:1px solid #2C6A5D;border-radius:8px;background:#F2F7F5;color:#1C2827;font-size:13px;line-height:1.4');
    bar.setAttribute(MARK, 'bar');
    const row = el('div', 'display:flex;flex-wrap:wrap;gap:8px;align-items:center');
    const btn = el('button', BTN, 'Kleebi kohalolek või märkused'); btn.type = 'button';
    const hint = el('span', 'color:#596765', 'Kohaloleku lehel „Kopeeri Tahvli jaoks“ või Tunnimärkmetes „Kopeeri kõik nimedega“, siis vajuta siin.');
    const out = el('div', 'margin-top:8px;display:none');
    const manual = el('div', 'margin-top:8px;display:none');
    const ta = el('textarea', 'width:100%;min-height:70px;font:12px ui-monospace,Menlo,monospace;border:1px solid #9aa5a2;border-radius:6px;padding:6px'); ta.placeholder = 'Kleebi kopeeritud andmed siia (Ctrl/⌘+V)';
    const go = el('button', BTN, 'Täida'); go.type = 'button'; go.style.marginTop = '6px';
    manual.append(ta, go);
    row.append(btn, hint); bar.append(row, manual, out);
    (table.closest('tahvel-table') || table).before(bar);

    const run = async text => {
      const data = parse(text);
      out.style.display = 'block';
      if (!data) { out.innerHTML = '<span style="color:#A63C27"><strong>Lõikelaual ei ole kohaloleku ega märkuste andmeid.</strong> Kopeeri need uuesti ja proovi veel.</span>'; return; }
      btn.disabled = true; go.disabled = true;
      try { out.innerHTML = reportHtml(data, await apply(dialog, data)); manual.style.display = 'none'; }
      catch (e) { out.innerHTML = '<span style="color:#A63C27"><strong>Täitmine ebaõnnestus.</strong> Tahvli vorm võib olla muutunud. Midagi ei salvestatud.</span>'; }
      btn.disabled = false; go.disabled = false;
    };
    btn.addEventListener('click', async () => {
      let text = null;
      try { text = await navigator.clipboard.readText(); } catch (e) { /* luba puudub: käsitsi kleepimine */ }
      if (text && parse(text)) return run(text);
      manual.style.display = 'block'; ta.focus();
      if (text != null) { out.style.display = 'block'; out.innerHTML = '<span style="color:#A63C27">Lõikelaual ei olnud sobivaid andmeid. Kleebi need allolevasse kasti.</span>'; }
    });
    go.addEventListener('click', () => run(ta.value));
  }

  /* ---------- päeviku leht: nimekirja kopeerimine ---------- */
  /* Nupp ei tohi sõltuda Tahvli nuppude tekstist (keel võib olla ENG/RUS ja „Lisa õppijad“ ei ole igal
   * õpetajal olemas). Eelistatult läheb ta päeviku nupuritta; kui seda ei leia, siis lehe alla paremasse nurka. */
  function addRosterButton() {
    const m = location.hash.match(/#\/journal\/(\d+)(\/|$|\?)/);
    const old = document.querySelector(`[${MARK}="roster"]`);
    if (!m) { if (old) old.remove(); return; }
    if (old && old.dataset.journal === m[1] && old.isConnected) {
      if (old.dataset.floating !== '1') return;
      // ujuv nupp: kui päeviku nupurida on vahepeal tekkinud, tõsta nupp sinna
      if (!document.querySelector('dg-journal-edit-component .tahvel-form-buttons-left')) return;
      old.remove();
    } else if (old) old.remove();
    const row = document.querySelector('dg-journal-edit-component .tahvel-form-buttons-left');
    const btn = el('button', BTN2 + (row ? ';margin-left:8px' : ';position:fixed;right:16px;bottom:16px;z-index:9999;box-shadow:0 2px 10px rgba(0,0,0,.25)'), 'Kopeeri nimekiri kohaloleku lehele'); btn.type = 'button';
    btn.setAttribute(MARK, 'roster'); btn.dataset.journal = m[1]; btn.dataset.floating = row ? '0' : '1';
    btn.addEventListener('click', async () => {
      const orig = 'Kopeeri nimekiri kohaloleku lehele';
      try {
        const get = async u => { const r = await fetch('/hois_back' + u, { credentials: 'include', headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(r.status); return r.json(); };
        const [students, journal] = await Promise.all([get(`/journals/${m[1]}/journalStudents`), get(`/journals/${m[1]}`)]);
        const groups = {}; students.forEach(s => { if (s.studentGroup) groups[s.studentGroup] = (groups[s.studentGroup] || 0) + 1; });
        const group = Object.keys(groups).sort((a, b) => groups[b] - groups[a])[0] || (journal.studentGroups || [])[0] || journal.nameEt;
        const payload = { v: 1, kind: 'nimekiri', group, journal: journal.nameEt, students: students.map(s => ({ name: s.fullname, tid: s.studentId })) };
        await navigator.clipboard.writeText(JSON.stringify(payload));
        btn.textContent = `Kopeeritud: ${students.length} õpilast`;
      } catch (e) { btn.textContent = 'Ei õnnestunud'; }
      setTimeout(() => { btn.textContent = orig; }, 2500);
    });
    if (row) row.appendChild(btn); else document.body.appendChild(btn);
  }

  /* ---------- käivitus: Tahvel on üheleheline rakendus, jälgi muutusi ---------- */
  let pending = false;
  function scan() {
    pending = false;
    try {
      const dialog = document.querySelector('add-entry');
      if (dialog) addEntryToolbar(dialog);
      addRosterButton();
    } catch (e) { /* Tahvli uuendus võis vormi muuta: ära sega lehe tööd */ }
  }
  new MutationObserver(() => { if (!pending) { pending = true; setTimeout(scan, 300); } }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(scan, 300));
  scan();
  window.__kohTahvel = { parse, apply }; // testimiseks
})();
