// 1a · Elenco pratiche

import { useState, useRef } from 'preact/hooks';
import { html, Icona, dataBreve, oraBreve, oggi } from '../ui.js';
import { Avviso } from '../componenti.js';
import { vai } from '../rotte.js';
import { riepilogo } from '../stato.js';

function RigaData({ pratica }) {
  const a = pratica.andata;
  if (pratica.stato === 'rientrata') return html`<div class="data-visita"><${Icona} nome="calendario" dim=${18} />Visitata ${dataBreve(pratica.visita && pratica.visita.inizio)}</div>`;
  if (pratica.visita) return html`<div class="data-visita oggi"><${Icona} nome="calendario" dim=${18} />Visita in corso · dalle ${oraBreve(pratica.visita.inizio)} del ${dataBreve(pratica.visita.inizio)}</div>`;
  const prevista = a.sopralluogo.dataPrevista;
  if (prevista === oggi()) return html`<div class="data-visita oggi"><${Icona} nome="calendario" dim=${18} />Visita oggi · ${dataBreve(prevista)}</div>`;
  return html`<div class="data-visita"><${Icona} nome="calendario" dim=${18} />Visita ${dataBreve(prevista)}</div>`;
}

function SchedaPratica({ pratica, evidenze }) {
  const a = pratica.andata;
  const r = riepilogo(pratica, evidenze);
  const quota = r.gruppiAttesi ? Math.round((100 * r.gruppiConMateriale) / r.gruppiAttesi) : 0;
  return html`<button class="scheda" onClick=${() => vai(`/p/${encodeURIComponent(pratica.codicePratica)}/beni`)}>
    <div class="riga-alta">
      <span class="codice-pratica">${pratica.codicePratica}${a.demo ? ' · DEMO' : ''}</span>
      ${pratica.stato === 'rientrata'
        ? html`<span class="pastiglia p-ok">Pacchetto finale salvato</span>`
        : html`<span class="pastiglia p-ok">Disponibile offline</span>`}
    </div>
    <div><div class="cliente-grande">${a.cliente.ragioneSociale}</div><div class="sede">${a.cliente.sedeIntervento}</div></div>
    <${RigaData} pratica=${pratica} />
    ${pratica.stato !== 'rientrata' && html`<div class="avanzamento" title="Gruppi attesi con materiale"><div style=${{ width: `${quota}%` }}></div></div>`}
    <div class="meta">${r.beni} beni · ${r.evidenze} evidenze · ${r.azioniAperte} azioni aperte</div>
  </button>`;
}

export function Elenco({ pratiche, evidenzePer, sistema, nomePerito, alFile, alDemo, alMenu }) {
  const [vista, setVista] = useState('in_corso');
  const [testo, setTesto] = useState('');
  const input = useRef(null);
  const tutte = pratiche || [];
  const inCorso = tutte.filter(p => p.stato !== 'rientrata');
  const rientrate = tutte.filter(p => p.stato === 'rientrata');
  const t = testo.trim().toLowerCase();
  const visibili = (vista === 'in_corso' ? inCorso : rientrate).filter(p => !t || [p.codicePratica, p.andata.cliente.ragioneSociale, p.andata.cliente.sedeIntervento]
    .some(s => s.toLowerCase().includes(t)));

  return html`<div class="schermo">
    <div class="intestazione">
      <div class="marchio">
        <div><span>${nomePerito}</span></div>
        <button class="tasto-icona" aria-label="Menu" onClick=${alMenu}><${Icona} nome="menu" /></button>
      </div>
      <h1>Pratiche</h1>
      <label class="cerca"><${Icona} nome="cerca" dim=${19} />
        <input type="search" placeholder="Cerca pratica o cliente" value=${testo} onInput=${e => setTesto(e.target.value)} /></label>
      <div class="segmenti">
        <button class=${vista === 'in_corso' ? 'attivo' : ''} onClick=${() => setVista('in_corso')}>In corso (${inCorso.length})</button>
        <button class=${vista === 'rientrate' ? 'attivo' : ''} onClick=${() => setVista('rientrate')}>Rientrate${rientrate.length ? ` (${rientrate.length})` : ''}</button>
      </div>
    </div>
    <div class="contenuto">
      ${!sistema.installata && html`<${Avviso} tipo="info" titolo="Installa l'app sulla Home">
        In Safari tocca Condividi › Aggiungi alla schermata Home. Installata, l'app funziona senza rete e l'archivio è più protetto.</${Avviso}>`}
      ${sistema.persistenza && sistema.persistenza.supportata && !sistema.persistenza.persistente && html`<${Avviso} tipo="att" titolo="Archivio non protetto">
        Il sistema potrebbe liberare spazio cancellando i dati dell'app. Usala dall'icona sulla Home e crea checkpoint frequenti.</${Avviso}>`}
      ${pratiche === null ? null : visibili.length
        ? visibili.map(p => html`<${SchedaPratica} key=${p.codicePratica} pratica=${p} evidenze=${evidenzePer[p.codicePratica] || []} />`)
        : html`<div class="vuoto">
            ${tutte.length ? (t ? 'Nessuna pratica corrisponde alla ricerca' : 'Nessuna pratica in questa vista')
              : html`<div>Nessuna pratica sul telefono.<br />Importa il pacchetto di andata preparato in studio.</div>
                     <button class="collegamento" onClick=${alDemo}>Prova con la pratica DEMO</button>`}
          </div>`}
    </div>
    <div class="piede">
      <input ref=${input} type="file" accept=".json,application/json" class="campo-file"
        onChange=${e => { const f = e.target.files[0]; e.target.value = ''; if (f) alFile(f); }} />
      <button class="primario" onClick=${() => input.current.click()}><${Icona} nome="importa" dim=${20} />Importa pacchetto di andata</button>
    </div>
  </div>`;
}
