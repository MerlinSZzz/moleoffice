// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { GATES, gateNamed, gateValueIsAllowed } from '../../config/gates.mjs'
import { GATES_THE_SPOOL_WAITS_FOR } from '../../config/gate-count-spool.mjs'
import { countRefusedSettingValuesWith, gatePosition } from '../../config/settings.mjs'
import { localStamp } from '@shared/typed-time.mjs'
import { sqlite } from '../db/client.ts'
import { onlyChecking } from './only-checking.ts'

export type GateTally = {wouldStop: number; stopped: number; reminded: number; ignored: number; heeded: number}
export type GateCounts = {began: string; lastThirtyDays: GateTally; sinceCountingBegan: GateTally}

/**
 * Called only after a site's condition is met; a passing site never enters this file. `day` is today's, except for an
 * encounter the gate-count spool records, which is counted on the day it happened.
 */
export function gateMet(id: string, position: string = gatePosition(id)!, day: string = localStamp(new Date()).slice(0, 10)): string {
  const gate = gateNamed(id)
  if (!gateValueIsAllowed(gate, position)) throw new Error(`Gate "${id}" does not allow position "${position}".`)
  sqlite.prepare(`INSERT INTO gate_counts (gate, day, would_stop, stopped, reminded) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(gate, day) DO UPDATE SET would_stop = would_stop + 1, stopped = stopped + excluded.stopped, reminded = reminded + excluded.reminded`)
    .run(id, day, position === 'block' ? 1 : 0, position === 'remind' ? 1 : 0)
  return position
}

/**
 * A COUNT ASKED INSIDE A WRITE'S TRANSACTION IS MADE AFTER THAT TRANSACTION IS TAKEN BACK.
 *
 * A count written beside a refusal rolls back with the refused write, so the row a reader checks
 * afterwards is gone. A site inside a write hands its refusal here instead, with its own gateMet
 * call: while a transaction is open that call waits in this map, and `countARefusalItsWriteTookBack`
 * is called by the server's error handler after every transaction of the request has returned. A
 * check of a write stores nothing, so it counts nothing at all.
 *
 * The site names its gate in its own call, so the every-gate test finds it there. This file never
 * counts a gate it was handed by name.
 */
const howTheRefusalIsCounted = new WeakMap<Error, () => void>()

/** Give a refusal its count, now or once the write it was refused in is taken back. */
export function gateMetOnceTheWriteIsTakenBack<E extends Error>(refusal: E, count: () => void): E {
  if (onlyChecking()) return refusal
  if (sqlite.inTransaction) howTheRefusalIsCounted.set(refusal, count)
  else count()
  return refusal
}

/** Count a refusal whose write was taken back. The error handler calls this once per refusal. */
export function countARefusalItsWriteTookBack(error: Error): void {
  const count = howTheRefusalIsCounted.get(error)
  if (count === undefined) return
  howTheRefusalIsCounted.delete(error)
  count()
}

/**
 * A COUNT THE WRITE TOOK BACK, MADE AGAIN ONCE. A site that counts where it decides, rather than where it refuses, has
 * its count taken back with the write it then refuses (wave 13r round O). Hand that refusal here
 * with the site's own gateMet call. Inside a write the call waits, as above, and counts once the write is taken back.
 * Outside one the first count was kept, so nothing more is counted, and a check of a write counts nothing at all.
 */
export function gateMetAgainOnceTheWriteIsTakenBack<E extends Error>(refusal: E, count: () => void): E {
  if (!onlyChecking() && sqlite.inTransaction) howTheRefusalIsCounted.set(refusal, count)
  return refusal
}

/** Only a later judgement of named items can tell whether a reminder was heeded. */
export function gateLookedAgain(id: string, {ignored, heeded}: {ignored: number; heeded: number}): void {
  if (gateNamed(id).looksAgain === null) throw new Error(`Gate "${id}" has no later look.`)
  if (![ignored, heeded].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error(`Gate "${id}" needs whole ignored and heeded counts of zero or more.`)
  sqlite.prepare(`INSERT INTO gate_counts (gate, day, ignored, heeded) VALUES (?, ?, ?, ?)
    ON CONFLICT(gate, day) DO UPDATE SET ignored = ignored + excluded.ignored, heeded = heeded + excluded.heeded`)
    .run(id, localStamp(new Date()).slice(0, 10), ignored, heeded)
}

/**
 * EACH REFUSED SETTING VALUE IS COUNTED ONCE WHILE THE SERVER RUNS. Every page read reads the stored settings again, so
 * a count per refusal would count page views. The memory holds the setting's name and a hash of the value, never the
 * value. A value refused inside a write, or inside a check of one, is not counted then: the count could be taken back
 * with the write, and the error handler counts afterwards only a refusal of its own kind, which this is not. Nothing is
 * remembered either, so the value is counted the next time the server meets it outside a write.
 */
const settingValuesCounted = new Set<string>()

function countRefusedSettingValues(): void {
  countRefusedSettingValuesWith((which) => {
    if (sqlite.inTransaction || settingValuesCounted.has(which)) return
    gateMet('every-setting-value-is-known', 'block')
    settingValuesCounted.add(which)
  })
}

/**
 * A first zero row gives a zero its starting day; old gates keep their actual first day. A gate no site counts yet
 * (GATES_THE_SPOOL_WAITS_FOR) gets none, so it says it is not counted rather than showing a zero nobody measured, and
 * neither does a gate nothing counts (countedBy 'nobody'). Only the server's start calls this, so a refused setting
 * value is counted from here on, and never in a tool.
 */
export function gateCountsBegin(): {line: string} {
  countRefusedSettingValues()
  const waiting = new Set(GATES_THE_SPOOL_WAITS_FOR.map(row => row.gate))
  for (const gate of GATES) if (gate.countedBy === 'nobody') waiting.add(gate.id)
  return sqlite.transaction(() => {
    const begun = new Set((sqlite.prepare('SELECT DISTINCT gate FROM gate_counts').all() as {gate: string}[]).map(row => row.gate))
    const missing = GATES.filter(gate => !begun.has(gate.id) && !waiting.has(gate.id))
    if (missing.length === 0) return {line: 'No gate began counting today.'}
    const day = localStamp(new Date()).slice(0, 10)
    const insert = sqlite.prepare('INSERT INTO gate_counts (gate, day) VALUES (?, ?)')
    for (const gate of missing) insert.run(gate.id, day)
    return {line: `${missing.length} ${missing.length === 1 ? 'gate' : 'gates'} began counting today (${day}): ${missing.map(gate => gate.id).join(', ')}.`}
  })()
}

/** One grouped query reads the first day, the last thirty local days and the lifetime totals. */
export function gateCountsReading(): Map<string, GateCounts> {
  const now = new Date()
  const today = localStamp(now).slice(0, 10)
  now.setDate(now.getDate() - 29)
  const first = localStamp(now).slice(0, 10)
  const rows = sqlite.prepare(`SELECT gate, MIN(day) AS began,
    SUM(would_stop) AS wouldStop, SUM(stopped) AS stopped, SUM(reminded) AS reminded, SUM(ignored) AS ignored, SUM(heeded) AS heeded,
    SUM(CASE WHEN day BETWEEN @first AND @today THEN would_stop ELSE 0 END) AS recentWouldStop,
    SUM(CASE WHEN day BETWEEN @first AND @today THEN stopped ELSE 0 END) AS recentStopped,
    SUM(CASE WHEN day BETWEEN @first AND @today THEN reminded ELSE 0 END) AS recentReminded,
    SUM(CASE WHEN day BETWEEN @first AND @today THEN ignored ELSE 0 END) AS recentIgnored,
    SUM(CASE WHEN day BETWEEN @first AND @today THEN heeded ELSE 0 END) AS recentHeeded
    FROM gate_counts GROUP BY gate`).all({first, today}) as (GateTally & {gate: string; began: string; recentWouldStop: number; recentStopped: number; recentReminded: number; recentIgnored: number; recentHeeded: number})[]
  return new Map(rows.map(row => [row.gate, {began: row.began,
    lastThirtyDays: {wouldStop: row.recentWouldStop, stopped: row.recentStopped, reminded: row.recentReminded, ignored: row.recentIgnored, heeded: row.recentHeeded},
    sinceCountingBegan: {wouldStop: row.wouldStop, stopped: row.stopped, reminded: row.reminded, ignored: row.ignored, heeded: row.heeded},
  }]))
}

/** The outside count door answers with the row it just changed. */
export function gateCountsToday(id: string): {day: string; today: GateTally} {
  const day = localStamp(new Date()).slice(0, 10)
  const today = sqlite.prepare('SELECT would_stop AS wouldStop, stopped, reminded, ignored, heeded FROM gate_counts WHERE gate = ? AND day = ?').get(id, day) as GateTally | undefined
  if (today === undefined) throw new Error(`Gate "${id}" has no count for ${day}.`)
  return {day, today}
}
