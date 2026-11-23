// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH PACKAGE'S TIME FROM TAKEN TO LIVE: the third of the four figures (src/shared/figures.ts). For each inside package
 * first taken inside the span, four stages, each a time where the records hold it and the words for why where they do not:
 *
 *   taken        the first take inside, which is what puts the package in the span;
 *   handed back  the latest hand-back;
 *   on main      the landing on main of the run that latest hand-back names, from the merge queue's landings;
 *   live         the first completed upgrade of the live office that ran main as that landing, or a later one, left it
 *                (`theFirstUpgradeThatRanIt`), from the upgrade notices.
 *
 * A stage after one that is not recorded is not recorded either, and says which. The median of each stretch is over the
 * packages that hold both of its moments, and says how many those are. A stamp that names no one moment on the office's
 * clock, such as one in the hour the clocks go back, is shown but not measured.
 */
import { sql } from 'drizzle-orm'

import {
  TIME_TO_LIVE_STRETCHES, minutesBetween, theFirstUpgradeThatRanIt, theMedianMinutes,
  type PackageTimeToLive, type StageTime, type TimeToLive, type TimeToLiveStage,
} from '@shared/figures.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { momentOfAnInstant, stampInZone, uniqueMomentOfStoredStampInZone } from '@shared/time.ts'
import { records } from '../db/schema.ts'
import { thePackagesCounted } from './delegation.ts'
import type { TheSpan } from './figures-span.ts'
import { landingsSince } from './landed-since.ts'
import { PanelError } from './panel-error.ts'
import { stableUpgradeHistory } from './stable-upgrade-notices.ts'

/** How many landings one read of the merge queue's landings asks for. */
const LANDINGS_A_PAGE = 100

/** One landing on main, by its moment. */
interface ALanding { ms: number; mainAfter: string | null }

/** One completed upgrade of the live office, by the moment it ended. */
interface AnUpgrade { ms: number; toCommit: string; at: string }

const at = (stamp: string): StageTime => ({ at: stamp, notRecorded: null })
const notRecorded = (words: string): StageTime => ({ at: null, notRecorded: words })

/** The landings of one project: every one in order, and the first of each run asked for. */
interface TheLandings { all: ALanding[]; ofRun: Map<string, ALanding> }

/** Every landing of one project from `sinceMs` on, oldest first, and the first landing of each run asked for. */
function theLandingsFrom(workspaceId: string, sinceMs: number, zone: string, runs: ReadonlySet<string>): TheLandings {
  const all: ALanding[] = []
  const ofRun = new Map<string, ALanding>()
  const since = { sinceInstant: new Date(sinceMs).toISOString(), sinceLocal: stampInZone(sinceMs, zone), limit: LANDINGS_A_PAGE }
  let after: { afterInstant: string; afterId: string } | null = null
  for (;;) {
    const page = landingsSince(workspaceId, after === null ? since : { ...since, ...after })
    for (const landing of page.landings) {
      const ms = momentOfAnInstant(landing.landedInstant)
      if (ms === null) continue
      const one = { ms, mainAfter: landing.mainAfter }
      all.push(one)
      if (landing.run !== null && runs.has(landing.run) && !ofRun.has(landing.run)) ofRun.set(landing.run, one)
    }
    if (page.next === null) break
    after = { afterInstant: page.next.at, afterId: page.next.id }
  }
  return { all, ofRun }
}

/** Every completed upgrade of one project's live office that ended at or after `sinceMs`, or the words for why they cannot be read. */
function theUpgradesFrom(workspaceId: string, sinceMs: number, zone: string): AnUpgrade[] | string {
  const upgrades: AnUpgrade[] = []
  try {
    let older: string | undefined
    for (;;) {
      const page = stableUpgradeHistory(workspaceId, undefined, older)
      let reachedSince = false
      for (const row of page.entries) {
        const began = uniqueMomentOfStoredStampInZone(row.date, zone)
        if (row.outcomeDate !== null && (row.outcome === 'completed' || row.outcome === 'handed-off')) {
          const ended = uniqueMomentOfStoredStampInZone(row.outcomeDate, zone)
          if (ended !== null && ended >= sinceMs) upgrades.push({ ms: ended, toCommit: row.toCommit, at: row.outcomeDate })
        }
        if (began !== null && began < sinceMs) reachedSince = true
      }
      if (reachedSince || page.older === null) break
      older = page.older
    }
  } catch (error) {
    if (!(error instanceof PanelError && error.code === 'upgradeHistoryReadRefused')) throw error
    return sayInEnglish('figures.live.upgradesUnread', { why: error.message })
  }
  return upgrades
}

export function timeToLive(projects: readonly string[], span: TheSpan): TimeToLive {
  const zone = span.timeZone
  const packages: PackageTimeToLive[] = []
  const minutes = TIME_TO_LIVE_STRETCHES.map(() => [] as number[])
  for (const workspaceId of projects) {
    const firstTake = sql`json_extract(${records.data}, '$.package.takenInside[0].at')`
    const read = thePackagesCounted(workspaceId, sql`${firstTake} >= ${span.from} and ${firstTake} < ${span.until}`)
    const taken = read.packages.flatMap((counted) => {
      const take = counted.inside?.takenInside?.[0]
      return counted.inside === null || take === undefined ? [] : [{ counted, take, handBack: counted.inside.handedBack?.at(-1) ?? null }]
    })
    const runs = new Set(taken.flatMap(({ handBack }) => (handBack?.run === undefined ? [] : [handBack.run])))
    const handBackMoments = taken.flatMap(({ handBack }) => {
      const ms = handBack === null ? null : uniqueMomentOfStoredStampInZone(handBack.at, zone)
      return ms === null ? [] : [ms]
    })
    const landings: TheLandings = runs.size === 0 || handBackMoments.length === 0
      ? { all: [], ofRun: new Map() }
      : theLandingsFrom(workspaceId, Math.min(...handBackMoments), zone, runs)
    const landed = [...landings.ofRun.values()]
    const upgrades: AnUpgrade[] | string = landed.length === 0 ? [] : theUpgradesFrom(workspaceId, Math.min(...landed.map((one) => one.ms)), zone)

    for (const { counted, take, handBack } of taken) {
      const moments: Record<TimeToLiveStage, number | null> = { taken: uniqueMomentOfStoredStampInZone(take.at, zone), handedBack: null, onMain: null, live: null }
      let handedBack: StageTime, onMain: StageTime, live: StageTime
      if (handBack === null) {
        handedBack = onMain = live = notRecorded(sayInEnglish('figures.live.noHandBack'))
      } else {
        handedBack = at(handBack.at)
        moments.handedBack = uniqueMomentOfStoredStampInZone(handBack.at, zone)
        const landing = handBack.run === undefined ? undefined : landings.ofRun.get(handBack.run)
        if (landing === undefined) {
          onMain = notRecorded(handBack.run === undefined ? sayInEnglish('figures.live.handBackNamesNoRun') : sayInEnglish('figures.live.noLanding', { run: handBack.run }))
          live = notRecorded(sayInEnglish('figures.live.notOnMain'))
        } else {
          onMain = at(stampInZone(landing.ms, zone))
          moments.onMain = landing.ms
          const upgrade = typeof upgrades === 'string' ? null : theFirstUpgradeThatRanIt(landing, landings.all, upgrades)
          if (upgrade === null) live = notRecorded(typeof upgrades === 'string' ? upgrades : sayInEnglish('figures.live.noUpgrade'))
          else {
            live = at(upgrade.at)
            moments.live = upgrade.ms
          }
        }
      }
      TIME_TO_LIVE_STRETCHES.forEach(([from, to], index) => {
        const start = moments[from]
        const end = moments[to]
        if (start !== null && end !== null && end >= start) minutes[index]!.push(minutesBetween(start, end))
      })
      packages.push({ workspaceId, recordId: counted.recordId, title: counted.title, taken: take.at, handedBack, onMain, live })
    }
  }
  packages.sort((a, b) => a.taken.localeCompare(b.taken) || a.recordId.localeCompare(b.recordId))
  return {
    projects: [...projects],
    from: span.from,
    to: span.to,
    timeZone: zone,
    packages,
    medians: TIME_TO_LIVE_STRETCHES.map(([from, to], index) => ({ from, to, minutes: theMedianMinutes(minutes[index]!), over: minutes[index]!.length })),
    says: sayInEnglish('figures.live.says'),
  }
}
