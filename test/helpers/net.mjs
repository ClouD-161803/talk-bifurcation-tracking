// a script for open() of client.mjs that holds, cuts, changes, or answers the requests of a page by
// rule and logs every request, e.g. to keep an operation in flight or to answer a hello with 400

/**
 * Wraps fetch before the scripts of the page run, with window.__net. rule(part, action, options)
 * adds a rule for the requests whose url includes part, of options.method when given, for
 * options.times requests: hold keeps a request until release(part) sends it or cut(part) fails it,
 * late sends it at once and keeps its answer until release(part), cut fails it at once, answer
 * answers it with options.status, options.body, and options.type, and edit sends it with its JSON
 * body changed by the function options.edit. clear() drops the rules, drop(part) fails the requests
 * in flight, e.g. a long poll, and log holds the url, the method, the time, and the status of the
 * answer of every request.
 */
export const NET = `{
  const fetched = window.fetch;
  const rules = [];
  const held = [];
  const pending = new Set();
  const log = [];
  const matches = (r, url, method) => url.includes(r.part) && (!r.method || r.method === method);
  const take = (part, run) => {
    for (const h of held.filter((h) => h.url.includes(part))) {
      held.splice(held.indexOf(h), 1);
      run(h);
    }
    return true;
  };
  window.__net = {
    log,
    held,
    rule(part, action, { method, status = 200, body = '', type = 'application/json', times = Infinity, edit } = {}) {
      rules.push({ part, action, method, status, body, type, times, edit });
      return true;
    },
    clear() {
      rules.length = 0;
      return true;
    },
    release: (part = '') => take(part, (h) => h.go()),
    cut: (part = '') => take(part, (h) => h.fail()),
    drop(part = '') {
      for (const p of [...pending].filter((p) => p.url.includes(part))) pending.delete(p), p.fail(new TypeError('Failed to fetch'));
      return true;
    },
    count: (part, method, status) => log.filter((l) => matches({ part, method }, l.url, l.method) && (status === undefined || l.status === status)).length,
  };
  window.fetch = function (input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    const entry = { url, method, at: Date.now(), status: null };
    log.push(entry);
    const send = (options = init) => fetched.call(this, input, options).then((r) => ((entry.status = r.status), r));
    const rule = rules.find((r) => r.times > 0 && matches(r, url, method));
    if (!rule) {
      return new Promise((done, fail) => {
        const p = { url, fail };
        pending.add(p);
        send().then(done, fail).finally(() => pending.delete(p));
      });
    }
    rule.times--;
    if (rule.action === 'cut') return Promise.reject(new TypeError('Failed to fetch'));
    if (rule.action === 'answer') return Promise.resolve(new Response(rule.body, { status: (entry.status = rule.status), headers: { 'Content-Type': rule.type } }));
    if (rule.action === 'edit') return send({ ...init, body: JSON.stringify(rule.edit(JSON.parse(init.body))) });
    if (rule.action === 'late') return send().then((r) => new Promise((done, fail) => held.push({ url, method, go: () => done(r), fail: () => fail(new TypeError('Failed to fetch')) })));
    return new Promise((done, fail) => {
      const h = { url, method, go: () => send().then(done, fail), fail: () => fail(new TypeError('Failed to fetch')) };
      held.push(h);
      // the timeout of the transport aborts a held request as it would a slow one
      init?.signal?.addEventListener('abort', () => {
        if (!held.includes(h)) return;
        held.splice(held.indexOf(h), 1);
        fail(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
  };
}`;

/**
 * A script for open() that counts in window.__answers the answers of the polls of a page, each one
 * task after its text is read, i.e. after the client took or dropped it.
 */
export const ANSWERS = `{
  const text = Response.prototype.text;
  window.__answers = 0;
  Response.prototype.text = function () {
    const read = text.call(this);
    if (this.url.includes('/.session/events')) read.then(() => setTimeout(() => window.__answers++, 0));
    return read;
  };
}`;
