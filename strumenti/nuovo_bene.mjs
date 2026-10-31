#!/usr/bin/env node
// Aggiunge un bene al fascicolo: scheda beni/Bnn.json valida, con tutti i dati agli atti vuoti («da verificare»)
// e i gruppi di evidenze standard del profilo. I valori li compila poi Claude dai documenti, con fonte [ev:] e stato.
//
// Uso: node strumenti/nuovo_bene.mjs <cartella pratica> --denominazione "…" --funzione "…" --allegato A --gruppo 1
//        --voce "Macchine utensili per asportazione" [--codice-voce A11_01] [--ru RU1,RU2] [--ubicazione "…"]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GRUPPI } from './lib/validatore.mjs';
import { caricaSchemi, caricaCartella, validaCaricata } from './lib/disco.mjs';

const CAMPI = {
  identita: ['costruttore', 'modello', 'matricola', 'anno'],
  controllore: ['marca', 'modello', 'firmware'],
  hmi: ['modello'],
  reteDichiarata: ['ip', 'sistemaAziendale', 'protocollo'],
  dichiarazioneCE: ['numero', 'data', 'direttive', 'riferimentoMatricola'],
};

export function nuovoBene(cartella, o) {
  const fp = join(cartella, 'pratica_40.json');
  if (!existsSync(fp)) throw new Error(`pratica_40.json non trovato in ${cartella}`);
  const pratica = JSON.parse(readFileSync(fp, 'utf8'));
  for (const k of ['denominazione', 'funzione', 'allegato', 'voce']) if (!o[k]) throw new Error(`manca --${k === 'codiceVoce' ? 'codice-voce' : k}`);
  if (!['A', 'B'].includes(o.allegato)) throw new Error('--allegato deve essere A o B');
  if (o.allegato === 'A' && ![1, 2, 3].includes(o.gruppo)) throw new Error("per l'Allegato A serve --gruppo 1, 2 o 3");
  const profilo = o.allegato === 'A' && o.gruppo === 1 ? 'completo' : 'ridotto';
  const ru = profilo === 'completo' ? (o.ru || []) : [];
  const usati = new Set(pratica.beni.map(b => b.codice));
  let n = 1;
  while (usati.has(`B${String(n).padStart(2, '0')}`)) n++;
  const codice = `B${String(n).padStart(2, '0')}`;
  const vuota = () => ({ valore: null, fonti: [], stato: 'da_verificare' });
  const scheda = {
    formato: 'perizia40.scheda_bene', versioneSchema: '1.4.0', demo: pratica.demo, codicePratica: pratica.codicePratica, codice,
    denominazione: o.denominazione, funzione: o.funzione, ...(o.ubicazione ? { ubicazione: o.ubicazione } : {}), componenti: [],
    classificazione: {
      regime: 'CRI_4.0', allegato: o.allegato, ...(o.allegato === 'A' ? { gruppo: o.gruppo } : {}), voce: o.voce, profilo,
      ...(profilo === 'completo' ? { ruDichiarati: ru } : {}), sostenibilita: 'da_motivare', ...(o.codiceVoce ? { codiceVoce: o.codiceVoce } : {}),
      motivazione: 'da motivare sulla funzione effettiva, dai documenti', fonti: [],
    },
    datiAgliAtti: {
      ...Object.fromEntries(Object.entries(CAMPI).map(([sez, campi]) => [sez, Object.fromEntries(campi.map(c => [c, vuota()]))])),
      esitoGateC: { esito: 'giallo', motivazione: "perimetro e conformità dell'insieme da valutare sui documenti", fonti: [], stato: 'da_verificare' },
    },
    gruppiEvidenze: GRUPPI.map(g => {
      const std = g[profilo];
      const attesa = std === 'se_dichiarato' ? (g.requisiti.some(r => ru.includes(r)) ? 'si' : 'non_applicabile') : std;
      return { gruppo: g.gruppo, titolo: g.titolo, requisiti: g.requisiti, attesa };
    }),
    elaborato: { revisione: 0, stato: 'bozza' },
  };
  writeFileSync(join(cartella, 'beni', `${codice}.json`), JSON.stringify(scheda, null, 2) + '\n');
  pratica.beni.push({ codice, denominazione: o.denominazione, scheda: `beni/${codice}.json` });
  pratica.aggiornataIl = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  writeFileSync(fp, JSON.stringify(pratica, null, 2) + '\n');
  return { codice, esito: validaCaricata(caricaCartella(cartella), caricaSchemi(), {}) };
}

if (process.argv[1] && process.argv[1].endsWith('nuovo_bene.mjs')) {
  const a = process.argv.slice(2);
  const opz = n => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  const cartella = a[0];
  if (!cartella || cartella.startsWith('--')) {
    console.error('Uso: node strumenti/nuovo_bene.mjs <cartella pratica> --denominazione "…" --funzione "…" --allegato A|B [--gruppo 1|2|3] --voce "…" [--codice-voce A11_01] [--ru RU1,RU2] [--ubicazione "…"]');
    process.exit(2);
  }
  try {
    const { codice, esito } = nuovoBene(cartella, {
      denominazione: opz('denominazione'), funzione: opz('funzione'), allegato: opz('allegato'), gruppo: opz('gruppo') && Number(opz('gruppo')),
      voce: opz('voce'), codiceVoce: opz('codice-voce'), ru: opz('ru') ? opz('ru').split(',') : [], ubicazione: opz('ubicazione'),
    });
    console.log(`Bene ${codice} aggiunto: beni/${codice}.json`);
    for (const e of [...esito.errori, ...esito.avvisi]) console.log(`  ${e.livello === 'errore' ? 'ERRORE' : 'avviso'} ${e.codice}: ${e.messaggio}`);
    process.exit(esito.errori.length ? 1 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
