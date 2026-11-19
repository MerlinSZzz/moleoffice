// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE THAT RE-READS KEEPS WHAT IT HAS UNTIL THE NEW ANSWER ARRIVES. Criterion E5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE HOOK DID, AND WHAT IT DOES NOW
 * ---------------------------------------------------------------------------------------
 *
 * useAsync in src/web/components/ui.tsx used to reset to its loading state at the start of every
 * read, so a page that re-read — after a write, after a Recheck press, after a reload() — unmounted
 * what the reader was reading and drew a skeleton for the length of the read. E5: the previous
 * answer stays on the screen, the page says it is refreshing, and the newer answer replaces it when
 * it lands. Only a read with nothing to show yet draws loading. A failed re-read keeps what is on
 * screen and says the failure beside it; it must not leave the old answer looking current.
 *
 * EVERY CASE HERE RUNS AGAINST A REAL PAGE IN A REAL BROWSER, because what E5 changes is what the
 * screen does between two states — exactly the property a unit test cannot see. The specimen page
 * is Runtime: one useAsync, one read, one Read again press. The hook is shared by 129 call sites in
 * 58 files, so one honest specimen exercises the shared code, and the strip the reader actually
 * sees (ReReadStrip, drawn once in the shell) is drawn from the same store the hook writes.
 *
 * THE HOLD IS WHAT TURNS A RACE INTO AN ASSERTION. Playwright intercepts the page's read and holds
 * the reply open. While it is held, the older answer must still be on the screen with the
 * refreshing mark beside it; when the reply is released, the newer answer must replace it. A reply
 * made to fail is fulfilled with the door's own error shape, so the page reads a refusal that says
 * what any real refusal says.
 *
 * A CHANGE OF PROJECT IS HELD ELSEWHERE. A project page keeps its rows through a switch, marked as
 * being read again, and a reading that does not belong to a project is not read again at all.
 * tests/a-switch-of-project-reads-again-only-what-belongs-to-a-project.test.ts samples every frame
 * of a real switch for both. This file does not repeat it.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Route } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'reread-keeps', viewport: { width: 1440, height: 1000 } })
})

afterEach(async () => {
  // A test that stopped halfway must not leave its hold on the next one's reads.
  await app.page.unroute('**/api/runtime')
})

afterAll(async () => {
  await app.stop()
})

/**
 * HOLDING A READ, WITHOUT FORGING A REPLY.
 *
 * The browser's own guard refuses any reply that does not say which Mole Office it came from, in
 * the server's own encoded form (criterion G3), so a reply this test composes by hand would be
 * refused as a change of world before the page ever read it. Instead each held request really goes
 * to the server — `route.fetch()` — and the server's own reply is kept back from the page until the
 * test releases it, headers intact. A test that needs a different answer overrides only the body; a
 * test that needs a refusal overrides only the status and the body.
 */
interface HeldRead {
  route: Route
  response: Promise<Awaited<ReturnType<Route['fetch']>>>
}

async function holdTheNextRead(route: Route, held: HeldRead[]): Promise<void> {
  const pending = route.fetch()
  held.push({ route, response: pending })
  await pending
}

/** Wait until a hold exists, then hand it over and take it off the queue, so it is released once. */
async function waitForTheHold(held: HeldRead[], quietMs = 10_000): Promise<HeldRead | null> {
  const until = Date.now() + quietMs
  while (held.length === 0) {
    if (Date.now() > until) return null
    await new Promise((r) => setTimeout(r, 20))
  }
  return held.shift() as HeldRead
}

async function releaseTheRead(read: HeldRead, body?: string): Promise<void> {
  const response = await read.response
  const headers = response.headers()
  delete headers['content-length']
  await read.route.fulfill({
    status: response.status(),
    headers,
    ...(body === undefined ? { body: await response.text() } : { body }),
  })
}

/** Refuse a read the way the door refuses, with the server's own headers and the door's own shape. */
async function refuseTheRead(route: Route, error: string, reason: string): Promise<void> {
  const response = await route.fetch()
  const headers = response.headers()
  delete headers['content-length']
  await route.fulfill({ status: 500, headers, body: JSON.stringify({ error, reason }) })
}

/** Go to the Runtime page and wait until its answer is on the screen, in the mode the address names if it names one. */
async function openRuntimePage(mode?: 'normal' | 'inspect'): Promise<void> {
  const asked = mode === undefined ? '' : `?mode=${mode}`
  await app.page.goto(`${app.site}/${asked}#/`)
  await app.page.goto(`${app.site}/${asked}#/runtime`)
  await app.page.waitForSelector('.rt-again', { timeout: 20_000 })
  // Everything the shell reads on the way in has settled by the time this press is on the screen.
  await app.page.waitForSelector('.px-reread', { state: 'detached', timeout: 20_000 })
}

describe('a page that re-reads keeps what it has (E5)', () => {
  it('keeps the previous answer on the screen during a re-read, marked refreshing, and replaces it when the newer answer lands', async () => {
    await openRuntimePage()

    const held: HeldRead[] = []
    await app.page.route('**/api/runtime', (route) => holdTheNextRead(route, held))

    await app.page.click('.rt-again')

    // THE MARK: the page says it is refreshing while the newer answer is on its way.
    await app.page.waitForSelector('.px-reread-what', { timeout: 5_000 })
    expect(await app.page.locator('.px-reread').textContent()).toContain('Refreshing…')

    // THE KEEP: what was on screen is still on screen, held reply or no held reply.
    await app.page.waitForSelector('.rt-when', { timeout: 5_000 })
    await app.page.waitForSelector('.rt-again', { timeout: 5_000 })

    // THE REPLACE: the newer answer lands, and the mark goes with it. The body is the server's own
    // answer with one field marked, so the page can be told the two answers apart.
    const read = await waitForTheHold(held)
    if (read === null) throw new Error('the re-read was never held')
    const realAnswer = (await (await read.response).json()) as { readAt: string }
    await releaseTheRead(read, JSON.stringify({ ...realAnswer, readAt: 'E5 THE NEWER ANSWER' }))
    await app.page.waitForSelector('text=E5 THE NEWER ANSWER', { timeout: 5_000 })
    // THE MARK IS WAITED FOR, NOT COUNTED ONCE. The answer and the mark are two updates: the hook
    // sets its answer, then tells the store, and the strip counts every read in flight on the page.
    // So the strip can still be drawn in the frame the answer appears in, and a single count there
    // failed once in merge entry sAscB20eAibj's bus (count 1, passing on the re-run). The mark must
    // still go, within the limit.
    await expect.poll(() => app.page.locator('.px-reread').count(), { timeout: 5_000 }).toBe(0)
  })

  it('draws loading on the first read, and does not call a first read refreshing', async () => {
    // A FRESH PAGE, not the shared one: the shell's own reads re-read when the address changes, and
    // on the shared page they have previous answers to keep, which would put the refreshing mark on
    // the screen for reasons that have nothing to do with this page's first read. On a fresh page
    // every read in flight is a first read, so the strip has nothing to say and must say it.
    const fresh = await app.browser.newPage({ viewport: { width: 1440, height: 1000 } })

    const held: HeldRead[] = []
    await fresh.route('**/api/runtime', (route) => holdTheNextRead(route, held))

    await fresh.goto(`${app.site}/#/runtime`)

    // The first read has nothing to show yet, so it draws the skeleton it always drew...
    await fresh.waitForSelector('.px-loading:has-text("what is running")', { timeout: 20_000 })
    // ...and the strip does not claim a previous answer is on the screen, because none is.
    expect(await fresh.locator('.px-reread').count()).toBe(0)

    // React StrictMode mounts, unmounts and remounts every component in development, and the
    // shell's own world check reads this same address when the page starts, so the first read is
    // really made several times. Every held copy is released — each one is the server's own
    // answer, and each run of the hook is waiting for its own — until no more arrive.
    let released = 0
    for (;;) {
      const read = await waitForTheHold(held, 700)
      if (read === null) break
      await releaseTheRead(read)
      released += 1
      if (released > 8) throw new Error(`more held first reads than expected: ${String(released)}`)
    }
    await fresh.waitForSelector('.rt-again', { timeout: 20_000 })
    await fresh.close()
  })

  // A FAILED RE-READ HERE IS A BROKEN ANSWER (a 500), so point (2) of decision z_A0xVMbWOzh says what is drawn
  // beside the kept answer: the page's own sentence in Normal mode, and the server's text only in Developer
  // mode. Before that decision the server's sentence was drawn in every mode and this test read it there;
  // the expectation followed the decision in wave 13k round 41b. Control .scratch/r41b/p2-control.log; the server's
  // text in every mode turns the Normal case red (p2-m1b), and no server text in Developer mode turns that case red
  // (p2-m2); restore p2-restore.
  for (const mode of ['normal', 'inspect'] as const) it(`says a failed re-read beside the answer it kept, and keeps the press that led there (${mode})`, async () => {
    await openRuntimePage(mode)
    const readAtBefore = await app.page.locator('.rt-when').textContent()

    await app.page.route('**/api/runtime', (route) =>
      refuseTheRead(route, 'the scratch reading failed on purpose', 'the reading failed on purpose'),
    )
    await app.page.click('.rt-again')

    // THE KEEP: a failed re-read does not discard what is on screen.
    expect(await app.page.locator('.rt-when').textContent()).toBe(readAtBefore)

    // THE SAY: the failure is named, in words, beside what is still there, and the press that led
    // here is still on the screen to try again with. The mark says refreshing first — the failure
    // only becomes known when the refused reply lands — so this waits for the words themselves.
    await app.page.waitForFunction(
      () => document.querySelector('.px-reread')?.textContent?.includes('A newer read failed.') === true,
      undefined,
      { timeout: 10_000 },
    )
    const said = await app.page.locator('.px-reread').textContent()
    expect(said).toContain(en['error.brokenSays'])
    if (mode === 'inspect') expect(said).toContain('the scratch reading failed on purpose')
    else expect(said).not.toContain('failed on purpose')
    expect(await app.page.locator('.rt-again').count()).toBe(1)

    // AND IT CLEARS: a later read that succeeds takes the failure away, with the answer still on
    // the screen. That the answer is REPLACED by the newer one is the first test's subject; the
    // read stamp is second-precision, so this test does not try to tell one second from the next.
    await app.page.unroute('**/api/runtime')
    await app.page.click('.rt-again')
    await app.page.waitForFunction(() => document.querySelector('.px-reread') === null, undefined, { timeout: 10_000 })
    expect(await app.page.locator('.rt-when').count()).toBe(1)
  })
})
