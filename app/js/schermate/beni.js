// 1b · Elenco dei beni e censimento dei beni nuovi · 1c / 1l · Scheda del bene con verifica riga per riga

import { useState } from 'preact/hooks';
import { html, Icona, dataBreve } from '../ui.js';
import { Foglio, Avviso } from '../componenti.js';
import { vai, rottaPratica } from '../rotte.js';
import { GRUPPI_UI, ATTESA_UI, gruppiDelBene, statoBene } from '../stato.js';
import { salvaVerifica, salvaRegistro, prossimoCodiceBene } from '../registri.js';
import { useUrlFile } from '../media.js';

const SEZIONI = [
  ['identita', 'Identificazione'], ['controllore', 'Controllo e interfaccia'], ['hmi', 'Controllo e interfaccia'],
  ['reteDichiarata', 'Rete dichiarata'], ['dichiarazioneCE', 'Documenti e GATE C'], ['esitoGateC', 'Documenti e GATE C'],
];
const sezioneDi = campo => (SEZIONI.find(([p]) => campo.startsWith(p)) || [, 'Altri dati'])[1];

const ESITI = [
  ['confermato', 'Confermato'], ['corretto', 'Corretto (nuovo valore)'], ['difforme', 'Difforme'], ['non_verificabile', 'Non verificabile'],
];
const ETICHETTA_ESITO = { confermato: 'Confermato', corretto: 'Corretto', difforme: 'Difforme', non_verificabile: 'Non verificabile' };
const STATO_ATTI = { documentato: ['documentato', 'p-ok'], dichiarato: ['dichiarato', 'p-att'], da_verificare: ['da verificare', 'p-neutra'] };
const STATO_BENE = { da_iniziare: ['Da iniziare', 'p-neutra'], in_corso: ['Raccolta in corso', 'p-accento'], completo: ['Tutti i gruppi con materiale', 'p-ok'] };
const GATE = { verde: '#34A853', giallo: '#E08600', rosso: '#E5383B' };

const profiloBene = b => !b.classificazione ? 'Bene nuovo · da classificare sul PC'
  : b.classificazione.profilo === 'completo' ? 'Profilo completo 5+2'
  : `Profilo ridotto · All. ${b.classificazione.allegato}${b.classificazione.gruppo ? ` Gr. ${b.classificazione.gruppo}` : ''}`;

function metaBene(b) {
  if (!b.datiDaVerificare) return b.matricolaTarga && b.matricolaTarga.valore ? `Matr. ${b.matricolaTarga.valore} (letta in campo)` : `Matricola ${b.matricolaTarga ? b.matricolaTarga.stato : 'mancante'}`;
  const v = c => (b.datiDaVerificare.find(d => d.campo === c) || {}).valoreAgliAtti;
  return [v('identita.modello'), v('identita.matricola') && `Matr. ${v('identita.matricola')}`].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// 1b · Elenco dei beni
// ---------------------------------------------------------------------------

export function ElencoBeni({ pratica, evidenze, registri, alVisitaNecessaria }) {
  const [filtro, setFiltro] = useState('tutti');
  const [nuovo, setNuovo] = useState(false);
  const nuovi = [...registri.beneNuovo.values()];
  const beni = [...pratica.andata.beni, ...nuovi].map(b => ({ b, s: statoBene(b, evidenze, registri.verifica) }));
  const visibili = beni.filter(({ s }) => filtro === 'tutti' || s.stato === filtro);
  const FILTRI = [['tutti', `Tutti ${beni.length}`], ['in_corso', 'In corso'], ['da_iniziare', 'Da iniziare'], ['completo', 'Gruppi completi']];

  return html`
    <div class="filtri">${FILTRI.map(([k, l]) => html`<button class=${filtro === k ? 'attivo' : ''} onClick=${() => setFiltro(k)}>${l}</button>`)}</div>
    ${visibili.map(({ b, s }) => {
      const pallini = s.attesi.map(g => s.coperti.includes(g) ? 'presente' : s.iniziato ? 'mancante' : 'da-rilevare');
      const [st, cl] = STATO_BENE[s.stato];
      return html`<button class="scheda bene" key=${b.codice} onClick=${() => vai(rottaPratica(pratica.codicePratica, 'beni', b.codice))}>
        <div class="bene-alto">
          <div class="bene-codice">${b.codice}</div>
          <div class="bene-testo"><div class="bene-nome">${b.denominazione}</div><div class="meta">${metaBene(b)}</div>
            <span class="profilo">${profiloBene(b)}</span></div>
          <${Icona} nome="freccia_destra" dim=${20} colore="var(--testo2)" />
        </div>
        <div class="bene-basso">
          ${pallini.map(p => html`<span class=${`pallino ${p}`}></span>`)}
          <span class="meta">${s.coperti.length}/${s.attesi.length} gruppi</span><span style=${{ flex: 1 }}></span>
          <span class=${`pastiglia ${cl}`}>${st}</span>
        </div>
      </button>`;
    })}
    ${!visibili.length && html`<div class="vuoto">Nessun bene in questa vista</div>`}
    <div class="legenda"><span><span class="pallino presente"></span>presente</span><span><span class="pallino mancante"></span>mancante</span><span><span class="pallino da-rilevare"></span>da rilevare</span></div>
    <div class="piede sopra-barra"><button class="primario" onClick=${() => pratica.visita ? setNuovo(true) : alVisitaNecessaria(() => setNuovo(true))}><${Icona} nome="piu" dim=${20} />Nuovo bene</button></div>
    ${nuovo && html`<${FoglioBeneNuovo} pratica=${pratica} nuovi=${nuovi} alChiudi=${() => setNuovo(false)} />`}`;
}

function FoglioBeneNuovo({ pratica, nuovi, bene, alChiudi }) {
  const codice = bene ? bene.codice : prossimoCodiceBene(pratica.andata, nuovi);
  const [d, setD] = useState(bene || { denominazione: '', funzione: '', ubicazione: '', matricolaTarga: { stato: 'letta', valore: '' }, componenti: [], nota: '' });
  const imposta = (k, v) => setD(x => ({ ...x, [k]: v }));
  const mt = d.matricolaTarga;
  const valido = d.denominazione.trim() && d.funzione.trim() && (mt.stato !== 'letta' || (mt.valore || '').trim());
  const salva = async () => {
    const matricolaTarga = mt.stato === 'letta' ? { stato: 'letta', valore: mt.valore.trim() } : { stato: mt.stato };
    await salvaRegistro(pratica.codicePratica, 'beneNuovo', codice, {
      codice, denominazione: d.denominazione.trim(), funzione: d.funzione.trim(), ubicazione: d.ubicazione.trim() || undefined,
      matricolaTarga, componenti: d.componenti, nota: d.nota.trim() || undefined,
    });
    dispatchEvent(new Event('perito40:ricarica'));
    alChiudi();
  };
  return html`<${Foglio} titolo=${bene ? `Bene ${codice}` : `Nuovo bene ${codice}`} annulla="Annulla" conferma="Salva" confermaAttiva=${!!valido} alChiudi=${alChiudi} alConferma=${salva}>
    <div class="meta">Bene trovato in campo e assente dal pacchetto di andata. Perimetro e classificazione si decidono sul PC.</div>
    <label class="etichetta-campo">Denominazione<input class="campo-testo" value=${d.denominazione} onInput=${e => imposta('denominazione', e.target.value)} placeholder="Nome riconoscibile in reparto" /></label>
    <label class="etichetta-campo">Funzione osservata<input class="campo-testo" value=${d.funzione} onInput=${e => imposta('funzione', e.target.value)} placeholder="Che cosa fa il bene" /></label>
    <label class="etichetta-campo">Ubicazione<input class="campo-testo" value=${d.ubicazione || ''} onInput=${e => imposta('ubicazione', e.target.value)} placeholder="Reparto, campata…" /></label>
    <div class="etichetta-campo">Matricola sulla targa</div>
    <div class="segmenti">${[['letta', 'Letta'], ['illeggibile', 'Illeggibile'], ['mancante', 'Mancante']].map(([k, l]) =>
      html`<button class=${mt.stato === k ? 'attivo' : ''} onClick=${() => imposta('matricolaTarga', { ...mt, stato: k })}>${l}</button>`)}</div>
    ${mt.stato === 'letta' && html`<input class="campo-testo" value=${mt.valore || ''} onInput=${e => imposta('matricolaTarga', { ...mt, valore: e.target.value })} placeholder="Matricola come letta sulla targa" />`}
    ${mt.stato !== 'letta' && html`<div class="meta">Il riscontro della matricola resterà da programmare.</div>`}
    <label class="etichetta-campo">Nota<textarea class="campo-testo area" rows="2" value=${d.nota || ''} onInput=${e => imposta('nota', e.target.value)} placeholder="Facoltativa" /></label>
  </${Foglio}>`;
}

// ---------------------------------------------------------------------------
// 1c · Scheda del bene
// ---------------------------------------------------------------------------

function RigaDato({ dato, verifica, aperta, alTocco }) {
  const e = verifica && verifica.esito;
  const [statoAtti, clAtti] = STATO_ATTI[dato.statoAgliAtti];
  const senzaEvidenza = e && e !== 'non_verificabile' && !(verifica.evidenze || []).length;
  return html`<button class=${`riga-dato ${aperta ? 'aperta' : ''}`} onClick=${alTocco}>
    <div class="riga-su">
      <span class="riga-etichetta">${dato.etichetta}</span>
      ${verifica && verifica.evidenze && verifica.evidenze.length ? html`<span class="riga-ev"><${Icona} nome="immagine" dim=${15} />${verifica.evidenze.length}</span>` : null}
      <span class=${`esito ${e || 'da-verificare'}`}>${e ? ETICHETTA_ESITO[e] : 'Verifica ›'}</span>
    </div>
    <div class="riga-giu">
      ${dato.campo === 'esitoGateC' && dato.valoreAgliAtti ? html`<span class="gate" style=${{ background: GATE[dato.valoreAgliAtti] }}></span>` : null}
      <span class=${`riga-valore ${e === 'corretto' ? 'barrato' : ''}`}>${dato.valoreAgliAtti == null ? '—' : dato.campo === 'esitoGateC' ? dato.valoreAgliAtti[0].toUpperCase() + dato.valoreAgliAtti.slice(1) : dato.valoreAgliAtti}</span>
      ${e === 'corretto' && html`<span class="riga-nuovo">→ ${verifica.valoreRilevato}</span>`}
      ${e === 'difforme' && html`<span class="riga-difforme">rilevato: ${verifica.valoreRilevato}</span>`}
      <span class=${`pastiglia mini ${clAtti}`}>${statoAtti}</span>
    </div>
    ${dato.fonte && html`<div class="riga-fonte">${dato.fonte}</div>`}
    ${e === 'non_verificabile' && verifica.nota ? html`<div class="riga-fonte">${verifica.nota}</div>` : null}
    ${senzaEvidenza && html`<div class="riga-avviso"><${Icona} nome="attenzione" dim=${14} />manca l'evidenza collegata</div>`}
  </button>`;
}

function EditorVerifica({ pratica, bene, dato, verifica, evidenze, alFatto }) {
  const [esito, setEsito] = useState(verifica ? verifica.esito : null);
  const [valore, setValore] = useState(verifica && verifica.valoreRilevato || '');
  const [nota, setNota] = useState(verifica && verifica.nota || '');
  const [collegate, setCollegate] = useState(verifica ? verifica.evidenze || [] : []);
  const [scelta, setScelta] = useState(false);
  const serveValore = esito === 'corretto' || esito === 'difforme';
  const serveNota = esito === 'non_verificabile';
  const valido = esito && (!serveValore || valore.trim()) && (!serveNota || nota.trim());
  const disponibili = evidenze.filter(e => e.stato === 'valida');

  const salva = async () => {
    await salvaVerifica(pratica, bene.codice, dato, {
      esito, valoreRilevato: serveValore ? valore.trim() : undefined,
      evidenze: esito === 'non_verificabile' ? [] : collegate, nota: nota.trim() || undefined,
    });
    dispatchEvent(new Event('perito40:ricarica'));
    alFatto();
  };
  return html`<div class="editor-verifica">
    <div class="griglia-esiti">${ESITI.map(([k, l]) => html`<button class=${`opzione ${esito === k ? `scelta ${k}` : ''}`} onClick=${() => setEsito(k)}>${l}</button>`)}</div>
    ${serveValore && html`<input class="campo-testo" value=${valore} onInput=${e => setValore(e.target.value)}
      placeholder=${esito === 'difforme' ? 'Valore rilevato in campo' : 'Nuovo valore'} />`}
    <textarea class="campo-testo area" rows="2" value=${nota} onInput=${e => setNota(e.target.value)}
      placeholder=${serveNota ? 'Perché non è verificabile (obbligatoria)' : 'Nota (facoltativa): ciò che si vede, non giudizi'} />
    ${esito !== 'non_verificabile' && html`<div class="riga-collega">
      <span class="meta" style=${{ flex: 1 }}>Evidenza collegata${collegate.length ? `: ${collegate.join(', ')}` : ''}</span>
      <button class="tasto-collega" onClick=${() => setScelta(!scelta)}><${Icona} nome="collega" dim=${16} />Collega</button>
    </div>`}
    ${scelta && (disponibili.length
      ? html`<div class="elenco">${disponibili.map(e => html`<button class="scelta" onClick=${() => setCollegate(c => c.includes(e.id) ? c.filter(x => x !== e.id) : [...c, e.id])}>
          <span class=${`spunta ${collegate.includes(e.id) ? 'si' : ''}`}>${collegate.includes(e.id) ? '✓' : ''}</span>
          <span class="etichetta">${e.id}<span class="sotto">${e.descrizione}</span></span></button>`)}</div>`
      : html`<div class="meta">Nessuna evidenza di questo bene ancora: si scattano dal Rilievo (fase F2.3). L'esito si può salvare ora e collegare l'evidenza dopo.</div>`)}
    <button class="primario piccolo" disabled=${!valido} onClick=${salva}>Fatto</button>
  </div>`;
}

export function SchedaBene({ pratica, bene, evidenze, registri, mostra, alVisitaNecessaria }) {
  const [aperta, setAperta] = useState(null);
  const [modifica, setModifica] = useState(false);
  const s = statoBene(bene, evidenze, registri.verifica);
  const dati = bene.datiDaVerificare || [];
  const ver = c => registri.verifica.get(`${bene.codice}|${c}`);
  const verificati = dati.filter(d => ver(d.campo)).length;
  const gruppi = gruppiDelBene(bene);
  const conteggio = g => s.evidenze.filter(e => e.gruppo === g).length;
  const date = (pratica.andata.timeline || []).filter(r => r.beni.some(b => b.split('.')[0] === bene.codice));
  const evBene = evidenze.filter(e => e.beni.some(b => b.split('.')[0] === bene.codice));

  const tessera = g => {
    const n = conteggio(g.gruppo), ui = GRUPPI_UI[g.gruppo];
    const st = g.attesa !== 'si' ? 'na' : n ? 'ok' : 'manca';
    return html`<button class=${`tessera ${st}`} onClick=${() => vai(rottaPratica(pratica.codicePratica, 'beni', bene.codice, 'gruppo', g.gruppo))}>
      <div class="tessera-su"><${Icona} nome=${ui.icona} dim=${23} />${st === 'manca' ? html`<span class="esclamativo">!</span>` : html`<b>${n || (st === 'na' ? '—' : 0)}</b>`}</div>
      <div class="tessera-nome">${ui.nome}</div>
      <div class="tessera-stato">${ui.requisito} · ${st === 'ok' ? 'presente' : st === 'manca' ? 'mancante' : ATTESA_UI[g.attesa]}</div>
    </button>`;
  };

  let sezione = null;
  return html`
    ${bene.classificazione
      ? html`<div class="meta voce-bene">${profiloBene(bene)} · ${bene.classificazione.voce}</div>`
      : html`<${Avviso} tipo="info" titolo="Bene nuovo, censito in campo" tasti=${[['Modifica censimento', () => setModifica(true)]]}>
          ${bene.funzione}${bene.ubicazione ? ` · ${bene.ubicazione}` : ''}. ${metaBene(bene)}.${bene.nota ? ` ${bene.nota}` : ''}</${Avviso}>`}
    ${bene.componenti && bene.componenti.length ? html`<div class="meta">Componenti: ${bene.componenti.map(c => `${c.codice} ${c.denominazione}`).join(' · ')}</div>` : null}

    ${dati.length ? html`<div class="scheda-dati">
      <div class="dati-testa"><b>Dati del bene</b><span class="meta">agli atti · ${verificati} di ${dati.length} verificati</span></div>
      ${dati.map(d => {
        const sec = sezioneDi(d.campo);
        const titolo = sec !== sezione ? (sezione = sec, html`<div class="dati-sezione">${sec}</div>`) : null;
        const apri = () => pratica.visita ? setAperta(aperta === d.campo ? null : d.campo) : alVisitaNecessaria(() => setAperta(d.campo));
        return html`${titolo}<${RigaDato} dato=${d} verifica=${ver(d.campo)} aperta=${aperta === d.campo} alTocco=${apri} />
          ${aperta === d.campo && html`<${EditorVerifica} key=${d.campo} pratica=${pratica} bene=${bene} dato=${d} verifica=${ver(d.campo)}
            evidenze=${evBene} alFatto=${() => setAperta(null)} />`}`;
      })}
    </div>` : null}

    ${date.length ? html`<div class="scheda-dati">
      <div class="dati-testa"><b>Date agli atti</b><span class="meta">tocca per verificare in campo</span></div>
      ${date.map(r => html`<div class="riga-dato fissa" role="button" onClick=${() => pratica.visita ? vai(rottaPratica(pratica.codicePratica, 'data', 'verifica', r.id)) : alVisitaNecessaria(() => vai(rottaPratica(pratica.codicePratica, 'data', 'verifica', r.id)))}>
        <div class="riga-su"><span class="riga-etichetta">${r.descrizione || r.evento.replace(/_/g, ' ')}</span>
          <span class=${`pastiglia mini ${r.stato === 'documentata' ? 'p-ok' : 'p-att'}`}>${r.stato === 'da_verificare' ? 'da verificare' : r.stato}</span></div>
        <div class="riga-giu"><span class="riga-valore">${r.data.precisione === 'giorno' ? dataBreve(r.data.valore) : r.data.valore.replace('/', ' – ')}</span>
          <span class="meta">${r.origine.replace(/_/g, ' ')} · precisione: ${r.data.precisione}</span>
          ${r.stato !== 'documentata' ? html`<span class="riga-avviso"><${Icona} nome="attenzione" dim=${14} />non documentata</span>` : null}</div>
      </div>`)}
    </div>` : null}

    <div class="titolo-sezione"><b>Evidenze per gruppo</b><span class="meta">${profiloBene(bene)}</span></div>
    <div class="tessere">${gruppi.filter(g => g.attesa === 'si').map(tessera)}</div>
    ${gruppi.some(g => g.attesa !== 'si') && html`
      <div class="titolo-sezione piccolo"><b>Altre evidenze</b><span class="meta">non richieste dal profilo</span></div>
      <div class="tessere">${gruppi.filter(g => g.attesa !== 'si').map(tessera)}</div>`}
    <button class="primario" onClick=${() => vai(rottaPratica(pratica.codicePratica, 'rilievo', bene.codice, (gruppi.find(g => g.attesa === 'si' && !conteggio(g.gruppo)) || {}).gruppo))}><${Icona} nome="fotocamera" dim=${20} />Apri fotocamera</button>
    ${modifica && html`<${FoglioBeneNuovo} pratica=${pratica} nuovi=${[...registri.beneNuovo.values()]} bene=${bene} alChiudi=${() => setModifica(false)} />`}`;
}

// ---------------------------------------------------------------------------
// Evidenze di un gruppo del bene (componenti ed evidenze comuni comprese)
// ---------------------------------------------------------------------------

function Miniatura({ evidenza: e, alTocco }) {
  const url = useUrlFile(e.tipo === 'foto' || (e.tipo === 'screenshot' && e.mime.startsWith('image/')) ? e : null);
  return html`<button class=${`miniatura ${e.stato === 'annullata' ? 'annullata' : ''}`} onClick=${alTocco}>
    <div class="miniatura-img" style=${url ? { backgroundImage: `url(${url})` } : null}>
      ${!url && html`<${Icona} nome=${e.tipo === 'vocale' ? 'chat_text' : e.tipo === 'video' ? 'camera' : 'file_text'} dim=${28} />`}
      ${e.annotazioni && e.annotazioni.length ? html`<span class="badge-ann">${e.annotazioni.length}</span>` : null}
    </div>
    <div class="miniatura-testo"><b>${e.id}</b><span>${e.stato === 'annullata' ? 'annullata' : e.descrizione || 'da descrivere'}</span></div>
  </button>`;
}

export function GalleriaGruppo({ pratica, bene, gruppo, evidenze }) {
  const g = gruppiDelBene(bene).find(x => x.gruppo === gruppo) || { gruppo, attesa: 'non_applicabile' };
  const ui = GRUPPI_UI[gruppo];
  const lista = evidenze.filter(e => e.gruppo === gruppo && e.beni.some(b => b.split('.')[0] === bene.codice));
  const cosa = bene.gruppiEvidenze && (bene.gruppiEvidenze.find(x => x.gruppo === gruppo) || {}).cosaCercare;
  return html`
    <div class="meta voce-bene">${ui.requisito} · ${ATTESA_UI[g.attesa]}${cosa ? ` · ${cosa}` : ''}</div>
    ${lista.length ? html`<div class="galleria">${lista.map(e => html`<${Miniatura} key=${e.id} evidenza=${e}
        alTocco=${() => vai(rottaPratica(pratica.codicePratica, 'evidenza', e.id))} />`)}</div>`
      : html`<div class="vuoto">Nessuna evidenza in questo gruppo.</div>`}
    <button class="primario" onClick=${() => vai(rottaPratica(pratica.codicePratica, 'rilievo', bene.codice, gruppo))}>
      <${Icona} nome="fotocamera" dim=${20} />Acquisisci per ${ui.nome.replace('\u00AD', '')}</button>`;
}
