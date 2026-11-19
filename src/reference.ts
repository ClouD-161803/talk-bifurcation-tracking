import { plainText } from './accents.ts';
import type { Entry } from './bibtex.ts';

export type Name = { family: string; given: string };
export type Reference = { authors?: string; title?: string; venue?: string; volume?: string; year?: string; doi?: string; url?: string };

const VENUE = ['shortjournal', 'journal', 'journaltitle', 'booktitle', 'publisher', 'school', 'institution', 'howpublished'];

function split(text: string, separator: RegExp): string[] {
  let depth = 0;
  let masked = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') depth++;
    masked += depth > 0 ? '\u0000' : text[i];
    if (text[i] === '}') depth--;
  }
  const parts: string[] = [];
  let from = 0;
  for (const match of masked.matchAll(separator)) {
    parts.push(text.slice(from, match.index));
    from = match.index + match[0].length;
  }
  parts.push(text.slice(from));
  return parts;
}

function particle(word: string): boolean {
  const first = plainText(word)[0] ?? '';
  return !/^\{[^\\]/.test(word) && first !== first.toUpperCase() && first === first.toLowerCase();
}

export function namesOf(field: string): { names: Name[]; others: boolean } {
  const names: Name[] = [];
  let others = false;
  for (const raw of split(field.trim(), /\s+and\s+/gi)) {
    const text = raw.trim();
    if (!text) continue;
    if (text.toLowerCase() === 'others') {
      others = true;
      continue;
    }
    const parts = split(text, /\s*,\s*/g);
    if (parts.length > 1) {
      names.push({ family: plainText(parts[0]), given: plainText(parts[parts.length - 1]) });
      continue;
    }
    const words = split(text, /[\s~]+/g).filter(Boolean);
    const first = words.slice(0, -1).findIndex(particle);
    const cut = first < 0 ? words.length - 1 : first;
    names.push({ family: plainText(words.slice(cut).join(' ')), given: plainText(words.slice(0, cut).join(' ')) });
  }
  return { names, others };
}

const bare = (text: string | undefined): string => (text ?? '').replace(/\\([_%#&~])/g, '$1').replace(/[{}\s]/g, '');

function authorsOf(entry: Entry): string {
  const { names, others } = namesOf(entry.fields.author ?? entry.fields.editor ?? '');
  if (!names.length) return '';
  if (names.length === 1 && !others) return names[0].family;
  if (names.length === 2 && !others) return `${names[0].family} & ${names[1].family}`;
  return `${names[0].family} et al.`;
}

function venueOf(entry: Entry): string {
  for (const field of VENUE) {
    const text = plainText(entry.fields[field] ?? '');
    if (text) return text;
  }
  const eprint = bare(entry.fields.eprint);
  return eprint && /arxiv/i.test(`${entry.fields.archiveprefix ?? ''}${entry.fields.eprinttype ?? ''}`) ? `arXiv:${eprint}` : '';
}

export function referenceOf(entry: Entry): Reference {
  const url = bare(entry.fields.url);
  const parts: Reference = {
    authors: authorsOf(entry),
    title: plainText(entry.fields.title ?? ''),
    venue: venueOf(entry),
    volume: plainText(entry.fields.volume ?? ''),
    year: plainText(entry.fields.year ?? '') || (/\d{4}/.exec(entry.fields.date ?? '')?.[0] ?? ''),
    doi: bare(entry.fields.doi).replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, ''),
    url: /^https?:\/\//i.test(url) ? url : '',
  };
  if (!parts.authors && !parts.venue && !parts.title) parts.title = entry.key;
  return Object.fromEntries(Object.entries(parts).filter(([, text]) => text));
}

export function referenceParts(reference: Reference): [string, string, string] {
  const italic = reference.venue ?? (reference.authors ? '' : (reference.title ?? ''));
  const before = reference.authors ? (italic ? `${reference.authors}, ` : reference.authors) : '';
  const after = (reference.venue && reference.volume ? ` ${reference.volume}` : '') + (reference.year ? ` (${reference.year})` : '');
  return [before, italic, after];
}

export const referenceText = (reference: Reference): string => referenceParts(reference).join('');

export const referenceLink = (reference: Reference): string => (reference.doi ? `https://doi.org/${reference.doi}` : (reference.url ?? ''));

const fold = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const searched = new WeakMap<Entry, string>();
function searchText(entry: Entry): string {
  let text = searched.get(entry);
  if (text === undefined) {
    const people = [entry.fields.author, entry.fields.editor].flatMap((field) => namesOf(field ?? '').names.map((name) => `${name.given} ${name.family}`));
    text = fold([...people, plainText(entry.fields.year ?? entry.fields.date ?? ''), plainText(entry.fields.title ?? ''), venueOf(entry), entry.key].join(' '));
    searched.set(entry, text);
  }
  return text;
}

export function matches(entry: Entry, query: string): boolean {
  const text = searchText(entry);
  return fold(query).split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}
