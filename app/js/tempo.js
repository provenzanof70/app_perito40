// Date senza dipendenze dall'interfaccia (usate anche dalle prove in Node).

// Data di oggi nel fuso del dispositivo, AAAA-MM-GG
export function oggi(ora = new Date()) {
  return `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}-${String(ora.getDate()).padStart(2, '0')}`;
}
