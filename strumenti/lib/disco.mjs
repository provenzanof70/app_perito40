// Lettura da disco e orchestrazione dei controlli (solo Node, nessuna dipendenza).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nuovoEsito, creaRegistroSchemi, validaStruttura, controllaRiservatezza, controllaScheda,
  controllaPratica, controllaPacchetti, controllaAndata, controllaVolumeRientro, controllaVolumi,
  controllaImportazione,
} from './validatore.mjs';

const CARTELLA_SCHEMI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schemi', 'v1');

export function caricaSchemi(cartella = CARTELLA_SCHEMI) {
  return creaRegistroSchemi(readdirSync(cartella).filter(f => f.endsWith('.schema.json')).map(f => JSON.parse(readFileSync(join(cartella, f), 'utf8'))));
}

const rel = (base, p) => relative(base, p).split(sep).join('/');

function elencaFile(cartella) {
  const out = [];
  for (const n of readdirSync(cartella)) {
    const p = join(cartella, n);
    if (statSync(p).isDirectory()) out.push(...elencaFile(p));
    else out.push(p);
  }
  return out;
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Legge una cartella pratica: impronte di tutti i file, documenti JSON riconosciuti, file hash.sha256
export function caricaCartella(cartella) {
  const file = new Map();
  const documenti = new Map();
  const testi = new Map();
  const illeggibili = [];
  for (const p of elencaFile(cartella)) {
    const r = rel(cartella, p);
    const buf = readFileSync(p);
    file.set(r, { sha256: sha256(buf), byte: buf.length });
    if (r.endsWith('.json')) {
      try { documenti.set(r, JSON.parse(buf.toString('utf8'))); } catch (e) { illeggibili.push([r, e.message]); }
    }
    if (r.endsWith('hash.sha256')) testi.set(r, buf.toString('utf8'));
  }
  return { cartella, file, documenti, testi, illeggibili };
}

function sottoMappa(file, prefisso) {
  const m = new Map();
  for (const [k, v] of file) if (k.startsWith(prefisso)) m.set(k.slice(prefisso.length), v);
  return m;
}

// Valida una pratica caricata. opzioni: { repoPubblico }
export function validaCaricata(car, registro, opzioni = {}) {
  const esito = nuovoEsito();
  for (const [r, m] of car.illeggibili) esito.errore('JSON_ILLEGGIBILE', r, m);

  const doc = car.documenti;
  const pratica = doc.get('pratica_40.json');
  const strutturaOk = new Map();
  for (const [r, d] of doc) {
    if (!d || !d.formato || !String(d.formato).startsWith('perizia40.')) continue;
    strutturaOk.set(r, validaStruttura(d, registro, esito, r));
    const demo = d.demo === true || !!opzioni.repoPubblico;
    if (opzioni.repoPubblico && d.demo !== true) esito.errore('DEMO_FLAG', r, 'nel repository pubblico ogni file deve avere demo = true');
    controllaRiservatezza(d, esito, r, { demo });
  }
  if (!pratica) { esito.errore('PRATICA_MANCANTE', car.cartella, 'manca pratica_40.json'); return esito; }
  const ok = r => strutturaOk.get(r) === true;

  const schede = new Map();
  for (const [r, d] of doc) {
    if (d && d.formato === 'perizia40.scheda_bene' && ok(r)) { controllaScheda(d, esito, r); schede.set(r, d); }
  }
  let schedePerCodice = new Map();
  if (ok('pratica_40.json')) {
    const tutteOk = pratica.beni.every(b => !doc.has(b.scheda) || ok(b.scheda));
    if (tutteOk) ({ schedePerCodice } = controllaPratica({ pratica, schede, file: car.file }, esito));
    else esito.avviso('CONTROLLI_SALTATI', 'pratica_40.json', 'schede con errori di struttura: controlli incrociati della pratica non eseguiti');
    controllaPacchetti(pratica, car.file, esito);
  }

  const andate = new Map();
  for (const [r, d] of doc) {
    if (d && d.formato === 'perizia40.andata' && ok(r)) {
      controllaAndata(d, esito, r, ok('pratica_40.json') ? pratica : null);
      andate.set(d.idAndata, { doc: d, sha256: car.file.get(r).sha256 });
    }
  }

  const volumi = [];
  for (const [r, d] of doc) {
    if (!d || d.formato !== 'perizia40.rientro' || !ok(r)) continue;
    const base = r.slice(0, r.length - 'perizia40-rientro.json'.length);
    const hashFile = `${base}hash.sha256`;
    volumi.push({ doc: d, dove: r, file: sottoMappa(car.file, base), hashSha256: car.testi.has(hashFile) ? car.testi.get(hashFile) : null });
  }
  const pacchetti = controllaVolumi(volumi, esito);
  // Il contenuto si controlla sul primo volume di ogni pacchetto; sugli altri solo file e impronte
  for (const vv of pacchetti.values()) {
    vv.sort((a, b) => a.doc.volume.numero - b.doc.volume.numero);
    vv.forEach((v, i) => controllaVolumeRientro(v, andate.get(v.doc.andata.idAndata) || null, esito, v.dove, { soloFile: i > 0 }));
  }

  if (ok('pratica_40.json')) {
    const importati = new Set(pratica.pacchetti.filter(p => p.tipo === 'rientro_finale').map(p => p.id));
    for (const [id, vv] of pacchetti) {
      if (vv[0].doc.tipoPacchetto === 'finale' && importati.has(id)) controllaImportazione(pratica, schedePerCodice, vv[0].doc, esito, vv[0].dove);
    }
  }
  return esito;
}

// Valida un singolo file JSON (solo struttura, riservatezza e controlli interni alla scheda)
export function validaFile(percorso, registro, opzioni = {}) {
  const esito = nuovoEsito();
  let d;
  try { d = JSON.parse(readFileSync(percorso, 'utf8')); } catch (e) { esito.errore('JSON_ILLEGGIBILE', percorso, e.message); return esito; }
  const ok = validaStruttura(d, registro, esito, percorso);
  controllaRiservatezza(d, esito, percorso, { demo: d.demo === true || !!opzioni.repoPubblico });
  if (opzioni.repoPubblico && d.demo !== true) esito.errore('DEMO_FLAG', percorso, 'nel repository pubblico ogni file deve avere demo = true');
  if (ok && d.formato === 'perizia40.scheda_bene') controllaScheda(d, esito, percorso);
  if (ok && d.formato === 'perizia40.andata') controllaAndata(d, esito, percorso, null);
  return esito;
}

// Cerca le cartelle pratica sotto una radice (esclusi i casi errati)
export function trovaPratiche(radice) {
  if (existsSync(join(radice, 'pratica_40.json'))) return [radice];
  const out = [];
  for (const n of readdirSync(radice)) {
    const p = join(radice, n);
    if (n === 'casi_errati' || n === 'node_modules' || n.startsWith('.')) continue;
    if (statSync(p).isDirectory()) out.push(...trovaPratiche(p));
  }
  return out;
}
