import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const PX_PER_PT = 3.6;
const PT_PER_BP = 72.27 / 72;
export const STYLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'beeson-tikz.sty');
const WRAPPER = 'beeson-figure';
const SOURCE = 'beeson-figure-source';
const PREAMBLE = 'beeson-figure-preamble';
const SLACK = 0.5;
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

export function findTools(env = process.env) {
  const folders = env.BEESON_TEXBIN !== undefined ? [env.BEESON_TEXBIN] : [...(env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean), ...usualFolders(env)];
  const extensions = process.platform === 'win32' ? ['.exe', ''] : [''];
  const find = (name) => {
    for (const folder of folders) for (const extension of extensions) if (isFile(join(folder, name + extension))) return join(folder, name + extension);
    return null;
  };
  return { latex: find('latex'), dvisvgm: find('dvisvgm') };
}

function run(command, args, options, signal) {
  return new Promise((done) => {
    if (signal?.aborted) {
      done({ error: new Error('the compile was stopped') });
      return;
    }
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
    const stop = () => {
      out.error ??= new Error('the compile was stopped');
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', stop, { once: true });
    child.once('error', (error) => (out.error ??= error));
    child.once('close', (status) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      done({ ...out, status });
    });
  });
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

export function cutPreamble(text) {
  const lines = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
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

export function wrapperOf({ mode = 'light', preamble = false, width = null, height = null, scale = 1 } = {}) {
  const lines = [
    '\\documentclass[dvisvgm]{article}',
    '\\usepackage[T1]{fontenc}\\usepackage{lmodern}\\usepackage{tikz,pgfplots}\\pgfplotsset{compat=1.18}',
    `\\usepackage[${mode}]{beeson-tikz}`,
  ];
  lines.push('\\usepackage{amsopn,amsthm}');
  if (preamble) lines.push(`\\input{${PREAMBLE}}`);
  lines.push('\\usepackage{amsmath,amssymb,bm}');
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

const axes = (source) => source.replace(/(^|[^\\])%.*$/gm, '$1').match(/\\begin\{(axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis|ternaryaxis|smithchart)\}/g)?.length ?? 0;

function errorsOf(log, { name, dir, texts }) {
  const located = [...log.matchAll(/^(.*?\.\w+):(\d+): (.*)$/gm)].map(([, path, line, message]) => ({ path, line: Number(line), message }));
  let errors = located.filter((error) => !/^Emergency stop/.test(error.message));
  if (!errors.length) {
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
      file = (texts[WRAPPER].split('\n')[line - 1] ?? '').includes(PREAMBLE) ? 'preamble.tex' : source;
      line = null;
    } else {
      const local = relative(dir, resolve(dir, path));
      file = local.startsWith('..') || isAbsolute(local) ? base : local.split('\\').join('/');
    }
    const missing = /File `([^']+)' not found/.exec(message)?.[1].replace(/\.\w+$/, '');
    const text = { [source]: texts[SOURCE], 'preamble.tex': texts[PREAMBLE] }[file];
    if (line === null && missing && text) {
      const at = text.split('\n').findIndex((code) => code.replace(/(^|[^\\])%.*$/, '$1').includes(missing));
      if (at >= 0) line = at + 1;
    }
    return { file, line, message: message.trim().replace(/\.$/, '') };
  });
}

export function figureHash({ dir, source, box = {}, inputs, texts = {} }) {
  const hash = createHash('sha256');
  const add = (label, text) => hash.update(`${label}\0${text === null ? '\u0001' : text.replace(/\r\n/g, '\n')}\0`);
  const given = (key, file, encoding) => (Object.hasOwn(texts, key) ? texts[key] : read(file, encoding));
  add('source', source);
  add('style', given('style', STYLE));
  add('wrapper', wrapperOf());
  add('preamble', given('preamble', join(dir, 'preamble.tex')));
  for (const file of [...(inputs ?? [])].sort()) add(`input ${file}`, given(file, join(dir, file), 'latin1'));
  add('box', `${box.width ?? ''} ${box.height ?? ''}`);
  return hash.digest('hex').slice(0, 16);
}

const ascii = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

export function figureScript(name, figure) {
  const lines = [`(window.beesonFigures ??= {})[${ascii(name)}] = {`];
  for (const [key, value] of Object.entries(figure)) lines.push(`  ${ascii(key)}: ${ascii(value)},`);
  lines.push('};');
  return `${lines.join('\n')}\n`;
}

export async function compileFigure({ dir, name, source, box = {}, tools = findTools(), signal }) {
  const started = Date.now();
  dir = resolve(dir);
  source ??= readFileSync(join(dir, 'figures', `${name}.tex`), 'utf8');
  for (const tool of ['latex', 'dvisvgm']) {
    if (!tools[tool]) return { errors: [{ file: null, line: null, message: `${tool} is not found` }] };
  }
  const preamble = read(join(dir, 'preamble.tex'));
  const style = readFileSync(STYLE, 'utf8');
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
  const env = { ...process.env, TEXINPUTS: `${temporary}${delimiter}${process.env.TEXINPUTS ?? ''}`, max_print_line: '10000', error_line: '254', half_error_line: '238' };
  let passes = 0;
  const pass = async (mode, fit) => {
    passes += 1;
    const wrapper = wrapperOf({ mode, preamble: preamble !== null, ...fit });
    writeFileSync(join(temporary, `${WRAPPER}.tex`), wrapper);
    const latex = await run(tools.latex, ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', '-file-line-error', '-recorder', `-output-directory=${temporary}`, `${WRAPPER}.tex`], { cwd: dir, env }, signal);
    if (latex.error) return { errors: [{ file: null, line: null, message: `latex does not run: ${latex.error.message}` }] };
    const fls = read(join(temporary, `${WRAPPER}.fls`));
    const inputs = new Set();
    for (const [, path] of (fls ?? '').matchAll(/^INPUT (.+)$/gm)) {
      const local = relative(dir, resolve(dir, path.trim()));
      if (local && !local.startsWith('..') && !isAbsolute(local)) inputs.add(local.split('\\').join('/'));
    }
    if (latex.status !== 0) return { errors: errorsOf(read(join(temporary, `${WRAPPER}.log`)) ?? latex.stdout ?? '', { name, dir, texts: { [WRAPPER]: wrapper, [SOURCE]: source, [PREAMBLE]: preamble === null ? null : cutPreamble(preamble) } }), inputs: [...inputs].sort() };
    const file = join(temporary, `${WRAPPER}.svg`);
    const svg = await run(tools.dvisvgm, ['--no-fonts', '--precision=2', `--output=${file}`, join(temporary, `${WRAPPER}.dvi`)], { cwd: dir, env }, signal);
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
    const target = { width: box.width != null ? box.width / PX_PER_PT : null, height: box.height != null ? box.height / PX_PER_PT : null };
    const boxed = target.width !== null || target.height !== null;
    let fit = {};
    let out;
    if (boxed && axes(source) === 1) {
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

export function writeFigure(dir, name, text) {
  mkdirSync(join(dir, 'figures'), { recursive: true });
  writeFileSync(join(dir, 'figures', `${name}.js`), text);
}

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

export function figureStatus(deck) {
  return figureStates(dirname(resolve(deck)), readFileSync(deck, 'utf8')).map(({ text, output, ...figure }) => figure);
}

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

export function figureProblems(deck) {
  return figureStatus(deck)
    .filter((figure) => figure.state !== 'current')
    .map((figure) => problem(figure, deck));
}

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
