#!/usr/bin/env python3
"""Scheletro di perizia giurata e analisi tecnica in Word, generato dal fascicolo della pratica.

Struttura e formule seguono le perizie giurate dello studio (modello: perizia giurata del 24/06/2026,
schema SCHEMI_STANDARD_PERIZIA_E_ANALISI rev. 2 nell'archivio privato del perito), non i modelli ufficiali del 2017.
I testi normativi dipendono dal regime della pratica e stanno in regime_<regime>.json accanto a questo file.

Ogni campo è compilato dal fascicolo (pratica_40.json e beni/Bnn.json) oppure segnato in chiaro:
  [PLACEHOLDER: …]  dato mancante, con la fonte attesa
  [NOTA: …]         istruzione per il perito
  [ev: file, p.X]   rimando all'evidenza
Le conclusioni e le caselle dei requisiti non si spuntano mai da sole: le decide il perito.
Si spuntano solo gli anni di messa in funzione e di interconnessione quando la data è documentata.

Uso:
  python strumenti/word/scheletro_perizia.py <cartella pratica> [--bene B01] [--perito perito.json] [--uscita cartella] [--data AAAA-MM-GG]
Senza --uscita scrive in <cartella pratica>/perizia/. Senza --perito i dati del perito restano segnaposto.
Il file del perito (privato, mai nel repository) ha i campi: nome, titolo, albo, intestazione, tribunale, luogo,
natoA, natoIl, codiceFiscale, residenza, partitaIva, alboVerbale, numeroAlbo, iscrizioneData, documentoIdentita.
Richiede Python 3 con python-docx e Node.js (per leggere la guida ai requisiti dell'app).
"""

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

RADICE = Path(__file__).resolve().parents[2]
GRIGIO = RGBColor(0x59, 0x59, 0x59)
ROSSO = RGBColor(0xB0, 0x24, 0x18)
EVENTI = {
    'ordine': ('ordine',), 'consegna': ('ddt_consegna',), 'installazione': ('installazione',), 'collaudo': ('collaudo_sat',),
    'funzione': ('entrata_in_funzione',), 'interconnessione': ('interconnessione_dichiarata', 'prima_prova_scambio'),
    'prova': ('prima_prova_scambio',), 'verifica': ('verifica_perito',),
}
TIPI_DOC = {
    'offerta': 'Offerta', 'ordine': "Conferma d'ordine", 'contratto_leasing': 'Contratto di leasing', 'fattura_acconto': 'Fattura di acconto',
    'fattura': 'Fattura', 'nota_credito': 'Nota di credito', 'altro': 'Documento',
}


# ---------------------------------------------------------------- dati

def leggi_json(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def guida_requisiti():
    codice = "import('./app/js/guida.js').then(m => console.log(JSON.stringify(m.GUIDA_REQUISITI)))"
    r = subprocess.run(['node', '--input-type=module', '-e', codice], cwd=RADICE, capture_output=True, text=True, encoding='utf-8', check=True)
    return json.loads(r.stdout)


def ph(testo):
    return f'[PLACEHOLDER: {testo}]'


def rif_ev(fonti):
    return ' '.join(f"[ev: {f.get('file') or f.get('idEvidenza')}{', ' + f['posizione'] if f.get('posizione') else ''}]" for f in fonti or [])


def bene_di(codice):
    return codice.split('.')[0]


def data_it(iso):
    if not iso:
        return None
    parti = iso[:10].split('-')
    return '/'.join(reversed(parti)) if len(parti) in (2, 3) else iso


def euro(v, simbolo=True):
    if v is None:
        return ph('importo')
    s = f"{v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    return f'€ {s}' if simbolo else s


def percento(parte, tutto):
    return f'{parte / tutto * 100:.1f}'.replace('.', ',') + '%'


def maiuscola(t):
    return t[:1].upper() + t[1:]


def testo_regime(t, **campi):
    """{esito: A / B} diventa un segnaposto che decide il perito; {campo} prende il valore passato."""
    t = re.sub(r'\{esito: ([^}]*)\}', lambda m: ph(m.group(1)), t)
    return re.sub(r'\{(\w+)\}', lambda m: str(campi.get(m.group(1), m.group(0))), t)


def voce(scheda, sezione, campo, cosa):
    """Valore agli atti con fonte ed esito in campo; segnaposto se manca."""
    v = ((scheda.get('datiAgliAtti') or {}).get(sezione) or {}).get(campo)
    if not v or v.get('nonApplicabile') and v.get('valore') is None:
        return 'non applicabile' if v and v.get('nonApplicabile') else ph(f'{cosa} (documenti del bene)')
    valore = v.get('valore')
    vc = v.get('verificaCampo') or {}
    if vc.get('esito') == 'corretto' and vc.get('valoreRilevato'):
        valore = f"{vc['valoreRilevato']} (rilevato in campo; agli atti: {v.get('valore')})"
    if valore is None:
        return ph(f'{cosa}: non indicato nei documenti')
    testo = f'{valore} {rif_ev(v.get("fonti"))}'.strip()
    if vc.get('esito') == 'difforme':
        testo += f" [NOTA: DIFFORMITÀ in campo: {vc.get('valoreRilevato', '')} — la bozza non è giurabile finché non è risolta]"
    elif v.get('stato') != 'documentato':
        testo += f" [NOTA: dato {v.get('stato', 'da verificare').replace('_', ' ')}]"
    return testo


def numero_voce(cl):
    """A11_05 → (1, '5'); la tredicesima voce del Gruppo I è la «R» (ammodernamento e revamping)."""
    m = re.match(r'^A(\d)\d_(\d{2})$', cl.get('codiceVoce') or '')
    if not m:
        return None, None
    n = int(m.group(2))
    return int(m.group(1)), 'R' if m.group(1) == '1' and n == 13 else str(n)


class Pratica:
    def __init__(self, cartella):
        self.cartella = Path(cartella)
        self.p = leggi_json(self.cartella / 'pratica_40.json')
        self.schede = {b['codice']: leggi_json(self.cartella / b['scheda']) for b in self.p['beni']}

    def eventi(self, codice, chiave):
        tipi = EVENTI[chiave]
        righe = [t for t in self.p['timeline'] if t['evento'] in tipi and codice in [bene_di(b) for b in t['beni']]]
        return sorted(righe, key=lambda t: t['data']['valore'])

    def evento(self, codice, chiave, cosa):
        righe = self.eventi(codice, chiave)
        if not righe:
            return ph(f'data di {cosa} (timeline)')
        t = righe[0]
        return f"{data_it(t['data']['valore'])} ({t['stato']}) {rif_ev(t.get('prove'))}".strip()

    def evidenze(self, codice, requisito, componenti=False):
        """Evidenze valide del bene per il requisito; con componenti=True anche quelle dei componenti (B01.1, B01.2…)."""
        dentro = (lambda b: bene_di(b) == codice) if componenti else (lambda b: b == codice)
        return [e for e in self.p['evidenze'] if e.get('stato', 'valida') == 'valida' and any(dentro(b) for b in e['beni']) and requisito in e['requisiti']]

    def riscontri(self, codice, requisito):
        return [r for r in self.p['riscontriDiretti'] if r['bene'] == codice and r['requisito'] == requisito]

    def dichiarazioni(self, codice, requisito):
        return [d for d in self.p['dichiarazioniTerzi'] if codice in d['beni'] and d['requisito'] == requisito]

    def azioni(self, codice, requisito=None):
        return [a for a in self.p['azioni'] if a['stato'] == 'aperta' and codice in [bene_di(b) for b in a['beni']] and (requisito is None or a.get('requisito') == requisito)]

    def ultima_verifica(self):
        eseguiti = [s for s in self.p['sopralluoghi'] if s['stato'] == 'eseguito']
        return data_it(max(s['data'] for s in eseguiti)) if eseguiti else None


# ---------------------------------------------------------------- Word

class Doc:
    def __init__(self, titolo_piede, perito):
        self.d = Document()
        st = self.d.styles['Normal']
        st.font.name = 'Arial'
        st.font.size = Pt(10)
        st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')
        st.paragraph_format.space_after = Pt(4)
        for nome, dim in (('Heading 1', 13), ('Heading 2', 11.5), ('Heading 3', 10.5), ('Heading 4', 10), ('Title', 17)):
            s = self.d.styles[nome]
            s.font.name = 'Arial'
            s.font.size = Pt(dim)
            s.font.color.rgb = RGBColor(0x1F, 0x1F, 0x1F)
            s.font.italic = False
            f = s.element.rPr.rFonts
            f.set(qn('w:eastAsia'), 'Arial')
            # i titoli di Word usano il carattere del tema: si toglie perché valga Arial
            for attr in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
                f.attrib.pop(qn(attr), None)
        sez = self.d.sections[0]
        sez.orientation = WD_ORIENT.PORTRAIT
        sez.page_width, sez.page_height = Cm(21), Cm(29.7)
        sez.left_margin = sez.right_margin = sez.bottom_margin = Cm(2.0)
        sez.top_margin = Cm(2.3)
        # intestazione su due righe, come nelle perizie giurate: «Ing. NOME» / «Iscrizione Albo …»
        righe = (perito.get('intestazione') or ph('intestazione del perito (file del perito)')).split(' | ')
        for i, riga in enumerate(righe):
            par = sez.header.paragraphs[0] if i == 0 else sez.header.add_paragraph()
            r = par.add_run(riga)
            r.font.size = Pt(9 if i == 0 else 8)
            r.bold = i == 0
        piede = sez.footer.paragraphs[0]
        piede.paragraph_format.tab_stops.add_tab_stop(Cm(17), WD_TAB_ALIGNMENT.RIGHT)
        r = piede.add_run(titolo_piede + '\tPag. ')
        r.font.size = Pt(8)
        self._campo(piede, 'PAGE')
        piede.add_run(' di ').font.size = Pt(8)
        self._campo(piede, 'NUMPAGES')

    @staticmethod
    def _campo(par, istruzione, testo=None):
        run = par.add_run()
        run.font.size = Pt(8)
        parti = [('begin', None), (None, istruzione), ('separate', None)] + ([('testo', testo)] if testo else []) + [('end', None)]
        for tipo, valore in parti:
            if tipo == 'testo':
                el = OxmlElement('w:t')
                el.text = valore
            elif tipo:
                el = OxmlElement('w:fldChar')
                el.set(qn('w:fldCharType'), tipo)
            else:
                el = OxmlElement('w:instrText')
                el.set(qn('xml:space'), 'preserve')
                el.text = valore
            run._r.append(el)

    def p(self, testo='', grassetto=False, centro=False, corsivo=False, dim=None, destra=False):
        par = self.d.add_paragraph()
        self._testo(par, testo, grassetto, corsivo, dim)
        if centro:
            par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif destra:
            par.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        elif len(testo) > 90:
            par.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        return par

    def _testo(self, par, testo, grassetto=False, corsivo=False, dim=None):
        # i segnaposto in rosso, le note in grigio corsivo: si vedono subito nella bozza
        for pezzo in re.split(r'(\[PLACEHOLDER:[^\]]*\]|\[NOTA:[^\]]*\])', testo):
            if not pezzo:
                continue
            r = par.add_run(pezzo)
            r.bold, r.italic = grassetto, corsivo
            if dim:
                r.font.size = Pt(dim)
            if pezzo.startswith('[PLACEHOLDER'):
                r.font.color.rgb = ROSSO
            elif pezzo.startswith('[NOTA'):
                r.font.color.rgb, r.italic = GRIGIO, True

    def h(self, testo, livello=1):
        return self.d.add_heading(testo, livello)

    def elenco(self, righe, stile='List Bullet'):
        for t in righe:
            par = self.d.add_paragraph(style=stile)
            self._testo(par, t)
            if len(t) > 90:
                par.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    def casella(self, testo, spuntata=False):
        self.p(f"{'☒' if spuntata else '☐'}  {testo}")

    def tabella(self, righe, intestazione=None, larghezze=None, bordi=True, grassetto_prima=False):
        t = self.d.add_table(rows=0, cols=len(righe[0] if righe else intestazione))
        if bordi:
            t.style = 'Table Grid'
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for i, riga in enumerate(([intestazione] if intestazione else []) + righe):
            celle = t.add_row().cells
            for j, valore in enumerate(riga):
                celle[j].paragraphs[0].text = ''
                testa = bool(intestazione) and i == 0 or grassetto_prima and j == 0
                self._testo(celle[j].paragraphs[0], str(valore), grassetto=testa, dim=9.5)
                if larghezze:
                    celle[j].width = Cm(larghezze[j])
        if larghezze:
            # oltre alle celle serve la griglia della tabella: LibreOffice legge solo quella
            t.autofit = False
            for col, w in zip(t.columns, larghezze):
                col.width = Cm(w)
        self.d.add_paragraph()
        return t

    def riquadro(self, testo):
        t = self.d.add_table(rows=1, cols=1)
        t.style = 'Table Grid'
        self._testo(t.rows[0].cells[0].paragraphs[0], testo, grassetto=True, dim=9)
        self.d.add_paragraph()

    def sommario(self):
        self._campo(self.d.add_paragraph(), 'TOC \\o "1-4" \\h \\z \\u', 'Sommario da aggiornare in Word (tasto destro → Aggiorna campo)')

    def salto(self):
        self.d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    def salva(self, percorso):
        self.d.save(percorso)


# ---------------------------------------------------------------- contenuti comuni

def nome_perito(perito):
    """«Mario Rossi» → «Mario ROSSI»: si assume che l'ultima parola del nome sia il cognome."""
    if not perito.get('nome'):
        return None
    *nomi, cognome = perito['nome'].split()
    return ' '.join(nomi + [cognome.upper()])


def dati_comuni(pr, sc, perito, oggi):
    c = pr.p['cliente']
    el = sc.get('elaborato') or {}
    rev = el.get('revisione', 0)
    stato = el.get('stato', 'bozza')
    return {
        'cliente': c['ragioneSociale'], 'bene': sc['denominazione'], 'rev': rev, 'stato': stato,
        'bozza': stato in ('bozza', 'bozza_sospesa'), 'data': data_it(el.get('data')) or oggi,
        'sedeLegale': c.get('sedeLegale') or ph('sede legale (visura camerale)'),
        'piva': c.get('partitaIva') or ph('partita IVA (visura camerale)'),
        'legale': (c.get('legaleRappresentante') or {}).get('nome') or ph('legale rappresentante (visura camerale)'),
        'carica': (c.get('legaleRappresentante') or {}).get('carica') or ph('carica del legale rappresentante'),
        'perito': f"{perito.get('titolo') or ''} {perito['nome']}".strip() if perito.get('nome') else ph('nome del perito (file del perito)'),
        'tribunale': perito.get('tribunale') or ph('tribunale (file del perito)'),
        'luogo': perito.get('luogo') or ph('luogo (file del perito)'),
        'giuramento': data_it(((el.get('giuramento') or {}).get('data'))) or ph('data del giuramento'),
    }


def riquadro_bozza(doc, k):
    if k['bozza']:
        sospesa = ' SOSPESA' if k['stato'] == 'bozza_sospesa' else ''
        doc.riquadro(f"BOZZA{sospesa} DI LAVORO – non giurabile allo stato. Revisione {k['rev']} del {k['data']}, generata dal fascicolo. "
                     'I segnaposto in rosso sono dati mancanti; i riferimenti [ev: …] indicano il documento di supporto e vanno rimossi '
                     'nella versione definitiva; le note in grigio sono note di istruttoria da rimuovere prima della firma.')


def fornitore(sc):
    f = sc.get('fornitore')
    return f"{f['nome']} ({f['ruolo']}) {rif_ev(f.get('fonti'))}".strip() if f else ph('fornitore o integratore (ordine, fattura)')


def sito(pr, sc):
    return sc.get('unitaLocale') or pr.p['cliente']['sedeIntervento'] + (f" – {sc['ubicazione']}" if sc.get('ubicazione') else '')


def righe_bene(pr, sc, k):
    """Tabella del bene della perizia giurata, ripresa identica nelle conclusioni dell'analisi tecnica."""
    descr = sc['funzione'] + ('; componenti: ' + ', '.join(c['denominazione'] for c in sc['componenti']) if sc.get('componenti') else '')
    return [
        ['PRODUTTORE', voce(sc, 'identita', 'costruttore', 'costruttore')],
        ['MODELLO', voce(sc, 'identita', 'modello', 'modello')],
        ['MATRICOLA', voce(sc, 'identita', 'matricola', 'matricola')],
        ['DESCRIZIONE', descr],
        ['ACQUISTATO DA', f"{k['cliente']} – {k['sedeLegale']} – P.IVA {k['piva']}"],
        ['FORNITORE', fornitore(sc)],
        ['SITO DI MESSA IN FUNZIONE', sito(pr, sc)],
    ]


def documenti_ordine(sc):
    return [d for d in (sc.get('costi') or {}).get('documenti', []) if d['tipo'] in ('offerta', 'ordine', 'contratto_leasing')]


def descrivi_doc(d):
    return f"{TIPI_DOC.get(d['tipo'], 'Documento')} n. {d['numero']} del {data_it(d['data'])}{' – ' + d['emittente'] if d.get('emittente') else ''}"


# ---------------------------------------------------------------- perizia

def caselle_anni(regime, righe, cosa):
    """Anni del regime con la casella spuntata solo se la data è documentata; altrimenti segnaposto."""
    documentate = [t for t in righe if t['stato'] == 'documentata']
    anno = int(documentate[0]['data']['valore'][:4]) if documentate else None
    caselle = '   '.join(f"{'☒' if a == anno else '☐'} {a}" for a in regime['anni'])
    if documentate:
        nota = rif_ev(documentate[0].get('prove'))
        if anno not in regime['anni']:
            nota += f' [NOTA: anno {anno} fuori dalle annualità del regime]'
    elif righe:
        nota = ph(f"anno di {cosa} documentato – la data dichiarata del {data_it(righe[0]['data']['valore'])} non è allo stato supportata da evidenze")
    else:
        nota = ph(f'anno di {cosa} (timeline)')
    return f'{caselle}   {nota}'


def perizia(pr, codice, perito, regime, oggi):
    sc = pr.schede[codice]
    k = dati_comuni(pr, sc, perito, oggi)
    cl = sc['classificazione']
    piede = f"Perizia 4.0 – {k['cliente']} | Bene {k['bene'].upper()}{' – BOZZA' if k['bozza'] else ''} rev. {k['rev']} del {k['data']}"
    doc = Doc(piede, perito)
    riquadro_bozza(doc, k)
    doc.p('PERIZIA GIURATA', grassetto=True, centro=True, dim=15)
    chi = f"{perito.get('titolo') or ''} {nome_perito(perito)}".strip() if perito.get('nome') else k['perito']
    nato = f"nato a {perito['natoA']} il {data_it(perito['natoIl'])}" if perito.get('natoA') and perito.get('natoIl') else f"nato a {ph('luogo e data di nascita del perito')}"
    doc.p(f"Il sottoscritto {chi}, {nato}, C.F. {perito.get('codiceFiscale') or ph('codice fiscale')}, residente in {perito.get('residenza') or ph('residenza')}, "
          f"iscritto all'{perito.get('albo') or ph('ordine professionale e numero di iscrizione')}, in esecuzione dell'incarico conferito dall'impresa:")
    doc.p(k['cliente'].upper(), grassetto=True, centro=True, dim=12)
    doc.p(k['sedeLegale'], centro=True)
    doc.p(f"P.IVA: {k['piva']}", centro=True)

    doc.p('VISTI', grassetto=True, centro=True)
    doc.elenco(regime['visti'])
    doc.p('[NOTA: elenco dei VISTI da verificare per regime e annualità della pratica]')

    doc.p('PREMESSO', grassetto=True, centro=True)
    doc.p(f"che la società sopra menzionata, in persona del legale rappresentante {k['legale']}, {k['carica']}, dichiara:")
    costi = sc.get('costi') or {}
    fonti_costo = [d['fonte'] for d in costi.get('documenti', []) if d.get('fonte')]
    valore = testo_regime(regime['premessoValore'], valore=euro(costi.get('valoreComplessivo'), simbolo=False))
    doc.elenco(regime['premesso'] + [f'{valore} {rif_ev(fonti_costo)}'.strip()])

    doc.p('VISTO', grassetto=True, centro=True)
    doc.p('il bene in valutazione:')
    doc.tabella(righe_bene(pr, sc, k), larghezze=[5.5, 11.5], bordi=False, grassetto_prima=True)
    verifica = pr.ultima_verifica() or ph('data del sopralluogo / verifica finale')
    doc.p(f"così come risultante dalle attività di verifica ultimate in data {verifica}, che si assume come data di validazione della "
          'configurazione, delle dotazioni e dello stato dell’arte del bene in esame, ' + testo_regime(regime['inclusione'], allegato=cl['allegato']))

    doc.p('DICHIARA', grassetto=True, centro=True)
    doc.p('[NOTA: le caselle sono lasciate da compilare: vanno spuntate solo ad esito positivo della matrice RO/RU dell’Analisi Tecnica; la classificazione è indicata come proposta]')
    _, num = numero_voce(cl)
    if cl['allegato'] == 'A':
        g = regime['gruppi'][str(cl['gruppo'])]
        proposta = f"Gruppo {g['romano']}, voce {num or ph('voce numerata (es. A11_01)')} – {cl['voce']}"
        doc.p(f"☐  che il bene strumentale rientra tra i beni materiali dell’ALLEGATO A [NOTA: voce proposta: {proposta}] {rif_ev(cl.get('fonti'))}".rstrip())
        for gr in regime['gruppi'].values():
            voci = [str(i) for i in range(1, gr['voci'] + 1)] + (['R'] if gr['revamping'] else [])
            doc.p(f"Gruppo {gr['romano']} – {gr['voci']} voci{' + R' if gr['revamping'] else ''}:   " + '   '.join(f'☐ {v}' for v in voci))
    else:
        doc.p(f"☐  che il bene rientra tra i beni immateriali dell’ALLEGATO B [NOTA: voce proposta: {cl['voce']}] {rif_ev(cl.get('fonti'))}".rstrip())
        doc.p(ph('voci dell’Allegato B da riportare dal testo vigente'))
    if cl['profilo'] == 'completo':
        doc.p('che il bene strumentale soddisfa i seguenti 5 requisiti obbligatori:')
        for r, t in regime['obbligatori'].items():
            doc.casella(f'{r.replace("RO", "O")}. {t};')
        doc.p('che il bene strumentale soddisfa i seguenti requisiti ulteriori (almeno 2 di 3):')
        for r, t in regime['ulteriori'].items():
            doc.casella(f'{r.replace("RU", "U")}. {t};')
    inoltre = ', inoltre,' if cl['profilo'] == 'completo' else ''
    doc.casella(f"che il bene strumentale soddisfa{inoltre} il requisito obbligatorio di INTERCONNESSIONE in quanto {regime['interconnessioneRidotto'].removeprefix('il bene ')};")
    doc.p('che il bene strumentale è stato MESSO IN FUNZIONE nel:   ' + caselle_anni(regime, pr.eventi(codice, 'funzione'), 'messa in funzione'))
    prove = pr.eventi(codice, 'prova') or pr.eventi(codice, 'interconnessione')
    doc.p('che il bene strumentale è stato INTERCONNESSO nel:   ' + caselle_anni(regime, prove, 'interconnessione') +
          ' [NOTA: mai anteriore alla prima prova datata dello scambio]')
    ver = [t for t in pr.eventi(codice, 'verifica') if t['stato'] == 'documentata']
    doc.p(f"che l’interconnessione è stata verificata in data {data_it(ver[0]['data']['valore']) if ver else ph('data verifica interconnessione')}")

    doc.p('E DICHIARA INOLTRE', grassetto=True, centro=True)
    doc.elenco(regime['dichiaraInoltre'])
    doc.p(f"{k['luogo']}, {k['data']}")
    doc.p('Timbro e firma del tecnico incaricato', destra=True)
    doc.p(k['perito'], destra=True)
    doc.p('___________________________________', destra=True)
    doc.salto()
    verbale(doc, sc, k, perito)
    return doc, k


def verbale(doc, sc, k, perito):
    """Verbale di asseverazione di perizia stragiudiziale, sul modulo del Tribunale."""
    g = (sc.get('elaborato') or {}).get('giuramento') or {}
    doc.p(f"R.G. V.G. N° {g.get('rgvg') or '________ / ______'}        CRON. N° {g.get('cronologico') or '________'}", destra=True)
    doc.p(k['tribunale'].upper() if perito.get('tribunale') else k['tribunale'], grassetto=True, centro=True, dim=12)
    doc.p('Verbale di asseverazione di perizia stragiudiziale', grassetto=True, centro=True)
    ufficio = ' '.join(w.lower() if w.lower() in ('di', 'del', 'della') else w.capitalize() for w in k['tribunale'].split()) if perito.get('tribunale') else k['tribunale']
    if perito.get('nome'):
        *nomi, cognome = perito['nome'].upper().split()
        comparso = f"il signor {cognome} {' '.join(nomi)}"
    else:
        comparso = f"il signor {ph('COGNOME NOME del perito')}"
    nascita = f"nato a {perito['natoA'].upper()} il {data_it(perito['natoIl'])}" if perito.get('natoA') and perito.get('natoIl') else f"nato a {ph('luogo e data di nascita')}"
    doc.p(f"In data {k['giuramento']}, nell’Ufficio Asseverazioni del {ufficio}, avanti al sottoscritto Direttore/Funzionario Giudiziario/Cancelliere, "
          f"è personalmente comparso {comparso} {nascita}, residente a {(perito.get('residenza') or '').upper() or ph('residenza')}, "
          f"identificato con il seguente documento {perito.get('documentoIdentita') or ph('estremi del documento d’identità')}, il quale, consapevole "
          'della responsabilità penale che il rilascio di dichiarazioni mendaci comporta, ai sensi degli artt. 46 e 76 del D.P.R. 445/2000 e che la '
          'falsa attestazione o dichiarazione ad un P.U. sull’identità o su qualità personali proprie costituisce reato ai sensi dell’art. 495 c.p.,')
    doc.p('dichiara', centro=True)
    doc.elenco([f"di essere iscritto nell’albo professionale degli {perito.get('alboVerbale') or ph('ALBO (es. INGEGNERI DELLA PROVINCIA DI …)')} "
                f"con il n. {perito.get('numeroAlbo') or ph('numero')} del {data_it(perito.get('iscrizioneData')) or ph('data di iscrizione')};"])
    doc.p(f"Il perito esibisce l’elaborato peritale da lui effettuato in data {k['data']}, nell’interesse dell’impresa {k['cliente'].upper()}, "
          'dichiarando pertanto di non essere la parte interessata e di non essere parente o affine della stessa, e chiede di poterlo asseverare con la formula di giuramento.')
    doc.p('Ammonito ai sensi dell’art. 193 c.p.c. e dell’art. 483 c.p., consapevole che la falsa attestazione giurata dei fatti riportati in perizia '
          'costituisce reato, il comparente perito presta il giuramento ripetendo la formula che segue:')
    doc.p('“Giuro di avere svolto l’incarico affidatomi bene e fedelmente al solo scopo di far conoscere la verità”.', grassetto=True, centro=True)
    doc.p('Si raccoglie il presente verbale di asseverazione di perizia stragiudiziale per gli usi consentiti dalla legge. Letto, confermato e sottoscritto.')
    doc.p()
    doc.tabella([['IL PERITO', 'IL FUNZIONARIO'], ['', '']], larghezze=[8.5, 8.5], bordi=False)


# ---------------------------------------------------------------- analisi tecnica

def sezione_requisito(doc, pr, codice, req, titolo, num, guida, tipo, nota=''):
    """Un requisito: «Descrizione ed evidenze» e «Conclusione», chiusa da «Il bene soddisfa / NON soddisfa il requisito …»."""
    sigla = f'{req} ' if req.startswith('R') else ''
    doc.h(f'{num} {sigla}{maiuscola(titolo)}', 3)
    doc.h(f'{num}.1. Descrizione ed evidenze', 4)
    ev = pr.evidenze(codice, req, componenti=True)
    rd = pr.riscontri(codice, req)
    dt_ = pr.dichiarazioni(codice, req)
    if ev:
        doc.p('Sono agli atti le seguenti evidenze:')
        righe = []
        for e in ev:
            fatti = '; '.join(f['fatto'] for f in e.get('contenutoLetto', []))
            righe.append(f"{e.get('descrizione') or e['tipo']}{' – ' + fatti if fatti else ''} [ev: {Path(e['file']).name}]")
        doc.elenco(righe)
    if rd:
        doc.p('Riscontri diretti del sottoscritto in sopralluogo:')
        doc.elenco([f"{r['frase']} [ev: {', '.join(r['evidenze'])}]" for r in rd])
    if dt_:
        doc.p('Dichiarazioni di terzi:')
        doc.elenco([f"{d['persona']} ({d['ruolo']}), {d['forma']}: «{d['contenuto']}» – riscontro oggettivo: {d['riscontroOggettivo']['esito']}" for d in dt_])
    if not (ev or rd or dt_):
        g = guida.get(req) or {}
        doc.p(ph('descrizione ed evidenze del requisito: nessuna nel fascicolo'))
        if g.get('cercare'):
            doc.p('[NOTA: da acquisire, ad esempio: ' + '; '.join(g['cercare'][:3]) + ']')
    doc.h(f'{num}.2. Conclusione {sigla}'.rstrip(), 4)
    doc.p(f"Il requisito {sigla}di {titolo} risulta {ph('dimostrato / parzialmente dimostrato / non dimostrato')} sulla base delle evidenze sopra richiamate.")
    doc.p(ph(f'Il bene soddisfa / NON soddisfa il requisito {tipo} {sigla}'.rstrip()) + nota, grassetto=True)
    lacune = pr.azioni(codice, req)
    if lacune:
        doc.p('[NOTA: Integrazioni: ' + '; '.join(f"{a['cosaServe']} ({a['priorita']})" for a in lacune) + ']')


def allegati(pr, sc, codice, k):
    """Elenco puntuale degli allegati dai documenti di costo e di consegna del fascicolo."""
    costi = sc.get('costi') or {}
    voci = [descrivi_doc(d) for d in documenti_ordine(sc)]
    if not voci:
        ordine = pr.eventi(codice, 'ordine')
        voci.append(ph("conferma d'ordine / offerta accettata" + (f" (ordine {ordine[0]['stato']} del {data_it(ordine[0]['data']['valore'])})" if ordine else '')))
    # senza costi propri del bene si ripiegano i documenti di costo registrati nel fascicolo (es. fattura comune a più beni)
    voci += ([descrivi_doc(d) for d in costi.get('documenti', []) if d['tipo'] in ('fattura_acconto', 'fattura', 'nota_credito', 'altro')]
             or [e['descrizione'] for e in pr.evidenze(codice, 'DOC') if e['tipo'] == 'documento'] or [ph('fatture di acconto e saldo')])
    voci += [f"Distinta di bonifico – {a.get('documento') or 'acconto'} del {data_it(a['data'])}" for a in costi.get('acconti', [])]
    voci.append(ph('distinte di bonifico del saldo'))
    for chiave, cosa in (('consegna', 'Documento di trasporto'), ('installazione', 'Verbale di installazione'), ('collaudo', 'Verbale di collaudo')):
        righe = [t for t in pr.eventi(codice, chiave) if t['stato'] == 'documentata']
        voci += [f"{cosa} del {data_it(t['data']['valore'])} {rif_ev(t.get('prove'))}".strip() for t in righe]
        if not righe and chiave != 'installazione':
            voci.append(ph(f'{cosa.lower()} (timeline: {EVENTI[chiave][0]})'))
    voci += [e['descrizione'] for e in pr.evidenze(codice, 'RO5', componenti=True) if e['tipo'] == 'documento'] or [ph('dichiarazioni CE di conformità')]
    voci += [e['descrizione'] for e in pr.evidenze(codice, 'RO2') if e['tipo'] == 'documento'] or [ph('evidenze di interconnessione')]
    voci.append(f"Documento d’identità del perito {k['perito']}")
    return [f'All_{i}: {v}' for i, v in enumerate(voci, 1)]


def costo(doc, sc, regime):
    costi = sc.get('costi') or {}
    val = costi.get('valoreComplessivo')
    fatture = [d for d in costi.get('documenti', []) if d['tipo'] not in ('offerta', 'ordine')]
    doc.p('Sulla base della documentazione prodotta e delle dichiarazioni rese dall’impresa risulta che il valore complessivo dell’investimento relativo al '
          f"bene oggetto di perizia è pari a {euro(val)}" + (', come da ' + '; '.join(descrivi_doc(d) for d in fatture) if fatture else '') + '.')
    if costi.get('documenti'):
        doc.tabella([[f"{TIPI_DOC.get(d['tipo'], d['tipo'])} {d['numero']}", data_it(d['data']), f"{d['descrizione']} {rif_ev([d['fonte']] if d.get('fonte') else [])}".strip(),
                      euro(d['imponibile'], simbolo=False)] for d in costi['documenti']],
                    intestazione=['Documento', 'Data', 'Descrizione', 'Imponibile €'], larghezze=[3.8, 2.4, 8, 2.8])
    else:
        doc.p(ph('documenti di costo: tipo, numero, data, descrizione, imponibile (fatture, ordine, leasing)'))
    ac = regime.get('acconto')
    if costi.get('acconti') and ac:
        entro = [a for a in costi['acconti'] if a['data'] <= ac['dataLimite']]
        tot = sum(a['importo'] for a in entro)
        quota = f", pari al {percento(tot, val)} del costo di {euro(val)}" if val else ''
        elenco = ', '.join(f"{euro(a['importo'])} del {data_it(a['data'])}" for a in entro) or 'nessuno'
        doc.p(f"Acconti versati entro il {data_it(ac['dataLimite'])}: {euro(tot)}{quota} ({elenco}); soglia {ac['soglia'] * 100:.0f}%. [NOTA: {ac['nota']}]")
    if costi.get('accessori') and val:
        acc = sum(a['importo'] for a in costi['accessori'])
        doc.p(f"Accessori e dotazioni: {euro(acc)}, pari al {percento(acc, val)} del costo del bene.")
    dl = costi.get('dicituraLegge')
    if dl and dl['presente']:
        doc.p(f"La fattura reca la dicitura «{dl.get('testo', '')}» {rif_ev([dl['fonte']] if dl.get('fonte') else [])}".strip() + '.')
    else:
        doc.p('Dicitura di legge in fattura: ' + ph('presente / assente'))
    doc.p(regime['notaAccessori'])
    doc.p(regime['notaMise']['intro'])
    doc.elenco(regime['notaMise']['punti'])


def analisi(pr, codice, perito, regime, guida, oggi):
    sc = pr.schede[codice]
    k = dati_comuni(pr, sc, perito, oggi)
    cl = sc['classificazione']
    ridotto = cl['profilo'] == 'ridotto'
    g = regime['gruppi'].get(str(cl.get('gruppo'))) if cl['allegato'] == 'A' else None
    piede = f"ANALISI TECNICA a corredo Perizia 4.0 – {k['cliente']} | Bene {k['bene'].upper()}{' – BOZZA' if k['bozza'] else ''} rev. {k['rev']} del {k['data']}"
    doc = Doc(piede, perito)

    # copertina: impresa, titolo, bene con ordine, matricola, fornitore e costruttore; niente logo
    doc.p(k['cliente'].upper(), grassetto=True, centro=True, dim=14)
    doc.p(k['sedeLegale'], centro=True)
    doc.p(f"P.IVA: {k['piva']}", centro=True)
    doc.p()
    doc.p('ANALISI TECNICA', grassetto=True, centro=True, dim=20)
    doc.p(f"a corredo della perizia giurata ex {regime['riferimentoAnalisi']}", centro=True)
    doc.p()
    doc.p('BENE MATERIALE' if cl['allegato'] == 'A' else 'BENE IMMATERIALE', grassetto=True, centro=True, dim=12)
    doc.p('composto da:', centro=True)
    doc.p(f"N. 1 {sc['denominazione']}", grassetto=True, centro=True, dim=12)
    ordini = documenti_ordine(sc)
    ordine = '; '.join(descrivi_doc(d) for d in ordini) or ph("conferma d'ordine / offerta accettata (numero e data)")
    doc.p(f"{ordine} – Matricola {voce(sc, 'identita', 'matricola', 'matricola')}", centro=True)
    doc.p(f"Fornitore {sc['fornitore']['nome'] if sc.get('fornitore') else ph('fornitore')}", centro=True)
    doc.p(f"Costruttore {voce(sc, 'identita', 'costruttore', 'costruttore')}", centro=True)
    doc.p()
    doc.p('Beni funzionali alla trasformazione tecnologica e digitale delle imprese secondo il modello «Industria 4.0»', centro=True, corsivo=True)
    doc.p(f"Allegato {cl['allegato']} {regime['allegatiLegge']}", centro=True)
    doc.p('*** *** ***', centro=True)
    perito_giurato = f"{nome_perito(perito).upper()} – {perito.get('albo') or ph('ordine e numero di iscrizione')}" if perito.get('nome') else k['perito']
    giur = (sc.get('elaborato') or {}).get('giuramento') or {}
    righe = [['Perito giurato:', perito_giurato], ['Data giuramento:', k['giuramento']], ['Ente asseveratore:', giur.get('tribunale') or k['tribunale']]]
    if giur.get('rgvg') or giur.get('cronologico'):
        righe.append(['Verbale di giuramento:', f"R.G. V.G. N° {giur.get('rgvg') or ph('R.G. V.G.')} – Cron. N° {giur.get('cronologico') or ph('cronologico')}"])
    doc.tabella(righe,
                larghezze=[4.5, 12.5], bordi=False, grassetto_prima=True)
    riquadro_bozza(doc, k)
    doc.salto()
    doc.h('Sommario', 2)
    doc.sommario()
    doc.salto()

    doc.h('1. ANALISI TECNICA – REQUISITI', 1)
    if ridotto:
        doc.h(f"1.1 {g['titolo'] + ' – Allegato A gruppo ' + str(cl['gruppo']) if g else 'Beni immateriali – Allegato B'}", 2)
        doc.p(regime['introRidotto'])
        doc.p(f"il bene è interconnesso perché {regime['interconnessioneRidotto'].removeprefix('il bene ')}.")
        doc.p(regime['spiegazioni']['RO2'])
    else:
        doc.h(f"1.1 {g['titolo']} – Allegato A gruppo 1", 2)
        doc.h('1.1.1 Requisiti obbligatori', 3)
        doc.p(regime['introObbligatori'])
        doc.elenco([f'{r}. {t}{";" if i < 4 else "."}' for i, (r, t) in enumerate(regime['obbligatori'].items())])
        doc.p(regime['dueFasi'])
        for r in regime['obbligatori']:
            doc.p(f"{r}. {regime['spiegazioni'][r]}")
        doc.h('1.1.2 Requisiti ulteriori', 3)
        doc.p(regime['introUlteriori'])
        doc.elenco([f'{r} {t}{";" if i < 2 else "."}' for i, (r, t) in enumerate(regime['ulteriori'].items())])
        for r in regime['ulteriori']:
            doc.p(f"{r} – {regime['spiegazioni'][r]}")
    doc.salto()

    doc.h('2. ANALISI TECNICA DEL BENE OGGETTO DI VALUTAZIONE', 1)
    doc.h('2.1 Breve descrizione delle macchine inserite nel ciclo produttivo', 2)
    doc.p(f"Il bene oggetto di valutazione è {sc['denominazione']}: {sc['funzione']}. "
          + ph('funzione effettiva, targa letta, flusso funzionale dichiarato e osservato, figure con didascalia e [ev:]'))
    foto = [e for e in pr.evidenze(codice, 'ID') if e['tipo'] == 'foto']
    for i, e in enumerate(foto[:2], 1):
        doc.p(f"Fig. {i} – {e.get('descrizione') or 'vista del bene'} [ev: {Path(e['file']).name}]", corsivo=True, dim=9)
    doc.h('2.1.1. Dati identificativi della macchina', 3)
    componenti = [f"{c['denominazione']} ({c['codice']}){' – ' + c['costruttore'] if c.get('costruttore') else ''}{' – ' + c['funzione'] if c.get('funzione') else ''}"
                  for c in sc.get('componenti', [])] or ['nessun componente censito nel fascicolo']
    dati = [
        ('Denominazione del fornitore:', [fornitore(sc)]),
        ('Denominazione del costruttore:', [voce(sc, 'identita', 'costruttore', 'costruttore')]),
        ('Componenti principali:', componenti),
        ('Denominazione commerciale:', [sc['denominazione']]),
        ('Descrizione tecnica e tipologia di macchina:', [sc['funzione']]),
        ('Modello e numero di matricola:', [f"{voce(sc, 'identita', 'modello', 'modello')} – matricola {voce(sc, 'identita', 'matricola', 'matricola')}"]),
        ('Anno di fabbricazione:', [voce(sc, 'identita', 'anno', 'anno')]),
        ('Sistema di controllo:', [f"{voce(sc, 'controllore', 'marca', 'marca del controllore')} {voce(sc, 'controllore', 'modello', 'modello del controllore')}"]),
        ('Offerta e ordine:', [descrivi_doc(d) for d in ordini] or [pr.evento(codice, 'ordine', "offerta e conferma d'ordine")]),
        ('Consegna:', [pr.evento(codice, 'consegna', 'consegna')]),
        ('Collaudo ed entrata in funzione:', [f"collaudo {pr.evento(codice, 'collaudo', 'collaudo')}; entrata in funzione {pr.evento(codice, 'funzione', 'entrata in funzione')}"]),
        ('Interconnessione:', [pr.evento(codice, 'interconnessione', 'interconnessione')]),
    ]
    for etichetta, valori in dati:
        doc.p(etichetta, grassetto=True)
        doc.elenco(valori)

    doc.h('2.2 Classificazione del bene', 2)
    gruppo, num = numero_voce(cl)
    numerata = f'{gruppo}.{num}' if num else ph('voce numerata (es. 1.1)')
    if g:
        doc.p(f"Il bene oggetto di valutazione soddisfa il criterio di inclusione nell’Allegato A della Legge 11 dicembre 2016, n. 232, in quanto rientra nel "
              f"{g['ordinale']} Gruppo – «{g['titolo']}» e, più precisamente, nella voce {numerata}. La voce {numerata} ricomprende le: «{cl['voce']}».")
    else:
        doc.p(f"Il bene oggetto di valutazione è riconducibile all’Allegato B della Legge 11 dicembre 2016, n. 232, voce: «{cl['voce']}».")
    doc.p(f"{maiuscola(cl['motivazione'])}. {rif_ev(cl.get('fonti'))}".strip())
    gate = (sc.get('datiAgliAtti') or {}).get('esitoGateC')
    if gate:
        doc.p(f"Perimetro e conformità dell'insieme: esito {gate['esito']} – {gate['motivazione']} {rif_ev(gate.get('fonti'))}".strip())
    doc.p('Documenti ed elementi di supporto alla classificazione:')
    supporto = {}
    for e in pr.evidenze(codice, 'DOC') + pr.evidenze(codice, 'ID') + pr.evidenze(codice, 'RO5', componenti=True):
        if e['tipo'] == 'documento':
            supporto.setdefault(e['id'], f"{e['descrizione']} [ev: {Path(e['file']).name}]")
    if foto:
        supporto['foto'] = 'documentazione fotografica del bene installato e delle targhe identificative'
    doc.elenco(list(supporto.values()) + [ph('manuale d’uso e manutenzione, layout di inserimento nel reparto')])
    doc.p(f"[NOTA: grado di sostenibilità della classificazione: {cl['sostenibilita'].replace('_', ' ')}]")

    doc.h('2.3 Indicazione del costo del bene e dei suoi componenti e accessori (così come risultante dalle fatture o dai documenti di leasing)', 2)
    costo(doc, sc, regime)
    doc.salto()

    if ridotto:
        doc.h('2.4 Esame possesso del requisito obbligatorio di interconnessione', 2)
        doc.p('Si esaminano di seguito le caratteristiche del bene al fine di accertare il rispetto del requisito di interconnessione, sulla base della documentazione disponibile alla data della presente bozza.')
        sezione_requisito(doc, pr, codice, 'RO2', 'interconnessione', '2.4.1', guida, 'obbligatorio di interconnessione')
        doc.h('2.5 Riconducibilità alla voce dell’Allegato', 2)
        sezione_requisito(doc, pr, codice, 'VOCE', 'riconducibilità alla voce', '2.5.1', guida, 'di riconducibilità alla voce')
        doc.h('2.6 Control Check', 2)
        doc.p('[NOTA: check list delle voci del gruppo da riportare dal testo vigente dell’Allegato; caselle da spuntare ad esito della verifica]')
        doc.casella(f"Allegato {cl['allegato']}{' Gruppo ' + g['romano'] if g else ''}, voce {numerata}: {cl['voce']}")
        doc.casella(f"Requisito obbligatorio di interconnessione: {regime['interconnessioneRidotto']}")
    else:
        doc.h('2.4 Esame possesso dei Requisiti Obbligatori (RO)', 2)
        doc.p('Si esaminano di seguito le caratteristiche del bene al fine di accertare il rispetto dei Requisiti Obbligatori, sulla base della documentazione disponibile alla data della presente bozza.')
        doc.p('Ai sensi dell’Allegato A della Legge 11 dicembre 2016, n. 232, tutti i beni strumentali appartenenti al Gruppo 1 devono essere dotati delle seguenti caratteristiche:')
        doc.elenco([maiuscola(t) + ';' for t in regime['obbligatori'].values()], stile='List Number')
        doc.p(f"Di seguito viene analizzato punto per punto il soddisfacimento dei requisiti da parte del bene: {k['bene'].upper()}")
        for i, (r, t) in enumerate(regime['obbligatori'].items(), 1):
            sezione_requisito(doc, pr, codice, r, t, f'2.4.{i}', guida, 'obbligatorio')
        doc.h('2.5 Esame possesso dei Requisiti Ulteriori', 2)
        doc.p('Si esaminano di seguito le caratteristiche della macchina al fine di accertare il rispetto dei Requisiti Ulteriori. Ai sensi dell’Allegato A '
              'della Legge 11 dicembre 2016, n. 232, tutti i beni strumentali devono essere dotati di almeno due delle seguenti caratteristiche:')
        doc.elenco([maiuscola(t) + ';' for t in regime['ulteriori'].values()])
        doc.p(f"Di seguito viene analizzato punto per punto il soddisfacimento dei requisiti da parte del bene {k['bene'].upper()}")
        dichiarati = cl.get('ruDichiarati') or []
        for i, (r, t) in enumerate(regime['ulteriori'].items(), 1):
            nota = '' if r in dichiarati else f' [NOTA: non dichiarato dal cliente: se non applicabile chiudere con «Il bene NON soddisfa il requisito ulteriore {r}»]'
            sezione_requisito(doc, pr, codice, r, t, f'2.5.{i}', guida, 'ulteriore', nota)
        doc.salto()
        doc.h('2.6 Control Check', 2)
        doc.p('[NOTA: le check list riportano la classificazione proposta e lo stato dei requisiti alla data della bozza; vanno riallineate alla matrice RO/RU definitiva]')
        doc.h('2.6.1 Check List 1 – Beni allegato A, strumentali il cui funzionamento è controllato da sistemi computerizzati o gestito tramite opportuni sensori e azionamenti (par. 11 Circ. AE 4/E)', 3)
        for cod, t in regime['vociGruppo1'].items():
            doc.casella(f"{cod} {t}{' – (proposta, da confermare)' if cod == cl.get('codiceVoce') else ''}", cod == cl.get('codiceVoce'))
        doc.h('2.6.2 Check List 2 – Beni allegato A – Requisiti obbligatori (par. 11.1 Circ. AE 4/E)', 3)
        for i, (r, t) in enumerate(regime['obbligatori'].items()):
            doc.casella(f"{r}. {t}{';' if i < 4 else '.'} {ph('esito allo stato')}")
        doc.h('2.6.3 Check List 3 – Beni allegato A – Requisiti ulteriori (par. 11.2 Circ. AE 4/E)', 3)
        for i, (r, t) in enumerate(regime['ulteriori'].items()):
            doc.casella(f"{r}. {t}{';' if i < 2 else '.'} {ph('esito allo stato')}")
    doc.salto()

    doc.h('3. RAPPRESENTAZIONE DEI FLUSSI MATERIALI E/O MATERIE PRIME E SEMILAVORATI CHE VANNO A DEFINIRE L’INTEGRAZIONE DELLA MACCHINA/IMPIANTO NEL SISTEMA PRODUTTIVO DELL’UTILIZZATORE', 1)
    doc.p(ph('diagramma dei flussi materiali e informativi (sistema informativo di fabbrica ↔ bene ↔ fasi a monte e a valle), con colori distinti'))
    doc.p('Diagramma di flusso per l’integrazione della macchina nel sistema informativo di fabbrica dell’utilizzatore', corsivo=True, dim=9)
    doc.salto()

    doc.h('4. CONCLUSIONI', 1)
    doc.p('[NOTA: conclusioni da redigere solo ad esito positivo della matrice RO/RU; il testo seguente è lo schema di riferimento e non rappresenta l’esito attuale]')
    doc.p('Per quanto indicato sopra, con la presente Analisi Tecnica si attesta che il seguente bene strumentale:')
    doc.tabella(righe_bene(pr, sc, k), larghezze=[5.5, 11.5], bordi=False, grassetto_prima=True)
    punti = regime['conclusioniRidotto'] if ridotto else regime['conclusioniCompleto']
    doc.elenco([testo_regime(t, allegato=cl['allegato'], gruppo=f", Gruppo {g['romano']}," if g else '') for t in punti])
    doc.p(testo_regime(regime['conclusioneFinale'], cliente=k['cliente'].upper(), sede=k['sedeLegale'], piva=k['piva']))
    doc.p()
    firma_perito(doc, perito, k)
    doc.salto()

    doc.h('5. ALLEGATI', 1)
    for riga in allegati(pr, sc, codice, k):
        doc.p(riga)
    doc.p('[NOTA: elenco ricavato dai documenti di costo e di consegna del fascicolo: verificare numerazione e completezza prima della firma]')

    doc.salto()
    appendice(doc, pr, codice, ridotto, regime)
    return doc, k


def firma_perito(doc, perito, k):
    """Firma con anagrafica completa del perito, dal file privato del perito."""
    nome = f"{perito.get('titolo') or ''} {perito['nome']}".strip().upper() if perito.get('nome') else ph('nome del perito')
    righe = [
        nome,
        f"Nato a {(perito.get('natoA') or '').upper() or ph('luogo di nascita')} il {data_it(perito.get('natoIl')) or ph('data di nascita')}",
        f"Residente in {(perito.get('residenza') or '').upper() or ph('residenza')}",
        f"CODICE FISCALE: {perito.get('codiceFiscale') or ph('codice fiscale')}",
        f"PARTITA IVA: {perito.get('partitaIva') or ph('partita IVA')}",
        f"LIBERO PROFESSIONISTA iscritto all’{perito.get('albo') or ph('ordine professionale e numero di iscrizione')}",
    ]
    for i, r in enumerate(righe):
        doc.p(r, grassetto=i == 0, dim=9.5)
    doc.p()
    doc.p(f"{k['luogo']}, {k['data']}")
    doc.p(nome, grassetto=True, destra=True)


def appendice(doc, pr, codice, ridotto, regime):
    doc.riquadro('APPENDICE ISTRUTTORIA – DOCUMENTO INTERNO, DA RIMUOVERE PRIMA DELLA FIRMA. Matrice dei requisiti, timeline di coerenza e integrazioni richieste alla data della bozza.')
    reqs = ['RO2', 'VOCE'] if ridotto else list(regime['obbligatori']) + list(regime['ulteriori'])
    doc.h('A. Matrice dei requisiti', 2)
    righe = []
    for r in reqs:
        ev = pr.evidenze(codice, r, componenti=True)
        gap = '; '.join(a['cosaServe'] for a in pr.azioni(codice, r)) or ''
        righe.append([r, ev[0]['id'] if ev else ph('primaria'), ', '.join(e['id'] for e in ev[1:3]) or '', ph('0–5'), gap, ph('rischio'), ph('conclusione')])
    doc.tabella(righe, intestazione=['Requisito', 'Evidenza primaria', 'Evidenza corroborante', 'Forza 0-5', 'Gap residuo', 'Rischio', 'Conclusione'])
    doc.h('B. Timeline di coerenza', 2)
    tl = sorted([t for t in pr.p['timeline'] if codice in [bene_di(b) for b in t['beni']]], key=lambda t: t['data']['valore'])
    if tl:
        doc.tabella([[data_it(t['data']['valore']) + f" ({t['data']['precisione']})", t['evento'].replace('_', ' '), rif_ev(t.get('prove')) or ph('prova'), t.get('coerenza', ''), t.get('nota', '')]
                     for t in tl], intestazione=['Data', 'Evento', 'Documento di prova', 'Coerenza', 'Nota'])
    else:
        doc.p(ph('timeline del bene: nessuna data nel fascicolo'))
    doc.h('C. Integrazioni richieste', 2)
    az = pr.azioni(codice)
    if az:
        doc.tabella([[a['priorita'], a['cosaServe'], a.get('requisito', ''), a.get('esempioAccettabile', ''), a.get('destinatario', '')] for a in az],
                    intestazione=['Priorità', 'Cosa serve', 'Requisito', 'Evidenza accettabile', 'Destinatario'])
    else:
        doc.p('Nessuna azione aperta nel fascicolo.')


# ---------------------------------------------------------------- avvio

def nome_file(tipo, k):
    stato = {'bozza': 'BOZZA', 'bozza_sospesa': 'BOZZA SOSPESA'}.get(k['stato'], '')
    # caratteri non ammessi da Windows; nomi lunghi accorciati per restare sotto il limite dei percorsi
    sicuro = lambda s, n: ' '.join(''.join(ch for ch in s if ch not in '<>:"/\\|?*').split())[:n].strip()
    return f"{tipo} {sicuro(k['cliente'], 40)} - {sicuro(k['bene'], 50)}{' - ' + stato if stato else ''} rev.{k['rev']} {k['data'].replace('/', '.')}.docx"


def testi_regime(codice):
    """Testi normativi del regime della pratica: regime_<codice>.json accanto a questo file."""
    percorso = Path(__file__).with_name(f'regime_{codice}.json')
    if not percorso.exists():
        sys.exit(f'regime {codice} non gestito: manca {percorso.name}')
    regime = leggi_json(percorso)
    if regime.get('daCompletare'):
        sys.exit(f"regime {codice}: testi normativi non ancora predisposti in {percorso.name}.\n{regime['avvertenza']}")
    return regime


def main(argv=None):
    a = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    a.add_argument('pratica')
    a.add_argument('--bene', action='append')
    a.add_argument('--perito')
    a.add_argument('--uscita')
    a.add_argument('--data', help='data dell’elaborato se il fascicolo non la indica (AAAA-MM-GG)')
    o = a.parse_args(argv)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # console di Windows: lettere accentate
    pr = Pratica(o.pratica)
    regime = testi_regime(pr.p['regime'])
    perito = leggi_json(o.perito) if o.perito else {}
    guida = guida_requisiti()
    oggi = data_it(o.data or dt.date.today().isoformat())
    uscita = Path(o.uscita) if o.uscita else pr.cartella / 'perizia'
    uscita.mkdir(parents=True, exist_ok=True)
    beni = o.bene or list(pr.schede)
    for codice in beni:
        if codice not in pr.schede:
            sys.exit(f'{codice}: bene non presente nel fascicolo')
        el = pr.schede[codice].get('elaborato') or {}
        if el.get('chiusoIl'):
            print(f"{codice}: chiuso il {el['chiusoIl']}, in sola lettura: nessun documento generato")
            continue
        documenti = ((perizia, 'Perizia 4.0'), (analisi, 'Analisi Tecnica'))
        if el.get('stato') == 'giurata':
            # la perizia giurata non si rigenera: solo l'analisi tecnica, che riporta i dati del giuramento
            print(f"{codice}: perizia già giurata, si genera solo l'analisi tecnica")
            documenti = documenti[1:]
        for fn, tipo in documenti:
            doc, k = fn(pr, codice, perito, regime, guida, oggi) if fn is analisi else fn(pr, codice, perito, regime, oggi)
            percorso = uscita / nome_file(tipo, k)
            if len(str(percorso.resolve())) > 255:
                sys.exit(f'percorso troppo lungo per Windows ({len(str(percorso.resolve()))} caratteri): {percorso}\n'
                         'usare --uscita con una cartella più corta o accorciare il nome della cartella della pratica')
            doc.salva(percorso)
            segnaposto = sum(par.text.count('[PLACEHOLDER') for par in doc.d.paragraphs) + sum(
                c.text.count('[PLACEHOLDER') for t in doc.d.tables for r in t.rows for c in r.cells)
            print(f'{percorso}  ({segnaposto} segnaposto)')


if __name__ == '__main__':
    main()
