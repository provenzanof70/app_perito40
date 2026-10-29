// Data di scatto letta dai metadati del file, distinta dall'ora di acquisizione nell'app (§6.1).
// Foto JPEG: EXIF DateTimeOriginal (o DateTimeDigitized) con OffsetTimeOriginal se presente.
// Video MOV/MP4: creation_time del box mvhd (secondi dal 1904, UTC).
// Se il dato manca restituisce null: l'app dichiara «metadati assenti» e non lo sostituisce con l'ora di importazione.
// Funzioni pure, provate in strumenti/prova.mjs.

const due = n => String(n).padStart(2, '0');

// Scarto del fuso del dispositivo per una data locale, nel formato +hh:mm
export function scartoLocale(a, me, g, h, mi, s) {
  const min = -new Date(a, me - 1, g, h, mi, s).getTimezoneOffset();
  const segno = min >= 0 ? '+' : '-';
  return `${segno}${due(Math.floor(Math.abs(min) / 60))}:${due(Math.abs(min) % 60)}`;
}

function isoLocale(d) {
  const p = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
  return `${p[0]}-${due(p[1])}-${due(p[2])}T${due(p[3])}:${due(p[4])}:${due(p[5])}${scartoLocale(...p)}`;
}

export function dataScattoJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return null;
    const marcatore = b[p + 1];
    if (marcatore === 0xda || marcatore === 0xd9) return null;
    const lun = v.getUint16(p + 2);
    if (marcatore === 0xe1 && String.fromCharCode(...b.subarray(p + 4, p + 10)) === 'Exif\0\0') return leggiExif(b, v, p + 10);
    p += 2 + lun;
  }
  return null;
}

function leggiExif(b, v, t) {
  const le = b[t] === 0x49;
  const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
  if (u16(2) !== 42) return null;
  const voci = ifd => {
    const out = new Map();
    if (t + ifd + 2 > b.length) return out;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (t + e + 12 > b.length) break;
      out.set(u16(e), { tipo: u16(e + 2), conta: u32(e + 4), valore: e + 8 });
    }
    return out;
  };
  const testo = x => {
    if (!x || x.tipo !== 2) return null;
    const off = x.conta > 4 ? u32(x.valore) : x.valore;
    if (t + off + x.conta > b.length) return null;
    return String.fromCharCode(...b.subarray(t + off, t + off + x.conta)).replace(/\0+$/, '').trim();
  };
  const ifd0 = voci(u32(4));
  const puntatore = ifd0.get(0x8769);
  if (!puntatore) return null;
  const exif = voci(u32(puntatore.valore));
  const quando = testo(exif.get(0x9003)) || testo(exif.get(0x9004));
  const m = quando && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(quando);
  if (!m || m[1] === '0000') return null;
  const n = m.slice(1).map(Number);
  const scarto = testo(exif.get(0x9011)) || testo(exif.get(0x9012));
  const z = scarto && /^[+-]\d{2}:\d{2}$/.test(scarto) ? scarto : scartoLocale(...n);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${z}`;
}

const EPOCA_1904 = Date.UTC(1904, 0, 1);

export function dataScattoVideo(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const cerca = (inizio, fine, tipo) => {
    let p = inizio;
    while (p + 8 <= fine) {
      let lun = v.getUint32(p);
      const t = String.fromCharCode(...b.subarray(p + 4, p + 8));
      let testa = 8;
      if (lun === 1) { if (p + 16 > fine) return null; lun = Number(v.getBigUint64(p + 8)); testa = 16; }
      else if (lun === 0) lun = fine - p;
      if (lun < testa) return null;
      if (t === tipo) return { inizio: p + testa, fine: Math.min(p + lun, fine) };
      p += lun;
    }
    return null;
  };
  const moov = cerca(0, b.length, 'moov');
  const mvhd = moov && cerca(moov.inizio, moov.fine, 'mvhd');
  if (!mvhd || mvhd.inizio + 12 > b.length) return null;
  const versione = b[mvhd.inizio];
  const secondi = versione === 1 ? Number(v.getBigUint64(mvhd.inizio + 4)) : v.getUint32(mvhd.inizio + 4);
  if (!secondi) return null;
  return isoLocale(new Date(EPOCA_1904 + secondi * 1000));
}

// Data di scatto di un file qualsiasi: { origine: 'metadati', data } oppure { origine: 'assente' }
export function dataScatto(bytes, mime) {
  let data = null;
  try {
    if (/jpe?g/i.test(mime) || (bytes[0] === 0xff && bytes[1] === 0xd8)) data = dataScattoJpeg(bytes);
    else if (/video|quicktime|mp4/i.test(mime)) data = dataScattoVideo(bytes);
  } catch { data = null; }
  return data ? { origine: 'metadati', data } : { origine: 'assente' };
}

export { isoLocale };
