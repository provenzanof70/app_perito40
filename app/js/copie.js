// Copie di sicurezza: i rilievi sono irripetibili, quindi nessuna evidenza deve esistere solo nell'archivio dell'app.
// Dopo ogni acquisizione si salva una copia del file originale sul telefono con il foglio di condivisione di iOS:
// foto e video nel Rullino («Salva immagine», «Salva video»), vocali e documenti in File («Salva in File»).
// Su Android il foglio di condivisione non ha «Salva in galleria»: la copia si scarica nella cartella Download,
// che Galleria e Google Foto mostrano tra le cartelle del dispositivo; «Condividi…» resta una scelta in più.
// Fa fede l'originale dell'app con il suo SHA-256: la copia è solo di sicurezza, iOS potrebbe ricomprimerla.

import { aggiornaEvidenza, leggiFile } from './evidenze.js';
import { isoLocale } from './metadati.js';

// Le evidenze nate prima dello schema 1.8 non hanno lo stato: foto, video e vocali si considerano senza copia
export function statoCopia(e) {
  if (e.copiaSicurezza) return e.copiaSicurezza.stato;
  return ['foto', 'video', 'vocale'].includes(e.tipo) ? 'da_fare' : 'gia_presente';
}

export const copieMancanti = evidenze => evidenze.filter(e => e.stato === 'valida' && statoCopia(e) === 'da_fare');

// Foto e video vanno nel Rullino, il resto in File: iOS propone azioni diverse per i due gruppi
export const perRullino = e => /^(image|video)\//.test(e.mime || '');

export const android = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');

// Molti browser Android (non Chrome: es. Browser Huawei) passano gli indirizzi blob: al gestore dei download di Android, che non
// può leggerli: la notifica compare ma il file non viene scritto. Su Android i file si consegnano come dati incorporati (data:),
// che il browser decodifica da sé; si preparano prima del tocco. Oltre il limite (video lunghi) resta l'indirizzo blob:.
export const LIMITE_DATI = 40 * 1024 * 1024;
const DATI = new WeakMap();

export function aDati(file) {
  if (file.size > LIMITE_DATI) return Promise.resolve(null);
  return new Promise(ok => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => ok(null);
    r.readAsDataURL(file);
  });
}

export async function preparaDati(files) {
  for (const f of files) if (!DATI.has(f)) { const d = await aDati(f); if (d) DATI.set(f, d); }
}

export const indirizzoDi = f => DATI.get(f) || null;

export function comeFile(e, blob) {
  return new File([blob], e.nomeFile, { type: e.mime || blob.type || 'application/octet-stream' });
}

export async function preparaFile(evidenze) {
  const out = [];
  for (const e of evidenze) {
    const blob = await leggiFile(e.codicePratica, e.nomeFile);
    if (blob) out.push({ evidenza: e, file: comeFile(e, blob) });
  }
  if (android) await preparaDati(out.map(x => x.file));
  return out;
}

// Salva le copie. Va chiamata direttamente dal tocco, con i file già pronti: iOS rifiuta la condivisione se prima si aspetta altro.
// modo: 'auto' (iPhone: condivisione; Android e PC: scaricamento) | 'condividi' (foglio di condivisione anche su Android)
// Esito: 'condivisione' | 'scaricamento' | null (annullata)
export async function condividi(files, modo = 'auto') {
  const conCondivisione = modo === 'condividi' || !android;
  if (conCondivisione && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); return 'condivisione'; } catch (e) { if (e.name === 'AbortError') return null; }
  }
  await scarica(files);
  return 'scaricamento';
}

// Scaricamento nella cartella Download del telefono (o del PC); più file uno dopo l'altro, come chiede Chrome
async function scarica(files) {
  for (const [i, f] of files.entries()) {
    if (i) await new Promise(r => setTimeout(r, 400));
    const a = document.createElement('a');
    const dati = android && DATI.get(f);
    a.href = dati || URL.createObjectURL(f); a.download = f.name;
    document.body.append(a); a.click(); a.remove();
    if (!dati) setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
}

export async function segnaFatte(codicePratica, ids, modo) {
  const il = isoLocale(new Date());
  for (const id of ids) {
    await aggiornaEvidenza(codicePratica, id, e => { e.copiaSicurezza = { ...(e.copiaSicurezza || {}), stato: 'fatta', il, modo }; });
  }
}

// Proseguire senza copia si può, ma il motivo resta scritto su ogni evidenza interessata
export async function registraRinuncia(codicePratica, ids, momento, motivo) {
  const il = isoLocale(new Date());
  for (const id of ids) {
    await aggiornaEvidenza(codicePratica, id, e => {
      const cs = e.copiaSicurezza || { stato: 'da_fare' };
      e.copiaSicurezza = { ...cs, rinunce: [...(cs.rinunce || []), { momento, motivo, il }] };
    });
  }
}
