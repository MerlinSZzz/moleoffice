// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK-VIEW SWEEP RUNS DRY: it says of every view of an inspector instance whether it is kept, and why, or what
 * would move before it went, and it removes and moves nothing (tools/inspector-view-sweep.mjs).
 *
 * A check runs in a view, <instance>/check-views/<check>/ with home/, work/ and tmp/, which stays for good unless a
 * verdict was delivered. A view would go only when all four conditions hold: the check ended and will not be retried; no
 * process is in the view; nothing in it changed for THE_HOURS_A_VIEW_STAYS, 24 hours; no open problem or unanswered message names it. A reading
 * that cannot be made keeps the view and says which condition it could not read. The inspector may read only the messages
 * it is a party to, so the messages are such a reading, and no view here gets past them.
 *
 * Every instance folder here is made under this file's own temporary folder. The office, the processes, the clock and
 * the sleep are this file's stand-ins, so nothing here waits, and no real view, checks folder or office is read. Each
 * view's files are made now, so the sweep is told it runs an hour more than THE_HOURS_A_VIEW_STAYS later; a file this
 * file dates later than that is a change within those hours.
 */
import { execFile, execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import { startTimeOf, theChecksMarker } from '../tools/sandbox-common.mjs'
import { BETWEEN_SWEEP_ASKS_MS, SLOW_CHECKS_PER_START } from '../tools/sweep-run-scratch.mjs'
import { KEPT_ONLY_BY_THE_MESSAGES, THE_ENDED_CHECK_STATES, THE_HOURS_A_VIEW_STAYS, VIEW_SWEEP_LOG, VIEW_SWEEP_RULE, sweepTheCheckViews, theViewSweepBegins } from '../tools/inspector-view-sweep.mjs'
import { theProcessesNotRead, theProcessesUsing } from '../tools/scratch-folder-checks.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSTANCE = 'inspector-synthetic'
const WORKSPACE = 'synthetic-project'
const HOUR = 3_600_000
/** A synthetic login. It is not a real token, and the sweep may never write it anywhere. */
const LOGIN = 'synthetic-login-token-not-a-real-one'
/** What every made-up file holds. The sweep may never write it anywhere. */
const CONTENT = 'synthetic file content the sweep never reads'

let root = ''
let sandboxes = ''
let instanceDir = ''
let made = 0
let time = 0
/** The office's stand-in: what each record read answers, the problems that name each check, and what names each view. */
let sessions: Map<string, { status: number; body: unknown }>
let problems: Map<string, unknown[]>
let namedInside: Set<string>
let searched: Set<string>
let asks: { path: string; project: string; at: number; answered: number }[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'the-check-view-sweep-'))
  sandboxes = join(root, 'sandboxes')
  instanceDir = join(sandboxes, INSTANCE)
  mkdirSync(join(instanceDir, 'check-views'), { recursive: true })
  mkdirSync(join(instanceDir, 'checks'), { recursive: true })
  made = Date.now()
  time = new Date(2026, 10, 2, 12).getTime()
  sessions = new Map()
  problems = new Map()
  namedInside = new Set()
  searched = new Set()
  asks = []
})
afterEach(() => {
  for (const path of unreadable) chmodSync(path, 0o755)
  unreadable.length = 0
  rmSync(root, { recursive: true, force: true })
})
const unreadable: string[] = []

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=A test', '-c', 'user.email=a-test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim()

/**
 * A made-up view of an ended check: a claude-code transcript, a login, work/ as a commit with one changed and one new
 * file, and a file in tmp/. Its checks folder holds model-session.json. Answers whatever the office should say of it.
 */
function aView(check: string, { state = 'crashed', run = `run_${check.slice(4)}` } = {}): string {
  const view = join(instanceDir, 'check-views', check)
  mkdirSync(join(view, 'home', '.claude', 'projects', '-work'), { recursive: true })
  writeFileSync(join(view, 'home', '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: LOGIN } }), { mode: 0o600 })
  writeFileSync(join(view, 'home', '.claude', 'projects', '-work', 'synthetic-session.jsonl'), `${CONTENT}\n`.repeat(4))
  writeFileSync(join(view, 'home', 'notes.txt'), CONTENT)
  mkdirSync(join(view, 'tmp'))
  writeFileSync(join(view, 'tmp', 'scratch.txt'), `${CONTENT}${CONTENT}`)
  mkdirSync(join(view, 'work'))
  git(join(view, 'work'), 'init', '-q', '-b', 'main')
  writeFileSync(join(view, 'work', 'kept.txt'), 'Before.\n')
  writeFileSync(join(view, 'work', '.gitignore'), 'node_modules\n')
  git(join(view, 'work'), 'add', '-A')
  git(join(view, 'work'), 'commit', '-q', '-m', 'the tip')
  const tip = git(join(view, 'work'), 'rev-parse', 'HEAD')
  writeFileSync(join(view, 'work', 'kept.txt'), 'Changed by the model.\n')
  writeFileSync(join(view, 'work', 'new.txt'), CONTENT)
  mkdirSync(join(view, 'work', 'node_modules', 'a-dependency'), { recursive: true })
  writeFileSync(join(view, 'work', 'node_modules', 'a-dependency', 'index.js'), CONTENT)
  const checks = join(instanceDir, 'checks', `a-check-of-${run}-${check}`)
  mkdirSync(join(checks, 'records'), { recursive: true })
  writeFileSync(join(checks, 'model-session.json'), JSON.stringify({ run, check, runtime: 'claude-code', model: 'none', session: 'synthetic-session', tip, home: join(view, 'home') }), { mode: 0o600 })
  sessions.set(check, { status: 200, body: { record: { id: check, kind: 'session', deletedAt: null, data: { state } } } })
  return view
}

/** What the stand-in office answers, and how long it takes: 50 ms for a record or a list, 5 s for the two slow doors. */
function theAnswerTo(path: string, project: string): { cost: number; answer: { status: number | null; body: unknown } } {
  const url = new URL(`http://synthetic${path}`)
  if (url.pathname === '/api/report-files/named-inside') {
    const folder = url.searchParams.get('folder') ?? ''
    const hiddenCount = namedInside.has(folder) ? 1 : 0
    return { cost: 5_000, answer: { status: 200, body: { folder, records: [], hiddenCount, scope: 'Synthetic scope.', says: `Synthetic: ${String(hiddenCount)} records name it.` } } }
  }
  if (url.pathname === '/api/search') {
    const matched = searched.has(url.searchParams.get('q') ?? '') ? 1 : 0
    return { cost: 5_000, answer: { status: 200, body: { counts: { matched }, elsewhere: [] } } }
  }
  if (url.pathname === '/api/records' && url.searchParams.get('kind') === 'problem') {
    const named = problems.get(url.searchParams.get('q') ?? '')
    if (named === null) return { cost: 50, answer: { status: 200, body: { records: [], truncated: true, left: 3 } } }
    return { cost: 50, answer: { status: 200, body: { records: ((named as Record<string, unknown>[] | null) ?? []).map((one) => ({ ...one, incompleteCount: 0 })), truncated: false, left: 0 } } }
  }
  const id = decodeURIComponent(url.pathname.slice('/api/records/'.length))
  const elsewhere = sessions.get(`${project}:${id}`)
  if (elsewhere !== undefined) return { cost: 50, answer: elsewhere }
  return { cost: 50, answer: sessions.get(id) ?? { status: 404, body: { error: 'Synthetic: no such record.' } } }
}

type Swept = { check: string; view: string; kept: boolean; reason: string; wouldMove: { says: string } | null }[]

async function sweep(options: { now?: number; ownCheck?: string | null; processes?: (real: string) => { using: string[]; unreadable: string[] }; entries?: number } = {}): Promise<Swept> {
  return await sweepTheCheckViews({ instanceDir, sandboxes, instance: INSTANCE, workspace: WORKSPACE, ownCheck: options.ownCheck ?? null,
    now: options.now ?? made + (THE_HOURS_A_VIEW_STAYS + 1) * HOUR, processes: options.processes ?? (() => ({ using: [], unreadable: [] })),
    clock: () => time, sleep: async (ms: number) => { time += ms },
    ...(options.entries === undefined ? {} : { entries: options.entries }),
    ask: async (path: string, project: string) => {
      const at = time
      const { cost, answer } = theAnswerTo(path, project)
      time += cost
      asks.push({ path, project, at, answered: time })
      return answer
    } }) as Swept
}

const theLog = (): string[] => readFileSync(join(instanceDir, 'logs', VIEW_SWEEP_LOG), 'utf8').split('\n').filter((line) => line !== '')
const theLineAbout = (check: string): string[] => theLog().filter((line) => line.includes(` the view of check ${check} at `))
const reasonOf = (swept: Swept, check: string): string => {
  const one = swept.filter((view) => view.check === check)
  expect(one, `the sweep said ${String(one.length)} things of ${check}`).toHaveLength(1)
  return one[0]!.reason
}

/** Every entry under `path`: its kind, size, mode, and modification and change times. Nothing is read. */
function theTree(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (at: string): void => {
    const info = lstatSync(at)
    out[at] = `${info.isDirectory() ? 'd' : info.isSymbolicLink() ? 'l' : 'f'} ${String(info.size)} ${info.mode.toString(8)} ${String(info.mtimeMs)} ${String(info.ctimeMs)}`
    if (info.isDirectory()) for (const name of readdirSync(at)) walk(join(at, name))
  }
  walk(path)
  return out
}

describe('the check-view sweep runs dry', () => {
  it('writes how far it got when its check ends during a sweep', async () => {
    writeFileSync(join(instanceDir, 'check-views', 'a-first'), CONTENT)
    aView('chk_waiting1')
    let entered!: () => void
    const waiting = new Promise<void>((resolve) => { entered = resolve })
    const run = theViewSweepBegins({ instanceDir, sandboxes, instance: INSTANCE, workspace: WORKSPACE,
      ask: (_path: string, _project: string, signal: AbortSignal) => new Promise((_resolve, reject) => {
        entered(); signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }) })
    await waiting
    run.stop(); await run.done
    expect(theLog()).toHaveLength(3)
    expect(theLog().at(-1)).toMatch(/stopped because its check ended: 1 view read, and nothing was removed or moved\.$/)
  })

  it.each(['exit', 'complete'])('writes exactly one closing line when the inspector %s', async (how) => {
    writeFileSync(join(instanceDir, 'check-views', 'a-first'), CONTENT)
    aView('chk_waiting1')
    const script = `
      import { theViewSweepBegins } from ${JSON.stringify(new URL('../tools/inspector-view-sweep.mjs', import.meta.url).href)};
      const [instanceDir, sandboxes, instance, workspace, how] = process.argv.slice(1);
      const run = theViewSweepBegins({ instanceDir, sandboxes, instance, workspace,
        ask: () => how === 'exit' ? new Promise(() => { process.send('ready') }) : Promise.resolve({ status: 404, body: null }) });
      process.on('SIGTERM', () => process.exit(0));
      if (how !== 'exit') { await run.done; process.send('ready'); }
    `
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, instanceDir, sandboxes, INSTANCE, WORKSPACE, how],
      { cwd: root, detached: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('MOLE_'))) })
    const group = child.pid!
    try {
      await new Promise<void>((resolve, reject) => { child.once('message', () => resolve()); child.once('error', reject); child.once('exit', () => reject(new Error('child exited before ready'))) })
      const ended = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      process.kill(-group, 'SIGTERM'); await ended
      const log = theLog()
      expect(log.filter((line) => /the dry sweep of .* (?:ended|stopped)/.test(line))).toHaveLength(1)
      if (how === 'exit') expect(log.at(-1)).toMatch(/stopped because the inspector exited: 1 view read, and nothing was removed or moved\.$/)
      else expect(log.at(-1)).toMatch(/ended: 2 views read/)
    } finally { try { process.kill(-group, 'SIGKILL') } catch { /* group already ended */ } }
  })

  it('does not keep a view for an unreadable kernel thread', async () => {
    aView('chk_kernel01')
    const proc = join(root, 'proc'), at = join(proc, '17')
    mkdirSync(join(at, 'fd'), { recursive: true }); symlinkSync(root, join(at, 'cwd'))
    writeFileSync(join(at, 'comm'), 'kernel\n'); writeFileSync(join(at, 'status'), 'Name:\tkernel\nUid:\t0\t0\t0\t0\n')
    writeFileSync(join(at, 'stat'), '17 (kernel) S 2 0 0 0 0 2097152 0\n')
    chmodSync(join(at, 'fd'), 0); unreadable.push(join(at, 'fd'))
    const swept = await sweep({ processes: (real) => theProcessesUsing(real, proc) })
    expect(reasonOf(swept, 'chk_kernel01')).toBe(KEPT_ONLY_BY_THE_MESSAGES)
  })

  it('keeps a view for all unreadable processes while showing only the first five', async () => {
    aView('chk_hidden01')
    const hidden = Array.from({ length: 400 }, (_, n) => `synthetic process ${String(n + 1)}`)
    const swept = await sweep({ processes: () => ({ using: [], unreadable: hidden }) })
    const reason = reasonOf(swept, 'chk_hidden01')
    expect(reason).toContain(theProcessesNotRead(hidden))
    expect(reason).toMatch(/400 processes/)
    for (const process of hidden.slice(0, 5)) expect(reason).toContain(process)
    expect(reason).toContain('and 395 more')
    expect(reason).not.toContain(`${hidden[5]};`)
    expect(reason).toMatch(/^condition 2 could not be read:/)
  })
  it('says what would move for a view every other reading would let go, and removes nothing', async () => {
    const view = aView('chk_ended_01')
    const swept = await sweep()
    expect(swept).toHaveLength(1)
    expect(swept[0]!.wouldMove?.says).toBe(
      `the transcript ${join(view, 'home', '.claude', 'projects', '-work', 'synthetic-session.jsonl')}, ${String(4 * (CONTENT.length + 1))} bytes; ` +
        'work/ has changes in 2 files; ' +
        `everything else in home/ and tmp/, 2 files of ${String(3 * CONTENT.length)} bytes, leaving out the logins and node_modules`)
    expect(theLineAbout('chk_ended_01')).toHaveLength(1)
    expect(theLineAbout('chk_ended_01')[0]).toContain(`What would move: ${swept[0]!.wouldMove!.says}.`)
    expect(existsSync(view)).toBe(true)
  })

  it('keeps a view whose check has not ended, naming condition 1', async () => {
    const states = ['running', 'idle', 'paused', 'interrupted']
    for (const [n, state] of states.entries()) aView(`chk_state_0${String(n)}`, { state })
    aView('chk_nostate_0')
    sessions.set('chk_nostate_0', { status: 200, body: { record: { id: 'chk_nostate_0', kind: 'session', deletedAt: null, data: {} } } })
    aView('chk_notses_00')
    sessions.set('chk_notses_00', { status: 200, body: { record: { id: 'chk_notses_00', kind: 'report', deletedAt: null, data: { state: 'crashed' } } } })
    aView('chk_deleted_0')
    sessions.set('chk_deleted_0', { status: 200, body: { record: { id: 'chk_deleted_0', kind: 'session', deletedAt: '2026-11-01 10:00:00', data: { state: 'crashed' } } } })
    const swept = await sweep()
    for (const [n, state] of states.entries()) expect(reasonOf(swept, `chk_state_0${String(n)}`)).toBe(`condition 1: its session is ${state}, not ended.`)
    expect(reasonOf(swept, 'chk_nostate_0')).toBe('condition 1: its session is in no state anybody gave, not ended.')
    expect(reasonOf(swept, 'chk_notses_00')).toBe("condition 1: record chk_notses_00 is a report, not a check's session.")
    expect(reasonOf(swept, 'chk_deleted_0')).toBe('condition 1: the session chk_deleted_0 is deleted, so whether its check ended cannot be said.')
    expect(swept.every((one) => one.kept)).toBe(true)
    expect(THE_ENDED_CHECK_STATES).toEqual(['finished', 'crashed', 'orphaned'])
  })

  it('reads a check filed in another project there, once', async () => {
    aView('chk_elsewhr1')
    sessions.set('chk_elsewhr1', { status: 404, body: { error: 'Synthetic: filed elsewhere.', elsewhere: { workspaceId: 'another-project' } } })
    sessions.set('another-project:chk_elsewhr1', { status: 200, body: { record: { id: 'chk_elsewhr1', kind: 'session', deletedAt: null, data: { state: 'running' } } } })
    const swept = await sweep()
    expect(reasonOf(swept, 'chk_elsewhr1')).toBe('condition 1: its session is running, not ended.')
    expect(asks.filter((one) => one.path === '/api/records/chk_elsewhr1').map((one) => one.project)).toEqual([WORKSPACE, 'another-project'])
  })

  it('keeps a view whose check the office could not give, saying condition 1 could not be read', async () => {
    aView('chk_missing1')
    sessions.delete('chk_missing1')
    aView('chk_refused1')
    sessions.set('chk_refused1', { status: 403, body: { error: 'Synthetic: refused.' } })
    aView('chk_nobody01')
    sessions.set('chk_nobody01', { status: null as unknown as number, body: null })
    const swept = await sweep()
    expect(reasonOf(swept, 'chk_missing1')).toBe('condition 1 could not be read: the office gave no record chk_missing1 (status 404).')
    expect(reasonOf(swept, 'chk_refused1')).toBe('condition 1 could not be read: the office gave no record chk_refused1 (status 403).')
    expect(reasonOf(swept, 'chk_nobody01')).toMatch(/^condition 1 could not be read: the office gave no record chk_nobody01 \(nothing answered/)
    expect(swept.every((one) => one.kept)).toBe(true)
  })

  it('keeps a view whose marker names a running check, and one whose marker cannot be read', async () => {
    aView('chk_marked01')
    aView('chk_badmark1')
    aView('chk_oldmark1')
    for (const [check, words] of [
      ['chk_marked01', JSON.stringify({ pid: process.pid, started: startTimeOf(process.pid) })],
      ['chk_badmark1', '{ this is not a marker'],
      ['chk_oldmark1', JSON.stringify({ pid: process.pid, started: 'another start' })],
    ] as const) {
      mkdirSync(dirname(theChecksMarker(sandboxes, INSTANCE, check)), { recursive: true })
      writeFileSync(theChecksMarker(sandboxes, INSTANCE, check), words)
    }
    const before = readFileSync(theChecksMarker(sandboxes, INSTANCE, 'chk_oldmark1'), 'utf8')
    const swept = await sweep()
    expect(reasonOf(swept, 'chk_marked01')).toBe(`condition 2: the marker ${theChecksMarker(sandboxes, INSTANCE, 'chk_marked01')} names process ${String(process.pid)}, which is still running.`)
    expect(reasonOf(swept, 'chk_badmark1')).toMatch(new RegExp(`^condition 2 could not be read: the marker ${theChecksMarker(sandboxes, INSTANCE, 'chk_badmark1').replaceAll('.', '\\.')} could not be read`))
    // A MARKER WHOSE PROCESS IS GONE holds nothing, and the sweep leaves it where it is.
    expect(reasonOf(swept, 'chk_oldmark1')).not.toMatch(/^condition 2/)
    expect(readFileSync(theChecksMarker(sandboxes, INSTANCE, 'chk_oldmark1'), 'utf8')).toBe(before)
  })

  it('keeps a view a process uses, and one whose processes could not be read', async () => {
    const using = aView('chk_process1')
    const notRead = aView('chk_noproc01')
    const swept = await sweep({ processes: (real: string) => real.endsWith(`/${'chk_process1'}`)
      ? { using: [`process 4242 works in it`], unreadable: [] }
      : real.endsWith('/chk_noproc01') ? { using: [], unreadable: ['process 4343 (synthetic, nobody), whose open files were refused (EACCES)'] } : { using: [], unreadable: [] } })
    expect(reasonOf(swept, 'chk_process1')).toBe('condition 2: process 4242 works in it.')
    expect(reasonOf(swept, 'chk_noproc01')).toBe("condition 2 could not be read: 1 process could not be read by this helper's user: process 4343 (synthetic, nobody), whose open files were refused (EACCES).")
    expect(existsSync(using) && existsSync(notRead)).toBe(true)
  })

  // THE HOURS ARE THE INFRASTRUCTURE AGENT'S TO SET, and it set 24 for a view the rule for a check with no verdict keeps.
  it('keeps a view for 24 hours since its last change', () => {
    expect(THE_HOURS_A_VIEW_STAYS).toBe(24)
    expect(VIEW_SWEEP_RULE).toContain('nothing in it changed for 24 hours')
  })

  it('keeps a view with a file changed within the hours a view stays, naming condition 3, and one it could not read through', async () => {
    const view = aView('chk_recent01')
    const changed = join(view, 'tmp', 'scratch.txt')
    utimesSync(changed, new Date(made + 2 * HOUR), new Date(made + 2 * HOUR))
    const closed = join(aView('chk_closed02'), 'tmp', 'a-closed-folder')
    mkdirSync(closed)
    chmodSync(closed, 0o000)
    unreadable.push(closed)
    const swept = await sweep()
    expect(reasonOf(swept, 'chk_recent01')).toBe(`condition 3: ${changed} changed at ${localStampOf(new Date(lstatSync(changed).mtimeMs))}, within ${String(THE_HOURS_A_VIEW_STAYS)} hours.`)
    expect(reasonOf(swept, 'chk_closed02')).toBe(`condition 3 could not be read: ${closed} could not be read (EACCES).`)
    const fresh = await sweep({ now: made + HOUR })
    expect(reasonOf(fresh, 'chk_recent01')).toMatch(/^condition 3: /)
  })

  it('keeps a view past the sweep\'s bound as not read whole, and reads it first at the next sweep', async () => {
    const whole = aView('chk_bound_01')
    aView('chk_bound_02')
    // THE BOUND HOLDS THE FIRST VIEW EXACTLY, its own folder and every entry under it, so the second is cut off.
    const entries = Object.keys(theTree(whole)).length
    const first = await sweep({ entries })
    expect(first.map((one) => one.check)).toEqual(['chk_bound_01', 'chk_bound_02'])
    expect(first[0]!.reason).not.toMatch(/^it was not read whole/)
    expect(first[1]!.reason).toBe(`it was not read whole: this sweep reads ${String(entries)} entries at most over all views, so a later sweep reads it first.`)
    time += HOUR
    const second = await sweep({ entries })
    expect(second.map((one) => one.check)).toEqual(['chk_bound_02', 'chk_bound_01'])
    expect(second[0]!.reason).not.toMatch(/^it was not read whole/)
  })

  it('keeps a view an open problem names, or one with no state, or when the problem list was cut; not an ended one', async () => {
    aView('chk_problem1')
    problems.set('chk_problem1', [{ id: 'problem_0001', kind: 'problem', data: { state: 'fixed' } }, { id: 'problem_0002', kind: 'problem', data: { state: 'open' } }])
    aView('chk_problem2')
    problems.set('chk_problem2', [{ id: 'problem_0003', kind: 'problem', data: {} }])
    aView('chk_problem3')
    problems.set('chk_problem3', null as unknown as unknown[])
    aView('chk_problem4')
    problems.set('chk_problem4', [{ id: 'problem_0004', kind: 'problem', data: { state: 'fixed' } }, { id: 'problem_0005', kind: 'problem', data: { state: 'worked_around' } }, { id: 'problem_0006', kind: 'problem', data: { state: 'accepted' } }])
    const swept = await sweep()
    expect(reasonOf(swept, 'chk_problem1')).toBe('condition 4: problem problem_0002 names the check and is open.')
    expect(reasonOf(swept, 'chk_problem2')).toBe('condition 4: problem problem_0003 names the check and is in no state anybody gave.')
    expect(reasonOf(swept, 'chk_problem3')).toBe('condition 4 could not be read: the office could not give every problem that names the check.')
    expect(reasonOf(swept, 'chk_problem4')).not.toMatch(/problem/)
    expect(asks.filter((one) => one.path.startsWith('/api/records?kind=problem')).map((one) => new URL(`http://synthetic${one.path}`).searchParams.get('q')).sort())
      .toEqual(['chk_problem1', 'chk_problem2', 'chk_problem3', 'chk_problem4'])
  })

  it('keeps a view a record names a file inside, or whose path a search finds', async () => {
    const inside = aView('chk_named_01')
    namedInside.add(inside)
    const found = aView('chk_found_01')
    searched.add(found)
    const swept = await sweep()
    expect(reasonOf(swept, 'chk_named_01')).toBe(`condition 4: 1 record names files inside ${inside}, 0 you can read and 1 you may not.`)
    expect(reasonOf(swept, 'chk_found_01')).toBe("condition 4: a record names the view's path.")
  })

  it('keeps a view only the messages keep, saying why, and counts it apart in the closing line', async () => {
    aView('chk_message1')
    aView('chk_message2')
    aView('chk_another1', { state: 'running' })
    const swept = await sweep()
    expect(KEPT_ONLY_BY_THE_MESSAGES).toBe('condition 4 could not be read: the messages that name the check could not be read, because the inspector may read only the messages it is a party to; every other reading would let it go.')
    for (const check of ['chk_message1', 'chk_message2']) {
      expect(reasonOf(swept, check)).toBe(KEPT_ONLY_BY_THE_MESSAGES)
      expect(swept.find((one) => one.check === check)!.wouldMove?.says).toMatch(/^the transcript /)
      expect(theLineAbout(check)[0]).toContain(`is kept: ${KEPT_ONLY_BY_THE_MESSAGES} What would move: `)
    }
    expect(swept.find((one) => one.check === 'chk_another1')!.wouldMove).toBeNull()
    expect(swept.every((one) => one.kept)).toBe(true)
    expect(theLog().at(-1)).toMatch(/ ended: 3 views read, 1 kept by another reading, 2 kept only because the messages could not be read, and nothing was removed or moved\.$/)
    expect(VIEW_SWEEP_RULE).toContain('the messages that name a check are such a reading because the inspector may read only the messages it is a party to')
  })

  it(`asks the slow doors about ${String(SLOW_CHECKS_PER_START)} views at most, and no ask sooner than ${String(BETWEEN_SWEEP_ASKS_MS)} ms after the answer before it`, async () => {
    const views = Array.from({ length: SLOW_CHECKS_PER_START + 2 }, (_, n) => aView(`chk_slow_${String(n).padStart(3, '0')}`))
    const swept = await sweep()
    expect(asks.filter((one) => one.path.startsWith('/api/report-files/named-inside?'))).toHaveLength(SLOW_CHECKS_PER_START)
    expect(swept.filter((one) => one.reason === `it is not checked this time: one sweep asks the slow record checks about ${String(SLOW_CHECKS_PER_START)} views at most, so it waits for a later sweep.`)).toHaveLength(2)
    expect(asks.length).toBeGreaterThanOrEqual(views.length + 3 * SLOW_CHECKS_PER_START)
    for (let i = 1; i < asks.length; i += 1) {
      expect(asks[i]!.at - asks[i - 1]!.answered, `${asks[i]!.path} was asked too soon after ${asks[i - 1]!.path}`).toBeGreaterThanOrEqual(BETWEEN_SWEEP_ASKS_MS)
    }
  })

  it('passes a .REMOVED.txt by with no line, keeps any other file or link and its own check, saying so', async () => {
    writeFileSync(join(instanceDir, 'check-views', 'chk_gone_001.REMOVED.txt'), 'Removed by hand.\n')
    writeFileSync(join(instanceDir, 'check-views', 'a-stray-file'), CONTENT)
    const target = aView('chk_target01')
    symlinkSync(target, join(instanceDir, 'check-views', 'chk_alink_01'))
    aView('chk_own_0001')
    const swept = await sweep({ ownCheck: 'chk_own_0001' })
    expect(swept.map((one) => one.check)).not.toContain('chk_gone_001.REMOVED.txt')
    expect(theLog().some((line) => line.includes('REMOVED.txt'))).toBe(false)
    expect(reasonOf(swept, 'a-stray-file')).toBe('it is not a folder.')
    expect(reasonOf(swept, 'chk_alink_01')).toBe('it is a link, and no link is followed.')
    expect(reasonOf(swept, 'chk_own_0001')).toBe('it is the view of the check whose start began this sweep.')
  })

  it('keeps a view with no checks folder, or two, and says so', async () => {
    aView('chk_nofold01')
    rmSync(join(instanceDir, 'checks', 'a-check-of-run_nofold01-chk_nofold01'), { recursive: true })
    aView('chk_twofold1')
    mkdirSync(join(instanceDir, 'checks', 'a-check-of-run_another1-chk_twofold1'))
    const swept = await sweep()
    expect(reasonOf(swept, 'chk_nofold01')).toBe(`no checks folder a-check-of-<run>-chk_nofold01 is in ${join(instanceDir, 'checks')}.`)
    expect(reasonOf(swept, 'chk_twofold1')).toBe(`2 checks folders in ${join(instanceDir, 'checks')} end in -chk_twofold1.`)
  })

  it('changes nothing but its log, and asks the office only to read', async () => {
    aView('chk_still_01')
    aView('chk_still_02', { state: 'running' })
    writeFileSync(join(instanceDir, 'check-views', 'chk_gone_002.REMOVED.txt'), 'Removed by hand.\n')
    // AN INSTANCE FOLDER HAS ITS LOGS FOLDER ALREADY, where the sweep's log goes beside the others.
    mkdirSync(join(instanceDir, 'logs'))
    const before = theTree(instanceDir)
    await sweep()
    const after = theTree(instanceDir)
    delete after[join(instanceDir, 'logs', VIEW_SWEEP_LOG)]
    delete after[join(instanceDir, 'logs')]
    delete before[join(instanceDir, 'logs')]
    expect(after).toEqual(before)
    expect(asks.length).toBeGreaterThan(0)
  })

  it('counts and sizes a file in tmp/ it may not open, since it reads home/ and tmp/ with lstat alone', async () => {
    const view = aView('chk_closed01')
    const closed = join(view, 'tmp', 'closed.txt')
    writeFileSync(closed, CONTENT)
    chmodSync(closed, 0o000)
    unreadable.push(closed)
    const swept = await sweep()
    expect(swept[0]!.reason).not.toMatch(/^condition 3/)
    expect(swept[0]!.wouldMove?.says).toContain(`everything else in home/ and tmp/, 3 files of ${String(4 * CONTENT.length)} bytes`)
  })

  it('logs the rule, one line per view and a closing line, with no login or file content', async () => {
    aView('chk_logged01')
    aView('chk_logged02', { state: 'running' })
    await sweep()
    const log = theLog()
    expect(log[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} a dry sweep of the check views in /)
    expect(log[0]).toContain(`Rule: ${VIEW_SWEEP_RULE}`)
    expect(log.slice(1, -1)).toHaveLength(2)
    expect(log.at(-1)).toMatch(/ended: 2 views read, 1 kept by another reading, 1 kept only because the messages could not be read, and nothing was removed or moved\.$/)
    const text = log.join('\n')
    expect(text).not.toContain(LOGIN)
    expect(text).not.toContain(CONTENT)
    expect(VIEW_SWEEP_RULE.split(/\. /).length).toBeLessThanOrEqual(2)
  })

  it('sweeps a named instance folder once from the command line, and prints the lines it logs', async () => {
    aView('chk_command1', { state: 'running' })
    const reads: string[] = []
    const office: Server = createServer((request, reply) => {
      reads.push(`${String(request.method)} ${String(request.url)}`)
      const { answer } = theAnswerTo(String(request.url), String(request.headers['x-mole-office-workspace']))
      reply.writeHead(answer.status ?? 500, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body))
    })
    await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
    try {
      const api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
      const ran = await new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
        execFile(process.execPath, [join(REPO, 'tools', 'inspector-view-sweep.mjs'), 'sweep', instanceDir, '--api', api],
          // NO OFFICE VARIABLE OF THIS RUN reaches the tool, so it sends no key to the stand-in.
          { cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('MOLE_'))), MOLE_OFFICE_WORKSPACE: WORKSPACE } },
          (error, stdout, stderr) => { done({ status: error === null ? 0 : typeof error.code === 'number' ? error.code : null, stdout, stderr }) })
      })
      expect(ran.status, ran.stderr).toBe(0)
      expect(reads).toEqual(['GET /api/records/chk_command1'])
      expect(ran.stdout).toContain(`Rule: ${VIEW_SWEEP_RULE}`)
      expect(ran.stdout).toContain(`the view of check chk_command1 at ${join(instanceDir, 'check-views', 'chk_command1')} is kept: condition 1: its session is running, not ended.`)
      expect(theLineAbout('chk_command1')).toHaveLength(1)
      // THE CLOSING LINE, without its time, ends what the command prints.
      expect(ran.stdout).toContain(`${theLog().at(-1)!.replace(/^\S+ \S+ /, '')} The lines are in ${join(instanceDir, 'logs', VIEW_SWEEP_LOG)}.\n`)
    } finally {
      office.close()
    }
  })
})
