// Perito 4.0 Studio · interfaccia (Preact + htm, senza compilazione), stessi componenti grafici dell'app di sopralluogo.

import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { html, Icona, dataBreve, megabyte } from '/app/js/ui.js';
import { GRUPPI_UI, ORDINE_GRUPPI } from '/app/js/stato.js';

const GETTONE = document.querySelector('meta[name="studio"]').content;
const REQUISITI = ['ID', 'VOCE', 'RO1', 'RO2', 'RO3', 'RO4', 'RO5', 'RU1', 'RU2', 'RU3', 'DOC'];
const STATI = { bozza: ['bozza', 'acc'], bozza_sospesa: ['bozza sospesa', 'att'], per_la_firma: ['per la firma', 'acc'], giurata: ['giurata', 'ok'] };
const STATO_DATO = { documentato: 'ok', dichiarato: 'acc', da_verificare: 'att' };
const SEZIONI = [
  ['identita', 'Identità', [['costruttore', 'Costruttore'], ['modello', 'Modello'], ['matricola', 'Matricola'], ['anno', 'Anno']]],
  ['controllore', 'PLC/CNC', [['marca', 'Marca'], ['modello', 'Modello'], ['firmware', 'Firmware']]],
  ['hmi', 'HMI', [['modello', 'Modello']]],
  ['reteDichiarata', 'Rete dichiarata', [['ip', 'IP'], ['sistemaAziendale', 'Sistema aziendale'], ['protocollo', 'Protocollo']]],
  ['dichiarazioneCE', 'Dichiarazione CE', [['numero', 'Numero'], ['data', 'Data'], ['direttive', 'Direttive'], ['riferimentoMatricola', 'Riferimento alla matricola']]],
];
const nomeGruppo = g => (GRUPPI_UI[g] ? GRUPPI_UI[g].nome.replace('­', '') : String(g));

// --- comunicazione con il server locale ---
async function chiedi(metodo, percorso, corpo, tipo = 'application/json') {
  const r = await fetch(percorso, { method: metodo, headers: metodo === 'GET' ? {} : { 'X-Studio': GETTONE, 'Content-Type': tipo }, body: corpo });
  const d = await r.json();
  if (!r.ok) throw new Error(d.errore || `errore ${r.status}`);
  return d;
}
const q = o => new URLSearchParams(o).toString();

// --- navigazione: #/ cruscotto, #/p/<pratica>/<scheda> ---
function useRotta() {
  const leggi = () => location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [r, setR] = useState(leggi());
  useEffect(() => { const f = () => setR(leggi()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}
const vai = (...parti) => { location.hash = '#/' + parti.map(encodeURIComponent).join('/'); };

function Messaggio({ testo }) { return testo ? html`<div class="messaggio">${testo}</div>` : null; }
function useMessaggio() {
  const [t, setT] = useState(null);
  const mostra = useCallback(x => { setT(x); setTimeout(() => setT(null), 3500); }, []);
  return [t, mostra];
}

function Testata({ sotto, dietro }) {
  return html`<div class="testata">
    ${dietro ? html`<button class="collegamento" onClick=${() => vai('')}><${Icona} nome="indietro" dim=${18} /></button>` : null}
    <img src="/app/img/icona-192.png" alt="" />
    <div><div class="titolo">Perito 4.0 Studio</div><div class="sotto">${sotto}</div></div>
    <div class="spazio"></div>
    <a class="meta" href="https://provenzanof70.github.io/app_perito40/app/" target="_blank" rel="noopener">App di sopralluogo ↗</a>
  </div>`;
}

// ---------------------------------------------------------------- cruscotto

function Cruscotto() {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [nuova, setNuova] = useState(false);
  const carica = () => chiedi('GET', '/api/pratiche').then(setDati, e => setErrore(e.message));
  useEffect(() => { carica(); }, []);
  return html`<${Testata} sotto=${dati ? dati.radice : 'cartella delle pratiche'} />
    <div class="pagina">
      <div style=${{ display: 'flex', alignItems: 'end', gap: 12 }}>
        <div style=${{ flex: 1 }}><h1>Pratiche aperte</h1><div class="meta">${dati ? `${dati.pratiche.length} pratiche · le più recenti per prime` : 'lettura delle cartelle…'}</div></div>
        <button class="bottone" onClick=${() => setNuova(true)}><${Icona} nome="piu" dim=${18} />Nuova pratica</button>
      </div>
      ${errore && html`<div class="avviso err">${errore}</div>`}
      <div class="griglia" style=${{ marginTop: 18 }}>
        ${dati && dati.pratiche.map((p, i) => html`<${CartaPratica} key=${p.cartella} p=${p} n=${i + 1} />`)}
      </div>
      ${dati && !dati.pratiche.length && html`<div class="vuoto">Nessuna pratica: crea la prima con «Nuova pratica».</div>`}
    </div>
    ${nuova && html`<${NuovaPratica} alChiudi=${() => setNuova(false)} alFatto=${nome => { setNuova(false); vai('p', nome, 'beni'); }} />`}`;
}

function CartaPratica({ p, n }) {
  const s = p.sopralluoghi[p.sopralluoghi.length - 1];
  const dest = Object.entries(p.perDestinatario).map(([k, v]) => `${k} ${v}`).join(' · ');
  return html`<button class="carta cliccabile" onClick=${() => vai('p', p.cartella, 'beni')}>
    <div class="meta">${n} · ${p.codice} · annualità ${p.annualita}</div>
    <div class="nome">${p.cartella}</div>
    <div class="pastiglie">${p.beni.length ? p.beni.map(b => html`<span class=${`pastiglia ${b.chiuso ? 'ok' : (STATI[b.stato] || [])[1] || ''}`}>${b.codice} ${b.chiuso ? 'chiuso' : (STATI[b.stato] || [b.stato])[0]} rev.${b.rev}</span>`)
      : html`<span class="pastiglia">nessun bene</span>`}</div>
    <div class="riga"><span class="etichetta">Sopralluogo</span><span>${s ? `${s.id} ${s.stato} ${dataBreve(s.data)}` : 'nessuno'}</span></div>
    <div class="riga"><span class="etichetta">Integrazioni</span><span>${p.azioniAperte ? `${p.azioniAperte} aperte${dest ? ` (${dest})` : ''}` : 'nessuna'}</span></div>
    ${(p.errori || p.segnalazioni.length) ? html`<div class="pastiglie">${p.errori ? html`<span class="pastiglia err">${p.errori} errori</span>` : null}${p.segnalazioni.map(x => html`<span class="pastiglia att">${x}</span>`)}</div>` : null}
    <div class="prossimo"><b>Prossimo passo</b> · ${p.prossimoDiario || p.suggerito}</div>
    <div class="meta" style=${{ marginTop: 8 }}>Ultimo lavoro ${dataBreve(p.ultimoLavoro) || '—'}</div>
  </button>`;
}

function NuovaPratica({ alChiudi, alFatto }) {
  const [d, setD] = useState({ cliente: '', bene: '', codice: '', sede: '', annualita: String(new Date().getFullYear() - 1) });
  const [errore, setErrore] = useState(null);
  const imposta = (k, v) => setD(x => {
    const y = { ...x, [k]: v };
    // codice proposto dal nome: prime parole del cliente e del bene, maiuscole, senza spazi
    if (k !== 'codice' && !x.codiceToccato) y.codice = `${y.cliente.split(/\s+/)[0] || ''}-${y.bene.split(/\s+/).filter(w => w.length > 2).pop() || ''}`.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/^-|-$/g, '');
    if (k === 'codice') y.codiceToccato = true;
    return y;
  });
  const valido = d.cliente.trim() && d.bene.trim() && /^[A-Z0-9][A-Z0-9_-]{2,40}$/.test(d.codice);
  const crea = async () => {
    try {
      const r = await chiedi('POST', '/api/pratiche', JSON.stringify({ nome: `${d.cliente.trim()} - ${d.bene.trim()}`, codice: d.codice, cliente: d.cliente.trim(), sede: d.sede.trim() || 'da definire', annualita: d.annualita }));
      alFatto(r.nome);
    } catch (e) { setErrore(e.message); }
  };
  return html`<div class="velo" onClick=${e => e.target === e.currentTarget && alChiudi()}><div class="finestra">
    <h3>Nuova pratica</h3>
    <label class="campo">Cliente (ragione sociale, dalla visura)<input value=${d.cliente} onInput=${e => imposta('cliente', e.target.value)} placeholder="ROSSI SRL" /></label>
    <label class="campo">Bene o macchinari<input value=${d.bene} onInput=${e => imposta('bene', e.target.value)} placeholder="centro di lavoro Mazak" /></label>
    <div class="meta" style=${{ margin: '-6px 0 12px' }}>Cartella: «${d.cliente.trim() || 'CLIENTE'} - ${d.bene.trim() || 'bene'}»</div>
    <label class="campo">Codice interno (maiuscole, cifre e trattini)<input value=${d.codice} onInput=${e => imposta('codice', e.target.value.toUpperCase())} /></label>
    <label class="campo">Sede dell'intervento<input value=${d.sede} onInput=${e => imposta('sede', e.target.value)} placeholder="da definire" /></label>
    <label class="campo">Annualità<input value=${d.annualita} onInput=${e => imposta('annualita', e.target.value)} /></label>
    ${errore && html`<div class="avviso err">${errore}</div>`}
    <div class="azioni-finestra"><button class="bottone secondario" onClick=${alChiudi}>Annulla</button><button class="bottone" disabled=${!valido} onClick=${crea}>Crea pratica</button></div>
  </div></div>`;
}

// ---------------------------------------------------------------- pratica

const SCHEDE = [['beni', 'Beni'], ['documenti', 'Documenti'], ['diario', 'Diario'], ['sopralluogo', 'Sopralluogo', true], ['foto', 'Foto', true], ['azioni', 'Azioni', true], ['perizia', 'Perizia', true]];

function Pratica({ nome, scheda }) {
  const [dati, setDati] = useState(null);
  const [errore, setErrore] = useState(null);
  const [msg, mostra] = useMessaggio();
  const carica = useCallback(() => chiedi('GET', `/api/pratica?${q({ nome })}`).then(setDati, e => setErrore(e.message)), [nome]);
  useEffect(() => { setDati(null); carica(); }, [nome]);
  if (errore) return html`<${Testata} sotto="pratica" dietro=${true} /><div class="pagina"><div class="avviso err">${errore}</div></div>`;
  if (!dati) return html`<${Testata} sotto="pratica" dietro=${true} /><div class="pagina vuoto">Lettura della pratica…</div>`;
  const pr = dati.pratica;
  const daRegistrare = dati.documenti.filter(d => !d.evidenza).length;
  const prossimo = (dati.diario.match(/\*\*Prossimo passo:\*\*\s*(.+)$/gm) || []).pop();
  return html`<${Testata} sotto=${`${pr.codicePratica} · ${pr.cliente.ragioneSociale}`} dietro=${true} />
    <div class="pagina">
      <h1>${dati.nome}</h1>
      <div class="meta">${pr.cliente.sedeIntervento} · annualità ${pr.annualita} · aggiornata ${dataBreve(pr.aggiornataIl)}</div>
      <${Controlli} esito=${dati.esito} />
      ${prossimo && html`<div class="avviso info claude"><b>Prossimo passo</b> · ${prossimo.replace(/\*\*Prossimo passo:\*\*\s*/, '')}
        <div class="meta" style=${{ marginTop: 6 }}>Lettura dei documenti, dati agli atti, classificazione e integrazioni si fanno con Claude, nella sessione aperta sulla cartella delle pratiche: <code>Riprendi la pratica ${dati.nome}</code></div></div>`}
      <nav class="schede-nav">${SCHEDE.map(([k, l, dopo]) => html`<button class=${scheda === k ? 'attiva' : ''} disabled=${dopo} title=${dopo ? 'nelle prossime fasi' : ''}
        onClick=${() => vai('p', nome, k)}>${l}${k === 'documenti' && daRegistrare ? html`<span class="n">${daRegistrare} da registrare</span>` : null}${dopo ? html`<span class="n">presto</span>` : null}</button>`)}</nav>
      ${scheda === 'documenti' ? html`<${Documenti} dati=${dati} ricarica=${carica} mostra=${mostra} />`
        : scheda === 'diario' ? html`<${Diario} dati=${dati} ricarica=${carica} mostra=${mostra} />`
        : html`<${Beni} dati=${dati} />`}
    </div>
    <${Messaggio} testo=${msg} />`;
}

function Controlli({ esito }) {
  const [aperto, setAperto] = useState(false);
  const n = esito.errori.length, m = esito.avvisi.length;
  return html`<div class=${`avviso ${n ? 'err' : 'att'}`} style=${{ cursor: 'pointer' }} onClick=${() => setAperto(!aperto)}>
    <b>Controllo del fascicolo:</b> ${n ? `${n} errori` : 'nessun errore'} · ${m} avvisi <span class="meta">(${aperto ? 'chiudi' : 'dettagli'})</span>
    ${aperto && html`<ul>${[...esito.errori, ...esito.avvisi].map(e => html`<li><b>${e.codice}</b> ${e.messaggio}</li>`)}</ul>`}
  </div>`;
}

// --- beni ---
function Beni({ dati }) {
  const { pratica, schede } = dati;
  if (!schede.length) return html`<div class="vuoto">Nessun bene ancora: si censiscono con Claude dopo la lettura dei documenti.</div>`;
  return schede.map(sc => html`<${Bene} key=${sc.codice} sc=${sc} evidenze=${pratica.evidenze} />`);
}

function Bene({ sc, evidenze }) {
  const el = sc.elaborato || { stato: 'bozza', revisione: 0 };
  const [s, cls] = STATI[el.stato] || [el.stato, ''];
  const ev = evidenze.filter(e => e.stato === 'valida' && e.beni.some(b => b.split('.')[0] === sc.codice));
  const gruppi = [...sc.gruppiEvidenze].sort((a, b) => ORDINE_GRUPPI.indexOf(a.gruppo) - ORDINE_GRUPPI.indexOf(b.gruppo));
  const cl = sc.classificazione;
  return html`<div class="carta" style=${{ marginTop: 16 }}>
    <div style=${{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span class="pastiglia acc">${sc.codice}</span><b style=${{ fontSize: 17 }}>${sc.denominazione}</b>
      <span class=${`pastiglia ${el.chiusoIl ? 'ok' : cls}`}>${el.chiusoIl ? 'chiuso' : s} rev.${el.revisione}</span>
    </div>
    <div class="meta" style=${{ marginTop: 6 }}>${sc.funzione} · Allegato ${cl.allegato}${cl.gruppo ? ` gruppo ${cl.gruppo}` : ''} · ${cl.codiceVoce || ''} ${cl.voce} · profilo ${cl.profilo}${cl.ruDichiarati ? ` (${cl.ruDichiarati.join(', ')})` : ''}</div>
    ${sc.componenti.length ? html`<div class="meta" style=${{ marginTop: 4 }}>Componenti: ${sc.componenti.map(c => `${c.codice} ${c.denominazione}`).join(' · ')}</div>` : null}
    <h2 style=${{ fontSize: 16 }}>Evidenze per requisito</h2>
    <div class="tessere">${gruppi.map(g => {
      const n = ev.filter(e => e.gruppo === g.gruppo).length;
      const st = g.attesa !== 'si' ? 'na' : n ? 'ok' : 'manca';
      return html`<div class=${`tessera ${st}`}><div class="su"><${Icona} nome=${(GRUPPI_UI[g.gruppo] || {}).icona} dim=${20} /><b>${n}</b></div>
        <div class="nome">${nomeGruppo(g.gruppo)}</div><div class="stato">${g.requisiti.join(', ')} · ${st === 'ok' ? 'presente' : st === 'manca' ? 'mancante' : 'non richiesto'}</div></div>`;
    })}</div>
    <h2 style=${{ fontSize: 16 }}>Dati agli atti</h2>
    <table class="dati"><thead><tr><th>Dato</th><th>Valore agli atti</th><th>Stato</th><th>Fonti</th><th>In campo</th></tr></thead><tbody>
      ${SEZIONI.flatMap(([sez, titolo, campi]) => campi.map(([c, l]) => {
        const v = sc.datiAgliAtti[sez][c];
        return html`<tr><td>${titolo} · ${l}</td><td>${v.nonApplicabile ? 'non applicabile' : v.valore ?? '—'}</td>
          <td><span class=${`pastiglia ${STATO_DATO[v.stato] || ''}`}>${v.stato.replace('_', ' ')}</span></td>
          <td class="meta">${v.fonti.map(f => f.idEvidenza).join(', ') || '—'}</td>
          <td>${v.verificaCampo ? html`<span class=${`pastiglia ${v.verificaCampo.esito === 'confermato' ? 'ok' : v.verificaCampo.esito === 'difforme' ? 'err' : 'att'}`}>${v.verificaCampo.esito.replace('_', ' ')}${v.verificaCampo.valoreRilevato ? ` → ${v.verificaCampo.valoreRilevato}` : ''}</span>` : html`<span class="meta">—</span>`}</td></tr>`;
      }))}
      <tr><td>GATE C · perimetro e conformità</td><td>${sc.datiAgliAtti.esitoGateC.esito} · <span class="meta">${sc.datiAgliAtti.esitoGateC.motivazione}</span></td>
        <td><span class=${`pastiglia ${STATO_DATO[sc.datiAgliAtti.esitoGateC.stato] || ''}`}>${sc.datiAgliAtti.esitoGateC.stato.replace('_', ' ')}</span></td><td class="meta">${sc.datiAgliAtti.esitoGateC.fonti.map(f => f.idEvidenza).join(', ') || '—'}</td><td></td></tr>
    </tbody></table>
  </div>`;
}

// --- documenti: caricamento per trascinamento e registrazione come evidenza ---
function Documenti({ dati, ricarica, mostra }) {
  const [sopra, setSopra] = useState(false);
  const [lavoro, setLavoro] = useState(null);
  const [registra, setRegistra] = useState(null);
  const carica = async files => {
    let nuovi = 0, gia = 0;
    for (const [i, f] of [...files].entries()) {
      setLavoro(`Copia ${i + 1} di ${files.length}: ${f.name}`);
      try {
        const r = await chiedi('POST', `/api/carica?${q({ nome: dati.nome, file: f.name })}`, await f.arrayBuffer(), 'application/octet-stream');
        r.giaPresente ? gia++ : nuovi++;
      } catch (e) { mostra(`${f.name}: ${e.message}`); }
    }
    setLavoro(null);
    mostra(`${nuovi} documenti copiati in documenti_cliente${gia ? `, ${gia} già presenti` : ''}`);
    ricarica();
  };
  const perCartella = new Map();
  for (const d of dati.documenti) { if (!perCartella.has(d.cartella)) perCartella.set(d.cartella, []); perCartella.get(d.cartella).push(d); }
  return html`
    <div class=${`rilascio ${sopra ? 'sopra' : ''}`} onDragOver=${e => { e.preventDefault(); setSopra(true); }} onDragLeave=${() => setSopra(false)}
      onDrop=${e => { e.preventDefault(); setSopra(false); carica(e.dataTransfer.files); }}>
      ${lavoro || html`<div><b>Trascina qui i documenti del cliente</b> (PDF, immagini, Word…)</div>
        <div class="meta" style=${{ marginTop: 6 }}>Vengono copiati in <code>documenti_cliente/Caricati con lo Studio</code>: gli originali non si modificano. Oppure
        <label class="collegamento"> scegli i file<input type="file" multiple hidden onChange=${e => carica(e.target.files)} /></label>.</div>`}
    </div>
    ${!dati.documenti.length ? html`<div class="vuoto">Nessun documento del cliente.</div>` : html`<table class="dati"><thead><tr><th>Documento</th><th>Dimensione</th><th>Evidenza</th><th></th></tr></thead><tbody>
      ${[...perCartella].map(([cartella, docs]) => html`${cartella ? html`<tr><td colspan="4" class="cartella-doc">${cartella}</td></tr>` : null}
        ${docs.map(d => html`<tr><td><a href=${`/file?${q({ nome: dati.nome, percorso: d.file })}`} target="_blank" rel="noopener">${d.nome}</a></td>
          <td class="meta">${megabyte(d.byte)}</td>
          <td>${d.evidenza ? html`<span class="pastiglia ok">${d.evidenza}</span>` : html`<span class="pastiglia att">da registrare</span>`}</td>
          <td>${d.evidenza ? null : html`<button class="collegamento" onClick=${() => setRegistra(d)}>Registra…</button>`}</td></tr>`)}`)}
    </tbody></table>`}
    ${registra && html`<${Registra} dati=${dati} doc=${registra} alChiudi=${() => setRegistra(null)} alFatto=${testo => { setRegistra(null); mostra(`Registrato come ${testo}`); ricarica(); }} />`}`;
}

function Registra({ dati, doc, alChiudi, alFatto }) {
  const codici = dati.schede.flatMap(sc => [sc.codice, ...sc.componenti.map(c => c.codice)]);
  // le immagini nascono come foto del cliente (data di scatto dai metadati del file); si può scegliere documento o schermata
  const immagine = /\.(jpe?g|png|heic|webp)$/i.test(doc.nome), filmato = /\.(mp4|mov)$/i.test(doc.nome);
  const [d, setD] = useState({ beni: codici.slice(0, 1), tipo: immagine ? 'foto' : filmato ? 'video' : 'documento', gruppo: immagine || filmato ? 1 : 'DOC', requisiti: [immagine || filmato ? 'ID' : 'DOC'],
    descrizione: doc.nome.replace(/\.[^.]+$/, ''), provenienza: 'cliente' });
  const [errore, setErrore] = useState(null);
  const gruppi = ORDINE_GRUPPI.filter(g => GRUPPI_UI[g]);
  const sceltaGruppo = g => setD(x => ({ ...x, gruppo: g, requisiti: [g === 'DOC' ? 'DOC' : GRUPPI_UI[g].requisito] }));
  const commuta = (k, v) => setD(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(y => y !== v) : [...x[k], v] }));
  const valido = d.beni.length && d.requisiti.length && d.descrizione.trim();
  const invia = async () => {
    try {
      // il codice dell'evidenza nasce dal primo bene e dal primo requisito scelti
      const r = await chiedi('POST', `/api/registra?${q({ nome: dati.nome })}`, JSON.stringify({ file: doc.file, beni: d.beni, tipo: d.tipo, gruppo: d.gruppo, requisiti: d.requisiti, descrizione: d.descrizione.trim(), provenienza: d.provenienza }));
      const s = r.scatto || {};
      alFatto(`${r.id}${s.origineDataScatto === 'metadati' ? ` · scattata il ${new Date(s.dataScatto).toLocaleString('it-IT')} (dai metadati)` : s.origineDataScatto === 'assente' ? ' · data di scatto assente nel file' : ''}`);
    } catch (e) { setErrore(e.message); }
  };
  if (!codici.length) return html`<div class="velo"><div class="finestra"><h3>Registra ${doc.nome}</h3><div class="avviso att">La pratica non ha ancora beni: si censiscono con Claude, poi si registrano i documenti.</div><div class="azioni-finestra"><button class="bottone" onClick=${alChiudi}>Chiudi</button></div></div></div>`;
  return html`<div class="velo" onClick=${e => e.target === e.currentTarget && alChiudi()}><div class="finestra">
    <h3>Registra come evidenza</h3>
    <div class="meta" style=${{ marginBottom: 12 }}>${doc.file} · se ne fa una copia identica in <code>evidenze/documenti</code> con codice e impronta.</div>
    <div class="campo">Beni a cui si riferisce<div class="scelte">${codici.map(c => html`<label><input type="checkbox" checked=${d.beni.includes(c)} onChange=${() => commuta('beni', c)} />${c}</label>`)}</div></div>
    <div class="campo">Tipo<div class="scelte">${[['foto', 'Foto'], ['screenshot', 'Schermata'], ['video', 'Video'], ['documento', 'Documento']].map(([k, l]) => html`<label><input type="radio" name="tipo" checked=${d.tipo === k} onChange=${() => setD(x => ({ ...x, tipo: k }))} />${l}</label>`)}</div></div>
    <label class="campo">Gruppo di evidenze<select value=${d.gruppo} onChange=${e => sceltaGruppo(e.target.value === 'DOC' ? 'DOC' : Number(e.target.value))}>
      ${gruppi.map(g => html`<option value=${g}>${nomeGruppo(g)} · ${GRUPPI_UI[g].requisito}</option>`)}</select></label>
    <div class="campo">Requisiti che sostiene<div class="scelte">${REQUISITI.map(r => html`<label><input type="checkbox" checked=${d.requisiti.includes(r)} onChange=${() => commuta('requisiti', r)} />${r}</label>`)}</div></div>
    <label class="campo">Descrizione (tipo, numero, data, a cosa si riferisce)<input value=${d.descrizione} onInput=${e => setD(x => ({ ...x, descrizione: e.target.value }))} /></label>
    <label class="campo">Provenienza<select value=${d.provenienza} onChange=${e => setD(x => ({ ...x, provenienza: e.target.value }))}>
      ${['cliente', 'fornitore', 'integratore', 'perito'].map(p => html`<option value=${p}>${p}</option>`)}</select></label>
    ${errore && html`<div class="avviso err">${errore}</div>`}
    <div class="azioni-finestra"><button class="bottone secondario" onClick=${alChiudi}>Annulla</button><button class="bottone" disabled=${!valido} onClick=${invia}>Registra</button></div>
  </div></div>`;
}

// --- diario ---
function Diario({ dati, ricarica, mostra }) {
  const [d, setD] = useState({ fatto: '', decisione: '', prossimo: '' });
  const righe = s => s.split('\n').map(x => x.trim()).filter(Boolean);
  const salva = async () => {
    await chiedi('POST', `/api/diario?${q({ nome: dati.nome })}`, JSON.stringify({ fatto: righe(d.fatto), decisioni: righe(d.decisione), prossimo: d.prossimo.trim() }));
    setD({ fatto: '', decisione: '', prossimo: '' }); mostra('Diario aggiornato'); ricarica();
  };
  const voci = dati.diario.split(/\n(?=## )/).filter(v => v.startsWith('## ')).reverse();
  return html`<div class="griglia" style=${{ gridTemplateColumns: 'minmax(0,2fr) minmax(280px,1fr)', alignItems: 'start' }}>
    <div>${voci.length ? voci.map(v => {
      const [titolo, ...resto] = v.split('\n');
      return html`<div class="carta" style=${{ marginBottom: 12 }}><b>${dataBreve(titolo.replace('## ', ''))}</b>
        <ul style=${{ margin: '6px 0 0', paddingLeft: 18 }}>${resto.filter(r => r.startsWith('- ')).map(r => {
          const t = r.slice(2), p = t.startsWith('**Prossimo passo:**');
          return html`<li style=${p ? { color: 'var(--accento)', fontWeight: 600 } : null}>${t.replace(/\*\*/g, '')}</li>`;
        })}</ul></div>`;
    }) : html`<div class="vuoto">Diario vuoto.</div>`}</div>
    <div class="carta"><b>Aggiungi al diario</b>
      <label class="campo" style=${{ marginTop: 10 }}>Fatto (una riga per voce)<textarea rows="3" value=${d.fatto} onInput=${e => setD(x => ({ ...x, fatto: e.target.value }))} /></label>
      <label class="campo">Decisioni<textarea rows="2" value=${d.decisione} onInput=${e => setD(x => ({ ...x, decisione: e.target.value }))} /></label>
      <label class="campo">Prossimo passo (obbligatorio)<input value=${d.prossimo} onInput=${e => setD(x => ({ ...x, prossimo: e.target.value }))} /></label>
      <button class="bottone" disabled=${!d.prossimo.trim()} onClick=${salva}>Salva nel diario</button></div>
  </div>`;
}

function App() {
  const [radice, nome, scheda] = useRotta();
  return radice === 'p' && nome ? html`<${Pratica} nome=${nome} scheda=${scheda || 'beni'} />` : html`<${Cruscotto} />`;
}

render(html`<${App} />`, document.getElementById('app'));
