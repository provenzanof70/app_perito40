# F2.7 · Protocollo di prova sull'iPhone

Prova completa dell'app di sopralluogo prima dell'uso su una pratica reale. Si usa **solo la pratica DEMO**.
Ogni passo ha l'esito atteso: se l'esito è diverso, annotare il passo e cosa si vede (meglio con una schermata).

Le prove automatiche (`node strumenti/prova.mjs`) coprono già la parte di calcolo: impronte, volumi, checkpoint,
schemi, e la rilettura sul PC di un pacchetto finale con ogni tipo di evidenza e registro. Qui si prova ciò che
solo il telefono può dire: fotocamera, condivisione, offline, interruzioni, spazio.

## 0 · Preparazione

| # | Passo | Esito atteso |
|---|---|---|
| 0.1 | Aprire l'app dall'icona sulla Home | Menu › Versione **0.7.0 · F2.7**, «Installata sulla Home: sì» |
| 0.2 | Se la DEMO c'è già con dati di prove precedenti: DEMO › Pratica › **Ricomincia la DEMO** › Ricomincia | La DEMO sparisce dall'elenco; i pacchetti già salvati in File restano |
| 0.3 | «Prova con la pratica DEMO» | Elenco con DEMO-2026-001, «Disponibile offline» |

## 1 · Offline

| # | Passo | Esito atteso |
|---|---|---|
| 1.1 | Attivare la modalità aereo, chiudere l'app dal multitasking, riaprirla | L'app si apre, testata con «Offline», DEMO consultabile |
| 1.2 | Tutta la sezione 2 si svolge **in modalità aereo** | Nessuna funzione chiede la rete |

## 2 · Visita completa

| # | Passo | Esito atteso |
|---|---|---|
| 2.1 | Aprire la DEMO, «Inizia visita» con 2 presenti, avvertenze lette | Pratica › Visita «In corso dalle …» |
| 2.2 | Rilievo › B01 › Targa: 2 foto con la fotocamera | Codici B01-ID-001, B01-ID-002; nessuna richiesta di rete |
| 2.3 | Annullare B01-ID-002 con motivo, sostituita da una nuova foto | B01-ID-002 «annullata», resta in galleria |
| 2.4 | Rilievo › B01.1 (componente) › una foto; «Dalla libreria» una foto già scattata | Codice B01.1-ID-…; dalla libreria la data di scatto dai metadati |
| 2.5 | Video di 20–30 s su B01 › Interconnessione; vocale di 15 s su B01 › Integrazione | Video e vocale in liste separate, durata indicata |
| 2.6 | FILE: un PDF dall'app File su B02 › Documenti | Evidenza B02-DOC-…, tipo documento |
| 2.7 | Annotare una foto (freccia, cerchio, testo) e salvare | Annotazioni visibili; l'originale non cambia (impronta uguale nel dettaglio) |
| 2.8 | Beni › B01: verificare 3 dati (confermato, corretto con nuovo valore, non verificabile con nota) | Esiti visibili riga per riga |
| 2.9 | Beni › Nuovo bene B03 con matricola letta, una foto della targa | B03 nell'elenco beni, foto collegata |
| 2.10 | Requisiti › B01 › RO2: riscontro diretto con foto | Frase verbalizzata con ora e data |
| 2.11 | Requisiti › B01 › RO3: dichiarazione verbale, riscontro «Da acquisire» | Creata la bozza di azione collegata |
| 2.12 | Nota del perito su B02 › RO2 | Nota visibile nel requisito |
| 2.13 | Azioni: proporre la chiusura di A003 con il riscontro di 2.10; «Annota esito» su A001 | Proposta e esito visibili |
| 2.14 | Cronologia: verificare la data T005 (precisata) con una foto | Data rilevata «in campo», stato calcolato |

## 3 · Interruzioni

| # | Passo | Esito atteso |
|---|---|---|
| 3.1 | Durante la visita chiudere l'app dal multitasking e riaprirla | Visita ancora in corso, nessun dato perso |
| 3.2 | Bloccare il telefono per 5 minuti a metà di un riscontro non salvato | Al ritorno l'app è aperta; i dati salvati ci sono (il modulo non salvato si può perdere: va bene) |
| 3.3 | Riavviare l'iPhone e riaprire l'app | Tutto come prima del riavvio |

## 4 · Checkpoint e pacchetto finale

| # | Passo | Esito atteso |
|---|---|---|
| 4.1 | Disattivare la modalità aereo. Pratica › Crea pacchetto ZIP › Crea checkpoint | «Controlli superati», contenuto con i numeri della sezione 2 |
| 4.2 | Crea ZIP › Salva in File (cartella di prova) › «Ho salvato tutti i volumi» | Checkpoint 1 in «Pacchetti salvati», «Da consegnare: 0» |
| 4.3 | Una foto nuova, poi checkpoint 2 | Solo 1 file nello ZIP |
| 4.4 | Video lungo (circa 3–4 minuti in 4K, oltre 250 MB), poi pacchetto finale | **2 volumi** `…_v1di2.zip` e `…_v2di2.zip`, entrambi salvati |
| 4.5 | «Ho salvato tutto: chiudi la raccolta» | Visita «Chiusa», pratica in sola lettura (Rilievo bloccato, «Nuovo bene» rifiutato, evidenze non modificabili) |
| 4.6 | «Ricrea il pacchetto finale» | Stessa impronta SHA-256 del finale salvato |

## 5 · Sul PC

Copiare gli ZIP (checkpoint e finale) in una cartella di prova sul PC e, dalla radice del repository:

```bash
node strumenti/valida.mjs <cartella>/DEMO-2026-001_rientro_FIN_…_v1di2.zip <cartella>/DEMO-2026-001_rientro_FIN_…_v2di2.zip --andata demo/PRATICA_DEMO_2026_001/andata/perizia40-andata.json
```

Esito atteso: **0 errori**. Gli avvisi `VERIFICA_MANCANTE` per i dati non verificati in campo sono attesi.

## 6 · Spazio e aspetto

| # | Passo | Esito atteso |
|---|---|---|
| 6.1 | Pratica › Archivio sul telefono | «Archiviazione persistente: concessa», spazio usato coerente con i file raccolti |
| 6.2 | Modalità scura e chiara (Centro di Controllo) | Testi leggibili in entrambe, nessun elemento nascosto |
| 6.3 | Testo grande (Impostazioni › Schermo › Dimensioni testo) | Pulsanti e righe ancora utilizzabili |

## 7 · Aggiornamento

| # | Passo | Esito atteso |
|---|---|---|
| 7.1 | Alla pubblicazione di una versione successiva, aprire l'app dalla Home | Entro pochi secondi, nel Menu «Nuova versione disponibile» |
| 7.2 | Con una visita in corso | «Aggiorna comunque» con avvertenza; dopo l'aggiornamento visita e dati intatti |
