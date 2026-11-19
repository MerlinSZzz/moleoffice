// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT IS VERIFIED READ-ONLY, AND A CHECK THAT FAILS ROLLS THE UPGRADE BACK. Wave 13s round 161, item 30c part 3.
 *
 * tools/verify-the-remint.mjs runs the checks of src/server/db/remint-verification.ts as a closed stable upgrade's
 * verifier, under the contract of tools/stable/closed-upgrade-verification.mjs. Here a throwaway office holds made-up
 * agents, legacy, retired, renamed and minted, an alias, a row in each column with a key to agents.id, made-up stamps,
 * a registry id in a plain column, a record in the text index, and a held key. The office's own row is under its
 * handle and wears the face drawn for that id. The session's worker runs are keyed by the legacy agent's old id, a seal
 * pins the session's revision, and a released run and a merge entry pin the seal's own hash. A map is staged from it
 * and applied with the real command, `npm run db:migrate -- --remint <file>`, whose pass rewrites the history. The
 * snapshot is a byte copy of the store just before. Cases:
 *   1. on a sound re-mint every check passes, the result is a new private file holding exactly what the contract reads,
 *      each check's line says how long it took, the line of rows names each table SQLite keeps for the text index,
 *      which rows does not compare, and the two files and their folder are as they were;
 *   2. a fault made in a copy of the store after the re-mint fails the checks that read it, and only those:
 *        an agent's name changed fails registry;
 *        an alias no map made fails aliases;
 *        an alias that makes a stamp name an agent fails aliases, stamps, and registry-ids, because the census
 *        reads a value it could not read before;
 *        a changed generation row fails map;
 *        a changed value in another table fails rows;
 *        a registry id changed to another agent fails rows and registry-ids;
 *        a registry id changed to the new id the map gives another legacy agent fails rows and registry-ids;
 *        a row naming an agent that is not there fails rows, registry-ids and integrity;
 *        a seal's own hash changed fails rows;
 *        a pin of a seal's own hash changed fails rows;
 *        a kept pair for a hash no seal pinned fails rows;
 *   3. a map whose new id is a registry id that named no agent is applied by the real re-mint, and only registry-ids
 *      fails, naming the position;
 *   4. in the recovery phase every check passes on a copy of the snapshot, without reading the map, and every check
 *      fails on the store after the re-mint;
 *   5. a result file that is there, a request with a field too many, a check it does not know, a relative path, and a
 *      map that is not a staged map are each refused with exit 2, and no result is written;
 *   6. at a limit of 1 ms every check is false;
 *   7. a store with a write-ahead log that holds anything is not opened, and the log is not changed;
 *   8. a closed stable upgrade on 13q's made-up office whose target verifier is this one fails the target, restores the
 *      snapshot, passes the recovery phase, and the old version serves again;
 *   9. where a stored name answers a legacy agent by its old id and a retired agent by its handle, the re-mint keeps
 *      the stamp as it was typed and gives the registry id the legacy agent's new id, and every check passes; that copy
 *      holds no key under the old id, because the re-mint refuses one;
 *  10. the office's own reader of the text index, run in a child process on a copy of the store after, keeps the
 *      session for the renamed agent's new id, and on a copy of the snapshot keeps no record.
 *
 * NO STAMP SITS UNDER A KEY THAT IS AN OLD ID. No record the register accepts can hold a stamp or an actor pair under
 * a key that is an old id. Only session.workerRuns and ForestMapState.assignments read an object's keys as agent ids,
 * no shape reachable from either holds a stamp or an actor pair, and castingRoll is an open bag that is only checked
 * (src/server/lib/registry-aliases/historical-reader.ts 405-409). So the stamp check's use of the mapping from a path
 * before to the path after has no case. registry-ids uses the same mapping, and the session's worker runs prove it.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-is-verified-read-only.test.ts
 * After a green control, copy src/server/db/remint-verification.ts, src/server/lib/registry-aliases/census.ts,
 * src/server/db/remint-migration.ts, src/server/db/remint-history.ts, src/server/lib/registry-aliases/remint-stamps.ts,
 * tools/verify-the-remint.mjs and tools/open-immutable.mjs, then make one of these changes:
 *   1. in remint-verification.ts, put `return value` as the first line of the arrow theRewriteOf returns: no key is
 *      rewritten, and cases 1 to 3 go red;
 *   2. in remint-verification.ts, delete the line `if (differ.length > 0) differences.push(`: a changed value is not
 *      named, and cases 2 and 4 go red;
 *   3. in remint-verification.ts, put `return null` as the first line of theKeyWithoutARowid: after a rollback the text
 *      index's tables are read by a rowid they do not have, and case 4 goes red. rows leaves those tables out, and the
 *      made-up office of case 8 has no text index;
 *   4. in remint-verification.ts, delete the line `for (const [at, alias] of now) if (!expected.has(at))`: an alias no
 *      map made is not named, and case 2 goes red;
 *   5. in remint-verification.ts, delete the `if (JSON.stringify(now) !== JSON.stringify([expected]))` block: a
 *      changed generation row is not named, and case 2 goes red;
 *   6. in remint-verification.ts, put `false` in place of `whomItNames(it) !== whomItMustName(one)`: a registry id
 *      that comes to name another agent is not named, and cases 2 and 3 go red;
 *   7. in remint-verification.ts, delete the line `for (const row of broken) problems.push(`: case 2 goes red;
 *   8. in remint-verification.ts, put `[]` in place of `whereAStampNamesAnyoneElse(stores.after(), must)`: case 2 goes red;
 *   9. in remint-verification.ts, put `true` in place of `differences.length === 0` in theStoreIsTheSnapshot: case 4
 *      goes red;
 *  10. in census.ts, delete the line `found?.push({ table, row, ...one })`: registry-ids reads nothing, and cases 2 and
 *      3 go red;
 *  11. in verify-the-remint.mjs, delete the line `try { lstatSync(resultPath); refuse(`: case 5 goes red;
 *  12. in verify-the-remint.mjs, put `if (true) {` in place of `if (request.phase === 'target') {`: the recovery phase
 *      reads the map, and case 4 goes red;
 *  13. in verify-the-remint.mjs, put `false` in place of `over()` in `if (over()) outcome`: case 6 goes red;
 *  14. in open-immutable.mjs, delete the line `if (log !== null && log.size > 0) return`: case 7 goes red;
 *  15. in remint-verification.ts, put the four tables SQLite keeps for the text index back into what rows compares:
 *      rows fails on the store after, and case 1, case 2 for the four faults that do not fail rows, case 3 and case 9
 *      go red;
 *  16. in remint-migration.ts, drop the trigger record_text_on_update before the pass and make it again after it:
 *      case 10 goes red;
 *  17. in remint-verification.ts, let rows take any new hash at a seal's own hash: case 2 goes red;
 *  18. in remint-history.ts, leave the seal_own_hash pairs out of what rewriteTheHistory returns, so the re-mint files
 *      none while the plan the verifier reads still holds them: rows fails on the store after, and case 1, case 2 for
 *      the four faults that do not fail rows, case 3 and case 9 go red;
 *  19. in remint-stamps.ts, make the mapping give back the path it is given: registry-ids fails on the store after,
 *      and case 1, case 2 for the seven faults that do not fail registry-ids, and case 9 go red;
 *  20. in remint-verification.ts, let rows take the map's new id at a stamp: case 9 goes red;
 *  21. in remint-verification.ts, let rows take the rule at a registry id: case 9 goes red;
 *  22. in remint-verification.ts, let rows take, at a registry id, any new id of an agent_id kept pair: case 2 goes red;
 *  23. in remint-verification.ts, leave the kept lists out of what rows works out: case 1 goes red;
 *  24. in remint-migration.ts, do not call the pass: cases 1 and 10 go red;
 *  25. in remint-migration.ts, do not file the pass's kept-list rows: case 1 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name, key hash and row here is made up, in a throwaway office. Each command is given only PATH, LANG, a
 * made-up home in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { upgradeStable } from '../tools/stable/stable-upgrade-transaction.mjs'
import { defaultAvatarAssetId, THE_OFFICE_WRITER_ID } from '../src/shared/participants.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import { LIMITS, rows } from './a-closed-stable-upgrade.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { baselineIsBack, remember, stableUpgradeFixture, track } from './stable-upgrade-fixture.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const THE_VERIFIER = join(REPO, 'tools/verify-the-remint.mjs')
const NODE = realpathSync(process.execPath)
const CHECKS = ['map', 'registry', 'aliases', 'rows', 'stamps', 'registry-ids', 'integrity']

let t: TestDb
let base: { snapshot: string; after: string; map: string }
beforeAll(async () => {
  t = await freshDb()
  // The office's own row has its id set back to its handle, and wears the face drawn for that id, as an office whose
  // row was never re-minted does. So the re-mint changes the row's id and renames its face.
  const s = t.client.sqlite
  const minted = s.prepare("SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0").pluck().get() as string
  expect(s.prepare('SELECT avatar_asset_id FROM agents WHERE id = ?').pluck().get(minted)).toBe(drawnKeyOf(minted))
  s.transaction(() => {
    s.pragma('defer_foreign_keys = ON')
    expect(s.prepare('UPDATE assets SET id = ? WHERE id = ?').run(drawnKeyOf('mole-office'), drawnKeyOf(minted)).changes).toBe(1)
    s.prepare('UPDATE agents SET id = ?, avatar_asset_id = ? WHERE id = ?').run('mole-office', drawnKeyOf('mole-office'), minted)
  })()
  aMadeUpOffice(s)
  // One migration with no map, so the store is as a migrated office leaves it, and the re-mint's run has nothing else to write.
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(s, MIGRATIONS)
  // The seal pins a revision's row by every column revisions has, so it is made once the migrations have run.
  aSealOverTheRun(s)
  base = theRemint('base', (office, map) => expect(theCommand(office, '--stage-remint', map).status).toBe(0))
}, 240_000)
afterAll(() => t?.close())

const folder = () => dirname(t.file)

// A made-up registry: a legacy agent, a retired one, a renamed one, a minted one, and an alias of the minted one.
const LEGACY_LIVE = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const RENAMED = { id: 'old-heron', handle: 'new-heron' }
const MINTED_LIVE = { id: 'MintedLive_1', handle: 'minted-live' }
const AN_OLDER_NAME = 'older-minted-live'
const NO_AGENT = 'made-up-visitor'
const WHEN = '2026-10-31 03:00:00'
const PROJECT = 'default'
/** A seal over the session's revision, a released run that read it, and a merge entry of that run. */
const SEALED = { seal: 'MadeUpSeal01', released: 'MadeUpRun001', merge: 'MadeUpMerge1' }

/** The key of the face drawn for the agent with this id. */
const drawnKeyOf = (id: string) => defaultAvatarAssetId({ kind: 'agent', id })
const sha256Of = (text: string) => createHash('sha256').update(text).digest('hex')

function aMadeUpOffice(s: Database.Database): void {
  const anAgent = (id: string, handle: string, retired = false) =>
    s.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, 'made-up-asset', '2026-01-01 00:00:00', retired ? 1 : 0)
  s.prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  anAgent(LEGACY_LIVE, LEGACY_LIVE)
  anAgent(LEGACY_RETIRED, LEGACY_RETIRED, true)
  anAgent(RENAMED.id, RENAMED.handle)
  anAgent(MINTED_LIVE.id, MINTED_LIVE.handle)
  s.prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', ?, ?)").run(AN_OLDER_NAME, MINTED_LIVE.id)
  // A row in each column with a key to agents.id, for the legacy agent and the minted one.
  for (const agent of [LEGACY_LIVE, MINTED_LIVE.id]) {
    const other = MINTED_LIVE.id
    s.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(`made-up-record-of-${agent}`, agent)
    s.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-hold-of-${agent}`, agent, 'made-up-session', 'made-up-machine', 'claude-code', WHEN, WHEN, WHEN)
    s.prepare('INSERT INTO resident_sleeps (id, agent_id, what, began_at, by_kind, by_id) VALUES (?, ?, ?, ?, ?, ?)').run(`made-up-sleep-of-${agent}`, agent, 'slept', WHEN, 'agent', other)
    s.prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-grant-to-${agent}`, other, agent, '2026-11-30', WHEN, 'agent', other)
    s.prepare('INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-grant-of-${agent}`, agent, other, '2026-11-30', WHEN, 'agent', other)
    s.prepare('INSERT INTO resident_void_marks (id, resident_id, path, because, marked_at, marked_by_kind, marked_by_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`made-up-mark-of-${agent}`, agent, `made-up-path-of-${agent}`, 'Made-up reason', WHEN, 'agent', other)
    s.prepare('INSERT INTO resident_space_writes (id, resident_id, path, bytes, sha256, written_at, written_by_kind, written_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`made-up-write-of-${agent}`, agent, 'made-up-path', 1, 'made-up-hash', WHEN, 'agent', other)
  }
  // A session record, its revision and a change: an actor pair and a stamp, by the renamed agent's id and the minted
  // one's handle, and worker runs keyed by the legacy agent's old id, asked by the renamed agent. The record is in the
  // text index.
  const data = {
    extra: { openedBy: { type: 'agent', id: RENAMED.id, underTheGrant: 'MadeUpGrant' } },
    theCheck: { message: 'made-up-ask', askedOf: MINTED_LIVE.handle, askedAt: WHEN, checkout: {}, says: 'A made-up check ask.' },
    workerRuns: { [LEGACY_LIVE]: { state: 'wanted', askedAt: WHEN, askedBy: { who: { kind: 'agent', id: RENAMED.id }, session: 'made-up-session' } } },
  }
  s.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES ('made-up-run', ?, ?, ?, ?, 'session', 'A made-up run', ?, 'fixture')")
    .run(PROJECT, THE_TEST_OFFICES_OWNER.id, WHEN, WHEN, JSON.stringify(data))
  // Its content hash is the one the revision writer gives its content, because the re-mint stops on a wrong one.
  s.prepare("INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, data, op, actor_type, actor_id, at) VALUES ('made-up-revision', 'made-up-run', ?, 1, ?, 'session', 'A made-up run', ?, 'create', 'agent', ?, ?)")
    .run(PROJECT, versionOf(contentOf({ kind: 'session', title: 'A made-up run', summary: null, data, deletedAt: null })), JSON.stringify(data), LEGACY_LIVE, WHEN)
  s.prepare("INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES ('made-up-change', 'made-up-run', ?, 'update', 'agent', ?, 'data', NULL, ?, ?)")
    .run(PROJECT, RENAMED.handle, JSON.stringify(data), WHEN)
  // A held key of the legacy agent, calls by the office's own writer and by a name no agent has, and a registry id in a
  // plain column: the asset's maker.
  s.prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, last_used_at, revoked_at, revoked_because, mint_proved_by) VALUES ('key-of-lark', 'agent', ?, 'made-up-hash', ?, ?, NULL, NULL, NULL)").run(LEGACY_LIVE, WHEN, WHEN)
  const aCall = s.prepare("INSERT INTO api_calls (id, at_ms, ms, method, status, identity_source, actor_type, actor_id) VALUES (?, 0, 1, 'GET', 200, 'made-up', 'agent', ?)")
  aCall.run('call-of-the-office', THE_OFFICE_WRITER_ID)
  aCall.run('call-of-nobody', NO_AGENT)
  s.prepare("UPDATE assets SET created_by_kind = 'agent', created_by_id = ? WHERE id = 'made-up-asset'").run(LEGACY_LIVE)
}

/** A made-up record and its one revision, written by the office's owner as the revision writer writes one. */
function putIn(s: Database.Database, id: string, kind: string, title: string, data: Record<string, unknown>): void {
  s.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fixture')")
    .run(id, PROJECT, THE_TEST_OFFICES_OWNER.id, WHEN, WHEN, kind, title, JSON.stringify(data))
  s.prepare("INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, data, op, actor_type, actor_id, at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'create', 'human', ?, ?)")
    .run(`${id}-r1`, id, PROJECT, versionOf(contentOf({ kind, title, summary: null, data, deletedAt: null })), kind, title, JSON.stringify(data), THE_TEST_OFFICES_OWNER.id, WHEN)
}

/**
 * A SEAL OVER THE SESSION'S REVISION, with the shape sealFinishedRun gives one. It pins the revision by the sha256 of
 * its row as JSON, over every column revisions has, and its own hash is the sha256 of its content as JSON. A released
 * run that read the seal and a merge entry of that run each pin the seal's own hash. Both hashes are worked out here
 * and not by the code the test checks.
 */
function aSealOverTheRun(s: Database.Database): void {
  const columns = s.prepare("SELECT name FROM pragma_table_info('revisions') ORDER BY cid").pluck().all() as string[]
  const row = s.prepare("SELECT * FROM revisions WHERE id = 'made-up-revision'").get() as Record<string, unknown>
  const pin = { record: 'made-up-run', id: 'made-up-revision', seq: 1, hash: sha256Of(JSON.stringify(Object.fromEntries(columns.map((column) => [column, row[column]])))) }
  const content = {
    version: 1,
    run: 'made-up-sealed-run',
    execution: 'made-up-execution',
    attempt: 'made-up-attempt',
    area: ['made-up/'],
    sealedAt: WHEN,
    kind: 'records',
    git: null,
    records: { workspace: PROJECT, baseline: 1, through: 1000, records: [{ id: 'made-up-run', before: null, after: pin }], dependencies: [], links: [], says: 'Made-up words, on a made-up seal.' },
  }
  const hash = sha256Of(JSON.stringify(content))
  putIn(s, SEALED.seal, 'sealed_tip', 'A made-up seal', { seal: { ...content, hash } })
  putIn(s, SEALED.released, 'session', 'A made-up released run', { released: { read: { sealId: SEALED.seal, sealHash: hash } } })
  putIn(s, SEALED.merge, 'merge_entry', 'A made-up merge entry', { run: SEALED.released, seal: { id: SEALED.seal, hash } })
}

/** Run `change` on a store with the guards of its sealed tips lifted, and make them again from their own text after. */
function withTheSealsUnguarded(s: Database.Database, change: () => void): void {
  const guards = s.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'records' AND sql LIKE '%sealed_tip%'").all() as { name: string; sql: string }[]
  expect(guards.length).toBeGreaterThan(0)
  for (const guard of guards) s.prepare(`DROP TRIGGER "${guard.name}"`).run()
  change()
  for (const guard of guards) s.exec(guard.sql)
}

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

/**
 * A RE-MINT OF A COPY OF THE MADE-UP OFFICE, in a folder of its own: `stage` writes the map, the snapshot is a byte copy
 * of the store just before the re-mint, and the real command applies the map.
 */
function theRemint(name: string, stage: (office: string, map: string) => void): { snapshot: string; after: string; map: string } {
  const at = join(folder(), name)
  mkdirSync(at)
  const [after, snapshot, map] = [join(at, 'office.db'), join(at, 'snapshot.db'), join(at, 'map.json')]
  t.client.sqlite.prepare('VACUUM INTO ?').run(after)
  stage(after, map)
  expect(theFilesBeside(after)).toEqual([])
  copyFileSync(after, snapshot)
  const applied = theCommand(after, '--remint', map)
  expect(applied.status, applied.stderr).toBe(0)
  expect(theFilesBeside(after)).toEqual([])
  return { snapshot, after, map }
}

/** The journal, log and shared-memory files beside a database. */
const theFilesBeside = (file: string) => ['-journal', '-wal', '-shm'].filter((suffix) => existsSync(file + suffix))
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

/** A folder of its own for one case, with copies of the base snapshot, store after and map. */
let cases = 0
function aCase(): { at: string; snapshot: string; after: string; map: string } {
  const at = join(folder(), `case-${String(++cases)}`)
  mkdirSync(at)
  const copy = (file: string, as: string) => {
    copyFileSync(file, join(at, as))
    return join(at, as)
  }
  return { at, snapshot: copy(base.snapshot, 'snapshot.db'), after: copy(base.after, 'office.db'), map: copy(base.map, 'map.json') }
}

/** A made-up fault, made with a handle on a copy of the store after the re-mint, which it closes. */
function aFault(file: string, fault: (s: Database.Database) => void): void {
  const s = new Database(file)
  try {
    fault(s)
  } finally {
    s.close()
  }
  expect(theFilesBeside(file)).toEqual([])
}

const COMMIT = 'a'.repeat(40)
const STATE = 'b'.repeat(64)
interface Verified extends Ran {
  result: string
}
/** THE VERIFIER on one request, run from `cwd`, with MOLE_OFFICE_DB naming a file in a folder of the case's own. */
function verified(c: { at: string; snapshot: string; after: string; map: string }, phase: 'target' | 'recovery', over: Record<string, unknown> = {}, within = '60000'): Verified {
  const n = readdirSync(c.at).filter((name) => name.startsWith('request-')).length + 1
  const [request, result] = [join(c.at, `request-${String(n)}.json`), join(c.at, `result-${String(n)}.json`)]
  writeFileSync(request, JSON.stringify({ version: 1, phase, commit: COMMIT, repository: REPO, database: c.after, snapshot: c.snapshot, servicePort: 1, checks: CHECKS, stateSha256: STATE, ...over }))
  const empty = join(c.at, `empty-${String(n)}`)
  mkdirSync(empty)
  const it = ran(NODE, [THE_VERIFIER, '--within', within, '--map', c.map, request, result], empty, join(empty, 'office.db'))
  expect(readdirSync(empty), 'MOLE_OFFICE_DB names a file the verifier never makes').toEqual([])
  return { ...it, result }
}
const theResult = (it: Verified) => JSON.parse(readFileSync(it.result, 'utf8')) as { checks: Record<string, boolean> }
const failedIn = (it: Verified) => Object.entries(theResult(it).checks).filter(([, passed]) => !passed).map(([name]) => name)

describe('a sound re-mint', () => {
  it('passes every check, writes exactly what the contract reads into a new private file, and changes neither store', () => {
    const c = aCase()
    const before = { snapshot: sha256(c.snapshot), after: sha256(c.after) }
    const it = verified(c, 'target')
    expect(it.status, it.stdout + it.stderr).toBe(0)
    expect(JSON.parse(readFileSync(it.result, 'utf8'))).toEqual({ version: 1, phase: 'target', commit: COMMIT, stateSha256: STATE, checks: Object.fromEntries(CHECKS.map((name) => [name, true])) })
    expect(statSync(it.result).mode & 0o777).toBe(0o600)
    for (const name of CHECKS) expect(it.stdout).toMatch(new RegExp(`^${name}: passed in \\d+ ms\\. `, 'm'))
    expect(it.stdout).toContain('verify-the-remint: 7 of 7 checks passed.')
    expect(it.stdout).toMatch(/^registry: passed in \d+ ms\. Each of the 5 agents is the snapshot's row under the id the map gives it, 4 legacy agents under a new id/m)
    expect(it.stdout).toMatch(/^aliases: passed in \d+ ms\. 1 alias of the snapshot is kept, and 4 aliases were added/m)
    // The tables SQLite keeps for the text index, as SQLite names them.
    const theIndexTables = t.client.sqlite.prepare("SELECT name FROM pragma_table_list WHERE type = 'shadow' ORDER BY name").pluck().all() as string[]
    expect(theIndexTables.length).toBeGreaterThan(0)
    const rowsLine = it.stdout.split('\n').find((line) => line.startsWith('rows: ')) ?? ''
    for (const table of theIndexTables) expect(rowsLine).toContain(table)
    expect({ snapshot: sha256(c.snapshot), after: sha256(c.after) }).toEqual(before)
    expect([...theFilesBeside(c.snapshot), ...theFilesBeside(c.after)]).toEqual([])
  })
})

describe('a fault in the store after the re-mint', () => {
  const minted = MINTED_LIVE.id
  /** A change to the seal hash in a record's data: a sealed tip's own hash, or a merge entry's pin of it. */
  const A_SEAL_HASH_CHANGED = "UPDATE records SET data = json_set(data, '$.seal.hash', ?) WHERE id = ?"
  /** A fault is given the store after and the new id the staged map gives an old id. */
  const FAULTS: [string, (s: Database.Database, newIdOf: (oldId: string) => string) => void, string[]][] = [
    ["an agent's name changed", (s) => s.prepare("UPDATE agents SET name = 'A changed made-up name' WHERE id = ?").run(minted), ['registry']],
    ['an alias no map made', (s) => s.prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', 'made-up-unused', ?)").run(minted), ['aliases']],
    ['an alias that makes a stamp name an agent', (s) => s.prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', ?, ?)").run(NO_AGENT, minted), ['aliases', 'stamps', 'registry-ids']],
    ['a changed generation row', (s) => s.prepare(`UPDATE registry_remint_generations SET agents = agents + 1`).run(), ['map']],
    ['a changed value in another table', (s) => s.prepare("UPDATE api_calls SET ms = 2 WHERE id = 'call-of-nobody'").run(), ['rows']],
    ['a registry id changed to another agent', (s) => s.prepare("UPDATE assets SET created_by_id = ? WHERE id = 'made-up-asset'").run(minted), ['rows', 'registry-ids']],
    [
      "a registry id changed to another legacy agent's new id",
      (s, newIdOf) => expect(s.prepare("UPDATE assets SET created_by_id = ? WHERE id = 'made-up-asset'").run(newIdOf(LEGACY_RETIRED)).changes).toBe(1),
      ['rows', 'registry-ids'],
    ],
    [
      'a row naming an agent that is not there',
      (s) => {
        s.pragma('foreign_keys = OFF')
        s.prepare("INSERT INTO agent_records (record_id, agent_id) VALUES ('made-up-orphan', 'made-up-nobody')").run()
      },
      ['rows', 'registry-ids', 'integrity'],
    ],
    [
      "a seal's own hash changed",
      (s) => withTheSealsUnguarded(s, () => expect(s.prepare(A_SEAL_HASH_CHANGED).run('e'.repeat(64), SEALED.seal).changes).toBe(1)),
      ['rows'],
    ],
    ["a pin of a seal's own hash changed", (s) => expect(s.prepare(A_SEAL_HASH_CHANGED).run('e'.repeat(64), SEALED.merge).changes).toBe(1), ['rows']],
    [
      'a kept pair for a hash no seal pinned',
      (s) =>
        expect(
          s
            .prepare("INSERT INTO registry_remint_kept_lists (generation, list, record_id, seq, link_id, old, new) SELECT digest, 'seal_hash', 'made-up-run', 1, NULL, ?, ? FROM registry_remint_generations")
            .run('c'.repeat(64), 'd'.repeat(64)).changes,
        ).toBe(1),
      ['rows'],
    ],
  ]
  for (const [name, fault, failing] of FAULTS) {
    it(`${name} fails ${failing.join(', ')}, and no other check`, async () => {
      const { readTheStagedRemint } = await import('../src/server/db/remint-migration.ts')
      const c = aCase()
      const { entries } = readTheStagedRemint(c.map).map
      const newIdOf = (oldId: string) => {
        const newId = entries.find((entry) => entry.oldId === oldId)?.newId
        expect(newId, `the map gives ${oldId} a new id`).toBeDefined()
        expect(newId).not.toBe(oldId)
        return newId!
      }
      aFault(c.after, (s) => fault(s, newIdOf))
      const it = verified(c, 'target')
      expect(it.status, it.stdout + it.stderr).toBe(1)
      expect(failedIn(it), it.stdout).toEqual(failing)
      for (const check of failing) expect(it.stdout).toMatch(new RegExp(`^${check}: FAILED in \\d+ ms\\. `, 'm'))
    })
  }
})

describe('a new id that a registry id held', () => {
  it('is applied by the re-mint, and only registry-ids fails, naming the position', async () => {
    const { stageTheRemint } = await import('../src/server/db/remint-migration.ts')
    // The asset's maker is a name no agent has, and the map gives a legacy agent that name as its new id.
    const taken = 'NewIdOne_001'
    t.client.sqlite.prepare("UPDATE assets SET created_by_id = ? WHERE id = 'made-up-asset'").run(taken)
    const ids = [taken, 'NewIdTwo_002', 'NewIdThree03', 'NewIdFour_04']
    try {
      const remint = theRemint('a-taken-id', (office, map) => {
        const s = new Database(office)
        try {
          stageTheRemint(s, map, [], () => ids.shift()!)
        } finally {
          s.close()
        }
      })
      const it = verified({ at: dirname(remint.after), ...remint }, 'target')
      expect(it.status, it.stdout + it.stderr).toBe(1)
      expect(failedIn(it), it.stdout).toEqual(['registry-ids'])
      expect(it.stdout).toContain(`assets row "made-up-asset", created_by_id (assets.created_by_id): it held "${taken}", so it must name no agent, and it holds "${taken}", which names the agent "${taken}".`)
    } finally {
      t.client.sqlite.prepare("UPDATE assets SET created_by_id = ? WHERE id = 'made-up-asset'").run(LEGACY_LIVE)
    }
  })
})

describe('the recovery phase', () => {
  it('passes every check on a copy of the snapshot without reading the map, and fails every check on the store after', () => {
    const c = aCase()
    const restored = { ...c, after: join(c.at, 'restored.db'), map: join(c.at, 'no-map-is-here.json') }
    copyFileSync(c.snapshot, restored.after)
    const passed = verified(restored, 'recovery')
    expect(passed.status, passed.stdout + passed.stderr).toBe(0)
    expect(passed.stdout).toContain('The restored store is compared with the snapshot. The staged map is not read.')
    expect(passed.stdout).toMatch(/^map: passed in \d+ ms\. After a rollback the store must be the snapshot, so this compared the schema and the \d+ rows of the \d+ tables, value for value, and they are the snapshot's\./m)
    const failed = verified(c, 'recovery')
    expect(failed.status, failed.stdout + failed.stderr).toBe(1)
    expect(failedIn(failed)).toEqual(CHECKS)
    expect(failed.stdout).toMatch(/row \d+ of agents differs in id from what the snapshot's row should be\./)
  })
})

describe('a request it does not understand', () => {
  const REFUSALS: [string, (c: ReturnType<typeof aCase>) => { over?: Record<string, unknown>; before?: () => void; map?: string }, RegExp][] = [
    ['a result file that is there', (c) => ({ before: () => writeFileSync(join(c.at, 'result-1.json'), '{}') }), /The result file already exists/],
    ['a request with a field too many', () => ({ over: { extra: true } }), /It also holds extra\./],
    ['a check it does not know', () => ({ over: { checks: ['map', 'no-such-check'] } }), /and not "no-such-check"/],
    ['a relative path', () => ({ over: { snapshot: 'snapshot.db' } }), /The snapshot is an absolute path\./],
    ['a map that is not a staged map', (c) => ({ before: () => writeFileSync(join(c.at, 'not-a-map.json'), '{"map":{}}'), map: join(c.at, 'not-a-map.json') }), /The staged map could not be read: .* is not a map that --stage-remint writes/],
  ]
  for (const [name, make, refusal] of REFUSALS) {
    it(`refuses ${name} with exit 2, and writes no result`, () => {
      const c = aCase()
      const asked = make(c)
      asked.before?.()
      const had = existsSync(join(c.at, 'result-1.json'))
      const it = verified({ ...c, map: asked.map ?? c.map }, 'target', asked.over)
      expect(it.status, it.stdout + it.stderr).toBe(2)
      expect(it.stderr).toMatch(refusal)
      expect(it.stderr).toContain('Nothing was checked and no result was written.')
      if (had) expect(readFileSync(it.result, 'utf8')).toBe('{}')
      else expect(existsSync(it.result)).toBe(false)
    })
  }
})

describe('the limit and the files beside a store', () => {
  it('makes every check false at a limit of 1 ms', () => {
    const c = aCase()
    const it = verified(c, 'target', {}, '1')
    expect(it.status).toBe(1)
    expect(failedIn(it)).toEqual(CHECKS)
    expect(it.stdout).toMatch(/^map: FAILED in \d+ ms\. Not run: the verifier's limit of 1 ms was reached before it started\./m)
  })

  it('does not open a store whose write-ahead log holds anything, and leaves the log as it was', () => {
    const c = aCase()
    writeFileSync(`${c.after}-wal`, 'made-up bytes not yet in the file')
    const it = verified(c, 'target')
    expect(it.status).toBe(1)
    expect(it.stdout).toContain("the store after the re-mint's write-ahead log holds 33 bytes not yet in the file, which an immutable read would not see, so it was not opened")
    expect(readFileSync(`${c.after}-wal`, 'utf8')).toBe('made-up bytes not yet in the file')
  })
})

describe("13q's made-up stable office", () => {
  it('rolls back a closed upgrade whose re-mint verifier fails the target, and the recovery phase passes', async () => {
    const f = await stableUpgradeFixture(false, false, false, false, false, true)
    // The map was staged from another office, so the target fails map, and the upgrade restores the snapshot.
    const config = { ...f.config, closedVerification: { command: [NODE, THE_VERIFIER, '--within', '20000', '--map', base.map], timeoutMs: 30_000, checks: CHECKS, ...LIMITS } }
    const result = remember(await upgradeStable(config, { ...f.options, onStep: (e: unknown) => track(e) }))
    expect(result.state, JSON.stringify(result)).toBe('restored')
    const journal = rows(result.paths.journal)
    const resultOf = (phase: string) => JSON.parse(readFileSync(journal.find((e) => e.step === `verifier-${phase}` && e.phase === 'requested').result, 'utf8'))
    expect(resultOf('target').checks.map).toBe(false)
    expect(resultOf('recovery').checks).toEqual(Object.fromEntries(CHECKS.map((name) => [name, true])))
    expect(journal.some((e) => e.step === 'closed-verification' && e.phase === 'recovered')).toBe(true)
    await baselineIsBack(f)
  }, 180_000)
})

describe('a stored name that answers two agents', () => {
  it('is kept as it was typed at a stamp and replaced by the new id at a registry id, and every check passes', async () => {
    const { readTheStagedRemint } = await import('../src/server/db/remint-migration.ts')
    // A retired agent whose handle is the legacy agent's old id, so the stamps that hold that id answer both.
    const namesake = 'RetiredLark1'
    t.client.sqlite.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, 1)').run(namesake, 'Made-up retired lark', LEGACY_LIVE, 'made-up-asset', '2026-01-01 00:00:00')
    try {
      // One migration with no map first, as the base office had, so the data steps have filled the retired agent's row
      // before the map is staged, and the re-mint's run finds the agents table as it was staged. The re-mint refuses a
      // key held under a name that answers two agents (tests/the-remint-moves-each-agents-held-keys.test.ts, case 2),
      // so this copy holds no key under the legacy agent's old id.
      const remint = theRemint('two-answer', (office, map) => {
        const migrated = theCommand(office)
        expect(migrated.status, migrated.stderr).toBe(0)
        const s = new Database(office)
        try {
          expect(s.prepare('DELETE FROM held_keys WHERE whose_id = ?').run(LEGACY_LIVE).changes).toBe(1)
        } finally {
          s.close()
        }
        expect(theCommand(office, '--stage-remint', map).status).toBe(0)
      })
      const it = verified({ at: dirname(remint.after), ...remint }, 'target')
      expect(it.status, it.stdout + it.stderr).toBe(0)
      const newId = readTheStagedRemint(remint.map).map.entries.find((entry) => entry.oldId === LEGACY_LIVE)?.newId
      expect(newId).not.toBe(LEGACY_LIVE)
      const after = new Database(remint.after, { readonly: true, fileMustExist: true })
      try {
        expect(after.prepare("SELECT actor_id FROM revisions WHERE id = 'made-up-revision'").pluck().get()).toBe(LEGACY_LIVE)
        expect(after.prepare("SELECT created_by_id FROM assets WHERE id = 'made-up-asset'").pluck().get()).toBe(newId)
      } finally {
        after.close()
      }
    } finally {
      t.client.sqlite.prepare('DELETE FROM agents WHERE id = ?').run(namesake)
    }
  })
})

/**
 * THE RECORDS THE OFFICE'S OWN READER OF THE TEXT INDEX KEEPS FOR A SEARCH, asked in a child process of the store at
 * `store` and of no other. The case checks first that the store is in this test's own folder, and the child is given
 * only PATH, LANG, a made-up home and MOLE_OFFICE_DB naming that store.
 */
function theRecordsTheIndexKeeps(store: string, search: string): unknown {
  expect(store.startsWith(folder() + sep), `${store} is not in this test's own folder`).toBe(true)
  const from = (file: string) => JSON.stringify(pathToFileURL(join(REPO, file)).href)
  const script = [
    `const { theRecordsThatMaySay } = await import(${from('src/server/lib/record-text-index.ts')})`,
    `const { theNeedle } = await import(${from('src/shared/search.ts')})`,
    `process.stdout.write('\\n' + JSON.stringify(theRecordsThatMaySay(theNeedle(${JSON.stringify(search)})) ?? null))`,
  ].join('\n')
  const it = ran(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], REPO, store)
  expect(it.status, it.stderr).toBe(0)
  return JSON.parse(it.stdout.split('\n').at(-1) ?? '') as unknown
}

describe('the text index after the re-mint', () => {
  it("keeps the session for the renamed agent's new id in the store after, and no record in the snapshot", async () => {
    const { readTheStagedRemint } = await import('../src/server/db/remint-migration.ts')
    const c = aCase()
    const newId = readTheStagedRemint(c.map).map.entries.find((entry) => entry.oldId === RENAMED.id)?.newId ?? ''
    expect(newId).not.toBe(RENAMED.id)
    expect(theRecordsTheIndexKeeps(c.after, newId)).toContain('made-up-run')
    expect(theRecordsTheIndexKeeps(c.snapshot, newId)).toEqual([])
  })
})
