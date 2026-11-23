type Locks = { request(name: string, options: { ifAvailable: boolean }, fn: (lock: unknown) => Promise<void> | undefined): Promise<void> };

const SLOTS = 3;
export const SHORT = 1000;

export async function takeSlot(held: (release: () => void) => void): Promise<boolean> {
  const locks = (navigator as { locks?: Locks }).locks;
  if (!locks) return true;
  for (let i = 0; i < SLOTS; i++) {
    const granted = await new Promise<boolean>((done) => {
      locks
        .request(`beeson-session-poll:${i}`, { ifAvailable: true }, (lock) => {
          done(!!lock);
          return lock ? new Promise<void>((release) => held(release)) : undefined;
        })
        .catch(() => done(true));
    });
    if (granted) return true;
  }
  return false;
}
