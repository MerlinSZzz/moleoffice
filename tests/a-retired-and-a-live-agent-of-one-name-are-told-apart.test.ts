// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RETIRED AGENT AND A LIVE ONE OF ONE NAME ARE TOLD APART. Criterion I4.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * An agent keeps its name when it is retired, and a live agent may bear the same name. The lists
 * that show both drew two rows that read identically, so a reader could not tell which was which.
 * This is the contacts panel's Retired group: it is a group of retired agents, and the same-name
 * live agent sits in its own group on the same panel. The retired row now carries its retirement
 * date beside its name.
 *
 * THE OTHER TWO SURFACES ARE PROVED IN A BROWSER, because their retired rows are drawn only after a
 * press and a static render cannot press. This file holds the list itself, `ContactsInGroups`, and
 * the one function the three surfaces share.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * - Make `theNameBesideItsDate` return the bare name (drop the date): the shared-function case and
 *   the Retired-group case both go red.
 * - Draw the contact row's name with `one?.name ?? them.id` instead of the shared function: the
 *   Retired-group case goes red and the live row still draws.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
// The page component asks for the office's id, and a page with no server behind it cannot read it: the
// test office's page module registers the test office's id.
import './a-page-of-a-test-office.ts'
import { participantKey } from '@shared/messages.ts'
import type { ContactGroup } from '@shared/contacts.ts'

type ContactChooser = typeof import('../src/web/components/ContactChooser.tsx')

let contactChooser: ContactChooser

/** One rendered list, with the hoisted stylesheet cut out. */
function body(el: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** One registry row, with only the fields a contact row reads. */
function onTheWire(over: { id: string; name: string; retired?: boolean; retiredAt?: string | null }) {
  return {
    kind: 'agent',
    id: over.id,
    name: over.name,
    handle: over.id,
    avatarUrl: '/api/portraits/role/worker/worker-1',
    state: null,
    stateAt: null,
    createdAt: '2026-09-23 09:00:00',
    homeWorld: null,
    retired: over.retired ?? false,
    retiredAt: over.retiredAt ?? null,
  }
}

beforeAll(async () => {
  // The component reaches api.ts and router.tsx, which touch window while they are evaluated.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  contactChooser = await import('../src/web/components/ContactChooser.tsx')
})

describe('the name a list draws for an agent', () => {
  it('is the plain name while the agent is live', () => {
    expect(contactChooser.theNameBesideItsDate('Twin Agent', null)).toBe('Twin Agent')
  })

  it('carries the retirement date once the agent is retired', () => {
    expect(contactChooser.theNameBesideItsDate('Twin Agent', '2026-09-23 10:00:00')).toBe(
      'Twin Agent — retired 2026-09-23 10:00:00',
    )
  })

  it('adds nothing where no retirement date was recorded, rather than inventing one', () => {
    expect(contactChooser.theNameBesideItsDate('Twin Agent', undefined)).toBe('Twin Agent')
    expect(contactChooser.theNameBesideItsDate('Twin Agent', '')).toBe('Twin Agent')
  })
})

describe("the contacts panel's Retired group", () => {
  /** The Retired group, and the plain one the live twin sits in. */
  const groups: ContactGroup[] = [
    { key: 'worker', name: 'Worker', at: 4, made: false, side: 'agent', collapsed: false },
    { key: 'retired', name: 'Retired', at: 5, made: false, side: 'agent', collapsed: false },
  ]

  const live = {
    who: { kind: 'agent' as const, id: 'twin-live' },
    unregistered: null,
    last: null,
    unread: 0,
    anythingUnread: false,
    key: 'agent:twin-live',
    group: 'worker',
    at: 0,
    foldedUnder: null,
    projects: [],
  }
  const retired = {
    who: { kind: 'agent' as const, id: 'twin-retired' },
    unregistered: null,
    last: null,
    unread: 0,
    anythingUnread: false,
    key: 'agent:twin-retired',
    group: 'retired',
    at: 0,
    foldedUnder: null,
    projects: [],
  }

  /** Both registry rows, keyed the way a contact row keys them. */
  const everybody = new Map<string, ReturnType<typeof onTheWire>>([
    [participantKey(live.who), onTheWire({ id: 'twin-live', name: 'Twin Agent' })],
    [
      participantKey(retired.who),
      onTheWire({ id: 'twin-retired', name: 'Twin Agent', retired: true, retiredAt: '2026-09-23 10:00:00' }),
    ],
  ])

  function drawnList(): string {
    return body(
      h(contactChooser.ContactsInGroups, {
        contacts: [live, retired] as never,
        groups,
        sides: [
          { key: 'human', name: 'Human', collapsed: false },
          { key: 'agent', name: 'Agent', collapsed: false },
        ],
        everybody: everybody as never,
        readingOf: () => undefined,
        arranging: null,
        draftFor: () => null,
        now: '2026-09-23 12:00:00',
        onArranging: () => {},
        onNewAgent: () => {},
        onChanged: () => {},
        onTalkTo: () => {},
        onOpenUnregistered: () => {},
        // BOTH ROWS ARE THE WHOLE LIST, read in one page with nothing left after it.
        filter: '',
        rowsIn: { worker: 1, retired: 1 },
        left: 0,
        inTheList: 2,
        onMore: null,
      }),
    )
  }

  it('draws the retired twin with its date, and the live twin without one', () => {
    const html = drawnList()
    // THE CONTROL: both rows are on the page. A list that drew nothing would pass a one-sided check.
    expect(html, 'the live twin is not drawn').toContain('>Twin Agent<')
    expect(html, 'the retired twin is not told apart').toContain('Twin Agent — retired 2026-09-23 10:00:00')
  })

  it('does not print a handle under either name', () => {
    // THE VISIBLE TEXT, not the markup: a row keys itself by the participant and an id in an
    // attribute is not a second name. What must not be on the page is the handle written out.
    const visible = drawnList().replace(/<[^>]+>/g, ' ')
    expect(visible).not.toContain('twin-live')
    expect(visible).not.toContain('twin-retired')
  })
})
