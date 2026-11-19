// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK CLAIMS: WHAT AN AGENT SAYS IT IS WORKING ON, AND WHAT HAPPENS WHEN TWO OF THEM OVERLAP.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A CLAIM IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M13 of design/messages/ACCEPTANCE.md: *An agent says what it is working on (a module,
 * files, records) with a lease that ends when its run ends. A second claim that overlaps opens a
 * group (M11). Claims are drawn on the record and on the dashboard.*
 *
 * From proposal `pg10HWny6J0j`: a claim names the folders or files an agent holds, and when two
 * claims conflict, the agents settle it through messages.
 *
 * ---------------------------------------------------------------------------------------
 * A MODULE IS A RECORD, SO A CLAIM NAMES TWO KINDS OF THING AND NOT THREE
 * ---------------------------------------------------------------------------------------
 *
 * M13 names a module, files and records. A module IS a record of kind `module`, so a third kind of
 * thing here would be two ways of naming one row, which is the defect CLAUDE.md names as this
 * repository's own: the same fact worked out in two places. A claim names a `record` or a `path`,
 * and a claim on a module is a claim on that module's record. The record page therefore draws claims
 * on a module without knowing that modules are special, and the sentence a reader gets says which
 * kind of record it is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS IN `shared`
 * ---------------------------------------------------------------------------------------
 *
 * The browser draws these words and the server stores them. A sentence written on both sides is the
 * same fact in two places. Nothing here opens a database and nothing here reads a file.
 */

import { pathCovers } from './paths.ts'
import { GROUP_NAME_MAX } from './groups.ts'
import { MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD } from './participants.ts'

// ============================================================================ what a claim names

/** The two kinds of thing a claim may name. A module is a record; see the header. */
export const CLAIMED_KINDS = ['record', 'path'] as const

export type ClaimedKind = (typeof CLAIMED_KINDS)[number]

export function isClaimedKind(value: unknown): value is ClaimedKind {
  return typeof value === 'string' && (CLAIMED_KINDS as readonly string[]).includes(value)
}

/** One thing an agent says it is working on. */
export interface ClaimedThing {
  what: ClaimedKind
  /** A record id, or a repository-relative path. A path naming a folder covers what is under it. */
  id: string
}

/** How many things one claim may name. */
export const CLAIMED_MAX = 40

/** What a reader sees for one kind of claimed thing. */
export function claimedKindWord(kind: ClaimedKind): string {
  if (kind === 'record') return 'record'
  if (kind === 'path') return 'file or folder'
  return `unknown kind of claimed thing: ${String(kind)}`
}

/** True when the two references name the same thing. */
export function sameThing(a: ClaimedThing, b: ClaimedThing): boolean {
  return a.what === b.what && a.id === b.id
}

/**
 * WHETHER TWO CLAIMED THINGS OVERLAP.
 *
 * Two records overlap when they are the same record, and nothing else: this asks what an agent
 * wrote down, and reading a link between two records as an overlap would be inventing a claim
 * nobody made.
 *
 * TWO PATHS OVERLAP WHEN ONE COVERS THE OTHER, which includes a folder covering what is under it —
 * `perception/calibration` and `perception/calibration/closeup.py` are the same work. `pathCovers` in
 * shared/paths.ts is the one place that decides it, so a claim and a module's own claims cannot come
 * to different answers about the same two paths. Its `unknown` answer is read as no overlap here and
 * that costs something: two patterns, or two paths in different repositories, are not compared, so a
 * conflict between them opens no group. Nothing is reported as an overlap that is not one.
 *
 * A RECORD NEVER OVERLAPS A PATH. Which code implements a record is a question the implementation
 * map answers, and answering it here would make a claim on a module quietly claim files nobody
 * wrote down.
 */
export function thingsOverlap(a: ClaimedThing, b: ClaimedThing): boolean {
  if (a.what !== b.what) return false
  if (a.what === 'record') return a.id === b.id
  const left = { asWritten: a.id, path: a.id }
  const right = { asWritten: b.id, path: b.id }
  return pathCovers(left, right) === 'yes' || pathCovers(right, left) === 'yes'
}

// ============================================================================ refusals

/** Why one claimed thing is refused, or null when it is usable. */
export function whyTheThingIsRefused(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'Each thing a claim names is an object saying which kind it is and which one, as {"what": "record", "id": "PtnsAZ3meHwk"}.'
  }
  const one = value as { what?: unknown; id?: unknown }
  if (!isClaimedKind(one.what)) {
    return 'A claim names a record or a file or folder. Say which, as {"what": "record", "id": "PtnsAZ3meHwk"} or {"what": "path", "id": "src/server/lib"}.'
  }
  if (typeof one.id !== 'string' || one.id.trim() === '') {
    return 'A claim needs the id of the record, or the path of the file or folder, it is about. An empty one names nothing.'
  }
  return null
}

/** Why a whole list of claimed things is refused, or null when it is usable. */
export function whyTheThingsAreRefused(value: unknown): string | null {
  if (!Array.isArray(value)) return 'What a claim is about is a list, even when there is one thing in it.'
  if (value.length === 0) {
    return 'A claim that names nothing says nothing. Name at least one record, file or folder you are working on.'
  }
  if (value.length > CLAIMED_MAX) {
    return `A claim names at most ${String(CLAIMED_MAX)} things and this one names ${String(value.length)}. A claim over more than that is a claim on a folder; name the folder.`
  }
  const seen = new Set<string>()
  for (const one of value) {
    const because = whyTheThingIsRefused(one)
    if (because !== null) return because
    const thing = one as ClaimedThing
    const key = [thing.what, thing.id].join(':')
    if (seen.has(key)) return `${thing.id} is named twice in this claim. Naming it twice claims it once.`
    seen.add(key)
  }
  return null
}

/** Said when the run a claim names is not one this project holds. */
export function noSuchRun(id: string): string {
  return (
    `No session record in this project has the id ${id}, so there is no run for this claim's lease to end with. ` +
    'A claim names the run that is doing the work, which is the session record filed when that run started.'
  )
}

/**
 * SAID WHEN A REGISTERED AGENT TRIES TO START WORK WITH NO WORK AREA. Criterion P93: no work starts before an area is registered.
 *
 * IT NAMES THE CARD THAT REQUIRES THE AREA, because only some cards do: a card whose work-area
 * grain is `nothing` requires none, and a secretary holding one may claim with no area. Two doors
 * once read that fact apart and contradicted each other — the claims door demanded an area the
 * work-area door refused a secretary (problem XivYfQN8RLQz) — so this sentence says which card it
 * is applying. The answer comes from `aRoleNeedsARegisteredWorkArea` in shared/roles.ts, and the
 * caller passes the role it read; this function names it and decides nothing.
 *
 * IT IS NOT THE FINISH GATE'S SENTENCE. That one refuses a run whose agent has no area while sealing
 * a submission, and problem o8rBHt9RtUUJ is it naming a work area when the missing thing was a
 * submission. This one is at the start, where the missing thing really is the area, so it names the
 * area and the door that registers one — and it shares no wording with the one that misled.
 */
export function noWorkAreaToStart(handle: string, role: string): string {
  return (
    `The agent "${handle}" has no registered work area, and the "${role}" card it holds is one whose rule ` +
    `requires one, so it may not start work. An agent registered in Mole Office registers the folders it will ` +
    `touch first, at POST /api/participants/agent/${handle}/work-area. Nothing was claimed.`
  )
}

/**
 * THE SAME REFUSAL FOR MOLE OFFICE'S OWN ROW. The row holds no card and is held to the rule of the card a row with no
 * card reads as, which the caller passes, so the refusal is the same; only the words differ. It names no door, because
 * the work-area door is not one the product's own row registers at.
 */
export function noWorkAreaForTheOfficesOwnRow(handle: string, role: string): string {
  return (
    `"${handle}" ${MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD} and no registered work area. A row with no card is held to ` +
    `the "${role}" card's rule, which requires a work area, so it may not start work. Nothing was claimed.`
  )
}

/** Said when the claim being renewed or released is not the caller's own. */
export const A_CLAIM_IS_THE_CLAIMANTS_OWN =
  'A claim is renewed and released by whoever made it. This one was made by somebody else, so nothing was ' +
  'written. A claim you did not make ends when its run does.'

/**
 * SAID WHEN THE SECRETARY REACHES FOR A CLAIM WHOSE RUN IS STILL RUNNING. Criterion F4.
 *
 * The secretary may end a claim whose run is not running — one waiting for a check, or one whose run is
 * already over — because nobody else can. A claim of a run that is still working stays the author's
 * alone: the author is there, and the secretary ending it would take work out of a live agent's hands.
 */
export const A_CLAIM_OF_A_RUNNING_RUN_IS_THE_AUTHORS_OWN =
  'The run that made this claim is still running, so only whoever made the claim may release it. A claim ' +
  'whose run has stopped or is waiting for a check may also be released by the secretary.'

/** Said when a claim that has already ended is renewed. */
export const THAT_CLAIM_HAS_ENDED =
  'That claim has ended, so there is nothing to renew. A lease ends when its run ends, and a run that has stopped ' +
  'cannot say it is still working. File a new claim from the run that is working now.'

// ============================================================================ the lease

/** The three ways a claim can stand right now. */
export const LEASE_STATES = ['live', 'released', 'the run ended'] as const

export type LeaseState = (typeof LEASE_STATES)[number]

/** What a reader sees for one lease state, and what the product says when they ask what it means. */
export interface LeaseWord {
  word: string
  sentence: string
}

export const LEASE: Readonly<Record<LeaseState, LeaseWord>> = {
  live: {
    word: 'Working on it',
    sentence: 'The run that made this claim is alive, so somebody is working on this now.',
  },
  released: {
    word: 'Finished',
    sentence: 'Whoever made this claim said they had finished with it.',
  },
  'the run ended': {
    word: 'The run ended',
    sentence:
      'The run that made this claim is over, so the claim is over with it. Nobody released it; it ended the way ' +
      'every lease here ends.',
  },
}

/** The reading for one stored lease state, which is what a screen draws. */
export function leaseWord(state: unknown): LeaseWord {
  if (typeof state === 'string' && (LEASE_STATES as readonly string[]).includes(state)) {
    return LEASE[state as LeaseState]
  }
  return {
    word: `unknown lease state: ${String(state)}`,
    sentence: `Nothing in Mole Office knows the lease state ${String(state)}, so how this claim stands cannot be said.`,
  }
}

/**
 * WHICH INPUT SAID THE RUN WAS STILL GOING, so a reader is never shown a strength the answer does
 * not have.
 *
 * `the ledger` is the strong one: a process was registered for this run and the machine says it is
 * alive. `the session record` is the weak one: nobody registered a process, so the only thing that
 * can be asked is what somebody wrote down, and a record left saying `running` by a run that died
 * would hold a claim open. That is a real weakness and it is said out loud rather than hidden behind
 * a green mark. Problem wNjQEfclwxjJ, USER.md invariants 2 and 5: an unreadable process is
 * neither confirmed alive nor confirmed gone. Its own input says why the claim stays held.
 */
export const LEASE_INPUTS = ['the ledger', 'the session record', 'a process that could not be checked'] as const

export type LeaseInput = (typeof LEASE_INPUTS)[number]

export function leaseInputSays(input: LeaseInput): string {
  if (input === 'the ledger') return 'A process registered for this run is alive on this machine.'
  if (input === 'a process that could not be checked') {
    return 'The office could not check a process registered for this run. It keeps the claim rather than end it on a guess.'
  }
  return 'Nothing was registered for this run, so this is what its own record says rather than what is true.'
}

/**
 * THE LONGER FORM, for a reader who asks what the line above means.
 *
 * IT IS THE SAME FACT AND NOT A SECOND ONE. `leaseInputSays` is what a screen draws on every claim,
 * so it has to be short enough to sit under five of them; this says the same thing with the reason
 * in it, and a screen puts it where a reader can ask for it. Neither can be true while the other is
 * false: both are chosen by the same word.
 */
export function leaseInputInFull(input: LeaseInput): string {
  if (input === 'the ledger') {
    return (
      'A process registered for this run is alive on this machine, which is the strongest answer there is: the ' +
      'machine was asked rather than the record.'
    )
  }
  if (input === 'a process that could not be checked') {
    return (
      'The office could not check a process registered for this run. ' +
      'It could not confirm that any registered process is running. It keeps the claim rather than end it on a guess.'
    )
  }
  return (
    'No process was registered for this run, so the only thing that could be asked is what the session record ' +
    'says about itself. A run that died without writing that down would still read as working.'
  )
}

// ============================================================================ what a reader gets

/** One work claim, as every screen and every caller reads it. */
export interface ClaimOnTheWire {
  id: string
  workspaceId: string
  /** Who is working on it, in the registries. */
  claimant: { kind: 'person' | 'agent'; id: string }
  /** The session record of the run whose life this lease follows. */
  run: string
  /** What is being worked on. */
  things: readonly ClaimedThing[]
  /** When it was filed, as a local wall-clock stamp. */
  openedAt: string
  /** When the run last said it was still working on this, or null because it never has. */
  renewedAt: string | null
  /** When it was released, or null because nobody released it. */
  releasedAt: string | null
  /** One plain sentence saying why it was released, or null. */
  releasedBecause: string | null
  /** How it stands now. */
  state: LeaseState
  /** Which input answered, or null when the claim is over and nothing had to be asked. */
  from: LeaseInput | null
}

/** Two live claims that name the same thing. */
export interface Overlap {
  /** The two claims, in the order their ids sort, so the pair reads the same whoever asks. */
  claims: readonly [ClaimOnTheWire, ClaimOnTheWire]
  /** The thing they both name. */
  thing: ClaimedThing
  /** The one spelling of this overlap, which is what stops a second group being opened for it. */
  key: string
  /** The group opened for it, or null because none has been. */
  groupId: string | null
}

/**
 * THE ONE SPELLING OF AN OVERLAP: the two participants and the thing they both named.
 *
 * IT IS NOT THE TWO CLAIM IDS. A claim ends with its run, so the same two agents colliding on the
 * same file tomorrow would be two new claims and would open a second group about the same argument.
 * The participants and the thing are what the argument is about, and they are the same tomorrow.
 *
 * Never drawn. It is a key, and the words a reader sees are the group's own name and the system line
 * inside it.
 */
export function overlapKey(
  a: { kind: string; id: string },
  b: { kind: string; id: string },
  thing: ClaimedThing,
): string {
  const two = [[a.kind, a.id].join(':'), [b.kind, b.id].join(':')].sort()
  return [...two, thing.what, thing.id].join('|')
}

// ============================================================================ the server's words about claims

/**
 * The server's sentences about work claims. A page draws its own words for claims from the word
 * lists (src/web/components/Claims.tsx), in the page's language.
 */
export const CLAIM_WORDS = {
  /** What the lease line says: how it stands, and which input answered. */
  leaseUntil: (word: string, says: string): string => `${word}. ${says}`,
  /** A claim naming a record the project does not hold any more. */
  recordIsGone: 'This claim names a record this project no longer holds.',
  /**
   * SAID TO A NEW CLAIMANT WHEN THE EARLIER CLAIM'S RUN IS NOT RUNNING. Criterion F3.
   *
   * A group is opened for two agents at work. A run that said it finished is waiting for a check and
   * is not at work, so a new claim on the same thing opens no group against it. The claimant is told
   * which claim and which run it met, so the answer is not an overlap that quietly vanished.
   */
  heldForACheck: (claim: string, run: string): string =>
    `No group was opened: the earlier claim ${claim} belongs to run ${run}, which said its work is ` +
    'finished and is waiting for a check rather than working. That claim still holds what it named.',
  /** How one claimed thing is drawn when it is a path. */
  aPath: (path: string): string => `the file or folder ${path}`,
} as const

// ============================================================================ naming a conflict's group

/**
 * WHAT A GROUP OPENED FOR A CONFLICT IS CALLED: the two claimants first, then what they both claimed.
 *
 * Problem `qpjjRnnfo-4i`. The name used to hold the thing alone — *Two claims on the tray clamp module*
 * — so three agents on one record opened three groups with one name between them, and the panel
 * listed three rows a reader could not tell apart. The overlap this group is opened for is a pair and
 * a thing; the name now says all three.
 *
 * THE TWO CLAIMANTS COME FIRST because they are what tells one of these groups from another, and a
 * name in the chat panel is drawn with an ellipsis when the row runs out of room. With the thing
 * first, three groups over one record would ellipsize to the same handful of words again.
 *
 * A HANDLE, NOT A DISPLAY NAME. A handle is unique in the registry, is short, and is what a person
 * types when they name an agent. Display names are neither unique nor short — one in this
 * installation is 98 characters — so a name built from those could not do the one job this name has.
 * The lines inside the group still say the display names in full.
 *
 * IT FITS IN A GROUP NAME. The two names keep what they need, up to all but a little of the room, and
 * share what there is when even that is not enough; the thing takes what is left. Anything cut ends
 * in an ellipsis, so a reader can see it was cut, and nothing is lost: the first line in the group
 * names the thing in full.
 */
export function conflictGroupName(first: string, second: string, thing: string): string {
  const room = GROUP_NAME_MAX - ' and '.length - ' on '.length
  const [a, b] = twoNamesInside(first, second, room - THE_THING_KEEPS)
  return `${a} and ${b} on ${asMuchAsFits(thing, room - a.length - b.length)}`
}

/** How much of the thing is kept in that name however long the two claimants' handles are. */
const THE_THING_KEEPS = 16

/** Two names inside one room: whichever fits keeps all of it, and what it leaves goes to the other. */
function twoNamesInside(first: string, second: string, room: number): [string, string] {
  if (first.length + second.length <= room) return [first, second]
  const half = Math.floor(room / 2)
  if (first.length <= half) return [first, asMuchAsFits(second, room - first.length)]
  if (second.length <= half) return [asMuchAsFits(first, room - second.length), second]
  return [asMuchAsFits(first, half), asMuchAsFits(second, room - half)]
}

/** As much of some words as fits, with an ellipsis where anything was cut. */
function asMuchAsFits(words: string, room: number): string {
  if (words.length <= room) return words
  if (room <= 1) return '…'
  return `${words.slice(0, room - 1).trimEnd()}…`
}
