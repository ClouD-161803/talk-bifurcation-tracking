/*! edit.mjs 0.9.0-beta.2, the edit command of the synchronous editor of the beeson theme. MIT license. */

// src/edit/main.ts
import { spawn } from "node:child_process";
import { realpathSync as realpathSync3 } from "node:fs";
import { fileURLToPath } from "node:url";

// src/edit/command.ts
import { createReadStream, mkdirSync as mkdirSync3, readFileSync as readFileSync7, realpathSync as realpathSync2, unlinkSync as unlinkSync5, writeFileSync as writeFileSync5 } from "node:fs";
import { mkdir, readdir, readFile as readFile3, realpath as realpath3, stat as stat4, writeFile as writeFile5 } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash, randomBytes as randomBytes6 } from "node:crypto";
import { tmpdir } from "node:os";
import { join as join6, resolve, sep as sep2 } from "node:path";

// src/session/protocol.ts
var VERSION_NAME_MAX = 80;
var COLORS = ["--data-2", "--data-3", "--data-5", "--data-7"];
var HIDDEN = /^[\p{Default_Ignorable_Code_Point}\p{Bidi_Control}\p{Cf}]$/u;
var SELECTOR = /^[\ufe00-\ufe0f\u{e0100}-\u{e01ef}]$/u;
var JOINER = /^[\u200c\u200d]$/u;
var shows = (c) => c !== void 0 && !HIDDEN.test(c) && !/\s/.test(c);
function shown(raw) {
  const chars = Array.from(raw);
  const kept = [];
  chars.forEach((c, i) => {
    const before2 = kept[kept.length - 1];
    if (!HIDDEN.test(c)) kept.push(c);
    else if (SELECTOR.test(c) && (shows(before2) || SELECTOR.test(before2 ?? ""))) kept.push(c);
    else if (JOINER.test(c) && (shows(before2) || SELECTOR.test(before2 ?? "")) && shows(chars[i + 1])) kept.push(c);
  });
  return kept.join("");
}
var FULL = "the session is full";
var NAME_MAX = 40;
var cleanPersonName = (raw) => typeof raw === "string" ? shown(Array.from(shown(raw).replace(/\s+/g, " ").trim()).slice(0, NAME_MAX).join("")).trim() : "";
var nameKey = (name) => cleanPersonName(name).normalize("NFKC").replace(/[\p{Cf}\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu, "").toLowerCase();
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
function classesOf(token) {
  if (token.type !== "start") return [];
  const value = token.attrs.find((a) => a.name === "class")?.value ?? "";
  return value.split(/\s+/).filter(Boolean);
}
var NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\xA0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  ndash: "\u2013",
  mdash: "\u2014",
  minus: "\u2212",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  laquo: "\xAB",
  raquo: "\xBB",
  middot: "\xB7",
  bull: "\u2022",
  times: "\xD7",
  deg: "\xB0",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  shy: "\xAD",
  zwj: "\u200D",
  zwnj: "\u200C"
};
var LEGACY = /* @__PURE__ */ new Set(["amp", "lt", "gt", "quot", "nbsp", "copy", "reg", "times", "deg", "laquo", "raquo", "middot", "shy"]);
var REFERENCE_IN_ATTR = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*)(;?)/g;
function decodeAttr(raw) {
  return raw.replace(REFERENCE_IN_ATTR, (m, body, semi, at) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      const bad = !Number.isFinite(code) || code === 0 || code > 1114111 || code >= 55296 && code <= 57343;
      return bad ? "\uFFFD" : String.fromCodePoint(code);
    }
    const value = NAMED[body];
    if (value === void 0) return m;
    if (semi) return value;
    const next = raw[at + m.length] ?? "";
    return LEGACY.has(body) && !/[A-Za-z0-9=]/.test(next) ? value : m;
  });
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
var copy = (text) => text.length < 13 ? text : JSON.parse(JSON.stringify(text));
function invert(text, patches) {
  let delta = 0;
  return patches.map((p) => {
    const start2 = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    return { start: start2, end: start2 + p.text.length, text: copy(text.slice(p.start, p.end)) };
  });
}
function combine(first2, second) {
  const out = [];
  let i = 0, j = 0;
  while (i < first2.length || j < second.length) {
    if (j >= second.length || i < first2.length && before(first2[i], second[j], true)) out.push(first2[i++]);
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
  if (cached?.text === text) return cached.tokens;
  const tokens = (cached && retokenize(cached, text)) ?? tokenize(text);
  cached = { text, tokens, odd: text.includes("\u0130") };
  return tokens;
}
var AHEAD = 12;
function sharedStart(a, b, n) {
  let i = 0;
  for (let w = 4096; w > 1; w >>= 4) while (i + w <= n && a.slice(i, i + w) === b.slice(i, i + w)) i += w;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}
function sharedEnd(a, b, n) {
  let i = 0;
  for (let w = 4096; w > 1; w >>= 4) while (i + w <= n && a.slice(a.length - i - w, a.length - i) === b.slice(b.length - i - w, b.length - i)) i += w;
  while (i < n && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++;
  return i;
}
function moved(t, d) {
  if (t.type !== "start") return { ...t, start: t.start + d, end: t.end + d };
  return { ...t, start: t.start + d, end: t.end + d, attrs: t.attrs.map((a) => ({ ...a, start: a.start + d, end: a.end + d })) };
}
function retokenize(last, text) {
  const old = last.tokens, n = text.length, d = n - last.text.length;
  const both = Math.min(n, last.text.length);
  const p = sharedStart(last.text, text, both);
  const tail = n - sharedEnd(last.text, text, both - p);
  if (last.odd || text.slice(p, tail).includes("\u0130")) return null;
  let lo = 0, hi = old.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (old[mid].end + AHEAD <= p) lo = mid + 1;
    else hi = mid;
  }
  let kept = lo;
  while (kept > 0 && old[kept - 1].type === "start") kept--;
  const from = kept ? old[kept - 1].end : 0;
  const joins = (at) => {
    let lo2 = 0, hi2 = old.length - 1;
    while (lo2 <= hi2) {
      const mid = lo2 + hi2 >> 1;
      if (old[mid].start < at) lo2 = mid + 1;
      else if (old[mid].start > at) hi2 = mid - 1;
      else return mid > 0 && old[mid - 1].type === "start" ? -1 : mid;
    }
    return -1;
  };
  for (let width = 1024; ; width *= 4) {
    const to = Math.min(n, Math.max(from, tail) + width);
    if (2 * (to - from) > n) return null;
    const out = old.slice(0, kept);
    let afterStart = false;
    let wider = false;
    for (const t of tokenize(text.slice(from, to))) {
      const start2 = t.start + from;
      const j = start2 >= tail && !afterStart ? joins(start2 - d) : -1;
      if (j >= 0) {
        for (let i = j; i < old.length; i++) out.push(d ? moved(old[i], d) : old[i]);
        return out;
      }
      if (wider = to < n && t.end + from + AHEAD > to) break;
      out.push(moved(t, from));
      afterStart = t.type === "start";
    }
    if (!wider && to === n) return out;
  }
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
var LINES = /[^\n]*\n|[^\n]+$/g;
var WORDS = /\w+|\s+|[^\w\s]+/g;
var LONG = 1e3;
function pieces(text, a, b, unit) {
  const parts = [], at = [];
  for (const m of text.slice(a, b).matchAll(unit)) {
    parts.push(m[0]);
    at.push(a + m.index);
  }
  at.push(b);
  return { parts, at };
}
function anchors(a, b) {
  const once = (parts) => {
    const at = /* @__PURE__ */ new Map();
    parts.forEach((p, i) => at.set(p, at.has(p) ? -1 : i));
    return at;
  };
  const inA = once(a), inB = once(b);
  const pairs2 = [];
  a.forEach((p, i) => {
    const j = inB.get(p);
    if (j !== void 0 && j >= 0 && inA.get(p) === i) pairs2.push([i, j]);
  });
  const tails = [];
  const prev = new Int32Array(pairs2.length);
  pairs2.forEach(([, j], k) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (pairs2[tails[mid]][1] < j) lo = mid + 1;
      else hi = mid;
    }
    prev[k] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = k;
  });
  const out = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(pairs2[k]);
  return out.reverse();
}
function narrow(base, a, b, text, out) {
  const n = b - a, m = text.length;
  let pre = 0;
  while (pre < n && pre < m && base.charCodeAt(a + pre) === text.charCodeAt(pre)) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && base.charCodeAt(b - 1 - suf) === text.charCodeAt(m - 1 - suf)) suf++;
  if (pre + suf < n || pre + suf < m) out.push({ start: a + pre, end: b - suf, text: text.slice(pre, m - suf) });
}
function aligned(base, a0, a1, text, b0, b1, unit) {
  const a = pieces(base, a0, a1, unit), b = pieces(text, b0, b1, unit);
  const out = [];
  let i = 0, j = 0;
  for (const [ai, bj] of [...anchors(a.parts, b.parts), [a.parts.length, b.parts.length]]) {
    for (; i < ai && j < bj && a.parts[i] === b.parts[j]; i++, j++) ;
    let ei = ai, ej = bj;
    for (; ei > i && ej > j && a.parts[ei - 1] === b.parts[ej - 1]; ei--, ej--) ;
    if (unit === LINES && ei - i === ej - j) for (; i < ei; i++, j++) narrow(base, a.at[i], a.at[i + 1], b.parts[j], out);
    else if (i < ei || j < ej) narrow(base, a.at[i], a.at[ei], text.slice(b.at[j], b.at[ej]), out);
    i = ai + 1;
    j = bj + 1;
  }
  return out;
}
function cap(base, patches) {
  if (patches.length <= MAX_PATCHES) return patches;
  const run = Math.ceil(patches.length / MAX_PATCHES);
  const out = [];
  for (let i = 0; i < patches.length; i += run) {
    const group = patches.slice(i, i + run);
    const parts = group.flatMap((p, k) => k === 0 ? [p.text] : [base.slice(group[k - 1].end, p.start), p.text]);
    out.push({ start: group[0].start, end: group[group.length - 1].end, text: parts.join("") });
  }
  return out;
}
function diff2(base, text) {
  if (base === text) return [];
  const found = changes(base, text);
  const lines = found ? found.flatMap((p) => byLine(base, p)) : aligned(base, 0, base.length, text, 0, text.length, LINES);
  const patches = lines.flatMap((p) => p.end - p.start > LONG ? aligned(base, p.start, p.end, p.text, 0, p.text.length, WORDS) : [p]);
  return widen(base, cap(base, patches));
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
    this.unwritten = /* @__PURE__ */ new Map();
    this.text = text;
    this.epoch = options.epoch ?? randomEpoch();
    this.maxOps = options.maxOps ?? 1e3;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.now = options.now ?? Date.now;
    this.kept = new Map(options.applied ?? []);
    while (this.kept.size > CLIENTS) this.kept.delete(this.kept.keys().next().value);
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
  // the seq of the last operation of client that the text holds, or undefined when the client is not
  // known. a page asks for it after a restart, since its operation in flight may have been applied
  // although its answer was lost
  applied(client) {
    return this.unwritten.get(client)?.seq ?? this.kept.get(client);
  }
  // the text of version n of this epoch is in index.html. returns true when the table changed. the
  // last operation of a client after n leaves the seq of the client in the table older than the
  // file, hence a page repeats an operation rather than losing it
  written(n) {
    let changed = false;
    for (const [client, last] of this.unwritten) {
      if (last.n > n) continue;
      this.unwritten.delete(client);
      this.kept.delete(client);
      this.kept.set(client, last.seq);
      changed = true;
    }
    while (this.kept.size > CLIENTS) this.kept.delete(this.kept.keys().next().value);
    return changed;
  }
  // the table as [client, seq] pairs, oldest first
  table() {
    return [...this.kept];
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
    const first2 = this.log.length - (this.n - at.n);
    const length = at.n === this.n ? this.text.length : this.log[first2].lengthBefore;
    if (!valid(request.patches, length)) return { answer: this.refuse("invalid") };
    let patches = request.patches.map((p) => ({ start: p.start, end: p.end, text: copy(p.text) }));
    for (let i = first2; i < this.log.length && patches; i++) patches = shift(patches, this.log[i].op.patches, true);
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
    this.unwritten.delete(request.client);
    this.unwritten.set(request.client, { seq: request.seq, n: this.n });
    if (this.unwritten.size > CLIENTS) this.unwritten.delete(this.unwritten.keys().next().value);
    this.logBytes += bytes;
    while (this.log.length > 1 && (this.log.length > this.maxOps || this.logBytes > this.maxBytes)) this.logBytes -= this.log.shift().bytes;
    return { answer: { ok: true, v: this.version }, op };
  }
  notify(op) {
    for (const fn of this.observers) fn(op, this.text);
  }
};

// src/edit/applied.ts
import { randomBytes as randomBytes2 } from "node:crypto";
import { readFileSync as readFileSync2, unlinkSync as unlinkSync2, writeFileSync } from "node:fs";
import { unlink, writeFile as writeFile2 } from "node:fs/promises";

// src/edit/disk.ts
import { constants, copyFileSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync } from "node:fs";
import { chmod, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { isUtf8 } from "node:buffer";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
var AUTHOR = "file";
var QUIET = 250;
var LATEST = 1e3;
var POLL = 500;
var STABLE = 300;
var SETTLE = 2e3;
var SETTLE_EMPTY = 5e3;
var SETTLE_AT_STOP = 7e3;
var CHAIN_TEXTS = 5e3;
var CHAIN_BYTES = 64 * 1024 * 1024;
var SLICE = 15;
var BUDGET = 5e3;
var MAX_LINES2 = 2e3;
var KEPT_CHARS = 16 * 1024 * 1024;
var NotUtf8 = class extends Error {
};
function decode(bytes) {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new NotUtf8("the file is not valid UTF-8");
  return text.charCodeAt(0) === 65279 ? { text: text.slice(1), bom: true } : { text, bom: false };
}
var encode = (text, bom) => Buffer.from(bom ? `\uFEFF${text}` : text, "utf8");
var endsHtml = (text) => /<\/html>\s*$/i.test(typeof text === "string" ? text.slice(-256) : text.subarray(-256).toString("latin1"));
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
function setAsideSync(file, aside, move = true) {
  if (move) {
    try {
      renameRetriedSync(file, aside);
      return true;
    } catch (e) {
      if (e.code === "ENOENT") return true;
    }
  }
  try {
    copyFileSync(file, aside, constants.COPYFILE_EXCL);
    return true;
  } catch {
    return false;
  }
}
var missing = (e) => {
  if (e.code === "ENOENT") return null;
  throw e;
};
function perform(step) {
  if ("sleep" in step) return new Promise((done) => setTimeout(done, step.sleep));
  if ("stat" in step) return stat(step.stat).catch(missing);
  if ("resolve" in step) return realpath(step.resolve).catch(() => step.resolve);
  if ("read" in step) return readFile(step.read);
  return writeFile(step.write, step.bytes).then(() => step.mode === null ? void 0 : chmod(step.write, step.mode));
}
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
var order = (r, s) => r.lines - s.lines || r.chars - s.chars || r.steps - s.steps;
function measure(a, b, cap2) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const n = a.length - pre - suf, m = b.length - pre - suf, max = Math.min(n + m, cap2), off = max + 1;
  const v = new Int32Array(2 * max + 3), rows = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x2 = k === -d || k !== d && v[off + k - 1] < v[off + k + 1] ? v[off + k + 1] : v[off + k - 1] + 1;
      let y2 = x2 - k;
      while (x2 < n && y2 < m && a[pre + x2] === b[pre + y2]) {
        x2++;
        y2++;
      }
      v[off + k] = x2;
      if (x2 >= n && y2 >= m) {
        found = d;
        break;
      }
    }
    rows.push(v.slice(off - d, off + d + 1));
  }
  if (found < 0) return null;
  const runs = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const row = rows[d - 1], k = x - y;
    const down = k === -d || k !== d && row[k - 1 + d - 1] < row[k + 1 + d - 1];
    const pk = down ? k + 1 : k - 1, px = row[pk + d - 1], py = px - pk;
    const ex = down ? px : px + 1, ey = down ? py + 1 : py;
    const later = runs[runs.length - 1];
    if (later && later.a0 === ex && later.b0 === ey) [later.a0, later.b0] = [px, py];
    else runs.push({ a0: px, a1: ex, b0: py, b1: ey });
    [x, y] = [px, py];
  }
  let chars = 0;
  for (const r of runs) {
    const old = a.slice(pre + r.a0, pre + r.a1).join("\n"), now = b.slice(pre + r.b0, pre + r.b1).join("\n");
    if (r.a0 === r.a1 || r.b0 === r.b1) {
      chars += old.length + now.length + 1;
      continue;
    }
    let p = 0;
    while (p < old.length && p < now.length && old.charCodeAt(p) === now.charCodeAt(p)) p++;
    let s = 0;
    while (s < old.length - p && s < now.length - p && old.charCodeAt(old.length - 1 - s) === now.charCodeAt(now.length - 1 - s)) s++;
    chars += old.length + now.length - 2 * (p + s);
  }
  return { lines: found, chars };
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
    // the text last taken from a write of another program
    this.taken = null;
    // the failed writes in a row, and the time before which a failed write is not tried again
    this.failures = 0;
    this.retryAt = 0;
    this.back = [];
    this.backBytes = 0;
    // the texts written since the last text that another program wrote, i.e. the steps back that the
    // search for a base goes. a program that writes the file has read at least its own last text,
    // hence an older text is not its base, although it may be nearer: a program that changes First
    // into Second would otherwise add Second next to First, and it could not take a change back
    this.reach = 0;
    this.firstUnwritten = null;
    this.timer = null;
    this.poller = null;
    this.busy = null;
    this.stopped = false;
    this.stopping = null;
    this.file = file;
    this.authority = authority;
    this.bom = bom;
    this.written = authority.text;
    this.writtenN = authority.n;
    this.log = options.log ?? (() => {
    });
    this.onWriteError = options.onWriteError ?? (() => {
    });
    this.onWritten = options.onWritten ?? (() => {
    });
    this.onPoll = options.onPoll ?? (() => {
    });
    this.timing = {
      quiet: options.quiet ?? QUIET,
      latest: options.latest ?? LATEST,
      poll: options.poll ?? POLL,
      stable: options.stable ?? STABLE,
      partial: options.partial ?? SETTLE,
      budget: options.budget ?? BUDGET
    };
    this.head = authority.text;
    try {
      this.target = realpathSync(file);
    } catch {
      this.target = file;
    }
    try {
      const info2 = statSync(this.target);
      this.known = signature(info2);
      this.mode = modeOf(info2);
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
    this.poller = setInterval(() => {
      void this.exclusive(() => this.check(Infinity));
      this.onPoll();
    }, this.timing.poll);
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
  // the text of the authority written at a stop of the edit command, after a change of the file is
  // merged, and the number of operations that are not in the file. a task in flight is left at its
  // next step, hence its write cannot land after this one
  stop() {
    return this.stopping ??= (async () => {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      if (this.poller) clearInterval(this.poller);
      try {
        await this.drive(this.write(SETTLE_AT_STOP), true);
      } catch (e) {
        this.log(`could not write ${this.file}: ${e.message}`);
      }
      const unwritten = this.authority.n - this.writtenN;
      if (unwritten) this.log(`${unwritten} operations are not written into ${this.file}`);
      return unwritten;
    })();
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
  // a task run asynchronously, and left at the first step that ends after a stop, unless it is the
  // last task, i.e. the one of the stop
  async drive(task, last = false) {
    let next = task.next();
    while (!next.done) {
      let value, failed = false;
      try {
        value = await perform(next.value);
      } catch (e) {
        [value, failed] = [e, true];
      }
      if (this.stopped && !last) return void task.return(void 0);
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
    this.reach++;
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
      this.onWritten(n, text);
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
    this.onWritten(n, text);
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
    const target = yield { resolve: this.file };
    if (target !== this.target) [this.target, this.known] = [target, ""];
    const info2 = yield { stat: this.target };
    if (!info2) {
      this.known = "";
      return true;
    }
    this.mode = modeOf(info2);
    let sig = signature(info2);
    if (sig === this.known) return true;
    let bytes = yield { read: this.target };
    const { stable, partial } = this.timing;
    const before2 = Buffer.byteLength(this.written), ended = endsHtml(this.written), started = performance.now();
    let since = started, told = false;
    for (; ; ) {
      const wait = bytes.length === 0 ? SETTLE_EMPTY : bytes.length * 2 < before2 || !isUtf8(bytes) || ended && !endsHtml(bytes) ? partial : stable;
      if (wait > stable && !told) {
        this.log(`${this.file} looks partly written, and the edit command waits until it has not changed for ${wait / 1e3} s`);
        told = true;
      }
      if (performance.now() - started > limit) return false;
      yield { sleep: Math.min(100, Math.ceil(wait / 3)) };
      const now = yield { stat: this.target };
      if (!now) {
        this.known = "";
        return true;
      }
      if (signature(now) !== sig) {
        [sig, since] = [signature(now), performance.now()];
        bytes = yield { read: this.target };
      } else if (performance.now() - since >= wait) {
        const again = yield { read: this.target };
        if (again.equals(bytes)) break;
        [bytes, since] = [again, performance.now()];
      }
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
    this.written = this.taken = read.text;
    if (this.authority.text === read.text) this.onWritten(this.writtenN = this.authority.n, read.text);
    else this.schedule();
    return true;
  }
  // the text now on disk, written by another program from a text that it read some time before
  *merge(theirs) {
    if (theirs !== this.authority.text) {
      const base = this.taken !== null && theirs.startsWith(this.taken) ? this.taken : yield* this.nearest(theirs);
      if (base === theirs) this.log(`${this.file} was written with an earlier text of the session, and the edit command keeps the newer edits and writes them back`);
      const current = this.authority.text;
      const file = diff2(base, theirs);
      const session = diff2(base, current);
      const merged = apply(base, mergePatches(session, file, "ours").patches);
      const patches = diff2(current, merged);
      if (patches.length) this.authority.enter(patches, AUTHOR);
    }
    this.remember(theirs);
    this.reach = 0;
  }
  // the text nearest to theirs among the last reach + 1 of the chain, i.e. with the smallest line
  // diff to it, then with the fewest characters changed inside the changed lines, then the newest.
  // the texts are rebuilt as lines from the head back, and each gets a lower bound of its rank: the
  // lines that it has more or fewer of than theirs, and the difference of the lengths. the texts are
  // then measured in the order of their bounds, until the bound of the next is above the best rank
  // found. a change based on a text older than the chain is merged on the kept text nearest to it,
  // hence the edits of the session between the two texts are reverted, since the file lacks them
  *nearest(theirs) {
    const back = this.back, budget = this.timing.budget, reach = Math.min(this.reach, back.length);
    let slice = performance.now();
    const deadline = slice + budget;
    function* breathe() {
      if (performance.now() - slice < SLICE) return;
      yield { sleep: 0 };
      slice = performance.now();
    }
    const counts = /* @__PURE__ */ new Map();
    let distance = 0;
    const count = (lines2, by) => {
      for (const line of lines2) {
        const was = counts.get(line) ?? 0, now = was + by;
        distance += Math.abs(now) - Math.abs(was);
        if (now) counts.set(line, now);
        else counts.delete(line);
      }
    };
    const mine = theirs.split("\n");
    let lines = this.head.split("\n"), length = this.head.length;
    count(lines, 1);
    count(mine, -1);
    const every = Math.max(1, Math.ceil(reach * Math.max(1, length) / KEPT_CHARS));
    const kept = /* @__PURE__ */ new Map();
    const bounds = [];
    let best = null, over = false;
    const consider = (steps, at) => {
      const size2 = measure(at, mine, Math.min(best?.rank.lines ?? MAX_LINES2, MAX_LINES2));
      const rank = size2 && { ...size2, steps };
      if (rank && (!best || order(rank, best.rank) < 0)) best = { rank, lines: at };
    };
    for (let steps = 0; ; steps++) {
      if (steps) {
        const delta = back[back.length - steps];
        lines = stepBack(lines, delta, count);
        for (const p of delta) length += p.text.length - (p.end - p.start);
      }
      if (distance === 0 && length === theirs.length && lines.join("\n") === theirs) return theirs;
      bounds.push({ lines: distance, chars: Math.abs(length - theirs.length), steps });
      if (steps % every === 0) kept.set(steps, lines);
      if (steps === 0) consider(0, lines);
      if (steps === reach) break;
      yield* breathe();
      if (over = performance.now() >= deadline) break;
    }
    function* rebuild(steps) {
      const from = steps - steps % every;
      let at = kept.get(from);
      for (let s = from + 1; s <= steps; s++) {
        at = stepBack(at, back[back.length - s]);
        yield* breathe();
      }
      return at;
    }
    bounds.sort(order);
    for (const bound of bounds) {
      if (over || best && order(bound, best.rank) > 0 || bound.lines > MAX_LINES2) break;
      if (bound.steps) consider(bound.steps, yield* rebuild(bound.steps));
      yield* breathe();
      over = performance.now() >= deadline;
    }
    if (over) this.log(`the search for the text that another program changed into ${this.file} was cut after ${budget / 1e3} s, and the change is merged on the nearest text found by then`);
    if (best) return best.lines.join("\n");
    return (yield* rebuild(bounds[0].steps)).join("\n");
  }
};
function readText(file) {
  return decode(readFileSync(file));
}

// src/edit/applied.ts
function readApplied(file) {
  try {
    const value = JSON.parse(readFileSync2(file, "utf8"));
    if (!Array.isArray(value)) return [];
    return value.filter((e) => Array.isArray(e) && typeof e[0] === "string" && e[0].length <= 64 && Number.isSafeInteger(e[1]) && e[1] >= 1);
  } catch {
    return [];
  }
}
function writeApplied(file, table, log) {
  const tmp = `${file}.${randomBytes2(6).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(table));
    renameRetriedSync(tmp, file);
  } catch (e) {
    log(`could not write ${file}: ${e.message}`);
    try {
      unlinkSync2(tmp);
    } catch {
    }
  }
}
var AppliedTable = class {
  constructor(file, log) {
    this.next = null;
    this.saving = null;
    this.stopped = false;
    this.file = file;
    this.log = log;
  }
  write(table) {
    this.next = table;
    if (!this.saving && !this.stopped) this.saving = this.flush();
  }
  // at the stop, after the last write of index.html. the write in flight ends first, since its
  // older table would otherwise replace the newest one
  async stop() {
    this.stopped = true;
    await this.saving;
    if (this.next) writeApplied(this.file, this.next, this.log);
    this.next = null;
  }
  async flush() {
    while (this.next && !this.stopped) {
      const table = this.next;
      this.next = null;
      const tmp = `${this.file}.${randomBytes2(6).toString("hex")}.tmp`;
      try {
        await writeFile2(tmp, JSON.stringify(table));
        await renameRetried(tmp, this.file);
      } catch (e) {
        await unlink(tmp).catch(() => {
        });
        this.log(`could not write ${this.file}: ${e.message}`);
      }
    }
    this.saving = null;
  }
};

// src/edit/history.ts
import { appendFileSync, mkdirSync, readdirSync as readdirSync2, readFileSync as readFileSync3, statSync as statSync2, truncateSync, unlinkSync as unlinkSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { randomBytes as randomBytes3 } from "node:crypto";
import { join as join2 } from "node:path";

// src/session/slides.ts
var VOID = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
var visibility = (t) => {
  if (t.type !== "start") return "";
  const a = t.attrs.find((x) => x.name === "data-visibility");
  return a?.value ? decodeAttr(a.value) : "";
};
function slidesOf(text, tokens = tokenize(text)) {
  const tops = [];
  const stack = [];
  for (const t of tokens) {
    if (t.type === "start" && t.name === "section") {
      const s = { start: t.start, open: t.end, end: text.length, vis: visibility(t), classes: classesOf(t), inner: [] };
      if (stack.length) stack[0].inner.push(s);
      else tops.push(s);
      if (!t.selfClosing) stack.push(s);
    } else if (t.type === "end" && t.name === "section" && stack.length) {
      stack.pop().end = t.end;
    }
  }
  const out = [];
  let place = 0;
  let past = 0;
  let appendix = false;
  for (const top of tops) {
    if (top.vis !== "hidden") place++;
    const shown2 = top.vis === "hidden" ? place + 1 : place;
    const uncounted = top.vis === "uncounted" || !top.vis && (appendix || top.classes.some((c) => c === "title" || c === "section" || c === "closing"));
    if (!appendix && top.classes.includes("closing")) appendix = true;
    if (top.inner.length === 0) {
      out.push({ start: top.start, end: top.end, open: top.open, number: shown2 });
      if (!uncounted) past++;
      continue;
    }
    for (let i = 0; i < top.inner.length; i++) {
      const s = top.inner[i];
      const leaf = !top.inner.some((o, j) => j > i && o.start < s.end);
      if (leaf) out.push({ start: s.start, end: s.end, open: s.open, number: past + 1 });
      if (s.vis !== "uncounted") past++;
    }
  }
  return out;
}
function childrenOf(html) {
  const out = [];
  const stack = [];
  for (const t of tokenize(html)) {
    if (t.type === "start") {
      if (stack.length === 1 && (VOID.has(t.name) || t.selfClosing)) out.push({ start: t.start, end: t.end });
      if (!VOID.has(t.name) && !t.selfClosing) stack.push({ name: t.name, start: t.start });
    } else if (t.type === "end") {
      const at = stack.map((s) => s.name).lastIndexOf(t.name);
      if (at < 0) continue;
      if (at === 1) out.push({ start: stack[1].start, end: t.end });
      stack.length = at;
    }
  }
  return out;
}
function pairs(a, b) {
  const out = [];
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) out.push({ i: pre, j: pre, same: true }), pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const n = a.length - pre - suf, m = b.length - pre - suf;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[pre + i] === b[pre + j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const anchors2 = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[pre + i] === b[pre + j]) anchors2.push([i++, j++]);
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  anchors2.push([n, m]);
  let i0 = 0, j0 = 0;
  for (const [ai, aj] of anchors2) {
    for (const [x, y] of bestPairs(a.slice(pre + i0, pre + ai), b.slice(pre + j0, pre + aj))) out.push({ i: pre + i0 + x, j: pre + j0 + y, same: false });
    if (ai < n) out.push({ i: pre + ai, j: pre + aj, same: true });
    i0 = ai + 1;
    j0 = aj + 1;
  }
  for (let k = suf; k > 0; k--) out.push({ i: a.length - k, j: b.length - k, same: true });
  return out;
}
var shared = (x, y) => {
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let s = 0;
  while (s < x.length - p && s < y.length - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
  return p + s;
};
function bestPairs(a, b) {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return [];
  if (n === m) return a.map((_, i) => [i, i]);
  const k = Math.min(n, m);
  const [short, long, flip] = n < m ? [a, b, false] : [b, a, true];
  const score = Array.from({ length: k + 1 }, () => new Array(long.length + 1).fill(-Infinity));
  for (let j = 0; j <= long.length; j++) score[0][j] = 0;
  for (let i = 1; i <= k; i++) for (let j = i; j <= long.length; j++) score[i][j] = Math.max(score[i][j - 1], score[i - 1][j - 1] + shared(short[i - 1], long[j - 1]));
  const out = [];
  for (let i = k, j = long.length; i > 0; j--) {
    if (score[i][j] !== score[i][j - 1]) {
      out.push(flip ? [j - 1, i - 1] : [i - 1, j - 1]);
      i--;
    }
  }
  return out.reverse();
}
function slideChanges(before2, beforeSlides, after, afterSlides, marks) {
  const a = beforeSlides.map((s) => before2.slice(s.start, s.end));
  const b = afterSlides.map((s) => after.slice(s.start, s.end));
  const matched = pairs(a, b);
  const same = new Set(matched.filter((p) => p.same).map((p) => p.j));
  const slides = /* @__PURE__ */ new Set();
  afterSlides.forEach((s, j) => {
    if (!same.has(j) && marks.some((m) => m.start < m.end ? m.start < s.end && s.start < m.end : s.start < m.start && m.start < s.end)) slides.add(s.number);
  });
  const kept = new Set(matched.map((p) => p.i));
  const gone = beforeSlides.filter((_, i) => !kept.has(i)).map((s) => s.number);
  let elements = 0;
  for (const p of matched) {
    if (p.same) continue;
    const x = childrenOf(a[p.i]).map((r) => a[p.i].slice(r.start, r.end));
    const y = childrenOf(b[p.j]).map((r) => b[p.j].slice(r.start, r.end));
    elements += x.length - pairs(x, y).length;
  }
  const out = { slides: [...slides].sort((x, y) => x - y) };
  if (gone.length || elements) out.removed = { slides: [...new Set(gone)].sort((x, y) => x - y), elements };
  return out;
}

// src/edit/history.ts
var isVersionId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(id);
var newId = () => randomBytes3(9).toString("base64url");
var ASIDE = /^([0-9]{1,16})\.([A-Za-z0-9_-]{1,40})\.([A-Za-z0-9_-]{1,64})\.html$/;
var STEP = 50;
var CHECKPOINTS = 64;
function rangesOf(patches) {
  let delta = 0;
  return patches.map((p) => {
    const start2 = p.start + delta;
    delta += p.text.length - (p.end - p.start);
    return { start: start2, end: start2 + p.text.length };
  });
}
function tidy(marks) {
  marks.sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const m of marks) {
    const last = out[out.length - 1];
    if (last && last.author === m.author && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else out.push({ ...m });
  }
  return out;
}
function first(n, at) {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (at(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
function shifter(patches) {
  const deltas = [0];
  for (const p of patches) deltas.push(deltas[deltas.length - 1] + p.text.length - (p.end - p.start));
  return (offset, after) => {
    const i = first(patches.length, (k) => {
      const p = patches[k];
      return !(p.end < offset || p.end === offset && (p.start < p.end || after));
    });
    return i < patches.length && patches[i].start < offset ? patches[i].start + deltas[i] : offset + deltas[i];
  };
}
function moveMarks(marks, patches, author) {
  if (patches.length === 0) return marks;
  const ranges = rangesOf(patches);
  const written = ranges.filter((r) => r.start < r.end);
  const shift2 = shifter(patches);
  const out = [];
  for (const m of marks) {
    const start2 = shift2(m.start, true);
    const end = m.start === m.end ? start2 : Math.max(start2, shift2(m.end, false));
    if (start2 === end) {
      const r = written[first(written.length, (k2) => written[k2].end >= start2)];
      if (!r || r.start > start2) out.push({ start: start2, end, author: m.author });
      continue;
    }
    let at = start2;
    for (let k2 = first(written.length, (i) => written[i].end > start2); k2 < written.length && written[k2].start < end; k2++) {
      if (written[k2].start > at) out.push({ start: at, end: written[k2].start, author: m.author });
      at = Math.max(at, written[k2].end);
    }
    if (at < end) out.push({ start: at, end, author: m.author });
  }
  const mine = out.filter((m) => m.author === author).sort((a, b) => a.start - b.start);
  let k = 0;
  let reach = -1;
  for (const r of ranges) {
    if (r.start === r.end) {
      while (k < mine.length && mine[k].start <= r.start) reach = Math.max(reach, mine[k++].end);
      if (reach >= r.start) continue;
    }
    out.push({ start: r.start, end: r.end, author });
    reach = Math.max(reach, r.end);
  }
  return tidy(out);
}
function clip(marks, patches, author) {
  const ranges = rangesOf(patches);
  const out = [];
  const dropped = [];
  for (const m of marks) {
    const n = out.length;
    for (let k2 = first(ranges.length, (i) => ranges[i].end >= m.start); k2 < ranges.length && ranges[k2].start <= m.end; k2++) {
      const r = ranges[k2];
      if (m.start === m.end || r.start === r.end) {
        if (m.start === m.end && r.start <= m.start && m.start <= r.end) out.push({ ...m });
        else if (r.start === r.end && m.start <= r.start && r.start <= m.end) out.push({ start: r.start, end: r.start, author: m.author });
      } else if (m.start < r.end && r.start < m.end) {
        out.push({ start: Math.max(m.start, r.start), end: Math.min(m.end, r.end), author: m.author });
      }
    }
    if (out.length === n) dropped.push(m);
  }
  const kept = tidy(out);
  dropped.sort((a, b) => a.start - b.start);
  const furthest = [];
  dropped.forEach((m, i) => furthest.push(i > 0 && dropped[furthest[i - 1]].end >= m.end ? furthest[i - 1] : i));
  const gap = (m, r) => Math.max(0, m.start - r.end, r.start - m.end);
  const nearest = (r) => {
    const i = first(dropped.length, (k2) => dropped[k2].start > r.start);
    const before2 = i > 0 ? dropped[furthest[i - 1]] : null;
    const after = i < dropped.length ? dropped[i] : null;
    if (before2 && (!after || gap(before2, r) <= gap(after, r))) return before2.author;
    return after?.author ?? author;
  };
  const added = [];
  let k = 0;
  let reach = -1;
  for (const r of ranges) {
    const empty = r.start === r.end;
    while (k < kept.length && (empty ? kept[k].start <= r.start : kept[k].start < r.end)) reach = Math.max(reach, kept[k++].end);
    if (empty ? reach >= r.start : reach > r.start) continue;
    added.push({ start: r.start, end: r.end, author: nearest(r) });
    reach = Math.max(reach, r.end);
  }
  return added.length ? tidy([...kept, ...added]) : kept;
}
var copied = (patches) => patches.map((p) => ({ start: p.start, end: p.end, text: copy(p.text) }));
var validPatches = (patches, n) => {
  if (!Array.isArray(patches)) return false;
  let at = 0;
  for (const p of patches) {
    if (!p || typeof p.text !== "string" || !Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < at || p.end < p.start || p.end > n) return false;
    at = p.end;
  }
  return true;
};
var MAX_PATCHES2 = 2e3;
function operationOf(a, b) {
  const patches = diff2(a, b);
  if (patches.length <= MAX_PATCHES2) return patches;
  return [{ start: patches[0].start, end: patches[patches.length - 1].end, text: b.slice(patches[0].start, b.length - (a.length - patches[patches.length - 1].end)) }];
}
var validMarks = (marks, n) => Array.isArray(marks) && marks.every((m) => m && Number.isInteger(m.start) && Number.isInteger(m.end) && 0 <= m.start && m.start <= m.end && m.end <= n && typeof m.author === "string");
var numbers = (x) => Array.isArray(x) && x.every((n) => Number.isInteger(n));
function cleanVersionName(raw) {
  if (typeof raw !== "string") return null;
  const name = shown(raw).replace(new RegExp("(?!\\s)\\p{Cc}", "gu"), "").replace(/\s+/g, " ").trim();
  return Array.from(name).length > VERSION_NAME_MAX ? null : name;
}
var Unreadable = class extends Error {
};
var History = class {
  // dir is the .session folder of the talk
  constructor(dir, authority, options = {}) {
    // grows with every change of the list of versions or of the texts set aside
    this.rev = 0;
    // the count of restores
    this.restores = 0;
    // the patches from the text of the last version to index.html at the start, or null when the
    // history began at this start
    this.found = null;
    this.base = { time: 0, text: "" };
    this.versions = [];
    // the texts after some versions, by index, as starting points of a rebuild
    this.checkpoints = /* @__PURE__ */ new Map();
    this.step = STEP;
    this.lastText = "";
    this.lastSlides = null;
    this.open = null;
    this.timer = null;
    this.bytes = 0;
    // true when the file may not hold every line, after a write that failed
    this.broken = false;
    // true when the file could not be read nor set aside, hence it is not written in this run
    this.frozen = false;
    // the lines of a name in the file, which is written anew once they are many more than the versions
    this.names = 0;
    this.stopped = false;
    this.asides = [];
    // the last restore, with the n of the version of the authority that it made
    this.restored = null;
    this.listeners = /* @__PURE__ */ new Set();
    this.dir = dir;
    this.file = join2(dir, "history.jsonl");
    this.asideDir = join2(dir, "aside");
    this.authority = authority;
    this.quiet = options.quiet ?? 6e4;
    this.longest = options.longest ?? 3e5;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.keep = options.keep ?? 30 * 24 * 3600 * 1e3;
    this.asideBytes = options.asideBytes ?? 8 * 1024 * 1024;
    this.asideFiles = options.asideFiles ?? 50;
    this.checkpointBytes = options.checkpointBytes ?? 16 * 1024 * 1024;
    this.now = options.now ?? Date.now;
    this.clock = options.clock ?? (() => performance.now());
    this.log = options.log ?? (() => {
    });
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
    }
    let loaded = null;
    try {
      loaded = this.load();
    } catch (e) {
      if (!(e instanceof Unreadable)) this.log(`could not read ${this.file}: ${e.message}`);
      const aside = join2(dir, `history-unreadable-${Date.now()}.jsonl`);
      if (setAsideSync(this.file, aside)) this.log(`the version history could not be read, hence it was kept in ${aside} and a new history begins`);
      else {
        this.frozen = true;
        this.log(`the version history could not be read nor kept in ${aside}, hence ${this.file} is left as it is and the history of this run is not written`);
      }
      this.versions = [];
      this.checkpoints.clear();
      this.step = STEP;
    }
    const text = authority.text;
    if (!loaded) {
      this.base = { time: this.now(), text };
      this.lastText = text;
      const start2 = this.version([], [], [], text);
      start2.start = true;
      this.versions.push(start2);
      this.writeAll();
    } else {
      this.found = { before: this.lastText, patches: copied(diff2(this.lastText, text)) };
      if (this.found.patches.length) {
        const patches = this.found.patches;
        const authors = loaded.length ? loaded : [AUTHOR];
        this.push(this.version(authors, patches, clip([], patches, authors.length > 1 ? "" : authors[0]), text), text);
      } else if (loaded.length) this.writeAll();
      if (this.bytes > this.maxBytes) this.compact();
    }
    this.held = text;
    this.readAsides();
    authority.observe((op, after) => this.operation(op, after));
  }
  // calls fn after every change of rev
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  list() {
    return { rev: this.rev, versions: this.versions.map(info).reverse(), aside: [...this.asides].reverse() };
  }
  get(id) {
    const v = this.find(id);
    return v ? { ...info(v), marks: v.marks } : null;
  }
  // the text of the deck at version id, or null for an unknown id
  textOf(id) {
    const i = this.indexOf(id);
    return i < 0 ? null : this.textAt(i);
  }
  // the version of the current state closed at once and named. name is cleaned, and an empty name
  // takes the name off. null for an unknown id, and 'long' for a name over VERSION_NAME_MAX
  name(id, raw) {
    const name = cleanVersionName(raw);
    if (name === null) return "long";
    let v;
    if (id === "current") {
      this.close();
      v = this.versions[this.versions.length - 1] ?? this.close(true);
    } else v = this.find(id);
    if (!v) return null;
    if ((v.name ?? "") !== name) {
      if (name) v.name = name;
      else delete v.name;
      this.append({ kind: "name", id: v.id, name });
      if (++this.names > this.versions.length + 1e3) this.writeAll();
      this.changed();
    }
    return info(v);
  }
  // the deck made to read as version id by one operation of person, between a version of the
  // current state and a version of the restore. null for an unknown id. id is null in the answer
  // when the deck already reads as the version
  restore(id, person) {
    const i = this.indexOf(id);
    if (i < 0) return null;
    const target = this.textAt(i);
    const was = this.versions[i];
    this.close();
    if (this.authority.text === target) return { id: null };
    this.authority.enter(operationOf(this.authority.text, target), person);
    const v = this.close(false, was.id);
    this.restored = { n: this.authority.n, told: { by: person, id: was.id, time: was.time } };
    this.restores++;
    this.changed();
    return { id: v?.id ?? null };
  }
  // the last restore when it is after the version since of a page, which is the latest restore
  // that the page has not had. every restore is after a version of an earlier start
  restoredAfter(since) {
    const at = parseVersion(since);
    if (!at || !this.restored) return null;
    return at.epoch !== this.authority.epoch || at.n < this.restored.n ? this.restored.told : null;
  }
  // a text that a person set aside, or null when it is too large
  setAside(text, author) {
    const bytes = Buffer.from(text, "utf8");
    if (bytes.length > this.asideBytes) return null;
    const aside = { id: newId(), time: this.now(), author };
    mkdirSync(this.asideDir, { recursive: true });
    const tmp = join2(this.asideDir, `.${asideName(aside)}.tmp`);
    writeFileSync2(tmp, bytes);
    renameRetriedSync(tmp, join2(this.asideDir, asideName(aside)));
    this.asides.push(aside);
    const theirs = this.asides.filter((a) => a.author === author);
    for (const old of theirs.slice(0, Math.max(0, theirs.length - this.asideFiles))) {
      this.asides.splice(this.asides.indexOf(old), 1);
      try {
        unlinkSync3(join2(this.asideDir, asideName(old)));
      } catch {
      }
    }
    this.changed();
    return aside;
  }
  // the text set aside as id, or null
  asideText(id) {
    const aside = this.asides.find((a) => a.id === id);
    if (!aside) return null;
    try {
      return readFileSync3(join2(this.asideDir, asideName(aside)), "utf8");
    } catch {
      return null;
    }
  }
  // the open version closed, e.g. at a stop. empty closes a version without a change when there
  // is not any, so that it can be named. restored is the id of the version that it restores
  close(empty = false, restored, text = this.authority.text) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const open2 = this.open;
    this.open = null;
    if (text === this.lastText && !empty) {
      if (open2) this.writeAll();
      return null;
    }
    const patches = copied(diff2(this.lastText, text));
    const author = open2?.author ?? AUTHOR;
    const v = this.version(open2 ? [...open2.authors] : [], patches, clip(open2?.marks ?? [], patches, author), text, open2?.time);
    if (restored) v.restored = restored;
    this.push(v, text);
    return v;
  }
  stopSync() {
    if (this.stopped) return;
    this.close();
    this.stopped = true;
  }
  changed() {
    this.rev++;
    for (const fn of this.listeners) fn();
  }
  find(id) {
    const i = this.indexOf(id);
    return i < 0 ? null : this.versions[i];
  }
  indexOf(id) {
    if (!isVersionId(id)) return -1;
    for (let i = this.versions.length - 1; i >= 0; i--) if (this.versions[i].id === id) return i;
    return -1;
  }
  textAt(i) {
    if (i === this.versions.length - 1) return this.lastText;
    let from = -1;
    for (const k of this.checkpoints.keys()) if (k <= i && k > from) from = k;
    let text = from < 0 ? this.base.text : this.checkpoints.get(from);
    for (let k = from + 1; k <= i; k++) text = apply(text, this.versions[k].patches);
    return text;
  }
  checkpoint(i, text) {
    if ((i + 1) % this.step !== 0) return;
    this.checkpoints.set(i, text);
    const budget = Math.max(this.checkpointBytes, 4 * 2 * text.length);
    const bytes = () => [...this.checkpoints.values()].reduce((sum, t) => sum + 2 * t.length, 0);
    while (this.checkpoints.size > CHECKPOINTS || bytes() > budget) {
      this.step *= 2;
      for (const k of [...this.checkpoints.keys()]) if ((k + 1) % this.step !== 0) this.checkpoints.delete(k);
    }
  }
  // a new version of text, which patches make from the text of the last version
  version(authors, patches, marks, text, time = this.now()) {
    this.lastSlides ??= slidesOf(this.lastText);
    const slides = slidesOf(text);
    const changes2 = slideChanges(this.lastText, this.lastSlides, text, slides, marks);
    this.lastSlides = slides;
    const v = { id: newId(), time, authors, slides: changes2.slides, patches, marks };
    if (changes2.removed) v.removed = changes2.removed;
    return v;
  }
  push(v, text) {
    this.versions.push(v);
    this.lastText = text;
    this.checkpoint(this.versions.length - 1, text);
    const { name, ...line } = v;
    this.append({ kind: "version", ...line });
    if (name) {
      this.append({ kind: "name", id: v.id, name });
      this.names++;
    }
    if (this.bytes > this.maxBytes) this.compact();
    this.changed();
  }
  operation(op, text) {
    if (this.stopped) return;
    const t = this.clock();
    const w = this.now();
    if (this.open && this.due(this.open, t, w)) this.close(false, void 0, this.held);
    this.held = text;
    const open2 = this.open ??= { first: t, last: t, since: w, time: w, authors: /* @__PURE__ */ new Set(), marks: [], author: op.author };
    open2.last = t;
    open2.time = w;
    open2.author = op.author;
    if (!open2.authors.has(op.author)) {
      open2.authors.add(op.author);
      this.append({ kind: "open", author: op.author });
    }
    open2.marks = moveMarks(open2.marks, op.patches, op.author);
    this.arm();
  }
  // whether open is to be closed at the times t of clock and w of now. a wall clock set back does
  // not hold it open, and one that jumped ahead in a sleep closes it
  due(open2, t, w) {
    return t - open2.last >= this.quiet || t - open2.first >= this.longest || w - open2.time >= this.quiet || w - open2.since >= this.longest;
  }
  // one timer at a time, which looks again at the times of the open version when it fires
  arm() {
    if (this.timer || !this.open) return;
    const wait = Math.max(0, Math.min(this.open.last + this.quiet, this.open.first + this.longest) - this.clock());
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.open) return;
      if (this.due(this.open, this.clock(), this.now())) this.close();
      else this.arm();
    }, wait);
    this.timer.unref?.();
  }
  append(line) {
    if (this.frozen) return;
    if (this.broken) {
      this.writeAll();
      return;
    }
    const data = `${JSON.stringify(line)}
`;
    try {
      appendFileSync(this.file, data);
      this.bytes += Buffer.byteLength(data);
    } catch (e) {
      this.log(`could not write ${this.file}: ${e.message}`);
      this.broken = true;
    }
  }
  // the file written anew from memory, by a temporary file and a rename
  writeAll() {
    if (this.frozen) return;
    const lines = [JSON.stringify({ kind: "base", ...this.base })];
    for (const v of this.versions) {
      const { name, ...line } = v;
      lines.push(JSON.stringify({ kind: "version", ...line }));
    }
    const named = this.versions.filter((v) => v.name);
    for (const v of named) lines.push(JSON.stringify({ kind: "name", id: v.id, name: v.name }));
    for (const author of this.open?.authors ?? []) lines.push(JSON.stringify({ kind: "open", author }));
    const data = `${lines.join("\n")}
`;
    const tmp = join2(this.dir, `.history.jsonl.${randomBytes3(6).toString("hex")}.tmp`);
    try {
      writeFileSync2(tmp, data);
      renameRetriedSync(tmp, this.file);
      this.bytes = Buffer.byteLength(data);
      this.names = named.length;
      this.broken = false;
    } catch (e) {
      this.log(`could not write ${this.file}: ${e.message}`);
      this.broken = true;
      try {
        unlinkSync3(tmp);
      } catch {
      }
    }
  }
  // the versions before the oldest of the last keep ms and before the oldest named one left out,
  // the version before them becoming the base
  compact() {
    const cutoff = this.now() - this.keep;
    let k = this.versions.findIndex((v) => v.time >= cutoff);
    if (k < 0) k = this.versions.length - 1;
    const named = this.versions.findIndex((v) => v.name);
    if (named >= 0) k = Math.min(k, named);
    if (k <= 0) return;
    this.base = { time: this.versions[k - 1].time, text: this.textAt(k - 1) };
    this.versions = this.versions.slice(k);
    const kept = /* @__PURE__ */ new Map();
    for (const [i, text] of this.checkpoints) if (i >= k) kept.set(i - k, text);
    this.checkpoints = kept;
    this.step = STEP;
    this.writeAll();
    this.changed();
  }
  // the authors of the lines open after the last version line when the file was read, and null
  // when it does not exist or is empty. throws Unreadable for a file without a base, or with a line
  // other than the last that cannot be read
  load() {
    let content;
    try {
      content = readFileSync3(this.file, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
    if (content === "") return null;
    const lines = content.split("\n");
    let last = lines.length - 1;
    if (lines[last] === "") last--;
    let good = 0;
    let text = "";
    const names = /* @__PURE__ */ new Map();
    let open2 = [];
    for (let i = 0; i <= last; i++) {
      const record = this.parse(lines[i], i, text);
      if (record === null) {
        if (i < last || i === 0) throw new Unreadable();
        try {
          truncateSync(this.file, Buffer.byteLength(content.slice(0, good)));
        } catch {
          this.broken = true;
        }
        break;
      }
      if (record.kind === "base") {
        this.base = { time: record.time, text: record.text };
        text = record.text;
      } else if (record.kind === "version") {
        text = apply(text, record.v.patches);
        this.versions.push(record.v);
        this.checkpoint(this.versions.length - 1, text);
        open2 = [];
      } else if (record.kind === "open") {
        if (!open2.includes(record.author)) open2.push(record.author);
      } else {
        names.set(record.id, record.name);
        this.names++;
      }
      good += lines[i].length + 1;
    }
    if (good > content.length) {
      try {
        appendFileSync(this.file, "\n");
      } catch {
        this.broken = true;
      }
    }
    for (const v of this.versions) {
      const name = names.get(v.id);
      if (name) v.name = name;
    }
    this.lastText = text;
    this.bytes = statSync2(this.file).size;
    return open2;
  }
  parse(line, i, text) {
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      return null;
    }
    if (!r || typeof r !== "object") return null;
    if (i === 0) return r.kind === "base" && Number.isFinite(r.time) && typeof r.text === "string" ? { kind: "base", time: r.time, text: r.text } : null;
    if (r.kind === "name") return isVersionId(r.id) && typeof r.name === "string" ? { kind: "name", id: r.id, name: r.name } : null;
    if (r.kind === "open") return typeof r.author === "string" ? { kind: "open", author: r.author } : null;
    if (r.kind !== "version" || !isVersionId(r.id) || !Number.isFinite(r.time) || !Array.isArray(r.authors) || !r.authors.every((a) => typeof a === "string")) return null;
    if (!validPatches(r.patches, text.length) || !numbers(r.slides)) return null;
    const after = text.length + r.patches.reduce((s, p) => s + p.text.length - (p.end - p.start), 0);
    const v = { id: r.id, time: r.time, authors: r.authors, slides: r.slides, patches: r.patches, marks: validMarks(r.marks, after) ? r.marks : [] };
    const removed = r.removed;
    if (removed && numbers(removed.slides) && Number.isInteger(removed.elements)) v.removed = { slides: removed.slides, elements: removed.elements };
    if (isVersionId(r.restored)) v.restored = r.restored;
    if (r.start === true) v.start = true;
    return { kind: "version", v };
  }
  readAsides() {
    let names = [];
    try {
      names = readdirSync2(this.asideDir);
    } catch {
    }
    for (const name of names) {
      const m = ASIDE.exec(name);
      if (m) this.asides.push({ id: m[2], time: Number(m[1]), author: m[3] });
    }
    this.asides.sort((a, b) => a.time - b.time);
  }
};
var asideName = (a) => `${a.time}.${a.id}.${a.author}.html`;
function info(v) {
  const out = { id: v.id, time: v.time, authors: v.authors, slides: v.slides };
  if (v.name) out.name = v.name;
  if (v.removed) out.removed = v.removed;
  if (v.restored) out.restored = v.restored;
  if (v.start) out.start = true;
  return out;
}

// src/edit/http.ts
import { open, realpath as realpath2, stat as stat2 } from "node:fs/promises";
import { extname, join as join3, relative, sep } from "node:path";
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
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  // an m4v is played as an mp4, which every browser names
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogv": "video/ogg",
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
    const real = await realpath2(join3(root, ...segments));
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
  const info2 = await stat2(file);
  const etag = `W/"${info2.size.toString(16)}-${Math.floor(info2.mtimeMs).toString(16)}"`;
  const headers = {
    "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
    ETag: etag,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff"
  };
  if (request.headers["if-none-match"] === etag) return { status: 304, headers };
  const range = rangeOf(request.headers.range, info2.size);
  if (range === "bad") return { status: 416, headers: { ...headers, "Content-Range": `bytes */${info2.size}` } };
  if (range) {
    const end = Math.min(range.end, range.start + maxBytes - 1);
    return { status: 206, headers: { ...headers, "Content-Range": `bytes ${range.start}-${end}/${info2.size}` }, body: { file, start: range.start, end } };
  }
  if (info2.size > maxBytes) return error(413, "the file is too large for the relay, ask for a range");
  return { status: 200, headers, body: { file, start: 0, end: info2.size - 1 } };
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
import { randomBytes as randomBytes4 } from "node:crypto";
import { readFileSync as readFileSync4, unlinkSync as unlinkSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { unlink as unlink2, writeFile as writeFile3 } from "node:fs/promises";
var HOLD = Number(process.env.SLIDES_POLL_HOLD_MS) || 25e3;
var GAP = 100;
var GONE = Number(process.env.SLIDES_GONE_MS) || 4e4;
var FIRST_POLL = 5e3;
var MAX_PEOPLE = 64;
var MAX_GUESTS = 48;
var MAX_PAGES = 8;
var MAX_CLIENTS = 1024;
var MAX_KNOWN = 1024;
var SAVE_GAP = 1e3;
var MAX_STATE = 8 * 1024;
var newId2 = () => randomBytes4(16).toString("base64url");
function readPeople(file) {
  try {
    const value = JSON.parse(readFileSync4(file, "utf8"));
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
    // from a sleep keeps its person, and whether the page said bye since
    this.clients = /* @__PURE__ */ new Map();
    // the client id of each token
    this.tokens = /* @__PURE__ */ new Map();
    this.records = /* @__PURE__ */ new Map();
    // the pages whose session ended, answered with ended until they say hello again
    this.ends = /* @__PURE__ */ new Map();
    // the guests present at the last end of sharing that have not been answered with ended yet, and
    // the callers that wait until none is left
    this.untold = /* @__PURE__ */ new Set();
    this.toldWaiters = [];
    this.hostPerson = null;
    this.polls = /* @__PURE__ */ new Set();
    this.feedList = [];
    this.rev = 0;
    this.knownRev = 0;
    // the write of index.html that failed last, or null once a write succeeded, and its revision
    this.writeError = null;
    this.writeRev = 0;
    // the message of the write of tex.js that failed last, or null once a write succeeded
    this.texError = null;
    // the changes of tex.js on disk, by the edit command or by another program, counted from the time
    // of the start in ms, which a later run does not repeat
    this.texRev = Date.now();
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
    let person = isPersonId(rawPerson) ? rawPerson : newId2();
    const name = cleanPersonName(rawName) || this.records.get(person)?.name || "";
    if (!name) return { empty: true };
    const holder = this.holderOf(name);
    if (holder && holder.person !== person) {
      if (!claim) return { taken: { name: holder.name } };
      person = holder.person;
    }
    const earlier = isToken(rawToken) ? this.tokens.get(rawToken) : void 0;
    const id = earlier ?? randomBytes4(12).toString("base64url");
    const token = earlier ? rawToken : newId2();
    if (!this.members.has(id)) {
      const pages = [...this.members.values()].filter((m) => m.person === person);
      const dropped = pages.length < MAX_PAGES ? void 0 : pages.find((m) => m.host === host) ?? (host ? pages[0] : void 0);
      if (pages.length >= MAX_PAGES && !dropped) return { full: true };
      if (!this.hasPlace(host, dropped)) return { full: true };
      if (dropped) this.members.delete(dropped.client);
    }
    const now = Date.now();
    let record = this.records.get(person);
    if (!record) {
      record = { person, name, color: this.freeColor(), first: now, last: now };
      this.records.set(person, record);
      this.trimRecords();
      this.knownRev++;
    } else {
      const own = host || earlier !== void 0 && this.clients.get(earlier)?.person === person;
      if (record.name !== name && !claim && own) {
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
      for (const [client, { token: old }] of this.clients) {
        if (this.members.has(client)) continue;
        this.clients.delete(client);
        this.tokens.delete(old);
        break;
      }
    }
    let member = this.members.get(id);
    const fields = { person, name: record.name, color: record.color, host, lastSeen: now, joined: now, seen: -1, knownSeen: this.knownRev, writeSeen: 0, feeds: this.feedList.map((f) => f.rev()) };
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
  // whether the page client is in the session, i.e. said hello and neither left nor was dropped
  present(client) {
    return this.members.has(client);
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
  // the page left, and a request of it that arrives later does not bring it back, only a hello
  bye(client) {
    const known = this.clients.get(client);
    if (known) known.left = true;
    if (this.members.delete(client)) this.changed();
  }
  // a source of news for every page from now on
  feed(f) {
    this.feedList.push(f);
    for (const m of this.members.values()) m.feeds.push(f.rev());
  }
  // the waiting polls woken after a change of a feed
  news() {
    this.wake();
  }
  // a long poll of client for the news after the version since
  events(client, since) {
    const end = this.ends.get(client);
    if (end) {
      this.told(client);
      return Promise.resolve({ ...this.state(since, null), ended: end });
    }
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
  // a write of index.html that failed, or null at the first write that succeeds after it, told to
  // every page when it changed
  writeFailed(error2) {
    if (JSON.stringify(error2) === JSON.stringify(this.writeError)) return;
    this.writeError = error2 && { message: error2.message, unwritten: error2.unwritten };
    this.writeRev++;
    this.changed();
  }
  // a write of tex.js that failed, or null once a derivation does not fail, told to every page as a
  // write of index.html that failed is, when no write of index.html failed
  texFailed(message) {
    if (message === this.texError) return;
    this.texError = message;
    this.writeRev++;
    this.changed();
  }
  // tex.js changed on disk, told to every page, which draws the deck again with it
  texChanged() {
    this.texRev++;
    this.changed();
  }
  // the number of changes of tex.js on disk, for the answer of hello
  tex() {
    return this.texRev;
  }
  // the waiting polls answered with ended, at a stop of the edit command, and people.json written
  end() {
    this.ended = this.endedBy();
    clearInterval(this.sweeper);
    for (const poll of [...this.polls]) this.answer(poll);
    this.saveSync();
  }
  // the session ended for every page that came through the relay. their waiting polls are
  // answered with ended, while the pages of the host go on. resolves once every guest present has
  // been answered with ended, by a waiting poll or by a poll that arrives later
  endGuests() {
    const end = this.endedBy();
    this.untold = new Set([...this.members.values()].filter((m) => !m.host).map((m) => m.client));
    const told = new Promise((done) => this.toldWaiters.push(done));
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
    this.told(null);
    return told;
  }
  told(client) {
    if (client !== null) this.untold.delete(client);
    if (!this.untold.size) for (const done of this.toldWaiters.splice(0)) done();
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
    if (known) {
      this.clients.delete(client);
      this.clients.set(client, known);
    }
    if (!member && known && !known.left && record && this.hasPlace(known.host) && pages < MAX_PAGES) {
      const { person, name, color } = record;
      const now = Date.now();
      member = { client, person, name, color, host: known.host, state: null, lastSeen: now, joined: now, polled: false, seen: -1, knownSeen: -1, writeSeen: 0, feeds: this.feedList.map(() => -1), lastAnswer: 0, polls: 0 };
      this.members.set(client, member);
      this.changed();
    }
    if (member) member.lastSeen = Date.now();
    return member ?? null;
  }
  // whether a page of the kind of host has a place, once the page leaving is dropped
  hasPlace(host, leaving) {
    if (this.members.size - (leaving ? 1 : 0) >= MAX_PEOPLE) return false;
    return host || [...this.members.values()].filter((m) => !m.host && m !== leaving).length < MAX_GUESTS;
  }
  changed() {
    this.rev++;
    this.wake();
  }
  hasNews(poll) {
    const member = this.members.get(poll.client);
    const at = this.authority.reach(poll.since);
    return at === null || at < this.authority.n || !member || member.seen < this.rev || this.feedList.some((f, i) => member.feeds[i] < f.rev());
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
    const answer = { v: this.authority.version, ops: this.authority.since(since), presence, people: this.list(), tex: this.texRev };
    if (!member || member.knownSeen < this.knownRev) answer.known = this.known();
    if (this.writeRev && (!member || member.writeSeen < this.writeRev)) answer.writeError = this.writeError ?? (this.texError === null ? null : { message: this.texError, unwritten: 0, file: "tex.js" });
    if (member) this.feedList.forEach((f, i) => member.feeds[i] < f.rev() && f.write(answer, member.feeds[i], since));
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
      member.writeSeen = this.writeRev;
      member.feeds = this.feedList.map((f) => f.rev());
      member.lastAnswer = Date.now();
      member.polls--;
    }
    const end = this.ended ?? this.ends.get(poll.client);
    if (end) {
      answer.ended = end;
      this.told(poll.client);
    }
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
    const tmp = `${this.file}.${randomBytes4(6).toString("hex")}.tmp`;
    this.saving = (async () => {
      try {
        await writeFile3(tmp, this.json());
        await renameRetried(tmp, this.file);
      } catch (e) {
        await unlink2(tmp).catch(() => {
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
    const tmp = `${this.file}.${randomBytes4(6).toString("hex")}.tmp`;
    try {
      writeFileSync3(tmp, this.json());
      renameRetriedSync(tmp, this.file);
    } catch (e) {
      this.log(`could not write ${this.file}: ${e.message}`);
      try {
        unlinkSync4(tmp);
      } catch {
      }
    }
  }
};

// src/edit/relay.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync5, writeFileSync as writeFileSync4, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join as join4 } from "node:path";
var RELAY_BODY = 16 * 1024 * 1024;
var PULLS = 4;
var FILE_ANSWERS = 8;
function configFile() {
  if (process.platform === "win32") return join4(process.env.APPDATA || join4(homedir(), "AppData", "Roaming"), "beeson-slides", "relay.json");
  return join4(process.env.XDG_CONFIG_HOME || join4(homedir(), ".config"), "beeson-slides", "relay.json");
}
function loadConfig() {
  try {
    const value = JSON.parse(readFileSync5(configFile(), "utf8"));
    return { relay: typeof value.relay === "string" ? value.relay : void 0, secret: typeof value.secret === "string" ? value.secret : void 0 };
  } catch {
    return {};
  }
}
function saveConfig(config) {
  const file = configFile();
  mkdirSync2(join4(file, ".."), { recursive: true, mode: 448 });
  writeFileSync4(file, `${JSON.stringify(config, null, 2)}
`, { mode: 384 });
  try {
    chmodSync(file, 384);
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
  // ended is the record of End session, which the relay answers to the guests that come later
  async stop(ended) {
    this.running = false;
    for (const c of this.controllers) c.abort();
    await Promise.race([Promise.allSettled([...this.serving]), sleep(1500)]);
    const body = ended && JSON.stringify({ ended });
    await fetch(`${this.relay}/host/${this.key}`, { method: "DELETE", headers: { ...this.auth(), ...body && { "Content-Type": "application/json" } }, body, signal: AbortSignal.timeout(3e3) }).catch(() => {
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

// src/edit/tex.ts
import { readFileSync as readFileSync6, statSync as statSync3 } from "node:fs";
import { readFile as readFile2, stat as stat3, unlink as unlink3, writeFile as writeFile4 } from "node:fs/promises";
import { randomBytes as randomBytes5 } from "node:crypto";
import { join as join5 } from "node:path";

// src/accents.ts
var ACCENT = {
  "`": "\u0300",
  "'": "\u0301",
  "^": "\u0302",
  "~": "\u0303",
  '"': "\u0308",
  "=": "\u0304",
  ".": "\u0307",
  u: "\u0306",
  v: "\u030C",
  H: "\u030B",
  c: "\u0327",
  k: "\u0328",
  r: "\u030A",
  d: "\u0323",
  b: "\u0331"
};
var LETTER = { ss: "\xDF", o: "\xF8", O: "\xD8", l: "\u0142", L: "\u0141", ae: "\xE6", AE: "\xC6", oe: "\u0153", OE: "\u0152", aa: "\xE5", AA: "\xC5", i: "\u0131", j: "\u0237" };
var BASE = String.raw`(?:\{\s*(\\[ij]|[A-Za-z])\s*\}|(\\[ij](?![A-Za-z])|[A-Za-z]))`;
var SYMBOL_ACCENT = new RegExp(String.raw`\\([\`'^~"=.])\s*${BASE}`, "g");
var LETTER_ACCENT = new RegExp(String.raw`\\([uvHckrdb])(?:\s*\{\s*(\\[ij]|[A-Za-z])\s*\}|\s+(\\[ij](?![A-Za-z])|[A-Za-z]))`, "g");
var accented = (_, accent, braced, bare2) => {
  const base = (braced ?? bare2 ?? "").replace("\\", "");
  return (base + ACCENT[accent]).normalize("NFC");
};
function words(tex) {
  return tex.replace(SYMBOL_ACCENT, accented).replace(LETTER_ACCENT, accented).replace(/\\(ss|ae|AE|oe|OE|aa|AA|o|O|l|L|i|j)(?![A-Za-z])\s*/g, (_, name) => LETTER[name]).replace(/\\([{}])/g, (_, brace) => brace === "{" ? "" : "").replace(/\\([&%#_])/g, "$1").replace(/\\[,;: ]|~/g, " ").replace(/---/g, "\u2014").replace(/--/g, "\u2013").replace(/``/g, "\u201C").replace(/''/g, "\u201D").replace(/\\[A-Za-z@]+\*?\s*/g, "").replace(/[{}]/g, "").replace(/\u0001/g, "{").replace(/\u0002/g, "}");
}
function plainText(tex) {
  const parts = tex.replace(/\\\$/g, "").split(/(\$[^$]*\$)/);
  return parts.map((part, index) => index % 2 ? part : words(part)).join("").replace(/\u0003/g, "$").replace(/\s+/g, " ").trim();
}

// src/bibtex.ts
var MONTHS = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  oct: "October",
  nov: "November",
  dec: "December"
};
var NAME = /^[^\s,#{}()"=@]+/;
var Skip = class extends Error {
};
var tidy2 = (text) => text.replace(/\s+/g, " ").trim();
function readBibtex(source) {
  const n = source.length;
  const strings = new Map(Object.entries(MONTHS));
  const entries = [];
  const skipped = [];
  const keys = /* @__PURE__ */ new Set();
  const space = (i2) => {
    while (i2 < n && /\s/.test(source[i2])) i2++;
    return i2;
  };
  const unclosed = (shut) => new Skip(shut === "}" ? "a brace is not closed" : "a parenthesis is not closed");
  const name = (i2) => NAME.exec(source.slice(i2, i2 + 200))?.[0] ?? "";
  const group = (i2) => {
    const paren = source[i2] === "(";
    let depth = paren ? 1 : 0;
    for (let k = i2; k < n; k++) {
      if (source[k] === "{") depth++;
      else if (source[k] === "}") depth--;
      else if (paren && source[k] === ")" && depth === 1) depth--;
      if (depth === 0) return k + 1;
    }
    throw unclosed(paren ? ")" : "}");
  };
  const value = (i2, field2) => {
    let text = "";
    for (; ; ) {
      i2 = space(i2);
      if (source[i2] === "{") {
        const end = group(i2);
        text += source.slice(i2 + 1, end - 1);
        i2 = end;
      } else if (source[i2] === '"') {
        let depth = 0;
        let k = i2 + 1;
        for (; k < n && !(source[k] === '"' && depth === 0); k++) {
          if (source[k] === "{") depth++;
          else if (source[k] === "}" && --depth < 0) break;
        }
        if (source[k] !== '"') throw new Skip("a quote is not closed");
        text += source.slice(i2 + 1, k);
        i2 = k + 1;
      } else {
        const word = name(i2);
        if (!word) throw new Skip(`the field ${field2} does not have a value`);
        text += /^\d+$/.test(word) ? word : strings.get(word.toLowerCase()) ?? word;
        i2 += word.length;
      }
      i2 = space(i2);
      if (source[i2] !== "#") return [text, i2];
      i2++;
    }
  };
  const field = (i2, shut) => {
    const named = name(i2);
    if (!named) throw i2 >= n || source[i2] === "@" ? unclosed(shut) : new Skip("the name of a field is expected");
    const equals = space(i2 + named.length);
    if (source[equals] !== "=") throw new Skip(`the field ${named} does not have a value`);
    const [text, end] = value(equals + 1, named);
    return [named.toLowerCase(), text, end];
  };
  const entry = (start2, type, open2, line2) => {
    const shut = source[open2] === "{" ? "}" : ")";
    let i2 = space(open2 + 1);
    const key = /^[^\s,{}()"=#@]*/.exec(source.slice(i2, i2 + 500))?.[0] ?? "";
    i2 = space(i2 + key.length);
    if (!key || source[i2] !== "," && source[i2] !== shut) throw new Skip("the entry does not have a key");
    const fields = {};
    let last = "";
    while (source[i2] !== shut) {
      if (i2 >= n || source[i2] === "@") throw unclosed(shut);
      if (source[i2] !== ",") throw new Skip(`a comma is missing after the field ${last}`);
      i2 = space(i2 + 1);
      if (source[i2] === shut) break;
      const [named, text, end] = field(i2, shut);
      if (!(named in fields)) fields[named] = tidy2(text);
      last = named;
      i2 = space(end);
    }
    if (keys.has(key)) throw new Skip(`the key ${key} is the key of an entry above`);
    keys.add(key);
    entries.push({ type, key, fields, line: line2, start: start2, end: i2 + 1 });
    return i2 + 1;
  };
  let seen = 0;
  let line = 1;
  let i = 0;
  while ((i = source.indexOf("@", i)) >= 0) {
    const start2 = i;
    const head = /^@([A-Za-z]+)\s*[{(]/.exec(source.slice(i, i + 80));
    if (!head) {
      i++;
      continue;
    }
    for (; seen < start2; seen++) if (source[seen] === "\n") line++;
    const type = head[1].toLowerCase();
    const open2 = start2 + head[0].length - 1;
    try {
      if (type === "comment" || type === "preamble") i = group(open2);
      else if (type === "string") {
        const shut = source[open2] === "{" ? "}" : ")";
        const [named, text, end] = field(space(open2 + 1), shut);
        if (source[space(end)] !== shut) throw unclosed(shut);
        strings.set(named, text);
        i = space(end) + 1;
      } else i = entry(start2, type, open2, line);
    } catch (error2) {
      if (!(error2 instanceof Skip)) throw error2;
      const eol = source.indexOf("\n", start2);
      i = eol < 0 ? n : eol;
      skipped.push({ line, text: source.slice(start2, i).trim(), reason: error2.message });
    }
  }
  return { entries, skipped };
}

// src/kinds.ts
var usual = (title, style) => ({ title, style, counter: null });
var USUAL = {
  theorem: usual("Theorem", "plain"),
  lemma: usual("Lemma", "plain"),
  proposition: usual("Proposition", "plain"),
  corollary: usual("Corollary", "plain"),
  definition: usual("Definition", "definition"),
  example: usual("Example", "definition"),
  remark: usual("Remark", "remark"),
  proof: usual("Proof", "remark")
};

// src/preamble.ts
var EXTENSION = {
  amsmath: "",
  amssymb: "",
  amsfonts: "",
  amstext: "",
  amsbsy: "",
  amsopn: "",
  latexsym: "",
  amsthm: "",
  ntheorem: "",
  mathtools: "mathtools",
  physics: "physics",
  braket: "braket",
  cancel: "cancel",
  color: "color",
  xcolor: "color",
  bm: "",
  xspace: "",
  mhchem: "mhchem",
  amscd: "amscd",
  bussproofs: "bussproofs",
  cases: "cases",
  centernot: "centernot",
  colortbl: "colortbl",
  empheq: "empheq",
  extpfeil: "extpfeil",
  gensymb: "gensymb",
  textcomp: "textcomp",
  units: "units",
  upgreek: "upgreek"
};
var UNVENDORED = /* @__PURE__ */ new Set(["bbm", "bbold", "bboldx", "dsfont"]);
var STYLES = ["plain", "definition", "remark"];
var Skip2 = class extends Error {
};
var listed = (names) => names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
var tidy3 = (text) => text.replace(/\s*\n\s*/g, " ").trim();
function uncomment(source) {
  const src = source.replace(/\r\n?/g, "\n");
  let text = "";
  const lines = [];
  let line = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\" && i + 1 < src.length && src[i + 1] !== "\n") {
      text += c + src[i + 1];
      lines.push(line, line);
      i++;
    } else if (c === "%") {
      while (i < src.length && src[i] !== "\n") i++;
      line++;
      while (src[i + 1] === " " || src[i + 1] === "	") i++;
    } else {
      text += c;
      lines.push(line);
      if (c === "\n") line++;
    }
  }
  return { text, lines };
}
function readPreamble(source, options = {}) {
  const macros = {};
  const environments = {};
  const packages = [];
  const theorems = {};
  const skipped = [];
  const lets = /* @__PURE__ */ new Map();
  const files = /* @__PURE__ */ new Set([options.file ?? "preamble.tex"]);
  let style = "plain";
  let order2 = 0;
  let done = false;
  const define = (macro, def) => {
    for (const [alias, { target, entry }] of lets) {
      if (target !== macro) continue;
      delete macros[alias];
      lets.delete(alias);
      skipped.push({ ...entry, reason: `\\${macro} is defined again later in the preamble, and its first meaning cannot be kept` });
    }
    lets.delete(macro);
    macros[macro] = def;
  };
  const scan = (file, source2) => {
    const { text, lines } = uncomment(source2);
    const n = text.length;
    let from = 0;
    let at = 0;
    const space = (i2) => {
      while (i2 < n && /\s/.test(text[i2])) i2++;
      return i2;
    };
    const entry = (end) => ({ order: at, file, line: lines[from], text: tidy3(text.slice(from, end)) });
    const note = (end, reason) => void skipped.push({ ...entry(end), reason });
    const control = (i2) => {
      let end = i2 + 1;
      while (end < n && /[A-Za-z@]/.test(text[end])) end++;
      if (end === i2 + 1) end++;
      return [text.slice(i2 + 1, end), end];
    };
    const group = (i2) => {
      if (text[i2] !== "{") throw new Skip2("a brace is expected");
      let depth = 0;
      for (let k = i2; k < n; k++) {
        if (text[k] === "\\") k++;
        else if (text[k] === "{") depth++;
        else if (text[k] === "}" && --depth === 0) return [text.slice(i2 + 1, k), k + 1];
      }
      throw new Skip2("a brace is not closed");
    };
    const bracket = (i2) => {
      const open2 = space(i2);
      if (text[open2] !== "[") return null;
      let depth = 0;
      for (let k = open2 + 1; k < n; k++) {
        if (text[k] === "\\") k++;
        else if (text[k] === "{") depth++;
        else if (text[k] === "}") depth--;
        else if (text[k] === "]" && depth === 0) return [text.slice(open2 + 1, k), k + 1];
      }
      throw new Skip2("a bracket is not closed");
    };
    const argument = (i2) => {
      const start2 = space(i2);
      if (start2 >= n) throw new Skip2("an argument is missing");
      if (text[start2] === "{") {
        const [inner, end2] = group(start2);
        return [tidy3(inner), end2];
      }
      if (text[start2] !== "\\") return [text[start2], start2 + 1];
      const [name, end] = control(start2);
      return [`\\${name}`, end];
    };
    const macroName = (i2) => {
      const [name, end] = argument(i2);
      if (!/^\\([A-Za-z@]+|.)$/.test(name)) throw new Skip2("the name of a macro is expected");
      return [name.slice(1), end];
    };
    const counts = (i2, owner) => {
      const count = bracket(i2);
      if (!count) return [0, null, i2];
      const args = Number(count[0]);
      if (!Number.isInteger(args) || args < 0 || args > 9) throw new Skip2(`the number of arguments of ${owner} is not read`);
      const preset = bracket(count[1]);
      return preset ? [args, preset[0], preset[1]] : [args, null, count[1]];
    };
    const lineEnd = (start2) => {
      let depth = 0;
      let first2 = -1;
      for (let k = start2; k < n; k++) {
        if (text[k] === "\\") k++;
        else if (text[k] === "{") depth++;
        else if (text[k] === "}") depth--;
        else if (text[k] === "\n") {
          if (first2 < 0) first2 = k;
          if (depth <= 0) return k;
        }
      }
      return depth > 0 && first2 >= 0 ? first2 : n;
    };
    const read = (found) => {
      files.add(found.file);
      scan(found.file, found.text);
    };
    const statement = () => {
      if (text[from] !== "\\") throw new Skip2("not a definition");
      const [name, after] = control(from);
      let i2 = after;
      const starred = text[i2] === "*";
      switch (name) {
        case "newcommand":
        case "renewcommand":
        case "providecommand":
        case "DeclareRobustCommand": {
          const [macro, a] = macroName(starred ? i2 + 1 : i2);
          const [args, preset, b] = counts(a, `\\${macro}`);
          const [body, end] = argument(b);
          if (name !== "providecommand" || !(macro in macros)) define(macro, preset !== null ? [body, args, preset] : args ? [body, args] : body);
          return end;
        }
        case "def":
        case "gdef": {
          const [macro, a] = macroName(i2);
          const brace = text.indexOf("{", a);
          if (brace < 0) throw new Skip2("a brace is expected");
          const params = text.slice(a, brace).replace(/\s/g, "");
          let args = 0;
          while (params.startsWith(`#${args + 1}`, 2 * args)) args++;
          if (params.length !== 2 * args) throw new Skip2("a \\def with delimited parameters is not read");
          const [body, end] = argument(brace);
          define(macro, args ? [body, args] : body);
          return end;
        }
        case "let": {
          const [alias, a] = macroName(i2);
          let b = space(a);
          if (text[b] === "=") b = space(b + 1);
          if (text[b] !== "\\") throw new Skip2("a \\let of a character is not read");
          const [target, end] = control(b);
          const origin = lets.get(target)?.target ?? (target in macros ? null : target);
          const copy2 = macros[target];
          define(alias, origin !== null ? `\\${origin}` : Array.isArray(copy2) ? [...copy2] : copy2);
          if (origin !== null) lets.set(alias, { target: origin, entry: entry(end) });
          return end;
        }
        case "DeclareMathOperator": {
          const [macro, a] = macroName(starred ? i2 + 1 : i2);
          const [body, end] = argument(a);
          define(macro, `\\operatorname${starred ? "*" : ""}{${body}}`);
          return end;
        }
        case "newenvironment":
        case "renewenvironment": {
          const [environment, a] = group(space(starred ? i2 + 1 : i2));
          const [args, preset, b] = counts(a, `the environment ${environment}`);
          const [begin, c] = argument(b);
          const [finish, end] = argument(c);
          environments[environment.trim()] = preset !== null ? [begin, finish, args, preset] : args ? [begin, finish, args] : [begin, finish];
          return end;
        }
        case "usepackage":
        case "RequirePackage": {
          const [names, a] = group(space(bracket(i2)?.[1] ?? i2));
          const end = bracket(a)?.[1] ?? a;
          const missing2 = [];
          const unvendored = [];
          for (const pkg of names.split(",").map((s) => s.trim()).filter(Boolean)) {
            const found = options.resolve?.(pkg, "package");
            if (found) {
              if (!files.has(found.file)) read(found);
            } else if (pkg in EXTENSION) {
              if (EXTENSION[pkg] && !packages.includes(EXTENSION[pkg])) packages.push(EXTENSION[pkg]);
            } else (UNVENDORED.has(pkg) ? unvendored : missing2).push(pkg);
          }
          const reasons = [];
          if (missing2.length) reasons.push(`MathJax does not have an extension for the package${missing2.length > 1 ? "s" : ""} ${listed(missing2)}`);
          if (unvendored.length) reasons.push(`the font of the package${unvendored.length > 1 ? "s" : ""} ${listed(unvendored)} is not vendored`);
          if (reasons.length) note(end, reasons.join(", and "));
          return end;
        }
        case "documentclass":
        case "LoadClass": {
          const [cls, a] = group(space(bracket(i2)?.[1] ?? i2));
          const found = options.resolve?.(cls.trim(), "class");
          if (found && !files.has(found.file)) read(found);
          return bracket(a)?.[1] ?? a;
        }
        case "input":
        case "include": {
          while (text[i2] === " " || text[i2] === "	") i2++;
          let end = i2;
          let named;
          if (text[i2] === "{") [named, end] = group(i2);
          else {
            while (end < n && !/\s/.test(text[end])) end++;
            named = text.slice(i2, end);
          }
          const found = options.resolve?.(named.trim(), "input");
          if (!found) note(end, `the file ${named.trim()} is not found`);
          else if (files.has(found.file)) note(end, `the file ${found.file} is read already`);
          else read(found);
          return end;
        }
        case "theoremstyle": {
          const [named, end] = group(space(i2));
          style = STYLES.includes(named.trim()) ? named.trim() : "plain";
          if (style !== named.trim()) note(end, `the style ${named.trim()} is not plain, definition, or remark, hence plain is used`);
          return end;
        }
        case "newtheorem": {
          const [named, a] = group(space(starred ? i2 + 1 : i2));
          const kind = named.trim();
          const shared2 = bracket(a);
          const [title, b] = group(space(shared2?.[1] ?? a));
          const within = bracket(b);
          const end = within?.[1] ?? b;
          let counter = starred ? null : kind;
          if (!starred && shared2) {
            const other = theorems[shared2[0].trim()]?.counter;
            if (other) counter = other;
            else note(end, `the counter ${shared2[0].trim()} is not the counter of a kind, hence ${kind} is numbered by itself`);
          } else if (!starred && within) note(end, `a number within ${within[0].trim()} is not read, hence ${kind} is numbered through the deck`);
          theorems[kind] = { title: plainText(title), style, counter };
          return end;
        }
        case "begin": {
          const [environment] = group(space(i2));
          if (environment.trim() !== "document") throw new Skip2("not a definition");
          done = true;
          return n;
        }
        case "endinput":
          return n;
        case "NeedsTeXFormat":
        case "ProvidesPackage":
        case "ProvidesClass":
        case "ProvidesFile": {
          const [, a] = group(space(i2));
          return bracket(a)?.[1] ?? a;
        }
        case "makeatletter":
        case "makeatother":
        case "relax":
        case "long":
        case "global":
        case "protected":
          return i2;
        default:
          throw new Skip2("not a definition");
      }
    };
    let i = 0;
    while (!done) {
      from = space(i);
      if (from >= n) break;
      at = ++order2;
      try {
        i = statement();
      } catch (error2) {
        if (!(error2 instanceof Skip2)) throw error2;
        i = lineEnd(from);
        note(i, error2.message);
      }
    }
  };
  scan(options.file ?? "preamble.tex", source);
  skipped.sort((a, b) => a.order - b.order);
  return { macros, environments, packages, theorems, skipped: skipped.map(({ file, line, text, reason }) => ({ file, line, text, reason })) };
}

// src/reference.ts
var VENUE = ["shortjournal", "journal", "journaltitle", "booktitle", "publisher", "school", "institution", "howpublished"];
function split(text, separator) {
  let depth = 0;
  let masked = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    masked += depth > 0 ? "\0" : text[i];
    if (text[i] === "}") depth--;
  }
  const parts = [];
  let from = 0;
  for (const match of masked.matchAll(separator)) {
    parts.push(text.slice(from, match.index));
    from = match.index + match[0].length;
  }
  parts.push(text.slice(from));
  return parts;
}
function particle(word) {
  const first2 = plainText(word)[0] ?? "";
  return !/^\{[^\\]/.test(word) && first2 !== first2.toUpperCase() && first2 === first2.toLowerCase();
}
function namesOf(field) {
  const names = [];
  let others = false;
  for (const raw of split(field.trim(), /\s+and\s+/gi)) {
    const text = raw.trim();
    if (!text) continue;
    if (text.toLowerCase() === "others") {
      others = true;
      continue;
    }
    const parts = split(text, /\s*,\s*/g);
    if (parts.length > 1) {
      names.push({ family: plainText(parts[0]), given: plainText(parts[parts.length - 1]) });
      continue;
    }
    const words2 = split(text, /[\s~]+/g).filter(Boolean);
    const first2 = words2.slice(0, -1).findIndex(particle);
    const cut = first2 < 0 ? words2.length - 1 : first2;
    names.push({ family: plainText(words2.slice(cut).join(" ")), given: plainText(words2.slice(0, cut).join(" ")) });
  }
  return { names, others };
}
var bare = (text) => (text ?? "").replace(/\\([_%#&~])/g, "$1").replace(/[{}\s]/g, "");
function authorsOf(entry) {
  const { names, others } = namesOf(entry.fields.author ?? entry.fields.editor ?? "");
  if (!names.length) return "";
  if (names.length === 1 && !others) return names[0].family;
  if (names.length === 2 && !others) return `${names[0].family} & ${names[1].family}`;
  return `${names[0].family} et al.`;
}
function venueOf(entry) {
  for (const field of VENUE) {
    const text = plainText(entry.fields[field] ?? "");
    if (text) return text;
  }
  const eprint = bare(entry.fields.eprint);
  return eprint && /arxiv/i.test(`${entry.fields.archiveprefix ?? ""}${entry.fields.eprinttype ?? ""}`) ? `arXiv:${eprint}` : "";
}
function referenceOf(entry) {
  const url = bare(entry.fields.url);
  const parts = {
    authors: authorsOf(entry),
    title: plainText(entry.fields.title ?? ""),
    venue: venueOf(entry),
    volume: plainText(entry.fields.volume ?? ""),
    year: plainText(entry.fields.year ?? "") || (/\d{4}/.exec(entry.fields.date ?? "")?.[0] ?? ""),
    doi: bare(entry.fields.doi).replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, ""),
    url: /^https?:\/\//i.test(url) ? url : ""
  };
  if (!parts.authors && !parts.venue && !parts.title) parts.title = entry.key;
  return Object.fromEntries(Object.entries(parts).filter(([, text]) => text));
}

// src/texfile.ts
function citedKeys(html) {
  const keys = /* @__PURE__ */ new Set();
  const text = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  for (const match of text.matchAll(/<cite\b[^>]*?\sdata-key\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const key of (match[1] ?? match[2]).split(",")) if (key.trim()) keys.add(key.trim());
  }
  return [...keys];
}
function texOf(preamble, bibliography, html) {
  const entries = new Map(bibliography.entries.map((entry) => [entry.key, entry]));
  const references = {};
  const missing2 = [];
  for (const key of citedKeys(html).sort()) {
    const entry = entries.get(key);
    if (entry) references[key] = referenceOf(entry);
    else missing2.push(key);
  }
  const { macros, environments, packages, theorems } = preamble;
  return { tex: { macros, environments, packages, theorems, references }, missing: missing2 };
}
function folderTex(read, html) {
  const names = {
    input: (name) => /\.[A-Za-z]+$/.test(name) ? [name] : [`${name}.tex`, name],
    package: (name) => [`${name}.sty`],
    class: (name) => [`${name}.cls`]
  };
  const find = (name, kind) => {
    for (const file of names[kind](name)) {
      const found = read(file);
      if (found !== null) return { file, text: found };
    }
    return null;
  };
  const preamble = readPreamble(read("preamble.tex") ?? "", { file: "preamble.tex", resolve: find });
  const bibliography = readBibtex(read("references.bib") ?? "");
  return { preamble, bibliography, ...texOf(preamble, bibliography, html) };
}
function skippedLines(preamble, bibliography, missing2, deck) {
  const short = (statement) => statement.length > 100 ? `${statement.slice(0, 99)}\u2026` : statement;
  return [
    ...preamble.skipped.map((s) => `${s.file}:${s.line}: ${short(s.text)}: ${s.reason}`),
    ...bibliography.skipped.map((s) => `references.bib:${s.line}: ${short(s.text)}: ${s.reason}`),
    ...missing2.map((key) => `${deck}: the key ${key} is cited, and it is not in references.bib`)
  ];
}
var ascii = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
function texScript(tex) {
  const lines = ["// written from preamble.tex and references.bib by npm run tex and by a save in the editor.", "// change the two sources, since this file is written again from them", "window.beesonTex = {"];
  for (const [name, part] of Object.entries(tex)) {
    const entries = Array.isArray(part) ? [] : Object.entries(part);
    if (!entries.length) lines.push(`  ${ascii(name)}: ${ascii(part)},`);
    else lines.push(`  ${ascii(name)}: {`, ...entries.map(([key, value]) => `    ${ascii(key)}: ${ascii(value)},`), "  },");
  }
  lines.push("};");
  return `${lines.join("\n")}
`;
}

// src/edit/tex.ts
var STABLE2 = 300;
var keysOf = (html) => citedKeys(html).sort().join(",");
function deriveTex(dir, html) {
  const files = /* @__PURE__ */ new Map();
  const unread = [];
  const text = (name) => {
    const file = join5(dir, name);
    try {
      files.set(name, signature(statSync3(file)));
      return readFileSync6(file, "utf8");
    } catch (e) {
      const code = e.code;
      if (!files.has(name)) files.set(name, "");
      if (code !== "ENOENT" && code !== "ENOTDIR") unread.push(`${name} is not read: ${e.message}`);
      return null;
    }
  };
  const { preamble, bibliography, tex, missing: missing2 } = folderTex(text, html);
  return { text: texScript(tex), files, sources: files.get("preamble.tex") !== "" || files.get("references.bib") !== "", unread, skipped: skippedLines(preamble, bibliography, missing2, "index.html") };
}
var TexWriter = class {
  // html is the text of index.html at the start. the files are read for their signatures, and
  // nothing is written
  constructor(dir, html, options = {}) {
    this.sourcesSeen = null;
    this.texSeen = null;
    // the derivations and the polls run one at a time
    this.chain = Promise.resolve();
    this.due = false;
    // the signatures of the sources after a stable change of them, which the derivation that is due
    // follows, or null
    this.settled = null;
    this.polling = false;
    this.stopped = false;
    // the reason of the write of tex.js that failed last, which is tried again at each poll
    this.failure = null;
    // the skipped lines and the keys without an entry logged last
    this.skipped = "";
    this.dir = dir;
    this.file = join5(dir, "tex.js");
    this.log = options.log ?? (() => {
    });
    this.onChange = options.onChange ?? (() => {
    });
    this.onWriteError = options.onWriteError ?? (() => {
    });
    this.stable = options.stable ?? STABLE2;
    this.html = html;
    this.keys = keysOf(html);
    this.watched = deriveTex(dir, html).files;
    this.texSig = sigOf(this.file);
  }
  // index.html holds html on disk. tex.js is derived again when it cites other keys
  written(html) {
    if (html === this.html) return;
    this.html = html;
    if (keysOf(html) !== this.keys) this.derive();
  }
  // a stat of the files of the last derivation and of tex.js, at each poll of index.html
  poll() {
    if (this.polling || this.stopped) return;
    this.polling = true;
    void this.run(async () => {
      try {
        await this.look();
      } finally {
        this.polling = false;
      }
    });
  }
  // no poll after a stop. resolves once the derivation of the last write of index.html is over
  async stop() {
    this.stopped = true;
    await this.idle();
  }
  // resolves once every derivation and poll is over
  async idle() {
    let chain;
    do
      await (chain = this.chain);
    while (chain !== this.chain);
  }
  run(task) {
    return this.chain = this.chain.then(task).catch((e) => this.log(`tex.js: ${e.message}`));
  }
  derive(settled = null) {
    this.settled = settled ?? this.settled;
    if (this.due) return;
    this.due = true;
    void this.run(() => {
      this.due = false;
      return this.write();
    });
  }
  async look() {
    const now = performance.now();
    const sigs = await Promise.all([...this.watched.keys()].map(async (name) => [name, await statSig(join5(this.dir, name))]));
    const sources = sigs.map(([name, sig]) => `${name}
${sig}`).join("\n");
    if (sigs.some(([name, sig]) => this.watched.get(name) !== sig)) {
      if (this.sourcesSeen?.sig !== sources) this.sourcesSeen = { sig: sources, at: now };
      else if (now - this.sourcesSeen.at >= this.stable) this.derive(new Map(sigs));
    } else {
      this.sourcesSeen = null;
      if (this.failure !== null) this.derive();
    }
    const tex = await statSig(this.file);
    if (tex !== this.texSig) {
      if (this.texSeen?.sig !== tex) this.texSeen = { sig: tex, at: now };
      else if (now - this.texSeen.at >= this.stable) {
        this.texSig = tex;
        this.texSeen = null;
        this.onChange();
      }
    } else this.texSeen = null;
  }
  async write() {
    const html = this.html;
    const settled = this.settled;
    this.settled = null;
    const derived = deriveTex(this.dir, html);
    const base = settled ?? this.watched;
    if ([...derived.files].some(([name, sig]) => base.has(name) && base.get(name) !== sig)) return;
    const settle = () => {
      this.keys = keysOf(html);
      this.watched = derived.files;
      this.sourcesSeen = null;
      if (this.failure === null) return;
      this.failure = null;
      this.onWriteError(null);
    };
    if (!derived.sources) return settle();
    if (derived.unread.length) {
      settle();
      this.log(`tex.js is not written, since ${derived.unread.join(", and ")}`);
      return;
    }
    if (derived.skipped.join("\n") !== this.skipped) {
      this.skipped = derived.skipped.join("\n");
      for (const line of derived.skipped) this.log(line);
    }
    const old = await readFile2(this.file, "utf8").catch(() => null);
    if (old === derived.text) {
      settle();
      if (settled) this.onChange();
      return;
    }
    const tmp = join5(this.dir, `.tex.js.${randomBytes5(6).toString("hex")}.tmp`);
    try {
      await writeFile4(tmp, derived.text);
      const made = await stat3(tmp);
      await renameRetried(tmp, this.file);
      settle();
      this.texSig = signature(made);
      this.texSeen = null;
      this.onChange();
    } catch (e) {
      await unlink3(tmp).catch(() => {
      });
      const reason = e.code ?? e.message;
      if (reason === this.failure) return;
      this.failure = reason;
      this.log(`could not write ${this.file}: ${e.message}`);
      this.onWriteError(e.message);
    }
  }
};
function sigOf(file) {
  try {
    return signature(statSync3(file));
  } catch {
    return "";
  }
}
var statSig = (file) => stat3(file).then(signature, () => "");

// src/edit/command.ts
var DEFAULT_PORT = 8765;
var JSON_MAX = 16 * 1024 * 1024;
var MEDIA_MAX = 64 * 1024 * 1024;
var GUEST_MEDIA_MAX = 16 * 1024 * 1024;
var MEDIA_TYPES = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "mp4", "m4v", "webm", "mov", "ogv", "json"]);
var LOCK_WAIT = Number(process.env.SLIDES_LOCK_TIMEOUT_MS) || 2e3;
var END_WAIT = Number(process.env.SLIDES_END_WAIT_MS) || 1e3;
var AlreadyRunning = class extends Error {
  constructor(found) {
    super(`the edit command already runs for this folder at ${found.url}`);
    this.found = found;
  }
};
async function holderOf(file, root, key, log) {
  let lock;
  try {
    lock = JSON.parse(readFileSync7(file, "utf8"));
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
    const answer = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(LOCK_WAIT) });
    await answer.body?.cancel();
    return answer.status === 302 ? { url, port: lock.port, key } : null;
  } catch (e) {
    if (e.name !== "TimeoutError") return null;
    log(`the edit command of process ${lock.pid} holds this folder and does not answer. Bring it back to the front, or end it`);
    return { url, port: lock.port, key };
  }
}
function keepUnwritten(root, text) {
  const name = `unwritten-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.html`;
  for (const dir of [join6(root, ".session"), tmpdir()]) {
    try {
      const file = join6(dir, name);
      writeFileSync5(file, text, { flag: "wx" });
      return file;
    } catch {
    }
  }
  return null;
}
function keyOf(root) {
  const dir = join6(root, ".session");
  mkdirSync3(dir, { recursive: true });
  try {
    writeFileSync5(join6(dir, ".gitignore"), "*\n", { flag: "wx" });
  } catch {
  }
  const file = join6(dir, "key");
  try {
    const key2 = readFileSync7(file, "utf8").trim();
    if (/^[A-Za-z0-9_-]{22,128}$/.test(key2)) return key2;
  } catch {
  }
  const key = randomBytes6(16).toString("base64url");
  writeFileSync5(file, `${key}
`, { mode: 384 });
  return key;
}
function savedPort(root) {
  try {
    const port = Number(readFileSync7(join6(root, ".session", "port"), "utf8").trim());
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  } catch {
    return null;
  }
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
var sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function sameFile(dir, name, size2, hash) {
  const dot = name.lastIndexOf(".");
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const family = new RegExp(`^${escape(name.slice(0, dot))}(?:-(\\d+))?${escape(name.slice(dot))}$`);
  const found = (await readdir(dir, { withFileTypes: true })).flatMap((d) => {
    const m = d.isFile() ? family.exec(d.name) : null;
    return m ? [{ name: d.name, n: Number(m[1] ?? 1) }] : [];
  });
  for (const f of found.sort((a, b) => a.n - b.n)) {
    const file = join6(dir, f.name);
    try {
      if ((await stat4(file)).size === size2 && sha256(await readFile3(file)) === hash) return f.name;
    } catch {
    }
  }
  return null;
}
var isJson = (request) => (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() === "application/json";
function bodyOf(request) {
  if (!isJson(request)) return error(415, "the body must be application/json");
  try {
    const body = JSON.parse(request.body.toString("utf8"));
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
  }
  return error(400, "the body is not a JSON object");
}
var isResponse = (x) => !!x && typeof x.status === "number" && typeof x.headers === "object";
async function start(options = {}) {
  const log = options.log ?? ((m) => process.stderr.write(`${m}
`));
  const root = realpathSync2.native(resolve(options.folder ?? "."));
  const index = join6(root, "index.html");
  const { text, bom } = readText(index);
  const key = keyOf(root);
  const lockFile = join6(root, ".session", "lock");
  const earlier = await holderOf(lockFile, root, key, log);
  if (earlier) throw new AlreadyRunning(earlier);
  const appliedFile = join6(root, ".session", "applied.json");
  const authority = new Authority(text, { applied: readApplied(appliedFile) });
  const appliedTable = new AppliedTable(appliedFile, log);
  const tex = new TexWriter(root, text, { log, onChange: () => people.texChanged(), onWriteError: (m) => people.texFailed(m) });
  const onWritten = (n, written2) => {
    if (authority.written(n)) appliedTable.write(authority.table());
    tex.written(written2);
  };
  const disk = new Disk(index, authority, bom, { log, onWritten, onPoll: () => tex.poll(), onWriteError: (e) => people.writeFailed(e) });
  const people = new People(authority, join6(root, ".session", "people.json"), log);
  let history;
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
        const told = people.endGuests();
        if (relay) {
          let timer;
          await Promise.race([told, new Promise((done) => timer = setTimeout(done, END_WAIT))]);
          clearTimeout(timer);
        }
        await relay?.stop(people.endedBy());
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
    if (relay && relay.relay !== address) void people.endGuests();
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
    const client = people.clientOf(new URLSearchParams(request.query).get("token"));
    if (client === null || !people.present(client)) return error(404, "say hello first");
    const clean = cleanName(name);
    if (!clean) return error(415, "the file must be an image, a video, or json");
    if (request.body.length > MEDIA_MAX) return error(413, "the file is larger than 64 MB");
    if (!request.direct && request.body.length > GUEST_MEDIA_MAX) return error(413, "the file is larger than 16 MB, the limit of an upload through the relay");
    const dir = join6(root, "media");
    await mkdir(dir, { recursive: true });
    const real = await realpath3(dir);
    if (!real.startsWith(root + sep2)) return error(403, "media/ leaves the talk folder");
    const sent = request.headers["x-content-sha256"];
    if (sent !== void 0) {
      const hash = sha256(request.body);
      if (sent.toLowerCase() !== hash) return error(400, "the file does not have the SHA-256 of x-content-sha256");
      const same = await sameFile(real, clean, request.body.length, hash);
      if (same) return json(200, { path: `media/${same}` });
    }
    const dot = clean.lastIndexOf(".");
    for (let i = 1; i < 1e3; i++) {
      const candidate = i === 1 ? clean : `${clean.slice(0, dot)}-${i}${clean.slice(dot)}`;
      try {
        await writeFile5(join6(real, candidate), request.body, { flag: "wx" });
        return json(200, { path: `media/${candidate}` });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
    }
    return error(409, "too many files of this name");
  }
  function historyApi(route, request) {
    const parts = route.split("/");
    if (request.method === "GET") {
      if (people.clientOf(new URLSearchParams(request.query).get("token")) === null) return error(404, "say hello first");
      if (route === "history") return json(200, history.list());
      const v = parts.length === 2 && parts[0] === "history" ? history.get(parts[1]) : null;
      return v ? json(200, v) : error(404, "there is no such version");
    }
    if (request.method !== "POST") return error(405, "GET or POST");
    if (closed) return error(503, "the edit command is stopping");
    const body = bodyOf(request);
    if (isResponse(body)) return body;
    const client = people.clientOf(body.token);
    const person = client === null ? null : people.personOf(client);
    if (person === null) return error(404, "say hello first");
    if (route === "aside") {
      if (typeof body.text !== "string") return error(400, "text is missing");
      const aside = history.setAside(body.text, person);
      return aside ? json(200, aside) : error(413, "the text is larger than 8 MB");
    }
    if (parts.length !== 3 || parts[0] !== "history") return error(404, "not found");
    if (parts[2] === "name") {
      const named = history.name(parts[1], body.name);
      if (named === "long") return error(400, "the name must be a text of at most 80 characters");
      return named ? json(200, named) : error(404, "there is no such version");
    }
    if (parts[2] === "restore") {
      const restored = history.restore(parts[1], person);
      return restored ? json(200, { id: restored.id, v: authority.version }) : error(404, "there is no such version");
    }
    return error(404, "not found");
  }
  async function api(route, request) {
    if (route.startsWith("media/")) return media(route.slice(6), request);
    if (route === "history" || route.startsWith("history/") || route === "aside") return historyApi(route, request);
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
      if ("full" in joined) return error(503, FULL);
      const { member, token } = joined;
      const applied = typeof hello.was === "string" ? authority.applied(hello.was) : void 0;
      const answer = { client: member.client, token, person: member.person, name: member.name, color: member.color, host: member.host, v: authority.version, people: people.list(), known: people.known(), tex: people.tex(), ...applied === void 0 ? {} : { applied } };
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
    const names = paramNames(request.query);
    if (names.has("version") || names.has("aside")) {
      if (names.has("edit") || names.has("session")) return error(400, "a version is shown without edit and session");
      const query = new URLSearchParams(request.query);
      const text2 = names.has("version") ? history.textOf(query.get("version")) : history.asideText(query.get("aside"));
      if (text2 === null) return error(404, "there is no such version");
      return { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, body: Buffer.from(disk.bom ? `\uFEFF${text2}` : text2, "utf8") };
    }
    if (names.has("session")) {
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
  const ports = options.port !== void 0 ? [options.port] : [.../* @__PURE__ */ new Set([savedPort(root) ?? DEFAULT_PORT, DEFAULT_PORT, 0])];
  await new Promise((done, fail) => {
    const tryListen = (i) => {
      server.once("error", (e) => {
        if ((e.code === "EADDRINUSE" || e.code === "EACCES") && i + 1 < ports.length) tryListen(i + 1);
        else fail(e);
      });
      server.listen(ports[i], "127.0.0.1", () => {
        server.removeAllListeners("error");
        done();
      });
    };
    tryListen(0);
  });
  port = server.address().port;
  const lock = JSON.stringify({ pid: process.pid, port, root });
  try {
    writeFileSync5(lockFile, lock, { flag: "wx" });
  } catch {
    const other = await holderOf(lockFile, root, key, log);
    if (other && other.port !== port) {
      people.end();
      await new Promise((done) => server.close(done));
      throw new AlreadyRunning(other);
    }
    const tmp = `${lockFile}.${randomBytes6(6).toString("hex")}.tmp`;
    writeFileSync5(tmp, lock);
    renameRetriedSync(tmp, lockFile);
  }
  const unlock = () => {
    try {
      if (readFileSync7(lockFile, "utf8") === lock) unlinkSync5(lockFile);
    } catch {
    }
  };
  try {
    writeFileSync5(join6(root, ".session", "port"), `${port}
`);
  } catch {
  }
  history = new History(join6(root, ".session"), authority, { ...options.history, log });
  history.onChange(() => people.news());
  people.feed({
    rev: () => history.rev,
    write: (answer) => {
      answer.history = history.rev;
    }
  });
  people.feed({
    rev: () => history.restores,
    write: (answer, _seen, since) => {
      const restored = history.restoredAfter(since);
      if (restored) answer.restored = restored;
    }
  });
  disk.start();
  if (options.relay) {
    const address = relayAddress(options.relay);
    const saved = loadConfig();
    const secret = process.env.SLIDES_RELAY_SECRET || (address !== null && address === relayAddress(saved.relay) ? saved.secret : void 0);
    if (!address) log(`${ADDRESS_RULE}, and the session is not shared`);
    else if (!secret || secret.length < 16) log("the secret of the relay is not set, and the session is not shared");
    else void serial(() => connect(address, secret)).then(() => log(`shared at ${relay.link}`), (e) => log(`the session is not shared: ${e.message}`));
  }
  let closing = null;
  let written;
  const unwritten = new Promise((done) => written = done);
  return {
    url: `http://127.0.0.1:${port}/${key}/`,
    port,
    key,
    root,
    authority,
    link: () => relay?.active ? relay.link : null,
    unwritten,
    close: () => closing ??= (async () => {
      closed = true;
      unlock();
      people.end();
      const unwritten2 = await disk.stop();
      await tex.stop();
      await appliedTable.stop();
      if (unwritten2) {
        const kept = keepUnwritten(root, disk.bom ? `\uFEFF${authority.text}` : authority.text);
        log(kept ? `the text of the session is kept in ${kept}` : "the text of the session could not be kept in any file");
      }
      history.stopSync();
      written(unwritten2);
      await Promise.race([serial(async () => relay?.stop()), new Promise((done) => setTimeout(done, 2500))]);
      await new Promise((done) => setTimeout(done, 200));
      await new Promise((done) => {
        server.close(() => done());
        setTimeout(() => {
          server.closeAllConnections();
        }, 300);
      });
      return unwritten2;
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
    this.id = client;
    this.base = text;
    this.mine = text;
    this.epoch = parsed.epoch;
    this.n = parsed.n;
    this.seq = seq;
  }
  get version() {
    return formatVersion(this.epoch, this.n);
  }
  get client() {
    return this.id;
  }
  // the client id under which the operation in flight was sent, or client. a hello passes it as
  // was, and its answer tells by applied whether the text holds the operation
  get sender() {
    return this.flight?.client ?? this.id;
  }
  // the page goes on under a new client id, e.g. after a restart of the edit command. base, mine,
  // and the operation in flight are kept, and the next resync decides whether the text holds it
  rebind(client) {
    this.id = client;
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
    this.flight = { client: this.id, seq: ++this.seq, patches, answered: false, accepted: null };
    return { client: this.id, seq: this.seq, base: this.version, patches };
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
    const at = parseVersion(answer.v);
    if (answer.reason === "unknown" || answer.reason === "stale" && at && at.epoch !== parseVersion(request.base)?.epoch) {
      this.needsResync = true;
      return;
    }
    this.flight = null;
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
  // the whole text of the authority at version v, read again after needsResync. applied is the seq
  // of the last operation of sender that the text holds, as hello answers it. the edits of this
  // browser are merged into it, where the side wins at a conflict. conflicts gets the patches of
  // mine that conflicted
  resync(text, v, applied, wins = "ours", conflicts = []) {
    const parsed = parseVersion(v);
    if (!parsed) throw new Error(`${v} is not a version`);
    const before2 = this.mine;
    const from = this.resyncBase(parsed, applied);
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
  // text holds an operation accepted at or before its version of the same epoch, or one whose seq is
  // at most applied. when this is not known, the merge is from base, since a duplicate can be seen
  // and repaired while a lost edit cannot
  resyncBase(at, applied) {
    const f = this.flight;
    if (!f?.patches) return this.base;
    const accepted = f.accepted !== null && at.epoch === this.epoch && at.n >= f.accepted;
    return accepted || applied !== void 0 && f.seq <= applied ? apply(this.base, f.patches) : this.base;
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
    if (op.client === this.flight?.client && op.seq === this.flight.seq) {
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
function historyOptions() {
  const out = {};
  try {
    const given = JSON.parse(process.env.SLIDES_HISTORY ?? "{}");
    for (const k of ["quiet", "longest", "maxBytes", "keep", "asideBytes", "asideFiles"]) if (Number.isFinite(given?.[k]) && given[k] >= 0) out[k] = given[k];
  } catch {
  }
  return out;
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
    running = await start({ folder, port, relay, history: historyOptions() });
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
    void running.unwritten.then((unwritten) => setTimeout(() => process.exit(unwritten ? 1 : 0), 3e3).unref());
  };
  const fail = (e) => {
    process.stderr.write(`The edit command failed: ${e?.stack ?? e}
`);
    void running.close().finally(() => process.exit(1));
    void running.unwritten.then(() => setTimeout(() => process.exit(1), 3e3).unref());
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
  History,
  NAME_MAX,
  Replica,
  TexWriter,
  apply,
  changes,
  checksum,
  cleanName,
  cleanPersonName,
  combine,
  conflict,
  decode,
  deriveTex,
  diff2 as diff,
  formatVersion,
  invert,
  isPersonId,
  mergePatches,
  moveMarks,
  nameKey,
  operationOf,
  parseVersion,
  shift,
  shiftOffset,
  size,
  slideChanges,
  slidesOf,
  start,
  tokenize,
  valid,
  widen
};
