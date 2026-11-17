// the requests of a page to the edit command, under .session/ next to the page. a request that does
// not get an answer of the edit command throws a Failure, whose status is 0 for the network, 502
// when the relay does not reach an edit command, 410 when the relay answers that the session ended,
// and the status of any other error

import type { CommentsAnswer, Ended, EventsAnswer, HelloAnswer, HelloRequest, NameAnswer, OpAnswer, OpPost, Taken, Token, Version } from '../protocol.ts';

// a request with this status, or 0 for the network, may succeed when it is sent again later, e.g.
// while the edit command restarts
export const mayRetry = (status: number): boolean => status === 0 || status === 408 || status === 429 || status >= 500;

export class Failure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  get retried(): boolean {
    return mayRetry(this.status);
  }
}

// the longest wait for an answer in ms. the edit command holds a poll of events for 25 s at most
const POST_WAIT = 30_000;
const POLL_WAIT = 45_000;

export class Transport {
  private readonly base: URL;
  // told the record of the end that the relay answers to any request after End session
  private readonly onEnded: (ended: Ended) => void;
  // the last operation whose request with keepalive failed
  private failed: OpPost | null = null;

  constructor(page: string, onEnded: (ended: Ended) => void = () => {}) {
    this.base = new URL('.session/', page);
    this.onEnded = onEnded;
  }

  url(route: string, query: Record<string, string> = {}): string {
    const url = new URL(route, this.base);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url.href;
  }

  hello(request: HelloRequest): Promise<HelloAnswer | Taken> {
    return this.post('hello', request);
  }

  // an operation with keepalive reaches the edit command also when its page is closed. the fetch
  // standard refuses such a request while 64 KiB of such bodies are in flight in one document. a
  // body under 20,000 characters is under 60,000 bytes in UTF-8, and one of 60,000 characters is
  // not, hence the bytes of the others alone are counted. an operation that failed with keepalive
  // is sent again without it
  op(post: OpPost): Promise<OpAnswer> {
    const body = JSON.stringify(post);
    const keepalive = post !== this.failed && (body.length < 20_000 || (body.length < 60_000 && new Blob([body]).size < 60_000));
    return this.send<OpAnswer>(this.url('op'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive }, POST_WAIT).catch((e: unknown) => {
      if (keepalive) this.failed = post;
      throw e;
    });
  }

  name(token: Token, name: string): Promise<NameAnswer> {
    return this.post('name', { token, name });
  }

  presence(token: Token, state: unknown): Promise<unknown> {
    return this.post('presence', { token, state });
  }

  events(token: Token, since: Version): Promise<EventsAnswer> {
    return this.send(this.url('events', { token, since }), { method: 'GET' }, POLL_WAIT);
  }

  comments(token: Token): Promise<CommentsAnswer> {
    return this.send(this.url('comments', { token }), { method: 'GET' }, POST_WAIT);
  }

  // sent while the page is hidden for good, hence its answer is not read
  bye(token: Token): void {
    const body = JSON.stringify({ token });
    const url = this.url('bye');
    try {
      if ('keepalive' in Request.prototype) {
        void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      } else navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }));
    } catch {
      // the edit command drops the page after 40 s without a poll
    }
  }

  get<T>(route: string, query: Record<string, string>): Promise<T> {
    return this.send(this.url(route, query), { method: 'GET' }, POST_WAIT);
  }

  post<T>(route: string, body: unknown): Promise<T> {
    return this.send(this.url(route), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, POST_WAIT);
  }

  private async send<T>(url: string, init: RequestInit, wait: number): Promise<T> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), wait);
    let response: Response;
    try {
      response = await fetch(url, { ...init, cache: 'no-store', signal: abort.signal });
    } catch (e) {
      clearTimeout(timer);
      throw new Failure(0, e instanceof Error ? e.message : String(e));
    }
    try {
      const text = await response.text();
      let value: unknown = null;
      try {
        value = JSON.parse(text);
      } catch {
        // the answer of a relay or a proxy is not JSON
      }
      if (!response.ok || value === null || typeof value !== 'object') {
        const ended = response.status === 410 ? (value as { ended?: Partial<Ended> } | null)?.ended : undefined;
        if (ended && typeof ended === 'object') this.onEnded({ by: typeof ended.by === 'string' ? ended.by : null });
        const message = ended ? 'The session has ended' : (value as { error?: unknown } | null)?.error;
        // an answer that is not of the edit command, e.g. of a captive portal, is taken as the network
        throw new Failure(response.ok ? 0 : response.status, typeof message === 'string' ? message : text.slice(0, 200));
      }
      return value as T;
    } catch (e) {
      if (e instanceof Failure) throw e;
      throw new Failure(0, e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
  }
}
