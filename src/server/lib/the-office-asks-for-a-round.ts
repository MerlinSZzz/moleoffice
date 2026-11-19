// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ASKS FOR A ROUND ITSELF (wave 13u round 90). When an entry would land handed back but its line has no run
 * going, the merge queue asks the next-round door for that line's supervisor, or for the build sheriff, in this process.
 * The same is done for the brief of a conflict or a red handed back to a supervisor with no run going.
 *
 * The door takes such an ask only while this mark is set, only for the agent and the brief the mark names, and only
 * from the office's own writer with no key. A request over HTTP cannot set the mark: it is set here, around one call,
 * and taken off when the call returns or throws. The door's ask is synchronous, so no other request runs while it is
 * set. This module imports nothing, so the door can read the mark without importing the merge queue.
 */

export interface TheRoundTheOfficeAsks {
  agent: string
  brief: string
  repair?: { entry: string; dueAt: string }
}

let asking: TheRoundTheOfficeAsks | null = null

/** Run `act` with the mark set for this one agent and brief. A second mark inside the first is a broken assumption. */
export function asTheOfficeAsking<T>(ask: TheRoundTheOfficeAsks, act: () => T): T {
  if (asking !== null) throw new Error(`The office is already asking for a round of ${asking.agent}, so it cannot ask for one of ${ask.agent} inside that ask.`)
  asking = { ...ask }
  try {
    return act()
  } finally {
    asking = null
  }
}

/** The round the office is asking for right now, or null when it is asking for none. */
export function theRoundTheOfficeIsAsking(): TheRoundTheOfficeAsks | null {
  return asking === null ? null : { ...asking }
}
