// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION THE OFFICE'S OWN KEY FILED UNDER AN AGENT'S NAME, AND THAT AGENT'S OWN KEY HOLDS.
 *
 * At a session's start the session hook knows the session's agent by name, and often not the agent's key. It then files
 * the session with the office's key under the agent's name. The agent's own key was refused on that session afterwards
 * (`whyAnAgentsOwnKeyDoesNotHold` in ./the-run-a-key-holds.ts), because nothing said the office filed it for that agent.
 * `heldByItsFiler: true` says so, and that rule reads it from the session's first revision.
 *
 * IT IS NOT `servingAgent`. A session that serves an agent, ran as one (`ranAs`) or names a submission is work handed in:
 * the office seals it when it ends and tells the person (`runSubmitsWork` in ./sealed-tip.ts). This field gives holding
 * and nothing else.
 *
 * WHO WRITES IT: the office's own key, as true, in the write that files a session under an agent's name. Every other
 * write that would set it, change it or drop it is refused.
 */
import { isDeepStrictEqual } from 'node:util'
import type { Actor } from './records.ts'

/** The session field. The session hook writes the same word in for-agents/session-hook.mjs. */
export const HELD_BY_ITS_FILER = 'heldByItsFiler'

/** The refusal of `heldByItsFiler` at the record door, on a create and on a patch, which a revision restore is. */
export const ONLY_THE_OFFICES_KEY_FILES_A_SESSION_HELD_BY_ITS_FILER =
  `${HELD_BY_ITS_FILER} is written only by the office's own key, as true, in the write that files a session under an ` +
  "agent's name. No other write may set, change or drop it. Nothing was written."

/**
 * WHY THIS WRITE MAY NOT PUT `heldByItsFiler` WHERE IT WOULD PUT IT, or null when it may. `stored` is the record's data
 * now, or null on the write that files the record; `whole` is the data the write would store.
 */
export function whyThisWriteMayNotMoveHeldByItsFiler(
  kind: string,
  stored: Record<string, unknown> | null,
  whole: Record<string, unknown>,
  actor: Actor,
): string | null {
  const then = whole[HELD_BY_ITS_FILER]
  if (stored !== null) return isDeepStrictEqual(stored[HELD_BY_ITS_FILER], then) ? null : ONLY_THE_OFFICES_KEY_FILES_A_SESSION_HELD_BY_ITS_FILER
  if (then === undefined) return null
  const theOfficesKeyFilesASessionForAnAgent = kind === 'session' && actor.type === 'agent' && actor.provedBy === 'the-office-key'
  return then === true && theOfficesKeyFilesASessionForAnAgent ? null : ONLY_THE_OFFICES_KEY_FILES_A_SESSION_HELD_BY_ITS_FILER
}
