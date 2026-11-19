// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER AGENTS MAY INJECT: THE ONE SETTING, READ AND WRITTEN HERE AND NOWHERE ELSE.
 * Criteria M84 and M91.
 *
 * ---------------------------------------------------------------------------------------
 * THE SETTING
 * ---------------------------------------------------------------------------------------
 *
 * M91: it is one setting, on the Settings page, drawn as a toggle, and it is one switch for all
 * agents rather than one per agent.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT LIVES, AND WHAT EACH VALUE MEANS
 * ---------------------------------------------------------------------------------------
 *
 * One column on the installation row, `agents_may_inject`, added by migration 0175. NULL is nobody
 * having chosen, and it reads as "agents may inject", which is what every agent could do before
 * anybody had a switch. 1 is the switch on and 0 is the switch off.
 *
 * A VALUE THAT IS NEITHER is not guessed at. `whetherAgentsMayInject` throws a 500 that names the
 * column and the value, so the message door and the profile stop rather than let an agent through, or
 * keep one out, on a reading nobody made.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY PLACE THAT ASKS, ASKS THIS
 * ---------------------------------------------------------------------------------------
 *
 * The message write door (src/server/lib/records.ts, through `whyThisInjectIsRefused`), the profile
 * (src/server/api/participants.ts) and the Settings door (src/server/api/inject-setting.ts). So the
 * profile, the Settings page and the refusal can never disagree about whether agents may inject.
 * The `mayInject` field an old `agent` record may carry is not read by anything.
 */

import { INJECT_WORDS, type MayInject } from '@shared/profile.ts'
import { sqlite } from '../db/client.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. A plain Error is answered as "internal error"
// and its words stay in the server log. It is only built when a reader throws, never at import, so
// records.ts importing this file and this file importing records.ts is safe.
import { PanelError } from './panel-error.ts'

/** The stored value exactly as SQLite hands it over, or null because nobody chose or there is no row. */
function theStoredValue(): unknown {
  const row = sqlite.prepare('SELECT agents_may_inject AS may FROM installation WHERE only_row = 1').get() as
    | { may: unknown }
    | undefined
  return row?.may ?? null
}

/**
 * WHETHER AGENTS MAY INJECT, AND WHO CHOSE. The one reader.
 *
 * Read from the row on every call, with nothing cached, so a switch pressed on the Settings page
 * holds for the very next message.
 */
export function whetherAgentsMayInject(): MayInject {
  const stored = theStoredValue()
  const whereItIsSet = INJECT_WORDS.whereItIsSet
  if (stored === null) return { may: true, nobodyChose: true, says: INJECT_WORDS.nobodyChose, whereItIsSet }
  if (stored === 1) return { may: true, nobodyChose: false, says: INJECT_WORDS.switchedOn, whereItIsSet }
  if (stored === 0) return { may: false, nobodyChose: false, says: INJECT_WORDS.switchedOff, whereItIsSet }
  throw new PanelError(
    `Whether agents may inject is stored as ${JSON.stringify(stored)} in installation.agents_may_inject, and this ` +
      'office reads only nothing, 0 or 1 there. Nothing was guessed and nothing was changed.',
    500,
  )
}

/**
 * SET WHETHER AGENTS MAY INJECT, AND ANSWER WITH THE READING AS IT NOW STANDS.
 *
 * `true` switches it on, `false` off, and `null` takes the choice away again. The caller has
 * already checked who is asking and what was sent. An update that changed no row means this
 * database has no installation row, and that is said rather than answered as done.
 */
export function setWhetherAgentsMayInject(may: boolean | null): MayInject {
  const written = sqlite
    .prepare('UPDATE installation SET agents_may_inject = ? WHERE only_row = 1')
    .run(may === null ? null : may ? 1 : 0)
  if (written.changes !== 1) {
    throw new PanelError(
      'This database has no installation row, so whether agents may inject could not be stored. Nothing was changed.',
      500,
    )
  }
  return whetherAgentsMayInject()
}
