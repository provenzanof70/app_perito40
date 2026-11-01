#!/usr/bin/env node
// F3.3 · Importa nel fascicolo i pacchetti di rientro dell'app di sopralluogo (checkpoint o finale, uno o più volumi).
// Prima controlla i volumi (struttura, impronte, andata di origine), poi:
// - copia gli ZIP in rientro/ e li registra; copia ogni evidenza in evidenze/sopralluogo_<Sxx>/ verificandone l'impronta;
// - riporta gli esiti dei dati agli atti nelle schede (verificaCampo), i registri (riscontri, dichiarazioni, note, beni nuovi),
//   le date rilevate nella timeline (con i rimandi alle date agli atti) e le bozze di azione;
// - le proposte di chiusura dal campo restano annotate sull'azione: la chiusura la decide il perito.
// Rifare l'import dello stesso pacchetto, o del finale dopo i checkpoint, non crea doppioni.
//
// Uso: node strumenti/importa_rientro.mjs <cartella pratica> <volume1.zip> [<volume2.zip>…]

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { caricaSchemi, caricaCartella, caricaZip, validaCaricata, sha256 } from './lib/disco.mjs';
import { leggiZip } from './lib/zip.mjs';
import { voceDi } from './lib/andata.mjs';

export const DA_COMPLETARE = '[da completare sul PC]';
const beneDi = c => c.split('.')[0];
const chiave = r => `${r.evento}|${r.data.valore}|${[...r.beni].sort().join(',')}|${r.descrizione || ''}`;

function leggiVolumi(zips) {
  const volumi = zips.map(p => {
    const buf = readFileSync(p);
    const voci = leggiZip(buf, inflateRawSync);
    const json = voci.get('perizia40-rientro.json');
    if (!json) throw new Error(`${basename(p)}: manca perizia40-rientro.json, non è un pacchetto di rientro`);
    return { percorso: p, nome: basename(p), buf, voci, doc: JSON.parse(Buffer.from(json).toString('utf8')) };
  });
  const id = volumi[0].doc.idRientro;
  if (volumi.some(v => v.doc.idRientro !== id)) throw new Error('gli ZIP indicati appartengono a pacchetti diversi: importarli uno alla volta');
  const totale = volumi[0].doc.volume.totale;
  for (let n = 1; n <= totale; n++) if (!volumi.some(v => v.doc.volume.numero === n)) throw new Error(`manca il volume ${n} di ${totale} del pacchetto`);
  return volumi.sort((a, b) => a.doc.volume.numero - b.doc.volume.numero);
}

export function importaRientro(cartella, zips, o = {}) {
  const registro = caricaSchemi();
  const volumi = leggiVolumi(zips);
  const r = volumi[0].doc;
  const fp = join(cartella, 'pratica_40.json');
  const pratica = JSON.parse(readFileSync(fp, 'utf8'));
  if (r.codicePratica !== pratica.codicePratica) throw new Error(`il pacchetto è della pratica ${r.codicePratica}, non di ${pratica.codicePratica}`);
  const pAndata = pratica.pacchetti.find(p => p.tipo === 'andata' && p.id === r.andata.idAndata);
  if (!pAndata) throw new Error(`l'andata ${r.andata.revisione} da cui nasce il pacchetto non è registrata in questa pratica`);
  const chiusi = pratica.beni.filter(b => (JSON.parse(readFileSync(join(cartella, b.scheda), 'utf8')).elaborato || {}).chiusoIl).map(b => b.codice);
  if (chiusi.length) throw new Error(`beni chiusi, in sola lettura: ${chiusi.join(', ')}. Il rientro non si importa in una pratica con perizie già chiuse`);

  // Un pacchetto più vecchio di un finale già importato riporterebbe indietro il fascicolo (es. foto annullate dopo)
  const piuRecente = pratica.pacchetti.find(p => p.tipo === 'rientro_finale' && p.id !== r.idRientro && new Date(p.data) > new Date(r.creatoIl));
  if (piuRecente && !o.forza) throw new Error(`pacchetto del ${r.creatoIl} più vecchio del finale già importato del ${piuRecente.data} (${piuRecente.file}): non si importa`);

  // 1. Controllo dei volumi contro la loro andata, prima di toccare il fascicolo
  const pre = validaCaricata(caricaZip(volumi.map(v => v.percorso), join(cartella, pAndata.file)), registro, { soloRientro: true });
  if (pre.errori.length) return { importato: false, esito: pre };

  const S = r.sopralluogo.id;
  const tipo = r.tipoPacchetto === 'finale' ? 'rientro_finale' : 'rientro_checkpoint';
  const rapporto = { tipo: r.tipoPacchetto, numeroCheckpoint: r.numeroCheckpoint, sopralluogo: S, evidenzeNuove: [], evidenzeAggiornate: [], verifiche: [], date: [], azioniNuove: [], proposte: [], registri: [] };

  // 2. Copia di sicurezza del fascicolo, ZIP in rientro/ e loro registrazione
  mkdirSync(join(cartella, 'rientro'), { recursive: true });
  const etichetta = r.tipoPacchetto === 'finale' ? 'FIN' : `CHK${r.numeroCheckpoint}`;
  writeFileSync(join(cartella, 'rientro', `pratica_40_prima_di_${etichetta}_${r.idRientro.slice(0, 8)}.json.bak`), readFileSync(fp));
  for (const v of volumi) {
    const rel = `rientro/${v.nome}`;
    const dest = join(cartella, rel);
    const impronta = sha256(v.buf);
    if (existsSync(dest)) {
      if (sha256(readFileSync(dest)) !== impronta) throw new Error(`${rel} esiste già con un contenuto diverso`);
    } else if (resolve(v.percorso) !== resolve(dest)) copyFileSync(v.percorso, dest);
    if (!pratica.pacchetti.some(p => p.id === r.idRientro && (p.volume || 1) === v.doc.volume.numero)) {
      pratica.pacchetti.push({ tipo, id: r.idRientro, volume: v.doc.volume.numero, file: rel, sha256: impronta, data: r.creatoIl });
    }
  }

  // 3. Sopralluogo e persone presenti
  for (const p of r.sopralluogo.presenti) if (!pratica.persone.some(x => x.id === p.id)) pratica.persone.push(p);
  let sop = pratica.sopralluoghi.find(s => s.id === S);
  if (!sop) { sop = { id: S, data: r.sopralluogo.data, stato: 'eseguito' }; pratica.sopralluoghi.push(sop); }
  Object.assign(sop, { data: r.sopralluogo.data, stato: 'eseguito', presenti: r.sopralluogo.presenti.map(p => p.id) });

  // 4. Evidenze: file copiati con impronta verificata; quelle già importate si aggiornano (nota, annotazioni, annullamento…)
  const manifesto = new Map(r.manifesto.map(m => [m.idEvidenza, m]));
  const cartellaEv = `evidenze/sopralluogo_${S}`;
  mkdirSync(join(cartella, cartellaEv), { recursive: true });
  for (const e of r.evidenze) {
    const m = manifesto.get(e.id);
    const rel = `${cartellaEv}/${basename(e.file)}`;
    const gia = pratica.evidenze.find(x => x.id === e.id);
    if (gia) {
      if (gia.sha256 !== e.sha256) throw new Error(`${e.id}: impronta diversa da quella già nel fascicolo`);
      const prima = JSON.stringify(gia);
      Object.assign(gia, { ...e, file: gia.file });
      if (JSON.stringify(gia) !== prima) rapporto.evidenzeAggiornate.push(e.id);
      continue;
    }
    const vol = volumi.find(v => v.doc.volume.numero === (m.volume || 1));
    const dati = !m.trasmessaInCheckpoint && vol ? vol.voci.get(e.file) : (existsSync(join(cartella, rel)) ? readFileSync(join(cartella, rel)) : null);
    if (!dati) throw new Error(`${e.id}: file non presente${m.trasmessaInCheckpoint ? ` (consegnato nel checkpoint ${m.trasmessaInCheckpoint}: importare prima quel pacchetto)` : ''}`);
    if (sha256(dati) !== e.sha256) throw new Error(`${e.id}: impronta del file diversa dal manifesto`);
    writeFileSync(join(cartella, rel), dati);
    pratica.evidenze.push({ ...e, file: rel });
    pratica.manifesto = pratica.manifesto.filter(x => x.idEvidenza !== e.id);
    const riga = { ...m, file: rel };
    delete riga.volume; delete riga.trasmessaInCheckpoint;
    pratica.manifesto.push(riga);
    rapporto.evidenzeNuove.push(e.id);
  }

  // 5. Esiti dei dati agli atti nelle schede
  const schede = new Map(pratica.beni.map(b => [b.codice, { file: join(cartella, b.scheda), doc: JSON.parse(readFileSync(join(cartella, b.scheda), 'utf8')) }]));
  for (const v of r.verificheDati) {
    const sc = schede.get(v.bene);
    if (!sc) continue;
    const vc = { esito: v.esito, valoreRilevato: v.valoreRilevato, evidenze: v.evidenze, idRientro: r.idRientro, data: v.data, nota: v.nota };
    voceDi(sc.doc, v.campo).verificaCampo = JSON.parse(JSON.stringify(vc));
    rapporto.verifiche.push(`${v.bene} ${v.campo}: ${v.esito}${v.valoreRilevato ? ` → ${v.valoreRilevato}` : ''}`);
  }

  // 6. Registri: si sostituisce la versione precedente dello stesso codice
  const sostituisci = (lista, nuovi, nome) => {
    for (const x of nuovi) {
      const i = lista.findIndex(y => (y.id || y.codice) === (x.id || x.codice));
      if (i >= 0) lista[i] = x; else { lista.push(x); rapporto.registri.push(`${nome} ${x.id || x.codice}`); }
    }
  };
  sostituisci(pratica.riscontriDiretti, r.riscontriDiretti, 'riscontro');
  sostituisci(pratica.dichiarazioniTerzi, r.dichiarazioniTerzi, 'dichiarazione');
  sostituisci(pratica.noteCampo = pratica.noteCampo || [], r.noteCampo, 'nota di campo');
  sostituisci(pratica.beniNuovi = pratica.beniNuovi || [], r.beniNuovi, 'bene nuovo');

  // 7. Date rilevate: confermano o precisano una data agli atti, oppure diventano righe nuove (rinumerate)
  const prossimoT = () => `T${String(Math.max(0, ...pratica.timeline.map(x => Number(x.id.slice(1)))) + 1).padStart(3, '0')}`;
  for (const d of r.dateRilevate) {
    const segno = `[campo ${S} ${d.id}]`;
    const rif = d.rifTimeline && pratica.timeline.find(x => x.id === d.rifTimeline);
    if (rif && (d.esitoRif === 'confermata' || d.esitoRif === 'precisata')) {
      if ((rif.nota || '').includes(segno)) continue;
      const prove = [...rif.prove, ...d.prove.filter(p => !rif.prove.some(q => q.idEvidenza === p.idEvidenza))];
      if (d.esitoRif === 'precisata') Object.assign(rif, { data: d.data, tipoData: d.tipoData, origine: d.origine, stato: d.stato });
      else if (prove.length) rif.stato = 'documentata';
      rif.prove = prove;
      rif.nota = [rif.nota, `${segno} ${d.esitoRif} in campo${d.nota ? `: ${d.nota}` : ''}`].filter(Boolean).join(' · ');
      rapporto.date.push(`${rif.id} ${d.esitoRif} (${d.data.valore})`);
      continue;
    }
    const riga = { ...d };
    delete riga.rifTimeline; delete riga.esitoRif;
    if (rif) Object.assign(riga, { coerenza: 'N', nota: [`${segno} difforme dalla data agli atti ${rif.id} (${rif.data.valore})`, d.nota].filter(Boolean).join(' · ') });
    if (pratica.timeline.some(x => chiave(x) === chiave(riga))) continue;
    riga.id = prossimoT();
    pratica.timeline.push(riga);
    rapporto.date.push(`${riga.id} ${riga.evento} ${riga.data.valore}${rif ? ` (difforme da ${rif.id})` : ''}`);
  }

  // 8. Bozze di azione dal campo: diventano azioni aperte, con ciò che manca dichiarato
  for (const b of r.nuoveAzioni) {
    if (pratica.azioni.some(a => a.id === b.id)) continue;
    const mancano = ['priorita', 'percheServe', 'esempioAccettabile', 'destinatario'].filter(k => !b[k]);
    pratica.azioni.push(JSON.parse(JSON.stringify({
      id: b.id, priorita: b.priorita || 'raccomandata', beni: b.beni, cosaServe: b.cosaServe, percheServe: b.percheServe || DA_COMPLETARE, requisito: b.requisito,
      esempioAccettabile: b.esempioAccettabile || DA_COMPLETARE, destinatario: b.destinatario || 'perito', categoria: b.categoria, generataDa: b.generataDa,
      nota: [mancano.length ? `Bozza dal campo (${S}): ${mancano.join(', ')} da completare` : null, b.nota].filter(Boolean).join(' · ') || undefined,
      stato: 'aperta', apertaIl: b.apertaIl,
    })));
    rapporto.azioniNuove.push(`${b.id} ${b.cosaServe}${mancano.length ? ' (da completare)' : ''}`);
  }
  // Esiti in campo delle azioni aperte: annotati, mai chiusi in automatico
  for (const u of r.aggiornamentiAzioni) {
    const a = pratica.azioni.find(x => x.id === u.idAzione);
    if (!a) continue;
    const testo = `[campo ${S}] ${u.esitoCampo.replace('_', ' ')}${u.motivoProposto ? ` per ${u.motivoProposto.replace('_', ' ')}` : ''}${u.riscontro ? ` ${u.riscontro}` : ''}${(u.evidenze || []).length ? ` (${u.evidenze.join(', ')})` : ''}${u.nota ? `: ${u.nota}` : ''}`;
    if (!(a.nota || '').includes(testo)) a.nota = [a.nota, testo].filter(Boolean).join(' · ');
    if (u.esitoCampo === 'proposta_chiusura' && a.stato === 'aperta') rapporto.proposte.push(`${a.id}: ${testo}`);
  }

  // 9. Scrittura e controllo completo
  pratica.aggiornataIl = r.creatoIl;
  for (const sc of schede.values()) writeFileSync(sc.file, JSON.stringify(sc.doc, null, 2) + '\n');
  writeFileSync(fp, JSON.stringify(pratica, null, 2) + '\n');
  const esito = validaCaricata(caricaCartella(cartella), registro, {});

  // Da guardare sul PC: targhe da leggere e confrontare con gli atti, evidenze ancora da descrivere
  const valide = pratica.evidenze.filter(e => e.stato === 'valida' && e.idSopralluogo === S);
  rapporto.targhe = valide.filter(e => e.gruppo === 2 && (e.tipo === 'foto' || e.tipo === 'screenshot')).map(e => {
    const sc = schede.get(beneDi(e.beni[0]));
    const comp = sc && e.beni[0].includes('.') && sc.doc.componenti.find(c => c.codice === e.beni[0]);
    const atti = !sc ? 'bene nuovo, censito in campo'
      : comp ? `componente ${comp.codice} ${comp.denominazione}${comp.costruttore ? `, costruttore ${comp.costruttore}` : ''}`
      : ['costruttore', 'modello', 'matricola', 'anno'].map(k => `${k} ${sc.doc.datiAgliAtti.identita[k].valore ?? '—'}`).join(', ');
    return { id: e.id, file: e.file, atti };
  });
  rapporto.daDescrivere = valide.filter(e => /\(da descrivere/.test(e.descrizione || '')).map(e => e.id);
  return { importato: true, esito, rapporto };
}

if (process.argv[1] && process.argv[1].endsWith('importa_rientro.mjs')) {
  const [cartella, ...zips] = process.argv.slice(2);
  if (!cartella || !zips.length) {
    console.error('Uso: node strumenti/importa_rientro.mjs <cartella pratica> <volume1.zip> [<volume2.zip>…]');
    process.exit(2);
  }
  try {
    const { importato, esito, rapporto: x } = importaRientro(cartella, zips);
    if (!importato) {
      console.log('Pacchetto NON importato: il controllo dei volumi ha trovato errori. Il fascicolo non è stato modificato.');
    } else {
      console.log(`Importato il pacchetto ${x.tipo}${x.numeroCheckpoint ? ` n. ${x.numeroCheckpoint}` : ''} del sopralluogo ${x.sopralluogo}.`);
      const elenco = (titolo, l) => { if (l.length) { console.log(`  ${titolo} (${l.length}):`); for (const v of l) console.log(`    ${typeof v === 'string' ? v : `${v.id} · ${v.file} · agli atti: ${v.atti}`}`); } };
      elenco('Evidenze nuove', x.evidenzeNuove.length > 12 ? [`${x.evidenzeNuove.slice(0, 12).join(', ')}…`] : [x.evidenzeNuove.join(', ')].filter(Boolean));
      elenco('Evidenze aggiornate', [x.evidenzeAggiornate.join(', ')].filter(Boolean));
      elenco('Dati agli atti verificati in campo', x.verifiche);
      elenco('Date', x.date);
      elenco('Registri', x.registri);
      elenco('Azioni nate in campo', x.azioniNuove);
      elenco('Proposte di chiusura (decide il perito)', x.proposte);
      elenco('Targhe da leggere e confrontare con gli atti', x.targhe);
      elenco('Evidenze ancora da descrivere', [x.daDescrivere.join(', ')].filter(Boolean));
    }
    for (const e of [...esito.errori, ...esito.avvisi]) console.log(`  ${e.livello === 'errore' ? 'ERRORE' : 'avviso'} ${e.codice}: ${e.messaggio}`);
    process.exit(esito.errori.length ? 1 : 0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
