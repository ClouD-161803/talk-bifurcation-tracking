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

export function openGate(page) {
  return page.evaluate(`(() => {
    window.MathJax.typesetPromise = window.MathJax.__typeset;
    window.__openGate();
    return true;
  })()`);
}
