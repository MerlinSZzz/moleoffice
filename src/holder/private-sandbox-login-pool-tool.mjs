// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE POOL ADAPTER FOR THE LOGIN PRESS: the host's pool tool, run as its own process, with the value on stdin only.
 *
 * src/server/lib/sandbox-login-addition/pool.mjs asks for one of these as `privatePool({ tool })`. It is built only by
 * ./private-sandbox-login-installed.mjs, from the host's installation record, and never from a request or a setting.
 *
 * HOW THE TOOL IS RUN
 *   - `setpriv --pdeathsig KILL -- prlimit --core=0:0 -- <python> <tool> add-stdin <by> --operation <id> --json`, and
 *     `... reconcile <id> <sha12> --json` the same way. setpriv makes the tool end when the holder ends, and prlimit
 *     gives it no core dump. Both exec the next program, so the process started is the tool itself.
 *   - In a new session and process group, from /, with PATH and HOME and nothing else in its environment.
 *   - The value goes on stdin, a Unix socket pair Node makes for it, and never in an argument. stderr goes to
 *     /dev/null, so nothing the tool says there reaches the holder's log. stdout is read up to MOST_ANSWER_BYTES and
 *     must be exactly one JSON line.
 *   - At the deadline or an abort the group is sent SIGTERM, and SIGKILL KILL_AFTER_MS later, each only while the
 *     group's leader still has the start time recorded when it was started.
 *   - Before each run, the tool file is checked again: the user's, not writable by group or others, and the sha256
 *     the installation record names. A changed tool is not run.
 *
 * WHAT THE TOOL ANSWERS, and what pool.mjs is given:
 *   - add-stdin: {"outcome":"added","letter","sha12","operation"} with this operation, given as a confirmed addition;
 *     or {"outcome":"refused","reason"}, given as it is. Anything else throws, so pool.mjs asks reconcile.
 *   - reconcile: {"outcome":"added","letter","sha12","operation"} for this operation's own entry, given as confirmed; or
 *     {"outcome":"absent"}, given as it is, which pool.mjs reports as not known.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { startTimeOf } from '../config/session-process.mjs'
import { thisSystem } from '../config/systems/the-system.mjs'

export const SETPRIV = '/usr/bin/setpriv'
export const PRLIMIT = '/usr/bin/prlimit'
/** Who the pool's index says added a login through the press. */
export const POOL_TOOL_BY = 'the press'
export const MOST_ANSWER_BYTES = 4096
/** How long a group sent SIGTERM has before it is sent SIGKILL. */
export const KILL_AFTER_MS = 2000
const REASONS = ['PoolUnsafe', 'PoolChanged', 'PoolUnsaved', 'PoolFull', 'PoolDuplicate']

/**
 * Is the tool file as the installation record names it: a regular file of this user's, not writable by group or
 * others, with this sha256?
 * @param {string} tool
 * @param {string} sha256
 */
export function theToolIsAsInstalled(tool, sha256) {
  try {
    const info = lstatSync(tool)
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o022) !== 0) return false
    return createHash('sha256').update(readFileSync(tool)).digest('hex') === sha256
  } catch {
    return false
  }
}

/**
 * Send a signal to a process group, only while its leader has the start time recorded for it.
 * @param {number} pgid
 * @param {string} identity
 * @param {NodeJS.Signals} signal
 * @returns {boolean} whether it was sent
 */
export function signalTheRecordedGroup(pgid, identity, signal) {
  if (!Number.isSafeInteger(pgid) || pgid <= 1 || pgid === process.pid) return false
  if (startTimeOf(pgid)?.toISOString() !== identity) return false
  try {
    thisSystem().groups.signal(pgid, signal)
    return true
  } catch {
    return false
  }
}

/**
 * Run the tool once and give its one answer line, parsed.
 * @param {{ executable: string, args: string[], input: Buffer | null, home: string, deadline: number, signal: AbortSignal }} run
 * @returns {Promise<Record<string, unknown>>}
 */
function runTheTool({ executable, args, input, home, deadline, signal }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('aborted before the tool was started')); return }
    const child = spawn(executable, args, { detached: true, cwd: '/', env: { PATH: '/usr/bin:/bin', HOME: home }, stdio: ['pipe', 'pipe', 'ignore'] })
    const pgid = child.pid ?? 0
    const identity = startTimeOf(pgid)?.toISOString() ?? ''
    /** @type {Buffer[]} */
    const read = []
    let bytes = 0
    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      signalTheRecordedGroup(pgid, identity, 'SIGTERM')
      setTimeout(() => signalTheRecordedGroup(pgid, identity, 'SIGKILL'), KILL_AFTER_MS).unref()
    }
    const timer = setTimeout(stop, Math.max(0, deadline - Date.now()))
    timer.unref()
    signal.addEventListener('abort', stop, { once: true })
    child.stdout.on('data', (/** @type {Buffer} */ chunk) => {
      bytes += chunk.length
      if (bytes > MOST_ANSWER_BYTES) stop()
      else read.push(chunk)
    })
    child.stdin.on('error', () => {})
    child.on('error', (err) => { clearTimeout(timer); signal.removeEventListener('abort', stop); reject(err) })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      const answer = Buffer.concat(read).toString('utf8')
      if (stopped) { reject(new Error('the tool was stopped')); return }
      if (code !== 0) { reject(new Error(`the tool ended with ${String(code)}`)); return }
      if (!/^[^\n]+\n$/.test(answer)) { reject(new Error('the tool did not answer with one line')); return }
      let parsed
      try { parsed = JSON.parse(answer) } catch { reject(new Error('the tool did not answer with JSON')); return }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { reject(new Error('the tool did not answer with an object')); return }
      resolve(parsed)
    })
    child.stdin.end(input ?? undefined)
  })
}

/**
 * @param {Record<string, unknown>} answer
 * @param {string[]} keys
 */
const hasKeys = (answer, keys) => Object.keys(answer).sort().join(',') === [...keys].sort().join(',')

/**
 * The adapter, for the tool and python the installation record names.
 *
 * Each verified property and the case that proves it, in tests/private-sandbox-login-pool-tool.test.ts, on a stand-in
 * for the tool that speaks its protocol over a stand-in pool:
 *   - installed: a changed tool file, or one made writable by its group, makes the press unavailable and is not run.
 *   - privateStdin: the value reaches the tool on a pipe and in no argument or environment variable.
 *   - noDiagnostics: the tool's stderr is /dev/null.
 *   - isolation: the tool runs in its own session and group, from /, with PATH and HOME only.
 *   - flock: the tool's own lock. Two additions at once through the adapter are given two letters.
 *   - recovery: a tool killed after its rename reconciles to the same letter, and before it to absent.
 *   - dumpPrevention: the tool's core limit is 0, soft and hard, though the stand-in does not lower it itself.
 *   - ownerWatch: the tool ends when the holder is killed, and at the deadline.
 *   - processIdentity: a group whose leader has another start time is not signalled.
 *
 * @param {{ python: string, tool: string, toolSha256: string, home: string }} installed
 * @returns {import('../server/lib/sandbox-login-addition/pool.mjs').TrustedPoolTool}
 */
export function thePoolToolAdapter({ python, tool, toolSha256, home }) {
  const prefixArgs = Object.freeze(['--pdeathsig', 'KILL', '--', PRLIMIT, '--core=0:0', '--', python, tool])
  const verified = {
    get installed() { return theToolIsAsInstalled(tool, toolSha256) },
    privateStdin: true,
    noDiagnostics: true,
    isolation: true,
    flock: true,
    recovery: true,
    dumpPrevention: true,
    ownerWatch: true,
    processIdentity: true,
  }
  return {
    version: 1,
    executable: SETPRIV,
    prefixArgs: [...prefixArgs],
    by: POOL_TOOL_BY,
    verified,
    async execute({ executable, args, input, operationId, deadline, signal }) {
      const expected = [...prefixArgs, 'add-stdin', POOL_TOOL_BY]
      if (executable !== SETPRIV || args.length !== expected.length || args.some((arg, at) => arg !== expected[at])) throw new Error('not the command this adapter builds')
      if (!/^[a-f0-9]{32}$/.test(operationId)) throw new Error('not an operation id')
      if (!theToolIsAsInstalled(tool, toolSha256)) return { outcome: 'refused', reason: 'PoolUnsafe' }
      const answer = await runTheTool({ executable, args: [...args, '--operation', operationId, '--json'], input, home, deadline, signal })
      if (answer.outcome === 'refused' && hasKeys(answer, ['outcome', 'reason']) && REASONS.includes(/** @type {string} */ (answer.reason))) return { outcome: 'refused', reason: answer.reason }
      if (answer.outcome === 'added' && hasKeys(answer, ['outcome', 'letter', 'sha12', 'operation']) && answer.operation === operationId &&
        /^[A-Z]$/.test(String(answer.letter)) && /^[a-f0-9]{12}$/.test(String(answer.sha12))) return { outcome: 'added', letter: answer.letter, sha12: answer.sha12, confirmed: true }
      throw new Error('the tool gave an answer this adapter does not know')
    },
    async reconcile({ operationId, sha12, deadline, signal }) {
      if (!/^[a-f0-9]{32}$/.test(operationId) || !/^[a-f0-9]{12}$/.test(sha12)) throw new Error('not an operation id and sha12')
      if (!theToolIsAsInstalled(tool, toolSha256)) throw new Error('the tool is not as installed')
      const answer = await runTheTool({ executable: SETPRIV, args: [...prefixArgs, 'reconcile', operationId, sha12, '--json'], input: null, home, deadline, signal })
      if (answer.outcome === 'absent' && hasKeys(answer, ['outcome'])) return { outcome: 'absent' }
      if (answer.outcome === 'added' && hasKeys(answer, ['outcome', 'letter', 'sha12', 'operation']) && answer.operation === operationId && answer.sha12 === sha12 &&
        /^[A-Z]$/.test(String(answer.letter))) return { outcome: 'added', letter: answer.letter, sha12, confirmed: true }
      throw new Error('the tool gave an answer this adapter does not know')
    },
  }
}
