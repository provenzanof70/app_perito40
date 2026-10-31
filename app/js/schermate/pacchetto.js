// 1k · Pacchetto di rientro: checkpoint o finale, controllo con il validatore del PC, ZIP per volumi, «Salva in File».
// Il pacchetto si registra come consegnato solo quando il perito conferma di aver salvato tutti i volumi.

import { useState } from 'preact/hooks';
import { html, dataBreve, oraBreve, megabyte } from '../ui.js';
import { Foglio, Avviso, ElencoErrori } from '../componenti.js';
import { costruisciRientro, preparaEControlla, creaZip, registraEsportazione } from '../pacchetto.js';
import { registroSchemi } from '../importa.js';
import { leggiFile } from '../evidenze.js';
import { VERSIONE_APP } from '../app.js';

const mono = { wordBreak: 'break-all', fontFamily: 'ui-monospace, Menlo, monospace' };

function piattaforma() {
  const ua = navigator.userAgent;
  const ios = /iPhone OS ([\d_]+)/.exec(ua);
  return ios ? `iOS ${ios[1].replace(/_/g, '.')} Safari` : /Android/.test(ua) ? 'Android' : 'browser';
}

// Condivisione di sistema (su iPhone: «Salva in File», AirDrop, Mail…); senza, scaricamento del file.
// Va chiamata direttamente dal tocco: Safari apre il foglio di condivisione solo così.
function salvaInFile(z) {
  const file = new File([z.blob], z.nome, { type: 'application/zip' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    return navigator.share({ files: [file] }).then(() => true, e => e.name === 'AbortError' ? false : scarica(z));
  }
  return Promise.resolve(scarica(z));
}

function scarica(z) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(z.blob); a.download = z.nome;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return true;
}

function Contenuto({ doc, volumi }) {
  const righe = [
    ['Evidenze', doc.evidenze.length, `${volumi.reduce((s, v) => s + v.evidenze.length, 0)} file in questo pacchetto`],
    ['Verifiche dei dati agli atti', doc.verificheDati.length], ['Beni nuovi', doc.beniNuovi.length],
    ['Riscontri diretti', doc.riscontriDiretti.length], ['Dichiarazioni di terzi', doc.dichiarazioniTerzi.length],
    ['Note del perito', doc.noteCampo.length], ['Date rilevate', doc.dateRilevate.length],
    ['Nuove azioni', doc.nuoveAzioni.length], ['Esiti delle azioni aperte', doc.aggiornamentiAzioni.length],
  ];
  return html`<div class="elenco">${righe.map(([e, n, s]) => html`<div class="voce"><span class="etichetta">${e}${s && html`<span class="sotto">${s}</span>`}</span><span class="valore">${n}</span></div>`)}</div>`;
}

export function Pacchetto({ pratica, evidenze, registri, sistema, aggiorna, mostra }) {
  const [fase, setFase] = useState(null); // null | { tipo, costruito, esito, preparati, ora, zip, salvati, avanzamento, errore, ricreato }
  const [confermaFinale, setConfermaFinale] = useState(false);
  const esp = pratica.esportazioni || {};
  const trasmesse = esp.trasmesse || {};
  const rientrata = pratica.stato === 'rientrata';
  const nuove = evidenze.filter(e => !trasmesse[e.id]);
  const prossimo = (esp.numeroCheckpoint || 0) + 1;
  const finaleFatto = (esp.pacchetti || []).find(p => p.tipo === 'finale');

  async function prepara(tipo, ricrea = null) {
    setConfermaFinale(false);
    const ora = ricrea ? new Date(ricrea.ora) : new Date();
    setFase({ tipo, avanzamento: null });
    try {
      const costruito = costruisciRientro({ pratica, evidenze, registri, tipo, ora, versioneApp: VERSIONE_APP.split(' ')[0], piattaforma: piattaforma(),
        installata: sistema.installata, idRientro: ricrea ? ricrea.idRientro : undefined });
      const { esito, preparati } = await preparaEControlla(costruito, pratica, await registroSchemi());
      setFase({ tipo, costruito, esito, preparati, ora, zip: null, salvati: new Set(), ricreato: !!ricrea });
    } catch (e) {
      setFase({ tipo, errore: `Preparazione non riuscita: ${e.message}` });
    }
  }

  async function creaVolumi() {
    const f = fase;
    const zip = [];
    try {
      for (const [i, p] of f.preparati.entries()) {
        const z = await creaZip(p, f.costruito.dataOraZip, e => leggiFile(e.codicePratica, e.nomeFile),
          x => setFase(s => ({ ...s, avanzamento: (i + x) / f.preparati.length })));
        zip.push({ nome: p.nome, byte: p.byte, evidenze: p.evidenze.length, ...z });
      }
      setFase(s => ({ ...s, zip, avanzamento: null }));
    } catch (e) {
      setFase(s => ({ ...s, avanzamento: null, errore: `ZIP non creato: ${e.message}` }));
    }
  }

  async function salva(z) {
    const ok = await salvaInFile(z);
    if (ok) setFase(s => ({ ...s, salvati: new Set([...s.salvati, z.nome]) }));
  }

  async function concludi() {
    const f = fase;
    if (!f.ricreato) {
      await aggiorna(pratica.codicePratica, p => {
        registraEsportazione(p, f.costruito, f.tipo, f.ora, f.zip, evidenze.length);
      });
    }
    mostra(f.tipo === 'finale' ? (f.ricreato ? 'Pacchetto finale ricreato' : 'Raccolta chiusa: la pratica resta consultabile in sola lettura')
      : `Checkpoint ${f.costruito.numero} registrato`);
    setFase(null);
  }

  if (fase) {
    const f = fase;
    const titolo = f.tipo === 'finale' ? 'Pacchetto finale' : `Checkpoint ${f.costruito ? f.costruito.numero : prossimo}`;
    if (f.errore) return html`<div class="sezione">${titolo}</div>
      <${Avviso} tipo="errore" tasti=${[['Indietro', () => setFase(null)]]}>${f.errore}</${Avviso}>`;
    if (!f.costruito) return html`<div class="sezione">${titolo}</div><div class="meta">Preparazione e controllo del pacchetto…</div>`;
    const { esito, costruito } = f;
    const bloccato = esito.errori.length > 0;
    const tutti = f.zip && f.zip.every(z => f.salvati.has(z.nome));
    return html`
      <div class="sezione">${titolo}</div>
      ${bloccato
        ? html`<${Avviso} tipo="errore" titolo="Il pacchetto non supera i controlli">Lo stesso controllo verrà fatto sul PC: correggi prima di esportare.<${ElencoErrori} voci=${esito.errori} /></${Avviso}>`
        : html`<${Avviso} tipo="info" titolo="Controlli superati">${esito.avvisi.length ? `${esito.avvisi.length} avvisi, da vedere sul PC all'importazione:` : 'Nessun avviso.'}
            ${esito.avvisi.length ? html`<${ElencoErrori} voci=${esito.avvisi} max=${8} />` : null}</${Avviso}>`}
      <${Contenuto} doc=${costruito.doc} volumi=${costruito.volumi} />
      ${!bloccato && !f.zip && html`<div class="scheda">
        <div class="meta">${costruito.volumi.length > 1 ? `${costruito.volumi.length} volumi da al massimo 250 MB` : '1 volume'} · ${megabyte(costruito.volumi.reduce((s, v) => s + v.byte, 0))} di file. Ogni file viene riletto e confrontato con l'impronta registrata all'acquisizione.</div>
        ${f.avanzamento != null
          ? html`<div class="meta">Creazione ZIP… ${Math.round(f.avanzamento * 100)}%</div>`
          : html`<button class="secondario pieno" style=${{ alignSelf: 'flex-start' }} onClick=${creaVolumi}>Crea ZIP</button>`}
      </div>`}
      ${f.zip && html`
        <div class="sezione">Volumi</div>
        <div class="elenco">${f.zip.map(z => html`<div class="voce">
          <span class="etichetta">${z.nome}<span class="sotto">${megabyte(z.byte)} · ${z.evidenze} file · SHA-256</span><span class="sotto" style=${mono}>${z.sha256}</span></span>
          <button class=${`secondario piccolo ${f.salvati.has(z.nome) ? '' : 'pieno'}`} onClick=${() => salva(z)}>${f.salvati.has(z.nome) ? 'Salvato ✓' : 'Salva in File'}</button>
        </div>`)}</div>
        <div class="meta">Scegli «Salva in File» e la cartella della pratica (ad esempio in OneDrive). Il telefono conserva comunque tutti i dati.</div>
        <button class="primario" disabled=${!tutti} onClick=${concludi}>${f.tipo === 'finale' && !f.ricreato ? 'Ho salvato tutto: chiudi la raccolta' : 'Ho salvato tutti i volumi'}</button>`}
      <button class="collegamento" onClick=${() => setFase(null)}>Annulla</button>`;
  }

  return html`
    ${!pratica.visita && html`<${Avviso} tipo="info">Il pacchetto di rientro si crea a visita iniziata: porta data, ora e presenti del sopralluogo.</${Avviso}>`}
    ${pratica.visita && !rientrata && html`
      <div class="sezione">Nuovo pacchetto</div>
      <div class="elenco">
        <div class="voce"><span class="etichetta">Evidenze raccolte</span><span class="valore">${evidenze.length}</span></div>
        <div class="voce"><span class="etichetta">Da consegnare<span class="sotto">file non ancora in un checkpoint salvato</span></span><span class="valore">${nuove.length} · ${megabyte(nuove.reduce((s, e) => s + e.byte, 0))}</span></div>
      </div>
      <div class="scheda">
        <b>Checkpoint ${prossimo}</b>
        <div class="meta">Mette al sicuro quanto raccolto: stato completo della visita e solo i file nuovi. La raccolta continua.</div>
        <button class="secondario pieno" style=${{ alignSelf: 'flex-start' }} onClick=${() => prepara('checkpoint')}>Crea checkpoint</button>
      </div>
      <div class="scheda">
        <b>Pacchetto finale</b>
        <div class="meta">Tutti i file e tutti gli esiti. Dopo il salvataggio la visita si chiude e la pratica resta in sola lettura.</div>
        <button class="secondario" style=${{ alignSelf: 'flex-start' }} onClick=${() => setConfermaFinale(true)}>Crea pacchetto finale</button>
      </div>`}
    ${rientrata && html`<${Avviso} tipo="info" titolo="Raccolta chiusa">Visita chiusa alle ${oraBreve(pratica.visita.chiusaIl)} del ${dataBreve(pratica.visita.chiusaIl)}. La pratica è in sola lettura.</${Avviso}>
      ${finaleFatto && finaleFatto.ora && html`<button class="secondario" style=${{ alignSelf: 'flex-start' }} onClick=${() => prepara('finale', finaleFatto)}>Ricrea il pacchetto finale</button>
        <div class="meta">Se un file è andato perso: stesso contenuto, stesso identificativo e stessa data del pacchetto salvato.</div>`}`}
    ${(esp.pacchetti || []).length > 0 && html`
      <div class="sezione">Pacchetti salvati</div>
      <div class="elenco">${[...esp.pacchetti].reverse().map(p => html`<div class="voce"><span class="etichetta">${p.tipo === 'finale' ? 'Finale' : `Checkpoint ${p.numero}`} · ${oraBreve(p.ora || p.creatoIl)} del ${dataBreve(p.ora || p.creatoIl)}
        ${p.volumi.map(v => html`<span class="sotto">${v.nome} · ${megabyte(v.byte)}</span><span class="sotto" style=${mono}>${v.sha256}</span>`)}</span></div>`)}</div>`}
    ${confermaFinale && html`<${Foglio} titolo="Pacchetto finale" annulla="Annulla" conferma="Prepara" alChiudi=${() => setConfermaFinale(false)} alConferma=${() => prepara('finale')}>
      <div class="meta">Il pacchetto finale chiude la raccolta: dopo averlo salvato non si potranno più aggiungere evidenze, verifiche o note a questa visita. Prima del salvataggio puoi ancora annullare.</div>
      ${nuove.length < evidenze.length ? html`<div class="meta">Contiene anche i ${evidenze.length - nuove.length} file già consegnati nei checkpoint: il finale è completo da solo.</div>` : null}
    </${Foglio}>`}`;
}
