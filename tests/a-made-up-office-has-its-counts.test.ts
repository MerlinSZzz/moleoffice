// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MADE-UP OFFICE HAS THE COUNTS IT IS BUILT TO, AND NOTHING REAL IN IT.
 *
 * Round 40 of wave 13y. A slow read is measured on a made-up office that tools/build-a-made-up-office.ts builds, at the
 * counts of the copy round 39 measured the queue on (`THE_COPY_OF_5_OCTOBER` in tests/the-office-at-the-live-scale.ts).
 * A number measured on it means something only while the build still makes those counts, so this file builds one in
 * twenty of them, `--one-in 20`, which takes a few seconds, and reads the file the tool made:
 *
 *   - the records of each kind, the agents, the agent records, the calls, the groups, the resources, the hourly and
 *     header-only calls, the runs left open, the runs that name their agent, the comments and the group messages are
 *     the scale's counts, exactly;
 *   - so are the agents holding the secretary card, none of them retired, and the tool says how many it made. Until
 *     round 43 of wave 13u a build made no secretary, so a read of the secretaries was measured reading no row;
 *   - no agent record is mapped to the office's own row, which the builder finds by its handle and leaves out;
 *   - the reads of a conversation leave one row for each conversation each reader read, `theReadPointsAt` the scale,
 *     since `conversation_reads` keeps only the newest read of each, in wave 13s round 64. Until
 *     then the table held one row for every read, and this line said the reads were the scale's count;
 *   - the largest message is the scale's largest. The average size is not checked here: at one in twenty the largest
 *     message alone is more than the scale's average over all of them, and the build only ever lengthens a message;
 *   - the records are stored in the order of their stamps, the tool's first step;
 *   - every agent's handle is a made-up one, the owner is `owner`, and every client address is loopback or missing.
 *
 * The third case holds which agents the build gives the secretary card: agents the person started, as the person
 * appoints a secretary, never the measured agent, whose numbers stay those of a worker, and none that is retired.
 *
 * The fourth case changes one of its agent records through the office's own write, on a copy of the file. A change
 * checks all of a record's data. The builder gave every agent record a made-up body, a field the agent kind refuses, so
 * the first change to one was refused, and a server started on a copy stopped when it wrote a schedule into one.
 *
 * The fifth case holds that the tool refuses a file that already exists, which keeps it out of an office somebody uses.
 *
 * Round 63 adds the 22 October scale at one in twenty. Every kind, sender, notice, delivery and withdrawal count is
 * exact after oneIn's rounding. The projects retain all eleven so the small office still exercises several views.
 * The sender median is exactly two, within the secretary's approximate live median; the busiest share is exact for the rounded
 * counts. The run tail is an invented distribution: its busiest agent must have over ten times the median's runs.
 *
 * Round 138 adds the 22 October scale at one in a hundred (problem X4qbDY6Qgumg). At that size the office has three agents
 * still working, and the build gave reads to six agents as the secretary counted them, so the reads of the fourth to the sixth
 * named no agent and the build stopped on the NOT NULL rule of `conversation_reads.reader_id`. The case holds that the
 * build ends with exit 0, that every read names the person or an agent the office holds, and that the reads leave
 * `theReadPointsAt` the scale's rows.
 *
 * The last case holds that the tool refuses a file inside this checkout when the folder it names begins with two dots,
 * such as "..data". Such a folder's path from the checkout begins with two dots too, and the tool took every path that
 * did as one leading out of the checkout, so the refusal never fired. The folder is never made: without the refusal the
 * tool stops at the missing folder instead, with other words, so neither side writes anything into the checkout.
 *
 * Round 14c adds the 13 November scale at one in twenty, the newest counted size of tests/the-office-at-the-live-scale.ts.
 * It is the 4 November office grown to that day's records; its records and links are checked against `oneIn` of it, and
 * the counts the tool prints only for 4 November are checked to be printed for this scale too.
 *
 * MUTATION: make the builder write one comment fewer, or one read point fewer, or give the secretary card to nobody, or
 * leave out the tool's reordering, and the first case is red. Let the builder leave out an id that is not the office's
 * row's, and the first case is red.
 * Let the builder give the secretary card to the measured agent, or to a retired agent, and the third case is red. Let
 * the builder give agent records the body again, and the fourth case is red. Let the tool write into a file that
 * exists, and the fifth case is red. Let the tool take every path from the checkout that begins with two dots as one
 * leading out of it, and the last case is red.
 * Send one fewer notice in the 22 October build, or put that build in one project, and the new case is red.
 * Let the builder give reads to a reader the office does not hold, as it did before round 138, and the one-in-a-hundred
 * case is red: the build stops. Let `theReadPointsAt` count such a reader's reads, and that case is red on the count.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { linksInAll, oneIn, THE_COPY_OF_5_OCTOBER, THE_LIVE_OFFICE_ON_22_OCTOBER, THE_LIVE_OFFICE_ON_13_NOVEMBER, theReadPointsAt } from './the-office-at-the-live-scale.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SCALE = oneIn(THE_COPY_OF_5_OCTOBER, 20)
/** The secretary card's name, from the declaration, which names it as the one card that may hold elevation. */
const THE_SECRETARY_CARD = (JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation.onlyThisCardCanHoldIt

let folder = ''
let built: SpawnSyncReturns<string>
let office: Database.Database

/** The environment with no office variable and no key, so nothing a child loads can reach an office. */
function noOffice(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const name of Object.keys(env)) {
    if (name.startsWith('MOLE_OFFICE_') || name.startsWith('VITEST') || name === 'MOLE_AGENT_KEY') delete env[name]
  }
  return env
}

/** The tool, run to its end. */
function theTool(...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['--import', 'tsx', 'tools/build-a-made-up-office.ts', ...args], { cwd: REPO, env: noOffice(), encoding: 'utf8', timeout: 180_000 })
}

/**
 * One agent record of a copy changed through `patchRecord`, as the broadcast schedule writes one: a key inside `extra`.
 * It prints what the record holds after the change, or the refusal.
 */
const CHANGE_ONE_AGENT_RECORD = `
const { sqlite } = await import('./src/server/db/client.ts')
const { patchRecord } = await import('./src/server/lib/records.ts')
const { THE_OFFICE } = await import('./src/server/lib/inspection.ts')
const id = sqlite.prepare("select id from records where kind = 'agent' order by id limit 1").get().id
try {
  patchRecord(id, { dataPatch: { extra: { aMadeUpChange: 'made up for a test' } } }, THE_OFFICE)
  console.log(JSON.stringify({ changed: JSON.parse(sqlite.prepare('select data from records where id = ?').get(id).data) }))
} catch (error) {
  console.log(JSON.stringify({ refused: String(error.message) }))
}
`

beforeAll(() => {
  folder = aTestDatabaseFolder('a-made-up-office')
  built = theTool('--one-in', '20', join(folder, 'office.db'))
  office = new Database(join(folder, 'office.db'), { readonly: true })
}, 240_000)

afterAll(() => {
  office.close()
  removeThisTestFolder(folder)
})

const count = (sql: string): number => (office.prepare(sql).get() as { n: number }).n

it('builds every count of the scale, exactly, with the records in the order of their stamps', () => {
  expect(built.status, built.stderr).toBe(0)
  const kinds = office.prepare(`select kind, count(*) as n from records group by kind`).all() as { kind: string; n: number }[]
  expect(Object.fromEntries(kinds.map((one) => [one.kind, one.n]))).toEqual(SCALE.records)
  expect({
    agents: count(`select count(*) as n from agents`),
    secretaries: (office.prepare(`select count(*) as n from agents where role = ? and retired = 0`).get(THE_SECRETARY_CARD) as { n: number }).n,
    agentRecords: count(`select count(*) as n from agent_records`),
    apiCalls: count(`select count(*) as n from api_calls`),
    groups: count(`select count(*) as n from groups`),
    conversationReads: count(`select count(*) as n from conversation_reads`),
    sessionResources: count(`select count(*) as n from session_resources`),
    liveResources: count(`select count(*) as n from session_resources where released_at is null`),
    hourlyCalls: count(`select count(*) as n from hourly_calls`),
    headerOnlyCalls: count(`select count(*) as n from header_only_calls`),
    openRuns: count(`select count(*) as n from records where kind = 'session' and json_extract(data, '$.closedAt') is null`),
    runsThatNameTheirAgent: count(`select count(*) as n from records where kind = 'session' and json_extract(data, '$.ranAs') is not null`),
    comments: count(`select count(*) as n from records where kind = 'message' and json_type(data, '$.target') is not null`),
    groupMessages: count(`select count(*) as n from records where kind = 'message' and json_type(data, '$.toGroup') is not null`),
    messageDataLargestBytes: count(`select max(length(data)) as n from records where kind = 'message'`),
  }).toEqual({
    agents: SCALE.agents,
    secretaries: SCALE.secretaries,
    agentRecords: SCALE.records['agent'],
    apiCalls: SCALE.apiCalls,
    groups: SCALE.groups,
    conversationReads: theReadPointsAt(SCALE),
    sessionResources: SCALE.sessionResources,
    liveResources: SCALE.liveResources,
    hourlyCalls: SCALE.hourlyCalls,
    headerOnlyCalls: SCALE.headerOnlyCalls,
    openRuns: SCALE.openRuns,
    runsThatNameTheirAgent: SCALE.runsThatNameTheirAgent,
    comments: SCALE.comments,
    groupMessages: SCALE.groupMessages,
    messageDataLargestBytes: SCALE.messageDataLargestBytes,
  })
  // THE OFFICE'S OWN ROW, found by its handle, has no agent record.
  expect(count(`select count(*) as n from agent_records where agent_id in (select id from agents where handle = 'mole-office')`)).toBe(0)
  // THE FIRST STEP: no record is stored after one with a later stamp.
  expect(count(`select count(*) as n from (select created_at, lag(created_at) over (order by rowid) as before from records) where before > created_at`)).toBe(0)
  // WHAT THE TOOL SAYS IT BUILT IS WHAT THE FILE HOLDS.
  const said = JSON.parse(built.stdout) as { oneIn: number; records: Record<string, number>; secretaries: number }
  expect(said.oneIn).toBe(20)
  expect(said.records).toEqual(SCALE.records)
  expect(said.secretaries).toBe(SCALE.secretaries)
}, 60_000)

it('names nobody: made-up handles, the owner `owner`, and no client address but loopback', () => {
  const handles = (office.prepare(`select handle from agents`).all() as { handle: string }[]).map((one) => one.handle)
  expect(handles.filter((one) => !/^made-up-agent-\d+$/.test(one)).sort()).toEqual(['mole-office', 'the-measured-agent'])
  expect(office.prepare(`select id, handle from people`).all()).toEqual([{ id: 'owner', handle: 'owner' }])
  const addresses = (office.prepare(`select distinct client_addr as at from api_calls`).all() as { at: string | null }[]).map((one) => one.at)
  expect(addresses.filter((one) => one !== null && !one.startsWith('127.'))).toEqual([])
}, 60_000)

it('gives the secretary card to agents the person started, never to the measured agent, and to none that is retired', () => {
  const holders = office.prepare(`select handle, retired, started_by_kind as starter from agents where role = ? order by id`).all(THE_SECRETARY_CARD) as { handle: string; retired: number; starter: string }[]
  expect(holders.length).toBe(SCALE.secretaries)
  expect(holders.filter((one) => one.retired !== 0 || one.starter !== 'person' || one.handle === 'the-measured-agent')).toEqual([])
}, 60_000)

it('makes agent records the agent kind takes, so a change to one is stored', () => {
  const copy = join(folder, 'a-copy-to-change.db')
  copyFileSync(join(folder, 'office.db'), copy)
  const env = { ...noOffice(), MOLE_OFFICE_DB: copy, MOLE_OFFICE_OWNER_ID: 'owner' }
  const ran = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', CHANGE_ONE_AGENT_RECORD], { cwd: REPO, env, encoding: 'utf8', timeout: 120_000 })
  expect(ran.status, ran.stderr).toBe(0)
  const said = JSON.parse(ran.stdout.trim().split('\n').at(-1)!) as { changed?: Record<string, unknown>; refused?: string }
  expect(said.refused).toBeUndefined()
  // THE FIRST AGENT RECORD IS THE FIRST AGENT ROW'S, the measured agent, which is still working.
  expect(said.changed).toEqual({ handle: 'the-measured-agent', state: 'active', extra: { aMadeUpChange: 'made up for a test' } })
}, 150_000)

it('refuses a file that already exists and leaves it as it was', () => {
  const there = join(folder, 'somebody-uses-this.db')
  writeFileSync(there, 'not a database of this test')
  const refused = theTool('--one-in', '20', there)
  expect(refused.status).not.toBe(0)
  expect(refused.stderr).toContain('already exists')
  expect(readFileSync(there, 'utf8')).toBe('not a database of this test')
}, 60_000)

it('refuses a file inside this checkout in a folder whose name begins with two dots', () => {
  const inside = join(REPO, '..a-folder-in-the-checkout', 'office.db')
  expect(existsSync(dirname(inside)), 'the folder must not exist, so no run of this case writes into the checkout').toBe(false)
  const refused = theTool('--one-in', '20', inside)
  expect(refused.status).not.toBe(0)
  expect(refused.stderr).toContain('is inside this checkout')
  expect(existsSync(dirname(inside))).toBe(false)
}, 60_000)

it('builds the 22 October counts and uneven history across eleven projects at one in twenty', () => {
  const scale = oneIn(THE_LIVE_OFFICE_ON_22_OCTOBER, 20)
  const file = join(folder, 'made-up-22-october.db')
  const built = theTool('--scale', '22-october', '--one-in', '20', file)
  expect(built.status, built.stderr).toBe(0)
  const db = new Database(file, { readonly: true })
  try {
    const n = (sql: string): number => (db.prepare(sql).get() as { n: number }).n
    const kinds = db.prepare(`select kind, count(*) as n from records group by kind`).all() as { kind: string; n: number }[]
    expect(Object.fromEntries(kinds.map(r => [r.kind, r.n]))).toEqual(scale.records)
    // Row counts are exact under oneIn; eleven projects retain the shape rather than dividing it away.
    expect(n(`select count(*) as n from workspaces where id <> 'message-centre'`)).toBe(11)
    for (const kind of ['session', 'flow_run', 'report', 'agent']) {
      expect((db.prepare(`select count(distinct workspace_id) as n from records where kind = ?`).get(kind) as { n: number }).n).toBe(Math.min(11, scale.records[kind]!))
    }
    expect(n(`select count(distinct json_extract(data, '$.writtenIn.project')) as n from records where kind = 'message'`)).toBe(11)
    const senders = db.prepare(`select json_extract(data, '$.sentBy.id') as id, count(*) as n from records where kind = 'message' group by json_extract(data, '$.sentBy.kind'), json_extract(data, '$.sentBy.id') order by n, id`).all() as { id: string; n: number }[]
    expect(senders.length).toBe(scale.messageSenders)
    const busiest = senders.at(-1)!
    expect(busiest.id).toBe((db.prepare(`select id from agents where handle = 'mole-office'`).get() as { id: string }).id)
    expect(busiest.n).toBe(scale.officeMessages)
    expect(busiest.n / scale.records.message!).toBe(scale.officeMessages! / scale.records.message!)
    // The live median is approximate; this stated guess holds it exactly at two, with no tolerance.
    expect((senders[Math.floor((senders.length - 1) / 2)]!.n + senders[Math.floor(senders.length / 2)]!.n) / 2).toBe(2)
    expect(n(`select count(*) as n from message_delivery`)).toBe(scale.messageDelivery)
    const secretary = (db.prepare(`select id from agents where role = ? order by id limit 1`).get(THE_SECRETARY_CARD) as { id: string }).id
    expect((db.prepare(`select count(*) as n from message_delivery where recipient_kind = 'agent' and recipient_id = ?`).get(secretary) as { n: number }).n).toBe(scale.secretaryDeliveries)
    expect(n(`select count(*) as n from records where kind = 'message' and deleted_at is not null`)).toBe(scale.withdrawnMessages)
    expect(n(`select count(*) as n from changes c join records r on r.id = c.record_id where c.op = 'delete' and r.kind = 'message' and r.deleted_at is not null`)).toBe(scale.withdrawnMessages)
    const runs = db.prepare(`select count(*) as n from records where kind = 'session' group by json_extract(data, '$.servingAgentId') order by n`).all() as { n: number }[]
    expect(runs.at(-1)!.n).toBeGreaterThan(10 * runs[Math.floor(runs.length / 2)]!.n)
    const said = JSON.parse(built.stdout)
    expect(said).toMatchObject({ scale: '22-october', oneIn: 20, projects: 11, senders: scale.messageSenders, officeMessages: scale.officeMessages,
      secretaryDeliveries: scale.secretaryDeliveries, withdrawnMessages: scale.withdrawnMessages })
    expect(said.rows.message_delivery).toBe(scale.messageDelivery)
  } finally {
    db.close()
  }
}, 240_000)

it('builds the 22 October scale at one in a hundred, and every read names a reader the office holds', () => {
  const scale = oneIn(THE_LIVE_OFFICE_ON_22_OCTOBER, 100)
  const file = join(folder, 'made-up-22-october-one-in-100.db')
  const built = theTool('--scale', '22-october', '--one-in', '100', file)
  expect(built.status, built.stderr).toBe(0)
  const db = new Database(file, { readonly: true })
  try {
    const n = (sql: string): number => (db.prepare(sql).get() as { n: number }).n
    expect(n(`select count(*) as n from conversation_reads where reader_id is null`)).toBe(0)
    expect(n(`select count(*) as n from conversation_reads where not (
      (reader_kind = 'person' and reader_id in (select id from people)) or (reader_kind = 'agent' and reader_id in (select id from agents)))`)).toBe(0)
    expect(n(`select count(*) as n from conversation_reads`)).toBe(theReadPointsAt(scale))
  } finally {
    db.close()
  }
}, 240_000)

it('builds the 13 November records and links at one in twenty, and prints the 4 November counts too', () => {
  const scale = oneIn(THE_LIVE_OFFICE_ON_13_NOVEMBER, 20)
  // THE SCALE COUNTS THE FOUR OLD KINDS IN `links` AND THE FOUR THE HORIZONS AND EDIT PAGES READ BESIDE IT. The old
  // kinds still reach `links`; the new ones are added after them, and `linksInAll` adds the five fields in one place.
  const file = join(folder, 'made-up-13-november.db')
  const built = theTool('--scale', '13-november', '--one-in', '20', file)
  expect(built.status, built.stderr).toBe(0)
  const db = new Database(file, { readonly: true })
  try {
    const n = (sql: string): number => (db.prepare(sql).get() as { n: number }).n
    const kinds = db.prepare(`select kind, count(*) as n from records group by kind`).all() as { kind: string; n: number }[]
    expect(Object.fromEntries(kinds.map((one) => [one.kind, one.n]))).toEqual(scale.records)
    expect(n(`select count(*) as n from links`)).toBe(linksInAll(scale))
    expect(n(`select count(*) as n from changes`)).toBe(scale.changes)
    expect(n(`select count(*) as n from agents where retired = 1`)).toBe(scale.retiredAgents)
    const said = JSON.parse(built.stdout)
    // THE TOOL PRINTS THE 4 NOVEMBER COUNTS FOR 13 NOVEMBER TOO, because that is the office it grew from.
    expect(said).toMatchObject({ scale: '13-november', oneIn: 20, records: scale.records, retiredAgents: scale.retiredAgents, changes: scale.changes })
    expect(said.rows.links).toBe(linksInAll(scale))
    for (const name of ['startedByAnAgent', 'startersOfTeams', 'recordsOfTheFirstProject', 'otherRecordsOfTheFirstProject']) {
      expect(said, `${name} is printed for 13 November`).toHaveProperty(name)
    }
  } finally {
    db.close()
  }
}, 240_000)
