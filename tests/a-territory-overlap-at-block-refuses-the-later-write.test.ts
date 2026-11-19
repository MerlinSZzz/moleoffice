// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * At block a later overlapping territory is refused before storage or announcements.
 * Control: this file, the remind file and the one-list gate file pass on the finished code.
 * Mutate each door's check alone, then the shared chain and running checks, a write kept
 * before refusal, block read as remind and remind read as block. Restore each byte for byte.
 * A start that only changes state does not check again a territory the run already holds: make the
 * patch door check one when the state becomes running, and the state-only start case is red alone.
 * Take the count out of the refusal, count the refused write once instead of each overlap it names, or
 * count a refusal the check door met, and the counting case is red alone.
 * Each case owns its paths because database modules may retain a reading across cases.
 * Since round 194 two runs meet only where their changed paths meet: a path both changed since their cuts, or a path one
 * changed under a narrow entry of the other's territory. A folder two or more agents declare is shared and meets nothing
 * by itself. So each run has a made-up worktree of its own, and the earlier run of a case changes a file under the
 * folder only the later run declares. The refusal names that file, which lies under the case's own path.
 * Round 194's mutation: do not add the paths under a narrow entry (whereTwoRunsMeet in src/server/lib/claims.ts), and
 * cases 1, 2, 8 at both positions, 9 and 10, the state case and the counting case turn red.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aWorktreeOfItsOwn, theRunChanges } from './a-worktree-of-its-own.ts'

const settingName = 'MOLE_OFFICE_GATE_TERRITORIES'
const owner = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
type Agent = { id: string; handle: string; headers: Record<string, string> }
let t: TestDb, app: FastifyInstance, home: string
let participants: typeof import('../src/server/lib/participants.ts')

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'territory-block-home-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv(settingName, undefined)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE APP'S OWN MODULE INSTANCE. `freshDb` resets the module registry, so a static import of this
  // module at the top of the file is not the one the routes read after it.
  participants = await import('../src/server/lib/participants.ts')
}, 60_000)
beforeEach(() => {
  // A RUN AN EARLIER CASE LEFT RUNNING IS ENDED, so each write reads the worktrees of this case's runs only.
  t.client.sqlite
    .prepare("UPDATE records SET data = json_set(data, '$.state', 'crashed') WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'")
    .run()
})
afterEach(async () => {
  // THE GATE CHOICE IS STORED IN THE OFFICE, WHICH EVERY CASE NOW SHARES. Put it back to having no
  // stored choice, so a case never starts on the one before it chose.
  const reply = await app.inject({
    method: 'POST', url: '/api/office/settings', headers: owner,
    payload: { changes: [{ name: settingName, value: null }], because: 'Put the territory gate back after the case.' },
  })
  expect(reply.statusCode, reply.body).toBe(200)
})
afterAll(async () => {
  vi.restoreAllMocks()
  await app.close()
  t.close()
  vi.unstubAllEnvs()
  rmSync(home, { recursive: true, force: true })
})

async function agent(starter?: Agent, role = 'supervisor'): Promise<Agent> {
  const handle = randomUUID()
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: starter?.headers ?? owner,
    payload: { handle, name: 'A test participant', role, runtime: 'claude-code', workArea: [`tests/${randomUUID()}`] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const row = participants.agentByHandle(handle)!
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  return { id: row.id, handle, headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': row.id, 'x-mole-office-key': makeAnAgentKey(row.id, null) } }
}
/** A run with a worktree of its own, which has changed these paths since its cut. */
function run(who: Agent, state = 'running', territory?: string[], changed: readonly string[] = []): string {
  const at = aWorktreeOfItsOwn(home)
  theRunChanges(at.workingDirectory, changed)
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A territory test run',
    actor: { type: 'agent', id: who.id, provedBy: 'an-agent-key', keyHolder: who.id },
    data: { state, runtime: 'claude-code', servingAgentId: who.id, ...at, ...(territory === undefined ? {} : { territory }) },
  }).id
}
function patch(id: string, dataPatch: Record<string, unknown>, by: Agent) {
  return app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: by.headers, payload: { dataPatch } })
}
function groups(): { id: string; about: string; name: string }[] {
  return t.client.sqlite.prepare("SELECT id, about, name FROM groups WHERE about LIKE 'territory|%'").all() as { id: string; about: string; name: string }[]
}
function stored(id: string): unknown { return t.api.getRecord(id)?.data['territory'] }
function set(value: string) {
  return app.inject({ method: 'POST', url: '/api/office/settings', headers: owner,
    payload: { changes: [{ name: settingName, value }], because: 'Measure the territory reminder setting.' } })
}

async function block() { const reply = await set('block'); expect(reply.statusCode, reply.body).toBe(200) }
function messages(): unknown[] {
  return t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'message'").all()
}
function sessions(): unknown[] {
  return t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'session'").all()
}
function create(who: Agent, territory: string[], state = 'running', data: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/api/records', headers: who.headers,
    payload: { kind: 'session', title: 'A candidate territory run', data: { state, runtime: 'claude-code', ...aWorktreeOfItsOwn(home), territory, ...data } } })
}
function refusal(reply: { statusCode: number; body: string; json(): { error: string } }, others: [string, Agent, string][]) {
  expect(reply.statusCode, reply.body).toBe(409)
  const sentence = reply.json().error
  for (const [id, who, path] of others) for (const named of [id, who.id, path]) expect(sentence).toContain(named)
  expect(sentence).toContain(settingName)
  expect(sentence).toMatch(/at block/)
  expect(sentence).toMatch(/nothing was written\.$/i)
}

it('case 1: refuses a patch across starter chains without storing or sending anything', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(), path = 'tests/territory-block-patch'
  const earlier = run(first, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`]), later = run(second, 'running', ['tests/territory-block-patch-before'])
  await block()
  const before = t.api.getRecord(later), said = messages()
  const reply = await patch(later, { territory: [` ${path}/nested/ `], doing: 'A refused accompanying change.' }, second)
  refusal(reply, [[earlier, first, path]])
  expect(t.api.getRecord(later)).toEqual(before)
  expect(groups()).toEqual(groupsBefore)
  expect(messages()).toEqual(said)
})

it('case 2: refuses a new running session and leaves no session, group or message', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(), path = 'tests/territory-block-create'
  const earlier = run(first, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`])
  await block()
  const before = sessions(), said = messages()
  const reply = await create(second, [`${path}/nested`])
  refusal(reply, [[earlier, first, path]])
  expect(sessions()).toEqual(before)
  expect(groups()).toEqual(groupsBefore)
  expect(messages()).toEqual(said)
})

it('case 3: stores an overlap inside one starter chain without a group', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(first), path = 'tests/territory-block-chain'
  run(first, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`])
  await block()
  const later = run(second), reply = await patch(later, { territory: [`${path}/nested`] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(later)).toEqual([`${path}/nested`])
  expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [] })
  expect(groups()).toEqual(groupsBefore)
})

it('case 4: stores a disjoint territory', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(), path = 'tests/territory-block-disjoint'
  run(first, 'running', [`${path}/one`], [`${path}/one/a-file.ts`])
  await block()
  const later = run(second, 'running', undefined, [`${path}/two/a-file.ts`]), reply = await patch(later, { territory: [`${path}/two`] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(later)).toEqual([`${path}/two`])
  expect(groups()).toEqual(groupsBefore)
})

it('case 5: stores an overlap with a run that is not running', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(), path = 'tests/territory-block-ended'
  run(first, 'crashed', [`${path}/**`], [`${path}/nested/a-file.ts`])
  await block()
  const later = run(second), reply = await patch(later, { territory: [`${path}/nested`] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(later)).toEqual([`${path}/nested`])
  expect(groups()).toEqual(groupsBefore)
})

it('case 6: stores a session created not running despite its overlapping territory', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(), path = 'tests/territory-block-not-running'
  run(first, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`])
  await block()
  const reply = await create(second, [`${path}/nested`], 'crashed')
  expect(reply.statusCode, reply.body).toBe(201)
  expect(stored(reply.json().record.id)).toEqual([`${path}/nested`])
  expect(groups()).toEqual(groupsBefore)
})

it('case 7: permits an unchanged normalized territory after remind becomes block', async () => {
  const first = await agent(), second = await agent(), path = 'tests/territory-block-unchanged'
  run(first, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`])
  expect((await set('remind')).statusCode).toBe(200)
  const later = run(second)
  expect((await patch(later, { territory: [`${path}/nested`] }, second)).statusCode).toBe(200)
  const before = groups(), said = messages()
  await block()
  for (const data of [{ territory: [` ${path}/nested/ `] }, { doing: 'A write without a territory change.' }]) {
    const reply = await patch(later, data, second)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).not.toHaveProperty('territoryOverlaps')
  }
  expect(stored(later)).toEqual([`${path}/nested`])
  expect(groups()).toEqual(before)
  expect(messages()).toEqual(said)
})

it.each(['remind', 'off'])('case 8: keeps the existing response and groups at %s', async mode => {
  const first = await agent(), second = await agent(), path = `tests/territory-block-modes-${mode}`
  const earlier = run(first, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`])
  expect((await set(mode)).statusCode).toBe(200)
  const groupsBefore = groups()
  const later = run(second), reply = await patch(later, { territory: [`${path}/nested`] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(later)).toEqual([`${path}/nested`])
  if (mode === 'remind') {
    const added = groups().filter((one) => !groupsBefore.some((had) => had.id === one.id))
    expect(added).toHaveLength(1)
    expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [{ run: earlier, agent: first.id, paths: [`${path}/nested/a-file.ts`], group: added[0]!.id }] })
  } else {
    expect(groups()).toEqual(groupsBefore)
    expect(reply.json().territoryOverlaps).toEqual({ compared: true, overlaps: [{ run: earlier, agent: first.id, paths: [`${path}/nested/a-file.ts`], notOpened: 'No group was opened because MOLE_OFFICE_GATE_TERRITORIES is off.' }] })
  }
})

it('case 9: names every overlap in one refusal and keeps all prior data', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(), third = await agent(), path = 'tests/territory-block-two'
  const earlier = run(first, 'running', [`${path}/one/**`], [`${path}/one/nested/a-file.ts`])
  const also = run(second, 'running', [`${path}/two/**`], [`${path}/two/nested/a-file.ts`]), later = run(third)
  await block()
  const before = t.api.getRecord(later), said = messages()
  const reply = await patch(later, { territory: [`${path}/one/nested`, `${path}/two/nested`] }, third)
  refusal(reply, [[earlier, first, `${path}/one`], [also, second, `${path}/two`]])
  expect(t.api.getRecord(later)).toEqual(before)
  expect(groups()).toEqual(groupsBefore)
  expect(messages()).toEqual(said)
})

it('case 10: reads remind on the next write after block', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(), path = 'tests/territory-block-back'
  const earlier = run(first, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`]), later = run(second)
  await block()
  refusal(await patch(later, { territory: [`${path}/nested`] }, second), [[earlier, first, path]])
  expect((await set('remind')).statusCode).toBe(200)
  const reply = await patch(later, { territory: [`${path}/nested`] }, second)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(stored(later)).toEqual([`${path}/nested`])
  expect(groups()).toHaveLength(groupsBefore.length + 1)
})

it('stores another run of the same agent without a group', async () => {
  const groupsBefore = groups()
  const who = await agent(), path = 'tests/territory-block-same-agent'
  run(who, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`])
  await block()
  const reply = await create(who, [`${path}/nested`])
  expect(reply.statusCode, reply.body).toBe(201)
  expect(stored(reply.json().record.id)).toEqual([`${path}/nested`])
  expect(groups()).toEqual(groupsBefore)
})

it('reads the prospective running state and leaves a state-only start unexamined', async () => {
  const groupsBefore = groups()
  const first = await agent(), second = await agent(), path = 'tests/territory-block-state'
  const earlier = run(first, 'running', [`${path}/**`], [`${path}/nested/a-file.ts`, `${path}/another/a-file.ts`]), later = run(second, 'crashed')
  await block()
  const storedWhileStopped = await patch(later, { territory: [`${path}/nested`] }, second)
  expect(storedWhileStopped.statusCode, storedWhileStopped.body).toBe(200)
  const started = await patch(later, { state: 'running' }, second)
  expect(started.statusCode, started.body).toBe(200)
  expect(started.json()).not.toHaveProperty('territoryOverlaps')
  expect((await patch(later, { state: 'crashed' }, second)).statusCode).toBe(200)
  refusal(await patch(later, { state: 'running', territory: [`${path}/another`] }, second), [[earlier, first, path]])
  expect(t.api.getRecord(later)?.data['state']).toBe('crashed')
  expect(stored(later)).toEqual([`${path}/nested`])
  expect(groups()).toEqual(groupsBefore)
})

it('counts each overlap a refusal names as one would-stop and one stopped, and nothing for a check or a stored write', async () => {
  const counts = () => t.client.sqlite.prepare("SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped, COALESCE(SUM(reminded), 0) AS reminded FROM gate_counts WHERE gate = 'file-territories'").get() as { would_stop: number; stopped: number; reminded: number }
  const first = await agent(), second = await agent(), third = await agent(), path = 'tests/territory-block-counted'
  const earlier = run(first, 'running', [`${path}/one/**`], [`${path}/one/nested/a-file.ts`, `${path}/one/deeper/a-file.ts`])
  const also = run(second, 'running', [`${path}/two/**`], [`${path}/two/nested/a-file.ts`]), later = run(third)
  await block()
  const before = counts()
  refusal(await patch(later, { territory: [`${path}/one/nested`, `${path}/two/nested`] }, third), [[earlier, first, `${path}/one`], [also, second, `${path}/two`]])
  expect(counts()).toEqual({ would_stop: before.would_stop + 2, stopped: before.stopped + 2, reminded: before.reminded })
  refusal(await create(third, [`${path}/one/deeper`]), [[earlier, first, `${path}/one`]])
  expect(counts()).toEqual({ would_stop: before.would_stop + 3, stopped: before.stopped + 3, reminded: before.reminded })
  refusal(await app.inject({ method: 'POST', url: '/api/records/check', headers: third.headers,
    payload: { kind: 'session', title: 'A candidate territory run', data: { state: 'running', runtime: 'claude-code', territory: [`${path}/one/deeper`] } } }), [[earlier, first, `${path}/one`]])
  expect(counts(), 'a check stores nothing').toEqual({ would_stop: before.would_stop + 3, stopped: before.stopped + 3, reminded: before.reminded })
  const stored = await patch(later, { territory: [`${path}/three`] }, third)
  expect(stored.statusCode, stored.body).toBe(200)
  expect(counts()).toEqual({ would_stop: before.would_stop + 3, stopped: before.stopped + 3, reminded: before.reminded })
})
