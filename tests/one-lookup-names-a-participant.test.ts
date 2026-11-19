// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LOOKUP NAMES A PARTICIPANT FROM A STORED ID OR HANDLE (problem jwTEOmhtXg20, part 2; invariant 9).
 *
 * `ParticipantName` in src/web/pages/NotebookPage.tsx and `ownerName` in src/web/pages/HorizonsPage.tsx
 * both ask `theParticipantAStoredIdNames` in src/web/lib/participant-lookup.ts. `ownerName` used to repeat
 * the lookup, so a change to one could leave the other wrong with nothing failing.
 *
 * The first case drives both with the same made-up registry and the same ids and handles, and checks they
 * name the same participant. The second changes what the one lookup answers for one made-up handle, and
 * checks both follow. A copy of the lookup in either caller would not follow, so that case goes red.
 *
 * MUTATION, proved after a control run and restored: ownerName given its own lookup again turns the
 * second case red. The commit message names every run and its log.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ParticipantOnTheWire, ParticipantsReply } from '../src/web/api.ts'

// The pages import the rail's own name reader, which reads storage as it is imported: the smallest
// stand-in that lets the import finish, the same one the horizons page test uses.
const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: storage,
  sessionStorage: storage,
  location: { hash: '', search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
}

const row = (kind: string, id: string, handle: string, name: string): ParticipantOnTheWire =>
  ({ kind, id, handle, name }) as ParticipantOnTheWire

/** A made-up registry: a person, two agents sharing one handle, and one agent with a handle of its own. */
const PARTICIPANTS: ParticipantsReply = {
  people: [row('person', 'p-1', 'wren', 'Wren Made-Up')],
  agents: [
    row('agent', 'a-1', 'twin', 'First Twin'),
    row('agent', 'a-2', 'twin', 'Second Twin'),
    row('agent', 'a-3', 'solo', 'Solo Agent'),
  ],
}

/** A handle nobody registered, which the changed lookup below names all the same. */
const GHOST = 'ghost-handle'
const GHOST_NAME = 'Named only by the one lookup'
const bent = { on: false }

vi.mock('../src/web/lib/participant-lookup.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/web/lib/participant-lookup.ts')>()
  return {
    theParticipantAStoredIdNames: <Row extends { id: string; handle: string }>(rows: readonly Row[], idOrHandle: string) =>
      bent.on && idOrHandle === GHOST && rows.length > 0
        ? ({ ...rows[0], id: GHOST, handle: GHOST, name: GHOST_NAME } as unknown as Row)
        : real.theParticipantAStoredIdNames(rows, idOrHandle),
  }
})

// ParticipantName reads the registry through useProjectAsync, which hands the read to useAsync; here
// that read is already answered, at both. Both are needed: ui.tsx imports Planning.tsx, which imports
// project-async.ts, so the real ui.tsx the mock below loads gives project-async.ts the real useAsync.
vi.mock('../src/web/components/ui.tsx', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/web/components/ui.tsx')>()
  return { ...real, useAsync: () => [{ status: 'ready', value: PARTICIPANTS }, () => {}] }
})
vi.mock('../src/web/lib/project-async.ts', () => ({ useProjectAsync: () => [{ status: 'ready', value: PARTICIPANTS }, () => {}] }))

const participantName = async (kind: string, id: string): Promise<string> => {
  const { ParticipantName } = await import('../src/web/pages/NotebookPage.tsx')
  return renderToStaticMarkup(h(ParticipantName, { kind, id }))
}
const ownerName = async (owner: string): Promise<string> => {
  const page = await import('../src/web/pages/HorizonsPage.tsx')
  return page.ownerName(owner, PARTICIPANTS)
}

describe('ParticipantName and the horizons page name a participant through one lookup', () => {
  it('name the same participant for the same id or handle', async () => {
    // id, or handle, and the registry it is in. Each is borne by one participant only.
    const cases: [string, string, string][] = [
      ['p-1', 'person', 'Wren Made-Up'],
      ['wren', 'person', 'Wren Made-Up'],
      ['a-1', 'agent', 'First Twin'],
      ['a-3', 'agent', 'Solo Agent'],
      ['solo', 'agent', 'Solo Agent'],
    ]
    for (const [asked, kind, name] of cases) {
      expect(await participantName(kind, asked), asked).toBe(name)
      expect(await ownerName(asked), asked).toBe(name)
    }
    // A handle two agents bear names nobody, in both: ownerName shows the text, ParticipantName its fallback.
    expect(await ownerName('twin')).toBe('twin')
    expect(await participantName('agent', 'twin')).not.toMatch(/Twin/)
  })

  it('both follow a change to the one lookup', async () => {
    bent.on = true
    try {
      expect(await participantName('agent', GHOST)).toBe(GHOST_NAME)
      expect(await ownerName(GHOST)).toBe(GHOST_NAME)
    } finally {
      bent.on = false
    }
  })
})
