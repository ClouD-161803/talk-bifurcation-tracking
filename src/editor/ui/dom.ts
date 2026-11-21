export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function button(text: string, title = '', label = ''): HTMLButtonElement {
  const el = make('button', '', text);
  el.title = title;
  if (label) el.setAttribute('aria-label', label);
  return el;
}

export function injectStyle(id: string, css: string): HTMLStyleElement {
  const key = `beeson-edit-${id}`;
  const found = document.getElementById(key);
  if (found instanceof HTMLStyleElement) return found;
  const style = make('style');
  style.id = key;
  style.textContent = css;
  document.head.append(style);
  return style;
}

export const touchOnly = (): boolean => matchMedia('(any-pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

export function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export function wire(el: HTMLButtonElement, action: () => unknown, fail: (e: unknown) => void): void {
  el.addEventListener('click', (ev) => {
    if (ev.detail > 0) el.blur();
    Promise.resolve().then(action).catch(fail);
  });
}
