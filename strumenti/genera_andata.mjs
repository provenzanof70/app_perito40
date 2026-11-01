#!/usr/bin/env node
// F3.2 · Genera il pacchetto di andata per l'app di sopralluogo dal fascicolo della pratica.
// Scrive andata/<nome pratica> - perizia40-andata.json (la revisione precedente resta come …_revNNN.json),
// registra il sopralluogo previsto e il pacchetto in pratica_40.json, poi valida la pratica.
//
// Uso: node strumenti/genera_andata.mjs <cartella pratica> --data AAAA-MM-GG [--sopralluogo S02] [--avvertenza "testo"]…
// Le indicazioni di studio per il campo si leggono, se presente, da andata/guida_requisiti.json ([{requisito, beni?, testo}]).

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { caricaSchemi, caricaCartella, validaCaricata, sha256 } from './lib/disco.mjs';
import { costruisciAndata } from './lib/andata.mjs';

const VERSIONE = '1.7.0';
const isoLocale = d => {
  const p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${o >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(o) / 60))}:${p(Math.abs(o) % 60)}`;
};

// «<nome della cartella pratica> - perizia40-andata», senza i caratteri vietati nei nomi di file
export const nomeFileAndata = cartella => `${basename(resolve(cartella)).replace(/[\\/:*?"<>|]/g, '-')} - perizia40-andata`;

// o: { data, sopralluogo?, avvertenze?, ora? }
export function generaAndata(cartella, o) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.data || '')) throw new Error('serve --data AAAA-MM-GG del sopralluogo previsto');
  const fp = join(cartella, 'pratica_40.json');
  const pratica = JSON.parse(readFileSync(fp, 'utf8'));
  if (!pratica.beni.length) throw new Error('la pratica non ha beni: censirli prima con nuovo_bene.mjs');
  const schede = new Map(pratica.beni.map(b => [b.codice, JSON.parse(readFileSync(join(cartella, b.scheda), 'utf8'))]));
  if ([...schede.values()].every(sc => sc.elaborato && sc.elaborato.chiusoIl)) throw new Error('tutti i beni della pratica sono chiusi: niente nuovo sopralluogo');

  // Sopralluogo: quello indicato, oppure l'ultimo ancora previsto (nuova revisione della stessa visita), oppure il successivo
  const ultimo = pratica.sopralluoghi[pratica.sopralluoghi.length - 1];
  const id = o.sopralluogo || (ultimo && ultimo.stato === 'previsto' ? ultimo.id : `S${String(pratica.sopralluoghi.length + 1).padStart(2, '0')}`);
  if (!/^S\d{2}$/.test(id)) throw new Error(`codice sopralluogo non valido: ${id}`);
  const esistente = pratica.sopralluoghi.find(s => s.id === id);
  if (esistente && esistente.stato !== 'previsto') throw new Error(`il sopralluogo ${id} è già ${esistente.stato}: indicarne uno nuovo`);
  if (esistente) esistente.data = o.data;
  else pratica.sopralluoghi.push({ id, data: o.data, stato: 'previsto' });

  const precedenti = pratica.pacchetti.filter(p => p.tipo === 'andata');
  const revisione = `rev${String(precedenti.length + 1).padStart(3, '0')}`;
  const guida = join(cartella, 'andata', 'guida_requisiti.json');
  const ora = o.ora || new Date();
  const andata = costruisciAndata(pratica, schede, {
    versione: VERSIONE, idAndata: randomUUID(), revisione, creatoIl: isoLocale(ora),
    sopralluogo: { id, dataPrevista: o.data, avvertenze: o.avvertenze && o.avvertenze.length ? o.avvertenze : undefined },
    guidaRequisiti: existsSync(guida) ? JSON.parse(readFileSync(guida, 'utf8')) : undefined,
  });

  // Il nome del file porta quello della pratica: sul telefono le andate di pratiche diverse non si confondono
  const base = `andata/${nomeFileAndata(cartella)}`;
  // La revisione precedente resta nella cartella con il suo numero: i rientri che ne derivano si controllano ancora
  for (const p of precedenti) {
    if (/_rev\d{3}\.json$/.test(p.file) || !existsSync(join(cartella, p.file))) continue;
    const vecchia = JSON.parse(readFileSync(join(cartella, p.file), 'utf8'));
    const nome = `${base}_${vecchia.revisione}.json`;
    renameSync(join(cartella, p.file), join(cartella, nome));
    p.file = nome;
  }
  const relativo = `${base}.json`;
  const file = join(cartella, relativo);
  const testo = JSON.stringify(andata, null, 2) + '\n';
  writeFileSync(file, testo);
  pratica.pacchetti.push({ tipo: 'andata', id: andata.idAndata, file: relativo, sha256: sha256(Buffer.from(testo, 'utf8')), data: andata.creatoIl });
  pratica.aggiornataIl = andata.creatoIl;
  writeFileSync(fp, JSON.stringify(pratica, null, 2) + '\n');

  const esito = validaCaricata(caricaCartella(cartella), caricaSchemi(), {});
  return { andata, file, esito };
}

if (process.argv[1] && process.argv[1].endsWith('genera_andata.mjs')) {
  const a = process.argv.slice(2);
  const opz = n => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  const avvertenze = a.flatMap((x, i) => x === '--avvertenza' ? [a[i + 1]] : []);
  const cartella = a.find((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
  if (!cartella) {
    console.error('Uso: node strumenti/genera_andata.mjs <cartella pratica> --data AAAA-MM-GG [--sopralluogo S02] [--avvertenza "testo"]…');
    process.exit(2);
  }
  try {
    const { andata, file, esito } = generaAndata(cartella, { data: opz('data'), sopralluogo: opz('sopralluogo'), avvertenze });
    const dati = andata.beni.reduce((n, b) => n + b.datiDaVerificare.length, 0);
    console.log(`Andata ${andata.revisione} per il sopralluogo ${andata.sopralluogo.id} del ${andata.sopralluogo.dataPrevista}: ${file}`);
    console.log(`  ${andata.beni.length} beni · ${dati} dati agli atti da verificare · ${andata.timeline.length} date · ${andata.azioniAperte.length} azioni aperte · ${(andata.guidaRequisiti || []).length} indicazioni di studio`);
    console.log("  Sul telefono: salvare il file in File (iCloud Drive) e importarlo dall'app con «Importa pacchetto di andata».");
    for (const e of [...esito.errori, ...esito.avvisi]) console.log(`  ${e.livello === 'errore' ? 'ERRORE' : 'avviso'} ${e.codice}: ${e.messaggio}`);
    process.exit(esito.errori.length ? 1 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
