// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE UPDATE PAGE SAYS HOW THE START MEASURED WHAT AN UPDATE WOULD WRITE.
 *
 * A start with a migration pending measures on a copy of the database. A start with nothing pending makes no copy: it
 * runs the data steps on the database itself, inside one transaction it rolls back (src/server/db/migrate.ts,
 * `measureOnThisFile`). The start's refusal says which in `update.measuredOn`, the offer carries it, and the page of an
 * installed office says what the check did by it:
 *
 *   - measured on a copy: `theUpdate.page.found` and `theUpdate.page.nothingChanged`, as before;
 *   - measured on the database itself: `theUpdate.page.foundOnThisFile` and `theUpdate.page.nothingKept`.
 *
 * Which of the two the refusal says is tested in tests/a-start-with-nothing-pending-makes-no-copy.test.ts (cases 2 and
 * 6). Here the page is drawn in a browser from offers that say each, and from one that says neither. Each of its
 * requests is answered by the reduced mode itself through `inject`, as in
 * tests/an-installed-office-updates-on-the-owners-press.test.ts. Every sentence is read from the page's words by its
 * key.
 *
 * Mutations it must go red for: the page given the copy's sentences on both paths (the case "on the database itself");
 * the page given the database's sentences on both paths (the case "on a copy"); a reading that says neither drawn with
 * the copy's sentences (the last case).
 */
import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { BrowserContext } from 'playwright'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { freshDb, theBrowserThisWorkerShares, type TestDb } from './helpers.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import type { TheUpdateOffer } from '../src/shared/the-update.ts'

// The first test imports the server's modules cold, and starts the browser this worker shares.
vi.setConfig({ testTimeout: 30_000 })

let t: TestDb | undefined
afterEach(() => {
  t?.close()
  t = undefined
})

/** The address the browser opens. Nothing listens there: the reduced mode answers each request. */
const AT = 'http://the-waiting-office.test'

/** The page's sentence under `theUpdate.page.<key>`, from the words the page is sent. */
async function theWords(...keys: string[]): Promise<string[]> {
  const { enWave13n } = await import('../src/shared/words/en-wave-13n.ts')
  const words = enWave13n as Record<string, unknown>
  return keys.map((key) => {
    const word = words[`theUpdate.page.${key}`]
    expect(typeof word, `the page's words hold theUpdate.page.${key}`).toBe('string')
    return String(word)
  })
}

/** Answer every request the browser makes to AT by the reduced mode itself, through `inject`, with the browser's own headers. */
async function answeredByTheReducedMode(context: BrowserContext, app: FastifyInstance): Promise<void> {
  await context.route(`${AT}/**`, async (route) => {
    const request = route.request()
    const answer = await app.inject({ method: request.method() as 'GET' | 'POST', url: new URL(request.url()).pathname, headers: await request.allHeaders() })
    const headers = Object.fromEntries(Object.entries(answer.headers).map(([name, value]) => [name, String(value)]))
    await route.fulfill({ status: answer.statusCode, headers, body: answer.rawPayload })
  })
}

/**
 * What the page says once it has drawn the reading of an offer that says `measuredOn`, or once it has said it could
 * not read one. The browser holds no key, so the page is the one a person sees before pairing.
 */
async function whatThePageSays(measuredOn: unknown): Promise<string> {
  const db = await freshDb()
  t = db
  const backups = join(dirname(db.file), 'backups')
  mkdirSync(backups, { recursive: true })
  const offer = { file: db.file, holds: 'a test office', wouldWrite: ['a made-up line a migration would write'], backups, measuredOn } as TheUpdateOffer
  const { theReducedMode } = await import('../src/server/lib/the-update.ts')
  const { app } = theReducedMode({ sqlite: db.client.sqlite, offer, migrationsFolder: MIGRATIONS, headers: () => ({}), signals: new EventEmitter() })
  const [couldNotRead] = await theWords('couldNotRead')
  const context = await (await theBrowserThisWorkerShares()).newContext()
  try {
    await answeredByTheReducedMode(context, app)
    const page = await context.newPage()
    await page.goto(`${AT}/`)
    // DRAWN, or not: the offer's two panels, or the sentence the page says when it could not draw what it read.
    await page.locator('#the-update .panel').nth(1).or(page.getByText(String(couldNotRead))).first().waitFor()
    return await page.locator('#the-update').innerText()
  } finally {
    await context.close()
    await app.close()
  }
}

describe('the update page says how the start measured', () => {
  it('says the check ran on the database itself and that nothing was kept, for an offer measured on this file', async () => {
    const [foundOnThisFile, nothingKept, found, nothingChanged] = await theWords('foundOnThisFile', 'nothingKept', 'found', 'nothingChanged')
    const says = await whatThePageSays('this file' satisfies TheUpdateOffer['measuredOn'])
    expect(says).toContain(foundOnThisFile)
    expect(says).toContain(nothingKept)
    expect(says, 'the page said the check ran on a copy').not.toContain(found)
    expect(says).not.toContain(nothingChanged)
  })

  it('says the check ran on a copy and that no row was written, for an offer measured on a copy', async () => {
    const [found, nothingChanged, foundOnThisFile, nothingKept] = await theWords('found', 'nothingChanged', 'foundOnThisFile', 'nothingKept')
    const says = await whatThePageSays('a copy' satisfies TheUpdateOffer['measuredOn'])
    expect(says).toContain(found)
    expect(says).toContain(nothingChanged)
    expect(says, 'the page said the check ran on the database itself').not.toContain(foundOnThisFile)
    expect(says).not.toContain(nothingKept)
  })

  it('says neither for a reading that does not say how the start measured, and says it could not read it', async () => {
    const [couldNotRead, found, foundOnThisFile] = await theWords('couldNotRead', 'found', 'foundOnThisFile')
    const says = await whatThePageSays(undefined)
    expect(says).toContain(couldNotRead)
    expect(says, 'the page fell back to the copy').not.toContain(found)
    expect(says).not.toContain(foundOnThisFile)
  })
})
