// Costruzione del pacchetto di andata dal fascicolo (pratica_40.json + schede dei beni).
// Usata da genera_andata.mjs per le pratiche e da genera_demo.mjs per la DEMO: stesso codice, stesso formato.

// Dati agli atti che si verificano in campo. Numero, data e direttive della DdC si leggono sul documento, non sul bene.
export const VERIFICARE = ['identita.costruttore', 'identita.modello', 'identita.matricola', 'identita.anno', 'controllore.marca', 'controllore.modello', 'controllore.firmware',
  'hmi.modello', 'reteDichiarata.ip', 'reteDichiarata.sistemaAziendale', 'reteDichiarata.protocollo', 'dichiarazioneCE.riferimentoMatricola', 'esitoGateC'];

export const ETICHETTE = {
  'identita.costruttore': 'Costruttore', 'identita.modello': 'Modello', 'identita.matricola': 'Matricola (leggere sulla targa)', 'identita.anno': 'Anno',
  'controllore.marca': 'PLC/CNC: marca', 'controllore.modello': 'PLC/CNC: modello', 'controllore.firmware': 'PLC/CNC: firmware', 'hmi.modello': 'HMI: modello',
  'reteDichiarata.ip': 'IP dichiarato', 'reteDichiarata.sistemaAziendale': 'Sistema aziendale', 'reteDichiarata.protocollo': 'Protocollo',
  'dichiarazioneCE.riferimentoMatricola': 'DdC: corrispondenza con la matricola in targa', esitoGateC: 'GATE C: perimetro e componenti',
};

export const COSA_CERCARE = {
  1: 'contesto prima del dettaglio', 2: 'targa leggibile, senza riflessi; confrontare con fattura e DdC', 3: 'targa e pagina di sistema del controllore',
  4: 'pagine operative e livelli utente', 5: 'entrambi i lati dello scambio: bene e sistema aziendale, stesso ordine o dato', 6: 'flusso logistico o M2M effettivo',
  7: 'configurazione o sessione di telemanutenzione, senza credenziali', 8: 'variabili monitorate e reazione alle derive', 9: 'modello di comportamento e suo aggiornamento',
  10: 'percorso, file riferibili al bene, contenuto di almeno un report',
  11: 'ripari, pulsanti di emergenza, barriere e marcatura CE sul bene', DOC: 'originali in risoluzione nativa',
};

export const AVVERTENZE = ['Prove sulla rete aziendale solo con la referente IT presente', 'Nessuna password, token o badge nelle foto: se compaiono, oscurare e segnalare',
  'Cambiare codice bene appena si passa fisicamente a un altro bene'];

export const voceDi = (sc, campo) => campo === 'esitoGateC' ? sc.datiAgliAtti.esitoGateC : sc.datiAgliAtti[campo.split('.')[0]][campo.split('.')[1]];
const pulisci = o => JSON.parse(JSON.stringify(o));
const fonte = f => `[ev: ${f.idEvidenza}${f.file ? ` | ${f.file}` : ''}${f.posizione ? `, ${f.posizione}` : ''}]`;

// pratica: fascicolo; schede: Map codice → scheda; o: { versione, idAndata, revisione, creatoIl, sopralluogo: { id, dataPrevista, referenti?, avvertenze? }, guidaRequisiti? }
export function costruisciAndata(pratica, schede, o) {
  const beni = pratica.beni.map(b => {
    const sc = schede.get(b.codice);
    if (!sc) throw new Error(`scheda di ${b.codice} non trovata`);
    return {
      codice: sc.codice, denominazione: sc.denominazione, funzione: sc.funzione, ubicazione: sc.ubicazione,
      componenti: sc.componenti.map(c => ({ codice: c.codice, denominazione: c.denominazione, tipo: c.tipo })),
      classificazione: { allegato: sc.classificazione.allegato, gruppo: sc.classificazione.gruppo, voce: sc.classificazione.voce, profilo: sc.classificazione.profilo, ruDichiarati: sc.classificazione.ruDichiarati },
      gruppiEvidenze: sc.gruppiEvidenze.map(g => ({ gruppo: g.gruppo, titolo: g.titolo, requisiti: g.requisiti, attesa: g.attesa, cosaCercare: COSA_CERCARE[g.gruppo] })),
      datiDaVerificare: VERIFICARE.filter(campo => !voceDi(sc, campo).nonApplicabile).map(campo => {
        const v = voceDi(sc, campo);
        return {
          campo, etichetta: ETICHETTE[campo], valoreAgliAtti: campo === 'esitoGateC' ? v.esito : v.valore, statoAgliAtti: v.stato,
          fonte: v.fonti.length ? v.fonti.map(fonte).join(' ') : undefined,
        };
      }),
    };
  });
  const s = o.sopralluogo;
  return pulisci({
    formato: 'perizia40.andata', versioneSchema: o.versione, demo: pratica.demo, idAndata: o.idAndata, revisione: o.revisione, creatoIl: o.creatoIl,
    codicePratica: pratica.codicePratica, regime: pratica.regime,
    cliente: { ragioneSociale: pratica.cliente.ragioneSociale, sedeIntervento: pratica.cliente.sedeIntervento },
    sopralluogo: { id: s.id, dataPrevista: s.dataPrevista, referenti: s.referenti || pratica.persone, avvertenze: s.avvertenze || AVVERTENZE },
    beni,
    // nell'andata le date sono quelle agli atti: i rimandi delle date rilevate restano nel fascicolo
    timeline: pratica.timeline.map(r => { const c = { ...r }; delete c.rifTimeline; delete c.esitoRif; return c; }),
    azioniAperte: pratica.azioni.filter(a => a.stato === 'aperta'),
    evidenzeEsistenti: pratica.evidenze.map(e => e.id),
    idUsati: {
      riscontri: pratica.riscontriDiretti.map(r => r.id), dichiarazioni: pratica.dichiarazioniTerzi.map(d => d.id),
      note: (pratica.noteCampo || []).map(n => n.id), azioni: pratica.azioni.map(a => a.id),
    },
    guidaRequisiti: o.guidaRequisiti && o.guidaRequisiti.length ? o.guidaRequisiti : undefined,
  });
}
