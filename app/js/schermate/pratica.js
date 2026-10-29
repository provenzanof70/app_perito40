// Schermate di una pratica: testata, barra in basso, promemoria di checkpoint, schede Beni e Pratica.
// Requisiti e Azioni arrivano nelle fasi F2.4–F2.5.

import { useState, useEffect } from 'preact/hooks';
import { html, dataBreve, oraBreve, megabyte } from '../ui.js';
import { Testata, Barra, Foglio, Avviso } from '../componenti.js';
import { vai, rottaPratica } from '../rotte.js';
import { ElencoBeni, SchedaBene, GalleriaGruppo } from './beni.js';
import { Rilievo } from './rilievo.js';
import { DettaglioEvidenza } from './evidenza.js';
import { GRUPPI_UI } from '../stato.js';
import { riepilogo, contatoriTestata } from '../stato.js';
import { statoCheckpoint, testoPromemoria, rinviaFino, SOGLIA_ORE, SOGLIA_EVIDENZE } from '../promemoria.js';

const TITOLI = { rilievo: 'Rilievo', beni: 'Beni', requisiti: 'Requisiti', azioni: 'Azioni', pratica: 'Pratica' };
const FASE = { requisiti: 'F2.4', azioni: 'F2.5' };

function Spunta({ si }) {
  return html`<span class=${`spunta ${si ? 'si' : ''}`}>${si ? '✓' : ''}</span>`;
}

function Avvertenze({ andata }) {
  const v = andata.sopralluogo.avvertenze || [];
  return v.length
    ? html`<div class="elenco">${v.map(t => html`<div class="voce"><span class="etichetta">${t}</span></div>`)}</div>`
    : html`<div class="meta">Nessuna avvertenza nel pacchetto di andata.</div>`;
}

// Pratiche per cui, in questa sessione, il perito ha scelto «Più tardi» all'apertura
const avvioRinviato = new Set();

function FoglioIniziaVisita({ pratica, annulla, perAzione, alChiudi, alConferma }) {
  const referenti = pratica.andata.sopralluogo.referenti;
  const [presenti, setPresenti] = useState(referenti.map(r => r.id));
  const [letto, setLetto] = useState(false);
  const cambia = id => setPresenti(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const prevista = pratica.andata.sopralluogo.dataPrevista;
  return html`<${Foglio} titolo="Inizia visita" annulla=${annulla} conferma="Inizia" confermaAttiva=${letto}
      alChiudi=${alChiudi} alConferma=${() => alConferma(presenti)}>
    ${perAzione && html`<${Avviso} tipo="info">Per acquisire evidenze e verificare i dati serve la visita avviata: l'app registra data, ora e presenti.</${Avviso}>`}
    <div class="meta">Sopralluogo ${pratica.andata.sopralluogo.id} di ${pratica.andata.cliente.ragioneSociale}, previsto il ${dataBreve(prevista)}. L'ora di inizio sarà quella di adesso.</div>
    <div class="sezione">Presenti</div>
    <div class="elenco">
      ${referenti.map(r => html`<button class="scelta" onClick=${() => cambia(r.id)}><${Spunta} si=${presenti.includes(r.id)} />
        <span class="etichetta">${r.nome}<span class="sotto">${r.ruolo} · ${r.organizzazione}</span></span></button>`)}
    </div>
    <div class="sezione">Avvertenze</div>
    <${Avvertenze} andata=${pratica.andata} />
    <div class="elenco"><button class="scelta" onClick=${() => setLetto(!letto)}><${Spunta} si=${letto} /><span class="etichetta">Ho letto le avvertenze</span></button></div>
  </${Foglio}>`;
}

function Segnaposto({ scheda }) {
  return html`<div class="vuoto">Questa schermata arriva nella fase ${FASE[scheda]}.</div>`;
}

function SchedaPraticaDettagli({ pratica, sistema, cp, alIniziaVisita }) {
  const a = pratica.andata;
  const v = pratica.visita;
  const nomi = v ? a.sopralluogo.referenti.filter(r => v.presenti.includes(r.id)).map(r => r.nome).join(', ') : '';
  const ultimo = pratica.esportazioni.ultimo;
  const p = sistema.persistenza || {};
  return html`
    <div class="sezione">Visita</div>
    ${v
      ? html`<div class="elenco">
          <div class="voce"><span class="etichetta">In corso</span><span class="valore">dalle ${oraBreve(v.inizio)} del ${dataBreve(v.inizio)}</span></div>
          <div class="voce"><span class="etichetta">Presenti<span class="sotto">${nomi || 'nessuno indicato'}</span></span></div>
        </div>`
      : html`<div class="scheda">
          <div class="meta">Visita ${a.sopralluogo.id} prevista il ${dataBreve(a.sopralluogo.dataPrevista)}, non ancora iniziata.</div>
          <button class="secondario" style=${{ alignSelf: 'flex-start' }} onClick=${alIniziaVisita}>Inizia visita</button>
        </div>`}

    <div class="sezione">Pacchetto di rientro</div>
    <div class="elenco">
      <div class="voce"><span class="etichetta">Ultimo pacchetto</span><span class="valore">${ultimo ? `${ultimo.tipo} · ${oraBreve(ultimo.data)} del ${dataBreve(ultimo.data)}` : 'nessuno'}</span></div>
      <div class="voce"><span class="etichetta">Promemoria di checkpoint<span class="sotto">ogni ${SOGLIA_ORE} ore o ${SOGLIA_EVIDENZE} evidenze dall'ultimo pacchetto</span></span>
        <span class="valore">${!v ? 'a visita iniziata' : cp.dovuto ? 'dovuto ora' : `${cp.nuove} evidenze, ${Math.floor(cp.ore)} h ${String(Math.round((cp.ore % 1) * 60)).padStart(2, '0')} min`}</span></div>
      <div class="voce disattiva"><span class="etichetta">Crea pacchetto ZIP<span class="sotto">fase F2.6</span></span></div>
    </div>

    <div class="sezione">Cronologia e date</div>
    <div class="elenco"><div class="voce disattiva"><span class="etichetta">${a.timeline.length} date agli atti<span class="sotto">consultazione e date rilevate: fase F2.5</span></span></div></div>

    <div class="sezione">Avvertenze</div>
    <${Avvertenze} andata=${a} />

    <div class="sezione">Pacchetto di andata</div>
    <div class="elenco">
      <div class="voce"><span class="etichetta">Revisione</span><span class="valore">${a.revisione} del ${dataBreve(a.creatoIl)}</span></div>
      <div class="voce"><span class="etichetta">Importato</span><span class="valore">${oraBreve(pratica.importataIl)} del ${dataBreve(pratica.importataIl)}</span></div>
      <div class="voce"><span class="etichetta">SHA-256<span class="sotto" style=${{ wordBreak: 'break-all', fontFamily: 'ui-monospace, Menlo, monospace' }}>${pratica.andataSha256}</span></span></div>
      <div class="voce"><span class="etichetta">Controlli all'importazione</span><span class="valore">${pratica.avvisiImportazione.length ? `${pratica.avvisiImportazione.length} avvisi` : 'nessun avviso'}</span></div>
      ${pratica.avvisiImportazione.map(x => html`<div class="voce"><span class="etichetta"><span class="sotto">${x.messaggio} (${x.codice})</span></span></div>`)}
    </div>

    <div class="sezione">Archivio sul telefono</div>
    <div class="elenco">
      <div class="voce"><span class="etichetta">Archiviazione persistente</span><span class="valore">${!p.supportata ? 'non disponibile' : p.persistente ? 'concessa' : 'non concessa'}</span></div>
      <div class="voce"><span class="etichetta">Spazio usato</span><span class="valore">${megabyte(p.usato)} di ${megabyte(p.quota)}</span></div>
    </div>`;
}

export function SchermataPratica({ pratica, evidenze, registri, scheda, codiceBene, gruppo, idEvidenza, sistema, aggiorna, mostra, alMenu }) {
  const daAvviare = !pratica.visita && pratica.stato !== 'rientrata';
  const [foglio, setFoglio] = useState(daAvviare && !avvioRinviato.has(pratica.codicePratica) && scheda !== 'evidenza' ? 'apertura' : null);
  const [dopo, setDopo] = useState(null);
  const [, setBattito] = useState(0);
  useEffect(() => { const t = setInterval(() => setBattito(n => n + 1), 60000); return () => clearInterval(t); }, []);

  const r = riepilogo(pratica, evidenze, registri);
  const bene = codiceBene && (pratica.andata.beni.find(b => b.codice === codiceBene) || registri.beneNuovo.get(codiceBene));
  // Chiamata da scatto, verifica o bene nuovo senza visita avviata: apre «Inizia visita» e poi prosegue l'azione
  const serveVisita = continua => { setDopo(() => continua || null); setFoglio('azione'); };
  const galleria = scheda === 'beni' && bene && gruppo != null && GRUPPI_UI[gruppo];
  const beneScelto = scheda === 'beni' && bene;
  const cp = statoCheckpoint(pratica, r.evidenze);
  const codice = pratica.codicePratica;

  const chiudiFoglio = () => {
    if (foglio === 'apertura') avvioRinviato.add(codice);
    setFoglio(null); setDopo(null);
  };
  const iniziaVisita = presenti => {
    // l'azione che aveva chiesto la visita riparte subito, dentro il tocco su «Inizia»: su iPhone la fotocamera si apre solo così
    const continua = dopo;
    setFoglio(null); setDopo(null);
    if (continua) continua();
    return aggiorna(codice, p => {
      if (p.visita) return;
      const ora = new Date().toISOString();
      p.visita = { id: p.andata.sopralluogo.id, inizio: ora, presenti, avvertenzeConfermateIl: ora };
      p.avvertenzeVisteIl = p.avvertenzeVisteIl || ora;
    }).then(() => mostra('Visita iniziata: da ora vale il promemoria di checkpoint'));
  };
  const rinvia = () => aggiorna(codice, p => { p.promemoria.rinviatoFino = rinviaFino(); });
  if (scheda === 'evidenza') {
    const e = evidenze.find(x => x.id === idEvidenza);
    return e ? html`<${DettaglioEvidenza} key=${e.id + (e.modificataIl || '')} pratica=${pratica} evidenza=${e} evidenze=${evidenze} registri=${registri} mostra=${mostra} />`
      : html`<div class="vuoto">Evidenza ${idEvidenza} non trovata</div>`;
  }

  return html`<div class="schermo con-barra">
    <${Testata} pratica=${pratica} titolo=${galleria ? GRUPPI_UI[gruppo].nome : beneScelto ? bene.denominazione : TITOLI[scheda] || 'Beni'} codice=${beneScelto && bene.codice} offline=${!sistema.online}
      indietro=${galleria ? { etichetta: bene.codice, rotta: rottaPratica(codice, 'beni', bene.codice) } : beneScelto ? { etichetta: 'Beni', rotta: rottaPratica(codice, 'beni') }
        : { etichetta: scheda === 'beni' ? 'Pratiche' : 'Beni', rotta: scheda === 'beni' ? '/' : rottaPratica(codice, 'beni') }}
      contatori=${!beneScelto && (scheda === 'beni' || scheda === 'pratica') ? contatoriTestata(r) : null} alMenu=${alMenu} />
    <div class="contenuto">
      ${cp.dovuto && html`<${Avviso} tipo="att" titolo="Crea un checkpoint" tasti=${[
        ['Crea checkpoint', () => { vai(rottaPratica(codice, 'pratica')); mostra('La creazione del pacchetto arriva nella fase F2.6'); }],
        ['Più tardi', rinvia]]}>${testoPromemoria(cp)}</${Avviso}>`}
      ${galleria ? html`<${GalleriaGruppo} pratica=${pratica} bene=${bene} gruppo=${gruppo} evidenze=${evidenze} />`
        : scheda === 'rilievo' ? html`<${Rilievo} key=${(codiceBene || '') + gruppo} pratica=${pratica} evidenze=${evidenze} registri=${registri} beneIniziale=${codiceBene} gruppoIniziale=${gruppo} mostra=${mostra} alVisitaNecessaria=${serveVisita} />`
        : beneScelto ? html`<${SchedaBene} pratica=${pratica} bene=${bene} evidenze=${evidenze} registri=${registri} mostra=${mostra} alVisitaNecessaria=${serveVisita} />`
        : scheda === 'beni' ? html`<${ElencoBeni} pratica=${pratica} evidenze=${evidenze} registri=${registri} alVisitaNecessaria=${serveVisita} />`
        : scheda === 'pratica' ? html`<${SchedaPraticaDettagli} pratica=${pratica} sistema=${sistema} cp=${cp} alIniziaVisita=${() => setFoglio('scheda')} />`
        : html`<${Segnaposto} scheda=${scheda} />`}
    </div>
    <${Barra} codicePratica=${codice} attiva=${scheda} distintivi=${{ azioni: r.azioniAperte }} />
    ${foglio && html`<${FoglioIniziaVisita} pratica=${pratica} annulla=${foglio === 'apertura' ? 'Più tardi' : 'Annulla'}
      perAzione=${foglio === 'azione'} alChiudi=${chiudiFoglio} alConferma=${iniziaVisita} />`}
  </div>`;
}
