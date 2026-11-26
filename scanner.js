/**
 * scanner.js – lettura del codice a barre ISBN con la fotocamera e ricerca dei dati del libro
 * © 2026 Angelo Alaia – Tutti i diritti riservati
 *
 * Lettura: usa il lettore integrato nel browser (BarcodeDetector) quando c'è,
 * altrimenti la libreria ZXing (zxing.min.js, caricata solo al primo utilizzo).
 * Ricerca: Google Books, con Open Library come riserva.
 */

/* ---------- ISBN: pulizia, controllo, conversione ---------- */
const ISBN = {
  clean(s) { return String(s || '').toUpperCase().replace(/[^0-9X]/g, ''); },
  valid13(s) {
    if (!/^\d{13}$/.test(s)) return false;
    const sum = [...s].reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  },
  valid10(s) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    const sum = [...s].reduce((t, d, i) => t + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    return sum % 11 === 0;
  },
  to13(s10) {
    const b = '978' + s10.slice(0, 9);
    const sum = [...b].reduce((t, d, i) => t + Number(d) * (i % 2 ? 3 : 1), 0);
    return b + ((10 - (sum % 10)) % 10);
  },
  /* ISBN valido a 13 cifre, oppure null */
  normalize(s) {
    const c = ISBN.clean(s);
    if (c.length === 13 && ISBN.valid13(c)) return c;
    if (c.length === 10 && ISBN.valid10(c)) return ISBN.to13(c);
    return null;
  },
  /* Un codice a barre EAN-13 è un ISBN solo se inizia con 978 o 979 */
  fromBarcode(code) { const c = ISBN.clean(code); return /^97[89]\d{10}$/.test(c) && ISBN.valid13(c) ? c : null; },
  same(a, b) { const x = ISBN.normalize(a) || ISBN.clean(a), y = ISBN.normalize(b) || ISBN.clean(b); return !!x && x === y; },

  async _get(url, ms = 8000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
    finally { clearTimeout(t); }
  },
  _https(u) { return u ? String(u).replace(/^http:\/\//i, 'https://').replace(/&edge=curl/g, '') : ''; },
  async _google(isbn) {
    const d = await ISBN._get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`);
    const v = d && d.items && d.items[0] && d.items[0].volumeInfo;
    if (!v) return null;
    const img = v.imageLinks || {};
    /* la scheda completa del volume ha categorie più precise (es. "Juvenile Fiction / Fairy Tales & Folklore") */
    let cats = v.categories || [];
    try { const id = d.items[0].id; if (id) { const full = await ISBN._get(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`, 4000); if (full && full.volumeInfo && full.volumeInfo.categories) cats = cats.concat(full.volumeInfo.categories); } } catch { /* bastano quelle di base */ }
    return {
      titolo: [v.title, v.subtitle].filter(Boolean).join(': '),
      autore: (v.authors || []).join(', '),
      editore: v.publisher || '',
      anno: String(v.publishedDate || '').slice(0, 4),
      copertina: ISBN._https(img.thumbnail || img.smallThumbnail),
      soggetti: cats.flatMap(c => String(c).split(/\s*\/\s*/)).filter(c => c && !/^general$/i.test(c)),
      descrizione: String(v.description || '').replace(/<[^>]*>/g, ' ').slice(0, 600),
      fonte: 'Google Books'
    };
  },
  async _openlibrary(isbn) {
    /* la ricerca per opera raccoglie gli argomenti di tutte le edizioni (molto più ricchi di quelli della singola edizione) */
    const [d, w] = await Promise.all([
      ISBN._get(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
      ISBN._get(`https://openlibrary.org/search.json?q=isbn:${isbn}&fields=subject&limit=1`, 5000).catch(() => null)
    ]);
    const v = d && d[`ISBN:${isbn}`];
    const workSubj = ((w && w.docs && w.docs[0] && w.docs[0].subject) || []).filter(x => typeof x === 'string').slice(0, 15);
    if (!v) return workSubj.length ? { titolo: '', autore: '', editore: '', anno: '', copertina: '', soggetti: workSubj, fonte: 'Open Library' } : null;
    return {
      titolo: [v.title, v.subtitle].filter(Boolean).join(': '),
      autore: (v.authors || []).map(a => a.name).join(', '),
      editore: ((v.publishers || [])[0] || {}).name || '',
      anno: (String(v.publish_date || '').match(/\d{4}/) || [''])[0],
      copertina: ISBN._https((v.cover || {}).medium || ''),
      soggetti: [...(v.subjects || []).map(x => (x && x.name) || String(x || '')).filter(Boolean), ...workSubj].slice(0, 20),
      fonte: 'Open Library'
    };
  },
  /* ---------- SBN: catalogo del Servizio Bibliotecario Nazionale ----------
     Se in firebase-config.js è indicato sbnProxy (l'intermediario Cloudflare), si usa quello.
     Altrimenti si prova a interrogare SBN direttamente (funziona solo se SBN lo consente al browser). */
  sbnProxy() { const c = window.FG_CLOUD || {}; return String(c.sbnProxy || '').trim().replace(/\/+$/, ''); },
  _parseSbn(data) {
    const recs = (data && (data.briefRecords || data.records)) || [];
    const r = recs.find(x => x && x.titolo) || null;
    if (!r) return null;
    const strip = s => String(s || '').replace(/<<|>>/g, '').replace(/^\s*\*/, '').replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const [tp, resp = ''] = strip(r.titolo).split(' / ');
    let autore = '';
    if (r.autorePrincipale) {
      const a = strip(r.autorePrincipale).replace(/<[^>]*>/g, '').replace(/\(.*?\)/g, '').replace(/[\d-]{4,}/g, '').trim().replace(/[,\s]+$/, '');
      const m = a.match(/^([^,]+),\s*(.+)$/);
      autore = m ? `${m[2].trim()} ${m[1].trim()}` : a;
    } else if (resp) autore = resp.split(/\s*;\s*/)[0].replace(/^(di|by|a cura di)\s+/i, '').replace(/[.\s]+$/, '').trim();
    const pub = strip(r.pubblicazione).replace(/[[\]]/g, ''), primo = pub.split(/\s*;\s*/)[0];
    const em = primo.match(/:\s*([^,]+)/), anni = pub.match(/\b(1[5-9]\d\d|20\d\d)\b/g);
    return { trovato: true, titolo: tp.replace(/[\s.;:,]+$/, '').trim(), autore, editore: em ? em[1].trim() : '', anno: anni ? anni[anni.length - 1] : '' };
  },
  async _sbn(isbn) {
    const proxy = ISBN.sbnProxy();
    if (proxy) {
      const d = await ISBN._get(`${proxy}/?isbn=${isbn}`, 10000);
      if (d && d.errore) throw new Error(d.errore);
      if (!(d && d.trovato)) return null;
      /* il worker versione 2 aggiunge soggetti, Dewey, genere e collana; la versione 1 no (si usano le altre fonti) */
      const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String);
      return { titolo: d.titolo, autore: d.autore, editore: d.editore, anno: d.anno, copertina: '', fonte: 'SBN',
        soggetti: [...arr(d.soggetti), ...arr(d.generi)].map(x => x.replace(/\s*\[.*?\]\s*/g, ' ').trim()), dewey: arr(d.dewey), collana: arr(d.collana).join(' · ') };
    }
    try {
      const d = await ISBN._get(`https://opac.sbn.it/opacmobilegw/search.json?isbn=${isbn}`, 6000);
      const r = ISBN._parseSbn(d);
      return r ? { ...r, copertina: '', fonte: 'SBN' } : null;
    } catch { return null; } /* bloccato dal browser (CORS) o non raggiungibile: si usano le altre fonti */
  },
  /* Libro scritto a mano (senza ISBN): si cercano titolo e autore su Google Books e Open Library
     solo per raccogliere argomenti e descrizione, utili a scegliere il genere. Restituisce null se non trova nulla. */
  async searchText(titolo, autore) {
    const t = String(titolo || '').trim(), a = String(autore || '').trim();
    if (t.length < 2) return null;
    const n = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const same = (x) => { const nx = n(x), nt = n(t); return nx && (nx.startsWith(nt) || nt.startsWith(nx)); };
    const q = `intitle:${encodeURIComponent(t)}${a ? '+inauthor:' + encodeURIComponent(a.split(/[,;]/)[0]) : ''}`;
    const [g, o] = await Promise.allSettled([
      ISBN._get(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5&printType=books`, 6000),
      ISBN._get(`https://openlibrary.org/search.json?title=${encodeURIComponent(t)}${a ? '&author=' + encodeURIComponent(a) : ''}&fields=title,subject&limit=3`, 6000)
    ]).then(r => r.map(x => (x.status === 'fulfilled' ? x.value : null)));
    const gi = ((g && g.items) || []).map(i => i.volumeInfo || {}).filter(v => same(v.title));
    const od = ((o && o.docs) || []).filter(d => same(d.title));
    const soggetti = [...new Set([...gi.flatMap(v => (v.categories || []).flatMap(c => String(c).split(/\s*\/\s*/))), ...od.flatMap(d => (d.subject || []).slice(0, 15))].filter(x => x && !/^general$/i.test(x)))].slice(0, 15);
    const descrizione = String((gi.find(v => v.description) || {}).description || '').replace(/<[^>]*>/g, ' ').slice(0, 600);
    return soggetti.length || descrizione ? { soggetti, descrizione } : null;
  },
  /* ISBN italiano: 978-88… oppure 979-12… */
  isItalian(isbn) { return /^97888|^97912/.test(isbn); },

  /* Cerca in tutte le fonti in parallelo e unisce i risultati.
     Libri italiani: SBN ha la precedenza per titolo, autore, editore e anno.
     Le copertine arrivano da Google Books o Open Library. */
  async lookup(isbn) {
    const res = await Promise.allSettled([ISBN._sbn(isbn), ISBN._google(isbn), ISBN._openlibrary(isbn)]);
    const [s, g, o] = res.map(r => (r.status === 'fulfilled' ? r.value : null));
    if (!s && !g && !o) {
      if (res.every(r => r.status === 'rejected')) throw new Error('rete');
      return null;
    }
    const order = ISBN.isItalian(isbn) ? [s, g, o] : [g, o, s];
    const out = {};
    ['titolo', 'autore', 'editore', 'anno'].forEach(k => { const src = order.find(x => x && x[k]); out[k] = src ? src[k] : ''; });
    const cov = [g, o].find(x => x && x.copertina);
    out.copertina = cov ? cov.copertina : '';
    const names = { SBN: 'catalogo SBN', 'Google Books': 'Google Books', 'Open Library': 'Open Library' };
    const used = order.filter(Boolean).map(x => x.fonte);
    out.fonte = [...new Set(used)].map(n => names[n] || n).join(', ').replace(/, ([^,]*)$/, ' e $1');
    out.daSbn = !!s;
    /* argomenti del libro (servono a suggerire il genere): senza doppioni, al massimo 12 */
    const seen = new Set();
    /* prima i soggetti SBN (in italiano, i più precisi), poi Google Books e Open Library */
    out.soggetti = [s, g, o].flatMap(x => (x && x.soggetti) || []).map(x => String(x).trim()).filter(x => x && x.length <= 80 && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 15);
    out.dewey = (s && s.dewey) || [];
    out.collana = (s && s.collana) || '';
    out.descrizione = (g && g.descrizione) || '';
    return out;
  }
};

/* ---------- Genere automatico ----------
   Ogni libro riceve SEMPRE un genere, il più specifico possibile (Giallo, Thriller, Horror, Fantasy,
   Fantascienza, Romanzo storico, Romance, Avventura, Psicologico, Biografia…); i generi generici
   (Narrativa, Saggistica, Varie) si usano solo quando non c'è nessun indizio più preciso.
   Si usa un tuo genere quando corrisponde; altrimenti si propone un genere nuovo con un nome fisso,
   creato solo quando salvi il libro. I nomi fissi sono tutti diversi tra loro e argomenti simili
   ("Fede", "Religione cattolica", "Christian life"…) finiscono sempre nello stesso genere: niente doppioni.
   Indizi, dal più affidabile:
   - libri dello stesso autore già in catalogo (impara dalle tue scelte) e autori noti per un genere;
   - collana (Urania, Il Giallo Mondadori, Piccoli brividi, Harmony…);
   - argomenti: soggetti e classificazione Dewey del catalogo SBN, categorie di Google Books e Open Library;
   - parole del titolo e della descrizione. */
const GenreGuess = (() => {
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, ' ');
  const words = (t) => norm(t).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const R = (a, b) => [a, b];
  const VARIE = 'Varie';
  /* livello: 1 genere specifico · 2 tema · 3 generico (solo se non c'è altro)
     nome: radici che riconoscono un TUO genere dal suo nome · parole: radici cercate negli argomenti
     forti: parole che da sole bastano (anche nel titolo o nella descrizione) · fiction: true romanzo, false saggio */
  const FAM = [
    /* ---- generi specifici ---- */
    { id: 'giallo', crea: 'Giallo', livello: 1, fiction: true, nome: ['giall', 'poliziesc', 'detective', 'mystery', 'investigat'],
      parole: ['giall', 'poliziesc', 'detective', 'mystery', 'mysteries', 'investigat', 'investigazion', 'commissari', 'ispettor', 'delitt', 'omicid', 'assassin', 'whodunit', 'crime fiction', 'private investigators', 'police', 'polizia', 'indagin', 'cozy'],
      forti: ['giallo', 'gialli', 'poliziesco', 'detective', 'mystery', 'commissario', 'indagine', 'indagini'],
      collane: /giallo mondadori|gialli mondadori|i gialli|la memoria|gialli rizzoli|il giallo|gialli sellerio|giallo e nero/,
      autori: ['agatha christie', 'simenon', 'camilleri', 'conan doyle', 'raymond chandler', 'dashiell hammett', 'rex stout', 'carofiglio', 'malvaldi', 'antonio manzini', 'maurizio de giovanni', 'carlo lucarelli', 'scerbanenco', 'macchiavelli', 'fruttero', 'lucentini', 'ellery queen', 'ngaio marsh', 'dorothy sayers', 'fred vargas', 'mankell', 'lackberg', 'marco vichi', 'robert galbraith', 'gimenez bartlett', 'markaris', 'piazzese', 'marco malvaldi', 'cristina cassar scalia', 'cassar scalia', 'louise penny', 'anthony horowitz', 'maigret', 'montalbano', 'sherlock holmes', 'poirot'] },
    { id: 'thriller', crea: 'Thriller', livello: 1, fiction: true, nome: ['thrill', 'suspense', 'spionag', 'noir'],
      parole: ['thriller', 'thrillers', 'suspense', 'spionag', 'spy', 'spies', 'espionage', 'noir', 'serial killer', 'legal thriller', 'cospiraz', 'conspiracy', 'terroris', 'rapiment', 'kidnap', 'sequestr', 'killer', 'complott'],
      forti: ['thriller', 'suspense', 'noir', 'spionaggio', 'serial killer', 'mozzafiato', 'adrenalinic'],
      collane: /thriller|nord suspense|tea due|longanesi la gaja scienza/,
      autori: ['dan brown', 'grisham', 'james patterson', 'michael connelly', 'lee child', 'tom clancy', 'ludlum', 'forsyth', 'le carre', 'carrisi', 'joel dicker', 'deaver', 'harlan coben', 'baldacci', 'crichton', 'stieg larsson', 'nesbo', 'wulf dorn', 'fitzek', 'karin slaughter', 'gerritsen', 'patricia cornwell', 'thomas harris', 'dazieri', 'massimo carlotto', 'luca d andrea', 'ilaria tuti', 'glenn cooper', 'jeffery deaver', 'freida mcfadden', 'mcfadden'] },
    { id: 'horror', crea: 'Horror', livello: 1, fiction: true, nome: ['horror', 'orror', 'paura', 'brivid', 'gotic'],
      parole: ['horror', 'orror', 'paura', 'brivid', 'fantasm', 'vampir', 'zombi', 'mostr', 'demon', 'ghost', 'ghosts', 'haunted', 'gotic', 'gothic', 'licantrop', 'werewol', 'esorcis', 'incub', 'terrore', 'spettr', 'maledizion', 'possession', 'supernatural', 'soprannatural'],
      forti: ['horror', 'orrore', 'paura', 'brivido', 'brividi', 'fantasmi', 'fantasma', 'vampiri', 'vampiro', 'zombie', 'spaventos', 'terrificant', 'agghiacciant'],
      collane: /piccoli brividi|goosebumps|horror|brividi|oscar paura/,
      autori: ['stephen king', 'lovecraft', 'edgar allan poe', 'bram stoker', 'mary shelley', 'clive barker', 'koontz', 'anne rice', 'joe hill', 'stine', 'shirley jackson', 'darren shan', 'richard matheson', 'peter straub', 'paul tremblay', 'catherine fisher', 'r l stine'] },
    { id: 'fantasy', crea: 'Fantasy', livello: 1, fiction: true, nome: ['fantasy', 'fantastic'],
      parole: ['fantasy', 'magia', 'magic', 'magico', 'magica', 'maghi', 'mago', 'stregon', 'wizard', 'witch', 'witches', 'drag', 'elfi', 'elves', 'nani', 'incantesim', 'sword', 'sorcer', 'unicorn', 'profezia', 'prophecy', 'creature magiche', 'mondo incantato', 'regni incantati', 'epic fantasy', 'high fantasy', 'urban fantasy', 'fantastic'],
      forti: ['fantasy', 'magia', 'draghi', 'drago', 'maghi', 'elfi', 'incantesimi', 'stregoneria', 'mondo fantastico'],
      collane: /oscar fantastica|fanucci|fantasy|mondadori fantasy|mondi fantastici/,
      autori: ['tolkien', 'rowling', 'george r r martin', 'sanderson', 'pratchett', 'licia troisi', 'paolini', 'rothfuss', 'terry brooks', 'eddings', 'pullman', 'riordan', 'cornelia funke', 'michael ende', 'gaiman', 'robert jordan', 'abercrombie', 'robin hobb', 'zimmer bradley', 'sarah j maas', 'bardugo', 'cassandra clare', 'baccalario', 'strazzulla', 'harry potter', 'percy jackson'] },
    { id: 'fantascienza', crea: 'Fantascienza', livello: 1, fiction: true, nome: ['fantascien', 'science fiction', 'distop', 'cyberpunk'],
      parole: ['fantascien', 'science fiction', 'sci-fi', 'scifi', 'distopi', 'dystopi', 'cyberpunk', 'alieni', 'aliens', 'extraterrestr', 'astronav', 'spaceship', 'space opera', 'robot', 'androi', 'viaggi nel tempo', 'time travel', 'galass', 'galax', 'pianet', 'planet', 'intelligenza artificiale', 'artificial intelligence', 'post-apocal', 'postapocal', 'apocalisse', 'cloni', 'colonie spaziali'],
      forti: ['fantascienza', 'distopia', 'distopico', 'distopica', 'alieni', 'robot', 'astronave', 'futuro distopico'],
      collane: /urania|cosmo argento|oscar fantascienza|odissea fantascienza/,
      autori: ['asimov', 'philip k dick', 'frank herbert', 'arthur c clarke', 'bradbury', 'heinlein', 'orwell', 'huxley', 'h g wells', 'william gibson', 'liu cixin', 'orson scott card', 'douglas adams', 'margaret atwood', 'suzanne collins', 'lois lowry', 'veronica roth', 'andy weir', 'stanislaw lem', 'dan simmons', 'vonnegut', 'james dashner', 'evangelisti', 'ursula k le guin'] },
    { id: 'storico', crea: 'Romanzo storico', livello: 1, fiction: true, nome: ['storic'],
      parole: ['romanzo storico', 'romanzi storici', 'historical fiction', 'historical', 'medioev', 'medieval', 'rinasciment', 'antica roma', 'antico egitto', 'egizi', 'vichingh', 'cavalier', 'crociat', 'templari', 'impero romano', 'gladiator', 'samurai', 'risorgimento', 'ottocento', 'settecento', 'seicento', 'dinastia', 'regina', 'imperatore', 'faraon'],
      forti: ['romanzo storico', 'saga storica', 'affresco storico'],
      collane: /romanzo storico|i grandi romanzi storici/,
      autori: ['ken follett', 'valerio massimo manfredi', 'walter scott', 'manzoni', 'alexandre dumas', 'hilary mantel', 'philippa gregory', 'iggulden', 'bernard cornwell', 'scurati', 'yourcenar', 'maurice druon', 'tracy chevalier', 'colleen mccullough', 'robert harris', 'simon scarrow', 'falcones', 'steven saylor', 'christian jacq', 'comastri montanari', 'marcello simoni', 'stefania auci', 'tomasi di lampedusa'] },
    { id: 'romance', crea: 'Romance', livello: 1, fiction: true, nome: ['romance', 'rosa', 'sentiment', 'amor'],
      parole: ['romance', 'love stor', 'love', 'romantic', 'innamor', 'sentimental', 'chick lit', 'new adult', 'storia d amore', 'storie d amore', 'romanzo rosa', 'amore'],
      forti: ['romance', 'romanzo rosa', 'storia d amore', 'sentimentale', 'innamorat', 'romantico', 'romantica'],
      collane: /harmony|romance|i romanzi rosa|emozioni/,
      autori: ['nicholas sparks', 'jane austen', 'jojo moyes', 'kinsella', 'danielle steel', 'nora roberts', 'colleen hoover', 'anna todd', 'moccia', 'cecelia ahern', 'emily henry', 'felicia kingsley', 'rosamunde pilcher', 'marc levy', 'guillaume musso', 'sylvia day', 'julia quinn', 'lisa kleypas', 'barbara cartland', 'liala', 'abbi glines', 'elle kennedy', 'ali hazelwood'] },
    { id: 'avventura', crea: 'Avventura', livello: 1, fiction: true, nome: ['avventur', 'adventure', 'azione'],
      parole: ['avventur', 'adventure', 'adventures', 'action', 'pirat', 'corsar', 'tesor', 'treasure', 'esplorat', 'explorer', 'sopravviv', 'survival', 'naufrag', 'shipwreck', 'giungla', 'jungle', 'isola deserta', 'spedizion', 'expedition', 'western', 'cowboy', 'caccia al tesoro'],
      forti: ['avventura', 'avventure', 'pirati', 'tesoro', 'avventuros'],
      collane: /avventura|i grandi classici dell avventura/,
      autori: ['salgari', 'jules verne', 'stevenson', 'jack london', 'defoe', 'kipling', 'wilbur smith', 'clive cussler', 'mark twain', 'fenimore cooper', 'rider haggard', 'geronimo stilton', 'tea stilton', 'arthur ransome', 'karl may', 'jon krakauer'] },
    { id: 'psicologico', crea: 'Psicologico', livello: 1, fiction: true, nome: ['psicologic', 'introspett'],
      parole: ['romanzo psicologico', 'psychological fiction', 'psychological', 'psicologic', 'introspett', 'follia', 'madness', 'ossession', 'obsession', 'malattia mentale', 'mental illness', 'inconscio', 'manipolaz', 'thriller psicologico', 'doppia personalit', 'memoria perduta', 'amnesia'],
      forti: ['psicologico', 'psicologica', 'introspettivo', 'introspettiva', 'thriller psicologico'],
      collane: /psicolog/,
      autori: ['dostoevskij', 'dostoevsky', 'svevo', 'highsmith', 'gillian flynn', 'shari lapena', 'b a paris', 'paula hawkins', 'michaelides', 'ian mcewan', 'virginia woolf', 'kafka', 'pirandello', 'hermann hesse', 'ruth ware'] },
    { id: 'umorismo', crea: 'Umorismo', livello: 1, fiction: true, nome: ['umoris', 'humor', 'satir'],
      parole: ['humor', 'humour', 'humorous', 'umoris', 'comic novel', 'satir', 'parodi', 'esilarant', 'risate', 'barzellet', 'comicita', 'ironic'],
      forti: ['umoristico', 'umoristica', 'esilarante', 'satira', 'satirico', 'comicissim', 'divertentissim'],
      collane: /umoris/,
      autori: ['stefano benni', 'jerome k jerome', 'wodehouse', 'guareschi', 'achille campanile', 'littizzetto', 'giobbe covatta', 'jeff kinney', 'diario di una schiappa'] },
    { id: 'biografia', crea: 'Biografia', livello: 1, fiction: false, nome: ['biograf', 'memor', 'autobiog'],
      parole: ['biography', 'biographies', 'autobiography', 'memoir', 'memoirs', 'biograf', 'autobiograf', 'memorie', 'diario', 'diari', 'testimonianz', 'la mia vita', 'vita di', 'life of', 'personal memoirs'],
      forti: ['biografia', 'autobiografia', 'memorie', 'la vita di', 'la storia vera', 'storia vera', 'testimonianza'],
      dewey: [R(920, 930)], autori: ['walter isaacson', 'anne frank'] },
    { id: 'fiabe', crea: 'Fiabe & Crescita', livello: 1, nome: ['fiab', 'favol', 'crescit', 'infanz', 'bambin'],
      parole: ['fairy', 'fairy tales', 'fable', 'fables', 'folklore', 'fiab', 'favol', 'filastrocc', 'albi illustrati', 'libri illustrati', 'picture book', 'picture books', 'prime letture', 'primi lettori', 'coming of age', 'formazione', 'crescere', 'crescita', 'principess', 'princess', 'fata', 'gnom', 'animali parlanti'],
      forti: ['fiaba', 'fiabe', 'favola', 'favole', 'filastrocca', 'filastrocche', 'albo illustrato', 'romanzo di formazione'],
      collane: /prime letture|primi lettori|albi illustrati|le fiabe|fiabe/,
      dewey: [R(398.2, 398.3), R(808.068, 808.069), R(28.5, 28.6)],
      autori: ['grimm', 'andersen', 'perrault', 'gianni rodari', 'rodari', 'esopo', 'fedro', 'roald dahl', 'beatrix potter', 'collodi', 'leo lionni', 'eric carle', 'julia donaldson'] },
    { id: 'miti', crea: 'Miti e leggende', livello: 1, nome: ['miti', 'mitolog', 'leggend', 'epica'],
      parole: ['mitolog', 'mythology', 'myths', 'miti', 'leggend', 'legend', 'legends', 'epica', 'epic poetry', 'odissea', 'iliade', 'eneide', 'dei greci', 'eroi greci', 'olimpo', 're artu', 'king arthur', 'nordic', 'norse'],
      forti: ['mitologia', 'miti', 'leggende', 'epica', 'odissea', 'iliade'],
      dewey: [R(292, 294), R(398.4, 398.5)], autori: ['omero', 'homer', 'virgilio', 'ovidio'] },
    { id: 'poesia', crea: 'Poesia', livello: 1, nome: ['poes', 'poet', 'rime'], parole: ['poetry', 'poems', 'poes', 'poem', 'rime', 'versi', 'liric', 'haiku', 'sonett'], forti: ['poesie', 'poesia', 'versi', 'liriche'], dewey: [], cifra: 1,
      autori: ['ungaretti', 'montale', 'leopardi', 'pascoli', 'quasimodo', 'alda merini', 'neruda', 'wislawa szymborska', 'emily dickinson', 'saba', 'carducci', 'petrarca'] },
    { id: 'teatro', crea: 'Teatro', livello: 1, nome: ['teatr', 'dramm'], parole: ['theater', 'theatre', 'drama', 'plays', 'teatro', 'teatral', 'commedi', 'tragedi', 'atto unico'], forti: ['teatro', 'commedia', 'tragedia', 'opera teatrale'], dewey: [R(792, 793)], cifra: 2,
      autori: ['shakespeare', 'goldoni', 'eduardo de filippo', 'de filippo', 'molière', 'moliere', 'cechov', 'ibsen', 'beckett', 'sofocle', 'euripide', 'aristofane'] },
    { id: 'fumetti', crea: 'Fumetti', livello: 1, nome: ['fumett', 'comic', 'graphic', 'manga'], parole: ['comics', 'graphic novel', 'graphic novels', 'manga', 'fumett', 'cartoon', 'strisce'], forti: ['fumetto', 'fumetti', 'graphic novel', 'manga'], dewey: [R(741.5, 741.6)],
      collane: /graphic novel|manga|fumett|topolino/, autori: ['zerocalcare', 'gipi', 'hugo pratt', 'goscinny', 'uderzo', 'herge', 'charles schulz', 'schulz', 'eiichiro oda', 'raina telgemeier', 'jeff smith', 'sio'] },
    /* ---- temi ---- */
    { id: 'educazione', crea: 'Educazione & Famiglia', livello: 2, fiction: false, nome: ['educa', 'famigl', 'scuol', 'pedagog', 'genitor', 'didatt'],
      parole: ['education', 'educational', 'teaching', 'school', 'family', 'families', 'parenting', 'child rearing', 'relationships', 'pedagog', 'educa', 'scuol', 'insegn', 'didatt', 'famigl', 'genitor', 'figli', 'maternit', 'paternit', 'adolescen', 'psicolog', 'psychology', 'self-help', 'maestr', 'teacher', 'apprendiment', 'bullismo', 'emozion', 'affettiv', 'crescita personale'],
      forti: ['educazione', 'genitori', 'pedagogia', 'psicologia', 'manuale per genitori'],
      dewey: [R(370, 380), R(306.8, 306.9), R(649, 650), R(155.4, 155.6), R(158, 159), R(305.23, 305.24), R(150, 160)] },
    { id: 'mare', crea: 'Marineria & Territorio', livello: 2, nome: ['marin', 'mare', 'nav', 'territor', 'napol', 'campan', 'porto', 'viagg', 'geograf'],
      parole: ['sea', 'seas', 'sailing', 'sailor', 'ships', 'naval', 'navy', 'maritime', 'ocean', 'boats', 'fishing', 'mare', 'marin', 'marittim', 'nave', 'navi', 'naviga', 'nautic', 'velier', 'porto', 'porti', 'pesca', 'pescator', 'golfo', 'napoli', 'naples', 'napoletan', 'neapolitan', 'campania', 'vesuvio', 'territor', 'local history', 'storia locale', 'geograph', 'geograf', 'mediterrane', 'grimaldi', 'traghett', 'travel', 'guide turistiche'],
      forti: ['napoli', 'napoletano', 'marineria', 'navigazione', 'campania'],
      dewey: [R(386, 388), R(623.8, 623.9), R(797.1, 797.2), R(551.46, 551.47), R(910, 920), R(359, 360), R(639.2, 639.3), R(945.7, 945.8), R(914.57, 914.58)] },
    { id: 'spirito', crea: 'Spiritualità & Valori', livello: 2, nome: ['spirit', 'valor', 'relig', 'fede', 'sacr', 'cristian', 'catechis', 'etic', 'teolog', 'chiesa', 'bibbi', 'vangel', 'catto', 'preghier', 'santi'],
      parole: ['religion', 'religious', 'spiritual', 'christian', 'catholic', 'church', 'bible', 'gospel', 'god', 'faith', 'prayer', 'saints', 'theology', 'ethics', 'values', 'religi', 'cristian', 'cattolic', 'chiesa', 'bibbi', 'vangel', 'dio', 'fede', 'preghier', 'santi', 'santo', 'santa', 'papa', 'san', 'beat', 'madonn', 'mission', 'teolog', 'etica', 'morale', 'valori', 'virtu', 'filosof', 'philosoph', 'gesu', 'jesus', 'catechis', 'liturg', 'sacrament'],
      forti: ['fede', 'preghiera', 'vangelo', 'bibbia', 'spiritualita', 'catechismo'],
      dewey: [R(200, 292), R(294, 300), R(170, 180), R(100, 150), R(160, 170)] },
    { id: 'storia', crea: 'Storia', livello: 2, fiction: false, nome: ['storia'], parole: ['history', 'stori', 'war', 'guerra', 'guerre', 'medioev', 'ancient', 'antich', 'resistenza', 'risorgimento', 'shoah', 'olocaust', 'holocaust', 'fascismo', 'nazismo', 'civilta'], forti: ['storia d italia', 'seconda guerra mondiale', 'prima guerra mondiale'], dewey: [R(930, 1000), R(900, 910)] },
    { id: 'scienza', crea: 'Scienze e natura', livello: 2, fiction: false, nome: ['scien', 'natur', 'ambient', 'ecolog'], parole: ['science', 'nature', 'natural', 'biology', 'physics', 'astronomy', 'environment', 'ecology', 'scienz', 'natura', 'ambient', 'ecolog', 'animali', 'piante', 'universo', 'corpo umano', 'dinosaur', 'matematic', 'mathematic'], forti: ['scienza', 'scientific', 'dinosauri'], dewey: [R(500, 600)] },
    { id: 'arte', crea: 'Arte e musica', livello: 2, nome: ['arte', 'arti', 'music', 'cinem', 'disegn'], parole: ['art', 'arts', 'music', 'cinema', 'painting', 'arte', 'musica', 'pittur', 'disegn', 'scultur', 'architett', 'fotograf'], forti: ['arte', 'musica', 'pittura'], dewey: [R(700, 741.5), R(741.6, 790)] },
    { id: 'sport', crea: 'Sport e giochi', livello: 2, nome: ['sport', 'giochi'], parole: ['sports', 'sport', 'football', 'calcio', 'recreation', 'giochi', 'gioco', 'olimpiad', 'basket', 'tennis'], forti: ['calcio', 'sport'], dewey: [R(790, 797.1), R(797.2, 800)] },
    { id: 'cucina', crea: 'Cucina', livello: 2, fiction: false, nome: ['cucin', 'ricett', 'aliment'], parole: ['cooking', 'cookbook', 'recipes', 'cucina', 'ricett', 'alimentazion'], forti: ['ricette', 'ricettario', 'cucina'], dewey: [R(641, 642)] },
    { id: 'societa', crea: 'Società e attualità', livello: 2, fiction: false, nome: ['societ', 'attualit', 'politic', 'diritt', 'econom', 'cittadin'], parole: ['society', 'social', 'politics', 'political', 'law', 'economics', 'societ', 'politic', 'diritt', 'econom', 'cittadinanza', 'costituzion', 'legalit', 'mafia', 'camorra', 'immigrazion', 'razzismo', 'diritti umani', 'lavoro', 'giornalism', 'attualit'], forti: ['mafia', 'camorra', 'costituzione', 'legalita'], dewey: [R(300, 305.23), R(305.24, 306.8), R(306.9, 359), R(360, 370), R(380, 386), R(388, 398.2), R(398.3, 398.4), R(398.5, 400)] },
    { id: 'lingue', crea: 'Lingue e dizionari', livello: 2, fiction: false, nome: ['lingu', 'dizionar', 'grammatic', 'vocabolar'], parole: ['language', 'dictionary', 'grammar', 'lingua', 'lingue', 'dizionar', 'grammatic', 'vocabolar', 'english'], forti: ['dizionario', 'grammatica', 'vocabolario'], dewey: [R(400, 500)] },
    { id: 'tecnica', crea: 'Tecnica e salute', livello: 2, fiction: false, nome: ['tecnic', 'tecnolog', 'salute', 'medicin', 'benesser', 'informatic'], parole: ['technology', 'medicine', 'health', 'engineering', 'computer', 'tecnolog', 'tecnic', 'salute', 'medicin', 'benesser', 'malatt', 'informatic'], forti: ['salute', 'informatica'], dewey: [R(600, 623.8), R(623.9, 639.2), R(639.3, 641), R(642, 649), R(650, 700)] },
    /* ---- generici: solo se non c'è niente di più preciso ---- */
    { id: 'narrativa', crea: 'Narrativa', livello: 3, fiction: true, letteratura: true, nome: ['narrat', 'romanzi', 'letterat', 'racconti'], parole: ['fiction', 'novel', 'novels', 'literature', 'literary', 'romanz', 'narrativ', 'letteratur', 'racconti', 'short stories', 'novelle'], forti: ['romanzo', 'racconti'], dewey: [] },
    { id: 'saggistica', crea: 'Saggistica', livello: 3, fiction: false, nome: ['saggi', 'saggist', 'divulgaz', 'inchiest', 'general', 'enciclop'], parole: ['saggio', 'saggi', 'essays', 'essay', 'nonfiction', 'non-fiction', 'inchiesta', 'reportage', 'divulgaz', 'pamphlet', 'enciclop', 'encyclopedia', 'curiosit'], forti: ['saggio', 'inchiesta', 'reportage'], dewey: [R(0, 28.5), R(28.6, 100)] }
  ];
  const BY = Object.fromEntries(FAM.map(f => [f.id, f]));
  /* indizi di libro per ragazzi (argomenti, collana, editore): il genere specifico resta quello del contenuto,
     ma un romanzo per ragazzi senza altri indizi va in "Fiabe & Crescita" invece che in "Narrativa" */
  const JUV = /(^|[^a-z])(juvenile|children|kids|junior|ragazz|bambin|infanzia|giovanil|young adult|prime letture|primi lettori|albi illustrati|battello a vapore|piccoli brividi|istrici|castoro|babalibri|gallucci|emme edizioni|edizioni el|einaudi ragazzi|mondadori ragazzi|piemme junior|giunti (junior|kids|editore junior)|lapis|sinnos|fatatrac|la coccinella|dami|usborne|geronimo stilton|tea stilton)/;
  const reCache = new Map();
  const kwRe = (k) => {
    if (!reCache.has(k)) reCache.set(k, k.length <= 4 && !k.includes(' ') ? new RegExp(`(^|[^a-z])${k}([^a-z]|$)`) : new RegExp(`(^|[^a-z])${k.replace(/[-\s]+/g, '[-\\s]+')}`));
    return reCache.get(k);
  };
  const hitList = (text, list) => (list || []).filter(k => kwRe(k).test(text));
  const lastName = (a) => { const w = words(String(a || '').split(/[,;&]| e | and /i)[0]); return w.length ? w[w.length - 1] : ''; };
  /* l'autore "Stephen King" (o "King, Stephen") corrisponde alla voce "stephen king"; "j k rowling" basta "rowling" */
  const authorMatch = (author, title, list) => {
    const tok = new Set(words(author)), tt = norm(title);
    return (list || []).find(e => { const w = words(e); return w.length && (w.every(x => tok.has(x)) || (w.length >= 2 && tt.includes(norm(e)))); }) || null;
  };
  /* numeri Dewey contenuti nelle stringhe SBN (es. "853.914 (22.) NARRATIVA ITALIANA" → 853.914) */
  const deweyNums = (list) => (list || []).map(s => (/(^|[^\d.])(\d{3})(?!\d)(\.\d+)?/.exec(String(s)) || [])).filter(m => m[2]).map(m => parseFloat(m[2] + (m[3] || '')));
  const deweyKey = (list) => { const n = deweyNums(list)[0]; return n == null ? '' : n.toFixed(3).slice(0, 5); };
  const inDewey = (fam, n) => {
    if ((fam.dewey || []).some(([a, b]) => n >= a && n < b)) return true;
    const i = Math.floor(n);
    if (fam.letteratura && i >= 800 && i < 900 && ![1, 2].includes(i % 10)) return true;
    if (fam.cifra && i >= 800 && i < 900 && i % 10 === fam.cifra) return true;
    return false;
  };

  function familiesOf(name) { const gw = words(name); return FAM.filter(f => f.nome.some(n => gw.some(w => w.startsWith(n)))); }
  /* coppie di generi che parlano della stessa cosa (es. "Fede" e "Spiritualità & Valori") */
  function similar(genres) {
    const out = [];
    for (let i = 0; i < genres.length; i++) for (let j = i + 1; j < genres.length; j++) {
      const a = genres[i], b = genres[j];
      const fa = familiesOf(a.nome).map(f => f.id), fb = familiesOf(b.nome).map(f => f.id);
      const wa = words(a.nome).filter(w => w.length >= 4).map(w => w.slice(0, 7)), wb = words(b.nome).filter(w => w.length >= 4).map(w => w.slice(0, 7));
      if (fa.some(x => fb.includes(x)) || wa.some(w => wb.includes(w))) out.push([a, b]);
    }
    return out;
  }
  function findSimilar(name, genres) {
    const p = similar([{ id: '__new', nome: name }, ...genres]).find(([a, b]) => a.id === '__new' || b.id === '__new');
    return p ? (p[0].id === '__new' ? p[1] : p[0]) : null;
  }
  const isGeneric = (name) => norm(name) === norm(VARIE) || (familiesOf(name).length > 0 && familiesOf(name).every(f => f.livello === 3));

  /* punteggio di ogni famiglia di argomenti per un libro, con l'indizio principale */
  function scoreFamilies(info) {
    const subj = (info.soggetti || []).map(norm), dew = (info.dewey || []).map(norm);
    const tSubj = ' ' + subj.join(' | ') + ' ', tDew = ' ' + dew.join(' | ') + ' ';
    const tTitle = ' ' + norm(info.titolo) + ' ', tDesc = ' ' + norm(info.descrizione) + ' ', tCol = ' ' + norm(info.collana) + ' ';
    const dn = deweyNums(info.dewey);
    const juvenile = JUV.test(' ' + [tSubj, tCol, norm(info.editore), tDew].join(' ') + ' ');
    const fictionCtx = dn.some(n => n >= 800 && n < 900 && Math.floor(n) % 10 === 3) || /(^|[^a-z])(fiction|romanz|narrativ|novel|racconti)/.test(tSubj + tDew);
    const nonfictionCtx = dn.some(n => n < 800 || n >= 900) || /(^|[^a-z])(saggi|essays|non-fiction|nonfiction|manual|guida)/.test(tSubj);
    const res = FAM.map((f) => {
      const ev = [];
      const add = (pts, why) => { if (pts > 0) ev.push([pts, why]); };
      const au = authorMatch(info.autore, '', f.autori); if (au) add(9, `autore noto per questo genere (${info.autore})`);
      const tt = authorMatch('', info.titolo, f.autori); if (tt) add(6, 'dal titolo');
      if (f.collane && f.collane.test(tCol)) add(8, `collana «${info.collana}»`);
      if (dn.some(n => inDewey(f, n)) && !(juvenile && f.letteratura)) add(5, 'classificazione Dewey del catalogo SBN');
      const hs = hitList(tSubj, f.parole), hd = hitList(tDew, f.parole);
      add(Math.min(hs.length, 3) * 4, `argomenti: ${(info.soggetti || []).slice(0, 3).join(', ')}`);
      if (!(juvenile && f.letteratura)) add(Math.min(hd.length, 2) * 3, 'classificazione Dewey del catalogo SBN');
      add(Math.min(hitList(tTitle, f.forti).length, 2) * 4 + Math.min(hitList(tTitle, f.parole).length, 2) * 2, 'dal titolo');
      add(Math.min(hitList(tDesc, f.forti).length, 2) * 3 + Math.min(hitList(tDesc, f.parole).length, 3), 'dalla descrizione');
      let score = ev.reduce((s, e) => s + e[0], 0);
      if (f.fiction === true && nonfictionCtx && !fictionCtx) score *= 0.3;
      if (f.fiction === false && fictionCtx && !nonfictionCtx && f.id !== 'biografia') score *= 0.4;
      if (f.id === 'fiabe' && juvenile) score += 2;
      const why = ev.sort((a, b) => b[0] - a[0])[0];
      return { fam: f, score, why: why ? why[1] : '' };
    });
    return { res, juvenile, fictionCtx, nonfictionCtx };
  }

  /* Genere per un libro: sempre riempito. Restituisce { genere, motivo, nuovo, varie? } */
  function classify(info, genres, books, exceptId) {
    const real = (books || []).filter(b => b.id !== exceptId && b.genere && !isGeneric(b.genere));
    const vote = (list) => { const c = {}; list.forEach(b => { c[b.genere] = (c[b.genere] || 0) + 1; }); const top = Object.entries(c).sort((x, y) => y[1] - x[1]); return top.length && (top.length === 1 || top[0][1] > top[1][1]) ? top[0][0] : null; };
    const { res, juvenile, fictionCtx, nonfictionCtx } = scoreFamilies(info);
    const famScore = Object.fromEntries(res.map(r => [r.fam.id, r]));
    /* candidati: i tuoi generi (con il punteggio della loro famiglia) + i generi a nome fisso che ancora non hai */
    const cand = [];
    const covered = new Set();
    for (const g of genres) {
      const fams = familiesOf(g.nome);
      fams.forEach(f => covered.add(f.id));
      let best = fams.map(f => famScore[f.id]).sort((a, b) => b.score - a.score)[0];
      if (!best) { /* genere tuo senza famiglia: si confronta il suo nome con gli argomenti */
        const own = words(g.nome).filter(w => w.length >= 4).map(w => w.slice(0, Math.max(4, w.length - 2)));
        const t = ' ' + [(info.soggetti || []).join(' | '), info.titolo, (info.dewey || []).join(' ')].map(norm).join(' | ') + ' ';
        const n = hitList(t, own).length;
        best = { fam: { livello: 1 }, score: n * 4, why: 'dal nome del genere' };
      }
      cand.push({ genere: g.nome, nuovo: false, livello: fams.length ? Math.min(...fams.map(f => f.livello)) : 1, score: best.score, why: best.why });
    }
    for (const r of res) {
      if (covered.has(r.fam.id)) continue;
      if (genres.some(g => norm(g.nome) === norm(r.fam.crea)) || findSimilar(r.fam.crea, genres)) continue;
      cand.push({ genere: r.fam.crea, nuovo: true, livello: r.fam.livello, score: r.score, why: r.why });
    }
    /* imparare dal catalogo: stesso autore, stessa classificazione, stessi argomenti */
    const ln = lastName(info.autore);
    const byAuthor = ln && ln.length >= 3 ? vote(real.filter(b => lastName(b.autore) === ln)) : null;
    const dk = deweyKey(info.dewey);
    const sameDew = dk ? real.filter(b => b.dewey && deweyKey([b.dewey]) === dk) : [];
    const byDewey = sameDew.length >= 2 ? vote(sameDew) : null;
    const subj = (info.soggetti || []).map(norm);
    const bySubj = subj.length ? vote(real.filter(b => (b.soggetti || []).some(x => subj.includes(norm(x))))) : null;
    for (const c of cand) {
      if (byAuthor === c.genere) { c.score += 10; c.why = `come gli altri libri di ${String(info.autore).split(/,|;/)[0].trim()} in catalogo`; }
      if (byDewey === c.genere) { c.score += 4; if (!c.why) c.why = 'come gli altri libri del catalogo con la stessa classificazione'; }
      if (bySubj === c.genere) { c.score += 5; if (!c.why || c.score < 9) c.why = 'come altri libri del catalogo con gli stessi argomenti'; }
    }
    /* scelta: il punteggio più alto, preferendo i generi specifici e, a parità, quelli che hai già */
    const rank = (c) => c.score + (c.score >= 3 ? (c.livello === 1 ? 3 : c.livello === 2 ? 1 : 0) : 0) + (c.nuovo ? 0 : 0.5);
    const strong = cand.filter(c => c.score >= 3 && c.livello < 3).sort((a, b) => rank(b) - rank(a));
    const pick = (c) => ({ genere: c.genere, motivo: c.why || 'in base agli indizi trovati', nuovo: c.nuovo });
    if (strong.length) return pick(strong[0]);
    /* nessun genere specifico: libro per ragazzi → Fiabe & Crescita; romanzo → Narrativa; saggio → Saggistica */
    const fallback = (id, why) => {
      const own = cand.find(c => !c.nuovo && familiesOf(c.genere).some(f => f.id === id));
      if (own) return { genere: own.genere, motivo: why, nuovo: false };
      const crea = BY[id].crea, twin = genres.find(g => norm(g.nome) === norm(crea)) || findSimilar(crea, genres);
      return twin ? { genere: twin.nome, motivo: why, nuovo: false } : { genere: crea, motivo: why, nuovo: true };
    };
    if (juvenile) return fallback('fiabe', 'libro per ragazzi senza un genere più preciso');
    const generic = cand.filter(c => c.score >= 2).sort((a, b) => rank(b) - rank(a))[0];
    if (generic) return pick(generic);
    if (fictionCtx) return fallback('narrativa', 'romanzo senza indizi su un genere più preciso');
    if (nonfictionCtx) return fallback('saggistica', 'saggio senza indizi su un argomento più preciso');
    const v = genres.find(g => norm(g.nome) === norm(VARIE));
    return { genere: v ? v.nome : VARIE, motivo: 'nessun indizio su questo libro: cambialo se vuoi', nuovo: !v, varie: true };
  }
  /* compatibilità: suggerimento solo se c'è un indizio vero (niente "Varie") */
  function suggest(info, genres, books, exceptId) { const r = classify(info, genres, books, exceptId); return r.varie ? null : r; }
  return { classify, suggest, similar, findSimilar, familiesOf, isGeneric, names: () => FAM.map(f => f.crea) };
})();

/* ---------- Scanner con fotocamera ---------- */
const Scanner = (() => {
  let dlg, video, msg, torchBtn, fileIn;
  let stream = null, loop = null, resolver = null, torchOn = false, lastBad = 0;
  let zxingPromise = null;

  const loadZXing = () => zxingPromise || (zxingPromise = new Promise((res, rej) => {
    if (window.ZXing) return res(window.ZXing);
    const s = document.createElement('script');
    s.src = 'zxing.min.js';
    s.onload = () => res(window.ZXing);
    s.onerror = () => { zxingPromise = null; rej(new Error('Manca il file zxing.min.js nella cartella.')); };
    document.head.appendChild(s);
  }));

  async function nativeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const f = await window.BarcodeDetector.getSupportedFormats();
      const want = ['ean_13', 'qr_code'].filter(x => f.includes(x));
      return want.includes('ean_13') ? new window.BarcodeDetector({ formats: want }) : null;
    } catch { return null; }
  }

  /* Decodificatore ZXing: riceve un'immagine (canvas) e restituisce il testo del codice, o null */
  let zx = null, canvas = null;
  async function zxingDecoder() {
    if (zx) return zx;
    const Z = await loadZXing();
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.QR_CODE]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const r = new Z.MultiFormatReader(); r.setHints(hints);
    zx = (cv) => {
      try { return r.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)))).getText(); }
      catch { return null; } finally { r.reset(); }
    };
    return zx;
  }
  /* Copia un fotogramma (video o foto) in un canvas, ridotto a una dimensione gestibile */
  function toCanvas(src, w, h, max = 1280) {
    const k = Math.min(1, max / Math.max(w, h));
    canvas = canvas || document.createElement('canvas');
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function build() {
    if (dlg) return;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog class="modal scan-dlg" id="scan-dlg" aria-labelledby="scan-title">
        <div class="modal-h">
          <h2 id="scan-title">Inquadra il codice a barre</h2>
          <button class="icon-btn" data-scan-close aria-label="Chiudi"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="scan-view">
          <video playsinline muted autoplay></video>
          <div class="scan-frame" aria-hidden="true"><span class="scan-laser"></span></div>
          <div class="scan-ok" aria-hidden="true"><i class="fa-solid fa-check"></i></div>
        </div>
        <p class="scan-msg" role="status" aria-live="polite"></p>
        <div class="modal-f scan-actions">
          <label class="btn" tabindex="0"><i class="fa-solid fa-image"></i> Usa una foto<input type="file" accept="image/*" capture="environment" hidden></label>
          <button type="button" class="btn hidden" data-scan-torch><i class="fa-solid fa-lightbulb"></i> Torcia</button>
          <button type="button" class="btn" data-scan-close>Annulla</button>
        </div>
      </dialog>`);
    dlg = document.getElementById('scan-dlg');
    video = dlg.querySelector('video'); msg = dlg.querySelector('.scan-msg');
    torchBtn = dlg.querySelector('[data-scan-torch]'); fileIn = dlg.querySelector('input[type=file]');
    dlg.querySelectorAll('[data-scan-close]').forEach(b => b.addEventListener('click', () => finish(null)));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(null); });
    dlg.querySelector('label.btn').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
    fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) fromPhoto(f); });
    torchBtn.addEventListener('click', async () => {
      const t = stream && stream.getVideoTracks()[0]; if (!t) return;
      torchOn = !torchOn;
      try { await t.applyConstraints({ advanced: [{ torch: torchOn }] }); torchBtn.classList.toggle('active', torchOn); } catch { torchBtn.classList.add('hidden'); }
    });
  }

  const say = (t, cls = '') => { msg.textContent = t; msg.className = `scan-msg ${cls}`; };

  function stop() {
    if (loop) { cancelAnimationFrame(loop); loop = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (video) video.srcObject = null;
    torchOn = false;
  }

  function finish(isbn) {
    stop();
    dlg.classList.remove('done');
    if (dlg.open) dlg.close();
    const r = resolver; resolver = null;
    if (r) r(isbn);
  }

  /* Ogni codice letto passa da qui.
     Modalità "isbn": si accetta solo un ISBN valido (restituisce la stringa).
     Modalità "any": si accetta anche il QR dell'etichetta Spes-F (restituisce { type: 'isbn'|'catalogo', value }). */
  let mode = 'isbn';
  const accept = (result, label) => {
    if (navigator.vibrate) navigator.vibrate(90);
    dlg.classList.add('done');
    say(`Letto: ${label}`, 'ok');
    stop();
    setTimeout(() => finish(result), 450);
    return true;
  };
  function candidate(raw) {
    if (mode === 'any') { const cat = parseCatalog(raw); if (cat) return accept({ type: 'catalogo', value: cat }, cat); }
    const isbn = ISBN.fromBarcode(raw);
    if (isbn) return accept(mode === 'any' ? { type: 'isbn', value: isbn } : isbn, isbn);
    if (Date.now() - lastBad > 1500) {
      lastBad = Date.now();
      say(mode === 'any' ? 'Codice non riconosciuto: inquadra il codice a barre ISBN del libro o il QR dell’etichetta Spes-F.' : 'Questo codice non è un ISBN: cerca il codice a barre che inizia con 978 o 979.', 'warn');
    }
    return false;
  }
  /* Il QR delle etichette contiene l'indirizzo della scheda (…catalogo.html?cat=C-0012) oppure solo il codice.
     Si accettano anche le etichette del formato precedente (CAT-0012), con lo stesso numero. */
  function parseCatalog(raw) {
    const t = String(raw || '').trim();
    const code = (/[?&]cat=([^&#\s]+)/i.exec(t) || [])[1];
    const v = code ? decodeURIComponent(code) : t.replace(/^SPESF:/i, '');
    const m = /^C(?:AT)?[-\s]?0*(\d{1,6})$/i.exec(v.trim());
    return m && +m[1] > 0 ? 'C-' + m[1].padStart(4, '0') : null;
  }

  function cameraError(e) {
    const n = e && e.name;
    if (!window.isSecureContext) return 'La fotocamera funziona solo sul sito online (https). Puoi usare una foto.';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Accesso alla fotocamera negato. Consentilo nelle impostazioni del browser, oppure usa una foto.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Nessuna fotocamera trovata su questo dispositivo: usa una foto.';
    if (n === 'NotReadableError') return 'La fotocamera è usata da un’altra app. Chiudila e riprova, oppure usa una foto.';
    return 'Non riesco ad avviare la fotocamera su questo dispositivo. Usa “Usa una foto”: scatta una foto ravvicinata del codice a barre.';
  }

  const constraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say(cameraError({}), 'warn'); return; }
    say('Avvio della fotocamera…');
    try {
      const det = await nativeDetector();
      const decode = det ? null : await zxingDecoder();
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!resolver) return stop();
      video.srcObject = stream;
      try { await video.play(); } catch {}
      const t = stream.getVideoTracks()[0];
      const caps = t.getCapabilities ? t.getCapabilities() : {};
      torchBtn.classList.toggle('hidden', !caps.torch);
      say(mode === 'any' ? 'Inquadra il codice a barre ISBN o il QR dell’etichetta, ben illuminati.' : 'Tieni il codice a barre dentro il riquadro, ben illuminato.');
      let busy = false, last = 0;
      const tick = async (now) => {
        if (!stream) return;
        loop = requestAnimationFrame(tick);
        if (busy || video.readyState < 2 || now - last < (det ? 120 : 220)) return;
        busy = true; last = now;
        try {
          if (det) { const codes = await det.detect(video); for (const c of codes) if (candidate(c.rawValue)) return; }
          else { const txt = decode(toCanvas(video, video.videoWidth, video.videoHeight)); if (txt) candidate(txt); }
        } catch {} finally { busy = false; }
      };
      loop = requestAnimationFrame(tick);
    } catch (e) { stop(); say(cameraError(e), 'warn'); }
  }

  async function fromPhoto(file) {
    stop();
    say('Lettura della foto…');
    try {
      const img = await createImageBitmap(file);
      let found = null;
      const det = await nativeDetector();
      if (det) {
        const codes = await det.detect(img);
        found = codes.map(c => c.rawValue).find(c => (mode === 'any' && parseCatalog(c)) || ISBN.fromBarcode(c)) || (codes[0] && codes[0].rawValue) || null;
      }
      if (!found) {
        const decode = await zxingDecoder();
        /* le foto del telefono sono grandi: si prova a due risoluzioni */
        found = decode(toCanvas(img, img.width, img.height, 1600)) || decode(toCanvas(img, img.width, img.height, 900));
      }
      if (found && candidate(found)) return;
      say(found ? (mode === 'any' ? 'Il codice nella foto non è un ISBN né un’etichetta Spes-F.' : 'Il codice nella foto non è un ISBN.') : 'Nessun codice a barre trovato nella foto: avvicinati, metti a fuoco e riprova.', 'warn');
    } catch (e) { say((e && e.message) || 'Impossibile leggere la foto.', 'warn'); }
  }

  /* Apre lo scanner. Senza opzioni restituisce l'ISBN a 13 cifre letto (o null se si annulla).
     Con { any: true } accetta anche il QR dell'etichetta e restituisce { type, value }. */
  function scan(title = 'Inquadra il codice a barre', opts = {}) {
    build();
    mode = opts.any ? 'any' : 'isbn';
    if (resolver) finish(null);
    dlg.querySelector('#scan-title').textContent = title;
    dlg.classList.remove('done');
    torchBtn.classList.add('hidden');
    return new Promise((res) => {
      resolver = res;
      dlg.showModal();
      startCamera();
    });
  }

  /* QR code in SVG (per le etichette), generato con la stessa libreria usata per leggere.
     Un solo tracciato vettoriale con margine di 2 moduli: nitido in stampa a qualsiasi dimensione. */
  async function qrSvg(text, size = 120) {
    const Z = await loadZXing();
    const hints = new Map(); hints.set(Z.EncodeHintType.CHARACTER_SET, 'UTF-8');
    const m = Z.QRCodeEncoder.encode(String(text), Z.QRCodeDecoderErrorCorrectionLevel.M, hints).getMatrix();
    const w = m.getWidth(), h = m.getHeight(), q = 2; let d = '';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (m.get(x, y) !== 1) continue;
      let r = 1; while (x + r < w && m.get(x + r, y) === 1) r++;
      d += `M${x + q} ${y + q}h${r}v1h-${r}z`; x += r - 1;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w + q * 2} ${h + q * 2}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0A1A30"/></svg>`;
  }

  return { scan, qrSvg, parseCatalog, stop: () => finish(null) };
})();

window.ISBN = ISBN;
window.Scanner = Scanner;
