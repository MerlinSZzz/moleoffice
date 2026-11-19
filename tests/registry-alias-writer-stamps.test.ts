// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT AN AGENT WROTE UNDER ITS OLD REGISTRY ID IS ITS OWN, WHERE IT ALONE ANSWERS TO THAT ID (item 30c, part 2b-4). A
 * changes row stamps its writer with the handle the request named or the registry id its key proved. A row written
 * before an alias was filed may hold the agent's old id, and it keeps those bytes. So the readers of an agent's writing
 * ask by its handle and its id, as before, and by each old id filed for it that no other agent answers to. The census
 * of the ledgers reads a stamp by the same rule. With no alias filed each statement is asked as before; with one filed
 * it is asked by the same plan. One request reads the filed aliases once for the stamps, however many runs or agents it
 * asks about.
 *
 * Every agent, alias and record here is made up, in a throwaway office. The stamps are put in place by a direct write,
 * because a write through the office stamps whoever made it.
 *
 * MUTATIONS, after a control run: keep every old id without asking which agents answer to it, and the first and third
 * cases go red. Ask by the handle and the id alone in each reader, and the second to sixth cases, the statements and
 * the case of the filed aliases go red. Ask by them alone in the recent records only, and the second case, the
 * statements and the count on a profile go red. Work the stamps out again in wroteIt when they are given, and the
 * seventh case and the count go red. Read the filed aliases again for each agent, and the count goes red on the honour
 * board. Give the honour board and the inspector's reading each reader its own, and the count goes red on each.
 */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import { inventedRegistry, syntheticAlias } from './registry-alias-fixture.ts'
import type { RegisteredAgent } from '../src/server/lib/participants.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
// The fixture's live agent bears the handle that is also the retired agent's old id, so that string names two agents.
const live = { id: 'CanonicalB2', handle: syntheticAlias.aliasId }
const retired = { id: syntheticAlias.canonicalId, handle: 'current-cobalt' }
const liveOldId = 'old-id-of-the-live-agent'

async function fileTheOldIds(): Promise<void> {
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [syntheticAlias, { namespace: 'agent-registry', aliasId: liveOldId, canonicalId: live.id }])
}
async function theAgent(id: string): Promise<RegisteredAgent> {
  const { readParticipant } = await import('../src/server/lib/participants.ts')
  return readParticipant({ kind: 'agent', id }) as RegisteredAgent
}
/** A note the person writes, whose create row is then stamped as written by the agent under `stamp`. */
function aNoteStamped(stamp: string): string {
  const id = t.api.createRecord({ kind: 'note', workspaceId: 'default', title: `Made-up note stamped ${stamp}`, origin: 'fixture', data: {}, actor: person }).id
  t.client.sqlite.prepare("UPDATE changes SET actor_type = 'agent', actor_id = ? WHERE record_id = ? AND op = 'create'").run(stamp, id)
  return id
}
/** A run of the live agent, and the assembly row the office writes when a check of it is put together. */
function aRunAssembled(): { id: string; workspaceId: string } {
  const run = t.api.createRecord({ kind: 'session', workspaceId: 'default', title: 'Made-up run', origin: 'fixture', actor: person, data: { state: 'running', servingAgentId: live.id } })
  // The assembly row is made from an ordinary change, because the field holds what a working tree was read to say.
  t.api.patchRecord(run.id, { dataPatch: { doing: 'Made-up words.' } }, person)
  t.client.sqlite
    .prepare("UPDATE changes SET actor_type = 'agent', actor_id = 'mole-office/the-api-server', field = 'data.whatTheCheckWouldRead' WHERE record_id = ? AND op = 'update'")
    .run(run.id)
  return t.api.getRecord(run.id)!
}
/** The inspector's change to a record, stamped as made by `stamp`. */
function anInspectorsChange(recordId: string, stamp: string): void {
  t.api.patchRecord(recordId, { title: 'Made-up title the inspector wrote' }, person)
  t.client.sqlite.prepare("UPDATE changes SET actor_type = 'agent', actor_id = ? WHERE record_id = ? AND op <> 'create'").run(stamp, recordId)
}

/** The role cards on disk, read as the server reads them at its start, for the inspector's reading of a run. */
async function theCardsAsTheServerReadsThem(): Promise<void> {
  const { readTheRoleCards, forgetTheRoleCards } = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  forgetTheRoleCards()
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
}

const stamps = () => import('../src/server/lib/registry-aliases/stamps.ts')
const inspection = () => import('../src/server/lib/inspection.ts')

describe('the stamps of an agent with an old registry id', () => {
  it('are its handle and its id, then each old id that it alone answers to, as the census reads them', async () => {
    await fileTheOldIds()
    const { theStampsOf } = await stamps()
    expect(theStampsOf(t.client.sqlite, live.id, [live.handle, live.id])).toEqual([live.handle, live.id, liveOldId])
    // The retired agent's old id is the live agent's handle, so it is not the retired agent's stamp.
    expect(theStampsOf(t.client.sqlite, retired.id, [retired.handle, retired.id])).toEqual([retired.handle, retired.id])
    const theirs: Record<string, string> = { [liveOldId]: aNoteStamped(liveOldId), [syntheticAlias.aliasId]: aNoteStamped(syntheticAlias.aliasId) }
    const { takeIdentityCensus } = await import('../src/server/lib/registry-aliases/census.ts')
    const census = takeIdentityCensus(t.client.sqlite)
    const read = (stamp: string) => {
      const row = (t.client.sqlite.prepare("SELECT id FROM changes WHERE record_id = ? AND op = 'create'").get(theirs[stamp]) as { id: string }).id
      return { found: census.aliases.filter(one => one.row === row && one.path === 'actor_id').map(one => one.canonical), blocked: census.blocks.filter(one => one.row === row && one.path === 'actor_id').map(one => one.reason) }
    }
    expect(read(liveOldId)).toEqual({ found: [live.id], blocked: [] })
    expect(read(syntheticAlias.aliasId)).toEqual({ found: [], blocked: ['cannot-tell'] })
  })

  it("lists a record written under the old id among the agent's recent records", async () => {
    await fileTheOldIds()
    const old = aNoteStamped(liveOldId)
    const { recentlyWritten } = await import('../src/server/lib/agentmemory.ts')
    expect(recentlyWritten(live.id, live.handle, 'default', []).map(one => one.id)).toContain(old)
    expect(recentlyWritten(retired.id, retired.handle, 'default', []).map(one => one.id)).not.toContain(old)
  })

  it('says the agent wrote a record created under its old id, and not under another agent\'s handle', async () => {
    await fileTheOldIds()
    const old = aNoteStamped(liveOldId)
    const handles = aNoteStamped(live.handle)
    const { wroteIt } = await inspection()
    expect(wroteIt(await theAgent(live.id), old)).toBe(true)
    expect(wroteIt(await theAgent(retired.id), old)).toBe(false)
    expect(wroteIt(await theAgent(retired.id), handles)).toBe(false)
  })

  it("puts a record written under the old id in what the inspector reads the agent wrote", async () => {
    await fileTheOldIds()
    const old = aNoteStamped(liveOldId)
    const run = aRunAssembled()
    await theCardsAsTheServerReadsThem()
    expect((await inspection()).whatTheInspectorReads(run.id, run.workspaceId).wrote.map(one => one.id)).toContain(old)
  })

  it('counts a change the inspector made under its old id to a record the worker wrote under its old id', async () => {
    await fileTheOldIds()
    const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
    fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: 'old-id-of-the-inspector', canonicalId: retired.id }])
    const run = aRunAssembled()
    const old = aNoteStamped(liveOldId)
    anInspectorsChange(old, 'old-id-of-the-inspector')
    const { whatTheInspectorChanged } = await inspection()
    expect(whatTheInspectorChanged(await theAgent(live.id), await theAgent(retired.id), t.api.getRecord(run.id)!)).toEqual([old])
  })

  it('counts a record written under the old id in what the office measured of the agent', async () => {
    await fileTheOldIds()
    const { measureTheAgent } = await import('../src/server/lib/residents.ts')
    const before = measureTheAgent(await theAgent(live.id)).recordsWritten
    aNoteStamped(liveOldId)
    expect(measureTheAgent(await theAgent(live.id)).recordsWritten).toBe(before + 1)
  })

  it('asks by the stamps it is given, and works them out when it is not', async () => {
    await fileTheOldIds()
    const old = aNoteStamped(liveOldId)
    const { wroteIt } = await inspection()
    const agent = await theAgent(live.id)
    expect(wroteIt(agent, old, [live.handle, live.id])).toBe(false)
    expect(wroteIt(agent, old, [liveOldId])).toBe(true)
  })
})

describe('the statements', () => {
  /** Each statement prepared while `act` runs that `which` matches, with the plan SQLite makes for it. */
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
  // The stamp tests each reader asked before: by the handle and the id, or by the id and a handle only the agent bears.
  const BEFORE = /\((\w\.)?actor_id = \? OR (\w\.)?actor_id = \?\)|actor_id IN \(\?, \?\)/
  const byStamp = /actor_id = \? OR|actor_id IN \(/

  it('asks in the words it asked before with no alias filed, finds the same rows, and asks by the same plan with one filed', async () => {
    const asTheHandle = aNoteStamped(live.handle)
    const asTheId = aNoteStamped(live.id)
    const asAnUnfiledId = aNoteStamped(liveOldId)
    const run = aRunAssembled()
    await theCardsAsTheServerReadsThem()
    const lib = await inspection()
    const { recentlyWritten } = await import('../src/server/lib/agentmemory.ts')
    const { measureTheAgent } = await import('../src/server/lib/residents.ts')
    const agent = await theAgent(live.id)
    const inspector = await theAgent(retired.id)
    const readers = () => ({
      recent: recentlyWritten(live.id, live.handle, 'default', []).map(one => one.id).sort(),
      wrote: [asTheHandle, asTheId, asAnUnfiledId].filter(id => lib.wroteIt(agent, id)).sort(),
      read: lib.whatTheInspectorReads(run.id, run.workspaceId).wrote.map(one => one.id).sort(),
      changed: lib.whatTheInspectorChanged(agent, inspector, t.api.getRecord(run.id)!),
      measured: measureTheAgent(agent).recordsWritten,
    })
    const mine = [asTheHandle, asTheId].sort()
    expect(readers()).toEqual({ recent: mine, wrote: mine, read: mine, changed: [], measured: 2 })
    const before = planned(readers, byStamp)
    // The recent records, wroteIt, the reports of a run, what the agent wrote, the worker's and the inspector's sides,
    // and the measure.
    expect(before, before.map(one => one.text).join('\n')).toHaveLength(6)
    for (const one of before) expect(one.text).toMatch(BEFORE)
    await fileTheOldIds()
    const after = planned(readers, byStamp)
    expect(after).toHaveLength(before.length)
    for (const [i, one] of after.entries()) {
      // The inspector here has no old id of its own, so only the worker's side of that statement changes.
      expect(one.text, one.text).toMatch(/actor_id IN \(\?, \?, \?\)/)
      expect(one.plan.filter(line => !/TEMP B-TREE/.test(line)), one.text).toEqual(before[i]!.plan.filter(line => !/TEMP B-TREE/.test(line)))
    }
    expect(readers().recent).toEqual([...mine, asAnUnfiledId].sort())
  })
})

describe('the filed aliases', () => {
  /** How many times the stamps read the filed aliases while `act` runs. Other readers' reads are not counted. */
  async function readsByTheStamps(act: () => unknown): Promise<number> {
    const sqlite = t.client.sqlite
    const prepare = sqlite.prepare.bind(sqlite)
    let reads = 0
    ;(sqlite as unknown as { prepare: (text: string) => unknown }).prepare = (text: string) => {
      if (/FROM registry_aliases a ORDER BY/.test(text) && /registry-aliases\/stamps\.ts/.test(new Error().stack ?? '')) reads += 1
      return prepare(text)
    }
    try { await act() } finally { delete (sqlite as unknown as { prepare?: unknown }).prepare }
    return reads
  }
  /** A report the person writes, whose create row is then stamped as written by the agent under `stamp`. It is made a
   * report by a direct write, so that it needs no body. */
  function aReportStamped(stamp: string): string {
    const id = aNoteStamped(stamp)
    t.client.sqlite.prepare("UPDATE records SET kind = 'report' WHERE id = ?").run(id)
    return id
  }
  /** A run of the agent `agentId` whose seal pins `recordId`, with a stored reading that puts it on the honour board. The
   * seal and the run's word for it are put in place by a direct write, because only the finish writer makes them. */
  function aSealedRunPinning(recordId: string, agentId: string): void {
    const run = t.api.createRecord({ kind: 'session', workspaceId: 'default', title: 'Made-up sealed run', origin: 'fixture', actor: person, data: { state: 'running', servingAgentId: agentId } })
    const content = {
      version: 1, run: run.id, execution: 'made-up-execution', attempt: 'made-up-attempt', area: [], sealedAt: '2026-10-29 10:00:00', kind: 'records', git: null,
      records: { workspace: 'default', baseline: null, through: 0, records: [{ id: recordId, before: null, after: { seq: 1, contentHash: 'made-up' } }] },
    }
    const template = t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(run.id) as Record<string, unknown>
    const seal = { ...template, id: `made-up-seal-of-${run.id}`, kind: 'sealed_tip', title: 'Made-up seal', data: JSON.stringify({ seal: { ...content, hash: createHash('sha256').update(JSON.stringify(content)).digest('hex') } }) }
    const columns = Object.keys(seal)
    t.client.sqlite.prepare(`INSERT INTO records (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`).run(...columns.map(column => (seal as Record<string, unknown>)[column]))
    const reading = { read_at: '2026-10-29 10:00:00', standing: 'exemplary', threshold: 2, signals: [], missing: [], cost: { records: 1, ms: 1 } }
    t.api.patchRecord(run.id, { dataPatch: { honour: reading } }, person)
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.sealedTip', ?) WHERE id = ?").run(seal.id, run.id)
  }

  it('are read once for the honour board, once for a profile and once for the inspector\'s reading, and not once for each run', async () => {
    // Each agent has an old id of its own here. With the retired agent's old id that is the live agent's handle filed
    // too, that handle names two agents, and the profile refuses where it asks which elevation the handle holds.
    const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
    const retiredOldId = 'old-id-of-the-retired-agent'
    fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: liveOldId, canonicalId: live.id }, { namespace: 'agent-registry', aliasId: retiredOldId, canonicalId: retired.id }])
    // The board's two runs are two agents' runs, so a reading of the aliases for each agent is counted.
    aSealedRunPinning(aReportStamped(liveOldId), live.id)
    aSealedRunPinning(aReportStamped(retiredOldId), retired.id)
    const { theHonourBoard } = await import('../src/server/lib/honour.ts')
    let board: { rows: { report: { foundBy: string } | null }[] } = { rows: [] }
    const reads = { board: await readsByTheStamps(() => { board = theHonourBoard({ workspaceId: 'default', standing: 'exemplary', offset: 0, limit: 25 }) }), profile: 0, inspector: 0 }
    // Each run's report is found through its seal, as written under its agent's old id.
    expect(board.rows.map(row => row.report?.foundBy)).toEqual(['seal-pinned', 'seal-pinned'])

    const { app } = await apiApp()
    await app.ready()
    try {
      const owner = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
      let answer = { statusCode: 0, body: '' }
      reads.profile = await readsByTheStamps(async () => { answer = await app.inject({ method: 'GET', url: `/api/participants/agent/${live.id}/profile`, headers: owner }) })
      expect(answer.statusCode, answer.body).toBe(200)
    } finally { await app.close() }

    const run = aRunAssembled()
    await theCardsAsTheServerReadsThem()
    const { whatTheInspectorReads } = await inspection()
    reads.inspector = await readsByTheStamps(() => whatTheInspectorReads(run.id, run.workspaceId))
    expect(reads).toEqual({ board: 1, profile: 1, inspector: 1 })
  })
})
