// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPERATION THAT REACHES OTHERS RUNS ONLY AFTER THOSE IT AFFECTS HAVE SIGNED. Wave 13u round 13, on two
 * decisions. The rule and the gate are
 * src/server/lib/readiness.ts; the doors are
 * src/server/api/readiness.ts; the gated door is POST /api/harnesses/install.
 *
 *   1. Installing agent tools reaches everyone: the person's press waits, refused in words naming every secretary who
 *      has not signed, with the code readinessWaits and the checklist's id. The person's press is the person's
 *      signature. The signers are the office's: an agent cannot raise it, and a raise that names its own signers is
 *      refused.
 *   2. The person's Stop on a world never waits (round 13b, message t0Iv6NeCMlFC). Neither decision names stopping a
 *      world, and the person's own press must never wait on an agent's signature. The world stops at once, even one an
 *      agent started, and no checklist is written.
 *   3. The last signature runs the install by itself, once. An agent who is not a signer cannot sign. With no home
 *      folder the run is refused before a terminal opens, so the test proves the office ran it without opening one.
 *   4. The person's signature goes only through the person's own door: an agent is refused it, and a test world is
 *      refused it.
 *   5. A signer takes its signature back before it runs, and then it is not counted.
 *   6. The person may always cancel, and an agent that did not raise it may not. Nothing runs.
 *   7. A checklist whose time runs out closes, names who did not sign, and nothing runs.
 *   8. The gate's lookup reads the partial index and the signature index, never the whole table, on a made-up office of
 *      many checklists. The time it took is printed.
 *   9. A checklist is read and signed from any project: a checklist raised in one project is read, and a secretary
 *      signs it, with the header naming another project.
 *
 * MUTATIONS, each after a control run, restored byte for byte. Round 13's, run on that round's cases (case 2 was then
 * a stop that waited), named in the commit that adds this file:
 *   (a) theSignersFor: the secretaries left out of `everyone`: cases 1, 5 and 6 go red.
 *   (b) signAndRunWhenComplete: the `notSigned.length > 0` return taken out: cases 1, 2, 4, 5, 6 and 7 go red (it runs
 *       before everyone has signed).
 *   (c) signAsThePerson: its assertThePersonIsProved call taken out: case 4 goes red.
 *   (d) theSignaturesOf: `AND withdrawn_at IS NULL` taken out: case 5 goes red.
 *   (e) THE_GATES_LOOKUP: `readiness_checklists` made `readiness_checklists NOT INDEXED`: case 8 goes red.
 *   Round 13b, named in its commit:
 *   (f) the stop door sent through a readiness checklist again: case 2 goes red.
 *   (g) throughTheReadinessGate's refusal without its code: case 1 goes red.
 *   (k) signAndRunWhenComplete: `notSigned.length > 0` made `>= 0`, so it never runs: case 3 goes red.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let forgetTheWorldsOwnAuthority: () => void = () => undefined
const PERSON_KEY = randomBytes(32).toString('hex')
const keys = new Map<string, string>()

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

interface Signer {
  kind: string
  id: string
  why: string
  name: string | null
  signedAt: string | null
}
interface Checklist {
  id: string
  operation: string
  level: string
  state: string
  signers: Signer[]
  notSigned: Signer[]
  outcome: string | null
  endsAt: string
}

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

async function startAnAgent(handle: string): Promise<string> {
  const made = await call('POST', '/api/agents/started', { ...PERSON, 'x-mole-office-key': PERSON_KEY }, { handle, name: handle, workArea: ['src'] })
  expect(made.status, made.raw).toBe(201)
  const key = (made.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? ''
  expect(key, `no key was given to ${handle}`).not.toBe('')
  keys.set(handle, key)
  return idOf(handle)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

/** A world row of this office's own, started by the one named, with no processes. Made-up data. */
function aWorld(name: string, startedBy: { kind: string; id: string } | null): string {
  const id = `example-world-${name}`
  t.client.sqlite
    .prepare(
      `INSERT INTO worlds (id, name, kind, started_by_kind, started_by_id, database_identity, standing, born_at, installation)
       VALUES (?, ?, 'test', ?, ?, ?, 'up', '2026-10-10 09:00:00', 'example-installation')`,
    )
    .run(id, name, startedBy?.kind ?? null, startedBy?.id ?? null, `example-db-${name}`)
  return id
}

function diedAt(world: string): string | null {
  return (t.client.sqlite.prepare('SELECT died_at FROM worlds WHERE id = ?').get(world) as { died_at: string | null }).died_at
}

async function theChecklist(id: string): Promise<Checklist> {
  const read = await call('GET', `/api/readiness/${id}`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return read.body['checklist'] as Checklist
}

/** The id the refusal names, which is the last words of every gate refusal. */
function theIdIn(refusal: string): string {
  const found = /The readiness checklist is (\S+)\.$/.exec(refusal)
  expect(found, `the refusal names no checklist: ${refusal}`).not.toBeNull()
  return found![1]!
}

function theNumberOfChecklists(): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM readiness_checklists').get() as { n: number }).n
}

const refusalOf = (body: Record<string, unknown>): string => String(body['error'] ?? body['message'] ?? '')

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  forgetTheWorldsOwnAuthority = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetTheWorldsOwnAuthority()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  // THE CARDS ON DISK, read as the server reads them at start, so the office can say who holds the secretary card.
  const { readTheRoleCards, forgetTheRoleCards } = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  forgetTheRoleCards()
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  for (const handle of ['example-secretary-one', 'example-secretary-two', 'example-starter', 'example-bystander']) await startAnAgent(handle)
  // AFTER EVERY START, because starting an agent writes the registry's roles again.
  for (const handle of ['example-secretary-one', 'example-secretary-two']) {
    t.client.sqlite.prepare("UPDATE agents SET role = 'secretary' WHERE id = ?").run(idOf(handle))
  }
}, 60_000)

afterAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  forgetTheWorldsOwnAuthority()
  await app.close()
  t.close()
})

describe('1. installing agent tools waits for every secretary', () => {
  it("refuses the person's press in words naming each secretary, with the person's own signature on it", async () => {
    const press = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['codex', 'claude-code'] })
    expect(press.status, press.raw).toBe(409)
    const said = refusalOf(press.body)
    // A WAIT, NOT A FAILURE: the page reads the code and draws that the signature is recorded (InstallHarnesses).
    expect(press.body['code']).toBe('readinessWaits')
    expect(press.body['values']).toEqual({ checklist: theIdIn(said) })
    expect(said).toContain('example-secretary-one')
    expect(said).toContain('example-secretary-two')
    const checklist = await theChecklist(theIdIn(said))
    expect(checklist.level).toBe('everyone')
    expect(checklist.state).toBe('waiting')
    expect(checklist.signers.map((one) => one.why).sort()).toEqual(['a-secretary', 'a-secretary', 'the-person'])
    expect(checklist.signers.find((one) => one.kind === 'person')?.signedAt, 'the press is the person\'s signature').not.toBeNull()
    expect(checklist.notSigned.map((one) => one.name).sort()).toEqual(['example-secretary-one', 'example-secretary-two'])

    const waiting = await call('GET', '/api/readiness/waiting-for', asAgent('example-secretary-one'))
    expect(waiting.status, waiting.raw).toBe(200)
    expect((waiting.body['checklists'] as Checklist[]).map((one) => one.id)).toContain(checklist.id)
    const theirs = await call('GET', '/api/readiness/waiting-for', PERSON)
    expect((theirs.body['checklists'] as Checklist[]).map((one) => one.id), 'the person has signed it').not.toContain(checklist.id)

    // A SECOND PRESS FINDS THE SAME CHECKLIST, in either order of the ticks, and raises no second one.
    const again = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['claude-code', 'codex'] })
    expect(theIdIn(refusalOf(again.body))).toBe(checklist.id)
  })

  it('is raised only by the person, and nobody chooses its signers', async () => {
    const byAnAgent = await call('POST', '/api/readiness', asAgent('example-bystander'), { operation: 'harnesses.install', inputs: { harnesses: ['opencode'] } })
    expect(byAnAgent.status, byAnAgent.raw).toBe(403)
    const chosen = await call('POST', '/api/readiness', PERSON, { operation: 'harnesses.install', inputs: { harnesses: ['opencode'] }, signers: [] })
    expect(chosen.status, chosen.raw).toBe(400)
    const unknown = await call('POST', '/api/readiness', PERSON, { operation: 'office.restart-everything', inputs: {} })
    expect(unknown.status, unknown.raw).toBe(400)
  })
})

describe("2. the person's Stop on a world never waits", () => {
  it('stops a world an agent started at once, and writes no checklist', async () => {
    const world = aWorld('watched', { kind: 'agent', id: idOf('example-starter') })
    const before = theNumberOfChecklists()
    const press = await call('POST', `/api/office/worlds/${world}/stop`, PERSON, { because: 'the person has seen enough' })
    expect(press.status, press.raw).toBe(200)
    expect(diedAt(world), 'the press stopped it').not.toBeNull()
    expect(theNumberOfChecklists(), 'no checklist was raised').toBe(before)
  })
})

describe('3. the last signature runs the install by itself, once', () => {
  it('refuses a bystander, and runs on the last secretary\'s signature', async () => {
    const press = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['claude-code', 'opencode'] })
    expect(press.status, press.raw).toBe(409)
    const id = theIdIn(refusalOf(press.body))
    const bystander = await call('POST', `/api/readiness/${id}/sign`, asAgent('example-bystander'))
    expect(bystander.status, bystander.raw).toBe(403)
    const first = await call('POST', `/api/readiness/${id}/sign`, asAgent('example-secretary-one'))
    expect(first.status, first.raw).toBe(200)
    expect(first.body['ran']).toBe(false)
    expect((await theChecklist(id)).state).toBe('waiting')

    // NO HOME FOLDER, so the install is refused before the terminal holder is asked: the office ran it, and no
    // terminal opens in a test.
    const home = process.env.HOME
    delete process.env.HOME
    let last: Awaited<ReturnType<typeof call>>
    try {
      last = await call('POST', `/api/readiness/${id}/sign`, asAgent('example-secretary-two'))
    } finally {
      process.env.HOME = home
    }
    expect(last.status, last.raw).toBe(400)
    expect(last.body['code']).toBe('harnessNoHome')
    const after = await theChecklist(id)
    expect(after.state).toBe('could-not')
    expect(after.outcome).toContain('Everyone signed, and it could not run')

    const twice = await call('POST', `/api/readiness/${id}/sign`, asAgent('example-secretary-two'))
    expect(twice.status, twice.raw).toBe(409)
  })
})

describe("4. the person's signature goes only through the person's own door", () => {
  it('refuses an agent at it, and refuses it in a test world', async () => {
    const press = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['opencode'] })
    const id = theIdIn(refusalOf(press.body))
    // THE PERSON TAKES THE PRESS'S SIGNATURE BACK, so the person's door has a signature to give.
    const back = await call('POST', `/api/readiness/${id}/withdraw`, PERSON)
    expect(back.status, back.raw).toBe(200)
    expect((await theChecklist(id)).notSigned.map((one) => one.kind)).toContain('person')

    const byAnAgent = await call('POST', `/api/readiness/${id}/sign-as-the-person`, asAgent('example-bystander'))
    expect(byAnAgent.status, byAnAgent.raw).toBe(403)

    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'a-test-world-starter'
    forgetTheWorldsOwnAuthority()
    try {
      const inATestWorld = await call('POST', `/api/readiness/${id}/sign-as-the-person`, PERSON)
      expect(inATestWorld.status, inATestWorld.raw).toBe(409)
    } finally {
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
      forgetTheWorldsOwnAuthority()
    }
    expect((await theChecklist(id)).notSigned.map((one) => one.kind)).toContain('person')

    const signed = await call('POST', `/api/readiness/${id}/sign-as-the-person`, PERSON)
    expect(signed.status, signed.raw).toBe(200)
    expect(signed.body['ran']).toBe(false)
    expect((await theChecklist(id)).notSigned.map((one) => one.kind)).not.toContain('person')
  })
})

describe('5. a signer takes its signature back before it runs', () => {
  it('is no longer counted', async () => {
    const press = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['codex', 'claude-code'] })
    const id = theIdIn(refusalOf(press.body))
    const signed = await call('POST', `/api/readiness/${id}/sign`, asAgent('example-secretary-one'))
    expect(signed.status, signed.raw).toBe(200)
    expect(signed.body['ran']).toBe(false)
    expect((await theChecklist(id)).notSigned.map((one) => one.name)).toEqual(['example-secretary-two'])

    const back = await call('POST', `/api/readiness/${id}/withdraw`, asAgent('example-secretary-one'))
    expect(back.status, back.raw).toBe(200)
    expect((await theChecklist(id)).notSigned.map((one) => one.name).sort()).toEqual(['example-secretary-one', 'example-secretary-two'])
    const again = await call('POST', `/api/readiness/${id}/withdraw`, asAgent('example-secretary-one'))
    expect(again.status, again.raw).toBe(409)
  })
})

describe('6. the person may always cancel', () => {
  it('refuses an agent that did not raise it, and the person cancels it; nothing runs', async () => {
    const press = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['codex', 'claude-code'] })
    const id = theIdIn(refusalOf(press.body))
    const byAnAgent = await call('POST', `/api/readiness/${id}/cancel`, asAgent('example-secretary-two'))
    expect(byAnAgent.status, byAnAgent.raw).toBe(403)
    const cancelled = await call('POST', `/api/readiness/${id}/cancel`, PERSON)
    expect(cancelled.status, cancelled.raw).toBe(200)
    expect((cancelled.body['checklist'] as Checklist).state).toBe('cancelled')
    const late = await call('POST', `/api/readiness/${id}/sign`, asAgent('example-secretary-two'))
    expect(late.status, late.raw).toBe(409)
  })
})

describe('7. a checklist whose time runs out closes and nothing runs', () => {
  it('names who did not sign, and the next press raises a new one', async () => {
    const press = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['codex'] })
    const id = theIdIn(refusalOf(press.body))
    t.client.sqlite.prepare("UPDATE readiness_checklists SET ends_at = '2026-01-01 00:00:00' WHERE id = ?").run(id)
    const after = await theChecklist(id)
    expect(after.state).toBe('expired')
    expect(after.outcome).toContain('example-secretary-one')
    expect(after.outcome).toContain('example-secretary-two')
    const late = await call('POST', `/api/readiness/${id}/sign`, asAgent('example-secretary-one'))
    expect(late.status, late.raw).toBe(409)

    const next = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['codex'] })
    expect(theIdIn(refusalOf(next.body))).not.toBe(id)
  })
})

describe('9. a checklist is read and signed from any project', () => {
  it('answers with the header naming another project', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: 'example-other-project', title: 'Example other project' } })
    expect(made.statusCode, made.body).toBeLessThan(300)
    const press = await call('POST', '/api/harnesses/install', PERSON, { harnesses: ['claude-code'] })
    const id = theIdIn(refusalOf(press.body))
    const read = await call('GET', `/api/readiness/${id}`, { ...PERSON, 'x-mole-office-workspace': 'example-other-project' })
    expect(read.status, read.raw).toBe(200)
    expect((read.body['checklist'] as { workspaceId: string }).workspaceId).toBe('default')
    const signed = await call('POST', `/api/readiness/${id}/sign`, { ...asAgent('example-secretary-one'), 'x-mole-office-workspace': 'example-other-project' })
    expect(signed.status, signed.raw).toBe(200)
    expect(signed.body['ran']).toBe(false)
    expect((await theChecklist(id)).notSigned.map((one) => one.name)).toEqual(['example-secretary-two'])
    const nothing = await call('GET', '/api/readiness/no-such-checklist', { ...PERSON, 'x-mole-office-workspace': 'example-other-project' })
    expect(nothing.status, nothing.raw).toBe(404)
  })
})

describe("8. the gate's check is a lookup, not a scan", () => {
  it('reads both indexes on a made-up office of many checklists', async () => {
    const { theWaitingOneOn, THE_GATES_LOOKUP, THE_SIGNATURES_LOOKUP } = await import('../src/server/lib/readiness.ts')
    const insert = t.client.sqlite.prepare(
      `INSERT INTO readiness_checklists (id, workspace_id, operation, inputs, on_what, shows, level, signers, raised_by_kind, raised_by_id, state, raised_at, ends_at)
       VALUES (?, 'default', 'harnesses.install', '{}', ?, 'Example only.', 'everyone', '[]', 'person', ?, ?, '2026-10-10 09:00:00', '2099-01-01 00:00:00')`,
    )
    const MANY = 20_000
    t.client.sqlite.transaction(() => {
      for (let n = 0; n < MANY; n++) insert.run(`example-${String(n)}`, `example-hash-${String(n)}`, THE_PERSON, n % 10 === 0 ? 'waiting' : 'ran')
    })()
    const plan = (sql: string): string =>
      (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('x') as { detail: string }[]).map((row) => row.detail).join(' | ')
    expect(plan(THE_GATES_LOOKUP)).toContain('readiness_checklists_one_waiting_idx')
    expect(plan(THE_SIGNATURES_LOOKUP)).toContain('readiness_signatures_one_per_signer_idx')

    const LOOKUPS = 2_000
    const started = process.hrtime.bigint()
    for (let n = 0; n < LOOKUPS; n++) theWaitingOneOn(`example-hash-${String((n * 7919) % MANY)}`)
    const micros = Number(process.hrtime.bigint() - started) / 1000 / LOOKUPS
    console.log(`readiness gate lookup: ${micros.toFixed(1)} µs each, ${String(LOOKUPS)} lookups among ${String(MANY)} made-up checklists`)
    expect(theWaitingOneOn('example-hash-10')).toBe('example-10')
    expect(theWaitingOneOn('example-hash-11'), 'a closed one is not waiting').toBeNull()
  })
})
