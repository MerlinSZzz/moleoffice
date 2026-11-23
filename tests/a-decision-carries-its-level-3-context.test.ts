// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION'S LEVEL-3 CONTEXT: ASKED FOR, LISTED WHEN MISSING, NEVER INVENTED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion DC2 of design/decisions/CONTEXT-AND-OPTIONS-ACCEPTANCE.md: a decision filed without a
 * `summary` is accepted and listed as incomplete; the incompleteness names the summary and says in
 * one sentence what belongs in it; nothing is refused for it.
 *
 * Criterion DC3: one reading lists the decisions on file that carry no summary — by project, newest
 * filed first, with who decided and the `because` beside each — so a secretary can write the context
 * from the decision's own words. The reading writes nothing and backfills nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT DRIVES THE REAL SERVER
 * ---------------------------------------------------------------------------------------
 *
 * The incompleteness is not a stored column: the write reply computes it and every read recomputes
 * it from the same declaration. What has to be true is that the two agree, so this file files a
 * decision through the real write door and then reads it back through the real read door, rather
 * than asserting that two functions return what each was handed.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { DECISION_SUMMARY_BELONGS } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { apiApp, freshDb, liveApp, waitForThePage, type TestDb, governsTheWholeProject } from './helpers.ts'

/**
 * Two projects, so "by project" is a claim this file can check rather than assume. They are made
 * afresh for each case, so the reading a case takes sees only the records that case filed.
 */
let HERE = 'panelx'
let ELSEWHERE = 'greenhouse'

const asPerson = (workspace: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
})

let t: TestDb
let app: FastifyInstance
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  HERE = `panelx-case-${String(caseNumber)}`
  ELSEWHERE = `greenhouse-case-${String(caseNumber)}`
  for (const [id, title] of [
    [HERE, 'Mole Office'],
    [ELSEWHERE, 'Greenhouse'],
  ] as const) {
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
    expect(made.statusCode, made.body).toBe(201)
  }
})

interface Reply {
  statusCode: number
  body: any
}

async function post(url: string, payload: unknown, workspace = HERE): Promise<Reply> {
  const res = await app.inject({ method: 'POST', url, headers: asPerson(workspace), payload: payload as object })
  return { statusCode: res.statusCode, body: res.json() }
}

async function get(url: string, workspace = HERE): Promise<Reply> {
  const res = await app.inject({ method: 'GET', url, headers: asPerson(workspace) })
  return { statusCode: res.statusCode, body: res.json() }
}

/** File a decision and hand back its id. */
async function fileDecision(title: string, over: { summary?: string; data?: Record<string, unknown> } = {}, workspace = HERE): Promise<string> {
  const payload: Record<string, unknown> = {
    kind: 'decision',
    title,
    data: { ...governsTheWholeProject(), replaces: [], ...(over.data ?? { because: 'The gripper crushed a cup, so the force limit is not a preference.' }) },
  }
  if (over.summary !== undefined) payload['summary'] = over.summary
  const made = await post('/api/records', payload, workspace)
  expect(made.statusCode, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** The one incompleteness whose path is the summary, from a reply that carries a list. */
function summaryGap(items: { path: string; message: string }[]): { path: string; message: string } | undefined {
  return items.find((item) => item.path === 'summary')
}

// ============================================================================ DC2: accepted, incomplete

describe('a decision filed without a summary is accepted and listed as incomplete', () => {
  it('accepts it, keeps it, and names the summary with what belongs in it', async () => {
    // THE WRITE REPLY IS THE FIRST PLACE A CALLER HEARS IT. The record is stored — no refusal, no
    // 400 — and the incompleteness names the one thing still missing.
    const made = await post('/api/records', {
      kind: 'decision',
      title: 'The gripper closes on measured force',
      data: { ...governsTheWholeProject(), replaces: [], because: 'Two demos crushed a cup each; the load cell is already on the bench.' },
    })
    expect(made.statusCode, JSON.stringify(made.body)).toBe(201)
    expect(made.body.record.summary).toBeNull()

    const gap = summaryGap(made.body.incomplete)
    expect(gap, `the reply did not say the summary was missing: ${JSON.stringify(made.body.incomplete)}`).toBeDefined()
    expect(gap?.message).toContain('summary is not filled in')
    // The one sentence DC2 asks for, read out of the declaration rather than retyped here, so the
    // message and the kind's own guidance cannot drift apart.
    expect(gap?.message).toContain(DECISION_SUMMARY_BELONGS)
  })

  it('gives the same answer on the next read, so the reply and the record cannot disagree', async () => {
    const id = await fileDecision('The gripper closes on measured force')
    const read = await get(`/api/records/${id}`)
    expect(read.statusCode, JSON.stringify(read.body)).toBe(200)
    const gap = summaryGap(read.body.incomplete)
    expect(gap, `the read did not report the missing summary: ${JSON.stringify(read.body.incomplete)}`).toBeDefined()
    expect(gap?.message).toBe(summaryGap((await get(`/api/records/${id}`)).body.incomplete)?.message)
  })

  it('is complete the moment a summary is written, with nothing else changed', async () => {
    const id = await fileDecision('The gripper closes on measured force', {
      summary:
        'The gripper crushed two cups during the demo, so the owner asked for a measured force limit. The load cell was already on the bench, so closing on force was the cheaper of the two real choices.',
    })
    const read = await get(`/api/records/${id}`)
    expect(summaryGap(read.body.incomplete), JSON.stringify(read.body.incomplete)).toBeUndefined()
    expect(read.body.incomplete).toEqual([])
  })

  it('does not make any other kind incomplete for a missing summary', async () => {
    // A report with no summary has no level 3 and says so; that is not incompleteness. A note is the
    // simplest kind that declares no required field, so a complete note proves the envelope rule is
    // about a decision and not about the summary column in general.
    const note = await post('/api/records', { kind: 'note', title: 'A note with no summary' })
    expect(note.statusCode, JSON.stringify(note.body)).toBe(201)
    expect(note.body.incomplete).toEqual([])
  })
})

// ============================================================================ DC3: the reading

describe('the decisions with no summary are one reading', () => {
  it('lists them by project, newest filed first, with who decided and the because beside each', async () => {
    // THE CLOCK IS MOVED ON BETWEEN THE THREE FILINGS. `createdAt` is stored to the second, so three
    // decisions filed in one test would share a timestamp and this file would be asserting an order
    // the reading never promised. `createdAt` is written by the server from `nowStamp()`, so the
    // fake clock is what makes "newest first" a check rather than a coincidence.
    vi.useFakeTimers({ toFake: ['Date'] })
    let older: string
    let withSummary: string
    let newer: string
    try {
      vi.setSystemTime(new Date(2026, 8, 23, 9, 0, 0))
      older = await fileDecision('The older decision', {
        data: {
          because: 'The older reason, which the writer of the context needs.',
          decided_by: 'the owner',
          source: 'note qbUtd2DuAm7W',
          authority_reference: 'qbUtd2DuAm7W',
        },
      })
      vi.setSystemTime(new Date(2026, 8, 23, 9, 1, 0))
      withSummary = await fileDecision('The decision that already carries its context', {
        summary: 'What happened and why it was decided, long enough to be a real level-3 context.',
      })
      vi.setSystemTime(new Date(2026, 8, 23, 9, 2, 0))
      newer = await fileDecision('The newer decision', {
        data: { because: 'The newer reason.', decided_by: `agent ${THE_TEST_OFFICES_SECRETARY.handle}` },
      })
    } finally {
      vi.useRealTimers()
    }

    const reading = await get('/api/queries/decisions-without-summary')
    expect(reading.statusCode, JSON.stringify(reading.body)).toBe(200)
    const ids = (reading.body.decisions as { id: string }[]).map((one) => one.id)
    expect(ids).toEqual([newer, older])
    expect(ids, 'a decision that has a summary is not missing one').not.toContain(withSummary)

    const olderRow = (reading.body.decisions as Record<string, unknown>[]).find((one) => one['id'] === older)
    expect(olderRow?.['decidedBy']).toBe('the owner')
    expect(olderRow?.['because']).toBe('The older reason, which the writer of the context needs.')
    expect(olderRow?.['source']).toBe('note qbUtd2DuAm7W')
    expect(olderRow?.['authorityReference']).toBe('qbUtd2DuAm7W')
  })

  it('is scoped to one project', async () => {
    const here = await fileDecision('A decision in this project')
    const away = await fileDecision('A decision in another project', {}, ELSEWHERE)

    const hereReading = await get('/api/queries/decisions-without-summary', HERE)
    const awayReading = await get('/api/queries/decisions-without-summary', ELSEWHERE)
    expect((hereReading.body.decisions as { id: string }[]).map((one) => one.id)).toEqual([here])
    expect((awayReading.body.decisions as { id: string }[]).map((one) => one.id)).toEqual([away])
  })

  it('says how many decisions it looked at, so an empty list is not "there are none"', async () => {
    const before = await get('/api/queries/decisions-without-summary')
    expect(before.body.decisions).toEqual([])
    expect(before.body.counted).toBe(0)

    await fileDecision('The only decision', {
      summary: 'A context long enough to be a level-3 summary rather than a restatement of the choice.',
    })
    const after = await get('/api/queries/decisions-without-summary')
    expect(after.body.decisions).toEqual([])
    expect(after.body.counted, 'the reading did not count the decision it looked at').toBe(1)
  })

  it('writes nothing: filing a decision with no summary leaves it exactly as filed', async () => {
    // NO AUTOMATIC BACKFILL. The reading is a list, and a context is written by a person or an agent
    // from the decision's own words; nothing invents one.
    const id = await fileDecision('Nothing is filled in behind the reader')
    await get('/api/queries/decisions-without-summary')
    const read = await get(`/api/records/${id}`)
    expect(read.body.record.summary).toBeNull()
    expect(read.body.record.data.because).toBe('The gripper crushed a cup, so the force limit is not a preference.')
  })
})

// ============================================================================ the pictures

/**
 * THE RECORD PAGE OF A DECISION WITH NO SUMMARY, LOOKED AT.
 *
 * Chapter 6 rule 1: anything drawn is photographed at 1440, 990, 660 and 390 in light and dark.
 * This file changed what the record page draws, so the page it changed is the page photographed.
 * The reading GET /api/queries/decisions-without-summary is computed on the server and is not drawn
 * on any page (nothing under src/web names it), so there is no second page to photograph.
 *
 * IT IS GATED, like every other photographing case here, because taking pictures is not a check and
 * a suite should not do it: run it with SF_DECISION_CONTEXT_SHOTS set to the directory the pictures
 * go in. THE LINE IS PROVED TO BE ON SCREEN BEFORE THE SHUTTER OPENS, so a picture of a page that
 * never loaded cannot pass for a look at it.
 *
 * MUTATION, PROVED AFTER A CONTROL RUN: in src/web/pages/RecordPage.tsx, line 5505 was changed from
 * `recordIncompleteness(record.kind, record.data, record.summary)` back to
 * `completenessOf(record.kind, record.data)`, which is what the page read before this change. The
 * gated case goes red on its own gate — the page draws no summary incompleteness line. The line was
 * put back byte-for-byte and the control run again: green.
 */
describe('the record page of a decision with no summary is looked at', () => {
  const AS_THE_OWNER = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }

  it.skipIf(!process.env['SF_DECISION_CONTEXT_SHOTS'])(
    'photographs the incomplete line at four widths in both themes',
    async () => {
      const shots = process.env['SF_DECISION_CONTEXT_SHOTS'] as string
      const { mkdirSync } = await import('node:fs')
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({ name: 'decision-context-shots', viewport: { width: 1440, height: 1000 } })
      try {
        // A DECISION WITH NO SUMMARY, filed through the real write door so the page recomputes the
        // same gap the server reported.
        const filed = await fetch(`${live.api}/api/records`, {
          method: 'POST',
          headers: AS_THE_OWNER,
          body: JSON.stringify({
            kind: 'decision',
            title: 'A decision whose context nobody has written yet',
            data: { ...governsTheWholeProject(), replaces: [], because: 'The reason for the choice is written down; the level-3 context is not.' },
          }),
        })
        expect(filed.status, await filed.clone().text()).toBe(201)
        const id = ((await filed.json()) as { record: { id: string } }).record.id

        await live.page.goto(`${live.site}/#${recordPath(id, 'decision')}`)
        await waitForThePage(live.page, 60_000)
        // BEFORE THE SHUTTER: the record page is really drawn and really carries the summary line.
        await live.page.waitForSelector('.px-inc .px-inc-msg', { timeout: 30_000 })
        const shown = await live.page.evaluate(() => ({
          lines: [...document.querySelectorAll('.px-inc .px-inc-msg')].map((one) => one.textContent ?? ''),
          head: document.querySelector('.px-inc-title')?.textContent ?? '',
          mark: document.querySelector('.px-inc-mark-word')?.textContent ?? '',
        }))
        expect(shown.lines.length, `the page drew no incompleteness line: ${JSON.stringify(shown)}`).toBe(1)
        // In the page's own words since wave 13q's round 31; the server's reply keeps its English sentence.
        expect(shown.lines[0], `the one line is not the summary: ${JSON.stringify(shown)}`).toBe('Not filled in yet: summary.')
        // The count is the chip's alone since wave 13k's round 38; the heading names what is missing.
        expect(shown.head, 'the page does not say what the decision still needs').toBe('What this decision still needs')
        expect(shown.mark, 'the page does not count the one missing detail').toBe('1 detail missing')

        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            // THE PICTURE HAS TO CONTAIN THE LINE THIS CHANGE DREW. At 390 the line starts below the
            // fold, so a viewport shot taken from the top of the page would not show it at all. The
            // section is brought into view first; at the wider widths it is already in view and this
            // does nothing. The gate above and this scroll are the same rule: the photograph is of
            // the thing that was changed.
            await live.page.locator('.px-inc').scrollIntoViewIfNeeded()
            await live.page.waitForTimeout(150)
            await live.page.screenshot({
              path: `${shots}/decision-no-summary-${String(width)}-${theme}.png`,
              fullPage: false,
            })
          }
        }
        await live.page.setViewportSize({ width: 1440, height: 1000 })
        await live.page.emulateMedia({ colorScheme: 'light' })
      } finally {
        await live.stop()
      }
    },
    300_000,
  )
})
