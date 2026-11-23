import type { Client } from './client.ts';
import { bdi, make, style } from './dom.ts';
import { callName, followersText, followOf, pagesOf } from './follow.ts';
import { everyone, type Someone } from './people.ts';
import type { Resolved } from './presence.ts';
import { addPersonStatus } from './share.ts';

const FILE = { preamble: 'preamble.tex', bibliography: 'references.bib' };
const CSS = `
.beeson-sheet-presence { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: -4px 0 10px; color: var(--ed-muted); font: 12px/18px system-ui, sans-serif; }
.beeson-sheet-presence .flag { max-width: 160px; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 4px; background: var(--tone); color: var(--on); font-weight: 600; }
.beeson-sheet-presence .c0 { --tone: var(--data-2); --on: #1d1d1f; }
.beeson-sheet-presence .c1 { --tone: var(--data-3); --on: #1d1d1f; }
.beeson-sheet-presence .c2 { --tone: var(--data-5); --on: #fff; }
.beeson-sheet-presence .c3 { --tone: var(--data-7); --on: #1d1d1f; }
`;

export function install(client: Client): void {
  const { app } = client;
  const numberOf = (slide: Element | null | undefined): number => (slide?.isConnected ? client.shell.slides.numberOf(slide) : 0);
  const named = (person: string | null) => (person === client.person ? 'you' : person ? callName(client, person) : '');

  const doing = (person: string): { what: string; whom: string | null; slide: number } | null => {
    if (person === client.person) {
      const target = followOf()?.target ?? null;
      return { what: target ? `following ${named(target)}` : '', whom: target, slide: numberOf(app.current()) };
    }
    const pages = pagesOf(client, person);
    const page = pages[0];
    if (!page) return null;
    const typing = pages.find((r) => r.typing);
    let what = '';
    if (page.following) what = `following ${named(page.following)}`;
    else if (pages.some((r) => r.mode === 'present')) what = 'presenting';
    else if (pages.some((r) => r.mode === 'history')) what = 'viewing the version history';
    else if (pages.some((r) => r.sheet)) what = `editing ${FILE[pages.find((r) => r.sheet)!.sheet!]}`;
    else if (typing) what = 'typing';
    else if (pages.every((r) => r.away)) what = 'away';
    return { what, whom: page.following, slide: numberOf(typing && what === 'typing' ? typing.slide : page.slide) };
  };

  addPersonStatus((someone: Someone) => {
    const now = doing(someone.person);
    if (!now) return '';
    if (now.what === 'typing') return now.slide ? `Typing on slide ${now.slide}` : 'Typing';
    if (now.whom) return ['Following ', now.whom === client.person ? 'you' : bdi(callName(client, now.whom))];
    if (now.what) return now.what[0].toUpperCase() + now.what.slice(1);
    return now.slide ? `On slide ${now.slide}` : '';
  });

  const label = () => {
    if (client.connection === 'ended') return;
    for (const b of document.querySelectorAll<HTMLElement>('.beeson-session-people .beeson-session-avatar[data-person]')) {
      const person = b.dataset.person!;
      const someone = everyone(client).find((p) => p.person === person);
      if (!someone) continue;
      const parts = [someone.name];
      if (person === client.person) {
        parts.push('you');
        const followers = followersText(client);
        if (followers) parts.push(followers);
      } else {
        const now = doing(person);
        if (now?.slide) parts.push(`on slide ${now.slide}`);
        if (now?.what) parts.push(now.what);
      }
      const text = parts.join(', ');
      if (b.getAttribute('aria-label') !== text) b.setAttribute('aria-label', text);
    }
  };
  for (const event of ['people', 'known', 'me', 'resolved'] as const) client.on(event, label);

  style('sheet', CSS);
  const sheet = () => {
    const open = client.connection === 'ended' ? null : client.shell.presence.sheet();
    const others = new Map<string, Resolved>();
    for (const r of client.resolved()) if (open && r.sheet === open.which && r.person !== client.person && !others.has(r.person)) others.set(r.person, r);
    let row = document.querySelector<HTMLElement>('.beeson-sheet-presence');
    if (!open || !others.size) return row?.remove();
    if (row?.parentElement !== open.dialog) {
      row?.remove();
      row = make('p', 'beeson-sheet-presence');
      open.dialog.querySelector('h3')?.after(row);
    }
    const flags = [...others.values()].map((r) => {
      const flag = make('span', `flag c${r.color}`);
      flag.append(bdi(callName(client, r.person)));
      return flag;
    });
    row.replaceChildren(...flags, `${others.size > 1 ? 'have' : 'has'} ${FILE[open.which]} open`);
  };
  client.on('resolved', sheet);
  client.on('state', sheet);
  app.listen('sheet', sheet);
}
