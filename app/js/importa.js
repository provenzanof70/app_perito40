// Importazione del pacchetto di andata: impronta SHA-256 dei byte ricevuti, controllo con lo stesso
// validatore usato sul PC (strumenti/lib/validatore.mjs), registrazione nell'archivio del telefono.

import { creaRegistroSchemi, validaStruttura, controllaAndata, controllaRiservatezza, nuovoEsito } from '../../strumenti/lib/validatore.mjs';
import { leggi, scrivi, conta } from './archivio.js';

const SCHEMI = ['comuni', 'pratica_40', 'scheda_bene', 'perizia40-andata', 'perizia40-rientro'];
let registro = null;

export async function registroSchemi() {
  if (!registro) {
    const schemi = await Promise.all(SCHEMI.map(async n => {
      const r = await fetch(`../schemi/v1/${n}.v1.schema.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`schema ${n} non disponibile`);
      return r.json();
    }));
    registro = creaRegistroSchemi(schemi);
  }
  return registro;
}

export async function sha256(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Controlla un'andata senza salvarla. Restituisce { andata, impronta, esito }
export async function controllaAndataBytes(bytes, nomeFile) {
  const esito = nuovoEsito();
  const impronta = await sha256(bytes);
  let andata;
  try {
    andata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    esito.errore('JSON_ILLEGGIBILE', nomeFile, 'il file non è un JSON leggibile');
    return { andata: null, impronta, esito };
  }
  if (!andata || andata.formato !== 'perizia40.andata') {
    esito.errore('FORMATO_SCONOSCIUTO', nomeFile, 'non è un pacchetto di andata Perizia 4.0 (perizia40-andata.json)');
    return { andata: null, impronta, esito };
  }
  const ok = validaStruttura(andata, await registroSchemi(), esito, nomeFile);
  controllaRiservatezza(andata, esito, nomeFile, { demo: andata.demo === true });
  if (ok) controllaAndata(andata, esito, nomeFile, null);
  return { andata, impronta, esito };
}

// Importa un'andata. Esiti possibili:
//   { stato: 'importata' | 'aggiornata' | 'gia_presente', pratica, esito }
//   { stato: 'rifiutata', motivo, esito }
export async function importaAndata(bytes, nomeFile, ora = new Date()) {
  const { andata, impronta, esito } = await controllaAndataBytes(bytes, nomeFile);
  if (esito.errori.length) return { stato: 'rifiutata', motivo: 'Il pacchetto non supera i controlli', esito };

  const esistente = await leggi('pratiche', andata.codicePratica);
  if (esistente) {
    if (esistente.andataSha256 === impronta) return { stato: 'gia_presente', pratica: esistente, esito };
    const evidenze = await conta('evidenze', 'perPratica', andata.codicePratica);
    if (evidenze > 0 || esistente.visita) {
      return {
        stato: 'rifiutata', esito,
        motivo: `La pratica ${andata.codicePratica} ha già dati raccolti in campo: non si sostituisce l'andata. Crea prima il pacchetto finale e importalo sul PC.`,
      };
    }
  }
  const pratica = {
    codicePratica: andata.codicePratica,
    andata, andataSha256: impronta, andataFile: nomeFile, importataIl: ora.toISOString(),
    stato: 'in_corso',
    visita: null,
    esportazioni: { ultimo: null, numeroCheckpoint: 0 },
    promemoria: { rinviatoFino: null },
    avvisiImportazione: esito.avvisi,
  };
  await scrivi('pratiche', pratica);
  return { stato: esistente ? 'aggiornata' : 'importata', pratica, esito };
}
