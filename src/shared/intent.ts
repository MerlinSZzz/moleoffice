// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT MOLE OFFICE MADE OF SOMEBODY'S WORDS: THE WORDS IT MAY USE, AND THE SHAPE IT HAS TO ANSWER IN.
 *
 * ---------------------------------------------------------------------------------------
 * TWO LEVELS, AND THE LOWER ONE IS NEVER OVERWRITTEN
 * ---------------------------------------------------------------------------------------
 *
 *     what the person said        immutable once sent. Always recoverable. This is the record.
 *     what Mole Office made of it      visible beside it, editable, refusable, never a replacement.
 *
 * Nothing in this file touches the first level. It describes the second one: the words a reading is
 * allowed to use, the shape a reading has to arrive in, and the check that refuses one which cannot
 * be traced back to the comments it came from.
 *
 * ---------------------------------------------------------------------------------------
 * TWO DIMENSIONS, NOT ONE ENUM
 * ---------------------------------------------------------------------------------------
 *
 * What somebody wants to HAPPEN is a different question from what durable thing should EXIST
 * afterwards, and one comment can carry several of each.
 *
 *     "Check whether this number is wrong. If it is, propose a Problem, and we should probably
 *      automate this check next round."
 *
 * That is two things they want to happen — verify, and change — and two things that could exist
 * afterwards — a problem, and a task. Forcing it into one word loses half of it, so a reading names
 * a LIST on each dimension and the two lists are separate.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE READS ANYBODY'S WORDS
 * ---------------------------------------------------------------------------------------
 *
 * There is no parser in this file and there must not be one. A mechanical guess dressed as an
 * interpretation is worse than no interpretation, because a person cannot tell it from one that was
 * actually made. Something outside Mole Office reads the words; this file says which words that answer
 * may use, and refuses an answer that uses any others.
 */

import type { RecordKind } from './types.ts'

// ============================================================================ what they want to happen

/** One word for what somebody wants to happen, and what it means. */
export interface CommunicationIntent {
  word: string
  /** What it means, in one sentence, for a person choosing between two of these. */
  means: string
}

/**
 * WHAT SOMEBODY WANTS TO HAPPEN. Nine words, and a reading may use no others.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `start` IS HERE WHEN THE DESIGN LISTED EIGHT WITHOUT IT
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office already stores a word for this question. `MESSAGE_INTENTS`, declared below, is what a
 * person picks when they send a comment to an agent — ask, discuss, review, change, start — and it
 * is validated on write and stored on `agent_messages.intent`.
 *
 * That is the same question this dimension asks, answered by the person instead of by a reading. So
 * the two lists must not be two vocabularies: this one CONTAINS that one, and
 * tests/interpreter-vocabulary.test.ts goes red when it stops containing it. Dropping `start` would
 * have made a word Mole Office already stores unsayable by a reading of the same fact, which is the
 * defect this repository keeps producing wearing a different hat.
 */
export const COMMUNICATION_INTENTS = [
  { word: 'ask', means: 'they want an answer to a question.' },
  { word: 'explain', means: 'they are telling somebody something and want it understood.' },
  { word: 'discuss', means: 'they want to talk it over, and no single answer is expected.' },
  { word: 'review', means: 'they want somebody to look at something and say what they think of it.' },
  { word: 'investigate', means: 'they want somebody to go and find something out.' },
  { word: 'change', means: 'they want something altered.' },
  { word: 'start', means: 'they want work that is not going on yet to begin.' },
  { word: 'continue', means: 'they want work already going on to carry on.' },
  { word: 'verify', means: 'they want a claim checked against evidence.' },
] as const satisfies readonly CommunicationIntent[]

/** The words on their own, which is what a reading is checked against. */
export const INTENT_WORDS: readonly string[] = COMMUNICATION_INTENTS.map((one) => one.word)

/**
 * WHAT A PERSON PICKS when they send a comment to an agent. Five words, and the column takes no
 * others: it is validated on write and stored on `agent_messages.intent`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT SITS BESIDE THE LIST ABOVE AND NOT IN src/server/lib/agents.ts, WHERE IT USED TO
 * ---------------------------------------------------------------------------------------
 *
 * Two reasons, and the second is the one that made it move.
 *
 * THE TWO LISTS ANSWER ONE QUESTION. `COMMUNICATION_INTENTS` above is what a reading may say
 * somebody wants to happen; this is what the person says themselves. So one has to contain the
 * other, and `tests/interpreter-vocabulary.test.ts` goes red when it stops doing so. Two files
 * would have let a reader see one list and not the other.
 *
 * A TEST THAT WANTED THIS WORD OPENED THE OPERATOR'S REAL DATABASE. src/server/lib/agents.ts
 * reaches src/server/db/client.ts, and an import is evaluated before any test body runs, so naming
 * that file for a constant opened whatever `.env` points at with permission to write to it —
 * before `freshDb()` could point it anywhere else. This file opens nothing. Same fix, and the same
 * reason, as the three lists agents.ts already re-exports from src/shared/types.ts.
 *
 * It is still exported under the same name from src/server/lib/agents.ts, so nothing that imported
 * it from there had to change.
 */
export const MESSAGE_INTENTS = ['ask', 'discuss', 'review', 'change', 'start'] as const
export type MessageIntent = (typeof MESSAGE_INTENTS)[number]

// ============================================================================ what could exist afterwards

/** One kind of durable thing a reading may say should exist, and what Mole Office may do about it. */
export interface Artefact {
  word: string
  means: string
  /**
   * The kind of record somebody would file this as, or null when there is nothing to file.
   *
   * IT IS WHAT A PERSON WOULD FILE, NOT WHAT MOLE OFFICE FILES. Nothing in this pass writes a record
   * from a reading at all; naming the kind is how the reading says what it thinks the words are
   * asking for, in the product's own vocabulary rather than in a word of its own.
   */
  filedAs: RecordKind | null
  /** The kind Mole Office may never write from a reading, and why. Null when there is no such rule. */
  refused: { kind: RecordKind; why: string } | null
}

/**
 * WHAT COULD EXIST AFTERWARDS. Seven words, and a reading may use no others.
 *
 * ---------------------------------------------------------------------------------------
 * NAMING A DECISION IS NOT TAKING ONE
 * ---------------------------------------------------------------------------------------
 *
 * A reading may say *this looks like a decision somebody has to make*. It may never write the
 * decision. `decision` is the one human-only kind in this product — an agent asking for one is
 * answered 403 by `assertMayWrite` in src/server/lib/records/may-write.ts — and this dimension goes through
 * that gate rather than around it.
 *
 * What may be filed instead is the FORK: a `proposal`, holding the question and the options with
 * what each one costs. That is the existing route for an agent that reached a choice it may not
 * make, and it is why `filedAs` on this row says `proposal` while `refused` names `decision`.
 */
export const ARTEFACTS = [
  { word: 'task', means: 'work somebody has to do.', filedAs: 'task', refused: null },
  { word: 'problem', means: 'something is wrong and it is not fixed.', filedAs: 'problem', refused: null },
  { word: 'idea', means: 'something worth trying that nobody has tried.', filedAs: 'idea', refused: null },
  {
    word: 'decision',
    means: 'a choice somebody has to make, which is not the same thing as a choice that was made.',
    filedAs: 'proposal',
    refused: {
      kind: 'decision',
      why:
        'only a person may write a decision, and a reading of a comment\'s words may not take one on its ' +
        'writer\'s behalf. What may be filed is the question itself, as a proposal: the fork, the options, and what each ' +
        'one costs.',
    },
  },
  { word: 'finding', means: 'something that was measured or observed.', filedAs: 'claim', refused: null },
  { word: 'note', means: 'writing worth keeping that is none of the above.', filedAs: 'note', refused: null },
  {
    word: 'nothing',
    means: 'no durable thing should exist afterwards. Saying this is different from saying nothing at all.',
    filedAs: null,
    refused: null,
  },
] as const satisfies readonly Artefact[]

/** The words on their own, which is what a reading is checked against. */
export const ARTEFACT_WORDS: readonly string[] = ARTEFACTS.map((one) => one.word)

/**
 * The declaration for one word, or undefined when nothing declares it.
 *
 * A FUNCTION AND NOT A LIST OF EXCEPTIONS, so a caller asks the declaration — is this one Mole Office
 * may write, and what would it be filed as — rather than restating which words are special. Today
 * one word carries a refusal.
 */
export function artefactNamed(word: string): Artefact | undefined {
  return ARTEFACTS.find((one) => one.word === word)
}

/**
 * THE ONE SENTENCE SAYING A THING IS THE PERSON'S TO WRITE. Written into a reading, and read back
 * out of one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A FUNCTION AND NOT A STRING WRITTEN WHERE IT IS USED
 * ---------------------------------------------------------------------------------------
 *
 * `keptSentence` below writes this into the sentence kept beside a comment, and Send reads it back
 * out of that sentence to decide that the comment is not an agent's to act on — see
 * `whatOnlyAPersonMayWrite`. Those are the same fact worked out in two places, which is the defect
 * CLAUDE.md names as this repository's own, so they are ONE function: the writer calls it, and the
 * reader looks for exactly what it produced.
 *
 * WHAT IS STORED IS A SENTENCE AND NOT A LIST. `annotation.interpretation` is one string — it is
 * the only place in this database built to hold a reading beside somebody's words — so the two
 * dimensions of a reading are said in prose there and the words themselves are not kept as data.
 * That is stated in `keptSentence` and it is the reason this reader exists at all.
 */
export function onlyAPersonMayWriteIt(artefact: Artefact): string {
  if (artefact.refused === null) return ''
  return (
    `Mole Office never writes a ${artefact.refused.kind}, so nothing here has taken one` +
    (artefact.filedAs === null ? '.' : `; the question itself could be filed as a ${artefact.filedAs}.`)
  )
}

/**
 * WHICH THINGS ONLY A PERSON MAY WRITE THIS READING NAMES. Empty means it names none.
 *
 * IT READS THE SENTENCE MOLE OFFICE KEPT, and that has one consequence worth stating: the sentence can
 * be edited by hand, in the same field, by anybody who can patch the comment. A person who takes
 * this line out of a reading is saying the comment is not a decision, and Mole Office believes them —
 * the reading is a claim about their words and it has always been theirs to correct.
 */
export function whatOnlyAPersonMayWrite(reading: string): Artefact[] {
  return ARTEFACTS.filter((one) => one.refused !== null && reading.includes(onlyAPersonMayWriteIt(one)))
}

// ============================================================================ the shape of a reading

/** What Mole Office made of ONE comment. Every field is a claim about somebody else's words. */
export interface OrganisedComment {
  /** WHICH COMMENT THIS IS ABOUT. It must be one of the comments that were handed over. */
  commentId: string
  /** The reading itself, in a sentence or two, in plain language. */
  reading: string
  /**
   * What they want to happen. May be empty, and empty means Mole Office did not say — which is a
   * different answer from any of the nine words and must not read the same.
   */
  intents: string[]
  /**
   * What could exist afterwards. May be empty, and empty means Mole Office did not say; `nothing` means
   * Mole Office looked and there is nothing to file. Those are two different answers.
   */
  artefacts: string[]
  /**
   * Who this seems to be for, in words. A HINT AND NOT A DECISION: nothing routes anything from it,
   * and it is not the person's own `recipientHint`, which stays exactly as they wrote it.
   */
  recipient?: string
}

/** Something true of SEVERAL comments at once: the same complaint twice, one cause behind three. */
export interface OrganisedGroup {
  /** What is true of them, in one sentence. */
  says: string
  /** Which comments. Two at least — one comment is not a group. */
  commentIds: string[]
}

/** What Mole Office made of a whole collected set of comments. */
export interface Organised {
  comments: OrganisedComment[]
  groups: OrganisedGroup[]
}

// ============================================================================ checking one

/** The comments a reading was made from: the ones handed over, and the ones that could not be. */
export interface WhatWasHandedOver {
  /** The comments whose words were handed to the interpreter. A reading must name every one. */
  ids: readonly string[]
  /** Comments in the review whose words could not be read, so nothing was handed over for them. */
  unreadable: readonly string[]
  /**
   * The comments of `ids` the caller may not read. The check still asks for a
   * reading of every one of `ids`. A refusal names none of these and does not count them.
   */
  hidden: readonly string[]
}

export type ReadingCheck = { organised: Organised } | { problem: string }

/**
 * THE COMMENTS A REFUSAL NAMES, TO A CALLER WHO MAY NOT READ EVERY ONE OF THEM.
 *
 * A refusal answers whoever sent the request, so it names only the comments of `ids` the caller may
 * read. It says that the others are not named, and it does not count them. Use it only when at least
 * one of `ids` is in `hidden`; when none is, the refusal names every comment as it always did.
 */
export function theCommentsYouMayRead(ids: readonly string[], hidden: ReadonlySet<string>): string {
  const named = ids.filter((id) => !hidden.has(id))
  return named.length === 0
    ? 'You may read none of the comments in this review, so none is named here.'
    : `The comments in this review that you may read are: ${named.join(', ')}. Comments you may not read are not named here.`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Unknown keys, named. An answer with a key nobody declared is refused rather than half-read. */
function strayKeys(held: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(held).filter((key) => !allowed.includes(key))
}

function listOfWords(held: unknown, allowed: readonly string[], what: string, where: string): string[] | string {
  if (!Array.isArray(held)) {
    return `${where} sends \`${what}\` as ${held === undefined ? 'nothing at all' : 'something that is not a list'}. It is a list, and an empty list is how a reading says it did not work this out.`
  }
  const words: string[] = []
  for (const one of held) {
    if (typeof one !== 'string') return `${where} has something in \`${what}\` that is not a word.`
    if (!allowed.includes(one)) {
      return `${where} says \`${one}\` in \`${what}\`, and that is not one of the words a reading may use. They are: ${allowed.join(', ')}.`
    }
    if (words.includes(one)) return `${where} says \`${one}\` twice in \`${what}\`.`
    words.push(one)
  }
  return words
}

/**
 * IS THIS A READING OF THESE COMMENTS? The whole check, in one pure function.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES, AND WHY EACH ONE MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * A COMMENT THAT WAS NOT HANDED OVER. A reading about words nobody gave it is not a reading of this
 * review; it is a claim about something else wearing this review's name.
 *
 * A COMMENT LEFT OUT. Every source comment reference is preserved, which is the whole point of the
 * phase: a reading that quietly drops one comment is a reading that lost somebody's words at the
 * one moment the product promises to keep them. An answer covering four of five is refused, and the
 * refusal names the fifth.
 *
 * THE SAME COMMENT TWICE. Two readings of one comment leaves nothing able to say which is the
 * reading.
 *
 * A WORD NOBODY DECLARED, on either dimension.
 *
 * `nothing` BESIDE SOMETHING. "No durable thing should exist, and also a task" is not an answer.
 *
 * A GROUP OF ONE. A group says something about several comments at once; one comment is what the
 * comment's own reading is for.
 *
 * A REFUSAL NAMES ONLY THE COMMENTS THE CALLER MAY READ. The check is against every comment in
 * `ids`. A refusal that lists comments leaves out those in `hidden`, and does not count them.
 */
export function checkOrganised(raw: unknown, handedOver: WhatWasHandedOver): ReadingCheck {
  const hidden = new Set(handedOver.hidden)
  const someAreHidden = handedOver.ids.some((id) => hidden.has(id))
  if (!isObject(raw)) {
    return { problem: 'A reading is an object with `comments` and `groups` in it, and this is not an object.' }
  }
  const stray = strayKeys(raw, ['comments', 'groups'])
  if (stray.length > 0) {
    return {
      problem: `A reading holds \`comments\` and \`groups\` and nothing else. This one also holds: ${stray.join(', ')}. Nothing has been stored, because Mole Office cannot say what those were meant to mean.`,
    }
  }
  if (!Array.isArray(raw['comments'])) {
    return { problem: 'A reading sends `comments` as a list, one entry per comment it was given. This one does not.' }
  }
  if (!Array.isArray(raw['groups'])) {
    return {
      problem:
        'A reading sends `groups` as a list of things that are true of several comments at once. Send an empty list when there are none — an empty list says Mole Office found none, and a missing one says nothing at all.',
    }
  }

  const comments: OrganisedComment[] = []
  const seen: string[] = []
  for (const [at, entry] of (raw['comments'] as unknown[]).entries()) {
    const where = `Comment ${String(at + 1)} of the reading`
    if (!isObject(entry)) return { problem: `${where} is not an object.` }
    const entryStray = strayKeys(entry, ['commentId', 'reading', 'intents', 'artefacts', 'recipient'])
    if (entryStray.length > 0) {
      return {
        problem: `${where} holds keys nothing declares: ${entryStray.join(', ')}. A reading of one comment holds commentId, reading, intents, artefacts and — when there is one — recipient.`,
      }
    }
    const id = entry['commentId']
    if (typeof id !== 'string' || id === '') return { problem: `${where} does not say which comment it is about.` }
    if (handedOver.unreadable.includes(id)) {
      return {
        problem: `${where} is about ${id}, and the words of that comment could not be read, so they were never handed over. Nothing has been stored: a reading of words nobody supplied is not a reading.`,
      }
    }
    if (!handedOver.ids.includes(id)) {
      return {
        problem:
          `${where} is about ${id}, which is not one of the comments in this review. Nothing has been stored. ` +
          (someAreHidden
            ? theCommentsYouMayRead(handedOver.ids, hidden)
            : `The comments handed over were: ${handedOver.ids.join(', ')}.`),
      }
    }
    if (seen.includes(id)) return { problem: `${where} is a second reading of ${id}. One comment, one reading.` }
    seen.push(id)

    const reading = entry['reading']
    if (typeof reading !== 'string' || reading.trim() === '') {
      return {
        problem: `${where} says nothing. A reading with no words in it is not a reading, and an empty one stored beside somebody's comment would look like Mole Office had read it.`,
      }
    }
    const intents = listOfWords(entry['intents'], INTENT_WORDS, 'intents', where)
    if (typeof intents === 'string') return { problem: intents }
    const artefacts = listOfWords(entry['artefacts'], ARTEFACT_WORDS, 'artefacts', where)
    if (typeof artefacts === 'string') return { problem: artefacts }
    if (artefacts.includes('nothing') && artefacts.length > 1) {
      return {
        problem: `${where} says \`nothing\` should exist afterwards and also names ${artefacts.filter((w) => w !== 'nothing').join(', ')}. Those cannot both be true.`,
      }
    }
    const recipient = entry['recipient']
    if (recipient !== undefined && (typeof recipient !== 'string' || recipient.trim() === '')) {
      return {
        problem: `${where} sends a \`recipient\` with nothing in it. Leave it out when nobody in particular is meant — most comments are written before anybody has thought about who should read them.`,
      }
    }
    comments.push({
      commentId: id,
      reading: reading.trim(),
      intents,
      artefacts,
      ...(typeof recipient === 'string' ? { recipient: recipient.trim() } : {}),
    })
  }

  const left = handedOver.ids.filter((id) => !seen.includes(id))
  if (left.length > 0 && someAreHidden) {
    // NOT "COVERS n OF THE m": m would count the comments the caller may not read.
    const leftYouMayRead = left.filter((id) => !hidden.has(id))
    const leftHidden = left.some((id) => hidden.has(id))
    return {
      problem:
        (leftYouMayRead.length === 0
          ? ''
          : `This reading says nothing about ${leftYouMayRead.length === 1 ? 'one comment' : String(leftYouMayRead.length) + ' comments'} ` +
            `you may read: ${leftYouMayRead.join(', ')}. `) +
        (leftHidden
          ? `${leftYouMayRead.length === 0 ? 'This reading' : 'It also'} says nothing about one or more comments in this ` +
            `review that you may not read. They are not named or counted here. `
          : '') +
        `Nothing has been stored. Every comment gets a reading, or the ones left out are lost at the moment somebody is meant to be reading them.`,
    }
  }
  if (left.length > 0) {
    return {
      problem: `This reading covers ${String(seen.length)} of the ${String(handedOver.ids.length)} comments it was given and says nothing about ${left.length === 1 ? 'one of them' : String(left.length) + ' of them'}: ${left.join(', ')}. Nothing has been stored. Every comment gets a reading, or the ones left out are lost at the moment somebody is meant to be reading them.`,
    }
  }

  const groups: OrganisedGroup[] = []
  for (const [at, entry] of (raw['groups'] as unknown[]).entries()) {
    const where = `Group ${String(at + 1)} of the reading`
    if (!isObject(entry)) return { problem: `${where} is not an object.` }
    const entryStray = strayKeys(entry, ['says', 'commentIds'])
    if (entryStray.length > 0) {
      return { problem: `${where} holds keys nothing declares: ${entryStray.join(', ')}. A group says \`says\` and \`commentIds\`.` }
    }
    const says = entry['says']
    if (typeof says !== 'string' || says.trim() === '') {
      return { problem: `${where} does not say what is true of those comments.` }
    }
    const ids = entry['commentIds']
    if (!Array.isArray(ids)) return { problem: `${where} does not list which comments it is about.` }
    const named: string[] = []
    for (const one of ids) {
      if (typeof one !== 'string' || !handedOver.ids.includes(one)) {
        return { problem: `${where} names ${typeof one === 'string' ? one : 'something that is not a comment id'}, which is not one of the comments in this review.` }
      }
      if (named.includes(one)) return { problem: `${where} names ${one} twice.` }
      named.push(one)
    }
    if (named.length < 2) {
      return {
        problem: `${where} is about ${named.length === 1 ? 'one comment' : 'no comments'}. A group is what is true of SEVERAL comments at once; one comment's own reading is where anything about one comment goes.`,
      }
    }
    groups.push({ says: says.trim(), commentIds: named })
  }

  return { organised: { comments, groups } }
}

// ============================================================================ the sentence that is kept

/** A sentence ends with a stop, so two of them do not run together when they are joined. */
function stopped(sentence: string): string {
  const said = sentence.trim()
  return /[.!?]$/.test(said) ? said : `${said}.`
}

/** "ask", "ask and verify", "ask, verify and change". */
function joined(words: readonly string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1] as string}`
}

/**
 * WHAT IS KEPT BESIDE ONE COMMENT'S WORDS, in plain language.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TWO DIMENSIONS ARE WRITTEN INTO THE SENTENCE INSTEAD OF STORED AS LISTS
 * ---------------------------------------------------------------------------------------
 *
 * `annotation.interpretation` is a string and it is the only place in this database built to hold a
 * reading beside somebody's words. So the lists are said IN the sentence — "What they want: verify
 * and change" — rather than being dropped for want of a column. A reader gets both dimensions; a
 * later query does not, and that is stated in the reply rather than hidden.
 *
 * NOTHING IS EVER FILED BY THIS. When a reading names something that could exist afterwards, the
 * sentence says so and says that nothing was filed, because the difference between "this should
 * become a problem" and "a problem exists" is the whole of the gate.
 *
 * ---------------------------------------------------------------------------------------
 * IT SAYS NOTHING THAT IS TRUE OF ANYTHING BUT THIS ONE COMMENT
 * ---------------------------------------------------------------------------------------
 *
 * This sentence is stored in `annotation.interpretation`, which a person may rewrite — the reading
 * is a claim about their words and it has always been theirs to correct. So everything in it has to
 * be about the one comment they are looking at, or a correction to one comment silently changes
 * what Mole Office says about another. Two facts were in here and are not any more:
 *
 *   WHAT WAS SAID OF SEVERAL COMMENTS AT ONCE is stored once, on the review, and drawn by
 *   `saidWithOthers` below. It used to be appended here, once per member.
 *
 *   "Nobody has been chosen" used to follow the suggested recipient. Who a comment is going to is a
 *   stored decision a person makes afterwards — `annotation.chosenRecipient` — so a frozen sentence
 *   saying nobody had been chosen went stale the moment somebody chose, and the send list two
 *   inches away then said the opposite. The reading says who the words SEEM to be for and stops
 *   there; the routing surface says who was chosen.
 */
export function keptSentence(comment: OrganisedComment): string {
  const parts: string[] = [stopped(comment.reading)]

  parts.push(
    comment.intents.length === 0
      ? 'Mole Office did not work out what they want to happen.'
      : `What they want: ${joined(comment.intents)}.`,
  )

  if (comment.artefacts.length === 0) {
    parts.push('Mole Office did not work out what should exist afterwards.')
  } else if (comment.artefacts.length === 1 && comment.artefacts[0] === 'nothing') {
    parts.push('Nothing needs to exist afterwards.')
  } else {
    parts.push(`What could exist afterwards: ${joined(comment.artefacts)}. Nothing has been filed.`)
    // THE ONE WORD THAT CARRIES A REFUSAL SAYS SO IN ONE SHORT SENTENCE. The long reason is in the
    // declaration, where somebody deciding what the word means will read it; a person reading their
    // own comment needs the rule, not the argument for it.
    for (const word of comment.artefacts) {
      const artefact = artefactNamed(word)
      if (artefact === undefined || artefact.refused === null) continue
      // ONE WRITER AND ONE READER OF THIS SENTENCE. `whatOnlyAPersonMayWrite` above looks for
      // exactly what this produces, because Send has to be able to tell a comment asking for work
      // from a comment asking for a decision, and the sentence is what it has to read.
      parts.push(onlyAPersonMayWriteIt(artefact))
    }
  }

  if (comment.recipient !== undefined) {
    parts.push(`Seems to be for ${stopped(comment.recipient).replace(/\.$/, '')}.`)
  }

  return parts.join(' ')
}

/**
 * WHAT WAS SAID ABOUT THIS COMMENT AND OTHERS AT ONCE, one sentence per group naming it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT PART OF THE SENTENCE ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * A group is a claim about SEVERAL comments, and `keptSentence` writes a claim about ONE. Until 19
 * August 2026 the group's sentence was appended to every member's kept sentence, so a group of two
 * lived as two copies with nothing holding them together. `annotation.interpretation` is a person's
 * to correct — that is the whole point of the reading being visible — and correcting one member's
 * copy left the other member announcing a group whose only other member no longer said it was in
 * one. Measured on the isolated corpus with four comments and a group of two.
 *
 * SO THE GROUPS ARE STORED ONCE, on the review, in `reviews.read_groups`, and this composes the
 * sentence a reader sees from that one place. Editing one comment's reading cannot touch it, and
 * every member of a group says the same thing because there is one thing to say.
 *
 * IT IS WRITTEN HERE, BESIDE `keptSentence`, so the two sentences a person reads under one heading
 * are written in one file and in one voice.
 */
export function saidWithOthers(groups: readonly OrganisedGroup[], commentId: string): string[] {
  const said: string[] = []
  for (const group of groups) {
    if (!group.commentIds.includes(commentId)) continue
    const others = group.commentIds.length - 1
    said.push(`Said with ${String(others)} other comment${others === 1 ? '' : 's'}: ${stopped(group.says)}`)
  }
  return said
}

// ============================================================================ the pieces of an unsent instruction

/**
 * ONE PIECE OF SOMETHING SOMEBODY IS STILL WRITING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A SECOND SHAPE AND NOT `OrganisedComment`
 * ---------------------------------------------------------------------------------------
 *
 * `OrganisedComment` is about ONE WHOLE COMMENT that already exists on a review, and it names that
 * comment by its id. A piece is about A RUN OF CHARACTERS inside one thing nobody has sent yet, so
 * what identifies it is where it starts and where it stops. That is the only difference, and the
 * two vocabularies are the same two: `intents` holds words from `COMMUNICATION_INTENTS` and
 * `artefacts` holds words from `ARTEFACTS`. There is no tenth intent word and no eighth artefact
 * word here, and tests/interpreter-vocabulary.test.ts is what keeps it that way.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS A CLAIM MOLE OFFICE MAKES ABOUT WHAT THE WORDS MEAN
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office cannot read words. The functions below cut a person's own characters only at the places
 * the caller names, and every field that says what the
 * words MEAN starts empty and is filled in by the person. An empty `reading` means nobody has said,
 * which is a different answer from any sentence, and the screen draws it as an absence.
 */
export interface WrittenPiece {
  /** This piece's handle inside one organised reading. It is what the `actionId` of a target names. */
  id: string
  /** Where the piece starts in the person's own characters, counted from 0. */
  from: number
  /** Where it stops, so the characters are `body.slice(from, to)`. */
  to: number
  /**
   * THE PERSON'S OWN CHARACTERS, AS THEY WERE WHEN THE PIECE WAS CUT.
   *
   * It is evidence and it is never repaired. Editing the instruction after cutting it can leave
   * these words somewhere else, or take them out altogether, and `whereTheChangeIs` in
   * src/web/lib/drafts.ts answers which of the three happened — the same question, asked the same
   * way, for a change somebody made to their own instruction.
   */
  quote: string
  /** What the person says this piece is. Empty until they type one, and empty means nobody said. */
  reading: string
  /** What they want to happen: words from `COMMUNICATION_INTENTS`. Empty means nobody said. */
  intents: string[]
  /** What could exist afterwards: words from `ARTEFACTS`. Empty means nobody said. */
  artefacts: string[]
}

/** A run of characters, used for the parts of somebody's words that no piece covers. */
export interface CharacterRun {
  from: number
  to: number
}

/** Where the run between two offsets really begins and ends, or null when it is all whitespace. */
export function trimmed(body: string, from: number, to: number): CharacterRun | null {
  let start = from
  let stop = to
  while (start < stop && /\s/.test(body[start] ?? '')) start += 1
  while (stop > start && /\s/.test(body[stop - 1] ?? '')) stop -= 1
  return stop > start ? { from: start, to: stop } : null
}

/** One piece over a run of somebody's words, saying nothing about what they mean. */
export function aPiece(body: string, run: CharacterRun, id: string): WrittenPiece {
  return { id, from: run.from, to: run.to, quote: body.slice(run.from, run.to), reading: '', intents: [], artefacts: [] }
}

/** One run of somebody's words, as the left column draws it: which piece holds it, or none. */
export interface WrittenRun extends CharacterRun {
  /** The piece these characters belong to, or null when no piece covers them. */
  pieceId: string | null
  /** True when nothing covers these characters and a person can see them. */
  gap: boolean
}

/**
 * CUT WHAT SOMEBODY WROTE INTO THE RUNS THE SCREEN DRAWS, in order, covering every character.
 *
 * ONE WALK, AND EVERYTHING ABOUT COVERAGE IS READ OFF IT. The left column draws these runs and the
 * count of gaps is these runs filtered, so the marks a person sees and the number beside them
 * cannot disagree. Working the two out separately is the defect this repository keeps finding.
 *
 * EVERY CHARACTER IS IN EXACTLY ONE RUN, including the blank lines between paragraphs, so what the
 * column draws is the person's own text and not a rebuilt copy of it.
 */
export function runsOfWhatIsWritten(body: string, pieces: readonly WrittenPiece[]): WrittenRun[] {
  const inOrder = [...pieces].filter((one) => one.to > one.from).sort((a, b) => a.from - b.from)
  const out: WrittenRun[] = []
  const between = (from: number, to: number) => {
    if (to <= from) return
    out.push({ from, to, pieceId: null, gap: trimmed(body, from, to) !== null })
  }
  let at = 0
  for (const piece of inOrder) {
    if (piece.from < at) continue
    between(at, piece.from)
    out.push({ from: piece.from, to: piece.to, pieceId: piece.id, gap: false })
    at = piece.to
  }
  between(at, body.length)
  return out
}

/**
 * THE RUNS OF WHAT SOMEBODY WROTE THAT NO PIECE COVERS, which is what the count beside `Yours` says.
 *
 * COVERAGE IS DRAWN AND NEVER REFUSED. A reading that leaves half a message alone is a legitimate
 * reading — merging and summarising both do it — so Mole Office marks what is uncovered and counts it
 * instead of refusing to hold it. The count is what stops the mark being a state with no word.
 *
 * WHITESPACE IS NOT A GAP. The blank line between two paragraphs is covered by neither of them and
 * means nothing on its own, so counting it would report a gap in every message ever written.
 */
export function whatIsNotCovered(body: string, pieces: readonly WrittenPiece[]): CharacterRun[] {
  return runsOfWhatIsWritten(body, pieces)
    .filter((run) => run.gap)
    .map((run) => trimmed(body, run.from, run.to))
    .filter((run): run is CharacterRun => run !== null)
}

/**
 * MAKE A PIECE OVER A RUN OF CHARACTERS, taking that run out of whatever held it.
 *
 * ONE CHARACTER IS IN AT MOST ONE PIECE. Two pieces over the same words would be two claims about
 * one run with nothing saying which is meant, and the count of what is covered could not be worked
 * out at all. So a piece that overlaps the new run is cut back, and a piece left holding nothing is
 * gone — which is visible the moment it happens, because every anchor is drawn.
 *
 * Null when the run holds no character a person can see, which is what a selection of spaces is.
 */
export function pieceOverTheseCharacters(
  body: string,
  from: number,
  to: number,
  pieces: readonly WrittenPiece[],
  mintId: () => string,
): WrittenPiece[] | null {
  const held = trimmed(body, Math.max(0, Math.min(from, to)), Math.min(body.length, Math.max(from, to)))
  if (held === null) return null
  const kept: WrittenPiece[] = []
  for (const piece of pieces) {
    if (piece.to <= held.from || piece.from >= held.to) {
      kept.push(piece)
      continue
    }
    const before = trimmed(body, piece.from, Math.min(piece.to, held.from))
    const after = trimmed(body, Math.max(piece.from, held.to), piece.to)
    if (before !== null) kept.push({ ...piece, from: before.from, to: before.to, quote: body.slice(before.from, before.to) })
    if (after !== null) {
      kept.push(
        before === null
          ? { ...piece, from: after.from, to: after.to, quote: body.slice(after.from, after.to) }
          : aPiece(body, after, mintId()),
      )
    }
  }
  kept.push(aPiece(body, held, mintId()))
  return kept.sort((a, b) => a.from - b.from)
}
