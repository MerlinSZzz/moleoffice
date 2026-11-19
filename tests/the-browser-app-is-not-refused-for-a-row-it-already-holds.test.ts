// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BROWSER APP IS NOT REFUSED FOR A ROW IT ALREADY HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED ON THE OWNER'S CORPUS
 * ---------------------------------------------------------------------------------------
 *
 * Problem `d6WpcnqS0IsS`. Counted on a copy of the corpus on 6 September 2026, from `api_calls`:
 *
 *     vite/the-browser-app  POST /api/resources  runtime.claim  409  10812  04 Sep 02:27 → 06 Sep 06:30
 *     vite/the-browser-app  POST /api/resources  runtime.claim  201    332
 *     vite/the-browser-app  POST /api/records    record.write   201    332
 *
 * The gaps between those refusals are 30 seconds (5,592 of them) and 1 second (4,688), which are
 * exactly the two cadences the plugin in `vite.config.ts` asks at. So it was a retry loop and not a
 * conflict anybody was meeting.
 *
 * WHY IT LOOPED. `written.resourceId` is this process's memory of its row and the ledger is the
 * truth. The close handler clears the memory BEFORE it sends the release, so a release that is
 * refused or never lands leaves the row live with nothing remembering it. The next round registered
 * again; the ledger refused, because it allows one live row per project, session, type and key; the
 * refusal was caught and read as "not registered"; and the next round registered again.
 *
 * Reproduced on an isolated stack on 6 September 2026 — the same refusal, word for word:
 *
 *     409 This session already has process "576629" in the ledger, as PGxMbMN-khQj, and it has not
 *         been released. Two rows for one thing would be reported as two orphans.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHAT DID NOT
 * ---------------------------------------------------------------------------------------
 *
 * The route did not. `POST /api/resources` says in `GET /api` that it answers 201 with the ledger
 * row, and its 409 is the guard that stops two rows standing for one process. The caller is the one
 * that was wrong, so the caller changed: before writing a row into a ledger it has already filed a
 * session record in, the browser app asks that ledger whether it is already there.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DRIVES
 * ---------------------------------------------------------------------------------------
 *
 * The real plugin out of the real config, with a Mole Office under it that keeps a ledger and refuses a
 * second row exactly as the real one does — same rule, same sentence. The same harness as
 * `tests/the-browser-app-writes-itself-down-once.test.ts`, which is about a different fault: that
 * one is about a second ROW being written, this one is about a refusal being asked for over and
 * over. No port is taken and no database is opened.
 *
 * Proved by mutation with a control run of this file first: taking the lookup out of
 * `vite.config.ts` turns the counting case red with a refusal on every round.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig, type Plugin } from 'vite'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** Every request the plugin made, as method and path. */
let sent: string[] = []
/** Every reply that refused one, as method, path and status. The number this file is about. */
let refused: string[] = []
let realFetch: typeof fetch
let noWatchWas: string | undefined

/** One live row of the stub ledger. The four columns its guard is on, and its id. */
interface Row {
  id: string
  sessionRecordId: string
  type: string
  key: string
  releasedAt: string | null
}

let ledger: Row[] = []
let nextRow = 0
/** Whether the stub lets a release through. False is the state that leaves a row live for ever. */
let releaseWorks = true

/**
 * A Mole Office with a ledger in it, refusing a second live row the way the real one does.
 *
 * The refusal sentence is the real one, copied from an isolated stack on 6 September 2026, so a
 * reader of this file can see what the plugin is meeting.
 */
function aMoleOfficeThatKeepsALedger(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const path = new URL(url).pathname
    const method = String(init?.method ?? 'GET')
    sent.push(`${method} ${path}`)
    const answer = (status: number, body: unknown, headers: Record<string, string> = {}): Response => {
      if (status >= 400) refused.push(`${method} ${path} ${String(status)}`)
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      })
    }

    if (path === '/api/health') {
      return answer(200, { ok: true }, {
        'x-mole-office-world': `db=ab12cd34ef567890; repo=${THE_TEST_FIXTURE_ROOT}/px-somewhere; port=29601; head=abc1234; standing=scratch`,
      })
    }
    if (path === '/api/records' && method === 'GET') {
      // The plugin reads the session rows before it files its own, to close the ones an earlier
      // start replaced. This fake ledger holds no session rows.
      return answer(200, { records: [] })
    }
    if (path === '/api/records') return answer(201, { record: { id: 'aSessionRecord' } })
    if (path === '/api/resources' && method === 'GET') return answer(200, { resources: ledger })
    if (path === '/api/resources' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { type: string; key: string }
      const session = String((init?.headers as Record<string, string> | undefined)?.['x-mole-office-session'] ?? '')
      const standing = ledger.find(
        (row) => row.releasedAt === null && row.sessionRecordId === session && row.type === body.type && row.key === body.key,
      )
      if (standing !== undefined) {
        return answer(409, {
          error:
            `This session already has ${body.type} "${body.key}" in the ledger, as ${standing.id}, and it has not ` +
            'been released. Two rows for one thing would be reported as two orphans.',
        })
      }
      nextRow += 1
      const row: Row = { id: `row-${String(nextRow)}`, sessionRecordId: session, type: body.type, key: body.key, releasedAt: null }
      ledger.push(row)
      return answer(201, { resource: { id: row.id } })
    }
    if (path.endsWith('/release')) {
      if (!releaseWorks) return answer(409, { error: 'the resource moved between the read and the release' })
      const id = path.split('/')[3]
      const row = ledger.find((one) => one.id === id)
      if (row !== undefined) row.releasedAt = '2026-09-06 06:00:00'
      return answer(200, { released: true })
    }
    return answer(200, {})
  }) as typeof fetch
}

/** The real plugin, out of the real config file. */
async function theRegisteringPlugin(): Promise<Plugin> {
  const resolved = await resolveConfig({ configFile: join(REPO, 'vite.config.ts'), logLevel: 'silent' }, 'serve')
  const found = resolved.plugins.find((one) => one.name === 'mole-office:register-this-browser-app')
  if (found === undefined) throw new Error('vite.config.ts no longer has a plugin that registers the browser app')
  return found as Plugin
}

/** A dev server with nothing in it but the events the plugin listens for. */
function aFakeServer(): { httpServer: EventEmitter } {
  return { httpServer: new EventEmitter() }
}

/** Run the plugin's setup and let the requests it makes finish. */
async function start(plugin: Plugin, server: { httpServer: EventEmitter }): Promise<void> {
  const configure = plugin.configureServer
  const run = typeof configure === 'function' ? configure : configure?.handler
  if (run === undefined) throw new Error('the plugin no longer configures the server')
  await (run as (s: unknown) => unknown)(server)
  server.httpServer.emit('listening')
  // The plugin's work is asynchronous and nothing waits for it, which is deliberate: it must never
  // stop Vite from starting. Enough turns for the stubbed replies to land.
  for (let i = 0; i < 40; i += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 30))
}

/** Stop the round, so the timer it left behind does not fire into the next case. */
function stop(server: { httpServer: EventEmitter }): void {
  server.httpServer.emit('close')
}

let apiWas: string | undefined
let portWas: string | undefined

beforeEach(() => {
  sent = []
  refused = []
  ledger = []
  nextRow = 0
  releaseWorks = true
  realFetch = globalThis.fetch
  globalThis.fetch = aMoleOfficeThatKeepsALedger()
  noWatchWas = process.env['MOLE_OFFICE_NO_WATCH']
  apiWas = process.env['MOLE_OFFICE_API']
  portWas = process.env['MOLE_OFFICE_PORT']
  // The plugin stands down under a test runner's Vite, because tests/helpers.ts registers that one
  // from the test process. This test is about `npm run dev`, so it clears the flag.
  delete process.env['MOLE_OFFICE_NO_WATCH']
  // AND IT NAMES THE OFFICE THE ROW IS FILED IN. This suite runs in a worktree, which has no `.env`
  // of its own; since problem `1p-pQxYe0RLB` the plugin files nothing from a checkout that has no
  // office of its own, so a test of `npm run dev` says which world it is, as a real one does when
  // the environment names the API. The value is irrelevant: this file answers every address itself.
  process.env['MOLE_OFFICE_API'] = 'http://127.0.0.1:9'
  process.env['MOLE_OFFICE_PORT'] = '9'
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('mole-office.what-the-browser-app-has-written-down')]
})

afterEach(async () => {
  globalThis.fetch = realFetch
  if (noWatchWas === undefined) delete process.env['MOLE_OFFICE_NO_WATCH']
  else process.env['MOLE_OFFICE_NO_WATCH'] = noWatchWas
  if (apiWas === undefined) delete process.env['MOLE_OFFICE_API']
  else process.env['MOLE_OFFICE_API'] = apiWas
  if (portWas === undefined) delete process.env['MOLE_OFFICE_PORT']
  else process.env['MOLE_OFFICE_PORT'] = portWas
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('mole-office.what-the-browser-app-has-written-down')]
  await new Promise((resolve) => setTimeout(resolve, 5))
})

describe('the browser app asks to be written down once, and is never refused for the row it holds', () => {
  it('is not refused on an ordinary start', async () => {
    // THE CONTROL. Everything below counts refusals, and a count of nothing proves nothing unless
    // the ordinary path really does put a row in the ledger.
    const server = aFakeServer()
    await start(await theRegisteringPlugin(), server)
    expect(refused, 'the ordinary start was refused something').toEqual([])
    expect(ledger.filter((row) => row.releasedAt === null)).toHaveLength(1)
    stop(server)
  })

  it('is refused nothing when its row is still live and it has forgotten it', async () => {
    // THE STATE THE LOOP CAME OUT OF: the row is live and nothing in this process remembers it,
    // because the close handler clears the memory before it sends the release and the release did
    // not land. Four more starts stand for the rounds the timer would have made.
    const first = aFakeServer()
    await start(await theRegisteringPlugin(), first)
    expect(ledger).toHaveLength(1)
    releaseWorks = false
    stop(first)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(ledger.filter((row) => row.releasedAt === null), 'the release was meant to fail').toHaveLength(1)

    refused = []
    for (let round = 0; round < 4; round += 1) {
      const server = aFakeServer()
      await start(await theRegisteringPlugin(), server)
      stop(server)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    // THE REGISTRATIONS, AND NOT EVERY REFUSAL. This fixture makes the release fail on purpose —
    // that is how the row is left live — so a refused release is the fixture working rather than
    // the fault. The registration refusal is the one this problem is about and there must be none.
    expect(
      refused.filter((one) => one === 'POST /api/resources 409'),
      'the browser app is asking to be written down for a row it already holds',
    ).toEqual([])
    // AND STILL ONE ROW. Being refused nothing must not mean a second row was accepted instead.
    expect(ledger).toHaveLength(1)
  })

  it('reads the ledger rather than writing, and files no second session record', async () => {
    const first = aFakeServer()
    await start(await theRegisteringPlugin(), first)
    releaseWorks = false
    stop(first)
    await new Promise((resolve) => setTimeout(resolve, 20))

    sent = []
    const second = aFakeServer()
    await start(await theRegisteringPlugin(), second)
    stop(second)
    expect(sent, 'it asked the ledger what it holds').toContain('GET /api/resources')
    expect(sent.filter((one) => one === 'POST /api/resources'), 'it wrote a row anyway').toEqual([])
    expect(sent.filter((one) => one === 'POST /api/records'), 'a restart is not a second run').toEqual([])
  })

  it('still writes a row when the one it held was really released', async () => {
    // THE OTHER CONTROL. A lookup that answered "you are already in" whatever the ledger said would
    // pass every case above and leave the browser app on no list at all.
    const first = aFakeServer()
    await start(await theRegisteringPlugin(), first)
    stop(first)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(ledger.filter((row) => row.releasedAt === null), 'the release was meant to work').toHaveLength(0)

    const second = aFakeServer()
    await start(await theRegisteringPlugin(), second)
    // READ BEFORE THIS ONE IS STOPPED, because stopping it releases the row it just wrote.
    expect(ledger.filter((row) => row.releasedAt === null), 'it never wrote itself down again').toHaveLength(1)
    expect(refused).toEqual([])
    stop(second)
  })
})
