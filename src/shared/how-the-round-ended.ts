// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A ROUND ENDED, KEPT ON ITS RUN. Wave 13j, round loop-1 (task "every round ends sealed or says why", module
 * HoSzb82KlTHJ). The writer is src/server/lib/how-a-round-ended.ts; the reasons are worked out in
 * src/server/lib/how-a-round-ended-rules.ts, which opens no database.
 *
 * `howTheRoundEnded` is written only by the office on a run started in a sandbox:
 *   - at the seal: sealed, and whether the check was asked for or held, and why it was held;
 *   - when the run's command ended, or the run crashed or was orphaned, with no seal: the reasons the office found, what
 *     to do, and the line that told the starter, or why nobody was told.
 * A run that ended before this field existed has none, and its page says nothing about it.
 *
 * Here and not on the server so the run's page and the server read one shape, and say one line.
 */
import { sayInEnglish, type Say } from './i18n.ts'
import { isASessionState, type SessionState } from './types.ts'
import { enWave14c } from './words/en-wave-14c.ts'

export const HOW_THE_ROUND_ENDED = 'howTheRoundEnded'
/** The refusal of `howTheRoundEnded` in any write but the office's own, on a create and on a patch. */
export const ONLY_THE_OFFICE_WRITES_HOW_THE_ROUND_ENDED = enWave14c['roundEnd.onlyOffice']

/** Why a round ended with no seal. Each is a fact the office read; none is a guess about what the agent meant. */
export const WHY_NO_SEAL = [
  'the-process-died',
  'git-being-read',
  'no-commits',
  'commits-not-known',
  'no-report',
  'stopped-to-ask',
  'another-folder',
  'a-stale-base',
  'not-sealed',
] as const
export type WhyNoSeal = (typeof WHY_NO_SEAL)[number]

/** One reason, in a sentence, and the record it names when it names one: the message, or a report linked elsewhere. */
export interface AReasonForNoSeal {
  why: WhyNoSeal
  says: string
  names?: string
}

/** What the check did at the seal: asked for, held because of the run's last message, or not asked by the office. */
export const THE_CHECK_AT_THE_SEAL = ['asked', 'held', 'not asked'] as const
export type TheCheckAtTheSeal = (typeof THE_CHECK_AT_THE_SEAL)[number]

export type HowTheRoundEnded =
  | {
      sealed: true
      at: string
      sealedTip: string
      theCheck: TheCheckAtTheSeal
      says: string
      /** The run's last message to its starter, when the hold read one. */
      message?: string
      /** When the check was held, who released it and when. */
      released?: { by: string; at: string; because: string }
    }
  | {
      sealed: false
      at: string
      /** The run's state when the office recorded this, `unknown` when the run held no state word. */
      state: SessionState
      reasons: AReasonForNoSeal[]
      says: string
      whatToDo: string
      /** The office's line to the starter, or null with `notTold` saying why nobody was told. */
      starterTold: string | null
      notTold?: string
    }

const isText = (value: unknown): value is string => typeof value === 'string'
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Read a stored `howTheRoundEnded`, or null when there is none or it is not one. */
export function readHowTheRoundEnded(value: unknown): HowTheRoundEnded | null {
  if (!isObject(value) || !isText(value['at']) || !isText(value['says'])) return null
  if (value['sealed'] === true) {
    const check = value['theCheck']
    if (!isText(value['sealedTip']) || !THE_CHECK_AT_THE_SEAL.includes(check as TheCheckAtTheSeal)) return null
    const released = value['released']
    return {
      sealed: true,
      at: value['at'],
      sealedTip: value['sealedTip'],
      theCheck: check as TheCheckAtTheSeal,
      says: value['says'],
      ...(isText(value['message']) ? { message: value['message'] } : {}),
      ...(isObject(released) && isText(released['by']) && isText(released['at']) && isText(released['because'])
        ? { released: { by: released['by'], at: released['at'], because: released['because'] } }
        : {}),
    }
  }
  if (value['sealed'] !== false || !isASessionState(value['state']) || !isText(value['whatToDo']) || !Array.isArray(value['reasons'])) return null
  const reasons = value['reasons']
    .filter((one): one is Record<string, unknown> => isObject(one) && WHY_NO_SEAL.includes(one['why'] as WhyNoSeal) && isText(one['says']))
    .map((one) => ({ why: one['why'] as WhyNoSeal, says: one['says'] as string, ...(isText(one['names']) ? { names: one['names'] } : {}) }))
  return {
    sealed: false,
    at: value['at'],
    state: value['state'],
    reasons,
    says: value['says'],
    whatToDo: value['whatToDo'],
    starterTold: isText(value['starterTold']) ? value['starterTold'] : null,
    ...(isText(value['notTold']) ? { notTold: value['notTold'] } : {}),
  }
}

/** The field as it is stored: a part that is null or absent is left out, because a stored field holds no nulls. */
export function howTheRoundEndedAsStored(value: HowTheRoundEnded): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, one]) => one !== null && one !== undefined))
}

/**
 * THE ONE LINE THE RUN'S PAGE SHOWS, or null when nobody recorded how the round ended. The office's own sentence is
 * English; the page puts the translated lead in front of it, so a reader of another language sees what kind of end
 * this was before the office's words.
 */
export function howTheRoundEndedSays(ended: HowTheRoundEnded | null, say: Say = sayInEnglish): string | null {
  if (ended === null) return null
  if (ended.sealed) {
    const lead =
      ended.theCheck === 'held'
        ? ended.released === undefined
          ? say('w13j.roundEnded.sealedHeld', { at: ended.at })
          : say('w13j.roundEnded.sealedReleased', { at: ended.at, released: ended.released.at })
        : ended.theCheck === 'asked'
          ? say('w13j.roundEnded.sealedAsked', { at: ended.at })
          : say('w13j.roundEnded.sealedNotAsked', { at: ended.at })
    return `${lead} ${ended.says}`
  }
  const told = ended.starterTold === null ? say('w13j.roundEnded.nobodyTold') : say('w13j.roundEnded.starterTold')
  return `${say('w13j.roundEnded.notSealed', { at: ended.at })} ${ended.says} ${ended.whatToDo} ${told}`
}
