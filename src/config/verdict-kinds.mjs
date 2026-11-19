// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE FOUR KINDS OF FAULT A CHECK REFUSES, and the faults it lists instead.
 *
 * A check refuses a run only when its change (1) stops the office
 * from starting or the build from passing, (2) loses or overwrites data, (3) lets somebody do what
 * only the person may do, or (4) breaks another line's work. Every other fault in code, proof or
 * design is listed for the line's next round. The owner's second decision of that day adds that a fault of
 * form in a record, and a test that copies a value the code defines, are listed to patch after the
 * landing rather than refused.
 *
 * WHY THIS IS A FILE OF ITS OWN. The check's prompt, the inspector tool and the verdict door all
 * name the same four kinds and the same two places a listed fault is fixed. A second copy of the
 * words in any of them would drift, so the words are declared here once. The tool reads this module
 * before it trims the model's answer to the door's keys: an item that names a kind in
 * THE_FOUR_KINDS stays a refusal, and an item that names no kind (or names a fault of form) becomes
 * a listed item, so a refusal cannot be posted for a fault that should only be listed.
 */

/** The four kinds of fault a check refuses a run for, in the owner's order. */
export const THE_FOUR_KINDS = ['start-or-build', 'data', 'person-only', 'another-line']

/** What each of the four kinds means, in the words the check's prompt gives the model. */
export const WHAT_A_KIND_IS = {
  'start-or-build': 'the office cannot start, or the build cannot pass',
  data: 'data is lost or overwritten',
  'person-only': 'somebody can do what only the person may do',
  'another-line': "another line's work breaks",
}

/** Where a listed fault is fixed: in the line's next round, or in the office records after the landing. */
export const WHERE_A_LISTED_FAULT_IS_FIXED = ['next-round', 'after-landing']

/** The longest an unread part is written on the check, in characters; a longer part is cut and marked. */
export const THE_LENGTH_AN_UNREAD_PART_KEEPS = 200

/**
 * A fault of form in a record, in the words a check is likely to use for it. A listed item with no
 * place of its own is patched after the landing when it speaks about a record this way, and fixed in
 * the line's next round otherwise. The list is a reading of the owner's second decision of that day, not a second
 * rule: the model is asked to say where an item is fixed, and this only covers an item that did not.
 */
const A_RECORD_FAULT = /\b(short form|label|title|doing line|chaptersRead|revisit_when|audit table|record|link|field|count)\b/i

/** A test or proof fault, which is fixed in the line's next round rather than in the office records. */
const A_PROOF_FAULT = /\b(test|proof|mutation|criterion|copy|copies|copied)\b/i

/**
 * One item as the model may have written it: a sentence, or an object with `what` and `kind` (a
 * refusal) or `what` and `where` (a listed fault).
 * @param {unknown} item
 * @returns {{ what: string, kind: string, where: string }}
 */
function anItem(item) {
  if (typeof item === 'string') return { what: item.trim(), kind: '', where: '' }
  if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
    const held = /** @type {Record<string, unknown>} */ (item)
    return {
      what: typeof held['what'] === 'string' ? held['what'].trim() : '',
      kind: typeof held['kind'] === 'string' ? held['kind'].trim() : '',
      where: typeof held['where'] === 'string' ? held['where'].trim() : '',
    }
  }
  return { what: '', kind: '', where: '' }
}

/**
 * Where a listed fault is fixed. The model's own `where` wins; a kind that names code or proof goes
 * to the next round; a kind that names a record, or words that speak about a record, go after the
 * landing; everything else goes to the next round.
 * @param {{ what: string, kind: string, where: string }} item
 * @returns {'next-round' | 'after-landing'}
 */
function whereItIsFixed(item) {
  if (item.where === 'next-round' || item.where === 'after-landing') return item.where
  if (item.kind === 'code' || item.kind === 'proof') return 'next-round'
  if (item.kind === 'form' || item.kind === 'record') return 'after-landing'
  if (A_RECORD_FAULT.test(item.what) && !A_PROOF_FAULT.test(item.what)) return 'after-landing'
  return 'next-round'
}

/**
 * Whether a part of the check's list holds nothing to read, so it is empty rather than unreadable.
 * @param {unknown} part
 * @returns {boolean}
 */
function itIsEmpty(part) {
  if (part === undefined || part === null) return true
  if (typeof part === 'string') return part.trim() === ''
  if (Array.isArray(part)) return part.length === 0
  if (typeof part === 'object') return Object.keys(part).length === 0
  return false
}

/**
 * One part as the check wrote it, cut to the exported length and marked when it had to be cut.
 * @param {unknown} part
 * @returns {string}
 */
function thePartAsWritten(part) {
  const written = JSON.stringify(part) ?? String(part)
  return written.length > THE_LENGTH_AN_UNREAD_PART_KEEPS ? `${written.slice(0, THE_LENGTH_AN_UNREAD_PART_KEEPS)}…` : written
}

/**
 * The door's own sides when the part has one or both of them, and null when it has neither.
 * @param {unknown} part
 * @returns {string[] | null}
 */
function theDoorSides(part) {
  if (typeof part !== 'object' || part === null || Array.isArray(part)) return null
  const held = /** @type {Record<string, unknown>} */ (part)
  const sides = ['nextRound', 'afterLanding'].filter((side) => Object.prototype.hasOwnProperty.call(held, side))
  return sides.length === 0 ? null : sides
}

/**
 * The faults a model put in `listed`, split into the two sides the door stores them on, and the parts
 * that could not be read as a fault at all. A list is read item by item; the door's own shape keeps
 * each item on the side it was written on; one item is read as a list of one. An unread part is kept
 * written as it was, so the check can say what it could not read instead of dropping it in silence.
 * @param {unknown} listed
 * @returns {{ nextRound: string[], afterLanding: string[], unread: string[], read: number }}
 */
function theListedParts(listed) {
  /** @type {string[]} */
  const nextRound = []
  /** @type {string[]} */
  const afterLanding = []
  /** @type {string[]} */
  const unread = []
  let read = 0

  /**
   * Read one item, on the side it was given or by its kind when no side was given.
   * @param {unknown} raw
   * @param {string | null} side
   */
  const place = (raw, side) => {
    const item = anItem(raw)
    if (item.what === '') {
      if (!itIsEmpty(raw)) unread.push(thePartAsWritten(raw))
      return
    }
    read += 1
    if (side === 'nextRound') nextRound.push(item.what)
    else if (side === 'afterLanding') afterLanding.push(item.what)
    else if (whereItIsFixed(item) === 'after-landing') afterLanding.push(item.what)
    else nextRound.push(item.what)
  }

  const sides = theDoorSides(listed)
  if (sides !== null) {
    const held = /** @type {Record<string, unknown>} */ (listed)
    for (const side of sides) {
      const one = held[side]
      for (const raw of Array.isArray(one) ? one : [one]) place(raw, side)
    }
    for (const key of Object.keys(held)) {
      if (sides.includes(key)) continue
      if (!itIsEmpty(held[key])) unread.push(thePartAsWritten({ [key]: held[key] }))
    }
    return { nextRound, afterLanding, unread, read }
  }

  if (Array.isArray(listed)) {
    for (const raw of listed) place(raw, null)
    return { nextRound, afterLanding, unread, read }
  }

  if (typeof listed === 'object' && listed !== null) place(listed, null)
  else if (typeof listed === 'string') place(listed, null)
  else if (!itIsEmpty(listed)) unread.push(thePartAsWritten(listed))
  return { nextRound, afterLanding, unread, read }
}

/**
 * The two lines that carry the listed faults into the check sentence, or the empty string.
 * @param {string[]} nextRound
 * @param {string[]} afterLanding
 * @returns {string}
 */
export function theListedFaultsSay(nextRound, afterLanding) {
  /** @type {string[]} */
  const parts = []
  if (nextRound.length > 0) parts.push(`To fix in the line's next round:\n${nextRound.map((one) => `- ${one}`).join('\n')}`)
  if (afterLanding.length > 0) parts.push(`To patch after the landing:\n${afterLanding.map((one) => `- ${one}`).join('\n')}`)
  return parts.join('\n\n')
}

/**
 * The line that says which parts of the check's list the tool could not read as a fault, and one line
 * for each, or the empty string when every part was read. A part that was not read is in neither side,
 * so the check says so rather than letting it disappear.
 * @param {string[]} unread
 * @returns {string}
 */
export function theUnreadPartsSay(unread) {
  if (unread.length === 0) return ''
  const onePart = unread.length === 1
  return (
    `The tool could not read ${onePart ? 'this part' : 'these parts'} of the check's list as a fault, so ` +
    `${onePart ? 'it is' : 'they are'} in neither list:\n${unread.map((part) => `- ${part}`).join('\n')}`
  )
}

/**
 * THE LISTED FAULTS WITH MORE FOR THE LINE'S NEXT ROUND, put together in the one block the check's text carries. The
 * verdict door adds here each point of an inside package that does not hold: the block the tool wrote into `check` is
 * replaced by the whole block, or the whole block is added when the tool wrote none, so no fault is written twice.
 * @param {string} check
 * @param {{ nextRound: string[], afterLanding: string[] } | undefined} listed
 * @param {string[]} more
 * @returns {{ check: string, listed: { nextRound: string[], afterLanding: string[] } | undefined }}
 */
export function theListedFaultsWith(check, listed, more) {
  const before = listed ?? { nextRound: [], afterLanding: [] }
  const fresh = more.filter((one, at) => more.indexOf(one) === at && !before.nextRound.includes(one))
  if (fresh.length === 0) return { check, listed }
  const after = { nextRound: [...before.nextRound, ...fresh], afterLanding: before.afterLanding }
  const old = theListedFaultsSay(before.nextRound, before.afterLanding)
  const at = old === '' ? -1 : check.lastIndexOf(old)
  const block = theListedFaultsSay(after.nextRound, after.afterLanding)
  return { check: at < 0 ? `${check}\n\n${block}` : check.slice(0, at) + block + check.slice(at + old.length), listed: after }
}

/**
 * WHETHER A CHECK IS A CHECK OF HANDED-BACK PACKAGES: the office lists one or more inside packages the run handed back,
 * whether or not their points could be read. Such a check judges each point and looks for the four kinds of fault, and
 * nothing else. The check's prompt, the verdict door, the release and the check tool all ask this one reading.
 * @param {unknown} packages the packages the office lists for the run, as `{ packages, unread }`
 * @returns {boolean}
 */
export function aCheckOfHandedBackPackages(packages) {
  if (typeof packages !== 'object' || packages === null) return false
  const held = /** @type {Record<string, unknown>} */ (packages)
  return [held['packages'], held['unread']].some((one) => Array.isArray(one) && one.length > 0)
}

/**
 * The line that names the faults a check of handed-back packages listed outside its points, or the empty string. They
 * are on neither side of the list, so the check says so rather than letting them disappear.
 * @param {string[]} leftOff
 * @returns {string}
 */
export function theFaultsLeftOffTheListSay(leftOff) {
  if (leftOff.length === 0) return ''
  const one = leftOff.length === 1
  return (
    `The check also listed ${one ? 'this' : 'these'}. A check of handed-back packages lists only the points that do not hold, ` +
    `so ${one ? 'it is' : 'they are'} left off the list:\n${leftOff.map((item) => `- ${item}`).join('\n')}`
  )
}

/**
 * ONLY THE POINTS ARE LISTED in a check of handed-back packages: its list of things to fix holds each point that does
 * not hold, and nothing else. The block the tool wrote into `check` from the model's own list is taken out, the block of
 * the points is written at the end, and every other fault the check listed is named below it as left off the list.
 * @param {string} check
 * @param {{ nextRound: string[], afterLanding: string[] } | undefined} listed
 * @param {string[]} points
 * @returns {{ check: string, listed: { nextRound: string[], afterLanding: string[] } | undefined }}
 */
export function onlyThePointsAreListed(check, listed, points) {
  const before = listed ?? { nextRound: [], afterLanding: [] }
  const kept = points.filter((one, at) => points.indexOf(one) === at)
  const leftOff = [...before.nextRound, ...before.afterLanding].filter((one) => !kept.includes(one))
  const old = theListedFaultsSay(before.nextRound, before.afterLanding)
  const at = old === '' ? -1 : check.lastIndexOf(old)
  const without = at < 0 ? check : `${check.slice(0, at).trimEnd()}${check.slice(at + old.length)}`
  const block = [theListedFaultsSay(kept, []), theFaultsLeftOffTheListSay(leftOff)].filter((one) => one !== '').join('\n\n')
  return { check: block === '' ? without : `${without}\n\n${block}`, listed: kept.length === 0 ? undefined : { nextRound: kept, afterLanding: [] } }
}

/**
 * ONLY THE REAL FAULTS REMAIN A REFUSAL. Every `missing` item must name one of THE_FOUR_KINDS; an
 * item that names no kind, or names a fault of form, is moved to `listed`. A `listed` the model wrote
 * is read as a list, as the door's own two sides, or as one item, whichever shape it has. When no real
 * fault is left and at least one item was read, the verdict becomes `released`, its `says` is dropped
 * and the listed faults are written into `check`, which is what the door accepts and what the release
 * carries. A refused answer that reads no item at all — its `missing` absent or empty — is left as the
 * refusal for the door's correction, never released. A part of `listed` that reads no fault is not
 * counted as read: it is returned in `unread` and said in the check after the two headings, so a
 * shape the tool could not read is never silently dropped.
 *
 * @param {unknown} answer the model's answer, before the tool trims it to the door's keys
 * @returns {{ answer: unknown, listed: { nextRound: string[], afterLanding: string[] }, unread: string[], changed: boolean }}
 */
export function onlyTheRealFaults(answer) {
  const nothing = { answer, listed: { nextRound: /** @type {string[]} */ ([]), afterLanding: /** @type {string[]} */ ([]) }, unread: /** @type {string[]} */ ([]), changed: false }
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return nothing
  const held = /** @type {Record<string, unknown>} */ (answer)
  const verdict = held['verdict']
  if (verdict !== 'refused' && verdict !== 'released') return nothing

  // A SINGLE ITEM WRITTEN AS ONE OBJECT IS STILL AN ITEM. It used to be read as an empty list, so a refusal whose
  // one real fault was written this way became a release and the fault was lost. A missing that is absent or empty
  // on a refused verdict reads no item at all, and then the refusal is left for the door's correction: the shape of
  // a list never turns a refusal into a release.
  const said = held['missing']
  const missing = Array.isArray(said) ? said : said === undefined || said === null ? [] : [said]
  const fromTheList = theListedParts(held['listed'])
  /** @type {string[]} */
  const real = []
  const { nextRound, afterLanding, unread } = fromTheList
  let moved = false
  let normalised = false
  let read = fromTheList.read

  for (const raw of missing) {
    const item = anItem(raw)
    if (typeof raw !== 'string') normalised = true
    if (item.what === '') continue
    read += 1
    if (THE_FOUR_KINDS.includes(item.kind)) real.push(item.what)
    else {
      moved = true
      if (whereItIsFixed(item) === 'after-landing') afterLanding.push(item.what)
      else nextRound.push(item.what)
    }
  }

  const listed = theListedFaultsSay(nextRound, afterLanding)
  const unreadWords = theUnreadPartsSay(unread)
  const releases = verdict === 'refused' && real.length === 0 && read > 0
  const changed = moved || normalised || fromTheList.read > 0 || unread.length > 0 || releases
  if (!changed) return nothing

  const next = { ...held }
  delete next['listed']
  if (releases) {
    next['verdict'] = 'released'
    delete next['missing']
    delete next['says']
  } else if (real.length > 0) {
    next['missing'] = real
  }
  const afterTheHeadings = [listed, unreadWords].filter((one) => one !== '').join('\n\n')
  if (afterTheHeadings !== '' && typeof next['check'] === 'string') next['check'] = `${next['check']}\n\n${afterTheHeadings}`
  return { answer: next, listed: { nextRound, afterLanding }, unread, changed: true }
}
