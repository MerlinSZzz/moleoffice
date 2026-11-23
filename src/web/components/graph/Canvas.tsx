// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useInspect } from '../../lib/mode.ts'
/**
 * THE CANVAS. React Flow draws it; ELK decides where everything goes; nobody stores a coordinate.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE IS LOADED ON DEMAND, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `StructureView.tsx` reaches this module through `React.lazy`, so React Flow, its stylesheet and
 * (through layout.ts) the 8 MB elkjs bundle all land in one chunk that a browser fetches the first
 * time somebody actually opens a canvas. The reading layer — the outline, the counts, the walls, the
 * sentences — is rendered from `model.ts` alone and does not wait for any of it. At 390px the
 * outline is what a reader gets by default and this chunk is never fetched at all.
 *
 * IT ALSO KEEPS THE TEST SUITE HONEST. The runner has no DOM, so React Flow cannot be rendered in a
 * test at all. Isolating it here means every other file in this directory — the model, the layout,
 * the card arithmetic, the outline — is importable and testable, and the untestable part is exactly
 * one file with its boundary written down. Anything in here worth checking has been pushed out into
 * `layout.ts` or `card.ts`: the rounded corners of a line, the window height, the opening view, what
 * a card prints. What is left is wiring.
 *
 * ---------------------------------------------------------------------------------------
 * THE DRAWING OPENS AT READING SIZE. IT DOES NOT OPEN FITTED
 * ---------------------------------------------------------------------------------------
 *
 * This is the decision the whole file turns on, and it reverses what was here.
 *
 * The canvas used to fit the whole drawing into the window on load. On the seeded workspace that
 * settled at zoom 0.36: a 280px card drawn 100px wide, with type about four pixels tall. Every other
 * complaint about the picture was a consequence of it — the lines were drawn and were hidden under
 * their own labels, the arrowheads were drawn and were three pixels across, the words were there and
 * could not be read. A photograph of that is a picture of a diagram, not a diagram.
 *
 * THE WHOLE GRAPH DOES NOT HAVE TO FIT ON SCREEN. It opens at reading size, anchored where the
 * reading starts, and the reader drags it about. `Fit all` is a named button that answers a question
 * somebody asked; it is not the state the page lands in. When Fit all cannot reach the whole drawing,
 * the page's body says so in words (`facts`, below).
 *
 * THE WHEEL SCROLLS THE PAGE, NOT THE CANVAS. A canvas that swallows the wheel is a trap in the
 * middle of a long page: the reader tries to get past it and zooms it instead. Dragging pans, the
 * buttons zoom, and the page keeps scrolling.
 *
 * ---------------------------------------------------------------------------------------
 * MEASURE, THEN LAY OUT, THEN SHOW. THREE PASSES AND EACH ONE IS NECESSARY
 * ---------------------------------------------------------------------------------------
 *
 *   1. The cards AND the words that ride on the lines are rendered where they cannot be seen, at
 *      their real widths. The browser measures them: real fonts, real wrapping, real Chinese.
 *   2. Those measurements go to ELK, which returns a position for every node, a size for the
 *      pipeline box that fits the steps inside it, and a route and a label position for every line.
 *   3. The positions and the routes are applied and the canvas is revealed at reading size.
 *
 * WHY NOT ESTIMATE THE SIZES AND SKIP A PASS. Because `倒片台安全护罩` and `把 1923 年缺的 12 期列成清单`
 * are titles in the demonstration data and a character count is not a width. An estimate that is
 * wrong by 20px leaves cards overlapping, and a layout that only works in English is broken.
 *
 * MEASURING THE LINE LABELS IS NEW, and it fixes a fault a photograph found: ELK was told nothing
 * about them, left 90px between two layers, and a partial gate's pill — "waits on · PARTIAL GATE ·
 * kinematics checked in simulation" — was drawn straight across the card next door. Given the real
 * size, ELK reserves the room.
 *
 * WHILE IT IS WORKING THE CANVAS SAYS SO, in words, with the number of cards. An empty frame that
 * could be mistaken for an empty project is exactly the silence this product exists to remove.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN, AND THE TWO CHANNELS IT IS DRAWN IN
 * ---------------------------------------------------------------------------------------
 *
 * COLOUR IS SPENT ON STATE AND NOTHING ELSE. Eleven link types do not become eleven colours: the
 * type is the WORD on the line. What colour there is on a line comes from the gate, and a gate is a
 * state of the dependency — the same tones `GateMark` in ui.tsx already uses, so a hard gate is the
 * colour of blocked on the record page and on this canvas alike.
 *
 * HARD AND PARTIAL ARE TOLD APART BY SHAPE FIRST. A hard gate ends in a full-height bar; a partial
 * gate ends in a bar with a gap in it, and its label carries the stage it lets you reach. Print this
 * in greyscale and the difference survives. THE DASH IS NOT AVAILABLE for it — this app reserves a
 * dashed line for "Mole Office worked this out and nobody confirmed it", and spending it twice would make
 * an inferred link and a partial gate one thing.
 *
 * NOBODY STYLES ANYTHING BY HAND. There is no colour picker, no arrow menu, and dragging a node
 * moves nothing that is saved — `nodesDraggable` is off, so the picture cannot drift away from the
 * meaning. How a structure is PRESENTED is said in words and stored as presentation intent — a lane,
 * an order, a role, an emphasis — and this file reads that intent and reports what the layout could
 * not do with it. This is a view of records that happens to be drawn, not a diagram editor.
 */

import { t } from '@shared/i18n.ts'
import { DrawingUndoPress, DRAWING_UNDO_MS } from './press.tsx'
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Background,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getSmoothStepPath,
  useReactFlow,
  useStore,
  useStoreApi,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DetailLevel, NodeRole } from '@shared/presentation.ts'
// The reader's word for a stored state, from the one table that holds them.
import { stateWord } from '@shared/words.ts'
import { useDetail } from '../../lib/detailchoice.ts'
// THE ATTRIBUTE A CARD WRITES ITS OWN POSITION ONTO, named once beside the report's own.
import { CARD_RUNG_ATTRIBUTE, drawnAtLength, theDrawingIs } from '../../lib/drawnat.ts'
import { CardControlsLayer, CardFace, CardSays, StateMark, cardTarget, markAttributes, type CardData } from './CardFace.tsx'
import { recordPath } from '../router.tsx'
import { GateMark, StateChip, Tag } from '../ui.tsx'
import { presentation, putTheArrangementBack } from './Edit.tsx'
import {
  DrawingControl,
  DrawingControls,
  sameViewport,
  sameZoom,
  type DrawingViewport,
} from './controls.tsx'
import {
  cardHere,
  cardToOpenOn,
  cardsHere,
  forgetEverySizeHere,
  savedCardsHere,
  restoreCardsHere,
  setCardHere,
  subscribeToCards,
  theCardWasOpened,
  NOT_ON_THIS_DRAWING,
} from './cardhere.ts'
import {
  CARD_RUNG_AT,
  CARD_WIDTH,
  DRAWING_WORDS,
  NO_FOCUS,
  SIZE_A_CARD_STARTS_AT,
  STEP_WIDTH,
  roomOf,
  WIDTH_AT_SIZE,
  cardAt,
  NOTHING_PRESSED,
  neighboursOf,
  planCanvas,
  planFor,
  type CardChoice,
  type SizeWord,
  layoutKeyFor,
  type CanvasPlan,
  type CardPlan,
  restrictionOnCard,
  restrictionMarkDrawnAt,
  type CardRestriction,
} from './card.ts'
import { LINE_WEIGHT } from './lines.ts'
// WHO IS WORKING ON A CARD, drawn at the three positions. See Presence.tsx for what each draws.
import { presenceWorthDrawing, type PresenceHere } from './Presence.tsx'

/**
 * One empty list, shared by every card nobody is on.
 *
 * A fresh `[]` per card per draw is a new identity every time, so the effect below would rebuild
 * every node on every read and throw away the positions ELK worked out.
 */
const EMPTY_PRESENCE: readonly PresenceHere[] = []
// THE READS THAT ANSWER ABOUT THE CARDS ON SCREEN, and the canvas's sentences about them, in one module that a drawing
// which marks no card reads too. See `restrictions` below.
import {
  checksThatCouldNotRunWords,
  presenceFailedWords,
  presenceReadingWords,
  restrictionsFailedWords,
  restrictionsReadingWords,
  stillRestricts,
  useRestrictionsAndPresence,
} from './restrictions-and-presence.ts'
import {
  CANVAS_PAD,
  MAX_ZOOM,
  MIN_ZOOM,
  READING_ZOOM,
  boxHeightFor,
  directionFor,
  drawingSize,
  drawingFocus,
  fitAllFor,
  layoutGraph,
  openingViewport,
  openingZoom,
  placeAt,
  roundedPath,
  routeMidpoint,
  visibleFraction,
  windowsOf,
  type DrawingSize,
  type EdgeRoute,
  type FitAll,
  type FlowDirection,
  type Placement,
  type Size,
} from './layout.ts'
import {
  intentScopeKey,
  intentTargetOf,
  litBySelection,
  placeOf,
  scopeKey,
  type GraphEdge,
  type GraphNode,
  type Lit,
  type ProjectedGraph,
  type StructureGraph,
} from './model.ts'

// ============================================================================ sizes

/**
 * How wide a card is drawn, by the ROLE presentation intent gave it.
 *
 * A FIXED WIDTH AND A MEASURED HEIGHT. Width is a design decision — 280px is about forty Latin
 * characters or twenty Chinese ones at this type size, which is a readable line — and fixing it is
 * what lets the height be measured honestly whatever script the title is in. Nothing here measures a
 * width, so nothing here can be fooled by one.
 *
 * `role` is the one thing that moves it, and it is stored intent rather than taste: `compact` is a
 * node somebody said should be present without competing, `prominent` is one they said is worth
 * landing on first. Three widths and three detail levels, and nothing between them.
 */

/**
 * HOW WIDE THIS CARD IS DRAWN: the width its stored role asks for, at the size its reader has it.
 *
 * TWO FACTS AND THEY ARE DIFFERENT FACTS. The role is authored intent about the structure — this
 * node is present without competing, that one is worth landing on first — and every reader gets it.
 * The size is one reader enlarging one card to read it, for this visit, and nobody else sees it. So
 * they multiply rather than one overriding the other, and the arithmetic is here once.
 */
function widthOf(node: GraphNode, room: number): number {
  const table = node.kind === 'step' ? STEP_WIDTH : CARD_WIDTH
  return Math.round(table[node.presentation.role] * room)
}

/**
 * HOW MUCH A CARD SAYS IS THE READER'S DISTANCE FROM IT, and this file is where that is read.
 *
 * IT USED TO BE ONE CONSTANT — `title-state`, asked for at every zoom. Measured on the campaign
 * pipeline: 21 cards, 1,966 characters, byte for byte the same from 0.32 to 2.0. So zooming out
 * made a picture smaller and never made it simpler. `GRAPH_SCALES` in card.ts names four distances
 * and says which stored field each one draws; `scaleAtZoom` turns the viewport into one of them and
 * keeps a band around each boundary so a wobble does not flicker; `scaleWhenSelected` gives the
 * card the reader pressed one distance more than its neighbours. Nothing about it is a font size.
 *
 * `cardAt` applies the stored `role` on the way through — `compact` one level down, `prominent` no
 * higher, because a stored hint that put a paragraph on the canvas by default is the failure the
 * whole card pass exists to remove.
 *
 * THIS FILE USED TO WORK OUT WHAT A CARD CARRIES ITSELF and the two answers had drifted apart. This
 * file said `prominent` meant `expanded`, which card.ts refuses by name and `tests/graph-card.test.ts`
 * pins; it printed two attached records and a "4 more attached to this card" sentence where the
 * level table says a scanned card prints none and counts them in its badges instead; and it printed
 * a step's note at the level the drawing opens at, so an unowned step said the same thing twice — as
 * a badge and as a sentence — which is the one defect card.ts's header says a photograph had already
 * found once. The suite was green throughout, because the suite tests card.ts and the screen was
 * drawing something else. One answer now, and it is the tested one.
 */

// ============================================================================ the cards

/**
 * A FREE DRAG OF ONE CARD'S PLACE, ON A PHONE — CRITERION D19.
 *
 * A long press on a card's empty space is a free drag of where it sits. What makes the drag worth
 * anything is that the earlier rule against storing a position is void where it gets in the way.
 *
 * IT IS A CONTEXT AND NOT A PROP ON `CardData`, because the plan drawing draws the same card from
 * `CardFace` and does not offer this. The two cards that do — the module card and the pipeline box,
 * both in this file — read it here.
 */
interface AFreeDrag {
  /** Where this node is on the drawing right now, in the layout's own pixels. */
  placeOf: (nodeId: string) => { x: number; y: number } | null
  /** Draw it here instead, while the finger is still down. Nothing is written yet. */
  moveTo: (nodeId: string, at: { x: number; y: number }) => void
  /** The finger came up: write where it was put, into the drawing's stored arrangement. */
  putDown: (nodeId: string) => void
  /** How big the picture is drawn, so a finger's travel becomes the layout's own pixels. */
  zoom: number
  /** Where the window onto the drawing is right now, and how to put it back. See `holdTheView`. */
  theView: () => DrawingViewport
  holdTheView: (at: DrawingViewport) => void
}

const FreeDrag = createContext<AFreeDrag | null>(null)

/**
 * THE HANDLERS THAT MAKE A CARD'S EMPTY SPACE A FREE DRAG, after a long press, with a finger OR a
 * mouse — CRITERIA D24 AND D25.
 *
 * ---------------------------------------------------------------------------------------
 * A MOUSE USED TO DO NOTHING HERE, AND THAT IS THE DEFECT THE OWNER REPORTED
 * ---------------------------------------------------------------------------------------
 *
 * This began `if (drag === null || e.pointerType !== 'touch') return`, on the ground that a card
 * which moved whenever a mouse was dragged across it would take the drag away from the canvas's own
 * panning. With a mouse, the result was that the big box on a pipeline could not be dragged at all,
 * and a long press did not move a block's position either. Section 23 of design/messages/ACCEPTANCE.md
 * records this, and tests/the-pipeline-box-moves-and-stays.test.ts holds it.
 *
 * Measured on that pipeline: a mouse held on the box for 900 milliseconds and
 * dragged 120 across and 80 down moved the box by 0 and 0. Held on a step card, the same gesture
 * moved every one of the eighteen cards by exactly the drag — that was React Flow panning the whole
 * picture, and the card had not moved at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE OLD REASON IS GONE
 * ---------------------------------------------------------------------------------------
 *
 * The long press is the gate for a mouse exactly as it is for a finger: half a second of holding
 * still before the card is picked up. A pointer that presses and moves at once is panning the
 * drawing — criterion D31 — and moves no card at all, which is why the timer is what says a drag
 * of a card was meant. From the moment the hold takes, `keepDragging` puts the window back on
 * every move, so carrying a card does not pan the picture with it.
 *
 * THE EMPTY SPACE AND NOT THE WHOLE CARD. The name is a button, the edges are the grips that resize
 * it, the tick and the strip are its controls: a press that starts on any of those is that thing's.
 */
function useFreeDrag(nodeId: string): {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void
  title: string
  'data-picked-up': string | undefined
} {
  const drag = useContext(FreeDrag)
  const held = useRef<{ x: number; y: number; at: { x: number; y: number }; view: DrawingViewport } | null>(null)
  const armed = useRef<number | null>(null)
  /**
   * WHERE THE POINTER LANDED, kept until the hold takes. A hold is a press that STAYS STILL for half
   * a second: a pointer that has already travelled is a drag across the picture or a pan, not a hold,
   * and must not pick the card up when the half second runs out under it. Without this, a mouse
   * dragged quickly across a card on a slow machine picked the card up mid-drag and moved it
   * (tests/dragging-one-card-moves-no-other.test.ts went red under a parallel suite).
   */
  const downAt = useRef<{ x: number; y: number } | null>(null)
  /**
   * WHETHER THIS CARD HAS BEEN PICKED UP — CRITERION D25.
   *
   * A long press is a gesture with nothing to see, and the report was of somebody trying it and
   * getting nothing: the block still did not move after the hold. So the card says when the hold
   * has taken: the cursor becomes a closed hand and the card is lifted off the drawing. Before the
   * half second is up nothing changes, because until then nothing has been picked up.
   */
  const [pickedUp, setPickedUp] = useState(false)
  const forget = (): void => {
    if (armed.current !== null) window.clearTimeout(armed.current)
    armed.current = null
    setPickedUp(false)
  }
  return {
    // WHAT A PRESS ON THIS DOES, IN WORDS, BEFORE ANYBODY PRESSES IT. A gesture nobody can see is a
    // gesture nobody finds; this is the sentence that says it is there. Criterion D25.
    title: t('g7b.Canvas.hold_this_and_drag_it_to_move'),
    'data-picked-up': pickedUp ? '1' : undefined,
    onPointerDown: (e) => {
      if (drag === null) return
      // THE PRIMARY BUTTON AND NOTHING ELSE. A right-click is how a comment is written on this card,
      // and it sends a pointer-down like any other press: capturing the pointer for a drag took the
      // right-click away from the part of the card it landed on, so a comment meant for one part of
      // a record was filed against the whole record. Found by tests/
      // a-cards-comment-count-does-not-move.test.ts the moment a mouse was let through at all.
      if (e.button !== 0) return
      const at = e.target
      if (at instanceof Element && at.closest('button, a, .gx-grip, .gx-card-controls') !== null) return
      const place = drag.placeOf(nodeId)
      if (place === null) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const from = { x: e.clientX, y: e.clientY, at: place, view: drag.theView() }
      downAt.current = { x: e.clientX, y: e.clientY }
      armed.current = window.setTimeout(() => {
        armed.current = null
        // THE WINDOW AS IT WAS WHEN THE POINTER LANDED, and not as it is now: the canvas pans on a
        // touch drag, and a card picked up after half a second of holding still has not moved the
        // window at all. `keepDragging` puts the window back to this on every move.
        held.current = { ...from, view: drag.theView() }
        setPickedUp(true)
      }, A_LONG_PRESS_ON_A_CARD)
    },
    onPointerMove: (e) => {
      const from = held.current
      if (drag === null) return
      if (from === null) {
        // NOT PICKED UP YET. A pointer that moves further than a hand can hold still before the
        // half second is up has stopped being a hold: forget the timer, so the card stays where it is.
        const down = downAt.current
        if (armed.current !== null && down !== null && Math.hypot(e.clientX - down.x, e.clientY - down.y) > A_HOLD_STAYS_STILL_WITHIN) forget()
        return
      }
      e.preventDefault()
      // THE CANVAS PANS UNDER THIS DRAG, AND THIS DRAG IS NOT A PAN. React Flow's own pan is bound
      // to the pane and starts before any handler of ours can say the gesture is a card's, so it is
      // undone here on every move rather than prevented. Without this the pointer moved the card and
      // the whole picture together, and the card came out twice as far as the pointer went.
      drag.holdTheView(from.view)
      drag.moveTo(nodeId, {
        x: from.at.x + (e.clientX - from.x) / from.view.zoom,
        y: from.at.y + (e.clientY - from.y) / from.view.zoom,
      })
    },
    onPointerUp: (e) => {
      forget()
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      const from = held.current
      if (from === null) return
      held.current = null
      // ONE MORE TIME, AFTER THE LAST MOVE — CRITERION D22, MEASURED AGAIN UNDER D31.
      //
      // React Flow's pan works from wherever the transform is at each move, so the undoing above
      // is a move behind: our handler puts the window back, then React Flow pans it again for the
      // same event, and the last event's pan has nothing after it to undo it. Measured at 1440 on
      // the owner's own pipeline once the card stopped carrying `nopan`: a long press and a 120-across,
      // 60-up drag left the window 10 across and 5 up from where it started, which is exactly one
      // step of that drag. This line is what makes the window really stand still.
      drag?.holdTheView(from.view)
      drag?.putDown(nodeId)
    },
    onPointerCancel: (e) => {
      forget()
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      held.current = null
    },
  }
}

/**
 * HOW ONE CARD IS MOVED, FOR THE GRIPS THAT GROW IT LEFTWARDS OR UPWARDS — CRITERION D29.
 *
 * The same three calls `useFreeDrag` above makes, handed to `CardGrips` in CardFace.tsx, which is
 * where the edges are drawn. A card is placed by its top-left corner, so the left edge and the top
 * edge only reach the pointer if the card's place goes with them, and this is what carries the place
 * across the file boundary.
 *
 * IT IS A HOOK BECAUSE THE CONTEXT IS ONE. `CardGrips` cannot read `FreeDrag` itself: that context
 * lives in this file, and this file cannot be imported by a test because it imports React Flow's
 * stylesheet.
 */
function usePlacing(nodeId: string): NonNullable<CardData['place']> | undefined {
  const drag = useContext(FreeDrag)
  return useMemo(
    () =>
      drag === null
        ? undefined
        : {
            where: () => drag.placeOf(nodeId),
            moveTo: (at: { x: number; y: number }) => {
              drag.moveTo(nodeId, at)
            },
            putDown: () => {
              drag.putDown(nodeId)
            },
          },
    [drag, nodeId],
  )
}

/**
 * HOW LONG A POINTER RESTS ON A CARD BEFORE IT PICKS IT UP, in milliseconds.
 *
 * The same half second the edge grips use. A finger that touches a card and moves straight away is a
 * person scrolling the page past the drawing; a mouse that presses and moves is somebody who has not
 * asked for anything. The hold is what says the drag was meant, and it is the same on both.
 */
const A_LONG_PRESS_ON_A_CARD = 500
/** How far a pointer may drift, in pixels, and still count as holding still. */
const A_HOLD_STAYS_STILL_WITHIN = 6

/**
 * HOW OFTEN THE STEPS INSIDE A PIPELINE'S BOX ARE LAID OUT AGAIN WHILE IT IS BEING DRAGGED — D42.
 *
 * A tenth of a second. The whole argument is on `boxDue` in the canvas, which books the run.
 */
const A_BOX_LAYOUT_AT_MOST_EVERY = 100

function ModuleCard({ id, data }: NodeProps<Node<CardData>>) {
  const down = data.flow === 'DOWN'
  const placing = usePlacing(id)
  return (
    <div
      /**
       * A CARD DOES NOT CARRY `nopan` — CRITERION D31.
       *
       * It did, and that was criterion D22's second half: React Flow pans the whole picture on a
       * pointer drag over the pane, a card is on the pane, so a drag that started on a card moved
       * every card at once. `nopan` stopped that, and it stopped the panning as well.
       *
       * A short press and a drag did not move the view, only a long press did, so inside a large
       * drawn block the view could not be moved with a mouse at all. Measured at 1440 on the owner's
       * own pipeline: a short press and a drag of 120 across and 60 up moved the window from
       * translate(4px, 40px) to translate(124px, -20px) on the bare ground, and left it at
       * translate(4px, 40px) on a card and on the pipeline box. The owner's box is 3578 layout pixels
       * wide, so most of their drawing was a place the view could not be moved from.
       *
       * WHAT STILL KEEPS D22 TRUE. The grips carry `nodrag nopan` themselves, so a resize is never
       * a pan. A long press is the only thing that picks a card up, and from the moment it does,
       * `keepDragging` puts the window back on every move through `holdTheView` — so a card being
       * carried does not pan the picture either. What is left is a short drag, which is a pan and
       * moves no card at all.
       */
      className="gx-card"
      {...markAttributes(data)}
      {...useFreeDrag(id)}
      /**
       * HOW TALL THE READER DRAGGED THIS CARD — CRITERIA D39 AND D40.
       *
       * ---------------------------------------------------------------------------------------
       * IT WAS `minHeight`, AND THAT IS WHERE THE FORCED SIZE CAME FROM
       * ---------------------------------------------------------------------------------------
       *
       * A floor let the card's own words decide the height whenever they were taller than the drag.
       * So the moment the area crossed a level, the level's content made the card taller than the
       * reader had asked for. That is a size forced on the block, and it is
       * exactly what D39 forbids: nothing changes the size on its own.
       *
       * Measured at 1440 on the owner's pipeline before this changed: one 20-pixel step of a card's bottom
       * grip took the card from 15.2 to 53.8 screen pixels tall. The pointer asked for 20 of those
       * 38.6; the level change produced the rest.
       *
       * ---------------------------------------------------------------------------------------
       * IT IS THE HEIGHT NOW, AND WHAT DOES NOT FIT RUNS ON UNDER A FADE — CRITERION D40
       * ---------------------------------------------------------------------------------------
       *
       * The card is exactly as tall as the reader dragged it. The level's content is drawn whole
       * inside it and the part that does not fit continues below, covered by the card's own border,
       * with a fade at the bottom saying there is more. Growing the card reveals the rest without
       * anything being drawn again. `.gx-card[data-cut='1']` in the stylesheet is the fade.
       *
       * A CARD NOBODY HAS DRAGGED HAS NO HEIGHT OF ITS OWN and is as tall as its words, which is
       * every card on a drawing that has just opened.
       *
       * IT IS ON THE CARD AND NOT ON THE NODE React Flow wraps it in. The wrapper has no height of
       * its own, so a height on the wrapper would leave the card its old size with empty space
       * under it; the wrapper follows the card, and React Flow measures the wrapper.
       */
      style={data.plan.height === null ? undefined : { height: data.plan.height }}
      data-cut={data.plan.height === null ? undefined : '1'}
    >
      <Handle type="target" position={down ? Position.Top : Position.Left} />
      {/* HOW THIS CARD IS MOVED, for the left and top edges that grow it by moving it — D29. */}
      <CardFace {...data} place={placing} />
      <Handle type="source" position={down ? Position.Bottom : Position.Right} />
    </div>
  )
}

/**
 * The pipeline box: a compound node with its steps inside it.
 *
 * IT IS ON THE LADDER TOO, and it was not. It drew its name, every fact it held and its folded count
 * at every distance, so the one object that is meant to carry the far view was the one object the
 * distance did not reach. It now draws exactly what its rung says, from the same `cardAt` every
 * other object goes through.
 *
 * WHEN IT IS FOLDED it has no children at all: `model.ts` leaves them out of the graph, carries the
 * count on the box, and lists them under the drawing.
 */
function PipelineCard({ id, data }: NodeProps<Node<CardData>>) {
  const down = data.flow === 'DOWN'
  const folded = data.node.presentation.collapsed
  const card = cardAt(data.node, data.plan)
  const dragging = useFreeDrag(id)
  const placing = usePlacing(id)
  return (
    <div
      // THE BOX DOES NOT CARRY `nopan` EITHER — criterion D31, and the reason is written on the
      // card above. A short drag anywhere inside the box moves the view; only a long press picks
      // the box up.
      className="gx-group"
      {...dragging}
      // THE PIPELINE BOX IS A CARD TOO, so a press inside it that reaches no step resolves to the
      // pipeline record and not to the page.
      {...cardTarget(data.node)}
      data-alarm={data.node.alarm}
      data-folded={folded ? '1' : undefined}
      // WHICH OF THE NINE CARD POSITIONS THIS BOX WAS DRAWN AT, on its own attribute. It shared
      // `data-rung` with a report's reading length until 30 August 2026, and the reader of that
      // attribute accepted only the six reading words — so every comment right-clicked onto a card
      // was stored with no view and nothing said so. `src/web/lib/drawnat.ts` holds both names.
      {...{ [CARD_RUNG_ATTRIBUTE]: data.plan.rung }}
      // WHICH READING LENGTH THIS BOX DREW. The pipeline box is a node like any other and reaches
      // the same levels, so it says which one it is at on the same attribute a card does. See
      // `markAttributes` in CardFace.tsx, which is where the argument for the two attributes is.
      {...(data.plan.level === null ? {} : drawnAtLength(data.plan.level))}
      data-tier={data.plan.tier}
      data-earns={data.plan.earns ?? undefined}
    >
      <Handle type="target" position={down ? Position.Top : Position.Left} />
      {/* THE BOX'S OWN STATE, NAMED — CRITERION D20. The same element a card draws, from the same
          component, so the box and the card cannot say the shape means two different things. */}
      {data.node.state === null ? null : (
        <StateMark state={data.node.state} word={stateWord(data.node.stateWord ?? data.node.state).text} />
      )}
      <div className="gx-group-head">
        {card.name === null ? null : (
          <button
            type="button"
            className="gx-card-title"
            onClick={() => data.onOpen(data.node.recordId)}
            title={t('g7b.Canvas.open_this_record')}
            data-field={card.name.field}
          >
            {card.name.text}
          </button>
        )}
        {/* THE PIPELINE BOX CARRIES THE SAME RESTRICTION MARK AS A CARD. A pipeline is a record
            and a restriction can be about it; a box that quietly drew none would be the one shape
            on the drawing where a blocking restriction disappears. */}
        {data.restriction === null ? null : (
          <span
            className="gx-mark gx-mark-restricted"
            data-mark="restricted"
            data-severity={data.restriction.severity}
            data-glyph={data.restriction.glyph}
            data-edge={data.restriction.edge}
            title={`${data.restriction.word} — ${data.restriction.detail}`}
          >
            <span className="num">{data.restriction.count}</span>
          </span>
        )}
        {card.marks.map((mark) => (
          <span
            className="gx-mark"
            key={mark.key}
            data-mark={mark.kind}
            data-alarm={mark.alarm}
            title={mark.full}
            aria-label={mark.full}
          >
            <span className="num">{mark.text}</span>
            {mark.word === null ? null : <span className="gx-mark-word">{mark.word}</span>}
          </span>
        ))}
        {card.badges.map((badge) => (
          <span className="gx-badge" key={badge.key} data-alarm={badge.alarm} title={badge.full}>
            {badge.short}
          </span>
        ))}
        {/* THE SAME COMPONENT A CARD DRAWS. What this box says at levels 4 to 6, what it says about
            a level nobody wrote, and the controls that move it are one implementation used twice —
            see `CardSays`. */}
        <CardSays node={data.node} plan={data.plan} card={card} choice={data.choice} onChoose={data.onChoose} onOpen={data.onOpen} />
      </div>
      {/* OFF THE WHOLE BOX AND NOT OFF ITS HEAD. The steps are drawn under the head, so a strip
          hanging off the head hangs over the first step. See `CardControlsLayer`. */}
      <CardControlsLayer
        node={data.node}
        plan={data.plan}
        choice={data.choice}
        onChoose={data.onChoose}
        place={placing}
      />
      <Handle type="source" position={down ? Position.Bottom : Position.Right} />
    </div>
  )
}

const NODE_TYPES = { card: ModuleCard, group: PipelineCard }

// ============================================================================ the lines

interface LineData extends Record<string, unknown> {
  edge: GraphEdge
  /** The route ELK worked out. Null before the layout has answered, and when it returned none. */
  route: EdgeRoute | null
  /**
   * True when this line is on screen ONLY because something is selected.
   *
   * A `carries` line is not drawn by default — see `EdgeDrawn` in model.ts for why ten of them at
   * once ruins a pipeline drawing. When a selection brings one back it has to be obvious that it is
   * an answer to what was just pressed, and not a line that was always there and went unnoticed.
   */
  revealed: boolean
  /** How much this line says in words. See `LineWordLevel`. */
  words: LineWordLevel
  /** What a press on this line's gate mark does: opens why the block is closed, or puts it away. */
  onAsk: () => void
}

/**
 * HOW MUCH ONE LINE SAYS IN WORDS. Two answers, and the first of them is what every line gets.
 *
 *   `label`  what the link type is called, in one or two words, and the gate as a mark. ALWAYS.
 *   `full`   the gate in words as well: why this block is closed, and how far you may go.
 *
 * BOTH USED TO BE HELD BACK. There was a third, `none`, and a drawing whose cards opened below
 * level 3 drew no word on any line — which was every drawing. Criterion D16 asks for the opposite:
 * lines and their labels, such as gate, hard gate and carry, are shown by default.
 *
 * WHY `full` IS STILL NOT THE DEFAULT, AND WHAT OPENS IT. A partial gate's meaning is stored as free
 * prose — how far you may go — and one of them is 240 characters. Drawn on every gated line it is
 * the biggest thing on the canvas. It is an answer to a question, so it is drawn where the question
 * was asked: one press on the gate's own mark, since the explanation of why a block is closed is
 * not shown by default, and one press again puts it away.
 */
export type LineWordLevel = 'label' | 'full'

/** Which tone a line carries. From the gate, which is a state of the dependency — never the type. */
function toneOf(edge: GraphEdge | undefined): 'plain' | 'hard' | 'partial' {
  const gate = edge?.gate ?? null
  return gate === null ? 'plain' : gate.kind === 'hard' ? 'hard' : 'partial'
}

/**
 * The words that ride on a line, at the two distances that have room for them.
 *
 * THE LINES WERE NOT ON THE DETAIL LADDER AND IT WAS THE LOUDEST THING LEFT. `waits on`, `carries`
 * and — worst — a partial gate's own sentence were drawn at full length at every distance, so at a
 * third size the biggest text on the drawing was a 240-character paragraph riding on one edge while
 * every card around it was down to a clipped name. That was photographed.
 *
 * WHAT A LINE SAYS WITH NO WORDS. Its family is its weight and its dash, from `lines.ts`: one thing
 * waits for another, the first leads to the second, or the two are joined with neither waiting.
 * Its gate is the shape of its arrowhead — a filled head is a hard gate, a notched one is partial,
 * an open chevron is no gate at all. A broken line keeps its own mark. None of that is a character.
 */
function LineWords({
  edge,
  words,
  onAsk,
}: {
  edge: GraphEdge
  words: LineWordLevel
  onAsk: () => void
}) {
  const open = words === 'full'
  return (
    <>
      <span className="gx-line-word">{edge.label}</span>
      {/* THE GATE'S MARK IS THE CONTROL THAT OPENS ITS EXPLANATION — CRITERION D16.
          `GateMark` draws the words "Hard gate" or "Partial gate" and then the gate's own prose,
          which is 240 characters on one line of one drawing. Off by default, and one press on the
          mark opens it. It is a toggle, so it is never in the
          state its press would set and never says nothing. */}
      {edge.gate === null ? null : (
        <DrawingControl
          look="plain"
          className="gx-gate-open"
          now={open}
          after={!open}
          label={open ? t('g7b.Canvas.put_away_why_this_is_closed') : t('g7b.Canvas.why_this_is_closed')}
          title={open ? t('g7b.Canvas.put_away_why_this_block_is_closed') : t('g7b.Canvas.say_why_this_block_is_closed')}
          onPress={onAsk}
        >
          {open ? (
            <GateMark gate={edge.gate} />
          ) : (
            <span className="gx-gate-shape" data-gate={edge.gate.kind} aria-hidden="true" />
          )}
        </DrawingControl>
      )}
      {open && edge.reading?.at === 'unstated' ? (
        <span className="gx-line-note">{t('g7b.Canvas.nobody_said_how_much')}</span>
      ) : null}
      {edge.broken ? <span className="gx-line-note">{t('g7b.Canvas.broken')}</span> : null}
    </>
  )
}

/**
 * One line, with the word that says what it means and the mark that says how hard it is.
 *
 * THE PATH IS ELK'S, NOT REACT FLOW'S. It used to be re-guessed here with `getSmoothStepPath`, which
 * knows only the two end points and nothing about what is in between — so a line ran through a card
 * as readily as round it, and its label landed wherever the midpoint of that guess fell. ELK routes
 * orthogonally around every box it placed and reserves room for the words; drawing what it worked
 * out is what makes a line something you can follow from one card to the other.
 *
 * WHEN ELK RETURNED NO ROUTE the line is still drawn, between the right two cards, as a direct
 * connector — and `LayoutReport.unhonoured` says so in words under the canvas. A line that quietly
 * disappeared would be the worse answer by far.
 */
function MeaningEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<Edge<LineData>>) {
  const edge = data?.edge
  const route = data?.route ?? null
  const [guessed, guessedX, guessedY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
  })
  const path = route === null ? guessed : roundedPath(route.points)
  // WHERE THE WORDS GO, IN THE ORDER THE ANSWERS ARE GOOD.
  //   1. The room ELK reserved for this label, which also avoids the cards. Every line drawn by
  //      default has one.
  //   2. The middle of the route ELK actually returned. A line that is only drawn on selection is
  //      given no ELK label on purpose — reserving a column of the drawing for words that are not
  //      on screen is what this pass removed — so when it IS drawn its word goes on its own line.
  //   3. The midpoint of React Flow's guessed path, which is all there is before the layout answers.
  // Without step 2 a revealed `carries` line put its word wherever the guessed path happened to
  // cross, which is nowhere near the line the reader can see.
  const middle = route === null ? null : routeMidpoint(route.points)
  const labelX = route?.label?.x ?? middle?.x ?? guessedX
  const labelY = route?.label?.y ?? middle?.y ?? guessedY
  const tone = toneOf(edge)
  const revealed = data?.revealed === true
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        // `carries` states no order, so it gets no arrowhead. An arrow there would read as "the
        // module comes first", which is not what the record says. Everything else is a direction and
        // says so with a solid head at the end it points at.
        {...(edge?.relation === 'carries' ? {} : { markerEnd: `url(#gx-arrow-${tone})` })}
        className={`gx-line gx-edge-line ${edge?.relation === 'carries' ? 'gx-edge-carries' : ''}`}
        data-revealed={revealed ? '1' : undefined}
        // The dash is this app's one reserved signal for "Mole Office worked this out". It is spent here
        // and nowhere else on a line, so an inferred link and a partial gate can never look alike.
        style={{ strokeDasharray: edge?.inferred === true ? '6 5' : undefined }}
        data-tone={tone}
      />
      {/* EVERY LINE CARRIES ITS WORD — criterion D16. There used to be a distance at which none of
          them did, and it was the distance every drawing opened at. */}
      {edge === undefined ? null : (
        <EdgeLabelRenderer>
          <div
            className="gx-line-label gx-edge-label"
            data-tone={tone}
            data-revealed={revealed ? '1' : undefined}
            data-broken={edge.broken ? '1' : undefined}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <LineWords edge={edge} words={data?.words ?? 'label'} onAsk={data?.onAsk ?? (() => {})} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const EDGE_TYPES = { meaning: MeaningEdge }

/**
 * The arrowheads, defined once and referred to by name.
 *
 * THEY ARE OURS RATHER THAN REACT FLOW'S because React Flow's markers take a colour as a value, and
 * a colour written into an attribute cannot be themed, cannot follow the state tones and cannot be
 * fixed for contrast. These are painted by CSS class from the same `--st-` tokens as everything
 * else, so the arrow on a hard gate is the colour blocked is, in every theme.
 *
 * `userSpaceOnUse` keeps the head the size the drawing is at rather than a multiple of the stroke,
 * so a 2px line and a 1.5px line get the same arrow.
 */
/**
 * How thick an open arrowhead's outline is, in the marker's own coordinates.
 *
 * IT IS NOT A LINE WEIGHT and it is deliberately not in `LINE_WEIGHT`. That table is the ordering
 * between the KINDS OF LINE on this canvas — a gate is heavier than a plain dependency, which is
 * heavier than a held-back carries line — and `tests/graph-lines.test.ts` holds the canvas
 * stylesheet to reading every stroke width out of it. This is the outline of a 12-unit glyph inside
 * a marker, drawn at a fixed size by `markerUnits='userSpaceOnUse'`, and putting it in that table
 * would add a fifth weight to an ordering it has no place in.
 */
const ARROW_OUTLINE = 1.5

const ARROW_SHAPES = [
  { tone: 'plain' as const, d: 'M 1 1 L 11 6 L 1 11', filled: false },
  { tone: 'hard' as const, d: 'M 1 1 L 11 6 L 1 11 z', filled: true },
  { tone: 'partial' as const, d: 'M 1 1 L 11 6 L 1 11 L 5 6 z', filled: true },
]

function ArrowHeads() {
  return (
    <svg className="gx-defs" aria-hidden="true" focusable="false">
      <defs>
        {/* A DIFFERENT SHAPE PER TONE, not one shape in three colours. Below `near` there are no
            words on any line at all, so the head is the only thing left saying how hard the
            dependency is — and a distinction made only in hue is the one this product's contract
            bans outright. Open chevron: no gate. Filled: a hard gate. Notched: a partial one. */}
        {ARROW_SHAPES.map(({ tone, d, filled }) => (
          <marker
            key={tone}
            id={`gx-arrow-${tone}`}
            viewBox="0 0 12 12"
            refX="11"
            refY="6"
            markerWidth="13"
            markerHeight="13"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path
              d={d}
              className="gx-arrow"
              data-tone={tone}
              data-filled={filled ? '1' : undefined}
              {...(filled ? {} : { strokeWidth: ARROW_OUTLINE })}
            />
          </marker>
        ))}
      </defs>
    </svg>
  )
}

// ============================================================================ the canvas

export interface CanvasProps {
  /**
   * WHAT THIS CANVAS DRAWS: a PROJECTION of the complete graph, and the exact account of what it
   * leaves out.
   *
   * IT IS ONE OBJECT AND NOT A GRAPH BESIDE A COUNT, on purpose. `projection.graph` is what is
   * drawn and `projection.omitted` is what is not, worked out together by `projectForCanvas` in one
   * pass; two props would be two answers to one question, and the sentence under a drawing would
   * eventually disagree with the drawing above it. `StructureView.tsx` states the boundary this
   * sits inside: the model is complete, this projects from it, and the reading layer renders the
   * complete model.
   */
  projection: ProjectedGraph
  /** What a press on a card does. The page decides; this file only reports the record id. */
  onOpen: (recordId: string) => void
  /**
   * SAY THAT THE ARRANGEMENT ON THE SERVER HAS CHANGED, so the page reads it again — criterion D36.
   *
   * The reset button is the one thing on the canvas that writes to the stored arrangement, and the
   * graph this canvas draws is built by the page FROM that arrangement. Without this the drawing
   * would go on drawing places that had just been forgotten. It is the same call the edit drawer
   * already makes after any other write to the arrangement.
   */
  onIntentChanged: () => void
  /**
   * WHAT THIS DRAWING COULD NOT SHOW, handed up for the page to say in its body (wave 13u round 217): each fact a
   * whole sentence, and only the ones that are true. An empty list when the drawing goes. Left out where a drawing is
   * rendered with no page around it, as the tests render it.
   */
  onSays?: (facts: readonly string[]) => void
}

/**
 * The React Flow nodes for this drawing.
 *
 * `keep` is the drawing that is already on screen, and passing it is what makes a REDRAW quiet. The
 * data behind a canvas changes — links arrive after the first paint, an agent files a record — and
 * every one of those rebuilt the node list with every position back at the origin, so the picture
 * collapsed into a heap in the top-left corner for as long as the new layout took. `tools/review.mjs`
 * photographed exactly that. A node that was already placed keeps where it was until ELK answers,
 * and then every position is replaced at once; a node that is new starts at the origin, because
 * there is nowhere honest to put it until the layout says.
 */
function toFlowNodes(
  graph: StructureGraph,
  onOpen: (recordId: string) => void,
  plan: CanvasPlan,
  /**
   * WHAT THE READER HAS PRESSED ON EACH CARD, keyed by record id, and how a press is stored.
   *
   * The choices come down rather than being read per card, for the reason `wordsOf` in model.ts
   * gives about a record's words: a card reading its own storage on every render is a card deciding
   * a thing the drawing has already decided, and twelve cards each reading it is twelve answers.
   */
  chosen: ReadonlyMap<string, CardChoice>,
  onChoose: (recordId: string, choice: CardChoice) => void,
  keep: readonly Node<CardData>[] = [],
): Node<CardData>[] {
  const flow = directionFor(graph)
  const already = new Map(keep.map((node) => [node.id, node]))
  // Parents first: React Flow requires a parent to appear before its children in the array.
  const ordered = [...graph.nodes].sort((a, b) => Number(a.parentId !== null) - Number(b.parentId !== null))
  return ordered.map((node) => ({
    id: node.id,
    type: node.kind === 'pipeline' ? 'group' : 'card',
    position: already.get(node.id)?.position ?? { x: 0, y: 0 },
    // WHAT IS SELECTED SURVIVES A REDRAW OF THE SAME DRAWING, for the same reason the positions do:
    // the records behind a canvas change while somebody is reading it, and a reader who pressed a
    // module to see what it carries must not have the answer taken away by a write somewhere else.
    // A DIFFERENT drawing arrives with no `keep` at all, so it opens with nothing selected.
    ...(already.get(node.id)?.selected === true ? { selected: true } : {}),
    // `lit` starts false and is patched in by the effect that watches the selection — see
    // `Flow`. Working it out here as well would be two answers to one question, and this function
    // runs on a redraw rather than on a press.
    // `restriction` starts null and is patched in by the effect that watches the read — see
    // `Flow`. It arrives after the first paint, like the routes do, and a rebuild here to carry
    // it would throw away the positions ELK worked out.
    // `here` starts empty and is patched in by the same kind of effect, for the same reason.
    data: {
      node,
      onOpen,
      flow,
      lit: false,
      restriction: null,
      here: [],
      says: plan.says,
      plan: planFor(plan, node.id),
      choice: chosen.get(node.recordId) ?? NOTHING_PRESSED,
      onChoose: (choice: CardChoice) => onChoose(node.recordId, choice),
      opens: node.kind === 'step' ? t('g7b.Canvas.open_this_block') : t('g7b.Canvas.open_this_record'),
    },
    // `parentId` and NOT `extent: 'parent'`. The extent clamps a child inside its parent's CURRENT
    // size, and the parent's size is one of the things the layout works out — so on the pass that
    // applies the positions, every step was clamped into the pipeline card's pre-layout 280 × 64
    // box and the lines between them came out twenty pixels long. Nothing here is draggable, so
    // there is nothing for the extent to protect against.
    ...(node.parentId === null ? {} : { parentId: node.parentId }),
    // A pipeline box keeps the size ELK gave it until ELK gives it another; everything else is
    // measured again from the width its role asks for.
    //
    // A CARD THAT IS NEW TO A REDRAW IS DRAWN INVISIBLE, not hidden. It has no position yet, so
    // drawing it would put it on top of whatever is at the origin — which is what a photograph
    // caught when the links arrived after the first paint and eleven module cards appeared in a
    // heap over the pipeline's first step. `hidden` would be the obvious answer and is the wrong
    // one: React Flow does not measure a node it does not render, so the layout would never learn
    // its size. Transparent keeps it measured, and the layout clears this the moment it has a place.
    style: {
      ...(node.kind === 'pipeline' && already.has(node.id)
        ? (already.get(node.id)!.style ?? { width: widthAsked(node, plan, chosen) })
        : { width: widthAsked(node, plan, chosen) }),
      ...(keep.length > 0 && !already.has(node.id) ? { opacity: 0 } : {}),
    },
    draggable: false,
    selectable: true,
  }))
}

/**
 * HOW TALL EACH COMPOUND NODE'S HEAD IS DRAWN RIGHT NOW, read off the drawn head.
 *
 * IT IS MEASURED FOR THE SAME REASON THE CARDS ARE. A head holds whatever the box says about itself
 * at the level it is at, and on the box the reader pressed it holds that box's own controls as
 * well; a number in a stylesheet or a constant beside the layout would be a second opinion about a
 * height only the browser knows. `toElkGraph` turns it into the box's top padding, which is the
 * room the head has before the first step is placed.
 */
/**
 * WHERE ONE NODE IS ON THE SCREEN RIGHT NOW, or null when this browser is not drawing it.
 *
 * Read off the drawn element rather than worked out from the layout, because a step inside a
 * pipeline box is placed relative to the box and the box has a place of its own. What the reader
 * sees is one number and this is it.
 */
/**
 * WHERE ONE NODE SITS ON THE WHOLE DRAWING, adding up the places of the boxes it is inside.
 *
 * A step is placed relative to its pipeline box, so its own place says nothing about where it is on
 * the drawing. This walks up the parents and adds them, which is the only way to compare where a
 * node was with where the new layout put it.
 *
 * WORKED OUT FROM THE LAYOUT AND NOT FROM THE SCREEN. Reading the drawn element would mean waiting
 * for React to put the new places in the DOM, and a frame is not a promise anybody keeps: the first
 * version of this measured one frame after the places were set, read the old position back, and
 * corrected the view by nothing at all.
 */
function placeOnTheDrawing(
  nodeId: string,
  places: ReadonlyMap<string, { x: number; y: number; parentId: string | null }>,
): { x: number; y: number } | null {
  let at = places.get(nodeId)
  if (at === undefined) return null
  let x = at.x
  let y = at.y
  // Bounded by the number of boxes: a parent chain longer than that is a cycle, which nothing here
  // can build, and a loop that trusted the data would hang the page rather than report anything.
  for (let step = 0; step < places.size && at.parentId !== null; step += 1) {
    const parent = places.get(at.parentId)
    if (parent === undefined) break
    x += parent.x
    y += parent.y
    at = parent
  }
  return { x, y }
}

/**
 * ONE LINE'S ROUTE, SHIFTED — CRITERION D37.
 *
 * ELK works a route out in the frame of the box that contains the line, lifted into the drawing's
 * own pixels by `routeOf` in layout.ts. When a box's own change is applied without moving the box,
 * every route ELK worked out inside that box is off by however far ELK would have moved it, and
 * this puts them back. The label goes with the line, because its place is a point on the same route.
 */
function movedBy(route: EdgeRoute, dx: number, dy: number): EdgeRoute {
  if (dx === 0 && dy === 0) return route
  return {
    points: route.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    label: route.label === null ? null : { ...route.label, x: route.label.x + dx, y: route.label.y + dy },
  }
}

function headRoom(graph: StructureGraph): ReadonlyMap<string, number> {
  const heads = new Map<string, number>()
  if (typeof document === 'undefined') return heads
  for (const node of graph.nodes) {
    if (node.kind !== 'pipeline') continue
    const head = document.querySelector(`.react-flow__node[data-id="${CSS.escape(node.id)}"] .gx-group-head`)
    if (head instanceof HTMLElement && head.offsetHeight > 0) heads.set(node.id, head.offsetHeight)
  }
  return heads
}

/**
 * HOW WIDE THIS CARD IS ASKED TO BE, at the size the plan has it.
 *
 * IT READS THE PLAN AND NOT THE STORED CHOICE ALONE, because a card nobody has sized is at the
 * size the place opens it at and the plan is where that answer is worked out. A width read from
 * the stored choice would measure a box that is not the box on the screen, and ELK would place the
 * cards to the wrong widths.
 */
function widthAsked(
  node: GraphNode,
  plan: CanvasPlan,
  chosen: ReadonlyMap<string, CardChoice>,
): number {
  const planned = plan.cards.get(node.id)?.room
  return widthOf(node, planned ?? roomOf(chosen.get(node.recordId) ?? NOTHING_PRESSED, plan.says))
}

/**
 * EVERY NODE THAT IS NOT WHERE ELK PUT IT — CRITERIA D19, D32 AND D34.
 *
 * A line's route is ELK's own, in the drawing's absolute pixels, worked out when the drawing was
 * laid out. It is right until something it touches moves, and then it runs to an empty place. So
 * every node in this answer has its lines drawn from its handles instead, which is what makes a
 * line follow the card.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO WAYS A NODE GETS IN HERE, AND WHY THE SECOND ONE WAS MISSING
 * ---------------------------------------------------------------------------------------
 *
 * A STORED PLACE. `presentation.placedAt` is where somebody put the card, read back from the
 * store. That was the only way in, and it is a whole round trip behind the reader's hand: a drag
 * writes when the pointer comes up, the graph is not read again in that visit, so `placedAt` stays
 * null and the lines kept ELK's route for the rest of the visit.
 *
 * A PLACE IN THIS VISIT. The set the drag itself fills, before anything is stored. This is the half
 * that was missing, and it answers two defects. After a long press dragged the big block, its lines
 * were not updated and stayed where they were; and the block's lines did not follow it, but kept a
 * fixed offset. Measured at 1440 on the owner's own pipeline: a long press moved the box from
 * translate(771px, 116.333px) to translate(959.235px, 222.216px), its first step moved with it, and
 * 0 of the 11 lines on screen changed by a single pixel.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS INSIDE A MOVED BOX MOVES WITH IT
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline's box carries its steps: React Flow places a child from its parent, so moving the box
 * moves all nine steps and every line between them. Naming only the box would leave those nine
 * lines on ELK's route, which is most of the lines on the owner's drawing. Every descendant of a moved node
 * is therefore moved too.
 */
function whatIsNotWhereElkPutIt(graph: StructureGraph, movedInThisVisit: ReadonlySet<string>): ReadonlySet<string> {
  const moved = new Set<string>(movedInThisVisit)
  for (const node of graph.nodes) if (node.presentation.placedAt !== null) moved.add(node.id)
  if (moved.size === 0) return moved
  // A CHILD IS ADDED WHEN ITS PARENT IS IN. One pass per level of nesting, and a graph with no
  // nesting left to walk stops at once, so this cannot spin on a cycle.
  for (let again = true; again; ) {
    again = false
    for (const node of graph.nodes) {
      if (node.parentId === null || moved.has(node.id) || !moved.has(node.parentId)) continue
      moved.add(node.id)
      again = true
    }
  }
  return moved
}

/**
 * The lines this canvas draws right now.
 *
 * TWO FILTERS AND THEY ARE DIFFERENT QUESTIONS. The first is whether the line has two ends on this
 * canvas at all — a line with nothing to join is not drawn anywhere. The second is whether the
 * drawing is showing it: every dependency and every stored link always, and a `carries` line only
 * while one of its two ends is selected. `model.ts` decides which is which and says why in
 * `EdgeDrawn`; this file only obeys it, so the lines on screen and the number named in `omitted`
 * cannot come apart.
 */
function toFlowEdges(
  graph: StructureGraph,
  routes: ReadonlyMap<string, EdgeRoute>,
  lit: Lit,
  /**
   * The lines whose gate the reader has asked about, and what a press on a gate's mark does.
   *
   * IT USED TO BE THE SELECTION. Pressing a card opened the gate prose on every line touching it,
   * which is a lot of prose for a press that was about the card. Criterion D16 makes it a question
   * asked of one line, and the gate's explanation is not shown by default.
   */
  gatesOpen: ReadonlySet<string>,
  askAboutTheGate: (edgeId: string) => void,
  /**
   * The nodes the reader has moved in THIS visit, before the store has answered — criteria D32 and
   * D34. `putHere` in `Flow` holds the places; this is the same set of ids, kept in state so the
   * memo that builds these lines runs again when it changes.
   */
  movedInThisVisit: ReadonlySet<string>,
): Edge<LineData>[] {
  const present = new Set(graph.nodes.map((node) => node.id))
  const titles = new Map(graph.nodes.map((node) => [node.id, node.title]))
  const moved = whatIsNotWhereElkPutIt(graph, movedInThisVisit)
  return graph.edges
    .filter((edge) => present.has(edge.from) && present.has(edge.to))
    .filter((edge) => edge.drawn === 'always' || lit.edges.has(edge.id))
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      ariaLabel: t('g7b.edgeLabel', { from: titles.get(edge.from) ?? t('g7b.missingRecord'), relation: edge.label, to: titles.get(edge.to) ?? t('g7b.missingRecord') }),
      type: 'meaning',
      data: {
        edge,
        route: moved.has(edge.from) || moved.has(edge.to) ? null : (routes.get(edge.id) ?? null),
        revealed: lit.edges.has(edge.id),
        words: gatesOpen.has(edge.id) ? ('full' as const) : ('label' as const),
        onAsk: () => askAboutTheGate(edge.id),
      },
    }))
}

/** What the canvas is doing, and what it has to say about it. */
/**
 * Why the two named view buttons cannot act before the layout has finished.
 *
 * It replaces `disabled={drawn === null}`, which greyed both of them out and would not say why —
 * the dead end `Btn` has refused to draw since long before this file.
 */
const NOT_LAID_OUT_YET = () => t('g7b.Canvas.the_drawing_has_not_been_laid_out')

/** WHAT A DRAWING WITH NOTHING FOCUSED USED TO SAY, above the drawing. Criterion D15 took the
 * control that said it away; the sentence is kept because the comment below is still about focus.
 */

type CanvasState =
  | { at: 'measuring' }
  | { at: 'laying-out' }
  | {
      at: 'drawn'
      /**
       * NO `ms` HERE ANY MORE, AND THAT IS A DELETION RATHER THAN A MOVE. "laid out in 47 ms" was
       * printed under every drawing. It measures the machine that drew it, not the project; it
       * changes on every redraw of the same records; and no reader has ever done anything different
       * because of it. `layoutGraph` still returns it and `tests/graph-layout` still checks it, so
       * the measurement is still available to anybody measuring — it is just not furniture on the
       * page.
       */
      /** Everything the drawing occupies, so the view buttons need no second layout. */
      drawing: DrawingSize
      /** The part of it the lines are in, which is where the view opens. */
      focus: DrawingSize
      opensAt: number
      opened: number
      /** What pressing `Fit all` will do, including whether it can do what its name says. */
      fits: FitAll
      /** How many windowfuls of drawing there are at the zoom it opened at. */
      windows: { across: number; down: number }
      /**
       * THE TWO WINDOWS THE NAMED BUTTONS OPEN, WORKED OUT ONCE, HERE.
       *
       * `Reading size` and `Fit all` each set a window onto the drawing, and each must refuse when
       * the reader is already looking through it. So the button and the check need the same two
       * numbers, and without this they would be worked out twice — once by the effect that opens
       * the view and once by the button at press time — which is the defect this repository keeps
       * producing. Both read them from here, so a press and a refusal cannot disagree.
       */
      readingAt: DrawingViewport
      fitAt: DrawingViewport
    }
  | { at: 'failed'; message: string }

/** What the two named view buttons and the sentence under the drawing read: everything but `at`. */
type WindowAnswers = Omit<Extract<CanvasState, { at: 'drawn' }>, 'at'>

/**
 * THE WINDOW ANSWERS, WORKED OUT IN ONE PLACE — problem NnAR6QkKt71N.
 *
 * A layout works them out from where it put everything. A card the reader puts down moves with no
 * layout, and `putDown` in `Flow` works them out again from where everything is drawn now. Both
 * call this, so `Fit all` after a move and `Fit all` after the page is opened again are the same
 * arithmetic on the same kind of answer.
 */
function windowAnswers(
  drawing: DrawingSize,
  focus: DrawingSize,
  width: number,
  height: number,
  focusAtTheTop: boolean,
): WindowAnswers {
  const opensAt = openingZoom(drawing, width, height)
  // `fitAllFor` and not `fitZoomFor`: `setViewport` obeys whatever zoom it is handed, so the
  // floor that `minZoom` puts under the reader's own buttons has to be applied here too, or
  // `Fit all` is the one way past it. See the note on `fitAllFor`.
  const fits = fitAllFor(drawing, width, height)
  return {
    drawing,
    focus,
    opensAt,
    opened: visibleFraction(drawing, width, height, opensAt),
    fits,
    windows: windowsOf(drawing, width, height, opensAt),
    readingAt: openingViewport(drawing, focus, width, height, focusAtTheTop),
    fitAt: { ...placeAt(drawing, width, height, fits.zoom), zoom: fits.zoom },
  }
}

function Flow({ projection, onOpen, onIntentChanged, onSays }: CanvasProps) {
  const inspect = useInspect()
  /**
   * The cards and lines this canvas has been asked to draw.
   *
   * READ OUT OF THE PROJECTION AND NEVER REBUILT HERE. Everything below — the measuring, the layout,
   * the counts in the sentence underneath — is about this graph, which is the drawing. What is NOT
   * in it is `projection.omitted`, counted exactly and printed under the canvas, and it is never
   * subtracted, re-derived or estimated by this file.
   */
  const graph = projection.graph
  /**
   * The press handler, held still.
   *
   * THIS IS NOT A TIDINESS. `onOpen` arrives as a new function on every render of the page above,
   * and the reset effect below depends on it: with the raw prop in that list, every render threw the
   * measured positions away and started measuring again, so the canvas drew twelve cards stacked at
   * the top left and never got past it. A photograph found it. The ref keeps the LATEST handler
   * while the identity a card holds never changes, so a caller passing an inline function — which is
   * the ordinary thing to do — cannot break the drawing again.
   */
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  const open = useCallback((recordId: string) => openRef.current(recordId), [])

  /**
   * HOW MUCH THIS DRAWING SAYS. One value for the whole canvas, and ZOOM IS NOT WHAT DECIDES IT.
   *
   * It comes from `rungFor('graph', …)`, through the same five deciders every other surface in this
   * product reads: what the reader set for this visit, for this surface, for everything, what the
   * drawing itself asks for, and Mole Office's own default. `useDetail` re-renders this canvas when any
   * of them changes.
   *
   * WHAT USED TO BE HERE was `scaleAtZoom(READING_ZOOM)` and an effect that moved it every time the
   * reader zoomed. That is the fusion: the picture could not be made bigger without being made to
   * say more, and at `Fit all` the band that answered admitted zero objects, so every card on the
   * drawing was an empty box.
   */
  // NOTHING IS PASSED AS `recommended`, AND THAT IS AN ABSENCE RATHER THAN A DEFAULT. `rungFor`'s
  // fourth decider is what the thing being read asks for — `presentation_intent.detail` — and no
  // drawing in this corpus stores one, because `detail` is not in `SCOPE_KEYS` yet. Passing a value
  // this canvas made up would be a setting nobody chose, sitting above Mole Office's own default.
  //
  // NULL FOR THE KIND, because one drawing holds records of many kinds and is the body of none of
  // them. The reader floor is a rule about a report page, so no card here is floored and every one
  // of the seven positions is a card a person can ask for.
  //
  // WHAT THE DRAWING ASKS FOR IS ITS PLACE'S OWN ANSWER, which is criterion D14: the drawing no
  // longer carries a control that sets what its cards say, and `DRAWING_PLACES[…].opensAt` is where
  // they start. It is handed in as what the thing being read asks for, so a person's own setting on
  // the settings page still wins over it and Mole Office's own default sits below it.
  const detail = useDetail('graph', null, placeOf(graph.scope).opensAt)
  const says = detail.rung
  /** Stable ids for the control names, so each group is named by the words next to it. */
  const ids = useId()
  /**
   * WHICH DRAWING THESE CARDS ARE ON, for the reader's own per-card choices.
   *
   * NOT THE PROJECTION. Pressing `Show all` draws more cards of the same drawing, and a reader who
   * enlarged one card has not said anything about which cards are drawn. Keying the choices by the
   * projection as well would forget every size the moment that button was pressed.
   */
  const drawing = scopeKey(graph.scope)
  /**
   * WHAT THIS READER HAS PRESSED ON THE CARDS OF THIS DRAWING.
   *
   * `presses` IS A COUNT AND NOT THE CHOICES THEMSELVES. The choices live in `cardhere.ts`, which is
   * where a press is written, so holding a copy of them here would be two places with one fact in
   * them. This counts the presses so the read below happens again after each one — the same shape
   * `StructureView` uses for re-reading the stored arrangement.
   */
  const [presses, setPresses] = useState(0)
  useEffect(() => subscribeToCards(() => setPresses((count) => count + 1)), [])
  const recordIds = useMemo(() => graph.nodes.map((node) => node.recordId), [graph])
  const chosen = useMemo(
    () => cardsHere(drawing, recordIds),
    // `presses` is read for its value changing and not for its value: a press writes the store and
    // this is what asks the store again.
    [drawing, recordIds, presses],
  )
  /** The same choices, keyed the way the plan is keyed: by the node's id on this drawing. */
  const chosenByNode = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, chosen.get(node.recordId) ?? NOTHING_PRESSED])),
    [graph, chosen],
  )
  /**
   * WHICH CARD THE READER IS WORKING ON, so the next layout can leave it where it is.
   *
   * Criterion D13's second sentence: *Resizing one card re-lays the drawing without moving the
   * viewport (the resized card grows in place; neighbours make room without the view jumping).*
   * A wider card is a different box, so ELK places every card again — and ELK's answer is a whole
   * new arrangement, in which the card the reader is dragging can easily end up somewhere else on
   * the screen. `holdStill` below reads where this card was, applies the new places, and moves the
   * window by the difference, so the card under the pointer does not move and the drawing rearranges
   * around it.
   */
  const holdStill = useRef<string | null>(null)
  /**
   * WHICH PIPELINE'S BOX CHANGED ITS OWN SIZE, so the layout that follows changes that box and
   * nothing outside it — CRITERION D37.
   *
   * A box needs a layout where a card does not: its steps are laid out INSIDE it, so the layout has
   * to run. But the layout ELK hands back is a whole new arrangement of the drawing, and applying
   * all of it moves every card that has nothing to do with the box — which is the fault D22 already
   * names: when a block is enlarged, shrunk or moved, the other blocks must not change.
   *
   * So this names the box, and `readAndLayOut` below applies THAT BOX'S size and the places of the
   * steps inside it, and leaves every other card exactly where it is.
   */
  const boxAlone = useRef<string | null>(null)
  /** Which layout key the drawing has already been laid out for, so one drawing is one layout. It
   *  is declared here rather than beside the effect that reads it because the booking below has to
   *  release it: a booked run with the guard still held would see the drawing as already done. */
  const doneFor = useRef<string | null>(null)
  /**
   * WHEN THE STEPS INSIDE A BOX BEING DRAGGED ARE LAID OUT AGAIN — CRITERION D42.
   *
   * The big block no longer disappeared, but resizing it was very jerky: it changed in steps, and a
   * corner could not be dragged freely to resize it.
   *
   * A drag writes a size on every pixel, and every one of those used to run ELK over the whole
   * drawing before the box's frame moved at all. On the owner's own pipeline — nine steps in a box 3578
   * pixels wide — that is what those steps are: measured at 1440, the frame lagged
   * the pointer by up to 4.8 pixels a step and then collapsed by 214.
   *
   * SO THE TWO ARE SEPARATED. The FRAME follows the pointer on every pixel, because a box's own
   * width and height are now written straight onto its node. The STEPS INSIDE IT are laid out on a
   * booking: the first change of a burst books a run a tenth of a second later, every change inside
   * that tenth reuses the booking, and the run takes whatever size the box has by then. So the last
   * size a drag writes is always laid out within a tenth of a second of the reader stopping, which
   * is D42's "when the drag ends or every 100 milliseconds while it lasts".
   *
   * A TENTH OF A SECOND AND NOT A FRAME, because ELK on the owner's box takes longer than a frame, so a
   * booking per frame would be the same queue under another name.
   */
  const boxDue = useRef<number | null>(null)
  const [boxRuns, setBoxRuns] = useState(0)
  useEffect(
    () => () => {
      if (boxDue.current !== null) window.clearTimeout(boxDue.current)
    },
    [],
  )
  const choose = useCallback(
    (recordId: string, choice: CardChoice) => {
      /**
       * NOTHING IS LAID OUT ON THE CHANGE ITSELF, FOR A CARD OR FOR A BOX — CRITERION D42.
       *
       * D22 says a card being resized leaves every other card where it is, so `holdStill` tells the
       * layout effect to lay nothing out. A box used to be the other case, because a change of its size
       * has to rearrange the blocks and lines it touches — and it still needs a layout, because its
       * steps are drawn inside it. What changed is WHEN: the layout is booked rather than run on the
       * change, so a hundred pointer events in one drag are one layout instead of a hundred.
       */
      const kind = graph.nodes.find((node) => node.recordId === recordId)?.kind ?? null
      holdStill.current = recordId
      if (kind === 'pipeline') {
        boxAlone.current = recordId
        if (boxDue.current === null) {
          boxDue.current = window.setTimeout(() => {
            boxDue.current = null
            // THE CLAIM IS GIVEN UP AND THE GUARD RELEASED, so the effect below runs the layout this
            // booking is for rather than reading the drawing as already laid out.
            holdStill.current = null
            doneFor.current = null
            setBoxRuns((count) => count + 1)
          }, A_BOX_LAYOUT_AT_MOST_EVERY)
        }
      }
      setCardHere(drawing, recordId, choice)
    },
    [drawing, graph],
  )
  const [nodes, setNodes] = useState<Node<CardData>[]>(() =>
    toFlowNodes(graph, open, planCanvas(graph, says, NO_FOCUS), new Map(), choose),
  )
  const [routes, setRoutes] = useState<ReadonlyMap<string, EdgeRoute>>(() => new Map())
  /**
   * The routes as they are drawn right now, for the layout effect to read — the same reason
   * `nodesRef` below exists.
   *
   * A layout that changes ONE BOX keeps every other line's route, so it has to know what those
   * routes are. The effect deliberately does not depend on the state, and a ref set on every render
   * always holds the latest.
   */
  const routesRef = useRef(routes)
  routesRef.current = routes
  /**
   * WHICH CARDS THE READER HAS MOVED IN THIS VISIT — CRITERIA D32 AND D34.
   *
   * The same ids `putHere` holds, kept in state as well as in that ref. The ref is what the layout
   * reads, and a ref changing does not draw anything again; the lines have to be built again the
   * moment a card moves, so this is the reactive half. `whatIsNotWhereElkPutIt` is what reads it.
   */
  const [movedHere, setMovedHere] = useState<ReadonlySet<string>>(() => new Set())
  /**
   * The cards as they are drawn right now, for the layout effect to read.
   *
   * The layout effect deliberately does not depend on `nodes` — it would run again on every
   * selection — so it cannot read the state variable and be sure of what it is holding. A ref set on
   * every render always holds the latest.
   */
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  /**
   * WHAT THE LAST LAYOUT WORKED THE WINDOW ANSWERS OUT FROM — problem NnAR6QkKt71N.
   *
   * Where it put everything, with the size ELK gave each node; the lines it counted; and the window's
   * width and height. A card the reader puts down runs no layout: the layout key holds which cards
   * have a stored place and not where they are (D36). So `fitAt` stayed where the last layout left
   * it, and `Fit all` said it was already showing the whole drawing while the box the reader had
   * dragged was outside the window. `putDown` works the answers out again from this.
   */
  const laidOut = useRef<{
    placements: ReadonlyMap<string, Placement>
    routes: ReadonlyMap<string, EdgeRoute>
    width: number
    height: number
  } | null>(null)

  /**
   * THE CARD A COMMENT WAS WRITTEN ON, OPENED — focused, and set to the level it was written at.
   *
   * ---------------------------------------------------------------------------------------
   * D8's SECOND SENTENCE
   * ---------------------------------------------------------------------------------------
   *
   * *Opening the comment later from the chat or the review column takes the reader to that card at
   * that level.* The comment already stored the drawing and the level; nothing read either back, so
   * every press landed on the record page and the reader had to find the card again by hand.
   *
   * ---------------------------------------------------------------------------------------
   * IT HAPPENS ONCE AND THEN IT IS SPENT
   * ---------------------------------------------------------------------------------------
   *
   * `theCardWasOpened` forgets it as soon as it is used, so a reader who then presses another card
   * is not dragged back, and opening the drawing again tomorrow is an ordinary visit.
   *
   * ---------------------------------------------------------------------------------------
   * A CARD THAT IS NOT ON THIS DRAWING ANY MORE IS SAID, NOT SWALLOWED
   * ---------------------------------------------------------------------------------------
   *
   * A record can leave a drawing — a link is deleted, a step is taken out of its pipeline — and the
   * comment still names it. `notDrawn` is that case, and the foot of the drawing says it in one
   * sentence with the record's own page offered. Focusing nothing and saying nothing would be a
   * press that did nothing, which is the defect this whole cluster is about.
   */
  const [notDrawn, setNotDrawn] = useState<string | null>(null)
  useEffect(() => {
    const going = cardToOpenOn(drawing)
    if (going === null) return
    theCardWasOpened(drawing)
    const node = graph.nodes.find((one) => one.recordId === going.recordId)
    if (node === undefined) {
      setNotDrawn(going.recordId)
      return
    }
    setNotDrawn(null)
    // THE LEVEL FIRST, so the card is already at it when the focus redraws it. It is written as a
    // level chosen by hand, because that is what it is: somebody chose it when they wrote the
    // comment, and the sizes may not take it away underneath the reader.
    if (going.level !== null) {
      setCardHere(drawing, going.recordId, { ...cardHere(drawing, going.recordId), level: going.level })
    }
    setNodes((current) => current.map((one) => ({ ...one, selected: one.id === node.id })))
  }, [drawing, graph])

  /**
   * WHAT IS SELECTED, AND WHY THIS CANVAS HAS TO HANDLE THE CHANGES ITSELF.
   *
   * React Flow keeps no selection of its own when the `nodes` array is controlled, which this one
   * is: a click reaches `triggerNodeChanges` and, with no `onNodesChange` handler, is dropped on the
   * floor. So every card was permanently unselected and `elementsSelectable` did nothing at all.
   *
   * ONLY THE `select` CHANGES ARE APPLIED. The other kinds — dimensions, position — are already
   * accounted for by the measure-then-lay-out-then-show passes this file is built around, and
   * feeding them back into the array here would mean two things writing the same positions. Nothing
   * is draggable, so a position change cannot arrive in the first place.
   */
  const onNodesChange = useCallback((changes: NodeChange<Node<CardData>>[]) => {
    const chosen = changes.filter((change) => change.type === 'select')
    if (chosen.length === 0) return
    setNodes((current) => applyNodeChanges(chosen, current))
  }, [])
  /**
   * A SECOND PRESS ON THE CARD THAT IS ALREADY FOCUSED TAKES THE FOCUS OFF IT.
   *
   * ---------------------------------------------------------------------------------------
   * WHY A TOGGLE AND NOT A REFUSAL
   * ---------------------------------------------------------------------------------------
   *
   * Verifier DV1 measured it on 5 September 2026 and filed problem `1GbOLOj_-qnn`: pressing a card
   * that was already selected changed nothing and said nothing, which is criterion D1's defect —
   * React Flow's own click handler asks for a selection the canvas is already in, no change is
   * emitted, and the press is silent.
   *
   * D1 allows two answers: refuse in words, or make the press change something. This is the second,
   * and it is the right one HERE because of what the control is. A press on a card is the focus
   * control — the fourth of the four states the owner named — and a control that can only ever be
   * turned on is a state with no way out of it from the thing that put you in it. As a toggle the
   * press is never in the state it would set, so there is nothing to refuse and nothing is silent.
   *
   * THE OTHER WAY OUT IS THE BACKGROUND. A press on the empty canvas takes the focus off every
   * card. There was a `Focus` row over the drawing naming the focused card, with a `Clear` beside
   * it; criterion D15 took it away, because what it meant was unclear to a reader,
   * and what says a card is focused is the card: its outline, and its own controls over it.
   */
  const onNodeClick = useCallback((event: { target: unknown }, node: Node<CardData>) => {
    // A PRESS ON THE CARD'S OWN CONTROLS IS NOT A PRESS ON THE CARD. They are drawn inside the node,
    // so React Flow's click handler sees every one of them, and without this the first press on the
    // size control took the focus off the card and the controls went with it. A browser test caught
    // it: the strip was on screen, one press moved the card, and the second press had nothing to
    // land on.
    const at = event.target
    // A PRESS ON THE CARD'S OWN CONTROLS IS NOT A PRESS ON THE CARD, and an edge a reader is
    // dragging is one of them: without the grip named here, letting go of a drag on the card that
    // was already focused took the focus off and the controls went with it.
    if (at instanceof Element && at.closest('.gx-card-strip, .gx-card-corner, .gx-grip') !== null) return
    if (node.selected !== true) return
    setNodes((current) => current.map((one) => (one.id === node.id ? { ...one, selected: false } : one)))
  }, [])
  const selected = useMemo(
    () => new Set(nodes.filter((node) => node.selected === true).map((node) => node.id)),
    [nodes],
  )
  /**
   * The lines a selection reveals and the cards it reaches, worked out by `model.ts`.
   *
   * IT IS THE MODEL'S ANSWER AND NOT THIS FILE'S, because the rule it encodes is the one this
   * product bans getting wrong: the mapping between a step and a module is many-to-many in BOTH
   * directions. `litBySelection` matches on "is this node either end of the line", which cannot be
   * written in a way that implies one module per step; the same rule re-derived here would be a
   * second copy of it, in the one file the test suite cannot load.
   */
  const lit = useMemo(() => litBySelection(graph, selected), [graph, selected])
  /**
   * THE ONE PLAN FOR THIS DRAWING AT THIS MOMENT: which objects carry words, at which rung, and why.
   *
   * IT IS WORKED OUT ONCE FOR THE WHOLE CANVAS AND NOT PER CARD. The three reductions have to agree
   * with each other — a level that has room for six objects and then lets a seventh draw its name is
   * a drawing whose own count strip is wrong — so `planCanvas` decides all three together and every
   * card, the strip underneath and the layout all read the same answer.
   */
  const focus = useMemo(
    () => ({ selected, neighbours: neighboursOf(graph, selected) }),
    [graph, selected],
  )
  const plan = useMemo(
    () => planCanvas(graph, says, focus, chosenByNode),
    [graph, says, focus, chosenByNode],
  )
  /**
   * THE LINES WHOSE GATE THE READER HAS ASKED ABOUT. Empty is the ordinary case — criterion D16.
   *
   * FOR THIS VISIT AND NOT STORED, and not even for the visit: it is a question asked of a line
   * while looking at it, like a selection, and it goes when the drawing does. Nothing is written.
   */
  const [gatesOpen, setGatesOpen] = useState<ReadonlySet<string>>(() => new Set())
  const askAboutTheGate = useCallback((edgeId: string) => {
    setGatesOpen((open) => {
      const next = new Set(open)
      if (!next.delete(edgeId)) next.add(edgeId)
      return next
    })
  }, [])
  // `movedHere` IS IN THE LIST FOR A REASON — criteria D32 and D34. Without it the lines are built
  // once and a drag cannot rebuild them, so a card could be taken out of the route's reach and its
  // line would still be drawn from the route.
  const edges = useMemo(
    () => toFlowEdges(graph, routes, lit, gatesOpen, askAboutTheGate, movedHere),
    [graph, routes, lit, gatesOpen, askAboutTheGate, movedHere],
  )
  /** The box, and how tall it should be for what is in it. Null until ELK has answered once. */
  const boxRef = useRef<HTMLDivElement | null>(null)
  /** The hidden rack the words on the lines are measured in. See `labelSizes`. */
  const rackRef = useRef<HTMLDivElement | null>(null)
  const [boxHeight, setBoxHeight] = useState<number | null>(null)
  /**
   * How wide the window is, measured rather than read at the moment it happens to be needed.
   *
   * NOTHING IS LAID OUT UNTIL THIS IS A REAL NUMBER, and that is not caution. The lazy chunk mounts
   * before the page has settled, so `clientWidth` was zero on the first run — which made the opening
   * zoom fall back to 1, the window height fall back to the stylesheet's, and the whole drawing open
   * somewhere nobody chose. `tools/review.mjs` photographed the result: two cards on top of each
   * other in the corner at 100%. A layout worked out against a window of no width is a layout of
   * nothing, so it waits for one.
   */
  const [boxWidth, setBoxWidth] = useState(0)
  const [state, setState] = useState<CanvasState>({ at: 'measuring' })
  /**
   * WHICH DRAWING THE POSITIONS ON SCREEN BELONG TO, or null before any have been worked out.
   *
   * It decides whether anything is shown at all. Until a drawing has been laid out every card sits
   * at the origin, and showing that is a heap in the corner rather than a picture — `tools/review.mjs`
   * photographed exactly that on the pipeline drawing, two cards on top of each other and fifteen
   * nowhere. So the rule is: show the cards only while the positions on them are positions somebody
   * worked out FOR THIS DRAWING.
   *
   * That is one comparison and it covers both cases. A different structure — the reader picked
   * another pipeline — has no positions yet and is hidden until it has. The SAME structure drawn
   * again, because its records changed, keeps the picture already on screen: a second out of date is
   * far better than a second of nothing.
   */
  const [drawnKey, setDrawnKey] = useState<string | null>(null)
  const [report, setReport] = useState<StructureGraph['report']>(graph.report)
  /**
   * How many cards the browser has measured, read from React Flow's own store.
   *
   * NOT `useNodesInitialized()`, which is the obvious hook and is the wrong one here. That hook also
   * waits for every node's HANDLE bounds, and these cards' handles are one pixel wide and carry no
   * border, which is what keeps them out of the drawing. Waiting on them left the canvas measuring
   * for ever. This asks the only question the layout actually needs answered — is every card's width
   * and height known — and it puts the number on screen, so "still measuring" says how far it got
   * rather than just sitting there.
   */
  const measured = useStore((store) => {
    let count = 0
    for (const [, node] of store.nodeLookup) {
      if ((node.measured?.width ?? 0) > 0 && (node.measured?.height ?? 0) > 0) count++
    }
    return count
  })
  /**
   * The window the reader is looking through right now, so the buttons and the sentence can say.
   *
   * ALL THREE NUMBERS, not the zoom alone. `Reading size` and `Fit all` each set a whole window,
   * and a reader who has dragged the drawing is at the right zoom in the wrong place — so a check
   * that read only the zoom would refuse a press that would have moved the picture.
   */
  const viewX = useStore((store) => store.transform[0])
  const viewY = useStore((store) => store.transform[1])
  const zoom = useStore((store) => store.transform[2])
  const viewport: DrawingViewport = { x: viewX, y: viewY, zoom }
  const initialised = nodes.length > 0 && measured >= nodes.length && boxWidth > 0
  const { setViewport, zoomIn, zoomOut } = useReactFlow()
  // The store itself, so the effect reads the SAME measurements the count above is derived from.
  // `getNodes()` hands back the array this component controls, which never carries `measured` — that
  // lives in React Flow's internal lookup — and reading it there produced a canvas that failed with
  // "no measured size for 12 nodes" while every card on screen plainly had one.
  const store = useStoreApi()
  /**
   * WHICH DRAWING THIS IS — and the projection is part of the answer.
   *
   * It used to be the scope alone. Pressing `Show all` keeps the scope and changes which cards exist,
   * so with the scope as the whole key a canvas would have kept the positions worked out for ten
   * cards while drawing twenty-seven, and would never have re-opened the view on a drawing six times
   * the size. One key, one meaning: the positions on screen belong to this scope drawn this way.
   */
  const key = `${scopeKey(graph.scope)}@${projection.projection}`
  /**
   * WHICH LAYOUT THE POSITIONS ON SCREEN BELONG TO — the drawing AND the distance it was drawn at.
   *
   * A card that says more is a taller card, and ELK placed the cards it was measured with. So a
   * distance change is a new layout, and this key is what asks for one. It is deliberately NOT the
   * key above: `key` decides whether the picture is shown at all and whether the view is re-opened,
   * and re-opening the view on a zoom would snap the reader back to the corner every time they
   * crossed a boundary — which is the fault `viewedFor` exists to prevent.
   */
  /**
   * WHICH CARDS HAVE A STORED PLACE, in the layout key — CRITERION D36.
   *
   * A stored place is not a card's size and does not change any card's box, so it was not part of
   * this key. But forgetting every stored place at once IS a new layout: the cards go from where
   * somebody put them to where ELK puts them, and nothing else about them changes. Without this the
   * reset re-read the arrangement, found the places gone, and laid nothing out — the drawing kept
   * the positions from the layout before it.
   */
  const placedNow = graph.nodes
    .filter((node) => node.presentation.placedAt !== null)
    .map((node) => node.id)
    .join(',')
  const layoutKey = layoutKeyFor(
    `${key}/placed:${placedNow}`,
    nodes.map((node) => ({
      plan: node.data.plan,
      presence: presenceWorthDrawing(node.data.here).length,
      restricted: node.data.restriction !== null,
      // HOW MUCH ROOM THIS CARD HAS, which is what a reader's drag sets. A wider card is a different
      // box, so it is a different layout: this is what asks for one when an edge is dragged.
      room: node.data.plan.room,
    })),
  )
  /**
   * Which drawing the view was last opened on.
   *
   * THE READER'S VIEW IS THEIRS. A canvas re-measures and lays out again whenever the data behind it
   * changes, and the first version of this set the opening view every time it did — so a reader who
   * had dragged to the far end of a pipeline, or pressed `Fit all`, was snapped back to the corner a
   * second later by a redraw they had not asked for. A photograph found it: `Fit all` was pressed,
   * the picture fitted, and the next layout put it back at 85%. The view is set when a DIFFERENT
   * drawing is opened, and left alone when the same one is drawn again.
   */
  const viewedFor = useRef<string | null>(null)

  // The window's own width, kept up to date. A resize re-measures it; the guard below stops a
  // resize from re-laying out a drawing that is already placed.
  useEffect(() => {
    const box = boxRef.current
    if (box === null) return
    const read = (): void => setBoxWidth(box.clientWidth)
    read()
    const watcher = new ResizeObserver(read)
    watcher.observe(box)
    return () => watcher.disconnect()
  }, [])

  // A new scope is a new measurement. Without this the second drawing would keep the first one's
  // positions and quietly draw the wrong picture.
  useEffect(() => {
    doneFor.current = null
    setState({ at: 'measuring' })
    setReport(graph.report)
    // The routes and the node positions are KEPT until the new ones arrive. Clearing them here is
    // what made a redraw a flash of stacked cards with no lines; see `toFlowNodes`.
    setNodes((current) => toFlowNodes(graph, open, planRef.current, chosenRef.current, choose, current))
  }, [graph, open, choose])

  /**
   * Mark the cards a selection reaches, and unmark the ones it stopped reaching.
   *
   * ITS OWN EFFECT, TOUCHING ONE FIELD. A selection changes on a press, and the positions on these
   * nodes cost a measure-and-lay-out pass to work out — rebuilding the array from the graph to carry
   * a boolean would throw them away and collapse the drawing into the corner, which is the fault
   * `toFlowNodes` already carries a whole paragraph about.
   *
   * IT RETURNS THE ARRAY IT WAS GIVEN WHEN NOTHING CHANGED, and that is not a micro-optimisation:
   * `selected` and `lit` are derived FROM `nodes`, so a new array every run would feed straight back
   * into this effect for ever. Same array, React bails out, and it settles in one pass.
   */
  useEffect(() => {
    setNodes((current) => {
      let changed = false
      const next = current.map((node) => {
        // The card you pressed is not "lit" — it is the question. Only the far ends are the answer.
        const on = lit.nodes.has(node.id) && !selected.has(node.id)
        if (node.data.lit === on) return node
        changed = true
        return { ...node, data: { ...node.data, lit: on } }
      })
      return changed ? next : current
    })
  }, [lit, selected])

  /**
   * WHAT RESTRICTS THE CARDS ON THIS DRAWING, AND WHO IS WORKING ON THEM — read for the drawing's own records, not the
   * project, by `useRestrictionsAndPresence` (src/web/components/graph/restrictions-and-presence.ts).
   *
   * ---------------------------------------------------------------------------------------
   * NOBODY LOOKED IS NOT NOTHING IS THERE, AND THE PAGE'S BODY SAYS WHICH
   * ---------------------------------------------------------------------------------------
   *
   * Three states, not a boolean: the read has not answered yet, it answered, or it failed. A card
   * draws no mark in all three, because a card cannot draw "nobody looked" in a shape — so the
   * page's body says it in words instead, from `facts` below. Without that, a drawing whose read failed would be
   * a drawing that says nothing restricts anything, which is the fifth invariant broken in the one
   * place a reader would most trust it. Presence is the same: a card draws no presence when nobody is here, when the
   * read has not answered and when it failed, and a shape cannot tell those apart.
   */
  const nodeRecordIds = useMemo(() => graph.nodes.map((node) => node.recordId), [graph])
  const { restrictions, presence } = useRestrictionsAndPresence(nodeRecordIds)

  /**
   * The mark each card draws, keyed on the node id. Empty while the read has not answered.
   *
   * IT IS WORKED OUT HERE AND NOT PER CARD, for the same reason the plan is: whether this POSITION
   * draws a restriction mark at all is a fact about the drawing, and nineteen cards each deciding
   * it is nineteen answers to one question.
   */
  const restrictionByNode = useMemo(() => {
    const out = new Map<string, CardRestriction>()
    if (restrictions.at !== 'read') return out
    for (const node of graph.nodes) {
      const readings = restrictions.byRecord[node.recordId]
      if (readings === undefined || readings.length === 0) continue
      const mark = restrictionOnCard(readings, says)
      if (mark !== null) out.set(node.id, mark)
    }
    return out
  }, [graph, restrictions, says])

  /**
   * HOW MANY CARDS ON THIS DRAWING SOMETHING RESTRICTS, whether or not this position draws it.
   *
   * It is not `restrictionByNode.size`: that map is empty at position 1 by design, and a sentence
   * that counted 0 there would say nothing is restricted on a drawing where four things are.
   */
  const restrictionsHere = useMemo(() => {
    if (restrictions.at !== 'read') return 0
    let count = 0
    for (const node of graph.nodes) {
      if (stillRestricts(restrictions.byRecord[node.recordId] ?? [])) count += 1
    }
    return count
  }, [graph, restrictions])

  /**
   * Hand each card its restriction mark. One field, so the positions ELK worked out survive it.
   *
   * Same shape as the `lit` effect above and for the same reason: it returns the array it was given
   * when nothing changed, so a derived value cannot feed back into it for ever.
   */
  useEffect(() => {
    setNodes((current) => {
      let changed = false
      const next = current.map((node) => {
        const want = restrictionByNode.get(node.id) ?? null
        const have = node.data.restriction
        if (have === want) return node
        if (have !== null && want !== null && have.count === want.count && have.severity === want.severity) return node
        changed = true
        return { ...node, data: { ...node.data, restriction: want } }
      })
      return changed ? next : current
    })
  }, [restrictionByNode])

  /** Who is on each card, keyed on the node id. Empty while the read has not answered. */
  const presenceByNode = useMemo(() => {
    const out = new Map<string, PresenceHere[]>()
    if (presence.at !== 'read') return out
    for (const node of graph.nodes) {
      const here = presence.byRecord[node.recordId]
      if (here === undefined || here.length === 0) continue
      out.set(node.id, here)
    }
    return out
  }, [graph, presence])

  /**
   * HOW MANY CARDS SOMEBODY IS ON, AND HOW MANY OF THOSE THE DRAWING IS SHOWING.
   *
   * The two numbers differ on purpose. A domain with no sign of work for days draws nothing on a
   * card — the owner's section 15, *a durable agent with nothing pending should have almost no
   * visual weight* — so the drawing would otherwise say nothing at all about work that is still
   * open. The page's body says it in words instead, from `facts` below, which is where a fact with no
   * shape goes.
   */
  const presenceHere = useMemo(() => {
    if (presence.at !== 'read') return { on: 0, drawn: 0 }
    let on = 0
    let drawn = 0
    for (const node of graph.nodes) {
      const here = presence.byRecord[node.recordId] ?? []
      if (here.length === 0) continue
      on += 1
      if (presenceWorthDrawing(here).length > 0) drawn += 1
    }
    return { on, drawn }
  }, [graph, presence])

  /** Hand each card who is on it, and the position the drawing is at. */
  useEffect(() => {
    setNodes((current) => {
      let changed = false
      const next = current.map((node) => {
        const want = presenceByNode.get(node.id) ?? EMPTY_PRESENCE
        const have = node.data.here
        if (have === want && node.data.says === says) return node
        if (have.length === 0 && want.length === 0 && node.data.says === says) return node
        changed = true
        return { ...node, data: { ...node.data, here: want, says } }
      })
      return changed ? next : current
    })
  }, [presenceByNode, says])

  // THE EFFECT THAT MOVED THE DETAIL LEVEL WITH THE ZOOM IS GONE. It was the one line where canvas
  // zoom became a semantic level, and `design/round-ten/design/graph.md` §19 names it by address.
  // Zoom scales geometry and changes no card's text at any zoom, ever.

  /**
   * The distance, readable without making the effects above depend on it.
   *
   * The redraw effect rebuilds every node when the GRAPH changes and has to give the new nodes the
   * distance the canvas is at. Depending on `scale` there would rebuild every node on every zoom
   * boundary too, which throws away the positions ELK worked out — the fault `toFlowNodes` already
   * carries a paragraph about.
   */
  const planRef = useRef(plan)
  planRef.current = plan
  /** The reader's own per-card choices, readable by the redraw effect for the same reason. */
  const chosenRef = useRef(chosen)
  chosenRef.current = chosen

  /**
   * Hand the new plan to every card. One field, so the positions ELK worked out survive it.
   *
   * IT RETURNS THE ARRAY IT WAS GIVEN WHEN NOTHING CHANGED, and that is not a tidiness: `selected`
   * is derived FROM `nodes` and the plan is derived from `selected`, so a new array every run would
   * feed straight back into this effect for ever. Comparing the three fields a card actually draws
   * from is what makes it settle in one pass.
   */
  useEffect(() => {
    setNodes((current) => {
      let changed = false
      const next = current.map((node) => {
        const want = planFor(plan, node.id)
        const have = node.data.plan
        // THE CARD'S OWN LEVEL AND SIZE ARE PART OF THIS COMPARISON, because they are what a card
        // draws its body from. Leaving them out would let a press on a card's own controls change
        // the plan and never reach the card, which is a control that changes nothing.
        const chose = chosenByNode.get(node.id) ?? node.data.choice
        if (
          have.rung === want.rung &&
          have.tier === want.tier &&
          have.earns === want.earns &&
          have.says === want.says &&
          have.level === want.level &&
          have.size === want.size &&
          // HOW BIG THE READER DRAGGED IT — criteria D39 and D42. Without these two lines a corner
          // drag stored a size that never reached the card, which is a drag that does nothing. The
          // width is a pipeline box's own pixels and is what makes its frame follow the pointer.
          have.height === want.height &&
          have.width === want.width &&
          have.missing?.level === want.missing?.level &&
          have.missing?.why === want.missing?.why &&
          have.identity?.text === want.identity?.text &&
          node.data.choice === chose
        ) {
          return node
        }
        changed = true
        // A PIPELINE BOX'S WIDTH IS ITS OWN AND NEVER A CARD WIDTH. `widthOf` multiplies a role's
        // width by the share, and writing that over a box was the fault: pressing inside a big module
        // changed the module's own box — criterion D12.
        //
        // A BOX THE READER IS DRAGGING TAKES THE SIZE THEY ASKED FOR AT ONCE — CRITERION D42.
        // Its width used to come only from ELK, so the frame did not move until a whole layout of
        // the 3578-pixel box had come back. That is why resizing was jerky and in steps: measured
        // at 1440 before this line, the box's width wobbled by up to 4.8 pixels a step and then
        // collapsed by 214. The frame is set here, on the pointer; ELK is asked at most ten times a
        // second by the layout effect below, and it only moves the steps INSIDE the box.
        const box = node.type === 'group'
        return {
          ...node,
          data: { ...node.data, plan: want, choice: chose },
          style: {
            ...node.style,
            ...(box
              ? {
                  ...(want.width === null ? {} : { width: want.width }),
                  ...(want.height === null ? {} : { height: want.height }),
                }
              : want.room === null
                ? {}
                : { width: widthOf(node.data.node, want.room) }),
          },
        }
      })
      return changed ? next : current
    })
  }, [plan, chosenByNode])

  /**
   * THE READER HAS STOPPED WORKING ON ONE CARD, because the whole drawing has changed under them.
   *
   * `holdStill` says which card's own choice the last change was, and the layout effect skips laying
   * anything out while it is set — criterion D22. Everything in this list changes the drawing for a
   * reason that is NOT one card's choice: a different set of records, a different distance, a
   * different focus, and the two reads that put marks on cards. Each of those is a layout the
   * drawing owes, so each of them ends the claim.
   *
   * IT IS ONE PLACE AND NOT FIVE. The flag used to be cleared by the layout effect itself, on the
   * first run after it was set, which made it a race — see the effect below for what that cost.
   *
   * THE SELECTION IS READ AS A LIST OF NAMES AND NOT AS THE SET. `selected` is built from `nodes`,
   * so it is a NEW SET on every render — and a drag renders a hundred times. Depending on the set
   * itself made this effect run on every one of them, which cleared the flag it was meant to leave
   * alone and put the whole-drawing layout straight back.
   */
  const selectedNames = [...selected].sort().join(',')
  useEffect(() => {
    holdStill.current = null
    // AND THE BOX'S CLAIM GOES WITH IT — criterion D37. Each of these is a layout the drawing owes
    // in full, so a claim that only one box may move would leave the rest of it half applied.
    boxAlone.current = null
  }, [graph, says, selectedNames, presenceByNode, restrictionByNode])

  useEffect(() => {
    if (!initialised) return
    // ONE LAYOUT PER DRAWING, and the guard has to be given back if this run never finishes.
    // React runs every effect twice under StrictMode — mount, clean up, mount again — and the
    // first version of this kept the guard through the cleanup, so the second run saw the drawing
    // as already laid out, bailed, and left the canvas saying "measuring" for ever with twelve
    // cards stacked at the top left. A photograph found it. Clearing the guard when the run did not
    // settle is what makes a cancelled attempt cost nothing.
    if (doneFor.current === layoutKey) return
    doneFor.current = layoutKey
    let settled = false
    // ONLY WHEN THERE IS NOTHING ON SCREEN YET. A distance change re-lays out a drawing the reader
    // is already looking at, and swapping the canvas for the words "laying out" would make every
    // zoom press flash. The cards keep their places until the new ones arrive, exactly as they do
    // when the records behind a drawing change.
    if (drawnKey !== key) setState({ at: 'laying-out' })
    // TWO FRAMES BEFORE THE SIZES ARE READ, and this is not caution either.
    //
    // A DISTANCE CHANGE CHANGES WHAT EVERY CARD SAYS, so every card is a different height, and
    // React Flow learns the new heights through a ResizeObserver — which is to say, after this
    // effect has run. Reading them now hands ELK the heights of the cards that were on screen
    // before the reader zoomed, and the drawing is laid out for a picture nobody is looking at.
    // One frame lets the browser lay the new cards out; the second lets React Flow's observer put
    // the measurements in its store.
    /**
     * ONE CARD CHANGED, SO ONLY THAT CARD CHANGES — CRITERION D22.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT WAS WRONG, AND WHAT WAS MEASURED
     * ---------------------------------------------------------------------------------------
     *
     * Dragging a card's left edge made its right side grow and shrink, or the whole graph moved and
     * only made it look that way. When a block is enlarged, shrunk or moved, the other blocks must
     * not change, and only that block's lines are updated.
     *
     * Measured on the owner's own pipeline, on an isolated copy of their database: dragging the
     * ZED 2i card's LEFT edge 140 pixels to the left moved SIXTEEN of the eighteen cards on the
     * drawing, each by about 140 across and 76 down. The window did not move at all; what moved was
     * every other card. A wider card is a different box, so the old code asked ELK for a whole new
     * arrangement of the drawing and applied it.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT HAPPENS INSTEAD
     * ---------------------------------------------------------------------------------------
     *
     * When the thing that changed is one card's own choice — its room, its height, its detail tick,
     * its level — nothing is laid out. Every card keeps the place and the size it has, the dragged
     * card is drawn at its new size where it already is, and the lines touching it are given back to
     * React Flow to draw from the handles, so they follow the card as it grows. Every other line
     * keeps the route ELK worked out.
     *
     * THE DRAWING CAN THEN OVERLAP ITSELF, and that is on purpose rather than an oversight: a card
     * dragged wide enough will reach its neighbour, and the neighbours are to hold still.
     */
    /**
     * THE FLAG IS NOT TAKEN AWAY BY A RUN THAT LAYS NOTHING OUT — CRITERION D22, MEASURED AGAIN.
     *
     * It was read and cleared here, once, and that made it a race. One drag sends a hundred presses;
     * two of them landing in one of React's batches produce two layout keys and therefore two runs
     * of this effect, and the second one found the flag already spent. It then laid the whole
     * drawing out.
     *
     * Measured on one of the owner's own pipelines at 1440 on 6 September 2026: dragging a card's
     * LEFT edge 140 pixels moved FIFTEEN of the other seventeen cards, each by 133 across and 89
     * down, with the window standing still. That is the fault D22 was written about, coming back
     * through a different door.
     *
     * WHAT CLEARS IT INSTEAD is the effect above, on everything that changes the drawing for a
     * reason that is not one card's own choice: the records, the distance, the focus, and the two
     * reads. Those are the layouts the drawing owes; a card's own size is not one of them, because
     * D22 says so: when a block is enlarged, shrunk or moved, the other blocks must not change.
     */
    const oneCardChanged = holdStill.current
    if (oneCardChanged !== null && drawnKey === key) {
      const node = graph.nodes.find((one) => one.recordId === oneCardChanged)
      if (node !== undefined) {
        setRoutes((was) => {
          const touching = graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id)
          if (touching.length === 0) return was
          const next = new Map(was)
          for (const edge of touching) next.delete(edge.id)
          return next
        })
        // `drawnKey` IS NOT TOUCHED. It names the DRAWING whose positions are on screen, and they
        // still are: nothing moved. Writing the layout key into it made this effect run again with
        // `drawnKey !== key`, which is the branch that lays the whole drawing out — so the first
        // version of this looked exactly like the fault it was fixing.
        settled = true
        return
      }
    }
    // A REAL LAYOUT IS ABOUT TO RUN, so whatever one card was claiming is over.
    holdStill.current = null
    let frame = 0
    let cancelled = false
    const readAndLayOut = (): void => {
    const sizes = new Map<string, Size>()
    for (const [id, node] of store.getState().nodeLookup) {
      const width = node.measured?.width
      const height = node.measured?.height
      if (width === undefined || height === undefined) continue
      sizes.set(id, { width, height })
    }
    /**
     * A PIPELINE BOX'S SIZE IS WHAT THE READER ASKED FOR, NOT WHAT IT IS DRAWN AT — CRITERION D35.
     *
     * `toElkGraph` hands a compound node's size to ELK as its MINIMUM, and ELK then makes the box at
     * least that big and lays its steps out inside it. That is exactly what D35 asks for: a change of
     * size rearranges the blocks and lines it touches.
     *
     * IT MUST NOT BE THE MEASURED SIZE, and that is the whole reason this loop exists. The box is
     * drawn at the size ELK last gave it, and ELK gave it that size because of the minimum it was
     * handed — so feeding the drawn size back in as the minimum is a number growing out of itself.
     * Handing ELK the reader's ask, and zero where they have asked for nothing, is a minimum that
     * cannot compound.
     *
     * A BOX WITH NO STEPS INSIDE IT IS NOT A COMPOUND NODE and keeps its measured size: a folded
     * pipeline has no children at all, so its size is its own and not a floor under anything.
     */
    const hasSteps = new Set(graph.nodes.map((node) => node.parentId).filter((id): id is string => id !== null))
    for (const node of graph.nodes) {
      if (!hasSteps.has(node.id)) continue
      const asked = chosenRef.current.get(node.recordId) ?? NOTHING_PRESSED
      sizes.set(node.id, { width: asked.width ?? 0, height: asked.height ?? 0 })
    }
    /**
     * The measured size of the words on each line.
     *
     * Read from the hidden rack rather than from the drawn labels, and that is on purpose: the drawn
     * label belongs to an edge React Flow may not have rendered yet on the pass before the layout,
     * and a label that is measured on some runs and not on others is a drawing that changes shape
     * for no reason a reader can see. The rack holds one span per line, always, with the same
     * markup and the same class as the real thing.
     */
    const labelSizes = new Map<string, Size>()
    for (const element of rackRef.current?.querySelectorAll('[data-gx-label]') ?? []) {
      const id = element.getAttribute('data-gx-label')
      if (id === null) continue
      const box = element.getBoundingClientRect()
      if (box.width > 0 && box.height > 0) labelSizes.set(id, { width: Math.ceil(box.width), height: Math.ceil(box.height) })
    }

    // HOW TALL EACH PIPELINE BOX'S HEAD IS DRAWN, measured off the head itself in this same pass.
    // The steps inside a box start below its head, and a head holds a name, the record's own line,
    // its parts, and — on the box the reader pressed — its own controls. `offsetHeight` is layout
    // pixels and is not scaled by the canvas transform, which `getBoundingClientRect` would be.
    layoutGraph(graph, sizes, undefined, labelSizes, headRoom(graph))
      .then((result) => {
        settled = true
        if (cancelled) return
        /**
         * ONE BOX GREW, SO ONE BOX AND ITS STEPS ARE ALL THAT MOVES — CRITERION D37.
         *
         * ---------------------------------------------------------------------------------------
         * WHAT WENT WRONG, AND WHAT WAS MEASURED
         * ---------------------------------------------------------------------------------------
         *
         * Pressing enlarge on the big block
         * made the ZED 2i card disappear along with it.
         *
         * A box HAS to be laid out when it grows, because its steps are drawn inside it, and until
         * this the only layout there was laid out the whole drawing. ELK's answer is a whole new
         * arrangement: every module card beside the box is placed again, at a place worked out for
         * a box that is now a different size. That is the same thing D22 forbids for a card: when
         * a block is enlarged, shrunk or moved, the other blocks must not change, and only that
         * block's lines are updated.
         *
         * So the layout runs, and only this box's own size and the places of the steps inside it are
         * taken from it. Every other card keeps the place and the size it already has, and the box
         * grows from the corner it is already at rather than being placed again.
         */
        const grewBox = boxAlone.current
        boxAlone.current = null
        const theBox =
          grewBox === null
            ? null
            : (graph.nodes.find((one) => one.recordId === grewBox && one.kind === 'pipeline')?.id ?? null)
        const insideTheBox = new Set(
          theBox === null ? [] : graph.nodes.filter((one) => one.parentId === theBox).map((one) => one.id),
        )
        /** True where this layout's answer for a node is the one to draw. A box's own change moves
         *  only the steps inside that box; every other layout moves everything. */
        const takesItsPlace = (id: string): boolean => theBox === null || insideTheBox.has(id)
        // HOW FAR THE CARD THE READER IS WORKING ON IS ABOUT TO MOVE, worked out before the new
        // places are applied, so the window can be moved by exactly that and leave the card still.
        const holding = holdStill.current
        const heldNode = holding === null ? null : graph.nodes.find((one) => one.recordId === holding)
        const before = new Map(
          nodesRef.current.map((one) => [one.id, { x: one.position.x, y: one.position.y, parentId: one.parentId ?? null }]),
        )
        const after = new Map(
          nodesRef.current.map((one) => {
            const at = takesItsPlace(one.id) ? result.placements.get(one.id) : undefined
            /**
             * WHERE SOMEBODY PUT IT WINS HERE TOO, and reading it in only one of the two places is
             * a bug this pass measured — CRITERION D29.
             *
             * `setNodes` a few lines below writes `put ?? at`: a card somebody placed is drawn where
             * they placed it and every other card where ELK put it. This map is what the window is
             * then moved by, and it read ELK's answer for every card — so for a card that HAS been
             * placed the window was moved by the distance between where the card really is and where
             * ELK would have put it, and the card came out standing still on the screen.
             *
             * Measured on one of the owner's own pipelines at 1440: a card's top-left corner
             * dragged 120 left and 120 up moved the card's left edge by 0 and its right edge by
             * +121 — the drag worked and the window undid it. The two readings are one reading now.
             */
            const put = one.data.node.presentation.placedAt ?? putHere.current.get(one.id) ?? null
            return [
              one.id,
              {
                x: put?.x ?? at?.x ?? one.position.x,
                y: put?.y ?? at?.y ?? one.position.y,
                parentId: one.parentId ?? null,
              },
            ] as const
          }),
        )
        const wasAt = heldNode === undefined || heldNode === null ? null : placeOnTheDrawing(heldNode.id, before)
        const goesTo = heldNode === undefined || heldNode === null ? null : placeOnTheDrawing(heldNode.id, after)
        setNodes((current) =>
          current.map((node) => {
            const at = result.placements.get(node.id)
            if (at === undefined) return node
            // A CARD OUTSIDE THE BOX THAT GREW IS NOT TOUCHED AT ALL — criterion D37.
            if (theBox !== null && node.id !== theBox && !insideTheBox.has(node.id)) return node
            // WHERE SOMEBODY PUT IT WINS OVER WHERE THE LAYOUT WOULD HAVE PUT IT — criterion D19.
            // Every other card is placed by ELK exactly as before, and this one is where a finger
            // left it.
            const put = node.data.node.presentation.placedAt ?? putHere.current.get(node.id) ?? null
            return {
              ...node,
              // THE BOX THAT GREW GROWS FROM THE CORNER IT IS AT — criterion D37. Its steps take
              // ELK's places, which are relative to it, so they are laid out inside it again.
              position: node.id === theBox ? node.position : (put ?? { x: at.x, y: at.y }),
              // The pipeline box is sized by what ELK fitted inside it. Everything else keeps the
              // width it was measured at, so the card that was measured is the card that is drawn.
              // Every card is opaque again here: whatever was waiting for a place now has one.
              style:
                node.type === 'group'
                  ? { width: at.width, height: at.height }
                  : { ...node.style, opacity: undefined },
            }
          }),
        )
        /**
         * THE LINES AFTER ONE BOX GREW — CRITERION D37.
         *
         * A route is ELK's own geometry in the drawing's absolute pixels. When the whole drawing is
         * laid out, every route in the answer is right. When only one box changed:
         *
         *   a line between two steps of that box is inside it, so ELK's new route is right once it
         *     is moved back by however far ELK would have moved the box, which is what `movedBy`
         *     below does;
         *   a line with one end outside the box has one end ELK moved and one end that did not
         *     move, so no route in the answer describes it — it is given back to React Flow, which
         *     draws it from the handles, exactly as a card's own resize already does;
         *   every other line is untouched and keeps the route it has.
         */
        const nextRoutes =
          theBox === null
            ? result.routes
            : (() => {
                const elkAt = result.placements.get(theBox)
                const drawnAt = nodesRef.current.find((one) => one.id === theBox)?.position ?? null
                const dx = elkAt === undefined || drawnAt === null ? 0 : drawnAt.x - elkAt.x
                const dy = elkAt === undefined || drawnAt === null ? 0 : drawnAt.y - elkAt.y
                const next = new Map(routesRef.current)
                for (const edge of graph.edges) {
                  const bothInside = insideTheBox.has(edge.from) && insideTheBox.has(edge.to)
                  const touches =
                    insideTheBox.has(edge.from) ||
                    insideTheBox.has(edge.to) ||
                    edge.from === theBox ||
                    edge.to === theBox
                  if (!touches) continue
                  const route = bothInside ? result.routes.get(edge.id) : undefined
                  if (route === undefined) next.delete(edge.id)
                  else next.set(edge.id, movedBy(route, dx, dy))
                }
                return next
              })()
        setRoutes(nextRoutes)
        setReport(result.report)
        setDrawnKey(key)
        /**
         * WHERE EVERYTHING REALLY IS, INCLUDING WHAT THE READER MOVED — CRITERION D35.
         *
         * `result.placements` is where ELK put things, and a card somebody moved is not there. The
         * two buttons over the drawing are worked out from this, so `Fit all` on a drawing whose box
         * had been dragged away opened a window with the box outside it — the box was on the
         * drawing, at a real place, and there was no way to get to it. That is most of what "it
         * disappeared" means.
         *
         * `after` already holds `put ?? at` for every node, worked out a few lines above for moving
         * the window. This is that same answer, given to the two buttons as well, so one reading of
         * where a card is serves both.
         */
        const reallyAt = new Map(
          [...result.placements].map(([id, at]) => {
            const put = after.get(id)
            return [id, put === undefined ? at : { ...at, x: put.x, y: put.y }] as const
          }),
        )
        // THE LINES AS THEY ARE DRAWN, and not as ELK worked them out. After a box's own change the
        // two are different — see `nextRoutes` above — and `Fit all` is worked out from this, so
        // reading ELK's answer here would open a window round lines nobody is looking at.
        const drawing = drawingSize(graph.nodes, reallyAt, nextRoutes)
        const focus = drawingFocus(graph, reallyAt, nextRoutes)
        const height = boxHeightFor(drawing, boxWidth)
        setBoxHeight(height)
        const box = { width: boxWidth, height: height ?? 0 }
        laidOut.current = { placements: reallyAt, routes: nextRoutes, width: box.width, height: box.height }
        const answers = windowAnswers(drawing, focus, box.width, box.height, graph.scope.at === 'pipeline')
        const readingAt = answers.readingAt
        setState({ at: 'drawn', ...answers })
        // One frame later, so the positions AND the new box height are in the DOM before the view is
        // set from them. Setting it first would use the old box and open somewhere else.
        if (viewedFor.current !== key) {
          viewedFor.current = key
          window.requestAnimationFrame(() => {
            void setViewport(readingAt, { duration: 0 })
          })
          return
        }
        // THE CARD THE READER IS DRAGGING STAYS WHERE IT IS. The new layout moves it; the window
        // moves the other way by the same amount, so that one card does not move on the screen and
        // every other card rearranges around it. Criterion D13.
        if (wasAt === null || goesTo === null) return
        const at = store.getState().transform
        const zoomNow = at[2]
        const dx = (wasAt.x - goesTo.x) * zoomNow
        const dy = (wasAt.y - goesTo.y) * zoomNow
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
        void setViewport({ x: at[0] + dx, y: at[1] + dy, zoom: zoomNow }, { duration: 0 })
      })
      .catch((err: unknown) => {
        settled = true
        if (cancelled) return
        // Never a half-drawn canvas and never a silent one. What failed is printed where the
        // drawing would have been, and the outline below still holds every fact.
        setState({ at: 'failed', message: err instanceof Error ? err.message : String(err) })
      })
    }
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(readAndLayOut)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      if (!settled) doneFor.current = null
    }
    // `boxRuns` IS READ FOR ITS VALUE CHANGING AND NOT FOR ITS VALUE — criterion D42. It counts the
    // bookings a box drag has made, and it is what asks for the layout the booking is for.
  }, [initialised, key, layoutKey, drawnKey, graph, store, setViewport, boxWidth, boxRuns])


  /**
   * The two views a reader can ask for by name. Neither is a state the page lands in by itself.
   *
   * THE MEASUREMENTS COME OUT OF THE STATE, not out of a ref. They were in a ref, and the effect that
   * starts a fresh measurement when the drawing changes cleared it — so pressing `Fit all` after a
   * redraw did nothing at all, silently, which a photograph found. A value the buttons need is a
   * value the render needs, and the render already carries it.
   *
   * EACH IS NOW THE WINDOW ITSELF rather than the arithmetic for one. The layout worked it out; the
   * button sets it; the check compares the reader's window with it. One answer, three readers.
   */
  const drawn = state.at === 'drawn' ? state : null
  /**
   * THE DRAWING ON THE WHOLE SCREEN, AND BACK — CRITERION D17.
   *
   * The drawing had no way to fill the
   * screen, and it should have one. This is the browser's own fullscreen, on the element the whole
   * drawing is inside, so what fills the screen is the drawing and its controls and nothing else.
   *
   * THE TRUTH IS THE BROWSER'S AND NOT A FLAG OF OURS. `document.fullscreenElement` is what says
   * whether this drawing is on the whole screen, and the state below follows the browser's own
   * event. A boolean set on a press would be two answers to one question the first time somebody
   * left fullscreen another way.
   *
   * ESCAPE RETURNS, AND WE LISTEN FOR IT OURSELVES. Every browser a person uses leaves fullscreen
   * on Escape by itself; a headless one does not, and the criterion names Escape. Asking for the
   * exit when it has already happened is what the `fullscreenElement` check below avoids.
   */
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [onTheWholeScreen, setOnTheWholeScreen] = useState(false)
  const [couldNotFill, setCouldNotFill] = useState<string | null>(null)
  useEffect(() => {
    const read = (): void => setOnTheWholeScreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', read)
    read()
    return () => document.removeEventListener('fullscreenchange', read)
  }, [])
  useEffect(() => {
    if (!onTheWholeScreen) return
    const leave = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (document.fullscreenElement === null) return
      void document.exitFullscreen().catch(() => {
        // The browser has already left, which is the state this press was for. Nothing to report.
      })
    }
    document.addEventListener('keydown', leave)
    return () => document.removeEventListener('keydown', leave)
  }, [onTheWholeScreen])
  const fillTheScreen = useCallback(() => {
    setCouldNotFill(null)
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch((err: unknown) => {
        setCouldNotFill(t('g7b.Canvas.this_browser_would_not_leave_the_whole', { v1: err instanceof Error ? err.message : String(err) }))
      })
      return
    }
    const wrap = wrapRef.current
    if (wrap === null) {
      setCouldNotFill(t('g7b.Canvas.the_drawing_is_not_on_the_page'))
      return
    }
    // NOT SWALLOWED. A browser can refuse fullscreen — a permission policy, an embedded frame — and
    // a control that asked and said nothing is the defect this whole cluster is about.
    void wrap.requestFullscreen().catch((err: unknown) => {
      setCouldNotFill(
        t('g7b.Canvas.this_browser_would_not_put_the_drawing', { v1: err instanceof Error ? err.message : String(err) }),
      )
    })
  }, [])
  /**
   * WHERE A FINGER PUT ONE CARD, AND WHERE THAT IS WRITTEN — CRITERION D19.
   *
   * `moveTo` draws the card under the finger and writes nothing; `putDown` writes what it ended up
   * at into the drawing's stored arrangement, which is where every other thing somebody arranged
   * about this drawing already lives. The stored intent for that node is read back first and the
   * place is added to it, because the write door takes a whole node's intent at once and a lane
   * somebody set is not this drag's to throw away.
   */
  const [couldNotPlace, setCouldNotPlace] = useState<string | null>(null)
  /**
   * WHERE THE READER HAS PUT A CARD IN THIS VISIT, until the stored arrangement says the same —
   * CRITERION D29.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT EXISTS, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * A layout puts every card where ELK says, except one somebody has placed, which goes to its
   * stored place. Between a drag and that store answering there is a gap, and a layout landing in
   * the gap put the card back.
   *
   * Measured on one of the owner's own pipelines at 1440 on 6 September 2026, dragging a card's
   * LEFT edge 140 pixels to the left in six steps: the card's own transform went 468, 439, 413, 385,
   * 359 — the edge following the pointer — and then jumped back to 468 on the fifth step and started
   * again. The jump is a layout that ran while the pointer was still down.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS NOT A SECOND OPINION ABOUT WHERE A CARD IS
   * ---------------------------------------------------------------------------------------
   *
   * One expression reads all three, in one order, in the two places a layout decides a position:
   * the stored arrangement first, then this, then ELK. So this can only answer for a card the store
   * has not answered for yet, and a card whose place FAILED to store is taken out of here — which is
   * what makes the sentence under the drawing true when it says the card will go back.
   */
  const putHere = useRef(new Map<string, { x: number; y: number }>())
  const moveTo = useCallback((nodeId: string, at: { x: number; y: number }) => {
    putHere.current.set(nodeId, at)
    setNodes((current) => current.map((one) => (one.id === nodeId ? { ...one, position: at } : one)))
    // THE SAME ID IN STATE, so the lines are built again — criteria D32 and D34. The set is
    // returned unchanged when this card is already in it, so one drag of a hundred moves is one
    // state change and not a hundred.
    setMovedHere((was) => (was.has(nodeId) ? was : new Set(was).add(nodeId)))
  }, [])
  const putDown = useCallback(
    (nodeId: string) => {
      const node = graph.nodes.find((one) => one.id === nodeId)
      const at = nodesRef.current.find((one) => one.id === nodeId)?.position
      if (node === undefined || at === undefined) return
      /**
       * THE WINDOW ANSWERS FOLLOW THE CARD THAT WAS PUT DOWN — problem NnAR6QkKt71N.
       *
       * Before this, only a layout worked these out, and a put-down runs no layout: after a box was
       * moved out of the window, `Fit all` still said the window showed the whole drawing.
       *
       * The same arithmetic the layout does (`windowAnswers`), on the same answer the layout worked
       * from, with every node where it is drawn now. The lines are the ones that layout counted. So
       * the drawing is the one the page works out when it is opened again with the card where it is
       * now: measured on 15 October, 1724.6 by 411.7 here and 1725 by 412 after a reload, the
       * difference being the stored place's rounding. The window is not the same. A put-down changes
       * no box, so these answers are for the window on screen, 300 high; a reload sizes the box to
       * the drawing again, 468 high, and its figures and its `Fit all` are for that taller window.
       */
      const last = laidOut.current
      if (last !== null) {
        const now = new Map(last.placements)
        for (const one of nodesRef.current) {
          const was = now.get(one.id)
          if (was !== undefined) now.set(one.id, { ...was, x: one.position.x, y: one.position.y })
        }
        const answers = windowAnswers(
          drawingSize(graph.nodes, now, last.routes),
          drawingFocus(graph, now, last.routes),
          last.width,
          last.height,
          graph.scope.at === 'pipeline',
        )
        setState((was) => (was.at === 'drawn' ? { at: 'drawn', ...answers } : was))
      }
      const scope = intentScopeKey(graph.scope)
      const target = intentTargetOf(node)
      setCouldNotPlace(null)
      void presentation
        .read(scope)
        .then((stored) =>
          presentation.putNode(scope, target, {
            ...(stored.intent.nodes?.[target] ?? {}),
            x: Math.round(at.x),
            y: Math.round(at.y),
          }),
        )
        .catch((err: unknown) => {
          // NOT SWALLOWED. The card is under the reader's finger where they put it and the drawing
          // has not kept it; saying nothing would be the card moving back on the next draw with no
          // explanation at all. It IS put back, by this line, so the sentence below is true.
          putHere.current.delete(nodeId)
          setCouldNotPlace(
            t('g7b.Canvas.where_you_put_was_not_stored_so', { v1: node.title }) +
              `${err instanceof Error ? err.message : String(err)}`,
          )
        })
    },
    [graph],
  )
  const freeDrag = useMemo<AFreeDrag>(
    () => ({
      placeOf: (nodeId) => nodesRef.current.find((one) => one.id === nodeId)?.position ?? null,
      moveTo,
      putDown,
      zoom,
      theView: () => {
        const at = store.getState().transform
        return { x: at[0], y: at[1], zoom: at[2] }
      },
      holdTheView: (at) => {
        const now = store.getState().transform
        if (Math.abs(now[0] - at.x) < 0.5 && Math.abs(now[1] - at.y) < 0.5 && sameZoom(now[2], at.zoom)) return
        void setViewport(at, { duration: 0 })
      },
    }),
    [moveTo, putDown, zoom, store, setViewport],
  )
  /**
   * WHAT THIS READER HAS ARRANGED ON THIS DRAWING: how many cards they have moved, and how many they
   * have resized — CRITERION D36.
   *
   * The two live in different places and both have to be counted, because the button says what it
   * will forget before it does it. A place is stored on the server and comes back on the node; a
   * size is in this browser's own storage and comes back in `chosen`.
   */
  const arranged = useMemo(() => {
    const placed = new Set<string>(movedHere)
    for (const node of graph.nodes) if (node.presentation.placedAt !== null) placed.add(node.id)
    let sized = 0
    for (const one of chosen.values()) {
      if (one.room !== null || one.height !== null || one.width !== null || one.level !== null || one.detail) sized += 1
    }
    return { places: placed.size, sizes: sized }
  }, [graph, movedHere, chosen])
  /**
   * PUT THE DRAWING BACK THE WAY IT STARTED — CRITERION D36.
   *
   * There was no reset button that puts the drawing back to how it started in one press.
   *
   * TWO STORES AND ONE PRESS. The places a reader gives cards are on the server, and one request
   * forgets the lot of them in one change row — `clearScope` in server/lib/presentation.ts, which is
   * where the criterion's "one change row per drawing" lives. The sizes are in this browser's own
   * storage, one key per card, and `forgetEverySizeHere` takes them.
   *
   * THE PLACES MADE IN THIS VISIT GO TOO. `putHere` is what a card is drawn at until the store
   * answers, so a reset that left it alone would put every card back and then draw them where they
   * were. `movedHere` beside it is what the lines read.
   */
  const putItBack = useCallback(async () => {
    const scope = intentScopeKey(graph.scope)
    const before = (await presentation.read(scope)).intent
    const sizes = savedCardsHere(drawing)
    const placed = new Map(putHere.current)
    const moved = new Set(movedHere)
    await presentation.clearScope(scope)
    putHere.current.clear()
    setMovedHere(new Set())
    forgetEverySizeHere(drawing)
    onIntentChanged()
    return { remainingMs: DRAWING_UNDO_MS, undo: async () => {
      if (savedCardsHere(drawing).size > 0 || putHere.current.size > 0) throw new Error(t('g7b.undoChanged'))
      await putTheArrangementBack(scope, before)
      restoreCardsHere(sizes)
      putHere.current = new Map(placed)
      setMovedHere(new Set(moved))
      onIntentChanged()
    } }
  }, [drawing, graph, movedHere, onIntentChanged])
  const readingSize = useCallback(() => {
    if (drawn === null) return
    void setViewport(drawn.readingAt, { duration: 220 })
  }, [drawn, setViewport])
  const fitAll = useCallback(() => {
    if (drawn === null) return
    void setViewport(drawn.fitAt, { duration: 220 })
  }, [drawn, setViewport])

  const percent = Math.round(zoom * 100)
  const unhonoured = report.unhonoured
  const honoured = report.honoured

  /**
   * WHAT THIS DRAWING COULD NOT SHOW, IN WORDS, FOR THE PAGE'S BODY (wave 13u round 217).
   *
   * A strip under the drawing used to say these, beside how much of the drawing was in the window and what the cards
   * left off, with a fold explaining the numbers. It went: what matters is said once, in the body of the page, and only
   * when it is true. These are the facts no card can carry as a shape:
   *   - Fit all cannot reach the whole drawing;
   *   - the restriction read is still under way, or it failed, or this position draws no restriction mark on cards
   *     something restricts, or a check of the restriction read could not run. The last is true on every drawing
   *     today: nobody walks the code dependencies between records yet, and a drawing with no restriction mark must not
   *     read as one nothing restricts;
   *   - whether anybody looked at who is working: the read still under way, the read failed, nobody on any card, or how
   *     many of the cards with a work domain are marked, the rest having had no sign of work for over a day (the
   *     owner's section 15: the fact would vanish if nothing said it).
   * The counts of the window and of what the cards leave off are not said: the drawing shows the first, and each card
   * says the second at a closer distance.
   */
  const facts = useMemo(() => {
    const out: string[] = []
    if (state.at === 'drawn' && !state.fits.whole) {
      out.push(
        (`${t('g7b.Canvas.fit_all')}${t('g7b.Canvas.cannot_show_the_whole_shape_here_it')} ${String(Math.round(state.fits.zoom * 100))}%` +
          `${t('g7b.Canvas.and_even_there_only')} ${String(Math.round(state.fits.shows * 100))}%${t('g7b.Canvas.of_the_drawing_is_in_the_window')}`).trimEnd(),
      )
    }
    // WHETHER ANYBODY HAS LOOKED AT WHAT RESTRICTS THESE RECORDS, while that read runs and only once the drawing is
    // drawn, as the strip said it. A card draws no restriction mark until the read is back, so without these words a
    // drawing still reading would look like one that nothing restricts (round 217).
    if (state.at === 'drawn' && restrictions.at === 'reading') {
      out.push(restrictionsReadingWords())
    }
    if (restrictions.at === 'failed') {
      out.push(restrictionsFailedWords(restrictions.problem))
    }
    if (restrictions.at === 'read' && restrictionsHere > 0 && !restrictionMarkDrawnAt(says)) {
      out.push(
        `${String(restrictionsHere)}${t('g7b.Canvas.restricted')} ${restrictionsHere === 1 ? t('g7b.Canvas.card') : t('g7b.Canvas.cards')}` +
          t('g7b.Canvas.marked_from_the_second_position_on'),
      )
    }
    if (restrictions.at === 'read' && restrictions.couldNotCheck.length > 0) {
      out.push(checksThatCouldNotRunWords(restrictions.couldNotCheck))
    }
    // WHETHER ANYBODY LOOKED AT WHO IS WORKING, in the four cases the strip said it and only once the drawing is drawn,
    // as the strip was. A card draws no presence while the read is under way, when it failed and when nobody is on it,
    // so without these words an unread drawing reads as an empty one: tests/graph-presence-in-the-browser.test.ts found
    // the body saying only the failures (round 217). Nobody on any card is said only when a work domain was read, where
    // the strip drew its dash.
    if (state.at === 'drawn') {
      if (presence.at === 'reading') {
        out.push(presenceReadingWords())
      } else if (presence.at === 'failed') {
        out.push(presenceFailedWords(presence.problem))
      } else if (presenceHere.on === 0) {
        if (presence.domainsRead > 0) out.push(`${String(presenceHere.on)} ${t('g7b.Canvas.cards')}${t('g7b.Canvas.somebody_is_on')}`)
      } else {
        out.push(
          `${String(presenceHere.drawn)}${t('g7b.Canvas.of')} ${String(presenceHere.on)} ${presenceHere.on === 1 ? t('g7b.Canvas.card') : t('g7b.Canvas.cards')}` +
            `${t('g7b.Canvas.somebody_is_on')} ${presenceHere.drawn === presenceHere.on ? t('g7b.Canvas.are_marked') : t('g7b.Canvas.are_marked_the_rest_have_had_no')}`,
        )
      }
    }
    return out
  }, [state, restrictions, restrictionsHere, says, presence, presenceHere])
  // Keyed on the words, so a new list with the same facts is not handed up again.
  const factsKey = facts.join('\n')
  useEffect(() => {
    onSays?.(facts)
    return () => onSays?.([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsKey, onSays])

  return (
    <div
      className="gx-canvas-wrap"
      ref={wrapRef}
      data-state={state.at}
      data-shows={drawnKey === key ? '1' : '0'}
      // WHICH DRAWING THIS IS, WRITTEN ONCE, on the element every card on it is inside. A comment
      // right-clicked onto a card reads it on the same walk up that reads what the card is: the
      // same module is on the module drawing and inside a pipeline's, and without this the two
      // comments read identically. The owner's anchor rule asks for the ancestor chain and this is it.
      {...theDrawingIs(graph.scope.at, graph.scope.at === 'pipeline' ? graph.scope.recordId : null)}
    >
      <style>{CANVAS_CSS}</style>
      {/* THE TWO CONTROLS OVER THIS DRAWING, SIDE BY SIDE AND EACH WITH ITS NAME ON SCREEN.
          They are two different things and the owner could not tell that they were: the owner reported
          that the drawing was calm, that the zoom stayed at the least detail, and that they could not
          find any way to make it say more. Both halves of that are answered here. How much each
          card says has a name, three steps and its current step marked. How big the drawing is
          drawn sits beside it under its own name, so a reader can see that one is not the other.

          BOTH ARE ABOVE THE DRAWING RATHER THAN ON IT. The zoom row used to be an overlay pinned
          inside the drawing at the bottom left, which covered whatever card was there — measured on
          27 August at 1440 on the campaign pipeline, it sat on top of a step card, and a card under
          an overlay cannot be pressed or right-clicked. The detail row was worse: it was a plain
          child of the fixed-height, clipping box, drawn after a React Flow root that fills that box,
          so it began exactly at the bottom edge and was clipped away entirely. It has existed since
          round ten and has never been on screen. */}
      {/* EVERY CONTROL IN THIS ROW GOES THROUGH `DrawingControl`, AND THE ROW HOLDS THE ONE LINE
          THAT SAYS WHY A PRESS DID NOTHING. Both groups below clip what overflows them, so a
          refusal drawn inside one would be cut away — which is how the detail control itself spent
          from round ten to 27 August 2026 with not a pixel on screen. See controls.tsx. */}
      <div className="gx-controls">
        <DrawingControls>
        {/* THE `Detail` CONTROL THAT WAS HERE IS GONE — CRITERION D14.
            Two faults in one control: pressing it changed every
            card's size at once, which asked for a new layout and made the picture jump, and it wore
            the same word as the tick on a card, which is a different thing at a different scope.
            Where the cards now start is the drawing's own configuration, DRAWING_PLACES in model.ts,
            and a person who wants every card longer still has the row on the settings page. */}
        <div className="gx-control">
          <span className="gx-control-name" id={`${ids}-size`}>
            {DRAWING_WORDS.zoom}
          </span>
          {/* THE WINDOW THESE FOUR MOVE, AND WHEN EACH OF THEM CANNOT MOVE IT. `Reading size` and
              `Fit all` each open one window, so each refuses when the reader is looking through it
              already; the two arrows refuse at the ends of the zoom. Until the drawing has been laid
              out there is no window to open at all, which is a missing prerequisite rather than a
              state already reached, and it is said in those words instead of being greyed out. */}
          <div className="gx-canvas-bar" role="group" aria-labelledby={`${ids}-size`}>
            <DrawingControl
              look="plain"
              now={viewport}
              after={drawn === null ? viewport : drawn.readingAt}
              same={sameViewport}
              reason={t('g7b.Canvas.already_at_the_reading_size_this_is')}
              {...(drawn === null ? { unavailable: NOT_LAID_OUT_YET() } : {})}
              onPress={readingSize}
              title={t('g7b.Canvas.open_it_again_at_the_size_a')}
            >{t('g7b.Canvas.reading_size')}</DrawingControl>
            <DrawingControl
              look="plain"
              now={viewport}
              after={drawn === null ? viewport : drawn.fitAt}
              same={sameViewport}
              reason={t('g7b.Canvas.already_showing_the_whole_drawing_this_is')}
              {...(drawn === null ? { unavailable: NOT_LAID_OUT_YET() } : {})}
              onPress={fitAll}
              title={t('g7b.Canvas.show_the_whole_drawing_at_once_however')}
            >{t('g7b.Canvas.fit_all')}</DrawingControl>
            {/* THE WHOLE SCREEN, AND BACK — CRITERION D17. It is in this group because it is about
                the window onto the drawing, which is what this group is. A toggle, so it is never
                in the state its press would set and never says nothing. */}
            <DrawingControl
              look="plain"
              now={onTheWholeScreen}
              after={!onTheWholeScreen}
              className="gx-canvas-full"
              onPress={fillTheScreen}
              title={
                onTheWholeScreen
                  ? t('g7b.Canvas.put_the_drawing_back_on_the_page')
                  : t('g7b.Canvas.put_the_drawing_on_the_whole_screen')
              }
            >
              {onTheWholeScreen ? t('g7b.Canvas.leave_the_whole_screen') : t('g7b.Canvas.whole_screen')}
            </DrawingControl>
            {/* PUT THE DRAWING BACK THE WAY IT STARTED — CRITERION D36.
                There was no reset button that puts the drawing back to how it started in one press.

                IT SAYS WHAT IT WILL FORGET BEFORE IT DOES IT, in one line and in numbers, because
                what it forgets is somebody's own arranging and there is no undo behind it. Where
                there is nothing to forget it says so instead of being greyed out, which is what
                every other control in this row does. It is in this group because it is about the
                whole drawing, which is what this group is. */}
            <DrawingUndoPress press={t('g7b.press.reset')} done={t('g7b.press.resetDone')} available
              now={arranged.places + arranged.sizes} after={0} onPress={putItBack}
              title={t('g7b.press.resetTitle', { places: t('g7b.places', { n: arranged.places }), sizes: t('g7b.sizes', { n: arranged.sizes }) })}
              disabledReason={t('g7b.press.resetAlready')} />
            <DrawingControl
              look="plain"
              now={zoom}
              after={MIN_ZOOM}
              same={sameZoom}
              reason={t('g7b.Canvas.already_at_the_smallest_is_as_far', { v1: String(Math.round(MIN_ZOOM * 100)) })}
              label={t('g7b.Canvas.smaller')}
              onPress={() => void zoomOut({ duration: 160 })}
            >
              −
            </DrawingControl>
            <span className="gx-canvas-zoom num">{percent}%</span>
            <DrawingControl
              look="plain"
              now={zoom}
              after={MAX_ZOOM}
              same={sameZoom}
              reason={t('g7b.Canvas.already_at_the_largest_is_as_close', { v1: String(Math.round(MAX_ZOOM * 100)) })}
              label={t('g7b.Canvas.bigger')}
              onPress={() => void zoomIn({ duration: 160 })}
            >
              +
            </DrawingControl>
          </div>
        </div>
        {/* THE `Focus` CONTROL THAT WAS HERE IS GONE — CRITERION D15.
            It named the focused card and offered a `Clear` beside it. To a reader it meant nothing,
            and it only confused.
            Focus is a press on a card and it is shown on the card: the card is outlined, its own
            controls appear over it, and the lines it carries are drawn. A press on the background
            takes it off, which is what a person does anyway. */}
        {/* WHY THE WHOLE SCREEN DID NOT HAPPEN, in the browser's own words. A browser may refuse —
            a permission policy, an embedded frame — and a control that asked and said nothing is
            the defect this cluster is about. */}
        {couldNotFill === null ? null : (
          <p className="gx-refused" role="status">
            {couldNotFill}
          </p>
        )}
        </DrawingControls>
      </div>
      {/* THE CARDS' OWN CONTROLS SAY WHY A PRESS DID NOTHING UNDER THE DRAWING THEY ARE ON.
          `DrawingControls` is a ROW of controls and the one line under it; the cards are a second
          row of controls, on the drawing itself, so they get their own line rather than reporting
          into a row they are not in. The check that a press would change nothing is still the one
          in controls.tsx — this is where the answer is drawn, not a second copy of the rule. It is
          outside the canvas box, which clips what overflows it, for the reason the row above is:
          the detail control spent a whole round drawn inside that box and clipped away. */}
      {/* A COMMENT WHOSE CARD IS NOT ON THIS DRAWING ANY MORE, SAID IN ONE LINE.
          A record can leave a drawing — a link is deleted, a step is taken out of its pipeline —
          and a comment written on it still names it. Opening that comment lands here with nothing
          to focus. Saying nothing would be a press that did nothing, which is the defect this
          cluster is about, so the drawing says what happened and offers the record's own page. */}
      {notDrawn === null ? null : (
        <p className="gx-not-drawn" role="status" data-record={notDrawn}>
          {NOT_ON_THIS_DRAWING()}{' '}
          <button type="button" className="gx-not-drawn-open" onClick={() => open(notDrawn)}>{t('g7b.Canvas.open_the_record')}</button>
        </p>
      )}
      <DrawingControls>
      <FreeDrag.Provider value={freeDrag}>
      {/* ON THE WHOLE SCREEN THE BOX TAKES WHAT IS LEFT, so the height worked out for the page is
          left off rather than overridden. An inline height beaten by an important rule would be two
          answers to one question. */}
      <div
        className="gx-canvas"
        ref={boxRef}
        style={boxHeight === null || onTheWholeScreen ? undefined : { height: boxHeight }}
      >
        <ArrowHeads />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          // A PRESS ON A CARD SELECTS IT. A PRESS ON ITS NAME OPENS THE RECORD.
          //
          // This reverses what was here, and it had to. The whole card used to be one navigation
          // target — `onNodeClick` called `open`, so every press left the page. A card could
          // therefore never be selected, `elementsSelectable` was decorative, and the drawing had no
          // way to answer "which modules carry this step" except by drawing all ten `carries` lines
          // at once, all the time. That is the picture this pass is fixing.
          //
          // NOTHING BECAME UNREACHABLE BY IT. The card's title is a button, has always been one, and
          // says what it does in its own tooltip; the record is the same one press away it was. A
          // press on the empty canvas clears the selection, which is React Flow's own behaviour.
          onNodesChange={onNodesChange}
          // A SECOND PRESS TAKES THE FOCUS OFF. See `onNodeClick` above: problem `1GbOLOj_-qnn`.
          onNodeClick={onNodeClick}
          // Every one of these is off on purpose. A position that can be dragged is a position
          // somebody will want saved, and there is nowhere to save it: the picture is derived from
          // the records and rebuilt on every draw. See the header.
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          // NOT `fitView`. The drawing opens at reading size and the reader pans; fitting it is a
          // button with a word on it. This is the decision the header is about.
          fitView={false}
          defaultViewport={{ x: CANVAS_PAD, y: CANVAS_PAD, zoom: READING_ZOOM }}
          // The wheel belongs to the PAGE. A canvas in the middle of a long page that swallows the
          // wheel is a trap: the reader tries to scroll past it and zooms it instead.
          zoomOnScroll={false}
          panOnScroll={false}
          preventScrolling={false}
          zoomOnDoubleClick={false}
          panOnDrag
        >
          <Background gap={24} size={1} />
        </ReactFlow>
        {/* The words on every line, rendered where they cannot be seen so the browser can measure
            them in whatever script they are actually written in. Read once, before the layout.

            THE LINES DRAWN BY DEFAULT ONLY. A measurement is worth taking because ELK reserves room
            for the words it is given, and a line that is not on screen must not be given a column of
            the drawing to sit in. `toElkGraph` refuses the label for those lines as well, so this is
            not the only thing standing between them and the layout — it is just no use measuring
            what nothing will ask for. */}
        <div className="gx-measure-rack" ref={rackRef} aria-hidden="true">
          {graph.edges
            .filter((edge) => edge.drawn === 'always')
            .map((edge) => (
              <span
                className="gx-line-label gx-edge-label"
                key={edge.id}
                data-gx-label={edge.id}
                data-tone={toneOf(edge)}
              >
                {/* MEASURED AS IT WILL BE DRAWN. ELK reserves room for the words it is given, so the
                    rack renders the compact form every line gets by default. A line whose gate the
                    reader has asked about grows after the layout, which is a label moving rather
                    than a column of the drawing held empty. */}
                <LineWords edge={edge} words="label" onAsk={() => {}} />
              </span>
            ))}
        </div>
      </div>
      {/* WHERE A CARD SOMEBODY MOVED COULD NOT BE STORED, said rather than swallowed. */}
      {couldNotPlace === null ? null : (
        <p className="gx-refused" role="status">
          {couldNotPlace}
        </p>
      )}
      </FreeDrag.Provider>
      </DrawingControls>
      {/* OUTSIDE the fixed-height box on purpose. It used to be inside it, and the box clips what
          overflows, so the one line saying what the canvas was doing was never on screen at all —
          including the line that says the layout failed. A photograph found that too.

          ONCE DRAWN, IT SAYS NOTHING HERE (wave 13u round 217). It was one line of facts under every
          drawing, with a fold explaining the numbers: how much of the drawing was in the window, that
          Fit all could not reach the whole shape, the lines held back, what restricts the records, who
          is working on them, and what the cards left off. What matters of those is said once, in the
          page's body, and only when it is true: see `facts` above. This line now says only what the
          canvas is doing until it has drawn, and that the layout failed when it did. */}
      {state.at !== 'drawn' ? (
        <p className="gx-canvas-state" role="status">
          {state.at === 'measuring' ? (
            <>{t('g7b.Canvas.measuring_the_cards_so_the_layout_is')}<b className="num">{measured}</b>{t('g7b.Canvas.of')}{' '}
              <b className="num">{graph.nodes.length}</b>{t('g7b.Canvas.so_far')}{boxWidth > 0 ? null : <>{t('g7b.Canvas.and_waiting_for_the_window_to_have')}</>}.
            </>
          ) : state.at === 'laying-out' ? (
            <>{t('g7b.Canvas.working_out_where')}{graph.nodes.length}{t('g7b.Canvas.cards_go')}</>
          ) : (
            <b>{t('g7b.Canvas.the_layout_failed_so_nothing_is_drawn')}{state.message}</b>
          )}
        </p>
      ) : null}
      {/* WHAT THE LAYOUT DID WITH THE ARRANGEMENT IT WAS GIVEN. Printed rather than kept, because a
          stored hint that quietly did nothing is the failure this product bans, and the only way a
          reader can tell "my arrangement is being used" from "my arrangement went nowhere" is if the
          screen says which. Nothing is printed at all when nothing was arranged, which is the
          ordinary state and should stay it. */}
      {unhonoured.length === 0 && honoured.length === 0 ? null : (
        <div className="gx-report">
          {unhonoured.length === 0 ? (
            <p className="gx-report-ok">
              <b className="num">{honoured.length}</b>{t('g7b.Canvas.of_the_arrangement_stored_for_this_drawing')}</p>
          ) : (
            <>
              <p className="gx-report-bad">
                <b className="num">{unhonoured.length}</b>{t('g7b.Canvas.stored')}{' '}
                {unhonoured.length === 1 ? t('g7b.Canvas.hint_could_not_be_applied') : t('g7b.Canvas.hints_could_not_be_applied')}{t('g7b.Canvas.to_this_drawing_they_are_listed_here')}</p>
              <ul className="gx-report-list">
                {unhonoured.map((entry) => (
                  <li key={`${entry.target}:${entry.hint}`}>
                    {inspect ? <><b>{entry.hint}</b>{t('g7b.Canvas.on')}<code>{entry.target}</code> — {entry.because}</> : <>{graph.nodes.find((node) => node.recordId === entry.target)?.title ?? projection.omitted.find((node) => node.recordId === entry.target)?.title ?? t('g7b.arrangement')} — {t('g7b.arrangementNotApplied')}</>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {honoured.length === 0 ? null : (
            <details className="gx-report-more">
              <summary>{t('g7b.Canvas.what_the_arrangement_did_ask_for_and')}{' '}
                <b className="num">{honoured.length}</b>{t('g7b.Canvas.applied')}</summary>
              <ul className="gx-report-list">
                {honoured.map((line) => (
                  <li key={line}>{inspect ? line : t('g7b.arrangementApplied')}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

export default function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  )
}

export { recordPath }

// ============================================================================ the canvas's own CSS

/**
 * The rules for the pieces THIS file introduces, and nothing else.
 *
 * WHY IT IS HERE AND NOT IN THE STYLESHEET beside the rest of the graph's CSS. `StructureView.tsx`
 * holds the styles for the drawing and it is not this pass's file to edit. Everything below is
 * either a new class this file invents — the arrowheads, the measuring rack, the view bar, the
 * report — or a narrower selector for one this file now renders differently, and a narrower
 * selector wins without a fight. Nothing here overrides a rule it does not also explain.
 *
 * THE SHARED CARD'S OWN RULES LIVE WITH THE CARD, in CARD_CSS in CardFace.tsx (problem
 * Cr5JxwaYqink). They were here, so the plan drawing, which draws the same card and never loads
 * this stylesheet, drew some of the card's parts with the browser's defaults and restated others.
 *
 * It ships with this chunk, which is lazy, so it costs a page that never opens a canvas nothing.
 */
const CANVAS_CSS = `
.gx-canvas { position: relative; }
.gx-canvas .gx-defs { position: absolute; width: 0; height: 0; overflow: hidden; }

/* NOTHING IS SHOWN UNTIL THE POSITIONS ON IT WERE WORKED OUT FOR IT.
   Before a drawing has been laid out every card sits at the origin, and showing that is a heap in
   the corner rather than a picture; the line underneath says what is happening instead. Once a
   structure HAS been laid out it stays on screen while its own records are re-read, because a
   picture a second out of date is far better than a second of nothing. The data-shows attribute is
   that one comparison, and it is set by the canvas rather than inferred from the state word. */
.gx-not-drawn { margin: 0 0 8px; font-size: 0.86rem; color: var(--ink-2, inherit); }
.gx-not-drawn-open { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; }
.gx-canvas-wrap[data-shows='0'] .react-flow__viewport { visibility: hidden; }
.gx-canvas-wrap[data-shows='1'] .react-flow__viewport { visibility: visible; }

/* WHY EVERY LINE ON THIS CANVAS WAS INVISIBLE, and it was never the lines.
   The page reset in styles.css says "img, svg, video, canvas { max-width: 100% }", which is there to
   stop media widening its container and is right everywhere else in this product. React Flow puts
   its edges in an <svg> inside an absolutely positioned <div> that is zero pixels wide, and relies on
   that svg keeping its own size with overflow visible. Under the reset the svg's max-width resolves
   to 100% of zero, so it is clamped to nothing, and a zero-width svg root paints nothing at all.
   Every path was in the DOM with the right geometry, the right stroke and the right width — and no
   pixels. That is why the drawings were captioned boxes with words floating between them.
   Undone here for this canvas only, so the reset keeps doing its job on every other page. The rule
   itself lives in a file this pass does not own and is reported rather than edited. */
.gx-canvas .react-flow__edges svg { max-width: none; max-height: none; }
.gx-arrow[data-tone='plain'] { fill: var(--border-strong); }
.gx-arrow[data-tone='hard'] { fill: var(--st-blocked); }
.gx-arrow[data-tone='partial'] { fill: var(--st-todo); }

/* A line's weight at every zoom. non-scaling-stroke keeps it in screen pixels, so the drawing can be
   shrunk to its whole shape and the lines are still lines rather than half-pixels.

   EVERY NUMBER BELOW COMES FROM LINE_WEIGHT in lines.ts, which also declares the ordering between
   them and why each one holds. They were four literals here, and the ordering was a sentence in the
   comment underneath: a revealed carries line was 2.5px against a gate's 2.25px, so pressing one
   module made seven accent-blue lines the heaviest strokes on the canvas. A rule stated only in a
   comment beside the value it constrains is a rule nothing checks. */
.gx-canvas .gx-edge-line { stroke-width: ${LINE_WEIGHT.plain}; }
.gx-canvas .gx-edge-line[data-tone='hard'] { stroke-width: ${LINE_WEIGHT.gate}; }
.gx-canvas .gx-edge-line[data-tone='partial'] { stroke-width: ${LINE_WEIGHT.gate}; }
.gx-canvas .gx-edge-carries { stroke-width: ${LINE_WEIGHT.carries}; opacity: .85; }

/* ---- WHAT A SELECTION SHOWS ----
   A carries line is not drawn until one of its two ends is pressed; see EdgeDrawn in model.ts for
   the measurement behind that. When one IS drawn it has to read as the answer to the press, so it
   comes forward: full opacity, the accent, and a heavier stroke than the held-back weight.

   IT COMES FORWARD OF WHERE IT WAS, NOT IN FRONT OF THE GATES. Pressing one module reveals every
   block it carries, which on the seeded pipeline is seven lines at once, so a revealed line heavier
   than a gate line turns a drawing about dependencies into a drawing about ownership with one press.
   That is why LINE_WEIGHT.carriesRevealed sits between the held-back weight and the gate weight, and
   why lines.ts asserts it rather than trusting this comment.

   THE ACCENT IS NOT A SECOND STATE COLOUR, and the rule this app states — colour is spent on state
   and nothing else — is not being bent. A selection is not a property of any record: it is where the
   reader is looking, it is stored nowhere, and it is gone the moment they press somewhere else. It
   is the same accent the scope chips use for "this is the one you are on", which is the same fact.
   The gate tones stay exactly where they were, so nothing on a line's own meaning changes. */
.gx-canvas .gx-edge-line[data-revealed='1'] {
  stroke: var(--accent);
  stroke-width: ${LINE_WEIGHT.carriesRevealed};
  opacity: 1;
}
.gx-canvas .gx-edge-label[data-revealed='1'] {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

/* WHERE THE KEYBOARD IS. React Flow makes every node and every edge a tab stop and its own CSS
   beats the app's one focus-visible rule, so eleven stops on this page had no indicator at all
   in either theme — measured by an independent review, which focused a card and found 72 changed
   pixels out of 420,480, none of them near the card. A keyboard reader crossing the drawing was
   invisible.

   The ring is drawn on the CARD rather than on the node wrapper, because the wrapper is a
   zero-padding positioning box and an outline on it sits under the card's own background. The
   colour and the width are the app's own focus tokens, not a second opinion about focus. */
.gx-canvas .react-flow__node:focus-visible {
  outline: none;
}
.gx-canvas .react-flow__node:focus-visible .gx-card,
.gx-canvas .react-flow__node:focus-visible .gx-group,
.gx-canvas .react-flow__node:focus-visible > * {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
}
.gx-canvas .react-flow__edge:focus-visible {
  outline: none;
}
.gx-canvas .react-flow__edge:focus-visible .react-flow__edge-path {
  /* COLOUR AND A HALO, NEVER A WIDTH. Every stroke-width in this stylesheet comes from LINE_WEIGHT,
     because a line's weight is what it MEANS — a hard gate is heavier than a plain relation — and a
     focus ring is not a meaning. tests/graph-lines.test.ts caught the first version of this rule
     typing a 4 in here, which is exactly what that test is for. */
  stroke: var(--focus);
  filter: drop-shadow(0 0 2px var(--focus));
}

/* The card that was pressed: the question. */
.gx-canvas .react-flow__node.selected .gx-card,
.gx-canvas .react-flow__node.selected .gx-group {
  border-color: var(--accent);
  box-shadow: var(--elev-2), 0 0 0 2px var(--accent);
}
/* The cards at the far ends of the lines it revealed: the answer. DRAWN DIFFERENTLY FROM THE
   SELECTED ONE on purpose — one press on a module lights every step it carries and one press on a
   step lights every module carrying it, and if the two looked alike the picture would not say which
   way round the question was asked. That is the many-to-many rule, drawn. */
.gx-canvas .gx-card[data-lit='1'] {
  border-color: var(--accent);
  box-shadow: var(--elev-2);
}

/* The words on a line.
   NOWRAP, and the pill wraps BETWEEN its parts rather than inside them. "waits on" broken across
   two lines as "wait / s on" was the first thing a photograph showed after this pass began, and it
   came from letting the words themselves wrap inside a flex box that was too narrow. The pill is
   allowed to be as wide as its longest part; ELK is told that width and reserves the room. */
.gx-canvas .gx-edge-label {
  padding: 2px 7px;
  max-width: 30em;
  white-space: nowrap;
  flex-wrap: wrap;
  align-items: stretch;
  overflow: visible;
  text-overflow: clip;
  line-height: var(--lh-tight);
  gap: 5px;
  box-shadow: var(--elev-1);
  background: var(--panel);
}
/* The parts of a label do not shrink. Left to flexbox's defaults the gate mark was squeezed until
   "PARTIAL GATE" broke across two lines inside its own cell, which is a two-word phrase reading as
   four. The pill wraps BETWEEN its parts instead, and ELK is told the size that comes out. */
.gx-canvas .gx-edge-label > * { flex: 0 0 auto; }
.gx-canvas .gx-edge-label[data-tone='hard'] { border-width: 1.5px; }
.gx-canvas .gx-edge-label[data-tone='partial'] { border-width: 1.5px; }

/* The rack the labels are measured in.
   It is LAID OUT AT ITS NATURAL WIDTH and only then clipped, which is the whole point: a rack with
   a width of zero measures every label as one character wide and forty lines tall, and ELK then
   reserves a tall thin gap between the layers that no label fits in. A max-content rack and zero
   height on the outside gives each label its real size and still takes no room on the page. */
.gx-measure-rack {
  position: absolute; top: 0; left: 0;
  visibility: hidden; pointer-events: none;
  width: max-content; height: 0; overflow: hidden;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
}
.gx-measure-rack .gx-edge-label { position: static; transform: none; }

/* THE SHARED CARD'S OWN RULES ARE NOT HERE. What the card draws inside its box, from its name and
   its marks to its controls and its grips, is styled by CARD_CSS in CardFace.tsx, which the card
   loads itself wherever it is drawn. What stays here is this drawing's box round the card and what
   this drawing does to the card: the grips show when the pointer is over a card or a box of this
   canvas, or on the node React Flow selected. */
.gx-card:hover .gx-grip,
.gx-group:hover > .gx-grip,
.react-flow__node.selected .gx-grip {
  background: var(--accent);
  opacity: 0.5;
  border-radius: 2px;
}

/* A BLOCK THAT HOLDS A PIPELINE OF ITS OWN, drawn as a stack rather than a sheet.
   SHAPE, NOT COLOUR: two offset edges behind the card, which survive greyscale and spend none of
   the colour this canvas reserves for state. The count of what is inside is the badge beside the
   name; this is the mark that makes the block findable before anybody reads a word. */
.gx-card[data-holds] {
  box-shadow: 3px 3px 0 0 var(--panel), 3px 3px 0 var(--border-w) var(--border),
    6px 6px 0 0 var(--panel), 6px 6px 0 var(--border-w) var(--border);
}

/* ============================================================ what a card says with no words

   EVERYTHING BELOW IS A SHAPE, and that is the whole point of it. At the farthest distance a card
   draws ten characters or none, so the state, the kind, the wall, the ownership and every count have
   to be carried by the drawing itself. Each of these is a CSS shape rather than a glyph in the
   markup, so it costs the canvas no characters and a proof measuring the drawn text finds nothing
   here — and each is distinguishable with the hue removed, which is what the far view now depends on
   entirely.

   The prose each one replaces is named beside it, with what it cost. */

/* THE KIND IS THE OUTLINE. It used to be a word in the chip — the words module and pipeline — on a record
   carrying no state, which is a word repeating the shape the reader can already see. */
.gx-card[data-kind='module'] { border-radius: var(--radius-lg); }
.gx-card[data-kind='step'] { border-radius: 2px; }

.gx-card { position: relative; }
/* A CARD THE READER HAS DRAGGED A HEIGHT ONTO IS EXACTLY THAT TALL — CRITERIA D39 AND D40.

   WHAT DOES NOT FIT RUNS ON BELOW, INSIDE THE CARD, UNDER THE BORDER. overflow: hidden is what
   covers it, and it is why the height on the card is a height and not a floor: a floor let the
   card's own words push the card taller than the reader asked for, which is the forced size the owner
   reported on 7 September.

   THE FADE IS A GRADIENT OVER THE LAST 28 PIXELS, painted after the words, and it says there is
   more to see rather than saying it in a sentence. It is drawn only on a card that HAS a dragged
   height, so a card nobody has touched carries nothing. It ignores the pointer, so the words under
   it are still selectable and the bottom grip is still reachable.

   THE FADE'S COLOUR IS THE CARD'S OWN BACKGROUND, so it works in both themes without a second
   colour being chosen here: the card sets the variable and the gradient reads it. The words' box is
   display: contents everywhere else; that rule is the shared card's, in CardFace.tsx. */
.gx-card[data-cut='1'] .gx-card-words {
  display: block;
  height: 100%;
  overflow: hidden;
}
.gx-card[data-cut='1'] .gx-card-words[data-more='1']::after {
  content: '';
  position: absolute;
  left: var(--border-w);
  right: var(--border-w);
  bottom: var(--border-w);
  height: 28px;
  pointer-events: none;
  z-index: 4;
  background: linear-gradient(to bottom, transparent, var(--panel) 88%);
}
/* THE PIPELINE BOX IS THE POSITIONING BOX FOR ITS OWN CONTROLS, the way a card is. The controls are
   NOT in its head: the headRoom function in this file measures that head and hands it to ELK, so a
   head that grew on a press would move every step inside the box. */
.gx-group { position: relative; }
/* WHICH SIDE OF A WALL A STEP IS ON, as a bar down its edge rather than as the three words
   "as far as you may go" printed on six step cards of one pipeline. unplaced is the honest third
   answer — nothing stored says which side — so it is a dashed bar and never an absent one. */
.gx-card[data-wall='at'] { box-shadow: inset 0 -3px 0 0 var(--st-blocked), var(--elev-1); }
.gx-card[data-wall='behind'] { box-shadow: inset 0 -3px 0 0 var(--border-strong), var(--elev-1); }
.gx-card[data-wall='unplaced'] { border-bottom-style: dashed; }

/* NOBODY IS RECORDED AS CARRYING THIS BLOCK. This replaces the single largest piece of prose on the
   canvas: a 187-character sentence drawn on 27 cards, 3,179 characters on one drawing, plus the
   badge "nobody carries this" on 38 of 38. The mark is a notch out of the card's left rail — no
   module reaches it — and the sentence is on the record and in the reading layer. */
.gx-card[data-unowned='1'] { border-left-style: dotted; }

.gx-group-head .gx-mark[data-mark='restricted'] { margin-left: 4px; }

/* A GATE, AS A SHAPE ON THE LINE. A hard gate is a filled bar across the line and a partial one is
   a broken bar; the words, and the stored sentence saying how far you may go, come back on the lines
   touching whatever the reader pressed. */
.gx-gate-shape { display: inline-block; width: 9px; height: 9px; flex: none; }
/* THE LABELS ON THE LINES SIT ABOVE THE CARDS, AND ONLY THE GATE'S MARK CATCHES A PRESS.

   A label drawn inside a pipeline box was underneath the box, so a press on the gate's mark landed
   on the box and the explanation could not be opened at all — measured by a browser test, which is
   the only instrument that asks what a press would hit. The layer is raised above the cards and
   keeps React Flow's own pointer-events: none, so the one thing a press can land on in it is the
   gate's mark; every other pixel of a label is as transparent to a press as it was. */
.gx-canvas .react-flow__edgelabel-renderer { z-index: 3; }

/* THE GATE'S MARK IS A CONTROL: one press says why this block is closed, one more puts it away.
   It carries no box of its own — the mark is the button — so the label on the line is the same
   shape it was, and the reader learns it is pressable from its cursor and its title. */
.gx-canvas .gx-gate-open {
  pointer-events: auto;
  appearance: none; border: 0; background: transparent; padding: 0; margin: 0;
  display: inline-flex; align-items: center; gap: 4px;
  font: inherit; color: inherit; cursor: pointer;
}
.gx-canvas .gx-gate-open:hover .gx-gate-shape { outline: 1px solid var(--accent); outline-offset: 1px; }
.gx-gate-shape[data-gate='hard'] { background: var(--st-blocked); }
.gx-gate-shape[data-gate='partial'] {
  background: repeating-linear-gradient(90deg, var(--st-blocked) 0 2px, transparent 2px 4px);
}

/* THERE IS MORE OF THIS NAME. A rung shorter than the stored words draws a PREFIX of them, byte for
   byte, and this wedge says so. It is drawn in CSS rather than as a character, so what the canvas
   holds is the record's own text and nothing else. */
.gx-clip {
  display: inline-block;
  width: 7px; height: 7px;
  flex: none;
  background: var(--text-3);
  clip-path: polygon(0 0, 100% 50%, 0 100%);
  opacity: .75;
}

/* AN ARROWHEAD'S SHAPE SAYS HOW HARD THE DEPENDENCY IS, because below the near distance there are no words on
   any line and a distinction made only in hue is the one this product's contract bans. */
.gx-arrow[data-filled='1'] { fill: currentColor; }
.gx-arrow:not([data-filled]) { fill: none; }

/* SEMANTIC EMPHASIS, which is a MEANING and never a stored colour. Each of the four is drawn from
   the state tokens the rest of the app uses, so a theme change and a contrast fix reach it. */
.gx-card[data-emphasis='safety'] { border-left-color: var(--st-failed); border-left-width: var(--rail); box-shadow: var(--elev-2); }
.gx-card[data-emphasis='blocked'] { border-left-color: var(--st-blocked); background: var(--st-blocked-row); }
.gx-card[data-emphasis='active'] { border-left-color: var(--st-doing); background: var(--st-doing-row); }
.gx-card[data-emphasis='muted'] { opacity: .72; }

/* A CARD THAT HAS BEEN PICKED UP — CRITERION D25. The long press has taken and the card is now
   following the pointer, so the cursor is a closed hand and the card is lifted off the drawing.
   Nothing here is a hue: it is the cursor and the shadow the product already uses for a raised
   thing. */
.gx-card[data-picked-up='1'],
.gx-group[data-picked-up='1'] { cursor: grabbing; box-shadow: var(--elev-2); }
.gx-group[data-folded='1'] { border-style: solid; background: var(--panel-2); }

/* THE TWO CONTROLS OVER THE DRAWING: how much each card says, and how big it is drawn.
   They sit in one row above the picture, each under its own name, because they are two different
   things and the product had been drawing only one of them. Wrapping is deliberate: at 390 the row
   becomes two blocks and the steps stack, which costs height a phone can afford and keeps every
   step on screen at every width. */
.gx-controls {
  display: flex; flex-wrap: wrap; align-items: flex-start;
  gap: var(--pad) var(--pad-lg);
  padding: var(--pad) var(--pad-lg);
  border-bottom: var(--border-w) solid var(--border);
  background: var(--panel);
}
.gx-control { display: flex; flex-wrap: wrap; align-items: center; gap: 6px var(--pad); min-width: 0; }
.gx-control-name { font-size: var(--fs-1); color: var(--text-3); line-height: 1.6; }

/* THE THREE STEPS OF THE DETAIL LADDER WERE STYLED HERE, and the control is gone — criterion D14,
   6 September 2026: the detail control is not needed. Where a drawing's cards open is its own
   row of DRAWING_PLACES in model.ts, and a person who wants every card longer has the row on the
   settings page. Nothing on a drawing sets what its cards say any more. */

/* THE DRAWING ON THE WHOLE SCREEN — criterion D17. The wrap becomes the whole window: its own
   background, because a fullscreen element is painted over black and a drawing with no ground under
   it is unreadable in the light theme; a column, so the controls keep their row at the top and the
   canvas takes everything that is left. */
.gx-canvas-wrap:fullscreen {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  padding: var(--pad);
}
.gx-canvas-wrap:fullscreen .gx-canvas {
  flex: 1 1 auto;
  min-height: 0;
}

/* How much of the drawing you can see, and how to see more. Words, not only glyphs. */
.gx-canvas-bar {
  display: flex; align-items: stretch; gap: 0;
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--elev-1);
  /* Keep each control whole while allowing the row to fit a narrow window. */
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  font-size: var(--fs-1);
}
.gx-canvas-bar button {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  padding: 4px 9px; color: var(--text-2); font: inherit; line-height: 1.6;
  white-space: nowrap;
  border-right: var(--border-w) solid var(--border);
}
.gx-canvas-bar button:last-child { border-right: 0; }
.gx-canvas-bar button:hover { background: var(--hover); color: var(--text); }
.gx-canvas-zoom {
  display: inline-flex; align-items: center; padding: 0 7px;
  color: var(--text-3); border-right: var(--border-w) solid var(--border);
  min-width: 3.4em; justify-content: center;
}
.gx-canvas-scale {
  display: inline-flex; align-items: center; padding: 0 8px;
  color: var(--text-3); font-size: var(--fs-1);
  border-right: var(--border-w) solid var(--border);
}

/* What the layout did with the arrangement. Never a silent drop. */
.gx-report {
  padding: var(--pad) var(--pad-lg);
  border-top: var(--border-w) solid var(--border);
  background: var(--panel);
  font-size: var(--fs-1); line-height: var(--lh-body);
}
.gx-report-ok { color: var(--text-3); }
.gx-report-bad { color: var(--st-failed); font-weight: 600; }
.gx-report-list { list-style: none; display: flex; flex-direction: column; gap: 3px; margin-top: 4px; color: var(--text-2); }
.gx-report-list code { font-family: var(--font-mono); color: var(--text-3); }
.gx-report-more { margin-top: 5px; }
.gx-report-more summary { cursor: pointer; color: var(--text-3); }
`
