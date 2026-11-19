// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT KEEPS WHOM EACH STAMP AND ACTOR PAIR NAMES, OR REFUSES AND KEEPS NOTHING. Wave 13s round 160, item 30c
 * part 3.
 *
 * src/server/lib/registry-aliases/remint-write.ts reads whom each value at a stamp or an actor pair names before it
 * writes, through src/server/lib/registry-aliases/remint-stamps.ts, and reads it again after. Here a throwaway office
 * holds made-up agents, legacy, retired, renamed and minted, one minted under the retired one's handle, and made-up
 * stamps in a session record, its revision, a change row, api_calls, agents and held_keys: values that name one agent,
 * no agent, the office's own writer, and two agents. Cases:
 *   1. a re-mint that keeps whom each value names is written, though an agents row and a key's holder change: each
 *      position is read, with what it must name after the writes, and a person's call is not read;
 *   2. a value that named one agent and names another after the writes refuses the whole re-mint, by its position and
 *      its row, and nothing is kept;
 *   3. a value that named no agent and names the agent given that id after the writes refuses it, at each position that
 *      holds it: two stamps in a record, the same in a change row, and a plain column;
 *   4. a value that was the office's own writer and names an agent after the writes refuses it;
 *   5. a value that two agents answered to, and that one answers to after the writes, refuses it, and the agents row is
 *      named by its new id.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-keeps-whom-each-stamp-names.test.ts
 * After a green control, copy src/server/lib/registry-aliases/census.ts, historical-reader.ts, remint-stamps.ts and
 * remint-write.ts, then make one of these changes:
 *   1. in census.ts, put `undefined` in place of the arrow `(one) => stamps.push({ table, row, ...one })` in tellOf:
 *      nothing is read, and cases 1 to 5 go red;
 *   2. in historical-reader.ts, delete the `w.tell?.(` line in readAStamp: case 1 and case 3 go red;
 *   3. in historical-reader.ts, delete the `w.tell?.(` line in readField's actor pair: no case goes red. No value here is
 *      at an actor pair: the run's opener is a stamp, and the actor pairs the register keeps, ShortForm.by,
 *      ReportParts.by and ProvedHolder.id, are not in this fixture;
 *   4. in historical-reader.ts, delete the `tell?.(` line in aLedgerStampReader: case 1 and case 2 go red;
 *   5. in historical-reader.ts, delete the `tell?.(` line in aPlainIdReader: cases 1, 3, 4 and 5 go red;
 *   6. in historical-reader.ts, delete `, tell` from readChangeIdentities' call of readRecordIdentities: case 1 and
 *      case 3 go red;
 *   7. in remint-stamps.ts, delete the office's own writers' line from whomItNamesNow: case 1 goes red;
 *   8. in remint-stamps.ts, put `name.agents` in place of `name.agents.map((agent) => theNewIdOf(map, agent))`: cases 1
 *      and 5 go red;
 *   9. in remint-stamps.ts, put `at.row` in place of `theNewIdOf(map, at.row)`: cases 1 and 5 go red;
 *  10. in remint-write.ts, delete the line that throws when a stamp names anyone else: cases 2 to 5 go red.
 * Restore each file with cp after each, check it with cmp, and run the command again for green. Deleting the line in
 * historical-reader.ts's readEither that passes on what the chosen form told turns no case red: in today's register no
 * stamp or actor pair lies under a value that fits more than one declared form, so no stored value can reach it.
 * Every id, name, key hash and row here is made up, in a throwaway office.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_OFFICE_WRITER_ID } from '../src/shared/participants.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
beforeEach(async () => {
  t = await freshDb()
  madeUpRegistry()
  madeUpStamps()
})
afterEach(() => t?.close())

const write = () => import('../src/server/lib/registry-aliases/remint-write.ts')
const stamps = () => import('../src/server/lib/registry-aliases/remint-stamps.ts')
const map = () => import('../src/server/lib/registry-aliases/remint-map.ts')
const db = () => t.client.sqlite

// A made-up registry: a legacy agent, a retired one, a renamed one, a minted one, and a minted one under the retired
// one's handle, so that handle and the retired agent's id are answered to by two agents.
const LEGACY_LIVE = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const RENAMED = { id: 'old-heron', handle: 'new-heron' }
const MINTED_LIVE = { id: 'MintedLive_1', handle: 'minted-live' }
const MINTED_WREN = { id: 'MintedWren_2', handle: LEGACY_RETIRED }
const NO_AGENT = 'made-up-visitor'
const WHEN = '2026-10-31 01:00:00'
const PROJECT = 'default'

function anAgent(id: string, handle: string, retired = false): void {
  db().prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, 'made-up-asset', '2026-01-01 00:00:00', retired ? 1 : 0)
}
function madeUpRegistry(): void {
  db().prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  anAgent(LEGACY_LIVE, LEGACY_LIVE)
  anAgent(LEGACY_RETIRED, LEGACY_RETIRED, true)
  anAgent(RENAMED.id, RENAMED.handle)
  anAgent(MINTED_LIVE.id, MINTED_LIVE.handle)
  anAgent(MINTED_WREN.id, MINTED_WREN.handle)
}

/** A run's data: the agent that opened it and the agent the office asked to check it, both stamps. */
const aRunsData = (openedBy: string, askedOf: string) => ({
  extra: { openedBy: { type: 'agent', id: openedBy, underTheGrant: 'MadeUpGrant' } },
  theCheck: { message: 'made-up-ask', askedOf, askedAt: WHEN, checkout: {}, says: 'A made-up check ask.' },
})
function aRun(id: string, data: object): void {
  db()
    .prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, 'session', 'A made-up run', ?, 'fixture')")
    .run(id, PROJECT, THE_TEST_OFFICES_OWNER.id, WHEN, WHEN, JSON.stringify(data))
}
function aRevision(id: string, record: string, data: object, actorId: string): void {
  db()
    .prepare("INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, data, op, actor_type, actor_id, at) VALUES (?, ?, ?, 1, ?, 'session', 'A made-up run', ?, 'create', 'agent', ?, ?)")
    .run(id, record, PROJECT, `made-up-hash-of-${id}`, JSON.stringify(data), actorId, WHEN)
}
function aChange(id: string, record: string, data: object, actorId: string): void {
  db()
    .prepare("INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES (?, ?, ?, 'update', 'agent', ?, 'data', NULL, ?, ?)")
    .run(id, record, PROJECT, actorId, JSON.stringify(data), WHEN)
}
function aCall(id: string, actorType: string, actorId: string): void {
  db().prepare("INSERT INTO api_calls (id, at_ms, ms, method, status, identity_source, actor_type, actor_id) VALUES (?, 0, 1, 'GET', 200, 'made-up', ?, ?)").run(id, actorType, actorId)
}

/** The made-up stamps every case starts from. Each names whom it names after a sound re-mint too. */
const THE_RUN = 'made-up-run'
function madeUpStamps(): void {
  // One agent: the renamed one by its id, the minted one by its handle, the legacy one by its id, and by its handle.
  const data = aRunsData(RENAMED.id, MINTED_LIVE.handle)
  aRun(THE_RUN, data)
  aRevision('made-up-revision', THE_RUN, data, LEGACY_LIVE)
  aChange('made-up-change', THE_RUN, data, RENAMED.handle)
  db()
    .prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, last_used_at, revoked_at, revoked_because, mint_proved_by) VALUES ('key-of-lark', 'agent', ?, 'made-up-hash', ?, ?, NULL, NULL, NULL)")
    .run(LEGACY_LIVE, WHEN, WHEN)
  // The office's own writer, a name no agent has, and a person's call under a legacy agent's name.
  aCall('call-of-the-office', 'agent', THE_OFFICE_WRITER_ID)
  aCall('call-of-nobody', 'agent', NO_AGENT)
  aCall('call-of-a-person', 'human', LEGACY_LIVE)
  // Two agents: the retired one by its id and its handle, and the minted one under that handle.
  db().prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?").run(LEGACY_RETIRED, RENAMED.id)
}

/** A generator that gives these ids in turn, and fails the test when it runs out. */
function theseIds(...ids: string[]): () => string {
  let next = 0
  return () => {
    const id = ids[next++]
    if (id === undefined) throw new Error('The made-up generator ran out of ids.')
    return id
  }
}
const NEW_IDS = ['NewIdOne_001', 'NewIdTwo_002', 'NewIdThree03', 'NewIdFour_04', 'NewIdFive_05', 'NewIdSix__06']

async function aMap() {
  const { planTheRemint } = await map()
  const plan = planTheRemint(db(), theseIds(...NEW_IDS))
  if (!('map' in plan)) throw new Error(plan.refused.join(' '))
  const newIdOf = new Map(plan.map.entries.map((entry) => [entry.oldId, entry.newId]))
  return { remint: plan.map, newIdOf: (id: string) => newIdOf.get(id)! }
}

type Row = Record<string, unknown>
const sorted = (rows: Row[]): Row[] => rows.map((row) => [JSON.stringify(row), row] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row)
const theTables = (): string[] =>
  (db().prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((one) => one.name)
/** Every row of every table, each table's rows in one order, so two readings can be compared. */
function everyRow(): Record<string, Row[]> {
  return Object.fromEntries(theTables().map((table) => [table, sorted(db().prepare(`SELECT * FROM "${table}"`).all() as Row[])]))
}

/** The re-mint, which must throw and keep nothing; the words it threw. */
async function theRefusal(): Promise<string> {
  const { writeTheRemint } = await write()
  const { remint } = await aMap()
  const before = everyRow()
  let thrown: unknown
  try {
    writeTheRemint(db(), remint)
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(Error)
  expect(db().inTransaction).toBe(false)
  expect(everyRow()).toEqual(before)
  return (thrown as Error).message
}

describe('the re-mint keeps whom each stamp and actor pair names', () => {
  it('is written when each value names whom it named, under the new ids, and reads each position', async () => {
    const { writeTheRemint } = await write()
    const { whomEachStampMustName } = await stamps()
    const { remint, newIdOf } = await aMap()
    const lark = newIdOf(LEGACY_LIVE)
    const heron = newIdOf(RENAMED.id)
    const theTwo = [newIdOf(LEGACY_RETIRED), MINTED_WREN.id].sort()
    // THE FIXTURE HAS WHAT THE CASE NEEDS: the legacy agents get new ids, and the minted ones keep theirs.
    for (const legacy of [LEGACY_LIVE, LEGACY_RETIRED, RENAMED.id]) expect(newIdOf(legacy), legacy).not.toBe(legacy)
    for (const minted of [MINTED_LIVE.id, MINTED_WREN.id]) expect(newIdOf(minted), minted).toBe(minted)

    // EACH POSITION IS READ, with what it must name after the writes. The agents row is named by its new id.
    const must = whomEachStampMustName(db(), remint).map(({ at, must }) => ({ ...at, must }))
    const one = (agent: string) => ({ agents: [agent] })
    const positions = [
      { table: 'records', row: THE_RUN, path: 'data.extra.openedBy.id', site: 'SessionOpenedBy.id', stored: RENAMED.id, must: one(heron) },
      { table: 'records', row: THE_RUN, path: 'data.theCheck.askedOf', site: 'TheCheckTheOfficeAskedFor.askedOf', stored: MINTED_LIVE.handle, must: one(MINTED_LIVE.id) },
      { table: 'revisions', row: 'made-up-revision', path: 'data.extra.openedBy.id', site: 'SessionOpenedBy.id', stored: RENAMED.id, must: one(heron) },
      { table: 'revisions', row: 'made-up-revision', path: 'actor_id', site: 'revisions.actor_id', stored: LEGACY_LIVE, must: one(lark) },
      { table: 'changes', row: 'made-up-change', path: 'new_value:data.extra.openedBy.id', site: 'SessionOpenedBy.id', stored: RENAMED.id, must: one(heron) },
      { table: 'changes', row: 'made-up-change', path: 'new_value:data.theCheck.askedOf', site: 'TheCheckTheOfficeAskedFor.askedOf', stored: MINTED_LIVE.handle, must: one(MINTED_LIVE.id) },
      { table: 'changes', row: 'made-up-change', path: 'actor_id', site: 'changes.actor_id', stored: RENAMED.handle, must: one(heron) },
      { table: 'held_keys', row: 'key-of-lark', path: 'whose_id', site: 'held_keys.whose_id', stored: LEGACY_LIVE, must: one(lark) },
      { table: 'api_calls', row: 'call-of-the-office', path: 'actor_id', site: 'api_calls.actor_id', stored: THE_OFFICE_WRITER_ID, must: { office: true } },
      { table: 'api_calls', row: 'call-of-nobody', path: 'actor_id', site: 'api_calls.actor_id', stored: NO_AGENT, must: { agents: [] } },
      { table: 'agents', row: heron, path: 'started_by_id', site: 'agents.started_by_id', stored: LEGACY_RETIRED, must: { agents: theTwo } },
    ]
    expect(must).toEqual(expect.arrayContaining(positions))
    expect(must.filter((one) => one.row === 'call-of-a-person')).toEqual([])

    const before = everyRow()
    const result = writeTheRemint(db(), remint)
    if (!('written' in result)) throw new Error(result.refused.join(' '))
    // THE STAMPS' BYTES ARE KEPT but the key's holder, which names the same agent by its new id.
    const after = everyRow()
    for (const table of ['records', 'revisions', 'changes', 'api_calls']) expect(after[table], table).toEqual(before[table])
    expect(db().prepare("SELECT whose_id FROM held_keys WHERE id = 'key-of-lark'").get()).toEqual({ whose_id: lark })
    expect(db().prepare('SELECT started_by_id FROM agents WHERE id = ?').get(heron)).toEqual({ started_by_id: LEGACY_RETIRED })
  })

  it('refuses a value that named one agent and names another after the writes, by its position and row', async () => {
    // A MADE-UP FAULT in this throwaway office: giving the legacy agent its new id also restamps its revision.
    db().exec(`CREATE TRIGGER a_made_up_fault AFTER UPDATE OF id ON agents WHEN OLD.id = '${LEGACY_LIVE}' BEGIN UPDATE revisions SET actor_id = '${MINTED_LIVE.handle}' WHERE id = 'made-up-revision'; END`)
    const said = await theRefusal()
    expect(said).toContain('revisions row "made-up-revision", actor_id (revisions.actor_id)')
    expect(said).toContain(`"${MINTED_LIVE.id}"`)
  })

  it('refuses a value that named no agent and names the agent given that id after the writes, at each position', async () => {
    const { newIdOf } = await aMap()
    const taken = NEW_IDS[0]!
    expect(newIdOf(LEGACY_LIVE)).toBe(taken)
    // The id the map gives the legacy agent is stored where no agent answered to it: no primary key holds it.
    const data = aRunsData(taken, taken)
    aRun('run-of-a-new-id', data)
    aChange('change-of-a-new-id', 'run-of-a-new-id', data, MINTED_LIVE.id)
    aCall('call-of-a-new-id', 'agent', taken)
    const said = await theRefusal()
    for (const position of [
      'records row "run-of-a-new-id", data.extra.openedBy.id (SessionOpenedBy.id)',
      'records row "run-of-a-new-id", data.theCheck.askedOf (TheCheckTheOfficeAskedFor.askedOf)',
      'changes row "change-of-a-new-id", new_value:data.extra.openedBy.id (SessionOpenedBy.id)',
      'changes row "change-of-a-new-id", new_value:data.theCheck.askedOf (TheCheckTheOfficeAskedFor.askedOf)',
      'api_calls row "call-of-a-new-id", actor_id (api_calls.actor_id)',
    ]) {
      expect(said).toContain(position)
    }
    expect(said).toContain('must name no agent')
  })

  it("refuses a value that was the office's own writer and names an agent after the writes", async () => {
    db().exec(`CREATE TRIGGER a_made_up_fault AFTER UPDATE OF id ON agents WHEN OLD.id = '${LEGACY_LIVE}' BEGIN UPDATE api_calls SET actor_id = '${MINTED_LIVE.handle}' WHERE id = 'call-of-the-office'; END`)
    const said = await theRefusal()
    expect(said).toContain('api_calls row "call-of-the-office", actor_id (api_calls.actor_id)')
    expect(said).toContain("must name one of the office's own writers")
  })

  it('refuses a value that two agents answered to and one answers to after the writes, naming the agents row by its new id', async () => {
    const { newIdOf } = await aMap()
    db().exec(`CREATE TRIGGER a_made_up_fault AFTER UPDATE OF id ON agents WHEN OLD.id = '${RENAMED.id}' BEGIN UPDATE agents SET started_by_id = '${MINTED_WREN.id}' WHERE id = NEW.id; END`)
    const said = await theRefusal()
    expect(said).toContain(`agents row "${newIdOf(RENAMED.id)}", started_by_id (agents.started_by_id)`)
    expect(said).toContain(`must name the agent "${[newIdOf(LEGACY_RETIRED), MINTED_WREN.id].sort().join('" or the agent "')}"`)
  })
})
