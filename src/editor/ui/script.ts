// the files of theme/ that the editor loads on first use, next to theme/editor.js

import { make } from './dom.ts';

// read while editor.js runs, since currentScript is null afterward
const SELF = (document.currentScript as HTMLScriptElement | null)?.src ?? '';

// the address of path in theme/
export const themeUrl = (path: string) => (SELF ? new URL(path, SELF).href : `theme/${path}`);

// the script at path in theme/ loaded and run, which rejects when it is not found
export const script = (path: string): Promise<void> =>
  new Promise((done, fail) => {
    const s = make('script');
    s.src = themeUrl(path);
    s.onload = () => done();
    s.onerror = () => fail(new Error(`theme/${path} is not found next to theme/editor.js`));
    document.head.append(s);
  });
