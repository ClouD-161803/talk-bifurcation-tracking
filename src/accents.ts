const ACCENT: Record<string, string> = {
  '`': '\u0300',
  "'": '\u0301',
  '^': '\u0302',
  '~': '\u0303',
  '"': '\u0308',
  '=': '\u0304',
  '.': '\u0307',
  u: '\u0306',
  v: '\u030c',
  H: '\u030b',
  c: '\u0327',
  k: '\u0328',
  r: '\u030a',
  d: '\u0323',
  b: '\u0331',
};
const LETTER: Record<string, string> = { ss: 'ß', o: 'ø', O: 'Ø', l: 'ł', L: 'Ł', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', i: 'ı', j: 'ȷ' };
const BASE = String.raw`(?:\{\s*(\\[ij]|[A-Za-z])\s*\}|(\\[ij](?![A-Za-z])|[A-Za-z]))`;
const SYMBOL_ACCENT = new RegExp(String.raw`\\([\`'^~"=.])\s*${BASE}`, 'g');
const LETTER_ACCENT = new RegExp(String.raw`\\([uvHckrdb])(?:\s*\{\s*(\\[ij]|[A-Za-z])\s*\}|\s+(\\[ij](?![A-Za-z])|[A-Za-z]))`, 'g');

const accented = (_: string, accent: string, braced: string | undefined, bare: string | undefined): string => {
  const base = (braced ?? bare ?? '').replace('\\', '');
  return (base + ACCENT[accent]).normalize('NFC');
};

function words(tex: string): string {
  return tex
    .replace(SYMBOL_ACCENT, accented)
    .replace(LETTER_ACCENT, accented)
    .replace(/\\(ss|ae|AE|oe|OE|aa|AA|o|O|l|L|i|j)(?![A-Za-z])\s*/g, (_, name: string) => LETTER[name])
    .replace(/\\([{}])/g, (_, brace: string) => (brace === '{' ? '\u0001' : '\u0002'))
    .replace(/\\([&%#_])/g, '$1')
    .replace(/\\[,;: ]|~/g, ' ')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/\\[A-Za-z@]+\*?\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/\u0001/g, '{')
    .replace(/\u0002/g, '}');
}

export function plainText(tex: string): string {
  const parts = tex.replace(/\\\$/g, '\u0003').split(/(\$[^$]*\$)/);
  return parts
    .map((part, index) => (index % 2 ? part : words(part)))
    .join('')
    .replace(/\u0003/g, '$')
    .replace(/\s+/g, ' ')
    .trim();
}
