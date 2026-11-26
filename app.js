/**
 * app.js – shell condivisa (sidebar, topbar), toast, dialog e componenti riusabili
 * © 2026 Angelo Alaia – Tutti i diritti riservati
 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => escapeHTML(s); /* da state.js: funziona anche prima che i dati siano caricati */
const giorni = (n) => (n === 1 ? '1 giorno' : `${n} giorni`);

/* ---------- Componenti ---------- */
const UI = {
  hue(str) { let h = 7; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return Math.round((h * 137.508) % 360); },
  avatar(m, size = '') {
    const ini = `${(m.nome || '?')[0]}${(m.cognome || '')[0] || ''}`.toUpperCase();
    return `<span class="avatar ${size}" style="--h:${UI.hue(m.id)}" aria-hidden="true">${esc(ini)}</span>`;
  },
  statusTag(l) {
    if (l.computedStatus === 'Restituito') return `<span class="tag plain">Rientrato il ${D.fmt(l.dataRestituzione)}</span>`;
    if (l.computedStatus === 'In ritardo') return `<span class="tag late">In ritardo di ${giorni(l.daysDiff)}</span>`;
    if (l.computedStatus === 'In scadenza') return `<span class="tag warn">${l.daysLeft === 0 ? 'Scade oggi' : `Scade tra ${giorni(l.daysLeft)}`}</span>`;
    return `<span class="tag ok">Mancano ${giorni(l.daysLeft)}</span>`;
  },
  /* Etichetta colorata di un club (colore validato nello store come hex a 6 cifre) */
  clubTag(c, withAge = false) {
    if (!c) return '<span class="tag plain">Nessun club</span>';
    return `<span class="tag plain ctag" style="--cc:${c.colore}">${esc(c.nome)}${withAge ? ` <span class="ctag-age">${esc(store.clubEta(c))}</span>` : ''}</span>`;
  },
  /* Paginazione condivisa: state = { page }. slice() restituisce la pagina corrente, html() i controlli */
  pageSlice(list, state, size = 20) {
    const pages = Math.max(1, Math.ceil(list.length / size));
    state.page = Math.min(Math.max(1, state.page || 1), pages);
    const start = (state.page - 1) * size;
    return { items: list.slice(start, start + size), pages, total: list.length, from: list.length ? start + 1 : 0, to: Math.min(start + size, list.length), page: state.page };
  },
  pager(info, label = 'elementi') {
    if (info.total <= 0 || info.pages <= 1) return info.total ? `<div class="pager"><span class="pager-info">${info.total} ${esc(label)}</span></div>` : '';
    const p = info.page, n = info.pages, nums = [];
    for (let i = 1; i <= n; i++) if (i === 1 || i === n || Math.abs(i - p) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return `<nav class="pager" aria-label="Pagine">
      <span class="pager-info">${info.from}–${info.to} di ${info.total} ${esc(label)}</span>
      <span class="pager-btns">
        <button class="pg" data-page="${p - 1}" ${p === 1 ? 'disabled' : ''} aria-label="Pagina precedente"><i class="fa-solid fa-chevron-left"></i></button>
        ${nums.map(i => i === '…' ? '<span class="pg-gap">…</span>' : `<button class="pg ${i === p ? 'on' : ''}" data-page="${i}" ${i === p ? 'aria-current="page"' : ''}>${i}</button>`).join('')}
        <button class="pg" data-page="${p + 1}" ${p === n ? 'disabled' : ''} aria-label="Pagina successiva"><i class="fa-solid fa-chevron-right"></i></button>
      </span></nav>`;
  },
  /* collega i pulsanti di una paginazione: al clic cambia pagina e ridisegna */
  bindPager(host, state, redraw) {
    host.addEventListener('click', (e) => {
      const b = e.target.closest('.pg[data-page]'); if (!b || b.disabled) return;
      state.page = Number(b.dataset.page); redraw();
      const top = host.closest('.panel') || host.previousElementSibling; if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  },
  /* Conferma elegante al posto di window.confirm. Restituisce una Promise<boolean>.
     opts: { title, ok, cancel, danger, word } – con "word" il pulsante si attiva solo dopo averla scritta */
  confirm(message, opts = {}) {
    const { title = 'Confermi?', ok = 'Conferma', cancel = 'Annulla', danger = false, word = '' } = opts;
    let d = document.getElementById('ui-confirm');
    if (!d) { d = document.createElement('dialog'); d.id = 'ui-confirm'; d.className = 'modal confirm'; d.setAttribute('aria-labelledby', 'ui-confirm-t'); document.body.appendChild(d); }
    d.classList.toggle('is-danger', !!danger);
    d.innerHTML = `
      <div class="modal-b confirm-b">
        <span class="confirm-ic" aria-hidden="true"><i class="fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i></span>
        <div class="confirm-t"><h2 id="ui-confirm-t">${esc(title)}</h2>${String(message || '').split('\n').filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}
          ${word ? `<label class="confirm-word">Scrivi <b>${esc(word)}</b> per procedere<input class="input" autocomplete="off" spellcheck="false" aria-label="Scrivi ${esc(word)} per procedere"></label>` : ''}</div>
      </div>
      <div class="modal-f"><button type="button" class="btn" data-v="0">${esc(cancel)}</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-v="1" ${word ? 'disabled' : ''}>${esc(ok)}</button></div>`;
    return new Promise((resolve) => {
      let result = false;
      const okBtn = d.querySelector('[data-v="1"]'), inp = d.querySelector('.confirm-word input');
      if (inp) inp.addEventListener('input', () => { okBtn.disabled = inp.value.trim().toUpperCase() !== word.toUpperCase(); });
      d.querySelector('.modal-f').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; result = b.dataset.v === '1'; d.close(); });
      d.addEventListener('close', () => resolve(result), { once: true });
      d.showModal();
      setTimeout(() => (inp || okBtn).focus(), 40);
    });
  },
  /* Scelta fra più strade (es. "tutte le copie" / "solo questa"). Restituisce il valore scelto, oppure null se si annulla.
     opts: { title, icon, options: [{ value, label, hint, icon, primary, danger }], cancel } */
  choose(message, opts = {}) {
    const { title = 'Cosa preferisci?', icon = 'fa-circle-question', options = [], cancel = 'Annulla' } = opts;
    let d = document.getElementById('ui-choose');
    if (!d) { d = document.createElement('dialog'); d.id = 'ui-choose'; d.className = 'modal confirm choose'; d.setAttribute('aria-labelledby', 'ui-choose-t'); document.body.appendChild(d); }
    d.innerHTML = `
      <div class="modal-b confirm-b">
        <span class="confirm-ic" aria-hidden="true"><i class="fa-solid ${esc(icon)}"></i></span>
        <div class="confirm-t"><h2 id="ui-choose-t">${esc(title)}</h2>${String(message || '').split('\n').filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}
          <div class="choices">${options.map((o, i) => `<button type="button" class="choice ${o.primary ? 'primary' : ''} ${o.danger ? 'danger' : ''}" data-i="${i}">
            <span class="choice-ic" aria-hidden="true"><i class="fa-solid ${esc(o.icon || 'fa-check')}"></i></span>
            <span class="choice-t"><b>${esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`).join('')}</div></div>
      </div>
      <div class="modal-f"><button type="button" class="btn" data-cancel>${esc(cancel)}</button></div>`;
    return new Promise((resolve) => {
      let result = null;
      d.addEventListener('click', function pick(e) {
        const c = e.target.closest('.choice'), x = e.target.closest('[data-cancel]');
        if (!c && !x) return;
        if (c) result = options[Number(c.dataset.i)].value;
        d.removeEventListener('click', pick); d.close();
      });
      d.addEventListener('close', () => resolve(result), { once: true });
      d.showModal();
      setTimeout(() => (d.querySelector('.choice.primary') || d.querySelector('.choice'))?.focus(), 40);
    });
  },
  /* Testo con le parole cercate messe in evidenza (<mark>). Il testo viene sempre "ripulito" prima di finire nella pagina */
  mark(text, q) {
    const t = String(text ?? ''), words = String(q || '').toLowerCase().split(/\s+/).filter(w => w.length >= 2).slice(0, 6);
    if (!words.length) return esc(t);
    const low = t.toLowerCase(), hit = new Array(t.length).fill(false);
    words.forEach((w) => { let i = -1; while ((i = low.indexOf(w, i + 1)) !== -1) for (let k = i; k < i + w.length; k++) hit[k] = true; });
    let out = '', i = 0;
    while (i < t.length) { let j = i; while (j < t.length && hit[j] === hit[i]) j++; out += hit[i] ? `<mark>${esc(t.slice(i, j))}</mark>` : esc(t.slice(i, j)); i = j; }
    return out;
  },
  catTag(code) { return code ? `<span class="cat-tag mono" title="Numero di catalogo">${esc(code)}</span>` : ''; },
  empty(icon, title, text = '') {
    /* piccola illustrazione (libri su una mensola) con l'icona della sezione */
    return `<div class="empty"><div class="empty-art" aria-hidden="true"><svg viewBox="0 0 132 104" focusable="false">
      <ellipse class="e-blob" cx="66" cy="56" rx="62" ry="44"/>
      <g class="e-float"><rect class="e-b1" x="30" y="34" width="16" height="50" rx="4"/><path class="e-line" d="M35 44h6M35 50h6"/>
        <rect class="e-b2" x="49" y="24" width="18" height="60" rx="4"/><path class="e-line" d="M54 36h8M54 42h8"/>
        <rect class="e-b3" x="70" y="40" width="14" height="44" rx="4"/><rect class="e-b4" x="86" y="31" width="15" height="53" rx="4" transform="rotate(11 93 84)"/></g>
      <rect class="e-shelf" x="20" y="84" width="92" height="5" rx="2.5"/>
      <path class="e-star" d="M108 12l2.2 5.8 5.8 2.2-5.8 2.2-2.2 5.8-2.2-5.8-5.8-2.2 5.8-2.2z"/><path class="e-star" d="M20 20l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><path class="e-star" d="M122 56l1.2 3.2 3.2 1.2-3.2 1.2-1.2 3.2-1.2-3.2-3.2-1.2 3.2-1.2z"/>
    </svg><i class="fa-solid ${icon}"></i></div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
  }
};

/* Notifica breve. opts.action = { label, run }: aggiunge un pulsante (es. "Apri scheda") e resta visibile più a lungo */
function toast(msg, type = 'ok', opts = {}) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const el = document.createElement('div');
  const life = opts.action ? 6000 : type === 'err' ? 4600 : 3200;
  el.className = `toast ${type}${opts.action ? ' has-action' : ''}`;
  el.style.setProperty('--life', life + 'ms');
  el.innerHTML = `<i class="fa-solid ${type === 'err' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${esc(msg)}</span>${opts.action ? `<button type="button" class="toast-act">${esc(opts.action.label)}</button>` : ''}`;
  if (opts.action) el.querySelector('.toast-act').addEventListener('click', () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); opts.action.run(); });
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove(); /* al massimo tre notifiche insieme */
  setTimeout(() => el.classList.add('out'), life);
  setTimeout(() => el.remove(), life + 400);
}

const openDlg = (id) => { const d = document.getElementById(id); if (d && !d.open) d.showModal(); };
const closeDlg = (id) => { const d = document.getElementById(id); if (d && d.open) d.close(); };

/* Chiusura dialog: pulsanti [data-close] e clic sullo sfondo */
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c) c.closest('dialog')?.close();
  if (e.target instanceof HTMLDialogElement) e.target.close();
});

/* Azioni sui prestiti (restituisci / rinnova), riusate in più pagine */
function bindLoanActions(after) {
  document.addEventListener('click', (e) => {
    const ret = e.target.closest('[data-return]');
    const ren = e.target.closest('[data-renew]');
    if (!ret && !ren) return;
    const r = ret ? store.returnLoan(ret.dataset.return) : store.renewLoan(ren.dataset.renew);
    if (!r.ok) return toast(r.error, 'err');
    toast(ret ? `Rientrato${r.catalogo ? ' ' + r.catalogo : ''}: ${r.titolo}` : `Rinnovato fino al ${D.fmt(r.dataScadenza)}`);
    updateBadge();
    after();
  });
}

/* ---------- Shell ---------- */
function updateBadge() {
  if (!window.store) return;
  const st = store.getStats(), n = st.overdueLoansCount;
  const el = $('#nav-badge');
  if (el) { el.textContent = n; el.classList.toggle('hidden', n === 0); }
  const dot = $('#tab-dot'); if (dot) { dot.textContent = n; dot.classList.toggle('hidden', n === 0); }
  /* numeri discreti accanto alle voci del menu: si capisce a colpo d'occhio cosa c'è in archivio */
  const counts = { 'catalogo.html': st.totalBooks, 'prestiti.html': st.activeLoansCount, 'iscritti.html': st.totalMembers, 'club.html': st.totalClubs };
  $$('.nav a[href]').forEach((a) => {
    const v = counts[a.getAttribute('href')]; if (v === undefined) return;
    let c = $('.nav-n', a); if (!c) { c = document.createElement('span'); c.className = 'nav-n'; a.appendChild(c); }
    c.textContent = v; c.title = a.getAttribute('href') === 'prestiti.html' ? 'Prestiti in corso' : a.getAttribute('href') === 'catalogo.html' ? `${st.totalBooks === 1 ? '1 copia' : st.totalBooks + ' copie'} di ${st.totalTitles === 1 ? '1 titolo' : st.totalTitles + ' titoli'}` : '';
  });
}

function renderAppShell() {
  const sidebar = $('#app-sidebar'), header = $('#app-header');
  const path = location.pathname.split('/').pop() || 'index.html';
  /* [pagina, nome, icona, contatore dei ritardi, colore della sezione] */
  const groups = [
    { t: 'Panoramica', items: [['index.html', 'Dashboard', 'fa-table-cells-large', false, '#3FA9FF'], ['riepilogo.html', 'Riepilogo settimanale', 'fa-calendar-week', false, '#F59E0B'], ['notifiche.html', 'Solleciti', 'fa-bell', true, '#F0456A']] },
    { t: 'Gestione', items: [['catalogo.html', 'Catalogo', 'fa-book-open', false, '#8F73FF'], ['prestiti.html', 'Prestiti', 'fa-right-left', false, '#12B981'], ['iscritti.html', 'Iscritti alla Spes-F', 'fa-users', false, '#14B8C4'], ['club.html', 'Club', 'fa-people-roof', false, '#FF7A33']] }
  ];

  if (sidebar) {
    sidebar.innerHTML = `
      <a class="brand" href="index.html" aria-label="Fondazione Grimaldi – Dashboard"><img src="logo-grimaldi-negativo.png" alt="Fondazione Grimaldi Ente Filantropico"></a>
      <nav class="nav" aria-label="Navigazione principale">
        ${groups.map(g => `<h4>${g.t}</h4>${g.items.map(([href, label, icon, badge, ic]) =>
          `<a href="${href}" ${path === href ? 'aria-current="page"' : ''} style="--ic:${ic}"><i class="fa-solid ${icon}"></i><span>${label}</span>${badge ? '<span class="count hidden" id="nav-badge">0</span>' : ''}</a>`).join('')}`).join('')}
      </nav>
      <div class="me">${UI.avatar({ id: 'segreteria', nome: 'Se', cognome: 'gr' }, 'sm')}
        <div style="min-width:0;flex:1"><b>Segreteria</b><span class="me-mail">${CLOUD_ON ? (window.Cloud.user ? esc(window.Cloud.user.email) : 'Collegamento all’archivio…') : 'Modalità locale · dati su questo computer'}</span></div>
        ${CLOUD_ON ? '<button class="icon-btn" id="logout" aria-label="Esci" title="Esci"><i class="fa-solid fa-right-from-bracket"></i></button>' : ''}
      </div>
      <p class="me-credit">Ideato e sviluppato da <a class="ig" href="https://www.instagram.com/angelo.alaia/" target="_blank" rel="noopener noreferrer" title="Angelo Alaia su Instagram (@angelo.alaia)"><i class="fa-brands fa-instagram"></i> Angelo Alaia</a><br>© 2026 · Tutti i diritti riservati</p>`;
  }

  if (header) {
    header.innerHTML = `
      <button class="icon-btn burger" id="burger" aria-label="Apri il menu"><i class="fa-solid fa-bars"></i></button>
      <a class="mobile-logo" href="index.html" aria-label="Dashboard"><img class="logo-light" src="logo-grimaldi.png" alt=""><img class="logo-dark" src="logo-grimaldi-negativo.png" alt=""></a>
      <div class="crumb" aria-hidden="true"><span>Biblioteca Spes-F</span><i class="fa-solid fa-chevron-right"></i><b>${esc((groups.flatMap(g => g.items).find(i => i[0] === path) || [0, 'Dashboard'])[1])}</b></div>
      <span class="tb-title" aria-hidden="true">${esc((groups.flatMap(g => g.items).find(i => i[0] === path) || [0, 'Dashboard'])[1])}</span>
      <form class="search" id="global-search-form" role="search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input class="input" id="global-search" type="search" placeholder="Cerca libro, autore o n. catalogo" aria-label="Cerca nel catalogo" autocomplete="off">
        <span class="kbd">/</span>
      </form>
      <div class="spacer"></div>
      <button type="button" class="icon-btn theme-btn" id="theme-btn" aria-label="Cambia tema: chiaro o scuro" title="Tema chiaro / scuro"><i class="fa-solid fa-sun"></i><i class="fa-solid fa-moon"></i></button>
      <div class="pop-wrap">
        <button class="btn btn-primary" id="quick-btn" aria-haspopup="true" aria-expanded="false"><i class="fa-solid fa-plus"></i><span>Nuovo</span></button>
        <div class="pop hidden" id="quick-menu" role="menu">
          <a href="prestiti.html?action=new" role="menuitem"><i class="fa-solid fa-right-left"></i>Registra un prestito</a>
          <a href="catalogo.html?action=new" role="menuitem"><i class="fa-solid fa-book-medical"></i>Aggiungi un volume</a>
          <a href="club.html?action=new" role="menuitem"><i class="fa-solid fa-people-roof"></i>Crea un club</a>
          <a href="iscritti.html?action=new" role="menuitem"><i class="fa-solid fa-user-plus"></i>Nuovo iscritto</a>
          <a href="catalogo.html?etichette=1" role="menuitem"><i class="fa-solid fa-qrcode"></i>Stampa etichette</a>
          <a href="riepilogo.html?annuale=1" role="menuitem"><i class="fa-solid fa-chart-column"></i>Report annuale (PDF)</a>
          <hr>
          <button data-act="export" role="menuitem"><i class="fa-solid fa-file-arrow-down"></i>Scarica una copia di sicurezza</button>
          <button data-act="import" role="menuitem"><i class="fa-solid fa-file-arrow-up"></i>Ripristina da una copia</button>
          <button data-act="install" role="menuitem" class="install-only hidden"><i class="fa-solid fa-mobile-screen"></i>Installa come app</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" class="hidden">
      </div>`;
    bindTopbar();
    phoneTouches();
  }
  updateBadge();
  $('#logout')?.addEventListener('click', () => window.Cloud.signOut());
  const content = $('.content');
  if (content) content.insertAdjacentHTML('beforeend', `<footer class="credit"><span>Ideato e sviluppato da <a class="ig" href="https://www.instagram.com/angelo.alaia/" target="_blank" rel="noopener noreferrer" title="Angelo Alaia su Instagram (@angelo.alaia)"><i class="fa-brands fa-instagram"></i> Angelo Alaia</a> · © 2026 · Tutti i diritti riservati.</span><span>Il nome e il logo Fondazione Grimaldi appartengono ai rispettivi titolari.</span></footer>`);

  const scrim = $('#scrim'), burger = $('#burger');
  const toggle = (open) => { if (!sidebar) return; sidebar.classList.toggle('open', open); scrim?.classList.toggle('show', open); $('#tab-menu')?.setAttribute('aria-expanded', open); };
  burger?.addEventListener('click', () => toggle(true));
  scrim?.addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sidebar?.classList.contains('open')) toggle(false); });

  /* Telefono: barra in basso con le sezioni più usate, il pulsante "+" e il menu completo */
  if (sidebar && !$('.tabbar')) {
    const tabs = [['index.html', 'Home', 'fa-house'], ['catalogo.html', 'Catalogo', 'fa-book-open'], null, ['prestiti.html', 'Prestiti', 'fa-right-left']];
    const inTabs = tabs.some(t => t && t[0] === path);
    document.body.insertAdjacentHTML('beforeend', `
      <nav class="tabbar" aria-label="Navigazione rapida">
        ${tabs.map(t => t ? `<a href="${t[0]}" ${path === t[0] ? 'aria-current="page"' : ''}><i class="fa-solid ${t[2]}"></i><span>${t[1]}</span></a>`
          : '<button type="button" class="tab-fab" id="tab-new" aria-label="Nuovo: prestito, volume, iscritto…" aria-haspopup="dialog"><span class="fab"><i class="fa-solid fa-plus"></i></span></button>').join('')}
        <button type="button" id="tab-menu" aria-expanded="false" ${inTabs ? '' : 'aria-current="page"'}><i class="fa-solid fa-bars-staggered"></i><span>Menu</span><span class="tab-dot hidden" id="tab-dot">0</span></button>
      </nav>
      <dialog class="modal sheet" id="quick-sheet" aria-labelledby="quick-sheet-t">
        <div class="modal-h"><h2 id="quick-sheet-t">Cosa vuoi fare?</h2><button class="icon-btn" data-close aria-label="Chiudi"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-b"><div class="sheet-grid">
          <a class="c-green" style="--i:0" href="prestiti.html?action=new"><i class="fa-solid fa-right-left"></i>Registra un prestito</a>
          <a class="c-violet" style="--i:1" href="catalogo.html?action=new"><i class="fa-solid fa-book-medical"></i>Aggiungi un volume</a>
          <a class="c-teal" style="--i:2" href="iscritti.html?action=new"><i class="fa-solid fa-user-plus"></i>Nuovo iscritto</a>
          <a class="c-orange" style="--i:3" href="club.html?action=new"><i class="fa-solid fa-people-roof"></i>Crea un club</a>
          <a class="wide c-blue" style="--i:4" href="catalogo.html?etichette=1"><i class="fa-solid fa-qrcode"></i>Stampa le etichette</a>
          <a class="wide c-violet" style="--i:5" href="riepilogo.html?annuale=1"><i class="fa-solid fa-chart-column"></i>Report annuale in PDF</a>
          <button type="button" class="wide c-amber" style="--i:6" data-quick="export"><i class="fa-solid fa-file-arrow-down"></i>Scarica una copia di sicurezza</button>
          <button type="button" class="wide c-blue" style="--i:7" data-quick="import"><i class="fa-solid fa-file-arrow-up"></i>Ripristina da una copia</button>
          <button type="button" class="wide c-green install-only hidden" style="--i:8" data-quick="install"><i class="fa-solid fa-mobile-screen"></i>Installa l’app sul telefono</button>
        </div></div>
      </dialog>`);
    $('#tab-menu').addEventListener('click', () => toggle(!sidebar.classList.contains('open')));
    $('#tab-new').addEventListener('click', () => openDlg('quick-sheet'));
    $('#quick-sheet').addEventListener('click', (e) => {
      const q = e.target.closest('[data-quick]'); if (!q) return;
      closeDlg('quick-sheet'); $(`#quick-menu [data-act="${q.dataset.quick}"]`)?.click();
    });
    /* gesti: si trascina il menu verso sinistra per chiuderlo, dal bordo sinistro verso destra per aprirlo */
    let sx = 0, sy = 0, mode = null;
    document.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
      mode = sidebar.classList.contains('open') ? 'close' : (sx < 26 && innerWidth <= 900 && !document.querySelector('dialog[open]') ? 'open' : null);
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (!mode) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
      if (mode === 'open' && dx > 70 && dy < 70) toggle(true);
      if (mode === 'close' && dx < -60 && dy < 70) toggle(false);
      mode = null;
    }, { passive: true });
  }
  updateBadge();
}

/* Ritocchi per il telefono:
   - quando il titolo grande della pagina esce dallo schermo, compare piccolo al centro della barra in alto (come nelle app);
   - i pulsanti secondari delle intestazioni diventano icone (il testo resta per i lettori di schermo e come suggerimento);
   - la ricerca in alto ha un invito più corto;
   - un piccolo riscontro tattile sui tasti della barra in basso (Android). */
function phoneTouches() {
  const topbar = document.querySelector('.topbar');
  const title = document.querySelector('.content .page-head h1, .content .hero');
  if (topbar && title && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => topbar.classList.toggle('titled', !e.isIntersecting && e.boundingClientRect.top < 80), { rootMargin: '-64px 0px 0px 0px' }).observe(title);
  }
  document.querySelectorAll('.page-head .btn').forEach((b) => {
    if (b.querySelector('.bl')) return;
    const txt = [...b.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    if (!txt.length) return;
    const label = txt.map(n => n.textContent.trim()).join(' ');
    const sp = document.createElement('span'); sp.className = 'bl'; sp.textContent = label;
    txt.forEach(n => n.remove()); b.appendChild(sp);
    if (!b.title) b.title = label;
    if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', label);
  });
  const gs = document.getElementById('global-search');
  const ph = () => { if (gs) gs.placeholder = innerWidth <= 640 ? 'Cerca un libro…' : 'Cerca libro, autore o n. catalogo'; };
  ph(); addEventListener('resize', ph, { passive: true });
  document.addEventListener('click', (e) => { if (e.target.closest('.tabbar a, .tabbar button, .copy-chip, .seg button') && navigator.vibrate) { try { navigator.vibrate(6); } catch {} } }, { passive: true });
}

function bindTopbar() {
  const btn = $('#quick-btn'), menu = $('#quick-menu'), input = $('#global-search');
  $('#theme-btn')?.addEventListener('click', (e) => {
    if (!window.Theme) return;
    const next = Theme.get() === 'dark' ? 'light' : 'dark';
    Theme.set(next, e); toast(next === 'dark' ? 'Tema scuro attivo' : 'Tema chiaro attivo');
  });
  const setMenu = (open) => { menu.classList.toggle('hidden', !open); btn.setAttribute('aria-expanded', open); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.classList.contains('hidden')); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) setMenu(false); });

  menu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    setMenu(false);
    if (act === 'export') { downloadBackup('copia'); toast('Copia di sicurezza scaricata: conservala in un posto sicuro'); }
    if (act === 'import') $('#import-file').click();
    if (act === 'install') installApp();
  });

  $('#import-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    e.target.value = ''; /* si può riscegliere lo stesso file */
    const text = await f.text(), info = store.inspectImport(text);
    if (!info.ok) return toast(info.error, 'err');
    const when = info.data ? ` del ${new Date(info.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
    const ok = await UI.confirm(`La copia${when} contiene ${info.libri} libri, ${info.iscritti} iscritti, ${info.prestiti} prestiti e ${info.club} club.\nTutti i dati attuali${store.cloud ? ' dell’archivio ONLINE' : ''} verranno sostituiti da quelli del file.`,
      { title: 'Ripristinare questa copia?', ok: 'Ripristina', danger: true, word: store.cloud ? 'CONFERMO' : '' });
    if (!ok) return;
    const r = store.importData(text);
    if (!r.ok) return toast(r.error, 'err');
    toast('Dati importati'); store.flush().then(() => setTimeout(() => location.reload(), 400));
  });

  $('#global-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    /* un numero di catalogo (C-0012) apre direttamente la scheda della copia */
    location.href = BiblioStore.isCatCode(q) ? `catalogo.html?cat=${encodeURIComponent(q)}` : `catalogo.html?q=${encodeURIComponent(q)}`;
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); input.focus(); }
    if (e.key === 'Escape') setMenu(false);
  });
}

/* ---------- Avvio delle pagine ----------
   onReady(fn): esegue fn quando la pagina è pronta E i dati sono caricati (subito in locale, dopo il login online) */
function onReady(fn) {
  document.addEventListener('DOMContentLoaded', () => window.storeReady.then(fn, () => {}).catch((e) => console.error(e)));
}

const CLOUD_ON = !!(window.Cloud && window.Cloud.enabled);
if (CLOUD_ON) document.documentElement.classList.add('booting');
/* Menu e barra in alto compaiono subito; il contenuto appena i dati sono pronti */
document.addEventListener('DOMContentLoaded', () => {
  renderAppShell();
  if (!CLOUD_ON) return;
  /* la schermata di caricamento compare solo se l'attesa è lunga */
  const slow = setTimeout(() => {
    if (!document.documentElement.classList.contains('booting')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="boot" role="status"><img src="logo-grimaldi-negativo.png" alt=""><p>Caricamento dell’archivio…</p></div>`);
  }, 900);
  window.storeReady.catch((err) => {
    clearTimeout(slow);
    if (!$('#boot')) document.body.insertAdjacentHTML('beforeend', '<div id="boot" role="status"></div>');
    $('#boot').innerHTML = `<img src="logo-grimaldi-negativo.png" alt=""><p><b>Impossibile aprire l’archivio online</b><br>${esc(err.message)}</p><button class="btn btn-lemon" onclick="location.reload()">Riprova</button>`;
  });
});

onReady(() => {
  const mail = $('.me-mail');
  if (mail && CLOUD_ON && window.Cloud.user) mail.textContent = window.Cloud.user.email;
  updateBadge();
  if (window.store) Object.assign(FG, store.getSede()); /* indirizzo, orari e telefono scelti nelle impostazioni */
  /* dopo ogni salvataggio i contatori del menu si aggiornano da soli (una volta per fotogramma) */
  if (window.store && !store.__badgeHook) {
    const save = store._save.bind(store); let queued = false;
    store._save = (k, v) => { save(k, v); if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; updateBadge(); }); } };
    store.__badgeHook = true;
  }
  document.documentElement.classList.remove('booting');
  const boot = $('#boot');
  if (boot) { boot.classList.add('out'); setTimeout(() => boot.remove(), 450); }
  let after = null; try { after = sessionStorage.getItem('fg_after_reset'); sessionStorage.removeItem('fg_after_reset'); } catch {}
  if (after) setTimeout(() => toast(after === 'demo' ? 'Dati demo caricati' : after === 'all' ? 'Reset totale eseguito: archivio e club vuoti, il primo libro sarà C-0001' : 'Archivio azzerato: club e generi sono rimasti, il primo libro sarà C-0001'), 400);
  let later = false; try { later = !!sessionStorage.getItem('fg_fresh_later'); } catch {}
  const ask = () => { if (!later && store.needsFreshStart()) setTimeout(freshStart, 600); };
  document.prerendering ? document.addEventListener('prerenderingchange', ask, { once: true }) : ask();
});

/* ---------- Impostazioni riservate ----------
   Non compaiono nel menu: si aprono toccando 5 volte di fila il riquadro "Segreteria" in fondo al menu,
   oppure aggiungendo #riservato all'indirizzo. Servono la password:
   online quella dell'account (verificata da Firebase), in locale una password scelta al primo uso. */
/* Scarica tutto l'archivio in un file .json (si reimporta con Nuovo → Importa) e ricorda la data */
function downloadBackup(kind = 'copia') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([store.exportData()], { type: 'application/json' }));
  a.download = `biblioteca-spes-f-${kind}-${D.iso(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { store.markBackup(); } catch { /* la data serve solo per il promemoria */ }
}

const sha256 = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const LOCAL_PW = 'fg_riservato_pw';
async function checkReservedPassword(pw) {
  if (store.cloud) {
    const u = firebase.auth().currentUser; if (!u) return { ok: false, error: 'Sessione scaduta: esci e rientra.' };
    try { await firebase.auth().signInWithEmailAndPassword(u.email, pw); return { ok: true }; }
    catch (e) { return { ok: false, error: e && e.code === 'auth/too-many-requests' ? 'Troppi tentativi: attendi qualche minuto.' : e && e.code === 'auth/network-request-failed' ? 'Connessione assente: riprova.' : 'Password non corretta.' }; }
  }
  let saved = null; try { saved = localStorage.getItem(LOCAL_PW); } catch {}
  const h = await sha256('spes-f:' + pw);
  if (!saved) { if (pw.length < 6) return { ok: false, error: 'Scegli una password di almeno 6 caratteri.' }; try { localStorage.setItem(LOCAL_PW, h); } catch {} return { ok: true, created: true }; }
  return h === saved ? { ok: true } : { ok: false, error: 'Password non corretta.' };
}
function openReserved() {
  if (!window.store || $('#reserved')) return;
  let firstLocal = false; if (!store.cloud) { try { firstLocal = !localStorage.getItem(LOCAL_PW); } catch {} }
  const d = document.createElement('dialog');
  d.id = 'reserved'; d.className = 'modal reserved'; d.setAttribute('aria-labelledby', 'rs-t');
  d.innerHTML = `
    <div class="modal-h"><div class="view-h"><span class="rs-lock" aria-hidden="true"><i class="fa-solid fa-lock"></i></span><h2 id="rs-t">Impostazioni riservate</h2></div>
      <button class="icon-btn" data-close aria-label="Chiudi"><i class="fa-solid fa-xmark"></i></button></div>
    <form class="modal-b rs-lockform" id="rs-unlock" autocomplete="off">
      <p class="hint">${store.cloud ? 'Per sicurezza inserisci la password con cui accedi alla biblioteca.' : firstLocal ? 'Primo accesso: scegli una password (almeno 6 caratteri) che verrà chiesta d’ora in poi su questo computer.' : 'Inserisci la password delle impostazioni riservate.'}</p>
      <div class="field"><label for="rs-pw">${store.cloud ? 'Password dell’account' : firstLocal ? 'Nuova password' : 'Password'}</label>
        <input class="input" type="password" id="rs-pw" autocomplete="${store.cloud ? 'current-password' : 'new-password'}" required></div>
      <p class="login-msg" id="rs-msg" role="alert" aria-live="polite"></p>
      <button class="btn btn-primary" type="submit" id="rs-go"><i class="fa-solid fa-unlock"></i> Sblocca</button>
    </form>
    <div class="modal-b rs-panel hidden" id="rs-panel">
      <section class="rs-sec danger">
        <h3><i class="fa-solid fa-broom"></i> Reset totale dell’archivio</h3>
        <p>Cancella <b>tutti i libri, gli iscritti, i prestiti</b> e la cronologia delle attività. Il riepilogo settimanale riparte vuoto e il primo libro tornerà a essere <b class="mono">C-0001</b>. I generi restano.</p>
        <label class="check switch"><input type="checkbox" role="switch" id="rs-clubs"><span class="sw-track" aria-hidden="true"></span><span>Elimina anche i club <small class="muted" id="rs-clubs-n"></small></span></label>
        <label class="check switch"><input type="checkbox" role="switch" id="rs-backup" checked><span class="sw-track" aria-hidden="true"></span><span>Scarica prima una copia di sicurezza</span></label>
        <div class="rs-actions"><button type="button" class="btn btn-danger" id="rs-reset"><i class="fa-solid fa-trash-can"></i> Esegui il reset</button></div>
      </section>
      <form class="rs-sec" id="rs-sede" autocomplete="off">
        <h3><i class="fa-solid fa-location-dot"></i> Dati della sede nei solleciti</h3>
        <p>Compaiono nei messaggi email e WhatsApp inviati dalla pagina Solleciti.</p>
        <div class="field"><label for="rs-ind">Indirizzo</label><input class="input" id="rs-ind" maxlength="120" required placeholder="es. Via …, Barra (NA)"></div>
        <div class="field"><label for="rs-ora">Orari di segreteria</label><input class="input" id="rs-ora" maxlength="160" placeholder="es. dal lunedì al venerdì, 9:30–13:00"></div>
        <div class="field"><label for="rs-tel">Telefono</label><input class="input" id="rs-tel" maxlength="40" inputmode="tel" placeholder="es. 081 …"></div>
        <div class="rs-actions"><button type="submit" class="btn btn-primary">Salva i dati della sede</button></div>
      </form>
      <section class="rs-sec">
        <h3><i class="fa-solid fa-flask"></i> Dati di prova</h3>
        <p>Sostituisce tutto l’archivio con libri, iscritti e prestiti dimostrativi. Utile solo per provare il programma.</p>
        <div class="rs-actions"><button type="button" class="btn" id="rs-demo">Carica i dati demo</button></div>
      </section>
    </div>`;
  document.body.appendChild(d);
  const msg = (t, c = 'err') => { $('#rs-msg', d).textContent = t; $('#rs-msg', d).className = `login-msg ${c}`; };
  $('#rs-clubs-n', d).textContent = `(${store.getClubs().length} in archivio)`;
  const sede = store.getSede(); $('#rs-ind', d).value = sede.indirizzo; $('#rs-ora', d).value = sede.orari; $('#rs-tel', d).value = sede.telefono;
  $('#rs-sede', d).addEventListener('submit', (e) => {
    e.preventDefault();
    const r = store.setSede({ indirizzo: $('#rs-ind', d).value, orari: $('#rs-ora', d).value, telefono: $('#rs-tel', d).value });
    if (!r.ok) return toast(r.error, 'err');
    Object.assign(FG, r.sede); toast('Dati della sede salvati: i prossimi solleciti useranno questi');
  });
  $('#rs-unlock', d).addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#rs-pw', d).value; if (!pw) return msg('Inserisci la password.');
    $('#rs-go', d).disabled = true; msg('Verifica in corso…', '');
    const r = await checkReservedPassword(pw);
    $('#rs-go', d).disabled = false;
    if (!r.ok) { msg(r.error); $('#rs-pw', d).select(); return; }
    $('#rs-unlock', d).classList.add('hidden'); $('#rs-panel', d).classList.remove('hidden');
    $('.rs-lock i', d).className = 'fa-solid fa-lock-open';
    if (r.created) toast('Password delle impostazioni riservate salvata');
  });
  const backup = () => { if ($('#rs-backup', d).checked) downloadBackup('copia-prima-del-reset'); };
  const finish = (act) => { try { sessionStorage.setItem('fg_after_reset', act); } catch {} store.flush().then(() => setTimeout(() => location.reload(), 400)); };
  $('#rs-reset', d).addEventListener('click', async () => {
    const clubs = $('#rs-clubs', d).checked;
    const n = { b: store.getBooks().length, m: store.getMembers().length, l: store.getLoans().length, c: store.getClubs().length };
    const ok = await UI.confirm(`Verranno cancellati ${n.b} libri, ${n.m} iscritti e ${n.l} prestiti${clubs ? ` e anche ${n.c} club` : '; i club restano'}.\nL’operazione non si può annullare${$('#rs-backup', d).checked ? ': prima verrà scaricata una copia di sicurezza.' : '.'}`,
      { title: clubs ? 'Reset totale, club compresi?' : 'Reset totale dell’archivio?', ok: 'Cancella tutto', danger: true, word: 'CONFERMO' });
    if (!ok) return;
    backup(); store.resetAll({ clubs }); finish(clubs ? 'all' : 'empty');
  });
  $('#rs-demo', d).addEventListener('click', async () => {
    if (!(await UI.confirm(`Tutti i dati attuali verranno sostituiti con quelli dimostrativi.${store.cloud ? '\nAttenzione: è l’archivio ONLINE.' : ''}`, { title: 'Caricare i dati demo?', ok: 'Carica i dati demo', danger: true, word: store.cloud ? 'CONFERMO' : '' }))) return;
    backup(); store.resetDemo(); finish('demo');
  });
  d.addEventListener('close', () => d.remove());
  d.showModal();
  setTimeout(() => $('#rs-pw', d).focus(), 50);
}
/* accesso segreto: 5 tocchi rapidi sul riquadro "Segreteria" oppure #riservato nell'indirizzo */
document.addEventListener('DOMContentLoaded', () => {
  let taps = [];
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.me') || e.target.closest('#logout')) return;
    const now = Date.now(); taps = taps.filter(t => now - t < 2500); taps.push(now);
    if (taps.length >= 5) { taps = []; window.storeReady.then(openReserved); }
  });
  const fromHash = () => { if (location.hash === '#riservato') { history.replaceState(history.state, '', location.pathname + location.search); window.storeReady.then(openReserved); } };
  addEventListener('hashchange', fromHash); fromHash();
});

/* Ripartenza da zero (una sola volta, per questa versione): l'archivio torna vergine, i club restano.
   Prima si può scaricare una copia di sicurezza; online bisogna scrivere CONFERMO. */
function freshStart() {
  if (document.querySelector('dialog[open]') || $('#fresh-start')) return;
  const n = { b: store.getBooks().length, m: store.getMembers().length, l: store.getLoans().length, c: store.getClubs().length };
  const word = store.cloud ? 'CONFERMO' : '';
  const d = document.createElement('dialog');
  d.id = 'fresh-start'; d.className = 'modal confirm is-danger fresh'; d.setAttribute('aria-labelledby', 'fresh-t');
  d.innerHTML = `
    <div class="modal-b confirm-b">
      <span class="confirm-ic" aria-hidden="true"><i class="fa-solid fa-seedling"></i></span>
      <div class="confirm-t">
        <h2 id="fresh-t">Si riparte da zero</h2>
        <p>Questa versione è pensata per iniziare con un archivio vergine. Verranno cancellati:</p>
        <ul class="fresh-list">
          <li><b>${n.b}</b> ${n.b === 1 ? 'libro' : 'libri'}</li><li><b>${n.m}</b> ${n.m === 1 ? 'iscritto' : 'iscritti'}</li><li><b>${n.l}</b> ${n.l === 1 ? 'prestito' : 'prestiti'}</li><li>la cronologia delle attività</li>
        </ul>
        <p class="fresh-keep"><i class="fa-solid fa-shield-heart"></i><span>Restano i tuoi <b>${n.c} club</b> e i generi. Il primo libro che inserirai sarà <b class="mono">C-0001</b>.</span></p>
        <label class="check switch"><input type="checkbox" role="switch" id="fresh-backup" checked><span class="sw-track" aria-hidden="true"></span><span>Scarica prima una copia di sicurezza</span></label>
        ${word ? `<label class="confirm-word">Scrivi <b>${word}</b> per procedere<input class="input" id="fresh-word" autocomplete="off" spellcheck="false"></label>` : ''}
      </div>
    </div>
    <div class="modal-f"><button type="button" class="btn" data-fs="later">Più tardi</button><button type="button" class="btn btn-danger" data-fs="go" ${word ? 'disabled' : ''}><i class="fa-solid fa-broom"></i> Azzera e inizia</button></div>`;
  document.body.appendChild(d);
  const go = $('[data-fs="go"]', d), inp = $('#fresh-word', d);
  if (inp) inp.addEventListener('input', () => { go.disabled = inp.value.trim().toUpperCase() !== word; });
  d.addEventListener('close', () => d.remove());
  $('.modal-f', d).addEventListener('click', (e) => {
    const b = e.target.closest('[data-fs]'); if (!b || b.disabled) return;
    if (b.dataset.fs === 'later') { try { sessionStorage.setItem('fg_fresh_later', '1'); } catch {} return d.close(); }
    if ($('#fresh-backup', d).checked) downloadBackup('copia-prima-della-ripartenza');
    store.resetKeepClubs();
    try { sessionStorage.setItem('fg_after_reset', 'empty'); } catch {}
    go.disabled = true; go.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Azzeramento…';
    store.flush().then(() => setTimeout(() => location.reload(), 500));
  });
  d.showModal();
  setTimeout(() => (inp || go).focus(), 40);
}

/* Pagina preparata in anticipo dal browser: quando diventa visibile si aggiornano i dati mostrati */
document.addEventListener('prerenderingchange', () => {
  window.storeReady.then(() => { updateBadge(); if (typeof window.refresh === 'function') window.refresh(); else if (typeof window.render === 'function') window.render(); });
});

/* Browser senza passaggi animati tra pagine: piccola dissolvenza all'uscita */
if (!('onpagereveal' in window)) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !/\.html$/.test(u.pathname) || (u.pathname === location.pathname && u.search === location.search)) return;
    e.preventDefault();
    document.documentElement.classList.add('leaving');
    setTimeout(() => { location.href = u.href; }, 150);
  });
  window.addEventListener('pageshow', () => document.documentElement.classList.remove('leaving'));
}

/* Modifiche arrivate da un altro dispositivo: aggiorna la pagina (se non c'è una finestra aperta) */
let remoteWaiting = false;
function applyRemote() {
  if (document.querySelector('dialog[open]')) { remoteWaiting = true; return; }
  remoteWaiting = false;
  if (window.store) { store._ensureCatalog(); store._ensureSnapshots(); Object.assign(FG, store.getSede()); } /* dati arrivati da un altro dispositivo: numeri e storico sempre completi */
  updateBadge();
  if (typeof window.refresh === 'function') window.refresh();
  else if (typeof window.render === 'function') window.render();
}
let remoteTimer = null;
window.addEventListener('fg:remote', () => {
  clearTimeout(remoteTimer); /* più aggiornamenti ravvicinati = un solo ridisegno e un solo avviso */
  remoteTimer = setTimeout(() => { applyRemote(); toast('Dati aggiornati da un altro dispositivo'); }, 250);
});
document.addEventListener('close', (e) => { if (e.target instanceof HTMLDialogElement && remoteWaiting) setTimeout(applyRemote, 50); }, true);
window.addEventListener('fg:error', (e) => toast(e.detail, 'err'));
window.addEventListener('fg:info', (e) => toast(e.detail));

/* ---------- Animazioni ---------- */
function countUp(el, to, ms = 800) {
  const from = parseInt(el.textContent, 10) || 0;
  if (from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / ms); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); else { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } };
  requestAnimationFrame(step);
}

/* Entrata a cascata solo al primo caricamento di una lista */
function staggerOnce(el) {
  if (!el || el.dataset.st || !el.children.length) return;
  el.dataset.st = 1;
  [...el.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 16)));
  el.classList.add('stagger');
  setTimeout(() => el.classList.remove('stagger'), 1500);
}

/* ---------- Ricerca con suggerimenti (al posto dei menu a tendina) ---------- */
const matches = (q, ...fields) => {
  const hay = fields.join(' ').toLowerCase();
  return String(q || '').toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t));
};

/* items(q) -> [{ value, label, sub }]. Restituisce un controller { value, set, clear, focus } */
function makeCombo(host, { placeholder = '', label = '', items, empty = 'Nessun risultato' }) {
  const id = 'cb' + Math.random().toString(36).slice(2, 7);
  host.classList.add('combo');
  host.innerHTML = `<i class="fa-solid fa-magnifying-glass combo-ic"></i>
    <input class="input" role="combobox" aria-expanded="false" aria-controls="${id}" aria-autocomplete="list" aria-label="${esc(label)}" autocomplete="off" placeholder="${esc(placeholder)}">
    <button type="button" class="combo-x hidden" aria-label="Cancella la scelta"><i class="fa-solid fa-xmark"></i></button>
    <ul class="combo-list hidden" id="${id}" role="listbox"></ul>`;
  const inp = $('input', host), list = $('ul', host), clr = $('.combo-x', host);
  let value = '', cur = [], idx = -1;

  const hl = (t, q) => {
    const s = esc(t), toks = q.trim().split(/\s+/).filter(Boolean).map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return toks.length ? s.replace(new RegExp('(' + toks.join('|') + ')', 'gi'), '<mark>$1</mark>') : s;
  };
  const open = (o) => { list.classList.toggle('hidden', !o); inp.setAttribute('aria-expanded', o); };
  const mark = () => { $$('li[role=option]', list).forEach((li, i) => { li.setAttribute('aria-selected', i === idx); if (i === idx) li.scrollIntoView({ block: 'nearest' }); }); };
  const render = () => {
    const q = inp.value;
    cur = items(q).slice(0, 8); idx = cur.findIndex(it => !it.disabled);
    list.innerHTML = cur.length
      ? cur.map((it, i) => `<li role="option" data-i="${i}" id="${id}-${i}" ${it.disabled ? 'aria-disabled="true"' : ''}><div><b>${hl(it.label, q)}</b>${it.sub ? `<span class="sub">${hl(it.sub, q)}</span>` : ''}</div>${it.badge ? `<span class="tag ${it.tone || 'plain'} combo-badge">${esc(it.badge)}</span>` : ''}</li>`).join('')
      : `<li class="combo-empty">${esc(empty)}</li>`;
    open(true); mark();
  };
  const pick = (i) => {
    const it = cur[i]; if (!it || it.disabled) return;
    value = it.value; inp.value = it.label; host.classList.add('picked'); clr.classList.remove('hidden'); open(false);
    host.dispatchEvent(new CustomEvent('combo', { detail: it }));
  };
  const cleared = () => host.dispatchEvent(new CustomEvent('combo-clear'));
  const reset = () => { value = ''; inp.value = ''; host.classList.remove('picked'); clr.classList.add('hidden'); open(false); cleared(); };

  inp.addEventListener('input', () => { const had = value; value = ''; host.classList.remove('picked'); clr.classList.toggle('hidden', !inp.value); render(); if (had) cleared(); });
  inp.addEventListener('focus', () => { if (!value) render(); });
  inp.addEventListener('blur', () => setTimeout(() => open(false), 120));
  inp.addEventListener('keydown', (e) => {
    const isOpen = !list.classList.contains('hidden');
    const step = (d) => { let j = idx; do { j += d; } while (cur[j] && cur[j].disabled); if (cur[j]) idx = j; mark(); };
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!isOpen) render(); else step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Enter' && isOpen && idx >= 0) { e.preventDefault(); pick(idx); }
    else if (e.key === 'Escape' && isOpen) { e.preventDefault(); open(false); }
  });
  list.addEventListener('mousedown', (e) => { e.preventDefault(); const li = e.target.closest('li[data-i]'); if (li) pick(+li.dataset.i); });
  clr.addEventListener('click', () => { reset(); inp.focus(); });

  const set = (v, label) => {
    value = v; inp.value = label; host.classList.add('picked'); clr.classList.remove('hidden'); open(false);
    host.dispatchEvent(new CustomEvent('combo', { detail: { value: v, label } }));
  };
  return { get value() { return value; }, get text() { return inp.value; }, set, clear: reset, focus: () => inp.focus(), el: host };
}

console.log('%cBiblioteca Spes-F · © 2026 Angelo Alaia · Tutti i diritti riservati', 'color:#1554C0;font-weight:700');

/* ---------- Effetti grafici (solo aspetto: non toccano dati né salvataggi) ---------- */
(() => {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* Increspatura sui pulsanti */
  if (!calm) document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn'); if (!b) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s); setTimeout(() => s.remove(), 650);
  });

  /* Luce che segue il cursore sulle schede */
  const SPOT = '.panel, .person, .club-card, .notice, .band > *, .login-card';
  if (fine && !calm) {
    let raf = 0, last = null;
    document.addEventListener('pointermove', (e) => {
      last = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = last.target.closest && last.target.closest(SPOT);
        if (!el) return;
        el.classList.add('fx-spot');
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${last.clientX - r.left}px`);
        el.style.setProperty('--my', `${last.clientY - r.top}px`);
      });
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const el = e.target.closest && e.target.closest(SPOT);
      if (el && !el.contains(e.relatedTarget)) { el.style.removeProperty('--mx'); el.style.removeProperty('--my'); }
    });
  }

  /* Barra in alto con ombra quando si scorre */
  const onScroll = () => { const t = document.querySelector('.topbar'); if (t) t.classList.toggle('scrolled', window.scrollY > 6); };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('DOMContentLoaded', onScroll);

  /* Riflesso sul banner della dashboard */
  document.addEventListener('DOMContentLoaded', () => {
    const h = document.querySelector('.hero');
    if (h && !calm && !h.querySelector('.hero-sheen')) h.insertAdjacentHTML('afterbegin', '<span class="hero-sheen" aria-hidden="true"></span>');
  });

  /* Login: la scheda si inclina leggermente seguendo il cursore */
  document.addEventListener('DOMContentLoaded', () => {
    const card = document.querySelector('.login-card');
    if (!card || !fine || calm) return;
    const wrap = card.parentElement;
    wrap.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = `rotateY(${(x * 5).toFixed(2)}deg) rotateX(${(-y * 5).toFixed(2)}deg)`;
    });
    wrap.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
})();

/* ---------- Installare la Biblioteca come app ----------
   Le voci "Installa" compaiono solo quando servono (browser che lo permette, sito non già installato).
   Sulla dashboard, la prima volta, un avviso propone l'installazione; si può chiudere e non torna più. */
async function installApp() {
  const I = window.FGInstall; if (!I) return;
  if (I.installed) return toast('Stai già usando l’app installata.');
  const r = await I.run();
  if (r === 'accepted') { toast('Fatto! Trovi la Biblioteca tra le app del telefono.'); hideInstallNote(); }
  else if (r === 'ios') installHelpIOS();
  else if (r === 'manual') toast('Apri il menu del browser (⋮) e scegli “Installa app” o “Aggiungi a schermata Home”.');
}
function installHelpIOS() {
  let d = document.getElementById('ios-install');
  if (!d) {
    document.body.insertAdjacentHTML('beforeend', `<dialog class="modal confirm" id="ios-install" aria-labelledby="ios-install-t">
      <div class="modal-b confirm-b"><span class="confirm-ic" aria-hidden="true"><i class="fa-solid fa-mobile-screen"></i></span>
        <div class="confirm-t"><h2 id="ios-install-t">Installa su iPhone</h2>
          <ol class="ios-steps">
            <li>Apri il sito con <b>Safari</b>.</li>
            <li>Tocca il pulsante <b>Condividi</b> <i class="fa-solid fa-arrow-up-from-bracket" aria-label="(quadrato con la freccia in su)"></i> in basso.</li>
            <li>Scorri e scegli <b>Aggiungi alla schermata Home</b>, poi <b>Aggiungi</b>.</li>
          </ol>
          <p>Da quel momento la Biblioteca si apre dall’icona, a schermo intero, come un’app.</p></div></div>
      <div class="modal-f"><button type="button" class="btn btn-primary" data-close>Ho capito</button></div></dialog>`);
    d = document.getElementById('ios-install');
  }
  openDlg('ios-install');
}
function hideInstallNote() { document.getElementById('install-note')?.remove(); }
function refreshInstall() {
  const I = window.FGInstall, on = !!(I && I.available);
  document.querySelectorAll('.install-only').forEach(el => el.classList.toggle('hidden', !on));
  let dismissed = false; try { dismissed = localStorage.getItem('fg_install_note') === 'no'; } catch {}
  const hero = document.querySelector('.content > .hero');
  if (!on || dismissed || !hero || innerWidth > 900) { if (!on) hideInstallNote(); return; }
  if (document.getElementById('install-note')) return;
  hero.insertAdjacentHTML('afterend', `<div class="backup-note install-note" id="install-note" role="status">
    <span class="bn-ic" aria-hidden="true"><i class="fa-solid fa-mobile-screen"></i></span>
    <p><b>Installa la Biblioteca sul telefono.</b> Si apre dall’icona, a schermo intero, come un’app vera.</p>
    <button type="button" class="btn btn-sm btn-primary" data-install>Installa</button>
    <button type="button" class="icon-btn" data-install-no aria-label="Non mostrare più" title="Non mostrare più"><i class="fa-solid fa-xmark"></i></button>
  </div>`);
  const n = document.getElementById('install-note');
  n.querySelector('[data-install]').addEventListener('click', installApp);
  n.querySelector('[data-install-no]').addEventListener('click', () => { try { localStorage.setItem('fg_install_note', 'no'); } catch {} hideInstallNote(); });
}
window.addEventListener('fg:install', refreshInstall);
document.addEventListener('DOMContentLoaded', () => setTimeout(refreshInstall, 50));
window.addEventListener('appinstalled', () => { hideInstallNote(); toast('App installata: la trovi tra le app del dispositivo.'); });

/* ---------- Etichetta "Powered by Netlify" ----------
   Sui siti gratuiti Netlify aggiunge un'etichetta fissa in basso a destra, fuori dal nostro codice.
   Sul telefono coprirebbe la barra in basso: se c'è, la barra diventa più alta quanto basta per lasciarle spazio
   (le icone salgono sopra l'etichetta). Se l'etichetta non c'è o viene nascosta, la barra torna normale. */
(() => {
  const OURS = new Set(['app-sidebar', 'toasts', 'curtain', 'boot', 'scrim', 'quick-sheet', 'labels', 'report', 'ui-confirm', 'ui-choose', 'scan-dlg']);
  const ours = (el) => (el.id && OURS.has(el.id)) || el.classList.contains('shell') || el.classList.contains('tabbar') || el.classList.contains('scrim') ||
    el.classList.contains('print-only') || /^(SCRIPT|STYLE|LINK|DIALOG|TEMPLATE|NOSCRIPT)$/.test(el.tagName);
  let last = -1, raf = 0;
  const measure = () => {
    raf = 0;
    let lift = 0;
    if (innerWidth <= 900) {
      const vh = innerHeight;
      [...document.body.children, ...[...document.documentElement.children].filter(x => x !== document.body && x !== document.head)].forEach((el) => {
        if (ours(el)) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        /* qualcosa di estraneo, piccolo, fisso in basso a destra: è l'etichetta */
        const fixed = cs.position === 'fixed' || cs.position === 'sticky';
        if (fixed && r.width < innerWidth * .8 && r.height < 140 && r.bottom > vh - 120 && r.right > innerWidth * .5) lift = Math.max(lift, vh - r.top);
      });
      /* si alza solo quanto serve: lo spazio vuoto che la barra ha già sotto le icone (margine + zona del tasto Home dell'iPhone)
         copre parte dell'etichetta, quindi si aggiunge solo la differenza, più 2px di respiro */
      const tb = document.querySelector('.tabbar'), item = tb && tb.querySelector('a');
      if (lift && tb && item) {
        /* margine della barra senza l'aggiunta (8px + zona del tasto Home dell'iPhone), misurato con un elemento di prova */
        const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:calc(8px + env(safe-area-inset-bottom, 0px))';
        document.body.appendChild(probe); const base = parseFloat(getComputedStyle(probe).paddingBottom) || 8; probe.remove();
        const already = base + parseFloat(getComputedStyle(item).paddingBottom);
        lift = Math.max(0, Math.ceil(lift - already + 2));
      }
      lift = Math.min(lift, 110);
    }
    if (lift !== last) { last = lift; document.documentElement.style.setProperty('--badge-lift', lift + 'px'); }
  };
  const later = () => { if (!raf) raf = requestAnimationFrame(measure); };
  document.addEventListener('DOMContentLoaded', () => {
    measure();
    new MutationObserver(later).observe(document.body, { childList: true, attributes: true, subtree: false });
    new MutationObserver(later).observe(document.documentElement, { childList: true });
    addEventListener('resize', later, { passive: true });
    /* l'etichetta può comparire o sparire anche dopo l'apertura (es. "Hide this badge") */
    [500, 1500, 3000, 6000].forEach((t) => setTimeout(measure, t));
    setInterval(measure, 4000);
  });
})();

/* ---------- Apertura, illustrazione della dashboard e gesti sulle finestre (solo aspetto) ---------- */
(() => {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.FGdust = () => {}; /* effetto della versione precedente: non più usato */
  document.addEventListener('DOMContentLoaded', () => {
    /* dashboard: una fila di libri disegnata nel banner */
    const h = document.querySelector('.hero');
    if (h && !h.querySelector('.hero-art')) {
      const books = [[8, 52, 22, '#FFD34D'], [34, 30, 26, '#FFFFFF'], [64, 62, 20, '#7FE3F2'], [88, 40, 24, '#C9B8FF'], [116, 70, 18, '#FFFFFF'], [138, 48, 24, '#FFB23F'], [166, 80, 16, '#9CC4FF']];
      h.insertAdjacentHTML('beforeend', `<span class="hero-art" aria-hidden="true"><svg viewBox="0 0 190 150" focusable="false">${books.map(([x, y, w, c], i) =>
        `<g class="b" style="--i:${i}"><rect x="${x}" y="${y}" width="${w}" height="${150 - y}" rx="5" fill="${c}" opacity="${c === '#FFFFFF' ? .26 : .9}"/><rect x="${x + 4}" y="${y + 12}" width="${w - 8}" height="3" rx="1.5" fill="rgba(8,24,60,.28)"/><rect x="${x + 4}" y="${y + 20}" width="${w - 8}" height="3" rx="1.5" fill="rgba(8,24,60,.18)"/></g>`).join('')}</svg></span>`);
    }
    /* sipario: solo alla prima pagina aperta in questa sessione */
    let seen = false; try { seen = sessionStorage.getItem('fg_curtain') === '1'; sessionStorage.setItem('fg_curtain', '1'); } catch {}
    if (!seen && !calm && document.querySelector('.shell')) {
      document.body.insertAdjacentHTML('beforeend', '<div id="curtain" aria-hidden="true"><div class="c-in"><img src="logo-grimaldi-negativo.png" alt=""><span class="c-rule"></span><span class="c-name">Biblioteca Spes-F</span></div></div>');
      setTimeout(() => document.getElementById('curtain')?.remove(), 2100);
    }
  });

  /* Telefono: le finestre sono fogli che salgono dal basso e si chiudono trascinando giù l'intestazione */
  let drag = null;
  document.addEventListener('touchstart', (e) => {
    if (innerWidth > 640) return;
    const head = e.target.closest && e.target.closest('dialog.modal[open] > .modal-h');
    if (!head || head.parentElement.classList.contains('visible') || e.target.closest('button, a, input')) return;
    drag = { d: head.parentElement, y: e.touches[0].clientY, dy: 0 };
    drag.d.style.transition = 'none';
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
    drag.d.style.transform = `translateY(${drag.dy}px)`;
  }, { passive: true });
  const endDrag = () => {
    if (!drag) return;
    const { d, dy } = drag; drag = null;
    d.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
    if (dy > 110) { d.style.transform = 'translateY(100%)'; setTimeout(() => { d.close(); d.style.transform = ''; d.style.transition = ''; }, 200); }
    else { d.style.transform = ''; setTimeout(() => { d.style.transition = ''; }, 260); }
  };
  document.addEventListener('touchend', endDrag, { passive: true });
  document.addEventListener('touchcancel', endDrag, { passive: true });
})();
