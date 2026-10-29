// Schermate di una pratica: testata, barra in basso, promemoria di checkpoint, schede Beni e Pratica.
// Rilievo, Requisiti e Azioni arrivano nelle fasi F2.3–F2.5.

import { useState, useEffect } from 'preact/hooks';
import { html, dataBreve, oraBreve, megabyte } from '../ui.js';
import { Testata, Barra, Foglio, Avviso } from '../componenti.js';
import { vai, rottaPratica } from '../rotte.js';
import { ElencoBeni, SchedaBene } from './beni.js';
import { riepilogo, contatoriTestata } from '../stato.js';
import { statoCheckpoint, testoPromemoria, rinviaFino, SOGLIA_ORE, SOGLIA_EVIDENZE } from '../promemoria.js';

const TITOLI = { rilievo: 'Rilievo', beni: 'Beni', requisiti: 'Requisiti', azioni: 'Azioni', pratica: 'Pratica' };
const FASE = { rilievo: 'F2.3', requisiti: 'F2.4', azioni: 'F2.5' };

function Spunta({ si }) {
  return html`<span class=${`spunta ${si ? 'si' : ''}`}>${si ? '✓' : ''}</span>`;
}

function Avvertenze({ andata }) {
  const v = andata.sopralluogo.avvertenze || [];
  return v.length
    ? html`<div class="elenco">${v.map(t => html`<div class="voce"><span class="etichetta">${t}</span></div>`)}</div>`
    : html`<div class="meta">Nessuna avvertenza nel pacchetto di andata.</div>`;
}

function FoglioAvvertenze({ pratica, alChiudi, alConferma }) {
  return html`<${Foglio} titolo="Avvertenze" conferma="Ho letto" alConferma=${alConferma} alChiudi=${alChiudi}>
    <div class="meta">Dal pacchetto di andata (${pratica.andata.cliente.ragioneSociale}): restano consultabili nella scheda Pratica.</div>
    <${Avvertenze} andata=${pratica.andata} />
  </${Foglio}>`;
}

function FoglioIniziaVisita({ pratica, alChiudi, alConferma }) {
  const referenti = pratica.andata.sopralluogo.referenti;
  const [presenti, setPresenti] = useState(referenti.map(r => r.id));
  const [letto, setLetto] = useState(false);
  const cambia = id => setPresenti(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const prevista = pratica.andata.sopralluogo.dataPrevista;
  return html`<${Foglio} titolo="Inizia visita" annulla="Annulla" conferma="Inizia" confermaAttiva=${letto}
      alChiudi=${alChiudi} alConferma=${() => alConferma(presenti)}>
    <div class="meta">Sopralluogo ${pratica.andata.sopralluogo.id}, previsto il ${dataBreve(prevista)}. L'ora di inizio sarà quella di adesso.</div>
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

export function SchermataPratica({ pratica, evidenze, registri, scheda, codiceBene, sistema, aggiorna, mostra, alMenu }) {
  const [foglio, setFoglio] = useState(pratica.avvertenzeVisteIl ? null : 'avvertenze');
  const [, setBattito] = useState(0);
  useEffect(() => { const t = setInterval(() => setBattito(n => n + 1), 60000); return () => clearInterval(t); }, []);

  const r = riepilogo(pratica, evidenze, registri);
  const bene = codiceBene && (pratica.andata.beni.find(b => b.codice === codiceBene) || registri.beneNuovo.get(codiceBene));
  const serveVisita = () => mostra('Prima inizia la visita dalla scheda Pratica');
  const cp = statoCheckpoint(pratica, r.evidenze);
  const codice = pratica.codicePratica;

  const segnaAvvertenze = () => aggiorna(codice, p => { p.avvertenzeVisteIl = new Date().toISOString(); }).then(() => setFoglio(null));
  const iniziaVisita = presenti => aggiorna(codice, p => {
    const ora = new Date().toISOString();
    p.visita = { id: p.andata.sopralluogo.id, inizio: ora, presenti, avvertenzeConfermateIl: ora };
    p.avvertenzeVisteIl = p.avvertenzeVisteIl || ora;
  }).then(() => { setFoglio(null); mostra('Visita iniziata: da ora vale il promemoria di checkpoint'); });
  const rinvia = () => aggiorna(codice, p => { p.promemoria.rinviatoFino = rinviaFino(); });

  return html`<div class="schermo con-barra">
    <${Testata} pratica=${pratica} titolo=${bene ? bene.denominazione : TITOLI[scheda] || 'Beni'} codice=${bene && bene.codice} offline=${!sistema.online}
      indietro=${bene ? { etichetta: 'Beni', rotta: rottaPratica(codice, 'beni') }
        : { etichetta: scheda === 'beni' ? 'Pratiche' : 'Beni', rotta: scheda === 'beni' ? '/' : rottaPratica(codice, 'beni') }}
      contatori=${!bene && (scheda === 'beni' || scheda === 'pratica') ? contatoriTestata(r) : null} alMenu=${alMenu} />
    <div class="contenuto">
      ${cp.dovuto && html`<${Avviso} tipo="att" titolo="Crea un checkpoint" tasti=${[
        ['Crea checkpoint', () => { vai(rottaPratica(codice, 'pratica')); mostra('La creazione del pacchetto arriva nella fase F2.6'); }],
        ['Più tardi', rinvia]]}>${testoPromemoria(cp)}</${Avviso}>`}
      ${scheda === 'beni' && bene ? html`<${SchedaBene} pratica=${pratica} bene=${bene} evidenze=${evidenze} registri=${registri} mostra=${mostra} alVisitaNecessaria=${serveVisita} />`
        : scheda === 'beni' ? html`<${ElencoBeni} pratica=${pratica} evidenze=${evidenze} registri=${registri} alVisitaNecessaria=${serveVisita} />`
        : scheda === 'pratica' ? html`<${SchedaPraticaDettagli} pratica=${pratica} sistema=${sistema} cp=${cp} alIniziaVisita=${() => setFoglio('visita')} />`
        : html`<${Segnaposto} scheda=${scheda} />`}
    </div>
    <${Barra} codicePratica=${codice} attiva=${scheda} distintivi=${{ azioni: r.azioniAperte }} />
    ${foglio === 'avvertenze' && html`<${FoglioAvvertenze} pratica=${pratica} alChiudi=${segnaAvvertenze} alConferma=${segnaAvvertenze} />`}
    ${foglio === 'visita' && html`<${FoglioIniziaVisita} pratica=${pratica} alChiudi=${() => setFoglio(null)} alConferma=${iniziaVisita} />`}
  </div>`;
}
