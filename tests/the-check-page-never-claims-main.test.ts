// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK PAGE NEVER CLAIMS MAIN WHERE NO TRUNK WAS READ.
 *
 * Criterion C27's panel, and problem `r0vUx5VGffP2` before it. The sentence under *Who the office
 * asked* used to read, wherever the run recorded no `cutFrom`:
 *
 *     , and the run recorded no branch it was cut from, so the base is the fork point against main
 *
 * `main` was an assumption. A wave of 15 September 2026 made the server read the repository's
 * own trunk (`inspectionTrunk`), so a repository whose trunk is `master` was checked against the
 * wrong word, and a run whose working directory is not a repository at all had no trunk to read and
 * was still told `main`. This is the owner's own wave of that day, which a decision does not
 * touch.
 *
 * WHAT THIS PROVES, IN A REAL BROWSER, THE WAY `the-check-is-drawn-on-the-runs-page.test.ts` DOES:
 *
 *   · a run whose checkout resolves a trunk draws THAT branch's name, on the row of where the work
 *     was cut from;
 *   · a run whose working directory is not a repository says on the work folder's row that no
 *     branch was read, and never says main.
 *
 * The `--against main` claim is the defect, so the case that matters asserts its ABSENCE.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'

let app: LiveApp
let page: Page
let trunkRun = ''
let noTrunkRun = ''
const en = createI18n('en')

const asPerson: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
/**
 * EACH WORKER WITH ITS OWN KEY, the one the office answered when the worker was registered. A run's own agent ends the
 * run only with a key, even while the key window is open, so each worker finishes its runs with it.
 */
const keys = new Map<string, string>()
function asItself(handle: string): Record<string, string> {
  const key = keys.get(handle)
  if (key === undefined) throw new Error(`this test kept no key for ${handle}`)
  return { ...asAgent(handle), 'x-mole-office-key': key }
}

async function post(path: string, body: unknown, headers = asPerson): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function patch(path: string, body: unknown, headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${app.api}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`PATCH ${path} answered ${String(res.status)}: ${await res.text()}`)
}

/**
 * A finished run of one worker. The legacy marker keeps the Git seal out of the way, which is what
 * the existing check-page test does: this file is about the sentence the page draws, not the seal.
 */
async function aRun(handle: string, title: string, extra: Record<string, unknown>): Promise<string> {
  const made = (await post(
    '/api/records',
    {
      kind: 'session',
      title,
      data: { state: 'running', servingAgent: handle, doing: 'building it', ...extra },
    },
    asAgent(handle),
  ))['record'] as { id: string }
  const historical = new Database(join(app.dir, 'panelx.db'))
  try {
    historical.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(made.id)
  } finally {
    historical.close()
  }
  await patch(`/api/records/${made.id}`, { dataPatch: { state: 'finished' } }, asItself(handle))
  return made.id
}

// IN DEVELOPER MODE, because the rows this file reads name the run's working folder and the
// branch it was cut from, and since item 3 of a decision, on C27, a run's check panel draws its
// working folder only there. What it proves about the branch's word is unchanged.
async function open(where: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${app.site}/?mode=inspect#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** The whole text of the check panel, or the empty string because no panel was drawn. */
async function panelText(): Promise<string> {
  return (await page.evaluate(() => document.querySelector('.chk')?.textContent ?? '')) as string
}

/** Each code row of the check panel: its label, the text of its code element, and the state word after it. */
async function theCodeRows(): Promise<{ label: string; value: string; state: string | null }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.chk dl.code-rows dt')].map((term) => ({
      label: term.textContent ?? '',
      value: term.nextElementSibling?.querySelector('code')?.textContent ?? '',
      state: term.nextElementSibling?.querySelector('.code-rows-state')?.textContent ?? null,
    })),
  )
}

/** What the run's own record stores about the checkout the office asked the check to read. */
async function storedCheckout(run: string): Promise<{ directory?: string; cutFrom?: string }> {
  const reply = await fetch(`${app.api}/api/records/${run}`)
  if (!reply.ok) throw new Error(`GET /api/records/${run} answered ${String(reply.status)}`)
  const said = (await reply.json()) as { record: { data: { theCheck?: { checkout?: { directory?: string; cutFrom?: string } } } } }
  return said.record.data.theCheck?.checkout ?? {}
}

beforeAll(async () => {
  app = await liveApp({ name: 'check-fork-sentence', viewport: { width: 1440, height: 900 } })
  page = app.page
  await post('/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, runtime: 'claude-code', role: 'secretary' })
  await post('/api/agents/started', {
    handle: 'inspector-one',
    name: 'Inspector One',
    runtime: 'claude-code',
    role: 'inspector',
  })
  for (const handle of ['fork-worker', 'records-worker']) {
    const started = await post(
      '/api/agents/started',
      {
        handle,
        name: handle,
        runtime: 'claude-code',
        role: 'worker',
        chapters: ['5:full'],
        workArea: ['work'],
      },
      asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    )
    keys.set(handle, (started['whatToGiveIt'] as { key: string }).key)
  }

  // THIS CHECKOUT: a working directory whose trunk resolves (main only, no origin/HEAD).
  trunkRun = await aRun('fork-worker', 'A run whose trunk resolves', { workingDirectory: process.cwd() })

  // NOT A REPOSITORY AT ALL: no trunk can be read, and the run has no recorded cutFrom.
  const notARepository = join(app.dir, 'not-a-repository')
  mkdirSync(notARepository, { recursive: true })
  const submitted = (await post(
    '/api/records',
    { kind: 'note', title: 'Submitted by the records-only run' },
    asAgent('records-worker'),
  ))['record'] as { id: string }
  noTrunkRun = await aRun('records-worker', 'A run whose trunk cannot be read', {
    workingDirectory: notARepository,
    submission: { kind: 'records', records: [submitted.id] },
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the check page draws the branch the checkout resolved, and never guesses main', () => {
  it('draws the branch the trunk resolved to when the working directory is a repository', async () => {
    await open(`/r/${trunkRun}`)
    const checkout = await storedCheckout(trunkRun)
    expect(typeof checkout.cutFrom, `no trunk was stored for ${trunkRun}`).toBe('string')
    // THE SERVER'S OWN BRANCH, drawn by name on the row of where the work was cut from. This is the
    // branch `inspectionTrunk` read, not a word this page assumed.
    expect(await theCodeRows()).toContainEqual({ label: en.t('chk.row.cutFrom' as WordKey), value: String(checkout.cutFrom), state: null })
  })

  it('says no branch could be read where the working directory is not a repository, and never claims main', async () => {
    await open(`/r/${noTrunkRun}`)
    const checkout = await storedCheckout(noTrunkRun)
    expect(checkout.directory, 'the run recorded no working directory, so this case proves nothing').toBeTruthy()
    expect(checkout.cutFrom, 'a trunk was read, so this case proves nothing').toBeUndefined()

    const rows = await theCodeRows()
    expect(rows).toContainEqual({ label: en.t('chk.row.workFolder' as WordKey), value: String(checkout.directory), state: en.t('chk.row.noBranchRead' as WordKey) })
    expect(rows.map((row) => row.label), 'a branch is drawn where none was read').not.toContain(en.t('chk.row.cutFrom' as WordKey))
    const text = await panelText()
    // THE DEFECT, WORD FOR WORD. Both the old fallback and any other claim to main fail here.
    expect(text).not.toContain('against main')
    expect(text).not.toContain('so the base is the fork point against main')
  })
})
