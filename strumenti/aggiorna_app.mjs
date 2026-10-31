#!/usr/bin/env node
// Prepara la PWA dopo ogni modifica ai suoi file:
//  - scrive app/precache.js con l'elenco dei file da tenere offline e una versione ricavata dal loro contenuto
//    (cambia un file → cambia la versione → il telefono propone l'aggiornamento);
//  - riporta la versione in app/sw.js (un sw.js diverso è il segnale più sicuro di aggiornamento per Safari);
//  - aggiorna in app/index.html l'impronta SHA-256 della mappa di importazione ammessa dalla policy di sicurezza.
// Uso: node strumenti/aggiorna_app.mjs           (scrive)
//      node strumenti/aggiorna_app.mjs --verifica (esce con 1 se i file non sono aggiornati)

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(RADICE, 'app');
const ESCLUSI = new Set(['sw.js', 'precache.js', 'vendor/LEGGIMI.md', 'vendor/LICENSE-preact.txt', 'vendor/LICENSE-htm.txt']);
const ESTERNI = [
  'strumenti/lib/validatore.mjs',
  'strumenti/lib/zip.mjs',
  ...readdirSync(join(RADICE, 'schemi', 'v1')).filter(f => f.endsWith('.json')).map(f => `schemi/v1/${f}`),
  'demo/PRATICA_DEMO_2026_001/andata/perizia40-andata.json',
];

function elenca(cartella) {
  return readdirSync(cartella).flatMap(n => {
    const p = join(cartella, n);
    return statSync(p).isDirectory() ? elenca(p) : [p];
  });
}

const sha = (buf, cod = 'hex') => createHash('sha256').update(buf).digest(cod);

export function calcola() {
  let indice = readFileSync(join(APP, 'index.html'), 'utf8');
  const mappa = /<script type="importmap">([\s\S]*?)<\/script>/.exec(indice)[1];
  indice = indice.replace(/script-src 'self' 'sha256-[^']*'/, `script-src 'self' 'sha256-${sha(mappa, 'base64')}'`);

  const file = [
    ...elenca(APP).map(p => relative(APP, p).split(sep).join('/')).filter(f => !ESCLUSI.has(f)).sort(),
    ...ESTERNI.map(f => `../${f}`),
  ];
  const contenuto = f => f === 'index.html' ? Buffer.from(indice) : readFileSync(join(APP, f));
  const versione = sha(file.map(f => `${f} ${sha(contenuto(f))}`).join('\n')).slice(0, 16);
  const precache = `// Generato da strumenti/aggiorna_app.mjs: non modificare a mano.\nself.VERSIONE = '${versione}';\nself.FILE_APP = ${JSON.stringify(file.map(f => f.startsWith('../') ? f : `./${f}`), null, 2)};\n`;
  const sw = readFileSync(join(APP, 'sw.js'), 'utf8').replace(/^\/\/ Versione dei file: \S+/m, `// Versione dei file: ${versione}`);
  return { indice, precache, sw, versione, n: file.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { indice, precache, sw, versione, n } = calcola();
  const pIndice = join(APP, 'index.html'), pPre = join(APP, 'precache.js'), pSw = join(APP, 'sw.js');
  const leggiSe = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
  if (process.argv.includes('--verifica')) {
    const ok = leggiSe(pIndice) === indice && leggiSe(pPre) === precache && leggiSe(pSw) === sw;
    console.log(ok ? `app aggiornata (versione ${versione}, ${n} file)` : 'app NON aggiornata: eseguire node strumenti/aggiorna_app.mjs');
    process.exit(ok ? 0 : 1);
  }
  writeFileSync(pIndice, indice);
  writeFileSync(pPre, precache);
  writeFileSync(pSw, sw);
  console.log(`precache.js: versione ${versione}, ${n} file`);
}
