import type { CommentsAnswer, Ended, EventsAnswer, HelloAnswer, HelloRequest, NameAnswer, OpAnswer, OpPost, Taken, Token, Version } from '../protocol.ts';

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

const POST_WAIT = 30_000;
const POLL_WAIT = 45_000;
const UNDER_KEEPALIVE_QUOTA = 60_000;

export class Transport {
  private readonly base: URL;
  private readonly onEnded: (ended: Ended) => void;
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

  op(post: OpPost): Promise<OpAnswer> {
    const body = JSON.stringify(post);
    const keepalive = post !== this.failed && (body.length < UNDER_KEEPALIVE_QUOTA / 3 || (body.length < UNDER_KEEPALIVE_QUOTA && new Blob([body]).size < UNDER_KEEPALIVE_QUOTA));
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

  events(token: Token, since: Version, hold?: number): Promise<EventsAnswer> {
    return this.send(this.url('events', { token, since, ...(hold === undefined ? {} : { hold: String(hold) }) }), { method: 'GET' }, POLL_WAIT);
  }

  comments(token: Token): Promise<CommentsAnswer> {
    return this.send(this.url('comments', { token }), { method: 'GET' }, POST_WAIT);
  }

  bye(token: Token): void {
    const body = JSON.stringify({ token });
    const url = this.url('bye');
    try {
      if ('keepalive' in Request.prototype) {
        void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      } else navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }));
    } catch {}
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
      } catch {}
      if (!response.ok || value === null || typeof value !== 'object') {
        const ended = response.status === 410 ? (value as { ended?: Partial<Ended> } | null)?.ended : undefined;
        if (ended && typeof ended === 'object') this.onEnded({ by: typeof ended.by === 'string' ? ended.by : null });
        const message = ended ? 'The session has ended' : (value as { error?: unknown } | null)?.error;
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
