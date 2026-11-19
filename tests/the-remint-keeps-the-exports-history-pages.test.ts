// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT CHANGES A REVISION PAGE OR A CHANGE-LOG PAGE OF THE EXPORT ONLY WHERE IT NAMED A LEGACY AGENT BY ITS OLD
 * ID. Wave 13s round 170, item 30c part 3: the mirror interface of the plan's section 7, which asks that a staged export
 * of the store after the re-mint has unchanged historical revision files. Since round 257 the re-mint's history pass
 * (src/server/db/remint-history.ts) rewrites each old id in the history, so the pages are unchanged but for those ids.
 *
 * The pass rewrites a legacy agent's old id in a revision or change row to the new id the map gives it: the writer, and
 * who a key proved in `provedHolder`. The export heads such a row by its writer's id and by the name of the agent the
 * key proved, which it reads from the agents rows by that id, or through a permanent alias (`provedHolderWords` and the
 * alias loop in src/server/lib/export.ts). An id that is not an old id of the map, such as an older name an alias
 * holds, is not rewritten, so a key that proved an agent under an older name is still read through its alias.
 *
 * A throwaway office holds made-up agents, each with a drawing: a live legacy agent, a retired legacy agent and a
 * minted agent, and an alias of an older name of the minted one. Notes are written through the product's own writer,
 * each under a key that proved one of them, one under a key that proved the minted agent by its older name, and one
 * under the office's key, whose id no agents row answers. Each note's writer is another agent than the one its key
 * proved, because a page draws no proved-by words where the key proved the row's own writer. Both legacy agents write
 * notes, so the pages head rows by their ids. A map is staged and applied with the real command,
 * `npm run db:migrate -- --remint <file>`. The real export command, `npx tsx scripts/export.ts --to <dir> --no-commit`,
 * writes the snapshot taken before the re-mint and the store after it, each from a copy. Cases:
 *   1. the export of the store after has every page under revisions/ and changes/ that the snapshot's export has, and
 *      no other page there. Each page is cut at each run of the characters an id is made of, and has the same bytes but
 *      where a run is a legacy agent's old id and is the new id the map gives it. The pages of each kind head a row a
 *      legacy agent wrote by its old id before and by its new id after;
 *   2. those pages name each agent a key proved by its name, as they did before the re-mint, the retired one with its
 *      date and the one proved by its older name too, and the office's id stands where no agent answers;
 *   3. the export of the store after is of the re-minted registry: participants.md heads each legacy agent by the id the
 *      map gives it and no longer by its old id. So cases 1 and 2 compare two different registries.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-keeps-the-exports-history-pages.test.ts
 * After a green control, copy src/server/lib/export.ts and src/server/db/remint-history.ts, then make one of these
 * changes:
 *   1. in export.ts, delete the line `for (const alias of aliases) {` and the three lines after it: case 2 goes red;
 *   2. in export.ts, put `agentsById.get(alias.aliasId)` in place of `agentsById.get(alias.canonicalId)`: case 2 goes
 *      red;
 *   3. in remint-history.ts, put `return` as the first line of the arrow `update` in rewriteTheHistory: the pass writes
 *      no row, a revision page still heads its row by the old id, and case 1 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name, note and picture here is made up, in a throwaway office. Each command is given only PATH, LANG, a
 * made-up home in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AVATAR_ASSET_KIND, GENERATED_AVATAR_LICENCE, GENERATED_AVATAR_MIME, defaultAvatarAssetId } from '../src/shared/participants.ts'
import { readTheStagedRemint } from '../src/server/db/remint-migration.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))

// THE MADE-UP AGENTS. A legacy id could be a handle; a minted one is 12 of the mint's characters, one a handle may not hold.
const LEGACY = 'legacy-heron'
const LEGACY_RETIRED = 'legacy-egret'
const MINTED = 'MintedHold_1'
/** An older name of the minted agent, which a permanent alias holds. */
const AN_OLDER_NAME = 'older-minted-hold'
const RETIRED_AT = '2026-10-01 08:00:00'
const NAME: Readonly<Record<string, string>> = { [LEGACY]: 'Made-up Heron', [LEGACY_RETIRED]: 'Made-up Egret', [MINTED]: 'Made-up Minted Holder' }
const WHEN = '2026-10-31 03:00:00'

let t: TestDb
/** What the export wrote, by path, for the snapshot and for the store after. */
let before: Map<string, string>
let after: Map<string, string>
/** The id the map gives each agent. */
let newIdOf: (agent: string) => string
/** The new id the map gives each legacy agent, by its old id. */
let theNewIds: ReadonlyMap<string, string>

beforeAll(async () => {
  t = await freshDb()
  aMadeUpOfficeOfHolders(t)
  // One migration with no map, so the store is as a migrated office leaves it, and the re-mint's run has nothing else to write.
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  const at = join(folder(), 'remint')
  mkdirSync(at)
  const [store, snapshot, map] = [join(at, 'office.db'), join(at, 'snapshot.db'), join(at, 'map.json')]
  t.client.sqlite.prepare('VACUUM INTO ?').run(store)
  const staged = theCommand(store, '--stage-remint', map)
  expect(staged.status, staged.stderr).toBe(0)
  copyFileSync(store, snapshot)
  const applied = theCommand(store, '--remint', map)
  expect(applied.status, applied.stderr).toBe(0)
  const entries = readTheStagedRemint(map).map.entries
  newIdOf = (agent) => entries.find((entry) => entry.oldId === agent)!.newId
  theNewIds = new Map(entries.filter((entry) => entry.from === 'legacy').map((entry) => [entry.oldId, entry.newId]))
  before = theExportOf(snapshot, join(at, 'export-before'))
  after = theExportOf(store, join(at, 'export-after'))
}, 240_000)
afterAll(() => t?.close())

const folder = () => dirname(t.file)

function aMadeUpOfficeOfHolders(test: TestDb): void {
  const s = test.client.sqlite
  const anAsset = s.prepare('INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const anAgent = s.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired, retired_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const id of [LEGACY, LEGACY_RETIRED, MINTED]) {
    const asset = defaultAvatarAssetId({ kind: 'agent', id })
    anAsset.run(asset, AVATAR_ASSET_KIND, 'default', null, GENERATED_AVATAR_MIME, null, WHEN, null, null, GENERATED_AVATAR_LICENCE)
    const retired = id === LEGACY_RETIRED
    anAgent.run(id, NAME[id], id.toLowerCase().replaceAll('_', '-'), asset, WHEN, retired ? 1 : 0, retired ? RETIRED_AT : null)
  }
  s.prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', ?, ?)").run(AN_OLDER_NAME, MINTED)
  // ONE NOTE FOR EACH HOLDER A KEY PROVED, written as a keyed request writes it: the change row and the revision row
  // carry who the key proved beside the actor, in one transaction. Each writer is another agent than the holder.
  const aNote = (agent: string, holder: { id: string; how: 'an-agent-key' | 'the-office-key' }) =>
    test.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: `A made-up note written under a key that proved ${holder.id}`,
      data: { body: 'Made-up words.' },
      actor: { type: 'agent', id: agent, provedHolder: { ...holder, claimed: 'a-made-up-name' } },
    })
  aNote(LEGACY_RETIRED, { id: LEGACY, how: 'an-agent-key' })
  aNote(LEGACY, { id: LEGACY_RETIRED, how: 'an-agent-key' })
  aNote(LEGACY, { id: MINTED, how: 'an-agent-key' })
  aNote(LEGACY, { id: AN_OLDER_NAME, how: 'an-agent-key' })
  aNote(MINTED, { id: 'the-office', how: 'the-office-key' })
}

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}
function ran(args: string[], database: string): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const it = spawnSync(process.execPath, ['--import', 'tsx', ...args], { cwd: REPO, env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database }, encoding: 'utf8' })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stdout: it.stdout, stderr: it.stderr }
}
/** THE REAL COMMAND, `npm run db:migrate -- <args>`, on `database`. */
const theCommand = (database: string, ...args: string[]) => ran(['src/server/db/migrate.ts', ...args], database)

/** Every file the real export command writes from a copy of `database` into `to`, by its path under `to`. */
function theExportOf(database: string, to: string): Map<string, string> {
  const copy = `${to}.db`
  copyFileSync(database, copy)
  const exported = ran(['scripts/export.ts', '--to', to, '--no-commit'], copy)
  expect(exported.status, exported.stdout + exported.stderr).toBe(0)
  const files = new Map<string, string>()
  for (const entry of readdirSync(to, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files.set(relative(to, path), readFileSync(path, 'utf8'))
  }
  return files
}

/** The pages of one export under revisions/ and changes/, by path. */
const theHistoryPagesOf = (files: Map<string, string>) =>
  Object.fromEntries([...files].filter(([path]) => path.startsWith('revisions/') || path.startsWith('changes/')).sort(([a], [b]) => a.localeCompare(b)))

/** A page cut at each run of the characters an id is made of: the runs are at the odd places, and what lies between them at the even ones. */
const theRunsOf = (page: string) => page.split(/([A-Za-z0-9_-]+)/)

/** Each place where `now` differs from `was` other than by a legacy agent's old id becoming the new id the map gives it, in words. */
function whereItDiffersOtherwise(path: string, was: string, now: string): string[] {
  const [a, b] = [theRunsOf(was), theRunsOf(now)]
  if (a.length !== b.length) return [`${path}: ${String(a.length)} parts before and ${String(b.length)} after`]
  return a.flatMap((part, i) => (part === b[i] || (i % 2 === 1 && theNewIds.get(part) === b[i]) ? [] : [`${path}: ${JSON.stringify(part)} became ${JSON.stringify(b[i])}`]))
}

describe('an export of the store after the re-mint', () => {
  it('1. has every revision page and change-log page of the snapshot, and no other, each with the same bytes but where it named a legacy agent by its old id', () => {
    const was = theHistoryPagesOf(before)
    const now = theHistoryPagesOf(after)
    expect(Object.keys(was).filter((path) => path.startsWith('revisions/')).length, 'a revision page for each note').toBeGreaterThanOrEqual(5)
    expect(Object.keys(was).some((path) => path.startsWith('changes/')), 'a change-log page').toBe(true)
    expect(Object.keys(now)).toEqual(Object.keys(was))
    expect(Object.entries(was).flatMap(([path, page]) => whereItDiffersOtherwise(path, page, now[path] ?? ''))).toEqual([])
    for (const region of ['revisions/', 'changes/']) {
      const pages = (files: Record<string, string>) => Object.entries(files).filter(([path]) => path.startsWith(region)).map(([, page]) => page).join('\n')
      for (const agent of [LEGACY, LEGACY_RETIRED]) {
        expect(pages(was), `${region} before`).toContain(`agent:${agent}`)
        expect(pages(now), `${region} after`).toContain(`agent:${newIdOf(agent)}`)
        expect(pages(now), `${region} after`).not.toContain(`agent:${agent}`)
      }
    }
  })

  it('2. names on those pages each agent a key proved, as before the re-mint, by its id or an older name, and the office by its id', () => {
    for (const [name, files] of [['before', before], ['after', after]] as const) {
      const pages = Object.values(theHistoryPagesOf(files)).join('\n')
      expect(pages, name).toContain(`proved by ${NAME[LEGACY]}`)
      expect(pages, name).toContain(`proved by ${NAME[LEGACY_RETIRED]} (retired ${RETIRED_AT})`)
      expect(pages, name).toContain(`proved by ${NAME[MINTED]}`)
      expect(pages, name).toContain('proved by the-office')
      for (const id of [LEGACY, LEGACY_RETIRED, MINTED, AN_OLDER_NAME]) expect(pages, `${name}: an agent named by its id`).not.toContain(`proved by ${id}`)
    }
  })

  it('3. is of the re-minted registry: participants.md heads each legacy agent by its new id', () => {
    for (const agent of [LEGACY, LEGACY_RETIRED]) {
      expect(newIdOf(agent), 'the map gives the legacy agent a new id').not.toBe(agent)
      expect(before.get('participants.md'), 'before').toContain(`### ${agent} — ${NAME[agent]}`)
      expect(after.get('participants.md'), 'after').toContain(`### ${newIdOf(agent)} — ${NAME[agent]}`)
      expect(after.get('participants.md'), 'after').not.toContain(`### ${agent} — `)
    }
  })
})
