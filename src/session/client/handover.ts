// what theme/editor.js hands to theme/session.js in its one call, start(). the client may not
// import a stateful module of the editor, hence the parts of the shell that it needs come here

import type { App } from '../../editor/app.ts';
import type { Port } from '../../editor/session/session.ts';
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
};

// window.BeesonSession, defined by theme/session.js. start() resolves with false when the page is
// not served by an edit command, e.g. by a static server, and editor.js then opens its file as it
// does without a session
export type Entry = { start(handover: Handover): Promise<boolean> };
