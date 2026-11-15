/*! edit.mjs 0.9.0-beta.2, the edit command of the synchronous editor of the beeson theme. MIT license. */

// src/edit/main.ts
import { spawn } from "node:child_process";
import { realpathSync as realpathSync3 } from "node:fs";
import { fileURLToPath } from "node:url";

// src/edit/command.ts
import { createReadStream, mkdirSync as mkdirSync2, readFileSync as readFileSync4, realpathSync as realpathSync2, unlinkSync as unlinkSync3, writeFileSync as writeFileSync4 } from "node:fs";
import { mkdir, realpath as realpath2, writeFile as writeFile3 } from "node:fs/promises";
import { createServer } from "node:http";
import { randomBytes as randomBytes3 } from "node:crypto";
import { join as join4, resolve, sep as sep2 } from "node:path";

// src/session/protocol.ts
var COLORS = ["--data-2", "--data-3", "--data-5", "--data-7"];
var NAME_MAX = 40;
var cleanPersonName = (raw) => typeof raw === "string" ? Array.from(raw.replace(/\s+/g, " ").trim()).slice(0, NAME_MAX).join("").trim() : "";
var nameKey = (name) => cleanPersonName(name).normalize("NFC").toLowerCase();
var isPersonId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{22,64}$/.test(id);
var isToken = (token) => typeof token === "string" && /^[A-Za-z0-9_-]{22,64}$/.test(token);
var formatVersion = (epoch, n) => `${epoch}.${n}`;
function parseVersion(v) {
  if (typeof v !== "string") return null;
  const m = /^([A-Za-z0-9_-]{1,32})\.(0|[1-9][0-9]{0,14})$/.exec(v);
  return m ? { epoch: m[1], n: Number(m[2]) } : null;
}

// src/editor/merge.ts
var MAX_LINES = 2e3;
var linesOf = (text) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
function offsets(lines) {
  const out = [0];
  for (const line of lines) out.push(out[out.length - 1] + line.length);
  return out;
}
function diff(a, b, max) {
  const n = a.length, m = b.length;
  const limit = Math.min(n + m, max);
  const off = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace = [];
  let found = -1;
  for (let d = 0; d <= limit && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x2 = k === -d || k !== d && v[off + k - 1] < v[off + k + 1] ? v[off + k + 1] : v[off + k - 1] + 1;
      let y2 = x2 - k;
      while (x2 < n && y2 < m && a[x2] === b[y2]) {
        x2++;
        y2++;
      }
      v[off + k] = x2;
      if (x2 >= n && y2 >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;
  const steps = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    const pk = k === -d || k !== d && prev[off + k - 1] < prev[off + k + 1] ? k + 1 : k - 1;
    const del = pk === k - 1;
    const px = prev[off + pk], py = px - pk;
    while (x > px + (del ? 1 : 0) && y > py + (del ? 0 : 1)) {
      x--;
      y--;
    }
    steps.push({ x: px, y: py, del });
    x = px;
    y = py;
  }
  steps.reverse();
  const hunks = [];
  for (const s of steps) {
    const last = hunks[hunks.length - 1];
    const h = last && last.a1 === s.x && last.b1 === s.y ? last : { a0: s.x, a1: s.x, b0: s.y, b1: s.y };
    if (h !== last) hunks.push(h);
    if (s.del) h.a1 += 1;
    else h.b1 += 1;
  }
  return hunks;
}
function changes(base, theirs) {
  if (base === theirs) return [];
  const a = linesOf(base), b = linesOf(theirs);
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const hunks = diff(a.slice(pre, a.length - suf), b.slice(pre, b.length - suf), MAX_LINES);
  if (!hunks) return null;
  const oa = offsets(a), ob = offsets(b);
  const out = [];
  let removed = 0;
  for (const h of hunks) {
    let start2 = oa[pre + h.a0], end = oa[pre + h.a1];
    let text = theirs.slice(ob[pre + h.b0], ob[pre + h.b1]);
    const old = base.slice(start2, end);
    let p = 0;
    while (p < old.length && p < text.length && old[p] === text[p]) p++;
    let s = 0;
    while (s < old.length - p && s < text.length - p && old[old.length - 1 - s] === text[text.length - 1 - s]) s++;
    start2 += p;
    end -= s;
    text = text.slice(p, text.length - s);
    removed += end - start2;
    out.push({ start: start2, end, text });
  }
  return removed > base.length / 2 ? null : out;
}

// src/editor/tokens.ts
var RAW_TEXT = /* @__PURE__ */ new Set(["script", "style", "xmp", "iframe", "noembed", "noframes"]);
var RCDATA = /* @__PURE__ */ new Set(["textarea", "title"]);
var isLetter = (c) => /^[A-Za-z]$/.test(c);
var isSpace = (c) => c === " " || c === "	" || c === "\n" || c === "\r" || c === "\f";
var opensMarkup = (c) => /^[A-Za-z!/?]$/.test(c);
function tokenize(html) {
  const out = [];
  const lower = html.toLowerCase();
  const n = html.length;
  let i = 0;
  let rawFor = null;
  const textUntilMarkup = (from) => {
    let j = from;
    while (j < n && !(html[j] === "<" && j + 1 < n && opensMarkup(html[j + 1]))) j++;
    return j;
  };
  while (i < n) {
    if (rawFor) {
      let end = n;
      for (let k = lower.indexOf(`</${rawFor.name}`, i); k >= 0; k = lower.indexOf(`</${rawFor.name}`, k + 1)) {
        const after = html[k + 2 + rawFor.name.length] ?? ">";
        if (isSpace(after) || after === "/" || after === ">") {
          end = k;
          break;
        }
      }
      if (end > i) out.push({ type: "text", raw: rawFor.raw, start: i, end });
      rawFor = null;
      i = end;
      continue;
    }
    const next = html[i + 1] ?? "";
    if (html[i] !== "<" || !opensMarkup(next)) {
      const end = textUntilMarkup(i + 1);
      out.push({ type: "text", raw: false, start: i, end });
      i = end;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      let end;
      if (html.startsWith(">", i + 4)) end = i + 5;
      else if (html.startsWith("->", i + 4)) end = i + 6;
      else {
        const k = html.indexOf("-->", i + 4);
        end = k < 0 ? n : k + 3;
      }
      out.push({ type: "comment", start: i, end });
      i = end;
    } else if (next === "!" || next === "?" || next === "/" && !isLetter(html[i + 2] ?? "")) {
      const k = html.indexOf(">", i);
      const end = k < 0 ? n : k + 1;
      out.push({ type: "other", start: i, end });
      i = end;
    } else if (next === "/") {
      let j = i + 2;
      while (j < n && !isSpace(html[j]) && html[j] !== ">" && html[j] !== "/") j++;
      const name = lower.slice(i + 2, j);
      const k = html.indexOf(">", j);
      const end = k < 0 ? n : k + 1;
      out.push({ type: "end", name, start: i, end });
      i = end;
    } else {
      let j = i + 1;
      while (j < n && !isSpace(html[j]) && html[j] !== ">" && html[j] !== "/") j++;
      const name = lower.slice(i + 1, j);
      const attrs = [];
      let selfClosing = false;
      for (; ; ) {
        while (j < n && (isSpace(html[j]) || html[j] === "/")) {
          selfClosing = html[j] === "/" && html[j + 1] === ">";
          j++;
        }
        if (j >= n || html[j] === ">") break;
        const nameStart = j;
        while (j < n && !isSpace(html[j]) && html[j] !== ">" && html[j] !== "/" && html[j] !== "=") j++;
        if (j === nameStart) {
          j++;
          continue;
        }
        const attrName = lower.slice(nameStart, j);
        let k = j;
        while (k < n && isSpace(html[k])) k++;
        if (html[k] !== "=") {
          attrs.push({ name: attrName, value: null, start: nameStart, end: j });
          continue;
        }
        k++;
        while (k < n && isSpace(html[k])) k++;
        const quote = html[k];
        if (quote === '"' || quote === "'") {
          const e = html.indexOf(quote, k + 1);
          const valueEnd = e < 0 ? n : e;
          attrs.push({ name: attrName, value: html.slice(k + 1, valueEnd), start: nameStart, end: Math.min(valueEnd + 1, n) });
          j = Math.min(valueEnd + 1, n);
        } else {
          let e = k;
          while (e < n && !isSpace(html[e]) && html[e] !== ">") e++;
          attrs.push({ name: attrName, value: html.slice(k, e), start: nameStart, end: e });
          j = e;
        }
      }
      const end = Math.min(j + 1, n);
      out.push({ type: "start", name, attrs, selfClosing, start: i, end });
      i = end;
      if (RAW_TEXT.has(name)) rawFor = { name, raw: true };
      else if (RCDATA.has(name)) rawFor = { name, raw: false };
    }
  }
  return out;
}

// src/session/patch.ts
var isHigh = (c) => c >= 55296 && c <= 56319;
var isLow = (c) => c >= 56320 && c <= 57343;
var splitsPair = (text, i) => i > 0 && i < text.length && isHigh(text.charCodeAt(i - 1)) && isLow(text.charCodeAt(i));
var LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function wellFormed(text) {
  const native = text.isWellFormed;
  if (native ? native.call(text) : !LONE.test(text)) return text;
  const parts = [];
  let at = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isHigh(c) && i + 1 < text.length && isLow(text.charCodeAt(i + 1))) i++;
    else if (isHigh(c) || isLow(c)) {
      parts.push(text.slice(at, i), "\uFFFD");
      at = i + 1;
    }
  }
  parts.push(text.slice(at));
  return parts.join("");
}
var MAX_PATCHES = 2e3;
function valid(patches, n, text) {
  if (!Array.isArray(patches) || patches.length > MAX_PATCHES) return false;
  let last = null;
  for (const p of patches) {
    if (!p || typeof p !== "object" || typeof p.text !== "string") return false;
    if (!Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0 || p.end < p.start || p.end > n) return false;
    if (last && p.start < last.end) return false;
    if (LONE.test(p.text)) return false;
    if (text !== void 0 && (splitsPair(text, p.start) || splitsPair(text, p.end))) return false;
    last = p;
  }
  return true;
}
function apply(text, patches) {
  if (patches.length === 0) return text;
  const parts = [];
  let at = 0;
  for (const p of patches) {
    parts.push(text.slice(at, p.start), p.text);
    at = p.end;
  }
  parts.push(text.slice(at));
  return parts.join("");
}
function conflict(a, b) {
  if (a.start < b.end && b.start < a.end) return true;
  if (a.start === a.end && b.start < a.start && a.start < b.end) return true;
  return b.start === b.end && a.start < b.start && b.start < a.end;
}
function before(a, b, aFirst) {
  if (a.start !== b.start) return a.start < b.start;
  const ai = a.start === a.end, bi = b.start === b.end;
  if (ai && bi) return aFirst;
  return ai;
}
function shift(patches, over, overFirst = true) {
  const out = [];
  let j = 0, k = 0, delta = 0;
  for (const p of patches) {
    while (k < over.length && over[k].end <= p.start) k++;
    for (let i = k; i < over.length && over[i].start < p.end; i++) if (conflict(p, over[i])) return null;
    while (j < over.length && before(over[j], p, overFirst)) {
      delta += over[j].text.length - (over[j].end - over[j].start);
      j++;
    }
    out.push({ start: p.start + delta, end: p.end + delta, text: p.text });
  }
  return out;
}
function shiftOffset(offset, patches, after = true) {
  let delta = 0;
  for (const p of patches) {
    if (p.end < offset || p.end === offset && (p.start < p.end || after)) delta += p.text.length - (p.end - p.start);
    else if (p.start < offset) return p.start + delta;
    else break;
  }
  return offset + delta;
}
function invert(text, patches) {
  let delta = 0;
  return patches.map((p) => {
    const start2 = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    return { start: start2, end: start2 + p.text.length, text: text.slice(p.start, p.end) };
  });
}
function combine(first, second) {
  const out = [];
  let i = 0, j = 0;
  while (i < first.length || j < second.length) {
    if (j >= second.length || i < first.length && before(first[i], second[j], true)) out.push(first[i++]);
    else out.push(second[j++]);
  }
  return out;
}
function mergePatches(theirs, ours, wins = "ours") {
  const hitOurs = new Uint8Array(ours.length), hitTheirs = new Uint8Array(theirs.length);
  let k = 0, any = false;
  for (let i = 0; i < ours.length; i++) {
    const o = ours[i];
    while (k < theirs.length && theirs[k].end <= o.start) k++;
    for (let j = k; j < theirs.length && theirs[j].start < o.end; j++) {
      if (conflict(o, theirs[j])) hitOurs[i] = hitTheirs[j] = 1;
    }
    any ||= hitOurs[i] === 1;
  }
  const conflicts = ours.filter((_, i) => hitOurs[i]);
  if (!any) return { patches: combine(theirs, ours), conflicts };
  const keptTheirs = wins === "ours" ? theirs.filter((_, j) => !hitTheirs[j]) : theirs;
  const keptOurs = wins === "ours" ? ours : ours.filter((_, i) => !hitOurs[i]);
  return { patches: combine(keptTheirs, keptOurs), conflicts };
}
var cached = null;
function tokensOf(text) {
  if (cached?.text !== text) cached = { text, tokens: tokenize(text) };
  return cached.tokens;
}
function tagAt(tokens, i) {
  let lo = 0, hi = tokens.length - 1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    const t = tokens[mid];
    if (t.end <= i) lo = mid + 1;
    else if (t.start > i) hi = mid - 1;
    else return (t.type === "start" || t.type === "end") && t.start < i ? t : null;
  }
  return null;
}
function valueAround(text, tag, a, b) {
  if (tag.type !== "start") return null;
  for (const attr of tag.attrs) {
    if (attr.value === null) continue;
    const end = attr.end - 1, start2 = end - attr.value.length;
    const quote = text[end];
    if ((quote === '"' || quote === "'") && text[start2 - 1] === quote && start2 <= a && b <= end) return { start: start2, end };
  }
  return null;
}
var REFERENCE = /&(?:#[0-9]{1,8}|#[xX][0-9a-fA-F]{1,8}|[A-Za-z][A-Za-z0-9]{1,31});/y;
function referenceAt(text, i) {
  for (let s = i - 1; s >= 0 && s >= i - 34; s--) {
    const c = text[s];
    if (c === "&") {
      REFERENCE.lastIndex = s;
      const m = REFERENCE.exec(text);
      return m && s + m[0].length > i ? { start: s, end: s + m[0].length } : null;
    }
    if (!/[#A-Za-z0-9]/.test(c)) return null;
  }
  return null;
}
function widenRange(text, tokens, a, b) {
  for (; ; ) {
    let s = a, e = b;
    const ta = tagAt(tokens, s), tb = tagAt(tokens, e);
    if (ta && ta === tb) {
      const value = valueAround(text, ta, s, e);
      if (value) [s, e] = [value.start, value.end];
      else [s, e] = [ta.start, ta.end];
    } else {
      if (ta) s = ta.start;
      if (tb) e = tb.end;
    }
    const ra = referenceAt(text, s), rb = referenceAt(text, e);
    if (ra) s = ra.start;
    if (rb) e = rb.end;
    if (splitsPair(text, s)) s--;
    if (splitsPair(text, e)) e++;
    if (s === a && e === b) return [s, e];
    [a, b] = [s, e];
  }
}
function widen(base, patches) {
  if (patches.length === 0) return patches;
  const tokens = tokensOf(base);
  const groups = [];
  for (const p of patches) {
    const [s, e] = widenRange(base, tokens, p.start, p.end);
    let group = { start: s, end: e, patches: [p] };
    for (let last = groups[groups.length - 1]; last; last = groups[groups.length - 1]) {
      const touch = group.start < last.end || group.start === last.end && group.start === group.end && last.start === last.end;
      if (!touch) break;
      groups.pop();
      group = { start: Math.min(last.start, group.start), end: Math.max(last.end, group.end), patches: [...last.patches, ...group.patches] };
    }
    groups.push(group);
  }
  return groups.map((g) => {
    const parts = [];
    let at = g.start;
    for (const p of g.patches) {
      parts.push(base.slice(at, p.start), p.text);
      at = p.end;
    }
    parts.push(base.slice(at, g.end));
    return { start: g.start, end: g.end, text: parts.join("") };
  });
}
function byLine(base, p) {
  const old = base.slice(p.start, p.end).split("\n");
  const next = p.text.split("\n");
  if (old.length < 2 || old.length !== next.length) return [p];
  const out = [];
  let at = p.start;
  for (let i = 0; i < old.length; i++) {
    const a = old[i], b = next[i];
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    let suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    if (a !== b) out.push({ start: at + pre, end: at + a.length - suf, text: b.slice(pre, b.length - suf) });
    at += a.length + 1;
  }
  return out;
}
function diff2(base, text) {
  if (base === text) return [];
  const found = changes(base, text);
  if (found) return widen(base, found.flatMap((p) => byLine(base, p)));
  let pre = 0;
  const max = Math.min(base.length, text.length);
  while (pre < max && base.charCodeAt(pre) === text.charCodeAt(pre)) pre++;
  let suf = 0;
  while (suf < max - pre && base.charCodeAt(base.length - 1 - suf) === text.charCodeAt(text.length - 1 - suf)) suf++;
  return widen(base, [{ start: pre, end: base.length - suf, text: text.slice(pre, text.length - suf) }]);
}
var size = (patches) => patches.reduce((n, p) => n + p.end - p.start + p.text.length, 0);
function checksum(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${text.length.toString(16)}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

// src/session/authority.ts
var ANSWERS_PER_CLIENT = 32;
var CLIENTS = 1024;
var randomEpoch = () => {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
var Authority = class {
  constructor(text, options = {}) {
    this.n = 0;
    this.log = [];
    this.logBytes = 0;
    this.answers = /* @__PURE__ */ new Map();
    this.observers = /* @__PURE__ */ new Set();
    this.seqOf = /* @__PURE__ */ new Map();
    this.text = text;
    this.epoch = options.epoch ?? randomEpoch();
    this.maxOps = options.maxOps ?? 1e3;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.now = options.now ?? Date.now;
  }
  get version() {
    return formatVersion(this.epoch, this.n);
  }
  // the oldest version whose text can be rebuilt and whose later operations are in the log
  get oldest() {
    return this.n - this.log.length;
  }
  // the n of a version of this epoch that the log reaches, or null
  reach(v) {
    const at = parseVersion(v);
    return at && at.epoch === this.epoch && at.n >= this.oldest && at.n <= this.n ? at.n : null;
  }
  // the operations applied after version v, or null when v is not reached by the log
  since(v) {
    const n = this.reach(v);
    return n === null ? null : this.log.slice(this.log.length - (this.n - n)).map((e) => e.op);
  }
  // the text at version n of this epoch, rebuilt from the inverses of the log, or null
  textAt(n) {
    if (n === this.n) return this.text;
    if (!Number.isInteger(n) || n < this.oldest || n > this.n) return null;
    let text = this.text;
    for (let i = this.log.length - 1; i >= this.log.length - (this.n - n); i--) text = apply(text, this.log[i].inverse);
    return text;
  }
  // calls fn with each applied operation and the text after it, until the returned function is called
  observe(fn) {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }
  // an operation of a browser, of the person author
  submit(request, author) {
    const { client, seq } = request ?? {};
    if (typeof client !== "string" || !Number.isSafeInteger(seq) || seq < 1) return { answer: this.refuse("invalid") };
    const patches = checksum(JSON.stringify(request.patches) ?? "");
    const earlier = this.answers.get(client)?.get(seq);
    if (earlier) return { answer: earlier.base === request.base && earlier.patches === patches ? earlier.answer : this.refuse("invalid") };
    const known = this.answers.get(client);
    if (known && known.size >= ANSWERS_PER_CLIENT && seq < Math.min(...known.keys())) return { answer: this.refuse("stale") };
    const submission = this.order(request);
    let answers = this.answers.get(client);
    if (!answers) {
      this.answers.set(client, answers = /* @__PURE__ */ new Map());
      if (this.answers.size > CLIENTS) this.answers.delete(this.answers.keys().next().value);
    }
    answers.set(seq, { answer: submission.answer, base: request.base, patches });
    if (answers.size > ANSWERS_PER_CLIENT) answers.delete(Math.min(...answers.keys()));
    if (submission.op) {
      submission.op.author = author;
      this.notify(submission.op);
    }
    return submission;
  }
  // patches of the current text, entered as an operation of author, e.g. a change of the file
  enter(patches, author) {
    const seq = (this.seqOf.get(author) ?? 0) + 1;
    this.seqOf.set(author, seq);
    return this.submit({ client: author, seq, base: this.version, patches }, author);
  }
  refuse(reason) {
    return { ok: false, reason, v: this.version };
  }
  order(request) {
    const at = parseVersion(request.base);
    if (!at || at.epoch !== this.epoch || at.n < this.oldest) return { answer: this.refuse("stale") };
    if (at.n > this.n) return { answer: this.refuse("invalid") };
    const first = this.log.length - (this.n - at.n);
    const length = at.n === this.n ? this.text.length : this.log[first].lengthBefore;
    if (!valid(request.patches, length)) return { answer: this.refuse("invalid") };
    let patches = request.patches.map((p) => ({ start: p.start, end: p.end, text: p.text }));
    for (let i = first; i < this.log.length && patches; i++) patches = shift(patches, this.log[i].op.patches, true);
    if (!patches) return { answer: this.refuse("conflict") };
    if (!valid(patches, this.text.length, this.text)) return { answer: this.refuse("invalid") };
    patches = patches.filter((p) => p.start !== p.end || p.text !== "");
    const inverse = invert(this.text, patches);
    const lengthBefore = this.text.length;
    this.text = apply(this.text, patches);
    this.n += 1;
    const op = { v: this.version, client: request.client, seq: request.seq, author: "", time: this.now(), patches, sum: checksum(this.text) };
    const bytes = 64 + patches.reduce((s, p) => s + p.text.length, 0) + inverse.reduce((s, p) => s + p.text.length, 0);
    this.log.push({ op, inverse, lengthBefore, bytes });
    this.logBytes += bytes;
    while (this.log.length > 1 && (this.log.length > this.maxOps || this.logBytes > this.maxBytes)) this.logBytes -= this.log.shift().bytes;
    return { answer: { ok: true, v: this.version }, op };
  }
  notify(op) {
    for (const fn of this.observers) fn(op, this.text);
  }
};

// src/edit/disk.ts
import { chmodSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { chmod, readFile, rename, stat, writeFile } from "node:fs/promises";
import { isUtf8 } from "node:buffer";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
var AUTHOR = "file";
var QUIET = 250;
var LATEST = 1e3;
var POLL = 500;
var SETTLE = 2e3;
var SETTLE_EMPTY = 5e3;
var SETTLE_AT_STOP = 7e3;
var CHAIN_TEXTS = 5e3;
var CHAIN_BYTES = 64 * 1024 * 1024;
var NEAREST = 8;
var NotUtf8 = class extends Error {
};
function decode(bytes) {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new NotUtf8("the file is not valid UTF-8");
  return text.charCodeAt(0) === 65279 ? { text: text.slice(1), bom: true } : { text, bom: false };
}
var encode = (text, bom) => Buffer.from(bom ? `\uFEFF${text}` : text, "utf8");
var signature = (s) => `${s.size}:${s.mtimeMs}:${s.ino}`;
var modeOf = (s) => process.platform === "win32" ? null : s.mode & 4095;
var RETRY = /* @__PURE__ */ new Set(["EPERM", "EBUSY", "EACCES"]);
async function renameRetried(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (e) {
      if (attempt >= 20 || !RETRY.has(e.code ?? "")) throw e;
      await new Promise((done) => setTimeout(done, 10 * (attempt + 1)));
    }
  }
}
function renameRetriedSync(from, to) {
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt++) {
    try {
      return renameSync(from, to);
    } catch (e) {
      if (attempt >= 20 || !RETRY.has(e.code ?? "")) throw e;
      Atomics.wait(wait, 0, 0, 10 * (attempt + 1));
    }
  }
}
var missing = (e) => {
  if (e.code === "ENOENT") return null;
  throw e;
};
function perform(step) {
  if ("sleep" in step) return new Promise((done) => setTimeout(done, step.sleep));
  if ("stat" in step) return stat(step.stat).catch(missing);
  if ("read" in step) return readFile(step.read);
  return writeFile(step.write, step.bytes).then(() => step.mode === null ? void 0 : chmod(step.write, step.mode));
}
var PAUSE = new Int32Array(new SharedArrayBuffer(4));
function performSync(step) {
  if ("sleep" in step) return void Atomics.wait(PAUSE, 0, 0, step.sleep);
  if ("stat" in step) return statSync(step.stat, { throwIfNoEntry: false }) ?? null;
  if ("read" in step) return readFileSync(step.read);
  writeFileSync(step.write, step.bytes);
  if (step.mode !== null) chmodSync(step.write, step.mode);
}
function finish(task) {
  let next = task.next();
  while (!next.done) {
    let value, failed = false;
    try {
      value = performSync(next.value);
    } catch (e) {
      [value, failed] = [e, true];
    }
    next = failed ? task.throw(value) : task.next(value);
  }
}
var copy = (text) => text.length < 16 ? text : Buffer.from(text, "utf16le").toString("utf16le");
var weight = (delta) => delta.reduce((n, p) => n + 2 * p.text.length + 32, 0);
function reverse(text, before2) {
  const max = Math.min(text.length, before2.length);
  let pre = 0, suf = 0;
  for (let c = 65536; c >= 1; c >>= 4) while (pre + c <= max && text.slice(pre, pre + c) === before2.slice(pre, pre + c)) pre += c;
  for (let c = 65536; c >= 1; c >>= 4) {
    while (suf + c <= max - pre && text.slice(text.length - suf - c, text.length - suf) === before2.slice(before2.length - suf - c, before2.length - suf)) suf += c;
  }
  const from = pre === 0 ? 0 : text.lastIndexOf("\n", pre - 1) + 1;
  let to = text.indexOf("\n", text.length - suf);
  if (to < 0) to = text.length;
  const found = changes(text.slice(from, to), before2.slice(from, before2.length - text.length + to)) ?? [
    { start: pre - from, end: text.length - suf - from, text: before2.slice(pre, before2.length - suf) }
  ];
  return found.map((p) => ({ start: p.start + from, end: p.end + from, text: copy(p.text) }));
}
function stepBack(lines, delta, count) {
  const starts = new Array(lines.length);
  for (let i = 0, at = 0; i < lines.length; i++) {
    starts[i] = at;
    at += lines[i].length + 1;
  }
  const lineOf = (at) => {
    let lo = 0, hi = lines.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (starts[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const out = [];
  let next = 0;
  for (let j = 0; j < delta.length; ) {
    const a = lineOf(delta[j].start);
    let k = j, b = lineOf(delta[j].end);
    while (k + 1 < delta.length && lineOf(delta[k + 1].start) <= b) b = lineOf(delta[++k].end);
    const old = lines.slice(a, b + 1), segment = old.join("\n"), at = starts[a];
    let changed = segment.slice(0, delta[j].start - at);
    for (let m = j; m <= k; m++) changed += delta[m].text + segment.slice(delta[m].end - at, m < k ? delta[m + 1].start - at : segment.length);
    const now = changed.split("\n");
    count?.(old, -1);
    count?.(now, 1);
    for (let i = next; i < a; i++) out.push(lines[i]);
    for (const line of now) out.push(line);
    next = b + 1;
    j = k + 1;
  }
  for (let i = next; i < lines.length; i++) out.push(lines[i]);
  return out;
}
function removeQuietly(file) {
  try {
    unlinkSync(file);
  } catch {
  }
}
var Disk = class {
  constructor(file, authority, bom, options = {}) {
    this.mode = null;
    this.known = "";
    // the failed writes in a row, and the time before which a failed write is not tried again
    this.failures = 0;
    this.retryAt = 0;
    this.back = [];
    this.backBytes = 0;
    this.firstUnwritten = null;
    this.timer = null;
    this.poller = null;
    this.busy = null;
    this.stopped = false;
    this.file = file;
    this.authority = authority;
    this.bom = bom;
    this.written = authority.text;
    this.writtenN = authority.n;
    this.log = options.log ?? (() => {
    });
    this.onWriteError = options.onWriteError ?? (() => {
    });
    this.timing = { quiet: options.quiet ?? QUIET, latest: options.latest ?? LATEST, poll: options.poll ?? POLL };
    this.head = authority.text;
    try {
      this.target = realpathSync(file);
    } catch {
      this.target = file;
    }
    try {
      const info = statSync(this.target);
      this.known = signature(info);
      this.mode = modeOf(info);
    } catch {
    }
    const dir = dirname(this.target), prefix = `.${basename(this.target)}.`;
    try {
      for (const name of readdirSync(dir)) {
        if (name.startsWith(prefix) && /^[0-9a-f]{12}\.tmp$/.test(name.slice(prefix.length))) removeQuietly(join(dir, name));
      }
    } catch {
    }
    authority.observe(() => this.schedule());
  }
  start() {
    this.poller = setInterval(() => void this.exclusive(() => this.check(Infinity)), this.timing.poll);
  }
  // an operation was applied: the file is written after 250 ms of quiet, and at the latest 1 s
  // after the first operation that is not written
  schedule() {
    if (this.stopped) return;
    const now = performance.now();
    this.firstUnwritten ??= now;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(this.timing.quiet, this.firstUnwritten + this.timing.latest - now), this.retryAt - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.exclusive(() => this.write());
    }, wait);
  }
  // the text of the authority written at once, at a stop of the edit command, after a change of the
  // file is merged, and the number of operations that are not in the file. a task in flight is left
  // at its next step, hence its write cannot land after this one
  stopSync() {
    if (!this.stopped) {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      if (this.poller) clearInterval(this.poller);
      try {
        finish(this.write(SETTLE_AT_STOP));
      } catch (e) {
        this.log(`could not write ${this.file}: ${e.message}`);
      }
      const unwritten = this.authority.n - this.writtenN;
      if (unwritten) this.log(`${unwritten} operations are not written into ${this.file}`);
    }
    return this.authority.n - this.writtenN;
  }
  // resolves once a write or a check in progress is over
  async idle() {
    while (this.busy) await this.busy;
  }
  async exclusive(task) {
    while (this.busy) await this.busy;
    if (this.stopped) return;
    const run = this.drive(task()).catch((e) => this.log(String(e?.message ?? e)));
    this.busy = run.finally(() => {
      this.busy = null;
    });
    await this.busy;
  }
  // a task run asynchronously, and left at the first step that ends after a stop
  async drive(task) {
    let next = task.next();
    while (!next.done) {
      let value, failed = false;
      try {
        value = await perform(next.value);
      } catch (e) {
        [value, failed] = [e, true];
      }
      if (this.stopped) return void task.return(void 0);
      next = failed ? task.throw(value) : task.next(value);
    }
  }
  tmpName() {
    return join(dirname(this.target), `.${basename(this.target)}.${randomBytes(6).toString("hex")}.tmp`);
  }
  remember(text) {
    if (text === this.head) return;
    const delta = reverse(text, this.head);
    this.back.push(delta);
    this.backBytes += weight(delta);
    this.head = text;
    while (this.back.length > CHAIN_TEXTS || this.backBytes > CHAIN_BYTES) this.backBytes -= weight(this.back.shift());
  }
  *write(limit = Infinity) {
    this.firstUnwritten = null;
    for (let tries = 0; tries < 5; tries++) {
      if (!(yield* this.check(limit))) {
        this.log(`${this.file} is still being written by another program, and the edit command does not write it`);
        return;
      }
      if ((yield* this.put()) !== "changed") return;
    }
    this.schedule();
  }
  // the text of the authority into the file, by a temporary file and a rename, or changed when
  // another program wrote the file in the meantime
  *put() {
    const text = this.authority.text, n = this.authority.n;
    if (text === this.written) {
      this.writtenN = n;
      return;
    }
    const tmp = this.tmpName();
    let renamed = false, made;
    try {
      yield { write: tmp, bytes: encode(text, this.bom), mode: this.mode };
      made = yield { stat: tmp };
      for (let attempt = 0; !renamed; attempt++) {
        const now = statSync(this.target, { throwIfNoEntry: false });
        if ((now ? signature(now) : "") !== this.known) return "changed";
        try {
          renameSync(tmp, this.target);
          renamed = true;
        } catch (e) {
          if (attempt >= 20 || !RETRY.has(e.code ?? "")) throw e;
          yield { sleep: 10 * (attempt + 1) };
        }
      }
    } catch (e) {
      const message = e.message;
      this.log(`could not write ${this.file}${this.stopped ? "" : ", trying again"}: ${message}`);
      this.failures++;
      this.retryAt = performance.now() + Math.min(5e3, this.timing.quiet * 2 ** this.failures);
      this.onWriteError({ message, unwritten: this.authority.n - this.writtenN });
      this.schedule();
      return;
    } finally {
      if (!renamed) removeQuietly(tmp);
    }
    this.written = text;
    this.writtenN = n;
    this.known = signature(made);
    this.remember(text);
    if (this.failures) {
      this.failures = 0;
      this.retryAt = 0;
      this.onWriteError(null);
    }
  }
  // a change of the file that the edit command did not write, or false when the file was still
  // being written after limit ms
  *check(limit) {
    const info = yield { stat: this.target };
    if (!info) {
      this.known = "";
      return true;
    }
    this.mode = modeOf(info);
    let sig = signature(info);
    if (sig === this.known) return true;
    let bytes = yield { read: this.target };
    const before2 = Buffer.byteLength(this.written), started = performance.now();
    let since = started, told = false;
    for (let reads = 0; ; reads++) {
      const wait = bytes.length === 0 ? SETTLE_EMPTY : bytes.length * 2 < before2 || !isUtf8(bytes) ? SETTLE : 0;
      if (!wait && reads >= 20) break;
      if (wait && !told) {
        this.log(`${this.file} looks partly written, and the edit command waits until it has not changed for ${wait / 1e3} s`);
        told = true;
      }
      if (performance.now() - started > limit) return false;
      yield { sleep: wait ? 100 : 20 };
      const now = yield { stat: this.target };
      if (!now) {
        this.known = "";
        return true;
      }
      const again = yield { read: this.target };
      if (!again.equals(bytes)) [bytes, sig, since] = [again, signature(now), performance.now()];
      else if (performance.now() - since >= wait) break;
    }
    let read;
    try {
      read = decode(bytes);
    } catch {
      this.log(`${this.file} was changed into a file that is not valid UTF-8, and the change is left out`);
      this.known = sig;
      return true;
    }
    if (read.text === this.written && read.bom === this.bom) {
      this.known = sig;
      return true;
    }
    yield* this.merge(read.text);
    this.known = sig;
    this.bom = read.bom;
    this.written = read.text;
    if (this.authority.text === read.text) this.writtenN = this.authority.n;
    else this.schedule();
    return true;
  }
  // the text now on disk, written by another program from a text that it read some time before
  *merge(theirs) {
    if (theirs !== this.authority.text) {
      const base = yield* this.nearest(theirs);
      if (base === theirs) this.log(`${this.file} was written with an earlier text of the session, and the edit command keeps the newer edits and writes them back`);
      const current = this.authority.text;
      const file = diff2(base, theirs);
      const session = diff2(base, current);
      const merged = apply(base, mergePatches(session, file, "ours").patches);
      const patches = diff2(current, merged);
      if (patches.length) this.authority.enter(patches, AUTHOR);
    }
    this.remember(theirs);
  }
  // the text of the chain that is nearest to theirs. the texts are rebuilt as lines from the newest
  // back, each is measured by the lines that it has more or fewer of than theirs, and the nearest few
  // are compared by a diff. a change based on a text older than the chain is merged on the kept text
  // nearest to it, hence the edits of the session between the two texts are reverted, since the file
  // lacks them
  *nearest(theirs) {
    const counts = /* @__PURE__ */ new Map();
    let distance = 0;
    const count = (lines2, by) => {
      for (const line of lines2) {
        const was = counts.get(line) ?? 0, now = was + by;
        distance += (Math.abs(now) - Math.abs(was)) * (line.length + 1);
        if (now) counts.set(line, now);
        else counts.delete(line);
      }
    };
    let lines = this.head.split("\n");
    count(lines, 1);
    count(theirs.split("\n"), -1);
    const best = [];
    const keep = (steps) => {
      let i = best.length;
      while (i > 0 && best[i - 1].distance > distance) i--;
      if (i < NEAREST) best.splice(i, 0, { distance, steps });
      if (best.length > NEAREST) best.pop();
    };
    keep(0);
    for (let steps = 1; steps <= this.back.length; steps++) {
      if (distance === 0 && lines.join("\n") === theirs) return theirs;
      lines = stepBack(lines, this.back[this.back.length - steps], count);
      keep(steps);
      if (steps % 256 === 0) yield { sleep: 0 };
    }
    if (distance === 0 && lines.join("\n") === theirs) return theirs;
    let base = "", rank = [Infinity, Infinity];
    lines = this.head.split("\n");
    const farthest = Math.max(...best.map((b) => b.steps));
    for (let steps = 0; steps <= farthest; steps++) {
      if (steps) lines = stepBack(lines, this.back[this.back.length - steps]);
      const candidate = best.find((b) => b.steps === steps);
      if (!candidate) continue;
      const text = lines.join("\n"), found = changes(text, theirs), real = found ? size(found) : Infinity;
      if (real < rank[0] || real === rank[0] && candidate.distance < rank[1]) [base, rank] = [text, [real, candidate.distance]];
      yield { sleep: 0 };
    }
    return base;
  }
};
function readText(file) {
  return decode(readFileSync(file));
}

// src/edit/http.ts
import { open, realpath, stat as stat2 } from "node:fs/promises";
import { extname, join as join2, relative, sep } from "node:path";
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon"
};
var json = (status, value) => ({
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(value)
});
var error = (status, message) => json(status, { error: message });
var hiddenSegment = (s) => s.startsWith(".") || s.endsWith(".") || s.endsWith(" ") || s.toLowerCase() === "node_modules";
function segmentsOf(rest) {
  const out = [];
  for (const raw of rest.split("/")) {
    let s;
    try {
      s = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (s === "" || hiddenSegment(s) || /[\\/:\0]/.test(s)) return null;
    out.push(s);
  }
  return out;
}
async function fileInside(root, segments) {
  try {
    const real = await realpath(join2(root, ...segments));
    if (!real.startsWith(root + sep) || relative(root, real).split(sep).some(hiddenSegment)) return null;
    return (await stat2(real)).isFile() ? real : null;
  } catch {
    return null;
  }
}
function rangeOf(header, size2) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m || !m[1] && !m[2]) return null;
  const start2 = m[1] ? Number(m[1]) : Math.max(0, size2 - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size2 - 1) : size2 - 1;
  return start2 > end || start2 >= size2 ? "bad" : { start: start2, end };
}
async function serveFile(file, request, maxBytes = Infinity) {
  const info = await stat2(file);
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers = {
    "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
    ETag: etag,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff"
  };
  if (request.headers["if-none-match"] === etag) return { status: 304, headers };
  const range = rangeOf(request.headers.range, info.size);
  if (range === "bad") return { status: 416, headers: { ...headers, "Content-Range": `bytes */${info.size}` } };
  if (range) {
    const end = Math.min(range.end, range.start + maxBytes - 1);
    return { status: 206, headers: { ...headers, "Content-Range": `bytes ${range.start}-${end}/${info.size}` }, body: { file, start: range.start, end } };
  }
  if (info.size > maxBytes) return error(413, "the file is too large for the relay, ask for a range");
  return { status: 200, headers, body: { file, start: 0, end: info.size - 1 } };
}
async function readBody(body) {
  const length = Math.max(0, body.end - body.start + 1);
  const buffer = Buffer.alloc(length);
  if (length === 0) return buffer;
  const handle = await open(body.file, "r");
  try {
    let at = 0;
    while (at < length) {
      const { bytesRead } = await handle.read(buffer, at, length - at, body.start + at);
      if (bytesRead === 0) break;
      at += bytesRead;
    }
    return buffer.subarray(0, at);
  } finally {
    await handle.close();
  }
}
function withParam(query, name, value) {
  const parts = query.split("&").filter((p) => p !== "" && decodeName(p) !== name);
  parts.push(`${name}=${encodeURIComponent(value)}`);
  return parts.join("&");
}
var decodeName = (part) => {
  const raw = part.split("=")[0];
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
};
var paramNames = (query) => new Set(query.split("&").filter(Boolean).map(decodeName));

// src/edit/people.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { readFileSync as readFileSync2, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { unlink, writeFile as writeFile2 } from "node:fs/promises";
var HOLD = 25e3;
var GAP = 100;
var GONE = 4e4;
var FIRST_POLL = 5e3;
var MAX_PEOPLE = 64;
var MAX_GUESTS = 48;
var MAX_PAGES = 8;
var MAX_CLIENTS = 1024;
var MAX_KNOWN = 1024;
var SAVE_GAP = 1e3;
var MAX_STATE = 8 * 1024;
var newId = () => randomBytes2(16).toString("base64url");
function readPeople(file) {
  try {
    const value = JSON.parse(readFileSync2(file, "utf8"));
    if (!Array.isArray(value)) return [];
    return value.filter(
      (r) => r && isPersonId(r.person) && cleanPersonName(r.name) && Number.isInteger(r.color) && r.color >= 0 && r.color < COLORS.length && Number.isFinite(r.first) && Number.isFinite(r.last)
    );
  } catch {
    return [];
  }
}
var People = class {
  // file is the people.json of the talk folder, or null to keep the people in memory alone
  constructor(authority, file = null, log = () => {
  }) {
    this.members = /* @__PURE__ */ new Map();
    // the person, the kind, and the token of every page that said hello, so that a browser back
    // from a sleep keeps its person
    this.clients = /* @__PURE__ */ new Map();
    // the client id of each token
    this.tokens = /* @__PURE__ */ new Map();
    this.records = /* @__PURE__ */ new Map();
    // the pages whose session ended, answered with ended until they say hello again
    this.ends = /* @__PURE__ */ new Map();
    this.hostPerson = null;
    this.polls = /* @__PURE__ */ new Set();
    this.rev = 0;
    this.knownRev = 0;
    this.ended = null;
    this.saveTimer = null;
    this.savedAt = 0;
    this.dirty = false;
    this.saving = null;
    this.authority = authority;
    this.file = file;
    this.log = log;
    if (file) for (const r of readPeople(file)) this.records.set(r.person, r);
    authority.observe(() => this.wake());
    this.sweeper = setInterval(() => this.sweep(), 1e3);
    this.sweeper.unref?.();
  }
  // a page joins as the person of the id, or as a new person. a name held by another person is
  // refused unless claim is true, and the page then continues as this person. the token of an
  // earlier hello keeps its client id
  hello(rawName, rawPerson, rawToken, host, claim = false) {
    let person = isPersonId(rawPerson) ? rawPerson : newId();
    const name = cleanPersonName(rawName) || this.records.get(person)?.name || "";
    if (!name) return { empty: true };
    const holder = this.holderOf(name);
    if (holder && holder.person !== person) {
      if (!claim) return { taken: { name: holder.name } };
      person = holder.person;
    }
    const earlier = isToken(rawToken) ? this.tokens.get(rawToken) : void 0;
    const id = earlier ?? randomBytes2(12).toString("base64url");
    const token = earlier ? rawToken : newId();
    if (!this.members.has(id)) {
      const pages = [...this.members.values()].filter((m) => m.person === person);
      if (pages.length >= MAX_PAGES) this.members.delete(pages[0].client);
      if (!this.hasPlace(host)) return { full: true };
    }
    const now = Date.now();
    let record = this.records.get(person);
    if (!record) {
      record = { person, name, color: this.freeColor(), first: now, last: now };
      this.records.set(person, record);
      this.trimRecords();
      this.knownRev++;
    } else {
      if (record.name !== name && !claim) {
        record.name = name;
        this.knownRev++;
      }
      record.last = now;
    }
    this.save();
    if (host) this.hostPerson = person;
    this.ends.delete(id);
    this.clients.delete(id);
    this.clients.set(id, { person, host, token });
    this.tokens.set(token, id);
    if (this.clients.size > MAX_CLIENTS) {
      const [oldest, { token: old }] = this.clients.entries().next().value;
      this.clients.delete(oldest);
      this.tokens.delete(old);
    }
    let member = this.members.get(id);
    const fields = { person, name: record.name, color: record.color, host, lastSeen: now, joined: now, seen: -1, knownSeen: this.knownRev };
    if (member) Object.assign(member, fields);
    else this.members.set(id, member = { client: id, ...fields, polled: false, state: null, lastAnswer: 0, polls: 0 });
    this.renamed(person);
    this.changed();
    return { member, token };
  }
  // a new name of the person of the page client, or null when the page did not say hello
  rename(client, rawName) {
    const member = this.revive(client);
    if (!member) return null;
    const name = cleanPersonName(rawName);
    if (!name) return { empty: true };
    const holder = this.holderOf(name);
    if (holder && holder.person !== member.person) return { taken: { name: holder.name } };
    const record = this.records.get(member.person);
    if (record.name !== name) {
      record.name = name;
      this.knownRev++;
      this.save();
      this.renamed(member.person);
      this.changed();
    }
    return { name };
  }
  // the client id of the page of token, or null
  clientOf(token) {
    return isToken(token) ? this.tokens.get(token) ?? null : null;
  }
  // the person id of a page that said hello, or null
  personOf(client) {
    return typeof client === "string" ? this.clients.get(client)?.person ?? null : null;
  }
  list() {
    return [...this.members.values()].map(({ client, person, name, color, host }) => ({ client, person, name, color, host }));
  }
  known() {
    return [...this.records.values()].map(({ person, name, color }) => ({ person, name, color }));
  }
  presence(client, state) {
    const member = this.revive(client);
    if (!member) return false;
    member.state = state;
    this.changed();
    return true;
  }
  bye(client) {
    if (this.members.delete(client)) this.changed();
  }
  // a long poll of client for the news after the version since
  events(client, since) {
    const end = this.ends.get(client);
    if (end) return Promise.resolve({ ...this.state(since, null), ended: end });
    const member = this.revive(client);
    if (!member) return null;
    return new Promise((done) => {
      const poll = { client, since, done, hold: setTimeout(() => this.answer(poll), HOLD), gap: null };
      this.polls.add(poll);
      member.polls++;
      member.polled = true;
      if (this.ended || this.hasNews(poll)) this.soon(poll);
    });
  }
  // the waiting polls answered with ended, at a stop of the edit command, and people.json written
  end() {
    this.ended = this.endedBy();
    clearInterval(this.sweeper);
    for (const poll of [...this.polls]) this.answer(poll);
    this.saveSync();
  }
  // the session ended for every page that came through the relay. their waiting polls are
  // answered with ended, while the pages of the host go on
  endGuests() {
    const end = this.endedBy();
    for (const [client, { host }] of this.clients) if (!host) this.ends.set(client, end);
    for (const client of this.ends.keys()) if (this.ends.size > MAX_CLIENTS) this.ends.delete(client);
    for (const poll of [...this.polls]) if (this.ends.has(poll.client)) this.answer(poll);
    let gone = false;
    for (const [client, member] of this.members) {
      if (!member.host) {
        this.members.delete(client);
        gone = true;
      }
    }
    if (gone) this.changed();
  }
  endedBy() {
    return { by: this.hostPerson && this.records.get(this.hostPerson)?.name || null };
  }
  holderOf(name) {
    const key = nameKey(name);
    for (const r of this.records.values()) if (nameKey(r.name) === key) return r;
    return null;
  }
  // the tone that the fewest people now present hold, the lowest at a tie
  freeColor() {
    const count = COLORS.map(() => 0);
    const present = new Set([...this.members.values()].map((m) => m.person));
    for (const person of present) {
      const color = this.records.get(person)?.color;
      if (color !== void 0) count[color]++;
    }
    return count.indexOf(Math.min(...count));
  }
  // the absent people who joined least lately dropped from a list over MAX_KNOWN
  trimRecords() {
    if (this.records.size <= MAX_KNOWN) return;
    const present = new Set([...this.members.values()].map((m) => m.person));
    const absent = [...this.records.values()].filter((r) => !present.has(r.person)).sort((a, b) => a.last - b.last);
    for (const r of absent.slice(0, this.records.size - MAX_KNOWN)) this.records.delete(r.person);
  }
  renamed(person) {
    const record = this.records.get(person);
    if (record) {
      for (const m of this.members.values()) if (m.person === person) m.name = record.name;
    }
  }
  revive(client) {
    let member = this.members.get(client);
    const known = this.clients.get(client);
    const record = known && this.records.get(known.person);
    const pages = known ? [...this.members.values()].filter((m) => m.person === known.person).length : 0;
    if (!member && known && record && this.hasPlace(known.host) && pages < MAX_PAGES) {
      const { person, name, color } = record;
      const now = Date.now();
      member = { client, person, name, color, host: known.host, state: null, lastSeen: now, joined: now, polled: false, seen: -1, knownSeen: -1, lastAnswer: 0, polls: 0 };
      this.members.set(client, member);
      this.changed();
    }
    if (member) member.lastSeen = Date.now();
    return member ?? null;
  }
  hasPlace(host) {
    if (this.members.size >= MAX_PEOPLE) return false;
    return host || [...this.members.values()].filter((m) => !m.host).length < MAX_GUESTS;
  }
  changed() {
    this.rev++;
    this.wake();
  }
  hasNews(poll) {
    const member = this.members.get(poll.client);
    const at = this.authority.reach(poll.since);
    return at === null || at < this.authority.n || !member || member.seen < this.rev;
  }
  wake() {
    for (const poll of this.polls) if (this.hasNews(poll)) this.soon(poll);
  }
  // the poll answered now, or once GAP ms have passed since the last answer to its browser
  soon(poll) {
    if (poll.gap) return;
    const member = this.members.get(poll.client);
    const wait = this.ended || !member ? 0 : Math.max(0, member.lastAnswer + GAP - Date.now());
    poll.gap = setTimeout(() => this.answer(poll), wait);
  }
  // known is left out when the page has had the list since its last change
  state(since, member) {
    const presence = [...this.members.values()].map(({ client, name, color, state }) => ({ client, name, color, state }));
    const answer = { v: this.authority.version, ops: this.authority.since(since), presence, people: this.list() };
    if (!member || member.knownSeen < this.knownRev) answer.known = this.known();
    return answer;
  }
  answer(poll) {
    if (!this.polls.delete(poll)) return;
    clearTimeout(poll.hold);
    if (poll.gap) clearTimeout(poll.gap);
    const member = this.members.get(poll.client) ?? null;
    const answer = this.state(poll.since, member);
    if (member) {
      member.seen = this.rev;
      member.knownSeen = this.knownRev;
      member.lastAnswer = Date.now();
      member.lastSeen = Date.now();
      member.polls--;
    }
    const end = this.ended ?? this.ends.get(poll.client);
    if (end) answer.ended = end;
    poll.done(answer);
  }
  sweep() {
    const now = Date.now();
    let gone = false;
    for (const [client, member] of this.members) {
      if (member.polls === 0 && (now - member.lastSeen > GONE || !member.polled && now - member.joined > FIRST_POLL)) {
        this.members.delete(client);
        gone = true;
      }
    }
    if (gone) this.changed();
  }
  json() {
    return `${JSON.stringify([...this.records.values()], null, 1)}
`;
  }
  // people.json written by a temporary file and a rename, at most once a second
  save() {
    if (!this.file) return;
    this.dirty = true;
    if (this.saveTimer || this.saving) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, Math.max(0, this.savedAt + SAVE_GAP - Date.now()));
    this.saveTimer.unref?.();
  }
  async flush() {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    this.savedAt = Date.now();
    const tmp = `${this.file}.${randomBytes2(6).toString("hex")}.tmp`;
    this.saving = (async () => {
      try {
        await writeFile2(tmp, this.json());
        await renameRetried(tmp, this.file);
      } catch (e) {
        await unlink(tmp).catch(() => {
        });
        this.log(`could not write ${this.file}: ${e.message}`);
        this.dirty = true;
      }
    })();
    await this.saving;
    this.saving = null;
    if (this.dirty) this.save();
  }
  saveSync() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.file || !this.dirty && !this.saving) return;
    this.dirty = false;
    const tmp = `${this.file}.${randomBytes2(6).toString("hex")}.tmp`;
    try {
      writeFileSync2(tmp, this.json());
      renameRetriedSync(tmp, this.file);
    } catch (e) {
      this.log(`could not write ${this.file}: ${e.message}`);
      try {
        unlinkSync2(tmp);
      } catch {
      }
    }
  }
};

// src/edit/relay.ts
import { mkdirSync, readFileSync as readFileSync3, writeFileSync as writeFileSync3, chmodSync as chmodSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join3 } from "node:path";
var RELAY_BODY = 16 * 1024 * 1024;
var PULLS = 4;
var FILE_ANSWERS = 8;
function configFile() {
  if (process.platform === "win32") return join3(process.env.APPDATA || join3(homedir(), "AppData", "Roaming"), "beeson-slides", "relay.json");
  return join3(process.env.XDG_CONFIG_HOME || join3(homedir(), ".config"), "beeson-slides", "relay.json");
}
function loadConfig() {
  try {
    const value = JSON.parse(readFileSync3(configFile(), "utf8"));
    return { relay: typeof value.relay === "string" ? value.relay : void 0, secret: typeof value.secret === "string" ? value.secret : void 0 };
  } catch {
    return {};
  }
}
function saveConfig(config) {
  const file = configFile();
  mkdirSync(join3(file, ".."), { recursive: true, mode: 448 });
  writeFileSync3(file, `${JSON.stringify(config, null, 2)}
`, { mode: 384 });
  try {
    chmodSync2(file, 384);
  } catch {
  }
}
var ADDRESS_RULE = "the address of the relay must start with https://";
function relayAddress(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    if (url.protocol !== "https:" && !local || url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
var sleep = (ms) => new Promise((done) => setTimeout(done, ms));
var asciiJson = (value) => JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
var Taken = class extends Error {
  constructor() {
    super("this session is already shared by another edit command, e.g. one started in a copy of this talk folder");
  }
};
var RelayLink = class {
  constructor(relay, secret, key, handle, log) {
    this.token = "";
    this.running = false;
    this.registering = null;
    this.controllers = /* @__PURE__ */ new Set();
    // the requests of guests being answered, which a stop lets finish
    this.serving = /* @__PURE__ */ new Set();
    this.fileSlots = FILE_ANSWERS;
    this.fileQueue = [];
    this.relay = relay;
    this.secret = secret;
    this.key = key;
    this.handle = handle;
    this.log = log;
    this.link = `${relay}/${key}/index.html?edit&session`;
  }
  // false once stopped, or once another edit command took the key
  get active() {
    return this.running;
  }
  // registers the session and starts the pulls. rejects when the relay refuses the registration
  async start() {
    await this.register();
    this.running = true;
    for (let i = 0; i < PULLS; i++) void this.pullLoop();
  }
  async stop() {
    this.running = false;
    for (const c of this.controllers) c.abort();
    await Promise.race([Promise.allSettled([...this.serving]), sleep(1500)]);
    await fetch(`${this.relay}/host/${this.key}`, { method: "DELETE", headers: this.auth(), signal: AbortSignal.timeout(3e3) }).catch(() => {
    });
  }
  auth() {
    return { Authorization: `Bearer ${this.secret}`, "x-relay-token": this.token };
  }
  register() {
    this.registering ??= (async () => {
      try {
        const response = await fetch(`${this.relay}/host/${this.key}`, { method: "POST", headers: this.auth(), signal: AbortSignal.timeout(1e4) });
        if (response.status === 409) {
          await response.body?.cancel();
          throw new Taken();
        }
        if (!response.ok) throw new Error(`the relay refused the session with ${response.status} ${(await response.text()).slice(0, 200)}`);
        const { token } = await response.json();
        if (typeof token !== "string") throw new Error("the relay did not give a token");
        this.token = token;
      } finally {
        this.registering = null;
      }
    })();
    return this.registering;
  }
  async pullLoop() {
    let backoff = 500;
    while (this.running) {
      const controller = new AbortController();
      this.controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 4e4);
      try {
        const response = await fetch(`${this.relay}/host/${this.key}/pull`, { method: "POST", headers: this.auth(), signal: controller.signal });
        if (response.status === 401 || response.status === 404) {
          await response.body?.cancel();
          if (!this.running) break;
          await this.register();
          continue;
        }
        if (!response.ok) throw new Error(`pull answered ${response.status}`);
        const pulled = await response.json();
        if (Array.isArray(pulled)) {
          for (const item of pulled) {
            const serving = this.serve(item);
            this.serving.add(serving);
            void serving.finally(() => this.serving.delete(serving));
          }
        }
        backoff = 500;
      } catch (e) {
        if (!this.running) break;
        if (e instanceof Taken) {
          this.running = false;
          this.log(`the session is no longer shared: ${e.message}`);
          break;
        }
        this.log(`the relay is not reached, trying again: ${e.message}`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 1e4);
      } finally {
        clearTimeout(timer);
        this.controllers.delete(controller);
      }
    }
  }
  async serve(item) {
    if (!item || typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) return;
    let response;
    let body;
    let slot = false;
    try {
      const ok = typeof item.method === "string" && typeof item.path === "string" && typeof item.query === "string" && typeof item.body === "string";
      if (!ok || !item.path.startsWith(`/${this.key}/`)) throw new Error("malformed request");
      const headers = {};
      for (const [k, v] of Object.entries(item.headers ?? {})) if (typeof v === "string") headers[k.toLowerCase()] = v;
      response = await this.handle({ method: item.method, path: item.path, query: item.query, headers, body: Buffer.from(item.body, "base64"), direct: false });
      const b = response.body;
      if (b !== void 0 && typeof b === "object" && !Buffer.isBuffer(b)) {
        if (this.fileSlots > 0) this.fileSlots--;
        else await new Promise((done) => this.fileQueue.push(done));
        slot = true;
      }
      body = b === void 0 ? Buffer.alloc(0) : typeof b === "string" ? Buffer.from(b) : Buffer.isBuffer(b) ? b : await readBody(b);
    } catch (e) {
      response = { status: 502, headers: { "Content-Type": "text/plain" } };
      body = Buffer.from(e.message);
    }
    if (body.length > RELAY_BODY) {
      response = { status: 413, headers: { "Content-Type": "text/plain" } };
      body = Buffer.from("the answer is too large for the relay");
    }
    try {
      const push = async () => {
        const token = this.token;
        const pushed2 = await fetch(`${this.relay}/host/${this.key}/push/${item.id}`, {
          method: "POST",
          headers: { ...this.auth(), "Content-Type": "application/octet-stream", "x-relay-status": String(response.status), "x-relay-headers": asciiJson(response.headers) },
          body,
          signal: AbortSignal.timeout(6e4)
        });
        await pushed2.body?.cancel();
        return { status: pushed2.status, token };
      };
      let pushed = await push();
      if (pushed.status === 401 && this.running) {
        if (this.registering) await this.registering.catch(() => {
        });
        if (this.token === pushed.token) await this.register();
        pushed = await push();
      }
      if (pushed.status < 200 || pushed.status > 299) this.log(`the relay refused an answer with ${pushed.status}`);
    } catch (e) {
      this.log(`an answer did not reach the relay: ${e.message}`);
    } finally {
      if (slot) {
        const next = this.fileQueue.shift();
        if (next) next();
        else this.fileSlots++;
      }
    }
  }
};

// src/edit/command.ts
var DEFAULT_PORT = 8765;
var JSON_MAX = 16 * 1024 * 1024;
var MEDIA_MAX = 64 * 1024 * 1024;
var MEDIA_TYPES = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "mp4", "webm", "json"]);
var AlreadyRunning = class extends Error {
  constructor(found) {
    super(`the edit command already runs for this folder at ${found.url}`);
    this.found = found;
  }
};
async function holderOf(file, root, key) {
  let lock;
  try {
    lock = JSON.parse(readFileSync4(file, "utf8"));
  } catch {
    return null;
  }
  if (!Number.isInteger(lock?.pid) || !Number.isInteger(lock?.port) || lock.root !== root || lock.pid === process.pid) return null;
  try {
    process.kill(lock.pid, 0);
  } catch (e) {
    if (e.code !== "EPERM") return null;
  }
  const url = `http://127.0.0.1:${lock.port}/${key}/`;
  try {
    const answer = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2e3) });
    await answer.body?.cancel();
    return answer.status === 302 ? { url, port: lock.port, key } : null;
  } catch {
    return null;
  }
}
function keyOf(root) {
  const dir = join4(root, ".session");
  mkdirSync2(dir, { recursive: true });
  try {
    writeFileSync4(join4(dir, ".gitignore"), "*\n", { flag: "wx" });
  } catch {
  }
  const file = join4(dir, "key");
  try {
    const key2 = readFileSync4(file, "utf8").trim();
    if (/^[A-Za-z0-9_-]{22,128}$/.test(key2)) return key2;
  } catch {
  }
  const key = randomBytes3(16).toString("base64url");
  writeFileSync4(file, `${key}
`, { mode: 384 });
  return key;
}
function cleanName(raw) {
  let name;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  name = (name.split(/[\\/]/).pop() ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if (!MEDIA_TYPES.has(ext)) return null;
  let stem = name.slice(0, dot).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 80);
  if (!stem) stem = "media";
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/.test(stem)) stem = `${stem}-file`;
  return `${stem}.${ext}`;
}
var isJson = (request) => (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() === "application/json";
async function start(options = {}) {
  const log = options.log ?? ((m) => process.stderr.write(`${m}
`));
  const root = realpathSync2.native(resolve(options.folder ?? "."));
  const index = join4(root, "index.html");
  const { text, bom } = readText(index);
  const key = keyOf(root);
  const lockFile = join4(root, ".session", "lock");
  const earlier = await holderOf(lockFile, root, key);
  if (earlier) throw new AlreadyRunning(earlier);
  const authority = new Authority(text);
  const disk = new Disk(index, authority, bom, { log });
  const people = new People(authority, join4(root, ".session", "people.json"), log);
  let port = 0;
  let relay = null;
  let closed = false;
  let relayQueue = Promise.resolve();
  const serial = (task) => {
    const run = relayQueue.then(task, task);
    relayQueue = run.catch(() => {
    });
    return run;
  };
  async function share(request) {
    if (!request.direct) return error(403, "only the host can share a session");
    if (request.method === "GET") return json(200, { link: relay?.active ? relay.link : null });
    if (request.method === "DELETE") {
      return serial(async () => {
        people.endGuests();
        await relay?.stop();
        relay = null;
        return json(200, { link: null });
      });
    }
    if (request.method !== "POST") return error(405, "GET, POST, or DELETE");
    if (!isJson(request)) return error(415, "the body must be application/json");
    let body;
    try {
      body = JSON.parse(request.body.toString("utf8") || "{}");
    } catch {
      return error(400, "the body is not JSON");
    }
    const saved = loadConfig();
    const address = relayAddress(body.relay ?? saved.relay);
    const secret = body.secret ?? (address !== null && address === relayAddress(saved.relay) ? saved.secret : void 0);
    if (!address) return json(400, { link: null, error: ADDRESS_RULE });
    if (secret === void 0) return json(400, { link: null, error: "a new address of the relay needs the secret" });
    if (typeof secret !== "string" || secret.length < 16) return json(400, { link: null, error: "the secret has fewer than 16 characters" });
    return serial(async () => {
      try {
        await connect(address, secret);
      } catch (e) {
        return json(e instanceof Taken ? 409 : 502, { link: null, error: e.message });
      }
      if (body.relay !== void 0 || body.secret !== void 0) saveConfig({ relay: address, secret });
      return json(200, { link: relay.link });
    });
  }
  async function connect(address, secret) {
    await relay?.stop();
    relay = null;
    if (closed) throw new Error("the edit command is stopping");
    const next = new RelayLink(address, secret, key, handle, log);
    await next.start();
    if (closed) {
      await next.stop();
      throw new Error("the edit command is stopping");
    }
    relay = next;
  }
  async function media(name, request) {
    if (request.method !== "PUT") return error(405, "PUT");
    const clean = cleanName(name);
    if (!clean) return error(415, "the file must be an image, a video, or json");
    if (request.body.length > MEDIA_MAX) return error(413, "the file is larger than 64 MB");
    const dir = join4(root, "media");
    await mkdir(dir, { recursive: true });
    const real = await realpath2(dir);
    if (!real.startsWith(root + sep2)) return error(403, "media/ leaves the talk folder");
    const dot = clean.lastIndexOf(".");
    for (let i = 1; i < 1e3; i++) {
      const candidate = i === 1 ? clean : `${clean.slice(0, dot)}-${i}${clean.slice(dot)}`;
      try {
        await writeFile3(join4(real, candidate), request.body, { flag: "wx" });
        return json(200, { path: `media/${candidate}` });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
    }
    return error(409, "too many files of this name");
  }
  async function api(route, request) {
    if (route.startsWith("media/")) return media(route.slice(6), request);
    if (route === "share") return share(request);
    if (route === "events") {
      if (request.method !== "GET") return error(405, "GET");
      const query = new URLSearchParams(request.query);
      const waiting = people.events(people.clientOf(query.get("token")) ?? "", query.get("since") ?? "");
      return waiting ? json(200, await waiting) : error(404, "say hello first");
    }
    if (!["hello", "name", "op", "presence", "bye"].includes(route)) return error(404, "not found");
    if (request.method !== "POST") return error(405, "POST");
    if (closed && (route === "op" || route === "hello")) return error(503, "the edit command is stopping");
    if (!isJson(request)) return error(415, "the body must be application/json");
    let body;
    try {
      body = JSON.parse(request.body.toString("utf8"));
      if (!body || typeof body !== "object") throw new Error();
    } catch {
      return error(400, "the body is not a JSON object");
    }
    if (route === "hello") {
      const hello = body;
      const joined = people.hello(hello.name, hello.person, hello.token, request.direct, hello.claim === true);
      if ("taken" in joined) return json(200, { taken: joined.taken });
      if ("empty" in joined) return error(400, "the name is empty");
      if ("full" in joined) return error(503, "the session is full");
      const { member, token } = joined;
      const answer = { client: member.client, token, person: member.person, name: member.name, color: member.color, host: member.host, v: authority.version, people: people.list(), known: people.known() };
      const ops = typeof hello.v === "string" ? authority.since(hello.v) : null;
      return json(200, ops ? { ...answer, ops } : { ...answer, text: authority.text });
    }
    const client = people.clientOf(body.token);
    if (route === "op") {
      const person = client === null ? null : people.personOf(client);
      if (client === null || person === null) return json(200, { ok: false, reason: "unknown", v: authority.version });
      if (Array.isArray(body.patches) && body.patches.length > 1e5) return json(200, { ok: false, reason: "invalid", v: authority.version });
      const { seq, base, patches } = body;
      return json(200, authority.submit({ client, seq, base, patches }, person).answer);
    }
    if (!isToken(body.token)) return error(400, "token is missing");
    if (route === "bye") {
      if (client !== null) people.bye(client);
      return json(200, {});
    }
    if (client === null) return error(404, "say hello first");
    if (route === "name") {
      const renamed = people.rename(client, body.name);
      if (!renamed) return error(404, "say hello first");
      if ("empty" in renamed) return error(400, "the name is empty");
      return json(200, renamed);
    }
    if (route === "presence") {
      if ((JSON.stringify(body.state ?? null) ?? "").length > MAX_STATE) return error(413, "the presence is too large");
      return people.presence(client, body.state ?? null) ? json(200, {}) : error(404, "say hello first");
    }
    return error(404, "not found");
  }
  function indexHtml(request) {
    let version = authority.version;
    let html = authority.text;
    if (paramNames(request.query).has("session")) {
      const mode = request.headers["sec-fetch-mode"];
      const navigation = mode ? mode === "navigate" : (request.headers.accept ?? "").includes("text/html");
      const v = new URLSearchParams(request.query).get("v");
      if (navigation && v !== authority.version) {
        return { status: 302, headers: { Location: `index.html?${withParam(request.query, "v", authority.version)}`, "Cache-Control": "no-store" } };
      }
      if (v !== null) {
        const n = authority.reach(v);
        if (n === null) return error(409, `version ${v} is not in the log, the current version is ${authority.version}`);
        html = authority.textAt(n);
        version = v;
      }
    }
    const body = Buffer.from(disk.bom ? `\uFEFF${html}` : html, "utf8");
    return { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "x-session-version": version }, body };
  }
  async function handle(request) {
    const prefix = `/${key}/`;
    if (!request.path.startsWith(prefix)) return error(404, "not found");
    const rest = request.path.slice(prefix.length);
    if (rest.startsWith(".session/")) return api(rest.slice(".session/".length), request);
    if (request.method !== "GET" && request.method !== "HEAD") return error(405, "GET or HEAD");
    if (rest === "") return { status: 302, headers: { Location: "index.html" } };
    const segments = segmentsOf(rest);
    if (!segments) return error(404, "not found");
    if (segments.length === 1 && segments[0].toLowerCase() === "index.html") return indexHtml(request);
    const file = await fileInside(root, segments);
    if (!file) return error(404, "not found");
    return serveFile(file, request, request.direct ? Infinity : RELAY_BODY);
  }
  async function onRequest(req, res) {
    const url = req.url ?? "/";
    const q = url.indexOf("?");
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (v !== void 0) headers[k] = Array.isArray(v) ? v.join(", ") : v;
    if (headers.host !== `127.0.0.1:${port}` && headers.host !== `localhost:${port}`) return send(req, res, error(403, "the Host header is not this computer"));
    const limit = req.method === "PUT" ? MEDIA_MAX : JSON_MAX;
    const chunks = [];
    let length = 0;
    if (Number(headers["content-length"] ?? 0) > limit) return send(req, res, error(413, "the body is too large"), true);
    try {
      for await (const chunk of req) {
        length += chunk.length;
        if (length > limit) return send(req, res, error(413, "the body is too large"), true);
        chunks.push(chunk);
      }
    } catch {
      res.destroy();
      return;
    }
    const request = { method: req.method ?? "GET", path: q < 0 ? url : url.slice(0, q), query: q < 0 ? "" : url.slice(q + 1), headers, body: Buffer.concat(chunks), direct: true };
    let response;
    try {
      response = await handle(request);
    } catch (e) {
      log(`a request failed: ${e.message}`);
      response = error(500, "the request failed");
    }
    send(req, res, response);
  }
  function send(req, res, response, close = false) {
    if (res.headersSent) return;
    const headers = { ...response.headers };
    const b = response.body;
    if (close) headers.Connection = "close";
    const head = req.method === "HEAD";
    if (b !== void 0 && typeof b === "object" && !Buffer.isBuffer(b)) {
      headers["Content-Length"] = String(b.end - b.start + 1);
      res.writeHead(response.status, headers);
      if (head || b.end < b.start) res.end();
      else createReadStream(b.file, { start: b.start, end: b.end }).on("error", () => res.destroy()).pipe(res);
      return;
    }
    const bytes = b === void 0 ? Buffer.alloc(0) : Buffer.isBuffer(b) ? b : Buffer.from(b);
    headers["Content-Length"] = String(bytes.length);
    res.writeHead(response.status, headers);
    res.end(head ? void 0 : bytes);
  }
  const server = createServer(
    (req, res) => onRequest(req, res).catch((e) => {
      log(`a request failed: ${e.message}`);
      res.destroy();
    })
  );
  server.headersTimeout = 2e4;
  server.requestTimeout = 12e4;
  await new Promise((done, fail) => {
    const tryListen = (p) => {
      server.once("error", (e) => {
        if (e.code === "EADDRINUSE" && options.port === void 0 && p !== 0) tryListen(0);
        else fail(e);
      });
      server.listen(p, "127.0.0.1", () => {
        server.removeAllListeners("error");
        done();
      });
    };
    tryListen(options.port ?? DEFAULT_PORT);
  });
  port = server.address().port;
  const lock = JSON.stringify({ pid: process.pid, port, root });
  try {
    writeFileSync4(lockFile, lock, { flag: "wx" });
  } catch {
    const other = await holderOf(lockFile, root, key);
    if (other) {
      people.end();
      await new Promise((done) => server.close(done));
      throw new AlreadyRunning(other);
    }
    const tmp = `${lockFile}.${randomBytes3(6).toString("hex")}.tmp`;
    writeFileSync4(tmp, lock);
    renameRetriedSync(tmp, lockFile);
  }
  const unlock = () => {
    try {
      if (readFileSync4(lockFile, "utf8") === lock) unlinkSync3(lockFile);
    } catch {
    }
  };
  disk.start();
  if (options.relay) {
    const address = relayAddress(options.relay);
    const saved = loadConfig();
    const secret = process.env.SLIDES_RELAY_SECRET || (address !== null && address === relayAddress(saved.relay) ? saved.secret : void 0);
    if (!address) log(`${ADDRESS_RULE}, and the session is not shared`);
    else if (!secret || secret.length < 16) log("the secret of the relay is not set, and the session is not shared");
    else await serial(() => connect(address, secret)).then(() => log(`shared at ${relay.link}`), (e) => log(`the session is not shared: ${e.message}`));
  }
  let closing = null;
  return {
    url: `http://127.0.0.1:${port}/${key}/`,
    port,
    key,
    root,
    authority,
    link: () => relay?.active ? relay.link : null,
    close: () => closing ??= (async () => {
      closed = true;
      unlock();
      people.end();
      const unwritten = disk.stopSync();
      await Promise.race([serial(async () => relay?.stop()), new Promise((done) => setTimeout(done, 2500))]);
      await new Promise((done) => setTimeout(done, 200));
      await new Promise((done) => {
        server.close(() => done());
        setTimeout(() => {
          server.closeAllConnections();
        }, 300);
      });
      return unwritten;
    })()
  };
}

// src/session/replica.ts
var Replica = class _Replica {
  // text is the text at version v that the editor read. seq is the last sequence number used by
  // this client, 0 for a new client
  constructor(client, text, v, seq = 0) {
    // true after a checksum mismatch, a gap in the operations, or a refusal that a new operation does
    // not repair. the client then says hello without v and passes the answer to resync()
    this.needsResync = false;
    // true when an operation was refused as invalid again after the resync that followed the first
    // refusal. nothing is sent any more, and the client asks the person to load the page again
    this.blocked = false;
    this.invalids = 0;
    this.flight = null;
    // after a refusal for a conflict, nothing is sent until base reaches the version of the refusal,
    // since the operation that won may not have been received yet
    this.waitFor = -1;
    const parsed = parseVersion(v);
    if (!parsed) throw new Error(`${v} is not a version`);
    this.client = client;
    this.base = text;
    this.mine = text;
    this.epoch = parsed.epoch;
    this.n = parsed.n;
    this.seq = seq;
  }
  get version() {
    return formatVersion(this.epoch, this.n);
  }
  // true while an operation of this browser waits for its broadcast
  get inFlight() {
    return this.flight !== null;
  }
  // true while an operation of this browser waits for its answer. the client holds a resync back
  // until the answer arrives or the request fails, since only the answer tells whether the text of
  // the authority holds the operation
  get unanswered() {
    return this.flight !== null && !this.flight.answered;
  }
  // the text that the deck reads as after a change of the deck in this browser. returns the text
  // with each lone surrogate replaced by U+FFFD, which the deck must then read as, or null when
  // text is taken as it is
  edit(text) {
    this.mine = wellFormed(text);
    return this.mine === text ? null : this.mine;
  }
  // the operation to send now, or null when one is in flight, a resync is needed, or base is mine
  outgoing() {
    if (this.flight || this.needsResync || this.blocked || this.n < this.waitFor || this.mine === this.base) return null;
    const patches = diff2(this.base, this.mine);
    if (patches.length === 0) return null;
    this.flight = { seq: ++this.seq, patches, answered: false, accepted: null };
    return { client: this.client, seq: this.seq, base: this.version, patches };
  }
  // the answer of the edit command to a request of outgoing(). an accepted operation is applied at
  // its broadcast, and a refused one is carried again by the next diff of base and mine
  answer(request, answer) {
    if (this.flight?.seq !== request.seq) return;
    this.flight.answered = true;
    if (answer.ok) {
      this.invalids = 0;
      const at2 = parseVersion(answer.v);
      this.flight.accepted = at2 && at2.epoch === this.epoch ? at2.n : null;
      return;
    }
    this.flight = null;
    const at = parseVersion(answer.v);
    if (answer.reason === "conflict" || answer.reason === "stale" && request.base !== this.version) {
      this.waitFor = at && at.epoch === this.epoch ? at.n : this.n;
    } else if (answer.reason === "invalid" && ++this.invalids > 1) {
      this.blocked = true;
    } else {
      this.needsResync = true;
    }
  }
  // a broadcast operation. returns the text that the deck must read as, or null when the deck stays
  receive(op) {
    const before2 = this.mine;
    this.take(op, "ours", [], true, false);
    return this.mine === before2 ? null : this.mine;
  }
  // the operations of one answer of events, with the checksum tested after the last one
  receiveAll(ops) {
    const before2 = this.mine;
    ops.forEach((op, i) => this.take(op, "ours", [], i === ops.length - 1, false));
    return this.mine === before2 ? null : this.mine;
  }
  // the patches of mine that conflict with the operations missed while the browser was away, which
  // the client shows the person before it calls catchUp() with the side that wins
  conflictsOf(ops) {
    return this.clone().catchUp(ops, "ours").conflicts;
  }
  // a replica in the same state that can be changed apart, e.g. to find the conflicts of a merge
  clone() {
    return Object.assign(Object.create(_Replica.prototype), this, { flight: this.flight && { ...this.flight } });
  }
  // the operations missed while the browser was away, merged with mine, where the side wins at a
  // conflict. conflicts are the patches of mine that conflicted
  catchUp(ops, wins) {
    const before2 = this.mine;
    const conflicts = [];
    ops.forEach((op, i) => this.take(op, wins, conflicts, i === ops.length - 1, true));
    return { text: this.mine === before2 ? null : this.mine, conflicts };
  }
  // the whole text of the authority at version v, read again after needsResync. the edits of this
  // browser are merged into it, where the side wins at a conflict. conflicts gets the patches of
  // mine that conflicted
  resync(text, v, wins = "ours", conflicts = []) {
    const parsed = parseVersion(v);
    if (!parsed) throw new Error(`${v} is not a version`);
    const before2 = this.mine;
    const from = this.resyncBase(text, parsed);
    const theirs = diff2(from, text);
    const ours = diff2(from, this.mine);
    const kept = theirs.filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text));
    const both = mergePatches(kept, ours, wins);
    conflicts.push(...both.conflicts);
    const merged = apply(from, both.patches);
    this.base = text;
    this.mine = merged;
    this.epoch = parsed.epoch;
    this.n = parsed.n;
    this.flight = null;
    this.waitFor = -1;
    this.needsResync = false;
    return merged === before2 ? null : merged;
  }
  // the text that a resync merges from: base, or base with the operation in flight when the text
  // of the authority holds it, since its patches would otherwise be on both sides of the merge. the
  // text holds an operation accepted at or before its version. without an answer, or after a restart
  // of the edit command, the text holds it when it is nearer to base with it than to base without it
  resyncBase(text, at) {
    const f = this.flight;
    if (!f?.patches) return this.base;
    const mid = apply(this.base, f.patches);
    if (f.accepted !== null && at.epoch === this.epoch && at.n >= f.accepted) return mid;
    return size(diff2(mid, text)) < size(diff2(this.base, text)) ? mid : this.base;
  }
  take(op, wins, conflicts, check, dedupe) {
    if (this.needsResync) return;
    const at = parseVersion(op.v);
    if (at && at.epoch === this.epoch && at.n <= this.n) return;
    if (!at || at.epoch !== this.epoch || at.n !== this.n + 1 || !valid(op.patches, this.base.length)) {
      this.needsResync = true;
      return;
    }
    const next = apply(this.base, op.patches);
    if (op.client === this.client && this.flight?.seq === op.seq) {
      this.flight = null;
    } else if (this.mine === this.base && !this.flight) {
      this.mine = next;
    } else {
      const theirs = op.patches;
      const flown = this.flight?.patches ? shift(this.flight.patches, theirs, true) : null;
      let merged;
      if (this.flight?.patches && flown) {
        const mid = apply(this.base, this.flight.patches);
        const onMid = shift(theirs, this.flight.patches, false) ?? [];
        merged = this.merge(mid, onMid, wins, conflicts, dedupe);
        this.flight.patches = flown;
      } else {
        if (this.flight) this.flight.patches = null;
        merged = this.merge(this.base, theirs, wins, conflicts, dedupe);
      }
      this.mine = merged;
    }
    this.base = next;
    this.n = at.n;
    if (check && checksum(this.base) !== op.sum) this.needsResync = true;
  }
  // the text with theirs and the patches that turn it into mine
  merge(text, theirs, wins, conflicts, dedupe) {
    const ours = diff2(text, this.mine);
    const kept = dedupe ? theirs.filter((t) => !ours.some((o) => o.start === t.start && o.end === t.end && o.text === t.text)) : theirs;
    const merged = mergePatches(kept, ours, wins);
    conflicts.push(...merged.conflicts);
    return apply(text, merged.patches);
  }
};

// src/edit/main.ts
var USAGE = "usage: node theme/edit.mjs [folder] [--port N] [--no-open] [--relay URL]";
function openBrowser(url) {
  const [command, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => process.stderr.write(`Open ${url} in a browser.
`));
    child.unref();
  } catch {
    process.stderr.write(`Open ${url} in a browser.
`);
  }
}
async function main(argv) {
  if (Number(process.versions.node.split(".")[0]) < 20) {
    process.stderr.write(`The edit command needs Node.js 20 or later, and this is Node.js ${process.versions.node}. Install a newer one from https://nodejs.org
`);
    process.exit(1);
  }
  let folder, port, relay, open2 = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-open") open2 = false;
    else if (a === "--port") port = Number(argv[++i]);
    else if (a === "--relay") relay = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(`${USAGE}
`);
      return;
    } else if (!a.startsWith("--") && folder === void 0) folder = a;
    else {
      process.stderr.write(`${a} is not an option. ${USAGE}
`);
      process.exit(2);
    }
  }
  if (port !== void 0 && !(Number.isInteger(port) && port >= 0 && port < 65536)) {
    process.stderr.write(`--port takes a number from 0 to 65535. ${USAGE}
`);
    process.exit(2);
  }
  let running;
  try {
    running = await start({ folder, port, relay });
  } catch (e) {
    if (e instanceof AlreadyRunning) {
      const { url, port: p, key } = e.found;
      process.stdout.write(`${JSON.stringify({ url, port: p, key })}
`);
      process.stderr.write(`The edit command already runs for this folder at ${url}index.html?edit&session
`);
      if (open2) openBrowser(`${url}index.html?edit&session`);
      return;
    }
    const err = e;
    const message = err instanceof NotUtf8 ? "index.html is not valid UTF-8, hence the edit command cannot keep its bytes. Save it as UTF-8 and start again." : err.code === "ENOENT" ? `There is no index.html in ${folder ?? "this folder"}. Start the edit command in a talk folder.` : `The edit command could not start: ${err.message}`;
    process.stderr.write(`${message}
`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ url: running.url, port: running.port, key: running.key })}
`);
  const page = `${running.url}index.html?edit&session`;
  process.stderr.write(`Editing ${running.root}
at ${page}
Keep this window open while you edit, and close it or press Ctrl+C to stop.
`);
  if (open2) openBrowser(page);
  for (const stream of [process.stdout, process.stderr]) stream.on("error", () => {
  });
  const stop = () => {
    void running.close().then((unwritten) => process.exit(unwritten ? 1 : 0), () => process.exit(1));
    setTimeout(() => process.exit(0), 3e3).unref();
  };
  const fail = (e) => {
    process.stderr.write(`The edit command failed: ${e?.stack ?? e}
`);
    void running.close().finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 3e3).unref();
  };
  process.on("uncaughtException", fail);
  process.on("unhandledRejection", fail);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
    try {
      process.on(signal, stop);
    } catch {
    }
  }
}
var isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync3(process.argv[1]) === realpathSync3(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) void main(process.argv.slice(2));
export {
  Authority,
  COLORS,
  Disk,
  NAME_MAX,
  Replica,
  apply,
  changes,
  checksum,
  cleanName,
  cleanPersonName,
  combine,
  conflict,
  decode,
  diff2 as diff,
  formatVersion,
  invert,
  isPersonId,
  mergePatches,
  nameKey,
  parseVersion,
  shift,
  shiftOffset,
  size,
  start,
  tokenize,
  valid,
  widen
};
