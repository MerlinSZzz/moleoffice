// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ITEMS OF ONE LINE'S BACKLOG, in the line's order. Wave 13s round 142, item 38 of the line's requirements.
 *
 * A backlog item is a record of kind `backlog_item` (KIND_SPECS.backlog_item in src/shared/kinds.ts). A round reads its
 * own line's items and not the whole backlog, so the read asks the database for the items whose `line` is exactly the
 * words asked for, in one project, and leaves the deleted ones out. The order is `inTheLinesOrder` in
 * src/shared/backlog.ts. src/server/api/backlog.ts is the door.
 *
 * THE POINTS OF A DECISION (round 234) are the other side of the same kind. A requirement becomes a decision and, in
 * one act, the decision's points are filed as backlog items whose `fromDecision` is that decision's id. The read
 * `thePointsOfADecision` answers them in the line's order, and `fileThePointsOfADecision` files them all or none.
 */
import { sql } from 'drizzle-orm'

import { BACKLOG_ITEM_KIND, inTheLinesOrder } from '@shared/backlog.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { PanelRecord } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { participantForActor } from './participant-for-actor.ts'
import { createRecord, getRecord, listRecords, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/** The live items of this project whose line is exactly `line`, in the line's order. */
export function theItemsOfALine(workspaceId: string, line: string): PanelRecord[] {
  return listRecords({
    workspaceId,
    kind: BACKLOG_ITEM_KIND,
    alsoWhere: sql`json_extract(${records.data}, '$.line') = ${line}`,
  }).sort(inTheLinesOrder)
}

/** Every live item of this project whose stored `fromDecision` is exactly `decisionId`, in the line's order. */
export function thePointsOfADecision(workspaceId: string, decisionId: string): PanelRecord[] {
  return listRecords({
    workspaceId,
    kind: BACKLOG_ITEM_KIND,
    alsoWhere: sql`json_extract(${records.data}, '$.fromDecision') = ${decisionId}`,
  }).sort(inTheLinesOrder)
}

/** What one point of a decision says. The three optional parts are written exactly when the caller gave them. */
interface APointToFile {
  number: string
  why: string
  doneWhen?: string
  files?: string[]
  order?: number
}

/** The decision `decisionId` names in this project, refusing anything that is not a decision here. */
function theDecisionInThisProject(decisionId: string, workspaceId: string): PanelRecord {
  const decision = getRecord(decisionId)
  if (decision === null || decision.workspaceId !== workspaceId) {
    throw new PanelError(
      `There is no record with id ${decisionId} in this project, so it has no points to read or file. ` +
        'Nothing was written.',
      400,
    )
  }
  if (decision.kind !== 'decision') {
    throw new PanelError(
      `"${decision.title}" is a ${kindWord(decision.kind).text}, not a decision, and only a decision has ` +
        'points. Nothing was written.',
      400,
    )
  }
  return decision
}

/** Read one point, refusing anything the write below could not store as a point. */
function aPointToFile(value: unknown, alreadyUsed: Set<string>): APointToFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PanelError(
      'Every point must be an object with a number and a why. Nothing was written.',
      400,
    )
  }
  const point = value as Record<string, unknown>
  const number = point['number']
  if (typeof number !== 'string' || number.trim() === '') {
    throw new PanelError('Every point needs a number, as a non-empty string. Nothing was written.', 400)
  }
  const trimmedNumber = number.trim()
  if (alreadyUsed.has(trimmedNumber)) {
    throw new PanelError(
      `The number "${trimmedNumber}" is used twice in this call, and a point's number names it once. ` +
        'Nothing was written.',
      400,
    )
  }
  alreadyUsed.add(trimmedNumber)

  const why = point['why']
  if (typeof why !== 'string' || why.trim() === '') {
    throw new PanelError(
      `Point "${trimmedNumber}" has no why, so nobody could tell why it was placed. Nothing was written.`,
      400,
    )
  }

  const files = point['files']
  if (files !== undefined) {
    if (!Array.isArray(files) || !files.every((file) => typeof file === 'string' && file.trim() !== '')) {
      throw new PanelError(
        `The files of point "${trimmedNumber}" must be an array of non-empty paths. Nothing was written.`,
        400,
      )
    }
  }

  const order = point['order']
  if (order !== undefined && (typeof order !== 'number' || !Number.isFinite(order))) {
    throw new PanelError(
      `The order of point "${trimmedNumber}" must be a finite number. Nothing was written.`,
      400,
    )
  }

  return {
    number,
    why,
    ...(point['doneWhen'] === undefined ? {} : { doneWhen: point['doneWhen'] as string }),
    ...(files === undefined ? {} : { files: files as string[] }),
    ...(order === undefined ? {} : { order: order as number }),
  }
}

/**
 * FILE A DECISION'S POINTS IN ONE ACT. Every check runs before anything is written, and the writes are one
 * transaction, so a call either files every point it named or writes nothing at all.
 *
 * WHO PLACED THEM is the caller: the person when the actor is the person, and otherwise the registry id the
 * caller's actor resolves to. A caller no registry row answers to is refused rather than named by a handle that
 * nothing holds. The points are filed as incomplete only when `doneWhen` is absent, because the file's own rows
 * need not say what finished means; the door's reply says so.
 */
export function fileThePointsOfADecision(input: {
  decisionId: string
  workspaceId: string
  line: string
  points: readonly unknown[]
  actor: Actor
}): PanelRecord[] {
  theDecisionInThisProject(input.decisionId, input.workspaceId)

  if (typeof input.line !== 'string' || input.line.trim() === '') {
    throw new PanelError('line is the line the points are in, as a non-empty string. Nothing was written.', 400)
  }
  const line = input.line.trim()

  if (!Array.isArray(input.points) || input.points.length === 0) {
    throw new PanelError('points must be a non-empty array of points. Nothing was written.', 400)
  }

  const usedNumbers = new Set<string>()
  const points = input.points.map((point) => aPointToFile(point, usedNumbers))

  let placedBy: { kind: 'person'; id: string } | { kind: 'agent'; id: string }
  if (input.actor.type === 'human') {
    placedBy = { kind: 'person', id: THE_PERSON }
  } else {
    const participant = participantForActor(input.actor)
    if (participant === null) {
      throw new PanelError(
        'Only the person or a registered agent can file a decision\'s points, and this caller is neither. ' +
          'Nothing was written.',
        400,
      )
    }
    placedBy = { kind: 'agent', id: participant.id }
  }

  return sqlite.transaction((): PanelRecord[] =>
    points.map((point) =>
      createRecord({
        kind: BACKLOG_ITEM_KIND,
        title: `Point ${point.number} of ${line}`,
        data: {
          line,
          number: point.number,
          placedBy,
          why: point.why,
          ...(point.doneWhen === undefined ? {} : { doneWhen: point.doneWhen }),
          ...(point.files === undefined ? {} : { files: point.files }),
          ...(point.order === undefined ? {} : { order: point.order }),
          state: 'todo',
          fromDecision: input.decisionId,
          source: `Decision ${input.decisionId}, point ${point.number}`,
        },
        workspaceId: input.workspaceId,
        actor: input.actor,
      }),
    ),
  )()
}
