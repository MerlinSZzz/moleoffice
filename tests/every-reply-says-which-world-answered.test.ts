// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION G3: EVERY REPLY SAYS WHICH WORLD ANSWERED.
 *
 * design/ground/ACCEPTANCE.md, out of the owner's problem 21. The state to prevent: a real API and
 * a scratch API side by side, a browser still pointing at the scratch database, and health checks
 * that appear green. The required change: diagnostics must distinguish a successful request from a
 * successful request to the wrong Mole Office world.
 *
 * So this file holds four claims, one per thing that has to be true for that to work:
 *
 *   1. The server puts the world on EVERY reply, whatever the reply is.
 *   2. The header says the same world `GET /api/runtime` says, so a reply and the record cannot
 *      drift apart.
 *   3. The database's identity really tells one database from another, including a copy.
 *   4. The browser treats a reply from another world as a failure and never as data, and the
 *      session hook refuses to file into one.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { FRESHNESS_HEADER, parseFreshnessHeader } from '../src/config/freshness-header.mjs'
import { ENV_FILE, REPO_ROOT, settingNamed, settings } from '../src/config/settings.mjs'
import {
  WORLD_HEADER,
  formatWorldHeader,
  parseWorldHeader,
  worldsDiffer,
  type WorldOnTheWire,
} from '../src/config/world-header.mjs'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { forgetTheWorldOnThisPage, theWorldThatAnswered } from '../src/web/lib/world.ts'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))

let t: TestDb
let app: FastifyInstance

/**
 * ONE OFFICE FOR THE FILE. A case files the note it acts on and reads the world the one running
 * server says. The browser's remembered world is forgotten after each case, because the cases about
 * it set it themselves and one of them has to start with nothing remembered.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

afterEach(() => {
  forgetTheWorldOnThisPage()
})

const headers = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'vitest/world-header',
  'x-mole-office-workspace': 'default',
}

describe('every reply carries the world that answered', () => {
  it('is on an ordinary reply, on a refusal, and on a route that does not exist', async () => {
    // Three replies of three different kinds. A header that only rides on the happy path would be
    // missing from exactly the replies somebody is looking at when things have gone wrong.
    const fine = await app.inject({ method: 'GET', url: '/api/health', headers })
    const refused = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'nonsense' } })
    const missing = await app.inject({ method: 'GET', url: '/api/there-is-no-such-route', headers })

    expect(fine.statusCode, fine.body).toBe(200)
    expect(refused.statusCode, refused.body).toBeGreaterThanOrEqual(400)
    expect(missing.statusCode, missing.body).toBe(404)

    for (const reply of [fine, refused, missing]) {
      const read = parseWorldHeader(String(reply.headers[WORLD_HEADER] ?? ''))
      expect(read.ok ? 'readable' : read.why).toBe('readable')
    }
  })

  it('says the same world the runtime record says, so a reply and the record cannot drift apart', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/runtime', headers })
    expect(reply.statusCode, reply.body).toBe(200)
    const record = reply.json<RuntimeRecord>()
    const read = parseWorldHeader(String(reply.headers[WORLD_HEADER] ?? ''))
    if (!read.ok) throw new Error(read.why)

    expect(read.world.repository).toBe(record.repository.path)
    expect(read.world.port).toBe(String(record.port))
    expect(read.world.head).toBe(record.repository.head?.short ?? 'unknown')
    expect(read.world.standing).toBe(record.standing.kind)
    expect(read.world.database).toBe(databaseIdentity(record.database.path).id)
  })

  it('says which database answered, and a test database is never the canonical one', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/health', headers })
    const read = parseWorldHeader(String(reply.headers[WORLD_HEADER] ?? ''))
    if (!read.ok) throw new Error(read.why)
    // The database this test opened, not the one the checkout declares. Getting these two the wrong
    // way round is the whole failure the criterion is about.
    expect(read.world.database).toBe(databaseIdentity(t.file).id)
    expect(read.world.database).not.toBe(databaseIdentity(settings({}, ENV_FILE).databasePath).id)
  })
})

/**
 * AND EVERY REPLY SAYS HOW OLD THE ANSWERING SERVER'S CODE IS.
 *
 * A second small header, `x-mole-office-freshness`. It is its own header rather than a field on the
 * world one because the world is read once per process and freshness changes the moment somebody
 * saves a file; the header block of src/config/freshness-header.mjs has the whole reason and what it
 * costs a reply.
 *
 * It exists so the page can shout when the SERVER is behind the checkout, which it could not do at
 * all: problem `JoI0x23xXBRK`.
 */
describe('every reply says how old the answering server\'s code is', () => {
  it('is on an ordinary reply, on a refusal, and on a route that does not exist', async () => {
    const fine = await app.inject({ method: 'GET', url: '/api/health', headers })
    const refused = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'nonsense' } })
    const missing = await app.inject({ method: 'GET', url: '/api/there-is-no-such-route', headers })
    for (const reply of [fine, refused, missing]) {
      const read = parseFreshnessHeader(String(reply.headers[FRESHNESS_HEADER] ?? ''))
      expect(read.ok ? 'readable' : read.why).toBe('readable')
    }
  })

  it('carries the grace from the declaration, because the page cannot read it', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/health', headers })
    const read = parseFreshnessHeader(String(reply.headers[FRESHNESS_HEADER] ?? ''))
    expect(read.ok).toBe(true)
    const { settingNamed } = await import('../src/config/settings.mjs')
    expect(read.ok ? read.reading.grace : -1).toBe(Number(settingNamed('MOLE_OFFICE_STALE_CODE_GRACE').fallback))
  })

  it('says the same thing the runtime record says, so a reply and the record cannot drift apart', async () => {
    const record = (await app.inject({ method: 'GET', url: '/api/runtime', headers })).json() as {
      freshness: { verdict: string }
    }
    const reply = await app.inject({ method: 'GET', url: '/api/health', headers })
    const read = parseFreshnessHeader(String(reply.headers[FRESHNESS_HEADER] ?? ''))
    const onTheHeader = read.ok ? read.reading.verdict : 'unreadable'
    const inTheRecord =
      record.freshness.verdict === 'as new as the checkout'
        ? 'fresh'
        : record.freshness.verdict === 'older than the checkout'
          ? 'stale'
          : 'unknown'
    expect(onTheHeader).toBe(inTheRecord)
  })

  it('says how long it has been stale only while it is, and never a zero that reads as just now', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/health', headers })
    const read = parseFreshnessHeader(String(reply.headers[FRESHNESS_HEADER] ?? ''))
    expect(read.ok).toBe(true)
    if (!read.ok) return
    if (read.reading.verdict === 'stale') expect(read.reading.staleFor).not.toBeNull()
    else expect(read.reading.staleFor).toBeNull()
  })
})

describe('a database has an identity, not just a path', () => {
  it('gives a copy of a database a different identity from the file it was copied from', () => {
    // This is the negative control's own mechanism: G7 serves a COPY of the database and the page
    // has to notice. A path would not have noticed — the copy is a different file with the same
    // contents, and if it were restored over the original it would have the same path as well.
    const copy = `${t.file}.copy`
    copyFileSync(t.file, copy)
    try {
      expect(databaseIdentity(copy).id).not.toBe(databaseIdentity(t.file).id)
    } finally {
      rmSync(copy, { force: true })
    }
  })

  it('gives a NEW database at the SAME path a different identity from the one it replaced', async () => {
    // This is the assertion the path half of the identity cannot make, and it is the one that
    // matters most: `npm run db:reset` puts a different database at the same path, and this
    // project has already served an afternoon out of a file that had been replaced under it.
    // Written with an ordinary file rather than the test's own database, because deleting the file
    // a live SQLite connection holds is the fault this is about and not a way to set one up.
    const path = `${t.file}.replaceable`
    writeFileSync(path, 'the first one')
    const before = databaseIdentity(path).id
    rmSync(path)
    await new Promise((resolve) => setTimeout(resolve, 20))
    writeFileSync(path, 'the second one')
    try {
      expect(databaseIdentity(path).id).not.toBe(before)
    } finally {
      rmSync(path, { force: true })
    }
  })

  it('gives the same file the same identity every time it is asked', () => {
    expect(databaseIdentity(t.file).id).toBe(databaseIdentity(t.file).id)
  })

  it('says unknown, with the reason, rather than an identity it cannot stand behind', () => {
    const gone = databaseIdentity(join(t.file, '..', 'no-such-database.db'))
    expect(gone.id).toBe('unknown')
    expect(gone.how).toContain('no-such-database.db')
  })
})

describe('the header format is written one way and read one way', () => {
  const awkward: WorldOnTheWire = {
    // A semicolon is the separator and a per cent sign is the escape, so a path holding either is
    // the case that breaks a format nobody encoded. The last one is a directory name in a language
    // that is not English, which a header may not carry as it stands.
    database: 'abc0123456789def',
    repository: `${THE_TEST_FIXTURE_ROOT}/odd; name/100%/研究`,
    // A port this test picks, neither the default nor a live office's: a case below compares it with the default.
    port: '39017',
    head: 'd2f630a',
    standing: 'canonical',
  }

  it('carries a path with a semicolon, a per cent sign and a letter outside ASCII, and reads it back whole', () => {
    const text = formatWorldHeader(awkward)
    expect(text).toMatch(/^[\x20-\x7e]*$/)
    const read = parseWorldHeader(text)
    if (!read.ok) throw new Error(read.why)
    expect(read.world).toEqual(awkward)
  })

  it('refuses a header it cannot read, and says why, rather than handing back half a world', () => {
    expect(parseWorldHeader(null).ok).toBe(false)
    expect(parseWorldHeader('').ok).toBe(false)
    const short = parseWorldHeader('db=abc; repo=/x; port=1')
    expect(short.ok).toBe(false)
    if (short.ok) throw new Error('unreachable')
    expect(short.why).toContain('the commit')
  })

  it('names the facts that differ and only those', () => {
    const other: WorldOnTheWire = { ...awkward, database: 'ffffffffffffffff', port: '8787' }
    const differences = worldsDiffer(awkward, other)
    expect(differences.map((one) => one.key)).toEqual(['database', 'port'])
    expect(differences[0]?.expected).toBe('abc0123456789def')
    expect(differences[0]?.answered).toBe('ffffffffffffffff')
    expect(worldsDiffer(awkward, { ...awkward })).toEqual([])
  })
})

describe('the browser treats a reply from another world as a failure, never as data', () => {
  const world: WorldOnTheWire = {
    database: '1111111111111111',
    repository: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    port: String(settingNamed('MOLE_OFFICE_PORT').fallback),
    head: 'd2f630a',
    standing: 'canonical',
  }

  it('remembers the world of the first reply and says nothing about it', () => {
    expect(theWorldThatAnswered(formatWorldHeader(world))).toBeNull()
    expect(theWorldThatAnswered(formatWorldHeader(world))).toBeNull()
  })

  it('refuses a reply from a different database and names both values', () => {
    expect(theWorldThatAnswered(formatWorldHeader(world))).toBeNull()
    const wrong = theWorldThatAnswered(formatWorldHeader({ ...world, database: '2222222222222222' }))
    expect(wrong).not.toBeNull()
    expect(wrong?.length).toBe(1)
    expect(wrong?.[0]?.what).toBe('the database')
    expect(wrong?.[0]?.onThisPage).toContain('1111111111111111')
    expect(wrong?.[0]?.onTheServer).toContain('2222222222222222')
  })

  it('refuses a reply that has stopped saying which world it came from', () => {
    expect(theWorldThatAnswered(formatWorldHeader(world))).toBeNull()
    const wrong = theWorldThatAnswered(null)
    expect(wrong).not.toBeNull()
    expect(wrong?.[0]?.what).toBe('which Mole Office answered')
  })

  it('says nothing when the very first reply has no world, because nothing is known to disagree with', () => {
    // A page whose first request was answered by something with nothing to say is a page whose
    // server is not there. That is a different fault with its own sentence, and putting a
    // wrong-world banner over it would send somebody hunting for a second server that does not
    // exist.
    expect(theWorldThatAnswered(null)).toBeNull()
  })
})

/**
 * THE SESSION HOOK CHECKS THE WORLD BEFORE IT FILES ANYTHING.
 *
 * Against a small server of this test's own rather than a real Mole Office, because what is being
 * tested is what the hook does with a header, and a header is all this needs to hand it. The whole
 * thing end to end — a real second API on a copy of the real database — is criterion G7's test.
 */
describe('the session hook refuses to file into another world', () => {
  let fake: Server | null = null
  let asked: string[] = []

  const HEALTH_EVIDENCE_MARK = 'health request evidence (child producer rows and fake-server receipts):'
  type HealthConnection = {
    localAddress: string | null
    localPort: number | null
    remoteAddress: string | null
    remotePort: number | null
    complete: boolean
  }
  type HealthChild = {
    source: 'child'
    invoked: string
    pid: number | null
    origin: string
    clock: string
    atMs: number
  }
  type HealthCall = {
    source: 'child-call'
    method: string
    origin: string
    path: string
    clock: string
    atMs: number
  }
  type HealthProducer = {
    source: 'child-producer'
    method: string
    origin: string
    path: string
    clock: string
    atMs: number
    connection: HealthConnection | null
  }
  type HealthDetach = {
    source: 'child-detach'
    removed: { create: boolean; send: boolean }
    hasSubscribers: { create: boolean; send: boolean }
    clock: string
    atMs: number
  }
  type HealthReceipt = {
    source: 'fake-server-receipt'
    method: string
    path: string
    clock: string
    atMs: number
    connection: HealthConnection | null
  }
  type HealthCorrelation = {
    matchedBy: 'socket-tuple' | 'unknown'
    connection: HealthConnection | null
    producers: number[]
    receipts: number[]
    why?: string
  }

  const HEALTH_TRACE_PREFIX = '@@health-request-trace@@ '
  let childTrace: HealthChild | null = null
  let calls: HealthCall[] = []
  let producers: HealthProducer[] = []
  let receipts: HealthReceipt[] = []
  let childDetach: HealthDetach | null = null

  /** The path without its query: the evidence never carries a query value. */
  function pathWithoutQuery(value: string | null | undefined): string {
    const text = String(value ?? '')
    const question = text.indexOf('?')
    return question === -1 ? text : text.slice(0, question)
  }

  function usableAddress(value: string | null): boolean {
    return typeof value === 'string' && value !== ''
  }

  function usablePort(value: number | null): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65_535
  }

  /** The four socket facts a receipt and a producer can both supply, or null when absent. */
  function connectionFrom(value: unknown): HealthConnection | null {
    if (value === null || typeof value !== 'object') return null
    const facts = value as Record<string, unknown>
    const text = (key: string): string | null => (typeof facts[key] === 'string' ? (facts[key] as string) : null)
    const number = (key: string): number | null => (typeof facts[key] === 'number' ? (facts[key] as number) : null)
    const connection = {
      localAddress: text('localAddress'),
      localPort: number('localPort'),
      remoteAddress: text('remoteAddress'),
      remotePort: number('remotePort'),
    }
    if (Object.values(connection).every((one) => one === null)) return null
    return {
      ...connection,
      // A PARTIAL OBSERVATION IS KEPT BUT NOT CALLED A CONNECTION. All four facts have to be
      // usable before two rows may be called the same observed tuple.
      complete:
        usableAddress(connection.localAddress) &&
        usablePort(connection.localPort) &&
        usableAddress(connection.remoteAddress) &&
        usablePort(connection.remotePort),
    }
  }

  function connectionKey(connection: HealthConnection | null): string {
    if (connection === null || connection.complete !== true) return 'unknown'
    // THE TWO SIDES NAME THE SAME CONNECTION FROM OPPOSITE ENDS. The child calls its own end
    // local and the server's end remote; the server calls them the other way round. Sorting the
    // two endpoint strings turns both readings into one key without using a time.
    const local = `${String(connection.localAddress ?? '?')}:${String(connection.localPort ?? '?')}`
    const remote = `${String(connection.remoteAddress ?? '?')}:${String(connection.remotePort ?? '?')}`
    return [local, remote].sort().join(' <-> ')
  }

  /** Group rows by the connection tuple each actually observed; never by a time. */
  function correlationForTheRows(): HealthCorrelation[] {
    const producerGroups = new Map<string, { connection: HealthConnection | null; indexes: number[] }>()
    const receiptGroups = new Map<string, { connection: HealthConnection | null; indexes: number[] }>()
    producers.forEach((row, index) => {
      const key = connectionKey(row.connection)
      const group = producerGroups.get(key) ?? { connection: row.connection, indexes: [] }
      group.indexes.push(index)
      producerGroups.set(key, group)
    })
    receipts.forEach((row, index) => {
      const key = connectionKey(row.connection)
      const group = receiptGroups.get(key) ?? { connection: row.connection, indexes: [] }
      group.indexes.push(index)
      receiptGroups.set(key, group)
    })
    const keys = [...new Set([...producerGroups.keys(), ...receiptGroups.keys()])]
    return keys.map((key) => {
      const produced = producerGroups.get(key)
      const received = receiptGroups.get(key)
      const connection = produced?.connection ?? received?.connection ?? null
      const producerIndexes = produced?.indexes ?? []
      const receiptIndexes = received?.indexes ?? []
      if (key === 'unknown') {
        return {
          matchedBy: 'unknown',
          connection,
          producers: producerIndexes,
          receipts: receiptIndexes,
          why: 'a row did not observe all four endpoint facts, so its connection is unknown',
        }
      }
      if (producerIndexes.length === receiptIndexes.length) {
        return {
          matchedBy: 'socket-tuple',
          connection,
          producers: producerIndexes,
          receipts: receiptIndexes,
          ...(producerIndexes.length === 1
            ? {}
            : { why: 'this observed connection carried more than one request, so the tuple matches the group and not one request to one receipt' }),
        }
      }
      return {
        matchedBy: 'unknown',
        connection,
        producers: producerIndexes,
        receipts: receiptIndexes,
        why: `${String(producerIndexes.length)} producer row(s) and ${String(receiptIndexes.length)} receipt row(s) share this observed connection tuple`,
      }
    })
  }

  function healthEvidenceForTheFailure(): {
    child: HealthChild | null
    calls: HealthCall[]
    producers: HealthProducer[]
    receipts: HealthReceipt[]
    detach: HealthDetach | null
    correlation: HealthCorrelation[]
    clocks: string
    paths: string
  } {
    return {
      child: childTrace,
      calls,
      producers,
      receipts,
      detach: childDetach,
      correlation: correlationForTheRows(),
      clocks: 'each process records its own monotonic milliseconds; times order rows and never match one',
      paths: 'the query string is removed from every path',
    }
  }

  /**
   * PUT THE EVIDENCE ON THE FAILURE ITSELF. The original assertion keeps its own error and stack;
   * this only adds the rows to its message and stack, so the ordinary named-run log and the JSON
   * report carry them after the fixture folder and its files are gone.
   */
  function withHealthEvidence(error: unknown): Error {
    const kept = error instanceof Error ? error : new Error(String(error))
    if (!String(kept.message).includes(HEALTH_EVIDENCE_MARK)) {
      const evidence = `${HEALTH_EVIDENCE_MARK}${JSON.stringify(healthEvidenceForTheFailure())}`
      kept.message = `${kept.message}\n\n${evidence}`
      if (typeof kept.stack === 'string' && !kept.stack.includes(HEALTH_EVIDENCE_MARK)) kept.stack = `${kept.stack}\n${evidence}`
    }
    return kept
  }

  async function serverSaying(
    worldHeader: string | null,
    options: { incompleteReceipt?: boolean } = {},
  ): Promise<string> {
    asked = []
    childTrace = null
    calls = []
    producers = []
    receipts = []
    childDetach = null
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      asked.push(`${req.method ?? '?'} ${req.url ?? '?'}`)
      const path = pathWithoutQuery(req.url)
      if (req.method === 'GET' && path === '/api/health') {
        const connection = connectionFrom(req.socket)
        if (options.incompleteReceipt && connection !== null) {
          connection.remotePort = null
          connection.complete = false
        }
        receipts.push({
          source: 'fake-server-receipt',
          method: 'GET',
          path,
          clock: 'test-monotonic-ms',
          atMs: performance.now(),
          connection,
        })
      }
      if (worldHeader !== null) res.setHeader(WORLD_HEADER, worldHeader)
      res.setHeader('content-type', 'application/json')
      res.end(
        req.method === 'POST' && req.url === '/api/records'
          ? JSON.stringify({ record: { id: 'wORLDtest01', title: 'filed by a test' } })
          : JSON.stringify({ ok: true }),
      )
    })
    fake = server
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('the test server took no port')
    return `http://127.0.0.1:${String(address.port)}`
  }

  afterEach(async () => {
    if (fake !== null) await new Promise<void>((resolve) => fake?.close(() => { resolve() }))
    fake = null
    const note = join(repo, '.logs', 'session-a-world-test.json')
    if (existsSync(note)) rmSync(note)
  })

  /** The world this checkout's own declaration names, which is what the hook compares against. */
  function declaredHere(): WorldOnTheWire {
    const declared = settings()
    return {
      database: databaseIdentity(declared.databasePath).id,
      repository: REPO_ROOT.replace(/\/$/, ''),
      port: String(declared.apiPort),
      head: 'whatever',
      standing: 'scratch',
    }
  }

  /**
   * Run the hook the way Claude Code runs it: `node tools/session-hook.mjs start`, with the payload
   * on stdin.
   *
   * TWO THINGS THIS HAS TO GET RIGHT, both of them learned the hard way while writing it.
   * The payload must be WRITTEN, not left out: the hook reads stdin with `readFileSync(0)`, and
   * against an open pipe nobody writes to that waits for ever. And the wait must not block this
   * process, because the server the hook is talking to is in it — a synchronous run holds the
   * event loop, nothing answers, and the hook reports a server that is not there.
   */
  function hookAgainst(
    api: string,
    options: { secondHealthFetch?: boolean; incompleteProducer?: boolean } = {},
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        'node',
        ['--import', join(repo, 'tests', 'health-request-trace.mjs'), join(repo, 'tools', 'session-hook.mjs'), 'start'],
        {
          cwd: repo,
          env: {
            ...process.env,
            MOLE_OFFICE_API: api,
            MOLE_HOOK_DETAILS_FOLDER: join(dirname(t.file), 'hook-details'),
            HEALTH_SECOND_FETCH: options.secondHealthFetch === true ? '1' : '',
            HEALTH_TRACE_INCOMPLETE_PRODUCER: options.incompleteProducer === true ? '1' : '',
          },
        },
      )
      childTrace = {
        source: 'child',
        invoked: 'tools/session-hook.mjs start',
        pid: child.pid ?? null,
        origin: api,
        clock: 'test-monotonic-ms',
        atMs: performance.now(),
      }
      let said = ''
      let traced = ''
      child.stdout.on('data', (chunk: Buffer) => {
        said += chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer) => {
        traced += chunk.toString('utf8')
      })
      child.on('error', reject)
      child.on('close', () => {
        for (const line of traced.split('\n')) {
          if (!line.startsWith(HEALTH_TRACE_PREFIX)) continue
          try {
            const row = JSON.parse(line.slice(HEALTH_TRACE_PREFIX.length)) as Record<string, unknown>
            if (row.source === 'child-detach') {
              const removed = (row.removed ?? {}) as Record<string, unknown>
              const hasSubscribers = (row.hasSubscribers ?? {}) as Record<string, unknown>
              childDetach = {
                source: 'child-detach',
                removed: { create: removed.create === true, send: removed.send === true },
                hasSubscribers: { create: hasSubscribers.create === true, send: hasSubscribers.send === true },
                clock: 'child-monotonic-ms',
                atMs: typeof row.atMs === 'number' ? row.atMs : 0,
              }
              continue
            }
            if (row.method !== 'GET' || pathWithoutQuery(String(row.path ?? '')) !== '/api/health') continue
            if (row.source === 'child-call') {
              calls.push({
                source: 'child-call',
                method: 'GET',
                origin: String(row.origin ?? ''),
                path: '/api/health',
                clock: 'child-monotonic-ms',
                atMs: typeof row.atMs === 'number' ? row.atMs : 0,
              })
              continue
            }
            if (row.source !== 'child-producer') continue
            producers.push({
              source: 'child-producer',
              method: 'GET',
              origin: String(row.origin ?? ''),
              path: '/api/health',
              clock: 'child-monotonic-ms',
              atMs: typeof row.atMs === 'number' ? row.atMs : 0,
              connection: connectionFrom(row.connection),
            })
          } catch {
            // A torn or foreign line is not evidence.
          }
        }
        resolve(said)
      })
      child.stdin.end(JSON.stringify({ session_id: 'a-world-test' }))
    })
  }

  it('files as usual when the database, the checkout and the port are the ones the declaration names', async () => {
    const api = await serverSaying(formatWorldHeader(declaredHere()))
    const said = await hookAgainst(api)
    expect(said).toContain('is filed in the world this checkout declares')
    expect(asked.some((one) => one.startsWith('POST /api/records'))).toBe(true)
  })

  it('files nothing, and says which fact disagrees, when another database is answering', async () => {
    const api = await serverSaying(formatWorldHeader({ ...declaredHere(), database: '9999999999999999' }))
    const said = await hookAgainst(api)
    expect(said).toContain('IS NOT THE ONE THIS CHECKOUT DECLARES')
    expect(said).toMatch(/the database/i)
    expect(said).toContain('9999999999999999')
    // THE PROOF THAT IT FILED NOTHING: the only request it made was the one that asked which world
    // this is. Nothing was written, so nothing can have been written into the wrong database.
    try {
      expect(asked).toEqual(['GET /api/health'])
    } catch (error) {
      throw withHealthEvidence(error)
    }
  })

  it('files nothing when what is answering does not say which world it is at all', async () => {
    const api = await serverSaying(null)
    const said = await hookAgainst(api)
    expect(said).toContain('DID NOT SAY WHICH WORLD IT IS')
    try {
      expect(asked).toEqual(['GET /api/health'])
    } catch (error) {
      throw withHealthEvidence(error)
    }
  })

  it('keeps the child producer events and the fake server receipts when the one-read check fails', async () => {
    // A TEST-ONLY MUTATION THROUGH THE REAL HOOK FIXTURE. The child is asked for one extra health
    // request, so the exact one-read check must fail. What this case holds is the evidence that
    // failure has to carry: the producer the child recorded and the receipt this server saw, kept
    // apart and matched only by an observed socket tuple, or marked unknown.
    const api = await serverSaying(formatWorldHeader({ ...declaredHere(), database: '9999999999999999' }))
    const said = await hookAgainst(api, { secondHealthFetch: true })
    expect(said).toContain('IS NOT THE ONE THIS CHECKOUT DECLARES')

    let failure: Error | null = null
    try {
      expect(asked).toEqual(['GET /api/health'])
    } catch (error) {
      failure = withHealthEvidence(error)
    }

    expect(failure, 'a second health request must fail the one-read check').not.toBeNull()
    const evidence = healthEvidenceForTheFailure()
    expect(String(failure?.message ?? '')).toContain(HEALTH_EVIDENCE_MARK)
    expect(String(failure?.message ?? '')).toContain(JSON.stringify(evidence))
    expect(evidence.detach?.source).toBe('child-detach')
    expect(evidence.detach?.removed).toEqual({ create: true, send: true })
    expect(evidence.detach?.hasSubscribers).toEqual({ create: false, send: false })
    expect(evidence.calls).toHaveLength(2)
    expect(evidence.calls.every((one) => one.source === 'child-call' && one.path === '/api/health')).toBe(true)
    expect(evidence.producers).toHaveLength(2)
    expect(evidence.receipts).toHaveLength(2)
    expect(evidence.producers.every((one) => one.source === 'child-producer' && one.path === '/api/health')).toBe(true)
    expect(evidence.receipts.every((one) => one.source === 'fake-server-receipt' && one.path === '/api/health')).toBe(true)

    // EVERY ROW IS IN ONE GROUP, and the groups say which observed connection carries them. Times
    // are never used to pair a producer with a receipt; a missing tuple is unknown with its reason.
    expect(evidence.correlation.flatMap((group) => group.producers)).toEqual([0, 1])
    expect(evidence.correlation.flatMap((group) => group.receipts)).toEqual([0, 1])
    for (const group of evidence.correlation) {
      expect(['socket-tuple', 'unknown']).toContain(group.matchedBy)
      if (group.matchedBy === 'unknown') expect(String(group.why ?? '')).not.toBe('')
    }
    const everyConnectionKnown = evidence.producers.every((one) => one.connection?.complete === true) &&
      evidence.receipts.every((one) => one.connection?.complete === true)
    if (everyConnectionKnown) {
      expect(evidence.correlation.every((group) => group.matchedBy === 'socket-tuple')).toBe(true)
    } else {
      expect(evidence.correlation.some((group) => group.matchedBy === 'unknown')).toBe(true)
    }
  })

  it('leaves a partly observed connection unknown instead of calling it a socket match', async () => {
    // THE FIXTURE DROPS THE SAME END OF THE TUPLE ON BOTH SIDES: the child's client port and the
    // server's reading of that port. A partial observation cannot establish a connection, so the
    // rows are kept and the correlation must say unknown with its reason. This is a controlled
    // test of the unknown path, not a claim about the original historical red.
    const api = await serverSaying(
      formatWorldHeader({ ...declaredHere(), database: '9999999999999999' }),
      { incompleteReceipt: true },
    )
    const said = await hookAgainst(api, { secondHealthFetch: true, incompleteProducer: true })
    expect(said).toContain('IS NOT THE ONE THIS CHECKOUT DECLARES')

    let failure: Error | null = null
    try {
      expect(asked).toEqual(['GET /api/health'])
    } catch (error) {
      failure = withHealthEvidence(error)
    }

    expect(failure, 'a second health request must fail the one-read check').not.toBeNull()
    const evidence = healthEvidenceForTheFailure()
    expect(evidence.producers).toHaveLength(2)
    expect(evidence.receipts).toHaveLength(2)
    expect(evidence.producers.every((one) => one.connection !== null && one.connection.localPort === null)).toBe(true)
    expect(evidence.receipts.every((one) => one.connection !== null && one.connection.remotePort === null)).toBe(true)
    expect(evidence.calls).toHaveLength(2)
    expect(evidence.correlation.length).toBeGreaterThan(0)
    expect(evidence.correlation.every((group) => group.matchedBy === 'unknown' && String(group.why ?? '') !== '')).toBe(true)
    expect(evidence.correlation.flatMap((group) => group.producers)).toEqual([0, 1])
    expect(evidence.correlation.flatMap((group) => group.receipts)).toEqual([0, 1])
  })
})

// The record is created so this file exercises a write as well as a read; `AGENT` is the actor
// every test in this repository writes as.
describe('a write carries the world too', () => {
  it('puts the world on the reply to a POST that really wrote something', async () => {
    const made = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note, so there is something to read back',
      data: { body: 'one line' },
      actor: AGENT,
    })
    const reply = await app.inject({ method: 'GET', url: `/api/records/${made.id}`, headers })
    expect(reply.statusCode, reply.body).toBe(200)
    const read = parseWorldHeader(String(reply.headers[WORLD_HEADER] ?? ''))
    expect(read.ok ? 'readable' : read.why).toBe('readable')
  })
})
