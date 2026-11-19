// a browser opens at most 6 connections to one host, shared by every page of this origin, and each
// long poll keeps one of them busy. hence only SLOTS pages poll long, each with a lock of the Web
// Locks API. the polls of the other pages are answered at once and sent again after SHORT ms, so
// that a load, an operation, or the hello of another page is given a free connection

type Locks = { request(name: string, options: { ifAvailable: boolean }, fn: (lock: unknown) => Promise<void> | undefined): Promise<void> };

const SLOTS = 3;
export const SHORT = 1000;

// whether a lock was granted, which the page then keeps until release() is called. in a browser
// without the Web Locks API, or one that refuses the request, every poll is long
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
