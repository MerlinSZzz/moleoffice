// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW'S REASONS AND A DECISION'S BASIS ARE ONE PRESS DOWN, AND THE FOLD STARTS CLOSED. In wave 13q round 43,
 * in a browser against the built page.
 *
 * What is proved:
 *   1. A flow's page draws its stages as main content, and the fold under them starts closed: no why is on the screen.
 *      One press opens it, and a step filed before the decision says "The reason is not written yet."
 *   2. While the flow is being changed, the fold is open, with the sentence that asks the reader to read the reasons
 *      before changing a step.
 *   3. A module's page lists the decision that governs it, "governs it", and that decision's basis sits in a closed
 *      fold under its row. One press shows each basis record by title.
 *
 * Three-run proof, this whole file each time (build first: liveApp serves dist/web):
 *   npx vite build && node tools/run-named-tests.mjs tests/a-flows-reasons-and-a-decisions-basis-start-folded.test.ts
 * Mutations, one at a time, rebuilt, restored with cp and checked with cmp:
 *   A. src/web/components/FlowReasons.tsx, `open={editing}` to `open`: case 1 goes red.
 *   B. src/web/components/FlowReasons.tsx, `open={editing}` to `open={false}`: case 2 goes red.
 *   C. src/web/components/DecisionBasis.tsx, `<details className="rd-fold" data-testid="decision-basis">` given `open`:
 *      case 3 goes red.
 *   D. src/web/pages/RecordPage.tsx, `one.how === 'governs it' ? t('w13q.decided.governs') :` removed: case 3 goes red.
 *   E. src/web/api.ts, `getRecord` asks `${path}?secondLevel=show` at once again, as round 43 did: case 4 goes red.
 *   F. src/web/api.ts, `getRecord` never asks again (`reply.secondLevel === undefined ? reply :` made `true ? reply :`):
 *      cases 1, 2 and 4 go red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { editingAddress, recordPath } from '../src/web/components/router.tsx'

let app: LiveApp
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const ids: Record<string, string> = {}

async function post(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return ((await res.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'flow-reasons-folded', viewport: { width: 1440, height: 900 } })
  ids.source = await post('/api/records', { kind: 'report', title: 'Test: why kettles are checked', data: { blocks: [] } })
  ids.module = await post('/api/records', { kind: 'module', title: 'Test: kettle module', data: {} })
  ids.flow = await post('/api/records', {
    kind: 'flow',
    title: 'Test: landing a kettle',
    data: {
      declared_in: 'tools/test-kettle.mjs',
      runs: 'the office itself',
      trigger: 'A kettle is ready.',
      stages: [{ n: 1, does: 'The kettle is checked.', evidence: 'a check record', why: 'Without the check a cold kettle is served.', sources: [ids.source] }],
      leaves_behind: 'a served kettle',
    },
  })
  // A STEP FILED BEFORE THE DECISION, with no why and no sources: written past the gate, as an old flow holds one.
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(`${app.dir}/panelx.db`)
  const row = db.prepare('SELECT data FROM records WHERE id = ?').get(ids.flow) as { data: string }
  const data = JSON.parse(row.data) as { stages: unknown[] }
  data.stages.push({ n: 2, does: 'The kettle is washed.' })
  db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), ids.flow)
  db.close()
  ids.decision = await post('/api/records', {
    kind: 'decision',
    title: 'Test: a kettle is checked before it is served',
    data: { replaces: [], option_taken: 'Check every kettle.', because: 'A cold kettle was served twice.', governs: [{ record: ids.module }], basis: [ids.source] },
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A record's page, reading or, with `editing`, at its editing address (the page's Edit link goes there). */
async function open(id: string, editing = false): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#${editing ? editingAddress(recordPath(id)) : recordPath(id)}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return page
}

describe('reasons and basis one press down', () => {
  it('1. a flow draws its stages, and the fold of reasons starts closed', async () => {
    const page = await open(ids.flow!)
    await page.locator('[data-testid="flow-stage"]').first().waitFor({ timeout: 30_000 })
    expect(await page.locator('[data-testid="flow-stage"]').allInnerTexts()).toEqual([
      expect.stringContaining('The kettle is checked.'),
      expect.stringContaining('The kettle is washed.'),
    ])
    const fold = page.locator('[data-testid="flow-reasons"]')
    expect(await fold.evaluate((el) => (el as HTMLDetailsElement).open), 'the fold starts closed').toBe(false)
    expect(await page.getByText('Without the check a cold kettle is served.', { exact: false }).isVisible()).toBe(false)
    await fold.locator('summary').click()
    await expect.poll(() => page.getByText('Why: Without the check a cold kettle is served.').isVisible()).toBe(true)
    expect(await page.locator('[data-testid="flow-reason"]').nth(1).innerText()).toContain('The reason is not written yet.')
    await page.context().close()
  }, 120_000)

  it('2. while the flow is being changed, the reasons are open with a sentence above them', async () => {
    const page = await open(ids.flow!, true)
    await expect.poll(() => page.locator('[data-testid="flow-reasons-editing"]').isVisible(), { timeout: 30_000 }).toBe(true)
    expect(await page.locator('[data-testid="flow-reasons"]').evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true)
    expect(await page.getByText('Why: Without the check a cold kettle is served.').isVisible()).toBe(true)
    await page.context().close()
  }, 120_000)

  it("3. a module lists the decision that governs it, and that decision's basis starts folded", async () => {
    const page = await open(ids.module!)
    const basis = page.locator('[data-testid="decision-basis"]')
    await basis.first().waitFor({ timeout: 30_000 })
    const row = page.locator('li', { has: basis })
    expect(await row.innerText()).toContain('Test: a kettle is checked before it is served')
    expect(await row.innerText()).toContain('governs it')
    expect(await basis.evaluate((el) => (el as HTMLDetailsElement).open), 'the basis starts closed').toBe(false)
    expect(await basis.locator('summary').innerText()).toBe('What it was based on: 1 record')
    await basis.locator('summary').click()
    await expect.poll(() => basis.getByRole('link', { name: 'Test: why kettles are checked' }).isVisible()).toBe(true)
    await page.context().close()
  }, 120_000)

  // ROUND 43B: the page asked every record with ?secondLevel=show, so a test answering a run's page at
  // /api/records/<id> was never asked and waited out every case (the-check-panel-names-its-base-only-in-developer-mode).
  it('4. a record with no second level is read at its plain address, and a flow is asked again for its second level', async () => {
    const asked = async (id: string): Promise<string[]> => {
      const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
      const page = await context.newPage()
      const urls: string[] = []
      page.on('request', (r) => {
        const path = new URL(r.url()).pathname + new URL(r.url()).search
        if (path.startsWith(`/api/records/${id}`) && !path.startsWith(`/api/records/${id}/`)) urls.push(path)
      })
      await page.goto(`${app.site}/?lang=en#${recordPath(id)}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await context.close()
      return [...new Set(urls)].sort()
    }
    expect(await asked(ids.module!)).toEqual([`/api/records/${ids.module!}`])
    expect(await asked(ids.flow!)).toEqual([`/api/records/${ids.flow!}`, `/api/records/${ids.flow!}?secondLevel=show`])
  }, 120_000)
})
