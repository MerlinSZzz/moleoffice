// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH WORLD THIS PAGE IS TALKING TO, AND WHAT IT DOES WHEN THAT CHANGES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criteria G3 and G4 of design/ground/ACCEPTANCE.md, out of the owner's problem 21. The state to
 * prevent: a real API and a scratch API side by side, a browser still pointing at the scratch
 * database, and health checks that appear green.
 *
 * A reply from the wrong server is a perfectly ordinary-looking reply. So the server says which
 * world it came from on every reply (`x-mole-office-world`, criterion G3), this file remembers the
 * world of the FIRST reply, and a reply from any other world is a failure the page shows rather
 * than data the page draws.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DRAWS: NOTHING, UNTIL SOMETHING IS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Answer F2: nothing on screen in normal use, and a red banner nobody can miss when something is
 * wrong, with the page unusable behind it. The always-visible version was refused because it would
 * teach a reader that the state line is furniture. So this file holds no
 * banner and no words for a page that is fine; `components/WrongWorld.tsx` draws the banner and
 * only ever has something to draw when one of the three checks below has failed.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE CHECKS
 * ---------------------------------------------------------------------------------------
 *
 * 1. **A reply came from another world.** Every reply carries the five facts; the first one is
 *    remembered and every one after it is compared. This is the check that runs on every request.
 * 2. **This page is running older code than the checkout.** `window.moleOfficeServedCode` says how
 *    new the code Vite served this page was; the API says how new the newest of the files the page
 *    is built from is now. Two gate runs were thrown away over exactly this, with nothing on screen
 *    to say the code was old.
 * 3. **The API's database is not the canonical one, and this page was opened on the canonical
 *    address.** Somebody who typed the address of the real Mole Office and got a scratch database
 *    is in the state the whole criterion is about.
 *
 * Checks 2 and 3 are one read of `GET /api/runtime` when the page starts. Check 1 needs nothing of
 * its own: it rides on the requests the page was making anyway.
 *
 * ONE CHANGE OF WORLD IS THIS PAGE'S OWN DOING. Criterion DF28 of
 * design/window/the-data-folder-move.criteria.md. Moving the office's data folder gives the office a
 * new database identity, because the identity is made from the place of the database. While this
 * page's own move is under way, a reply from the same office with only its database changed, whose
 * moved-home header names that database, is the office at its new home. Check 1 then takes it as
 * this page's world and home, as a page loaded again would, and raises no banner.
 * `isThisReplyFromTheMovedOffice` is that test, and nothing else may decide it.
 */

import {
  UNKNOWN,
  WORLD_FIELDS,
  WORLD_HEADER,
  parseWorldHeader,
  worldInWords,
  worldsDiffer,
  type WorldOnTheWire,
} from '../../config/world-header.mjs'
import {
  FRESHNESS_HEADER,
  howLongStale,
  parseFreshnessHeader,
  type FreshnessOnTheWire,
} from '../../config/freshness-header.mjs'
import { parseLocalStamp } from '../../shared/time.ts'

/**
 * One thing that disagrees, with both values and what to do about it.
 *
 * Both values are always carried. "The world changed" without them is a sentence somebody has to go
 * and investigate, and the person reading the banner is usually the person who can fix it in one
 * press if they are told which two things differ.
 */
export interface Disagreement {
  /** What disagrees, in plain words: "the database", "the code this page is running". */
  what: string
  /** What this page has, and it always says where that came from. */
  onThisPage: string
  /** What answered, or what is on the disk now. */
  onTheServer: string
  /** One sentence: what to do. */
  doThis: string
}

/**
 * THE TWO ROWS THAT MEAN "THE CODE IS BEHIND THE CHECKOUT", NAMED ONCE.
 *
 * The freshness reading has two directions, and both are built below with these words: direction 1
 * is this page's own code (`oldCode`), direction 2 is the code the answering server runs
 * (`howOldTheServerSaysItIs`). A decision draws both as one line of title instead of rows inside
 * the blocking banner, so the drawing has to be able to tell these two rows from the
 * others. The values are the ones the reading already carried; naming them
 * is what keeps the drawing from holding a second copy that could drift.
 */
export const THE_CODE_THIS_PAGE_IS_RUNNING = 'the code this page is running'
export const THE_CODE_THE_SERVER_IS_RUNNING = 'the code the server is running'

/**
 * IS THIS TROUBLE ROW ONE OF THE TWO "BEHIND THE CHECKOUT" READINGS?
 *
 * A pure read of the row's own words. The two freshness rows are drawn as a quiet one-line title
 * that blocks nothing; every other row — another world answering, a scratch database, a server that
 * cannot restart — is still the red blocking banner in `WrongWorld.tsx`. The two `what` values live
 * here and not in the component, because they are written where the rows are built.
 *
 * NOT THE SERVER'S `isBehindTheCheckout`, which lives in `src/server/lib/runtime.ts` and answers a
 * different question: whether the code the server loaded is older than the checkout. This one
 * classifies a row the page has already built; the two are not the same fact and must not share a
 * name.
 */
export function isAFreshnessRow(one: Disagreement): boolean {
  return one.what === THE_CODE_THIS_PAGE_IS_RUNNING || one.what === THE_CODE_THE_SERVER_IS_RUNNING
}

/** Where the last reply's world is left for the "Mole Office did not start" page to read. */
export const LAST_WORLD_KEY = 'mole-office.world.last-reply'

/**
 * WHERE THE WORLD THIS PAGE CALLS HOME IS KEPT.
 *
 * Criterion C4 of design/messages/ACCEPTANCE.md section 8: every request from this app carries the
 * caller's home world. The page's home is the world it first opened against, and that has to survive
 * a reload — the whole point of criterion C7 is that the page can be pointed at ANOTHER world, and
 * after that its first reply comes from the world it is visiting rather than from home.
 *
 * `localStorage` AND NOT A MODULE VARIABLE, because a module variable dies with the page and would
 * make the visited world the home the moment somebody pressed reload. Written once and never
 * overwritten: a page that already knows where it lives does not learn it again from a reply.
 */
export const HOME_WORLD_KEY = 'mole-office.world.home'

/**
 * The database identity of the world this page calls home, or null because it has not learnt one.
 *
 * NULL IS A REAL ANSWER. A page that has made no request yet does not know, and a request carrying
 * no home is a local — named, never refused.
 * Guessing would make a visitor look like a local or the other way round.
 */
export function theWorldThisPageCallsHome(): string | null {
  return theHomeWorld()?.database ?? null
}

/**
 * The world this page calls home, with the commit it was serving when this page first met it.
 *
 * THE COMMIT IS KEPT BESIDE THE IDENTITY because criterion C7 asks the visiting strip to say when
 * the world being visited is on a different one, and "the page's commit" is the commit of the world
 * that served this page — which is home. The page's own code carries no commit stamp of its own:
 * `ServedCode` in lib/served.ts records when the newest source file was served, not which commit.
 */
export function theHomeWorld(): { database: string; head: string | null } | null {
  try {
    const said = window.localStorage.getItem(HOME_WORLD_KEY)
    if (said === null || said.trim() === '') return null
    const parsed: unknown = JSON.parse(said)
    if (typeof parsed !== 'object' || parsed === null) return null
    const one = parsed as { database?: unknown; head?: unknown }
    if (typeof one.database !== 'string' || one.database === '') return null
    return { database: one.database, head: typeof one.head === 'string' ? one.head : null }
  } catch {
    // Catching to the letter of invariant 4: what is handled here is "this browser will not let this
    // page read its own storage", which a private window and a blocked-cookies setting both produce.
    // The answer is null, which means "this page does not know where it lives" and is true.
    return null
  }
}

/** Say which world this page calls home, once. A page that already knows is not told again. */
export function rememberTheHomeWorld(world: WorldOnTheWire): void {
  writeTheHomeWorld({ database: world.database, head: world.head }, false)
}

/**
 * SAY WHICH WORLD THIS PAGE CALLS HOME, OVERWRITING WHAT IT REMEMBERED.
 *
 * OP3. The office's own home has moved: a reply from it carried HOME_MOVED_HEADER naming the world
 * that is home now. The page adopts that world, so the very next request carries the new home
 * instead of the one it outlived, and one plain line says so. It is the one case that overwrites:
 * `rememberTheHomeWorld` still writes only when nothing is remembered, so a page pointed at another
 * world on purpose keeps the home it opened against.
 *
 * IT IS A SIBLING AND NOT A SECOND WRITER. Both it and `rememberTheHomeWorld` call the one function
 * below, so the shape stored and the faults handled cannot come apart between them.
 */
export function adoptTheHomeWorld(world: { database: string; head: string | null }): void {
  /**
   * A MOVE TO THE HOME THIS PAGE ALREADY KEEPS IS NO NEWS, and nothing is written or raised for it.
   *
   * The browser keeps a read's answer with its headers, and a later load asks again with the answer's
   * version tag. The first load after a move sent the former home, so the answers it kept carry the
   * moved header. A later load sends the new home and the server answers 304 without that header,
   * and the browser hands this page the kept answer, moved header and all. Until wave 13y round 87
   * the page then adopted the home it already kept and drew the line again, a few seconds after
   * every load, a forced reload too. That was the owner's report of 26 October 2026.
   */
  if (theHomeWorld()?.database === world.database) return
  // THE LINE IS RAISED ONLY WHEN THE HOME WAS REALLY KEPT. A browser that refuses storage leaves
  // this page sending no home and reading as a local, and saying it now uses the new home would be
  // the false success the first invariant forbids.
  if (writeTheHomeWorld(world, true)) sayTheHomeMoved()
}

/** The one writer of the remembered home, shared by the ordinary write and the one overwrite. */
function writeTheHomeWorld(world: { database: string; head: string | null }, replace: boolean): boolean {
  if (world.database === '' || world.database === UNKNOWN) return false
  try {
    if (!replace && window.localStorage.getItem(HOME_WORLD_KEY) !== null) return true
    window.localStorage.setItem(
      HOME_WORLD_KEY,
      JSON.stringify({ database: world.database, head: world.head === UNKNOWN ? null : world.head }),
    )
    return true
  } catch {
    // The same fault and the same answer: the page goes on working and sends no home, which reads as
    // a local. Nothing is refused for it.
    return false
  }
}

/**
 * WHETHER THIS PAGE HAS JUST ADOPTED A NEW HOME, for the one plain line the person reads.
 *
 * A module-level fact and not React state, because the adoption happens in the transport, outside
 * any component, and the line is drawn by the shell. There is no press: the line says a thing
 * happened and disappears when the page is loaded again, which is when it stops being news.
 */
let theHomeMoved = false
const homeMovedListeners = new Set<() => void>()

/** Whether the office has moved home since this page loaded. */
export function theHomeMovedOnThisPage(): boolean {
  return theHomeMoved
}

/** Let a component redraw when the home is adopted. */
export function subscribeToTheHomeMoved(listener: () => void): () => void {
  homeMovedListeners.add(listener)
  return () => {
    homeMovedListeners.delete(listener)
  }
}

function sayTheHomeMoved(): void {
  if (theHomeMoved) return
  theHomeMoved = true
  for (const listener of homeMovedListeners) listener()
}

/** Forget where this page lives, so the next reply sets it again. For a test that changes worlds. */
export function forgetTheHomeWorld(): void {
  try {
    window.localStorage.removeItem(HOME_WORLD_KEY)
  } catch {
    // Nothing to do and nothing to hide: a page that cannot write its storage never wrote this.
  }
}

// --------------------------------------------------------------------------- the state

/** The world of the first reply this page ever read. Null until one arrives. */
let firstWorld: WorldOnTheWire | null = null

/**
 * The world of the LAST reply this page read. Null until one arrives.
 *
 * A DIFFERENT QUESTION FROM `firstWorld`, and the banner needs both: the first is what this page
 * opened against and the last is what is answering now. Criterion C7's "I am visiting on purpose"
 * registers a visit with whatever is answering, so it is the second of the two it has to name.
 */
let lastWorld: WorldOnTheWire | null = null

/** Which world answered most recently, for the one control that acts on it. */
export function theWorldThatAnsweredLast(): WorldOnTheWire | null {
  return lastWorld
}

/** Everything wrong right now. The same array is handed out until something changes. */
let trouble: readonly Disagreement[] = []

/**
 * WHAT EACH CHECK FOUND LAST TIME IT LOOKED, SO A CHECK CAN FIND NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `6LQMP7FiQlrt`. `alsoWrong` only ever added, so a page that had been in the wrong world
 * for one moment stayed blocked until somebody reloaded it, even after everything was right again.
 * The GROUND verifier switched the API under an open page, watched the banner appear, put the right
 * API back, and read three more right-world replies with no reload at all: the banner and the sheet
 * were both still there.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT WORKS
 * ---------------------------------------------------------------------------------------
 *
 * Each check owns its own rows and REPLACES them every time it looks. Finding nothing is a result:
 * it clears that check's rows and leaves every other check's alone. When no check has anything, the
 * banner and the sheet go and the page is usable, with nothing reloaded.
 *
 * The three checks are the three sources below. Two of them run on every reply, which is what makes
 * the recovery automatic; the third runs when the page opens and again while anything is wrong.
 */
type WhatLooked = 'which world answered' | 'the age of the server' | 'this page against the world'

const whatEachCheckFound = new Map<WhatLooked, readonly Disagreement[]>()

const listeners = new Set<() => void>()

/** The last thing the answering server said about the age of its own code. Null until one says. */
let howOldTheServerIs: FreshnessOnTheWire | null = null

/** The one sentence about a server running old code, built once so it does not grow a row a second. */
let theServerIsOld: Disagreement | null = null

/**
 * WHETHER THIS PAGE IS BEHIND THE CHECKOUT, AND HOW MUCH LONGER THE GRACE HAS TO RUN.
 *
 * ONE READ IS NOT ENOUGH, and that is what these two are for. The page reads `GET /api/runtime`
 * when it opens, and a change made a second before that read is inside the grace — so a page that
 * really is behind draws nothing, and, with only one read, would never draw anything. Measured on
 * 4 September 2026: `tests/the-negative-control.test.ts` served a page a stamp from an hour ago and
 * waited thirty seconds for a banner that could not arrive.
 *
 * So `WrongWorld.tsx` asks again once the grace has run out. `howMuchLongerThePageMustWait` is how
 * long that is, in milliseconds, and zero means the grace is already spent.
 */
let thisPageIsBehind = false
let howMuchLongerThePageMustWait = 0

/**
 * WHEN THIS PAGE WAS FIRST FOUND BEHIND THE CHECKOUT, in milliseconds. Null while it is not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `PxJuVufHG6A2`. How long this page had been behind was counted from `newestOnDisk`, the
 * modification time of the newest file in the checkout. That is the LAST change, not the first one
 * after this page was served, so every save restarted the count and the grace never ran out. A page
 * running old code while somebody edits — which is the whole case the banner is for — drew nothing.
 *
 * The count runs from the moment this page was first FOUND behind, and editing does not move it.
 *
 * A RELOAD CLEARS IT, and so does the page catching up: this lives in the module's memory, a reload
 * builds a fresh module graph, and a comparison that finds the page level with the checkout sets it
 * back to null below.
 */
let thePageWasFirstFoundBehindAt: number | null = null

/** Whether the last comparison found this page behind the checkout, whatever the grace said. */
export function thisPageIsBehindTheCheckout(): boolean {
  return thisPageIsBehind
}

/** How long until the grace runs out, in milliseconds. Zero when it already has. */
export function howLongUntilTheGraceRunsOut(): number {
  return howMuchLongerThePageMustWait
}

/** Everything that disagrees right now. Empty means the page is where it thinks it is. */
export function worldTrouble(): readonly Disagreement[] {
  return trouble
}

/**
 * READ WHAT THE ANSWERING SERVER SAYS ABOUT THE AGE OF ITS OWN CODE, OFF ONE REPLY.
 *
 * Every reply carries it — `src/config/freshness-header.mjs` says why it is its own header — so the
 * page learns it from the requests it was making anyway and never asks a second time.
 *
 * IT DRAWS NOTHING BY ITSELF. What it does is keep the last reading, which `compareThisPageWith`
 * reads when the page starts and whenever it is asked again. A server too old to send this header
 * says nothing rather than reading as fresh, because "the code is current" is a claim and silence
 * is not.
 *
 * @returns the reading, or null when the reply did not carry a readable one
 */
export function howOldTheServerSaysItIs(
  headerValue: string | null,
  /** The moment this reply arrived. A parameter so a test can hold the clock still. */
  noticedAt: number = Date.now(),
): FreshnessOnTheWire | null {
  const read = parseFreshnessHeader(headerValue)
  if (!read.ok) return null
  howOldTheServerIs = read.reading
  const old = read.reading.verdict === 'stale' && read.reading.staleFor !== null && read.reading.staleFor > read.reading.grace
  /**
   * THE SENTENCE IS BUILT ONCE AND KEPT WHILE IT IS STILL TRUE, AND IT GOES WHEN IT IS NOT.
   *
   * The number grows every second, and the banner tells one row from another by its words. Building
   * the sentence again on every reply would add a row a second, so it is built once and says
   * exactly what it is: how long the server HAD been behind when this page first saw it.
   *
   * A REPLY SAYING THE SERVER IS CURRENT CLEARS IT, with nothing reloaded. That is the recovery
   * problem `6LQMP7FiQlrt` was about: this check found only faults before, so a server that was
   * restarted left its banner up until somebody pressed reload.
   */
  if (old) {
    theServerIsOld ??= {
      what: THE_CODE_THE_SERVER_IS_RUNNING,
      onThisPage: 'expecting the code that is in the checkout',
      onTheServer:
        'running code older than the checkout, and had been for ' +
        `${howLongStale(read.reading.staleFor ?? 0)} when this page noticed`,
      doThis:
        'The server this page talks to is running older code than the checkout. Restart it; this ' +
        'goes on its own once it is running the new code.',
    }
    whatWeFound('the age of the server', [theServerIsOld])
  } else {
    theServerIsOld = null
    whatWeFound('the age of the server', [])
  }
  return read.reading
}

/** What the server last said about its own code, for a test or a tool reading it off the page. */
export function theAgeTheServerReports(): FreshnessOnTheWire | null {
  return howOldTheServerIs
}

/** The world of the first reply, for a test or a tool that wants to read it off the page. */
export function theWorldThisPageStartedIn(): WorldOnTheWire | null {
  return firstWorld
}

export function subscribeToTheWorld(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function announce(next: readonly Disagreement[]): void {
  // Nothing changed means nothing is announced: React re-renders on every notification, and a
  // banner that re-renders on every request is a banner that flickers.
  if (next.length === trouble.length && next.every((d, i) => sameDisagreement(d, trouble[i]))) return
  trouble = next
  for (const listener of listeners) listener()
}

function sameDisagreement(a: Disagreement, b: Disagreement | undefined): boolean {
  return b !== undefined && a.what === b.what && a.onThisPage === b.onThisPage && a.onTheServer === b.onTheServer
}

/**
 * WHAT ONE CHECK FOUND THIS TIME, WHICH REPLACES WHAT IT FOUND LAST TIME.
 *
 * An empty list is a real answer and the important one: it is how a check says the thing it watches
 * is right again. It clears that check's rows and touches nobody else's.
 */
function whatWeFound(looking: WhatLooked, found: readonly Disagreement[]): void {
  whatEachCheckFound.set(looking, found)
  announce([...whatEachCheckFound.values()].flat())
}

/** Forget everything, so the next reply is read as the first. For a test, and for nothing else. */
export function forgetTheWorldOnThisPage(): void {
  lastWorld = null
  firstWorld = null
  trouble = []
  whatEachCheckFound.clear()
  howOldTheServerIs = null
  theServerIsOld = null
  thisPageIsBehind = false
  howMuchLongerThePageMustWait = 0
  thePageWasFirstFoundBehindAt = null
  theHomeMoved = false
  thisPagesMove = false
  for (const listener of listeners) listener()
  announceTheMove()
}

// ------------------------------------------------------- check 1: which world answered

/**
 * DF28. WHETHER THIS PAGE'S OWN MOVE OF THE DATA FOLDER IS UNDER WAY.
 *
 * The data folder panel says so from the move press's 202, or from a reading that names a move still
 * running, and says it is over when a reading says the move is no longer running. It is a module fact
 * and not React state, because the transport reads it, and because the move goes on when the person
 * leaves Settings and the panel is gone.
 */
let thisPagesMove = false

/** Listeners for the one fact above, so the banner can stop standing over the page when the move ends. */
const thisPagesMoveListeners = new Set<() => void>()

/** Say that this page's own move is under way: it pressed the move, or it read a move still running. */
export function thisPagesMoveIsUnderWay(): void {
  if (thisPagesMove) return
  thisPagesMove = true
  announceTheMove()
}

/** Say that this page's own move is over: the office answered a reading that is not a move still running. */
export function thisPagesMoveIsOver(): void {
  if (!thisPagesMove) return
  thisPagesMove = false
  announceTheMove()
}

/** Whether this page's own move is under way now, for a component that draws something differently while it is. */
export function thisPagesMoveIsUnderWayNow(): boolean {
  return thisPagesMove
}

/** Hear when the fact above changes. */
export function subscribeToThisPagesMove(listener: () => void): () => void {
  thisPagesMoveListeners.add(listener)
  return () => {
    thisPagesMoveListeners.delete(listener)
  }
}

function announceTheMove(): void {
  for (const listener of thisPagesMoveListeners) listener()
}

/**
 * THE ONE FACT A MOVE CHANGES: THE DATABASE THE OFFICE ANSWERS FROM. Named from `WORLD_FIELDS` so the banner recognises the
 * row by the same words check 1 built it from, and never by a copy.
 */
const THE_DATABASE_ROW = WORLD_FIELDS.find((one) => one.key === 'database')?.what ?? 'the database'

/**
 * WHETHER THE ONLY THING WRONG IS THE DATABASE, WHILE THIS PAGE'S OWN MOVE IS UNDER WAY.
 *
 * A move changes the database identity and nothing else. While this page's own move is under way, that one row is the
 * moved office before its moved-home header has arrived, and the page cannot tell it from an office that started on a
 * wrong database. The banner still says so, but it stands above the page instead of over it, so the data folder panel's
 * load-again press stays reachable. Every other row, and every database row outside this page's own move, still shuts
 * the page.
 */
export function theOnlyTroubleIsTheDatabaseOfThisPagesMove(found: readonly Disagreement[] = trouble): boolean {
  if (!thisPagesMove || found.length === 0) return false
  return found.every((one) => one.what === THE_DATABASE_ROW)
}

/**
 * DF28. IS THIS REPLY FROM THE OFFICE THIS PAGE MOVED, ANSWERING FROM ITS NEW HOME?
 *
 * The one test of "the moved office", asked by check 1 below. Each part is there for its own reason.
 *
 * - THIS PAGE'S OWN MOVE IS UNDER WAY. Only a move explains a new identity. Any other reply from
 *   another identity is the wrong world the banner is for.
 * - A WORLD IS KNOWN. Before the first reply there is no office to have moved, and no home to move
 *   from.
 * - THE REPLY DIFFERS FROM THAT WORLD IN ITS DATABASE AND IN NOTHING ELSE. A move changes only the
 *   database. A reply from another checkout, another port, another commit or another standing is
 *   another office, moved or not.
 * - THE MOVED-HOME HEADER NAMES THE REPLY'S OWN DATABASE. That header (OP2) is the server saying
 *   that the home this request sent is its own former home, and naming the database that is home
 *   now. A header that names another database is not about the office that answered, and a reply
 *   with no header has not said that it moved.
 */
export function isThisReplyFromTheMovedOffice(answered: WorldOnTheWire, movedHome: string | null): boolean {
  if (!thisPagesMove) return false
  if (firstWorld === null) return false
  const differences = worldsDiffer(firstWorld, answered)
  if (differences.length !== 1 || differences[0]?.key !== 'database') return false
  return movedHome !== null && movedHome.trim() === answered.database
}

/**
 * Read the world off one reply, and say whether this reply may be used.
 *
 * WHAT IT RETURNS: null when the reply is from the world this page started in, which is the
 * ordinary case and the silent one. A list when it is not, and then the transport throws it away
 * — criterion G3's *treats a reply from another world as an error it shows, never as data*.
 *
 * A REPLY WITH NO WORLD HEADER IS ONLY A FAULT ONCE A WORLD IS KNOWN. Before the first world
 * arrives there is nothing to disagree with, and a page whose very first request was answered by
 * something with nothing to say is a page whose server is not there — a different fault, with its
 * own sentence, already drawn by the transport. Once a world IS known, a reply that has stopped
 * saying which world it came from is a change of world with the evidence missing, and it is
 * refused like any other.
 *
 * THE SECOND VALUE IS THE REPLY'S MOVED-HOME HEADER, for criterion DF28. The transport, the page's
 * event stream and a terminal's stream hand it on.
 */
export function theWorldThatAnswered(headerValue: string | null, movedHome: string | null = null): readonly Disagreement[] | null {
  const read = parseWorldHeader(headerValue)
  if (!read.ok) {
    if (firstWorld === null) return null
    const wrong: Disagreement[] = [
      {
        what: 'which Mole Office answered',
        onThisPage: `every earlier reply came from ${worldInWords(firstWorld)}`,
        onTheServer: `this reply did not say, because ${read.why}`,
        doThis:
          'Something other than the server this page started with is answering now. Start the server ' +
          'this page opened against; this goes on its own as soon as it answers again.',
      },
    ]
    whatWeFound('which world answered', wrong)
    return wrong
  }
  rememberForTheBootPage(read.world)
  lastWorld = read.world
  // AND WHERE THIS PAGE LIVES, from the first reply it ever reads. Criterion C4. It is written once,
  // so a page that has been pointed at another world keeps the home it opened against.
  rememberTheHomeWorld(read.world)
  if (firstWorld === null) {
    firstWorld = read.world
    return null
  }
  // DF28. THE OFFICE THIS PAGE MOVED IS ANSWERING FROM ITS NEW HOME. It is this page's world from now
  // on, any banner check 1 raised goes, and its database is kept as this page's home, so the next
  // request sends the new home.
  if (isThisReplyFromTheMovedOffice(read.world, movedHome)) {
    firstWorld = read.world
    whatWeFound('which world answered', [])
    adoptTheHomeWorld({ database: read.world.database, head: read.world.head })
    return null
  }
  const differences = worldsDiffer(firstWorld, read.world)
  if (differences.length === 0) {
    // THE WORLD THIS PAGE OPENED AGAINST IS ANSWERING AGAIN. Saying so is what lets the banner go.
    whatWeFound('which world answered', [])
    return null
  }
  const wrong = differences.map((one) => ({
    what: one.what,
    onThisPage: `${one.expected}, which is what answered when this page opened`,
    onTheServer: `${one.answered}, which is what answered just now`,
    doThis:
      'A different Mole Office is answering this page than the one it opened against. Start the one it ' +
      'opened against, or stop the one that is answering; this goes on its own when it does.',
  }))
  whatWeFound('which world answered', wrong)
  return wrong
}

/**
 * Leave the last reply's world where the "Mole Office did not start" page can find it.
 *
 * That page is plain HTML served before any code runs, so it cannot ask anybody anything. What it
 * CAN do is read what the last working load of this tab left behind, and say which world this tab
 * was talking to — which, when the app has just stopped starting, is most of the answer. Criterion
 * G4 asks for exactly that.
 *
 * `sessionStorage`, so it is this tab's own and dies with it. A browser that refuses storage throws
 * here and is caught: a page that cannot leave a note for its own failure page is not a page that
 * should stop working.
 */
function rememberForTheBootPage(world: WorldOnTheWire): void {
  try {
    window.sessionStorage.setItem(LAST_WORLD_KEY, worldInWords(world))
  } catch {
    // Nothing is lost that this page needs; the boot page will say it has no world to report, which
    // is true. Storage that refuses is already reported to the reader by lib/store.ts when a
    // setting cannot be kept.
  }
}

// ------------------------------------- checks 2 and 3: old code, and a database nobody meant

/** The part of `GET /api/runtime` these two checks read. Typed here, against the shared shape. */
export interface RuntimeFactsForThePage {
  addresses: {
    canonicalWeb: string
    /**
     * The address another machine would reach the browser app at, as the checkout declares it, or
     * null because the checkout declares none. It is a SECOND canonical address and not a different
     * kind of thing: a person who opens Mole Office from their other machine has typed the address of
     * the real one just as much as a person who typed the loopback one.
     */
    canonicalWebForOtherMachines: string | null
  }
  database: { path: string; canonicalPath: string; canonical: boolean }
  freshness: {
    verdict: string
    newestOnDisk: string | null
    newestOnDiskFile: string | null
    /**
     * The newest of the files the BROWSER APP is built from, and which file it is. This page is
     * compared against these and never against `newestOnDisk`, which is about the files the SERVER
     * is built from: a change the page never loads does not make the page's code old. Problem
     * `2hadqssN_rc4`.
     */
    newestForThePage: string | null
    newestFileForThePage: string | null
    /**
     * What those files hold now, as a digest of their paths and contents. A page from a build is
     * judged by this when its build recorded the same digest, and by the times when either is
     * missing. Absent from a server older than wave 13y round 87, which is read as not known.
     */
    contentForThePage?: string | null
  }
  /**
   * WHAT THE SUPERVISOR OF THIS SERVER'S PORT SAYS ABOUT ITS OWN FAILED STARTS.
   *
   * `failedStarts` is null in the ordinary case, which is every case but one. Problem
   * `5ZHmJ4_C26Y8`: a page can be talking to a server that answers perfectly and is the last one
   * there is going to be, because the thing that replaces it cannot start. Nothing about the
   * answering server says that, so the supervisor says it.
   */
  supervisor: { failedStarts: { count: number; lastExit: string; says: string; supervisor: { pgid: number } } | null }
}

/**
 * WHAT THIS PAGE SAYS OF ITS OWN CODE, from `ServedCode` in lib/served.ts.
 *
 * `servedAt` is always there. `fromABuild` and `contentDigest` may be absent, and absence is read as
 * a page from a dev server, which is judged by the times.
 */
export interface ServedStamp {
  servedAt: string
  fromABuild?: boolean
  contentDigest?: string | null
}

/**
 * Compare what this page is running, and what it is talking to, with what the API says.
 *
 * ON `GET /api/runtime` RATHER THAN `GET /api/runtime/freshness`: the freshness route builds its
 * answer by calling `runtimeRecord()`, so the two routes read exactly the same thing and the
 * whole-record one also carries the database and the addresses these checks need. Asking the
 * freshness route as well would be a second identical read of a process table and a git checkout
 * for facts already in hand.
 *
 * THE PAGE'S OWN ADDRESS IS PART OF CHECK 3 and that is the owner's wording: the database being
 * scratch matters *while the page was opened on the canonical address*. Somebody who deliberately
 * opened a scratch stack on a scratch port has not made a mistake. Somebody who typed the address
 * of the real one and got a scratch database has.
 *
 * THE CANONICAL ADDRESS IS `addresses.canonicalWeb` AND NOT `addresses.web`. The second is where
 * the server answering was told the browser app lives, which for a scratch stack is the scratch
 * stack's own port — so comparing against it would call every deliberate scratch stack a mistake,
 * including the fifty-odd this repository's own test suite starts. The first is what the checkout
 * declares with nothing set in a shell, which is the address a person means when they say "the
 * real one".
 *
 * THE SERVED STAMP IS HANDED IN RATHER THAN IMPORTED. `lib/served.ts` reads a module Vite makes at
 * serve time, which exists only inside the browser app's own build; importing it here would make
 * this whole file unreadable to a test running under Node, and the comparison in it is the part
 * most worth testing.
 */
export function compareThisPageWith(
  facts: RuntimeFactsForThePage,
  pageAddress: string,
  served: ServedStamp,
  /**
   * The moment this comparison is being made, in milliseconds. It is a parameter so that a test can
   * put a stale reading five seconds in the past or five minutes, and prove that the grace lets the
   * first through and the second draw a banner. Nothing in the app passes it.
   */
  now: number = Date.now(),
  /**
   * WHETHER THIS PAGE IS ON A REGISTERED TRIP INTO ANOTHER WORLD. Criterion C7.
   *
   * IT ONLY TURNS OFF CHECK 3, and that is the whole of it. A person who pressed Enter on the
   * Worlds page MEANT to be reading a scratch database from the address this checkout calls the
   * real one — that is what entering another world is — so the third check's sentence is not true
   * of them. It was drawn anyway, over the visiting page, and it blocks every press: the citizens
   * verifier measured the Return home button unpressable from http://127.0.0.1:29845 and the only
   * way out being to clear the browser's storage. Problem `plIxEJLvVmJM`.
   *
   * THE OTHER CHECKS STILL FIRE WHILE VISITING. Old code in either half and a supervisor that
   * cannot start a server are faults about the code and the machine, not about which world a
   * person meant to be in, and a trip says nothing about them.
   */
  visiting = false,
): readonly Disagreement[] {
  const found: Disagreement[] = []

  /**
   * OLD CODE, IN EITHER DIRECTION, ONCE IT HAS STAYED OLD FOR LONGER THAN THE GRACE.
   *
   * Two halves of one stack can be behind the checkout separately, and until 4 September 2026 only
   * one of them was ever drawn. `oldCode` below is where both are worked out; the block above it
   * says what each one means and what the grace is for.
   */
  found.push(...oldCode(facts, served, now))

  /**
   * THE SERVER CANNOT BE REPLACED, however well the one that is up is answering.
   *
   * This is not a disagreement between the page and the server — both of them are right — so it
   * would never have been found by the two comparisons around it. It is put here because this is
   * where the banner's rows come from, and because answer F2 is that a fault is a red banner
   * nobody can miss. A page that goes on looking normal while every restart fails is the state
   * problem `5ZHmJ4_C26Y8` left the owner in for forty-seven minutes.
   */
  const failing = facts.supervisor.failedStarts
  if (failing !== null) {
    found.push({
      what: 'the server this page talks to',
      onThisPage: 'expecting a server that restarts itself when the code changes',
      onTheServer: failing.says,
      doThis:
        `Stop the supervisor by its process group and start it again: kill -TERM -${String(failing.supervisor.pgid)}, ` +
        'then npm run dev:server. Read the last lines the server printed in the runtime page or in ' +
        '.logs/the-supervisor-cannot-start-a-server.json; this goes on its own once a server starts.',
    })
  }

  if (!visiting && !facts.database.canonical && onAnAddressThisCheckoutCallsTheRealOne(facts, pageAddress)) {
    found.push({
      what: 'the database behind this page',
      onThisPage: `opened at ${pageAddress}, which is the address this checkout calls the real one`,
      onTheServer: `answering out of ${facts.database.path}, and the canonical database is ${facts.database.canonicalPath}`,
      doThis:
        'You are on the address of the real Mole Office and a scratch database is answering. Stop the ' +
        'server on this port and start the real one, or open the scratch stack on its own address; ' +
        'this goes on its own when it does.',
    })
  }

  whatWeFound('this page against the world', found)
  return found
}

/**
 * BOTH DIRECTIONS OF THE OLD-CODE FAULT, AND THE GRACE THAT KEEPS A RELOAD OFF THE SCREEN.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 * 1. **This page is behind the checkout.** Vite served it code from before the newest save. This is
 *    the fault that threw away two whole gate runs: a browser serving a seven-hour-old transform of
 *    `src/shared` while the server had the new one, with nothing on screen to say so.
 *    A page from a build is behind when the files it is built from hold something other than what
 *    the build read. The body below says how that is known.
 * 2. **The server this page talks to is behind the checkout.** It says so itself, on the freshness
 *    header of every reply. Until 4 September 2026 nothing drew this. The GROUND verifier measured
 *    the miss: the server had loaded `src/` at 23:20:53, the page was served at 23:21:41, two
 *    measuring tools refused to measure, and the page said nothing at all. Problem `JoI0x23xXBRK`.
 *
 * Both are the same sentence to a reader — *what you are looking at is not what is in the checkout*
 * — so both are drawn, and each names which half is behind.
 *
 * ---------------------------------------------------------------------------------------
 * THE GRACE
 * ---------------------------------------------------------------------------------------
 *
 * Neither fires until the staleness has lasted longer than the grace, which is
 * `MOLE_OFFICE_STALE_CODE_GRACE` in src/config/settings.mjs, fifteen seconds by default, and
 * arrives on the freshness header because a browser cannot read that file.
 *
 * WHY. Both halves are normally behind for a second or two while a save is picked up: a `tsx watch`
 * restart takes about two seconds, and Vite hands the page new code a moment after. A banner in
 * that window would be the product shouting about its own reload.
 *
 * IT ALSO REPLACES A CONDITION THAT WAS DOING THIS JOB BADLY. The page used to say nothing whenever
 * the SERVER was behind too, on the reasoning that the two halves then agree with each other. That
 * silenced direction 2 completely. The real reason that condition was there was measured on
 * 3 September 2026: `tests/freshness-is-provable.test.ts` touches `src/shared/time.ts` on purpose
 * and puts the modification time back at the end, and three browser tests in the same run came up
 * behind a red banner about a file nobody had really changed. The touch lasts a moment, so a grace
 * answers it without silencing anything.
 *
 * HOW LONG IS COUNTED, NOT GUESSED. The server counts its own staleness and sends the number, so
 * the page never has to agree with that machine about the clock. The page counts its own from the
 * moment it was FIRST FOUND behind, which is what "how long it has been behind" means.
 *
 * IT USED TO COUNT FROM `newestOnDisk`, the modification time of the newest file in the checkout.
 * That is the last change rather than the first one after this page was served, so each save
 * restarted the count and the grace never ran out while somebody was working. Problem
 * `PxJuVufHG6A2`; the clock is `thePageWasFirstFoundBehindAt` at the top of this file.
 */
function oldCode(
  facts: RuntimeFactsForThePage,
  served: ServedStamp,
  now: number,
): Disagreement[] {
  const found: Disagreement[] = []
  const grace = howOldTheServerIs?.grace ?? null

  // Direction 1: this page is behind the checkout — the part of the checkout it is built from.
  const servedAt = parseLocalStamp(served.servedAt)
  /**
   * THE FILES THE PAGE IS BUILT FROM, NOT THE WHOLE OF `src/` AND NOT A FOLDER.
   *
   * `newestOnDisk` is the server's set, and a change the page never loads does not make the page's
   * code old: the page never had that code. Comparing against the whole of `src/` put a red sheet
   * over the owner's live page a minute after a server-only merge, about a page whose modules were
   * as new as they could be. Problem `2hadqssN_rc4`.
   */
  const onDisk =
    facts.freshness.newestForThePage === null
      ? null
      : parseLocalStamp(facts.freshness.newestForThePage)
  /**
   * A PAGE FROM A BUILD IS JUDGED BY WHAT ITS FILES HOLD, when its build and the server both say.
   *
   * The owner's report of 26 October 2026 (wave 13y round 87): a page built from the commit the office
   * was serving was "behind" on every load, because files it is built from had been touched after the
   * build without being changed. src/config/content-digest.mjs says what the digest is. When either
   * digest is missing, the times decide as before, and the row says so. A page from a dev server has
   * no digest and is judged by the times, which is right for it: Vite stamps it again on every change
   * to those files, a touch too.
   */
  const builtFrom = served.contentDigest ?? null
  const holdsNow = facts.freshness.contentForThePage ?? null
  const byContent = builtFrom !== null && holdsNow !== null
  thisPageIsBehind =
    grace !== null && (byContent ? builtFrom !== holdsNow : servedAt !== null && onDisk !== null && onDisk > servedAt)
  // THE CLOCK, TOLD ON EVERY COMPARISON. A page level with the checkout was never behind as far as
  // the next comparison is concerned, so the clock goes back to null and a later staleness is
  // counted from when it started rather than from an earlier one that ended.
  if (!thisPageIsBehind) thePageWasFirstFoundBehindAt = null
  else thePageWasFirstFoundBehindAt ??= now
  if (thisPageIsBehind && grace !== null && thePageWasFirstFoundBehindAt !== null) {
    // HOW LONG IT HAS BEEN BEHIND, counted from when it was first found behind. Counting from the
    // newest file's modification time is what problem `PxJuVufHG6A2` was: every save moved that
    // moment forward, so the count went back to nearly nothing while somebody was working.
    const staleFor = Math.floor((now - thePageWasFirstFoundBehindAt) / 1000)
    howMuchLongerThePageMustWait = staleFor > grace ? 0 : (grace - staleFor + 1) * 1000
    if (staleFor > grace) {
      const doThis =
        'This page is running older code than the checkout. It goes on its own as soon as the ' +
        'browser app serves this page the new code; if it does not, that server has to be restarted.'
      // A BUILT PAGE JUDGED BY THE TIMES SAYS SO, and why, because a touch alone makes the times disagree.
      const byTheTimes =
        served.fromABuild === true && !byContent
          ? ` It was judged by the files' times alone, because ${
              builtFrom === null ? "this page's build did not record what it read" : 'the server did not say what those files hold'
            }.`
          : ''
      found.push(
        byContent
          ? {
              what: THE_CODE_THIS_PAGE_IS_RUNNING,
              onThisPage: `built at ${served.servedAt}, and has been behind the checkout for ${howLongStale(staleFor)}`,
              onTheServer: 'the files the browser app is built from hold something other than what this page was built from',
              doThis,
            }
          : {
              what: THE_CODE_THIS_PAGE_IS_RUNNING,
              onThisPage: `served as it was at ${served.servedAt}, and has been behind the checkout for ${howLongStale(staleFor)}`,
              onTheServer:
                `${facts.freshness.newestFileForThePage ?? 'a file the browser app is built from'} was ` +
                `changed at ${String(facts.freshness.newestForThePage)}, and that is what the checkout holds`,
              doThis: doThis + byTheTimes,
            },
      )
    }
  }

  // Direction 2 is not here. It is read off every reply, in `howOldTheServerSaysItIs` above, because
  // a server can fall behind long after this page loaded and this comparison is made once.
  return found
}

/** Two addresses naming the same place, ignoring a trailing slash. */
function sameAddress(one: string, other: string): boolean {
  return one.replace(/\/+$/, '') === other.replace(/\/+$/, '')
}

/**
 * WAS THIS PAGE OPENED ON AN ADDRESS THIS CHECKOUT CALLS THE REAL ONE? THERE CAN BE TWO OF THEM.
 *
 * The loopback one, always, and the one other machines reach this computer at when the checkout
 * declares one. Both are read from `.env` alone rather than from the server that answered, for the
 * reason `canonicalWeb`'s own note gives: a scratch stack knows its own address perfectly well, and
 * comparing against what it was told would call every deliberate scratch stack a mistake.
 *
 * WHY THE SECOND ONE WAS MISSING, MEASURED. Until 4 September 2026 only the loopback address was
 * compared, so a page opened over the tailnet and answered end to end by a copy of the database drew
 * NOTHING — found by the negative control's own remote case, the first time it ran. The check was
 * silent for exactly the reader who is furthest from the machine and least able to notice for
 * themselves that they were on the wrong one.
 */
function onAnAddressThisCheckoutCallsTheRealOne(facts: RuntimeFactsForThePage, pageAddress: string): boolean {
  if (sameAddress(facts.addresses.canonicalWeb, pageAddress)) return true
  const forOthers = facts.addresses.canonicalWebForOtherMachines
  return forOthers !== null && sameAddress(forOthers, pageAddress)
}

// ------------------------------------------------------------------ there is no way past this

/**
 * THERE IS NO DISMISSAL, AND THERE WAS ONE.
 *
 * The banner used to carry a button reading "Let me use it anyway". One press removed the banner
 * and the sheet, and the page then read and could write the wrong database in silence; the press
 * was kept in `sessionStorage`, so a reload did not ask again. The GROUND verifier measured it on
 * 3 September 2026: after one press, a click on a link went through, the page drew 697 elements,
 * and a reload in the same tab drew no banner. Problem `gYBEA5B6KC9h`.
 *
 * Two sentences say it should not exist. The criterion's: *the page is not usable behind it.* And
 * answer F2's: completely unusable. A button that makes the
 * page usable is the criterion undone by a press, and writes are the worse half, because
 * `api.ts` checks the world on the REPLY: a write has already reached the wrong database before
 * the page throws the answer away.
 *
 * SO THE SHEET STAYS UNTIL THE WORLD IS RIGHT AGAIN, and nothing on the page can remove it. It goes
 * when the world is right and not before, and it does that WITHOUT A RELOAD: every check replaces
 * its own rows each time it looks, finding nothing clears them, and the moment no check has anything
 * the banner and the sheet go and the page is usable again.
 *
 * That last part is new. `alsoWrong` used only to add, so a page that had been wrong for one moment
 * stayed blocked until somebody reloaded, and the banner told the reader to reload — which is a way
 * past the sheet that happens to also throw the page's state away. Problem `6LQMP7FiQlrt`. Putting
 * the right server back is the way out now, and the reader is told that instead.
 *
 * Nothing is written to `sessionStorage` about this at all. The only thing this file keeps there
 * is the last reply's world, for the "Mole Office did not start" page to read, and that is a note
 * about which world answered rather than permission to ignore it.
 */

/** The two header names, re-exported so a page or a test reads them from one place. */
export { WORLD_HEADER, FRESHNESS_HEADER }
