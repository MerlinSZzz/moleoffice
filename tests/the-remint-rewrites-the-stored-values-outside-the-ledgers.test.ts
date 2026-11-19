// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT REWRITES AN OLD ID IN THE STORED VALUES OUTSIDE THE LEDGERS, AND THE VERIFIER EXPECTS WHAT IT WROTE. Wave 13s
 * round 277, stage 1 of the minted ids.
 *
 * A stored value is a JSON column outside revisions and changes that the identity reader reads
 * (src/server/db/registry-aliases/open-shapes.ts, STORED_COLUMNS): a run's request, the office map, a folder reading's
 * pieces, a casting image, the source beside a casting cell, and three columns of agents. Here a throwaway office holds
 * made-up agents, legacy, retired, renamed and minted, and a stored value in each of those places that names the legacy
 * agent by its old id: as a stamp, as a participant, as a registry id, as a map's key, and inside a string, which is a
 * message's writer and a map's group key. Beside each are parts that name somebody else: the office's owner, a name no
 * agent has, the renamed agent's handle and the minted agent's id. In the agents table, the plain step rewrites the agent
 * that made the minted agent and the legacy agent's successor. A map is staged and applied with the real command,
 * `npm run db:migrate -- --remint <file>`, and the snapshot is a byte copy of the store just before. Cases:
 *   1. after the re-mint each of those values names the legacy agent by its new id, and every other part of it is as
 *      it was, the person's elevation too;
 *   2. no agent's id is its handle after the re-mint, and the command's line names each stored column it rewrote with
 *      the rows it rewrote there, and no column whose rows it kept;
 *   3. the verifier of tools/verify-the-remint.mjs passes all seven checks on that store: registry takes what the
 *      plain step and the stored step wrote in the agents table, and rows takes what the stored step wrote elsewhere;
 *   4. a group key that is not written as the map's writer writes it stops the re-mint by the pass's refusal, naming
 *      its column, and every row of the store is as it was;
 *   5. a restart grant and a notice turn of the legacy agent, whose rows the census names by the agent's id, hold its new
 *      id after, and the verifier passes all seven checks: registry-ids matches each row by its name after the re-mint;
 *   6. a reading place whose reader is the legacy agent or the renamed agent by its old id names the new id after, and
 *      a reader by a handle and the owner's are kept;
 *   7. the verifier passes all seven checks on that store: registry-ids and stamps match each reading place by its
 *      reader after the re-mint.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-rewrites-the-stored-values-outside-the-ledgers.test.ts
 * After a green control, copy src/server/db/remint-history.ts, src/server/db/remint-migration.ts,
 * src/server/db/remint-verification.ts, src/server/db/registry-aliases/remint-plain.ts and
 * src/server/db/registry-aliases/remint-stamps.ts, then make one of these changes:
 *   1. in remint-migration.ts, put `{}` in place of `rewriteTheStoredValues(sqlite, written.rule)`: no stored value is
 *      rewritten, and cases 1, 2, 3 and 4 go red, case 3 because rows expects what the stored step plans, and case 4
 *      because the refusal of a badly spelled group key is the stored step's own;
 *   2. in remint-history.ts, delete the entry of RunRequestMessage.writtenBy from THE_STRINGS_THE_PASS_REMAKES: a
 *      message's writer keeps the old id, and case 1 goes red;
 *   3. in remint-history.ts, delete the entry of ForestRegion.groupKey from THE_STRINGS_THE_PASS_REMAKES: a region's
 *      group key keeps the old id, and cases 1 and 4 go red, case 4 because its badly spelled group key is a region's,
 *      which the pass then keeps as typed instead of refusing;
 *   4. in remint-history.ts, put `true` in place of `JSON.stringify(parsed) === value` in the group key's entry: the
 *      group key is written again in the writer's spelling, and case 4 goes red;
 *   5. in remint-verification.ts, put `theRewriteOf(made.image, THE_REGISTRY)` in place of the rewrite registry passes
 *      to compareTheTable: registry fails, and case 3 goes red;
 *   6. in remint-verification.ts, leave the stored step's plan out of thePlansOf: rows and registry fail, and case 3
 *      goes red;
 *   7. in remint-migration.ts, delete the part of the line that names the stored columns: case 2 goes red;
 *   8. in remint-verification.ts, put `(table === THE_REGISTRY ? (newIdOf.get(row) ?? row) : row)` back as the row
 *      registry-ids compares a position at, which renames only a row of agents: case 5 goes red;
 *   9. in remint-plain.ts, leave reader_anchors.reader out of the plain sites: the reader keeps the old id, and case 6
 *      goes red;
 *  10. in remint-stamps.ts, let whomEachStampMustName rename only a row of agents, as before: the re-mint stops on the
 *      reading place in the hook cases 6 and 7 share, so neither passes and the file goes red;
 *  11. in remint-verification.ts, let the stamps check rename only a row of agents: case 7 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name, value and row here is made up, in a throwaway office. Each command is given only PATH, LANG, a made-up
 * home in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CastingCell, CastingImage, CastingStoredCell } from '../src/shared/casting.ts'
import type { FolderReadingPiece } from '../src/shared/folderreading.ts'
import type { ForestMapState } from '../src/shared/forest-map.ts'
import type { ARunRequest } from '../src/server/lib/agents.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const THE_VERIFIER = join(REPO, 'tools/verify-the-remint.mjs')
const NODE = realpathSync(process.execPath)
const CHECKS = ['map', 'registry', 'aliases', 'rows', 'stamps', 'registry-ids', 'integrity']

// A made-up registry: a legacy agent, a retired one, a renamed one and a minted one.
const LEGACY_LIVE = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const RENAMED = { id: 'old-heron', handle: 'new-heron' }
const MINTED_LIVE = { id: 'MintedLive_1', handle: 'minted-live' }
const NO_AGENT = 'made-up-visitor'
const OWNER = THE_TEST_OFFICES_OWNER.id
const WHEN = '2026-11-17 03:00:00'
const PROJECT = 'default'

let t: TestDb
/** The re-mint of the stored values: its folder, the snapshot, the store after, the map and what the command said. */
let stored: ARemint
/** The register's stored column of the agents table that holds a value of this type, read from the code so no site is copied. */
let agentsSiteOf: (type: string) => string
beforeAll(async () => {
  t = await freshDb()
  const { STORED_COLUMNS } = await import('../src/server/db/registry-aliases/open-shapes.ts')
  agentsSiteOf = (type) => {
    const sites = Object.entries(STORED_COLUMNS).filter(([site, column]) => site.startsWith('agents.') && column.reads === 'type' && column.type === type)
    expect(sites.map(([site]) => site), type).toHaveLength(1)
    return sites[0]![0]
  }
  aMadeUpRegistry(t.client.sqlite)
  // One migration with no map, so the store is as a migrated office leaves it, and the re-mint's run has nothing else to write.
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  stored = theRemint('stored', theStoredValues)
}, 240_000)
afterAll(() => t?.close())

const folder = () => dirname(t.file)

function aMadeUpRegistry(s: Database.Database): void {
  const anAgent = (id: string, handle: string, retired = false) =>
    s.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, 'made-up-asset', '2026-01-01 00:00:00', retired ? 1 : 0)
  s.prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  anAgent(LEGACY_LIVE, LEGACY_LIVE)
  anAgent(LEGACY_RETIRED, LEGACY_RETIRED, true)
  anAgent(RENAMED.id, RENAMED.handle)
  anAgent(MINTED_LIVE.id, MINTED_LIVE.handle)
}

// ---------------------------------------------------------------------------------------------------------------------
// The made-up stored values, each built from the id it names, so the value expected after is built from the new id
// ---------------------------------------------------------------------------------------------------------------------

const context = { target: { kind: 'record' as const, recordId: 'MadeUpRecord', workspaceId: PROJECT } }
/** A run's request: the agent it was sent to, the writer of its first message, and a second message the owner wrote. */
const aRequest = (actorId: string, writtenBy: string) =>
  ({
    workspaceId: PROJECT,
    workspaceTitle: 'A made-up project',
    actorId,
    agentId: 'MadeUpAgentRecord',
    thread: { id: 'MadeUpThread', title: 'A made-up thread', mode: 'review' },
    recipient: { kind: 'agent' as const, sessionRecordId: 'MadeUpAgentRecord', sessionTitle: 'A made-up agent', said: null, why: null },
    resume: { runtime: 'codex', externalId: 'made-up-conversation' },
    messages: [
      { id: 'MadeUpMessage1', intent: 'review', body: 'Made-up words', context, contextSaid: 'the record MadeUpRecord', contextState: 'there' as const, writtenAt: WHEN, writtenBy },
      {
        id: 'MadeUpMessage2', intent: 'ask', body: 'Made-up words', context: null, contextSaid: null, contextState: null,
        quotes: [{ number: 1, commentId: 'MadeUpComment1', context, contextSaid: 'the record MadeUpRecord', contextState: 'changed' as const }],
        writtenAt: WHEN, writtenBy: `human:${OWNER}`,
      },
    ],
    contextNote: 'A made-up note',
    assembledAt: WHEN,
    agentKeyId: 'MadeUpKey',
  }) satisfies ARunRequest

const point = { x: 0, y: 0 }
/** The group key the map's writer gives a team's region, from the project, the zone and the team. */
const aTeamsGroupKey = (team: string) => JSON.stringify([PROJECT, 'team', team])
/** The office map: a team region of `team`, `team` placed in it, and the minted agent placed with the secretary. */
const anOfficeMap = (team: string, groupKey = aTeamsGroupKey(team)) =>
  ({
    version: 1,
    seed: 'made-up-seed',
    grouping: 'shared',
    regions: [
      { id: 'secretary', groupKey: 'secretary', zone: 'secretary', workspaceId: null, teamId: null, origin: point, profile: 'hub', cells: [point], slots: [point], door: point },
      { id: 'MadeUpRegion', groupKey, zone: 'team', workspaceId: PROJECT, teamId: team, origin: point, profile: 'grove', cells: [point], slots: [point], door: point },
    ],
    assignments: {
      [team]: { regionId: 'MadeUpRegion', slot: 0, groupKey: aTeamsGroupKey(team), workspaceId: PROJECT, active: true },
      [MINTED_LIVE.id]: { regionId: 'secretary', slot: 0, groupKey: 'secretary', workspaceId: null, active: false },
    },
    roads: [[point, { x: 1, y: 0 }]],
  }) satisfies ForestMapState

/** A folder reading's pieces: a message `sender` sent, and one the minted agent sent. */
const thePieces = (sender: string) => {
  const piece = (id: string, by: string) =>
    ({
      id,
      kind: 'message',
      title: 'A made-up piece',
      summary: null,
      data: { body: 'Made-up words', sentBy: { kind: 'agent' as const, id: by } },
      from: ['notes.md'],
      quote: 'A made-up quote',
      state: 'proposed',
      recordId: null,
      decidedAt: null,
      decidedBy: null,
    }) satisfies FolderReadingPiece
  return [piece('MadeUpPiece1', sender), piece('MadeUpPiece2', MINTED_LIVE.id)]
}

/** The source beside a casting cell: who wrote it, of which kind. */
const aSource = (kind: string, id: string) => ({ at: WHEN, by: { kind, id }, decision: { id: 'MadeUpDecision', project: PROJECT }, moved: false, copied: false })
const aCell = (value: string | null, from: ReturnType<typeof aSource> | null) => ({ value, from })
const empty = aCell(null, null)
/** A casting image whose program `writer` wrote; the owner wrote its model, and its reason names the renamed agent by its handle. */
const anImage = (writer: string) =>
  ({
    program: aCell('codex', aSource('agent', writer)),
    model: aCell('made-up-model', aSource('human', OWNER)),
    effort: empty,
    difficulty: empty,
    quota: empty,
    cost: empty,
    labels: empty,
    probability: empty,
    out_until: empty,
    why: aCell('A made-up reason', aSource('agent', RENAMED.handle)),
    marked: true,
    native: { model: 'made-up-model', provider: null, variant: null },
    selectionRevision: 'made-up-revision',
    hold: { revision: 'made-up-revision', run: 'MadeUpRun', refusal: { kind: 'model' as const, code: 'made-up', said: 'Made-up words' }, at: WHEN },
  }) satisfies Record<CastingCell, CastingStoredCell> & Omit<CastingImage, 'cells'>

/** Who chose the minted agent's card, and who set it to read releases from the check. */
const theCardChosenBy = (by: string) => ({ how: 'a-starter', who: { kind: 'agent', id: by } })
const theReleasesReadBy = (by: string) => ({ on: true, by: { kind: 'agent', id: by }, at: WHEN, because: 'A made-up reason' })
/** The legacy agent's one elevation, which the office's owner granted. */
const THE_ELEVATION = [{ id: 'made-up-elevation', endsWhen: 'when you say', grantedAt: WHEN, grantedBy: OWNER }]

/** Each stored value in this office, by its table, a dot and its column, then the row: built from the id it names. */
function theValuesNaming(legacy: string): Record<string, Record<string, unknown>> {
  return {
    'agent_runs.request': { 'made-up-run': aRequest(legacy, `agent:${legacy}`), 'made-up-run-kept': aRequest(RENAMED.handle, `agent:${NO_AGENT}`) },
    'office_map_layouts.data': { 'made-up-configuration': anOfficeMap(legacy) },
    'folder_readings.pieces': { 'made-up-reading': thePieces(legacy) },
    'casting_row_changes.after': { 'made-up-change': anImage(legacy) },
    'casting_rows.program_from': { 'made-up-casting': aSource('agent', legacy) },
    [agentsSiteOf('WhoChoseTheCard')]: { [MINTED_LIVE.id]: theCardChosenBy(legacy) },
    [agentsSiteOf('ReadsReleasesFromTheCheck')]: { [MINTED_LIVE.id]: theReleasesReadBy(legacy) },
    [agentsSiteOf('Elevation[]')]: { [legacy]: THE_ELEVATION },
  }
}
/** The stored columns whose rows name the legacy agent by its old id, each with the rows the re-mint must rewrite there. */
const theRewritten = (): Record<string, number> => ({
  'agent_runs.request': 1,
  'office_map_layouts.data': 1,
  'folder_readings.pieces': 1,
  'casting_row_changes.after': 1,
  'casting_rows.program_from': 1,
  [agentsSiteOf('WhoChoseTheCard')]: 1,
  [agentsSiteOf('ReadsReleasesFromTheCheck')]: 1,
})

/** Each made-up row is found by a column of its own, because some of these tables have no id column. */
const WHERE: Record<string, string> = {
  agent_runs: 'id',
  office_map_layouts: 'configuration_key',
  folder_readings: 'id',
  casting_row_changes: 'note',
  casting_rows: 'authority',
  agents: 'id',
}

function theStoredValues(s: Database.Database): void {
  const at = (site: string) => site.split('.') as [string, string]
  const run = s.prepare('INSERT INTO agent_runs (id, thread_id, runtime, request, created_at) VALUES (?, ?, ?, ?, ?)')
  for (const [id, request] of Object.entries(theValuesNaming(LEGACY_LIVE)['agent_runs.request']!)) run.run(id, 'MadeUpThread', 'codex', JSON.stringify(request), WHEN)
  s.prepare('INSERT INTO office_map_layouts (configuration_key, data, updated_at) VALUES (?, ?, ?)').run('made-up-configuration', JSON.stringify(anOfficeMap(LEGACY_LIVE)), WHEN)
  s.prepare('INSERT INTO folder_readings (id, workspace_id, owner_id, folder, read_by, pieces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('made-up-reading', PROJECT, OWNER, '/srv/made-up', OWNER, JSON.stringify(thePieces(LEGACY_LIVE)), WHEN, WHEN)
  s.prepare("INSERT INTO casting_row_changes (casting_id, role, what, at, by_kind, by_id, decisions, note, before, after) VALUES (1, 'worker', 'change', ?, 'human', ?, '[]', 'made-up-change', NULL, ?)")
    .run(WHEN, OWNER, JSON.stringify(anImage(LEGACY_LIVE)))
  s.prepare("INSERT INTO casting_rows (role, project, program, program_from, changed_at, changed_by_kind, changed_by_id, authority) VALUES ('worker', 'made-up-project', 'codex', ?, ?, 'human', ?, 'made-up-casting')")
    .run(JSON.stringify(aSource('agent', LEGACY_LIVE)), WHEN, OWNER)
  for (const site of ['WhoChoseTheCard', 'ReadsReleasesFromTheCheck', 'Elevation[]'].map(agentsSiteOf)) {
    const [table, column] = at(site)
    for (const [row, value] of Object.entries(theValuesNaming(LEGACY_LIVE)[site]!)) {
      expect(s.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`).run(JSON.stringify(value), row).changes, site).toBe(1)
    }
  }
  // The plain step rewrites these two in the agents table: the agent that made the minted one, and the legacy agent's successor.
  s.prepare("UPDATE agents SET created_by_kind = 'agent', created_by_id = ? WHERE id = ?").run(LEGACY_LIVE, MINTED_LIVE.id)
  s.prepare('UPDATE agents SET successor_id = ? WHERE id = ?').run(RENAMED.id, LEGACY_LIVE)
}

// ---------------------------------------------------------------------------------------------------------------------
// The real command and the verifier
// ---------------------------------------------------------------------------------------------------------------------

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}
function ran(program: string, args: string[], cwd: string, database: string): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const it = spawnSync(program, args, { cwd, env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database }, encoding: 'utf8' })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stdout: it.stdout, stderr: it.stderr }
}
/** THE REAL COMMAND, `npm run db:migrate -- <args>`, on `database`. */
const theCommand = (database: string, ...args: string[]) => ran(process.execPath, ['--import', 'tsx', 'src/server/db/migrate.ts', ...args], REPO, database)

/** The journal, log and shared-memory files beside a database. */
const theFilesBeside = (file: string) => ['-journal', '-wal', '-shm'].filter((suffix) => existsSync(file + suffix))
/** Every row of every table in `file`, by its table, each row as its JSON, sorted, because a text index's tables have no rowid. */
function everyRow(file: string): Record<string, string[]> {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const tables = s.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all() as string[]
    return Object.fromEntries(tables.map((table) => [table, s.prepare(`SELECT * FROM "${table}"`).all().map((row) => JSON.stringify(row)).sort()]))
  } finally {
    s.close()
  }
}

interface ARemint {
  at: string
  snapshot: string
  after: string
  map: string
  applied: Ran
}
/**
 * A COPY OF THE MADE-UP OFFICE in a folder of its own, with `plant` run on it, a map staged from it, a byte copy of it as
 * the snapshot, and the real command's re-mint of it, whose exit is not judged here.
 */
function aStagedCopy(name: string, plant: (s: Database.Database) => void): ARemint {
  const at = join(folder(), name)
  mkdirSync(at)
  const [after, snapshot, map] = [join(at, 'office.db'), join(at, 'snapshot.db'), join(at, 'map.json')]
  t.client.sqlite.prepare('VACUUM INTO ?').run(after)
  const s = new Database(after)
  try {
    plant(s)
  } finally {
    s.close()
  }
  const staged = theCommand(after, '--stage-remint', map)
  expect(staged.status, staged.stderr).toBe(0)
  expect(theFilesBeside(after)).toEqual([])
  copyFileSync(after, snapshot)
  return { at, snapshot, after, map, applied: theCommand(after, '--remint', map) }
}
function theRemint(name: string, plant: (s: Database.Database) => void): ARemint {
  const it = aStagedCopy(name, plant)
  expect(it.applied.status, it.applied.stderr).toBe(0)
  expect(theFilesBeside(it.after)).toEqual([])
  return it
}

const COMMIT = 'a'.repeat(40)
const STATE = 'b'.repeat(64)
interface Verified extends Ran {
  result: string
}
/** THE VERIFIER in the target phase, run from an empty folder, with MOLE_OFFICE_DB naming a file in it. */
function verified(c: ARemint): Verified {
  const n = readdirSync(c.at).filter((name) => name.startsWith('request-')).length + 1
  const [request, result] = [join(c.at, `request-${String(n)}.json`), join(c.at, `result-${String(n)}.json`)]
  writeFileSync(request, JSON.stringify({ version: 1, phase: 'target', commit: COMMIT, repository: REPO, database: c.after, snapshot: c.snapshot, servicePort: 1, checks: CHECKS, stateSha256: STATE }))
  const empty = join(c.at, `empty-${String(n)}`)
  mkdirSync(empty)
  const it = ran(NODE, [THE_VERIFIER, '--within', '60000', '--map', c.map, request, result], empty, join(empty, 'office.db'))
  return { ...it, result }
}
const failedIn = (it: Verified) =>
  Object.entries((JSON.parse(readFileSync(it.result, 'utf8')) as { checks: Record<string, boolean> }).checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

/** The new id the staged map gives an old id. */
async function theNewIdsOf(c: ARemint): Promise<(oldId: string) => string> {
  const { readTheStagedRemint } = await import('../src/server/db/remint-migration.ts')
  const { entries } = readTheStagedRemint(c.map).map
  return (oldId) => {
    const newId = entries.find((entry) => entry.oldId === oldId)?.newId
    expect(newId, `the map gives ${oldId} a new id`).toBeDefined()
    expect(newId).not.toBe(oldId)
    return newId!
  }
}

/** Each stored value of this office as it is now in `file`, by its site and row, parsed. */
function theValuesIn(file: string, rowOf: (site: string, row: string) => string): Record<string, Record<string, unknown>> {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const out: Record<string, Record<string, unknown>> = {}
    for (const [site, rows] of Object.entries(theValuesNaming(LEGACY_LIVE))) {
      const [table, column] = site.split('.') as [string, string]
      out[site] = {}
      for (const row of Object.keys(rows)) {
        const text = s.prepare(`SELECT ${column} FROM ${table} WHERE ${WHERE[table]!} = ?`).pluck().get(rowOf(site, row)) as string | undefined
        expect(text, `${site} of the row ${row}`).toBeTypeOf('string')
        out[site][row] = JSON.parse(text!) as unknown
      }
    }
    return out
  } finally {
    s.close()
  }
}

describe('the re-mint rewrites the stored values outside the ledgers', () => {
  it("gives each stored value that names a legacy agent by its old id the agent's new id, and keeps every other part of it", async () => {
    const newIdOf = await theNewIdsOf(stored)
    const lark = newIdOf(LEGACY_LIVE)
    // THE FIXTURE HAS WHAT THE CASE NEEDS: before, each value is the one built from the old id.
    expect(theValuesIn(stored.snapshot, (_, row) => row)).toEqual(theValuesNaming(LEGACY_LIVE))
    // After, each is the one built from the new id. An agents row of the legacy agent is found by its new id.
    const after = theValuesIn(stored.after, (site, row) => (site.startsWith('agents.') ? (row === LEGACY_LIVE ? lark : row) : row))
    const expected = theValuesNaming(lark)
    expect(after).toEqual(Object.fromEntries(Object.entries(expected).map(([site, rows]) => [site, site === agentsSiteOf('Elevation[]') ? { [LEGACY_LIVE]: rows[lark] } : rows])))
    // The plain step's two in the agents table.
    const s = new Database(stored.after, { readonly: true, fileMustExist: true })
    try {
      expect(s.prepare('SELECT created_by_id FROM agents WHERE id = ?').pluck().get(MINTED_LIVE.id)).toBe(lark)
      expect(s.prepare('SELECT successor_id FROM agents WHERE id = ?').pluck().get(lark)).toBe(newIdOf(RENAMED.id))
    } finally {
      s.close()
    }
  })

  it("leaves no agent whose id is its handle, and names each stored column it rewrote, with its rows, in the command's line", async () => {
    const handles = (file: string) => {
      const s = new Database(file, { readonly: true, fileMustExist: true })
      try {
        return s.prepare('SELECT id FROM agents WHERE id = handle ORDER BY id').pluck().all() as string[]
      } finally {
        s.close()
      }
    }
    expect(handles(stored.snapshot)).toEqual(expect.arrayContaining([LEGACY_LIVE, LEGACY_RETIRED]))
    expect(handles(stored.after)).toEqual([])
    for (const [site, rows] of Object.entries(theRewritten())) expect(stored.applied.stdout, site).toContain(`${site} ${String(rows)}`)
    expect(stored.applied.stdout).not.toContain(agentsSiteOf('Elevation[]'))
  })

  it('passes all seven checks of the verifier, registry and rows taking what the stored step wrote', () => {
    const it = verified(stored)
    expect(it.status, it.stdout + it.stderr).toBe(0)
    expect(failedIn(it), it.stdout).toEqual([])
  }, 120_000)

  it("stops on a group key that is not written as the map's writer writes it, names its row, and writes nothing", async () => {
    const { A_PLACE_THE_PASS_CANNOT_REWRITE_STOPS_THE_PASS } = await import('../src/server/db/remint-history.ts')
    // The same map, with the region's group key written with a space after each comma.
    const spaced = JSON.stringify(JSON.parse(aTeamsGroupKey(LEGACY_LIVE)) as unknown[]).replaceAll(',', ', ')
    const c = aStagedCopy('a-group-key-spelled-otherwise', (s) =>
      s.prepare('INSERT INTO office_map_layouts (configuration_key, data, updated_at) VALUES (?, ?, ?)').run('made-up-configuration', JSON.stringify(anOfficeMap(LEGACY_LIVE, spaced)), WHEN),
    )
    expect(c.applied.status).toBe(1)
    expect(c.applied.stderr).toContain(A_PLACE_THE_PASS_CANNOT_REWRITE_STOPS_THE_PASS)
    expect(c.applied.stderr).toContain('office_map_layouts.data')
    expect(everyRow(c.after)).toEqual(everyRow(c.snapshot))
  }, 120_000)
})

// ---------------------------------------------------------------------------------------------------------------------
// A row the census names by a column the re-mint rewrites
// ---------------------------------------------------------------------------------------------------------------------

/** One column of each row of `table`, in rowid order, as it is in `file`. */
function theColumn(file: string, table: string, column: string): unknown[] {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return s.prepare(`SELECT ${column} FROM ${table} ORDER BY rowid`).pluck().all()
  } finally {
    s.close()
  }
}

/** A restart grant to the legacy agent and to the minted one, and a turn of a notice batch for each. */
function aGrantAndATurnOfEach(s: Database.Database): void {
  for (const agent of [LEGACY_LIVE, MINTED_LIVE.id]) {
    s.prepare('INSERT INTO office_restart_grants (agent_id, decision_id) VALUES (?, ?)').run(agent, 'MadeUpDecision')
    s.prepare("INSERT INTO notice_batch_turns (id, recipient_kind, recipient_id, delivery_ids, accepted_at) VALUES ('made-up-turn', 'agent', ?, '[]', NULL)").run(agent)
  }
}

describe('a restart grant and a notice turn, whose rows the census names by the agent they are for', () => {
  let grants: ARemint
  beforeAll(() => {
    grants = theRemint('grants', aGrantAndATurnOfEach)
  }, 240_000)

  it('passes all seven checks of the verifier, registry-ids matching each row by its rewritten name', async () => {
    const newIdOf = await theNewIdsOf(grants)
    // The plain step gives each row of the legacy agent its new id, and keeps the minted agent's.
    for (const [table, column] of [['office_restart_grants', 'agent_id'], ['notice_batch_turns', 'recipient_id']] as const) {
      expect(theColumn(grants.snapshot, table, column), table).toEqual([LEGACY_LIVE, MINTED_LIVE.id])
      expect(theColumn(grants.after, table, column), table).toEqual([newIdOf(LEGACY_LIVE), MINTED_LIVE.id])
    }
    const it = verified(grants)
    expect(failedIn(it), it.stdout).toEqual([])
    expect(it.status, it.stdout + it.stderr).toBe(0)
  }, 120_000)
})

/** The reading place of the legacy agent, of the renamed agent by its id and by its handle, and of the owner. */
const THE_READERS = (lark: string, heron: string) => [`agent:${lark}`, `agent:${heron}`, `agent:${RENAMED.handle}`, `human:${OWNER}`]
function anAnchorOfEach(s: Database.Database): void {
  for (const reader of THE_READERS(LEGACY_LIVE, RENAMED.id)) {
    s.prepare("INSERT INTO reader_anchors (workspace_id, reader, last_seen_at, last_change_id) VALUES ('default', ?, ?, NULL)").run(reader, WHEN)
  }
}

describe('a reading place, whose row the census names by its reader', () => {
  let anchors: ARemint
  beforeAll(() => {
    anchors = theRemint('anchors', anAnchorOfEach)
  }, 240_000)

  it("gives the reader that is a legacy agent's old id the agent's new id, and keeps every other reader", async () => {
    const newIdOf = await theNewIdsOf(anchors)
    expect(theColumn(anchors.snapshot, 'reader_anchors', 'reader')).toEqual(THE_READERS(LEGACY_LIVE, RENAMED.id))
    expect(theColumn(anchors.after, 'reader_anchors', 'reader')).toEqual(THE_READERS(newIdOf(LEGACY_LIVE), newIdOf(RENAMED.id)))
    expect(theColumn(anchors.after, 'reader_anchors', 'last_seen_at')).toEqual(THE_READERS('', '').map(() => WHEN))
  })

  it('passes all seven checks of the verifier, registry-ids and stamps matching each row by its rewritten reader', () => {
    const it = verified(anchors)
    expect(failedIn(it), it.stdout).toEqual([])
    expect(it.status, it.stdout + it.stderr).toBe(0)
  }, 120_000)
})
