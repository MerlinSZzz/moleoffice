// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Isolated DB and real Git; the gate controls the timing of the first spawned Git process. */
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { stampInZone } from '../src/shared/time.ts'
let db: TestDb, dir: string, reader: typeof import('../src/server/lib/async-take-back.ts'), sync: typeof import('../src/server/lib/take-back.ts')
let repo: string, before: string, after: string, entry: string, problem: string
const oldPath = process.env.PATH!
const actor = { type: 'human', id: 'owner' } as const
function git(...args: string[]) { return execFileSync('/usr/bin/git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
function fixtureCommit(parent?: string) {
  const tree = git('write-tree')
  const address = ['fixture', 'example.invalid'].join('@')
  const raw = `tree ${tree}\n${parent ? `parent ${parent}\n` : ''}author Fixture <${address}> 1 +0000\ncommitter Fixture <${address}> 1 +0000\n\nSynthetic\n`
  return execFileSync('/usr/bin/git', ['-C', repo, 'hash-object', '-t', 'commit', '-w', '--stdin'], { input: raw, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}
function data(id: string, obj: object) { db.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(obj), id) }
function create(kind: 'problem' | 'merge_entry', value: object) {
  const r = db.api.createRecord({ kind: 'problem', title: 'Synthetic hand-back', workspaceId: 'default', actor, origin: 'fixture', data: { state: 'open' } })
  db.client.sqlite.prepare('UPDATE records SET kind = ?, data = ? WHERE id = ?').run(kind, JSON.stringify(value), r.id)
  return r.id
}
function entryData(mainBefore = before, mainAfter = after) { return { state: 'merged', run: 'synthetic-run', seal: { id: 'synthetic-seal', hash: 'synthetic-hash' }, submittedBy: { kind: 'agent', id: 'synthetic-agent' }, changeset: { adapter: 'git', root: repo, branch: 'main', commit: after, base: before }, integrated: { mainBefore, mainAfter } } }
function facts(changes: object = {}) {
  return { entry, repository: repo, files: ['x'], commits: [after], line: { agent: 'synthetic-alias', starter: 'synthetic-starter', run: null }, landedAt: '2020-01-01 00:00:00', deadline: '2020-01-02 00:00:00', timeZone: 'UTC', hours: 1, ...changes }
}
function problemData(changes: object = {}) { return { state: 'open', extra: { redOnMainFamily: true, handBack: facts(changes) } } }
function gate(inherited = false) {
  const name = join(dir, `gate-${Math.random().toString(36).slice(2)}`), bin = `${name}-bin`
  mkdirSync(bin)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase " $* " in *' rev-list '*) printf x >> '${name}.calls'; if mkdir '${name}.lock' 2>/dev/null; then\n  printf '%s %s' "$PPID" "$$" > '${name}.pids'\n  : > '${name}.started'\n  ${inherited ? `(while [ ! -e '${name}.release' ]; do sleep 0.02; done) &\n  printf '%s' "$!" > '${name}.descendant'\n  exit 0` : `while [ ! -e '${name}.release' ]; do sleep 0.02; done`}\nfi;; esac\nexec /usr/bin/git "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755); process.env.PATH = `${bin}:${oldPath}`
  return { name, release: () => writeFileSync(`${name}.release`, '') }
}
/** A process that exists and is not a zombie; its state, parent, group and session from /proc, or null. */
function running(pid: number) {
  try {
    const [state, ppid, group, session] = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]!.split(' ')
    return state === 'Z' ? null : { ppid: Number(ppid), group: Number(group), session: Number(session) }
  } catch { return null }
}
async function gone(pid: number, within = 1500) {
  const end = Date.now() + within
  while (Date.now() < end) {
    try { if (readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.startsWith('Z')) return } catch { return }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`synthetic child ${pid} is still running`)
}
async function started(name: string) {
  const end = Date.now() + 1500
  while (!existsSync(`${name}.started`) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 5))
  expect(existsSync(`${name}.started`)).toBe(true)
}
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'async-handback-')); repo = join(dir, 'repo'); mkdirSync(repo)
  git('init', '-q', '-b', 'main'); writeFileSync(join(repo, 'x'), 'before'); git('add', 'x')
  before = fixtureCommit(); writeFileSync(join(repo, 'x'), 'after'); git('add', 'x'); after = fixtureCommit(before); git('update-ref', 'refs/heads/main', after)
  db = await freshDb()
  db.client.sqlite.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES ('synthetic-avatar', 'image', 'fixture', 'image/svg+xml', '2020-01-01')").run()
  db.client.sqlite.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES ('synthetic-agent', 'Synthetic agent', 'synthetic-alias', 'synthetic-avatar', '2020-01-01')").run()
  entry = create('merge_entry', entryData())
  problem = create('problem', problemData())
  reader = await import('../src/server/lib/async-take-back.ts'); sync = await import('../src/server/lib/take-back.ts')
}, 60_000)
afterAll(() => { process.env.PATH = oldPath; db?.close(); rmSync(dir, { recursive: true, force: true }) })
it('matches due, person and unreadable evidence and detects an unpinnable input', async () => {
  let actual = await reader.asyncTakeBacksForProject('default', problem)
  expect(actual).toEqual({ kind: 'ok', ...sync.takeBacksForProject('default', problem) })
  expect(actual.kind === 'ok' && actual.due.length).toBe(1)
  data(problem, problemData({ line: { agent: null, starter: 'synthetic-starter', run: null } }))
  expect(await reader.asyncTakeBacksForProject('default', problem)).toEqual({ kind: 'ok', ...sync.takeBacksForProject('default', problem) })
  data(problem, problemData({ deadline: 'bad' }))
  expect(await reader.asyncTakeBacksForProject('default', problem)).toEqual({ kind: 'ok', ...sync.takeBacksForProject('default', problem) })
  data(problem, problemData()); data(entry, entryData('not-a-revision'))
  expect(await reader.asyncTakeBacksForProject('default', problem)).toEqual({ kind: 'stale', reason: 'unpinnable' })
  data(entry, entryData())
})
it('fails closed repeatedly on the Windows platform branch for a due hand-back', async () => {
  expect(sync.takeBacksForProject('default', problem).due).toHaveLength(1)
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { ...original, value: 'win32' })
  try {
    for (let i = 0; i < 2; i++) expect(await reader.asyncTakeBacksForProject('default', problem)).toEqual({ kind: 'stale', reason: 'unavailable' })
  } finally { Object.defineProperty(process, 'platform', original) }
})
it('reports an unavailable Git executable as unreadable evidence rather than an unpinnable revision', async () => {
  const empty = join(dir, 'no-git'); mkdirSync(empty); process.env.PATH = empty
  try {
    const result = await reader.asyncTakeBacksForProject('default', problem)
    expect(result).toMatchObject({ kind: 'ok', due: [], forAPerson: [], cannotBeRead: [{ problem, says: expect.stringMatching(/\S/) }] })
  } finally { process.env.PATH = oldPath }
})
it('keeps an unreadable Git graph distinct from an unpinnable revision', async () => {
  const bin = join(dir, 'failing-git'); mkdirSync(bin)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase " $* " in *' rev-list '*) exit 2;; esac\nexec /usr/bin/git "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755); process.env.PATH = `${bin}:${oldPath}`
  try {
    const result = await reader.asyncTakeBacksForProject('default', problem)
    expect(result).toMatchObject({ kind: 'ok', due: [], forAPerson: [], cannotBeRead: [{ problem, says: expect.stringMatching(/\S/) }] })
  } finally { process.env.PATH = oldPath }
})
it('does not signal a group after its helper dies unexpectedly', async () => {
  const bin = join(dir, 'dead-helper-git'), pidFile = join(dir, 'dead-helper-pid'); mkdirSync(bin)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase " $* " in *' rev-list '*) printf '%s' "$PPID" > '${pidFile}'; kill -KILL "$PPID"; exit 1;; esac\nexec /usr/bin/git "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755); process.env.PATH = `${bin}:${oldPath}`
  const original = process.kill, signalled: number[] = []
  process.kill = ((pid: number, signal?: NodeJS.Signals | number) => { if (pid < 0) signalled.push(pid); return original(pid, signal) }) as typeof process.kill
  try {
    const result = await reader.asyncTakeBacksForProject('default', problem)
    expect(result).toEqual({ kind: 'stale', reason: 'unavailable' })
    await gone(Number(readFileSync(pidFile, 'utf8')))
    expect(signalled).toEqual([])
  } finally { process.env.PATH = oldPath; process.kill = original }
})
it('retries on a new candidate, changed entry and deadline while a Git read is in flight', async () => {
  const g = gate(), pending = reader.asyncTakeBacksForProject('default')
  await started(g.name)
  const future = stampInZone(Date.now() + 60_000, 'UTC')
  data(problem, problemData({ deadline: future })); const another = create('problem', problemData())
  g.release(); const result = await pending; process.env.PATH = oldPath
  expect(result.kind).toBe('ok')
  if (result.kind === 'ok') { expect(result.due.map(x => x.problem)).toEqual([another]); expect(result.due.some(x => x.problem === problem)).toBe(false) }
  data(problem, problemData()); db.client.sqlite.prepare('DELETE FROM records WHERE id = ?').run(another)
})
it('rechecks the full candidate problem record, beyond projected fields', async () => {
  const g = gate(), pending = reader.asyncTakeBacksForProject('default')
  await started(g.name)
  db.client.sqlite.prepare("UPDATE records SET title = 'Changed synthetic title' WHERE id = ?").run(problem)
  g.release(); const result = await pending; process.env.PATH = oldPath
  expect(result.kind === 'ok' && result.due.length).toBe(1)
  expect(readFileSync(`${g.name}.calls`, 'utf8').length).toBeGreaterThan(2)
  db.client.sqlite.prepare("UPDATE records SET title = 'Synthetic hand-back' WHERE id = ?").run(problem)
})
it('revalidates entry, agent resolution and takeout creation revisions', async () => {
  let g = gate(), pending = reader.asyncTakeBacksForProject('default', problem)
  await started(g.name); data(entry, { ...entryData(), changeset: { adapter: 'git', root: '/missing' } }); g.release()
  let result = await pending; process.env.PATH = oldPath
  expect(result).toEqual({ kind: 'ok', ...sync.takeBacksForProject('default', problem) })
  expect(result).toMatchObject({ kind: 'ok', forAPerson: [{ problem }] })
  data(entry, entryData())
  g = gate(); pending = reader.asyncTakeBacksForProject('default', problem)
  await started(g.name); db.client.sqlite.prepare("UPDATE agents SET handle = 'new-synthetic-alias' WHERE id = 'synthetic-agent'").run(); g.release()
  result = await pending; process.env.PATH = oldPath
  expect(result).toEqual({ kind: 'ok', ...sync.takeBacksForProject('default', problem) })
  expect(result).toMatchObject({ kind: 'ok', forAPerson: [{ problem }] })
  db.client.sqlite.prepare("UPDATE agents SET handle = 'synthetic-alias' WHERE id = 'synthetic-agent'").run()
  g = gate(); pending = reader.asyncTakeBacksForProject('default', problem)
  await started(g.name)
  const takeout = create('problem', { state: 'open' })
  db.client.sqlite.prepare("UPDATE revisions SET kind = 'merge_entry', data = ? WHERE record_id = ? AND seq = 1").run(JSON.stringify({ fixRound: { problem, kind: 'takeout' } }), takeout)
  g.release(); result = await pending; process.env.PATH = oldPath
  expect(result.kind === 'ok' && result.due).toEqual([])
  db.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(takeout)
  db.client.sqlite.prepare('DELETE FROM records WHERE id = ?').run(takeout)
})
it('returns stale if the explicitly named problem disappears during the read', async () => {
  const g = gate(), pending = reader.asyncTakeBacksForProject('default', problem)
  await started(g.name); db.client.sqlite.prepare("UPDATE records SET deleted_at = '2020-01-01 00:00:00' WHERE id = ?").run(problem); g.release()
  const result = await pending; process.env.PATH = oldPath
  expect(result).toEqual({ kind: 'stale', reason: 'changed' })
  db.client.sqlite.prepare('UPDATE records SET deleted_at = NULL WHERE id = ?').run(problem)
})
it('measures synchronous database capture on a future hand-back separately from Git', async () => {
  const future = stampInZone(Date.now() + 60_000, 'UTC'); data(problem, problemData({ deadline: future }))
  const database = db.client.sqlite as unknown as { transaction: (callback: () => unknown) => { deferred: () => unknown } }
  const original = database.transaction
  const times: number[] = []
  database.transaction = function (callback) {
    const tx = original.call(database, callback)
    const deferred = tx.deferred.bind(tx)
    tx.deferred = () => { const start = performance.now(); try { return deferred() } finally { times.push(performance.now() - start) } }
    return tx
  }
  try {
    const result = await reader.asyncTakeBacksForProject('default', problem)
    expect(result.kind).toBe('ok'); expect(times).toHaveLength(2)
    console.info(`Synthetic SQLite capture milliseconds: ${times.map(x => x.toFixed(3)).join(', ')}`)
  } finally { database.transaction = original; data(problem, problemData()) }
})
it('revalidates the trunk ref and resolves concurrent callers independently', async () => {
  const g = gate(), pending = reader.asyncTakeBacksForProject('default', problem)
  await started(g.name); git('update-ref', 'refs/heads/main', before); g.release()
  const result = await pending; process.env.PATH = oldPath
  expect(result).toEqual({ kind: 'ok', ...sync.takeBacksForProject('default', problem) })
  expect(result).toMatchObject({ kind: 'ok', forAPerson: [{ problem }] })
  git('update-ref', 'refs/heads/main', after)
  const both = await Promise.all([reader.asyncTakeBacksForProject('default', problem), reader.asyncTakeBacksForProject('default', problem)])
  expect(both.every(x => x.kind === 'ok' && x.due.length === 1)).toBe(true)
})
it('cleans a normal helper without the parent signalling any numeric process group', async () => {
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => { sentinel.once('spawn', resolve); sentinel.once('error', reject) })
  const bin = join(dir, 'normal-git'), pidFile = join(dir, 'normal-helper-pids'); mkdirSync(bin)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$PPID" >> '${pidFile}'\nexec /usr/bin/git "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755); process.env.PATH = `${bin}:${oldPath}`
  const original = process.kill, signalled: number[] = []
  process.kill = ((pid: number, signal?: NodeJS.Signals | number) => { if (pid < 0) signalled.push(pid); return original(pid, signal) }) as typeof process.kill
  try {
    const startedAt = performance.now()
    const result = await reader.asyncTakeBacksForProject('default', problem)
    const elapsed = performance.now() - startedAt
    expect(result.kind === 'ok' && result.due.length).toBe(1)
    console.info(`Synthetic complete normal reader milliseconds: ${elapsed.toFixed(3)}`)
    for (const pid of readFileSync(pidFile, 'utf8').trim().split('\n').map(Number)) await gone(pid)
    expect(signalled).toEqual([]); expect(() => original(sentinel.pid!, 0)).not.toThrow()
  } finally {
    process.env.PATH = oldPath; process.kill = original
    const closed = new Promise<void>(resolve => sentinel.once('exit', () => resolve()))
    sentinel.kill('SIGKILL'); await closed
  }
})
it('settles and cleans timed-out and cancelled helpers without signalling an unrelated group', async () => {
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => { sentinel.once('spawn', resolve); sentinel.once('error', reject) })
  const original = process.kill, signalled: number[] = []
  process.kill = ((pid: number, signal?: NodeJS.Signals | number) => { if (pid < 0) signalled.push(pid); return original(pid, signal) }) as typeof process.kill
  try {
    const g = gate(true), start = Date.now(), pending = reader.asyncTakeBacksForProject('default', problem, { deadline: Date.now() + 1300 })
    await started(g.name)
    expect(await pending).toEqual({ kind: 'stale', reason: 'deadline' }); expect(Date.now() - start).toBeLessThan(1900)
    for (const pid of readFileSync(`${g.name}.pids`, 'utf8').trim().split(' ').map(Number)) await gone(pid)
    await gone(Number(readFileSync(`${g.name}.descendant`, 'utf8')))
    expect(() => original(sentinel.pid!, 0)).not.toThrow()
    g.release(); process.env.PATH = oldPath
    const h = gate(), abort = new AbortController(), cancelled = reader.asyncTakeBacksForProject('default', problem, { signal: abort.signal })
    await started(h.name); abort.abort()
    expect(await cancelled).toEqual({ kind: 'stale', reason: 'cancelled' })
    for (const pid of readFileSync(`${h.name}.pids`, 'utf8').trim().split(' ').map(Number)) await gone(pid)
    expect(() => original(sentinel.pid!, 0)).not.toThrow(); expect(signalled).toEqual([])
    h.release()
  } finally {
    process.env.PATH = oldPath; process.kill = original
    const closed = new Promise<void>(resolve => sentinel.once('exit', () => resolve()))
    sentinel.kill('SIGKILL'); await closed
  }
})
it('ends an unresponsive helper and its Git from the parent, signalling only the helper group', async () => {
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  await new Promise<void>((resolve, reject) => { sentinel.once('spawn', resolve); sentinel.once('error', reject) })
  const original = process.kill, signalled: number[] = []
  process.kill = ((pid: number, signal?: NodeJS.Signals | number) => { if (pid < 0) signalled.push(pid); return original(pid, signal) }) as typeof process.kill
  const g = gate()
  let helper = 0
  try {
    const pending = reader.asyncTakeBacksForProject('default', problem, { deadline: Date.now() + 1300 })
    await started(g.name)
    const [leader, child] = readFileSync(`${g.name}.pids`, 'utf8').trim().split(' ').map(Number)
    helper = leader!
    // A stopped helper cannot act on stop, so only the parent can end its group.
    original(helper, 'SIGSTOP')
    expect(await pending).toEqual({ kind: 'stale', reason: 'deadline' })
    await gone(helper, 3000); await gone(child!, 3000)
    expect(signalled).toEqual([-helper])
    expect(() => original(sentinel.pid!, 0)).not.toThrow()
  } finally {
    process.env.PATH = oldPath; process.kill = original
    // The helper is this process's unreaped child, so its group id is still its own.
    if (helper !== 0 && running(helper) !== null) original(-helper, 'SIGKILL')
    g.release()
    const closed = new Promise<void>(resolve => sentinel.once('exit', () => resolve()))
    sentinel.kill('SIGKILL'); await closed
  }
})
it('settles when a descendant has left the group with setsid, and that descendant is outside the cleanup', async () => {
  const name = join(dir, 'escaped'), bin = `${name}-bin`; mkdirSync(bin)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase " $* " in *' rev-list '*)\n  printf '%s %s' "$PPID" "$$" > '${name}.pids'\n  setsid sh -c 'printf %s "$$" > "$0.escaped"; while [ ! -e "$0.release" ]; do sleep 0.02; done' '${name}' &\n  while [ ! -s '${name}.escaped' ]; do sleep 0.02; done\n  : > '${name}.started'\n  while [ ! -e '${name}.release' ]; do sleep 0.02; done;;\nesac\nexec /usr/bin/git "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755); process.env.PATH = `${bin}:${oldPath}`
  const original = process.kill, signalled: number[] = []
  process.kill = ((pid: number, signal?: NodeJS.Signals | number) => { if (pid < 0) signalled.push(pid); return original(pid, signal) }) as typeof process.kill
  let escaped = 0
  try {
    const pending = reader.asyncTakeBacksForProject('default', problem, { deadline: Date.now() + 1300 })
    await started(name)
    escaped = Number(readFileSync(`${name}.escaped`, 'utf8'))
    const [helper] = readFileSync(`${name}.pids`, 'utf8').trim().split(' ').map(Number)
    expect(running(escaped)).toMatchObject({ group: escaped, session: escaped })
    expect(escaped).not.toBe(helper)
    expect(await pending).toEqual({ kind: 'stale', reason: 'deadline' })
    for (const pid of readFileSync(`${name}.pids`, 'utf8').trim().split(' ').map(Number)) await gone(pid)
    // The limit the reader names: the helper's group is gone, and the descendant in its own session still runs.
    expect(running(escaped)).toMatchObject({ group: escaped })
    expect(signalled).toEqual([])
  } finally {
    process.env.PATH = oldPath; process.kill = original
    writeFileSync(`${name}.release`, '')
    if (escaped !== 0) await gone(escaped)
  }
})
