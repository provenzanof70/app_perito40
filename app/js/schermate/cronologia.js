// 1j · Cronologia e date: date agli atti (dall'andata) e date rilevate in campo, con origine, precisione e stato (§6.1, §10.5).
// Le date agli atti non si modificano: si verificano con una data rilevata (confermata / precisata / difforme)
// che porta la propria prova. Registro della visita ricavato da ciò che è stato raccolto, senza dati nuovi.

import { useState } from 'preact/hooks';
import { html, Icona, dataBreve, oraBreve } from '../ui.js';
import { Avviso } from '../componenti.js';
import { vai, rottaPratica } from '../rotte.js';
import { GRUPPI_UI } from '../stato.js';
import { salvaRegistro, prossimoId, statoData } from '../registri.js';
import { SceltaEvidenze, tuttiIBeni } from './requisiti.js';

export const EVENTI = {
  ordine: 'Ordine', acconto_20: 'Acconto 20%', fabbricazione_fat: 'Fabbricazione / FAT', immissione_mercato: 'Immissione sul mercato',
  dichiarazione_conformita: 'Dichiarazione CE', fattura: 'Fattura', ddt_consegna: 'Consegna (DDT)', installazione: 'Installazione',
  collaudo_sat: 'Collaudo', entrata_in_funzione: 'Entrata in funzione', interconnessione_dichiarata: 'Interconnessione dichiarata',
  prima_prova_scambio: 'Prima prova datata dello scambio', verifica_perito: 'Verifica del perito', comunicazione_preventiva: 'Comunicazione preventiva',
  comunicazione_conferma: 'Comunicazione di conferma', comunicazione_completamento: 'Comunicazione di completamento', perizia: 'Perizia', asseverazione: 'Asseverazione', altro: 'Altro',
};
const ORIGINI = { documento_fiscale: 'Documento fiscale', verbale: 'Verbale', log_sistema: 'Log di sistema', documento_terzo: 'Documento di terzi', dichiarazione_impresa: 'Dichiarazione dell\'impresa', riscontro_perito: 'Riscontro del perito' };
const TIPI_DATA = { documento: 'Data del documento', mostrata_a_video: 'Mostrata a schermo', scatto: 'Data dello scatto', acquisizione: 'Acquisizione', verifica_perito: 'Verifica del perito' };
const STATI = { documentata: 'documentata', dichiarata: 'dichiarata', da_verificare: 'da verificare' };
const ESITI_RIF = { confermata: 'Confermata', precisata: 'Precisata', difforme: 'Difforme' };

export function valoreData(d) {
  if (d.precisione === 'giorno') return dataBreve(d.valore);
  if (d.precisione === 'mese') { const [a, m] = d.valore.split('-'); return `${m}/${a}`; }
  const [x, y] = d.valore.split('/');
  return `${dataBreve(x)} – ${dataBreve(y)}`;
}
const inizio = d => d.valore.split('/')[0];

// ---------------------------------------------------------------------------
// Registro della visita (ricavato)
// ---------------------------------------------------------------------------

export function registroVisita(pratica, evidenze, registri) {
  const v = pratica.visita;
  if (!v) return [];
  const voci = [];
  const nomi = pratica.andata.sopralluogo.referenti.filter(r => v.presenti.includes(r.id)).map(r => r.nome).join(', ');
  voci.push({ t: v.inizio, a: 'Inizio visita', b: nomi ? `Presenti: ${nomi}` : 'Presenti non indicati' });
  const gruppiEv = new Map();
  for (const e of evidenze) {
    const k = `${e.beni[0]}|${e.gruppo}`;
    const g = gruppiEv.get(k) || { t: e.acquisitaIl, bene: e.beni[0], gruppo: e.gruppo, n: {}, annullate: 0 };
    g.t = g.t < e.acquisitaIl ? g.t : e.acquisitaIl;
    g.n[e.tipo] = (g.n[e.tipo] || 0) + 1;
    if (e.stato === 'annullata') g.annullate++;
    gruppiEv.set(k, g);
  }
  const tipi = { foto: ['foto', 'foto'], video: ['video', 'video'], vocale: ['nota vocale', 'note vocali'], documento: ['documento', 'documenti'], screenshot: ['schermata', 'schermate'] };
  for (const g of gruppiEv.values()) {
    const desc = Object.entries(g.n).map(([t, n]) => `${n} ${(tipi[t] || [t, t])[n > 1 ? 1 : 0]}`).join(', ');
    voci.push({ t: g.t, a: `${g.bene} · ${GRUPPI_UI[g.gruppo].nome.replace('­', '')}`, b: `${desc}${g.annullate ? ` (${g.annullate} annullate)` : ''}` });
  }
  for (const r of registri.riscontro.values()) voci.push({ t: `${r.dataVisita}T${r.ora}`, a: `${r.bene} · ${r.requisito} riscontro diretto`, b: r.circostanza });
  for (const d of registri.dichiarazione.values()) voci.push({ t: d.modificatoIl, a: `${d.beni[0]} · ${d.requisito} dichiarazione di terzi`, b: `${d.persona}, ${d.ruolo.toLowerCase()}` });
  for (const b of registri.beneNuovo.values()) voci.push({ t: b.modificatoIl, a: `${b.codice} · bene nuovo censito`, b: b.denominazione });
  for (const d of registri.data.values()) voci.push({ t: d.modificatoIl, a: `Data rilevata · ${EVENTI[d.evento]}`, b: `${d.beni.join(', ')} · ${valoreData(d.data)}` });
  const ver = [...registri.verifica.values()];
  if (ver.length) voci.push({ t: ver.map(x => x.modificatoIl).sort()[0], a: 'Verifica dei dati agli atti', b: `${ver.length} dati verificati` });
  return voci.filter(x => x.t).sort((a, b) => new Date(a.t) - new Date(b.t));
}

// ---------------------------------------------------------------------------
// 1j · Cronologia
// ---------------------------------------------------------------------------

export function Cronologia({ pratica, evidenze, registri, codiceBene, alVisitaNecessaria }) {
  const beni = tuttiIBeni(pratica, registri);
  const bene = beni.find(b => b.codice === codiceBene) || beni[0];
  const cod = pratica.codicePratica;
  const delBene = r => r.beni.some(b => b.split('.')[0] === bene.codice);
  const rilevate = [...registri.data.values()].filter(delBene);
  const atti = (pratica.andata.timeline || []).filter(delBene).map(r => ({ ...r, verifica: rilevate.find(d => d.rifTimeline === r.id) }));
  const nuove = rilevate.filter(d => !d.rifTimeline);
  const righe = [...atti.map(r => ({ r, tipo: 'atti' })), ...nuove.map(r => ({ r, tipo: 'campo' }))].sort((a, b) => inizio(a.r.data).localeCompare(inizio(b.r.data)));
  const senzaDoc = atti.filter(r => r.stato !== 'documentata' && !(r.verifica && r.verifica.stato === 'documentata')).length;
  const registro = registroVisita(pratica, evidenze, registri);
  const conVisita = fn => () => pratica.visita ? fn() : alVisitaNecessaria(fn);
  return html`
    <div class="filtri">${beni.map(b => html`<button class=${b.codice === bene.codice ? 'attivo' : ''} onClick=${() => vai(rottaPratica(cod, 'cronologia', b.codice))}>${b.codice}</button>`)}</div>
    <div class="scheda-dati">
      <div class="dati-testa"><b>Date chiave</b><span class="meta">${senzaDoc ? `${senzaDoc} senza documento` : 'tutte documentate'}</span></div>
      <div class="linea-tempo">
        ${righe.map(({ r, tipo }) => {
          const v = r.verifica;
          const doc = (v || r).stato === 'documentata';
          const fonte = r.prove.length ? r.prove.map(p => p.idEvidenza).join(', ') : doc ? '' : `non documentata · ${ORIGINI[r.origine].toLowerCase()}`;
          return html`<button class="tappa" onClick=${conVisita(() => vai(tipo === 'atti' ? rottaPratica(cod, 'data', 'verifica', r.id) : rottaPratica(cod, 'data', r.id)))}>
            <span class=${`punto ${tipo === 'campo' ? 'campo' : doc ? 'ok' : 'manca'}`}></span>
            <div class="tappa-testo">
              <div class="tappa-titolo">${EVENTI[r.evento]}${r.descrizione ? html`<span class="meta"> · ${r.descrizione}</span>` : ''}</div>
              <div class=${`tappa-fonte ${doc || tipo === 'campo' ? '' : 'manca'}`}>${fonte}</div>
              <div class="tappa-meta"><span class="pastiglia mini p-neutra">${ORIGINI[r.origine]}</span><span>precisione: ${r.data.precisione}</span>
                ${tipo === 'campo' ? html`<span class="pastiglia mini p-accento">rilevata in campo</span>` : null}</div>
              ${v && html`<div class=${`tappa-verifica ${v.esitoRif}`}>${ESITI_RIF[v.esitoRif]} in campo: ${valoreData(v.data)} · ${STATI[v.stato]}${v.prove.length ? ` · ${v.prove.map(p => p.idEvidenza).join(', ')}` : ''}</div>`}
            </div>
            <span class=${`tappa-valore ${doc || tipo === 'campo' ? '' : 'manca'}`}>${valoreData(r.data)}</span>
          </button>`;
        })}
        ${!righe.length && html`<div class="vuoto">Nessuna data per ${bene.codice}</div>`}
      </div>
    </div>
    <button class="primario" onClick=${conVisita(() => vai(rottaPratica(cod, 'data', 'nuova', bene.codice)))}><${Icona} nome="piu" dim=${20} />Aggiungi data rilevata</button>
    <div class="scheda-dati">
      <div class="dati-testa"><b>Registro della visita</b><span class="meta">${pratica.visita ? dataBreve(pratica.visita.inizio) : 'visita non iniziata'}</span></div>
      ${registro.map(x => html`<div class="riga-registro"><span class="ora">${oraBreve(x.t)}</span><div><div>${x.a}</div><div class="meta">${x.b}</div></div></div>`)}
    </div>`;
}

// ---------------------------------------------------------------------------
// Data rilevata: verifica di una data agli atti oppure data nuova
// ---------------------------------------------------------------------------

function CampoData({ precisione, valore, setValore, disattivo }) {
  if (precisione === 'giorno') return html`<input class="campo-testo" type="date" value=${valore} disabled=${disattivo} onInput=${e => setValore(e.target.value)} />`;
  if (precisione === 'mese') return html`<input class="campo-testo" type="month" value=${valore} disabled=${disattivo} onInput=${e => setValore(e.target.value)} />`;
  const [a, b] = (valore || '/').split('/');
  return html`<div class="due-date">
    <input class="campo-testo" type="date" value=${a} disabled=${disattivo} onInput=${e => setValore(`${e.target.value}/${b || ''}`)} />
    <input class="campo-testo" type="date" value=${b} disabled=${disattivo} onInput=${e => setValore(`${a || ''}/${e.target.value}`)} /></div>`;
}

function dataValida(precisione, v) {
  if (precisione === 'giorno') return /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (precisione === 'mese') return /^\d{4}-\d{2}$/.test(v);
  const m = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(v || '');
  return !!m && m[1] <= m[2];
}

export function FormData({ pratica, evidenze, registri, modo, codice, codiceBene, mostra }) {
  // modo: 'verifica' (codice = riga agli atti), 'nuova' (codiceBene), oppure codice di una data rilevata da modificare
  const esistente = modo !== 'verifica' && modo !== 'nuova' ? registri.data.get(modo) : null;
  const atti = (pratica.andata.timeline || []).find(r => r.id === (modo === 'verifica' ? codice : esistente && esistente.rifTimeline));
  const beni = tuttiIBeni(pratica, registri);
  const base = esistente || (atti ? { evento: atti.evento, beni: atti.beni, data: atti.data, origine: 'documento_fiscale', tipoData: 'documento', prove: [], coerenza: 'S' }
    : { evento: 'installazione', beni: [codiceBene || beni[0].codice], data: { valore: '', precisione: 'giorno' }, origine: 'verbale', tipoData: 'documento', prove: [], coerenza: 'S' });
  const [esitoRif, setEsitoRif] = useState(esistente ? esistente.esitoRif || 'confermata' : 'confermata');
  const [evento, setEvento] = useState(base.evento);
  const [beniScelti, setBeni] = useState(base.beni);
  const [precisione, setPrecisione] = useState(base.data.precisione);
  const [valore, setValore] = useState(base.data.valore);
  const [origine, setOrigine] = useState(base.origine);
  const [tipoData, setTipoData] = useState(base.tipoData);
  const [prove, setProve] = useState(base.prove.map(p => p.idEvidenza));
  const [letto, setLetto] = useState(base.prove[0] && base.prove[0].fattoLetto || '');
  const [coerenza, setCoerenza] = useState(base.coerenza);
  const [nota, setNota] = useState(base.nota || '');
  const [descrizione, setDescrizione] = useState(base.descrizione || '');
  const verifica = !!atti;
  const confermata = verifica && esitoRif === 'confermata';
  const v = confermata ? atti.data.valore : valore, p = confermata ? atti.data.precisione : precisione;
  const stato = statoData(prove, origine);
  const valido = dataValida(p, v) && beniScelti.length && (coerenza === 'S' || nota.trim());
  const cod = pratica.codicePratica;

  const salva = async () => {
    const id = esistente ? esistente.id : prossimoId(pratica.andata, registri, 'data');
    const ref = prove.map((idEvidenza, i) => {
      const e = evidenze.find(x => x.id === idEvidenza);
      return { idEvidenza, ...(e ? { file: e.nomeFile } : {}), ...(i === 0 && letto.trim() ? { fattoLetto: letto.trim() } : {}) };
    });
    await salvaRegistro(cod, 'data', id, {
      id, evento, descrizione: descrizione.trim() || undefined, beni: beniScelti, data: { valore: v, precisione: p }, tipoData, origine, stato, prove: ref,
      coerenza, nota: nota.trim() || undefined, rifTimeline: verifica ? atti.id : undefined, esitoRif: verifica ? esitoRif : undefined,
    });
    dispatchEvent(new Event('perito40:ricarica'));
    mostra(`${id} salvata · ${STATI[stato]}`);
    vai(rottaPratica(cod, 'cronologia', beniScelti[0].split('.')[0]));
  };

  return html`
    ${verifica
      ? html`<div class="scheda"><div class="meta">Agli atti (${atti.id})</div><b>${EVENTI[atti.evento]} · ${valoreData(atti.data)}</b>
          <div class="meta">${ORIGINI[atti.origine]} · precisione: ${atti.data.precisione} · ${STATI[atti.stato]}${atti.prove.length ? ` · ${atti.prove.map(x => x.idEvidenza).join(', ')}` : ''}</div></div>
        <div class="sezione">Esito in campo</div>
        <div class="segmenti">${Object.entries(ESITI_RIF).map(([k, l]) => html`<button class=${esitoRif === k ? 'attivo' : ''} onClick=${() => setEsitoRif(k)}>${l}</button>`)}</div>
        <div class="meta">${esitoRif === 'confermata' ? 'Stessa data, ora con la prova vista in campo.' : esitoRif === 'precisata' ? 'Stessa data con precisione maggiore (es. dal mese al giorno) o prova migliore.' : 'Data diversa da quella agli atti: il PC lo segnala come alert.'}</div>`
      : html`<div class="sezione">Evento</div>
        <select class="campo-testo" value=${evento} onChange=${e => setEvento(e.target.value)}>${Object.entries(EVENTI).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
        <div class="sezione">Beni</div>
        <div class="filtri">${beni.map(b => html`<button class=${beniScelti.includes(b.codice) ? 'attivo' : ''}
          onClick=${() => setBeni(x => x.includes(b.codice) ? x.filter(y => y !== b.codice) : [...x, b.codice])}>${b.codice}</button>`)}</div>
        <input class="campo-testo" value=${descrizione} onInput=${e => setDescrizione(e.target.value)} placeholder="Descrizione (facoltativa), es. verbale di installazione" />`}
    <div class="sezione">Data rilevata</div>
    <div class="segmenti">${['giorno', 'mese', 'periodo'].map(k => html`<button class=${p === k ? 'attivo' : ''} disabled=${confermata}
      onClick=${() => { setPrecisione(k); setValore(''); }}>${k[0].toUpperCase() + k.slice(1)}</button>`)}</div>
    <${CampoData} precisione=${p} valore=${v} setValore=${setValore} disattivo=${confermata} />
    <div class="sezione">Da dove viene</div>
    <select class="campo-testo" value=${origine} onChange=${e => setOrigine(e.target.value)}>${Object.entries(ORIGINI).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
    <select class="campo-testo" value=${tipoData} onChange=${e => setTipoData(e.target.value)}>${Object.entries(TIPI_DATA).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
    <div class="sezione">Prova</div>
    <${SceltaEvidenze} pratica=${pratica} evidenze=${evidenze} registri=${registri} bene=${beniScelti[0] ? beniScelti[0].split('.')[0] : beni[0].codice} requisito="DOC" gruppo="DOC"
      scelte=${prove} setScelte=${setProve} idCampo="campo-data" mostra=${mostra} />
    ${prove.length > 0 && html`<input class="campo-testo" value=${letto} onInput=${e => setLetto(e.target.value)} placeholder="Cosa si legge (es. data 14/04/2025 in alto a destra)" />`}
    <${Avviso} tipo=${stato === 'documentata' ? 'ok' : 'att'}>Stato: <b>${STATI[stato]}</b>${stato === 'documentata' ? '' : stato === 'dichiarata' ? ' — una dichiarazione dell\'impresa non documenta la data.' : ' — collega una prova per documentarla.'}</${Avviso}>
    <div class="sezione">Coerenza con il resto della cronologia</div>
    <div class="segmenti">${[['S', 'Coerente'], ['N', 'Non coerente']].map(([k, l]) => html`<button class=${coerenza === k ? 'attivo' : ''} onClick=${() => setCoerenza(k)}>${l}</button>`)}</div>
    <textarea class="campo-testo area" rows="2" value=${nota} onInput=${e => setNota(e.target.value)} placeholder=${coerenza === 'N' ? 'Nota obbligatoria: in cosa non è coerente' : 'Nota (facoltativa)'} />
    <button class="primario" disabled=${!valido} onClick=${salva}>Salva data</button>`;
}
