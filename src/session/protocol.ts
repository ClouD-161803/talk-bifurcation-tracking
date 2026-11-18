// the requests and answers between a browser of a session and the edit command, under
// /<key>/.session/. every body is JSON, apart from the bytes of a media upload. a version is
// written <epoch>.<n>, where the epoch is drawn at each start of the edit command and n counts the
// operations applied since this start. hello gives a page a client id, which is public, and a
// token, which is secret. every later request of the page carries the token, from which the client
// id is found, and the client id cannot be used in its place

import type { Kept } from './anchor.ts';

export type Version = string;

// the characters start to end of a text replaced by text, with offsets in UTF-16 code units
export type Patch = { start: number; end: number; text: string };

// the secret of a page, 22 characters of base64url
export type Token = string;

// a page of a session. client is the public id of the page. person is the id that the browser
// keeps in localStorage, hence one person on two devices has two pages
export type Person = { client: string; person: string; name: string; color: number; host: boolean };

// a person who joined the session at some time, as kept in .session/people.json
export type KnownPerson = { person: string; name: string; color: number };

// state is opaque to the edit command, e.g. the slide, the selection, and the caret of a person
export type Presence = { client: string; name: string; color: number; state: unknown };

// an operation as the authority applied it, broadcast to every browser, the sender included. v is
// the version after the operation, patches are of the text at the version before it, and sum is
// the checksum of the text after it
export type AppliedOp = {
  v: Version;
  client: string;
  seq: number;
  // the person id, or file for a change of index.html from outside
  author: string;
  time: number;
  patches: Patch[];
  sum: string;
};

// POST hello. v is the version of the text that the editor read, when it read one. the person id
// carries the identity of a person, and one that is missing or malformed is replaced by a new one.
// claim takes over the person who holds the name, i.e. one person on a second device. a page passes
// the token of its earlier hello only when the same page reconnects with its Replica in memory,
// and it keeps its client id. a reloaded page is a new client, and it says hello without a token.
// was is the client id under which the page sent its operation in flight, passed with the token.
// retire names the tokens of closed pages whose copies the page took over, at most 16 of which the
// edit command forgets, so that an operation of such a page that arrives later is not applied twice
export type HelloRequest = { name: string; person?: string; token?: Token; v?: Version; claim?: boolean; was?: string; retire?: Token[] };
// the answer of hello and of name when another person holds the name, and nothing is changed
export type Taken = { taken: { name: string } };
// an error of a compile of a TikZ figure, with file as a path from the talk folder, and file or line
// null where TeX does not give one
export type FigureError = { file: string | null; line: number | null; message: string };
// the TikZ figures of the deck as the edit command compiles them. outputs holds the hash of the
// output figures/name.js on disk of each figure with a valid name, or null without an output, and a
// page loads an output again when its hash differs from the one of the figure it drew. compiling is
// the figure being compiled into its output, errors the errors of the last compile of each figure
// that failed, compiled the time in ms of the last compile of each figure, and uncompiled the count
// of the figures whose output is stale or missing. compiler is missing without latex or dvisvgm
export type FigureState = {
  outputs: Record<string, string | null>;
  compiling: string | null;
  errors: Record<string, FigureError[]>;
  compiled: Record<string, number>;
  uncompiled: number;
  compiler: 'found' | 'missing';
};

// the operations after the v of the request when they are in the log, and the whole text otherwise.
// applied is the seq of the last operation of the client id was that the text holds, left out when
// this client id is not known, e.g. after its operations left the table of the edit command. tex is
// the count of the changes of tex.js on disk, from the time of the start of the edit command in ms
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

// POST name: a new name of the person of the page of token
export type NameRequest = { token: Token; name: string };
export type NameAnswer = { name: string } | Taken;

// an operation of a Replica. base is the version of the text that the patches are of
export type OpRequest = { client: string; seq: number; base: Version; patches: Patch[] };
// POST op: the OpRequest and the token of the page. a client in the body is replaced by the
// client id of the token
export type OpPost = OpRequest & { token: Token };
// stale: base is of another epoch or older than the log. conflict: a patch conflicts with an
// operation applied after base. invalid: the patches are out of bounds, unsorted, overlapping, or
// cut a surrogate pair. unknown: the token is not of a page that said hello
export type RefusalReason = 'stale' | 'conflict' | 'invalid' | 'unknown';
export type OpAnswer = { ok: true; v: Version } | { ok: false; reason: RefusalReason; v: Version };

// the end of a session for a page: the edit command stopped, or the host ended the sharing. by is
// the name of the host, or null when it is not known
export type Ended = { by: string | null };

// a write of index.html that failed, with the number of operations that are not in the file, or a
// write of the file tex.js
export type WriteError = { message: string; unwritten: number; file?: 'tex.js' };

// GET events?token=&since=. ops is null when since is of another epoch or older than the log,
// and the browser then says hello again. known is sent only when it changed since the last answer
// to this page, and so is writeError, which is null once a write succeeded after a failed one.
// after ended, every poll of the page is answered with ended until it says hello.
// history is the rev of the version history when it changed since the last answer to this page.
// restored is the latest restore, sent once to each page whose version since is before it, also to
// a page that was dropped meanwhile. comments holds the threads changed since the last answer to
// this page. a page reads the history and the comments again after each hello, since what changed
// before is not sent to it. tex is as in HelloAnswer, and a page draws the deck again with tex.js
// when it changed. figures is sent when it changed since the last answer to this page. overwritten is sent as restored is, after a change of index.html from outside
// that replaced text that a person wrote in the session
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

// a range of the text of a version that was changed since the version before, with the person id
// of who changed it last, or file. a removal leaves an empty range at its place
export type Mark = { start: number; end: number; author: string };

// a version of the deck kept by the edit command, newest first in the list. authors are person ids,
// or file for a change of index.html from outside. slides are the numbers of the slides changed or
// added since the version before, as the status bar counts them in the text of this version.
// removed is what a preview cannot outline: the numbers of the slides gone, counted in the text of
// the version before, and the count of the elements gone from a slide that is still there.
// restored is the id of the version that this one restored
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
// GET history/<id>?token=
export type VersionDetail = VersionInfo & { marks: Mark[] };
// a text that a person set aside at a conflict, so that it is not lost. author is a person id
export type AsideInfo = { id: string; time: number; author: string };
// GET history?token=. rev grows with every change of the list of versions or of the texts set aside
export type HistoryAnswer = { rev: number; versions: VersionInfo[]; aside: AsideInfo[] };
// POST history/<id>/name, where id may be current to close a version of the current state at once.
// an empty name takes the name off. the answer is the version named
export type VersionNameRequest = { token: Token; name: string };
export type VersionNameAnswer = VersionInfo;
// POST history/<id>/restore. id is the new version on top, or null when the deck already read as
// the version, and v is the version of the text after the restore
export type RestoreRequest = { token: Token };
export type RestoreAnswer = { id: string | null; v: Version };
// POST aside, at most 8 MB of UTF-8 per text
export type AsideRequest = { token: Token; text: string };
export type AsideAnswer = AsideInfo;
// a restore, by the person id by, of the version id, which was closed at time
export type Restored = { by: string; id: string; time: number };

export const VERSION_NAME_MAX = 80;

// the start tag of an element, from its < to its >, and the name of the element in lowercase
export type Anchor = { start: number; end: number; tag: string };
// a range of the text as a page sends it, of which the edit command reads the name of the element
export type TagRange = { start: number; end: number };
export type CommentReply = { id: string; author: string; time: number; text: string; edited?: number };
// a thread of comments, kept in .session/comments.json. anchor is the start tag of the element
// commented on, the start tag of the slide for a comment on a slide, and null for a comment on the
// deck. slide is the start tag of the slide that holds the element, or null. a removed element
// falls back to its slide, and a removed slide to the deck, and removed is then set, holding the
// text of what was removed, its check when it was larger than 4 kB, or null when it is not known. a
// re-insertion of this text attaches the thread to it again. a thread of an element of a removed slide holds the
// text of the slide as well in removed.slide, and is attached again only inside a re-insertion of
// it. a removed slide is itself such a text. author, by, and mentions are person ids, time and
// edited are times in ms. the offsets are of the text at the version that the answer or the events
// answer carrying the thread is of, and a page moves them itself with every later operation
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
// GET comments?token=. v grows with every change of a thread, at is the version of the text that
// the anchors are of, and seen is the time up to which the person of the page has read the comments
// and read the time up to which the person read each thread after seen
export type CommentsAnswer = { v: number; at: Version; comments: Comment[]; seen: number; read: Record<string, number> };
// the threads changed and the ids of the threads deleted since the last answer to a page, or null
// in both when the page must read GET comments again. seen and read are sent after a read on
// another page of the person
export type CommentsEvent = ({ v: number; changed: Comment[]; removed: string[] } | { v: number; changed: null; removed: null }) & { seen?: number; read?: Record<string, number> };
// POST comments. anchor and slide are of the text at version base, an anchor without a slide is
// on an element outside the slides, a slide without an anchor is a comment on the slide, and
// neither is a comment on the deck. the answer is the thread. id is made by crypto.randomUUID(),
// and a request sent again with it is answered with the thread as it is
export type CommentRequest = { token: Token; anchor: TagRange | null; slide: TagRange | null; base: Version; text: string; mentions?: string[]; id?: string };
// POST comments/<id>/reply
export type ReplyRequest = { token: Token; text: string; mentions?: string[]; id?: string };
// POST comments/<id>/edit and comments/<id>/delete, of the reply of id reply when it is given, and
// of the thread otherwise, only by its author. the answer of a delete of a thread is empty
export type CommentEditRequest = { token: Token; text: string; mentions?: string[]; reply?: string };
export type CommentDeleteRequest = { token: Token; reply?: string };
// POST comments/<id>/resolve and comments/<id>/reopen, by anyone
export type ResolveRequest = { token: Token };
// POST comments/seen, of the thread of id thread when it is given, and of every thread otherwise
export type SeenRequest = { token: Token; time: number; thread?: string };
export type SeenAnswer = { seen: number; read: Record<string, number> };

export const COMMENT_MAX = 4000;
export const REPLIES_MAX = 200;
export const THREADS_MAX = 2000;

export type PresenceRequest = { token: Token; state: unknown };
export type ByeRequest = { token: Token };
export type EmptyAnswer = Record<string, never>;

// PUT media/<name>. path is relative to the talk folder, e.g. media/plot-2.png
export type MediaAnswer = { path: string };

// GET, POST, and DELETE share, only for a browser that reaches the edit command directly
export type ShareRequest = { relay?: string; secret?: string };
export type ShareAnswer = { link: string | null; error?: string };

export type ErrorAnswer = { error: string };

// the tones of theme/beeson.css that the color index of a person stands for
export const COLORS = ['--data-2', '--data-3', '--data-5', '--data-7'] as const;

// characters that do not show, i.e. the default ignorable code points, the controls of the
// direction of text, and the other format characters, e.g. U+0600 or U+FFF9
const HIDDEN = /^[\p{Default_Ignorable_Code_Point}\p{Bidi_Control}\p{Cf}]$/u;
// hidden characters that an emoji or a word needs: the variation selectors, kept after a character
// that shows, and the zero-width joiner and non-joiner, kept between two such characters. the tags
// are format characters, hence a flag of a region loses them
const SELECTOR = /^[\ufe00-\ufe0f\u{e0100}-\u{e01ef}]$/u;
const JOINER = /^[\u200c\u200d]$/u;
const shows = (c: string | undefined) => c !== undefined && !HIDDEN.test(c) && !/\s/.test(c);

// the characters of raw that show, with the selectors and joiners that belong to them
export function shown(raw: string): string {
  const chars = Array.from(raw);
  const kept: string[] = [];
  chars.forEach((c, i) => {
    const before = kept[kept.length - 1];
    if (!HIDDEN.test(c)) kept.push(c);
    else if (SELECTOR.test(c) && (shows(before) || SELECTOR.test(before ?? ''))) kept.push(c);
    else if (JOINER.test(c) && (shows(before) || SELECTOR.test(before ?? '')) && shows(chars[i + 1])) kept.push(c);
  });
  return kept.join('');
}

// the error of a hello refused while the session holds as many pages as it takes
export const FULL = 'the session is full';

// a name as it is kept: without characters that do not show, trimmed, inner whitespace collapsed,
// and cut to NAME_MAX characters. a name that is empty after this is refused
export const NAME_MAX = 40;
export const cleanPersonName = (raw: unknown): string =>
  typeof raw === 'string' ? shown(Array.from(shown(raw).replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('')).trim() : '';
// two names are one when their keys are equal, hence names that look alike, e.g. in fullwidth forms
// or with and without a joiner, are one
export const nameKey = (name: string): string =>
  cleanPersonName(name)
    .normalize('NFKC')
    .replace(/[\p{Cf}\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu, '')
    .toLowerCase();
export const isPersonId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(id);
export const isToken = (token: unknown): token is Token => typeof token === 'string' && /^[A-Za-z0-9_-]{22,64}$/.test(token);

export const formatVersion = (epoch: string, n: number): Version => `${epoch}.${n}`;

export function parseVersion(v: unknown): { epoch: string; n: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^([A-Za-z0-9_-]{1,32})\.(0|[1-9][0-9]{0,14})$/.exec(v);
  return m ? { epoch: m[1], n: Number(m[2]) } : null;
}
