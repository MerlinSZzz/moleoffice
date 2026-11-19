// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN LOAD: ITS READ TIME, CPU AND MEMORY, AND THE RANGES THEY ARE HELD AGAINST, from wave 13y
 * round 21.
 *
 *   GET  /api/office/load          the latest reading, the last hour, the ranges and where each number stands
 *   POST /api/office/load-ranges   change the top of one or more ranges
 *   GET  /api/office/load/calls    one operation's calls, grouped by who made them (wave 13y round 78)
 *
 * Built like the related-tests-first switch (src/server/api/related-tests-first.ts). Both halves are remote: the
 * numbers and the ranges belong to the office. The runtime page reads the GET half.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body and the reason,
 * and only then are the columns written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { OFFICE_LOAD_BOUNDS, OFFICE_LOAD_DEFAULTS, OFFICE_LOAD_NUMBERS, type OfficeLoad, type OfficeLoadNumber, type OfficeLoadRange } from '@shared/office-load.ts'
import { isOperationName } from '@shared/ops.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { oneOperationsCalls, setTheOfficeLoadRanges, theOfficeLoad, theOfficeLoadRanges, type OneOperationsCalls } from '../lib/office-load.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { theRequestWindows } from '../lib/what-is-kept.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'

const READ_NOTE =
  "The office's own load: its read time, CPU and memory, read once a minute by this server. " +
  'Read only, and no body is read. The reply is {latest, lastHour, ranges, standing, everySeconds, readingsInARow, ' +
  'serverStartedAt}. A reading is {at, reads, readMedianMs, readSlowestMs, cpuPercent, memoryMb}: the median and slowest ' +
  'time of the GET requests answered in the minute, leaving out those that wait on purpose (null when there were none); ' +
  "the process's own CPU time as a share of one core; its resident memory. Each range is {number, top, nobodyChose, " +
  'default}. Each standing is {number, value, outFor, outSince, toldIn}: how many readings in a row the number has been ' +
  'above its top, and the line the secretaries were told in. The readings are kept in this process, so they start again ' +
  'at a restart; latest is null until the first minute has passed.'

const SET_NOTE =
  'Change the top of one or more of the office\'s load ranges. Body {"readMs"?: n | null, "cpuPercent"?: n | null, ' +
  '"memoryMb"?: n | null, "because": "<why>"}, at least one number. A number left out is left as it is; null takes the ' +
  `choice away again, so the default is in force (readMs ${String(OFFICE_LOAD_DEFAULTS.readMs)}, cpuPercent ` +
  `${String(OFFICE_LOAD_DEFAULTS.cpuPercent)}, memoryMb ${String(OFFICE_LOAD_DEFAULTS.memoryMb)}). Each top is a whole ` +
  `number within its bounds (readMs ${OFFICE_LOAD_BOUNDS.readMs.join(' to ')}, cpuPercent ` +
  `${OFFICE_LOAD_BOUNDS.cpuPercent.join(' to ')}, memoryMb ${OFFICE_LOAD_BOUNDS.memoryMb.join(' to ')}). The owner may, ` +
  'with or without a reason. A secretary proved by its own key may, and must give a reason. Any other agent is refused. ' +
  'While the gate who-changes-the-merge-and-check-switches is off, any agent proved by its own key may too, with a ' +
  'reason, and is counted. ' +
  'Every change is kept with who, when and why (the newest is in GET /api/office/setting-changes, as office-load-ranges). ' +
  'The reply is the ranges as they now stand.'

const CALLS_NOTE =
  "One operation's calls in the project, grouped by who made them, so the caller that costs the time can be named. " +
  'Query: operation (an operation name, as GET /api/usage/operations gives it) and days (optional, from 1 to the kept ' +
  'window for traced calls, which is the default). Read only: it reads the timing records and records nothing. The ' +
  'reply is {operation, days, workspaceId, calls, foldedCalls, groups}. Each group is the calls with the same route, ' +
  'caller {type, id}, purpose, client {addr, origin} and targetIsTheirOwnRun (true when the call named the run it came ' +
  'from as its target, false for another target, null for none), with {calls, refused, waited, msMedian, msP95, ' +
  'msTotal, bytes}. refused is the calls answered with a status from 400 to 499; waited is the calls that waited on ' +
  'purpose, whose time is left out of the three times; msP95 is by the nearest rank. The dearest group comes first, by ' +
  'msTotal and then calls. foldedCalls is the calls counted by the hour where long-poll rows were: they carry no ' +
  'caller, so they are in no group, and calls plus foldedCalls is what GET /api/usage/operations counts.'

/** What a caller of the grouped calls may ask: one operation, and how many days back. */
function callsQueryFor(maxDays: number) {
  const anOperation = 'operation is the name of one of the office\'s operations, as GET /api/usage/operations gives it.'
  return z.strictObject({
    operation: z.string({ error: anOperation }).refine(isOperationName, { error: anOperation }),
    /** Bounded by the traced window, because nothing older survives the prune. */
    days: z.coerce.number().int().min(1).max(maxDays).optional(),
  })
}

/** One top: a whole number within its bounds, or null for nobody's choice. */
function aTop(number: OfficeLoadNumber): z.ZodType<number | null | undefined> {
  const [lowest, highest] = OFFICE_LOAD_BOUNDS[number]
  const says = `${number} is a whole number from ${String(lowest)} to ${String(highest)}, or null.`
  return z.number({ error: says }).int({ error: says }).min(lowest, { error: says }).max(highest, { error: says }).nullable().optional()
}

/** What a caller may send: one or more tops, and a reason. */
const setBody = z.strictObject({
  readMs: aTop('readMs'),
  cpuPercent: aTop('cpuPercent'),
  memoryMb: aTop('memoryMb'),
  because: z.string().optional(),
})

/**
 * THE OWNER, OR A SECRETARY WITH A REASON, MAY CHANGE A RANGE. The ranges are not the owner's decided numbers, so the
 * secretary card may change them (round 21 brief). Any other agent may read them and may file a proposal about them.
 *
 * The answer is whether a reason is required: the owner's press needs none, a secretary's change does.
 */
function whoMayChangeTheLoadRanges(actor: Actor): { reasonRequired: boolean } {
  if (thePersonIsProved(actor)) return { reasonRequired: false }
  if (actor.theOwnersAuthority?.holds === true) return { reasonRequired: false }
  if (theKeyProvesASecretary(actor)) return { reasonRequired: true }
  // A SECRETARY THE PERSON HAS RAISED holds the person's acts but a few. Asked last, so the
  // grant is named on the act only when nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-merge-and-check-switches lets any agent
  // its own key proves change it too, with a reason, and counts it, and the raise is not asked. At block the raise is
  // asked as before, and a change it carries is not counted.
  const position = gatePosition('who-changes-the-merge-and-check-switches')
  if (position === 'block' && aRaiseCarriesIt(actor)) return { reasonRequired: false }
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-changes-the-merge-and-check-switches', position!) !== 'block') return { reasonRequired: true }
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-merge-and-check-switches', 'change the office\'s load ranges')
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `The office's load ranges are changed by the owner or by a secretary with a reason, and this request was made by ` +
      `"${actor.id}", which is neither. Nothing was changed. ` +
      (inAWorld === null ? '' : `${inAWorld} `) +
      'A secretary is proved by its own key. Any agent may read the ranges and may file a proposal about them.',
    403,
  )
}

export async function officeLoadRoutes(app: FastifyInstance): Promise<void> {
  app.get('/office/load', route('office.load', 'remote', READ_NOTE), async (): Promise<OfficeLoad> => theOfficeLoad())

  app.get('/office/load/calls', route('office.load.calls', 'remote', CALLS_NOTE), async (req): Promise<OneOperationsCalls> => {
    const traced = theRequestWindows().traced.value
    const { operation, days } = parse(callsQueryFor(traced), req.query, 'The query string')
    return oneOperationsCalls(operation, days ?? traced, workspaceOf(req))
  })

  app.post(
    '/office/load-ranges',
    route('office.set-load-ranges', 'remote', SET_NOTE),
    async (req): Promise<OfficeLoadRange[]> => {
      const actor = actorFrom(req)
      const { reasonRequired } = whoMayChangeTheLoadRanges(actor)
      const body = parse(setBody, req.body ?? {}, "The office's load ranges")
      const tops: Partial<Record<OfficeLoadNumber, number | null>> = {}
      for (const number of OFFICE_LOAD_NUMBERS) if (body[number] !== undefined) tops[number] = body[number]
      if (Object.keys(tops).length === 0) {
        throw new PanelError(
          "A change to the office's load ranges names at least one of readMs, cpuPercent and memoryMb. Nothing was changed.",
          400,
        )
      }
      const because = body.because?.trim() ? body.because.trim() : null
      if (reasonRequired && because === null) {
        throw new PanelError(
          "A secretary who changes the office's load ranges gives a reason, in \"because\". Nothing was changed.",
          400,
        )
      }
      const before = theOfficeLoadRanges()
      const after = setTheOfficeLoadRanges(tops)
      // WHAT WAS CHOSEN, AND WHY: null is nobody having chosen, so the default is in force. Only the numbers named are
      // written down, and the reason goes with the new values.
      const chosen = (ranges: OfficeLoadRange[]): Partial<Record<OfficeLoadNumber, number | null>> =>
        Object.fromEntries(ranges.filter((r) => r.number in tops).map((r) => [r.number, r.nobodyChose ? null : r.top]))
      writeDownASettingChange(actor, {
        setting: 'office-load-ranges',
        field: "the office's load ranges",
        before: chosen(before),
        after: because === null ? chosen(after) : { ...chosen(after), because },
        workspaceId: workspaceOf(req),
      })
      return after
    },
  )
}
