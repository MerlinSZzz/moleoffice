// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLANNED FUTURE DRAWS ITS OWN STATES BY NAME, NOT AS THE IDS IT STORES THEM UNDER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ON SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * A trajectory's body fold read `Planned state ids` and then `qBTosjpbnqra` and `6qzTxKAgVs1m`, at
 * 1440 and at 390. `plannedStateIds` is the kind's REQUIRED field and the whole reason the kind
 * exists — an ordered set of intended states — and a person reading that page could not tell which
 * two states were planned, in what order, or whether either of them was the one they were looking
 * for.
 *
 * The cause is that a declared `string[]` is a list of strings whether it holds sentences or record
 * ids, so the generic fold stack drew the ids. `RECORD_ID_LISTS` says which fields hold ids; two
 * fields do. It lives in src/shared/sections.ts and tests/sections.test.ts proves it names real
 * fields; this file is only about what the page draws from it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS ASSERT, AND WHAT THEY DELIBERATELY DO NOT
 * ---------------------------------------------------------------------------------------
 *
 * They assert on the DRAWN MARKUP, not on the table or on `bodySections`' return. A table saying
 * `trajectory: ['plannedStateIds']` is worth nothing if nothing reads it, and this repository has
 * shipped exactly that three times: a pure function guarded by a test, wired to no drawing.
 *
 * They do not assert a particular heading wording beyond the one rule the page states — drop the
 * `Ids` the key ends in and say the plural — because a heading written down twice is the defect
 * this page's own docstring is about.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it, vi } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')

/** A window, and the page imported after it, the way tests/record-tiers.test.ts does it. */
async function boot(): Promise<Page> {
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
  return (await import('../src/web/pages/RecordPage.tsx')) as Page
}

const NOW = '2026-08-10 09:00:00'

const A = 'qBTosjpbnqra'
const B = '6qzTxKAgVs1m'
const GONE = 'zzzzzzzzzzzz'

function record(kind: RecordKind, id: string, title: string, data: Record<string, unknown>): PanelRecord {
  return {
    id,
    workspaceId: 'panelx',
    kind,
    title,
    summary: null,
    data,
    origin: 'authored' as const,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
  }
}

const FIRST = 'The gripper is calibrated against the measured intrinsics'
const SECOND = 'The reach envelope is measured with that gripper'

function trajectory(ids: string[]): PanelRecord {
  return record('trajectory', 'trj-1', 'Calibrate, then measure the reach', {
    plannedStateIds: ids,
    because: 'The gripper has to be right before the reach envelope means anything.',
  })
}

/** Everything `RecordDetail` needs, as plain data. Nothing here fetches. */
function detailProps(page: Page, rec: PanelRecord, titleById: Map<string, string>) {
  return {
    record: rec,
    editable: false,
    records: [{ id: rec.id, title: rec.title }],
    detailLinks: [],
    relations: [],
    evolutionLinks: [],
    log: { changes: [], sessions: [] },
    titles: [rec.title],
    titleById,
    unfilledByRecord: new Map<string, number>(),
    body: page.bodySections(rec),
    onChanged: () => {},
  }
}

function drawn(page: Page, rec: PanelRecord, titleById: Map<string, string>): string {
  return renderToStaticMarkup(h(page.RecordDetail, detailProps(page, rec, titleById) as never)).replace(
    /<style[\s\S]*?<\/style>/g,
    '',
  )
}

const named = () =>
  new Map([
    ['trj-1', 'Calibrate, then measure the reach'],
    [A, FIRST],
    [B, SECOND],
  ])

describe('a trajectory draws the states it plans, in order, by name', () => {
  it('puts both titles on the page and neither id', async () => {
    const page = await boot()
    const html = drawn(page, trajectory([A, B]), named())
    expect(html).toContain(FIRST)
    expect(html).toContain(SECOND)
    // THE IDS ARE STILL THE ADDRESS, so they are in the hrefs. What must not be there is an id
    // drawn as the row's own words, which is what a reader was given before.
    expect(html).toContain(`href="#/r/${A}"`)
    expect(html).toContain(`href="#/r/${B}"`)
    expect(html).not.toContain(`>${A}<`)
    expect(html).not.toContain(`>${B}<`)
  })

  it('keeps the stored order, because the order is what a trajectory is', async () => {
    const page = await boot()
    const forward = drawn(page, trajectory([A, B]), named())
    const back = drawn(page, trajectory([B, A]), named())
    expect(forward.indexOf(FIRST)).toBeLessThan(forward.indexOf(SECOND))
    expect(back.indexOf(SECOND)).toBeLessThan(back.indexOf(FIRST))
  })

  it('heads the fold with what is under it rather than with the storage', async () => {
    const page = await boot()
    const html = drawn(page, trajectory([A, B]), named())
    expect(html).toContain('Planned states')
    expect(html).not.toContain('Planned state ids')
    // The rule, said as a rule: only the declared id fields lose the suffix.
    expect(page.bodyHeading('trajectory', 'plannedStateIds')).toBe('Planned states')
    expect(page.bodyHeading('trajectory', 'because')).toBe('Because')
  })

  it('draws an id nothing here answers to as the id it is, and says so', async () => {
    const page = await boot()
    const html = drawn(page, trajectory([A, GONE]), named())
    expect(html).toContain(FIRST)
    expect(html).toContain(GONE)
    expect(html).toContain('no record of that id is in this project')
    // NOT a link, because there is nothing to open, and not silently dropped either.
    expect(html).not.toContain(`href="#/r/${GONE}"`)
  })

  it('leaves a list of somebody’s words exactly as it was', async () => {
    const page = await boot()
    const held = record('placeholder', 'plc-1', 'The wrist camera has never been calibrated', {
      what: "The wrist camera's intrinsics have never been calibrated.",
      slot: 'stand_in',
      resolved_when: 'A checkerboard calibration run, with the residuals recorded.',
      allowed_uses: ['pipeline plumbing', 'shape and interface testing'],
      disallowed_claims: ['geometric accuracy claims', 'final performance comparison'],
      severity: 'stops_final',
    })
    const html = drawn(page, held, new Map([['plc-1', 'The wrist camera has never been calibrated']]))
    expect(html).toContain('geometric accuracy claims')
    // The mark that says *these exact words are the stored string* is still on the words.
    expect(html).toContain('data.disallowed_claims[0]')
  })
})
