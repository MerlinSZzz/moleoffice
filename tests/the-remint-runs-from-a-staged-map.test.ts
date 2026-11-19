// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT RUNS FROM A MAP STAGED ONCE, LAST AND ALONE, AND WITHOUT A MAP DB:MIGRATE DOES WHAT IT DID. Wave 13s round
 * 158, item 30c part 3.
 *
 * `npm run db:migrate -- --stage-remint <file>` writes the map, and `npm run db:migrate -- --remint <file>` applies it
 * (src/server/db/remint-migration.ts, called from src/server/db/migrate.ts). Each case runs the real command as a process
 * of its own, on throwaway copies of one made-up office: two legacy agents, one of them retired, a renamed one, a minted
 * one, and a row naming a legacy agent and the minted one in each of the seven columns with a key to agents.id. The live
 * legacy agent wears the face drawn for its id. Cases:
 *   1. with no argument, the command migrates a store one migration behind exactly as migrateInPlace with no map
 *      migrates a copy of it, says the re-mint was given no map, and changes no agent's id;
 *   2. --stage-remint writes a new file only its owner can read, holding the applied migrations' digest, the agents
 *      table's fingerprint and the map, and writes nothing to the database; a second stage into that file is refused;
 *   3. --remint gives each legacy agent the id the staged map gives it, rewrites the keyed columns to it, renames its
 *      drawn face to the key of that id, files each old id as an alias, one generation row and one agent-id row of the
 *      kept lists, changes no other table, and says so;
 *   4. one staged file applied to two copies gives the same generation row and the same rows in every table;
 *   5. a second --remint with the same file writes nothing, and says the store had already applied it;
 *   6. an agent made, renamed or retired after the stage is refused, and nothing is written;
 *   7. a store that applied another map refuses this one, and nothing is written;
 *   8. a staged file whose migrations' digest is not the store's is refused, and nothing is written;
 *   9. on a store one migration behind, --remint is refused, the migration is not applied, and nothing is written;
 *  10. --stage-remint on a store one migration behind is refused, and no file is written;
 *  11. an unknown argument, a missing file name, one argument too many, and a staged file that is not there, is empty,
 *      is not JSON or is not a staged map each exit 1 before the database is opened;
 *  12. --remint on a database with no migration journal is refused before any table is made.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-runs-from-a-staged-map.test.ts
 * After a green control, copy src/server/db/migrate.ts and src/server/db/remint-migration.ts, then make one of these
 * changes:
 *   1. in migrate.ts, delete the line `if (flag === undefined) return { stage: null, apply: null }`: the command with no
 *      argument is refused, and case 1 goes red;
 *   2. in migrate.ts, put `null` in place of `staged` in `migrateInPlace(sqlite, MIGRATIONS_FOLDER, staged)`: no map is
 *      applied and a database with no journal is not refused, so cases 3 to 9 and 12 go red;
 *   3. in remint-migration.ts, put `(planTheRemint(sqlite) as { map: RemintMap }).map` in place of `staged.map` in the
 *      call of writeTheRemint: each run draws new ids of its own, and cases 3 and 4 go red;
 *   4. in remint-migration.ts, put `'w'` in place of `'wx'`: a stage overwrites the file, and case 2 goes red;
 *   5. in remint-migration.ts, delete the `if (generations.includes(staged.map.digest))` block: a second run is
 *      refused as another map, and case 5 goes red;
 *   6. in remint-migration.ts, delete the `if (theAgentsTablesFingerprint(sqlite) !== staged.agentsTable)` block: the
 *      changed agents table is not named, and case 6 goes red;
 *   7. in remint-migration.ts, delete the `if (applied.length > 0)` block: the run goes on past the migration, and case
 *      9 goes red;
 *   8. in remint-migration.ts, put `if (pending.length < 0)` in place of `if (pending.length > 0)`: a map is staged on
 *      a store with a migration pending, and case 10 goes red;
 *   9. in migrate.ts, delete `&& rest.length === 0`: an argument too many is ignored, and case 11 goes red;
 *  10. in migrate.ts, delete the `if (staged !== null && builtFromEmpty)` block: drizzle builds every table before the
 *      refusal, and case 12 goes red;
 *  11. in remint-migration.ts, delete the call that keeps the agent-id list: no kept row is written, and case 3 goes red;
 *  12. in remint-migration.ts, put `0` in place of `renameTheDrawnFaces(sqlite, faces.faces)`: the live legacy agent's
 *      face keeps the key drawn for its old id, and case 3 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name and row here is made up, in a throwaway office. The command is given only PATH, LANG, a made-up home
 * in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, oneMigrationBehind } from './an-office-one-migration-behind.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

let t: TestDb
beforeEach(async () => {
  t = await freshDb()
  await aMadeUpOffice(t.client.sqlite, MIGRATIONS)
})
afterEach(() => t?.close())

const remint = () => import('../src/server/db/remint-migration.ts')
const map = () => import('../src/server/lib/registry-aliases/remint-map.ts')
const migrate = () => import('../src/server/db/migrate.ts')
const folder = () => dirname(t.file)

// A made-up registry: two legacy agents, one of them retired, a renamed one, and a minted one.
const LEGACY_LIVE = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const RENAMED = { id: 'old-heron', handle: 'new-heron' }
const MINTED_LIVE = { id: 'MintedLive_1', handle: 'minted-live' }
const WHEN = '2026-10-30 10:00:00'

/** The seven columns with a foreign key to agents.id, each by its table and its column. */
const THE_SEVEN: readonly (readonly [string, string])[] = [
  ['agent_records', 'agent_id'],
  ['handle_holds', 'agent_id'],
  ['resident_read_grants', 'reader_id'],
  ['resident_read_grants', 'resident_id'],
  ['resident_sleeps', 'agent_id'],
  ['resident_space_writes', 'resident_id'],
  ['resident_void_marks', 'resident_id'],
]
/**
 * The tables a re-mint writes, but the kept lists, whose name the case reads from the code after the store is open.
 * Every other table keeps every row.
 */
const WRITTEN = new Set(['agents', 'assets', ...THE_SEVEN.map(([table]) => table), 'registry_aliases', 'registry_remint_generations'])

function anAgent(db: Database.Database, id: string, handle: string, retired = false, face = 'made-up-asset'): void {
  db.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, face, '2026-01-01 00:00:00', retired ? 1 : 0)
}

/** One row naming this agent in each of the seven columns. Every other agent such a row names is the minted one. */
function aRowInEachKeyedColumnFor(s: Database.Database, agent: string): void {
  const other = MINTED_LIVE.id
  s.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(`made-up-record-of-${agent}`, agent)
  s.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-hold-of-${agent}`, agent, 'made-up-session', 'made-up-machine', 'claude-code', WHEN, WHEN, WHEN)
  s.prepare('INSERT INTO resident_sleeps (id, agent_id, what, began_at, by_kind, by_id) VALUES (?, ?, ?, ?, ?, ?)').run(`made-up-sleep-of-${agent}`, agent, 'slept', WHEN, 'agent', other)
  s.prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-grant-to-${agent}`, other, agent, '2026-11-30', WHEN, 'agent', other)
  s.prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-grant-of-${agent}`, agent, other, '2026-11-30', WHEN, 'agent', other)
  s.prepare('INSERT INTO resident_void_marks (id, resident_id, path, because, marked_at, marked_by_kind, marked_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-mark-of-${agent}`, agent, `made-up-path-of-${agent}`, 'Made-up reason', WHEN, 'agent', other)
  s.prepare('INSERT INTO resident_space_writes (id, resident_id, path, bytes, sha256, written_at, written_by_kind, written_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-write-of-${agent}`, agent, 'made-up-path', 1, 'made-up-hash', WHEN, 'agent', other)
}

/**
 * THE MADE-UP REGISTRY AND ITS ROWS, then one migration with no map, so the store is as a migrated office leaves it and
 * a later run with nothing pending has nothing of its own to write.
 */
async function aMadeUpOffice(s: Database.Database, migrations: string): Promise<void> {
  const { AVATAR_ASSET_KIND, GENERATED_AVATAR_LICENCE, GENERATED_AVATAR_MIME, defaultAvatarAssetId } = await import('../src/shared/participants.ts')
  s.prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  // The face drawn for the live legacy agent, stored as the office stores a drawing.
  const drawn = defaultAvatarAssetId({ kind: 'agent', id: LEGACY_LIVE })
  s.prepare('INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, licence_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(drawn, AVATAR_ASSET_KIND, 'default', null, GENERATED_AVATAR_MIME, null, '2026-01-01 00:00:00', GENERATED_AVATAR_LICENCE)
  anAgent(s, LEGACY_LIVE, LEGACY_LIVE, false, drawn)
  anAgent(s, LEGACY_RETIRED, LEGACY_RETIRED, true)
  anAgent(s, RENAMED.id, RENAMED.handle)
  anAgent(s, MINTED_LIVE.id, MINTED_LIVE.handle)
  aRowInEachKeyedColumnFor(s, LEGACY_LIVE)
  aRowInEachKeyedColumnFor(s, MINTED_LIVE.id)
  ;(await migrate()).migrateInPlace(s, migrations)
}

/** A handle on a file, as the office opens one. */
function opened(file: string): Database.Database {
  const s = new Database(file)
  s.pragma('journal_mode = WAL')
  s.pragma('foreign_keys = ON')
  return s
}

/** A copy of the made-up office, in the test's own folder. */
function aCopy(name: string, of: Database.Database = t.client.sqlite): string {
  const file = join(folder(), `${name}.db`)
  of.prepare('VACUUM INTO ?').run(file)
  return file
}

/** The made-up office one migration behind: migrated with drizzle/ less its newest migration. */
async function anOfficeOneMigrationBehind(): Promise<string> {
  const file = join(folder(), 'one-behind.db')
  const s = opened(file)
  try {
    const older = oneMigrationBehind(folder())
    ;(await migrate()).migrateInPlace(s, older)
    await aMadeUpOffice(s, older)
  } finally {
    s.close()
  }
  return file
}

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}
/** THE REAL COMMAND, `npm run db:migrate -- <args>`, on `database`, with nothing of this machine's settings. */
function theCommand(database: string, ...args: string[]): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const ran = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/db/migrate.ts', ...args], {
    cwd: REPO,
    env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database },
    encoding: 'utf8',
  })
  if (ran.error !== undefined) throw ran.error
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr }
}

type Row = Record<string, unknown>
const sorted = (rows: Row[]): Row[] => rows.map((row) => [JSON.stringify(row), row] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row)
/** Every row of every table of `file`, each table's rows in one order, so two readings can be compared. */
function everyRow(file: string): Record<string, Row[]> {
  const s = new Database(file, { readonly: true })
  try {
    const tables = (s.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((one) => one.name)
    return Object.fromEntries(tables.map((table) => [table, sorted(s.prepare(`SELECT * FROM "${table}"`).all() as Row[])]))
  } finally {
    s.close()
  }
}
const without = (rows: Record<string, Row[]>, tables: ReadonlySet<string>) => Object.fromEntries(Object.entries(rows).filter(([table]) => !tables.has(table)))

interface Staged {
  schema: string
  agentsTable: string
  map: { digest: string; entries: { oldId: string; newId: string; handle: string; retired: boolean; from: 'minted' | 'legacy'; fingerprint: string }[] }
}
/** A map staged by the command, from a copy of the made-up office, in a file of its own. */
function aStagedMap(name = 'staged'): { file: string; staged: Staged } {
  const file = join(folder(), `${name}.json`)
  const ran = theCommand(aCopy(`${name}-from`), '--stage-remint', file)
  expect(ran.status, ran.stderr).toBe(0)
  return { file, staged: JSON.parse(readFileSync(file, 'utf8')) as Staged }
}
const legacyOf = (staged: Staged) => staged.map.entries.filter((entry) => entry.from === 'legacy')
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** Apply `file` to `database`, expect the refusal `words`, and expect every row to be as it was. */
function refusedAndUnwritten(database: string, file: string, words: string): void {
  const before = everyRow(database)
  const ran = theCommand(database, '--remint', file)
  expect(ran.stderr).toContain(words)
  expect(ran.status).toBe(1)
  expect(everyRow(database)).toEqual(before)
}

describe('npm run db:migrate with no argument', () => {
  it('migrates a store one migration behind as migrateInPlace with no map does, and the re-mint reads and writes nothing', async () => {
    const behind = await anOfficeOneMigrationBehind()
    const s = opened(behind)
    const [byTheCommand, byTheFunction] = [aCopy('by-the-command', s), aCopy('by-the-function', s)]
    s.close()
    const before = everyRow(byTheCommand)

    const ran = theCommand(byTheCommand)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain('re-mint: this run was given no staged map, so nothing was read or written')
    const copy = opened(byTheFunction)
    try {
      ;(await migrate()).migrateInPlace(copy, MIGRATIONS)
    } finally {
      copy.close()
    }

    const after = everyRow(byTheCommand)
    expect(after).toEqual(everyRow(byTheFunction))
    // The migration was applied, and the re-mint changed nothing: every agent keeps its id and every value it had, and no
    // alias or generation row was written. The migration may add columns to agents, as 0330 does, so each agent is read
    // in the columns it had before; what the migration put in a new column is held to migrateInPlace's above.
    expect(after['__drizzle_migrations']!.length).toBe(before['__drizzle_migrations']!.length + 1)
    const columnsBefore = Object.keys(before['agents']![0]!)
    const inTheColumnsBefore = (rows: Row[]) => sorted(rows.map((row) => Object.fromEntries(columnsBefore.map((column) => [column, row[column]]))))
    expect(inTheColumnsBefore(after['agents']!)).toEqual(before['agents'])
    expect(after['registry_aliases']).toEqual(before['registry_aliases'])
    expect(after['registry_remint_generations']).toEqual([])
  })
})

describe('npm run db:migrate -- --stage-remint <file>', () => {
  it('writes a new file only its owner can read, with the digest, the fingerprint and the map, writes nothing to the database, and never overwrites the file', async () => {
    const { theAppliedMigrationsDigest } = await remint()
    const { theAgentsTablesFingerprint } = await map()
    const copy = aCopy('stage-here')
    const file = join(folder(), 'staged.json')
    const before = everyRow(copy)

    const ran = theCommand(copy, '--stage-remint', file)
    expect(ran.status, ran.stderr).toBe(0)
    const text = readFileSync(file, 'utf8')
    const staged = JSON.parse(text) as Staged
    expect(ran.stdout).toContain(`re-mint map ${staged.map.digest} staged in ${file}: ${String(legacyOf(staged).length)} legacy agent(s) take a new id`)
    expect(ran.stdout).toContain('Nothing was written to the database.')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(Object.keys(staged).sort()).toEqual(['agentsTable', 'map', 'schema'])
    expect(staged.schema).toBe(theAppliedMigrationsDigest(t.client.sqlite))
    expect(staged.agentsTable).toBe(theAgentsTablesFingerprint(t.client.sqlite))
    // Every agent of the store has one entry: the legacy ones a new id, the minted one its own.
    const ids = (t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id').all() as { id: string }[]).map((row) => row.id)
    expect(staged.map.entries.map((entry) => entry.oldId).sort()).toEqual(ids)
    for (const id of [LEGACY_LIVE, LEGACY_RETIRED, RENAMED.id]) {
      const entry = staged.map.entries.find((one) => one.oldId === id)
      expect(entry, id).toMatchObject({ from: 'legacy' })
      expect(entry!.newId, id).not.toBe(id)
    }
    expect(staged.map.entries.find((entry) => entry.oldId === MINTED_LIVE.id)).toMatchObject({ from: 'minted', newId: MINTED_LIVE.id })
    expect(everyRow(copy)).toEqual(before)

    const again = theCommand(copy, '--stage-remint', file)
    expect(again.stderr).toContain(`${file} already exists. A staged map is never overwritten`)
    expect(again.status).toBe(1)
    expect(readFileSync(file, 'utf8')).toBe(text)
  })
})

describe('npm run db:migrate -- --remint <file>', () => {
  it('gives each legacy agent the id the staged map gives it, rewrites the keyed columns, files the aliases, one generation row and the kept agent-id list, and changes no other table', async () => {
    const { THE_KEPT_LISTS } = await remint()
    const { defaultAvatarAssetId } = await import('../src/shared/participants.ts')
    const { theDigestADrawingIsMadeOf } = await import('../src/server/lib/avatar-drawing.ts')
    const { file, staged } = aStagedMap()
    const legacy = legacyOf(staged)
    const newIds = new Map(legacy.map((entry) => [entry.oldId, entry.newId]))
    const newIdOf = (value: unknown) => (typeof value === 'string' ? (newIds.get(value) ?? value) : value)
    // A legacy agent's drawn face takes the key of its new id and keeps its old id's digest, and the agent wears the new key.
    const faces = new Map(legacy.map((entry) => [defaultAvatarAssetId({ kind: 'agent', id: entry.oldId }), { id: defaultAvatarAssetId({ kind: 'agent', id: entry.newId }), drawn_from: theDigestADrawingIsMadeOf({ kind: 'agent', id: entry.oldId }) }]))
    const newKeyOf = (value: unknown) => (typeof value === 'string' ? (faces.get(value)?.id ?? value) : value)
    const copy = aCopy('apply-here')
    const before = everyRow(copy)

    const ran = theCommand(copy, '--remint', file)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`re-mint: gave ${String(legacy.length)} legacy agent(s) the new id the staged map ${staged.map.digest} gives them`)
    expect(ran.stdout).toContain(`and filed ${String(legacy.length)} alias(es) and 1 generation row(s)`)

    const after = everyRow(copy)
    expect(after['agents']).toEqual(sorted(before['agents']!.map((row) => ({ ...row, id: newIdOf(row['id']), avatar_asset_id: newKeyOf(row['avatar_asset_id']) }))))
    expect(after['assets']).toEqual(sorted(before['assets']!.map((row) => ({ ...row, ...faces.get(row['id'] as string) }))))
    for (const table of new Set(THE_SEVEN.map(([one]) => one))) {
      const columns = THE_SEVEN.filter(([one]) => one === table).map(([, column]) => column)
      const rewritten = before[table]!.map((row) => ({ ...row, ...Object.fromEntries(columns.map((column) => [column, newIdOf(row[column])])) }))
      expect(after[table], table).toEqual(sorted(rewritten))
    }
    const aliases = (rows: Row[]) => rows.map((row) => ({ namespace: row['namespace'], aliasId: row['alias_id'], canonicalId: row['canonical_id'] }))
    expect(aliases(after['registry_aliases']!)).toEqual(
      expect.arrayContaining(legacy.map((entry) => ({ namespace: 'agent-registry', aliasId: entry.oldId, canonicalId: entry.newId }))),
    )
    expect(after['registry_aliases']!.length).toBe(before['registry_aliases']!.length + legacy.length)
    expect(after['registry_remint_generations']).toEqual([{ digest: staged.map.digest, schema_digest: staged.schema, agents: legacy.length }])
    // The kept lists hold one agent-id row for each legacy agent, its old id and its new one, and nothing else.
    expect(before[THE_KEPT_LISTS]).toEqual([])
    expect(after[THE_KEPT_LISTS]).toEqual(
      expect.arrayContaining(legacy.map((entry) => ({ generation: staged.map.digest, list: 'agent_id', record_id: null, seq: null, link_id: null, old: entry.oldId, new: entry.newId }))),
    )
    expect(after[THE_KEPT_LISTS]!.length).toBe(legacy.length)
    const written = new Set([...WRITTEN, THE_KEPT_LISTS])
    expect(without(after, written)).toEqual(without(before, written))
  })

  it('gives two copies of one store, given one staged file, the same generation row and the same rows in every table', () => {
    const { file, staged } = aStagedMap()
    const [one, two] = [aCopy('the-first-copy'), aCopy('the-second-copy')]

    for (const copy of [one, two]) {
      const ran = theCommand(copy, '--remint', file)
      expect(ran.status, ran.stderr).toBe(0)
    }

    const [first, second] = [everyRow(one), everyRow(two)]
    expect(first['registry_remint_generations']).toEqual([{ digest: staged.map.digest, schema_digest: staged.schema, agents: legacyOf(staged).length }])
    expect(second['registry_remint_generations']).toEqual(first['registry_remint_generations'])
    expect(first['agents']!.map((row) => row['id']).sort()).toEqual(staged.map.entries.map((entry) => entry.newId).sort())
    expect(second).toEqual(first)
  })

  it('writes nothing the second time it is given the same file, and says the store had already applied it', () => {
    const { file, staged } = aStagedMap()
    const copy = aCopy('apply-twice')
    expect(theCommand(copy, '--remint', file).status).toBe(0)
    const once = everyRow(copy)

    const ran = theCommand(copy, '--remint', file)
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toContain(`re-mint: this store had already applied the staged map ${staged.map.digest}, so nothing was written`)
    expect(everyRow(copy)).toEqual(once)
  })

  it('refuses a store whose agents table changed after the stage, an agent made, renamed or retired, and writes nothing', () => {
    const { file } = aStagedMap()
    const changes: Record<string, (s: Database.Database) => void> = {
      made: (s) => anAgent(s, 'legacy-finch', 'legacy-finch'),
      renamed: (s) => s.prepare('UPDATE agents SET handle = ? WHERE id = ?').run('renamed-lark', LEGACY_LIVE),
      retired: (s) => s.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(LEGACY_LIVE),
    }
    for (const [what, change] of Object.entries(changes)) {
      const copy = aCopy(`an-agent-${what}`)
      const s = opened(copy)
      change(s)
      s.close()
      refusedAndUnwritten(copy, file, 'The agents table changed after the map was staged: an agent was made, renamed, retired or changed. Stage a new map.')
    }
  })

  it('refuses a store that already applied another map, and writes nothing', async () => {
    const { fileTheRemintGeneration } = await remint()
    const { file, staged } = aStagedMap()
    const copy = aCopy('another-map')
    const other = sha256('another made-up re-mint map')
    const s = opened(copy)
    fileTheRemintGeneration(s, { digest: other, schema: staged.schema, agents: 1 })
    s.close()

    refusedAndUnwritten(copy, file, `This store already applied another re-mint map, ${other}, and a store is re-minted once. The staged map ${staged.map.digest} is refused.`)
  })

  it('refuses a map staged at other migrations than the store has applied, and writes nothing', () => {
    const { staged } = aStagedMap()
    const edited = join(folder(), 'staged-at-other-migrations.json')
    writeFileSync(edited, JSON.stringify({ ...staged, schema: sha256('made-up other migrations') }), { mode: 0o600 })

    refusedAndUnwritten(aCopy('other-migrations'), edited, 'The migrations this store has applied are not the ones the map was staged at. Stage a new map on this store.')
  })

  it('refuses to run with a migration pending, so the re-mint is the only change its run makes, and writes nothing', async () => {
    const { file } = aStagedMap()
    const behind = await anOfficeOneMigrationBehind()

    refusedAndUnwritten(behind, file, 'The re-mint runs alone, and this run would apply 1 migration(s) first: ')
  })

  it('refuses a database with no migration journal before any table is made', () => {
    const { file } = aStagedMap()
    const empty = join(folder(), 'empty.db')

    const ran = theCommand(empty, '--remint', file)
    expect(ran.stderr).toContain('has no migration journal, so every migration is pending, and the re-mint runs alone.')
    expect(ran.status).toBe(1)
    expect(everyRow(empty)).toEqual({})
  })
})

describe('what the command refuses before it writes anything', () => {
  it('refuses to stage a map on a store with a migration pending, and writes no file', async () => {
    const behind = await anOfficeOneMigrationBehind()
    const file = join(folder(), 'staged-behind.json')
    const before = everyRow(behind)

    const ran = theCommand(behind, '--stage-remint', file)
    expect(ran.stderr).toContain('A re-mint map is staged only when every migration is applied, and 1 is not: ')
    expect(ran.status).toBe(1)
    expect(existsSync(file)).toBe(false)
    expect(everyRow(behind)).toEqual(before)
  })

  it('refuses an unknown argument, a missing file name, an argument too many, and a staged file that is not one, without opening the database', () => {
    const database = join(folder(), 'never-opened.db')
    const empty = join(folder(), 'empty.json')
    const notJson = join(folder(), 'not-json.json')
    const notAMap = join(folder(), 'not-a-map.json')
    writeFileSync(empty, '')
    writeFileSync(notJson, 'a made-up map that is not JSON')
    writeFileSync(notAMap, JSON.stringify({ schema: 'made-up', map: {} }))
    const asked = 'npm run db:migrate takes no argument, or --stage-remint <file>, or --remint <file>, and it was given '
    const cases: [string[], string][] = [
      [['--remint-now', notAMap], asked],
      [['--remint'], asked],
      [['--stage-remint'], asked],
      [['--remint', notAMap, 'one-too-many'], asked],
      [['--remint', join(folder(), 'not-there.json')], 'could not be read'],
      [['--remint', empty], `The staged re-mint map ${empty} is not JSON. Nothing was written.`],
      [['--remint', notJson], `The staged re-mint map ${notJson} is not JSON. Nothing was written.`],
      [['--remint', notAMap], `${notAMap} is not a map that --stage-remint writes: it is not an object with exactly schema, agentsTable and map. Nothing was written.`],
    ]
    for (const [args, words] of cases) {
      const ran = theCommand(database, ...args)
      expect(ran.stderr, args.join(' ')).toContain(words)
      expect(ran.status, args.join(' ')).toBe(1)
      expect(existsSync(database), args.join(' ')).toBe(false)
    }
  })
})
