// Radice dell'app: rotte, dati dell'archivio, importazione, menu, messaggi.

import { useState, useEffect } from 'preact/hooks';
import { html } from './ui.js';
import { Foglio, Avviso, ElencoErrori } from './componenti.js';
import { rottaCorrente, vai } from './rotte.js';
import { tutti, transazione, impostazione, salvaImpostazione } from './archivio.js';
import { importaAndata } from './importa.js';
import { Elenco } from './schermate/elenco.js';
import { SchermataPratica } from './schermate/pratica.js';

export const VERSIONE_APP = '0.1.0 · F2.1';
const NOME_PERITO = 'Perito Ing. Francesco Provenzano';

function MenuApp({ sistema, nomePerito, alNome, visitaInCorso, alChiudi }) {
  const [nome, setNome] = useState(nomePerito);
  return html`<${Foglio} titolo="Menu" conferma="Salva" alChiudi=${alChiudi}
      alConferma=${() => { alNome(nome.trim() || NOME_PERITO); alChiudi(); }}>
    <div class="sezione">Nome mostrato nell'elenco pratiche</div>
    <input class="campo-testo" value=${nome} onInput=${e => setNome(e.target.value)} />
    ${sistema.aggiornamento && (visitaInCorso
      ? html`<${Avviso} tipo="info" titolo="Nuova versione disponibile">Si potrà installare a visita chiusa, per non interrompere la raccolta.</${Avviso}>`
      : html`<${Avviso} tipo="info" titolo="Nuova versione disponibile" tasti=${[['Aggiorna ora', sistema.applicaAggiornamento]]}>L'app si ricarica; i dati restano sul telefono.</${Avviso}>`)}
    <div class="sezione">App</div>
    <div class="elenco">
      <div class="voce"><span class="etichetta">Versione</span><span class="valore">${VERSIONE_APP}</span></div>
      <div class="voce"><span class="etichetta">Installata sulla Home</span><span class="valore">${sistema.installata ? 'sì' : 'no'}</span></div>
      <div class="voce"><span class="etichetta">Rete</span><span class="valore">${sistema.online ? 'disponibile' : 'assente: l\'app funziona offline'}</span></div>
    </div>
    <div class="meta">Nessun dato esce dal telefono se non lo esporti tu con un pacchetto. L'app non usa servizi esterni.</div>
  </${Foglio}>`;
}

export function App({ sistema: sistemaIniziale }) {
  const [rotta, setRotta] = useState(rottaCorrente());
  const [pratiche, setPratiche] = useState(null);
  const [evidenzePer, setEvidenzePer] = useState({});
  const [sistema, setSistema] = useState(sistemaIniziale);
  const [nomePerito, setNomePerito] = useState(NOME_PERITO);
  const [toast, setToast] = useState(null);
  const [rifiuto, setRifiuto] = useState(null);
  const [menu, setMenu] = useState(false);

  const mostra = testo => { setToast(testo); clearTimeout(mostra.t); mostra.t = setTimeout(() => setToast(null), 3500); };

  async function ricarica() {
    const p = await tutti('pratiche');
    const ev = {};
    for (const x of p) ev[x.codicePratica] = await tutti('evidenze', 'perPratica', x.codicePratica);
    p.sort((a, b) => (a.andata.sopralluogo.dataPrevista).localeCompare(b.andata.sopralluogo.dataPrevista));
    setEvidenzePer(ev);
    setPratiche(p);
  }

  // Lettura, modifica e scrittura di una pratica in un'unica transazione
  async function aggiorna(codice, fn) {
    await transazione('pratiche', 'readwrite', s => {
      const r = s.get(codice);
      r.onsuccess = () => { const p = r.result; fn(p); s.put(p); };
    });
    await ricarica();
  }

  async function importa(bytes, nomeFile) {
    try {
      const r = await importaAndata(bytes, nomeFile);
      if (r.stato === 'rifiutata') { setRifiuto(r); return; }
      await ricarica();
      const n = r.esito.avvisi.length;
      const c = r.pratica.codicePratica;
      mostra(r.stato === 'gia_presente' ? `${c}: pacchetto già importato`
        : `${c} ${r.stato === 'aggiornata' ? `aggiornata alla ${r.pratica.andata.revisione}` : 'importata'}${n ? ` · ${n} avvisi nella scheda Pratica` : ''}`);
    } catch (e) {
      setRifiuto({ motivo: `Importazione non riuscita: ${e.message}`, esito: { errori: [] } });
    }
  }

  useEffect(() => {
    const suHash = () => setRotta(rottaCorrente());
    const rete = () => setSistema(s => ({ ...s, online: navigator.onLine }));
    const agg = e => setSistema(s => ({ ...s, aggiornamento: true, applicaAggiornamento: e.detail }));
    addEventListener('hashchange', suHash);
    addEventListener('online', rete); addEventListener('offline', rete);
    addEventListener('perito40:aggiornamento', agg);
    ricarica();
    impostazione('nomePerito', NOME_PERITO).then(setNomePerito);
    return () => { removeEventListener('hashchange', suHash); removeEventListener('online', rete); removeEventListener('offline', rete); removeEventListener('perito40:aggiornamento', agg); };
  }, []);

  let schermata;
  if (rotta.nome === 'pratica' && pratiche) {
    const p = pratiche.find(x => x.codicePratica === rotta.codice);
    if (!p) { vai('/'); return null; }
    schermata = html`<${SchermataPratica} key=${p.codicePratica + rotta.scheda} pratica=${p} evidenze=${evidenzePer[p.codicePratica] || []}
      scheda=${rotta.scheda} sistema=${sistema} aggiorna=${aggiorna} mostra=${mostra} alMenu=${() => setMenu(true)} />`;
  } else {
    schermata = html`<${Elenco} pratiche=${pratiche} evidenzePer=${evidenzePer} sistema=${sistema} nomePerito=${nomePerito}
      alMenu=${() => setMenu(true)}
      alFile=${async f => importa(new Uint8Array(await f.arrayBuffer()), f.name)}
      alDemo=${async () => {
        const r = await fetch('../demo/PRATICA_DEMO_2026_001/andata/perizia40-andata.json');
        importa(new Uint8Array(await r.arrayBuffer()), 'perizia40-andata.json');
      }} />`;
  }

  return html`${schermata}
    ${toast && html`<div class="toast" role="status">${toast}</div>`}
    ${rifiuto && html`<${Foglio} titolo="Pacchetto non importato" alChiudi=${() => setRifiuto(null)}>
      <${Avviso} tipo="errore">${rifiuto.motivo}</${Avviso}>
      ${rifiuto.esito.errori.length ? html`<${ElencoErrori} voci=${rifiuto.esito.errori} />` : null}
    </${Foglio}>`}
    ${menu && html`<${MenuApp} sistema=${sistema} nomePerito=${nomePerito} visitaInCorso=${(pratiche || []).some(p => p.visita && p.stato !== 'rientrata')}
      alNome=${n => { setNomePerito(n); salvaImpostazione('nomePerito', n); }} alChiudi=${() => setMenu(false)} />`}`;
}
