#!/usr/bin/env node
// Genera le icone dell'app (Home dell'iPhone, Android, maschera) dal logo in app/img/logo-fp.png.
// Logo centrato su fondo bianco, ingrandito con interpolazione bilineare. Nessuna dipendenza.
// Uso: node strumenti/genera_icone.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

const IMG = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'img');

// Decodifica PNG a 8 bit, RGB o RGBA, non interlacciato → { l, h, px: RGBA }
function leggiPng(buf) {
  const l = buf.readUInt32BE(16), h = buf.readUInt32BE(20), prof = buf[24], tipo = buf[25];
  if (prof !== 8 || (tipo !== 6 && tipo !== 2) || buf[28] !== 0) throw new Error('PNG non supportato');
  const canali = tipo === 6 ? 4 : 3;
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const n = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8);
    if (t === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + n));
    p += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const riga = l * canali, out = Buffer.alloc(l * h * canali);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (riga + 1)], s = raw.subarray(y * (riga + 1) + 1, (y + 1) * (riga + 1));
    for (let x = 0; x < riga; x++) {
      const a = x >= canali ? out[y * riga + x - canali] : 0, b = y ? out[(y - 1) * riga + x] : 0;
      const c = x >= canali && y ? out[(y - 1) * riga + x - canali] : 0;
      let v = s[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * riga + x] = v & 255;
    }
  }
  const px = Buffer.alloc(l * h * 4);
  for (let i = 0; i < l * h; i++) { for (let k = 0; k < 3; k++) px[i * 4 + k] = out[i * canali + k]; px[i * 4 + 3] = canali === 4 ? out[i * 4 + 3] : 255; }
  return { l, h, px };
}

function scriviPng(l, h, rgb) {
  const raw = Buffer.alloc((l * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (l * 3 + 1) + 1, y * l * 3, (y + 1) * l * 3);
  const blocco = (t, d) => {
    const n = Buffer.alloc(4); n.writeUInt32BE(d.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])));
    return Buffer.concat([n, Buffer.from(t), d, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blocco('IHDR', ihdr), blocco('IDAT', deflateSync(raw, { level: 9 })), blocco('IEND', Buffer.alloc(0))]);
}

// Icona quadrata di lato L con il logo largo al massimo `quota` del lato
function icona(logo, L, quota) {
  const s = Math.min((L * quota) / logo.l, (L * quota) / logo.h);
  const lw = logo.l * s, lh = logo.h * s, ox = (L - lw) / 2, oy = (L - lh) / 2;
  const rgb = Buffer.alloc(L * L * 3, 255);
  const campione = (x, y, k) => logo.px[(Math.min(logo.h - 1, Math.max(0, y)) * logo.l + Math.min(logo.l - 1, Math.max(0, x))) * 4 + k];
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    const u = (x + 0.5 - ox) / s - 0.5, v = (y + 0.5 - oy) / s - 0.5;
    if (u < -0.5 || v < -0.5 || u > logo.l - 0.5 || v > logo.h - 0.5) continue;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const bil = k => campione(x0, y0, k) * (1 - fx) * (1 - fy) + campione(x0 + 1, y0, k) * fx * (1 - fy) + campione(x0, y0 + 1, k) * (1 - fx) * fy + campione(x0 + 1, y0 + 1, k) * fx * fy;
    const a = bil(3) / 255;
    for (let k = 0; k < 3; k++) rgb[(y * L + x) * 3 + k] = Math.round(255 * (1 - a) + bil(k) * a);
  }
  return scriviPng(L, L, rgb);
}

const logo = leggiPng(readFileSync(join(IMG, 'logo-fp.png')));
const icone = [['icona-180.png', 180, 0.7], ['icona-192.png', 192, 0.7], ['icona-512.png', 512, 0.7], ['icona-maschera-512.png', 512, 0.55]];
for (const [nome, L, q] of icone) writeFileSync(join(IMG, nome), icona(logo, L, q));
console.log(`Icone generate in ${IMG} dal logo ${logo.l}×${logo.h}`);
