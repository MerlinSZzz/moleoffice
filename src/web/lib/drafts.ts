// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INSTRUCTION SOMEBODY IS STILL WRITING — kept where a closed tab cannot reach it, and given an
 * id so it can be pointed at like anything else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Two jobs turned out to be one job.
 *
 * A half-written comment survived closing the box and navigating away, and did not survive a
 * reload, and nothing on the screen said which of the two it was. docs/UX-CONTRACT.md names that
 * exact failure: *loose input exists in memory but does not survive a view change or a reload.*
 *
 * And a person must be able to point at an instruction they have not sent, select a phrase inside
 * it, and say what that phrase should mean instead. A thing that can be pointed at is a thing that
 * has an id, and an id is only worth anything if the thing behind it is still there after a reload.
 * So keeping the words and being able to point at them are the same piece of work, and this is it.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS ARE STILL NOT A COMMENT
 * ---------------------------------------------------------------------------------------
 *
 * A comment is durable because it is on the server. This is the tier below that: what somebody has
 * started typing, kept in this browser. Nothing here reaches the network, and that is the whole of
 * the owner's rule that no agent may start work before the instruction is finally sent.
 *
 * A BROWSER THAT REFUSES THE STORE IS SAID OUT LOUD rather than quietly losing the words. The box
 * still works, the instruction still survives the box closing, and the line under the press changes
 * to say it will not survive a reload.
 *
 * ---------------------------------------------------------------------------------------
 * A CHANGE IS EVIDENCE, AND IT IS NEVER REPAIRED
 * ---------------------------------------------------------------------------------------
 *
 * A change points at a phrase of the instruction by quoting it and by saying where it was. If the
 * person then edits the instruction, those numbers may no longer land on those words. Mole Office does
 * NOT move them. `whereTheChangeIs` says which of three situations it is and the composer says so
 * on the screen. That is the same rule the server keeps for a quote taken off a report: offsets are
 * evidence, and repairing evidence is how a product comes to claim something nobody measured.
 */

import type { MessageIntent } from '../../server/lib/agents.ts'
import { ARTEFACT_WORDS, INTENT_WORDS, type WrittenPiece } from '@shared/intent.ts'
import { INTENTS, shortenToWords } from '../components/agent/context.ts'
import { content, t } from '@shared/i18n.ts'
import { clearStored, readStored, writeStored } from './store.ts'

/** Where this browser keeps what somebody has started typing. */
export const DRAFTS_KEY = 'mole-office.talk.drafts'

/** How many unsent instructions this browser keeps. The oldest goes when a new one arrives. */
export const KEEP_AT_MOST = 20

/**
 * ONE CHANGE SOMEBODY MADE TO THEIR OWN INSTRUCTION BEFORE SENDING IT.
 *
 * `quote`, `from` and `to` are a span of the instruction, in exactly the shape a span of a stored
 * string has everywhere else in Mole Office — the words, and where they were. `said` is what the person
 * wants instead, kept exactly as they typed it and never rewritten.
 */
export interface DraftChange {
  id: string
  /** The words of the instruction this change is about, as the person could see them. */
  quote: string
  /** Where those words started in the instruction, counted from 0. */
  from: number
  /** Where they ended. */
  to: number
  /** What the person said about them. Kept exactly. */
  said: string
}

/** One unsent instruction: what it is about, what it means, what has been typed, and what changed. */
export interface Draft {
  /** This browser's handle for it. It is what a `draft` target names. */
  id: string
  /** Which thing the instruction is about, as the shared spelling of a target key. */
  key: string
  intent: MessageIntent
  /** WHAT THE PERSON WROTE. Never rewritten by anything in this file. */
  body: string
  /** The changes the person MADE — pressed *Change it* on. These go with the instruction. */
  changes: DraftChange[]
  /**
   * THE CHANGES SOMEBODY IS STILL WRITING, AND HAS NOT MADE.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THEY ARE KEPT AT ALL
   * ---------------------------------------------------------------------------------------
   *
   * The panel that changes an instruction held its words in its own state, so pressing the page
   * closed both boxes and threw away whatever had been typed into it. Measured on 19 August 2026:
   * type a sentence into the panel, press empty page, point at the same words again — the composer
   * came back saying "What you had started writing here is back" and the sentence was gone, with
   * nothing said about it. Every other way these words can be lost is announced by this file;
   * that one was the odd one out. docs/UX-CONTRACT.md names it by hand: loose input that exists
   * in memory but does not survive a view change is a feature that is not done.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THEY ARE A SECOND LIST AND NOT A FLAG ON THE FIRST
   * ---------------------------------------------------------------------------------------
   *
   * Because of what `instructionToSend` reads. A change somebody has not made is not part of what
   * they are saying, and an agent must never be handed words the person abandoned. With one list
   * and a flag, that safety is one forgotten filter away. With two lists, the thing that goes to an
   * agent reads `changes` and cannot reach these at all.
   *
   * The composer draws them under the changes that were made, saying which they are, so words
   * somebody is holding are never invisible.
   */
  beingWritten?: DraftChange[]
  /**
   * THE WORDS THIS INSTRUCTION WAS BEGUN ABOUT, and three different answers.
   *
   *   a string    — it was begun about those exact words.
   *   `null`      — it was begun about the whole thing, with nothing selected inside it.
   *   `undefined` — nothing recorded it. Rows written by the build before this one are this.
   *
   * WHY IT IS KEPT. An instruction is now held against the THING it is about rather than against
   * one selection inside it — see `draftAbout`. So a person who selects a different phrase of the
   * same paragraph gets their words back, and the comment they are now writing is about the phrase
   * they have just selected rather than the one they began with. That is a real difference and
   * `whatCameBack` says it on the screen. Guessing that the two are the same is the substitution
   * the second invariant forbids; saying nothing at all is the fifth.
   */
  startedOn?: string | null
  /**
   * THE PIECES SOMEBODY HAS CUT THEIR OWN WORDS INTO, and what they said about each one.
   *
   * Empty until the person presses `Organise`, and kept here for the reason the instruction itself
   * is kept: they are words a person worked on, so losing them at a route change or a reload is the
   * loss this whole file exists to prevent.
   *
   * NOTHING HERE REACHES THE SERVER. A piece is this browser's own structure over an instruction
   * nobody has sent. What goes to an agent is `instructionToSend`, which reads `body` and `changes`
   * and cannot reach these at all — the same rule, and the same reason, as `beingWritten` above.
   */
  pieces?: WrittenPiece[]
}

// ============================================================================ ids

/**
 * A handle for one unsent instruction, made in this browser.
 *
 * IT HOLDS ONLY LETTERS AND DIGITS, which is not decoration. It goes into the `data-target`
 * attribute, whose parts are separated by a slash, and a counter is added so that two drafts made
 * in the same millisecond cannot collide.
 */
let minted = 0
export function newDraftId(): string {
  minted += 1
  return `d${Math.random().toString(36).slice(2, 10)}${minted.toString(36)}`
}

// ============================================================================ what is stored

/**
 * What a stored list reads as, or null when this build has no meaning for it.
 *
 * AN OLDER ROW IS READ RATHER THAN THROWN AWAY, and that is not a compatibility layer built for a
 * future that has not happened. The build before this one stored `{ key, intent, body }` with no id
 * and no changes, and it is what is in the owner's browser right now, holding whatever the owner had
 * started typing. A missing `changes` is not a guess: that build had none. A missing `id` is given
 * one, because an id is this browser's handle for the words rather than a claim about them.
 *
 * Everything else is still refused outright. A row with no `body`, or an intent this build has no
 * meaning for, is not half-restored — the whole list is dropped and the person is told.
 */
export function draftsFromStored(text: string): Draft[] | null {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const out: Draft[] = []
  for (const one of parsed) {
    if (typeof one !== 'object' || one === null) return null
    const held = one as Record<string, unknown>
    const key = held['key']
    const intent = held['intent']
    const body = held['body']
    if (typeof key !== 'string' || typeof intent !== 'string' || typeof body !== 'string') return null
    if (!INTENTS.includes(intent as MessageIntent)) return null
    const id = held['id']
    const changes = changesFromStored(held['changes'])
    if (changes === null) return null
    const beingWritten = changesFromStored(held['beingWritten'])
    if (beingWritten === null) return null
    // THREE ANSWERS AND NOT TWO. A row this build wrote says which words the instruction was begun
    // about, or says `null` because it was begun about the whole thing. A row an older build wrote
    // says nothing at all, and that is left as nothing rather than read as either of the other two.
    const startedOn = held['startedOn']
    if (startedOn !== undefined && startedOn !== null && typeof startedOn !== 'string') return null
    const pieces = piecesFromStored(held['pieces'])
    if (pieces === null) return null
    out.push({
      id: typeof id === 'string' && id !== '' ? id : newDraftId(),
      key,
      intent: intent as MessageIntent,
      body,
      changes,
      beingWritten,
      startedOn: startedOn === undefined ? undefined : (startedOn as string | null),
      pieces,
    })
  }
  return out.slice(-KEEP_AT_MOST)
}

/**
 * The pieces on one stored row: none when the field is absent, null when it cannot be read.
 *
 * A WORD THIS BUILD HAS NO MEANING FOR IS NOT HALF-READ. The nine intent words and the seven
 * artefact words are the whole vocabulary, and a row holding anything else was written by something
 * that does not share this one. It is refused here the same way an unknown intent already is: the
 * list is dropped and the box says the words will not survive a reload.
 */
function piecesFromStored(value: unknown): WrittenPiece[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const out: WrittenPiece[] = []
  for (const one of value) {
    if (typeof one !== 'object' || one === null) return null
    const held = one as Record<string, unknown>
    const id = held['id']
    const reading = held['reading']
    const quote = held['quote']
    const from = held['from']
    const to = held['to']
    if (typeof id !== 'string' || typeof reading !== 'string' || typeof quote !== 'string') return null
    if (!Number.isInteger(from) || !Number.isInteger(to)) return null
    const intents = wordsFromStored(held['intents'], INTENT_WORDS)
    const artefacts = wordsFromStored(held['artefacts'], ARTEFACT_WORDS)
    if (intents === null || artefacts === null) return null
    out.push({ id, reading, quote, from: from as number, to: to as number, intents, artefacts })
  }
  return out
}

/** One list of vocabulary words, or null when it holds something this build has no meaning for. */
function wordsFromStored(value: unknown, allowed: readonly string[]): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const out: string[] = []
  for (const one of value) {
    if (typeof one !== 'string' || !allowed.includes(one)) return null
    out.push(one)
  }
  return out
}

/** The changes on one stored row: none when the field is absent, null when it cannot be read. */
function changesFromStored(value: unknown): DraftChange[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const out: DraftChange[] = []
  for (const one of value) {
    if (typeof one !== 'object' || one === null) return null
    const held = one as Record<string, unknown>
    const id = held['id']
    const quote = held['quote']
    const said = held['said']
    const from = held['from']
    const to = held['to']
    if (typeof id !== 'string' || typeof quote !== 'string' || typeof said !== 'string') return null
    if (!Number.isInteger(from) || !Number.isInteger(to)) return null
    out.push({ id, quote, said, from: from as number, to: to as number })
  }
  return out
}

let drafts: Draft[] = []

/**
 * Why this browser will not keep an unsent instruction through a reload. Null when it will.
 *
 * `browserSaid` is the browser's own words for the refusal, which are content and never translated.
 * `otherBuild` is this file's own finding, and its words are read in the page language when drawn.
 */
let storeFault: { browserSaid: string } | 'otherBuild' | null = null

/**
 * HOW MANY UNSENT INSTRUCTIONS THIS BROWSER HAS DROPPED TO MAKE ROOM, this visit.
 *
 * The store holds twenty and the oldest went when a twenty-first arrived, with nothing said. Every
 * other thing that can happen to these words is said out loud — a browser that refuses the store, a
 * stored list this build cannot read — so the one silent loss was the odd one out. It is words a
 * person typed disappearing, and the fifth invariant is that absence beats a guess: a reader who is
 * not told will believe they never wrote it.
 *
 * It is not persisted. It says what happened while this page has been open, which is the only claim
 * it can make honestly.
 */
let dropped = 0

function load(): void {
  if (typeof window === 'undefined') return
  const read = readStored(DRAFTS_KEY)
  if (!read.ok) {
    storeFault = { browserSaid: read.reason }
    return
  }
  if (read.value === null) return
  const found = draftsFromStored(read.value)
  if (found === null) {
    // Absence beats a guess. A stored list this build cannot read is dropped rather than
    // half-restored, and the box says the words will not survive a reload until it is written to.
    clearStored(DRAFTS_KEY)
    storeFault = 'otherBuild'
    return
  }
  drafts = found
}

load()

function save(): void {
  if (typeof window === 'undefined') return
  const written = writeStored(DRAFTS_KEY, JSON.stringify(drafts))
  storeFault = written.ok ? null : { browserSaid: written.reason }
}

/** Why this browser will not keep the words through a reload, or null when it will. */
export function whyTheWordsMayBeLost(): string | null {
  if (storeFault === null) return null
  return storeFault === 'otherBuild' ? t('agentWords.drafts.otherBuild') : content(storeFault.browserSaid)
}

/** How many unsent instructions were dropped to make room while this page has been open. */
export function droppedToMakeRoom(): number {
  return dropped
}

/**
 * HOW MANY UNSENT INSTRUCTIONS THIS BROWSER IS HOLDING RIGHT NOW.
 *
 * IT IS THE DURABLE HALF OF `droppedToMakeRoom`, AND IT IS WHY THAT ONE CAN STAY HONEST. The count
 * of what was dropped can only ever speak for the current visit: nothing about an eviction is
 * written down, so an eviction that happened yesterday is not a thing this browser can report
 * today. What IS true at any moment is how many are held and how many are kept, and a person whose
 * store is full is being told the next instruction will push the oldest out — which is the fact
 * they need, before it happens rather than after. See `whatKeepsTheWords`.
 */
export function howManyKept(): number {
  return drafts.length
}

/** What was typed about this thing and never sent, or undefined. */
export function draftAbout(key: string): Draft | undefined {
  return drafts.find((one) => one.key === key)
}

/** One unsent instruction by its id — which is what a `draft` target names. */
export function draftById(id: string): Draft | undefined {
  return drafts.find((one) => one.id === id)
}

/**
 * Keep an instruction, or forget it once there is nothing left of it.
 *
 * ONE WRITER, TAKING THE WHOLE VALUE. It used to take a patch and merge it, which meant the caller
 * and this file both held an opinion about what the other fields were.
 */
export function keepDraft(draft: Draft): void {
  drafts = drafts.filter((one) => one.id !== draft.id && one.key !== draft.key)
  // A CHANGE SOMEBODY IS STILL WRITING IS ENOUGH TO KEEP THE WHOLE THING. It is words a person
  // typed, so an instruction holding nothing else is still worth keeping for them.
  if (draft.body !== '' || draft.changes.length > 0 || (draft.beingWritten ?? []).length > 0) {
    const withThisOne = [...drafts, draft]
    drafts = withThisOne.slice(-KEEP_AT_MOST)
    // COUNTED RATHER THAN DROPPED IN SILENCE. See `dropped` above.
    dropped += withThisOne.length - drafts.length
  }
  save()
}

/** Forget one, which is what writing it down does. */
export function forgetDraft(id: string): void {
  drafts = drafts.filter((one) => one.id !== id)
  save()
}

// ============================================================================ where a change points

/**
 * WHERE THE WORDS A CHANGE IS ABOUT ARE NOW. Three answers, and none of them repairs anything.
 *
 *   `there` — the instruction still holds those words at those positions.
 *   `moved` — the instruction still holds those words, somewhere else. Mole Office does not follow them.
 *   `gone`  — the instruction no longer holds those words at all.
 *
 * It is arithmetic over two plain strings, so it can be proved without a browser.
 */
export type WhereTheChangeIs = 'there' | 'moved' | 'gone'

export function whereTheChangeIs(body: string, change: { quote: string; from: number; to: number }): WhereTheChangeIs {
  if (body.slice(change.from, change.to) === change.quote) return 'there'
  return body.includes(change.quote) ? 'moved' : 'gone'
}

/**
 * What the composer says about a change whose words have moved or gone, and null when they have not.
 *
 * Exported so a test can put the question without a browser.
 */
export function whereTheChangeIsWords(where: WhereTheChangeIs): string | null {
  if (where === 'there') return null
  return t(where === 'moved' ? 'agentWords.drafts.moved' : 'agentWords.drafts.gone')
}

// ============================================================================ what is finally sent

/**
 * THE WHOLE OF WHAT THE PERSON IS SAYING, as one message, at the moment it is finally sent.
 *
 * THE INSTRUCTION COMES FIRST AND IS UNTOUCHED. That is the eighth rule: what somebody wrote is
 * kept exactly, and everything Mole Office adds is beside it and marked as an addition. The changes are
 * the same person's words, written later, so they are added rather than merged into the sentence
 * they are about — merging them would be Mole Office rewriting an instruction it was never asked to
 * rewrite, and the agent would have no way to tell which half was typed by whom.
 *
 * A CHANGE WHOSE WORDS ARE GONE STILL GOES, and says so. Dropping it would lose words a person
 * wrote; sending it silently would have the agent hunting a phrase that is not in the instruction.
 */
export function instructionToSend(draft: { body: string; changes: readonly DraftChange[] }): string {
  if (draft.changes.length === 0) return draft.body
  const lines = draft.changes.map((change) => {
    const missing =
      whereTheChangeIs(draft.body, change) === 'gone' ? ' (these words are no longer in the instruction above)' : ''
    return `· "${change.quote}"${missing} — ${change.said}`
  })
  return `${draft.body}\n\nWhat I changed before sending:\n${lines.join('\n')}`
}

// ============================================================================ what the box says

/**
 * WHAT THE BOX SAYS ABOUT THE WORDS THAT ARE NOT A COMMENT YET.
 *
 * Two answers and they are different promises, so they are different sentences. Exported so a test
 * can put the question without a browser.
 *
 * THE FIRST ONE IS SHORT ON PURPOSE. It is drawn under the press on every keystroke, and the owner
 * asked for a composer that does not explain itself in paragraphs. It still says both of the things
 * a person needs: the words are kept, and they are not a comment yet.
 */
export function whatKeepsTheWords(fault: string | null, howManyDropped = 0, howManyHeld = 0): string {
  const room =
    howManyDropped === 0
      ? null
      : howManyDropped === 1
        ? t('agentWords.drafts.droppedOne', { keep: KEEP_AT_MOST })
        : t('agentWords.drafts.droppedMany', { n: howManyDropped, keep: KEEP_AT_MOST })
  // THE STORE IS FULL, SAID BEFORE THE NEXT ONE PUSHES SOMETHING OUT RATHER THAN AFTER.
  //
  // Nothing writes down that an eviction happened, so `howManyDropped` can only speak for the
  // current visit and an eviction on an earlier visit is a thing this browser cannot report. Being
  // full is true at any moment and needs nothing stored, and it is the same warning one step
  // earlier. It is left off while `room` is present, because a reader who has just been told
  // something was dropped does not also need to be told the store is full.
  const full =
    room === null && howManyHeld >= KEEP_AT_MOST ? t('agentWords.drafts.full', { n: howManyHeld }) : null
  // EACH SENTENCE IS ONE ENTRY OF THE WORD LISTS, and whole sentences are joined by the lists' own
  // join. The fault is the browser's own words and is passed in as content.
  const first =
    fault === null ? t('agentWords.drafts.keptHere') : t('agentWords.drafts.willBeLost', { fault: content(fault) })
  return [room, full].reduce<string>(
    (said, next) => (next === null ? said : t('agentWords.twoSentences', { first: said, second: next })),
    first,
  )
}

/**
 * WHAT THE BOX SAYS WHEN AN INSTRUCTION COMES BACK, and when it says a second sentence.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A SECOND SENTENCE AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * An instruction is held against the THING it is about, not against one selection inside it. That
 * is what makes a kept instruction findable: it used to be held under the target AND the exact
 * character the selection started at, so an instruction written about one phrase of a paragraph
 * was invisible to a selection starting anywhere else in the same paragraph, and nothing in Mole Office
 * lists unsent instructions. Measured on 19 August 2026: an instruction kept under
 * `reportBlock/…/b-prose:4` gave an empty box, saying nothing, to a selection starting at
 * character 34 of the same paragraph.
 *
 * The cost of holding it more widely is that the words can come back beside a DIFFERENT selection
 * from the one they were begun against. The comment being written is about what is selected now —
 * that is what the person just did, and the chip above the box says so — and this sentence says
 * where the words came from. Saying nothing would let somebody believe they had written the
 * instruction about the words in front of them.
 *
 * `undefined` for `startedOn` is a row an older build wrote, which recorded nothing. Nothing is
 * then claimed about it: absence beats a guess.
 *
 * Exported so a test can put the question without a browser.
 */
export function whatCameBack(startedOn: string | null | undefined, nowAbout: string | null): string {
  if (startedOn === undefined || startedOn === nowAbout) return t('agentWords.drafts.back')
  // ONE WHOLE ENTRY FOR EACH PAIR, because another language says where it began and where it is now
  // in another order. The quoted words are what the person selected, and are content.
  if (startedOn === null) return t('agentWords.drafts.back.wholeToSelection')
  const quote = content(shortenToWords(startedOn).words)
  return nowAbout === null
    ? t('agentWords.drafts.back.quoteToWhole', { quote })
    : t('agentWords.drafts.back.quoteToSelection', { quote })
}
