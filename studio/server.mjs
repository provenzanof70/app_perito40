#!/usr/bin/env node
// Perito 4.0 Studio: la versione desktop dell'app, sulle cartelle delle pratiche di questo PC.
// Server locale senza dipendenze, in ascolto solo su 127.0.0.1: nessun servizio esterno, nessun accesso dalla rete.
// Le operazioni usano gli stessi script della riga di comando (crea_pratica, registra_documento, diario, cruscotto, validatore).
//
// Uso: node studio/server.mjs "<cartella delle pratiche>" [--porta 4040] [--apri]

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, extname, basename, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { caricaSchemi, caricaCartella, validaCaricata, trovaPratiche, sha256 } from '../strumenti/lib/disco.mjs';
import { cruscotto } from '../strumenti/cruscotto.mjs';
import { creaPratica } from '../strumenti/crea_pratica.mjs';
import { registraDocumento } from '../strumenti/registra_documento.mjs';
import { aggiungiVoce, FILE_DIARIO } from '../strumenti/diario.mjs';
import { GRUPPI } from '../strumenti/lib/validatore.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.heic': 'image/heic', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const CARICATI = 'Caricati con lo Studio';
const LIMITE = 300 * 1024 * 1024;

export function avviaStudio(radice, { porta = 4040 } = {}) {
  radice = resolve(radice);
  if (!existsSync(radice)) throw new Error(`cartella delle pratiche non trovata: ${radice}`);
  const token = randomBytes(24).toString('hex');
  const registro = caricaSchemi();
  const pratiche = () => new Map(trovaPratiche(radice).map(c => [basename(c), c]));
  const cartellaDi = nome => { const c = pratiche().get(nome); if (!c) throw errore(404, `pratica non trovata: ${nome}`); return c; };
  // Percorso relativo dentro una cartella, senza uscirne
  const dentro = (base, rel) => {
    const p = resolve(base, rel || '');
    if (p !== base && !p.startsWith(base + sep)) throw errore(400, 'percorso non ammesso');
    return p;
  };

  function datiPratica(cartella) {
    const pratica = JSON.parse(readFileSync(join(cartella, 'pratica_40.json'), 'utf8'));
    const schede = pratica.beni.map(b => JSON.parse(readFileSync(join(cartella, b.scheda), 'utf8')));
    const registrati = new Map(pratica.evidenze.map(e => [e.sha256, e.id]));
    const documenti = [];
    const scorri = (dir, rel = '') => {
      if (!existsSync(dir)) return;
      for (const n of readdirSync(dir).sort((a, b) => a.localeCompare(b, 'it', { numeric: true }))) {
        const p = join(dir, n), r = rel ? `${rel}/${n}` : n;
        const s = statSync(p);
        if (s.isDirectory()) scorri(p, r);
        else documenti.push({ file: `documenti_cliente/${r}`, cartella: rel, nome: n, byte: s.size, modificato: s.mtime.toISOString(), evidenza: registrati.get(sha256(readFileSync(p))) || null });
      }
    };
    scorri(join(cartella, 'documenti_cliente'));
    const diario = existsSync(join(cartella, FILE_DIARIO)) ? readFileSync(join(cartella, FILE_DIARIO), 'utf8') : '';
    const esito = validaCaricata(caricaCartella(cartella), registro, {});
    return { nome: basename(cartella), pratica, schede, documenti, diario, esito: { errori: esito.errori, avvisi: esito.avvisi } };
  }

  const api = {
    'GET /api/pratiche': () => ({ radice, gruppi: GRUPPI, pratiche: cruscotto(radice).map(p => ({ ...p, cartella: basename(p.cartella) })) }),
    'POST /api/pratiche': (_, corpo) => {
      const o = JSON.parse(corpo);
      const { cartella, esito } = creaPratica(radice, o.codice, { cliente: o.cliente, sede: o.sede || 'da definire', nome: o.nome, annualita: o.annualita && Number(o.annualita), perito: o.perito });
      return { nome: basename(cartella), errori: esito.errori };
    },
    'GET /api/pratica': p => datiPratica(cartellaDi(p.nome)),
    'POST /api/carica': (p, corpo) => {
      const cartella = cartellaDi(p.nome);
      const nomeFile = basename(String(p.file || '')).replace(/[<>:"/\\|?*]/g, '').trim();
      if (!nomeFile) throw errore(400, 'nome del file mancante');
      const dir = dentro(join(cartella, 'documenti_cliente'), p.cartella || CARICATI);
      mkdirSync(dir, { recursive: true });
      // mai sovrascrivere un originale: stesso contenuto → già presente; contenuto diverso → nuovo nome
      let dest = join(dir, nomeFile), n = 2;
      while (existsSync(dest)) {
        if (sha256(readFileSync(dest)) === sha256(corpo)) return { file: relative(cartella, dest).split(sep).join('/'), giaPresente: true };
        dest = join(dir, nomeFile.replace(/(\.[^.]*)?$/, ` (${n++})$1`));
      }
      writeFileSync(dest, corpo);
      return { file: relative(cartella, dest).split(sep).join('/'), giaPresente: false };
    },
    'POST /api/registra': (p, corpo) => {
      const cartella = cartellaDi(p.nome);
      const o = JSON.parse(corpo);
      const file = dentro(join(cartella, 'documenti_cliente'), String(o.file || '').replace(/^documenti_cliente\//, ''));
      const r = registraDocumento(cartella, file, { beni: o.beni, descrizione: o.descrizione, gruppo: o.gruppo === 'DOC' || !o.gruppo ? 'DOC' : Number(o.gruppo), requisiti: o.requisiti, provenienza: o.provenienza });
      return { id: r.id, errori: r.esito.errori };
    },
    'POST /api/diario': (p, corpo) => {
      const o = JSON.parse(corpo);
      aggiungiVoce(cartellaDi(p.nome), { fatto: o.fatto, decisioni: o.decisioni, prossimo: o.prossimo });
      return { ok: true };
    },
  };

  function servi(res, file, tipo) {
    res.writeHead(200, { 'Content-Type': tipo || TIPI[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(readFileSync(file));
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const fuori = (stato, testo) => { res.writeHead(stato, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(testo)); };
    // Solo dal browser di questo PC: host locale (contro il DNS rebinding) e, per le modifiche, il gettone della pagina
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return fuori(403, { errore: 'accesso consentito solo da questo computer' });
    const parametri = Object.fromEntries(url.searchParams);
    try {
      if (url.pathname.startsWith('/api/')) {
        const chiave = `${req.method} ${url.pathname}`;
        const f = api[chiave];
        if (!f) return fuori(404, { errore: 'operazione sconosciuta' });
        if (req.method !== 'GET' && req.headers['x-studio'] !== token) return fuori(403, { errore: 'richiesta non autorizzata' });
        const parti = [];
        let totale = 0;
        req.on('data', c => { totale += c.length; if (totale > LIMITE) req.destroy(); else parti.push(c); });
        req.on('end', () => {
          try { fuori(200, f(parametri, Buffer.concat(parti))); } catch (e) { fuori(e.stato || 400, { errore: e.message }); }
        });
        return;
      }
      if (url.pathname === '/file') {
        // file di una pratica (anteprima di documenti e foto)
        const cartella = cartellaDi(parametri.nome);
        const p = dentro(cartella, parametri.percorso);
        if (!existsSync(p) || !statSync(p).isFile()) return fuori(404, { errore: 'file non trovato' });
        return servi(res, p);
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(readFileSync(join(REPO, 'studio', 'web', 'index.html'), 'utf8').replace('%GETTONE%', token));
      }
      for (const [prefisso, base] of [['/studio/', join(REPO, 'studio', 'web')], ['/app/', join(REPO, 'app')]]) {
        if (url.pathname.startsWith(prefisso)) {
          const p = dentro(base, decodeURIComponent(url.pathname.slice(prefisso.length)));
          if (existsSync(p) && statSync(p).isFile()) return servi(res, p);
        }
      }
      fuori(404, { errore: 'non trovato' });
    } catch (e) {
      fuori(e.stato || 500, { errore: e.message });
    }
  });
  return new Promise((ok, ko) => {
    server.once('error', ko);
    server.listen(porta, '127.0.0.1', () => ok({ server, token, indirizzo: `http://127.0.0.1:${server.address().port}/` }));
  });
}

function errore(stato, messaggio) { const e = new Error(messaggio); e.stato = stato; return e; }

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const a = process.argv.slice(2);
  const opz = n => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  const radice = a.find((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1] === '--porta'));
  if (!radice) { console.error('Uso: node studio/server.mjs "<cartella delle pratiche>" [--porta 4040] [--apri]'); process.exit(2); }
  avviaStudio(radice.replace(/[\\/]+$/, ''), { porta: Number(opz('porta') || 4040) }).then(({ indirizzo }) => {
    console.log(`Perito 4.0 Studio: ${indirizzo}  (chiudere questa finestra per spegnerlo)`);
    if (a.includes('--apri')) spawn(process.platform === 'win32' ? 'cmd' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', indirizzo] : [indirizzo], { detached: true, stdio: 'ignore' }).unref();
  }).catch(e => {
    if (e.code === 'EADDRINUSE') {
      console.log('Lo Studio è già acceso: apro la finestra.');
      if (a.includes('--apri')) spawn('cmd', ['/c', 'start', '', `http://127.0.0.1:${opz('porta') || 4040}/`], { detached: true, stdio: 'ignore' }).unref();
    } else { console.error(e.message); process.exit(1); }
  });
}
