// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO DOOR WRITES A STORED CONTEXT THE START-UP GATE WOULD REFUSE TO SERVE OVER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A TEST AND NOT A PREFERENCE ABOUT SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * `countOldShapes` in src/server/db/contexts-to-regions.ts counts two kinds of row, over the three
 * carriers a context is stored in:
 *
 *     JOB ONE  a context that names a target and carries no place
 *     JOB TWO  a context whose target names a part of a report by one of its three old spellings —
 *              `reportBlock`, `tableRow`, `tableCell`
 *
 * and `prepareToServe` in src/server/db/migrate.ts REFUSES TO SERVE a database holding either:
 * bringing it up to date would write, and a server start may not write. Under `tsx watch` the next
 * start is the next time anybody saves a server file, so one ordinary write through one ordinary
 * door leaves Mole Office unable to come up until somebody migrates by hand. That is problem
 * XFT0NENMhPfz and it has taken the live corpus down twice.
 *
 * So the criterion is not "the shape is tidier this way". It is: after every door has been written
 * through, WITH EVERY KIND OF TARGET THE VOCABULARY ALLOWS, a server may still start on the result.
 *
 * THIS FILE WAS `no-door-writes-a-context-without-a-place.test.ts` AND COVERED JOB ONE ONLY. It
 * drove every door with a region target and never sent one of the three old spellings, so the half
 * of the problem that a right-click could still reach had no test at all. The old name is what
 * allowed that: it named one of the two rows the gate counts.
 *
 * ---------------------------------------------------------------------------------------
 * THE DOORS, MEASURED RATHER THAN LISTED FROM MEMORY
 * ---------------------------------------------------------------------------------------
 *
 * Measured on a copy of the live corpus on 31 August 2026, each with a REGION target and no place,
 * which is what the browser sends when somebody points at a part of a record page:
 *
 *     POST /api/reviews                            stored an entry with no place
 *     POST /api/records            (annotation)    stored a context with no place
 *     POST /api/agent/threads/:id/messages         stored a context with no place
 *     POST /api/records/:id/revisions/:seq/restore REMOVED the place from a comment that had one
 *
 * and a server started on that copy refused: *give 3 stored context(s) the place they point at*.
 * The fourth is the one nothing had named: an old revision written before places is put back
 * verbatim, so the restore un-completes a row that was already complete.
 *
 * THE PATCH DOORS ARE HERE TOO, because a rule enforced on the create path and not the patch path
 * is not a rule — this repository's own words, in src/server/lib/records.ts.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, theOfficesKeyHeader, apiApp, fakeTranscript, freshDb, type TestDb } from './helpers.ts'
import { countOldShapes, OLD_PART_KINDS } from '../src/server/db/contexts-to-regions.ts'
import { prepareToServe, previewMigration } from '../src/server/db/migrate.ts'
import {
  TARGET_KINDS,
  WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY,
  WHY_A_DRAFT_IS_NOT_ON_THE_SERVER,
  type Target,
  type TargetKind,
} from '../src/shared/targets.ts'
import { SURFACE_IDS } from '../src/shared/surfaces.ts'
import { operationNamed } from '../src/shared/ops.ts'
import { ROUND_SEVEN_ENDED } from '../src/server/db/review-migration.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MIGRATIONS = join(fileURLToPath(new URL('..', import.meta.url)), 'drizzle')

const WORKSPACE = 'default'
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
/**
 * What `tools/agent-worker.mjs` sends: agent headers and NO project header on any of its four
 * requests. A worker serves a machine, not a project, and the answer walk below is that worker.
 */
const WORKER = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office-agent-worker' }

/**
 * A part of Mole Office's own screen, taken off the registry rather than typed out. A name written
 * here would be a second copy of one of those names, and the one that went stale would be this one.
 */
const A_SURFACE = SURFACE_IDS[0] ?? ''

let t: TestDb
let app: FastifyInstance
/** What this server really serves, asked of the server. Never a list typed into a test. */
let listRoutes: () => readonly ApiRoute[]

/**
 * THE HOME DIRECTORY THIS FILE RUNS UNDER, made here and removed at the end.
 *
 * The sweep of every write door at the end of this file presses `POST /api/office/install-the-entry`
 * as the person, and that press takes no body, so it writes: a skill link and three hook lines, into
 * `os.homedir()`, which is `$HOME`. Until 22 September 2026 this file never moved `HOME`, so every
 * whole suite run on the host wrote into the owner's own `~/.claude`. Run from the owner's checkout, it wrote
 * what was already there and nobody saw it. Run by the merge queue from a clone at 14:20 that day,
 * it pointed the owner's two hooks and the owner's skill link at the clone (acceptance finding 20). Set before the
 * first case and put back after the last, the way tests/local-only-routes.test.ts does it.
 */
let scratchHome: string
let originalHome: string | undefined

beforeAll(() => {
  originalHome = process.env.HOME
  scratchHome = mkdtempSync(join(tmpdir(), 'mole-office-every-door-home-'))
  process.env.HOME = scratchHome
})

afterAll(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  rmSync(scratchHome, { recursive: true, force: true })
})

beforeEach(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

async function aReport(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: 'What the bench said',
      data: { blocks: [{ id: 'b-1', type: 'text', text: 'The mount tolerance is 0.2 mm and nobody measured it.' }] },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** A part of a record page, with NO place — what the composer sends when somebody points at one. */
const atARegion = (recordId: string, regionId = 'data.blocks[#b-1]'): unknown => ({
  target: { kind: 'region', recordId, regionId },
})

/**
 * The number the start-up gate counts, BOTH ROWS IT COUNTS ADDED TOGETHER. Zero is the only value
 * that lets a server start, and it is one number here because it is one refusal there: a row with
 * no place and a row naming an old spelling stop the server in exactly the same way.
 */
const pending = (): number => {
  const held = countOldShapes(t.client.sqlite)
  return held.jobOne + held.jobTwo
}

describe('no door stores a context that names a target and carries no place', () => {
  it('the review door: starting a review at a part of a record page', async () => {
    const report = await aReport()
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HUMAN,
      payload: { entry: atARegion(report) },
    })
    expect(started.statusCode, started.body).toBe(201)

    const entry = (started.json() as { review: { entry: { place?: { at: string } } } }).review.entry
    expect(entry.place, 'the entry it answers with').toEqual({ at: 'surface' })
    expect(pending(), 'rows the start-up gate would count').toBe(0)
    // 60 SECONDS, NOT 5. Whichever case runs first in this file takes about 5 seconds longer than it
    // does later (measured 25 September 2026). In a run of the whole file this case is first, so on a
    // busy machine it went past 5 seconds. A timeout here says nothing about the gate.
  }, 60_000)

  it('the comment door, on create and on patch', async () => {
    const report = await aReport()
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'annotation', title: 'on the block', data: { body: 'Which run is this?', context: atARegion(report) } },
    })
    expect(written.statusCode, written.body).toBe(201)
    const id = (written.json() as { record: { id: string } }).record.id
    expect(pending(), 'after the create').toBe(0)

    // AND THE PATCH DOOR, pointing the same comment somewhere else with no place again. The whole
    // `data` and not a `dataPatch`, because a merge patch would leave the old target's `regionId`
    // beside the new target's keys — which the shape refuses, and which is a different test.
    const moved = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: {
        data: {
          body: 'Which run is this?',
          context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } },
        },
      },
    })
    expect(moved.statusCode, moved.body).toBe(200)
    expect(pending(), 'after the patch').toBe(0)
  })

  it('the message door, on create and on patch', async () => {
    const report = await aReport()
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'about the bench', mode: 'direct' },
    })
    expect(thread.statusCode, thread.body).toBe(201)
    const threadId = (thread.json() as { thread: { id: string } }).thread.id

    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Which run is this?', context: atARegion(report) },
    })
    expect(said.statusCode, said.body).toBe(201)
    const messageId = (said.json() as { message: { id: string } }).message.id
    expect(pending(), 'after the message').toBe(0)

    const repointed = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${messageId}`,
      headers: HUMAN,
      payload: { context: { target: { kind: 'record', recordId: report, workspaceId: WORKSPACE } } },
    })
    expect(repointed.statusCode, repointed.body).toBe(200)
    expect(pending(), 'after the patch').toBe(0)
  })

  it('the restore door: putting back a revision written before places existed', async () => {
    const report = await aReport()
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'annotation', title: 'on the block', data: { body: 'Which run is this?', context: atARegion(report) } },
    })
    expect(written.statusCode, written.body).toBe(201)
    const id = (written.json() as { record: { id: string } }).record.id

    // A SECOND REVISION, so there is an earlier one to put back.
    const again = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'Which run is this, and who ran it?' } },
    })
    expect(again.statusCode, again.body).toBe(200)

    const back = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/1/restore`,
      headers: HUMAN,
      payload: {},
    })
    expect(back.statusCode, back.body).toBe(200)
    expect(pending(), 'after the restore').toBe(0)
  })

  it('AND A SERVER CAN STILL START ON WHAT ALL OF THEM WROTE', async () => {
    // The whole point, asked the way a server start asks it. Every door above, into one database.
    const report = await aReport()
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'about the bench', mode: 'direct' },
    })
    const threadId = (thread.json() as { thread: { id: string } }).thread.id
    await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Which run is this?', context: atARegion(report) },
    })
    await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'annotation', title: 'on the block', data: { body: 'And this one?', context: atARegion(report) } },
    })
    await app.inject({ method: 'POST', url: '/api/reviews', headers: HUMAN, payload: { entry: atARegion(report) } })

    const decision = prepareToServe(t.client.sqlite, MIGRATIONS)
    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)
    if (decision.serve) expect(decision.report).not.toContain('REFUSING')
  })
})

describe('a span sent with no place is moved into the place, and nothing is invented', () => {
  it('keeps the four values of the span exactly, in the field a place lives in', async () => {
    const report = await aReport()
    const quote = 'mount tolerance'
    const text = 'The mount tolerance is 0.2 mm and nobody measured it.'
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'annotation',
        title: 'on the words',
        data: {
          body: 'Which run is this?',
          context: {
            target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b-1]' },
            span: { quote, from: text.indexOf(quote), to: text.indexOf(quote) + quote.length, field: 'data.blocks[#b-1].text' },
          },
        },
      },
    })
    expect(written.statusCode, written.body).toBe(201)
    const context = (written.json() as { record: { data: { context: Record<string, unknown> } } }).record.data.context
    expect(context['place']).toEqual({
      at: 'words',
      span: { quote, from: text.indexOf(quote), to: text.indexOf(quote) + quote.length, field: 'data.blocks[#b-1].text' },
    })
    // AND THE SPAN IS NOT LEFT BESIDE IT. `checkPlace` refuses that pair, so a row carrying both is
    // a row this server would not accept back.
    expect(context['span'], 'a span left beside the place').toBeUndefined()
    expect(pending()).toBe(0)
  })

  it('still refuses a caller that sends both, rather than quietly merging them', async () => {
    const report = await aReport()
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'annotation',
        title: 'both',
        data: {
          body: 'Which run is this?',
          context: {
            target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b-1]' },
            span: { quote: 'mount', from: 4, to: 9 },
            place: { at: 'surface' },
          },
        },
      },
    })
    expect(written.statusCode).toBe(400)
    expect(written.body).toContain('one field, not two')
  })
})

// ------------------------------------------------- every kind of target, through every door

/**
 * EVERY KIND OF THING A PERSON CAN POINT AT, THROUGH EVERY DOOR, AND THEN A SERVER START.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS COVERS THAT THE TESTS ABOVE DID NOT
 * ---------------------------------------------------------------------------------------
 *
 * The tests above drive every door with a REGION target. That is one of seventeen kinds, and it is
 * the one the doors already handled. The three the gate refuses over — `reportBlock`, `tableRow`,
 * `tableCell` — were never sent through any door by any test, so the half of problem XFT0NENMhPfz
 * that a right-click could still reach had nothing watching it. Measured on 31 August 2026 before
 * the fix: a right-click on a report block, "Start a review from here", twice, and the server
 * exited 1 at the next start.
 *
 * ---------------------------------------------------------------------------------------
 * THE MAP IS TOTAL, WHICH IS WHAT MAKES IT A GUARD RATHER THAN A LIST
 * ---------------------------------------------------------------------------------------
 *
 * `A_REAL_ONE` below has one arm per `TargetKind`, so an eighteenth kind does not compile until
 * somebody has said how to write one and what the doors should do with it. A list of the kinds
 * somebody remembered would go stale the first time the vocabulary grew, and the failure would be
 * silent: the new kind would simply never be driven.
 *
 * Three kinds name things Mole Office does not store, and each says so with the sentence the server
 * refuses with rather than being left out. A kind that cannot be written is still covered: the
 * thing being proved is that the door does not store one, and a refusal is how that is met.
 */

/** The things a door needs an id of, made once for the whole walk. */
interface Fixtures {
  report: string
  plan: string
  line: string
  window: string
  message: string
  annotation: string
  change: string
}

/**
 * A target a door may be given, and — when Mole Office cannot look that kind of thing up — the
 * words it refuses one with.
 *
 * A REFUSED KIND STILL CARRIES A REAL TARGET, because the door has to be given the thing it will
 * refuse. Sending the same made-up target for all three would test one refusal three times.
 */
type Sendable = { target: Target; refused?: string }

const A_REAL_ONE: { [K in TargetKind]: (f: Fixtures) => Sendable } = {
  record: (f) => ({ target: { kind: 'record', recordId: f.report, workspaceId: WORKSPACE } }),
  plan: (f) => ({ target: { kind: 'plan', planId: f.plan } }),
  reportBlock: (f) => ({ target: { kind: 'reportBlock', recordId: f.report, blockId: 'b-1' } }),
  region: (f) => ({ target: { kind: 'region', recordId: f.report, regionId: 'data.blocks[#b-1]' } }),
  change: (f) => ({ target: { kind: 'change', recordId: f.report, changeId: f.change } }),
  tableRow: (f) => ({ target: { kind: 'tableRow', recordId: f.report, blockId: 'b-2', rowKey: '2' } }),
  tableCell: (f) => ({
    target: { kind: 'tableCell', recordId: f.report, blockId: 'b-2', rowKey: '2', columnKey: '1' },
  }),
  planLine: (f) => ({ target: { kind: 'planLine', planId: f.plan, lineId: f.line } }),
  planLineFact: (f) => ({ target: { kind: 'planLineFact', planId: f.plan, lineId: f.line, fact: 'time' } }),
  scheduleBlock: (f) => ({ target: { kind: 'scheduleBlock', windowId: f.window } }),
  // The three Mole Office cannot look up. Two of the sentences are the shared constants, so a
  // rewording is one edit rather than three; `graphNode` has none because its reason is about that
  // one kind.
  graphNode: (f) => ({
    target: { kind: 'graphNode', recordId: f.report, drawing: 'plan-graph' },
    refused: 'which drawing a node is in',
  }),
  agentMessage: (f) => ({ target: { kind: 'agentMessage', messageId: f.message } }),
  annotation: (f) => ({ target: { kind: 'annotation', annotationId: f.annotation } }),
  proposedAction: () => ({
    target: { kind: 'proposedAction', interpretationId: 'i1', actionId: 'a-1' },
    refused: WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY,
  }),
  draft: () => ({ target: { kind: 'draft', draftId: 'd1' }, refused: WHY_A_DRAFT_IS_NOT_ON_THE_SERVER }),
  uiSurface: () => ({ target: { kind: 'uiSurface', surfaceId: A_SURFACE } }),
  page: () => ({ target: { kind: 'page', route: '/records' } }),
}

/** Everything the walk needs, made through the ordinary doors so nothing is written behind them. */
async function everythingToPointAt(): Promise<Fixtures> {
  const written = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'report',
      title: 'What the bench said',
      data: {
        blocks: [
          { id: 'b-1', type: 'text', text: 'The mount tolerance is 0.2 mm and nobody measured it.' },
          {
            id: 'b-2',
            type: 'table',
            columns: [{ label: 'run' }, { label: 'reprojection error (px)', align: 'right' }],
            rows: [{ cells: ['before the knock', 0.4] }, { cells: ['after the knock', 1.9] }],
          },
        ],
      },
    },
  })
  expect(written.statusCode, written.body).toBe(201)
  const report = (written.json() as { record: { id: string } }).record.id

  // A CHANGE ROW, made by changing something. The ledger writes one row per changed field, so this
  // is the ordinary way one comes to exist and there is nothing to insert by hand.
  const changed = await app.inject({
    method: 'PATCH',
    url: `/api/records/${report}`,
    headers: HUMAN,
    payload: { summary: 'The mount tolerance was never measured.' },
  })
  expect(changed.statusCode, changed.body).toBe(200)
  const change = t.client.sqlite
    .prepare('SELECT id FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1')
    .pluck()
    .get(report) as string | undefined
  expect(change, 'the patch above wrote no change row, so nothing here points at one').toBeDefined()

  const plan = await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: HUMAN,
    payload: { title: 'This week', body: 'Re-measure the mount' },
  })
  expect(plan.statusCode, plan.body).toBe(201)
  const planned = plan.json() as { plan: { id: string }; lines: { id: string }[] }
  const line = planned.lines[0]
  expect(line, 'the plan came back with no lines to point at').toBeDefined()

  // A SPAN OF THE SCHEDULE IS ABOUT WORK, and a report is writing about work rather than the work
  // itself — the schedule says so in its own refusal. So the window is placed on a task.
  const task = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'task', title: 'Re-measure the mount' },
  })
  expect(task.statusCode, task.body).toBe(201)
  const window = await app.inject({
    method: 'POST',
    url: '/api/planning/windows',
    headers: HUMAN,
    payload: {
      recordId: (task.json() as { record: { id: string } }).record.id,
      startsOn: '2026-09-01',
      endsOn: '2026-09-02',
    },
  })
  expect(window.statusCode, window.body).toBe(201)

  const thread = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: HUMAN,
    payload: { title: 'about the bench', mode: 'direct' },
  })
  expect(thread.statusCode, thread.body).toBe(201)
  const said = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${(thread.json() as { thread: { id: string } }).thread.id}/messages`,
    headers: HUMAN,
    payload: { intent: 'ask', body: 'Which run is this?' },
  })
  expect(said.statusCode, said.body).toBe(201)

  const comment = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'annotation',
      title: 'on the block',
      data: { body: 'Which run is this?', context: atARegion(report) },
    },
  })
  expect(comment.statusCode, comment.body).toBe(201)

  return {
    report,
    plan: planned.plan.id,
    line: line?.id ?? '',
    window: (window.json() as { window: { id: string } }).window.id,
    message: (said.json() as { message: { id: string } }).message.id,
    annotation: (comment.json() as { record: { id: string } }).record.id,
    change: change ?? '',
  }
}

/** What one door did with one target: the code it answered and the context it stored, if any. */
interface Went {
  status: number
  body: string
  stored: { target: { kind: string; regionId?: string }; place?: { at: string } } | null
}

/**
 * THE DOORS. Every write path that stores a context, each driven with a target it is handed.
 *
 * A door is here because it WRITES one of the three carriers `countOldShapes` reads. The patch
 * doors are here for the reason src/server/lib/records.ts gives: a rule enforced on the create path
 * and not the patch path is not a rule.
 *
 * EACH DOOR IS GIVEN ITS OWN WRITER — the owner's id, a hyphen and the kind — because two reviews started by one person at
 * the same scope are one review by design, so the second press comes back with the first review and
 * writes nothing. That would leave a kind never actually stored while the walk still went green.
 */
const DOORS: { name: string; go: (target: Target, who: string, f: Fixtures) => Promise<Went> }[] = [
  {
    name: 'POST /api/reviews',
    go: async (target, who) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/reviews',
        headers: { ...HUMAN, 'x-mole-office-actor-id': who },
        payload: { entry: { target } },
      })
      const stored =
        res.statusCode === 201 ? (res.json() as { review: { entry: Went['stored'] } }).review.entry : null
      return { status: res.statusCode, body: res.body, stored }
    },
  },
  {
    name: 'POST /api/records (a comment)',
    go: async (target, who) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/records',
        headers: { ...HUMAN, 'x-mole-office-actor-id': who },
        payload: { kind: 'annotation', title: 'on it', data: { body: 'Which run is this?', context: { target } } },
      })
      const stored =
        res.statusCode === 201
          ? (res.json() as { record: { data: { context: Went['stored'] } } }).record.data.context
          : null
      return { status: res.statusCode, body: res.body, stored }
    },
  },
  {
    name: 'PATCH /api/records/:id (a comment, pointed somewhere else)',
    go: async (target, who, f) => {
      const made = await app.inject({
        method: 'POST',
        url: '/api/records',
        headers: { ...HUMAN, 'x-mole-office-actor-id': who },
        payload: {
          kind: 'annotation',
          title: 'on it',
          data: { body: 'Which run is this?', context: atARegion(f.report) },
        },
      })
      expect(made.statusCode, made.body).toBe(201)
      const id = (made.json() as { record: { id: string } }).record.id
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/records/${id}`,
        headers: { ...HUMAN, 'x-mole-office-actor-id': who },
        payload: { data: { body: 'Which run is this?', context: { target } } },
      })
      const stored =
        res.statusCode === 200
          ? (res.json() as { record: { data: { context: Went['stored'] } } }).record.data.context
          : null
      return { status: res.statusCode, body: res.body, stored }
    },
  },
  {
    name: 'POST /api/agent/threads/:id/messages',
    // WRITTEN AS THE OWNER, whose conversations these are. A person no registry holds is a party to no
    // conversation, not even one it started, and since round 8 the write doors refuse it as the reads do
    // . Each call starts a conversation of its own, so one writer is enough here.
    go: async (target) => {
      const thread = await app.inject({
        method: 'POST',
        url: '/api/agent/threads',
        headers: HUMAN,
        payload: { title: 'about the bench', mode: 'direct' },
      })
      expect(thread.statusCode, thread.body).toBe(201)
      const res = await app.inject({
        method: 'POST',
        url: `/api/agent/threads/${(thread.json() as { thread: { id: string } }).thread.id}/messages`,
        headers: HUMAN,
        payload: { intent: 'ask', body: 'Which run is this?', context: { target } },
      })
      const stored =
        res.statusCode === 201 ? (res.json() as { message: { context: Went['stored'] } }).message.context : null
      return { status: res.statusCode, body: res.body, stored }
    },
  },
  {
    name: 'PATCH /api/agent/messages/:id',
    // WRITTEN AS THE OWNER, for the reason the door above is.
    go: async (target, _who, f) => {
      const thread = await app.inject({
        method: 'POST',
        url: '/api/agent/threads',
        headers: HUMAN,
        payload: { title: 'about the bench', mode: 'direct' },
      })
      expect(thread.statusCode, thread.body).toBe(201)
      const said = await app.inject({
        method: 'POST',
        url: `/api/agent/threads/${(thread.json() as { thread: { id: string } }).thread.id}/messages`,
        headers: HUMAN,
        payload: { intent: 'ask', body: 'Which run is this?', context: atARegion(f.report) },
      })
      expect(said.statusCode, said.body).toBe(201)
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/agent/messages/${(said.json() as { message: { id: string } }).message.id}`,
        headers: HUMAN,
        payload: { context: { target } },
      })
      const stored =
        res.statusCode === 200 ? (res.json() as { message: { context: Went['stored'] } }).message.context : null
      return { status: res.statusCode, body: res.body, stored }
    },
  },
]

/**
 * The three spellings the gate refuses over, from the file that counts them, so this file cannot
 * hold a fourth-hand copy of that list.
 */
const OLD_SPELLINGS: readonly string[] = OLD_PART_KINDS

/** What the three old spellings above are stored as, once the door has spelled them the one way. */
const THE_SAME_PART: Partial<Record<TargetKind, string>> = {
  reportBlock: 'data.blocks[#b-1]',
  tableRow: 'data.blocks[#b-2].rows[1]',
  tableCell: 'data.blocks[#b-2].rows[1].cells[0]',
}

/**
 * THE PAIRS A DOOR REFUSES FOR A RULE OF ITS OWN, rather than because Mole Office cannot look the
 * thing up. Measured by running the walk below on 31 August 2026; both are the review door.
 *
 * A review's scope is worked out from what it was started at, and neither of these gives one: a
 * part of Mole Office's own screen is on every page, and so is a page in the sense that matters —
 * the door's own words are *a review of a part of the screen would be a review of every page it is
 * on, which is the whole project*. Both refuse and store nothing, which meets this criterion the
 * other honest way.
 *
 * IT IS LISTED SO THAT A DOOR CANNOT QUIETLY START REFUSING MORE. A walk that stored nothing at all
 * would otherwise pass: no row stored is no row the gate counts.
 */
const REFUSED_BY_A_DOORS_OWN_RULE = ['page @ POST /api/reviews', 'uiSurface @ POST /api/reviews']

describe('every kind of target, through every door, and a server still starts', () => {
  it('really walks the whole vocabulary, so a walk that found nothing cannot pass quietly', () => {
    // The map is total over `TargetKind`, so this cannot disagree with the vocabulary — it is here
    // because a walk over an empty list looks exactly like eighty agreements.
    expect(Object.keys(A_REAL_ONE).length).toBe(TARGET_KINDS.length)
    for (const kind of TARGET_KINDS) expect(A_REAL_ONE, `the vocabulary gained ${kind}`).toHaveProperty(kind)
    // Every door that stores a context. The restore door is the sixth and is driven on its own,
    // below, because it needs a revision written before the door converted anything.
    expect(DOORS.length).toBe(5)
  })

  it('stores nothing the start-up gate counts, whatever is pointed at and whichever door it comes through', async () => {
    const f = await everythingToPointAt()
    expect(pending(), 'the fixtures themselves').toBe(0)

    const went: string[] = []
    const refusals: string[] = []
    const wrong: string[] = []
    for (const kind of TARGET_KINDS) {
      const sendable = A_REAL_ONE[kind](f)
      for (const door of DOORS) {
        const who = `${THE_TEST_OFFICES_OWNER.id}-${kind}`
        if (sendable.refused !== undefined) {
          // A KIND MOLE OFFICE CANNOT LOOK UP IS REFUSED AT EVERY DOOR, and the refusal says what is
          // missing. That is the other honest way to meet this criterion, and it has to be the same
          // answer at every door or one door stores what another refuses.
          const res = await door.go(sendable.target, who, f)
          expect(res.status, `${door.name} took a ${kind}: ${res.body}`).toBe(400)
          expect(res.body, `what ${door.name} said about a ${kind}`).toContain(sendable.refused)
          refusals.push(`${kind} @ ${door.name}`)
          continue
        }
        const res = await door.go(sendable.target, who, f)
        // A DOOR MAY HAVE A RULE OF ITS OWN, AND A REFUSAL IS A SAFE ANSWER: nothing is stored, so
        // nothing arms the gate. What is never allowed is the server falling over, which is what a
        // 5xx is. `REFUSED_BY_A_DOORS_OWN_RULE` below names every refusal this walk expects, so a
        // door that quietly starts refusing everything cannot pass as a clean walk.
        expect(res.status, `${door.name} fell over on a ${kind}: ${res.body}`).toBeLessThan(500)
        if (res.status >= 300) {
          refusals.push(`${kind} @ ${door.name}`)
          continue
        }
        expect(res.stored, `${door.name} stored nothing for a ${kind}`).not.toBeNull()
        // EVERY STORED ROW CARRIES A PLACE AND NAMES NO OLD SPELLING. Asked of the row that came
        // back rather than of the count alone, so a door that answered 200 and wrote to the wrong
        // column is not covered by another door's clean row.
        //
        // COLLECTED RATHER THAN ASSERTED HERE, so that the walk finishes and the server start below
        // is reached. Failing on the first bad row would leave the criterion itself — can a server
        // still start on all of this — never asked.
        if (res.stored?.place === undefined) wrong.push(`${door.name} stored a ${kind} with no place`)
        if (OLD_SPELLINGS.includes(res.stored?.target.kind ?? '')) {
          wrong.push(`${door.name} stored a ${kind} by its old name, ${res.stored?.target.kind ?? ''}`)
        }
        went.push(`${kind} @ ${door.name}`)
      }
    }

    // THE WALK REALLY RAN, and these are the counts that say so rather than the absence of a
    // failure. Every refusal is named, so a door that starts refusing a kind it used to store shows
    // up here as a difference rather than as a walk that quietly stored less.
    expect(went.length + refusals.length).toBe(TARGET_KINDS.length * DOORS.length)
    // WHAT IS EXPECTED TO BE REFUSED, DERIVED. The three kinds Mole Office cannot look up are
    // refused at every door — read off the map rather than counted out here, so a kind that becomes
    // resolvable moves this number on its own — plus the two rules a door has of its own.
    const cannotBeLookedUp = TARGET_KINDS.filter((kind) => A_REAL_ONE[kind](f).refused !== undefined)
    const expected = [
      ...cannotBeLookedUp.flatMap((kind) => DOORS.map((door) => `${kind} @ ${door.name}`)),
      ...REFUSED_BY_A_DOORS_OWN_RULE,
    ]
    // Compared as one string so a difference is readable: a list of eighty pairs printed as an
    // array says "expected [ …(17) ] to deeply equal [ …(15) ]" and names neither.
    expect(refusals.sort().join('\n')).toBe(expected.sort().join('\n'))
    // AND THE OTHER SIDE OF THE SAME COUNT: most of the walk really stored something.
    expect(went.length, 'pairs that stored a row').toBe(TARGET_KINDS.length * DOORS.length - expected.length)

    // AND THE WHOLE POINT, ASKED THE WAY A SERVER START ASKS IT. Said before the row-by-row list
    // below, because this is the criterion and those are the reasons.
    expect(pending(), 'rows the start-up gate would count after all of that').toBe(0)
    const decision = prepareToServe(t.client.sqlite, MIGRATIONS)
    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)
    if (decision.serve) expect(decision.report).not.toContain('REFUSING')
    expect(wrong, wrong.join(' | ')).toEqual([])
  })

  it('stores a block, a row and a cell of a report as the part of that record they name', async () => {
    // THE CONVERSION IS VISIBLE TO WHOEVER WROTE IT. The row that was stored is what the door hands
    // back, so nobody is told one thing and given another — which is the difference between
    // converting at the door and a silent rewrite.
    const f = await everythingToPointAt()
    for (const kind of ['reportBlock', 'tableRow', 'tableCell'] as const) {
      const sendable = A_REAL_ONE[kind](f)
      expect(sendable.refused, `${kind} is refused rather than stored`).toBeUndefined()
      for (const door of DOORS) {
        const res = await door.go(sendable.target, `${THE_TEST_OFFICES_OWNER.id}-${kind}-again`, f)
        expect(res.status, `${door.name} took a ${kind}: ${res.body}`).toBeLessThan(300)
        expect(res.stored?.target.kind, `${door.name} stored a ${kind} as`).toBe('region')
        expect(res.stored?.target.regionId, `${door.name} stored a ${kind} at`).toBe(THE_SAME_PART[kind])
      }
    }
    expect(pending()).toBe(0)
    expect(prepareToServe(t.client.sqlite, MIGRATIONS).serve).toBe(true)
  })

  it('the restore door: putting back a comment written before the door spelled it this way', async () => {
    // THE ONE DOOR THAT CAN ARM THE GATE WITHOUT ANYBODY SENDING AN OLD SPELLING. A revision holds
    // what the record held, and a revision written before this change holds a `reportBlock`. Putting
    // it back writes it into `records.data` again, which is the row the gate counts.
    //
    // The old revision is written straight into the ledger, because no door will write one any more
    // — which is the point of the fix and would otherwise make this case untestable.
    const f = await everythingToPointAt()
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'annotation',
        title: 'on the block',
        data: { body: 'Which run is this?', context: atARegion(f.report) },
      },
    })
    expect(made.statusCode, made.body).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id

    const before = t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id = ? AND seq = 1').pluck().get(id) as string
    const old = JSON.parse(before) as Record<string, unknown>
    old['context'] = { target: { kind: 'reportBlock', recordId: f.report, blockId: 'b-1' } }
    t.client.sqlite.prepare('UPDATE revisions SET data = ? WHERE record_id = ? AND seq = 1').run(JSON.stringify(old), id)

    // A SECOND REVISION, so there is an earlier one to put back.
    const again = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: HUMAN,
      payload: { dataPatch: { body: 'Which run is this, and who ran it?' } },
    })
    expect(again.statusCode, again.body).toBe(200)

    const back = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/1/restore`,
      headers: HUMAN,
      payload: {},
    })
    expect(back.statusCode, back.body).toBe(200)
    // WHAT THE RECORD NOW HOLDS, read back from the record. A restore answers with what it moved
    // and not with the record, so asking the reply would be asking the wrong thing.
    const now = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
    expect(now.statusCode, now.body).toBe(200)
    const context = (now.json() as { record: { data: { context: { target: { kind: string; regionId?: string } } } } })
      .record.data.context
    expect(context.target.kind, 'what the restore put back').toBe('region')
    expect(context.target.regionId).toBe('data.blocks[#b-1]')
    expect(pending(), 'after the restore').toBe(0)
    expect(prepareToServe(t.client.sqlite, MIGRATIONS).serve).toBe(true)
  })
})

// -------------------------------------------------- and who a comment is FOR, through every door

/**
 * CHOOSING WHO A COMMENT IS FOR DOES NOT ARM THE START-UP GATE EITHER.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND HALF OF THE SAME PROBLEM, AND IT WAS THE ONE WITH NO TEST
 * ---------------------------------------------------------------------------------------
 *
 * Everything above drives what a comment is ABOUT. This drives who it is FOR, and until 31 August
 * 2026 nothing did. Measured that day on an isolated copy, through the ordinary routes:
 *
 *     POST /api/agent/threads                   201
 *     POST .../messages   (a region context)    201
 *     PATCH /api/agent/messages/<id>            200   recipient {"kind":"session","sessionId":…}
 *     prepareToServe                            REFUSING TO SERVE
 *
 * with three lines under *what a migration would do to it*: mint 1 durable agent identity out of
 * the 1 run something addressed, write 1 BASELINE and 1 CATCH-UP revision, and file 1 under the
 * durable identity their run worked as. Pressing Send added *bind 1 run(s)*. It was isolated: the
 * thread and the message alone were clean, and the recipient choice alone did it.
 *
 * THE GATE COUNTS SOMETHING DIFFERENT HERE, so these tests ask a different question. `pending()`
 * above counts stored contexts. Nothing about a recipient is a context, so `pending()` stays 0
 * through every one of these while `prepareToServe` refuses. The criterion is therefore the
 * decision itself, asked through `theServerWouldStart` below.
 *
 * AND A REFUSAL IS NOT THE WORST CASE HERE. A recipient naming a record that is not there, or
 * naming something that is not a run, made `prepareToServe` THROW — the identity migration refuses
 * a corpus whose choices point at nothing, and that refusal reaches a server start as a stack trace
 * rather than as the careful sentence an operator can act on. So the reader below catches, and a
 * throw is a failure with the message printed.
 */

/** A run Mole Office could really pick up again, so Send has somewhere to go. */
async function aResumableRun(title: string, externalId: string): Promise<string> {
  const logPath = fakeTranscript(externalId)
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: {
      kind: 'session',
      title,
      data: {
        state: 'idle',
        runtime: 'claude-code',
        extra: {
          discovered: {
            tool: 'claude-code',
            externalId,
            logPath,
            resumeCommand: `claude --resume ${externalId}`,
            observedState: 'idle',
            stateReason: 'its log last grew 40 minutes ago and a process still names it',
            filesTouched: [],
            filesComplete: true,
            at: '2026-08-17 09:00:00',
          },
        },
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/**
 * WHAT A SERVER START WOULD SAY ABOUT THIS DATABASE, in one line, and never a thrown stack.
 *
 * `SERVES` is the only answer that lets Mole Office come up. A refusal comes back with the lines
 * naming what a migration would write, because those are what a reader needs; a throw comes back
 * as `THREW`, because that is a worse answer than a refusal and must not read like one.
 */
function theServerWouldStart(): string {
  try {
    const decision = prepareToServe(t.client.sqlite, MIGRATIONS)
    if (decision.serve) return 'SERVES'
    const after = decision.refusal.split('What a migration would do to it:')[1] ?? decision.refusal
    return `REFUSES: ${(after.split('Take a copy')[0] ?? after).trim()}`
  } catch (err) {
    return `THREW: ${err instanceof Error ? err.message : String(err)}`
  }
}

describe('choosing who a comment is for leaves a database a server can still start on', () => {
  it('the message door, on create: a region context and a run in one write', async () => {
    const f = await everythingToPointAt()
    const run = await aResumableRun('Round ten run', 'ext-create')
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'about the bench', mode: 'direct' },
    })
    expect(thread.statusCode, thread.body).toBe(201)
    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${(thread.json() as { thread: { id: string } }).thread.id}/messages`,
      headers: HUMAN,
      payload: {
        intent: 'ask',
        body: 'Which run is this?',
        context: atARegion(f.report),
        recipient: { kind: 'session', sessionId: run },
      },
    })
    expect(said.statusCode, said.body).toBe(201)
    expect(theServerWouldStart()).toBe('SERVES')
  })

  it('the message door, on patch: the act the browser does, and the one that was measured refusing', async () => {
    const f = await everythingToPointAt()
    const run = await aResumableRun('Round ten run', 'ext-patch')
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'about the bench', mode: 'direct' },
    })
    const threadId = (thread.json() as { thread: { id: string } }).thread.id
    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Which run is this?', context: atARegion(f.report) },
    })
    expect(said.statusCode, said.body).toBe(201)
    expect(theServerWouldStart(), 'the thread and the message alone').toBe('SERVES')

    const chose = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${(said.json() as { message: { id: string } }).message.id}`,
      headers: HUMAN,
      payload: { recipient: { kind: 'session', sessionId: run } },
    })
    expect(chose.statusCode, chose.body).toBe(200)
    expect(theServerWouldStart(), 'after the recipient was chosen').toBe('SERVES')

    // AND THE RUN REALLY GOT ITS IDENTITY, which is the fact behind the decision above. Asked of the
    // rows rather than of the decision, so a gate that stopped counting would not pass this.
    const bound = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.ranAs') FROM records WHERE id = ?")
      .pluck()
      .get(run) as string | null
    expect(bound, 'the run says nothing about which agent it worked as').not.toBeNull()
    const agentId = (JSON.parse(bound ?? '[]') as { agentId?: string }[])[0]?.agentId
    expect(agentId, 'no durable identity was minted').toBeDefined()
    const filed = t.client.sqlite
      .prepare('SELECT recipient_agent_id FROM agent_messages WHERE recipient_session_id = ?')
      .pluck()
      .get(run) as string | null
    expect(filed, 'the message was not filed under the identity its run works as').toBe(agentId)
    // AND THE TWO RECORDS THE MINT WROTE EACH KEPT A REVISION, which is the second of the three
    // things the migration would otherwise have had to do.
    for (const id of [run, agentId ?? '']) {
      const revisions = t.client.sqlite
        .prepare('SELECT count(*) FROM revisions WHERE record_id = ?')
        .pluck()
        .get(id) as number
      expect(revisions, `${id} kept no revision`).toBeGreaterThan(0)
    }
  })

  it('the comment door: choosing a run for a comment somebody left on something', async () => {
    const f = await everythingToPointAt()
    const run = await aResumableRun('Round ten run', 'ext-comment')
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'annotation',
        title: 'on the block',
        data: { body: 'Which run is this?', context: atARegion(f.report) },
      },
    })
    expect(made.statusCode, made.body).toBe(201)
    const chose = await app.inject({
      method: 'PATCH',
      url: `/api/records/${(made.json() as { record: { id: string } }).record.id}`,
      headers: HUMAN,
      payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId: run } } },
    })
    expect(chose.statusCode, chose.body).toBe(200)
    expect(theServerWouldStart()).toBe('SERVES')

    // THE CHOICE IS STILL THE PERSON'S CHOICE. It says `session`, so sending it still picks that run
    // up where it left off; what was added is the identity behind it.
    const stored = (chose.json() as { record: { data: { chosenRecipient: Record<string, unknown> } } }).record.data
      .chosenRecipient
    expect(stored['kind']).toBe('session')
    expect(stored['sessionId']).toBe(run)
    expect(stored['agentId'], 'the comment was not filed under a durable identity').toEqual(expect.any(String))
  })

  it('AND THE WHOLE ACT, ENDING IN SEND: write, choose, send, and a server still starts', async () => {
    const f = await everythingToPointAt()
    const run = await aResumableRun('Round ten run', 'ext-send')
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'about the bench', mode: 'direct' },
    })
    const threadId = (thread.json() as { thread: { id: string } }).thread.id
    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Which run is this?', context: atARegion(f.report) },
    })
    expect(said.statusCode, said.body).toBe(201)
    const chose = await app.inject({
      method: 'PATCH',
      url: `/api/agent/messages/${(said.json() as { message: { id: string } }).message.id}`,
      headers: HUMAN,
      payload: { recipient: { kind: 'session', sessionId: run } },
    })
    expect(chose.statusCode, chose.body).toBe(200)

    const sent = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/dispatch`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: {},
    })
    expect(sent.statusCode, sent.body).toBe(201)
    expect((sent.json() as { sent: number }).sent, 'nothing actually went, so Send was never tested').toBe(1)
    expect(theServerWouldStart(), 'after Send').toBe('SERVES')

    // AND THE RUN THAT CARRIED IT IS BOUND. `bind N run(s)` was the fourth line Send added to the
    // refusal, and this is the row it was about.
    const boundTo = t.client.sqlite
      .prepare('SELECT agent_id FROM agent_runs WHERE recipient_session_id = ?')
      .pluck()
      .get(run) as string | null
    expect(boundTo, 'the run row names no durable identity').not.toBeNull()
  })

  /**
   * THE REVIEW PANE'S OWN FOUR STEPS, ENDING IN SEND — Collecting, Organise, Check, Send.
   *
   * THIS IS THE DOOR THAT TOOK MOLE OFFICE DOWN WITH NO WAY BACK, and nothing drove it. Everything
   * above sends a comment out of a conversation; the owner's review pane sends a REVIEW, and that
   * press creates a conversation of its own — `mode = 'review'`, named in `reviews.sent_thread_id`.
   *
   * Measured on an isolated copy on 31 August 2026: clean before the press, and after it
   *
   *     REFUSES: - reviews: bring 1 round-seven review-mode conversation forward into `reviews`
   *
   * because src/server/db/review-migration.ts asked whether any review named that conversation in
   * `from_thread_id`, and sending writes `sent_thread_id`. One fact — what a conversation belonging
   * to a review looks like — worked out in two places, free to disagree, and it failed at the next
   * restart rather than at the press.
   */
  it("AND THE REVIEW PANE'S FOURTH STEP: collect, organise, check, SEND, and a server still starts", async () => {
    const f = await everythingToPointAt()
    const run = await aResumableRun('Round ten run', 'ext-review-send')

    // ---- 1. COLLECTING. Started where somebody was standing: a part of a record page.
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HUMAN,
      payload: { entry: atARegion(f.report) },
    })
    expect(started.statusCode, started.body).toBe(201)
    const review = (started.json() as { review: { id: string } }).review.id
    expect(theServerWouldStart(), 'the review alone').toBe('SERVES')

    // A comment inside it, addressed to a run, written and chosen through the ordinary doors.
    const remark = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'annotation',
        title: 'on the block',
        data: { body: 'This number does not match the run log.', context: atARegion(f.report) },
      },
    })
    expect(remark.statusCode, remark.body).toBe(201)
    const comment = (remark.json() as { record: { id: string } }).record.id
    const chose = await app.inject({
      method: 'PATCH',
      url: `/api/records/${comment}`,
      headers: HUMAN,
      payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId: run } } },
    })
    expect(chose.statusCode, chose.body).toBe(200)

    const finished = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/finish-collecting`,
      headers: HUMAN,
    })
    expect(finished.statusCode, finished.body).toBe(200)
    // WHAT IT COLLECTED, READ BACK, and the reading below is written for exactly these. A list
    // typed out here would be a second answer to what the review contains, and organise refuses a
    // reading that misses one — which is the refusal that found this line.
    const collected = (finished.json() as { members: { id: string }[] }).members.map((one) => one.id)
    expect(collected, 'the review collected nothing, so Send below would have nothing to send').toContain(comment)

    // EVERY ONE OF THEM IS ADDRESSED, so the press below sends the whole review rather than part of
    // it. A review that held a comment back keeps its state, and this door has to be driven all the
    // way through to the end a person actually reaches.
    for (const id of collected) {
      const to = await app.inject({
        method: 'PATCH',
        url: `/api/records/${id}`,
        headers: HUMAN,
        payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId: run } } },
      })
      expect(to.statusCode, to.body).toBe(200)
    }

    // ---- 2. ORGANISE. The reading that came back, kept.
    const organised = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/organise`,
      headers: HUMAN,
      payload: {
        comments: collected.map((id) => ({
          commentId: id,
          reading: 'They are asking which of two numbers was measured.',
          intents: ['ask'],
          artefacts: ['problem'],
        })),
        groups: [],
      },
    })
    expect(organised.statusCode, organised.body).toBe(200)
    expect(theServerWouldStart(), 'after organising').toBe('SERVES')

    // ---- 3. CHECK. Where every comment would go, which is what the pane draws before the press.
    const plan = await app.inject({ method: 'GET', url: `/api/reviews/${review}/send`, headers: HUMAN })
    expect(plan.statusCode, plan.body).toBe(200)
    expect(
      (plan.json() as { comments: { willGo: boolean }[] }).comments.some((one) => one.willGo),
      'nothing would go, so the press below would refuse and Send would never be tested',
    ).toBe(true)

    // ---- 4. SEND. The press itself.
    const sent = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/send`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: { to: [] },
    })
    expect(sent.statusCode, sent.body).toBe(200)
    const reply = sent.json() as { sent: number; threadId: string; held: unknown[]; review: { review: { state: string } } }
    expect(reply.sent, 'nothing actually went, so Send was never tested').toBe(collected.length)
    expect(reply.held, 'something stayed behind, so this is not the whole press').toEqual([])
    expect(reply.review.review.state, 'the review did not end up sent').toBe('sent')

    // THE PRESS REALLY MADE A CONVERSATION OF ITS OWN, which is the row the gate used to count.
    // Asked of the row rather than of the decision, so a Send that stopped making one — and would
    // therefore pass the line below for the wrong reason — shows up here.
    const mode = t.client.sqlite
      .prepare('SELECT mode FROM agent_threads WHERE id = ?')
      .pluck()
      .get(reply.threadId) as string | undefined
    expect(mode, 'the conversation Send named is not in the database').toBe('review')
    const named = t.client.sqlite
      .prepare('SELECT id FROM reviews WHERE sent_thread_id = ?')
      .pluck()
      .get(reply.threadId) as string | undefined
    expect(named, 'no review names the conversation Send wrote into').toBe(review)

    // AND THE WHOLE POINT. This is the line that was red.
    expect(theServerWouldStart(), 'after Send').toBe('SERVES')
  })

  it('a choice nothing durable can stand behind is kept as words, and never stored as a run', async () => {
    // BOTH OF THESE MADE A SERVER START THROW rather than refuse, which is worse: the identity
    // migration refuses a whole corpus over a choice pointing at a run that is not there.
    const f = await everythingToPointAt()
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'about the bench', mode: 'direct' },
    })
    const threadId = (thread.json() as { thread: { id: string } }).thread.id

    for (const [what, sessionId] of [
      ['a record that is not there', 'nosuchrecid'],
      ['a record that is not a run', f.report],
    ] as const) {
      const said = await app.inject({
        method: 'POST',
        url: `/api/agent/threads/${threadId}/messages`,
        headers: HUMAN,
        payload: {
          intent: 'ask',
          body: 'Which run is this?',
          recipient: { kind: 'session', sessionId, said: 'whoever ran the calibration' },
        },
      })
      // THE WORDS ARE STILL STORED. Who a comment is for never stops a comment being written.
      expect(said.statusCode, `${what}: ${said.body}`).toBe(201)
      const stored = (said.json() as { message: { body: string; recipient: { kind: string; said: string | null; why: string | null } } }).message
      expect(stored.body, `${what}: the words`).toBe('Which run is this?')
      expect(stored.recipient.kind, `${what}: what it was stored as`).toBe('unresolved')
      expect(stored.recipient.said, `${what}: the words about who they meant`).toBe('whoever ran the calibration')
      expect(stored.recipient.why, `${what}: the sentence saying what is wrong`).not.toBeNull()
      expect(theServerWouldStart(), what).toBe('SERVES')
    }
  })
})

// ============================================================ the act does not end at the press

/**
 * ---------------------------------------------------------------------------------------
 * WALK IT TO THE END, INCLUDING WHAT COMES BACK
 * ---------------------------------------------------------------------------------------
 *
 * FIVE DOORS ONTO THIS GATE HAVE BEEN FOUND ONE AT A TIME, EACH ONE STEP FURTHER INTO THE SAME ACT,
 * and every one of them was the same defect: one fact worked out in two places, free to disagree,
 * nothing failing when they did, failing at the NEXT RESTART. They were found one at a time because
 * no test in this repository walked a flow to its end and then asked whether a server starts. The
 * describes above stop at Send. Seven files post to `/api/agent/runs/:id/result` and not one of
 * them calls `prepareToServe` afterwards, so the step AFTER Send — an agent answering — had no
 * guard at all, and the door there was armed on the live corpus with three runs queued.
 *
 * So the walk below does not stop at the press. It claimed the run Send created and answered it the
 * way `tools/agent-worker.mjs` answers — `npm run agent`, the shipped worker, the thing the owner
 * can run at any moment — and then asked the gate again.
 *
 * SINCE ROUND 19 OF WAVE 13U SEND WRITES NO RUN. Each recipient is given one message from the person in the message
 * pool instead. Answer yMYX20nfBuep and problem eCrK1atZOrvA are the records behind that
 * change. So the walk now follows that message: the agent says it has read it and answers it with a message of its own,
 * and the gate is asked after each. A run is still claimed and answered through a conversation's own dispatch, and the
 * test after the walk asks the gate after that answer.
 */
describe('the whole act, to its end AND THEN THE ANSWER, and a server still starts', () => {
  it('collect, organise, check, SEND — then the agent READS the message it was given and ANSWERS it', async () => {
    const f = await everythingToPointAt()
    const run = await aResumableRun('Round eleven run', 'ext-review-answer')

    // ---- 1. COLLECT. Started where somebody was standing, with one comment inside it.
    const started = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      headers: HUMAN,
      payload: { entry: atARegion(f.report) },
    })
    expect(started.statusCode, started.body).toBe(201)
    const review = (started.json() as { review: { id: string } }).review.id

    const remark = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: {
        kind: 'annotation',
        title: 'on the block',
        data: { body: 'This number does not match the run log.', context: atARegion(f.report) },
      },
    })
    expect(remark.statusCode, remark.body).toBe(201)

    const finished = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/finish-collecting`,
      headers: HUMAN,
    })
    expect(finished.statusCode, finished.body).toBe(200)
    const collected = (finished.json() as { members: { id: string }[] }).members.map((one) => one.id)
    expect(collected.length, 'the review collected nothing, so there would be nothing to answer').toBeGreaterThan(0)

    for (const id of collected) {
      const to = await app.inject({
        method: 'PATCH',
        url: `/api/records/${id}`,
        headers: HUMAN,
        payload: { dataPatch: { chosenRecipient: { kind: 'session', sessionId: run } } },
      })
      expect(to.statusCode, to.body).toBe(200)
    }

    // ---- 2. ORGANISE.
    const organised = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/organise`,
      headers: HUMAN,
      payload: {
        comments: collected.map((id) => ({
          commentId: id,
          reading: 'They are asking which of two numbers was measured.',
          intents: ['ask'],
          artefacts: ['problem'],
        })),
        groups: [],
      },
    })
    expect(organised.statusCode, organised.body).toBe(200)

    // ---- 3. SEND.
    const sent = await app.inject({
      method: 'POST',
      url: `/api/reviews/${review}/send`,
      headers: { ...HUMAN, ...thePersonsKeyHeader() },
      payload: { to: [] },
    })
    expect(sent.statusCode, sent.body).toBe(200)
    const reply = sent.json() as { sent: number; threadId: string }
    expect(reply.sent, 'nothing actually went, so there is nothing to answer').toBe(collected.length)
    expect(theServerWouldStart(), 'after Send').toBe('SERVES')

    // ---- 4. THE MESSAGE SEND GAVE THE AGENT. Read off the table rather than off the reply, so a Send
    // that stopped giving one fails here instead of quietly turning the rest of this walk into nothing.
    const given = t.client.sqlite
      .prepare("SELECT message_id AS message, recipient_id AS agent FROM message_delivery WHERE recipient_kind = 'agent'")
      .all() as { message: string; agent: string }[]
    expect(given.length, 'Send gave the agent nothing, so nothing can answer it').toBe(1)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_runs').get(), 'Send wrote a run').toEqual({ n: 0 })
    const handle = t.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').pluck().get(given[0]?.agent) as string
    const AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE }

    // ---- 5. THE AGENT SAYS IT HAS READ IT, as its waiter does after the hand-over.
    const read = await app.inject({
      method: 'POST',
      url: `/api/messages/${given[0]?.message ?? ''}/mark`,
      headers: AGENT,
      payload: { mark: 'seen' },
    })
    expect(read.statusCode, read.body).toBe(200)
    expect(theServerWouldStart(), 'after the agent read it').toBe('SERVES')

    // ---- 6. ANSWER IT, with a message to the person about the one it was given.
    const posted = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AGENT,
      payload: {
        kind: 'message',
        title: 'Trial 4',
        data: {
          body: 'Trial 4. The run log has the other one.',
          to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }],
          aboutMessage: given[0]?.message,
        },
      },
    })
    expect(posted.statusCode, posted.body).toBe(201)

    // THE ANSWER IS REALLY IN THE TABLE. Asked of the row, so an answer that was dropped — which
    // would pass the line below for the wrong reason — fails here.
    const answer = t.client.sqlite
      .prepare("SELECT recipient_id FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'")
      .all((posted.json() as { record: { id: string } }).record.id) as { recipient_id: string }[]
    expect(answer.length, 'the answer was not written, so the line below proves nothing').toBe(1)

    // AND THE WHOLE POINT. This is the line that was `THREW`, and before that `REFUSES`.
    expect(theServerWouldStart(), 'after an agent answered').toBe('SERVES')
  })

  it('the answer carries the moment it was accepted, because the word it holds says somebody has it', async () => {
    const f = await everythingToPointAt()
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'about the bench', mode: 'direct' },
    })
    expect(thread.statusCode, thread.body).toBe(201)
    const threadId = (thread.json() as { thread: { id: string } }).thread.id
    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Which trial was this?', context: atARegion(f.report), recipient: { kind: 'new' } },
    })
    expect(said.statusCode, said.body).toBe(201)
    const dispatched = await app.inject({ method: 'POST', url: `/api/agent/threads/${threadId}/dispatch`, headers: { ...HUMAN, ...thePersonsKeyHeader() } })
    expect(dispatched.statusCode, dispatched.body).toBe(201)
    const runId = (dispatched.json() as { runs: { id: string }[] }).runs[0]?.id ?? ''

    const claimed = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${runId}/claim`,
      headers: { ...WORKER, ...theOfficesKeyHeader() },
      payload: { worker: 'claude-code@bench' },
    })
    expect(claimed.statusCode, claimed.body).toBe(200)
    const posted = await app.inject({
      method: 'POST',
      url: `/api/agent/runs/${runId}/result`,
      headers: WORKER,
      payload: { result: { answer: 'Trial 4.', runtime: { tool: 'claude-code', model: 'm', sessionId: 'ext-a' } }, tookMs: 10 },
    })
    expect(posted.statusCode, posted.body).toBe(200)

    const row = t.client.sqlite
      .prepare("SELECT state, sent_at, state_at FROM agent_messages WHERE role = 'agent'")
      .get() as { state: string; sent_at: string | null; state_at: string | null } | undefined
    if (row === undefined) throw new Error('the agent wrote no answer, so there is nothing to check')
    // THE TWO HALVES OF ONE FACT. `sent` means Mole Office durably accepted these words; `sent_at` is
    // when. A row holding the word and not the moment is one nothing can ever date, and it is what
    // stopped a server starting.
    expect(row.state).toBe('sent')
    expect(row.sent_at, 'the answer says it went out and does not say when').not.toBeNull()
    expect(row.state_at, 'the answer does not say when it reached the word it holds').not.toBeNull()
    // AND A SERVER STILL STARTS AFTER A RUN WAS ANSWERED. The walk above asked this until round 19 of wave
    // 13u, when a review's Send stopped writing a run; a conversation's dispatch still writes one.
    expect(theServerWouldStart(), 'after an agent answered a run').toBe('SERVES')
  })
})

// ============================================================ the rule behind that, in one place

describe('which words owe the moment they were reached is decided in one place', () => {
  it('every word in the vocabulary gets an answer, and the columns follow from it', async () => {
    // IMPORTED HERE AND NOT AT THE TOP OF THE FILE. `lib/dispatch.ts` reaches the database client,
    // and an import at the top runs before `freshDb()` has said which database this test uses.
    const { MESSAGE_STATES, aMomentIsOwedBy, theMomentsOfAMessageWrittenAt } = await import(
      '../src/server/lib/dispatch.ts'
    )
    // ENUMERATED OVER THE VOCABULARY, so a seventh word added to `MESSAGE_STATES` is covered here
    // by construction rather than by somebody remembering to add a case.
    for (const word of MESSAGE_STATES) {
      const born = theMomentsOfAMessageWrittenAt(word, '2026-09-01 12:00:00')
      expect(born.state, word).toBe(word)
      if (aMomentIsOwedBy(word)) {
        expect(born.sentAt, `${word}: a word past queued was born with no moment it was accepted`).toBe('2026-09-01 12:00:00')
        expect(born.stateAt, `${word}: a word past queued was born with no moment it reached that word`).toBe('2026-09-01 12:00:00')
      } else {
        expect(born.sentAt, `${word}: nothing has happened to it and it claims a moment`).toBeNull()
        expect(born.stateAt, `${word}: nothing has happened to it and it claims a moment`).toBeNull()
      }
    }
    // AND `queued` IS THE ONLY ONE. Written as a measurement over the vocabulary rather than as a
    // second copy of the rule, so this cannot quietly become an agreement with itself.
    expect(MESSAGE_STATES.filter((word) => !aMomentIsOwedBy(word))).toEqual(['queued'])
  })

  it('a row past `queued` with no moment REFUSES a start rather than crashing it', () => {
    // THE ROW NO DOOR CAN WRITE ANY MORE, written straight into the table the way an older build
    // wrote it. It has to be forgeable here or the refusal below could never be reached — and the
    // refusal is what the owner meets if a database from such a build is ever opened.
    t.client.sqlite
      .prepare(
        'INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
          "VALUES ('th-undatable', 'default', 'Round six', 'direct', 'open', '2026-08-20 09:00:00', " +
          `'2026-08-20 09:00:00', 'human:${THE_TEST_OFFICES_OWNER.id}')`,
      )
      .run()
    t.client.sqlite
      .prepare(
        'INSERT INTO agent_messages (id, thread_id, position, role, intent, body, state, created_at, created_by) ' +
          "VALUES ('m-undatable', 'th-undatable', 1, 'agent', 'discuss', 'Trial 4.', 'sent', " +
          "'2026-08-20 10:00:00', 'agent:one')",
      )
      .run()

    const decision = prepareToServe(t.client.sqlite, MIGRATIONS)
    // NOT A THROW. `start()` in src/server/index.ts throws the refusal itself; a throw from inside
    // `prepareToServe` went past that and out of `start()`, so the server exited 1 and never
    // listened, printing a stack where a sentence belongs.
    expect(decision.serve, 'a database holding a message nothing can date was going to be served').toBe(false)
    if (decision.serve) throw new Error('unreachable')
    // IT SAYS WHAT THE FILE HOLDS, which is what tells the owner whether this is the owner's corpus.
    expect(decision.refusal).toContain('REFUSING TO SERVE')
    expect(decision.refusal, 'the refusal does not say what the database holds').toMatch(/rows? of authored work/)
    // IT NAMES THE ROW, and it says the thing a person can act on rather than an instruction
    // addressed to whoever writes migrations.
    expect(decision.refusal).toContain('m-undatable')
    expect(decision.refusal).toContain('npm run db:migrate')
  })
})

// ============================================================ what the review migration is about

describe('the review migration cannot claim a conversation the current product made', () => {
  it('the front door: a review-mode conversation with a comment that says what it points at', async () => {
    const f = await everythingToPointAt()
    // EVERY CONDITION THE MIGRATION USED TO IDENTIFY ROUND SEVEN'S WORK BY, THROUGH THE FRONT DOOR:
    // `POST /api/agent/threads` mints `mode: 'review'` for any caller — its own description offers
    // the value — the comment below is a comment, and it says what it points at.
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'Reading the bench report again', mode: 'review' },
    })
    expect(thread.statusCode, thread.body).toBe(201)
    const threadId = (thread.json() as { thread: { id: string } }).thread.id
    const said = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: HUMAN,
      payload: { intent: 'ask', body: 'Which trial was this?', context: atARegion(f.report), recipient: { kind: 'new' } },
    })
    expect(said.statusCode, said.body).toBe(201)

    // NO REVIEW NAMES IT — the third condition, checked rather than assumed, because a review that
    // did name it would make the line below pass for a reason that has nothing to do with the fix.
    const named = t.client.sqlite
      .prepare('SELECT count(*) FROM reviews WHERE id = ? OR from_thread_id = ? OR sent_thread_id = ?')
      .pluck()
      .get(threadId, threadId, threadId) as number
    expect(named, 'a review already names this conversation, so the migration would skip it anyway').toBe(0)

    expect(theServerWouldStart(), 'after a conversation the product itself made').toBe('SERVES')
  })

  it('and the moment it turns on is one nothing this product writes can be on the far side of', () => {
    // The cutoff is a claim about the past and this is what makes it checkable: every conversation
    // this product will ever write is stamped later than it, because clocks move forward. Measured
    // against a row the product wrote a moment ago rather than against a date typed twice.
    t.client.sqlite
      .prepare(
        'INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
          "VALUES ('th-now', 'default', 'now', 'review', 'open', datetime('now', 'localtime'), " +
          `datetime('now', 'localtime'), 'human:${THE_TEST_OFFICES_OWNER.id}')`,
      )
      .run()
    const written = t.client.sqlite.prepare("SELECT created_at FROM agent_threads WHERE id = 'th-now'").pluck().get() as string
    expect(written > ROUND_SEVEN_ENDED, `a conversation written now is stamped ${written}, which is not after ${ROUND_SEVEN_ENDED}`).toBe(true)
  })
})

// ============================================================ every door, off the server itself

/**
 * THE DOORS ARE THE PRODUCT'S OWN DECLARATION OF THEM, NOT A LIST IN A TEST.
 *
 * Every route declares an operation beside itself and every operation says `read` or `write`
 * (src/shared/ops.ts). So "the write routes a person or an agent can reach" is a question with an
 * answer already in the source, and a route added later is in this walk the moment it registers.
 * A list typed here would be the same defect this whole file is about: two places holding one fact.
 *
 * WHAT A BLIND CALL PROVES, SAID PLAINLY, BECAUSE IT IS LESS THAN IT LOOKS. This sweep calls each
 * door with a small payload and whatever ids the fixture has. Many refuse it — a refusal writes
 * nothing, and a door that wrote nothing cannot arm the gate, so those calls prove nothing about
 * that door. What the sweep is for is the other kind: a route that DOES write on a payload this
 * general, and a route added later that nobody thought to walk. The describes above are where the
 * doors that matter are driven with real words, all the way to the end of the act.
 *
 * The gate's migration preview is read after every call, so a failure names the door. One full
 * server-start decision at the end also checks integrity and the refusal boundary.
 */
describe('every door the product declares as a write', () => {
  /**
   * Routes this sweep does not call, and why. Asserted to be exactly these, so an entry that stops
   * naming a real route fails here rather than quietly excusing nothing.
   */
  const NOT_CALLED: Record<string, string> = {
    'POST /api/source/reindex':
      'walks the whole checkout and rebuilds the source index. It writes only derived tables, and ' +
      'calling it here would put a filesystem walk of this repository inside every run of this file.',
    'POST /api/terminals/holder/start':
      'starts a terminal holder, a process on this machine that runs on detached after this file ends. It writes ' +
      'no record, and the gate reads only records; its own test is tests/the-terminal-pages-in-the-browser.test.ts.',
    'POST /api/import':
      'takes a whole archive as its body. There is nothing general to hand it: without a real ' +
      'archive it refuses before reading anything, so the call would measure the refusal and not the door.',
  }

  const doorsOfThisServer = (): { key: string; method: string; path: string }[] =>
    listRoutes()
      .filter((route) => operationNamed(route.operation)?.effect === 'write')
      .map((route) => ({ key: `${route.method} ${route.path}`, method: route.method, path: route.path }))
      // DELETES LAST. A sweep that removed the fixture record half way through would spend the rest
      // of itself getting 404s, which is a quieter walk than it looks like.
      .sort((a, b) => (a.method === 'DELETE' ? 1 : 0) - (b.method === 'DELETE' ? 1 : 0))

  it('is the server telling this test what it serves, and every skip names a real route', () => {
    const keys = doorsOfThisServer().map((door) => door.key)
    expect(keys.length, 'this server declares no write routes at all, so the sweep below walks nothing').toBeGreaterThan(50)
    for (const skipped of Object.keys(NOT_CALLED)) {
      expect(keys, `${skipped} is excused below and this server does not serve it`).toContain(skipped)
    }
  })

  it('is called, and a server still starts after each', async () => {
    const f = await everythingToPointAt()
    const review = await app.inject({ method: 'POST', url: '/api/reviews', headers: HUMAN, payload: { entry: atARegion(f.report) } })
    expect(review.statusCode, review.body).toBe(201)
    const reviewId = (review.json() as { review: { id: string } }).review.id
    const thread = await app.inject({
      method: 'POST',
      url: '/api/agent/threads',
      headers: HUMAN,
      payload: { title: 'sweep', mode: 'direct' },
    })
    expect(thread.statusCode, thread.body).toBe(201)
    const threadId = (thread.json() as { thread: { id: string } }).thread.id

    /**
     * What each `:name` in a path stands for, longest prefix first. A door whose prefix is not here
     * is called with an id that names nothing, which is a 404 — still a door tried, and said so.
     */
    const NAMES: [string, Record<string, string>][] = [
      ['/api/records/:id/revisions/:seq/restore', { id: f.report, seq: '1' }],
      ['/api/records/:id', { id: f.report }],
      ['/api/reviews/:id', { id: reviewId }],
      ['/api/agent/threads/:id', { id: threadId }],
    ]
    const urlFor = (path: string): string => {
      const known = NAMES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? {}
      return path.replace(/:([A-Za-z]+)/g, (_, name: string) => known[name] ?? 'names-nothing')
    }

    let called = 0
    let entryPress: { statusCode: number; body: string } | undefined
    for (const door of doorsOfThisServer()) {
      if (NOT_CALLED[door.key] !== undefined) continue
      called += 1
      const reply = await app.inject({
        method: door.method as 'POST',
        url: urlFor(door.path),
        headers: HUMAN,
        // A BODY GENERAL ENOUGH TO BE REFUSED BY EVERY DOOR THAT WANTS SOMETHING ELSE. What is
        // being measured is what the door WROTE, and a refusal wrote nothing.
        payload: {},
      })
      if (door.key === 'POST /api/office/install-the-entry') entryPress = reply
      // The gate's own pending-write lines, after every call, so the door is named on failure.
      expect(previewMigration(t.client.sqlite, MIGRATIONS).wouldWrite, `after ${door.key}`).toEqual([])
    }
    expect(called, 'the sweep called nothing').toBeGreaterThan(50)
    expect(theServerWouldStart(), 'after every declared write door').toBe('SERVES')

    // WHERE THE ENTRY PRESS WROTE (finding 20). From an ordinary checkout, as the merge queue's
    // clone is, the press writes, and it must have written into the scratch home and so not into
    // the owner's. From a linked worktree, as a worker's own run is, it is refused and writes
    // nowhere (problem fOfbpC0SKC-f). Either way it is the only thing this file puts in a home.
    expect(entryPress, 'the sweep never pressed the entry').toBeDefined()
    if (entryPress!.statusCode === 200) {
      const settings = join(scratchHome, '.claude', 'settings.json')
      expect(existsSync(settings), `the entry press answered 200 and wrote no ${settings}`).toBe(true)
      expect(readFileSync(settings, 'utf8')).toContain('session-hook.mjs')
      expect(readlinkSync(join(scratchHome, '.claude', 'skills', 'mole-office'))).toContain(join('.claude', 'skills', 'mole-office'))
      expect(readdirSync(scratchHome)).toEqual(['.claude'])
    } else {
      expect(entryPress!.statusCode, entryPress!.body).toBe(409)
      expect(entryPress!.body).toContain('This checkout is a linked git worktree')
      expect(readdirSync(scratchHome)).toEqual([])
    }
    // 60 SECONDS, NOT 5. This case proves that no write door arms the start-up gate, not that the
    // sweep is fast. It calls every write door the product declares, so its time grows with their
    // number and with the machine's load. A timeout here says nothing about the gate. On 25 September
    // 2026 it took 7 to 15 seconds at a load of 40 to 56.
  }, 60_000)
})
