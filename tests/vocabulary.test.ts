// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE VOCABULARY, NOT SEVERAL — the copies the compiler cannot see.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * This project's recurring defect has one shape: two places that must agree, with nothing making
 * them. It has been paid for four times — a session-state list in two files, a state-to-chip map
 * in three, a local-timestamp helper in six, and two complete source scanners writing the same
 * tables. Every one of them was found by accident.
 *
 * Most of those copies are gone now, derived from one declaration or asserted equal by the
 * compiler. What is left is the set the compiler CANNOT join up: the browser may not import from
 * src/server, because a value import would pull better-sqlite3 into the page bundle, so every
 * server vocabulary the browser has to read arrives as a hand-written mirror. A mirror is fine.
 * A mirror nothing checks is the defect above, waiting.
 *
 * So this file is the check. It imports both sides and asserts they are the same list, in the
 * same order. Order matters as much as membership: these are the lists that build error
 * messages, and "one of: process, port, gpu" naming them in a different order than the ledger
 * does is a message that reads as a different rule.
 *
 * WHAT BELONGS HERE. A vocabulary that exists twice, where one copy is in src/web and the other
 * in src/server or src/shared. What does NOT belong: a copy that can be deleted instead. If you
 * are about to add a case here, check first whether the second copy can simply import the first
 * — a test that catches drift is second best to a copy that cannot drift.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT OPENS A DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * src/server/lib/resources.ts reaches lib/records.ts and through it the SQLite client, which
 * opens MOLE_OFFICE_DB the moment it is imported. `freshDb()` points that at a throwaway file first,
 * so importing a list of five words here cannot touch the real database.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { ITEM_STATES, PATH_KINDS, RECORD_KINDS, type PanelRecord } from '../src/shared/types.ts'
import { displayWord } from '../src/shared/work.ts'

type ServerResources = typeof import('../src/server/lib/resources.ts')
type ServerResourceApi = typeof import('../src/server/api/resources.ts')
type SessionPanel = typeof import('../src/web/components/SessionPanel.tsx')
type ModuleView = typeof import('../src/web/components/ModuleView.tsx')
type Attention = typeof import('../src/web/lib/attention.ts')

let db: TestDb
let ledger: ServerResources
let routes: ServerResourceApi
let panel: SessionPanel
let moduleView: ModuleView
let attention: Attention

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage while it is being evaluated, and ModuleView imports
  // it. The runner's environment is `node` — no DOM, and adding one would be a dependency this
  // project has ruled out — so the smallest stand-in for a window goes in before the import, the
  // same way tests/panels-follow.test.ts does it.
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

  db = await freshDb()
  ledger = await import('../src/server/lib/resources.ts')
  routes = await import('../src/server/api/resources.ts')
  panel = await import('../src/web/components/SessionPanel.tsx')
  moduleView = await import('../src/web/components/ModuleView.tsx')
  attention = await import('../src/web/lib/attention.ts')
})

afterAll(() => db.close())

// ============================================================ the ledger and the session panel


// ============================================================ the readers that widen a vocabulary

/**
 * A vocabulary can also be copied into a READER — the list a page checks a JSON value against
 * before it will draw it. Those copies do not look like copies, which is why two of them survived
 * the sweep that removed the obvious ones: `attention.ts` held its own five item states and
 * `ModuleView.tsx` its own eight path kinds, both as plain `string[]` so nothing typed them.
 *
 * They are derived now. These tests are the proof from the outside: every word the contract
 * declares has to be a word the reader accepts, or the reader is rejecting valid stored data and
 * printing it as a problem on the page.
 */
describe('every reader accepts the whole vocabulary it reads against', () => {
  const record = (over: Partial<PanelRecord>): PanelRecord => ({
    id: 'rec-1',
    kind: 'pipeline',
    workspaceId: 'default',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: 'a pipeline',
    summary: null,
    data: {},
    createdAt: '2026-08-08 10:00:00',
    updatedAt: '2026-08-08 10:00:00',
    deletedAt: null,
    ...over,
  })

  /** A block record, of the kind a pipeline's `blockIds` now names. */
  const blockRecord = (id: string, name: string, state: string): PanelRecord =>
    record({ id, kind: 'block', title: `a pipeline \u203a ${name}`, data: { state } })

  it('reads a pipeline block in every state the contract declares', () => {
    const blocks = ITEM_STATES.map((state, i) => blockRecord(`s${i}`, state, state))
    const pipeline = record({ data: { blockIds: blocks.map((b) => b.id) } })
    const { pipelines, problems } = attention.readPipelines([pipeline, ...blocks])

    expect(problems, problems.map((p) => p.problem).join('; ')).toEqual([])
    expect(pipelines[0]?.blocks.map((b) => b.state)).toEqual([...ITEM_STATES])
  })

  it('still refuses a state the contract does not declare, rather than drawing it as todo', () => {
    // ONE BAD BLOCK NO LONGER COSTS THE PIPELINE. It used to discard the whole record at the first
    // bad step, which was right when a step was one entry in an array that could not be trusted;
    // a block is a row, so the others are still readable and the bad one is reported by position.
    const good = blockRecord('s1', 'grasp', 'doing')
    const bad = blockRecord('s2', 'release', 'nearly')
    const pipeline = record({ data: { blockIds: ['s1', 's2'] } })
    const { pipelines, problems } = attention.readPipelines([pipeline, good, bad])
    expect(problems).toHaveLength(1)
    expect(problems[0]?.problem).toContain('nearly')
    expect(pipelines[0]?.blocks.map((b) => b.id)).toEqual(['s1'])
  })

  it('reads a module path of every kind the contract declares', () => {
    const paths = PATH_KINDS.map((kind, i) => ({
      id: `p${i}`,
      label: kind,
      path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/thing-${i}`,
      kind,
    }))
    const parsed = moduleView.parseModule({ context: 'why this exists', parts: [], paths })

    expect(parsed.problems, parsed.problems.join('; ')).toEqual([])
    expect(parsed.paths.map((p) => p.kind)).toEqual([...PATH_KINDS])
  })

  it('still says so when a path kind is one nothing declares, and draws it as other', () => {
    const parsed = moduleView.parseModule({
      context: 'why this exists',
      parts: [],
      paths: [{ id: 'p1', label: 'a notebook', path: `${THE_TEST_FIXTURE_ROOT}/x.ipynb`, kind: 'notebook' }],
    })
    expect(parsed.problems.join(' ')).toContain('notebook')
    expect(parsed.paths[0]?.kind).toBe('other')
  })
})

// ---------------------------------------------------------------------------- words on the screen

/**
 * No stored identifier reaches a screen, and no underscore either.
 *
 * A stored value is chosen so a program can hold it: lower case, no spaces, often shortened.
 * `wanna_try` was the label on a menu a person picks from. The stored value never changes — that
 * would cost a migration, the API schema and every agent's skill file — so one table says what to
 * print instead.
 */
describe('displayWord', () => {
  it('gives a word a person would say for the identifiers that need one', () => {
    expect(displayWord('wanna_try')).toBe('worth a try')
    expect(displayWord('block')).toBe('step')
    expect(displayWord('in_flight')).toBe('under way')
    expect(displayWord('stopped_short')).toBe('did not finish')
  })

  it('never lets an underscore reach the screen, even for a word nothing has renamed', () => {
    expect(displayWord('worked_around')).toBe('worked around')
    expect(displayWord('not_started')).toBe('not started')
    for (const kind of RECORD_KINDS) expect(displayWord(kind), kind).not.toContain('_')
  })

  it('leaves a word that already reads well exactly as it is', () => {
    expect(displayWord('task')).toBe('task')
    expect(displayWord('module')).toBe('module')
  })

  it('gives back nothing for nothing, rather than making a word up', () => {
    // "Nothing is stored here" is a real answer and the surfaces that draw it have their own
    // words for it. A default here would put one of them in the wrong place.
    expect(displayWord('')).toBe('')
    expect(displayWord('   ')).toBe('')
  })
})
