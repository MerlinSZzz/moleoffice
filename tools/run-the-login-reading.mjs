// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** One tick of the hourly login reading. A timer outside the repository runs this file. The counter of
 * src/config/login-reading-job.mjs owns the schedule; its unfinished firings are the work. Each tick starts at most
 * one short Claude round in the login-reading sandbox and answers the firing as soon as the round has started.
 * Nothing here waits for the round, or reads its out file or end.json: the office reads the out file itself
 * (src/server/lib/logins-week.ts). Tests inject a stand-in exec door and never start the sandbox tool.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { LOGIN_READING_COMMAND, LOGIN_READING_COUNTER, LOGIN_READING_JOB, LOGIN_READING_LIMIT_SECONDS, LOGIN_READING_SANDBOX } from '../src/config/login-reading-job.mjs'
import { officeHeaders, theAgentKey } from './sandbox-common.mjs'
import { whereIsTheApi } from './where-is-the-api.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'

/** @typedef {import('../src/shared/counters.ts').CounterRowReading} Firing */
/** @typedef {import('../src/shared/counters.ts').CounterReading} Counter */
/** @typedef {{status: number|null, stdout: string, stderr: string}} Exec */
/** @typedef {{ask: (method: string, path: string, body?: unknown) => Promise<any>, exec: (args: readonly string[]) => Exec}} Doors */

/** The sandbox tool's arguments for the round, with no --wait: the tool prints its start line and returns. */
const THE_ROUND = Object.freeze([fileURLToPath(new URL('./sandbox.mjs', import.meta.url)), 'exec', LOGIN_READING_SANDBOX, '--secret', 'CLAUDE_CODE_OAUTH_TOKEN', '--json', '--', ...LOGIN_READING_COMMAND])
/** How many characters of the sandbox tool's error output an answer carries. */
const ERROR_SHOWN = 300

/** @param {Doors} doors */
export async function loginReadingTick(doors) {
  const listed = await doors.ask('GET', '/api/counters')
  if (!Array.isArray(listed.counters)) throw new Error('The counters reply holds no counter list.')
  /** @type {Counter[]} */
  const counters = listed.counters.filter((/** @type {Counter} */ one) => one.action.kind === 'job' && one.action.job === LOGIN_READING_JOB)
  // Installation is repeatable. A paused counter remains paused; it is never replaced.
  if (!counters.some(one => one.title === LOGIN_READING_COUNTER.title)) {
    const made = await doors.ask('POST', '/api/counters', LOGIN_READING_COUNTER)
    counters.push(made.counter)
  }
  /** @type {{counter: Counter, firing: Firing}[]} */
  const pending = []
  for (const counter of counters) {
    let before
    do {
      const page = await doors.ask('GET', `/api/counters/${encodeURIComponent(counter.id)}?limit=25${before === undefined ? '' : `&before=${before}`}`)
      if (!Array.isArray(page.rows)) throw new Error('The counter reply holds no firing rows.')
      for (const firing of page.rows) if (firing.what === 'firing' && firing.answer?.job === LOGIN_READING_JOB && firing.answer.finished === false) pending.push({ counter, firing })
      if (!page.more) break
      before = Math.min(...page.rows.map((/** @type {Firing} */ row) => row.seq))
      if (!Number.isFinite(before)) throw new Error('The counter page says more rows exist but names no next row.')
    } while (true)
  }
  pending.sort((a, b) => a.firing.at.localeCompare(b.firing.at) || a.firing.seq - b.firing.seq)
  const newest = pending.pop()
  if (newest === undefined) return 'No login reading firing is waiting, so no reading round was started.'
  // One reading answers the hour, so a tick starts one round, for the newest firing, and answers the older ones.
  for (const { counter, firing } of pending) {
    const where = counter.id === newest.counter.id ? '' : ` on counter ${newest.counter.id}`
    await answer(doors, counter, firing, `Not run, because firing ${newest.firing.seq}${where} is newer and one reading answers the hour.`)
  }
  const older = pending.length === 0 ? '' : ` ${pending.length} older ${pending.length === 1 ? 'firing was' : 'firings were'} answered as not run.`
  const ran = doors.exec(THE_ROUND)
  const out = ran.status === 0 ? theStartsOutFile(ran.stdout) : null
  const status = ran.status === null ? 'no exit status' : `status ${ran.status}`
  if (out === null) {
    const error = ran.stderr.trim()
    const shown = error.length > ERROR_SHOWN ? `${error.slice(0, ERROR_SHOWN)} … (cut at ${ERROR_SHOWN} characters)` : error === '' ? '(none)' : error
    await answer(doors, newest.counter, newest.firing, `The sandbox tool printed no start line for the reading round in sandbox ${LOGIN_READING_SANDBOX}. It ended with ${status}. Its error output: ${shown}`)
    return `Login reading firing ${newest.firing.seq} of counter ${newest.counter.id} was answered: the sandbox tool printed no start line (${status}).${older}`
  }
  const folder = dirname(out)
  await answer(doors, newest.counter, newest.firing, `Sandbox ${LOGIN_READING_SANDBOX}, log folder ${folder}: the reading round was started; whether it ended well is read from its out file. No exit code is known here, because nothing waits for the round. If it has not ended after ${LOGIN_READING_LIMIT_SECONDS} seconds, timeout stops it inside the sandbox.`)
  return `Login reading firing ${newest.firing.seq} of counter ${newest.counter.id} was answered: the round was started, log folder ${folder}.${older}`
}

/** The out file the sandbox tool's start line names: its last line on stdout, with --json. Null when it names none.
 * @param {string} stdout */
function theStartsOutFile(stdout) {
  const last = stdout.split('\n').filter(line => line.trim() !== '').at(-1)
  if (last === undefined) return null
  let start
  try { start = JSON.parse(last) }
  catch { return null }
  return typeof start?.out === 'string' && start.out !== '' ? start.out : null
}

/** @param {Doors} doors @param {Counter} counter @param {Firing} firing @param {string} says */
async function answer(doors, counter, firing, says) {
  await doors.ask('POST', `/api/counters/${encodeURIComponent(counter.id)}/firings/${firing.seq}/answer`, { says })
}

/** Production asks the office as the runner's own agent and starts the sandbox tool with node. The tool's own
 * handshake writes the round's process row; this runner writes none.
 * @returns {Doors}
 */
export function productionDoors() {
  const api = process.env['MOLE_OFFICE_API']
  const workspace = process.env['MOLE_OFFICE_WORKSPACE']
  const agent = process.env['MOLE_OFFICE_AGENT']
  const session = process.env['MOLE_OFFICE_SESSION']
  const key = theAgentKey()
  if (!api || !workspace || !agent || !session || key === null) throw new Error('The login reading runner needs its own agent, project, session and key environment.')
  const base = whereIsTheApi(api)
  const headers = officeHeaders({ workspace, agent, session, key })
  return {
    ask: async (method, path, body) => {
      const response = await fetch(`${base}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { ...headers, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const said = await response.json()
      if (!response.ok) throw new Error(`Login reading office ${method} ${path} answered ${response.status}: ${JSON.stringify(said)}`)
      return said
    },
    exec: args => {
      const ran = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      if (ran.error) throw ran.error
      return ran
    },
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  // THE START CHECK (wave 13q) is in the entry guard, so a file that imports this one is not stopped by it.
  stopAnUnpairedStableStart()
  loginReadingTick(productionDoors()).then(says => console.log(says)).catch(error => { console.error(`Login reading could not finish: ${error.message}`); process.exitCode = 1 })
}
