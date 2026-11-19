// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PAGE SAYS WHEN IT HAS FINISHED DRAWING, AND WHICH ADDRESS IT FINISHED DRAWING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Every browser test and every photographing tool used to wait for `networkidle`, which is
 * Playwright's word for "no network connection for half a second". That is a guess about the page
 * made from outside it, and it has two faults. It is wrong whenever the page holds a connection
 * open on purpose — the messages channel is one, and while it was open on every page
 * `tools/review.mjs` timed out on every photograph it took. And it says nothing about whether the
 * page has drawn anything: a page whose requests all failed is network-idle too.
 *
 * So the page says so itself. `data-mole-office-ready` on the `<html>` element holds THE ADDRESS
 * THIS PAGE HAS FINISHED DRAWING, and it is set when both of these are true:
 *
 *   1. no request the app made through its one transport is still in flight, and
 *   2. React has rendered and its effects have run.
 *
 * ONE WAIT OUTSIDE THE TRANSPORT IS COUNTED AS A REQUEST TOO: the event stream, from the moment a tab
 * joins it until the tab knows whether it missed anything while it connected. The answer can make
 * every list panel read again, so a mark that went on before it was early. src/web/lib/onestream.ts
 * counts that wait with the two functions below. Problem `_PEG8drs25w1`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE VALUE IS THE ADDRESS AND NOT THE WORD YES
 * ---------------------------------------------------------------------------------------
 *
 * Almost every navigation in this app is a change of the part of the address after the `#`, and
 * the browser does not reload the document for one. So a page that has already finished drawing
 * `#/records` is still carrying its finished mark at the instant somebody asks for `#/plan`. A
 * waiter that only looked for the word "yes" would read the old page's mark and take the
 * photograph before the new page had drawn anything.
 *
 * Holding the address closes that: a reader compares the mark against the address the browser is
 * at right now, and the two agree only when this page has finished drawing THIS address. Both
 * halves read `location.hash`, so there is one spelling of the address and not two.
 */

/** The attribute on the `<html>` element. `tools/the-page-is-ready.mjs` waits for this one. */
export const READY_ATTRIBUTE = 'data-mole-office-ready'

/** How many requests through the app's one transport have not answered yet. */
let inFlight = 0

/**
 * WHICH REQUESTS ARE OUT, AND HOW MANY OF EACH, FOR THE FAILURE MESSAGE AND NOTHING ELSE.
 *
 * The mark's meaning is `inFlight`, the count above; this is the same fact with the paths kept.
 * A page that never marks ready is either still asking for something or has failed to draw, and
 * the two want different mends. Until this existed the failure could not say which, and the third
 * sighting of problem e8piR9MLMR_- cost a day for want of it. `readTheReadyState` below is what
 * `tools/the-page-is-ready.mjs` reads when its wait runs out.
 */
const inFlightPaths = new Map<string, number>()

/**
 * HOW MANY THINGS THIS PAGE HAS ASKED FOR SINCE THE ADDRESS LAST CHANGED.
 *
 * Nought means this page has asked for nothing YET, which is a different thing from having
 * everything it asked for. `theFirstDataHasArrived` below is where that difference is made.
 */
let askedForSinceTheAddressChanged = 0

/**
 * WHETHER THE SHELL HAS DRAWN SINCE THE ADDRESS LAST CHANGED. Set by `theShellDrewTheAddress`, which
 * the shell calls from an effect after every new address it draws, and cleared by the `hashchange`
 * listener. It stands in for "asked for something" on a page that asks for nothing: see
 * `theFirstDataHasArrived`.
 */
let theShellDrewSinceTheAddressChanged = false

/** The wait between the last request settling and the mark going on, or null when none is set. */
let settling: ReturnType<typeof setTimeout> | null = null

/**
 * TRUE WHEN THIS PAGE HAS ASKED FOR SOMETHING AND HAS EVERYTHING IT ASKED FOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH HALVES ARE NEEDED
 * ---------------------------------------------------------------------------------------
 *
 * "Nothing is in flight" is also true of a page that has not started yet. Almost every navigation
 * in this app is a change of the part of the address after the hash, the browser does not reload
 * the document for one, and React mounts the new page's components AFTER the address has already
 * changed. So there is a moment — the address is new, every request the old page made has answered,
 * and the new page has not asked for anything yet — when nothing is in flight and nothing of this
 * page has been drawn.
 *
 * THE MARK WENT ON IN THAT MOMENT. Measured on 4 September 2026 over twenty hash navigations, each
 * from a document freshly loaded on another page: NINE of the twenty marked ready and then drew the
 * page. On a record page the body went from 1,215 characters at the mark to 2,108 two seconds
 * later. Problem `owxPT_Bcn9zY`.
 *
 * So the mark waits for this page to have asked for something. `inFlight` counts every request the
 * app has out, the old page's and this one's alike, so nought in flight AND at least one thing
 * asked for since the address changed means every request THIS page made has answered.
 *
 * OR FOR THE SHELL TO HAVE DRAWN THE NEW ADDRESS. A move to an address the shell draws with the same
 * page, such as `#/decisions`, which is read as the governance page already on screen, asks for
 * nothing. Such a page used to wait for the next request of any kind, which was the office's
 * 30-second machine read: six waits of the browser tests took 28 to 30 s each (wave 13t, round 28).
 * The shell's effect runs after the effects of everything it draws, which is where a page's
 * requests start, so once it has run for the new address, nought in flight means this page has
 * every answer it asked for, or asked for none. The gap above is still closed: the flag is cleared
 * at the `hashchange` and set only by that effect, after React has drawn the new address.
 */
function theFirstDataHasArrived(): boolean {
  return theShellHasDrawn && inFlight === 0 && (askedForSinceTheAddressChanged > 0 || theShellDrewSinceTheAddressChanged)
}

/**
 * WHETHER THE SHELL HAS DRAWN AT LEAST ONCE, ONCE THE APP HAS SAID IT IS STARTING. The second half of
 * the mark's meaning, "React has rendered", held as a fact rather than assumed.
 *
 * src/web/main.tsx asks who owns the office before it loads the app, and loads language.ts on the way.
 * language.ts asks for the participants as it loads, so a request was made and had answered while the
 * app's own modules were still loading, and the mark went on over an empty page. On Vite's dev server
 * that gap was about a second, and every picture tools/review.mjs took was blank (1 October 2026).
 *
 * So main.tsx calls `anAppIsStarting` first, and from then the mark waits for the shell (or the guide
 * in its place) to say it has drawn, with `theShellDrewTheAddress`. A page that is not started by
 * main.tsx, such as a test harness that draws one panel into a bare document, never said an app was
 * starting and keeps the rule it had. tests/the-mark-waits-for-the-shell.test.ts holds the app back to
 * prove it.
 */
let theShellHasDrawn = true

/** Called by src/web/main.tsx before anything else: the mark waits for the shell from now on. */
export function anAppIsStarting(): void {
  theShellHasDrawn = false
}

/**
 * THE APP COULD NOT START, AND THE PAGE SAYS WHY. src/web/main.tsx calls this when it could not read
 * who owns the office: the page then shows one sentence and loads nothing else, so nothing more will be
 * asked for or drawn, and the page is marked as drawn at once. Without it, a test or tool waiting on the
 * mark hung until its time ran out (problem sqPRXgx-wMXF).
 */
export function theStartFailedAndThePageSaysWhy(): void {
  theShellHasDrawn = true
  stopSettling()
  mark()
}

/** True on a machine with no document, which is every test that does not open a browser. */
function noDocument(): boolean {
  return typeof document === 'undefined'
}

/** Take the mark off. Called the moment anything could make the drawn page out of date. */
function unmark(): void {
  if (noDocument()) return
  document.documentElement.removeAttribute(READY_ATTRIBUTE)
}

/**
 * Put the mark on, naming the address the browser is at.
 *
 * `location.hash` is empty on an address with no `#` in it, and an empty value is stored rather
 * than skipped: a reader comparing against `location.hash` gets the same empty string.
 */
function mark(): void {
  if (noDocument()) return
  document.documentElement.setAttribute(READY_ATTRIBUTE, window.location.hash)
}

/**
 * WAIT UNTIL THE PAGE HAS STOPPED CHANGING, AND THEN MARK IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A COUNT OF TURNS WAS NOT ENOUGH
 * ---------------------------------------------------------------------------------------
 *
 * This used to wait two turns of the event loop and then mark. The gap it was covering is real: a
 * reply arrives, the component holding it changes its state, React renders and runs its effects,
 * and one of those effects starts the next request the page needs. Two turns is a guess at how long
 * that takes, and it was too short. Measured on 4 September 2026 over twenty hash navigations, each
 * from a document freshly loaded on another page:
 *
 *   - a plan page marked ready and THEN asked for `/api/work`;
 *   - a record page marked ready and THEN asked for its history, growing from 376 elements to 441;
 *   - and three of the twenty grew or shrank after the mark while asking for NOTHING at all, which
 *     is React finishing a render it had started.
 *
 * A longer count of turns would be the same guess with a bigger number, and counting turns cannot
 * cover the gap at all: some of that work is scheduled to happen AFTER the browser has painted, and
 * a paint is not a turn of the event loop. Two of the three faults above are on the far side of one.
 *
 * SO THE PAGE IS WATCHED, AND THE MARK WAITS FOR IT TO GO QUIET. While settling, a
 * `MutationObserver` watches the drawn page; every change starts the wait again; the mark goes on
 * when nothing has changed for `QUIET_MS` and nothing the app asked for is in flight.
 *
 * SIXTY MILLISECONDS, AND WHAT IT BUYS AND COSTS. It is longer than a paint at sixty frames a
 * second, which is the gap that the counting could not cover. It costs sixty milliseconds on every
 * navigation in every browser test and every photograph. Measured over twenty hash navigations,
 * each from a document freshly loaded on another page: nine of twenty were early before this work,
 * and none are now.
 *
 * THE WATCHER IS CONNECTED ONLY WHILE SETTLING. A watcher on the whole document costs something on
 * every change, and outside these few turns nothing reads it. It is connected when a settle starts
 * and disconnected the moment the mark goes on or a new request cancels the settle.
 *
 * `setTimeout` and not `requestAnimationFrame`: a browser that believes its tab is not visible
 * never runs an animation frame, and several of the tools photograph pages in exactly that state.
 */
/** How long the drawn page must go without changing before the mark goes on. */
const QUIET_MS = 60

/**
 * The longest a settle may last while the page keeps changing, before the mark goes on anyway.
 *
 * A page that redraws itself for ever — an animation, a clock — would otherwise never be marked,
 * and every tool waiting on the mark would time out against a page a reader can see perfectly well.
 * At this point the mark goes on and says the honest, slightly weaker thing: nothing this page
 * asked for is still in flight.
 */
const AT_MOST_MS = 1500

/** Set while settling, and stopped the moment the mark goes on or a new request cancels it. */
let watching: MutationObserver | null = null

/** When the settle now running started, for the limit above. */
let settlingSince = 0

/** Stop the wait and the watcher, whether it finished or was cancelled. */
function stopSettling(): void {
  if (settling !== null) {
    clearTimeout(settling)
    settling = null
  }
  if (watching !== null) {
    watching.disconnect()
    watching = null
  }
}

/** Start the quiet wait again, because the page has just changed. */
function waitForQuiet(): void {
  if (settling !== null) clearTimeout(settling)
  settling = setTimeout(() => {
    settling = null
    // SOMETHING IS OUT AGAIN, so this is not the moment. Whoever asked for it settles again.
    if (!theFirstDataHasArrived()) {
      stopSettling()
      return
    }
    stopSettling()
    mark()
  }, QUIET_MS)
}

function settle(): void {
  if (noDocument()) return
  stopSettling()
  settlingSince = Date.now()
  watching = new MutationObserver(() => {
    if (Date.now() - settlingSince > AT_MOST_MS) return
    waitForQuiet()
  })
  // NOT `attributes`: the mark itself is an attribute on the html element, and a watcher that saw
  // it would be watching its own writing. What is being waited for is the drawn page changing.
  watching.observe(document, { childList: true, subtree: true, characterData: true })
  waitForQuiet()
}

/**
 * A request left. Called by the one transport in api.ts, by SummaryBlocks.tsx for a file it reads and
 * PlanGraph.tsx for its layout work, and by src/web/lib/onestream.ts for the stream's first question.
 */
export function aRequestStarted(path = 'a request that did not say which path it was'): void {
  inFlight += 1
  inFlightPaths.set(path, (inFlightPaths.get(path) ?? 0) + 1)
  askedForSinceTheAddressChanged += 1
  stopSettling()
  unmark()
}

/** A request answered, failed, or was given up on. Called for all three. */
export function aRequestSettled(path = 'a request that did not say which path it was'): void {
  inFlight = Math.max(0, inFlight - 1)
  const left = (inFlightPaths.get(path) ?? 1) - 1
  if (left <= 0) inFlightPaths.delete(path)
  else inFlightPaths.set(path, left)
  if (inFlight === 0) settle()
}

/**
 * THE ADDRESS IN THE BROWSER'S BAR CHANGED, SO WHAT IS DRAWN IS THE LAST PAGE'S.
 *
 * Called from a listener on `hashchange`, which fires before React has been told anything. That is
 * the moment the last page's requests stop being evidence about this one, so the count starts
 * again here and only here.
 */
function theBrowsersAddressChanged(): void {
  // WHAT THE LAST PAGE ASKED FOR SAYS NOTHING ABOUT THIS ONE. This is the line that stops the mark
  // going on in the gap before the new page has asked for anything.
  askedForSinceTheAddressChanged = 0
  theShellDrewSinceTheAddressChanged = false
  unmark()
  settle()
}

/**
 * THE SHELL HAS COMMITTED THE ADDRESS IT IS DRAWING, and a page that asks for nothing still gets a
 * wait started.
 *
 * THIS DOES NOT RESET THE COUNT, AND THAT IS THE WHOLE OF WHY IT IS A SECOND FUNCTION. It is called
 * from an effect, after the effects of everything drawn inside the shell — and those effects are
 * where the page's requests start. Resetting the count here threw the new page's own first requests
 * away, and a page whose later requests never came then never satisfied "has asked for something"
 * and was never marked ready, though it had drawn. The regulation page under an agent viewer is
 * that page: it reads its own reply, and then its message panels answer 403 and stop asking.
 * `hashchange` fires before React is told anything, which is the moment a reset is honest.
 */
export function theShellDrewTheAddress(): void {
  theShellHasDrawn = true
  theShellDrewSinceTheAddressChanged = true
  unmark()
  settle()
}

/**
 * WHAT THE PAGE IS STILL WAITING FOR, READ FROM OUTSIDE IT.
 *
 * `tools/the-page-is-ready.mjs` reads this when its wait runs out, so the failure names the
 * requests still in flight instead of only saying that something is. A page whose bundle has not
 * run at all has no such function, which is itself the diagnosis: nothing has tried to draw.
 */
export interface ReadyState {
  /** The same count the mark waits on. Zero means every request answered. */
  inFlight: number
  /** How many requests this page made since the address last changed. Zero means it asked nothing. */
  askedForSinceTheAddressChanged: number
  /** The paths still out, and how many of each. */
  requests: { path: string; count: number }[]
  /** The mark as it stands, so the reader has both halves in one answer. */
  mark: string | null
}

function readTheReadyState(): ReadyState {
  return {
    inFlight,
    askedForSinceTheAddressChanged,
    requests: [...inFlightPaths.entries()].map(([path, count]) => ({ path, count })),
    mark: document.documentElement.getAttribute(READY_ATTRIBUTE),
  }
}

/**
 * WATCH FOR THE ADDRESS CHANGING, from the moment this module is imported.
 *
 * At import rather than in a component, because the mark has to come off before anything else
 * reacts to the new address. A test that asked for a new page and read the mark in the same breath
 * would otherwise read the mark the previous page left.
 *
 * AND LEAVE THE READER ABOVE REACHABLE, under one name that a failed wait can call.
 */
if (!noDocument()) {
  window.addEventListener('hashchange', theBrowsersAddressChanged)
  ;(window as unknown as { __moleOfficeReady?: () => ReadyState }).__moleOfficeReady = readTheReadyState
}
