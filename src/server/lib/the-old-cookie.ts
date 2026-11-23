// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MOVE OF THE OLD COOKIE, ONCE, TO TWO HALVES. Item 7 of SEC-2's design.
 *
 * Before SEC-2 a paired browser held a whole key in the old cookie: the person's own key, or the one-piece token of a
 * person's-device credential confirmed at the Embassy. After SEC-2 the old cookie is no key (`keyOn` does not read
 * it), so such a browser would stop being the person on the day the office is updated. The move door,
 * POST /api/office/pairing/move, gives it two halves once and ends the old cookie in the same answer.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAY MOVE
 * ---------------------------------------------------------------------------------------
 *
 * - The person's key from the key file. The browser becomes a new person's-device credential under the name the page
 *   gives, confirmed in the person's name, as the pairing press does.
 * - The token of a person's-device credential that is confirmed, not ended, and whose key the office still holds as a
 *   person-device key. The browser becomes a new credential under the old credential's name, confirmed by whoever
 *   confirmed the old one, and the old credential is ended, which revokes its key. The name the page gives is not taken
 *   then: the person confirmed the old name.
 *
 * NOTHING ELSE MOVES. An agent's credential, a credential still waiting, an ended one, a revoked key and any value this
 * office never gave are not moved, so the move never makes a browser the person when its old cookie did not.
 *
 * A CREDENTIAL WHOSE END HAS PASSED STILL MOVES. A device credential lasts a fixed number of days and nothing renews
 * it, but its end never stopped its browser: before SEC-2 the old cookie proved the person through the device's live
 * key alone (`howThisRequestProvedItself` in keys.ts), and nothing revokes that key when the end passes. Refusing it
 * here made an update ask the person to pair again a browser that was the person the day before. The new credential
 * the move makes has an end of its own, counted from the move.
 *
 * A REQUEST THAT ALREADY PROVES THE PERSON DOES NOT MOVE. Its two halves or its key are the proof; a second credential
 * would be a second row at the Embassy for the same browser. The read does not offer it the move, so its old cookie
 * stays until a move is sent, and it is no key.
 *
 * IN A TEST WORLD NOTHING MOVES AND NO OLD COOKIE IS ENDED. A world's table is a copy of the office's, and a cookie goes
 * to every port of its host, so the old cookie a world is sent is the office's own. Ending it there would end it before
 * the office could move it.
 *
 * THE MOVE IS ONE TRANSACTION: the new credential, its confirmation, its key and the end of the old credential are
 * written together or not at all.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { KEY_COOKIE } from '../../config/key-header.mjs'
import { sayInEnglish } from '@shared/i18n.ts'
import { THE_PERSON } from '@shared/person.ts'
import { isAPersonsDeviceCredential, type VisitorCredential } from '@shared/visitors.ts'
import { sqlite } from '../db/client.ts'
import { keyHash } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { heldKeyByHash } from './how-this-request-proved-itself.ts'
import { cookieValue, endTheOldCookie, isThePersonsKey } from './keys.ts'
import { writtenFrom } from './machines.ts'
import { PanelError } from './panel-error.ts'
import type { Actor } from './records/actor.ts'
import { credentialForToken, endACredential, pairABrowserAsThePerson, type ADeviceKeyInTwoHalves } from './visitors.ts'
import { theWorldsOwnAuthority } from './worldauthority.ts'

/** What the old cookie on a request holds that may move, and for a credential, the credential and who confirmed it. */
export type AnOldCookieThatMayMove =
  | { moved: 'the-person-key' }
  | { moved: 'a-device-credential'; credential: VisitorCredential; confirmedBy: NonNullable<VisitorCredential['confirmedBy']> }

/** The old cookie's value on this request, or undefined because it carries none. */
function theOldCookieOn(req: FastifyRequest): string | undefined {
  return cookieValue(req.headers.cookie, KEY_COOKIE)
}

/** What the old cookie on this request holds that may move, or null because it holds nothing that may. See above. */
export function whatTheOldCookieMayMove(req: FastifyRequest, actor: Actor): AnOldCookieThatMayMove | null {
  if (theWorldsOwnAuthority().inATestWorld) return null
  if (actor.provedBy === 'the-person-key') return null
  const old = theOldCookieOn(req)
  if (old === undefined) return null
  if (isThePersonsKey(old)) return { moved: 'the-person-key' }
  const credential = credentialForToken(old)
  if (credential === null || !isAPersonsDeviceCredential(credential) || credential.confirmedBy === null) return null
  // ONLY ITS STANDING IS ASKED, NOT ITS END. See above: an end that passed never stopped the browser.
  if (credential.standing !== 'trusted') return null
  const held = heldKeyByHash(keyHash(old))
  if (held === undefined || held.whose_kind !== 'person-device') return null
  return { moved: 'a-device-credential', credential, confirmedBy: credential.confirmedBy }
}

/**
 * MOVE IT: a new person's-device credential, confirmed, with its key bound, and for a credential the end of the old one.
 * It answers the two halves; the door sets the cookie half, ends the old cookie and answers the header half.
 *
 * THE KEY'S ROW SAYS THE PERSON'S KEY MADE IT. The old cookie held the person's key or a person's-device key, and
 * before SEC-2 either proved the person on this request.
 */
export function moveTheOldCookie(req: FastifyRequest, may: AnOldCookieThatMayMove, device: string): ADeviceKeyInTwoHalves {
  const from = writtenFrom(req)
  return sqlite.transaction((): ADeviceKeyInTwoHalves => {
    if (may.moved === 'the-person-key') {
      return pairABrowserAsThePerson(
        { name: device, machine: from.machine, machineHow: from.how, runtime: from.program },
        { kind: 'person', id: THE_PERSON },
        'the-persons-key',
      ).halves
    }
    const { halves } = pairABrowserAsThePerson(
      { name: may.credential.handle, machine: from.machine, machineHow: from.how, runtime: from.program },
      may.confirmedBy,
      'the-persons-key',
    )
    endACredential(may.credential.id, sayInEnglish('w13s.pairing.oldCredentialEnded'))
    return halves
  })()
}

/**
 * REFUSE A MOVE THAT FOUND NOTHING TO MOVE, with 409, and nothing written. It ends the old cookie it was sent unless
 * this process is a test world (see above): a browser that holds an old cookie nothing can move keeps nothing by
 * keeping it. Fastify keeps a Set-Cookie header on the way to a refusal.
 */
export function refuseAMoveThatFoundNothing(req: FastifyRequest, reply: FastifyReply): never {
  if (theOldCookieOn(req) !== undefined && !theWorldsOwnAuthority().inATestWorld) endTheOldCookie(reply)
  throw new PanelError(sayInEnglish('server.nothingToMove'), 409, undefined, undefined, undefined, { code: 'nothingToMove', values: {} })
}
