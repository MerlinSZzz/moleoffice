// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GUARDS ON A RECORD'S EXPORT LIST, IN A MODULE OF THEIR OWN.
 *
 * The guards were moved whole out of src/server/lib/records.ts with no change of behaviour: the
 * unforgeable key the export route writes with, the refusal of a caller that names the list, and the
 * two guards over a bundle's shift and its remove. records.ts hands the names on with `export *`, so
 * no caller changed; exportListIn stays unexported.
 *
 * This file imports records.ts for the Actor type and isJsonObject; isJsonObject is read inside a
 * function body, so the cycle is safe.
 */
import { BUNDLE_SHIFT_LIMIT, isBundleShift } from '@shared/bundles.ts'
import { PanelError } from '../panel-error.ts'
import { type Actor } from '../records.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'

// ============================================================== what left the building
//
// TWO GUARDS STAND OVER ONE LIST, AND ONLY THE PAIR IS A RULE.
//
// `assertMayRemoveAnExportedBundle`, below, refuses an agent DELETING a bundle whose `exports` list
// is not empty. That guard held: 403, live, measured. It was also the only door
// anybody had put a lock on. `design/round-ten/verification/wave-12.json` measured four ways round
// it, all of them 200, on a copy of the owner's own corpus:
//
//   1. PATCH {"dataPatch":{"exports":[]}}     — empty the list, then delete.
//   2. PATCH {"dataPatch":{"exports":null}}   — a merge patch's null DELETES the key.
//   3. PATCH {"data":{ …no exports… }}        — a wholesale body replaces the bag and the list with it.
//   4. PATCH {"kind":"note"}                  — the values are set aside under `extra`, and the
//                                               delete guard reads `kind !== 'context_bundle'`
//                                               and stands down.
//
// And the same hole let an agent FORGE what it never did: a create carrying a fabricated entry was
// answered 201, after which `#/bundles` drew the row as *handed over once*.
//
// THE RULE WAS PUBLISHED THE WHOLE TIME AND ENFORCED NOWHERE. `KIND_SPECS.context_bundle`, served
// to every agent at `GET /api/kinds/context_bundle`, says *"AN EXPORT IS WRITTEN BY THE SERVER. A
// create or a patch carrying `exports` is refused, because an export is the only evidence of what
// was handed to an outside agent and a caller could otherwise claim one it never made."* A rule
// published and unenforced is worse than one nobody wrote down: an agent reads it, believes the
// list means something, and the list means nothing.

/**
 * THE ONE CALLER THAT MAY WRITE AN EXPORT, SAID IN A KEY NO REQUEST CAN CARRY.
 *
 * `POST /api/bundles/export` writes its entry through the ordinary patch door on purpose — so the
 * change log, the revision ledger and every other guard on a write are the ones every edit goes
 * through. That leaves the guard below needing to tell the export route's own patch from an agent's
 * imitation of it, and a boolean in the body would be exactly that imitation.
 *
 * A SYMBOL KEY IS UNFORGEABLE ACROSS THE WIRE, and that is the whole of why it is one. `JSON.parse`
 * cannot produce a symbol-keyed property, so no request body, however shaped, can set this. The
 * route's zod schema is `strictObject` as well, which refuses unknown STRING keys — belt and
 * braces, and neither of them alone would be this.
 */
export const AN_EXPORT_IS_WRITTEN_BY_THE_SERVER: unique symbol = Symbol('an export is written by the server')

/** The `exports` list as a record's `data` holds it, or `[]` when it holds none. Never throws. */
function exportListIn(data: unknown): unknown[] {
  if (!isJsonObject(data)) return []
  const list = data['exports']
  return Array.isArray(list) ? list : []
}

/**
 * THE RECORD OF WHAT LEFT THE BUILDING IS WRITTEN BY THE SERVER AND CHANGED BY NOBODY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT REFUSES THE PERSON TOO, WHERE THE DELETE GUARD DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * The delete guard lets a person delete an exported bundle, because deciding a record has served
 * its purpose is a judgement a person is entitled to make. Writing an export ENTRY is not that. An
 * entry says text of a stated size and hash, carrying these records at these versions, was handed
 * to somebody on this day — and that is either something the server did, in which case the server
 * wrote it, or it is not, in which case it is a claim about an event with no event behind it. There
 * is no version of typing one by hand that is honest, so `humanOnly` has no place here and the
 * published rule says *a caller*, not *an agent*.
 *
 * ---------------------------------------------------------------------------------------
 * TWO CLAUSES, BECAUSE THERE ARE TWO WAYS TO LIE WITH THIS LIST
 * ---------------------------------------------------------------------------------------
 *
 * FORGING. The caller's own `data` or `dataPatch` names `exports`. That is the published rule word
 * for word, and it catches doors 1 and 2 above along with the fabricated create.
 *
 * ERASING. The list the write would STORE is not the list that is stored now. That is a different
 * question and it needs a different reading — doors 3 and 4 never mention `exports` at all, they
 * drop it. So this clause is asked of the body that will land, whatever door it came through, and a
 * kind change fails it for the reason that made it a hole in the first place: the values go under
 * `extra` and the top-level list is gone.
 *
 * IT IS NOT KEYED ON THE STORED LIST BEING NON-EMPTY. Empty-to-full is forgery through the back
 * door: a note whose `extra` somebody filled with an `exports` key, turned into a bundle, arrives
 * with a list nothing wrote. Comparing the two lists whichever way they differ costs nothing and
 * closes that without a fifth clause.
 *
 * WHAT IT DOES NOT DO. It does not check that an entry is TRUE — that the text really was that
 * size, that the hash really is that text's. Nothing could, from here. It checks that the list is
 * the server's own writing, unchanged, which is the property the delete guard was standing on and
 * did not have.
 */
export function assertMayWriteAnExportList(write: {
  /** The kind the record will be after this write. On a kind change, the NEW kind. */
  kind: string
  /** The kind it is now, or `null` on a create. Both are asked, because either can be the bundle. */
  wasKind: string | null
  /** What the CALLER sent, before any merge. Undefined keys mean the write did not send that door. */
  sent: { data?: Record<string, unknown> | undefined; dataPatch?: Record<string, unknown> | undefined }
  /** The `data` as it stands. Nothing at all on a create. */
  before: unknown
  /** The `data` this write will store, whatever door it came through. */
  after: unknown
  /** The record, for the refusal. Null on a create, where there is no id to name. */
  recordId: string | null
  /** True for the export route's own patch and for nothing else. See the symbol above. */
  byTheServer: boolean
}): void {
  if (write.kind !== 'context_bundle' && write.wasKind !== 'context_bundle') return
  if (write.byTheServer) return

  const where = write.recordId === null ? 'Nothing was filed.' : `Nothing was written and bundle ${write.recordId} is exactly as it was.`
  const howToDoItProperly =
    'AN EXPORT IS AN ACT, NOT A CLAIM. POST /api/bundles/export {"bundleId":"…"} resolves the bundle, hands back ' +
    'the text, and writes the entry itself — the number an answer quotes back, when it went, who asked for it, ' +
    'how large the text was, its hash, every record it carried with the version that record held, every ' +
    'restriction that went with it, and what was left out. That list is the only record Mole Office has of what was ' +
    'handed to an agent it does not run, so a caller that could write it could claim a handover that never ' +
    'happened, or erase one that did.'

  // ---- FORGING: the caller named the key. The published rule, word for word.
  for (const door of ['data', 'dataPatch'] as const) {
    const body = write.sent[door]
    if (body === undefined || !Object.prototype.hasOwnProperty.call(body, 'exports')) continue
    throw new PanelError(
      `This request carries \`${door}.exports\`, and an export is written by the server. ${where}\n\n` +
        `${howToDoItProperly}\n\n` +
        `WHAT TO SEND INSTEAD. File the bundle with the scope, the preset and the size it may take, and leave ` +
        `\`exports\` out — the kind's own example carries no \`exports\` key for this reason. Then export it, as ` +
        `many times as you like; each one is numbered and each one is kept.`,
      403,
    )
  }

  // ---- ERASING: the list that would land is not the list that is there.
  const before = exportListIn(write.before)
  const after = exportListIn(write.after)
  if (JSON.stringify(before) === JSON.stringify(after)) return
  const kindChange = write.wasKind !== null && write.wasKind !== write.kind
  throw new PanelError(
    `This write would leave bundle ${write.recordId ?? '(new)'} holding ${after.length} export(s) where it holds ` +
      `${before.length}, and that list is not a caller's to change. ${where}\n\n` +
      (kindChange
        ? `WHAT THIS REQUEST DOES. Changing the kind sets aside every value the new kind has no place for, under ` +
          `\`extra\` — which takes the exports off the bundle and takes the bundle out of the reach of the rule ` +
          `that a bundle which has exported is not an agent's to delete. A record of what left the building that ` +
          `can be moved out of the way is not a record of anything. Leave it as a context bundle.\n\n`
        : `WHAT THIS REQUEST DOES. A wholesale \`data\` replaces the whole object, so a body that does not name ` +
          `\`exports\` does not leave the list alone — it drops it. Send \`dataPatch\` naming only the fields you ` +
          `mean to change, and the list stays where it is.\n\n`) +
      howToDoItProperly,
    403,
  )
}

/**
 * A BUNDLE'S SHIFT IS A MOVE A COPY CAN MAKE, REFUSED WHEN IT IS WRITTEN.
 *
 * The kind can only say "a number", so without this a shift of 7 or 2.5 was stored and answered 201,
 * and refused only when somebody later asked for the copy. Only a shift this write changes is asked
 * about, so a bundle filed before this check can still be renamed; its copy still refuses the value.
 */
export function assertABundleShiftIsAMove(write: { kind: string; before: unknown; after: unknown; recordId: string | null }): void {
  if (write.kind !== 'context_bundle') return
  const shift = isJsonObject(write.after) ? write.after['shift'] : undefined
  const was = isJsonObject(write.before) ? write.before['shift'] : undefined
  if (shift === undefined || shift === was || isBundleShift(shift)) return
  const where = write.recordId === null ? 'Nothing was filed.' : `Nothing was written and bundle ${write.recordId} is exactly as it was.`
  throw new PanelError(
    `This bundle asks to move every part by ${JSON.stringify(shift)} levels. A move is a whole number from ` +
      `-${String(BUNDLE_SHIFT_LIMIT)} to ${String(BUNDLE_SHIFT_LIMIT)}, one level for each press of Less or More, ` +
      `and 0 or no shift at all leaves every part where its share of the size put it. ${where}`,
    400,
  )
}

/**
 * A BUNDLE THAT HAS EXPORTED IS NOT AN AGENT'S TO DELETE.
 *
 * FILING ONE IS NOT AN ACT MOLE OFFICE REFUSES, and that asymmetry is the whole rule. A bundle with no
 * exports is a recipe nobody has used: deleting it destroys nothing. Once it has exported, its
 * `exports` list is the ONLY evidence in this product of what was handed to an agent Mole Office does
 * not run — which records, at which versions, with which validity limits, on which day. Nothing
 * else knows. The text itself was copied into somebody else's window and is gone.
 *
 * A PERSON MAY DELETE IT. This is the same shape as every other governance refusal here: the rule
 * is about an agent tidying away the record of what left the building, not about the act being
 * forbidden. The refusal says what to do instead.
 */
export function assertMayRemoveAnExportedBundle(
  subject: { id: string; kind: string; title: string; data: unknown },
  actor: Actor,
): void {
  if (subject.kind !== 'context_bundle') return
  if (actor.type === 'human') return
  const bag = isJsonObject(subject.data) ? subject.data : {}
  const exports = bag['exports']
  const count = Array.isArray(exports) ? exports.length : 0
  if (count === 0) return
  throw new PanelError(
    `"${subject.title}" has exported ${String(count)} ${count === 1 ? 'time' : 'times'}, and that list is the only ` +
      'record Mole Office has of what was handed to an agent it does not run — which records, at which versions, and ' +
      'with which validity limits. Deleting it would destroy that. Nothing was written. Filing a bundle is not ' +
      'refused and neither is deleting one that has never exported; this one has. Ask the person to delete it, or ' +
      'file a note saying it is finished with.',
    403,
  )
}
