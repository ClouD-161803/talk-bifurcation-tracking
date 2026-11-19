import type { App, Platform, Region } from './app.ts';
import { display, fallback, matches, type KeyEvent } from './keymap.ts';

export type Context = 'element' | 'text' | 'canvas' | 'slide' | 'navigator';

export type Command = {
  id: string;
  label: string | ((app: App) => string);
  keys?: { mac?: string[]; other?: string[] };
  in?: Region[];
  inText?: boolean | Platform[];
  menu?: { bar: string; group: string; order: number; submenu?: string };
  toolbar?: { group: string; order: number; icon: string; label?: string; split?: string };
  context?: Context[];
  listedAs?(app: App): string;
  runsAs?(app: App): string;
  enabled?(app: App): boolean;
  checked?(app: App): boolean | null;
  run(app: App, arg?: unknown): void | Promise<void>;
  undoable?: boolean;
  undo?: string;
  why?(app: App): string | null;
  note?(app: App): string | null;
};

export type CommandState = { id: string; label: string; enabled: boolean; checked: boolean | null; why?: string };

export type Group = { group: string; commands: Command[] };

export const DEFAULT_REGIONS: Region[] = ['canvas', 'navigator'];

export const OUTSIDE_DIALOGS: Region[] = ['canvas', 'text', 'field', 'navigator', 'notes', 'inspector'];
export const EVERYWHERE: Region[] = [...OUTSIDE_DIALOGS, 'dialog'];

const HELD = ['Mod+D', 'Mod+O'];

const CLIPBOARD_KEYS: Record<string, string[]> = { 'edit.cut': ['Mod+X'], 'edit.copy': ['Mod+C'], 'edit.paste': ['Mod+V'] };

export const CLIPBOARD_REGIONS: Region[] = ['canvas', 'inspector'];

export function boundKeys(c: Command, platform: Platform): string[] {
  return c.keys?.[platform] ?? [];
}

export function keysOf(c: Command, platform: Platform): string[] {
  return [...new Set(c.keys?.[platform] ?? CLIPBOARD_KEYS[c.id] ?? [])];
}

export function isPlain(value: string): boolean {
  return !/(^|\+)(Mod|Ctrl|Alt|Meta)\+/.test(value) && !/^(Shift\+)?F\d+$/.test(value);
}

const orderOf = (c: Command, place: 'menu' | 'toolbar'): number => c[place]?.order ?? 0;

function grouped(list: Command[], place: 'menu' | 'toolbar'): Group[] {
  const groups = new Map<string, Command[]>();
  for (const c of [...list].sort((a, b) => orderOf(a, place) - orderOf(b, place))) {
    const name = c[place]?.group ?? '';
    groups.set(name, [...(groups.get(name) ?? []), c]);
  }
  return [...groups].map(([group, commands]) => ({ group, commands }));
}

export class Commands {
  private readonly app: App;
  private readonly byId = new Map<string, Command>();

  constructor(app: App) {
    this.app = app;
  }

  define(command: Command): Command {
    if (this.byId.has(command.id)) throw new Error(`the command ${command.id} is defined twice`);
    this.byId.set(command.id, command);
    return command;
  }

  get(id: string): Command | undefined {
    return this.byId.get(id);
  }

  list(): Command[] {
    return [...this.byId.values()];
  }

  label(id: string): string {
    const c = this.byId.get(id);
    if (!c) return id;
    return typeof c.label === 'function' ? c.label(this.app) : c.label;
  }

  private readonly vetoes: ((app: App, c: Command) => boolean)[] = [];

  veto(check: (app: App, c: Command) => boolean): void {
    this.vetoes.push(check);
  }

  private readonly refusals: ((app: App, c: Command, arg?: unknown) => boolean)[] = [];

  refuse(check: (app: App, c: Command, arg?: unknown) => boolean): void {
    this.refusals.push(check);
  }

  refused(id: string, arg?: unknown): boolean {
    const c = this.byId.get(id);
    return !!c && this.refusals.some((r) => r(this.app, c, arg));
  }

  applies(id: string): boolean {
    const c = this.byId.get(id);
    return !!c && (c.enabled?.(this.app) ?? true);
  }

  enabled(id: string): boolean {
    const c = this.byId.get(id);
    return !!c && this.applies(id) && !this.vetoes.some((v) => v(this.app, c));
  }

  state(id: string): CommandState {
    const c = this.byId.get(id);
    if (!c) throw new Error(`there is no command ${id}`);
    const enabled = this.enabled(id);
    const why = enabled ? null : c.why?.(this.app);
    return { id, label: this.label(id), enabled, checked: c.checked?.(this.app) ?? null, ...(why ? { why } : {}) };
  }

  async run(id: string, arg?: unknown): Promise<void> {
    const c = this.byId.get(id);
    if (!c) throw new Error(`there is no command ${id}`);
    if (!this.enabled(id) || this.refused(id, arg)) return;
    if (c.undoable) await this.app.history.transact(c.undo ?? this.label(c.runsAs?.(this.app) ?? id), () => c.run(this.app, arg));
    else await c.run(this.app, arg);
  }

  listed(id: string): Command | undefined {
    const c = this.byId.get(id);
    return (c?.listedAs && this.byId.get(c.listedAs(this.app))) || c;
  }

  shortcuts(id: string): string[] {
    const c = this.listed(id);
    return c ? keysOf(c, this.app.platform).map((k) => display(k, this.app.platform)) : [];
  }

  forKey(ev: KeyEvent, region: Region, plain = true): Command | undefined {
    const platform = this.app.platform;
    const types = (k: string) => (region === 'text' || region === 'notes') && isPlain(k) && k.split('+').at(-1)!.length === 1;
    const find = (e: KeyEvent) => this.list().find((c) => {
      const inText = c.inText === true || (Array.isArray(c.inText) && c.inText.includes(platform));
      const typed = region === 'text' && inText && !(c.in ?? DEFAULT_REGIONS).includes(region);
      return (typed || (c.in ?? DEFAULT_REGIONS).includes(region)) &&
        boundKeys(c, platform).some((k) => (plain || !isPlain(k)) && !(typed && isPlain(k)) && !types(k) && matches(e, k, platform)) &&
        this.enabled(c.id);
    });
    const editable = region === 'text' || region === 'notes' || (document.activeElement as HTMLElement | null)?.isContentEditable === true;
    const cocoa = platform === 'mac' && editable && ev.ctrlKey && !ev.metaKey && /^[abdefhklnoptvy]$/i.test(ev.key);
    const alt = cocoa ? null : fallback(ev, platform);
    return find(ev) ?? (alt ? find(alt) : undefined);
  }

  held(ev: KeyEvent): boolean {
    return HELD.some((k) => matches(ev, k, this.app.platform));
  }

  forMenu(bar: string, submenu?: string): Group[] {
    return grouped(this.list().filter((c) => c.menu?.bar === bar && c.menu.submenu === submenu), 'menu');
  }

  forToolbar(): Group[] {
    return grouped(this.list().filter((c) => c.toolbar), 'toolbar');
  }

  forContext(kind: Context): Command[] {
    return this.list().filter((c) => c.context?.includes(kind));
  }
}

export function installKeys(app: App): void {
  window.addEventListener('keydown', (ev) => {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (dialogKey(app, ev)) return;
    const own = (document.activeElement as Element | null)?.closest?.('[data-own-keys]')?.getAttribute('data-own-keys');
    const alt = own ? fallback(ev, app.platform) : null;
    if (own?.split(' ').some((k) => matches(ev, k, app.platform) || (!!alt && matches(alt, k, app.platform)))) return;
    const region = app.region();
    const active = document.activeElement;
    const onBar = region === 'canvas' && active instanceof Element && active !== document.body && active !== document.documentElement && !active.closest('.reveal, .beeson-handle');
    const command = app.commands.forKey(ev, region, !onBar);
    if (!command && app.commands.held(ev)) ev.preventDefault();
    if (!command) return;
    ev.preventDefault();
    ev.stopPropagation();
    void app.commands.run(command.id).catch((e) => app.fail(e));
  }, true);
}

function dialogKey(app: App, ev: KeyboardEvent): boolean {
  const active = document.activeElement;
  if ((ev.key === 'Enter' || ev.key === ' ') && !app.math.isOpen() && active instanceof Element && active.matches('mjx-container') && app.hostOf(active)) {
    ev.preventDefault();
    ev.stopPropagation();
    app.math.open(active);
    return true;
  }
  if (ev.key !== 'Escape') return false;
  if (app.files.problemsShown()) app.files.closeProblems();
  else if (app.files.askShown()) app.files.cancelAsk();
  else if (app.math.isOpen()) app.math.close();
  else return false;
  ev.stopPropagation();
  return true;
}
