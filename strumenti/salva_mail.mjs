#!/usr/bin/env node
// Salva nella pratica una mail del cliente ricevuta da Gmail: messaggio originale (.eml, vale come prova), testo leggibile
// e allegati, in documenti_cliente/Mail/<AAAA-MM-GG> <oggetto>/. Accetta il messaggio grezzo MIME oppure codificato in
// base64/base64url (come lo restituisce Gmail con il formato RAW). Nessun servizio esterno: lavora sul file indicato.
//
// Uso: node strumenti/salva_mail.mjs "<cartella pratica>" "<file con il messaggio>"

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const sha = b => createHash('sha256').update(b).digest('hex');
const pulisci = s => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');

// Il file può contenere il messaggio grezzo o la sua codifica base64/base64url
export function leggiMessaggio(buf) {
  const testa = buf.subarray(0, 400).toString('latin1');
  if (/^(Received|Return-Path|Delivered-To|MIME-Version|From|To|Date|Subject|Message-ID|Content-Type|X-[\w-]+):/im.test(testa.split(/\r?\n/)[0] || '')) return buf;
  const t = buf.toString('latin1').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (/^[A-Za-z0-9+/=]+$/.test(t)) return Buffer.from(t, 'base64');
  return buf;
}

function decodifica(testo, charset = 'utf-8') {
  try { return new TextDecoder(charset.toLowerCase().replace(/^(us-ascii|ascii)$/, 'utf-8')).decode(testo); } catch { return Buffer.from(testo).toString('latin1'); }
}

// Parole codificate nelle intestazioni: =?utf-8?B?…?= e =?iso-8859-1?Q?…?=
export function parole(s) {
  return s.replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, t) => {
    const b = enc.toUpperCase() === 'B' ? Buffer.from(t, 'base64')
      : Buffer.from(t.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
    return decodifica(b, cs);
  });
}

function quotedPrintable(buf) {
  const s = buf.toString('latin1').replace(/=\r?\n/g, '');
  return Buffer.from(s.replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1');
}

function parametro(valore, nome) {
  const estesa = new RegExp(`${nome}\\*=([^']*)'[^']*'([^;\\r\\n]+)`, 'i').exec(valore);
  if (estesa) return decodifica(Buffer.from(decodeURIComponent(estesa[2].replace(/%(?![0-9A-Fa-f]{2})/g, '%25')), 'latin1'), estesa[1] || 'utf-8');
  const m = new RegExp(`${nome}\\s*=\\s*("([^"]*)"|[^;\\s]+)`, 'i').exec(valore);
  return m ? parole(m[2] !== undefined ? m[2] : m[1]) : null;
}

function parte(buf) {
  const t = buf.toString('latin1');
  const fine = t.search(/\r?\n\r?\n/);
  const testaTesto = fine < 0 ? t : t.slice(0, fine);
  const corpo = fine < 0 ? Buffer.alloc(0) : buf.subarray(fine + (t.slice(fine, fine + 4) === '\r\n\r\n' ? 4 : 2));
  const intestazioni = new Map();
  for (const riga of testaTesto.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = riga.indexOf(':');
    if (i > 0) { const k = riga.slice(0, i).trim().toLowerCase(); if (!intestazioni.has(k)) intestazioni.set(k, riga.slice(i + 1).trim()); }
  }
  return { intestazioni, corpo };
}

// Scorre le parti del messaggio: testo e allegati
function esplora(buf, out) {
  const { intestazioni: h, corpo } = parte(buf);
  const tipo = (h.get('content-type') || 'text/plain').split(';')[0].trim().toLowerCase();
  if (tipo.startsWith('multipart/')) {
    const confine = parametro(h.get('content-type'), 'boundary');
    if (!confine) return;
    // latin1 conserva i byte: ogni parte torna Buffer identica all'originale
    const pezzi = corpo.toString('latin1').split(`--${confine}`);
    for (const [i, p] of pezzi.entries()) {
      if (i === 0 || p.startsWith('--')) continue;
      esplora(Buffer.from(p.replace(/^\r?\n/, ''), 'latin1'), out);
    }
    return;
  }
  const cte = (h.get('content-transfer-encoding') || '').toLowerCase();
  const dati = cte === 'base64' ? Buffer.from(corpo.toString('latin1').replace(/\s+/g, ''), 'base64') : cte === 'quoted-printable' ? quotedPrintable(corpo) : corpo;
  const disp = h.get('content-disposition') || '';
  const nome = parametro(disp, 'filename') || parametro(h.get('content-type') || '', 'name');
  if (nome || /^attachment/i.test(disp)) out.allegati.push({ nome: pulisci(nome || 'allegato'), tipo, dati });
  else if (tipo === 'text/plain' && !out.testo) out.testo = decodifica(dati, parametro(h.get('content-type') || '', 'charset') || 'utf-8');
  else if (tipo === 'text/html' && !out.html) out.html = decodifica(dati, parametro(h.get('content-type') || '', 'charset') || 'utf-8');
}

export function analizzaMail(buf) {
  const grezzo = leggiMessaggio(buf);
  const { intestazioni: h } = parte(grezzo);
  const out = { testo: null, html: null, allegati: [] };
  esplora(grezzo, out);
  const data = h.get('date') ? new Date(h.get('date')) : null;
  return {
    grezzo, da: parole(h.get('from') || ''), a: parole(h.get('to') || ''), cc: parole(h.get('cc') || ''), oggetto: parole(h.get('subject') || '(senza oggetto)'),
    data: data && !isNaN(data) ? data : null, idMessaggio: h.get('message-id') || null,
    testo: out.testo || (out.html ? out.html.replace(/<(br|\/p|\/div)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''),
    allegati: out.allegati,
  };
}

export function salvaMail(cartella, file) {
  if (!existsSync(join(cartella, 'pratica_40.json'))) throw new Error(`non è la cartella di una pratica: ${cartella}`);
  const m = analizzaMail(readFileSync(file));
  if (!m.data && !m.idMessaggio) throw new Error('il file non sembra una mail (mancano data e Message-ID)');
  const giorno = m.data ? m.data.toISOString().slice(0, 10) : 'senza data';
  const dir = join(cartella, 'documenti_cliente', 'Mail', pulisci(`${giorno} ${m.oggetto}`).slice(0, 80));
  // la stessa mail non si salva due volte
  const eml = join(dir, 'messaggio.eml');
  if (existsSync(eml)) {
    if (sha(readFileSync(eml)) === sha(m.grezzo)) return { cartella: dir, giaPresente: true, ...m };
    throw new Error(`esiste già una mail diversa salvata in ${dir}`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(eml, m.grezzo);
  writeFileSync(join(dir, 'testo.txt'), [`Da: ${m.da}`, `A: ${m.a}`, ...(m.cc ? [`Cc: ${m.cc}`] : []), `Data: ${m.data ? m.data.toISOString() : '—'}`, `Oggetto: ${m.oggetto}`,
    `Allegati: ${m.allegati.map(a => a.nome).join(', ') || 'nessuno'}`, '', m.testo.trim(), ''].join('\n'));
  const nomi = new Set();
  for (const a of m.allegati) {
    let n = a.nome, k = 2;
    while (nomi.has(n.toLowerCase())) n = a.nome.replace(/(\.[^.]*)?$/, ` (${k++})$1`);
    nomi.add(n.toLowerCase());
    a.file = n;
    writeFileSync(join(dir, n), a.dati);
  }
  return { cartella: dir, giaPresente: false, ...m };
}

if (process.argv[1] && process.argv[1].endsWith('salva_mail.mjs')) {
  const [cartella, file] = process.argv.slice(2);
  if (!cartella || !file) { console.error('Uso: node strumenti/salva_mail.mjs "<cartella pratica>" "<file con il messaggio>"'); process.exit(2); }
  try {
    const r = salvaMail(cartella, file);
    console.log(`${r.giaPresente ? 'Già salvata' : 'Mail salvata'}: ${r.cartella}`);
    console.log(`  Da: ${r.da} · ${r.data ? r.data.toLocaleString('it-IT') : 'senza data'} · ${r.oggetto}`);
    for (const a of r.allegati) console.log(`  allegato: ${a.file || a.nome} (${Math.round(a.dati.length / 1024)} kB)`);
    console.log('  Prossimo: registrare come evidenze gli allegati utili (Studio › Documenti) e, se il testo contiene una dichiarazione, registrarla come dichiarazione di terzi.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
