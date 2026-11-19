// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theSandboxesLoginForTheRouter` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `THE_LAST_READ` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `theRoundsInTheSandboxes` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `drained` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `theOwnEventReading` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `THE_STATUS_SAYS` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `theRoundsReadInSteps` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `itIsAReadingRound` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `theLimitCalled` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `itRanClaude` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `theRateLimitLineReadInSteps` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `theSandboxesLogin` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `A_READ_FROM_THE_END` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `whatTheEventGave` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `THE_HIGHEST_USE_READ` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `THE_WORD_RATE_LIMIT_EVENT` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `THE_FURTHEST_RESET_READ_MS` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `AN_ESCAPE` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `anObject` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `theLastRateLimitLineAmong` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * `oneOf` was moved byte for byte out of src/server/lib/logins-week.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { SANDBOXES_FOLDER } from '../../config/sandbox-folder.mjs'
import { type OwnEventReading, A_READING_STAYS_CURRENT_MS, aUseInPercent, minute, type AWindowRead, type RateLimitStatus, type RateLimitType, THE_LOGINS, type ALogin, RATE_LIMIT_STATUSES, RATE_LIMIT_TYPES } from '@shared/logins-week.ts'
import type { AReadRound, AReadInstance, ASandboxRound, AWindowGiven, WhatARoundGave } from './logins-week.ts'
import { stampInZone, theClockZone } from '@shared/time.ts'
import { existsSync, readdirSync, readFileSync, statSync, closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE SANDBOXES' LOGIN FOR THE ROUTER, or null until the office has finished a reading of the sandboxes at `root` since it
 * started. A door that asks for a default casting does not start that first reading, which held the live server for
 * seconds in one piece; the tick's warm-up does it in slices. After it, this opens only what changed.
 */
export function theSandboxesLoginForTheRouter(nowMs: number, root: string = SANDBOXES_FOLDER): OwnEventReading | null {
  if (!THE_LAST_READ.has(root)) return null
  return theOwnEventReading(nowMs, theRoundsInTheSandboxes(root))
}
/** What the last read of each root found, kept between reads so a read opens only what changed since. */
export const THE_LAST_READ = new Map<string, { instances: Map<string, AReadInstance>; rounds: Map<string, AReadRound> }>()
/**
 * EVERY READING ROUND IN THE SANDBOXES' LOG FOLDERS, read from disk, with what its rate-limit event gave. A round is
 * `<root>/<instance>/logs/<run>/out` with the run's start.json beside it. A round whose start.json does not say it is a
 * reading round is passed over, and its `out` is never opened. A folder that cannot be read is passed over. So is an
 * `out` that cannot be read, which the next reading tries again.
 *
 * IT READS ONLY WHAT CHANGED SINCE ITS LAST READ OF THE SAME ROOT. The inbox, the agent page, the router and the
 * 60-second notice all call it, and reading every `out` each time took 230 ms cold and 36 ms warm over 2,282 files
 * (check Odu0fNRyn2da). So each `out` is stat'ed, and a round's start.json and a reading round's `out` are read again
 * only when that stamp or size changed. An instance's run folders are listed again only when its `logs` folder's stamp
 * changed. A round no longer on disk drops out.
 */
export function theRoundsInTheSandboxes(root: string = SANDBOXES_FOLDER): ASandboxRound[] {
  return drained(theRoundsReadInSteps(root))
}
/** Run a reading that stops at every step to its end, without giving the thread back. */
export function drained<T>(steps: Generator<void, T>): T {
  for (;;) {
    const step = steps.next()
    if (step.done === true) return step.value
  }
}
/**
 * THE SANDBOXES' LOGIN AT `nowMs`, FROM THE NEWEST EVENT AMONG `rounds`. Pure: the rounds are handed in. The newest is
 * the round last written among those that gave an event, readable or not. Two written in the same millisecond are told
 * apart by their sandbox and folder, and the one whose name sorts last is taken.
 *
 * Every sentence below is said from what the reading holds, so each is true of it:
 * - a reading of nobody says only that;
 * - an unreadable event names its round and its time, and no figure;
 * - a stale reading begins with when it was read, and keeps its figures after that;
 * - a window says its use and its reset, and says a reset that has passed as passed;
 * - a window that is not given is said to be not given;
 * - a newer reading round that gave no event is named.
 */
export function theOwnEventReading(nowMs: number, rounds: readonly ASandboxRound[]): OwnEventReading {
  const login = theSandboxesLogin()
  const zone = theClockZone()
  const at = (ms: number): string => stampInZone(ms, zone)
  const nameOf = (round: ASandboxRound): string => `${round.sandbox}/${round.folder}`
  const later = (a: ASandboxRound, b: ASandboxRound | null): boolean => b === null || a.atMs > b.atMs || (a.atMs === b.atMs && nameOf(a) > nameOf(b))
  let newest: ASandboxRound | null = null
  let newestWithNoEvent: ASandboxRound | null = null
  for (const round of rounds) {
    if (round.gave.event === 'none') {
      if (later(round, newestWithNoEvent)) newestWithNoEvent = round
    } else if (later(round, newest)) newest = round
  }
  const nobody: OwnEventReading = {
    readFrom: 'own-event', login: login.login, name: login.name, state: 'none', readAt: null, zone, round: null,
    status: null, windowType: null, resetsAt: null, sevenDays: null, fiveHours: null, newerRoundWithNoEvent: null,
    says: "Nobody has read this login's use.",
  }
  if (newest === null) return nobody
  const readAt = at(newest.atMs)
  const round = { sandbox: newest.sandbox, folder: newest.folder }
  const newer = newestWithNoEvent !== null && newestWithNoEvent.atMs > newest.atMs ? newestWithNoEvent : null
  const newerRoundWithNoEvent = newer === null ? null : { sandbox: newer.sandbox, folder: newer.folder, at: at(newer.atMs) }
  const saysNewer = newer === null ? '' : ` A newer reading round, ${nameOf(newer)}, whose output was last written at ${minute(at(newer.atMs))}, gave no rate-limit event.`
  const gave = newest.gave
  if (gave.event === 'none') throw new Error(`Round ${nameOf(newest)} gave no rate-limit event, and was taken as the newest that gave one.`)
  if (gave.event === 'unreadable') {
    return {
      ...nobody, state: 'unreadable', readAt, round, newerRoundWithNoEvent,
      says:
        `The newest reading of the sandboxes' login that the office found, from round ${nameOf(newest)}, whose output was last written at ${minute(readAt)}, ${zone} time, ` +
        `has its rate-limit event in a shape the office does not know. So no figure is shown, and no older reading is used in its place.${saysNewer}`,
    }
  }
  const state = nowMs - newest.atMs <= A_READING_STAYS_CURRENT_MS ? 'current' : 'stale'
  const window = (one: AWindowGiven | null): AWindowRead | null => (one === null ? null : { used: one.used, resetsAt: at(one.resetsAtMs), from: one.from })
  const saysWindow = (label: string, one: AWindowGiven | null): string =>
    one === null
      ? `${label}: not given in this reading.`
      : `${label}${one.from === 'top level' ? ', from the limit the event named' : ''}: ${aUseInPercent(one.used)}% used, ` +
        `${one.resetsAtMs > nowMs ? `resets at ${minute(at(one.resetsAtMs))}` : `but that window reset at ${minute(at(one.resetsAtMs))}, after the reading`}.`
  // THE LIMIT THE EVENT NAMED, unless a window above was taken from it and has said it already.
  const fromTheTopLevel = gave.sevenDays?.from === 'top level' || gave.fiveHours?.from === 'top level'
  const reset = gave.resetsAtMs
  const saysNamed = fromTheTopLevel
    ? ''
    : gave.windowType === null
      ? reset === null
        ? ' It named no limit and gave no reset time.'
        : ` It named no limit, and gave the reset time ${minute(at(reset))}${reset > nowMs ? '' : ', which was after the reading and has passed'}.`
      : reset === null
        ? ` The limit it named was ${theLimitCalled(gave.windowType)}, and it gave no reset time for it.`
        : ` The limit it named was ${theLimitCalled(gave.windowType)}, which ${reset > nowMs ? `resets at ${minute(at(reset))}` : `reset at ${minute(at(reset))}, after the reading`}.`
  const head =
    state === 'current'
      ? `The newest reading of the sandboxes' login that the office found is from round ${nameOf(newest)}, whose output was last written at ${minute(readAt)}, ${zone} time.`
      : `Not read since ${minute(readAt)}, ${zone} time, which is more than ${String(A_READING_STAYS_CURRENT_MS / 3_600_000)} hours ago. ` +
        `The newest reading of the sandboxes' login that the office found is from round ${nameOf(newest)}.`
  return {
    readFrom: 'own-event',
    login: login.login,
    name: login.name,
    state,
    readAt,
    zone,
    round,
    status: gave.status,
    windowType: gave.windowType,
    resetsAt: reset === null ? null : at(reset),
    sevenDays: window(gave.sevenDays),
    fiveHours: window(gave.fiveHours),
    newerRoundWithNoEvent,
    says: `${head} ${THE_STATUS_SAYS[gave.status]} ${saysWindow('Seven days', gave.sevenDays)} ${saysWindow('Five hours', gave.fiveHours)}${saysNamed}${saysNewer}`,
  }
}
/** What each status says of the login's requests. */
export const THE_STATUS_SAYS: Record<RateLimitStatus, string> = {
  allowed: 'Its requests were allowed.',
  allowed_warning: 'Its requests were allowed, with a warning that a limit was near.',
  rejected: 'Its requests were refused at a limit.',
}
/**
 * THE READING ITSELF, stopping after each round it reads and each 64 KB of an `out`. What it found is kept when it ends,
 * unless a reading of the same root ended while it was stopped.
 */
export function* theRoundsReadInSteps(root: string): Generator<void, ASandboxRound[]> {
  const last = THE_LAST_READ.get(root)
  const before = last ?? { instances: new Map<string, AReadInstance>(), rounds: new Map<string, AReadRound>() }
  const now = { instances: new Map<string, AReadInstance>(), rounds: new Map<string, AReadRound>() }
  const keep = (): void => {
    if (THE_LAST_READ.get(root) === last) THE_LAST_READ.set(root, now)
  }
  if (!existsSync(root)) {
    keep()
    return []
  }
  const list = (dir: string): string[] => {
    try {
      return readdirSync(dir)
    } catch {
      return []
    }
  }
  for (const instance of list(root)) {
    const logs = join(root, instance, 'logs')
    let logsMs: number
    try {
      logsMs = statSync(logs).mtimeMs
    } catch {
      continue
    }
    const known = before.instances.get(logs)
    const runs = known !== undefined && known.logsMs === logsMs ? known.runs : list(logs)
    now.instances.set(logs, { logsMs, runs })
    for (const run of runs) {
      const out = join(logs, run, 'out')
      let atMs: number
      let size: number
      try {
        const stat = statSync(out)
        atMs = stat.mtimeMs
        size = stat.size
      } catch {
        continue
      }
      const kept = before.rounds.get(out)
      if (kept !== undefined && kept.atMs === atMs && kept.size === size) {
        now.rounds.set(out, kept)
        continue
      }
      let reading = false
      try {
        reading = itIsAReadingRound((JSON.parse(readFileSync(join(logs, run, 'start.json'), 'utf8')) as { command?: unknown }).command)
      } catch {
        // NO READABLE start.json: nothing says the round ran Claude Code with stream-json, so it is not a reading round.
      }
      if (!reading) {
        now.rounds.set(out, { atMs, size, round: null })
        yield
        continue
      }
      let line: string | null
      try {
        line = yield* theRateLimitLineReadInSteps(out)
      } catch {
        // AN `out` THAT COULD NOT BE READ, or that changed while it was read, is left out and not kept, so the next
        // reading opens it again.
        yield
        continue
      }
      now.rounds.set(out, { atMs, size, round: { sandbox: instance, folder: run, atMs, gave: line === null ? { event: 'none' } : whatTheEventGave(line, atMs) } })
      yield
    }
  }
  keep()
  return [...now.rounds.values()].flatMap((one) => (one.round === null ? [] : [one.round]))
}
/**
 * Whether a round is a reading round: its command ran Claude Code and names `stream-json`, the output that carries the
 * rate-limit event. Any other round writes no such event, so its `out` is never opened.
 */
export function itIsAReadingRound(command: unknown): boolean {
  if (!itRanClaude(command)) return false
  return /(^|[\s=])stream-json(\s|$)/.test((command as unknown[]).filter((word) => typeof word === 'string').join(' '))
}
/** The plain name of a limit an event names. */
export function theLimitCalled(type: RateLimitType): string {
  if (type === 'five_hour') return 'the five-hour window'
  if (type === 'seven_day') return 'the seven-day window'
  return `the limit Claude Code calls ${type}`
}
/** Whether a round's command ran Claude Code: the program `claude`, alone or as a word inside `sh -c`. */
export function itRanClaude(command: unknown): boolean {
  if (!Array.isArray(command)) return false
  return /(^|[\s/])claude(\s|$)/.test(command.filter((word) => typeof word === 'string').join(' '))
}
/**
 * THE SAME READING, STOPPING AFTER EACH 64 KB READ, so the first reading after a start can give the thread back between
 * two reads (`warmTheRoundsInTheSandboxes`). `theRateLimitLineInTheFile` runs it without a stop.
 */
export function* theRateLimitLineReadInSteps(path: string): Generator<void, string | null> {
  const fd = openSync(path, 'r')
  try {
    let position = fstatSync(fd).size
    // THE PIECES, IN FILE ORDER, OF THE LINE WHOSE START HAS NOT YET BEEN READ. Kept apart and joined once, so a very long
    // line is not copied again at every read.
    let unfinished: Buffer[] = []
    while (position > 0) {
      const length = Math.min(A_READ_FROM_THE_END, position)
      position -= length
      const chunk = Buffer.alloc(length)
      const got = readSync(fd, chunk, 0, length, position)
      if (got !== length) throw new Error(`${path} gave ${String(got)} bytes where ${String(length)} were expected; it changed while it was read.`)
      const firstNewline = position === 0 ? -1 : chunk.indexOf(0x0a)
      if (position > 0 && firstNewline === -1) {
        unfinished.unshift(chunk)
        yield
        continue
      }
      const stretch = Buffer.concat([chunk.subarray(firstNewline + 1), ...unfinished])
      if (stretch.includes(THE_WORD_RATE_LIMIT_EVENT) || stretch.includes(AN_ESCAPE)) {
        const found = theLastRateLimitLineAmong(stretch.toString('utf8').split('\n'))
        if (found !== null) return found
      }
      unfinished = [chunk.subarray(0, Math.max(firstNewline, 0))]
      yield
    }
    return null
  } finally {
    closeSync(fd)
  }
}
/** The login read from its own rate-limit event, as src/shared/logins-week.ts declares it. */
export function theSandboxesLogin(): ALogin {
  const login = THE_LOGINS.find((one) => one.login === 'sandboxes-claude')
  if (login === undefined) throw new Error('src/shared/logins-week.ts declares no sandboxes-claude login.')
  return login
}
/** How much of a file `theRateLimitLineInTheFile` reads at a time, from its end. */
export const A_READ_FROM_THE_END = 65_536
/**
 * WHAT ONE RATE-LIMIT LINE GAVE, for a round whose `out` was last written at `readAtMs`. It is unreadable when:
 * - its `status` is missing or is not one of RATE_LIMIT_STATUSES;
 * - a `resetsAt`, `utilization` or `rateLimitType` that is there has the wrong type, or the last is not one of
 *   RATE_LIMIT_TYPES;
 * - a `unifiedWindows` that is there is not an object, or its `five_hour` or `seven_day` lacks a number `utilization` or
 *   a whole-second `resetsAt`;
 * - a use it gives is below 0 or above THE_HIGHEST_USE_READ;
 * - or a reset it gives is at or before the reading, or more than THE_FURTHEST_RESET_READ_MS after it.
 * A value of null is there, and of the wrong type. The top-level `utilization` gives a use only when it fills a window.
 *
 * Each window is taken from `unifiedWindows`. When that does not give it, it is taken from the top level only when
 * `rateLimitType` names that window and the top level gives both its use and its reset. Otherwise it is not given.
 * Nothing else in the line is kept.
 */
export function whatTheEventGave(line: string, readAtMs: number): WhatARoundGave {
  const unreadable: WhatARoundGave = { event: 'unreadable' }
  const info = (JSON.parse(line) as Record<string, unknown>)['rate_limit_info']
  if (!anObject(info)) return unreadable
  const there = (key: string): boolean => Object.hasOwn(info, key)
  const aUse = (value: unknown): number | null => (typeof value === 'number' && value >= 0 && value <= THE_HIGHEST_USE_READ ? value : null)
  const aReset = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value * 1000 > readAtMs && value * 1000 <= readAtMs + THE_FURTHEST_RESET_READ_MS ? value * 1000 : null
  const status = oneOf(RATE_LIMIT_STATUSES, info['status'])
  if (status === null) return unreadable
  const windowType = there('rateLimitType') ? oneOf(RATE_LIMIT_TYPES, info['rateLimitType']) : null
  if (there('rateLimitType') && windowType === null) return unreadable
  const resetsAtMs = there('resetsAt') ? aReset(info['resetsAt']) : null
  if (there('resetsAt') && resetsAtMs === null) return unreadable
  const utilization = info['utilization']
  if (there('utilization') && (typeof utilization !== 'number' || !Number.isFinite(utilization))) return unreadable
  const windows = info['unifiedWindows']
  if (there('unifiedWindows') && !anObject(windows)) return unreadable
  /** One window from its own place or the top level, null when neither gives it, or `unreadable`. */
  const theWindow = (key: 'five_hour' | 'seven_day'): AWindowGiven | null | 'unreadable' => {
    if (anObject(windows) && Object.hasOwn(windows, key)) {
      const one = windows[key]
      if (!anObject(one)) return 'unreadable'
      const used = aUse(one['utilization'])
      const resets = aReset(one['resetsAt'])
      return used === null || resets === null ? 'unreadable' : { used, resetsAtMs: resets, from: 'unifiedWindows' }
    }
    if (windowType !== key || !there('utilization') || resetsAtMs === null) return null
    const used = aUse(utilization)
    return used === null ? 'unreadable' : { used, resetsAtMs, from: 'top level' }
  }
  const sevenDays = theWindow('seven_day')
  const fiveHours = theWindow('five_hour')
  if (sevenDays === 'unreadable' || fiveHours === 'unreadable') return unreadable
  return { event: 'read', status, windowType, resetsAtMs, sevenDays, fiveHours }
}
/**
 * THE HIGHEST USE OF A WINDOW THE OFFICE READS: 2, twice the window. A use a little past the whole is read and shown as
 * it is, so 1.03 is 103%. A use above this, or below 0, is a shape the office does not know.
 */
export const THE_HIGHEST_USE_READ = 2
/** The bytes without which no line can be a rate-limit event: its type's value as a plain JSON string, or a `\u` escape. */
export const THE_WORD_RATE_LIMIT_EVENT = Buffer.from('"rate_limit_event"')
/** THE FURTHEST A RESET IS READ AFTER ITS READING: 8 days, a day more than the longest window the event gives. */
export const THE_FURTHEST_RESET_READ_MS = 8 * 24 * 60 * 60 * 1000
export const AN_ESCAPE = Buffer.from('\\u')
/** Whether a value is a JSON object, and not an array or null. */
export function anObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/** The last of these lines that is a JSON object of type `rate_limit_event`, trimmed, or null. The one rule of what that line is. */
export function theLastRateLimitLineAmong(lines: readonly string[]): string | null {
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const line = (lines[at] ?? '').trim()
    if (!line.startsWith('{')) continue
    let said: unknown
    try {
      said = JSON.parse(line)
    } catch {
      // NOT JSON; the event is a whole line of it, so keep looking above.
      continue
    }
    if (typeof said === 'object' && said !== null && (said as Record<string, unknown>)['type'] === 'rate_limit_event') return line
  }
  return null
}
/** The word, when it is one of `words`, or null. */
export function oneOf<T extends string>(words: readonly T[], value: unknown): T | null {
  return words.find((one) => one === value) ?? null
}
