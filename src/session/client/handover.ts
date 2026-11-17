// what theme/editor.js hands to theme/session.js in its one call, start(). the client may not
// import a stateful module of the editor, hence the parts of the shell that it needs come here

import type { App } from '../../editor/app.ts';
import type { Edit } from '../../editor/merge.ts';
import type { MediaStore } from '../../editor/media/store.ts';
import type { Port } from '../../editor/session/session.ts';
import type { PresenceHooks, Shape } from '../../editor/session/presence.ts';
import type { SlideHooks } from '../../editor/session/slides.ts';
import type { Dialog, DialogOptions } from '../../editor/ui/dialog.ts';
import type { MenuItem, MenuOptions, OpenMenu } from '../../editor/ui/menu.ts';

export type Handover = {
  app: App;
  port: Port;
  // a modal dialog of ui/dialog.ts, kept in the page between its opens
  dialog(options: DialogOptions): Dialog;
  // an icon of ui/icons.ts, e.g. cloud, cloud-off, or warning
  icon(name: string, size?: number): SVGSVGElement;
  // .right of the title bar of shell/menubar.ts, into which the client puts its buttons
  bar: HTMLElement;
  // a download of a copy of the deck under the name of its file
  download(text: string): void;
  // a menu of ui/menu.ts, e.g. of an avatar, which closes any menu open before
  menu(items: MenuItem[], options: MenuOptions): OpenMenu;
  // the numbers of the slides, from 1, of the ranges in a text of the deck, as the navigator counts them
  slidesAt(text: string, ranges: Edit[]): number[];
  // the slides of after that differ from before, by their numbers in after
  changedSlides(before: string, after: string): number[];
  // ' on slide 3', ' on slides 3 and 5', or '' without a slide
  onSlides(numbers: number[]): string;
  // the images and videos added in the editor and not saved yet
  media: MediaStore;
  // what presence.ts and layer.ts of the client read of the editor, from src/editor/session/presence.ts
  presence: PresenceHooks;
  // what the navigator and the Slide Sorter give the client, from src/editor/session/slides.ts
  slides: SlideHooks;
  // the groups of two members or more among els, each with the shape of the frame that frames.ts
  // draws around its members, read with the shapes of presence
  groups(els: Element[]): { els: Element[]; shape: Shape }[];
  // the Version History mode of src/editor/session/history-mode.ts
  history: HistoryShell;
};

export type HistoryShell = {
  // the inspector, which the pane of Version History takes the place of while the mode is on
  inspector: HTMLElement | null;
  // the run of File > Version History and of its key, which are defined in a session only
  onCommand(fn: () => void): void;
  // the mode on or off: the chrome inert, the commands of the person held, and Esc handed to back
  setMode(on: boolean, back?: () => void): void;
  // the rectangle of the canvas in the window
  canvas(): DOMRect;
};

// window.BeesonSession, defined by theme/session.js. start() resolves with false when the page is
// not served by an edit command, e.g. by a static server, and editor.js then opens its file as it
// does without a session
export type Entry = { start(handover: Handover): Promise<boolean> };
