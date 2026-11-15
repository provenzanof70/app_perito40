// Foglio delle copie di sicurezza mancanti: salvataggio con un tocco per gruppo (Rullino, File) e, se si deve proseguire,
// motivo obbligatorio registrato su ogni evidenza senza copia (cambio di bene, checkpoint, chiusura della visita).

import { useState, useEffect } from 'preact/hooks';
import { html } from '../ui.js';
import { Foglio } from '../componenti.js';
import { copieMancanti, perRullino, preparaFile, condividi, segnaFatte, registraRinuncia, android } from '../copie.js';

const MOMENTI = { cambio_bene: 'Prima di passare a un altro bene', checkpoint: 'Prima del checkpoint', chiusura: 'Prima di chiudere la visita' };

export function FoglioCopie({ pratica, evidenze, momento, alChiudi, alProsegui, mostra }) {
  const [pronti, setPronti] = useState(null);
  const [salvate, setSalvate] = useState(new Set());
  const [rinuncia, setRinuncia] = useState(null);
  useEffect(() => { preparaFile(copieMancanti(evidenze)).then(setPronti); }, []);
  const restano = (pronti || []).filter(x => !salvate.has(x.evidenza.id));
  // su Android tutto si scarica nella cartella Download con un tocco; su iPhone due gruppi (Rullino, File)
  const gruppi = android ? [['Telefono', 'Foto, video, vocali e documenti', restano]]
    : [['Rullino', 'Foto e video', restano.filter(x => perRullino(x.evidenza))], ['File', 'Vocali e documenti', restano.filter(x => !perRullino(x.evidenza))]];

  // il tocco apre subito la condivisione: i file sono già pronti
  async function salva(lista, modo = 'auto') {
    const esito = await condividi(lista.map(x => x.file), modo);
    if (!esito) return;
    const ids = lista.map(x => x.evidenza.id);
    await segnaFatte(pratica.codicePratica, ids, esito);
    setSalvate(s => new Set([...s, ...ids]));
    dispatchEvent(new Event('perito40:ricarica'));
    mostra(`${ids.length === 1 ? 'Copia di sicurezza salvata' : `${ids.length} copie di sicurezza salvate`}`);
  }
  async function prosegui() {
    await registraRinuncia(pratica.codicePratica, restano.map(x => x.evidenza.id), momento, rinuncia.trim());
    dispatchEvent(new Event('perito40:ricarica'));
    alProsegui();
  }

  return html`<${Foglio} titolo="Copie di sicurezza" annulla=${momento ? 'Annulla' : 'Chiudi'} alChiudi=${alChiudi}
      conferma=${momento && !restano.length && pronti ? 'Prosegui' : null} alConferma=${alProsegui}>
    ${momento && html`<div class="meta"><b>${MOMENTI[momento]}</b></div>`}
    ${!pronti ? html`<div class="meta">Preparazione dei file…</div>`
      : !restano.length ? html`<div class="meta">Tutte le evidenze hanno una copia di sicurezza sul telefono.</div>`
      : html`<div class="meta">${restano.length === 1 ? "1 evidenza esiste" : `${restano.length} evidenze esistono`} solo nell'archivio dell'app. I rilievi sono irripetibili: salva una copia sul telefono.
          Fa fede l'originale dell'app con la sua impronta; la copia serve se il telefono perde i dati dell'app.</div>
        ${gruppi.filter(g => g[2].length).map(([dove, cosa, lista]) => html`<div class="scheda">
          <b>${cosa} · ${lista.length}</b>
          <div class="meta">${dove === 'Telefono' ? 'Si scaricano nella cartella Download del telefono: foto e video compaiono anche in Galleria e in Google Foto, tra le cartelle del dispositivo. Se Chrome chiede di consentire più download, rispondi sì.'
            : dove === 'Rullino' ? 'Nel foglio di iOS scegli «Salva immagine» o «Salva video»: finiscono nel Rullino.' : 'Nel foglio di iOS scegli «Salva in File» e una cartella, per esempio quella della pratica.'}</div>
          <div class="meta">${lista.map(x => x.evidenza.id).join(' · ')}</div>
          <button class="primario" style=${{ alignSelf: 'flex-start' }} onClick=${() => salva(lista)}>${dove === 'Telefono' ? `Scarica ${lista.length === 1 ? 'la copia' : `le ${lista.length} copie`} nel telefono` : `Salva ${lista.length === 1 ? 'la copia' : `${lista.length} copie`} ${dove === 'Rullino' ? 'nel Rullino' : 'in File'}`}</button>
          ${dove === 'Telefono' && html`<button class="collegamento" style=${{ alignSelf: 'flex-start' }} onClick=${() => salva(lista, 'condividi')}>Condividi… (es. Drive)</button>`}
        </div>`)}
        ${momento && (rinuncia === null
          ? html`<button class="collegamento rosso" style=${{ alignSelf: 'flex-start' }} onClick=${() => setRinuncia('')}>Prosegui senza copia…</button>`
          : html`<div class="scheda">
              <b>Prosegui senza copia</b>
              <div class="meta">Il motivo resta scritto su ${restano.length === 1 ? "l'evidenza" : `ognuna delle ${restano.length} evidenze`} e arriva nel pacchetto di rientro.</div>
              <textarea class="campo-testo area" rows="2" placeholder="Motivo (obbligatorio), es. spazio esaurito sul telefono" value=${rinuncia} onInput=${e => setRinuncia(e.target.value)} />
              <button class="secondario rosso" style=${{ alignSelf: 'flex-start' }} disabled=${!rinuncia.trim()} onClick=${prosegui}>Registra il motivo e prosegui</button>
            </div>`)}`}
  </${Foglio}>`;
}
