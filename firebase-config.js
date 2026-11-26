/**
 * firebase-config.js – collegamento al database online
 * © 2026 Angelo Alaia – Tutti i diritti riservati
 *
 * Questi valori non sono segreti: indicano solo quale database usare.
 * La protezione la fanno la password e le regole di Firestore.
 */
window.FG_CLOUD = {
  apiKey: 'AIzaSyAPBNj4nd7NZH5oZvnDNkfR8I7pXVbuVkA',
  authDomain: 'biblioteca-grimaldi.firebaseapp.com',
  projectId: 'biblioteca-grimaldi',
  appId: '1:733610433276:web:130890e2df3b568276d579',

  /* Impronte SHA-256 delle email che possono entrare (l'elenco in chiaro non viene pubblicato) */
  emailAutorizzata: [
    'b8a6118c2274f66ee069ba14ee4e9bc7bcce20103aa7dd3f7cb4c350edab3cb3',
    'c723f1ddda4765bd986604976407210d5b871333e682258dcaa503fc24bd6bc9'
  ],

  /* Intermediario Cloudflare per il catalogo SBN */
  sbnProxy: 'https://biblioteca-sbn.grimaldilibreria.workers.dev'
};
