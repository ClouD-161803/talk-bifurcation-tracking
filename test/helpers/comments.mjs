const OPERAND_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await', 'extends']);
const STATEMENT_HEADS = new Set(['if', 'while', 'for', 'with']);
const BLOCK_KEYWORDS = new Set(['else', 'do', 'try', 'finally', 'static']);

function skipQuoted(text, i, quote) {
  i++;
  while (i < text.length && text[i] !== quote && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
  return i + 1;
}

function skipRegex(text, i) {
  let inClass = false;
  i++;
  while (i < text.length && text[i] !== '\n') {
    if (text[i] === '\\') i++;
    else if (text[i] === '[') inClass = true;
    else if (text[i] === ']') inClass = false;
    else if (text[i] === '/' && !inClass) break;
    i++;
  }
  i++;
  while (/[a-z]/i.test(text[i] ?? '')) i++;
  return i;
}

function skipTemplateText(text, i) {
  while (i < text.length && text[i] !== '`' && !(text[i] === '$' && text[i + 1] === '{')) i += text[i] === '\\' ? 2 : 1;
  return i;
}

function embeddedComments(text, from, to, offset) {
  const part = text.slice(from, to);
  return [...part.matchAll(/\/\*[\s\S]*?\*\/|(?<=\n)[ \t]*\/\/.*/g)].map((m) => ({ at: offset + from + m.index + m[0].search(/\S/), text: m[0].trim() }));
}

export function scriptComments(text, offset = 0) {
  const found = [];
  const parens = [];
  const braces = [];
  let last = 'start';
  let regexAllowed = true;
  let i = text.startsWith('#!') ? text.indexOf('\n') : 0;
  if (i < 0) return found;
  const enterTemplate = (from) => {
    i = skipTemplateText(text, from);
    found.push(...embeddedComments(text, from, i, offset));
    if (text[i] === '$') {
      braces.push('template');
      i += 2;
      last = '{';
      regexAllowed = true;
    } else {
      i++;
      last = 'value';
      regexAllowed = false;
    }
  };
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && (next === '/' || next === '*')) {
      const close = next === '/' ? text.indexOf('\n', i) : text.indexOf('*/', i + 2);
      const end = close < 0 ? text.length : next === '/' ? close : close + 2;
      found.push({ at: offset + i, text: text.slice(i, end) });
      i = end;
    } else if (c === '"' || c === "'") {
      i = skipQuoted(text, i, c);
      last = 'value';
      regexAllowed = false;
    } else if (c === '`') {
      enterTemplate(i + 1);
    } else if (c === '}' && braces.at(-1) === 'template') {
      braces.pop();
      enterTemplate(i + 1);
    } else if (c === '/' && regexAllowed) {
      i = skipRegex(text, i);
      last = 'value';
      regexAllowed = false;
    } else if (/[\w$#]/.test(c)) {
      const word = /^[\w$#]+/.exec(text.slice(i, i + 64))[0];
      i += word.length;
      last = word;
      regexAllowed = OPERAND_KEYWORDS.has(word);
    } else if (/\s/.test(c)) {
      i++;
    } else if (c === '(') {
      parens.push(STATEMENT_HEADS.has(last));
      i++;
      last = '(';
      regexAllowed = true;
    } else if (c === ')') {
      regexAllowed = parens.pop() ?? false;
      i++;
      last = ')';
    } else if (c === '{') {
      const block = last === 'start' || last === ')' || last === '=>' || last === ';' || last === '{' || last === '}' || BLOCK_KEYWORDS.has(last) || /^[\w$]/.test(last);
      braces.push(block && !OPERAND_KEYWORDS.has(last) ? 'block' : 'object');
      i++;
      last = '{';
      regexAllowed = true;
    } else if (c === '}') {
      regexAllowed = braces.pop() === 'block';
      i++;
      last = '}';
    } else if (c === '=' && next === '>') {
      i += 2;
      last = '=>';
      regexAllowed = true;
    } else {
      regexAllowed = c !== ']';
      last = c;
      i++;
    }
  }
  return found;
}

export function styleComments(text, offset = 0) {
  const found = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"' || text[i] === "'") {
      i = skipQuoted(text, i, text[i]);
    } else if (text.startsWith('/*', i)) {
      const close = text.indexOf('*/', i + 2);
      const end = close < 0 ? text.length : close + 2;
      found.push({ at: offset + i, text: text.slice(i, end) });
      i = end;
    } else {
      i++;
    }
  }
  return found;
}

export function markupComments(text) {
  const found = [];
  const parts = /<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  for (const m of text.matchAll(parts)) {
    const inner = m.index + m[0].indexOf('>') + 1;
    if (m[0].startsWith('<!--')) found.push({ at: m.index, text: m[0] });
    else if (m[2] !== undefined && !/\btype=["']?(?!module\b|text\/javascript\b)/i.test(m[1])) found.push(...scriptComments(m[2], inner));
    else if (m[3] !== undefined) found.push(...styleComments(m[3], inner));
  }
  return found;
}

export function texComments(text) {
  return [...text.matchAll(/(?<=^|[^\\](?:\\\\)*)%.*/gm)].map((m) => ({ at: m.index, text: m[0] }));
}

export function hashComments(text) {
  return [...text.matchAll(/^[ \t]*#(?!!).*|(?<=[ \t])#[ \t].*/gm)].map((m) => ({ at: m.index + m[0].search(/#/), text: m[0].trimStart() }));
}

export function docstrings(text) {
  const after = String.raw`(?<=^(?:[ \t]*(?:#.*)?\n)*|(?:^|\n)[ \t]*(?:async[ \t]+)?(?:def|class)\b[^\n]*:[ \t]*\n(?:[ \t]*\n)*|\)(?:[ \t]*->[^\n]*)?:[ \t]*\n(?:[ \t]*\n)*)`;
  return [...text.matchAll(new RegExp(after + String.raw`[ \t]*[rRuU]?(?:"""|'''|"|').*`, 'g'))].map((m) => ({ at: m.index + m[0].search(/\S/), text: m[0].trim() }));
}

export function commentsOf(path, text) {
  if (/\.(?:[cm]?js|ts)$/.test(path)) return scriptComments(text);
  if (/\.json$/.test(path)) return scriptComments(text);
  if (/\.css$/.test(path)) return styleComments(text);
  if (/\.html$/.test(path)) return markupComments(text);
  if (/\.(?:tex|sty|bib)$/.test(path)) return texComments(text);
  if (/\.py$/.test(path)) return [...hashComments(text), ...docstrings(text)].sort((a, b) => a.at - b.at);
  if (/\.(?:ya?ml|toml|mplstyle|sh|command|cff)$|(?:^|\/)\.git(?:ignore|attributes)$/.test(path)) return hashComments(text);
  if (/\.cmd$/.test(path)) return [...text.matchAll(/^[ \t]*(?:rem\b|::).*/gim)].map((m) => ({ at: m.index + m[0].search(/\S/), text: m[0].trimStart() }));
  return [];
}
