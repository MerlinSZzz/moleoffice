// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** One tick of the scheduled timing job. A systemd timer calls this every
 * thirty minutes. Counters own the schedule; their unfinished firings own the
 * pending work. Tests inject labelled stand-ins and never launch a host test.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ENV_FILE, REPO_ROOT, settingValue } from '../src/config/settings.mjs'
import { guardedGitArguments, guardedGitEnvironment } from '../src/config/guarded-git.mjs'
import { localStamp, parseAnyStamp } from '../src/shared/time.ts'
import { askTheMergeList } from '../src/shared/merge-queue.ts'
import { BY_PART_LEVELS } from '../src/shared/zoom.ts'
import { TIMING_JOB, TIMING_DEADLINE_MS, TIMING_RETRY_MS, timingCounters } from '../src/config/timing-job.mjs'
import { timingMachineReading, isQuietForTiming } from '../tests/the-timing-tests.ts'
import { SANDBOXES_FOLDER, officeHeaders, theAgentKey } from './sandbox-common.mjs'
import { whereIsTheApi } from './where-is-the-api.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'

/** @typedef {import('../src/shared/counters.ts').CounterRowReading} Firing */
/** @typedef {import('../src/shared/counters.ts').CounterReading} Counter */
/** @typedef {{nextAt?: number, readings?: unknown[], commit?: string, lastUnqualified?: unknown}} State */
/** @typedef {{code: number, commit: string, measurements: any}} Attempt */
/** @typedef {{ask: (method: string, path: string, body?: unknown) => Promise<any>, reading: typeof timingMachineReading, run: (commit: string|null) => Promise<Attempt>, load: (key: string) => State, save: (key: string, state: State) => void, now: () => Date, lane: string, reader: string|null}} Doors */

/**
 * ONE TICK OF THE TIMING JOB, and what it says. With no reader (decision lLDy-GJmBr1t, which replaces xkZEzm9pjbr3), it
 * does all it does with one and then fails once. Its error names every report it filed for nobody and the setting, and
 * then gives the tick's own sentence: the one it would have returned, or the reason it failed.
 * @param {Doors} doors
 */
export async function timingJobTick(doors) {
  /** @type {string[]} */
  const forNobody = []
  let says
  try { says = await tick(doors, forNobody) }
  catch (error) {
    if (forNobody.length === 0) throw error
    throw new Error(`${addressedToNobody(forNobody)} ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  if (forNobody.length > 0) throw new Error(`${addressedToNobody(forNobody)} ${says}`)
  return says
}

/** The sentence that names the reports filed for nobody, and the setting that names no reader. @param {string[]} ids */
function addressedToNobody(ids) {
  if (ids.length === 1) return `The timing report ${ids[0]} was filed and answered its firing, but it is addressed to nobody, because MOLE_OFFICE_TIMING_REPORT_READER names no reader.`
  return `The timing reports ${ids.slice(0, -1).join(', ')} and ${ids.at(-1)} were filed and answered their firings, but they are addressed to nobody, because MOLE_OFFICE_TIMING_REPORT_READER names no reader.`
}

/** The tick itself. `forNobody` collects the id of each report it files while no reader is named. @param {Doors} doors @param {string[]} forNobody */
async function tick(doors, forNobody) {
  const now = doors.now()
  const listed = await doors.ask('GET', '/api/counters')
  if (!Array.isArray(listed.counters)) throw new Error('The counters reply holds no counter list.')
  /** @type {Counter[]} */
  const counters = listed.counters.filter((/** @type {Counter} */ one) => one.action.kind === 'job' && one.action.job === TIMING_JOB)
  // Installation is repeatable. A paused counter remains paused; it is never replaced.
  for (const definition of timingCounters(doors.lane)) {
    if (!counters.some(one => one.title === definition.title)) {
      const made = await doors.ask('POST', '/api/counters', definition)
      counters.push(made.counter)
    }
  }
  /** @type {{counter: Counter, firing: Firing}[]} */
  const pending = []
  for (const counter of counters) {
    let before
    do {
      const page = await doors.ask('GET', `/api/counters/${encodeURIComponent(counter.id)}?limit=25${before === undefined ? '' : `&before=${before}`}`)
      if (!Array.isArray(page.rows)) throw new Error('The counter reply holds no firing rows.')
      for (const firing of page.rows) if (firing.what === 'firing' && firing.answer?.job === TIMING_JOB && firing.answer.finished === false) pending.push({ counter, firing })
      if (!page.more) break
      before = Math.min(...page.rows.map((/** @type {Firing} */ row) => row.seq))
      if (!Number.isFinite(before)) throw new Error('The counter page says more rows exist but names no next row.')
    } while (true)
  }
  pending.sort((a, b) => a.firing.at.localeCompare(b.firing.at))
  if (pending.length === 0) return 'No timing firing is pending.'
  // One firing per tick bounds this command; every pending firing is still checked
  // for its three-day deadline, even behind another firing.
  for (const { counter, firing } of pending) {
    const key = `${counter.id}-${firing.seq}`
    const state = doors.load(key)
    const fired = parseAnyStamp(firing.at)
    if (fired === null) throw new Error(`Timing firing ${key} has an unreadable date.`)
    if (now.getTime() - fired.getTime() >= TIMING_DEADLINE_MS) {
      await finish(doors, counter, firing, { code: null, commit: state.commit ?? null, status: 'not-run', readings: state.readings ?? [], because: 'No qualified quiet window within three days.' }, forNobody)
      continue
    }
    if ((state.nextAt ?? 0) > now.getTime()) continue
    const reading = doors.reading()
    // THE NARROW LIST (wave 13u round 123): only whether the lane is busy is read. An office older than the shapes is
    // asked once more for the whole list, and said; any other refusal fails the tick, as before.
    const listed = await askTheMergeList({ lane: doors.lane, states: ['testing', 'integrating', 'landing'] }, 'narrow', async (path) => {
      try {
        return { status: 200, body: await doors.ask('GET', path), thrown: undefined }
      } catch (error) {
        const { status, answer } = /** @type {{status?: unknown, answer?: unknown}} */ (Object(error))
        return { status: typeof status === 'number' ? status : null, body: answer ?? null, thrown: error }
      }
    }, (line) => console.warn(line))
    if (listed.thrown !== undefined) throw listed.thrown
    /** @type {any} */
    const queue = listed.body
    if (!Array.isArray(queue.lanes)) throw new Error('The merge queue reply holds no lanes.')
    if (Array.isArray(queue.unreadable) && queue.unreadable.length > 0) throw new Error(`The merge queue could not read every entry, so whether the lane is busy cannot be told: ${queue.unreadable.map((/** @type {{why: string}} */ one) => one.why).join(' ')}`)
    const busyQueue = queue.lanes.some((/** @type {{entries: unknown[]}} */ lane) => lane.entries.length > 0)
    const readings = [...(state.readings ?? []).slice(-143), { at: localStamp(now), ...reading, busyQueue }]
    const next = { ...state, readings, nextAt: now.getTime() + TIMING_RETRY_MS }
    doors.save(key, next)
    if (!isQuietForTiming(reading) || busyQueue) return busyQueue ? 'Timing waits: the merge lane is integrating, testing or landing.' : `Timing waits: load ${reading.load1} exceeds ${reading.cores / 4}.`
    // A weekly firing names current main. A landing firing pins the actual landed
    // commit from the addition which that firing counted, not the submitted tip.
    let commit = state.commit ?? null
    if (commit === null && counter.follows.length > 0) {
      const page = await doors.ask('GET', `/api/counters/${encodeURIComponent(counter.id)}?limit=25&before=${firing.seq}`)
      const addition = page.rows.find((/** @type {Firing} */ row) => row.what === 'addition' && row.event?.event === 'landing')
      if (!addition) throw new Error(`Timing firing ${key} names no landing addition.`)
      const landed = await doors.ask('GET', `/api/merge-queue/${encodeURIComponent(addition.event.id)}`)
      commit = landed.entry?.integrated?.mainAfter
      if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) throw new Error(`Timing firing ${key} names no landed commit.`)
    }
    let attempt
    try { attempt = await doors.run(commit) }
    catch (error) {
      await finish(doors, counter, firing, { code: 1, commit, status: 'failed', readings, because: error instanceof Error ? error.message : String(error) }, forNobody)
      return 'Timing failed; the coordinator was notified.'
    }
    doors.save(key, { ...next, commit: attempt.commit })
    const result = attempt.measurements
    if (attempt.code === 3 && result.status === 'unqualified: machine busy' && result.quiet === false) {
      doors.save(key, { ...next, commit: attempt.commit, lastUnqualified: attempt.measurements })
      return 'Timing was unqualified; the firing remains pending.'
    }
    const status = attempt.code === 0 && result.status === 'passed' && result.quiet === true && result.limitMs === 300 && result.coldFixtureMs < 60_000 && result.runs.flat().every((/** @type {{ms: number}} */ press) => Number.isFinite(press.ms) && press.ms <= result.limitMs) ? 'passed' : 'failed'
    const because = status === 'failed' ? `The run ${result.status === undefined ? 'recorded no status' : `reported "${result.status}"`} and exited with code ${attempt.code}.${result.quiet === true ? '' : ' The run was not confirmed quiet.'}` : undefined
    await finish(doors, counter, firing, { ...attempt, status, readings, because }, forNobody)
    return status === 'passed' ? 'Timing passed; nobody was notified.' : 'Timing failed; the coordinator was notified.'
  }
  return 'Timing firings wait for the next tick, or were answered at their deadline.'
}

/** @param {Doors} doors @param {Counter} counter @param {Firing} firing @param {any} evidence */
async function resultReport(doors, counter, firing, evidence) {
  const at = localStamp(doors.now())
  const result = await doors.ask('POST', '/api/records', { kind: 'report', title: `Review timing: ${evidence.status}, ${at}`, data: {
    ...(doors.reader === null ? {} : { for: doors.reader }), date: at.slice(0, 10), source: `Counter ${counter.id}, firing ${firing.seq}`,
    blocks: [{ id: 'timing', type: 'text', heading: 'Recorded execution', text: `Commit: ${evidence.commit ?? 'not selected'}. Outcome: ${evidence.status}. Exit: ${evidence.code ?? 'not run'}. Cold fixture: ${evidence.measurements?.coldFixtureMs ?? 'not measured'} ms against 60000 ms. Machine before: ${JSON.stringify(evidence.measurements?.machineBefore ?? evidence.readings?.at(-1) ?? null)}. Machine after: ${JSON.stringify(evidence.measurements?.machineAfter ?? null)}. ${evidence.because ?? ''}` }, ...(evidence.measurements?.runs ?? []).map((/** @type {any[]} */ run, /** @type {number} */ i) => ({ id: `run-${i}`, type: 'text', heading: `Press measurements ${i + 1}`, text: run.map(press => `${press.press}: ${press.ms} ms against 300 ms (${press.ms <= 300 ? 'pass' : 'fail'}). Doors: ${JSON.stringify(press.doors)}.`).join('\n') }))],
    extra: { timingJob: { counter: counter.id, seq: firing.seq, ...evidence, at } },
  } })
  const id = result.record.id
  await doors.ask('POST', '/api/links', { fromId: id, toId: counter.id, type: 'about' })
  const versions = await doors.ask('GET', `/api/records/${id}/revisions`)
  const newest = versions.revisions.reduce((/** @type {any} */ a, /** @type {any} */ b) => a.seq > b.seq ? a : b)
  // Use the report reader's own answer: short reports have no by-part levels.
  const reading = await doors.ask('GET', `/api/records/${id}/short-forms`)
  if (!Array.isArray(reading.levels)) throw new Error('The timing report reading returned no levels.')
  const hasParts = reading.levels.some((/** @type {{rung: string, why: string|null}} */ level) => BY_PART_LEVELS.some(rung => rung === level.rung) && level.why === 'notWritten')
  const summaries = evidence.status === 'passed'
    ? { text30: 'Both budgets held.', text120: 'Qualified measurements met the fixture and press limits.' }
    : evidence.status === 'failed'
      ? { text30: 'Check needs attention.', text120: 'The run failed; its reason is recorded below.' }
      : { text30: 'Quiet window unavailable.', text120: 'Three days passed without a qualified quiet window.' }
  await doors.ask('POST', `/api/records/${id}/short-forms`, { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'Review performance check', ...(hasParts ? { parts: [{ id: 'result', heading: 'Budget and qualification', ...summaries, covers: ['timing', ...(evidence.measurements?.runs ?? []).map((/** @type {unknown} */ _, /** @type {number} */ i) => `run-${i}`)] }] } : {}) } })
  return id
}

/** @param {Doors} doors @param {Counter} counter @param {Firing} firing @param {any} evidence @param {string[]} forNobody */
async function finish(doors, counter, firing, evidence, forNobody) {
  const id = await resultReport(doors, counter, firing, evidence)
  // This existing door writes the answer and the once-only failure wake in one
  // transaction. A lost reply cannot send a second wake on the next tick.
  await doors.ask('POST', `/api/counters/${counter.id}/firings/${firing.seq}/answer`, { result: id, says: `Timing ${evidence.status}; dated result ${id}.` })
  // NO NAME STANDS IN FOR AN UNSET READER (decision lLDy-GJmBr1t, which replaces xkZEzm9pjbr3): the report still answers
  // the firing, addressed to nobody. Its id is kept and the tick goes on, so a firing behind this one is answered too.
  // timingJobTick then fails once, naming every such report, so the timer shows that nobody reads them.
  if (doors.reader === null) forNobody.push(id)
}

/**
 * WHAT THE OFFICE REFUSED, as the timing job's ask throws it: the sentence, with the status and the answer, so a refusal
 * can be told by them (an office older than the merge list's shapes, `askTheMergeList`).
 * @param {string} method @param {string} path @param {number} status @param {unknown} answer
 */
export function anOfficeRefusal(method, path, status, answer) {
  return Object.assign(new Error(`Timing job office ${method} ${path} answered ${status}: ${JSON.stringify(answer)}`), { status, answer })
}

/** Production uses the existing sandbox launcher; the command under test is
 * never spawned on the host. The clone is dedicated to this timer.
 * The reader is read from the environment, and from `settingsFile` when the environment does not set it. A test names a
 * file at which nothing is written, so that the unset case reads no settings file of this machine.
 * @param {string} [settingsFile]
 * @returns {Doors}
 */
export function productionDoors(settingsFile = ENV_FILE) {
  const clone = join(SANDBOXES_FOLDER, 'timing', 'work', 'main-clone')
  const stateRoot = join(SANDBOXES_FOLDER, '.timing-job')
  const api = whereIsTheApi(process.env['MOLE_OFFICE_API'])
  const workspace = process.env['MOLE_OFFICE_WORKSPACE']
  const agent = process.env['MOLE_OFFICE_AGENT']
  const session = process.env['MOLE_OFFICE_SESSION']
  const key = theAgentKey()
  if (!workspace || !agent || !session || key === null) throw new Error('The timing runner needs its secretary, project, session and key environment.')
  const headers = officeHeaders({ workspace, agent, session, key })
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 })
  /** @param {string} command @param {string[]} args @param {number} timeout @param {Record<string, string>} [env] */
  const command = (command, args, timeout, env) => {
    const ran = spawnSync(command, args, { encoding: 'utf8', timeout, env: env ?? process.env, maxBuffer: 16 * 1024 * 1024 })
    if (ran.error) throw ran.error
    return ran
  }
  return {
    lane: REPO_ROOT, now: () => new Date(), reading: timingMachineReading,
    reader: settingValue('MOLE_OFFICE_TIMING_REPORT_READER', process.env, settingsFile)?.trim() || null,
    ask: async (method, path, body) => {
      const response = await fetch(`${api}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { ...headers, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const answer = await response.json()
      if (!response.ok) throw anOfficeRefusal(method, path, response.status, answer)
      return answer
    },
    load: key => {
      try { return JSON.parse(readFileSync(join(stateRoot, `${key}.json`), 'utf8')) }
      catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return {}; throw error }
    },
    save: (key, state) => { const target = join(stateRoot, `${key}.json`); writeFileSync(`${target}.new`, JSON.stringify(state), { mode: 0o600 }); renameSync(`${target}.new`, target) },
    run: selected => runTimingInSandbox(clone, REPO_ROOT, selected, command),
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  // THE START CHECK (wave 13q) is in the entry guard, so a file that imports this one is not stopped by it.
  stopAnUnpairedStableStart()
  timingJobTick(productionDoors()).then(says => console.log(says)).catch(error => { console.error(`Timing job could not finish: ${error.message}`); process.exitCode = 1 })
}

/** The exit of the command below when the clone has changes: none of git's own. */
const CHANGES_FOUND = 3

/** Inside the timing sandbox: stop with CHANGES_FOUND when the clone has changes, or check out the commit. */
const CHANGES_OR_CHECKOUT = `if [ -n "$(git status --porcelain)" ]; then exit ${CHANGES_FOUND}; fi; exec git checkout -q --detach "$1"`

/** The same sandbox door in production and its labelled command stand-ins.
 * @param {string} clone @param {string} lane @param {string|null} selected
 * @param {(command: string, args: string[], timeout: number, env?: Record<string, string>) => import('node:child_process').SpawnSyncReturns<string>} command
 *
 * THE CLONE IS ONE THE TIMING SANDBOX CAN WRITE: its tests run in it. Git on the host fetches and reads refs there,
 * with the guard (src/config/guarded-git.mjs), and reaches only a folder. Whether the clone has changes, and the
 * checkout, compare and write its files, where a filter the clone names would run. They run inside the timing
 * sandbox's own container, through the same door as the timing group.
 */
export async function runTimingInSandbox(clone, lane, selected, command) {
  /** @param {string[]} args */
  const git = args => {
    const ran = command('git', guardedGitArguments(clone, args), 60_000, guardedGitEnvironment({ GIT_ALLOW_PROTOCOL: 'file' }))
    if (ran.status !== 0) throw new Error(`Timing clone git failed: ${ran.stderr.trim()}`)
    return ran.stdout.trim()
  }

      git(['fetch', lane, 'main'])
      const commit = selected ?? git(['rev-parse', 'FETCH_HEAD'])
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('The timing commit is not a complete git commit id.')
      const moved = command(process.execPath, [join(lane, 'tools/sandbox.mjs'), 'exec', 'timing', '--wait', '--timeout', '120', '--plain-env', '--cwd', clone, '--', 'sh', '-c', CHANGES_OR_CHECKOUT, 'timing-checkout', commit], 180_000)
      if (moved.status === CHANGES_FOUND) throw new Error('The timing clone has changes; it was not advanced.')
      if (moved.status !== 0) throw new Error(`The timing clone could not be moved to ${commit} inside the timing sandbox. Sandbox exit ${moved.status}: ${moved.stderr.trim()}`)
      const logs = join(clone, '.logs')
      mkdirSync(logs, { recursive: true })
      const before = new Set(readdirSync(logs).filter(name => /^timing-.*\.json$/.test(name)))
      const ran = command(process.execPath, [join(lane, 'tools/sandbox.mjs'), 'exec', 'timing', '--wait', '--timeout', '600', '--plain-env', '--cwd', clone, '--', 'node', 'tools/run-named-tests.mjs', '--list', 'timing'], 660_000)
      const files = readdirSync(logs).filter(name => /^timing-.*\.json$/.test(name) && !before.has(name))
      if (files.length !== 1) throw new Error(`Timing produced ${files.length} new result files; no result was inferred. Sandbox exit ${ran.status}: ${ran.stderr.trim()}`)
      const measurements = JSON.parse(readFileSync(join(logs, /** @type {string} */ (files[0])), 'utf8'))
      if (!Array.isArray(measurements.runs) || measurements.limitMs !== 300 || !Number.isFinite(measurements.coldFixtureMs) || !measurements.machineBefore || !measurements.machineAfter) throw new Error('Timing produced an incomplete measurement file.')
      return { code: ran.status ?? 1, commit, measurements }
}
