// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13j round 14): the two projects' records were open problems read on #/records. All
// records now reads across projects and a switch of project no longer changes its rows, which a decision brought
// about. So the records are ideas read on #/ideas, one of the project's own pages. What
// the file proves about a switch of project is unchanged.
// Criterion change (wave 13y round 170): the first case asked that no frame of a switch draw a row of the
// previous project, and that the page say it was loading while the new rows were held. A switch of project now
// leaves a project page's rows on screen, marked as being read again, until the new rows come, and it reads
// nothing again that does not belong to a project. What each frame draws is asked by
// tests/a-switch-of-project-reads-again-only-what-belongs-to-a-project.test.ts. This file keeps criterion M61.
/**
 * A SWITCH OF PROJECT RELOADS NOTHING, AND THE NEW PROJECT'S ROWS TAKE THE PLACE OF THE OLD ONES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M61 of design/messages/ACCEPTANCE.md: switching project does not reload the app. Until
 * 6 September 2026 `App` hung the whole shell off a React `key` naming the project, so a switch threw
 * the whole interface away and built it again. The first case proves, on one of the project's own pages:
 *
 *   1. Project alpha is read, and ITS RECORD IS PROVED TO BE ON SCREEN, so that its absence later
 *      means something.
 *   2. A mark is written on `window` and on the shell's element. A reload loses the first, and a
 *      shell built again loses the second. Nothing React draws can put a hand-written property back.
 *   3. The reader switches to beta.
 *   4. Beta's records arrive, alpha's is gone from the document, and both marks are still there.
 *
 * The second case proves that the counts in the frame move with the project, and that the list of
 * projects is not read again.
 *
 * A real browser, a real Vite dev server, a real API and a throwaway database with two projects in
 * it, with distinctively-titled records.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT COSTS AND WHY IT IS WORTH IT
 * ---------------------------------------------------------------------------------------
 *
 * It starts two servers and a browser, so it is the slowest test in this repository — roughly
 * fifteen seconds. Playwright and Chromium are already here (tools/review.mjs photographs every
 * page with them), so it adds no dependency. Both servers are started in their own process GROUP
 * and stopped by group in a `finally`, and the ports are proved free afterwards: this project has
 * had five orphaned-process incidents, one of which served stale data out of a deleted database.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { switchTheProject, theProjectIdOnScreen, waitForTheProjects } from './switch-the-project.ts'

import { commandThatStopsWithItsOwner, apiServerArguments, anApiServerOfItsOwn, waitForItsOwnVite } from './helpers.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

/**
 * The two projects. Each has one distinctively-titled problem, so a record of one can never be
 * mistaken for a record of the other. Beta holds a second problem on purpose: its count is 2 and
 * alpha's is 1, so the second test below can tell one project's number from the other's, which one
 * record each could not.
 */
const ALPHA = { id: 'alpha', title: 'Alpha', record: 'The gripper slips at 40N' }
const BETA = { id: 'beta', title: 'Beta', record: 'The reindex drops a claim', second: 'The bay double-books after a restart' }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.on('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
  })
}

interface Service {
  label: string
  child: ChildProcess
  log: string[]
}

const started: Service[] = []

/** Start a child as its own process GROUP, so everything it starts in turn dies with one signal. */
function start(label: string, command: string, args: string[], env: NodeJS.ProcessEnv): Service {
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const service: Service = { label, child, log: [] }
  const keep = (chunk: unknown) => {
    for (const line of String(chunk).split('\n')) if (line.trim() !== '') service.log.push(line)
    if (service.log.length > 100) service.log.splice(0, service.log.length - 100)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  child.on('error', (err) => service.log.push(`could not start ${command}: ${err.message}`))
  started.push(service)
  return service
}

async function stopGroup(service: Service): Promise<void> {
  const { child } = service
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return
    throw err
  }
  const exited = await Promise.race([once(child, 'exit').then(() => true), sleep(5_000).then(() => false)])
  if (exited) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Already gone between the two signals, which is the outcome that was wanted.
  }
  await Promise.race([once(child, 'exit'), sleep(5_000)])
}

let dir: string
let apiPort: number
let webPort: number
let browser: Browser
let page: Page

/**
 * How long the reply to `GET /api/workspaces` is held open. 0 lets it through.
 *
 * Switching project reads again what a page shows of the project, and the list of projects was once
 * read again with it. While it is in flight the switcher is not a select at all: it is a paragraph reading
 * "<id> · reading the other projects…". The second test used to wait only for the new project's
 * RECORD and then read the sidebar, so whether it passed depended on which of two unordered
 * replies won. On 28 August 2026 the record won and the test failed with
 * `expected 'Mole Office\nNarrow the sidebar to ic…' to contain 'Alpha'`, against a page that was
 * behaving correctly and would have been right a few milliseconds later.
 *
 * Widening the wait would have hidden that rather than settled it. Holding this one reply open
 * makes the in-flight window CERTAIN instead of lucky, so the test now asserts about both states
 * on purpose: what the switcher says while the list is coming, and what it says once it is here.
 */
let slowWorkspacesMs = 0

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mole-office-switch-'))
  // The server migrates the database it is pointed at when it boots, so a path that does not
  // exist yet becomes a fully migrated, empty Mole Office — the same shape `npm run db:migrate` makes.
  // Taken only from itself, and started again on other ports when its port was taken.
  // `anApiServerOfItsOwn` in tests/helpers.ts says why.
  const stack = await anApiServerOfItsOwn('the API server of tests/workspace-switch.test.ts', dir, (env) =>
    start('the API server', join(root, 'node_modules', '.bin', 'tsx'), apiServerArguments(), env),
  )
  apiPort = stack.apiPort
  webPort = stack.webPort
  const { env } = stack

  const post = async (path: string, body: unknown, workspace?: string) => {
    const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(workspace === undefined ? {} : { 'x-mole-office-workspace': workspace }),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${res.status}: ${await res.text()}`)
    return res.json() as Promise<Record<string, unknown>>
  }

  for (const project of [ALPHA, BETA]) {
    await post('/api/workspaces', { id: project.id, title: project.title })
    // AN IDEA, so the record is drawn on #/ideas, one of the project's own pages. It was an open
    // problem read on #/records; All records reads across projects since a decision.
    await post('/api/records', { kind: 'idea', title: project.record, data: {} }, project.id)
  }
  // Beta's second record, so the two projects hold different numbers of records.
  await post('/api/records', { kind: 'idea', title: BETA.second, data: {} }, BETA.id)

  const watched = commandThatStopsWithItsOwner(join(root, 'node_modules', '.bin', 'vite'), ['--strictPort', '--host', '127.0.0.1'])
  const web = start(
    'Vite',
    watched.command, watched.args,
    env,
  )
  await waitForItsOwnVite(web, webPort, apiPort)

  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (err) => {
    throw new Error(`the page threw: ${err.message}`)
  })

  // Every API reply passes through here, so the test can hold the list of projects open at the moment it chooses.
  await page.route('**/api/**', async (route) => {
    if (slowWorkspacesMs > 0 && new URL(route.request().url()).pathname === '/api/workspaces') {
      await sleep(slowWorkspacesMs)
    }
    await route.continue()
  })
}, 180_000)

afterAll(async () => {
  await browser?.close()
  for (const service of started) await stopGroup(service)
  // The servers are stopped, so the folder goes now. After the port checks, a failed check would leave it behind.
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  // PROVE the ports came back rather than assuming a signal worked.
  for (const port of [apiPort, webPort]) {
    if (port !== undefined) {
      expect(await portIsFree(port), `port ${port} is still held after the test`).toBe(true)
    }
  }
}, 60_000)

describe('switching project', () => {
  it(
    'reloads nothing, and the new project’s rows take the place of the old ones',
    async () => {
      // Seed a new browser only. A later document reload must preserve the stored choice;
      // overwriting it with alpha on every document load would undo the choice under test.
      await page.addInitScript((id: string) => {
        if (window.localStorage.getItem('mole-office.workspace') === null) window.localStorage.setItem('mole-office.workspace', id)
      }, ALPHA.id)
      await page.goto(`http://127.0.0.1:${webPort}/#/ideas`, { waitUntil: 'domcontentloaded' })

      // STEP 1. Alpha's record is PROVED to be on screen, so its later absence is evidence.
      await page.getByText(ALPHA.record).first().waitFor({ timeout: 30_000 })
      expect(await theProjectIdOnScreen(page)).toBe(ALPHA.id)

      // STEP 2. THE MARKS. A property written by hand survives a re-render of the same element and
      // dies with a reload or an element built again.
      await page.evaluate(() => {
        const shell = document.querySelector('.shell')
        if (shell === null) throw new Error('the shell was not on screen')
        ;(window as unknown as Record<string, string>)['__token'] = 'the-document-before-the-switch'
        ;(shell as unknown as Record<string, string>)['__token'] = 'the-shell-before-the-switch'
      })

      // STEP 3. Choose the other project, the way a reader does.
      await switchTheProject(page, BETA.id)

      // STEP 4. The new project's rows come, and the old project's go.
      await page.getByText(BETA.record).first().waitFor({ timeout: 30_000 })
      await page.getByText(BETA.second).first().waitFor({ timeout: 30_000 })
      await expect.poll(() => page.locator('body').innerText(), { timeout: 30_000 }).not.toContain(ALPHA.record)
      expect(await theProjectIdOnScreen(page)).toBe(BETA.id)

      // THE REQUIREMENT: the same document and the same shell.
      const after = await page.evaluate(() => {
        const shell = document.querySelector('.shell')
        return {
          document: (window as unknown as Record<string, string | undefined>)['__token'] ?? null,
          shell: shell === null ? null : ((shell as unknown as Record<string, string | undefined>)['__token'] ?? null),
        }
      })
      expect(after.document, 'the page was loaded again: the mark on window is gone').toBe('the-document-before-the-switch')
      expect(after.shell, 'the shell was built again: it is a different element').toBe('the-shell-before-the-switch')
    },
    120_000,
  )

  /**
   * The counts in the frame move with the project too, and the list of projects does not.
   *
   * The sidebar's badges count rows on the attention list, which is per project, so they are read
   * again for the new project. The shared Home row counts no project at all, before or after.
   *
   * THE LIST OF PROJECTS DOES NOT MOVE. `readWorkspacesOnce` is keyed by
   * nothing (`src/web/lib/oneread.ts`): every project is given the same list, so a change of
   * project does not ask for it again and the switcher does not become the "reading the other
   * projects…" paragraph. This test holds that door open across the switch to prove it: if the
   * block asked again, the held reply would leave it waiting for the list.
   */
  it(
    'reads the new project on the next request, and counts it',
    async () => {
      slowWorkspacesMs = 0
      // A query string that the first test's address does not carry, so this is a real document
      // load rather than a same-document hash move: the counts below are read from a fresh page
      // that starts on beta through the stored choice, not from what the test above left behind.
      await page.goto(`http://127.0.0.1:${webPort}/?switch=1#/ideas`, { waitUntil: 'domcontentloaded' })
      await page.getByText(BETA.record).first().waitFor({ timeout: 30_000 })

      // Every read of the frame waits for the LIST OF PROJECTS, not merely for the new record to land.
      //
      // AND IT WAITS FOR THE FRAME'S OWN NUMBER TOO, which arrives on its own reply. The project
      // list and the attention list are two replies in no fixed order, so a reading taken the moment
      // the list is ready is a reading of whichever happened to win — and the `counted()` below
      // takes its number from that second reply. MEASURED on 13 September 2026: this test failed
      // with `null to be 2` two runs in four while nothing drew a project it should not have, and it
      // still failed two runs in four with the server's per-request header-only fold switched off.
      // So the race was always in this condition, and P83 only widened the window. It is fixed by
      // waiting for the reply the assertion reads, not by sleeping.
      const frameOnceSettled = async (): Promise<string> => {
        await waitForTheProjects(page)
        return page.locator('.shell-side').innerText()
      }

      /** The number the Home row's badge draws, or null when nothing needs anybody. */
      const counted = async (): Promise<number | null> => {
        const badge = page.locator('a.shell-link[href="#/"] .shell-badge')
        if ((await badge.count()) === 0) return null
        return Number((await badge.innerText()).trim())
      }

      const beta = await frameOnceSettled()
      expect(beta).toContain(BETA.title)
      expect(beta).not.toContain(ALPHA.record)
      expect(await theProjectIdOnScreen(page)).toBe(BETA.id)
      expect(await counted(), 'the shared Home row must not count one project').toBeNull()

      // Hold the list of projects open across the switch. It is asked once and is the same answer
      // for every project, so this reply is never requested during the switch: the Switch list stays
      // ready, and the block already reads the new project.
      slowWorkspacesMs = 5_000
      await switchTheProject(page, ALPHA.id)
      await waitForTheProjects(page, 2_000)
      expect(await theProjectIdOnScreen(page)).toBe(ALPHA.id)

      // And the page beside it really is the new project's, so this is not passing on an empty
      // screen: the record of the project just left is gone from the whole document, and the
      // number is the new project's own.
      await page.getByText(ALPHA.record).first().waitFor({ timeout: 30_000 })
      expect(await page.locator('a.shell-link[href="#/"] .shell-badge').count()).toBe(0)
      expect(await page.locator('body').innerText()).not.toContain(BETA.record)
      expect(await counted(), 'the shared Home row must not count the new project either').toBeNull()

      slowWorkspacesMs = 0
      const alpha = await frameOnceSettled()
      expect(alpha).toContain(ALPHA.title)
      expect(alpha).not.toContain(BETA.record)
      expect(await theProjectIdOnScreen(page)).toBe(ALPHA.id)
      // AND NO FALSE WARNING. The list of projects was read under beta and not re-read, so its
      // `current` field still names beta. A rail that compared that field with the project on
      // screen told a reader who had just moved on purpose that the wrong project answered — the
      // warning of problem `OisNdGN40uoR`. Storage is WORKING here: the stored choice was beta,
      // the page loaded on beta, and this move to alpha was honoured, so this is not the
      // storage-blocked warning either.
      expect(alpha, 'the rail said the wrong project answered after an ordinary move').not.toContain(
        'Wrong project answered',
      )
    },
    120_000,
  )
})
