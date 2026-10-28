#!/usr/bin/env node
// Validatore Perizia 4.0 — uso:
//   node strumenti/valida.mjs <cartella pratica | cartella che contiene pratiche | file.json> [--repo-pubblico] [--json] [--senza-avvisi]
// Esce con codice 1 se trova errori.

import { statSync, existsSync } from 'node:fs';
import { caricaSchemi, caricaCartella, validaCaricata, validaFile, trovaPratiche } from './lib/disco.mjs';

const arg = process.argv.slice(2);
const opzioni = {
  repoPubblico: arg.includes('--repo-pubblico'),
  json: arg.includes('--json'),
  senzaAvvisi: arg.includes('--senza-avvisi'),
};
const bersagli = arg.filter(a => !a.startsWith('--'));
if (!bersagli.length) {
  console.error('Uso: node strumenti/valida.mjs <cartella pratica | cartella | file.json> [--repo-pubblico] [--json] [--senza-avvisi]');
  process.exit(2);
}

const registro = caricaSchemi();
const risultati = [];
for (const b of bersagli) {
  if (!existsSync(b)) { console.error(`Non trovato: ${b}`); process.exit(2); }
  if (statSync(b).isDirectory()) {
    const pratiche = trovaPratiche(b);
    if (!pratiche.length) { console.error(`Nessuna pratica_40.json in ${b}`); process.exit(2); }
    for (const p of pratiche) risultati.push({ bersaglio: p, esito: validaCaricata(caricaCartella(p), registro, opzioni) });
  } else {
    risultati.push({ bersaglio: b, esito: validaFile(b, registro, opzioni) });
  }
}

let errori = 0;
if (opzioni.json) {
  console.log(JSON.stringify(risultati.map(r => ({ bersaglio: r.bersaglio, voci: r.esito.voci })), null, 2));
  errori = risultati.reduce((n, r) => n + r.esito.errori.length, 0);
} else {
  for (const { bersaglio, esito } of risultati) {
    console.log(`\n== ${bersaglio}`);
    const voci = opzioni.senzaAvvisi ? esito.errori : esito.voci;
    for (const v of voci) console.log(`${v.livello === 'errore' ? 'ERRORE' : 'avviso'}  ${v.codice}  ${v.dove}\n        ${v.messaggio}`);
    console.log(`-- ${esito.errori.length} errori, ${esito.avvisi.length} avvisi`);
    errori += esito.errori.length;
  }
}
process.exit(errori ? 1 : 0);
