#!/usr/bin/env node
// Validatore Perizia 4.0 — uso:
//   node strumenti/valida.mjs <cartella pratica | cartella che contiene pratiche | file.json> [--repo-pubblico] [--json] [--senza-avvisi]
//   node strumenti/valida.mjs <volume1.zip> [volume2.zip …] [--andata perizia40-andata.json]
// Esce con codice 1 se trova errori.

import { statSync, existsSync } from 'node:fs';
import { caricaSchemi, caricaCartella, caricaZip, validaCaricata, validaFile, trovaPratiche } from './lib/disco.mjs';

const arg = process.argv.slice(2);
const opzioni = {
  repoPubblico: arg.includes('--repo-pubblico'),
  json: arg.includes('--json'),
  senzaAvvisi: arg.includes('--senza-avvisi'),
};
const iAndata = arg.indexOf('--andata');
const andata = iAndata >= 0 ? arg[iAndata + 1] : null;
const bersagli = arg.filter((a, i) => !a.startsWith('--') && !(iAndata >= 0 && i === iAndata + 1));
if (!bersagli.length) {
  console.error('Uso: node strumenti/valida.mjs <cartella pratica | cartella | file.json | volumi .zip> [--andata file.json] [--repo-pubblico] [--json] [--senza-avvisi]');
  process.exit(2);
}

const registro = caricaSchemi();
const risultati = [];
const zip = bersagli.filter(b => b.toLowerCase().endsWith('.zip'));
if (zip.length) {
  for (const z of [...zip, andata].filter(Boolean)) if (!existsSync(z)) { console.error(`Non trovato: ${z}`); process.exit(2); }
  risultati.push({ bersaglio: zip.join(', '), esito: validaCaricata(caricaZip(zip, andata), registro, { ...opzioni, soloRientro: true }) });
}
for (const b of bersagli.filter(b => !zip.includes(b))) {
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
