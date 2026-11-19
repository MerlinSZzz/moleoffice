// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Read the merger's timestamped logs. This tool never calls the office or changes a queue. */
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { THE_RUN_OUTPUT_FOLDER } from '../src/config/settings.mjs'
import { latestMomentOfStampInZone, momentOfStampInZone, theClockZone, uniqueMomentOfStoredStampInZone } from '../src/shared/time.ts'

/**
 * WHY A LOCAL TIME NAMES TWO MOMENTS, or null when it does not: on the night the clocks go back an hour comes twice in
 * this machine's zone, which is the office's, and a log line's time in words does not say which of the two it was.
 */
function whyItComesTwice(stamp) {
  const zone = theClockZone()
  const first = momentOfStampInZone(stamp, zone), last = latestMomentOfStampInZone(stamp, zone)
  return first === null || last === null || first === last ? null : `${stamp} comes twice in ${zone}, in the hour the clocks go back, and the words do not say which of the two it was.`
}

/** The one moment a local time names in this machine's zone. A time the clocks skip, or one they repeat, throws. */
export function timeOf(stamp) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp)) throw new Error(`Give a local time as YYYY-MM-DD HH:MM:SS: ${stamp}`)
  const at = uniqueMomentOfStoredStampInZone(stamp, theClockZone())
  if (at !== null) return at
  const twice = whyItComesTwice(stamp)
  throw new Error(twice === null ? `Invalid local time: ${stamp}` : `${twice} Give a time outside that hour.`)
}

/** Run logs are in the folder the worker writes them to (THE_RUN_OUTPUT_FOLDER). Either log folder can be chosen explicitly. */
export function logRoots(options = {}, home = homedir()) {
  const queueRoot = options['--queue-root'] ?? join(home, '.cache/mole-office/merge-queue')
  return { queueRoot, runsRoot: options['--runs-root'] ?? THE_RUN_OUTPUT_FOLDER }
}

export function readLogs(queueRoot, runsRoot) {
  const logs = [], unreadable = [], empty = []
  const read = (path) => {
    try { logs.push({ path, text: readFileSync(path, 'utf8') }) }
    catch (error) { unreadable.push({ path, because: error.message }) }
  }
  for (const [root, name] of [[queueRoot, 'the-merger.log'], [runsRoot, 'said.txt']]) {
    let entries
    try { entries = readdirSync(root, { withFileTypes: true }) }
    catch (error) { unreadable.push({ path: root, because: error.message }); continue }
    const folders = entries.filter((one) => one.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
    if (folders.length === 0) empty.push({ path: root, name })
    for (const entry of folders) read(join(root, entry.name, name))
  }
  return { logs, unreadable, empty }
}

export function whyPassed(text) {
  const reason = text.split('. While this is the lane')[0]
  const held = [...reason.matchAll(/([^\s;,]+), which ([\w-]+) also changes(?: (\([^;]+?\)))?(?=;|, and|$)/g)]
    .map((m) => ({ file: m[1], ahead: m[2], rule: m[3] ?? 'unrecorded in this log' }))
  const check = /(?:result|tree), (.+?) of [\w-]+ would not hold what its release read/.exec(reason)
  const files = held.length ? held : check === null ? [] : check[1].split(', ').map((file) => ({ file, ahead: null, rule: reason.includes('by line') ? 'see reason for the line rule' : reason.includes('by join') ? 'see reason for the journal join rule' : reason.includes('by file, decision R2') ? 'by file, decision R2' : 'unrecorded in this log' }))
  return { kind: reason.includes('without a conflict') ? 'git conflict' : held.length ? 'file held by an entry ahead' : check ? 'release content changed' : 'other', reason, files }
}

/**
 * WHERE A BUS'S SUITE RAN, from the lines tools/merge-tool/cloud-suite-door.mjs writes (wave 13v round 30). An attempt
 * starts at the first of its lines: `running suite-door: ` when the cloud box is asked, `suite is not run on the cloud
 * box, so it runs here, …` when it is not asked, or `running suite: ` in a log from before the box. The run here that
 * follows the box's refusal belongs to the same attempt, so it does not move the start. A pair or a bus says
 * `pair-suite` in place of `suite`. `suiteRan.where` is 'the cloud box', 'here', or 'not known from the logs' while
 * only the call to the box is recorded.
 */
export function whereTheSuiteRan(bus, e) {
  const label = bus.tree === null ? 'suite' : 'pair-suite'
  const current = bus.suiteRan !== null && bus.suiteCompletedObservation === null
  const start = (suiteRan) => { bus.suiteStarted = e.stamp; bus.suiteCompletedObservation = null; bus.suiteRan = suiteRan }
  if (e.text.startsWith(`running ${label}-door: `)) start({ where: 'not known from the logs', askedTheBoxAt: e.stamp, line: e.text })
  else if (current && e.text.startsWith(`${label} ran on the cloud box: `)) Object.assign(bus.suiteRan, { where: 'the cloud box', line: e.text })
  else if (e.text.startsWith(`${label} is not run on the cloud box, so it runs here, `)) {
    const because = e.text.slice(`${label} is not run on the cloud box, so it runs here, `.length).replace(/^.*?: /, '')
    if (current && bus.suiteRan.askedTheBoxAt !== undefined && bus.suiteRan.where === 'not known from the logs') Object.assign(bus.suiteRan, { where: 'here', because, line: e.text })
    else start({ where: 'here', because, line: e.text })
  } else if (e.text.startsWith(`running ${label}: `)) {
    if (current && bus.suiteRan.where === 'here' && bus.suiteRan.ranHereFrom === undefined) bus.suiteRan.ranHereFrom = e.stamp
    else start({ where: 'here', ranHereFrom: e.stamp, line: e.text })
  }
}

/**
 * Duplicate copies are counted once. Truncated JSON is never repaired or treated as a receipt. A line whose time comes
 * twice, in the hour the clocks go back, is left out and listed in `linesWithTwoMoments`, unless both moments are after
 * the window.
 */
export function history(logs, from, to, unreadable = []) {
  const start = timeOf(from), end = timeOf(to)
  if (end <= start) throw new Error('The end must be after the start')
  const events = new Map(), untimed = [], twoMoments = [], finalObservations = new Map()
  for (const log of logs) {
    let entry = null
    const occurrences = new Map()
    for (const line of log.text.split('\n')) {
      const m = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) (.*)$/.exec(line)
      if (m === null) continue
      const twice = whyItComesTwice(m[1])
      if (twice !== null) {
        if (momentOfStampInZone(m[1], theClockZone()) < end) twoMoments.push({ source: log.path, line, because: twice })
        continue
      }
      const at = timeOf(m[1])
      const observedFinal = /of merge entry ([\w-]+), which is (withdrawn|bounced|merged)/.exec(m[2])
      const unnamedFinal = /of final merge entry ([\w-]+) (?:was cleared|was not cleared)/.exec(m[2])
      const observedId = observedFinal?.[1] ?? unnamedFinal?.[1]
      const observedBefore = finalObservations.get(observedId)
      if (observedId && at < end && (observedBefore === undefined || at > timeOf(observedBefore.observedAt))) {
        if (observedFinal) finalObservations.set(observedId, { outcome: observedFinal[2] === 'merged' ? 'landed' : observedFinal[2], observedAt: m[1] })
        else if (!finalObservations.has(observedId)) finalObservations.set(observedId, { outcome: 'not known from the logs', observedAt: m[1], why: 'The cleanup says final but does not name the final state.' })
      }
      const header = /^merge entry ([\w-]+) \(/.exec(m[2])
      if (header) entry = header[1]
      const eventEntry = /Merge entry ([\w-]+) was withdrawn by /.exec(m[2])?.[1] ?? entry
      if (eventEntry === null) { if (/the bus|tested with|now merged|now bounced|now withdrawn/.test(m[2])) untimed.push({ source: log.path, line }); continue }
      if (at >= end) continue
      // Occurrence n in one log matches occurrence n in a copied log, not occurrence n-1 in the same log.
      const identity = `${eventEntry}\n${line}`
      const occurrence = (occurrences.get(identity) ?? 0) + 1
      occurrences.set(identity, occurrence)
      const key = `${identity}\n${occurrence}`
      const previous = events.get(key)
      if (previous) previous.sources.push(log.path)
      else events.set(key, { entry: eventEntry, at, stamp: m[1], text: m[2], sources: [log.path], order: events.size })
    }
  }
  const ordered = [...events.values()].sort((a, b) => a.at - b.at || a.order - b.order)
  const states = new Map(), pending = new Map(), active = new Map(), buses = [], unreadableStepReceipts = []
  const stateOf = (id) => { if (!states.has(id)) states.set(id, { judged: null, end: null, pendingMain: null, outcomes: [] }); return states.get(id) }
  const pendingOf = (id) => { if (!pending.has(id)) pending.set(id, []); return pending.get(id) }
  for (const e of ordered) {
    const state = stateOf(e.entry)
    const header = /^merge entry [\w-]+ \(.*?\) is judged;/.test(e.text)
    if (header) {
      state.pendingMain = null
      state.outcomes.push({ outcome: 'back to judged', at: null, observedAt: e.stamp })
    }
    const main = /^(?:main moved from [a-f0-9]{40} to ([a-f0-9]{40}) by fast-forward|the office decided: Merged: the main world is at ([a-f0-9]{40})\.)/.exec(e.text)
    if (main) state.pendingMain = main[1] ?? main[2]
    if (e.text.startsWith('step landed: ')) {
      try {
        const receipt = JSON.parse(e.text.slice(13))
        state.pendingMain = /^[a-f0-9]{40}$/.test(receipt.mainAfter ?? '') ? receipt.mainAfter : null
      } catch { unreadableStepReceipts.push({ entry: e.entry, at: e.stamp, because: 'The landed request JSON is incomplete or invalid; it was not repaired.' }) }
    }
    if (/FAILED.*(?:step landed|landed step)/.test(e.text)) state.pendingMain = null
    const judgedAgain = /^the office answered: the entry is now judged$/.test(e.text)
    if (judgedAgain && state.judged === null) state.judged = e
    if (judgedAgain) state.outcomes.push({ outcome: 'back to judged', at: e.stamp })
    const final = /^the office answered: the entry is now (merged|bounced|withdrawn)$/.exec(e.text)
    if (final) {
      state.end = { ...e, outcome: final[1] === 'merged' ? 'landed' : final[1] }
      state.outcomes.push({ outcome: state.end.outcome, at: e.stamp, ...(final[1] === 'merged' ? { mainHash: state.pendingMain } : final[1] === 'withdrawn' ? { by: 'not known from the logs' } : {}) })
    }
    const withdrew = /Merge entry ([\w-]+) was withdrawn by (.+?)(?: \(|, so)/.exec(e.text)
    if (withdrew) stateOf(withdrew[1]).outcomes.push({ outcome: 'withdrawn', at: null, observedAt: e.stamp, by: withdrew[2] })
    const pass = /^the bus passes over merge entry ([\w-]+): (.*)$/.exec(e.text)
    if (pass) pendingOf(e.entry).push({ entry: pass[1], at: e.stamp, ...whyPassed(pass[2]), sources: e.sources })
    const board = /^tested with merge entr(?:y|ies) (.+?) in one suite, on the (?:pair's|bus's) tree (\w+)$/.exec(e.text)
    if (board || e.text.startsWith('tested alone:')) {
      const passed = pendingOf(e.entry)
      const bus = { leader: e.entry, started: passed[0]?.at ?? e.stamp, declaredAt: e.stamp, riders: [e.entry, ...(board ? board[1].split(', ') : [])], tree: board?.[2] ?? null, passedOver: passed, aloneReason: board ? null : e.text.slice(14), suiteStarted: null, suiteCompletedObservation: null, suiteRan: null, leaderEnd: null, sources: e.sources }
      buses.push(bus); active.set(e.entry, bus); pending.set(e.entry, [])
    }
    const bus = active.get(e.entry)
    if (bus) whereTheSuiteRan(bus, e)
    if (bus?.suiteStarted && bus.suiteCompletedObservation === null && e.text.startsWith("the office's health while the suite ran:")) bus.suiteCompletedObservation = e.stamp
    if (bus && /the bus's (tree does not build|suite left no readable report)/.test(e.text)) bus.abandoned = e.text
    if (bus && (final || judgedAgain)) {
      bus.leaderEnd = { outcome: final ? state.end.outcome : 'returned to judged', at: e.stamp }
      active.delete(e.entry)
    }
  }
  const inWindow = (at) => at >= start && at < end
  const selected = buses.filter((b) => inWindow(timeOf(b.started))).map((b) => ({ ...b,
    suiteSeconds: null,
    suiteElapsedThroughCompletionObservationSeconds: b.suiteStarted && b.suiteCompletedObservation ? (timeOf(b.suiteCompletedObservation) - timeOf(b.suiteStarted)) / 1000 : null,
    outcomes: b.riders.map((entry) => {
      const next = buses.find((later) => timeOf(later.declaredAt) > timeOf(b.declaredAt) && later.riders.includes(entry))
      const until = next ? timeOf(next.declaredAt) : end
      const transitions = stateOf(entry).outcomes.filter((one) => timeOf(one.at ?? one.observedAt) >= timeOf(b.declaredAt) && timeOf(one.at ?? one.observedAt) < until)
      const observed = finalObservations.get(entry)
      if (observed && !transitions.some((one) => ['landed', 'withdrawn', 'bounced'].includes(one.outcome)) && timeOf(observed.observedAt) >= timeOf(b.declaredAt) && timeOf(observed.observedAt) < until) transitions.push({ ...observed, at: null, ...(observed.outcome === 'withdrawn' ? { by: 'not known from the logs' } : {}) })
      transitions.sort((a, c) => timeOf(a.at ?? a.observedAt) - timeOf(c.at ?? c.observedAt))
      return { entry, ...(transitions.at(-1) ?? { outcome: 'not known from the logs', at: null }), history: transitions }
    }),
  }))
  const landings = [...states.entries()].filter(([, s]) => s.end?.outcome === 'landed' && inWindow(s.end.at))
  const hourly = {}, delays = []
  for (const [entry, state] of landings) {
    const hour = state.end.stamp.slice(0, 13) + ':00:00'
    hourly[hour] = (hourly[hour] ?? 0) + 1
    if (state.judged) delays.push({ entry, seconds: (state.end.at - state.judged.at) / 1000 })
  }
  const files = { wordLists: {}, code: {}, other: {} }, passCounts = {}
  for (const b of selected) for (const p of b.passedOver) {
    passCounts[p.kind] = (passCounts[p.kind] ?? 0) + 1
    for (const file of new Set(p.files.map((f) => f.file))) {
      const group = /^src\/shared\/words\//.test(file) ? files.wordLists : /\.(?:[cm]?[jt]sx?)$/.test(file) ? files.code : files.other
      group[file] = (group[file] ?? 0) + 1
    }
  }
  for (const group of Object.keys(files)) files[group] = Object.fromEntries(Object.entries(files[group]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
  const last = ordered.at(-1)?.stamp ?? null
  const joinedBuses = selected.filter((bus) => bus.tree !== null)
  return { window: { from, to, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    coverage: { logsRead: logs.length, unreadable, unreadableStepReceipts, firstEvent: ordered[0]?.stamp ?? null, lastEvent: last, unattributedLines: untimed, linesWithTwoMoments: twoMoments,
      passesWithoutATestDeclaration: [...pending.entries()].flatMap(([leader, passes]) => passes.filter((p) => inWindow(timeOf(p.at))).map((p) => ({ leader, ...p }))),
      note: 'Occurrence n of the same entry, timestamp and text matches occurrence n in another log copy. Repeated occurrences inside one log remain separate; timing and text alone cannot distinguish independently identical logs. Counts are observations in readable logs, not a claim that the history is complete. No event is invented for a missing period. Started means the first recorded pass-over, or the test declaration if none was passed over. leaderEnd is this attempt’s accepted leader transition, including a return to judged; it is unknown without that receipt. Outcomes are each rider’s own last recorded outcome after boarding and before its next declared bus; history keeps the earlier outcomes. A leader’s fast-forward never counts as a rider’s landing. Unreadable landed request JSON is listed and never repaired; a complete fast-forward or merged receipt can name the same entry’s main hash. A judged header observes that state but does not date the transition; a withdrawal actor is unknown unless the log names it; a cleanup observation has observedAt and no transition time. Cleanup that says only final leaves the final outcome unknown and keeps the observed return to judged in history. Only accepted merged transitions count as landings. A bus includes its leader; solo test attempts count as one-rider buses. Suite time is unknown: the elapsed observation includes the health recorder stopping after the suite, and is an upper bound, not an exact suite duration. It starts at the attempt’s first line, which is the call to the cloud box when the box was asked, so a run here after the box did not run it includes the call. suiteRan says where the suite ran, from the cloud-box door’s own lines and the run here: the cloud box, here (with the reason the box did not run it, when the log gives one), or not known from the logs when only the call to the box is recorded; it is null when no suite line is recorded. File counts are pass-over events naming that file, not distinct entries; conflict logs do not name their files. A truncated reason can omit files; its visible text is kept as written. A line whose time comes twice, in the hour the clocks go back, is left out of every count and listed in linesWithTwoMoments, because its time in words names two moments.' },
    buses: selected,
    totals: { observedLandings: landings.length, observedLandingsPerWindowHour: landings.length / ((end - start) / 3600000), landingsByHour: hourly,
      buses: selected.length, riders: selected.reduce((n, b) => n + b.riders.length, 0), ridersPerBus: selected.length ? selected.reduce((n, b) => n + b.riders.length, 0) / selected.length : null,
      joinedBuses: joinedBuses.length, soloAttempts: selected.length - joinedBuses.length,
      ridersPerJoinedBus: joinedBuses.length ? joinedBuses.reduce((n, b) => n + b.riders.length, 0) / joinedBuses.length : null,
      judgedToLanded: { measured: delays.length, unknown: landings.length - delays.length, meanSeconds: delays.length ? delays.reduce((n, d) => n + d.seconds, 0) / delays.length : null, entries: delays },
      passOvers: passCounts, files }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), options = {}
    while (args.length) {
      const flag = args.shift()
      if (!['--from', '--to', '--queue-root', '--runs-root'].includes(flag) || args.length === 0) throw new Error('Usage: node tools/queue-history.mjs --from "YYYY-MM-DD HH:MM:SS" --to "YYYY-MM-DD HH:MM:SS" [--queue-root DIR] [--runs-root DIR]')
      if (options[flag] !== undefined) throw new Error(`Repeated option: ${flag}`)
      options[flag] = args.shift()
    }
    const roots = logRoots(options)
    const { logs, unreadable, empty } = readLogs(roots.queueRoot, roots.runsRoot)
    for (const one of unreadable) console.error(`Cannot read ${one.path}: ${one.because}`)
    for (const one of empty) console.error(`No ${one.name} logs in ${one.path}: the folder has no entry folders.`)
    const result = history(logs, options['--from'], options['--to'], unreadable)
    console.log(JSON.stringify({ ...result, logRoots: roots, emptyLogFolders: empty }, null, 2))
    if (unreadable.length || empty.length || result.coverage.unattributedLines.length || result.coverage.linesWithTwoMoments.length || result.coverage.passesWithoutATestDeclaration.length || result.coverage.lastEvent === null || timeOf(result.coverage.lastEvent) < timeOf(options['--from'])) process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 2 }
}
