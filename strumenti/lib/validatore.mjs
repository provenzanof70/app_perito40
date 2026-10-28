// Nucleo del validatore Perizia 4.0 — v1.
// Nessuna dipendenza e nessun accesso al disco: riceve oggetti già letti e le impronte dei file,
// così lo stesso codice può girare nella PWA. La lettura da disco è in ../valida.mjs.

// ---------------------------------------------------------------------------
// Esito
// ---------------------------------------------------------------------------

export function nuovoEsito() {
  const voci = [];
  return {
    voci,
    errore(codice, dove, messaggio) { voci.push({ livello: 'errore', codice, dove, messaggio }); },
    avviso(codice, dove, messaggio) { voci.push({ livello: 'avviso', codice, dove, messaggio }); },
    get errori() { return voci.filter(v => v.livello === 'errore'); },
    get avvisi() { return voci.filter(v => v.livello === 'avviso'); },
  };
}

// ---------------------------------------------------------------------------
// JSON Schema 2020-12: sottoinsieme usato dagli schemi v1
// ---------------------------------------------------------------------------

const FORMATI = {
  date: s => /^\d{4}-\d{2}-\d{2}$/.test(s) && dataValida(s),
  'date-time': s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s) && dataValida(s.slice(0, 10)),
  uuid: s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
};

function dataValida(s) {
  const [a, m, g] = s.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
}

function uguale(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function tipoDi(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function rispettaTipo(v, t) {
  const tv = tipoDi(v);
  if (t === 'number') return tv === 'number' || tv === 'integer';
  return tv === t;
}

export function creaRegistroSchemi(schemi) {
  const perId = new Map();
  for (const s of schemi) perId.set(s.$id, s);
  return perId;
}

function risolvi(ref, baseId, registro) {
  const [file, frammento = ''] = ref.split('#');
  const id = file || baseId;
  let nodo = registro.get(id);
  if (!nodo) throw new Error(`Schema non trovato: ${id}`);
  for (const parte of frammento.split('/').filter(Boolean)) nodo = nodo[decodeURIComponent(parte)];
  if (nodo === undefined) throw new Error(`Riferimento non risolto: ${ref}`);
  return { schema: nodo, baseId: id };
}

function verificaNodo(v, schema, percorso, baseId, registro, out) {
  if (schema === true) return;
  if (schema === false) { out.push([percorso, 'valore non ammesso']); return; }

  if (schema.$ref) {
    const r = risolvi(schema.$ref, baseId, registro);
    verificaNodo(v, r.schema, percorso, r.baseId, registro, out);
  }

  if (schema.type) {
    const tipi = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!tipi.some(t => rispettaTipo(v, t))) {
      out.push([percorso, `tipo atteso ${tipi.join(' o ')}, trovato ${tipoDi(v)}`]);
      return;
    }
  }
  if ('const' in schema && !uguale(v, schema.const)) out.push([percorso, `valore atteso ${JSON.stringify(schema.const)}`]);
  if (schema.enum && !schema.enum.some(e => uguale(e, v))) out.push([percorso, `valore ${JSON.stringify(v)} non tra ${schema.enum.map(e => JSON.stringify(e)).join(', ')}`]);

  if (typeof v === 'string') {
    if (schema.minLength !== undefined && [...v].length < schema.minLength) out.push([percorso, 'testo vuoto o troppo corto']);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(v)) out.push([percorso, `"${v}" non rispetta il formato ${schema.pattern}`]);
    if (schema.format && FORMATI[schema.format] && !FORMATI[schema.format](v)) out.push([percorso, `"${v}" non è un ${schema.format} valido`]);
  }
  if (typeof v === 'number') {
    if (schema.minimum !== undefined && v < schema.minimum) out.push([percorso, `minimo ${schema.minimum}`]);
    if (schema.maximum !== undefined && v > schema.maximum) out.push([percorso, `massimo ${schema.maximum}`]);
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) out.push([percorso, `servono almeno ${schema.minItems} elementi`]);
    if (schema.maxItems !== undefined && v.length > schema.maxItems) out.push([percorso, `al massimo ${schema.maxItems} elementi`]);
    if (schema.uniqueItems && new Set(v.map(x => JSON.stringify(x))).size !== v.length) out.push([percorso, 'elementi ripetuti']);
    if (schema.items) v.forEach((x, i) => verificaNodo(x, schema.items, `${percorso}/${i}`, baseId, registro, out));
  }
  if (tipoDi(v) === 'object') {
    for (const k of schema.required || []) if (!(k in v)) out.push([percorso, `manca la proprietà obbligatoria "${k}"`]);
    const props = schema.properties || {};
    for (const [k, x] of Object.entries(v)) {
      if (props[k]) verificaNodo(x, props[k], `${percorso}/${k}`, baseId, registro, out);
      else if (schema.additionalProperties === false) out.push([percorso, `proprietà non prevista "${k}"`]);
      else if (typeof schema.additionalProperties === 'object') verificaNodo(x, schema.additionalProperties, `${percorso}/${k}`, baseId, registro, out);
    }
  }

  const prova = s => { const o = []; verificaNodo(v, s, percorso, baseId, registro, o); return o; };
  for (const s of schema.allOf || []) verificaNodo(v, s, percorso, baseId, registro, out);
  if (schema.anyOf && !schema.anyOf.some(s => prova(s).length === 0)) out.push([percorso, 'non corrisponde a nessuna delle forme ammesse']);
  if (schema.oneOf && schema.oneOf.filter(s => prova(s).length === 0).length !== 1) out.push([percorso, 'deve corrispondere a una e una sola forma ammessa']);
  if (schema.not && prova(schema.not).length === 0) out.push([percorso, 'forma non ammessa']);
  if (schema.if) {
    const ramo = prova(schema.if).length === 0 ? schema.then : schema.else;
    if (ramo) verificaNodo(v, ramo, percorso, baseId, registro, out);
  }
}

const SCHEMA_PER_FORMATO = {
  'perizia40.pratica': 'pratica_40.v1.schema.json',
  'perizia40.scheda_bene': 'scheda_bene.v1.schema.json',
  'perizia40.andata': 'perizia40-andata.v1.schema.json',
  'perizia40.rientro': 'perizia40-rientro.v1.schema.json',
};

export function validaStruttura(doc, registro, esito, dove) {
  const id = SCHEMA_PER_FORMATO[doc && doc.formato];
  if (!id) { esito.errore('FORMATO_SCONOSCIUTO', dove, `campo "formato" assente o non riconosciuto: ${JSON.stringify(doc && doc.formato)}`); return false; }
  const out = [];
  verificaNodo(doc, registro.get(id), '', id, registro, out);
  for (const [p, m] of out) esito.errore('SCHEMA', `${dove}#${p || '/'}`, m);
  return out.length === 0;
}

// ---------------------------------------------------------------------------
// Tabelle del metodo (§2.7)
// ---------------------------------------------------------------------------

export const GRUPPI = [
  { gruppo: 1, titolo: 'Bene', requisiti: ['ID'], completo: 'si', ridotto: 'si' },
  { gruppo: 2, titolo: 'Targa', requisiti: ['ID', 'RO5'], completo: 'si', ridotto: 'si' },
  { gruppo: 3, titolo: 'Controllore', requisiti: ['RO1'], completo: 'si', ridotto: 'su_richiesta' },
  { gruppo: 4, titolo: 'HMI', requisiti: ['RO1', 'RO4'], completo: 'si', ridotto: 'su_richiesta' },
  { gruppo: 5, titolo: 'Interconnessione', requisiti: ['RO2'], completo: 'si', ridotto: 'si' },
  { gruppo: 6, titolo: 'Integrazione', requisiti: ['RO3'], completo: 'si', ridotto: 'su_richiesta' },
  { gruppo: 7, titolo: 'Remoto', requisiti: ['RU1'], completo: 'se_dichiarato', ridotto: 'non_applicabile' },
  { gruppo: 8, titolo: 'Monitoraggio', requisiti: ['RU2'], completo: 'se_dichiarato', ridotto: 'non_applicabile' },
  { gruppo: 9, titolo: 'Modello digitale', requisiti: ['RU3'], completo: 'se_dichiarato', ridotto: 'non_applicabile' },
  { gruppo: 10, titolo: 'Dati in uscita', requisiti: ['RO2'], completo: 'supporto', ridotto: 'si' },
  { gruppo: 'DOC', titolo: 'Documenti', requisiti: ['DOC'], completo: 'si', ridotto: 'si' },
];

const GRUPPO = new Map(GRUPPI.map(g => [g.gruppo, g]));

// Coppie [prima, dopo]: l'evento "dopo" non può essere certamente anteriore all'evento "prima" (§6.1)
const ORDINE_EVENTI = [
  ['ddt_consegna', 'installazione'],
  ['installazione', 'entrata_in_funzione'],
  ['installazione', 'interconnessione_dichiarata'],
  ['installazione', 'prima_prova_scambio'],
  ['dichiarazione_conformita', 'entrata_in_funzione'],
  ['interconnessione_dichiarata', 'perizia'],
  ['perizia', 'asseverazione'],
];

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------

const beneDi = codice => codice.split('.')[0];
const requisitoDaId = id => id.split('-')[1];
const beneDaId = id => id.split('-')[0];

function intervallo(d) {
  const v = d.valore;
  if (d.precisione === 'giorno') return [v, v];
  if (d.precisione === 'mese') return [`${v}-01`, `${v}-31`];
  const [a, b] = v.split('/');
  return [a, b];
}

function precisioneCoerente(d) {
  if (d.precisione === 'giorno') return /^\d{4}-\d{2}-\d{2}$/.test(d.valore) && dataValida(d.valore);
  if (d.precisione === 'mese') return /^\d{4}-\d{2}$/.test(d.valore);
  const m = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(d.valore);
  return !!m && dataValida(m[1]) && dataValida(m[2]) && m[1] <= m[2];
}

function* stringhe(v, percorso = '') {
  if (typeof v === 'string') yield [percorso, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* stringhe(v[i], `${percorso}/${i}`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { yield [`${percorso}/${k}`, k]; yield* stringhe(x, `${percorso}/${k}`); }
}

// Raccoglie tutti i refEv {idEvidenza} presenti in un documento
function* refEvidenze(v, percorso = '') {
  if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* refEvidenze(v[i], `${percorso}/${i}`);
  else if (v && typeof v === 'object') {
    if (typeof v.idEvidenza === 'string') yield [percorso, v.idEvidenza];
    for (const [k, x] of Object.entries(v)) yield* refEvidenze(x, `${percorso}/${k}`);
  }
}

// ---------------------------------------------------------------------------
// Riservatezza e dati DEMO (§12.5)
// ---------------------------------------------------------------------------

const IP_DOCUMENTAZIONE = [/^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./];
const EMAIL_FITTIZIE = /@([a-z0-9-]+\.)*(example\.(com|org|net)|[a-z0-9-]+\.(example|test|invalid))$/i;

export function controllaRiservatezza(doc, esito, dove, { demo }) {
  for (const [p, s] of stringhe(doc)) {
    if (/\b(password|passwd|pwd|token|api[_-]?key|secret|segreto)\s*[:=]\s*\S+/i.test(s) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s)) {
      esito.errore('CREDENZIALI', `${dove}#${p}`, 'sembra contenere una credenziale: oscurarla e segnalarne la sostituzione al cliente');
    }
    if (!demo) continue;
    for (const ip of s.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []) {
      if (ip.split('.').every(o => Number(o) <= 255) && !IP_DOCUMENTAZIONE.some(r => r.test(ip))) {
        esito.errore('DEMO_IP_REALE', `${dove}#${p}`, `IP ${ip} fuori dagli intervalli di documentazione (192.0.2.x, 198.51.100.x, 203.0.113.x)`);
      }
    }
    for (const mac of s.match(/\b[0-9A-F]{2}([:-])(?:[0-9A-F]{2}\1){4}[0-9A-F]{2}\b/gi) || []) {
      if (!/^00[:-]00[:-]5E[:-]00[:-]53[:-]/i.test(mac)) esito.errore('DEMO_MAC_REALE', `${dove}#${p}`, `MAC ${mac} fuori dall'intervallo di documentazione 00:00:5E:00:53:xx`);
    }
    for (const mail of s.match(/[^\s@"]+@[^\s@"]+\.[a-z]{2,}/gi) || []) {
      if (!EMAIL_FITTIZIE.test(mail)) esito.errore('DEMO_EMAIL_REALE', `${dove}#${p}`, `indirizzo ${mail} non su dominio riservato (example.com, .test, .invalid)`);
    }
    if (/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/.test(s)) esito.errore('DEMO_CODICE_FISCALE', `${dove}#${p}`, 'sembra un codice fiscale');
    if (/\b\d{11}\b/.test(s)) esito.avviso('DEMO_PARTITA_IVA', `${dove}#${p}`, 'numero di 11 cifre: verificare che non sia una partita IVA reale');
  }
}

// ---------------------------------------------------------------------------
// Controlli sulla scheda del bene
// ---------------------------------------------------------------------------

function vociAgliAtti(scheda) {
  const out = [];
  for (const [sezione, campi] of Object.entries(scheda.datiAgliAtti || {})) {
    if (sezione === 'esitoGateC') { out.push(['esitoGateC', campi]); continue; }
    for (const [campo, voce] of Object.entries(campi)) out.push([`${sezione}.${campo}`, voce]);
  }
  return out;
}

export function valoreAgliAtti(scheda, campo) {
  if (campo === 'esitoGateC') return scheda.datiAgliAtti.esitoGateC.esito;
  const [s, c] = campo.split('.');
  return scheda.datiAgliAtti[s][c].valore;
}

export function controllaScheda(scheda, esito, dove) {
  const c = scheda.classificazione;
  const atteso = c.allegato === 'A' && c.gruppo === 1 ? 'completo' : 'ridotto';
  if (c.profilo !== atteso) esito.errore('PROFILO_INCOERENTE', `${dove}#/classificazione`, `Allegato ${c.allegato}${c.gruppo ? ' Gruppo ' + c.gruppo : ''} richiede il profilo ${atteso}`);
  const ru = c.ruDichiarati || [];
  if (c.profilo === 'completo' && ru.length < 2) esito.avviso('RU_INSUFFICIENTI', `${dove}#/classificazione`, 'profilo completo: dichiarare almeno 2 requisiti ulteriori');
  if (c.profilo === 'ridotto' && ru.length) esito.avviso('RU_PROFILO_RIDOTTO', `${dove}#/classificazione`, 'requisiti ulteriori dichiarati su un bene a profilo ridotto');
  if (c.sostenibilita !== 'solida') esito.avviso('CLASSIFICAZIONE_DA_MOTIVARE', `${dove}#/classificazione`, `sostenibilità della classificazione: ${c.sostenibilita}`);

  for (const comp of scheda.componenti) {
    if (beneDi(comp.codice) !== scheda.codice) esito.errore('COMPONENTE_CODICE', `${dove}#/componenti`, `il componente ${comp.codice} non appartiene a ${scheda.codice}`);
  }

  for (const [campo, voce] of vociAgliAtti(scheda)) {
    const p = `${dove}#/datiAgliAtti/${campo.replace('.', '/')}`;
    if ((voce.stato === 'documentato') && voce.fonti.length === 0) esito.errore('DATO_SENZA_FONTE', p, 'dato documentato senza fonte [ev:]');
    if (campo !== 'esitoGateC' && voce.valore === null && voce.stato !== 'da_verificare' && !voce.nonApplicabile) esito.errore('DATO_VUOTO', p, 'valore assente: lo stato deve essere da_verificare');
    const v = voce.verificaCampo;
    if (v) {
      if ((v.esito === 'corretto' || v.esito === 'difforme') && !v.valoreRilevato) esito.errore('VERIFICA_SENZA_VALORE', p, `esito ${v.esito} senza valore rilevato`);
      if (v.esito !== 'non_verificabile' && !(v.evidenze || []).length) esito.errore('VERIFICA_SENZA_EVIDENZA', p, `esito ${v.esito} senza evidenza collegata`);
      if (v.esito === 'difforme') esito.avviso('ALERT_DIFFORMITA', p, `bene in campo difforme dai documenti (rilevato "${v.valoreRilevato}"): incoerenza bene periziato/fatturato da risolvere`);
    }
  }
  if (scheda.datiAgliAtti.esitoGateC.esito === 'rosso') esito.avviso('ALERT_GATE_C', `${dove}#/datiAgliAtti/esitoGateC`, 'GATE C rosso: nessuna conclusione positiva senza risoluzione');

  controllaGruppi(scheda.gruppiEvidenze, c, esito, `${dove}#/gruppiEvidenze`);
}

export function controllaGruppi(gruppi, classificazione, esito, dove) {
  const visti = new Set();
  for (const g of gruppi) {
    const rif = GRUPPO.get(g.gruppo);
    if (visti.has(g.gruppo)) esito.errore('GRUPPO_DUPLICATO', dove, `gruppo ${g.gruppo} ripetuto`);
    visti.add(g.gruppo);
    if (!rif) continue;
    if (!uguale([...g.requisiti].sort(), [...rif.requisiti].sort())) esito.avviso('GRUPPO_REQUISITI', dove, `gruppo ${g.gruppo}: requisiti ${g.requisiti.join(',')} diversi dallo standard ${rif.requisiti.join(',')}`);
    const standard = rif[classificazione.profilo];
    const ruDichiarato = rif.requisiti.some(r => (classificazione.ruDichiarati || []).includes(r));
    const ammessa = g.attesa === standard || (standard === 'se_dichiarato' && g.attesa === (ruDichiarato ? 'si' : 'non_applicabile'));
    if (!ammessa && !g.motivoVariazione) esito.avviso('GRUPPO_ATTESA', dove, `gruppo ${g.gruppo}: attesa "${g.attesa}" diversa da "${standard}" del profilo ${classificazione.profilo}, senza motivoVariazione`);
    if (standard === 'se_dichiarato' && ruDichiarato && g.attesa !== 'si') esito.avviso('GRUPPO_RU_NON_RACCOLTO', dove, `gruppo ${g.gruppo}: ${rif.requisiti[0]} dichiarato ma attesa "${g.attesa}"`);
  }
  for (const rif of GRUPPI) if (!visti.has(rif.gruppo)) esito.errore('GRUPPO_MANCANTE', dove, `manca il gruppo ${rif.gruppo} (${rif.titolo})`);
}

// ---------------------------------------------------------------------------
// Controlli comuni a pratica e rientro
// ---------------------------------------------------------------------------

function controllaEvidenze(evidenze, beniNoti, esito, dove) {
  const perId = new Map();
  evidenze.forEach((e, i) => {
    const p = `${dove}#/evidenze/${i}`;
    if (perId.has(e.id)) esito.errore('EVIDENZA_DUPLICATA', p, `identificativo ${e.id} ripetuto`);
    perId.set(e.id, e);
    if (beneDaId(e.id) !== e.beni[0]) esito.errore('EVIDENZA_BENE_ERRATO', p, `${e.id} è riferita a ${e.beni[0]}: il codice deve iniziare con il primo bene`);
    if (e.beni.length > 1 && !e.comune) esito.errore('EVIDENZA_COMUNE_NON_DICHIARATA', p, `${e.id} cita più beni senza comune = true`);
    for (const b of e.beni) if (!beniNoti.has(b)) esito.errore('BENE_INESISTENTE', p, `bene ${b} non censito`);
    if (!e.requisiti.includes(requisitoDaId(e.id))) esito.errore('EVIDENZA_REQUISITO', p, `il requisito ${requisitoDaId(e.id)} del codice non è tra i requisiti dell'evidenza`);
    const rif = GRUPPO.get(e.gruppo);
    if (rif && e.gruppo !== 'DOC' && !e.requisiti.some(r => rif.requisiti.includes(r) || r === 'VOCE' || r === 'DOC')) {
      esito.avviso('EVIDENZA_GRUPPO', p, `gruppo ${e.gruppo} (${rif.titolo}) e requisiti ${e.requisiti.join(',')} non coerenti`);
    }
    if (e.stato === 'valida' && e.annullamento) esito.errore('EVIDENZA_ANNULLAMENTO', p, 'evidenza valida con dati di annullamento');
    if ((e.tipo === 'vocale' || e.tipo === 'video') && e.durataSecondi === undefined) esito.avviso('MEDIA_SENZA_DURATA', p, `${e.tipo} senza durata`);
    if (e.tipo === 'foto' && !(e.annotazioni || []).length && !e.descrizione) esito.avviso('FOTO_SENZA_ANNOTAZIONE', p, 'foto senza annotazione');
    (e.trascrizioni || []).forEach((t, j) => {
      if (!t.confrontataConOriginale) esito.avviso('TRASCRIZIONE_NON_CONFRONTATA', `${p}/trascrizioni/${j}`, `trascrizione (${t.origine}) non ancora confrontata con l'originale`);
    });
    if (e.origineDataScatto === 'assente') esito.avviso('DATA_SCATTO_ASSENTE', p, `${e.id}: metadati di scatto assenti, nota solo l'ora di acquisizione nell'app`);
    if (e.dataScatto && Date.parse(e.dataScatto) > Date.parse(e.acquisitaIl)) esito.errore('DATA_SCATTO_SUCCESSIVA', p, `${e.id}: data di scatto ${e.dataScatto} successiva all'acquisizione ${e.acquisitaIl}`);
    if (e.dataMostrataAVideo && e.dataMostrataAVideo.orologioErrato) esito.avviso('OROLOGIO_ERRATO', p, `orologio del bene errato registrato (${e.dataMostrataAVideo.scartoStimato || 'scarto non stimato'})`);
  });
  evidenze.forEach((e, i) => {
    const s = e.annullamento && e.annullamento.sostituitaDa;
    if (s && !perId.has(s)) esito.errore('EVIDENZA_INESISTENTE', `${dove}#/evidenze/${i}/annullamento`, `sostituitaDa ${s} non esiste`);
  });
  return perId;
}

function controllaManifesto(manifesto, evidenze, esito, dove) {
  const perId = new Map();
  manifesto.forEach((m, i) => {
    if (perId.has(m.idEvidenza)) esito.errore('MANIFESTO_DUPLICATO', `${dove}#/manifesto/${i}`, `${m.idEvidenza} ripetuto`);
    perId.set(m.idEvidenza, m);
  });
  for (const e of evidenze.values()) {
    const m = perId.get(e.id);
    if (!m) { esito.errore('MANIFESTO_MANCANTE', dove, `l'evidenza ${e.id} non è nel manifesto`); continue; }
    if (m.sha256 !== e.sha256) esito.errore('MANIFESTO_HASH', dove, `${e.id}: impronta diversa tra evidenza e manifesto`);
    if (m.file !== e.file) esito.errore('MANIFESTO_FILE', dove, `${e.id}: file diverso tra evidenza e manifesto`);
    if (m.provenienza !== e.provenienza) esito.errore('MANIFESTO_PROVENIENZA', dove, `${e.id}: provenienza diversa tra evidenza e manifesto`);
  }
  for (const id of perId.keys()) if (!evidenze.has(id)) esito.errore('MANIFESTO_ORFANO', dove, `${id} nel manifesto ma non tra le evidenze`);
  return perId;
}

// Verifica che i file elencati esistano con l'impronta dichiarata. file: Map percorso → {sha256, byte}
function controllaFile(righe, file, esito, dove, filtro = () => true) {
  for (const m of righe) {
    if (!filtro(m)) continue;
    const f = file.get(m.file);
    if (!f) { esito.errore('FILE_MANCANTE', dove, `${m.idEvidenza}: file ${m.file} assente`); continue; }
    if (f.sha256 !== m.sha256) esito.errore('HASH_DIVERSO', dove, `${m.idEvidenza}: l'impronta di ${m.file} non corrisponde al manifesto`);
    if (m.byte !== undefined && f.byte !== m.byte) esito.errore('DIMENSIONE_DIVERSA', dove, `${m.idEvidenza}: dimensione di ${m.file} diversa dal manifesto`);
  }
}

function controllaTimeline(righe, beniNoti, evidenze, esito, dove, chiave = 'timeline') {
  const ids = new Set();
  righe.forEach((r, i) => {
    const p = `${dove}#/${chiave}/${i}`;
    if (ids.has(r.id)) esito.errore('TIMELINE_ID_DUPLICATO', p, `${r.id} ripetuto`);
    ids.add(r.id);
    if (!precisioneCoerente(r.data)) esito.errore('TIMELINE_PRECISIONE', p, `"${r.data.valore}" non coerente con la precisione ${r.data.precisione}`);
    if (r.stato === 'documentata' && r.prove.length === 0) esito.errore('TIMELINE_SENZA_PROVA', p, 'data documentata senza documento di prova [ev:]');
    if (r.stato === 'documentata' && r.origine === 'dichiarazione_impresa') esito.errore('TIMELINE_STATO_ORIGINE', p, "una data che viene solo da una dichiarazione dell'impresa non è documentata");
    for (const b of r.beni) if (!beniNoti.has(b)) esito.errore('BENE_INESISTENTE', p, `bene ${b} non censito`);
    for (const pr of r.prove) {
      const e = evidenze && evidenze.get(pr.idEvidenza);
      if (e && !r.beni.some(b => e.beni.map(beneDi).includes(beneDi(b)))) esito.avviso('TIMELINE_PROVA_ALTRO_BENE', p, `${pr.idEvidenza} non è riferita ai beni della riga`);
    }
  });

  const perBene = new Map();
  for (const r of righe) {
    if (!precisioneCoerente(r.data)) continue;
    for (const b of new Set(r.beni.map(beneDi))) {
      if (!perBene.has(b)) perBene.set(b, []);
      perBene.get(b).push(r);
    }
  }
  for (const [b, rr] of perBene) {
    for (const [prima, dopo] of ORDINE_EVENTI) {
      for (const a of rr.filter(r => r.evento === prima)) {
        for (const z of rr.filter(r => r.evento === dopo)) {
          if (intervallo(z.data)[1] < intervallo(a.data)[0]) {
            const livello = prima === 'dichiarazione_conformita' ? 'avviso' : 'errore';
            esito[livello](livello === 'errore' ? 'TIMELINE_ANACRONISMO' : 'ALERT_GATE_C', `${dove}#/${chiave}`, `${b}: ${dopo} (${z.id}, ${z.data.valore}) anteriore a ${prima} (${a.id}, ${a.data.valore})`);
          }
        }
      }
    }
    for (const d of rr.filter(r => r.evento === 'interconnessione_dichiarata')) {
      for (const pp of rr.filter(r => r.evento === 'prima_prova_scambio')) {
        if (intervallo(pp.data)[0] > intervallo(d.data)[1]) {
          esito.avviso('PRIMA_PROVA_SUCCESSIVA', `${dove}#/${chiave}`, `${b}: prima prova datata dello scambio (${pp.data.valore}) successiva all'interconnessione dichiarata (${d.data.valore}); rappresentare lo scarto, non anticipare la data`);
          if (d.coerenza === 'S' && pp.coerenza === 'S') esito.avviso('TIMELINE_COERENZA', `${dove}#/${chiave}`, `${b}: scarto tra ${d.id} e ${pp.id} con coerenza S su entrambe`);
        }
      }
    }
  }
}

function controllaRiferimenti(doc, evidenze, esito, dove, esterni = new Set()) {
  for (const [p, id] of refEvidenze(doc)) {
    const e = evidenze.get(id);
    if (!e && !esterni.has(id)) esito.errore('EVIDENZA_INESISTENTE', `${dove}#${p}`, `[ev: ${id}] non esiste nel fascicolo`);
    else if (e && e.stato === 'annullata') esito.avviso('EVIDENZA_ANNULLATA_CITATA', `${dove}#${p}`, `[ev: ${id}] è annullata: ${e.annullamento.motivo}`);
  }
}

function controllaIdEvidenze(lista, evidenze, esito, dove, esterni = new Set()) {
  for (const id of lista) {
    const e = evidenze.get(id);
    if (!e && !esterni.has(id)) esito.errore('EVIDENZA_INESISTENTE', dove, `${id} non esiste`);
    else if (e && e.stato === 'annullata') esito.avviso('EVIDENZA_ANNULLATA_CITATA', dove, `${id} è annullata`);
  }
}

function controllaRiscontri(riscontri, beniNoti, evidenze, sopralluoghi, esito, dove, esterni) {
  riscontri.forEach((r, i) => {
    const p = `${dove}#/riscontriDiretti/${i}`;
    if (!beniNoti.has(r.bene)) esito.errore('BENE_INESISTENTE', p, `bene ${r.bene} non censito`);
    const s = sopralluoghi.get(r.idSopralluogo);
    if (!s) esito.errore('SOPRALLUOGO_INESISTENTE', p, `sopralluogo ${r.idSopralluogo} non registrato`);
    else if (s !== r.dataVisita) esito.errore('RISCONTRO_DATA_VISITA', p, `data della visita ${r.dataVisita} diversa da quella del sopralluogo ${r.idSopralluogo} (${s})`);
    if (r.evidenze.length === 0) esito.avviso('RISCONTRO_SENZA_EVIDENZA', p, 'riscontro diretto senza evidenza fotografica o log collegato');
    controllaIdEvidenze(r.evidenze, evidenze, esito, p, esterni);
    for (const id of r.evidenze) {
      const e = evidenze.get(id);
      if (e && !e.beni.map(beneDi).includes(beneDi(r.bene))) esito.avviso('RISCONTRO_EVIDENZA_ALTRO_BENE', p, `${id} non è riferita a ${r.bene}`);
    }
    if (/\b(ok|conforme|interconness[oa] ok|tutto regolare)\b/i.test(r.frase) && r.frase.split(/\s+/).length < 8) {
      esito.avviso('RISCONTRO_GENERICO', p, 'frase generica: indicare fatto + oggetto + circostanza osservati');
    }
  });
}

function controllaDichiarazioni(dichiarazioni, beniNoti, evidenze, esito, dove, esterni) {
  dichiarazioni.forEach((d, i) => {
    const p = `${dove}#/dichiarazioniTerzi/${i}`;
    for (const b of d.beni) if (!beniNoti.has(b)) esito.errore('BENE_INESISTENTE', p, `bene ${b} non censito`);
    if (d.evidenzaDichiarazione) controllaIdEvidenze([d.evidenzaDichiarazione], evidenze, esito, p, esterni);
    if (d.riscontroOggettivo.esito === 'N') esito.avviso('DICHIARAZIONE_NON_RISCONTRATA', p, `${d.id}: dichiarazione senza riscontro oggettivo, non dimostra il requisito ${d.requisito}`);
  });
}

// origini: { dichiarazione: Set, riscontro: Set, verifica: Set, nota: Set } degli identificativi esistenti
function controllaAzioni(azioni, beniNoti, evidenze, riscontri, esito, dove, chiave = 'azioni', origini = null) {
  const ids = new Set();
  azioni.forEach((a, i) => {
    const p = `${dove}#/${chiave}/${i}`;
    if (ids.has(a.id)) esito.errore('AZIONE_DUPLICATA', p, `${a.id} ripetuta`);
    ids.add(a.id);
    if (a.generataDa && origini && origini[a.generataDa.tipo] && !origini[a.generataDa.tipo].has(a.generataDa.id)) {
      esito.errore('GENERATA_DA_INESISTENTE', p, `${a.id}: generata da ${a.generataDa.tipo} ${a.generataDa.id}, che non esiste`);
    }
    for (const b of a.beni) if (!beniNoti.has(b)) esito.errore('BENE_INESISTENTE', p, `bene ${b} non censito`);
    if (a.stato === 'aperta' && a.chiusura) esito.errore('AZIONE_APERTA_CON_CHIUSURA', p, `${a.id} aperta ma con dati di chiusura`);
    const c = a.chiusura;
    if (a.stato !== 'chiusa' || !c) return;
    if (c.motivo === 'evidenza_acquisita' && !(c.evidenze || []).length) esito.errore('AZIONE_CHIUSA_SENZA_MOTIVO', p, `${a.id} chiusa per evidenza acquisita senza [ev:]`);
    if (c.motivo === 'riscontro_diretto' && !c.riscontro) esito.errore('AZIONE_CHIUSA_SENZA_MOTIVO', p, `${a.id} chiusa per riscontro diretto senza indicarlo`);
    if (c.riscontro && !riscontri.has(c.riscontro)) esito.errore('RISCONTRO_INESISTENTE', p, `${c.riscontro} non registrato`);
    if (c.data < a.apertaIl) esito.errore('AZIONE_DATE', p, `${a.id} chiusa prima di essere aperta`);
  });
  return ids;
}

function controllaNoteCampo(note, beniNoti, esito, dove) {
  const ids = new Set();
  note.forEach((n, i) => {
    const p = `${dove}#/noteCampo/${i}`;
    if (ids.has(n.id)) esito.errore('NOTA_DUPLICATA', p, `${n.id} ripetuta`);
    ids.add(n.id);
    if (!beniNoti.has(n.bene)) esito.errore('BENE_INESISTENTE', p, `bene ${n.bene} non censito`);
  });
  return ids;
}

// Aggiunge a beniNoti i beni censiti in campo, segnalando i codici già usati
function aggiungiBeniNuovi(beniNuovi, beniNoti, esito, dove) {
  beniNuovi.forEach((b, i) => {
    const p = `${dove}#/beniNuovi/${i}`;
    if (beniNoti.has(b.codice)) esito.errore('BENE_NUOVO_DUPLICATO', p, `il codice ${b.codice} è già usato`);
    beniNoti.add(b.codice);
    for (const c of b.componenti) {
      if (beneDi(c.codice) !== b.codice) esito.errore('COMPONENTE_CODICE', p, `il componente ${c.codice} non appartiene a ${b.codice}`);
      if (beniNoti.has(c.codice)) esito.errore('BENE_NUOVO_DUPLICATO', p, `il codice ${c.codice} è già usato`);
      beniNoti.add(c.codice);
    }
    if (b.matricolaTarga.stato !== 'letta') esito.avviso('MATRICOLA_NON_LETTA', p, `${b.codice}: matricola ${b.matricolaTarga.stato}, riscontro da programmare`);
  });
}

function beniDaSchede(schede) {
  const s = new Set();
  for (const sc of schede.values()) { s.add(sc.codice); for (const c of sc.componenti) s.add(c.codice); }
  return s;
}

// ---------------------------------------------------------------------------
// Pratica sul PC
// ---------------------------------------------------------------------------

// ctx: { pratica, schede: Map nomeFile → scheda, file: Map percorso → {sha256, byte} della cartella pratica }
export function controllaPratica(ctx, esito, dove = 'pratica_40.json') {
  const { pratica, schede } = ctx;
  const schedePerCodice = new Map();
  pratica.beni.forEach((b, i) => {
    const sc = schede.get(b.scheda);
    if (!sc) { esito.errore('SCHEDA_MANCANTE', `${dove}#/beni/${i}`, `scheda ${b.scheda} assente`); return; }
    if (sc.codice !== b.codice) esito.errore('SCHEDA_CODICE', `${dove}#/beni/${i}`, `la scheda ${b.scheda} è del bene ${sc.codice}`);
    if (sc.codicePratica !== pratica.codicePratica) esito.errore('CODICE_PRATICA', b.scheda, 'codice pratica diverso');
    if (sc.demo !== pratica.demo) esito.errore('DEMO_INCOERENTE', b.scheda, 'flag demo diverso dalla pratica');
    if (schedePerCodice.has(b.codice)) esito.errore('BENE_DUPLICATO', `${dove}#/beni/${i}`, `${b.codice} ripetuto`);
    schedePerCodice.set(b.codice, sc);
  });
  const beniNoti = beniDaSchede(schedePerCodice);
  aggiungiBeniNuovi(pratica.beniNuovi || [], beniNoti, esito, dove);
  const sopralluoghi = new Map(pratica.sopralluoghi.map(s => [s.id, s.data]));
  const persone = new Set(pratica.persone.map(p => p.id));
  pratica.sopralluoghi.forEach((s, i) => (s.presenti || []).forEach(id => { if (!persone.has(id)) esito.errore('PERSONA_INESISTENTE', `${dove}#/sopralluoghi/${i}`, `${id} non tra le persone`); }));

  const evidenze = controllaEvidenze(pratica.evidenze, beniNoti, esito, dove);
  const manifesto = controllaManifesto(pratica.manifesto, evidenze, esito, dove);
  if (ctx.file) controllaFile(manifesto.values(), ctx.file, esito, dove);
  controllaTimeline(pratica.timeline, beniNoti, evidenze, esito, dove);
  const riscontri = new Set(pratica.riscontriDiretti.map(r => r.id));
  controllaRiscontri(pratica.riscontriDiretti, beniNoti, evidenze, sopralluoghi, esito, dove);
  controllaDichiarazioni(pratica.dichiarazioniTerzi, beniNoti, evidenze, esito, dove);
  const note = controllaNoteCampo(pratica.noteCampo || [], beniNoti, esito, dove);
  controllaAzioni(pratica.azioni, beniNoti, evidenze, riscontri, esito, dove, 'azioni', {
    dichiarazione: new Set(pratica.dichiarazioniTerzi.map(d => d.id)), riscontro: riscontri, nota: note,
  });
  controllaRiferimenti({ timeline: pratica.timeline, azioni: pratica.azioni, dichiarazioniTerzi: pratica.dichiarazioniTerzi }, evidenze, esito, dove);
  for (const r of pratica.riscontriDiretti) controllaIdEvidenze(r.evidenze, evidenze, esito, dove);

  for (const [codice, sc] of schedePerCodice) {
    const nome = `beni/${codice}.json`;
    controllaRiferimenti({ classificazione: sc.classificazione, datiAgliAtti: sc.datiAgliAtti }, evidenze, esito, nome);
    for (const [campo, voce] of vociAgliAtti(sc)) {
      if (voce.verificaCampo) controllaIdEvidenze(voce.verificaCampo.evidenze || [], evidenze, esito, `${nome}#/datiAgliAtti/${campo}`);
    }
    const conteggio = new Map();
    for (const e of evidenze.values()) if (e.stato === 'valida' && e.beni.map(beneDi).includes(codice)) conteggio.set(e.gruppo, (conteggio.get(e.gruppo) || 0) + 1);
    sc.gruppiEvidenze.forEach(g => {
      if (g.evidenzeRaccolte !== undefined && g.evidenzeRaccolte !== (conteggio.get(g.gruppo) || 0)) {
        esito.avviso('GRUPPO_CONTEGGIO', `${nome}#/gruppiEvidenze`, `gruppo ${g.gruppo}: evidenzeRaccolte ${g.evidenzeRaccolte}, nel fascicolo ${conteggio.get(g.gruppo) || 0}`);
      }
      if (g.attesa === 'si' && !conteggio.get(g.gruppo)) esito.avviso('GRUPPO_VUOTO', `${nome}#/gruppiEvidenze`, `${codice} gruppo ${g.gruppo} (${GRUPPO.get(g.gruppo)?.titolo}) atteso ma senza evidenze valide`);
    });
  }

  const aperte = pratica.azioni.filter(a => a.stato === 'aperta');
  if (aperte.length) esito.avviso('AZIONI_APERTE', dove, `${aperte.length} azioni aperte (${aperte.map(a => a.id).join(', ')}): riportarle nel cruscotto pratiche`);
  return { schedePerCodice };
}

export function controllaPacchetti(pratica, file, esito, dove = 'pratica_40.json') {
  pratica.pacchetti.forEach((p, i) => {
    const f = file.get(p.file);
    if (!f) esito.errore('PACCHETTO_MANCANTE', `${dove}#/pacchetti/${i}`, `${p.file} assente`);
    else if (f.sha256 !== p.sha256) esito.errore('PACCHETTO_HASH', `${dove}#/pacchetti/${i}`, `l'impronta di ${p.file} non corrisponde`);
  });
}

// ---------------------------------------------------------------------------
// Andata
// ---------------------------------------------------------------------------

export function controllaAndata(andata, esito, dove, pratica) {
  const beniNoti = new Set();
  andata.beni.forEach((b, i) => {
    const p = `${dove}#/beni/${i}`;
    beniNoti.add(b.codice);
    for (const c of b.componenti) {
      beniNoti.add(c.codice);
      if (beneDi(c.codice) !== b.codice) esito.errore('COMPONENTE_CODICE', p, `il componente ${c.codice} non appartiene a ${b.codice}`);
    }
    const cl = b.classificazione;
    const atteso = cl.allegato === 'A' && cl.gruppo === 1 ? 'completo' : 'ridotto';
    if (cl.profilo !== atteso) esito.errore('PROFILO_INCOERENTE', p, `Allegato ${cl.allegato}${cl.gruppo ? ' Gruppo ' + cl.gruppo : ''} richiede il profilo ${atteso}`);
    controllaGruppi(b.gruppiEvidenze, cl, esito, `${p}/gruppiEvidenze`);
    const campi = new Set();
    for (const d of b.datiDaVerificare) {
      if (campi.has(d.campo)) esito.errore('DATO_DUPLICATO', p, `${d.campo} ripetuto`);
      campi.add(d.campo);
    }
  });
  const esistenti = new Set(andata.evidenzeEsistenti);
  controllaTimeline(andata.timeline, beniNoti, null, esito, dove);
  andata.timeline.forEach((r, i) => controllaIdEvidenze(r.prove.map(x => x.idEvidenza), new Map(), esito, `${dove}#/timeline/${i}`, esistenti));
  andata.timeline.forEach((r, i) => { if (r.rifTimeline) esito.errore('RIF_TIMELINE_FUORI_POSTO', `${dove}#/timeline/${i}`, 'rifTimeline si usa solo nelle date rilevate in campo'); });
  for (const a of andata.azioniAperte) {
    if (a.stato !== 'aperta') esito.errore('ANDATA_AZIONE_CHIUSA', dove, `${a.id} non è aperta`);
    for (const b of a.beni) if (!beniNoti.has(b)) esito.errore('BENE_INESISTENTE', dove, `azione ${a.id}: bene ${b} non nell'andata`);
  }
  if (pratica) {
    if (andata.codicePratica !== pratica.codicePratica) esito.errore('CODICE_PRATICA', dove, 'codice pratica diverso');
    if (andata.demo !== pratica.demo) esito.errore('DEMO_INCOERENTE', dove, 'flag demo diverso dalla pratica');
    const codici = new Set(pratica.beni.map(b => b.codice));
    for (const b of andata.beni) if (!codici.has(b.codice)) esito.errore('BENE_INESISTENTE', dove, `${b.codice} non nella pratica`);
    if (!pratica.sopralluoghi.some(s => s.id === andata.sopralluogo.id)) esito.errore('SOPRALLUOGO_INESISTENTE', dove, `${andata.sopralluogo.id} non nella pratica`);
    const azioni = new Set(pratica.azioni.map(a => a.id));
    for (const a of andata.azioniAperte) if (!azioni.has(a.id)) esito.errore('AZIONE_INESISTENTE', dove, `${a.id} non nella pratica`);
    const ev = new Set(pratica.evidenze.map(e => e.id));
    for (const id of andata.evidenzeEsistenti) if (!ev.has(id)) esito.errore('EVIDENZA_INESISTENTE', dove, `${id} non nella pratica`);
    const tl = new Set(pratica.timeline.map(r => r.id));
    for (const r of andata.timeline) if (!tl.has(r.id)) esito.avviso('TIMELINE_NON_IN_PRATICA', dove, `${r.id} dell'andata non è più nella timeline della pratica`);
  }
  return beniNoti;
}

// ---------------------------------------------------------------------------
// Rientro (un volume)
// ---------------------------------------------------------------------------

// vol: { doc, file: Map percorso → {sha256, byte}, hashSha256: testo del file hash.sha256 o null }
// andata: { doc, sha256 } oppure null
// soloFile: per i volumi successivi al primo dello stesso pacchetto (contenuto identico, verificato da controllaVolumi)
export function controllaVolumeRientro(vol, andata, esitoFinale, dove, { soloFile = false } = {}) {
  const r = vol.doc;
  const esito = soloFile ? nuovoEsito() : esitoFinale;
  const esitoFile = esitoFinale;
  if (r.volume.numero > r.volume.totale) esitoFile.errore('VOLUME_NUMERO', dove, `volume ${r.volume.numero} di ${r.volume.totale}`);

  let beniNoti = new Set();
  const esistenti = new Set(andata ? andata.doc.evidenzeEsistenti : []);
  if (andata) {
    const a = andata.doc;
    if (r.andata.idAndata !== a.idAndata) esito.errore('RIENTRO_ANDATA', dove, 'il rientro non nasce da questo pacchetto di andata');
    if (r.andata.sha256 !== andata.sha256) esito.errore('RIENTRO_ANDATA_HASH', dove, "l'impronta dell'andata non corrisponde: andata modificata dopo il caricamento o revisione diversa");
    if (r.andata.revisione !== a.revisione) esito.errore('RIENTRO_ANDATA', dove, `revisione ${r.andata.revisione} diversa da ${a.revisione}`);
    if (r.codicePratica !== a.codicePratica) esito.errore('CODICE_PRATICA', dove, 'codice pratica diverso');
    if (r.demo !== a.demo) esito.errore('DEMO_INCOERENTE', dove, "flag demo diverso dall'andata");
    if (r.sopralluogo.id !== a.sopralluogo.id) esito.errore('SOPRALLUOGO_INESISTENTE', dove, `sopralluogo ${r.sopralluogo.id} diverso da quello dell'andata`);
    for (const b of a.beni) { beniNoti.add(b.codice); for (const c of b.componenti) beniNoti.add(c.codice); }
  } else {
    esito.avviso('RIENTRO_SENZA_ANDATA', dove, "pacchetto di andata non disponibile: controlli incrociati non eseguiti");
    beniNoti = new Set(r.evidenze.flatMap(e => e.beni).filter(b => !r.beniNuovi.some(n => n.codice === beneDi(b))));
  }
  aggiungiBeniNuovi(r.beniNuovi, beniNoti, esito, dove);

  const evidenze = controllaEvidenze(r.evidenze, beniNoti, esito, dove);
  for (const id of evidenze.keys()) if (esistenti.has(id)) esito.errore('EVIDENZA_ID_COLLISIONE', dove, `${id} è già usato nel fascicolo (evidenzeEsistenti dell'andata)`);
  for (const e of evidenze.values()) {
    if (e.idSopralluogo && e.idSopralluogo !== r.sopralluogo.id) esito.errore('SOPRALLUOGO_INESISTENTE', dove, `${e.id}: sopralluogo ${e.idSopralluogo} diverso`);
    if (e.provenienza === 'perito' && e.acquisitaIl.slice(0, 10) !== r.sopralluogo.data && (e.dataScatto || e.acquisitaIl).slice(0, 10) !== r.sopralluogo.data) {
      esito.avviso('EVIDENZA_FUORI_VISITA', dove, `${e.id} acquisita dal perito in data diversa dalla visita`);
    }
  }
  const manifesto = controllaManifesto(r.manifesto, evidenze, esito, dove);
  for (const m of manifesto.values()) {
    if ((m.volume || 1) > r.volume.totale) esito.errore('VOLUME_NUMERO', dove, `${m.idEvidenza} assegnata al volume ${m.volume} di ${r.volume.totale}`);
    if (m.trasmessaInCheckpoint && r.tipoPacchetto === 'finale') esito.errore('FINALE_INCOMPLETO', dove, `${m.idEvidenza}: il pacchetto finale deve contenere tutti i file, non rimandare al checkpoint ${m.trasmessaInCheckpoint}`);
    if (m.trasmessaInCheckpoint && r.numeroCheckpoint && m.trasmessaInCheckpoint >= r.numeroCheckpoint) esito.errore('CHECKPOINT_NUMERO', dove, `${m.idEvidenza}: rimanda a un checkpoint non precedente`);
  }
  const qui = m => (m.volume || 1) === r.volume.numero && !m.trasmessaInCheckpoint;
  controllaFile(manifesto.values(), vol.file, esitoFile, dove, qui);
  const attesi = new Set([...manifesto.values()].filter(qui).map(m => m.file));
  for (const f of vol.file.keys()) {
    if (f === 'perizia40-rientro.json' || f === 'hash.sha256') continue;
    if (!attesi.has(f)) esitoFile.errore('FILE_NON_IN_MANIFESTO', dove, `${f} presente nel volume ma non nel manifesto di questo volume`);
  }
  if (vol.hashSha256 === null) esitoFile.errore('HASH_SHA256_MANCANTE', dove, 'manca il file hash.sha256');
  else {
    const righe = new Map();
    for (const riga of vol.hashSha256.split(/\r?\n/).filter(Boolean)) {
      const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(riga);
      if (!m) { esitoFile.errore('HASH_SHA256_FORMATO', dove, `riga non valida in hash.sha256: ${riga}`); continue; }
      righe.set(m[2], m[1]);
    }
    for (const [f, info] of vol.file) {
      if (f === 'hash.sha256') continue;
      if (!righe.has(f)) esitoFile.errore('HASH_SHA256_INCOMPLETO', dove, `${f} non elencato in hash.sha256`);
      else if (righe.get(f) !== info.sha256) esitoFile.errore('HASH_DIVERSO', dove, `${f}: impronta diversa da hash.sha256`);
    }
    for (const f of righe.keys()) if (!vol.file.has(f)) esitoFile.errore('FILE_MANCANTE', dove, `${f} elencato in hash.sha256 ma assente`);
  }
  if (soloFile) return { evidenze, manifesto };

  const sopralluoghi = new Map([[r.sopralluogo.id, r.sopralluogo.data]]);
  controllaRiscontri(r.riscontriDiretti, beniNoti, evidenze, sopralluoghi, esito, dove, esistenti);
  controllaDichiarazioni(r.dichiarazioniTerzi, beniNoti, evidenze, esito, dove, esistenti);
  controllaTimeline(r.dateRilevate, beniNoti, evidenze, esito, dove, 'dateRilevate');
  const timelineAtti = new Map((andata ? andata.doc.timeline : []).map(x => [x.id, x]));
  r.dateRilevate.forEach((d, i) => {
    if (!d.rifTimeline || !andata) return;
    const p = `${dove}#/dateRilevate/${i}`;
    const atti = timelineAtti.get(d.rifTimeline);
    if (!atti) { esito.errore('RIF_TIMELINE_INESISTENTE', p, `${d.rifTimeline} non è nella timeline dell'andata`); return; }
    if (atti.evento !== d.evento) esito.errore('RIF_TIMELINE_EVENTO', p, `${d.rifTimeline} è un evento ${atti.evento}, la data rilevata è ${d.evento}`);
    if (!d.beni.some(b => atti.beni.map(beneDi).includes(beneDi(b)))) esito.errore('RIF_TIMELINE_BENE', p, `${d.rifTimeline} riguarda altri beni`);
    if (d.esitoRif === 'confermata' && d.data.valore !== atti.data.valore) esito.errore('RIF_TIMELINE_ESITO', p, `confermata ma ${d.data.valore} è diversa da ${atti.data.valore}`);
    if (d.esitoRif === 'difforme') esito.avviso('ALERT_DATA_DIFFORME', p, `${d.evento}: in campo ${d.data.valore}, agli atti ${atti.data.valore}`);
  });
  const note = controllaNoteCampo(r.noteCampo, beniNoti, esito, dove);
  const riscontri = new Set(r.riscontriDiretti.map(x => x.id));
  controllaAzioni(r.nuoveAzioni, beniNoti, evidenze, riscontri, esito, dove, 'nuoveAzioni', {
    dichiarazione: new Set(r.dichiarazioniTerzi.map(d => d.id)), riscontro: riscontri, nota: note,
  });
  for (const a of r.nuoveAzioni) if (a.stato !== 'aperta') esito.errore('AZIONE_CHIUSA_IN_CAMPO', dove, `${a.id}: le nuove azioni nascono aperte; la chiusura la decide il perito sul PC`);
  controllaRiferimenti({ dateRilevate: r.dateRilevate, nuoveAzioni: r.nuoveAzioni, dichiarazioniTerzi: r.dichiarazioniTerzi }, evidenze, esito, dove, esistenti);
  r.verificheDati.forEach((v, i) => controllaIdEvidenze(v.evidenze, evidenze, esito, `${dove}#/verificheDati/${i}`, esistenti));

  const aperte = new Map((andata ? andata.doc.azioniAperte : []).map(a => [a.id, a]));
  r.aggiornamentiAzioni.forEach((u, i) => {
    const p = `${dove}#/aggiornamentiAzioni/${i}`;
    if (andata && !aperte.has(u.idAzione)) esito.errore('AZIONE_INESISTENTE', p, `${u.idAzione} non tra le azioni aperte dell'andata`);
    if (u.esitoCampo === 'proposta_chiusura') {
      if (u.motivoProposto === 'evidenza_acquisita' && !(u.evidenze || []).length) esito.errore('AZIONE_CHIUSA_SENZA_MOTIVO', p, `${u.idAzione}: proposta di chiusura senza evidenza`);
      if (u.motivoProposto === 'riscontro_diretto' && !u.riscontro) esito.errore('AZIONE_CHIUSA_SENZA_MOTIVO', p, `${u.idAzione}: proposta di chiusura senza riscontro`);
    }
    if (u.riscontro && !riscontri.has(u.riscontro)) esito.errore('RISCONTRO_INESISTENTE', p, `${u.riscontro} non registrato`);
    controllaIdEvidenze(u.evidenze || [], evidenze, esito, p, esistenti);
  });
  const nuoviId = new Set(r.nuoveAzioni.map(a => a.id));
  for (const id of nuoviId) if (aperte.has(id)) esito.errore('AZIONE_DUPLICATA', dove, `${id} è già un'azione dell'andata`);

  if (andata) {
    const daVerificare = new Map();
    for (const b of andata.doc.beni) for (const d of b.datiDaVerificare) daVerificare.set(`${b.codice}|${d.campo}`, d);
    const viste = new Set();
    r.verificheDati.forEach((v, i) => {
      const p = `${dove}#/verificheDati/${i}`;
      const k = `${v.bene}|${v.campo}`;
      const d = daVerificare.get(k);
      if (viste.has(k)) esito.errore('VERIFICA_DUPLICATA', p, `${v.bene} ${v.campo} ripetuto`);
      viste.add(k);
      if (!d) { esito.errore('VERIFICA_NON_RICHIESTA', p, `${v.bene} ${v.campo} non era tra i dati da verificare`); return; }
      if (d.valoreAgliAtti !== v.valoreAgliAtti) esito.errore('VERIFICA_VALORE_ATTI', p, `valore agli atti "${v.valoreAgliAtti}" diverso dall'andata "${d.valoreAgliAtti}"`);
      if (v.esito === 'confermato' && v.valoreRilevato && v.valoreRilevato !== v.valoreAgliAtti) esito.errore('VERIFICA_INCOERENTE', p, 'confermato ma con valore rilevato diverso');
      if (v.data !== r.sopralluogo.data) esito.avviso('VERIFICA_DATA', p, 'verifica in data diversa dalla visita');
      for (const id of v.evidenze) {
        const e = evidenze.get(id);
        if (e && !e.beni.map(beneDi).includes(v.bene)) esito.avviso('VERIFICA_EVIDENZA_ALTRO_BENE', p, `${id} non è riferita a ${v.bene}`);
      }
      if (v.esito === 'difforme') esito.avviso('ALERT_DIFFORMITA', p, `${v.bene} ${v.campo}: in campo "${v.valoreRilevato}", agli atti "${v.valoreAgliAtti}"`);
    });
    if (r.tipoPacchetto === 'finale') for (const k of daVerificare.keys()) if (!viste.has(k)) esito.avviso('VERIFICA_MANCANTE', dove, `${k.replace('|', ' ')}: nessun esito in campo`);
  }
  return { evidenze, manifesto };
}

// Coerenza tra i volumi di uno stesso pacchetto. volumi: [{doc, dove, file}]
export function controllaVolumi(volumi, esito) {
  const perPacchetto = new Map();
  for (const v of volumi) {
    const k = v.doc.idRientro;
    if (!perPacchetto.has(k)) perPacchetto.set(k, []);
    perPacchetto.get(k).push(v);
  }
  for (const [id, vv] of perPacchetto) {
    const totale = vv[0].doc.volume.totale;
    const numeri = new Set();
    const senzaVolume = v => { const c = { ...v.doc }; delete c.volume; return JSON.stringify(c); };
    for (const v of vv) {
      if (v.doc.volume.totale !== totale) esito.errore('VOLUMI_INCOERENTI', v.dove, 'totale dei volumi diverso tra i volumi');
      if (numeri.has(v.doc.volume.numero)) esito.errore('VOLUMI_INCOERENTI', v.dove, `volume ${v.doc.volume.numero} ripetuto`);
      numeri.add(v.doc.volume.numero);
      if (senzaVolume(v) !== senzaVolume(vv[0])) esito.errore('VOLUMI_INCOERENTI', v.dove, 'stato diverso tra i volumi dello stesso pacchetto');
    }
    for (let n = 1; n <= totale; n++) if (!numeri.has(n)) esito.errore('VOLUME_MANCANTE', `rientro ${id}`, `manca il volume ${n} di ${totale}`);
  }
  return perPacchetto;
}

// Dopo l'importazione: il fascicolo deve riportare evidenze ed esiti del rientro finale
export function controllaImportazione(pratica, schedePerCodice, rientro, esito, dove) {
  const ev = new Map(pratica.evidenze.map(e => [e.id, e]));
  for (const e of rientro.evidenze) {
    const p = ev.get(e.id);
    if (!p) esito.avviso('EVIDENZA_NON_IMPORTATA', dove, `${e.id} del rientro non è nel fascicolo`);
    else {
      if (p.sha256 !== e.sha256) esito.errore('IMPORTAZIONE_HASH', dove, `${e.id}: impronta nel fascicolo diversa da quella del rientro`);
      if (p.stato !== e.stato) esito.errore('IMPORTAZIONE_STATO', dove, `${e.id}: stato ${p.stato} nel fascicolo, ${e.stato} nel rientro`);
    }
  }
  for (const v of rientro.verificheDati) {
    const sc = schedePerCodice.get(v.bene);
    if (!sc) continue;
    const voce = v.campo === 'esitoGateC' ? sc.datiAgliAtti.esitoGateC : sc.datiAgliAtti[v.campo.split('.')[0]][v.campo.split('.')[1]];
    const vc = voce.verificaCampo;
    if (!vc || vc.idRientro !== rientro.idRientro) esito.avviso('VERIFICA_NON_IMPORTATA', dove, `${v.bene} ${v.campo}: esito in campo non riportato nella scheda`);
    else if (vc.esito !== v.esito || (vc.valoreRilevato || null) !== (v.valoreRilevato || null)) esito.errore('IMPORTAZIONE_VERIFICA', dove, `${v.bene} ${v.campo}: esito nella scheda diverso dal rientro`);
  }
  const rd = new Set(pratica.riscontriDiretti.map(r => r.id));
  for (const r of rientro.riscontriDiretti) if (!rd.has(r.id)) esito.avviso('RISCONTRO_NON_IMPORTATO', dove, `${r.id} non nel registro della pratica`);
  const dt = new Set(pratica.dichiarazioniTerzi.map(d => d.id));
  for (const d of rientro.dichiarazioniTerzi) if (!dt.has(d.id)) esito.avviso('DICHIARAZIONE_NON_IMPORTATA', dove, `${d.id} non nel registro della pratica`);
  const az = new Set(pratica.azioni.map(a => a.id));
  for (const a of rientro.nuoveAzioni) if (!az.has(a.id)) esito.avviso('AZIONE_NON_IMPORTATA', dove, `${a.id} non tra le azioni della pratica`);
  const nc = new Set((pratica.noteCampo || []).map(n => n.id));
  for (const n of rientro.noteCampo) if (!nc.has(n.id)) esito.avviso('NOTA_NON_IMPORTATA', dove, `${n.id} non tra le note di campo della pratica`);
  const beni = new Set([...pratica.beni.map(b => b.codice), ...(pratica.beniNuovi || []).map(b => b.codice)]);
  for (const b of rientro.beniNuovi) if (!beni.has(b.codice)) esito.avviso('BENE_NUOVO_NON_IMPORTATO', dove, `${b.codice} censito in campo ma assente dalla pratica`);
}
