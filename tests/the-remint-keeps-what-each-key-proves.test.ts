// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REQUEST DOOR PROVES EACH KIND OF KEY THE SAME AFTER A RE-MINT AS BEFORE IT, AS THE AGENT'S CANONICAL ID. Wave 13s
 * round 163, item 30c part 3.
 *
 * A throwaway office holds made-up legacy agents, whose ids are their handles, as the live office's agents were before
 * the re-mint: a supervisor started by a launcher agent, two workers it started, one renamed so its handle is not its
 * id, an agent opened in a terminal, and an agent whose round the office started. Each holds made-up keys: its own key,
 * a run key minted when its run was filed, a revoked run key, a terminal's key and the key a reopen gave it in its
 * place, and the key of a round the office's own key filed. Every request goes through the door the office serves. The
 * same requests are made once before planTheRemint and writeTheRemint re-mint the office, and once after. Cases:
 *   1. an agent's own key is taken under its handle, its old id or its new id, and the request door proves it as the
 *      new id; under another agent's name it is refused, before and after;
 *   2. a revoked key is refused at the door when it names a run; with no run named it proves nothing, and the write is
 *      kept as a claim with no key behind it, before and after alike;
 *   3. a run key holds the run it was minted for and no other, a supervisor's run key acts for the worker it started
 *      and is kept as the supervisor's canonical id, and a supervisor's own key still files a run and is given its key;
 *   4. a terminal's run opened again before the re-mint is still held by the key the reopen gave it, and the key that
 *      key replaced is still refused as replaced;
 *   5. a round the office's key filed before the re-mint is still the run its key proves its own, which the doors that
 *      ask for a run's own key read;
 *   6. the same round is still proved from the revisions once the parent's current data no longer names it, so the
 *      fallback case 5's fast path stands in front of is still exercised after the re-mint.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-keeps-what-each-key-proves.test.ts
 * After a green control, copy src/server/lib/keys.ts, then make one of these changes:
 *   1. in `theReopenBindingOf`, put `[moleOfficeId()]` in place of `theOfficesStamps()`: the reopen binding written
 *      before the re-mint is read as no one's, and case 4 goes red;
 *   2. in `theOwnRunThisRequestKeyProves`, put `[moleOfficeId()]` in place of `theOfficesStamps()`: case 5's fast path
 *      still proves the round from its parent's current data, so case 5 stays green; case 6, which clears that data
 *      and reads the office's start correlation from the revisions, goes red;
 *   3. in `heldKeyByHash`, delete ` AND revoked_at IS NULL`: the revoked key proves its holder, and case 2 goes red.
 * Copy src/server/lib/the-run-a-key-holds.ts, then:
 *   4. in `whatTheKeyMakesOfTheRunNamed`, delete the line that refuses a run key in a run it is not bound to: lark's
 *      run key is taken in its supervisor's run, and case 3 goes red.
 * Copy src/server/lib/http.ts, then:
 *   5. in `theKeyProvedTheNameTheHeadersGave`, put `return false` in place of its `sameAgent` question: a key sent
 *      under any name but its holder's id is refused, the renamed worker's handle before the re-mint and every legacy
 *      agent's handle after it, and cases 1, 3 and 4 go red.
 * Restore each copy, and the third run is green.
 *
 * Nothing here runs on a real database: the office is made in a temporary folder, and its keys are its own.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let scratch = ''
let workerModeBefore: string | undefined
const db = () => t.client.sqlite

const WORKSPACE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }
const AS_THE_PERSON = (): Record<string, string> => ({ ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() })
/** The office's own key, as its message worker sends it. */
const AS_THE_WORKER = (session?: string): Record<string, string> => asAgent('mole-office/the-message-worker', theOfficesKeyHeader()['x-mole-office-key'], session)
function asAgent(name: string, key?: string, session?: string): Record<string, string> {
  return {
    ...WORKSPACE,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': name,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}
async function ask(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown) {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, any> }
}

/** A legacy agent's row, its id the handle it was registered with, as the live office's rows were before the re-mint. */
function aLegacyAgent(id: string, handle: string, role: string, startedBy: { kind: string; id: string }): void {
  db().prepare("INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')").run(`avatar-default-agent-${id}`, '2026-09-01 10:00:00')
  db().prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at, runtime, role, started_by_kind, started_by_id) VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, `avatar-default-agent-${id}`, '2026-09-01 10:00:00', 'claude-code', role, startedBy.kind, startedBy.id)
}

/** A run filed at the records door for `serving`, with the key it was minted if one was. */
async function fileARun(serving: string, headers: Record<string, string>, extra: Record<string, unknown> = {}) {
  const filed = await ask('POST', '/api/records', headers, { kind: 'session', title: `A made-up run of ${serving}`, data: { state: 'running', runtime: 'claude-code', servingAgentId: serving, ...extra } })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return { id: String(filed.body['record'].id), runKey: (filed.body['runKey']?.key as string | undefined) ?? null }
}

/** A note written at the records door with these headers: the answer, and the writer the office kept for it. */
async function aNote(headers: Record<string, string>, title: string) {
  const r = await ask('POST', '/api/records', headers, { kind: 'note', title, data: { body: title } })
  if (r.status !== 201) return { status: r.status, said: String(r.body['error']) }
  const kept = db().prepare('SELECT actor_id AS actor, proved_by AS provedBy, proved_holder AS provedHolder, session_id AS session FROM revisions WHERE record_id = ? AND seq = 1').get(String(r.body['record'].id)) as Record<string, string | null>
  return { status: r.status, kept: { ...kept, provedHolder: kept['provedHolder'] === null ? null : JSON.parse(kept['provedHolder']!) } }
}

/** A request from `name` carrying `key` and naming `session`, as the doors that ask for a run's own key are given one. */
const aRequestCarrying = (name: string, key: string, session?: string) => ({ headers: asAgent(name, key, session) }) as unknown as FastifyRequest

const keys: Record<string, string> = {}
const runs: Record<string, string> = {}
const keyIds: Record<string, string> = {}
type Answers = Awaited<ReturnType<typeof theRequests>>
const before = {} as Answers
const after = {} as Answers
let newIdOf = new Map<string, string>()

/** The same requests, each time, of the office as it stands. `lark` and `heron` are the ids the two workers stand at. */
async function theRequests(when: string, lark: string, heron: string) {
  const keysModule = await import('../src/server/lib/keys.ts')
  const fresh = await ask('POST', '/api/records', asAgent('a-supervisor', keys.supervisor), { kind: 'session', title: `${when}: a made-up run of legacy-lark`, data: { state: 'running', runtime: 'claude-code', servingAgentId: 'legacy-lark' } })
  return {
    larkByHandle: await aNote(asAgent('legacy-lark', keys.lark), `${when}: lark's key, by its handle`),
    larkById: await aNote(asAgent(lark, keys.lark), `${when}: lark's key, by its id`),
    heronByHandle: await aNote(asAgent('new-heron', keys.heron), `${when}: heron's key, by its handle`),
    heronByOldId: await aNote(asAgent('old-heron', keys.heron), `${when}: heron's key, by its old id`),
    heronById: await aNote(asAgent(heron, keys.heron), `${when}: heron's key, by its id`),
    larksKeyAsHeron: await aNote(asAgent('new-heron', keys.lark), `${when}: lark's key, under heron's name`),
    larksKeyProves: keysModule.howThisRequestProvedItself(aRequestCarrying('legacy-lark', keys.lark!)),
    heronsKeyProves: keysModule.howThisRequestProvedItself(aRequestCarrying('new-heron', keys.heron!)),
    revokedInARun: await aNote(asAgent('legacy-lark', keys.revoked, runs.lark), `${when}: a revoked key, in a run`),
    revokedAlone: await aNote(asAgent('legacy-lark', keys.revoked), `${when}: a revoked key, in no run`),
    runKeyInItsRun: await aNote(asAgent('legacy-lark', keys.larksRun, runs.lark), `${when}: lark's run key, in its run`),
    runKeyInAnotherRun: await aNote(asAgent('legacy-lark', keys.larksRun, runs.supervisor), `${when}: lark's run key, in another run`),
    supervisorsRunKeyForLark: await aNote(asAgent('legacy-lark', keys.supervisorsRun, runs.lark), `${when}: the supervisor's run key, acting for lark`),
    supervisorsRunKeyInItsRun: await aNote(asAgent('a-supervisor', keys.supervisorsRun, runs.supervisor), `${when}: the supervisor's run key, in its run`),
    freshRun: { status: fresh.status, minted: typeof fresh.body['runKey']?.key === 'string' },
    reopenedKey: await aNote(asAgent('a-terminal-agent', keys.terminalReopened, runs.terminal), `${when}: the terminal's key from its reopen`),
    reopenedKeyIsBoundTo: keysModule.theRunThisRunKeyIsBoundTo(keyIds.terminalReopened!),
    replacedKey: await aNote(asAgent('a-terminal-agent', keys.terminalOpened, runs.terminal), `${when}: the terminal's key the reopen replaced`),
    roundsOwnRun: keysModule.theOwnRunThisRequestKeyProves(aRequestCarrying('a-round-agent', keys.round!, runs.round)),
  }
}

beforeAll(async () => {
  // THE NEXT-ROUND DOOR ASKS WHETHER THE OFFICE'S WORKER TAKES THE QUEUE. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-remint-keys-'))
  aLegacyAgent('the-launcher', 'the-launcher', 'supervisor', { kind: 'human', id: THE_PERSON })
  aLegacyAgent('a-supervisor', 'a-supervisor', 'supervisor', { kind: 'agent', id: 'the-launcher' })
  aLegacyAgent('legacy-lark', 'legacy-lark', 'worker', { kind: 'agent', id: 'a-supervisor' })
  aLegacyAgent('old-heron', 'new-heron', 'worker', { kind: 'agent', id: 'a-supervisor' })
  aLegacyAgent('a-terminal-agent', 'a-terminal-agent', 'worker', { kind: 'human', id: THE_PERSON })
  aLegacyAgent('a-round-agent', 'a-round-agent', 'supervisor', { kind: 'human', id: THE_PERSON })
  const { makeAnAgentKey, makeARunKey, revokeTheKeyNamed } = await import('../src/server/lib/keys.ts')
  keys.launcher = makeAnAgentKey('the-launcher', null)
  keys.supervisor = makeAnAgentKey('a-supervisor', null)
  keys.lark = makeAnAgentKey('legacy-lark', null)
  keys.heron = makeAnAgentKey('old-heron', null)
  const revoked = makeARunKey('legacy-lark', null)
  keys.revoked = revoked.key
  revokeTheKeyNamed(revoked.heldKeyId, 'A made-up key, revoked for this test')

  // THE SUPERVISOR'S RUN, FILED BY ITS STARTER'S OWN KEY, AND THE WORKER'S RUN, FILED BY THE SUPERVISOR'S RUN KEY.
  const supervisors = await fileARun('a-supervisor', asAgent('the-launcher', keys.launcher))
  runs.supervisor = supervisors.id
  keys.supervisorsRun = supervisors.runKey!
  const larks = await fileARun('legacy-lark', asAgent('a-supervisor', keys.supervisorsRun, runs.supervisor), { parentAttachment: runs.supervisor })
  runs.lark = larks.id
  keys.larksRun = larks.runKey!

  // A TERMINAL'S RUN, OPENED AND THEN OPENED AGAIN, by the writers the terminal doors use.
  const terminals = await import('../src/server/lib/terminal-agents.ts')
  const opened = terminals.fileATerminalsRunAndItsKey({
    agent: { id: 'a-terminal-agent', handle: 'a-terminal-agent' }, runtime: 'claude-code', folder: scratch, providerSession: null, workspaceId: 'default',
    actor: { type: 'human', id: THE_PERSON, sessionId: null, provedBy: 'the-person-key' } as never, title: 'A made-up terminal', doing: 'Works in a made-up terminal.', extra: {},
  })
  runs.terminal = opened.session
  keys.terminalOpened = opened.key!
  const openedId = (db().prepare("SELECT json_extract(data, '$.extra.runKeyId') AS id FROM records WHERE id = ?").get(opened.session) as { id: string }).id
  const proof = (db().prepare('SELECT mint_proved_by AS proof FROM held_keys WHERE id = ?').get(openedId) as { proof: string | null }).proof
  keys.terminalReopened = terminals.giveAReopenedRunANewKey(opened.session, 'a-terminal-agent', { id: openedId, proof } as never)!
  keyIds.terminalReopened = (db().prepare("SELECT json_extract(data, '$.extra.runKeyId') AS id FROM records WHERE id = ?").get(opened.session) as { id: string }).id
  expect(keyIds.terminalReopened).not.toBe(openedId)

  // A ROUND THE OFFICE STARTED: asked for by the person, started by a launcher run, and its run filed by the office's key.
  const folder = join(realpathSync(scratch), 'sandboxes', 'a-made-up-sandbox')
  mkdirSync(folder, { recursive: true })
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up brief\n\nDo the made-up next round.\n')
  const container = `row-${randomBytes(5).toString('hex')}`
  db().prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-12 10:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-a-made-up-sandbox', `Sandbox a-made-up-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  const sandbox = { template: 'mole-office-dev', container, folder }
  runs.last = t.api.createRecord({
    kind: 'session', title: 'A made-up round of a-round-agent', workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture',
    data: { state: 'running', servingAgentId: 'a-round-agent', runtime: 'claude-code', model: 'claude-made-up-round-0', workingDirectory: scratch, cutFrom: 'main', sandbox },
  }).id
  const asked = await ask('POST', '/api/agents/a-round-agent/next-round', AS_THE_PERSON(), { brief })
  expect(asked.status, JSON.stringify(asked.body)).toBe(202)
  const launcher = await ask('POST', '/api/records', AS_THE_WORKER(), {
    kind: 'session', title: 'A made-up launcher run',
    data: { state: 'running', runtime: 'round-launcher', doing: 'starting a made-up next round', workingDirectory: scratch, startedByMoleOffice: true, extra: { purpose: 'round', round: runs.last } },
  })
  expect(launcher.status, JSON.stringify(launcher.body)).toBe(201)
  const starting = await ask('POST', `/api/worker/rounds/${runs.last}/starting`, AS_THE_WORKER(), { wrapper: String(launcher.body['record'].id) })
  expect(starting.status, JSON.stringify(starting.body)).toBe(200)
  const round = await ask('POST', '/api/records', AS_THE_WORKER(String(launcher.body['record'].id)), {
    kind: 'session', title: 'A made-up next round of a-round-agent',
    data: { state: 'running', runtime: 'claude-code', model: 'claude-made-up-round-0', servingAgentId: 'a-round-agent', workingDirectory: scratch, cutFrom: 'main', parentAttachment: String(launcher.body['record'].id), sandbox },
    links: [{ type: 'derived_from', toId: runs.last }],
  })
  expect(round.status, JSON.stringify(round.body)).toBe(201)
  runs.round = String(round.body['record'].id)
  runs.launcher = String(launcher.body['record'].id)
  keys.round = String(round.body['runKey']?.key)

  Object.assign(before, await theRequests('Before', 'legacy-lark', 'old-heron'))

  // THE RE-MINT, AS THE MIGRATION RUNS IT: the map planned from the office, then written.
  const { planTheRemint } = await import('../src/server/lib/registry-aliases/remint-map.ts')
  const { writeTheRemint } = await import('../src/server/lib/registry-aliases/remint-write.ts')
  let next = 0
  const plan = planTheRemint(db(), () => `MadeUpId_${String(++next).padStart(3, '0')}`)
  if (!('map' in plan)) throw new Error(plan.refused.join(' '))
  const written = writeTheRemint(db(), plan.map)
  if (!('written' in written)) throw new Error(written.refused.join(' '))
  newIdOf = new Map(plan.map.entries.map((entry) => [entry.oldId, entry.newId]))
  ;(await import('../src/server/lib/keys.ts')).forgetTheKeysThisProcessRead()

  Object.assign(after, await theRequests('After', newIdOf.get('legacy-lark')!, newIdOf.get('old-heron')!))
}, 120_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

const THE_RULE = 'A write may name a run in x-mole-office-session only when the key it carries holds that run'

describe('the request door, before and after a re-mint of a made-up office', () => {
  it('1. takes an agent\'s own key under its handle, an old id or its new id, proves it as the new id, and refuses it under another name', () => {
    expect(newIdOf.get('legacy-lark')).toMatch(/^MadeUpId_/)
    for (const [when, answers, lark, heron] of [['before', before, 'legacy-lark', 'old-heron'], ['after', after, newIdOf.get('legacy-lark')!, newIdOf.get('old-heron')!]] as const) {
      for (const [name, one, actor] of [['handle', answers.larkByHandle, 'legacy-lark'], ['id', answers.larkById, lark], ['handle', answers.heronByHandle, 'new-heron'], ['old id', answers.heronByOldId, 'old-heron'], ['id', answers.heronById, heron]] as const) {
        expect(one, `${when}, by ${name}`).toEqual({ status: 201, kept: { actor, provedBy: 'an-agent-key', provedHolder: null, session: null } })
      }
      expect(answers.larksKeyProves, when).toEqual({ how: 'an-agent-key', whoseId: lark })
      expect(answers.heronsKeyProves, when).toEqual({ how: 'an-agent-key', whoseId: heron })
      expect(answers.larksKeyAsHeron.status, when).toBe(403)
    }
    expect(after.larksKeyAsHeron).toEqual(before.larksKeyAsHeron)
  })

  it('2. refuses a revoked key that names a run, and keeps a write with it and no run as a claim no key proved', () => {
    for (const [when, answers] of [['before', before], ['after', after]] as const) {
      expect(answers.revokedInARun, when).toEqual({ status: 403, said: expect.stringContaining(`x-mole-office-session names "${runs.lark}", and this key has been revoked. ${THE_RULE}`) })
      expect(answers.revokedAlone, when).toEqual({ status: 201, kept: { actor: 'legacy-lark', provedBy: null, provedHolder: null, session: null } })
    }
  })

  it('3. holds a run key to its own run, lets a supervisor\'s run key act for its worker as the supervisor\'s id, and mints a new run its key', () => {
    for (const [when, answers, supervisor] of [['before', before, 'a-supervisor'], ['after', after, newIdOf.get('a-supervisor')!]] as const) {
      expect(answers.runKeyInItsRun, when).toEqual({ status: 201, kept: { actor: 'legacy-lark', provedBy: 'an-agent-key', provedHolder: null, session: runs.lark } })
      expect(answers.runKeyInAnotherRun, when).toEqual({ status: 403, said: expect.stringContaining(`x-mole-office-session names "${runs.supervisor}", and this key is the run key of run ${runs.lark}, not of that run. ${THE_RULE}`) })
      expect(answers.supervisorsRunKeyForLark, when).toEqual({ status: 201, kept: { actor: 'legacy-lark', provedBy: 'an-agent-key', provedHolder: { id: supervisor, how: 'an-agent-key', claimed: 'legacy-lark' }, session: runs.lark } })
      expect(answers.supervisorsRunKeyInItsRun, when).toEqual({ status: 201, kept: { actor: 'a-supervisor', provedBy: 'an-agent-key', provedHolder: null, session: runs.supervisor } })
      expect(answers.freshRun, when).toEqual({ status: 201, minted: true })
    }
    expect(newIdOf.get('a-supervisor')).toMatch(/^MadeUpId_/)
  })

  it('4. holds a terminal\'s run reopened before the re-mint to the key the reopen gave it, and refuses the key it replaced as replaced', () => {
    for (const [when, answers] of [['before', before], ['after', after]] as const) {
      expect(answers.reopenedKey, when).toEqual({ status: 201, kept: { actor: 'a-terminal-agent', provedBy: 'an-agent-key', provedHolder: null, session: runs.terminal } })
      expect(answers.reopenedKeyIsBoundTo, when).toEqual({ run: runs.terminal, newest: true })
      expect(answers.replacedKey, when).toEqual({ status: 403, said: expect.stringContaining(`x-mole-office-session names "${runs.terminal}", and this key was the run key of that run until the run was opened again, when a new key replaced it. ${THE_RULE}`) })
    }
  })

  it('5. proves a round the office started before the re-mint as its key\'s own run after it', () => {
    expect(before.roundsOwnRun, 'before').toBe(runs.round)
    expect(after.roundsOwnRun, 'after').toBe(runs.round)
  })

  it('6. proves the round from the revisions when the parent data no longer names it', async () => {
    // CASE 5's FAST PATH reads the launcher's current `extra.round` and then the previous run's current `nextRound`.
    // Clear both, keeping the system revision they stand in front of: the proof must still answer, now from the
    // revisions, so the fallback is exercised after the re-mint too. The office's stamps are what the fallback reads,
    // which is why this case is the one the documented mutation 2 turns red.
    const keysModule = await import('../src/server/lib/keys.ts')
    for (const id of [runs.launcher, runs.last]) {
      const stored = db().prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
      const data = JSON.parse(stored.data) as Record<string, unknown>
      delete data['extra']
      delete data['nextRound']
      db().prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
    }
    expect(keysModule.theOwnRunThisRequestKeyProves(aRequestCarrying('a-round-agent', keys.round!, runs.round)), 'after the parent data was cleared').toBe(runs.round)
  })
})
