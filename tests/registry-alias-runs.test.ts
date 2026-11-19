// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN STORED UNDER AN AGENT'S OLD REGISTRY ID IS THAT AGENT'S RUN, for the readers of a run's agent that ask the
 * store by the agent's id (item 30c, part 2b-3). An old id is an alias filed for the agent's canonical id. A run's
 * record written before the alias was filed keeps the old id, and nothing rewrites it.
 *
 * Every agent, run and letter here is made up, in a throwaway office. The old bytes are put in place by a direct write,
 * because the office's own doors now write the canonical id.
 *
 * Each reader is asked about the canonical id, with a run stored under the old id:
 * - the checkpoint letters: whether the agent has an opted-in run, the starter's letter to an ended worker, the
 *   checkpoint page, and the letters found once for runs under both ids;
 * - a terminal's last conversation of the agent in a folder;
 * - the session door, which writes the canonical id for an old id it is given and leaves a stored old id alone, also
 *   when a change sends that old id back;
 * - the worker run a launcher files under the old id;
 * - the last sandbox run of an agent, who may confirm a worker's report, and which workers are to be started;
 * - the sessions of an agent, by `servingAgentId` and by `servingAgent`.
 *
 * The aliases are read in one statement. With no alias filed, each changed statement asks `= ?`, which is what it
 * asked before. With one filed, each is planned on the same index as with none and no plan scans the records. The
 * three statements of the checkpoint letters are planned on the index on a run's serving id, with one id and with two.
 *
 * MUTATIONS, after a control run: give any reader the asked id alone in place of `everyIdOf` (or the stored id in
 * place of `canonicalOf`), and its case goes red. Read the agent ids in a second statement, and the one-statement case
 * goes red. Write `IN (?)` for one id, and the plan case goes red. Rewrite a stored old id that a change sends back, and
 * the case that sends it back goes red. Find the first opted-in run of each stored id in place of each agent, and the
 * letter is found twice. Ask any of the three checkpoint statements for the kind with `theKindOfARowFoundById`, or
 * leave out its `INDEXED BY`, and the plan case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
let app: FastifyInstance
let serial = 0
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = (id: string, session?: string) => ({ ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, ...(session ? { 'x-mole-office-session': session } : {}) })
interface Agent { id: string; handle: string }

buildTheFirstOfficeInAHook()
beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterEach(async () => {
  t.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE released_at IS NULL').run('2000-01-01 00:00:00')
  await app?.close()
  t?.close()
})

async function post(url: string, payload: unknown, headers: Record<string, string> = person) {
  const reply = await app.inject({ method: 'POST', url, payload: payload as object, headers })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return reply.json()
}
async function registered(role = 'worker', starter?: string, runtime = 'codex'): Promise<Agent> {
  const handle = `made-up-alias-runs-${++serial}`
  return (await post('/api/agents/started', { handle, name: handle, role, runtime }, starter ? agent(starter) : person)).agent
}
/** The old id of an agent: an alias filed for its canonical id, which is no registry id. */
async function anOldIdFor(who: Agent): Promise<string> {
  const old = `old-id-of-${who.handle}`
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: old, canonicalId: who.id }])
  return old
}
function theRecordOf(who: Agent): string {
  return (t.client.sqlite.prepare('SELECT record_id FROM agent_records JOIN records ON records.id = agent_records.record_id WHERE agent_id = ? AND workspace_id = ?').get(who.id, 'default') as { record_id: string }).record_id
}
function run(who: Agent, more: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: 'Made-up run', actor: t.api.HUMAN, origin: 'fixture',
    data: { state: 'running', runtime: 'codex', servingAgentId: who.id, servingAgent: who.handle, ranAs: [{ workspaceId: 'default', agentId: theRecordOf(who) }], ...more },
  }).id
}
/** The old bytes: the run's `servingAgentId` holds the old id, and its handle is kept or taken out. */
function storedUnder(session: string, old: string, keepTheHandle = true): void {
  const write = keepTheHandle ? "json_set(data, '$.servingAgentId', ?)" : "json_remove(json_set(data, '$.servingAgentId', ?), '$.servingAgent')"
  t.client.sqlite.prepare(`UPDATE records SET data = ${write} WHERE id = ?`).run(old, session)
}
function data(id: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)
}
function setState(session: string, state: string): void {
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run(state, session)
}
async function ownProcess(session: string, pid = process.pid) {
  const { registerResource } = await import('../src/server/lib/resources.ts')
  return registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(pid), startedByTheProduct: true, actor: t.api.HUMAN })
}
/** A worker's finished run that `asker` asked for from a run that has ended, the worker registered by somebody else. */
async function aWorkersReportAskedBy(asker: Agent): Promise<string> {
  const registrar = await registered('secretary')
  const worker = await registered('worker', registrar.id)
  const asking = run(asker)
  const workerRun = run(worker)
  setState(asking, 'finished')
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...data(workerRun), state: 'finished', parentAttachment: asking }), workerRun)
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...data(asking), workerRuns: { [worker.id]: {
    state: 'started', askedAt: '2026-01-01 00:00:00', askedBy: { who: { kind: 'agent', id: asker.id }, session: asking }, handle: worker.handle,
    brief: { path: '/made/up/brief.md', sha256: 'a'.repeat(64), bytes: 1 }, sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up' },
    started: { at: '2026-01-01 00:00:01', run: workerRun, runKeyId: 'made-up-key' },
  } } }), asking)
  return workerRun
}
async function note(to: string, from: string): Promise<string> {
  return (await post('/api/records', { kind: 'message', title: 'Made-up letter', data: { to: [{ kind: 'agent', id: to }], body: 'Made-up words.' } }, agent(from))).record.id
}

describe('the letters of a checkpoint worker whose run is stored under its old id', () => {
  it('counts the run as the agent opting in', async () => {
    const worker = await registered('worker', (await registered('supervisor')).id)
    const other = await registered('worker')
    storedUnder(run(worker, { extra: { officeCheckpoint: true } }), await anOldIdFor(worker))
    const { hasCheckpointBoundary } = await import('../src/server/lib/worker-delivery/letters.ts')
    expect(hasCheckpointBoundary(worker.id, 'default')).toBe(true)
    expect(hasCheckpointBoundary(other.id, 'default')).toBe(false)
  })

  it('still takes the starter\'s letter to the worker after that run ended, with strict sending on', async () => {
    const { THE_MESSAGE_DOOR_SETTING } = await import('../src/server/lib/env.ts')
    const previous = process.env[THE_MESSAGE_DOOR_SETTING]
    process.env[THE_MESSAGE_DOOR_SETTING] = '1'
    try {
      const starter = await registered('supervisor')
      await ownProcess(run(starter), process.ppid)
      const worker = await registered('worker', starter.id)
      const session = run(worker, { extra: { officeCheckpoint: true } })
      storedUnder(session, await anOldIdFor(worker))
      setState(session, 'finished')
      // NOTHING HOLDS THE WORKER ONCE ITS RUN HAS ENDED, so the office stores the starter's letter, routes it and
      // answers 409. The letter is stored all the same, and its addressee is unchanged.
      const reply = await app.inject({ method: 'POST', url: '/api/records', headers: agent(starter.id),
        payload: { kind: 'message', title: 'Made-up letter', data: { to: [{ kind: 'agent', id: worker.id }], body: 'Made-up words.' } } })
      expect(reply.statusCode, reply.body).toBe(409)
      expect(data(reply.json().record.id).to).toEqual([{ kind: 'agent', id: worker.id }])
    } finally {
      if (previous === undefined) delete process.env[THE_MESSAGE_DOOR_SETTING]
      else process.env[THE_MESSAGE_DOOR_SETTING] = previous
    }
  })

  it('reads the checkpoint page of that run as the worker\'s', async () => {
    const starter = await registered('supervisor')
    const worker = await registered('worker', starter.id)
    const session = run(worker, { extra: { officeCheckpoint: true } })
    storedUnder(session, await anOldIdFor(worker))
    await ownProcess(session)
    const pending = await note(worker.id, starter.id)
    const page = await app.inject({ method: 'GET', url: '/api/messages?only=waiting-for-me&checkpoint=1&limit=1', headers: agent(worker.id, session) })
    expect(page.statusCode, page.body).toBe(200)
    expect(page.json().checkpoint).toMatchObject({ run: session, agent: worker.id })
    expect(page.json().checkpoint.supported).not.toBe(false)
    expect(page.json().messages.map((m: { id: string }) => m.id)).toEqual([pending])
  })

  it('finds a letter once when the agent has opted-in runs under both ids', async () => {
    const worker = await registered('worker', (await registered('supervisor')).id)
    const sender = await registered('supervisor')
    const underTheOldId = run(worker, { extra: { officeCheckpoint: true } })
    storedUnder(underTheOldId, await anOldIdFor(worker))
    run(worker, { extra: { officeCheckpoint: true } })
    // SINCE AGENT OWNERS ARE RECORDED, A LETTER TO A WORKER NOTHING HOLDS IS ROUTED WHEN IT IS WRITTEN AND WAITS, and the
    // sweep's retry of waiting routes reads it. The letter this reader finds is one written while the worker was held,
    // so the case holds a run.
    await ownProcess(underTheOldId)
    const letter = await note(worker.id, sender.id)
    const { newCheckpointLetters } = await import('../src/server/lib/worker-delivery/letters.ts')
    expect(newCheckpointLetters().filter(one => one.messageId === letter).map(one => one.to)).toEqual([{ kind: 'agent', id: worker.id }])
  })
})

describe('a terminal continuing the agent\'s conversation', () => {
  it('finds the conversation of a run stored under the old id', async () => {
    const who = await registered('worker', undefined, 'claude-code')
    const session = run(who, { runtime: 'claude-code', workingDirectory: '/made/up/folder', providerSession: 'made-up-conversation' })
    storedUnder(session, await anOldIdFor(who))
    const { theLastConversationOf } = await import('../src/server/lib/terminal-agents.ts')
    expect(theLastConversationOf(who.id, '/made/up/folder', 'claude-code')).toBe('made-up-conversation')
    expect(theLastConversationOf(who.id, '/made/up/other-folder', 'claude-code')).toBeNull()
  })
})

describe('the session door writes a run\'s agent by its canonical id', () => {
  it('stores the canonical id for an old id given on a create', async () => {
    const who = await registered('worker')
    const old = await anOldIdFor(who)
    const filed = await post('/api/records', { kind: 'session', title: 'Made-up run', data: { state: 'running', runtime: 'codex', servingAgentId: old } })
    expect(data(filed.record.id).servingAgentId).toBe(who.id)
  })

  it('stores the canonical id for an old id given on a change', async () => {
    const who = await registered('worker')
    const session = run(who)
    const old = await anOldIdFor(who)
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${session}`, headers: person, payload: { dataPatch: { servingAgentId: old } } })
    expect(reply.statusCode, reply.body).toBeLessThan(300)
    expect(data(session).servingAgentId).toBe(who.id)
  })

  it('leaves a stored old id as it is when another field changes', async () => {
    const who = await registered('worker')
    const session = run(who)
    const old = await anOldIdFor(who)
    storedUnder(session, old)
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${session}`, headers: person, payload: { dataPatch: { doing: 'Made-up work.' } } })
    expect(reply.statusCode, reply.body).toBeLessThan(300)
    expect(data(session)).toMatchObject({ servingAgentId: old, doing: 'Made-up work.' })
  })

  it('leaves a stored old id as it is when a change sends it back beside another field', async () => {
    const who = await registered('worker')
    const session = run(who)
    const old = await anOldIdFor(who)
    storedUnder(session, old)
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${session}`, headers: person, payload: { dataPatch: { servingAgentId: old, doing: 'Made-up work.' } } })
    expect(reply.statusCode, reply.body).toBeLessThan(300)
    expect(data(session)).toMatchObject({ servingAgentId: old, doing: 'Made-up work.' })
  })
})

describe('a worker run kept under the old id', () => {
  const entry = (asker: Agent, parent: string, launcher: string) => ({
    state: 'starting', askedAt: '2026-01-01 00:00:00', askedBy: { who: { kind: 'agent', id: asker.id }, session: parent }, handle: 'made-up-worker',
    brief: { path: '/made/up/brief.md', sha256: '0'.repeat(64), bytes: 1 }, sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up' },
    starting: { at: '2026-01-01 00:00:01', wrapper: launcher },
  })

  it.each(['the old id', 'the canonical id'])('is the one the office files under its parent, when the launcher names %s', async (named) => {
    const asker = await registered('supervisor')
    const worker = await registered('worker', asker.id)
    const old = await anOldIdFor(worker)
    const parent = run(asker)
    const launcher = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Made-up launcher', actor: t.api.HUMAN, origin: 'fixture', data: { state: 'running' } }).id
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...data(launcher), runtime: 'round-launcher', startedByMoleOffice: true,
      extra: { purpose: 'worker', run: parent, worker: named === 'the old id' ? old : worker.id } }), launcher)
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...data(parent), workerRuns: { [old]: entry(asker, parent, launcher) } }), parent)
    const { theAgentOfAnAskedWorkerRunUnder } = await import('../src/server/lib/records.ts')
    const office = { type: 'agent', id: 'mole-office', provedBy: 'the-office-key', sessionId: launcher } as never
    expect(theAgentOfAnAskedWorkerRunUnder(t.api.getRecord(parent)!, { servingAgentId: worker.id }, office)).toBe(worker.id)
    expect(theAgentOfAnAskedWorkerRunUnder(t.api.getRecord(parent)!, { servingAgentId: asker.id }, office)).toBeNull()
  })
})

describe('the readers of the next round, a report\'s confirmation and the workers to start', () => {
  it('finds the last sandbox run stored under the old id with no handle beside it', async () => {
    const who = await registered('worker')
    const session = run(who, { sandbox: { template: 'made-up', container: 'made-up' } })
    storedUnder(session, await anOldIdFor(who), false)
    const { theLastSandboxRunOf } = await import('../src/server/lib/next-round.ts')
    expect(theLastSandboxRunOf(who.id, who.handle, 'default')?.id).toBe(session)
  })

  it('keeps a worker\'s report the asker\'s to confirm while a run of the asker stored under the old id is running', async () => {
    const asker = await registered('supervisor')
    const workerRun = await aWorkersReportAskedBy(asker)
    const { whoMayConfirmThisReport } = await import('../src/server/lib/inspection.ts')
    expect(whoMayConfirmThisReport(t.api.getRecord(workerRun)!).rule).toBe('registrar-after-asker-ended')
    storedUnder(run(asker), await anOldIdFor(asker), false)
    expect(whoMayConfirmThisReport(t.api.getRecord(workerRun)!).rule).toBe('asker')
  })

  it('names a worker wanted under the old id by its canonical id, and not while its run stored under the old id runs', async () => {
    const asker = await registered('supervisor')
    const worker = await registered('worker', asker.id)
    const old = await anOldIdFor(worker)
    const parent = run(asker)
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...data(parent), workerRuns: { [old]: {
      state: 'wanted', askedAt: '2026-01-01 00:00:00', askedBy: { who: { kind: 'agent', id: asker.id }, session: parent }, handle: worker.handle,
      brief: { path: '/made/up/brief.md', sha256: '0'.repeat(64), bytes: 1 }, sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up' },
    } } }), parent)
    const { theWorkerRunsToStart } = await import('../src/server/lib/worker-runs.ts')
    expect(theWorkerRunsToStart('default')).toEqual([{ run: parent, agentId: worker.id, handle: worker.handle }])
    const going = run(worker)
    storedUnder(going, old, false)
    await ownProcess(going)
    expect(theWorkerRunsToStart('default')).toEqual([])
  })
})

describe('the sessions of an agent', () => {
  it('include a run that names the old id in servingAgentId or in servingAgent', async () => {
    const who = await registered('worker')
    const other = await registered('worker')
    const old = await anOldIdFor(who)
    const byId = run(who)
    storedUnder(byId, old, false)
    const byName = run(who)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(json_remove(data, '$.servingAgentId'), '$.servingAgent', ?) WHERE id = ?").run(old, byName)
    run(other)
    const { theSessionsOfTheAgent } = await import('../src/server/lib/session-origins.ts')
    expect(theSessionsOfTheAgent(who.id, who.handle).map(one => one.id).sort()).toEqual([byId, byName].sort())
  })
})

describe('the statements', () => {
  /** Each statement prepared while `act` runs, with the plan SQLite makes for it. */
  function planned(act: () => unknown, which: RegExp): { text: string; plan: string[] }[] {
    const sqlite = t.client.sqlite
    const prepare = sqlite.prepare.bind(sqlite)
    const seen: string[] = []
    ;(sqlite as unknown as { prepare: (text: string) => unknown }).prepare = (text: string) => {
      if (which.test(text)) seen.push(text)
      return prepare(text)
    }
    try { act() } finally { delete (sqlite as unknown as { prepare?: unknown }).prepare }
    return [...new Set(seen)].map(text => ({
      text,
      plan: (prepare(`EXPLAIN QUERY PLAN ${text}`).all(...Array((text.match(/\?/g) ?? []).length).fill('made-up')) as { detail: string }[]).map(row => row.detail),
    }))
  }

  it('reads the filed aliases in one statement', async () => {
    const who = await registered('worker')
    await anOldIdFor(who)
    const { readRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
    readRegistryAliases(t.client.sqlite)
    const read = planned(() => readRegistryAliases(t.client.sqlite), /^(?!\s*PRAGMA)/i)
    expect(read.map(one => one.text)).toHaveLength(1)
    expect(read[0]!.text).toContain('FROM registry_aliases')
  })

  it('asks the store by `= ?` with no alias filed, and by the same index with one filed', async () => {
    const starter = await registered('supervisor')
    const who = await registered('worker', starter.id, 'claude-code')
    const session = run(who, { runtime: 'claude-code', workingDirectory: '/made/up', providerSession: 'made-up', sandbox: { template: 'made-up' }, extra: { officeCheckpoint: true } })
    await ownProcess(session)
    const report = await aWorkersReportAskedBy(who)
    const letters = await import('../src/server/lib/worker-delivery/letters.ts')
    const { whoMayConfirmThisReport } = await import('../src/server/lib/inspection.ts')
    const { theLastConversationOf } = await import('../src/server/lib/terminal-agents.ts')
    const { theLastSandboxRunOf } = await import('../src/server/lib/next-round.ts')
    const { theSessionsOfTheAgent } = await import('../src/server/lib/session-origins.ts')
    const readers = (): void => {
      letters.hasCheckpointBoundary(who.id, 'default')
      letters.aStartersLetterToAnEndedWorker({ kind: 'agent', id: starter.id }, { kind: 'agent', id: who.id }, 'default')
      letters.checkpointPage(session, { kind: 'agent', id: who.id }, 'default', 1)
      theLastConversationOf(who.id, '/made/up', 'claude-code')
      theLastSandboxRunOf(who.id, who.handle, 'default')
      theSessionsOfTheAgent(who.id, who.handle)
      whoMayConfirmThisReport(t.api.getRecord(report)!)
    }
    const servingAgentId = /'\$\.servingAgentId'\)( END\))? (=|in) /i
    const before = planned(readers, servingAgentId)
    // Three for the checkpoint letters (whether the agent opted in, its latest run, its first run on its page), and one
    // for each other reader.
    expect(before, before.map(one => one.text).join('\n')).toHaveLength(7)
    for (const one of before) expect(one.text, one.text).not.toMatch(/'\$\.servingAgentId'\)( END\))? in /i)
    await anOldIdFor(who)
    const after = planned(readers, servingAgentId)
    expect(after).toHaveLength(before.length)
    for (const [i, one] of after.entries()) {
      expect(one.text, one.text).toMatch(/'\$\.servingAgentId'\)( END\))? in \(\?, \?\)/i)
      expect(one.plan, one.text).toEqual(before[i]!.plan)
      expect(one.plan.join('\n'), one.text).not.toMatch(/SCAN (records|r)\b/)
    }
    // THE CHECKPOINT LETTERS FIND THE AGENT'S RUNS THROUGH THE INDEX ON THE SERVING ID, with one id and with two. A
    // search of every live record of the project is no scan, so the test above let it through.
    const theLetters = (plans: typeof before) => plans.filter(one => one.text.includes("'$.extra.officeCheckpoint'"))
    expect(theLetters(before), before.map(one => one.text).join('\n')).toHaveLength(3)
    for (const one of [...theLetters(before), ...theLetters(after)]) {
      expect(one.plan.join('\n'), one.text).toMatch(/USING INDEX records_session_serving_agent_id_idx \(<expr>=\? AND workspace_id=\? AND deleted_at=\?\)/)
    }
  })
})
