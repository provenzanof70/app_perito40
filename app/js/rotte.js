// Rotte nell'hash dell'indirizzo:
//   #/                                   elenco pratiche
//   #/p/<codice>/<scheda>                rilievo, beni, requisiti, azioni, pratica
//   #/p/<codice>/beni/<B01>              scheda del bene
//   #/p/<codice>/beni/<B01>/gruppo/<g>   evidenze di un gruppo del bene
//   #/p/<codice>/rilievo/<B01.1>/<g>     rilievo con bene (o componente) e gruppo scelti
//   #/p/<codice>/evidenza/<id>           dettaglio e annotazione di un'evidenza

export function vai(rotta) {
  location.hash = `#${rotta}`;
}

export function rottaCorrente() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const parti = h.split('/').filter(Boolean);
  if (parti[0] !== 'p' || !parti[1]) return { nome: 'elenco' };
  const r = { nome: 'pratica', codice: parti[1], scheda: parti[2] || 'beni', bene: null, gruppo: null, evidenza: null };
  const gruppo = g => g === 'DOC' ? 'DOC' : g ? Number(g) : null;
  if (r.scheda === 'beni' && /^B\d{2}$/.test(parti[3] || '')) { r.bene = parti[3]; if (parti[4] === 'gruppo') r.gruppo = gruppo(parti[5]); }
  if (r.scheda === 'rilievo' && /^B\d{2}(\.\d{1,2})?$/.test(parti[3] || '')) { r.bene = parti[3]; r.gruppo = gruppo(parti[4]); }
  if (r.scheda === 'evidenza') r.evidenza = parti[3] || null;
  return r;
}

export const rottaPratica = (codice, scheda, ...resto) => `/p/${encodeURIComponent(codice)}/${scheda}${resto.filter(x => x != null).map(x => `/${x}`).join('')}`;
