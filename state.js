/**
 * state.js – dati, regole di business e persistenza (localStorage)
 * © 2026 Angelo Alaia – Tutti i diritti riservati
 */

const FG = {
  nome: 'Fondazione Grimaldi',
  sede: 'Polo Barra',
  indirizzo: 'Barra, Napoli',
  orari: 'dal lunedì al venerdì, 09:30–13:00 e 15:30–18:30',
  telefono: '081 186 57 111',
  prefissoTel: '39',
  giorniPrestito: 30,
  giorniRinnovo: 14,
  sogliaScadenza: 5,
  /* Colori disponibili per i club (hex a 6 cifre) */
  coloriClub: ['#E07A1F', '#2B8AD8', '#6C4BD6', '#0E8F9B', '#148A5B', '#D63D49', '#B7791F', '#06386B'],
  /* Club iniziali: [nome, età minima, età massima (null = adulti), colore, descrizione] */
  clubIniziali: [
    ['Mini club', 9, 11, '#E07A1F', 'Primi incontri di lettura condivisa e laboratori creativi.'],
    ['Club', 12, 14, '#2B8AD8', 'Letture e discussioni per i ragazzi delle medie.'],
    ['Club Grandi', 15, 18, '#6C4BD6', 'Romanzi, saggi e dibattiti per i ragazzi delle superiori.'],
    ['Genitori', null, null, '#0E8F9B', 'Percorsi di lettura e formazione per mamme e papà.']
  ],
  /* Colori disponibili per i generi (hex a 6 cifre) */
  coloriGeneri: ['#7C5CFF', '#2A72F0', '#F59E0B', '#0FA9B5', '#E5484D', '#12A46B', '#C2570C', '#5B6B8C', '#D6409F', '#4F5BD5'],
  /* I colori dei generi scelti con la grafica precedente vengono mostrati con la tinta corrispondente, più viva.
     È solo una conversione a schermo: nell'archivio non viene modificato nulla. */
  ritinta: { '#5b3a8c': '#7C5CFF', '#1d5fb8': '#2A72F0', '#b7791f': '#F59E0B', '#0e7c86': '#0FA9B5', '#8c2f39': '#E5484D', '#2f6b3f': '#12A46B', '#6b4e2e': '#C2570C', '#3e4a61': '#5B6B8C', '#a0526d': '#D6409F', '#4f5b93': '#4F5BD5' },
  /* Generi proposti al primo avvio (si possono rinominare o eliminare dal Catalogo) */
  generi: {
    'Spiritualità & Valori': '#7C5CFF',
    'Educazione & Famiglia': '#2A72F0',
    'Fiabe & Crescita': '#F59E0B',
    'Marineria & Territorio': '#0FA9B5'
  }
};

/* Date: sempre in fuso locale (new Date('YYYY-MM-DD') sarebbe UTC) */
const D = {
  parse(s) { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); },
  iso(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; },
  today() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; },
  add(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
  diff(a, b) { return Math.round((a - b) / 86400000); },
  fmt(s) { const d = D.parse(s); return d ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; },
  fmtLong(s) { const d = D.parse(s); return d ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; },
  /* Settimane da lunedì a domenica */
  weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; },
  isoWeek(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return { week: Math.ceil(((x - y0) / 86400000 + 1) / 7), year: x.getUTCFullYear() };
  },
  fmtRange(a, b) {
    const da = D.parse(a), db = D.parse(b); if (!da || !db) return '';
    const sameY = da.getFullYear() === db.getFullYear(), sameM = sameY && da.getMonth() === db.getMonth();
    const f = (d, o) => d.toLocaleDateString('it-IT', o);
    if (sameM) return `${da.getDate()}–${f(db, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    if (sameY) return `${f(da, { day: 'numeric', month: 'long' })} – ${f(db, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    return `${f(da, { day: 'numeric', month: 'long', year: 'numeric' })} – ${f(db, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
};

const escapeHTML = (str) => {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

const KEYS = {
  BOOKS: 'fg_biblio_libri_v3', MEMBERS: 'fg_biblio_iscritti_v3', LOANS: 'fg_biblio_prestiti_v3',
  CLUBS: 'fg_biblio_circoli_v3', LOGS: 'fg_biblio_logs_v3', META: 'fg_biblio_meta_v3',
  GENRES: 'fg_biblio_generi_v3'
};

/* Dove vengono letti e scritti i dati: localStorage (modalità locale) oppure Firebase (cloud.js) */
const LocalBackend = { get: (k) => localStorage.getItem(k), set: (k, s) => localStorage.setItem(k, s), flush: () => Promise.resolve() };

class BiblioStore {
  /* opts.cloud: dati online; opts.canSeed: il server ha confermato che l'archivio è davvero vuoto */
  constructor(backend = LocalBackend, opts = {}) {
    this.b = backend; this.cloud = !!opts.cloud;
    if (!this.b.get(KEYS.BOOKS)) {
      if (!this.cloud) this.resetDemo();
      else if (opts.canSeed) this.resetEmpty();
      else throw new Error('Non riesco a scaricare i dati online. Controlla la connessione e ricarica la pagina.');
    } else this._migrate();
    this._syncGenres();
    this._ensureCatalog();
    this._ensureSnapshots();
  }
  flush() { return this.b.flush(); }

  /* Conversione dei dati delle versioni precedenti (club come testo, fasciaEta sui libri) */
  _migrate() {
    const meta = this._read(KEYS.META, { seq: {} });
    if ((meta.schema || 0) >= 4) return;
    const pad = n => String(n).padStart(3, '0');
    let seq = meta.seq.club || 0;
    const clubs = this.getClubs().map(c => ({ etaMin: null, etaMax: null, colore: FG.coloriClub[0], descrizione: '', ...c }));
    clubs.forEach(c => { const n = parseInt((String(c.id).match(/(\d+)$/) || [0, 0])[1], 10); if (n > seq) seq = n; });
    const byName = (n) => clubs.find(c => c.nome.toLowerCase() === String(n || '').trim().toLowerCase());
    FG.clubIniziali.forEach(([nome, etaMin, etaMax, colore, descrizione]) => {
      if (!byName(nome)) clubs.push({ id: `CLUB-${pad(++seq)}`, nome, etaMin, etaMax, colore, descrizione });
    });
    const ensure = (nome) => {
      if (!nome || /^(libero|nessuno?)$/i.test(nome.trim())) return null;
      let c = byName(nome);
      if (!c) { c = { id: `CLUB-${pad(++seq)}`, nome: nome.trim(), etaMin: null, etaMax: null, colore: FG.coloriClub[seq % FG.coloriClub.length], descrizione: '' }; clubs.push(c); }
      return c.id;
    };
    /* vecchie fasce d'età dei libri -> club con la fascia corrispondente */
    const fasciaToClubs = (f) => {
      if (!f) return [];
      if (/adult/i.test(f)) return clubs.filter(c => c.etaMin === null && c.etaMax === null && byName('Genitori') === c).map(c => c.id);
      const [a, b] = String(f).split('-').map(Number);
      return clubs.filter(c => c.etaMin !== null && c.etaMax !== null && c.etaMin <= b && c.etaMax >= a).map(c => c.id);
    };
    const books = this.getBooks().map(b => {
      if (Array.isArray(b.clubIds)) return b;
      const ids = new Set([...fasciaToClubs(b.fasciaEta)]);
      const old = ensure(b.club); if (old) ids.add(old);
      const { club, fasciaEta, ...rest } = b;
      return { ...rest, clubIds: [...ids] };
    });
    const members = this.getMembers().map(m => {
      if ('clubId' in m) return m;
      const { club, ...rest } = m;
      return { dataNascita: '', ...rest, clubId: ensure(club) };
    });
    this._save(KEYS.CLUBS, clubs); this._save(KEYS.BOOKS, books); this._save(KEYS.MEMBERS, members);
    meta.seq.club = seq; meta.schema = 4; this._save(KEYS.META, meta);
  }

  /* ---------- Persistenza ---------- */
  _read(k, def = []) { try { const v = JSON.parse(this.b.get(k)); return v ?? def; } catch { return def; } }
  _save(k, v) { this.b.set(k, JSON.stringify(v)); }

  getBooks() { return this._read(KEYS.BOOKS); }
  getMembers() { return this._read(KEYS.MEMBERS); }
  getLoans() { return this._read(KEYS.LOANS); }
  getClubs() { return this._read(KEYS.CLUBS).map(c => ({ ...c, colore: /^#[0-9a-f]{6}$/i.test(c.colore) ? c.colore : FG.coloriClub[0] })); }
  getLogs() { return this._read(KEYS.LOGS); }

  /* ID progressivi persistenti: non si riusano mai, anche dopo un'eliminazione */
  _nextId(type) {
    const meta = this._read(KEYS.META, { seq: {} });
    meta.seq = meta.seq || {};
    /* si parte dal numero più alto già usato, così non si ripete mai un codice */
    const list = { book: KEYS.BOOKS, member: KEYS.MEMBERS, club: KEYS.CLUBS, loan: KEYS.LOANS }[type];
    const maxUsed = this._read(list).reduce((m, x) => Math.max(m, BiblioStore.idNumber(x.id)), 0);
    meta.seq[type] = Math.max(meta.seq[type] || 0, maxUsed) + 1;
    this._save(KEYS.META, meta);
    const n = String(meta.seq[type]).padStart(3, '0');
    /* online ma senza connessione: si aggiunge la sigla del dispositivo per non coincidere con codici creati altrove */
    const sfx = this.cloud && window.Cloud && window.Cloud.idSuffix ? window.Cloud.idSuffix() : '';
    return ({ book: `FG-L-${n}`, member: `FG-ISCR-${n}`, club: `CLUB-${n}` }[type] || `LOAN-${n}`) + sfx;
  }
  static idNumber(id) { const m = String(id || '').match(/-(\d+)(?:-[A-Z0-9]{3,4})?$/); return m ? parseInt(m[1], 10) : 0; }

  logActivity(type, message, entityId = null) {
    const logs = this.getLogs();
    logs.unshift({ id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toISOString(), type, message, entityId, operator: 'Admin' });
    this._save(KEYS.LOGS, logs.slice(0, 300));
  }

  /* ---------- Libri ---------- */
  addBook(data) {
    const r = this.addCopies(data, 1);
    return r.ok ? { ok: true, book: r.books[0], books: r.books } : r;
  }
  /* Aggiunge una o più copie dello stesso libro: ogni copia fisica riceve il proprio numero di catalogo.
     Un solo salvataggio e una sola riga nel registro, anche per molte copie. */
  addCopies(data, qty = 1) {
    if (!String(data.genere || '').trim()) return { ok: false, error: 'Indica il genere del volume.' };
    const n = Math.max(1, Math.min(BiblioStore.MAX_COPIE, parseInt(qty, 10) || 1));
    const books = this.getBooks();
    const { catalogo: _ignorato, ...dati } = data; /* il numero di catalogo lo assegna sempre il gestionale */
    const base = { isbn: '', scaffale: '', editore: '', anno: '', ...dati, ...this._bookExtras(dati), clubIds: this._validClubIds(dati.clubIds) };
    const made = [];
    for (let i = 0; i < n; i++) {
      const book = { ...base, clubIds: [...base.clubIds], id: this._nextId('book'), catalogo: this._nextCatalog(books), stato: 'Disponibile' };
      if (Array.isArray(base.soggetti)) book.soggetti = [...base.soggetti];
      books.unshift(book); made.push(book);
    }
    this._save(KEYS.BOOKS, books);
    const altre = this.copiesOfBook(made[0], books).length - n;
    this.logActivity('CREATE', n === 1
      ? `${altre > 0 ? 'Nuova copia in catalogo' : 'Nuovo volume in catalogo'}: ${made[0].titolo} (${made[0].catalogo})`
      : `${n} nuove copie in catalogo: ${made[0].titolo} (${made[0].catalogo} – ${made[n - 1].catalogo})`, made[0].id);
    return { ok: true, books: made, book: made[0] };
  }
  /* Cambia il genere (e gli argomenti trovati) di più volumi in un colpo solo: un solo salvataggio */
  bulkSetGenres(changes) {
    const books = this.getBooks(); let n = 0;
    changes.forEach((c) => {
      const b = books.find(x => x.id === c.id); if (!b || !String(c.genere || '').trim()) return;
      b.genere = String(c.genere).trim();
      if (Array.isArray(c.soggetti) && c.soggetti.length) b.soggetti = c.soggetti.slice(0, 12).map(x => String(x).slice(0, 80));
      if (c.dewey) b.dewey = String(c.dewey).slice(0, 80);
      n++;
    });
    if (!n) return { ok: false, error: 'Nessun volume da aggiornare.' };
    this._save(KEYS.BOOKS, books);
    this.logActivity('UPDATE', `Classificazione migliorata: ${n === 1 ? '1 volume' : n + ' volumi'}`, null);
    return { ok: true, n };
  }
  /* opts.allCopies: i campi cambiati in questa modifica vengono riportati anche sulle altre copie dello stesso titolo
     (i campi non toccati restano com'erano su ogni copia, ad esempio lo scaffale) */
  updateBook(id, patch, opts = {}) {
    const books = this.getBooks(); const b = books.find(x => x.id === id);
    if (!b) return { ok: false, error: 'Volume non trovato.' };
    if ('genere' in patch && !String(patch.genere || '').trim()) return { ok: false, error: 'Indica il genere del volume.' };
    const others = opts.allCopies ? this.copiesOfBook(b, books).filter(x => x.id !== b.id) : [];
    const before = JSON.parse(JSON.stringify(b));
    Object.assign(b, patch, this._bookExtras({ ...b, ...patch }), { id: b.id, stato: b.stato, catalogo: b.catalogo }); /* il numero di catalogo non cambia mai */
    if ('clubIds' in patch) b.clubIds = this._validClubIds(patch.clubIds);
    if (others.length) {
      const changed = Object.keys(b).filter(k => !['id', 'stato', 'catalogo'].includes(k) && JSON.stringify(b[k]) !== JSON.stringify(before[k]));
      others.forEach((o) => changed.forEach((k) => { o[k] = JSON.parse(JSON.stringify(b[k])); }));
    }
    this._save(KEYS.BOOKS, books);
    this.logActivity('UPDATE', others.length ? `Volume modificato: ${b.titolo} (tutte le ${others.length + 1} copie)` : `Volume modificato: ${b.titolo} (${b.catalogo})`, id);
    return { ok: true, copies: others.length + 1 };
  }
  /* Si elimina sempre e solo la copia scelta; le altre copie dello stesso titolo restano in catalogo */
  deleteBook(id) {
    const b = this.getBooks().find(x => x.id === id);
    if (!b) return { ok: false, error: 'Volume non trovato.' };
    if (b.stato === 'In Prestito') return { ok: false, error: `La copia ${b.catalogo} è in prestito: registra prima la restituzione.` };
    this._save(KEYS.BOOKS, this.getBooks().filter(x => x.id !== id));
    this.logActivity('DELETE', `Volume eliminato: ${b.titolo} (${b.catalogo})`, id);
    return { ok: true };
  }
  /* ---------- Numero di catalogo ----------
     Numerazione interna della Biblioteca Spes-F, una per ogni copia fisica (C-0001, C-0002…).
     I codici della versione precedente (CAT-0001) vengono convertiti in C-0001 mantenendo lo stesso numero.
     È indipendente dall'ISBN, assegnata in automatico, non cambia modificando il libro
     e non viene mai riutilizzata dopo un'eliminazione (il contatore in meta.seq.catalogo non scende). */
  static catNumber(s) { const m = String(s || '').trim().match(/^(?:C(?:AT)?[-\s]?)?0*(\d{1,6})$/i); return m ? parseInt(m[1], 10) : 0; }
  static catCode(n) { return 'C-' + String(n).padStart(4, '0'); }
  /* true se il testo ha la forma di un numero di catalogo con prefisso (C-0012, c12, CAT-0012) */
  static isCatCode(s) { return /^C(?:AT)?[-\s]?\d{1,6}$/i.test(String(s || '').trim()); }
  _maxCatalog(books) { return books.reduce((m, b) => Math.max(m, BiblioStore.catNumber(b.catalogo)), 0); }
  _nextCatalog(books) {
    const meta = this._read(KEYS.META, { seq: {} }); meta.seq = meta.seq || {};
    meta.seq.catalogo = Math.max(meta.seq.catalogo || 0, this._maxCatalog(books || this.getBooks())) + 1;
    this._save(KEYS.META, meta);
    return BiblioStore.catCode(meta.seq.catalogo);
  }
  /* Migrazione e controllo: ogni copia senza numero lo riceve, in ordine di inserimento;
     se due copie avessero lo stesso numero (due dispositivi nello stesso istante), lo tiene la copia
     inserita per prima e l'altra ne riceve uno nuovo. La regola è identica su ogni dispositivo. */
  _ensureCatalog() {
    const books = this.getBooks(); if (!books.length) return false;
    const meta = this._read(KEYS.META, { seq: {} }); meta.seq = meta.seq || {};
    let max = Math.max(meta.seq.catalogo || 0, this._maxCatalog(books));
    const order = [...books].sort((a, b) => BiblioStore.idNumber(a.id) - BiblioStore.idNumber(b.id) || String(a.id).localeCompare(String(b.id)));
    const seen = new Set(); let changed = false;
    order.forEach((b) => {
      const n = BiblioStore.catNumber(b.catalogo);
      const code = !n || seen.has(n) ? BiblioStore.catCode(++max) : BiblioStore.catCode(n);
      seen.add(BiblioStore.catNumber(code));
      if (b.catalogo !== code) { b.catalogo = code; changed = true; }
    });
    if (changed) this._save(KEYS.BOOKS, books);
    if ((meta.seq.catalogo || 0) < max) { meta.seq.catalogo = max; this._save(KEYS.META, meta); }
    return changed;
  }
  /* Migrazione dello storico: i prestiti registrati prima di questa versione ricevono la "fotografia"
     ricostruita dai dati attuali (snap.ricostruita = true). Il risultato è identico su ogni dispositivo. */
  _ensureSnapshots() {
    const loans = this.getLoans();
    /* codici del vecchio formato nelle fotografie: CAT-0012 → C-0012 (stesso numero) */
    let fixed = false;
    loans.forEach((l) => { if (l.snap && /^CAT-/i.test(l.snap.catalogo || '')) { l.snap.catalogo = BiblioStore.catCode(BiblioStore.catNumber(l.snap.catalogo)); fixed = true; } });
    if (!loans.some(l => !l.snap)) { if (fixed) this._save(KEYS.LOANS, loans); return fixed; }
    const books = new Map(this.getBooks().map(b => [b.id, b])), members = new Map(this.getMembers().map(m => [m.id, m]));
    const clubs = new Map(this.getClubs().map(c => [c.id, c]));
    loans.forEach((l) => {
      if (l.snap) return;
      const b = books.get(l.libroId), m = members.get(l.iscrittoId), c = m && m.clubId ? clubs.get(m.clubId) : null;
      l.snap = { titolo: b ? b.titolo || '' : '', autore: b ? b.autore || '' : '', catalogo: b ? b.catalogo || '' : '', isbn: b ? b.isbn || '' : '',
        socio: m ? `${m.nome || ''} ${m.cognome || ''}`.trim() : '', clubId: c ? c.id : null, clubNome: c ? c.nome : '', categoria: this.clubCategory(c), ricostruita: true };
    });
    this._save(KEYS.LOANS, loans);
    return true;
  }
  /* Prossimo numero che riceverà un nuovo volume (solo anteprima: non consuma il contatore) */
  peekCatalog() { const meta = this._read(KEYS.META, { seq: {} }); return BiblioStore.catCode(Math.max((meta.seq || {}).catalogo || 0, this._maxCatalog(this.getBooks())) + 1); }
  findByCatalog(code) { const n = BiblioStore.catNumber(code); return n ? this.getBooks().find(b => BiblioStore.catNumber(b.catalogo) === n) || null : null; }
  /* true se il testo cercato corrisponde al numero di catalogo (accetta "C-0012", "c12", "12" e il vecchio "CAT-0012") */
  matchCatalog(book, q) {
    const t = String(q || '').trim(); if (!t) return false;
    const n = BiblioStore.catNumber(t);
    if (n && /^(c(at)?[-\s]?)?\d+$/i.test(t)) return BiblioStore.catNumber(book.catalogo) === n;
    return String(book.catalogo || '').toLowerCase().includes(t.toLowerCase());
  }

  /* ISBN salvato senza trattini; copertina accettata solo se è un indirizzo https */
  _bookExtras(d) {
    const raw = String(d.isbn || '').toUpperCase().replace(/[^0-9X]/g, '');
    const isbn = (window.ISBN && window.ISBN.normalize(raw)) || raw;
    const copertina = /^https:\/\/[^\s"'<>]+$/i.test(String(d.copertina || '')) ? String(d.copertina) : '';
    const anno = (String(d.anno || '').match(/\d{4}/) || [''])[0];
    return { isbn, copertina, anno, editore: String(d.editore || '').trim() };
  }
  /* Tutte le copie con lo stesso ISBN (escluso eventualmente un volume) */
  copiesOf(isbn, exceptId = null) {
    const c = String(isbn || '').toUpperCase().replace(/[^0-9X]/g, '');
    if (!c) return [];
    const n = (window.ISBN && window.ISBN.normalize(c)) || c;
    return this.getBooks().filter(b => b.id !== exceptId && b.isbn && (b.isbn === n || b.isbn === c || (window.ISBN && window.ISBN.normalize(b.isbn) === n)));
  }
  /* ---------- Titoli e copie ----------
     Un "titolo" riunisce le copie fisiche dello stesso libro: stesso ISBN oppure, per i libri senza ISBN,
     stesso titolo e stesso autore. Ogni copia resta un volume a sé, con il suo numero di catalogo e il suo stato. */
  static _norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  static groupKey(b) {
    const raw = String((b && b.isbn) || '').toUpperCase().replace(/[^0-9X]/g, '');
    if (raw) return 'i:' + ((window.ISBN && window.ISBN.normalize(raw)) || raw);
    const t = BiblioStore._norm(b && b.titolo);
    return t ? `t:${t}|${BiblioStore._norm(b && b.autore)}` : 'v:' + (b && b.id);
  }
  /* Tutte le copie dello stesso titolo (compreso il volume indicato), in ordine di numero di catalogo */
  copiesOfBook(book, books = null) {
    if (!book) return [];
    const k = BiblioStore.groupKey(book);
    return (books || this.getBooks()).filter(x => BiblioStore.groupKey(x) === k).sort((a, b) => BiblioStore.catNumber(a.catalogo) - BiblioStore.catNumber(b.catalogo));
  }
  /* Elenco dei titoli: [{ key, first, copies[], total, available, onLoan }] nell'ordine del primo numero di catalogo */
  getTitles(books = null) {
    const map = new Map();
    [...(books || this.getBooks())].sort((a, b) => BiblioStore.catNumber(a.catalogo) - BiblioStore.catNumber(b.catalogo)).forEach((b) => {
      const k = BiblioStore.groupKey(b);
      if (!map.has(k)) map.set(k, { key: k, first: b, copies: [], total: 0, available: 0, onLoan: 0 });
      const g = map.get(k); g.copies.push(b); g.total++;
      if (b.stato === 'Disponibile') g.available++; else g.onLoan++;
    });
    return [...map.values()];
  }
  /* La copia da proporre per un prestito: la prima disponibile (numero di catalogo più basso) */
  freeCopyOf(book) { return this.copiesOfBook(book).find(x => x.stato === 'Disponibile') || null; }
  _setBookStatus(id, stato) {
    const books = this.getBooks(); const b = books.find(x => x.id === id);
    if (b) { b.stato = stato; this._save(KEYS.BOOKS, books); }
  }

  /* ---------- Generi ----------
     I libri indicano il genere per nome; l'archivio dei generi aggiunge il colore e l'elenco fisso.
     Il codice di un genere deriva dal nome (es. GEN-narrativa), così due dispositivi che creano
     lo stesso genere ottengono lo stesso elemento invece di un doppione. */
  static slug(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'genere'; }
  _genreHue(nome) { let h = 7; for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return FG.coloriGeneri[h % FG.coloriGeneri.length]; }
  getGenres() {
    return this._read(KEYS.GENRES).filter(g => g && g.nome)
      .map(g => ({ ...g, colore: /^#[0-9a-f]{6}$/i.test(g.colore) ? (FG.ritinta[g.colore.toLowerCase()] || g.colore) : this._genreHue(g.nome) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  }
  getGenre(id) { return this.getGenres().find(g => g.id === id) || null; }
  genreColor(nome) { const g = this.getGenres().find(x => x.nome === nome); return g ? g.colore : (nome ? this._genreHue(nome) : '#5B6B8C'); }
  genreCount(nome) { return this.getBooks().filter(b => b.genere === nome).length; }
  _newGenreId(nome, list) { const base = 'GEN-' + BiblioStore.slug(nome); let id = base, i = 2; while (list.some(g => g.id === id)) id = `${base}-${i++}`; return id; }
  /* Aggiunge all'archivio i generi usati dai libri ma non ancora presenti (dati vecchi o importati) */
  _syncGenres(seedDefaults = false) {
    const had = this.b.get(KEYS.GENRES) != null;
    const list = this._read(KEYS.GENRES).filter(g => g && g.nome);
    const names = new Set(list.map(g => g.nome.toLowerCase()));
    let changed = !had;
    const add = (nome, colore) => {
      const n = String(nome || '').trim(); if (!n || names.has(n.toLowerCase())) return;
      list.push({ id: this._newGenreId(n, list), nome: n, colore: colore || this._genreHue(n) }); names.add(n.toLowerCase()); changed = true;
    };
    if (!had || seedDefaults) Object.entries(FG.generi).forEach(([n, c]) => add(n, c));
    this.getBooks().forEach(b => add(b.genere));
    if (changed) this._save(KEYS.GENRES, list);
  }
  _checkGenre(nome, selfId) {
    const n = String(nome || '').trim();
    if (!n) return 'Scrivi il nome del genere.';
    if (n.length > 40) return 'Il nome del genere può avere al massimo 40 caratteri.';
    if (this.getGenres().some(g => g.id !== selfId && g.nome.toLowerCase() === n.toLowerCase())) return 'Esiste già un genere con questo nome.';
    return null;
  }
  addGenre({ nome, colore }) {
    const err = this._checkGenre(nome); if (err) return { ok: false, error: err };
    const list = this._read(KEYS.GENRES);
    const g = { id: this._newGenreId(nome, list), nome: String(nome).trim(), colore: FG.coloriGeneri.includes(colore) ? colore : this._genreHue(nome) };
    list.push(g); this._save(KEYS.GENRES, list);
    this.logActivity('CREATE', `Nuovo genere: ${g.nome}`, g.id);
    return { ok: true, genre: g };
  }
  updateGenre(id, { nome, colore }) {
    const list = this._read(KEYS.GENRES); const g = list.find(x => x.id === id);
    if (!g) return { ok: false, error: 'Genere non trovato.' };
    const err = this._checkGenre(nome, id); if (err) return { ok: false, error: err };
    const old = g.nome, nuovo = String(nome).trim();
    g.nome = nuovo; if (FG.coloriGeneri.includes(colore)) g.colore = colore;
    this._save(KEYS.GENRES, list);
    let moved = 0;
    if (old !== nuovo) {
      const books = this.getBooks().map(b => (b.genere === old ? (moved++, { ...b, genere: nuovo }) : b));
      if (moved) this._save(KEYS.BOOKS, books);
    }
    this.logActivity('UPDATE', old !== nuovo ? `Genere rinominato: ${old} → ${nuovo}` : `Genere modificato: ${nuovo}`, id);
    return { ok: true, moved };
  }
  /* Se il genere è usato, i volumi vanno spostati in un altro genere (replaceId) */
  deleteGenre(id, replaceId = null) {
    const g = this.getGenre(id); if (!g) return { ok: false, error: 'Genere non trovato.' };
    const used = this.genreCount(g.nome);
    let target = null;
    if (used) {
      target = replaceId && replaceId !== id ? this.getGenre(replaceId) : null;
      if (!target) return { ok: false, error: `${used === 1 ? '1 volume usa' : used + ' volumi usano'} questo genere: scegli in quale genere spostarli.`, inUse: used };
      this._save(KEYS.BOOKS, this.getBooks().map(b => (b.genere === g.nome ? { ...b, genere: target.nome } : b)));
    }
    this._save(KEYS.GENRES, this._read(KEYS.GENRES).filter(x => x.id !== id));
    this.logActivity('DELETE', target ? `Genere eliminato: ${g.nome} (volumi spostati in ${target.nome})` : `Genere eliminato: ${g.nome}`, id);
    return { ok: true, moved: used };
  }

  /* ---------- Club ---------- */
  getClub(id) { return this.getClubs().find(c => c.id === id) || null; }
  clubName(id) { const c = this.getClub(id); return c ? c.nome : 'Nessun club'; }
  /* Club ordinati: prima per età, i club per adulti in fondo */
  getClubsSorted() { return this.getClubs().sort((a, b) => (a.etaMin ?? 999) - (b.etaMin ?? 999) || a.nome.localeCompare(b.nome, 'it')); }
  clubEta(c) {
    if (!c) return '';
    if (c.etaMin != null && c.etaMax != null) return `${c.etaMin}–${c.etaMax} anni`;
    if (c.etaMin != null) return `dai ${c.etaMin} anni`;
    if (c.etaMax != null) return `fino a ${c.etaMax} anni`;
    return 'Adulti';
  }
  /* true = età compresa nella fascia del club; i club senza limiti accettano solo maggiorenni */
  ageFits(c, age) {
    if (!c || age == null) return true;
    if (c.etaMin == null && c.etaMax == null) return age >= 18;
    return (c.etaMin == null || age >= c.etaMin) && (c.etaMax == null || age <= c.etaMax);
  }
  suggestClub(age) { return age == null ? null : this.getClubsSorted().find(c => this.ageFits(c, age)) || null; }
  ageOf(dataNascita) {
    const d = D.parse(dataNascita); if (!d) return null;
    const t = D.today(); let a = t.getFullYear() - d.getFullYear();
    if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
    return a >= 0 && a < 130 ? a : null;
  }
  _validClubIds(ids) { const ok = new Set(this.getClubs().map(c => c.id)); return [...new Set(Array.isArray(ids) ? ids : [])].filter(id => ok.has(id)); }
  _checkClub(data, selfId) {
    const nome = String(data.nome || '').trim();
    if (!nome) return 'Indica il nome del club.';
    if (this.getClubs().some(c => c.id !== selfId && c.nome.toLowerCase() === nome.toLowerCase())) return 'Esiste già un club con questo nome.';
    const num = v => (v === '' || v == null ? null : Number(v));
    const min = num(data.etaMin), max = num(data.etaMax);
    if ([min, max].some(v => v !== null && (!Number.isInteger(v) || v < 0 || v > 120))) return 'Le età devono essere numeri interi tra 0 e 120.';
    if (min !== null && max !== null && min > max) return 'L’età minima non può superare la massima.';
    return null;
  }
  _clubData(data) {
    const num = v => (v === '' || v == null ? null : Number(v));
    return { nome: String(data.nome).trim(), etaMin: num(data.etaMin), etaMax: num(data.etaMax), descrizione: String(data.descrizione || '').trim(),
      colore: /^#[0-9a-f]{6}$/i.test(data.colore) ? data.colore : FG.coloriClub[0] };
  }
  addClub(data) {
    const err = this._checkClub(data); if (err) return { ok: false, error: err };
    const club = { id: this._nextId('club'), ...this._clubData(data) };
    const clubs = this.getClubs(); clubs.push(club); this._save(KEYS.CLUBS, clubs);
    this.logActivity('CREATE', `Nuovo club: ${club.nome} (${this.clubEta(club)})`, club.id);
    return { ok: true, club };
  }
  updateClub(id, data) {
    const clubs = this.getClubs(); const c = clubs.find(x => x.id === id);
    if (!c) return { ok: false, error: 'Club non trovato.' };
    const err = this._checkClub(data, id); if (err) return { ok: false, error: err };
    Object.assign(c, this._clubData(data)); this._save(KEYS.CLUBS, clubs);
    this.logActivity('UPDATE', `Club modificato: ${c.nome}`, id);
    return { ok: true };
  }
  deleteClub(id) {
    const c = this.getClub(id); if (!c) return { ok: false, error: 'Club non trovato.' };
    const n = this.getMembers().filter(m => m.clubId === id).length;
    if (n) return { ok: false, error: n === 1 ? 'Il club ha 1 iscritto: spostalo in un altro club prima di eliminarlo.' : `Il club ha ${n} iscritti: spostali in un altro club prima di eliminarlo.` };
    this._save(KEYS.BOOKS, this.getBooks().map(b => ({ ...b, clubIds: (b.clubIds || []).filter(x => x !== id) })));
    this._save(KEYS.CLUBS, this.getClubs().filter(x => x.id !== id));
    this.logActivity('DELETE', `Club eliminato: ${c.nome}`, id);
    return { ok: true };
  }

  /* ---------- Soci ---------- */
  addMember(data) {
    const m = { dataNascita: '', ...data, clubId: this.getClub(data.clubId) ? data.clubId : null, id: this._nextId('member'), dataIscrizione: D.iso(new Date()) };
    const members = this.getMembers(); members.unshift(m); this._save(KEYS.MEMBERS, members);
    this.logActivity('CREATE', `Nuovo iscritto: ${m.nome} ${m.cognome}`, m.id);
    return { ok: true, member: m };
  }
  updateMember(id, patch) {
    const members = this.getMembers(); const m = members.find(x => x.id === id);
    if (!m) return { ok: false, error: 'Iscritto non trovato.' };
    Object.assign(m, patch, { id: m.id });
    if ('clubId' in patch && !this.getClub(patch.clubId)) m.clubId = null;
    this._save(KEYS.MEMBERS, members);
    this.logActivity('UPDATE', `Scheda iscritto aggiornata: ${m.nome} ${m.cognome}`, id);
    return { ok: true };
  }
  deleteMember(id) {
    const m = this.getMembers().find(x => x.id === id);
    if (!m) return { ok: false, error: 'Iscritto non trovato.' };
    if (this.getLoans().some(l => l.iscrittoId === id && !l.dataRestituzione)) return { ok: false, error: 'Questo iscritto ha libri ancora in prestito.' };
    this._save(KEYS.MEMBERS, this.getMembers().filter(x => x.id !== id));
    this.logActivity('DELETE', `Iscritto eliminato: ${m.nome} ${m.cognome}`, id);
    return { ok: true };
  }

  /* ---------- Prestiti ---------- */
  addLoan({ libroId, iscrittoId, dataUscita, dataScadenza, note = '' }) {
    const book = this.getBooks().find(b => b.id === libroId);
    const member = this.getMembers().find(m => m.id === iscrittoId);
    if (!book) return { ok: false, error: 'Volume non trovato.' };
    if (book.stato !== 'Disponibile') return { ok: false, error: `La copia ${book.catalogo} non è disponibile: è già in prestito.` };
    if (!member) return { ok: false, error: 'Iscritto non trovato.' };
    if (!dataUscita || !dataScadenza || D.parse(dataScadenza) < D.parse(dataUscita)) return { ok: false, error: 'La scadenza deve essere successiva al ritiro.' };
    const club = this.getClub(member.clubId);
    /* "snap" conserva chi ha preso quale copia e in quale club era in quel momento:
       il riepilogo settimanale resta corretto anche se poi libro, socio o club cambiano */
    const loan = { id: this._nextId('loan'), libroId, iscrittoId, dataUscita, dataScadenza, dataRestituzione: null, note,
      registratoIl: new Date().toISOString(),
      snap: { titolo: book.titolo || '', autore: book.autore || '', catalogo: book.catalogo || '', isbn: book.isbn || '',
        socio: `${member.nome || ''} ${member.cognome || ''}`.trim(), clubId: club ? club.id : null, clubNome: club ? club.nome : '', categoria: this.clubCategory(club) } };
    const loans = this.getLoans(); loans.unshift(loan); this._save(KEYS.LOANS, loans);
    this._setBookStatus(libroId, 'In Prestito');
    this.logActivity('UPDATE', `“${book.titolo}” (${book.catalogo}) assegnato a ${member.nome} ${member.cognome}`, loan.id);
    return { ok: true, loan };
  }
  returnLoan(loanId) {
    const loans = this.getLoans(); const loan = loans.find(l => l.id === loanId);
    if (!loan || loan.dataRestituzione) return { ok: false, error: 'Prestito non trovato o già chiuso.' };
    loan.dataRestituzione = D.iso(new Date());
    loan.rientroRegistratoIl = new Date().toISOString();
    this._save(KEYS.LOANS, loans);
    this._setBookStatus(loan.libroId, 'Disponibile');
    const b = this.getBooks().find(x => x.id === loan.libroId);
    this.logActivity('UPDATE', `Restituito: ${b ? b.titolo : loan.libroId}`, loan.libroId);
    return { ok: true, titolo: b ? b.titolo : '', catalogo: b ? b.catalogo || '' : '' };
  }
  renewLoan(loanId) {
    const loans = this.getLoans(); const loan = loans.find(l => l.id === loanId);
    if (!loan || loan.dataRestituzione) return { ok: false, error: 'Prestito non rinnovabile.' };
    const base = Math.max(D.parse(loan.dataScadenza), D.today());
    loan.dataScadenza = D.iso(D.add(base, FG.giorniRinnovo));
    this._save(KEYS.LOANS, loans);
    const b = this.getBooks().find(x => x.id === loan.libroId);
    this.logActivity('UPDATE', `Rinnovato fino al ${D.fmt(loan.dataScadenza)}: ${b ? b.titolo : loan.libroId}`, loan.id);
    return { ok: true, dataScadenza: loan.dataScadenza };
  }

  /* daysLeft: negativo = giorni di ritardo, positivo = giorni alla scadenza */
  getCalculatedLoans() {
    const today = D.today();
    const books = this.getBooks(); const members = this.getMembers();
    return this.getLoans().map(l => {
      const sn = l.snap || {};
      const libro = books.find(b => b.id === l.libroId) || { id: l.libroId, titolo: sn.titolo || 'Volume non più in catalogo', autore: sn.autore || '', catalogo: sn.catalogo || '' };
      const socio = members.find(m => m.id === l.iscrittoId) || { id: l.iscrittoId, nome: sn.socio || 'Socio', cognome: sn.socio ? '' : 'eliminato', email: '', telefono: '', clubId: sn.clubId || null };
      if (l.dataRestituzione) return { ...l, libro, socio, computedStatus: 'Restituito', daysLeft: 0, daysDiff: 0 };
      const daysLeft = D.diff(D.parse(l.dataScadenza), today);
      const computedStatus = daysLeft < 0 ? 'In ritardo' : daysLeft <= FG.sogliaScadenza ? 'In scadenza' : 'In corso';
      return { ...l, libro, socio, computedStatus, daysLeft, daysDiff: Math.abs(daysLeft) };
    });
  }

  getStats() {
    const books = this.getBooks();
    const active = this.getCalculatedLoans().filter(l => !l.dataRestituzione);
    const available = books.filter(b => b.stato === 'Disponibile').length;
    const titles = this.getTitles(books);
    return {
      totalBooks: books.length,                 /* copie fisiche */
      totalTitles: titles.length,               /* titoli diversi */
      availableTitles: titles.filter(t => t.available > 0).length,
      multiCopyTitles: titles.filter(t => t.total > 1).length,
      availableBooks: available,
      activeLoansCount: active.length,
      overdueLoansCount: active.filter(l => l.computedStatus === 'In ritardo').length,
      dueSoonCount: active.filter(l => l.computedStatus === 'In scadenza').length,
      totalMembers: this.getMembers().length,
      totalClubs: this.getClubs().length,
      availabilityPercentage: books.length ? Math.round((available / books.length) * 100) : 0
    };
  }

  /* ---------- Movimentazioni (riepilogo settimanale) ----------
     Club o Genitori: i club per adulti (senza fascia d'età, come "Genitori") sono la categoria Genitori,
     tutti gli altri club sono la categoria Club. Nessun socio viene escluso per età;
     chi non ha club è conteggiato tra i Club come "Nessun club". */
  /* ---------- Importazione di un elenco di iscritti ----------
     File preparato a parte (tipo "fg-iscritti"): { club: [{nome, etaMin, etaMax, colore, descrizione}], iscritti: [{nome, cognome, dataNascita, club}] }.
     "club" di un iscritto è il nome del club; se manca, il club si sceglie in base all'età.
     Gli iscritti già presenti (stesso nome e cognome) vengono saltati: importare due volte lo stesso file non crea doppioni.
     Si aggiunge e basta: nulla di ciò che c'è già viene modificato o cancellato. */
  planMembersImport(pkg) {
    if (!pkg || pkg.tipo !== 'fg-iscritti' || !Array.isArray(pkg.iscritti)) return { ok: false, error: 'Questo file non è un elenco di iscritti da importare.' };
    const norm = (t) => BiblioStore._norm(t);
    const clubs = this.getClubs(), byName = (n) => clubs.find(c => norm(c.nome) === norm(n));
    const newClubs = (Array.isArray(pkg.club) ? pkg.club : []).filter(c => c && String(c.nome || '').trim() && !byName(c.nome))
      .filter((c, i, a) => a.findIndex(x => norm(x.nome) === norm(c.nome)) === i);
    const err = newClubs.map(c => this._checkClub(c)).find(Boolean); if (err) return { ok: false, error: err };
    const seen = new Set(this.getMembers().map(m => norm(m.nome) + '|' + norm(m.cognome)));
    const add = [], dup = [];
    pkg.iscritti.forEach((m) => {
      const nome = String(m.nome || '').trim(), cognome = String(m.cognome || '').trim();
      if (!nome && !cognome) return;
      const k = norm(nome) + '|' + norm(cognome);
      if (seen.has(k)) { dup.push(`${nome} ${cognome}`.trim()); return; }
      seen.add(k);
      const nascita = D.parse(m.dataNascita) ? D.iso(D.parse(m.dataNascita)) : '';
      let club = m.club ? (byName(m.club) || newClubs.find(c => norm(c.nome) === norm(m.club))) : null;
      if (!club && m.club && /genitor/i.test(m.club)) club = clubs.find(c => this.clubCategory(c) === 'genitori') || null;
      if (!club && !m.club && nascita) club = this.suggestClub(this.ageOf(nascita));
      add.push({ nome, cognome, dataNascita: nascita, email: String(m.email || '').trim(), telefono: String(m.telefono || '').trim(), clubNome: club ? club.nome : '' });
    });
    return { ok: true, newClubs, add, dup };
  }
  applyMembersImport(plan) {
    if (!plan || !plan.ok) return { ok: false, error: 'Niente da importare.' };
    plan.newClubs.forEach((c) => { const used = this.getClubs().map(x => x.colore); this.addClub({ ...c, colore: /^#[0-9a-f]{6}$/i.test(c.colore || '') ? c.colore : (FG.coloriClub.find(x => !used.includes(x)) || FG.coloriClub[0]) }); });
    const clubs = this.getClubs(), norm = (t) => BiblioStore._norm(t), oggi = D.iso(new Date());
    const members = this.getMembers();
    plan.add.forEach((m) => {
      const club = m.clubNome ? clubs.find(c => norm(c.nome) === norm(m.clubNome)) : null;
      members.unshift({ nome: m.nome, cognome: m.cognome, email: m.email, telefono: m.telefono, dataNascita: m.dataNascita, clubId: club ? club.id : null, id: this._nextId('member'), dataIscrizione: oggi });
    });
    if (plan.add.length) {
      this._save(KEYS.MEMBERS, members);
      this.logActivity('CREATE', `Importati ${plan.add.length} iscritti da elenco${plan.newClubs.length ? ` (nuovi club: ${plan.newClubs.map(c => c.nome).join(', ')})` : ''}`, null);
    }
    return { ok: true, added: plan.add.length, clubs: plan.newClubs.length };
  }
  /* ---------- Report annuale ----------
     Tutti i numeri di un anno solare, calcolati dai prestiti registrati (alla data effettiva di consegna e rientro).
     Restituisce dati "grezzi": la pagina del riepilogo li impagina nel documento da stampare o salvare in PDF. */
  getYearReport(year) {
    const y = Number(year), from = `${y}-01-01`, to = `${y}-12-31`, oggi = D.iso(D.today());
    const moves = this.getMovements(from, to);
    const out = moves.filter(m => m.tipo === 'consegna'), back = moves.filter(m => m.tipo === 'rientro');
    const books = new Map(this.getBooks().map(b => [b.id, b])), members = new Map(this.getMembers().map(m => [m.id, m]));
    const loans = new Map(this.getLoans().map(l => [l.id, l]));
    const month = (iso) => Number(iso.slice(5, 7)) - 1;
    const perMese = Array.from({ length: 12 }, () => ({ consegne: 0, rientri: 0 }));
    out.forEach(m => { perMese[month(m.data)].consegne++; }); back.forEach(m => { perMese[month(m.data)].rientri++; });
    const tally = (map, key, init) => { if (!map.has(key)) map.set(key, init()); return map.get(key); };
    const titles = new Map(), readers = new Map(), clubs = new Map(), genres = new Map();
    const cat = { club: 0, genitori: 0 };
    out.forEach((m) => {
      const t = tally(titles, m.titoloKey, () => ({ titolo: m.titolo, autore: m.autore, n: 0, lettori: new Set() })); t.n++; t.lettori.add(m.iscrittoId);
      const mem = members.get(m.iscrittoId);
      const r = tally(readers, m.iscrittoId || m.destinatario, () => ({ nome: mem ? mem.nome : '', cognome: mem ? mem.cognome : '', esteso: m.destinatario, club: m.clubNome, colore: m.clubColore, n: 0 })); r.n++;
      const c = tally(clubs, m.clubNome, () => ({ nome: m.clubNome, colore: m.clubColore, categoria: m.categoria, n: 0, lettori: new Set() })); c.n++; c.lettori.add(m.iscrittoId);
      const b = books.get(m.libroId), gname = (b && b.genere) || 'Genere non indicato';
      tally(genres, gname, () => ({ nome: gname, colore: this.genreColor ? this.genreColor(gname) : '#5B6B8C', n: 0 })).n++;
      cat[m.categoria === 'genitori' ? 'genitori' : 'club']++;
    });
    /* puntualità e durata media, sui libri rientrati nell'anno */
    let inTempo = 0, giorni = 0, conDurata = 0;
    back.forEach((m) => {
      const l = loans.get(m.loanId); if (!l) return;
      if (l.dataScadenza && l.dataRestituzione <= l.dataScadenza) inTempo++;
      const a = D.parse(l.dataUscita), b = D.parse(l.dataRestituzione);
      if (a && b) { giorni += Math.max(0, Math.round((b - a) / 86400000)); conDurata++; }
    });
    const sortN = (arr) => arr.sort((a, b) => b.n - a.n || String(a.titolo || a.nome || a.esteso).localeCompare(String(b.titolo || b.nome || b.esteso), 'it'));
    const iscritti = this.getMembers();
    const perClubIscritti = this.getClubsSorted().map(c => ({ nome: c.nome, colore: c.colore, n: iscritti.filter(m => m.clubId === c.id).length })).filter(c => c.n > 0);
    const st = this.getStats();
    const busiest = perMese.reduce((best, m, i) => (m.consegne > (best ? perMese[best].consegne : 0) ? i : best), null);
    return {
      anno: y, dal: from, al: oggi < to && oggi >= from ? oggi : to, inCorso: oggi >= from && oggi < to,
      consegne: out.length, rientri: back.length,
      lettori: readers.size, titoliLetti: titles.size,
      inTempo, restituiti: back.length, puntualita: back.length ? Math.round((inTempo / back.length) * 100) : null,
      durataMedia: conDurata ? Math.round(giorni / conDurata) : null,
      nuoviIscritti: iscritti.filter(m => String(m.dataIscrizione || '').startsWith(String(y))).length,
      iscrittiTotali: iscritti.length, perClubIscritti,
      volumi: st.totalBooks, titoli: st.totalTitles,
      perMese, meseTop: busiest,
      perCategoria: cat,
      perClub: sortN([...clubs.values()]).map(c => ({ ...c, lettori: c.lettori.size })),
      libri: sortN([...titles.values()]).map(t => ({ ...t, lettori: t.lettori.size })),
      lettoriTop: sortN([...readers.values()]),
      generi: sortN([...genres.values()])
    };
  }
  /* anni per cui esistono prestiti (più l'anno in corso), dal più recente */
  getReportYears() {
    const ys = new Set([D.today().getFullYear()]);
    this.getLoans().forEach(l => { [l.dataUscita, l.dataRestituzione].forEach(d => { if (/^\d{4}-/.test(d || '')) ys.add(Number(d.slice(0, 4))); }); });
    return [...ys].sort((a, b) => b - a);
  }
  clubCategory(club) { return club && ((club.etaMin == null && club.etaMax == null) || /genitor/i.test(club.nome || '')) ? 'genitori' : 'club'; }
  /* Ogni prestito genera al massimo due eventi, ciascuno alla sua data effettiva:
     la consegna (dataUscita) e il rientro (dataRestituzione). Un rientro esiste una sola volta. */
  getMovements(fromISO, toISO) {
    const books = new Map(this.getBooks().map(b => [b.id, b])), members = new Map(this.getMembers().map(m => [m.id, m]));
    const clubs = new Map(this.getClubs().map(c => [c.id, c]));
    const out = [];
    this.getLoans().forEach((l) => {
      const inR = (d) => d && d >= fromISO && d <= toISO;
      if (!inR(l.dataUscita) && !inR(l.dataRestituzione)) return;
      const sn = l.snap || {}, b = books.get(l.libroId), m = members.get(l.iscrittoId);
      const clubId = l.snap ? sn.clubId : (m ? m.clubId : null);
      const club = clubId ? clubs.get(clubId) : null;
      const base = {
        loanId: l.id, libroId: l.libroId, iscrittoId: l.iscrittoId,
        titolo: sn.titolo || (b && b.titolo) || 'Volume non più in catalogo',
        autore: sn.autore || (b && b.autore) || '',
        catalogo: sn.catalogo || (b && b.catalogo) || '',
        isbn: sn.isbn || (b && b.isbn) || '',
        titoloKey: BiblioStore.groupKey({ id: l.libroId, isbn: sn.isbn || (b && b.isbn) || '', titolo: sn.titolo || (b && b.titolo) || '', autore: sn.autore || (b && b.autore) || '' }),
        destinatario: sn.socio || (m ? `${m.nome} ${m.cognome}`.trim() : 'Socio eliminato'),
        clubId: clubId || null,
        clubNome: club ? club.nome : (sn.clubNome || 'Nessun club'),
        clubColore: club ? club.colore : '#949AA5',
        categoria: club ? this.clubCategory(club) : (sn.categoria || 'club'),
        scadenza: l.dataScadenza
      };
      if (inR(l.dataUscita)) out.push({ ...base, tipo: 'consegna', data: l.dataUscita });
      if (inR(l.dataRestituzione)) out.push({ ...base, tipo: 'rientro', data: l.dataRestituzione });
    });
    return out.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : a.tipo === b.tipo ? a.titolo.localeCompare(b.titolo, 'it') : a.tipo === 'consegna' ? -1 : 1));
  }
  /* Riepilogo della settimana che contiene "day" (lunedì-domenica) */
  getWeekSummary(day = new Date()) {
    const start = D.weekStart(day), end = D.add(start, 6);
    const from = D.iso(start), to = D.iso(end), w = D.isoWeek(start);
    const items = this.getMovements(from, to);
    const count = (list, t) => list.filter(x => x.tipo === t).length;
    const byCat = (c) => { const l = items.filter(x => x.categoria === c); return { consegne: count(l, 'consegna'), rientri: count(l, 'rientro'), totale: l.length }; };
    const clubs = new Map();
    items.forEach((x) => {
      const k = x.clubId || '__none';
      if (!clubs.has(k)) clubs.set(k, { clubId: x.clubId, nome: x.clubNome, colore: x.clubColore, categoria: x.categoria, consegne: 0, rientri: 0 });
      clubs.get(k)[x.tipo === 'consegna' ? 'consegne' : 'rientri']++;
    });
    const titoli = new Set(items.map(x => x.titoloKey)).size;
    return { from, to, week: w.week, year: w.year, items, titoli,
      consegne: count(items, 'consegna'), rientri: count(items, 'rientro'),
      club: byCat('club'), genitori: byCat('genitori'),
      perClub: [...clubs.values()].sort((a, b) => (a.categoria === b.categoria ? a.nome.localeCompare(b.nome, 'it') : a.categoria === 'club' ? -1 : 1)) };
  }

  /* range: 'month' = ultimi 30 giorni (per giorno) | 'year' = anno corrente (per mese) */
  getChartData(range = 'month') {
    const loans = this.getLoans();
    if (range === 'year') {
      const y = new Date().getFullYear();
      const labels = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
      const out = new Array(12).fill(0), back = new Array(12).fill(0);
      loans.forEach(l => {
        const s = D.parse(l.dataUscita); if (s && s.getFullYear() === y) out[s.getMonth()]++;
        const r = D.parse(l.dataRestituzione); if (r && r.getFullYear() === y) back[r.getMonth()]++;
      });
      return { labels, loans: out, returns: back };
    }
    const t = D.today(); const labels = [], out = [], back = [];
    for (let i = 29; i >= 0; i--) {
      const d = D.add(t, -i), k = D.iso(d);
      labels.push(d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }));
      out.push(loans.filter(l => l.dataUscita === k).length);
      back.push(loans.filter(l => l.dataRestituzione === k).length);
    }
    return { labels, loans: out, returns: back };
  }

  /* ---------- Utilità ---------- */
  escape(s) { return escapeHTML(s); }
  normalizePhone(t) {
    const n = String(t || '').replace(/[^\d+]/g, '');
    if (!n) return '';
    if (n.startsWith('+')) return n.slice(1);
    if (n.startsWith('00')) return n.slice(2);
    return FG.prefissoTel + n;
  }

  exportData() {
    const m = this._read(KEYS.META, { seq: {} });
    /* "contatori" e "sede" permettono un ripristino fedele: i numeri di catalogo già usati non vengono riassegnati */
    return JSON.stringify({ versione: 4, esportatoIl: new Date().toISOString(), libri: this.getBooks(), iscritti: this.getMembers(), prestiti: this.getLoans(), circoli: this.getClubs(), generi: this._read(KEYS.GENRES), log: this.getLogs(), contatori: m.seq || {}, sede: m.sede || null }, null, 2);
  }
  /* Controlla un file di copia senza importarlo: serve per mostrare cosa contiene prima di sostituire i dati */
  inspectImport(text) {
    let d; try { d = JSON.parse(text); } catch { return { ok: false, error: 'File non valido: scegli una copia .json scaricata dal programma.' }; }
    if (!d || ![d.libri, d.iscritti, d.prestiti].every(Array.isArray)) return { ok: false, error: 'Il file non contiene libri, iscritti e prestiti.' };
    return { ok: true, libri: d.libri.length, iscritti: d.iscritti.length, prestiti: d.prestiti.length, club: (d.circoli || []).length, data: d.esportatoIl || '' };
  }
  importData(text) {
    let d; try { d = JSON.parse(text); } catch { return { ok: false, error: 'File non valido.' }; }
    if (![d.libri, d.iscritti, d.prestiti].every(Array.isArray)) return { ok: false, error: 'Il file non contiene libri, iscritti e prestiti.' };
    this._save(KEYS.BOOKS, d.libri); this._save(KEYS.MEMBERS, d.iscritti); this._save(KEYS.LOANS, d.prestiti);
    this._save(KEYS.CLUBS, d.circoli || []); this._save(KEYS.LOGS, d.log || []);
    const max = (arr) => arr.reduce((m, x) => Math.max(m, BiblioStore.idNumber(x.id)), 0);
    const c = d.contatori && typeof d.contatori === 'object' ? d.contatori : {}, num = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
    const prev = this._read(KEYS.META, { seq: {} });
    this._save(KEYS.META, { seq: { book: Math.max(max(d.libri), num(c.book)), member: Math.max(max(d.iscritti), num(c.member)), loan: Math.max(max(d.prestiti), num(c.loan)), club: Math.max(max(d.circoli || []), num(c.club)), catalogo: num(c.catalogo) },
      schema: d.versione >= 4 ? 4 : 0, avvio: BiblioStore.AVVIO, ...(d.sede && typeof d.sede === 'object' ? { sede: d.sede } : prev.sede ? { sede: prev.sede } : {}), ...(prev.ultimaCopia ? { ultimaCopia: prev.ultimaCopia } : {}) });
    this._save(KEYS.GENRES, Array.isArray(d.generi) ? d.generi : []);
    this._migrate();
    this._syncGenres(!Array.isArray(d.generi));
    this._ensureCatalog();
    this._ensureSnapshots();
    return { ok: true };
  }

  /* Ripartenza da zero: cancella libri, iscritti, prestiti e attività; club e generi restano.
     I contatori ripartono, quindi il primo libro inserito sarà di nuovo C-0001. */
  resetKeepClubs() { this.resetAll({ clubs: false }); }
  /* Reset totale (impostazioni riservate): libri, iscritti, prestiti e attività sempre;
     con { clubs: true } anche i club. I generi restano, così si possono subito inserire libri. */
  resetAll({ clubs = false } = {}) {
    const meta = this._read(KEYS.META, { seq: {} });
    this._save(KEYS.BOOKS, []); this._save(KEYS.MEMBERS, []); this._save(KEYS.LOANS, []);
    if (clubs) this._save(KEYS.CLUBS, []);
    this._save(KEYS.LOGS, [{ id: `LOG-${Date.now()}`, timestamp: new Date().toISOString(), type: 'CREATE', message: clubs ? 'Reset totale: archivio vuoto, club eliminati' : 'Archivio azzerato: club e generi mantenuti, pronto per partire', entityId: null, operator: 'Admin' }]);
    this._save(KEYS.META, { ...meta, seq: { ...(meta.seq || {}), book: 0, member: 0, loan: 0, catalogo: 0, ...(clubs ? { club: 0 } : {}) }, schema: meta.schema || 4, avvio: BiblioStore.AVVIO });
  }
  /* La ripartenza richiesta per questa versione è già stata fatta (o non serve)? */
  needsFreshStart() {
    const meta = this._read(KEYS.META, { seq: {} });
    if (meta.avvio === BiblioStore.AVVIO) return false;
    return this.getBooks().length + this.getMembers().length + this.getLoans().length > 0;
  }
  /* Dati della sede usati nei messaggi di sollecito (modificabili dalle impostazioni riservate) */
  getSede() { const m = this._read(KEYS.META, { seq: {} }); return { indirizzo: FG.indirizzo, orari: FG.orari, telefono: FG.telefono, ...(m.sede || {}) }; }
  setSede(d) {
    const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
    const sede = { indirizzo: clean(d.indirizzo, 120), orari: clean(d.orari, 160), telefono: clean(d.telefono, 40) };
    if (!sede.indirizzo) return { ok: false, error: 'Indica almeno l’indirizzo della sede.' };
    const meta = this._read(KEYS.META, { seq: {} }); this._save(KEYS.META, { ...meta, sede });
    this.logActivity('UPDATE', 'Dati della sede aggiornati', null);
    return { ok: true, sede };
  }
  /* Ultima copia di sicurezza scaricata (per ricordare di farne una ogni tanto) */
  lastBackup() { return this._read(KEYS.META, { seq: {} }).ultimaCopia || null; }
  markBackup() { const meta = this._read(KEYS.META, { seq: {} }); this._save(KEYS.META, { ...meta, ultimaCopia: new Date().toISOString() }); }
  markFreshStart() { const meta = this._read(KEYS.META, { seq: {} }); if (meta.avvio !== BiblioStore.AVVIO) this._save(KEYS.META, { ...meta, avvio: BiblioStore.AVVIO }); }

  /* Archivio vuoto con i soli club iniziali (primo avvio online o "Svuota archivio") */
  resetEmpty() {
    const pad = n => String(n).padStart(3, '0');
    const clubs = FG.clubIniziali.map(([nome, etaMin, etaMax, colore, descrizione], i) => ({ id: `CLUB-${pad(i + 1)}`, nome, etaMin, etaMax, colore, descrizione }));
    this._save(KEYS.BOOKS, []); this._save(KEYS.MEMBERS, []); this._save(KEYS.LOANS, []);
    this._save(KEYS.CLUBS, clubs);
    this._save(KEYS.GENRES, Object.entries(FG.generi).map(([nome, colore]) => ({ id: 'GEN-' + BiblioStore.slug(nome), nome, colore })));
    this._save(KEYS.LOGS, [{ id: `LOG-${Date.now()}`, timestamp: new Date().toISOString(), type: 'CREATE', message: 'Archivio creato con i club iniziali', entityId: null, operator: 'Admin' }]);
    this._save(KEYS.META, { seq: { book: 0, member: 0, loan: 0, club: clubs.length }, schema: 4, avvio: BiblioStore.AVVIO });
  }

  /* Dati demo con date relative a oggi, così la dashboard è sempre significativa */
  resetDemo() {
    const t = D.today(), o = n => D.iso(D.add(t, n));
    const pad = n => String(n).padStart(3, '0');
    const C = FG.clubIniziali.map(([nome, etaMin, etaMax, colore, descrizione], i) => ({ id: `CLUB-${pad(i + 1)}`, nome, etaMin, etaMax, colore, descrizione }));
    const [MINI, MEDI, GRANDI, GEN] = C.map(c => c.id);
    const raw = [
      ['Il Piccolo Principe', 'Antoine de Saint-Exupéry', 'Fiabe & Crescita', [MINI, MEDI, GEN], 'A1'],
      ['Pinocchio', 'Carlo Collodi', 'Fiabe & Crescita', [MINI], 'A2'],
      ['Il vecchio e il mare', 'Ernest Hemingway', 'Marineria & Territorio', [GRANDI, GEN], 'C1'],
      ['Moby Dick', 'Herman Melville', 'Marineria & Territorio', [GRANDI], 'C2'],
      ['Le avventure di Tom Sawyer', 'Mark Twain', 'Fiabe & Crescita', [MINI, MEDI], 'B1'],
      ['Le confessioni', 'Sant’Agostino', 'Spiritualità & Valori', [GEN], 'D1'],
      ['Piccole donne', 'Louisa May Alcott', 'Educazione & Famiglia', [MEDI, GRANDI], 'B2'],
      ['Lettera a una professoressa', 'Scuola di Barbiana', 'Educazione & Famiglia', [GRANDI, GEN], 'D2'],
      ['Il sentiero dei nidi di ragno', 'Italo Calvino', 'Educazione & Famiglia', [GRANDI], 'B3'],
      ['Fratelli tutti', 'Papa Francesco', 'Spiritualità & Valori', [GEN], 'D3'],
      ['Capitani coraggiosi', 'Rudyard Kipling', 'Marineria & Territorio', [MEDI], 'C3'],
      ['Cuore', 'Edmondo De Amicis', 'Educazione & Famiglia', [MINI, MEDI], 'B4'],
      ['Ventimila leghe sotto i mari', 'Jules Verne', 'Marineria & Territorio', [MEDI, GRANDI], 'C4'],
      ['Il giardino segreto', 'Frances H. Burnett', 'Fiabe & Crescita', [MINI], 'A3']
    ];
    const books = raw.map((r, i) => ({ id: `FG-L-${pad(i + 1)}`, catalogo: BiblioStore.catCode(i + 1), isbn: '', titolo: r[0], autore: r[1], genere: r[2], clubIds: r[3], scaffale: r[4], stato: 'Disponibile' }));
    const y = D.today().getFullYear();
    const mem = [
      ['Giulia', 'Esposito', GEN, '333 1200451', `${y - 41}-03-14`], ['Marco', 'De Luca', MEDI, '333 4412096', `${y - 13}-05-02`],
      ['Anna', 'Russo', GEN, '347 8801234', `${y - 38}-09-21`], ['Salvatore', 'Ferrara', GRANDI, '320 5567810', `${y - 17}-01-30`],
      ['Chiara', 'Romano', GRANDI, '339 7712305', `${y - 16}-07-11`], ['Luigi', 'Capasso', MINI, '328 9034411', `${y - 10}-02-08`]
    ];
    const members = mem.map((r, i) => ({ id: `FG-ISCR-${pad(i + 1)}`, nome: r[0], cognome: r[1], email: `${r[0].toLowerCase()}.${r[1].toLowerCase().replace(' ', '')}@esempio.it`, telefono: r[3], clubId: r[2], dataNascita: r[4], dataIscrizione: o(-120 + i * 9) }));
    // [libro, socio, uscita, scadenza, restituzione]
    const L = [[1, 1, -40, -10, null], [3, 4, -35, -5, null], [5, 2, -27, 3, null], [8, 3, -20, 10, null], [6, 1, -10, 20, null], [4, 5, -28, 2, null],
      [2, 3, -60, -30, -33], [7, 2, -50, -20, -22], [9, 5, -15, 15, -3]];
    const loans = L.map((r, i) => ({ id: `LOAN-${pad(i + 1)}`, libroId: `FG-L-${pad(r[0])}`, iscrittoId: `FG-ISCR-${pad(r[1])}`, dataUscita: o(r[2]), dataScadenza: o(r[3]), dataRestituzione: r[4] === null ? null : o(r[4]), note: '' }));
    loans.forEach(l => { if (!l.dataRestituzione) books.find(b => b.id === l.libroId).stato = 'In Prestito'; });
    const clubs = C;
    const ago = h => new Date(Date.now() - h * 3600000).toISOString();
    const logs = [
      { id: 'LOG-s3', timestamp: ago(2), type: 'UPDATE', message: 'Restituito: Il giardino segreto', entityId: null, operator: 'Admin' },
      { id: 'LOG-s2', timestamp: ago(20), type: 'CREATE', message: 'Nuovo iscritto: Luigi Capasso', entityId: null, operator: 'Admin' },
      { id: 'LOG-s1', timestamp: ago(50), type: 'CREATE', message: 'Nuovo volume in catalogo: Cuore', entityId: null, operator: 'Admin' }
    ];
    this._save(KEYS.BOOKS, books); this._save(KEYS.MEMBERS, members); this._save(KEYS.LOANS, loans);
    this._save(KEYS.CLUBS, clubs); this._save(KEYS.LOGS, logs);
    this._save(KEYS.GENRES, Object.entries(FG.generi).map(([nome, colore]) => ({ id: 'GEN-' + BiblioStore.slug(nome), nome, colore })));
    this._save(KEYS.META, { seq: { book: books.length, member: members.length, loan: loans.length, club: clubs.length, catalogo: books.length }, schema: 4, avvio: BiblioStore.AVVIO });
  }
}
/* Ripartenza da zero richiesta per la versione di novembre 2026 (vedi needsFreshStart) */
BiblioStore.AVVIO = '2026-11-05';
BiblioStore.MAX_COPIE = 50; /* quante copie si possono aggiungere in una volta */

window.FG = FG;
window.D = D;

/* Avvio: in modalità online aspetta login e dati, altrimenti usa subito i dati di questo computer */
window.storeReady = (async () => {
  if (window.Cloud && window.Cloud.enabled) {
    const info = await window.Cloud.start();
    window.store = new BiblioStore(window.Cloud.backend, { cloud: true, canSeed: info.fromServer });
  } else {
    window.store = new BiblioStore();
  }
  return window.store;
})();
