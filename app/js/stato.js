// Grandezze ricavate dai dati della pratica (nessun dato nuovo).

// Gruppi che il profilo chiede di raccogliere, per bene
export function gruppiAttesi(bene) {
  return bene.gruppiEvidenze.filter(g => g.attesa === 'si');
}

// evidenze: righe dell'archivio evidenze della pratica
export function riepilogo(pratica, evidenze = []) {
  const a = pratica.andata;
  const valide = evidenze.filter(e => e.stato === 'valida');
  const beneDi = c => c.split('.')[0];
  let attesi = 0, coperti = 0;
  for (const b of a.beni) {
    for (const g of gruppiAttesi(b)) {
      attesi++;
      if (valide.some(e => e.gruppo === g.gruppo && e.beni.map(beneDi).includes(b.codice))) coperti++;
    }
  }
  const targhe = a.beni.filter(b => valide.some(e => e.gruppo === 2 && e.beni.map(beneDi).includes(b.codice))).length;
  return {
    beni: a.beni.length,
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
