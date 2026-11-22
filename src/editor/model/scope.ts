import { tokenize } from '../tokens.ts';
import { stateOf, type TagEdit } from '../tags.ts';

export const REVEAL_CLASSES = [
  'fragment', 'fade-in', 'fade-out', 'fade-up', 'fade-down', 'fade-left', 'fade-right', 'fade-in-then-out',
  'fade-in-then-semi-out', 'semi-fade-out', 'current-visible', 'grow', 'shrink', 'strike', 'highlight-red',
  'highlight-green', 'highlight-blue', 'highlight-current-red', 'highlight-current-green', 'highlight-current-blue',
];

const STEP_CLASSES = ['play'];

export const DATA_ATTRS = [
  'data-at', 'data-auto', 'data-auto-animate', 'data-autoplay', 'data-azimuth', 'data-bundle', 'data-cx', 'data-cy', 'data-duration',
  'data-dx', 'data-dy', 'data-elevation', 'data-final', 'data-fly-duration', 'data-fly-from', 'data-fly-to', 'data-focus', 'data-fragment-index', 'data-function', 'data-half',
  'data-heads', 'data-highlight', 'data-id', 'data-keep', 'data-keep-theme', 'data-line-numbers', 'data-live',
  'data-loop', 'data-mu', 'data-plot', 'data-plot-frame', 'data-plot-panels', 'data-plot-paused', 'data-plot-play',
  'data-plot-hide', 'data-plot-once', 'data-plot-show', 'data-plot-tab', 'data-plot-tabs', 'data-qr', 'data-rib', 'data-run', 'data-side', 'data-backdrop', 'data-backdrop-play',
  'data-stagger', 'data-system', 'data-plane', 'data-tori', 'data-trajectories', 'data-trajectories-color', 'data-trajectories-colormap', 'data-trajectories-ramp',
  'data-trajectories-select', 'data-trajectories-shade', 'data-surface-accent', 'data-surface-points', 'data-surface-state',
  'data-surface-violet', 'data-tone', 'data-turn', 'data-unhighlight', 'data-zoom', 'data-zscale',
  'data-visibility', 'data-timing', 'data-figure', 'data-part', 'data-transition', 'data-group', 'data-locked', 'data-autoslide',
  'data-guides', 'data-anchor', 'data-from', 'data-to', 'data-kind', 'data-name', 'data-key', 'data-pdf', 'data-page',
];

export const STANDARD_ATTRS = ['alt', 'src', 'poster', 'href', 'muted', 'loop', 'colspan', 'rowspan'];

export const TEMPLATE_ATTRS = ['id', 'type'];

export const LINE_ATTRS: Record<string, string[]> = {
  svg: ['width', 'height'],
  line: ['x1', 'y1', 'x2', 'y2', 'marker-start', 'marker-end'],
  marker: ['orient'],
  path: ['d', 'marker-start', 'marker-end'],
};

const SIZED_TAGS = new Set(['img', 'video', 'tycho-viewer']);
const STRETCHED_TAGS = new Set(['img', 'video', 'tycho-viewer']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'ul', 'ol']);
const takesWidth = (tag: string, classes: string[]) => TEXT_TAGS.has(tag) || (tag === 'div' && classes.includes('math')) || classes.includes('caption');
const PX = /^\d+px$/;

const NUMBER = '-?\\d+(\\.\\d+)?';
const AT = `(${NUMBER}(%|px)|0)`;
const MASK_DECLARATIONS: Record<string, RegExp> = {
  scale: new RegExp(`^${NUMBER}( ${NUMBER})?$`),
  'clip-path': new RegExp(`^inset\\(${NUMBER}%( round 50%)?\\)$`),
  'object-position': new RegExp(`^${AT} ${AT}$`),
  'object-fit': /^(cover|contain)$/,
};

export function themeClasses(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '').replace(/\{[^{}]*\}/g, '{}');
  const out = new Set<string>();
  for (const m of text.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) out.add(m[1]);
  return [...out];
}

export function declarationProblem(tag: string, classes: string[], name: string, value: string): string | null {
  if (name === 'translate' || name === 'rotate') return null;
  if (name === 'z-index') return /^-?\d+$/.test(value.trim()) ? null : `z-index ${value} on a ${tag}`;
  if (name === 'position') return value.trim() === 'relative' ? null : `position ${value} on a ${tag}`;
  if (name === 'width' && (tag === 'td' || tag === 'th')) return /^\d+px$/.test(value.trim()) ? null : `width ${value} on a ${tag}`;
  if ((name === 'width' || name === 'height') && tag === 'div' && classes.includes('shape')) return PX.test(value.trim()) ? null : `${name} ${value} on a shape`;
  if ((name === 'width' || name === 'height') && tag === 'div' && classes.includes('tikz')) return PX.test(value.trim()) ? null : `${name} ${value} on a TikZ figure`;
  if (name === 'width' && (SIZED_TAGS.has(tag) || classes.includes('qr'))) return null;
  if ((name === 'width' || name === 'height') && tag === 'div' && classes.includes('backdrop')) return PX.test(value.trim()) ? null : `${name} ${value} on a backdrop`;
  if (name === 'width') return takesWidth(tag, classes) && PX.test(value.trim()) ? null : `width on a ${tag}`;
  if (name === 'height' && tag === 'tr') return PX.test(value.trim()) ? null : `height ${value} on a tr`;
  if (name === 'height') return STRETCHED_TAGS.has(tag) && PX.test(value.trim()) ? null : `height ${value} on a ${tag}`;
  if (name === '--delay') return classes.includes('late') && /^\d+(\.\d+)?s$/.test(value.trim()) ? null : `--delay ${value} on a ${tag}`;
  if (name === 'font-size') return tag === 'pre' && /^(22|18)px$/.test(value.trim()) ? null : `font-size ${value} on a ${tag}`;
  if (name === 'text-align') return (tag === 'td' || tag === 'th') && value.trim() === 'right' ? null : `text-align ${value} on a ${tag}`;
  if (MASK_DECLARATIONS[name]) return tag === 'img' && MASK_DECLARATIONS[name].test(value.trim()) ? null : `${name} ${value} on a ${tag}`;
  return `the declaration ${name}`;
}

export function attributeProblem(name: string, template = false, tag = '', value = ''): string | null {
  if (name === 'start') return tag === 'ol' && /^-?\d+$/.test(value) ? null : `the attribute ${name}`;
  if (name === 'class' || name === 'style' || DATA_ATTRS.includes(name) || STANDARD_ATTRS.includes(name)) return null;
  if (LINE_ATTRS[tag]?.includes(name)) return null;
  if (template && TEMPLATE_ATTRS.includes(name)) return null;
  return `the attribute ${name}`;
}

export const NOT_ON_SLIDE = ['center'];

const allowedClass = (name: string, theme: Set<string>, tag = '') =>
  !(tag === 'section' && NOT_ON_SLIDE.includes(name)) && (theme.has(name) || REVEAL_CLASSES.includes(name) || STEP_CLASSES.includes(name) || /^language-[\w-]+$/.test(name));
const classProblem = (name: string, tag: string) => (tag === 'section' && NOT_ON_SLIDE.includes(name) ? `the class ${name} on a section` : `the class ${name}`);

export function editProblems(tag: string, fileAttrs: Parameters<typeof stateOf>[0], edit: TagEdit, theme: Set<string>): string[] {
  const out: string[] = [];
  const before = stateOf(fileAttrs);
  const after = stateOf(fileAttrs, edit);
  for (const c of after.classes) if (!before.classes.includes(c) && !allowedClass(c, theme, tag)) out.push(classProblem(c, tag));
  for (const [name, value] of Object.entries(after.attrs)) {
    if (before.attrs[name] === value) continue;
    const problem = attributeProblem(name, false, tag, value);
    if (problem) out.push(problem);
  }
  for (const [name, value] of Object.entries(after.style)) {
    if (before.style[name] === value) continue;
    const problem = declarationProblem(tag, after.classes, name, value);
    if (problem) out.push(problem);
  }
  return out;
}

export function textProblems(html: string, theme: Set<string>): string[] {
  const out: string[] = [];
  for (const t of tokenize(html)) {
    if (t.type !== 'start') continue;
    const s = stateOf(t.attrs);
    for (const c of s.classes) if (!allowedClass(c, theme, t.name)) out.push(`the class ${c} on a ${t.name}`);
    for (const [name, value] of Object.entries(s.attrs)) {
      const problem = attributeProblem(name, true, t.name, value);
      if (problem) out.push(`${problem} on a ${t.name}`);
    }
    for (const [name, value] of Object.entries(s.style)) {
      const problem = declarationProblem(t.name, s.classes, name, value);
      if (problem) out.push(problem);
    }
  }
  return out;
}
