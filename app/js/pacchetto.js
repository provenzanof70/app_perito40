// Pacchetto di rientro (schemi/v1, perizia40-rientro): costruzione, divisione in volumi, controllo con il
// validatore del PC (strumenti/lib/validatore.mjs) e ZIP. Nessuna dipendenza dall'interfaccia: provato in Node.
//
// Checkpoint: stato completo, ma solo i file non ancora consegnati nei checkpoint precedenti (gli altri restano nel
// manifesto con trasmessaInCheckpoint). Finale: tutti i file, la raccolta si chiude.

import { evidenzaPerRientro } from './evidenze.js';
import { riscontroPerRientro, dichiarazionePerRientro, notaPerRientro, bozzaPerRientro, aggiornamentoPerRientro, dataPerRientro } from './registri.js';
import { isoLocale } from './metadati.js';
import { oggi } from './tempo.js';
import { scriviZipBlob } from '../../strumenti/lib/zip.mjs';
import { nuovoEsito, validaStruttura, controllaRiservatezza, controllaVolumeRientro, controllaVolumi } from '../../strumenti/lib/validatore.mjs';

export const VERSIONE_SCHEMA = '1.4.0';
export const SOGLIA_VOLUME = 250e6;

const due = n => String(n).padStart(2, '0');
const hhmm = d => `${due(d.getHours())}:${due(d.getMinutes())}`;
const perId = (a, b) => a.id.localeCompare(b.id);

export async function sha256Hex(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('');
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Distribuisce i file nei volumi in ordine di acquisizione, senza superare la soglia (un file più grande sta da solo)
export function dividiInVolumi(file, soglia = SOGLIA_VOLUME) {
  const volumi = [[]];
  let peso = 0;
  for (const f of file) {
    if (peso > 0 && peso + f.byte > soglia) { volumi.push([]); peso = 0; }
    volumi[volumi.length - 1].push(f);
    peso += f.byte;
  }
  return volumi;
}

// o: { pratica, evidenze, registri, tipo: 'checkpoint'|'finale', ora: Date, versioneApp, piattaforma, installata, idRientro? }
export function costruisciRientro(o) {
  const { pratica, registri, tipo } = o;
  const a = pratica.andata;
  const esp = pratica.esportazioni || {};
  const trasmesse = tipo === 'checkpoint' ? (esp.trasmesse || {}) : {};
  const numero = tipo === 'checkpoint' ? (esp.numeroCheckpoint || 0) + 1 : undefined;
  const ora = o.ora;
  const evidenze = [...o.evidenze].sort((x, y) => x.acquisitaIl.localeCompare(y.acquisitaIl) || x.id.localeCompare(y.id));
  const daInviare = evidenze.filter(e => !trasmesse[e.id]);
  const gruppi = dividiInVolumi(daInviare.map(e => ({ id: e.id, byte: e.byte })), o.soglia || SOGLIA_VOLUME);
  const volumeDi = new Map();
  gruppi.forEach((g, i) => g.forEach(f => volumeDi.set(f.id, i + 1)));
  const totale = gruppi.length;

  const v = pratica.visita;
  const inizio = new Date(v.inizio);
  const doc = {
    formato: 'perizia40.rientro', versioneSchema: VERSIONE_SCHEMA, demo: a.demo === true,
    idRientro: o.idRientro || uuid(), tipoPacchetto: tipo, ...(numero ? { numeroCheckpoint: numero } : {}),
    volume: { numero: 1, totale },
    andata: { idAndata: a.idAndata, revisione: a.revisione, sha256: pratica.andataSha256 },
    codicePratica: a.codicePratica,
    app: { versione: o.versioneApp, piattaforma: o.piattaforma, installata: !!o.installata },
    creatoIl: isoLocale(ora), fusoOrario: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome',
    sopralluogo: {
      id: v.id, data: oggi(inizio), inizio: hhmm(inizio), ...(tipo === 'finale' ? { fine: hhmm(ora) } : {}),
      presenti: a.sopralluogo.referenti.filter(r => v.presenti.includes(r.id)),
    },
    beniNuovi: [...registri.beneNuovo.values()].sort((x, y) => x.codice.localeCompare(y.codice)).map(b => Object.fromEntries(
      ['codice', 'denominazione', 'funzione', 'ubicazione', 'matricolaTarga', 'componenti', 'nota'].filter(k => b[k] !== undefined && b[k] !== '').map(k => [k, b[k]]))),
    evidenze: evidenze.map(evidenzaPerRientro),
    verificheDati: [...registri.verifica.values()].sort((x, y) => x.id.localeCompare(y.id)).map(x => Object.fromEntries(
      ['bene', 'campo', 'valoreAgliAtti', 'esito', 'valoreRilevato', 'evidenze', 'data', 'nota'].filter(k => x[k] !== undefined && x[k] !== '').map(k => [k, x[k]]))),
    riscontriDiretti: [...registri.riscontro.values()].sort(perId).map(riscontroPerRientro),
    dichiarazioniTerzi: [...registri.dichiarazione.values()].sort(perId).map(dichiarazionePerRientro),
    noteCampo: [...registri.nota.values()].sort(perId).map(notaPerRientro),
    dateRilevate: [...registri.data.values()].sort(perId).map(dataPerRientro),
    nuoveAzioni: [...registri.azione.values()].sort(perId).map(bozzaPerRientro),
    aggiornamentiAzioni: [...registri.aggiornamento.values()].sort((x, y) => x.idAzione.localeCompare(y.idAzione)).map(aggiornamentoPerRientro),
    manifesto: evidenze.map(e => ({
      idEvidenza: e.id, file: e.file, sha256: e.sha256, byte: e.byte, dataAcquisizione: e.acquisitaIl, provenienza: e.provenienza, hash: 'C',
      marcaTemporale: { tipo: 'n/a' }, ...(trasmesse[e.id] ? { trasmessaInCheckpoint: trasmesse[e.id] } : { volume: volumeDi.get(e.id) }),
    })),
  };
  const timbro = `${oggi(ora).replace(/-/g, '')}-${due(ora.getHours())}${due(ora.getMinutes())}`;
  const sigla = tipo === 'finale' ? 'FIN' : `CHK${numero}`;
  const volumi = gruppi.map((g, i) => ({
    numero: i + 1, totale,
    nome: `${a.codicePratica}_rientro_${sigla}_${timbro}${totale > 1 ? `_v${i + 1}di${totale}` : ''}.zip`,
    doc: { ...doc, volume: { numero: i + 1, totale } },
    evidenze: g.map(f => evidenze.find(e => e.id === f.id)),
    byte: g.reduce((s, f) => s + f.byte, 0),
  }));
  return { doc, volumi, numero, daInviare: daInviare.map(e => e.id), dataOraZip: `${oggi(ora)}T${hhmm(ora)}:00` };
}

// Prepara i byte del JSON e del file hash.sha256 di ogni volume e li controlla con il validatore.
// registro: schemi caricati (creaRegistroSchemi). Restituisce { esito, preparati }.
export async function preparaEControlla(costruito, pratica, registro) {
  const enc = new TextEncoder();
  const esito = nuovoEsito();
  const preparati = [];
  for (const vol of costruito.volumi) {
    const json = enc.encode(JSON.stringify(vol.doc, null, 2) + '\n');
    const shaJson = await sha256Hex(json);
    const righe = [`${shaJson}  perizia40-rientro.json`, ...vol.evidenze.map(e => `${e.sha256}  ${e.file}`)];
    const hash = enc.encode(righe.join('\n') + '\n');
    const file = new Map([['perizia40-rientro.json', { sha256: shaJson, byte: json.length }], ['hash.sha256', { sha256: await sha256Hex(hash), byte: hash.length }]]);
    for (const e of vol.evidenze) file.set(e.file, { sha256: e.sha256, byte: e.byte });
    if (vol.numero === 1) {
      validaStruttura(vol.doc, registro, esito, vol.nome);
      controllaRiservatezza(vol.doc, esito, vol.nome, { demo: vol.doc.demo });
    }
    controllaVolumeRientro({ doc: vol.doc, file, hashSha256: new TextDecoder().decode(hash) }, { doc: pratica.andata, sha256: pratica.andataSha256 }, esito, vol.nome, { soloFile: vol.numero > 1 });
    preparati.push({ ...vol, json, hash, shaJson });
  }
  controllaVolumi(costruito.volumi.map(v => ({ doc: v.doc, dove: v.nome })), esito);
  return { esito, preparati };
}

// Crea lo ZIP di un volume. leggiFile(evidenza) → Blob del file originale. Ricalcola l'impronta di ogni file
// mentre lo legge: se non corrisponde a quella registrata all'acquisizione, si ferma.
export async function creaZip(preparato, dataOra, leggiFile, avanzamento = () => {}) {
  const voci = [{ nome: 'perizia40-rientro.json', dati: preparato.json }, { nome: 'hash.sha256', dati: preparato.hash }];
  for (const e of preparato.evidenze) {
    const blob = await leggiFile(e);
    if (!blob) throw new Error(`${e.id}: file non trovato sul telefono`);
    voci.push({ nome: e.file, dati: blob, attesa: e.sha256, id: e.id });
  }
  let fatti = 0;
  const zip = await scriviZipBlob(voci, dataOra, async (nome, bytes) => {
    const v = voci.find(x => x.nome === nome);
    if (v.attesa && (await sha256Hex(bytes)) !== v.attesa) throw new Error(`${v.id}: il file non corrisponde più all'impronta registrata all'acquisizione`);
    avanzamento(++fatti / voci.length);
  });
  const sha = await sha256Hex(new Uint8Array(await zip.arrayBuffer()));
  return { blob: zip, sha256: sha, byte: zip.size };
}

// Aggiornamento della pratica dopo il salvataggio di un pacchetto
export function registraEsportazione(p, costruito, tipo, ora, zip, numEvidenze) {
  const esp = p.esportazioni || {};
  const trasmesse = { ...(esp.trasmesse || {}) };
  if (tipo === 'checkpoint') for (const id of costruito.daInviare) trasmesse[id] = costruito.numero;
  p.esportazioni = {
    ...esp,
    numeroCheckpoint: tipo === 'checkpoint' ? costruito.numero : (esp.numeroCheckpoint || 0),
    trasmesse,
    ultimo: { data: ora.toISOString(), tipo, numero: costruito.numero, evidenze: numEvidenze },
    pacchetti: [...(esp.pacchetti || []), {
      tipo, numero: costruito.numero, idRientro: costruito.doc.idRientro, creatoIl: costruito.doc.creatoIl, ora: ora.toISOString(),
      volumi: zip.map(z => ({ nome: z.nome, sha256: z.sha256, byte: z.byte })),
    }],
  };
  if (tipo === 'finale') {
    p.stato = 'rientrata';
    p.visita = { ...p.visita, chiusaIl: ora.toISOString() };
  }
  p.promemoria = { ...(p.promemoria || {}), rinviatoFino: null };
}
