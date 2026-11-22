import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REGEX_BEFORE = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof|\bcase|\bin|\bof|=>)\s*$/;

export function literals(source) {
  const out = [];
  let i = 0;
  let line = 1;
  const depth = [];
  const n = source.length;
  const advance = (ch) => {
    if (ch === '\n') line++;
  };
  const readQuoted = (q) => {
    const start = line;
    let text = '';
    i++;
    while (i < n && source[i] !== q) {
      if (source[i] === '\\') {
        text += source[i + 1] === 'n' ? '\n' : source[i + 1];
        advance(source[i + 1]);
        i += 2;
        continue;
      }
      if (source[i] === '\n') break;
      text += source[i];
      i++;
    }
    i++;
    out.push({ line: start, text });
  };
  const readTemplate = () => {
    let start = line;
    let text = '';
    i++;
    while (i < n) {
      const ch = source[i];
      if (ch === '\\') {
        text += source[i + 1];
        advance(source[i + 1]);
        i += 2;
        continue;
      }
      if (ch === '`') {
        i++;
        out.push({ line: start, text });
        return;
      }
      if (ch === '$' && source[i + 1] === '{') {
        out.push({ line: start, text });
        text = '';
        i += 2;
        depth.push('template');
        return;
      }
      advance(ch);
      text += ch;
      i++;
    }
  };
  let last = '';
  while (i < n) {
    const ch = source[i];
    if (ch === '\n') {
      line++;
      i++;
      last += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      readQuoted(ch);
      last = 'x';
      continue;
    }
    if (ch === '`') {
      readTemplate();
      last = 'x';
      continue;
    }
    if (ch === '{') depth.push('brace');
    if (ch === '}') {
      const top = depth.pop();
      if (top === 'template') {
        i--;
        readTemplate();
        last = 'x';
        continue;
      }
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      for (const c of source.slice(i, end)) advance(c);
      i = end + 2;
      continue;
    }
    if (ch === '/' && REGEX_BEFORE.test(last.slice(-40))) {
      let cls = false;
      i++;
      while (i < n && source[i] !== '\n') {
        if (source[i] === '\\') i++;
        else if (source[i] === '[') cls = true;
        else if (source[i] === ']') cls = false;
        else if (source[i] === '/' && !cls) break;
        i++;
      }
      i++;
      last = 'x';
      continue;
    }
    last = (last + ch).slice(-40);
    i++;
  }
  return out;
}

const ATTRS = /\b(?:title|aria-label|placeholder|alt|data-tip|label)="([^"]*)"/g;

export function prose(text) {
  if (text.includes('<')) {
    const parts = [...text.matchAll(ATTRS)].map((m) => m[1]);
    const inner = text.replace(/<[^>]*>/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
    return [...parts, ...inner].filter(isProse);
  }
  return isProse(text) ? [text] : [];
}

export function isProse(text) {
  const t = text.trim();
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (/^[.#[:@]/.test(t) || /[{};]\s*$/.test(t) || /^[\w-]+:\s/.test(t) && /;/.test(t)) return false;
  if (/^(?:https?:|\.{0,2}\/|data:|M\d|var\(|rgba?\(|translate|scale|rotate|calc\()/.test(t)) return false;
  if (/^[a-z][\w-]*(?:[ ,>+~.][a-z][\w-]*)*$/.test(t) && !/ (?:a|the|of|to|is|in|and|or|on|for) /.test(` ${t} `)) return false;
  return /[A-Za-z][a-z]*\s+[A-Za-z]/.test(t) || /^[A-Z][a-z]+(?:[ .…]|$)/.test(t);
}

export function walk(root, dir, ext) {
  return readdirSync(join(root, dir), { recursive: true })
    .map((f) => `${dir}/${f.replaceAll('\\', '/')}`)
    .filter((f) => ext.some((e) => f.endsWith(e)) && !f.endsWith('.d.ts'));
}

export function codeTexts(root, files) {
  return files.flatMap((file) =>
    literals(readFileSync(join(root, file), 'utf8')).flatMap(({ line, text }) => prose(text).map((t) => ({ file, line, text: t }))),
  );
}

export function docTexts(root, files) {
  return files.flatMap((file) => {
    let fence = false;
    return readFileSync(join(root, file), 'utf8')
      .split('\n')
      .flatMap((text, i) => {
        if (/^\s*```/.test(text)) fence = !fence;
        return fence || !text.trim() ? [] : [{ file, line: i + 1, text }];
      });
  });
}

export function deckTexts(root, file) {
  const html = readFileSync(join(root, file), 'utf8');
  const body = html.slice(html.indexOf('<body'));
  const offset = html.slice(0, html.indexOf('<body')).split('\n').length - 1;
  return body
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n')
    .flatMap((raw, i) => {
      const parts = [...raw.matchAll(ATTRS)].map((m) => m[1]);
      const text = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return [...parts, text].filter((t) => /[A-Za-z]{2}/.test(t)).map((t) => ({ file, line: offset + i + 1, text: t }));
    });
}
