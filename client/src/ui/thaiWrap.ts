// Thai has no spaces between words, so Phaser's word wrap (which only breaks at
// spaces) can't wrap it. Split into words with Intl.Segmenter, then wrap by width.

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;

// Thai vowel/tone marks that must stay attached to the character before them
const COMBINING = /[ัิ-ฺ็-๎]/;

function tokens(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), (s) => s.segment);
  // Fallback for very old browsers: split per character but keep marks attached
  const out: string[] = [];
  for (const ch of text) {
    if (out.length && COMBINING.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Insert line breaks so `text` fits in `maxWidth` px when drawn with `font`
 * (CSS font shorthand, e.g. "700 28px Kanit").
 */
export function wrapThai(text: string, font: string, maxWidth: number): string {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  const ctx = measureCtx;
  ctx.font = font;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const tok of tokens(paragraph)) {
      const candidate = line + tok;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line.trimEnd());
        line = tok.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}
