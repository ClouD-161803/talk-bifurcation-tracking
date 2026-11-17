// the values of theme/editor.js that the engine of session.ts, apply.ts, and tree.ts uses. the
// engine is bundled into theme/editor-session.js, which may not hold a second copy of a module of
// editor.js, with its own state, see build.mjs. hence port.ts hands these values over with take,
// before the engine is installed, and the engine imports them from here

import type * as caret from './caret.ts';
import type * as fragments from '../model/fragments.ts';
import type * as history from '../history.ts';
import type * as math from '../math.ts';
import type * as merge from '../merge.ts';
import type * as render from '../render.ts';
import type * as source from '../source.ts';
import type * as store from '../media/store.ts';
import type * as tags from '../tags.ts';
import type * as tokens from '../tokens.ts';

export type Host = Pick<typeof caret, 'caretOf' | 'mapOffset' | 'markOf' | 'moved' | 'putCaret' | 'textIn'> &
  Pick<typeof fragments, 'fragmentRoot' | 'parseFragment'> &
  Pick<typeof history, 'refreshHeads'> &
  Pick<typeof math, 'mathIn' | 'mathLookup' | 'setContentWithTex'> &
  Pick<typeof merge, 'apply' | 'charEdits' | 'edits' | 'fine' | 'mergeEdits' | 'shared'> &
  Pick<typeof render, 'detached' | 'isTextElement' | 'pair' | 'pairElement' | 'renderDeck' | 'renderTextElement' | 'unitsWithin' | 'virtualChildren'> &
  Pick<typeof source, 'contentRange' | 'decode' | 'elementRange' | 'parseSource' | 'segmentsOf' | 'VOID'> &
  Pick<typeof store, 'media'> &
  Pick<typeof tags, 'stateOf'> &
  Pick<typeof tokens, 'RAW_TEXT' | 'tokenize'>;

export let caretOf: Host['caretOf'], mapOffset: Host['mapOffset'], markOf: Host['markOf'], moved: Host['moved'], putCaret: Host['putCaret'], textIn: Host['textIn'];
export let fragmentRoot: Host['fragmentRoot'], parseFragment: Host['parseFragment'];
export let refreshHeads: Host['refreshHeads'];
export let mathIn: Host['mathIn'], mathLookup: Host['mathLookup'], setContentWithTex: Host['setContentWithTex'];
export let apply: Host['apply'], charEdits: Host['charEdits'], edits: Host['edits'], fine: Host['fine'], mergeEdits: Host['mergeEdits'], shared: Host['shared'];
export let detached: Host['detached'], isTextElement: Host['isTextElement'], pair: Host['pair'], pairElement: Host['pairElement'], renderDeck: Host['renderDeck'], renderTextElement: Host['renderTextElement'], unitsWithin: Host['unitsWithin'], virtualChildren: Host['virtualChildren'];
export let contentRange: Host['contentRange'], decode: Host['decode'], elementRange: Host['elementRange'], parseSource: Host['parseSource'], segmentsOf: Host['segmentsOf'], VOID: Host['VOID'];
export let media: Host['media'];
export let stateOf: Host['stateOf'];
export let RAW_TEXT: Host['RAW_TEXT'], tokenize: Host['tokenize'];

export function take(h: Host): void {
  ({ caretOf, mapOffset, markOf, moved, putCaret, textIn } = h);
  ({ fragmentRoot, parseFragment } = h);
  ({ refreshHeads } = h);
  ({ mathIn, mathLookup, setContentWithTex } = h);
  ({ apply, charEdits, edits, fine, mergeEdits, shared } = h);
  ({ detached, isTextElement, pair, pairElement, renderDeck, renderTextElement, unitsWithin, virtualChildren } = h);
  ({ contentRange, decode, elementRange, parseSource, segmentsOf, VOID } = h);
  ({ media } = h);
  ({ stateOf } = h);
  ({ RAW_TEXT, tokenize } = h);
}
