#!/usr/bin/env node
// Registra un documento del cliente come evidenza del fascicolo: copia identica in evidenze/documenti/ (l'originale
// in documenti_cliente/ non si tocca), codice B01-DOC-001 senza collisioni, impronta SHA-256, riga di manifesto.
// I fatti letti nel documento (contenutoLetto) e i dati agli atti li compila poi Claude, citando il codice.
//
// Uso: node strumenti/registra_documento.mjs <cartella pratica> <file> --beni B01[,B02] --descrizione "…"
//        [--gruppo DOC] [--requisiti DOC[,RO5]] [--tipo documento|screenshot|log|foto|altro] [--provenienza cliente|fornitore|integratore]

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { caricaSchemi, caricaCartella, validaCaricata } from './lib/disco.mjs';

const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv', '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };

function isoLocale(d) {
  const z = -d.getTimezoneOffset(), s = z >= 0 ? '+' : '-', a = Math.abs(z);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

export function registraDocumento(cartella, file, o) {
  const fp = join(cartella, 'pratica_40.json');
  const pratica = JSON.parse(readFileSync(fp, 'utf8'));
  if (!existsSync(file)) throw new Error(`file non trovato: ${file}`);
  const beni = o.beni || [];
  if (!beni.length) throw new Error('serve --beni (es. B01 oppure B01,B02)');
  const noti = new Set(pratica.beni.map(b => b.codice));
  for (const b of beni) if (!noti.has(b.split('.')[0])) throw new Error(`bene ${b} non nel fascicolo`);
  if (!o.descrizione) throw new Error('serve --descrizione');
  const gruppo = o.gruppo || 'DOC';
  const requisiti = o.requisiti && o.requisiti.length ? o.requisiti : ['DOC'];
  const dati = readFileSync(file);
  const sha = createHash('sha256').update(dati).digest('hex');
  const gia = pratica.evidenze.find(e => e.sha256 === sha);
  if (gia) throw new Error(`documento già registrato come ${gia.id} (${gia.file})`);

  // codice: primo bene + primo requisito, primo progressivo libero
  const usati = new Set(pratica.evidenze.map(e => e.id));
  let n = 1, id;
  do id = `${beni[0]}-${requisiti[0]}-${String(n++).padStart(3, '0')}`; while (usati.has(id));
  if (o.id) {
    if (usati.has(o.id)) throw new Error(`${o.id} già usato`);
    id = o.id;
  }
  // nome originale; se esiste già un file diverso con lo stesso nome, si antepone il codice
  mkdirSync(join(cartella, 'evidenze', 'documenti'), { recursive: true });
  let nome = basename(file);
  if (existsSync(join(cartella, 'evidenze', 'documenti', nome))) nome = `${id}_${nome}`;
  const rel = `evidenze/documenti/${nome}`;
  if (resolve(file) !== resolve(join(cartella, rel))) copyFileSync(file, join(cartella, rel));
  const ora = isoLocale(o.ora || new Date());
  const tipo = o.tipo || 'documento';
  const evidenza = {
    id, beni, ...(beni.length > 1 ? { comune: true } : {}), gruppo, requisiti, tipo, file: rel,
    mime: MIME[extname(nome).toLowerCase()] || 'application/octet-stream', sha256: sha, provenienza: o.provenienza || 'cliente',
    acquisitaIl: ora, ...(['foto', 'video'].includes(tipo) ? { origineDataScatto: 'assente' } : {}), descrizione: o.descrizione, stato: 'valida',
  };
  pratica.evidenze.push(evidenza);
  pratica.manifesto.push({ idEvidenza: id, file: rel, sha256: sha, byte: dati.length, dataAcquisizione: ora, provenienza: evidenza.provenienza, hash: 'C', marcaTemporale: { tipo: 'n/a' } });
  pratica.aggiornataIl = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  writeFileSync(fp, JSON.stringify(pratica, null, 2) + '\n');
  return { id, file: rel, sha256: sha, esito: validaCaricata(caricaCartella(cartella), caricaSchemi(), {}) };
}

if (process.argv[1] && process.argv[1].endsWith('registra_documento.mjs')) {
  const a = process.argv.slice(2);
  const opz = n => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  const lista = n => opz(n) ? opz(n).split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const [cartella, file] = a;
  if (!cartella || !file || file.startsWith('--')) {
    console.error('Uso: node strumenti/registra_documento.mjs <cartella pratica> <file> --beni B01[,B02] --descrizione "…" [--gruppo DOC] [--requisiti DOC,RO5] [--tipo documento]');
    process.exit(2);
  }
  try {
    const r = registraDocumento(cartella, file, { beni: lista('beni'), descrizione: opz('descrizione'), gruppo: opz('gruppo') && (/^\d+$/.test(opz('gruppo')) ? Number(opz('gruppo')) : opz('gruppo')),
      requisiti: lista('requisiti'), tipo: opz('tipo'), id: opz('id'), provenienza: opz('provenienza') });
    console.log(`${r.id}  ${r.file}  sha256 ${r.sha256}`);
    for (const e of r.esito.errori) console.log(`  ERRORE ${e.codice}: ${e.messaggio}`);
    process.exit(r.esito.errori.length ? 1 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
