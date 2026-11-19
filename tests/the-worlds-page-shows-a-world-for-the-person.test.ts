// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C32: A WORLD KEPT UP FOR THE PERSON IS LISTED ON THE WORLDS PAGE, WITH THE PRESS THAT STOPS IT.
 *
 * Criterion C32 of design/rules/ACCEPTANCE.md: the world on port 40025 could be reached, but it was not
 * among the worlds. A world started with `--show-to-the-person` was written into the ledger
 * and into the handback's world block, and the Worlds page listed neither — a world left up for the person
 * was not on the page named Worlds. It is listed now with what to look at, the press that opens it
 * and the press that stops it.
 *
 * THE PRESS THAT STOPS IT IS THE PART WITH NO PRESS AT ALL BEFORE THIS. The page had an Enter; the
 * only callers of a close were two tools. The press calls `POST /api/office/worlds/:id/stop`, which
 * stops the world's recorded processes through the one release door and marks the row ended.
 *
 * IT RENDERS THE PAGE WITHOUT A SERVER, through the same pure `TheOffice` the Worlds page hands its
 * fetched lists to.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST: remove the stop press and the first case goes red. Control
 * run first.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { World } from '../src/shared/worlds.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

type WorldsModule = typeof import('../src/web/pages/WorldsPage.tsx')

let page: WorldsModule

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
  page = await import('../src/web/pages/WorldsPage.tsx')
})

/** A world row as the office hands it back, kept up for somebody to look at. */
function aWorld(over: Partial<World> = {}): World {
  return {
    id: 'w-up-for-the-person',
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
function body(worlds: World[]): string {
  return renderToStaticMarkup(
    createElement(page.TheOffice, {
      office: {
        worlds,
        from: 'the office' as const,
        mirrorWrittenAt: null,
        mirrorFile: null,
        mirrorNote: 'the office holds this list',
        isTheOffice: true,
        theHomeRowBelongsTo: null,
        thisWorld: 'aaaaaaaaaaaaaaaa',
        office: 'http://127.0.0.1:41601',
      },
      visits: [],
      trusts: null,
      onReadAgain: () => {},
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

describe('a world kept up for the person is on the Worlds page', () => {
  it('carries the up-for-the-person mark, what to look at, Enter and Stop', () => {
    const html = body([aWorld()])
    expect(html, 'the row does not say it is up for the person').toContain('Up for you')
    expect(html, 'the row does not say what to look at').toContain('The check panel on a run that was refused')
    expect(html, 'the row has no press that opens the world').toContain('>Enter<')
    expect(html, 'the row has no press that stops the world').toMatch(/wd-stop|>Stop</)
  })

  it('says nothing about being up for the person when nothing recorded a purpose', () => {
    const html = body([aWorld({ purpose: null })])
    expect(html).not.toContain('Up for you')
    expect(html).not.toMatch(/wd-stop/)
    // The world is still listed and still enterable; it just says nobody recorded a purpose.
    expect(html).toContain('>Enter<')
  })

  it('offers no Stop on a world that has already ended', () => {
    const html = body([aWorld({ diedAt: '2026-09-12 15:00:00', diedBecause: 'you pressed Stop' })])
    expect(html).not.toMatch(/wd-stop/)
    expect(html).toContain('you pressed Stop')
  })
})
