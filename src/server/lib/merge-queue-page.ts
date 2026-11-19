// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE MERGE QUEUE PAGE READS BESIDE THE LANES, in wave 13p round 30, option A.
 *
 * GET /api/merge-queue hands this on in the same reply as `listMergeQueue`, so the page makes one reading and no
 * per-row fetches. It writes nothing. The shapes and what a null in them means are in src/shared/merge-queue-page.ts.
 *
 * It lives beside src/server/lib/merge-queue.ts and not in it, and reads the queue only through that file's exported
 * readers, so the queue's own rules stay in one place: who goes first behind a bus is `toolWaits`, worked out there.
 */
import { aMoveToTheFrontStands, inTheLanesOrder, MERGE_ENTRY_KIND } from '@shared/merge-queue.ts'
import { QUEUE_ENTRY_ROW_FIELDS, QUEUE_ENTRY_ROW_MACHINE, ridesTheBus, type EntryName, type LaneBus, type QueueEntryRow, type QueuePageLane, type QueuePageReading, type QueueSpeed } from '@shared/merge-queue-page.ts'
import { localStamp, momentOfAStoredStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { readMergeEntry, theNewestBusOfEachLane, type LaneReading, type MergeEntryReading } from './merge-queue.ts'
import { getRecord } from './records.ts'
import { theWaveOf } from '@shared/wave-of-a-branch.ts'
import { theHandleOf } from '../db/the-handle-of.ts'
export { theHandleOf }

const DAY_MS = 24 * 60 * 60 * 1000

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A stored stamp as milliseconds, read with the clock observation stored beside it (`momentOfAStoredStamp`), or null when
 * nobody can tell. The query hands the observation on as JSON, or null when none is stored.
 */
function msOf(stamp: unknown, time: string | null): number | null {
  return momentOfAStoredStamp(stamp, time === null ? null : JSON.parse(time))
}

/**
 * THE QUEUE'S SPEED OVER THE 24 HOURS BEFORE `now`, from this project's merge entries, in one query. Every live entry
 * is read, whatever states the request narrowed the lanes to, because the speed is about what already happened. Each
 * moment is read with the clock observation stored beside its stamp. A stamp with none beside it that names two moments
 * or none, in the hour the clocks go back or the hour they skip, is counted as one that cannot be read.
 */
export function theQueuesSpeed(workspaceId: string, now: Date): QueueSpeed {
  const to = now.getTime()
  const from = to - DAY_MS
  const within = (ms: number | null): boolean => ms !== null && ms > from && ms <= to
  const rows = sqlite
    .prepare(
      "SELECT json_extract(data, '$.state') AS state, json_extract(data, '$.integrated.at') AS landedAt, data -> '$.integrated.time' AS landedTime, " +
        "json_extract(data, '$.verdict.at') AS verdictAt, data -> '$.verdict.time' AS verdictTime, " +
        "json_extract(data, '$.tested.at') AS testedAt, data -> '$.tested.time' AS testedTime, " +
        "json_type(data, '$.tested.testedWith.bus') AS busType, json_array_length(data, '$.tested.testedWith.bus') AS riders " +
        "FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL AND " +
        "(json_extract(data, '$.state') = 'merged' OR json_extract(data, '$.tested.testedWith.bus') IS NOT NULL)",
    )
    .all(workspaceId, MERGE_ENTRY_KIND) as {
    state: string
    landedAt: unknown
    landedTime: string | null
    verdictAt: unknown
    verdictTime: string | null
    testedAt: unknown
    testedTime: string | null
    busType: string | null
    riders: number | null
  }[]
  let landed = 0
  let landedUnreadable = 0
  const waits: number[] = []
  let waitsUnreadable = 0
  const aboard: number[] = []
  let busesUnreadable = 0
  for (const row of rows) {
    if (row.state === 'merged') {
      const landedMs = msOf(row.landedAt, row.landedTime)
      if (landedMs === null) landedUnreadable += 1
      else if (within(landedMs)) {
        landed += 1
        const verdictMs = msOf(row.verdictAt, row.verdictTime)
        if (verdictMs === null || verdictMs > landedMs) waitsUnreadable += 1
        else waits.push(landedMs - verdictMs)
      }
    }
    if (row.busType !== null) {
      const testedMs = msOf(row.testedAt, row.testedTime)
      if (testedMs === null || row.busType !== 'array' || row.riders === null) busesUnreadable += 1
      else if (within(testedMs)) aboard.push(row.riders + 1)
    }
  }
  waits.sort((a, b) => a - b)
  const middle = Math.floor(waits.length / 2)
  const median = waits.length === 0 ? null : waits.length % 2 === 1 ? waits[middle]! : (waits[middle - 1]! + waits[middle]!) / 2
  return {
    at: localStamp(now),
    since: localStamp(new Date(from)),
    landed,
    landedUnreadable,
    buses: {
      ran: aboard.length,
      aboardEach: aboard.length === 0 ? null : Math.round((aboard.reduce((sum, one) => sum + one, 0) / aboard.length) * 10) / 10,
      unreadable: busesUnreadable,
    },
    judgedToLanded: { medianMinutes: median === null ? null : Math.round(median / 60000), measured: waits.length, unreadable: waitsUnreadable },
  }
}

/** The bus a driver's tested step names, read as the state machine writes it; a bag not in that shape fails loudly. */
function theBusOn(record: { id: string; data: Record<string, unknown> }, state: string): LaneBus {
  const tested = record.data['tested']
  const testedWith = isObject(tested) ? tested['testedWith'] : undefined
  const bus = isObject(testedWith) ? testedWith['bus'] : undefined
  const passed = isObject(testedWith) ? (testedWith['passedForACheck'] ?? []) : []
  const alone = isObject(testedWith) ? (testedWith['passedAlone'] ?? []) : []
  if (
    !isObject(tested) ||
    typeof tested['at'] !== 'string' ||
    !Array.isArray(bus) ||
    !bus.every((one) => isObject(one) && typeof one['entry'] === 'string') ||
    !Array.isArray(passed) ||
    !passed.every((one) => typeof one === 'string') ||
    !Array.isArray(alone) ||
    !alone.every((one) => typeof one === 'string')
  ) {
    throw new Error(`Merge entry ${record.id} names a bus in tested.testedWith that is not in the shape the state machine writes.`)
  }
  return {
    driver: record.id,
    driverState: state,
    at: tested['at'],
    green: typeof tested['green'] === 'boolean' ? tested['green'] : null,
    riders: bus.map((one) => (one as { entry: string }).entry),
    passedForACheck: passed as string[],
    passedAlone: alone as string[],
  }
}

/**
 * The newest bus of each lane asked, in any project, as `theNewestBusOfEachLane` in ./merge-queue.ts finds it for
 * `aRiderGoesFirst`. A lane whose newest bus nobody can tell gets none, and that reader has said so in a warning.
 */
function theNewestBuses(lanes: readonly string[]): Map<string, LaneBus> {
  const found = new Map<string, LaneBus>()
  for (const [lane, newest] of theNewestBusOfEachLane(lanes)) {
    const record = newest === null ? null : getRecord(newest)
    if (record !== null) found.set(lane, theBusOn(record, readMergeEntry(record).state))
  }
  return found
}

/**
 * THE ORDER A LANE'S ENTRIES WILL LAND IN, by the rules the merge tool follows now:
 *
 *   1. the entry holding the lane, which may be a reinspecting entry back from an earlier check (`occupies`);
 *   2. judged entries in the lane's own order (`inTheLanesOrder` in src/shared/merge-queue.ts): those moved to the front
 *      by their turn, then those back from a check that let their lane go (`returnsFirst`) by their turn, then the rest
 *      in the order they were submitted, which is the order the merge tool takes them in
 *      (`theMergeToolWork`). Each entry the tool holds behind another (`toolWaits.first`) is put after that one, so the
 *      riders of the newest bus and the entries it passed over go before a moved entry, as the tool holds them. That
 *      hold is `toolWaits`, worked out in ./merge-queue.ts;
 *   3. entries still being checked, in the lane's own order. A moved entry goes first only once it is judged
 *      (`aMovedEntryGoesFirst` in ./merge-queue.ts), so here it leads only the entries still being checked;
 *   4. anything else the request asked for, in the order they were submitted: final entries, an entry being resolved,
 *      and a reinspecting entry that let its lane go. Where that entry lands is decided only by its release, which moves
 *      it to testing, holding the lane, or back to judged, where it returns first in 2.
 */
function theLandingOrder(entries: readonly MergeEntryReading[]): string[] {
  const holders = entries.filter((one) => one.occupies !== null)
  const placed = new Set(holders.map((one) => one.id))
  // AN ENTRY THE TOOL HOLDS BEHIND ANOTHER GOES AFTER IT: each next entry is the first, in the lane's own order, that is
  // not held behind an entry still to come. Should every one left be held, the first of them is taken, so a cycle ends.
  const left = inTheLanesOrder(entries.filter((one) => !placed.has(one.id) && one.state === 'judged'))
  const judged: MergeEntryReading[] = []
  while (left.length > 0) {
    const free = left.findIndex((one) => {
      const first = one.toolWaits !== undefined && 'first' in one.toolWaits ? one.toolWaits.first : null
      return first === null || !left.some((other) => other.id === first)
    })
    judged.push(...left.splice(free === -1 ? 0 : free, 1))
  }
  for (const one of judged) placed.add(one.id)
  const checking = inTheLanesOrder(entries.filter((one) => !placed.has(one.id) && (one.state === 'submitted' || one.state === 'pinned')))
  for (const one of checking) placed.add(one.id)
  const rest = entries.filter((one) => !placed.has(one.id))
  return [...holders, ...judged, ...checking, ...rest].map((one) => one.id)
}

/**
 * THE ENTRIES A MOVE TO THE FRONT WOULD MOVE, in a lane's landing order. The door refuses an entry already moved
 * (`moveToTheFront` in ./merge-state-machine.ts), and a press moves an entry only when something that stays ahead of a
 * moved entry is not all that is ahead of it. What stays ahead: the entry holding the lane, a move that still stands, and
 * a judged rider of the lane's newest bus or a judged entry that bus passed over, which the merge tool hands on before a
 * moved entry (`aRiderGoesFirst` before `aMovedEntryGoesFirst` in ./merge-queue.ts). An entry holding the lane, riding
 * the bus or in a later state is not offered it.
 */
function theMovable(order: readonly string[], entries: readonly MergeEntryReading[], bus: LaneBus | null): string[] {
  const byId = new Map(entries.map((one) => [one.id, one]))
  const onTheBus = (one: MergeEntryReading): boolean =>
    bus !== null && one.state === 'judged' && (bus.riders.includes(one.id) || bus.passedForACheck.includes(one.id) || bus.passedAlone.includes(one.id))
  const staysAhead = (one: MergeEntryReading): boolean => one.occupies !== null || aMoveToTheFrontStands(one) || onTheBus(one)
  return order.filter((id, at) => {
    const one = byId.get(id)!
    if (!['submitted', 'pinned', 'judged'].includes(one.state) || one.occupies !== null || one.movedFirst !== undefined || ridesTheBus(one, bus)) return false
    return order.slice(0, at).some((ahead) => !staysAhead(byId.get(ahead)!))
  })
}

export { theWaveOf }

/** The entry's name as `EntryName` in src/shared/merge-queue-page.ts says it is made. */
function theNameOf(entry: MergeEntryReading, workspaceId: string): EntryName {
  const wave = theWaveOf(entry.changeset.adapter === 'git' ? entry.changeset.branch : null)
  const run = getRecord(entry.run)
  if (run === null || run.deletedAt !== null || run.workspaceId !== workspaceId || run.title.trim() === '') return { wave, work: entry.title }
  // A TITLE THAT STARTS BY SAYING THE WAVE, "Wave 13p, round 31: ...", loses that start, so the name says it once.
  const start = /^wave\s+([^\s,:]+)\s*[,:]\s*/iu.exec(run.title)
  const work = start !== null && wave !== null && start[1]!.toLowerCase() === wave.toLowerCase() ? run.title.slice(start[0].length) : run.title
  return { wave, work: work.trim() === '' ? run.title : work }
}

/**
 * EVERY ENTRY THE PAGE MENTIONS, NAMED: the rows, the lane holders, the bus's seats and the entries a row waits behind.
 * An entry of another project is not named here, and an id with no merge entry record is said to have none.
 */
function theNames(
  workspaceId: string,
  lanes: readonly LaneReading[],
  buses: ReadonlyMap<string, LaneBus>,
): Record<string, EntryName | 'another-project' | 'no-record'> {
  const rows = new Map(lanes.flatMap((one) => one.entries).map((one) => [one.id, one]))
  const mentioned = new Set<string>(rows.keys())
  for (const one of lanes) {
    if (one.occupiedBy !== null) mentioned.add(one.occupiedBy.entry)
    const bus = buses.get(one.lane)
    if (bus !== undefined) for (const id of [bus.driver, ...bus.riders, ...bus.passedForACheck, ...bus.passedAlone]) mentioned.add(id)
    for (const entry of one.entries) {
      const waits = entry.toolWaits
      if (waits === undefined) continue
      if ('first' in waits) mentioned.add(waits.first)
      if ('driver' in waits) mentioned.add(waits.driver)
      if ('holder' in waits) mentioned.add(waits.holder)
    }
  }
  const names: Record<string, EntryName | 'another-project' | 'no-record'> = {}
  for (const id of mentioned) {
    const row = rows.get(id)
    if (row !== undefined) {
      names[id] = theNameOf(row, workspaceId)
      continue
    }
    const record = getRecord(id)
    if (record === null || record.kind !== MERGE_ENTRY_KIND) names[id] = 'no-record'
    else if (record.workspaceId !== workspaceId) names[id] = 'another-project'
    else names[id] = theNameOf(readMergeEntry(record), workspaceId)
  }
  return names
}

/**
 * WHAT THE PAGE READS BESIDE THE LANES: the speed, each lane's newest bus, landing order and movable rows, and who
 * submitted and who moved each entry. Who moved an entry, when and why is the entry's own `movedFirst`, which the
 * lanes already carry; only the mover's handle is read here.
 */
export function theQueuePageReading(input: { workspaceId: string; lanes: readonly LaneReading[]; now: Date }): QueuePageReading {
  const buses = theNewestBuses(input.lanes.map((one) => one.lane))
  const lanes: QueuePageLane[] = input.lanes.map((one) => {
    const bus = buses.get(one.lane) ?? null
    const order = theLandingOrder(one.entries)
    return { lane: one.lane, bus, order, movable: theMovable(order, one.entries, bus) }
  })
  return {
    speed: theQueuesSpeed(input.workspaceId, input.now),
    page: {
      lanes,
      submitters: theHandles(input.lanes, (entry) => entry.submittedBy),
      movers: theHandles(input.lanes, (entry) => entry.movedFirst?.by),
      pressers: theHandles(input.lanes, (entry) => entry.pressToLand?.pressed?.by),
      names: theNames(input.workspaceId, input.lanes, buses),
    },
  }
}

/**
 * THE LANES AS THE PAGE DRAWS THEM (`?shape=page`, wave 13u round 123): each entry with only the fields of
 * `QueueEntryRow`, and its machine with only the parts the page reads. The page's reading beside the lanes is worked out
 * from the whole lanes before this, so it is the same whatever the shape.
 */
export function thePagesLanes(lanes: readonly LaneReading[]): LaneReading<QueueEntryRow>[] {
  return lanes.map((one) => ({
    ...one,
    entries: one.entries.map((entry) => {
      const whole = entry as unknown as Record<string, unknown>
      const row = Object.fromEntries(QUEUE_ENTRY_ROW_FIELDS.filter((key) => whole[key] !== undefined).map((key) => [key, whole[key]]))
      const machine = entry.machine
      row['machine'] = Object.fromEntries(QUEUE_ENTRY_ROW_MACHINE.filter((key) => machine[key] !== undefined).map((key) => [key, machine[key]]))
      return row as unknown as QueueEntryRow
    }),
  }))
}

/**
 * WHO SUBMITTED, WHO MOVED OR WHO PRESSED EACH ENTRY, as the handle the registry gives the stored participant, or null
 * when no registry row answers it. An entry nobody moved is left out of the movers, and one nobody pressed out of the
 * pressers. The stored id is not shown in a handle's
 * place: an id with no row behind it is not a name anybody can follow.
 */
function theHandles(lanes: readonly LaneReading[], whoOf: (entry: MergeEntryReading) => { kind: string; id: string } | undefined): Record<string, string | null> {
  const handles: Record<string, string | null> = {}
  for (const entry of lanes.flatMap((one) => one.entries)) {
    const who = whoOf(entry)
    if (who === undefined) continue
    handles[entry.id] = theHandleOf(who)
  }
  return handles
}

