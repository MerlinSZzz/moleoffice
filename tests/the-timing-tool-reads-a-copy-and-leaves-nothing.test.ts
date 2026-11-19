// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** One real server proves the copy's credential and allowed environment. Small child services exercise
 * SIGTERM and SIGINT through the same tool command and cleanup, each in its own temporary checkout. */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { END_LIMIT_MS, FROM_THE_SHELL, SET_HERE, START_LIMIT_MS, THE_SERVER_ANSWERS, THE_TEST_GUARD } from '../tools/time-the-attention-read.mjs'
import { freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const TOOL = fileURLToPath(new URL('../tools/time-the-attention-read.mjs', import.meta.url))

/** Names planted in the tool's environment that must not reach its server. The values are made up. */
const PLANTED = {
  ANTHROPIC_API_KEY: 'made-up-for-this-test',
  HTTPS_PROXY: 'http://127.0.0.1:9',
  SSH_AUTH_SOCK: '/nowhere/made-up.sock',
  CLAUDE_CODE_MADE_UP: 'made-up-for-this-test',
  MOLE_OFFICE_KEY: 'made-up-for-this-test',
}

/**
 * THE READ RECORDER'S TWO NAMES. The merge queue runs the whole suite with tools/record-what-tests-read.mjs in
 * NODE_OPTIONS and TEST_READ_ROOT and TEST_READ_RECORD set (runTheSuite in tools/merge-tool/testing.mjs). NODE_OPTIONS
 * is one of FROM_THE_SHELL, so the recorder loads in the tool as well, and it gives every child started with an
 * environment of its own these two names back, as the guard does with THE_TEST_GUARD. So the tool's server carries
 * them exactly when this test process does. They are allowed only then; with the recorder off, as under
 * tools/run-named-tests.mjs, they are refused like any other name. The recorder is on only when both are set.
 */
const THE_READ_RECORDER = ['TEST_READ_ROOT', 'TEST_READ_RECORD'] as const
const THE_READ_RECORDER_IS_ON = THE_READ_RECORDER.every((name) => (process.env[name] ?? '') !== '')

/**
 * HOW LONG ONE RUN OF THE TOOL MAY TAKE HERE: the tool's own start limit, and a minute for its nine reads
 * and its own end. A run still going then is stopped, and the case says what the tool was waiting for.
 * The tool's longest wait is its start, so a run that went past its start limit and its end limits has
 * a fault, not a slow machine.
 */
const A_RUN_MAY_TAKE_MS = START_LIMIT_MS + 60_000
/** A stopped run is sent SIGTERM, and SIGKILL when it has not ended once its own end limits are over. */
const A_STOPPED_RUN_MAY_TAKE_MS = 2 * END_LIMIT_MS + 5_000
/** Each case's limit: a whole run, the time to stop it, and the case's own reading of the run. */
const A_CASE_MAY_TAKE_MS = A_RUN_MAY_TAKE_MS + 2 * A_STOPPED_RUN_MAY_TAKE_MS + 15_000

let t: TestDb
const folders: string[] = []
const groups = new Set<number>()
/** The tool's own processes that have not ended yet. Each is ended in afterAll, whichever case failed. */
const tools = new Set<ReturnType<typeof spawn>>()

interface ToolRun {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  /** The server's process group, from the tool's line that says the server answers. */
  group: number | null
  /** Whether any process of the server's group was there the moment the tool had ended. */
  groupLeftAtTheEnd: boolean
  /** The tool's own TMPDIR, and what was in it when the tool had ended. */
  tmp: string
  leftInTmp: string[]
}

function theGroupIsThere(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

/** Every process whose process group is `group`, from /proc. */
function processesOf(group: number): number[] {
  const found: number[] = []
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      // The fields after the command, which is in brackets and may hold spaces: state, ppid, pgrp.
      const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (Number(after[2]) === group) found.push(Number(name))
    } catch {
      // ended meanwhile
    }
  }
  return found
}

/** What a process is running: its name and its command line, for a failure to say which process it means. */
function whatRuns(pid: number): string {
  const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
  const command = readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').split('\0').join(' ').trim()
  return `${stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'))}: ${command.slice(0, 200)}`
}

/** The names in a process's environment. */
function namesInTheEnvironmentOf(pid: number): string[] {
  return readFileSync(`/proc/${String(pid)}/environ`, 'utf8')
    .split('\0')
    .filter((one) => one !== '')
    .map((one) => one.slice(0, one.indexOf('=')))
}

/** Send a signal to a process if it is still there. */
function signal(child: ReturnType<typeof spawn>, which: NodeJS.Signals): void {
  if (child.exitCode === null && child.signalCode === null) child.kill(which)
}

/** End a run of the tool as its own SIGTERM is meant to, and with SIGKILL when that is not enough. */
function endTheTool(tool: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((ok) => {
    if (tool.exitCode !== null || tool.signalCode !== null) return ok()
    const kill = setTimeout(() => signal(tool, 'SIGKILL'), A_STOPPED_RUN_MAY_TAKE_MS)
    tool.once('exit', () => {
      clearTimeout(kill)
      ok()
    })
    signal(tool, 'SIGTERM')
  })
}

/**
 * Run the tool on the test's database with a TMPDIR of its own. `whenTheServerAnswers` is called once
 * the tool says its server answers, with the group and the tool's child process. `preload` is a module
 * the tool's own node loads first. A run that has not ended within `A_RUN_MAY_TAKE_MS` is ended, and
 * the promise is refused with what the tool was waiting for and what it had written.
 */
function runTheTool(
  extra: string[],
  standIn: boolean | 'startup-failure' = false,
  whenTheServerAnswers?: (group: number, tool: ReturnType<typeof spawn>) => void | Promise<void>,
  preload?: { module: string; env: Record<string, string> },
): Promise<ToolRun> {
  const tmp = mkdtempSync(join(tmpdir(), 'mole-office-timing-tool-test-'))
  folders.push(tmp)
  let checkout = CHECKOUT
  if (standIn) {
    checkout = join(tmp, 'checkout')
    mkdirSync(join(checkout, 'src/server'), { recursive: true })
    symlinkSync(join(CHECKOUT, 'node_modules'), join(checkout, 'node_modules'))
    writeFileSync(join(checkout, 'package.json'), '{"type":"module"}')
    writeFileSync(join(checkout, 'src/server/index.ts'), standIn === 'startup-failure' ? `
      console.error('Synthetic startup refusal: the fixture cannot start.')
      process.exit(1)
    ` : `
      import {createServer} from 'node:http'
      import {writeFileSync} from 'node:fs'
      import {keysPathFrom} from ${JSON.stringify(join(CHECKOUT, 'src/config/settings.mjs'))}
      writeFileSync(keysPathFrom({MOLE_OFFICE_DB:process.env.MOLE_OFFICE_DB}),JSON.stringify({person:'synthetic-copy-key'}))
      const app=createServer((_q,s)=>{s.setHeader('content-type','application/json');s.end('{}')})
      app.listen({fd:Number(process.env.MOLE_OFFICE_LISTEN_FD)})
      process.on('SIGTERM',()=>app.close(()=>process.exit(0)))
    `)
  }
  const loads = preload === undefined ? [] : ['--import', preload.module]
  const tool = spawn(process.execPath, [...loads, TOOL, '--database', t.file, '--checkout', checkout, ...extra], {
    cwd: CHECKOUT,
    env: { ...process.env, ...PLANTED, ...preload?.env, TMPDIR: tmp },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  tools.add(tool)
  let stdout = ''
  let stderr = ''
  let group: number | null = null
  let called: Promise<void> = Promise.resolve()
  tool.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })
  tool.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
    const said = new RegExp(`${THE_SERVER_ANSWERS} at port \\d+, process group (\\d+)`).exec(stderr)
    if (said !== null && group === null) {
      group = Number(said[1])
      groups.add(group)
      if (whenTheServerAnswers !== undefined) called = Promise.resolve(whenTheServerAnswers(group, tool))
    }
  })
  let overran = false
  const deadline = setTimeout(() => {
    overran = true
    void endTheTool(tool)
  }, A_RUN_MAY_TAKE_MS)
  return new Promise((ok, fail) => {
    tool.on('error', fail)
    // 'close' and not 'exit': the tool's last lines are read only once its output has closed.
    tool.on('close', (code, signal) => {
      clearTimeout(deadline)
      tools.delete(tool)
      const groupLeftAtTheEnd = group !== null && theGroupIsThere(group)
      if (standIn) rmSync(checkout, { recursive: true, force: true })
      const leftInTmp = readdirSync(tmp)
      if (overran) {
        const waitingFor = group === null ? 'its server to answer GET /api/health' : `its reads, from the server in process group ${String(group)}`
        fail(new Error(`The tool had not ended ${String(A_RUN_MAY_TAKE_MS / 1000)} s after it started, so it was ended. It was waiting for ${waitingFor}. ` +
          `It then ended with code ${String(code)} and signal ${String(signal)}, and left ${leftInTmp.join(', ') || 'nothing'} in its temporary folder. Its error output:\n${stderr}`))
        return
      }
      called.then(() => ok({ code, signal, stdout, stderr, group, groupLeftAtTheEnd, tmp, leftInTmp }), fail)
    })
  })
}

/** What a run says about itself in a failure: its exit, its error output and what it left. */
function said(run: ToolRun): string {
  return `the tool ended with code ${String(run.code)} and signal ${String(run.signal)}, left ${run.leftInTmp.join(', ') || 'nothing'} in its temporary folder, and wrote:\n${run.stderr}`
}

beforeAll(async () => {
  t = await freshDb()
  // SHAPED LIKE A REAL OFFICE: a key hash held, and the window closed by the person.
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', 'some-agent', keys.keyHash('made-up-for-this-test'), null)
  t.client.sqlite
    .prepare("UPDATE installation SET window_closed_at = '2026-10-06 18:00:00', window_closed_by_kind = 'person', window_closed_by_id = ? WHERE only_row = 1")
    .run(THE_PERSON)
  t.client.sqlite.pragma('wal_checkpoint(TRUNCATE)')
}, 120_000)

afterAll(async () => {
  await Promise.all([...tools].map(endTheTool))
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
  t.close()
})

/**
 * ANOTHER PROGRAM, LISTENING ON THE PORT THE TOOL GIVES ITS SERVER, loaded first into the tool's own node.
 * It listens on that port as the tool starts the server, before the server can, and accepts without ever
 * answering, as any program that is handed a free port may. It writes where it got to in TAKER_RECORD:
 * the port, and 'took it' or the code its listen was refused with.
 */
const TAKER = `
import childProcess from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
const spawn = childProcess.spawn
childProcess.spawn = function (command, args, options) {
  const port = Number(options?.env?.MOLE_OFFICE_PORT)
  if (Number.isInteger(port) && port > 0) {
    const say = (outcome) => writeFileSync(process.env.TAKER_RECORD, JSON.stringify({ port, outcome }))
    const taker = net.createServer((connection) => connection.unref())
    taker.on('error', (err) => say(err.code))
    taker.listen(port, '127.0.0.1', () => say('took it'))
    taker.unref()
  }
  return spawn.call(this, command, args, options)
}
syncBuiltinESMExports()
`

/** One process of the server's group as it was read: what it ran and the names in its environment. */
interface SeenProcess {
  runs: string
  names: string[]
}

/** The one normal run the first three cases read, and what was seen in the server's environments while it ran. */
let normal: Promise<{ run: ToolRun; seen: Record<number, SeenProcess> }> | undefined
function theNormalRun(): Promise<{ run: ToolRun; seen: Record<number, SeenProcess> }> {
  normal ??= (async () => {
    const seen: Record<number, SeenProcess> = {}
    const run = await runTheTool([], false, (group) => {
      for (const pid of processesOf(group)) {
        try {
          seen[pid] = { runs: whatRuns(pid), names: namesInTheEnvironmentOf(pid) }
        } catch {
          // ended meanwhile
        }
      }
    })
    return { run, seen }
  })()
  return normal
}

describe('the timing tool, on a copy of an office whose key window is closed', () => {
  it('says the startup refusal from the preserved server log in the failure itself', async () => {
    const run = await runTheTool([], 'startup-failure')
    expect(run.code, run.stderr).toBe(1)
    expect(run.stderr).toContain('Synthetic startup refusal: the fixture cannot start.')
    const logs = run.leftInTmp.filter(name => name.startsWith('mole-office-attention-timing-log-'))
    expect(logs).toHaveLength(1)
    expect(readFileSync(join(run.tmp, logs[0]!, 'server.log'), 'utf8')).toContain('Synthetic startup refusal: the fixture cannot start.')
    expect(run.leftInTmp).toEqual(logs)
  }, A_CASE_MAY_TAKE_MS)

  it("reads it as the person, with the key the copy's own server made", async () => {
    const source = t.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get() as { n: number }
    expect(source.n, 'the source holds a key hash, as a real office does').toBeGreaterThan(0)
    const { run } = await theNormalRun()
    // Three lines of numbers, so every read was answered 200.
    expect(run.code, run.stderr).toBe(0)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get(), 'the source still holds its original keys').toEqual(source)
    expect(run.stdout.trim().split('\n'), run.stderr).toHaveLength(3)
    for (const line of run.stdout.trim().split('\n')) expect(line).toMatch(/: \d+ \d+ \d+$/)
    expect(run.stdout + run.stderr, 'nothing of the key file is printed').not.toMatch(/"person"/)
  }, A_CASE_MAY_TAKE_MS)

  it("gives its server's processes only the allowed names", async () => {
    const { run, seen } = await theNormalRun()
    expect(Object.keys(seen).length, `the server group was read while it ran; ${said(run)}`).toBeGreaterThan(0)
    const allowed = new Set<string>([...FROM_THE_SHELL, ...THE_TEST_GUARD, ...SET_HERE, ...(THE_READ_RECORDER_IS_ON ? THE_READ_RECORDER : [])])
    for (const [pid, { runs, names }] of Object.entries(seen)) {
      // The names are joined into the message, because the runner prints a list inside a list as "Array(2)".
      const notAllowed = names.filter((name) => !allowed.has(name))
      expect(notAllowed, `process ${pid} of the server's group (${runs}) carries ${notAllowed.join(', ')}`).toEqual([])
      for (const planted of Object.keys(PLANTED)) expect(names, `process ${pid} (${runs})`).not.toContain(planted)
    }
    // THE RECORDER'S ALLOWANCE IS NOT DEAD: when the recorder is on, the tool's server does carry its two names.
    if (THE_READ_RECORDER_IS_ON) {
      expect(
        Object.values(seen).some(({ names }) => THE_READ_RECORDER.every((name) => names.includes(name))),
        'the read recorder is on in this process, so its two names were expected in the server group',
      ).toBe(true)
    }
  }, A_CASE_MAY_TAKE_MS)

  it('leaves nothing after a normal end', async () => {
    const { run } = await theNormalRun()
    expect(run.groupLeftAtTheEnd, `a process of the server group was there when the tool had ended; ${said(run)}`).toBe(false)
    expect(run.leftInTmp, `what the tool left in its temporary folder; ${said(run)}`).toEqual([])
  }, A_CASE_MAY_TAKE_MS)

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    it(`leaves nothing when it is sent ${signal} while its server runs`, async () => {
      const run = await runTheTool(['--hold-after-start', '120000'], true, (_group, tool) => {
        tool.kill(signal)
      })
      expect(run.group, run.stderr).not.toBeNull()
      expect(run.code, run.stderr).toBe(signal === 'SIGTERM' ? 143 : 130)
      expect(run.groupLeftAtTheEnd, `a process of the server group was there when the tool had ended; ${said(run)}`).toBe(false)
      expect(run.leftInTmp, `what the tool left in its temporary folder; ${said(run)}`).toEqual([])
      expect(existsSync(run.tmp)).toBe(true)
    }, A_CASE_MAY_TAKE_MS)
  }

  it('holds the port it gives its server, so another program that listens on it first is refused', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'mole-office-timing-tool-taker-'))
    folders.push(tmp)
    const module = join(tmp, 'taker.mjs')
    const record = join(tmp, 'taker.json')
    writeFileSync(module, TAKER)
    const run = await runTheTool([], true, undefined, { module, env: { TAKER_RECORD: record } })
    expect(existsSync(record), `the other program was never given a port to listen on; ${said(run)}`).toBe(true)
    const taker = JSON.parse(readFileSync(record, 'utf8')) as { port: number; outcome: string }
    expect(taker.outcome, `what another program got when it listened on port ${String(taker.port)}, the server's port; ${said(run)}`).toBe('EADDRINUSE')
    expect(run.code, said(run)).toBe(0)
    expect(run.stdout.trim().split('\n'), said(run)).toHaveLength(3)
  }, A_CASE_MAY_TAKE_MS)
})
