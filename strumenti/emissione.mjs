#!/usr/bin/env node
// Emissione e chiusura della perizia di un bene, nella sequenza dello studio:
//   per-la-firma  la bozza diventa definitiva (il Word si rigenera senza «BOZZA»), si stampa la perizia
//   giuramento    dati del verbale del tribunale (data, tribunale, R.G.V.G., cronologico): la perizia è giurata e non si
//                 rigenera più; l'analisi tecnica si rigenera con i dati del giuramento
//   registra      documenti finali (scansione della perizia giurata, analisi tecnica in PDF, fascicolo fotografico…),
//                 firmati PAdES o CAdES (.p7m) e marcati (nel PDF, nella busta, o a parte .tsr/.tsd/.m7m)
//   chiudi        controlla che tutto ci sia e non sia cambiato; da qui il bene è in sola lettura
//   verifica      ricontrolla le impronte dei documenti finali registrati
//
// Uso:
//   node strumenti/emissione.mjs per-la-firma "<cartella>" --bene B01 [--data AAAA-MM-GG]
//   node strumenti/emissione.mjs giuramento "<cartella>" --bene B01 --data AAAA-MM-GG --tribunale "…" --rgvg "…" --cronologico "…"
//   node strumenti/emissione.mjs registra "<cartella>" --bene B01 --tipo perizia_giurata_scansione "<file>" [--marca "<file.tsr>"]…
//   node strumenti/emissione.mjs chiudi "<cartella>" --bene B01 [--forza "motivo"]
//   node strumenti/emissione.mjs verifica "<cartella>"

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, basename, resolve, relative, sep } from 'node:path';
import { caricaSchemi, caricaCartella, validaCaricata, sha256 } from './lib/disco.mjs';
import { analizzaFile, opensslDisponibile } from './lib/firme.mjs';

export const TIPI = ['perizia_definitiva', 'perizia_giurata_scansione', 'analisi_tecnica', 'fascicolo_fotografico', 'allegato'];
// Per chiudere servono, firmati e marcati: la perizia giurata scansionata e l'analisi tecnica
export const RICHIESTI = ['perizia_giurata_scansione', 'analisi_tecnica'];
const ora = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0'), o = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${o >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(o) / 60))}:${p(Math.abs(o) % 60)}`;
};

function carica(cartella, bene) {
  const pratica = JSON.parse(readFileSync(join(cartella, 'pratica_40.json'), 'utf8'));
  const b = pratica.beni.find(x => x.codice === bene);
  if (!b) throw new Error(`bene ${bene} non nella pratica`);
  const file = join(cartella, b.scheda);
  const scheda = JSON.parse(readFileSync(file, 'utf8'));
  scheda.elaborato = scheda.elaborato || { revisione: 0, stato: 'bozza' };
  const salva = () => writeFileSync(file, JSON.stringify(scheda, null, 2) + '\n');
  return { pratica, scheda, el: scheda.elaborato, salva };
}
const nonChiuso = el => { if (el.chiusoIl) throw new Error(`il bene è chiuso dal ${el.chiusoIl}: in sola lettura`); };
const esitoPratica = cartella => validaCaricata(caricaCartella(cartella), caricaSchemi(), {});

export function perLaFirma(cartella, bene, o = {}) {
  const { el, salva } = carica(cartella, bene);
  nonChiuso(el);
  if (el.stato === 'giurata') throw new Error('la perizia è già giurata');
  const prima = esitoPratica(cartella);
  if (prima.errori.length) return { fatto: false, esito: prima };
  el.stato = 'per_la_firma';
  el.data = o.data || ora().slice(0, 10);
  salva();
  return { fatto: true, esito: esitoPratica(cartella) };
}

export function giuramento(cartella, bene, o) {
  for (const k of ['data', 'tribunale', 'rgvg', 'cronologico']) if (!o[k]) throw new Error(`manca --${k}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.data)) throw new Error('--data nel formato AAAA-MM-GG');
  const { el, salva } = carica(cartella, bene);
  nonChiuso(el);
  if (el.stato !== 'per_la_firma' && el.stato !== 'giurata') throw new Error(`la perizia è in stato ${el.stato}: prima «per-la-firma»`);
  el.giuramento = { data: o.data, tribunale: o.tribunale, rgvg: o.rgvg, cronologico: o.cronologico };
  el.stato = 'giurata';
  salva();
  return { fatto: true, esito: esitoPratica(cartella) };
}

// Firma e marche di un documento finale, con le marche a parte indicate
export function descriviDocumento(buf, nome, marcheFile = []) {
  const a = analizzaFile(buf, nome);
  const formato = !a.firme.length ? 'nessuna' : a.tipo === 'pdf' ? 'pades' : 'cades';
  const integrita = !a.firme.length ? undefined : a.firme.some(f => f.integrita === 'errata') ? 'errata'
    : a.firme.every(f => f.integrita === 'verificata') ? 'verificata' : 'non_verificata';
  const firma = JSON.parse(JSON.stringify({
    formato, firme: a.firme.length || undefined, firmatario: (a.firme[0] || {}).firmatario, dataFirma: (a.firme[0] || {}).dataFirma, integrita,
    contenutoSha256: a.contenuto ? sha256(a.contenuto) : undefined,
  }));
  const marche = a.marche.map(m => JSON.parse(JSON.stringify({
    formato: m.formato, file: ['tsd', 'm7m'].includes(m.formato) ? nome : undefined, data: m.data || undefined, riferita: m.riferita,
  })));
  for (const mf of marcheFile) {
    const x = analizzaFile(mf.buf, mf.nome, [buf, ...(a.contenuto ? [a.contenuto] : [])]);
    if (!x.marche.length) throw new Error(`${mf.nome}: nessuna marca temporale riconosciuta`);
    for (const m of x.marche) marche.push(JSON.parse(JSON.stringify({ formato: m.formato, file: mf.rel, sha256: sha256(mf.buf), data: m.data || undefined, riferita: m.riferita })));
  }
  return { firma, marche, modificatoDopoFirma: !!a.modificatoDopoFirma, contenuto: a.contenuto };
}

// File dentro la cartella della pratica: si registra dov'è; da fuori si copia in perizia/finale/
function porta(cartella, file) {
  const ass = resolve(file);
  const rel = relative(resolve(cartella), ass);
  if (!rel.startsWith('..') && !rel.includes(':')) return rel.split(sep).join('/');
  const dest = `perizia/finale/${basename(ass)}`;
  mkdirSync(join(cartella, 'perizia', 'finale'), { recursive: true });
  if (existsSync(join(cartella, dest)) && sha256(readFileSync(join(cartella, dest))) !== sha256(readFileSync(ass))) {
    throw new Error(`${dest} esiste già con un contenuto diverso: rinominare il file`);
  }
  copyFileSync(ass, join(cartella, dest));
  return dest;
}

export function registra(cartella, bene, o) {
  if (!TIPI.includes(o.tipo)) throw new Error(`--tipo tra ${TIPI.join(', ')}`);
  if (!o.file || !existsSync(o.file)) throw new Error(`file non trovato: ${o.file}`);
  const { el, salva } = carica(cartella, bene);
  nonChiuso(el);
  if (o.tipo !== 'perizia_definitiva' && el.stato !== 'giurata') throw new Error('prima registrare il giuramento: i documenti finali seguono la perizia giurata');
  const rel = porta(cartella, o.file);
  const buf = readFileSync(join(cartella, rel));
  const marcheFile = (o.marche || []).map(m => { const r = porta(cartella, m); return { rel: r, nome: basename(r), buf: readFileSync(join(cartella, r)) }; });
  const d = descriviDocumento(buf, basename(rel), marcheFile);
  const avvisi = [];
  if (d.firma.integrita === 'errata') throw new Error(`${rel}: la firma non corrisponde al contenuto (documento modificato dopo la firma o firma danneggiata): non registrato`);
  if (d.modificatoDopoFirma) avvisi.push('il PDF ha modifiche successive all\'ultima firma: controllare con il software di firma');
  if (d.firma.integrita === 'non_verificata') avvisi.push('integrità della firma non verificata (openssl non disponibile)');
  if (d.marche.some(m => m.riferita === 'no')) throw new Error('una marca a parte non riporta l\'impronta di questo documento: non è la sua marca');
  if (d.firma.formato === 'nessuna') avvisi.push('documento senza firma digitale');
  if (!d.marche.length) avvisi.push('documento senza marca temporale');
  el.documentiFinali = el.documentiFinali || [];
  const impronta = sha256(buf);
  const gia = el.documentiFinali.find(x => x.file === rel);
  if (gia && gia.sha256 !== impronta) throw new Error(`${rel} è già registrato con un'impronta diversa: salvare la nuova versione con un altro nome`);
  const voce = JSON.parse(JSON.stringify({ tipo: o.tipo, file: rel, sha256: impronta, registratoIl: gia ? gia.registratoIl : ora(), firma: d.firma, marche: d.marche, nota: o.nota }));
  if (gia) Object.assign(gia, voce); else el.documentiFinali.push(voce);
  salva();
  return { voce, avvisi, esito: esitoPratica(cartella) };
}

// Cosa manca per chiudere: giuramento completo, documenti richiesti firmati (integri) e marcati, impronte invariate
export function mancanze(cartella, el) {
  const m = [];
  if (el.stato !== 'giurata') m.push(`stato ${el.stato}: serve il giuramento`);
  const g = el.giuramento || {};
  for (const k of ['data', 'tribunale', 'rgvg', 'cronologico']) if (!g[k]) m.push(`giuramento senza ${k}`);
  const docs = el.documentiFinali || [];
  for (const t of RICHIESTI) {
    const d = docs.filter(x => x.tipo === t);
    if (!d.length) { m.push(`manca il documento ${t.replace(/_/g, ' ')}`); continue; }
    if (!d.some(x => x.firma.formato !== 'nessuna')) m.push(`${t.replace(/_/g, ' ')}: senza firma digitale`);
    if (!d.some(x => x.marche.some(k => k.riferita !== 'no'))) m.push(`${t.replace(/_/g, ' ')}: senza marca temporale`);
  }
  for (const d of docs) {
    const p = join(cartella, d.file);
    if (!existsSync(p)) m.push(`${d.file}: file non più presente`);
    else if (sha256(readFileSync(p)) !== d.sha256) m.push(`${d.file}: modificato dopo la registrazione`);
    for (const k of d.marche) if (k.file && k.sha256 && (!existsSync(join(cartella, k.file)) || sha256(readFileSync(join(cartella, k.file))) !== k.sha256)) m.push(`${k.file}: marca mancante o modificata`);
  }
  return m;
}

export function chiudi(cartella, bene, o = {}) {
  const { el, salva } = carica(cartella, bene);
  nonChiuso(el);
  const m = mancanze(cartella, el);
  const bloccanti = m.filter(x => /modificat|non più presente|serve il giuramento|giuramento senza/.test(x));
  if (bloccanti.length || (m.length && !o.forza)) return { fatto: false, mancanze: m };
  if (m.length) el.chiusuraForzata = `${o.forza} (mancava: ${m.join('; ')})`;
  el.chiusoIl = ora();
  salva();
  return { fatto: true, mancanze: m, esito: esitoPratica(cartella) };
}

export function verifica(cartella) {
  const pratica = JSON.parse(readFileSync(join(cartella, 'pratica_40.json'), 'utf8'));
  return pratica.beni.map(b => {
    const el = JSON.parse(readFileSync(join(cartella, b.scheda), 'utf8')).elaborato || {};
    return { bene: b.codice, stato: el.stato || 'bozza', chiusoIl: el.chiusoIl, documenti: (el.documentiFinali || []).length,
      problemi: mancanze(cartella, el).filter(x => /modificat|non più presente/.test(x)) };
  });
}

if (process.argv[1] && process.argv[1].endsWith('emissione.mjs')) {
  const [comando, ...a] = process.argv.slice(2);
  const opz = n => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  const marche = a.flatMap((x, i) => x === '--marca' ? [a[i + 1]] : []);
  const liberi = a.filter((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
  const [cartella, file] = liberi;
  const stampa = esito => { for (const e of [...esito.errori, ...esito.avvisi.filter(x => /GIURAMENTO|DOCUMENTO_FINALE|CHIUS|FIRMA|MARCA/.test(x.codice))]) console.log(`  ${e.livello === 'errore' ? 'ERRORE' : 'avviso'} ${e.codice}: ${e.messaggio}`); };
  try {
    if (!cartella) throw new Error('indicare la cartella della pratica');
    const bene = opz('bene');
    if (comando !== 'verifica' && !bene) throw new Error('indicare --bene');
    if (comando === 'per-la-firma') {
      const r = perLaFirma(cartella, bene, { data: opz('data') });
      if (!r.fatto) { console.log('Non ancora: il fascicolo ha errori da correggere.'); stampa(r.esito); process.exit(1); }
      console.log(`${bene}: perizia «per la firma». Rigenerare il Word (senza «BOZZA»), rileggere e stampare la perizia da giurare.`);
      stampa(r.esito);
    } else if (comando === 'giuramento') {
      const r = giuramento(cartella, bene, { data: opz('data'), tribunale: opz('tribunale'), rgvg: opz('rgvg'), cronologico: opz('cronologico') });
      console.log(`${bene}: perizia giurata. Rigenerare l'analisi tecnica (riporta i dati del giuramento; la perizia non si rigenera più), poi PDF, firma e marca.`);
      stampa(r.esito);
    } else if (comando === 'registra') {
      const r = registra(cartella, bene, { tipo: opz('tipo'), file, marche, nota: opz('nota') });
      const v = r.voce;
      console.log(`${bene}: registrato ${v.tipo.replace(/_/g, ' ')} → ${v.file}`);
      console.log(`  firma: ${v.firma.formato}${v.firma.firmatario ? ` · ${v.firma.firmatario}` : ''}${v.firma.integrita ? ` · integrità ${v.firma.integrita.replace('_', ' ')}` : ''}${v.firma.dataFirma ? ` · firmata (dichiarato) ${v.firma.dataFirma}` : ''}`);
      for (const m of v.marche) console.log(`  marca: ${m.formato}${m.file ? ` (${m.file})` : ''} · ${m.data || 'ora non letta'} UTC · riferita al documento: ${m.riferita.replace('_', ' ')}`);
      for (const x of r.avvisi) console.log(`  avviso: ${x}`);
      if (!opensslDisponibile()) console.log('  nota: openssl non disponibile, integrità delle firme non verificata');
      stampa(r.esito);
    } else if (comando === 'chiudi') {
      const r = chiudi(cartella, bene, { forza: opz('forza') });
      if (!r.fatto) { console.log(`${bene}: non chiuso. Manca:`); for (const x of r.mancanze) console.log(`  - ${x}`); process.exit(1); }
      console.log(`${bene}: chiuso. Da ora la perizia del bene è in sola lettura.${r.mancanze.length ? ` Chiusura forzata: ${r.mancanze.join('; ')}` : ''}`);
      stampa(r.esito);
    } else if (comando === 'verifica') {
      for (const x of verifica(cartella)) console.log(`${x.bene}: ${x.stato}${x.chiusoIl ? ` · chiuso il ${x.chiusoIl}` : ''} · ${x.documenti} documenti finali${x.problemi.length ? ` · PROBLEMI: ${x.problemi.join('; ')}` : ' · impronte invariate'}`);
    } else throw new Error('comando tra per-la-firma, giuramento, registra, chiudi, verifica');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
