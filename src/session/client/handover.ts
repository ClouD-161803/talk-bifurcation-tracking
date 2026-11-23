import type { App } from '../../editor/app.ts';
import type { Command } from '../../editor/commands.ts';
import type { Edit } from '../../editor/merge.ts';
import type { MediaStore } from '../../editor/media/store.ts';
import type { Port } from '../../editor/session/port.ts';
import type { PresenceHooks, Shape } from '../../editor/session/presence.ts';
import type { SlideHooks } from '../../editor/session/slides.ts';
import type { CommentsTab } from '../../editor/shell/shell.ts';
import type { Dialog, DialogOptions } from '../../editor/ui/dialog.ts';
import type { MenuItem, MenuOptions, OpenMenu } from '../../editor/ui/menu.ts';

export type Handover = {
  app: App;
  port: Port;
  dialog(options: DialogOptions): Dialog;
  icon(name: string, size?: number): SVGSVGElement;
  bar: HTMLElement;
  download(text: string): void;
  define(command: Command): void;
  menu(items: MenuItem[], options: MenuOptions): OpenMenu;
  slidesAt(text: string, ranges: Edit[]): number[];
  changedSlides(before: string, after: string): number[];
  onSlides(numbers: number[]): string;
  media: MediaStore;
  presence: PresenceHooks;
  slides: SlideHooks;
  groups(els: Element[]): { els: Element[]; shape: Shape }[];
  history: HistoryShell;
  comments: CommentsShell;
};

export type HistoryShell = {
  inspector: HTMLElement | null;
  onCommand(fn: () => void): void;
  setMode(on: boolean, back?: () => void): void;
  canvas(): DOMRect;
  load(): Promise<void>;
};

export type CommentsShell = {
  tab: CommentsTab;
  describe(el: Element): { kind: string; text: string };
  target(): { el: Element | null; slide: Element | null };
  frame(el: Element | null, slide: Element | null): void;
  row(slide: Element): HTMLElement | null;
};

export type Entry = { start(handover: Handover): Promise<boolean> };
