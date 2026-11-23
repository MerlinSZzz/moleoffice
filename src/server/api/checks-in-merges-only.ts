// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE MESSAGE WORKER STARTS CHECKS IN MERGES-ONLY MODE, AND THE FORK BASES A SEAL IS REFUSED ON. Wave 13j round
 * loop-1. Built like the related-tests-first switch (./related-tests-first.ts). Both halves are remote: each setting
 * belongs to the office. The worker reads the GET half before it starts a check in merges-only mode.
 *
 *   GET  /api/office/checks-in-merges-only    whether it is on, and who chose
 *   POST /api/office/checks-in-merges-only    switch it on, for some projects, or off, or set how many checks run at once
 *   GET  /api/office/stale-fork-bases         the list
 *   PUT  /api/office/stale-fork-bases         replace the list
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING: who is asking, then the body and the reason, then the one column
 * or the one change row.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { CHECKS_AT_ONCE_BOUNDS, CHECKS_AT_ONCE_BY_DEFAULT, FREE_GIB_AT_LEAST, LOAD_UNDER } from '@shared/checks-in-merges-only.ts'
import {
  setTheChecksAtOnce,
  setTheProjectsChecksRunFor,
  setTheStaleForkBases,
  setWhetherChecksRunInMergesOnly,
  theChecksAtOnce,
  whetherChecksRunInMergesOnly,
  WITHIN_THE_BOUNDS,
  type ChecksInMergesOnly,
} from '../lib/checks-in-merges-only.ts'
import { theStaleForkBases } from '../lib/the-stale-fork-bases.ts'
import { sqlite } from '../db/client.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { osProbe } from '../lib/resources.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'
import { inspectorAnswerLinesAreConfigured } from '../lib/inspector-answers-lines.ts'

/** The door's refusal of a number of checks at once outside the bounds. */
const CHECKS_AT_ONCE_REFUSED = `checksAtOnce is a whole number ${WITHIN_THE_BOUNDS}, or null.`

const READ_NOTE =
  'Whether the message worker, in merges-only mode, also starts the checks the office asks for. Kept on the office\'s ' +
  'installation row. Read only, and no body is read. The reply is {on, nobodyChose, projects, says, limits, machine}. ' +
  'nobodyChose is true when nobody has switched it, and then it is off. projects is the list of project ids it is on for; ' +
  'it is null while it is off, and null while it is on means every project, because it was switched on before the switch ' +
  'could name projects. A worker of a project it does not name starts no check. The limits: at most limits.checksAtOnce checks at once, an office setting ' +
  `whose limits.checksAtOnceFrom is "set here" or "the default" (${String(CHECKS_AT_ONCE_BY_DEFAULT)}); a further check only ` +
  `while the one-minute load is under ${String(LOAD_UNDER)} and at least ${String(FREE_GIB_AT_LEAST)} GiB of memory is free; ` +
  'the first check always starts. machine is {loadOneMinute, freeBytes}, read by the office now; each is null where it ' +
  'could not be read, and a null refuses a further check. The worker asks this same reader before it starts a check.'

const SET_NOTE =
  'Switch checks in merges-only mode on or off, or set how many run at once, or both. Body {"on": true | false | null, ' +
  `"projects": ["<project id>", ...], "checksAtOnce": <a whole number ${WITHIN_THE_BOUNDS}> | null, "because": "<why>"}, with on, ` +
  'checksAtOnce or both. On is on for the projects named, and for the project of this request when none is named; ' +
  'projects is sent only with on: true, and each one is a project of this office. Off, or a null on, names no project. ' +
  'A null on ' +
  `takes the choice away again, which reads as off; a null checksAtOnce takes it away again, which reads as ${String(CHECKS_AT_ONCE_BY_DEFAULT)}. ` +
  'The owner may, with or without a reason. A secretary proved by its own key may, and must give a reason. Any other ' +
  'agent is refused. While the gate who-changes-the-merge-and-check-switches is off, any agent proved by its own key ' +
  'may too, with a reason, and is counted. Every change is kept with who, when and why (GET /api/office/setting-changes, as ' +
  'checks-in-merges-only, checks-in-merges-only-for and checks-at-once). The reply is the reading as it now stands.'

const BASES_READ_NOTE =
  'The fork bases a seal is refused on: full commit ids a round\'s branch must not start from. Read only. The reply is ' +
  '{bases}. Empty when nobody listed any.'

const BASES_SET_NOTE =
  'Replace the stale fork bases. Body {"bases": ["<40-character commit id>", ...] | null, "because": "<why>"}; null ' +
  'takes the list away. Who may: as POST /api/office/checks-in-merges-only, under the same gate. Every change is kept ' +
  'as stale-fork-bases. ' +
  'The reply is {bases} as it now stands.'

/** The machine's load and free memory as the office read them for this reply. */
type TheMachine = { loadOneMinute: number | null; freeBytes: number | null }

const setBody = z
  .strictObject({
    on: z.boolean({ error: 'on is true, false or null.' }).nullable().optional(),
    projects: z
      .array(z.string({ error: 'projects is a list of project ids.' }), { error: 'projects is a list of project ids.' })
      .max(100, { error: 'At most 100 projects.' })
      .optional(),
    checksAtOnce: z
      .number({ error: CHECKS_AT_ONCE_REFUSED })
      .int({ error: CHECKS_AT_ONCE_REFUSED })
      .min(CHECKS_AT_ONCE_BOUNDS.fewest, { error: CHECKS_AT_ONCE_REFUSED })
      .max(CHECKS_AT_ONCE_BOUNDS.most, { error: CHECKS_AT_ONCE_REFUSED })
      .nullable()
      .optional(),
    because: z.string().optional(),
  })
  .refine((body) => body.on !== undefined || body.checksAtOnce !== undefined, { error: 'Send on, checksAtOnce or both.' })

const basesBody = z.strictObject({
  bases: z.array(z.string(), { error: 'bases is a list of commit ids, or null.' }).max(100, { error: 'At most 100 stale fork bases.' }).nullable(),
  because: z.string().optional(),
})

/** The owner, or a secretary with a reason, may change either setting; any other agent may read them. */
function whoMayChangeIt(actor: Actor, what: string): { reasonRequired: boolean } {
  if (thePersonIsProved(actor)) return { reasonRequired: false }
  if (actor.theOwnersAuthority?.holds === true) return { reasonRequired: false }
  if (theKeyProvesASecretary(actor)) return { reasonRequired: true }
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-merge-and-check-switches lets any agent
  // its own key proves change it too, with a reason, and counts it, and the raise is not asked. At block the raise is
  // asked as before, and a change it carries is not counted.
  const position = gatePosition('who-changes-the-merge-and-check-switches')
  if (position === 'block' && aRaiseCarriesIt(actor)) return { reasonRequired: false }
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-changes-the-merge-and-check-switches', position!) !== 'block') return { reasonRequired: true }
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-merge-and-check-switches', `change ${what.charAt(0).toLowerCase()}${what.slice(1)}`)
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `${what} is changed by the owner or by a secretary with a reason, and this request was made by "${actor.id}", which is ` +
      `neither. Nothing was changed. ${inAWorld === null ? '' : `${inAWorld} `}A secretary is proved by its own key. ` +
      'Any agent may read the setting and may file a proposal about it.',
    403,
  )
}

function theReason(reasonRequired: boolean, because: string | undefined, what: string): string | null {
  const said = because?.trim() ? because.trim() : null
  if (reasonRequired && said === null) throw new PanelError(`A secretary who changes ${what} gives a reason, in "because". Nothing was changed.`, 400)
  return said
}

/**
 * THE PROJECTS A CHANGE SWITCHES IT ON FOR: those named, or the project the request is made from when none is named.
 * Null when it switches it off or takes the choice away. Refused, before anything is written, when projects come without
 * on: true, when the list is empty, or when one is not a project of this office.
 */
function theProjectsItIsOnFor(on: boolean | null | undefined, projects: string[] | undefined, from: string): string[] | null {
  if (projects !== undefined && on !== true) {
    throw new PanelError('projects is sent only with on: true, because a switch that is off is on for no project. Nothing was changed.', 400)
  }
  if (on !== true) return null
  if (projects === undefined) return [from]
  if (projects.length === 0) throw new PanelError('Name at least one project in projects, or leave it out to switch it on for this project. Nothing was changed.', 400)
  const unknown = projects.filter((one) => !isAProjectOnAList(one) || getWorkspace(one) === null)
  if (unknown.length > 0) {
    throw new PanelError(`${unknown.map((one) => JSON.stringify(one)).join(', ')} ${unknown.length === 1 ? 'is not a project' : 'are not projects'} of this office. Nothing was changed.`, 400)
  }
  return [...new Set(projects)]
}

/** The limits in force now: the number of checks at once is read from its setting on every call. */
function theLimits(): { checksAtOnce: number; checksAtOnceFrom: 'the default' | 'set here'; loadUnder: number; freeGibAtLeast: number; theFirstAlwaysStarts: true } {
  const atOnce = theChecksAtOnce()
  return { checksAtOnce: atOnce.checksAtOnce, checksAtOnceFrom: atOnce.from, loadUnder: LOAD_UNDER, freeGibAtLeast: FREE_GIB_AT_LEAST, theFirstAlwaysStarts: true }
}
type TheLimits = ReturnType<typeof theLimits>

export async function checksInMergesOnlyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/checks-in-merges-only',
    route('office.checks-in-merges-only', 'remote', READ_NOTE),
    async (): Promise<ChecksInMergesOnly & { limits: TheLimits; machine: TheMachine; inspectorAnswerLines: boolean }> => ({
      ...whetherChecksRunInMergesOnly(),
      limits: theLimits(),
      machine: osProbe().machineNow?.() ?? { loadOneMinute: null, freeBytes: null },
      inspectorAnswerLines: inspectorAnswerLinesAreConfigured(),
    }),
  )

  app.post(
    '/office/checks-in-merges-only',
    route('office.set-checks-in-merges-only', 'remote', SET_NOTE),
    async (req): Promise<ChecksInMergesOnly & { limits: TheLimits }> => {
      const actor = actorFrom(req)
      const { reasonRequired } = whoMayChangeIt(actor, 'Whether checks run in merges-only mode')
      const body = parse(setBody, req.body ?? {}, 'Whether checks run in merges-only mode')
      const because = theReason(reasonRequired, body.because, 'whether checks run in merges-only mode')
      const projects = theProjectsItIsOnFor(body.on, body.projects, workspaceOf(req))
      // ONE WRITE: the limits, the switch, its change row and the projects row. A writer here reads a stored row and
      // refuses one it cannot read, so a refusal must leave every other setting as it was.
      return sqlite.transaction(() => {
        // HOW MANY AT ONCE FIRST: its writer reads the stored row and refuses one it cannot read, so that refusal leaves
        // the switch as it was.
        if (body.checksAtOnce !== undefined) setTheChecksAtOnce(actor, body.checksAtOnce, because, workspaceOf(req))
        if (body.on !== undefined) {
          const before = whetherChecksRunInMergesOnly()
          const after = setWhetherChecksRunInMergesOnly(body.on)
          const chosen = (reading: ChecksInMergesOnly): boolean | null => (reading.nobodyChose ? null : reading.on)
          writeDownASettingChange(actor, {
            setting: 'checks-in-merges-only',
            field: 'whether checks run in merges-only mode',
            before: chosen(before),
            after: because === null ? chosen(after) : { on: chosen(after), because },
            workspaceId: workspaceOf(req),
          })
          setTheProjectsChecksRunFor(actor, projects, because, workspaceOf(req))
        }
        // THE REPLY IS READ HERE, inside the transaction: its reader also reads the projects row, and a row it refuses
        // must roll back the limit as well as the switch.
        return { ...whetherChecksRunInMergesOnly(), limits: theLimits() }
      })()
    },
  )

  app.get(
    '/office/stale-fork-bases',
    route('office.stale-fork-bases', 'remote', BASES_READ_NOTE),
    async (): Promise<{ bases: string[] }> => ({ bases: theStaleForkBases() }),
  )

  app.put(
    '/office/stale-fork-bases',
    route('office.set-stale-fork-bases', 'remote', BASES_SET_NOTE),
    async (req): Promise<{ bases: string[] }> => {
      const actor = actorFrom(req)
      const { reasonRequired } = whoMayChangeIt(actor, 'The list of stale fork bases')
      const body = parse(basesBody, req.body ?? {}, 'The stale fork bases')
      const because = theReason(reasonRequired, body.because, 'the stale fork bases')
      const before = theStaleForkBases()
      const after = setTheStaleForkBases(body.bases)
      writeDownASettingChange(actor, {
        setting: 'stale-fork-bases',
        field: 'the stale fork bases',
        before,
        after: because === null ? after : { bases: after, because },
        workspaceId: workspaceOf(req),
      })
      return { bases: after }
    },
  )
}
