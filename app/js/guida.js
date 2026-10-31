// Guida ai requisiti durante il sopralluogo: che cosa chiede ogni requisito e che cosa cercare in campo per dimostrarlo.
// Testo generico, scritto a partire dai modelli ministeriali di perizia e di analisi tecnica (Allegati 1–3) e dalla
// Circolare Agenzia delle Entrate / MiSE n. 4/E del 30 marzo 2017, con alcune indicazioni generali di metodo dello studio.
// Nessun dato di pratiche: quanto ricavato dalle perizie precedenti arriva, per la singola pratica, nel pacchetto di
// andata (guidaRequisiti) preparato sul PC.

export const FONTE = 'Circ. AdE-MiSE 4/E del 30/03/2017 · modelli ministeriali di perizia e di analisi tecnica · metodo dello studio';

export const GUIDA_REQUISITI = {
  ID: {
    norma: 'Il bene deve essere identificato senza ambiguità: costruttore, modello, matricola, anno, configurazione (gruppi e componenti) e sito di messa in funzione, come li riporta l\'attestazione della perizia.',
    cercare: [
      'Il bene per intero nel suo contesto di reparto, prima dei dettagli',
      'Targa CE leggibile, senza riflessi: costruttore, modello, matricola, anno',
      'La stessa matricola mostrata a schermo dal controllo o dal portale del costruttore: lega il bene fisico alla sua identità digitale',
      'Matricola confrontata con fattura e dichiarazione CE di conformità',
      'Gruppi e componenti dichiarati presenti (nastri, robot, sistemi di visione…)',
    ],
    attenzione: ['Matricola diversa tra targa e documenti: è una difformità da registrare, non da correggere a voce'],
  },
  VOCE: {
    norma: 'Il bene deve rientrare in una voce precisa dell\'Allegato A (gruppi II e III) o dell\'Allegato B: la funzione svolta deve corrispondere alla descrizione della voce.',
    cercare: [
      'Funzione effettivamente svolta, osservata durante il lavoro',
      'Lavorazione prima e dopo il passaggio sul bene (foto del prodotto)',
      'Brochure o scheda tecnica che descrive la funzione',
    ],
    attenzione: ['Servono le prove delle parole specifiche della voce, non solo stati e ricette (es. filtri: segnalazione dell\'efficienza filtrante; etichettatura: legame tra etichetta e codice o lotto del prodotto)'],
  },
  DOC: {
    norma: 'La documentazione sostiene costo, identità e requisiti: fattura o contratto di leasing, dichiarazione CE di conformità, manuale, documentazione tecnica del fornitore.',
    cercare: [
      'Originali in risoluzione nativa (PDF dal fornitore, non foto di stampe se evitabile)',
      'Fattura con la descrizione del bene e dei componenti o accessori',
      'Dichiarazione CE che cita il modello e, se possibile, la matricola',
    ],
    attenzione: ['Accessori e dotazioni: oltre il 5% del costo del bene serve dimostrarne la congruità'],
  },
  RO1: {
    norma: 'Controllo per mezzo di CNC e/o PLC. Valgono anche soluzioni equivalenti: PC industriale, microprocessore o logica programmabile con linguaggio standard o proprietario, sistemi con più PLC o DCS.',
    cercare: [
      'Targa o etichetta del controllore: marca, modello, numero di serie',
      'Pagina di sistema del CN o del PLC (versione firmware, configurazione)',
      'Armadio elettrico con CPU e moduli di I/O',
      'Linguaggio di programmazione e programma caricato, se mostrato',
    ],
  },
  RO2: {
    norma: 'Interconnessione ai sistemi informatici di fabbrica con caricamento da remoto di istruzioni e/o part program. Il bene scambia informazioni con sistemi interni (gestionale, MES, pianificazione, progettazione, supervisione) con protocolli documentati, pubblici e riconosciuti (es. TCP/IP, HTTP, MQTT, OPC UA) ed è identificato in rete in modo univoco (es. indirizzo IP).',
    cercare: [
      'In ingresso: un ordine, una ricetta o un programma inviato dal sistema aziendale e visto arrivare sul bene',
      'In uscita: dati di produzione (pezzi, scarti, stati, allarmi) visti arrivare nel sistema aziendale',
      'Un codice di test (ordine o ricetta) messo a verbale, scritto dal sistema a monte in tua presenza e visto arrivare sull\'HMI senza reinserimento manuale',
      'Lo stesso codice ritrovato a valle con quantità, esito e ora: entrambi i lati dello scambio',
      'Indirizzo IP del bene e protocollo usato (pagina di rete del CN o del PLC)',
      'Schema del collegamento, se disponibile',
    ],
    attenzione: [
      'Le «istruzioni» possono essere anche dati di pianificazione o avanzamento, senza avviare la macchina',
      'Per i beni dell\'Allegato A gruppi II–III e dell\'Allegato B è l\'unico requisito: scambio con sistemi interni e/o esterni, su specifiche documentate, pubbliche e riconosciute',
      'Il ping e l\'indirizzo IP da soli non dimostrano l\'interconnessione: sono prove accessorie, la prova è il flusso di dati',
      'Una chiavetta USB o un collegamento solo in manutenzione non dimostrano l\'interconnessione',
    ],
  },
  RO3: {
    norma: 'Integrazione automatizzata in almeno una forma: con la logistica di fabbrica (fisica, cioè movimentazione automatica collegata a magazzino, buffer o altre macchine; oppure informativa, con tracciamento automatico di lotti o pezzi), con la rete di fornitura (scambio di dati con fornitori o clienti) o con altre macchine del ciclo (scambio di dati o segnali M2M).',
    cercare: [
      'Movimentazione automatica in ingresso o uscita (rulliera, robot, AGV, navetta) e a che cosa è collegata',
      'Tracciamento automatico: codici a barre, QR, RFID letti dal bene e registrati dal gestionale',
      'Scambio di segnali o dati con la macchina a monte o a valle',
      'Videate del sistema logistico o del gestionale con movimenti o lotti del bene',
    ],
    attenzione: [
      'Il carico manuale da parte dell\'operatore non è integrazione: serve un flusso automatico o un dato tracciato automaticamente',
      'L\'integrazione solo fisica (tubazioni, distribuzione) non basta: servono dati o segnali scambiati',
    ],
  },
  RO4: {
    norma: 'Interfaccia uomo-macchina semplice e intuitiva, a bordo macchina o in remoto, per monitorare e/o controllare il bene, leggibile anche con i DPI indossati e nelle condizioni del reparto (luce, posizione, sporco).',
    cercare: [
      'Pannello operatore: marca e modello',
      'Schermate principali: stato macchina, allarmi, diagnostica, ricette o parametri',
      'Uso del pannello da parte dell\'operatore con i DPI, nelle condizioni reali del reparto',
      'Livelli di accesso degli utenti, se presenti',
    ],
  },
  RO5: {
    norma: 'Rispondenza ai più recenti parametri di sicurezza, salute e igiene del lavoro: il bene risponde alle norme in vigore, di regola con marcatura CE, dichiarazione CE di conformità e manuale di istruzioni.',
    cercare: [
      'Targa con marcatura CE applicata sul bene',
      'Dichiarazione CE di conformità con il modello (e la matricola) del bene, che citi la Direttiva Macchine e non solo la compatibilità elettromagnetica',
      'Ripari, barriere e dispositivi di sicurezza presenti e funzionanti',
    ],
    attenzione: ['Per gli insiemi di macchine: dichiarazione CE dell\'insieme, non solo delle singole parti'],
  },
  RU1: {
    norma: 'Almeno una tra telemanutenzione (interventi di riparazione o manutenzione da remoto, anche guidando un operatore), telediagnosi (diagnosi automatica dello stato dei componenti) e controllo in remoto (monitoraggio o controllo non a bordo macchina).',
    cercare: [
      'Modulo o software di teleassistenza (router, VPN, piattaforma del costruttore)',
      'Una sessione o un rapporto di intervento da remoto',
      'Procedura aziendale che regola l\'accesso dei fornitori',
      'Contratto di assistenza che prevede il servizio, se esiste',
    ],
    attenzione: [
      'Un software generico di desktop remoto è solo un supporto: meglio il servizio del costruttore con il dispositivo registrato e una sessione reale o il registro degli accessi',
      'Nessuna password o credenziale nelle foto',
    ],
  },
  RU2: {
    norma: 'Monitoraggio continuo delle condizioni di lavoro e dei parametri di processo con sensori, e adattività alle derive: anche solo monitoraggio con arresto del processo quando compaiono anomalie (es. grezzo errato o mancante).',
    cercare: [
      'Parametri monitorati e sensori principali (costruttore e modello)',
      'Una deriva o un allarme e la reazione del bene (correzione, arresto)',
      'Rapporti di produzione con fermi e loro cause',
    ],
    attenzione: ['Gli arresti di sicurezza non sono adattività alle derive di processo: serve una reazione del bene a un parametro di processo'],
  },
  RU3: {
    norma: 'Sistema cyberfisico: modello digitale o simulazione del comportamento del bene nel processo (digital twin), anche fuori macchina o basato su machine learning, usato per analisi, previsione o ottimizzazione.',
    cercare: [
      'Il modello o la simulazione in uso, con licenza e revisione',
      'Schermate del modello confrontato con il funzionamento reale',
    ],
    attenzione: ['Una semplice anteprima grafica del percorso utensile non basta, se non è collegata al comportamento reale del bene'],
  },
};
