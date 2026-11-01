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

// Schema 1.6: modalità di acquisizione, periodo d'imposta, interconnessione tardiva, dati del documento
{
  const copia = () => { const c = caricaCartella(cartella); return c; };
  const avvisi = car => new Set(validaCaricata(car, registro, { repoPubblico: true }).avvisi.map(a => a.codice));
  const errori = car => validaCaricata(car, registro, { repoPubblico: true }).errori;
  const b01 = car => car.documenti.get('beni/B01.json');
  const pr = car => car.documenti.get('pratica_40.json');

  let c = copia();
  b01(c).costi = { modalitaAcquisizione: { modalita: 'leasing', stato: 'dichiarato' } };
  verifica('1.6 Leasing senza contratto tra i documenti di costo → avviso', avvisi(c).has('LEASING_SENZA_CONTRATTO') && !errori(c).length);

  c = copia();
  pr(c).periodoImposta = { inizio: '2024-06-01', fine: '2025-05-31' };
  const a1 = avvisi(c);
  verifica("1.6 Periodo d'imposta non solare: interconnessione dopo la fine del periodo → da valutare come tardiva",
    a1.has('INTERCONNESSIONE_TARDIVA_DA_VALUTARE') && !errori(c).length && !avvisi(copia()).has('INTERCONNESSIONE_TARDIVA_DA_VALUTARE'));

  c = copia();
  pr(c).periodoImposta = { inizio: '2024-06-01', fine: '2025-05-31' };
  b01(c).interconnessioneTardiva = { pertinente: true, proveDatate: [{ classe: 'documento_impresa', data: { valore: '2025-07', precisione: 'mese' }, descrizione: 'dichiarazione della referente IT' }] };
  const a2 = avvisi(c);
  verifica('1.6 Interconnessione tardiva: causa, configurazione al primo utilizzo e prove non solo dichiarative',
    a2.has('TARDIVA_SENZA_CAUSA') && a2.has('TARDIVA_SENZA_CONFIGURAZIONE') && a2.has('TARDIVA_SOLO_DICHIARAZIONI') && !errori(c).length);

  c = copia();
  pr(c).periodoImposta = { inizio: '2025-06-30', fine: '2025-01-01' };
  verifica("1.6 Periodo d'imposta con fine prima dell'inizio → errore", errori(c).some(e => e.codice === 'PERIODO_IMPOSTA'));

  c = copia();
  const doc = pr(c).evidenze.find(e => e.tipo === 'documento');
  doc.datiDocumento = { tipoDocumento: 'verbale', emittente: 'Fornitore Demo', numero: 'V-12', data: '2025-04-14', riferimentoBene: 'matricola DEMO-0001' };
  verifica('1.6 Dati del documento su un\'evidenza documentale validi', !errori(c).length);
  doc.datiDocumento = { tipoDocumento: 'scontrino' };
  verifica('1.6 Tipo di documento fuori elenco → errore di schema', errori(c).some(e => e.codice === 'SCHEMA'));
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

// App (F2.6): pacchetto di rientro costruito dal telefono, diviso in volumi, controllato e riletto
{
  const { createHash } = await import('node:crypto');
  const P = await import('../app/js/pacchetto.js');
  const R = await import('../app/js/registri.js');
  const { creaRegistroSchemi, nuovoEsito, controllaVolumeRientro, controllaVolumi } = await import('./lib/validatore.mjs');
  const reg = creaRegistroSchemi(readdirSync(join(RADICE, 'schemi', 'v1')).map(f => JSON.parse(readFileSync(join(RADICE, 'schemi', 'v1', f), 'utf8'))));
  const byteAndata = readFileSync(join(cartella, 'andata', 'perizia40-andata.json'));
  const andata = JSON.parse(byteAndata.toString('utf8'));
  const pratica = { codicePratica: andata.codicePratica, andata, andataSha256: createHash('sha256').update(byteAndata).digest('hex'),
    visita: { id: 'S01', inizio: '2026-10-15T09:00:00+02:00', presenti: ['P01', 'P02'] }, stato: 'in_corso' };
  const contenuti = new Map();
  const ev = (n, byte) => {
    const id = `B01-ID-0${10 + n}`, nomeFile = `DEMO-2026-001_20261015_${id}.jpg`;
    const dati = new Uint8Array(byte).fill(n);
    contenuti.set(id, dati);
    return { codicePratica: 'DEMO-2026-001', id, beni: ['B01'], gruppo: 2, requisiti: ['ID'], tipo: 'foto', file: `evidenze/${nomeFile}`, nomeFile, mime: 'image/jpeg',
      sha256: createHash('sha256').update(dati).digest('hex'), byte, provenienza: 'perito', idSopralluogo: 'S01', acquisitaIl: `2026-10-15T10:0${n}:00+02:00`,
      origineDataScatto: 'registrazione_app', dataScatto: `2026-10-15T10:0${n}:00+02:00`, descrizione: `Targa ${n}`, stato: 'valida' };
  };
  const evidenze = [ev(1, 3000), ev(2, 4000), ev(3, 2500)];
  const d = andata.beni[0].datiDaVerificare[0];
  const registri = R.perTipo([{ tipo: 'verifica', id: `B01|${d.campo}`, bene: 'B01', campo: d.campo, valoreAgliAtti: d.valoreAgliAtti, esito: 'confermato', evidenze: ['B01-ID-011'], data: '2026-10-15' }]);
  const leggiFile = async e => new Blob([contenuti.get(e.id)]);
  const comune = { pratica, registri, versioneApp: '0.6.0', piattaforma: 'prova', installata: false, soglia: 5000 };

  const c1 = P.costruisciRientro({ ...comune, evidenze: evidenze.slice(0, 2), tipo: 'checkpoint', ora: new Date('2026-10-15T10:30:00+02:00') });
  const { esito: es1, preparati: p1 } = await P.preparaEControlla(c1, pratica, reg);
  verifica('Pacchetto: checkpoint 1 diviso in 2 volumi oltre la soglia e senza errori del validatore',
    c1.volumi.length === 2 && c1.volumi[0].nome === 'DEMO-2026-001_rientro_CHK1_20261015-1030_v1di2.zip' && (es1.errori.length === 0 || (console.log(es1.errori), false)));
  const zip1 = [];
  for (const p of p1) zip1.push({ nome: p.nome, ...(await P.creaZip(p, c1.dataOraZip, leggiFile)) });
  const letti = await Promise.all(zip1.map(async z => leggiZip(new Uint8Array(await z.blob.arrayBuffer()), inflateRawSync)));
  const es1b = nuovoEsito();
  const voli = letti.map((m, i) => {
    const doc = JSON.parse(new TextDecoder().decode(m.get('perizia40-rientro.json')));
    const file = new Map([...m].map(([k, b]) => [k, { sha256: createHash('sha256').update(b).digest('hex'), byte: b.length }]));
    controllaVolumeRientro({ doc, file, hashSha256: new TextDecoder().decode(m.get('hash.sha256')) }, { doc: andata, sha256: pratica.andataSha256 }, es1b, zip1[i].nome, { soloFile: i > 0 });
    return { doc, dove: zip1[i].nome };
  });
  controllaVolumi(voli, es1b);
  verifica('Pacchetto: ZIP riletti come farà il PC, impronte e volumi coerenti', es1b.errori.length === 0 || (console.log(es1b.errori), false));

  P.registraEsportazione(pratica, c1, 'checkpoint', new Date('2026-10-15T10:31:00+02:00'), zip1, 2);
  const c2 = P.costruisciRientro({ ...comune, evidenze, tipo: 'checkpoint', ora: new Date('2026-10-15T11:30:00+02:00') });
  const { esito: es2 } = await P.preparaEControlla(c2, pratica, reg);
  const m2 = c2.doc.manifesto;
  verifica('Pacchetto: checkpoint 2 porta solo il file nuovo, gli altri rimandano al checkpoint 1',
    c2.numero === 2 && c2.volumi.length === 1 && c2.volumi[0].evidenze.length === 1 && m2.filter(m => m.trasmessaInCheckpoint === 1).length === 2 && (es2.errori.length === 0 || (console.log(es2.errori), false)));

  let errore = '';
  const alterato = { ...(await P.preparaEControlla(c2, pratica, reg)).preparati[0] };
  try { await P.creaZip(alterato, c2.dataOraZip, async () => new Blob([new Uint8Array(2500).fill(7)])); } catch (e) { errore = e.message; }
  verifica('Pacchetto: file cambiato dopo l\'acquisizione → ZIP non creato', /impronta/.test(errore));

  const fin = P.costruisciRientro({ ...comune, evidenze, tipo: 'finale', ora: new Date('2026-10-15T12:45:00+02:00'), soglia: P.SOGLIA_VOLUME });
  const { esito: es3 } = await P.preparaEControlla(fin, pratica, reg);
  verifica('Pacchetto: finale con tutti i file, ora di fine e nessun rimando ai checkpoint',
    fin.volumi.length === 1 && fin.volumi[0].evidenze.length === 3 && fin.doc.sopralluogo.fine === '12:45' && !fin.doc.manifesto.some(m => m.trasmessaInCheckpoint)
    && fin.volumi[0].nome === 'DEMO-2026-001_rientro_FIN_20261015-1245.zip' && (es3.errori.length === 0 || (console.log(es3.errori), false)));
  P.registraEsportazione(pratica, fin, 'finale', new Date('2026-10-15T12:46:00+02:00'), [], 3);
  verifica('Pacchetto: dopo il finale la pratica è rientrata e la visita chiusa', pratica.stato === 'rientrata' && !!pratica.visita.chiusaIl && pratica.esportazioni.pacchetti.length === 2);
}

// App (F2.7): visita completa con ogni tipo di registro → finale in 2 volumi → validazione come sul PC (valida.mjs sui soli ZIP)
{
  const { createHash } = await import('node:crypto');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { caricaZip } = await import('./lib/disco.mjs');
  const P = await import('../app/js/pacchetto.js');
  const R = await import('../app/js/registri.js');
  const fileAndata = join(cartella, 'andata', 'perizia40-andata.json');
  const byteAndata = readFileSync(fileAndata);
  const andata = JSON.parse(byteAndata.toString('utf8'));
  const pratica = { codicePratica: andata.codicePratica, andata, andataSha256: createHash('sha256').update(byteAndata).digest('hex'), stato: 'in_corso',
    visita: { id: 'S01', inizio: '2026-10-15T09:00:00+02:00', presenti: ['P01', 'P02', 'P03'] }, esportazioni: {} };
  const contenuti = new Map();
  let n = 0;
  // come registraEvidenza: nome fissato all'acquisizione, impronta dei byte, data di scatto secondo l'origine
  const ev = (id, tipo, mime, est, byte, extra = {}) => {
    n++;
    const dati = new Uint8Array(byte).fill(n);
    contenuti.set(id, dati);
    const nomeFile = `DEMO-2026-001_20261015_${id}.${est}`;
    const acq = `2026-10-15T${String(9 + Math.floor(n / 6)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}:00+02:00`;
    return { codicePratica: 'DEMO-2026-001', id, beni: [id.replace(/-.*$/, '')], gruppo: 1, requisiti: ['ID'], tipo, file: `evidenze/${nomeFile}`, nomeFile, mime,
      sha256: createHash('sha256').update(dati).digest('hex'), byte, provenienza: 'perito', idSopralluogo: 'S01', acquisitaIl: acq,
      origineDataScatto: 'fotocamera_app', aperturaFotocamera: acq.replace(/:00\+/, ':00+').replace(/T(\d\d):(\d\d)/, (m, h, mi) => `T${h}:${String(Math.max(0, mi - 1)).padStart(2, '0')}`), dataScatto: acq,
      descrizione: `Evidenza ${id}`, annotazioni: [], stato: 'valida', ...extra };
  };
  const evidenze = [
    ev('B01-ID-001', 'foto', 'image/jpeg', 'jpg', 4000, { annotazioni: [{ tipo: 'freccia', colore: '#FF453A', x: 0.2, y: 0.8, x2: 0.5, y2: 0.5 }] }),
    ev('B01-ID-002', 'foto', 'image/jpeg', 'jpg', 3000, { stato: 'annullata', annullamento: { motivo: 'targa con riflesso, rifatta', data: '2026-10-15T09:20:00+02:00', sostituitaDa: 'B01-ID-003' } }),
    ev('B01-ID-003', 'foto', 'image/jpeg', 'jpg', 3500, { origineDataScatto: 'metadati', aperturaFotocamera: undefined, dataScatto: '2026-10-15T09:21:00+02:00' }),
    ev('B01.1-ID-001', 'foto', 'image/jpeg', 'jpg', 2500),
    ev('B01-RO2-002', 'video', 'video/quicktime', 'mov', 6000, { gruppo: 5, requisiti: ['RO2'], durataSecondi: 42 }),
    ev('B01-RO3-001', 'vocale', 'audio/mp4', 'm4a', 1500, { gruppo: 6, requisiti: ['RO3'], origineDataScatto: 'registrazione_app', aperturaFotocamera: undefined, durataSecondi: 25 }),
    ev('B02-DOC-001', 'documento', 'application/pdf', 'pdf', 2000, { gruppo: 'DOC', requisiti: ['DOC'], origineDataScatto: undefined, aperturaFotocamera: undefined, dataScatto: undefined }),
    ev('B03-ID-001', 'foto', 'image/jpeg', 'jpg', 3000),
  ].map(e => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)));
  const d = campo => andata.beni[0].datiDaVerificare.find(x => x.campo === campo);
  const reg = R.perTipo([
    { tipo: 'verifica', id: 'B01|identita.costruttore', bene: 'B01', campo: 'identita.costruttore', valoreAgliAtti: d('identita.costruttore').valoreAgliAtti, esito: 'confermato', evidenze: ['B01-ID-003'], data: '2026-10-15' },
    { tipo: 'verifica', id: 'B01|identita.matricola', bene: 'B01', campo: 'identita.matricola', valoreAgliAtti: 'DEMO-0001', esito: 'corretto', valoreRilevato: 'DEMO-0001/A', evidenze: ['B01-ID-003'], data: '2026-10-15' },
    { tipo: 'verifica', id: 'B01|controllore.firmware', bene: 'B01', campo: 'controllore.firmware', valoreAgliAtti: 'V4.2.1', esito: 'non_verificabile', evidenze: [], data: '2026-10-15', nota: 'pagina di sistema protetta da password' },
    { tipo: 'beneNuovo', id: 'B03', codice: 'B03', denominazione: 'Lavatrice industriale pezzi', funzione: 'lavaggio dei pezzi dopo la lavorazione', ubicazione: 'Reparto 2',
      matricolaTarga: { stato: 'letta', valore: 'LV-DEMO-77' }, componenti: [] },
    { tipo: 'riscontro', id: 'RD-001', bene: 'B01', requisito: 'RO2', idSopralluogo: 'S01', dataVisita: '2026-10-15', ora: '10:42',
      fatto: 'il programma P-17 risultava caricato', oggetto: 'HMI del CN', circostanza: 'osservato durante la lavorazione',
      frase: 'Il programma P-17 risultava caricato (HMI del CN, bene B01), osservato durante la lavorazione, alle ore 10:42 del 15/10/2026.', evidenze: ['B01-RO2-002'] },
    { tipo: 'dichiarazione', id: 'DT-002', beni: ['B01'], persona: 'Mario Esempio', ruolo: 'Responsabile di produzione', organizzazione: 'Officine Demo Fittizie S.r.l.', forma: 'verbale',
      data: '2026-10-15', contenuto: 'Gli utensili arrivano dal magazzino automatico.', requisito: 'RO3', evidenzaDichiarazione: 'B01-RO3-001',
      riscontroOggettivo: { esito: 'N', evidenze: [], nota: 'riscontro da acquisire: azione A004' }, daAcquisire: true, azioneGenerata: 'A004' },
    { tipo: 'azione', id: 'A004', categoria: 'evidenza', beni: ['B01'], requisito: 'RO3', cosaServe: 'Riscontro oggettivo della dichiarazione DT-002',
      generataDa: { tipo: 'dichiarazione', id: 'DT-002' }, stato: 'aperta', apertaIl: '2026-10-15' },
    { tipo: 'nota', id: 'NC-001', bene: 'B02', requisito: 'RO2', testo: 'cartella condivisa da fotografare dal PC qualità', ora: '2026-10-15T10:50:00Z', base: 'promemoria' },
    { tipo: 'data', id: 'T001', evento: 'installazione', beni: ['B01'], data: { valore: '2025-04-14', precisione: 'giorno' }, tipoData: 'documento', origine: 'verbale',
      stato: R.statoData(['B01-ID-003'], 'verbale'), prove: [{ idEvidenza: 'B01-ID-003', file: 'evidenze/DEMO-2026-001_20261015_B01-ID-003.jpg', fattoLetto: 'verbale del 14/04/2025' }],
      coerenza: 'S', rifTimeline: 'T005', esitoRif: 'precisata' },
    { tipo: 'aggiornamento', id: 'A003', idAzione: 'A003', esitoCampo: 'proposta_chiusura', motivoProposto: 'riscontro_diretto', riscontro: 'RD-001', evidenze: ['B01-RO2-002'] },
    { tipo: 'aggiornamento', id: 'A001', idAzione: 'A001', esitoCampo: 'parziale', nota: 'fattura vista, copia da inviare' },
  ]);
  const leggiFile = async e => new Blob([contenuti.get(e.id)]);
  const fin = P.costruisciRientro({ pratica, evidenze, registri: reg, tipo: 'finale', ora: new Date('2026-10-15T17:30:00+02:00'), versioneApp: '0.7.0', piattaforma: 'iPhone Safari', installata: true, soglia: 15000 });
  const { esito: es, preparati } = await P.preparaEControlla(fin, pratica, registro);
  const cartellaZip = mkdtempSync(join(tmpdir(), 'perito40-'));
  const percorsi = [];
  try {
    for (const p of preparati) {
      const z = await P.creaZip(p, fin.dataOraZip, leggiFile);
      const percorso = join(cartellaZip, p.nome);
      writeFileSync(percorso, new Uint8Array(await z.blob.arrayBuffer()));
      percorsi.push(percorso);
    }
    const esitoPC = validaCaricata(caricaZip(percorsi, fileAndata), registro, { soloRientro: true, repoPubblico: true });
    const doc = fin.doc;
    verifica('Visita completa: finale in 2 volumi con ogni tipo di evidenza e registro, controllo del telefono senza errori',
      preparati.length === 2 && doc.evidenze.length === 8 && doc.beniNuovi.length === 1 && doc.verificheDati.length === 3 && doc.riscontriDiretti.length === 1
      && doc.dichiarazioniTerzi.length === 1 && doc.nuoveAzioni.length === 1 && doc.noteCampo.length === 1 && doc.dateRilevate.length === 1 && doc.aggiornamentiAzioni.length === 2
      && (es.errori.length === 0 || (console.log(es.errori), false)));
    verifica('Visita completa: gli ZIP del telefono superano valida.mjs sul PC (andata, volumi, impronte, registri)',
      esitoPC.errori.length === 0 || (console.log(esitoPC.errori), false));
    verifica('Visita completa: evidenza annullata nel pacchetto con motivo e sostituta, file conservato',
      doc.evidenze.find(e => e.id === 'B01-ID-002').annullamento.sostituitaDa === 'B01-ID-003' && fin.volumi.some(v => v.evidenze.some(e => e.id === 'B01-ID-002')));
  } finally {
    rmSync(cartellaZip, { recursive: true, force: true });
  }
}

// PC (F3.1): nuova pratica, nuovo bene, scheletro di perizia e analisi in Word
{
  const { mkdtempSync, rmSync, existsSync, readdirSync: elenca } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const { creaPratica } = await import('./crea_pratica.mjs');
  const { nuovoBene } = await import('./nuovo_bene.mjs');
  const radice = mkdtempSync(join(tmpdir(), 'p40-'));
  try {
    const { cartella, esito } = creaPratica(radice, 'PROVA-2026-001', { cliente: 'Officine Prova S.r.l.', sede: 'Via Prova 1', demo: true });
    verifica('Nuova pratica: cartelle e fascicolo valido, nome senza punto finale (Windows)',
      esito.errori.length === 0 && cartella.endsWith('PROVA-2026-001 - Officine Prova S.r.l') && ['documenti_cliente', 'beni', 'evidenze', 'andata', 'rientro', 'perizia'].every(c => existsSync(join(cartella, c))));
    let doppia = '';
    try { creaPratica(radice, 'PROVA-2026-001', { cliente: 'Altro', sede: 'X' }); } catch (e) { doppia = e.message; }
    verifica('Nuova pratica: una pratica esistente non si sovrascrive', /esiste già/.test(doppia));
    const libera = creaPratica(radice, 'PROVA-2026-002', { cliente: 'Prova SRL', sede: 'X', nome: 'Prova SRL - macchine ALFA/BETA', demo: true });
    let stessoCodice = '';
    try { creaPratica(radice, 'PROVA-2026-002', { cliente: 'Prova SRL', sede: 'X', nome: 'Altro nome' }); } catch (e) { stessoCodice = e.message; }
    verifica('Nuova pratica: nome della cartella libero («cliente - bene»), codice unico anche con nomi diversi',
      libera.cartella.endsWith('Prova SRL - macchine ALFABETA') && /esiste già/.test(stessoCodice));
    const b1 = nuovoBene(cartella, { denominazione: 'Pressa', funzione: 'Piegatura a CN', allegato: 'A', gruppo: 1, voce: 'deformazione plastica', codiceVoce: 'A11_04', ru: ['RU1', 'RU2'] });
    const b2 = nuovoBene(cartella, { denominazione: 'Software MES', funzione: 'Gestione ordini', allegato: 'B', voce: 'software di produzione' });
    verifica('Nuovo bene: schede B01 (profilo completo) e B02 (ridotto) valide, dati agli atti «da verificare»',
      b1.codice === 'B01' && b2.codice === 'B02' && b2.esito.errori.length === 0 && b2.esito.avvisi.some(a => a.codice === 'CLASSIFICAZIONE_DA_MOTIVARE'));
    const { registraDocumento } = await import('./registra_documento.mjs');
    const { writeFileSync: scrivi } = await import('node:fs');
    // Una scheda dello schema 1.4 (prima del gruppo 11 Sicurezza) resta valida: il gruppo mancante è solo un avviso
    const fileB1 = join(cartella, 'beni', 'B01.json');
    const originaleB1 = readFileSync(fileB1, 'utf8');
    const vecchia = JSON.parse(originaleB1);
    vecchia.versioneSchema = '1.4.0';
    vecchia.gruppiEvidenze = vecchia.gruppiEvidenze.filter(g => g.gruppo !== 11);
    scrivi(fileB1, JSON.stringify(vecchia, null, 2));
    const esitoVecchia = validaCaricata(caricaCartella(cartella), registro, {});
    scrivi(fileB1, originaleB1);
    verifica('Gruppo 11 Sicurezza (RO5): nuovo bene con 12 gruppi; scheda 1.4 senza Sicurezza con solo avviso GRUPPO_DA_AGGIUNGERE',
      JSON.parse(originaleB1).gruppiEvidenze.some(g => g.gruppo === 11 && g.attesa === 'si' && g.requisiti[0] === 'RO5')
      && !esitoVecchia.errori.some(e => e.codice === 'GRUPPO_MANCANTE') && esitoVecchia.avvisi.some(a => a.codice === 'GRUPPO_DA_AGGIUNGERE'));
    scrivi(join(cartella, 'documenti_cliente', 'fattura.pdf'), 'FATTURA DI PROVA');
    const d1 = registraDocumento(cartella, join(cartella, 'documenti_cliente', 'fattura.pdf'), { beni: ['B01', 'B02'], descrizione: 'Fattura di prova' });
    let doppio = '';
    try { registraDocumento(cartella, join(cartella, 'documenti_cliente', 'fattura.pdf'), { beni: ['B01'], descrizione: 'x' }); } catch (e) { doppio = e.message; }
    verifica('Registra documento: copia identica in evidenze/documenti con codice, impronta e manifesto; doppione rifiutato',
      d1.id === 'B01-DOC-001' && d1.esito.errori.length === 0 && existsSync(join(cartella, 'documenti_cliente', 'fattura.pdf')) && /già registrato/.test(doppio));
    // F3.2: andata dal fascicolo, poi una seconda revisione per la stessa visita
    const { generaAndata, nomeFileAndata } = await import('./genera_andata.mjs');
    const g1 = generaAndata(cartella, { data: '2026-11-10' });
    const g2 = generaAndata(cartella, { data: '2026-11-12', avvertenze: ['Accesso al reparto solo con il capo turno'] });
    const pr2 = JSON.parse(readFileSync(join(cartella, 'pratica_40.json'), 'utf8'));
    verifica('F3.2 Andata dal fascicolo: valida, sopralluogo S01 previsto, dati agli atti da verificare, azioni e documenti già usati',
      g1.esito.errori.length === 0 && g1.andata.sopralluogo.id === 'S01' && g1.andata.beni.length === 2
      && g1.andata.beni[0].datiDaVerificare.length === 13 && g1.andata.evidenzeEsistenti.includes('B01-DOC-001'));
    verifica('F3.2 Nuova revisione per la stessa visita: rev002 con il nome della pratica, la rev001 resta come file a parte, pratica valida',
      g2.esito.errori.length === 0 && g2.andata.revisione === 'rev002' && g2.andata.sopralluogo.id === 'S01' && pr2.sopralluoghi.length === 1
      && pr2.sopralluoghi[0].data === '2026-11-12' && existsSync(join(cartella, 'andata', `${nomeFileAndata(cartella)}_rev001.json`))
      && pr2.pacchetti.at(-1).file === 'andata/PROVA-2026-001 - Officine Prova S.r.l - perizia40-andata.json'
      && pr2.pacchetti.filter(p => p.tipo === 'andata').length === 2 && g2.andata.sopralluogo.avvertenze[0].startsWith('Accesso'));
    // F3.3: rientro finale sintetico nato dall'andata rev002, importato due volte
    {
      const { importaRientro } = await import('./importa_rientro.mjs');
      const { sha256: impronta } = await import('./lib/disco.mjs');
      const foto = Buffer.from('FOTO DI PROVA DELLA TARGA');
      const hFoto = impronta(foto);
      const t = (hh) => `2026-11-12T${hh}+01:00`;
      const rientro = {
        formato: 'perizia40.rientro', versioneSchema: '1.6.0', demo: true, idRientro: '0b7d4c2e-1111-4a2b-9c3d-00000000c001', tipoPacchetto: 'finale', volume: { numero: 1, totale: 1 },
        andata: { idAndata: g2.andata.idAndata, revisione: 'rev002', sha256: impronta(readFileSync(g2.file)) }, codicePratica: 'PROVA-2026-001',
        app: { versione: 'prova' }, creatoIl: t('12:00:00'), fusoOrario: 'Europe/Rome',
        sopralluogo: { id: 'S01', data: '2026-11-12', presenti: [{ id: 'P01', nome: 'Referente Prova', ruolo: 'Responsabile di produzione', organizzazione: 'Officine Prova S.r.l.' }] },
        beniNuovi: [],
        evidenze: [{ id: 'B01-ID-001', beni: ['B01'], gruppo: 2, requisiti: ['ID', 'RO5'], tipo: 'foto', file: 'evidenze/B01-ID-001_targa.jpg', mime: 'image/jpeg', sha256: hFoto,
          provenienza: 'perito', idSopralluogo: 'S01', acquisitaIl: t('10:00:05'), origineDataScatto: 'fotocamera_app', aperturaFotocamera: t('09:59:30'), dataScatto: t('10:00:00'),
          descrizione: 'Targa di B01 (da descrivere)', annotazioni: [], stato: 'valida' }],
        verificheDati: [{ bene: 'B01', campo: 'identita.matricola', valoreAgliAtti: null, esito: 'corretto', valoreRilevato: 'M-123', evidenze: ['B01-ID-001'], data: '2026-11-12' }],
        riscontriDiretti: [{ id: 'RD-001', bene: 'B01', requisito: 'ID', idSopralluogo: 'S01', dataVisita: '2026-11-12', fatto: 'la targa riporta la matricola M-123', oggetto: 'targa della pressa',
          circostanza: 'durante il sopralluogo', frase: 'La targa della pressa riporta la matricola M-123, letta durante il sopralluogo.', evidenze: ['B01-ID-001'] }],
        dichiarazioniTerzi: [], noteCampo: [],
        dateRilevate: [{ id: 'T001', evento: 'installazione', descrizione: 'Verbale di installazione mostrato in visita', beni: ['B01'], data: { valore: '2025-03-10', precisione: 'giorno' },
          tipoData: 'documento', origine: 'verbale', stato: 'documentata', prove: [{ idEvidenza: 'B01-ID-001' }], coerenza: 'S' }],
        nuoveAzioni: [{ id: 'A001', categoria: 'documento', beni: ['B01'], requisito: 'RO2', cosaServe: 'Schema di rete con la pressa', stato: 'aperta', apertaIl: '2026-11-12' }],
        aggiornamentiAzioni: [],
        manifesto: [{ idEvidenza: 'B01-ID-001', file: 'evidenze/B01-ID-001_targa.jpg', sha256: hFoto, byte: foto.length, dataAcquisizione: t('10:00:05'), provenienza: 'perito', hash: 'C', marcaTemporale: { tipo: 'n/a' }, volume: 1 }],
      };
      const voci = [{ nome: 'perizia40-rientro.json', dati: Buffer.from(JSON.stringify(rientro, null, 2)) }, { nome: 'evidenze/B01-ID-001_targa.jpg', dati: foto }];
      voci.splice(1, 0, { nome: 'hash.sha256', dati: Buffer.from(voci.map(v => `${impronta(v.dati)}  ${v.nome}`).join('\n') + '\n') });
      const zipRientro = join(radice, 'PROVA-2026-001_rientro_FIN_v1di1.zip');
      scrivi(zipRientro, Buffer.from(scriviZip(voci, '2026-11-12T12:00:00')));
      const i1 = importaRientro(cartella, [zipRientro]);
      const i2 = importaRientro(cartella, [zipRientro]);
      const pr3 = JSON.parse(readFileSync(join(cartella, 'pratica_40.json'), 'utf8'));
      const sc3 = JSON.parse(readFileSync(join(cartella, 'beni', 'B01.json'), 'utf8'));
      const a1 = pr3.azioni.find(a => a.id === 'A001');
      verifica('F3.3 Import del rientro: evidenza copiata con impronta, esito in scheda, registri, data e azione nate in campo; fascicolo valido',
        i1.importato && i1.esito.errori.length === 0 && existsSync(join(cartella, 'evidenze', 'sopralluogo_S01', 'B01-ID-001_targa.jpg'))
        && sc3.datiAgliAtti.identita.matricola.verificaCampo.valoreRilevato === 'M-123' && pr3.riscontriDiretti.length === 1
        && pr3.sopralluoghi[0].stato === 'eseguito' && pr3.persone.some(p => p.id === 'P01') && a1.destinatario === 'perito'
        && i1.esito.avvisi.some(a => a.codice === 'AZIONE_DA_COMPLETARE') && i1.rapporto.targhe[0].id === 'B01-ID-001' && i1.rapporto.daDescrivere.includes('B01-ID-001'));
      verifica('F3.3 Rifare l\'import dello stesso pacchetto non crea doppioni',
        i2.importato && i2.esito.errori.length === 0 && pr3.evidenze.filter(e => e.id === 'B01-ID-001').length === 1
        && pr3.timeline.filter(r => r.evento === 'installazione').length === 1 && pr3.pacchetti.filter(p => p.tipo === 'rientro_finale').length === 1 && i2.rapporto.evidenzeNuove.length === 0);
      const alterato = { ...rientro, andata: { ...rientro.andata, sha256: '0'.repeat(64) } };
      const zipAlterato = join(radice, 'alterato.zip');
      const vociA = [{ nome: 'perizia40-rientro.json', dati: Buffer.from(JSON.stringify(alterato)) }, voci[2]];
      vociA.splice(1, 0, { nome: 'hash.sha256', dati: Buffer.from(vociA.map(v => `${impronta(v.dati)}  ${v.nome}`).join('\n') + '\n') });
      scrivi(zipAlterato, Buffer.from(scriviZip(vociA, '2026-11-12T12:00:00')));
      const prima = readFileSync(join(cartella, 'pratica_40.json'), 'utf8');
      const i3 = importaRientro(cartella, [zipAlterato]);
      verifica('F3.3 Pacchetto non nato da quell\'andata: rifiutato, fascicolo non toccato',
        !i3.importato && i3.esito.errori.some(e => e.codice === 'RIENTRO_ANDATA_HASH') && readFileSync(join(cartella, 'pratica_40.json'), 'utf8') === prima);
    }
    // Emissione e chiusura: per la firma, giuramento, documenti finali firmati e marcati, sola lettura
    {
      const em = await import('./emissione.mjs');
      const { sha256: impronta } = await import('./lib/disco.mjs');
      const { mkdirSync } = await import('node:fs');
      const pf = em.perLaFirma(cartella, 'B01', { data: '2026-11-20' });
      const senzaDoc = (() => { em.giuramento(cartella, 'B01', { data: '2026-11-25', tribunale: 'Tribunale di Prova', rgvg: '123/2026', cronologico: '456' }); return em.chiudi(cartella, 'B01'); })();
      const sc = JSON.parse(readFileSync(join(cartella, 'beni', 'B01.json'), 'utf8'));
      verifica('Emissione: per la firma e giuramento registrati; senza documenti firmati e marcati la chiusura si ferma',
        pf.fatto && sc.elaborato.stato === 'giurata' && sc.elaborato.giuramento.rgvg === '123/2026' && !senzaDoc.fatto
        && senzaDoc.mancanze.some(m => /analisi tecnica/.test(m)) && senzaDoc.mancanze.some(m => /perizia giurata scansione/.test(m)));
      const { opensslDisponibile } = await import('./lib/firme.mjs');
      if (opensslDisponibile()) {
        const { preparaFirme } = await import('./lib/prova_firme.mjs');
        const df = join(radice, 'firme');
        mkdirSync(df);
        const f = preparaFirme(df);
        const scrivi2 = (n, b) => { scrivi(join(df, n), b); return join(df, n); };
        const a = em.registra(cartella, 'B01', { tipo: 'analisi_tecnica', file: scrivi2('Analisi tecnica B01.pdf', f.padesMarcato) });
        const p = em.registra(cartella, 'B01', { tipo: 'perizia_giurata_scansione', file: scrivi2('Perizia giurata B01.pdf.p7m', f.p7m), marche: [scrivi2('Perizia giurata B01.pdf.tsr', f.tsr)] });
        const t = em.registra(cartella, 'B01', { tipo: 'allegato', file: scrivi2('Allegato.pdf.tsd', f.tsd) });
        const m = em.registra(cartella, 'B01', { tipo: 'allegato', file: scrivi2('Allegato.pdf.m7m', f.m7m) });
        let alterato = '';
        try { em.registra(cartella, 'B01', { tipo: 'allegato', file: scrivi2('alterato.pdf', f.pdfAlterato) }); } catch (e) { alterato = e.message; }
        let altraMarca = '';
        try { em.registra(cartella, 'B01', { tipo: 'allegato', file: scrivi2('scansione.pdf', f.scansione), marche: [join(df, 'Perizia giurata B01.pdf.tsr')] }); } catch (e) { altraMarca = e.message; }
        verifica('Emissione: PAdES con marca nel PDF, CAdES .p7m con marca .tsr, .tsd e .m7m riconosciuti e verificati; firma alterata e marca di un altro documento rifiutate',
          a.voce.firma.formato === 'pades' && a.voce.firma.integrita === 'verificata' && a.voce.marche.some(x => x.formato === 'pades' && x.riferita === 'si')
          && p.voce.firma.formato === 'cades' && p.voce.firma.contenutoSha256 === impronta(f.scansione) && p.voce.marche.some(x => x.formato === 'tsr' && x.riferita === 'si' && x.data)
          && t.voce.marche.some(x => x.formato === 'tsd' && x.riferita === 'si') && m.voce.marche.some(x => x.formato === 'm7m' && x.riferita === 'si')
          && /non corrisponde/.test(alterato) && /non è la sua marca/.test(altraMarca) && existsSync(join(cartella, 'perizia', 'finale', 'Perizia giurata B01.pdf.tsr')));
        const ch = em.chiudi(cartella, 'B01');
        let dopo = '';
        try { registraDocumento(cartella, join(cartella, 'documenti_cliente', 'fattura.pdf'), { beni: ['B01'], descrizione: 'x' }); } catch (e) { dopo = e.message; }
        scrivi(join(cartella, 'perizia', 'finale', 'Analisi tecnica B01.pdf'), Buffer.concat([f.padesMarcato, Buffer.from('\n')]));
        const ver = em.verifica(cartella).find(x => x.bene === 'B01');
        const es = validaCaricata(caricaCartella(cartella), registro, {});
        verifica('Chiusura: bene in sola lettura; un documento finale cambiato dopo la registrazione è segnalato',
          ch.fatto && ch.esito.errori.length === 0 && /sola lettura/.test(dopo) && ver.problemi.some(x => /modificato/.test(x))
          && es.errori.some(e => e.codice === 'DOCUMENTO_FINALE_MODIFICATO'));
      } else console.log('saltata  Firme e marche: openssl non disponibile');
    }
    // Diario e cruscotto: ogni pratica nasce con il diario; il cruscotto mostra l'ultimo prossimo passo
    {
      const { aggiungiVoce, ultimaVoce } = await import('./diario.mjs');
      const { cruscotto } = await import('./cruscotto.mjs');
      const nascita = ultimaVoce(cartella);
      aggiungiVoce(cartella, { fatto: ['prova del diario'], decisioni: ['nessuna'], prossimo: 'chiamare il cliente per la data del sopralluogo', data: '2026-11-30' });
      const righe = cruscotto(radice);
      const r1 = righe.find(r => r.codice === 'PROVA-2026-001');
      const r2 = righe.find(r => r.codice === 'PROVA-2026-002');
      verifica('Diario e cruscotto: diario creato con la pratica, prossimo passo dal diario o suggerito dallo stato, pratiche più recenti in cima',
        nascita && /censire i beni/.test(nascita.prossimo) && r1.prossimoDiario === 'chiamare il cliente per la data del sopralluogo'
        && r1.ultimoLavoro === '2026-11-30' && righe[0] === r1 && r1.beni.find(b => b.codice === 'B01').chiuso && !r1.chiusa
        && r2 && r2.suggerito === 'analizzare i documenti e censire i beni');
    }
    // Studio desktop: server locale, cruscotto, caricamento e registrazione di un documento, protezioni
    {
      const { avviaStudio } = await import('../studio/server.mjs');
      const { server, token, indirizzo } = await avviaStudio(radice, { porta: 0 });
      try {
        const chiama = (metodo, p, corpo, intestazioni = {}) => fetch(indirizzo + p.replace(/^\//, ''), { method: metodo, body: corpo, headers: metodo === 'GET' ? intestazioni : { 'X-Studio': token, ...intestazioni } });
        const elenco = await (await chiama('GET', '/api/pratiche')).json();
        const nome = elenco.pratiche.find(p => p.codice === 'PROVA-2026-002').cartella;
        const nuovo = await (await chiama('POST', `/api/pratiche`, JSON.stringify({ codice: 'PROVA-2026-003', nome: 'PROVA SRL - pressa', cliente: 'PROVA SRL', sede: 'X', annualita: '2025' }))).json();
        const c = await (await chiama('POST', `/api/carica?${new URLSearchParams({ nome, file: 'offerta.pdf' })}`, Buffer.from('%PDF-1.4 offerta di prova'))).json();
        const c2 = await (await chiama('POST', `/api/carica?${new URLSearchParams({ nome, file: 'offerta.pdf' })}`, Buffer.from('%PDF-1.4 offerta di prova'))).json();
        const senza = await fetch(indirizzo + `api/diario?nome=${encodeURIComponent(nome)}`, { method: 'POST', body: '{}' });
        const fuori = await chiama('GET', `/file?${new URLSearchParams({ nome, percorso: '../../x' })}`);
        const dati = await (await chiama('GET', `/api/pratica?${new URLSearchParams({ nome })}`)).json();
        verifica('Studio: cruscotto, nuova pratica, documento copiato in documenti_cliente (senza doppioni), richieste senza gettone e percorsi esterni rifiutati',
          elenco.pratiche.length >= 2 && nuovo.nome === 'PROVA SRL - pressa' && c.file === 'documenti_cliente/Caricati con lo Studio/offerta.pdf' && !c.giaPresente
          && c2.giaPresente && senza.status === 403 && fuori.status === 400 && dati.documenti.some(d => d.nome === 'offerta.pdf' && !d.evidenza));
      } finally { server.close(); }
    }
    const py = spawnSync('python', ['-c', 'import docx'], { encoding: 'utf-8' });
    if (py.status === 0) {
      const r = spawnSync('python', ['-I', join(RADICE, 'strumenti', 'word', 'scheletro_perizia.py'), join(RADICE, 'demo', 'PRATICA_DEMO_2026_001'),
        '--uscita', join(radice, 'w'), '--data', '2026-10-31'], { encoding: 'utf-8' });
      const file = existsSync(join(radice, 'w')) ? elenca(join(radice, 'w')) : [];
      verifica('Scheletro Word: perizia e analisi per ogni bene della DEMO, con segnaposto in chiaro',
        (r.status === 0 || (console.log(r.stderr), false)) && file.length === 4 && /segnaposto/.test(r.stdout) && file.some(f => /^Perizia 4\.0 .* - BOZZA rev\.0 31\.10\.2026\.docx$/.test(f)));
    } else console.log('saltata  Scheletro Word: Python con python-docx non disponibile');
    if (spawnSync('python', ['-c', 'import docx, PIL'], { encoding: 'utf-8' }).status === 0) {
      const r = spawnSync('python', ['-I', join(RADICE, 'strumenti', 'word', 'fascicolo_fotografico.py'), join(RADICE, 'demo', 'PRATICA_DEMO_2026_001'),
        '--uscita', join(radice, 'f'), '--data', '2026-11-01'], { encoding: 'utf-8' });
      const file = existsSync(join(radice, 'f')) ? elenca(join(radice, 'f')) : [];
      verifica('Fascicolo fotografico Word: un file per bene della DEMO, foto con annotazioni disegnate su copia',
        (r.status === 0 || (console.log(r.stderr), false)) && file.length === 2 && /B01: 11 foto/.test(r.stdout) && file.every(f => /^Fascicolo fotografico .* 01\.11\.2026\.docx$/.test(f)));
    } else console.log('saltata  Fascicolo fotografico: Python con python-docx e Pillow non disponibile');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
}

// App: elenco dei file offline e impronta della mappa di importazione aggiornati
{
  const { calcola } = await import('./aggiorna_app.mjs');
  const { indice, precache, sw } = calcola();
  const app = join(RADICE, 'app');
  verifica('App: precache.js e policy di sicurezza aggiornati (node strumenti/aggiorna_app.mjs)',
    readFileSync(join(app, 'index.html'), 'utf8') === indice && readFileSync(join(app, 'precache.js'), 'utf8') === precache && readFileSync(join(app, 'sw.js'), 'utf8') === sw);
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
