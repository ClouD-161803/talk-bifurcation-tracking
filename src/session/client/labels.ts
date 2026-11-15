// the words and the authors that the pane of Version History and its preview show, with the
// times in the locale of the browser

import type { Client } from './client.ts';
import { bdi, make } from './dom.ts';
import { toneOf } from './people.ts';

export function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(d.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) });
}

export const timeOf = (t: number): string => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// the time of a version as a sentence says it: 2:41 PM today, and November 3, 2:41 PM before
export function whenOf(t: number): string {
  const day = dayLabel(t);
  return day === 'Today' ? timeOf(t) : `${new Date(t).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}, ${timeOf(t)}`;
}

export const slidesText = (n: number[]): string => (n.length ? `${n.length > 1 ? 'Slides' : 'Slide'} ${n.join(', ')}` : '');

// the name and the tone of a person id, or null for a change of index.html from outside
export function personOf(client: Client, id: string): { name: string; color: string } | null {
  if (id === 'file') return null;
  const known = client.known.find((k) => k.person === id) ?? client.people.find((p) => p.person === id);
  return known ? { name: known.name, color: toneOf(known.color) } : { name: 'Someone', color: 'var(--muted)' };
}

// a dot and the name of each author in its tone
export function authorsOf(client: Client, ids: string[]): HTMLElement {
  const who = make('span', 'who');
  for (const id of [...new Set(ids)]) {
    const p = personOf(client, id);
    const item = make('span', p ? 'author' : 'author file');
    if (p) {
      const dot = make('span', 'dot');
      dot.style.background = p.color;
      item.append(dot, bdi(p.name));
    } else item.textContent = 'Changed in index.html outside the editor';
    who.append(item);
  }
  return who;
}
