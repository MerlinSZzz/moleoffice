// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ONE-VERSION KEY WINDOW: WHETHER IT IS STILL OPEN, AND WHO CLOSED IT. Criterion P83, point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * For one version a request that sends identity headers and no key still counts when a listener
 * carried it from this computer or from a machine on the trusted list (P73). That holds for their name
 * and for an agent's name alike (finding 79). This file holds the one fact that ends that:
 * whether the person has closed the window, and when and by whom.
 *
 * After the close, a request a listener carried with no key is nobody. A write with no key is
 * refused, whatever name it sent, and a read with no key under an agent's name is answered as a
 * request that named nobody; `actorFrom` in ./http.ts does both. A read with no key that claims to
 * be the person is answered, and it does not prove them. The doors a caller uses to get a
 * key still answer, and a request no listener carried is the office itself.
 *
 * The shape of the answer lives in `@shared/keywindow.ts`, so the Settings page that draws it and
 * this file cannot drift. `theHeaderWindowCovers` in ./http.ts reads `theKeyWindowIsClosed` here,
 * and nothing else reads the columns.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE INSTALLATION ROW, AND WHY NOT A TABLE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * There is one office, one window and one act. The installation table is the office's one singleton
 * row, and this is an office-level fact, so the three columns live there. A singleton table for one
 * fact would be a second shape for the same kind of thing.
 *
 * ---------------------------------------------------------------------------------------
 * THE CACHE, AND WHAT IT COSTS
 * ---------------------------------------------------------------------------------------
 *
 * This decides identity on every listener-carried header claim, and the office has slow doors filed
 * as problems jRaiN3j1IAfz and RcrvxsbgqWqr. So the row is read once per database path in this
 * process, the way keys.ts holds the key file, and `closeTheKeyWindow` replaces what it wrote. A
 * process that closes the window does not read the row again on the next request.
 *
 * THE COST. A process that did not write the close — a second server process serving the same
 * database — keeps reading the row as open. The window is the last moment before the person's key
 * is the only way in, and two server processes on one database is not a shape this office has; the
 * cache is cleared on the write, which is the only writer in this process. The alternative is a
 * database read on every caller who has no key, which is the slow door the problems name.
 */

import { sqlite } from '../db/client.ts'
import { settings } from '../../config/settings.mjs'
import { nowStamp } from '@shared/time.ts'
import type { WhatTheKeyWindowSays, WindowClosedBy } from '@shared/keywindow.ts'
import { type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { whyTheKeyWindowMayNotCloseYet } from './provedkeys.ts'
import { theKeyWindowSays } from '../db/the-key-window-says.ts'
import { alreadyRead } from '../db/the-key-window-says.ts'
import { theKeyWindowPath } from '../db/the-key-window-says.ts'
import { readTheKeyWindow } from '../db/the-key-window-says.ts'
import type { WindowRow } from '../db/types/keywindow.ts'

export type { WindowRow } from '../db/types/keywindow.ts'

export { alreadyRead } from '../db/the-key-window-says.ts'

export { theKeyWindowPath } from '../db/the-key-window-says.ts'

export { readTheKeyWindow } from '../db/the-key-window-says.ts'

export { closedTheWindow } from '../db/the-key-window-says.ts'

export { theKeyWindowSays } from '../db/the-key-window-says.ts'

export { theKeyWindowIsClosed } from '../db/the-key-window-is-closed.ts'

/**
 * WHETHER A KEY PROVED THIS CALLER AS SOMEBODY WHO MAY CLOSE THE WINDOW.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WINDOW IS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * The one-version window makes a request with the person's headers and no key the person, so that
 * their own tools and devices keep working until they have keys. That is exactly what makes the close
 * press a trap: the browser the window made the person holds no key, so the moment it closed the
 * window it would be nobody on the next request. Problem OgdgFc68y3xq. The press therefore asks for
 * a proof that outlives it — a key — and the window's own half does not count here.
 *
 * THE PROOF IS ALREADY ON THE ACTOR and is read, never worked out again: `provedBy` is filled by
 * `actorFrom` from the one place a key is read or compared (src/server/lib/keys.ts). A confirmed
 * device's key reads there as `the-person-key`, so the phone a person paired proves the person and
 * may press. An agent's key proves the agent and not the person, so `thePersonIsProved` refuses it —
 * except inside a test world, where its starter and the secretary hold the person's authority
 * (criterion P84) and this office already lets them make the person's presses — and except a secretary
 * whose own key proved it and whose press the person's grant carried (`elevationUsed`, set only by
 * `aRaiseCarriesIt`). Its key outlives the window as the person's does. The read's `mayPress` asks
 * before any press, so it does not say yes to that secretary.
 */
export function aKeyProvesThisCaller(actor: Actor): boolean {
  if (actor.provedBy === undefined) return false
  return thePersonIsProved(actor) || actor.theOwnersAuthority?.holds === true || (actor.provedBy === 'an-agent-key' && actor.elevationUsed === true)
}

/**
 * WHETHER THIS CALLER COULD PRESS THE CLOSE AND HAVE THE DOOR ACCEPT IT.
 *
 * This is the door's whole answer and not only its key clause: the press is kept on this machine, so
 * a caller a listener stamped `another machine` cannot reach it at all. The Settings page reads this
 * flag, so the page and the door are one answer rather than two (invariant 9).
 */
export function theClosePressIsOpenTo(actor: Actor): boolean {
  if (actor.from === 'another machine') return false
  return aKeyProvesThisCaller(actor)
}

/**
 * CLOSE THE WINDOW, IN ONE PRESS, AS THE PERSON'S ACT.
 *
 * THE FIRST CLOSE IS THE TRUE ONE. A second close does not rewrite when or who: the window was shut
 * at the first press, and moving the stamp would make the list say it was shut later than it was.
 * So a close on an already-closed window is refused with the recorded moment named.
 *
 * AND IT REFUSES WHILE A LIVE AGENT HOLDS NO PROVED KEY, at point 3 of one decision and on the condition
 * in another. The window closes when every agent path holds a key.
 * An agent whose only
 * keys were given by name would be locked out or, worse, keep writing on a key nobody proved. Asked here, before
 * anything is written, so every caller of the close meets it. The sentence names the agents, how many, and the
 * two ways out; `whyTheKeyWindowMayNotCloseYet` writes it, and GET /api/office/key-window answers the same
 * sentence before the press.
 *
 * THE CACHE IS REPLACED WITH WHAT WAS WRITTEN, for the reason keys.ts replaces the file it read:
 * without it the next request in this process would answer from the state before the press.
 */
export function closeTheKeyWindow(by: WindowClosedBy): WhatTheKeyWindowSays {
  const held = theKeyWindowSays()
  if (!held.open) {
    throw new PanelError(
      `The window was already closed${held.closedAt === null ? '' : ` at ${held.closedAt}`}. Nothing was changed.`,
      409,
    )
  }
  const notYet = whyTheKeyWindowMayNotCloseYet()
  if (notYet !== null) {
    throw new PanelError(
      `${notYet.says} Nothing was changed.`,
      409,
      undefined,
      undefined,
      `${String(notYet.count)} live ${notYet.count === 1 ? 'agent holds' : 'agents hold'} no proved key.`,
    )
  }
  sqlite
    .prepare(
      'UPDATE installation SET window_closed_at = ?, window_closed_by_kind = ?, window_closed_by_id = ? WHERE only_row = 1',
    )
    .run(nowStamp(), by.kind, by.id)
  const written = readTheKeyWindow()
  alreadyRead.set(theKeyWindowPath(), written)
  return written
}

/** For a test only: let the next read go back to the row. */
export function forgetTheKeyWindowThisProcessRead(): void {
  alreadyRead.clear()
}
