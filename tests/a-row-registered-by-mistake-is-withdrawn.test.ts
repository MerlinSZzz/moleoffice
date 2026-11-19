// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TAKING BACK A LEDGER ROW THAT SHOULD NEVER HAVE BEEN WRITTEN, WITHOUT TOUCHING THE MACHINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The ledger had one way in and one way out, and the way out was an act on the machine: `release`
 * signals the process group the row names. So an agent that registered the wrong number had no
 * honest move at all.
 *
 * On 4 September 2026 a verifier registered process group 1121660 as its own. It was a test suite
 * in another agent's worktree, matched by command line before the working directory was checked.
 * Release refused, correctly, because the owning session was still running. The wrong row stayed
 * live, pointing a later tidy-up at a process nobody owned — and that protection disappears the
 * moment the session is marked finished, which is exactly when somebody tidies up. Problem
 * `D_Zohu9lS6P0`.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING EVERY TEST HERE RESTS ON
 * ---------------------------------------------------------------------------------------
 *
 * A withdrawal signals nothing. So each case that withdraws registers a REAL detached child of this
 * test's own and asserts the child is still alive afterwards. A fake probe would prove that no fake
 * kill was recorded; a real child proves nothing was signalled at all. The children are detached
 * into their own process groups, so a signal in this file can never reach the test runner, and the
 * cleanup stops them by group and never by a command-line pattern.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { freshDb, one, type TestDb } from './helpers.ts'
import type { WithdrawResponse } from '../src/server/api/resources.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
}

let h: Harness
/** Every real child this file started, stopped by GROUP afterwards. */
let started: ChildProcess[]

/**
 * A throwaway database, the ledger loaded against it, and the routes on a Fastify app.
 *
 * Imported dynamically AFTER freshDb() has pointed MOLE_OFFICE_DB at a temporary file, for the
 * reason tests/helpers.ts gives, and so the route file and this file share one instance of the lib.
 */
async function freshLedger(): Promise<Harness> {
  const t = await freshDb()
  const res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const app = Fastify({ logger: false })
  // Without this every refusal is a 500 with no message, and every assertion about what a caller is
  // told would be testing Fastify's default rather than Mole Office's answer.
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.ready()
  return { t, res, app }
}

beforeEach(async () => {
  h = await freshLedger()
  started = []
})

afterEach(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      // Negative pid is the whole group. These are this file's own detached children, by the pid
      // the spawn itself returned, and nothing else on the machine can match.
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  await h.app.close()
  h.t.close()
})

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** A session record, running unless said otherwise. */
function session(data: Record<string, unknown> = {}): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'the run under test',
    data: { state: 'running', runtime: 'claude-code', ...data },
    actor: h.t.api.HUMAN,
  }).id
}

/** A real process of this test's own, in its own group, that outlives the command that started it. */
function aRealChild(): ChildProcess {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  return child
}

/**
 * Is that child still running?
 *
 * NOT `process.kill(pid, 0)`, WHICH IS WHAT THIS USED TO BE AND WHICH PROVED NOTHING. A child that
 * has been signalled but not yet reaped is a zombie, and signal 0 on a zombie succeeds, so the
 * check passed with a SIGTERM planted in the withdrawal. Measured on 4 September 2026 while proving
 * this file by mutation, which is the whole reason the rule says to prove them.
 *
 * Node reaps the children it spawned and fills in `exitCode` or `signalCode` when it does, so those
 * two say what really happened. The wait is for the reaping, not for the death.
 */
async function stillRunning(child: ChildProcess): Promise<boolean> {
  await new Promise((ok) => setTimeout(ok, 300))
  return child.exitCode === null && child.signalCode === null
}

interface Answer {
  status: number
  body: Record<string, unknown>
  error: string
}

/** A withdrawal sent as a session, which is the only way an agent sends one. */
async function withdrawAs(
  id: string,
  sessionRef: string | null,
  payload: Record<string, unknown>,
): Promise<Answer> {
  const headers: Record<string, string> = {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest/withdraw',
  }
  // Claiming a session means claiming an identity, and the server refuses one without the other.
  if (sessionRef !== null) headers['x-mole-office-session'] = sessionRef
  const r = await h.app.inject({ method: 'POST', url: `/api/resources/${id}/withdraw`, headers, payload })
  const body = r.json() as Record<string, unknown>
  return { status: r.statusCode, body, error: typeof body['error'] === 'string' ? body['error'] : '' }
}

/** One row read back out of the ledger, released ones included. */
async function rowInTheLedger(id: string): Promise<{
  releasedAt: string | null
  releasedBy: string | null
  releaseNote: string | null
}> {
  const r = await h.app.inject({ method: 'GET', url: '/api/resources?includeReleased=true' })
  const rows = (
    r.json() as {
      resources: { id: string; releasedAt: string | null; releasedBy: string | null; releaseNote: string | null }[]
    }
  ).resources
  return one(rows.filter((row) => row.id === id), `ledger row ${id}`)
}

/** A row a session registered for a process that is really running. */
function aRowFor(child: ChildProcess, sessionId: string, startedByTheProduct?: boolean): string {
  return h.res.registerResource({
    workspaceId: 'default',
    sessionRecordId: sessionId,
    type: 'process',
    key: String(child.pid),
    actor: HUMAN,
    ...(startedByTheProduct === true ? { startedByTheProduct: true } : {}),
  }).id
}

describe('a session takes back a row it should never have written', () => {
  it('closes the row, signals nothing, and says so in its own words', async () => {
    const child = aRealChild()
    const sessionId = session()
    const id = aRowFor(child, sessionId)

    const answer = await withdrawAs(id, sessionId, {
      because: 'this is another agent worktree test suite, matched by command line before the directory was checked',
    })

    expect(answer.status, answer.error).toBe(200)
    const done = answer.body as unknown as WithdrawResponse
    expect(done.withdrawn).toBe(true)
    // NOTHING WAS SIGNALLED, proved against the machine rather than against a fake.
    expect(await stillRunning(child), 'the withdrawal signalled the process it named').toBe(true)

    const row = await rowInTheLedger(id)
    expect(row.releasedAt, 'the row is still live after a withdrawal').not.toBeNull()
    expect(row.releasedBy).toBe('agent:vitest/withdraw')
    expect(row.releaseNote ?? '').toContain('withdrawn as a mistake by the session that registered it')
    expect(row.releaseNote ?? '').toContain('nothing was signalled')
    expect(row.releaseNote ?? '', 'the caller own words are not on the row').toContain('matched by command line')
  })

  it('says what it could not check, rather than letting a 200 imply a check that did not happen', async () => {
    const child = aRealChild()
    const sessionId = session()
    const id = aRowFor(child, sessionId)

    const answer = await withdrawAs(id, sessionId, { because: 'wrong number' })
    expect(answer.status, answer.error).toBe(200)
    const done = answer.body as unknown as WithdrawResponse

    // Nothing stored says who caused a process to exist, so the row was closed on the caller's word.
    // A reply that did not say so would be Mole Office appearing to agree that the row was wrong.
    expect(done.notChecked).toContain('cannot tell whether this session really started')
    expect(done.notChecked, 'the reply does not say where the thing can still be seen').toContain(
      '/api/resources/scan',
    )
    expect(done.outcome).toContain('nothing was signalled')
  })

  it('tells a withdrawn row from a row somebody stopped', async () => {
    const child = aRealChild()
    const sessionId = session()
    const withdrawn = aRowFor(child, sessionId)
    await withdrawAs(withdrawn, sessionId, { because: 'never mine' })

    // A second row, ended the other way: the session is finished, so the release may act, and the
    // process it names has already gone.
    const other = aRealChild()
    const otherSession = session()
    const stopped = aRowFor(other, otherSession)
    process.kill(-(other.pid as number), 'SIGKILL')
    await new Promise((ok) => setTimeout(ok, 300))
    const released = await h.app.inject({
      method: 'POST',
      url: `/api/resources/${stopped}/release`,
      headers: {
        'x-mole-office-session': otherSession,
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'vitest/withdraw',
      },
      payload: {},
    })
    expect(released.statusCode, released.body).toBe(200)

    const a = await rowInTheLedger(withdrawn)
    const b = await rowInTheLedger(stopped)
    expect(a.releaseNote ?? '').toContain('withdrawn as a mistake')
    expect(b.releaseNote ?? '', 'a released row reads as a withdrawal').not.toContain('withdrawn as a mistake')
  })
})

describe('a withdrawal is refused when it would not be honest', () => {
  it('refuses a caller that is not the session named on the row, and leaves the row alone', async () => {
    const child = aRealChild()
    const sessionId = session()
    const id = aRowFor(child, sessionId)
    const somebodyElse = session()

    const answer = await withdrawAs(id, somebodyElse, { because: 'tidying up' })
    expect(answer.status).toBe(403)
    expect(answer.error).toContain('Only the session that registered a row may withdraw it')
    expect(answer.error, 'the refusal does not name the session that may').toContain(sessionId)

    const row = await rowInTheLedger(id)
    expect(row.releasedAt, 'the row was closed by a caller that was refused').toBeNull()
    expect(await stillRunning(child)).toBe(true)
  })

  it('refuses a caller that names no session at all', async () => {
    const child = aRealChild()
    const id = aRowFor(child, session())
    const answer = await withdrawAs(id, null, { because: 'tidying up' })
    expect(answer.status).toBe(403)
    expect((await rowInTheLedger(id)).releasedAt).toBeNull()
  })

  it('refuses a row that has already ended, and says what it says about itself', async () => {
    const child = aRealChild()
    const sessionId = session()
    const id = aRowFor(child, sessionId)
    expect((await withdrawAs(id, sessionId, { because: 'never mine' })).status).toBe(200)

    const again = await withdrawAs(id, sessionId, { because: 'still never mine' })
    expect(again.status).toBe(409)
    expect(again.error).toContain('already ended')
    expect(again.error, 'the refusal does not say what the row already holds').toContain('withdrawn as a mistake')
  })

  it('refuses a row Mole Office wrote for a process it started for this session', async () => {
    // THE ONE CASE THE STORED DATA CAN ANSWER. The row says the product started the process, and
    // the session record says the session IS that process. Two writes, not one claim. Withdrawing
    // it would take something this product started off the only list that has it.
    const child = aRealChild()
    const sessionId = session({ startedByMoleOffice: true })
    const id = aRowFor(child, sessionId, true)

    const answer = await withdrawAs(id, sessionId, { because: 'I would rather not have this on the list' })
    expect(answer.status).toBe(409)
    expect(answer.error).toContain('not one somebody typed by mistake')
    expect(answer.error, 'the refusal does not say what to do instead').toContain('release')

    expect((await rowInTheLedger(id)).releasedAt).toBeNull()
    expect(await stillRunning(child)).toBe(true)
  })

  it('allows a product-started row whose session never said it is that process', async () => {
    // Half the pair is not the pair. A row claiming the product started it, on a session record
    // that says nothing of the kind, is a single claim by one caller and is withdrawable.
    const child = aRealChild()
    const sessionId = session()
    const id = aRowFor(child, sessionId, true)

    const answer = await withdrawAs(id, sessionId, { because: 'the row claims something nobody else says' })
    expect(answer.status, answer.error).toBe(200)
    expect(await stillRunning(child)).toBe(true)
  })

  it('refuses a withdrawal that says nothing, because a row taken back in silence is not a fact', async () => {
    const child = aRealChild()
    const sessionId = session()
    const id = aRowFor(child, sessionId)

    for (const payload of [{}, { because: '   ' }]) {
      const answer = await withdrawAs(id, sessionId, payload)
      expect(answer.status, JSON.stringify(payload)).toBe(400)
    }
    expect((await rowInTheLedger(id)).releasedAt).toBeNull()
  })

  it('refuses an id that names nothing', async () => {
    const answer = await withdrawAs('no-such-row', session(), { because: 'anything' })
    expect(answer.status).toBe(404)
  })
})
