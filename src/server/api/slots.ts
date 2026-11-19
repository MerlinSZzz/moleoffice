// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Slot routes: the machine's shared seats for heavy test work.
 *
 *   GET  /api/slots                 every pool, who holds each seat and who is waiting. A read: it
 *                                   hands nothing on.
 *   POST /api/slots/acquire         ask for a seat for a process group. Granted with a seat, or
 *                                   queued with a place in line; asking again for the same group
 *                                   answers about the same row.
 *   POST /api/slots/:id/release     give a seat back, or leave the line. Nothing is signalled, and
 *                                   the next in line is seated.
 *
 * The pools, the line and the rules are in lib/slots.ts, and the rows are the resource ledger's
 * (type `slot`). node tools/slot.mjs is the client a script or a sandbox calls.
 *
 * WHY ACQUIRE AND RELEASE STAY ON THIS MACHINE. The holder is a process group in this machine's
 * process table, and the seats are this machine's; a caller elsewhere naming a pid would be naming
 * a process on the wrong computer.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { acquireSlot, releaseSlot, slotsNow, type AcquireAnswer, type ReleaseSlotAnswer } from '../lib/slots.ts'
import { ownerSessionRecord } from './resources.ts'

const nonBlank = (what: string) =>
  z
    .string({ error: `${what} must be text` })
    .refine((s) => s.trim() !== '', { error: `${what} must not be blank — leave the key out instead` })

const acquireBody = z
  .strictObject({
    pool: z.string({ error: 'pool must be the name of a slot pool, as text' }).trim().min(1, { error: 'pool must not be empty' }),
    /** A process in the group that will hold the seat, numbered as this machine numbers it. */
    pid: z.number({ error: 'pid must be a number' }).int({ error: 'pid must be a whole number' }).positive({ error: 'pid must be 1 or more' }).optional(),
    /** When that pid's process started, as the caller read it. Checked, then discarded. */
    startedAt: nonBlank('startedAt').optional(),
    /** Or the group's process row in the ledger, for a caller whose own pid means nothing here. */
    resource: nonBlank('resource').optional(),
    sessionRecordId: nonBlank('sessionRecordId').optional(),
    /** What the seat is for, in a few words: "npm test in sv1-slots". */
    detail: nonBlank('detail').optional(),
  })
  .refine((b) => (b.pid === undefined) !== (b.resource === undefined), {
    error:
      'name the process group that will hold the slot in exactly one way: "pid" (a process in it, on this machine) ' +
      'or "resource" (its process row in the ledger, for a caller inside a sandbox)',
  })
  .refine((b) => b.startedAt === undefined || b.pid !== undefined, {
    error: 'startedAt is the start time of "pid", so it goes with pid',
  })

const releaseBody = z
  .strictObject({
    force: z.boolean({ error: 'force must be true or false' }).optional(),
    note: nonBlank('note').optional(),
  })
  .nullish()

const idParams = z.object({ id: z.string().trim().min(1, { error: 'the URL must contain a slot id' }) })

export async function slotRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/slots',
    route(
      'runtime.resources',
      'remote',
      "Every one of this machine's slot pools — a whole test suite, browser test files, batches of named test files — " +
        'with the seats taken, the process group holding each, the line waiting, and for test batches the load and ' +
        'free space read now against their limits. It reads and changes nothing.',
    ),
    async () => slotsNow(),
  )

  app.post(
    '/slots/acquire',
    route(
      'runtime.claim',
      'local',
      { because: 'acts-on-this-machine', act: "Asking for one of this computer's shared test seats" },
      'Ask for a seat in a slot pool for a process group, named by a pid in it or by its process row. Answers ' +
        'granted with a seat, or queued with a place in line; asking again for the same group answers about the ' +
        'same row. The seat is held until it is given back or the group ends. Refuses an unknown pool, a pid ' +
        'whose start time does not match, and a group whose leader has exited.',
    ),
    async (req): Promise<AcquireAnswer> => {
      const actor = actorFrom(req)
      const workspaceId = workspaceOf(req)
      const body = parse(acquireBody, req.body ?? {}, 'The request for a slot is not usable:')
      return acquireSlot({
        workspaceId,
        sessionRecordId: ownerSessionRecord(body.sessionRecordId, actor, workspaceId),
        pool: body.pool,
        holder:
          body.resource !== undefined
            ? { resource: body.resource }
            : { pid: body.pid as number, ...(body.startedAt === undefined ? {} : { startedAt: body.startedAt }) },
        ...(body.detail === undefined ? {} : { detail: body.detail }),
        actor,
      })
    },
  )

  app.post(
    '/slots/:id/release',
    route(
      'runtime.claim',
      'local',
      { because: 'acts-on-this-machine', act: "Giving back one of this computer's shared test seats" },
      'Give a slot back, or leave the line, and seat the next in line. Nothing is signalled. The session that ' +
        'asked may always; anybody may give back a slot whose process group has ended; anybody else needs ' +
        '{"force": true}, which the row records, unless the gate on giving back a held seat is off.',
    ),
    async (req): Promise<ReleaseSlotAnswer> => {
      const actor = actorFrom(req)
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const body = parse(releaseBody, req.body, 'The request body is not usable:')
      return releaseSlot(id, {
        workspaceId,
        ...(body?.force === undefined ? {} : { force: body.force }),
        ...(body?.note === undefined ? {} : { note: body.note }),
        actor,
      })
    },
  )
}
