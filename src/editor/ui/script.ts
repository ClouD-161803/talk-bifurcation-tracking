import { make } from './dom.ts';

const SELF = (document.currentScript as HTMLScriptElement | null)?.src ?? '';

export const themeUrl = (path: string) => (SELF ? new URL(path, SELF).href : `theme/${path}`);

export const script = (path: string): Promise<void> =>
  new Promise((done, fail) => {
    const s = make('script');
    s.src = themeUrl(path);
    s.onload = () => done();
    s.onerror = () => fail(new Error(`theme/${path} is not found next to theme/editor.js`));
    document.head.append(s);
  });
