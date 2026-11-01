#!/usr/bin/env node
// Cruscotto delle pratiche: una riga per pratica con stato delle perizie, sopralluoghi, integrazioni aperte, segnalazioni
// del validatore, ultimo lavoro e prossimo passo (dal diario della pratica, oppure suggerito dallo stato del fascicolo).
// Legge solo pratica_40.json, le schede dei beni e DIARIO.md: i documenti dei clienti non si aprono.
//
// Uso: node strumenti/cruscotto.mjs "<cartella delle pratiche>" [--tutte] [--scrivi]
//   --tutte   anche le pratiche chiuse
//   --scrivi  salva anche CRUSCOTTO.md nella cartella delle pratiche

import { readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { caricaSchemi, caricaCartella, validaCaricata, trovaPratiche } from './lib/disco.mjs';
import { ultimaVoce } from './diario.mjs';

const STATI = { bozza: 'bozza', bozza_sospesa: 'bozza sospesa', per_la_firma: 'per la firma', giurata: 'giurata' };
// Segnalazioni da mostrare nel cruscotto: quelle che cambiano il lavoro da fare
const RILEVANTI = {
  ALERT_DIFFORMITA: 'bene difforme dai documenti', ALERT_GATE_C: 'GATE C rosso', INTERCONNESSIONE_TARDIVA_DA_VALUTARE: 'interconnessione tardiva da valutare',
  GRUPPO_DA_AGGIUNGERE: 'gruppo Sicurezza da aggiungere', AZIONE_DA_COMPLETARE: 'azioni dal campo da completare', EVIDENZA_DA_DESCRIVERE: 'foto da descrivere',
  PERIZIA_DA_CHIUDERE: 'perizia giurata da chiudere', GIURAMENTO_INCOMPLETO: 'dati del giuramento incompleti', LEASING_SENZA_CONTRATTO: 'contratto di leasing mancante',
};
const dataIt = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '—';

function suggerito(p) {
  if (!p.beni.length) return 'analizzare i documenti e censire i beni';
  if (p.errori) return 'correggere gli errori del fascicolo';
  if (p.beni.every(b => b.chiuso)) return 'pratica chiusa';
  if (p.beni.some(b => b.stato === 'giurata')) return 'registrare i documenti firmati e marcati, poi chiudere';
  if (p.beni.some(b => b.stato === 'per_la_firma')) return 'giuramento in tribunale, poi registrare i dati del verbale';
  const s = p.sopralluoghi[p.sopralluoghi.length - 1];
  if (s && s.stato === 'previsto') return `sopralluogo ${s.id} del ${dataIt(s.data)}, poi importare i rientri`;
  if (!p.sopralluoghi.some(x => x.stato === 'eseguito')) return p.integrazioni ? 'chiedere le integrazioni e preparare il sopralluogo' : 'preparare il sopralluogo (pacchetto di andata)';
  if (p.beni.some(b => b.stato === 'bozza_sospesa')) return 'sciogliere la sospensione con le integrazioni e aggiornare la bozza';
  return 'nuova revisione della bozza, poi portarla per la firma';
}

export function cruscotto(radice, o = {}) {
  const registro = caricaSchemi();
  const righe = [];
  for (const cartella of trovaPratiche(radice)) {
    const pr = JSON.parse(readFileSync(join(cartella, 'pratica_40.json'), 'utf8'));
    const beni = pr.beni.map(b => {
      const el = (JSON.parse(readFileSync(join(cartella, b.scheda), 'utf8')).elaborato) || {};
      return { codice: b.codice, nome: b.denominazione, stato: el.stato || 'bozza', rev: el.revisione || 0, chiuso: !!el.chiusoIl };
    });
    const esito = validaCaricata(caricaCartella(cartella), registro, {});
    const aperte = pr.azioni.filter(a => a.stato === 'aperta');
    const perDest = {};
    for (const a of aperte) perDest[a.destinatario] = (perDest[a.destinatario] || 0) + 1;
    const segnalazioni = [...new Set(esito.avvisi.map(a => RILEVANTI[a.codice]).filter(Boolean))];
    const diario = ultimaVoce(cartella);
    const p = {
      cartella, nome: basename(cartella), codice: pr.codicePratica, cliente: pr.cliente.ragioneSociale, annualita: pr.annualita,
      beni, sopralluoghi: pr.sopralluoghi, azioniAperte: aperte.length, perDestinatario: perDest,
      integrazioni: aperte.filter(a => a.destinatario !== 'perito').length, errori: esito.errori.length, segnalazioni,
      ultimoLavoro: [pr.aggiornataIl && pr.aggiornataIl.slice(0, 10), diario && diario.data].filter(Boolean).sort().pop() || null,
      prossimoDiario: diario && diario.prossimo,
    };
    p.chiusa = beni.length > 0 && beni.every(b => b.chiuso);
    p.suggerito = suggerito(p);
    if (!p.chiusa || o.tutte) righe.push(p);
  }
  return righe.sort((a, b) => (b.ultimoLavoro || '').localeCompare(a.ultimoLavoro || ''));
}

export function testoCruscotto(righe, radice) {
  const out = [`# Pratiche Perizia 4.0 · ${dataIt(new Date().toISOString())}`, '', `Cartella: ${radice} · ${righe.length} pratiche`, ''];
  righe.forEach((p, i) => {
    const beni = p.beni.map(b => `${b.codice} ${STATI[b.stato] || b.stato} rev.${b.rev}${b.chiuso ? ' (chiuso)' : ''}`).join(', ') || 'nessun bene';
    const s = p.sopralluoghi[p.sopralluoghi.length - 1];
    const dest = Object.entries(p.perDestinatario).map(([k, n]) => `${k} ${n}`).join(', ');
    out.push(`## ${i + 1}. ${p.nome}`);
    out.push(`- Perizie: ${beni} · annualità ${p.annualita}`);
    out.push(`- Sopralluogo: ${s ? `${s.id} ${s.stato} ${dataIt(s.data)}` : 'nessuno'} · Azioni aperte: ${p.azioniAperte}${dest ? ` (${dest})` : ''}`);
    if (p.errori || p.segnalazioni.length) out.push(`- Da sapere: ${[p.errori ? `${p.errori} errori nel fascicolo` : null, ...p.segnalazioni].filter(Boolean).join(' · ')}`);
    out.push(`- Ultimo lavoro: ${dataIt(p.ultimoLavoro)}`);
    out.push(`- **Prossimo passo:** ${p.prossimoDiario || p.suggerito}${p.prossimoDiario ? '' : ' (suggerito: nessun diario)'}`);
    out.push('');
  });
  return out.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('cruscotto.mjs')) {
  const a = process.argv.slice(2);
  const radice = a.find(x => !x.startsWith('--'));
  if (!radice) { console.error('Uso: node strumenti/cruscotto.mjs "<cartella delle pratiche>" [--tutte] [--scrivi]'); process.exit(2); }
  const testo = testoCruscotto(cruscotto(radice, { tutte: a.includes('--tutte') }), radice);
  if (a.includes('--scrivi')) writeFileSync(join(radice, 'CRUSCOTTO.md'), testo + '\n');
  console.log(testo);
}
