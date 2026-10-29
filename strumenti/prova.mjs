#!/usr/bin/env node
// Prova del validatore: la pratica DEMO deve passare senza errori e ogni caso di demo/casi_errati/casi.json
// deve produrre gli errori attesi. Uso: node strumenti/prova.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { caricaSchemi, caricaCartella, validaCaricata } from './lib/disco.mjs';
import { scriviZip, leggiZip } from './lib/zip.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const fileCasi = join(RADICE, 'demo', 'casi_errati', 'casi.json');
const { pratica, casi } = JSON.parse(readFileSync(fileCasi, 'utf8'));
const cartella = resolve(dirname(fileCasi), pratica);

const registro = caricaSchemi();
const base = caricaCartella(cartella);
const volumi = readdirSync(join(cartella, 'rientro')).sort();
const espandi = p => p.replace('{vol1}', `rientro/${volumi[0]}`).replace('{vol2}', `rientro/${volumi[1]}`);

function applica(doc, puntatore, m) {
  const parti = puntatore.split('/').slice(1);
  const ultima = parti.pop();
  let nodo = doc;
  for (const p of parti) {
    nodo = nodo[p];
    if (nodo === undefined) throw new Error(`puntatore non trovato: ${puntatore}`);
  }
  if (m.elimina) {
    if (!(ultima in nodo)) throw new Error(`puntatore non trovato: ${puntatore}`);
    if (Array.isArray(nodo)) nodo.splice(Number(ultima), 1); else delete nodo[ultima];
  } else nodo[ultima] = m.valore;
}

let falliti = 0;
let prove = 0;
const verifica = (nome, ok) => { prove++; if (!ok) falliti++; console.log(`${ok ? 'ok      ' : 'FALLITO '} ${nome}`); };

// Libreria ZIP: andata e ritorno, nomi UTF-8, archivio danneggiato
{
  const enc = new TextEncoder();
  const voci = [{ nome: 'perizia40-rientro.json', dati: enc.encode('{"demo":true}') }, { nome: 'evidenze/però.png', dati: new Uint8Array(5000).fill(9) }];
  const zip = scriviZip(voci, '2026-10-15T17:30:00');
  const letto = leggiZip(zip, inflateRawSync);
  verifica('ZIP: lettura di ciò che si è scritto', letto.size === 2 && letto.get('evidenze/però.png').length === 5000);
  const rotto = zip.slice(); rotto[60] ^= 0xff;
  let errore = '';
  try { leggiZip(rotto, inflateRawSync); } catch (e) { errore = e.message; }
  verifica('ZIP: contenuto alterato rilevato dal CRC', /CRC/.test(errore));
  errore = '';
  try { leggiZip(zip.slice(0, zip.length - 30), inflateRawSync); } catch (e) { errore = e.message; }
  verifica('ZIP: archivio troncato rifiutato', errore !== '');
}

// App: promemoria di checkpoint (2 ore o 30 evidenze dall'ultimo pacchetto o dall'inizio visita)
{
  const { statoCheckpoint } = await import('../app/js/promemoria.js');
  const ora = new Date('2026-10-15T12:00:00+02:00');
  const p = (inizio, ultimo = null, rinviatoFino = null) => ({ visita: { inizio }, esportazioni: { ultimo }, promemoria: { rinviatoFino } });
  verifica('Checkpoint: nessun promemoria prima dell\'inizio visita', !statoCheckpoint({ visita: null, esportazioni: { ultimo: null }, promemoria: {} }, 99, ora).dovuto);
  verifica('Checkpoint: dovuto dopo 2 ore dall\'inizio visita', statoCheckpoint(p('2026-10-15T09:59:00+02:00'), 3, ora).motivo === 'tempo');
  verifica('Checkpoint: non dovuto a 1 h 59 min', !statoCheckpoint(p('2026-10-15T10:01:00+02:00'), 3, ora).dovuto);
  verifica('Checkpoint: dovuto a 30 evidenze dall\'ultimo pacchetto', statoCheckpoint(p('2026-10-15T09:00:00+02:00', { data: '2026-10-15T11:30:00+02:00', evidenze: 10 }), 40, ora).motivo === 'evidenze');
  verifica('Checkpoint: non dovuto a 29 evidenze e 30 minuti', !statoCheckpoint(p('2026-10-15T09:00:00+02:00', { data: '2026-10-15T11:30:00+02:00', evidenze: 10 }), 39, ora).dovuto);
  verifica('Checkpoint: «più tardi» sospende il promemoria', !statoCheckpoint(p('2026-10-15T09:00:00+02:00', null, '2026-10-15T12:20:00+02:00'), 3, ora).dovuto);
}

// App: data di scatto dai metadati (EXIF per le foto, mvhd per i video), mai inventata
{
  const { dataScatto, dataScattoJpeg, dataScattoVideo } = await import('../app/js/metadati.js');
  const jpeg = (le, data, scarto) => {
    const u16 = n => le ? [n & 255, n >> 8] : [n >> 8, n & 255];
    const u32 = n => le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
    const asc = s => [...Buffer.from(s + '\0', 'latin1')];
    const voci = scarto ? 2 : 1;
    const exifIfd = 26, dati = exifIfd + 2 + voci * 12 + 4;
    const t = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8),
      ...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd), ...u32(0),
      ...u16(voci), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(dati),
      ...(scarto ? [...u16(0x9011), ...u16(2), ...u32(7), ...u32(dati + 20)] : []), ...u32(0),
      ...asc(data), ...(scarto ? asc(scarto) : [])];
    const app1 = [...Buffer.from('Exif\0\0', 'latin1'), ...t];
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xd9]);
  };
  verifica('Metadati: EXIF big-endian con fuso', dataScattoJpeg(jpeg(false, '2026:10:15 10:42:07', '+02:00')) === '2026-10-15T10:42:07+02:00');
  verifica('Metadati: EXIF little-endian con fuso', dataScattoJpeg(jpeg(true, '2026:10:15 10:42:07', '+01:00')) === '2026-10-15T10:42:07+01:00');
  verifica('Metadati: EXIF senza fuso usa quello del dispositivo', /^2026-10-15T10:42:07[+-]\d{2}:\d{2}$/.test(dataScattoJpeg(jpeg(false, '2026:10:15 10:42:07'))));
  verifica('Metadati: EXIF azzerato dichiarato assente', dataScatto(jpeg(false, '0000:00:00 00:00:00'), 'image/jpeg').origine === 'assente');
  verifica('Metadati: PNG senza EXIF dichiarato assente', dataScatto(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), 'image/png').origine === 'assente');
  const video = secondi => {
    const b = Buffer.alloc(8 + 8 + 8 + 100);
    b.writeUInt32BE(8, 0); b.write('ftyp', 4);
    b.writeUInt32BE(8 + 8 + 100, 8); b.write('moov', 12);
    b.writeUInt32BE(108, 16); b.write('mvhd', 20); b[24] = 0; b.writeUInt32BE(secondi, 28);
    return new Uint8Array(b);
  };
  const s1904 = (Date.parse('2026-10-15T08:55:00Z') - Date.UTC(1904, 0, 1)) / 1000;
  const v = dataScattoVideo(video(s1904));
  verifica('Metadati: video MOV/MP4 da mvhd', !!v && Date.parse(v) === Date.parse('2026-10-15T08:55:00Z'));
  verifica('Metadati: video con data zero dichiarato assente', dataScatto(video(0), 'video/quicktime').origine === 'assente');
}

// App: un'evidenza come la registra il telefono, convertita per il rientro, rispetta lo schema 1.1
{
  globalThis.indexedDB ??= {};
  const { evidenzaPerRientro } = await import('../app/js/evidenze.js');
  const { creaRegistroSchemi, validaStruttura, nuovoEsito } = await import('./lib/validatore.mjs');
  const { leggiZip } = await import('./lib/zip.mjs');
  const reg = creaRegistroSchemi(readdirSync(join(RADICE, 'schemi', 'v1')).map(f => JSON.parse(readFileSync(join(RADICE, 'schemi', 'v1', f), 'utf8'))));
  const zipVol = readdirSync(join(cartella, 'rientro')).sort()[0];
  const rientro = JSON.parse(Buffer.from(leggiZip(readFileSync(join(cartella, 'rientro', zipVol)), inflateRawSync).get('perizia40-rientro.json')).toString('utf8'));
  const dalTelefono = {
    codicePratica: 'DEMO-2026-001', id: 'B01-ID-009', beni: ['B01'], gruppo: 2, requisiti: ['ID', 'RO5'], tipo: 'foto',
    file: 'evidenze/DEMO-2026-001_20261015_B01-ID-009.jpg', nomeFile: 'DEMO-2026-001_20261015_B01-ID-009.jpg', mime: 'image/jpeg',
    sha256: 'a'.repeat(64), byte: 1234, provenienza: 'perito', idSopralluogo: 'S01', acquisitaIl: '2026-10-15T10:09:20+02:00',
    origineDataScatto: 'assente', descrizione: 'Targa CE di B01', nota: undefined, nomeOriginale: 'IMG_0001.jpeg',
    annotazioni: [{ tipo: 'freccia', colore: '#FF453A', x: 0.2, y: 0.8, x2: 0.5, y2: 0.5 }, { tipo: 'cerchio', colore: '#FFD60A', x: 0.3, y: 0.4, w: 0.4, h: 0.2 },
      { tipo: 'testo', colore: '#FFFFFF', x: 0.25, y: 0.3, testo: 'matricola' }],
    dataMostrataAVideo: { valore: '15/10/2026 09:09', orologioErrato: true }, stato: 'valida',
  };
  const e = evidenzaPerRientro(dalTelefono);
  rientro.evidenze.push(e);
  rientro.manifesto.push({ idEvidenza: e.id, file: e.file, sha256: e.sha256, byte: 1234, dataAcquisizione: e.acquisitaIl, provenienza: 'perito', hash: 'C', marcaTemporale: { tipo: 'n/a' }, volume: 1 });
  const es = nuovoEsito();
  verifica('App: evidenza del telefono valida per lo schema del rientro', validaStruttura(rientro, reg, es, 'rientro') || (console.log(es.errori), false));
  const f = evidenzaPerRientro({ ...dalTelefono, id: 'B01-ID-010', origineDataScatto: 'fotocamera_app', aperturaFotocamera: '2026-10-15T10:08:50+02:00', dataScatto: '2026-10-15T10:09:12+02:00' });
  rientro.evidenze.push(f);
  rientro.manifesto.push({ idEvidenza: f.id, file: f.file, sha256: f.sha256, byte: 1234, dataAcquisizione: f.acquisitaIl, provenienza: 'perito', hash: 'C', marcaTemporale: { tipo: 'n/a' }, volume: 1 });
  const es2 = nuovoEsito();
  verifica('App: foto dalla fotocamera dell\'app (senza metadati) valida per lo schema 1.2', validaStruttura(rientro, reg, es2, 'rientro') || (console.log(es2.errori), false));

  // Registri creati dall'app (F2.4): riscontro, dichiarazione con «Da acquisire», nota, bozza di azione
  const R = await import('../app/js/registri.js');
  const andataDemo = JSON.parse(readFileSync(join(cartella, 'andata', 'perizia40-andata.json'), 'utf8'));
  const vuoti = R.perTipo([]);
  verifica('App: codici dei registri senza collisioni con il fascicolo (DT-001 e A001–A003 già usati)',
    R.prossimoId(andataDemo, vuoti, 'riscontro') === 'RD-001' && R.prossimoId(andataDemo, vuoti, 'dichiarazione') === 'DT-002' && R.prossimoId(andataDemo, vuoti, 'azione') === 'A004');
  const frase = R.fraseRiscontro({ fatto: 'il programma P-17 risultava caricato', oggetto: 'HMI del CN', circostanza: 'osservato durante la lavorazione', bene: 'B01', ora: '10:42', data: '2026-10-15' });
  verifica('App: frase verbalizzata con fatto, oggetto, circostanza, ora e data',
    frase === 'Il programma P-17 risultava caricato (HMI del CN, bene B01), osservato durante la lavorazione, alle ore 10:42 del 15/10/2026.');
  const app = JSON.parse(JSON.stringify(rientro));
  app.riscontriDiretti = [R.riscontroPerRientro({ codicePratica: 'X', tipo: 'riscontro', id: 'RD-003', bene: 'B01', requisito: 'RO2', idSopralluogo: 'S01', dataVisita: '2026-10-15', ora: '10:42',
    fatto: 'il programma P-17 risultava caricato', oggetto: 'HMI del CN', circostanza: 'osservato durante la lavorazione', frase, evidenze: ['B01-ID-009'], limiti: undefined, modificatoIl: 'x' })];
  app.dichiarazioniTerzi = [R.dichiarazionePerRientro({ tipo: 'dichiarazione', id: 'DT-003', beni: ['B01'], persona: 'Mario Esempio', ruolo: 'Responsabile di produzione',
    organizzazione: 'Officine Demo Fittizie S.r.l.', forma: 'verbale', data: '2026-10-15', contenuto: 'Il programma arriva ogni mattina dal MES.', requisito: 'RO2',
    riscontroOggettivo: { esito: 'N', evidenze: [], nota: 'riscontro da acquisire: azione A008' }, daAcquisire: true, azioneGenerata: 'A008' })];
  app.noteCampo = [R.notaPerRientro({ tipo: 'nota', id: 'NC-002', bene: 'B01', requisito: 'RO3', testo: 'collegamento al magazzino utensili da fotografare', ora: '2026-10-15T09:44:00Z', base: 'promemoria' })];
  app.nuoveAzioni = [...app.nuoveAzioni, R.bozzaPerRientro({ tipo: 'azione', id: 'A008', categoria: 'evidenza', beni: ['B01'], requisito: 'RO2', cosaServe: 'Riscontro oggettivo della dichiarazione DT-003',
    nota: 'dichiarazione verbale', generataDa: { tipo: 'dichiarazione', id: 'DT-003' }, stato: 'aperta', apertaIl: '2026-10-15' })];
  // F2.5: proposta di chiusura e data rilevata che precisa una data agli atti
  app.aggiornamentiAzioni = [R.aggiornamentoPerRientro({ tipo: 'aggiornamento', id: 'A003', idAzione: 'A003', esitoCampo: 'proposta_chiusura', motivoProposto: 'riscontro_diretto', riscontro: 'RD-003', evidenze: ['B01-ID-009'], nota: undefined }),
    R.aggiornamentoPerRientro({ tipo: 'aggiornamento', id: 'A001', idAzione: 'A001', esitoCampo: 'parziale', nota: 'storico visto a video, export da richiedere' })];
  app.dateRilevate = [R.dataPerRientro({ tipo: 'data', id: 'T001', evento: 'installazione', beni: ['B01'], data: { valore: '2025-04-14', precisione: 'giorno' }, tipoData: 'documento', origine: 'verbale',
    stato: R.statoData(['B01-ID-009'], 'verbale'), prove: [{ idEvidenza: 'B01-ID-009', file: 'x.jpg', fattoLetto: 'data 14/04/2025' }], coerenza: 'S', nota: undefined, rifTimeline: 'T005', esitoRif: 'precisata', descrizione: undefined })];
  verifica('App: stato di una data rilevata (documentata solo con prova e origine non dichiarativa)',
    R.statoData(['x'], 'verbale') === 'documentata' && R.statoData(['x'], 'dichiarazione_impresa') === 'dichiarata' && R.statoData([], 'verbale') === 'da_verificare');
  const es3 = nuovoEsito();
  verifica('App: riscontro, dichiarazione, nota, bozza, proposta di chiusura e data rilevata dell\'app validi per lo schema 1.2', validaStruttura(app, reg, es3, 'rientro') || (console.log(es3.errori), false));
}

// App: elenco dei file offline e impronta della mappa di importazione aggiornati
{
  const { calcola } = await import('./aggiorna_app.mjs');
  const { indice, precache } = calcola();
  const app = join(RADICE, 'app');
  verifica('App: precache.js e policy di sicurezza aggiornati (node strumenti/aggiorna_app.mjs)',
    readFileSync(join(app, 'index.html'), 'utf8') === indice && readFileSync(join(app, 'precache.js'), 'utf8') === precache);
}

const esitoDemo = validaCaricata(base, registro, { repoPubblico: true });
if (esitoDemo.errori.length) {
  falliti++;
  console.log(`FALLITO  pratica DEMO valida: ${esitoDemo.errori.length} errori`);
  for (const e of esitoDemo.errori) console.log(`         ${e.codice} ${e.dove}: ${e.messaggio}`);
} else console.log(`ok       pratica DEMO valida (${esitoDemo.avvisi.length} avvisi voluti)`);

for (const caso of casi) {
  const car = { ...base, file: new Map(base.file), documenti: structuredClone(base.documenti), testi: new Map(base.testi) };
  try {
    for (const m of caso.modifiche || []) {
      const f = espandi(m.file);
      if (!car.documenti.has(f)) throw new Error(`file non trovato: ${f}`);
      applica(car.documenti.get(f), m.puntatore, m);
    }
    for (const f of (caso.fileAlterati || []).map(espandi)) {
      if (!car.file.has(f)) throw new Error(`file non trovato: ${f}`);
      car.file.set(f, { ...car.file.get(f), sha256: '0'.repeat(64) });
    }
    for (const f of (caso.fileRimossi || []).map(espandi)) {
      if (!car.file.delete(f)) throw new Error(`file non trovato: ${f}`);
    }
    for (const c of (caso.cartelleRimosse || []).map(espandi)) {
      for (const k of [...car.file.keys()]) if (k.startsWith(c)) car.file.delete(k);
      for (const k of [...car.documenti.keys()]) if (k.startsWith(c)) car.documenti.delete(k);
      for (const k of [...car.testi.keys()]) if (k.startsWith(c)) car.testi.delete(k);
    }
  } catch (e) {
    falliti++;
    console.log(`FALLITO  ${caso.nome}: caso non applicabile (${e.message})`);
    continue;
  }
  const esito = validaCaricata(car, registro, { repoPubblico: true });
  const trovati = new Set(esito.errori.map(e => e.codice));
  const mancanti = caso.atteso.filter(c => !trovati.has(c));
  if (mancanti.length) {
    falliti++;
    console.log(`FALLITO  ${caso.nome}: mancano ${mancanti.join(', ')}; trovati ${[...trovati].join(', ') || 'nessun errore'}`);
  } else console.log(`ok       ${caso.nome} → ${caso.atteso.join(', ')}`);
}

console.log(`\n${casi.length + 1 + prove - falliti} superate, ${falliti} fallite`);
process.exit(falliti ? 1 : 0);
