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
