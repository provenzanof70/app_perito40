// Documenti firmati e marcati di prova, generati con openssl e un certificato di test usa e getta:
// PDF con firma PAdES e marca del documento, busta .p7m, marca .tsr a parte, .tsd e .m7m.
// Solo per le prove (strumenti/prova.mjs): nessun valore legale.

import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ossl = (dir, args, input) => {
  const r = spawnSync('openssl', args, { cwd: dir, input, encoding: 'buffer' });
  if (r.error || r.status !== 0) throw new Error(`openssl ${args[0]}: ${r.error ? r.error.message : r.stderr.toString()}`);
  return r.stdout;
};

// DER minimo: tag + lunghezza + valore
const tlv = (tag, ...parti) => {
  const v = Buffer.concat(parti);
  const l = v.length < 0x80 ? Buffer.from([v.length]) : (() => { const b = []; for (let n = v.length; n; n >>= 8) b.unshift(n & 0xff); return Buffer.from([0x80 | b.length, ...b]); })();
  return Buffer.concat([Buffer.from([tag]), l, v]);
};
const lunghezza = (b, p) => { const l = b[p + 1]; if (l < 0x80) return 2 + l; let v = 0; for (let i = 0; i < (l & 0x7f); i++) v = v * 256 + b[p + 2 + i]; return 2 + (l & 0x7f) + v; };
// TimeStampResp → TimeStampToken (secondo elemento della sequenza)
const token = tsr => { const inizio = 2 + (tsr[1] < 0x80 ? 0 : tsr[1] & 0x7f); const p = inizio + lunghezza(tsr, inizio); return tsr.subarray(p, p + lunghezza(tsr, p)); };

export function preparaFirme(dir) {
  writeFileSync(join(dir, 'tsa.cnf'), [
    '[ req ]', 'distinguished_name = dn', 'prompt = no', '[ dn ]', 'CN = Prova Firma',
    '[ firma ]', 'keyUsage = critical,digitalSignature,nonRepudiation', 'basicConstraints = CA:FALSE',
    '[ ts ]', 'extendedKeyUsage = critical,timeStamping', 'basicConstraints = CA:FALSE',
    '[ tsa ]', 'default_tsa = c1', '[ c1 ]', 'serial = ./serial', 'signer_cert = ./tsa.pem', 'signer_key = ./tsa.key', 'signer_digest = sha256',
    'default_policy = 1.2.3.4.1', 'digests = sha256', 'accuracy = secs:1', 'ess_cert_id_alg = sha256', 'tsa_name = no', 'ess_cert_id_chain = no', '',
  ].join('\n'));
  writeFileSync(join(dir, 'serial'), '01\n');
  ossl(dir, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'firma.key', '-out', 'firma.pem', '-days', '30', '-config', 'tsa.cnf', '-extensions', 'firma']);
  ossl(dir, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'tsa.key', '-out', 'tsa.pem', '-days', '30', '-config', 'tsa.cnf', '-extensions', 'ts', '-subj', '/CN=TSA di prova']);

  const marca = file => {
    ossl(dir, ['ts', '-query', '-data', file, '-sha256', '-cert', '-out', 'q.tsq']);
    ossl(dir, ['ts', '-reply', '-queryfile', 'q.tsq', '-config', 'tsa.cnf', '-out', 'r.tsr']);
    return readFileSync(join(dir, 'r.tsr'));
  };

  // PDF con firma PAdES (CMS detached sui ByteRange) e poi una marca del documento (ETSI.RFC3161)
  const pdfFirmato = base => {
    const segnaposto = '0'.repeat(16384);
    const testa = `${base}\n4 0 obj << /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /ByteRange [0000000000 0000000000 0000000000 0000000000] /Contents <`;
    const coda = '> >>\nendobj\n%%EOF\n';
    let s = testa + segnaposto + coda;
    const a = 0, b = testa.length - 1, c = testa.length + segnaposto.length + 1, d = s.length - c;
    const br = `[${String(a).padStart(10, '0')} ${String(b).padStart(10, '0')} ${String(c).padStart(10, '0')} ${String(d).padStart(10, '0')}]`;
    s = s.replace('[0000000000 0000000000 0000000000 0000000000]', br);
    const buf = Buffer.from(s, 'latin1');
    writeFileSync(join(dir, 'firmati.bin'), Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)]));
    const sig = ossl(dir, ['cms', '-sign', '-binary', '-in', 'firmati.bin', '-signer', 'firma.pem', '-inkey', 'firma.key', '-outform', 'DER']);
    buf.write(sig.toString('hex').toUpperCase(), b + 1, 'latin1');
    return buf;
  };
  const conMarcaDocumento = pdf => {
    const segnaposto = '0'.repeat(16384);
    const testa = `${pdf.toString('latin1')}5 0 obj << /Type /DocTimeStamp /SubFilter /ETSI.RFC3161 /ByteRange [0000000000 0000000000 0000000000 0000000000] /Contents <`;
    const coda = '> >>\nendobj\n%%EOF\n';
    let s = testa + segnaposto + coda;
    const a = 0, b = testa.length - 1, c = testa.length + segnaposto.length + 1, d = s.length - c;
    s = s.replace('[0000000000 0000000000 0000000000 0000000000]', `[${[a, b, c, d].map(n => String(n).padStart(10, '0')).join(' ')}]`);
    const buf = Buffer.from(s, 'latin1');
    writeFileSync(join(dir, 'firmati2.bin'), Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)]));
    const t = token(marca('firmati2.bin'));
    buf.write(t.toString('hex').toUpperCase(), b + 1, 'latin1');
    return buf;
  };

  const base = '%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n% analisi tecnica di prova';
  const pades = pdfFirmato(base);
  const padesMarcato = conMarcaDocumento(pades);
  const scansione = Buffer.from('%PDF-1.4\n% perizia giurata scansionata di prova\n%%EOF\n', 'latin1');
  writeFileSync(join(dir, 'scansione.pdf'), scansione);
  const p7m = ossl(dir, ['cms', '-sign', '-binary', '-nodetach', '-in', 'scansione.pdf', '-signer', 'firma.pem', '-inkey', 'firma.key', '-outform', 'DER']);
  writeFileSync(join(dir, 'scansione.pdf.p7m'), p7m);
  const tsr = marca('scansione.pdf.p7m');
  // TimeStampedData (RFC 5544): ContentInfo { id-ct-timestampedData, [0] { versione 1, contenuto, [0] { { marca } } } }
  const oidTsd = Buffer.from([0x06, 0x0b, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x1f]);
  const tsd = tlv(0x30, oidTsd, tlv(0xa0, tlv(0x30, Buffer.from([0x02, 0x01, 0x01]), tlv(0x04, p7m), tlv(0xa0, tlv(0x30, tlv(0x30, token(tsr)))))));
  // Il .p7m dentro il .tsd è in un OCTET STRING: si riconosce comunque dall'OID della firma
  const confine = 'confine-di-prova';
  const m7m = Buffer.from([
    'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${confine}"`, '', `--${confine}`,
    'Content-Type: application/pkcs7-mime; name="scansione.pdf.p7m"', 'Content-Transfer-Encoding: base64', '', p7m.toString('base64'), `--${confine}`,
    'Content-Type: application/timestamp-reply; name="scansione.pdf.tsr"', 'Content-Transfer-Encoding: base64', '', tsr.toString('base64'), `--${confine}--`, '',
  ].join('\r\n'), 'latin1');
  const pdfAlterato = Buffer.from(pades);
  pdfAlterato[40] = pdfAlterato[40] === 0x41 ? 0x42 : 0x41;
  return { pades, padesMarcato, pdfAlterato, scansione, p7m, tsr, tsd, m7m };
}
