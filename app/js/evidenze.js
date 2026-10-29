// Evidenze acquisite in campo: codice (B01-RO2-003), nome del file fissato all'acquisizione,
// impronta SHA-256 calcolata subito (hash contestuale, §2.7), data di scatto distinta dall'ora di acquisizione.
// Metadati nell'archivio «evidenze», file originale (Blob, mai modificato) nell'archivio «media».

import { transazione, leggi } from './archivio.js';
import { sha256 } from './importa.js';
import { dataScatto, isoLocale } from './metadati.js';
import { GRUPPI_UI, GRUPPI_BENE_NUOVO } from './stato.js';

const ESTENSIONI = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'video/quicktime': 'mov', 'video/mp4': 'mp4',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'application/pdf': 'pdf' };

export const beneDi = codice => codice.split('.')[0];

// Gruppi del bene (o del bene padre, per un componente B01.1)
export function gruppiPer(pratica, registri, codice) {
  const b = pratica.andata.beni.find(x => x.codice === beneDi(codice));
  if (b) return b.gruppiEvidenze;
  return GRUPPI_BENE_NUOVO;
}

// Primo progressivo libero per bene e requisito, tra le evidenze del telefono e quelle già nel fascicolo
export function prossimoId(pratica, evidenze, codice, requisito) {
  const usati = new Set([...pratica.andata.evidenzeEsistenti, ...evidenze.map(e => e.id),
    ...evidenze.flatMap(e => (e.storicoIdentificativi || []).map(s => s.id))]);
  for (let n = 1; n < 1000; n++) {
    const id = `${codice}-${requisito}-${String(n).padStart(3, '0')}`;
    if (!usati.has(id)) return id;
  }
  throw new Error('progressivo esaurito');
}

export function estensione(mime, nome = '') {
  return ESTENSIONI[(mime || '').split(';')[0]] || (nome.includes('.') ? nome.split('.').pop().toLowerCase() : 'bin');
}

// Registra una nuova evidenza. Restituisce la riga salvata.
// opzioni: { codice (bene o componente), gruppo, tipo, blob, nomeOriginale, durataSecondi, dataRegistrazione, descrizione, nota,
//   aperturaFotocamera e rientroFotocamera (Date) se il file viene dalla fotocamera aperta dall'app }
export async function registraEvidenza(pratica, evidenze, registri, o) {
  const ora = new Date();
  const bytes = new Uint8Array(await o.blob.arrayBuffer());
  const impronta = await sha256(bytes);
  const g = gruppiPer(pratica, registri, o.codice).find(x => x.gruppo === o.gruppo) || { requisiti: [GRUPPI_UI[o.gruppo].requisito] };
  const requisito = GRUPPI_UI[o.gruppo].requisito;
  const id = prossimoId(pratica, evidenze, o.codice, requisito);
  const mime = (o.blob.type || '').split(';')[0] || 'application/octet-stream';
  const giorno = isoLocale(ora).slice(0, 10).replace(/-/g, '');
  const nomeFile = `${pratica.codicePratica}_${giorno}_${id}.${estensione(mime, o.nomeOriginale)}`;

  let scatto = {};
  if (o.tipo === 'vocale') scatto = { origineDataScatto: 'registrazione_app', dataScatto: o.dataRegistrazione };
  else if (o.tipo === 'foto' || o.tipo === 'video') {
    const d = dataScatto(bytes, mime);
    if (d.origine === 'metadati' && Date.parse(d.data) <= ora.getTime() + 60000) scatto = { origineDataScatto: 'metadati', dataScatto: d.data };
    // Safari su iPhone toglie i metadati alle foto della fotocamera aperta da una pagina web:
    // lo scatto è avvenuto tra l'apertura della fotocamera e il rientro del file nell'app
    else if (o.aperturaFotocamera && o.rientroFotocamera) {
      scatto = { origineDataScatto: 'fotocamera_app', aperturaFotocamera: isoLocale(o.aperturaFotocamera), dataScatto: isoLocale(o.rientroFotocamera) };
    } else scatto = { origineDataScatto: 'assente' };
  }
  const requisiti = [...new Set([requisito, ...(g.requisiti || [])])];
  const riga = {
    codicePratica: pratica.codicePratica, id, beni: [o.codice], gruppo: o.gruppo, requisiti, tipo: o.tipo,
    file: `evidenze/${nomeFile}`, nomeFile, mime, sha256: impronta, byte: bytes.length, provenienza: 'perito',
    idSopralluogo: pratica.visita ? pratica.visita.id : pratica.andata.sopralluogo.id,
    acquisitaIl: isoLocale(ora), ...scatto,
    durataSecondi: o.durataSecondi, descrizione: o.descrizione || '', nota: o.nota || undefined,
    annotazioni: [], stato: 'valida', nomeOriginale: o.nomeOriginale,
  };
  await transazione(['evidenze', 'media'], 'readwrite', (se, sm) => {
    sm.put({ codicePratica: pratica.codicePratica, nomeFile, blob: o.blob, sha256: impronta });
    se.put(riga);
  });
  return riga;
}

export function aggiornaEvidenza(codicePratica, id, fn) {
  return transazione('evidenze', 'readwrite', s => {
    const r = s.get([codicePratica, id]);
    r.onsuccess = () => { const e = r.result; fn(e); e.modificataIl = isoLocale(new Date()); s.put(e); };
  });
}

// Le evidenze non si cancellano: si annullano con motivo e data, il file resta (§2.7)
export function annullaEvidenza(codicePratica, id, motivo, sostituitaDa) {
  return aggiornaEvidenza(codicePratica, id, e => {
    e.stato = 'annullata';
    e.annullamento = { motivo, data: isoLocale(new Date()), ...(sostituitaDa ? { sostituitaDa } : {}) };
  });
}

// Evidenza nel formato del pacchetto di rientro (schemi/v1, $defs/evidenza): solo i campi previsti
const CAMPI_RIENTRO = ['id', 'beni', 'comune', 'gruppo', 'requisiti', 'tipo', 'file', 'mime', 'sha256', 'provenienza', 'idSopralluogo',
  'acquisitaIl', 'dataScatto', 'origineDataScatto', 'aperturaFotocamera', 'dataMostrataAVideo', 'durataSecondi', 'descrizione', 'nota', 'annotazioni',
  'trascrizioni', 'contenutoLetto', 'storicoIdentificativi', 'stato', 'annullamento'];

export function evidenzaPerRientro(e) {
  const out = {};
  for (const k of CAMPI_RIENTRO) {
    const v = e[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length && k !== 'beni' && k !== 'requisiti')) continue;
    out[k] = v;
  }
  return out;
}

export async function leggiFile(codicePratica, nomeFile) {
  const r = await leggi('media', [codicePratica, nomeFile]);
  return r ? r.blob : null;
}

// Verifica che il file conservato abbia ancora l'impronta registrata
export async function verificaImpronta(evidenza) {
  const blob = await leggiFile(evidenza.codicePratica, evidenza.nomeFile);
  if (!blob) return false;
  return (await sha256(new Uint8Array(await blob.arrayBuffer()))) === evidenza.sha256;
}
