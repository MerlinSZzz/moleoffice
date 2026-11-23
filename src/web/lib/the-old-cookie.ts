// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MOVE OF THE OLD COOKIE, ASKED AT MOST ONCE A LOAD, AND WHETHER THE PAGE SAYS IT. Item 7 of SEC-2's design.
 *
 * A browser paired before SEC-2 holds the old cookie, which is no key now. The pairing read says `mayMove` for it, and
 * the page asks the move door (api-parts/worlds.ts), which sets the cookie half, ends the old cookie and answers the
 * header half, which is kept before the move is said to be done. The shell's notice reads this file
 * (components/TheMoveNotice.tsx).
 *
 * ONCE A LOAD. Two places ask it: the shell, from its pairing read, and the page drawn for a browser the office refused.
 * One promise is kept here, so a second ask is given the first one's answer and no second move is sent.
 *
 * SAID ONCE, ACROSS ONE RELOAD. The page drawn for a refused browser reloads after a move, and the sentence would go
 * with it. So that page leaves a mark in this tab's session storage, and the next load says the sentence and removes
 * the mark. The shell does not reload after a move, so it leaves no mark, and a later reload says nothing.
 *
 * A MOVE THAT FAILS IS SAID WITH ITS REASON, and it is not asked again in this load. The browser is then as it was
 * before: it is not the person, and the pairing page offers what it offers.
 *
 * A MOVE ANOTHER TAB MADE FIRST IS NOT SAID. Two tabs of one browser that load at once both read `mayMove`, and both
 * ask. The first moves the browser and ends the old cookie, so the second is refused with 409 `nothingToMove`. That
 * refusal alone does not say whether the browser moved, so the tab that was refused reads the pairing again. When the
 * read says this browser is the person, the tab says nothing, as if it had not asked, and leaves no mark: the tab that
 * moved says it. Every other failure, and this one when the read fails or does not say the person, is said with its
 * reason as before.
 */
import { DEVICE_HALF_REFUSAL_CODES } from '@shared/refusal-codes.ts'
import { ApiError, api, errorMessage } from '../api.ts'
import { theNameThisBrowserGivesItself } from '../pages/PairingPage.tsx'

/** Where the move stands in this load. */
export type WhereTheMoveStands =
  | { state: 'not tried' }
  | { state: 'moving' }
  | { state: 'moved' }
  /** Another tab of this browser moved it first: this tab's move found nothing to move, and it is the person. */
  | { state: 'already moved' }
  | { state: 'not moved'; reason: string }

/** The move door's refusal of an old cookie that holds nothing it can move. */
const nothingToMove: keyof typeof DEVICE_HALF_REFUSAL_CODES = 'nothingToMove'

/** The session storage mark the page drawn for a refused browser leaves before it reloads after a move. */
const THE_MOVE_IS_TO_BE_SAID = 'mole-office.pairing-moved'

let stands: WhereTheMoveStands = { state: 'not tried' }
let asked: Promise<boolean> | null = null
let marked: boolean | null = null
const watching = new Set<() => void>()

function standAt(next: WhereTheMoveStands): void {
  stands = next
  for (const listener of watching) listener()
}

/** Where the move stands in this load. */
export function theMove(): WhereTheMoveStands {
  return stands
}

/** Be told when the move's standing changes. The answer stops it. */
export function watchTheMove(listener: () => void): () => void {
  watching.add(listener)
  return () => {
    watching.delete(listener)
  }
}

/**
 * Ask the move door, once a load. True when this browser is now the person: it moved, or another tab moved it first. It
 * never throws: a failure is kept with its reason.
 */
export function moveThisBrowserOnce(): Promise<boolean> {
  if (asked !== null) return asked
  standAt({ state: 'moving' })
  asked = api.moveThisBrowser(theNameThisBrowserGivesItself()).then(
    () => {
      standAt({ state: 'moved' })
      return true
    },
    async (error: unknown) => {
      if (await anotherTabMovedIt(error)) {
        standAt({ state: 'already moved' })
        return true
      }
      standAt({ state: 'not moved', reason: errorMessage(error) })
      return false
    },
  )
  return asked
}

/**
 * WHETHER ANOTHER TAB OF THIS BROWSER MOVED IT FIRST: the move was refused with 409 `nothingToMove`, and the pairing read
 * asked now says this browser is the person. Any other failure is not asked about. A read that fails cannot say, so the
 * refusal is then said with its reason, as it would have been.
 */
async function anotherTabMovedIt(error: unknown): Promise<boolean> {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== nothingToMove) return false
  try {
    return (await api.pairing()).paired
  } catch {
    return false
  }
}

/**
 * Leave the mark that the next load says the move, only when this tab moved. A storage that refuses it loses the
 * sentence and nothing else.
 */
export function sayTheMoveAfterTheReload(): void {
  // A MOVE ANOTHER TAB MADE IS SAID IN THAT TAB, so this one leaves no mark.
  if (stands.state !== 'moved') return
  try {
    window.sessionStorage.setItem(THE_MOVE_IS_TO_BE_SAID, '1')
  } catch {
    // The move is done and the halves are kept; only the sentence after the reload is lost.
  }
}

/** Whether the load before this one moved and left the mark. Read once a load, and the mark is removed as it is read. */
export function theMoveWasMarked(): boolean {
  if (marked !== null) return marked
  try {
    marked = window.sessionStorage.getItem(THE_MOVE_IS_TO_BE_SAID) !== null
    window.sessionStorage.removeItem(THE_MOVE_IS_TO_BE_SAID)
  } catch {
    marked = false
  }
  return marked
}
