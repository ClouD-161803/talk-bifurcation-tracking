// the TikZ figures of a deck. a figure is a <div class="tikz" data-figure="name"> on a slide, with
// its box in the width and the height in px of its style. its source is figures/name.tex next to
// the deck, a tikzpicture that a paper reads with \input as well, and its output is the classic
// script figures/name.js with the SVG of each mode, since a deck opened from a file cannot read the
// text of a file next to it. a figure is compiled by latex into DVI and by dvisvgm into SVG, with
// the letters as outlines, at 3.6 px per TeX point, hence its text of 10 pt is 36 px on a slide.
//
// compileFigure does not write anything into the folder of the talk, and writeFigure writes its text,
// hence a source can be compiled before it is saved. a guest of a session may change a source, hence
// TeX Live is fenced: latex writes only into its temporary folder, by openout_any, and a compile is
// refused when latex read a file other than those of the talk folder, of its temporary folder, and
// of the trees of TeX Live, or a hidden file of the talk folder, from the files that -recorder lists.
// openin_any would refuse such a read, but it does not have any effect from TeX Live 2026 on. MiKTeX
// reads neither variable, and it is not fenced.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const PX_PER_PT = 3.6;
// dvisvgm writes its sizes in bp
const PT_PER_BP = 72.27 / 72;
export const STYLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'beeson-tikz.sty');
// the files of a compile in its temporary folder, which latex finds through TEXINPUTS
const WRAPPER = 'beeson-figure';
const SOURCE = 'beeson-figure-source';
const PREAMBLE = 'beeson-figure-preamble';
// a figure is fitted to its box within this many px
const SLACK = 0.5;
// the time in ms after which a pass of latex or dvisvgm is stopped, e.g. a loop without end
const PASS_TIME = 120_000;

const read = (file, encoding = 'utf8') => {
  try {
    return readFileSync(file, encoding);
  } catch {
    return null;
  }
};
const isFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};
const list = (dir) => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

// the folders of a TeX Live of each year, newest first, then those of MiKTeX
function usualFolders(env) {
  const folders = ['/Library/TeX/texbin', '/usr/texbin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
  for (const root of ['/usr/local/texlive', 'C:\\texlive', join(env.HOME ?? '', 'texlive')]) {
    for (const year of list(root).filter((name) => /^\d{4}$/.test(name)).sort().reverse()) {
      const bin = join(root, year, 'bin');
      folders.push(...list(bin).map((arch) => join(bin, arch)));
    }
  }
  if (env.LOCALAPPDATA) folders.push(join(env.LOCALAPPDATA, 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'));
  folders.push(join(env.ProgramFiles ?? 'C:\\Program Files', 'MiKTeX', 'miktex', 'bin', 'x64'));
  return folders;
}

/**
 * The paths of latex and dvisvgm, each null when it is not found. They are looked up on the PATH and
 * then in the usual folders of TeX Live and MiKTeX, or only in the folder of BEESON_TEXBIN when it is set.
 */
export function findTools(env = process.env) {
  const folders = env.BEESON_TEXBIN !== undefined ? [env.BEESON_TEXBIN] : [...(env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean), ...usualFolders(env)];
  const extensions = process.platform === 'win32' ? ['.exe', ''] : [''];
  const find = (name) => {
    for (const folder of folders) for (const extension of extensions) if (isFile(join(folder, name + extension))) return join(folder, name + extension);
    return null;
  };
  return { latex: find('latex'), dvisvgm: find('dvisvgm') };
}

// a program run to its end without blocking the event loop, resolved with its status and the last
// 64 kB of its output, or with error when it does not start or is stopped after PASS_TIME
function run(command, args, options) {
  return new Promise((done) => {
    let child;
    try {
      child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      done({ error });
      return;
    }
    const out = { stdout: '', stderr: '' };
    for (const key of ['stdout', 'stderr']) {
      child[key].setEncoding('utf8');
      child[key].on('data', (chunk) => (out[key] = (out[key] + chunk).slice(-65536)));
    }
    const timer = setTimeout(() => {
      out.error = new Error(`it did not end within ${PASS_TIME / 1000} s`);
      child.kill('SIGKILL');
    }, PASS_TIME);
    child.once('error', (error) => (out.error ??= error));
    child.once('close', (status) => {
      clearTimeout(timer);
      done({ ...out, status });
    });
  });
}

// a path with its links resolved, in lowercase where the file system ignores case
const real = (path) => {
  let found;
  try {
    found = realpathSync.native(path);
  } catch {
    found = resolve(path);
  }
  return process.platform === 'win32' || process.platform === 'darwin' ? found.toLowerCase() : found;
};
const inside = (path, folder) => path === folder || path.startsWith(folder.endsWith(sep) ? folder : folder + sep);
// a segment of a path that the edit command does not serve, see hiddenSegment in src/edit/http.ts
const hidden = (segment) => segment.startsWith('.') || segment.endsWith('.') || segment.endsWith(' ') || segment.toLowerCase() === 'node_modules';

const kinds = new Map();
/**
 * The TeX installation of tools: { miktex } for MiKTeX, { miktex: false, trees, files } for TeX Live,
 * with trees the real paths of the folders of $TEXMF and files those of its texmf.cnf files, or null
 * when latex is not found. latex and kpsewhich are run once for each latex.
 */
export function texOf(tools = findTools()) {
  if (!tools.latex) return Promise.resolve(null);
  let found = kinds.get(tools.latex);
  if (!found) {
    found = (async () => {
      const version = await run(tools.latex, ['--version'], {});
      if (/MiKTeX/i.test(`${version.stdout ?? ''}${version.stderr ?? ''}`)) return { miktex: true, trees: [], files: [] };
      const kpsewhich = join(dirname(tools.latex), `kpsewhich${extname(tools.latex)}`);
      const [listed, configs] = await Promise.all([run(kpsewhich, ['-expand-braces=$TEXMF'], {}), run(kpsewhich, ['-all', 'texmf.cnf'], {})]);
      const trees = (listed.stdout ?? '').trim().split(delimiter).map((folder) => folder.replace(/^!!/, '')).filter((folder) => isAbsolute(folder));
      const files = (configs.stdout ?? '').split(/\r?\n/).filter((file) => isAbsolute(file));
      return { miktex: false, trees: trees.map(real), files: files.map(real) };
    })();
    kinds.set(tools.latex, found);
  }
  return found;
}

// the first file that latex read, as the text of its recorder lists them, that is outside the talk
// folder dir, the temporary folder, and trees, or that is a hidden file of dir, as it is named in
// the message of the refusal, or null
function forbiddenRead(fls, { dir, temporary, trees, files }) {
  const talk = real(dir);
  const allowed = [real(temporary), ...trees];
  let pwd = dir;
  for (const line of fls.split(/\r?\n/)) {
    if (!line) continue;
    const [, kind, path] = /^(PWD|INPUT|OUTPUT) (.+)$/.exec(line) ?? [];
    if (kind === 'PWD') pwd = path;
    if (kind !== 'INPUT') {
      if (!kind) return 'a file that its recorder does not name';
      continue;
    }
    const file = real(resolve(pwd, path));
    if (files.includes(file) || allowed.some((folder) => inside(file, folder))) continue;
    if (inside(file, talk) && !relative(talk, file).split(sep).some(hidden)) continue;
    return inside(file, talk) ? relative(talk, file).split(sep).join('/') : path;
  }
  return null;
}

export const attributes = (tag) => {
  const values = {};
  for (const [, name, double, single, bare] of tag.replace(/^<\w+/, '').matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    values[name.toLowerCase()] = double ?? single ?? bare ?? '';
  }
  return values;
};
const px = (style, key) => {
  const match = new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([\\d.]+)px`, 'i').exec(style);
  return match ? Number(match[1]) : null;
};

/** The TikZ figures of a deck, in the order of the file: the name of each and its box in px, with null for a size that is not set. */
export function deckFigures(html) {
  const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  const figures = [];
  for (const [tag] of text.matchAll(/<div\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
    const values = attributes(tag);
    if (!(values.class ?? '').split(/\s+/).includes('tikz')) continue;
    const style = values.style ?? '';
    figures.push({ name: values['data-figure'] ?? null, box: { width: px(style, 'width'), height: px(style, 'height') } });
  }
  return figures;
}

/**
 * The text of a preamble.tex that a figure reads: the lines above \begin{document}, without the
 * \documentclass statement, with each line in its place so that an error is given at its line.
 */
export function cutPreamble(text) {
  const lines = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    // a % that is not escaped starts a comment
    const comment = /(?:^|[^\\])(?:\\\\)*%/.exec(line);
    const end = comment ? comment.index + comment[0].length - 1 : line.length;
    const code = line.slice(0, end);
    const begin = code.indexOf('\\begin{document}');
    if (begin >= 0) {
      lines.push(code.slice(0, begin));
      break;
    }
    lines.push(code.replace(/\\documentclass\s*(\[[^\]]*\])?\s*\{[^}]*\}/, '') + line.slice(end));
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

const pt = (value) => `${+value.toFixed(4)}pt`;

/**
 * The document that latex compiles for a figure in a mode. width and height are the size of a
 * pgfplots axis in TeX pt, and scale is the scale of the coordinates of a drawing, which TikZ does
 * not apply to text and line widths.
 */
export function wrapperOf({ mode = 'light', preamble = false, width = null, height = null, scale = 1 } = {}) {
  const lines = [
    '\\documentclass[dvisvgm]{article}',
    '\\usepackage[T1]{fontenc}\\usepackage{lmodern}\\usepackage{tikz,pgfplots}\\pgfplotsset{compat=1.18}',
    `\\usepackage[${mode}]{beeson-tikz}`,
  ];
  // a preamble defines an operator with amsopn and a kind of theorem with amsthm while it is read.
  // neither takes an option that a paper sets, hence both are loaded before it
  lines.push('\\usepackage{amsopn,amsthm}');
  if (preamble) lines.push(`\\input{${PREAMBLE}}`);
  // MathJax knows the commands of these packages without a package, hence a preamble may use them.
  // they are loaded after the preamble, so that one loaded there with options does not clash
  lines.push('\\usepackage{amsmath,amssymb,bm}');
  // a source may size a part by the box, as in width=0.5\figurewidth. without a box, the two
  // lengths are the defaults of pgfplots
  lines.push(
    '\\pagestyle{empty}',
    '\\ifdefined\\figurewidth\\else\\newlength\\figurewidth\\fi\\ifdefined\\figureheight\\else\\newlength\\figureheight\\fi',
    `\\setlength\\figurewidth{${pt(width ?? 240)}}\\setlength\\figureheight{${pt(height ?? 207)}}`,
  );
  const size = [width !== null && 'width=\\figurewidth', height !== null && 'height=\\figureheight'].filter(Boolean);
  if (size.length) lines.push(`\\pgfplotsset{${size.join(', ')}}`);
  if (scale !== 1) lines.push(`\\tikzset{every picture/.append style={scale=${+scale.toFixed(5)}}}`);
  lines.push(`\\begin{document}\\color{ink}\\input{${SOURCE}}\\end{document}`);
  return `${lines.join('\n')}\n`;
}

/**
 * An SVG of dvisvgm as it is drawn inline in a deck: without its XML prolog and comments, with every
 * id prefixed, and with its width and height in px, times factor for a figure shown smaller.
 * Returns the SVG, its size in px, and the names of its parts in the order of the file.
 */
export function finishSvg(svg, prefix, factor = 1) {
  let text = svg.replace(/<\?xml[\s\S]*?\?>\s*/g, '').replace(/<!--[\s\S]*?-->\s*/g, '').trim();
  text = text
    .replace(/(\s)id=(['"])/g, `$1id=$2${prefix}`)
    .replace(/(\shref|\sxlink:href)=(['"])#/g, `$1=$2#${prefix}`)
    .replace(/url\(#/g, `url(#${prefix}`);
  const root = /<svg\b[^>]*>/.exec(text)[0];
  const size = (key) => Math.round(parseFloat(new RegExp(`\\s${key}=['"]([\\d.]+)`).exec(root)[1]) * PT_PER_BP * PX_PER_PT * factor * 100) / 100;
  const width = size('width');
  const height = size('height');
  text = text.replace(root, root.replace(/(\swidth=)(['"])[^'"]*\2/, `$1'${width}'`).replace(/(\sheight=)(['"])[^'"]*\2/, `$1'${height}'`));
  const parts = [...new Set([...text.matchAll(/\sdata-part=['"]([^'"]*)['"]/g)].map((match) => match[1]))];
  return { svg: text, width, height, parts };
}

// the number of pgfplots axes in a source, without those of a comment
const axes = (source) => source.replace(/(^|[^\\])%.*$/gm, '$1').match(/\\begin\{(axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis|ternaryaxis|smithchart)\}/g)?.length ?? 0;

// the errors of a log of latex, each at its file and line of the talk. texts holds the wrapper,
// the source, and the preamble, by the name of each in the temporary folder
function errorsOf(log, { name, dir, texts }) {
  const located = [...log.matchAll(/^(.*?\.\w+):(\d+): (.*)$/gm)].map(([, path, line, message]) => ({ path, line: Number(line), message }));
  let errors = located.filter((error) => !/^Emergency stop/.test(error.message));
  if (!errors.length) {
    // an error without a place, e.g. a file that is not found, is given at the line where TeX stopped
    const stop = located.find((error) => /^Emergency stop/.test(error.message));
    errors = [{ path: stop?.path ?? `${WRAPPER}.tex`, line: stop?.line ?? null, message: /^! (.*)$/m.exec(log)?.[1] ?? 'latex failed without an error in its log' }];
  }
  const source = `figures/${name}.tex`;
  return errors.map(({ path, line, message }) => {
    const base = path.split(/[\\/]/).pop();
    let file;
    if (base === `${SOURCE}.tex`) file = source;
    else if (base === `${PREAMBLE}.tex`) file = 'preamble.tex';
    else if (base === `${WRAPPER}.tex`) {
      // the line of the wrapper that inputs the preamble or the source
      file = (texts[WRAPPER].split('\n')[line - 1] ?? '').includes(PREAMBLE) ? 'preamble.tex' : source;
      line = null;
    } else {
      const local = relative(dir, resolve(dir, path));
      file = local.startsWith('..') || isAbsolute(local) ? base : local.split('\\').join('/');
    }
    // a file that is not found is given at the first line that names it
    const missing = /File `([^']+)' not found/.exec(message)?.[1].replace(/\.\w+$/, '');
    const text = { [source]: texts[SOURCE], 'preamble.tex': texts[PREAMBLE] }[file];
    if (line === null && missing && text) {
      const at = text.split('\n').findIndex((code) => code.replace(/(^|[^\\])%.*$/, '$1').includes(missing));
      if (at >= 0) line = at + 1;
    }
    return { file, line, message: message.trim().replace(/\.$/, '') };
  });
}

/**
 * A hash over everything that the output of a figure depends on: its source, the style, the
 * wrapper, the preamble.tex of the talk, the files of the talk that TeX read (inputs, as paths
 * from the folder of the deck), and its box. Line ends are read as LF, since git on Windows may
 * check a file out with CRLF. texts holds the text of the style, of the preamble, and of an input,
 * under style, preamble, and the path of the input, as a compile read it, and a file that is not in
 * it is read from the folder.
 * @param {{ dir: string, source: string, box?: { width?: number | null, height?: number | null }, inputs?: string[], texts?: Record<string, string | null> }} figure
 */
export function figureHash({ dir, source, box = {}, inputs = [], texts = {} }) {
  const hash = createHash('sha256');
  const add = (label, text) => hash.update(`${label}\0${text === null ? '\u0001' : text.replace(/\r\n/g, '\n')}\0`);
  const given = (key, file, encoding) => (Object.hasOwn(texts, key) ? texts[key] : read(file, encoding));
  add('source', source);
  add('style', given('style', STYLE));
  add('wrapper', wrapperOf());
  add('preamble', given('preamble', join(dir, 'preamble.tex')));
  for (const file of [...inputs].sort()) add(`input ${file}`, given(file, join(dir, file), 'latin1'));
  add('box', `${box.width ?? ''} ${box.height ?? ''}`);
  return hash.digest('hex').slice(0, 16);
}

// a value as JSON in ASCII, since the script is read in the encoding of its page
const ascii = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** The text of figures/name.js, which adds the figure to window.beesonFigures, with one line per key. */
export function figureScript(name, figure) {
  const lines = [`// written from figures/${name}.tex by npm run tex. change the source, since this file is written again from it`, `(window.beesonFigures ??= {})[${ascii(name)}] = {`];
  for (const [key, value] of Object.entries(figure)) lines.push(`  ${ascii(key)}: ${ascii(value)},`);
  lines.push('};');
  return `${lines.join('\n')}\n`;
}

/**
 * Compiles a figure of the talk in the folder dir, from its source text, or from figures/name.tex
 * when source is not given, into the box {width, height} in px. Returns { figure, text, passes,
 * seconds }, where figure is the value of window.beesonFigures[name] and text the script
 * figures/name.js, or { errors, inputs }, each error { file, line, message } with file as a path from
 * dir and line null where TeX does not give one, and inputs the files of the talk that TeX read
 * before an error of TeX, if any. hash, of the figure and of a failed compile, is the figureHash
 * of the texts that the compile read, hence an output is not current for a preamble or an input
 * changed during the compile. Nothing is written into dir.
 */
export async function compileFigure({ dir, name, source, box = {}, tools = findTools() }) {
  const started = Date.now();
  dir = resolve(dir);
  source ??= readFileSync(join(dir, 'figures', `${name}.tex`), 'utf8');
  for (const tool of ['latex', 'dvisvgm']) {
    if (!tools[tool]) return { errors: [{ file: null, line: null, message: `${tool} is not found` }] };
  }
  const tex = await texOf(tools);
  const fenced = tex?.miktex === false;
  const preamble = read(join(dir, 'preamble.tex'));
  const style = readFileSync(STYLE, 'utf8');
  // the texts that the compile read: the style and the preamble before it, and each input after it,
  // which is taken as changed when it was written after the start of the compile, since TeX may
  // have read it before
  const used = (inputs = []) => {
    const texts = { style, preamble };
    for (const file of inputs) {
      const text = read(join(dir, file), 'latin1');
      let changed = true;
      try {
        changed = statSync(join(dir, file)).mtimeMs >= started;
      } catch {}
      texts[file] = changed ? '\u0002changed during the compile' : text;
    }
    return figureHash({ dir, source, box, inputs, texts });
  };
  const temporary = mkdtempSync(join(tmpdir(), 'beeson-figure-'));
  const env = { ...process.env };
  // a variable of kpathsea set in another case, e.g. on Windows, and an output folder outside the
  // temporary folder are left out
  for (const key of Object.keys(env)) if (['openin_any', 'openout_any', 'texmfoutput', 'texmf_output_directory'].includes(key.toLowerCase())) delete env[key];
  Object.assign(env, { TEXINPUTS: `${temporary}${delimiter}${process.env.TEXINPUTS ?? ''}`, openin_any: 'p', openout_any: 'p', max_print_line: '10000', error_line: '254', half_error_line: '238' });
  let passes = 0;
  // one compile in a mode, with the size in TeX pt and the files of the talk that TeX read
  const pass = async (mode, fit) => {
    passes += 1;
    const wrapper = wrapperOf({ mode, preamble: preamble !== null, ...fit });
    writeFileSync(join(temporary, `${WRAPPER}.tex`), wrapper);
    // the folder of the talk is the working folder of TeX, hence a path in a source is read from it
    const latex = await run(tools.latex, ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', '-file-line-error', '-recorder', `-output-directory=${temporary}`, `${WRAPPER}.tex`], { cwd: dir, env });
    if (latex.error) return { errors: [{ file: null, line: null, message: `latex does not run: ${latex.error.message}` }] };
    const fls = read(join(temporary, `${WRAPPER}.fls`));
    // a refused read is told before an error of TeX, whose message may hold the text that was read
    const forbidden = !fenced ? null : fls === null ? 'the files that its recorder does not list' : forbiddenRead(fls, { dir, temporary, ...tex });
    if (forbidden !== null) {
      const stem = basename(forbidden).replace(/\.\w+$/, '');
      const at = source.split('\n').findIndex((code) => stem && code.includes(stem));
      return { errors: [{ file: `figures/${name}.tex`, line: at < 0 ? null : at + 1, message: `TeX may not read ${forbidden}, since a figure reads only the files of the talk folder that are not hidden, and those of TeX` }] };
    }
    const inputs = new Set();
    for (const [, path] of (fls ?? '').matchAll(/^INPUT (.+)$/gm)) {
      const local = relative(dir, resolve(dir, path.trim()));
      if (local && !local.startsWith('..') && !isAbsolute(local)) inputs.add(local.split('\\').join('/'));
    }
    if (latex.status !== 0) return { errors: errorsOf(read(join(temporary, `${WRAPPER}.log`)) ?? latex.stdout ?? '', { name, dir, texts: { [WRAPPER]: wrapper, [SOURCE]: source, [PREAMBLE]: preamble === null ? null : cutPreamble(preamble) } }), inputs: [...inputs].sort() };
    const file = join(temporary, `${WRAPPER}.svg`);
    // a PostScript special could read a file through Ghostscript
    const svg = await run(tools.dvisvgm, ['--no-fonts', '--no-specials=ps', '--precision=2', `--output=${file}`, join(temporary, `${WRAPPER}.dvi`)], { cwd: dir, env });
    const text = read(file);
    if (svg.error || svg.status !== 0 || text === null) {
      return { errors: [{ file: `figures/${name}.tex`, line: null, message: `dvisvgm failed: ${(svg.error?.message ?? svg.stderr ?? '').trim().split(/\r?\n/).pop()}` }] };
    }
    const root = /<svg\b[^>]*>/.exec(text)[0];
    const size = (key) => parseFloat(new RegExp(`\\s${key}=['"]([\\d.]+)`).exec(root)[1]) * PT_PER_BP;
    return { svg: text, width: size('width'), height: size('height'), inputs: [...inputs].sort() };
  };
  const compile = async () => {
    writeFileSync(join(temporary, 'beeson-tikz.sty'), style);
    writeFileSync(join(temporary, `${SOURCE}.tex`), source);
    if (preamble !== null) writeFileSync(join(temporary, `${PREAMBLE}.tex`), cutPreamble(preamble));
    // the target in TeX pt of each dimension of the box that is set
    const target = { width: box.width != null ? box.width / PX_PER_PT : null, height: box.height != null ? box.height / PX_PER_PT : null };
    const boxed = target.width !== null || target.height !== null;
    let fit = {};
    let out;
    if (boxed && axes(source) === 1) {
      // pgfplots sets the width of an axis close to the width of its picture, and the second pass
      // takes the measured excess off. an axis is never made smaller than 10 pt
      fit = { ...target };
      out = await pass('light', fit);
      if (out.errors) return out;
      if (['width', 'height'].some((key) => target[key] !== null && Math.abs(out[key] - target[key]) * PX_PER_PT > SLACK)) {
        for (const key of ['width', 'height']) if (target[key] !== null) fit[key] = Math.max(10, fit[key] - (out[key] - target[key]));
        out = await pass('light', fit);
      }
    } else {
      out = await pass('light', fit);
      if (boxed && !out.errors) {
        // a drawing is scaled to fill its box in one dimension. its size is a + b scale in each
        // dimension, since text and lines are not scaled. a and b are measured from the pass at
        // scale 1 and the pass at the ratio of the box, and a last pass is run at the scale that
        // they give when the second pass misses the box
        // a dimension in which the drawing does not have a size is not fitted
        const first = out;
        const keys = ['width', 'height'].filter((key) => target[key] !== null && first[key] > 0);
        const gaps = (out) => keys.map((key) => (target[key] - out[key]) * PX_PER_PT);
        const missed = (out) => Math.min(...gaps(out).map(Math.abs)) > SLACK || Math.min(...gaps(out)) < -SLACK;
        const scale = keys.length ? Math.min(...keys.map((key) => target[key] / first[key])) : 1;
        if (Math.abs(scale - 1) > 1e-3) {
          fit = { scale };
          out = await pass('light', fit);
          if (!out.errors && missed(out)) {
            const scales = keys
              .map((key) => {
                const b = (out[key] - first[key]) / (scale - 1);
                return b > 0 ? 1 + (target[key] - first[key]) / b : scale * (target[key] / out[key]);
              });
            const corrected = Math.max(0.01, Math.min(...scales));
            if (Math.abs(corrected - scale) > 1e-4) {
              fit = { scale: corrected };
              out = await pass('light', fit);
            }
          }
        }
      }
    }
    if (out.errors) return out;
    // a figure that does not fit after the passes is shown smaller as a whole, and never larger
    const shrink = ['width', 'height'].filter((key) => target[key] !== null && (out[key] - target[key]) * PX_PER_PT > SLACK).map((key) => target[key] / out[key]);
    const factor = shrink.length ? Math.floor(Math.min(...shrink) * 1e4) / 1e4 : 1;
    const dark = await pass('dark', fit);
    if (dark.errors) return dark;
    const light = finishSvg(out.svg, `tikz-${name}-light-`, factor);
    const figure = {
      hash: used(out.inputs),
      width: light.width,
      height: light.height,
      scale: factor,
      parts: light.parts,
      inputs: out.inputs,
      dark: finishSvg(dark.svg, `tikz-${name}-dark-`, factor).svg,
      light: light.svg,
    };
    return { figure, text: figureScript(name, figure), passes, seconds: (Date.now() - started) / 1000 };
  };
  try {
    const out = await compile();
    return out.errors ? { ...out, hash: used(out.inputs) } : out;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** Writes the text of a compile into figures/name.js of the talk in the folder dir. */
export function writeFigure(dir, name, text) {
  mkdirSync(join(dir, 'figures'), { recursive: true });
  writeFileSync(join(dir, 'figures', `${name}.js`), text);
}

/** The figure that the script figures/name.js of the talk in the folder dir holds, or null when it is missing or unreadable. */
export function readFigure(dir, name) {
  const text = read(join(dir, 'figures', `${name}.js`));
  if (text === null) return null;
  try {
    const window = {};
    vm.runInNewContext(text, { window });
    return window.beesonFigures?.[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * The TikZ figures of a deck, each once, with its name, its box, its output and its source as paths
 * from the folder of the deck, and its state: current, stale, missing (without an output), no source,
 * or invalid (without a name of letters, digits, - and _). A figure shown twice takes the box of its
 * first tag. TeX is not run.
 */
export function figureStatus(deck) {
  return figureStates(dirname(resolve(deck)), readFileSync(deck, 'utf8')).map(({ text, output, ...figure }) => figure);
}

/**
 * The figures of figureStatus for the deck html in the folder dir, each with the text of its source
 * and its output as well, read by output(name), when it has a name.
 */
export function figureStates(dir, html, output = (name) => readFigure(dir, name)) {
  const seen = new Set();
  const figures = [];
  for (const { name, box } of deckFigures(html)) {
    if (!name || !/^[\w-]+$/.test(name)) {
      figures.push({ name: name || null, box, state: 'invalid' });
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    const entry = { name, box, file: `figures/${name}.js`, source: `figures/${name}.tex` };
    const source = read(join(dir, entry.source));
    const figure = output(name);
    Object.assign(entry, { text: source, output: figure });
    if (source === null) entry.state = 'no source';
    else if (!figure) entry.state = read(join(dir, entry.file)) === null ? 'missing' : 'stale';
    else entry.state = figure.hash === figureHash({ dir, source, box, inputs: Array.isArray(figure.inputs) ? figure.inputs : [] }) ? 'current' : 'stale';
    figures.push(entry);
  }
  return figures;
}

const problem = (figure, deck) =>
  ({
    stale: `${figure.file} is stale, run npm run tex`,
    missing: `${figure.file} is missing, run npm run tex`,
    'no source': `${figure.source} is not found, for the TikZ figure ${figure.name} of ${basename(deck)}`,
    invalid: `${basename(deck)}: a TikZ figure without a name in data-figure, or with a name other than letters, digits, - and _`,
  })[figure.state];

/** One line for each TikZ figure of a deck that is not current, as npm run check prints it. */
export function figureProblems(deck) {
  return figureStatus(deck)
    .filter((figure) => figure.state !== 'current')
    .map((figure) => problem(figure, deck));
}

/**
 * Compiles each stale or missing TikZ figure of a deck and writes its output, for npm run tex, with
 * one line for each figure. An output is kept after an error. Returns false, and sets the exit code
 * to 1, while a figure is not current, e.g. when TeX is not installed.
 */
export async function compileFigures(deck, { log = console.log, tools = findTools() } = {}) {
  const dir = dirname(resolve(deck));
  let current = true;
  for (const figure of figureStatus(deck)) {
    if (figure.state === 'current') {
      log(`${figure.file}: up to date`);
      continue;
    }
    if (figure.state === 'no source' || figure.state === 'invalid') {
      log(problem(figure, deck));
      current = false;
      continue;
    }
    const absent = ['latex', 'dvisvgm'].find((tool) => !tools[tool]);
    if (absent) {
      log(`${figure.file}: not compiled, since ${absent} is not found. install TeX Live, or put latex and dvisvgm on the PATH`);
      current = false;
      continue;
    }
    const compiled = await compileFigure({ dir, name: figure.name, box: figure.box, tools });
    if (compiled.errors) {
      for (const error of compiled.errors) log(`${error.file ?? figure.source}${error.line === null ? '' : `:${error.line}`}: ${error.message}`);
      log(`${figure.file}: not compiled${figure.state === 'stale' ? ', the last good output is kept' : ''}`);
      current = false;
      continue;
    }
    writeFigure(dir, figure.name, compiled.text);
    const { width, height, scale } = compiled.figure;
    const smaller = scale < 1 ? `, shown at ${scale} of its size, since it does not fit its box` : '';
    log(`${figure.file}: compiled in ${compiled.seconds.toFixed(1)} s, ${Math.round(width)} by ${Math.round(height)} px${smaller}`);
  }
  if (!current) process.exitCode = 1;
  return current;
}
