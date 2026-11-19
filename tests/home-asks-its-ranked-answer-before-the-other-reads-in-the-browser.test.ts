// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME ASKS ITS RANKED ANSWER BEFORE THE FRAME'S OTHER READS.
 *
 * Wave 13y round 143, item 82: Home is to finish its first burst of reads within about a second on an office of the
 * live size. The ranked answer is worked out on a thread of its own, while the server answers the other reads one at a
 * time. On the made-up office of 4 November, shaped like the live project, the frame asked it after its other reads, so
 * it waited behind them in the browser's connections and in the server's line, and reached its thread about a second
 * after the page asked it. The frame now asks it first, in a layout effect.
 *
 * WHAT IS HELD HERE: on Home, the frame asks Home's first page of the ranked answer before the project list, the
 * waiting list and the person's words, which the frame asks in its own passive effects; and it asks it once.
 *
 * THE MUTATION THAT TURNS IT RED, after a green control run: in src/web/App.tsx, take out the layout effect that asks
 * `readAttentionHomeOnce.again()`. The `useAsync` below it still asks, after the three reads.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'home-ranked-first', workspace: 'default', viewport: { width: 1440, height: 1000 } })
}, 180_000)
afterAll(async () => {
  await app?.stop()
}, 180_000)

it('asks Home\'s ranked answer before the frame\'s other reads, and once', async () => {
  const asked: string[] = []
  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/')) asked.push(`${url.pathname}${url.search}`)
  })
  await app.page.goto(`${app.site}/?lang=en&look=light&mode=normal#/`)
  await waitForThePage(app.page, 60_000)
  const theRankedAnswer = (path: string): boolean => path.startsWith('/api/attention?') && new URLSearchParams(path.slice(path.indexOf('?'))).get('shape') === 'home'
  // ONCE: the frame's `useAsync` asks it too, and joins the read the layout effect began.
  await expect.poll(() => asked.filter(theRankedAnswer).length, { timeout: 30_000 }).toBe(1)
  const first = (pathname: string): number => asked.findIndex((path) => path === pathname || path.startsWith(`${pathname}?`))
  const ranked = asked.findIndex(theRankedAnswer)
  for (const other of ['/api/workspaces', '/api/waiting', '/api/the-persons-words']) {
    expect(first(other), `${other} was asked`).toBeGreaterThan(-1)
    expect(ranked, `the ranked answer is asked before ${other}; the reads in order: ${asked.join(', ')}`).toBeLessThan(first(other))
  }
}, 120_000)
