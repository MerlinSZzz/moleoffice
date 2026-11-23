// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EXPORT OF THE STORE AFTER THE RE-MINT IS VERIFIED BEFORE THE MIRROR TAKES IT. Wave 13s round 171, item 2.
 *
 * tools/verify-the-export.mjs runs the four checks of src/server/db/export-verification.ts as a closed stable upgrade's
 * verifier, under the contract of tools/stable/closed-upgrade-verification.mjs, as they were written:
 *   history-pages   every page under revisions/ and changes/ in mirror-before/ is in export-1/ with the same bytes, but
 *                   where a run of the characters an id is made of is a legacy agent's old id and is the new id the map
 *                   gives it, or is an old hash and is the new hash a kept pair of the store after gives it;
 *   participants    participants.md heads each agent by the id the map gives it;
 *   aliases         the export carries every alias of the store after, and no other;
 *   second-export   export-2/ holds the same files as export-1/, with the same bytes.
 * Its root holds the three folders and nothing else. Here a throwaway office holds made-up agents, a live legacy one, a
 * retired legacy one and a minted one, each with a note written under a key that proved it. The live legacy agent gives
 * its note a short form, whose stamp names it by its old id. A map is staged and applied with the real command,
 * `npm run db:migrate -- --remint <file>`, whose history pass rewrites each old id in the history. mirror-before/ is the
 * real export of the snapshot taken before the re-mint, with a made-up `.git` file as a git worktree has; export-1/ and
 * export-2/ are each the real export command, `npx tsx scripts/export.ts --to <folder> --no-commit`, on a copy of the
 * store after. Cases:
 *   1. on a sound re-mint every check passes, the result is a new private file the contract accepts, and the store
 *      after, the root and every file under it are as they were. No database is opened but the request's. The pass
 *      changed the short form's revision, so its page in mirror-before/ holds the old content hash where export-1/'s
 *      holds the new one;
 *   2. a page of mirror-before/ that export-1/ holds with other bytes, one it does not hold, and one where export-1/ and
 *      export-2/ name a legacy agent's writer by another legacy agent's new id, fail history-pages alone, and each is
 *      named by its path under the root;
 *   3. participants.md as it was before the re-mint, in both exports, fails participants alone, naming each legacy
 *      agent's old id and the new id the map gives it;
 *   4. an alias of the store after left out of both exports, and a made-up alias put in both, fail aliases alone, and
 *      each alias is named;
 *   5. export-2/ with one file changed, one missing and one added fails second-export alone, and each is named by path;
 *   6. each of these is refused with exit 2, and nothing is written: the recovery phase; a root named by a relative
 *      path; a root that is a link; one of the three folders that is a link; a link inside a folder; a folder missing;
 *      a fourth thing in the root; a request that does not name the four checks, or names one it does not know; a
 *      result file that is there; and a map that is not a staged map;
 *   7. at a limit of 1 ms every check is false, and its line says it was not run;
 *   8. given a heap of HEAP_MB, smaller than each of three trees that hold made-up pages beside the export, it ends 0
 *      with the verdict it gives on the small root, and its peak resident memory is at most its peak on the small root
 *      plus the bytes of one tree. With one page of export-2 changed and its size kept, it gives the verdict it gives
 *      today, and names that page alone. Wave 13s round 281.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-export-after-the-remint-is-verified.test.ts
 * After a green control, copy src/server/db/export-verification.ts and tools/verify-the-export.mjs, then make one of
 * these changes:
 *   1. in export-verification.ts, put `null` in place of
 *      `theFirstDifference(before.toString('utf8'), staged.toString('utf8'), mayBecome)`: a page with other bytes is not
 *      named, and case 2 goes red;
 *   2. in export-verification.ts, put `entry.oldId` in place of `entry.newId` in `const expected`: participants then
 *      fails wherever the exports are of the store after, so cases 1 to 5 go red;
 *   3. in export-verification.ts, delete the line `for (const [at, alias] of carried) if (!held.has(at))`: an alias the
 *      store does not hold is not named, and case 4 goes red;
 *   4. in export-verification.ts, delete the line `for (const path of second.files.keys()) if (!first.files.has(path))`:
 *      a file only in export-2/ is not named, and case 5 goes red;
 *   5. in export-verification.ts, put `continue` in place of the `throw` on theTreeOf's line that refuses a link: a link
 *      inside a folder is passed over, and case 6 goes red;
 *   6. in export-verification.ts, put `from './../lib/export.ts'` in place of `from '../lib/export-grammar.ts'`: the
 *      checks open the database client, so case 1 goes red, and case 6 too, because the settings that client reads print
 *      a line before each refusal;
 *   7. in verify-the-export.mjs, delete the line `if (request.phase === 'recovery') refuse(`: case 6 goes red;
 *   8. in verify-the-export.mjs, put `false` in place of `over()` in `if (over()) outcome`: case 7 goes red;
 *   9. in export-verification.ts, put `new Map<string, Set<string>>()` in place of `whatEachRunMayBecome(remint, after())`:
 *      no id or hash may change, so history-pages fails on a sound re-mint, and cases 1 to 5 go red;
 *  10. in export-verification.ts, in whatEachRunMayBecome, delete the line that adds each kept pair: the short form's
 *      page, whose content hash the pass changed, is named, and cases 1 to 5 go red;
 *  11. in export-verification.ts, put `mayBecome.has(before)` in place of `mayBecome.get(before)?.has(after) === true`:
 *      an old id may become any other run, and case 2 goes red;
 *  12. in export-verification.ts, have `theTreeOf` read each file's bytes as it lists it, and keep them in a map the
 *      tree holds: the verifier holds every tree whole, and case 8 goes red.
 * Restore each file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name, note, page and alias here is made up, in a throwaway office. Each command is given only PATH, LANG, a
 * made-up home in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readClosedVerificationResult } from '../tools/stable/closed-upgrade-verification.mjs'
import { AVATAR_ASSET_KIND, GENERATED_AVATAR_LICENCE, GENERATED_AVATAR_MIME, defaultAvatarAssetId } from '../src/shared/participants.ts'
import { THE_KEPT_LISTS, readTheStagedRemint } from '../src/server/db/remint-migration.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const VERIFIER = join(REPO, 'tools', 'verify-the-export.mjs')
const CHECKS = ['history-pages', 'participants', 'aliases', 'second-export']
/** The heap the verifier is given in case 8, in MiB. Each tree there is larger. */
const HEAP_MB = 192
/** How many made-up pages case 8 puts in each tree, and the bytes of each. */
const PAGES = 320
const PAGE_BYTES = 1024 * 1024

// THE MADE-UP AGENTS. A legacy id could be a handle; a minted one is 12 of the mint's characters, one a handle may not hold.
const LEGACY = 'legacy-heron'
const LEGACY_RETIRED = 'legacy-egret'
const MINTED = 'MintedHold_1'
const NAME: Readonly<Record<string, string>> = { [LEGACY]: 'Made-up Heron', [LEGACY_RETIRED]: 'Made-up Egret', [MINTED]: 'Made-up Minted Holder' }
const WHEN = '2026-10-31 03:00:00'

let t: TestDb
/** The snapshot, the store after, the staged map, and the three folders the step hands the verifier. */
let base: { snapshot: string; after: string; map: string; mirrorBefore: string; first: string; second: string }
/** The id the map gives each agent. */
let newIdOf: (agent: string) => string
/** Each holder's note, by the holder. */
const notes: Record<string, string> = {}
/** The content hash of the short form's revision in the snapshot and in the store after, and the kept pair for it. */
let theShortForm: { old: string; new: string; kept: unknown }

beforeAll(async () => {
  t = await freshDb()
  await aMadeUpOfficeOfHolders(t)
  // One migration with no map, so the store is as a migrated office leaves it, and the re-mint's run has nothing else to write.
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  const at = join(folder(), 'base')
  mkdirSync(at)
  const [after, snapshot, map] = [join(at, 'office.db'), join(at, 'snapshot.db'), join(at, 'map.json')]
  t.client.sqlite.prepare('VACUUM INTO ?').run(after)
  const staged = theCommand(after, '--stage-remint', map)
  expect(staged.status, staged.stderr).toBe(0)
  copyFileSync(after, snapshot)
  const applied = theCommand(after, '--remint', map)
  expect(applied.status, applied.stderr).toBe(0)
  const entries = readTheStagedRemint(map).map.entries
  newIdOf = (agent) => entries.find((entry) => entry.oldId === agent)!.newId
  const [mirrorBefore, first, second] = [join(at, 'mirror-before'), join(at, 'export-1'), join(at, 'export-2')]
  theExportOf(snapshot, mirrorBefore)
  // A git worktree holds a `.git` file at its top, and the mirror's last commit is checked out as one.
  writeFileSync(join(mirrorBefore, '.git'), 'gitdir: /made-up/mirror/.git/worktrees/mirror-before\n')
  theExportOf(after, first)
  theExportOf(after, second)
  base = { snapshot, after, map, mirrorBefore, first, second }
  // Read from the copies each export was made from, so that no test opens the files the verifier is handed.
  const theShortFormsHash = (copy: string) => readOnly(copy, (s) => s.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = 2').pluck().get(notes[LEGACY]) as string)
  theShortForm = {
    old: theShortFormsHash(`${mirrorBefore}.db`),
    new: theShortFormsHash(`${first}.db`),
    kept: readOnly(`${first}.db`, (s) => s.prepare(`SELECT old, new FROM "${THE_KEPT_LISTS}" WHERE list = 'content_hash' AND record_id = ? AND seq = 2`).all(notes[LEGACY])),
  }
}, 240_000)
afterAll(() => t?.close())

const folder = () => dirname(t.file)

function readOnly<T>(file: string, read: (s: Database.Database) => T): T {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return read(s)
  } finally {
    s.close()
  }
}

async function aMadeUpOfficeOfHolders(test: TestDb): Promise<void> {
  const { writeShortForms } = await import('../src/server/lib/zoom.ts')
  const s = test.client.sqlite
  const anAsset = s.prepare('INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const anAgent = s.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired, retired_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const id of [LEGACY, LEGACY_RETIRED, MINTED]) {
    const asset = defaultAvatarAssetId({ kind: 'agent', id })
    anAsset.run(asset, AVATAR_ASSET_KIND, 'default', null, GENERATED_AVATAR_MIME, null, WHEN, null, null, GENERATED_AVATAR_LICENCE)
    const retired = id === LEGACY_RETIRED
    anAgent.run(id, NAME[id], id.toLowerCase().replaceAll('_', '-'), asset, WHEN, retired ? 1 : 0, retired ? '2026-10-01 08:00:00' : null)
  }
  // ONE NOTE FOR EACH HOLDER A KEY PROVED, written as a keyed request writes it, so the export has revision and change pages.
  const by = (agent: string) => ({ type: 'agent' as const, id: agent, provedHolder: { id: agent, how: 'an-agent-key' as const, claimed: 'a-made-up-name' } })
  for (const agent of [LEGACY, LEGACY_RETIRED, MINTED]) {
    notes[agent] = test.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: `A made-up note written under a key that proved ${agent}`,
      data: { body: 'Made-up words.' },
      actor: by(agent),
    }).id
  }
  // THE SHORT FORM, the note's second revision, whose stamp names its writer by the old id.
  const first = s.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = 1').pluck().get(notes[LEGACY]) as string
  writeShortForms(notes[LEGACY]!, 'default', { madeFrom: { seq: 1, contentHash: first }, forms: { label: 'Made-up heron label' } }, by(LEGACY))
}

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}
/** A command with only PATH, LANG, a made-up home and MOLE_OFFICE_DB in its environment. */
function ran(args: string[], database: string): Ran {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const it = spawnSync(process.execPath, args, { cwd: REPO, env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database }, encoding: 'utf8' })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stdout: it.stdout, stderr: it.stderr }
}
/** THE REAL COMMAND, `npm run db:migrate -- <args>`, on `database`. */
const theCommand = (database: string, ...args: string[]) => ran(['--import', 'tsx', 'src/server/db/migrate.ts', ...args], database)

/** THE REAL EXPORT COMMAND on a copy of `database`, into `to`. */
function theExportOf(database: string, to: string): void {
  const copy = `${to}.db`
  copyFileSync(database, copy)
  const exported = ran(['--import', 'tsx', 'scripts/export.ts', '--to', to, '--no-commit'], copy)
  expect(exported.status, exported.stdout + exported.stderr).toBe(0)
}

/** The journal, log and shared-memory files beside a database. */
const theFilesBeside = (file: string) => ['-journal', '-wal', '-shm'].filter((suffix) => existsSync(file + suffix))
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

/** Every entry under a folder, by its path, with a file's SHA-256 and every entry's mode. */
function theTreeOf(root: string): Record<string, string> {
  const tree: Record<string, string> = {}
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name)
    const mode = (statSync(path).mode & 0o7777).toString(8)
    tree[relative(root, path)] = entry.isFile() ? `${mode} ${sha256(path)}` : entry.isDirectory() ? `${mode} folder` : `${mode} other`
  }
  return tree
}

/** A case of its own: a private root holding copies of the three folders, and the request and result beside it. */
let cases = 0
interface ACase {
  at: string
  root: string
  mirrorBefore: string
  first: string
  second: string
}
function aCase(): ACase {
  const at = join(folder(), `case-${String(++cases)}`)
  const root = join(at, 'root')
  mkdirSync(root, { recursive: true })
  chmodSync(root, 0o700)
  const [mirrorBefore, first, second] = [join(root, 'mirror-before'), join(root, 'export-1'), join(root, 'export-2')]
  cpSync(base.mirrorBefore, mirrorBefore, { recursive: true })
  cpSync(base.first, first, { recursive: true })
  cpSync(base.second, second, { recursive: true })
  return { at, root, mirrorBefore, first, second }
}

const COMMIT = 'a'.repeat(40)
const STATE = 'b'.repeat(64)
interface Verified extends Ran {
  request: Record<string, unknown>
  result: string
  /** The file MOLE_OFFICE_DB names, which nothing should open. */
  untouched: string
}
interface Asked {
  phase?: 'target' | 'recovery'
  over?: Record<string, unknown>
  within?: string
  root?: string
  map?: string
  /** What node is given before the verifier. */
  node?: string[]
}
/** THE VERIFIER on one request for one case, from the checkout, with MOLE_OFFICE_DB naming a file nothing makes. */
function verified(c: ACase, asked: Asked = {}): Verified {
  const n = readdirSync(c.at).filter((name) => name.startsWith('request-')).length + 1
  const [requestFile, result] = [join(c.at, `request-${String(n)}.json`), join(c.at, `result-${String(n)}.json`)]
  const request = { version: 1, phase: asked.phase ?? 'target', commit: COMMIT, repository: REPO, database: base.after, snapshot: base.snapshot, servicePort: 1, checks: CHECKS, stateSha256: STATE, ...asked.over }
  writeFileSync(requestFile, JSON.stringify(request))
  const untouched = join(c.at, `no-database-${String(n)}.db`)
  const it = ran([...(asked.node ?? []), VERIFIER, '--within', asked.within ?? '60000', '--map', asked.map ?? base.map, '--root', asked.root ?? c.root, requestFile, result], untouched)
  return { ...it, request, result, untouched }
}

/** Each check's word on its own line, by the check's name. */
function theLinesOf(out: string): Record<string, string> {
  return Object.fromEntries(CHECKS.map((name) => [name, out.split('\n').find((line) => line.startsWith(`${name}: `))?.split(' ')[1] ?? 'absent']))
}
const onlyThisFails = (name: string) => Object.fromEntries(CHECKS.map((check) => [check, check === name ? 'FAILED' : 'passed']))
/** The lines that name a difference, each under its check's line. */
const theDifferences = (out: string) => out.split('\n').filter((line) => line.startsWith('  '))
const theResultOf = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as { checks: Record<string, boolean> }

/**
 * A TEST STAND-IN, loaded before the verifier: as the process ends, it writes the most memory the process held at once,
 * in bytes, into the file `to`.
 */
function aPeakWriter(to: string): string {
  const at = `${to}.mjs`
  writeFileSync(at, [
    "import { writeFileSync } from 'node:fs'",
    `process.on('exit', () => writeFileSync(${JSON.stringify(to)}, String(process.resourceUsage().maxRSS * 1024)))`,
  ].join('\n'))
  return pathToFileURL(at).href
}
const thePeakIn = (file: string) => Number(readFileSync(file, 'utf8'))

/** A made-up page of PAGE_BYTES bytes, which no export wrote. */
function aMadeUpPage(n: number): string {
  const line = `Made-up words of page ${String(n)}, for a verifier measured against its heap; nothing here is real.\n`
  return `# A made-up page ${String(n)}\n\n${line.repeat(Math.ceil(PAGE_BYTES / line.length))}`.slice(0, PAGE_BYTES)
}

/** The bytes of every file under a folder. */
const theBytesUnder = (folder: string) =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0)

/** The text of one file of an export, changed in place. */
function changed(file: string, change: (text: string) => string): void {
  const before = readFileSync(file, 'utf8')
  const after = change(before)
  expect(after, `${file} is changed`).not.toBe(before)
  writeFileSync(file, after)
}

describe('the export of the store after the re-mint', () => {
  it('1. passes every check on a sound re-mint, writes the contract\'s result, and changes nothing', () => {
    const c = aCase()
    const [store, tree] = [sha256(base.after), theTreeOf(c.root)]
    const run = verified(c)
    expect(run.status, run.stdout + run.stderr).toBe(0)
    expect(theLinesOf(run.stdout)).toEqual(onlyThisFails('none'))
    expect(theDifferences(run.stdout)).toEqual([])
    expect(run.stdout).toMatch(/^verify-the-export: 4 of 4 checks passed\.$/m)
    expect(statSync(run.result).mode & 0o777).toBe(0o600)
    expect(readClosedVerificationResult(run.result, run.request)).toEqual({ version: 1, phase: 'target', commit: COMMIT, stateSha256: STATE, checks: Object.fromEntries(CHECKS.map((name) => [name, true])) })
    expect(sha256(base.after), 'the store after').toBe(store)
    expect(theFilesBeside(base.after)).toEqual([])
    expect(theTreeOf(c.root), 'the root and every file under it').toEqual(tree)
    expect(existsSync(run.untouched), 'no database but the request\'s is opened').toBe(false)
    // The pass made the short form's revision again, so the page held the old content hash and export-1's holds the new one.
    expect(theShortForm.new, "the short form's content hash").not.toBe(theShortForm.old)
    expect(theShortForm.kept, 'its kept pair').toEqual([{ old: theShortForm.old, new: theShortForm.new }])
    const page = `revisions/${notes[LEGACY]!}/2.md`
    const [was, now] = [readFileSync(join(c.mirrorBefore, page), 'utf8'), readFileSync(join(c.first, page), 'utf8')]
    expect(was).toContain(theShortForm.old)
    expect(was).not.toContain(theShortForm.new)
    expect(now).toContain(theShortForm.new)
    expect(now).not.toContain(theShortForm.old)
  })

  it('2. fails history-pages alone where mirror-before has a page export-1 holds with other bytes, one it does not hold, or one whose writer it names by another agent', () => {
    const c = aCase()
    const revision = `revisions/${notes[MINTED]!}/1.md`
    changed(join(c.mirrorBefore, revision), (text) => `${text}A made-up line the export never wrote.\n`)
    mkdirSync(join(c.mirrorBefore, 'changes'), { recursive: true })
    writeFileSync(join(c.mirrorBefore, 'changes', '2026-01-02.md'), '# A made-up change-log page\n')
    // An old id may become only the new id the map gives it, so a writer named by another legacy agent's new id is a difference.
    const another = `revisions/${notes[LEGACY_RETIRED]!}/1.md`
    for (const exported of [c.first, c.second]) changed(join(exported, another), (text) => text.replaceAll(`agent:${newIdOf(LEGACY_RETIRED)}`, `agent:${newIdOf(LEGACY)}`))
    const run = verified(c)
    expect(run.status, run.stdout + run.stderr).toBe(1)
    expect(theLinesOf(run.stdout)).toEqual(onlyThisFails('history-pages'))
    const named = theDifferences(run.stdout)
    expect(named.some((line) => line.startsWith(`  mirror-before/${revision}: `))).toBe(true)
    expect(named.some((line) => line.startsWith('  mirror-before/changes/2026-01-02.md: '))).toBe(true)
    expect(named.some((line) => line.startsWith(`  mirror-before/${another}: `))).toBe(true)
    expect(named).toHaveLength(3)
    expect(theResultOf(run.result).checks).toEqual(Object.fromEntries(CHECKS.map((name) => [name, name !== 'history-pages'])))
  })

  it('3. fails participants alone where both exports head each legacy agent by its old id', () => {
    const c = aCase()
    for (const exported of [c.first, c.second]) copyFileSync(join(c.mirrorBefore, 'participants.md'), join(exported, 'participants.md'))
    const run = verified(c)
    expect(run.status, run.stdout + run.stderr).toBe(1)
    expect(theLinesOf(run.stdout)).toEqual(onlyThisFails('participants'))
    const named = theDifferences(run.stdout).join('\n')
    for (const agent of [LEGACY, LEGACY_RETIRED]) {
      expect(named).toContain(`"${agent}"`)
      expect(named).toContain(`"${newIdOf(agent)}"`)
    }
    expect(named).not.toContain(`"${MINTED}"`)
    for (const line of theDifferences(run.stdout)) expect(line.startsWith('  export-1/participants.md')).toBe(true)
  })

  it('4. fails aliases alone where both exports leave out an alias of the store after and carry one it does not hold', () => {
    const c = aCase()
    const madeUp = ['```mole-office registry_aliases', 'namespace: "agent-registry"', 'aliasId: "made-up-gone"', `canonicalId: ${JSON.stringify(newIdOf(LEGACY))}`, '```', ''].join('\n')
    for (const exported of [c.first, c.second]) {
      changed(join(exported, 'schema-parts', 'registry_aliases.md'), (text) => {
        const block = new RegExp('```mole-office registry_aliases\\nnamespace: "agent-registry"\\naliasId: "legacy-egret"\\n[^`]*```\\n')
        expect(text).toMatch(block)
        return `${text.replace(block, '')}\n${madeUp}`
      })
    }
    const run = verified(c)
    expect(run.status, run.stdout + run.stderr).toBe(1)
    expect(theLinesOf(run.stdout)).toEqual(onlyThisFails('aliases'))
    const named = theDifferences(run.stdout)
    expect(named.filter((line) => line.includes('"legacy-egret"'))).toHaveLength(1)
    expect(named.filter((line) => line.includes('"made-up-gone"'))).toHaveLength(1)
    expect(named).toHaveLength(2)
  })

  it('5. fails second-export alone where export-2 has a file changed, one missing and one added', () => {
    const c = aCase()
    changed(join(c.second, 'README.md'), (text) => `${text}A made-up line.\n`)
    rmSync(join(c.second, 'INDEX.md'))
    writeFileSync(join(c.second, 'a-made-up-page.md'), '# A made-up page\n')
    const run = verified(c)
    expect(run.status, run.stdout + run.stderr).toBe(1)
    expect(theLinesOf(run.stdout)).toEqual(onlyThisFails('second-export'))
    const named = theDifferences(run.stdout)
    expect(named.some((line) => line.startsWith('  export-2/README.md: '))).toBe(true)
    expect(named.some((line) => line.startsWith('  export-1/INDEX.md: '))).toBe(true)
    expect(named.some((line) => line.startsWith('  export-2/a-made-up-page.md: '))).toBe(true)
    expect(named).toHaveLength(3)
  })

  it('6. refuses with exit 2, and writes nothing, what it cannot compare', () => {
    const refusals: [string, (c: ACase) => Asked][] = [
      ['the recovery phase', () => ({ phase: 'recovery' })],
      ['a root named by a relative path', (c) => ({ root: relative(REPO, c.root) })],
      ['a root that is a link', (c) => {
        const link = join(c.at, 'a-link-to-the-root')
        symlinkSync(c.root, link)
        return { root: link }
      }],
      ['a folder that is a link', (c) => {
        renameSync(c.first, join(c.at, 'export-1'))
        symlinkSync(join(c.at, 'export-1'), c.first)
        return {}
      }],
      ['a link inside a folder', (c) => {
        symlinkSync(join(c.second, 'README.md'), join(c.first, 'revisions', 'a-made-up-link.md'))
        return {}
      }],
      ['a folder missing', (c) => {
        rmSync(c.second, { recursive: true })
        return {}
      }],
      ['a fourth thing in the root', (c) => {
        writeFileSync(join(c.root, 'a-made-up-note.txt'), 'Made-up words.\n')
        return {}
      }],
      ['three of the four checks', () => ({ over: { checks: CHECKS.slice(1) } })],
      ['a check it does not know', () => ({ over: { checks: [...CHECKS, 'a-made-up-check'] } })],
      ['a result file that is there', () => ({})],
      ['a map that is not a staged map', (c) => {
        writeFileSync(join(c.at, 'not-a-map.json'), '{"made-up": true}\n')
        return { map: join(c.at, 'not-a-map.json') }
      }],
    ]
    for (const [what, make] of refusals) {
      const c = aCase()
      const asked = make(c)
      if (what === 'a result file that is there') writeFileSync(join(c.at, 'result-1.json'), '{}\n')
      const run = verified(c, asked)
      expect(run.status, `${what}: ${run.stdout}${run.stderr}`).toBe(2)
      expect(run.stderr, what).toMatch(/^verify-the-export: refused\. /)
      expect(theLinesOf(run.stdout), what).toEqual(Object.fromEntries(CHECKS.map((name) => [name, 'absent'])))
      if (what !== 'a result file that is there') expect(existsSync(run.result), `${what}: no result`).toBe(false)
      else expect(readFileSync(run.result, 'utf8'), what).toBe('{}\n')
    }
  })

  it('7. at a limit of 1 ms holds every check false, and runs none', () => {
    const c = aCase()
    const run = verified(c, { within: '1' })
    expect(run.status, run.stdout + run.stderr).toBe(1)
    expect(theLinesOf(run.stdout)).toEqual(Object.fromEntries(CHECKS.map((name) => [name, 'FAILED'])))
    for (const name of CHECKS) expect(run.stdout).toMatch(new RegExp(`^${name}: FAILED in [0-9]+ ms\\. Not run: the verifier's limit of 1 ms was reached before it started\\.$`, 'm'))
    expect(theResultOf(run.result).checks).toEqual(Object.fromEntries(CHECKS.map((name) => [name, false])))
  })

  it(`8. given a heap of ${String(HEAP_MB)} MiB, smaller than each tree, gives the verdicts it gives on a small root, and holds no tree whole`, () => {
    // THE HEAP FLAG ALONE CANNOT FAIL A VERIFIER THAT READS EVERY TREE WHOLE. The verifier of round 171 held each file as
    // a Buffer, and a Buffer's bytes are kept outside the V8 heap, which is all that --max-old-space-size bounds. So it
    // passes under that flag with trees far larger than the heap. Its peak resident memory counts those bytes. So this
    // case compares that peak on the large root with the peak on a small root, which is the same export without the
    // made-up pages, plus the bytes of one tree. A verifier that holds the three trees cannot stay under that. One that
    // holds one file of each side at a time can.
    const heap = [`--max-old-space-size=${String(HEAP_MB)}`]
    const small = aCase()
    const onTheSmall = verified(small, { node: [...heap, '--import', aPeakWriter(join(small.at, 'peak'))] })
    expect(onTheSmall.status, onTheSmall.stdout + onTheSmall.stderr).toBe(0)
    const large = aCase()
    const page = (n: number) => `revisions/made-up-pages-larger-than-the-heap/${String(n)}.md`
    for (const tree of [large.mirrorBefore, large.first, large.second]) {
      mkdirSync(join(tree, 'revisions', 'made-up-pages-larger-than-the-heap'), { recursive: true })
      for (let n = 1; n <= PAGES; n++) writeFileSync(join(tree, page(n)), aMadeUpPage(n))
    }
    const oneTree = theBytesUnder(large.first)
    expect(oneTree).toBeGreaterThan(HEAP_MB * 1024 * 1024)
    const onTheLarge = verified(large, { within: '300000', node: [...heap, '--import', aPeakWriter(join(large.at, 'peak'))] })
    expect(onTheLarge.status, onTheLarge.stdout + onTheLarge.stderr).toBe(0)
    expect(theLinesOf(onTheLarge.stdout)).toEqual(theLinesOf(onTheSmall.stdout))
    expect(theLinesOf(onTheLarge.stdout)).toEqual(onlyThisFails('none'))
    expect(theDifferences(onTheLarge.stdout)).toEqual([])
    expect(theResultOf(onTheLarge.result).checks).toEqual(theResultOf(onTheSmall.result).checks)
    const [peakOnTheLarge, peakOnTheSmall] = [thePeakIn(join(large.at, 'peak')), thePeakIn(join(small.at, 'peak'))]
    expect(peakOnTheLarge, `${String(peakOnTheSmall)} bytes at most on the small root, and ${String(oneTree)} in one tree`).toBeLessThanOrEqual(peakOnTheSmall + oneTree)
    // ONE PAGE CHANGED IN THE MIDDLE, with its size kept, so only its bytes tell it from export-1's.
    const one = page(PAGES / 2)
    changed(join(large.second, one), (text) => {
      const at = text.length / 2
      return `${text.slice(0, at)}${text[at] === 'X' ? 'Y' : 'X'}${text.slice(at + 1)}`
    })
    const onTheChanged = verified(large, { within: '300000', node: heap })
    expect(onTheChanged.status, onTheChanged.stdout + onTheChanged.stderr).toBe(1)
    expect(theLinesOf(onTheChanged.stdout)).toEqual(onlyThisFails('second-export'))
    expect(theDifferences(onTheChanged.stdout)).toEqual([`  export-2/${one}: holds other bytes than export-1/${one}.`])
    expect(theResultOf(onTheChanged.result).checks).toEqual(Object.fromEntries(CHECKS.map((name) => [name, name !== 'second-export'])))
  }, 600_000)
})
