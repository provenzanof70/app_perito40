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

// Requisiti per bene: profilo completo RO1–RO5 + RU dichiarati; profilo ridotto voce + interconnessione;
// bene nuovo solo identificazione. Il gruppo indica dove si scatta l'evidenza di un riscontro.
export const REQUISITI_UI = {
  RO1: { nome: 'Controllo CNC/PLC', gruppo: 3 },
  RO2: { nome: 'Interconnessione ai sistemi di fabbrica', gruppo: 5 },
  RO3: { nome: 'Integrazione automatizzata', gruppo: 6 },
  RO4: { nome: 'Interfaccia uomo-macchina', gruppo: 4 },
  RO5: { nome: 'Rispondenza a sicurezza e salute', gruppo: 2 },
  RU1: { nome: 'Telemanutenzione e controllo remoto', gruppo: 7 },
  RU2: { nome: 'Monitoraggio continuo', gruppo: 8 },
  RU3: { nome: 'Sistema cyber-fisico', gruppo: 9 },
  VOCE: { nome: 'Riconducibilità alla voce', gruppo: 1 },
  ID: { nome: 'Identificazione del bene', gruppo: 1 },
  DOC: { nome: 'Documentazione', gruppo: 'DOC' },
};

export function requisitiDelBene(bene) {
  const c = bene.classificazione;
  if (!c) return ['ID'];
  if (c.profilo === 'completo') return ['RO1', 'RO2', 'RO3', 'RO4', 'RO5', ...(c.ruDichiarati || [])];
  return ['VOCE', 'RO2'];
}

// Le tre basi raccolte in campo per un requisito di un bene (§1.3): nessun esito, solo cosa c'è
// agliAtti: evidenze già nel fascicolo (evidenzeEsistenti dell'andata) con codice di questo bene e requisito
export function basiRequisito(bene, requisito, evidenze, registri, andata) {
  const del = e => e.beni.some(b => beneDi(b) === bene.codice);
  return {
    evidenze: evidenze.filter(e => e.stato === 'valida' && del(e) && e.requisiti.includes(requisito)),
    agliAtti: ((andata && andata.evidenzeEsistenti) || []).filter(id => beneDi(id.split('-')[0]) === bene.codice && id.split('-')[1] === requisito),
    riscontri: [...registri.riscontro.values()].filter(r => r.bene === bene.codice && r.requisito === requisito),
    dichiarazioni: [...registri.dichiarazione.values()].filter(d => d.beni.includes(bene.codice) && d.requisito === requisito),
    nota: [...registri.nota.values()].find(n => n.bene === bene.codice && n.requisito === requisito) || null,
  };
}

export function requisitiSenzaBasi(pratica, evidenze, registri) {
  let n = 0;
  for (const b of [...pratica.andata.beni, ...registri.beneNuovo.values()]) {
    for (const r of requisitiDelBene(b)) {
      const x = basiRequisito(b, r, evidenze, registri, pratica.andata);
      if (!x.evidenze.length && !x.agliAtti.length && !x.riscontri.length && !x.dichiarazioni.length) n++;
    }
  }
  return n;
}
