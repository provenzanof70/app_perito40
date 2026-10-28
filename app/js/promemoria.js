// Promemoria di checkpoint durante la visita: ogni 2 ore o ogni 30 evidenze dall'ultimo pacchetto esportato
// (o dall'inizio della visita, se non ne è stato esportato nessuno). Funzione pura, provata in strumenti/prova_app.mjs.

export const SOGLIA_ORE = 2;
export const SOGLIA_EVIDENZE = 30;
export const RINVIO_MINUTI = 30;

// pratica: { visita: { inizio } | null, esportazioni: { ultimo: { data, evidenze } | null }, promemoria: { rinviatoFino } }
// evidenze: numero di evidenze registrate nella pratica; ora: Date
export function statoCheckpoint(pratica, evidenze, ora = new Date()) {
  const visita = pratica.visita;
  if (!visita || !visita.inizio || visita.chiusaIl) return { dovuto: false };
  const ultimo = pratica.esportazioni && pratica.esportazioni.ultimo;
  const base = new Date(ultimo ? ultimo.data : visita.inizio);
  const nuove = evidenze - (ultimo ? ultimo.evidenze : 0);
  const ore = (ora - base) / 3600000;
  const motivo = nuove >= SOGLIA_EVIDENZE ? 'evidenze' : ore >= SOGLIA_ORE ? 'tempo' : null;
  const rinvio = pratica.promemoria && pratica.promemoria.rinviatoFino;
  const rinviato = !!rinvio && new Date(rinvio) > ora;
  return { dovuto: !!motivo && !rinviato, motivo, nuove, ore, base: base.toISOString(), daUltimo: !!ultimo };
}

export function testoPromemoria(s) {
  const da = s.daUltimo ? "dall'ultimo pacchetto" : "dall'inizio della visita";
  if (s.motivo === 'evidenze') return `${s.nuove} evidenze ${da}: crea un checkpoint per metterle al sicuro.`;
  const h = Math.floor(s.ore), m = Math.round((s.ore - h) * 60);
  return `${h} h ${String(m).padStart(2, '0')} min ${da}: crea un checkpoint per mettere al sicuro quanto raccolto.`;
}

export function rinviaFino(ora = new Date()) {
  return new Date(ora.getTime() + RINVIO_MINUTI * 60000).toISOString();
}
