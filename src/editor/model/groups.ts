export const groupsOf = (el: Element): string[] => el.getAttribute('data-group')?.split(/\s+/).filter(Boolean) ?? [];

export const groupValue = (list: string[]): string | null => (list.length ? list.join(' ') : null);

let scope: string[] = [];
export const scopeOf = (): string[] => scope;
export function setScope(list: string[]): void {
  scope = list;
}

export function within(el: Element, list: string[] = scope): boolean {
  const g = el.closest('[data-group]');
  const own = g ? groupsOf(g) : [];
  return list.every((n, i) => own[i] === n);
}

export function groupOf(el: Element): string | null {
  const list = groupsOf(el);
  return (within(el) ? list[scope.length] : list[0]) ?? null;
}

export function groupUsed(name: string, text: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return !!document.querySelector(`[data-group~="${CSS.escape(name)}"]`) || new RegExp(`data-group="(?:[^"]*\\s)?${esc}(?:\\s[^"]*)?"`).test(text);
}

export function copiedGroups(els: Element[], fresh: (taken: Set<string>) => string): (string | null)[] {
  const lists = els.map(groupsOf);
  const holders = new Map<string, string>();
  lists.forEach((list, i) => list.forEach((n) => holders.set(n, `${holders.get(n) ?? ''} ${i}`)));
  const shared = (n: string) => holders.get(n)!.includes(' ', 1);
  const names = new Map<string, string>();
  return lists.map((list) => groupValue(list.filter((n, k) => shared(n) && holders.get(n) !== holders.get(list[k + 1])).map((n) => {
    if (!names.has(n)) names.set(n, fresh(new Set(names.values())));
    return names.get(n) as string;
  })));
}
