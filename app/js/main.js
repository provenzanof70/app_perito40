// Avvio: archiviazione persistente, service worker per il funzionamento offline, interfaccia.

import { render } from 'preact';
import { html } from './ui.js';
import { App } from './app.js';
import { richiediPersistenza } from './archivio.js';

const installata = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Il service worker nuovo resta in attesa: lo si attiva solo su richiesta, mai durante una visita
function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const segnala = w => dispatchEvent(new CustomEvent('perito40:aggiornamento', { detail: () => w.postMessage('attiva') }));
    if (reg.waiting && navigator.serviceWorker.controller) segnala(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) segnala(w); });
    });
  }).catch(() => {});
  let ricaricata = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!ricaricata) { ricaricata = true; location.reload(); } });
}

async function avvia() {
  let persistenza = { supportata: false, persistente: false };
  try { persistenza = await richiediPersistenza(); } catch { /* il browser può rifiutare: lo si mostra nell'app */ }
  registraServiceWorker();
  render(html`<${App} sistema=${{ online: navigator.onLine, installata, persistenza, aggiornamento: false }} />`, document.getElementById('app'));
}

avvia();
