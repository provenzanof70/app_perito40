#!/usr/bin/env node
// Diario di lavoro della pratica (DIARIO.md nella sua cartella): cosa è stato fatto, le decisioni, il prossimo passo.
// Serve a riprendere una pratica senza dipendere dalle conversazioni precedenti: il cruscotto mostra l'ultimo prossimo passo.
//
// Uso: node strumenti/diario.mjs "<cartella pratica>" --fatto "…" [--fatto "…"]… [--decisione "…"]… --prossimo "…" [--data AAAA-MM-GG]
//      node strumenti/diario.mjs "<cartella pratica>" --leggi

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export const FILE_DIARIO = 'DIARIO.md';
const oggi = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

export function iniziaDiario(cartella, titolo) {
  const f = join(cartella, FILE_DIARIO);
  if (!existsSync(f)) writeFileSync(f, `# Diario della pratica · ${titolo}\n\nUna voce per sessione di lavoro, la più recente in fondo. Il cruscotto delle pratiche mostra l'ultimo «Prossimo passo».\n`);
  return f;
}

// o: { fatto: [], decisioni: [], prossimo, data? }
export function aggiungiVoce(cartella, o) {
  if (!o.prossimo) throw new Error('serve --prossimo: il passo da cui ripartire');
  const pratica = JSON.parse(readFileSync(join(cartella, 'pratica_40.json'), 'utf8'));
  const f = iniziaDiario(cartella, `${pratica.codicePratica} · ${pratica.cliente.ragioneSociale}`);
  const righe = [`\n## ${o.data || oggi()}\n`];
  for (const x of o.fatto || []) righe.push(`- Fatto: ${x}`);
  for (const x of o.decisioni || []) righe.push(`- Decisione: ${x}`);
  righe.push(`- **Prossimo passo:** ${o.prossimo}`);
  appendFileSync(f, righe.join('\n') + '\n');
  return f;
}

// Ultima voce: data e prossimo passo
export function ultimaVoce(cartella) {
  const f = join(cartella, FILE_DIARIO);
  if (!existsSync(f)) return null;
  const t = readFileSync(f, 'utf8');
  const date = [...t.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)];
  const passi = [...t.matchAll(/\*\*Prossimo passo:\*\*\s*(.+)$/gm)];
  return date.length ? { data: date[date.length - 1][1], prossimo: passi.length ? passi[passi.length - 1][1].trim() : null } : null;
}

if (process.argv[1] && process.argv[1].endsWith('diario.mjs')) {
  const a = process.argv.slice(2);
  const tutti = n => a.flatMap((x, i) => x === `--${n}` ? [a[i + 1]] : []);
  const cartella = a.find((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--') && a[i - 1] !== '--leggi'));
  try {
    if (!cartella) throw new Error('Uso: node strumenti/diario.mjs "<cartella pratica>" --fatto "…" --prossimo "…"  |  --leggi');
    if (a.includes('--leggi')) {
      const f = join(cartella, FILE_DIARIO);
      console.log(existsSync(f) ? readFileSync(f, 'utf8') : 'Nessun diario per questa pratica.');
    } else {
      console.log(`Diario aggiornato: ${aggiungiVoce(cartella, { fatto: tutti('fatto'), decisioni: tutti('decisione'), prossimo: tutti('prossimo')[0], data: tutti('data')[0] })}`);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
