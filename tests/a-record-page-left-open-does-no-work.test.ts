// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD PAGE LEFT OPEN DOES NO WORK WHILE NOBODY TOUCHES IT.
 *
 * Problem De8tynU4pSQj, measured on 25 September 2026: an idle record page kept one processor core
 * busy. React drew the whole office page 1,042 to 1,413 times in 5 seconds, and the page did 4.87
 * seconds of work in those 5 seconds. The cause was in src/web/App.tsx: the record page tells the
 * shell which kind of record it shows, and the shell stored a new object on every telling. Storing
 * it drew the shell again, which handed the record page a new function, which told the kind again.
 *
 * This test opens a record page in a real browser, waits until the page says it has finished, and
 * then leaves it alone for five seconds. It measures two things over those seconds:
 *
 *   1. How many times React finished drawing (a "commit"). It counts them with the hook React
 *      itself looks for when a developer tool is installed: `__REACT_DEVTOOLS_GLOBAL_HOOK__`. The
 *      hook is put on the window before the page's own code runs, and React calls its
 *      `onCommitFiberRoot` once for every commit.
 *   2. How long the page's main thread was busy, read from the browser itself
 *      (`Performance.getMetrics`, the `TaskDuration` figure, in seconds).
 *
 * A render test cannot see this, because the loop runs through an effect and a state change, and
 * renderToStaticMarkup runs neither.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API on a port of its own with a database of its own;
 * nothing here reaches the live office's port.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordPath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** How long the page is left alone while it is measured. */
const IDLE_MS = 5_000

/**
 * AT MOST 20 COMMITS IN THE FIVE IDLE SECONDS.
 *
 * Measured on 25 September 2026 with this file: with the fix, 0 or 1 commits in the idle seconds;
 * with the old line put back, 1,532 to 1,703. A late answer from the server may honestly draw the
 * page a few times, and the loop draws it about 300 times a second, so 20 sits far from both.
 */
const MOST_COMMITS_WHILE_IDLE = 20

/**
 * AT MOST 0.5 SECONDS OF MAIN-THREAD WORK IN THE FIVE IDLE SECONDS.
 *
 * Measured on 25 September 2026 with this file: with the fix, 0.001 to 0.003 seconds; with the old
 * line put back, 4.80 to 4.82 seconds. Half a second leaves room for a slow shared machine and is
 * about a tenth of what the loop does.
 */
const MOST_BUSY_SECONDS_WHILE_IDLE = 0.5

let app: LiveApp
let recordId = ''

beforeAll(async () => {
  app = await liveApp({
    name: 'record-page-idle',
    viewport: { width: 1440, height: 1000 },
    workspace: 'default',
  })

  // THE COUNTER, put on the window before any of the page's code runs. React reads this object once
  // when it starts: `supportsFiber` says the tool can read React's tree, `inject` must answer an id,
  // and React calls `onCommitFiberRoot` after every commit. The other three are called by React
  // and have nothing to do here.
  await app.page.addInitScript(() => {
    const w = window as unknown as { __commits: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
    w.__commits = 0
    let nextId = 0
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => ++nextId,
      onCommitFiberRoot: () => {
        w.__commits += 1
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    }
  })

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'note', title: 'A note left open on the screen' }),
  })
  expect(filed.status, `filing the note: ${await filed.clone().text()}`).toBe(201)
  recordId = ((await filed.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a record page left open', () => {
  it('does not keep drawing itself, and leaves the processor alone', async () => {
    const { page } = app
    await page.goto(`${app.site}/#${recordPath(recordId)}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.getByText('A note left open on the screen').first().waitFor({ timeout: 30_000 })

    // THE COUNTER IS WIRED. React drew the page, so it must have called the hook at least once. A
    // zero here would mean React never found the hook, and a zero below would then prove nothing.
    const commitsToDraw = await page.evaluate(() => (window as unknown as { __commits: number }).__commits)
    expect(commitsToDraw, 'commits while the page was drawn: React never called the counter').toBeGreaterThan(0)

    const browser = await page.context().newCDPSession(page)
    await browser.send('Performance.enable')
    const busySeconds = async (): Promise<number> => {
      const { metrics } = await browser.send('Performance.getMetrics')
      const found = metrics.find((m) => m.name === 'TaskDuration')
      if (found === undefined) throw new Error('The browser gave no TaskDuration figure.')
      return found.value
    }

    const commitsBefore = await page.evaluate(() => (window as unknown as { __commits: number }).__commits)
    const busyBefore = await busySeconds()
    await page.waitForTimeout(IDLE_MS)
    const commitsAfter = await page.evaluate(() => (window as unknown as { __commits: number }).__commits)
    const busyAfter = await busySeconds()
    await browser.detach()

    const commitsWhileIdle = commitsAfter - commitsBefore
    const busyWhileIdle = busyAfter - busyBefore
    // Written to the log so a run shows how far from each limit it was, not only which side.
    console.log(`idle ${IDLE_MS} ms: ${commitsWhileIdle} commits, ${busyWhileIdle.toFixed(3)} s of work`)
    // Both are soft, so a failing run reports both figures rather than stopping at the first.
    expect.soft(commitsWhileIdle, `React commits in ${IDLE_MS} ms with nobody touching the page`).toBeLessThanOrEqual(
      MOST_COMMITS_WHILE_IDLE,
    )
    expect.soft(busyWhileIdle, `seconds of main-thread work in ${IDLE_MS} ms with nobody touching the page`).toBeLessThanOrEqual(
      MOST_BUSY_SECONDS_WHILE_IDLE,
    )
  })
})
