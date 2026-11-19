// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CANONICAL OFFICE STARTS ITS STORAGE RECEIPT WATCHER AFTER IT LISTENS, AND THE WATCHER STOPS WHEN THE OFFICE CLOSES.
 *
 * The server writes itself into the ledger after `app.listen`, and only a canonical office starts the minute reading of
 * storage upload receipts there. The close of that reading was added with `app.addHook('onClose', ...)` at that point.
 * Fastify refuses a hook once the server listens, so every canonical start threw there: the catch said the ledger
 * write had failed when the row was written, and the report of the world and the ledger lines were skipped. No test
 * started a canonical office, since an office a test starts is always scratch.
 *
 * WHAT IS PROVED HERE. On a listening server, the ledger write the server's start runs after it listens, run at
 * canonical standing, reports no failure and reaches its last line. It starts one storage receipt reading, the reading
 * is not stopped while the server runs, and closing the server stops it. So the test fails if anything on the start
 * path adds a hook after the server listens, and not only if the watcher's own start does.
 *
 * The standing is given to the ledger write as an argument, because the standing of a test's own world is always
 * scratch. The database is a throwaway one, so the receipt folder it names holds no journal, and the reading reads
 * nothing and writes nothing. The gate-count spool, the other reading only a canonical office starts, is worked out
 * from the test's own home, where there is none, so it reads nothing either. The receipt reading is the real one,
 * wrapped only so the test can see the timer it returns.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, sep } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type WriteTheLedger = (app: FastifyInstance, standing?: 'canonical' | 'scratch') => Promise<void>

/** How the write's warning begins when it fails. Other warnings, such as the one for a server held busy, are not its. */
const THE_LEDGER_FAILED = 'This server could not write itself into the ledger'

const watches: (NodeJS.Timeout | null)[] = []
vi.doMock('../src/server/lib/storage/receipts.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/storage/receipts.ts')>()
  return {
    ...real,
    startReadingStorageReceipts: (...args: Parameters<typeof real.startReadingStorageReceipts>) => {
      const watch = real.startReadingStorageReceipts(...args)
      watches.push(watch)
      return watch
    },
  }
})

// THE HELD-VISIT RETRY THE WRITE ALSO STARTS. The server never stops it, because it ends with its process, so this file
// stops it at its end, as the end of a process of its own would. In a process that later files share, it would go on
// firing on this file's closed database, in a later file. It is the real one, wrapped only to keep its stop, and the
// wrapper is taken away at the end too, because such a process keeps a module mock.
const retries: (() => void)[] = []
vi.doMock('../src/server/lib/visits.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/visits.ts')>()
  return {
    ...real,
    keepTryingHeldVisits: (...args: Parameters<typeof real.keepTryingHeldVisits>) => {
      const stop = real.keepTryingHeldVisits(...args)
      retries.push(stop)
      return stop
    },
  }
})
// THE ORIGIN WATCHER THE WRITE STARTS AS WELL, kept and stopped for the same reason. Its minute tick throws on a closed
// database, and in a later file the test process's own handler of that throw stops every server and removes every test
// folder, the running case's among them; vitest does not report the throw.
const origins: NodeJS.Timeout[] = []
vi.doMock('../src/server/lib/residents.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/residents.ts')>()
  return {
    ...real,
    startTheOriginWatcher: (...args: Parameters<typeof real.startTheOriginWatcher>) => {
      const watch = real.startTheOriginWatcher(...args)
      origins.push(watch)
      return watch
    },
  }
})

let t: TestDb
beforeAll(async () => { t = await freshDb() }, 60_000)
afterAll(() => {
  for (const stop of retries) stop()
  vi.doUnmock('../src/server/lib/visits.ts')
  for (const origin of origins) clearInterval(origin)
  vi.doUnmock('../src/server/lib/residents.ts')
  t?.close()
})

it('a canonical office listening starts its storage receipt watcher without an error, and closing the office stops it', async () => {
  expect(resolve(settings().databasePath)).toBe(resolve(t.file))
  const { THE_GATE_COUNT_SPOOL } = await import('../src/server/lib/gate-count-spool.ts')
  expect(THE_GATE_COUNT_SPOOL.startsWith(homedir() + sep)).toBe(true)
  expect(existsSync(THE_GATE_COUNT_SPOOL)).toBe(false)
  const app = (await apiApp()).app
  const warned = vi.spyOn(app.log, 'warn')
  const said = vi.spyOn(app.log, 'info')
  const stopped = vi.spyOn(globalThis, 'clearInterval')
  let closed = false
  try {
    await app.listen({ port: 0, host: '127.0.0.1' })
    const write = Reflect.get(await import('../src/server/index.ts'), 'writeThisServerIntoTheLedger') as WriteTheLedger | undefined
    expect(typeof write).toBe('function')
    await write!(app, 'canonical')
    expect(warned.mock.calls.filter(([line]) => typeof line === 'string' && line.startsWith(THE_LEDGER_FAILED))).toEqual([])
    expect(said.mock.calls.some(([line]) => typeof line === 'string' && line.startsWith('written into the ledger: '))).toBe(true)
    expect(watches).toHaveLength(1)
    expect(watches[0]).not.toBeNull()
    expect(stopped.mock.calls.some(([handle]) => handle === watches[0])).toBe(false)
    await app.close()
    closed = true
    expect(stopped.mock.calls.some(([handle]) => handle === watches[0])).toBe(true)
  } finally {
    warned.mockRestore()
    said.mockRestore()
    stopped.mockRestore()
    if (!closed) await app.close()
  }
}, 60_000)
