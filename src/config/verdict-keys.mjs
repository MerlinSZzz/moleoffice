// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE KEYS A VERDICT MAY CARRY, IN ONE DECLARATION.
 *
 * The door at POST /api/checks/:run (src/server/api/inspection.ts) accepts exactly these keys and
 * refuses a body that carries any other with `Unrecognized key: "<key>"`. The inspector tool
 * (tools/the-inspector.mjs) composes that body from the model's answer, so it reads the same lists
 * from here instead of keeping a second copy that drifts.
 *
 * WHY THIS FILE EXISTS. Problem jdHgAVP5N0f_, 16 September 2026. The model wrote a verdict whose
 * `says` object carried a key the door does not know. The door refused the whole verdict with 400
 * and the run stayed inspecting, its forty minutes spent and its worktree kept. `says` is a strict
 * object on the door, so a key inside it fails exactly as a key at the top level does.
 *
 * ONE DECLARATION, CHECKED IN TWO PLACES. The door reads these lists and fails to load if the shape
 * it builds names a different set (src/server/api/inspection.ts), and
 * tests/an-inspector-posts-only-the-keys-the-door-accepts.test.ts compares the door's exported list
 * with these. A key added on one side alone cannot pass both.
 */

/** The keys the verdict body may carry. `read`, `wroteIntoTheOffice` and `listed` are the tool's own, never the model's; `judged` is the model's line per handed-on path (A2). */
// As item 6, step 3 of a decision says, with oj9CRzzB2_8m and chapter 7 rule 5:
// every change names its authority.
export const VERDICT_KEYS = ['verdict', 'check', 'missing', 'says', 'chaptersRead', 'read', 'judged', 'traced', 'wroteIntoTheOffice', 'decisions', 'listed', 'packages']

/**
 * WHAT EACH KEY INSIDE `says` NAMES, in the words the check's prompt and the door's refusal use.
 *
 * WHY `invariant` IS HERE. Acceptance finding 69, 24 September 2026: an inspector refused a change on invariant 5
 * of the rules (now in USER.md) and wrote `says.invariant`. The door took only a chapter or a precedent, so the tool
 * left the key out, the refusal went to the door naming no basis, and the door refused it whole: the refusal was
 * recorded nowhere. It was the second refusal lost that way (problem jdHgAVP5N0f_ was the first). Decision
 * OTB8vrTnnvhL: the door takes an invariant as a basis, and the prompt's words for what `says` takes are built from
 * this one list, so the prompt and the door cannot name different bases.
 */
export const WHAT_SAYS_NAMES = {
  chapter: 'a chapter of the code of law, by its number',
  precedent: 'a precedent, by its record id',
  invariant: 'one of the invariants USER.md lists, by its number',
}

/** The keys allowed inside `says`, which is a strict object on the door. */
export const SAYS_KEYS = Object.keys(WHAT_SAYS_NAMES)

/**
 * WHAT `says` TAKES, in one phrase built from `WHAT_SAYS_NAMES`: "`chapter` (…), `precedent` (…) or `invariant` (…)".
 * The check's prompt says it to the inspector, and the door says it back when a refusal names none of them.
 * @returns {string}
 */
export function whatSaysTakes() {
  const each = SAYS_KEYS.map((key) => `\`${key}\` (${WHAT_SAYS_NAMES[/** @type {keyof typeof WHAT_SAYS_NAMES} */ (key)]})`)
  const last = each.pop() ?? ''
  return each.length === 0 ? last : `${each.join(', ')} or ${last}`
}

/**
 * WHETHER A VALUE IS A PLAIN OBJECT rather than an array or null.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isARecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * ONE VALUE, RENDERED SHORTLY for a sentence a person reads. A long value is cut and the cut is
 * shown; a value that cannot be serialised is named by `String`, never replaced with nothing.
 * @param {unknown} value
 * @returns {string}
 */
function briefly(value) {
  let said
  try {
    said = JSON.stringify(value)
  } catch {
    said = undefined
  }
  if (said === undefined) said = String(value)
  return said.length > 200 ? `${said.slice(0, 200)}...` : said
}

/**
 * ONE SENTENCE NAMING WHAT WAS LEFT OUT, or the empty string because nothing was.
 *
 * It is folded into the verdict's `check`, the one field the door reserves for the inspector's
 * prose, so what the inspector wrote reaches the same reader instead of being lost.
 * @param {{ key: string, value: unknown }[]} dropped
 * @returns {string}
 */
export function aSentenceNamingWhatWasLeftOut(dropped) {
  if (dropped.length === 0) return ''
  const named = dropped.map((one) => `${one.key} = ${briefly(one.value)}`).join('; ')
  const howMany = dropped.length === 1 ? 'one key' : `${String(dropped.length)} keys`
  return (
    `The verdict door does not accept ${howMany} the inspector wrote, so the tool left ` +
    `${dropped.length === 1 ? 'it' : 'them'} out of the verdict: ${named}.`
  )
}

/**
 * THE BODY THE DOOR ACCEPTS, AND WHAT THE INSPECTOR WROTE THAT IT WOULD HAVE REFUSED.
 *
 * The top-level keys are filtered against `VERDICT_KEYS`; `says` is filtered again against
 * `SAYS_KEYS`; and the two keys whose values must be arrays are dropped when they are not. What was
 * dropped is folded into `check` by `aSentenceNamingWhatWasLeftOut`, so nothing the inspector meant
 * to say is lost silently.
 *
 * A REFUSAL KEEPS WHAT IS MISSING AND WHAT SAYS SO (problem -WZ40nNgHnTR, its third case). The door refuses a refusal
 * that names nothing missing or no basis, so dropping either from a refused verdict made it one the door can never
 * take: the check 4kparIQsP5jd of 4 October 2026 wrote `missing` as one string, this left it out, and the door
 * answered 400. Now a `missing` written as one sentence is taken as a list of that one sentence, and said; and a
 * refused verdict's `missing` or `says` in any other shape is kept, so the tool's check against the door's shape asks
 * the model to correct it (src/shared/the-verdict-door.ts). A release still loses them, as before: it needs neither.
 *
 * The tool still sets `read` itself after this, so a `read` the model produced is overwritten.
 * @param {Record<string, unknown>} answer
 * @returns {{ body: Record<string, unknown>, dropped: { key: string, value: unknown }[], reshaped: string[] }}
 */
export function onlyTheKeysTheDoorAccepts(answer) {
  /** @type {Record<string, unknown>} */
  const body = {}
  /** @type {{ key: string, value: unknown }[]} */
  const dropped = []
  for (const [key, value] of Object.entries(answer)) {
    if (VERDICT_KEYS.includes(key)) body[key] = value
    else dropped.push({ key, value })
  }

  if ('says' in body) {
    const says = body['says']
    if (isARecord(says)) {
      /** @type {Record<string, unknown>} */
      const kept = {}
      for (const [key, value] of Object.entries(says)) {
        if (SAYS_KEYS.includes(key)) kept[key] = value
        else dropped.push({ key: `says.${key}`, value })
      }
      body['says'] = kept
    } else if (body['verdict'] !== 'refused') {
      dropped.push({ key: 'says', value: says })
      delete body['says']
    }
  }

  /** @type {string[]} */
  const reshaped = []
  if (typeof body['missing'] === 'string' && body['missing'].trim() !== '') {
    body['missing'] = [body['missing']]
    reshaped.push('The check wrote `missing` as one sentence, so the tool took it as a list of that one sentence.')
  }
  for (const key of ['missing', 'chaptersRead']) {
    if (key in body && !Array.isArray(body[key]) && !(key === 'missing' && body['verdict'] === 'refused')) {
      dropped.push({ key, value: body[key] })
      delete body[key]
    }
  }

  const leftOut = [aSentenceNamingWhatWasLeftOut(dropped), ...reshaped].filter((one) => one !== '').join(' ')
  if (leftOut !== '' && typeof body['check'] === 'string') body['check'] = `${body['check']}\n\n${leftOut}`

  return { body, dropped, reshaped }
}
