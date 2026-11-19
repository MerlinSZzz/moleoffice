// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * One dormant periodic-suite poll. Counters request work: the counter is the schedule, and its triggers are the two
 * settings MOLE_OFFICE_MAIN_SUITE_LANDINGS and MOLE_OFFICE_MAIN_SUITE_HOURS. `--file-the-counter` files that counter once.
 */
import { traceMainSuiteReds } from './main-suite-red-trace.mjs'
import { existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSetting } from '../src/config/settings.mjs'
import { latestMomentOfStampInZone, localStamp, momentOfAnInstant, parseAnyStamp, theClockZone, uniqueMomentOfStoredStampInZone } from '../src/shared/time.ts'
import { theRunsIdentity } from './office-request.mjs'
import { producerOfficeRequest, runPeriodicSuiteOnce } from './periodic-main-suite.mjs'
import { readOriginalReceipt, readReceiptEvidenceObject, verifyOriginalReceiptEvidence } from './stable/stable-upgrade-evidence.mjs'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = words => { throw new Error(words) }
const within = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)) }

function readState(path) {
  if (!existsSync(path)) return null
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(path) !== path) fail(`Poll journal is not an independent regular file: ${path}`)
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { fail(`Poll journal is unreadable: ${path}`) }
}

function save(path, value) {
  const next = `${path}.${process.pid}.new`
  writeFileSync(next, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  renameSync(next, path)
}

function stateRoot(options) {
  if (!isAbsolute(options.repository ?? '') || !isAbsolute(options.workdir ?? '')) fail('Name an absolute main repository and external poll work directory.')
  const repository = realpathSync(options.repository)
  if (repository !== options.repository) fail('The main repository must be its exact canonical root.')
  let parent = resolve(options.workdir)
  while (!existsSync(parent)) parent = dirname(parent)
  const workdir = resolve(realpathSync(parent), relative(parent, resolve(options.workdir)))
  if (workdir !== resolve(options.workdir) || within(repository, workdir) || within(workdir, repository)) fail('The poll work directory must be canonical and separate from the repository.')
  mkdirSync(workdir, { recursive: true, mode: 0o700 })
  return workdir
}

async function pendingFiring(io, id, job) {
  let before
  let counter
  const pending = []
  const firings = []
  const rowsSeen = new Set()
  do {
    const page = await readReceiptEvidenceObject(io.officeRequest, `/api/counters/${encodeURIComponent(id)}?limit=25${before === undefined ? '' : `&before=${before}`}`)
    if (!object(page.counter) || page.counter.id !== id || !Array.isArray(page.rows) || page.rows.length > 25 || typeof page.more !== 'boolean') fail('The firing page is unidentified or unbounded.')
    if (counter !== undefined && JSON.stringify(counter.triggers) !== JSON.stringify(page.counter.triggers)) fail('The counter triggers changed during paging; retry the read.')
    counter = page.counter
    let previous = before ?? Infinity
    for (const row of page.rows) {
      if (!object(row) || !Number.isSafeInteger(row.seq) || row.seq < 1 || row.seq >= previous || rowsSeen.has(row.seq)) fail('The firing cursor repeated or did not descend.')
      rowsSeen.add(row.seq); previous = row.seq
      if (row.what === 'firing') firings.push(row)
      if (row.what === 'firing' && row.answer?.kind === 'job' && row.answer.job === job && row.answer.finished === false) {
        if (typeof row.at !== 'string' || parseAnyStamp(row.at) === null) fail(`Firing ${id}/${row.seq} has an unreadable date.`)
        pending.push(row)
      }
    }
    if (!page.more) break
    if (page.rows.length === 0) fail('The firing cursor says more but identifies no older row.')
    before = previous
  } while (true)
  pending.sort((a, b) => a.seq - b.seq)
  const firing = pending[0] ?? null
  const earlier = firing === null ? null : firings.filter(row => row.seq < firing.seq && row.answer?.kind === 'job' && row.answer.finished === true && Array.isArray(row.answer.ids) && row.answer.ids.length === 1).sort((a, b) => b.seq - a.seq)[0]
  return { counter, firing, previousReceipt: earlier?.answer.ids[0] ?? null, newerFiring: firing === null ? false : firings.some(row => row.seq > firing.seq) }
}

/** One office reply as an object, or a refusal in words. A cut or unreadable reply is never read as an answer. */
async function said(io, method, path, body) {
  const reply = await io.officeRequest({ method, path, ...(body === undefined ? {} : { body }) })
  if (!object(reply) || reply.cut !== false) fail(`The office reply for ${method} ${path} was cut or missing. Its contents are unknown; nothing was assumed.`)
  let value
  try { value = typeof reply.body === 'string' ? JSON.parse(reply.body) : reply.body } catch { fail(`The office returned unreadable JSON for ${method} ${path}.`) }
  if (!object(value)) fail(`The office returned no object for ${method} ${path}.`)
  if (reply.status < 200 || reply.status >= 300) fail(`The office refused ${method} ${path} (${reply.status}): ${value.error ?? value.message ?? 'no reason was given'}`)
  return value
}

/** The triggers the two settings name, as the counter is filed with them. */
const theSettingsTriggers = schedule => [{ kind: 'count', n: schedule.landings }, { kind: 'every', hours: schedule.hours }]

/** Whether a counter's triggers are the settings' ones, by kind and number only. */
const takesTheSettingsTriggers = (counter, schedule) => Array.isArray(counter.triggers)
  && JSON.stringify(counter.triggers.map(one => (object(one) && one.kind === 'count' ? { kind: one.kind, n: one.n } : object(one) && one.kind === 'every' ? { kind: one.kind, hours: one.hours } : { kind: object(one) ? one.kind : null })))
    === JSON.stringify(theSettingsTriggers(schedule))

/**
 * THE COUNTER WITH THE SETTINGS' TRIGGERS. A counter that says otherwise is changed back with one change whose reason
 * names both settings, and the counter that change returns is read from then on. One that still says otherwise is refused.
 */
async function withTheSettingsTriggers(io, id, counter, schedule) {
  if (takesTheSettingsTriggers(counter, schedule)) return counter
  const because = `The two settings MOLE_OFFICE_MAIN_SUITE_LANDINGS (${schedule.landings}) and MOLE_OFFICE_MAIN_SUITE_HOURS (${schedule.hours}) are where the schedule of the whole suite on main is written, so the counter's triggers are put back to what they say.`
  const changed = (await said(io, 'PATCH', `/api/counters/${encodeURIComponent(id)}`, { triggers: theSettingsTriggers(schedule), because })).counter
  if (!object(changed) || changed.id !== id || !takesTheSettingsTriggers(changed, schedule)) fail(`Counter ${id} does not take the triggers the two settings name, a count of ${schedule.landings} landings and every ${schedule.hours} hours. Its firing was not answered.`)
  return changed
}

/**
 * THE RUNNER'S OWN PROCESS ROW, for a runner a host timer starts with no row named. The seat is held by a process
 * group, and the office must read the runner's group as the runner's own, which it is under `setsid -w`. Any other
 * group is let go without a signal and refused, before the producer starts.
 */
async function theRunnersOwnRow(io, env, id, firing) {
  const held = await said(io, 'POST', '/api/resources', { type: 'process', key: String(process.pid), sessionRecordId: theRunsIdentity(env).session, detail: `The main-suite job runner, for firing ${firing.seq} of counter ${id}` })
  const row = held.resource
  if (!object(row) || typeof row.id !== 'string' || row.id === '') fail('The office did not identify the runner\'s own process row. The producer was not started.')
  if (row.pgid !== process.pid) {
    await said(io, 'POST', `/api/resources/${encodeURIComponent(row.id)}/release`, { signalNothing: true })
    fail(`The runner ${process.pid} does not lead its own process group: the office reads group ${String(row.pgid)}. Start it under setsid -w. Its row was let go and the producer was not started.`)
  }
  return row.id
}

/** What a poll says when it reads a firing's moment from its stamp. */
export const A_FIRINGS_MOMENT_FROM_ITS_STAMP = {
  notPublished: 'The office published no instant beside it',
  notKept: 'The office kept no instant for it, because the row was written before the office kept one',
  twice: 'The stamp names two moments an hour apart there, and the later was taken, so a poll before it is refused.',
}
/** The refusal when the poll's clock comes before its firing's moment. */
export const THE_POLL_PRECEDES_ITS_FIRING = 'The poll clock is invalid or precedes its firing.'
/** The skip when the counter's next firing was due before this poll. */
export const THE_NEXT_FIRING_WAS_ALREADY_DUE = 'The next firing was already due before this poll; no producer was started.'

/**
 * THE FIRING'S MOMENT, read from the instant the office publishes beside the row's stamp (13q item 1g). On the night the
 * clocks go back a stamp can name two moments an hour apart. An office that publishes no instant, and a row whose
 * instant is null because it was written before the office kept one, leave only the stamp. It is read in this
 * process's zone, as the counter reads such a row: where it names two moments, as the later one, so a poll that could
 * come before its firing is refused and never let in. The reading says which it used.
 */
function theFiringsMoment(id, firing) {
  const which = `Firing ${id}/${firing.seq}`
  if (typeof firing.atInstant === 'string') {
    const ms = momentOfAnInstant(firing.atInstant)
    if (!Number.isFinite(ms)) fail(`${which} has an instant that names no moment: ${firing.atInstant}. Nothing was read from its stamp instead.`)
    return { ms, readFrom: 'atInstant', says: `${which}'s moment was read from the instant the office published, ${firing.atInstant}.` }
  }
  if (firing.atInstant !== undefined && firing.atInstant !== null) fail(`${which} has an instant that is not words: ${JSON.stringify(firing.atInstant)}. Nothing was read from its stamp instead.`)
  const none = firing.atInstant === undefined ? A_FIRINGS_MOMENT_FROM_ITS_STAMP.notPublished : A_FIRINGS_MOMENT_FROM_ITS_STAMP.notKept
  const zone = theClockZone()
  const ms = latestMomentOfStampInZone(firing.at, zone)
  if (ms === null) fail(`${which}'s stamp ${firing.at} names no moment in ${zone}. ${none}.`)
  const twice = uniqueMomentOfStoredStampInZone(firing.at, zone) === null ? ` ${A_FIRINGS_MOMENT_FROM_ITS_STAMP.twice}` : ''
  return { ms, readFrom: 'at', says: `${which}'s moment was read from its stamp ${firing.at} in ${zone}. ${none}.${twice}` }
}

function cadence(counter, newerFiring) {
  // The counter alone spaces the runs; the producer adds no spacing of its own on this path.
  const every = Array.isArray(counter.triggers) ? counter.triggers.findIndex(one => object(one) && one.kind === 'every') : -1
  if (every < 0) fail('The configured counter has no every trigger.')
  // THE INSTANTS, NOT THE STAMPS: on the night the clocks go back a stamp can name two moments an hour apart (13r round P,
  // problem tl4r2TCQl_Oh). A counter that publishes no instant is refused, never read from its stamp instead.
  if (typeof counter.nextDue?.instant !== 'string') fail('The counter did not publish a defensible next due time for its every trigger.')
  let dueAt = momentOfAnInstant(counter.nextDue.instant)
  if (!Number.isFinite(dueAt) || counter.nextDue.trigger !== every) fail('The counter did not publish a defensible next due time for its every trigger.')
  if (counter.heldBack !== null) {
    if (typeof counter.heldBack?.untilInstant !== 'string') fail('The counter did not publish a defensible held-back boundary.')
    const until = momentOfAnInstant(counter.heldBack.untilInstant)
    if (!Number.isFinite(until)) fail('The counter did not publish a defensible held-back boundary.')
    dueAt = Math.max(dueAt, until)
  }
  return { dueAt, newerFiring }
}

/** Every file has its full reading in the journal; short boundary names keep the firing within its door's budget. */
function traceSays(trace, budget, journal) {
  const full = trace.files.map(one => {
    const outcome = one.landing === undefined ? `${one.status}: ${one.reason}` : `landing ${one.landing}; ${one.problem === undefined ? `${one.status}: ${one.reason}` : `problem ${one.problem}${one.reason === undefined ? '' : `; ${one.reason}`}`}`
    const ran = [...new Set((one.runs ?? []).map(run => run.commit))].map(commit => commit.slice(0, 12)).join(',') || 'none'
    return `${one.file}: ${outcome}; ran ${ran}; ${(one.unvisited ?? []).length} boundaries not run.`
  })
  const suffix = ` Full file and boundary facts: ${journal}.`
  if (full.join(' ').length + suffix.length + 1 <= budget) return ` ${full.join(' ')}${suffix}`
  // A receipt may name more files than 2000 characters can hold; every indexed outcome still appears and the journal names each file.
  const compact = trace.files.map((one, index) => `File ${index + 1}: ${one.landing === undefined ? one.status : `landing ${one.landing}`}${one.problem === undefined ? '' : `, problem ${one.problem}`}.`).join(' ')
  if (compact.length + suffix.length + 1 <= budget) return ` ${compact}${suffix}`
  return ` ${trace.files.length} file outcomes, including files beyond the five-file limit, and every reason and boundary: ${journal}.`
}

/** Tests supply a synthetic cloud transport to the actual producer and a real throwaway Office. */
export async function mainSuiteJobTick(options, supplied = {}) {
  const env = options.env ?? process.env
  const id = options.counterId ?? readSetting('MOLE_OFFICE_MAIN_SUITE_COUNTER', env).value
  if (id === undefined || id === null || id === '') return { status: 'dormant', says: 'No periodic suite counter is configured.' }
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) fail('The configured counter must be one exact record id.')
  // Load the one job name owned by configuration; importing this poll starts no job.
  const { MAIN_SUITE_JOB, mainSuiteSchedule } = await import(new URL('../src/config/main-suite-job.mjs', import.meta.url).href)
  if (typeof MAIN_SUITE_JOB !== 'string' || MAIN_SUITE_JOB === '') fail('The canonical periodic job name is unavailable.')
  const schedule = mainSuiteSchedule(env)
  const io = { officeRequest: asked => producerOfficeRequest(asked, env), clock: Date.now, traceMainSuiteReds, ...supplied }
  const workdir = stateRoot(options)
  const lock = join(workdir, 'poll.lock')
  let fd
  try { fd = openSync(lock, 'wx', 0o600) } catch (error) { if (error.code === 'EEXIST') fail(`Poll lock remains at ${lock}; inspect its holder before supervised recovery.`); throw error }
  writeFileSync(fd, `${JSON.stringify({ pid: process.pid, counter: id, repository: options.repository })}\n`); closeSync(fd)
  try {
    const pending = await pendingFiring(io, id, MAIN_SUITE_JOB)
    const { firing, newerFiring } = pending
    const counter = await withTheSettingsTriggers(io, id, pending.counter, schedule)
    if (firing === null) return { status: 'idle', says: 'No periodic suite firing is pending.' }
    const moment = theFiringsMoment(id, firing)
    const firingMoment = { readFrom: moment.readFrom, says: moment.says }
    const { dueAt } = cadence(counter, newerFiring)
    const now = io.clock()
    if (!Number.isSafeInteger(now) || now < moment.ms) fail(`${THE_POLL_PRECEDES_ITS_FIRING} ${moment.says}`)
    const journal = join(workdir, `firing-${id}-${firing.seq}.json`)
    let state = readState(journal)
    const identity = { version: 1, counter: id, seq: firing.seq, job: firing.answer.job, firedAt: firing.at, repository: options.repository }
    if (state !== null && (!object(state) || Object.entries(identity).some(([key, value]) => state[key] !== value) || !['selected', 'in line', 'running', 'observed', 'tracing', 'answering', 'answered', 'waiting', 'failed'].includes(state.step) || (state.step === 'in line' && !Number.isSafeInteger(state.inLineSince)))) fail(`Poll journal identity or step is invalid: ${journal}`)
    state ??= { ...identity, step: 'selected' }
    const producerWorkdir = join(workdir, 'producer')
    const persist = patch => { state = { ...state, ...patch }; save(journal, state) }
    if (!existsSync(journal)) persist({ step: 'selected' })
    const answer = async body => {
      if (typeof body.says !== 'string' || body.says.length > 2000) fail(`The complete firing answer exceeds its limit; supervised recovery is required at ${journal}.`)
      persist({ step: 'answering', answer: body })
      const reply = await io.officeRequest({ method: 'POST', path: `/api/counters/${encodeURIComponent(id)}/firings/${firing.seq}/answer`, body })
      if (!object(reply) || reply.status !== 200 || reply.cut !== false || reply.location !== null) fail(`The firing answer is unverified. Retry the poll; its original answer is kept at ${journal}.`)
      const read = typeof reply.body === 'string' ? JSON.parse(reply.body) : reply.body
      if (!object(read?.row) || read.row.seq !== firing.seq || read.row.what !== 'firing' || read.row.answer?.finished !== true || read.row.answer.says !== body.says || JSON.stringify(read.row.answer.ids) !== JSON.stringify(body.result === undefined ? [] : [body.result])) fail(`The firing answer did not confirm its exact row and outcome. Inspect ${journal}.`)
      persist({ step: 'answered' })
      return { status: 'answered', counter: id, seq: firing.seq, firingMoment, ...body }
    }
    const failed = async (error, category) => {
      const failure = error instanceof Error ? error.message : String(error)
      persist({ step: 'failed', failure })
      const body = { says: `Counter ${id}, firing ${firing.seq}: failed or refused (${category}). Full failure reason and supervised recovery: ${journal}. Logs and original producer state: ${producerWorkdir}.` }
      await answer(body)
      return { status: 'failed', counter: id, seq: firing.seq, firingMoment, says: body.says }
    }
    const verifiedAnswer = async result => {
      let verified
      let pinned
      try {
        pinned = result.evidence ?? (await readOriginalReceipt(result.receipt, io)).evidence
        if (pinned.recordId !== result.receipt) fail('The original receipt pin names another record.')
        persist({ step: 'observed', result: { ...result, evidence: pinned } })
        verified = await verifyOriginalReceiptEvidence({ repository: options.repository, commit: result.commit, evidence: pinned }, io)
        if (!verified.complete) fail(`Original receipt ${result.receipt} has partial coverage; no defensible firing result.`)
      } catch (error) { return failed(error, 'original receipt evidence refused') }
      const prefix = `Counter ${id}, firing ${firing.seq}: verified original receipt ${result.receipt} for ${verified.receipt.commit}; outcome ${verified.outcome}.`
      let says = prefix
      if (verified.outcome === 'red') {
        const previousId = state.tracePrevious === undefined ? pending.previousReceipt : state.tracePrevious
        persist({ step: 'tracing', tracePrevious: previousId, result: { ...result, evidence: pinned } })
        if (state.trace === undefined) {
          let previousReceipt = null, baselineFailure
          if (previousId !== null) {
            try {
              const earlier = await readOriginalReceipt(previousId, io)
              if (earlier.original.content.data.repository !== options.repository) fail('The earlier firing receipt belongs to another repository.')
              previousReceipt = { id: previousId, data: earlier.original.content.data }
            } catch (error) { baselineFailure = error instanceof Error ? error.message : String(error) }
          }
          const trace = baselineFailure === undefined
            ? await io.traceMainSuiteReds({ receipt: { id: result.receipt, data: verified.receipt }, previousReceipt, repository: options.repository, workdir: join(workdir, 'trace'), officeRequest: io.officeRequest, runAlone: io.runAlone, limits: options.traceLimits })
            : { files: (verified.receipt.failedFiles ?? []).map(file => ({ file, status: 'unknown', reason: `earlier receipt unavailable: ${baselineFailure}`, runs: [], unvisited: [] })) }
          persist({ step: 'tracing', trace, traceReceipt: result.receipt })
        }
        if (state.traceReceipt !== result.receipt || !Array.isArray(state.trace?.files)) fail(`The saved trace does not identify this receipt; inspect ${journal}.`)
        says += traceSays(state.trace, 2000 - prefix.length, journal)
      }
      const body = { result: result.receipt, says }
      persist({ result: { ...result, evidence: pinned }, answer: body })
      return answer(body)
    }
    const finishObserved = async result => {
      if (!object(result) || typeof result.says !== 'string') fail(`The observed producer result is malformed; inspect ${journal}.`)
      if (result.receipt !== undefined) return verifiedAnswer(result)
      if (result.status === 'skipped' && ['seat', 'interval'].includes(result.reason)) {
        persist({ step: 'waiting', reason: result.says })
        // The producer may have waited in the seat's line until the firing's time ended, so the time is read again.
        const later = io.clock()
        if (!Number.isSafeInteger(later) || later < now) fail(`The poll clock moved backwards while the producer waited; inspect ${journal}.`)
        if (newerFiring || later >= dueAt) return answer({ says: `Counter ${id}, firing ${firing.seq}: skipped. ${result.says} No poll waits for this firing any longer. Current next firing due ${localStamp(new Date(dueAt))}.` })
        return { status: 'pending', counter: id, seq: firing.seq, firingMoment, says: `${result.says} A later poll may try again until ${localStamp(new Date(dueAt))}, at most ${Math.ceil((dueAt - later) / 60_000)} more minutes from now.`, journal }
      }
      if (result.status !== 'not run') fail(`The observed producer has no recognized outcome; inspect ${journal}.`)
      return answer({ says: `Counter ${id}, firing ${firing.seq}: ${result.status}. ${result.says} Next firing due ${localStamp(new Date(dueAt))}. Logs: ${result.attempt ?? producerWorkdir}.` })
    }
    // EVERY RETURN BELOW AWAITS ITS ANSWER, so the finally blocks run only after the poll's last office call has ended. A
    // promise returned without await is taken up only after the finally blocks have run. Before, the lock went while that
    // call was still out. With the runner's own row, the inner finally awaited the row's release, an answer rejected
    // meanwhile had no handler, and Node ended the process with exit 1 before the outer finally ran, so the lock stayed.
    if (state.answer !== undefined) {
      if (state.failure === undefined && state.result?.receipt !== undefined) return await verifiedAnswer(state.result)
      return await answer(state.answer)
    }
    if (state.failure !== undefined) return await failed(state.failure, 'original attempt requires supervision')
    if (['observed', 'tracing'].includes(state.step) && state.result !== undefined) return await finishObserved(state.result)
    if (state.step === 'running') {
      return await failed('An interrupted producer has no recorded result correlated with this firing. Neither timestamps nor a retained lastReceipt establish that correlation. Inspect the producer state and attempt before supervised recovery.', 'interrupted original attempt')
    }
    // A journal left `in line` belongs to a poll that ended while it waited for the seat, before any suite started.
    const notStarted = state.step === 'in line' ? `A poll waited in the seat's line from ${localStamp(new Date(state.inLineSince))} and ended without a result, before any suite started.` : state.reason
    if (newerFiring || now >= dueAt) return await answer({ says: `Counter ${id}, firing ${firing.seq}: skipped. ${notStarted ?? (newerFiring ? 'A newer firing is already recorded; no producer was started.' : THE_NEXT_FIRING_WAS_ALREADY_DUE)} Current next firing due ${localStamp(new Date(dueAt))}.` })
    if (options.signal?.aborted) return { status: 'pending', counter: id, seq: firing.seq, firingMoment, says: `Not run: interrupted before starting. Journal: ${journal}` }
    const ownRow = options.processResource === undefined ? await theRunnersOwnRow(io, env, id, firing) : null
    try {
      // THE PRODUCER WAITS IN THE FULL-SUITE SEAT'S LINE INSIDE THIS POLL (13q item 1j), until the firing's time ends. The
      // step is `in line` while it waits, and becomes `running` only when the seat is granted, so a poll that ended in
      // line is never taken for an interrupted suite.
      persist({ step: 'in line', inLineSince: now })
      const seatLine = { until: dueAt, seated: () => persist({ step: 'running', startedAtMs: io.clock() }) }
      let result
      try { result = await runPeriodicSuiteOnce({ ...options, processResource: ownRow ?? options.processResource, intervalSeconds: null, workdir: producerWorkdir, env, seatLine }, io) }
      catch (error) {
        return await failed(error, 'original producer failed')
      }
      persist({ step: 'observed', result })
      return await finishObserved(result)
    } finally {
      if (ownRow !== null) await said(io, 'POST', `/api/resources/${encodeURIComponent(ownRow)}/release`, { signalNothing: true })
    }
  } finally { unlinkSync(lock) }
}

/**
 * FILE THE COUNTER THE TWO SETTINGS DESCRIBE, once, under the runner's own agent, and say the setting line that turns
 * it on. Refused when MOLE_OFFICE_MAIN_SUITE_COUNTER already names a counter.
 */
export async function fileTheMainSuiteCounter(options, supplied = {}) {
  const env = options.env ?? process.env
  const named = readSetting('MOLE_OFFICE_MAIN_SUITE_COUNTER', env).value
  if (named !== null && named !== undefined && named !== '') fail(`MOLE_OFFICE_MAIN_SUITE_COUNTER already names counter ${named}. Nothing was filed.`)
  if (!isAbsolute(options.repository ?? '') || realpathSync(options.repository) !== options.repository) fail('Name the main repository by its exact canonical absolute root. Nothing was filed.')
  const { mainSuiteCounter } = await import(new URL('../src/config/main-suite-job.mjs', import.meta.url).href)
  const io = { officeRequest: asked => producerOfficeRequest(asked, env), ...supplied }
  const body = mainSuiteCounter(options.repository, env)
  const counter = (await said(io, 'POST', '/api/counters', body)).counter
  if (!object(counter) || typeof counter.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(counter.id)) fail('The office did not identify the counter it filed. Look for it before filing another.')
  const [count, every] = body.triggers
  return { status: 'filed', counter: counter.id, says: `Counter ${counter.id} asks for the whole suite on main every ${count.n} landings in ${options.repository}, or after ${every.hours} hours and at least one landing. It is off until this setting line is in the runner's environment: MOLE_OFFICE_MAIN_SUITE_COUNTER=${counter.id}` }
}

export async function runMainSuiteJobCli(words = process.argv.slice(2), env = process.env, signal, supplied = {}) {
  const named = {}
  while (words.length) {
    const key = words.shift()
    if (key === '--file-the-counter' && !Object.hasOwn(named, key)) { named[key] = true; continue }
    if (!['--repository', '--workdir', '--process-resource', '--timeout-seconds'].includes(key) || Object.hasOwn(named, key) || words.length === 0) fail('An option is unknown, repeated or missing its value.')
    named[key] = words.shift()
  }
  if (named['--file-the-counter']) {
    if (Object.keys(named).some(key => !['--file-the-counter', '--repository'].includes(key))) fail('Use --file-the-counter with --repository only.')
    return fileTheMainSuiteCounter({ repository: named['--repository'], env }, supplied)
  }
  return mainSuiteJobTick({ repository: named['--repository'], workdir: named['--workdir'], processResource: named['--process-resource'], ...(named['--timeout-seconds'] === undefined ? {} : { timeoutSeconds: Number(named['--timeout-seconds']) }), env, signal }, supplied)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  // The producer keeps its seat until its bounded door and cleanup return.
  runMainSuiteJobCli(undefined, process.env, controller.signal).then(result => process.stdout.write(`${result.says}\n${result.firingMoment === undefined ? '' : `${result.firingMoment.says}\n`}${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }).finally(() => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) })
}
