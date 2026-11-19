type Viewer = HTMLElement & {
  canvas: HTMLCanvasElement | null;
  renderer: object | null;
  pause(): void;
  draw(): void;
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const written = new WeakSet<Element>();

export function markViewers(): void {
  document.querySelectorAll('tycho-viewer').forEach((viewer, i) => {
    viewer.setAttribute('data-still', String(i));
    written.add(viewer);
  });
}

function box(viewer: Viewer): HTMLDivElement {
  const still = document.createElement('div');
  still.className = viewer.className;
  still.classList.add('viewer-still');
  still.style.cssText = viewer.style.cssText;
  if (viewer.dataset.still !== undefined) still.dataset.still = viewer.dataset.still;
  still.style.position = getComputedStyle(viewer).position;
  viewer.replaceWith(still);
  return still;
}

async function still(viewer: Viewer): Promise<HTMLImageElement | null> {
  const failed = () => viewer.shadowRoot?.querySelector('.status.error');
  while (!viewer.renderer && !failed()) await sleep(50);
  if (!viewer.canvas || !viewer.renderer) return null;
  viewer.pause();
  viewer.draw();
  const image = new Image();
  image.src = viewer.canvas.toDataURL('image/png');
  image.alt = 'A still of a tycho scene';
  const host = viewer.getBoundingClientRect();
  const canvas = viewer.canvas.getBoundingClientRect();
  const scale = host.width / (viewer.offsetWidth || 1);
  const px = (n: number) => `${Math.round(n / scale)}px`;
  image.style.cssText = `position: absolute; left: ${px(canvas.left - host.left)}; top: ${px(canvas.top - host.top)}; width: ${px(canvas.width)}; height: ${px(canvas.height)}; object-fit: fill`;
  return image;
}

export async function stillViewers(): Promise<void> {
  const viewers: Viewer[] = [];
  const clones = new Map<string, HTMLDivElement[]>();
  for (const viewer of document.querySelectorAll<Viewer>('tycho-viewer')) {
    const id = viewer.dataset.still;
    if (id === undefined || written.has(viewer)) viewers.push(viewer);
    else clones.set(id, [...(clones.get(id) ?? []), box(viewer)]);
  }
  for (const viewer of viewers) {
    const image = await still(viewer);
    if (image === null) continue;
    box(viewer).append(image);
    for (const clone of clones.get(viewer.dataset.still ?? '') ?? []) clone.append(image.cloneNode());
  }
}
