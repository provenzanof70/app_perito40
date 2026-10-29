// Grandezze ricavate dai dati della pratica (nessun dato nuovo).

// Per ogni gruppo: nome breve e icona dei mockup, requisito usato nel codice evidenza (B01-RO4-003)
export const GRUPPI_UI = {
  1: { nome: 'Bene', icona: 'cube', requisito: 'ID' },
  2: { nome: 'Targa', icona: 'tag', requisito: 'ID' },
  3: { nome: 'PLC/CNC', icona: 'cpu', requisito: 'RO1' },
  4: { nome: 'HMI', icona: 'monitor', requisito: 'RO4' },
  5: { nome: 'Intercon­nessione', icona: 'network', requisito: 'RO2' },
  6: { nome: 'Integrazione', icona: 'arrows_left_right', requisito: 'RO3' },
  7: { nome: 'Remoto', icona: 'broadcast', requisito: 'RU1' },
  8: { nome: 'Monitoraggio', icona: 'chart_line', requisito: 'RU2' },
  9: { nome: 'Modello digitale', icona: 'cube_transparent', requisito: 'RU3' },
  10: { nome: 'Dati in uscita', icona: 'export', requisito: 'RO2' },
  DOC: { nome: 'Documenti', icona: 'file_text', requisito: 'DOC' },
};

export const ATTESA_UI = { si: 'richiesto', su_richiesta: 'su richiesta', se_dichiarato: 'se dichiarato', supporto: 'di supporto', non_applicabile: 'non richiesto' };

// Gruppi per un bene nuovo censito in campo: solo identificazione e documenti, il resto si decide sul PC
export const GRUPPI_BENE_NUOVO = [
  { gruppo: 1, requisiti: ['ID'], attesa: 'si' },
  { gruppo: 2, requisiti: ['ID', 'RO5'], attesa: 'si' },
  { gruppo: 'DOC', requisiti: ['DOC'], attesa: 'si' },
];

const beneDi = c => c.split('.')[0];

export function evidenzeDelBene(evidenze, codice) {
  return evidenze.filter(e => e.stato === 'valida' && e.beni.map(beneDi).includes(codice));
}

export function gruppiDelBene(bene) {
  return bene.gruppiEvidenze || GRUPPI_BENE_NUOVO;
}

// Stato della raccolta di un bene: gruppi attesi, coperti, verifiche fatte
export function statoBene(bene, evidenze, verifiche) {
  const ev = evidenzeDelBene(evidenze, bene.codice);
  const attesi = gruppiDelBene(bene).filter(g => g.attesa === 'si');
  const coperti = attesi.filter(g => ev.some(e => e.gruppo === g.gruppo));
  const ver = [...verifiche.values()].filter(v => v.bene === bene.codice).length;
  const iniziato = ev.length > 0 || ver > 0;
  const stato = !iniziato ? 'da_iniziare' : attesi.length && coperti.length === attesi.length ? 'completo' : 'in_corso';
  return { evidenze: ev, attesi, coperti, verificati: ver, iniziato, stato };
}

export function riepilogo(pratica, evidenze = [], registri = null) {
  const a = pratica.andata;
  const nuovi = registri ? [...registri.beneNuovo.values()] : [];
  const valide = evidenze.filter(e => e.stato === 'valida');
  let attesi = 0, coperti = 0;
  for (const b of a.beni) {
    for (const g of b.gruppiEvidenze.filter(x => x.attesa === 'si')) {
      attesi++;
      if (valide.some(e => e.gruppo === g.gruppo && e.beni.map(beneDi).includes(b.codice))) coperti++;
    }
  }
  const tutti = [...a.beni, ...nuovi];
  const targhe = tutti.filter(b => valide.some(e => e.gruppo === 2 && e.beni.map(beneDi).includes(b.codice))).length;
  return {
    beni: tutti.length,
    targhe,
    evidenze: valide.length,
    azioniAperte: a.azioniAperte.length,
    gruppiAttesi: attesi,
    gruppiConMateriale: coperti,
  };
}

export function contatoriTestata(r) {
  return [
    { n: r.beni, l: 'beni' }, { n: r.targhe, l: 'targhe' },
    { n: r.evidenze, l: 'evidenze' }, { n: r.azioniAperte, l: 'azioni aperte' },
  ];
}
