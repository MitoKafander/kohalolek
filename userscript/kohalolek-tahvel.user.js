// ==UserScript==
// @name         Kohalolek → Tahvel
// @namespace    https://mitokafander.github.io/kohalolek/
// @version      0.1.0
// @description  Täidab Tahvli päevikukandes puudumised (P/H) ja märkused kohaloleku lehelt kopeeritud andmetest. Ise ei salvesta midagi: õpetaja vaatab üle ja vajutab „Salvesta“.
// @match        https://tahvel.edu.ee/*
// @updateURL    https://mitokafander.github.io/kohalolek/kohalolek-tahvel.user.js
// @downloadURL  https://mitokafander.github.io/kohalolek/kohalolek-tahvel.user.js
// @grant        none
// ==/UserScript==

/* Mida see teeb
 * 1. Päeviku lehel: nupp „Kopeeri nimekiri kohaloleku lehele“ (nimed + Tahvli õpilase id lõikelauale).
 * 2. Kande aknas („Lisa uus sissekanne“ või kande muutmine): nupp „Kleebi kohalolek või märkused“.
 *    - kohaloleku lehe „Kopeeri Tahvli jaoks“ → paneb P ja H linnukesed;
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
        return { kind: o.kind === 'kohalolek' ? 'kohalolek' : 'markused', title: [o.group, o.date, o.start].filter(Boolean).join(' · '),
          students: o.students.map(s => ({ name: s.name, status: s.status || null, min: s.min, missed: s.missed || [], remark: s.remark || null })) };
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
    if (!cb || isChecked(cb) === want) return false;
    if (isDisabled(cb)) return null;
    cb.querySelector('button').click();
    await sleep(30);
    return isChecked(cb) === want ? true : null;
  }
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

  async function apply(dialog, data) {
    const rows = rowsOf(dialog);
    const byName = new Map(), byTokens = new Map();
    data.students.forEach(s => { byName.set(norm(s.name), s); byTokens.set(tokens(s.name), s); });
    const used = new Set();
    const rep = { P: [], H: [], cleared: [], remarks: [], skipped: [], notInData: [], late: [], missed: [] };
    for (const row of rows) {
      const s = byName.get(norm(row.name)) || byTokens.get(tokens(row.name));
      row.tr.style.boxShadow = '';
      if (!s) { if (data.kind === 'kohalolek') rep.notInData.push(row.name); continue; }
      used.add(s);
      const q = n => row.tr.querySelector(`checkbox[formcontrolname="${n}"]`);
      if (data.kind === 'kohalolek' && s.status) {
        const perLesson = isChecked(q('isLessonAbsence'));
        const excused = isChecked(q('absenceExcused')) || isChecked(q('absencePractice'));
        if (perLesson) { rep.skipped.push(`${row.name} (puudumine on märgitud tunni kaupa)`); }
        else if (excused) { rep.skipped.push(`${row.name} (Tahvlis juba V või PR)`); }
        else {
          const wantP = s.status === 'P', wantH = s.status === 'H';
          let changed = false, failed = false;
          // Tahvel võtab ise H maha, kui P pannakse (ja vastupidi), seega kõigepealt eemaldamised.
          for (const [name, want] of [['absenceLate', wantH], ['absenceWithoutReason', wantP]].sort((a, b) => a[1] - b[1])) {
            const r = await setBox(q(name), want);
            if (r === true) changed = true; else if (r === null) failed = true;
          }
          if (failed) rep.skipped.push(`${row.name} (linnuke on lukus)`);
          else if (wantP) rep.P.push(row.name); else if (wantH) rep.H.push(row.name); else if (changed) rep.cleared.push(row.name);
          if (!failed && (wantP || wantH)) row.tr.style.boxShadow = `inset 4px 0 0 ${wantP ? '#A63C27' : '#A9690F'}`;
          if (wantP && s.min != null) rep.late.push(`${row.name} (saabus +${s.min} min)`);
          if (s.missed && s.missed.length && !wantP) rep.missed.push(`${row.name} (kontroll ${s.missed.join(', ')})`);
        }
      }
      if (s.remark) {
        const ta = row.tr.querySelector('tahvel-textarea[formcontrolname="description"] textarea');
        if (!ta || ta.disabled) rep.skipped.push(`${row.name} (selgituse väli on lukus)`);
        else if (ta.value.trim() && ta.value.trim() !== s.remark.trim()) rep.skipped.push(`${row.name} (selgitus on juba kirjas, ei kirjutanud üle)`);
        else {
          setText(ta, s.remark.slice(0, 1000));
          await setBox(q('remark'), true);
          rep.remarks.push(row.name);
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
    if (data.kind === 'kohalolek') h += line('P pandud', rep.P, '#A63C27') + line('H pandud', rep.H, '#A9690F') + line('Linnuke eemaldatud', rep.cleared);
    h += line('Märkus kirjutatud', rep.remarks, '#2C6A5D');
    h += line('P, sest saabus hiljem kui 15 min (mitmetunnise kande puhul otsusta ise)', rep.late);
    h += line('Skaneeris alguses, aga puudus hilisemas kontrollis (otsusta ise)', rep.missed, '#A63C27');
    h += line('Jäi vahele', rep.skipped, '#A63C27');
    h += line('Andmetes on, Tahvli kandes ei ole', rep.notInTahvel, '#A63C27');
    h += line('Tahvli kandes on, andmetes ei ole (jäi muutmata)', rep.notInData, '#A63C27');
    if (!rep.P.length && !rep.H.length && !rep.remarks.length && !rep.cleared.length && rep.notInTahvel.length === data.students.length) h += '<div style="margin-top:3px;color:#A63C27"><strong>Ühtegi nime ei leitud. Kas on õige rühm?</strong></div>';
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
  function addRosterButton() {
    const m = location.hash.match(/#\/journal\/(\d+)\//);
    const root = document.querySelector('dg-journal-edit-component');
    if (!m || !root || root.querySelector(`[${MARK}="roster"]`)) return;
    const anchor = [...root.querySelectorAll('tahvel-button')].find(b => /^LISA ÕPPIJAD/i.test(b.innerText.trim()));
    if (!anchor) return;
    const btn = el('button', BTN2 + ';margin-left:8px', 'Kopeeri nimekiri kohaloleku lehele'); btn.type = 'button';
    btn.setAttribute(MARK, 'roster');
    btn.addEventListener('click', async () => {
      const orig = btn.textContent;
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
    anchor.after(btn);
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
  scan();
  window.__kohTahvel = { parse, apply }; // testimiseks
})();
