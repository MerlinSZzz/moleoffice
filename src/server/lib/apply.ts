// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * APPLYING AN APPROVED DELTA TO THE PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR THINGS THIS HAS TO BE, AND THEY ARE THE REQUIREMENT VERBATIM
 * ---------------------------------------------------------------------------------------
 *
 * ATTRIBUTED. Every write goes through the ordinary record and planning write paths, with the
 * actor the request carried, so the change log says who did it in the same words as everything else.
 * There is no second write path here and nothing bypasses validation.
 *
 * WORKSPACE-SAFE. Every created record states its project and every existing record is read by id
 * and checked against the project the operation named. A delta may span projects — a plan does —
 * but it may never move a record between them or link across a boundary, and the ordinary link
 * validation refuses the second on its own.
 *
 * STALE-SAFE. Every operation that touches an existing record carries the version it was proposed
 * against. **An approved stale proposal must not overwrite newer canonical truth**, so a version
 * that has moved stops the whole apply before anything is written.
 *
 * TRUTHFUL ABOUT PARTIAL FAILURE — which this file answers by making partial failure impossible.
 * The whole delta runs inside ONE SQLite transaction. Anything that refuses rolls back everything,
 * and the reply says which operation refused and why. A change set that half-applied would leave a
 * project meaning something nobody approved, and no report about it afterwards could fix that.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES TO DO
 * ---------------------------------------------------------------------------------------
 *
 * It will not apply a delta whose proposal has not been SETTLED BY A HUMAN. That is checked by the
 * caller with the same rule `GET /api/needs-you` uses — a decision an agent linked is not an
 * approval — and it is why this function takes `approved` rather than working it out itself: the
 * governance question has one answer in one place.
 *
 * It will not apply a delta carrying an `unresolved` operation. An agent that could not work
 * something out said so, and applying the rest would silently answer the question by leaving it
 * out. The person resolves it and the delta is proposed again.
 */

import { sqlite } from '../db/client.ts'
import {
  createLink,
  createRecord,
  getRecord,
  patchRecord,
  versionOf,
  type Actor,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import { createAllocation } from './planning.ts'
import { deltaIn, newRef, summariseDelta, type Delta, type DeltaOp } from '@shared/delta.ts'
import type { RecordKind } from '@shared/types.ts'

/** Words for an operation whose requested value was already held. */
export function alreadySet(field: string, title: string): string {
  return `${field} on "${title}" was already set`
}

/** Words for a link that was already held. */
export function alreadyLinked(type: string): string {
  return `already linked ${type}`
}

/** What one operation did, so the reply can say it one line at a time. */
export interface AppliedOp {
  op: DeltaOp['op']
  says: string
  /** What it wrote, in the product's own vocabulary. Empty for the two that write nothing. */
  did: string
  /** The record or allocation it produced or touched, where there is one. */
  id: string | null
}

export interface ApplyResult {
  applied: true
  ops: AppliedOp[]
  /** Ids of everything created, so a caller can go and look at it. */
  created: string[]
  note: string
  nothingWritten?: string
}

/** The ordinary note for a request that wrote at least one thing. */
export function writtenApplyNote(ops: readonly AppliedOp[], created: readonly string[], actor: Actor): string {
  return `${ops.length} operation${ops.length === 1 ? '' : 's'} applied in one transaction — ` +
    `${created.length} record${created.length === 1 ? '' : 's'} created. Everything was written as ` +
    `${actor.type}:${actor.id}, through the ordinary write paths, so the change log reads like any ` +
    `other work.`
}

/**
 * A refusal that names WHICH operation stopped it, because a delta is a list and "it failed" is
 * not an answer a person can act on.
 */
export class ApplyRefused extends PanelError {
  constructor(
    readonly at: number,
    readonly operation: DeltaOp | null,
    why: string,
  ) {
    super(
      operation === null
        ? `Nothing was applied. ${why}`
        : `NOTHING WAS APPLIED. Operation ${at + 1} — "${operation.says}" — could not be made: ${why}\n\n` +
          `The whole change set is one transaction, so the project is exactly as it was. Fix the ` +
          `proposal and apply it again.`,
      409,
    )
  }
}

/**
 * Apply a delta.
 *
 * `approved` is the caller's answer to the governance question — see the header for why it is not
 * asked here. `actor` is the person; the route has already refused anything that is not an
 * explicitly stated human, under owner decision §36.
 */
export function applyDelta(
  proposalData: unknown,
  approved: boolean,
  actor: Actor,
): ApplyResult {
  const delta = deltaIn(proposalData)
  if (delta === null) {
    throw new ApplyRefused(0, null, 'This proposal carries no change set, so there is nothing to apply.')
  }
  if (!approved) {
    throw new ApplyRefused(
      0,
      null,
      'This proposal has not been settled by a person. A change set is applied only after the fork it ' +
        'belongs to has been decided, and only a human may decide one.',
    )
  }

  const summary = summariseDelta(delta)
  if (summary.unresolved > 0) {
    const open = delta.ops.filter((o) => o.op === 'unresolved')
    throw new ApplyRefused(
      0,
      null,
      `${summary.unresolved} thing${summary.unresolved === 1 ? '' : 's'} in this change set ` +
        `${summary.unresolved === 1 ? 'was' : 'were'} left unresolved on purpose, and applying the rest ` +
        `would answer ${summary.unresolved === 1 ? 'it' : 'them'} by leaving ${
          summary.unresolved === 1 ? 'it' : 'them'
        } out:\n\n` +
        open.map((o) => `  - ${o.says}`).join('\n') +
        `\n\nSettle ${summary.unresolved === 1 ? 'it' : 'them'} and propose the change set again.`,
    )
  }
  if (summary.writes === 0) {
    throw new ApplyRefused(
      0,
      null,
      'This change set would write nothing. Every operation in it either names a record that already ' +
        'exists or records something nobody decided, so there is nothing to apply.',
    )
  }

  // ONE TRANSACTION. Anything below that throws rolls the whole thing back, which is what makes
  // "no partial application" a property of the code rather than a promise in a report.
  return sqlite.transaction((): ApplyResult => {
    const ops: AppliedOp[] = []
    const created: string[] = []
    let wrote = false
    /** Records this delta made, by their position in `ops`, so a later step can name them. */
    const madeAt = new Map<number, string>()

    /** Resolve `new:<n>` or a record id to a real id, refusing anything that names nothing. */
    const resolve = (value: string, at: number, operation: DeltaOp): string => {
      const index = newRef(value)
      if (index === null) {
        const found = getRecord(value)
        if (found === undefined || found === null) {
          throw new ApplyRefused(at, operation, `no record has the id "${value}".`)
        }
        return value
      }
      const made = madeAt.get(index)
      if (made === undefined) {
        throw new ApplyRefused(
          at,
          operation,
          `it names "new:${index}", and operation ${index + 1} is not a record this change set creates ` +
            `before this point. A change set is applied in the order it is written.`,
        )
      }
      return made
    }

    delta.ops.forEach((operation, at) => {
      switch (operation.op) {
        case 'reuse_record': {
          // WRITES NOTHING, on purpose. It is here so a reader can see the duplicate was considered.
          const found = getRecord(operation.recordId)
          if (found === undefined || found === null) {
            throw new ApplyRefused(at, operation, `no record has the id "${operation.recordId}".`)
          }
          ops.push({ op: operation.op, says: operation.says, did: `reused "${found.title}"`, id: found.id })
          break
        }

        case 'create_record': {
          const made = createRecord({
            workspaceId: operation.workspaceId,
            kind: operation.kind as RecordKind,
            title: operation.title,
            ...(operation.summary === undefined ? {} : { summary: operation.summary }),
            data: operation.data ?? {},
            actor,
          })
          wrote = true
          madeAt.set(at, made.id)
          created.push(made.id)
          ops.push({
            op: operation.op,
            says: operation.says,
            did: `created ${operation.kind} "${made.title}" in ${operation.workspaceId}`,
            id: made.id,
          })
          break
        }

        case 'set_field': {
          const found = getRecord(operation.recordId)
          if (found === undefined || found === null) {
            throw new ApplyRefused(at, operation, `no record has the id "${operation.recordId}".`)
          }
          // THE STALE CHECK, and it is the reason this operation carries a version at all. An
          // approved change set applied a week later must not write over what somebody did in the
          // meantime — and the compare-and-set the rest of the product uses is the same one.
          const now = versionOf(found)
          if (now !== operation.expectVersion) {
            throw new ApplyRefused(
              at,
              operation,
              `"${found.title}" has changed since this was proposed. It was read at version ` +
                `${operation.expectVersion} and is now ${now}, so applying this would write over work ` +
                `done in between. Read it again and propose the change set against what is there now.`,
            )
          }
          const patched = patchRecord(operation.recordId, { dataPatch: { [operation.field]: operation.value } }, actor)
          wrote = wrote || patched.newSeq !== null
          ops.push({
            op: operation.op,
            says: operation.says,
            did: patched.newSeq === null ? alreadySet(operation.field, found.title) : `set ${operation.field} on "${found.title}"`,
            id: found.id,
          })
          break
        }

        case 'link': {
          const from = resolve(operation.from, at, operation)
          const to = resolve(operation.to, at, operation)
          // The ORDINARY link write, so the ordinary refusals apply — an unknown type, a deleted
          // end, and the workspace boundary, which is what stops a delta joining two projects.
          const made = createLink({ fromId: from, toId: to, type: operation.type as never, actor })
          wrote = wrote || !made.nothingWritten
          ops.push({ op: operation.op, says: operation.says, did: made.nothingWritten ? alreadyLinked(operation.type) : `linked ${operation.type}`, id: made.id })
          break
        }

        case 'allocate': {
          const recordId = resolve(operation.recordId, at, operation)
          const made = createAllocation(
            {
              horizon: operation.horizon,
              period: operation.period,
              recordId,
              ...(operation.plannedHours === undefined ? {} : { plannedHours: operation.plannedHours }),
            },
            actor,
          )
          wrote = true
          ops.push({
            op: operation.op,
            says: operation.says,
            did:
              `gave it ` +
              (made.plannedHours === null ? 'time in' : `${made.plannedHours} hours in`) +
              ` ${operation.period}`,
            id: made.id,
          })
          break
        }

        case 'unresolved':
          // Unreachable: refused above, before the transaction opened. Here so that adding an
          // operation kind without handling it fails to compile rather than silently doing nothing.
          throw new ApplyRefused(at, operation, 'an unresolved operation cannot be applied.')
      }
    })

    const nothingWritten = wrote ? undefined : nothingWrittenSentence({ kind: 'already-stored' })
    return {
      applied: true,
      ops,
      created,
      ...(nothingWritten === undefined ? {} : { nothingWritten }),
      note: nothingWritten ?? writtenApplyNote(ops, created, actor),
    }
  })()
}

export { deltaIn, summariseDelta, type Delta }
