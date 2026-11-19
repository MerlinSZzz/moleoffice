// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SCRATCH RUNTIMES HAVE OWNERS, WORLDS AND ENDS — criterion G5 of design/ground/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS, AND THE RULE OVER ALL OF THEM
 * ---------------------------------------------------------------------------------------
 *
 * 1. **A registered resource carries the world it serves**, read at registration: the repository,
 *    the database, the port and the commit. Until now a row said a session had taken port 29601
 *    and nothing said what was on it, so nobody could tell an API serving the real corpus from one
 *    serving a temporary copy without going to look.
 * 2. **One command lists every Mole Office-looking listener** and says, for each, who registered it
 *    and what it serves, or UNOWNED.
 * 3. **Ends.** A registered process the product started, whose owner session has ended, may be
 *    stopped by a press that records who pressed and why.
 *
 * The rule over all of it is the answer to F1: naming only.
 * Nothing the product did not start is ever stopped by it, and no clock reaches a process. Half the
 * tests below are about what the product REFUSES to do.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { apiServerArguments, AGENT, freshDb, one, type TestDb } from './helpers.ts'
import type { ListenerReport } from '../src/server/lib/listeners.ts'
// The one writer of a world header, imported for real because it opens no database. Building a
// header by hand in a test would be a second idea of what one looks like.
import { formatWorldHeader } from '../src/config/world-header.mjs'
import type { World } from '@shared/runtime.ts'
import type { LedgerEntry } from '../src/server/lib/resources.ts'

let sharedDb: TestDb
let sharedApp: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>
beforeAll(async () => {
  sharedDb = await freshDb()
  const { apiApp } = await import('./helpers.ts')
  sharedApp = await apiApp()
  await sharedApp.app.ready()
})
beforeEach(() => sharedDb.client.sqlite.exec('SAVEPOINT runtime_case'))
afterEach(() => sharedDb.client.sqlite.exec('ROLLBACK TO runtime_case; RELEASE runtime_case'))
afterAll(async () => {
  await sharedApp.app.close()
  sharedDb.close()
})

describe('a registered resource says which world it serves', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>
  let session: string

  beforeEach(async () => {
    t = sharedDb
    app = sharedApp
    session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'the session that started this scratch stack',
      data: { state: 'running' },
      actor: AGENT,
    }).id
  })


  const headers = (): Record<string, string> => ({
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest',
    'x-mole-office-session': session,
    'x-mole-office-workspace': 'default',
  })

  async function registerSelf(body: Record<string, unknown> = {}) {
    return app.app.inject({ method: 'POST', url: '/api/runtime/register', headers: headers(), payload: body })
  }

  it('registers the server answering, with the world it is actually serving', async () => {
    const res = await registerSelf({ detail: 'the API under test' })
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { world: { repository: string; database: string; port: number; head: string | null; standing: { kind: string; because: string[] } }; resources: LedgerEntry[] }

    // THE WORLD, which is the whole point: a row that can say what it is a resource OF.
    expect(body.world.database).toBe(resolve(t.file))
    expect(body.world.repository.endsWith('px-ground-1') || body.world.repository.length > 0).toBe(true)
    expect(body.world.standing.kind).toBe('scratch')
    expect(body.world.standing.because.join(' ')).toContain('test runner')

    const row = one(body.resources.filter((r) => r.type === 'process'), 'the process row')
    expect(row.key).toBe(String(process.pid))
    expect(row.sessionRecordId).toBe(session)
    expect(row.world?.database).toBe(resolve(t.file))
    expect(row.world?.standing.kind).toBe('scratch')
    // The sentence a reader gets from a row like this one.
    expect(row.detail).toContain('the API under test')
  })

  it('records nothing about who started the process unless it is told', async () => {
    // Absence beats a guess. NULL means nobody recorded this, and that is not "no" — but the
    // release door treats them the same, which the last describe block below asserts.
    const plain = one(((await registerSelf()).json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'), 'the process row')
    expect(plain.startedByTheProduct).toBeNull()
  })

  it('says Mole Office started it only when the caller says so', async () => {
    const res = await registerSelf({ startedByTheProduct: true })
    const row = one((res.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'), 'the process row')
    expect(row.startedByTheProduct).toBe(true)
  })

  it('refuses to register without a session, because a row with a guessed owner answers about the wrong session', async () => {
    const res = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'vitest', 'x-mole-office-workspace': 'default' },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('which session started this server')
  })

  it('registers a port only when the server is really listening on it', async () => {
    // A test server built with `inject` holds no socket, so there is no port row. An unlistened
    // port on a row would be a claim rather than a reading, and the ledger keeps those apart.
    const body = (await registerSelf()).json() as { resources: LedgerEntry[] }
    for (const row of body.resources.filter((r) => r.type === 'port')) {
      expect(Number(row.key)).toBeGreaterThan(0)
    }
    expect(body.resources.some((r) => r.type === 'process')).toBe(true)
  })
})

/**
 * EVERY REGISTERED ROW SAYS WHICH WORLD IT SERVES, NOT ONLY THE ONES A MOLE OFFICE WROTE.
 *
 * G5's words are "registered with its owner session and the world it serves", and act 1 of section 4
 * asks for the canonical server and the canonical browser app "both registered, both saying the
 * same world". Neither could be done. `POST /api/resources` — the route the skill tells an agent to
 * use, and the only route a Vite has — recorded no world at all, so the GROUND verifier measured
 * not one row on the canonical ledger carrying one, the owner's own two processes included.
 * Problem `oRrML6lgPNnr`.
 *
 * There are three honest ways to have a world and this block covers all three, plus the fourth
 * case, which is not having one. That case is stored and named, never refused: the answer to F1
 * is naming only, and a registration refused for want of a world is a
 * process on no list at all.
 */
describe('a row registered through the ordinary door says which world it serves', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>
  let session: string

  beforeEach(async () => {
    t = sharedDb
    app = sharedApp
    session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'the session that started this scratch stack',
      data: { state: 'running' },
      actor: AGENT,
    }).id
  })


  /** The sentence a reader gets from a row, loaded after freshDb because that module opens the database. */
  async function rowSays(world: World | null): Promise<string> {
    const { whatTheRowSaysItServes } = await import('../src/server/lib/listeners.ts')
    return whatTheRowSaysItServes(world)
  }

  const headers = (): Record<string, string> => ({
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest',
    'x-mole-office-session': session,
    'x-mole-office-workspace': 'default',
  })

  async function register(body: Record<string, unknown>) {
    return app.app.inject({ method: 'POST', url: '/api/resources', headers: headers(), payload: body })
  }

  /**
   * The process registered here is this test's own, which started before the session it files, so each
   * registration adopts it in words, as the browser app does for itself (decision AOwsOHMVq6Ce).
   */
  const ADOPTING = 'this test registers its own process, which started before the session it filed'

  /** A world header as a real Mole Office writes one. Built by the one writer, never by hand here. */
  function aWorldHeader(over: Partial<Record<string, string>> = {}): string {
    return formatWorldHeader({
      database: 'ab12cd34ef567890',
      repository: `${THE_TEST_FIXTURE_ROOT}/px-somewhere`,
      port: '29601',
      head: 'abc1234',
      standing: 'scratch',
      ...over,
    })
  }

  it('takes a world the caller read off a reply, and stores it', async () => {
    const res = await register({
      type: 'process',
      key: String(process.pid),
      adopting: ADOPTING,
      detail: 'a browser app registering itself',
      world: aWorldHeader(),
    })
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { resource: LedgerEntry; world: World | null; howTheWorldWasGot: string }

    expect(body.resource.world?.repository).toBe(`${THE_TEST_FIXTURE_ROOT}/px-somewhere`)
    expect(body.resource.world?.databaseIdentity).toBe('ab12cd34ef567890')
    expect(body.resource.world?.port).toBe(29601)
    expect(body.resource.world?.head).toBe('abc1234')
    expect(body.resource.world?.standing.kind).toBe('scratch')
    expect(body.howTheWorldWasGot).toContain('the caller sent it')
  })

  it('leaves the database path null and carries the identity, because a header has no path', async () => {
    // A path is not an identity, which is why the header carries one. Inventing a path from an
    // identity would be a guess about a file, and the negative control this product is checked
    // with serves a COPY of the database from a second path.
    const body = (await register({ type: 'process', key: String(process.pid), adopting: ADOPTING, world: aWorldHeader() })).json() as {
      resource: LedgerEntry
    }
    expect(body.resource.world?.database).toBeNull()
    expect(body.resource.world?.databaseIdentity).toBe('ab12cd34ef567890')
  })

  it('says the header did not carry the reasons, rather than leaving them empty', async () => {
    // An empty `because` is what a canonical world has. A scratch world with an empty one would
    // read as canonical-shaped, so the one thing that IS known is written down.
    const scratch = (await register({ type: 'process', key: String(process.pid), adopting: ADOPTING, world: aWorldHeader() })).json() as {
      resource: LedgerEntry
    }
    expect(scratch.resource.world?.standing.because.join(' ')).toContain('a header does not carry the reasons')
  })

  it('records how it came by the world, because the three ways are not equally strong', async () => {
    const body = (await register({ type: 'process', key: String(process.pid), adopting: ADOPTING, world: aWorldHeader() })).json() as {
      resource: LedgerEntry
    }
    expect(body.resource.world?.saidBy).toContain('read it off a reply')
  })

  it('stores no world when there is none to be had, and names it as such instead of refusing', async () => {
    // A lock file has no port to ask and nobody sent a world. The row is written anyway.
    const res = await register({ type: 'lock', key: '/tmp/a-lock-for-this-test.lock', detail: 'a lock' })
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { resource: LedgerEntry; world: World | null; howTheWorldWasGot: string }
    expect(body.resource.world).toBeNull()
    expect(body.world).toBeNull()
    expect(body.howTheWorldWasGot).toContain('nobody recorded one')
    // And that is what a reader is told, in the same words the listener report prints.
    expect(await rowSays(body.resource.world)).toContain('does not record which world it serves')
  })

  it('refuses a world it cannot read, which is a different thing from sending none', async () => {
    const res = await register({ type: 'process', key: String(process.pid), world: 'this is not a world header' })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('could not be read')
    expect(res.body).toContain('Leave it out entirely if you do not have one')
  })

  it('prints a stored world whether it carries a path or only an identity', async () => {
    const fromItself = await rowSays({
      repository: `${THE_TEST_FIXTURE_ROOT}/px-ground-3`,
      database: `${THE_TEST_FIXTURE_ROOT}/px-ground-3/data/ground-3.db`,
      databaseIdentity: 'ab12cd34ef567890',
      port: 29820,
      head: 'abc1234',
      standing: { kind: 'scratch', because: ['it is running from a git worktree'] },
      readAt: '2026-09-04 00:00:00',
      saidBy: 'the process itself',
    })
    expect(fromItself).toContain(`${THE_TEST_FIXTURE_ROOT}/px-ground-3/data/ground-3.db`)

    const fromAHeader = await rowSays({
      repository: `${THE_TEST_FIXTURE_ROOT}/px-ground-3`,
      database: null,
      databaseIdentity: 'ab12cd34ef567890',
      port: 29820,
      head: 'abc1234',
      standing: { kind: 'scratch', because: [] },
      readAt: '2026-09-04 00:00:00',
      saidBy: 'a header',
    })
    expect(fromAHeader).toContain('the database whose identity is ab12cd34ef567890')
  })
})

describe('one list names every Mole Office-looking listener, and stops none of them', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>

  beforeEach(async () => {
    t = sharedDb
    app = sharedApp
  })


  async function listeners(): Promise<ListenerReport> {
    const res = await app.app.inject({
      method: 'GET',
      url: '/api/runtime/listeners',
      headers: { 'x-mole-office-workspace': 'default' },
    })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as ListenerReport
  }

  it('says what it looked for, so an empty list can be read honestly', async () => {
    const report = await listeners()
    expect(report.lookedFor.length).toBe(5)
    expect(report.lookedFor.join(' ')).toContain(".env declares")
    expect(report.lookedFor.join(' ')).toContain('the server answering you was told to take')
    expect(report.lookedFor.join(' ')).toContain('a live row in the “Running on this machine” list names')
    expect(report.lookedFor.join(' ')).toContain('127.0.0.1')
  })

  it('says which world answered the question, so two stacks can be told apart', async () => {
    const report = await listeners()
    expect(report.answeredBy.database).toBe(resolve(t.file))
    expect(report.answeredBy.standing.kind).toBe('scratch')
  })

  it('calls a listener nobody registered UNOWNED, and says it will not stop it', async () => {
    // Every listener this machine has that looks like a Mole Office and that no live row claims.
    // On the machine this suite runs on there is usually at least the owner's own stack; where
    // there is none the assertion below is about the shape of the answer rather than a count.
    const report = await listeners()
    for (const listener of report.listeners.filter((l) => !l.registered)) {
      expect(listener.says).toContain('UNOWNED')
      expect(listener.says).toContain('will not stop it')
      expect(listener.stoppable).toBe(false)
      expect(listener.notStoppableBecause).toContain('never stops what it did not start')
      expect(listener.world).toBeNull()
    }
  })

  it('never marks anything stoppable that the product did not start', async () => {
    const report = await listeners()
    for (const listener of report.listeners) {
      if (!listener.stoppable) continue
      // The only way through: a row that says so AND a session that has ended.
      expect(listener.registered).toBe(true)
      expect(listener.ownerEnded).toBe(true)
    }
  })
})

describe('an end is a press, and only for what Mole Office started', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>

  beforeEach(async () => {
    t = sharedDb
    app = sharedApp
  })


  /** A session in the given state, and a process row for this process owned by it. */
  async function rowOwnedBy(state: string, startedByTheProduct: boolean | undefined): Promise<string> {
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: `a ${state} session`,
      data: { state },
      actor: AGENT,
    }).id
    const res = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'vitest',
        'x-mole-office-session': session,
        'x-mole-office-workspace': 'default',
      },
      payload: startedByTheProduct === undefined ? {} : { startedByTheProduct },
    })
    expect(res.statusCode, res.body).toBe(201)
    const rows = (res.json() as { resources: LedgerEntry[] }).resources
    return one(rows.filter((r) => r.type === 'process'), 'the process row').id
  }

  async function press(resourceId: string, why = 'the gate is over') {
    return app.app.inject({
      method: 'POST',
      url: '/api/runtime/stop',
      headers: {
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
        'x-mole-office-workspace': 'default',
      },
      payload: { resourceId, why },
    })
  }

  it('refuses a row that does not say Mole Office started the process', async () => {
    // The commonest case by far, and the one the rule is about: nobody wrote it down.
    const id = await rowOwnedBy('finished', undefined)
    const res = await press(id)
    expect(res.statusCode).toBe(409)
    expect(res.body).toContain('does not say Mole Office started it')
    expect(res.body).toContain('not permission')
  })

  it('refuses while the session that started it is still going', async () => {
    const id = await rowOwnedBy('running', true)
    const res = await press(id)
    expect(res.statusCode).toBe(409)
    expect(res.body).toContain('still going')
  })

  it('refuses a pid, because a stop names a ledger row and nothing else', async () => {
    const res = await press(String(process.pid))
    expect(res.statusCode).toBe(404)
    expect(res.body).toContain('names a ledger row, never a pid')
  })

  it('refuses a row that does not exist rather than answering a cheerful 200', async () => {
    const res = await press('nosuchrow1234')
    expect(res.statusCode).toBe(404)
  })

  it('names the person’s rule in the refusal, so a reader knows it is a decision and not a bug', async () => {
    const id = await rowOwnedBy('finished', undefined)
    const res = await press(id)
    expect(res.body).toContain('names what it did not start and never stops it')
    expect(res.body).toContain('Stop it yourself by process group')
  })

  it('stops only the selected product-owned ledger row and leaves another group alive', async () => {
    const children = [
      spawn('sleep', ['120'], { detached: true, stdio: 'ignore' }),
      spawn('sleep', ['120'], { detached: true, stdio: 'ignore' }),
    ]
    const { registerResource, LINUX_PROBE } = await import('../src/server/lib/resources.ts')
    try {
      const session = t.api.createRecord({ workspaceId: 'default', kind: 'session',
        title: 'a finished runtime fixture', data: { state: 'finished' }, actor: t.api.HUMAN }).id
      const rows = children.map(child => registerResource({ workspaceId: 'default', sessionRecordId: session,
        type: 'process', key: String(child.pid), startedByTheProduct: true, actor: t.api.HUMAN }))
      t.client.sqlite.prepare('UPDATE session_resources SET started_by_the_product = 0 WHERE id = ?').run(rows[0]!.id)
      const refused = await press(rows[0]!.id)
      expect(refused.statusCode, refused.body).toBe(409)
      expect(LINUX_PROBE.processById(children[0]!.pid!)).not.toBeNull()
      t.client.sqlite.prepare('UPDATE session_resources SET started_by_the_product = 1 WHERE id = ?').run(rows[0]!.id)
      const stopped = await press(rows[0]!.id)
      expect(stopped.statusCode, stopped.body).toBe(200)
      expect(stopped.json().stopped).toBe(true)
      expect(LINUX_PROBE.processById(children[0]!.pid!)).toBeNull()
      expect(LINUX_PROBE.processById(children[1]!.pid!)).not.toBeNull()
    } finally {
      for (const child of children) if (child.pid !== undefined) {
        try { process.kill(-child.pid, 'SIGKILL') } catch { /* The selected group has already ended. */ }
      }
    }
  })

  it('takes a reason, and will not act without one', async () => {
    const id = await rowOwnedBy('finished', true)
    const res = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/stop',
      headers: {
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
        'x-mole-office-workspace': 'default',
      },
      payload: { resourceId: id },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('the gate opens for the one case it is meant to, without anything being signalled', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>

  beforeEach(async () => {
    t = sharedDb
    app = sharedApp
  })


  /**
   * THE PRESS IS NOT SENT HERE, AND THAT IS DELIBERATE.
   *
   * The one row this product may stop is a process it started whose session has ended, and in a
   * test the only such process is the test runner itself. Sending the press would signal this
   * process's own group and take the suite down with it. So the GATE is asked directly: `rowForStop`
   * is the whole of the decision, and `releaseResource` behind it has been signalling by group and
   * writing down who asked since round seven, with its own tests.
   */
  it('lets a row through when all three of its conditions are true', async () => {
    const { rowForStop } = await import('../src/server/lib/listeners.ts')
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a session Mole Office ran, which has finished',
      data: { state: 'finished' },
      actor: AGENT,
    }).id
    const res = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'vitest',
        'x-mole-office-session': session,
        'x-mole-office-workspace': 'default',
      },
      payload: { startedByTheProduct: true },
    })
    expect(res.statusCode, res.body).toBe(201)
    const id = one(
      (res.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'),
      'the process row',
    ).id

    const allowed = rowForStop(id, 'default')
    expect(allowed.entry.id).toBe(id)
    expect(allowed.entry.startedByTheProduct).toBe(true)
    expect(allowed.session.ended).toBe(true)
    // Still live: asking whether it may be stopped stops nothing.
    expect(allowed.entry.releasedAt).toBeNull()
  })

  it('and the same row is refused the moment any one of the three stops being true', async () => {
    const { rowForStop } = await import('../src/server/lib/listeners.ts')
    const running = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a session Mole Office ran, still going',
      data: { state: 'running' },
      actor: AGENT,
    }).id
    const res = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'vitest',
        'x-mole-office-session': running,
        'x-mole-office-workspace': 'default',
      },
      payload: { startedByTheProduct: true },
    })
    const id = one(
      (res.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'),
      'the process row',
    ).id
    expect(() => rowForStop(id, 'default')).toThrow('still going')
  })
})

/**
 * A ROW THAT HAS STOPPED MATCHING DOES NOT OWN A LISTENER.
 *
 * Measured on 3 September 2026 while taking this criterion's own measurements: a row registered on
 * 2 September claimed port 5173 with pid 4047726, that process was long gone, something else held
 * the port, and the listener list said "registered by ..." over it. That is worse than saying
 * nothing, because telling an owned listener from an unowned one is the whole point of the list.
 *
 * The rule is the ledger's own, from `serversOnThisMachine`: a row is about this process when the
 * start time it recorded is the start time the process reports now.
 */
describe('a port row only owns a listener while it is still about the same process', () => {
  it('matches when the start time the row recorded is the one the process reports', async () => {
    const { portRowStillMatches } = await import('../src/server/lib/listeners.ts')
    const row = { osStartedAt: '2026-09-03 21:09:13' } as LedgerEntry
    expect(portRowStillMatches(row, '2026-09-03 21:09:13')).toBe(true)
  })

  it('does not match when the port has changed hands', async () => {
    const { portRowStillMatches } = await import('../src/server/lib/listeners.ts')
    const row = { osStartedAt: '2026-09-02 04:11:00' } as LedgerEntry
    expect(portRowStillMatches(row, '2026-09-03 21:09:13')).toBe(false)
  })

  it('does not match when the row has no start time, because it identifies nothing', async () => {
    const { portRowStillMatches } = await import('../src/server/lib/listeners.ts')
    // A row registered while nothing was listening. It is a claim about a number, not about a
    // process, and reading it as ownership is how a dead session came to own a live port.
    expect(portRowStillMatches({ osStartedAt: null } as LedgerEntry, '2026-09-03 21:09:13')).toBe(false)
    expect(portRowStillMatches({ osStartedAt: '2026-09-03 21:09:13' } as LedgerEntry, null)).toBe(false)
  })
})

/**
 * A STACK THAT RELOADS CAN REGISTER AGAIN.
 *
 * Measured on this builder's own stack on 3 September 2026: the stack registered itself, two edits
 * under `src/` restarted it under `tsx watch`, its own rows then named a pid that no longer
 * existed — so the listener list called it UNOWNED — and registering again was refused, because the
 * ledger already held a live row for that port. A stack that becomes unowned by working normally is
 * not owned at all.
 *
 * The registration closes its own rows that have stopped being true, and never signals: releasing
 * would kill whatever holds that port NOW, which after a reload is the server that is registering.
 */
describe('a server that has restarted can write itself into the ledger again', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>
  let session: string

  beforeEach(async () => {
    t = sharedDb
    app = sharedApp
    session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a session whose server keeps reloading',
      data: { state: 'running' },
      actor: AGENT,
    }).id
  })


  async function registerSelf() {
    return app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: {
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'vitest',
        'x-mole-office-session': session,
        'x-mole-office-workspace': 'default',
      },
      payload: {},
    })
  }

  it('writes no second row while the first row is still true', async () => {
    const first = await registerSelf()
    expect(first.statusCode, first.body).toBe(201)
    const row = one(
      (first.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'),
      'the first process row',
    )
    /**
     * Nothing restarted, so the row still describes what is running, and the row that is there is
     * handed back. Two rows for one thing would be reported as two orphans.
     *
     * THIS USED TO BE A 409, and the refusal was the right rule enforced on the wrong fact: it
     * compared the calling session, and the two callers of this route pass different ones, so two
     * rows for one server were written and nothing was refused. Problem `LYOhZtHE97Vj`.
     */
    const second = await registerSelf()
    expect(second.statusCode, second.body).toBe(201)
    const handedBack = one(
      (second.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'),
      'the process row',
    )
    expect(handedBack.id).toBe(row.id)
  })

  it('closes its own row and writes a new one once that row has stopped being true', async () => {
    const { closeRowThatStoppedMatching, liveRowsFor } = await import('../src/server/lib/resources.ts')
    const first = await registerSelf()
    expect(first.statusCode, first.body).toBe(201)
    const row = one(
      (first.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'),
      'the first process row',
    )

    // What a restart does to the row, done directly: the row is closed because what it was about
    // has gone. The end is recorded, and no signal is sent — this process is still running.
    const closed = closeRowThatStoppedMatching(row.id, 'default', 'the process this row was about has gone', AGENT)
    expect(closed.releasedAt).not.toBeNull()
    expect(closed.releaseNote).toContain('has gone')
    expect(process.pid).toBeGreaterThan(0) // still here: closing a row signals nothing

    const again = await registerSelf()
    expect(again.statusCode, again.body).toBe(201)
    const live = liveRowsFor({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(process.pid) })
    expect(live.length, 'exactly one live row per thing, which is what two orphans would break').toBe(1)
    expect(live[0]?.id).not.toBe(row.id)
  })
})

/**
 * THE API SERVER WRITES ITSELF INTO THE LEDGER WHEN IT STARTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `1urksZld8CQQ`. Act 1 of section 4 of design/ground/ACCEPTANCE.md asks for the canonical
 * server and the canonical browser app both registered and both saying the same world. On the
 * owner's own stack on 4 September 2026 only the browser app's row carried one: the Vite plugin
 * registers itself every time Vite starts, and nothing registered the API. Its row had been written
 * by an agent through `POST /api/resources` before servers could say anything about themselves, and
 * nothing rewrites an existing row, so act 1 could not be completed without registering by hand.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REAL SERVERS, ONE AFTER THE OTHER, ON ONE PORT
 * ---------------------------------------------------------------------------------------
 *
 * A server registering itself needs a socket, so this starts real ones. The second start on the
 * same port and the same database is what proves the other half: the first server's row names a pid
 * that has gone, and the second closes it rather than leaving two live rows for one number.
 */
describe('the API server writes itself into the ledger when it starts', () => {
  const REPO = fileURLToPath(new URL('..', import.meta.url))
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  let dir = ''
  let port = 0
  let api = ''
  const started: ChildProcess[] = []

  function freePort(): Promise<number> {
    return new Promise((ok, fail) => {
      const probe = createServer()
      probe.on('error', fail)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        if (address === null || typeof address === 'string') {
          probe.close(() => { fail(new Error('the probe socket reported no port')) })
          return
        }
        const chosen = address.port
        probe.close(() => { ok(chosen) })
      })
    })
  }

  /** Start a real API server on this test's port and database, and wait until it answers. */
  async function startOne(): Promise<number> {
    const child = spawn(join(REPO, 'node_modules/.bin/tsx'), apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        MOLE_OFFICE_PORT: String(port),
        MOLE_OFFICE_DB: join(dir, 'own.db'),
        MOLE_OFFICE_WORKSPACE: 'default',
        LOG_LEVEL: 'warn',
        VITEST: undefined,
        VITEST_WORKER_ID: undefined,
      } as NodeJS.ProcessEnv,
    })
    started.push(child)
    for (let tries = 0; tries < 180; tries += 1) {
      try {
        if ((await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })).ok) {
          return child.pid ?? 0
        }
      } catch {
        // not up yet
      }
      await sleep(500)
    }
    throw new Error(`the server never answered ${api}/api/health`)
  }

  async function stopOne(child: ChildProcess | undefined): Promise<void> {
    if (child?.pid === undefined || child.pid === null || child.exitCode !== null || child.signalCode !== null) return
    const closed = once(child, 'close')
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
    await closed
  }

  interface Row {
    id: string
    type: string
    key: string
    world: World | null
    sessionRecordId: string
  }

  async function liveRows(): Promise<Row[]> {
    const answered = await fetch(`${api}/api/resources`, { headers: { 'x-mole-office-workspace': 'default' } })
    return ((await answered.json()) as { resources: Row[] }).resources
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-registers-itself-'))
    port = await freePort()
    api = `http://127.0.0.1:${String(port)}`
  })

  afterEach(async () => {
    while (started.length > 0) await stopOne(started.pop())
    rmSync(dir, { recursive: true, force: true })
  })

  it('files a session record and rows for its process and its port, each carrying its world', async () => {
    await startOne()
    const rows = await liveRows()
    /**
     * TWO PROCESS ROWS SINCE 4 SEPTEMBER 2026, AND THE SECOND ONE IS THE MESSAGE WORKER.
     *
     * A real server now starts a worker of its own
     * (criterion M9), registers it, and stops it on the way out. This test unsets VITEST when it
     * spawns its server, so unlike the browser tests it gets a real one. The row this test is about
     * is the server's own, which is the one whose key is the server's pid.
     */
    const held = one(rows.filter((r) => r.type === 'port' && r.key === String(port)), 'port row')
    // The server's own process row is the one under the same session as its port. Matching on the
    // pid this test spawned would not do it: `tsx` is what was spawned and node is what registers.
    const process = one(
      rows.filter((r) => r.type === 'process' && r.sessionRecordId === held.sessionRecordId),
      'the API server process row',
    )
    // AND THE WORKER'S ROW IS THE OTHER ONE, under a session of its own.
    const workers = rows.filter((r) => r.type === 'process' && r.sessionRecordId !== held.sessionRecordId)
    expect(workers).toHaveLength(1)

    // THE WORLD ON BOTH, which is what act 1 asks for and what the canonical API's row lacked.
    for (const row of [process, held]) {
      expect(row.world, `${row.type} ${row.key} carries no world`).not.toBeNull()
      expect(row.world?.database).toBe(`${dir}/own.db`)
      expect(row.world?.repository).toBe(REPO.replace(/\/$/, ''))
    }
    // Both rows belong to one session, and that session says what it is.
    expect(held.sessionRecordId).toBe(process.sessionRecordId)
    const session = await fetch(`${api}/api/records/${process.sessionRecordId}`, {
      headers: { 'x-mole-office-workspace': 'default' },
    })
    const filed = (await session.json()) as { record: { title: string; data: { state: string; runtime: string } } }
    expect(filed.record.title).toBe('The API server')
    expect(filed.record.data.state).toBe('running')
  }, 180_000)

  it('closes the row a stopped server left on the port, rather than leaving two live rows for one number', async () => {
    await startOne()
    const first = one((await liveRows()).filter((r) => r.type === 'port'), 'the first port row')

    // The first server goes, and a second takes the same port and the same database.
    await stopOne(started.pop())
    await startOne()

    const rows = await liveRows()
    const ports = rows.filter((r) => r.type === 'port' && r.key === String(port))
    expect(ports.length, `two live rows for port ${String(port)}`).toBe(1)
    // It is the SECOND server's row: a new session, and a world it read about itself.
    expect(ports[0]?.id).not.toBe(first.id)
    expect(ports[0]?.sessionRecordId).not.toBe(first.sessionRecordId)
    expect(ports[0]?.world).not.toBeNull()

    // And the first row is closed rather than deleted, with the reason on it.
    const all = await fetch(`${api}/api/resources?includeReleased=true`, {
      headers: { 'x-mole-office-workspace': 'default' },
    })
    const closed = ((await all.json()) as { resources: { id: string; releasedAt: string | null; releaseNote: string | null }[] })
      .resources.find((r) => r.id === first.id)
    expect(closed?.releasedAt).not.toBeNull()
    expect(closed?.releaseNote).toContain('has gone')
  }, 240_000)
})

/**
 * A ROW THAT CANNOT SAY WHICH WORLD IT SERVES IS FILLED IN, NOT DUPLICATED.
 *
 * The other half of problem `1urksZld8CQQ`. The canonical API's row was written through
 * `POST /api/resources`, which records no world, and nothing could ever give it one: a second
 * registration by the same session for the same live process is refused, because two rows for one
 * thing are reported as two orphans. So the row stayed blank for as long as that process lived.
 *
 * A blank world is not a reading that has aged. It is a row written by something that could not
 * say, and when the process it is about can say, filling it in is the only way it ever gets one.
 */
describe('a live row with no world is given one rather than a second row', () => {
  let t: TestDb
  let app: Awaited<ReturnType<typeof import('./helpers.ts').apiApp>>
  let session: string

  beforeEach(async () => {
    t = sharedDb
    app = sharedApp
    session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'the session that registered it from outside',
      data: { state: 'running' },
      actor: AGENT,
    }).id
  })


  const headers = {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest',
    'x-mole-office-workspace': 'default',
  }

  it('fills the world in on the row this process already has, and writes no second one', async () => {
    // A PLAIN REGISTRATION FROM OUTSIDE, which is what wrote the canonical API's row: it records no
    // world, because the caller is not the process being registered.
    const plain = await app.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: { ...headers, 'x-mole-office-session': session },
      payload: {
        type: 'process',
        key: String(process.pid),
        // This test's process started before the session it filed (decision AOwsOHMVq6Ce).
        adopting: 'somebody else writes down the server, which started before this session was filed',
        detail: 'the server, written down by somebody else',
      },
    })
    expect(plain.statusCode, plain.body).toBe(201)
    const written = (plain.json() as { resource: LedgerEntry }).resource
    expect(written.world).toBeNull()

    // NOW THE SERVER SAYS IT ITSELF.
    const said = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: { ...headers, 'x-mole-office-session': session },
      payload: {},
    })
    expect(said.statusCode, said.body).toBe(201)
    const rows = (said.json() as { resources: LedgerEntry[] }).resources
    const filled = one(rows.filter((r) => r.type === 'process'), 'process row')
    // THE SAME ROW, with a world on it now.
    expect(filled.id).toBe(written.id)
    expect(filled.world).not.toBeNull()
    expect(filled.world?.repository.length).toBeGreaterThan(1)

    // AND THERE IS ONE ROW, not two.
    const live = await app.app.inject({ method: 'GET', url: '/api/resources', headers })
    const forThisProcess = (live.json() as { resources: LedgerEntry[] }).resources.filter(
      (r) => r.type === 'process' && r.key === String(process.pid),
    )
    expect(forThisProcess.length).toBe(1)
  })

  /**
   * IT USED TO ANSWER 409 HERE, AND THAT WAS THE WRONG SHAPE OF THE RIGHT RULE.
   *
   * The rule is one live row for one running process. The refusal enforced it only when the same
   * session asked twice, and the two callers of this route pass different sessions — a server's own
   * start passes the session it files for itself, and the route passes the caller's — so two rows
   * for one server were written and refused nothing. Problem `LYOhZtHE97Vj`.
   *
   * The guard is now on the thing rather than on who is asking, so there is nothing left to refuse:
   * the row that is already there is handed back. `tests/one-row-for-one-running-process.test.ts`
   * is where that is proved from both sides.
   */
  it('hands back the row it already has, rather than writing a second one', async () => {
    const first = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: { ...headers, 'x-mole-office-session': session },
      payload: {},
    })
    expect(first.statusCode, first.body).toBe(201)
    const written = one(
      (first.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'),
      'the process row',
    )
    const again = await app.app.inject({
      method: 'POST',
      url: '/api/runtime/register',
      headers: { ...headers, 'x-mole-office-session': session },
      payload: {},
    })
    expect(again.statusCode, again.body).toBe(201)
    const handedBack = one(
      (again.json() as { resources: LedgerEntry[] }).resources.filter((r) => r.type === 'process'),
      'the process row',
    )
    expect(handedBack.id).toBe(written.id)
    const live = await app.app.inject({ method: 'GET', url: '/api/resources', headers })
    const forThisProcess = (live.json() as { resources: LedgerEntry[] }).resources.filter(
      (r) => r.type === 'process' && r.key === String(process.pid),
    )
    expect(forThisProcess).toHaveLength(1)
  })
})
