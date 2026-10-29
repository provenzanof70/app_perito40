// 1h · Requisito per requisito: basi raccolte, nessun esito (la valutazione è in studio)
// 1g · Riscontro diretto guidato: fatto + oggetto + circostanza, data della visita, evidenze (§1.3, §10.9)
// 1m · Dichiarazione di terzi: persona, forma, contenuto, riscontro oggettivo S/N; «Da acquisire» = N + bozza di azione

import { useState, useRef } from 'preact/hooks';
import { html, Icona, oraBreve, oggi, dataBreve } from '../ui.js';
import { Foglio, Avviso } from '../componenti.js';
import { vai, rottaPratica } from '../rotte.js';
import { REQUISITI_UI, GRUPPI_UI, requisitiDelBene, basiRequisito } from '../stato.js';
import { salvaRegistro, salvaRegistri, cancellaRegistro, prossimoId, dataVisita, fraseRiscontro } from '../registri.js';
import { registraEvidenza, beneDi } from '../evidenze.js';
import { useUrlFile } from '../media.js';

const PROFILO = b => !b.classificazione ? 'Bene nuovo · solo identificazione'
  : b.classificazione.profilo === 'completo' ? 'Profilo completo 5+2' : `Profilo ridotto · All. ${b.classificazione.allegato}${b.classificazione.gruppo ? ` Gr. ${b.classificazione.gruppo}` : ''}`;
const CIRCOSTANZE = ['osservato durante la lavorazione', 'mostrato dall\'operatore su richiesta del perito'];
const tronca = (t, n) => t.length > n ? `${t.slice(0, n - 1)}…` : t;

export function tuttiIBeni(pratica, registri) {
  return [...pratica.andata.beni, ...registri.beneNuovo.values()];
}

// ---------------------------------------------------------------------------
// 1h · Requisiti
// ---------------------------------------------------------------------------

export function Requisiti({ pratica, evidenze, registri, codiceBene, mostra, alVisitaNecessaria }) {
  const beni = tuttiIBeni(pratica, registri);
  const bene = beni.find(b => b.codice === codiceBene) || beni[0];
  const [nota, setNota] = useState(null);
  const conVisita = fn => () => pratica.visita ? fn() : alVisitaNecessaria(fn);
  const cod = pratica.codicePratica;

  return html`
    <div class="filtri">${beni.map(b => html`<button class=${b.codice === bene.codice ? 'attivo' : ''}
      onClick=${() => vai(rottaPratica(cod, 'requisiti', b.codice))}>${b.codice}</button>`)}</div>
    <div class="meta voce-bene"><b>${bene.denominazione}</b> · ${PROFILO(bene)}</div>
    ${requisitiDelBene(bene).map(req => {
      const b = basiRequisito(bene, req, evidenze, registri, pratica.andata);
      const basi = [['Documento', b.evidenze.length + b.agliAtti.length], ['Riscontro diretto', b.riscontri.length], ['Dichiarazione', b.dichiarazioni.length]];
      return html`<div class="scheda requisito" key=${req}>
        <div class="req-testa"><span class="chip-codice">${req}</span><b>${REQUISITI_UI[req].nome}</b><span class="meta">${b.evidenze.length} evidenze${b.agliAtti.length ? ` · ${b.agliAtti.length} agli atti` : ''}</span></div>
        <div class="basi">${basi.map(([l, n]) => html`<div class=${`base ${n ? 'si' : ''}`}><span class="segno">${n ? '✓' : '—'}</span><span>${l}${n > 1 ? ` (${n})` : ''}</span></div>`)}</div>
        ${b.riscontri.map(r => html`<button class="voce-registro" onClick=${() => vai(rottaPratica(cod, 'riscontro', bene.codice, req, r.id))}>
          <span class="chip-mini">${r.id}</span><span>${tronca(r.frase, 110)}</span></button>`)}
        ${b.dichiarazioni.map(d => html`<button class="voce-registro" onClick=${() => vai(rottaPratica(cod, 'dichiarazione', bene.codice, req, d.id))}>
          <span class="chip-mini">${d.id}</span><span>${d.persona} (${d.forma}): «${tronca(d.contenuto, 80)}»${d.riscontroOggettivo.esito === 'S' ? '' : d.daAcquisire ? ' · riscontro da acquisire' : ' · senza riscontro oggettivo'}</span></button>`)}
        <button class="nota-req" onClick=${() => setNota({ req, testo: b.nota ? b.nota.testo : '', id: b.nota && b.nota.id })}>
          <span class="etichetta-nota">Nota del perito</span>${b.nota ? b.nota.testo : html`<span class="meta">Aggiungi un promemoria (non è una prova)</span>`}</button>
        <div class="req-piede"><span class="meta">Esito: da valutare in studio</span>
          <span class="req-tasti">
            <button class="secondario piccolo" onClick=${conVisita(() => vai(rottaPratica(cod, 'dichiarazione', bene.codice, req)))}>Dichiarazione</button>
            <button class="secondario piccolo pieno" onClick=${conVisita(() => vai(rottaPratica(cod, 'riscontro', bene.codice, req)))}>Riscontro diretto</button>
          </span></div>
      </div>`;
    })}
    ${nota && html`<${Foglio} titolo=${`Nota · ${bene.codice} · ${nota.req}`} annulla="Annulla" conferma="Salva" alChiudi=${() => setNota(null)}
        alConferma=${async () => {
          const testo = nota.testo.trim();
          if (!testo && nota.id) await cancellaRegistro(cod, 'nota', nota.id);
          else if (testo) {
            const id = nota.id || prossimoId(pratica.andata, registri, 'nota');
            await salvaRegistro(cod, 'nota', id, { id, bene: bene.codice, requisito: nota.req, testo, ora: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), base: 'promemoria' });
          }
          dispatchEvent(new Event('perito40:ricarica')); setNota(null); mostra(testo ? 'Nota salvata come promemoria' : 'Nota tolta');
        }}>
      <${Avviso} tipo="info">Promemoria per lo studio: non è un riscontro diretto né una prova. Ciò che osservi va nel riscontro diretto.</${Avviso}>
      <textarea class="campo-testo area" rows="4" value=${nota.testo} placeholder="Es. il referente indica il collegamento al magazzino utensili; da fotografare"
        onInput=${e => setNota({ ...nota, testo: e.target.value })} />
    </${Foglio}>`}`;
}

// ---------------------------------------------------------------------------
// Scelta delle evidenze, con scatto diretto dal modulo
// ---------------------------------------------------------------------------

function Miniatura({ evidenza: e, scelta, alTocco }) {
  const url = useUrlFile(e.tipo === 'foto' || (e.tipo === 'screenshot' && e.mime.startsWith('image/')) ? e : null);
  return html`<button class=${`mini-ev ${scelta ? 'scelta' : ''}`} onClick=${alTocco} style=${url ? { backgroundImage: `url(${url})` } : null}>
    ${!url && html`<${Icona} nome=${e.tipo === 'vocale' ? 'chat_text' : e.tipo === 'video' ? 'camera' : 'file_text'} dim=${22} />`}
    <span class="mini-ev-id">${e.id}</span>${scelta && html`<span class="mini-ev-spunta">✓</span>`}</button>`;
}

function SceltaEvidenze({ pratica, evidenze, registri, bene, requisito, scelte, setScelte, idCampo, mostra, gruppo }) {
  const [lavoro, setLavoro] = useState(false);
  const elenco = evidenze.filter(e => e.stato === 'valida' && e.beni.some(b => beneDi(b) === bene))
    .sort((a, b) => (b.requisiti.includes(requisito) - a.requisiti.includes(requisito)) || b.acquisitaIl.localeCompare(a.acquisitaIl));
  const cambia = id => setScelte(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const apertura = useRef(null);
  async function suFile(f) {
    if (!f) return;
    setLavoro(true);
    try {
      const g = gruppo != null ? gruppo : REQUISITI_UI[requisito].gruppo;
      const e = await registraEvidenza(pratica, evidenze, registri, {
        codice: bene, gruppo: g, tipo: f.type.startsWith('video/') ? 'video' : 'foto', blob: f, nomeOriginale: f.name,
        aperturaFotocamera: apertura.current, rientroFotocamera: new Date(),
        descrizione: `${GRUPPI_UI[g].nome.replace('­', '')} di ${bene} per ${requisito} (da descrivere meglio nel dettaglio)`,
      });
      setScelte(s => [...s, e.id]);
      dispatchEvent(new Event('perito40:ricarica'));
      mostra(`${e.id} salvata e collegata`);
    } catch (err) { mostra(`Evidenza non salvata: ${err.message}`); } finally { setLavoro(false); }
  }
  return html`<div class="scelta-ev">
    <label class=${`mini-ev nuova ${lavoro ? 'in-corso' : ''}`} for=${idCampo} onClick=${() => { apertura.current = new Date(); }}>
      <${Icona} nome="fotocamera" dim=${22} /><span>Foto o video</span></label>
    <input id=${idCampo} type="file" class="campo-file" accept="image/*,video/*" capture="environment"
      onChange=${e => { const f = e.target.files[0]; e.target.value = ''; suFile(f); }} />
    ${elenco.map(e => html`<${Miniatura} key=${e.id} evidenza=${e} scelta=${scelte.includes(e.id)} alTocco=${() => cambia(e.id)} />`)}
  </div>`;
}

// ---------------------------------------------------------------------------
// 1g · Riscontro diretto
// ---------------------------------------------------------------------------

export function FormRiscontro({ pratica, evidenze, registri, codiceBene, requisito, idRegistro, mostra }) {
  const esistente = idRegistro && registri.riscontro.get(idRegistro);
  const beneObj = tuttiIBeni(pratica, registri).find(b => b.codice === codiceBene);
  const [fatto, setFatto] = useState(esistente ? esistente.fatto : '');
  const [oggetto, setOggetto] = useState(esistente ? esistente.oggetto : '');
  const [circ, setCirc] = useState(esistente ? esistente.circostanza : CIRCOSTANZE[0]);
  const [ora, setOra] = useState(esistente ? esistente.ora : oraBreve(new Date().toISOString()));
  const [scelte, setScelte] = useState(esistente ? esistente.evidenze : []);
  const [limiti, setLimiti] = useState(esistente ? esistente.limiti || '' : '');
  const data = esistente ? esistente.dataVisita : dataVisita(pratica);
  const passi = [!!fatto.trim(), !!oggetto.trim(), !!circ.trim(), scelte.length > 0];
  const valido = passi[0] && passi[1] && passi[2] && /^[0-2]\d:[0-5]\d$/.test(ora);
  const frase = valido ? fraseRiscontro({ fatto, oggetto, circostanza: circ, bene: codiceBene, ora, data }) : '';
  const torna = () => vai(rottaPratica(pratica.codicePratica, 'requisiti', codiceBene));
  const salva = async () => {
    const id = esistente ? esistente.id : prossimoId(pratica.andata, registri, 'riscontro');
    await salvaRegistro(pratica.codicePratica, 'riscontro', id, {
      id, bene: codiceBene, requisito, idSopralluogo: pratica.visita ? pratica.visita.id : pratica.andata.sopralluogo.id,
      dataVisita: data, ora, fatto: fatto.trim(), oggetto: oggetto.trim(), circostanza: circ.trim(), frase, evidenze: scelte,
      limiti: limiti.trim() || undefined,
    });
    dispatchEvent(new Event('perito40:ricarica'));
    mostra(`${id} salvato${scelte.length ? '' : ' senza evidenza collegata'}`);
    torna();
  };
  return html`
    <div class="scheda riscontro-testa">
      <div class="req-testa"><span class="chip-codice">${requisito}</span><b>${REQUISITI_UI[requisito].nome}</b></div>
      <div class="meta">${codiceBene} · ${beneObj ? beneObj.denominazione : ''}</div>
      <div class="passi">${passi.map(p => html`<span class=${p ? 'fatto' : ''}></span>`)}</div>
    </div>
    <div class="scheda passo">
      <div class="passo-testa"><span class=${`num ${passi[0] ? 'ok' : ''}`}>1</span><b>Fatto osservato</b><span class="meta">1 di 4</span></div>
      <textarea class="campo-testo area" rows="3" value=${fatto} onInput=${e => setFatto(e.target.value)}
        placeholder="Es. il programma P-17 inviato dal MES risultava caricato e in esecuzione" />
      <div class="meta">Descrivi ciò che vedi, non la conclusione.</div>
    </div>
    <div class="scheda passo">
      <div class="passo-testa"><span class=${`num ${passi[1] ? 'ok' : ''}`}>2</span><b>Oggetto</b><span class="meta">2 di 4</span></div>
      <div class="riga-oggetto"><span class="chip-codice">${codiceBene}</span>
        <input class="campo-testo" value=${oggetto} onInput=${e => setOggetto(e.target.value)} placeholder="Su quale elemento, es. HMI del controllo CNC" /></div>
    </div>
    <div class="scheda passo">
      <div class="passo-testa"><span class=${`num ${passi[2] ? 'ok' : ''}`}>3</span><b>Circostanza</b><span class="meta">3 di 4</span></div>
      ${CIRCOSTANZE.map(c => html`<button class=${`opzione-circ ${circ === c ? 'scelta' : ''}`} onClick=${() => setCirc(c)}>
        <span class="radio"><span></span></span>${c.charAt(0).toUpperCase() + c.slice(1)}</button>`)}
      <input class="campo-testo" value=${circ} onInput=${e => setCirc(e.target.value)} placeholder="Oppure descrivi la circostanza" />
      <label class="riga-ora">Ora dell'osservazione <input class="campo-testo corto" type="time" value=${ora} onInput=${e => setOra(e.target.value)} /></label>
      <button class="collegamento" onClick=${() => vai(rottaPratica(pratica.codicePratica, 'dichiarazione', codiceBene, requisito))}>È un'informazione riferita? Registra come dichiarazione di terzi</button>
    </div>
    <div class="scheda passo">
      <div class="passo-testa"><span class=${`num ${passi[3] ? 'ok' : ''}`}>4</span><b>Evidenza collegata</b><span class="meta">4 di 4</span></div>
      <${SceltaEvidenze} pratica=${pratica} evidenze=${evidenze} registri=${registri} bene=${codiceBene} requisito=${requisito}
        scelte=${scelte} setScelte=${setScelte} idCampo="campo-riscontro" mostra=${mostra} />
      ${!scelte.length && html`<div class="riga-avviso"><${Icona} nome="attenzione" dim=${14} />Senza evidenza il riscontro si può salvare, ma vale meno: collega una foto o un video.</div>`}
      <div class="meta">Data della visita: ${dataBreve(data)} · registrata automaticamente, il riscontro non retrodata l'evento.</div>
    </div>
    <div class="scheda passo">
      <label class="etichetta-campo">Limiti (facoltativo)<input class="campo-testo" value=${limiti} onInput=${e => setLimiti(e.target.value)} placeholder="Es. verificato solo il flusso in ingresso" /></label>
      ${frase && html`<div class="frase"><span class="etichetta-nota">Frase verbalizzata</span>${frase}</div>`}
    </div>
    <button class="primario" disabled=${!valido} onClick=${salva}>Salva riscontro</button>`;
}

// ---------------------------------------------------------------------------
// 1m · Dichiarazione di terzi
// ---------------------------------------------------------------------------

export function FormDichiarazione({ pratica, evidenze, registri, codiceBene, requisito, idRegistro, mostra }) {
  const esistente = idRegistro && registri.dichiarazione.get(idRegistro);
  const referenti = pratica.andata.sopralluogo.referenti;
  const [persona, setPersona] = useState(esistente ? { persona: esistente.persona, ruolo: esistente.ruolo, organizzazione: esistente.organizzazione } : { persona: '', ruolo: '', organizzazione: '' });
  const [forma, setForma] = useState(esistente ? esistente.forma : 'verbale');
  const [data, setData] = useState(esistente ? esistente.data : oggi());
  const [contenuto, setContenuto] = useState(esistente ? esistente.contenuto : '');
  const [ogg, setOgg] = useState(esistente ? (esistente.riscontroOggettivo.esito === 'S' ? 'si' : esistente.daAcquisire ? 'da_acquisire' : 'no') : 'da_acquisire');
  const [scelte, setScelte] = useState(esistente ? esistente.riscontroOggettivo.evidenze.map(x => x.idEvidenza) : []);
  const [documento, setDocumento] = useState(esistente && esistente.evidenzaDichiarazione ? [esistente.evidenzaDichiarazione] : []);
  const valido = persona.persona.trim() && persona.ruolo.trim() && persona.organizzazione.trim() && contenuto.trim() && data && (ogg !== 'si' || scelte.length);
  const torna = () => vai(rottaPratica(pratica.codicePratica, 'requisiti', codiceBene));

  const salva = async () => {
    const id = esistente ? esistente.id : prossimoId(pratica.andata, registri, 'dichiarazione');
    const voci = [];
    let idAzione = esistente && esistente.azioneGenerata;
    if (ogg === 'da_acquisire' && !idAzione) idAzione = prossimoId(pratica.andata, registri, 'azione');
    if (ogg === 'da_acquisire') {
      voci.push({ tipo: 'azione', id: idAzione, dati: {
        id: idAzione, categoria: 'evidenza', beni: [codiceBene], requisito, stato: 'aperta', apertaIl: oggi(),
        cosaServe: `Riscontro oggettivo della dichiarazione ${id}: «${tronca(contenuto.trim(), 90)}»`,
        nota: `Dichiarazione ${forma} di ${persona.persona.trim()} (${persona.ruolo.trim()})`, generataDa: { tipo: 'dichiarazione', id },
      } });
    }
    voci.push({ tipo: 'dichiarazione', id, dati: {
      id, beni: [codiceBene], persona: persona.persona.trim(), ruolo: persona.ruolo.trim(), organizzazione: persona.organizzazione.trim(),
      forma, data, contenuto: contenuto.trim(), requisito, evidenzaDichiarazione: forma === 'scritta' && documento[0] ? documento[0] : undefined,
      riscontroOggettivo: ogg === 'si'
        ? { esito: 'S', evidenze: scelte.map(idEvidenza => ({ idEvidenza })) }
        : { esito: 'N', evidenze: [], nota: ogg === 'da_acquisire' ? `riscontro da acquisire: azione ${idAzione}` : 'nessun riscontro oggettivo: non dimostra il requisito da sola' },
      daAcquisire: ogg === 'da_acquisire', azioneGenerata: ogg === 'da_acquisire' ? idAzione : undefined,
    } });
    await salvaRegistri(pratica.codicePratica, voci);
    // la bozza nata da «Da acquisire» si scarta se la scelta cambia prima di qualsiasi pacchetto esportato
    if (ogg !== 'da_acquisire' && esistente && esistente.azioneGenerata && !pratica.esportazioni.ultimo) await cancellaRegistro(pratica.codicePratica, 'azione', esistente.azioneGenerata);
    dispatchEvent(new Event('perito40:ricarica'));
    mostra(ogg === 'da_acquisire' ? `${id} salvata · creata la bozza di azione ${idAzione}` : `${id} salvata`);
    torna();
  };

  return html`
    <${Avviso} tipo="info">Informazione riferita da una persona e non osservata dal perito: resta distinta dai riscontri diretti e da sola non dimostra il requisito.</${Avviso}>
    <div class="scheda"><div class="req-testa"><span class="chip-codice">${requisito}</span><b>${REQUISITI_UI[requisito].nome} · ${codiceBene}</b></div></div>
    <div class="sezione">Chi dichiara</div>
    <div class="filtri">${referenti.map(r => html`<button class=${persona.persona === r.nome ? 'attivo' : ''}
      onClick=${() => setPersona({ persona: r.nome, ruolo: r.ruolo, organizzazione: r.organizzazione })}>${r.nome}</button>`)}</div>
    <div class="elenco">
      <label class="voce"><span class="etichetta">Persona</span><input class="campo-voce" value=${persona.persona} onInput=${e => setPersona({ ...persona, persona: e.target.value })} placeholder="Nome e cognome" /></label>
      <label class="voce"><span class="etichetta">Ruolo</span><input class="campo-voce" value=${persona.ruolo} onInput=${e => setPersona({ ...persona, ruolo: e.target.value })} placeholder="Es. referente IT" /></label>
      <label class="voce"><span class="etichetta">Organizzazione</span><input class="campo-voce" value=${persona.organizzazione} onInput=${e => setPersona({ ...persona, organizzazione: e.target.value })} placeholder="Azienda" /></label>
    </div>
    <div class="sezione">Forma</div>
    <div class="segmenti">${[['scritta', 'Scritta'], ['verbale', 'Verbale']].map(([k, l]) => html`<button class=${forma === k ? 'attivo' : ''} onClick=${() => setForma(k)}>${l}</button>`)}</div>
    ${forma === 'scritta' && html`<div class="scheda passo"><div class="meta">Allega la foto del documento firmato</div>
      <${SceltaEvidenze} pratica=${pratica} evidenze=${evidenze} registri=${registri} bene=${codiceBene} requisito="DOC" gruppo="DOC"
        scelte=${documento} setScelte=${f => setDocumento(d => { const n = typeof f === 'function' ? f(d) : f; return n.slice(-1); })} idCampo="campo-documento" mostra=${mostra} /></div>`}
    <div class="elenco"><label class="voce"><span class="etichetta">Data della dichiarazione</span>
      <input class="campo-voce" type="date" value=${data} onInput=${e => setData(e.target.value)} /></label></div>
    <label class="etichetta-campo">Contenuto (le parole effettive, non un giudizio)
      <textarea class="campo-testo area" rows="4" value=${contenuto} onInput=${e => setContenuto(e.target.value)} placeholder="Es. il programma viene inviato ogni mattina dal server di reparto al CNC" /></label>
    <div class="sezione">Riscontro oggettivo</div>
    <div class="segmenti">${[['si', 'Sì'], ['no', 'No'], ['da_acquisire', 'Da acquisire']].map(([k, l]) => html`<button class=${ogg === k ? 'attivo' : ''} onClick=${() => setOgg(k)}>${l}</button>`)}</div>
    ${ogg === 'si'
      ? html`<div class="scheda passo"><div class="meta">Evidenza che riscontra la dichiarazione (obbligatoria)</div>
          <${SceltaEvidenze} pratica=${pratica} evidenze=${evidenze} registri=${registri} bene=${codiceBene} requisito=${requisito}
            scelte=${scelte} setScelte=${setScelte} idCampo="campo-riscontro-ogg" mostra=${mostra} /></div>`
      : html`<${Avviso} tipo="att">${ogg === 'da_acquisire' ? 'Riscontro da acquisire: al salvataggio si crea una bozza di azione collegata. La dichiarazione da sola non dimostra il requisito.' : 'Non dimostra il requisito da sola.'}</${Avviso}>`}
    <button class="primario" disabled=${!valido} onClick=${salva}>Salva dichiarazione</button>`;
}
