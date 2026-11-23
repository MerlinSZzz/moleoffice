// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THIS BROWSER'S PAIRING IS — CRITERION P83, POINT 2, AND THE AMENDMENT OF 18:50.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * The person's key is made once at first run and kept beside the database (point 1). A local
 * browser is paired once: it presses a page, the office sets the key as a cookie, and every request
 * that browser makes from then on carries it. No terminal, no typing, no string for the person to
 * keep. Pairing is offered on the machine Mole Office runs on; a browser on another machine knocks,
 * and the person approves the knock on this computer.
 *
 * This is the shared shape of the one question the pairing page asks: has this browser been paired,
 * is pairing offered here, may it ask to be paired, and is it already waiting on an answer?
 *
 * ---------------------------------------------------------------------------------------
 * `paired` IS A KEY AND NOT THE WINDOW
 * ---------------------------------------------------------------------------------------
 *
 * `paired` is true only when the request carried the person's key. It is deliberately not
 * `thePersonIsProved`, which is also true for a keyless claim the one-version window covers: a
 * browser the window made the person must still be offered pairing, or it would never receive the
 * key that outlives the window. The two questions are different and this file holds the first.
 *
 * `offered` IS WHERE THE REQUEST ARRIVED, and the listener wrote that; a caller cannot set it. It
 * is true only on the computer Mole Office runs on, which is the whole of point 2's "loopback
 * only".
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND WAY IN, THE AMENDMENT OF 13 SEPTEMBER 2026 AT 18:50
 * ---------------------------------------------------------------------------------------
 *
 * A browser on another machine holds no key and is not on the office's own computer, so neither
 * `offered` nor a loopback press reaches it. `mayAsk` is that browser: the request arrived through
 * the listener for other machines AND this browser holds no key. Whether the office trusts the
 * machine does not decide it. That is the decision of 9 November 2026: a browser may knock, and
 * the person approves only on the computer that runs the office.
 *
 * `waiting` is read from the cookie: it names the device the browser asked under, when it asked, and
 * the credential's standing. A reload does not lose it and the browser keeps no state of its own.
 * `standing` is `pending` while they have not confirmed it, `trusted` once they have, and `ended` after they
 * end it — the state that says this browser holds nothing and may ask again.
 */

/**
 * HOW MANY TIMES ONE MACHINE MAY KNOCK IN ONE WINDOW, and how long the window is in minutes. A knock
 * makes a request the person has to read, so it is bounded: one address may ask this many times in
 * the window, and the next ask is refused with 429 until the window moves on. The count is the
 * server's, not the browser's, and it is kept in memory, so it bounds a live flood and a restart
 * begins it again.
 */
export const ASKS_TO_PAIR_ALLOWED = { most: 8, minutes: 10 } as const
import type { VisitorStanding } from './visitors.ts'

/** One credential a browser is waiting on, read from the cookie the ask door set. */
export interface WhatThisBrowserIsWaitingOn {
  /** The name the browser gave itself when it asked, which is the device's row at the Embassy. */
  device: string
  /** When it asked, in the office's own local wall-clock stamp. */
  askedAt: string
  /** Pending until they confirm it, trusted once they have, ended after they end it. */
  standing: VisitorStanding
}

/** What `GET /api/office/pairing` answers. The pairing press answers the same, with the header half beside it. */
export interface WhatThePairingSays {
  /**
   * True when this request carried the person's key: this browser is already paired. A key the
   * office issued to one of the person's devices reads the same way.
   */
  paired: boolean
  /**
   * True when pairing is offered to this caller: it arrived on the machine Mole Office runs on and
   * this browser holds no key yet. False from another machine, where a device joins through the
   * Embassy instead.
   */
  offered: boolean
  /**
   * True when this browser may ASK to be paired: it arrived through the listener for other machines,
   * its address is on the trusted list, and it holds no key. False on this computer, where `offered`
   * is the press, and false for a machine the office does not trust.
   */
  mayAsk: boolean
  /**
   * True when this browser may MOVE: it is not paired, and it sent the old cookie, which held a whole key, with a key
   * this office still holds as the person's. The move door then gives it two halves once and ends the old cookie in the
   * same answer. False for every other browser, in a test world, and once it has moved.
   */
  mayMove: boolean
  /**
   * The credential this browser already asked under, or null because it asked under none. It is read
   * from the two halves, so a reload keeps it; `standing` says whether it is still waiting, was
   * confirmed, or was ended.
   */
  waiting: WhatThisBrowserIsWaitingOn | null
}

/**
 * What `POST /api/office/pairing` answers: the pairing, and the header half of this browser's new key.
 *
 * ONE HALF IS HERE, NEVER THE WHOLE KEY. The cookie half is set as an HttpOnly cookie, and the page keeps this half
 * and sends it as a header. Neither is enough alone. The answer is sent with no-store, so no cache keeps it.
 */
export interface WhatThePressSays extends WhatThePairingSays {
  /** The header half of this browser's device key, answered once and never again. */
  deviceHalf: string
}

/**
 * What the move door moved: the person's own key, or a confirmed device credential of the person's from before the two
 * halves. A visitor's credential that is not the person's is never moved.
 */
export type WhatTheMoveMoved = 'the-person-key' | 'a-device-credential'

/**
 * What `POST /api/office/pairing/move` answers: what moved, and the header half of this browser's new key.
 *
 * ONE HALF IS HERE, NEVER THE WHOLE KEY, as in the press's answer. The cookie half is set as the HttpOnly cookie, the old
 * cookie is ended in the same answer, and the answer is sent with no-store.
 */
export interface WhatTheMoveSays {
  moved: WhatTheMoveMoved
  /** The header half of this browser's device key, answered once and never again. */
  deviceHalf: string
}

/**
 * What `POST /api/office/pairing/ask` answers, and it is deliberately not a credential.
 *
 * ONE HALF IS HERE, NEVER THE WHOLE KEY. The browser asked for a person's-device credential. The cookie half of the
 * credential's key is set as the same HttpOnly cookie the loopback press sets, and the reply names the credential's
 * id, the device's name, the header half and that the office is waiting for their confirmation. There is no field
 * the whole key could arrive in.
 */
export interface WhatAskingToPairSays {
  /** The credential's id, which is what the Embassy's confirm press names. It is not a secret. */
  credentialId: string
  /** The name this browser asked under, which is the device's name at the Embassy. */
  device: string
  /** True and always true: nothing works until the person confirms it at the Embassy. */
  waitingForConfirmation: boolean
  /** The header half of this browser's device key, answered once and never again. */
  deviceHalf: string
}

/**
 * WHAT THE PRESS TO PAIR SAYS WHEN THE PROGRAM THAT SENT IT IS NOT ONE OF THE PERSON'S, for the program the reading
 * named. The press's door says it (src/server/api/office.ts), followed by the sentence that says who pairs, and a test
 * reads it here rather than keeping a copy that a change to these words would leave wrong.
 */
export function thePairingRefusalFor(sentBy: string): string {
  return `Pairing gives the browser that asks a key that is the person, and this request came from ${sentBy}. Nothing that ` +
    'comes from a sandbox is the person, and a program Mole Office cannot find is not taken for one of theirs. Nothing ' +
    'was paired and no cookie was set.'
}
