// ZIP minimo senza dipendenze, valido nel browser e in Node.
// Scrittura: solo voci STORED (i media sono già compressi), nomi UTF-8, niente ZIP64 (volumi sotto 4 GB).
// Lettura: voci STORED e DEFLATE; la decompressione è passata dal chiamante (zlib.inflateRawSync in Node,
// DecompressionStream nel browser), così questo modulo resta sincrono e puro.

const TABELLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dati) {
  let c = 0xffffffff;
  for (let i = 0; i < dati.length; i++) c = TABELLA[(c ^ dati[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// dataOra: 'AAAA-MM-GGTHH:MM:SS' in ora locale del dispositivo, come vuole il formato ZIP
function dos(dataOra) {
  const [a, me, g, h, mi, s] = dataOra.match(/\d+/g).map(Number);
  return { ora: (h << 11) | (mi << 5) | (s >> 1), data: ((a - 1980) << 9) | (me << 5) | g };
}

// voci: [{ nome, dati: Uint8Array }]
export function scriviZip(voci, dataOra) {
  const enc = new TextEncoder();
  const t = dos(dataOra);
  const locali = [], centrali = [];
  let posizione = 0;
  for (const v of voci) {
    const nome = enc.encode(v.nome);
    const crc = crc32(v.dati);
    const n = v.dati.length;
    if (n >= 0xffffffff) throw new Error(`${v.nome}: file troppo grande per un volume`);
    const l = new DataView(new ArrayBuffer(30));
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 0, true);
    l.setUint16(10, t.ora, true); l.setUint16(12, t.data, true); l.setUint32(14, crc, true);
    l.setUint32(18, n, true); l.setUint32(22, n, true); l.setUint16(26, nome.length, true); l.setUint16(28, 0, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, t.ora, true); c.setUint16(14, t.data, true); c.setUint32(16, crc, true);
    c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, nome.length, true);
    c.setUint32(42, posizione, true);
    locali.push(new Uint8Array(l.buffer), nome, v.dati);
    centrali.push(new Uint8Array(c.buffer), nome);
    posizione += 30 + nome.length + n;
  }
  const lunghezzaCentrale = centrali.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, voci.length, true); e.setUint16(10, voci.length, true);
  e.setUint32(12, lunghezzaCentrale, true); e.setUint32(16, posizione, true);
  const parti = [...locali, ...centrali, new Uint8Array(e.buffer)];
  const out = new Uint8Array(parti.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of parti) { out.set(b, p); p += b.length; }
  return out;
}

// Come scriviZip, ma restituisce un Blob costruito per pezzi: i file grandi restano Blob (non copiati in memoria)
// e se ne leggono i byte uno alla volta solo per CRC e impronta. voci: [{ nome, dati: Uint8Array | Blob }]
// suFile(nome, bytes) viene chiamata per ogni file letto (es. per ricalcolare e confrontare lo SHA-256).
export async function scriviZipBlob(voci, dataOra, suFile = null) {
  const enc = new TextEncoder();
  const t = dos(dataOra);
  const locali = [], centrali = [];
  let posizione = 0;
  for (const v of voci) {
    const nome = enc.encode(v.nome);
    const bytes = v.dati instanceof Uint8Array ? v.dati : new Uint8Array(await v.dati.arrayBuffer());
    if (suFile) await suFile(v.nome, bytes);
    const crc = crc32(bytes);
    const n = bytes.length;
    if (n >= 0xffffffff) throw new Error(`${v.nome}: file troppo grande per un volume`);
    const l = new DataView(new ArrayBuffer(30));
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
    l.setUint16(10, t.ora, true); l.setUint16(12, t.data, true); l.setUint32(14, crc, true);
    l.setUint32(18, n, true); l.setUint32(22, n, true); l.setUint16(26, nome.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(12, t.ora, true); c.setUint16(14, t.data, true); c.setUint32(16, crc, true);
    c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, nome.length, true); c.setUint32(42, posizione, true);
    locali.push(new Uint8Array(l.buffer), nome, v.dati instanceof Uint8Array ? v.dati : v.dati);
    centrali.push(new Uint8Array(c.buffer), nome);
    posizione += 30 + nome.length + n;
  }
  const lunghezzaCentrale = centrali.reduce((s, b) => s + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, voci.length, true); e.setUint16(10, voci.length, true);
  e.setUint32(12, lunghezzaCentrale, true); e.setUint32(16, posizione, true);
  return new Blob([...locali, ...centrali, new Uint8Array(e.buffer)], { type: 'application/zip' });
}

// Restituisce Map nome → Uint8Array. Lancia un errore se l'archivio è danneggiato o non supportato.
export function leggiZip(buf, inflateRaw) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fine = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { fine = i; break; }
  if (fine < 0) throw new Error('archivio ZIP non riconosciuto (manca la directory centrale)');
  const quante = v.getUint16(fine + 10, true);
  let p = v.getUint32(fine + 16, true);
  if (p === 0xffffffff) throw new Error('archivio ZIP64 non supportato');
  const dec = new TextDecoder();
  const voci = new Map();
  for (let i = 0; i < quante; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('directory centrale danneggiata');
    const flag = v.getUint16(p + 8, true), metodo = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
    const compresso = v.getUint32(p + 20, true), pieno = v.getUint32(p + 24, true);
    const ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true);
    const locale = v.getUint32(p + 42, true);
    const nome = dec.decode(b.subarray(p + 46, p + 46 + ln));
    p += 46 + ln + le + lc;
    if (flag & 1) throw new Error(`${nome}: voce cifrata non supportata`);
    if (compresso === 0xffffffff || pieno === 0xffffffff) throw new Error(`${nome}: ZIP64 non supportato`);
    if (nome.endsWith('/')) continue;
    if (v.getUint32(locale, true) !== 0x04034b50) throw new Error(`${nome}: intestazione locale danneggiata`);
    const inizio = locale + 30 + v.getUint16(locale + 26, true) + v.getUint16(locale + 28, true);
    const grezzo = b.subarray(inizio, inizio + compresso);
    let dati;
    if (metodo === 0) dati = grezzo;
    else if (metodo === 8) {
      if (!inflateRaw) throw new Error(`${nome}: voce compressa e nessuna funzione di decompressione`);
      dati = new Uint8Array(inflateRaw(grezzo));
    } else throw new Error(`${nome}: metodo di compressione ${metodo} non supportato`);
    if (dati.length !== pieno || crc32(dati) !== crc) throw new Error(`${nome}: contenuto danneggiato (CRC diverso)`);
    if (voci.has(nome)) throw new Error(`${nome}: voce ripetuta`);
    voci.set(nome, dati);
  }
  return voci;
}
