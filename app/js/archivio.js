// Archivio sul telefono (IndexedDB). Tutto resta sul dispositivo finché il perito non esporta un pacchetto.
//
// Archivi:
//   pratiche     una riga per pratica: andata importata, stato della visita, ultimo pacchetto esportato
//   evidenze     metadati delle evidenze, chiave [codicePratica, id]
//   media        file originali (Blob) delle evidenze, chiave [codicePratica, nomeFile]
//   registri     verifiche, riscontri, dichiarazioni, note, date, azioni: chiave [codicePratica, tipo, id]
//   impostazioni preferenze locali (nome del perito…)

const NOME = 'perito40';
const VERSIONE = 1;

let promessa = null;

export function apri() {
  if (promessa) return promessa;
  promessa = new Promise((ok, ko) => {
    const r = indexedDB.open(NOME, VERSIONE);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('pratiche', { keyPath: 'codicePratica' });
      db.createObjectStore('evidenze', { keyPath: ['codicePratica', 'id'] }).createIndex('perPratica', 'codicePratica');
      db.createObjectStore('media', { keyPath: ['codicePratica', 'nomeFile'] }).createIndex('perPratica', 'codicePratica');
      db.createObjectStore('registri', { keyPath: ['codicePratica', 'tipo', 'id'] }).createIndex('perPraticaTipo', ['codicePratica', 'tipo']);
      db.createObjectStore('impostazioni', { keyPath: 'chiave' });
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close();
      ok(db);
    };
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error("Archivio bloccato da un'altra finestra dell'app: chiudila e riprova"));
  });
  return promessa;
}

const attesa = req => new Promise((ok, ko) => { req.onsuccess = () => ok(req.result); req.onerror = () => ko(req.error); });

// Esegue fn(store…) in un'unica transazione; risolve quando la transazione è scritta su disco
export async function transazione(archivi, modo, fn) {
  const db = await apri();
  const nomi = Array.isArray(archivi) ? archivi : [archivi];
  const tx = db.transaction(nomi, modo, { durability: 'strict' });
  const risultato = fn(...nomi.map(n => tx.objectStore(n)));
  await new Promise((ok, ko) => { tx.oncomplete = ok; tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error('transazione annullata')); });
  return risultato;
}

export async function leggi(archivio, chiave) {
  const db = await apri();
  return attesa(db.transaction(archivio).objectStore(archivio).get(chiave));
}

export async function tutti(archivio, indice = null, valore = undefined) {
  const db = await apri();
  const s = db.transaction(archivio).objectStore(archivio);
  return attesa(indice ? s.index(indice).getAll(valore) : s.getAll());
}

export async function conta(archivio, indice, valore) {
  const db = await apri();
  return attesa(db.transaction(archivio).objectStore(archivio).index(indice).count(valore));
}

export function scrivi(archivio, valore) {
  return transazione(archivio, 'readwrite', s => { s.put(valore); });
}

export async function impostazione(chiave, predefinito = null) {
  const r = await leggi('impostazioni', chiave);
  return r ? r.valore : predefinito;
}

export function salvaImpostazione(chiave, valore) {
  return scrivi('impostazioni', { chiave, valore });
}

// Archiviazione persistente: chiede al browser di non cancellare i dati in caso di poco spazio
export async function richiediPersistenza() {
  const st = navigator.storage;
  if (!st || !st.persist) return { supportata: false, persistente: false };
  let persistente = await st.persisted();
  if (!persistente) persistente = await st.persist();
  const stima = st.estimate ? await st.estimate() : {};
  return { supportata: true, persistente, usato: stima.usage ?? null, quota: stima.quota ?? null };
}
