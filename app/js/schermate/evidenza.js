// 1e · Annotazione e dettaglio di un'evidenza. Le annotazioni sono segni sovrapposti in coordinate 0–1:
// il file originale non viene mai modificato. Testi e note descrivono ciò che si vede, non giudizi (§2.7).

import { useState, useRef } from 'preact/hooks';
import { html, Icona, dataBreve, oraBreve } from '../ui.js';
import { Foglio, Avviso } from '../componenti.js';
import { vai, rottaPratica } from '../rotte.js';
import { GRUPPI_UI } from '../stato.js';
import { aggiornaEvidenza, annullaEvidenza, beneDi } from '../evidenze.js';
import { useUrlFile } from '../media.js';

const STRUMENTI = [['freccia', 'arrow_up_right', 'Freccia'], ['cerchio', 'circle', 'Cerchio'], ['testo', 'text_t', 'Testo'], ['annulla', 'arrow_counter_clockwise', 'Annulla']];
const COLORI = ['#FF453A', '#FFD60A', '#FFFFFF'];
const r4 = n => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
const nomeGruppo = g => GRUPPI_UI[g].nome.replace('­', '');

function Segno({ a, L, H }) {
  const c = a.colore || '#FF453A', w = Math.max(3, L / 180);
  if (a.tipo === 'freccia') {
    const x1 = a.x * L, y1 = a.y * H, x2 = a.x2 * L, y2 = a.y2 * H, ang = Math.atan2(y2 - y1, x2 - x1), p = w * 5;
    const punta = [[x2, y2], [x2 - p * Math.cos(ang - 0.45), y2 - p * Math.sin(ang - 0.45)], [x2 - p * Math.cos(ang + 0.45), y2 - p * Math.sin(ang + 0.45)]];
    return html`<g><line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke=${c} stroke-width=${w} stroke-linecap="round" />
      <polygon points=${punta.map(q => q.join(',')).join(' ')} fill=${c} /></g>`;
  }
  if (a.tipo === 'cerchio' || a.tipo === 'riquadro' || a.tipo === 'evidenziazione') {
    return a.tipo === 'cerchio'
      ? html`<ellipse cx=${(a.x + a.w / 2) * L} cy=${(a.y + a.h / 2) * H} rx=${(a.w / 2) * L} ry=${(a.h / 2) * H} fill="none" stroke=${c} stroke-width=${w} />`
      : html`<rect x=${a.x * L} y=${a.y * H} width=${a.w * L} height=${a.h * H} fill=${a.tipo === 'evidenziazione' ? c : 'none'} fill-opacity="0.25" stroke=${c} stroke-width=${w} />`;
  }
  if (a.tipo === 'testo') {
    return html`<text x=${a.x * L} y=${a.y * H} fill=${c} font-size=${L / 22} font-weight="700" paint-order="stroke" stroke="#000" stroke-width=${w / 1.5}>${a.testo}</text>`;
  }
  return null;
}

function Disegno({ url, annotazioni, strumento, colore, alSegno, alPunto }) {
  const [dim, setDim] = useState(null);
  const [bozza, setBozzaStato] = useState(null);
  const tratto = useRef(null);
  const setBozza = b => { tratto.current = b; setBozzaStato(b); };
  const svg = useRef(null);
  const punto = e => {
    const r = svg.current.getBoundingClientRect();
    return [r4((e.clientX - r.left) / r.width), r4((e.clientY - r.top) / r.height)];
  };
  const giu = e => {
    if (!dim || !strumento) return;
    const [x, y] = punto(e);
    if (strumento === 'testo') { alPunto(x, y); return; }
    try { svg.current.setPointerCapture(e.pointerId); } catch { /* il tratto prosegue anche senza cattura */ }
    setBozza({ tipo: strumento, x0: x, y0: y, x, y });
  };
  const muovi = e => { if (tratto.current) { const [x, y] = punto(e); setBozza({ ...tratto.current, x, y }); } };
  const su = e => {
    if (!tratto.current) return;
    const [x, y] = punto(e);
    const { tipo, x0, y0 } = tratto.current;
    setBozza(null);
    if (Math.abs(x - x0) < 0.01 && Math.abs(y - y0) < 0.01) return;
    alSegno(tipo === 'freccia' ? { tipo: 'freccia', colore, x: x0, y: y0, x2: x, y2: y }
      : { tipo: 'cerchio', colore, x: Math.min(x0, x), y: Math.min(y0, y), w: r4(Math.abs(x - x0)), h: r4(Math.abs(y - y0)) });
  };
  const anteprima = bozza && (bozza.tipo === 'freccia'
    ? { tipo: 'freccia', colore, x: bozza.x0, y: bozza.y0, x2: bozza.x, y2: bozza.y }
    : { tipo: 'cerchio', colore, x: Math.min(bozza.x0, bozza.x), y: Math.min(bozza.y0, bozza.y), w: Math.abs(bozza.x - bozza.x0), h: Math.abs(bozza.y - bozza.y0) });
  return html`<div class="foto-annotata">
    <img src=${url} alt="Foto dell'evidenza" onLoad=${e => setDim([e.target.naturalWidth, e.target.naturalHeight])} />
    ${dim && html`<svg ref=${svg} viewBox=${`0 0 ${dim[0]} ${dim[1]}`} preserveAspectRatio="none"
        onPointerDown=${giu} onPointerMove=${muovi} onPointerUp=${su} onPointerCancel=${() => setBozza(null)}>
      ${annotazioni.map((a, i) => html`<${Segno} key=${i} a=${a} L=${dim[0]} H=${dim[1]} />`)}
      ${anteprima && html`<${Segno} a=${anteprima} L=${dim[0]} H=${dim[1]} />`}
    </svg>`}
  </div>`;
}

export function DettaglioEvidenza({ pratica, evidenza: e, evidenze, registri, mostra }) {
  const url = useUrlFile(e);
  const [annotazioni, setAnnotazioni] = useState(e.annotazioni || []);
  const [descrizione, setDescrizione] = useState(e.descrizione || '');
  const [nota, setNota] = useState(e.nota || '');
  const [video, setVideo] = useState(e.dataMostrataAVideo || null);
  const [comuni, setComuni] = useState(e.beni.slice(1));
  const [strumento, setStrumento] = useState('freccia');
  const [colore, setColore] = useState(COLORI[0]);
  const [testoIn, setTestoIn] = useState(null);
  const [annulla, setAnnulla] = useState(null);
  const sola = e.stato === 'annullata';
  const stessi = evidenze.filter(x => x.beni[0] === e.beni[0] && x.gruppo === e.gruppo);
  const n = stessi.findIndex(x => x.id === e.id) + 1;
  const altriBeni = [...pratica.andata.beni.flatMap(b => [b.codice, ...b.componenti.map(c => c.codice)]), ...registri.beneNuovo.keys()].filter(c => c !== e.beni[0]);
  const torna = () => history.length > 1 ? history.back() : vai(rottaPratica(pratica.codicePratica, 'beni', beneDi(e.beni[0])));

  const salva = async () => {
    await aggiornaEvidenza(pratica.codicePratica, e.id, x => {
      x.annotazioni = annotazioni; x.descrizione = descrizione.trim(); x.nota = nota.trim() || undefined;
      x.dataMostrataAVideo = video && video.valore ? { ...video, valore: video.valore.trim() } : undefined;
      x.beni = [e.beni[0], ...comuni]; x.comune = comuni.length ? true : undefined;
    });
    dispatchEvent(new Event('perito40:ricarica'));
    mostra(`${e.id} aggiornata`);
    torna();
  };

  return html`<div class="schermo annotazione">
    <header class="annota-testa">
      <button class="collegamento chiaro" onClick=${torna}>Annulla</button>
      <div class="centro"><div class="cliente">${e.beni[0]} · ${nomeGruppo(e.gruppo)}</div><div class="codice chiaro">${e.id} · ${e.tipo} ${n} di ${stessi.length}</div></div>
      <button class="primario mini" disabled=${sola || !descrizione.trim()} onClick=${salva}>Fatto</button>
    </header>
    <div class="annota-corpo">
      ${sola && html`<${Avviso} tipo="errore" titolo="Evidenza annullata">${e.annullamento.motivo} · ${dataBreve(e.annullamento.data)} ${oraBreve(e.annullamento.data)}${e.annullamento.sostituitaDa ? ` · sostituita da ${e.annullamento.sostituitaDa}` : ''}. Resta nel pacchetto, non si cancella.</${Avviso}>`}
      ${e.tipo === 'foto' || (e.tipo === 'screenshot' && e.mime.startsWith('image/'))
        ? (url ? html`<${Disegno} url=${url} annotazioni=${annotazioni} strumento=${sola ? null : strumento} colore=${colore}
              alSegno=${a => setAnnotazioni(x => [...x, a])} alPunto=${(x, y) => setTestoIn({ x, y, testo: '' })} />` : html`<div class="foto-annotata vuota">Caricamento…</div>`)
        : e.tipo === 'video' ? (url && html`<video class="lettore" src=${url} controls playsinline></video>`)
        : e.tipo === 'vocale' ? (url && html`<audio class="lettore audio" src=${url} controls></audio>`)
        : html`<div class="foto-annotata vuota"><${Icona} nome="file_text" dim=${40} />${url && html`<a class="collegamento chiaro" href=${url} target="_blank" rel="noopener">Apri il documento</a>`}</div>`}
      ${testoIn && html`<div class="testo-in"><input class="campo-testo" placeholder="Testo sul punto (ciò che si vede)" value=${testoIn.testo}
          onInput=${ev => setTestoIn({ ...testoIn, testo: ev.target.value.slice(0, 40) })} />
        <button class="primario mini" disabled=${!testoIn.testo.trim()} onClick=${() => { setAnnotazioni(x => [...x, { tipo: 'testo', colore, x: testoIn.x, y: testoIn.y, testo: testoIn.testo.trim() }]); setTestoIn(null); }}>Aggiungi</button></div>`}
      <div class="pannello-scuro">
        <div class="riga-nota"><span>${e.tipo === 'vocale' || e.tipo === 'video' ? 'Titolo' : 'Nota breve'}</span><span>${descrizione.length}/80</span></div>
        <input class="campo-testo scuro" value=${descrizione} disabled=${sola} placeholder="Quale fatto mostra, di quale bene (obbligatoria)"
          onInput=${ev => setDescrizione(ev.target.value.slice(0, 80))} />
        ${e.tipo === 'foto' && !sola && html`
          <div class="strumenti">${STRUMENTI.map(([k, ic, l]) => html`<button class=${strumento === k ? 'attivo' : ''}
              onClick=${() => k === 'annulla' ? setAnnotazioni(x => x.slice(0, -1)) : setStrumento(k)}><${Icona} nome=${ic} dim=${24} /><span>${l}</span></button>`)}</div>
          <div class="colori">${COLORI.map(c => html`<button class=${colore === c ? 'attivo' : ''} style=${{ background: c }} aria-label=${`Colore ${c}`} onClick=${() => setColore(c)}></button>`)}</div>`}
        <input class="campo-testo scuro" value=${nota} disabled=${sola} placeholder="Nota (facoltativa)" onInput=${ev => setNota(ev.target.value)} />
        ${(e.tipo === 'foto' || e.tipo === 'screenshot') && html`<details class="dettagli" open=${!!video}>
          <summary>Data o ora mostrata a schermo</summary>
          <input class="campo-testo scuro" value=${(video && video.valore) || ''} disabled=${sola} placeholder="Come appare sullo schermo, es. 15/10/2026 09:42"
            onInput=${ev => setVideo(v => ({ ...(v || {}), valore: ev.target.value }))} />
          <label class="spunta-riga"><input type="checkbox" checked=${!!(video && video.orologioErrato)} disabled=${sola}
            onChange=${ev => setVideo(v => ({ ...(v || { valore: '' }), orologioErrato: ev.target.checked }))} />Orologio del bene errato (si registra, non si corregge)</label>
          ${video && video.orologioErrato && html`<input class="campo-testo scuro" value=${video.scartoStimato || ''} placeholder="Scarto stimato, es. -1 h"
            onInput=${ev => setVideo(v => ({ ...v, scartoStimato: ev.target.value }))} />`}
        </details>`}
        <details class="dettagli">
          <summary>Vale anche per altri beni${comuni.length ? ` (${comuni.join(', ')})` : ''}</summary>
          <div class="scelte-beni">${altriBeni.map(c => html`<label class="spunta-riga"><input type="checkbox" disabled=${sola} checked=${comuni.includes(c)}
            onChange=${ev => setComuni(x => ev.target.checked ? [...x, c] : x.filter(y => y !== c))} />${c}</label>`)}</div>
        </details>
        <div class="metadati">
          <div>Acquisita nell'app: ${dataBreve(e.acquisitaIl)} ${oraBreve(e.acquisitaIl)}</div>
          <div>Data di scatto: ${e.origineDataScatto === 'metadati' ? `${dataBreve(e.dataScatto)} ${oraBreve(e.dataScatto)} (dai metadati del file)`
            : e.origineDataScatto === 'registrazione_app' ? `${dataBreve(e.dataScatto)} ${oraBreve(e.dataScatto)} (registrazione nell'app)`
            : e.origineDataScatto === 'fotocamera_app' ? `${dataBreve(e.dataScatto)} ${oraBreve(e.dataScatto)} (fotocamera aperta dall'app alle ${oraBreve(e.aperturaFotocamera)}; Safari non conserva i metadati)`
            : e.origineDataScatto === 'assente' ? 'metadati assenti: vale solo l\'ora di acquisizione' : 'non applicabile'}</div>
          <div>File: ${e.nomeFile} · ${(e.byte / 1e6).toFixed(1)} MB</div>
          <div class="impronta">SHA-256 ${e.sha256}</div>
        </div>
        ${!sola && html`<button class="collegamento rosso" onClick=${() => setAnnulla({ motivo: '', sostituitaDa: '' })}>Annulla evidenza</button>`}
      </div>
    </div>
    ${annulla && html`<${Foglio} titolo="Annulla evidenza" annulla="Indietro" conferma="Annulla evidenza" confermaAttiva=${!!annulla.motivo.trim()}
        alChiudi=${() => setAnnulla(null)} alConferma=${async () => {
          await annullaEvidenza(pratica.codicePratica, e.id, annulla.motivo.trim(), annulla.sostituitaDa || undefined);
          dispatchEvent(new Event('perito40:ricarica')); mostra(`${e.id} annullata: resta nel pacchetto`); setAnnulla(null); torna();
        }}>
      <div class="meta">L'evidenza non si cancella: resta nel pacchetto con motivo e data.</div>
      <textarea class="campo-testo area" rows="2" placeholder="Motivo (obbligatorio), es. riflesso sulla targa" value=${annulla.motivo}
        onInput=${ev => setAnnulla({ ...annulla, motivo: ev.target.value })} />
      <label class="etichetta-campo">Sostituita da (facoltativo)
        <select class="campo-testo" value=${annulla.sostituitaDa} onChange=${ev => setAnnulla({ ...annulla, sostituitaDa: ev.target.value })}>
          <option value="">—</option>${stessi.filter(x => x.id !== e.id && x.stato === 'valida').map(x => html`<option value=${x.id}>${x.id}</option>`)}
        </select></label>
    </${Foglio}>`}
  </div>`;
}
