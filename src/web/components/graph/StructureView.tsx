// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useLanguage } from '../../lib/language.ts'
import { t } from '@shared/i18n.ts'
import { kindWord } from '@shared/words.ts'
import { useInspect } from '../../lib/mode.ts'
import { currentWorkspace } from '../../lib/workspace.ts'
/**
 * THE PROJECT STRUCTURE, DRAWN. The shell around the canvas and the outline.
 *
 * ---------------------------------------------------------------------------------------
 * TWO COMPOSITIONS OF ONE MEANING, CHOSEN BY WIDTH
 * ---------------------------------------------------------------------------------------
 *
 * `model.ts` builds the meaning. `Canvas.tsx` draws it as boxes and lines. `Outline.tsx` prints the
 * same object as a reading layer. This file decides which one a reader gets, and lets them have the
 * other.
 *
 * AT 390px THE OUTLINE IS WHAT YOU GET. That is the honest answer and it was arrived at rather than
 * assumed: a phone holds about two module cards at a readable type size, so reaching the third means
 * dragging, and dragging is how you lose the one you were reading. Every fact is in the outline, in
 * a stated order, reachable by find-in-page and by a screen reader. The canvas is one press away and
 * the press says what it is going to give you.
 *
 * ON A DESK THE CANVAS IS WHAT YOU GET, and the outline is one press away for the same reasons in
 * reverse: it prints, it is searchable, and its order is a fact rather than a picture to be trusted.
 *
 * ---------------------------------------------------------------------------------------
 * THE MODEL IS COMPLETE. THE CANVAS PROJECTS FROM IT. THE OUTLINE RENDERS THE COMPLETE MODEL
 * ---------------------------------------------------------------------------------------
 *
 * THIS REPLACES AN INVARIANT THIS FILE USED TO STATE, AND IT IS RETIRED ON PURPOSE. The words were:
 * "They render the same `StructureGraph`. If a fact is not in that object it is in neither, and if
 * it is in that object it is in both." It was worth having. It made one failure impossible — A
 * CANVAS THAT QUIETLY SHOWS LESS THAN THE PROJECT — by leaving the drawing no way to show less at
 * all, and it is the reason every fold in this directory (a collapsed pipeline, the `carries`
 * bundle) had to go through the MODEL and be counted there.
 *
 * It also settled a product question by construction that had not been decided, and the answer it
 * gave was measured and bad: 27 modules with 5 links between them is 7,924 × 364 px of drawing, six
 * windows across, 17% of it in the window, ONE ROW at every size — because 17 of the 27 join nothing
 * and a layered layout packs unconnected components into a strip. That was resolved (see
 * design/DECISIONS-PENDING.md §11 and design/wave3/11-canvas-projection.md): the canvas may show a
 * selective projection. So the boundary is now three statements rather than one:
 *
 *   1. THE MODEL IS COMPLETE. `model.ts` builds every card, every line, every fact, and counts what
 *      the SCOPE leaves out in `graph.omitted`. Nothing about a drawing removes anything from it.
 *   2. THE CANVAS PROJECTS. `projectForCanvas` takes that object and returns a smaller one to draw.
 *      It can only remove nodes. It is derived, computed on every draw and stored nowhere.
 *   3. THE OUTLINE RENDERS THE COMPLETE MODEL. It is handed `graph`, never the projection, so every
 *      card the canvas dropped is printed there in full with its links and everything attached.
 *
 * WHAT NOW PREVENTS THE FAILURE THE OLD INVARIANT PREVENTED — four things, and each is on screen:
 *
 *   - The canvas prints, in its own words, how many cards it is not drawing and why. The count is
 *     EXACT, from the projection's own list of them, never rounded and never "some".
 *   - Those cards are named on this page, under the drawing, each a link to its record.
 *   - `Show all` is beside `Graph`, says how many cards it will add, and draws every one of them.
 *   - A projection that would draw NOTHING never draws an empty box: the canvas is replaced by the
 *     sentence saying nothing is linked yet and that every card is in the list below.
 *
 * A drawing that showed less without those four would be the failure, and `tests/graph-projection`
 * fails if any of them stops being true.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE REFUSES TO DO
 * ---------------------------------------------------------------------------------------
 *
 * It does not shorten anything without saying so. What each scope leaves out, from `graph.omitted`,
 * is said where those records are, and the page's body says the one entry that is said nowhere else
 * (wave 13u round 217). What the PROJECTION leaves out is two numbers on two surfaces that
 * add up — the heading tag says `10 / 27 drawn`, the fold under the drawing says `17 isolated` and
 * names every one of them — so an empty canvas because nothing is linked, an empty canvas because
 * the scope excluded everything, and a canvas drawing ten of twenty-seven cards can never look
 * alike. It is not ALSO appended to the scope's list, and neither number is printed twice: both
 * were one fact written twice, a few pixels apart.
 *
 * IT DOES NOT EXPLAIN ITSELF IN STANDING PROSE. Four paragraphs used to do that: the projection's
 * own sentence under the canvas, the canvas's account of reading size and Fit all, its account of
 * what a `carries` line is, and this file's sentence about the layout being derived. Every FACT and
 * every COUNT in them is still in the default view — as clauses, on the surfaces above — and every
 * SENTENCE is still on file, behind a disclosure that names what it holds and opens on a press.
 *
 * It does not load the canvas until somebody wants one. React Flow and elkjs are behind a
 * `React.lazy`, so a reader who stays in the outline never fetches them.
 *
 * ---------------------------------------------------------------------------------------
 * EDIT MODE, AND WHY IT IS A MODE
 * ---------------------------------------------------------------------------------------
 *
 * Editing used to be a second panel under the drawing with every form open at once — add a module,
 * change a card, add a relationship, remove a relationship — under the heading "the same requests an
 * agent sends". It was there whether or not anybody was editing, it was the largest thing on the
 * page, and it made ordinary product editing read as an implementation detail.
 *
 * NOW: NOTHING until somebody presses Edit, and then a drawer beside the drawing that opens ONE
 * action's fields at a time. See Edit.tsx. Reading is the default state of this page and editing is
 * asked for.
 *
 * ---------------------------------------------------------------------------------------
 * PRESENTATION INTENT IS FETCHED HERE, APPLIED IN model.ts, AND REPORTED ON THIS PAGE
 * ---------------------------------------------------------------------------------------
 *
 * A drawing may have stored intent — a direction, a lane, an order, a role, an emphasis, a fold, a
 * `near`. This file does exactly three things with it, and nothing else:
 *
 *   1. FETCHES it for the scope that is open, from GET /api/presentation/:scope.
 *   2. HANDS it to `buildStructureGraph`, which is the thing that applies it.
 *   3. PRINTS `graph.report.unhonoured` on the page, outside any fold.
 *
 * It has no opinion about any hint. Whether an emphasis was taken is model.ts's answer and whether
 * ELK could place a lane is layout.ts's, and both append to the same `LayoutReport`. shared/
 * presentation.ts says a hint the layout could not honour must be REPORTED and never quietly dropped:
 * step 3 is where that reaches a person, so somebody who arranges something and sees the picture stay
 * still is told why rather than deciding the control is broken.
 *
 * ---------------------------------------------------------------------------------------
 * A PAGE THAT DRAWS ITS OWN LANES
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline's page may draw its steps in lanes of its own and give that drawing here as `lanes`. This
 * panel then keeps everything around the drawing (the title, Edit and the drawer, "Which drawing",
 * Graph and List, and the reading, problem and absence states) and puts the page's drawing where the
 * canvas would be, so the canvas is never fetched. Graph is what opens at every width. The count is
 * the page's own cards. Nothing about the canvas's cards is offered (no "Show all", no isolated fold,
 * no fold about stored positions), and "How this is shown" offers only lane and order, the two hints
 * lanes read. The page is handed each answer of the stored-arrangement read through `lanes.onIntent`,
 * because it draws from that answer and must not read it a second time. The page may start the first of
 * those reads itself, with its other reads, and give it here as `readAhead`; this panel takes it as its
 * first read and holds its answer as before (round 238).
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LayoutReport } from '@shared/presentation.ts'
import type { PanelRecord } from '@shared/types.ts'
import { errorMessage } from '../../api.ts'
import { navigate, recordPath } from '../router.tsx'
import { Absence, Panel, ServerNote, Tag, useNarrow } from '../ui.tsx'
import { declaredAttributes } from '../declares.ts'
import { DrawingControl } from './controls.tsx'
import { Edit, presentation, storedHintCount, type StoredIntent } from './Edit.tsx'
import { Outline } from './Outline.tsx'
import { useRestrictionsAndPresence, whatADrawingWithNoMarksSaysByWord, type ASentenceAndItsWord } from './restrictions-and-presence.ts'
import {
  buildStructureGraph,
  intentScopeKey,
  projectForCanvas,
  scopeKey,
  // THE TWO WAYS OF READING A DRAWING, in the reader's words, from the one declaration of them.
  THE_TWO_READINGS as DRAWING_WORDS,
  type GraphInput,
  type GraphLink,
  type Omission,
  type Scope,
  type StructureGraph,
} from './model.ts'

/**
 * The canvas, fetched the first time one is asked for.
 *
 * This one line is what keeps React Flow's runtime, its stylesheet and 8 MB of compiled Java out of
 * the first paint of a page that may never draw a canvas at all.
 */
const Canvas = lazy(() => import('./Canvas.tsx'))

/**
 * THE STORED ARRANGEMENT OF THE DRAWING ON SCREEN, as this panel holds it, for a page that draws from it.
 *
 * Three answers, as `reading` below holds them. `kept` is the last answer that arrived for this same
 * drawing, while a read runs again after a write or after that read failed: null when none has.
 */
export type IntentAnswer =
  | { at: 'reading'; kept: StoredIntent | null }
  | { at: 'read'; stored: StoredIntent }
  | { at: 'failed'; problem: string; kept: StoredIntent | null }

/**
 * THE FIRST READ OF ONE DRAWING'S STORED ARRANGEMENT, STARTED BY THE PAGE BEFORE THIS PANEL IS MOUNTED (round 238).
 *
 * A page mounts this panel only once its records and packages are read, and the panel's own first read began only then,
 * so it waited for those reads though it needs none of them. A page may make this when it opens, start it with its
 * other reads, and give it here as `readAhead`. The panel's first read of the same drawing then takes that request
 * instead of sending its own. Every later read sends its own, the one after a write included. The request is handed out
 * once, so the arrangement is still read once for the first drawing, and the panel still holds the answer.
 */
export interface IntentReadAhead {
  /** Sends the read, once however often it is called. */
  start: () => void
  /**
   * The read, the first time it is asked for with its own drawing's key in the project it was sent in. Null for another
   * drawing's key, after the project has changed, and once it has been taken.
   */
  take: (presentationScope: string) => Promise<StoredIntent> | null
}

export function intentReadAhead(scope: Scope): IntentReadAhead {
  const presentationScope = intentScopeKey(scope)
  let sent: { answer: Promise<StoredIntent>; project: string } | null = null
  let taken = false
  const send = () => {
    if (sent !== null) return sent
    // The request names the project chosen when it is sent.
    sent = { answer: presentation.read(presentationScope), project: currentWorkspace() }
    // The panel that takes the read says its failure. A read nobody takes was drawn from by nothing, and this keeps the
    // browser from reporting its failure as one nobody handled.
    sent.answer.catch(() => undefined)
    return sent
  }
  return {
    start: () => {
      send()
    },
    take: (asked) => {
      if (taken || asked !== presentationScope) return null
      taken = true
      const { answer, project } = send()
      return project === currentWorkspace() ? answer : null
    },
  }
}

export interface StructureViewProps {
  records: readonly PanelRecord[]
  links: readonly GraphLink[]
  attention: NonNullable<GraphInput['attention']>
  /** The project's packages, for a block card that one package names. Absent where the page did not read them. */
  packages?: GraphInput['packages']
  /** Which drawing to start on. */
  scope: Scope
  /** The marked master, when the page has one. */
  masterId?: string | null
  /**
   * The address of a drawing, so the picker can be made of LINKS rather than of buttons.
   *
   * Which drawing is open lives in the address bar now, so every chip in the picker has one. An
   * ordinary anchor is what makes middle-click-to-open, copy-link-address and browser Back work,
   * and this app's `RouteLink` says the same thing in its own docstring. A button would throw all
   * three away to save nothing.
   */
  hrefFor: (scope: Scope) => string
  /** Re-read the records after a write, so the drawing follows the change. */
  onChanged: () => Promise<void>
  /** The clock, passed in, so nothing in this directory keeps one of its own. */
  now: number
  /**
   * WHAT THIS DRAWING COULD NOT SHOW, handed up for the page to say in its body (wave 13u round
   * 217): the canvas's own facts and the one omission nothing else on the page says. Nothing is
   * drawn under the drawing any more. Left out where the view is rendered with no page around it.
   */
  onSays?: (facts: readonly string[]) => void
  /**
   * THE PAGE'S OWN DRAWING, drawn on the Graph side in place of the canvas. See "A page that draws
   * its own lanes" in the header. `records` are the ids of the records it draws: they are the count
   * and what restricts them is said through `onSays`. `onIntent` is called each time the answer for
   * the drawing on screen changes, the re-read after a write in the drawer included. Left out, the
   * panel draws its canvas as before. `onSaysByWord`, when given, is handed what restricts those records and who is
   * working on them again, each sentence with the word key that writes it, so the page can say some in the developer
   * view only (16 November 2026).
   */
  lanes?: {
    drawing: ReactNode
    records: readonly string[]
    onIntent: (answer: IntentAnswer) => void
    onSaysByWord?: (sentences: readonly ASentenceAndItsWord[]) => void
  }
  /**
   * THE FIRST READ OF THE STORED ARRANGEMENT, when the page started it before mounting this panel (round 238). The
   * panel's first read of `scope` takes it instead of sending its own. Left out, the panel sends its first read itself.
   */
  readAhead?: IntentReadAhead
}

/**
 * Nothing of the right kind is on file, which is a fact about the project rather than about what
 * anybody has linked. Written once because two things say it: the words where the drawing would be,
 * and the reason `Graph` is not available.
 */
const NO_RECORD_OF_THE_KIND = () => t('g7b.StructureView.no_record_of_the_right_kind_is')

/**
 * THE WORD WHERE A DRAWING WITH NOTHING IN IT WOULD BE. Written once because two drawings draw it: the canvas, for a
 * projection with nothing to draw, and a pipeline page's own lanes, for a pipeline with no card (wave 13u round 230).
 * The word is none in both, because in both the drawing was made and holds nothing.
 */
export function NothingInTheDrawing({ toDevelopers }: { toDevelopers?: readonly { key: string; words: string }[] } = {}) {
  return <p className="gx-projection" data-to-developers={toDevelopers === undefined ? undefined : JSON.stringify(toDevelopers)}><Absence tier="told-apart" looked={true} word={t('absence.none')} /></p>
}

export function StructureView({ records, links, attention, scope, masterId, hrefFor, onChanged, now, onSays, packages, lanes, readAhead }: StructureViewProps) {
  const { language } = useLanguage()
  const narrow = useNarrow()
  // What a reader has asked for, when they have asked. Null means "whatever this width is for",
  // which is the state a page loads in.
  const [asked, setAsked] = useState<'canvas' | 'outline' | null>(null)
  // A page's own lanes are drawn at every width, so a phone opens on them too.
  const showing = asked ?? (narrow && lanes === undefined ? 'outline' : 'canvas')
  // Reading is the state this page loads in. Editing is asked for and can be put down again.
  const [editing, setEditing] = useState(false)
  /**
   * WHETHER THE CANVAS DRAWS EVERY CARD, or only the ones a line touches.
   *
   * IT IS COMPONENT STATE AND IT IS NEVER STORED. A projection is derived rendering —
   * src/shared/presentation.ts layer 3 — so there is no field for it in the presentation-intent
   * vocabulary and nothing here writes one. Whether a reader's choice of `Show all` OUGHT to survive
   * a reload is a presentation-intent question, and this pass does not answer it: see
   * design/wave3/11-canvas-projection.md, which reports it rather than deciding it.
   *
   * It is not keyed by scope, because it is a reader saying how they want to be shown a drawing
   * rather than a fact about one, and the control states the exact counts for whichever drawing is
   * open. It survives a redraw of the same records, like the reader's own viewport does.
   */
  const [drawAll, setDrawAll] = useState(false)

  // ---- what is stored about how this drawing should be shown ----------------------------------
  //
  // Read per scope and handed to the model, which is what APPLIES it: direction, role, emphasis,
  // collapsed and near are resolved in model.ts, and what it could not take comes back in
  // `graph.report`. This file fetches and re-reads; it has no opinion about any hint.
  //
  // ONE STATE, THREE ANSWERS, AND THE DRAWING WAITS FOR IT. Reading, read, or could-not-be-read are
  // three different things and holding them in two booleans would let them disagree.
  //
  // The drawing waits because it was measured not waiting: with the graph built once without the
  // intent and again when it arrived, ELK ran twice on every load, the picture jumped, and the
  // review tool's own derived-layout check came back NOT PROVED because it photographed the second
  // layout mid-flight. Worse than the flicker is what it means — for one frame the reader is looking
  // at a drawing arranged the way nobody asked for. This read is one request to localhost.
  const presentationScope = intentScopeKey(scope)
  const [reading, setReading] = useState<
    | { at: 'reading' }
    | { at: 'read'; scope: string; stored: StoredIntent }
    | { at: 'failed'; scope: string; problem: string }
  >({ at: 'reading' })
  const [reads, setReads] = useState(0)
  useEffect(() => {
    let live = true
    // Kept as it is while it is already reading, so the first read is one answer and not two.
    setReading((was) => (was.at === 'reading' ? was : { at: 'reading' }))
    // The first read takes the request the page started for this drawing, when it started one (round 238).
    const asked = (reads === 0 ? readAhead?.take(presentationScope) : null) ?? presentation.read(presentationScope)
    asked
      .then((reply) => {
        if (live) setReading({ at: 'read', scope: presentationScope, stored: reply })
      })
      .catch((err: unknown) => {
        // NOT swallowed into "nothing is arranged". A scope whose intent could not be read and a
        // scope with no intent are different answers, and only one of them means Mole Office decided.
        if (live) setReading({ at: 'failed', scope: presentationScope, problem: errorMessage(err) })
      })
    return () => {
      live = false
    }
  }, [presentationScope, reads, readAhead])
  const rereadIntent = useCallback(() => setReads((n) => n + 1), [])
  /**
   * The answer FOR THE DRAWING ON SCREEN, or "still reading" when the answer held is another drawing's.
   *
   * When the drawing changes, the first render with the new scope still holds the old drawing's
   * answer: the effect above has not run yet. Without this line that render took the old answer as
   * the new drawing's, and `lastGood` below then kept it under the new drawing's name until the new
   * read arrived. Test: tests/an-arrangement-stays-with-its-drawing.test.ts.
   */
  const here = reading.at === 'reading' || reading.scope === presentationScope ? reading : { at: 'reading' as const }

  /**
   * The last answer that arrived FOR THIS SCOPE, kept so a write does not blank the drawer.
   *
   * A probe found this by pressing the button, which is the one thing the screenshot tool cannot do.
   * Every control that stores a hint asks for a re-read, and without this the whole drawer unmounted
   * the moment it succeeded: the form closed, the action went back to unpicked, and the sentence
   * saying what the server had just said was thrown away before anybody could read it.
   *
   * KEYED ON THE SCOPE, because that is the mistake this shape invites. Carrying the last answer
   * across a change of drawing would draw one pipeline arranged the way somebody arranged another.
   *
   * IT IS THE SECOND GUARD TODAY, NOT THE ONLY ONE. App.tsx keys `TheFaultBoundary` on the address,
   * so a press on another drawing mounts this view afresh and `lastGood` starts empty. This keying
   * and `here` above are what hold the rule when this view stays mounted across a change of drawing.
   * tests/an-arrangement-stays-with-its-drawing.test.ts names, in its header, the runs that prove
   * this keying with that key taken away.
   */
  const lastGood = useRef<{ scope: string; stored: StoredIntent } | null>(null)
  if (here.at === 'read') lastGood.current = { scope: presentationScope, stored: here.stored }
  const previous = lastGood.current?.scope === presentationScope ? lastGood.current.stored : null

  /**
   * EACH ANSWER, HANDED TO A PAGE THAT DRAWS ITS OWN LANES. Once per change of the answer and never
   * on a render that changed nothing: the effect runs on what the answer is made of, and the page's
   * `lanes`, a new object on each of its renders, is read through a ref and is not among them.
   */
  const onIntent = useRef(lanes?.onIntent)
  onIntent.current = lanes?.onIntent
  useEffect(() => {
    onIntent.current?.(
      here.at === 'read'
        ? { at: 'read', stored: here.stored }
        : here.at === 'failed'
          ? { at: 'failed', problem: here.problem, kept: previous }
          : { at: 'reading', kept: previous },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, presentationScope, previous])

  const intent = here.at === 'read' ? here.stored : previous
  const intentProblem = here.at === 'failed' ? here.problem : null
  // Two different waits. The FIRST read has nothing to draw yet and the drawing waits for it; a
  // re-read after a write has the previous answer and keeps drawing that, saying so.
  const firstRead = here.at === 'reading' && previous === null
  const rereading = here.at === 'reading' && previous !== null
  const stored = intent?.intent
  const graph = useMemo(
    () => buildStructureGraph({ records, links, attention, scope, now, ...(stored === undefined ? {} : { intent: stored }), ...(packages === undefined ? {} : { packages }) }),
    [records, links, attention, scope, now, stored, language, packages],
  )
  const hints = stored === undefined ? 0 : storedHintCount(stored)

  /**
   * The two projections of this drawing, and which one the canvas is being given.
   *
   * BOTH ARE WORKED OUT, because the control has to state what it would cost before it is pressed:
   * `Show all` says how many cards it adds, and it is only offered where there are any. `all`
   * returns the complete graph itself, so this is one pass over the nodes and edges, not two
   * drawings.
   *
   * THE OUTLINE IS NEVER GIVEN EITHER OF THEM. It gets `graph`, complete, which is the whole of what
   * makes a projection allowed at all — see the header.
   */
  const joined = useMemo(() => projectForCanvas(graph, 'joined'), [graph])
  const everything = useMemo(() => projectForCanvas(graph, 'all'), [graph])
  const canvas = drawAll ? everything : joined
  /**
   * What this drawing leaves out: THE SCOPE'S OWN LIST, and only that.
   *
   * `canvas.omission` is not appended, for the same reason `IntentReport` is not printed under a
   * canvas: the canvas answers for itself and a second copy here is a staler one beside it. The
   * entry was a reworded duplicate of the projection's own account, 100% of the time it existed.
   *
   * WHERE THE COUNT LIVES NOW, and it has moved once since that was written. `projection.sentence`
   * used to be printed under the canvas in full; it is not, because four sentences of it were the
   * largest standing prose on this page. What survives is two numbers on two surfaces that are not
   * each other and that add up: the heading tag says `6 / 12 drawn`, and the fold under the drawing
   * says `6 isolated` and names every one of them. The sentence itself is still what the EMPTY case
   * prints where the canvas would be, which is the one place it is the whole answer.
   *
   * NOTHING OF IT IS DRAWN UNDER THE DRAWING ANY MORE (wave 13u round 217). Each entry is said where
   * its records are, and the one that is said nowhere else, `saidInTheBody`, goes up to the page's
   * body with the canvas's own facts.
   */
  const omitted: Omission[] = graph.omitted
  const [canvasSays, setCanvasSays] = useState<readonly string[]>([])
  // Given lanes, the omissions are not handed up: what a page's own drawing leaves out is the page's to say.
  const withLanes = lanes !== undefined
  const says = useMemo(
    () => [
      ...(showing === 'canvas' ? canvasSays : []),
      ...(withLanes ? [] : omitted.filter((entry) => entry.saidInTheBody === true).map((entry) => `${entry.count} ${entry.what}`)),
    ],
    [showing, canvasSays, omitted, withLanes],
  )
  const saysKey = says.join('\n')
  useEffect(() => {
    onSays?.(says)
    return () => onSays?.([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saysKey, onSays])
  /**
   * Whether the CANVAS is leaving cards out right now — one answer, read in two places below.
   *
   * IT IS A CONST BECAUSE IT WAS THREE COPIES OF ONE CONDITION. It decides the heading's count and
   * the fold that names those cards. It also decided whether "Nothing is left out of this drawing"
   * could be said, until that line went with the scope's list in wave 13u round 217.
   */
  const canvasOmits = lanes === undefined && showing === 'canvas' && canvas.omitted.length > 0
  /**
   * WHY `Graph` CANNOT ACT, or null when it can. ONE FACT, AT THE LENGTH THIS VIEW HAS ROOM FOR.
   *
   * The whole account and the short line are BOTH written in `model.ts`, out of the same clauses
   * (`whyNothingIsDrawn`), and which one a reader gets depends on what is already on their screen:
   *
   *   - ON THE DRAWING, the long form is the paragraph where the canvas would be, 52 pixels under
   *     this button, so the button says the short one. It used to say the long one: the same 39
   *     words appeared twice, the second copy red, and the refusal — 39 words drawn as one item of
   *     the button row, wide enough to take the whole line — pushed `List` and `Show all` onto a
   *     second row. Problem `f43ANgTxSkST`.
   *   - IN THE PRINTED LIST, the paragraph is not on the page at all, so the button is the only
   *     place those words reach the reader and it says the whole thing. That is builder DA's
   *     reason for making the reason the sentence, and it still holds here.
   *
   * The two cases are different facts and are not merged. Nothing of the right kind is on file at
   * all, which is a fact about the project; or the records are there and none is linked, which is a
   * fact about what has been linked. `model.ts` writes the second, beside the rule that produces it.
   */
  const nothingToDraw: string | null =
    graph.nodes.length === 0
      ? NO_RECORD_OF_THE_KIND()
      : lanes !== undefined || canvas.nothingToDraw === null
        ? null
        : showing === 'canvas'
          ? canvas.nothingToDraw.short
          : canvas.nothingToDraw.long

  // Held still. Canvas.tsx also holds it in a ref, because it must survive a caller that does not —
  // but a handler that changes identity on every render is worth not creating in the first place.
  const openRecord = useCallback((recordId: string) => navigate(recordPath(recordId)), [])

  const pipelines = records.filter((record) => record.kind === 'pipeline' && (scope.at !== 'pipeline' || record.id === scope.recordId || record.id === masterId))
  const choices = useMemo(
    () =>
      [...records]
        .filter((record) => record.kind === 'module' || record.kind === 'pipeline' || record.kind === 'block')
        .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
        .map((record) => ({ id: record.id, title: record.title, kind: record.kind })),
    [records],
  )

  return (
    <div className="gx">
      <style href="mole-office-graph" precedence="default">
        {GRAPH_CSS}
      </style>

      <Panel titleIs="label" declares={{ surface: 'structure.view' }}
        title={t('g7b.StructureView.the_project_structure')}
        actions={
          <>
            {/* THE COUNT IN THE HEADING IS THE WHOLE GRAPH'S, and where the canvas is drawing fewer
                it says so here rather than leaving two numbers on one page to be reconciled: a
                heading reading "27 cards" over a canvas drawing 10 is true and, read alone,
                contradicts the drawing.

                THE TITLE ATTRIBUTE IS NOT WHERE ANY OF THIS LIVES. It is a mouse convenience and a
                phone has no hover, so it says nothing the fold under the drawing does not — that
                fold states the same counts in its own visible line and names every omitted card. */}
            <Tag tone="quiet">
              {canvasOmits
                ? t('g7b.StructureView.drawn', { v1: canvas.graph.nodes.length, v2: graph.nodes.length })
                : t('g7b.StructureView.cards', { v1: lanes === undefined ? graph.nodes.length : lanes.records.length })}
            </Tag>
            {/* A TOGGLE IS NEVER IN THE STATE ITS OWN PRESS WOULD SET, and saying so here is the
                point of routing it through the same control as the rest: what it puts the page into
                is the opposite of what the page is in, so the check can never refuse it. */}
            <DrawingControl
              look="button"
              variant={editing ? 'primary' : 'secondary'}
              size="sm"
              now={editing}
              after={!editing}
              onPress={() => setEditing((on) => !on)}
            >
              {editing ? t('g7b.StructureView.done_editing') : t('g7b.StructureView.edit')}
            </DrawingControl>
          </>
        }
      >
        {/* THE PICKER IS LINKS, AND THE CHIP FOR THE DRAWING ON SCREEN IS NOT ONE. Its address is
            the address you are at, so it was the one control here whose press changed nothing and
            said nothing. It keeps its look and `aria-current`; what it gains is the words. */}
        <nav className="gx-scopes" aria-label={t('g7b.StructureView.which_drawing')}>
          <DrawingControl
            look="link"
            className="gx-scope"
            href={hrefFor({ at: 'modules' })}
            now={scopeKey(scope)}
            after={scopeKey({ at: 'modules' })}
            reason={t('g7b.StructureView.on_screen')}
          >{t('g7b.StructureView.every_module')}</DrawingControl>
          {pipelines.map((record) => (
            <DrawingControl
              key={record.id}
              look="link"
              className="gx-scope"
              href={hrefFor({ at: 'pipeline', recordId: record.id })}
              now={scopeKey(scope)}
              after={scopeKey({ at: 'pipeline', recordId: record.id })}
              reason={t('g7b.StructureView.on_screen')}
            >
              {record.title}
            </DrawingControl>
          ))}
        </nav>

        <p className="gx-title">{graph.title}</p>

        <div className="gx-switch">
          {/* DRAW IT IS NOT AN ACTION ON A DRAWING WITH NO CARD ON IT, and that is a different
              refusal from "you are already looking at it": there is no state to be already in, and
              the press would put a sentence where a drawing would go. The reason comes from the
              same place in model.ts that writes that sentence, at the length this view has room
              for — see `nothingToDraw` above — rather than a second account of it written here. */}
          <DrawingControl
            look="button"
            variant={showing === 'canvas' && nothingToDraw === null ? 'primary' : 'secondary'}
            now={showing}
            after={'canvas' as const}
            reason={t('g7b.StructureView.already_drawn_the_drawing_is_on_screen')}
            {...(nothingToDraw === null ? {} : { unavailable: nothingToDraw })}
            onPress={() => setAsked('canvas')}
          >
            {DRAWING_WORDS.graph}
          </DrawingControl>
          <DrawingControl
            look="button"
            variant={showing === 'outline' ? 'primary' : 'secondary'}
            now={showing}
            after={'outline' as const}
            reason={t('g7b.StructureView.already_open_the_printed_list_is_on')}
            onPress={() => setAsked('outline')}
          >
            {DRAWING_WORDS.list}
          </DrawingControl>
          {/* SHOW ALL, OFFERED ONLY WHERE IT WOULD CHANGE ANYTHING, and it says how much. A pipeline
              drawing is one connected chain plus the modules its lines reach, so the projection
              drops nothing there and this button is not drawn — a control that does nothing is worse
              than no control. `Fit all` is the canvas's own button, in the bar on the drawing.
              IT IS ALSO IN THE PRINTED LIST WHEN THE DRAWING HAS NO CARD ON IT, and there it draws
              every card on the canvas. `Graph` is refused on that list, because the canvas would
              hold only a sentence, so this is the one press back to a drawing. Before 30 September
              2026 it was drawn on the canvas alone, and a reader who pressed List on an empty
              drawing had no way back (problem YOiNLeTshUK6). */}
          {lanes === undefined && joined.omitted.length > 0 && (showing === 'canvas' || canvas.nothingToDraw !== null) ? (
            <DrawingControl
              look="button"
              variant={drawAll ? 'primary' : 'secondary'}
              now={drawAll}
              after={!drawAll}
              onPress={() => {
                setDrawAll((on) => !on)
                setAsked('canvas')
              }}
            >
              {drawAll
                ? t('g7b.StructureView.draw_only_what_is_linked_of', { v1: joined.graph.nodes.length, v2: graph.nodes.length })
                : t('g7b.StructureView.show_all', { v1: graph.nodes.length })}
            </DrawingControl>
          ) : null}
          {/* NO SENTENCE HERE. Two paragraphs used to sit beside these buttons describing what each
              one gives you — on a phone, ~87px of a 390 viewport in front of the first record. What
              they said is said by things that are already on screen: the projection's own line under
              the canvas states exactly what is left out, `Show all` states what it would add, and
              each button carries the rest in its own tooltip. */}
        </div>

        {/* The drawing and the drawer are one row on a desk and one column on a phone. The drawer is
            attached to the drawing rather than sitting under the page, so what is being changed and
            the picture of it are on screen together. */}
        <div className="gx-stage" data-editing={editing ? '1' : undefined}>
          <div className="gx-stage-main">
            {/* The drawing is not started until it is known how it was asked to be drawn — see the
                note on `reading` above. This line is the honest version of a blank frame. */}
            {firstRead ? (
              <p className="gx-loading">{t('g7b.StructureView.reading_how_this_drawing_was_asked_to')}</p>
            ) : graph.problem !== null ? (
              <p className="gx-problem">{graph.problem}</p>
            ) : showing === 'canvas' ? (
              /* THREE CASES, AND NONE OF THEM IS AN EMPTY BOX.
                 Nothing on file at all is a fact about the workspace. A projection with nothing to
                 draw is a fact about what is linked. A drawing is a drawing. The middle one was the
                 case the decision named as the worst first run — real modules, none of them linked
                 yet — and a canvas that fetched React Flow to show a blank frame would say nothing
                 about which of the three had happened. */
              graph.nodes.length === 0 ? (
                /* FIVE STATEMENTS ABOUT HAVING NOTHING TO DRAW BECAME ONE. This said "There is
                   nothing to draw in this view. No record of the right kind is on file, so this is
                   not a drawing failure and nothing is being left out: what each drawing is made of
                   is said above" — three clauses defending the drawing engine against a charge
                   nobody had made, in the largest box on the emptiest page in the product. Absence
                   has almost no weight unless it needs action, and nobody acts on an empty project.
                   `Absence` at the ordinary tier keeps the whole sentence for a screen reader. */
                <p className="gx-projection">
                  <Absence title={NO_RECORD_OF_THE_KIND()} />
                </p>
              ) : lanes !== undefined ? (
                <>
                  {lanes.drawing}
                  <WhatTheLanesSay ids={lanes.records} records={records} onSays={setCanvasSays} onSaysByWord={lanes.onSaysByWord} />
                </>
              ) : canvas.empty ? (
                <NothingInTheDrawing />
              ) : (
                <Suspense
                  fallback={<p className="gx-loading">{t('g7b.StructureView.fetching_the_drawing_engine')}</p>}
                >
                  {/* `onIntentChanged` IS WHAT PUTS THE DRAWING BACK — criterion D36. The reset
                      button clears the arrangement on the server, and the graph is built from the
                      intent this view read; without a re-read the drawing would keep drawing the
                      arrangement that no longer exists. It is the same call the edit drawer makes
                      after any other write to the arrangement. */}
                  <Canvas projection={canvas} onOpen={openRecord} onIntentChanged={rereadIntent} onSays={setCanvasSays} />
                </Suspense>
              )
            ) : (
              /* THE COMPLETE GRAPH, ALWAYS. Never `canvas.graph`: the reading layer is what makes a
                 projection allowed, and a projected outline would delete the cards rather than
                 project them. See the header. */
              <Outline graph={graph} />
            )}
          </div>

          {editing && !firstRead ? (
            <aside className="gx-drawer" aria-label={t('g7b.StructureView.edit_this_drawing')}>
              {rereading ? (
                <p className="gx-drawer-rereading" role="status">{t('g7b.StructureView.re_reading_the_arrangement_after_that_write')}</p>
              ) : null}
              <Edit
                key={scopeKey(scope)}
                graph={graph}
                records={records}
                links={links}
                choices={choices}
                intent={intent}
                intentProblem={intentProblem}
                onChanged={onChanged}
                onIntentChanged={rereadIntent}
                onClose={() => setEditing(false)}
                laneAndOrderOnly={lanes !== undefined}
              />
            </aside>
          ) : null}
        </div>

        {/* FROM THE COUNT TO THE CARDS. "17 are not drawn" is only half an answer: a reader has to
            be able to get to the actual 17. Every one is named here, in the drawing's own order,
            each a link to its record — and the reading layer prints all of them in full. It is
            behind a fold because at 1,080 modules this is a thousand names, and `Explain` states the
            exact count on the fold itself rather than the word "more".

            THIS ONE LINE IS WHAT THE PARAGRAPH UNDER THE CANVAS USED TO BE. `projection.sentence`
            was printed there in full — four sentences saying how many cards the canvas was drawing,
            how many joined nothing, where they were named and what "Show all" would do — directly
            above this fold, which said the same thing again with the cards attached. The sentences
            are this fold's body now, and `Show all` is a control in the row above the drawing
            rather than a clause about itself.

            ONE NUMBER HERE AND THE OTHER IN THE HEADING, NEVER BOTH IN BOTH. The heading says
            `10 / 27 drawn` and this says `17 isolated`; they add up, a reader can check that they
            do, and neither is a restatement of the other. Both being the pair was tried and it put
            "10 / 27 drawn" on the page twice, a panel apart — this codebase's most expensive
            recurring defect in its smallest form. */}
        {canvasOmits ? (
          <details className="gx-isolated" {...declaredAttributes({ surface: 'structure.isolated' })}>
            <summary>
              <b className="num">{canvas.omitted.length}</b>{t('g7b.StructureView.isolated')}
            </summary>
            <ul className="gx-not-drawn">
              {canvas.omitted.map((node) => (
                <li key={node.id}>
                  <a className="px-nav" href={`#${recordPath(node.recordId)}`}>
                    {node.ordinal === null ? node.title : `${node.ordinal} ${node.title}`}
                  </a>
                  <span className="gx-not-drawn-kind">{node.kind === 'step' ? t('g7b.step') : kindWord(node.kind).text}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {/* The CANVAS prints the whole layout report itself, including what ELK could not take — which
            this file does not know and must not guess at. So the drawing's own report wins wherever
            there is a drawing, and this block covers the two cases it cannot: the reading layer, which
            has no canvas under it, and an arrangement that could not be READ at all. */}
        {/* NOT WHEN THE DRAWING HAS NO SUBJECT. An address naming a pipeline nobody has filed drew
            two boxes: "No pipeline on file has the id NOPEnothere99" and then, underneath, a
            fifty-five word sentence saying the stored arrangement could not be read because no
            pipeline has that id. That is the first fault restated, in worse words, with a route in
            it. One fault, one sentence. */}
        <IntentReport
          hints={hints}
          graph={graph}
          problem={graph.problem === null ? intentProblem : null}
          reportHere={showing === 'outline' || graph.problem !== null}
        />

        {/* NO LIST OF WHAT THE SCOPE LEAVES OUT, AND NO "Nothing is left out of this drawing"
            (wave 13u round 217). Both stood under every drawing, and the page's body now says the
            one entry nothing else on the page says: see `says` above. */}

      </Panel>
    </div>
  )
}

/**
 * WHAT RESTRICTS THE RECORDS OF A PAGE'S LANES, AND WHO IS WORKING ON THEM, said for the page's body.
 *
 * The lanes mark no card, so these are said in words, from the same read the canvas makes for its
 * marks. It is mounted only while the lanes are on screen, as the canvas is, and renders nothing.
 * The same sentences go to `onSaysByWord` with their word keys, when the page gives it.
 */
function WhatTheLanesSay({ ids, records, onSays, onSaysByWord }: {
  ids: readonly string[]
  records: readonly PanelRecord[]
  onSays: (facts: readonly string[]) => void
  onSaysByWord: ((sentences: readonly ASentenceAndItsWord[]) => void) | undefined
}): null {
  const read = useRestrictionsAndPresence(ids)
  const titled = useMemo(() => {
    const titles = new Map(records.map((record) => [record.id, record.title]))
    return ids.map((id) => ({ id, title: titles.get(id) ?? t('g7b.missingRecord') }))
  }, [ids, records])
  const sentences = whatADrawingWithNoMarksSaysByWord(read, titled)
  const key = sentences.map((sentence) => `${sentence.key} ${sentence.words}`).join('\n')
  useEffect(() => {
    onSays(sentences.map((sentence) => sentence.words))
    onSaysByWord?.(sentences)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onSays, onSaysByWord])
  // Said only while the lanes are on screen, as `onSays` is: taken back when this is unmounted.
  useEffect(() => () => onSaysByWord?.([]), [onSaysByWord])
  return null
}

// ============================================================================ what the hints did

/**
 * What happened to the stored arrangement — for the two cases the drawing itself cannot answer.
 *
 * THE CANVAS ANSWERS FOR ITSELF, and it answers better: it holds ELK's findings as well as the
 * model's, so it can say that an `order` could not be taken without crossing edges. A second copy
 * here would be a staler one beside it, with a different count, and two numbers about one thing is
 * the confusion this product exists to remove. So `reportHere` is false wherever a canvas is drawn.
 *
 * WHAT IS LEFT FOR THIS BLOCK IS THE TWO THINGS NOBODY ELSE CAN SAY:
 *
 *   1. THE READING LAYER has no canvas under it, so on a phone this is the only report there is.
 *   2. THE ARRANGEMENT COULD NOT BE READ. Only this file makes that request, so only this file knows
 *      it failed — and a scope whose intent could not be read must never look like a scope with
 *      nothing arranged. That one is printed whatever is being drawn.
 *
 * Outside any fold, both times. This is the answer to "I said the safety work should be in its own
 * lane and the picture did not move", and a fold would put that one press behind a page that looks
 * like it ignored the person.
 */
export function IntentReport({
  hints,
  graph,
  problem,
  reportHere,
}: {
  hints: number
  graph: StructureGraph
  problem: string | null
  /** True when there is no drawing below printing the same report. */
  reportHere: boolean
}) {
  const inspect = useInspect()
  if (problem !== null) {
    return (
      <>
        <p className="gx-intent" data-tone="problem">{t('structure.arrangementNotRead')}</p>
        <ServerNote text={problem} />
      </>
    )
  }
  if (!reportHere || hints === 0) return null
  const report: LayoutReport = graph.report
  if (report.unhonoured.length === 0) {
    return (
      <p className="gx-intent">{t('structure.hintsApplied', { n: hints })}</p>
    )
  }
  return (
    <div className="gx-intent" data-tone="unhonoured">
      <p className="gx-intent-head">{t('structure.hintsNotApplied', { n: hints, unapplied: report.unhonoured.length })}</p>
      <ul className="gx-intent-list">
        {report.unhonoured.map((entry) => (
          <li key={`${entry.target} ${entry.hint}`}>
            {inspect ? <code>{entry.target}.{entry.hint}</code> : graph.nodes.find((node) => node.recordId === entry.target)?.title ?? t('g7b.missingRecord')}
            {' — '}{inspect ? entry.because : t('g7b.arrangementNotApplied')}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================ styles

/**
 * This drawing's own rules.
 *
 * styles.css belongs to another agent this phase, so the styles live with the component. React 19
 * hoists `<style href>` into <head> and de-duplicates by href. Every value is a token from
 * tokens.css, so a preset swap on <html> re-skins all of it — including React Flow, whose own
 * stylesheet is overridden here rather than edited.
 */
const GRAPH_CSS = `
.gx { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.gx-prose {
  font-size: var(--fs-1);
  line-height: var(--lh-read);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}
.gx-prose + .gx-prose { margin-top: var(--pad); }
.gx-prose code { font-family: var(--font-mono); font-size: 0.94em; }

/* ---- which drawing ---- */
.gx-scopes { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--pad); }
.gx-scope {
  font: inherit;
  font-size: var(--fs-1);
  font-weight: 600;
  /* An anchor, not a button: it needs the box a button had, and none of the underline a link has. */
  display: inline-block;
  text-decoration: none;
  color: var(--text-2);
  background: var(--panel-2);
  /* --border-strong: an anchor drawn as a button is a control, and this edge is the whole of what
     says where it ends. The decorative hairline measures 1.26:1 in the light theme, against a 3:1 floor. */
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  padding: 3px var(--pad-lg);
  cursor: pointer;
  /* No uppercase and no letter-spacing: these hold record titles, and a title here may be Chinese. */
  text-transform: none;
  letter-spacing: 0;
}
.gx-scope:hover { background: var(--hover); }
.gx-scope[data-current='1'] {
  color: var(--accent-text);
  background: var(--accent);
  border-color: var(--accent);
}
.gx-title {
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text);
  line-height: var(--lh-body);
  margin-bottom: var(--pad);
}
.gx-switch { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); margin-bottom: var(--pad); }
/* A REFUSAL GOES UNDER THIS ROW, NEVER INTO IT. The shared button draws its reason as a span beside
   itself, and in a wrapping flex row that span is a flex item: pressing Graph on an empty drawing
   took a share of the row and pushed List and Show all onto a second line — 36 px of buttons
   became 126 at 1440 and 206 at 390, measured in both themes. Its own line
   keeps the three buttons where the reader left them, which is the decision .gx-refused already
   makes in controls.tsx for the controls that report their reason upward.

   ORDER AS WELL AS WIDTH, and the width alone was measured wrong. A full-width item breaks the line
   WHERE IT SITS, and this one sits straight after the button that was pressed: Graph stayed on
   the first line by itself and List and Show all went below the reason. Order sends it to the
   end of the row whatever it is about, so every button keeps its place and the words arrive under
   all of them. */
.gx-switch > .px-why { order: 1; flex: 1 0 100%; }
.gx-problem, .gx-loading {
  padding: var(--pad-lg);
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text);
  background: var(--st-inferred-row);
  border: var(--border-w) solid var(--st-inferred-line);
  border-radius: var(--radius-sm);
}
/* ---- what the canvas is not drawing ---- */
/* The sentence that stands WHERE THE DRAWING WOULD BE when the projection has nothing to draw. It is
   the size of a drawing's own state line, not of a card, because it is an answer and not an error:
   the workspace is fine and nothing is linked yet. */
.gx-projection {
  padding: var(--pad-lg);
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text);
  background: var(--st-inferred-row);
  border: var(--border-w) solid var(--st-inferred-line);
  border-radius: var(--radius-sm);
  max-width: var(--measure-in-box);
}
.gx-not-drawn {
  list-style: none;
  margin-top: var(--pad);
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}
.gx-not-drawn li {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 2px var(--pad);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--panel);
  font-size: var(--fs-1);
  /* These hold record titles, which may be Chinese. No uppercase, no truncation: they wrap. */
  overflow-wrap: anywhere;
  min-width: 0;
}
.gx-not-drawn a { color: var(--accent); text-decoration: none; }
.gx-not-drawn a:hover { text-decoration: underline; text-underline-offset: .16em; }
.gx-not-drawn-kind { color: var(--text-3); }
.gx-isolated { margin: 0 0 var(--gut); font-size: var(--fs-1); color: var(--text-2); }
.gx-isolated > summary { cursor: pointer; width: fit-content; }

/* ---- the canvas ---- */
/* The box is a fixed height and clips what overflows, so the line that says what the canvas is
   doing sits OUTSIDE it. It was inside once, and it was never on screen. */
.gx-canvas-wrap {
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--panel);
}
.gx-canvas {
  height: min(72vh, 760px);
  min-height: 380px;
  background: var(--panel-2);
  overflow: hidden;
  position: relative;
}
/* Until ELK has answered there are no positions, so every card would sit on the same spot. Hidden
   rather than drawn in a heap, and the line underneath says what is happening. */
.gx-canvas-wrap[data-state='measuring'] .react-flow__viewport,
.gx-canvas-wrap[data-state='laying-out'] .react-flow__viewport { visibility: hidden; }
.gx-canvas-wrap[data-state='failed'] .gx-canvas { display: none; }
.gx-canvas-state {
  padding: 6px var(--pad-lg);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  border-top: var(--border-w) solid var(--border);
  background: var(--panel);
}
.gx-canvas-wrap[data-state='failed'] .gx-canvas-state { border-top: 0; color: var(--st-failed); }
.gx-canvas .react-flow__background { color: var(--border); }
.gx-canvas .react-flow__controls {
  box-shadow: var(--elev-1);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.gx-canvas .react-flow__controls-button {
  background: var(--panel);
  border-bottom: var(--border-w) solid var(--border);
  fill: var(--text-2);
}
.gx-canvas .react-flow__controls-button:hover { background: var(--hover); }
.gx-canvas .react-flow__handle { opacity: 0; width: 1px; height: 1px; min-width: 0; min-height: 0; border: 0; }

/* ---- a card ---- */
.gx-card {
  box-sizing: border-box;
  width: 100%;
  padding: var(--pad) var(--pad-lg) var(--pad);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-left: var(--rail) solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--elev-1);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}
.gx-card[data-alarm='urgent'] { border-left-color: var(--st-failed); background: var(--st-failed-row); }
.gx-card[data-alarm='raised'] { border-left-color: var(--st-failed-line); }
.gx-card[data-alarm='plain'] { border-left-color: var(--border-strong); }
.gx-card[data-alarm='faded'] { border-left-color: var(--border); }
/* The card's head, its number and its name are the shared card's own rules, in CARD_CSS in
   CardFace.tsx, which the card loads wherever it is drawn. */
.gx-card-facts { display: flex; flex-direction: column; gap: 2px; }
.gx-card-facts div { display: flex; gap: 6px; min-width: 0; }
.gx-card-facts dt { flex: 0 0 auto; color: var(--text-3); }
.gx-card-facts dd { min-width: 0; color: var(--text-2); overflow-wrap: anywhere; }
.gx-card-none { margin-top: 4px; color: var(--text-3); }
.gx-card-rest { margin-top: 5px; color: var(--text-3); }
.gx-card-cut { color: var(--text-3); font-style: italic; }
.gx-card-rest .num { color: var(--text-2); }
.gx-card-attached { list-style: none; margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
.gx-card-attached li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 5px;
  padding-left: 7px;
  border-left: 2px solid var(--border);
  min-width: 0;
}
.gx-card-attached li[data-alarm='urgent'] { border-left-color: var(--st-failed); }
.gx-card-attached li[data-alarm='raised'] { border-left-color: var(--st-failed-line); }
.gx-card-att-title {
  font: inherit;
  font-weight: 600;
  color: var(--text);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  overflow-wrap: anywhere;
}
.gx-card-att-title:hover { text-decoration: underline; }
.gx-card-att-kind, .gx-card-att-through { color: var(--text-3); }
.gx-card-wall, .gx-node-wall {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
  padding: 4px 7px;
  border-radius: var(--radius-sm);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
}
.gx-card-wall[data-at='behind'], .gx-node-wall[data-at='behind'] {
  background: var(--st-blocked-row);
  border-left: var(--rail) solid var(--st-blocked);
  color: var(--text);
}
.gx-card-wall[data-at='at'], .gx-node-wall[data-at='at'] {
  background: var(--st-todo-row);
  border-left: var(--rail) solid var(--st-todo);
  color: var(--text);
}
.gx-card-wall[data-at='unplaced'], .gx-node-wall[data-at='unplaced'] {
  background: var(--st-inferred-row);
  border-left: var(--rail) solid var(--st-inferred-line);
  color: var(--text-2);
}

/* ---- the pipeline box ---- */
/* THE BOX IS TRANSPARENT ON PURPOSE. React Flow draws every edge underneath every node, so an
   opaque pipeline box hid every line between the steps inside it — nine cards with no dependencies
   drawn between them, which is a picture of the one fact the box exists to show. A photograph found
   it. Border and header only, and the lines show through. */
.gx-group {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background: transparent;
  border: var(--border-w) dashed var(--border-strong);
  border-radius: var(--radius);
}
/* REACT FLOW'S OWN LOOK FOR A GROUP IS TAKEN OFF THE BOX'S HOLDER (wave 13y round 82). The box is a React Flow node
   of the type "group", and React Flow's stylesheet gives that type a quarter-white fill, a one-pixel near-black
   border and ten pixels of padding. So the box was not transparent: in dark it was a flat grey block whose border
   could not be seen, and in light a pale box with a solid edge and the dashed one ten pixels inside it. The padding
   is kept, because it cannot be seen and the box's controls are placed by it: without it they rose out of the drawing
   when the box's head was at its top edge. */
.gx-canvas .react-flow__node-group,
.gx-canvas .react-flow__node-group.selectable:hover,
.gx-canvas .react-flow__node-group.selectable.selected,
.gx-canvas .react-flow__node-group.selectable:focus,
.gx-canvas .react-flow__node-group.selectable:focus-visible {
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.gx-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--pad);
  padding: 7px var(--pad-lg);
  border-bottom: var(--border-w) solid var(--border);
  background: var(--panel);
  border-radius: var(--radius) var(--radius) 0 0;
  font-size: var(--fs-1);
  color: var(--text-3);
}
.gx-group-fact b { color: var(--text-2); font-weight: 600; }

/* ---- a line ---- */
/* Colour on a line comes from the GATE, which is a state of the dependency, and never from the
   link type: eleven types are eleven words, not eleven colours. */
/* THE STROKE DOES NOT SHRINK WITH THE ZOOM, and that is what makes the picture a picture. React
   Flow scales the whole drawing to fit, so a 1.5px line on a twelve-step pipeline fitted at about a
   third size is half a pixel: the words on the lines were on screen and the lines themselves were
   not, which is a diagram of boxes with captions floating between them. A photograph found it.
   The SVG rule non-scaling-stroke keeps the width in screen pixels at any zoom; nothing about the
   geometry, the colour or the meaning changes. */
.gx-line { stroke: var(--border-strong); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.gx-line[data-tone='hard'] { stroke: var(--st-blocked); stroke-width: 2; }
.gx-line[data-tone='partial'] { stroke: var(--st-todo); stroke-width: 2; }
.gx-line-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  font-size: var(--fs-1);
  line-height: 1.3;
  color: var(--text-3);
  pointer-events: none;
  white-space: nowrap;
  max-width: 22em;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gx-line-label[data-tone='hard'] { border-color: var(--st-blocked-line); color: var(--st-blocked); }
.gx-line-label[data-tone='partial'] { border-color: var(--st-todo-line); color: var(--text-2); }
.gx-line-label[data-broken='1'] { border-color: var(--st-broken-line); color: var(--st-broken); }
.gx-line-word { font-weight: 600; }
.gx-line-note { color: var(--text-3); }

/* ---- the reading layer ---- */
.gx-outline { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.gx-h { font-size: var(--fs-2); font-weight: 700; color: var(--text); margin-bottom: var(--pad); }
.gx-rows { display: flex; flex-direction: column; }
.gx-facts { display: flex; flex-direction: column; gap: 3px; margin: var(--pad) 0; }
.gx-fact { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; font-size: var(--fs-1); line-height: var(--lh-body); }
.gx-fact dt { flex: 0 0 auto; color: var(--text-3); font-weight: 600; }
.gx-fact dd { min-width: 0; color: var(--text-2); overflow-wrap: anywhere; }
.gx-node-note { font-size: var(--fs-1); line-height: var(--lh-read); color: var(--text-2); margin: var(--pad) 0; }
.gx-none { color: var(--text-3); }

.gx-edges { list-style: none; display: flex; flex-direction: column; gap: 4px; margin: var(--pad) 0; }
.gx-edge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  min-width: 0;
}
.gx-edge-arrow { color: var(--text-3); font-weight: 700; }
.gx-edge-word { font-weight: 600; color: var(--text-2); }
.gx-edge-other { color: var(--text); overflow-wrap: anywhere; min-width: 0; }
.gx-edge-note { flex: 1 1 14em; color: var(--text-3); min-width: 0; }

.gx-attacheds { list-style: none; display: flex; flex-direction: column; gap: 6px; margin-top: var(--pad); }
.gx-attached {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: var(--pad);
  border-left: var(--rail) solid var(--border);
  min-width: 0;
}
.gx-attached[data-alarm='urgent'] { border-left-color: var(--st-failed); }
.gx-attached[data-alarm='raised'] { border-left-color: var(--st-failed-line); }
.gx-attached-head { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; }
.gx-attached-title { font-size: var(--fs-2); font-weight: 600; color: var(--accent); overflow-wrap: anywhere; }
.gx-attached-through { font-size: var(--fs-1); color: var(--text-3); }

/* ---- a wall ---- */
.gx-walls { display: flex; flex-direction: column; gap: var(--pad); }
.gx-wall {
  padding: var(--pad) var(--pad-lg);
  border: var(--border-w) solid var(--border);
  border-left: var(--rail) solid var(--st-blocked);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  min-width: 0;
}
.gx-wall[data-gate='partial'] { border-left-color: var(--st-todo); }
.gx-wall-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.gx-wall-who { font-size: var(--fs-2); font-weight: 700; color: var(--accent); overflow-wrap: anywhere; }
.gx-wall-words { font-size: var(--fs-1); color: var(--text-3); }
.gx-wall-sentence {
  margin-top: 4px;
  font-size: var(--fs-1);
  line-height: var(--lh-read);
  color: var(--text);
  max-width: var(--measure-in-box);
}
.gx-reach { margin-top: var(--pad); display: flex; flex-direction: column; gap: 4px; }
.gx-reach-side { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; }
.gx-reach-label {
  flex: 0 0 auto;
  font-size: var(--fs-1);
  font-weight: 700;
  color: var(--text-3);
}
.gx-reach-step {
  font-size: var(--fs-1);
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  border: var(--border-w) solid var(--border);
  background: var(--panel);
  color: var(--text-2);
  overflow-wrap: anywhere;
}
.gx-reach-none { font-size: var(--fs-1); color: var(--text-3); }
/* The wall itself: a solid bar for the hard stop, drawn as a shape so it survives greyscale. */
.gx-reach-bar {
  height: 6px;
  border-radius: 3px;
  background: repeating-linear-gradient(
    90deg,
    var(--st-blocked) 0 10px,
    transparent 10px 16px
  );
}
.gx-reach-side[data-side='walled'] .gx-reach-step { border-color: var(--st-blocked-line); color: var(--st-blocked); }
.gx-reach-side[data-side='unplaced'] .gx-reach-step { border-style: dashed; color: var(--text-3); }

/* ---- the drawing and the drawer beside it ---- */
/* ONE ROW ON A DESK, ONE COLUMN ON A PHONE, and the drawer is the second child either way, so the
   reading order and the tab order are the same at both widths. The drawing keeps the space it had:
   the drawer takes a fixed share rather than half, because a canvas squeezed to 50% is a canvas
   nobody can read, which is the defect this whole pass is about. */
.gx-stage { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--gut); min-width: 0; }
.gx-stage-main { flex: 1 1 26em; min-width: 0; }
.gx-drawer {
  flex: 0 1 24em;
  min-width: 0;
  align-self: stretch;
  padding: var(--pad-lg);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
}

/* ---- editing ---- */
.gx-edit { display: flex; flex-direction: column; gap: var(--pad-lg); min-width: 0; }
.gx-edit-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--pad); }
.gx-edit-h { font-size: var(--fs-2); font-weight: 700; color: var(--text); }

/* The action list. Chips, not a stack of headed sections: the whole point is that choosing an
   action is small and its fields are the only large thing on screen. */
.gx-acts { display: flex; flex-wrap: wrap; gap: 5px; }
.gx-act {
  font: inherit;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-2);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  padding: 3px var(--pad-lg);
  cursor: pointer;
  /* These hold ordinary sentences, and a title in a lane name may be Chinese. */
  text-transform: none;
  letter-spacing: 0;
}
.gx-act:hover { background: var(--hover); }
.gx-act[data-current='1'] { color: var(--accent-text); background: var(--accent); border-color: var(--accent); }

.gx-form {
  display: flex;
  flex-direction: column;
  /* Buttons take their own width. A column stretches its children, and a "File it" button as wide
     as the drawer reads as a bar rather than as a control. */
  align-items: flex-start;
  gap: var(--pad);
  min-width: 0;
}
.gx-form .px-field, .gx-form .gx-prose, .gx-form .gx-carriers { align-self: stretch; }
.gx-drawer-rereading {
  padding: var(--pad);
  margin-bottom: var(--pad);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  background: var(--st-inferred-row);
  border: var(--border-w) solid var(--st-inferred-line);
  border-radius: var(--radius-sm);
}
.gx-edit-row { display: flex; flex-wrap: wrap; gap: var(--pad); }
.gx-warn { color: var(--st-failed); }

/* Which modules carry a step: chosen from a list, and each one removable. */
.gx-carriers { list-style: none; display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
.gx-carrier {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-1);
  padding: 2px var(--pad);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--panel);
  color: var(--text-2);
  overflow-wrap: anywhere;
  min-width: 0;
}
.gx-carrier-drop {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--st-failed);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: .16em;
}
.gx-carrier-none { font-size: var(--fs-1); color: var(--text-3); }

/* THE ORDER, AND THE TWO WRITES THAT CHANGE IT.
   A numbered list rather than a drag surface: it works at 390 px, works from a keyboard, and the
   canvas has no hand-set positions for a drag to mean anything against. The arrows are square
   targets so a thumb can hit them; the word remove is a word rather than a glyph because it deletes a
   record and a glyph would be a guess about what it does. */
.gx-label { font-size: var(--fs-1); color: var(--text-3); margin: var(--pad) 0 0; }
.gx-order { list-style: none; display: flex; flex-direction: column; gap: 4px; align-self: stretch; min-width: 0; }
.gx-order-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-1);
  padding: 3px var(--pad);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text-2);
  min-width: 0;
}
.gx-order-at { color: var(--text-3); min-width: 1.4em; text-align: right; }
.gx-order-name { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.gx-order-move {
  font: inherit;
  min-width: 1.9em;
  min-height: 1.9em;
  color: var(--text-2);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}
.gx-order-move:disabled { color: var(--text-3); cursor: default; opacity: .55; }
.gx-order-drop {
  font: inherit;
  font-size: var(--fs-1);
  color: var(--st-failed);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: .16em;
}
.gx-order-drop:disabled { color: var(--text-3); cursor: default; text-decoration: none; }

/* ---- what the stored hints did ---- */
.gx-intent {
  margin-top: var(--pad);
  padding: var(--pad) var(--pad-lg);
  font-size: var(--fs-1);
  line-height: var(--lh-read);
  color: var(--text-2);
  border: var(--border-w) solid var(--border);
  border-left: var(--rail) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  min-width: 0;
}
.gx-intent[data-tone='unhonoured'] { border-left-color: var(--st-inferred-line); background: var(--st-inferred-row); }
.gx-intent[data-tone='problem'] { border-left-color: var(--st-failed); background: var(--st-failed-row); color: var(--text); }
.gx-intent-head { color: var(--text); }
.gx-intent-list { list-style: none; margin-top: 5px; display: flex; flex-direction: column; gap: 4px; }
.gx-intent-list code { font-family: var(--font-mono); font-size: 0.92em; color: var(--text); overflow-wrap: anywhere; }
.gx-outcome {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: var(--pad);
  border-radius: var(--radius-sm);
  border: var(--border-w) solid var(--st-failed-line);
  background: var(--st-failed-row);
  font-size: var(--fs-1);
  line-height: var(--lh-read);
  color: var(--text);
  min-width: 0;
}
.gx-outcome[data-ok='1'] { border-color: var(--st-done-line); background: var(--st-done-row); }
.gx-outcome-req { font-family: var(--font-mono); font-size: 0.92em; color: var(--text-3); overflow-wrap: anywhere; }
.gx-outcome-said { overflow-wrap: anywhere; }

@media (max-width: 480px) {
  .gx-canvas { height: 62vh; min-height: 300px; }
  /* At this width the drawer is the whole column under the drawing, not a panel beside it. */
  .gx-drawer { flex-basis: 100%; }
}
`
