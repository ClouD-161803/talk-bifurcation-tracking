import { plainText } from './accents.ts';
import type { Kind, Style } from './kinds.ts';

export { USUAL, kindsOf, type Kind, type Style } from './kinds.ts';

export type MacroDef = string | [string, number] | [string, number, string];
export type EnvironmentDef = [string, string] | [string, string, number] | [string, string, number, string];
export type Skipped = { file: string; line: number; text: string; reason: string };
export type Preamble = {
  macros: Record<string, MacroDef>;
  environments: Record<string, EnvironmentDef>;
  packages: string[];
  theorems: Record<string, Kind>;
  skipped: Skipped[];
};
export type Resolve = (name: string, kind: 'input' | 'package' | 'class') => { file: string; text: string } | null;
export type Options = { file?: string; resolve?: Resolve };

const EXTENSION: Record<string, string> = {
  amsmath: '',
  amssymb: '',
  amsfonts: '',
  amstext: '',
  amsbsy: '',
  amsopn: '',
  latexsym: '',
  amsthm: '',
  ntheorem: '',
  mathtools: 'mathtools',
  physics: 'physics',
  braket: 'braket',
  cancel: 'cancel',
  color: 'color',
  xcolor: 'color',
  bm: '',
  xspace: '',
  mhchem: 'mhchem',
  amscd: 'amscd',
  bussproofs: 'bussproofs',
  cases: 'cases',
  centernot: 'centernot',
  colortbl: 'colortbl',
  empheq: 'empheq',
  extpfeil: 'extpfeil',
  gensymb: 'gensymb',
  textcomp: 'textcomp',
  units: 'units',
  upgreek: 'upgreek',
};
const UNVENDORED = new Set(['bbm', 'bbold', 'bboldx', 'dsfont']);
const STYLES = ['plain', 'definition', 'remark'];

class Skip extends Error {}

const listed = (names: string[]): string => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);
const tidy = (text: string): string => text.replace(/\s*\n\s*/g, ' ').trim();

function uncomment(source: string): { text: string; lines: number[] } {
  const src = source.replace(/\r\n?/g, '\n');
  let text = '';
  const lines: number[] = [];
  let line = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length && src[i + 1] !== '\n') {
      text += c + src[i + 1];
      lines.push(line, line);
      i++;
    } else if (c === '%') {
      while (i < src.length && src[i] !== '\n') i++;
      line++;
      while (src[i + 1] === ' ' || src[i + 1] === '\t') i++;
    } else {
      text += c;
      lines.push(line);
      if (c === '\n') line++;
    }
  }
  return { text, lines };
}

export function readPreamble(source: string, options: Options = {}): Preamble {
  const macros: Record<string, MacroDef> = {};
  const environments: Record<string, EnvironmentDef> = {};
  const packages: string[] = [];
  const theorems: Record<string, Kind> = {};
  const skipped: (Skipped & { order: number })[] = [];
  const lets = new Map<string, { target: string; entry: Omit<Skipped, 'reason'> & { order: number } }>();
  const files = new Set([options.file ?? 'preamble.tex']);
  let style: Style = 'plain';
  let order = 0;
  let done = false;

  const define = (macro: string, def: MacroDef): void => {
    for (const [alias, { target, entry }] of lets) {
      if (target !== macro) continue;
      delete macros[alias];
      lets.delete(alias);
      skipped.push({ ...entry, reason: `\\${macro} is defined again later in the preamble, and its first meaning cannot be kept` });
    }
    lets.delete(macro);
    macros[macro] = def;
  };

  const scan = (file: string, source: string): void => {
    const { text, lines } = uncomment(source);
    const n = text.length;
    let from = 0;
    let at = 0;

    const space = (i: number): number => {
      while (i < n && /\s/.test(text[i])) i++;
      return i;
    };
    const entry = (end: number) => ({ order: at, file, line: lines[from], text: tidy(text.slice(from, end)) });
    const note = (end: number, reason: string): void => void skipped.push({ ...entry(end), reason });
    const control = (i: number): [string, number] => {
      let end = i + 1;
      while (end < n && /[A-Za-z@]/.test(text[end])) end++;
      if (end === i + 1) end++;
      return [text.slice(i + 1, end), end];
    };
    const group = (i: number): [string, number] => {
      if (text[i] !== '{') throw new Skip('a brace is expected');
      let depth = 0;
      for (let k = i; k < n; k++) {
        if (text[k] === '\\') k++;
        else if (text[k] === '{') depth++;
        else if (text[k] === '}' && --depth === 0) return [text.slice(i + 1, k), k + 1];
      }
      throw new Skip('a brace is not closed');
    };
    const bracket = (i: number): [string, number] | null => {
      const open = space(i);
      if (text[open] !== '[') return null;
      let depth = 0;
      for (let k = open + 1; k < n; k++) {
        if (text[k] === '\\') k++;
        else if (text[k] === '{') depth++;
        else if (text[k] === '}') depth--;
        else if (text[k] === ']' && depth === 0) return [text.slice(open + 1, k), k + 1];
      }
      throw new Skip('a bracket is not closed');
    };
    const argument = (i: number): [string, number] => {
      const start = space(i);
      if (start >= n) throw new Skip('an argument is missing');
      if (text[start] === '{') {
        const [inner, end] = group(start);
        return [tidy(inner), end];
      }
      if (text[start] !== '\\') return [text[start], start + 1];
      const [name, end] = control(start);
      return [`\\${name}`, end];
    };
    const macroName = (i: number): [string, number] => {
      const [name, end] = argument(i);
      if (!/^\\([A-Za-z@]+|.)$/.test(name)) throw new Skip('the name of a macro is expected');
      return [name.slice(1), end];
    };
    const counts = (i: number, owner: string): [number, string | null, number] => {
      const count = bracket(i);
      if (!count) return [0, null, i];
      const args = Number(count[0]);
      if (!Number.isInteger(args) || args < 0 || args > 9) throw new Skip(`the number of arguments of ${owner} is not read`);
      const preset = bracket(count[1]);
      return preset ? [args, preset[0], preset[1]] : [args, null, count[1]];
    };
    const lineEnd = (start: number): number => {
      let depth = 0;
      let first = -1;
      for (let k = start; k < n; k++) {
        if (text[k] === '\\') k++;
        else if (text[k] === '{') depth++;
        else if (text[k] === '}') depth--;
        else if (text[k] === '\n') {
          if (first < 0) first = k;
          if (depth <= 0) return k;
        }
      }
      return depth > 0 && first >= 0 ? first : n;
    };

    const read = (found: { file: string; text: string }): void => {
      files.add(found.file);
      scan(found.file, found.text);
    };

    const statement = (): number => {
      if (text[from] !== '\\') throw new Skip('not a definition');
      const [name, after] = control(from);
      let i = after;
      const starred = text[i] === '*';
      switch (name) {
        case 'newcommand':
        case 'renewcommand':
        case 'providecommand':
        case 'DeclareRobustCommand': {
          const [macro, a] = macroName(starred ? i + 1 : i);
          const [args, preset, b] = counts(a, `\\${macro}`);
          const [body, end] = argument(b);
          if (name !== 'providecommand' || !(macro in macros)) define(macro, preset !== null ? [body, args, preset] : args ? [body, args] : body);
          return end;
        }
        case 'def':
        case 'gdef': {
          const [macro, a] = macroName(i);
          const brace = text.indexOf('{', a);
          if (brace < 0) throw new Skip('a brace is expected');
          const params = text.slice(a, brace).replace(/\s/g, '');
          let args = 0;
          while (params.startsWith(`#${args + 1}`, 2 * args)) args++;
          if (params.length !== 2 * args) throw new Skip('a \\def with delimited parameters is not read');
          const [body, end] = argument(brace);
          define(macro, args ? [body, args] : body);
          return end;
        }
        case 'let': {
          const [alias, a] = macroName(i);
          let b = space(a);
          if (text[b] === '=') b = space(b + 1);
          if (text[b] !== '\\') throw new Skip('a \\let of a character is not read');
          const [target, end] = control(b);
          const origin = lets.get(target)?.target ?? (target in macros ? null : target);
          const copy = macros[target];
          define(alias, origin !== null ? `\\${origin}` : Array.isArray(copy) ? ([...copy] as MacroDef) : copy);
          if (origin !== null) lets.set(alias, { target: origin, entry: entry(end) });
          return end;
        }
        case 'DeclareMathOperator': {
          const [macro, a] = macroName(starred ? i + 1 : i);
          const [body, end] = argument(a);
          define(macro, `\\operatorname${starred ? '*' : ''}{${body}}`);
          return end;
        }
        case 'newenvironment':
        case 'renewenvironment': {
          const [environment, a] = group(space(starred ? i + 1 : i));
          const [args, preset, b] = counts(a, `the environment ${environment}`);
          const [begin, c] = argument(b);
          const [finish, end] = argument(c);
          environments[environment.trim()] = preset !== null ? [begin, finish, args, preset] : args ? [begin, finish, args] : [begin, finish];
          return end;
        }
        case 'usepackage':
        case 'RequirePackage': {
          const [names, a] = group(space(bracket(i)?.[1] ?? i));
          const end = bracket(a)?.[1] ?? a;
          const missing: string[] = [];
          const unvendored: string[] = [];
          for (const pkg of names.split(',').map((s) => s.trim()).filter(Boolean)) {
            const found = options.resolve?.(pkg, 'package');
            if (found) {
              if (!files.has(found.file)) read(found);
            } else if (pkg in EXTENSION) {
              if (EXTENSION[pkg] && !packages.includes(EXTENSION[pkg])) packages.push(EXTENSION[pkg]);
            } else (UNVENDORED.has(pkg) ? unvendored : missing).push(pkg);
          }
          const reasons: string[] = [];
          if (missing.length) reasons.push(`MathJax does not have an extension for the package${missing.length > 1 ? 's' : ''} ${listed(missing)}`);
          if (unvendored.length) reasons.push(`the font of the package${unvendored.length > 1 ? 's' : ''} ${listed(unvendored)} is not vendored`);
          if (reasons.length) note(end, reasons.join(', and '));
          return end;
        }
        case 'documentclass':
        case 'LoadClass': {
          const [cls, a] = group(space(bracket(i)?.[1] ?? i));
          const found = options.resolve?.(cls.trim(), 'class');
          if (found && !files.has(found.file)) read(found);
          return bracket(a)?.[1] ?? a;
        }
        case 'input':
        case 'include': {
          while (text[i] === ' ' || text[i] === '\t') i++;
          let end = i;
          let named: string;
          if (text[i] === '{') [named, end] = group(i);
          else {
            while (end < n && !/\s/.test(text[end])) end++;
            named = text.slice(i, end);
          }
          const found = options.resolve?.(named.trim(), 'input');
          if (!found) note(end, `the file ${named.trim()} is not found`);
          else if (files.has(found.file)) note(end, `the file ${found.file} is read already`);
          else read(found);
          return end;
        }
        case 'theoremstyle': {
          const [named, end] = group(space(i));
          style = STYLES.includes(named.trim()) ? (named.trim() as Style) : 'plain';
          if (style !== named.trim()) note(end, `the style ${named.trim()} is not plain, definition, or remark, hence plain is used`);
          return end;
        }
        case 'newtheorem': {
          const [named, a] = group(space(starred ? i + 1 : i));
          const kind = named.trim();
          const shared = bracket(a);
          const [title, b] = group(space(shared?.[1] ?? a));
          const within = bracket(b);
          const end = within?.[1] ?? b;
          let counter: string | null = starred ? null : kind;
          if (!starred && shared) {
            const other = theorems[shared[0].trim()]?.counter;
            if (other) counter = other;
            else note(end, `the counter ${shared[0].trim()} is not the counter of a kind, hence ${kind} is numbered by itself`);
          } else if (!starred && within) note(end, `a number within ${within[0].trim()} is not read, hence ${kind} is numbered through the deck`);
          theorems[kind] = { title: plainText(title), style, counter };
          return end;
        }
        case 'begin': {
          const [environment] = group(space(i));
          if (environment.trim() !== 'document') throw new Skip('not a definition');
          done = true;
          return n;
        }
        case 'endinput':
          return n;
        case 'NeedsTeXFormat':
        case 'ProvidesPackage':
        case 'ProvidesClass':
        case 'ProvidesFile': {
          const [, a] = group(space(i));
          return bracket(a)?.[1] ?? a;
        }
        case 'makeatletter':
        case 'makeatother':
        case 'relax':
        case 'long':
        case 'global':
        case 'protected':
          return i;
        default:
          throw new Skip('not a definition');
      }
    };

    let i = 0;
    while (!done) {
      from = space(i);
      if (from >= n) break;
      at = ++order;
      try {
        i = statement();
      } catch (error) {
        if (!(error instanceof Skip)) throw error;
        i = lineEnd(from);
        note(i, error.message);
      }
    }
  };

  scan(options.file ?? 'preamble.tex', source);
  skipped.sort((a, b) => a.order - b.order);
  return { macros, environments, packages, theorems, skipped: skipped.map(({ file, line, text, reason }) => ({ file, line, text, reason })) };
}
