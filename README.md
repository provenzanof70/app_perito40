# app_perito40

App di sopralluogo per le perizie tecniche **Industria 4.0** (credito d'imposta beni strumentali 4.0), da installare sulla Home dell'iPhone come PWA e funzionante offline, più gli strumenti per PC che la alimentano.

**Solo codice e dati DEMO fittizi.** Nessun dato cliente, nessun testo del metodo peritale dello studio: i rimandi del tipo «§2.7» indicano soltanto il paragrafo del metodo a cui una regola si ispira.

## Vincoli

- **Nessuna API e nessun servizio AI esterno** nell'app o negli script. Le letture di testo (targhe, schermate, vocali) si fanno a mano in campo oppure in una sessione Claude sul PC, sulla cartella della pratica.
- **Nessun dato esce dal telefono** se non lo esporta il perito.
- Gli script richiedono solo **Node.js 22 o successivo**, senza `npm install`.

## Stato

| Fase | Contenuto | Stato |
|---|---|---|
| F1 | Schemi JSON v1, pratica DEMO, validatore, README | fatta |
| F2 | Interfaccia PWA (dai mockup di Claude Design) | da fare |

## Struttura

```
schemi/v1/                     formati dei file
  comuni.v1.schema.json        definizioni condivise (codici, date, evidenze, timeline, azioni, registri, manifesto)
  pratica_40.v1.schema.json    fascicolo della pratica sul PC
  scheda_bene.v1.schema.json   una scheda per bene
  perizia40-andata.v1.schema.json   pacchetto PC → telefono
  perizia40-rientro.v1.schema.json  pacchetto telefono → PC
strumenti/
  valida.mjs                   validatore da riga di comando
  prova.mjs                    prova del validatore sulla DEMO e sui casi errati
  genera_demo.mjs              rigenera la pratica DEMO
  lib/validatore.mjs           nucleo dei controlli, senza dipendenze né accesso al disco (riusabile nella PWA)
  lib/disco.mjs                lettura delle cartelle e calcolo delle impronte (Node)
demo/
  PRATICA_DEMO_2026_001/       pratica fittizia completa (dopo l'importazione del rientro)
  casi_errati/casi.json        modifiche che il validatore deve rifiutare
```

## Flusso

```
PC (sessione Claude sulla cartella pratica)         iPhone (PWA offline)
pratica_40.json + beni/B0x.json
        │  genera
        ▼
andata/perizia40-andata.json  ───────────────────▶  sopralluogo: foto annotate, vocali, video,
                                                     verifica dei dati agli atti, riscontri diretti,
                                                     dichiarazioni di terzi, date, nuove azioni
        ┌────────────────────────────────────────── rientro: checkpoint durante la giornata,
        ▼                                            finale a fine visita, anche in più volumi
rientro/<pacchetto>_volN/ perizia40-rientro.json + evidenze/ + hash.sha256
        │  importa (verifica impronte, copia evidenze, aggiorna schede e registri)
        ▼
pratica_40.json aggiornata
```

La cartella di una pratica sul PC:

```
PRATICA_xxx/
  pratica_40.json
  beni/B01.json, B02.json …
  andata/perizia40-andata.json
  rientro/<codice>_S01_finale_vol1/ …
  evidenze/documenti/ …        documenti ricevuti
  evidenze/sopralluogo_S01/ …  evidenze di campo importate
```

## I formati in sintesi

**Codici.** Ogni bene ha un codice stabile `B01`, ogni componente `B01.1`. Ogni evidenza ha un identificativo che la lega al bene e al requisito: `B01-RO2-003` (requisiti `ID`, `VOCE`, `RO1`–`RO5`, `RU1`–`RU3`, `DOC`). Un'evidenza comune a più beni elenca tutti i codici e lo dichiara con `comune: true` (§1.6). Il nome del file è fissato all'acquisizione e non cambia; se l'evidenza viene ricollegata al bene giusto, il vecchio identificativo resta in `storicoIdentificativi`.

**Scheda del bene** (`scheda_bene`)
- Censimento: denominazione, funzione, componenti con tipo M/QM/ITS/ACC.
- Classificazione proposta: allegato, gruppo, voce, profilo, requisiti ulteriori dichiarati, sostenibilità, motivazione con fonti (§2.3). Profilo completo solo per Allegato A Gruppo 1; ridotto negli altri casi.
- **Dati agli atti**, compilati sul PC; ogni voce ha valore, fonte `[ev:]` e stato `documentato` / `dichiarato` / `da_verificare`:
  - identità: costruttore, modello, matricola, anno;
  - controllore PLC/CNC: marca, modello, firmware;
  - HMI: modello;
  - rete dichiarata: IP, sistema aziendale, protocollo;
  - dichiarazione CE: numero, data, direttive o regolamento, riferimento alla matricola;
  - esito GATE C: verde / giallo / rosso, con motivazione.
  Dopo il rientro ogni voce riceve `verificaCampo` con l'esito (`confermato`, `corretto` con il valore rilevato, `difforme`, `non_verificabile`) e l'evidenza collegata.
- Gruppi di evidenze 1–10 più Documenti, ciascuno legato ai requisiti e con l'attesa per il profilo: `si`, `su_richiesta`, `se_dichiarato`, `supporto`, `non_applicabile` (§2.7).

**Pacchetto di andata.** Riporta i beni con componenti, classificazione, gruppi attesi e cosa cercare. Porta i **dati agli atti come valori da verificare**, le azioni aperte e gli identificativi di evidenza già usati, così l'app continua la numerazione senza collisioni.

**Pacchetto di rientro**
- Tipo `checkpoint` o `finale`; può essere diviso in **volumi**. Ogni volume ripete lo stato completo e contiene solo i file assegnati a quel volume nel manifesto.
- **Evidenze**: foto con annotazioni (riquadri, frecce, note in coordinate 0–1; l'originale non viene toccato), vocali, video, documenti.
- Data mostrata a video, con segnalazione dell'orologio errato: si registra, non si corregge (§6.1).
- **Trascrizioni** con origine `manuale_campo` o `claude_pc` e flag di confronto con l'originale. Nessun OCR da servizi esterni.
- Le **evidenze annullate restano** nel pacchetto con motivo, data ed eventuale sostituta: non si cancellano.
- **Esiti delle verifiche** dei dati agli atti.
- **Riscontri diretti** del perito (§1.3, §10.9): bene, requisito, data della visita, fatto, oggetto e circostanza in campi separati, la frase verbalizzata, le evidenze collegate e i limiti. Non retrodatano l'evento.
- **Dichiarazioni di terzi** (§10.9): persona, ruolo, organizzazione, forma, data, contenuto effettivo, requisito e riscontro oggettivo (S/N con `[ev:]`).
- **Date rilevate**, nuove azioni (sempre aperte) e aggiornamenti delle azioni: l'app propone la chiusura, il perito decide sul PC.
- **Manifesto SHA-256** e file `hash.sha256` in ogni volume.

**Timeline** (§6.1, §10.5). Ogni riga ha:
- evento, codici dei beni, data con precisione (giorno `AAAA-MM-GG`, mese `AAAA-MM`, periodo `AAAA-MM-GG/AAAA-MM-GG`);
- tipo di data: documento, mostrata a video, scatto, acquisizione, verifica del perito;
- origine e stato (`documentata` / `dichiarata` / `da_verificare`);
- documento di prova `[ev:]`, coerenza S/N, nota (obbligatoria se N).

**Azioni** (§10.4). Ogni lacuna diventa un'azione con priorità, bene, cosa serve, perché, requisito, esempio di evidenza accettabile, destinatario e stato. Si chiude solo con motivo documentato: evidenza acquisita, riscontro diretto o decisione motivata.

**Manifesto** (§10.10). Ogni riga ha identificativo, file, SHA-256, data di acquisizione, provenienza, hash contestuale (C) o successivo (S) e marca temporale. L'impronta prova solo che il file non è cambiato dopo la registrazione.

**Le quattro basi** (§1.3) sono strutture distinte:
- evidenze documentali → `evidenze`;
- riscontri diretti → `riscontriDiretti`;
- dichiarazioni di terzi → `dichiarazioniTerzi`;
- deduzioni → restano nel lavoro sul PC e non entrano nei registri.

## Validatore

```bash
node strumenti/valida.mjs demo --repo-pubblico
```

Accetta una cartella pratica, una cartella che ne contiene più d'una, oppure un singolo file JSON (solo struttura e controlli interni). Opzioni:
- `--repo-pubblico`: esige `demo: true` e applica i controlli sui dati fittizi;
- `--json`: risultato leggibile da una sessione Claude;
- `--senza-avvisi`.

Esce con codice 1 se trova errori.

Cosa controlla:
- **Struttura**: JSON Schema 2020-12, nella parte usata dagli schemi, implementato senza librerie.
- **Codici**: bene censito, evidenza coerente con il bene e il requisito del codice, componenti del bene giusto, evidenze comuni dichiarate, nessuna collisione con gli identificativi già nel fascicolo.
- **Profilo e gruppi**: profilo coerente con allegato e gruppo, almeno 2 RU nel profilo completo, gruppi tutti presenti, attese conformi al profilo, gruppi attesi ancora vuoti.
- **Dati agli atti**: un dato documentato ha una fonte; un esito `corretto` o `difforme` ha il valore rilevato; ogni esito ha un'evidenza o una nota; la difformità genera un alert.
- **Timeline**:
  - precisione coerente con la data;
  - una data documentata ha una prova, e una dichiarazione dell'impresa non è una data documentata;
  - anacronismi, per esempio interconnessione prima dell'installazione;
  - prima prova dello scambio successiva alla data dichiarata.
- **Registri**:
  - riscontri nella data della visita e con evidenza collegata;
  - dichiarazioni senza riscontro oggettivo segnalate;
  - azioni chiuse solo con motivo documentato e mai in campo.
- **Integrità**:
  - ogni evidenza, anche annullata, è nel manifesto con la stessa impronta;
  - ogni file esiste ed è integro;
  - `hash.sha256` è completo;
  - i volumi sono tutti presenti e coerenti;
  - il rientro corrisponde all'andata da cui nasce (identificativo e impronta);
  - il fascicolo riporta quanto importato.
- **Riservatezza** (§12.5):
  - credenziali sempre vietate;
  - nei dati DEMO, IP e MAC solo negli intervalli di documentazione (192.0.2.x, 198.51.100.x, 203.0.113.x; 00:00:5E:00:53:xx), email solo su domini riservati, nessun codice fiscale.

Prova del validatore: la DEMO deve passare e ogni caso errato deve essere rifiutato con il codice atteso.

```bash
node strumenti/prova.mjs
```

## Pratica DEMO

`demo/PRATICA_DEMO_2026_001` è una pratica fittizia di un'azienda inventata con due beni:
- **B01**, centro di lavoro CNC: Allegato A Gruppo 1, profilo completo, componenti B01.1 e B01.2, GATE C giallo;
- **B02**, macchina di misura a coordinate: Allegato A Gruppo 2, profilo ridotto, interconnessione tramite report su cartella condivisa.

Contiene:
- il pacchetto di andata;
- il rientro finale del sopralluogo S01 in due volumi;
- il fascicolo già aggiornato dopo l'importazione.

I media sono sintetici:
- PNG con scritta «DEMO»;
- un WAV muto;
- PDF di una pagina;
- il video è un segnaposto di testo dichiarato come tale (`text/plain`).

Il validatore riporta sulla DEMO **10 avvisi voluti**, che mostrano i casi da gestire:
- matricola di B02 difforme da quella in fattura (alert in scheda e nel rientro);
- orologio del CN indietro di un'ora;
- prima prova dello scambio di B01 successiva di 14 giorni all'interconnessione dichiarata;
- una dichiarazione verbale senza riscontro oggettivo (in pratica e nel rientro);
- trascrizione del video non ancora confrontata;
- gruppo 6 (integrazione) di B01 ancora vuoto;
- 5 azioni aperte da riportare nel cruscotto pratiche.

Per rigenerarla dopo una modifica agli schemi:

```bash
node strumenti/genera_demo.mjs
```

## Regole per il repository pubblico

- Mai dati cliente, nemmeno anonimizzati a mano: solo dati inventati, con `demo: true`.
- Mai il testo del metodo peritale o dei prompt dello studio.
- Prima di ogni commit eseguire `node strumenti/prova.mjs` e `node strumenti/valida.mjs demo --repo-pubblico`.
