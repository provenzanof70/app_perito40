// Componenti comuni: testata, barra in basso, foglio dal basso, avvisi.

import { html, Icona } from './ui.js';
import { vai } from './rotte.js';

export const SCHEDE = [
  ['rilievo', 'Rilievo', 'camera'],
  ['beni', 'Beni', 'squares_four'],
  ['requisiti', 'Requisiti', 'list_checks'],
  ['azioni', 'Azioni', 'flag'],
  ['pratica', 'Pratica', 'folder_simple'],
];

export function Testata({ pratica, titolo, codice, indietro, contatori, offline, alMenu }) {
  const a = pratica && pratica.andata;
  return html`<header class="testata">
    <div class="navigazione">
      <button class="indietro" onClick=${() => vai(indietro.rotta)}><${Icona} nome="indietro" /><span>${indietro.etichetta}</span></button>
      <div class="centro">${a && html`<div class="cliente">${a.cliente.ragioneSociale}</div><div class="codice">${a.codicePratica}</div>`}</div>
      <div class="azione-testata"><button class="tasto-icona" aria-label="Menu" onClick=${alMenu}><${Icona} nome="menu" /></button></div>
    </div>
    <div class="titolo">
      ${codice && html`<span class="chip-codice">${codice}</span>`}
      <h1>${titolo}</h1>
      ${offline && html`<span class="offline"><${Icona} nome="offline" dim=${14} />Offline</span>`}
    </div>
    ${contatori && html`<div class="contatori">
      ${contatori.map(c => html`<div><b>${c.n}</b><span>${c.l}</span></div>`)}
    </div>`}
  </header>`;
}

export function Barra({ codicePratica, attiva, distintivi = {} }) {
  return html`<nav class="barra">
    ${SCHEDE.map(([id, etichetta, icona]) => {
      const on = id === attiva;
      const n = distintivi[id];
      return html`<button class=${on ? 'attiva' : ''} aria-current=${on ? 'page' : null}
          onClick=${() => vai(`/p/${encodeURIComponent(codicePratica)}/${id}`)}>
        <span class="icona-scheda"><${Icona} nome=${(on ? 'fill_' : 'light_') + icona} dim=${27} />${n ? html`<span class="distintivo">${n}</span>` : null}</span>
        <span class="etichetta">${etichetta}</span>
      </button>`;
    })}
  </nav>`;
}

export function Foglio({ titolo, annulla, conferma, alConferma, alChiudi, confermaAttiva = true, children }) {
  return html`<div class="velo" onClick=${e => { if (e.target === e.currentTarget) alChiudi(); }}>
    <div class="foglio" role="dialog" aria-label=${titolo}>
      <div class="foglio-testa">
        <button onClick=${alChiudi}>${annulla || 'Chiudi'}</button>
        <span class="tit">${titolo}</span>
        ${conferma ? html`<button disabled=${!confermaAttiva} style=${{ opacity: confermaAttiva ? 1 : 0.4 }} onClick=${alConferma}>${conferma}</button>` : html`<span></span>`}
      </div>
      <div class="foglio-corpo">${children}</div>
    </div>
  </div>`;
}

export function Avviso({ tipo = 'info', titolo, children, tasti = [] }) {
  return html`<div class=${`avviso ${tipo}`} role="status">
    <div class="corpo">
      ${titolo && html`<b>${titolo}</b>`}
      ${children}
      ${tasti.length ? html`<div class="tasti">${tasti.map(([t, fn]) => html`<button onClick=${fn}>${t}</button>`)}</div>` : null}
    </div>
  </div>`;
}

export function ElencoErrori({ voci, max = 20 }) {
  return html`<ul class="errori-elenco">
    ${voci.slice(0, max).map(v => html`<li>${v.messaggio} <code>${v.codice}</code></li>`)}
    ${voci.length > max ? html`<li>… altri ${voci.length - max}</li>` : null}
  </ul>`;
}
