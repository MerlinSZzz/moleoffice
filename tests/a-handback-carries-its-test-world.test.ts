// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HANDBACK OF A FEATURE THE OWNER MUST SEE CARRIES THE WORLD'S ADDRESS AND A PRESS THAT OPENS IT.
 *
 * Criterion C31 of design/rules/ACCEPTANCE.md: a world is a natural test ground, and a new feature
 * can be handed back with a press that takes the person into a test world to look at it before
 * deciding whether the change meets what was asked.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED FIRST
 * ---------------------------------------------------------------------------------------
 *
 * `tools/isolated-mole-office.mjs` wrote NOTHING into Mole Office. `start` wrote
 * .logs/isolated/<name>/where.json and nothing else, so a world was on no list the office could
 * read; the person had no press that opened it and no press that stopped it; and `stop` deleted the
 * directory and the database copy. A handback could say a world had existed and nothing more.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HELD HERE
 * ---------------------------------------------------------------------------------------
 *
 *   - A report may carry a `world` block, and the write path accepts it.
 *   - The report's page draws it: what to look at, the address as a press, and whether it is up.
 *   - A world whose ledger row is gone says it has been stopped, rather than going on offering a
 *     dead address for weeks.
 *   - A world nobody registered says nobody registered it, which is a third answer and not "up".
 *   - The tool refuses `--show-to-the-person` without a run, because a world written down against
 *     no run is one nobody can find or stop.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control:
 *
 *   - Take the `case 'world'` arm out of SummaryBlocks.tsx, and every drawing case goes red.
 *   - Have `WorldHere` set 'up' whatever the ledger says, and the stopped-world case goes red.
 *   - Have it set 'up' when there is no ledger row, and the unregistered case goes red.
 *   - Drop the `--run` guard in tools/isolated-mole-office.mjs, and the tool case goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Page } from 'playwright'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

const run = promisify(execFile)

let app: LiveApp
let page: Page

/** Three reports: a world that is up, one that has been stopped, one nobody registered. */
let up = ''
let stopped = ''
let unregistered = ''
/** The ledger row the live world holds. */
let row = ''

const asPerson: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: asPerson,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** A handback report carrying one world block. */
async function aHandback(title: string, world: Record<string, unknown>): Promise<string> {
  const made = (await post('/api/records', {
    kind: 'report',
    title,
    summary: 'What was built, and the world it can be looked at in.',
    data: {
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What was built', text: 'The check panel on a run.' },
        world,
      ],
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-09-07',
    },
  }))['record'] as { id: string }
  return made.id
}

async function open(where: string, theme: 'light' | 'dark', width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // The world block asks the ledger when it is drawn, so the answer is waited for rather than
  // raced. A test that read the panel mid-request would read "Asking whether it is still up" and
  // pass or fail by timing, which is not a measurement of anything.
  //
  // THE WAIT IS FOR THE BLOCK ITSELF, AND A BLOCK THAT IS NOT THERE YET DOES NOT SATISFY IT. This
  // wait used to ask only that the state was not "looking". When the block was not drawn yet,
  // there was no state to read, and "nothing" is not "looking", so the wait passed at once. Wave
  // 13q measured the first case failing that way in 3 of 10 runs: the case read an empty block and
  // no state at all (problem rWLpSZC7IAXy). Why the block was still missing after the page's ready
  // mark was not found. One gap is known: the block asks the ledger with a plain fetch, and the
  // mark does not count that fetch. So the wait now asks for the two things the cases read: the
  // state line, with an answer from the ledger, and the address line, with an answer about which
  // machine the reader is on. A block that never gets there fails here, by timeout.
  await page.waitForFunction(
    (addressUnknown) => {
      const state = document.querySelector('.sb-world .sb-world-state')
      const act = document.querySelector('.sb-world .sb-world-act')
      if (state === null || act === null) return false
      return state.getAttribute('data-up') !== 'looking' && act.textContent !== addressUnknown
    },
    en['sb.world.addressUnknown'],
    { timeout: 20_000 },
  )
}

interface Seen {
  text: string
  state: string | null
  opens: string | null
  overflow: number
}

async function readTheWorld(): Promise<Seen> {
  return (await page.evaluate(() => {
    const block = document.querySelector('.sb-world')
    return {
      text: block === null ? '' : (block.textContent ?? ''),
      state: document.querySelector('.sb-world-state')?.getAttribute('data-up') ?? null,
      opens: document.querySelector('.sb-world-open')?.getAttribute('href') ?? null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })) as Seen
}

beforeAll(async () => {
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // The owner's act 3a of 15 September 2026 made a record page open at the
  // conclusion, where the body holds the summary and nothing else, so a test that measures a
  // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and
  // waited for a selector that would never appear. `opensAt` writes the reader's own stored
  // choice before the page loads, so this file is about its own subject again and not about the
  // level a page opens at. That level has its own test in
  // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'handback-world', viewport: { width: 1440, height: 900 } })
  page = app.page

  // A RUN, AND A LEDGER ROW AGAINST IT. This is what `--show-to-the-person` writes; the tool is
  // measured separately below, because starting a second whole stack inside this one to prove the
  // registration would be a third server on this machine for one assertion.
  const session = (await post('/api/records', {
    kind: 'session',
    title: 'Builder CM, the run that kept a world up',
    data: { state: 'running', doing: 'building C31' },
  }))['record'] as { id: string }

  const registered = (await post('/api/resources', {
    type: 'process',
    key: String(process.pid),
    sessionRecordId: session.id,
    detail: 'A test world for somebody to look at: the browser app of the isolated Mole Office "code-4".',
    adopting: 'this test process started before the session the test filed for it',
  }))['resource'] as { id: string }
  row = registered.id

  up = await aHandback('The handback with a world that is up', {
    id: 'b-the-world',
    type: 'world',
    label: 'The check panel on a run that was refused',
    web: 'http://127.0.0.1:41573',
    api: 'http://127.0.0.1:41572',
    ledgerRow: row,
    because: 'Whether the words on the five standings are the ones the owner wants a reader to see.',
  })

  stopped = await aHandback('The handback whose world has been stopped', {
    id: 'b-the-world',
    type: 'world',
    label: 'The check panel, in a world that is no longer up',
    web: 'http://127.0.0.1:41999',
    ledgerRow: 'a-row-nothing-holds',
  })

  unregistered = await aHandback('The handback whose world nobody wrote down', {
    id: 'b-the-world',
    type: 'world',
    label: 'The check panel, in a world nobody registered',
    web: 'http://127.0.0.1:41998',
  })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('C31 — a handback carries the world, and the person opens it by a press', () => {
  it('draws what the owner should look at, and why the owner is being asked', async () => {
    await open(`/r/${up}`, 'light', 1440)
    const seen = await readTheWorld()
    expect(seen.text).toContain('The check panel on a run that was refused')
    expect(seen.text).toContain('Whether the words on the five standings')
  })

  it('makes the address a press that opens the world', async () => {
    const seen = await readTheWorld()
    expect(seen.opens).toBe('http://127.0.0.1:41573')
    expect(seen.text).toContain('Open the world')
  })

  it('says the world is up, from the ledger row it holds', async () => {
    const seen = await readTheWorld()
    expect(seen.state).toBe('up')
    expect(seen.text).toContain('This world is up')
    expect(seen.text).toContain(row)
  })

  it('names where the press that stops it is', async () => {
    expect((await readTheWorld()).text).toContain('running-processes panel')
  })
})

describe('C31 — a world that is gone says so, rather than offering a dead address', () => {
  it('says it has been stopped', async () => {
    await open(`/r/${stopped}`, 'light', 1440)
    const seen = await readTheWorld()
    expect(seen.state).toBe('gone')
    expect(seen.text).toContain('This world has been stopped')
  })
})

describe('C31 — a world nobody wrote down says that, which is not the same as up', () => {
  it('says nobody registered it, and draws no paragraph about the ledger', async () => {
    await open(`/r/${unregistered}`, 'light', 1440)
    const seen = await readTheWorld()
    expect(seen.state).toBe('cannot-tell')
    expect(seen.text).toContain(en['sb.world.notRegistered'])
    // This world has no address for other machines, so the block still draws the paragraph that says it is
    // reachable from this machine only. That paragraph is not about the ledger, and it is the only one allowed.
    const paragraphs = await page.evaluate(() =>
      [...document.querySelectorAll('.sb-world .sb-world-why')].map((paragraph) => paragraph.textContent ?? ''),
    )
    expect(paragraphs.filter((words) => words !== en['sb.world.reachableHereOnly'])).toEqual([])
  })
})

describe('C31 — the block is readable at both widths, in the light theme', () => {
  it('overflows nothing at 1440 or 390, in light', async () => {
    for (const theme of ['light'] as const) {
      for (const width of [1440, 390]) {
        await open(`/r/${up}`, theme, width)
        const seen = await readTheWorld()
        expect(seen.overflow, `${theme} at ${String(width)}`).toBe(0)
        expect(seen.state, `${theme} at ${String(width)}`).toBe('up')
      }
    }
  })
})

describe('C31 — only a world somebody is being asked to look at is written down', () => {
  it('refuses to keep one for the person without saying which run it belongs to', async () => {
    const said = await run('node', ['tools/isolated-mole-office.mjs', 'start', 'nope', '--show-to-the-person'], {
      cwd: process.cwd(),
    }).catch((err: { stderr?: string; stdout?: string }) => ({ stdout: '', stderr: String(err.stderr ?? err.stdout ?? '') }))
    expect(`${said.stdout}${said.stderr}`).toContain('needs `--run <session record id>` beside it')
  })

  it('refuses to be told where to write down a world it is not keeping', async () => {
    const said = await run('node', ['tools/isolated-mole-office.mjs', 'start', 'nope', '--run', 'abc'], {
      cwd: process.cwd(),
    }).catch((err: { stderr?: string; stdout?: string }) => ({ stdout: '', stderr: String(err.stderr ?? err.stdout ?? '') }))
    expect(`${said.stdout}${said.stderr}`).toContain('only written down with')
  })
})
