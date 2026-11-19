// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * "THERE IS NONE" AND "NOBODY HAS LOOKED" ARE TWO ANSWERS, AND `#/working` MAY NEVER DRAW THEM AS ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * `#/working` is empty on the owner's corpus, and it is empty for three different reasons that are
 * not one reason. Nobody has filed a durable agent. Nobody has filed a work domain. And the table
 * that holds what an agent said it was doing **is not on the database at all**, so no work state
 * was read for anybody.
 *
 * The first two are *the store was read and it holds none*. The third is *nobody looked, because
 * there is nothing to look with*. USER.md's fifth invariant is exactly this: *"Distinguish
 * nothing is there from nobody has looked."* A page that drew the third as the first would be
 * telling the owner that their agents have said nothing, when the truth is that Mole Office cannot hear them.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS EACH TEST IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * 1. `workStateOnScreen` in src/server/lib/working.ts stops asking whether the store exists, and
 *    returns `nothing-recorded` in both cases. Tests 3, 4 and 5 go red.
 * 2. The roster stops publishing the missing-store absence. Test 6 goes red.
 * 3. `WorkingReading` in src/web/pages/WorkingPage.tsx passes a constant to `Absence`'s `looked` —
 *    the tidying anybody would reach for, because one quiet mark looks better than two. Tests 7 and
 *    8 go red, and they compare the two MARKUPS rather than one string, so a mutation that changes
 *    both words together still fails.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TABLE IS CREATED FROM THE HELD SQL
 * ---------------------------------------------------------------------------------------
 *
 * The migration that creates `agent_work_transitions` is written, proved and deliberately NOT
 * registered: this campaign has one announced window and the owner opens it. So a fresh test
 * database does not have the table, which is the state the product is in today — and the test that
 * needs it applies `held-migrations/agent-lifecycle-tables.sql` to its own throwaway
 * database, the same way `tests/one-work-state-door.test.ts` does.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { NOBODY_HAS_SAID } from '../src/shared/lifecycle.ts'
import type { WhoIsWorking, WorkingRow } from '../src/server/lib/working.ts'
import type { WhatHasBeenSaid } from '../src/server/lib/communication.ts'

// THE TWO COMPONENTS ARE IMPORTED AFTER A WINDOW STAND-IN EXISTS, and that is why these two are
// dynamic while everything above is not. `src/web/api.ts` reads `window.localStorage` at module
// scope, so a static import of either page would throw before the first test ran. It is the same
// stand-in tests/shell-nav.test.ts and tests/app-routes.test.ts install, for the same reason.
let WorkingReading: typeof import('../src/web/pages/WorkingPage.tsx')['WorkingReading']
let SaidBand: typeof import('../src/web/components/home/WhatHasBeenSaid.tsx')['SaidBand']

const HELD_SQL = fileURLToPath(new URL('../held-migrations/agent-lifecycle-tables.sql', import.meta.url))

const WORKSPACE = 'default'
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let working: typeof import('../src/server/lib/working.ts')

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
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  WorkingReading = (await import('../src/web/pages/WorkingPage.tsx')).WorkingReading
  SaidBand = (await import('../src/web/components/home/WhatHasBeenSaid.tsx')).SaidBand
})

/** One durable agent that may be given new work. Nothing else; that is the whole point. */
let agentNumber = 0
let agentsMade: string[] = []
function anAgent(): string {
  agentNumber += 1
  const id = t.api.createRecord({
    kind: 'agent',
    title: 'the agent nobody has spoken for',
    workspaceId: WORKSPACE,
    data: { handle: `unspoken-${String(agentNumber)}`, state: 'active' },
    actor: PERSON,
  }).id
  agentsMade.push(id)
  return id
}

/** The one row of a reading, or a failure naming what came back instead. */
function theRow(reading: WhoIsWorking): WorkingRow {
  const row = reading.rows[0]
  if (row === undefined) throw new Error(`expected one row, got ${String(reading.rows.length)}`)
  return row
}

describe('the roster tells the two emptinesses apart', () => {
  beforeAll(async () => {
    t = await freshDb()
    working = await import('../src/server/lib/working.ts')
  }, 60_000)

  afterAll(() => t.close())

  /** Put back the agents this case filed, so the roster's "no agent recorded" is the next case's too. */
  afterEach(() => {
    for (const id of agentsMade.splice(0)) {
      t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(id)
      t.client.sqlite.prepare('DELETE FROM records WHERE id = ?').run(id)
    }
  })

  it('really read something, so nothing below can pass by finding nothing at all', () => {
    // EVERY CHECK BELOW IS ABOUT WHAT AN ANSWER SAYS. A reading that returned an empty everything
    // would satisfy several of them by saying nothing, which is the failure this line exists for.
    const reading = working.whoIsWorking(WORKSPACE)
    expect(reading.absences.length).toBeGreaterThan(0)
    expect(reading.note.length).toBeGreaterThan(20)
    expect(reading.workspaceId).toBe(WORKSPACE)
  })

  it('says nobody has RECORDED an agent, which is not the same as saying there are none', () => {
    const reading = working.whoIsWorking(WORKSPACE)
    const absence = reading.absences.find((one) => one.what === 'a durable agent')
    expect(absence, 'the roster stopped saying why it has no agents').toBeDefined()
    // The store was read and holds none. That is a real answer and it is the FIRST kind of empty.
    expect(absence?.answer).toBe('nothing-recorded')
    expect(absence?.says).toContain('The store was read')
  })

  it('with no transitions table, says the work state COULD NOT BE READ and never that none was said', () => {
    anAgent()
    const row = theRow(working.whoIsWorking(WORKSPACE))
    expect(row.workState.state).toBeNull()
    // THE WHOLE TEST. `reader-not-built` is "nobody looked"; `nothing-recorded` is "there is none".
    expect(row.workState.answer).toBe('reader-not-built')
    expect(row.workState.says).toContain('cannot read')
    expect(row.workState.says).not.toBe(NOBODY_HAS_SAID)
  })

  it('publishes the missing store as an absence of its own, so a reader is told before they conclude', () => {
    anAgent()
    const reading = working.whoIsWorking(WORKSPACE)
    const absence = reading.absences.find((one) => one.what === 'what any agent said it was doing')
    expect(absence?.answer).toBe('reader-not-built')
    expect(reading.machinery.transitionStore.exists).toBe(false)
    expect(reading.note).toContain('not on this database')
  })
})

/**
 * THE TWO CASES THAT PUT THE HELD TABLE ON THE DATABASE. They change its shape, so each keeps a
 * database of its own; a shared one would leave the table there for any case that must read it
 * absent. The cases before this block share one office because it has no such table.
 */
describe('the roster with the held table', () => {
  beforeEach(async () => {
    agentsMade = []
    t = await freshDb()
    working = await import('../src/server/lib/working.ts')
  })

  afterEach(() => t.close())

  it('with the table there and empty, says NOBODY HAS SAID — and that is a different sentence', () => {
    t.client.sqlite.exec(readFileSync(HELD_SQL, 'utf8'))
    anAgent()
    const row = theRow(working.whoIsWorking(WORKSPACE))
    expect(row.workState.state).toBeNull()
    expect(row.workState.answer).toBe('nothing-recorded')
    expect(row.workState.says).toBe(NOBODY_HAS_SAID)
  })

  it('answers the same agent two different ways depending on whether the store is there', () => {
    // THE TWO READINGS SIDE BY SIDE, which is the assertion a mutation cannot satisfy by changing
    // one wording. The agent is identical, the database is identical, and the only thing that
    // differs is whether Mole Office was able to look.
    //
    // THE TABLE IS CREATED FIRST because the second call reads it. `workStateOnScreen` is told
    // whether the store is there rather than asking — the roster asks once, for the whole page, so
    // one absent table cannot take every row down with a 503 — and this exercises both branches.
    t.client.sqlite.exec(readFileSync(HELD_SQL, 'utf8'))
    const id = anAgent()
    const withoutStore = working.workStateOnScreen(id, WORKSPACE, false)
    const withStore = working.workStateOnScreen(id, WORKSPACE, true)
    expect(withoutStore.answer).not.toBe(withStore.answer)
    expect(withoutStore.says).not.toBe(withStore.says)
  })
})

/** The two kinds of absence, as the page is handed them. Everything else is held identical. */
function readingWithAbsence(answer: 'nothing-recorded' | 'reader-not-built'): WhoIsWorking {
  return {
    workspaceId: WORKSPACE,
    computedAt: '2026-08-27 21:00:00',
    rows: [],
    counts: { agents: 0, active: 0, retired: 0, withWorkState: 0, openDomains: 0, overlaps: 0, writeConflicts: 0 },
    unregistered: [],
    absences: [{ code: 'statedWork', what: 'what any agent said it was doing', answer, count: 0, says: 'the sentence is held identical' }],
    note: 'a note',
    machinery: { resolverVersion: 'wd-1', transitionStore: { exists: false, says: 'held identical' } },
  }
}

describe('the page draws the two emptinesses differently', () => {
  it('really drew something, so a comparison of two empty strings cannot pass', () => {
    const html = renderToStaticMarkup(h(WorkingReading, { reading: readingWithAbsence('nothing-recorded'), inspect: false }))
    expect(html.length).toBeGreaterThan(200)
    expect(html).toContain('Stated work')
  })

  it('draws a store that was read and a store that was never read as two different things', () => {
    const looked = renderToStaticMarkup(h(WorkingReading, { reading: readingWithAbsence('nothing-recorded'), inspect: false }))
    const never = renderToStaticMarkup(h(WorkingReading, { reading: readingWithAbsence('reader-not-built'), inspect: false }))
    // THE ONLY DIFFERENCE BETWEEN THE TWO INPUTS IS THE WORD `answer`. If the drawings are equal,
    // the page has thrown that word away and is reporting a clean bill of health nobody established.
    expect(never, 'nobody looked is being drawn as there are none').not.toBe(looked)
    // And the two channels the product already uses for this pair: the shape, and the word.
    expect(never).toContain('data-edge="dashed"')
    expect(never).toContain('not looked at')
    expect(looked).not.toContain('data-edge="dashed"')
    // Plan 7FEOshq3mBGG draws ordinary emptiness as a mark, with its reason available.
    expect(looked).toContain('class="px-absent" title="not recorded">—')
  })
})

/**
 * THE SAME RULE ON HOME, IN ARITHMETIC.
 *
 * A direction nobody can start and a direction that works and nobody used both count zero. Drawing
 * them the same way is the identical failure one layer up: it turns "there is no way to do this"
 * into "nobody has needed to".
 */
function saidWith(howFar: 'completes' | 'stops-short' | 'no-door'): WhatHasBeenSaid {
  return {
    workspaceId: WORKSPACE,
    computedAt: '2026-08-27 21:00:00',
    summary: {
      commentsWritten: 0,
      commentsGone: 0,
      commentsInAReview: 0,
      commentsInNothing: 0,
      reviews: [],
      collectedNeverSent: [],
      conversations: [],
      runs: [],
      nobodyHasEverClaimedARun: true,
      agents: 0,
    },
    directions: [
      {
        key: 'agent-to-agent',
        word: 'One agent to another',
        howFar,
        counts: { queued: 0, waiting: 0, handled: 0, failed: 0, needsAttention: 0, unread: 0 },
        mechanisms: [
          {
            what: 'A message addressed to another agent',
            howFar,
            counts: { queued: 0, waiting: 0, handled: 0, failed: 0, needsAttention: 0, unread: 0 },
            says: 'held identical',
          },
        ],
      },
    ],
    note: 'a note',
  }
}

describe('Home says how far a direction gets, beside its count', () => {
  it('really drew the band, so the comparison below is about a drawing', () => {
    const html = renderToStaticMarkup(h(SaidBand, { reading: saidWith('no-door') }))
    expect(html).toContain('One agent to another')
    expect(html).toContain('What has been said')
  })

  it('draws a zero with no door differently from a zero that simply never happened', () => {
    const noDoor = renderToStaticMarkup(h(SaidBand, { reading: saidWith('no-door') }))
    const works = renderToStaticMarkup(h(SaidBand, { reading: saidWith('completes') }))
    expect(noDoor, 'a direction nobody can use is drawn as one nobody wanted').not.toBe(works)
    expect(noDoor).toContain('data-how-far="no-door"')
    expect(noDoor).toContain('no way to start one')
    expect(works).toContain('gets through')
  })
})

/**
 * ONE AGENT AT WORK, DRAWN.
 *
 * THE CORPUS HOLDS NO AGENT AND NOTHING HERE PUTS ONE IN IT. Seeding a fixture agent to make the
 * page look inhabited is fabricated evidence and is forbidden by name, so the browser pass
 * photographs the empty page and this renders a row from a reading built in the test. The two prove
 * different things: the picture proves what the owner sees today, and this proves the branch the
 * picture cannot reach.
 *
 * THE PAIR IT USES IS **Offline and Working**, on purpose. It is the pair a builder wants to call
 * impossible, and it is what a provider dying mid-task looks like. A page that derived one word
 * from the other would draw it as Finished and report an API death as a success.
 */
function oneAgentAtWork(): WhoIsWorking {
  const row: WorkingRow = {
    agentId: 'agent-1',
    handle: 'perception',
    title: 'The perception agent',
    agentState: 'active',
    participant: {
      id: 'perception',
      name: 'The perception agent',
      avatarUrl: '/api/assets/avatar-default-agent-perception',
      state: null,
      stateAt: null,
      retired: false,
      retiredBecause: null,
      startedBy: null,
    },
    runtime: 'claude-code',
    workState: {
      state: 'working',
      word: 'Working',
      says: 'This agent is doing the work now.',
      answer: 'answered',
      since: '2026-08-27 18:00:00',
      because: 'It picked the calibration up after the last stage reported.',
      saidBy: { type: 'agent', id: 'perception' },
    },
    presence: {
      agentId: 'agent-1',
      workspaceId: WORKSPACE,
      presence: 'offline',
      word: 'Offline',
      says: 'No attachment is open.',
      from: null,
      whyNoInput: 'No attachment is open.',
      lastArrival: null,
      quietForMinutes: null,
      openAttachments: [],
      staleAfterMinutes: 15,
      thresholdIsUnmeasured: 'nobody has measured it',
      inputs: [],
    },
    doing: 'Re-running the nine grip trials at the new offset.',
    doingFrom: 'run-1',
    attachment: null,
    domains: [
      {
        id: 'domain-1',
        title: 'the grip calibration',
        objective: 'Bring the grip force table back in line with the nine trials.',
        stage: 'working',
        basis: 'accepted',
        touches: ['src/grip/force.ts'],
        aboutRecords: [{ id: 'rec-1', title: 'Grip force drifts on the third print', kind: 'problem' }],
        lastSign: { at: '2026-08-27 18:30:00', from: 'a revision of this domain' },
      },
    ],
    overlaps: [
      {
        otherDomainId: 'domain-2',
        otherDomainTitle: 'the shell rework',
        otherAgentId: 'agent-2',
        subject: 'src/grip/force.ts',
        overlapClass: 'write_write',
        rank: 4,
        word: 'Both changing the same file',
        says: 'You are changing a file the other agent is also changing.',
        unknown: false,
      },
    ],
    writeConflicts: 1,
    lastProgress: { at: '2026-08-27 18:30:00', from: 'a change written by one of this agent runs', agoMinutes: 45 },
    inThisStateMinutes: 90,
  }
  return {
    workspaceId: WORKSPACE,
    computedAt: '2026-08-27 19:15:00',
    rows: [row],
    counts: { agents: 1, active: 1, retired: 0, withWorkState: 1, openDomains: 1, overlaps: 1, writeConflicts: 1 },
    unregistered: [],
    absences: [],
    note: 'one agent may be given new work',
    machinery: { resolverVersion: 'wd-1', transitionStore: { exists: true, says: 'read' } },
  }
}

describe('a row draws the two dimensions as two dimensions', () => {
  it('draws Offline and Working together, and calls neither of them Finished', () => {
    const html = renderToStaticMarkup(h(WorkingReading, { reading: oneAgentAtWork(), inspect: false }))
    expect(html).toContain('Says it is')
    expect(html).toContain('Working')
    expect(html).toContain('Can be reached')
    expect(html).toContain('Offline')
    // THE MUTATION THIS LINE IS AGAINST: a page that read the work state off the presence would
    // draw an unattached agent as Finished, which is every API death reported as a success.
    expect(html).not.toContain('Finished')
  })

  it('draws what the agent said it was doing in the agent’s own words', () => {
    const html = renderToStaticMarkup(h(WorkingReading, { reading: oneAgentAtWork(), inspect: false }))
    expect(html).toContain('Re-running the nine grip trials at the new offset.')
    expect(html).toContain('It picked the calibration up after the last stage reported.')
  })

  it('names the work domain and conflict, and keeps its file paths in Developer', () => {
    const html = renderToStaticMarkup(h(WorkingReading, { reading: oneAgentAtWork(), inspect: false }))
    expect(html).toContain('Bring the grip force table back in line with the nine trials.')
    // Plan 7FEOshq3mBGG keeps machine paths in Developer mode.
    expect(html).not.toContain('src/grip/force.ts')
    const developer = renderToStaticMarkup(h(WorkingReading, { reading: oneAgentAtWork(), inspect: true }))
    expect(developer).toContain('src/grip/force.ts')
    expect(html).toContain('1 overlap with another writer changing the same thing')
    expect(html).toContain('data-conflicts="yes"')
  })

  it('keeps the machinery out of Normal and puts it in Developer', () => {
    const calm = renderToStaticMarkup(h(WorkingReading, { reading: oneAgentAtWork(), inspect: false }))
    const developer = renderToStaticMarkup(h(WorkingReading, { reading: oneAgentAtWork(), inspect: true }))
    // Section 21: the resolver, the provider session, the machine and the endpoints belong behind
    // Developer. Normal mode gets the words a person acts on.
    expect(calm).not.toContain('Provider session')
    expect(calm).not.toContain('Path resolver')
    expect(developer).toContain('Provider session')
    expect(developer).toContain('Path resolver')
  })
})
