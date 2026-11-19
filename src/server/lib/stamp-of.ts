// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `stampOf` was moved byte for byte out of src/server/lib/sessions.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { ObservedSessionState } from './adapters/index.ts'
import { OBSERVED_SESSION_STATES } from './adapters/types.ts'
import type { PanelRecord } from '@shared/types.ts'
import { discoveryBagOf } from '@shared/discovery-stamp.ts'
import type { DiscoveryStamp } from './sessions.ts'

/**
 * The stamp on a record, when it has one and it is usable.
 *
 * ---------------------------------------------------------------------------------------
 * IT HANDS BACK ONLY WHAT IT HAS CHECKED, AND THAT IS THE POINT OF THE FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * This used to check three keys and then cast the whole object to `DiscoveryStamp`. Every other
 * field was whatever happened to be stored, with a type saying it was a string or a list. A stamp
 * holding only the three checked keys — which `tests/agent-dispatch.test.ts` writes, and which an
 * agent writing `data.extra.discovered` by hand through the API produces — therefore reached
 * `pickUpOf` in lib/recipients.ts as `resumeCommand: undefined` while the reply's type promised
 * `string | null`. A caller reading that field got a missing key rather than the null it was told
 * to expect. `viewFromRecord` below already worked around it with `?? []` and `?? false` on two
 * fields, which is the defect being fixed one layer too late.
 *
 * So each field is read on its own here. The three that name the conversation are required: a stamp
 * missing any of them cannot be matched to a transcript and is treated as absent rather than
 * half-used. Everything else becomes null, an empty list, or false when it is missing or is not the
 * type it claims — never a guess, and never a value the reader has not looked at.
 *
 * WHY MISSING FIELDS DO NOT MAKE THE WHOLE STAMP ABSENT. What a routing reply most needs is which
 * conversation a run is and where its transcript is. Throwing that away because nobody recorded
 * `filesTouched` would turn "we know the conversation and little else" into "nobody recorded a
 * conversation for this run", which is a different and worse answer.
 */
export function stampOf(record: Pick<PanelRecord, 'data'>): DiscoveryStamp | null {
  const s = discoveryBagOf(record)
  if (s === null) return null
  const text = (key: string): string | null => (typeof s[key] === 'string' ? (s[key] as string) : null)

  // tool and externalId are what a record is MATCHED on, and logPath is what says whether the
  // conversation is still on this machine. A stamp missing any of the three cannot be matched to
  // anything, so it is treated as absent rather than half-used.
  const tool = text('tool')
  const externalId = text('externalId')
  const logPath = text('logPath')
  if (tool === null || externalId === null || logPath === null) return null

  const word = text('observedState')
  const files = s['filesTouched']
  const paths = Array.isArray(files) ? files.filter((one): one is string => typeof one === 'string') : null
  return {
    tool,
    externalId,
    logPath,
    resumeCommand: text('resumeCommand'),
    startedAt: text('startedAt'),
    entryPoint: text('entryPoint'),
    observedState:
      word !== null && (OBSERVED_SESSION_STATES as readonly string[]).includes(word)
        ? (word as ObservedSessionState)
        : null,
    stateReason: text('stateReason'),
    filesTouched: paths ?? [],
    // A list nobody could read is not a complete list. Both halves have to be there before this
    // says the files are all of them.
    filesComplete: paths !== null && s['filesComplete'] === true,
    at: text('at'),
  }
}
