// Utilità per i file delle evidenze nell'interfaccia: anteprime, durata, registrazione vocale.

import { useState, useEffect } from 'preact/hooks';
import { leggiFile } from './evidenze.js';

// URL temporaneo del file di un'evidenza, liberato quando il componente sparisce
export function useUrlFile(evidenza) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!evidenza) return undefined;
    let u = null, vivo = true;
    leggiFile(evidenza.codicePratica, evidenza.nomeFile).then(b => { if (b && vivo) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { vivo = false; if (u) URL.revokeObjectURL(u); };
  }, [evidenza && evidenza.nomeFile]);
  return url;
}

// Durata in secondi di un audio o video, letta dal browser
export function durata(blob, tipo) {
  return new Promise(ok => {
    const el = document.createElement(tipo === 'video' ? 'video' : 'audio');
    const u = URL.createObjectURL(blob);
    const fine = v => { URL.revokeObjectURL(u); ok(Number.isFinite(v) ? Math.round(v * 10) / 10 : undefined); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) return fine(el.duration);
      el.currentTime = 1e7; el.ontimeupdate = () => { el.ontimeupdate = null; fine(el.duration); };
    };
    el.onerror = () => fine(undefined);
    setTimeout(() => fine(undefined), 5000);
    el.src = u;
  });
}

// Registratore vocale: MediaRecorder, formato preferito audio/mp4 (iPhone), livelli per la forma d'onda
export async function avviaRegistrazione(suLivelli) {
  const flusso = await navigator.mediaDevices.getUserMedia({ audio: true });
  const tipo = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const reg = new MediaRecorder(flusso, tipo ? { mimeType: tipo } : undefined);
  const pezzi = [];
  reg.ondataavailable = e => { if (e.data.size) pezzi.push(e.data); };
  const inizio = new Date();
  let ctx = null, timer = null;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 128;
    ctx.createMediaStreamSource(flusso).connect(an);
    const dati = new Uint8Array(an.frequencyBinCount);
    timer = setInterval(() => { an.getByteFrequencyData(dati); suLivelli && suLivelli([...dati.slice(0, 36)].map(x => x / 255)); }, 120);
  } catch { /* forma d'onda facoltativa */ }
  reg.start(1000);
  return {
    inizio,
    ferma: () => new Promise(ok => {
      reg.onstop = () => {
        clearInterval(timer); if (ctx) ctx.close();
        flusso.getTracks().forEach(t => t.stop());
        ok({ blob: new Blob(pezzi, { type: (reg.mimeType || tipo || 'audio/mp4').split(';')[0] }), inizio, fine: new Date() });
      };
      reg.stop();
    }),
  };
}
