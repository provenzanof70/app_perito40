#!/usr/bin/env node
// Crea la cartella di una nuova pratica con il fascicolo iniziale (pratica_40.json valido, senza beni).
// I beni, le schede e i dati agli atti li compila poi Claude dall'analisi dei documenti (skill «preparazione pratica»).
//
// Uso: node strumenti/crea_pratica.mjs <cartella delle pratiche> <CODICE> --cliente "Ragione sociale" --sede "Sede dell'intervento"
//        [--annualita 2026] [--perito "Nome"] [--demo]
// Crea <cartella delle pratiche>/<CODICE> - <Ragione sociale>/ e non sovrascrive mai una pratica esistente.

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { caricaSchemi, caricaCartella, validaCaricata } from './lib/disco.mjs';

const CARTELLE = {
  documenti_cliente: 'Documenti ricevuti dal cliente, come arrivano: non si modificano, non si rinominano.',
  beni: 'Una scheda per bene (B01.json, B02.json…), compilata dall\'analisi dei documenti.',
  evidenze: 'Copie codificate (B01-DOC-001…) dei documenti e delle foto usati come prova, con impronta SHA-256 nel manifesto.',
  andata: 'Pacchetto di andata per l\'app di sopralluogo (perizia40-andata.json).',
  rientro: 'ZIP di rientro salvati dall\'app con «Salva in File».',
  perizia: 'Bozze Word di perizia giurata e analisi tecnica generate dal fascicolo.',
};

export function creaPratica(radice, codice, o) {
  if (!/^[A-Z0-9][A-Z0-9_-]{2,40}$/.test(codice)) throw new Error(`codice pratica non valido: ${codice} (maiuscole, cifre, - e _)`);
  if (!o.cliente || !o.sede) throw new Error('servono --cliente e --sede');
  if (!existsSync(radice)) throw new Error(`cartella delle pratiche non trovata: ${radice}`);
  const esistente = readdirSync(radice).find(n => n === codice || n.startsWith(`${codice} - `));
  if (esistente) throw new Error(`esiste già una pratica ${codice}: ${join(radice, esistente)}`);
  // Windows non apre le cartelle che finiscono con punto o spazio (es. «S.r.l.»): si tolgono
  const nome = `${codice} - ${o.cliente.replace(/[<>:"/\\|?*]/g, '').trim().replace(/[. ]+$/, '')}`;
  const cartella = join(radice, nome);
  mkdirSync(cartella);
  for (const c of Object.keys(CARTELLE)) mkdirSync(join(cartella, c));
  const ora = o.ora || new Date();
  const pratica = {
    formato: 'perizia40.pratica', versioneSchema: '1.4.0', demo: !!o.demo, codicePratica: codice, regime: 'CRI_4.0',
    annualita: o.annualita || ora.getFullYear(), aggiornataIl: ora.toISOString().replace(/\.\d+Z$/, 'Z'),
    cliente: { ragioneSociale: o.cliente, sedeIntervento: o.sede }, perito: { nome: o.perito || 'Perito' }, persone: [],
    beni: [], sopralluoghi: [], beniNuovi: [], evidenze: [], timeline: [], azioni: [], riscontriDiretti: [], dichiarazioniTerzi: [], noteCampo: [],
    manifesto: [], pacchetti: [],
  };
  writeFileSync(join(cartella, 'pratica_40.json'), JSON.stringify(pratica, null, 2) + '\n');
  writeFileSync(join(cartella, '00_LEGGIMI.md'), [
    `# ${codice} — ${o.cliente}`, '',
    'Pratica Perizia 4.0 (CRI 4.0). Fascicolo: `pratica_40.json` e `beni/`, controllato con `node strumenti/valida.mjs <questa cartella>` dal repository app_perito40.', '',
    ...Object.entries(CARTELLE).map(([c, t]) => `- \`${c}/\` — ${t}`), '',
  ].join('\n'));
  const esito = validaCaricata(caricaCartella(cartella), caricaSchemi(), {});
  return { cartella, esito };
}

if (process.argv[1] && process.argv[1].endsWith('crea_pratica.mjs')) {
  const a = process.argv.slice(2);
  const opz = n => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
  const [radice, codice] = a.filter((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--') && a[i - 1] !== '--demo'));
  if (!radice || !codice) {
    console.error('Uso: node strumenti/crea_pratica.mjs <cartella delle pratiche> <CODICE> --cliente "Ragione sociale" --sede "Sede" [--annualita 2026] [--perito "Nome"] [--demo]');
    process.exit(2);
  }
  try {
    const { cartella, esito } = creaPratica(radice, codice, { cliente: opz('cliente'), sede: opz('sede'), perito: opz('perito'), annualita: opz('annualita') && Number(opz('annualita')), demo: a.includes('--demo') });
    console.log(`Pratica creata: ${cartella}`);
    for (const e of [...esito.errori, ...esito.avvisi]) console.log(`  ${e.livello === 'errore' ? 'ERRORE' : 'avviso'} ${e.codice}: ${e.messaggio}`);
    process.exit(esito.errori.length ? 1 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
