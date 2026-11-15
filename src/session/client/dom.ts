// the few element helpers of the client, which may not import ui/dom.ts of the editor

export function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

// css added once to the head, as style#beeson-session-<id>
export function style(id: string, css: string): void {
  const key = `beeson-session-${id}`;
  if (document.getElementById(key)) return;
  const el = make('style');
  el.id = key;
  el.textContent = css;
  document.head.append(el);
}
