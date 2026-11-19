// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO FINISH FAILS ON A RECORD ID, AND AN ID IS NEVER TAKEN FOR A KEY (problem __4iR4FkFAGS, wave 13w round 4).
 *
 * SINCE ROUND 10 THE MESSAGE DOOR REFUSES NOTHING FOR A KEY: it stores the message and reminds.
 * An id taken for a key is now a false reminder rather than a refusal, so each case below that said "stored" now also
 * says "with no reminder", and the case that said "refused" says "reminded".
 *
 * On 5 October 2026 tests/one-merge-tool-per-entry.test.ts went red at the write that finishes a run: 400
 * messageHoldsPasswordAfterP, the piece beginning "-pha", 12 characters long (message oA4sCtt5CeIZ). The write
 * that seals a run also writes the run-sealed notice to the run's starter, and the notice's body is "Run <run id>
 * sealed". It was written under the finishing agent's name, so the key door judged it as that agent's words. A record id
 * is 12 characters of letters, digits, - and _, so about 1 in 4,096 begins with -p, which is the shape of a password
 * glued to -p. The whole finish was refused.
 *
 * Two changes, and each has its own case here:
 *   · the notice is written as the office (src/server/lib/sealed-tip.ts), because every word of it is a fact the office
 *     read itself, and the office's own lines are not judged;
 *   · a piece that is an existing record's id is not a key (src/server/lib/message-keys.ts), because the office writes
 *     other lines naming a run under an agent's name, and an agent quoting such an id is not quoting a key.
 *
 * Since wave 13w's round 6b no new id begins with a dash (anOfficeId in src/server/lib/ids.ts, decision cvQAUoJTDYbB), so
 * an id beginning with -p is one made before then. Such ids are forced here by standing in for anOfficeId: while a
 * record is filed with `dashP` on, every id it makes begins with -p, and otherwise every id is anOfficeId's own. Every agent, run, file and record here is made up for the test, in a fresh test database.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · a run whose id begins with -p is finished by its own agent, the seal is stored and the starter is told.
 *     CONTROL on main before this change: refused with 400 messageHoldsPasswordAfterP.
 *     MUTATION: undo both changes. Red. Undoing only one leaves it green, because either change alone is enough.
 *   · the notice is written under the office's name, in the change log.
 *     MUTATION: write it with the finishing agent's actor again (sealed-tip.ts). Red.
 *   · an agent's message quoting an existing record id that begins with -p is stored, with a full stop after the id.
 *     MUTATION: call whereAMessageHoldsAKey without anExistingId (src/server/lib/message-keys.ts). Red.
 *   · the same shape that is no record's id is still reminded about as a password glued to -p.
 *   · an agent whose registry id begins with -p asks for a card, and the message naming it by that id is stored. Wave
 *     13n's round 40 saw by-id-boundary's seed refused so, on a piece beginning "-puh": an agent's id is not a record's.
 *     CONTROL before the agents table was asked: 400 messageHoldsPasswordAfterP.
 *     MUTATION: take `OR EXISTS (SELECT 1 FROM agents ...)` out of AN_ID_THAT_IS_NOT_A_KEY_SQL. Red.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const dashP = vi.hoisted(() => ({ on: false }))
vi.mock('../src/server/lib/ids.ts', async (original) => {
  const real = await original<typeof import('../src/server/lib/ids.ts')>()
  return {
    ...real,
    anOfficeId: () => (dashP.on ? '-p' + real.anOfficeId().slice(2) : real.anOfficeId()),
    anIdForAnAgent: () => (dashP.on ? '-p' + real.anIdForAnAgent().slice(2) : real.anIdForAnAgent()),
  }
})

let t: TestDb
let app: FastifyInstance
let root = ''
let tip = ''
const STARTER = 'pid-starter'
const WORKER = 'pid-worker'
const asThePerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
/** Made of id characters only, and put together here, so nothing in this file is a password. */
const aDashPId = (tail: string): string => '-p' + tail

function git(...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, HOME: root } }).trim()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: STARTER, name: 'Synthetic starter', role: 'supervisor', workArea: ['src'] } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(STARTER), payload: { handle: WORKER, name: 'Synthetic worker', role: 'worker', workArea: ['src'] } })
  expect(worker.statusCode, worker.body).toBe(201)

  mkdirSync('.logs', { recursive: true })
  root = mkdtempSync(join(process.cwd(), '.logs', 'dash-p-id-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic dash-p fixture')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  git('switch', '-q', '-c', 'worker')
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 2\n')
  git('commit', '-q', '-am', 'Synthetic work')
  tip = git('rev-parse', 'HEAD')
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (root !== '') rmSync(root, { recursive: true, force: true })
})

describe('a run whose id begins with -p', () => {
  let RUN = ''

  it('is finished by its own agent, its seal is stored, and its starter is told', async () => {
    dashP.on = true
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent(WORKER),
      payload: { kind: 'session', title: 'Test: a run with a dash-p id', data: { state: 'running', servingAgent: WORKER, workingDirectory: root, cutFrom: 'main', doing: 'Test: finishing' } },
    })
    dashP.on = false
    expect(filed.statusCode, filed.body).toBe(201)
    RUN = (filed.json() as { record: { id: string } }).record.id
    expect(RUN.startsWith('-p')).toBe(true)

    const finished = await app.inject({ method: 'PATCH', url: `/api/records/${RUN}`, headers: asAgent(WORKER), payload: { dataPatch: { state: 'finished', tip } } })
    expect(finished.statusCode, finished.body).toBe(200)
    const seal = t.api.getRecord(RUN)!.data['sealedTip']
    expect(typeof seal).toBe('string')

    const told = t.client.sqlite
      .prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = ?")
      .all(RUN, `Run ${RUN} sealed`) as { id: string }[]
    expect(told, 'the starter was not told of the seal').toHaveLength(1)
  })

  it('has its run-sealed notice written under the office\'s name', () => {
    const notice = t.client.sqlite
      .prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = ?")
      .get(RUN, `Run ${RUN} sealed`) as { id: string } | undefined
    expect(notice).toBeDefined()
    const wrote = t.client.sqlite.prepare("SELECT actor_type, actor_id FROM changes WHERE record_id = ? AND op = 'create'").get(notice!.id)
    expect(wrote).toEqual({ actor_type: 'agent', actor_id: 'mole-office/the-api-server' })
  })
})

describe('an agent message that quotes a record id beginning with -p', () => {
  // NOTHING HOLDS THE WORKER IN THE TEST OFFICE, so the office stores each message to it, routes it and answers 409
  // rather than 201. The message is stored all the same, and the answer still carries any key reminder.
  const send = (body: string) =>
    app.inject({ method: 'POST', url: '/api/records', headers: asAgent(STARTER), payload: { kind: 'message', title: 'Test: about a record', data: { body, to: [{ kind: 'agent', id: WORKER }] } } })

  it('is stored when the id is an existing record\'s, with a full stop after it', async () => {
    dashP.on = true
    const note = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(STARTER), payload: { kind: 'note', title: 'Test: a record with a dash-p id' } })
    dashP.on = false
    expect(note.statusCode, note.body).toBe(201)
    const id = (note.json() as { record: { id: string } }).record.id
    expect(id.startsWith('-p')).toBe(true)

    const sent = await send(`Test: please read ${id}.`)
    expect(sent.statusCode, sent.body).toBe(409)
    expect(sent.body, 'no reminder').not.toContain('keyReminder')
  })

  it('is still reminded about when no record has that id', async () => {
    const sent = await send(`Test: please read ${aDashPId('hNobodyHas')}.`)
    expect(sent.statusCode, sent.body).toBe(409)
    expect((sent.json() as { keyReminder?: { shape: string } }).keyReminder?.shape).toBe('passwordAfterP')
  })
})

describe('an agent whose registry id begins with -p', () => {
  it('may ask for a card, and the message that names it is stored', async () => {
    dashP.on = true
    const asker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(STARTER), payload: { handle: 'pid-asker', name: 'Synthetic asker', role: 'worker', workArea: ['src'] } })
    dashP.on = false
    expect(asker.statusCode, asker.body).toBe(201)
    const id = (asker.json() as { agent: { id: string } }).agent.id
    expect(id.startsWith('-p')).toBe(true)

    const asked = await app.inject({ method: 'POST', url: '/api/roles/requests', headers: asAgent('pid-asker'), payload: { asking: 'supervisor', because: 'Test: the work needs more than one worker.' } })
    expect(asked.statusCode, asked.body).toBe(201)
    expect(asked.body, 'no reminder').not.toContain('keyReminder')
  })
})
