// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH OBJECTS HAVE A COMMENT WAITING, asked once for the page rather than once per row.
 *
 * A page can be drawing forty rows, and each of them wants to know the same thing: is there a
 * comment waiting on this? GET /api/agent/marks answers for every object in one request, and this
 * file is the one place that asks it. Forty rows asking separately would be forty requests for one
 * answer, and — worse — forty answers that could disagree with each other.
 *
 * NOT KNOWING IS A THIRD ANSWER AND IT IS DRAWN AS NOTHING AT ALL. `waiting`, `none` and `unknown`
 * are different: the first two are what the server said, and the third is nobody having asked yet
 * or the request having failed. A row that draws "no comments" because the request failed is the
 * fifth engineering rule broken quietly — absence beats a guess, and this keeps the two apart.
 *
 * IT RE-READS WHEN A COMMENT IS WRITTEN. `useReviewChanges` goes up whenever anything writes to a
 * review, so a mark appears on the object the moment its comment is stored, without the page
 * knowing anything about the composer that wrote it.
 *
 * TWO THINGS CAN BE WAITING AND THE ROUTE ONLY SEES ONE OF THEM. GET /api/agent/marks reads the
 * messages queued in open conversations. A NOTE somebody wrote and has not sent is a record, is not
 * in any conversation, and the route cannot see it — so a comment written in a review would be
 * stored and then invisible on the thing it is about. This file reads the notes as well and marks
 * their objects too. It is not a second copy of one fact: a queued message and a waiting note are
 * two different stored things, and each is counted once.
 *
 * WHETHER A COMMENT HAS GONE OUT IS ASKED OF THE SERVER, NEVER OF THE RECORD. `agent_messages.state`
 * is the one store, and this browser cannot open it, so `GET /api/agent/marks` names the comments in
 * the project that have gone — `goneOut` on its reply — and this file reads that list.
 *
 * IT USED TO READ `annotation.data.state` AND THAT WAS A SECOND STORE. Wave 3 deleted every writer
 * of `sent` on the record and left this reader on it, so a comment that had gone out read `queued`
 * here for ever and was drawn as still waiting. Worse, a comment written the way GET /api/kinds now
 * instructs carries no `state` at all: it failed the filter, was drawn nowhere, and was not counted
 * as unreadable either — somebody's own words, stored and invisible, with no number saying anything
 * was missing. Fixed 25 August 2026.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { spanNamedBy, targetKey, targetSpec, type Context, type Place, type View } from '@shared/targets.ts'
// THE REGION TREE AND THE ONE QUESTION ABOUT IT. `howItDrawsHere` at the foot of this file asks
// whether the characters a comment was written on are part of what THIS view drew, and that is
// answered by the derivation rather than by the painted DOM — see `placeFallsInside` for why the
// two questions are different and both are asked.
import { findRegion, placeFallsInside, type Region, type RegionId } from '@shared/regions.ts'
// WHAT A RUNG IS CALLED where a reader sets one. The sentence a reader is shown names the view the
// comment was written on, and a second spelling of those six names here is the defect this
// repository names about itself.
import { type Rung } from '@shared/detail.ts'
import { t } from '@shared/i18n.ts'
import type { Mark, MarksReply } from '../../../server/lib/agents.ts'
import { api, errorMessage, type CommentOnThePage } from '../../api.ts'
import { targetOfRecord } from '@shared/messages.ts'
import { makeBroadcast } from '../../lib/store.ts'
import type { SentMarks } from '../../lib/sent-marks.ts'
import { useReviewChanges } from '../../lib/review.ts'
import { useChannel, whenEventsWereLost } from '../../lib/channel.ts'
import { currentWorkspace, subscribeWorkspace } from '../../lib/workspace.ts'
import { lookupKey, type MessageContext } from './context.ts'

/** The events the marks on a page draw. */
const MARKS_DRAW = ['comment.placed', 'comment.replied'] as const

// ---------------------------------------------------------------------------- the notes waiting

/** One note somebody wrote and nobody has sent: the words, and what they were written against. */
export interface WaitingNote {
  id: string
  body: string
  context: MessageContext
  /**
   * Whether it has gone to somebody. **The server said so; this browser did not work it out.**
   *
   * A SENT COMMENT IS STILL DRAWN ON THE THING IT IS ABOUT. It used to be skipped, so a comment
   * disappeared from the page it was left on at the moment its result started to matter — which is
   * the design's "handled comments remain inspectable" broken, and the contract's "the value works
   * in one view and disappears from the other".
   */
  sent: boolean
  /**
   * WHICH KIND OF RECORD HOLDS IT: a message, or a comment written before comments and messages
   * became one thing (an annotation). Only a message can be read and addressed through the message
   * doors, so a press that sends a saved comment asks this first (problem 7VI4cV5ppiFQ).
   *
   * ABSENT WHERE THE READER THAT MADE THE NOTE DID NOT SAY. `notesWaiting` below always says;
   * `noteOfMember` in ReviewBar.tsx builds a note from a review member, which does not carry the kind.
   * Absent is not read as either kind.
   */
  entry?: 'message' | 'annotation'
}

/**
 * A mark as a PAGE draws it: the server's mark plus how many of the comments on that thing have
 * already gone to somebody.
 *
 * IT IS A BROWSER TYPE AND NOT THE SERVER'S. `Mark` is what GET /api/agent/marks answers, and that
 * route counts queued messages only; adding a field to it would say the route serves something it
 * does not. The count is worked out here, from records this browser already read.
 */
export interface DrawnMark extends Mark {
  /** How many comments on this thing have been sent. Drawn differently; never dropped. */
  sent: number
}

/** What a read of the comments found, including the ones it could not read. */
export interface NotesWaiting {
  notes: WaitingNote[]
  /**
   * HOW MANY COMMENTS COULD NOT BE READ.
   *
   * Counted rather than skipped. A row whose body or context is not the shape an annotation
   * declares cannot be drawn and cannot be sent, and a surface that quietly left it out would be
   * telling somebody their comment is not there when it is.
   *
   * IT IS NOW THE ONLY WAY OUT OF THIS READER. Every comment is either drawn or counted here; there
   * is no third branch that drops one silently, which is what the old state filter was.
   */
  unreadable: number
}

/**
 * Every comment in this project, and which of them have gone to somebody.
 *
 * `goneOut` IS THE SERVER'S ANSWER AND THE ONLY ONE ASKED. It is `goneOut` off GET /api/agent/marks,
 * which is `commentsGoneOut` in src/server/lib/dispatch.ts — the same fact, from the same store, as
 * the gate that fixes somebody's words. A comment not in that list has not gone out. Nothing here
 * reads `annotation.data.state`, which the schema says nothing decides anything from.
 *
 * EVERY COMMENT IS READ, WHATEVER IT HOLDS. The old reader wanted the record to say `queued` or
 * `sent` and dropped anything else, so a comment written the way the schema instructs — with no
 * `state` at all — was drawn nowhere and counted nowhere. A comment is a comment; whether it has
 * gone is a separate question with a separate answer, and both are now answered for all of them.
 *
 * THE SCOPE IS "EVERY COMMENT IN THIS PROJECT", not "written during this review". Which review a
 * comment belongs to is Phase 4 and nothing stores it yet.
 */
export function notesWaiting(records: readonly CommentOnThePage[], goneOut: readonly string[]): NotesWaiting {
  const gone = new Set(goneOut)
  const notes: WaitingNote[] = []
  let unreadable = 0
  for (const record of records) {
    const body = record.data['body']
    // WHICHEVER KEY THE KIND KEEPS IT UNDER. A comment written before comments and messages became
    // one thing keeps it in `context`; one written since is a message and keeps it in `target`.
    const context = targetOfRecord(record)
    if (typeof body !== 'string' || typeof context !== 'object' || context === null) {
      unreadable += 1
      continue
    }
    notes.push({
      id: record.id,
      body,
      context: context as MessageContext,
      sent: gone.has(record.id),
      entry: record.kind === 'message' ? 'message' : 'annotation',
    })
  }
  return { notes, unreadable }
}

/**
 * The marks the waiting notes make, one per thing pointed at.
 *
 * `threads` is empty and that is the truth about a note: it is in no conversation, which is why it
 * survives every conversation. Exported so a test can build them without a browser.
 */
export function marksOfNotes(notes: readonly WaitingNote[]): DrawnMark[] {
  const byKey = new Map<string, DrawnMark>()
  for (const note of notes) {
    const key = targetKey(note.context.target)
    const held = byKey.get(key)
    const mark: DrawnMark = held ?? { key, target: note.context.target, waiting: 0, sent: 0, threads: [], spans: [] }
    if (note.sent) mark.sent += 1
    else mark.waiting += 1
    // THE WORDS THE NOTE NAMES, ASKED FOR ONCE RATHER THAN READ OUT OF A FIELD. A note written
    // since a context started carrying a place keeps its words inside the place, so reading
    // `context.span` here left every one of them with no span — and a mark with no span lights
    // nothing and never says the words moved.
    const words = spanNamedBy(note.context)
    if (words !== null) mark.spans.push(words)
    byKey.set(key, mark)
  }
  return [...byKey.values()]
}

/**
 * THE FIRST COMMENT WRITTEN ABOUT EACH PLACE, so a press on that place's circle has one to go to.
 *
 * IT IS THE FIRST AND NOT THE NEWEST. Going to a place means lighting the words a comment quoted,
 * and the first comment about a place is the one that chose those words; an answer to it usually
 * quotes nothing. The card beside a block and the row in the review pane both read the exchange
 * from the first one as well.
 *
 * IT CARRIES NO COUNT. How many comments are on a place is worked out once, by the mark layer, out
 * of the marks; a second count here would be the same number in two places.
 */
export function firstCommentOnEach(
  notes: readonly WaitingNote[],
): Map<string, { context: MessageContext; annotationId: string }> {
  const out = new Map<string, { context: MessageContext; annotationId: string }>()
  for (const note of notes) {
    const key = targetKey(note.context.target)
    if (out.has(key)) continue
    out.set(key, { context: note.context, annotationId: note.id })
  }
  return out
}

/**
 * WHAT IS DRAWN FROM ONE READ: the marks, and the comments the circles open at (wave 13y round 146, item 73a).
 *
 * With Settings' "Hide them completely", a comment that has been sent is left out of both, so it adds nothing to a
 * circle and lights no words. The server's marks are left as they are, because they hold only comments still queued.
 * The read keeps every comment either way, and only what is drawn changes.
 */
export function whatIsDrawn(
  reply: MarksReply,
  notes: readonly WaitingNote[],
  sent: SentMarks,
): { marks: DrawnMark[]; notes: readonly WaitingNote[] } {
  const drawn = sent === 'show' ? notes : notes.filter((note) => !note.sent)
  return { marks: bothKinds(reply.marks, marksOfNotes(drawn)), notes: drawn }
}

/** The two lists as one, added together where both say something about the same thing. */
export function bothKinds(fromMessages: readonly Mark[], fromNotes: readonly DrawnMark[]): DrawnMark[] {
  const out: DrawnMark[] = fromMessages.map((mark) => ({
    ...mark,
    sent: 0,
    threads: [...mark.threads],
    spans: [...mark.spans],
  }))
  for (const note of fromNotes) {
    const held = out.find((mark) => mark.key === note.key)
    if (held === undefined) {
      out.push(note)
      continue
    }
    held.waiting += note.waiting
    held.sent += note.sent
    held.spans.push(...note.spans)
  }
  return out
}

/**
 * What this browser knows about waiting comments, including "it has not asked".
 *
 * `reply` IS THE ROUTE'S ANSWER, UNCHANGED, and `marks` is what to draw: the route's marks plus the
 * ones the waiting notes make. They are kept apart so that the route's own sentence about what its
 * answer covers stays a true statement about the route.
 */
export type MarksReading =
  | { state: 'unasked' }
  | { state: 'asking' }
  | {
      state: 'read'
      reply: MarksReply
      marks: DrawnMark[]
      /**
       * EVERY COMMENT IN THIS PROJECT, IN THE PAGE SHAPE, kept rather than thrown away.
       *
       * The marks above are counts per thing. A card that draws an agent's words on the page needs
       * the words, who wrote them and when, and that is all on the rows this read already has. Asking again would be a second request for rows already in hand,
       * and the two answers could disagree.
       */
      comments: readonly CommentOnThePage[]
      /**
       * THE SAME COMMENTS AS THE PLACE EACH ONE POINTS AT, read once here rather than by each
       * caller.
       *
       * `notesWaiting` is what turns a stored record into a place, and it is the only reader that
       * understands both spellings a stored context has had. A caller that read `data.target` for
       * itself would answer "nowhere" for every comment written before comments and messages became
       * one thing.
       */
      notes: readonly WaitingNote[]
    }
  | { state: 'failed'; message: string }

let reading: MarksReading = { state: 'unasked' }
/** The project and the change count the current answer belongs to. Null when there is no answer. */
let answered: string | null = null
let asking = false
/** The key the read in flight is for. */
let askingFor: string | null = null
const broadcast = makeBroadcast()

function current(): MarksReading {
  return reading
}

function announce(next: MarksReading): void {
  reading = next
  broadcast.announce()
}

/**
 * THE COMMENTS ARE READ AGAIN ONLY AFTER THE LAST ANSWER CAME BACK, ONLY WHILE SOMETHING THAT DRAWS THEM IS ON A PAGE
 * THE PERSON CAN SEE, AND AFTER LOST EVENTS AT MOST ONCE A MINUTE.
 *
 * From 10:46 to 11:00 on 10 October 2026 the owner's review panel asked GET /api/messages/comments about every 40 s
 * while each answer took 32 to 48 s, and the office could answer nobody else (wave 13y round 18). A read that held the
 * server for 40 s lost this page its events, the lost events asked again, and the next read held it again.
 *
 * THREE REASONS TO READ AGAIN (`WhyReadAgain`). Every one waits for the read in flight to come back and for the page to
 * be shown and drawing marks, and asking again while a read waits is one read.
 * - `here`: this browser changed something, a new project or a review written here.
 * - `comment`: a comment was placed or answered in this project. It is a real change, and criterion M7 says it appears
 *   without a reload, so it does not wait for the minute.
 * - `lost`: events were lost, so nobody knows whether anything changed. This is the read that went round and round on
 *   10 October, and it also waits a minute after the last answer.
 */
export const READ_AGAIN_AT_MOST_EVERY_MS = 60_000
export type WhyReadAgain = 'here' | 'comment' | 'lost'
const HOW_STRONG: Record<WhyReadAgain, number> = { lost: 0, comment: 1, here: 2 }
let answeredAt = Number.NEGATIVE_INFINITY
/** The key the next read is for, when one is wanted and not yet asked. */
let wanted: string | null = null
/** The strongest reason the wanted read was asked for. */
let wantedWhy: WhyReadAgain = 'lost'
let waiting: ReturnType<typeof setTimeout> | null = null
let drawing = 0

function pageIsHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

/**
 * Ask for the marks again when allowed, for this reason.
 *
 * A CHANGE OF PAGE TO THE KEY BEING READ IS THAT READ. Each thing on a page that draws marks asks for its key when it
 * first draws, and on Home the second one asks while the first one's read is in flight. That read already answers for
 * the key, so asking again after it would ask twice in one load (wave 13y round 18b). A
 * comment or lost events while a read is in flight still read once more after it, because the read may have missed
 * them.
 */
export function readAgainWhenAllowed(key: string, why: WhyReadAgain): void {
  if (why === 'here' && asking && askingFor === key) return
  if (wanted === null || HOW_STRONG[why] > HOW_STRONG[wantedWhy]) wantedWhy = why
  wanted = key
  if (wantedWhy !== 'lost' && waiting !== null) {
    clearTimeout(waiting)
    waiting = null
  }
  readIfAllowed()
}

function readIfAllowed(): void {
  if (wanted === null || asking || waiting !== null) return
  if (drawing === 0 || pageIsHidden()) return
  const wait = wantedWhy === 'lost' ? Math.max(0, answeredAt + READ_AGAIN_AT_MOST_EVERY_MS - Date.now()) : 0
  if (wait === 0) {
    const key = wanted
    wanted = null
    wantedWhy = 'lost'
    void load(key)
    return
  }
  waiting = setTimeout(() => {
    waiting = null
    readIfAllowed()
  }, wait)
}

/** Count one thing that draws the marks for as long as it is drawn. Returns the way to stop counting it. */
export function drawingMarks(): () => void {
  drawing += 1
  readIfAllowed()
  return () => {
    drawing -= 1
  }
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => readIfAllowed())

async function load(key: string): Promise<void> {
  if (asking) return
  asking = true
  askingFor = key
  announce({ state: 'asking' })
  try {
    // BOTH READS, TOGETHER. One request answers for the queued messages and one for the notes, and
    // a page that had only the first would draw nothing on a report somebody has just commented on.
    //
    // THE FIRST REQUEST ALSO CARRIES WHICH COMMENTS HAVE GONE OUT, so the words of a comment and
    // whether it has been given to anybody are read in the same breath and cannot come apart.
    const [reply, comments] = await Promise.all([api.agentMarks(), api.commentRecords()])
    answered = key
    const waiting = notesWaiting(comments.comments, reply.goneOut)
    announce({
      state: 'read',
      reply,
      marks: whatIsDrawn(reply, waiting.notes, 'show').marks,
      comments: comments.comments,
      notes: waiting.notes,
    })
  } catch (err: unknown) {
    // The key is recorded on a failure too, so a page that cannot reach the server asks once and
    // says so, rather than asking again on every render until somebody notices the network tab.
    answered = key
    announce({ state: 'failed', message: errorMessage(err) })
  } finally {
    asking = false
    answeredAt = Date.now()
    readIfAllowed()
  }
}

/**
 * What has a comment waiting, read once per project and re-read when a review changes.
 *
 * Every caller gets the same answer object, because there is one.
 */
export function useMarks(): MarksReading {
  const changes = useReviewChanges()
  const workspace = useSyncExternalStore(subscribeWorkspace, currentWorkspace, currentWorkspace)
  const state = useSyncExternalStore(broadcast.subscribe, current, current)
  const key = `${workspace}:${String(changes)}`
  useEffect(() => {
    if (answered !== key) readAgainWhenAllowed(key, 'here')
  }, [key])
  useEffect(() => drawingMarks(), [])
  // AND AGAIN WHEN A COMMENT IS PLACED OR ANSWERED ANYWHERE, without the page being reloaded.
  // Criterion M7: an agent's comment and the person's answer appear where they belong without a
  // reload. `useReviewChanges` above only moves when this browser writes to a review, so it cannot
  // hear an agent that wrote through the API.
  //
  // ONLY THOSE TWO EVENTS ARE ASKED FOR, so a tab showing no marks is handed no comment events and a tab
  // showing marks is handed nothing else for them. And when events were lost, the marks are read once.
  useChannel(useCallback((event) => {
    if (event.name !== 'comment.placed' && event.name !== 'comment.replied') return
    if (event.workspaceId !== workspace) return
    readAgainWhenAllowed(key, 'comment')
  }, [key, workspace]), MARKS_DRAW)
  useEffect(() => whenEventsWereLost(() => {
    readAgainWhenAllowed(key, 'lost')
  }), [key])
  return state
}

/**
 * WHERE A STORED COMMENT SAYS IT WAS MADE, asked once so no reader works it out a second way.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS DERIVED FROM `spanNamedBy` AND NOT WRITTEN BESIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * A context written before Mole Office measured where somebody was carries a bare `span` and no place,
 * and `spanNamedBy` is the one accessor that reads both shapes. A second reader here that looked at
 * `context.place` alone would answer "nowhere" for every one of those rows, and the page would draw
 * no mark on comments whose words it can still find. So the older shape is answered by asking the
 * one accessor and saying what it means: a bare span names words.
 *
 * NULL IS A REAL ANSWER AND NOT A FAILURE. It means the stored context named no place at all, which
 * §8.1 calls `Not known` — Mole Office has not been taught to look. It is not `whole thing`, which means
 * a place WAS recorded and it was the thing itself.
 */
export function placeNamedBy(context: Context): Place | null {
  if (context.place !== undefined) return context.place
  const span = spanNamedBy(context)
  return span === null ? null : { at: 'words', span }
}

/** The mark on one object, or null when nothing — message or note — is waiting on it. */
export function markOn(state: MarksReading, context: MessageContext): Mark | null {
  if (state.state !== 'read') return null
  const key = lookupKey(context)
  return state.marks.find((mark) => mark.key === key) ?? null
}

// ---------------------------------------------------------------------------- written in another view

/**
 * WHICH OF THE FOUR WAYS A STORED COMMENT DRAWS ON THE VIEW A READER IS ACTUALLY AT.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * A report is not one drawing. The detail ladder decides which blocks are on the page, so the
 * fourth paragraph of a section is drawn at `full` and is not drawn at `gist`. A comment written on
 * that paragraph is about characters a reader at `gist` cannot see, and until this function there
 * were two answers and both were false: draw the mark on whichever ancestor happened to be on
 * screen — which says THIS COMMENT IS ABOUT THIS about a thing it is not about — or draw nothing,
 * which says THERE IS NO COMMENT HERE about a comment that is there.
 *
 * The third and true answer is *the place is real, and it is not on your screen*. It needs two
 * facts: what the writer could see, which is `Context.view`, and what this drawing drew, which is
 * the set of region ids the page is carrying.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A PURE FUNCTION AND IT TOUCHES NO DOM
 * ---------------------------------------------------------------------------------------
 *
 * `drawnHere` is the set of region ids this drawing put on the page — the caller reads it off
 * `document.querySelectorAll('[data-target]')`, which is the same lookup MarkLayer already makes to
 * find a mark's holder. Passing it in rather than reaching for the document means this can be
 * answered for a view the reader is NOT at, which is the whole point: the question *would your
 * place be drawn if you went back to how it was written* has to be answerable before anything is
 * repainted.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR CASES, EACH WITH ONE DRAWING
 * ---------------------------------------------------------------------------------------
 *
 *   here        the region is drawn and the place is drawn.     Today's mark, full strength.
 *   placeAway   the region is drawn, the place is not.          The same mark, REDUCED, plus the glyph.
 *   inside      the region is not drawn ON ITS OWN, and the     The reduced mark on that larger
 *               larger region drawn in its place carries        region, plus the glyph.
 *               these very characters.
 *   heldBy      the region is not drawn; something holding it   The reduced mark on the nearest
 *               is, and that something does not draw these      drawn ancestor, plus the glyph.
 *               characters.
 *   notDrawnHere  the region is in the report and this drawing  No mark at all, and the sentence
 *               drew neither it nor anything holding it.        saying which view it was written on.
 *   gone        the region is not in this revision at all.      The existing `gone` state, unchanged.
 *
 * WHY THE LAST TWO ARE TWO WORDS AND WERE ONE UNTIL 30 AUGUST 2026. Both answered `gone`, and the
 * table above already said `gone` meant "not in this revision at all" — so for one of the two the
 * word said something the code knew to be untrue, while the SENTENCE beside it said the true thing.
 * Nothing failed, because nothing read the word: the function had no caller. It has one now, and
 * that caller writes the word onto the page for a reader's harness to read, so the two facts are
 * two words. Measured over the eighteen reports in the corpus: going from "All of it" down to "The
 * conclusion", 1,225 parts have nothing drawn holding them and 51 are held by something drawn — so
 * the case that would have carried the wrong word is the common one, not a corner.
 *
 * WHY `inside` IS NOT `heldBy` WITH BETTER WORDS. They are two different facts about the screen and
 * a reader acts on them differently. `inside` means the words the comment was written on ARE on the
 * page — drawn as part of something bigger, because this reading length draws that part whole
 * rather than in pieces — so the reader can see what the comment is about without changing
 * anything. `heldBy` means those words are not on the page at all and the mark is sitting on the
 * nearest thing that contains them. Calling both of them held-by would say *not here* about words
 * that are here, and calling both of them inside would say the opposite; `design/problem-03/
 * ACCEPTANCE.md` criterion 14 asks for the first of those two to be told apart.
 *
 * IT IS ANSWERED FROM THE STORED CHARACTERS AND NOT FROM THE PIXELS. A region drawn in place of
 * this one carries these characters when it names the SAME stored field and its range CONTAINS this
 * range — which is what `carriesTheSameCharacters` below asks. Nothing here measures the document.
 *
 * REDUCED STRENGTH IS NEVER OPACITY ALONE. design/UX-CONTRACT.md forbids a state carried by colour
 * or weight by itself, and `PLACE_STATES` already pairs every mark form with a glyph for exactly
 * this reason. The second channel here is the brackets glyph, and `mark.reduced` is what the layer
 * reads to draw both.
 *
 * ---------------------------------------------------------------------------------------
 * A COMMENT WITH NO STORED VIEW SAYS SO AND GUESSES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * Every context written before 25 August 2026 has no `view` — measured, 7 of 7 live annotations.
 * Those still get the reduced mark when the place is not drawn, because that is a fact about THIS
 * drawing and needs nobody's evidence. What they do not get is `View original`: there is no
 * original to go back to, and offering one would be Mole Office inventing a view somebody read at.
 * `restoreTo` is null for them and `says` tells the reader which of the two it is. That is the
 * fifth invariant on screen — *nobody looked* is not *nothing is there*.
 */
export type PlaceDrawing = 'here' | 'placeAway' | 'inside' | 'heldBy' | 'notDrawnHere' | 'gone'

export interface HowItDraws {
  /** Which of the four. */
  drawing: PlaceDrawing
  /** The region id whose element the mark goes on. Null when nothing on this page can hold it. */
  on: RegionId | null
  /** True for the two cases the contract draws at reduced strength with a brackets glyph. */
  reduced: boolean
  /**
   * The view to restore when the reader presses `View original`, or null when there is nothing to
   * restore to — either because the place is drawn already, or because nobody recorded a view.
   */
  restoreTo: View | null
  /** The two short sentences a reader is shown on demand. Never drawn on the page unasked. */
  says: string
}

/**
 * Answer for one stored context.
 *
 * `tree` is the record's regions as THIS drawing derived them; `drawnHere` is the region ids the
 * page is carrying. A region in the tree but not in `drawnHere` exists in the record and was left
 * out of this view, which is `placeAway` or `heldBy`; a region in neither is `gone`.
 */
export function howItDrawsHere(
  context: Context,
  tree: Region,
  drawnHere: ReadonlySet<RegionId>,
): HowItDraws {
  const target = context.target
  if (target.kind !== 'region') {
    // NOT A PART OF A REPORT AT ALL — a record, a plan line, a row of the rail. Those have never had
    // more than one drawing, so there is no second view for them to have been written in.
    return { drawing: 'here', on: null, reduced: false, restoreTo: null, says: '' }
  }
  const region = findRegion(tree, target.regionId)
  if (region === null) {
    return {
      drawing: 'gone',
      on: null,
      reduced: false,
      restoreTo: null,
      says: t('agentWords.marks.gone'),
    }
  }

  const writtenAt = context.view
  const nameOfView = writtenAt === undefined ? null : rungName(writtenAt.detail)

  if (drawnHere.has(region.id)) {
    if (placeFallsInside(region, context.place)) {
      return { drawing: 'here', on: region.id, reduced: false, restoreTo: null, says: '' }
    }
    return {
      drawing: 'placeAway',
      on: region.id,
      reduced: true,
      restoreTo: writtenAt ?? null,
      says: saysWhy(nameOfView),
    }
  }

  // THE NEAREST THING HOLDING IT THAT THIS DRAWING DID DRAW. Walking up rather than giving up:
  // the reader can be shown WHERE the comment is even when the exact part is not on the page, and
  // the reduced mark is what stops that being read as "the comment is about this".
  const holder = nearestDrawn(tree, region.id, drawnHere)
  if (holder === null) {
    return {
      drawing: 'notDrawnHere',
      on: null,
      reduced: false,
      restoreTo: writtenAt ?? null,
      says: saysWhy(nameOfView),
    }
  }
  // THE THING DRAWN IN ITS PLACE EITHER DRAWS THESE CHARACTERS OR IT DOES NOT, and the answer is
  // the difference between "this is on your screen, inside something bigger" and "this is not on
  // your screen and here is what holds it".
  if (carriesTheSameCharacters(findRegion(tree, holder), region)) {
    return { drawing: 'inside', on: holder, reduced: true, restoreTo: writtenAt ?? null, says: saysInside(nameOfView) }
  }
  return { drawing: 'heldBy', on: holder, reduced: true, restoreTo: writtenAt ?? null, says: saysWhy(nameOfView) }
}

/**
 * The two short sentences, built from the stored view's own name, in the page language.
 *
 * NOTHING IS DRAWN ON THE PAGE FOR THIS. The words appear on demand — on focus, on hover, or in the
 * review pane row — because a sentence drawn beside every reduced mark would be an explanation a
 * reader cannot escape, which design/UX-CONTRACT.md calls a state explained instead of drawn.
 */
function saysWhy(nameOfView: string | null): string {
  if (nameOfView === null) return t('agentWords.marks.noView')
  return t('agentWords.marks.writtenOnNotHere', { view: nameOfView })
}

/**
 * The two short sentences for a place that IS on the screen, drawn as part of something larger.
 *
 * It says where the words are before it says what nobody recorded, because the first is what the
 * reader can act on and the second is a fact about the comment. The same rule as `saysWhy`: nothing
 * is drawn on the page for this, and a reader asks for it.
 */
function saysInside(nameOfView: string | null): string {
  if (nameOfView === null) return t('agentWords.marks.insideNoView')
  return t('agentWords.marks.writtenOnInside', { view: nameOfView })
}

/**
 * Does the region drawn in this one's place carry this one's characters?
 *
 * Same stored field, and a range that contains this range. Null for either side is no, because a
 * region with no characters of its own — a part of a composition, a table row — draws none of them.
 */
function carriesTheSameCharacters(larger: Region | null, region: Region): boolean {
  if (larger === null || larger.field === null || larger.range === null) return false
  if (region.field === null || region.range === null) return false
  if (larger.field !== region.field) return false
  return larger.range.from <= region.range.from && larger.range.to >= region.range.to
}

/**
 * What a rung is called in a sentence, in the page language.
 *
 * `phrase` and not `noun`: `phrase` is the accessible name of that position on the detail control —
 * the words a reader would have SET to get there — so "Written on <phrase>" names something they
 * can act on rather than a word for a length. The English word list reads each phrase from
 * `RUNG_SPECS`, the one declaration of the ladder.
 */
function rungName(rung: Rung): string {
  return t(`settingsPanel.detail.phrase.${rung}`)
}

/**
 * The nearest region holding this one that this drawing DID draw, or null.
 *
 * Walks the tree once building each region's parent, because `Region.parentId` is the id of the
 * holder and the tree is what turns an id back into a region.
 *
 * EXPORTED BECAUSE *View original* WALKS UP THE SAME TREE FOR THE SAME REASON. A part this reading
 * length draws inside something larger is not a part that is absent, and both surfaces have to say
 * the same thing about it — see `viewTheOriginal` in src/web/components/agent/original.ts.
 */
export function nearestDrawn(tree: Region, from: RegionId, drawnHere: ReadonlySet<RegionId>): RegionId | null {
  let at = findRegion(tree, from)
  while (at !== null && at.parentId !== null) {
    if (drawnHere.has(at.parentId)) return at.parentId
    at = findRegion(tree, at.parentId)
  }
  return null
}

/**
 * THE FIRST PART INSIDE THIS ONE THAT THIS DRAWING DID DRAW, or null.
 *
 * THE MIRROR OF `nearestDrawn`, ON THE SAME TREE, FOR THE OTHER HALF OF THE SAME QUESTION. Walking
 * up answers "the page does not draw this row, but it draws the table around it". Walking down
 * answers "the page does not draw an element for the whole body of the report, but twelve blocks of
 * that body are on the screen right now". Measured on 1 September 2026 on OOOt4Kouc5dT: `data`,
 * `section.summary` and `data.blocks` — the top three parts of the tree, all accepted by the write
 * door, and the natural thing to record for a whole-report label — were told there was nowhere to
 * go while 37,246 characters of that very body were drawn.
 *
 * BREADTH FIRST, BECAUSE THE SHALLOWEST DRAWN DESCENDANT IS THE BIGGEST PIECE OF THE PART THE PAGE
 * HAS. Depth first would dive to the first sentence of the first block and land the reader on a
 * line when the whole first block was there to land on.
 */
export function firstDrawnInside(tree: Region, from: RegionId, drawnHere: ReadonlySet<RegionId>): RegionId | null {
  const start = findRegion(tree, from)
  if (start === null) return null
  let level: readonly Region[] = start.children
  while (level.length > 0) {
    for (const one of level) if (drawnHere.has(one.id)) return one.id
    const next: Region[] = []
    for (const one of level) next.push(...one.children)
    level = next
  }
  return null
}
