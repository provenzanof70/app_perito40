// Preact + htm: componenti scritti come template, senza compilazione.

import { h } from 'preact';
import htm from '../vendor/htm.module.js';
import { ICONE } from './icone.js';

export const html = htm.bind(h);

export function Icona({ nome, dim = 24, colore }) {
  const d = ICONE[nome];
  return html`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"
    style=${{ width: `${dim}px`, height: `${dim}px`, flex: 'none', display: 'block', color: colore }}><path d=${d || ''} /></svg>`;
}

// Data AAAA-MM-GG → GG/MM/AAAA
export function dataBreve(iso) {
  if (!iso) return '';
  const [a, m, g] = iso.slice(0, 10).split('-');
  return `${g}/${m}/${a}`;
}

export function oraBreve(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Data di oggi nel fuso del dispositivo, AAAA-MM-GG
export function oggi(ora = new Date()) {
  return `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}-${String(ora.getDate()).padStart(2, '0')}`;
}

export function megabyte(byte) {
  if (byte == null) return '—';
  return byte < 1e9 ? `${(byte / 1e6).toFixed(byte < 1e7 ? 1 : 0)} MB` : `${(byte / 1e9).toFixed(1)} GB`;
}
