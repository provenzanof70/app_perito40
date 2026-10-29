// Rotte nell'hash dell'indirizzo: #/ elenco, #/p/<codice>/<scheda>[/<bene>]

export function vai(rotta) {
  location.hash = `#${rotta}`;
}

export function rottaCorrente() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const m = /^\/p\/([^/]+)(?:\/([a-z]+))?(?:\/(B\d{2}))?$/.exec(h);
  if (m) return { nome: 'pratica', codice: m[1], scheda: m[2] || 'beni', bene: m[3] || null };
  return { nome: 'elenco' };
}

export const rottaPratica = (codice, scheda, bene) => `/p/${encodeURIComponent(codice)}/${scheda}${bene ? `/${bene}` : ''}`;
