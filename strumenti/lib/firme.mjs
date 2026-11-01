// Riconoscimento di firme digitali e marche temporali sui documenti finali della perizia.
// Formati: PDF firmato (PAdES, anche con marca della firma o del documento), busta CAdES .p7m, marca a parte .tsr,
// TimeStampedData .tsd, busta MIME .m7m (p7m + marca). Senza dipendenze; l'integrità crittografica si controlla con openssl
// se disponibile. Non si controllano catena e validità dei certificati: quello lo fa il software di firma del perito.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const OID = {
  signedData: [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02],
  tstInfo: [0x06, 0x0b, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x04],
  timeStampedData: [0x06, 0x0b, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x1f],
  signatureTimeStamp: [0x06, 0x0b, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x02, 0x0e],
  signingTime: [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x05],
};

const hash = (alg, b) => createHash(alg).update(b).digest();
const trova = (buf, seq, da = 0) => {
  const primo = seq[0];
  for (let i = buf.indexOf(primo, da); i >= 0 && i <= buf.length - seq.length; i = buf.indexOf(primo, i + 1)) {
    let ok = true;
    for (let j = 1; j < seq.length; j++) if (buf[i + j] !== seq[j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
};
const contiene = (buf, seq) => trova(buf, seq) >= 0;

// Lunghezza totale di un elemento DER (tag + lunghezza + valore) che inizia in pos
function lunghezzaDer(buf, pos) {
  const l = buf[pos + 1];
  if (l < 0x80) return 2 + l;
  const n = l & 0x7f;
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + buf[pos + 2 + i];
  return 2 + n + v;
}
// Inizio della ContentInfo (SEQUENCE) che contiene l'OID trovato in pos
const inizioSequenza = (buf, pos) => [2, 3, 4, 5, 6].map(k => pos - k).find(i => i >= 0 && buf[i] === 0x30 && i + lunghezzaDer(buf, i) <= buf.length && i + lunghezzaDer(buf, i) > pos);

// Tempo ASN.1 (UTCTime 0x17 o GeneralizedTime 0x18) entro qualche byte dopo la posizione indicata → ISO UTC
function tempoDopo(buf, pos, finestra = 400) {
  for (let i = pos; i < Math.min(buf.length - 15, pos + finestra); i++) {
    const tag = buf[i], len = buf[i + 1];
    if ((tag === 0x18 && len >= 15 && len <= 19) || (tag === 0x17 && len === 13)) {
      const s = buf.subarray(i + 2, i + 2 + len).toString('latin1');
      const m = tag === 0x18 ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(s) : /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
      if (m) {
        const anno = tag === 0x18 ? m[1] : (Number(m[1]) >= 50 ? `19${m[1]}` : `20${m[1]}`);
        return `${anno}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
      }
    }
  }
  return null;
}

// Marca temporale contenuta in un blocco binario: ora attestata e se riporta l'impronta di uno dei dati indicati
function marcaIn(buf, dati = []) {
  const p = trova(buf, OID.tstInfo);
  if (p < 0) return null;
  const riferita = !dati.length ? 'non_verificabile'
    : dati.some(d => ['sha256', 'sha512', 'sha1', 'sha384'].some(alg => contiene(buf, hash(alg, d)))) ? 'si' : 'no';
  return { data: tempoDopo(buf, p + OID.tstInfo.length), riferita };
}

function openssl(args, input) {
  const r = spawnSync('openssl', args, { input, encoding: 'buffer' });
  return r.error ? null : r;
}
export const opensslDisponibile = () => { const r = openssl(['version']); return !!(r && r.status === 0); };

// Firma CMS: integrità (detached con contenuto, o busta con contenuto incorporato), firmatario, ora dichiarata
function firmaCms(der, contenuto = null) {
  const out = { integrita: 'non_verificata' };
  const t = trova(der, OID.signingTime);
  if (t >= 0) out.dataFirma = tempoDopo(der, t + OID.signingTime.length, 40);
  if (!opensslDisponibile()) return out;
  const dir = mkdtempSync(join(tmpdir(), 'p40f-'));
  try {
    writeFileSync(join(dir, 'firma.der'), der);
    const args = ['cms', '-verify', '-noverify', '-binary', '-inform', 'DER', '-in', join(dir, 'firma.der'), '-signer', join(dir, 'firmatario.pem'), '-out', join(dir, 'contenuto.bin')];
    if (contenuto) { writeFileSync(join(dir, 'dati.bin'), contenuto); args.push('-content', join(dir, 'dati.bin')); }
    const r = openssl(args);
    out.integrita = r && r.status === 0 ? 'verificata' : 'errata';
    if (out.integrita === 'verificata' && existsSync(join(dir, 'firmatario.pem'))) {
      const s = openssl(['x509', '-in', join(dir, 'firmatario.pem'), '-noout', '-subject', '-nameopt', 'utf8,sep_comma_plus']);
      const cn = s && /CN\s*=\s*([^,\n]+)/.exec(s.stdout.toString('utf8'));
      if (cn) out.firmatario = cn[1].trim();
      if (!contenuto && existsSync(join(dir, 'contenuto.bin'))) out.contenuto = readFileSync(join(dir, 'contenuto.bin'));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return out;
}

// PDF: ogni dizionario di firma ha /ByteRange [a b c d]; tra a+b e c c'è <hex> con la firma CMS
function analizzaPdf(buf) {
  const testo = buf.toString('latin1');
  const firme = [], marche = [];
  let copreTutto = false;
  for (const m of testo.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)) {
    const [a, b, c, d] = m.slice(1).map(Number);
    if (a + b > c || c + d > buf.length) continue;
    const hex = testo.slice(a + b, c).replace(/[<>\s]/g, '').replace(/(00)+$/, '');
    const der = Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex');
    const firmati = Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)]);
    const dizionario = testo.slice(Math.max(0, m.index - 3000), Math.min(testo.length, m.index + 3000));
    const sub = (/\/SubFilter\s*\/([A-Za-z0-9.]+)/.exec(dizionario) || [])[1] || '';
    if (c + d === buf.length) copreTutto = true;
    if (sub === 'ETSI.RFC3161') {
      const x = marcaIn(der, [firmati]);
      marche.push({ formato: 'pades', data: x && x.data, riferita: x ? x.riferita : 'no', tipo: 'documento' });
      continue;
    }
    const f = firmaCms(der, firmati);
    delete f.contenuto;
    firme.push({ ...f, subFilter: sub });
    const ts = trova(der, OID.signatureTimeStamp);
    if (ts >= 0) {
      const x = marcaIn(der.subarray(ts));
      marche.push({ formato: 'pades', data: x && x.data, riferita: 'non_verificabile', tipo: 'firma' });
    }
  }
  return { tipo: 'pdf', firme, marche, modificatoDopoFirma: firme.length + marche.length > 0 && !copreTutto };
}

// Busta MIME .m7m: parti base64 (p7m e marca)
function partiMime(buf) {
  const t = buf.toString('latin1');
  const conf = (/boundary="?([^"\r\n;]+)"?/i.exec(t) || [])[1];
  if (!conf) return [];
  return t.split(`--${conf}`).map(p => {
    const [testa, ...corpo] = p.split(/\r?\n\r?\n/);
    const tipo = (/content-type:\s*([^;\r\n]+)/i.exec(testa) || [])[1] || '';
    const b64 = /base64/i.test(testa);
    const dati = corpo.join('\n\n').trim();
    return tipo && dati ? { tipo: tipo.toLowerCase(), dati: b64 ? Buffer.from(dati.replace(/\s+/g, ''), 'base64') : Buffer.from(dati, 'latin1') } : null;
  }).filter(Boolean);
}

const daPem = buf => {
  const t = buf.subarray(0, 64).toString('latin1');
  if (t.startsWith('-----BEGIN')) return Buffer.from(buf.toString('latin1').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
  if (/^[A-Za-z0-9+/=\s]+$/.test(t) && buf[0] !== 0x30) { const b = Buffer.from(buf.toString('latin1').replace(/\s+/g, ''), 'base64'); if (b[0] === 0x30) return b; }
  return buf;
};

// Busta .p7m (anche annidata: p7m dentro p7m) → firme e documento contenuto
function analizzaP7m(buf) {
  const firme = [], marche = [];
  let corrente = daPem(buf), contenuto = null;
  for (let livello = 0; livello < 4 && corrente && corrente[0] === 0x30 && contiene(corrente.subarray(0, 64), OID.signedData); livello++) {
    const f = firmaCms(corrente);
    const ts = trova(corrente, OID.signatureTimeStamp);
    const x = ts >= 0 ? marcaIn(corrente.subarray(ts)) : null;
    if (x) marche.push({ formato: 'cades', data: x.data, riferita: 'non_verificabile', tipo: 'firma' });
    contenuto = f.contenuto || null;
    delete f.contenuto;
    firme.push(f);
    corrente = contenuto;
  }
  return { firme, contenuto, marche };
}

// Analizza un file finale: nome serve a riconoscere l'estensione; documenti = buffer a cui una marca a parte dovrebbe riferirsi
export function analizzaFile(buf, nome, documenti = []) {
  const est = (nome.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return analizzaPdf(buf);
  if (est === 'm7m' || /^MIME-Version|^Content-Type/i.test(buf.subarray(0, 200).toString('latin1'))) {
    const parti = partiMime(buf);
    const p7m = parti.find(p => /pkcs7-mime|p7m/.test(p.tipo));
    const ts = parti.find(p => /timestamp/.test(p.tipo));
    const busta = p7m ? analizzaP7m(p7m.dati) : { firme: [], marche: [] };
    const x = ts ? marcaIn(ts.dati, p7m ? [p7m.dati] : []) : null;
    return { tipo: 'm7m', firme: busta.firme, contenuto: busta.contenuto, marche: [...busta.marche, ...(x ? [{ formato: 'm7m', data: x.data, riferita: x.riferita }] : [])] };
  }
  const der = daPem(buf);
  if (contiene(der.subarray(0, 64), OID.timeStampedData)) {
    // TimeStampedData: contiene il documento marcato (spesso un .p7m) e la marca sulla sua impronta
    const oid = trova(der, OID.signedData, 20);
    const inizio = oid >= 0 ? inizioSequenza(der, oid) : undefined;
    const busta = inizio !== undefined ? der.subarray(inizio, inizio + lunghezzaDer(der, inizio)) : null;
    const dentro = busta ? analizzaP7m(busta) : { firme: [], marche: [] };
    const x = marcaIn(busta ? der.subarray(inizio + busta.length) : der, busta ? [busta] : []);
    return { tipo: 'tsd', firme: dentro.firme, contenuto: dentro.contenuto, marche: [...dentro.marche, ...(x ? [{ formato: 'tsd', data: x.data, riferita: x.riferita }] : [])] };
  }
  // Marca a parte (.tsr/.tst): la busta firmata contiene subito le informazioni della marca, non un documento
  const tst = trova(der, OID.tstInfo);
  if (est === 'tsr' || est === 'tst' || (tst >= 0 && tst < 120)) {
    const x = marcaIn(der, documenti);
    return { tipo: 'tsr', firme: [], marche: x ? [{ formato: 'tsr', data: x.data, riferita: x.riferita }] : [] };
  }
  if (der[0] === 0x30 && contiene(der.subarray(0, 64), OID.signedData)) {
    const b = analizzaP7m(der);
    return { tipo: 'p7m', firme: b.firme, contenuto: b.contenuto, marche: b.marche };
  }
  return { tipo: 'altro', firme: [], marche: [] };
}
