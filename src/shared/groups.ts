// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { KNOWLEDGE_WORDS } from './words/en-wave-13u.ts'
import { readStoredWord, sayInEnglish } from './i18n.ts'
import { aUseInPercent, minute } from './logins-week.ts'
/**
 * A GROUP: A CONVERSATION WITH SEVERAL SUBSCRIBERS, AND THE LINES MOLE OFFICE WRITES INTO ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A GROUP IS
 * ---------------------------------------------------------------------------------------
 *
 * A group is several subscribers on one message pool, and a message one agent sends goes to
 * every member of it. A conflict opens a group and pulls the
 * administrator, the person, into it without anybody asking.
 *
 * So a group is a name, the participants in it, and nothing else. It holds no messages of its own: a
 * message addressed to a group is one message with one delivery row per member, exactly as a message
 * addressed to two people is. Criterion M11.
 *
 * ---------------------------------------------------------------------------------------
 * A SYSTEM LINE IS A MESSAGE WHOSE SENDER IS MOLE OFFICE, AND THAT IS THE WHOLE RULE
 * ---------------------------------------------------------------------------------------
 *
 * There is no flag on a message saying "this one is a system line". Mole Office is a participant
 * with its own registry row and its own picture (`moleOffice()` in shared/participants.ts), and a
 * message it sent is a system line because it sent it. One fact in one place: a stored flag could
 * disagree with the sender, and a reader would have no way to tell which half was lying.
 *
 * ---------------------------------------------------------------------------------------
 * A SYSTEM LINE ADDRESSES NOBODY
 * ---------------------------------------------------------------------------------------
 *
 * Every sentence below states what happened and speaks to no one. Section 7.5 of
 * design/messages/ACCEPTANCE.md names "whether Mole Office's own system lines may ever address a
 * person directly" as a question for the person rather than an agent's. It was filed as proposal
 * `gGUxEiMa2bgw`, and decision `c7lTCxLfgusJ` settled it: system
 * lines state facts only, drawn as small centred grey notices in the group. So these lines say what
 * happened and ask for nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS IN `shared`
 * ---------------------------------------------------------------------------------------
 *
 * The browser draws these words and the server writes them. A sentence written on both sides is the
 * same fact in two places, free to disagree. The browser may not import from `src/server`, so the
 * words live here and both sides import them.
 */

import { isMoleOffice, participantWord, type ParticipantKind, type ParticipantRef } from './participants.ts'
import { sameParticipant } from './messages.ts'
import { THE_SWEEP_BODY, theDeadLetterSweepInWords, theWordsOfTheFold, type WhatTheFoldSays } from './dead-letter-lines.ts'
import {
  theBackAsTheSecretarySetItLine,
  theBackAsYouAskedLine,
  theBranchedLine,
  theCardLine,
  theProviderAddedLine,
  theProviderChangedLine,
  theRestartLine,
  type AChangedProviderLinesValues,
  type AProviderLinesValues,
} from './office-lines.ts'
import { PLAN_QUESTIONS, PLAN_QUESTION_KEYS } from './planning-flow.ts'
import { MEMORY_FOLDER, OPEN_ITEMS_WORTH_A_LOOK } from './residents.ts'

// ============================================================================ what a group is

/**
 * How long a group's name may be. Drawn in a list beside a picture, like a participant's name.
 *
 * IT WAS 80 UNTIL 4 SEPTEMBER 2026, and 80 is too short for the name a conflict opens a group with.
 * That name has to hold both claimants and the thing they both claimed, or three groups over one
 * record read alike — problem `qpjjRnnfo-4i`. Two handles and a record's title come to about 85
 * characters in the ordinary case, so at 80 the title was always cut, and a title long enough to
 * take the whole name past 80 made filing the second claim fail outright with the name refused.
 * Nothing else pushed at the old number, and a longer name costs a list row nothing: the chat panel
 * draws a name with an ellipsis when it runs out of room. `conflictGroupName` in shared/claims.ts
 * keeps what it builds inside this.
 */
export const GROUP_NAME_MAX = 120

/** How long the sentence saying why a group was opened may be. */
export const GROUP_BECAUSE_MAX = 400

/**
 * The most members one group may hold.
 *
 * The same number as `RECIPIENT_MAX` in shared/messages.ts, and for the same reason: one message to
 * a group writes one delivery row per member, so a group larger than the recipient limit would be a
 * way round it. It is declared separately rather than imported because the two are different
 * questions that happen to have the same answer today, and a change to one is not a change to the
 * other.
 */
export const GROUP_MEMBER_MAX = 20

/** One member of a group, as every reader gets it. */
export interface GroupMemberOnTheWire {
  who: ParticipantRef
  /** When they joined, as a local wall-clock stamp. */
  joinedAt: string
  /** One plain sentence saying why they were added. */
  joinedBecause: string
}

/** One group, as every screen and every caller reads it. */
export interface GroupOnTheWire {
  id: string
  workspaceId: string
  /** The name a reader sees. */
  name: string
  /**
   * THE MARK THAT NAMES ONE PARTICULAR GROUP, or null for a group somebody opened by hand.
   *
   * It is the stored `about` column, handed on so a reader can tell one standing group from the
   * ordinary ones without matching on a name a person can retype. `SECRETARIAT_GROUP_KEY` below is
   * the one group it names today.
   */
  about: string | null
  /** Who opened it. */
  openedBy: ParticipantRef
  /** One plain sentence saying why it was opened. */
  openedBecause: string
  /** When it was opened, as a local wall-clock stamp. */
  openedAt: string
  /** Everybody in it now, oldest join first. Somebody who has left is not here. */
  members: readonly GroupMemberOnTheWire[]
}

/**
 * THE MARK ON THE OFFICE'S OWN STANDING GROUP, the one holding the owner and every secretary.
 *
 * It is the value of `groups.about` on that row, and it is what makes "there is one Secretariat
 * group and never two" a fact of the database's unique index rather than a check somebody
 * remembers. It is declared here, in `shared`, because the browser reads the mark off a group row
 * and the server writes it: two spellings of one key is how a screen stops finding the group it is
 * supposed to pin.
 */
export const SECRETARIAT_GROUP_KEY = 'secretariat'

// ============================================================================ the timeline of a group

/** What the timeline reads off one message: enough to place it in time and to rank it. */
export interface AMessageInAGroupsTimeline {
  id: string
  /** When it was sent, the local wall-clock stamp every message carries. */
  sentAt: string
  /** Who wrote it. Null because nobody wrote it. */
  sentBy: ParticipantRef | null
}

/**
 * ONE THING IN A GROUP'S TIMELINE: a message somebody wrote, one of the office's own lines, or a
 * member joining.
 *
 * A JOIN IS NOT A MESSAGE. It is drawn from the membership row's own `joined_at` and
 * `joined_because`, so it has no message id and no sender; the kind is what tells it apart.
 */
export type AnEntryOnAGroupsTimeline<M extends AMessageInAGroupsTimeline> =
  | { kind: 'officeLine'; at: string; message: M }
  | { kind: 'join'; at: string; member: GroupMemberOnTheWire }
  | { kind: 'message'; at: string; message: M }

/**
 * A GROUP'S MESSAGES AND ITS JOINS AS ONE TIMELINE, IN THE ORDER THEY HAPPENED.
 *
 * The person's words of 21 September 2026 said the join notices should read like the office's own short
 * system lines, and the amendment of 23 September 2026 puts them in the conversation at their time
 * among the messages rather than in a block above it. This is the one place that order is worked
 * out, so the page cannot come to a second reading of it.
 *
 * `sentAt` and `joinedAt` share one text format (YYYY-MM-DD HH:MM:SS), so a text comparison is a
 * time comparison. Within one second the office's own lines come first, then joins, then messages:
 * the line saying what happened opens the second, and a join is something that happened rather
 * than something somebody said. The sort is stable, so entries that tie on both keep the order
 * they came in.
 */
export function theTimelineOfAGroup<M extends AMessageInAGroupsTimeline>(
  messages: readonly M[],
  members: readonly GroupMemberOnTheWire[],
): AnEntryOnAGroupsTimeline<M>[] {
  const entries: AnEntryOnAGroupsTimeline<M>[] = []
  for (const message of messages) {
    entries.push(
      message.sentBy !== null && isMoleOffice(message.sentBy)
        ? { kind: 'officeLine', at: message.sentAt, message }
        : { kind: 'message', at: message.sentAt, message },
    )
  }
  for (const member of members) entries.push({ kind: 'join', at: member.joinedAt, member })
  return entries.sort((one, other) => {
    if (one.at !== other.at) return one.at < other.at ? -1 : 1
    return theRankOf(one.kind) - theRankOf(other.kind)
  })
}

/** The order two things in one second are drawn in: office line, join, then message. */
function theRankOf(kind: AnEntryOnAGroupsTimeline<AMessageInAGroupsTimeline>['kind']): number {
  if (kind === 'officeLine') return 0
  if (kind === 'join') return 1
  return 2
}

// ============================================================================ who a message @s

/**
 * A GROUP MEMBER AS THE @ READING NEEDS THEM: the reference, and the two words that name them.
 *
 * A message may @ a member by their HANDLE — the short address a machine writes — or by the NAME
 * the chat draws, which is what a person types. Both are carried here, and the reading matches
 * either. The two come from the registry, so a message read by the server and the same message
 * drawn by the browser cannot come to different answers about who was addressed.
 */
export interface Mentionable {
  who: ParticipantRef
  /** The short address a machine writes, like `builder`. */
  handle: string
  /** The name the chat draws, like `Builder`. */
  name: string
}

/**
 * WHAT ONE MESSAGE'S WORDS @.
 *
 * `who` holds the members named by handle or by the name the chat draws, in the order the @s
 * appear and with no member twice. `everyone` is true when the message says @所有人 or @all, which
 * addresses every member on purpose.
 *
 * AN @ THAT MATCHES NOBODY IS WORDS. A message that @s nobody has an empty `who` and a false
 * `everyone`, which is how a group message that carries no address at all is told from one that
 * carries an address nobody holds.
 */
export interface Mentions {
  who: readonly ParticipantRef[]
  everyone: boolean
}

/** The words that @ every member of a group, whichever language the message is written in. */
export const EVERYONE_MENTION_WORDS = ['所有人', 'all'] as const

const A_MENTION_MARK = '@'

/**
 * WHICH CHARACTERS MAY FOLLOW A NAME WITHOUT ENDING IT.
 *
 * An @ addresses a word, so the letters of the word run on. Without this, `@bob` inside
 * `@bobby` would name Bob and `@ann` inside `@anna` would name Ann. A hyphen and an underscore
 * are in because a handle may hold them; the CJK range is in because a name the chat draws may.
 */
const A_NAME_CHARACTER = /[A-Za-z0-9_\u3400-\u9fff-]/u

function isANameCharacter(one: string | undefined): boolean {
  return one !== undefined && A_NAME_CHARACTER.test(one)
}

/** Every `@` that begins a word: the first character of the message, or one after a space. */
function theMentionMarksIn(body: string): number[] {
  const out: number[] = []
  for (let at = 0; at < body.length; at++) {
    if (body[at] !== A_MENTION_MARK) continue
    if (at > 0 && !/\s/u.test(body[at - 1] ?? '')) continue
    out.push(at)
  }
  return out
}

/**
 * WHO ONE MESSAGE @s, by the one reading the server and the page both use.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHY IT IS THIS RULE
 * ---------------------------------------------------------------------------------------
 *
 * An @ addresses a word that starts right after a space or at the start of the line, matched
 * against the group's members by handle and by the name the chat draws, without regard to case. An
 * @ that matches nobody is words, not an address. `@所有人` and `@all` are reserved: they address
 * every member and never a member whose handle happens to be `all`.
 *
 * THE LONGEST NAME WINS, so a member called `Ann` and a member called `Anna` are told apart by
 * `@Anna`. Matching stops at the first character that could not be part of a name, so `@bob,`
 * and `@Ann.` still address their member.
 */
export function whoAMessageMentions(body: string, members: readonly Mentionable[]): Mentions {
  const who: ParticipantRef[] = []
  let everyone = false
  const lower = body.toLowerCase()
  for (const at of theMentionMarksIn(body)) {
    const after = at + 1
    const rest = lower.slice(after)
    let saidEveryone = false
    for (const word of EVERYONE_MENTION_WORDS) {
      const wanted = word.toLowerCase()
      if (!rest.startsWith(wanted)) continue
      if (isANameCharacter(lower[after + wanted.length])) continue
      saidEveryone = true
      break
    }
    if (saidEveryone) {
      everyone = true
      continue
    }
    let best: { length: number; who: ParticipantRef } | null = null
    for (const member of members) {
      for (const candidate of [member.handle, member.name]) {
        if (candidate === '') continue
        const wanted = candidate.toLowerCase()
        if (!rest.startsWith(wanted)) continue
        if (isANameCharacter(lower[after + wanted.length])) continue
        if (best === null || wanted.length > best.length) best = { length: wanted.length, who: member.who }
      }
    }
    if (best !== null && !who.some((one) => sameParticipant(one, best.who))) who.push(best.who)
  }
  return { who, everyone }
}

// ============================================================================ refusals

/** Why a group name is refused, or null when it is usable. */
export function whyGroupNameIsRefused(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim() === '') {
    return 'A group needs a name: the words a reader sees in the list of conversations, like "The tray clamp module".'
  }
  if (name.length > GROUP_NAME_MAX) {
    return `A group name is at most ${String(GROUP_NAME_MAX)} characters long, and this one is ${String(name.length)}.`
  }
  return null
}

/** Why the sentence saying why something happened is refused, or null when it is usable. */
export function whyTheReasonIsRefused(because: unknown, what: string): string | null {
  if (typeof because !== 'string' || because.trim() === '') {
    return `Say why ${what}, in one plain sentence. A group nobody wrote a reason for is one nobody can make sense of later.`
  }
  if (because.length > GROUP_BECAUSE_MAX) {
    return `That sentence is at most ${String(GROUP_BECAUSE_MAX)} characters long, and this one is ${String(because.length)}.`
  }
  return null
}

/** Said when a message names a group this project does not hold. */
export function noSuchGroup(id: string): string {
  return (
    `No group in this project has the id ${id}, so a message addressed to it would reach nobody. ` +
    'GET /api/groups lists every group in this project, with the id of each.'
  )
}

/**
 * Said when a message is addressed to a group nobody is in.
 *
 * A GROUP CAN BE EMPTY, AND SENDING TO ONE IS REFUSED RATHER THAN STORED. Everybody may leave a
 * group, so an empty one is a real state; a message into it would write no delivery rows and reach
 * nobody, and a message that reached nobody with a tick beside it is the first rule broken.
 */
export const NOBODY_IS_IN_THAT_GROUP =
  'Nobody is in that group, so this message would reach nobody. Add a member first, with ' +
  'POST /api/groups/<the group>/members.'

/** Said when somebody who is not in a group writes into it. */
export const YOU_ARE_NOT_IN_THAT_GROUP =
  'A message to a group comes from somebody in it. Whoever is writing this is not a member, so the message was ' +
  'not written. Join the group first, or write to its members by name.'

/** Said when an agent tries to take a person out of a group. */
export const AN_AGENT_MAY_NOT_REMOVE_A_PERSON =
  'An agent may not take a person out of a group. A person leaves when they choose to, and a conflict between two ' +
  'agents is exactly the moment a person must not be removable by one of them.'

/** Said when somebody tries to remove another agent. */
export const AN_AGENT_MAY_ONLY_REMOVE_ITSELF =
  'An agent may leave a group and may take no one else out of one. Whoever is being removed here is not the agent ' +
  'asking, so nothing was written.'

/** Said when the participant being removed is not in the group. */
export function notInThatGroup(id: string): string {
  return `${id} is not in that group, so there is nothing to take them out of. Nothing was written.`
}

/** Said when somebody is added to a group they are already in. */
export function alreadyInThatGroup(id: string): string {
  return `${id} is already in that group. Nothing was written, and nobody was added twice.`
}

/** Said when a group is given more members than one message may be delivered to. */
export function tooManyMembers(count: number): string {
  return (
    `A group holds at most ${String(GROUP_MEMBER_MAX)} members and this one already holds ${String(count)}. ` +
    'One message to a group is one delivery row per member, so a bigger group would be a way round the limit on ' +
    'how many people one message may name.'
  )
}

/** Said when a message to a group is addressed to individual participants as well. */
export const A_MESSAGE_GOES_TO_A_GROUP_OR_TO_PEOPLE =
  'A message is addressed to a group or to participants by name, not to both. Who a message to a group reaches is ' +
  'everybody in that group at the moment it was sent, and naming somebody as well would make two answers to one ' +
  'question.'

// ============================================================================ the system lines

/**
 * ONE LINE MOLE OFFICE WRITES: THE FEW WORDS IT DRAWS, AND THE WHOLE SENTENCE BEHIND THEM.
 *
 * Criterion M34: a system line is a few words, like "Agent run ended", and with the time above it
 * what happened is plain at a glance.
 *
 * `line` IS WHAT THE BLOCK SAYS — a few words, never a sentence, because the block is a mark in a
 * conversation and not a paragraph in it. `said` is the whole sentence where there is more to say,
 * and it is the block's hover text; it is null where the few words are the whole of it, and null
 * means there is nothing more rather than that nobody wrote it.
 *
 * THE STORED BODY IS `line` AND THE STORED `saidInFull` IS `said`. Both go on the message when it is
 * written, so a line written last week still carries the sentence it was written with — deriving the
 * sentence from the short words later would need a parser, and the sentence has names and numbers in
 * it that the short words do not.
 */
export interface SystemLine {
  /** The few words the block draws. */
  line: string
  /** The whole sentence, as hover text, or null because the few words are all of it. */
  said: string | null
}

/** The short facts of an ended run's leftovers, stored with its office line for translation. */
export interface ResourcesLeftOpen {
  agent: string
  run: string
  resources: { type: string; key: string }[]
  more: number
}

export function theResourcesLeftOpenLine(said: ResourcesLeftOpen): string {
  const listed = said.resources.map((one) => `${one.type} ${one.key}`).join(', ')
  return `${said.agent}'s run ${said.run} ended with open resources: ${listed}${said.more > 0 ? `, and ${said.more} more` : ''}.`
}

/**
 * WHAT A SEAL HOLDS, AS ITS RUN'S STARTER IS TOLD IT. Each part is null where the seal holds no such
 * part: `git` on a records or files seal, `files` on every seal but a files seal, `records` on a git or
 * files seal. `sealFinishedRun` in src/server/lib/sealed-tip.ts fills it from the seal it has just written.
 */
export interface TheSealAStarterIsTold {
  run: string
  /** The handle of the agent the run served. */
  agent: string
  seal: string
  kind: 'git' | 'records' | 'mixed' | 'files'
  git: { commit: string; forkBase: string; files: readonly string[] } | null
  files: { root: string; files: readonly string[] } | null
  records: readonly string[] | null
  /**
   * TRUE WHEN THE STARTER HOLDS THE SECRETARY CARD, so the files are said as a count and the folders
   * most of them are in, with the door that lists them all. This follows a decision to be concise but traceable: the
   * whole list, said twice, was about 12 KB for 127 files, and a secretary queues from the tip and the check, not from
   * the list. Absent on a line written before wave 13y round 10.
   */
  toASecretary?: boolean
  /**
   * THE RUN'S OWN MESSAGE TO THE STARTER, when one was sent before the seal, so the notice is one line
   * with a link and does not say the same thing twice. Null or absent when the run sent none.
   */
  theRunsOwnMessage?: string | null
}

/** A list in a sentence: how many, then each one, or "none". */
function aListInWords(what: string, items: readonly string[]): string {
  return items.length === 0 ? `${what}: none.` : `${what} (${String(items.length)}): ${items.join(', ')}.`
}

/** The files of a seal that are not under src/ or tests/, said as a list or as "none". */
function theFilesOutsideSrcAndTests(files: readonly string[]): string {
  return aListInWords('Files outside src/ and tests/', files.filter((path) => !path.startsWith('src/') && !path.startsWith('tests/')))
}

/**
 * THE FOLDERS MOST OF A SEAL'S FILES ARE IN: each file's folder to two levels, the three with the most
 * files, and how many are left. A file at the top of the repository is in "the top folder".
 */
function theFoldersMostFilesAreIn(files: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const path of files) {
    const folders = path.split('/').slice(0, -1)
    const folder = folders.length === 0 ? 'the top folder' : folders.slice(0, 2).join('/') + '/'
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const named = ranked.slice(0, 3).map(([folder, count]) => `${folder} (${String(count)})`)
  const rest = ranked.slice(3)
  const left = rest.reduce((sum, [, count]) => sum + count, 0)
  const tail =
    rest.length === 0 ? '' : `, and ${String(left)} in ${String(rest.length)} other folder${rest.length === 1 ? '' : 's'}`
  return `${named.join(', ')}${tail}`
}

/** A seal's files as a count, the folders most are in, and the door that lists every one. */
function theFilesInShort(what: string, files: readonly string[], seal: string): string {
  if (files.length === 0) return `${what}: none.`
  return `${what}: ${String(files.length)}, in ${theFoldersMostFilesAreIn(files)}. Every one: GET /api/records/${seal}.`
}

/** Each kind of seal, as the message names it. */
const A_SEAL_OF_ITS_KIND: Record<TheSealAStarterIsTold['kind'], string> = {
  git: 'a git seal',
  records: 'a records seal',
  mixed: 'a mixed seal, of git and records',
  files: 'a files seal',
}

/** The whole sentence behind `SYSTEM_LINES.aRunWasSealed`. */
function theSealInWords(sealed: TheSealAStarterIsTold): string {
  const whatItIs = A_SEAL_OF_ITS_KIND[sealed.kind]
  // THE RUN'S OWN MESSAGE ALREADY TOLD THE STARTER, so this is one line with the link. A decision asks for one notice
  // per fact.
  if (typeof sealed.theRunsOwnMessage === 'string') {
    const tip = sealed.git === null ? '' : ` at tip ${sealed.git.commit}`
    return (
      `Run ${sealed.run} of ${sealed.agent} was sealed as seal ${sealed.seal}, ${whatItIs}${tip}. Its own message ` +
      `${sealed.theRunsOwnMessage} was sent to you before the seal. What the seal holds: GET /api/records/${sealed.seal}.`
    )
  }
  const short = sealed.toASecretary === true
  const opening = `Run ${sealed.run} of ${sealed.agent} was sealed as seal ${sealed.seal}, ${whatItIs}.`
  const parts: string[] = [opening]
  if (sealed.git !== null) {
    parts.push(`Tip: ${sealed.git.commit}.`, `Fork base: ${sealed.git.forkBase}.`)
    if (short) parts.push(theFilesInShort('Files', sealed.git.files, sealed.seal))
    else parts.push(aListInWords('Files', sealed.git.files), theFilesOutsideSrcAndTests(sealed.git.files))
  } else if (sealed.files !== null) {
    parts.push('It has no tip and no fork base, because a files seal is read from a folder and not from git.')
    if (short) parts.push(theFilesInShort(`Files, to land in ${sealed.files.root}`, sealed.files.files, sealed.seal))
    else parts.push(aListInWords(`Files, to land in ${sealed.files.root}`, sealed.files.files), theFilesOutsideSrcAndTests(sealed.files.files))
  } else {
    parts.push('It has no tip, no fork base and no files, because a records seal names record revisions and no commit.')
  }
  if (sealed.records !== null) parts.push(aListInWords('Records', sealed.records))
  return parts.join(' ')
}

/** One name and how many letters it stands for, in a dead-letter sweep's sentence. */
export interface ANameAndACount {
  name: string
  count: number
}

/**
 * WHY NOBODY WAS SENT A SWEEP'S LINE, as facts and not as a sentence, so a page can say it in its own
 * language. `nobody named` carries the reading's own reason (the same four reasons the Settings panel
 * says); `member` names the secretary who is named but is not in the Secretariat group.
 */
export type WhyTheSweepLineWentToNobody =
  | { no: 'nobody named'; because: 'nobody chose' | 'not registered' | 'retired' | 'no act'; storedName: string; act: string }
  | { no: 'member'; name: string }

/**
 * WHAT ONE DEAD-LETTER SWEEP DID, as its one line says it. Problem 0WUuvB0IhRfb. Every name is an
 * agent's handle, or "the person". `sweepDeadLetters` in src/server/lib/deadletters.ts fills it, and
 * stores it on the line as `deadLetterSweep.said`, so a page draws the sentence in its own language.
 */
export interface TheDeadLetterSweepSaid {
  /** Office notices to retired agents, archived, by addressee. */
  archived: readonly ANameAndACount[]
  /** Agents' letters to retired agents, given to the first starter up the chain who could be reached, by that starter. */
  routed: readonly ANameAndACount[]
  /**
   * Agents' letters to retired agents that went to their receiver in one message per receiver, by that receiver,
   * or absent on a line written before the sweep sent one message per receiver. Problem wN3CEhHxRKO3.
   */
  summarised?: readonly ANameAndACount[]
  /** Agents' letters whose first reachable starter is their own sender, so no copy was made. */
  keptBySender: number
  /** Letters given to the secretary named to take the dead letters, or null because none were. */
  givenToTheSecretary: { name: string; fromAgents: number; fromThePerson: number } | null
  /** Letters left waiting because no secretary is named. */
  waiting: { fromThePerson: number; fromAgents: number }
  /**
   * The threshold's own sentence and the addressees newly named for a claim, when this sweep crossed
   * the threshold, or null because it did not. `letters` is the count the sentence says, so a page can
   * say it in its own language; without it the sentence is drawn as it was stored.
   */
  broadcast: { countSentence: string; letters?: number; addressees: readonly ANameAndACount[] } | null
  /**
   * Who the line is delivered to: one secretary's name, or the sentence saying why nobody. `why` is the
   * same reason as facts, so a page can say it in its own language; without it the sentence is drawn as
   * it was stored.
   */
  deliveredTo: { name: string } | { nobodyBecause: string; why?: WhyTheSweepLineWentToNobody }
}

/**
 * THE FEW WORDS THAT OPEN THE LINE SAYING AN OVERLAP HAS ENDED.
 *
 * ONE SPELLING, read by the writer that puts the line in a group and by whoever asks whether it is
 * already there, so the marker and the sentence it marks cannot drift apart. It is a prefix and not
 * the whole line because the reason follows it.
 */
export const THE_OVERLAP_ENDED_PREFIX = 'Overlap ended'

/**
 * THE WORDS A CHECKLIST NOTICE NAMES, ON ONE LINE AND CUT AT 40 CHARACTERS.
 *
 * Two decisions ask for one short notice that says what happened to what.
 * The item or the checklist is the thing, and the whole of it is not wanted. Runs of white space become one space and
 * the ends are trimmed, so a line break cannot break the line. A cut keeps the first 39 characters and adds an
 * ellipsis, so a cut one is exactly 40. `Array.from` counts characters, so one outside the basic plane is never split.
 */
function theWordsTheNoticeNames(words: string): string {
  const oneLine = words.replace(/\s+/g, ' ').trim()
  const characters = Array.from(oneLine)
  return characters.length <= 40 ? oneLine : `${characters.slice(0, 39).join('')}…`
}

/**
 * EVERY LINE MOLE OFFICE ITSELF WRITES, WORD FOR WORD.
 *
 * Each states what happened and addresses nobody, for the reason at the top of this file. Each is
 * written once here rather than at the place that sends it, so the same event cannot get two
 * wordings on two screens.
 *
 * EACH IS NOW A FEW WORDS PLUS A SENTENCE, criterion M34. What each used to say in full is the
 * `said` half, unchanged where it was already right; what a reader sees is the `line` half.
 *
 * EACH LINE CARRIES ITS KIND, and its kind is its name here. `SYSTEM_LINES`
 * below adds it, so a line and its kind cannot get two names. The server's table of notices
 * (src/server/lib/notices.ts) says for each kind whether it wakes its reader.
 */
/** A count of more doors in words: "1 more door", "12 more doors". */
function someMoreDoors(count: number): string {
  return count === 1 ? '1 more door' : `${String(count)} more doors`
}

/** A number of doors before the words about them, which say "does" of one door and "do" of more. */
function someDoors(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`
}

/** A name from the card's list, as it reads inside a sentence: "Appointing a secretary" becomes "appointing a secretary". */
function aNameInASentence(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1)
}

const THE_LINES = {
  stableUpgradeNotice: (text: string): SystemLine => ({ line: text, said: null }),
  /** Written into a group the moment it is opened. */
  groupOpened: (name: string, because: string): SystemLine => ({
    line: 'Group opened',
    said: `This group was opened and named "${name}". ${because}`,
  }),
  /** Written into a group when somebody joins it. The person's own example of the shape: "<name> joined the group". */
  memberAdded: (who: string, because: string): SystemLine => ({
    line: `${who} joined the group`,
    said: `${who} was added to this group. ${because}`,
  }),
  /** Written into a group when somebody leaves it. */
  memberLeft: (who: string): SystemLine => ({ line: `${who} left the group`, said: null }),
  /**
   * WRITTEN INTO A GROUP WHOSE OVERLAP HAS ENDED. Criterion M13, problem DrX8P0fYGmx8.
   *
   * A group opened for an overlap has no closed state and no closed column: what tells a reader it
   * is over is this line, written the moment the last of the two claims ends. The reason is in the
   * line itself, because `takeOutAndSayWhy` writes a line whose `said` is null and so cannot carry
   * one, and because the notices this branch's batch now write are one line each with no hover
   * sentence. `THE_OVERLAP_ENDED_PREFIX` below is what says whether this line is already in a
   * group, so the two claims ending at different moments do not write it twice.
   */
  theOverlapEnded: (because: string): SystemLine => ({ line: `${THE_OVERLAP_ENDED_PREFIX}: ${because}`, said: null }),
  /**
   * WRITTEN INTO THE GROUP A CONFLICT OPENS. It names the thing both claims cover and both claims.
   *
   * ONE LINE AND NOTHING MORE, on the person's words of 14 September 2026. What the old hover sentence added
   * to the line — who claimed it and when — is on each member's own row, where the members panel
   * draws it; keeping it here as well was one fact written twice.
   */
  claimsInConflict: (thing: string, first: string, second: string): SystemLine => ({
    line: `Overlap on ${thing}: ${first}, ${second}`,
    said: null,
  }),
  /**
   * WRITTEN INTO THE GROUP TWO OVERLAPPING WORK AREAS OPEN. Criterion P95.
   *
   * ONE LINE NAMING THE PATH AND BOTH AGENTS. The reassurance that nothing is refused is not lost:
   * it is the sentence `theWorkAreaOverlapSays` draws on both citizen pages, which is where P95 puts
   * it, and this line says only what happened.
   */
  workAreasInConflict: (thing: string, first: string, second: string): SystemLine => ({
    line: `Overlap on ${thing}: ${first}, ${second}`,
    said: null,
  }),
  /** The path and both agents whose running territories overlap. */
  territoriesInConflict: (thing: string, first: string, second: string): SystemLine => ({
    line: sayInEnglish('territory.overlapLine', { path: thing, first, second }),
    said: null,
  }),
  /**
   * THE ONE LINE A DEAD-LETTER SWEEP WRITES INTO THE SECRETARIAT GROUP. Problem 0WUuvB0IhRfb.
   *
   * ONE LINE PER SWEEP, AND NEVER ONE PER ADDRESSEE. The person's words of 16 September 2026 at 16:40
   * put an office-wide notice in the Secretariat group, said there once. Until 2 October 2026 a sweep
   * wrote a line naming the count and one more line per addressee, and every line woke every
   * secretary: 230 lines and 1,114 agent deliveries. Now the few words are the same every time, and the
   * full sentence says what this sweep did: how many letters it archived, routed, gave to the
   * secretary named to take the dead letters, and left waiting, for whom, and who the line is
   * delivered to. `theDeadLetterSweepInWords` in shared/dead-letter-lines.ts builds that sentence.
   */
  deadLetterSweep: (said: TheDeadLetterSweepSaid): SystemLine => ({
    line: THE_SWEEP_BODY,
    said: theDeadLetterSweepInWords(said, sayInEnglish),
  }),
  /**
   * WRITTEN INTO A GROUP WHOSE AGENTS HAVE GONE AS FAR AS THEY MAY WITHOUT A PERSON.
   *
   * Problem `jN0TdeawNlZZ`: two agents in a group answered each other with nobody writing one, and
   * every hop of that is a model call. The worker stops starting runs for that conversation, and
   * this line says so in the group, where the people in it are looking.
   *
   * IT NAMES NO NUMBER. The delivery row on each held message says how many were written and how many
   * are allowed; a count here as well would be a second copy of that, and the two would disagree the
   * moment a message arrived while a run was still going — measured on 4 September 2026, where the
   * row read four and the limit was three. Fixed words are also what lets
   * `tellTheGroupTheAgentsAreWaiting` in lib/worker.ts see whether the group has already been told,
   * by looking for this line rather than by storing a flag that could disagree with it.
   */
  /**
   * WRITTEN AT THE HEAD OF A CONVERSATION OPENED BECAUSE ANOTHER AGENT COULD NOT BE REACHED.
   *
   * Criterion M80: the conversation is branched into a new chat with a new agent, and the earlier
   * agent can still connect back. The line is what makes the new conversation readable as a branch rather than as a
   * conversation with an agent whose name looks oddly like another one.
   */
  // THE WORDS ARE IN THE WORD LISTS (shared/office-lines.ts), so a page draws a stored line in its own language. The
  // sentence names the old agent, so the press writes it with `theNewConversationCameFrom` in shared/messages.ts.
  get branchedFromAnother(): SystemLine {
    return { line: theBranchedLine(sayInEnglish, '', '').line, said: null }
  },
  agentsAreWaitingForAPerson: {
    line: 'Waiting for a person',
    said:
      'The agents in this group have said as much as they may without a person. Nothing more is started here until ' +
      'a person writes something. Every message is still here to read.',
  } satisfies SystemLine as SystemLine,
  /**
   * WRITTEN WHEN THE CAP ON WHAT AGENTS MAY SAY STOPS A RUN FOR A MESSAGE. Criteria M82 and M128.
   *
   * The notice is about a conversation, so it is a system line in that conversation, and it names the
   * message it is about so a reader can open the exact thing that is waiting. The few words are
   * deliberately short: on a phone this line folds to one line, and a paragraph is what M128 removes.
   * `aboutMessage` on the record is the id in a form a reader follows, and the link beside it is
   * written with `createLink`.
   */
  /** By item 3 of a decision, only the ended agent, run, and resource types and keys. */
  resourcesLeftOpen: (said: ResourcesLeftOpen): SystemLine => ({ line: theResourcesLeftOpenLine(said), said: null }),
  /**
   * WRITTEN TO THE AGENT A PARENT SESSION ANSWERS AS, WHEN A SESSION IT STARTED FINISHES. Problem c3p75p8aALd2: by item
   * 5 of a decision, the office wakes the parent, in every runtime, once for each finished
   * child. The line names the child, because the parent may have started several.
   */
  aChildSessionFinished: (childId: string, childTitle: string): SystemLine => ({
    line: `Your session "${childTitle}" has finished`,
    said:
      `The session "${childTitle}" (${childId}), which names your session as its parent, says it has finished. ` +
      `Read what it did at GET /api/records/${childId} before you go on.`,
  }),
  /**
   * WRITTEN TO THE STARTER OF A RUN WHOSE CHECK WAS STOPPED THROUGH THE STOP DOOR. After a stop
   * nothing the check's inspector writes lands, the messages that would pass its verdict on included, so the office says it
   * once in their place: which check of which run, who stopped it and why, and that its verdict will not count.
   */
  aCheckWasStopped: (check: string, run: string, by: string, why: string): SystemLine => ({
    line: `The check ${check} of run ${run} was stopped by ${by}: ${why}. Its verdict will not count.`,
    said:
      `The check ${check} of run ${run} was stopped by ${by}: ${why}. Its verdict will not count, and nothing it writes after ` +
      'the stop lands, so it will not tell you so itself. The run stands as it did before the check. Ask for the check again ' +
      'when the run is ready for it.',
  }),
  /**
   * WRITTEN TO THE AGENT THAT ASKED FOR A HOST TOOL, ONCE, WHEN THE JOB ENDS: which job, which tool and how it ended, so
   * a run that sleeps between steps is woken. The result is read at GET /api/host-jobs/<id> (src/server/lib/host-jobs.ts).
   */
  aHostJobEnded: (job: string, tool: string, state: string): SystemLine => ({
    line: `The host job ${job} (${tool}) ended: ${state}`,
    said: `The host job ${job}, which asked for the tool ${tool}, ended: ${state}. Read its result at GET /api/host-jobs/${job}.`,
  }),
  aCapStoppedARun: (messageId: string, agent: string): SystemLine => ({
    line: `A message to ${agent} is waiting`,
    said:
      `A message to ${agent} is waiting and no run was started for it. The message is ${messageId}. Agents have ` +
      'said as much as they may in that conversation without a person, so nothing more starts there until ' +
      'somebody writes in it. Nothing is lost: every message is still there to read. A refusal from an inspector ' +
      'never counts against this, and neither does anything said in the group a refusal opened.',
  }),
  /**
   * THE ONE SHORT LINE THE PERSON GETS, in their own conversation with the office, when the cap stops a
   * run they can start again. Criterion M128.
   *
   * It is separate from the notice above on purpose: the notice says what happened to the
   * conversation, and this says the one thing the person can do about it. It names the message, so
   * the id in it is the link that takes them to it.
   */
  theCapStoppedForYou: (messageId: string, agent: string): SystemLine => ({
    line: `Write to ${agent} to start it again`,
    said:
      `A message to ${agent} is waiting and no run was started for it. Write in that conversation to start it ` +
      `again. The message is ${messageId}.`,
  }),
  /**
   * WRITTEN WHEN A RUN THAT HAD ANSWERED WAITED FOR THE NEXT MESSAGE AND NONE CAME (criterion M22).
   *
   * A run answers and its process ends, but the conversation the tool made is still there and can be
   * picked up again by its own id. For a set number of minutes the next message goes into that same
   * conversation. This says that time has passed, so the next message starts a fresh conversation and
   * the agent will not remember what was said here.
   *
   * THE MINUTES ARE IN THE SENTENCE AND NOT IN THE LINE. The number is a setting and a reader who
   * thinks it too short or too long has to be able to see what it was, so it stays — in the hover
   * text, where criterion M34 puts the sentence. The line is the person's own example: "Agent run ended".
   */
  aRunWaitedAndEnded: (minutes: number): SystemLine => ({
    line: 'Agent run ended',
    said:
      `${minutes === 1 ? 'A minute' : `${String(minutes)} minutes`} passed with nothing more said, so this ` +
      "agent's run has ended. Write again whenever you like. The next message starts a new run, which will not " +
      'remember this one.',
  }),
  /**
   * WRITTEN WHEN A SECRETARY'S OR A SUPERVISOR'S RUN WAITED FOR THE NEXT MESSAGE AND NONE CAME.
   *
   * A message to a secretary or a supervisor picks up its own conversation after the wait as well as
   * during it. So the line
   * `aRunWaitedAndEnded` writes for a worker, that the next message will not remember this one, is
   * not true here, and this is the line instead. The short line is the same, because the run did end.
   *
   * "IF A RUN IS STARTED" AND "IF THE AGENT STILL USES THE SAME TOOL", because the next message may
   * go to a session somebody has open, or wait, and because the worker picks a conversation up only
   * with the tool that made it (`startARun` in src/worker/index.ts compares the two).
   */
  aKeptConversationWaitedAndEnded: (minutes: number): SystemLine => ({
    line: 'Agent run ended',
    said:
      `${minutes === 1 ? 'A minute' : `${String(minutes)} minutes`} passed with nothing more said, so this ` +
      "agent's run has ended. This agent is a secretary or a supervisor, so its conversation is kept. Write again " +
      'whenever you like. If a run is started for the next message, it picks up the newest conversation this agent ' +
      'had here, which is this one unless it has run since, and only if the agent still uses the same tool.',
  }),
  /**
   * WRITTEN WHEN A RUN MOLE OFFICE STARTED HAS ANSWERED (criterion H3).
   *
   * A durable agent is one identity across many processes, and the two ways it can answer are not
   * the same thing to the person reading. A session somebody has open answers as itself, carrying
   * everything said in that terminal. A RUN is a fresh process that was started because nobody had
   * the agent open; it knows what Mole Office handed it and no more. A person expects the agent they
   * wrote to to be the one that answers, and this line is what says when it was not.
   *
   * IT IS A LINE AND NOT A MARK ON THE REPLY. A mark on the message would say something about the
   * words; this says something about the moment, which is what happened in the conversation. It
   * follows the reply, where a reader has just read the answer and is deciding how much of the
   * history behind it to assume.
   */
  aRunAnswered: {
    line: 'A run answered',
    said:
      'Nobody had this agent open in a terminal, so Mole Office started a run of its tool to answer. The run was ' +
      'given the message, this agent’s own notes and the records it wrote lately, and nothing else — it does not ' +
      'remember earlier conversations unless they are in those.',
  } satisfies SystemLine as SystemLine,
  /**
   * WRITTEN WHEN A RUN MOLE OFFICE STARTED HAS ANSWERED INSIDE THIS AGENT'S OWN EARLIER CONVERSATION.
   *
   * The run was started with the tool's own id for a conversation an earlier run of this agent made
   * (`--resume` for Claude Code), so `aRunAnswered` above, which says the run does not remember
   * earlier conversations, is not true of it. This happens to a run started inside its wait (criterion
   * M22), and to a secretary's or a supervisor's run after the wait. The
   * worker hands a picked-up run the same prompt and the same bundle as a new one, so the message, the
   * notes and the records are named here too. The bundle is written only when the server answers for
   * it (`startARun` in src/worker/index.ts), so the sentence says "where Mole Office could gather
   * them". The short line is the same, because a run did answer.
   */
  aRunPickedUpItsConversation: {
    line: 'A run answered',
    said:
      'Nobody had this agent open in a terminal, so Mole Office started a run of its tool to answer. The run ' +
      'picked up this agent’s own earlier conversation here rather than starting a new one. It was also given the ' +
      'message and, where Mole Office could gather them, this agent’s own notes and the records it wrote lately.',
  } satisfies SystemLine as SystemLine,
  /**
   * WRITTEN WHEN A RESTART OF THE API CUT A RUN OFF BEFORE IT ANSWERED (criterion M24).
   *
   * The run's process was gone and it had printed no answer, and the server it belonged to had
   * restarted since it started. Both of those are read from what is stored — see
   * `whyThisRunWasCutOff` in src/server/lib/worker.ts — so this line is never a guess about a run
   * that simply failed. The line is the person's own example: "Mole Office restarted".
   */
  // THE WORDS ARE IN THE WORD LISTS (shared/office-lines.ts), so a page draws a stored line in its own language.
  get aRestartCutARunOff(): SystemLine {
    return theRestartLine(sayInEnglish)
  },
  /**
   * THE LINE THAT BRINGS A MESSAGE BACK, once, at the time the person chose with Remind me later, by a
   * decision. src/server/lib/remind-me-later.ts writes it. Its words are in the word lists
   * (shared/office-lines.ts).
   */
  get aMessageBackAsYouAsked(): SystemLine {
    return theBackAsYouAskedLine(sayInEnglish)
  },
  /**
   * THE LINE THAT BRINGS A MESSAGE BACK WHERE A SECRETARY SET THE TIME FOR THE PERSON under their grant. The person did
   * not press Remind me later, so this line says the secretary set it, and the delivery row keeps which one (migration
   * 0288; src/server/lib/remind-me-later.ts writes it).
   */
  get aMessageBackAsTheSecretarySetIt(): SystemLine {
    return theBackAsTheSecretarySetItLine(sayInEnglish)
  },
  /**
   * THE LINE THAT TELLS AN AGENT THE PERSON PRESSED "MARK BROKEN" ON ITS REPLY, by a decision.
   * src/server/lib/intent-mark-broken.ts writes it, to that agent alone. It names the reply, the marked message, the
   * mark's own sentence and the problem the press filed, so the agent can read all three. It wakes the agent: the mark
   * asked it to change nothing, or to build nothing yet. `secretary` names the secretary that pressed it for the person
   * under their grant, so the line does not say the person pressed it; null when the person pressed it.
   */
  theIntentMarkWasBroken: (reply: string, message: string, asks: string, problem: string, secretary: string | null = null): SystemLine =>
    secretary === null
      ? {
          line: sayInEnglish('officeLines.intentMarkBroken.line'),
          said: sayInEnglish('officeLines.intentMarkBroken.said', { reply, message, asks, problem }),
        }
      : {
          line: sayInEnglish('officeLines.intentMarkBrokenForThePerson.line'),
          said: sayInEnglish('officeLines.intentMarkBrokenForThePerson.said', { secretary, reply, message, asks, problem }),
        },
  /**
   * THE THREE FLOW REMINDERS, F10 AND F13. Each is a message from
   * the office that needs no reply, and each carries the role the office registered the agent under,
   * the duties of that role, and the note to read the office's rules again if it has forgotten them
   * — especially after a compaction (F10 step 2). The reminders do not read whether a
   * compaction happened (the session hook records one on the run since wave 13k round 46), so the note goes
   * in every reminder: especially after a compaction, and not only then.
   *
   * THE FEW WORDS ARE FIXED ON PURPOSE, like the waiting line above: what tells the agent its role
   * is the same mechanism that must be able to see, by reading the conversation, that it has already
   * been told — sent once per spell and per stage, never on a repeat. The reader in
   * src/server/lib/reminders.ts looks for these exact lines beside the recipient (and, for the two
   * expected-time lines, beside the run they are about), not for a flag that could disagree with it.
   *
   * THE TOKEN HALF OF F10 IS NOT BUILT. The step's budgets (F5) and the step log (F8) were withdrawn
   * on 11 September 2026, and a run's token count is known only after the run exits — the usage
   * receipt is parsed from the runtime's finished output by src/worker/runtimes/usage.ts and written
   * once by sayHowItEnded. Nothing reads a running run's tokens, so no reminder can be honestly
   * triggered by one. The expected-time half is built against an expected time typed by whoever
   * starts the task; where nobody typed one, nothing is reminded.
   *
   * THE SECOND CHECKPOINT IS TWICE THE TYPED EXPECTED DURATION. The step is late when it is still not
   * done within the second expected time, so the first period runs 0→T and the second runs T→2T, and
   * the escalation falls at 2T. That is a reading of the criterion, not arithmetic it states; the
   * alternative readings (the second checkpoint at T plus one further T measured from the first
   * reminder, or from the moment the step was noticed late) were considered and rejected as
   * inventions the criterion does not contain.
   */
  youHaveBeenIdle: (said: string): SystemLine => ({ line: 'Idle — your role and duties', said }),
  /**
   * THE SHORT REMINDER BEFORE A SECRETARY'S BROADCAST SLOT. The office sends a short reminder 30 minutes before
   * the slot's time.
   *
   * ONE LINE AND NOTHING MORE: the time of the slot followed by
   * 秘书汇报工作. The hover sentence is deliberately absent — the decision asks for a short reminder, and
   * a second sentence would be the paragraph that reminder is not. The time is what the secretary
   * names back when it broadcasts, and what the office reads to recognise the broadcast.
   *
   * THE DAY'S LAST REMINDER ALSO SAYS TO CHECK THE BACKUPS, once a day, in the day's last report
   * reminder. The sentence is MOLE_OFFICE_BROADCAST_BACKUP_REMINDER, and it is the whole sentence
   * behind the same few words, so the line stays short (criterion M34). The waiter hands the sentence
   * to the secretary after the line (tools/hold-the-handle.mjs), so it is read, not only hovered.
   *
   * WHEN A REPORT TEMPLATE IS SET, EVERY REMINDER ALSO CARRIES THE REQUIREMENT behind the same few
   * words: write a report on the template at each broadcast time, and send one chat line with a
   * button that opens it. src/server/lib/broadcast.ts
   * writes that sentence and passes it here as `alsoSay`, with the backup sentence after it on the
   * day's last reminder.
   */
  theBroadcastIsDue: (slot: string, alsoSay: string | null = null): SystemLine => ({ line: `${slot} 秘书汇报工作`, said: alsoSay }),
  /**
   * THE ONE MORE REMINDER WHEN A SLOT'S REPORT HAS NOT COME. The secretary's report YcJRwBmhvppQ, part 3, agreed in two
   * decisions: when no report has come by 07:15 or 18:15, the office reminds once
   * more. The few words name the slot, in the language the reminder before it
   * uses; `said` is the sentence src/server/lib/broadcast.ts writes, saying what the office looked for.
   */
  theBroadcastReportIsMissing: (slot: string, said: string): SystemLine => ({ line: `${slot} 的报告还没有收到`, said }),
  /**
   * THE ONE SENTENCE A SECRETARY IS TOLD when its broadcasts have been paused by the unanswered
   * rule. By B5 of a decision, the office sends no next reminder and tells the secretary once, in one sentence, that
   * broadcasts are paused until the person answers.
   */
  theBroadcastsArePaused: (said: string): SystemLine => ({ line: 'Broadcasts paused', said }),
  /**
   * THE LINE A STARTER IS TOLD WHEN A RUN IT STARTED GOES PAST THE MAIN WORLD'S LIMITS. The rule is remind, never
   * refuse. A few words, and the whole sentence behind them, which
   * src/server/lib/main-world.ts writes and the waiter hands to a session after the line.
   */
  tooManyInTheMainWorld: (past: 'share' | 'total', said: string): SystemLine => ({
    line: past === 'share' ? 'Past its main-world share' : 'Past the main-world total',
    said,
  }),
  /**
   * THE ONE LINE THE SECRETARIES GET WHEN ONE OF THE OFFICE'S OWN NUMBERS STAYS OUT OF
   * RANGE. This was wave 13y round 21. Written by src/server/lib/office-load.ts once for
   * each run of readings out of range, and not again until the number has come back in range.
   */
  theOfficeLoadIsOutOfRange: (said: string): SystemLine => ({ line: 'Office load out of range', said }),
  /**
   * THE ONE MESSAGE AN AGENT GETS ABOUT THE CARD IT NOW HOLDS, on registration and on a change.
   *
   * The person's words of 15 September 2026 and a decision say that on registering and on a card change
   * the office pushes the agent one message generated from the card and the chapters. The few
   * words name the card; the sentence carries the card's own duties, powers, first readings, who it
   * reports to, what ends it and where its first task is. `src/server/lib/cardmessage.ts` builds it
   * and is the only caller.
   */
  youHoldACard: (role: string, said: string): SystemLine => ({ line: theCardLine(sayInEnglish, role), said }),
  /**
   * THE ONE MESSAGE AN AGENT GETS WHEN IT STARTS A FLOW THAT AN IN-USE HANDBOOK HANGS ON, once for each start. The
   * sentence carries each handbook: why the agent has it, who wrote its text and why, and its opening.
   * `src/server/lib/handbooks.ts` builds it and is the only caller.
   */
  handbooksForAFlowStart: (said: string): SystemLine => ({ line: 'Handbooks for your flow', said }),
  knowledgeForAFlowStep: (said: string): SystemLine => ({ line: KNOWLEDGE_WORDS.flowStepLine, said }),
  /**
   * THE ONE MESSAGE A RUN'S STARTER GETS WHEN THE RUN IS SEALED. Problem VJom2joVhqjM, part 1.
   *
   * A sealed run's key proves nobody, so the run cannot send a message after its seal. The office sends
   * the starter what that message would have carried: the tip, the fork base, the seal id, the files and
   * the files outside src/ and tests/. `sealFinishedRun` in src/server/lib/sealed-tip.ts is the only
   * caller. Each part the seal does not hold is said as absent with the reason, never left out: a
   * records seal has no commit, and a files seal was never in git.
   */
  aRunWasSealed: (sealed: TheSealAStarterIsTold): SystemLine => ({
    line: `Run ${sealed.run} sealed`,
    said: theSealInWords(sealed),
  }),
  theExpectedTimeHasArrived: (said: string): SystemLine => ({
    line: 'The expected time has arrived',
    said,
  }),
  twiceTheExpectedTime: (said: string): SystemLine => ({ line: 'Twice the expected time has passed', said }),
  /**
   * A RUN'S REMINDER OF ITS ROLE, ITS DUTIES AND ITS CURRENT STEP (wave 14d): once at each change of step, and again
   * after the step's tokens or its minutes reach their settings. The few words are fixed, because the minute's step
   * finds the reminders it has already sent by reading these words on the office's lines about the run. The sentence
   * is written by the step reminder in src/server/lib/step-reminders.ts.
   */
  aStepReminder: (said: string): SystemLine => ({ line: 'A reminder of your role and your current step', said }),
  /**
   * A DRAFT THAT HAS NOT BEEN SENT, SAID ONCE FOR EACH VERSION OF IT. By point 5 of a decision, the reminder comes
   * after the draft's own time (an hour unless it names another), and it never sends the draft.
   *
   * THE FEW WORDS ARE FIXED, like the idle line above, because the tick finds what it has already
   * said by reading these exact words beside the draft and its version. The sentence says whose draft
   * it is in the way that is true for the one it reaches: its writer, the writer's starter once the
   * writer's run has ended, or the person when neither can be named, with the reason.
   */
  aDraftIsNotSent: (said: string): SystemLine => ({ line: 'A draft is not sent', said }),
  /**
   * A PERSON'S MESSAGE HANDED TO AN AGENT'S LIVE SESSION WITH NO REPLY YET, said once for each message (wave 13y round
   * 11). src/server/lib/reply-reminder.ts sends it to the agent after MOLE_OFFICE_REPLY_REMINDER_MINUTES, and finds what
   * it already said by these fixed words and the message the line is about.
   */
  aPersonWaitsForAReply: (said: string): SystemLine => ({ line: 'A person waits for your reply', said }),
  /**
   * A NOTEBOOK OR A PROJECT'S MODULES LEFT UNCHANGED (problem UBCrM0LoMCm3; decisions jlXCnK4feOuR and aZGg6gerakM1).
   * src/server/lib/stale-records.ts sends these at most once a day, and they block nothing. The few words are fixed, like
   * the draft line above; the tick finds what it already said by the day and the record it marks beside the line.
   */
  aNotebookHasNotChanged: (said: string): SystemLine => ({ line: 'A notebook has not changed', said }),
  modulesHaveNotChanged: (said: string): SystemLine => ({ line: 'Modules have not changed', said }),
  /** A PROJECT'S FLOWS LEFT UNCHANGED, said the way the modules line above is, to the same one secretary (wave 13j round 50). */
  flowsHaveNotChanged: (said: string): SystemLine => ({ line: 'Flows have not changed', said }),
  /**
   * THE REMINDER BEFORE THE SEAL, by design B of a decision, in wave 13j round 50.
   * src/server/lib/before-the-seal.ts writes it to the run's agent when the run's first sealing write is answered
   * with the reminder instead of the seal. The record door reads it back to know the run was reminded, so the next
   * write seals. It blocks nothing.
   */
  beforeTheSeal: (said: string): SystemLine => ({ line: 'Before the seal', said }),
  /**
   * A ROUND ENDED WITHOUT A SEAL (wave 13j round loop-1). src/server/lib/how-a-round-ended.ts writes it once to the starter of
   * a run started in a sandbox, when the run's command ended, or the run crashed or was orphaned, and nothing sealed it. It
   * says the reasons the office found and what to do, so the starter does not have to watch for it.
   */
  aRoundEndedWithoutASeal: (said: string): SystemLine => ({ line: 'A round ended without a seal', said }),
  /**
   * THE CHECK OF A SEALED ROUND IS HELD (wave 13j round loop-1): the run's last message to its starter did not say it seals,
   * or said it will not. The office asked no check. The starter reads the message and releases the check, or does not.
   */
  theCheckIsHeld: (said: string): SystemLine => ({ line: 'The check is held', said }),
  /**
   * A NEXT ROUND THAT WAS ASKED FOR DID NOT START (wave 13j round loop-2), to whoever asked at the next-round door. It says
   * why, so the asker does not wait for a round that will never come.
   */
  aNextRoundDidNotStart: (said: string): SystemLine => ({ line: 'A next round did not start', said }),
  /**
   * A WORKER RUN THAT WAS ASKED FOR DID NOT START (wave 13j round loop-3), to the supervisor that asked at the worker-run
   * door. It says why, so the supervisor does not wait for a worker that will never come.
   */
  aWorkerDidNotStart: (said: string): SystemLine => ({ line: 'A worker run did not start', said }),
  /**
   * A SANDBOX RUN ENDED WITH ITS REPORT (problem Grbb87VX3pND; XFbDHl9vZzu6). src/server/lib/launcher-notices.ts writes
   * it to the run's starter when the launcher's finishing write carries `tellTheStarter: 'ended-with-its-report'` and the
   * office sealed the run. The sentence is the office's own, from the seal and the run's links. Until 18 October 2026 the
   * launcher sent it as a message under the run's key, and the office read it as the run's own last word.
   */
  aRunEndedWithItsReport: (said: string): SystemLine => ({ line: 'A run ended with its report', said }),
  /** A SANDBOX RUN OF CODEX THAT ANSWERED AT CAPACITY, on any model, from the launcher's crash write, to its starter. */
  codexAnsweredAtCapacity: (said: string): SystemLine => ({ line: 'Codex answered at capacity', said }),
  /** A SANDBOX RUN OF CODEX THAT MET A RATE OR USAGE LIMIT, on any model, from the launcher's crash write, to its starter. */
  codexMetAUsageLimit: (said: string): SystemLine => ({ line: 'Codex met a usage limit', said }),
  /**
   * A SANDBOX RUN WAITS LONG ON A USAGE LIMIT: an OpenCode run whose next try is more than an hour away, from the
   * launcher's write that marks the wait, to its starter and to the secretary who takes the usage notices. The sentence is
   * the office's own, from the stored mark (src/server/lib/launcher-notices.ts).
   */
  aRunWaitsLongOnALimit: (said: string): SystemLine => ({ line: 'A run waits long on a usage limit', said }),
  /**
   * A SANDBOX RUN HAS RUN LONG, by item 5 of a decision and problem Grbb87VX3pND. The reminder
   * pass writes it once to the starter of a run in a sandbox that still says running 8 hours after it was filed. It
   * stops nothing. Until 18 October 2026 the launcher sent it from its own timer, under the run's key.
   */
  aSandboxRunHasRunLong: (said: string): SystemLine => ({ line: 'A sandbox run is still running', said }),
  /**
   * WHAT THE NIGHTLY GOVERNS CHECK FOUND IN A PROJECT, to the one secretary named for the project
   * on the Settings page, or else in MOLE_OFFICE_MODULE_REMINDER_SECRETARIES (src/server/lib/module-reminder-secretaries.ts
   * reads both). src/server/lib/governs.ts sends it at most once a night, and only when a list is not empty. It asks the
   * secretary to act, so it is not one of the lines that wake nobody.
   */
  theGovernsCheckFoundWork: (said: string): SystemLine => ({ line: 'The governs check found work', said }),
  /**
   * A DECISION OR A REPORT SAYS NO PAGE FITS IT: one line for each new nothingFits entry, sent at once to the nearest
   * module's owner, the owner of a module implementing the nearest pipeline or block, or the module reminder secretary
   * (src/server/lib/what-a-record-names.ts). It asks whether a page should be made, so it wakes its reader.
   */
  nothingFitsAPage: (said: string): SystemLine => ({ line: 'No page fits a record', said }),
  /**
   * KEY FILES LEFT IN A SANDBOX (problem 296sqTPPdWsQ; the secretary, message pEcpMdlrsJr6): the office's check for files under a
   * sandbox's out/ folder that hold a key this office made (src/server/lib/key-files.ts). The sentence names each file and
   * whose key it holds, never the key, and says nothing was deleted.
   */
  keyFilesLeftInASandbox: (said: string): SystemLine => ({ line: 'Key files left in a sandbox', said }),
  /**
   * A CREDENTIAL USED WITH OTHER FACTS, to the agent's nearest superior or
   * the secretary who takes the dead letters. It asks that agent to check who used the credential;
   * the mismatch itself refuses nothing, and the person receives no message about it.
   */
  aCredentialWasUsedWithOtherFacts: (said: string): SystemLine => ({ line: 'A credential was used with other facts', said }),
  /**
   * THE PERSON RAISED THIS SECRETARY. When they press, the agent is told by an office message, by their decision of
   * 26 September 2026. It says until when, their reason in their words, and what a raise
   * does not carry, so the secretary does not have to be refused to find out, and how it ends the raise
   * itself.
   *
   * WHAT IT DOES NOT CARRY IS COUNTED FROM THIS OFFICE'S LIST when the person presses, never written here: each office's
   * person may change the answer about any door (src/server/lib/what-the-grant-carries.ts). The line names each kind of
   * door the grant does not press with its own number, and the whole is their sum, so no door is counted and left
   * unnamed. `never` is the card's list of acts no grant carries.
   */
  youAreRaised: (
    untilInWords: string,
    reason: string,
    raiseId: string,
    notPressed: { doNotAskYet: number; kept: number; needWords: number; askFirst: number; never: readonly string[] },
  ): SystemLine => ({
    line: 'The person raised you to act for them',
    said:
      `The person raised you to act for them ${untilInWords}. Their reason: ${reason}\n\n` +
      'While it holds you may do their acts, and every write you make under it names the raise. ' +
      `It does not press ${String(notPressed.doNotAskYet + notPressed.kept + notPressed.needWords)} of the person's doors: ` +
      `${someDoors(notPressed.doNotAskYet, 'that does not ask the check yet', 'that do not ask the check yet')}, whatever this office's answer; ` +
      `${String(notPressed.kept)} more that this office keeps for them; and ` +
      `${someDoors(notPressed.needWords, "more that also needs the person's words for each change", "more that also need the person's words for each change")}.` +
      (notPressed.askFirst > 0 ? ` For ${someMoreDoors(notPressed.askFirst)}, you ask the person first.` : '') +
      ' GET /api/office/what-the-grant-carries names each door and its answer.' +
      (notPressed.never.length > 0 ? ` No grant carries these: ${notPressed.never.map(aNameInASentence).join('; ')}.` : '') +
      ' A run the office starts for you does not carry it. It ends at its time, when the person ends it, or when you ' +
      `end it yourself: POST /api/roles/raises/${raiseId}/end, with your own key and name and no body. You cannot ` +
      'start or lengthen a raise.',
  }),
  /** THE PERSON'S RAISE OF THIS SECRETARY ENDED, when they ended it. */
  yourRaiseEnded: (because: string): SystemLine => ({
    line: 'Your raise has ended',
    said: `Your raise has ended: ${because} What you wrote while it held still names it.`,
  }),
  /**
   * ONE OF THE PERSON'S SETTINGS WAS CHANGED FROM THEIR OTHER COMPUTER. Their decision of 26 September 2026 lets them
   * set their office keys, their summons settings and the sandboxes' logins from a paired computer, and asks that each
   * such change be said to them, so a change they did not make is seen on every screen they read the office
   * on. It names what changed and never a value, and it names no address.
   */
  aSettingChangedFromAnotherComputer: (what: string): SystemLine => ({
    line: 'A setting was changed from another computer',
    said:
      `${what}, from another computer. If that was not you, set it again on this computer, and end that ` +
      "computer's access in the Embassy.",
  }),
  /**
   * ONE OF THE PERSON'S OWN ACTS WAS MADE FROM THEIR OTHER COMPUTER. By their decision of October 2026, their decisions
   * are theirs wherever they make them, so giving a card, raising a secretary, retiring an agent, taking an act back
   * and the other acts kept for them may be made with their key from a paired computer, and each one made that way is
   * said to them as a changed setting is. It names the act and never an address.
   */
  anActWasMadeFromAnotherComputer: (what: string): SystemLine => ({
    line: 'One of your acts was made from another computer',
    said:
      `${what}, from another computer. If that was not you, end that computer's access in the Embassy and undo ` +
      'the act on this computer.',
  }),
  /**
   * ONE OF THE OFFICE'S TERMINALS WAS USED FROM THE PERSON'S OTHER COMPUTER, by point (d) of a decision, wave 13u round
   * 14. Their key may read, type into, resize and close a terminal from another computer, and a
   * terminal runs anything, so each such use is said to them where they read the office, as a changed setting is.
   * `what` names the terminal and the act; `device` is the paired device whose key was used, or null when the person's
   * key itself was.
   * It names no address: the terminal's page records that beside each run of typing.
   */
  aTerminalUsedFromAnotherComputer: (what: string, device: string | null): SystemLine => ({
    line: 'A terminal was used from another computer',
    said:
      `${what}, from another computer${device === null ? ', with your key' : `, with the key of ${device}`}. If that was ` +
      "not you, close the terminal on this computer, and end that computer's access in the Embassy.",
  }),
  /**
   * A SECRETARY CHANGED ONE OF THOSE SETTINGS FOR THE PERSON, on their quoted words or under their raise. By their
   * decision of 27 September 2026, a secretary carrying their words may set their office keys, the sandboxes' logins,
   * their summons settings and the devices a summons tells, and the change is said to them as a change from their other
   * computer is, so one they did not ask for is seen wherever they read the office. It names
   * what changed, who changed it and on what, never a value, and no address. IT ENDS IN WORDS THAT NEVER CHANGE, so
   * scripts/shorten-the-system-lines-written-
   * before-m34.ts, which knows a line by the words its sentences share, cannot take another sentence for this one.
   */
  aSettingChangedForHim: (what: string, who: string, how: 'on your words' | 'under your raise'): SystemLine => ({
    line: 'A secretary changed a setting for you',
    said: `${what}, by ${who}, ${how}. If you did not ask for it, set it again on the Settings page and tell the secretary.`,
  }),
  /**
   * A SECRETARY ADDED A PROVIDER, OR CHANGED ITS ADDRESS, PROGRAMS OR KEY NAME. The provider table beside the
   * Casting table names where a program sends its model requests and which entry of the key file holds its key, so
   * a change the person did not ask for is said to them right after it is made
   * (src/server/lib/the-provider-table.ts writes it). It names the row, the host and the key file's entry, never a
   * key's value and never the whole address. Its words are in the word lists (shared/office-lines.ts).
   */
  aSecretaryAddedAProvider: (values: AProviderLinesValues): SystemLine => theProviderAddedLine(sayInEnglish, values),
  aSecretaryChangedAProvider: (values: AChangedProviderLinesValues): SystemLine => theProviderChangedLine(sayInEnglish, values),
  /**
   * THE AGENTS IN THE OFFICE'S TERMINALS, AFTER THE TERMINAL HOLDER RESTARTED (wave 13u, round 3). A holder that stops
   * ends its terminals, so the office opens each agent that worked in one again with its runtime's resume command, and
   * tells the person in one message who came back and who did not, and why (src/server/lib/terminal-agents.ts).
   */
  agentsInTerminalsAfterTheHolderRestarted: (said: string): SystemLine => ({
    line: 'The terminal holder restarted',
    said,
  }),
  /**
   * THE ONE NOTICE A RUN THAT STOPPED FOR A REASON THE PERSON MUST ACT ON EARNS. Criterion M94: a
   * notice when the quota runs out saves the person going to a terminal to find out why a run stopped.
   *
   * It is the office speaking, never the agent: a limit is the tool's, not the agent's, and dressing
   * it as the agent would be a lie about who is talking. It names every run the cause stopped since
   * the last notice (their ids and titles), the cause's own words, and when the limit resets if the
   * words carry one. The few words are the first line of a system block; the sentence is the hover
   * text, where every other system line keeps its detail.
   */
  theRunsAStopCauseStopped: (
    runs: readonly { id: string; title: string }[],
    causeWords: string,
    causeSaid: string,
    resets: string | null,
    /**
     * THE MESSAGES THE STOPPED RUNS WERE CARRYING, by id. Criterion M128: the notice is written into
     * the conversation it is about and names the message it is about. Read off each run's own
     * `deliveringMessage`, so it is where the run really was and never a guess.
     */
    messages: readonly string[] = [],
  ): SystemLine => {
    const howMany = runs.length
    const named = runs.map((run) => `${run.id} (“${run.title}”)`).join(', ')
    const subject = howMany === 1 ? 'One run' : `${String(howMany)} runs`
    const aboutMessages = messages.length === 0 ? '' : ` The message${messages.length === 1 ? '' : 's'} ${messages.join(', ')}.`
    return {
      line: `${howMany === 1 ? 'A run' : `${String(howMany)} runs`} stopped: ${causeWords}`,
      said:
        `${subject} could not go on because of ${causeWords}. The cause's own words: “${causeSaid}”. ` +
        `The ${howMany === 1 ? 'run was' : 'runs were'} ${named}.` +
        (resets === null ? '' : ` It resets ${resets}.`) +
        aboutMessages,
    }
  },
  /**
   * WRITTEN TO THE ONE SECRETARY WHO TAKES USAGE NOTICES WHEN THE SANDBOXES' CLAUDE LOGIN HAS USED 50% OR 80% OF ITS
   * SEVEN DAYS (wave 13p round E; to one secretary, not each, since wave 13y round 136). Once per share and per
   * seven-day count, and a new seven-day reset starts a new count. The line and the longer body are the same words: the
   * login's name once, the use as the reading read it, the share it is past, and that window's reset time with its
   * zone. At 80% they say what the usage decision set in the office says to do, with that decision's id, and then that
   * decision's words on a line of their own, exactly as the setting holds them: no full stop is added (wave 13y round
   * 137). When none is set, they say so and ask the secretary to ask the owner about the rest of the seven days.
   * `atEighty` is that setting as src/server/lib/usage-notices.ts reads it. `whyThisSecretary` is null when this
   * secretary was chosen to take the notices, or is the first secretary appointed and nobody is chosen. Otherwise it is
   * the sentence that setting's reading says: who was chosen, why that agent cannot take the notices, and that this
   * secretary takes them as the first secretary appointed. It ends the words: on the next line after the decision's
   * words, and after one space otherwise. The percentage and the stamp are written by the one helpers in
   * src/shared/logins-week.ts, so the notice, the reading's own sentence, the router and the panel round and cut them
   * the same way. No word of the office's own tells a line to slow down.
   */
  theLoginsWeekIsPartUsed: (
    loginName: string,
    share: number,
    used: number,
    resets: string,
    zone: string,
    atEighty: { decision: string; whatToDo: string } | null,
    whyThisSecretary: string | null,
  ): SystemLine => {
    const percent = aUseInPercent(used)
    const at = `${minute(resets)}, ${zone} time`
    const setApart = share >= 80 && atEighty !== null
    const ask =
      share < 80
        ? ''
        : atEighty === null
          ? ' No usage decision is set in this office, so ask the owner about the rest of these seven days now.'
          : ` The usage decision ${atEighty.decision} says what to do now:\n${atEighty.whatToDo}`
    const why = whyThisSecretary === null ? '' : `${setApart ? '\n' : ' '}${whyThisSecretary}`
    const words = `${loginName} has used ${percent}% of its seven days, which is past ${String(share)}%. They reset at ${at}.${ask}${why}`
    return { line: words, said: words }
  },
  /**
   * WRITTEN TO THE HOLDER OF THE SECRETARY CARD WHEN NEW CHECKS ON A LOGIN ARE HELD, because a check on it stopped on its
   * 5-hour limit, and once more when the reset has passed (wave 13j). `said` is the hold's
   * own sentence (src/server/lib/checks-in-merges-only.ts), so the line and the switch's reading say the same.
   */
  checksAreHeldForALimit: (loginName: string, until: string, said: string): SystemLine => ({
    line: `New checks on ${loginName} are held until ${until}`,
    said,
  }),
  checksGoOnAfterALimit: (loginName: string, until: string): SystemLine => ({
    line: `New checks on ${loginName} start again`,
    said: `New checks on ${loginName} were held until ${until} for a 5-hour limit. That time has passed, and they start again.`,
  }),
  /** The automatic repeat ended without a verdict too, so the secretary hears both sessions once. */
  aCheckGaveNoVerdictTwice: (run: string, first: string, second: string): SystemLine => ({
    line: 'Two check sessions gave no verdict',
    said: `Check sessions ${first} and ${second} gave no verdict. Run ${run} stays inspecting. Nothing starts again by itself. Its starter or a person can ask for the check again.`,
  }),
  /**
   * WRITTEN TO WHOEVER IS RESPONSIBLE WHEN A PACKAGE IS TAKEN OUTSIDE THE OFFICE. Criterion F16,
   * point 4: a take opens a conversation with the one responsible, naming the task, who has taken
   * it, and what the taker said would come back and by when. The message this produces carries a
   * `lead` to the task as well, filed beside it by the caller rather than here, because a lead is
   * where a message OFFERS TO TAKE the reader and this shape is only the words.
   *
   * MOLE OFFICE SAYS ONLY WHAT IT WAS TOLD. Chapter 8, rule 3: this product cannot tell the person
   * from a program on their machine that sends their name, so the sentence says who Mole Office was
   * told is doing the work, never more than that.
   */
  packageTakenOutside: (title: string, who: string, comesBack: string, byWhen: string): SystemLine => ({
    line: `"${title}" was taken outside the office`,
    said:
      `"${title}" was taken outside the office. Mole Office was told this is being done by ${who}. ${who} said ` +
      `this will come back: ${comesBack} It is expected back by ${byWhen}.`,
  }),
  /**
   * WRITTEN TO WHOEVER IS RESPONSIBLE WHEN AN AGENT CLAIMS A PACKAGED TASK. Criterion F16 point 3: an
   * agent takes a package with the ordinary claim it already has, and the one responsible is told.
   *
   * IT MUST READ DIFFERENTLY FROM `packageTakenOutside`, AND THE DIFFERENCE IS WHAT COMES BACK. A
   * person's take is a promise to bring the work back from outside: it names who will do it, what
   * will come back and by when. An agent's take is the ordinary claim, and the work stays on this
   * machine — no outside reader was named and nothing is expected back. A reader who could not tell
   * the two apart would wait for a return that was never promised.
   */
  aClaimTookThePackage: (title: string, who: string, claimant: ParticipantKind): SystemLine => {
    const word = participantWord(claimant)
    const article = word === 'agent' ? 'an agent' : 'a person'
    return {
      line: `"${title}" was claimed by ${article}`,
      said:
        `The ${word} "${who}" has claimed the package on "${title}". This is a claim inside Mole ` +
        'Office, not a person promising the work to somebody outside: no outside reader was named, and nothing ' +
        'is expected back from outside.',
    }
  },
  /**
   * WRITTEN WHEN A COUNTER FIRES AND ITS ACTION IS A MESSAGE. Criteria CT4 and CT5.
   *
   * THE FEW WORDS NAME THE COUNTER AND SAY THAT IT FIRED, and nothing else: which trigger held and
   * what the count was are the sentence behind them, because a reader on a phone needs to know which
   * counter this is before anything else. The whole sentence is what the firing row already says, so
   * the line and the row cannot come to two accounts of one firing.
   *
   * IT NAMES NO NEXT STEP, on purpose. What to do about a counter firing is the counter's own
   * business: the same line goes to a person watching a merge queue and to an agent watching a rig,
   * and a sentence telling either of them what to do would be right for one of them at most.
   */
  /**
   * WRITTEN WHEN A CHECKLIST ITEM'S REMINDER FIRES, to the checklist's owner and to nobody else. One of the owner's
   * decisions asks for a reminder per item, off by default, that the owner switches on.
   *
   * THE FEW WORDS SAY IT IS A CHECKLIST ITEM, and the sentence behind them gives the item's own words,
   * which checklist holds it and where it stands, so the owner knows which request this is.
   */
  aChecklistItemIsDue: (checklist: string, itemId: string, words: string, state: string): SystemLine => ({
    line: 'A checklist item is due',
    said: `The reminder on item ${itemId} of your checklist "${checklist}" is due. The item says: ${words} It is ${state}.`,
  }),
  /**
   * THE OWNER MARKED A CHECKLIST ITEM DONE, in wave 13j round loop-5. One message, to
   * whoever added the item or to the agents the item names to tell, written in the same write as the mark. `how` says
   * how the mark came: the owner's own press, the owner's words that `writer` read, or `writer` under the owner's raise.
   * The owner's own written words, when the press carried any, are carried whole behind the item's own words; the
   * parameter has a default so the length this builder reports to the shortening script stays as it was.
   */
  thePersonMarkedAnItemDone: (checklist: string, itemId: string, words: string, writer: string, how: 'press' | 'words' | 'raise', theOwnersWords: string | undefined = undefined): SystemLine => ({
    line: how === 'press' ? 'The owner marked an item done' : how === 'words' ? "Done on the person's words" : "Done under the owner's raise",
    said:
      (how === 'press'
        ? `The owner marked item ${itemId} of checklist "${checklist}" done.`
        : how === 'words'
          ? `${writer} marked item ${itemId} of checklist "${checklist}" done, on a message of the owner's that ${writer} read as naming it.`
          : `${writer} marked item ${itemId} of checklist "${checklist}" done under the owner's raise.`) +
      ` The item says: ${words}` +
      (theOwnersWords === undefined ? '' : ` Written response: ${theOwnersWords}`),
  }),
  /**
   * THE PERSON IS SENT ONE SHORT LINE FOR EACH CHANGE TO A CHECKLIST OF THE PERSON'S, by two
   * decisions. What those decisions ask: an item added to, removed from,
   * changed on or marked done on a checklist of the person's sends the person one notice; the notice says in one short
   * line what happened to what, and carries no long text, no whole item, no writer and no message.
   *
   * EACH NAMES THE ITEM OR THE CHECKLIST as `theWordsTheNoticeNames` gives it; a done line on somebody else's checklist
   * folds in whose checklist it was. They are QUIET in the table of notices: they go only to the person, who is not a
   * waiter an office line wakes.
   */
  addedToYourChecklist: (words: string): SystemLine => ({
    line: `Added to your checklist: «${theWordsTheNoticeNames(words)}»`,
    said: null,
  }),
  changedOnYourChecklist: (words: string): SystemLine => ({
    line: `Changed on your checklist: «${theWordsTheNoticeNames(words)}»`,
    said: null,
  }),
  markedDoneOnAChecklist: (words: string, whose: string | null): SystemLine => ({
    line: `${whose === null ? 'Marked done on your checklist' : `Marked done on ${whose}'s checklist`}: «${theWordsTheNoticeNames(words)}»`,
    said: null,
  }),
  removedFromYourChecklist: (words: string): SystemLine => ({
    line: `Removed from your checklist: «${theWordsTheNoticeNames(words)}»`,
    said: null,
  }),
  aChecklistWasMadeForYou: (title: string, items: number): SystemLine => ({
    line: `A checklist was made for you: «${theWordsTheNoticeNames(title)}», ${String(items)} ${items === 1 ? 'item' : 'items'}`,
    said: null,
  }),
  /**
   * THE OFFICE ASKS THE PLANNER TO QUESTION THE PLAN. Sent once, to the planner
   * alone, when the planner says the plan step is done. The four questions are `PLAN_QUESTIONS` in
   * shared/planning-flow.ts, asked in their order, and the sentence ends with the door that submits the answers.
   */
  questionThePlan: (moduleTitle: string, moduleId: string, pipelineId: string, checklistTitle: string, itemId: string): SystemLine => ({
    line: `Question the plan for "${moduleTitle}"`,
    said:
      `You said the plan step is done for module "${moduleTitle}" (${moduleId}), drawn as pipeline ${pipelineId}. ` +
      'Question the plan yourself, with no second agent. Answer each question in a sentence or two: ' +
      PLAN_QUESTION_KEYS.map((key, at) => `${String(at + 1)}. ${PLAN_QUESTIONS[key]}`).join(' ') +
      ' Then revise the module and the pipeline, and submit with POST /api/modules/' +
      `${moduleId}/plan {"answers": {${PLAN_QUESTION_KEYS.map((key) => `"${key}": "…"`).join(', ')}}}. ` +
      `The office then records the plan on the module and ticks item ${itemId} of your checklist "${checklistTitle}".`,
  }),
  /**
   * THE GPU BOOKING LINES. They are built in src/server/lib/bookings.ts. The office sends every
   * booking message, because it holds the line; the GPU watcher sends none, so nobody is told twice
   * (message L0ZsT2z9ZKQW, point 5).
   *
   * TO A PERSON, NO ID AND NO DOOR. Chapter 10, rule 4: a line to the owner names where they see it, the
   * Resources page, and the caller files a lead to that page beside it (`aLeadToTheResourcesPage` in
   * lib/bookings.ts). A line to an agent keeps the booking's id, which is what its doors take.
   *
   * OVER THE CARD. This was wave 13s round 38. Bookings that run together declare more
   * memory than the card has, or the card's size is not known. Nothing is refused or moved; each holder is reminded,
   * with
   * each declaration, the total and the card's size. `declared` lists the bookings at that time, the one that
   * brought the reminder first, and the reader's own with `whose` null. `card` is null when the watcher has not
   * read the card since the server started.
   */
  aBookingsGoOverTheCard: (
    at: string,
    declared: readonly { whose: string | null; booking: string; gib: number }[],
    card: { gib: number; mib: number } | null,
    toAPerson: boolean,
  ): SystemLine => {
    const total = declared.reduce((sum, d) => sum + d.gib, 0)
    const each = declared
      .map((d) => `${d.whose === null ? 'your' : `${d.whose}'s`} booking${toAPerson ? '' : ` ${d.booking}`} declares ${String(d.gib)} GiB`)
      .join('; ')
    return {
      line: card === null ? `GPU bookings share the card from ${at}, and it was not read` : `Booked GPU memory goes over the card from ${at}`,
      said:
        `From ${at}, ${each}. ${declared.length === 1 ? 'That is' : 'Together that is'} ${String(total)} GiB, ` +
        (card === null
          ? "and the card's size is not known, because the watcher has not read the card since the server started. "
          : `and the card has ${String(card.gib)} GiB (${String(card.mib)} MiB). `) +
        'Nothing was refused or moved: this is a reminder.' +
        (toAPerson ? ' It is on the Resources page.' : ''),
    }
  },
  /**
   * GO FIRST NOW: to a holder whose running booking another goes ahead of, with the grace. `who` is "The
   * owner", or the agent whose request to go first was granted.
   *
   * TO A PERSON, NOTHING TO TYPE. Naming a program takes a door and a process group or ledger row, so the
   * owner's line does not ask them to name it again; it says where their booking is, the Resources page.
   */
  aBookingGoesFirstNow: (who: string, booking: string, graceUntil: string, startsAt: string, endsAt: string, toAPerson: boolean): SystemLine => ({
    line: `${who} goes first on the GPU: stop by ${graceUntil}`,
    said: toAPerson
      ? `${who} goes first on the GPU now. Please stop the work under your GPU booking by ${graceUntil}. ` +
        `Your booking now runs from ${startsAt} to ${endsAt}. It is on the Resources page.`
      : `${who} goes first on the GPU now. Please stop the work under your booking ${booking} by ${graceUntil}. ` +
        `Your booking now runs from ${startsAt} to ${endsAt}; name its program again when you start.`,
  }),
  /**
   * ASKED TO GO FIRST: to each one whose grant the request needs.
   *
   * TO A PERSON, THE PRESS AND WHERE IT IS: the Resources page's two buttons, with a lead to that page
   * filed beside the line. Their names are read from the words the page draws them with, `resources.grant`
   * and `resources.refuse`, so a button renamed there is renamed here. The owner approves by a press, as chapter 10
   * rule 4 says, so their line names no door, no command and no id. An agent's line keeps the
   * door. `holder` is the
   * holder's name, or null when the reader holds the booking asked to wait.
   */
  aGoFirstIsAsked: (applicant: string, booking: string, ahead: string, holder: string | null, toAPerson: boolean): SystemLine => {
    const whose = holder === null ? 'your' : `${holder}'s`
    return {
      line: `${applicant} asks to go first on the GPU`,
      said: toAPerson
        ? `${applicant} asks for its GPU booking to go ahead of ${whose} booking. Press "${sayInEnglish('resources.grant')}" or ` +
          `"${sayInEnglish('resources.refuse')}" on the Resources page. Until it is granted, nothing moves.`
        : `${applicant} asks for its GPU booking ${booking} to go ahead of ${whose} booking ${ahead}. Answer with POST ` +
          `/api/bookings/${booking}/go-first/answer {"grant": true} or {"grant": false}. Until it is granted, nothing moves.`,
    }
  },
  /** THE ANSWER: to the applicant, granted or refused. */
  aGoFirstWasAnswered: (booking: string, granted: boolean, by: string, startsAt: string): SystemLine => ({
    line: granted ? 'Your request to go first is granted' : 'Your request to go first is refused',
    said: granted
      ? `${by} granted your request. Your GPU booking ${booking} now starts at ${startsAt}.`
      : `${by} refused your request. Your GPU booking ${booking} keeps its place, starting at ${startsAt}.`,
  }),
  /**
   * A BOOKING RUNS OVER (report peyJSnLoz_Bk, part 3). Nothing is stopped. When the next booking's time has
   * come and its memory does not fit beside the job still running, the holder is told this line and the next
   * booker is told the one below, once for each next booking (`tellTheOverRuns` in lib/bookings.ts).
   */
  aBookingRunsOver: (booking: string, minutesOver: number, next: string, nextGiB: number, toAPerson: boolean): SystemLine => ({
    line: `Your GPU booking is ${String(minutesOver)} min over its time`,
    said:
      `Your GPU booking${toAPerson ? '' : ` ${booking}`} ended ${String(minutesOver)} minutes ago, and its program is still running. ` +
      `${next}'s booking of ${String(nextGiB)} GiB has started and does not fit beside it. Nothing was stopped. ` +
      (toAPerson ? 'It is on the Resources page.' : 'The booking ends when its program ends.'),
  }),
  aBookingBeforeYoursRunsOver: (booking: string, holder: string, bookedEnd: string, toAPerson: boolean): SystemLine => ({
    line: `${holder}'s GPU booking runs over, and yours does not fit yet`,
    said:
      `The time of your GPU booking${toAPerson ? '' : ` ${booking}`} has come. ${holder}'s booking was to end at ${bookedEnd}, ` +
      'but its program is still running, and your card memory does not fit beside it. Nothing was stopped. ' +
      (toAPerson ? 'It is on the Resources page.' : 'GET /api/resources/gpu says when it ends.'),
  }),
  /**
   * A JOB WITH NO BOOKING IS ON THE CARD DURING A BOOKING (point 4 in report peyJSnLoz_Bk). The holder
   * is told once for each such process, from the watcher's reading, and the owner too when it leaves no room. `whose` is the holder's name,
   * or null when the reader holds the booking. Whether the booked memory still fits decides which line it is.
   */
  aJobWithoutABookingSharesTheCard: (job: string, whose: string | null, booking: string, toAPerson: boolean): SystemLine => ({
    line: 'A job with no booking shares the GPU',
    said:
      `${job} is on the card with no booking, during ${whose === null ? 'your' : `${whose}'s`} GPU booking` +
      `${toAPerson ? '' : ` ${booking}`}. The booked memory still fits beside it, so nothing has to change.` +
      (toAPerson ? ' It is on the Resources page.' : ''),
  }),
  aJobWithoutABookingLeavesNoRoom: (job: string, whose: string | null, booking: string, bookedGiB: number, roomGiB: number, toAPerson: boolean): SystemLine => ({
    line: 'A job with no booking leaves no room on the GPU',
    said:
      `${job} is on the card with no booking, during ${whose === null ? 'your' : `${whose}'s`} GPU booking` +
      `${toAPerson ? '' : ` ${booking}`}. With it there, the card has room for ${String(roomGiB)} GiB, and ${String(bookedGiB)} GiB is booked ` +
      'now. Nothing was stopped.' + (toAPerson ? ' It is on the Resources page.' : ''),
  }),
  aCounterFired: (title: string, because: string): SystemLine => ({
    line: `Counter ${title} fired`,
    said: `The counter "${title}" fired. ${because}`,
  }),
  /**
   * TO AN AGENT THE PERSON HAS JUST MADE A PERMANENT RESIDENT: when the person approves a
   * promotion, the office reminds that a picture and a name be chosen. The person is reminded by a row of GET /api/waiting;
   * the agent is told here, once, with the door it may use itself. An agent may change its own picture, and it proposes
   * a new name at the renames door, where the name takes effect when its approver approves it (item 42 of wave 13s,
   * src/server/lib/agent-renames.ts). `agentId` is its registry id, which the doors take.
   */
  youAreAPermanentResident: (name: string, agentId: string): SystemLine => ({
    line: 'You are a permanent resident',
    said:
      `The person made you, ${name}, a permanent resident. You may choose your own picture with POST ` +
      `/api/participants/agent/${agentId}/avatar. To propose a new name, send POST /api/participants/agent/${agentId}/renames ` +
      'with the name and your reason. The name changes when your approver approves it. ' +
      `When the picture and the name are chosen, say so with POST /api/residents/${agentId}/named; until ` +
      'then the person is reminded to choose them.',
  }),
  /**
   * TO A SECRETARY WHOSE SLEEP TIME HAS BEGUN. Each secretary sets its own
   * sleep time, an agent tidies at its sleep, and a long checklist is a signal, never a gate. This is
   * the office's one message as it begins the sleep, from src/server/lib/sleep-windows.ts. It names the three things to
   * put in order by the doors that write them, asks it to tidy, and names each of its checklists with more than
   * OPEN_ITEMS_WORTH_A_LOOK open items as a thing to look at; nothing is refused or held for one. It gives no path on the
   * person's machine: the memory folder is named inside the resident's own space, by the door. `crowded` is read by
   * `openItemsByChecklistOf` in lib/checklists.ts, and `wakesAt` is when the office ends the sleep.
   */
  yourSleepTimeHasBegun: (
    handle: string,
    agentId: string,
    wakesAt: string,
    zone: string,
    crowded: readonly { id: string; title: string; open: number }[],
  ): SystemLine => ({
    line: 'Your sleep time has begun',
    said:
      `Your sleep time has begun, ${handle}. Before you sleep, bring three things up to date, so your next session ` +
      'starts from them. ' +
      `1. Your memory file: write what you must keep with PUT /api/residents/${agentId}/space/file?path=${MEMORY_FOLDER}<file name> ` +
      'and {text}. ' +
      `2. Your secretary notes: add an entry with POST /api/agents/${handle}/notebook/entries and {entryKind, text}, ` +
      `or correct one of yours with PATCH /api/agents/${handle}/notebook/entries/<entry id>. ` +
      `3. Your handover document: write where your work stands with PUT /api/agents/${agentId}/handover and {text}. ` +
      'Then tidy. Close each item that cannot be done: mark it "superseded" with the later message that replaced it, ' +
      'or "waiting on the owner" when only the person can settle it. File away each item that is done: mark it "done" ' +
      'with its evidence. Both are PATCH /api/checklists/<checklist id>/items/<item id>. Update your progress cards: ' +
      "each direction's depth, next step and evidence, with PATCH /api/records/<direction id>. Check each direction " +
      'against the purpose it serves, which is its why_it_matters field. Shelve a direction that no longer serves it. ' +
      (crowded.length === 0
        ? `No checklist of yours has more than ${String(OPEN_ITEMS_WORTH_A_LOOK)} open items. `
        : `${crowded.length === 1 ? 'This checklist of yours has' : 'These checklists of yours have'} more than ` +
          `${String(OPEN_ITEMS_WORTH_A_LOOK)} open items, which is a thing to look at: ` +
          crowded.map((one) => `"${one.title}" (${one.id}, ${String(one.open)} open)`).join('; ') +
          '. Nothing is refused or held for it. ') +
      `Until ${wakesAt} on the office's clock (${zone}), only urgent messages and this one are handed to you. ` +
      'Every other message waits until you wake. If you are in work that cannot stop now, postpone this sleep with ' +
      `POST /api/residents/${agentId}/sleep/postpone and {because}. That ends the sleep now. It is shown on your agent ` +
      'page and sent to nobody.',
  }),
  /**
   * TO THE APPROVER OF A NEW NAME FOR AN AGENT, once, when the proposal starts to wait (item 42 of wave 13s). The approver
   * is the first secretary up the agent's chain of starters, or the person. lib/agent-renames.ts writes it in the same
   * transaction as the proposal.
   *
   * TO A PERSON, THE PRESS AND WHERE IT IS: the agent's page, with a lead to it filed beside the line. The press's names
   * are read from the words the page draws them with, so a button renamed there is renamed here. The line names no door,
   * command or id (chapter 10 rule 4). A secretary's line names the two doors, with the rename's id.
   */
  aKnowledgeChangeWaits: (id: string, reason: string): SystemLine => ({ line: KNOWLEDGE_WORDS.offer, said: KNOWLEDGE_WORDS.offerDetails(id, reason) }),
  aKnowledgeRatingIsLow: (title: string, average: number, count: number, id: string): SystemLine => ({ line: KNOWLEDGE_WORDS.lowNotice(title, average, count, id), said: null }),
  aRenameWaitsForYou: (rename: string, oldName: string, newName: string, proposer: string, because: string, toAPerson: boolean): SystemLine => ({
    line: `A new name for ${oldName} waits for you`,
    said: toAPerson
      ? `${proposer} proposes the new name "${newName}" for ${oldName}. The reason given: ${because} Press ` +
        `"${sayInEnglish('agentRenames.approve')}" or "${sayInEnglish('agentRenames.refuse')}" on the page of ${oldName}, ` +
        'and give your reason. Until you answer, the name stays as it is.'
      : `${proposer} proposes the new name "${newName}" for ${oldName}. The reason given: ${because} You are its ` +
        `approver. Approve with POST /api/renames/${rename}/approve, or refuse with POST /api/renames/${rename}/refuse, ` +
        'each with {"because": "your reason"}. Until you answer, the name stays as it is.',
  }),
  /**
   * WHO ANSWERS FOR AN AGENT CHANGED, by the person's press on the agent's page (lib/agent-starter.ts, wave 13u round
   * 186). Told once to the agent, to its new starter and to its old one, each that is a live agent. `told` says which
   * of the three reads it. `runsGoingOn` is how many of the agent's runs had not ended, which the person changed it
   * through at once. `from` is null where nobody recorded a starter before.
   */
  theOwnerOfAnAgentChanged: (
    agent: string, from: string | null, to: string, actor: string, because: string, grant: boolean,
  ): SystemLine => ({
    line: `The owner of ${agent} changed`,
    said: `${actor} handed ${agent} from ${from ?? 'no recorded owner'} to ${to}${grant ? " under the person's grant" : ''}. Reason: ${because}`,
  }),
  theStarterOfAnAgentChanged: (
    agent: string,
    from: string | null,
    to: string,
    because: string,
    told: 'the agent' | 'the new starter' | 'the old starter',
    runsGoingOn: number,
  ): SystemLine => {
    const atOnce =
      runsGoingOn === 0
        ? ''
        : ` ${runsGoingOn === 1 ? 'A run' : `${runsGoingOn} runs`} of ${told === 'the agent' ? 'yours' : agent} had not ended, ` +
          `and the person made the change at once, so a round going on reports to ${told === 'the new starter' ? 'you' : to} now.`
    if (told === 'the agent') {
      return {
        line: 'Who answers for you changed',
        said:
          `The person made ${to} your starter${from === null ? '' : ` in place of ${from}`}. The reason given: ${because} ` +
          `From now on ${to} may give you keys, gets your seal notices and the letters that go up the chain from you, and ` +
          `may ask for your next round.${atOnce}`,
      }
    }
    if (told === 'the new starter') {
      return {
        line: `You answer for ${agent} now`,
        said:
          `The person made you the starter of ${agent}${from === null ? '' : ` in place of ${from}`}. The reason given: ` +
          `${because} From now on you may give ${agent} keys, you get its seal notices and the letters that go up the ` +
          `chain from it, and you may ask for its next round.${atOnce}`,
      }
    }
    return {
      line: `You no longer answer for ${agent}`,
      said:
        `The person made ${to} the starter of ${agent} in place of you. The reason given: ${because} Its seal notices ` +
        `and the letters that go up the chain from it go to ${to} now. A new-key grant you made for it stays yours to ` +
        `withdraw.${atOnce}`,
    }
  },
  /**
   * WRITTEN INTO THE SECRETARIAT GROUP WHEN THE OFFICE FOLDS THE OLD DEAD-LETTER LINES UNDER ONE LINE.
   * scripts/fold-the-old-dead-letter-lines.ts writes it, delivered to nobody, and each folded line keeps
   * its record with `foldedInto` naming this one. The group draws this line and opens the folded ones
   * under it.
   *
   * THE SENTENCE SAYS HOW MANY LINES, FROM WHEN TO WHEN, EACH ADDRESSEE WITH ITS COUNT, AND WHEN THIS
   * LINE WAS WRITTEN. `whatTheFoldHolds` in shared/dead-letter-lines.ts reads those facts off the
   * folded lines, and `theWordsOfTheFold` there says them: here in English for the stored line, and on
   * the page in the page's language.
   */
  oldDeadLetterLinesFolded: (fold: WhatTheFoldSays): SystemLine => theWordsOfTheFold(sayInEnglish, fold),
  /**
   * WHERE A NOTE WRITTEN DOWN FOR THE PERSON STANDS, to whoever wrote it down. lib/the-persons-own-words.ts
   * sends it when the note starts to wait on the person's page, and once more when the person confirms it or says it is
   * not what they said. `filedAs` is the person's own note, written by their press on Confirm.
   *
   * A SECRETARY'S PRESS UNDER THE PERSON'S GRANT IS SAID AS THE SECRETARY'S, by the name `by` gives, and never as the
   * person's: the note it files is the secretary's, and its mark is the secretary's (wave 13s round 68).
   */
  aNoteForThePerson: (note: string, title: string, stands: NoteForThePersonStands): SystemLine =>
    stands.is === 'waits'
      ? {
          line: 'Your note waits for the person',
          said: `Your note ${note} ("${title}") waits for the person to confirm, on the page "${sayInEnglish('nav.yourWords')}".`,
        }
      : stands.is === 'confirmed'
        ? {
            line: 'The person confirmed your note',
            said: `The person confirmed your note ${note} ("${title}"). Their words are stored as their own note ${stands.filedAs}.`,
          }
        : stands.is === 'filedUnderTheGrant'
          ? {
              line: "A secretary filed your note under the person's grant",
              said:
                `The secretary "${stands.by}" filed your note ${note} ("${title}") under the person's grant, as the note ` +
                `${stands.filedAs}. That note is the secretary's, and not the person's own words.`,
            }
          : stands.is === 'notWhatTheySaidUnderTheGrant'
            ? {
                line: "A secretary said under the person's grant that your note is not what they said",
                said:
                  `The secretary "${stands.by}" said under the person's grant that your note ${note} ("${title}") is not ` +
                  'what the person said. Your note is kept with that mark, and nothing was stored as the person\'s words.',
              }
            : {
                line: 'The person said your note is not what they said',
                said:
                  `The person said your note ${note} ("${title}") is not what they said. Your note is kept with that mark, ` +
                  'and nothing was stored as their words.',
              },
} as const

/** Where a note written down for the person stands, as `aNoteForThePerson` above says it. `by` is the secretary's name. */
export type NoteForThePersonStands =
  | { is: 'waits' }
  | { is: 'confirmed'; filedAs: string }
  | { is: 'notWhatTheySaid' }
  | { is: 'filedUnderTheGrant'; filedAs: string; by: string }
  | { is: 'notWhatTheySaidUnderTheGrant'; by: string }

/** The kind of a line Mole Office writes: its name in `SYSTEM_LINES`. */
export type SystemLineKind = keyof typeof THE_LINES

/** A line Mole Office writes, with its kind. The writers in src/server/lib/groups.ts take only this. */
export type AnOfficeLine = SystemLine & { notice: SystemLineKind }

type WithItsKind<V> = V extends (...args: infer A) => SystemLine ? (...args: A) => AnOfficeLine : AnOfficeLine

/** Every line Mole Office itself writes, each made with its kind (`notice`) set to its own name. */
export const SYSTEM_LINES: { readonly [K in SystemLineKind]: WithItsKind<(typeof THE_LINES)[K]> } = Object.fromEntries(
  Object.entries(THE_LINES).map(([kind, made]) => [
    kind,
    typeof made === 'function'
      ? // THE WRAPPER KEEPS THE LENGTH OF THE LINE IT WRAPS. scripts/shorten-the-system-lines-written-before-m34.ts
        // passes a line as many stand-in values as its `length` says, and a bare rest wrapper says 0.
        Object.defineProperty(
          (...args: unknown[]): AnOfficeLine => ({ ...(made as (...a: unknown[]) => SystemLine)(...args), notice: kind as SystemLineKind }),
          'length',
          { value: made.length },
        )
      : { ...made, notice: kind as SystemLineKind },
  ]),
) as never

/** Every kind of line Mole Office writes, for the test that each has a row in the table of notices. */
export const SYSTEM_LINE_KINDS: readonly SystemLineKind[] = Object.keys(THE_LINES) as SystemLineKind[]

/**
 * THE LINES THAT TELL THE PERSON ABOUT A CHANGE TO A CHECKLIST, and the only place the page learns
 * which lines wrap on a phone, as two decisions ask.
 *
 * EACH OF THESE CARRIES NO HOVER SENTENCE (`said` is null), so a line cut with an ellipsis on a
 * phone would lose the item's name and there would be nothing behind it to read. That is why these
 * five wrap whole, with no line clamp, while every other system line keeps its one-line fold.
 *
 * NOTHING DECIDES THIS FROM A BODY'S WORDS. A page asks this set with the line's stored kind, so a
 * line reworded tomorrow wraps exactly as it does today.
 */
export const THE_CHECKLIST_LINES: ReadonlySet<SystemLineKind> = new Set([
  'addedToYourChecklist',
  'changedOnYourChecklist',
  'markedDoneOnAChecklist',
  'removedFromYourChecklist',
  'aChecklistWasMadeForYou',
])

/** The title on a message that is a system line, so the board has words for it. */
export const SYSTEM_LINE_TITLE = 'Mole Office'

// ============================================================================ the words a screen draws

/** Every sentence a screen says about groups, written here and not in a component. */
export const GROUP_WORDS = {
  get "heading"() { return readStoredWord("chat.group.heading") },
  get "none"() { return readStoredWord("chat.group.none") },
  get "nothingSaid"() { return readStoredWord("chat.group.nothingSaid") },
  get "leave"() { return readStoredWord("chat.group.leave") },
  get "systemLineIs"() { return readStoredWord("chat.group.systemLineIs") },
  get "readingSomebodyElses"() { return readStoredWord("chat.group.readingSomebodyElses") },
  memberCount: (count: number): string => readStoredWord("chat.group.memberCount", { n: count }),
  fromGroup: (name: string): string => readStoredWord("chat.group.fromGroup", { name }),
  asSide: (name: string): string => readStoredWord('chat.asSide', { name }),
  memberJoined: (name: string, because: string): SystemLine => ({ line: readStoredWord('chat.group.memberJoined', { name }), said: because }),
} as const

// ============================================================== where each group sits in the tab

/**
 * The three facts the chat's groups list needs to place a group: its id, whether it is pinned, and
 * who opened it.
 */
export interface AGroupThatKnowsItsPlace {
  id: string
  pinned: boolean
  openedBy: ParticipantRef
}

/**
 * TRUE WHEN MOLE OFFICE OPENED THIS GROUP BY ITSELF, and no person or agent asked for it.
 *
 * The office opens a group by itself when two agents claim the same path or share a work area
 * (`openTheGroupOnce` in src/server/lib/claims.ts), and it writes itself as the opener. A group a
 * person or an agent opens through POST /api/groups, or an inspector opens for a refused release,
 * has that caller as its opener. So the opener is the one fact that tells the two apart.
 *
 * WHY THE OPENER AND NOT THE NAME OR `about`. A name can be retyped by anybody, so it proves
 * nothing. `about` is a key each kind of group spells its own way: an overlap key starts with the
 * two claimants, a work-area key starts with `work-area|`, so a pattern here would have to list
 * every spelling and would miss the next kind of group the office opens.
 * The opener is checked with `isMoleOffice`, which reads the current registry id every system line is
 * written under. The Secretariat group is also opened by the office; the caller places pinned
 * groups first, so this function does not have to know about it.
 */
export function theOfficeOpenedIt(group: { openedBy: ParticipantRef }): boolean {
  return isMoleOffice(group.openedBy)
}

/**
 * WHERE EACH GROUP SITS IN THE CHAT'S GROUPS TAB. Criterion SC1, amended 24 September 2026
 * and widened the same day. The pinned list holds
 * the office's standing group. The `yours` list holds every other group the reader is a member of
 * that a person or an agent opened. The `folded` list holds the rest: every group the reader is not
 * a member of, and every group the office opened by itself (`theOfficeOpenedIt`), whether or not
 * the reader is in it and whether or not it holds unread messages.
 *
 * THE ORDER IS KEPT AND EVERY GROUP IS IN EXACTLY ONE LIST. A pinned group is placed first whatever
 * `yours` or its opener says, so the office's standing group can never also appear below. The
 * caller decides what each list looks like; this only sorts them, once, so the three sections
 * cannot disagree about which group belongs to which.
 */
export function whereEachGroupSits<G extends AGroupThatKnowsItsPlace>(
  groups: readonly G[],
  yours: readonly string[],
): { pinned: G[]; yours: G[]; folded: G[] } {
  const mine = new Set(yours)
  const pinned: G[] = []
  const theirs: G[] = []
  const folded: G[] = []
  for (const group of groups) {
    if (group.pinned) pinned.push(group)
    else if (mine.has(group.id) && !theOfficeOpenedIt(group)) theirs.push(group)
    else folded.push(group)
  }
  return { pinned, yours: theirs, folded }
}
