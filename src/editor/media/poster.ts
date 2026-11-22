const TIMEOUT = 60000;

function loaded(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((done, fail) => {
    const timer = window.setTimeout(() => finish(new Error('the video did not load in time')), TIMEOUT);
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      video.removeEventListener(event, ok);
      video.removeEventListener('error', bad);
      if (error) fail(error);
      else done();
    };
    const ok = () => finish();
    const bad = () => finish(new Error('your browser cannot play this video'));
    video.addEventListener(event, ok);
    video.addEventListener('error', bad);
  });
}

const seekable = (video: HTMLVideoElement, s: number): boolean =>
  [...Array(video.seekable.length).keys()].some((i) => video.seekable.start(i) <= s && s <= video.seekable.end(i));

async function seekTo(video: HTMLVideoElement, s: number): Promise<void> {
  const there = () => !video.seeking && Math.abs(video.currentTime - s) < 0.25;
  const already = there();
  const seeked = loaded(video, 'seeked');
  video.currentTime = s;
  if (already) {
    await Promise.race([seeked.catch(() => {}), new Promise((done) => setTimeout(done, 500))]);
    return;
  }
  await seeked;
  while (!there()) await loaded(video, 'seeked');
}

export async function firstFrame(url: string, time = 0): Promise<Blob> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  let copy: string | null = null;
  try {
    await loaded(video, 'loadeddata');
    const at = Number.isFinite(video.duration) ? Math.max(0, Math.min(time, video.duration - 0.001)) : 0;
    if (at > 0 && !seekable(video, at) && !url.startsWith('blob:')) {
      copy = URL.createObjectURL(await (await fetch(url)).blob());
      video.src = copy;
      await loaded(video, 'loadeddata');
    }
    await seekTo(video, at);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (!canvas.width || !canvas.height) throw new Error('the video does not have a frame');
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    let blob: Blob | null;
    try {
      blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
    } catch {
      throw new Error('the frames of this video cannot be read by the page. Serve the deck from a web server to capture its poster');
    }
    if (!blob) throw new Error('the poster could not be made');
    return blob;
  } finally {
    video.removeAttribute('src');
    video.load();
    if (copy) URL.revokeObjectURL(copy);
  }
}
