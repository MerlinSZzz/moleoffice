// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RED FIX IS CHECKED ON TOP OF THE REPLAY. Synthetic repositories, a stand-in office and a stand-in git exercise
 * the tools as separate processes. A red copy replays without stopping; its fix preserves every replayed message and
 * tree in order and changes at least one path on top. Earlier checked fixes are the base in both red and conflict mode.
 * Every fixture lives below one temporary folder, including each process's HOME, and is removed after the file runs.
 *
 * Before the code change every case is red except case 5's conflict copy. M1 covers case 2's stop; M2 its missing fix;
 * M3 its folded first tree (the last replayed tree is unchanged); M4 its empty fix; M5 cases 3 and 4; M6 case 1's exact
 * sorted, unique fixed paths; M7 case 5's aborted stop; M8 case 5's two options. The report records each separate run.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HOW_MUCH_A_RESOLUTION_CHECK_REPORTS, pinnedRefOf, resolvedRefOf } from '../src/shared/merge-queue'
import { giveTheCloneTheJoins } from '../tools/merge-tool/the-joins.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const CLEAN = join(REPO, 'tools/merge-tool/resolve-a-conflict.mjs')
const CHECK = join(REPO, 'tools/the-merger.mjs')
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()
const IDENTITY = { GIT_AUTHOR_NAME: 'Synthetic fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }
const FIRST = 'src/first.ts'
const SECOND = 'src/second.ts'
const LIST = 'src/shared/ops-list.ts'
const RED_TESTS = ['tests/synthetic-z.test.ts', 'tests/synthetic-a.test.ts']
const FIX = ['src/z-fix.ts', 'src/a-fix.ts']
const list = (...names: string[]) => `export const SYNTHETIC_OPS = [\n${names.map((name) => `  '${name}',\n`).join('')}] as const\n`
const line = (value: string) => `export const SYNTHETIC = '${value}'\n`
type Recorded = { path: string; hash: string | null; mode: string | null }
interface Entry {
  id: string; root: string; ancestor: string; commit: string; mainAt: string; into: string
  red?: { tests: string[] }; replays?: { ref: string; commit: string }; files: string[]
  resolution?: { commit: string; workingDirectory: string; mainAt: string; files: Recorded[]; by: { kind: string; id: string }; at: string; tests: { commit: string } }
  steps: unknown[]
}
let scratch: string
let office: Server
let api: string
let serial = 0
const entries = new Map<string, Entry>()
const groups = new Set<number>()
const workOf = (entry: Entry) => join(scratch, 'work', entry.id)
function git(dir: string, ...args: string[]): string {
  return execFileSync(REAL_GIT, ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: scratch }, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function write(dir: string, path: string, text: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}
function commit(dir: string, message: string, empty = false) {
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', ...(empty ? ['--allow-empty'] : []), '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}
function fixture(stops = false): Entry {
  const id = `syntheticRed${String(++serial)}`
  const root = join(scratch, id, 'root')
  mkdirSync(root, { recursive: true })
  git(root, 'init', '-q', '-b', 'main')
  write(root, '.gitignore', 'node_modules\n')
  for (const path of [FIRST, SECOND, ...RED_TESTS]) write(root, path, line('ancestor'))
  write(root, LIST, list('ancestor'))
  const ancestor = commit(root, 'Synthetic ancestor')
  git(root, 'switch', '-q', '-c', 'entry')
  write(root, FIRST, line('entry first'))
  write(root, LIST, list('ancestor', 'entry'))
  if (stops) write(root, RED_TESTS[0]!, line('entry test'))
  commit(root, 'Synthetic entry first')
  write(root, SECOND, line('entry second'))
  const pinned = commit(root, 'Synthetic entry second')
  git(root, 'switch', '-q', 'main')
  write(root, 'src/main.ts', line('main'))
  write(root, LIST, list('ancestor', 'main'))
  if (stops) write(root, RED_TESTS[0]!, line('main test'))
  const mainAt = commit(root, 'Synthetic main')
  git(root, 'update-ref', pinnedRefOf(id), pinned)
  const entry: Entry = { id, root, ancestor, commit: pinned, mainAt, into: join(scratch, id, 'copy'), red: { tests: [...RED_TESTS] }, files: [], steps: [] }
  entries.set(id, entry)
  return entry
}
function clean(entry: Entry, ...extra: string[]) {
  return spawnSync(process.execPath, [CLEAN, ...extra], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: scratch }, timeout: 120_000 })
}
function startWords(entry: Entry, into = entry.into, base = entry.replays) {
  return ['--entry', entry.id, '--repository', entry.root, '--ref', base?.ref ?? pinnedRefOf(entry.id), '--commit', base?.commit ?? entry.commit, '--main-at', entry.mainAt, '--into', into]
}
/** Build checker fixtures independently of the clean-copy CLI, so its refusal cannot hide a checker defect. */
function replay(entry: Entry, base = entry.replays?.commit ?? entry.commit, resolveStop = false) {
  git(entry.root, 'clone', '-q', '--no-checkout', entry.root, entry.into)
  git(entry.into, 'checkout', '-q', '--detach', base)
  giveTheCloneTheJoins(entry.into, (pair: string[]) => git(entry.into, 'config', ...pair))
  git(entry.into, 'config', 'core.editor', 'true')
  git(entry.into, 'config', 'rerere.enabled', 'false')
  const ran = spawnSync(REAL_GIT, ['-C', entry.into, 'rebase', '--quiet', entry.mainAt], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: scratch } })
  if (resolveStop) {
    expect(ran.status, ran.stderr).toBe(1)
    write(entry.into, RED_TESTS[0]!, line('main test') + line('entry test'))
    git(entry.into, 'add', '--', RED_TESTS[0]!)
    git(entry.into, 'rebase', '--continue')
  } else expect(ran.status, ran.stderr).toBe(0)
  return git(entry.into, 'rev-parse', 'HEAD')
}
function addFix(entry: Entry, paths = FIX) {
  for (const path of paths) write(entry.into, path, line('fixed'))
  return commit(entry.into, 'Synthetic fix')
}
function recorded(entry: Entry): Recorded[] {
  return git(entry.into, 'diff', '--no-renames', '--name-only', '-z', entry.mainAt, 'HEAD').split('\0').filter(Boolean).map((path) => {
    const row = git(entry.into, 'ls-tree', 'HEAD', '--', path)
    return row === '' ? { path, hash: null, mode: null } : {
      path, mode: row.split(' ')[0]!, hash: createHash('sha256').update(execFileSync(REAL_GIT, ['-C', entry.into, 'cat-file', 'blob', `HEAD:${path}`])).digest('hex'),
    }
  })
}
function handOver(entry: Entry) {
  const head = git(entry.into, 'rev-parse', 'HEAD')
  entry.resolution = { commit: head, workingDirectory: entry.into, mainAt: entry.mainAt, files: recorded(entry), by: { kind: 'agent', id: 'synthetic-fixture' }, at: new Date().toISOString(), tests: { commit: head } }
}
function ref(entry: Entry) {
  return spawnSync(REAL_GIT, ['-C', entry.root, 'rev-parse', '--verify', '-q', resolvedRefOf(entry.id)], { encoding: 'utf8' })
}
async function check(entry: Entry) {
  const bin = join(scratch, entry.id, 'bin')
  mkdirSync(bin, { recursive: true })
  const calls = join(scratch, entry.id, 'git.log')
  // All paths here are made by mkdtemp under tmpdir; no shell text comes from an entry or a person.
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\nexec '${REAL_GIT}' "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  const child = spawn(process.execPath, [CHECK, '--check-resolution', '--entry', entry.id, '--session', `synthetic-${entry.id}`, '--api', api, '--workspace', 'default', '--workdir', workOf(entry), '--office-for', '30', '--sandboxes', join(scratch, entry.id, 'sandboxes')], {
    cwd: REPO, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...IDENTITY, HOME: scratch, PATH: `${bin}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: join(scratch, 'no-office.db') },
  })
  groups.add(child.pid!)
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.stderr!.on('data', (chunk: Buffer) => { output += chunk.toString() })
  const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
  groups.delete(child.pid!)
  expect(code, output).toBe(0)
  expect(readFileSync(calls, 'utf8')).toContain('-c gc.auto=0')
}
async function refused(entry: Entry, says: string | (() => string)) {
  handOver(entry)
  await check(entry)
  expect(entry.steps).toEqual([{ step: 'resolution-checked', facts: { commit: entry.resolution!.commit, ok: false, says: typeof says === 'string' ? says : says() } }])
  expect(ref(entry).status, 'a refusal must not write the resolved ref').not.toBe(0)
}
async function passed(entry: Entry, fixed?: string[]) {
  handOver(entry)
  await check(entry)
  expect(entry.steps).toEqual([{ step: 'resolution-checked', facts: {
    commit: entry.resolution!.commit, ok: true, ref: resolvedRefOf(entry.id),
    ...(fixed === undefined ? { places: expect.any(Array) } : { places: [], fixed }),
  } }])
  expect(ref(entry).stdout.trim()).toBe(entry.resolution!.commit)
}
const commits = (entry: Entry) => git(entry.into, 'rev-list', '--reverse', `${entry.mainAt}..HEAD`).split('\n').filter(Boolean)
const fixedBound = () => {
  const bound: unknown = Reflect.get(HOW_MUCH_A_RESOLUTION_CHECK_REPORTS, 'fixed')
  expect(typeof bound, 'the bound comes from the shared report contract').toBe('number')
  return bound as number
}
/** Make F1 available only through its resolved ref, then advance main independently. */
function earlierFix(conflict = false) {
  const entry = fixture()
  replay(entry)
  write(entry.into, 'src/earlier-fix.ts', line('first fix'))
  const firstFix = commit(entry.into, 'Synthetic first fix')
  git(entry.root, 'fetch', '-q', entry.into, `${firstFix}:${resolvedRefOf(entry.id)}`)
  rmSync(entry.into, { recursive: true, force: true })
  write(entry.root, conflict ? 'src/earlier-fix.ts' : 'src/later-main.ts', line('later main'))
  entry.mainAt = commit(entry.root, 'Synthetic later main')
  entry.replays = { ref: resolvedRefOf(entry.id), commit: firstFix }
  if (conflict) { delete entry.red; entry.files = ['src/earlier-fix.ts'] }
  return entry
}
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'red-fix-on-replay-')))
  office = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += String(chunk)
    const match = /^\/api\/merge-queue\/([^/]+)(?:\/([a-z-]+))?$/.exec(req.url ?? '')
    const entry = match === null ? undefined : entries.get(match[1]!)
    const answer = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
    if (entry === undefined || match === null) return answer(404, { error: 'Synthetic route is not served.' })
    if (req.method === 'GET' && match[2] === undefined) return answer(200, { entry: {
      id: entry.id, state: 'resolving', lane: entry.root, waitsOn: 'Synthetic supervisor',
      changeset: { adapter: 'git', root: entry.root, base: entry.ancestor, commit: entry.commit, branch: 'entry' },
      machine: { resolving: { files: entry.files, mainAt: entry.mainAt, since: new Date().toISOString(), timeZone: 'UTC', ...(entry.red ? { red: entry.red } : {}), ...(entry.replays ? { replays: entry.replays } : {}) }, resolution: entry.resolution },
    } })
    if (req.method === 'POST' && match[2] === 'step') { entry.steps.push(JSON.parse(body)); return answer(200, {}) }
    if (req.method === 'POST' && ['tool-started', 'tool-ended'].includes(match[2] ?? '')) return answer(200, {})
    return answer(404, { error: 'Synthetic route is not served.' })
  })
  await new Promise<void>((resolve) => office.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})
afterAll(async () => {
  for (const group of groups) { try { process.kill(-group, 'SIGTERM') } catch { /* Already ended. */ } }
  await new Promise<void>((resolve) => office?.close(() => resolve()))
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('case 1: a red fix passes', () => {
  it('preserves two replayed commits, reports exactly the sorted unique fix paths and writes the ref', async () => {
    const entry = fixture()
    const made = clean(entry, ...startWords(entry), '--red', entry.red!.tests.join(','))
    expect(made.status, made.stderr).toBe(0)
    expect(commits(entry)).toHaveLength(Number(git(entry.root, 'rev-list', '--count', `${entry.ancestor}..${entry.commit}`)))
    expect(readFileSync(join(entry.into, LIST), 'utf8')).toBe(list('ancestor', 'main', 'entry'))
    addFix(entry)
    await passed(entry, [...FIX].sort())
  })
})
describe('case 2: each red refusal has its own sentence and writes no ref', () => {
  it('refuses a replay stop, including a stop in a named red test', async () => {
    const entry = fixture(true)
    replay(entry, entry.commit, true); addFix(entry)
    await refused(entry, `The replay of ${entry.commit} onto main ${entry.mainAt} stopped on ${RED_TESTS[0]}, so this is not the clean replay the queue tested for a red fix.`)
  })
  it('refuses no commit on top', async () => {
    const entry = fixture(); replay(entry)
    const count = commits(entry).length
    await refused(entry, `The replay made ${String(count)} commits on top of main, and the red resolution has ${String(count)}; a red fix needs a commit on top of the replay.`)
  })
  it('refuses a fix folded into the first replayed tree even when the last replayed tree agrees', async () => {
    const entry = fixture(); replay(entry)
    const [first, last] = commits(entry) as [string, string]
    const tree = git(entry.into, 'rev-parse', `${last}^{tree}`)
    const folded = git(entry.into, 'commit-tree', tree, '-p', entry.mainAt, '-m', git(entry.into, 'log', '-1', '--format=%B', first))
    const second = git(entry.into, 'commit-tree', tree, '-p', folded, '-m', git(entry.into, 'log', '-1', '--format=%B', last))
    git(entry.into, 'checkout', '-q', '--detach', second); addFix(entry)
    await refused(entry, `The resolution's commit 1, ${folded.slice(0, 12)}, does not hold the tree of the replay's commit 1.`)
  })
  it('refuses a changed replayed message', async () => {
    const entry = fixture(); replay(entry)
    const [first, last] = commits(entry) as [string, string]
    git(entry.into, 'commit', '-q', '--amend', '-m', 'Synthetic altered message')
    const altered = git(entry.into, 'rev-parse', 'HEAD'); addFix(entry)
    expect(first).not.toBe(last)
    await refused(entry, `The resolution's commit 2, ${altered.slice(0, 12)}, does not carry the message of the replay's commit 2: ${git(entry.into, 'log', '-1', '--format=%s', last)}.`)
  })
  it('refuses commits on top that change nothing', async () => {
    const entry = fixture(); replay(entry)
    commit(entry.into, 'Synthetic empty fix', true)
    await refused(entry, () => `The red fix changes no paths against the replay's tip ${git(join(workOf(entry), 'resolution/clone'), 'rev-parse', 'HEAD')}; commits on top must fix at least one path.`)
  })
  it('refuses more fixed paths than the shared bound', async () => {
    const entry = fixture(); replay(entry)
    const bound = fixedBound()
    addFix(entry, Array.from({ length: bound + 1 }, (_, n) => `src/fix-${String(n)}.ts`))
    await refused(entry, `The red fix changes ${String(bound + 1)} paths, more than the ${String(bound)} paths the resolution check can report.`)
  })
  it('refuses a recorded hash that differs', async () => {
    const entry = fixture(); replay(entry); addFix(entry); handOver(entry)
    const file = entry.resolution!.files.find((one) => one.path === FIX[0])!
    const actual = { ...file }
    file.hash = createHash('sha256').update('Synthetic wrong content').digest('hex')
    await check(entry)
    expect(entry.steps).toEqual([{ step: 'resolution-checked', facts: { commit: entry.resolution!.commit, ok: false, says: `${file.path} in the resolution's commit has hash ${actual.hash} and mode ${actual.mode}, and the hand-over door recorded ${file.hash} and ${file.mode}.` } }])
    expect(ref(entry).status).not.toBe(0)
  })
})
describe('case 3: the base is an earlier checked fix in red mode', () => {
  it('replays F1 onto later main, keeps its commits and adds a second fix', async () => {
    const entry = earlierFix(); replay(entry)
    expect(git(entry.into, 'show', 'HEAD:src/earlier-fix.ts')).toBe(line('first fix').trim())
    const before = ref(entry).stdout.trim()
    addFix(entry); await passed(entry, [...FIX].sort())
    expect(ref(entry).stdout.trim()).not.toBe(before)
  })
  it('refuses a resolution that replays the pinned entry and omits F1', async () => {
    const entry = earlierFix(); replay(entry, entry.commit); addFix(entry)
    const before = ref(entry).stdout.trim()
    handOver(entry); await check(entry)
    const clone = join(workOf(entry), 'resolution/clone')
    const ours = git(clone, 'rev-list', '--count', `${entry.mainAt}..HEAD`)
    const theirs = commits(entry).length
    expect(entry.steps).toEqual([{ step: 'resolution-checked', facts: { commit: entry.resolution!.commit, ok: false, says: `The replay made ${ours} commits on top of main, and the red resolution has ${String(theirs)}; a red fix needs a commit on top of the replay.` } }])
    expect(ref(entry).stdout.trim(), 'a refusal must not overwrite the earlier checked ref').toBe(before)
  })
  it('refuses an earlier fix absent from the lane and names its ref', async () => {
    const entry = earlierFix(); replay(entry); addFix(entry)
    const absent = git(entry.into, 'rev-parse', 'HEAD')
    entry.replays!.commit = absent
    const before = ref(entry).stdout.trim()
    handOver(entry); await check(entry)
    expect(entry.steps).toEqual([{ step: 'resolution-checked', facts: { commit: entry.resolution!.commit, ok: false, says: `The replay base ${absent} from ${entry.replays!.ref} is not in the lane's repository ${entry.root}, so this resolution cannot be checked.` } }])
    expect(ref(entry).stdout.trim()).toBe(before)
  })
})
describe('case 4: the base is an earlier checked fix in conflict mode', () => {
  it('checks the conflict met while replaying F1 from its resolved ref', async () => {
    const entry = earlierFix(true)
    const made = clean(entry, ...startWords(entry), '--files', entry.files.join(','))
    expect(made.status, made.stderr).toBe(0)
    write(entry.into, entry.files[0]!, line('later main') + line('first fix'))
    git(entry.into, 'add', '--', ...entry.files)
    const ended = clean(entry, '--continue', '--into', entry.into)
    expect(ended.status, ended.stderr).toBe(0)
    await passed(entry)
    const facts = (entry.steps[0] as { facts: { places: { path: string }[] } }).facts
    expect(facts.places.map((place) => place.path)).toEqual(entry.files)
  })
})
describe('case 5: the clean copy', () => {
  it('prints the replayed tip, red tests, command, preservation rule and hand-over in order', () => {
    const entry = fixture()
    const ran = clean(entry, ...startWords(entry), '--red', entry.red!.tests.join(','))
    expect(ran.status, ran.stderr).toBe(0)
    const tip = git(entry.into, 'rev-parse', 'HEAD')
    const parts = [
      `The replay of merge entry ${entry.id} is done. The replayed tip is commit ${tip}, in ${entry.into}.`,
      `The red tests: ${entry.red!.tests.join(', ')}.`,
      `cd ${entry.into} && node tools/run-named-tests.mjs ${entry.red!.tests.join(' ')}`,
      'Commit the fix on top of that tip. Do not change, reorder or squash the replayed commits: the check compares them with its own replay.',
      `POST /api/merge-queue/${entry.id}/resolution {"workingDirectory": "${entry.into}", "tests": {"commit": "<the commit of your fix>"`,
    ]
    let previous = -1
    for (const part of parts) { const at = ran.stdout.indexOf(part); expect(at, part).toBeGreaterThan(previous); previous = at }
    const kept = JSON.parse(readFileSync(join(entry.into, '.git/mole-office-clean-copy.json'), 'utf8'))
    expect(kept.red).toEqual(entry.red!.tests)
    expect(kept).not.toHaveProperty('files')
    expect(realpathSync(join(entry.into, 'node_modules'))).toBe(realpathSync(join(REPO, 'node_modules')))
    expect(git(entry.into, 'merge-base', '--is-ancestor', entry.mainAt, tip)).toBe('')
  })
  it('refuses a stopped red replay and aborts it before returning', () => {
    const entry = fixture(true)
    const ran = clean(entry, ...startWords(entry), '--red', entry.red!.tests.join(','))
    expect(ran.status).toBe(1)
    expect(ran.stderr).toBe(`resolve-a-conflict: The replay of the entry stopped on a conflict in ${RED_TESTS[0]}, which the queue's own replay onto this main did not meet; nothing can be fixed in this copy; tell the queue with POST /api/merge-queue/${entry.id}/resolution {"cannot": "<one sentence>"}.\n`)
    for (const folder of ['rebase-merge', 'rebase-apply']) expect(existsSync(join(entry.into, '.git', folder))).toBe(false)
    expect(git(entry.into, 'rev-parse', 'HEAD')).toBe(entry.commit)
    expect(git(entry.into, 'status', '--porcelain', '--untracked-files=no')).toBe('')
  })
  for (const [name, args] of [
    ['both --red and --files', ['--red', RED_TESTS.join(','), '--files', RED_TESTS[0]!]],
    ['neither --red nor --files', []],
  ] as const) it(`refuses ${name}`, () => {
    const entry = fixture(true)
    const ran = clean(entry, ...startWords(entry), ...args)
    expect(ran.status).toBe(2)
    expect(ran.stderr).toBe('resolve-a-conflict: A start takes exactly one of --files <path,...> and --red <test,...>.\n')
    expect(existsSync(entry.into)).toBe(false)
  })
  it('refuses an empty red list', () => {
    const entry = fixture()
    const ran = clean(entry, ...startWords(entry), '--red', ',,')
    expect(ran.status).toBe(2)
    expect(ran.stderr).toBe('resolve-a-conflict: --red needs at least one test file.\n')
  })
  it('refuses --continue on a red copy', () => {
    const entry = fixture()
    const made = clean(entry, ...startWords(entry), '--red', entry.red!.tests.join(','))
    expect(made.status, made.stderr).toBe(0)
    const ran = clean(entry, '--continue', '--into', entry.into)
    expect(ran.status).toBe(1)
    expect(ran.stderr).toBe('resolve-a-conflict: A red copy has no stop to continue from. Commit the fix on top of its replayed tip and hand it over.\n')
  })
  it('still makes and continues a --files conflict copy', () => {
    const entry = fixture(true)
    const made = clean(entry, ...startWords(entry), '--files', RED_TESTS[0]!)
    expect(made.status, made.stderr).toBe(0)
    write(entry.into, RED_TESTS[0]!, line('main test') + line('entry test'))
    git(entry.into, 'add', '--', RED_TESTS[0]!)
    const ended = clean(entry, '--continue', '--into', entry.into)
    expect(ended.status, ended.stderr).toBe(0)
    expect(ended.stdout).toContain(`"commit": "${git(entry.into, 'rev-parse', 'HEAD')}"`)
  })
})
