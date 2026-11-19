// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUBAGENT IS NOT FINISHED UNTIL SOMEBODY RELEASES IT.
 *
 * Criteria C17 to C23, C25 and C26 of design/rules/ACCEPTANCE.md: a subagent's message that it has finished does not
 * finish it. The agent that started it is responsible for checking it, or for setting up a new inspector agent to
 * check it, and only when the check finds no problem does a message end the subagent and return its result to the
 * main agent.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS STORED AND WHAT IS WORKED OUT
 * ---------------------------------------------------------------------------------------
 *
 * One fact is stored: `released` on the run. Everything else — whether a run said it was finished,
 * whether a check happened, what the screen says — is read off the run at the moment somebody asks,
 * so there is nothing that can drift out of step with it.
 *
 * MOLE OFFICE CANNOT STOP A SUBAGENT PROCESS ENDING. That lifecycle belongs to the tool. Section
 * 7.2 is explicit about it: what this product can do is say, on the run, whether a check happened
 * and who did it. **An unchecked finish is visible rather than prevented.**
 */

import { aRunSaysItIsFinished, FINISHED_STATES as THE_FINISHED_STATES, THE_SWEEPS_CLOSE } from '../config/finished.mjs'
import { whatSaysTakes } from '../config/verdict-keys.mjs'
import { participantWord, type ParticipantKind, type ParticipantRef } from './participants.ts'
import { RUN_STANDINGS, type RunStanding } from './plugin-read.ts'
import { REVIEW_LEVELS, type ReviewLevel } from './workspaces.ts'
import { sayInEnglish, type Say, type WordKey } from './i18n.ts'
import { wordWithSpacedValues } from './spacing.ts'
import { CHECK_FACTS, aRunRunsNoModel, noCheckSays, type CheckEligibility } from './check-eligibility.ts'
import type { TheRunThatAskedForAWorker } from './worker-runs.ts'
import { A_STANDARD_KIND_SAYS, isAStandardKind, type StandardKind } from './standard-change.ts'
import type { ClockStamp } from './time.ts'

/** Who the confirmation door allows, read once on the server and carried by the record's answer. */
export interface ReportConfirmation {
  /** any-registered-at-off: the gate who-confirms-a-report is off, so anybody registered may confirm (wave 13r round M). */
  rule: 'asker' | 'registrar-after-asker-ended' | 'reported-to' | 'any-registered' | 'any-registered-at-off'
  agent: ParticipantRef | null
  /** Null allows any registered participant. The person is always allowed. */
  allowed: ParticipantRef[] | null
  asker: TheRunThatAskedForAWorker | null
  registrar: ParticipantRef | null
  registrarMayConfirmWhen: string | null
  says: string
}

/**
 * THE SENTENCES A RUN'S STANDING IS SAID IN ARE READ FROM THE WORD LISTS BY A `say`, the way
 * `broadcastLines` in src/shared/broadcast.ts reads its lines. The server hands each composer the English
 * reader (`sayInEnglish`), so what it stores, sends and answers is today's English, byte for byte. The run's
 * check panel hands it the page's reader, so a Chinese page reads the same sentence in Chinese (wave 13k
 * round 28: the panel's standing paragraph drew these in English on a Chinese page). One composer per
 * sentence, so the page and the server cannot come to say two different things.
 *
 * A VALUE IN A CHINESE WORD IS SPACED BY THE OFFICE'S RULE (`wordWithSpacedValues` in src/shared/spacing.ts):
 * a Latin name or a stamp beside a Chinese character takes a space, a Chinese name takes none. A word with no
 * Chinese in it is filled exactly as it is typed, because that rule also moves the space beside a value
 * that starts or ends with a Chinese character, and the English the office stores must not change with
 * what a person wrote in a `because`.
 */
function sayWithValues(say: Say, key: WordKey, values: Readonly<Record<string, string>>): string {
  return /\p{Script=Han}/u.test(say(key)) ? wordWithSpacedValues(say, key, values) : say(key, values)
}

/** The word for a kind of participant, in the reader's language. The English is `participantWord`'s. */
const PARTICIPANT_WORD_KEYS: Readonly<Record<ParticipantKind, WordKey>> = {
  person: 'chk.says.participant.person',
  agent: 'chk.says.participant.agent',
}

// ============================================================================ the stored fact

/**
 * WHICH OF THE TWO WAYS OF SECTION 7.2 ENDED A RUN: its own starter, or an inspector.
 *
 * THE WORDS ARE PHRASES AND NOT ROLE NAMES, and that is not a style choice. A role name is declared
 * in design/permissions/roles.json and nowhere else — `tests/one-declaration-decides-what-a-role-may
 * -do.test.ts` fails a source file that writes one — and this is a stored value that has to keep its
 * meaning if a card is ever renamed. So it says which way, in the words a reader says it in, and the
 * card the checker holds is read off the declaration where it is needed.
 */
/**
 * WHICH TREE AND WHICH TIP AN ACT READ, and which seal it was answering about. Criterion C30.
 *
 * ONE DECLARATION FOR THE THREE ACTS THAT CARRY IT — a release, a refusal and, since 11 September
 * 2026, a confirmation made at a review level that starts no inspector. It was written out three
 * times before that, which is two more places for the shape to drift.
 */
export interface WhatWasRead {
  unsealed?: boolean
  sealId?: string
  sealHash?: string
  /** adTmco_wIzln, inspector note 52ZNPB44bOPb; USER.md invariants 2 and 5:
   * name the seal kind read, never infer it from an absent tip. Absent on unsealed and older readings. */
  sealKind?: 'git' | 'records' | 'files'
  /** Whether the check read the seal's link evidence, or the seal was made before seals pinned links (round BQ). */
  linkEvidence?: 'read' | 'sealed-before-links'
  worktree: string
  tip?: string | null
  /** Whether the act read a worktree of its own, rather than the worker's. A confirmation reads none. */
  ofItsOwn: boolean
  says: string
  /**
   * THE ONLY PATHS THIS CHECK JUDGED, when it was a scoped check (`the-inspector.mjs --only`).
   * Sandbox v1 decision R2: the verdict follows file content, so a check again of a submission
   * judges only the files whose content changed, and the rest keep the earlier verdict.
   *
   * ABSENT MEANS THE CHECK JUDGED THE WHOLE SUBMISSION. A verdict that carries this covers these
   * paths and nothing else, and must never be read as a verdict on the whole submission.
   */
  only?: string[]
  /**
   * THE PROTECTED PATHS A CHECKER TOOL HANDED THIS CHECK TO JUDGE, and why. Sandbox v1 decision R4.
   * An empty list means a checker ran and handed nothing on. Absent means nobody handed a list.
   */
  needsJudgment?: PathThatNeedsJudgment[]
  /**
   * A FILES SEAL: THE FOLDER THE CHECK'S COPY WAS MADE FROM. Absent on any
   * other kind of check.
   */
  staged?: string
  /**
   * A FILES SEAL: FOR EVERY SEALED PATH WHERE A FILE WAS ALREADY LANDED, THE SHA-256 OF THAT LANDED
   * FILE — the before the model was shown, read by the check's tool from a copy it verified. The queue
   * requires a modify operation's `before` to be exactly this hash, so a release covers the text a file
   * replaced as well as the text it lands. Absent means no sealed path had a file landed at it.
   */
  before?: Record<string, string>
}

/** One path a checker tool could not decide, and why. The shape is src/config/needs-judgment.mjs. */
export interface PathThatNeedsJudgment {
  path: string
  why: string
}

/**
 * THE WAYS A RUN IS RELEASED. The third is a standard change: the release door finds the run's declared kind matches the
 * files it changed and its own checks passed, and no inspector reads it (the owner's approved design for how lines
 * merge).
 */
export const WHO_MAY_CHECK = ['its starter', 'an inspector', 'the standard-change rule'] as const
export type WhoChecked = (typeof WHO_MAY_CHECK)[number]

/** A release as a standard change: the kind, why the files matched it, and the checks that ran on the sealed tree. */
export interface AStandardRelease {
  kind: StandardKind
  why: string
  checks: { name: string; code: number }[]
}

/**
 * WHAT A CHECK'S MODEL WROTE INTO THE OFFICE WHILE IT RAN. Acceptance finding 44, 23 September 2026:
 * a check's model ran the tree's browser tests, the app read the live office's address out of the
 * model's environment, and 65 records were filed into the live office. The tool that starts the model
 * now takes the time just before and just after it runs, asks GET /api/records/created-between for
 * that window, and keeps on the verdict the records whose working directory was inside the check's
 * own worktree or whose creating session was the check's session.
 *
 * ABSENT IS NOT ZERO. Zero is a count of zero with no ids; absent means the tool could not count at
 * all, which is a different fact and is said as itself.
 */
export interface WroteIntoTheOffice {
  /** How many of the records created in the window belonged to this check's run. */
  count: number
  /** The record ids behind that count, in the order the office listed them. */
  ids: string[]
  /** The first moment of the window the model ran in, local wall clock. */
  from: string
  /** The last moment of the window the model ran in, local wall clock. */
  to: string
}

/** The field on a `session` record that says a run was released. One fact, one place. */
export const RELEASED = 'released'

/** The traced words: item 6, step 3, and chapter 7 rule 5; oj9CRzzB2_8m. */
export const TRACED_HOW = ["the person's word", 'an engineering choice left to the agents'] as const

export interface TracedChange {
  paths: string[]
  to: string
  how: (typeof TRACED_HOW)[number]
  said: string
}

/** A trace word with case, punctuation, a/an/the and a plural s set aside: two words alike here are a near miss. */
function theTraceWordsBareWords(how: string): string {
  return how.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/u)
    .filter((word) => word !== '' && word !== 'a' && word !== 'an' && word !== 'the')
    .map((word) => word.replace(/s$/u, '')).join(' ')
}

/**
 * A TRACE WORD THE DOOR CANNOT READ, TAKEN AT THE ONE OF ITS TWO WORDS IT NEARLY IS, and each one taken said back
 * as `"<as written>" as "<the door's word>"`. Problem -WZ40nNgHnTR (see 9KmvFlFtY4dP): on 4 October 2026 the check
 * zkcl7Ld_M1I9 wrote `how` "an engineering choice left to agents", the door takes `how` only at one of TRACED_HOW, and
 * it refused the whole verdict. A near miss is the same words once case, punctuation, a/an/the and a plural s are set
 * aside. Any other word is left as written, for the door to refuse and say why; so is every other field of a line.
 */
export function tracedAtTheDoorsWords(value: unknown): { traced: unknown; taken: string[] } {
  if (!Array.isArray(value)) return { traced: value, taken: [] }
  const taken: string[] = []
  const traced = value.map((one: unknown) => {
    if (typeof one !== 'object' || one === null || Array.isArray(one)) return one
    const how = (one as Record<string, unknown>)['how']
    if (typeof how !== 'string' || TRACED_HOW.some((word) => word === how)) return one
    const word = TRACED_HOW.find((each) => theTraceWordsBareWords(each) === theTraceWordsBareWords(how))
    if (word === undefined) return one
    taken.push(`${JSON.stringify(how)} as ${JSON.stringify(word)}`)
    return { ...one, how: word }
  })
  return { traced, taken }
}

/**
 * THE VERDICT DOOR'S REFUSAL OF A RELEASE THAT GIVES NO `traced` LINE FOR SOME PATH ITS CHECK JUDGED, in the one sentence
 * the door writes and the inspector reads back (wave 13y round 23). Between 00:30 and 02:30 on 12 October 2026 three
 * checks chose release, traced few of the paths they judged, and were each refused with this sentence; the inspector now
 * asks the check's own session once for the lines, and it knows this refusal only by these words.
 */
export function aReleaseWithoutATraceSays(without: readonly string[]): string {
  return `A release gives a line in \`traced\` for every path this check judged, and this one gives none for ${without.join(', ')}. ` +
    'Nothing was written; the check can be asked again.'
}

/** THE PATHS THAT SENTENCE NAMES, when a refusal is that sentence and nothing else; null for any other refusal. */
export function thePathsAReleaseLeftUntraced(said: string): string[] | null {
  const [before = '', after = ''] = aReleaseWithoutATraceSays(['\u0000']).split('\u0000')
  if (said.length <= before.length + after.length || !said.startsWith(before) || !said.endsWith(after)) return null
  return said.slice(before.length, said.length - after.length).split(', ')
}

const NOT_HELD_OPENS = 'The trace names records the office does not hold: '
const NOT_HELD_ENDS = '. Nothing was written; the check can be asked again.'
const aLineNotHeld = (one: Pick<TracedChange, 'to' | 'paths'>) => `${one.to} (${one.paths.join(', ')})`

/**
 * THE VERDICT DOOR'S REFUSAL OF A RELEASE WHOSE `traced` NAMES RECORDS THE OFFICE DOES NOT HOLD, in the one sentence the
 * door writes and the inspector reads back (wave 13v round 33). At 05:33 on 13 October 2026 a check of wave 13x's round
 * 17f released, wrote "chapter 10" where `to` takes a record id, and was refused with this sentence (check CXCtvckdwXo9).
 * The inspector now asks the check's own session once to correct `traced`, and it knows this refusal only by these words.
 */
export function aTraceNamingRecordsNotHeldSays(notHeld: readonly Pick<TracedChange, 'to' | 'paths'>[]): string {
  return `${NOT_HELD_OPENS}${notHeld.map(aLineNotHeld).join('; ')}${NOT_HELD_ENDS}`
}

/**
 * THE `to` OF EACH LINE THAT SENTENCE NAMES, when a refusal is that sentence and nothing else and it names lines of the
 * `traced` that was posted; null for any other refusal. The door names the lines it does not hold in the order they were
 * posted, with `to` trimmed as it reads it, so they are matched against the posted lines in that order.
 */
export function theRecordsATraceNamedThatAreNotHeld(said: string, traced: unknown): string[] | null {
  if (!said.startsWith(NOT_HELD_OPENS) || !said.endsWith(NOT_HELD_ENDS) || !Array.isArray(traced)) return null
  let left = said.slice(NOT_HELD_OPENS.length, said.length - NOT_HELD_ENDS.length)
  const named: string[] = []
  for (const one of traced) {
    const { to, paths } = (one ?? {}) as Record<string, unknown>
    if (typeof to !== 'string' || !Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) continue
    const line = aLineNotHeld({ to: to.trim(), paths })
    if (left === line) return [...new Set([...named, to.trim()])]
    if (left.startsWith(`${line}; `)) {
      named.push(to.trim())
      left = left.slice(line.length + 2)
    }
  }
  return null
}

/** The one stored fact: this run was released, by whom, when, and on what check. */
export interface Release {
  /** Who wrote the release. */
  by: ParticipantRef
  /** Local wall clock, never UTC. */
  at: string
  /**
   * THE CLOCK OBSERVATION BESIDE `at`, written in the same reading of the clock. The local stamp repeats an hour when the
   * clocks go back, so a wait counted from a release reads this. Absent on a release written before it was stored.
   */
  time?: ClockStamp
  /** Which of the three ways ended it. */
  how: WhoChecked
  /** The record id of the message carrying the check, or null where there is none. */
  check: string | null
  /**
   * WHICH WORKTREE AND WHICH TIP THE CHECK READ, in the check's own words. Criterion C30.
   *
   * Null means the check did not say, which is different from a check that read the right tree: a
   * release whose check read the worker's own worktree is a release made on evidence two processes
   * were writing at once, and the record has to be able to show that a year later.
   *
   * OPTIONAL AS WELL AS NULLABLE, and the two are not the same place. What is STORED omits the key
   * where there is nothing to say, because the session shape declares it optional and refuses a
   * null outright. What `readRelease` hands BACK always answers, with `null`. Both spellings meet
   * here so neither half has to know about the other.
   */
  read?: WhatWasRead | null
  /**
   * WHAT THE MODEL'S RUN WROTE INTO THE OFFICE, counted by the tool that started it. Absent means the
   * tool could not count it, which is not the same as a run that wrote nothing. Acceptance finding 44.
   */
  wroteIntoTheOffice?: WroteIntoTheOffice
  /**
   * WHO THE RUN REPORTED TO WHEN IT WAS RELEASED, and the message it reported in. Criterion C29.
   *
   * A released run reports to its supervisor and closes only when that supervisor confirms, so
   * every screen drawing the run has to be able to name who is being waited for. The name is worked
   * out at the moment of the release, from the registry, and written here rather than looked up
   * again later: the registry is a live thing, and *who was told* is a fact about the day it
   * happened.
   *
   * Absent means nobody was told, which happens two ways and both are real: nothing is recorded as
   * having started this run's agent, or the supervisor is the one who did the releasing.
   */
  reportedTo?: ParticipantRef
  /** The message carrying that report, by record id. Absent for the same two reasons. */
  report?: string
  /**
   * THE CHAPTERS LINE THE CHECK SENT COULD NOT BE READ, kept as text with why. Problem
   * `y_HP9aIa0Bd6`: a finished check was thrown away over one word. The verdict is written anyway,
   * and this field says which part of the chapters line it rests on no evidence for.
   *
   * Absent means every chapters word the check sent was read.
   */
  chaptersReadUnreadable?: string[]
  /**
   * ONE LINE OF THE MODEL'S OWN PER PATH IT WAS HANDED TO JUDGE, for a files seal, at A2 of a decision,
   * "named must mean judged": otherwise a release could name a list the model
   * was handed and repeated back, and cover what nobody read. The door refuses a release of a files
   * seal that leaves a path in `read.needsJudgment` without one; the queue lands a handed-on file only
   * on a release that names it here. Absent means the check was handed nothing to judge.
   */
  judged?: { path: string; concluded: string }[]
  /** Each changed path traced to the person's words or an engineering choice they left to agents. */
  traced?: TracedChange[]
  /**
   * THE FAULTS THE CHECK LISTED INSTEAD OF REFUSING, in the two places they are fixed (the owner's
   * decisions of 9 November 2026). `nextRound` is code and proof the line fixes in its own next round;
   * `afterLanding` is a fault of form in a record, patched in the office after the landing.
   *
   * The same words are in `check`, where the worker reads them. This key is what survives the release:
   * the door files one task for the line from it, held by the line's supervisor. Absent means the
   * check listed nothing, which is the ordinary case.
   */
  listed?: ListedFaults
  /** Present only when `how` is the standard-change rule: the kind, why it matched and the checks that passed. */
  standard?: AStandardRelease
}

/** The two lists of faults a check listed instead of refusing. */
export interface ListedFaults {
  nextRound: string[]
  afterLanding: string[]
}

/** Read a stored release, or null. A stored value that names nobody is not a release. */
export function readRelease(value: unknown): Release | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const who = readParticipantRef(held['by'])
  if (who === null) return null
  const how = held['how']
  if (how !== 'its starter' && how !== 'an inspector' && how !== 'the standard-change rule') return null
  const standard = readAStandardRelease(held['standard'])
  if (how === 'the standard-change rule' && standard === null) return null
  const at = held['at']
  const check = held['check']
  const told = readParticipantRef(held['reportedTo'])
  const report = held['report']
  return {
    by: who,
    at: typeof at === 'string' ? at : '',
    ...readTheReleaseTime(held['time']),
    how,
    check: typeof check === 'string' && check !== '' ? check : null,
    read: readWhatWasRead(held['read']),
    ...(told === null ? {} : { reportedTo: told }),
    ...(typeof report === 'string' && report !== '' ? { report } : {}),
    ...readWroteIntoTheOffice(held['wroteIntoTheOffice']),
    ...readChaptersReadUnreadable(held['chaptersReadUnreadable']),
    ...readJudged(held['judged']),
    ...readTraced(held['traced']),
    ...readTheListedFaults(held['listed']),
    ...(standard === null ? {} : { standard }),
  }
}

/** The listed faults on a stored release, or nothing when it listed none. */
function readTheListedFaults(value: unknown): { listed?: ListedFaults } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const held = value as Record<string, unknown>
  const words = (one: unknown): string[] =>
    Array.isArray(one) ? one.filter((word): word is string => typeof word === 'string' && word.trim() !== '') : []
  const nextRound = words(held['nextRound'])
  const afterLanding = words(held['afterLanding'])
  return nextRound.length + afterLanding.length === 0 ? {} : { listed: { nextRound, afterLanding } }
}

/** The clock observation beside a stored release's `at`, when it holds the four words one has. Absent otherwise. */
function readTheReleaseTime(value: unknown): { time?: ClockStamp } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const { stamp, instant, offset, timeZone } = value as Record<string, unknown>
  return typeof stamp === 'string' && typeof instant === 'string' && typeof offset === 'string' && typeof timeZone === 'string'
    ? { time: { stamp, instant, offset, timeZone } }
    : {}
}

/** The standard part of a stored release, or null. A standard release that names no kind is not one. */
function readAStandardRelease(value: unknown): AStandardRelease | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const { kind, why, checks } = held
  if (!isAStandardKind(kind) || typeof why !== 'string' || !Array.isArray(checks)) return null
  return {
    kind,
    why,
    checks: checks.flatMap((one: unknown) => {
      if (typeof one !== 'object' || one === null) return []
      const check = one as Record<string, unknown>
      return typeof check['name'] === 'string' && typeof check['code'] === 'number' ? [{ name: check['name'], code: check['code'] }] : []
    }),
  }
}

/**
 * THE MODEL'S OWN LINE ON EACH PATH IT WAS HANDED TO JUDGE, off a stored release, or nothing. At
 * A2 of a decision, the queue lands a handed-on file of a files seal only on a release that names it
 * with such a line. A line with no words is not a line, and is left out.
 */
function readJudged(value: unknown): { judged?: { path: string; concluded: string }[] } {
  if (!Array.isArray(value)) return {}
  const lines = value.flatMap((one: unknown) => {
    if (typeof one !== 'object' || one === null) return []
    const item = one as Record<string, unknown>
    return typeof item['path'] === 'string' && typeof item['concluded'] === 'string' && item['concluded'].trim() !== ''
      ? [{ path: item['path'], concluded: item['concluded'] }]
      : []
  })
  return lines.length === 0 ? {} : { judged: lines }
}

/** Read the same trace lines from a release or a refusal, without supplying absent evidence. */
function readTraced(value: unknown): { traced?: TracedChange[] } {
  if (!Array.isArray(value)) return {}
  const lines: TracedChange[] = value.flatMap((one: unknown) => {
    if (typeof one !== 'object' || one === null) return []
    const item = one as Record<string, unknown>
    const { paths, to, how, said } = item
    const tracedHow = TRACED_HOW.find((word) => word === how)
    if (!Array.isArray(paths) || paths.length === 0 || !paths.every((path): path is string => typeof path === 'string' && path !== '') ||
        typeof to !== 'string' || to.trim() === '' || typeof said !== 'string' || said.trim() === '' ||
        tracedHow === undefined) return []
    return [{ paths, to, how: tracedHow, said }]
  })
  return lines.length === 0 ? {} : { traced: lines }
}

/**
 * WHAT A STORED `wroteIntoTheOffice` SAYS, or nothing because nothing usable is there.
 *
 * One reader for the release and the refusal, so both spell the same fact the same way. A stored
 * value missing its count, its ids or its window is not usable and is left out rather than filled
 * in, because a count with no window under it cannot be checked.
 */
function readWroteIntoTheOffice(value: unknown): { wroteIntoTheOffice?: WroteIntoTheOffice } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const held = value as Record<string, unknown>
  const count = held['count']
  const ids = held['ids']
  const from = held['from']
  const to = held['to']
  if (typeof count !== 'number' || !Array.isArray(ids) || typeof from !== 'string' || from === '' || typeof to !== 'string' || to === '') return {}
  return {
    wroteIntoTheOffice: {
      count,
      ids: ids.filter((one): one is string => typeof one === 'string' && one !== ''),
      from,
      to,
    },
  }
}

/**
 * THE UNREADABLE CHAPTERS LINE OFF A STORED RELEASE OR REFUSAL, or nothing because there is none.
 *
 * One reader for both, so the release and the refusal spell the same fact the same way. What is
 * stored is the text of each unreadable entry and why it could not be read; an empty list is the
 * same as nothing, and the key is left out rather than written as an empty array.
 */
function readChaptersReadUnreadable(value: unknown): { chaptersReadUnreadable?: string[] } {
  if (!Array.isArray(value)) return {}
  const entries = value.filter((one): one is string => typeof one === 'string' && one !== '')
  return entries.length === 0 ? {} : { chaptersReadUnreadable: entries }
}

/** One participant off stored JSON, or null because what is there names nobody. */
function readParticipantRef(value: unknown): ParticipantRef | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const kind = held['kind']
  const id = held['id']
  if ((kind !== 'agent' && kind !== 'person') || typeof id !== 'string' || id === '') return null
  return { kind, id }
}

/**
 * WHAT A STORED `read` SAYS, or null because nothing usable is there.
 *
 * Every release written before 7 September 2026 holds none, and null says exactly that rather than
 * inventing a tree the check might have read.
 */
function readWhatWasRead(value: unknown): Release['read'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const worktree = held['worktree']
  if (typeof worktree !== 'string' || worktree === '') return null
  const tip = held['tip']
  const says = held['says']
  return {
    ...(held['unsealed'] === true ? { unsealed: true } : {}),
    ...(typeof held['sealId'] === 'string' ? { sealId: held['sealId'] as string, sealHash: String(held['sealHash'] ?? '') } : {}),
    ...(held['sealKind'] === 'git' || held['sealKind'] === 'records' || held['sealKind'] === 'files' ? { sealKind: held['sealKind'] } : {}),
    ...(held['linkEvidence'] === 'read' || held['linkEvidence'] === 'sealed-before-links' ? { linkEvidence: held['linkEvidence'] } : {}),
    worktree,
    tip: typeof tip === 'string' && tip !== '' ? tip : null,
    ofItsOwn: held['ofItsOwn'] === true,
    says: typeof says === 'string' ? says : '',
    ...theScopeOfWhatWasRead(held),
    ...theFilesOfWhatWasRead(held),
  }
}

/**
 * A FILES SEAL'S TWO FACTS OF A `read`, spelled the way they are stored: each only where it is
 * there. The server stores a verdict's `read` through this and reads one back, as it
 * does the scope, so neither half can drop them: until this was written a stored release lost its
 * `before` on the way back, and the queue found no before to bind a modify to. `before` keeps only
 * path → sha256 pairs, so nothing stored there that is not one is read as a hash a modify may rest on.
 */
export function theFilesOfWhatWasRead(held: { readonly staged?: unknown; readonly before?: unknown }): Pick<WhatWasRead, 'staged' | 'before'> {
  const staged = held.staged
  const before = held.before
  return {
    ...(typeof staged === 'string' && staged !== '' ? { staged } : {}),
    ...(typeof before === 'object' && before !== null && !Array.isArray(before)
      ? { before: Object.fromEntries(Object.entries(before).filter((pair): pair is [string, string] => typeof pair[1] === 'string' && /^[a-f0-9]{64}$/u.test(pair[1]))) }
      : {}),
  }
}

/**
 * THE SCOPE AND THE NEEDS-JUDGMENT LIST OF A `read`, spelled the way it is stored: each key only
 * where it is there, because absent and empty mean different things. No `only` is a check of the
 * whole submission; no `needsJudgment` is nobody handing a list; an empty one is a checker that ran
 * and handed nothing on. The server stores a verdict's `read` through this, and reads one back.
 */
export function theScopeOfWhatWasRead(held: { readonly only?: unknown; readonly needsJudgment?: unknown }): Pick<WhatWasRead, 'only' | 'needsJudgment'> {
  const only = held.only
  const needsJudgment = held.needsJudgment
  return {
    ...(Array.isArray(only) ? { only: only.filter((one): one is string => typeof one === 'string') } : {}),
    ...(Array.isArray(needsJudgment)
      ? {
          needsJudgment: needsJudgment.flatMap((one: unknown) => {
            if (typeof one !== 'object' || one === null) return []
            const item = one as Record<string, unknown>
            const path = item['path']
            const why = item['why']
            return typeof path === 'string' && typeof why === 'string' ? [{ path, why }] : []
          }),
        }
      : {}),
  }
}

// ============================================ the refusal and the confirmation, both stored facts

/** The field on a `session` record that says a check refused to release the run. Criterion C29. */
export const REFUSED = 'refused'

/** The field on a `session` record that says the supervisor confirmed the report. Criterion C29. */
export const CONFIRMED = 'confirmed'

/**
 * A CHECK REFUSED TO RELEASE THIS RUN, and the run did not end. Criterion C29.
 *
 * Until 7 September 2026 a refusal wrote two messages and opened a group and left nothing on the
 * run at all, so a person reading the run could not tell one nobody had checked yet from one a
 * check had turned down. The refusal is a fact about the run, so it is stored on the run.
 */
export interface Refusal {
  traced?: TracedChange[]
  /** Who refused it. */
  by: ParticipantRef
  /** Local wall clock, never UTC. */
  at: string
  /** What is missing, one line each. A refusal that names nothing missing is not a refusal. */
  missing: string[]
  /** The chapter of the code of law it rests on, or null because it named none. */
  chapter: number | null
  /** The precedent record it rests on, or null because it named none. */
  precedent: string | null
  /**
   * The invariant of USER.md it rests on, by its number, or null because it named none. Decision OTB8vrTnnvhL
   * (acceptance finding 69): a refusal resting on an invariant was lost at the door before the door took one.
   */
  invariant: number | null
  /**
   * The group opened so it can be talked out, by record id. ABSENT BECAUSE NONE WAS OPENED, which
   * happens on one kind of run only: the merge queue's check again. Nobody works in that run, so a
   * talk about its refusal has nowhere to lead (decision yH7W1sXTRY5q, Q4).
   */
  group?: string
  /** The message carrying the refusal to the worker, by record id, or null. */
  check: string | null
  /** Which worktree and which tip the check read. Criterion C30. Null because it did not say. */
  read?: WhatWasRead | null
  /**
   * WHAT THE MODEL'S RUN WROTE INTO THE OFFICE, counted by the tool that started it. Absent means the
   * tool could not count it, which is not the same as a run that wrote nothing. Acceptance finding 44.
   */
  wroteIntoTheOffice?: WroteIntoTheOffice
  /**
   * HOW THE REBUTTAL ENDED BY REWORK, or null because it has not.
   *
   * A rebuttal ends one of two ways and each leaves a different mark. The worker fixes what is
   * missing and says its work is finished again: the office writes this, and the run goes back to
   * being checked. Or the group agrees nothing was wrong and somebody releases it: `released` is
   * written and there is nothing to write here. Null therefore means the rebuttal is still open,
   * which is exactly what a reader has to be able to see.
   */
  reworked?: { at: string; because: string } | null
  /**
   * THE CHAPTERS LINE THE CHECK SENT COULD NOT BE READ, kept as text with why. Problem
   * `y_HP9aIa0Bd6`. The refusal is written anyway, and this says which part of the chapters line it
   * rests on no evidence for. Absent means every chapters word the check sent was read.
   */
  chaptersReadUnreadable?: string[]
}

/** Read a stored refusal, or null. A stored value that names nobody is not a refusal. */
export function readRefusal(value: unknown): Refusal | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const who = readParticipantRef(held['by'])
  if (who === null) return null
  // A GROUP THAT IS THERE BUT NAMES NOTHING IS NOT A REFUSAL. An absent group is: a refusal of the
  // merge queue's check again opens none.
  const group = held['group']
  if (group !== undefined && (typeof group !== 'string' || group === '')) return null
  const missing = held['missing']
  const chapter = held['chapter']
  const precedent = held['precedent']
  const invariant = held['invariant']
  const at = held['at']
  const check = held['check']
  return {
    by: who,
    at: typeof at === 'string' ? at : '',
    missing: Array.isArray(missing) ? missing.filter((one): one is string => typeof one === 'string') : [],
    chapter: typeof chapter === 'number' ? chapter : null,
    precedent: typeof precedent === 'string' && precedent !== '' ? precedent : null,
    invariant: typeof invariant === 'number' ? invariant : null,
    ...(group === undefined ? {} : { group }),
    check: typeof check === 'string' && check !== '' ? check : null,
    read: readWhatWasRead(held['read']),
    reworked: readRework(held['reworked']),
    ...readTraced(held['traced']),
    ...readWroteIntoTheOffice(held['wroteIntoTheOffice']),
    ...readChaptersReadUnreadable(held['chaptersReadUnreadable']),
  }
}

/** What a stored `reworked` says, or null because the rebuttal is still open. */
function readRework(value: unknown): Refusal['reworked'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const at = held['at']
  if (typeof at !== 'string' || at === '') return null
  const because = held['because']
  return { at, because: typeof because === 'string' ? because : '' }
}

/**
 * THE SUPERVISOR CONFIRMED THE REPORT, so the run is over. Criterion C29.
 *
 * A run that passes its check enters reporting and reports to its supervisor, and closes once that is confirmed. A
 * release ends the check; it does not end the run. This does.
 */
export interface Confirmation {
  /** Who confirmed it. */
  by: ParticipantRef
  /** Local wall clock, never UTC. */
  at: string
  /** What they said when they confirmed it. */
  because: string
  /**
   * WHICH SEAL, WHICH TREE AND WHICH TIP THIS CONFIRMATION ACCEPTED. The decision of 11
   * September 2026, on the review levels of a decision.
   *
   * ONLY ON A CONFIRMATION MADE WITHOUT A RELEASE, which happens at the review levels `none` and
   * `light` where the office starts no inspector. At `full` a release carries these and this stays
   * absent, because the release is where they belong.
   *
   * A CONFIRMATION THAT NAMES A SEAL IS NOT A CHECK, and every sentence drawn from it says so. What
   * it proves is WHICH WORK was accepted; what it does not prove, and must never be read as, is that
   * anybody read that work against the code of law.
   *
   * ABSENT MEANS NO SEAL NAMED A TREE — a run sealed for its records only, or one finished before
   * seals existed. That is nobody having anything to name, not a confirmation that hid it.
   */
  read?: WhatWasRead | null
}

/** Read a stored confirmation, or null. A stored value that names nobody is not a confirmation. */
export function readConfirmation(value: unknown): Confirmation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const who = readParticipantRef(held['by'])
  if (who === null) return null
  const at = held['at']
  const because = held['because']
  const read = readWhatWasRead(held['read'])
  return {
    by: who,
    at: typeof at === 'string' ? at : '',
    because: typeof because === 'string' ? because : '',
    // ONLY WHERE ONE IS STORED. A key present and null would say "this confirmation looked and found
    // nothing to name", which is a different fact from a confirmation made after a release, where
    // the release carries it and this is rightly absent.
    ...(read === null ? {} : { read }),
  }
}

// ============================================================ a run closed as superseded

/**
 * A RUN CLOSED AS SUPERSEDED BY A LATER RUN: one on the same branch, or one that was checked and
 * merged and holds this run's commits. This was agreed at item 2 of the midday
 * report `p0oJZeu-Grdo`, and on 25 September 2026 for a worker's run whose commits went into a
 * wave.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A RUN NEEDS THIS AND A RELEASE IS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * A run whose branch tip moved after its seal can be checked by nobody: every reading of the run
 * verifies the seal against the tip, and the tip is gone. Four runs of 16 September 2026 —
 * `EY8j_o2oBXDe`, `REbs3qDtCR4u`, `O3rNA5Yt2aXp` and `4htrBW1JckoO` — were left standing
 * `inspecting` for ever, and their workers could not be retired, because the check each still owed
 * could never conclude. The later run on the same branch is what finished that piece of work.
 *
 * A worker's run in a wave owes a check nobody makes, because only the wave's run is checked and
 * merged (problem `1pzFUvtcfLNu`). Once the wave's run was checked, confirmed and merged and git
 * finds each of the worker's commits in it, the wave's run is what finished that work.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT TOUCH
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING ELSE IS REWRITTEN. The seal, the report and every refusal stay exactly as they were: the
 * run was not a good check and it was not a bad one, it was overtaken. What is stored is one fact
 * on the run's own `theCheck`, or on the run itself when it holds no check (`theSupersededOn` says
 * why), and the standing is worked out from it here rather than kept beside the four that were
 * already there.
 */
export interface Superseded {
  /** The later run that was released and confirmed, by record id. */
  by: string
  /** When the starter closed it, in local wall clock. */
  at: string
  /** Who closed it: the run's starter or the owner. */
  byWhom: ParticipantRef
  /** Why, in the starter's own one sentence. */
  because: string
  /**
   * How the later run was found to hold this run's work. When git compared the
   * commits (the later run was on another branch, or on the same branch closing a released run), `how`
   * names the proof. When the later run was a later round of the same branch closing a run that was
   * never released, `how` says so and no commit was compared (message pbdbhR5auhrd). Absent on a
   * mark written before 26 September 2026, when that path wrote nothing here.
   */
  contains?: SupersededContains
}

/**
 * HOW A LATER RUN WAS FOUND TO HOLD THIS RUN'S WORK.
 *
 * `ancestor`: this run's sealed commit is in the history of the later run's sealed commit.
 * `same patches`: each of this run's commits has a commit with the same patch-id in the later run.
 * `same changed lines`: the same, with patches made with no lines of context, for at least one commit
 *   (decision MHMyFLGfSGLY): its own added and removed lines are unchanged, the lines around them moved.
 * `named by a released statement`: a commit the first three proofs could not find is one a wave's statement names,
 *   with the commit it became on the lane's main and the files where the wave changed its own lines, and git agrees
 *   with every other line of it; an inspector's release covers the statement.
 *   `statement` is the statement's record id.
 * `a later round of the same branch`: no commit was compared. A later round of the same branch replaces
 *   an earlier round that was never released; `commits` is empty.
 * `commits` pairs each of this run's commits with the later commit that holds it. `laterCommit` is the
 * later run's sealed commit; it is left out only on the same-branch path, when the later run holds no git seal.
 */
export const SUPERSEDED_CONTAINS_HOW = ['ancestor', 'same patches', 'same changed lines', 'named by a released statement', 'a later round of the same branch'] as const
export interface SupersededContains {
  how: (typeof SUPERSEDED_CONTAINS_HOW)[number]
  laterCommit?: string
  commits: { commit: string; as: string }[]
  /** The statement's record id, only when `how` is `named by a released statement`. */
  statement?: string
  /**
   * Where this run's commits were read from when it holds no seal (problem FuHKnNDBzrXW): its working directory, from
   * `forkBase` to `commit`. Absent when the commits came from the run's seal.
   */
  readFromItsWorkingDirectory?: { directory: string; forkBase: string; commit: string }
}

/** Read a stored containment proof, or undefined because none is stored or it is not one. */
function readContains(value: unknown): SupersededContains | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const held = value as Record<string, unknown>
  const how = held['how']
  const laterCommit = held['laterCommit']
  const commits = held['commits']
  if (!SUPERSEDED_CONTAINS_HOW.some((one) => one === how) || (typeof laterCommit !== 'string' && laterCommit !== undefined) || !Array.isArray(commits)) return undefined
  const pairs: { commit: string; as: string }[] = []
  for (const one of commits) {
    if (typeof one !== 'object' || one === null) return undefined
    const pair = one as Record<string, unknown>
    if (typeof pair['commit'] !== 'string' || typeof pair['as'] !== 'string') return undefined
    pairs.push({ commit: pair['commit'], as: pair['as'] })
  }
  const statement = held['statement']
  const read = held['readFromItsWorkingDirectory']
  const where = isObject(read) && typeof read['directory'] === 'string' && typeof read['forkBase'] === 'string' && typeof read['commit'] === 'string'
    ? { directory: read['directory'], forkBase: read['forkBase'], commit: read['commit'] }
    : null
  return {
    how: how as SupersededContains['how'],
    ...(typeof laterCommit === 'string' ? { laterCommit } : {}),
    commits: pairs,
    ...(typeof statement === 'string' && statement !== '' ? { statement } : {}),
    ...(where === null ? {} : { readFromItsWorkingDirectory: where }),
  }
}

/** Read a stored superseded mark, or null. A stored value that names no later run is not one. */
export function readSuperseded(value: unknown): Superseded | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const by = held['by']
  if (typeof by !== 'string' || by === '') return null
  const who = readParticipantRef(held['byWhom'])
  if (who === null) return null
  const at = held['at']
  const because = held['because']
  const contains = readContains(held['contains'])
  return {
    by,
    at: typeof at === 'string' ? at : '',
    byWhom: who,
    because: typeof because === 'string' ? because : '',
    ...(contains === undefined ? {} : { contains }),
  }
}

/**
 * THE SUPERSEDED MARK ON A RUN, or null because the run was not closed as superseded. The one reader of it.
 *
 * The superseded door writes it in one of two places, and only one on any run. On a run that holds a check it goes on
 * `theCheck.superseded`, beside the check it settles. On a run that holds no check it goes on the run's top-level
 * `superseded` (problem FuHKnNDBzrXW), as `closedUnchecked` does, because writing it into `theCheck` would make the run
 * read as one whose check was asked for. Every reader of a run's standing asks here, so the two places are read as one.
 */
export function theSupersededOn(data: Record<string, unknown>): Superseded | null {
  const check = data['theCheck']
  const onTheCheck = isObject(check) ? readSuperseded(check['superseded']) : null
  return onTheCheck ?? readSuperseded(data['superseded'])
}

/** A run closed unchecked. Its history remains an archive. */
export interface ClosedUnchecked {
  by: ParticipantRef
  at: string
  because: string
  decision?: string
}

/** A closure names who, when and why; an incomplete value proves no closure. */
export function readClosedUnchecked(value: unknown): ClosedUnchecked | null {
  if (!isObject(value)) return null
  const by = readParticipantRef(value['by'])
  const at = value['at']
  const because = value['because']
  const decision = value['decision']
  if (by === null || typeof at !== 'string' || at.trim() === '' || typeof because !== 'string' || because.trim() === '') return null
  if (decision !== undefined && (typeof decision !== 'string' || decision.trim() === '')) return null
  return { by, at, because, ...(decision === undefined ? {} : { decision }) }
}

/** The same archive sentence on the run's page and at its door, read by `say`. */
export function closedUncheckedSays(closed: ClosedUnchecked, say: Say, nameOf?: NameOf): string {
  return sayWithValues(say, 'chk.says.closedUnchecked', { who: nameIn(closed.by, nameOf), at: closed.at, because: closed.because })
}

/**
 * A RELEASED RUN'S CONTENT REACHED MAIN BY HAND, NOT THROUGH THE MERGE QUEUE.
 * This follows point 12 of a decision.
 * On 26 September three released runs' content was landed on main by hand, because the queue could not
 * land them, and the office showed them only as released and confirmed.
 *
 * The person or a holder of the secretary card records it through POST /api/checks/<run>/landed-by-hand, naming the
 * commit on main. The office checks, before writing, that the run was released and confirmed, that no merge entry of
 * it merged or can still land, that the commit is on the lane's main, and that git finds the run's commits in it by
 * the proofs the superseded door uses (`contains`). It is stored on the run's own `theCheck` and nowhere else, and it
 * rewrites nothing of the run. It adds no standing: the run is closed, and its sentence says where its content went.
 */
export interface LandedByHand {
  /** The commit on main that holds the run's content, all 40 characters. */
  commit: string
  /** The lane's checkout whose main the commit is on. */
  lane: string
  /** Who recorded it: the person or a holder of the secretary card. */
  by: ParticipantRef
  /** When it was recorded, in local wall clock. */
  at: string
  /** Why, in their own one sentence. */
  because: string
  /** How git found the run's commits in `commit`. */
  contains: SupersededContains
}

/** Read a stored hand-landing, or null. A value that names no commit or no recorder is not one. */
export function readLandedByHand(value: unknown): LandedByHand | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const by = readParticipantRef(held['by'])
  const contains = readContains(held['contains'])
  if (typeof held['commit'] !== 'string' || typeof held['lane'] !== 'string' || by === null || contains === undefined) return null
  return {
    commit: held['commit'],
    lane: held['lane'],
    by,
    at: typeof held['at'] === 'string' ? held['at'] : '',
    because: typeof held['because'] === 'string' ? held['because'] : '',
    contains,
  }
}

/** The hand-landing recorded on a run's `theCheck`, or null because none is. */
export function theLandedByHandOn(data: Record<string, unknown>): LandedByHand | null {
  const check = data['theCheck']
  if (typeof check !== 'object' || check === null || Array.isArray(check)) return null
  return readLandedByHand((check as Record<string, unknown>)['landedByHand'])
}

/** The one sentence a person reads about a hand-landing, the same wherever a run's standing is drawn. */
export function landedByHandSays(landed: LandedByHand, say: Say, nameOf?: NameOf): string {
  return sayWithValues(say, 'chk.says.landedByHand', {
    commit: landed.commit.slice(0, 12),
    lane: landed.lane,
    participant: say(PARTICIPANT_WORD_KEYS[landed.by.kind]),
    who: nameIn(landed.by, nameOf),
    at: landed.at,
    because: landed.because,
  })
}

/**
 * A RUN'S SENTENCE, WITH ITS HAND-LANDING SAID AFTER IT where one is recorded, at point 12 of a
 * decision. `howARunStands` and the check panel both join the two here,
 * so they join them the same way.
 */
export function andHowItLanded(said: string, landed: LandedByHand | null, say: Say, nameOf?: NameOf): string {
  return landed === null ? said : said + say('chk.says.sentenceGap') + landedByHandSays(landed, say, nameOf)
}

/**
 * The name a sentence gives one participant, or null because the reader has none for it.
 *
 * This file cannot read the registry, so a caller that can passes one in. Since criterion I1 a new
 * agent's stored id is not its handle, and a sentence a person reads names the agent by its handle.
 */
export type NameOf = (who: ParticipantRef) => string | null

/** How a sentence names one stored participant: by what `nameOf` answers, else by the stored id as it is. */
export function nameIn(who: ParticipantRef, nameOf?: NameOf): string {
  return nameOf?.(who) ?? who.id
}

/**
 * What a run closed as superseded says. It names the later run and who closed it in one sentence.
 *
 * Who closed it is named by `nameOf` where one is passed and it answers, and by the stored id as it
 * is otherwise.
 */
export function supersededSays(superseded: Superseded, nameOf?: NameOf): string {
  return (
    `Superseded by run ${superseded.by}: ${participantWord(superseded.byWhom.kind)} ${nameIn(superseded.byWhom, nameOf)} ` +
    `closed it as superseded at ${superseded.at}. ${superseded.because}`
  )
}

/**
 * THE FIELD ON A CHECK-AGAIN RUN THAT SAYS THE OFFICE ENDED IT WITH ITS MERGE ENTRY. The
 * decision yH7W1sXTRY5q, Q3 (a).
 *
 * The merge queue files a check-again run itself (`askForACheckAgain`), and nobody works in it. When
 * its check refuses, the entry bounces, and before this the run stayed in rebuttal for ever: a
 * rebuttal ends when the worker finishes again or somebody releases the run, and neither happens to
 * a run nobody works in. The office writes this in the same transaction as the entry's `refused`
 * bounce, and a run carrying it stands `closed`. The refusal on the run is kept as it was.
 */
export const ENDED_WITH_ITS_MERGE_ENTRY = 'endedWithItsMergeEntry'

/** The office ended a check-again run together with the merge entry its refusal bounced. */
export interface EndedWithItsMergeEntry {
  /** The merge entry the run was the check again for, by record id. */
  entry: string
  /** When, in local wall clock. */
  at: string
  /** Why, in one sentence the office wrote. */
  because: string
}

/** Read a stored ending, or null. A stored value that names no merge entry is not one. */
export function readEndedWithItsMergeEntry(value: unknown): EndedWithItsMergeEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const entry = held['entry']
  if (typeof entry !== 'string' || entry === '') return null
  const at = held['at']
  const because = held['because']
  return { entry, at: typeof at === 'string' ? at : '', because: typeof because === 'string' ? because : '' }
}

/**
 * WHAT A CHECK-AGAIN RUN THE OFFICE ENDED SAYS. One sentence, here so that the run's page and the
 * server's reply say the same words.
 */
export function endedWithItsMergeEntrySays(ended: EndedWithItsMergeEntry, say: Say): string {
  return sayWithValues(say, 'chk.says.endedWithItsMergeEntry', { entry: ended.entry, at: ended.at })
}

/**
 * THE FIELD ON A RUN THE OFFICE FILED FOR A SECRETARY'S design/-ONLY MERGE ENTRY, WHICH SAYS IT NEEDS
 * NO CHECK, by decision 9sQNuC_N8MVX and one more. The shape follows yH7W1sXTRY5q, Q3 (a).
 *
 * The office files such a run itself, already finished (`submitASecretarysDesignEntry`), and no rule
 * ever asks a check of it. Before this, the run read as a finish nobody released, and every list of
 * runs waiting for a check counted it for ever. The office writes this in the same first write that
 * files the run, and a run carrying it stands `closed`.
 */
export const NEEDS_NO_CHECK = 'needsNoCheck'

/** The office filed this run for a secretary's design/-only entry, which no rule asks a check of. */
export const NEEDS_NO_CHECK_RULES = ['a-take-back-returns-main-to-a-checked-state'] as const

export interface NeedsNoCheck {
  /** The decision that asks no check of such an entry, by record id. */
  decision?: string
  /** Exactly one of decision and a known rule is present. */
  rule?: typeof NEEDS_NO_CHECK_RULES[number]
  /** When, in local wall clock. */
  at: string
  /** Why, in one sentence the office wrote. */
  because: string
}

/** Read exactly one nonempty decision or known stable rule; unreadable authority is no mark. */
export function readNeedsNoCheck(value: unknown): NeedsNoCheck | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const decision = held['decision']
  const rule = held['rule']
  if ((decision !== undefined) === (rule !== undefined)) return null
  if (decision !== undefined && (typeof decision !== 'string' || decision.trim() === '')) return null
  if (rule !== undefined && !(NEEDS_NO_CHECK_RULES as readonly unknown[]).includes(rule)) return null
  const at = held['at']
  const because = held['because']
  return { ...(decision === undefined ? { rule: rule as NeedsNoCheck['rule'] } : { decision: decision as string }), at: typeof at === 'string' ? at : '', because: typeof because === 'string' ? because : '' }
}

/**
 * WHAT A RUN THE OFFICE FILED FOR A SECRETARY'S ENTRY SAYS. One sentence, here so that the run's page
 * and the server's reply say the same words. It names the decision the run stores, which the office
 * writes as that decision's id.
 */
export function needsNoCheckSays(needs: NeedsNoCheck, say: Say): string {
  if (needs.rule !== undefined) return say('chk.says.takeBackNeedsNoCheck')
  return sayWithValues(say, 'chk.says.needsNoCheck', { decision: needs.decision! })
}

// ============================================================ where a run stands after it reported

/**
 * THE SIX PLACES A RUN CAN BE AFTER IT SAYS ITS WORK IS FINISHED. Criterion C29.
 *
 * A worker does not close straight after it reports: it is then inspecting. If the check fails, it enters rebuttal
 * and a group discusses it; a problem goes back for rework, and with no problem it reports and ends. If the check
 * passes, it enters reporting, reports to its supervisor, and closes once that is confirmed.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS A FOURTH VOCABULARY AND IT IS ABOUT A RUN
 * ---------------------------------------------------------------------------------------
 *
 * Three other lists of words are near it and none of them means this, so nothing may read one as
 * another. `session.data.state` — running, idle, finished, crashed, orphaned, unknown — describes A
 * PROCESS. The work states in src/shared/lifecycle.ts — working, reporting, standing-by, blocked,
 * finished — describe AN AGENT's job, and are the newest row of `agent_work_transitions`. The
 * presence words beside them describe whether an agent can be reached. These six describe ONE RUN,
 * between the moment it says its work is finished and the moment somebody closes it.
 *
 * `reporting` is spelt the same in this list and in the work states, and it means something else in
 * each: here it is one run waiting for its supervisor to confirm a report, there it is an agent
 * that has finished a stage. Nothing in this file reads or returns a word of any other list.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS STORED, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * The standing is worked out from the office's own acts, every time somebody asks. The finish is
 * `state`, the verdict is `released` or `refused`, the close is `confirmed` (or, on a run the office
 * filed itself, `endedWithItsMergeEntry` or `needsNoCheck`), the overtaking is `superseded` on the
 * run's own `theCheck`, and each of those is written by the act that happened
 * rather than by anybody's word about it. A stored standing would be a further fact free to
 * disagree with the ones that produced it — and it would let a worker write its own state, which
 * is the one thing C29 says the states are not.
 */
// THE SEVEN STANDINGS ARE PUBLISHED IN src/shared/plugin-read.ts, the one file a plugin may import, because the
// plugins' work view says each run's standing. They are worked out here and nowhere else.
export { RUN_STANDINGS, type RunStanding }

/** One standing, the name a person reads, and what the product says it means. */
export interface StandingWord {
  value: RunStanding
  /** What a person reads on the screen. A name, not a sentence. */
  word: string
  /** What the product says when they ask what it means. */
  sentence: string
}

/**
 * The standings with their sentences.
 *
 * Keyed by the value rather than listed, so a word added to `RUN_STANDINGS` with no sentence does
 * not compile. The sentences are written for somebody who has not read the criterion.
 */
export const STANDING_WORD_KEYS: Readonly<Record<RunStanding, { word: WordKey; sentence: WordKey }>> = {
  'closed unchecked': { word: 'chk.standing.closedUnchecked.word', sentence: 'chk.standing.closedUnchecked.sentence' },
  working: { word: 'chk.standing.working.word', sentence: 'chk.standing.working.sentence' },
  inspecting: { word: 'chk.standing.inspecting.word', sentence: 'chk.standing.inspecting.sentence' },
  rebuttal: { word: 'chk.standing.rebuttal.word', sentence: 'chk.standing.rebuttal.sentence' },
  reporting: { word: 'chk.standing.reporting.word', sentence: 'chk.standing.reporting.sentence' },
  closed: { word: 'chk.standing.closed.word', sentence: 'chk.standing.closed.sentence' },
  superseded: { word: 'chk.standing.superseded.word', sentence: 'chk.standing.superseded.sentence' },
}
export const STANDING_WITHOUT_A_CHECK_WORD_KEYS: Readonly<Record<'inspecting' | 'closed', { word: WordKey; sentence: WordKey }>> = {
  inspecting: { word: 'chk.standingNoCheck.inspecting.word', sentence: 'chk.standingNoCheck.inspecting.sentence' },
  closed: { word: 'chk.standingNoCheck.closed.word', sentence: 'chk.standingNoCheck.closed.sentence' },
}
/** English is read on access because the word lists also import the standing reader. */
function standingWord(value: RunStanding, keys: { word: WordKey; sentence: WordKey }): StandingWord {
  return {
    value,
    get word() { return sayInEnglish(keys.word) },
    get sentence() { return sayInEnglish(keys.sentence) },
  }
}

export const RUN_STANDING: Readonly<Record<RunStanding, StandingWord>> = {
  'closed unchecked': standingWord('closed unchecked', STANDING_WORD_KEYS['closed unchecked']),
  working: standingWord('working', STANDING_WORD_KEYS['working']),
  inspecting: standingWord('inspecting', STANDING_WORD_KEYS['inspecting']),
  rebuttal: standingWord('rebuttal', STANDING_WORD_KEYS['rebuttal']),
  reporting: standingWord('reporting', STANDING_WORD_KEYS['reporting']),
  closed: standingWord('closed', STANDING_WORD_KEYS['closed']),
  superseded: standingWord('superseded', STANDING_WORD_KEYS['superseded']),
}

/**
 * THE TWO STANDINGS THAT READ DIFFERENTLY WHEN NO INSPECTOR WAS EVER STARTED. One decision sets them,
 * and so does the decision of 11 September 2026 on what such a closure proves.
 *
 * The ordinary inspecting sentence says a check is under way. At review levels `none` and `light`,
 * no inspector was started and no check released a report. These words say that explicitly in both
 * standings, so a confirmation cannot be mistaken for a check.
 *
 * THE OTHER FOUR ARE UNCHANGED. `working` is before any of this; `rebuttal` and `reporting` cannot
 * be reached at these levels, because both need a verdict and no check writes one. `superseded` is
 * not a closure a level decides: it is the starter overtaking a run that a later one finished, and
 * it reads the same wherever it was closed.
 */
export const STANDING_WITHOUT_A_CHECK: Readonly<Record<'inspecting' | 'closed', StandingWord>> = {
  inspecting: standingWord('inspecting', STANDING_WITHOUT_A_CHECK_WORD_KEYS.inspecting),
  closed: standingWord('closed', STANDING_WITHOUT_A_CHECK_WORD_KEYS.closed),
}

/** Decision xqEqVk7M-9jE: this note postpones settlement to the round; it never settles the run. */
export interface AWorkerCheckNotAsked {
  why: 'worker-of-a-round'
  starter: { kind: 'agent'; id: string }
}

/**
 * The one reader of the office's stored worker note. A real ask is never read as this note.
 *
 * A NOTE WRITTEN BEFORE THE DECISION FIELD WAS DROPPED STILL READS, and its `decision` is neither
 * required nor answered. Old notes stay as they are: no migration rewrites them, and the decision
 * stays findable from the office's own records.
 */
export function readWorkerCheckNotAsked(data: Record<string, unknown>): AWorkerCheckNotAsked | null {
  const check = data['theCheck']
  if (!isObject(check) || check['message'] !== undefined || check['askedOf'] !== undefined) return null
  const note = check['notAsked']
  if (!isObject(note) || note['why'] !== 'worker-of-a-round') return null
  const starter = readParticipantRef(note['starter'])
  if (starter?.kind !== 'agent') return null
  return { why: 'worker-of-a-round', starter: { kind: 'agent', id: starter.id } }
}

/** The API and the page choose the worker's standing words here, from the stored note alone. */
export function workerRoundStanding(data: Record<string, unknown>, standing: RunStanding, say: Say = sayInEnglish): StandingWord | null {
  if (standing !== 'inspecting' || readWorkerCheckNotAsked(data) === null) return null
  return { value: standing, word: say('chk.workerRound.word'), sentence: say('chk.workerRound.sentence') }
}

/** Whether a stored string is one of the six standings. Anything else is a fault. */
export function isRunStanding(value: unknown): value is RunStanding {
  return typeof value === 'string' && (RUN_STANDINGS as readonly string[]).includes(value)
}

/**
 * WHICH STANDING ONE RUN IS IN, worked out from the office's own acts and nothing else.
 *
 * A run closed unchecked is an archive with nothing owed. Its earlier
 * release or refusal remains recorded, and is no longer something to wait on.
 * The order of the questions is the design. A superseded run is closed whatever else is on it: it
 * was overtaken by a later run, and the refusal it may also hold is part of what the later run
 * finished rather than a discussion still open. A confirmation closes a run whatever came before
 * it. A release ends a rebuttal, because *the group agreed nothing was wrong* is spelt by
 * releasing. A refusal that has not been reworked is the rebuttal. Anything else that said it was
 * finished is being checked, and anything that has not is still working.
 *
 * A CHECK-AGAIN RUN THE OFFICE ENDED WITH ITS MERGE ENTRY IS CLOSED, though nobody confirmed it: its
 * refusal is what the ending answers, and nobody works in it to answer it another way. The
 * decision yH7W1sXTRY5q, Q3 (a), which keeps the six standings of C29.
 *
 * A RUN THE OFFICE FILED FOR A SECRETARY'S design/-ONLY ENTRY IS CLOSED TOO, though nobody checked or
 * confirmed it: a decision asks no check of such an entry, so there is nothing for the run
 * to wait for. It follows that decision's pattern and adds no seventh standing.
 */
export function standingOf(input: {
  saidFinished: boolean
  released: Release | null
  refused: Refusal | null
  confirmed: Confirmation | null
  superseded: Superseded | null
  /** The office's ending of a check-again run, or null because it holds none. */
  ended?: EndedWithItsMergeEntry | null
  /** The office's mark that it filed this run for a secretary's entry, or null because it holds none. */
  needsNoCheck?: NeedsNoCheck | null
  closedUnchecked?: ClosedUnchecked | null
}): RunStanding {
  if (input.closedUnchecked != null) return 'closed unchecked'
  if (input.superseded !== null) return 'superseded'
  if (input.confirmed !== null) return 'closed'
  if ((input.ended ?? null) !== null) return 'closed'
  if ((input.needsNoCheck ?? null) !== null) return 'closed'
  if (input.released !== null) return 'reporting'
  if (input.refused !== null && (input.refused.reworked ?? null) === null) return 'rebuttal'
  if (input.saidFinished) return 'inspecting'
  return 'working'
}

/**
 * WHAT THE SECRETARY IS ASKED FOR AT EACH LEVEL THAT STARTS NO CHECK, and the level's own word. At `none` it
 * confirms the run; at `light` it answers the report. The level's word is the
 * one the check panel already says it in, whose English is REVIEW_LEVEL_WORDS' in src/shared/workspaces.ts.
 */
const WAITING_ON_THE_SECRETARY: Readonly<Record<'none' | 'light', { asked: WordKey; level: WordKey }>> = {
  none: { asked: 'chk.says.waits.toConfirm', level: 'chk.reviewLevel.none' },
  light: { asked: 'chk.says.waits.toAnswer', level: 'chk.reviewLevel.light' },
}

/** The door supplies the whole list. Older callers can still name the recorded recipient. */
export function reportConfirmers(released: Release | null, confirmation?: ReportConfirmation): readonly ParticipantRef[] | null {
  if (confirmation !== undefined) return confirmation.allowed
  return released?.reportedTo == null ? null : [released.reportedTo]
}

/** Each allowed participant is an alternative confirmer, in the reader's language. */
export function reportConfirmerNames(allowed: readonly ParticipantRef[] | null, say: Say, nameOf?: NameOf): string | null {
  if (allowed === null || allowed.length === 0) return null
  return allowed.map(who => nameIn(who, nameOf)).reduce((first, next) => sayWithValues(say, 'w13j.confirm.or', { first, next }))
}

/**
 * WHAT THIS RUN IS WAITING FOR, naming whoever it is waiting on where the run says who.
 *
 * One sentence, and it never invents a name: where nothing on the run says which inspector was
 * asked, which group was opened or who was told, it says that instead of naming somebody plausible.
 */
export function whatARunWaitsFor(input: {
  standing: RunStanding
  released: Release | null
  refused: Refusal | null
  confirmed: Confirmation | null
  /** Whoever the office asked about this run, by handle, or null because the run does not say. */
  inspector: string | null
  /**
   * THE PROJECT'S REVIEW LEVEL WHEN THE OFFICE ASKED, or null because the run does not say.
   *
   * A run at `none` or `light` is waiting for the secretary and not for an inspector, and the two
   * sentences must not be the same: naming the secretary as the inspector would say a check is
   * coming that nobody started. Null is a run that finished before the level existed, which reads
   * as the inspector's sentence because that is what happened to it.
   */
  reviewLevel?: ReviewLevel | null
  /** Names whoever the run reported to; with none, the sentence prints the stored id. */
  nameOf?: NameOf
  reportConfirmation?: ReportConfirmation
}, say: Say): string | null {
  const level = input.reviewLevel ?? null
  switch (input.standing) {
    case 'working':
      return null
    case 'inspecting':
      if (level !== null && level !== 'full') {
        const words = WAITING_ON_THE_SECRETARY[level]
        const values = { asked: say(words.asked), level: say(words.level) }
        return input.inspector === null
          ? sayWithValues(say, 'chk.says.waits.secretary', values)
          : sayWithValues(say, 'chk.says.waits.secretaryNamed', { ...values, who: input.inspector })
      }
      return input.inspector === null
        ? say('chk.says.waits.aCheck')
        : sayWithValues(say, 'chk.says.waits.inspector', { who: input.inspector })
    case 'rebuttal':
      // A REFUSAL THAT OPENED NO GROUP names no group to wait on, and says why there is none. The word's
      // English is NO_GROUP_FOR_A_CHECK_AGAIN.
      return input.refused !== null && input.refused.group === undefined
        ? say('chk.noGroupForCheckAgain')
        : sayWithValues(say, 'chk.says.waits.group', { group: input.refused?.group ?? say('chk.says.waits.groupNotNamed') })
    case 'reporting': {
      if (input.reportConfirmation?.rule === 'any-registered-at-off') return say('chk.says.waits.anybodyAtOff')
      const allowed = reportConfirmers(input.released, input.reportConfirmation)
      const who = reportConfirmerNames(allowed, say, input.nameOf)
      if (who === null) return say('chk.says.waits.supervisor')
      const only = allowed?.length === 1 ? allowed[0] : undefined
      return only === undefined
        ? sayWithValues(say, 'w13j.confirm.waits.allowed', { who })
        : sayWithValues(say, 'chk.says.waits.supervisorNamed', { participant: say(PARTICIPANT_WORD_KEYS[only.kind]), who })
    }
    case 'closed':
    case 'closed unchecked':
      return null
    case 'superseded':
      return null
  }
}

/**
 * WHAT A RUN SAYS WHEN ITS WORK IS FINISHED is declared in src/config/finished.mjs, which tools/office-request.mjs reads
 * too, under a Node that cannot read TypeScript. All three are named again here for the office. The words are typed
 * as strings here so that a caller may ask whether any word is one of them.
 */
export const FINISHED_STATES: readonly string[] = THE_FINISHED_STATES
export { aRunSaysItIsFinished, THE_SWEEPS_CLOSE }

/**
 * WHICH INSPECTOR THE OFFICE ASKED, by handle, or null because the run does not say.
 *
 * Read off the run's own `theCheck` rather than from the registry, because the question is which
 * inspector THIS check was given to on the day it was asked for, and the registry answers a
 * different question: who holds the card now.
 */
export function theReviewLevelAsked(data: Record<string, unknown>): ReviewLevel | null {
  const held = data['theCheck']
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null
  const level = (held as Record<string, unknown>)['reviewLevel']
  // A STORED WORD THAT IS NOT ONE OF THE THREE READS AS NOTHING RECORDED rather than throwing here:
  // this is a drawing path, it runs in the browser as well as the server, and a run whose stored
  // level is unreadable is a run that says nothing about its level. `reviewLevelOf` on the workspace
  // column is where an unreadable value is refused, because that is where one can be acted on.
  return typeof level === 'string' && (REVIEW_LEVELS as readonly string[]).includes(level)
    ? (level as ReviewLevel)
    : null
}

export function theInspectorAsked(data: Record<string, unknown>): string | null {
  const held = data['theCheck']
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null
  const asked = (held as Record<string, unknown>)['askedOf']
  return typeof asked === 'string' && asked !== '' ? asked : null
}

/** Everything about where a run stands that can be worked out from the run's own stored fields. */
export interface HowARunStands {
  closedUnchecked: ClosedUnchecked | null
  saidFinished: boolean
  released: Release | null
  refused: Refusal | null
  confirmed: Confirmation | null
  /** The later run that overtook this one, or null because it was not closed as superseded. */
  superseded: Superseded | null
  /** The office's ending of a check-again run with its merge entry, or null because it holds none. */
  endedWithItsMergeEntry: EndedWithItsMergeEntry | null
  /** The office's mark that it filed this run for a secretary's entry, or null because it holds none. */
  needsNoCheck: NeedsNoCheck | null
  /** How this run's content reached main by hand, or null because nobody recorded that it did. */
  landedByHand: LandedByHand | null
  standing: RunStanding
  waitingFor: string | null
  unreleasedFinish: boolean
  says: string
}

/**
 * WHERE A RUN STANDS, OFF ITS OWN STORED FIELDS AND NOTHING ELSE.
 *
 * IT IS HERE SO THAT THE SERVER AND THE BROWSER READ IT ONCE. The run's page draws the standing,
 * what the check read and what it is waiting for, and it has the record in its hand; the server
 * answers the same things on GET /api/checks/<run>. Two readings of four stored fields would be two
 * places free to disagree about what a refusal means, which is this repository's ninth invariant.
 *
 * WHAT IT CANNOT ANSWER is which agent the run serves, because that needs the registry. The
 * server's `whereARunStands` adds it.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The office's refusal is also the page's explanation; it does not mean no inspector exists. */
export function whyNoCheckWasStarted(data: Record<string, unknown>): string | null {
  if (readWorkerCheckNotAsked(data) !== null) return sayInEnglish('chk.workerRound.sentence')
  const check = isObject(data['theCheck']) ? data['theCheck'] : {}
  const eligibility = isObject(check['eligibility']) ? check['eligibility'] : {}
  return eligibility['eligible'] === false && typeof check['says'] === 'string' ? check['says'] : null
}

export function whyTheCheckFailed(data: Record<string, unknown>): string | null {
  const check = isObject(data['theCheck']) ? data['theCheck'] : {}
  const execution = isObject(check['execution']) ? check['execution'] : {}
  return typeof execution['failed'] === 'string' && typeof check['says'] === 'string' ? check['says'] : null
}

/**
 * WHAT THIS RUN WAITS FOR, off its own `theCheck`, read by `say`. `howARunStands` asks it with the English
 * reader for `waitingFor`; the check panel asks it with the page's reader, where `waitingFor` is a wait and
 * not a stored refusal. One place reads which inspector and which level the run's check names.
 */
export function whatTheRunWaitsFor(
  data: Record<string, unknown>,
  stands: { standing: RunStanding; released: Release | null; refused: Refusal | null; confirmed: Confirmation | null },
  say: Say,
  nameOf?: NameOf,
  reportConfirmation?: ReportConfirmation,
): string | null {
  if (workerRoundStanding(data, stands.standing, say) !== null) return say('chk.workerRound.waiting')
  return whatARunWaitsFor({ ...stands, inspector: theInspectorAsked(data), reviewLevel: theReviewLevelAsked(data), nameOf, ...(reportConfirmation === undefined ? {} : { reportConfirmation }) }, say)
}

/**
 * WHAT FOLLOWS A FAILED CHECK, said after its reason: the run stays inspecting and its starter can ask
 * again; or the run now stands somewhere else; or a newer check was asked for and this one changed nothing.
 * `recordCheckToolEnded` in src/server/lib/inspection.ts says which.
 */
export type CheckFailedNext = { stays: true } | { now: RunStanding } | { newer: true }

/** A standing's own word, as a failed check's sentence names it. The English is the stored word itself. */
const STANDING_NAMED: Readonly<Record<RunStanding, WordKey>> = {
  working: 'chk.says.standingNamed.working',
  inspecting: 'chk.says.standingNamed.inspecting',
  rebuttal: 'chk.says.standingNamed.rebuttal',
  reporting: 'chk.says.standingNamed.reporting',
  closed: 'chk.says.standingNamed.closed',
  superseded: 'chk.says.standingNamed.superseded',
  'closed unchecked': 'chk.says.standingNamed.closedUnchecked',
}

function whatFollows(next: CheckFailedNext, say: Say): string {
  if ('now' in next) return say('chk.says.checkFailed.nowStands', { standing: say(STANDING_NAMED[next.now]) })
  return say('newer' in next ? 'chk.says.checkFailed.newer' : 'chk.says.checkFailed.stays')
}

/**
 * WHAT THE OFFICE SAYS WHEN A CHECK ENDED WITHOUT A VERDICT. A queued repeat is named instead of
 * asking somebody to start it again. Otherwise the reason keeps the tool's own words, and a sentence
 * about the run's standing already present in that reason is not repeated.
 */
export function theCheckFailedSays(reason: string, next: CheckFailedNext, say: Say, askedAgain?: string): string {
  const said = sayWithValues(say, 'chk.says.checkFailed', { reason })
  if (askedAgain !== undefined) return said + say('chk.says.sentenceGap') + say('chk.says.checkFailed.askedAgain', { message: askedAgain })
  return reason.includes(whatFollows(next, sayInEnglish)) ? said : said + say('chk.says.sentenceGap') + whatFollows(next, say)
}

/** Every `CheckFailedNext` there is, so a stored sentence can be matched against each. */
const EVERY_NEXT: readonly CheckFailedNext[] = [{ stays: true }, { newer: true }, ...RUN_STANDINGS.map((now) => ({ now }))]

/**
 * A STORED SENTENCE ABOUT A CHECK, IN THE READER'S LANGUAGE WHERE IT CAN BE SAID AGAIN, or null because
 * the run stores none of that kind.
 *
 * The office stores the English. The page says it again in its own language only where the run also stores
 * the facts it was made from AND the English made from them again is the stored sentence, byte for byte.
 * Where it is not — a sentence stored before its words were these, or facts that do not read — the stored
 * English is what the run says, and `composed` is false so the panel draws it as stored.
 */
export interface ASentenceAboutTheCheck {
  says: string
  composed: boolean
}

function againIn(stored: string, candidates: readonly ((say: Say) => string)[], say: Say): ASentenceAboutTheCheck {
  const same = candidates.find((compose) => compose(sayInEnglish) === stored)
  return same === undefined ? { says: stored, composed: false } : { says: same(say), composed: true }
}

/**
 * Why no check was started, as `whyNoCheckWasStarted` reads it, in the reader's language where it can be.
 * The acts the sentence is made from are the ones that apply to the run's kind: it reads the kind from
 * `data` through `aRunRunsNoModel`, the same way the office read it when it wrote the note, so the
 * English made again here is the stored sentence and the page can say it in its own language.
 */
export function whyNoCheckWasStartedIn(data: Record<string, unknown>, say: Say): ASentenceAboutTheCheck | null {
  if (readWorkerCheckNotAsked(data) !== null) return { says: say('chk.workerRound.sentence'), composed: true }
  const stored = whyNoCheckWasStarted(data)
  if (stored === null) return null
  const check = isObject(data['theCheck']) ? data['theCheck'] : {}
  const eligibility = isObject(check['eligibility']) ? check['eligibility'] : {}
  const missing = readMissing(eligibility['missing'])
  return againIn(stored, missing === null ? [] : [(one) => noCheckSays(missing, one, aRunRunsNoModel(data))], say)
}

/** Why the check failed, as `whyTheCheckFailed` reads it, in the reader's language where it can be. */
export function whyTheCheckFailedIn(data: Record<string, unknown>, say: Say): ASentenceAboutTheCheck | null {
  const stored = whyTheCheckFailed(data)
  if (stored === null) return null
  const check = isObject(data['theCheck']) ? data['theCheck'] : {}
  const execution = isObject(check['execution']) ? check['execution'] : {}
  const reason = String(execution['failed'])
  return againIn(stored, EVERY_NEXT.map((next) => (one: Say) => theCheckFailedSays(reason, next, one)), say)
}

/** A stored list of missing facts, or null because what is stored is not one. */
function readMissing(value: unknown): CheckEligibility['missing'] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const missing: CheckEligibility['missing'] = []
  for (const one of value) {
    if (!isObject(one)) return null
    const fact = CHECK_FACTS.find((known) => known === one['fact'])
    const state = one['state']
    if (fact === undefined || (state !== 'missing' && state !== 'unknown')) return null
    missing.push({ fact, state })
  }
  return missing
}

/**
 * `nameOf` names every participant a sentence here prints: who released, refused, confirmed or
 * superseded the run, and who it reported to. With none, each sentence prints the stored id.
 * `reportConfirmation` is the door's answer for who may confirm, supplied by callers that draw that wait.
 */
export function howARunStands(data: Record<string, unknown>, nameOf?: NameOf, reportConfirmation?: ReportConfirmation): HowARunStands {
  const released = readRelease(data['released'])
  const refused = readRefusal(data['refused'])
  const confirmed = readConfirmation(data['confirmed'])
  const superseded = theSupersededOn(data)
  const closedUnchecked = readClosedUnchecked(data['closedUnchecked'])
  const ended = readEndedWithItsMergeEntry(data[ENDED_WITH_ITS_MERGE_ENTRY])
  const needsNoCheck = readNeedsNoCheck(data[NEEDS_NO_CHECK])
  const landedByHand = theLandedByHandOn(data)
  const saidFinished = aRunSaysItIsFinished(data)
  const standing = standingOf({ saidFinished, released, refused, confirmed, superseded, ended, needsNoCheck, closedUnchecked })
  const roundStanding = workerRoundStanding(data, standing)
  // THE SENTENCE FOLLOWS THE STANDING, most recent act first. A run closed as superseded says that
  // before anything else: whatever else it holds, the later run is where the work went. A run its
  // supervisor has confirmed is over and says so; one a check refused says that rather than "nobody
  // has released it, so no check happened", which was the false half a stored refusal fixes.
  const ineligible = saidFinished ? whyTheCheckFailed(data) ?? whyNoCheckWasStarted(data) : null
  // A HAND-LANDING IS ONE MORE FACT ON A CLOSED RUN, said after what closed it, at point 12 of a
  // decision.
  const says0 =
    closedUnchecked !== null ? closedUncheckedSays(closedUnchecked, sayInEnglish, nameOf) : superseded !== null
      ? supersededSays(superseded, nameOf)
      : confirmed !== null
        ? confirmedSays(confirmed, released, nameOf)
        : ended !== null
          ? endedWithItsMergeEntrySays(ended, sayInEnglish)
          : needsNoCheck !== null
            ? needsNoCheckSays(needsNoCheck, sayInEnglish)
            : released !== null
              ? saidFinished
                ? releasedSays(released, nameOf)
                : releasedWithoutFinishing(released, nameOf)
              : refused !== null
                ? refusedSays(refused, nameOf)
                : saidFinished
                  ? roundStanding?.sentence ?? ineligible ?? AN_UNCHECKED_FINISH
                  : STILL_WORKING
  const says = andHowItLanded(says0, landedByHand, sayInEnglish, nameOf)
  return {
    closedUnchecked,
    saidFinished,
    released,
    refused,
    confirmed,
    superseded,
    endedWithItsMergeEntry: ended,
    needsNoCheck,
    landedByHand,
    standing,
    // A SUPERSEDED RUN WAITS ON NOTHING, even where a failed check is recorded on it. The check
    // that could not conclude is exactly what the later run overtook, and naming it as still waited
    // on would say the starter had left something owed. A check-again run the office ended waits on
    // nothing for the same reason: its entry has bounced and nobody works in it. A run the office filed
    // for a secretary's entry waits on nothing because no rule asks a check of it.
    waitingFor: closedUnchecked !== null || superseded !== null || ended !== null || needsNoCheck !== null ? null : (roundStanding === null ? ineligible : null) ?? whatTheRunWaitsFor(
      data, { standing, released, refused, confirmed }, sayInEnglish, nameOf, reportConfirmation,
    ),
    // AND A RUN SOMEBODY CLOSED IS NOT AN UNRELEASED FINISH, whatever released it or did not. This
    // reading is what the starter's list counts and what `GET /api/checks` calls unreleased, and
    // before 11 September 2026 a confirmation always came after a release, so `released === null`
    // answered it on its own. At the review levels `none` and `light` a run closes on a confirmation
    // with no release, and without this clause every such run would sit
    // on the starter's list as a finish nobody had answered for, for ever, while its own page said
    // it was closed. At `full` nothing changes: a confirmed run there has a release by definition.
    // AND A SUPERSEDED RUN IS CLOSED TOO: leaving it here would count it as a finish nobody released
    // for ever, which is the state a decision exists to end. AND
    // A CHECK-AGAIN RUN THE OFFICE ENDED WITH ITS MERGE ENTRY IS CLOSED TOO (decision yH7W1sXTRY5q,
    // Q3 (a)). AND SO IS A RUN THE OFFICE FILED FOR A SECRETARY'S design/-ONLY ENTRY, which no rule
    // asks a check of.
    unreleasedFinish:
      closedUnchecked === null && superseded === null && ended === null && needsNoCheck === null && saidFinished && released === null && confirmed === null,
    says,
  }
}

// ============================================================================ the reading

/** Where one run stands: what it said, whether anybody checked it, and one sentence saying so. */
export interface WhereARunStands {
  closedUnchecked: ClosedUnchecked | null
  /** The session record this is about. */
  run: string
  /** The handle of the agent this run serves, or null because the run does not say. */
  agent: string | null
  /** True when the run says its work is finished. Its own word, which is not the end. */
  saidFinished: boolean
  /** The release, or null because nobody has written one. */
  released: Release | null
  /** The refusal, or null because no check has refused this run. Criterion C29. */
  refused: Refusal | null
  /** The supervisor's confirmation, or null because nobody has confirmed. Criterion C29. */
  confirmed: Confirmation | null
  /** The later run this one was closed as superseded by, or null. */
  superseded: Superseded | null
  /** The office's ending of a check-again run with its merge entry, or null. Decision yH7W1sXTRY5q. */
  endedWithItsMergeEntry: EndedWithItsMergeEntry | null
  /** The office's mark that it filed this run for a secretary's entry, or null. */
  needsNoCheck: NeedsNoCheck | null
  /** How this run's content reached main by hand, or null because nobody recorded that it
   * did. */
  landedByHand: LandedByHand | null
  /** Which standing this run is in. Worked out, never stored. Criterion C29. */
  standing: RunStanding
  /** One sentence naming what it is waiting for, or null because nothing is waiting on anybody. */
  waitingFor: string | null
  /** True when the run said it was finished and nothing released it. Criterion C18. */
  unreleasedFinish: boolean
  /** The one sentence a screen, a reply or a report says about it. */
  says: string
}

/** What a run that said it was finished and was never released says. Criteria C17 and C18. */
export const AN_UNCHECKED_FINISH =
  'This run says its work is finished and nobody has released it, so no check happened. A subagent ' +
  'saying it is done does not end it.'

/** What a run nobody has finished says. */
export const STILL_WORKING = 'This run has not said its work is finished.'

/** What a released run says. `nameOf` names who released it; with none, the stored id is printed. */
export function releasedSays(release: Release, nameOf?: NameOf): string {
  return `Released by ${participantWord(release.by.kind)} ${nameIn(release.by, nameOf)} at ${release.at}, checked by ${release.how}.`
}

/** A run that was released without ever saying it was finished. Rare, and said rather than hidden. */
export function releasedWithoutFinishing(release: Release, nameOf?: NameOf): string {
  return `${releasedSays(release, nameOf)} The run never said its work was finished.`
}

/**
 * WHAT A RUN A CHECK REFUSED SAYS. Criterion C29.
 *
 * It replaces `AN_UNCHECKED_FINISH` on a refused run, and that is a correction rather than an
 * addition: before the refusal was stored, a run a check had turned down and a run nobody had
 * looked at both said *nobody has released it, so no check happened*, and the second half of that
 * was false on the refused one.
 */
export function refusedSays(refusal: Refusal, nameOf?: NameOf): string {
  const worked = refusal.reworked ?? null
  const rests = theBasisNamed(refusal)
  const first =
    `A check refused to release this run: ${participantWord(refusal.by.kind)} ${nameIn(refusal.by, nameOf)} at ${refusal.at}, ` +
    `on ${rests}. ${String(refusal.missing.length)} thing${refusal.missing.length === 1 ? ' is' : 's are'} named ` +
    `as missing. ${refusal.group === undefined ? NO_GROUP_FOR_A_CHECK_AGAIN : `The group opened for it is ${refusal.group}.`}`
  // A REFUSAL THAT OPENED NO GROUP IS NOT TALKED OUT, so it does not say it is.
  return worked !== null
    ? `${first} The worker said its work was finished again at ${worked.at}, so it is being checked again.`
    : refusal.group === undefined
      ? first
      : `${first} The refusal stands while it is talked out.`
}

/**
 * WHY A REFUSAL OF THE MERGE QUEUE'S CHECK AGAIN OPENED NO GROUP. Decision yH7W1sXTRY5q, Q4.
 * One sentence, said in the worker's message, the starter's message, the run's reading and the run's
 * page, so all four say it the same way.
 */
export const NO_GROUP_FOR_A_CHECK_AGAIN =
  "No group was opened for this refusal, because the refused run is the merge queue's check again and nobody works in it."


/** What a run its supervisor has confirmed says. It is the one sentence that means the run is over. */
export function confirmedSays(confirmation: Confirmation, release: Release | null, nameOf?: NameOf): string {
  const before = release === null ? '' : `${releasedSays(release, nameOf)} `
  // `participantWord` AND NOT A TERNARY OVER THE STORED WORD. There is one reading of what a
  // participant kind means and it is that function; a `kind === 'person' ? … : …` here would be a
  // second, free to disagree with it, and tests/the-machine-word-gate.test.ts is what said so.
  return (
    `${before}The ${participantWord(confirmation.by.kind)} ${nameIn(confirmation.by, nameOf)} confirmed the report at ` +
    `${confirmation.at}, so this run is closed. ` +
    // NOTHING CHECKED A RUN NOBODY RELEASED, AND THE CLOSING SENTENCE SAYS SO. At the review levels
    // `none` and `light` the office starts no inspector, so the run closes on a confirmation alone.
    // Every place a release's words are drawn has to be able to tell the two closures apart, and
    // this is the sentence that does it.
    (release === null ? `${confirmedNotChecked(confirmation, sayInEnglish)} ` : '') +
    (confirmation.because === '' ? '' : `They said: ${confirmation.because}`)
  ).trim()
}

/**
 * WHAT A CLOSURE MADE WITHOUT A CHECK PROVES, AND WHAT IT DOES NOT.
 *
 * One sentence, here rather than on a screen, so the run's page, the API and any list draw the same
 * words. It names the seal where the confirmation named one, because *which work was accepted* is
 * the half a confirmation can prove; it never says the work was checked, because nothing read it.
 */
export function confirmedNotChecked(confirmation: Confirmation, say: Say): string {
  const read = confirmation.read ?? null
  const names =
    read === null
      ? say('chk.says.confirmedNotChecked.noSeal')
      : sayWithValues(say, 'chk.says.confirmedNotChecked.seal', {
          seal: read.sealId ?? say('chk.says.confirmedNotChecked.noSealId'),
          hash: read.sealHash ?? say('chk.says.confirmedNotChecked.noHash'),
          tip: read.tip == null ? say('chk.says.confirmedNotChecked.noTip') : read.tip,
          worktree: read.worktree,
        })
  // The first sentence is the plain fact on its own; the word list holds it, under 'chk.says.confirmedNotChecked'.
  return say('chk.says.confirmedNotChecked') + say('chk.says.sentenceGap') + names
}

// ============================================================================ the check itself

/** What an inspector answered with. */
export type Verdict = 'released' | 'refused'

/**
 * Which chapter, precedent or invariant a refusal rests on. A refusal always names at least one. Criterion C21; the
 * invariant since decision OTB8vrTnnvhL.
 */
export interface WhatSaysSo {
  /** The chapter number of the code of law, or null. */
  chapter: number | null
  /** The record id of a precedent, or null. */
  precedent: string | null
  /** The number of one of the invariants USER.md lists, or null. */
  invariant: number | null
}

/**
 * WHAT A REFUSAL RESTS ON, IN WORDS, for every place that says it: the run's sentence, the worker's message and the
 * run's page. Each basis named is said, joined with "and"; a refusal naming none says so. `nameOf` gives an invariant's
 * name where the caller can read USER.md, which the page cannot.
 */
export function theBasisNamed(basis: WhatSaysSo, nameOf?: (invariant: number) => string | null): string {
  const name = basis.invariant === null ? null : (nameOf?.(basis.invariant) ?? null)
  const named = [
    basis.chapter === null ? null : `chapter ${String(basis.chapter)} of the office regulations`,
    basis.precedent === null ? null : `precedent ${basis.precedent}`,
    basis.invariant === null ? null : `invariant ${String(basis.invariant)} of USER.md${name === null ? '' : ` (${name})`}`,
  ].filter((one): one is string => one !== null)
  return named.length === 0 ? 'nothing it named' : named.join(' and ')
}

/**
 * What a refusal must carry, checked at the door so no refusal can be an opinion. What `says` takes is said in the words
 * of src/config/verdict-keys.mjs, the one list the door's shape and the check's prompt are held to.
 */
export const A_REFUSAL_NAMES =
  'A refusal names what is missing and what says so. Send `missing` with at least one thing, and `says` naming ' +
  `${whatSaysTakes()}. A refusal that names none of them is an opinion, and the rule it rests on is what makes it ` +
  'arguable.'

/** The one line the starter is told, and the whole of what it is told about the check. Criterion C20. */
export function checkedAndReleased(inspector: string): string {
  return `Checked and released by ${inspector}.`
}

/** What a standard release says was checked, in the message that releases the worker. */
export function whatAStandardReleaseChecked(standard: AStandardRelease): string {
  const checks =
    standard.checks.length === 0
      ? 'It ran no check of its own on the sealed tree.'
      : `Its own checks passed on the sealed tree: ${standard.checks.map((one) => one.name).join(', ')}.`
  return `a standard change of the kind ${standard.kind} (${A_STANDARD_KIND_SAYS[standard.kind]}). ${standard.why} ${checks} No inspector read it.`
}

/** The one line the starter is told of a standard change, in place of who checked it. */
export function releasedAsAStandardChange(): string {
  return 'Released as a standard change, with no inspector.'
}

/**
 * THE ONE LINE THAT SAYS A RELEASED RUN IS NOT OVER. Criterion C29.
 *
 * It goes to the supervisor beside the result. It is one short sentence on purpose: criterion C20
 * is measured in bytes, and everything else about the confirmation — who may make it, what it
 * writes, where the press is — belongs on the run's page rather than in a message.
 */
export function itClosesWhenYouConfirm(): string {
  return 'It closes when you confirm this report.'
}

/**
 * The one line the starter is told about a refusal. It does not carry the refusal. Criterion C21.
 * `group` is null when the refusal opened none, which only a refusal of the merge queue's check again does.
 */
export function aRefusalHappened(inspector: string, worker: string, group: string | null): string {
  return (
    `${inspector} refused to release ${worker}. What the refusal says is with ${worker}, not here. ` +
    (group === null ? NO_GROUP_FOR_A_CHECK_AGAIN : `A group is open about it: ${group}.`)
  )
}

/** What the group opened by a refusal is called. Criterion C26. */
export function theGroupForARefusal(worker: string): string {
  return `Refused release: ${worker}`
}

/** Why the group was opened, in the words the group carries. */
export function whyTheGroupWasOpened(inspector: string, worker: string): string {
  return (
    `${inspector} refused to release ${worker}; the refusal stands while it is talked out. ` +
    'A refusal opens a group and tells the worker and its supervisor. The refusal may touch a ' +
    'decision or a change elsewhere, which two agents do not settle in a few messages. If the ' +
    'supervisor cannot settle it, it goes up a level at a time until one can.'
  )
}

/** What an inspector that fixed what it found is told. Criterion C22. */
export function anInspectorThatFixedIt(records: readonly string[]): string {
  return (
    'This check is refused because the inspector changed the work it was checking. It changed ' +
    `${String(records.length)} record${records.length === 1 ? '' : 's'} the run it is checking wrote: ` +
    `${records.join(', ')}. An inspector that fixes what it found is no longer checking it, and its ` +
    'card says so: It builds nothing and starts nobody. Where a break is found, file a problem and ' +
    'link it to the chapter with `about`. Nothing was written.'
  )
}
