type Prefixed = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type Requestable = HTMLElement & { webkitRequestFullscreen?: () => void };

const prefixed = document as Prefixed;

export const isFullscreen = (): boolean => !!(prefixed.fullscreenElement ?? prefixed.webkitFullscreenElement);

function enter(): void {
  const root = document.documentElement as Requestable;
  if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  else root.webkitRequestFullscreen?.();
}

export function toggleFullscreen(): void {
  if (!isFullscreen()) enter();
  else if (prefixed.exitFullscreen) prefixed.exitFullscreen().catch(() => {});
  else prefixed.webkitExitFullscreen?.();
}

export function windowFull(w: Window = window): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  return near(w.outerWidth, w.screen.width) && near(w.outerHeight, w.screen.height) && w.innerHeight < w.screen.height - 1;
}

export function initFullscreen(): void {
  let armed = false;
  let left = false;
  const check = () => {
    if (!windowFull()) { armed = false; left = false; }
    else if (!isFullscreen() && !left) armed = true;
  };
  const changed = () => {
    armed = false;
    if (!isFullscreen()) left = true;
  };
  const take = (ev: Event) => {
    if (!armed || isFullscreen() || (ev instanceof KeyboardEvent && (ev.key === 'Escape' || ev.repeat))) return;
    armed = false;
    enter();
  };
  window.addEventListener('resize', check);
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);
  document.addEventListener('keydown', take, true);
  document.addEventListener('pointerdown', take, true);
  check();
}
