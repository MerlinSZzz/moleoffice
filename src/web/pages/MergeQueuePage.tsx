// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE PAGE, OPTION A (wave 13p round 30).
 *
 * One card per lane, its entries numbered in the order they will land, each with its state in plain words, why it
 * waits, and how long it has waited. Above the lanes, one quiet line says how fast the queue moved in the last 24 hours.
 *
 * ONE READING. Everything here comes from GET /api/merge-queue: the lanes, and beside them `speed` and `page`, which the
 * server works out (src/server/lib/merge-queue-page.ts). This page counts nothing and orders nothing itself.
 *
 * THE PRESS THAT MOVES AN ENTRY TO THE FRONT is drawn to the person only, by the one test the other person-only presses
 * use (`getActor().type === 'human'`). The door is wave 13t's POST /api/merge-queue/<id>/first. Its answer and its
 * refusals are drawn in the door's own words. Who moved an entry, and why, is the entry's own `movedFirst`. Agents who may also press it (the queue's owner, a raised secretary) are not offered it here. It is
 * drawn only on the rows the server says it would move (`movable`): not on the first, a holder, a rider or a moved one.
 *
 * NAMES, NOT IDS, IN SENTENCES (wave 13p round 31). A sentence names an entry by its wave and
 * the title of its work, as the server made it (`names`); the id is drawn only small, beside a row's title or a seat.
 * A moment of today is drawn as its hour and minute, and another day's with its day.
 *
 * A RESOLVING ENTRY (tier 2 of the agreed plan for merge conflicts, and the secretary's answers) has left its
 * lane and waits on its own supervisor for the time set for resolving a conflict on the Gates panel. The server's
 * landing order puts it last in its lane. Its row says that time's end, and what became of the brief and of a
 * resolution handed over (`whileItResolves`). No status number is drawn here: the entry page holds the
 * status, the brief's path, the agent asked and the stored sentences.
 *
 * AN EMERGENCY PUSH TO MAIN (wave 13u round 82, item 16) is drawn in its lane's history, under the lane's entries: its
 * state, who pushed it, the commit, and then whether it went on and what its follow-up run on main said. A lane with
 * pushes and no entry left gets a card of its own. The push's record holds the rest.
 */

import type { EmergencyPushReading, EmergencyPushState } from '@shared/emergency-push.ts'
import { redMergeAuthorizesLanding } from '@shared/merge-class.ts'
import { clausesJoined, content, sayInEnglish, t, type WordKey } from '@shared/i18n.ts'
import { ridesTheBus, submittedByTheOffice, type EntryName, type LaneBus, type MergeQueueReply, type QueueEntryRow, type QueueSpeed } from '@shared/merge-queue-page.ts'
import { theEndOfResolving, theTimeLeftToResolve } from '@shared/merge-queue.ts'
import type { Resolution, Resolving, UnreadableEntry } from '@shared/merge-queue.ts'
import { surfaceWord } from '@shared/surfaces.ts'
import { localStamp, momentOfAnInstant } from '@shared/time.ts'
import { useState } from 'react'
import { api, errorMessage, faultOf, getActor } from '../api.ts'
import { recordPath } from '../components/router.tsx'
import { Absence, Btn, ErrorNote, Explain, Loading, Panel, TextArea } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { howThePushEnded, PUSH_CSS, PushLines, shortTime, theFollowUpOf, WhoPushed, type PushLine } from '../components/MergeQueuePush.tsx'
import { itWaitsForAFixRound, TheFixRoundWait, theFixRoundWait } from '../components/MergeQueueFixRound.tsx'
import { MEASURES_CSS, MergeQueueMeasures } from '../components/MergeQueueMeasures.tsx'
import { ON_THE_QUEUE_PAGE_CSS, TheQueueIsHeld } from '../components/MergeQueueAtTheSeal.tsx'
import { useLanguage } from '../lib/language.ts'
import { howLong } from './WorkingPage.tsx'

/** The states the page asks for: every state an entry is still on its way in, a resolving one too. */
export const LIVE_STATES = ['submitted', 'pinned', 'judged', 'integrating', 'reinspecting', 'testing', 'landing', 'resolving'] as const

export function MergeQueuePage() {
  useLanguage()
  const [state, reload] = useProjectAsync(() => api.mergeQueue(LIVE_STATES), [])
  return (
    <div className="page mq">
      <style href="mole-office-merge-queue" precedence="default">
        {MERGE_QUEUE_CSS}
      </style>
      <nav className="mq-crumbs" aria-label={t('mergeQueuePage.crumbs')}>
        <a href="#/">{t('mergeQueuePage.office')}</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{t('mergeQueuePage.nav')}</span>
      </nav>
      <header className="mq-head">
        {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
        <h1 className="mq-title" data-title-is="its-label">{t('mergeQueuePage.nav')}</h1>
        {/* WHAT THE PAGE IS STAYS IN SIGHT, AND WHAT A LANE AND A BUS ARE IS ONE PRESS DOWN. */}
        <Explain declares={{ surface: null }} meaning={t('w13q.mergeQueue.meaning')} opens={t('w13q.mergeQueue.termsOpen')}>
          <p className="mq-intro">{t('mergeQueuePage.intro')}</p>
        </Explain>
      </header>
      {state.status === 'loading' ? <Loading label={t('mergeQueuePage.loading')} rows={3} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
      {state.status === 'ready' ? <TheMergeQueue reply={state.value} now={new Date()} onMoved={reload} /> : null}
    </div>
  )
}

/** The page drawn from one reply. Exported so a test can render it with no server. */
export function TheMergeQueue({ reply, now, onMoved }: { reply: MergeQueueReply; now: Date; onMoved?: () => void }) {
  const lanes = reply.lanes.filter((one) => one.entries.length > 0)
  if (!Array.isArray(reply.emergencyPushes)) throw new Error('GET /api/merge-queue sent no answer for the emergency pushes.')
  const pushesOf = (lane: string): EmergencyPushReading[] => reply.emergencyPushes.filter((one) => one.root === lane)
  const pushedOnly = [...new Set(reply.emergencyPushes.map((one) => one.root))].filter((root) => !lanes.some((one) => one.lane === root))
  const unreadable = reply.unreadable ?? []
  return (
    <div className="mq-body">
      {/* THE HOLD, FIRST, while the queue is held (wave 13u round 93): what it stops, and who held it, when and why. */}
      <TheQueueIsHeld held={reply.held} now={now} />
      <p className="mq-speed" data-speed="last-24-hours">
        {speedLine(reply.speed)}
      </p>
      {speedLeftOut(reply.speed).map((line) => (
        <p key={line} className="mq-speed mq-speed-out">
          {line}
        </p>
      ))}
      {/* THE ENTRIES THE QUEUE CANNOT READ, BEFORE THE LANES (wave 13u round 99), because the lanes leave them out. */}
      <TheEntriesTheQueueCannotRead entries={unreadable} />
      {lanes.length === 0 && pushedOnly.length === 0 ? (
        // AN ENTRY THE QUEUE CANNOT READ MAY BE ON ITS WAY, so the page does not say that nothing is.
        <Absence looked tier="told-apart" title={t('mergeQueuePage.nav')} word={t(unreadable.length === 0 ? 'mergeQueuePage.none' : 'mergeQueuePage.noneReadable')} />
      ) : (
        lanes.map((lane) => {
          const page = reply.page.lanes.find((one) => one.lane === lane.lane)
          if (page === undefined) throw new Error(`GET /api/merge-queue sent the lane ${lane.lane} with no landing order for it.`)
          const byId = new Map(lane.entries.map((one) => [one.id, one]))
          const rows = page.order.map((id) => {
            const row = byId.get(id)
            if (row === undefined) throw new Error(`The landing order of ${lane.lane} names ${id}, which the reply does not hold.`)
            return row
          })
          return (
            <OneLane
              key={lane.lane}
              lane={lane.lane}
              holder={lane.occupiedBy}
              workspaceId={reply.workspaceId}
              bus={page.bus}
              rows={rows}
              movable={page.movable}
              submitters={reply.page.submitters}
              movers={reply.page.movers}
              pressers={reply.page.pressers}
              names={reply.page.names}
              now={now}
              pushes={pushesOf(lane.lane)}
              {...(onMoved === undefined ? {} : { onMoved })}
            />
          )
        })
      )}
      {pushedOnly.map((root) => (
        // A LANE WITH PUSHES AND NO ENTRY: the reply lists a lane only for its entries, so it says nothing of who holds
        // this one, and no holder line is drawn.
        <OneLane
          key={root}
          lane={root}
          holder={undefined}
          workspaceId={reply.workspaceId}
          bus={null}
          rows={[]}
          movable={[]}
          submitters={reply.page.submitters}
          movers={reply.page.movers}
          pressers={reply.page.pressers}
          names={reply.page.names}
          now={now}
          pushes={pushesOf(root)}
        />
      ))}
      {/* THE LAST DAYS, MEASURED: read on their own door, after the live lanes. */}
      <MergeQueueMeasures />
    </div>
  )
}

/**
 * EACH ENTRY THE QUEUE CANNOT READ: its title, its id and the queue's reason, which is the office's own sentence and is
 * shown as it was sent. Nothing is drawn while there are none.
 */
function TheEntriesTheQueueCannotRead({ entries }: { entries: readonly UnreadableEntry[] }) {
  if (entries.length === 0) return null
  return (
    <Panel titleIs="label" declares={{ surface: 'mergequeue.unreadable' }} title={surfaceWord('mergequeue.unreadable')}>
      <p className="mq-why">{t('mergeQueuePage.unreadable.says')}</p>
      <ul className="mq-unreadable">
        {entries.map((one) => (
          <li key={one.id} className="mq-unreadable-row" data-unreadable={one.id}>
            <div className="mq-line">
              <a className="mq-entry" href={`#${recordPath(one.id)}`}>
                {content(one.title)}
              </a>
              <code className="mq-id">{one.id}</code>
            </div>
            <p className="mq-why">{one.why}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** THE QUIET SPEED LINE, in the page's language. A count that could not be made is said in words, never as 0. */
export function speedLine(speed: QueueSpeed): string {
  const clauses = [speed.landed === 0 ? t('mergeQueuePage.speed.noneLanded') : t('mergeQueuePage.speed.landed', { n: speed.landed })]
  clauses.push(
    speed.buses.aboardEach === null
      ? t('mergeQueuePage.speed.noBus')
      : t('mergeQueuePage.speed.aboard', { n: speed.buses.ran, aboard: String(speed.buses.aboardEach) }),
  )
  if (speed.landed > 0) {
    clauses.push(
      speed.judgedToLanded.medianMinutes === null
        ? t('mergeQueuePage.speed.medianUnread')
        : t('mergeQueuePage.speed.median', { time: howLong(speed.judgedToLanded.medianMinutes) ?? '' }),
    )
  }
  return t('mergeQueuePage.speed.line', { line: clausesJoined(clauses) })
}

/** The entries the speed line could not count, each said, so a reader knows what the counts leave out. */
export function speedLeftOut(speed: QueueSpeed): string[] {
  return [
    speed.landedUnreadable > 0 ? t('mergeQueuePage.speed.landedUnreadable', { n: speed.landedUnreadable }) : null,
    speed.buses.unreadable > 0 ? t('mergeQueuePage.speed.busesUnreadable', { n: speed.buses.unreadable }) : null,
    speed.judgedToLanded.unreadable > 0 && speed.judgedToLanded.medianMinutes !== null
      ? t('mergeQueuePage.speed.waitsUnreadable', { n: speed.judgedToLanded.unreadable })
      : null,
  ].filter((line): line is string => line !== null)
}

/** What the page calls the entries a reply names: each id read in the reply's `names`, which must answer it. */
export type Namer = (id: string) => string

/** A namer over a reply's `names`. An id the reply holds no answer for is a broken reply, and fails loudly. */
export function namesIn(names: Record<string, EntryName | 'another-project' | 'no-record'>): Namer {
  return (id) => {
    const name = names[id]
    if (name === undefined) throw new Error(`GET /api/merge-queue mentions ${id} and sent no name for it.`)
    if (name === 'another-project') return t('mergeQueuePage.name.elsewhere')
    if (name === 'no-record') return t('mergeQueuePage.name.noRecord')
    return name.wave === null ? t('mergeQueuePage.name.work', { work: name.work }) : t('mergeQueuePage.name.waveWork', { wave: name.wave, work: name.work })
  }
}

// A stored moment, short. It lives with the push's part since wave 13u round 88, which the push's record page draws too.
export { shortTime }

/** The state in plain words: checking, waiting, riding the bus, landing, or with its supervisor. */
export function stateInWords(row: QueueEntryRow, bus: LaneBus | null): { key: 'checking' | 'waiting' | 'riding' | 'landing' | 'resolving'; word: string } {
  const key =
    row.state === 'landing'
      ? 'landing'
      : row.state === 'resolving'
        ? 'resolving'
        : row.state === 'testing' || ridesTheBus(row, bus)
          ? 'riding'
          : row.state === 'judged'
            ? 'waiting'
            : 'checking'
  const tested = row.machine?.['tested'] as { mergeClass?: { class?: unknown } } | undefined
  if (row.state === 'testing' && tested?.mergeClass?.class === 3 && redMergeAuthorizesLanding(tested)) return { key, word: sayInEnglish('mergeQueue.wide-red') }
  return { key, word: t(`mergeQueuePage.state.${key}`) }
}

/** The tag at the right of a row, or null for none. */
function theTag(row: QueueEntryRow, bus: LaneBus | null): { key: string; word: string } | null {
  if (row.state === 'testing') return { key: 'drives', word: t('mergeQueuePage.tag.drives') }
  if (bus === null) return null
  if (ridesTheBus(row, bus)) {
    return { key: 'seat', word: t('mergeQueuePage.tag.seat', { seat: bus.riders.indexOf(row.id) + 2, aboard: bus.riders.length + 1 }) }
  }
  if ((bus.passedForACheck.includes(row.id) || bus.passedAlone.includes(row.id)) && row.occupies === null) return { key: 'passed-over', word: t('mergeQueuePage.tag.passedOver') }
  if (row.state === 'judged') return { key: 'not-on-this-bus', word: t('mergeQueuePage.tag.notOnThisBus') }
  return null
}

/** The paths a check-again reads, as the state machine wrote them on `reinspection.only`, or null when none are named. */
function theFilesToCheck(row: QueueEntryRow): string[] | null {
  const reinspection = row.machine['reinspection']
  const only = typeof reinspection === 'object' && reinspection !== null ? (reinspection as Record<string, unknown>)['only'] : undefined
  return Array.isArray(only) && only.length > 0 && only.every((one) => typeof one === 'string') ? (only as string[]) : null
}

/** Whether the entry touches a path that lands only after a press, and nobody has pressed yet. */
function owesAPress(row: QueueEntryRow): boolean {
  return row.pressToLand !== undefined && row.pressToLand.pressed === null
}

/** A field of a stored object that is an object itself, or null when it is absent or anything else. */
function anObjectIn(holder: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = holder[key]
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * WHILE A RESOLVING ENTRY WAITS ON ITS OWN SUPERVISOR: the conflict's files and the end of the supervisor's time to
 * resolve, which `theEndOfResolving` reads from `since`, `timeZone` and `minutes` for both the server and page, drawn
 * on the reader's clock; that no resolve brief was written, or that nobody started it; and a resolution handed over,
 * or refused by the merge tool's check, with the minutes left to hand over another, which `theTimeLeftToResolve` reads
 * from that same end (13u round 79). The check's sentence stays on the entry's record. A new hand-on deletes the last
 * `resolution`, so one held here is this conflict's.
 *
 * NOBODY STARTED IT is said alone. The secretary asked for the reason in plain words beside it only where the stored reason has
 * one in a short form, and `nobodyStarted` holds the door's status and its own words, of which nothing writes a short form.
 */
function whileItResolves(row: QueueEntryRow, now: Date): string[] {
  const resolving = anObjectIn(row.machine, 'resolving') as Partial<Record<keyof Resolving, unknown>> | null
  if (resolving !== null && resolving.red !== undefined) return whileItFixesItsRed(row, resolving, now)
  const files = resolving?.files
  if (resolving === null || !Array.isArray(files) || files.length === 0 || !files.every((one) => typeof one === 'string')) {
    return [t('mergeQueuePage.why.resolvingUnread')]
  }
  const hour = theEndOfResolving(resolving)
  const lines = [
    hour === null || hour.untilMs === null
      ? t('mergeQueuePage.why.resolvingNoHour', { files: files.join(', ') })
      : t('mergeQueuePage.why.resolving', { files: files.join(', '), until: shortTime(localStamp(new Date(hour.untilMs)), now) }),
  ]
  const asked = anObjectIn(resolving, 'asked')
  if (asked !== null && typeof asked['brief'] !== 'string') lines.push(t('mergeQueuePage.why.noBrief'))
  if (anObjectIn(resolving, 'nobodyStarted') !== null) lines.push(t('mergeQueuePage.why.nobodyStarted'))
  const resolution = anObjectIn(row.machine, 'resolution') as Partial<Record<keyof Resolution, unknown>> | null
  if (resolution !== null && typeof resolution.at === 'string') {
    lines.push(
      anObjectIn(resolution, 'refused') === null
        ? t('mergeQueuePage.why.handedOver', { at: shortTime(resolution.at, now) })
        : t('mergeQueuePage.why.refused', { at: shortTime(resolution.at, now) }),
    )
    const time = anObjectIn(resolution, 'refused') === null ? null : theTimeLeftToResolve(resolving, now.getTime())
    if (time !== null) lines.push(time.left > 0 ? t('mergeQueuePage.why.refusedTimeLeft', { n: time.left }) : t('mergeQueuePage.why.refusedTimeEnded'))
  }
  return lines
}

/**
 * WHAT A RESOLVING ENTRY HANDED ON FOR TESTS RED ONLY WITH IT WAITS FOR (13u round 63): its own supervisor's fix of
 * those tests until the end of its time to fix, and what became of the brief and of the last fix handed over.
 */
function whileItFixesItsRed(row: QueueEntryRow, resolving: Partial<Record<keyof Resolving, unknown>>, now: Date): string[] {
  const tests = anObjectIn(resolving, 'red')?.['tests']
  if (!Array.isArray(tests) || tests.length === 0 || !tests.every((one) => typeof one === 'string')) return [t('mergeQueuePage.why.resolvingUnread')]
  const hour = theEndOfResolving(resolving)
  const lines = [
    hour === null || hour.untilMs === null
      ? t('mergeQueuePage.why.fixingRedNoHour', { tests: tests.join(', ') })
      : t('mergeQueuePage.why.fixingRed', { tests: tests.join(', '), until: shortTime(localStamp(new Date(hour.untilMs)), now) }),
  ]
  const asked = anObjectIn(resolving, 'asked')
  if (asked !== null && typeof asked['brief'] !== 'string') lines.push(t('mergeQueuePage.why.noFixBrief'))
  if (anObjectIn(resolving, 'nobodyStarted') !== null) lines.push(t('mergeQueuePage.why.nobodyStartedTheFix'))
  const resolution = anObjectIn(row.machine, 'resolution') as Partial<Record<keyof Resolution, unknown>> | null
  if (resolution !== null && typeof resolution.at === 'string') {
    lines.push(
      anObjectIn(resolution, 'refused') === null
        ? t('mergeQueuePage.why.fixHandedOver', { at: shortTime(resolution.at, now) })
        : t('mergeQueuePage.why.fixRefused', { at: shortTime(resolution.at, now) }),
    )
    const time = anObjectIn(resolution, 'refused') === null ? null : theTimeLeftToResolve(resolving, now.getTime())
    if (time !== null) lines.push(time.left > 0 ? t('mergeQueuePage.why.fixRefusedTimeLeft', { n: time.left }) : t('mergeQueuePage.why.fixRefusedTimeEnded'))
  }
  return lines
}

/** That the entry's resolution, or its fix of red tests, passed the merge tool's check, said on a pinned or judged entry holding one, or null. */
function itsResolutionPassed(row: QueueEntryRow, now: Date): string | null {
  if (row.state !== 'pinned' && row.state !== 'judged') return null
  const checked = anObjectIn(anObjectIn(row.machine, 'resolution') ?? {}, 'checked')
  if (checked === null || typeof checked['at'] !== 'string') return null
  return t(Array.isArray(checked['fixed']) ? 'mergeQueuePage.why.fixPassed' : 'mergeQueuePage.why.resolutionPassed', { at: shortTime(checked['at'], now) })
}

/** WHY IT WAITS, in short sentences: what the entry is doing, and what holds it back, by which entry and rule. */
export function whyItWaits(row: QueueEntryRow, bus: LaneBus | null, name: Namer, now: Date): string[] {
  const lines: string[] = []
  // A PRESS STILL OWED IS SAID IN EVERY STATE BEFORE THE LANDING, because the entry is checked and tested while it waits.
  const press = row.pressToLand !== undefined && owesAPress(row) ? t('mergeQueuePage.why.press', { n: row.pressToLand.paths.length, paths: row.pressToLand.paths.join(', ') }) : null
  // A FEW-RED ENTRY THAT WAITS FOR A FIX ROUND is not testing: its tests ran red, and TheFixRoundWait says the rest.
  if (row.state === 'testing' && theFixRoundWait(row.machine) === null) lines.push(t('mergeQueuePage.why.testing'))
  if (row.state === 'testing' && itWaitsForAFixRound(row.machine)) lines.push(t('mergeQueuePage.why.fixRound'))
  if (row.state === 'integrating') lines.push(t('mergeQueuePage.why.integrating'))
  if (row.state === 'landing') lines.push(t('mergeQueuePage.why.landing'))
  if (row.state === 'reinspecting') {
    const files = theFilesToCheck(row)
    // A CHECK AGAIN HOLDS THE LANE ONLY FOR AN ENTRY BACK FROM AN EARLIER ONE (wave 13u, item 53); `occupies` says which.
    if (row.occupies !== null) lines.push(files === null ? t('mergeQueuePage.why.reinspectingUnnamed') : t('mergeQueuePage.why.reinspecting', { files: files.join(', ') }))
    else lines.push(files === null ? t('mergeQueuePage.why.reinspectingLetGoUnnamed') : t('mergeQueuePage.why.reinspectingLetGo', { files: files.join(', ') }))
  }
  if (row.state === 'resolving') lines.push(...whileItResolves(row, now))
  if (row.state === 'submitted') lines.push(t('mergeQueuePage.why.submitted'))
  if (row.state === 'pinned') lines.push(t('mergeQueuePage.why.pinned'))
  const passed = itsResolutionPassed(row, now)
  if (passed !== null) lines.push(passed)
  if (row.state !== 'judged') return press === null ? lines : [...lines, press]
  if (bus !== null && ridesTheBus(row, bus)) lines.push(t('mergeQueuePage.why.rode', { driver: name(bus.driver) }))
  if (bus !== null && bus.passedForACheck.includes(row.id)) lines.push(t('mergeQueuePage.why.passedOver', { driver: name(bus.driver) }))
  if (bus !== null && bus.passedAlone.includes(row.id)) lines.push(t('mergeQueuePage.why.passedAlone', { driver: name(bus.driver) }))
  const waits = row.toolWaits
  if (waits === undefined) lines.push(t('mergeQueuePage.why.next'))
  else if (waits.because === 'the-lane-is-held') lines.push(t('mergeQueuePage.why.laneHeld', { holder: name(waits.holder) }))
  else if (waits.because === 'deletes-not-confirmed') lines.push(t('mergeQueuePage.why.deletes', { n: waits.deletes }))
  else if (waits.because === 'a-rider-goes-first') lines.push(t('mergeQueuePage.why.behindRider', { first: name(waits.first), driver: name(waits.driver) }))
  else if (waits.because === 'an-entry-passed-over-for-a-check-goes-first') lines.push(t('mergeQueuePage.why.behindPassedOver', { first: name(waits.first), driver: name(waits.driver) }))
  else if (waits.because === 'an-entry-tested-alone-goes-first') lines.push(t('mergeQueuePage.why.behindTestedAlone', { first: name(waits.first), driver: name(waits.driver) }))
  else if (waits.because === 'a-moved-entry-goes-first') lines.push(t('mergeQueuePage.why.behindMoved', { first: name(waits.first) }))
  else if (waits.because === 'a-returning-entry-goes-first') lines.push(t('mergeQueuePage.why.behindReturning', { first: name(waits.first) }))
  else if (waits.because === 'the-queue-is-held') lines.push(t('mergeQueuePage.why.queueHeld'))
  return press === null ? lines : [...lines, press]
}

/**
 * How long it has been in the queue, from the moment it was submitted, or a sentence saying that cannot be read. The
 * moment is the server's instant: `submittedAt` alone repeats an hour when the clocks go back.
 */
function howLongItWaited(row: QueueEntryRow, now: Date): string {
  const since = row.submittedInstant === undefined ? null : momentOfAnInstant(row.submittedInstant)
  if (since === null) return t('mergeQueuePage.waitedUnknown')
  return t('mergeQueuePage.waited', { time: howLong(Math.max(0, Math.floor((now.getTime() - since) / 60000))) ?? '' })
}

/**
 * WHO SUBMITTED THE ROW, as the server read it off the registry. Null is drawn as a sentence saying the name cannot be
 * read. A row the server sent no answer for at all is a broken reply, and fails loudly.
 */
function SubmittedBy({ handle, byTheOffice }: { handle: string | null | undefined; byTheOffice: boolean }) {
  if (handle === undefined) throw new Error('GET /api/merge-queue sent an entry with no answer for who submitted it.')
  // THE OFFICE SUBMITS ONLY A SEALED ROUND OF A LINE THAT IS TURNED ON (wave 13u round 93), and has no registry row.
  if (byTheOffice) {
    return (
      <span className="mq-by mq-by-office" data-by="the-office">
        {t('mergeQueuePage.submitterTheOffice')}
      </span>
    )
  }
  return handle === null ? (
    <span className="mq-by mq-by-unknown" data-by="unknown">
      {t('mergeQueuePage.submitterUnknown')}
    </span>
  ) : (
    <span className="mq-by" data-by={handle}>
      {t('mergeQueuePage.submitter', { who: handle })}
    </span>
  )
}

function OneLane(props: {
  lane: string
  /** Undefined where the reply says nothing of who holds the lane. */
  holder: { entry: string; workspaceId: string; state: string } | null | undefined
  workspaceId: string
  bus: LaneBus | null
  rows: QueueEntryRow[]
  movable: string[]
  submitters: Record<string, string | null>
  movers: Record<string, string | null>
  pressers: Record<string, string | null>
  names: Record<string, EntryName | 'another-project' | 'no-record'>
  now: Date
  pushes: EmergencyPushReading[]
  onMoved?: () => void
}) {
  const { lane, holder, workspaceId, bus, rows, movable, submitters, movers, pressers, names, now, pushes, onMoved } = props
  const person = getActor().type === 'human'
  const name = namesIn(names)
  const testingNow = rows.find((one) => one.state === 'testing') ?? null
  return (
    <Panel
      declares={{ surface: 'mergequeue.lane' }}
      title={lane}
      // A LANE OF PUSHES ONLY says how many it holds, and not that it holds nothing (wave 13u round 83).
      kind={rows.length === 0 && pushes.length > 0 ? t('mergeQueuePage.lane.onlyPushes', { n: pushes.length }) : t('mergeQueuePage.lane.count', { n: rows.length })}
    >
      <div className="mq-lane" data-lane={lane}>
        {holder === undefined ? null : <p className="mq-holder">
          {holder === null ? (
            t('mergeQueuePage.lane.free')
          ) : (
            <>
              {holder.workspaceId === workspaceId ? t('mergeQueuePage.lane.held', { name: name(holder.entry) }) : t('mergeQueuePage.lane.heldElsewhere')}{' '}
              <code className="mq-id">{holder.entry}</code>
            </>
          )}
        </p>}
        {testingNow === null && bus === null ? null : <TheBus testingNow={testingNow} bus={bus} name={name} now={now} />}
        <ol className="mq-rows">
          {rows.map((row, at) => {
            const words = stateInWords(row, bus)
            const tag = theTag(row, bus)
            const move = row.movedFirst
            const pressed = row.pressToLand?.pressed ?? null
            return (
              <li key={row.id} className="mq-row" data-entry={row.id} data-state={row.state} data-says={words.key}>
                <span className="mq-n">{at + 1}</span>
                <div className="mq-main">
                  <div className="mq-line">
                    <span className={`mq-chip mq-chip-${words.key}`}>{words.word}</span>
                    <SubmittedBy handle={submitters[row.id]} byTheOffice={submittedByTheOffice(row.submittedBy)} />
                    <a className="mq-entry" href={`#${recordPath(row.id)}`}>
                      {name(row.id)}
                    </a>
                    <code className="mq-id">{row.id}</code>
                    {tag === null ? null : (
                      <span className={`mq-tag mq-tag-${tag.key}`} data-tag={tag.key}>
                        {tag.word}
                      </span>
                    )}
                  </div>
                  {whyItWaits(row, bus, name, now).map((line) => (
                    <p key={line} className="mq-why">
                      {line}
                    </p>
                  ))}
                  {row.state === 'testing' ? <TheFixRoundWait machine={row.machine} now={now} saidToo className="mq-why" /> : null}
                  {move === undefined ? null : (
                    <p className="mq-moved" data-moved="yes">
                      {t('mergeQueuePage.moved', { by: movers[row.id] ?? t('mergeQueuePage.movedByUnknown'), because: move.because })}
                    </p>
                  )}
                  {pressed === null ? null : (
                    <p className="mq-pressed" data-pressed="yes">
                      {t('mergeQueuePage.pressed', { by: pressers[row.id] ?? t('mergeQueuePage.pressedByUnknown'), at: shortTime(pressed.at, now), because: pressed.because })}
                    </p>
                  )}
                  <p className="mq-waited">{howLongItWaited(row, now)}</p>
                  {person && movable.includes(row.id) ? <ThePress id={row.id} door="first" {...(onMoved === undefined ? {} : { onMoved })} /> : null}
                  {person && owesAPress(row) ? <ThePress id={row.id} door="land" {...(onMoved === undefined ? {} : { onMoved })} /> : null}
                </div>
              </li>
            )
          })}
        </ol>
        {pushes.length === 0 ? null : (
          <div className="mq-pushes">
            <p className="mq-pushes-title">{t('mergeQueuePage.push.heading')}</p>
            <ol className="mq-push-list">
              {pushes.map((push) => (
                <OnePush key={push.id} push={push} now={now} />
              ))}
            </ol>
          </div>
        )}
      </div>
    </Panel>
  )
}

/** A push's state in the page's words, and the class of its chip. */
const A_PUSH_STATE_SAYS: Record<EmergencyPushState, { key: WordKey; chip: string }> = {
  pushing: { key: 'mergeQueuePage.push.state.pushing', chip: 'mq-chip-push-pushing' },
  pushed: { key: 'mergeQueuePage.push.state.pushed', chip: 'mq-chip-push-pushed' },
  stopped: { key: 'mergeQueuePage.push.state.stopped', chip: 'mq-chip-push-stopped' },
}

/** ONE EMERGENCY PUSH IN ITS LANE'S HISTORY: its state, who pushed it and the commit, then what became of it. */
function OnePush({ push, now }: { push: EmergencyPushReading; now: Date }) {
  const says = A_PUSH_STATE_SAYS[push.state]
  return (
    <li className="mq-push" data-push={push.id} data-push-state={push.state}>
      <div className="mq-line">
        <span className={`mq-chip ${says.chip}`}>{t(says.key)}</span>
        <WhoPushed who={push.who} form="by" />
        <a className="mq-entry" href={`#${recordPath(push.id)}`}>
          <code>{push.commit.slice(0, 12)}</code>
        </a>
        <code className="mq-id">{push.id}</code>
      </div>
      <PushLines lines={whatBecameOfThePush(push, now)} className="mq-why" />
    </li>
  )
}

/**
 * WHAT BECAME OF A PUSH, in short sentences: when it started; then how it ended and what the first whole-suite run on
 * main that holds it said, both as src/web/components/MergeQueuePush.tsx says them for the push's own page too. This
 * page names ids and paths, so it says what the merge tool said as well.
 */
export function whatBecameOfThePush(push: EmergencyPushReading, now: Date): PushLine[] {
  const ended = howThePushEnded(push, now, true)
  if (push.ended === null) return [{ says: t('mergeQueuePage.push.started', { at: shortTime(push.startedAt, now) }), red: false, receipt: null }, ...ended]
  const follow = theFollowUpOf(push, true)
  return follow === null ? ended : [...ended, follow]
}

/**
 * THE BUS BOX: the entry testing now, if one is, and the last bus whose suite ended, with who was aboard and how it ended.
 * The two are said apart, because the riders of a bus are recorded only when its suite ends.
 */
function TheBus({ testingNow, bus, name, now }: { testingNow: QueueEntryRow | null; bus: LaneBus | null; name: Namer; now: Date }) {
  return (
    <div className="mq-bus">
      {testingNow === null ? null : (
        <p className="mq-bus-now" data-testing={testingNow.id}>
          {t('mergeQueuePage.bus.testingNow', { name: name(testingNow.id) })}
        </p>
      )}
      {bus === null ? null : (
        <div className="mq-bus-last" data-bus={bus.driver}>
          <p className="mq-bus-title">
            {t('mergeQueuePage.bus.last', { driver: name(bus.driver), n: bus.riders.length + 1 })}{' '}
            {bus.green === true
              ? t('mergeQueuePage.bus.green', { at: shortTime(bus.at, now) })
              : bus.green === false
                ? t('mergeQueuePage.bus.red', { at: shortTime(bus.at, now) })
                : t('mergeQueuePage.bus.unsaid', { at: shortTime(bus.at, now) })}
            {bus.passedForACheck.length === 0 ? null : ` ${t('mergeQueuePage.bus.passedOver', { n: bus.passedForACheck.length })}`}
            {bus.passedAlone.length === 0 ? null : ` ${t('mergeQueuePage.bus.passedAlone', { n: bus.passedAlone.length })}`}
          </p>
          <ol className="mq-seats" aria-label={t('mergeQueuePage.bus.seats')}>
            {[bus.driver, ...bus.riders].map((id, seat) => (
              <li key={id} className={seat === 0 ? 'mq-seat mq-seat-driver' : 'mq-seat'}>
                {name(id)} <code className="mq-id">{id}</code>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

/** Each press's door and its words: `first` moves an entry to the front, `land` lets one touching a sensitive path land. */
const THE_DOORS = {
  first: { send: api.moveToTheFront, open: 'mergeQueuePage.press.open', label: 'mergeQueuePage.press.label', hint: 'mergeQueuePage.press.hint', go: 'mergeQueuePage.press.send' },
  land: { send: api.pressToLand, open: 'mergeQueuePage.landPress.open', label: 'mergeQueuePage.landPress.label', hint: 'mergeQueuePage.landPress.hint', go: 'mergeQueuePage.landPress.send' },
} as const

/** THE PRESS: asks for a written reason, sends it, and draws the door's answer or its refusal in the door's own words. */
function ThePress({ id, door, onMoved }: { id: string; door: keyof typeof THE_DOORS; onMoved?: () => void }) {
  const words = THE_DOORS[door]
  const [open, setOpen] = useState(false)
  const [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false)
  const [says, setSays] = useState<string | null>(null)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  if (says !== null) {
    return (
      <p className="mq-press-says" role="status" data-press="answered">
        {says}
      </p>
    )
  }
  if (!open) {
    return (
      <div className="mq-press" data-door={door}>
        <Btn variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {t(words.open)}
        </Btn>
      </div>
    )
  }
  const send = (): void => {
    setRefused(null)
    setBusy(true)
    void words
      .send(id, because.trim())
      .then((answer) => {
        setBusy(false)
        setSays(answer.says)
        onMoved?.()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setRefused({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  const empty = because.trim() === ''
  return (
    <div className="mq-press" data-press="open" data-door={door}>
      <label className="mq-press-label" htmlFor={`mq-because-${door}-${id}`}>
        {t(words.label)}
      </label>
      <TextArea id={`mq-because-${door}-${id}`} value={because} onChange={setBecause} rows={2} placeholder={t(words.hint)} />
      {refused === null ? null : (
        <div data-press="refused">
          <ErrorNote message={refused.message} fault={refused.fault} />
        </div>
      )}
      <div className="mq-press-buttons">
        <Btn
          variant="primary"
          size="sm"
          onClick={send}
          pending={busy}
          disabled={busy || empty}
          reason={empty ? t('mergeQueuePage.press.needsReason') : busy ? t('mergeQueuePage.press.pressing') : undefined}
        >
          {t(words.go)}
        </Btn>
        <Btn variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy} reason={busy ? t('mergeQueuePage.press.pressing') : undefined}>
          {t('mergeQueuePage.press.cancel')}
        </Btn>
      </div>
    </div>
  )
}

export const MERGE_QUEUE_CSS = `
.mq { min-width: 0; }
.mq-crumbs { margin: 0 0 var(--pad); color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.mq-crumbs a { color: var(--text-2); }
.mq-crumbs [aria-current] { color: var(--text); }
.mq-head { display: grid; gap: var(--pad); min-width: 0; margin: 0 0 var(--gut); }
.mq-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.mq-intro { margin: 0; max-width: 70ch; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.mq-body { display: grid; gap: var(--gut); min-width: 0; }
.mq-speed { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mq-speed-out { color: var(--text-3); font-size: var(--fs-1); }
.mq-lane { display: grid; gap: var(--pad); min-width: 0; }
.mq-holder, .mq-bus-now { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mq-bus { display: grid; gap: 6px; padding: var(--pad); border: var(--border-w) solid var(--border); border-radius: var(--radius); min-width: 0; }
.mq-bus-last { display: grid; gap: 6px; min-width: 0; }
.mq-bus-now + .mq-bus-last { padding-top: 6px; border-top: var(--border-w) solid var(--border); }
.mq-bus-title { margin: 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mq-bus-title { color: var(--text); }
.mq-seats { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.mq-seat { padding: 2px 8px; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); color: var(--text); font: var(--fs-1)/1.4 var(--font-ui); overflow-wrap: anywhere; }
.mq-seat-driver { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.mq-rows { display: grid; margin: 0; padding: 0; list-style: none; min-width: 0; }
.mq-row { display: grid; grid-template-columns: 2.2em minmax(0, 1fr); gap: var(--pad); padding: var(--pad) 0; border-top: var(--border-w) solid var(--border); min-width: 0; }
.mq-n { color: var(--text-3); font: 600 var(--fs-2)/var(--lh-read) var(--font-mono, monospace); }
.mq-main { display: grid; gap: 4px; min-width: 0; }
.mq-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; min-width: 0; }
.mq-chip { padding: 0 6px; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); color: var(--text-2); font: var(--fs-1)/1.6 var(--font-ui); white-space: nowrap; }
.mq-chip-riding, .mq-chip-landing { border-color: var(--accent); color: var(--accent); }
.mq-chip-waiting { color: var(--text); }
.mq-chip-resolving { border-style: dashed; color: var(--text); }
.mq-unreadable { display: grid; margin: 0; padding: 0; list-style: none; min-width: 0; }
.mq-unreadable-row { display: grid; gap: 4px; padding: var(--pad) 0; border-top: var(--border-w) solid var(--border); min-width: 0; }
${PUSH_CSS}
${MEASURES_CSS}
${ON_THE_QUEUE_PAGE_CSS}
.mq-entry { color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mq-id { color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-mono, monospace); overflow-wrap: anywhere; }
.mq-tag { margin-left: auto; padding: 0 8px; border: var(--border-w) dashed var(--border); border-radius: var(--radius-pill); color: var(--text-2); font: 600 var(--fs-1)/1.6 var(--font-ui); white-space: nowrap; }
.mq-tag-seat, .mq-tag-drives { border-style: solid; border-color: var(--accent); color: var(--accent); }
.mq-tag-passed-over { border-color: var(--border-strong); color: var(--text); }
.mq-why, .mq-moved, .mq-pressed, .mq-waited, .mq-press-says { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mq-moved, .mq-pressed { color: var(--text); }
.mq-waited { color: var(--text-3); font-size: var(--fs-1); }
.mq-press { display: grid; justify-items: start; gap: 6px; margin-top: 4px; max-width: 60ch; }
.mq-press-label { color: var(--text); font: 600 var(--fs-1)/var(--lh-read) var(--font-ui); }
.mq-press textarea { width: 100%; }
.mq-press-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.mq-pushes { display: grid; gap: 4px; padding-top: var(--pad); border-top: var(--border-w) solid var(--border); min-width: 0; }
.mq-pushes-title { margin: 0; color: var(--text); font: 600 var(--fs-1)/var(--lh-read) var(--font-ui); }
.mq-push-list { display: grid; margin: 0; padding: 0; list-style: none; min-width: 0; }
.mq-push { display: grid; gap: 4px; padding: 6px 0; min-width: 0; }
.mq-push + .mq-push { border-top: var(--border-w) dashed var(--border); }
.mq-chip-push-pushing { border-color: var(--accent); color: var(--accent); }
.mq-chip-push-stopped { border-style: dashed; }
@media (max-width: 480px) {
  .mq-row { grid-template-columns: 1.6em minmax(0, 1fr); }
  .mq-tag { margin-left: 0; }
}
`
