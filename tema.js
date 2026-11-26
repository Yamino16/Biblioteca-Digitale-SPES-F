/**
 * tema.js – tema chiaro / scuro
 * © 2026 Angelo Alaia – Tutti i diritti riservati
 *
 * Va caricato nell'intestazione di ogni pagina, prima del foglio di stile, così il tema giusto
 * è già attivo quando la pagina compare (niente "lampo" bianco in tema scuro).
 * La scelta viene ricordata su questo dispositivo (fg_theme); se non hai mai scelto, segue il telefono o il computer.
 *   Theme.get()            'light' | 'dark'
 *   Theme.set('dark')      imposta e ricorda
 *   Theme.toggle(evento)   passa all'altro tema (con l'evento del clic l'animazione parte dal pulsante)
 * A ogni cambio parte l'evento "fg:theme" (serve ai grafici per ridisegnarsi con i colori giusti).
 */
(function () {
  var KEY = 'fg_theme', root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() { try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; } }
  function current() { return saved() || (mq && mq.matches ? 'dark' : 'light'); }
  function apply() {
    var t = current();
    root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; (document.head || root).appendChild(m); }
    m.content = t === 'dark' ? '#050A17' : '#EDF2FC';
    return t;
  }
  function announce() { try { window.dispatchEvent(new CustomEvent('fg:theme', { detail: current() })); } catch (e) { /* browser molto vecchi */ } }
  function set(t, ev) {
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var commit = function () { try { localStorage.setItem(KEY, t); } catch (e) { /* navigazione privata: vale solo per questa pagina */ root.setAttribute('data-theme', t); return; } apply(); };
    if (document.startViewTransition && !calm && !document.querySelector('dialog[open]')) {
      if (ev && ev.clientX !== undefined) { root.style.setProperty('--tx', ev.clientX + 'px'); root.style.setProperty('--ty', ev.clientY + 'px'); }
      root.classList.add('theme-vt');
      var done = function () { root.classList.remove('theme-vt'); };
      /* i grafici si ridisegnano dentro il passaggio, così compaiono già con i colori nuovi */
      try { var vt = document.startViewTransition(function () { commit(); announce(); }); vt.finished.then(done, done); setTimeout(done, 1500); } catch (e) { commit(); announce(); done(); }
    } else { commit(); announce(); }
  }
  window.Theme = { get: current, set: set, toggle: function (ev) { set(current() === 'dark' ? 'light' : 'dark', ev); } };
  apply();
  if (mq) { var onSys = function () { if (!saved()) { apply(); announce(); } }; mq.addEventListener ? mq.addEventListener('change', onSys) : mq.addListener && mq.addListener(onSys); }
  /* la scelta fatta in un'altra scheda vale subito anche qui */
  window.addEventListener('storage', function (e) { if (e.key === KEY) { apply(); announce(); } });
  /* pagine preparate in anticipo dal browser o riaperte con "indietro": si riallineano al tema corrente */
  window.addEventListener('pageshow', function () { if (root.getAttribute('data-theme') !== current()) { apply(); announce(); } });
  document.addEventListener('prerenderingchange', function () { if (root.getAttribute('data-theme') !== current()) { apply(); announce(); } });

  /* ---------- App installabile ----------
     Registra il service worker (sw.js) e tiene pronto l'invito "Installa" del browser, se c'è.
     Su iPhone non esiste un invito automatico: si spiegano i due passaggi a mano. */
  var ua = navigator.userAgent || '';
  var ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var standalone = function () { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; };
  var Install = {
    prompt: null, ios: ios,
    get installed() { return standalone(); },
    /* si può proporre l'installazione? (non se è già un'app) */
    get available() { return !standalone() && (!!Install.prompt || ios); },
    run: function () {
      if (Install.prompt) {
        var p = Install.prompt; Install.prompt = null;
        p.prompt();
        return p.userChoice.then(function (c) { fire(); return c && c.outcome === 'accepted' ? 'accepted' : 'dismissed'; }, function () { return 'dismissed'; });
      }
      return Promise.resolve(ios ? 'ios' : 'manual');
    }
  };
  function fire() { try { window.dispatchEvent(new CustomEvent('fg:install')); } catch (e) {} }
  window.FGInstall = Install;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); Install.prompt = e; fire(); });
  window.addEventListener('appinstalled', function () { Install.prompt = null; fire(); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* senza: il sito funziona lo stesso */ }); });
  }
})();
