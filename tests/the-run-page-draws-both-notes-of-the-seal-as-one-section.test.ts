// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S PAGE DRAWS WHAT THE OFFICE DID AT THE SEAL AS THE ONE SECTION THE RUN DECLARES FOR IT (wave 13u round 96).
 *
 * Since round 96 a run keeps both notes of its seal in one field, `atTheSeal` {queued, nextRound}, so the run kind declares
 * one section for them and no longer one for each. The block on the run page (src/web/components/MergeQueueAtTheSeal.tsx)
 * still asked for the two old sections, `queuedAtTheSeal` and `nextRoundAtTheSeal`, and `sectionsOf` throws on a section
 * the kind does not declare. Seen in a throwaway office on 26 October 2026: on each of seven run pages with a note of its
 * seal, the block was not drawn within 30 seconds.
 *
 * No test drew the block, so nothing was red. This one draws it with renderToStaticMarkup, as
 * tests/a-problems-own-two-panels-say-what-they-draw.test.ts draws a problem's panels, and reads the region the browser
 * would walk to. One region is on one element only, because the page finds a stored comment's element with the first
 * match, so the two notes are drawn inside one panel and not as two panels that both say they are the section.
 */

import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'
import { sectionsOf, titleHere } from '../src/web/components/sections.ts'

type Block = typeof import('../src/web/components/MergeQueueAtTheSeal.tsx')

/** A window, so the modules that read a setting at import time can be imported at all. */
async function boot() {
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
  vi.resetModules()
  return (await import('../src/web/components/MergeQueueAtTheSeal.tsx')) as Block
}

/**
 * THE FIELD'S STORED NAME, written here and not imported, because this test is committed before the code that exports it.
 * The first case asks the run kind's declaration for it, so a rename fails there and not silently.
 */
const AT_THE_SEAL = 'atTheSeal'
const NOW = '2026-10-25 17:30:00'
const ID = 'run-one'

/** The note the office writes when a seal waits for the line's earlier entry. Every value here is made up. */
const QUEUED = { outcome: 'waits', for: 'an-earlier-entry', entry: 'entry-one', commit: '3f2a9c1e0000000000000000000000000000beef', at: NOW }
/** The note the office writes when it asks for no next round. */
const NEXT_ROUND = { outcome: 'not-asked', says: 'Made-up: briefs/NEXT.md is a held brief.', at: NOW }

function aRun(atTheSeal: Record<string, unknown>): PanelRecord {
  return {
    id: ID,
    workspaceId: 'panelx',
    kind: 'session',
    title: 'A made-up run',
    summary: null,
    data: { state: 'finished', [AT_THE_SEAL]: atTheSeal },
    origin: 'authored' as const,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
  }
}

/** The block as the run page draws it, with the sections the run page hands it. */
async function drawn(atTheSeal: Record<string, unknown>): Promise<string> {
  const block = await boot()
  const run = aRun(atTheSeal)
  return renderToStaticMarkup(h(block.TheSealInTheQueue, { record: run, sections: sectionsOf({ ...run, relations: [] }) }))
}

/** The region ids this markup declares, in the order they were written. */
function targets(markup: string): string[] {
  return [...markup.matchAll(/data-target="([^"]+)"/g)].map((m) => decodeURIComponent(m[1] as string))
}

const THE_SECTION = `region/${ID}/section.${AT_THE_SEAL}`

describe("a run's page draws what the office did at the seal as the run's one atTheSeal section", () => {
  it('draws both notes, inside the one element that says it is the section', async () => {
    expect(KIND_SPECS.session.fields.some((f) => f.key === AT_THE_SEAL), 'a run no longer declares atTheSeal').toBe(true)
    const html = await drawn({ queued: QUEUED, nextRound: NEXT_ROUND })
    expect(html, 'the note for the merge queue was not drawn').toContain('data-at-the-seal="waits"')
    expect(html, 'the note for the next round was not drawn').toContain('data-next-at-the-seal="not-asked"')
    const said = targets(html)
    expect(said.filter((one) => one === THE_SECTION), `the section is on ${String(said.filter((one) => one === THE_SECTION).length)} elements`).toHaveLength(1)
    expect(said.filter((one) => one !== THE_SECTION), 'the block says it is a section the run does not declare').toEqual([])
  })

  it('draws a note alone, in the same section, when the office wrote only that part', async () => {
    const queued = await drawn({ queued: QUEUED })
    expect(queued).toContain('data-at-the-seal="waits"')
    expect(queued).not.toContain('data-next-at-the-seal')
    expect(targets(queued)).toEqual([THE_SECTION])
    const next = await drawn({ nextRound: NEXT_ROUND })
    expect(next).toContain('data-next-at-the-seal="not-asked"')
    expect(next).not.toContain('data-at-the-seal')
    expect(targets(next)).toEqual([THE_SECTION])
  })

  it("is headed with the section's own title, the one a comment on it is filed under", async () => {
    const html = await drawn({ queued: QUEUED, nextRound: NEXT_ROUND })
    const title = titleHere('session', AT_THE_SEAL)
    expect(title, 'the section has no word for its title').not.toMatch(/⟦/)
    expect(html).toContain(`>${title}</h2>`)
  })
})
