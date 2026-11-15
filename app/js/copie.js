// Copie di sicurezza: i rilievi sono irripetibili, quindi nessuna evidenza deve esistere solo nell'archivio dell'app.
// Dopo ogni acquisizione si salva una copia del file originale sul telefono con il foglio di condivisione di iOS:
// foto e video nel Rullino («Salva immagine», «Salva video»), vocali e documenti in File («Salva in File»).
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

export function comeFile(e, blob) {
  return new File([blob], e.nomeFile, { type: e.mime || blob.type || 'application/octet-stream' });
}

export async function preparaFile(evidenze) {
  const out = [];
  for (const e of evidenze) {
    const blob = await leggiFile(e.codicePratica, e.nomeFile);
    if (blob) out.push({ evidenza: e, file: comeFile(e, blob) });
  }
  return out;
}

// Apre il foglio di condivisione di iOS. Va chiamata direttamente dal tocco, con i file già pronti:
// iOS rifiuta la condivisione se prima si aspetta altro. Esito: 'condivisione' | 'scaricamento' | null (annullata)
export async function condividi(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); return 'condivisione'; } catch (e) { if (e.name === 'AbortError') return null; }
  }
  // senza condivisione (es. PC): si scaricano i file
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  return 'scaricamento';
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
