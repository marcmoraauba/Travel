/**
 * Trocea un texto para narrarlo: por párrafos y, si alguno supera `maxLen`, por frases.
 * (Android limita la longitud de cada texto que se pasa al motor de voz.)
 */
export function splitForSpeech(text: string, maxLen = 3000): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean)) {
    if (para.length <= maxLen) {
      out.push(para);
      continue;
    }
    let chunk = '';
    for (const sentence of para.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) ?? [para]) {
      if ((chunk + sentence).length > maxLen && chunk) {
        out.push(chunk.trim());
        chunk = '';
      }
      chunk += sentence;
    }
    if (chunk.trim()) out.push(chunk.trim());
  }
  return out;
}
