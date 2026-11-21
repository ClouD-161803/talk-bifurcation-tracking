import { readBibtex, type Bibliography } from './bibtex.ts';
import { readPreamble, type EnvironmentDef, type Kind, type MacroDef, type Preamble, type Resolve } from './preamble.ts';
import { referenceOf, type Reference } from './reference.ts';

export type Tex = {
  macros: Record<string, MacroDef>;
  environments: Record<string, EnvironmentDef>;
  packages: string[];
  theorems: Record<string, Kind>;
  references: Record<string, Reference>;
};

export function citedKeys(html: string): string[] {
  const keys = new Set<string>();
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  for (const match of text.matchAll(/<cite\b[^>]*?\sdata-key\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const key of (match[1] ?? match[2]).split(',')) if (key.trim()) keys.add(key.trim());
  }
  return [...keys];
}

export function texOf(preamble: Preamble, bibliography: Bibliography, html: string): { tex: Tex; missing: string[] } {
  const entries = new Map(bibliography.entries.map((entry) => [entry.key, entry]));
  const references: Record<string, Reference> = {};
  const missing: string[] = [];
  for (const key of citedKeys(html).sort()) {
    const entry = entries.get(key);
    if (entry) references[key] = referenceOf(entry);
    else missing.push(key);
  }
  const { macros, environments, packages, theorems } = preamble;
  return { tex: { macros, environments, packages, theorems, references }, missing };
}

export function folderTex(read: (name: string) => string | null, html: string): { preamble: Preamble; bibliography: Bibliography; tex: Tex; missing: string[] } {
  const names = {
    input: (name: string) => (/\.[A-Za-z]+$/.test(name) ? [name] : [`${name}.tex`, name]),
    package: (name: string) => [`${name}.sty`],
    class: (name: string) => [`${name}.cls`],
  };
  const find: Resolve = (name, kind) => {
    for (const file of names[kind](name)) {
      const found = read(file);
      if (found !== null) return { file, text: found };
    }
    return null;
  };
  const preamble = readPreamble(read('preamble.tex') ?? '', { file: 'preamble.tex', resolve: find });
  const bibliography = readBibtex(read('references.bib') ?? '');
  return { preamble, bibliography, ...texOf(preamble, bibliography, html) };
}

export function skippedLines(preamble: Preamble, bibliography: Bibliography, missing: string[], deck: string): string[] {
  const short = (statement: string) => (statement.length > 100 ? `${statement.slice(0, 99)}…` : statement);
  return [
    ...preamble.skipped.map((s) => `${s.file}:${s.line}: ${short(s.text)}: ${s.reason}`),
    ...bibliography.skipped.map((s) => `references.bib:${s.line}: ${short(s.text)}: ${s.reason}`),
    ...missing.map((key) => `${deck}: the key ${key} is cited, and it is not in references.bib`),
  ];
}

const ascii = (value: unknown): string => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export function texScript(tex: Tex): string {
  const lines = ['window.beesonTex = {'];
  for (const [name, part] of Object.entries(tex)) {
    const entries = Array.isArray(part) ? [] : Object.entries(part);
    if (!entries.length) lines.push(`  ${ascii(name)}: ${ascii(part)},`);
    else lines.push(`  ${ascii(name)}: {`, ...entries.map(([key, value]) => `    ${ascii(key)}: ${ascii(value)},`), '  },');
  }
  lines.push('};');
  return `${lines.join('\n')}\n`;
}

export function preambleOf(macros: Record<string, MacroDef>, comments: Record<string, string[]> = {}): string {
  const lines = ['% the macros of the talk. npm run tex reads them into tex.js for MathJax'];
  for (const [name, def] of Object.entries(macros)) {
    const [body, args, preset] = Array.isArray(def) ? def : [def, 0];
    lines.push(...(comments[name] ?? []).map((comment) => `% ${comment}`));
    lines.push(`\\newcommand{\\${name}}${args ? `[${args}]` : ''}${preset === undefined ? '' : `[${preset}]`}{${body}}`);
  }
  return `${lines.join('\n')}\n`;
}
