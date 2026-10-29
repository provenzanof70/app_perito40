// Registri raccolti in campo, nell'archivio «registri» con chiave [codicePratica, tipo, id].
// Tipi usati finora:
//   verifica    esito in campo di un dato agli atti (id = "<bene>|<campo>"), diventa verificheDati nel rientro
//   beneNuovo   bene censito in campo e assente dall'andata (id = codice), diventa beniNuovi nel rientro

import { transazione } from './archivio.js';
import { oggi } from './ui.js';

export function salvaRegistro(codicePratica, tipo, id, dati) {
  return transazione('registri', 'readwrite', s => {
    s.put({ ...dati, codicePratica, tipo, id, modificatoIl: new Date().toISOString() });
  });
}

// Raggruppa per tipo le righe di una pratica: { verifica: Map(id → riga), beneNuovo: Map … }
export function perTipo(righe) {
  const out = { verifica: new Map(), beneNuovo: new Map() };
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
