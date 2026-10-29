// Registri raccolti in campo, nell'archivio «registri» con chiave [codicePratica, tipo, id].
// Tipi:
//   verifica       esito in campo di un dato agli atti (id = "<bene>|<campo>")      → verificheDati
//   beneNuovo      bene censito in campo e assente dall'andata (id = codice)         → beniNuovi
//   riscontro      riscontro diretto del perito (RD-001)                             → riscontriDiretti
//   dichiarazione  dichiarazione di terzi (DT-001)                                   → dichiarazioniTerzi
//   nota           nota del perito per bene e requisito, promemoria (NC-001)         → noteCampo
//   azione         bozza di azione nata in campo (A004)                               → nuoveAzioni
//   aggiornamento  esito in campo di un'azione dell'andata (id = codice dell'azione)  → aggiornamentiAzioni
//   data           data rilevata in campo, nuova o verifica di una data agli atti (T001) → dateRilevate

import { transazione } from './archivio.js';
import { oggi } from './tempo.js';

export const TIPI_REGISTRO = ['verifica', 'beneNuovo', 'riscontro', 'dichiarazione', 'nota', 'azione', 'aggiornamento', 'data'];

export function salvaRegistro(codicePratica, tipo, id, dati) {
  return transazione('registri', 'readwrite', s => {
    s.put({ ...dati, codicePratica, tipo, id, modificatoIl: new Date().toISOString() });
  });
}

// Più registri in un'unica transazione (es. dichiarazione con la sua bozza di azione)
export function salvaRegistri(codicePratica, voci) {
  return transazione('registri', 'readwrite', s => {
    const ora = new Date().toISOString();
    for (const { tipo, id, dati } of voci) s.put({ ...dati, codicePratica, tipo, id, modificatoIl: ora });
  });
}

// Raggruppa per tipo le righe di una pratica: { verifica: Map(id → riga), … }
export function perTipo(righe) {
  const out = Object.fromEntries(TIPI_REGISTRO.map(t => [t, new Map()]));
  for (const r of righe) {
    if (!out[r.tipo]) out[r.tipo] = new Map();
    out[r.tipo].set(r.id, r);
  }
  return out;
}

export function salvaVerifica(pratica, bene, dato, esito) {
  return salvaRegistro(pratica.codicePratica, 'verifica', `${bene}|${dato.campo}`, {
    bene, campo: dato.campo, valoreAgliAtti: dato.valoreAgliAtti, data: oggi(), ...esito,
  });
}

// Primo codice libero B01, B02… tra beni dell'andata e beni nuovi
export function prossimoCodiceBene(andata, beniNuovi) {
  const usati = new Set([...andata.beni.map(b => b.codice), ...beniNuovi.map(b => b.codice)]);
  for (let n = 1; n < 100; n++) {
    const c = `B${String(n).padStart(2, '0')}`;
    if (!usati.has(c)) return c;
  }
  throw new Error('nessun codice bene libero');
}

// Primo progressivo libero per un registro, esclusi i codici già usati nel fascicolo (idUsati dell'andata)
const PREFISSI = { riscontro: ['RD-', 'riscontri'], dichiarazione: ['DT-', 'dichiarazioni'], nota: ['NC-', 'note'], azione: ['A', 'azioni'], data: ['T', 'date'] };

export function prossimoId(andata, registri, tipo) {
  const [prefisso, chiave] = PREFISSI[tipo];
  const usati = new Set([...registri[tipo].keys(), ...((andata.idUsati || {})[chiave] || [])]);
  if (tipo === 'azione') for (const a of andata.azioniAperte) usati.add(a.id);
  for (let n = 1; n < 1000; n++) {
    const id = `${prefisso}${String(n).padStart(3, '0')}`;
    if (!usati.has(id)) return id;
  }
  throw new Error(`progressivo ${prefisso} esaurito`);
}

// Data della visita (giorno locale di inizio) usata da riscontri e verifiche
export const dataVisita = pratica => pratica.visita ? oggi(new Date(pratica.visita.inizio)) : oggi();

// Frase verbalizzata del riscontro: fatto + oggetto + circostanza, con bene, ora e data (§1.3)
export function fraseRiscontro({ fatto, oggetto, circostanza, bene, ora, data }) {
  const f = fatto.trim().replace(/[.\s]+$/, '');
  const [a, m, g] = data.split('-');
  return `${f.charAt(0).toUpperCase()}${f.slice(1)} (${oggetto.trim()}, bene ${bene}), ${circostanza.trim().replace(/[.\s]+$/, '')}, alle ore ${ora} del ${g}/${m}/${a}.`;
}

// ---------------------------------------------------------------------------
// Conversione nel formato del pacchetto di rientro (schemi/v1): solo i campi previsti
// ---------------------------------------------------------------------------

const solo = (o, campi) => Object.fromEntries(campi.filter(k => o[k] !== undefined && o[k] !== null && o[k] !== '').map(k => [k, o[k]]));

export const riscontroPerRientro = r => solo(r, ['id', 'bene', 'requisito', 'idSopralluogo', 'dataVisita', 'ora', 'fatto', 'oggetto', 'circostanza', 'frase', 'evidenze', 'limiti']);
export const dichiarazionePerRientro = d => solo({ ...d, riscontroOggettivo: solo(d.riscontroOggettivo, ['esito', 'evidenze', 'nota']) },
  ['id', 'beni', 'persona', 'ruolo', 'organizzazione', 'forma', 'data', 'contenuto', 'requisito', 'evidenzaDichiarazione', 'riscontroOggettivo']);
export const notaPerRientro = n => solo(n, ['id', 'bene', 'requisito', 'testo', 'ora', 'base']);
export const bozzaPerRientro = a => solo(a, ['id', 'categoria', 'beni', 'requisito', 'cosaServe', 'nota', 'percheServe', 'priorita', 'destinatario', 'esempioAccettabile', 'generataDa', 'stato', 'apertaIl']);

export function cancellaRegistro(codicePratica, tipo, id) {
  return transazione('registri', 'readwrite', s => { s.delete([codicePratica, tipo, id]); });
}

export const aggiornamentoPerRientro = u => solo(u, ['idAzione', 'esitoCampo', 'motivoProposto', 'evidenze', 'riscontro', 'nota']);
export const dataPerRientro = d => solo(d, ['id', 'evento', 'descrizione', 'beni', 'data', 'tipoData', 'origine', 'stato', 'prove', 'coerenza', 'nota', 'rifTimeline', 'esitoRif']);

// Stato documentale di una data rilevata (§6.1): documentata solo con prova e origine non dichiarativa
export function statoData(prove, origine) {
  if (prove.length && origine !== 'dichiarazione_impresa') return 'documentata';
  return origine === 'dichiarazione_impresa' ? 'dichiarata' : 'da_verificare';
}
