# Prove sull'iPhone · copie di sicurezza e Importa (app 0.12.0, schema 1.8)

Obiettivo: nessuna evidenza deve esistere solo nell'archivio dell'app. Fa fede l'originale dell'app con il suo SHA-256;
la copia sul telefono è di sicurezza (iOS può ricomprimerla).

Preparazione: app aggiornata (Menu › Versione **0.12.0 · schema 1.8**), pratica DEMO ripartita da capo
(scheda Pratica › «Ricomincia la DEMO», poi «Prova con la pratica DEMO»), visita iniziata. Segnare per ogni prova: esito, note, screenshot se qualcosa non torna.

## A. Copia di sicurezza subito dopo l'acquisizione

| # | Prova | Atteso |
|---|---|---|
| A1 | Rilievo › FOTO › scatta una foto della targa | Dopo il salvataggio compare la striscia arancione «Copia di sicurezza · B01-ID-… esiste solo nell'app» con «Salva copia sul telefono». La scheda Rilievo mostra 1. |
| A2 | Tocca «Salva copia sul telefono» | Si apre subito il foglio di condivisione di iOS con la foto. |
| A3 | Nel foglio scegli «Salva immagine» | La foto è nel Rullino (app Foto, ultime). La striscia sparisce, il numero sulla scheda Rilievo scende. Avviso «Copia di sicurezza … salvata». |
| A4 | Apri la foto dal dettaglio (miniatura) | «Copia di sicurezza · fatta il gg/mm/aaaa alle hh:mm · scattata o registrata con l'app». |
| A5 | VIDEO › registra 5 secondi › «Salva copia sul telefono» › «Salva video» | Il video è nel Rullino; stato «fatta». |
| A6 | VOCALE › registra 5 secondi, ferma › «Salva copia sul telefono» › «Salva in File» › cartella a scelta | Il file .m4a è nella cartella scelta (app File); stato «fatta». |
| A7 | FILE › scegli un PDF da File | Nessuna striscia: il PDF era già sul telefono. Nel dettaglio: «già presente sul telefono · importata da File». |
| A8 | Scatta una foto e nel foglio di iOS tocca «Annulla» (o chiudi il foglio) | La copia resta «da fare»: la striscia rimane, il numero non scende. |
| A9 | Scatta una foto e chiudi la striscia con × | La striscia sparisce ma il numero resta; in alto «1 copia di sicurezza da fare». |

## B. Copie mancanti con un tocco

| # | Prova | Atteso |
|---|---|---|
| B1 | Scatta 3 foto e registra 1 vocale senza salvare le copie | In alto «4 copie di sicurezza da fare»; scheda Rilievo 4. |
| B2 | Tocca «4 copie di sicurezza da fare» | Foglio «Copie di sicurezza» con due riquadri: «Foto e video · 3» e «Vocali e documenti · 1». |
| B3 | «Salva 3 copie nel Rullino» › «Salva 3 immagini» | Un solo foglio di iOS con le 3 foto; finiscono nel Rullino; resta solo il riquadro dei vocali. |
| B4 | «Salva la copia in File» › «Salva in File» | Il vocale è in File; il foglio dice che tutte le evidenze hanno la copia; numero a 0. |

## C. Avvisi bloccanti con motivo

| # | Prova | Atteso |
|---|---|---|
| C1 | Con 1 copia da fare: «Cambia» › scegli un altro bene | Prima del cambio compare «Copie di sicurezza · Prima di passare a un altro bene». Il bene non cambia finché non scegli. |
| C2 | «Annulla» | Resti sul bene di prima. |
| C3 | Ripeti, «Prosegui senza copia…» senza scrivere il motivo | Il pulsante «Registra il motivo e prosegui» resta disattivo. |
| C4 | Scrivi un motivo › «Registra il motivo e prosegui» | Il bene cambia. Nel dettaglio dell'evidenza: «Proseguito senza copia (cambio bene, data ora): motivo». La copia resta «da fare». |
| C5 | Pratica › Crea pacchetto ZIP › «Crea checkpoint» con copie mancanti | Prima del checkpoint compare «Prima del checkpoint»: si salvano le copie o si prosegue con motivo. |
| C6 | «Crea pacchetto finale» con copie mancanti | Compare «Prima di chiudere la visita»; senza copie o motivo il finale non parte. |
| C7 | Salva tutte le copie dal foglio, poi «Prosegui» | Il checkpoint (o il finale) prosegue normalmente. |

## D. Importa

| # | Prova | Atteso |
|---|---|---|
| D1 | Con la Fotocamera dell'iPhone scatta una foto; nell'app Rilievo › IMPORTA › «Dal Rullino» › scegli la foto | Evidenza creata senza striscia; nel dettaglio «già presente sul telefono · importata dal Rullino» e la data di scatto «(dai metadati del file)» uguale all'ora dello scatto. |
| D2 | IMPORTA › «Dal Rullino» › un video | Evidenza video con durata; «già presente sul telefono». |
| D3 | In Memo vocali registra un memo › Condividi › «Salva in File»; nell'app IMPORTA › «Da File» › il memo | Evidenza di tipo vocale («Nota vocale importata …»), con durata; data di scatto dai metadati se il file la riporta, altrimenti «assente». Nessuna striscia. |
| D4 | IMPORTA › «Da File» › una foto salvata in File | Evidenza foto, «importata da File». |

## E. Rientro sul PC

| # | Prova | Atteso |
|---|---|---|
| E1 | Crea il pacchetto finale (con almeno: una copia fatta, un'importata, una proseguita senza copia) e salvalo in File | I controlli passano; tra gli avvisi «nessuna copia di sicurezza fuori dall'app (proseguito senza: motivo)». |
| E2 | Sul PC importa il pacchetto (strumenti/importa_rientro.mjs, o dalla sessione delle pratiche) | Le evidenze hanno origine e stato della copia; il validatore segnala solo l'avviso per quella senza copia. |
| E3 | Genera il fascicolo fotografico | Sotto ogni foto: origine e stato della copia; quella senza copia in rosso con il motivo. |

Note: il foglio di condivisione di iOS non dice all'app quale azione hai scelto. Se scegli «Copia» invece di «Salva immagine», la
copia risulta comunque «fatta». La voce Rullino o File di Importa è quella che tocchi tu: iOS non indica la provenienza del file.

## F. Android (app 0.12.1)

Su Android il foglio di condivisione non ha «Salva in galleria»: la copia si **scarica** nella cartella Download, che Galleria
e Google Foto mostrano tra le cartelle del dispositivo. «Condividi…» resta disponibile, per esempio per Drive.

| # | Prova | Atteso |
|---|---|---|
| F1 | Rilievo › FOTO › scatta una foto | Striscia arancione con «Scarica copia nel telefono». |
| F2 | Tocca «Scarica copia nel telefono» | Chrome scarica il file (notifica di download); la striscia sparisce; nel dettaglio «fatta … (scaricata)». |
| F3 | Apri Galleria o Google Foto › cartelle del dispositivo › Download | La foto c'è. |
| F4 | Scatta 3 foto senza copia › tocca «3 copie di sicurezza da fare» | Un solo riquadro «Foto, video, vocali e documenti · 3» con «Scarica le 3 copie nel telefono». |
| F5 | Tocca «Scarica le 3 copie nel telefono» | Se Chrome chiede «Consentire download multipli?», rispondi sì; i 3 file sono in Download; numero a 0. |
| F6 | Registra un vocale › «Scarica copia nel telefono» | Il file audio è in Download (app File › Download). |
| F7 | Dettaglio di un'evidenza › «Condividi… (es. Drive)» | Si apre il foglio di condivisione di Android con le app. |
| F8 | Avvisi bloccanti (prove C1–C7) e Importa (D1–D4) | Stesso comportamento dell'iPhone. |
