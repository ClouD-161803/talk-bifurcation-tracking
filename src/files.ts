declare global {
  interface Window {
    beesonFiles?: Record<string, string>;
  }
}

const HOME = typeof document === 'undefined' ? '' : ((document.currentScript as HTMLScriptElement | null)?.src ?? '');

export const exported = (): boolean => typeof window !== 'undefined' && !!window.beesonFiles;

const LARGE = 8 * 1024 * 1024;
const blobs = new Map<string, string>();

function bytesOf(base64: string): Uint8Array {
  const fromBase64 = (Uint8Array as unknown as { fromBase64?: (text: string) => Uint8Array }).fromBase64;
  if (fromBase64) return fromBase64(base64);
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function blobOf(url: string): string {
  if (url.length < LARGE || !url.startsWith('data:')) return url;
  const known = blobs.get(url);
  if (known) return known;
  const comma = url.indexOf(',');
  const head = url.slice(5, comma);
  if (!head.endsWith(';base64')) return url;
  const blob = URL.createObjectURL(new Blob([bytesOf(url.slice(comma + 1)) as BlobPart], { type: head.slice(0, -7) }));
  blobs.set(url, blob);
  return blob;
}

export function unpackLarge(root: ParentNode = document): void {
  for (const name of ['src', 'poster']) {
    for (const el of root.querySelectorAll(`[${name}^="data:"]`)) {
      const url = el.getAttribute(name) ?? '';
      if (url.length < LARGE) continue;
      el.setAttribute(name, blobOf(url));
      if (el instanceof HTMLSourceElement && el.parentElement instanceof HTMLMediaElement) el.parentElement.load();
    }
  }
}

export function deckFile(path: string): string {
  const files = window.beesonFiles;
  if (!files) return path;
  const base = new URL('.', document.baseURI).href;
  const url = new URL(path, document.baseURI).href.replace(/[?#].*$/, '');
  if (!url.startsWith(base)) return path;
  try {
    const file = files[url.slice(base.length).split('/').map(decodeURIComponent).join('/')];
    return file ? blobOf(file) : path;
  } catch {
    return path;
  }
}

export const themeFile = (path: string): string => (exported() ? deckFile(`theme/${path}`) : HOME ? new URL(path, HOME).href : `theme/${path}`);
