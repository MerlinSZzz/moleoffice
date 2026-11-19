// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE ONE-VERSION KEY WINDOW IS STILL OPEN — CRITERION P83, POINT 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * For one version a request that carries the person's headers and no key still counts when a
 * listener carried it from this computer or from a machine on the trusted list (P73). Every such
 * request is written to the list on the Settings page, which is what they read before they close the
 * window. One press beside that list closes both halves at once — this computer and the trusted
 * machines — and it is recorded as their act: when, which kind of caller, and which one.
 *
 * This is the shared shape of that one fact. The server that reads and writes it and the Settings
 * page that draws it cannot drift about what "the window" holds.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ONE STATE AND NOT TWO
 * ---------------------------------------------------------------------------------------
 *
 * There is deliberately no separate switch for the remote half. The window covers every caller the
 * office trusts today, and the press closes all of them. A second field here would be a second
 * switch that no press sets.
 *
 * `open` IS TRUE UNTIL SOMEBODY CLOSES IT, and an installation whose row records no close is open.
 * That is the shipped state: the press exists and closing it is theirs to do.
 */

/** Who closed the window, as the same kind-and-id pair trusted_machines stores. */
export interface WindowClosedBy {
  /** `person` or `agent`, the same word `added_by_kind` on trusted_machines holds. */
  kind: string
  /** The one who closed it. */
  id: string
}

/** What `GET /api/office/key-window` answers, and what the close press answers with. */
export interface WhatTheKeyWindowSays {
  /** True while a claim with no key still counts from this computer and the trusted machines. */
  open: boolean
  /** When it was closed, local wall clock, or null because it is open. */
  closedAt: string | null
  /** Who closed it, or null because nobody has. */
  closedBy: WindowClosedBy | null
}

/**
 * WHAT THE SETTINGS PAGE READS: the window's own state, plus whether the caller may press.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PRESS'S ANSWER IS ON THE READING
 * ---------------------------------------------------------------------------------------
 *
 * The close press is refused to a browser the window itself made the person. That browser holds no
 * key, so pressing would shut it out and a terminal would be the only way back. The panel beside the
 * list must not draw a button that browser cannot press, and it cannot work that out for itself: the
 * answer is a fact about the request, established by the listener and the key that a browser never
 * sees. So the read carries it, and the panel draws from it.
 *
 * THE FIELD IS COMPUTED WHERE THE DOOR COMPUTES IT, in `aKeyProvesThisCaller` and
 * `theClosePressIsOpenTo` (src/server/lib/keywindow.ts), so a page and a door cannot disagree about
 * who may press.
 */
export interface WhatTheKeyWindowSaysToThisCaller extends WhatTheKeyWindowSays {
  /**
   * True only when this caller could press the close and have the door accept it.
   *
   * `false` on a browser that holds no key, on a caller from another machine (the press is kept on
   * this machine), and on anything that is not the person or a secretary acting for them here.
   */
  mayPress: boolean
  /**
   * WHY THE CLOSE WOULD BE REFUSED NOW, or null because nothing refuses it for that reason. By point 3
   * of one of the owner's decisions, the press refuses while a live agent holds no proved key.
   * Worked out by `whyTheKeyWindowMayNotCloseYet` in src/server/lib/provedkeys.ts, the same function
   * the press asks, so the page and the press say one thing. Null on a closed window.
   */
  closeIsRefusedBecause: TheLiveAgentsWithNoProvedKey | null
}

/**
 * WHY ONE LIVE AGENT HOLDS NO PROVED KEY. Each word is one reason, and the reader works out which.
 *
 *   never-held-a-key                       no key of it was ever made
 *   every-key-revoked                      it held keys, and every one is revoked
 *   only-keys-given-without-a-key          every live key was made for a request that carried no key
 *   only-keys-whose-proof-nobody-recorded  every live key was made before the office recorded how
 *   only-keys-given-on-an-unproved-key     every live key was made on an agent's key that was not proved
 *   only-unproved-keys-of-several-kinds    its live keys are unproved in more than one of those ways
 */
export type WhyAnAgentHoldsNoProvedKey =
  | 'never-held-a-key'
  | 'every-key-revoked'
  | 'only-keys-given-without-a-key'
  | 'only-keys-whose-proof-nobody-recorded'
  | 'only-keys-given-on-an-unproved-key'
  | 'only-unproved-keys-of-several-kinds'

/** One live agent that holds no proved key, and why. */
export interface AnAgentWithNoProvedKey {
  /** The agent's registry id. */
  id: string
  /** Its handle, for a person to read. */
  handle: string
  why: WhyAnAgentHoldsNoProvedKey
  /** True when it was registered with no key of its own and no door may give it one. */
  registeredWithNoKeyOfItsOwn: boolean
}

/** Every live agent that holds no proved key, and the sentence that says so. */
export interface TheLiveAgentsWithNoProvedKey {
  /** How many live agents hold no proved key. Always the length of `agents`. */
  count: number
  /** All of them, by handle. The sentence names only the first few; this list is whole. */
  agents: AnAgentWithNoProvedKey[]
  /** The sentence the page draws and the press refuses with, without the press's last words. */
  says: string
}
