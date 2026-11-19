// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READ HANDED ON TO A SERVER, AND A DEV SERVER PAUSED JUST AFTER IT ANSWERED, for the two browser
 * tests that catch the page's own reads: tests/a-checklist-lead-cannot-reclaim-a-later-page.test.ts
 * and tests/a-cross-project-lead-keeps-its-destination.test.ts. Each had its own copy of both until
 * wave 13y round 59, and they were the same but for the name of the headers they sent.
 */
import { readFileSync } from 'node:fs'
import { expect } from 'vitest'
import type { Route } from 'playwright'

/**
 * EVERY READ THESE FILES HAND ON TO A SERVER goes out here, with the headers the page sent and
 * `connection: close`.
 *
 * Playwright sends route.fetch from one pool that keeps connections open, and Node reuses a kept
 * connection for the next read to the same server. A server that is slow to run when its
 * keep-alive limit comes closes that connection with the read on it unanswered, and the read is
 * reset. With `connection: close` each connection is closed after its answer and never kept, so no
 * read here goes out on a connection that an earlier answer left open.
 */
export const passOn = (route: Route) => route.fetch({ headers: { ...route.request().headers(), connection: 'close' } })

/**
 * FIXTURE FAULT: THE DEV SERVER DOES NOT RUN FOR SIX SECONDS JUST AFTER IT ANSWERED, AS ON A LOADED BOX.
 *
 * Every page load reads router.tsx, so the read before a load's own is the one the load before it
 * made. Here that earlier read is made just before this one, and the dev server is paused as soon
 * as its answer is in. This read is then sent while the server is paused. If the earlier answer
 * left its connection open, this read goes out on it. By the time the server runs again, its
 * five-second keep-alive limit for that connection has passed, so it closes the connection with
 * this read unanswered, and the page never gets router.tsx. Three queue runs of the checklist lead
 * test failed that way at the wait for the lead bar, with route.fetch saying "read ECONNRESET" or
 * "socket hang up". A queue run of the cross-project lead test failed that way in the case "chat
 * checklist, delayed route", with route.fetch saying "read ECONNRESET".
 *
 * The process paused is the one the test's own office, at `api`, recorded as serving the page.
 */
export async function theDevServerPausesAfterAnAnswer(route: Route, api: string, headers: Record<string, string>): Promise<void> {
  const ledger = await fetch(`${api}/api/resources`, { headers })
  const rows = ((await ledger.json()).resources as { type: string; key: string; detail: string }[])
    .filter(one => one.type === 'process' && one.detail.includes('a dev server because'))
  expect(rows, 'the process serving the page, as this test office recorded it').toHaveLength(1)
  const devServer = Number(rows[0]!.key)
  await passOn(route)
  process.kill(devServer, 'SIGSTOP')
  setTimeout(() => process.kill(devServer, 'SIGCONT'), 6000)
  // The pause has taken hold before this read goes out: the process's state reads T.
  const state = (): string | undefined => {
    const stat = readFileSync(`/proc/${String(devServer)}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(') ') + 2)[0]
  }
  await expect.poll(state).toBe('T')
}
