// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ITEMS A RUN'S STARTER ASKS THE REMINDER BEFORE THE SEAL TO NAME. Wave 13j round 54.
 *
 * Two doors take them: the door that files the run (POST /api/records with kind `session` and `data.checkAlso` as a list
 * of sentences), and PUT /api/records/<run>/check-also {items: [...]}, which replaces the list. Both store
 * `{items, by, at}`, with `by` the caller as `{actorType, actorId}`. The record PATCH door refuses `checkAlso`, so these two are the only ways in.
 *
 * NOT THE RUN'S OWN KEY. A run must not choose what it is reminded of, so the run's own key, and a key acting for the run,
 * are refused. The reminder names each item and never judges one (src/server/lib/before-the-seal.ts).
 */
import { nothingWrittenSentence } from './records/patching.ts'
import type { FastifyRequest } from 'fastify'
import { CHECK_ALSO, CHECK_ALSO_LONGEST_ITEM, CHECK_ALSO_MOST_ITEMS, type CheckAlso } from '@shared/before-the-seal.ts'
import type { CheckAlsoRefusalCode } from '@shared/refusal-codes.ts'
import { localStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { theRunsOwnRequest } from './before-the-seal.ts'
import { patchRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

function refused(message: string, status: number, code: CheckAlsoRefusalCode): PanelError {
  return new PanelError(message, status, undefined, undefined, undefined, { code, values: {} })
}

/** The refusal of `checkAlso` at the record PATCH door. */
export const CHECK_ALSO_IS_WRITTEN_BY_ITS_DOOR = (): PanelError =>
  refused(
    'A run’s checkAlso is written only by PUT /api/records/<run>/check-also, or when the run is filed. Nothing was changed.',
    403,
    'checkAlsoWrittenOutsideItsDoor',
  )

/**
 * THE LIST AS IT IS STORED, from what a caller sent, or the refusal. Each item is trimmed; an empty one is refused, and so
 * are more than 20 items or an item over 300 characters.
 */
export function theCheckAlsoToStore(kind: string, sent: unknown, actor: Actor): CheckAlso {
  if (kind !== 'session') throw refused('Only a run carries items for the reminder before its seal, and this record is not a run. Nothing was changed.', 409, 'checkAlsoNotARun')
  if (!Array.isArray(sent) || !sent.every((one) => typeof one === 'string')) {
    throw new PanelError('checkAlso must be a list of short sentences, each a string. Nothing was changed.', 400)
  }
  const items = sent.map((one: string) => one.trim())
  if (items.length > CHECK_ALSO_MOST_ITEMS) {
    throw refused(`A run carries at most ${CHECK_ALSO_MOST_ITEMS} items for the reminder before its seal, and ${items.length} were sent. Nothing was changed.`, 400, 'checkAlsoTooMany')
  }
  const tooLong = items.findIndex((one) => [...one].length > CHECK_ALSO_LONGEST_ITEM)
  if (tooLong !== -1) {
    throw refused(
      `Each item for the reminder before the seal is at most ${CHECK_ALSO_LONGEST_ITEM} characters, and item ${tooLong + 1} has ${[...items[tooLong]!].length}. Nothing was changed.`,
      400,
      'checkAlsoItemTooLong',
    )
  }
  const empty = items.findIndex((one) => one === '')
  if (empty !== -1) throw new PanelError(`Item ${empty + 1} of checkAlso is empty. Nothing was changed.`, 400)
  return { items, by: { actorType: actor.type, actorId: actor.id }, at: localStamp(new Date()) }
}

/** PUT /api/records/<run>/check-also: replace the run's list. An empty list takes it off. */
export function setTheCheckAlsoOf(req: FastifyRequest, run: PanelRecord, sent: unknown, actor: Actor): { record: PanelRecord; nothingWritten?: string } {
  if (run.kind === 'session' && theRunsOwnRequest(req, run)) {
    throw refused(`Run ${run.id}'s own key may not choose what the run is reminded of. Its starter or the person gives these items. Nothing was changed.`, 403, 'checkAlsoByTheRunItself')
  }
  const stored = theCheckAlsoToStore(run.kind, sent, actor)
  const result = patchRecord(run.id, { dataPatch: { [CHECK_ALSO]: stored.items.length === 0 ? null : stored } }, actor)
  return { record: result.record, ...(result.nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: stored.items.length === 0 ? 'check-also-absent' : 'check-also-unchanged' }) }) }
}
