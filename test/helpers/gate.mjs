// a gate on the typesetting of MathJax in a page, which stands for a slow typeset on a phone. each
// call of MathJax.typesetPromise waits until the gate is opened, and window.__held counts the calls
// held, hence a test waits for an operation to reach its typeset rather than for a time

/**
 * Holds each call of MathJax.typesetPromise on page until openGate(page), from the first call for
 * which the expression when holds in the page, with the elements of the call as els.
 */
export function closeGate(page, when = 'true') {
  return page.evaluate(`(() => {
    const mj = window.MathJax;
    mj.__typeset ??= mj.typesetPromise.bind(mj);
    let open;
    window.__gate = new Promise((done) => (open = done));
    window.__openGate = open;
    window.__held = 0;
    mj.typesetPromise = (els) => {
      if (!window.__held && !(${when})) return mj.__typeset(els);
      window.__held += 1;
      return window.__gate.then(() => mj.__typeset(els));
    };
    return true;
  })()`);
}

/** Lets the calls held by closeGate(page) go on, and typesets at once from then on. */
export function openGate(page) {
  return page.evaluate(`(() => {
    window.MathJax.typesetPromise = window.MathJax.__typeset;
    window.__openGate();
    return true;
  })()`);
}
