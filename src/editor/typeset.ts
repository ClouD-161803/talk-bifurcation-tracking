export const hasTex = (s: string): boolean => /\\\(|\\\[/.test(s);

let queue: Promise<unknown> = Promise.resolve();

function typeset(nodes: Element[]): Promise<unknown> {
  const mj = window.MathJax;
  if (!nodes.length || !mj?.typesetPromise) return Promise.resolve();
  queue = queue
    .then(() => mj.startup?.promise)
    .then(() => {
      const live = nodes.filter((n) => n.isConnected && !n.contains(document.activeElement));
      return live.length ? mj.typesetPromise(live) : null;
    })
    .catch(() => null);
  return queue;
}

export function untypeset(nodes: Element[]): void {
  const typeset = nodes.filter((n) => n.querySelector('mjx-container'));
  if (typeset.length) window.MathJax?.typesetClear?.(typeset);
}

export function showText(el: HTMLElement, text: string): void {
  if (el.dataset.tex === text && (el.textContent === text || el.querySelector('mjx-container'))) return;
  untypeset([el]);
  el.textContent = text;
  if (hasTex(text)) {
    el.dataset.tex = text;
    void typeset([el]);
  } else delete el.dataset.tex;
}
