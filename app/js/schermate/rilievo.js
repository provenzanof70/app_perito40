// 1d · Rilievo per bene e gruppo · 1f · Vocali e video
// Foto e video con la fotocamera nativa dell'iPhone (risoluzione piena, metadati originali);
// vocali registrati nell'app; allegati da File; importazione dal Rullino e da File. Nessuna trascrizione nell'app.
// Dopo ogni acquisizione con l'app si propone subito la copia di sicurezza sul telefono: i rilievi sono irripetibili.

import { useState, useRef, useEffect } from 'preact/hooks';
import { html, Icona } from '../ui.js';
import { Foglio } from '../componenti.js';
import { vai, rottaPratica } from '../rotte.js';
import { GRUPPI_UI } from '../stato.js';
import { registraEvidenza, gruppiPer, beneDi } from '../evidenze.js';
import { useUrlFile, durata, avviaRegistrazione } from '../media.js';
import { comeFile, condividi, segnaFatte, copieMancanti, statoCopia, android, preparaDati } from '../copie.js';
import { FoglioCopie } from './copie.js';

const TIPI_COMPONENTE = { M: 'macchina', QM: 'quasi-macchina', ITS: 'insieme', ACC: 'accessorio' };

const MODI = [['video', 'VIDEO'], ['foto', 'FOTO'], ['vocale', 'VOCALE'], ['file', 'FILE']];

function tuttiIBeni(pratica, registri) {
  const out = [];
  for (const b of [...pratica.andata.beni, ...registri.beneNuovo.values()]) {
    out.push({ codice: b.codice, nome: b.denominazione, livello: 0 });
    for (const c of b.componenti || []) out.push({ codice: c.codice, nome: c.denominazione, livello: 1,
      nota: [`componente di ${b.codice}`, TIPI_COMPONENTE[c.tipo]].filter(Boolean).join(' · ') });
  }
  return out;
}

const minSec = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Anteprima({ evidenza }) {
  const url = useUrlFile(evidenza && evidenza.tipo === 'foto' ? evidenza : null);
  if (!evidenza) return html`<div class="ultima vuota"></div>`;
  return html`<button class="ultima" onClick=${() => vai(rottaPratica(evidenza.codicePratica, 'evidenza', evidenza.id))}
    style=${url ? { backgroundImage: `url(${url})` } : null} aria-label=${`Ultima evidenza ${evidenza.id}`}>
    ${!url && html`<${Icona} nome=${evidenza.tipo === 'vocale' ? 'chat_text' : evidenza.tipo === 'video' ? 'camera' : 'file_text'} dim=${22} />`}</button>`;
}

function Registrazioni({ pratica, evidenze, bene, tipo }) {
  const lista = evidenze.filter(e => e.tipo === tipo && beneDi(e.beni[0]) === beneDi(bene)).reverse();
  const nome = tipo === 'video' ? 'Video' : 'Note vocali';
  if (!lista.length) return html`<div class="meta registrazioni-vuote">${tipo === 'video' ? 'Nessun video' : 'Nessuna nota vocale'} per ${beneDi(bene)}.</div>`;
  return html`<div class="registrazioni">
    <div class="sezione chiara">${nome} · ${beneDi(bene)}</div>
    ${lista.map(e => html`<button class="registrazione" onClick=${() => vai(rottaPratica(pratica.codicePratica, 'evidenza', e.id))}>
      <${Icona} nome=${e.tipo === 'video' ? 'camera' : 'chat_text'} dim=${22} />
      <span class="etichetta">${e.descrizione || 'Senza titolo'}
        <span class="sotto">${e.tipo === 'video' ? 'video ' : ''}${e.durataSecondi ? minSec(e.durataSecondi) : '--:--'} · ${GRUPPI_UI[e.gruppo].nome.replace('­', '')} · ${GRUPPI_UI[e.gruppo].requisito}${e.stato === 'annullata' ? ' · annullata' : ''}</span>
        <span class="da-trascrivere">Da trascrivere in studio</span>
        ${e.nota && html`<span class="sotto">Nota: ${e.nota}</span>`}</span>
    </button>`)}
  </div>`;
}

export function Rilievo({ pratica, evidenze, registri, beneIniziale, gruppoIniziale, mostra, alVisitaNecessaria }) {
  const beni = tuttiIBeni(pratica, registri);
  const [codice, setCodice] = useState(beneIniziale && beni.some(b => b.codice === beneIniziale) ? beneIniziale : (beni[0] || {}).codice);
  const gruppi = codice ? gruppiPer(pratica, registri, codice) : [];
  const conta = g => evidenze.filter(e => e.stato === 'valida' && e.gruppo === g && e.beni[0] === codice).length;
  const primoMancante = (gruppi.find(g => g.attesa === 'si' && !conta(g.gruppo)) || gruppi[0] || {}).gruppo;
  const [gruppo, setGruppo] = useState(gruppoIniziale != null && gruppi.some(g => g.gruppo === gruppoIniziale) ? gruppoIniziale : primoMancante);
  const [modo, setModo] = useState('foto');
  const [scelta, setScelta] = useState(false);
  const [copia, setCopia] = useState(null);             // { id, file } dell'ultima acquisizione da copiare
  const [foglioCopie, setFoglioCopie] = useState(null); // null | { momento, continua }
  const [importa, setImporta] = useState(false);
  const [lavoro, setLavoro] = useState(false);
  const [registrazione, setRegistrazione] = useState(null);
  const [secondi, setSecondi] = useState(0);
  const [livelli, setLivelli] = useState(Array(36).fill(0.1));
  const input = useRef(null);
  const rullino = useRef(null);
  const daFile = useRef(null);
  const allegato = useRef(null);
  const apertaIl = useRef(null);
  const attiva = useRef(null);
  attiva.current = registrazione;
  useEffect(() => () => { if (attiva.current) attiva.current.ferma(); }, []);
  useEffect(() => { if (!registrazione) return undefined; const t = setInterval(() => setSecondi(s => s + 1), 1000); return () => clearInterval(t); }, [registrazione]);

  const bene = beni.find(b => b.codice === codice);
  const ui = GRUPPI_UI[gruppo] || {};
  const atteso = gruppi.find(g => g.gruppo === gruppo) || {};
  const cosaCercare = (pratica.andata.beni.find(b => b.codice === beneDi(codice || '')) || { gruppiEvidenze: [] }).gruppiEvidenze.find(g => g.gruppo === gruppo);
  const ultima = [...evidenze].filter(e => e.beni[0] === codice).sort((a, b) => a.acquisitaIl.localeCompare(b.acquisitaIl)).pop();

  async function salva(blob, tipo, extra = {}) {
    setLavoro(true);
    try {
      const e = await registraEvidenza(pratica, evidenze, registri, { codice, gruppo, tipo, blob, ...extra });
      dispatchEvent(new Event('perito40:ricarica'));
      // il file è già in memoria: la condivisione può partire subito dal tocco su «Salva copia sul telefono»
      if (e.copiaSicurezza.stato !== 'da_fare') setCopia(null);
      else {
        const file = comeFile(e, blob);
        setCopia({ id: e.id, file, pronto: !android });
        if (android) preparaDati([file]).then(() => setCopia(c => c && c.id === e.id ? { ...c, pronto: true } : c));
      }
      // Si resta sulla fotocamera per lo scatto successivo: nota e annotazioni si aggiungono toccando la miniatura, anche dopo
      mostra(`${e.id} salvata${e.origineDataScatto === 'assente' ? ' · data di scatto assente' : e.origineDataScatto === 'metadati' ? ' · data di scatto dai metadati' : ''} · tocca la miniatura per descriverla`);
    } catch (err) {
      mostra(`Evidenza non salvata: ${err.message}`);
    } finally { setLavoro(false); }
  }

  // origine: 'fotocamera' (aperta dall'app), 'file' (allegato da File: documento o schermata),
  // 'rullino' / 'importa_file' (Importa: foto, video e vocali già sul telefono, con la data di scatto dai metadati)
  async function suFile(f, origine) {
    if (!f) return;
    const rientro = new Date();
    const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const audio = f.type.startsWith('audio/') || /\.(m4a|mp3|wav|aac|caf)$/i.test(f.name);
    const tipo = origine === 'file' ? (pdf || !f.type.startsWith('image/') ? 'documento' : 'screenshot')
      : pdf ? 'documento' : audio ? 'vocale' : f.type.startsWith('video/') ? 'video' : 'foto';
    const extra = { nomeOriginale: f.name, origineFile: origine === 'fotocamera' ? 'app' : origine === 'rullino' ? 'rullino' : 'file' };
    if (origine === 'fotocamera' && apertaIl.current) { extra.aperturaFotocamera = apertaIl.current; extra.rientroFotocamera = rientro; }
    apertaIl.current = null;
    if (tipo === 'video' || tipo === 'vocale') extra.durataSecondi = await durata(f, tipo === 'video' ? 'video' : 'audio');
    if (tipo === 'vocale') extra.descrizione = `Nota vocale importata · ${ui.nome.replace('­', '')} · ${codice}`;
    await salva(f, tipo, extra);
  }

  async function salvaCopia() {
    const c = copia;
    const esito = await condividi([c.file]);
    if (!esito) return;
    await segnaFatte(pratica.codicePratica, [c.id], esito);
    setCopia(null);
    dispatchEvent(new Event('perito40:ricarica'));
    mostra(`Copia di sicurezza di ${c.id} salvata sul telefono`);
  }

  // Al cambio di bene si controllano le copie mancanti: si salvano oppure si prosegue con un motivo
  function scegliBene(b) {
    const applica = () => { setCodice(b.codice); setGruppo((gruppiPer(pratica, registri, b.codice).find(g => g.attesa === 'si') || {}).gruppo); };
    setScelta(false);
    if (b.codice !== codice && copieMancanti(evidenze).length) setFoglioCopie({ momento: 'cambio_bene', continua: applica });
    else applica();
  }

  async function scatta(visitaAvviata = false) {
    if (!pratica.visita && !visitaAvviata) return alVisitaNecessaria(() => scatta(true));
    if (modo === 'file') { apertaIl.current = null; return allegato.current.click(); }
    if (modo !== 'vocale') { apertaIl.current = new Date(); return input.current.click(); }
    if (!registrazione) {
      try { setSecondi(0); setRegistrazione(await avviaRegistrazione(setLivelli)); }
      catch (e) { mostra(`Microfono non disponibile: ${e.message}`); }
      return;
    }
    const r = await registrazione.ferma();
    setRegistrazione(null);
    const s = Math.round((r.fine - r.inizio) / 100) / 10;
    const { isoLocale } = await import('../metadati.js');
    await salva(r.blob, 'vocale', { durataSecondi: s, dataRegistrazione: isoLocale(r.inizio), descrizione: `Nota vocale · ${ui.nome.replace('­', '')} · ${codice}` });
  }

  const accetta = modo === 'video' ? 'video/*' : 'image/*';
  const mancanti = copieMancanti(evidenze).length;
  const copiaAperta = copia && evidenze.some(e => e.id === copia.id && statoCopia(e) === 'da_fare');
  return html`<div class="rilievo">
    <div class="rilievo-stato">Offline o in rete: le evidenze si salvano sul telefono
      ${mancanti ? html` · <button class="collegamento copie-mancanti" onClick=${() => setFoglioCopie({ momento: null })}>${mancanti === 1 ? '1 copia di sicurezza da fare' : `${mancanti} copie di sicurezza da fare`}</button>` : null}</div>
    <div class="rilievo-centro">
      ${modo === 'vocale'
        ? html`<div class="registratore">
            <div class="onda">${livelli.map((l, i) => html`<span style=${{ height: `${6 + Math.round(l * 44)}px`, background: registrazione ? '#E5383B' : i < 22 ? '#5A9BFF' : '#48484A' }}></span>`)}</div>
            <div class="tempo">${minSec(secondi)}</div>
            <div class="meta chiara">${registrazione ? 'In registrazione · salvata sul dispositivo' : 'Pronto · tocca per registrare'}</div>
          </div>
          <${Registrazioni} pratica=${pratica} evidenze=${evidenze} bene=${codice} tipo="vocale" />`
        : html`<div class="suggerimento"><div><b>${ui.nome ? ui.nome.replace('­', '') : ''}</b> · ${(cosaCercare && cosaCercare.cosaCercare) || 'contesto prima del dettaglio, poi il particolare'}</div>
            <span class="meta chiara">${modo === 'foto' ? 'Si apre la fotocamera dell\'iPhone: foto a piena risoluzione con la data di scatto originale.'
              : modo === 'video' ? 'Si apre la videocamera dell\'iPhone.' : 'Scegli un PDF o un\'immagine da File (report, schermate, documenti mostrati in campo).'}</span>
            <span class="meta chiara">«Importa» prende foto, video e vocali già sul telefono (Rullino o File), con la data di scatto del file.</span></div>
          ${modo === 'video' && html`<${Registrazioni} pratica=${pratica} evidenze=${evidenze} bene=${codice} tipo="video" />`}`}
    </div>
    <div class="rilievo-pannello">
      ${copiaAperta && html`<div class="striscia-copia" role="status">
        <span><b>Copia di sicurezza</b> · ${copia.id} esiste solo nell'app</span>
        <button disabled=${!copia.pronto} onClick=${salvaCopia}>${android ? 'Scarica copia nel telefono' : 'Salva copia sul telefono'}</button>
        <button class="chiudi" aria-label="Più tardi" onClick=${() => setCopia(null)}>×</button>
      </div>`}
      <div class="rilievo-bene">
        <span class="chip-codice scuro">${codice || '—'}</span><span class="nome">${bene ? bene.nome : 'Nessun bene'}</span>
        <button class="collegamento chiaro" onClick=${() => setScelta(true)}>Cambia</button>
      </div>
      <div class="chip-gruppi">${gruppi.map(g => {
        const n = conta(g.gruppo);
        return html`<button class=${g.gruppo === gruppo ? 'attivo' : ''} onClick=${() => setGruppo(g.gruppo)}>
          ${GRUPPI_UI[g.gruppo].nome.replace('­', '')}<span class="n">${n}</span>${g.attesa === 'si' && !n ? html`<span class="manca"></span>` : null}</button>`;
      })}</div>
      <div class="modi">${MODI.map(([k, l]) => html`<button class=${modo === k ? 'attivo' : ''} disabled=${!!registrazione}
        onClick=${() => { setModo(k); if (k === 'file' && pratica.visita && codice) allegato.current.click(); }}>${l}</button>`)}
        <button disabled=${!!registrazione || lavoro || !codice} onClick=${() => pratica.visita ? setImporta(true) : alVisitaNecessaria(() => setImporta(true))}>IMPORTA</button></div>
      <div class="scatto-riga">
        <${Anteprima} evidenza=${ultima} />
        ${modo === 'file'
          ? (pratica.visita && codice && !lavoro
            ? html`<label class="scegli-file" for="campo-allegato"><${Icona} nome="file_text" dim=${22} />Scegli file</label>`
            : html`<button class="scegli-file" disabled=${lavoro || !codice} onClick=${() => scatta()}><${Icona} nome="file_text" dim=${22} />Scegli file</button>`)
          : html`<button class=${`otturatore ${modo === 'vocale' ? 'vocale' : ''} ${registrazione ? 'in-corso' : ''}`} disabled=${lavoro || !codice}
              aria-label=${modo === 'vocale' ? (registrazione ? 'Ferma registrazione' : 'Registra') : 'Acquisisci'} onClick=${() => scatta()}><span></span></button>`}
        <div class="ultima vuota"></div>
      </div>
      <input ref=${input} type="file" class="campo-file" accept=${accetta} capture="environment"
        onChange=${e => { const f = e.target.files[0]; e.target.value = ''; suFile(f, 'fotocamera'); }} />
      <input ref=${rullino} type="file" class="campo-file" accept="image/*,video/*"
        onChange=${e => { const f = e.target.files[0]; e.target.value = ''; suFile(f, 'rullino'); }} />
      <input ref=${daFile} type="file" class="campo-file" accept="audio/*,video/*,image/*,.m4a,.mp3,.wav,.pdf,application/pdf"
        onChange=${e => { const f = e.target.files[0]; e.target.value = ''; suFile(f, 'importa_file'); }} />
      <input ref=${allegato} id="campo-allegato" type="file" class="campo-file" accept=".pdf,application/pdf,image/*"
        onChange=${e => { const f = e.target.files[0]; e.target.value = ''; suFile(f, 'file'); }} />
    </div>
    ${importa && html`<${Foglio} titolo="Importa" alChiudi=${() => setImporta(false)}>
      <div class="meta">Per ${codice} · ${ui.nome ? ui.nome.replace('­', '') : ''}. I file importati sono già sul telefono: non serve la copia di sicurezza.</div>
      <div class="elenco">
        <button class="voce collega" onClick=${() => { setImporta(false); rullino.current.click(); }}><span class="etichetta">Dal Rullino<span class="sotto">foto e video scattati con la Fotocamera dell'iPhone</span></span><span class="valore">›</span></button>
        <button class="voce collega" onClick=${() => { setImporta(false); daFile.current.click(); }}><span class="etichetta">Da File<span class="sotto">vocali (Memo vocali › Condividi › Salva in File), video e immagini salvati in File</span></span><span class="valore">›</span></button>
      </div>
      <div class="meta">La data di scatto si legge dal file, se c'è; altrimenti resta dichiarata «assente».</div>
    </${Foglio}>`}
    ${foglioCopie && html`<${FoglioCopie} pratica=${pratica} evidenze=${evidenze} momento=${foglioCopie.momento} mostra=${mostra}
      alChiudi=${() => setFoglioCopie(null)} alProsegui=${() => { const f = foglioCopie; setFoglioCopie(null); if (f.continua) f.continua(); }} />`}
    ${scelta && html`<${Foglio} titolo="Bene o componente" alChiudi=${() => setScelta(false)}>
      <div class="elenco">${beni.map(b => html`<button class="scelta" style=${{ paddingLeft: `${16 + b.livello * 22}px` }}
          onClick=${() => scegliBene(b)}>
        <span class=${`spunta ${b.codice === codice ? 'si' : ''}`}>${b.codice === codice ? '✓' : ''}</span>
        <span class="etichetta"><b>${b.codice}</b> ${b.nome}${b.nota && html`<span class="nota-scelta">${b.nota}</span>`}</span></button>`)}</div>
      <div class="meta">Passando fisicamente a un altro bene o componente, cambia subito il codice: l'evidenza prende il codice scelto qui. Una foto che vale per più beni si collega agli altri dal dettaglio dell'evidenza («Vale anche per altri beni»).</div>
    </${Foglio}>`}
  </div>`;
}

