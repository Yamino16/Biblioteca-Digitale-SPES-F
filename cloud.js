/**
 * cloud.js – login e salvataggio online su Firebase (Authentication + Cloud Firestore)
 * © 2026 Angelo Alaia – Tutti i diritti riservati
 *
 * Come sono salvati i dati: ogni archivio (libri, soci, prestiti, club, registro) è un unico
 * documento della raccolta "biblioteca", diviso in più parti solo se diventa molto grande.
 * Così aprire una pagina costa poche letture e si resta ampiamente nel piano gratuito.
 *
 * Più dispositivi insieme: ogni archivio ha un numero di revisione. Se al momento di salvare
 * l'archivio online è cambiato (un altro dispositivo ha salvato nel frattempo), le due versioni
 * vengono unite elemento per elemento (libro per libro, socio per socio) invece di sovrascriversi.
 *
 * Senza connessione: le modifiche restano in una "cassetta d'uscita" su questo dispositivo
 * (anche chiudendo la pagina) e vengono unite e inviate appena torna la connessione.
 */
(function () {
  const cfg = window.FG_CLOUD || {};
  const enabled = !!(cfg.apiKey && cfg.projectId && window.firebase);
  const COL = 'biblioteca';
  const CHUNK = 250000; // caratteri per parte: resta sotto il limite di 1 MB per documento anche con caratteri accentati
  const OUTBOX = 'fg_cloud_outbox_' + (cfg.projectId || '') + '_';
  const TAB = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); // ogni scheda ha la sua cassetta d'uscita

  const Cloud = { enabled, user: null };
  let db = null;
  let mem = {};    // dati come li vede questo dispositivo
  let base = {};   // ultima versione confermata dal server (per capire cosa è cambiato qui)
  let rev = {};    // numero di revisione del server per ogni archivio
  let parts = {};  // numero di parti salvate per ogni archivio
  const dirty = new Set(), inflight = new Set();
  let scheduled = null, committing = null, retryTimer = null, offlineWarned = false, deniedWarned = false;

  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const msg = (err) => {
    const c = (err && err.code) || '';
    if (c.includes('permission-denied')) return 'Accesso al database negato: controlla le regole di sicurezza e l’email autorizzata.';
    if (c.includes('resource-exhausted')) return 'Raggiunto il limite gratuito di oggi del database. Riprova domani.';
    if (c.includes('unavailable') || c.includes('deadline')) return 'Database non raggiungibile: controlla la connessione.';
    return 'Errore del database: riprova tra poco.';
  };
  const offlineError = (err) => !navigator.onLine || /unavailable|deadline|network|offline/i.test(String((err && (err.code || err.message)) || ''));

  /* ---------- Unione di due versioni (base = versione comune di partenza) ----------
     ctx.renames raccoglie i codici rinominati quando due dispositivi hanno creato
     elementi diversi con lo stesso codice (es. due libri nuovi entrambi FG-L-017). */
  const J = (x) => JSON.stringify(x);
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const idNumber = (id) => { const m = String(id || '').match(/-(\d+)(?:-[A-Z0-9]{3,4})?$/); return m ? parseInt(m[1], 10) : 0; };
  function mergeValue(b, l, r, ctx) {
    if (J(l) === J(b)) return r;          // qui non è cambiato: vale il server
    if (J(r) === J(b)) return l;          // sul server non è cambiato: vale questo dispositivo
    if (J(l) === J(r)) return l;
    if (typeof l === 'number' && typeof r === 'number') return Math.max(l, r); // es. contatori degli ID
    if (Array.isArray(l) && Array.isArray(r)) return mergeArray(Array.isArray(b) ? b : [], l, r, ctx);
    if (isObj(l) && isObj(r)) {
      const bo = isObj(b) ? b : {}, out = {};
      new Set([...Object.keys(bo), ...Object.keys(l), ...Object.keys(r)]).forEach((k) => {
        const inL = k in l, inR = k in r, inB = k in bo;
        if (!inL && inB && J(r[k]) === J(bo[k])) return;       // cancellato qui
        if (!inR && inB && J(l[k]) === J(bo[k])) return;       // cancellato sul server
        const v = mergeValue(bo[k], inL ? l[k] : r[k], inR ? r[k] : l[k], ctx);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    return l; // conflitto sullo stesso campo: vince la modifica di questo dispositivo
  }
  function mergeArray(b, l, r, ctx) {
    const hasIds = (a) => a.every((x) => isObj(x) && x.id != null);
    if (!hasIds(l) || !hasIds(r) || !hasIds(b)) return J(l) === J(b) ? r : l;
    const B = new Map(b.map((x) => [x.id, x])), L = new Map(l.map((x) => [x.id, x]));
    const out = new Map(r.map((x) => [x.id, x]));
    B.forEach((_, id) => { if (!L.has(id)) out.delete(id); });            // eliminati qui
    let maxN = Math.max(0, ...r.map((x) => idNumber(x.id)), ...l.map((x) => idNumber(x.id)));
    const added = [];
    l.forEach((x) => {
      const bx = B.get(x.id);
      if (bx && J(bx) === J(x)) return;                                    // non toccato qui
      if (!bx && out.has(x.id) && J(out.get(x.id)) !== J(x)) {
        /* stesso codice creato su due dispositivi: quello di questo dispositivo prende un codice nuovo */
        const m = String(x.id).match(/^(.*-)(\d+)((?:-[A-Z0-9]{3,4})?)$/);
        if (m) {
          const nid = m[1] + String(++maxN).padStart(m[2].length, '0') + m[3];
          if (ctx) ctx.renames[x.id] = nid;
          added.push({ ...x, id: nid });
          return;
        }
      }
      if (out.has(x.id)) out.set(x.id, mergeValue(bx || {}, x, out.get(x.id), ctx));
      else added.push(x);                                                  // aggiunto qui (o modificato qui ed eliminato altrove)
    });
    return [...added, ...out.values()];
  }
  /* Aggiorna i riferimenti ai codici rinominati negli elementi nuovi o modificati di questo dispositivo */
  const REF_FIELDS = ['libroId', 'iscrittoId', 'clubId', 'entityId'];
  function applyRenames(baseS, localS, renames) {
    if (!Object.keys(renames).length) return localS;
    try {
      const l = JSON.parse(localS); if (!Array.isArray(l)) return localS;
      const B = new Map(((baseS && JSON.parse(baseS)) || []).filter(isObj).map((x) => [x.id, J(x)]));
      let changed = false;
      const out = l.map((x) => {
        if (!isObj(x) || B.get(x.id) === J(x)) return x;
        const y = { ...x };
        REF_FIELDS.forEach((f) => { if (renames[y[f]]) { y[f] = renames[y[f]]; changed = true; } });
        if (Array.isArray(y.clubIds)) y.clubIds = y.clubIds.map((c) => { if (renames[c]) { changed = true; return renames[c]; } return c; });
        return y;
      });
      return changed ? J(out) : localS;
    } catch { return localS; }
  }
  function merge3(baseS, localS, remoteS, ctx) {
    try {
      const b = baseS == null ? null : JSON.parse(baseS), l = JSON.parse(localS), r = JSON.parse(remoteS);
      return J(mergeValue(b, l, r, ctx));
    } catch { return localS; }
  }
  Cloud._merge3 = (b, l, r) => merge3(b, l, r, { renames: {} }); // per i test

  /* ---------- Cassetta d'uscita (modifiche non ancora salvate online) ----------
     Ogni scheda scrive la propria; all'avvio si raccolgono anche quelle lasciate da altre schede chiuse. */
  function saveOutbox() {
    try {
      const keys = new Set([...dirty, ...inflight]);
      if (!keys.size) { localStorage.removeItem(OUTBOX + TAB); return; }
      const o = {}; keys.forEach((k) => { o[k] = { local: mem[k], base: base[k] ?? null }; });
      localStorage.setItem(OUTBOX + TAB, JSON.stringify({ uid: Cloud.user && Cloud.user.uid, at: Date.now(), keys: o }));
    } catch { /* spazio pieno o non disponibile: si continua */ }
  }
  function loadOutbox() {
    let n = 0;
    try {
      const found = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(OUTBOX) && k !== OUTBOX + TAB) found.push(k); }
      found.forEach((key) => {
        let o = null; try { o = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
        if (o && o.keys && !(Cloud.user && o.uid && o.uid !== Cloud.user.uid)) {
          Object.entries(o.keys).forEach(([k, v]) => {
            if (typeof v.local !== 'string') return;
            mem[k] = mem[k] == null ? v.local : merge3(v.base, v.local, mem[k], { renames: {} });
            dirty.add(k); n++;
          });
        }
        localStorage.removeItem(key);
      });
      if (n) saveOutbox(); // da ora queste modifiche sono nella cassetta di questa scheda
    } catch { /* localStorage non disponibile */ }
    return n;
  }

  Cloud.init = () => {
    if (!enabled) return null;
    if (!firebase.apps.length) firebase.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId });
    return firebase.auth();
  };
  Cloud.currentUser = () => new Promise((res) => { const off = firebase.auth().onAuthStateChanged((u) => { off(); res(u); }); });
  /* emailAutorizzata: una email o un elenco di email, in chiaro oppure come impronta SHA-256 */
  async function sha256(t) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  Cloud.allowed = async (u) => {
    if (!u) return false;
    /* una o più email (elenco), ognuna in chiaro oppure come impronta SHA-256 (64 caratteri esadecimali) */
    const list = (Array.isArray(cfg.emailAutorizzata) ? cfg.emailAutorizzata : [cfg.emailAutorizzata])
      .map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
    if (!list.length) return true;
    const email = String(u.email || '').trim().toLowerCase();
    if (list.includes(email)) return true;
    let h = ''; try { h = await sha256(email); } catch { return false; }
    return list.includes(h);
  };
  Cloud.signOut = async () => {
    await Cloud.flush();
    if (dirty.size || inflight.size) {
      if (!confirm('Alcune modifiche non sono ancora salvate online (connessione assente). Se esci adesso resteranno su questo dispositivo e verranno inviate al prossimo accesso. Uscire comunque?')) return;
    }
    await firebase.auth().signOut(); location.replace('login.html');
  };
  Cloud.pending = () => dirty.size + inflight.size;
  /* Sigla di questo dispositivo, usata nei codici creati senza connessione */
  let deviceTag = '';
  try { deviceTag = localStorage.getItem('fg_device_tag') || ''; if (!/^[A-Z0-9]{3}$/.test(deviceTag)) { deviceTag = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, 'X'); localStorage.setItem('fg_device_tag', deviceTag); } } catch { deviceTag = 'DEV'; }
  Cloud.idSuffix = () => (navigator.onLine && !offlineWarned ? '' : '-' + deviceTag);

  /* Ricompone gli archivi dai documenti (solo quelli completi) */
  function assemble(docs) {
    const g = {};
    docs.forEach((d) => {
      if (!d || typeof d.k !== 'string') return;
      const e = (g[d.k] = g[d.k] || { n: d.n, c: [], rev: 0 });
      e.c[d.i] = d.json; e.n = Math.max(e.n, d.n);
      if (d.i === 0) e.rev = d.rev || 0;
    });
    const out = {}, p = {}, rv = {};
    Object.entries(g).forEach(([k, v]) => {
      p[k] = v.c.length; rv[k] = v.rev;
      const c = v.c.slice(0, v.n);
      if (c.length === v.n && c.every((x) => typeof x === 'string')) out[k] = c.join('');
    });
    return { mem: out, parts: p, rev: rv };
  }

  /* Avvio: verifica il login, poi scarica i dati e resta in ascolto delle modifiche dagli altri dispositivi */
  Cloud.start = async () => {
    Cloud.init();
    const u = await Cloud.currentUser();
    if (!(await Cloud.allowed(u))) {
      if (u) await firebase.auth().signOut();
      const here = (location.pathname.split('/').pop() || 'index.html') + location.search;
      window.__noVT = true; // reindirizzamento immediato: niente passaggio animato
      location.replace('login.html?next=' + encodeURIComponent(here) + (u ? '&negato=1' : ''));
      return new Promise(() => {}); // la pagina viene sostituita dal login
    }
    Cloud.user = u;
    db = firebase.firestore();
    try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* già attiva o non supportata: si continua senza cache */ }

    return new Promise((resolve, reject) => {
      let started = false;
      const begin = (snap, fromServer) => {
        const a = assemble(snap.docs.map((d) => d.data()));
        mem = { ...a.mem }; base = { ...a.mem }; rev = a.rev; parts = a.parts; started = true;
        const n = loadOutbox();
        if (n) { emit('fg:info', 'Invio delle modifiche rimaste in sospeso su questo dispositivo…'); schedule(); }
        resolve({ fromServer });
      };
      /* Se il server non risponde, si usano i dati già salvati su questo dispositivo (se ci sono) */
      let lastCache = null;
      const timer = setTimeout(() => {
        if (started) return;
        if (lastCache && !lastCache.empty) begin(lastCache, false);
        else reject(new Error('Il database online non risponde. Controlla la connessione e riprova.'));
      }, 12000);

      db.collection(COL).onSnapshot({ includeMetadataChanges: true }, (snap) => {
        if (!started) {
          if (snap.metadata.fromCache) { lastCache = snap; if (!snap.empty) { clearTimeout(timer); begin(snap, false); } return; } /* dati già sul dispositivo: si parte subito */
          clearTimeout(timer); begin(snap, true); return;
        }
        if (snap.metadata.fromCache) return; // solo dati confermati dal server
        const a = assemble(snap.docs.map((d) => d.data()));
        let changed = false;
        Object.keys(a.mem).forEach((k) => {
          if ((a.rev[k] || 0) <= (rev[k] || 0) && a.mem[k] === base[k]) return; // niente di nuovo
          if (dirty.has(k) || inflight.has(k)) return; // modifiche locali in corso: verranno unite al salvataggio
          rev[k] = a.rev[k] || 0; parts[k] = a.parts[k];
          if (a.mem[k] !== mem[k]) { mem[k] = a.mem[k]; changed = true; }
          base[k] = a.mem[k];
        });
        if (changed) emit('fg:remote');
      }, (err) => { clearTimeout(timer); if (!started) reject(new Error(msg(err))); else emit('fg:error', msg(err)); });
    });
  };

  /* ---------- Salvataggio ----------
     Le modifiche fatte da una stessa operazione (es. prestito = libri + prestiti + registro)
     vengono raccolte e inviate insieme in un'unica transazione. */
  const ref = (k, i) => db.collection(COL).doc(`${k}_${i}`);
  const split = (s) => { const c = []; for (let i = 0; i < s.length; i += CHUNK) c.push(s.slice(i, i + CHUNK)); return c.length ? c : ['']; };

  function schedule(delay = 0) {
    if (scheduled) return;
    scheduled = (delay ? new Promise((r) => setTimeout(r, delay)) : Promise.resolve()).then(() => { scheduled = null; return commit(); });
  }

  async function commit() {
    if (committing) { await committing; return dirty.size ? commit() : undefined; }
    /* prima gli archivi che vengono richiamati dagli altri (club, libri, soci), poi prestiti e registro */
    const ORDER = ['meta', 'circoli', 'generi', 'libri', 'iscritti', 'prestiti', 'logs'];
    const rank = (k) => { const i = ORDER.findIndex((o) => k.includes('_' + o + '_')); return i < 0 ? 99 : i; };
    const keys = [...dirty].sort((a, b) => rank(a) - rank(b));
    if (!keys.length) return;
    dirty.clear(); keys.forEach((k) => inflight.add(k));
    const sent = Object.fromEntries(keys.map((k) => [k, mem[k] || '']));
    saveOutbox();

    committing = (async () => {
      try {
        const res = await db.runTransaction(async (tx) => {
          const heads = [];
          for (const k of keys) heads.push(await tx.get(ref(k, 0)));
          const out = {}, ctx = { renames: {} };
          for (let j = 0; j < keys.length; j++) {
            const k = keys[j], hd = heads[j].exists ? heads[j].data() : null;
            const srvRev = hd ? hd.rev || 0 : 0, srvN = hd ? hd.n || 1 : 0;
            const local = applyRenames(base[k] ?? null, sent[k], ctx.renames);
            let s = local, merged = local !== sent[k];
            if (hd && srvRev !== (rev[k] || 0)) {
              /* qualcun altro ha salvato nel frattempo: si legge la sua versione e si uniscono */
              const chunks = [hd.json];
              for (let i = 1; i < srvN; i++) { const d = await tx.get(ref(k, i)); chunks.push(d.exists ? d.data().json : ''); }
              s = merge3(base[k] ?? null, local, chunks.join(''), ctx);
              merged = true;
            }
            out[k] = { s, rev: srvRev + 1, oldN: Math.max(srvN, parts[k] || 0), merged };
          }
          out.__renames = ctx.renames;
          for (const k of keys) {
            const o = out[k], c = split(o.s);
            c.forEach((json, i) => tx.set(ref(k, i), { k, i, n: c.length, json, rev: o.rev, aggiornato: firebase.firestore.FieldValue.serverTimestamp() }));
            for (let i = c.length; i < o.oldN; i++) tx.delete(ref(k, i));
            o.n = c.length;
          }
          return out;
        });
        let refresh = false;
        const ren = res.__renames || {};
        if (Object.keys(ren).length) emit('fg:info', `Un altro dispositivo aveva creato lo stesso codice: ${Object.entries(ren).map(([a, b]) => a + ' → ' + b).join(', ')}.`);
        keys.forEach((k) => {
          const o = res[k];
          base[k] = o.s; rev[k] = o.rev; parts[k] = o.n;
          if (o.merged) {
            /* se nel frattempo ci sono state altre modifiche qui, si tengono anche quelle */
            mem[k] = mem[k] === sent[k] ? o.s : merge3(sent[k], mem[k], o.s);
            if (mem[k] !== o.s) dirty.add(k);
            refresh = true;
          }
        });
        offlineWarned = false; deniedWarned = false;
        clearTimeout(retryTimer); retryTimer = null;
        if (refresh) emit('fg:remote');
      } catch (err) {
        keys.forEach((k) => dirty.add(k));
        if (offlineError(err)) {
          if (!offlineWarned) { offlineWarned = true; emit('fg:error', 'Connessione assente: le modifiche restano su questo dispositivo e verranno salvate appena torni online.'); }
        } else if (String(err && err.code).includes('permission-denied')) {
          if (!deniedWarned) { deniedWarned = true; emit('fg:error', msg(err)); }
          return; // riprovare non serve: si riproverà alla prossima modifica
        } else {
          emit('fg:error', msg(err));
        }
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => schedule(), navigator.onLine ? 5000 : 30000);
      } finally {
        keys.forEach((k) => inflight.delete(k));
        saveOutbox();
        committing = null;
      }
    })();
    await committing;
    if (dirty.size && !retryTimer) schedule();
  }

  /* Attende che tutte le modifiche siano state inviate (o che l'invio fallisca) */
  Cloud.flush = async () => {
    for (let i = 0; i < 5; i++) {
      if (scheduled) await scheduled;
      if (committing) await committing;
      if (!scheduled && !committing) break;
    }
  };

  window.addEventListener('online', () => { clearTimeout(retryTimer); retryTimer = null; if (dirty.size) schedule(); });

  /* Interfaccia usata da state.js al posto di localStorage */
  Cloud.backend = {
    get: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    set: (k, s) => {
      if (mem[k] === s) return;
      mem[k] = s; dirty.add(k);
      saveOutbox();
      schedule();
    },
    flush: () => Cloud.flush()
  };

  /* Avvisa se si chiude la pagina mentre ci sono modifiche non ancora salvate online */
  window.addEventListener('beforeunload', (e) => { if (dirty.size || inflight.size) { e.preventDefault(); e.returnValue = ''; } });

  window.Cloud = Cloud;
})();
