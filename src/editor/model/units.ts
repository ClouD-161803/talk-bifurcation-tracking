import type { Range } from '../tokens.ts';

export type Child = { kind: 'element' | 'text' | 'comment'; start: number; end: number };

export type Unit = { lead: Range; range: Range; child: number };
export type Units = { units: Unit[]; tail: Range };

export function unitsOf(children: Child[], content: Range): Units {
  const units: Unit[] = [];
  let pos = content.start;
  children.forEach((c, i) => {
    if (c.kind !== 'element') return;
    units.push({ lead: { start: pos, end: c.start }, range: { start: c.start, end: c.end }, child: i });
    pos = c.end;
  });
  return { units, tail: { start: pos, end: Math.max(pos, content.end) } };
}

export const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

export const spaceOf = (lead: string): string => /^[ \t\r\n\f]*/.exec(lead)?.[0] ?? '';

export function indentAt(text: string, pos: number): string {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start, pos))?.[0] ?? '';
}

export function placeLead(lead: string, space: string, eol: string): string {
  const own = spaceOf(lead);
  const rest = lead.slice(own.length);
  const indent = space.slice(space.lastIndexOf('\n') + 1);
  if (own.includes('\n') && space.includes('\n') && own.slice(own.lastIndexOf('\n') + 1) === indent) return lead;
  if (!rest) return space;
  return space + rest.replace(/\r?\n[ \t]*/g, eol + indent);
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export function childrenIn(tokens: { type: string; name?: string; selfClosing?: boolean; start: number; end: number }[], content: Range): Child[] {
  const out: Child[] = [];
  let depth = 0;
  let open: { start: number; name: string } | null = null;
  for (const t of tokens) {
    if (t.start < content.start || t.end > content.end) continue;
    if (depth === 0 && (t.type === 'text' || t.type === 'comment')) {
      out.push({ kind: t.type, start: t.start, end: t.end });
    } else if (t.type === 'start') {
      const single = VOID.has(t.name ?? '') || !!t.selfClosing;
      if (depth === 0 && single) out.push({ kind: 'element', start: t.start, end: t.end });
      else if (!single) {
        if (depth === 0) open = { start: t.start, name: t.name ?? '' };
        depth++;
      }
    } else if (t.type === 'end' && depth > 0) {
      depth--;
      if (depth === 0 && open) {
        out.push({ kind: 'element', start: open.start, end: t.end });
        open = null;
      }
    }
  }
  return out;
}
