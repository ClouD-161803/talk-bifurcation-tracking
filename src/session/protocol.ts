// the requests and answers between a browser of a session and the edit command, under
// /<key>/.session/. every body is JSON, apart from the bytes of a media upload. a version is
// written <epoch>.<n>, where the epoch is drawn at each start of the edit command and n counts the
// operations applied since this start

export type Version = string;

// the characters start to end of a text replaced by text, with offsets in UTF-16 code units
export type Patch = { start: number; end: number; text: string };

export type Person = { client: string; name: string; color: number; host: boolean };

// state is opaque to the edit command, e.g. the slide, the selection, and the caret of a person
export type Presence = { client: string; name: string; color: number; state: unknown };

// an operation as the authority applied it, broadcast to every browser, the sender included. v is
// the version after the operation, patches are of the text at the version before it, and sum is
// the checksum of the text after it
export type AppliedOp = {
  v: Version;
  client: string;
  seq: number;
  author: string;
  time: number;
  patches: Patch[];
  sum: string;
};

// POST hello. v is the version of the text that the editor read, when it read one
export type HelloRequest = { name: string; client?: string; v?: Version };
// the operations after the v of the request when they are in the log, and the whole text otherwise
export type HelloAnswer = {
  client: string;
  color: number;
  host: boolean;
  v: Version;
  people: Person[];
} & ({ ops: AppliedOp[]; text?: undefined } | { text: string; ops?: undefined });

// POST op. base is the version of the text that the patches are of
export type OpRequest = { client: string; seq: number; base: Version; patches: Patch[] };
// stale: base is of another epoch or older than the log. conflict: a patch conflicts with an
// operation applied after base. invalid: the patches are out of bounds, unsorted, overlapping, or
// cut a surrogate pair. unknown: the client did not say hello
export type RefusalReason = 'stale' | 'conflict' | 'invalid' | 'unknown';
export type OpAnswer = { ok: true; v: Version } | { ok: false; reason: RefusalReason; v: Version };

// GET events?client=&since=. ops is null when since is of another epoch or older than the log,
// and the browser then says hello again. ended is true when the edit command stops
export type EventsAnswer = {
  v: Version;
  ops: AppliedOp[] | null;
  presence: Presence[];
  people: Person[];
  ended?: true;
};

export type PresenceRequest = { client: string; state: unknown };
export type ByeRequest = { client: string };
export type EmptyAnswer = Record<string, never>;

// PUT media/<name>. path is relative to the talk folder, e.g. media/plot-2.png
export type MediaAnswer = { path: string };

// GET, POST, and DELETE share, only for a browser that reaches the edit command directly
export type ShareRequest = { relay?: string; secret?: string };
export type ShareAnswer = { link: string | null; error?: string };

export type ErrorAnswer = { error: string };

// the tones of theme/beeson.css that the color index of a person stands for
export const COLORS = ['--data-2', '--data-3', '--data-5', '--data-7'] as const;

export const formatVersion = (epoch: string, n: number): Version => `${epoch}.${n}`;

export function parseVersion(v: unknown): { epoch: string; n: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^([A-Za-z0-9_-]{1,32})\.(0|[1-9][0-9]{0,14})$/.exec(v);
  return m ? { epoch: m[1], n: Number(m[2]) } : null;
}
