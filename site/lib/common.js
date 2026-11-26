/* Kohalolek: ühine kood õpetaja ja õpilase lehele (serveri kutsed ja krüpto). */
const KOH = (() => {
  const cfg = window.KOH_CONFIG || {};
  const STEP_MS = 10000; // vahetuva koodi aken, peab klappima serveriga (kohalolek.token)

  async function rpc(fn, args) {
    const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.key },
      body: JSON.stringify(args || {}),
    });
    if (!r.ok) throw new Error(`${fn}: ${r.status}`);
    return r.json();
  }

  const enc = new TextEncoder(), dec = new TextDecoder();
  const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

  async function sha256hex(text) {
    return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  }

  /* Vahetuv kood: sama arvutus mis serveris. */
  async function token(seed, round, w) {
    return (await sha256hex(`${seed}:${round}:${w}`)).slice(0, 8);
  }

  /* Paroolist kaks võtit: auth (läheb serverisse) ja enc (jääb seadmesse, sellega on nimed krüpteeritud). */
  async function deriveKeys(code, password) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('kohalolek:' + code.toLowerCase()), iterations: 310000 }, base, 512));
    return { auth: toHex(bits.slice(0, 32)), enc: b64u(bits.slice(32)) };
  }

  async function aesKey(rawB64u) {
    return crypto.subtle.importKey('raw', unb64u(rawB64u), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function encrypt(keyB64u, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64u), enc.encode(JSON.stringify(obj)));
    return b64u(iv) + '.' + b64u(ct);
  }
  async function decrypt(keyB64u, blob) {
    const [iv, ct] = blob.split('.');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, await aesKey(keyB64u), unb64u(ct));
    return JSON.parse(dec.decode(pt));
  }
  const randomKey = bytes => b64u(crypto.getRandomValues(new Uint8Array(bytes)));

  const pad = n => String(n).padStart(2, '0');
  const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dmy = t => { const d = new Date(t); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  return { cfg, STEP_MS, rpc, sha256hex, token, deriveKeys, encrypt, decrypt, randomKey, hm, dmy, esc, pad };
})();
