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

export function dateOf(t: number): string {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
}

export function whenOf(t: number): string {
  return dayLabel(t) === 'Today' ? timeOf(t) : `${dateOf(t)}, ${timeOf(t)}`;
}

export const slidesText = (n: number[]): string => (n.length ? `${n.length > 1 ? 'Slides' : 'Slide'} ${n.join(', ')}` : '');

export function personOf(client: Client, id: string): { name: string; color: string } | null {
  if (id === 'file') return null;
  const known = client.known.find((k) => k.person === id) ?? client.people.find((p) => p.person === id);
  return known ? { name: known.name, color: toneOf(known.color) } : { name: 'Someone', color: 'var(--muted)' };
}

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
