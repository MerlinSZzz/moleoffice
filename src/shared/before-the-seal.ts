// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE REMINDER BEFORE THE SEAL DID, KEPT ON THE RUN, AND THE ITEMS THE RUN'S STARTER ASKS IT TO NAME. Wave 13j
 * round 54. The reminder itself is in src/server/lib/before-the-seal.ts. It began as a reminder, never a gate.
 * At block, a later write is refused over a certain item it named that the same finder still finds. A likely item stays
 * a reminder. The separate hard gate still refuses every git seal over a migration item it finds. A fault of form is
 * listed and never refused at any position.
 *
 * `remindedBeforeTheSeal` is written only by the office: when the reminder fires, and again at the seal, when it adds
 * which of the named items the same checks still found. A seal with no reminder writes why there was none. A run sealed
 * before this field existed has none, and its page says nobody recorded it.
 *
 * `checkAlso` is written only by its own door, PUT /api/records/<run>/check-also, and never by the run's own key, so a
 * run cannot choose what it will be reminded of.
 *
 * Here and not on the server so the run's page and the server read one shape, and say one line.
 */
import { WHY_NOT_REMINDED, type WhyNotReminded } from './before-the-seal-reasons.ts'
import { sayInEnglish, type Say, type WordKey } from './i18n.ts'
import { wordWithSpacedValues } from './spacing.ts'

export { WHY_NOT_REMINDED }
export type { WhyNotReminded }

/** Whether a word holds a Chinese character. */
const A_CHINESE_CHARACTER = /\p{Script=Han}/u

export const REMINDED_BEFORE_THE_SEAL = 'remindedBeforeTheSeal'
export const CHECK_ALSO = 'checkAlso'
/** The most items a starter may give, and the longest item, in characters. The brief of round 54. */
export const CHECK_ALSO_MOST_ITEMS = 20
export const CHECK_ALSO_LONGEST_ITEM = 300

/**
 * What kind of thing an item is about: the census's own classes, migrations (round 56), the starter's items, a test
 * line that reads the whole machine (wave 13u round 104, src/server/lib/machine-wide-scans.ts), a decision the run
 * recorded (wave 13n), the run itself, and a record a records submission carries that is neither a report nor a
 * decision. src/shared/kinds.ts builds the `about` type of the item it serves from the same list.
 */
export const WHAT_IT_IS_ABOUT = ['report', 'test proof', 'pictures', 'commit', 'migration', 'design', 'check also', 'machine-wide test', 'decision', 'run', 'record'] as const
export type WhatItIsAbout = (typeof WHAT_IT_IS_ABOUT)[number]

/** One item the reminder named. `key` says which check found it and of what, so the seal can look for the same one. */
export interface ANamedItem {
  key: string
  about: WhatItIsAbout
  says: string
  /**
   * True when the branch and the records alone decide it, with no judgement: certain. False for a test proof and a
   * starter's item. Absent on an item kept before round 56, which nobody marked.
   */
  mechanical?: boolean
}

/**
 * What the seal found of the items the reminder named, by key, from the same finder on the branch as it stands at the
 * seal. The reminder and this reading use one finder, but a branch can gain an item after the reminder, so the two can
 * name different lists. The separate hard gate refuses only git seals over a migration item: a records or files
 * submission seals no branch, so at remind or off its seal can record a migration item in `stillFound`. At block, a
 * certain named item still found refuses those seals too. A fault of form is listed and never refused. For a git seal a
 * migration item the run fixed is recorded in `noLongerFound`, because one still found refuses that seal before this is
 * written.
 */
/**
 * What the seal recorded of one machine-wide test line the reminder named: the same finder no longer finds it, the line
 * is kept with the reason written on it, or it is found with no reason. None of the three refuses the seal.
 */
export interface AScanDecided {
  key: string
  decision: 'no longer found' | 'kept' | 'not decided'
  /** The reason written on the line, for `kept` only. */
  reason?: string
}

const SCAN_DECISIONS: readonly AScanDecided['decision'][] = ['no longer found', 'kept', 'not decided']

export interface AtTheSeal {
  at: string
  sealedTip: string
  /** Items the same checks found again at the seal. Null when nothing could be compared (`couldNotJudge`). */
  stillFound: string[] | null
  /** Items the same checks did not find at the seal. Null when nothing could be compared. */
  noLongerFound: string[] | null
  /** Items the office cannot judge: check-also items, copied-test items when their source was not read, and every item when couldNotJudge says why. */
  notJudged: string[]
  couldNotJudge: string | null
  /**
   * What the seal recorded of each machine-wide test line the reminder named. Absent when the seal could not read the
   * lines this run adds under tests/, and on a seal before wave 13u round 104.
   */
  machineWideScans?: AScanDecided[]
}

export type RemindedBeforeTheSeal =
  | {
      reminded: true
      at: string
      /** The seal this reminder came before the next one of: the run's `sealedTip` then, or null before its first. */
      afterSeal: string | null
      /** The office's line to the run's agent that holds the reminder. */
      line: string
      /** The chapters it asked the report to list, and the items it named. Null when the office reminded and kept neither. */
      chapters: number[] | null
      items: ANamedItem[] | null
      atTheSeal: AtTheSeal | null
    }
  | { reminded: false; at: string; sealedTip: string; because: WhyNotReminded }

const isText = (value: unknown): value is string => typeof value === 'string'
const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isAScanDecided = (value: unknown): value is AScanDecided =>
  isObject(value) &&
  isText(value['key']) &&
  SCAN_DECISIONS.includes(value['decision'] as AScanDecided['decision']) &&
  (value['reason'] === undefined || isText(value['reason']))

function readAtTheSeal(value: unknown): AtTheSeal | null {
  if (!isObject(value) || !isText(value['at']) || !isText(value['sealedTip']) || !isTexts(value['notJudged'])) return null
  const stillFound = value['stillFound']
  const noLongerFound = value['noLongerFound']
  const scans = value['machineWideScans']
  return {
    at: value['at'],
    sealedTip: value['sealedTip'],
    stillFound: isTexts(stillFound) ? stillFound : null,
    noLongerFound: isTexts(noLongerFound) ? noLongerFound : null,
    notJudged: value['notJudged'],
    couldNotJudge: isText(value['couldNotJudge']) ? value['couldNotJudge'] : null,
    ...(Array.isArray(scans) && scans.every(isAScanDecided) ? { machineWideScans: scans } : {}),
  }
}

/** Read a stored `remindedBeforeTheSeal`, or null when there is none or it is not one. */
export function readRemindedBeforeTheSeal(value: unknown): RemindedBeforeTheSeal | null {
  if (!isObject(value) || !isText(value['at'])) return null
  if (value['reminded'] === false) {
    const because = value['because']
    if (!isText(value['sealedTip']) || !WHY_NOT_REMINDED.includes(because as WhyNotReminded)) return null
    return { reminded: false, at: value['at'], sealedTip: value['sealedTip'], because: because as WhyNotReminded }
  }
  if (value['reminded'] !== true || !isText(value['line'])) return null
  const chapters = value['chapters']
  const items = value['items']
  return {
    reminded: true,
    at: value['at'],
    afterSeal: isText(value['afterSeal']) ? value['afterSeal'] : null,
    line: value['line'],
    chapters: Array.isArray(chapters) && chapters.every((one) => typeof one === 'number') ? (chapters as number[]) : null,
    items: Array.isArray(items)
      ? items
          .filter((one): one is Record<string, unknown> & ANamedItem => isObject(one) && isText(one['key']) && isText(one['about']) && isText(one['says']))
          .map((one) => ({ key: one.key, about: one.about, says: one.says, ...(typeof one['mechanical'] === 'boolean' ? { mechanical: one['mechanical'] } : {}) }))
      : null,
    atTheSeal: readAtTheSeal(value['atTheSeal']),
  }
}

/**
 * THE LINE AS IT IS STORED: a part that is null is left out, because a stored field holds no nulls
 * (src/shared/kinds/session.ts, `RemindedBeforeTheSeal`). `readRemindedBeforeTheSeal` reads an absent part back as null.
 */
export function remindedAsStored(value: RemindedBeforeTheSeal): Record<string, unknown> {
  const without = (held: object): Record<string, unknown> => Object.fromEntries(Object.entries(held).filter(([, one]) => one !== null && one !== undefined))
  if (!value.reminded) return without(value)
  return without({ ...value, atTheSeal: value.atTheSeal === null ? null : without(value.atTheSeal) })
}

/** The items a run's starter gave, who gave them and when. */
export interface CheckAlso {
  items: string[]
  by: { actorType: string; actorId: string }
  at: string
}

/** Read a stored `checkAlso`, or null. */
export function readCheckAlso(value: unknown): CheckAlso | null {
  if (!isObject(value) || !isTexts(value['items']) || !isText(value['at']) || !isObject(value['by'])) return null
  const by = value['by']
  if (!isText(by['actorType']) || !isText(by['actorId'])) return null
  return { items: value['items'], by: { actorType: by['actorType'], actorId: by['actorId'] }, at: value['at'] }
}

/** Chapters as runs: 1, 2, 3, 5 reads "1–3, 5". Word joiners hold a run together, so a narrow page does not break "1–" from "10". */
export function chaptersAsRuns(chapters: readonly number[]): string {
  const sorted = [...new Set(chapters)].sort((a, b) => a - b)
  const runs: string[] = []
  for (let i = 0; i < sorted.length; ) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j += 1
    runs.push(j === i ? String(sorted[i]) : j === i + 1 ? `${sorted[i]}, ${sorted[j]}` : `${sorted[i]}\u2060–\u2060${sorted[j]}`)
    i = j + 1
  }
  return runs.join(', ')
}

function sayWith(say: Say, key: WordKey, values: Readonly<Record<string, string | number>>): string {
  const strings = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]))
  return A_CHINESE_CHARACTER.test(say(key)) && !('n' in values) ? wordWithSpacedValues(say, key, strings) : say(key, values)
}

const NOT_REMINDED_KEYS: Readonly<Record<WhyNotReminded, WordKey>> = {
  theGateIsOff: 'w13j.beforeTheSeal.notReminded.theGateIsOff',
  theLauncherAskedForNone: 'w13j.beforeTheSeal.notReminded.theLauncherAskedForNone',
  notTheRunsOwnKey: 'w13j.beforeTheSeal.notReminded.notTheRunsOwnKey',
  noAgent: 'w13j.beforeTheSeal.notReminded.noAgent',
  unknown: 'w13j.beforeTheSeal.notReminded.unknown',
}

/**
 * THE ONE LINE THE RUN'S PAGE SHOWS, or null when there is nothing to say: a run not yet sealed that was not reminded.
 * `sealed` is whether the run holds a seal now, so a sealed run with no field says nobody recorded it.
 */
export function beforeTheSealSays(reminded: RemindedBeforeTheSeal | null, sealed: boolean, say: Say = sayInEnglish): string | null {
  if (reminded === null) return sealed ? say('w13j.beforeTheSeal.nobodyRecorded') : null
  if (!reminded.reminded) return sayWith(say, NOT_REMINDED_KEYS[reminded.because], { at: reminded.at })
  const parts: string[] = []
  if (reminded.items === null || reminded.chapters === null) {
    parts.push(sayWith(say, 'w13j.beforeTheSeal.remindedNotKept', { at: reminded.at }))
  } else {
    parts.push(
      reminded.chapters.length === 0
        ? sayWith(say, 'w13j.beforeTheSeal.remindedNoChapters', { at: reminded.at })
        : sayWith(say, 'w13j.beforeTheSeal.reminded', { at: reminded.at, chapters: chaptersAsRuns(reminded.chapters) }),
    )
    parts.push(say('w13j.beforeTheSeal.named', { n: reminded.items.length }))
  }
  const seal = reminded.atTheSeal
  if (seal === null) {
    parts.push(say('w13j.beforeTheSeal.notSealedSince'))
  } else if (seal.stillFound === null || seal.noLongerFound === null) {
    parts.push(sayWith(say, 'w13j.beforeTheSeal.atTheSealNotJudged', { at: seal.at }))
  } else {
    parts.push(sayWith(say, 'w13j.beforeTheSeal.atTheSeal', { at: seal.at }))
    parts.push(say('w13j.beforeTheSeal.noLongerFound', { n: seal.noLongerFound.length }))
    parts.push(say('w13j.beforeTheSeal.stillFound', { n: seal.stillFound.length }))
    if (seal.notJudged.length > 0) parts.push(say('w13j.beforeTheSeal.notJudged', { n: seal.notJudged.length }))
  }
  return parts.join(' ')
}
