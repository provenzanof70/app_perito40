#!/usr/bin/env node
// Rigenera la pratica DEMO in demo/PRATICA_DEMO_2026_001: media sintetici, pacchetto di andata,
// pacchetto di rientro finale in due volumi ZIP, fascicolo sul PC dopo l'importazione.
// Tutti i dati sono inventati; IP negli intervalli di documentazione (RFC 5737).
// Uso: node strumenti/genera_demo.mjs

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { sha256 } from './lib/disco.mjs';
import { GRUPPI } from './lib/validatore.mjs';
import { scriviZip } from './lib/zip.mjs';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'PRATICA_DEMO_2026_001');
const PRATICA = 'DEMO-2026-001';
const VISITA = '2026-10-15';
const ID_ANDATA = '5f0c2a1e-1d2b-4c3a-9e00-00000000a001';
const ID_RIENTRO = '7b1e9c40-2f3a-4d5b-8c00-00000000b001';
const VERSIONE = '1.1.0';
const ora = (data, hhmm, ss = '00') => `${data}T${hhmm}:${ss}+02:00`;

// ---------------------------------------------------------------------------
// Media sintetici
// ---------------------------------------------------------------------------

const FONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
  3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
  6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
  9: '01110100011000101111000010001001100', '-': '00000000000000011111000000000000000', '.': '00000000000000000000000000110001100',
  '/': '00001000100001000100010000100010000', ':': '00000011000110000000011000110000000', ' ': '00000000000000000000000000000000000',
};

function png(righe, colore) {
  const L = 480, H = 270, S = 3;
  const px = Buffer.alloc((L * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    px[y * (L * 3 + 1)] = 0;
    for (let x = 0; x < L; x++) px.set(colore, y * (L * 3 + 1) + 1 + x * 3);
  }
  righe.forEach((testo, r) => {
    [...testo.toUpperCase()].forEach((ch, c) => {
      const g = FONT[ch] || FONT[' '];
      for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++) {
        if (g[gy * 5 + gx] !== '1') continue;
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          const x = 16 + c * 18 + gx * S + dx, y = 30 + r * 40 + gy * S + dy;
          if (x < L && y < H) px.set([255, 255, 255], y * (L * 3 + 1) + 1 + x * 3);
        }
      }
    });
  });
  const blocco = (tipo, dati) => {
    const t = Buffer.from(tipo, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(dati.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dati])));
    return Buffer.concat([len, t, dati, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(L, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocco('IHDR', ihdr), blocco('IDAT', deflateSync(px, { level: 9 })), blocco('IEND', Buffer.alloc(0)),
  ]);
}

function wav(secondi) {
  const n = 8000 * secondi;
  const b = Buffer.alloc(44 + n, 0x80);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  return b;
}

function pdf(righe) {
  const esc = s => s.replace(/[\\()]/g, m => '\\' + m);
  const testo = `BT /F1 11 Tf 50 800 Td 16 TL ${righe.map(r => `(${esc(r)}) '`).join(' ')} ET`;
  const oggetti = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${testo.length} >>\nstream\n${testo}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const pos = [];
  oggetti.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const COLORI = { 1: [40, 70, 110], 2: [90, 60, 110], 3: [30, 100, 90], 4: [30, 90, 60], 5: [140, 70, 30], 7: [100, 100, 40], 8: [110, 50, 60], 10: [60, 60, 60] };

// ---------------------------------------------------------------------------
// Persone, beni, evidenze
// ---------------------------------------------------------------------------

const CLIENTE = { ragioneSociale: 'Officine Demo Fittizie S.r.l.', sedeIntervento: "Via dell'Esempio 1, 00000 Citta Fittizia (XX)" };
const PERSONE = [
  { id: 'P01', nome: 'Mario Esempio', ruolo: 'Responsabile di produzione', organizzazione: CLIENTE.ragioneSociale },
  { id: 'P02', nome: 'Laura Fittizia', ruolo: 'Referente IT', organizzazione: CLIENTE.ragioneSociale },
  { id: 'P03', nome: 'Paolo Campione', ruolo: 'Tecnico di automazione', organizzazione: 'Automazioni Demo S.r.l.' },
];

// Documenti ricevuti dal cliente prima del sopralluogo
const DOCUMENTI = [
  {
    id: 'B01-DOC-001', beni: ['B01', 'B02'], comune: true, gruppo: 'DOC', requisiti: ['DOC'], nome: 'fattura_FT-DEMO-0042.pdf',
    acquisitaIl: '2026-09-30T09:00:00+02:00', hash: 'C',
    descrizione: 'Fattura fittizia FT-DEMO-0042 del 02/04/2025 relativa a B01 e B02',
    contenutoLetto: [{ posizione: 'p.1', fatto: 'riga 1: centro di lavoro CDX-500 matricola DEMO-0001; riga 2: macchina di misura MM-300 matricola DEMO-0002' }],
    testo: ['FATTURA FT-DEMO-0042 del 02/04/2025 - DOCUMENTO DEMO FITTIZIO', 'Fornitore: Costruttore Demo S.p.A.', 'Cliente: Officine Demo Fittizie S.r.l.',
      '1) Centro di lavoro CDX-500 matricola DEMO-0001', '2) Macchina di misura MM-300 (Metrologia Demo S.r.l.) matricola DEMO-0002'],
  },
  {
    id: 'B01-RO5-001', beni: ['B01'], gruppo: 'DOC', requisiti: ['RO5', 'ID'], nome: 'DdC_B01_DdC-DEMO-0001.pdf',
    acquisitaIl: '2026-09-30T09:05:00+02:00', hash: 'C',
    descrizione: 'Dichiarazione CE di conformita fittizia del centro di lavoro B01',
    contenutoLetto: [{ posizione: 'p.1', fatto: 'DdC n. DdC-DEMO-0001 del 10/03/2025; Dir. 2006/42/CE e 2014/30/UE; modello CDX-500, matricola DEMO-0001' }],
    testo: ['DICHIARAZIONE CE DI CONFORMITA n. DdC-DEMO-0001 - DOCUMENTO DEMO FITTIZIO', 'Costruttore Demo S.p.A.', 'Centro di lavoro CDX-500 matricola DEMO-0001',
      'Direttive: 2006/42/CE, 2014/30/UE', 'Data: 10/03/2025'],
  },
  {
    id: 'B01-RO2-001', beni: ['B01', 'B02'], comune: true, gruppo: 5, requisiti: ['RO2'], nome: 'dichiarazione_rete_cliente.pdf',
    acquisitaIl: '2026-09-30T09:10:00+02:00', hash: 'C',
    descrizione: 'Dichiarazione scritta del referente IT del cliente su rete e data di interconnessione di B01 e B02',
    contenutoLetto: [{ posizione: 'p.1', fatto: 'B01: IP 192.0.2.21, MES-DEMO via OPC UA; B02: IP 192.0.2.35, cartella condivisa qualita via SMB; interconnessione di entrambi dal 20/05/2025' }],
    testo: ['DICHIARAZIONE DEL REFERENTE IT - DOCUMENTO DEMO FITTIZIO', 'Data: 28/09/2026', 'B01 centro di lavoro: IP 192.0.2.21, collegato a MES-DEMO via OPC UA',
      'B02 macchina di misura: IP 192.0.2.35, report su cartella condivisa qualita (SMB)', 'Interconnessione di entrambi i beni dal 20/05/2025'],
  },
  {
    id: 'B02-RO5-001', beni: ['B02'], gruppo: 'DOC', requisiti: ['RO5'], nome: 'DdC_B02_DdC-DEMO-0002.pdf',
    acquisitaIl: '2026-09-30T09:15:00+02:00', hash: 'S',
    descrizione: 'Dichiarazione CE di conformita fittizia della macchina di misura B02 (riferita al modello)',
    contenutoLetto: [{ posizione: 'p.1', fatto: 'DdC n. DdC-DEMO-0002 del 28/02/2025; Dir. 2006/42/CE e 2014/30/UE; modello MM-300, nessuna matricola indicata' }],
    testo: ['DICHIARAZIONE CE DI CONFORMITA n. DdC-DEMO-0002 - DOCUMENTO DEMO FITTIZIO', 'Metrologia Demo S.r.l.', 'Macchina di misura modello MM-300',
      'Direttive: 2006/42/CE, 2014/30/UE', 'Data: 28/02/2025'],
  },
];

// Evidenze acquisite dal perito in sopralluogo
const CAMPO = [
  { id: 'B01-ID-001', gruppo: 1, requisiti: ['ID'], t: '10:05', et: 'VISTA D INSIEME',
    descrizione: "Vista d'insieme del centro di lavoro B01 nel reparto lavorazioni, lato operatore",
    annotazioni: [{ tipo: 'riquadro', x: 0.1, y: 0.15, w: 0.8, h: 0.7, testo: 'centro di lavoro B01 con cabina chiusa' }] },
  { id: 'B01-ID-002', gruppo: 2, requisiti: ['ID', 'RO5'], t: '10:08', et: 'TARGA - RIFLESSO',
    descrizione: 'Targa CE di B01, primo scatto',
    stato: 'annullata', annullamento: { motivo: 'riflesso sulla targa: matricola illeggibile', data: ora(VISITA, '10:09'), sostituitaDa: 'B01-ID-003' } },
  { id: 'B01-ID-003', gruppo: 2, requisiti: ['ID', 'RO5'], t: '10:09', et: 'TARGA CE',
    descrizione: 'Targa CE di B01 ripresa senza riflessi',
    annotazioni: [{ tipo: 'riquadro', colore: '#FF453A', x: 0.2, y: 0.2, w: 0.6, h: 0.5, testo: 'targa: costruttore, modello, matricola, anno, marcatura CE' }],
    trascrizioni: [{ testo: 'COSTRUTTORE DEMO SPA - CDX-500 - MATR. DEMO-0001 - ANNO 2025 - CE', origine: 'manuale_campo', confrontataConOriginale: true, confrontataIl: ora(VISITA, '10:10') }] },
  { id: 'B01-RO1-001', gruppo: 3, requisiti: ['RO1'], t: '10:20', et: 'CN - PAGINA SISTEMA',
    descrizione: 'Pagina di sistema del controllo numerico di B01: marca, modello, versione firmware',
    annotazioni: [{ tipo: 'evidenziazione', x: 0.1, y: 0.4, w: 0.5, h: 0.1, testo: 'versione firmware letta: V4.2.3' }],
    trascrizioni: [{ testo: 'CONTROLLO DEMO CN-900 FW V4.2.3', origine: 'manuale_campo', confrontataConOriginale: true, confrontataIl: ora(VISITA, '10:21') }] },
  { id: 'B01-RO1-002', gruppo: 4, requisiti: ['RO1', 'RO4'], t: '10:42', et: 'HMI - PROGRAMMA P-17',
    descrizione: "HMI di B01: programma P-17 caricato e in esecuzione, ordine ODP-DEMO-0042 visibile nell'intestazione",
    dataMostrataAVideo: { valore: '15/10/2026 09:42', orologioErrato: true, scartoStimato: '-1 h (ora legale non applicata sul CN)', nota: 'ora reale 10:42 dal telefono del perito' },
    annotazioni: [
      { tipo: 'riquadro', x: 0.05, y: 0.1, w: 0.4, h: 0.12, testo: 'programma P-17' },
      { tipo: 'riquadro', x: 0.55, y: 0.1, w: 0.4, h: 0.12, testo: 'stato: in esecuzione' },
      { tipo: 'freccia', colore: '#FFD60A', x: 0.5, y: 0.6, x2: 0.3, y2: 0.25 },
      { tipo: 'testo', colore: '#FFD60A', x: 0.52, y: 0.62, testo: 'ordine ODP-DEMO-0042' }] },
  { id: 'B01-RO2-002', gruppo: 5, requisiti: ['RO2'], t: '10:45', et: 'HMI - PAGINA RETE',
    descrizione: "Pagina rete dell'HMI di B01: IP letto 192.0.2.21, client OPC UA connesso a MES-DEMO",
    annotazioni: [{ tipo: 'riquadro', x: 0.1, y: 0.3, w: 0.7, h: 0.2, testo: 'IP 192.0.2.21 - client OPC UA: connesso a MES-DEMO' }],
    trascrizioni: [{ testo: 'IP 192.0.2.21 / OPC UA CLIENT: CONNECTED - SERVER MES-DEMO', origine: 'manuale_campo', confrontataConOriginale: true, confrontataIl: ora(VISITA, '10:46') }] },
  { id: 'B01-RO2-003', gruppo: 5, requisiti: ['RO2'], t: '10:50', et: 'MES - ORDINE ODP 0042',
    descrizione: "Schermata MES-DEMO sul PC dell'ufficio produzione: ordine ODP-DEMO-0042 con ricetta P-17 inviato a B01; storico ordini con primo invio a B01 il 03/06/2025",
    dataMostrataAVideo: { valore: '15/10/2026 10:50', orologioErrato: false },
    annotazioni: [
      { tipo: 'riquadro', x: 0.05, y: 0.2, w: 0.9, h: 0.15, testo: 'ordine ODP-DEMO-0042, ricetta P-17, destinazione B01, stato inviato' },
      { tipo: 'riquadro', x: 0.05, y: 0.6, w: 0.9, h: 0.15, testo: 'storico: primo ordine a B01 il 03/06/2025' }] },
  { id: 'B01-RO2-004', tipo: 'vocale', gruppo: 5, requisiti: ['RO2'], t: '10:52', durata: 2,
    descrizione: 'Prova di invio ordine da MES-DEMO verso B01', nota: 'operatore al CN, richiamo del programma P-17' },
  { id: 'B01-RO2-005', tipo: 'video', gruppo: 5, requisiti: ['RO2'], t: '10:55', durata: 20,
    descrizione: "Video: invio dell'ordine dal MES e comparsa del programma sull'HMI di B01 (nella DEMO il file e un segnaposto di testo)" },
  { id: 'B01-RU1-001', gruppo: 7, requisiti: ['RU1'], t: '11:05', et: 'HMI - SERVIZIO REMOTO',
    descrizione: "Pagina 'Servizio remoto' dell'HMI di B01: modulo di teleassistenza presente, nessuna sessione in corso; nessun dato di accesso inquadrato" },
  { id: 'B01-RU2-001', gruppo: 8, requisiti: ['RU2'], t: '11:08', et: 'MONITORAGGIO MANDRINO',
    descrizione: 'Pagina di monitoraggio del mandrino di B01: trend delle vibrazioni con soglia di allarme',
    annotazioni: [{ tipo: 'evidenziazione', x: 0.1, y: 0.35, w: 0.8, h: 0.05, testo: 'soglia di allarme vibrazioni' }] },
  { id: 'B01.1-ID-001', beni: ['B01.1'], gruppo: 1, requisiti: ['ID'], t: '11:12', et: 'CAMBIO PALLET B01.1',
    descrizione: 'Cambio pallet automatico B01.1 collegato al centro di lavoro B01' },
  { id: 'B01.2-RO5-001', beni: ['B01.2'], gruppo: 2, requisiti: ['RO5', 'ID'], t: '11:15', et: 'TARGA ASPIRATORE B01.2', senzaMetadati: true,
    nota: "file senza metadati di scatto: resta solo l'ora di acquisizione nell'app",
    descrizione: 'Targa del sistema di aspirazione nebbie B01.2: costruttore diverso da quello di B01, marcatura CE propria',
    trascrizioni: [{ testo: 'ASPIRAZIONE DEMO SRL - AN-200 - MATR. DEMO-A-77 - CE', origine: 'manuale_campo', confrontataConOriginale: true, confrontataIl: ora(VISITA, '11:16') }] },
  { id: 'B02-ID-001', gruppo: 1, requisiti: ['ID'], t: '11:25', et: 'VISTA D INSIEME',
    descrizione: "Vista d'insieme della macchina di misura B02 in sala metrologica, con PC e software di misura" },
  { id: 'B02-ID-002', gruppo: 2, requisiti: ['ID', 'RO5'], t: '11:27', et: 'TARGA - MATR. DEMO-0020',
    descrizione: 'Targa di B02: matricola letta DEMO-0020',
    annotazioni: [{ tipo: 'cerchio', colore: '#FF453A', x: 0.3, y: 0.38, w: 0.4, h: 0.14 }, { tipo: 'testo', colore: '#FF453A', x: 0.3, y: 0.56, testo: 'matricola DEMO-0020' }],
    trascrizioni: [{ testo: 'METROLOGIA DEMO SRL - MM-300 - MATR. DEMO-0020 - ANNO 2025 - CE', origine: 'manuale_campo', confrontataConOriginale: true, confrontataIl: ora(VISITA, '11:28') }] },
  { id: 'B02-RO1-001', gruppo: 3, requisiti: ['RO1'], t: '11:29', et: 'CONTROLLORE UC-30',
    descrizione: 'Targhetta del controllore di B02',
    trascrizioni: [{ testo: 'CONTROLLO DEMO METROLOGIA UC-30', origine: 'manuale_campo', confrontataConOriginale: true, confrontataIl: ora(VISITA, '11:29') }] },
  { id: 'B02-RO2-001', gruppo: 10, requisiti: ['RO2'], t: '11:30', et: 'CARTELLA QUALITA',
    descrizione: 'Cartella condivisa \\\\SRV-DEMO\\qualita\\B02 vista dal PC della sala metrologica: report DEMO-PZ-118 creato alle 11:28 del 15/10/2026',
    dataMostrataAVideo: { valore: '15/10/2026 11:30', orologioErrato: false },
    annotazioni: [{ tipo: 'riquadro', x: 0.05, y: 0.3, w: 0.9, h: 0.1, testo: 'DEMO-PZ-118.pdf - modificato 15/10/2026 11:28' }] },
  { id: 'B02-RO2-002', tipo: 'documento', gruppo: 10, requisiti: ['RO2'], t: '11:33',
    descrizione: 'Report di misura DEMO-PZ-118 copiato dalla cartella condivisa in presenza della referente IT',
    contenutoLetto: [{ posizione: 'p.1', fatto: 'pezzo DEMO-PZ-118; macchina MM-300 matricola DEMO-0020; 15/10/2026 11:28; esito conforme' }],
    testo: ['REPORT DI MISURA DEMO-PZ-118 - DOCUMENTO DEMO FITTIZIO', 'Macchina: MM-300 matricola DEMO-0020', 'Data e ora: 15/10/2026 11:28',
      'Quote misurate: 12 su 12 entro tolleranza', 'Esito: conforme'] },
  { id: 'B02-RO2-003', gruppo: 5, requisiti: ['RO2'], t: '11:36', et: 'PC B02 - RETE',
    descrizione: 'Impostazioni di rete del PC di B02: IP 192.0.2.35, unita di rete mappata su \\\\SRV-DEMO\\qualita',
    trascrizioni: [{ testo: 'IPv4 192.0.2.35 - Q: = \\\\SRV-DEMO\\qualita', origine: 'manuale_campo', confrontataConOriginale: true, confrontataIl: ora(VISITA, '11:37') }] },
  { id: 'B01-DOC-002', gruppo: 'DOC', requisiti: ['DOC'], t: '11:40', et: 'VERBALE INSTALLAZIONE',
    descrizione: 'Verbale di installazione di B01 mostrato dal responsabile di produzione: data 14/04/2025, firme di fornitore e cliente',
    annotazioni: [{ tipo: 'riquadro', colore: '#FF453A', x: 0.55, y: 0.1, w: 0.4, h: 0.1, testo: 'data 14/04/2025' }] },
  { id: 'B03-ID-001', gruppo: 1, requisiti: ['ID'], t: '11:50', et: 'ROBOT B03',
    descrizione: 'Robot di carico e scarico accanto al cambio pallet di B01, targa con matricola DEMO-R-15',
    annotazioni: [{ tipo: 'freccia', colore: '#FF453A', x: 0.7, y: 0.8, x2: 0.55, y2: 0.55, testo: 'targa del robot' }] },
];

// ---------------------------------------------------------------------------
// Costruzione
// ---------------------------------------------------------------------------

rmSync(RADICE, { recursive: true, force: true });
const scrivi = (rel, dati) => {
  const p = join(RADICE, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, dati);
  return { sha256: sha256(Buffer.isBuffer(dati) ? dati : Buffer.from(dati, 'utf8')), byte: Buffer.byteLength(dati) };
};
const json = o => JSON.stringify(o, null, 2) + '\n';
const pulisci = o => JSON.parse(JSON.stringify(o));

// Documenti del cliente nel fascicolo
const evidenzePratica = [];
const manifestoPratica = [];
for (const d of DOCUMENTI) {
  const file = `evidenze/documenti/${d.nome}`;
  const f = scrivi(file, pdf(d.testo));
  evidenzePratica.push(pulisci({
    id: d.id, beni: d.beni, comune: d.comune, gruppo: d.gruppo, requisiti: d.requisiti, tipo: 'documento', file, mime: 'application/pdf',
    sha256: f.sha256, provenienza: 'cliente', acquisitaIl: d.acquisitaIl, descrizione: d.descrizione, contenutoLetto: d.contenutoLetto, stato: 'valida',
  }));
  manifestoPratica.push({ idEvidenza: d.id, file, sha256: f.sha256, byte: f.byte, dataAcquisizione: d.acquisitaIl, provenienza: 'cliente', hash: d.hash, marcaTemporale: { tipo: 'n/a' } });
}

// Media del sopralluogo: stesso contenuto nel rientro e nel fascicolo
const media = new Map();
for (const e of CAMPO) {
  const tipo = e.tipo || 'foto';
  const base = `${PRATICA}_${VISITA.replaceAll('-', '')}_${e.id}`;
  let nome, dati, mime, volume;
  if (tipo === 'foto') { nome = `${base}.png`; dati = png(['DEMO - DATI FITTIZI', e.id, e.et, `${VISITA} ${e.t}`], COLORI[e.gruppo] || [50, 50, 50]); mime = 'image/png'; volume = 1; }
  if (tipo === 'vocale') { nome = `${base}.wav`; dati = wav(e.durata); mime = 'audio/wav'; volume = 2; }
  if (tipo === 'video') { nome = `${base}.segnaposto.txt`; dati = Buffer.from('DEMO: segnaposto del video B01-RO2-005 (nessun contenuto reale).\n', 'utf8'); mime = 'text/plain'; volume = 2; }
  if (tipo === 'documento') { nome = `${base}.pdf`; dati = pdf(e.testo); mime = 'application/pdf'; volume = 2; }
  media.set(e.id, { nome, dati, mime, volume, tipo });
}

// Foto e video: data letta dai metadati; vocali: orologio del telefono durante la registrazione nell'app
function datiScatto(e, tipo) {
  if (tipo === 'documento') return {};
  if (e.senzaMetadati) return { origineDataScatto: 'assente' };
  return { origineDataScatto: tipo === 'vocale' ? 'registrazione_app' : 'metadati', dataScatto: ora(VISITA, e.t) };
}

const evidenzaCampo = (e, file) => {
  const m = media.get(e.id);
  return pulisci({
    id: e.id, beni: e.beni || [e.id.split('-')[0]], gruppo: e.gruppo, requisiti: e.requisiti, tipo: m.tipo, file, mime: m.mime,
    sha256: sha256(m.dati), provenienza: 'perito', idSopralluogo: 'S01', acquisitaIl: ora(VISITA, e.t, '20'),
    ...datiScatto(e, m.tipo),
    dataMostrataAVideo: e.dataMostrataAVideo, durataSecondi: e.durata, descrizione: e.descrizione, nota: e.nota,
    annotazioni: e.annotazioni, trascrizioni: e.trascrizioni, contenutoLetto: e.contenutoLetto,
    stato: e.stato || 'valida', annullamento: e.annullamento,
  });
};

// Schede dei beni (stato agli atti prima del sopralluogo)
const voce = (valore, stato, fonti = [], extra = {}) => ({ valore, fonti, stato, ...extra });
const ev = (idEvidenza, file, posizione, fattoLetto) => pulisci({ idEvidenza, file, posizione, fattoLetto });
const FATTURA = (f) => ev('B01-DOC-001', 'fattura_FT-DEMO-0042.pdf', 'p.1', f);
const DDC1 = (f) => ev('B01-RO5-001', 'DdC_B01_DdC-DEMO-0001.pdf', 'p.1', f);
const DDC2 = (f) => ev('B02-RO5-001', 'DdC_B02_DdC-DEMO-0002.pdf', 'p.1', f);
const RETE = (f) => ev('B01-RO2-001', 'dichiarazione_rete_cliente.pdf', 'p.1', f);

const gruppiPer = (profilo, ru) => GRUPPI.map(g => {
  let attesa = g[profilo];
  if (attesa === 'se_dichiarato') attesa = g.requisiti.some(r => ru.includes(r)) ? 'si' : 'non_applicabile';
  return { gruppo: g.gruppo, titolo: g.titolo, requisiti: g.requisiti, attesa };
});

const schede = {
  B01: {
    formato: 'perizia40.scheda_bene', versioneSchema: VERSIONE, demo: true, codicePratica: PRATICA, codice: 'B01',
    denominazione: 'Centro di lavoro CNC CDX-500', funzione: 'Fresatura e foratura a controllo numerico di componenti metallici', ubicazione: 'Reparto lavorazioni, campata 2',
    componenti: [
      { codice: 'B01.1', denominazione: 'Cambio pallet automatico', tipo: 'ACC', costruttore: 'Costruttore Demo S.p.A.', funzione: 'Scambio automatico dei pallet portapezzo' },
      { codice: 'B01.2', denominazione: 'Sistema di aspirazione nebbie oleose', tipo: 'M', costruttore: 'Aspirazione Demo S.r.l.', funzione: 'Aspirazione delle nebbie dalla cabina' },
    ],
    classificazione: {
      regime: 'CRI_4.0', allegato: 'A', gruppo: 1, voce: 'Macchine utensili per asportazione (voce abbreviata, DEMO)', profilo: 'completo', ruDichiarati: ['RU1', 'RU2'],
      sostenibilita: 'solida', motivazione: 'Asportazione di truciolo con controllo numerico su pezzi metallici, come da fattura', fonti: [FATTURA('riga 1: centro di lavoro CDX-500')],
    },
    datiAgliAtti: {
      identita: {
        costruttore: voce('Costruttore Demo S.p.A.', 'documentato', [FATTURA('fornitore Costruttore Demo S.p.A.'), DDC1('costruttore Costruttore Demo S.p.A.')]),
        modello: voce('CDX-500', 'documentato', [FATTURA('riga 1: CDX-500')]),
        matricola: voce('DEMO-0001', 'documentato', [FATTURA('riga 1: matricola DEMO-0001'), DDC1('matricola DEMO-0001')]),
        anno: voce('2025', 'documentato', [DDC1('data 10/03/2025')]),
      },
      controllore: {
        marca: voce('Controllo Demo', 'dichiarato', [], { nota: "indicata dal cliente al telefono; manuale non ancora ricevuto" }),
        modello: voce('CN-900', 'dichiarato'),
        firmware: voce('V4.2.1', 'dichiarato'),
      },
      hmi: { modello: voce('Pannello CN-900 da 15 pollici', 'dichiarato') },
      reteDichiarata: {
        ip: voce('192.0.2.21', 'dichiarato', [RETE('B01: IP 192.0.2.21')]),
        sistemaAziendale: voce('MES-DEMO', 'dichiarato', [RETE('collegato a MES-DEMO')]),
        protocollo: voce('OPC UA', 'dichiarato', [RETE('via OPC UA')]),
      },
      dichiarazioneCE: {
        numero: voce('DdC-DEMO-0001', 'documentato', [DDC1('n. DdC-DEMO-0001')]),
        data: voce('2025-03-10', 'documentato', [DDC1('data 10/03/2025')]),
        direttive: voce('2006/42/CE; 2014/30/UE', 'documentato', [DDC1('direttive 2006/42/CE, 2014/30/UE')]),
        riferimentoMatricola: voce('cita la matricola DEMO-0001', 'documentato', [DDC1('matricola DEMO-0001')]),
      },
      esitoGateC: {
        esito: 'giallo', stato: 'da_verificare', fonti: [DDC1('la DdC copre il solo CDX-500')],
        motivazione: "L'aspiratore B01.2 di altro costruttore e integrato nella cabina: verificare se la DdC di B01 copre l'insieme o se serve una DdC d'insieme",
      },
    },
    gruppiEvidenze: gruppiPer('completo', ['RU1', 'RU2']),
  },
  B02: {
    formato: 'perizia40.scheda_bene', versioneSchema: VERSIONE, demo: true, codicePratica: PRATICA, codice: 'B02',
    denominazione: 'Macchina di misura a coordinate MM-300', funzione: 'Misura dimensionale dei pezzi lavorati e generazione dei report di collaudo', ubicazione: 'Sala metrologica',
    componenti: [],
    classificazione: {
      regime: 'CRI_4.0', allegato: 'A', gruppo: 2, voce: 'Sistemi di misura a coordinate per la verifica dei requisiti geometrici di prodotto (voce abbreviata, DEMO)', profilo: 'ridotto',
      sostenibilita: 'solida', motivazione: 'Misura a coordinate dei pezzi con report di collaudo per pezzo', fonti: [FATTURA('riga 2: macchina di misura MM-300')],
    },
    datiAgliAtti: {
      identita: {
        costruttore: voce('Metrologia Demo S.r.l.', 'documentato', [FATTURA('riga 2: Metrologia Demo S.r.l.'), DDC2('costruttore Metrologia Demo S.r.l.')]),
        modello: voce('MM-300', 'documentato', [FATTURA('riga 2: MM-300'), DDC2('modello MM-300')]),
        matricola: voce('DEMO-0002', 'documentato', [FATTURA('riga 2: matricola DEMO-0002')]),
        anno: voce('2025', 'dichiarato'),
      },
      controllore: {
        marca: voce(null, 'da_verificare'),
        modello: voce(null, 'da_verificare'),
        firmware: voce(null, 'da_verificare'),
      },
      hmi: { modello: voce('Software DEMO-Measure 3 su PC', 'dichiarato') },
      reteDichiarata: {
        ip: voce('192.0.2.35', 'dichiarato', [RETE('B02: IP 192.0.2.35')]),
        sistemaAziendale: voce('Cartella condivisa qualita su SRV-DEMO', 'dichiarato', [RETE('report su cartella condivisa qualita')]),
        protocollo: voce('Condivisione file SMB', 'dichiarato', [RETE('SMB')]),
      },
      dichiarazioneCE: {
        numero: voce('DdC-DEMO-0002', 'documentato', [DDC2('n. DdC-DEMO-0002')]),
        data: voce('2025-02-28', 'documentato', [DDC2('data 28/02/2025')]),
        direttive: voce('2006/42/CE; 2014/30/UE', 'documentato', [DDC2('direttive 2006/42/CE, 2014/30/UE')]),
        riferimentoMatricola: voce('riferita al modello MM-300, senza matricola', 'documentato', [DDC2('nessuna matricola indicata')]),
      },
      esitoGateC: {
        esito: 'verde', stato: 'documentato', fonti: [DDC2('macchina singola, DdC del costruttore')],
        motivazione: 'Macchina singola con DdC del costruttore; nessun componente di terzi dichiarato',
      },
    },
    gruppiEvidenze: gruppiPer('ridotto', []),
  },
};

const VERIFICARE = ['identita.costruttore', 'identita.modello', 'identita.matricola', 'identita.anno', 'controllore.marca', 'controllore.modello', 'controllore.firmware',
  'hmi.modello', 'reteDichiarata.ip', 'reteDichiarata.sistemaAziendale', 'reteDichiarata.protocollo', 'dichiarazioneCE.riferimentoMatricola', 'esitoGateC'];
const ETICHETTE = {
  'identita.costruttore': 'Costruttore', 'identita.modello': 'Modello', 'identita.matricola': 'Matricola (leggere sulla targa)', 'identita.anno': 'Anno',
  'controllore.marca': 'PLC/CNC: marca', 'controllore.modello': 'PLC/CNC: modello', 'controllore.firmware': 'PLC/CNC: firmware', 'hmi.modello': 'HMI: modello',
  'reteDichiarata.ip': 'IP dichiarato', 'reteDichiarata.sistemaAziendale': 'Sistema aziendale', 'reteDichiarata.protocollo': 'Protocollo',
  'dichiarazioneCE.riferimentoMatricola': 'DdC: corrispondenza con la matricola in targa', esitoGateC: 'GATE C: perimetro e componenti',
};
const COSA_CERCARE = {
  1: 'contesto prima del dettaglio', 2: 'targa leggibile, senza riflessi; confrontare con fattura e DdC', 3: 'targa e pagina di sistema del controllore',
  4: 'pagine operative e livelli utente', 5: 'entrambi i lati dello scambio: bene e sistema aziendale, stesso ordine o dato', 6: 'flusso logistico o M2M effettivo',
  7: 'configurazione o sessione di telemanutenzione, senza credenziali', 8: 'variabili monitorate e reazione alle derive', 9: 'modello di comportamento e suo aggiornamento',
  10: 'percorso, file riferibili al bene, contenuto di almeno un report', DOC: 'originali in risoluzione nativa',
};
const valore = (sc, campo) => campo === 'esitoGateC' ? sc.datiAgliAtti.esitoGateC : sc.datiAgliAtti[campo.split('.')[0]][campo.split('.')[1]];

// Timeline agli atti prima del sopralluogo (va nell'andata)
const riga = (id, evento, beni, valore_, precisione, tipoData, origine, stato, prove, coerenza, descrizione, nota) =>
  pulisci({ id, evento, descrizione, beni, data: { valore: valore_, precisione }, tipoData, origine, stato, prove, coerenza, nota });
const TIMELINE_ATTI = [
  riga('T001', 'ordine', ['B01', 'B02'], '2025-01', 'mese', 'documento', 'dichiarazione_impresa', 'dichiarata', [], 'S', 'Ordine al fornitore', "conferma d'ordine non ancora ricevuta"),
  riga('T002', 'dichiarazione_conformita', ['B02'], '2025-02-28', 'giorno', 'documento', 'documento_terzo', 'documentata', [DDC2('data 28/02/2025')], 'S', 'DdC di B02'),
  riga('T003', 'dichiarazione_conformita', ['B01'], '2025-03-10', 'giorno', 'documento', 'documento_terzo', 'documentata', [DDC1('data 10/03/2025')], 'S', 'DdC di B01'),
  riga('T004', 'fattura', ['B01', 'B02'], '2025-04-02', 'giorno', 'documento', 'documento_fiscale', 'documentata', [FATTURA('data 02/04/2025')], 'S', 'Fattura FT-DEMO-0042'),
  riga('T005', 'installazione', ['B01'], '2025-04', 'mese', 'documento', 'dichiarazione_impresa', 'dichiarata', [], 'S', 'Installazione di B01', 'verbale di installazione da richiedere'),
  riga('T006', 'installazione', ['B02'], '2025-04-10/2025-04-20', 'periodo', 'documento', 'dichiarazione_impresa', 'dichiarata', [], 'S', 'Installazione di B02'),
  riga('T007', 'entrata_in_funzione', ['B01'], '2025-05-05', 'giorno', 'documento', 'dichiarazione_impresa', 'dichiarata', [], 'S', 'Entrata in funzione di B01'),
  riga('T008', 'interconnessione_dichiarata', ['B01', 'B02'], '2025-05-20', 'giorno', 'documento', 'dichiarazione_impresa', 'dichiarata', [RETE('interconnessione dal 20/05/2025')], 'S',
    'Interconnessione dichiarata dalla referente IT'),
];

// Pacchetto di andata
const azione = (id, priorita, beni, requisito, destinatario, cosaServe, percheServe, esempioAccettabile, apertaIl, categoria) =>
  pulisci({ id, priorita, beni, cosaServe, percheServe, requisito, esempioAccettabile, destinatario, categoria, stato: 'aperta', apertaIl });
const AZIONI_INIZIALI = [
  azione('A001', 'indispensabile', ['B01'], 'RO2', 'cliente', 'Esportazione dello storico ordini di MES-DEMO verso B01 dal 20/05/2025',
    "Datare l'inizio dello scambio dichiarato al 20/05/2025", 'Export CSV del MES con numero ordine, data, ora e identificativo macchina B01', '2026-10-01', 'documento'),
  azione('A002', 'raccomandata', ['B02'], 'RO5', 'fornitore', "DdC di B02 riferita all'esemplare (matricola)",
    'La DdC ricevuta e riferita al solo modello MM-300', 'DdC o attestazione del costruttore con modello e matricola di B02', '2026-10-01', 'documento'),
  azione('A003', 'indispensabile', ['B01'], 'RO2', 'perito', 'Riscontro in campo dello scambio MES-DEMO verso B01',
    'La dichiarazione del cliente da sola non dimostra lo scambio', 'Stesso ordine visibile sul MES e sull\'HMI di B01, con foto di entrambi i lati', '2026-10-01', 'evidenza'),
];
const andata = {
  formato: 'perizia40.andata', versioneSchema: VERSIONE, demo: true, idAndata: ID_ANDATA, revisione: 'rev001', creatoIl: '2026-10-10T18:00:00+02:00',
  codicePratica: PRATICA, regime: 'CRI_4.0', cliente: CLIENTE,
  sopralluogo: {
    id: 'S01', dataPrevista: VISITA, referenti: PERSONE,
    avvertenze: ['Prove sulla rete aziendale solo con la referente IT presente', 'Nessuna password, token o badge nelle foto: se compaiono, oscurare e segnalare',
      'Cambiare codice bene appena si passa fisicamente a un altro bene'],
  },
  beni: Object.values(schede).map(sc => ({
    codice: sc.codice, denominazione: sc.denominazione, funzione: sc.funzione, ubicazione: sc.ubicazione,
    componenti: sc.componenti.map(c => ({ codice: c.codice, denominazione: c.denominazione, tipo: c.tipo })),
    classificazione: pulisci({ allegato: sc.classificazione.allegato, gruppo: sc.classificazione.gruppo, voce: sc.classificazione.voce, profilo: sc.classificazione.profilo, ruDichiarati: sc.classificazione.ruDichiarati }),
    gruppiEvidenze: sc.gruppiEvidenze.map(g => ({ ...g, cosaCercare: COSA_CERCARE[g.gruppo] })),
    datiDaVerificare: VERIFICARE.map(campo => {
      const v = valore(sc, campo);
      return pulisci({
        campo, etichetta: ETICHETTE[campo], valoreAgliAtti: campo === 'esitoGateC' ? v.esito : v.valore, statoAgliAtti: v.stato,
        fonte: v.fonti.length ? v.fonti.map(f => `[ev: ${f.idEvidenza} | ${f.file}, ${f.posizione}]`).join(' ') : undefined,
      });
    }),
  })),
  timeline: TIMELINE_ATTI,
  azioniAperte: AZIONI_INIZIALI,
  evidenzeEsistenti: DOCUMENTI.map(d => d.id),
};
const fAndata = scrivi('andata/perizia40-andata.json', json(andata));

// Esiti in campo
const conf = (bene, campo, evidenze, nota) => ({ bene, campo, esito: 'confermato', evidenze, nota });
const VERIFICHE = [
  conf('B01', 'identita.costruttore', ['B01-ID-003']), conf('B01', 'identita.modello', ['B01-ID-003']),
  conf('B01', 'identita.matricola', ['B01-ID-003']), conf('B01', 'identita.anno', ['B01-ID-003']),
  conf('B01', 'controllore.marca', ['B01-RO1-001']), conf('B01', 'controllore.modello', ['B01-RO1-001']),
  { bene: 'B01', campo: 'controllore.firmware', esito: 'corretto', valoreRilevato: 'V4.2.3', evidenze: ['B01-RO1-001'], nota: 'aggiornamento firmware riferito dal manutentore; data da documentare' },
  conf('B01', 'hmi.modello', ['B01-RO1-002']), conf('B01', 'reteDichiarata.ip', ['B01-RO2-002']),
  conf('B01', 'reteDichiarata.sistemaAziendale', ['B01-RO2-003']), conf('B01', 'reteDichiarata.protocollo', ['B01-RO2-002']),
  conf('B01', 'dichiarazioneCE.riferimentoMatricola', ['B01-ID-003'], 'matricola in targa uguale a quella della DdC'),
  conf('B01', 'esitoGateC', ['B01.2-RO5-001', 'B01.1-ID-001'], "aspiratore B01.2 di altro costruttore montato sulla cabina: l'esito resta giallo"),
  conf('B02', 'identita.costruttore', ['B02-ID-002']), conf('B02', 'identita.modello', ['B02-ID-002']),
  { bene: 'B02', campo: 'identita.matricola', esito: 'difforme', valoreRilevato: 'DEMO-0020', evidenze: ['B02-ID-002', 'B02-RO2-002'], nota: 'targa e report di misura riportano DEMO-0020; la fattura riporta DEMO-0002' },
  conf('B02', 'identita.anno', ['B02-ID-002']),
  { bene: 'B02', campo: 'controllore.marca', esito: 'corretto', valoreRilevato: 'Controllo Demo Metrologia', evidenze: ['B02-RO1-001'] },
  { bene: 'B02', campo: 'controllore.modello', esito: 'corretto', valoreRilevato: 'UC-30', evidenze: ['B02-RO1-001'] },
  { bene: 'B02', campo: 'controllore.firmware', esito: 'non_verificabile', evidenze: [], nota: 'pagina di sistema accessibile solo al tecnico del fornitore: non richiesta' },
  conf('B02', 'hmi.modello', ['B02-ID-001']), conf('B02', 'reteDichiarata.ip', ['B02-RO2-003']),
  conf('B02', 'reteDichiarata.sistemaAziendale', ['B02-RO2-001']), conf('B02', 'reteDichiarata.protocollo', ['B02-RO2-003']),
  conf('B02', 'dichiarazioneCE.riferimentoMatricola', ['B02-ID-002'], 'la DdC resta riferita al solo modello'),
  conf('B02', 'esitoGateC', ['B02-ID-001']),
].map(v => {
  const sc = schede[v.bene];
  const x = valore(sc, v.campo);
  return pulisci({ bene: v.bene, campo: v.campo, valoreAgliAtti: v.campo === 'esitoGateC' ? x.esito : x.valore, esito: v.esito, valoreRilevato: v.valoreRilevato, evidenze: v.evidenze, data: VISITA, nota: v.nota });
});

const RISCONTRI = [
  {
    id: 'RD-001', bene: 'B01', requisito: 'RO2', idSopralluogo: 'S01', dataVisita: VISITA, ora: '10:42',
    fatto: 'il programma P-17 trasmesso da MES-DEMO con l\'ordine ODP-DEMO-0042 risultava caricato e in esecuzione',
    oggetto: "HMI del controllo numerico del centro di lavoro B01",
    circostanza: 'alle 10:42 del 15/10/2026, durante la prova di invio concordata con la referente IT',
    frase: "Il programma P-17 trasmesso da MES-DEMO con l'ordine ODP-DEMO-0042 risultava caricato e in esecuzione sull'HMI del bene B01 alle ore 10:42 del 15/10/2026, durante la prova di invio concordata con la referente IT.",
    evidenze: ['B01-RO1-002', 'B01-RO2-003', 'B01-RO2-005'],
    limiti: "Vale per la data della visita; non data l'inizio dello scambio dichiarato al 20/05/2025. Orologio del CN indietro di 1 h.",
  },
  {
    id: 'RD-002', bene: 'B02', requisito: 'RO2', idSopralluogo: 'S01', dataVisita: VISITA, ora: '11:30',
    fatto: 'il report di misura del pezzo DEMO-PZ-118, generato dalla macchina, era presente',
    oggetto: 'cartella condivisa qualita del server SRV-DEMO, sottocartella B02',
    circostanza: 'alle 11:30 del 15/10/2026, due minuti dopo la misura eseguita in presenza del perito',
    frase: 'Il report di misura del pezzo DEMO-PZ-118 generato dal bene B02 era presente nella cartella condivisa qualita del server SRV-DEMO alle ore 11:30 del 15/10/2026, due minuti dopo la misura eseguita in presenza del perito.',
    evidenze: ['B02-RO2-001', 'B02-RO2-002'],
    limiti: 'Verificato il flusso in uscita; nessun flusso in ingresso (programmi di misura dal sistema aziendale) osservato.',
  },
];
const DICHIARAZIONE_CAMPO = {
  id: 'DT-002', beni: ['B01'], persona: 'Paolo Campione', ruolo: 'Tecnico di automazione', organizzazione: 'Automazioni Demo S.r.l.', forma: 'verbale', data: VISITA,
  contenuto: 'La teleassistenza del costruttore su B01 e attiva dal collaudo e viene usata per gli interventi sul CN.', requisito: 'RU1',
  riscontroOggettivo: { esito: 'N', evidenze: [], nota: "riscontro da acquisire: registro delle sessioni richiesto con l'azione A005" },
};
const DATE_CAMPO = [
  {
    id: 'T001', evento: 'prima_prova_scambio', descrizione: 'Primo ordine a B01 nello storico di MES-DEMO', beni: ['B01'],
    data: { valore: '2025-06-03', precisione: 'giorno' }, tipoData: 'mostrata_a_video', origine: 'log_sistema', stato: 'documentata',
    prove: [ev('B01-RO2-003', media.get('B01-RO2-003').nome, 'riquadro 2', 'storico: primo ordine a B01 il 03/06/2025')],
    coerenza: 'N', nota: "Successiva di 14 giorni all'interconnessione dichiarata (20/05/2025): rappresentare lo scarto, non anticipare la data",
  },
  {
    id: 'T002', evento: 'verifica_perito', descrizione: 'Sopralluogo S01: scambio verificato su B01 e B02', beni: ['B01', 'B02'],
    data: { valore: VISITA, precisione: 'giorno' }, tipoData: 'verifica_perito', origine: 'riscontro_perito', stato: 'documentata',
    prove: [ev('B01-RO2-003', media.get('B01-RO2-003').nome, 'riquadro 1'), ev('B02-RO2-001', media.get('B02-RO2-001').nome, 'riquadro 1')], coerenza: 'S',
  },
  {
    id: 'T003', evento: 'installazione', descrizione: 'Verbale di installazione di B01 mostrato in visita', beni: ['B01'],
    data: { valore: '2025-04-14', precisione: 'giorno' }, tipoData: 'documento', origine: 'verbale', stato: 'documentata',
    prove: [ev('B01-DOC-002', media.get('B01-DOC-002').nome, 'riquadro 1', 'data 14/04/2025')], coerenza: 'S',
    rifTimeline: 'T005', esitoRif: 'precisata',
  },
];
// In campo le nuove azioni sono bozze; priorità, destinatario ed esempio si completano sul PC
const bozza = (id, categoria, beni, requisito, cosaServe, nota, generataDa) => pulisci({ id, categoria, beni, requisito, cosaServe, nota, generataDa, stato: 'aperta', apertaIl: VISITA });
const BOZZE = [
  bozza('A004', 'chiarimento', ['B02'], 'ID', 'Chiarimento sulla matricola di B02: DEMO-0020 in targa, DEMO-0002 in fattura', 'targa e report di misura concordano su DEMO-0020'),
  bozza('A005', 'documento', ['B01'], 'RU1', 'Registro delle sessioni di teleassistenza su B01', 'riscontro oggettivo da acquisire per DT-002', { tipo: 'dichiarazione', id: 'DT-002' }),
  bozza('A006', 'evidenza', ['B01'], 'RO3', 'Evidenze del flusso automatizzato tra B01, cambio pallet B01.1 e logistica', 'vedi nota di campo NC-001', { tipo: 'nota', id: 'NC-001' }),
  bozza('A007', 'chiarimento', ['B03'], 'ID', "Chiarire se il robot B03 fa parte dell'investimento", "non presente nell'elenco dei beni del cliente"),
];
const COMPLETAMENTO = {
  A004: ['indispensabile', 'fornitore', 'Incoerenza tra bene periziato e bene fatturato', 'Attestazione del costruttore sulla matricola e, se necessario, nota di rettifica della fattura'],
  A005: ['utile', 'integratore', "La dichiarazione verbale dell'integratore non e riscontrata", 'Export del registro sessioni con data, ora e identificativo macchina, senza credenziali'],
  A006: ['indispensabile', 'cliente', 'Gruppo 6 (integrazione) senza materiale dopo il sopralluogo', 'Log o schermata del sistema che assegna i pallet a B01, con data e identificativo'],
  A007: ['raccomandata', 'cliente', 'Bene trovato in campo e non censito nella pratica', "Fattura o ordine del robot, oppure dichiarazione che non fa parte dell'investimento"],
};
const NUOVE_AZIONI = BOZZE.map(b => {
  const [priorita, destinatario, percheServe, esempioAccettabile] = COMPLETAMENTO[b.id];
  return pulisci({ ...b, priorita, destinatario, percheServe, esempioAccettabile });
});
const BENI_NUOVI = [{
  codice: 'B03', denominazione: 'Robot di carico e scarico', funzione: 'Carico e scarico dei pezzi sul cambio pallet di B01', ubicazione: 'Reparto lavorazioni, campata 2',
  matricolaTarga: { valore: 'DEMO-R-15', stato: 'letta', evidenza: 'B03-ID-001' }, componenti: [],
  nota: "Non presente nell'elenco dei beni del cliente: perimetro da chiarire (azione A007)",
}];
const NOTE_CAMPO = [
  { id: 'NC-001', bene: 'B01', requisito: 'RO3', testo: 'Il referente indica il collegamento al magazzino utensili; ancora da fotografare.', ora: ora(VISITA, '11:42'), base: 'promemoria' },
];
const AGGIORNAMENTI = [
  { idAzione: 'A001', esitoCampo: 'parziale', evidenze: ['B01-RO2-003'], nota: "Storico visto a video con primo ordine al 03/06/2025; manca l'export richiesto" },
  { idAzione: 'A002', esitoCampo: 'non_risolta', nota: 'Il cliente sollecitera il fornitore' },
  { idAzione: 'A003', esitoCampo: 'proposta_chiusura', motivoProposto: 'riscontro_diretto', riscontro: 'RD-001', evidenze: ['B01-RO1-002', 'B01-RO2-003'] },
];

// Pacchetto di rientro finale in due volumi: foto nel primo, audio, video e documenti nel secondo
const evidenzeRientro = CAMPO.map(e => evidenzaCampo(e, `evidenze/${media.get(e.id).nome}`));
const manifestoRientro = CAMPO.map(e => {
  const m = media.get(e.id);
  return { idEvidenza: e.id, file: `evidenze/${m.nome}`, sha256: sha256(m.dati), byte: m.dati.length, dataAcquisizione: ora(VISITA, e.t, '20'), provenienza: 'perito', hash: 'C', marcaTemporale: { tipo: 'n/a' }, volume: m.volume };
});
const pacchettiPratica = [{ tipo: 'andata', id: ID_ANDATA, file: 'andata/perizia40-andata.json', sha256: fAndata.sha256, data: andata.creatoIl }];
for (const n of [1, 2]) {
  const zip = `rientro/${PRATICA}_rientro_FIN_20261015-1730_v${n}di2.zip`;
  const rientro = {
    formato: 'perizia40.rientro', versioneSchema: VERSIONE, demo: true, idRientro: ID_RIENTRO, tipoPacchetto: 'finale', volume: { numero: n, totale: 2 },
    andata: { idAndata: ID_ANDATA, revisione: 'rev001', sha256: fAndata.sha256 }, codicePratica: PRATICA,
    app: { versione: '0.0.0-demo', piattaforma: 'iOS (DEMO)', installata: true }, creatoIl: ora(VISITA, '17:30'), fusoOrario: 'Europe/Rome',
    sopralluogo: { id: 'S01', data: VISITA, inizio: '09:50', fine: '12:10', presenti: PERSONE },
    beniNuovi: BENI_NUOVI, evidenze: evidenzeRientro, verificheDati: VERIFICHE, riscontriDiretti: RISCONTRI, dichiarazioniTerzi: [DICHIARAZIONE_CAMPO],
    noteCampo: NOTE_CAMPO, dateRilevate: DATE_CAMPO, nuoveAzioni: BOZZE, aggiornamentiAzioni: AGGIORNAMENTI, manifesto: manifestoRientro,
  };
  const voci = [{ nome: 'perizia40-rientro.json', dati: Buffer.from(json(rientro), 'utf8') }];
  for (const e of CAMPO) {
    const m = media.get(e.id);
    if (m.volume === n) voci.push({ nome: `evidenze/${m.nome}`, dati: m.dati });
  }
  const hash = voci.map(v => `${sha256(v.dati)}  ${v.nome}`).join('\n') + '\n';
  voci.splice(1, 0, { nome: 'hash.sha256', dati: Buffer.from(hash, 'utf8') });
  const f = scrivi(zip, Buffer.from(scriviZip(voci, '2026-10-15T17:30:00')));
  pacchettiPratica.push({ tipo: 'rientro_finale', id: ID_RIENTRO, volume: n, file: zip, sha256: f.sha256, data: rientro.creatoIl });
}

// Importazione nel fascicolo: copia dei media, esiti nelle schede, registri, timeline rinumerata
for (const e of CAMPO) {
  const m = media.get(e.id);
  const file = `evidenze/sopralluogo_S01/${m.nome}`;
  scrivi(file, m.dati);
  const x = evidenzaCampo(e, file);
  if (e.id === 'B01-RO2-004') x.trascrizioni = [{ testo: "Prova di invio: ordine ODP-DEMO-0042 partito dal MES alle 10:41, programma P-17 comparso sull'HMI di B01 alle 10:42.", origine: 'claude_pc', confrontataConOriginale: true, confrontataIl: '2026-10-16T09:30:00+02:00' }];
  if (e.id === 'B01-RO2-005') x.trascrizioni = [{ testo: "Audio del video: 'ordine inviato... eccolo sul pannello'.", origine: 'claude_pc', confrontataConOriginale: false, nota: 'da riascoltare: nella DEMO il video e un segnaposto' }];
  evidenzePratica.push(x);
  manifestoPratica.push({ idEvidenza: e.id, file, sha256: sha256(m.dati), byte: m.dati.length, dataAcquisizione: ora(VISITA, e.t, '20'), provenienza: 'perito', hash: 'C', marcaTemporale: { tipo: 'n/a' } });
}
for (const v of VERIFICHE) {
  valore(schede[v.bene], v.campo).verificaCampo = pulisci({ esito: v.esito, valoreRilevato: v.valoreRilevato, evidenze: v.evidenze, idRientro: ID_RIENTRO, data: v.data, nota: v.nota });
}


const TIMELINE = [
  ...TIMELINE_ATTI.map(r => r.id !== 'T005' ? r : {
    ...r, data: { valore: '2025-04-14', precisione: 'giorno' }, origine: 'verbale', stato: 'documentata',
    prove: [ev('B01-DOC-002', media.get('B01-DOC-002').nome, 'riquadro 1', 'data 14/04/2025')], nota: 'precisata in campo (S01) con il verbale di installazione',
  }).map(r => r.id !== 'T008' ? r : {
    ...r, coerenza: 'N', nota: 'per B01 la prima prova datata (T009) e del 03/06/2025: scarto di 14 giorni; per B02 nessuna prova datata anteriore alla visita',
  }),
  { ...DATE_CAMPO[0], id: 'T009' },
  { ...DATE_CAMPO[1], id: 'T010' },
];

const azioniPratica = [
  ...AZIONI_INIZIALI.filter(a => a.id !== 'A003'),
  { ...AZIONI_INIZIALI[2], stato: 'chiusa', chiusura: { data: '2026-10-16', motivo: 'riscontro_diretto', riscontro: 'RD-001', evidenze: [ev('B01-RO2-003', media.get('B01-RO2-003').nome, 'riquadro 1')], motivazione: 'Scambio verificato sui due lati (MES e HMI) nel sopralluogo S01; resta aperta la datazione storica (A001)' } },
  ...NUOVE_AZIONI,
].sort((a, b) => a.id.localeCompare(b.id));

const pratica = {
  formato: 'perizia40.pratica', versioneSchema: VERSIONE, demo: true, codicePratica: PRATICA, regime: 'CRI_4.0', annualita: 2025, aggiornataIl: '2026-10-20T12:00:00+02:00',
  cliente: CLIENTE, perito: { nome: 'Perito DEMO' }, persone: PERSONE,
  beni: Object.values(schede).map(sc => ({ codice: sc.codice, denominazione: sc.denominazione, scheda: `beni/${sc.codice}.json` })),
  sopralluoghi: [{ id: 'S01', data: VISITA, stato: 'eseguito', presenti: ['P01', 'P02', 'P03'] }],
  beniNuovi: BENI_NUOVI, evidenze: evidenzePratica, timeline: TIMELINE, azioni: azioniPratica, riscontriDiretti: RISCONTRI,
  dichiarazioniTerzi: [
    {
      id: 'DT-001', beni: ['B01', 'B02'], persona: 'Laura Fittizia', ruolo: 'Referente IT', organizzazione: CLIENTE.ragioneSociale, forma: 'scritta', data: '2026-09-28',
      contenuto: 'B01 e collegato a MES-DEMO via OPC UA e B02 alla cartella condivisa qualita, entrambi dal 20/05/2025.', requisito: 'RO2', evidenzaDichiarazione: 'B01-RO2-001',
      riscontroOggettivo: {
        esito: 'S', nota: 'riscontrato lo scambio alla data della visita, non la data del 20/05/2025',
        evidenze: [ev('B01-RO2-003', media.get('B01-RO2-003').nome, 'riquadro 1', 'ordine ODP-DEMO-0042 inviato a B01'), ev('B02-RO2-002', media.get('B02-RO2-002').nome, 'p.1', 'report DEMO-PZ-118 del 15/10/2026')],
      },
    },
    DICHIARAZIONE_CAMPO,
  ],
  noteCampo: NOTE_CAMPO, manifesto: manifestoPratica, pacchetti: pacchettiPratica,
};

for (const sc of Object.values(schede)) scrivi(`beni/${sc.codice}.json`, json(sc));
scrivi('pratica_40.json', json(pratica));
console.log(`Pratica DEMO rigenerata in ${RADICE}`);
