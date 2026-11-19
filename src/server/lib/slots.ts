// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINE'S SHARED SEATS: ONE WHOLE TEST SUITE AT A TIME, A FEW BROWSER TEST FILES AT A TIME, AND A FEW BATCHES
 * OF NAMED TEST FILES AT A TIME.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * On 11 September 2026 two whole suites ran at once, the machine reached load 62 and the owner's server
 * stopped answering. The rule written that evening was a directory, `~/.cache/mole-office/suite.lock`,
 * taken with `mkdir`, and four more, `test-slots/slot-1..4`, for browser test files. Each was amended
 * three times the same night because an agent read the holder wrong (a pid where the group belonged,
 * a shell that had already exited, a lock deleted by a run that had lost it), and in September the
 * scripts that kept them were lost. A rule an agent has to follow correctly under time pressure is
 * not a mechanism. Decision R7(2): the office keeps these seats, and a
 * sandbox or a script asks it for one before heavy work.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A SLOT IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * A slot is a row in the resource ledger, type `slot`. It is held by a PROCESS GROUP, recorded as
 * the group id and the start time of the group's leader, and it ends when that group ends:
 * `slotHolderLiveness` in lib/resources.ts is the one reading of that. There is no timer, no lease
 * to renew and no expiry. The resource leases withdrawn by a decision, over-design met
 * before any need, were renewed on a clock; a slot is not, because the thing the seat protects is the running
 * group itself, and the group's own life is the only honest clock for it.
 *
 * A row waits in line with the pool's name as its key and is given a seat by having its key changed
 * to `<pool>#<seat>`. The line is the order the rows were written. Nothing here is kept in memory, so
 * a server restart (which every merge causes) loses no place in any line.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN A SEAT IS HANDED ON
 * ---------------------------------------------------------------------------------------
 *
 * Only on a write: every acquire and every release first gives back the seats and places in line
 * whose process group has ended, then seats the first ones waiting. A waiter asks again every few
 * seconds (node tools/slot.mjs does), so a seat freed by a group that died is handed on at the next
 * ask. `GET /api/slots` reads and changes nothing; it names a seat whose group has ended as such.
 *
 * BOTH POOLS' SIZES ARE GATE ROWS. "One full suite at a time on this machine" is what the evening of
 * 11 September decided, so the row `whole-suite-seats` holds one unless the person changes it, and
 * only the person may. The browser pool's size is a judgement about this machine's inotify instances
 * and memory, so it is the row `browser-test-seats`. A new ask that has to wait is counted on its
 * pool's row.
 *
 * A BATCH OF NAMED TEST FILES (node tools/run-named-tests.mjs) TAKES A SEAT IN `test-batches`, three by default, the
 * row `test-batch-seats`. That pool also waits on the machine: no new seat is handed out while the one-minute load is
 * above the row `test-batch-load-limit`, or while the root file system has fewer gigabytes free than the row
 * `test-batch-disk-limit`. A seat already held is never taken back for either. A figure this machine cannot read holds
 * nothing back, because a batch must never wait on a number nobody can read; the answer says which limit was not
 * checked, and why. A new ask that waits only because of a limit is counted on that limit's row.
 *
 * GIVING BACK A SEAT THAT IS STILL IN USE is the gate `giving-back-a-held-seat`. At block a caller
 * other than the asking session needs `force`. At off it does not, and the row's note says the gate
 * was off.
 */

import { gateNamed } from '../../config/gates.mjs'
import { gateNumber, gatePosition } from '../../config/settings.mjs'
import { moleOffice } from '@shared/participants.ts'
import { sqlite } from '../db/client.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { type Actor } from './records.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'
import {
  callerIsTheOwningSession,
  closeRowThatStoppedMatching,
  liveRowById,
  liveSlotRowsOfPool,
  osProbe,
  registerResource,
  seatTheSlotRow,
  theGroupThatWouldHoldASlot,
  theRowIsAboutThisProcess,
  type Liveness,
  type ResourceReport,
  type SessionView,
  type SlotHolder,
} from './resources.ts'

/** The office, as the actor that gives back a dead group's seat and seats the next in line. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
// ============================================================================ the pools

/** One pool of seats: its name, how many seats it has, and what it is for. */
export interface SlotPool {
  name: string
  capacity: number
  what: string
}

/** The pools, by name. A name not here is refused, so a misspelt pool never becomes a pool of its own. */
export const SLOT_POOL_NAMES = ['full-suite', 'browser-tests', 'test-batches'] as const

function browserTestSeats(): number {
  try {
    return gateNumber('browser-test-seats')
  } catch (error) {
    // The row's own sentence names the setting, what it holds and the numbers it may hold.
    throw new PanelError(
      `${(error as Error).message} The browser-tests pool has no size, so no seat can be handed out. Change browser test seats on the Gates panel.`,
      500,
    )
  }
}

function wholeSuiteSeats(): number {
  try {
    return gateNumber('whole-suite-seats')
  } catch (error) {
    throw new PanelError(
      `${(error as Error).message} The full-suite pool has no size, so no seat can be handed out. Change whole suite seats on the Gates panel.`,
      500,
    )
  }
}

function testBatchSeats(): number {
  try {
    return gateNumber('test-batch-seats')
  } catch (error) {
    throw new PanelError(
      `${(error as Error).message} The test-batches pool has no size, so no seat can be handed out. Change test batch seats on the Gates panel.`,
      500,
    )
  }
}

/** Every pool, with its size read now. */
export function slotPools(): SlotPool[] {
  return [
    {
      name: 'full-suite',
      capacity: wholeSuiteSeats(),
      what: `A whole test suite. ${gateNamed('whole-suite-seats').setting} says how many may run at once on this machine. One is the default, because two at once stopped the person's server on 11 September 2026.`,
    },
    {
      name: 'browser-tests',
      capacity: browserTestSeats(),
      what: `A test file that starts a browser. ${gateNamed('browser-test-seats').setting} says how many may run at once on this machine.`,
    },
    {
      name: 'test-batches',
      capacity: testBatchSeats(),
      what:
        `A batch of named test files, as node tools/run-named-tests.mjs runs them. ${gateNamed('test-batch-seats').setting} ` +
        `says how many may run at once on this machine. No new seat is handed out while the one-minute load is above ` +
        `${gateNamed('test-batch-load-limit').setting}, or while the root file system has fewer gigabytes free than ` +
        `${gateNamed('test-batch-disk-limit').setting}.`,
    },
  ]
}

function poolNamed(name: string): SlotPool {
  const pools = slotPools()
  const found = pools.find((p) => p.name === name)
  if (found === undefined) {
    throw new PanelError(
      `There is no slot pool called "${name}". The pools are ${pools
        .map((p) => `${p.name} (${p.capacity} ${p.capacity === 1 ? 'seat' : 'seats'})`)
        .join(' and ')}.`,
    )
  }
  return found
}

/** The seat a key names, or null for a row still waiting in line. */
function seatOf(key: string): number | null {
  const at = key.lastIndexOf('#')
  if (at < 0) return null
  const n = Number(key.slice(at + 1))
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** The pool a key belongs to, seated or waiting. */
function poolOfKey(key: string): string {
  const at = key.lastIndexOf('#')
  return at < 0 ? key : key.slice(0, at)
}

// ============================================================================ a busy machine

/** One limit a new test-batch seat waits on, as read now. */
export interface MachineLimit {
  /** The gate row that sets the limit. */
  gate: 'test-batch-load-limit' | 'test-batch-disk-limit'
  /** `holds`: the figure is past the limit. `clear`: it is not. `unchecked`: the figure could not be read, so it holds nothing back. */
  state: 'holds' | 'clear' | 'unchecked'
  /** The limit, as the gate row holds it: a load, or gigabytes of 1,000,000,000 bytes. */
  limit: number
  /** The limit in one sentence: the figure read and the limit, or why it was not checked. */
  says: string
}

/** A limit's gate number, read by `read`, which names its own row so the row's reading site can be found. */
function aLimit(read: () => number, what: string): number {
  try {
    return read()
  } catch (error) {
    throw new PanelError(
      `${(error as Error).message} The test-batches pool has no ${what} limit, so no seat can be handed out. ` +
        `Change the test batch ${what} limit on the Gates panel.`,
      500,
    )
  }
}

/**
 * THE MACHINE'S TWO LIMITS ON A NEW TEST-BATCH SEAT, read now through the probe. The load is shown rounded up and the
 * free space rounded down, so a figure that holds a seat back is never shown on the wrong side of its limit.
 */
function theMachineLimits(): MachineLimit[] {
  const probe = osProbe()
  const loadLimit = aLimit(() => gateNumber('test-batch-load-limit'), 'load')
  const diskLimit = aLimit(() => gateNumber('test-batch-disk-limit'), 'free-space')

  let load: MachineLimit
  const reading = probe.machineNow === undefined ? undefined : probe.machineNow()
  if (reading === undefined || reading.loadOneMinute === null) {
    const why =
      reading === undefined
        ? `this machine's probe (${probe.platform}) has no reading of the one-minute load`
        : 'the one-minute load could not be read'
    load = {
      gate: 'test-batch-load-limit',
      state: 'unchecked',
      limit: loadLimit,
      says: `The load limit of ${loadLimit} was not checked, because ${why}. It holds no seat back.`,
    }
  } else {
    const shown = (Math.ceil(reading.loadOneMinute * 100) / 100).toFixed(2)
    load =
      reading.loadOneMinute > loadLimit
        ? { gate: 'test-batch-load-limit', state: 'holds', limit: loadLimit, says: `The one-minute load is ${shown}, above the limit of ${loadLimit}.` }
        : { gate: 'test-batch-load-limit', state: 'clear', limit: loadLimit, says: `The one-minute load is ${shown}, within the limit of ${loadLimit}.` }
  }

  let disk: MachineLimit
  const free = probe.rootFreeBytes === undefined ? undefined : probe.rootFreeBytes()
  if (free === undefined || free === null) {
    const why =
      free === undefined
        ? `this machine's probe (${probe.platform}) has no reading of the root file system's free space`
        : "the root file system's free space could not be read"
    disk = {
      gate: 'test-batch-disk-limit',
      state: 'unchecked',
      limit: diskLimit,
      says: `The free-space limit of ${diskLimit} GB was not checked, because ${why}. It holds no seat back.`,
    }
  } else {
    const shown = (Math.floor(free / 1e8) / 10).toFixed(1)
    disk =
      free < diskLimit * 1e9
        ? { gate: 'test-batch-disk-limit', state: 'holds', limit: diskLimit, says: `The root file system has ${shown} GB free, below the limit of ${diskLimit} GB.` }
        : { gate: 'test-batch-disk-limit', state: 'clear', limit: diskLimit, says: `The root file system has ${shown} GB free, within the limit of ${diskLimit} GB.` }
  }
  return [load, disk]
}

/** The limits a pool waits on: the machine's two for test-batches, none for the others. */
function limitsOf(pool: SlotPool): MachineLimit[] {
  return pool.name === 'test-batches' ? theMachineLimits() : []
}

/** What a holding limit, and a limit nobody could check, say to a waiter or a reader. */
function whatTheLimitsSay(machine: MachineLimit[]): string[] {
  const holding = machine.filter((m) => m.state === 'holds')
  return [
    ...(holding.length === 0
      ? []
      : ['No new seat is handed out while the machine is this busy.', ...holding.map((m) => m.says)]),
    ...machine.filter((m) => m.state === 'unchecked').map((m) => m.says),
  ]
}

// ============================================================================ what is read back

/** One slot row, as the doors hand it out. */
export interface SlotView {
  id: string
  pool: string
  /** `granted` holds a seat; `queued` is waiting in line. */
  state: 'granted' | 'queued'
  /** The seat, from 1, when granted. */
  seat: number | null
  /** The place in line, from 1, when queued. */
  position: number | null
  /** The process group holding it, and whether it is still running now. */
  holder: { pgid: number | null; leaderStartedAt: string | null; liveness: Liveness }
  sessionRecordId: string
  session: SessionView
  /** The project of the session that asked. The pools are the machine's, so a pool lists every project's rows. */
  workspaceId: string
  askedAt: string
  detail: string
}

/** One pool as it is now. */
export interface PoolView extends SlotPool {
  /** The seats taken, by seat number. */
  held: SlotView[]
  /** The line, first first. */
  waiting: SlotView[]
  /** Seat numbers no live row holds. */
  freeSeats: number[]
  /** The machine's limits on a new seat, read now. Only test-batches has any. */
  machine: MachineLimit[]
  /** The pool in one or two sentences. */
  says: string
}

function viewOf(report: ResourceReport, workspaceId: string, position: number | null): SlotView {
  const seat = seatOf(report.key)
  return {
    id: report.id,
    pool: poolOfKey(report.key),
    state: seat === null ? 'queued' : 'granted',
    seat,
    position: seat === null ? position : null,
    holder: { pgid: report.pgid, leaderStartedAt: report.osStartedAt, liveness: report.liveness },
    sessionRecordId: report.sessionRecordId,
    session: report.session,
    workspaceId,
    askedAt: report.registeredAt,
    detail: report.detail,
  }
}

function poolView(pool: SlotPool, machine: MachineLimit[] = limitsOf(pool)): PoolView {
  const rows = liveSlotRowsOfPool(pool.name)
  const held = rows
    .filter((r) => seatOf(r.report.key) !== null)
    .map((r) => viewOf(r.report, r.workspaceId, null))
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
  const waiting = rows
    .filter((r) => seatOf(r.report.key) === null)
    .map((r, i) => viewOf(r.report, r.workspaceId, i + 1))
  const taken = new Set(held.map((s) => s.seat))
  const freeSeats: number[] = []
  for (let n = 1; n <= pool.capacity; n += 1) if (!taken.has(n)) freeSeats.push(n)

  const said = [
    `${pool.name}: ${held.length} of ${pool.capacity} ${pool.capacity === 1 ? 'seat' : 'seats'} taken, ` +
      `${waiting.length} waiting.`,
  ]
  const ended = [...held, ...waiting].filter((s) => s.holder.liveness.state === 'gone').length
  if (ended > 0) {
    said.push(
      `${ended} of these ${ended === 1 ? 'belongs' : 'belong'} to a process group that has ended; the office gives ` +
        `${ended === 1 ? 'it' : 'them'} back at the next acquire or release.`,
    )
  }
  const unknown = [...held, ...waiting].filter((s) => s.holder.liveness.state === 'unknown').length
  if (unknown > 0) {
    said.push(
      `${unknown} cannot be checked, so ${unknown === 1 ? 'it keeps its place' : 'they keep their places'} until ` +
        'given back by hand; each one says why.',
    )
  }
  const above = held.filter((s) => (s.seat ?? 0) > pool.capacity).length
  if (above > 0) {
    said.push(
      `${above} ${above === 1 ? 'seat is' : 'seats are'} numbered above the pool's size of ${pool.capacity}, which was ` +
        'lowered after they were granted; no new seat is handed out until enough are given back.',
    )
  }
  said.push(...whatTheLimitsSay(machine))
  return { ...pool, held, waiting, freeSeats, machine, says: said.join(' ') }
}

/** Every pool, as it is now. It reads and changes nothing. */
export function slotsNow(): { checkedAt: string; platform: string; pools: PoolView[] } {
  return { checkedAt: now(), platform: osProbe().platform, pools: slotPools().map((pool) => poolView(pool)) }
}

// ============================================================================ handing on

/**
 * GIVE BACK WHAT A DEAD GROUP HELD, THEN SEAT THE FIRST ONES WAITING. Returns a sentence per act.
 *
 * While one of the machine's limits holds, nobody waiting is seated; a seat already held stays held.
 *
 * A waiter whose group cannot be checked (`unknown`) is passed over rather than seated: a seat given
 * to a row nobody can say is alive may be a seat nobody is sitting in, which starves the ones behind
 * it. It keeps its place in line and the pool says so.
 */
function settle(pool: SlotPool, machine: MachineLimit[]): string[] {
  const said: string[] = []
  const staying: { report: ResourceReport; workspaceId: string }[] = []
  for (const row of liveSlotRowsOfPool(pool.name)) {
    if (row.report.liveness.state === 'gone') {
      closeRowThatStoppedMatching(
        row.report.id,
        row.workspaceId,
        `given back by the office, because the process group holding it has ended: ${row.report.liveness.detail}`,
        theOffice(),
      )
      said.push(`${row.report.key} (${row.report.id}) was given back, because the process group holding it has ended.`)
      continue
    }
    staying.push(row)
  }
  const taken = new Set(staying.map((r) => seatOf(r.report.key)).filter((n): n is number => n !== null))
  const free: number[] = []
  for (let n = 1; n <= pool.capacity; n += 1) if (!taken.has(n)) free.push(n)
  const waiters = machine.some((m) => m.state === 'holds')
    ? []
    : staying.filter((r) => seatOf(r.report.key) === null && r.report.liveness.state === 'alive')
  for (let i = 0; i < Math.min(free.length, waiters.length); i += 1) {
    const waiter = waiters[i] as { report: ResourceReport; workspaceId: string }
    const seat = free[i] as number
    seatTheSlotRow(waiter.report.id, waiter.workspaceId, `${pool.name}#${seat}`, theOffice())
    said.push(`${waiter.report.id} was given seat ${seat} of ${pool.name}.`)
  }
  return said
}

// ============================================================================ asking for a seat

/** Which process group will hold the seat: a pid in it on this machine, or its process row. */
export type HolderNamed = { pid: number; startedAt?: string } | { resource: string }

export interface AcquireInput {
  workspaceId: string
  sessionRecordId: string
  pool: string
  holder: HolderNamed
  detail?: string
  actor: Actor
}

/**
 * The asker's own row, and only what a caller reads of it. `GET /api/slots` still answers every row of every pool,
 * with its holder, its session and its detail; an ask a waiter repeats every few seconds must not carry the pool.
 */
export interface AcquireSlotView {
  id: string
  pool: string
  state: 'granted' | 'queued'
  seat: number | null
  position: number | null
}

export interface AcquireAnswer {
  slot: AcquireSlotView
  /** The machine limits, which the merge tool names while it waits. Only test-batches has any. */
  pool: { machine: MachineLimit[] }
  /** `new` when this request put a row in line, `again` when this group already had one. */
  asked: 'new' | 'again'
  says: string
}

/**
 * THE GROUP A PROCESS ROW NAMES. For a caller inside a sandbox's container, whose own pid means
 * nothing on this machine: its process row was registered with the pid this machine uses.
 */
function holderFromProcessRow(id: string, workspaceId: string): SlotHolder {
  const found = liveRowById(id, workspaceId)
  if (found === null) {
    throw new PanelError(
      `No live ledger row ${id} is in this project, so it cannot name the process group that would hold the slot.`,
      404,
    )
  }
  if (found.entry.type !== 'process') {
    throw new PanelError(
      `Row ${id} is a ${found.entry.type} row. A slot is held by a process group, so name a process row, or a pid.`,
    )
  }
  const pid = Number(found.entry.key)
  const live = osProbe().processById(pid)
  if (live === null || theRowIsAboutThisProcess(found.entry.osStartedAt, live).same !== true) {
    throw new PanelError(
      `The process row ${id} names pid ${pid}, and that process ${live === null ? 'is not running' : 'cannot be ' +
        'confirmed to be the one the row was written about'}, so it cannot hold a slot.`,
      409,
    )
  }
  return theGroupThatWouldHoldASlot(pid)
}

/**
 * ASK FOR A SEAT. The answer is `granted` with a seat, or `queued` with a place in line.
 *
 * Asking again for the same process group is the same request, not a second one: it answers with
 * the row that group already has. That is how a waiter polls, and it is what hands a freed seat on.
 *
 * ONE PLACE IN ONE LINE PER SESSION. A session already waiting in this pool for another group is
 * refused: the partial unique index on the ledger allows one live row per session and key, and the
 * old slot rule said the same thing in words (a slot is taken per run, by the run itself).
 */
export function acquireSlot(input: AcquireInput): AcquireAnswer {
  const pool = poolNamed(input.pool)
  const holder =
    'resource' in input.holder
      ? holderFromProcessRow(input.holder.resource, input.workspaceId)
      : theGroupThatWouldHoldASlot(input.holder.pid, input.holder.startedAt)

  return sqlite
    .transaction((): AcquireAnswer => {
      const before = liveSlotRowsOfPool(pool.name)
      const mine = before.find(
        (r) => r.report.pgid === holder.member.pgid && r.report.osStartedAt === holder.leader.startedAt,
      )
      let id: string
      let asked: 'new' | 'again'
      if (mine !== undefined) {
        id = mine.report.id
        asked = 'again'
      } else {
        const inLine = before.find(
          (r) => r.report.sessionRecordId === input.sessionRecordId && r.report.key === pool.name,
        )
        if (inLine !== undefined) {
          throw new PanelError(
            `This session is already in line for ${pool.name} as ${inLine.report.id}, for process group ` +
              `${String(inLine.report.pgid)}. A session waits in one line once: wait for that one, or leave the line ` +
              `with POST /api/slots/${inLine.report.id}/release, and then ask for this group.`,
            409,
          )
        }
        id = registerResource({
          workspaceId: input.workspaceId,
          sessionRecordId: input.sessionRecordId,
          type: 'slot',
          key: pool.name,
          ...(input.detail === undefined ? {} : { detail: input.detail }),
          slotHolder: holder,
          actor: input.actor,
        }).id
        asked = 'new'
      }

      const machine = limitsOf(pool)
      settle(pool, machine)
      const view = poolView(pool, machine)
      const slot = [...view.held, ...view.waiting].find((s) => s.id === id)
      if (slot === undefined) {
        throw new PanelError(
          `Process group ${holder.member.pgid} ended while it was being put in line for ${pool.name}, so the office ` +
            'gave its place back at once. Nothing holds a seat for it.',
          409,
        )
      }
      if (asked === 'new' && slot.state === 'queued' && pool.name === 'browser-tests') {
        gateMet('browser-test-seats', String(pool.capacity))
      }
      if (asked === 'new' && slot.state === 'queued' && pool.name === 'full-suite') {
        gateMet('whole-suite-seats', String(pool.capacity))
      }
      // A seat free and a limit holding means the limit made it wait; otherwise the seats did.
      const holding = view.freeSeats.length > 0 ? machine.filter((m) => m.state === 'holds') : []
      if (asked === 'new' && slot.state === 'queued' && pool.name === 'test-batches') {
        if (holding.length === 0) gateMet('test-batch-seats', String(pool.capacity))
        for (const m of holding) {
          if (m.gate === 'test-batch-load-limit') gateMet('test-batch-load-limit', String(m.limit))
          else gateMet('test-batch-disk-limit', String(m.limit))
        }
      }
      const seats = `${pool.capacity} ${pool.capacity === 1 ? 'seat' : 'seats'}`
      const says = [
        slot.state === 'granted'
          ? `Granted: seat ${String(slot.seat)} of ${pool.capacity} in ${pool.name}, held by process group ` +
            `${String(slot.holder.pgid)} until it is given back or the group ends.`
          : `Queued: number ${String(slot.position)} in line for ${pool.name}, which has ${seats}, ` +
            `${holding.length === 0 ? 'all taken' : `${view.held.length} taken`}. Ask again with the same group to learn ` +
            'when it is granted; the place is kept while the group runs.',
        ...whatTheLimitsSay(machine),
      ].join(' ')
      return {
        slot: { id: slot.id, pool: slot.pool, state: slot.state, seat: slot.seat, position: slot.position },
        pool: { machine },
        asked,
        says,
      }
    })
    .immediate()
}

// ============================================================================ giving a seat back

export interface ReleaseSlotInput {
  workspaceId: string
  force?: boolean
  note?: string
  actor: Actor
}

export interface ReleaseSlotAnswer {
  released: true
  id: string
  /** The seat or the line it left, e.g. `full-suite#1` or `browser-tests`. */
  key: string
  /** Why it was given back, as the row now says. */
  note: string
  pool: PoolView | null
  handedOn: string[]
  says: string
}

/** How the note ends on a seat given back without force while its group runs, because the gate was off. */
export const BECAUSE_THE_GATE_WAS_OFF = ', because the gate on giving back a held seat was off'

/**
 * GIVE A SEAT BACK, OR LEAVE THE LINE. Nothing is signalled.
 *
 * The session that asked may always give it back. Anybody may give back a seat whose process group
 * has ended. Anybody else needs `force`, because giving back a seat that is still in use lets a
 * second suite start beside the first, which is the accident this exists to prevent; `force` is
 * written into the row's note. That need is the gate `giving-back-a-held-seat`: at off it is not
 * asked, and the note says the gate was off instead.
 */
export function releaseSlot(id: string, input: ReleaseSlotInput): ReleaseSlotAnswer {
  return sqlite
    .transaction((): ReleaseSlotAnswer => {
      const found = liveRowById(id, input.workspaceId)
      if (found === null) {
        throw new PanelError(
          `No live slot ${id} is in this project. It may have been given back already; GET ` +
            '/api/resources?includeReleased=true lists the ended rows with who ended them.',
          404,
        )
      }
      const entry = found.entry
      if (entry.type !== 'slot') {
        throw new PanelError(
          `${id} is a ${entry.type} row, not a slot. POST /api/resources/${id}/release is the door for that.`,
        )
      }
      const poolName = poolOfKey(entry.key)
      const current = liveSlotRowsOfPool(poolName).find((r) => r.report.id === id)
      const liveness: Liveness = current?.report.liveness ?? { state: 'unknown', reason: 'the row could not be read again' }
      const own = callerIsTheOwningSession(input.actor, entry, input.workspaceId)
      let why: string
      if (own) {
        why = 'given back by the session that asked for it'
      } else if (liveness.state === 'gone') {
        why = 'given back after the process group holding it had ended'
      } else if (input.force === true) {
        why =
          'given back with force by a caller other than the session that asked for it, while its process group ' +
          `was ${liveness.state === 'alive' ? 'still running' : 'in a state nobody could check'}`
      } else {
        const position = gatePosition('giving-back-a-held-seat')
        const met = () => gateMet('giving-back-a-held-seat', position!)
        if (position === 'block') {
          throw gateMetOnceTheWriteIsTakenBack(
            new PanelError(
              `Slot ${id} (${entry.key}) belongs to session ${entry.sessionRecordId}, and its process group ` +
                `${String(entry.pgid)} is ${liveness.state === 'alive' ? 'still running' : 'in a state nobody could check'}. ` +
                'Giving it back from here could let a second run start beside that one. Ask that session to give it ' +
                'back, stop the group by its own process row, or send {"force": true} if you know the group is not ' +
                'using it.',
              409,
            ),
            met,
          )
        }
        met()
        why =
          'given back without force by a caller other than the session that asked for it, while its process group ' +
          `was ${liveness.state === 'alive' ? 'still running' : 'in a state nobody could check'}` + BECAUSE_THE_GATE_WAS_OFF
      }
      const note = [input.note?.trim(), why].filter((s): s is string => s !== undefined && s !== '').join('; ')
      closeRowThatStoppedMatching(id, input.workspaceId, note, input.actor)

      const pool = slotPools().find((p) => p.name === poolName)
      const machine = pool === undefined ? [] : limitsOf(pool)
      const handedOn = pool === undefined ? [] : settle(pool, machine)
      const view = pool === undefined ? null : poolView(pool, machine)
      const seat = seatOf(entry.key)
      const says =
        (seat === null ? `Left the line for ${poolName}.` : `Gave back seat ${seat} of ${poolName}.`) +
        (handedOn.length === 0 ? '' : ` ${handedOn.join(' ')}`)
      return { released: true, id, key: entry.key, note, pool: view, handedOn, says }
    })
    .immediate()
}
