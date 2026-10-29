// 1i · Azioni: aperte (dall'andata e nate in campo) e proposte di chiusura.
// In campo non si chiude nulla: si propone la chiusura con motivo ed evidenza o riscontro obbligatori;
// la chiusura definitiva la decide il perito sul PC (§10.4). Niente cestino: una bozza nata in campo
// si scarta solo finché non è entrata in un pacchetto esportato.

import { useState } from 'preact/hooks';
import { html, Icona, oggi } from '../ui.js';
import { Avviso } from '../componenti.js';
import { vai, rottaPratica } from '../rotte.js';
import { REQUISITI_UI, requisitiDelBene } from '../stato.js';
import { salvaRegistro, cancellaRegistro, prossimoId } from '../registri.js';
import { SceltaEvidenze, tuttiIBeni } from './requisiti.js';

const CATEGORIE = { documento: ['Documento', 'file_text'], evidenza: ['Evidenza', 'camera'], chiarimento: ['Chiarimento', 'chat_text'] };
const PRIORITA = { indispensabile: 'Indispensabile', raccomandata: 'Raccomandata', utile: 'Utile' };
const MOTIVI = { evidenza_acquisita: 'Evidenza acquisita', riscontro_diretto: 'Riscontro diretto' };
const ESITI = { proposta_chiusura: 'Proposta di chiusura', parziale: 'Risolta in parte', non_risolta: 'Non risolta in campo' };

// Azioni della pratica sul telefono: quelle dell'andata con il loro aggiornamento in campo, più le bozze
export function elencoAzioni(pratica, registri) {
  const andata = pratica.andata.azioniAperte.map(a => ({ ...a, origine: 'andata', aggiornamento: registri.aggiornamento.get(a.id) || null }));
  const bozze = [...registri.azione.values()].map(a => ({ ...a, origine: 'campo', aggiornamento: null }));
  return [...andata, ...bozze].sort((a, b) => a.id.localeCompare(b.id));
}

export const azioniAperte = (pratica, registri) => elencoAzioni(pratica, registri).filter(a => !a.aggiornamento || a.aggiornamento.esitoCampo !== 'proposta_chiusura');

function nomeBene(pratica, registri, codici) {
  const b = tuttiIBeni(pratica, registri).find(x => x.codice === codici[0].split('.')[0]);
  return `${codici.join(', ')}${b ? ` · ${b.denominazione}` : ''}`;
}

function SchedaAzione({ pratica, evidenze, registri, a, mostra }) {
  const [aperto, setAperto] = useState(null);
  const [motivo, setMotivo] = useState('evidenza_acquisita');
  const [scelte, setScelte] = useState([]);
  const [riscontro, setRiscontro] = useState('');
  const [nota, setNota] = useState('');
  const cat = CATEGORIE[a.categoria] || CATEGORIE.documento;
  const u = a.aggiornamento;
  const cod = pratica.codicePratica;
  const riscontri = [...registri.riscontro.values()].filter(r => a.beni.some(b => b.split('.')[0] === r.bene));
  const beneEv = a.beni[0].split('.')[0];
  const generata = a.generataDa ? `nata da ${a.generataDa.id}` : a.origine === 'campo' ? 'nata in campo' : 'dall\'andata';

  const salva = async esitoCampo => {
    const dati = { idAzione: a.id, esitoCampo, nota: nota.trim() || undefined };
    if (esitoCampo === 'proposta_chiusura') {
      dati.motivoProposto = motivo;
      if (motivo === 'evidenza_acquisita') dati.evidenze = scelte;
      else { dati.riscontro = riscontro; dati.evidenze = (registri.riscontro.get(riscontro) || {}).evidenze || []; }
    }
    await salvaRegistro(cod, 'aggiornamento', a.id, dati);
    dispatchEvent(new Event('perito40:ricarica'));
    mostra(esitoCampo === 'proposta_chiusura' ? `${a.id}: chiusura proposta, la decide il perito sul PC` : `${a.id}: esito annotato`);
    setAperto(null);
  };
  const propostaValida = motivo === 'evidenza_acquisita' ? scelte.length > 0 : !!riscontro;
  const proposta = u && u.esitoCampo === 'proposta_chiusura';

  return html`<div class="scheda azione">
    <div class="azione-testa">
      <span class=${`categoria ${a.categoria || 'documento'}`}><${Icona} nome=${cat[1]} dim=${14} />${cat[0]}</span>
      ${a.priorita && html`<span class="pastiglia mini p-neutra">${PRIORITA[a.priorita]}</span>`}
      <span style=${{ flex: 1 }}></span><span class="meta">${a.id} · ${generata}</span>
    </div>
    <div class="azione-titolo">${a.cosaServe}</div>
    <div class="meta">${nomeBene(pratica, registri, a.beni)} · ${a.requisito}</div>
    ${(a.nota || a.percheServe) && !proposta && html`<div class="azione-nota">${a.nota || a.percheServe}</div>`}
    ${a.esempioAccettabile && !proposta && html`<div class="meta">Evidenza accettabile: ${a.esempioAccettabile}</div>`}
    ${u && html`<div class=${`azione-esito ${u.esitoCampo}`}><b>${ESITI[u.esitoCampo]}</b>${u.motivoProposto ? ` · ${MOTIVI[u.motivoProposto]}` : ''}
      ${u.riscontro ? ` (${u.riscontro})` : ''}${u.evidenze && u.evidenze.length ? ` · ${u.evidenze.join(', ')}` : ''}${u.nota ? html`<br />${u.nota}` : ''}</div>`}
    ${a.origine === 'andata' && !aperto && html`<div class="azione-tasti">
      ${proposta
        ? html`<button class="secondario piccolo" onClick=${async () => { await cancellaRegistro(cod, 'aggiornamento', a.id); dispatchEvent(new Event('perito40:ricarica')); mostra(`${a.id}: proposta ritirata`); }}>Ritira proposta</button>`
        : html`<button class="secondario piccolo pieno" onClick=${() => setAperto('chiusura')}><${Icona} nome="spunta" dim=${16} />Proponi chiusura</button>
               <button class="secondario piccolo" onClick=${() => setAperto('esito')}>Annota esito</button>`}
    </div>`}
    ${a.origine === 'campo' && html`<div class="azione-tasti">
      <button class="secondario piccolo" onClick=${() => vai(rottaPratica(cod, 'azione', a.id))}>Modifica</button>
      ${!pratica.esportazioni.ultimo && html`<button class="secondario piccolo rosso" onClick=${async () => {
        await cancellaRegistro(cod, 'azione', a.id); dispatchEvent(new Event('perito40:ricarica')); mostra(`${a.id} scartata (nessun pacchetto esportato)`);
      }}>Scarta bozza</button>`}
    </div>`}
    ${aperto === 'chiusura' && html`<div class="editor-azione">
      <div class="meta">Motivo della proposta (la chiusura la decide il perito sul PC)</div>
      <div class="segmenti">${Object.entries(MOTIVI).map(([k, l]) => html`<button class=${motivo === k ? 'attivo' : ''} onClick=${() => setMotivo(k)}>${l}</button>`)}</div>
      ${motivo === 'evidenza_acquisita'
        ? html`<${SceltaEvidenze} pratica=${pratica} evidenze=${evidenze} registri=${registri} bene=${beneEv} requisito=${a.requisito}
            scelte=${scelte} setScelte=${setScelte} idCampo=${`campo-azione-${a.id}`} mostra=${mostra} />`
        : riscontri.length
          ? html`<div class="elenco">${riscontri.map(r => html`<button class="scelta" onClick=${() => setRiscontro(r.id)}>
              <span class=${`spunta ${riscontro === r.id ? 'si' : ''}`}>${riscontro === r.id ? '✓' : ''}</span>
              <span class="etichetta">${r.id} · ${r.requisito}<span class="sotto">${r.frase}</span></span></button>`)}</div>`
          : html`<div class="meta">Nessun riscontro diretto su questo bene: registralo dalla scheda Requisiti.</div>`}
      <textarea class="campo-testo area" rows="2" value=${nota} onInput=${e => setNota(e.target.value)} placeholder="Nota (facoltativa)" />
      <div class="azione-tasti"><button class="secondario piccolo" onClick=${() => setAperto(null)}>Annulla</button>
        <button class="secondario piccolo pieno" disabled=${!propostaValida} onClick=${() => salva('proposta_chiusura')}>Proponi chiusura</button></div>
    </div>`}
    ${aperto === 'esito' && html`<div class="editor-azione">
      <textarea class="campo-testo area" rows="2" value=${nota} onInput=${e => setNota(e.target.value)} placeholder="Cosa è emerso in campo (obbligatoria)" />
      <div class="azione-tasti"><button class="secondario piccolo" onClick=${() => setAperto(null)}>Annulla</button>
        <button class="secondario piccolo" disabled=${!nota.trim()} onClick=${() => salva('non_risolta')}>Non risolta</button>
        <button class="secondario piccolo pieno" disabled=${!nota.trim()} onClick=${() => salva('parziale')}>Risolta in parte</button></div>
    </div>`}
  </div>`;
}

export function Azioni({ pratica, evidenze, registri, mostra, alVisitaNecessaria }) {
  const [vista, setVista] = useState('aperte');
  const tutte = elencoAzioni(pratica, registri);
  const proposte = tutte.filter(a => a.aggiornamento && a.aggiornamento.esitoCampo === 'proposta_chiusura');
  const aperte = tutte.filter(a => !proposte.includes(a));
  const visibili = vista === 'aperte' ? aperte : proposte;
  return html`
    <div class="avviso-bozza"><b>BOZZA NON VALIDATA</b><span>Le azioni vanno validate in studio prima dell'invio al cliente.</span></div>
    <div class="segmenti">
      <button class=${vista === 'aperte' ? 'attivo' : ''} onClick=${() => setVista('aperte')}>Aperte (${aperte.length})</button>
      <button class=${vista === 'proposte' ? 'attivo' : ''} onClick=${() => setVista('proposte')}>Proposte (${proposte.length})</button>
    </div>
    ${visibili.map(a => html`<${SchedaAzione} key=${a.id + (a.aggiornamento ? a.aggiornamento.modificatoIl : '')} pratica=${pratica} evidenze=${evidenze} registri=${registri} a=${a} mostra=${mostra} />`)}
    ${!visibili.length && html`<div class="vuoto">Nessuna azione in questa vista</div>`}
    <div class="piede sopra-barra"><button class="primario" onClick=${() => pratica.visita ? vai(rottaPratica(pratica.codicePratica, 'azione', 'nuova'))
      : alVisitaNecessaria(() => vai(rottaPratica(pratica.codicePratica, 'azione', 'nuova')))}><${Icona} nome="piu" dim=${20} />Nuova azione</button></div>`;
}

// Bozza di azione nata in campo: campi minimi, il resto si completa sul PC
export function FormAzione({ pratica, registri, idAzione, mostra }) {
  const esistente = idAzione && idAzione !== 'nuova' ? registri.azione.get(idAzione) : null;
  const beni = tuttiIBeni(pratica, registri);
  const [categoria, setCategoria] = useState(esistente ? esistente.categoria : 'documento');
  const [bene, setBene] = useState(esistente ? esistente.beni[0] : beni[0].codice);
  const beneObj = beni.find(b => b.codice === bene) || beni[0];
  const requisiti = [...requisitiDelBene(beneObj), 'ID', 'DOC'].filter((r, i, x) => x.indexOf(r) === i);
  const [requisito, setRequisito] = useState(esistente ? esistente.requisito : requisiti[0]);
  const [cosaServe, setCosaServe] = useState(esistente ? esistente.cosaServe : '');
  const [nota, setNota] = useState(esistente ? esistente.nota || '' : '');
  const valido = cosaServe.trim() && requisiti.includes(requisito);
  const salva = async () => {
    const id = esistente ? esistente.id : prossimoId(pratica.andata, registri, 'azione');
    await salvaRegistro(pratica.codicePratica, 'azione', id, {
      ...(esistente || {}), id, categoria, beni: [bene], requisito, cosaServe: cosaServe.trim(), nota: nota.trim() || undefined,
      stato: 'aperta', apertaIl: esistente ? esistente.apertaIl : oggi(),
    });
    dispatchEvent(new Event('perito40:ricarica'));
    mostra(`${id} salvata come bozza: priorità e destinatario si completano sul PC`);
    vai(rottaPratica(pratica.codicePratica, 'azioni'));
  };
  return html`
    <${Avviso} tipo="info">Bozza di azione: cosa serve e per quale requisito. Priorità, destinatario ed esempio di evidenza si completano in studio.</${Avviso}>
    <div class="sezione">Categoria</div>
    <div class="segmenti">${Object.entries(CATEGORIE).map(([k, [l]]) => html`<button class=${categoria === k ? 'attivo' : ''} onClick=${() => setCategoria(k)}>${l}</button>`)}</div>
    <div class="sezione">Bene</div>
    <div class="filtri">${beni.map(b => html`<button class=${bene === b.codice ? 'attivo' : ''} onClick=${() => { setBene(b.codice); setRequisito(requisitiDelBene(b)[0]); }}>${b.codice}</button>`)}</div>
    <div class="sezione">Requisito</div>
    <div class="filtri">${requisiti.map(r => html`<button class=${requisito === r ? 'attivo' : ''} onClick=${() => setRequisito(r)}>${r}</button>`)}</div>
    <div class="meta">${REQUISITI_UI[requisito] ? REQUISITI_UI[requisito].nome : ''}</div>
    <label class="etichetta-campo">Cosa serve<textarea class="campo-testo area" rows="3" value=${cosaServe} onInput=${e => setCosaServe(e.target.value)}
      placeholder="Concreto: es. screenshot della schermata MES dell'ordine con numero, data e macchina visibili" /></label>
    <label class="etichetta-campo">Nota (facoltativa)<input class="campo-testo" value=${nota} onInput=${e => setNota(e.target.value)} placeholder="Es. referente IT assente in visita" /></label>
    <button class="primario" disabled=${!valido} onClick=${salva}>Salva bozza</button>`;
}
