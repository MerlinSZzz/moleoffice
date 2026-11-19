// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO HAS CALLED WITH A CLAIM AND NO KEY — CRITERION P83, POINT 6, THE LIST HALF.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * For one version a claim with no key still counts from loopback and from the machines on the
 * trusted list, and every such request is folded into `header_only_calls` as one small row per
 * caller per day. This is the shared shape of that reading, so the server that writes the door and
 * the Settings page that draws the list cannot drift about what a row holds.
 *
 * IT IS A LIST OF CLAIMS AND NOT OF PEOPLE. Mole Office did not establish who any caller was: a
 * caller here sent a name in a header and held no key, which is the whole of what is known. The
 * sentence in `says` says so on the page, and nothing here adds a fact the office does not have.
 */

/** One caller that sent a claim and no key, folded by the day it called. */
export interface AHeaderOnlyCaller {
  /** What the caller said it was: `human`, `agent` or `system`. Drawn through the words table. */
  actorType: string
  /** The name the caller gave. Empty when it sent a kind of header but named nobody. */
  actorId: string
  /** The address the call came from, or null because none could be read. */
  clientAddr: string | null
  /** `local`, `remote`, or null because the request came through no listener. */
  clientOrigin: string | null
  /** The local wall-clock day, `YYYY-MM-DD`. */
  day: string
  /** When this caller was first seen on that day, local wall clock. */
  firstSeen: string
  /** When it was last seen on that day, local wall clock. */
  lastSeen: string
  /** How many header-only calls it made on that day. */
  calls: number
}

/** What `GET /api/office/header-only-calls` answers. */
export interface WhatTheHeaderOnlyCallersSay {
  /** Every caller, newest last-seen first. */
  callers: AHeaderOnlyCaller[]
  /** What the list decides and what it does not, in one sentence, said by the server. */
  says: string
}
