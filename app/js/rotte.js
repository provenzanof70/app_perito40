// Rotte nell'hash dell'indirizzo:
//   #/                                   elenco pratiche
//   #/p/<codice>/<scheda>                rilievo, beni, requisiti, azioni, pratica
//   #/p/<codice>/beni/<B01>              scheda del bene
//   #/p/<codice>/beni/<B01>/gruppo/<g>   evidenze di un gruppo del bene
//   #/p/<codice>/rilievo/<B01.1>/<g>     rilievo con bene (o componente) e gruppo scelti
//   #/p/<codice>/evidenza/<id>           dettaglio e annotazione di un'evidenza
//   #/p/<codice>/requisiti/<B01>         requisiti di un bene
//   #/p/<codice>/riscontro/<B01>/<RO2>[/<RD-001>]      riscontro diretto (nuovo o da modificare)
//   #/p/<codice>/dichiarazione/<B01>/<RO2>[/<DT-001>]  dichiarazione di terzi
//   #/p/<codice>/azione/<nuova|A004>     bozza di azione nata in campo
//   #/p/<codice>/cronologia[/<B01>]      cronologia e registro della visita
//   #/p/<codice>/data/verifica/<T005>    verifica in campo di una data agli atti
//   #/p/<codice>/data/nuova/<B01>        nuova data rilevata · #/p/<codice>/data/<T001> modifica
//   #/p/<codice>/pacchetto               pacchetto di rientro (checkpoint o finale)

export function vai(rotta) {
  location.hash = `#${rotta}`;
}

export function rottaCorrente() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const parti = h.split('/').filter(Boolean);
  if (parti[0] !== 'p' || !parti[1]) return { nome: 'elenco' };
  const r = { nome: 'pratica', codice: parti[1], scheda: parti[2] || 'beni', bene: null, gruppo: null, evidenza: null, requisito: null, idRegistro: null, modo: null };
  const gruppo = g => g === 'DOC' ? 'DOC' : g ? Number(g) : null;
  if (r.scheda === 'beni' && /^B\d{2}$/.test(parti[3] || '')) { r.bene = parti[3]; if (parti[4] === 'gruppo') r.gruppo = gruppo(parti[5]); }
  if (r.scheda === 'rilievo' && /^B\d{2}(\.\d{1,2})?$/.test(parti[3] || '')) { r.bene = parti[3]; r.gruppo = gruppo(parti[4]); }
  if (r.scheda === 'evidenza') r.evidenza = parti[3] || null;
  if (r.scheda === 'requisiti' && /^B\d{2}$/.test(parti[3] || '')) r.bene = parti[3];
  if ((r.scheda === 'riscontro' || r.scheda === 'dichiarazione') && /^B\d{2}$/.test(parti[3] || '') && /^(ID|VOCE|DOC|RO[1-5]|RU[1-3])$/.test(parti[4] || '')) {
    r.bene = parti[3]; r.requisito = parti[4]; r.idRegistro = parti[5] || null;
  }
  if (r.scheda === 'azione') r.idRegistro = parti[3] || 'nuova';
  if (r.scheda === 'cronologia' && /^B\d{2}$/.test(parti[3] || '')) r.bene = parti[3];
  if (r.scheda === 'data') {
    r.modo = parti[3] || 'nuova';
    if (r.modo === 'verifica') r.idRegistro = parti[4] || null;
    if (r.modo === 'nuova' && /^B\d{2}$/.test(parti[4] || '')) r.bene = parti[4];
  }
  return r;
}

export const rottaPratica = (codice, scheda, ...resto) => `/p/${encodeURIComponent(codice)}/${scheda}${resto.filter(x => x != null).map(x => `/${x}`).join('')}`;
