import { kindsOf, type Kind, type Style } from './kinds.ts';

export type Head = { head: string; style: Style; missing: boolean };

export function theoremHeads(theorems: { kind: string; name?: string; counted?: boolean }[], kinds: Record<string, Kind>): Head[] {
  const count = new Map<string, number>();
  return theorems.map(({ kind: name, name: note, counted = true }) => {
    const kind = Object.hasOwn(kinds, name) ? kinds[name] : null;
    if (!kind) return { head: `${name}.`, style: 'plain', missing: true };
    if (name === 'proof' && note) return { head: `${note}.`, style: kind.style, missing: false };
    let number = '';
    if (kind.counter !== null && counted) {
      count.set(kind.counter, (count.get(kind.counter) ?? 0) + 1);
      number = ` ${count.get(kind.counter)}`;
    }
    return { head: `${kind.title}${number}${note ? ` (${note})` : ''}.`, style: kind.style, missing: false };
  });
}

export function numberTheorems(): void {
  const tex = (window as unknown as { beesonTex?: { theorems?: Record<string, Kind> } }).beesonTex;
  const theorems = [...document.querySelectorAll<HTMLElement>('.reveal .slides p.theorem')];
  const heads = theoremHeads(
    theorems.map((p) => ({ kind: p.dataset.kind || 'theorem', name: p.dataset.name, counted: !p.closest('section[data-visibility="hidden"]') })),
    kindsOf(tex?.theorems ?? {}),
  );
  theorems.forEach((p, k) => {
    const { head, style, missing } = heads[k];
    if (p.dataset.head !== head) p.dataset.head = head;
    if (p.dataset.style !== style) p.dataset.style = style;
    p.toggleAttribute('data-missing', missing);
  });
}
