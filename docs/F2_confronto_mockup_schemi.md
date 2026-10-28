# F2 — Confronto tra mockup approvati e schemi v1

Mockup di riferimento: `design/Sopralluogo iPhone.dc.html` (schermate 1a–1m), `design/Testata.dc.html`, `design/TabBar.dc.html`.
I dati di esempio dei mockup (Officina Esempio, P-2026-001, IP 192.168.10.41…) servono solo alla grafica: la PWA userà la pratica DEMO del repository.

## Decisioni approvate

Tutte le proposte di questo documento sono approvate. In più:

1. **Azioni**: in campo «Proponi chiusura» con motivo ed evidenza o riscontro obbligatori; la chiusura definitiva si fa sul PC; la scheda «Chiuse» diventa «Proposte».
2. **Fotocamera e video nativi** dell'iPhone; la schermata 1d resta per scegliere bene, componente e gruppo.
3. **Moduli JavaScript senza compilazione**, Preact copiato nel repository, nessun `npm install`.
4. **F2.1**: richiesta di archiviazione persistente all'avvio; promemoria di checkpoint durante la visita (ogni 2 ore o ogni 30 evidenze dall'ultimo export).
5. **F2.3**: per foto e video si salva la data di scatto letta dai metadati, distinta dall'ora di importazione nell'app; se i metadati mancano si dichiara (`origineDataScatto: assente`).
6. Nome e logo del perito visibili su GitHub Pages: accettato.

Le modifiche di schema sono nella **v1.1.0** (fase F2.0).

Legenda colonna «Proposta»: **S** = modificare lo schema (v1.1), **A** = adeguare l'app rispetto al mockup, **D** = dato derivato, nessuna modifica.

## A. Dati mostrati nei mockup che lo schema non prevede

| # | Schermata | Dato nel mockup | Nello schema v1 | Proposta |
|---|---|---|---|---|
| A1 | 1c, 1j | Date della pratica (ordine, acconto, consegna, collaudo, entrata in funzione, interconnessione dichiarata, prima prova) mostrate sul telefono | La timeline sta solo in `pratica_40`; l'andata non la porta | **S**: aggiungere `timeline` all'andata (righe della pratica, sola lettura in campo) |
| A2 | 1c | Verifica in campo di una data (es. «Data consegna · DDT n. 2207») con esito | `verificheDati` accetta solo i campi dei dati agli atti | **S**: in `dateRilevate` campo facoltativo `rifTimeline` (es. `T005`) per dire quale data agli atti si conferma o si corregge |
| A3 | 1b | Pulsante «Nuovo bene» (censimento in campo) | Il rientro non può contenere beni non presenti nell'andata | **S**: `beniNuovi` nel rientro (codice, denominazione, funzione, matricola letta, componenti); il PC li porta nella pratica |
| A4 | 1e | Strumenti «Cerchio» e «Testo» sulla foto, tre colori | `annotazione.tipo` ammette riquadro, freccia, evidenziazione, nota; nessun colore | **S**: aggiungere `cerchio` e `testo` (posizionato), campo `colore` |
| A5 | 1e | Frecce e cerchi senza testo; testo descrittivo in una «Nota breve» (80 caratteri) della foto | `annotazione.testo` obbligatorio | **S**: `testo` facoltativo per freccia e cerchio; la nota breve va in `descrizione` (resta obbligatoria) |
| A6 | 1f | Vocale/video con **titolo** («Flusso del programma pezzo») e **nota facoltativa** separata | Solo `descrizione` | **S**: titolo → `descrizione`; nuovo campo facoltativo `nota` |
| A7 | 1h | «Nota del perito» per ogni requisito di ogni bene | Non esiste | **S**: `noteCampo` (bene, requisito, testo, ora) dichiarate come **promemoria**, non come base probatoria (non sono riscontri diretti) |
| A8 | 1i | Categoria dell'azione: Documento / Evidenza / Chiarimento | Non esiste | **S**: campo facoltativo `categoria` |
| A9 | 1m | Riscontro oggettivo «Da acquisire» | Solo S/N (§10.9) | **A**: resta S/N; «Da acquisire» = N + nuova azione creata automaticamente per acquisirlo |
| A10 | 1g | Circostanza scelta da due frasi predefinite | Testo libero `circostanza` + `frase` composta | **A**: frasi predefinite modificabili + ora automatica; la `frase` la compone l'app (fatto + oggetto + circostanza) |
| A11 | 1j | «Registro della visita» (ora, evento, dettaglio) | Non esiste | **D**: ricavato da inizio visita, presenti e orari di evidenze, riscontri e dichiarazioni; nessun nuovo dato |
| A12 | 1k | SHA-256 **del file ZIP** del pacchetto | Impronte dei singoli file e di `perizia40-rientro.json` | **D**: l'impronta dello ZIP non può stare dentro lo ZIP; l'app la mostra e la PC la registra in `pratica.pacchetti` |
| A13 | 1k | Pacchetto come **ZIP** (nome `…_rientro_FIN_AAAAMMGG-HHMM.zip`) | Il validatore legge una cartella già estratta | **A**: il validatore impara a leggere lo ZIP direttamente (lettore minimo con `zlib`, senza dipendenze) |
| A14 | 1a | Stato «Da scaricare / pacchetto di andata pronto in studio» | — | **A**: da togliere: senza server l'app non può sapere che esiste un'andata non ancora importata |
| A15 | 1a | «Salvato in File › OneDrive › Pratiche › P-2026-001» | — | **A**: il browser non conosce la cartella scelta nel foglio di condivisione; messaggio generico «Pacchetto pronto: salvalo nella cartella della pratica» |
| A16 | 1b, Testata | Contatore «targhe» | — | **D**: beni con almeno una foto valida nel gruppo 2 (da confermare l'etichetta) |
| A17 | 1a | Nome e logo del perito | Nell'andata non c'è il perito | **A**: impostazione locale dell'app, non dato della pratica (vedi nota sul repository pubblico) |

## B. Dati dello schema che i mockup non mostrano o non permettono di inserire

| # | Dato dello schema | Dove servirebbe | Proposta |
|---|---|---|---|
| B1 | `datiAgliAtti.controllore.firmware` | 1c mostra «Controllore PLC/CNC» su una sola riga (marca · modello) | **A**: tre righe (marca, modello, firmware), ognuna con il suo esito |
| B2 | `dichiarazioneCE.*`: il mockup unisce numero e data in una riga; direttive e riferimento alla matricola non compaiono | 1c | **A**: una riga per ogni campo che l'andata chiede di verificare (nella DEMO: riferimento alla matricola) |
| B3 | `statoAgliAtti` (documentato / dichiarato / da verificare) e `fonte [ev:]` di ogni dato | 1c (c'è solo «non documentata» sulle date) | **A**: etichetta di stato e fonte sotto il valore |
| B4 | `nota` obbligatoria per l'esito «non verificabile» | 1c: nessun campo nota | **A**: campo nota, obbligatorio solo per «non verificabile» |
| B5 | Componenti `B01.1`, `B01.2` | 1b, 1d: nessuna scelta del componente | **A**: in fotocamera «Cambia» sceglie bene **o** componente |
| B6 | Evidenza `comune` a più beni | 1d | **A**: opzione «vale anche per…» dopo lo scatto |
| B7 | Tipo `documento` / `screenshot` (es. report copiato dalla cartella condivisa) | 1d ha solo foto, video, vocale | **A**: modalità «Allega file» oltre a foto, video e vocale |
| B8 | `dataMostrataAVideo` e `orologioErrato` | 1e | **A**: in annotazione, campo «ora mostrata a schermo» con spunta «orologio del bene errato» |
| B9 | Evidenza `annullata` con motivo e data | Nessuna schermata | **A**: galleria per gruppo con «Annulla evidenza» (motivo obbligatorio; il file resta) |
| B10 | Azione: `priorita`, `destinatario`, `requisito`, `percheServe`, `esempioAccettabile` | 1i mostra solo titolo, bene, nota, categoria | **S + A**: in campo le nuove azioni sono **bozze** con campi minimi (categoria, bene, requisito, cosa serve, nota); priorità, destinatario ed esempio si completano sul PC. Lo schema del rientro accetta la bozza |
| B11 | Chiusura azioni solo con motivo documentato, decisa sul PC (`aggiornamentiAzioni`: proposta + evidenza o riscontro) | 1i chiude l'azione in campo con un motivo libero e la sposta in «Chiuse» | **A** (da decidere, domanda 1): «Proponi chiusura» con motivo (evidenza acquisita / riscontro diretto) e collegamento obbligatorio; scheda «Proposte» al posto di «Chiuse» |
| B12 | Le azioni non si cancellano (§10.4) | 1i ha il cestino | **A**: niente cestino; una bozza creata per errore in questa visita si può scartare solo finché non è entrata in un checkpoint |
| B13 | `nuoveAzioni` (creazione in campo) | Nessun pulsante «Nuova azione» | **A**: pulsante in 1i e scorciatoia da scheda bene / requisito |
| B14 | `dateRilevate` (data letta in campo con prova) | 1j è in sola lettura | **A**: «Aggiungi data rilevata» con evento, data, precisione, evidenza |
| B15 | RU dichiarati (RU1, RU2) nel profilo completo; VOCE nel profilo ridotto | 1h mostra solo RO1–RO5 | **A**: elenco requisiti ricavato dal profilo del bene |
| B16 | Gruppi «su richiesta» (profilo ridotto) e «di supporto» (gruppo 10 nel profilo completo) | 1c conosce solo presente / mancante / non richiesto; «Dati in uscita» appare «non richiesto» | **A**: quarto stato «su richiesta» e dicitura «di supporto»; stati ricavati dall'`attesa` dell'andata, non da un elenco fisso |
| B17 | `cosaCercare` del gruppo | 1d ha suggerimenti scritti nel codice | **D**: il suggerimento viene dall'andata |
| B18 | `sopralluogo.presenti`, `inizio`, `fine` | Solo «Arrivo in sito» nel registro | **A**: «Inizia visita» con scelta dei presenti dai referenti dell'andata; fine registrata alla creazione del pacchetto finale |
| B19 | `sopralluogo.avvertenze` (niente credenziali in foto, prove di rete con l'IT…) | Nessuna schermata | **A**: mostrate all'apertura della pratica e all'avvio della visita |
| B20 | `classificazione.voce` | Solo «Profilo completo 5+2» | **A**: voce leggibile nella scheda bene (riga compressa) |
| B21 | Trascrizione `manuale_campo` | 1f: «nessuna trascrizione nell'app» | **D**: coerente; nell'app nessuna trascrizione, il campo resta per il PC |

## C. Altre osservazioni sui mockup

- **C1 — «Raccolta completa» (1b)**: il conteggio dei gruppi indica presenza di materiale, non sufficienza. Proposta: «Tutti i gruppi con materiale».
- **C2 — Gruppo → requisito del codice**: l'identificativo `B01-RO4-001` richiede un requisito per gruppo. Si usa quello indicato nei mockup (HMI → RO4, Targa → ID, Documenti → DOC…); la scheda bene registra comunque tutti i requisiti del gruppo.
- **C3 — Repository pubblico**: nome «Perito Ing. Francesco Provenzano» e logo FP saranno pubblici su GitHub Pages. Non sono dati cliente; segnalo solo che diventano visibili.
- **C4 — Dati dei mockup**: IP 192.168.10.41 e nomi di persona sono fuori dalle regole DEMO del validatore; nella PWA non verranno usati.
