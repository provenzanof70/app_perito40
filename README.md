# app_perito40

App di sopralluogo per le perizie tecniche **Industria 4.0** (credito d'imposta beni strumentali 4.0), da installare sulla Home dell'iPhone come PWA e funzionante offline, più gli strumenti per PC che la alimentano.

**Solo codice e dati DEMO fittizi.** Nessun dato cliente, nessun testo del metodo peritale dello studio: i rimandi del tipo «§2.7» indicano soltanto il paragrafo del metodo a cui una regola si ispira.

## Vincoli

- **Nessuna API e nessun servizio AI esterno** nell'app o negli script. Le letture di testo (targhe, schermate, vocali) si fanno a mano in campo oppure in una sessione Claude sul PC, sulla cartella della pratica.
- **Nessun dato esce dal telefono** se non lo esporta il perito.
- Gli script richiedono solo **Node.js 22 o successivo**, senza `npm install`; l'app non ha passaggi di compilazione.

## Stato

| Fase | Contenuto | Stato |
|---|---|---|
| F1 | Schemi JSON v1, pratica DEMO, validatore, README | fatta |
| F2.0 | Schemi v1.1 allineati ai mockup (`docs/F2_confronto_mockup_schemi.md`), rientro in ZIP, validatore aggiornato | fatta |
| F2.1 | Base della PWA: installazione, offline, archivio sul telefono, importazione dell'andata, elenco pratiche, visita, promemoria di checkpoint | fatta |
| F2.2 | Elenco beni, scheda bene con verifica riga per riga dei dati agli atti, censimento dei beni nuovi | fatta |
| F2.3 | Rilievo: foto e video nativi, vocali, allegati, annotazione, galleria per gruppo, annullamento | fatta |
| F2.4 | Requisiti, riscontro diretto guidato, dichiarazione di terzi, note del perito | fatta |
| F2.5 | Azioni (bozze e proposte di chiusura), cronologia con date rilevate, registro della visita | fatta |
| F2.6 | Pacchetto di rientro: checkpoint e finale, volumi, controllo, «Salva in File», sola lettura dopo il finale | fatta |
| F2.7 | Prove: visita completa riletta dal PC, protocollo sull'iPhone ([docs/F2_7_prove_iphone.md](docs/F2_7_prove_iphone.md)), «Ricomincia la DEMO» | fatta |
| F2.8 | Pubblicazione su GitHub Pages | attiva: https://provenzanof70.github.io/app_perito40/app/ |
| F3.1 | PC: nuova pratica, nuovo bene, registrazione dei documenti, scheletro Word di perizia e analisi tecnica; schemi 1.4 | fatta |
| F3.2 | PC: pacchetto di andata generato dal fascicolo (revisioni, sopralluogo previsto, indicazioni di studio) | fatta |
| F3.3 | PC: importazione dei rientri nel fascicolo (checkpoint e finale, volumi, senza doppioni); fascicolo fotografico Word | fatta |
| F3.4 | PC: emissione e chiusura (per la firma, giuramento, documenti finali firmati PAdES/CAdES e marcati, sola lettura); schema 1.7 | fatta |
| F3.5 | PC: diario di ogni pratica e cruscotto delle pratiche aperte con il prossimo passo (`/pratiche` nella cartella delle pratiche) | fatta |
| F4.1 | Studio desktop (`studio/`): cruscotto, pratica con beni, documenti da trascinare e registrare, diario; server locale solo su 127.0.0.1 | fatta |
| 0.9–0.10 | Gruppo Sicurezza (RO5), riquadri per requisito, nota breve facoltativa in campo, dati del documento; schemi 1.5–1.6 | fatta |

## Struttura

```
app/                           PWA di sopralluogo (moduli JavaScript senza compilazione)
  index.html, stile.css, manifest.webmanifest, sw.js, precache.js (generato)
  js/                          interfaccia (Preact + htm), archivio IndexedDB, importazione, promemoria
  vendor/                      Preact e htm copiati dal registro npm, con licenze e impronte (vendor/LEGGIMI.md)
  img/                         logo e icone (generate da strumenti/genera_icone.mjs)
schemi/v1/                     formati dei file
  comuni.v1.schema.json        definizioni condivise (codici, date, evidenze, timeline, azioni, registri, manifesto)
  pratica_40.v1.schema.json    fascicolo della pratica sul PC
  scheda_bene.v1.schema.json   una scheda per bene
  perizia40-andata.v1.schema.json   pacchetto PC → telefono
  perizia40-rientro.v1.schema.json  pacchetto telefono → PC
studio/                        Perito 4.0 Studio: versione desktop sulle cartelle delle pratiche
  server.mjs                   server locale (solo 127.0.0.1) che usa gli stessi script della riga di comando
  web/                         interfaccia (Preact + htm, stessi componenti grafici dell'app)
strumenti/
  valida.mjs                   validatore da riga di comando
  prova.mjs                    prova del validatore sulla DEMO e sui casi errati
  genera_demo.mjs              rigenera la pratica DEMO
  crea_pratica.mjs             crea la cartella di una nuova pratica con il fascicolo iniziale
  nuovo_bene.mjs               aggiunge un bene: scheda valida con i dati agli atti da compilare
  registra_documento.mjs       registra un documento del cliente come evidenza (copia, codice, impronta, manifesto)
  genera_andata.mjs            pacchetto di andata per l'app dal fascicolo (F3.2)
  importa_rientro.mjs          importa gli ZIP di rientro dell'app nel fascicolo (F3.3)
  emissione.mjs                per la firma, giuramento, documenti finali firmati e marcati, chiusura (F3.4)
  diario.mjs                   diario di lavoro della pratica (DIARIO.md): fatto, decisioni, prossimo passo
  cruscotto.mjs                riepilogo delle pratiche aperte con il prossimo passo (CRUSCOTTO.md)
  word/scheletro_perizia.py    scheletro Word di perizia giurata e analisi tecnica dal fascicolo
  word/fascicolo_fotografico.py  fascicolo fotografico Word: foto per requisito con le annotazioni del campo
  word/regime_CRI_4.0.json     testi del credito d'imposta 4.0 (VISTI, PREMESSO, requisiti, check list, conclusioni): da verificare per annualità
  word/regime_IPER_2026.json   iperammortamento 2026: solo punto di estensione, testi da redigere al primo caso reale
  aggiorna_app.mjs             aggiorna l'elenco dei file offline dell'app e la policy di sicurezza
  genera_icone.mjs             genera le icone dell'app dal logo
  lib/validatore.mjs           nucleo dei controlli, senza dipendenze né accesso al disco (riusabile nella PWA)
  lib/zip.mjs                  lettura e scrittura ZIP senza dipendenze (riusabile nella PWA)
  lib/disco.mjs                lettura di cartelle e ZIP, calcolo delle impronte (Node)
  lib/andata.mjs               costruzione dell'andata dal fascicolo (usata anche per la DEMO)
  lib/firme.mjs                riconoscimento di firme PAdES/CAdES e marche (PDF, .p7m, .tsr, .tsd, .m7m), integrità con openssl
  lib/prova_firme.mjs          documenti firmati e marcati di prova (certificato di test usa e getta)
demo/
  PRATICA_DEMO_2026_001/       pratica fittizia completa (dopo l'importazione del rientro)
  casi_errati/casi.json        modifiche che il validatore deve rifiutare
design/                        mockup approvati (Claude Design), solo riferimento grafico
docs/                          confronto mockup/schemi e decisioni
```

## Flusso

```
PC (sessione Claude sulla cartella pratica)         iPhone (PWA offline)
pratica_40.json + beni/B0x.json
        │  genera
        ▼
andata/perizia40-andata.json  ───────────────────▶  sopralluogo: foto annotate, vocali, video,
                                                     verifica dei dati agli atti, riscontri diretti,
                                                     dichiarazioni di terzi, date, beni nuovi, bozze di azione
        ┌────────────────────────────────────────── rientro: checkpoint durante la giornata,
        ▼                                            finale a fine visita, anche in più volumi ZIP
rientro/<codice>_rientro_FIN_<data-ora>_v1di2.zip = perizia40-rientro.json + hash.sha256 + evidenze/
        │  importa (verifica impronte, copia evidenze, aggiorna schede e registri)
        ▼
pratica_40.json aggiornata
```

La cartella di una pratica sul PC:

```
PRATICA_xxx/
  pratica_40.json
  beni/B01.json, B02.json …
  andata/<nome pratica> - perizia40-andata.json
  rientro/<codice>_rientro_FIN_…_v1di2.zip …
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

**Pacchetto di andata.** Riporta i beni con componenti, classificazione, gruppi attesi e cosa cercare. Porta i **dati agli atti come valori da verificare**, la **timeline agli atti** (in sola lettura sul telefono), le azioni aperte e gli identificativi di evidenza già usati, così l'app continua la numerazione senza collisioni.

**Pacchetto di rientro**
- File ZIP, tipo `checkpoint` o `finale`; può essere diviso in **volumi**. Ogni volume ripete lo stato completo e contiene solo i file assegnati a quel volume nel manifesto. L'impronta dello ZIP non può stare dentro lo ZIP: la registra la pratica in `pacchetti`.
- **Evidenze**: foto con annotazioni (riquadri, cerchi, frecce, testi e note in coordinate 0–1, con colore; l'originale non viene toccato), vocali e video con titolo e nota facoltativa, documenti.
- **Data di scatto distinta dall'ora di acquisizione** nell'app (§6.1): `origineDataScatto` dice se viene dai metadati del file, dalla registrazione fatta nell'app o se è assente. Se i metadati mancano lo si dichiara e non si sostituisce con l'ora di importazione.
- Data mostrata a video, con segnalazione dell'orologio errato: si registra, non si corregge (§6.1).
- **Beni nuovi** censiti in campo, con matricola letta, illeggibile o mancante: perimetro e classificazione si decidono sul PC.
- **Trascrizioni** con origine `manuale_campo` o `claude_pc` e flag di confronto con l'originale. Nessun OCR da servizi esterni.
- Le **evidenze annullate restano** nel pacchetto con motivo, data ed eventuale sostituta: non si cancellano.
- **Esiti delle verifiche** dei dati agli atti.
- **Riscontri diretti** del perito (§1.3, §10.9): bene, requisito, data della visita, fatto, oggetto e circostanza in campi separati, la frase verbalizzata, le evidenze collegate e i limiti. Non retrodatano l'evento.
- **Dichiarazioni di terzi** (§10.9): persona, ruolo, organizzazione, forma, data, contenuto effettivo, requisito e riscontro oggettivo (S/N con `[ev:]`).
- **Note di campo** per requisito: promemoria, mai base probatoria.
- **Date rilevate**: con `rifTimeline` ed `esitoRif` (confermata / precisata / difforme) verificano una data agli atti.
- **Bozze di azione** (categoria documento / evidenza / chiarimento, bene, requisito, cosa serve, eventuale origine: per esempio una dichiarazione con riscontro «da acquisire»); priorità, destinatario ed esempio si completano sul PC.
- **Aggiornamenti delle azioni**: l'app propone la chiusura con motivo ed evidenza o riscontro obbligatori; la chiusura la decide il perito sul PC.
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

Le note di campo (`noteCampo`) sono dichiarate `promemoria` e non appartengono a nessuna delle quattro basi.

## Validatore

```bash
node strumenti/valida.mjs demo --repo-pubblico
```

Accetta una cartella pratica (anche con i rientri in ZIP), una cartella che ne contiene più d'una, un singolo file JSON (solo struttura e controlli interni) oppure i volumi ZIP di un rientro, con l'andata facoltativa per i controlli incrociati:

```bash
node strumenti/valida.mjs rientro_v1di2.zip rientro_v2di2.zip --andata andata/perizia40-andata.json
```

Opzioni:
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
  - azioni chiuse solo con motivo documentato e mai in campo; proposte di chiusura con evidenza o riscontro;
  - azioni generate da una dichiarazione, un riscontro o una nota che esistono davvero.
- **Novità v1.1**: data di scatto mai successiva all'acquisizione e metadati assenti segnalati; beni nuovi senza codici già usati; date rilevate riferite a una riga esistente della timeline, dello stesso evento e degli stessi beni.
- **Integrità**:
  - ogni evidenza, anche annullata, è nel manifesto con la stessa impronta;
  - ogni file esiste ed è integro, anche dentro gli ZIP (CRC e SHA-256);
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

## App di sopralluogo (PWA)

Requisiti sul telefono: **iPhone con iOS 16.4 o successivo**, Safari; l'app va aggiunta alla schermata Home (Condividi › Aggiungi alla schermata Home).

Cosa fa oggi (F2.1–F2.7):
- **Offline**: il service worker conserva sul telefono tutti i file dell'app; l'app cerca una versione nuova all'avvio e quando torna in primo piano; l'aggiornamento si propone dal menu e, a visita in corso, si installa solo con «Aggiorna comunque» (i dati restano sul telefono).
- **Archivio sul telefono** (IndexedDB) e **richiesta di archiviazione persistente** all'avvio; se il sistema non la concede, l'app lo dice.
- **Importazione del pacchetto di andata** da File: impronta SHA-256 dei byte ricevuti e controllo con lo stesso validatore del PC. Un'andata non valida viene rifiutata con l'elenco degli errori; una pratica con dati già raccolti non si sovrascrive.
- **Elenco pratiche** (mockup 1a), testata e barra in basso dei mockup, modalità chiara e scura.
- **Avvertenze** del pacchetto all'apertura della pratica; **inizio visita** con scelta dei presenti.
- **Beni (F2.2)**: elenco con gruppi di evidenze per profilo, scheda del bene con la verifica riga per riga dei dati agli atti (confermato / corretto con nuovo valore / difforme / non verificabile con nota obbligatoria, evidenza collegata), date agli atti in sola lettura, censimento dei beni nuovi con matricola letta, illeggibile o mancante.
- **Rilievo (F2.3)**: scelta di bene o componente e gruppo, poi la fotocamera o la videocamera dell'iPhone (risoluzione piena), vocali registrati nell'app, allegati da File (PDF, schermate). Ogni evidenza riceve il codice (B01-RO2-003) senza collisioni con il fascicolo, un nome di file fissato all'acquisizione e l'impronta SHA-256 calcolata subito; l'originale non si modifica mai.
- **Data di scatto** letta dai metadati (EXIF per le foto, `mvhd` per i video), distinta dall'ora di acquisizione nell'app (§6.1). Safari su iPhone toglie i metadati alle foto della fotocamera aperta dall'app: in quel caso l'app registra l'intervallo tra apertura della fotocamera e rientro della foto (`fotocamera_app`, schema 1.2). «Dalla libreria» prende foto e video già scattati con la Fotocamera dell'iPhone. Senza alcuna informazione, la data si dichiara assente.
- **Annotazione** (frecce, cerchi, testi, tre colori) sovrapposta alla foto in coordinate relative; nota breve obbligatoria; ora mostrata a schermo con segnalazione dell'orologio errato; «vale anche per» altri beni.
- **Galleria per gruppo** dalle tessere della scheda bene; **annullamento** con motivo e data (il file resta); le evidenze si collegano alla verifica dei dati agli atti.
- **Requisiti (F2.4)**: per ogni bene i requisiti del suo profilo (RO1–RO5 e RU dichiarati; voce e interconnessione nel profilo ridotto) con le tre basi raccolte (documento, anche agli atti; riscontro diretto; dichiarazione) e la nota del perito come promemoria. Nessun esito: la valutazione resta in studio.
- **Cosa serve per dimostrarlo**: sotto ogni requisito una guida apribile, ricavata dai modelli ministeriali di perizia e di analisi tecnica e dalla Circolare 4/E: che cosa chiede il requisito, che cosa cercare in campo, gli errori da evitare. Sotto, le indicazioni di studio della singola pratica (`guidaRequisiti` dell'andata, schema 1.3), preparate sul PC anche dalle perizie precedenti: restano private e non stanno nel repository.
- **Riscontro diretto guidato**: fatto, oggetto, circostanza, ora; data della visita automatica; frase verbalizzata composta dall'app; foto o video scattati dal modulo e collegati.
- **Dichiarazione di terzi**: persona dai referenti, forma (con foto del documento se scritta), data, contenuto, riscontro oggettivo Sì (con evidenza obbligatoria) / No / Da acquisire, che crea una bozza di azione collegata.
- I codici dei registri (RD, DT, NC, A) non riusano quelli già nel fascicolo: l'andata li elenca in `idUsati` (schema 1.2).
- **Azioni (F2.5)**: aperte (dall'andata e bozze nate in campo, anche da «Da acquisire») e proposte. «Nuova azione» con categoria, bene, requisito, cosa serve; «Proponi chiusura» con motivo ed evidenza o riscontro obbligatori; «Annota esito» (risolta in parte / non risolta). La chiusura la decide il perito sul PC; una bozza si scarta solo prima del primo pacchetto esportato.
- **Cronologia e date**: date agli atti per bene con origine, precisione e stato; verifica in campo (confermata / precisata / difforme) e date nuove, con prova collegata e stato calcolato (documentata solo con prova e origine non dichiarativa); coerenza con nota obbligatoria se non coerente.
- **Registro della visita** ricavato da inizio visita, evidenze, riscontri, dichiarazioni, beni nuovi e date, senza dati nuovi.
- **Promemoria di checkpoint**: ogni 2 ore o 30 evidenze dall'ultimo pacchetto (o dall'inizio visita); «Più tardi» lo sospende per 30 minuti.
- **Pacchetto di rientro (F2.6)**: dalla scheda Pratica o dal promemoria. **Checkpoint** numerati: stato completo della visita e solo i file non ancora consegnati (gli altri restano nel manifesto con il rimando al checkpoint). **Finale**: tutti i file e tutti gli esiti, ora di fine visita. Volumi da al massimo 250 MB (`…_v1di2.zip`), ciascuno con `perizia40-rientro.json`, `hash.sha256` ed `evidenze/`. Prima dell'esportazione il pacchetto passa dallo stesso validatore del PC; mentre si crea lo ZIP ogni file viene riletto e confrontato con l'impronta registrata all'acquisizione. «Salva in File» apre la condivisione dell'iPhone; il pacchetto conta come consegnato solo quando confermi di aver salvato tutti i volumi. Dopo il finale la visita è chiusa e la pratica resta consultabile in sola lettura; il finale si può ricreare identico.
- **Prove (F2.7)**: «Ricomincia la DEMO» (solo per la pratica DEMO) toglie dal telefono pratica, file e registri per rifare le prove da capo. Il protocollo di prova sull'iPhone è in [docs/F2_7_prove_iphone.md](docs/F2_7_prove_iphone.md); le prove automatiche costruiscono una visita completa e ne rileggono il pacchetto finale con `valida.mjs`, come sul PC.
- **Sicurezza**: la policy dell'app permette di contattare solo il proprio indirizzo (nessun servizio esterno) e vieta il codice valutato al volo.

Per provarla sul PC, dalla radice del repository:

```bash
python -m http.server 8040 --bind 127.0.0.1
```

e aprire `http://localhost:8040/app/`; con «Prova con la pratica DEMO» si importa l'andata della DEMO.

Dopo ogni modifica ai file dell'app:

```bash
node strumenti/aggiorna_app.mjs
```

(la prova `node strumenti/prova.mjs` fallisce se ce ne si dimentica).

## Sul PC: dalla cartella dei documenti allo scheletro di perizia (F3.1)

Sul PC l'applicazione è Claude: si apre la cartella delle pratiche (OneDrive) in Claude e una skill privata guida il lavoro,
usando questi script. Gli script non usano servizi esterni e funzionano su qualsiasi cartella di pratica.

```bash
node strumenti/crea_pratica.mjs "<cartella delle pratiche>" PROVA-2026-001 --cliente "Ragione sociale" --sede "Sede dell'intervento"
```

```bash
node strumenti/nuovo_bene.mjs "<cartella pratica>" --denominazione "Centro di lavoro" --funzione "Fresatura a CN" --allegato A --gruppo 1 --voce "Macchine utensili per asportazione" --codice-voce A11_01 --ru RU1,RU2
```

```bash
node strumenti/registra_documento.mjs "<cartella pratica>" "<cartella pratica>/documenti_cliente/fattura.pdf" --beni B01 --descrizione "Fattura n. … del …"
```

```bash
python strumenti/word/scheletro_perizia.py "<cartella pratica>" --perito "<file privato del perito>.json"
```

- La nuova pratica ha `documenti_cliente/` (originali, mai modificati), `beni/`, `evidenze/`, `andata/`, `rientro/`, `perizia/` e `pratica_40.json`.
- Il nome della cartella perde punti e spazi finali (es. «S.r.l.»): Windows non apre cartelle che finiscono con un punto.
- Lo scheletro segue il formato delle perizie giurate dello studio. Per ogni bene scrive la perizia giurata di 4 pagine (VISTI, PREMESSO, tabella del bene, DICHIARA con la griglia delle voci e caselle vuote, verbale di asseverazione) e l'analisi tecnica (copertina con ordine, matricola, fornitore e costruttore; requisiti; dati identificativi in elenco; classificazione con voce numerata e documenti a supporto; costi con le note su limite del 5% e circolare MiSE 547750; per ogni requisito «Descrizione ed evidenze» e «Conclusione»; check list; conclusioni con firma; allegati elencati dai documenti del fascicolo; appendice istruttoria).
- I testi normativi vengono da `regime_<regime>.json`, scelto dal campo `regime` della pratica. Per l'iperammortamento 2026 il file è solo predisposto e il generatore si ferma. Ciò che il fascicolo non contiene resta `[PLACEHOLDER: …]` in rosso, le istruzioni `[NOTA: …]` in grigio; caselle e conclusioni le decide il perito. Richiede Python 3 con `python-docx`.
- Schema 1.4 (tutto facoltativo): dati dell'impresa (partita IVA, sede legale, legale rappresentante, RSPP, logo), del bene (fornitore, reparto, unità locale, voce numerata), costi (documenti, acconti, accessori, dicitura di legge) e stato dell'elaborato (revisione, bozza/per la firma, giuramento). I dati personali stanno solo nelle cartelle private delle pratiche.

## Sul PC: andata, rientro e fascicolo fotografico (F3.2, F3.3)

```bash
node strumenti/genera_andata.mjs "<cartella pratica>" --data 2026-11-10
```

```bash
node strumenti/importa_rientro.mjs "<cartella pratica>" "<…_v1di2.zip>" "<…_v2di2.zip>"
```

```bash
python strumenti/word/fascicolo_fotografico.py "<cartella pratica>"
```

- L'andata nasce da pratica e schede: beni, gruppi di evidenze, dati agli atti da verificare, date, azioni aperte, codici già usati, indicazioni di studio (`andata/guida_requisiti.json`). Ogni rigenerazione è una nuova revisione; le precedenti restano nella cartella perché i rientri che ne derivano si possano ancora controllare.
- L'import controlla prima i volumi contro l'andata di origine e, se trova errori, non tocca il fascicolo. Poi salva una copia di sicurezza, copia ZIP ed evidenze verificandone le impronte, riporta gli esiti dei dati agli atti nelle schede, registri, date (confermate, precisate o difformi) e bozze di azione. Le proposte di chiusura restano annotate: la chiusura la decide il perito. Rifare l'import non crea doppioni.
- Il rapporto dell'import elenca le targhe da leggere e confrontare con gli atti e le evidenze ancora «da descrivere»: si completano sul PC.
- Il fascicolo fotografico è un documento di lavoro: le annotazioni sono disegnate su una copia, l'originale resta invariato.
- Schema 1.6 (tutto facoltativo): modalità di acquisizione del bene (diretto, leasing, appalto, in economia), periodo d'imposta non solare, interconnessione tardiva (causa, caratteristiche al primo utilizzo, prove datate per classe), dati del documento acquisito in campo.

## Sul PC: emissione e chiusura (F3.4)

```bash
node strumenti/emissione.mjs per-la-firma "<cartella pratica>" --bene B01
```

```bash
node strumenti/emissione.mjs giuramento "<cartella pratica>" --bene B01 --data 2026-11-25 --tribunale "…" --rgvg "…" --cronologico "…"
```

```bash
node strumenti/emissione.mjs registra "<cartella pratica>" --bene B01 --tipo perizia_giurata_scansione "<file.pdf.p7m>" --marca "<file.tsr>"
```

```bash
node strumenti/emissione.mjs chiudi "<cartella pratica>" --bene B01
```

- Dopo il giuramento la perizia non si rigenera più: lo scheletro produce solo l'analisi tecnica, con data, tribunale, R.G.V.G. e cronologico.
- Firma PAdES (nel PDF) o CAdES (`.p7m`), marca nel PDF, nella busta o a parte (`.tsr`, `.tsd`, `.m7m`). Lo script verifica con openssl che la firma corrisponda al contenuto e che la marca riporti l'impronta del documento; firmatario e ora della marca si leggono dal file. Catena e validità dei certificati restano al software di firma.
- La chiusura richiede perizia giurata scansionata e analisi tecnica firmate e marcate, con impronte invariate. Dopo, il bene è in sola lettura e il validatore segnala ogni documento finale cambiato.

## Sul PC: riprendere il lavoro (F3.5)

```bash
node strumenti/cruscotto.mjs "<cartella delle pratiche>" --scrivi
```

- Ogni pratica ha un `DIARIO.md` (creato con la pratica): a fine lavoro si aggiunge cosa è stato fatto, le decisioni e il prossimo passo (`strumenti/diario.mjs`).
- Il cruscotto legge fascicoli, schede e diari (non i documenti dei clienti) e mostra per ogni pratica aperta lo stato delle perizie, il sopralluogo, le integrazioni per destinatario, le segnalazioni che cambiano il lavoro e il prossimo passo: quello del diario, oppure uno suggerito dallo stato del fascicolo.
- Nella cartella delle pratiche il comando `/pratiche` (skill privata) mostra il cruscotto e riprende la pratica scelta dal suo diario: non serve ricordare le conversazioni precedenti.

## Perito 4.0 Studio (F4)

```bash
node studio/server.mjs "<cartella delle pratiche>" --apri
```

- Versione desktop dell'app: cruscotto delle pratiche come l'elenco dell'iPhone; per ogni pratica beni (riquadri per requisito, dati agli atti con stato e verifica in campo), documenti del cliente da trascinare nella finestra e registrare come evidenze, diario.
- Il server ascolta solo su 127.0.0.1, rifiuta host diversi da quello locale, accetta modifiche solo dalla pagina che ha servito (gettone casuale a ogni avvio) e non esce dalle cartelle delle pratiche. Nessun servizio esterno.
- Le operazioni usano gli stessi script della riga di comando: ciò che fa lo Studio lo controlla lo stesso validatore.
- Nella cartella delle pratiche un file `Avvia Perito Studio.cmd` lo apre con un doppio clic. Sopralluogo, foto, azioni e perizia arrivano nelle fasi successive.

## Pratica DEMO

`demo/PRATICA_DEMO_2026_001` è una pratica fittizia di un'azienda inventata con due beni:
- **B01**, centro di lavoro CNC: Allegato A Gruppo 1, profilo completo, componenti B01.1 e B01.2, GATE C giallo;
- **B02**, macchina di misura a coordinate: Allegato A Gruppo 2, profilo ridotto, interconnessione tramite report su cartella condivisa;
- più **B03**, robot trovato in campo e non presente nell'elenco del cliente (bene nuovo, perimetro da chiarire).

Contiene:
- il pacchetto di andata, con la timeline agli atti;
- il rientro finale del sopralluogo S01 in due volumi ZIP;
- il fascicolo già aggiornato dopo l'importazione: la data di installazione di B01 precisata in campo con il verbale, le bozze di azione completate, la nota di campo e il bene nuovo.

I media sono sintetici:
- PNG con scritta «DEMO»;
- un WAV muto;
- PDF di una pagina;
- il video è un segnaposto di testo dichiarato come tale (`text/plain`).

Il validatore riporta sulla DEMO **12 avvisi voluti**, che mostrano i casi da gestire:
- matricola di B02 difforme da quella in fattura (alert in scheda e nel rientro);
- orologio del CN indietro di un'ora (in pratica e nel rientro);
- foto della targa dell'aspiratore B01.2 senza metadati di scatto (in pratica e nel rientro);
- prima prova dello scambio di B01 successiva di 14 giorni all'interconnessione dichiarata;
- una dichiarazione verbale con riscontro oggettivo da acquisire (in pratica e nel rientro);
- trascrizione del video non ancora confrontata;
- gruppo 6 (integrazione) di B01 ancora vuoto;
- 6 azioni aperte da riportare nel cruscotto pratiche.

Per rigenerarla dopo una modifica agli schemi:

```bash
node strumenti/genera_demo.mjs
```

## Regole per il repository pubblico

- Mai dati cliente, nemmeno anonimizzati a mano: solo dati inventati, con `demo: true`.
- Mai il testo del metodo peritale o dei prompt dello studio.
- Prima di ogni commit eseguire `node strumenti/prova.mjs` e `node strumenti/valida.mjs demo --repo-pubblico`.
