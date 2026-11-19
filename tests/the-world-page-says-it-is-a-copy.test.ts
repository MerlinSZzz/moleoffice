// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C33: THE WORLD'S OWN PAGE SAYS IT IS A COPY TAKEN AT A STATED TIME, AND THAT RECORDS
 * FILED AFTER THAT LIVE ON THE OWNER'S OFFICE.
 *
 * Criterion C33 of design/rules/ACCEPTANCE.md: what the worlds were for was not clear, and
 * report bOZAJTim_9M7 was not to be found in the world on port 34233. A world is a copy of the
 * corpus taken when it started, so a handback filed afterwards on the live office is not in it, and
 * nothing in the world said so.
 *
 * IT RENDERS THE PAGE WITHOUT A SERVER. `TheWorldItself` is the pure half of WorldHerePage: it takes
 * the office's answer and draws it, so the sentence a person reads can be held still without a
 * browser, a socket or a world.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST: drop the copy sentence from the page and the first case goes
 * red. Control run first.
 */
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { World } from '../src/shared/worlds.ts'
import {
  THE_FACES_SENTENCE,
  recordsAfterTheCopyLiveOnTheirOfficeSentence,
  theWorldIsACopyTakenAtSentence,
} from '../src/shared/worldcopy.ts'

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

/** A world row as the office hands it back, with the parts a test does not vary. */
function aWorld(over: Partial<World> = {}): World {
  return {
    id: 'w-the-world',
    name: 'the check panel world',
    purpose: 'The check panel on a run that was refused, and the words on the five standings.',
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

/** The page's markup with the hoisted stylesheet stripped, which is all a person reads. */
function body(world: World, isTheOffice = false, theHomeRowBelongsTo: string | null = null): string {
  return renderToStaticMarkup(
    createElement(page.TheWorldItself, {
      office: {
        worlds: [world],
        from: 'the office' as const,
        mirrorWrittenAt: null,
        mirrorFile: null,
        mirrorNote: 'the office holds this list',
        isTheOffice,
        theHomeRowBelongsTo,
        thisWorld: world.databaseIdentity,
        office: 'http://127.0.0.1:41601',
      },
      onChanged: () => {},
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

describe('the world’s own page says what it is', () => {
  it('says it is a copy taken at a stated time', () => {
    const world = aWorld()
    // The markup escapes the quotes around the name; the sentence a reader sees has them.
    const html = body(world).replace(/&quot;/g, '"')
    expect(html).toContain(theWorldIsACopyTakenAtSentence(world))
    expect(html).toContain('taken at 2026-09-12 14:00:00')
  })

  it('says records filed after that live on the owner’s office, not here', () => {
    const html = body(aWorld())
    expect(html).toContain(recordsAfterTheCopyLiveOnTheirOfficeSentence('2026-09-12 14:00:00'))
    expect(html).toContain('They are in your office.')
  })

  it('says what to look at, and gives a press to each screen', () => {
    const html = body(aWorld())
    expect(html).toContain('The check panel on a run that was refused')
    expect(html).toContain('What to look at')
    expect(html).toContain('/records')
    expect(html).toContain('/worlds')
  })

  it('says why the faces differ, in the measured words', () => {
    expect(body(aWorld())).toContain(THE_FACES_SENTENCE)
  })

  it('offers the press that stops the world while it is up', () => {
    expect(body(aWorld())).toContain('Stop this world')
    expect(body(aWorld({ diedAt: '2026-09-12 15:00:00', diedBecause: 'you pressed Stop' }))).not.toContain(
      'Stop this world',
    )
  })

  it('says the office is not a copy, rather than claiming it is one', () => {
    const html = body(aWorld({ kind: 'home', name: 'my world' }), true)
    expect(html).toContain('not a copy')
    expect(html).not.toContain('is a copy of the office')
  })

  it('still says a copy when the world carries the office’s own home row, as a copied database does', () => {
    // A world made from a copy of the office's database carries the original home row, so
    // `isTheOffice` is true inside it. `theHomeRowBelongsTo` is the reading that tells them apart.
    const world = aWorld()
    const html = body(world, true, 'ffffffffffffffff').replace(/&quot;/g, '"')
    expect(html).toContain(theWorldIsACopyTakenAtSentence(world))
    expect(html).not.toContain('not a copy')
  })
})
