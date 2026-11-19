// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD SAYS WHAT WAS SPENT ON IT — CRITERION T2, BY METHOD C.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   a. a record whose change log names two runs sums both runs' receipts and names both;
 *   b. a run counted but carrying NO receipt is reported as a run with no receipt, and not as zero;
 *   c. changes on the record that name no run are counted and said out loud;
 *   d. a change written by a different run on a DIFFERENT record does not reach this record's total.
 *
 * THE METHOD. The criterion's original words summed runs "through the links a run wrote". Supervisor
 * sd measured on 13 September 2026 that a run writes no links, so the secretary ruled T2 by method
 * C: a record sums the runs its own change log names, and says how many changes on the record name
 * no run. `spentOnRecord` in src/server/lib/spent-on-this.ts is that reader, and it hands the runs
 * to `receiptsFromRuns` — the product's one token summation — rather than adding any token itself.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, EACH AFTER A CONTROL RUN, EACH RESTORED BYTE-IDENTICAL
 * ---------------------------------------------------------------------------------------
 *
 * Control: the four cases below green on the unmutated tree.
 *
 *   1. COUNT A RUN WITH NO RECEIPT AS ZERO (src/server/lib/usage-receipts.ts, `receiptsFromRuns`):
 *      drop `missingReceipts += 1` (and its `overall` count). Case b goes red: the reader reports
 *      0 runs without a receipt and the panel stops saying a run had none.
 *   2. DROP THE "CHANGES THAT NAME NO RUN" COUNT (src/server/lib/spent-on-this.ts, `spentOnRecord`):
 *      set `const changesNamingNoRun = 0`. Case c goes red: the reply says nothing named no run.
 *
 * The file was restored byte-identical after each mutation (sha256 before and after).
 *
 * WAVE 13K ROUND 34 changed case c's criterion in its own commit: where no change names a run, a normal
 * page draws only "Nobody recorded what this record cost." and developer mode draws the rest. Mutation:
 * the fold drawn in normal mode again (the `runs.length === 0 && !inspect` line in `WhatWasSpent` taken
 * out) turns case c red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SPENT_WORDS, type SpentOnThis } from '../src/shared/spent.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')

let t: TestDb
let app: FastifyInstance

/** Two records and four runs: two runs on A, one measured-less run on B, one run on C. */
let recordA = ''
let recordB = ''
let recordC = ''
let runOne = ''
let runTwo = ''
let runWithoutReceipt = ''
let runOnAnotherRecord = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** An agent writing under one run's own record id, which is what the change log stores. */
function asTheRun(run: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'd-spent-on-this-test',
    'x-mole-office-session': run,
  }
}

/** A finished run filed historically, with whatever receipt the caller names. */
function aRun(title: string, data: Record<string, unknown>): string {
  return historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'agent', id: 'c-run-identity' },
    kind: 'session',
    title,
    data: { state: 'finished', servingAgent: 'two-runs', ...data },
  }).id
}

/** File one record as the person, so its creation change names no run. */
function aRecord(title: string): string {
  return t.api.createRecord({
    kind: 'problem',
    title,
    workspaceId: 'default',
    data: {},
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

/** One real write on a record, under a run where there is one. */
async function change(recordId: string, run: string, said: string): Promise<void> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/records/${recordId}`,
    headers: asTheRun(run),
    payload: { dataPatch: { why_it_hurts: said } },
  })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** The reader's answer as the record's page asks for it: `GET /api/changes?recordId=…`. */
async function spentOf(recordId: string): Promise<SpentOnThis> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/changes?recordId=${encodeURIComponent(recordId)}`,
    headers: AS_THE_PERSON,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  const spent = (reply.json() as { spent?: SpentOnThis }).spent
  expect(spent, 'a record read carries what was spent on it').toBeDefined()
  return spent as SpentOnThis
}

/** A window, so the browser modules load under `renderToStaticMarkup`. */
async function boot(search = ''): Promise<Page> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  return (await import('../src/web/pages/RecordPage.tsx')) as Page
}

/** The record's page body, drawn with the reader's answer and nothing else. */
function drawn(page: Page, record: PanelRecord, spent: SpentOnThis): string {
  return renderToStaticMarkup(
    h(page.RecordDetail, {
      record,
      editable: false,
      deleted: false,
      records: [record],
      detailLinks: [],
      relations: [],
      evolutionLinks: [],
      log: { changes: [], sessions: [], spent },
      titles: [],
      titleById: new Map([[record.id, record.title]]),
      unfilledByRecord: new Map<string, number>(),
      body: [],
      onChanged: () => {},
    } as never),
  )
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  recordA = aRecord('A problem two runs worked on')
  recordB = aRecord('A problem one run worked on without a receipt')
  recordC = aRecord('A problem another record a run worked on')

  runOne = aRun('The first run', {
    model: 'model-one',
    usageReceipt: {
      runtime: 'claude-code',
      model: 'model-one',
      inputTokens: 100,
      outputTokens: 10,
      durationMs: 1000,
      inputIncludesCached: true,
    },
  })
  runTwo = aRun('The second run', {
    model: 'model-two',
    usageReceipt: {
      runtime: 'claude-code',
      model: 'model-two',
      inputTokens: 200,
      outputTokens: 20,
      durationMs: 2000,
      inputIncludesCached: true,
    },
  })
  runWithoutReceipt = aRun('A run nobody measured', { model: 'model-one' })
  runOnAnotherRecord = aRun('A run on another record', {
    model: 'model-one',
    usageReceipt: { runtime: 'claude-code', model: 'model-one', inputTokens: 999, inputIncludesCached: true },
  })

  await change(recordA, runOne, 'The first run changed this.')
  await change(recordA, runTwo, 'The second run changed this.')
  await change(recordB, runWithoutReceipt, 'A run with no receipt changed this.')
  await change(recordC, runOnAnotherRecord, 'A run changed another record.')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ a. two runs, both summed, both named

describe('a record sums the runs its change log names', () => {
  it('names both runs, and sums both receipts through the one summation', async () => {
    const spent = await spentOf(recordA)
    expect(spent.runs.map((one) => one.id).sort()).toEqual([runOne, runTwo].sort())
    expect(spent.totals.runs, 'two runs were counted').toBe(2)
    // 100 + 200 input, 10 + 20 output, 1000 + 2000 ms, from `receiptsFromRuns`' one overall row.
    expect(spent.totals.overall.values.inputTokens, '100 + 200').toBe(300)
    expect(spent.totals.overall.values.outputTokens, '10 + 20').toBe(30)
    expect(spent.totals.overall.values.durationMs, '1000 + 2000').toBe(3000)
  })

  // THE IDS ARE DRAWN IN DEVELOPER MODE, where a run's id belongs (plan 7FEOshq3mBGG, G2c).
  it('draws the runs it counted, by id, on the record’s page', async () => {
    const page = await boot('?mode=inspect')
    const record = t.api.getRecord(recordA)
    expect(record, 'the record still exists').not.toBeNull()
    const html = drawn(page, record as PanelRecord, await spentOf(recordA))
    expect(html).toContain('spent-on-this')
    expect(html).toContain(runOne)
    expect(html).toContain(runTwo)
    expect(html).toContain(SPENT_WORDS.whichRuns)
    // FOLDED: a closed details element, never one drawn open.
    expect(html).toContain('<details')
    expect(html).not.toMatch(/<details[^>]*\bopen\b/)
  })
})

// ============================================================ b. no receipt is not zero

describe('a counted run with no receipt is a run with no receipt, never zero', () => {
  it('reports it as a run without a receipt and leaves its tokens unknown', async () => {
    const spent = await spentOf(recordB)
    expect(spent.runs.map((one) => one.id)).toEqual([runWithoutReceipt])
    expect(spent.runsWithoutReceipt, 'the one run carried no receipt').toBe(1)
    expect(spent.totals.missingReceipts).toBe(1)
    expect(spent.totals.overall.values.inputTokens, 'unknown is not zero').toBeUndefined()
    const html = drawn((await boot()), t.api.getRecord(recordB) as PanelRecord, spent)
    expect(html).toContain(SPENT_WORDS.thisOneNoReceipt)
    expect(html).toContain(SPENT_WORDS.withoutReceipt(1, 1))
  })
})

// ============================================================ c. changes that name no run

describe('changes that name no run are counted and said out loud', () => {
  it('counts the creation change and says it names no run', async () => {
    const spent = await spentOf(recordA)
    // The record was filed by the person, so its creation change names no run.
    expect(spent.changesOnRecord).toBe(3)
    expect(spent.changesNamingNoRun).toBe(1)
    const html = drawn((await boot()), t.api.getRecord(recordA) as PanelRecord, spent)
    expect(html).toContain(SPENT_WORDS.namesNoRun(1))
  })

  it('says no run at all where every change names none', async () => {
    // A record with one creation change and no run change is a confident zero no longer: it says so.
    const quiet = t.api.createRecord({
      kind: 'problem',
      title: 'A problem nobody’s run changed',
      workspaceId: 'default',
      data: {},
      actor: { type: 'human', id: THE_PERSON },
    }).id
    const spent = await spentOf(quiet)
    expect(spent.runs).toEqual([])
    expect(spent.changesNamingNoRun).toBe(1)
    expect(spent.totals.overall.values.inputTokens).toBeUndefined()
    // A NORMAL PAGE SAYS ONE PLAIN LINE, AND DEVELOPER MODE SAYS WHY (wave 13k round 34). The change log's
    // account of runs and changes is a fact a person cannot act on (the secretary's review in 3Zgf2lTGanJw), so
    // normal mode says only that nobody recorded a cost; the count of changes naming no run stays, whole,
    // in developer mode.
    const normal = drawn(await boot(), t.api.getRecord(quiet) as PanelRecord, spent)
    expect(normal).toContain(SPENT_WORDS.summaryNoRuns)
    expect(normal).not.toContain(SPENT_WORDS.nobodyChangedIt)
    expect(normal).not.toContain(SPENT_WORDS.namesNoRun(1))
    const html = drawn(await boot('?mode=inspect'), t.api.getRecord(quiet) as PanelRecord, spent)
    expect(html).toContain(SPENT_WORDS.summaryNoRuns)
    expect(html).toContain(SPENT_WORDS.nobodyChangedIt)
    expect(html).toContain(SPENT_WORDS.namesNoRun(1))
  })
})

// ============================================================ d. another record's run stays away

describe('a run on a different record does not reach this record’s total', () => {
  it('leaves the other record’s run and tokens off this record', async () => {
    const here = await spentOf(recordA)
    expect(here.runs.map((one) => one.id)).not.toContain(runOnAnotherRecord)
    expect(here.totals.overall.values.inputTokens).toBe(300)
    // AND IT IS COUNTED ON THE RECORD IT DID CHANGE, which is where it belongs.
    const there = await spentOf(recordC)
    expect(there.runs.map((one) => one.id)).toEqual([runOnAnotherRecord])
    expect(there.totals.overall.values.inputTokens).toBe(999)
  })
})

// ============================================================ e. the pictures, when asked for

describe('the record page, photographed', () => {
  /**
   * PHOTOGRAPH THE FOLD CLOSED AND OPEN, at 1440 and 390 in both themes, when `SPENT_SHOTS` names a
   * directory. `tools/review.mjs` could not reach the incident page on the day this was written
   * (problem bfvKtNhVC4L5), so the picture is taken by a browser test instead of that tool. The
   * mutation and control runs leave the variable unset and take no picture.
   */
  it.skipIf(!process.env['SPENT_SHOTS'])('photographs the panel closed and open, at two widths in both themes', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['SPENT_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const live = await liveApp({
      name: 't2-spent',
      viewport: { width: 1440, height: 1000 },
      workspace: 'default',
      database: t.file,
    })
    try {
      await live.page.goto(`${live.site}/#/r/${recordA}`, { timeout: 60_000 })
      await waitForThePage(live.page, 60_000)
      const panel = live.page.getByTestId('spent-on-this')
      await panel.waitFor()
      for (const width of [1440, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await live.page.setViewportSize({ width, height: 1200 })
          await live.page.emulateMedia({ colorScheme: theme })
          await panel.evaluate((el) => el.removeAttribute('open'))
          await live.page.screenshot({ path: `${shots}/t2-${String(width)}-${theme}-closed.png`, fullPage: true })
          await panel.evaluate((el) => el.setAttribute('open', ''))
          await live.page.screenshot({ path: `${shots}/t2-${String(width)}-${theme}-open.png`, fullPage: true })
        }
      }
    } finally {
      await live.stop()
    }
  }, 300_000)
})

