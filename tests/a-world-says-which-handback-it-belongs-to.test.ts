// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C33, THE OTHER HALF: A WORLD SAYS WHICH HANDBACK IT BELONGS TO, AND WHERE TO READ IT.
 *
 * What the worlds were, and what they asked of the person, was not clear, and the report
 * bOZAJTim_9M7 was not in the world on 34233. The report that asked for the visit was looked for in the world,
 * and it was not there — because a world is a copy taken when it starts and the handback is filed
 * afterwards, on the owner’s office. Nothing in the world said so and nothing named the report.
 *
 * WHY IT IS A COLUMN AND NOT A LINK, measured 12 September 2026: a link needs two records, and a
 * world is a row in the `worlds` table rather than a record. `RECORD_KINDS` in src/shared/types.ts
 * has no `world` — the `'world'` there is a summary BLOCK type — and the links door refuses an end
 * that is not a record (404, "Both ends of a link must exist"). So the handback is one nullable
 * column on the row, which is what the criticised design of 8 September said it should be
 * (design/permissions/DESIGN-2026-09-08-perm-5.md version 2, critic note IyKUXwTqwOTq).
 *
 * WHERE THE ADDRESS COMES FROM. The office's home row holds the address the office answers at, so
 * the world can name it without a second column to hold it. A copy made some other way carries the
 * original's home row. A copy made by tools/isolated-mole-office.mjs does not, and that world reads
 * the office's live home row from the office's own list, its mirror. When that address cannot be read the sentence says so rather than
 * drawing a link that goes nowhere — the fifth invariant, and the second.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run:
 *   1. Drop the handback line from WorldHerePage and case 1 goes red.
 *   2. Make theHandbackThisWorldBelongsToSentence invent an address when none is known, and case 3
 *      goes red.
 *   3. Drop `handback` from the office door's body or from registerWorldHere's INSERT, and case 6
 *      goes red.
 *   4. Make theOfficeAddressACopyCarries answer null again when `theHomeRowBelongsTo` is null, and
 *      case 5 goes red.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { World } from '../src/shared/worlds.ts'
import {
  NOBODY_TIED_THIS_WORLD_TO_A_HANDBACK,
  theHandbackThisWorldBelongsToSentence,
  theOfficeAddressACopyCarries,
} from '../src/shared/worldcopy.ts'
import { buildTheFirstOfficeInAHook } from './helpers.ts'
import { settingNamed } from '../src/config/settings.mjs'

/** The office's address on its own machine: the product's default port, read where src/config/settings.mjs declares it. */
const THE_OFFICES_OWN_ADDRESS = `http://127.0.0.1:${String(settingNamed('MOLE_OFFICE_PORT').fallback)}`
/** The address another machine reaches it at: an invented host under .example, on the same port. */
const THE_ADDRESS_FOR_OTHER_MACHINES = `http://the-office.example:${String(settingNamed('MOLE_OFFICE_PORT').fallback)}`

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

type WorldHereModule = typeof import('../src/web/pages/WorldHerePage.tsx')

let page: WorldHereModule

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', origin: 'http://127.0.0.1:41600', hostname: '127.0.0.1', reload: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  page = await import('../src/web/pages/WorldHerePage.tsx')
})

/** The copy's own row. */
function aCopy(over: Partial<World> = {}): World {
  return {
    id: 'w-the-copy',
    name: 'the check panel world',
    purpose: 'The check panel on a run that was refused.',
    handback: 'bOZAJTim_9M7',
    kind: 'agent-made',
    startedBy: { kind: 'agent', id: 'builder-cw' },
    checkout: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/worktrees/c-worlds`,
    head: '546d00f',
    databaseIdentity: 'bbbbbbbbbbbbbbbb',
    address: 'http://127.0.0.1:46107',
    addressForOtherMachines: null,
    standing: 'scratch',
    parentWorld: null,
    bornAt: '2026-09-12 14:00:00',
    diedAt: null,
    diedBecause: null,
    installation: 'an-installation',
    ...over,
  }
}

/** The original office's home row, which a copy carries because the database was copied whole. */
function theHomeRow(over: Partial<World> = {}): World {
  return {
    ...aCopy(),
    id: 'w-the-office',
    name: `${THE_TEST_OFFICES_OWNER.name}'s Office`,
    purpose: null,
    handback: null,
    kind: 'home',
    databaseIdentity: 'aaaaaaaaaaaaaaaa',
    address: THE_OFFICES_OWN_ADDRESS,
    addressForOtherMachines: THE_ADDRESS_FOR_OTHER_MACHINES,
    standing: 'canonical',
    ...over,
  }
}

/** The page's markup with the hoisted stylesheet stripped, which is all a person reads. */
function body(worlds: World[], theHomeRowBelongsTo: string | null): string {
  const copy = worlds[0] as World
  return renderToStaticMarkup(
    createElement(page.TheWorldItself, {
      office: {
        worlds,
        from: 'the office' as const,
        mirrorWrittenAt: null,
        mirrorFile: null,
        mirrorNote: 'the office holds this list',
        isTheOffice: true,
        theHomeRowBelongsTo,
        thisWorld: copy.databaseIdentity,
        office: 'http://127.0.0.1:41601',
      },
      onChanged: () => {},
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

describe('a world says which handback it belongs to', () => {
  it('names the handback and the office it is on', () => {
    const html = body([aCopy(), theHomeRow()], 'aaaaaaaaaaaaaaaa')
    expect(html).toContain('bOZAJTim_9M7')
    expect(html).toContain(THE_ADDRESS_FOR_OTHER_MACHINES)
    expect(html).toContain('It is not in this copy.')
  })

  it('says nobody recorded one when the row carries none', () => {
    const html = body([aCopy({ handback: null }), theHomeRow()], 'aaaaaaaaaaaaaaaa')
    expect(html).toContain(NOBODY_TIED_THIS_WORLD_TO_A_HANDBACK)
    expect(html).not.toContain('bOZAJTim_9M7')
  })

  it('names the record and admits it does not know the address, rather than inventing one', () => {
    const said = theHandbackThisWorldBelongsToSentence({ handback: 'bOZAJTim_9M7' }, null)
    expect(said).toContain('bOZAJTim_9M7')
    expect(said).toContain('cannot say where to open it')
    expect(said).not.toContain('http')
  })

  it('prefers the address another machine reaches, because a copy runs on its own machine', () => {
    const worlds = [aCopy(), theHomeRow()]
    expect(theOfficeAddressACopyCarries(worlds, 'aaaaaaaaaaaaaaaa')).toBe(
      THE_ADDRESS_FOR_OTHER_MACHINES,
    )
    const local = [aCopy(), theHomeRow({ addressForOtherMachines: null })]
    expect(theOfficeAddressACopyCarries(local, 'aaaaaaaaaaaaaaaa')).toBe(THE_OFFICES_OWN_ADDRESS)
    // No home row for that identity, and no office row at all: both are "it did not say".
    expect(theOfficeAddressACopyCarries(worlds, 'cccccccccccccccc')).toBeNull()
    expect(theOfficeAddressACopyCarries([aCopy()], null)).toBeNull()
  })

  it('a copy that carries no home row names the office from the office’s own list, read from its mirror', () => {
    // tools/isolated-mole-office.mjs deletes the office's home row from a world's copy, so the world
    // is not the office and `theHomeRowBelongsTo` is null. The list it reads is the office's mirror,
    // which holds the office's live home row, and a dead one when the office was restored.
    const theMirror = [aCopy(), theHomeRow({ id: 'w-before', databaseIdentity: 'dddddddddddddddd', address: 'http://127.0.0.1:1', addressForOtherMachines: null, diedAt: '2026-09-01 10:00:00' }), theHomeRow()]
    expect(theOfficeAddressACopyCarries(theMirror, null)).toBe(THE_ADDRESS_FOR_OTHER_MACHINES)
    const html = renderToStaticMarkup(
      createElement(page.TheWorldItself, {
        office: {
          worlds: theMirror,
          from: 'the mirror' as const,
          mirrorWrittenAt: '2026-09-12 14:01:00',
          mirrorFile: '/nowhere/worlds.json',
          mirrorNote: 'the main world writes /nowhere/worlds.json',
          isTheOffice: false,
          theHomeRowBelongsTo: null,
          thisWorld: 'bbbbbbbbbbbbbbbb',
          office: 'http://127.0.0.1:41601',
        },
        onChanged: () => {},
      }),
    )
    expect(html).toContain('bOZAJTim_9M7')
    expect(html).toContain(THE_ADDRESS_FOR_OTHER_MACHINES)
    // Its own table holds no home row, so there it says it does not know the address.
    expect(theOfficeAddressACopyCarries([aCopy()], null)).toBeNull()
  })

  it('is stored on the row by the office and read back', async () => {
    const { freshDb } = await import('./helpers.ts')
    const t = await freshDb()
    try {
      const office = await import('../src/server/lib/office.ts')
      const world = await import('../src/server/lib/world.ts')
      world.forgetTheWorld()
      const identity = 'dddddddddddddddd'
      const born = office.registerWorldHere({
        name: 'a world with a handback',
        purpose: 'proving the column carries a record id',
        handback: 'bOZAJTim_9M7',
        kind: 'agent-made',
        startedBy: { kind: 'agent', id: 'a-test' },
        checkout: null,
        head: null,
        databaseIdentity: identity,
        address: 'http://127.0.0.1:41999',
        addressForOtherMachines: null,
        standing: 'scratch',
        parentWorld: null,
        installation: 'an-installation',
      })
      expect(born.handback).toBe('bOZAJTim_9M7')
      expect(office.worldsHere().find((one) => one.databaseIdentity === identity)?.handback).toBe('bOZAJTim_9M7')

      // A SECOND REGISTRATION CARRYING NONE NEVER EMPTIES THE ONE THE ROW HOLDS. Two agents twenty
      // minutes apart emptied nine fields of one record by sending a partial write as a whole one;
      // chapter 4 rule 3 is the same rule, and the COALESCE in registerWorldHere is it here.
      office.registerWorldHere({
        name: 'a world with a handback',
        kind: 'agent-made',
        startedBy: { kind: 'agent', id: 'a-test' },
        checkout: null,
        head: 'abcdef1',
        databaseIdentity: identity,
        address: 'http://127.0.0.1:41999',
        addressForOtherMachines: null,
        standing: 'scratch',
        parentWorld: null,
        installation: 'an-installation',
      })
      expect(office.worldsHere().find((one) => one.databaseIdentity === identity)?.handback).toBe('bOZAJTim_9M7')
    } finally {
      t.close()
    }
  })
})
