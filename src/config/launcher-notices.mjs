// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE NOTICES THE OFFICE WRITES FOR A SANDBOX LAUNCHER, AND THE CLOCK OF ITS LONG-RUN REMINDER (problem Grbb87VX3pND;
 * way (c), XFbDHl9vZzu6, agreed in LEg_tnVeIjIB).
 *
 * Until 18 October 2026 the launcher in a sandbox sent these notices itself, as messages under the run's own key, so the
 * office read the launcher's words as the run's last word to its starter and held the run's check on them. Now the
 * launcher's finishing write carries one kind from this fixed list, as `tellTheStarter`, and the office writes its own
 * sentence from facts it holds (src/server/lib/launcher-notices.ts). The run's key can make the same write, so the list is
 * fixed, and the only word the write may add is the name of the model a Codex run stopped on, in the fixed shape
 * A_MODEL_NAME: a run can never make the office say a sentence of its own choosing. The notices of a write the office
 * refused stay with the launcher, because the office has written nothing to say them from.
 *
 * It is here, in src/config, rather than in tools/sandbox-common.mjs, because the office's own server reads it and tools/
 * never ships. tools/sandbox-common.mjs exports SANDBOX_RUN_REMINDER from here as before.
 *
 * The sentences below ship, so they say what happened and what to do, and name no decision. The comments name the
 * decisions; a comment does not ship (scripts/no-owner-content.mjs).
 */

import { LAUNCHER_MODEL_COMPATIBILITY } from './model-efforts.mjs'
import { aResetTheErrorNamed } from './stopped-run-cause.mjs'
import { A_LONG_WAIT } from './a-long-wait.mjs'

/**
 * The kinds a launcher's write may carry: a Codex run that ended at capacity, a Codex run that ended at a rate or usage
 * limit, a finish with a records submission after a clean exit, and an OpenCode run's wait on a usage limit whose next try
 * is more than an hour away. The two Codex kinds are read for every Codex model, from Codex's own final events, and the
 * write names the model as `theModelItRanOn`. The long wait comes on the write that marks the wait, once a wait.
 * @type {readonly ['codex-capacity', 'codex-usage-limit', 'ended-with-its-report', 'a-long-wait']}
 */
export const THE_LAUNCHERS_NOTICES = Object.freeze(/** @type {const} */ (['codex-capacity', 'codex-usage-limit', 'ended-with-its-report', 'a-long-wait']))

/**
 * THE SHAPE OF A MODEL'S NAME ON THE WRITE: one word of letters, digits and . _ : / @ + -, at most 200 characters. The
 * record door refuses any other name, and the launcher sends null for a model it cannot name in this shape.
 */
export const A_MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:\/@+-]{0,199}$/

/**
 * The model's name as a Codex stop's sentence gives it, or null for no name or a name not in the shape A_MODEL_NAME.
 * @param {unknown} model
 * @returns {string | null}
 */
export const aModelToName = (model) => (typeof model === 'string' && A_MODEL_NAME.test(model) ? model : null)

/**
 * @typedef {{ aliases: Record<string, string>, askAgainAfterACodexUsageLimit: Record<string, { runtime: string, model: string }> }} WhereToAskAgain
 */

/**
 * WHERE TO ASK AGAIN AFTER A CODEX USAGE LIMIT ON A MODEL: its entry in `askAgainAfterACodexUsageLimit` of
 * src/config/launcher-model-compatibility.json, found under the model's canonical name when the aliases hold one, else
 * under the name as given. Null for a model with no entry, and for no model. Only a test passes its own table.
 * @param {string | null} model
 * @param {WhereToAskAgain} [table]
 * @returns {{ runtime: string, model: string } | null}
 */
export function whereToAskAgainAfterACodexUsageLimit(model, table = LAUNCHER_MODEL_COMPATIBILITY) {
  if (model === null) return null
  const { aliases, askAgainAfterACodexUsageLimit: entries } = table
  const name = Object.hasOwn(aliases, model) ? aliases[model] ?? model : model
  return Object.hasOwn(entries, name) ? entries[name] ?? null : null
}

const NOTHING_WAS_STARTED_AGAIN = 'Nothing was started again on another model; its supervisor chooses what comes next.'

/**
 * THE SENTENCE OF A CODEX STOP, the one the launcher puts in the run's crash detail and its finish.log and the one the
 * office's line to the starter quotes. It names the model as the run's start gave it, or says "this run's model" when the
 * start named none in the shape A_MODEL_NAME. A usage limit on a model with an entry says where to ask again; any other stop
 * says that nothing was started again. Only a test passes its own table.
 * @param {'codex-capacity' | 'codex-usage-limit'} kind
 * @param {string | null} model
 * @param {WhereToAskAgain} [table]
 * @returns {string}
 */
export function aCodexStopNotice(kind, model, table = LAUNCHER_MODEL_COMPATIBILITY) {
  const named = aModelToName(model)
  if (kind === 'codex-capacity') {
    return `${named === null ? "This run's model" : `The model ${named}`} answered at capacity, so this run has ended. ${NOTHING_WAS_STARTED_AGAIN}`
  }
  const askAgain = whereToAskAgainAfterACodexUsageLimit(named, table)
  return `Codex rate-limited ${named ?? "this run's model"}, so ` +
    (askAgain === null ? `this run has ended. ${NOTHING_WAS_STARTED_AGAIN}` : `ask again with runtime ${askAgain.runtime} and model ${askAgain.model}.`)
}

/** After 8 hours, a reminder, never an automatic stop, as item 5 of a decision says. */
export const SANDBOX_RUN_REMINDER = Object.freeze({ ms: 8 * 60 * 60 * 1000, hours: 8 })

const HOUR_MS = 60 * 60 * 1000

/** A LONG WAIT ON A USAGE LIMIT is worked out in src/config/a-long-wait.mjs, which the lists in the browser read too. */
export { A_LONG_WAIT }

/**
 * THE KEY A WAIT IS ON, by its name and never its value: the provider router's slots for a run the router carries, the
 * variable OpenCode reads its key from, or OpenCode's own login when that variable holds none. The launcher puts one of
 * these in the wait's mark as `key`.
 * @type {readonly ['the-router', 'OPENCODE_API_KEY', 'opencode-login']}
 */
export const THE_KEYS_A_WAIT_NAMES = Object.freeze(/** @type {const} */ (['the-router', 'OPENCODE_API_KEY', 'opencode-login']))

/**
 * WHICH OF GO'S LIMITS ITS WORDS NAME: '5-hour', 'weekly' or 'monthly', or 'unknown' when they name none of the three.
 * Only these words come back, so the provider's own words never reach a sentence the office writes.
 * @param {unknown} said
 * @returns {'5-hour' | 'weekly' | 'monthly' | 'unknown'}
 */
export function theLimitGoNamed(said) {
  if (typeof said !== 'string') return 'unknown'
  if (/\b5-hour usage limit\b/i.test(said)) return '5-hour'
  if (/\bweekly usage limit\b/i.test(said)) return 'weekly'
  if (/\bmonthly usage limit\b/i.test(said)) return 'monthly'
  return 'unknown'
}

/**
 * How long until the next try, in whole hours, or in days and hours from two days on.
 * @param {number} ms
 */
function howLongUntil(ms) {
  const hours = Math.round(ms / HOUR_MS)
  if (hours < 2) return 'about an hour'
  if (hours < 48) return `about ${String(hours)} hours`
  const days = Math.floor(hours / 24)
  const left = hours % 24
  return `about ${String(days)} days${left === 0 ? '' : ` and ${String(left)} ${left === 1 ? 'hour' : 'hours'}`}`
}

/**
 * THE NEXT TRY AS THE OFFICE'S LINE MAY SHOW IT, or why its time is not given. The time comes from a mark the run's own key
 * can write as well, so it is shown only when the error named the reset, which makes it OpenCode's own next try; when it
 * falls after the moment the wait was seen; and when it is at most 32 days away. Otherwise the line quotes no date, and the
 * reason is one from this fixed list.
 * @param {Record<string, unknown>} mark
 * @param {number} nowMs
 * @returns {{ atMs: number, inMs: number } | { notGiven: string }}
 */
export function theNextTryToShow(mark, nowMs) {
  const atMs = typeof mark['resetsAt'] === 'string' ? Date.parse(mark['resetsAt']) : Number.NaN
  const seenAtMs = typeof mark['seenAt'] === 'string' ? Date.parse(mark['seenAt']) : Number.NaN
  if (!aResetTheErrorNamed(mark['resetFrom'])) return { notGiven: "OpenCode's retry named no reset, and the office has only an assumed one" }
  if (!Number.isFinite(atMs)) return { notGiven: 'the mark gives no time the office can read' }
  if (!Number.isFinite(seenAtMs)) return { notGiven: 'the mark gives no time at which the wait was seen' }
  if (atMs < seenAtMs) return { notGiven: 'the mark puts it before the moment the wait was seen' }
  if (atMs - nowMs > A_LONG_WAIT.atMostMs) {
    return { notGiven: `the mark puts it more than ${String(A_LONG_WAIT.atMostDays)} days away, longer than any limit Go names` }
  }
  return { atMs, inMs: atMs - nowMs }
}

/**
 * THE SENTENCE OF A LONG WAIT, the one the office's line gives. Every part comes from a fixed list or from a time the office
 * checked: the run's id, the limit `theLimitGoNamed` read, whether the provider is OpenCode Go, the next try as the office's
 * own clock writes it and how far away it is, or why that time is not given (`theNextTryToShow`), and the key by its name.
 * For a run the router carries, `slots` names the router's Go slots as the office holds them, none when it holds none, or
 * is null when the office could not read them.
 * @param {{ run: string, provider: string | null, limit: ReturnType<typeof theLimitGoNamed>,
 *   nextTry: { at: string, inMs: number } | { notGiven: string }, key: (typeof THE_KEYS_A_WAIT_NAMES)[number],
 *   slots: readonly string[] | null }} wait
 * @returns {string}
 */
export function aLongWaitNotice(wait) {
  const whose = wait.provider === 'opencode-go' ? 'OpenCode Go' : 'its provider'
  const limit = wait.limit === 'unknown' ? `a usage limit of ${whose}, and the words do not say which one` : `${whose}'s ${wait.limit} usage limit`
  const when = 'notGiven' in wait.nextTry
    ? `The write that marked the wait puts OpenCode's next try more than an hour away. Its time is not given, because ` +
      `${wait.nextTry.notGiven}. The run does nothing until that try, though it still says running.`
    : `OpenCode tries again at ${wait.nextTry.at}, in ${howLongUntil(wait.nextTry.inMs)}, and the run does nothing until ` +
      'then, though it still says running.'
  const key =
    wait.key === 'OPENCODE_API_KEY' ? 'the key in OPENCODE_API_KEY'
      : wait.key === 'opencode-login' ? "OpenCode's own login"
        : wait.slots === null ? "the provider router's OpenCode Go key slots, whose names the office could not read"
          : wait.slots.length === 0 ? "the provider router's OpenCode Go key slots, of which the office holds none"
            : `the provider router's OpenCode Go key ${wait.slots.length === 1 ? 'slot' : 'slots'} ${wait.slots.join(', ')}`
  return (
    `Run ${wait.run} is waiting on ${limit}. ${when} It waits on ${key}. The provider's own words are on the run's page. ` +
    "Nothing was stopped, and the run's starter decides whether it should wait."
  )
}
