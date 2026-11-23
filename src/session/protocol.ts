import type { Kept } from './anchor.ts';

export type Version = string;

export type Patch = { start: number; end: number; text: string };

export type Token = string;

export type Person = { client: string; person: string; name: string; color: number; host: boolean };

export type KnownPerson = { person: string; name: string; color: number };

export type Presence = { client: string; name: string; color: number; state: unknown };

export type AppliedOp = {
  v: Version;
  client: string;
  seq: number;
  author: string;
  time: number;
  patches: Patch[];
  sum: string;
};

export type HelloRequest = { name: string; person?: string; token?: Token; v?: Version; claim?: boolean; was?: string; retire?: Token[] };
export type Taken = { taken: { name: string } };
export type FigureError = { file: string | null; line: number | null; message: string };
export type FigureState = {
  outputs: Record<string, string | null>;
  compiling: string | null;
  errors: Record<string, FigureError[]>;
  compiled: Record<string, number>;
  uncompiled: number;
  compiler: 'found' | 'missing';
};

export type HelloAnswer = {
  client: string;
  token: Token;
  person: string;
  name: string;
  color: number;
  host: boolean;
  v: Version;
  people: Person[];
  known: KnownPerson[];
  tex: number;
  figures: FigureState;
  applied?: number;
} & ({ ops: AppliedOp[]; text?: undefined } | { text: string; ops?: undefined });

export type NameRequest = { token: Token; name: string };
export type NameAnswer = { name: string } | Taken;

export type OpRequest = { client: string; seq: number; base: Version; patches: Patch[] };
export type OpPost = OpRequest & { token: Token };
export type RefusalReason = 'stale' | 'conflict' | 'invalid' | 'unknown';
export type OpAnswer = { ok: true; v: Version } | { ok: false; reason: RefusalReason; v: Version };

export type Ended = { by: string | null };

export type WriteError = { message: string; unwritten: number; file?: 'tex.js' };

export type EventsAnswer = {
  v: Version;
  ops: AppliedOp[] | null;
  presence: Presence[];
  people: Person[];
  tex: number;
  figures?: FigureState;
  known?: KnownPerson[];
  writeError?: WriteError | null;
  ended?: Ended;
  history?: number;
  restored?: Restored;
  comments?: CommentsEvent;
  overwritten?: true;
};

export type Mark = { start: number; end: number; author: string };

export type VersionInfo = {
  id: string;
  time: number;
  authors: string[];
  name?: string;
  slides: number[];
  removed?: { slides: number[]; elements: number };
  restored?: string;
  start?: true;
};
export type Removal = { at: number; text: string; author: string };
export type VersionDetail = VersionInfo & { marks: Mark[]; removals: Removal[] };
export type AsideInfo = { id: string; time: number; author: string };
export type HistoryAnswer = { rev: number; versions: VersionInfo[]; aside: AsideInfo[] };
export type VersionNameRequest = { token: Token; name: string };
export type VersionNameAnswer = VersionInfo;
export type RestoreRequest = { token: Token };
export type RestoreAnswer = { id: string | null; v: Version };
export type AsideRequest = { token: Token; text: string };
export type AsideAnswer = AsideInfo;
export type Restored = { by: string; id: string; time: number };

export const VERSION_NAME_MAX = 80;

export type Anchor = { start: number; end: number; tag: string };
export type TagRange = { start: number; end: number };
export type CommentReply = { id: string; author: string; time: number; text: string; edited?: number };
export type Comment = {
  id: string;
  anchor: Anchor | null;
  slide: Anchor | null;
  removed?: { text: Kept | null; slide?: Kept };
  author: string;
  time: number;
  text: string;
  edited?: number;
  replies: CommentReply[];
  resolved?: { by: string; time: number };
  mentions: string[];
};
export type CommentsAnswer = { v: number; at: Version; comments: Comment[]; seen: number; read: Record<string, number> };
export type CommentsEvent = ({ v: number; changed: Comment[]; removed: string[] } | { v: number; changed: null; removed: null }) & { seen?: number; read?: Record<string, number> };
export type CommentRequest = { token: Token; anchor: TagRange | null; slide: TagRange | null; base: Version; text: string; id?: string };
export type ReplyRequest = { token: Token; text: string; id?: string };
export type CommentEditRequest = { token: Token; text: string; reply?: string };
export type CommentDeleteRequest = { token: Token; reply?: string };
export type ResolveRequest = { token: Token };
export type SeenRequest = { token: Token; time: number; thread?: string };
export type SeenAnswer = { seen: number; read: Record<string, number> };

export const COMMENT_MAX = 4000;
export const REPLIES_MAX = 200;
export const THREADS_MAX = 2000;

export type PresenceRequest = { token: Token; state: unknown };
export type ByeRequest = { token: Token };
export type EmptyAnswer = Record<string, never>;

export type MediaAnswer = { path: string };

export type ShareRequest = { relay?: string; secret?: string };
export type ShareAnswer = { link: string | null; error?: string };

export type ErrorAnswer = { error: string };

export const COLORS = ['--data-2', '--data-3', '--data-5', '--data-7'] as const;

const HIDDEN = /^[\p{Default_Ignorable_Code_Point}\p{Bidi_Control}\p{Cf}]$/u;
const SELECTOR = /^[\ufe00-\ufe0f\u{e0100}-\u{e01ef}]$/u;
const JOINER = /^[\u200c\u200d]$/u;
const FLAG_TAG = /^[\u{e0020}-\u{e007f}]$/u;
const shows = (c: string | undefined) => c !== undefined && !HIDDEN.test(c) && !/\s/.test(c);

export function shown(raw: string): string {
  const chars = Array.from(raw);
  const kept: string[] = [];
  chars.forEach((c, i) => {
    const before = kept[kept.length - 1];
    if (!HIDDEN.test(c)) kept.push(c);
    else if (SELECTOR.test(c) && (shows(before) || SELECTOR.test(before ?? ''))) kept.push(c);
    else if (JOINER.test(c) && (shows(before) || SELECTOR.test(before ?? '')) && shows(chars[i + 1])) kept.push(c);
    else if (FLAG_TAG.test(c) && (before === '\u{1f3f4}' || FLAG_TAG.test(before ?? ''))) kept.push(c);
  });
  return kept.join('');
}

export const FULL = 'the session is full';

export const NAME_MAX = 40;
export const cleanPersonName = (raw: unknown): string =>
  typeof raw === 'string' ? shown(Array.from(shown(raw).replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('')).trim() : '';
export const nameKey = (name: string): string =>
  cleanPersonName(name)
    .normalize('NFKC')
    .replace(/[\p{Cf}\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu, '')
    .toLowerCase();
export const MENTION = /@\{([A-Za-z0-9_-]{22,64})\}/g;
export const isPersonId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(id);
export const isToken = (token: unknown): token is Token => typeof token === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(token);

export const formatVersion = (epoch: string, n: number): Version => `${epoch}.${n}`;

export function parseVersion(v: unknown): { epoch: string; n: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^([A-Za-z0-9_-]{1,32})\.(0|[1-9][0-9]{0,14})$/.exec(v);
  return m ? { epoch: m[1], n: Number(m[2]) } : null;
}
