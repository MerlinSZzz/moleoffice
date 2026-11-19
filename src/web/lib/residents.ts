// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PERMANENT RESIDENTS, AS THE PAGES READ THEM. One decision, items 2 and 5 of another, and the proposal
 * report GsGFiDygATd5 (wave 13r, round 4).
 *
 * A permanent resident is an agent the secretary proposed and the person confirmed with one press. It
 * gets a personal space: a folder the office keeps, which the resident writes and the person reads.
 * Another agent reads it only with the resident's leave, or as the successor the person named after
 * the resident retired. Nothing in a space is deleted; a wrong file is marked void with a reason, and a
 * replaced file keeps its earlier versions.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * The few rules the pages work out from the doors' replies: what a resident is called in a sentence,
 * who is looking, and how the lines of the session-origin file are read. Nothing here draws.
 *
 * THE SHAPES ARE THE DOORS' OWN. They are declared where the doors answer them (src/server/api/residents.ts
 * and src/server/lib/residents.ts) and imported here type-only, so they are erased at build and no
 * server code reaches the page. A field the door renames stops this file compiling.
 */

import type { AddressAs } from '@shared/address-as.ts'
import type { PageLanguage } from '@shared/i18n.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { WebActor } from '../api.ts'
import type { TheConfirmReply, TheDeclineReply, TheNamedReply, TheSpaceListing } from '../../server/api/residents.ts'
import type {
  AFileInTheSpace,
  AGrant,
  AResidencyProposal,
  AResidentInTheList,
  AnEarlierVersion,
  MeasuredFacts,
  OneResidentReading,
  TheHeartbeat,
  TheResidentsList,
} from '../../server/lib/residents.ts'
import type { ASessionOrigin } from '../../server/lib/session-origins.ts'
import type { TheSleepReading } from '../../server/lib/resident-sleep.ts'
import type { TheCriterionReading } from '@shared/residents.ts'

export type {
  AFileInTheSpace,
  AGrant,
  AResidencyProposal,
  AResidentInTheList,
  AnEarlierVersion,
  ASessionOrigin,
  MeasuredFacts,
  OneResidentReading,
  TheConfirmReply,
  TheCriterionReading,
  TheDeclineReply,
  TheHeartbeat,
  TheNamedReply,
  TheResidentsList,
  TheSleepReading,
  TheSpaceListing,
}

/** The file at the root of every space that says where each of the resident's sessions started. */
export const SESSION_ORIGINS_FILE = 'session-origins.jsonl'

/** One line of the file as read: the line, or the number of a line that could not be read. */
export type SessionOriginRead = { ok: true; line: ASessionOrigin } | { ok: false; lineNumber: number }

/** The fields of a line that hold text or nothing. */
const TEXT_OR_NULL = ['startedAt', 'runtime', 'model', 'host', 'officeMachine', 'cwd', 'providerSession', 'resumeCommand'] as const
/** The fields of a line that always hold text. */
const ALWAYS_TEXT = ['recordedAt', 'sessionRecordId', 'sessionRecordFiledAt'] as const

const isText = (value: unknown): value is string => typeof value === 'string'
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)

/**
 * READ THE SESSION-ORIGIN FILE, ONE ANSWER PER LINE THAT HOLDS ANYTHING.
 *
 * Each line is checked against the shape the office writes (`ASessionOrigin`). A line that is not that
 * shape is answered as a line that could not be read, by its number. It is never dropped and never
 * half-drawn, because the page would then show fewer session starts than the file holds and nothing
 * would say so.
 */
export function readTheSessionOrigins(text: string): SessionOriginRead[] {
  const answers: SessionOriginRead[] = []
  text.split('\n').forEach((raw, index) => {
    if (raw.trim() === '') return
    const lineNumber = index + 1
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Handled by saying so: the line is answered as unreadable, by its number.
      answers.push({ ok: false, lineNumber })
      return
    }
    answers.push(isASessionOrigin(parsed) ? { ok: true, line: parsed } : { ok: false, lineNumber })
  })
  return answers
}

function isASessionOrigin(value: unknown): value is ASessionOrigin {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const line = value as Record<string, unknown>
  if (!ALWAYS_TEXT.every((field) => isText(line[field]))) return false
  if (!TEXT_OR_NULL.every((field) => isTextOrNull(line[field]))) return false
  const checkout = line['checkout']
  if (checkout !== null && (typeof checkout !== 'object' || !isText((checkout as Record<string, unknown> | null)?.['cutFrom']))) return false
  const how = line['how']
  if (typeof how !== 'object' || how === null) return false
  const said = how as Record<string, unknown>
  if (!isTextOrNull(said['entryPoint']) || !isTextOrNull(said['sandbox']) || !isTextOrNull(said['terminal'])) return false
  if (said['startedByMoleOffice'] !== null && typeof said['startedByMoleOffice'] !== 'boolean') return false
  return isTexts(line['unknown']) && isTexts(line['withheld'])
}

/**
 * IS THE PERSON THE ONE LOOKING? The presses that are the person's (confirm, not now, end a grant, mark a file
 * void, name a successor) are drawn only then. The door is what refuses everybody else; this only
 * keeps a press off the screen of a reader whose press would always be refused.
 */
export function thePersonIsLooking(actor: WebActor): boolean {
  return actor.type === 'human' && actor.id === THE_PERSON
}

/** Any Han character: the script Chinese is written in. */
const HAN = /\p{Script=Han}/u

/**
 * WHAT A RESIDENT IS CALLED IN A SENTENCE ON THIS PAGE. By item 5 of a decision and answer 7 of the
 * proposal, a resident is called by its own third person, in the page's language, and where that part
 * is not set, by its name. Never by a 他 or 它 the page chose for it.
 *
 * "IN THE PAGE'S LANGUAGE" IS READ FROM THE SCRIPT. The field holds one third person, written by the
 * resident or the person. A Chinese page uses it when it is written in Chinese characters; an English
 * page uses it when it holds none. Otherwise the part is not set for this page's language, so the
 * name stands in its place, as for a part nobody set. The value is drawn exactly as written.
 */
export function theResidentInASentence(agent: { name: string; addressAs: AddressAs }, language: PageLanguage): string {
  const third = agent.addressAs.thirdPerson
  if (third === undefined) return agent.name
  const chinese = HAN.test(third)
  return (language === 'zh') === chinese ? third : agent.name
}

/** Whether a path in a space is the session-origin file, which only the office writes and nobody marks void. */
export function isTheSessionOriginFile(path: string): boolean {
  return path === SESSION_ORIGINS_FILE
}
