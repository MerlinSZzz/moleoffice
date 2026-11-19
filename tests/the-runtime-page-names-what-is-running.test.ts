// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ACT 2 OF THE HUMAN ACT: A PAGE NAMES THE API, THE DATABASE, THE HEAD AND THE FRESHNESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Section 4 of design/ground/ACCEPTANCE.md, act 2. The GROUND verifier could not perform it: no
 * page in the browser app drew any of the four facts, and they were reachable only with curl.
 * Problem `M0nt8uVDPnNv`.
 *
 * The act now names the page — `#/runtime` — and this is the proof that the page names the four.
 *
 * IT DOES NOT CONTRADICT F2, and the last test here is what keeps that true. That answer was about
 * what an ORDINARY page draws while somebody is working, and the answer is nothing. So the ordinary
 * pages are checked as well: they draw none of it, and the shell offers no row to this one.
 *
 * ---------------------------------------------------------------------------------------
 * IN A REAL BROWSER AGAINST A REAL SERVER
 * ---------------------------------------------------------------------------------------
 *
 * The facts are what a running process says about itself, so a stub would be a test of the stub.
 * `liveApp` starts an API and a Vite of its own, on a throwaway database, and registers both.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('the runtime page names what is running', () => {
  let app: LiveApp
  let page: Page
  let drawn: string

  beforeAll(async () => {
    app = await liveApp({ name: 'runtime-page', viewport: { width: 1440, height: 1200 } })
    page = app.page
    // THE AGENT THE MEASURED START IS SEEDED AS IS REGISTERED FIRST. The records door refuses a
    // write under an agent id no registry row holds, and the session below is filed as
    // `the-runtime-page-render`. The subject here is the Runtime page's reading, not the transport.
    const registered = await fetch(`${app.api}/api/agents/started`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      },
      body: JSON.stringify({ handle: 'the-runtime-page-render', name: 'The Runtime Page Render' }),
    })
    if (!registered.ok) throw new Error(`registering the renderer answered ${String(registered.status)}: ${await registered.text()}`)
    await page.goto(`${app.site}/#/runtime`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.rt-facts', { timeout: 30_000 })
    await sleep(600)
    drawn = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('names the API it is talking to, with the port and the process', () => {
    expect(drawn).toContain(`127.0.0.1:${String(app.apiPort)}`)
    expect(drawn).toContain(String(app.apiPort))
    // The process and its group, which is what makes a stop possible and safe.
    expect(drawn).toMatch(/PROCESS\s+\d+ in group \d+/i)
  })

  /**
   * THE ADDRESS IT ANSWERS ON AND THE ADDRESS ITS SETTINGS DECLARE ARE TWO FACTS, DRAWN AS TWO.
   *
   * The test above is what caught problem `ES5fb2_BHsVn`: it passed in a worktree with no `.env`
   * and failed in the live checkout, because the page drew the declared address as the one being
   * answered on and the live checkout declares a MOLE_OFFICE_PORT of its own. This one pins both halves of the fix, so a
   * page that went back to drawing one address fails here whichever checkout it runs in.
   */
  it('draws the address it answers on and the declared one as two separate facts', async () => {
    expect(drawn).toMatch(new RegExp(`ADDRESS IT ANSWERS ON\\s+http://127\\.0\\.0\\.1:${String(app.apiPort)}\\b`, 'i'))
    expect(drawn).toMatch(/ADDRESS ITS SETTINGS DECLARE\s+http:\/\/127\.0\.0\.1:\d+/i)
    const addresses = await page.evaluate(async (api: string) => {
      const answered = await fetch(`${api}/api/runtime`)
      return ((await answered.json()) as { addresses: { declaredApi: string; says: string | null } }).addresses
    }, app.api)
    expect(drawn).toContain(addresses.declaredApi)
    // A SENTENCE WHEN THEY DIFFER, AND NOTHING WHEN THEY DO NOT. A scratch stack started from a
    // checkout with a `.env` differs from what that `.env` declares; one started from a checkout
    // without a `.env` does not. Both are ordinary, and the page says whichever the server said.
    if (addresses.says === null) {
      expect(addresses.declaredApi).toBe(`http://127.0.0.1:${String(app.apiPort)}`)
    } else {
      expect(drawn).toContain(addresses.says)
    }
  })

  it('names the database, by path and by identity, and says whether it is the canonical one', async () => {
    // The path this test's own server was told to open.
    const database = await page.evaluate(async (api: string) => {
      const answered = await fetch(`${api}/api/runtime`)
      return ((await answered.json()) as { database: { path: string } }).database.path
    }, app.api)
    expect(drawn).toContain(database)
    // THE IDENTITY, which is the thing that tells a copy from the file it was copied from. Sixteen
    // hexadecimal characters, the same ones the world header carries.
    expect(drawn).toMatch(/IDENTITY\s+[0-9a-f]{16}/i)
    // A test database is not the canonical one, and the page says which it is either way.
    expect(drawn).toContain('the canonical one is')
  })

  it('names the commit and whether the tree is dirty', async () => {
    const head = await page.evaluate(async (api: string) => {
      const answered = await fetch(`${api}/api/runtime`)
      return ((await answered.json()) as { repository: { head: { short: string; full: string } | null } }).repository.head
    }, app.api)
    expect(head).not.toBeNull()
    expect(drawn).toContain(head?.short ?? 'no commit')
    expect(drawn).toContain(head?.full ?? 'no commit')
    // Both readings are drawn in words rather than as a flag nobody can read.
    expect(drawn).toMatch(/UNCOMMITTED CHANGES\s+(yes, the tree is dirty|no, the tree is clean)/i)
  })

  it('names the freshness of both halves, with the times', () => {
    // THE SERVER'S HALF: when it loaded its own code, what the newest file it is built from is, and
    // the verdict in the server's own sentence.
    expect(drawn).toMatch(/THE SERVER LOADED ITS OWN CODE AT\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/i)
    expect(drawn).toContain('THE NEWEST FILE THE SERVER IS BUILT FROM')
    expect(drawn).toMatch(/This server loaded its own code as it was at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
    // THE PAGE'S HALF: when Vite served it, and which file was newest then.
    expect(drawn).toMatch(/THIS PAGE WAS SERVED AT\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/i)
    expect(drawn).toContain('THE NEWEST FILE IT WAS SERVED')
  })

  it('draws no banner, because this stack is where it thinks it is', async () => {
    // The page that names the facts is not the page that shouts about them. A scratch stack on its
    // own port has made nobody's mistake, and act 2 is not act 3.
    const banner = await page.evaluate(() => document.querySelector('.px-ww') !== null)
    expect(banner).toBe(false)
  })

  it('and an ordinary page still draws none of it, which is the owner’s F2 answer', async () => {
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1200)
    const ordinary = await page.evaluate(() => ({
      facts: document.querySelector('.rt-facts') !== null,
      text: document.body.innerText.replace(/\s+/g, ' '),
      banner: document.querySelector('.px-ww') !== null,
    }))
    expect(ordinary.facts).toBe(false)
    expect(ordinary.banner).toBe(false)
    expect(ordinary.text).not.toContain('THE NEWEST FILE THE SERVER IS BUILT FROM')
    expect(ordinary.text).not.toContain('UNCOMMITTED CHANGES')
  }, 60_000)

  it('draws the steps of a measured start and the ceiling in its two numbers', async () => {
    // A REAL START, SEEDED THROUGH THE API THE WAY AN AGENT WOULD MAKE ONE: a finished session with
    // a usage receipt and a startedAt, a restoring read under it, and one write outside its own
    // record to end the start. Every one of those requests leaves an `api_calls` row, which is what
    // the office measures the steps from. Nothing here writes a step by hand.
    const headers = {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'the-runtime-page-render',
    }
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'session',
        title: 'A start the Runtime page draws',
        data: {
          state: 'finished',
          runtime: 'claude-code',
          startedAt: localStamp(new Date(Date.now() - 4_000)),
          usageReceipt: { runtime: 'claude-code', model: 'claude-sonnet-5', inputTokens: 100, inputIncludesCached: true },
        },
      }),
    })
    const sessionId = ((await filed.json()) as { record: { id: string } }).record.id
    const withSession = { ...headers, 'x-mole-office-session': sessionId }

    // THE RESTORING READ: a real request whose operation the office records.
    const onboarding = await fetch(`${app.api}/api/onboarding?directory=${encodeURIComponent(app.dir)}`, {
      headers: withSession,
    })
    expect(onboarding.status, 'the restoring read must reach the office').toBeLessThan(400)
    // THE FIRST WRITE OUTSIDE THE SESSION RECORD, which ends the start and times the last step.
    const written = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: withSession,
      body: JSON.stringify({ kind: 'note', title: 'The first write outside the start', data: {} }),
    })
    expect(written.status, 'the first write must reach the office').toBeLessThan(400)

    // THE READ THE PAGE WILL DRAW, asked directly first so a measurement failure is diagnosed here
    // rather than as a panel that never appears.
    const panelRead = (await (
      await fetch(`${app.api}/api/runtime`, { headers: { 'x-mole-office-workspace': 'default' } })
    ).json()) as { starts: { recent: { sessionId: string; cost: { measured: boolean } }[] } }
    const measured = panelRead.starts.recent.find((row) => row.sessionId === sessionId)
    expect(measured, 'the seeded session is in the panel read').toBeDefined()
    expect(measured!.cost.measured, JSON.stringify(measured!.cost)).toBe(true)

    await page.goto(`${app.site}/#/runtime`, { timeout: 60_000 })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.rt-steps', { timeout: 30_000 })
    await sleep(600)
    const panel = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    expect(panel, 'the ceiling is drawn in its two numbers').toContain('The start ceiling: 15,000 tokens, 2 minutes')
    for (const step of ['registering', 'restoring', 'the first write']) {
      expect(panel, `the panel draws the ${step} step`).toContain(step)
    }
  }, 120_000)

  it('and the shell offers no row to it, so it is a page you go to on purpose', () => {
    // The rail says where the work is. Two other pages are reachable and unlisted for the same kind
    // of reason, and tests/shell-nav.test.ts pins the list of those three.
    const rail = readFileSync(`${repo}src/web/components/Sidebar.tsx`, 'utf8')
    const rows = rail.slice(rail.indexOf('DESTINATIONS'), rail.indexOf('PAGE_TITLES'))
    expect(rows).not.toContain("'/runtime'")
    expect(rows).not.toContain('What is running')
  })
})
