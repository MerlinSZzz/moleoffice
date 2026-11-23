// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theModelsLimitedAt` was moved byte for byte out of src/server/lib/casting-roll.ts, with no change of behaviour.
 * `theLimitOfTheSandboxesLogin` was moved byte for byte out of src/server/lib/casting-roll.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { castingLimitName, castingModelName, parseCastingReset, type CastingLimits } from '@shared/casting-roll.ts'
import { THE_LAST_SEVEN_DAYS_MS, type OwnEventReading, aUseInPercent, minute } from '@shared/logins-week.ts'
import { momentOfStampInZone, parseAnyStamp, stampInZone, theClockZone } from '@shared/time.ts'
import { A_GO_LIMIT_IS, STOP_CAUSE_KIND_IN_SQL, WAITS_ON_A_LIMIT_IN_SQL, theStopCauseOf, theWaitOnALimitOf } from '../../config/stopped-run-cause.mjs'
import { THE_ROUTED_PROVIDERS, theProviderRouterIsOn } from '../../config/provider-router.mjs'
import { declaredTypeOf, SHAPE_SPECS } from '@shared/kinds.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'

/**
 * Limits at one instant, across projects because the provider login serves the whole office.
 *
 * A RUN WAITING ON GO'S LIMIT LIMITS GO ONLY WHILE IT LIVES, AND ONLY ON THE KEY A NEW GO RUN WOULD GET (point
 * U5ZNMQKj-8AJ, decisions IBuGShbFZ5pP and DSvi3SSy_trI). `theMarkStillCounts` below is that rule. `routerIsOn` says
 * whether the provider router is on. When the caller leaves it out, it is read through theProviderRouterIsOn, which
 * reads the environment and `.env` at each call and starts nothing.
 *
 * WHAT THE OFFICE CANNOT TELL OF A MARK. A mark names only the kind of key it waits on, never which key. So a Go key
 * changed under the same name is not seen: a new value in OPENCODE_API_KEY, a new OpenCode login, or a slot added to
 * the router. A mark on that name still limits Go until its reset. And a run whose launcher died while its container
 * goes on still reads as running, with its mark on it, because nothing ends it. Its mark limits Go until its reset.
 *
 * THE SANDBOXES' CLAUDE LOGIN LIMITS CLAUDE ONLY ON A CURRENT READING of its own rate-limit event (lib/logins-week.ts,
 * wave 13p round E): one whose round was last written in the last 2 hours. It limits when the login's requests were
 * refused, until the reset the event gave for that, and when 100% or more of its seven days was used, until that window
 * resets. When both hold, the later reset counts. A refusal with no reset does not limit, because nothing says until
 * when. A stale, missing or unreadable reading never limits. `week` says which it was, with the reading's time and
 * round. The caller hands the reading in, so this never starts the slow first reading of the sandboxes.
 *
 * The run-to-login reader is private and only classifies receipts, not sandbox Claude runs. Until that reader exposes
 * which login a stopped run used, every Claude stop counts, including one whose sandbox field is absent.
 */
export function theModelsLimitedAt(nowMs: number, options: { officeZone?: string; week?: OwnEventReading | null; routerIsOn?: boolean } = {}): CastingLimits {
  const zone = options.officeZone ?? theClockZone()
  const routerIsOn = options.routerIsOn ?? theProviderRouterIsOn()
  const answer: CastingLimits = { limited: [], unreadableStops: [], week: "The sandboxes' login was not read for this answer, so it does not limit Claude." }
  const stops = sqlite.prepare(
    "SELECT id, data FROM records WHERE kind = 'session' AND deleted_at IS NULL " +
    "AND json_extract(data, '$.state') = 'crashed' AND json_extract(data, '$.closedHow') = 'provider-event' " +
    `AND ${STOP_CAUSE_KIND_IN_SQL} IN ('session-limit', 'quota') ORDER BY rowid DESC`,
  ).all() as { id: string; data: string }[]
  // A RUN STILL WAITING ON GO'S LIMIT (round 48). The launcher marks an OpenCode run while OpenCode retries on Go's
  // limit, and takes the mark off when the run goes on or its command ends. A mark that still counts limits Go until
  // its reset, as a Go stop does, and the newest of the stops and those marks counts. The query finds every mark.
  // Whether it still counts, by its run's state and its key, is `theMarkStillCounts`, so no state word is written here.
  const waits = sqlite.prepare(
    "SELECT id, data FROM records WHERE kind = 'session' AND deleted_at IS NULL " +
    `AND ${WAITS_ON_A_LIMIT_IN_SQL} ORDER BY rowid DESC`,
  ).all() as { id: string; data: string }[]
  type Cause = { kind: 'session-limit' | 'quota'; at: unknown; resetsAt?: unknown; resetFrom?: unknown }
  const newest = new Map<string, { run: string; runtime: string; model: string; limitName: string; atMs: number; waiting: boolean; cause: { kind: 'session-limit' | 'quota'; at: string; resetsAt: string | null; resetFrom: string | null } }>()
  for (const { row, waiting } of [...stops.map(row => ({ row, waiting: false })), ...waits.map(row => ({ row, waiting: true }))]) {
    const data = JSON.parse(row.data) as Record<string, unknown>
    if (typeof data['runtime'] !== 'string' || data['runtime'] === '' || typeof data['model'] !== 'string' || data['model'] === '') continue
    // The field, or the copy an older run kept in `extra` (stopped-run-cause.mjs). The query above found one of them, so
    // finding none here means the SQL and the reader disagree.
    const mark = waiting ? theWaitOnALimitOf(data) : null
    const cause = (waiting ? (mark === null ? null : { ...mark, kind: A_GO_LIMIT_IS, at: mark['seenAt'] }) : theStopCauseOf(data)) as Cause | null
    if (cause === null) throw new Error(`Run ${row.id} was found holding a ${waiting ? 'mark of waiting on a limit' : 'stop cause'}, but none could be read from it.`)
    if (mark !== null && !theMarkStillCounts(data['state'], mark, routerIsOn)) continue
    if (typeof cause.at !== 'string') continue
    const atMs = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(cause.at) ? momentOfStampInZone(cause.at, zone) : (parseAnyStamp(cause.at)?.getTime() ?? null)
    if (atMs === null || atMs < nowMs - THE_LAST_SEVEN_DAYS_MS || atMs > nowMs) continue
    const runtime = data['runtime']
    const model = castingModelName(data['model'])
    // Every OpenCode Go model shares one limit, so the newest Go stop on any of them is the one that counts.
    const limitName = castingLimitName(runtime, data['model'])
    const key = `${runtime}\0${limitName}`
    if ((newest.get(key)?.atMs ?? -Infinity) >= atMs) continue
    // Where the reset came from, as the launcher stored it for a Go stop or a run waiting on Go, so a skip reason tells a
    // named window from a guess. A stop cause that does not say gets nothing made up.
    const resetFrom = typeof cause.resetFrom === 'string' && cause.resetFrom !== '' ? cause.resetFrom : null
    newest.set(key, { run: row.id, runtime, model, limitName, atMs, waiting, cause: { kind: cause.kind, at: cause.at, resetsAt: typeof cause.resetsAt === 'string' && cause.resetsAt !== '' ? cause.resetsAt : null, resetFrom } })
  }
  for (const stop of newest.values()) {
    // The stop's kind is turned into its words before the template, so no stored word reaches the reason unread.
    const stopName = stop.cause.kind === 'session-limit' ? 'session limit' : 'quota'
    const itSays = `${stop.waiting ? 'is waiting on' : 'reports'} ${stopName}`
    const reset = parseCastingReset(stop.cause.resetsAt, stop.atMs, zone)
    if (reset === null) {
      answer.unreadableStops.push({ run: stop.run, runtime: stop.runtime, model: stop.model, kind: stop.cause.kind, at: stop.cause.at, resetsAt: stop.cause.resetsAt,
        says: `Run ${stop.run} ${itSays}, but its reset could not be read (${stop.cause.resetsAt ?? 'no reset words'}); it does not establish a limit.` })
    } else if (reset.until > nowMs) {
      answer.limited.push({ runtime: stop.runtime, model: stop.runtime === 'claude-code' ? null : stop.model, run: stop.run, kind: stop.cause.kind, at: stop.cause.at, until: reset.until, zone: reset.zone,
        says: `Run ${stop.run} ${itSays} until ${stampInZone(reset.until, reset.zone)} ${reset.zone}${reset.usedOfficeZone ? `, read in the office zone ${reset.zone}` : ''}${stop.cause.resetFrom === null ? '' : `, ${stop.cause.resetFrom}`}.${stop.limitName === stop.model ? '' : ` It covers every ${stop.limitName} model.`}` })
    }
  }
  const week = options.week
  if (week === null) {
    answer.week = "The sandboxes' login was not read: the office has not finished a reading of the sandboxes' rounds since it last started, so it does not limit Claude."
  } else if (week !== undefined) {
    const limit = theLimitOfTheSandboxesLogin(week, nowMs)
    answer.week = limit.says
    if (limit.until !== null && week.readAt !== null) {
      answer.limited.push({ runtime: 'claude-code', model: null, run: null, kind: 'week', at: week.readAt, until: limit.until, zone: week.zone, says: limit.says })
    }
  }
  return answer
}
/**
 * WHETHER A MARK OF WAITING ON GO'S LIMIT STILL LIMITS GO. It does not once its run has ended, as theRunHasEnded reads
 * the state. On a run that has not ended, it limits only when its key is the key a new run on the mark's own provider
 * would get now. With the router on and that provider routed, that is the-router. Otherwise it is OPENCODE_API_KEY or
 * opencode-login, and both count, because telling them apart needs the secrets. The key names are read from the
 * session kind's declared type of the mark's key, and are not copied here. Only the router's name is written here,
 * and it is checked against that type first.
 */
function theMarkStillCounts(state: unknown, mark: Record<string, unknown>, routerIsOn: boolean): boolean {
  if (theRunHasEnded(state)) return false
  const field = SHAPE_SPECS['WaitOnALimit']?.fields.find((one) => one.key === 'key')
  const declared = field === undefined ? null : declaredTypeOf(field)
  if (declared?.kind !== 'literals' || !declared.values.includes('the-router')) {
    throw new Error("The session kind does not declare the router's key name on a mark of waiting on a limit, so no key can be judged.")
  }
  const key = mark['key']
  const provider = mark['provider']
  // A mark with no key is judged by its run's state alone. So is a key name the session kind does not declare, which
  // only the unchecked copy in `extra` can hold, because nothing says which key it was.
  if (typeof key !== 'string' || !declared.values.includes(key)) return true
  // OpenCode names no provider on some retries, and then nothing says whether the run was routed.
  if (typeof provider !== 'string' || provider === '') return true
  const routed = routerIsOn && Object.hasOwn(THE_ROUTED_PROVIDERS, provider)
  return routed === (key === 'the-router')
}
/**
 * UNTIL WHEN THE SANDBOXES' LOGIN LIMITS CLAUDE, OR NULL WHEN IT DOES NOT, with the words that say why. Each sentence is
 * said from what the reading holds: its state, its time and round, its status and reset, and its seven days.
 */
export function theLimitOfTheSandboxesLogin(week: OwnEventReading, nowMs: number): { until: number | null; says: string } {
  if (week.state === 'none') return { until: null, says: "Nobody has read the use of the sandboxes' login, so it does not limit Claude." }
  // The two errors here name no state from the reading, so no stored word reaches their text unread. The second is
  // reached only by a current reading, because the other three states return first.
  if (week.round === null || week.readAt === null) throw new Error("The sandboxes' login was read, but its reading came with no round or no time.")
  const where = `round ${week.round.sandbox}/${week.round.folder}`
  const readAt = `${minute(week.readAt)}, ${week.zone} time`
  if (week.state === 'unreadable') {
    return { until: null, says: `The newest reading of the sandboxes' login, from ${where}, whose output was last written at ${readAt}, is in a shape the office does not know, so it does not limit Claude.` }
  }
  if (week.state === 'stale') return { until: null, says: `Not read since ${readAt}, in ${where}, so the sandboxes' login does not limit Claude.` }
  const moment = (stamp: string): number => {
    const ms = momentOfStampInZone(stamp, week.zone)
    if (ms === null) throw new RangeError(`The stamp "${stamp}" in the reading of the sandboxes' login could not be read in ${week.zone}.`)
    return ms
  }
  // EACH THING THE READING SAID, AND EACH RESET UNTIL WHICH IT LIMITS.
  const said: string[] = []
  const limits: { until: number; stamp: string }[] = []
  if (week.status === 'rejected') {
    if (week.resetsAt === null) said.push('Its requests were refused, and it gave no reset time, so nothing says until when.')
    else if (moment(week.resetsAt) > nowMs) {
      said.push(`Its requests were refused until ${minute(week.resetsAt)}.`)
      limits.push({ until: moment(week.resetsAt), stamp: week.resetsAt })
    } else said.push(`Its requests were refused, and that limit reset at ${minute(week.resetsAt)}, after the reading.`)
  } else if (week.status === 'allowed') said.push('Its requests were allowed.')
  else if (week.status === 'allowed_warning') said.push('Its requests were allowed, with a warning that a limit was near.')
  else throw new Error("A current reading of the sandboxes' login came with no status.")
  const seven = week.sevenDays
  if (seven === null) said.push('It gave no seven-day figure.')
  else {
    const until = moment(seven.resetsAt)
    const used = `${aUseInPercent(seven.used)}% of its seven days was used`
    if (until <= nowMs) said.push(`${used}, and that window reset at ${minute(seven.resetsAt)}, after the reading.`)
    else {
      said.push(`${used}, and that window resets at ${minute(seven.resetsAt)}.`)
      if (seven.used >= 1) limits.push({ until, stamp: seven.resetsAt })
    }
  }
  const reading = `Its reading from ${where}, whose output was last written at ${readAt}, said this. ${said.join(' ')}`
  const latest = limits.reduce<{ until: number; stamp: string } | null>((one, two) => (one === null || two.until > one.until ? two : one), null)
  if (latest === null) return { until: null, says: `The sandboxes' login does not limit Claude. ${reading}` }
  return { until: latest.until, says: `The sandboxes' login limits Claude until ${minute(latest.stamp)}, ${week.zone} time. ${reading}` }
}
