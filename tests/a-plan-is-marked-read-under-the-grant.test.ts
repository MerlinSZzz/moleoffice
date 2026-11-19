// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MARKING A PLAN AS READ ASKS THE LIST, AND A SECRETARY'S MARK IS STORED AND SHOWN AS THE SECRETARY'S. The door
 * `POST /api/plans/<id>/read` in src/server/api/plans.ts used to declare the operation writing a plan declares, and
 * `markPlanRead` in src/server/lib/plans.ts refused every caller that is not a person before any list was read. It has
 * its own operation now, `plan.mark-read`, which the secretary card keeps for the person. After the person, it asks the
 * one check (`aRaiseCarriesIt` in lib/records.ts), so a secretary holding the person's grant marks the plan for them
 * where this office's list of what the grant carries says `may-press`. The plan then stores the secretary and the grant
 * (migration 0295), and the plan's page says which secretary marked it. The person's own mark clears both.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries are
 * made-up agents: one raised, and one with no grant. Each holds the key the office answered. Every plan here is
 * synthetic, and no folder is made outside the test's own database folder. This office's answers are set with
 * `setThisOfficesAnswer`, the function the door for that list calls. The page is drawn to markup in process, from the
 * replies the office gave.
 *
 * FOR EACH ANSWER, THROUGH THE ROUTE:
 *   1. no grant: the secretary with none hears the door's old refusal, even with this office's answer at may-press,
 *      and the plan's three columns are as they were;
 *   2. kept, the card's default: the raised secretary is refused in the check's words, and nothing is written;
 *   3. ask-first: the raised secretary is refused in the check's ask-first words, and nothing is written;
 *   4. may-press with no reason: refused, and nothing is written;
 *   5. may-press: the mark is stored with the secretary's registry id and the grant, one press row names the
 *      secretary, the grant, the door and the reason, and the reply names the secretary;
 *   6. `since-read` after that mark names the secretary and the grant, and its note says the secretary marked it;
 *   7. the person's own mark clears the secretary and the grant, and `since-read` then names no secretary;
 *   8. the plan's page, drawn from those replies, says which secretary marked the plan, and stops saying it once the
 *      person has marked it.
 *
 * When TEST_SHOTS names a folder, case 9 also opens the plan's page in a browser, on its own stack over the same
 * database, checks the band says which secretary marked the plan, and photographs the page at 1440, 990, 660 and 390
 * in light and dark.
 *
 * RUN ON 23 OCTOBER 2026. The control run passed all eight. Against the door as it was, all eight went red: cases 1 to
 * 4 because the plans table had no column for the secretary, and cases 5 to 8 at the old refusal. Each mutation was
 * then made alone and put back:
 *   · `markPlanRead` never asks the check, so every agent hears the old refusal: cases 2 to 8 went red;
 *   · `markPlanRead` takes every agent as carried, without asking the check: all eight went red, case 1 because the
 *     secretary with no grant reached the fault for a press that names no secretary;
 *   · the secretary's mark does not write the two columns: cases 5, 6 and 8 went red;
 *   · the person's own mark leaves the two columns as they were: cases 7 and 8 went red;
 *   · `plan.mark-read` taken off the card's `neverPresses`: case 2 went red, because the press went through;
 *   · the page ignores the secretary's mark: case 8 went red;
 *   · the note of `since-read` says "since you read this" for every mark: case 6 went red.
 */

import type { FastifyInstance } from 'fastify'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import type { PlanBlocksReply, PlanReviewsReply, PlanSinceReadReply } from '../src/web/api.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, FOR_THE_PERSON, freshDb, liveApp, thePersonsKeyHeader, waitForThePage, type TestDb } from './helpers.ts'

const PRESSER = 'plan-reader-secretary'
const PRESSERS_NAME = 'Made-up secretary who marks plans'
const PLAIN = 'grant-less-plan-secretary'
const DOOR = 'plan.mark-read'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let onePlan: typeof import('../src/web/pages/plans/OnePlanPage.tsx')
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
let presserGrantId = ''

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

async function start(handle: string, name: string): Promise<void> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name, role: 'secretary' })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(started.body.agent?.id ?? ''))
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** A new plan of two lines, started by the person. */
async function aPlan(): Promise<string> {
  const made = await call('POST', '/api/plans', PERSON, { title: 'A made-up plan', body: 'one\ntwo' })
  expect(made.status, made.raw).toBe(201)
  return String(made.body.plan?.id ?? '')
}

interface TheMark {
  read_at: string | null
  read_by_agent: string | null
  read_under_grant: string | null
}

function theMark(plan: string): TheMark {
  return t.client.sqlite.prepare('SELECT read_at, read_by_agent, read_under_grant FROM plans WHERE id = ?').get(plan) as TheMark
}

function pressesMarker(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM presses_for_the_person').get() as { n: number }).n
}

function pressesSince(mark: number): { agent_id: string; grant_id: string; operation: string; reason: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT agent_id, grant_id, operation, reason FROM presses_for_the_person WHERE rowid > ? ORDER BY rowid')
    .all(mark) as { agent_id: string; grant_id: string; operation: string; reason: string | null }[]
}

const theMarking = (plan: string): string => `/api/plans/${plan}/read`

/** A refusal, with the plan's three columns as they were and no press row written. */
async function refusedAndNothingChanged(who: string, words: string, status = 403, payload: unknown = FOR_THE_PERSON): Promise<void> {
  const plan = await aPlan()
  const before = theMark(plan)
  const pressMark = pressesMarker()
  const refused = await call('POST', theMarking(plan), as(who), payload)
  expect(refused.status, refused.raw).toBe(status)
  expect(refused.error).toContain(words)
  expect(theMark(plan), 'a refused press changed the mark').toEqual(before)
  expect(before).toEqual({ read_at: null, read_by_agent: null, read_under_grant: null })
  expect(pressesSince(pressMark), 'a refused press wrote a press row').toEqual([])
}

/** A plan the raised secretary marked as read for the person, under this office's answer at may-press. */
async function aPlanTheSecretaryMarked(): Promise<{ plan: string; done: Awaited<ReturnType<typeof call>> }> {
  answer(DOOR, 'may-press')
  const plan = await aPlan()
  const done = await call('POST', theMarking(plan), as(PRESSER), FOR_THE_PERSON)
  expect(done.status, done.raw).toBe(200)
  return { plan, done }
}

/** The words of the plan's page, drawn from the replies the office gives the person, with the tags taken out. */
async function thePageSays(plan: string): Promise<{ words: string; band: boolean }> {
  const blocks = await call('GET', `/api/plans/${plan}/blocks`, PERSON)
  expect(blocks.status, blocks.raw).toBe(200)
  const since = await call('GET', `/api/plans/${plan}/since-read`, PERSON)
  expect(since.status, since.raw).toBe(200)
  const reviews: PlanReviewsReply = { reviews: [], waiting: 0, note: '' } as unknown as PlanReviewsReply
  const markup = renderToStaticMarkup(
    h(onePlan.PlanView, {
      reply: blocks.body as PlanBlocksReply,
      since: since.body as PlanSinceReadReply,
      reviews,
      view: 'writing',
      onView: () => {},
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
  const words = markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return { words, band: markup.includes('class="op-since"') }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env.MOLE_OFFICE_GPU_WATCHER
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
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  ;(await import('../src/shared/i18n.ts')).setWordLanguage('en')
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  await start(PRESSER, PRESSERS_NAME)
  await start(PLAIN, 'Made-up secretary with no grant')
  const raised = await call('POST', `/api/roles/elevation/${PRESSER}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  presserGrantId = String(raised.body.elevation?.id ?? '')
  expect(presserGrantId).not.toBe('')
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('marking a plan as read asks the list', () => {
  it('1: with no grant, even with the answer at may-press, refuses in its old words and writes nothing', async () => {
    answer(DOOR, 'may-press')
    await refusedAndNothingChanged(PLAIN, 'Only a person can say they have read a plan')
  })

  it("2: kept, the card's default, refuses the raised secretary in the check's words and writes nothing", async () => {
    await refusedAndNothingChanged(PRESSER, 'The secretary card keeps plan.mark-read for the person')
  })

  it("3: ask-first refuses the raised secretary in the check's words and writes nothing", async () => {
    answer(DOOR, 'ask-first')
    await refusedAndNothingChanged(PRESSER, 'says to ask the person before pressing plan.mark-read')
  })

  it('4: may-press with no reason refuses the raised secretary and writes nothing', async () => {
    answer(DOOR, 'may-press')
    await refusedAndNothingChanged(PRESSER, 'every such press gives its reason', 400, {})
  })

  it('5: may-press stores the mark with the secretary and the grant, and the reply names the secretary', async () => {
    const pressMark = pressesMarker()
    const { plan, done } = await aPlanTheSecretaryMarked()
    const mark = theMark(plan)
    expect(mark.read_at, 'the mark was not stored').toEqual(expect.any(String))
    expect(mark.read_by_agent).toBe(ids.get(PRESSER))
    expect(mark.read_under_grant).toBe(presserGrantId)
    expect(done.body.plan?.readByAgent).toBe(ids.get(PRESSER))
    expect(done.body.plan?.readUnderGrant).toBe(presserGrantId)
    const note = String(done.body.note ?? '')
    expect(note).toContain(`by the secretary "${PRESSERS_NAME}"`)
    expect(note).toContain(`under their grant ${presserGrantId}`)

    const presses = pressesSince(pressMark)
    const ours = presses.filter(
      (row) => row.agent_id === PRESSER && row.grant_id === presserGrantId && row.operation === DOOR && row.reason === A_TESTS_REASON_FOR_THE_PERSON,
    )
    expect(ours, `the press row does not name the secretary, the grant, the door and the reason: ${JSON.stringify(presses)}`).toHaveLength(1)
  })

  it("6: since-read after the secretary's mark names the secretary and the grant", async () => {
    const { plan } = await aPlanTheSecretaryMarked()
    const since = await call('GET', `/api/plans/${plan}/since-read`, PERSON)
    expect(since.status, since.raw).toBe(200)
    expect(since.body.neverRead).toBe(false)
    expect(since.body.markedUnderTheGrant).toEqual({ secretary: PRESSERS_NAME, grant: presserGrantId })
    expect(String(since.body.note)).toContain(`since the secretary "${PRESSERS_NAME}" marked this plan as read under the person's grant`)
    expect(String(since.body.note)).not.toContain('since you read this')
  })

  it("7: the person's own mark clears the secretary and the grant", async () => {
    const { plan } = await aPlanTheSecretaryMarked()
    const own = await call('POST', theMarking(plan), PERSON)
    expect(own.status, own.raw).toBe(200)
    expect(String(own.body.note)).toContain('Marked as read at')
    expect(String(own.body.note)).not.toContain('secretary')
    const mark = theMark(plan)
    expect(mark.read_at).toEqual(expect.any(String))
    expect(mark.read_by_agent).toBeNull()
    expect(mark.read_under_grant).toBeNull()
    const since = await call('GET', `/api/plans/${plan}/since-read`, PERSON)
    expect(since.body.markedUnderTheGrant).toBeNull()
    expect(String(since.body.note)).toContain('since you read this')
  })

  it("8: the plan's page says which secretary marked it, until the person marks it", async () => {
    const { plan } = await aPlanTheSecretaryMarked()
    const marked = await thePageSays(plan)
    expect(marked.band, 'the page drew no band for the secretary’s mark').toBe(true)
    expect(marked.words).toContain(`${PRESSERS_NAME} marked this plan as read for you, under your grant`)

    expect((await call('POST', theMarking(plan), PERSON)).status).toBe(200)
    const own = await thePageSays(plan)
    expect(own.words).not.toContain(PRESSERS_NAME)
    expect(own.words).not.toContain('under your grant')
    expect(own.band, 'the band stayed after the person marked the plan').toBe(false)
  })

  it.skipIf(!process.env['TEST_SHOTS'])("9: photographs the plan's page with the secretary's mark", async () => {
    const shots = process.env['TEST_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const live = await liveApp({ name: 'plan-marked-under-the-grant', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
    try {
      const page = live.page
      for (const look of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390]) {
          const { plan } = await aPlanTheSecretaryMarked()
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(`${live.site}/#/plans/${plan}`, { timeout: 60_000 })
          await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
          await page.reload({ timeout: 60_000 })
          await waitForThePage(page, 60_000)
          const band = page.locator('.op-since')
          await band.waitFor({ timeout: 30_000 })
          expect(await band.innerText()).toContain(`${PRESSERS_NAME} marked this plan as read for you, under your grant`)
          // The owner's name, where the page shows it, is not put in a picture.
          await page.evaluate((name) => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
            for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
              if (node.textContent !== null && node.textContent.includes(name)) node.textContent = node.textContent.split(name).join('Rowan')
            }
          }, THE_PERSON)
          await page.screenshot({ path: join(shots, `plan-marked-under-the-grant-${String(width)}-${look}.png`), fullPage: false })
        }
      }
    } finally {
      await live.stop()
    }
  }, 600_000)
})
