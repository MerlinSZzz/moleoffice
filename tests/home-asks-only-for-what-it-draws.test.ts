// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME ASKS ONLY FOR WHAT IT DRAWS, ON AN OFFICE WHOSE ANSWERS WEIGH WHAT THE OWNER'S DID WHEN IT FROZE.
 *
 * This is round 19 of wave 13w. On 9 October 2026 Home froze when the owner
 * opened it. On the
 * made-up office of tests/an-office-with-answers-of-the-live-size.ts, Developer-mode Home took 24.9 MB on its first load,
 * of which the attention answer alone was 11.8 MB, and its longest task was 6.1 seconds
 * (a measurement made in that round found that; this file holds three things that came of it):
 *
 *   1. THE FIRST LOAD'S `/api` BYTES STAY UNDER `FIRST_LOAD_API_BYTES`, in both modes, with the chat panel open in the
 *      corner as the owner's was. Measured after the change: 3.31 MB in each mode, most of it the chat's contact list and
 *      presence, the list of participants and the comments; before it, 24.9 MB in Developer mode and 13.0 MB in the
 *      ordinary one, counting the page's own files.
 *   2. NO ANSWER IS FETCHED TWICE IN ONE LOAD. A request is the same request when its method, its address, its body
 *      and the project it was asked under (the `x-mole-office-workspace` header) are the same: Home asks each
 *      project's attention and roster under that project's header, and those are different questions.
 *   3. ATTENTION'S FIRST PAGE IS BOUNDED: under `FIRST_PAGE_BYTES`, at most five reports, none of the three question
 *      lists, and counts that are the lengths of the lists in the whole answer. Each list behind a fold comes in
 *      pages of at most `ATTENTION_PART_ROWS`, and reading the pages one after another reads the whole list.
 *
 * MUTATIONS, each run and then restored on 9 October 2026:
 *   1. App.tsx asks the whole answer as well as the first page: red in both modes, 15.2 MB against the bound.
 *   2. HomePage reads the list of projects with `readWorkspacesOnce.again()` on the first load too: red in both
 *      modes, `GET /api/workspaces under default ×2`.
 *   3. `attentionFirstPage` sends every waiting report rather than the newest five: red on the first page's size
 *      (1,962,143 bytes) and on both first loads (5.3 MB).
 *   4. On 10 October 2026, after the bound was tightened: `NEEDS_SHOWN` in HomeSections is 1000, so Needs you is not
 *      cut to five and each row reads its record: red in both modes, 3,300,636 and 3,301,399 bytes. Most of what the
 *      decision saved was those reads. Asking for the week and What has been said again stayed green, 5 KB on this
 *      office, too small for a bound on bytes. tests/the-streamlined-home.test.ts refuses those requests by name.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { anOfficeWithAnswersOfTheLiveSize } from './an-office-with-answers-of-the-live-size.ts'
import { ATTENTION_PART_ROWS, ATTENTION_PARTS, REPORTS_SHOWN } from '../src/shared/attention-first-page.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let remove: () => void = () => {}

beforeAll(async () => {
  const office = await anOfficeWithAnswersOfTheLiveSize(process.env.MEASURE_KEEP)
  remove = office.remove
  app = await liveApp({ name: 'home-asks-only', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: office.file })
}, 900_000)

afterAll(async () => {
  await app?.stop()
  remove()
}, 60_000)

/**
 * The bound on the `/api` bytes of Home's first load on this office, in either mode, with the chat panel open.
 *
 * TIGHTENED FROM 4,000,000 BY A DECISION. Home stopped
 * asking for the week, What has been said, the
 * sessions, the unregistered agents and the claims: 3,307,748 bytes in 192 answers before, 3,235,426 in 134 after,
 * the same within 1.4 KB from one run to the next. The bound is under what Home took before it.
 */
const FIRST_LOAD_API_BYTES = 3_280_000

/** The bound on attention's first page on this office. Measured after the change: 3,608 bytes. */
const FIRST_PAGE_BYTES = 64_000

/** How long the load is watched after Home has drawn its agent column. Home reads itself again only after a minute. */
const AFTER_CONTENT_MS = 8_000

interface OneRequest {
  method: string
  url: string
  workspace: string
  body: string
  bytes: number
}

/** Open Home in a context of its own, with nothing kept from before, and keep every request its first load makes. */
async function firstLoad(mode: 'normal' | 'inspect'): Promise<OneRequest[]> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.chat.open', 'yes')
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const asked = new Map<string, Omit<OneRequest, 'bytes'>>()
  const done: OneRequest[] = []
  cdp.on('Network.requestWillBeSent', (event: { requestId: string; request: { url: string; method: string; headers: Record<string, string>; postData?: string } }) => {
    const url = event.request.url.replace(/^https?:\/\/[^/]+/, '')
    if (!url.startsWith('/api/')) return
    const header = Object.entries(event.request.headers).find(([name]) => name.toLowerCase() === 'x-mole-office-workspace')
    asked.set(event.requestId, { method: event.request.method, url, workspace: header?.[1] ?? '', body: event.request.postData ?? '' })
  })
  cdp.on('Network.loadingFinished', (event: { requestId: string; encodedDataLength: number }) => {
    const one = asked.get(event.requestId)
    if (one !== undefined) done.push({ ...one, bytes: event.encodedDataLength })
  })
  try {
    await page.goto(`${app.site}/?lang=en&mode=${mode}#/`, { timeout: 120_000 })
    await page.locator('[data-home-section="agents"] [data-agent-count]').first().waitFor({ state: 'visible', timeout: 120_000 })
    await page.waitForTimeout(AFTER_CONTENT_MS)
  } finally {
    await context.close()
  }
  return done
}

const loads = new Map<string, OneRequest[]>()
async function loadOf(mode: 'normal' | 'inspect'): Promise<OneRequest[]> {
  const held = loads.get(mode)
  if (held !== undefined) return held
  const load = await firstLoad(mode)
  loads.set(mode, load)
  return load
}

describe('Home on an office whose answers weigh what the person’s did', () => {
  for (const mode of ['inspect', 'normal'] as const) {
    it(`takes less than ${String(FIRST_LOAD_API_BYTES)} bytes of answers on its first load (${mode})`, async () => {
      const load = await loadOf(mode)
      const bytes = load.reduce((sum, one) => sum + one.bytes, 0)
      const largest = [...load].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((one) => `${one.url} ${String(one.bytes)}`)
      console.log(`${mode}: ${String(load.length)} answers, ${String(bytes)} bytes; largest: ${largest.join('; ')}`)
      expect(load.some((one) => one.url.startsWith('/api/attention')), 'Home asked for no attention at all, so this proves nothing').toBe(true)
      expect(bytes, `the first load took ${String(bytes)} bytes; largest: ${largest.join('; ')}`).toBeLessThanOrEqual(FIRST_LOAD_API_BYTES)
    }, 300_000)

    it(`asks no question twice in one load (${mode})`, async () => {
      const load = (await loadOf(mode)).filter((one) => one.method !== 'OPTIONS')
      const seen = new Map<string, number>()
      for (const one of load) {
        const key = `${one.method} ${one.url} under ${one.workspace || 'no project header'}${one.body === '' ? '' : ` with ${one.body}`}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
      const twice = [...seen].filter(([, n]) => n > 1).map(([key, n]) => `${key} ×${String(n)}`)
      expect(load.length, 'the load asked nothing, so this proves nothing').toBeGreaterThan(10)
      expect(twice).toEqual([])
    }, 300_000)
  }

  it('reads attention as a bounded first page, and each list behind a fold a page at a time', async () => {
    const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
    const read = async (query: string): Promise<{ status: number; text: string }> => {
      const full = query.includes('shape=') ? '' : '&shape=full'
      const answer = await fetch(`${app.api}/api/attention?machine=omit${query}${full}`, { headers })
      return { status: answer.status, text: await answer.text() }
    }
    const readNext = async (next: string): Promise<{ status: number; text: string }> => {
      const answer = await fetch(`${app.api}${next}`, { headers })
      return { status: answer.status, text: await answer.text() }
    }
    type FullPage<Row> = { rows: Row[]; total: number; next: string | null }
    // A LIST THE TEST COUNTS BY A FIELD ON ITS ROWS, read page by page until `next` says there is no more.
    const everyRowOf = async <Row>(part: FullPage<Row>): Promise<Row[]> => {
      const rows = [...part.rows]
      let next = part.next
      while (next !== null) {
        const answer = await readNext(next)
        expect(answer.status, answer.text).toBe(200)
        const page = JSON.parse(answer.text) as FullPage<Row>
        rows.push(...page.rows)
        next = page.next
      }
      return rows
    }
    // THE WHOLE ANSWER IS PAGED SINCE 40663d348, so each list here carries `rows`, `total` and `next`.
    const whole = JSON.parse((await read('')).text) as {
      reports: FullPage<{ waiting: boolean }>
      paused: FullPage<{ onList: boolean }>
      unclassified: FullPage<unknown>
      noState: FullPage<unknown>
    }
    const first = await read('&shape=home')
    expect(first.status).toBe(200)
    const page = JSON.parse(first.text) as Record<string, unknown> & {
      reports: unknown[]
      reportCounts: { waiting: number; read: number }
      questions: { paused: { total: number; holding: number }; unclassified: { count: number }; noState: { count: number } }
    }
    // THE OFFICE IS THE SIZE IT IS MEANT TO BE, or the bound below proves nothing.
    expect(whole.noState.total, 'the made-up office has lost the list the person’s answer was large with').toBeGreaterThan(20_000)
    expect(first.text.length, `the first page is ${String(first.text.length)} bytes`).toBeLessThanOrEqual(FIRST_PAGE_BYTES)
    for (const list of ['paused', 'unclassified', 'noState', 'directions', 'machine']) expect(page, `the first page carries ${list}`).not.toHaveProperty(list)
    expect(page.reports.length).toBeLessThanOrEqual(REPORTS_SHOWN)
    // THE COUNTS ARE THE LENGTHS OF THE LISTS THE WHOLE ANSWER CARRIES.
    const reports = await everyRowOf(whole.reports)
    const paused = await everyRowOf(whole.paused)
    const waiting = reports.filter((row) => row.waiting).length
    expect(page.reportCounts).toEqual({ waiting, read: reports.length - waiting })
    expect(page.reports.length).toBe(Math.min(REPORTS_SHOWN, waiting))
    expect(page.questions.paused.total).toBe(whole.paused.total)
    expect(page.questions.paused.holding).toBe(paused.filter((row) => !row.onList).length)
    expect(page.questions.unclassified.count).toBe(whole.unclassified.total)
    expect(page.questions.noState.count).toBe(whole.noState.total)
    // A PAGE OF A LIST IS AT MOST `ATTENTION_PART_ROWS`, and its total is the list's length.
    for (const part of ATTENTION_PARTS) {
      const one = await read(`&shape=part&part=${part}&from=0`)
      expect(one.status).toBe(200)
      const body = JSON.parse(one.text) as { part: string; total: number; from: number; rows: unknown[] }
      expect(body.part).toBe(part)
      expect(body.rows.length).toBeLessThanOrEqual(ATTENTION_PART_ROWS)
      expect(body.rows.length).toBe(Math.min(ATTENTION_PART_ROWS, body.total))
    }
    const last = JSON.parse((await read(`&shape=part&part=noState&from=${String(whole.noState.total - 3)}`)).text) as { total: number; rows: unknown[] }
    expect(last).toMatchObject({ total: whole.noState.total })
    expect(last.rows).toHaveLength(3)
    // AND A QUESTION THAT IS NOT ONE IS REFUSED, NOT ANSWERED WITH SOMETHING ELSE.
    const noList = await read('&shape=part')
    expect(noList.status).toBe(400)
    expect(noList.text).toContain('needs part=')
    const noShape = await read('&part=noState')
    expect(noShape.status).toBe(400)
    expect(noShape.text).toContain('only shape=part answers')
  }, 300_000)
})
