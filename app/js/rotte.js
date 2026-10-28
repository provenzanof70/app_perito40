// Rotte nell'hash dell'indirizzo: #/ elenco, #/p/<codice>/<scheda>

export function vai(rotta) {
  location.hash = `#${rotta}`;
}

export function rottaCorrente() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const m = /^\/p\/([^/]+)(?:\/([a-z]+))?$/.exec(h);
  if (m) return { nome: 'pratica', codice: m[1], scheda: m[2] || 'beni' };
  return { nome: 'elenco' };
}
