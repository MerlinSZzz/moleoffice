// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOL MAKES ONE CLEAN TAKE-BACK.
 * Measures independent git storage, one inverse commit, untouched unrelated work and clean clones.
 * Mutations: use multiple commits; reset to B; omit title; leave conflicts or accept a merge commit.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { startTimeOf } from '../src/config/session-process.mjs'
import { localStamp } from '../src/shared/time.ts'
// @ts-ignore the production tool is JavaScript
import { prepareTakeBack, runTakeBack } from '../tools/merge-tool/take-back.mjs'
const dirs: string[] = []
// The runner itself is covered by the fixture office; these tests control its possible answers.
function mainTools(answer = { red: true as boolean | null, absent: false, log: '/synthetic/alone.log' as string | null, noResult: null as string | null }) {
  const folder = mkdtempSync(join(tmpdir(), 'take-back-main-')); dirs.push(folder)
  return { theSandbox: async () => ({ folder }), linkNodeModules: () => {}, runAlone: vi.fn(async () => answer), packageScripts: (cwd: string) => existsSync(join(cwd, 'package.json')) ? JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).scripts ?? {} : {}, runInSandbox: vi.fn(async () => ({ code: 0, outFile: '/synthetic/build.log' })), buildLimitMs: 60_000 }
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function setup() {
  const base = mkdtempSync(join(tmpdir(), 'one-take-back-')); dirs.push(base)
  const root = join(base, 'root'); execFileSync('git', ['init', '-q', '-b', 'main', root])
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(root, 'one'), 'before\n'); git('add', '.'); git('commit', '-qm', 'Before'); const before = git('rev-parse', 'HEAD')
  writeFileSync(join(root, 'one'), 'after\n'); git('commit', '-qam', 'After'); const after = git('rev-parse', 'HEAD')
  writeFileSync(join(root, 'other'), 'keep\n'); git('add', '.'); git('commit', '-qm', 'Unrelated')
  const clone = join(base, 'clone'), input = { repository: root, clone, problem: 'synthetic', entry: 'landed-entry', commits: [after], title: 'Taken back: A change, not fixed in 1 hour', identity: { GIT_AUTHOR_NAME: 'Synthetic queue', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic queue', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' } }
  return { root, git, before, after, clone, input }
}
it('writes exactly one clean inverse on current main with the shared title', () => {
  const s = setup(), main = s.git('rev-parse', 'main'), made = prepareTakeBack(s.input)
  console.info(`Take-back timing: clone ${made.timing.cloneMs.toFixed(1)} ms; revert ${made.timing.revertMs.toFixed(1)} ms.`)
  const git = (...args: string[]) => execFileSync('git', ['-C', s.clone, ...args], { encoding: 'utf8' }).trim()
  expect(git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toEqual([made.commit, main])
  expect(git('show', 'HEAD:one')).toBe(s.git('show', `${s.before}:one`)); expect(git('show', 'HEAD:other')).toBe('keep')
  expect(git('log', '-1', '--format=%s')).toBe(s.input.title); expect(git('status', '--porcelain')).toBe('')
  expect(existsSync(join(s.clone, '.git/objects/info/alternates'))).toBe(false)
})
it('names the conflicting commit and paths, removes its clone and makes no root commit', () => {
  const s = setup(); writeFileSync(join(s.root, 'one'), 'different\n'); s.git('commit', '-qam', 'Conflict'); const main = s.git('rev-parse', 'HEAD')
  expect(() => prepareTakeBack(s.input)).toThrow(s.after); expect(existsSync(s.clone)).toBe(false); expect(s.git('rev-parse', 'HEAD')).toBe(main)
  expect(existsSync(`${s.clone}.making.json`)).toBe(false)
})
it('refuses a merge commit', () => {
  const s = setup(); s.git('checkout', '-qb', 'side', s.before); writeFileSync(join(s.root, 'side'), 'side'); s.git('add', '.'); s.git('commit', '-qm', 'Side'); s.git('checkout', '-q', 'main'); s.git('merge', '--no-ff', '-m', 'Merge', 'side')
  expect(() => prepareTakeBack({ ...s.input, commits: [s.git('rev-parse', 'HEAD')] })).toThrow(/merge|single-parent/)
})

it('fetches the commit into root and removes its clone after the office accepts', async () => {
  const s = setup(), workdir = join(s.root, '..', 'owned'), clone = join(workdir, 'clone')
  const original = { entry: 'synthetic-entry', repository: s.root, files: ['one'], commits: [s.after], line: { agent: 'synthetic-line', starter: 'synthetic-starter', run: 'synthetic-round' }, landedAt: '2026-10-21 09:00:00', deadline: '2026-10-21 10:00:00', timeZone: 'UTC', hours: 1 }
  const seen: string[] = []
  const ask = async (method: string, path: string) => {
    seen.push(`${method} ${path}`)
    if (method === 'GET' && path.startsWith('/api/records/')) return { status: 200, body: { record: { data: { extra: { handBack: original } } } } }
    if (method === 'GET') return { status: 200, body: { entry: { title: 'A change' } } }
    const commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    expect(s.git('cat-file', '-t', commit)).toBe('commit')
    return { status: 200, body: { entry: { id: 'synthetic-take-back' }, run: 'synthetic-office-run', commit } }
  }
  expect(await runTakeBack({ chosen: { takeBack: 'synthetic-problem' }, workdir, ask, identity: s.input.identity, mainTools: mainTools() })).toBe(true)
  expect(seen).toHaveLength(3); expect(existsSync(clone)).toBe(false)
  expect(existsSync(`${clone}.making.json`)).toBe(false)
})

// Twelve seconds leaves time for tsx's cold import and a small real clone on a loaded machine.
const READY_MS = 12_000
// Four seconds lets the whole group handle TERM and gives Node time to reap the child.
const EXIT_MS = 4_000
// Twenty milliseconds observes readiness promptly without a busy loop.
const POLL_MS = 20
// A one-second Node timer keeps the stand-in alive until the recorded group is killed.
const HOLD_TICK_MS = 1_000
async function waitFor(what: string, ready: () => boolean, bound: number) {
  const until = Date.now() + bound
  while (!ready()) {
    if (Date.now() >= until) throw new Error(`Timed out waiting for ${what}.`)
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

it('replaces the left clone of a real clone process group killed with TERM', async () => {
  const s = setup(), base = join(s.root, '..'), bin = join(base, 'bin'), home = join(base, 'home'), ready = join(base, 'ready.json')
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
  mkdirSync(bin); mkdirSync(home)
  writeFileSync(join(bin, 'git'), `#!${process.execPath}
const { spawnSync } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const args = process.argv.slice(2)
let first = 0
while (args[first]?.startsWith('-')) first += args[first] === '-C' || args[first] === '-c' ? 2 : 1
const ran = spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' })
if (ran.error) throw ran.error
if (ran.status !== 0) process.exit(ran.status ?? 1)
if (args[first] !== 'clone') process.exit(0)
writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pid: process.ppid }))
setInterval(() => {}, ${HOLD_TICK_MS})
`, { mode: 0o755 })
  const tool = fileURLToPath(new URL('../tools/merge-tool/take-back.mjs', import.meta.url))
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `import { prepareTakeBack } from ${JSON.stringify(tool)}; prepareTakeBack(${JSON.stringify(s.input)})`], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), detached: true, env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const pgid = child.pid!
  let ended = false, signal: NodeJS.Signals | null = null, output = ''
  child.stdout.on('data', chunk => { output += String(chunk) }); child.stderr.on('data', chunk => { output += String(chunk) })
  child.once('exit', (_code, got) => { ended = true; signal = got })
  child.once('error', error => { ended = true; output += error.message })
  const stop = (how: NodeJS.Signals) => { try { process.kill(-pgid, how) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error } }
  try {
    await waitFor(`clone readiness: ${output}`, () => existsSync(ready) || ended, READY_MS)
    expect(ended, output).toBe(false)
    process.kill(-pgid, 'SIGTERM')
    await waitFor('the killed clone child to exit', () => ended, EXIT_MS)
    expect(signal).toBe('SIGTERM')
    expect(existsSync(s.clone)).toBe(true)
    expect.soft(existsSync(`${s.clone}.making.json`)).toBe(true)
    const owner = JSON.parse(readFileSync(ready, 'utf8')) as { pid: number }
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const made = prepareTakeBack(s.input)
      expect(JSON.parse(readFileSync(`${s.clone}.making.json`, 'utf8'))).toMatchObject({ problem: s.input.problem, repository: s.root, clone: s.clone, pid: process.pid, startedAt: localStamp(startTimeOf(process.pid)!) })
      expect(execFileSync(realGit, ['-C', s.clone, 'show', 'HEAD:one'], { encoding: 'utf8' })).toBe('before\n')
      expect(execFileSync(realGit, ['-C', s.clone, 'show', 'HEAD:other'], { encoding: 'utf8' })).toBe('keep\n')
      expect(execFileSync(realGit, ['-C', s.clone, 'status', '--porcelain'], { encoding: 'utf8' })).toBe('')
      expect(made.commit).toBeTruthy()
      expect(stderr.mock.calls.map(call => String(call[0])).join('')).toMatch(`Removed the left take-back clone ${s.clone}`)
      expect(stderr.mock.calls.map(call => String(call[0])).join('')).toMatch(`process ${owner.pid} is gone`)
    } finally { stderr.mockRestore() }
  } finally {
    stop('SIGTERM')
    if (!ended) {
      try { await waitFor('clone cleanup after TERM', () => ended, EXIT_MS) }
      catch { stop('SIGKILL'); await waitFor('clone cleanup after KILL', () => ended, EXIT_MS) }
    }
  }
})

function leftFolder() {
  const s = setup(); mkdirSync(s.clone); writeFileSync(join(s.clone, 'kept'), 'untouched\n')
  const started = startTimeOf(process.pid)
  if (started === null) throw new Error('The fixture could not read its process start time.')
  const note = { problem: s.input.problem, repository: s.root, clone: s.clone, pid: process.pid, startedAt: localStamp(started) }
  return { ...s, note }
}
function untouched(s: ReturnType<typeof leftFolder>, says: RegExp) {
  const note = `${s.clone}.making.json`, before = existsSync(note) ? readFileSync(note, 'utf8') : null
  expect(() => prepareTakeBack(s.input)).toThrow(says)
  expect(readFileSync(join(s.clone, 'kept'), 'utf8')).toBe('untouched\n')
  expect(existsSync(note) ? readFileSync(note, 'utf8') : null).toBe(before)
}
it('refuses an existing folder when no note names it', () => {
  untouched(leftFolder(), /no note names it.*nothing was changed/i)
})
it.each(['problem', 'repository', 'clone'] as const)('refuses a note for another %s', field => {
  const s = leftFolder(); writeFileSync(`${s.clone}.making.json`, JSON.stringify({ ...s.note, [field]: 'another' }))
  untouched(s, new RegExp(`another ${field === 'clone' ? 'clone path' : field}.*nothing was changed`, 'i'))
})
it.each(['{', 'null', '{"pid":0,"startedAt":""}'])('refuses an unreadable ownership note: %s', text => {
  const s = leftFolder(); writeFileSync(`${s.clone}.making.json`, text)
  untouched(s, /note.*cannot be read.*nothing was changed/i)
})
it('refuses a clone still being made by this same running process', () => {
  const s = leftFolder(); writeFileSync(`${s.clone}.making.json`, JSON.stringify(s.note))
  untouched(s, new RegExp(`still being made by process ${process.pid}.*nothing was changed`, 'i'))
})
it('replaces a clone when its pid belongs to a process with a different start time', () => {
  const s = leftFolder(); writeFileSync(`${s.clone}.making.json`, JSON.stringify({ ...s.note, startedAt: localStamp(new Date(0)) }))
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    prepareTakeBack(s.input)
    expect(existsSync(join(s.clone, 'kept'))).toBe(false)
    expect(stderr.mock.calls.map(call => String(call[0])).join('')).toMatch(`process ${process.pid} is now a process that began at`)
  } finally { stderr.mockRestore() }
})

it.each([200, 409])('keeps the removal sentence in TAKE-BACK when the office answers %s', async status => {
  const s = leftFolder(); writeFileSync(`${s.clone}.making.json`, JSON.stringify({ ...s.note, startedAt: localStamp(new Date(0)) }))
  const original = { entry: 'synthetic-entry', repository: s.root, files: ['one'], commits: [s.after], line: { agent: 'synthetic-line', starter: 'synthetic-starter', run: 'synthetic-round' }, landedAt: '2026-10-21 09:00:00', deadline: '2026-10-21 10:00:00', timeZone: 'UTC', hours: 1 }
  const ask = async (method: string, path: string) => {
    if (method === 'GET' && path.startsWith('/api/records/')) return { status: 200, body: { record: { data: { extra: { handBack: original } } } } }
    if (method === 'GET') return { status: 200, body: { entry: { title: 'A change' } } }
    return { status, body: { entry: { id: 'synthetic-take-back' }, run: 'synthetic-office-run', commit: 'synthetic-commit', error: 'Synthetic refusal.' } }
  }
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true), stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    expect(await runTakeBack({ chosen: { takeBack: s.input.problem }, workdir: join(s.root, '..'), ask, identity: s.input.identity, mainTools: mainTools() })).toBe(status === 200)
    const line = stdout.mock.calls.map(call => String(call[0])).find(text => text.startsWith('TAKE-BACK:'))
    expect(line).toContain(`Removed the left take-back clone ${s.clone}`)
    expect(line).toContain(`process ${process.pid} is now a process that began at`)
    expect(existsSync(s.clone)).toBe(false); expect(existsSync(`${s.clone}.making.json`)).toBe(false)
  } finally { stdout.mockRestore(); stderr.mockRestore() }
})

it.each(['no result', 'absent'] as const)('stops before the inverse clone or office write when main gives %s', async result => {
  const s = setup(), main = s.git('rev-parse', 'HEAD'), workdir = join(s.root, '..', 'owned')
  const facts = { entry: 'synthetic-entry', repository: s.root, files: ['one'], commits: [s.after], line: { agent: 'synthetic-line', starter: 'synthetic-starter', run: 'synthetic-round' }, landedAt: '2026-10-21 09:00:00', deadline: '2026-10-21 10:00:00', timeZone: 'UTC', hours: 1 }
  const ask = vi.fn(async (method: string, path: string) => method === 'GET' && path.startsWith('/api/records/')
    ? { status: 200, body: { record: { data: { extra: { handBack: facts } } } } }
    : { status: 200, body: { entry: { title: 'A change', id: 'synthetic' }, run: 'synthetic', commit: main } })
  if (result === 'absent') { s.git('rm', 'one'); s.git('commit', '-qm', 'Remove the test') }
  const tools = mainTools({ red: result === 'absent' ? false : null, absent: result === 'absent', log: result === 'absent' ? null : '/synthetic/no-result.log', noResult: result === 'absent' ? null : 'it left no readable report' })
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true), stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    expect(await runTakeBack({ chosen: { takeBack: 'synthetic-problem' }, workdir, ask, identity: s.input.identity, mainTools: tools })).toBe(false)
    expect(ask.mock.calls.every(([method]) => method === 'GET')).toBe(true)
    expect(existsSync(join(workdir, 'clone'))).toBe(false)
    const line = stdout.mock.calls.map(call => String(call[0])).find(text => text.startsWith('TAKE-BACK:'))!
    expect(line).toContain(s.git('rev-parse', 'HEAD')); expect(line).toContain(`one: ${result}`)
    if (result === 'no result') expect(line).toContain('it left no readable report')
  } finally { stdout.mockRestore(); stderr.mockRestore() }
})

it('stops without an office write or inverse when main cannot be built', async () => {
  const s = setup(), workdir = join(s.root, '..', 'owned')
  writeFileSync(join(s.root, 'package.json'), JSON.stringify({ scripts: { build: 'exit 1' } })); s.git('add', '.'); s.git('commit', '-qm', 'Main build script')
  const facts = { entry: 'synthetic-entry', repository: s.root, files: ['one'], commits: [s.after], line: { agent: 'synthetic-line', starter: 'synthetic-starter', run: 'synthetic-round' }, landedAt: '2026-10-21 09:00:00', deadline: '2026-10-21 10:00:00', timeZone: 'UTC', hours: 1 }
  const ask = vi.fn(async (method: string, path: string) => method === 'GET' && path.startsWith('/api/records/')
    ? { status: 200, body: { record: { data: { extra: { handBack: facts } } } } }
    : { status: 200, body: { entry: { title: 'A change', id: 'synthetic' }, run: 'synthetic', commit: s.after } })
  const tools = mainTools(); tools.runInSandbox.mockResolvedValue({ code: 1, outFile: '/synthetic/failed-main-build.log' })
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true), stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    expect(await runTakeBack({ chosen: { takeBack: 'synthetic-problem' }, workdir, ask, identity: s.input.identity, mainTools: tools })).toBe(false)
    expect(tools.runInSandbox).toHaveBeenCalledWith(expect.anything(), 'take-back-main-build', 'npm', ['run', 'build'], expect.objectContaining({ cwd: expect.stringContaining('take-back-main') }))
    expect(tools.runAlone).not.toHaveBeenCalled(); expect(ask.mock.calls.every(([method]) => method === 'GET')).toBe(true)
    expect(existsSync(join(workdir, 'clone'))).toBe(false)
    const line = stdout.mock.calls.map(call => String(call[0])).find(text => text.startsWith('TAKE-BACK:'))!
    expect(line).toContain('one: no result'); expect(line).toContain('build'); expect(line).toContain('/synthetic/failed-main-build.log')
  } finally { stdout.mockRestore(); stderr.mockRestore() }
})
