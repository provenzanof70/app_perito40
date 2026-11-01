"""Fascicolo fotografico in Word dal fascicolo della pratica: per ogni bene le foto in ordine di requisito,
con le annotazioni del campo (frecce, cerchi, testi) disegnate su una copia, didascalia, date e impronta.
Il file originale dell'evidenza non viene modificato. Documento di lavoro: non sostituisce la perizia.

Uso: python -I fascicolo_fotografico.py <cartella pratica> [--bene B01] [--uscita <cartella>] [--data AAAA-MM-GG]
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import tempfile

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont, ImageOps

GRUPPI = {1: 'Bene', 2: 'Targa', 3: 'PLC/CNC', 4: 'HMI', 5: 'Interconnessione', 6: 'Integrazione', 7: 'Remoto',
          8: 'Monitoraggio', 9: 'Modello digitale', 10: 'Dati in uscita', 11: 'Sicurezza', 'DOC': 'Documenti'}
# Stesso ordine dell'app: per requisito (ID, RO1…RO5, RU1…RU3, DOC)
ORDINE = [1, 2, 3, 5, 10, 6, 4, 11, 7, 8, 9, 'DOC']
ORIGINE = {'metadati': 'dai metadati del file', 'registrazione_app': "registrazione nell'app",
           'fotocamera_app': "fotocamera aperta dall'app", 'assente': 'metadati assenti'}
LATO_MAX = 1600
ROSSO = RGBColor(0xC0, 0x35, 0x2B)
GRIGIO = RGBColor(0x6C, 0x6C, 0x70)


def carattere(dim, grassetto=True):
    for nome in (('arialbd.ttf' if grassetto else 'arial.ttf'), 'DejaVuSans-Bold.ttf'):
        for cartella in (os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts'), '/usr/share/fonts/truetype/dejavu'):
            p = os.path.join(cartella, nome)
            if os.path.exists(p):
                return ImageFont.truetype(p, dim)
    return ImageFont.load_default()


def colore(a):
    c = a.get('colore') or '#FF453A'
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def disegna(percorso, annotazioni, uscita):
    """Copia ridotta della foto con le annotazioni disegnate (coordinate 0-1 sull'immagine orientata)."""
    im = ImageOps.exif_transpose(Image.open(percorso)).convert('RGB')
    im.thumbnail((LATO_MAX, LATO_MAX))
    L, H = im.size
    d = ImageDraw.Draw(im)
    w = max(3, round(L / 180))
    for a in annotazioni:
        c = colore(a)
        if a['tipo'] == 'freccia':
            x1, y1, x2, y2 = a['x'] * L, a['y'] * H, a['x2'] * L, a['y2'] * H
            d.line([(x1, y1), (x2, y2)], fill=c, width=w)
            import math
            ang = math.atan2(y2 - y1, x2 - x1)
            p = w * 5
            d.polygon([(x2, y2), (x2 - p * math.cos(ang - 0.45), y2 - p * math.sin(ang - 0.45)),
                       (x2 - p * math.cos(ang + 0.45), y2 - p * math.sin(ang + 0.45))], fill=c)
        elif a['tipo'] in ('cerchio', 'riquadro', 'evidenziazione'):
            box = [a['x'] * L, a['y'] * H, (a['x'] + a['w']) * L, (a['y'] + a['h']) * H]
            if a['tipo'] == 'cerchio':
                d.ellipse(box, outline=c, width=w)
            else:
                d.rectangle(box, outline=c, width=w)
        elif a['tipo'] == 'testo':
            f = carattere(max(14, round(L / 22)))
            d.text((a['x'] * L, a['y'] * H), a['testo'], font=f, fill=c, anchor='ls', stroke_width=max(1, w // 2), stroke_fill=(0, 0, 0))
    im.save(uscita, 'JPEG', quality=85)
    return L, H


def data_leggibile(iso):
    if not iso:
        return '—'
    try:
        t = dt.datetime.fromisoformat(iso.replace('Z', '+00:00'))
        return t.strftime('%d/%m/%Y %H:%M')
    except ValueError:
        return iso


def stile_base(doc):
    st = doc.styles['Normal']
    st.font.name = 'Arial'
    st.font.size = Pt(10)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')
    for nome in ('Heading 1', 'Heading 2', 'Title'):
        s = doc.styles[nome]
        s.font.name = 'Arial'
        s.font.color.rgb = RGBColor(0x1C, 0x1C, 0x1E)
        rf = s.element.rPr.rFonts if s.element.rPr is not None else None
        if rf is not None:
            for k in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
                rf.attrib.pop(qn(k), None)
    sez = doc.sections[0]
    sez.page_width, sez.page_height = Cm(21), Cm(29.7)
    sez.left_margin = sez.right_margin = Cm(2)
    sez.top_margin = sez.bottom_margin = Cm(2)


def riga(p, testo, grassetto=False, colore_=None, corsivo=False):
    r = p.add_run(testo)
    r.bold = grassetto
    r.italic = corsivo
    if colore_:
        r.font.color.rgb = colore_
    return r


def nome_file(cliente, bene, data):
    compatta = lambda s, n: re.sub(r'\s+', ' ', re.sub(r'[<>:"/\\|?*]', '', s)).strip()[:n].strip()
    return f"Fascicolo fotografico {compatta(cliente, 40)} - {compatta(bene, 50)} {data.strftime('%d.%m.%Y')}.docx"


def fascicolo(cartella, codice, pratica, scheda, data, uscita, tmp):
    cliente = pratica['cliente']['ragioneSociale']
    ev = [e for e in pratica['evidenze'] if any(b.split('.')[0] == codice for b in e['beni'])]
    valide = [e for e in ev if e['stato'] == 'valida']
    immagine = lambda e: e['tipo'] == 'foto' or (e['tipo'] == 'screenshot' and (e.get('mime') or '').startswith('image/'))
    foto = sorted([e for e in valide if immagine(e)], key=lambda e: (ORDINE.index(e['gruppo']) if e['gruppo'] in ORDINE else 99, e['id']))
    altri = [e for e in valide if not immagine(e)]

    doc = Document()
    stile_base(doc)
    intest = doc.sections[0].header.paragraphs[0]
    riga(intest, f"Fascicolo fotografico · {cliente} · {pratica['codicePratica']} · {codice}", colore_=GRIGIO)
    doc.add_heading(f"Fascicolo fotografico · {codice} {scheda['denominazione']}", 0)
    p = doc.add_paragraph()
    riga(p, f"{cliente} · pratica {pratica['codicePratica']} · {len(foto)} foto, {len(altri)} altre evidenze"
            f"{f' · {len(ev) - len(valide)} annullate (escluse)' if len(ev) > len(valide) else ''} · {data.strftime('%d/%m/%Y')}")
    p = doc.add_paragraph()
    riga(p, "Documento di lavoro: non sostituisce la perizia. Le annotazioni sono disegnate su una copia; "
            "l'originale di ogni evidenza resta invariato ed è riconoscibile dall'impronta SHA-256.", corsivo=True, colore_=GRIGIO)

    gruppo = None
    for e in foto:
        if e['gruppo'] != gruppo:
            gruppo = e['gruppo']
            doc.add_heading(f"{GRUPPI.get(gruppo, gruppo)}", 1)
        file = os.path.join(cartella, e['file'])
        if os.path.exists(file):
            out = os.path.join(tmp, f"{e['id']}.jpg")
            try:
                L, H = disegna(file, e.get('annotazioni') or [], out)
                larg = Cm(16) if H <= L * 0.75 else Cm(16 * (L * 0.75) / H)
                doc.add_picture(out, width=larg)
                doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            except Exception as err:  # immagine non leggibile: si dichiara, non si salta in silenzio
                riga(doc.add_paragraph(), f"[immagine non leggibile: {err}]", colore_=ROSSO)
        else:
            riga(doc.add_paragraph(), f"[file non trovato: {e['file']}]", colore_=ROSSO)
        p = doc.add_paragraph()
        riga(p, f"{e['id']}", grassetto=True)
        riga(p, f" · {GRUPPI.get(e['gruppo'], e['gruppo'])} · {', '.join(e['requisiti'])}")
        if len(e['beni']) > 1:
            riga(p, f" · vale anche per {', '.join(e['beni'][1:])}")
        p = doc.add_paragraph()
        provvisoria = '(da descrivere' in e['descrizione']
        riga(p, e['descrizione'], colore_=ROSSO if provvisoria else None)
        if e.get('nota'):
            riga(doc.add_paragraph(), f"Nota: {e['nota']}")
        testi = [a['testo'] for a in e.get('annotazioni') or [] if a.get('testo')]
        if testi:
            riga(doc.add_paragraph(), f"Testi sulla foto: {' · '.join(testi)}")
        p = doc.add_paragraph()
        scatto = f"Scatto: {data_leggibile(e.get('dataScatto'))} ({ORIGINE.get(e.get('origineDataScatto'), 'non indicata')})"
        if e.get('origineDataScatto') == 'fotocamera_app':
            scatto += f", fotocamera aperta alle {data_leggibile(e.get('aperturaFotocamera'))[-5:]}"
        video = e.get('dataMostrataAVideo')
        if video:
            scatto += f" · a video: {video['valore']}{' (orologio del bene errato' + (', ' + video['scartoStimato'] if video.get('scartoStimato') else '') + ')' if video.get('orologioErrato') else ''}"
        riga(p, f"{scatto} · SHA-256 {e['sha256'][:16]}…", colore_=GRIGIO)

    if altri:
        doc.add_heading('Altre evidenze del bene', 1)
        t = doc.add_table(rows=1, cols=4)
        t.style = 'Table Grid'
        for c, testo in zip(t.rows[0].cells, ('Codice', 'Tipo', 'Descrizione', 'Dati del documento')):
            riga(c.paragraphs[0], testo, grassetto=True)
        for e in altri:
            r = t.add_row().cells
            dd = e.get('datiDocumento') or {}
            dati = ', '.join(x for x in (dd.get('tipoDocumento', '').replace('_', ' '), dd.get('emittente'), f"n. {dd['numero']}" if dd.get('numero') else None,
                                         dd.get('data'), dd.get('riferimentoBene')) if x)
            letto = '; '.join(f"{x['posizione']}: {x['fatto']}" for x in e.get('contenutoLetto') or [])
            for c, testo in zip(r, (e['id'], e['tipo'], e['descrizione'], ' · '.join(x for x in (dati, letto) if x) or '—')):
                riga(c.paragraphs[0], testo)

    os.makedirs(uscita, exist_ok=True)
    nome = nome_file(cliente, f"{codice} {scheda['denominazione']}", data)
    dest = os.path.join(uscita, nome)
    if len(os.path.abspath(dest)) > 255:
        dest = os.path.join(uscita, nome_file(cliente[:20], codice, data))
    doc.save(dest)
    return dest, len(foto), len(altri)


def main():
    ap = argparse.ArgumentParser(description='Fascicolo fotografico in Word dal fascicolo della pratica')
    ap.add_argument('pratica')
    ap.add_argument('--bene')
    ap.add_argument('--uscita')
    ap.add_argument('--data')
    a = ap.parse_args()
    with open(os.path.join(a.pratica, 'pratica_40.json'), encoding='utf-8') as f:
        pratica = json.load(f)
    data = dt.date.fromisoformat(a.data) if a.data else dt.date.today()
    beni = [b for b in pratica['beni'] if not a.bene or b['codice'] == a.bene]
    if not beni:
        sys.exit(f"bene {a.bene} non trovato nella pratica")
    with tempfile.TemporaryDirectory() as tmp:
        for b in beni:
            with open(os.path.join(a.pratica, b['scheda']), encoding='utf-8') as f:
                scheda = json.load(f)
            dest, n, m = fascicolo(a.pratica, b['codice'], pratica, scheda, data, a.uscita or os.path.join(a.pratica, 'perizia'), tmp)
            print(f"{b['codice']}: {n} foto, {m} altre evidenze -> {dest}")


if __name__ == '__main__':
    main()
