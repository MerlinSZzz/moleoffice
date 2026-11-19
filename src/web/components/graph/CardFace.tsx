// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * THE FACE OF ONE CARD — the DOM a person actually looks at, and its look, in a file a test can render.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT IN `Canvas.tsx`, WHICH IS WHERE IT LIVED
 * ---------------------------------------------------------------------------------------
 *
 * `Canvas.tsx` imports React Flow AND `@xyflow/react/dist/style.css`. The test runner's environment
 * is `node`: a stylesheet import throws before the first line of the module runs, so nothing in that
 * file can be rendered by a test, and the whole of the graph's proof was therefore made against what
 * `cardAt` RETURNS rather than against what a card DRAWS.
 *
 * That is the gap this wave exists to close. The old proof of the identity invariant asserted that
 * no title carried `data-clipped` — a flag on a return value — and the very same wave deleted the
 * only thing that could set it, so the check was vacuously true for ever and an eight-character cut
 * ran green underneath it. A proof about a screen has to read the screen.
 *
 * SO THE FACE IS HERE, WITH NO REACT FLOW AND NO STYLESHEET IMPORT, and `tests/graph-no-empty-boxes.test.ts`
 * renders it with `renderToStaticMarkup` and asserts on the markup. `Canvas.tsx` wraps it in the two
 * `Handle`s React Flow needs and nothing else.
 *
 * ITS OWN RULES ARE A STRING AT THE FOOT OF THIS FILE, CARD_CSS, and not an imported stylesheet, for
 * the same reason: a module that imports a stylesheet cannot be rendered by a test.
 *
 * NOTHING IN THIS FILE DECIDES ANYTHING. `cardAt` decides what a card says, `planCanvas` decides
 * what every card on a drawing says, and `identityFor` decides what each one is called. This file
 * turns one answer into elements.
 */
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { levelValue, type LevelAbsence, type Rung } from '@shared/detail.ts'
// THE READER'S WORD FOR A STORED STATE, from the one table that holds them. The card's own state
// mark names itself with it — criterion D20 — and so does the chip beside the title.
import { packageStateWord, stateWord } from '@shared/words.ts'
import type { PackageState } from '@shared/delegation.ts'
import type { NodeRole } from '@shared/presentation.ts'
import { drawnFrom, targetAttributes } from '@shared/targets.ts'
// WHICH PART OF A RECORD ONE PART IS, spelled by the one function that spells one. The report page
// draws its parts with the same two, so a comment on a part of a card and a comment on the same
// part of the report name one thing.
import { partRegionId } from '@shared/regions.ts'
import { theRegion } from '../sections.ts'
import { currentWorkspace } from '../../lib/workspace.ts'
// THE TWO ATTRIBUTES A CARD WRITES ABOUT ITSELF: its own nine-position card rung, and the reading
// length it drew. `drawnat.ts` names both and says why they are two.
import { CARD_RUNG_ATTRIBUTE, drawnAtLength, drawnInside } from '../../lib/drawnat.ts'
import { StateChip, type AlarmLevel, type PanelState } from '../ui.tsx'
import { DrawingControl } from './controls.tsx'
// WHAT A RECORD'S LEVEL-1 NAME IS. `wordsAt` is the one reader of a record's written short forms,
// so a nested card's name comes out of the same place a card's own level 1 does.
import { wordsAt } from '@shared/detailsource.ts'
import {
  CARD_DETAIL_LEVELS,
  CARD_LEVELS,
  DRAWING_WORDS,
  riseOf,
  roomForSize,
  cardAt,
  sideWithin,
  roomWithin,
  levelRefusal,
  notWrittenHere,
  sizeRefusal,
  sizeStep,
  sizeWordAfter,
  WIDTH_AT_SIZE,
  type SizeWord,
  type CardChoice,
  type CardContent,
  type CardPlan,
  type CardRestriction,
} from './card.ts'
import { PresenceRow, type PresenceHere } from './Presence.tsx'
import type { FlowDirection } from './layout.ts'
import type { GraphNode } from './model.ts'

/** What each card carries. Flowed through React Flow's `data`, which is why it is a bare object. */
export interface CardData extends Record<string, unknown> {
  node: GraphNode
  onOpen: (recordId: string) => void
  /**
   * Which way this drawing flows, so a line leaves the side of the card ELK expects it to.
   *
   * It comes from `directionFor` in layout.ts, which reads the direction `model.ts` resolved from
   * stored intent — a handle on the left of a card in a drawing that flows downwards makes every
   * line run backwards round the box, and three files with their own opinion about the direction is
   * how that happens.
   */
  flow: FlowDirection
  /**
   * True when a selection elsewhere on this canvas reaches this card through a `carries` line.
   *
   * IT IS NOT THE SAME AS SELECTED, and the difference is what makes the answer readable. Selecting
   * a module lights every step it carries; selecting a step lights every module carrying it. The
   * card you pressed is the question and the lit cards are the answer, so the two are drawn
   * differently — cards that looked alike would say nothing about which way round you asked.
   */
  lit: boolean
  /**
   * WHAT THIS OBJECT WAS GIVEN AT THIS DISTANCE: its rung, its tier, and why it carries words.
   *
   * IT IS NOT WORKED OUT PER CARD, and that is the point. The three reductions — how many objects
   * carry words, which rung each is drawn at, and where the rich detail sits — are decided together
   * by `planCanvas`, once, for the whole drawing. Twenty-one cards each deciding their own rung is
   * twenty-one answers to one question, and it is how the same node came to state one fact twice.
   */
  plan: CardPlan
  /**
   * WHAT RESTRICTS THIS CARD, or null when nothing does and null when nobody has looked yet.
   *
   * The two are told apart one level up, on the drawing rather than on the card: `Canvas.tsx` holds
   * the read's own state and the foot of the drawing says when the read has not answered. A card
   * cannot say "nobody looked" in a shape, so it does not try to.
   */
  restriction: CardRestriction | null
  /**
   * WHO IS WORKING ON THIS CARD. Empty when nobody is, and empty when nobody has looked yet.
   *
   * Told apart one level up, on the drawing rather than on the card, exactly as `restriction` is:
   * `Canvas.tsx` holds the read's own state and the foot of the drawing says when it has not
   * answered. A card cannot draw "nobody looked" in a shape, so it does not try to.
   */
  here: readonly PresenceHere[]
  /** Which position the drawing is at. Presence draws three different things at the three. */
  says: Rung
  /**
   * WHAT THIS READER HAS PRESSED ON THIS CARD: its size, its detail tick, and any level they chose
   * by hand. `cardhere.ts` keeps it; the canvas hands it down.
   */
  choice: CardChoice
  /** What a press on this card's own controls stores. The canvas writes it and re-reads. */
  onChoose: (choice: CardChoice) => void
  /**
   * WHAT A PRESS ON THE NAME DOES, in the words a reader is shown before pressing.
   *
   * IT IS THE PLACE'S TO SAY, because it differs by place and `onOpen` alone cannot be read. On the
   * module and pipeline drawings a press opens the record; on the plan drawing it focuses the card,
   * and the record opens from the panel the focus draws underneath. A tooltip that said one while
   * the press did the other would be a control lying about itself, which is the whole of the
   * problem this cluster is about.
   */
  opens: string
  /**
   * HOW THIS DRAWING MOVES ONE CARD, or absent where this drawing cannot move one — CRITERION D29.
   *
   * The three calls are the three `useFreeDrag` in Canvas.tsx already makes: where the card is now,
   * draw it somewhere else, and write down where it ended up. They are here because the left edge
   * and the top edge grow the card by moving it, and the grips are drawn inside this file while the
   * places live in the canvas.
   *
   * ABSENT IS A REAL ANSWER AND NOT A GAP. The plan drawing lays its cards into bands with a solver
   * and keeps no coordinate for one card, so it cannot honour "the left edge grows the card to the
   * left". `CardGrips` therefore does not draw the grips that would move the card there, rather than
   * drawing them and growing the card the other way — which is exactly the behaviour the owner
   * rejected.
   */
  place?: {
    /** Where this card is on the drawing, in the layout's own pixels. Null when it has no place. */
    where: () => { x: number; y: number } | null
    /** Draw it at this place. Writes nothing: the drag is still going on. */
    moveTo: (at: { x: number; y: number }) => void
    /** Write down where it ended up, into the drawing's stored arrangement. */
    putDown: () => void
  }
}

// THE CLIP MARK IS DELETED, and so is the thing it marked. `clipTo` in card.ts cut a stored name to
// a rung's character budget and this wedge said so, with the accessible name *"shortened to fit —
// the whole name is …"*. Nothing on this canvas cuts a name any more, so nothing marks a cut. See
// `design/round-ten/design/graph.md` §19.

/**
 * THE CONTROLS ON THE CARD THE READER PRESSED — how much room it has, and how much it says.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THEY ARE ON THE CARD
 * ---------------------------------------------------------------------------------------
 *
 * The owner's problem 5: *Users should be able to reveal more meaning through node-level
 * enlargement/focus/detail interactions*, and *A global detail control may remain as a graph-wide
 * default, but it must not be the only implementation of semantic zoom.* A control in the row over
 * the drawing is a graph-wide control however it is worded; this is the one that belongs to a node,
 * so it is on the node.
 *
 * ---------------------------------------------------------------------------------------
 * ON THE CARD THE READER PRESSED, AND ON NO OTHER
 * ---------------------------------------------------------------------------------------
 *
 * Twelve cards each carrying six controls is a drawing of controls. The card somebody pressed is
 * the one they are reading, so it is the one that carries them, and pressing another card moves
 * them there. Nothing is hidden by that: every card can be pressed.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY ONE OF THEM GOES THROUGH `DrawingControl`
 * ---------------------------------------------------------------------------------------
 *
 * That is the rule from problem 6, merged on 5 September 2026 as `4a684b2`: a control on a drawing
 * says what the page is in and what its press would set, and controls.tsx decides what to do when
 * those are the same. So the size controls refuse in words at the ends, the detail tick refuses on
 * a record with no level 4, 5 or 6 written, and the level controls refuse at the ends of the six a
 * card can be at.
 */

/**
 * THE DRAWING'S ZOOM, read off the viewport's own transform.
 *
 * React Flow keeps the whole drawing at one scale, written into the `transform` of
 * `.react-flow__viewport` as `translate(...) scale(z)`; the browser resolves that to a matrix whose
 * `a` is `z`. That is the number a screen distance has to be divided by to become a distance inside
 * a node, which is what the head strip's `right` is written in. It falls back to 1 rather than
 * guessing when there is no transform to read.
 */
function zoomOf(canvas: HTMLElement): number {
  const viewport = canvas.querySelector('.react-flow__viewport')
  if (!(viewport instanceof HTMLElement)) return 1
  const transform = getComputedStyle(viewport).transform
  if (transform === '' || transform === 'none') return 1
  const scale = new DOMMatrixReadOnly(transform).a
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

function CardControls({ node, plan, choice, onChoose }: Pick<CardData, 'node' | 'plan' | 'choice' | 'onChoose'>) {
  // THE LEVEL THIS CONTROL SHOWS AND STEPS FROM IS THE ONE THE READER ASKED FOR, and not the one
  // the card drew in its place.
  //
  // The two differ on exactly one card: a level nobody wrote. `whatACardSays` draws the name line
  // there and says which level is missing, so `plan.level` comes back as level 2. A plus computed
  // from that asked for level 3, whose card IS written, and the next plus asked for level 4 again —
  // so the readout walked 4, 3, 4, 3 for ever and levels 5 and 6 could not be reached by hand at
  // all. `choice.level` is what the reader pressed, so stepping from it reaches every level.
  //
  // A LEVEL CHOSEN BY HAND STAYS. A control that
  // cannot reach half the ladder has not kept it.
  const level = choice.level ?? plan.level ?? 'title'
  // THE SIZE THE CARD IS DRAWN AT, which is what this control shows, moves and refuses at the ends
  // of. It is `plan.size` and never `choice.size`: the two differ on a card nobody has sized, where
  // focus has moved it one step, and a control that showed the stored word would name a size the
  // card is not at.
  const size = plan.size ?? 'usual'
  const smaller = sizeStep(size, -1)
  const bigger = sizeStep(size, 1)
  const at = CARD_LEVELS.indexOf(level)
  const shorter = at <= 0 ? null : (CARD_LEVELS[at - 1] as Rung)
  const longer = at < 0 || at >= CARD_LEVELS.length - 1 ? null : (CARD_LEVELS[at + 1] as Rung)
  // WHETHER THE DETAIL TICK HAS ANYTHING TO SHOW, AND WHY NOT WHERE IT HAS NOT.
  //
  // The three levels it opens are the ones written by part, and a record with none of them is a
  // missing prerequisite rather than a state the card is already in — so the tick says so instead
  // of being pressed and doing nothing. WHICH sentence it says is the reason the record has not got
  // them, and there are three: nobody wrote them, the record is shorter than they are, or this kind
  // of record has no parts at all. The tick said the first one in all three cases.
  //
  // THE REASON IS READ OFF THE SHORTEST OF THE THREE. The three go together — the kind's place is
  // the same for all of them, the length ceiling drops the longest first, and parts are written
  // together — so the reason level 4 is missing is the reason the tick has nothing to show.
  // THE UNFOLD STARTS OPEN ON A CARD WHOSE LEVEL SOMEBODY CHOSE BY HAND, because the way back out
  // of that level is inside it. Everywhere else it starts closed, which is criterion D18.
  const [byHandOpen, setByHandOpen] = useState(plan.levelFrom === 'byHand')
  /**
   * WHICH SIDE OF THE CARD THE STRIP HANGS FROM, so that all of it is inside the drawing.
   *
   * The drawing's box clips what overflows it. The strip hangs under the card, and on a card near
   * the bottom of the drawing it hung past that edge and was cut away — a browser test found the
   * unfold at a point where a press landed on the strip of words UNDER the canvas instead.
   *
   * A CARD HANGS IT UNDER ITSELF, OR OVER ITSELF WHERE THERE IS NO ROOM UNDER. Measured after it is
   * drawn, which costs one frame and nothing in the layout: the strip is out of the flow either way.
   *
   * A PIPELINE BOX PUTS IT IN ITS OWN HEAD, and that is not a preference. The steps inside a box are
   * drawn as separate nodes stacked ABOVE the box, so a strip anywhere in the box's middle or foot
   * is behind them however it is layered — a browser test found a press landing on a step card. The
   * head is the one band of a box no step is ever drawn in: the layout reserves it. Nothing about
   * the head's own height changes, which is what `headRoom` in Canvas.tsx measures and hands to ELK.
   */
  const strip = useRef<HTMLDivElement | null>(null)
  const inTheHead = node.kind === 'pipeline'
  const [side, setSide] = useState<'below' | 'above'>('below')
  /**
   * HOW FAR FROM THE BOX'S OWN RIGHT EDGE THE HEAD STRIP IS HELD, in the drawing's own pixels, so
   * that a reader who can see any part of a box wider than the window can reach its size press.
   * `null` is the answer for a box whose right edge is already inside the drawing: the stylesheet's
   * own 4px, exactly as every box has always drawn it.
   *
   * THE HEAD PLACEMENT STAYS. What moves is only where the strip sits ALONG that band. The paragraph
   * above says why the head is the one band a press can land in; on a box 3,578 pixels wide in a
   * 1,440-pixel window the head runs off the screen, and a strip pinned to the box's own right end
   * is a control a reader can only reach by panning the steps they are reading off the screen.
   *
   * THE WINDOW AND THE BOX ARE MEASURED IN SCREEN PIXELS. React Flow scales and translates the whole
   * drawing, so a node's own pixels are not screen pixels. The screen distance the box's right edge
   * lies beyond the drawing is divided by the current zoom — the scale in the viewport's own
   * transform — before it is written, and rounded to whole pixels so a fraction of one cannot flip
   * the value on every measurement.
   */
  const [headRight, setHeadRight] = useState<number | null>(null)
  // A RE-RENDER WITH NOTHING STORED. React Flow pans and zooms by writing the viewport's transform
  // straight to the DOM, and a window resize changes the canvas — neither re-renders a node, so the
  // observers below are what wake the measuring effect.
  const [, wakeTheEffect] = useReducer((n: number) => n + 1, 0)
  useLayoutEffect(() => {
    const el = strip.current
    const canvas = el?.closest('.gx-canvas')
    if (el === null || !(canvas instanceof HTMLElement)) return
    const box = canvas.getBoundingClientRect()
    if (inTheHead) {
      const wrapper = el.closest('.react-flow__node')
      if (!(wrapper instanceof HTMLElement)) return
      const here = wrapper.getBoundingClientRect()
      // THE BOX'S RIGHT EDGE IS IN THE DRAWING when it is not past the drawing's own right edge:
      // nothing is written, so the stylesheet's 4px is the whole of the answer.
      if (here.right <= box.right) {
        setHeadRight((was) => (was === null ? was : null))
        return
      }
      // THE STRIP'S OWN REFERENCE IS ITS CONTAINING BLOCK, which is the card-controls layer just
      // inside the box's border, not the box's outer edge. `right` is measured from that, and the
      // border between the two is a few node pixels that would otherwise put the strip short of the
      // drawing's edge. `el.parentElement` is that layer.
      const reference = el.parentElement?.getBoundingClientRect()
      if (reference === undefined) return
      const wanted = Math.round((reference.right - box.right) / zoomOf(canvas)) + 4
      const want = wanted <= 4 ? null : wanted
      setHeadRight((was) => (was === want ? was : want))
      return
    }
    const card = el.parentElement?.getBoundingClientRect()
    if (card === undefined) return
    const tall = el.getBoundingClientRect().height
    const want = tall <= box.bottom - card.bottom ? 'below' : 'above'
    // ONLY WHEN IT CHANGED, so this settles in one extra render rather than looping. The effect has
    // no dependency list on purpose: the card moves when the drawing is laid out again, and a list
    // of the things it knows about would not include that.
    if (want !== side) setSide(want)
  })
  /**
   * THE DRAWING'S WINDOW MOVES WITHOUT REACT KNOWING. Panning and zooming write the transform on
   * the viewport element directly, for speed, and a window resize changes the canvas's width. So the
   * head strip is measured again when either happens, which is what makes it follow the reader. Both
   * observers only ask for a re-render; the measuring and the writing happen in one place, the
   * effect above. Nothing that effect writes touches the viewport or the canvas, so the observers
   * cannot be woken by their own answer.
   */
  useEffect(() => {
    if (!inTheHead) return
    const canvas = strip.current?.closest('.gx-canvas')
    if (!(canvas instanceof HTMLElement)) return
    const viewport = canvas.querySelector('.react-flow__viewport')
    const watching = new MutationObserver(wakeTheEffect)
    if (viewport !== null) watching.observe(viewport, { attributes: true, attributeFilter: ['style'] })
    const sized = new ResizeObserver(wakeTheEffect)
    sized.observe(canvas)
    return () => {
      watching.disconnect()
      sized.disconnect()
    }
  }, [inTheHead, wakeTheEffect])
  const hasParts = CARD_DETAIL_LEVELS.some((one) => node.levels.has.includes(one))
  const shortest = CARD_DETAIL_LEVELS[0]
  const whyNoParts = shortest === undefined ? 'notWritten' : (node.levels.why[shortest] ?? 'notWritten')
  /**
   * WHAT PRESSING A SIZE WORD CHANGES — CRITERION D37.
   *
   * ---------------------------------------------------------------------------------------
   * A CARD AND A BOX ARE SIZED BY DIFFERENT THINGS, AND THE PRESS KNEW ONLY THE CARD'S
   * ---------------------------------------------------------------------------------------
   *
   * A card's width is its role's width times `room`, so writing `room` IS resizing a card. A
   * PIPELINE'S BOX HAS NO ROLE WIDTH: its size is `width` and `height` in the drawing's own pixels,
   * handed to the layout as the box's smallest acceptable size — see `CardChoice.width` in card.ts,
   * and `hasSteps` in Canvas.tsx, which is where they reach ELK.
   *
   * So this press wrote a share nothing about a box reads, and the box changed the word it said and
   * not one pixel of its size. Measured in Chromium at 1440 on the owner's own nine-step pipeline,
   * on an isolated copy of the owner's database: three presses of `+` took the box from `small` to
   * `largest` and left it at 3578 x 425.917 layout pixels, to the pixel, with 0 of 18 cards moved
   * and 0 of 11 lines redrawn, while its head grew from 35 to 39 pixels — so the head then
   * overlapped the first row of steps.
   * The one thing that moved was the head, and it moved OVER the drawing rather than making room.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT IT WRITES NOW
   * ---------------------------------------------------------------------------------------
   *
   * The word is a share of the AREA — `sizeShareOf` in card.ts — so reaching a word is multiplying
   * the share the card is at by however much is missing. A card spends that on its width, which is
   * the one side it has. A BOX SPENDS IT ON BOTH SIDES, in the same proportion, and its pixels move
   * by the same number: a box has no words of its own to reflow, so growing its width alone would
   * stretch it into a strip, and what a bigger box is FOR is room for the steps inside it.
   *
   * THE PIXELS AND THE SHARE ARE WRITTEN TOGETHER, exactly as the drag writes them, because they
   * are one fact: how big the box is. A share written without its pixels is what this defect was.
   */
  const aBox = node.kind === 'pipeline'
  const pressTo = (word: SizeWord): CardChoice => {
    const rise = riseOf(choice)
    // THE WORD THE PRESS ASKS FOR IS THE WORD THE CARD IS AT — criterion D38. A press names a word
    // and sets the share to that word's own number, so there is no band to walk and nothing to
    // work out: what it says and what it is are set in the same breath.
    if (!aBox) return { ...choice, size: word, room: roomForSize(word, rise) }
    // THE BOX AS IT IS DRAWN RIGHT NOW, in the layout's own pixels. React Flow sizes the WRAPPER
    // and `.gx-group` is only as wide as its head, which is the same trap `startDragging` below
    // carries a paragraph about — so the wrapper is what is measured.
    const wrapper = strip.current?.closest('.react-flow__node')
    // THE SHARE THE BOX IS AT, READ OFF THE PLAN. `plan.room` is `roomOf(choice, says)` worked out
    // once for the whole canvas — the same number the readout beside this control is drawn from —
    // so reading it here cannot disagree with the word the reader can see.
    const room = plan.room ?? choice.room ?? 1
    // HOW MUCH EACH SIDE MOVES TO PUT THE BOX AT THIS WORD'S AREA. A word is a share of the area, so
    // each side moves by the square root of the ratio of the areas. Criterion D40.
    const area = room * rise
    const by = area > 0 ? Math.sqrt(WIDTH_AT_SIZE[word] / area) : 1
    const wide = wrapper instanceof HTMLElement ? wrapper.offsetWidth : 0
    const tall = wrapper instanceof HTMLElement ? wrapper.offsetHeight : 0
    return {
      ...choice,
      size: word,
      room: roomWithin(room * by),
      rise: roomWithin(rise * by),
      // A BOX THIS BROWSER IS NOT DRAWING HAS NO SIZE TO MULTIPLY, and inventing one would be a
      // press that resized a box to a number nobody measured. The share still moves, so the box
      // says what the press asked for and the next drag starts from a size that is really there.
      ...(wide > 0 ? { width: sideWithin(Math.round(wide * by)) } : {}),
      ...(tall > 0 ? { height: sideWithin(Math.round(tall * by)) } : {}),
    }
  }
  return (
    /**
     * THE CONTROLS ARE DRAWN OVER THE CARD AND NOT IN IT, WHICH IS CRITERION D12.
     *
     * They used to be an ordinary child of the card, so the card the reader pressed grew by the
     * height of this strip, every box on the drawing was measured again and ELK placed them all
     * again. That showed as a flash and a jump: after a press the card grew and the view moved.
     * Taken out of the flow — `position: absolute` under the card's bottom
     * edge — the strip changes no box, so a press asks for no layout at all.
     */
    <div className="gx-card-controls">
    {/* THE TICK IS AT THE CARD'S BOTTOM-RIGHT CORNER, which is where it was asked for: only that
        tick replaces level 3 with level 4 and goes on unfolding up to level 6. It is the one control on
        a card that is not on the strip, because it is the one whose place was named. */}
    <div className="gx-card-corner">
      <DrawingControl
        look="plain"
        className="gx-card-tick"
        now={choice.detail}
        after={!choice.detail}
        {...(hasParts ? {} : { unavailable: NOTHING_TO_TICK[whyNoParts] })}
        {...(plan.levelFrom === 'byHand' ? { unavailable: A_LEVEL_WAS_CHOSEN() } : {})}
        label={t('g7b.CardFace.detail_on_this_card')}
        title={t('g7b.CardFace.show_this_record_written_by_part_and')}
        onPress={() => onChoose({ ...choice, detail: !choice.detail })}
      >
        <span className="gx-tick" data-on={choice.detail ? '1' : undefined} aria-hidden="true" />
        {DRAWING_WORDS.says}
      </DrawingControl>
    </div>
    <div
      className="gx-card-strip-holder"
      ref={strip}
      data-side={inTheHead ? 'head' : side}
      // ONLY WHERE THE STYLESHEET'S 4px IS NOT THE ANSWER. A box wholly in view leaves this off, so
      // it draws in the same place, to the pixel, as every box drew before the window could move.
      style={inTheHead && headRight !== null ? { right: `${String(headRight)}px` } : undefined}
    >
    <div className="gx-card-strip">
      <span className="gx-card-axis">{DRAWING_WORDS.size}</span>
      {/* NOT `Smaller` AND `Bigger`, WHICH ARE THE ZOOM'S OWN NAMES. Two controls on one page whose
          accessible names contain the same word are two controls a reader — and a test — cannot
          tell apart, and the four states this cluster is about are exactly the four that were being
          told apart. Card size says room; canvas zoom says how big the picture is. */}
      <DrawingControl
        look="plain"
        className="gx-card-press"
        now={size}
        after={smaller ?? size}
        reason={sizeRefusal(size)}
        label={t('g7b.CardFace.less_room_for_this_card')}
        onPress={() => onChoose(pressTo(smaller ?? size))}
      >
        −
      </DrawingControl>
      <span className="gx-card-at" data-size={size}>
        {size}
      </span>
      <DrawingControl
        look="plain"
        className="gx-card-press"
        now={size}
        after={bigger ?? size}
        reason={sizeRefusal(size)}
        label={t('g7b.CardFace.more_room_for_this_card')}
        onPress={() => onChoose(pressTo(bigger ?? size))}
      >
        +
      </DrawingControl>
      {/* WHICH LEVEL THIS CARD IS AT: a readout and not a control. What a person does to move it is
          drag the card's edge and tick its detail — the automatic steps — and this says where those
          have got to. Criterion D18.

          THE READOUT IS THE VALUE ALONE, because the axis word is written beside it. `levelLabel`
          carries the word `Level` itself, so drawing it here read `Level  Level 2` — problem
          ffKdX7dfulEO. `levelValue` is the same rule without the word, and it reads the same way
          the size readout beside it does: the axis names the axis, the readout gives the value. */}
      <span className="gx-card-axis">{DRAWING_WORDS.level}</span>
      <span className="gx-card-at" data-level={level}>
        {levelValue(level)}
      </span>
      {/* THE HAND CONTROL IS BEHIND AN UNFOLD — CRITERION D18.
          The setting that changes the level by hand is kept, because a level chosen by hand stays
          available, and hidden, because the automatic steps are what a person should see.

          IT OPENS BY ITSELF ON A CARD WHOSE LEVEL SOMEBODY CHOSE, and that is not a convenience:
          `Back to the sizes` is the only way out of a hand-chosen level, and a way out behind a
          fold is a reader stuck at a level with the control that put them there out of sight. */}
      <DrawingControl
        look="plain"
        className="gx-card-unfold"
        now={byHandOpen}
        after={!byHandOpen}
        label={byHandOpen ? t('g7b.CardFace.put_the_level_control_away') : t('g7b.CardFace.set_the_level_by_hand')}
        title={
          byHandOpen
            ? t('g7b.CardFace.put_the_level_control_away_and_let')
            : t('g7b.CardFace.choose_this_card_s_level_by_hand')
        }
        onPress={() => setByHandOpen(!byHandOpen)}
      >
        {byHandOpen ? '−' : t('g7b.CardFace.by_hand')}
      </DrawingControl>
      {byHandOpen ? (
        <>
          <DrawingControl
            look="plain"
            className="gx-card-press"
            now={level}
            after={shorter ?? level}
            reason={levelRefusal(level)}
            label={t('g7b.CardFace.one_level_shorter_for_this_card')}
            onPress={() => onChoose({ ...choice, level: shorter ?? level })}
          >
            −
          </DrawingControl>
          <DrawingControl
            look="plain"
            className="gx-card-press"
            now={level}
            after={longer ?? level}
            reason={levelRefusal(level)}
            label={t('g7b.CardFace.one_level_longer_for_this_card')}
            onPress={() => onChoose({ ...choice, level: longer ?? level })}
          >
            +
          </DrawingControl>
          {/* DRAWN ONLY WHEN THERE IS SOMETHING TO GIVE BACK, so its presence is how a reader knows
              a level was chosen by hand on this card rather than reached by growing it. */}
          {plan.levelFrom === 'byHand' ? (
            <DrawingControl
              look="plain"
              className="gx-card-auto"
              now={choice.level}
              after={null}
              onPress={() => onChoose({ ...choice, level: null })}
              title={t('g7b.CardFace.let_the_size_decide_the_level_again')}
            >{t('g7b.CardFace.back_to_the_sizes')}</DrawingControl>
          ) : null}
        </>
      ) : null}
    </div>
    </div>
    </div>
  )
}


// ==================================================== the edge a reader drags to enlarge one card

/**
 * THE EIGHT PLACES A CARD CAN BE DRAGGED BY, and which edges each of them holds — CRITERION D29.
 *
 * `x` and `y` are the direction that MAKES THE CARD BIGGER when the pointer moves that way, and a
 * zero means this grip does not hold that pair of edges at all. An edge grip holds one edge; a
 * corner grip holds its two adjacent edges. EACH AXIS IS READ FROM ITS OWN HALF OF THE POINTER'S
 * TRAVEL and nothing compares the two, so a corner pulled straight down changes the height and
 * leaves the width exactly where it was.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACED, MEASURED ON THE OWNER'S OWN PIPELINE
 * ---------------------------------------------------------------------------------------
 *
 * There were four grips — left, right, bottom-left, bottom-right — no top edge, no bottom edge and
 * no top corner, and a corner took `Math.max(|across|, |down|)` for the WIDTH. So nothing dragged
 * downwards, and a corner could get stuck growing only to the right. What was wanted: dragging the
 * left edge grows the card to the left, dragging one edge leaves the others still, and dragging a
 * corner is the same as dragging its two edges.
 *
 * Measured on one of the owner's own pipelines at 1440 with a mouse, on an isolated copy of the owner's
 * database, on one card of it (left 577, right 772, top 636, bottom 688):
 *
 *   - the LEFT grip dragged 140 to the left moved the left edge by 0 and the right edge by +141:
 *     the card grew rightwards, away from the pointer;
 *   - the BOTTOM-RIGHT corner dragged 140 straight DOWN moved the right edge by +141. A drag that
 *     went nowhere sideways made the card 141 pixels wider. The bottom-left corner did the same;
 *   - the top edge never moved on any of the ten drags, because nothing could move it.
 *
 * WHY THE TOP AND LEFT ONES CAN EXIST NOW. A card is placed by its top-left corner, so growing it
 * leftwards or upwards is a resize AND a move. A left edge that grows to the left was asked for, and
 * `place` below is how one drag does both.
 */
const CARD_GRIPS = [
  { at: 'left', x: -1, y: 0, cursor: 'ew-resize' },
  { at: 'right', x: 1, y: 0, cursor: 'ew-resize' },
  { at: 'top', x: 0, y: -1, cursor: 'ns-resize' },
  { at: 'bottom', x: 0, y: 1, cursor: 'ns-resize' },
  { at: 'top-left', x: -1, y: -1, cursor: 'nwse-resize' },
  { at: 'top-right', x: 1, y: -1, cursor: 'nesw-resize' },
  { at: 'bottom-left', x: -1, y: 1, cursor: 'nesw-resize' },
  { at: 'bottom-right', x: 1, y: 1, cursor: 'nwse-resize' },
] as const

type CardGrip = (typeof CARD_GRIPS)[number]

/**
 * TRUE WHEN DRAGGING THIS GRIP MOVES THE CARD AS WELL AS RESIZING IT.
 *
 * The left edge and the top edge are the two the card is placed by, so an edge that grows the card
 * outwards there has to take the card's stored position with it. Everything else grows away from
 * the position and moves nothing.
 */
function aGripThatMoves(grip: CardGrip): boolean {
  return grip.x === -1 || grip.y === -1
}

/**
 * HOW LONG A FINGER HOLDS AN EDGE BEFORE THE DRAG STARTS, in milliseconds.
 *
 * On a phone the drag is a long press on the
 * edge. A finger that touches an edge and moves straight away is a person scrolling the page, so a
 * touch has to say it means this. A mouse says it by being a mouse: a pointer that can hover cannot
 * arrive on an eight-pixel strip by accident.
 */
const A_LONG_PRESS = 500

/**
 * HOW SMALL A CHANGE IS WORTH REDRAWING FOR, in the layout's own pixels, on both axes — D39.
 *
 * ONE PIXEL, AND IT USED TO BE THREE ON THE HEIGHT AND A HUNDREDTH OF A SHARE ON THE WIDTH. Those
 * two were a bargain about how often the drawing is laid out, and they were paid for in the one
 * thing D39 says a reader owns: a hundredth of a share is 2.24 pixels on the narrowest card, so a
 * drag could be two pixels behind the pointer and stay there, and three pixels of height meant the
 * same on the other axis. D39 says the edge is at the pointer, so the threshold has to be smaller
 * than the tolerance the criterion is measured to, which is one pixel.
 *
 * WHAT PAYS FOR IT is not a coarser drag: it is the layout throttle in Canvas.tsx, which is where
 * criterion D42 says the cost belongs. The card's own size is set on every pixel; ELK is asked at
 * most ten times a second.
 */
const A_PIXEL_WORTH_DRAWING = 1

/**
 * THE EDGES AND CORNERS OF ONE CARD, WHICH ARE WHAT ENLARGE IT — criterion D13.
 *
 * Not bigger on a press, bigger on a drag, the way the box a person types in grows: dragging a
 * block's edge or corner enlarges it. This is
 * that interaction, and it is deliberately the same shape as `GrowingBox` in Chat.tsx: a pointer
 * down that captures the pointer and remembers where it started, a move that sets the size from
 * where the pointer is now, and an up that lets go.
 *
 * WHAT IT SETS IS A SHARE AND NOT A PIXEL COUNT. `from.width` is the card as it is drawn on screen,
 * so it already carries the canvas zoom; the ratio of the new width to the old one is the same
 * number at every zoom, and multiplying the stored share by it keeps a drag meaning the same thing
 * whether the reader is at 40 per cent or at 160.
 *
 * THE GRIPS ARE ON EVERY CARD AND NOT ONLY THE FOCUSED ONE. A reader who wants a card bigger should
 * not have to press it first, and they cost nothing: eight boxes with no words, out of the flow, so
 * they change no card's size and ask for no layout. They are drawn only under the pointer or on the
 * card that is focused, so the drawing is not a picture of handles.
 */
export function CardGrips({ node, plan, choice, onChoose, place }: Pick<CardData, 'node' | 'plan' | 'choice' | 'onChoose' | 'place'>) {
  /**
   * WHETHER THIS IS A PIPELINE'S BOX — CRITERION D35.
   *
   * A box's size is not its role's width times a share: it is whatever the layout needed to fit its
   * steps, so the drag sets it in pixels and hands those to the layout as the box's minimum. A
   * card's size is a share of a real role width and stays one.
   */
  const aBox = node.kind === 'pipeline'
  const held = useRef<{
    /** Where the pointer was last anchored. It moves only when a side is at the floor or ceiling. */
    x: number
    y: number
    /** The width last written, in the layout's own pixels, so a drag writes only when it has moved
     *  a pixel worth drawing. Null until this drag has written one. */
    wrote: number | null
    /**
     * THE ANCHOR SIDES, in the layout's own pixels: the width and the height the pointer's travel is
     * added to. They start as the card's own sides and move only when a side is at the floor or the
     * ceiling, so the first pixel of coming back from an end is a pixel of coming back — D39.
     */
    wideAnchor: number
    tallAnchor: number
    /**
     * THE CARD'S SIDES WHEN THE DRAG STARTED, in the layout's own pixels, and they never move.
     *
     * The anchors above DO move. The two were one field for an hour and the top edge then moved by
     * 1 pixel instead of 98, because the number saying how much the card had really gained was
     * being measured against a moving mark.
     */
    ownWidth: number
    ownAtStart: number
    /** The width share the drag started at, which never moves. It is what a box's share follows. */
    roomAtStart: number
    /**
     * THE WIDTH THIS CARD WOULD HAVE AT SHARE 1, in the layout's own pixels. Fixed for the whole
     * drag: the anchors above move at an end of the range, and the arithmetic that turns pixels
     * back into a share must not move with them.
     */
    roleWidth: number
    /** How big one on-screen pixel is in layout pixels: the canvas zoom, measured off this card. */
    scale: number
    /** The height last written, so a drag writes only when it has moved a pixel worth drawing. */
    grew: number | null
    /** Where the card was when the drag started, or null where this drawing keeps no place for it. */
    at: { x: number; y: number } | null
  } | null>(null)
  const armed = useRef<number | null>(null)
  /** True once this drag has moved the card, so the pointer-up knows there is a place to write. */
  const moved = useRef(false)

  const startDragging = (e: React.PointerEvent<HTMLElement>): void => {
    // THE PRIMARY BUTTON AND NOTHING ELSE, for the reason `useFreeDrag` in Canvas.tsx gives: a
    // right-click is how a comment is written, and capturing the pointer takes it away from the
    // element it landed on.
    if (e.button !== 0) return
    const inner = e.currentTarget.closest('.gx-card, .gx-group')
    if (!(inner instanceof HTMLElement)) return
    /**
     * THE BOX BEING DRAGGED, AND IT IS NOT ALWAYS THE ELEMENT THE GRIPS ARE ON — CRITERION D35.
     *
     * A card's own div IS the card: React Flow gives the wrapper the width and the card fills it.
     * A pipeline's box is different — `.gx-group` has no width of its own and comes out about the
     * width of its head, while the box a reader sees is the wrapper React Flow sized. Measured on a
     * four-step pipeline: `offsetWidth` on `.gx-group` was under 190 pixels for a box more than
     * three times that, so a drag of 356 pixels was read as trebling the box and grew it by 1014.
     */
    const card = (inner.closest('.react-flow__node') as HTMLElement | null) ?? inner
    const box = card.getBoundingClientRect()
    const width = box.width
    if (width <= 0) return
    // THE CARD'S OWN HEIGHT AND THE CANVAS'S ZOOM, both read off this one element. `offsetHeight` is
    // the layout's pixels and `getBoundingClientRect` is the screen's, so their ratio IS the zoom.
    const own = card.offsetHeight
    const scale = own > 0 ? box.height / own : 1
    // NOT `preventDefault`: React Flow reads this press to focus the card, and a card that could be
    // resized but not pressed would be a card whose own controls never appear. `stopPropagation` is
    // what keeps the canvas from panning under the drag.
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const room = plan.room ?? 1
    const ownWidth = card.offsetWidth
    const from = {
      x: e.clientX,
      y: e.clientY,
      wrote: null,
      wideAnchor: ownWidth,
      tallAnchor: own,
      ownWidth,
      ownAtStart: own,
      roomAtStart: room,
      roleWidth: room > 0 ? ownWidth / room : ownWidth,
      scale,
      grew: null,
      at: place?.where() ?? null,
    }
    moved.current = false
    if (e.pointerType === 'mouse') {
      held.current = from
      return
    }
    // A FINGER SAYS IT MEANS THIS BY HOLDING STILL. Until the half second is up the touch belongs to
    // the page, so a reader scrolling past a drawing does not resize a card by brushing it.
    armed.current = window.setTimeout(() => {
      armed.current = null
      held.current = from
    }, A_LONG_PRESS)
  }

  const keepDragging = (grip: CardGrip) => (e: React.PointerEvent<HTMLElement>): void => {
    const from = held.current
    if (from === null) return
    /**
     * EACH EDGE MOVES ALONE — CRITERION D29.
     *
     * A grip's `x` and `y` say which pair of edges it holds, and a zero means it holds neither of
     * that pair. `across` is the pointer's travel along the card's width and `down` along its
     * height, each already signed so that a positive number means bigger. NOTHING COMPARES THE TWO.
     *
     * This line used to read `const grew = down === null || Math.abs(across) >= Math.abs(down) ?
     * across : down`, and that comparison is the whole of the defect the owner reported: the WIDTH was set
     * from whichever way the pointer had moved further, so a corner pulled straight down grew the
     * card 141 pixels to the right and never downwards at all.
     */
    const across = grip.x === 0 ? null : (e.clientX - from.x) * grip.x
    const down = grip.y === 0 ? null : (e.clientY - from.y) * grip.y
    /**
     * EACH SIDE IS EXACTLY WHERE THE POINTER PUT IT — CRITERION D39.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT THIS WAS, AND WHY IT WAS THE DEFECT THE OWNER REPORTED THREE ROUNDS RUNNING
     * ---------------------------------------------------------------------------------------
     *
     * The two sides were shares, they were multiplied into an area, and the area was held inside
     * one cap by `theTwoSharesWithinTheOneCap`. When a CORNER was held that function scaled BOTH
     * shares down by the same factor, so from the moment the product touched the cap neither side
     * could move outwards at all.
     *
     * Measured at 1440 on the owner's pipeline on 7 September 2026, at the size the drawing opens at,
     * dragging a module card's bottom-right corner outwards in 20-pixel steps: the card grew 20
     * pixels on the first step and then did not move for the remaining 380. At the end the pointer
     * had asked for 457.9 pixels of width and the card was 78.3. The corner did not follow the
     * pointer, so a corner could not move freely to one side.
     *
     * ---------------------------------------------------------------------------------------
     * WHAT IT IS NOW
     * ---------------------------------------------------------------------------------------
     *
     * Both sides are worked out in the LAYOUT'S OWN PIXELS, each from its own edge's travel, and
     * each held only by `sideWithin` — one floor and one ceiling, the same pair for both axes of
     * both a card and a box. Nothing compares the two axes and nothing multiplies them, so no
     * amount of pulling on one side can stop the other, and a corner is simply both at once, which
     * is criterion D41.
     *
     * THE SHARES ARE WORKED OUT FROM THE PIXELS AND NOT THE OTHER WAY ROUND. `sizeShareOf` reads
     * them to choose what is drawn inside the card — criterion D40 — and D39 says the level is
     * derived from the size, never the size from the level. This is where that direction is set.
     *
     * `from.scale` IS HOW THE POINTER'S TRAVEL BECOMES LAYOUT PIXELS. The card is drawn inside the
     * canvas's transform, so a hundred pixels of pointer is a hundred divided by the zoom in the
     * layout. It is measured off the card itself — the on-screen box over `offsetHeight`, which the
     * transform does not scale — so nothing here has to reach into React Flow for the zoom, and the
     * plan drawing, which draws this same card outside a React Flow provider, works the same way.
     */
    const askedWide = across === null ? from.wideAnchor : from.wideAnchor + across / from.scale
    const askedTall = down === null ? from.tallAnchor : from.tallAnchor + down / from.scale
    const wideNow = across === null ? from.wideAnchor : sideWithin(askedWide)
    /**
     * THE AXIS NOBODY IS HOLDING KEEPS THE SIZE IT HAD — CRITERIA D29 AND D39.
     *
     * A card that has never been dragged by a top or bottom edge has no height of its own: it is as
     * tall as its words. So widening it far enough to reveal a level made it TALLER, on an axis the
     * reader was not touching. Measured at 1440 on the owner's pipeline after the cap came off but before
     * this line: dragging the right edge alone moved the bottom edge 38.6 pixels down.
     *
     * Writing the height the card had when the drag started pins the bottom edge where it is. What
     * the new level then cannot fit runs on below inside the card under the fade, which is D40, and
     * widening the card further reveals it by reflowing the words into fewer lines.
     */
    const tall = from.tallAnchor <= 0 ? null : down === null ? from.ownAtStart : sideWithin(askedTall)
    /**
     * THE ANCHOR MOVES TO THE POINTER WHEN A SIDE IS AT AN END OF ITS RANGE — CRITERION D39.
     *
     * A person should be able to drag freely, with no stiffness; some directions stuck when the level changed.
     * A side worked out from where the drag STARTED does nothing for the first N pixels of coming
     * back, where N is how far past the end the pointer went. The floor and the ceiling are now the
     * only ends there are, and both are far from where a reader works, but the rule still holds at
     * them: the first pixel of coming back is a pixel of coming back.
     */
    if (across !== null && Math.abs(wideNow - askedWide) > 0.5) {
      from.wideAnchor = wideNow
      from.x = e.clientX
    }
    if (down !== null && tall !== null && Math.abs(tall - askedTall) > 0.5) {
      from.tallAnchor = tall
      from.y = e.clientY
    }
    // A DRAG WRITES WHEN IT HAS MOVED A PIXEL, on either axis, and both are measured in the layout's
    // own pixels so the two axes read alike. `wrote` and `grew` are what was last written.
    const movedTheRoom = Math.abs(wideNow - (from.wrote ?? from.ownWidth)) >= A_PIXEL_WORTH_DRAWING
    const movedTheHeight = tall !== null && Math.abs(tall - (from.grew ?? from.ownAtStart)) >= A_PIXEL_WORTH_DRAWING
    if (!movedTheRoom && !movedTheHeight) return
    if (movedTheRoom) from.wrote = wideNow
    if (movedTheHeight && tall !== null) from.grew = tall
    /**
     * THE CARD MOVES BY WHAT IT REALLY GAINED, NOT BY WHERE THE POINTER IS — CRITERION D29.
     *
     * A card is placed by its top-left corner, so the left edge only reaches the pointer if the
     * position goes with it. The number to move by is the width the card actually GOT, which is the
     * pointer's ask at every size except at the floor and the ceiling, where the card is given less
     * than it asked for. Moving by the pointer there would slide the whole card while the far edge
     * was standing still.
     *
     * BOTH SIDES ARE THE SAME ARITHMETIC NOW, FOR A CARD AND FOR A BOX — criterion D42. A box used
     * to take the smaller of the pointer's ask and what the cap on the area allowed, and that `min`
     * is where the owner's box collapsed: measured at 1440, its height fell 193 pixels and its width 214
     * while the pointer was still pulling outwards. There is no second opinion left to take the
     * smaller of.
     */
    const roomNow = roomWithin(from.roleWidth > 0 ? wideNow / from.roleWidth : from.roomAtStart)
    const grewWide = wideNow - from.ownWidth
    const grewTall = (from.grew ?? from.ownAtStart) - from.ownAtStart
    if (from.at !== null && place !== undefined && aGripThatMoves(grip)) {
      place.moveTo({
        x: from.at.x - (grip.x === -1 ? grewWide : 0),
        y: from.at.y - (grip.y === -1 ? grewTall : 0),
      })
      moved.current = true
    }
    // HOW MUCH TALLER THE READER HAS MADE IT, as a share of the height it had before this drag. It
    // is worked out from the pixels rather than the pixels from it — criterion D39, and it is the
    // number `sizeShareOf` reads to choose what is drawn inside.
    const riseNow =
      tall === null || from.ownAtStart <= 0 ? riseOf(choice) : (riseOf(choice) * tall) / from.ownAtStart
    const writing: CardChoice = {
      ...choice,
      // THE SHARE FOLLOWS THE SIZE IT REALLY GOT, so what the card SAYS and how big it IS cannot
      // disagree. A card's width is its role's width times the share; a box's width is its own.
      room: roomNow,
      // THE BOX'S OWN SIZE IN PIXELS — criterion D35. It is what the layout is given as the box's
      // minimum, so the steps inside are laid out again with the room the reader asked for and the
      // lines between them are routed again. A card writes nothing here: its width is its role's
      // width times the share, and a second number saying the same thing would drift from it.
      ...(aBox ? { width: wideNow } : {}),
      // THE PIXELS AND THE SHARE, WRITTEN TOGETHER — criterion D39. The pixels are what the card is
      // drawn with, the share is what the level is chosen from, and a height written without its
      // share would be a card drawn one size and read at another.
      ...(tall === null ? {} : { height: tall, rise: riseNow }),
    }
    /**
     * WHERE THIS DRAG LEFT THE CARD ON THE LADDER — CRITERION D38.
     *
     * The word steps up at the word's own share and back down at two thirds of it, so it depends on
     * the word the card had, and it is written here beside the size it belongs to. Written from the
     * choice this drag is about to store and not from the one it started with, so what the card SAYS
     * and how big it IS are one fact, which is the same rule the two lines above follow.
     */
    onChoose({ ...writing, size: sizeWordAfter(Math.sqrt((writing.room ?? 1) * riseOf(writing)), choice.size) })
  }

  const stopDragging = (e: React.PointerEvent<HTMLElement>): void => {
    if (armed.current !== null) {
      window.clearTimeout(armed.current)
      armed.current = null
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    held.current = null
    // WHERE THE EDGE LEFT THE CARD IS WRITTEN DOWN, the same way a long press writes where a finger
    // left it. Without this the card is drawn where the reader put it and goes back on the next
    // layout, which is a drag that half worked.
    if (moved.current) {
      moved.current = false
      place?.putDown()
    }
  }

  return (
    <>
      {CARD_GRIPS.filter((grip) => place !== undefined || !aGripThatMoves(grip)).map((grip) => (
        <span
          key={grip.at}
          // `nodrag` and `nopan` are React Flow's own words for "this press is not the canvas's".
          className={`gx-grip gx-grip-${grip.at} nodrag nopan`}
          data-grip={grip.at}
          role="separator"
          aria-label={t('g7b.CardFace.drag_it_to_move_that_edge_alone', { v1: GRIP_WORDS[grip.at] })}
          /* THE SENTENCE IS WRITTEN HERE RATHER THAN LOOKED UP IN A TABLE. The sentence gate, a
             test deleted on 12 November 2026, exempted a sentence at a `title` and could not follow a
             table: eight strings in one landed on its allowlist as eight new sentences in the
             interface. A tooltip is not a paragraph on the page, and this is the channel the
             contract names for one, so it is said where the contract can see it. */
          title={t('g7b.CardFace.drag_it_and_that_part_of_the', { v1: GRIP_WORDS[grip.at] })}
          style={{ cursor: grip.cursor }}
          onPointerDown={startDragging}
          onPointerMove={keepDragging(grip)}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        />
      ))}
    </>
  )
}

/** What each grip is called, in words a person would use for that part of a box. */
const GRIP_WORDS: Readonly<Record<CardGrip['at'], string>> = {
  get left() { return t('g7b.CardFace.the_left_edge_of_this_card') },
  get right() { return t('g7b.CardFace.the_right_edge_of_this_card') },
  get top() { return t('g7b.CardFace.the_top_edge_of_this_card') },
  get bottom() { return t('g7b.CardFace.the_bottom_edge_of_this_card') },
  get 'top-left'() { return t('g7b.CardFace.the_top_left_corner_of_this_card') },
  get 'top-right'() { return t('g7b.CardFace.the_top_right_corner_of_this_card') },
  get 'bottom-left'() { return t('g7b.CardFace.the_bottom_left_corner_of_this_card') },
  get 'bottom-right'() { return t('g7b.CardFace.the_bottom_right_corner_of_this_card') },
}


/**
 * WHY THE DETAIL TICK CANNOT ACT ON THIS RECORD. THREE REASONS, THREE SENTENCES.
 *
 * The tick opens levels 4, 5 and 6, which are written by part. A record can be without them for
 * three different reasons and only one of them is something a reader can do anything about, so the
 * card says which. It used to say the first sentence in all three cases: a reader was told nobody
 * had written a record by part when the parts were stored and the record was simply shorter than
 * they are, and when the kind has no parts at all.
 */
const NOTHING_TO_TICK: Readonly<Record<LevelAbsence, string>> = {
  get notWritten() { return t('g7b.CardFace.nobody_has_written_this_record_by_part') },
  get tooShort() { return t('g7b.CardFace.this_record_is_too_short_for_levels') +
    t('g7b.CardFace.tick_to_show_a_level_longer_than') },
  get noPlace() { return t('g7b.CardFace.this_kind_of_record_has_no_parts') +
    t('g7b.CardFace.levels_written_by_part_cover_the_blocks') },
}

/** Why the detail tick cannot act while a level was chosen by hand: the hand is what is deciding. */
const A_LEVEL_WAS_CHOSEN =
  () => t('g7b.CardFace.this_card_is_at_a_level_you')

/**
 * THE STATE OF THIS RECORD, AS THE SHAPE IN THE CARD'S TOP-RIGHT CORNER — CRITERION D20.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS A PSEUDO-ELEMENT AND NOBODY COULD ASK IT ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * The shape was drawn by `.gx-card[data-state]::before`. A pseudo-element carries no title, no
 * accessible name and no place to hover, so the only thing a reader could do with the grey dot in
 * the corner was look at it and wonder what it stood for.
 *
 * IT IS AN ELEMENT NOW, and the shapes are exactly the ones the stylesheet already drew — the rules
 * moved from `.gx-card[data-state]::before` to `.gx-state-mark[data-state]` and nothing about them
 * changed. What is new is the name: the state in the reader's own word, and one sentence saying
 * that is what the shape is.
 *
 * WHERE THE CARD HAS ROOM FOR WORDS IT ALSO DRAWS THE STATE CHIP, and that is not the same fact
 * twice — the chip is the word in the card's head and this is the shape in its corner, which is
 * what a reader sees at the distances where no word fits. They are drawn from one value.
 */
export function StateMark({ state, word }: { state: string; word: string }) {
  return (
    <span
      className="gx-state-mark"
      data-state={state}
      title={t('g7b.CardFace.the_state_recorded_on_this_record', { v1: stateWord(word).text })}
      aria-label={t('g7b.CardFace.the_state_recorded_on_this_record', { v1: stateWord(word).text })}
      role="img"
    />
  )
}

export function CardFace({ node, onOpen, plan, restriction, here, says, choice, onChoose, opens, place }: CardData) {
  const card = cardAt(node, plan)
  /**
   * WHETHER THE WORDS RUN ON PAST THE BOTTOM OF THE CARD — CRITERION D40.
   *
   * D40 asks for a fade at the bottom THAT SHOWS THERE IS MORE. A fade drawn over blank space would
   * say there is more when there is not, which is the fake state this product's first invariant
   * bans, so it is measured rather than assumed: the words' own scroll height against the box they
   * are drawn in. A card nobody has dragged a height onto is never cut and is never measured.
   */
  const words = useRef<HTMLDivElement | null>(null)
  const [runsOn, setRunsOn] = useState(false)
  useLayoutEffect(() => {
    const box = words.current
    const more = box !== null && plan.height !== null && box.scrollHeight > box.clientHeight + 1
    setRunsOn((was) => (was === more ? was : more))
  })
  return (
    <>
      <div
        /* NOTHING AT ALL ON A CARD NOBODY HAS DRAGGED A HEIGHT ONTO: the stylesheet gives this
           display: contents, which takes it out of the layout entirely, so those cards are drawn
           exactly as they were before D40. It becomes a real box only on a card that has a height,
           and then it is the box the words are clipped to. The controls and the grips are OUTSIDE
           it, which is the whole reason it exists: they hang past the card's edges on purpose and
           clipping the card itself would cut them off. */
        className="gx-card-words"
        ref={words}
        data-more={runsOn ? '1' : undefined}
      >
      {node.state === null ? null : <StateMark state={node.state} word={stateWord(node.stateWord ?? node.state).text} />}
      <div className="gx-card-head">
        {card.ordinal === null ? null : <span className="gx-card-no num">{card.ordinal}</span>}
        {card.name === null ? null : (
          <button
            type="button"
            className="gx-card-title"
            onClick={() => onOpen(node.recordId)}
            title={opens}
            // WHICH STORED FIELD THIS NAME CAME FROM, and whether what is drawn is all of it.
            data-name-from={card.nameFrom}
            data-field={card.name.field}
          >
            {card.name.text}
          </button>
        )}
        {card.chip === null ? null : node.packageState === undefined ? (
          <StateChip state={card.chip.state} {...(card.chip.alarm === undefined ? {} : { alarm: card.chip.alarm })} />
        ) : (
          // A BLOCK ONE PACKAGE NAMES says that package's state, on the block's own state colour.
          <PackageStateChip state={card.chip.state} packageState={node.packageState} alarm={card.chip.alarm} />
        )}
      </div>
      {/* THE COUNTS, AS NUMERALS AND SHAPES. `2 problems attached` is 19 characters drawn on 41
          cards; the same fact is a `2` beside the problem shape, and the sentence it came from is on
          the mark itself and printed whole in the reading layer. This is the owner's own example:
          open problems are a count or a status indicator, never a paragraph. */}
      {card.marks.length === 0 && restriction === null ? null : (
        <p className="gx-marks">
          {/* WHAT MAY NOT BE CLAIMED HERE, FIRST IN THE ROW.
              It is first because it is the only mark on this row that is about what the work can be
              used to say rather than about how much of it there is, and a reader scanning a drawing
              for blocking work should not have to read past three counts to find it. Its two
              channels are read from RESTRICTION_MARKS and neither is a hue: severity is a shape and
              a word, here as on the record page. The numeral is how many still stand and the shape
              is the worst of them. */}
          {restriction === null ? null : (
            <span
              className="gx-mark gx-mark-restricted"
              data-mark="restricted"
              data-severity={restriction.severity}
              data-glyph={restriction.glyph}
              data-edge={restriction.edge}
              title={`${restriction.word} — ${restriction.detail}`}
            >
              <span className="num">{restriction.count}</span>
            </span>
          )}
          {/* EVERY COUNT SAYS WHAT IT COUNTS — CRITERION D20. The sentence is on the mark for a
              reader who hovers, on `aria-label` for one who cannot, and the short word is drawn
              beside the numeral wherever the card has room for words. `card.ts` decides which cards
              those are, from the same flag that decides whether the record's own line is printed. */}
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
        </p>
      )}
      {/* WHO IS WORKING HERE, AND IT IS TWO FACTS AND NOT ONE WORD. See Presence.tsx: presence is
          an age banded into four words, the stage is where the work stands, and a domain with no
          sign of work for days draws nothing at all rather than a fainter mark. */}
      <PresenceRow here={here} says={says} />
      {/* THE ONLY COUNTS THAT EARN WORDS are the ones standing in for lines this drawing holds back.
          A `carries` line is not drawn until a card is pressed, so `carries 7 steps` is the only
          place on the whole picture that number appears. Everything else is a mark above. */}
      {card.badges.length === 0 ? null : (
        <p className="gx-badges">
          {card.badges.map((badge) => (
            <span className="gx-badge" key={badge.key} data-alarm={badge.alarm} title={badge.full}>
              {badge.short}
            </span>
          ))}
        </p>
      )}
      <CardSays node={node} plan={plan} card={card} choice={choice} onChoose={onChoose} onOpen={onOpen} />
      </div>
      <CardControlsLayer node={node} plan={plan} choice={choice} onChoose={onChoose} place={place} />
    </>
  )
}

/**
 * WHAT A NODE SAYS BELOW ITS TITLE LINE, AND THE CONTROLS THAT MOVE IT. One component, two callers.
 *
 * THE PIPELINE BOX IS A NODE TOO. It is drawn as a frame with its steps inside it rather than as a
 * card, so `Canvas.tsx` builds its head itself — but what it says at levels 4 to 6, what it says
 * about a level nobody wrote, and the controls the reader moves it with are the same thing on both.
 * A second copy for the box would be the second implementation criterion D10 forbids: the graph
 * is one thing everywhere, and only its default settings differ.
 */
export function CardSays({
  node,
  plan,
  card,
  choice,
  onChoose,
  onOpen,
}: Pick<CardData, 'node' | 'plan' | 'choice' | 'onChoose' | 'onOpen'> & { card: CardContent }) {
  return (
    <>
      {/* THE CARD'S OWN STYLESHEET, hoisted into the head by its href and drawn there once. It is
          here because every card and every pipeline box draws this component. */}
      <style href="mole-office-card" precedence="default">
        {CARD_CSS}
      </style>
      {/* THE RECORD'S OWN LINE ABOUT ITSELF, at level 3 — the characters in the `summary` column,
          byte for byte. It is here rather than in the card's own markup because the pipeline box
          reaches level 3 too, and a box that said `Conclusion` on its level control and drew no
          conclusion was the two of them disagreeing about one level. */}
      {card.body === null ? null : (
        <p className="gx-card-body" data-field={card.body.field}>
          {card.body.text}
        </p>
      )}
      {/* THE RECORD WRITTEN BY PART, at levels 4, 5 and 6 — the same headings and texts the report
          page draws, out of the same `reportAt`.

          EACH PART DECLARES ITSELF, so a comment right-clicked onto one is filed against THAT PART
          and not against the whole record. `theRegion` and `partRegionId` are the two functions the
          report page uses for the same job, and using them here is what makes a comment written on
          a card and a comment written on the report page name the same thing. */}
      {card.parts.map((part) => (
        <div
          key={part.id}
          className="gx-card-part"
          {...theRegion(node.recordId, partRegionId(part.id))}
          {...drawnFrom(part.headingField)}
        >
          <p className="gx-part-heading">{part.heading}</p>
          {part.text === null ? null : (
            <p className="gx-part-text" {...(part.field === null ? {} : drawnFrom(part.field))}>
              {part.text}
            </p>
          )}
        </div>
      ))}
      {/* THE RECORDS THIS CARD CONTAINS, DRAWN AS SMALLER CARDS INSIDE IT — D28. A module card
          enlarged past level 3 with the detail tick draws its `part_of` children, each at its own
          level 1, in the order `partsOf` gave them. Shrinking below that hides them again: this is
          the only thing in the card that depends on the level, and nothing below it changes. */}
      <NestedCards node={node} plan={plan} onOpen={onOpen} />
      {/* A LEVEL ASKED FOR BY NAME THAT NOBODY WROTE. It says so, and nothing lower is drawn in its
          place: a level a person picks that does not exist is shown as not existing. */}
      {card.missing === null ? null : (
        <p className="gx-card-unwritten" data-level={card.missing.level} data-why={card.missing.why}>
          {notWrittenHere(card.missing)}
        </p>
      )}
    </>
  )
}

/**
 * THE RECORD'S NAME AT LEVEL 1, read out of the same short-form reader a card's own level 1 uses.
 *
 * A label where somebody wrote one, and the record's own title where nobody did — the same two
 * answers `cardAt` draws at `smallest`. Null only when the title column is blank, which no live
 * record has; a card with no name at all would be the identity invariant broken, so the caller
 * draws the record id rather than an empty box.
 */
function levelOneName(record: Parameters<typeof wordsAt>[0]): string | null {
  const label = wordsAt(record, 'label')
  if (label.kind === 'text' && label.text.trim() !== '') return label.text
  return record.title.trim() === '' ? null : record.title
}

/**
 * THE RECORDS ONE CARD CONTAINS, DRAWN INSIDE IT — D28.
 *
 * THEY ARE DRAWN ONLY ON A MODULE CARD AT A LEVEL WRITTEN BY PART. `plan.level` is a by-part level
 * only when the detail tick is on and the card has been enlarged past the level-3 step, and
 * `containsOn` in model.ts opens those levels for a module with children even where nobody wrote a
 * summary block. So this is exactly "enlarged beyond level 3 with the detail tick", and shrinking
 * back hides them because `plan.level` leaves the by-part levels.
 *
 * THE ORDER IS `node.contains`'S, which is `partsOf`'s order. NOTHING HERE SORTS, and nothing here
 * names that order: the cards simply appear in it.
 *
 * EACH CHILD IS A CARD: it draws its record's level-1 name, and its own press opens its record.
 * THE CHILD IS NOT A NODE ON THE DRAWING, so it cannot itself be enlarged and it draws no controls
 * of its own. That is a measurement and not a hidden cap; see the report.
 */
function NestedCards({
  node,
  plan,
  onOpen,
}: Pick<CardData, 'node' | 'plan' | 'onOpen'>) {
  const byPart = plan.level !== null && CARD_DETAIL_LEVELS.includes(plan.level)
  if (node.kind !== 'module' || !byPart || node.contains.length === 0) return null
  return (
    <div className="gx-nested" data-count={node.contains.length}>
      {node.contains.map((part) => {
        const name = part.record === null ? part.title : (levelOneName(part.record) ?? part.record.title)
        return part.record === null ? (
          <span className="gx-nested-card" data-record={part.id} data-missing="1" key={part.id}>
            <span className="gx-nested-name">{name}</span>
          </span>
        ) : (
          <button
            type="button"
            className="gx-nested-card"
            key={part.id}
            data-record={part.record.id}
            title={t('g7b.CardFace.open', { v1: part.record.title })}
            onClick={(event) => {
              // A PRESS ON A CHILD IS NOT A PRESS ON THE CARD. Without this the card's own focus
              // handler sees the same click and takes the focus off the card the reader is reading.
              event.stopPropagation()
              onOpen(part.record?.id ?? part.id)
            }}
          >
            <span className="gx-nested-name">{name}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * THE CONTROLS AND THE EDGES OF ONE NODE, drawn over it — the layer, so both callers get both.
 *
 * IT IS NOT INSIDE `CardSays`, AND THAT IS THE PIPELINE BOX'S DOING. A box draws its words in its
 * head and its steps below that, so a strip hanging off the head hangs over the first step — a
 * browser test found three of its four controls landing on a step instead of on themselves. The box
 * hangs this off the whole box; a card hangs it off the card; and both get it from here.
 */
export function CardControlsLayer({
  node,
  plan,
  choice,
  onChoose,
  place,
}: Pick<CardData, 'node' | 'plan' | 'choice' | 'onChoose' | 'place'>) {
  return (
    <>
      {plan.tier === 'selected' ? <CardControls node={node} plan={plan} choice={choice} onChoose={onChoose} /> : null}
      <CardGrips node={node} plan={plan} choice={choice} onChoose={onChoose} place={place} />
    </>
  )
}

/**
 * WHAT A CARD DRAWS WITH NO WORDS AT ALL, which is every attribute below.
 *
 * At R0 an object is its shape and nothing else, and every one of these is a shape rather than a
 * character: the kind is the outline, the state is the fill and a mark in the corner, a block
 * holding a pipeline of its own is a stack, a step at a wall carries the wall mark, and a block
 * nobody is recorded as carrying is marked unowned. `data-card-rung` and `data-tier` are what the proof
 * reads to say the roles changed — by role, not by length.
 */
/**
 * WHAT A PRESS ON THIS CARD IS ABOUT, AND IT IS THE CARD AND NEVER THE PAGE.
 *
 * Before this, `grep -rn 'data-target' src/web/components/graph/` returned nothing, so the walk up
 * from the pixel somebody right-clicked ran past every card and stopped at `page/…`. A comment about
 * one block of one pipeline was filed against the whole pipeline page, silently and without
 * erroring, which is why a dogfood recorded that as working.
 *
 * A STEP CARD CARRIES ITS OWN RECORD ID AND NOT ITS PIPELINE'S. `model.ts` sets a step's `recordId`
 * to the block's own record, and that is what makes this the card rather than one identifier short
 * of it. Every kind of card goes through this one function, so a new one cannot be drawn without a
 * target — the pipeline box draws a different element and calls the same thing.
 */
export function cardTarget(node: GraphNode): Record<string, string> {
  return targetAttributes({ kind: 'record', recordId: node.recordId, workspaceId: currentWorkspace() })
}

export function markAttributes(data: CardData): Record<string, string | undefined> {
  const node = data.node
  return {
    ...cardTarget(node),
    'data-kind': node.kind,
    'data-alarm': node.alarm,
    'data-emphasis': node.presentation.emphasis ?? undefined,
    'data-role': node.presentation.role,
    'data-lit': data.lit ? '1' : undefined,
    [CARD_RUNG_ATTRIBUTE]: data.plan.rung,
    // WHICH READING LENGTH THIS CARD DREW, on the attribute the reader of a view reads.
    //
    // A CARD USED TO WRITE NEITHER, AND THEN ONE OF THEM. Until 30 August 2026 a card wrote its
    // nine-position card rung into `data-rung`, which the reader cannot place, so every comment
    // right-clicked onto a card was stored with no view and nothing said so. Splitting the
    // attributes made the silence honest: `data-card-rung` is the card's own position and nothing
    // read it, and the card wrote no reading length at all because it had none — every card on a
    // drawing was at whatever the drawing was at.
    //
    // A CARD HAS ONE NOW. `plan.level` IS a position of the reading ladder — the one this card is
    // at, after its size, its detail tick and any level its reader chose — so this is that fact
    // written onto the card, through `drawnAtLength`, which is the one function that writes it.
    // Nothing is mapped or translated: the two vocabularies stay two, on two attributes.
    ...(data.plan.level === null ? {} : drawnAtLength(data.plan.level)),
    // WHICH BOX ON THE DRAWING THIS CARD IS IN, so a comment can say it. The drawing writes which
    // drawing it is, once, on the element every card is inside; this cannot be written that way,
    // because React Flow lays a group's children out as its siblings and a walk up from a step
    // card never meets its pipeline box. `drawnat.ts` says so beside the attribute.
    ...drawnInside(node.inside),
    'data-tier': data.plan.tier,
    'data-earns': data.plan.earns ?? undefined,
    // THE STATE, AS FILL AND A SHAPE. Below R4 there is no state word anywhere on the card, so this
    // is the whole of it — and it is a shape as well as a hue, because the far view now depends on
    // marks entirely and a state told only in colour is the one thing this product's contract bans.
    'data-state': node.state ?? undefined,
    // A BLOCK THAT HOLDS A PIPELINE OF ITS OWN IS NOT DRAWN LIKE A LEAF: a stack of paper rather
    // than a sheet, which survives greyscale and spends no colour.
    'data-holds': node.holds.length > 0 ? String(node.holds.length) : undefined,
    // WHICH SIDE OF THE WALL. It used to be three words on the card — `as far as you may go` — on
    // six step cards of one pipeline. The side is a mark now, and the sentence naming the records
    // whose gates put it there is in the reading layer.
    'data-wall': node.wall?.at ?? undefined,
    // NOBODY IS RECORDED AS CARRYING THIS BLOCK. It was a 187-character sentence drawn on 27 cards,
    // which was the single largest piece of prose on the canvas. The same fact is this mark plus the
    // absence of any carries line, and the sentence is on the record and in the reading layer.
    'data-unowned': node.carriedBy !== null && node.carriedBy.length === 0 ? '1' : undefined,
  }
}

// ============================================================================ the card's own CSS

/**
 * THE STATE OF THE PACKAGE A BLOCK NAMES, DRAWN WHOLE, on the block's own state colour. The plan's card and the plan's
 * list both draw it. A chip holds its word to one line and cuts it with an ellipsis, and that cut "returned to the
 * taker" on the card and in the list's state column. This chip's word wraps instead, so a narrow card or column draws
 * it on two lines. Its rules are its own, and not in CARD_CSS below, because the plan's list draws it with no card.
 */
export function PackageStateChip({ state, packageState, alarm }: { state: PanelState; packageState: PackageState; alarm: AlarmLevel | undefined }) {
  return (
    <span className="gx-package-state">
      <style href="mole-office-package-state" precedence="default">
        {PACKAGE_STATE_CSS}
      </style>
      <StateChip state={state} label={packageStateWord(packageState).text} {...(alarm === undefined ? {} : { alarm })} />
    </span>
  )
}

const PACKAGE_STATE_CSS = `
.gx-package-state { display: inline-flex; min-width: 0; max-width: 100%; }
.gx-package-state .px-chip { white-space: normal; }
.gx-package-state .px-chip-word { overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
`

/**
 * THE SHARED CARD'S OWN RULES, AND THE ONLY PLACE THEY ARE WRITTEN (problem Cr5JxwaYqink).
 *
 * Every class this file draws inside a card is styled here: the head, the name, the marks, the
 * badges, the record's own line and its parts, the cards it contains, the line saying a level is
 * not written, the state mark, the controls, the grips, and the row saying who is working here.
 *
 * THEY USED TO LIVE IN THE MODULE DRAWING'S STYLESHEET, in Canvas.tsx and StructureView.tsx. The
 * plan drawing draws this same card and loads neither, so it restated eleven of these rules in its
 * own stylesheet and drew the rest with the browser's defaults. Measured on it before this change:
 * the line saying a level is not written had no margin and the wrong colour.
 *
 * CardSays loads it, and CardSays is drawn by every card and by the pipeline box, so a place that
 * draws the card gets its look without restating it. React 19 hoists a style element that has an
 * href into the head of the page and draws it once however many cards load it.
 *
 * WHAT IS NOT HERE is the box round the card, because each drawing draws its own: the module
 * drawing's box is the gx-card element in Canvas.tsx and StructureView.tsx, and the plan drawing's
 * is the pg-cc element in PlanGraph.tsx. A rule that reads that box, such as the grips showing when
 * the pointer is over a card of the module drawing, stays with the drawing. So does a place's own
 * override, such as the plan drawing's tighter gaps. That box must be position: relative, because
 * the state mark, the controls and the grips are placed against it.
 */
const CARD_CSS = `
.gx-card-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin-bottom: 4px; }
.gx-card-no { font-size: var(--fs-1); font-weight: 700; color: var(--text-3); }
.gx-card-title {
  font: inherit;
  font-size: var(--fs-2);
  font-weight: 700;
  color: var(--text);
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  cursor: pointer;
  /* Titles hold mixed script. No uppercase, no letter-spacing, no truncation: it wraps. */
  overflow-wrap: anywhere;
  min-width: 0;
}
.gx-card-title:hover { text-decoration: underline; text-underline-offset: .16em; }

/* The record's own line about itself, drawn on a card only at the two closest distances. It is the
   stored summary column and nothing else, so it is set as prose and never as a label. */
.gx-card-body {
  margin-top: 5px;
  font-size: var(--fs-1); line-height: 1.45;
  color: var(--text-2);
}

/* THE RECORD WRITTEN BY PART, at levels 4, 5 and 6. Each part is its own block on the card, so a
   press lands on the part and not on the card around it, and the heading reads as a heading. */
.gx-card-part { margin-top: 6px; }
.gx-part-heading {
  font-size: var(--fs-1); line-height: 1.4; font-weight: 600;
  color: var(--text);
}
.gx-part-text {
  margin-top: 2px;
  font-size: var(--fs-1); line-height: 1.45;
  color: var(--text-2);
}

/* THE RECORDS A CARD CONTAINS, DRAWN AS SMALLER CARDS INSIDE IT — D28. They sit under the record's
   own parts. Each is a card: the same border, the same radius and the same background as the card
   around it, at a smaller size, so a reader sees boxes within a box and not a list of words. They
   have no controls of their own: the only thing a child card does is open its record. */
.gx-nested {
  display: flex; flex-wrap: wrap; gap: 4px;
  margin-top: 8px; padding-top: 6px;
  border-top: var(--border-w) solid var(--border);
}
.gx-nested-card {
  display: block; max-width: 100%;
  padding: 3px 6px;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-2);
  font-size: var(--fs-1); line-height: 1.35; text-align: left;
}
button.gx-nested-card { cursor: pointer; }
button.gx-nested-card:hover { border-color: var(--text-3); color: var(--text); }
.gx-nested-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* A LEVEL SOMEBODY ASKED FOR BY NAME THAT NOBODY WROTE. It is a statement about the record and not
   a fault, so it is set like the record's own line and marked by its dotted rule rather than by a
   colour this canvas reserves for state. */
.gx-card-unwritten {
  margin-top: 5px; padding-top: 4px;
  border-top: var(--border-w) dashed var(--border);
  font-size: var(--fs-1); line-height: 1.45;
  color: var(--text-3);
}

/* THE CONTROLS ON THE CARD THE READER PRESSED: how much room it has, and how much it says.
   It sits under everything the card draws, wraps, and is set at the smallest size on the card: it
   is machinery beside the words, and the words are what the card is for. */
/* The focused card's controls sit outside its layout box, so pressing one does not resize the card
   or move other boxes (criterion D12).

   THE STRIP IS EXACTLY AS WIDE AS THE CARD, AND ITS CONTENTS WRAP. It used to be as wide as its
   contents, up to 320px. On a card near the right edge of the drawing it then ran past the edge of
   the canvas, which clips, and the level control was cut in half: a control no press could reach.
   Held to the card's own width, it is clipped only when the card is.

   THE HOLDER COVERS THE CARD EXACTLY (inset: 0), so the detail tick sits at the card's own
   bottom-right corner and the strip hangs off the card's own bottom edge. When the holder was the
   strip itself, offset below the card, the tick was drawn at the strip's bottom-right, on top of
   the strip's buttons. A browser test caught it by asking what a press at the middle of each would
   land on. */
.gx-card-controls {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.gx-card-controls > * { pointer-events: auto; }

/* The detail tick stays at the card's bottom-right corner, clear of the strip below it. */
.gx-card-corner {
  position: absolute;
  right: 4px; bottom: 4px;
  z-index: 7;
}
.gx-card-strip-holder {
  position: absolute;
  top: 100%; left: 0; right: 0;
  margin-top: 4px;
  z-index: 6;
}
/* A card near a clipped edge puts its strip above the card. A pipeline box puts it in the head,
   above the steps. */
.gx-card-strip-holder[data-side='above'] {
  top: auto; bottom: 100%;
  margin-top: 0; margin-bottom: 4px;
}
.gx-card-strip-holder[data-side='head'] {
  top: auto; bottom: 100%;
  left: auto; right: 4px;
  width: max-content;
  margin: 0 0 4px 0;
}
/* ONE ROW IN THE HEAD, because a second row reaches down into the band the first step is drawn in
   and a step is drawn above the box. A box is wider than this strip. */
.gx-card-strip-holder[data-side='head'] .gx-card-strip { flex-wrap: nowrap; }
.gx-card-corner .gx-card-tick {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 5px;
  font-size: var(--fs-1); line-height: 1.5; color: var(--text-2);
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.gx-card-corner .gx-card-tick[aria-disabled='true'] { color: var(--text-3); cursor: default; }

/* Eight resize handles sit outside the card's layout flow (criteria D13 and D29). They stay hidden
   until the card is hovered or focused, and touch-action keeps a phone drag on the handle.

   THE CORNERS ARE 14PX SQUARE AND THE EDGES START 12PX IN, so an edge and the corner beside it do
   not overlap. The corners also come last in the grip table (CARD_GRIPS above), so they are drawn after
   the edges and win anyway. */
.gx-grip {
  position: absolute;
  z-index: 5;
  touch-action: none;
  background: transparent;
}
.gx-grip-left { left: -4px; top: 12px; bottom: 12px; width: 9px; }
.gx-grip-right { right: -4px; top: 12px; bottom: 12px; width: 9px; }
.gx-grip-top { top: -4px; left: 12px; right: 12px; height: 9px; }
.gx-grip-bottom { bottom: -4px; left: 12px; right: 12px; height: 9px; }
.gx-grip-top-left { left: -4px; top: -4px; width: 14px; height: 14px; }
.gx-grip-top-right { right: -4px; top: -4px; width: 14px; height: 14px; }
.gx-grip-bottom-left { left: -4px; bottom: -4px; width: 14px; height: 14px; }
.gx-grip-bottom-right { right: -4px; bottom: -4px; width: 14px; height: 14px; }

.gx-grip:hover { opacity: 1 !important; }
.gx-card-strip {
  display: flex; flex-wrap: wrap; align-items: center; gap: 3px;
  padding: 4px 6px;
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--elev-2);
  font-size: var(--fs-1); line-height: 1.5;
}
.gx-card-axis { color: var(--text-3); margin-right: 1px; }
.gx-card-axis:not(:first-child) { margin-left: 5px; }
.gx-card-at { color: var(--text); font-weight: 600; min-width: 3.2em; text-align: center; }
.gx-card-strip button {
  min-width: 20px; padding: 0 5px;
  font: inherit; color: var(--text);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.gx-card-strip button[aria-disabled='true'] { color: var(--text-3); cursor: default; }
/* THE UNFOLD THAT HOLDS THE HAND CONTROL. It reads as a word rather than as a button of its own,
   because it is a way in to something rather than an action on the drawing. */
.gx-card-unfold { color: var(--text-3); }
.gx-card-strip button:hover:not([aria-disabled='true']) { background: var(--panel-3, var(--panel)); }
/* THE TICK, AS A SHAPE. On or off is a box that is filled or empty, which survives greyscale and
   spends none of the colour this canvas keeps for state. */
.gx-card-tick { display: inline-flex; align-items: center; gap: 4px; }
.gx-tick {
  width: 9px; height: 9px; flex: none;
  border: 1.5px solid var(--text-2);
  border-radius: 2px;
  background: transparent;
}
.gx-tick[data-on] { background: var(--text); border-color: var(--text); }

/* The state marker is an element so it can carry an accessible name and hover title (criterion D20). */
.gx-state-mark {
  position: absolute; top: 6px; right: 6px;
  width: 9px; height: 9px;
  border: 1.5px solid var(--text-3);
  background: transparent;
  /* It takes the pointer so its hover title can be read. */
  pointer-events: auto;
}

/* THE BOX THE WORDS ARE CUT TO, AND NO BOX AT ALL UNTIL SOMEBODY CUTS THEM. CardFace draws its words
   inside it; display: contents takes it out of the layout, so the card is drawn as if it were not
   there. The module drawing makes it a real box on a card the reader dragged a height onto, with
   its own rule in Canvas.tsx. */
.gx-card-words { display: contents; }

.gx-state-mark[data-state='todo'] { border-radius: 50%; }
.gx-state-mark[data-state='doing'] { border-radius: 50%; background: linear-gradient(90deg, var(--text-2) 50%, transparent 50%); }
.gx-state-mark[data-state='done'] { border-radius: 50%; background: var(--text-2); border-color: var(--text-2); }
.gx-state-mark[data-state='blocked'] { border-radius: 1px; background: var(--st-blocked); border-color: var(--st-blocked); }
.gx-state-mark[data-state='failed'] { border: none; background: var(--st-failed); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.gx-state-mark[data-state='broken'] { border-radius: 1px; border-style: dashed; }
.gx-state-mark[data-state='inferred'] { border-radius: 50%; border-style: dotted; }
.gx-state-mark[data-state='overdue'] { transform: rotate(45deg); background: var(--st-failed); border-color: var(--st-failed); }
.gx-state-mark[data-state='running'] { border: none; background: var(--st-doing); clip-path: polygon(0 0, 100% 50%, 0 100%); }
.gx-state-mark[data-state='crashed'] {
  border: none;
  background:
    linear-gradient(45deg, transparent 42%, var(--st-failed) 42%, var(--st-failed) 58%, transparent 58%),
    linear-gradient(-45deg, transparent 42%, var(--st-failed) 42%, var(--st-failed) 58%, transparent 58%);
}

/* A COUNT, DRAWN AS A NUMERAL AND A SHAPE. "2 problems attached" is 19 characters on 41 cards;
   "2 of 3 done", "carries 2 steps" and "4 items stopped short" are the same bargain. The numeral is
   five characters at most and the shape says which count it is; the sentence behind it is on the
   mark, reachable, and printed in full in the reading layer. */
.gx-marks { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.gx-mark {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: var(--fs-1); line-height: 1.4;
  color: var(--text-2);
}
.gx-mark::before {
  content: '';
  width: 8px; height: 8px;
  border: 1.5px solid var(--text-3);
  flex: none;
}
.gx-mark[data-mark='progress']::before { border-radius: 50%; background: linear-gradient(90deg, var(--text-3) 50%, transparent 50%); }
.gx-mark[data-mark='stopped']::before { border: none; background: var(--st-failed); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.gx-mark[data-mark='carries']::before { border-radius: 1px; border-style: solid; background: var(--panel-2); }
.gx-mark[data-mark='attached']::before { border-radius: 50%; border-style: dashed; }
.gx-mark[data-mark='holds']::before { border-radius: 1px; box-shadow: 2px 2px 0 0 var(--panel), 2px 2px 0 1px var(--text-3); }
.gx-mark[data-mark='loose']::before { border: none; border-top: 1.5px dashed var(--text-3); height: 0; align-self: center; }
.gx-mark[data-mark='unowned']::before { border-radius: 50%; border-style: dotted; }
.gx-mark[data-mark='walled']::before { border: none; border-left: 3px solid var(--st-blocked); width: 3px; height: 9px; }
.gx-mark[data-mark='folded']::before { border-radius: 1px; background: repeating-linear-gradient(0deg, var(--text-3) 0 1px, transparent 1px 3px); }
/* THE WORD BESIDE A COUNT — CRITERION D20. Quieter than the numeral, because the numeral is the
   fact and this says which fact it is. Drawn only where card.ts says the card has room for words. */
.gx-mark-word { color: var(--text-3); }
.gx-mark[data-alarm='urgent'], .gx-mark[data-alarm='raised'] { color: var(--st-failed); font-weight: 700; }
.gx-mark[data-alarm='urgent']::before, .gx-mark[data-alarm='raised']::before { border-color: var(--st-failed); }

/* WHAT MAY NOT BE CLAIMED HERE, AS A SHAPE WITH NO HUE IN IT.
   The two attributes are read off the restriction table in src/shared/restriction.ts and are never
   chosen in this stylesheet: data-glyph is that entry's glyph and data-edge is its edge. Severity is
   a shape and a word here, exactly as it is on a record page, and it is never a colour — seven
   palettes times three severities is twenty-one hexes and a collision census, for a fact three
   shapes already carry.

   THE GLYPH IS THE INSIDE OF THE BOX AND THE EDGE IS ITS BORDER, which is what lets the least
   serious and the most serious differ in both at once. barred is a bar across it, doubled is two
   bars, hollow is empty; solid, underline and none are the border. */
.gx-mark[data-mark='restricted'] { color: var(--text); font-weight: 600; }
.gx-mark[data-mark='restricted']::before {
  border-radius: 1px;
  border: 1.5px solid var(--text-2);
  background: var(--panel);
}
.gx-mark[data-mark='restricted'][data-glyph='barred']::before {
  background: linear-gradient(0deg, transparent 0 40%, var(--text) 40% 60%, transparent 60% 100%);
}
.gx-mark[data-mark='restricted'][data-glyph='doubled']::before {
  background: linear-gradient(0deg, transparent 0 20%, var(--text) 20% 36%, transparent 36% 64%, var(--text) 64% 80%, transparent 80% 100%);
}
.gx-mark[data-mark='restricted'][data-glyph='hollow']::before { background: transparent; }
.gx-mark[data-mark='restricted'][data-edge='solid']::before { border-width: 2.5px; border-color: var(--text); }
.gx-mark[data-mark='restricted'][data-edge='underline']::before { border: none; border-bottom: 2.5px solid var(--text); height: 9px; }
.gx-mark[data-mark='restricted'][data-edge='none']::before { border-style: dotted; }

/* The counts on a card: two or three words each, loudest first. */
.gx-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }

/* WHO IS WORKING ON THIS CARD.
   TWO FACTS AND NOT ONE WORD: data-presence is whether anybody is here, banded from an age, and
   data-stage is where the work stands. Neither is drawn as a hue alone — presence is the SIZE and
   the fill of the marker, stage is what the hover says.

   A stale or never-seen domain reaches this stylesheet only from Inspect. On an ordinary card it is
   filtered out in Presence.tsx before anything is drawn, because a fainter mark on every card in a
   project with forty old domains is a session graveyard one shade lighter. */
.gx-presence { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
.gx-here { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-1); line-height: 1.4; color: var(--text-2); }
.gx-here-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; border: 1.5px solid var(--text-3); }
.gx-here[data-presence='live'] .gx-here-dot { width: 8px; height: 8px; background: var(--st-running, var(--text)); border-color: var(--st-running, var(--text)); }
.gx-here[data-presence='quiet'] .gx-here-dot { background: transparent; border-color: var(--text-2); }
.gx-here[data-presence='stale'] .gx-here-dot, .gx-here[data-presence='never'] .gx-here-dot { border-style: dotted; }
.gx-here-who { font-weight: 600; color: var(--text); }
.gx-here-age { color: var(--text-3); }
.gx-presence[data-shows='markers'] .gx-here { gap: 0; }

/* WHERE TWO WORK DOMAINS MEET, AS A SHAPE WITH NO HUE IN IT.
   The three attributes are read off OVERLAP_MARKS in src/shared/workdomain.ts and are never chosen
   here: data-form is that rank's form, data-glyph its glyph and data-edge its edge. Rank is a shape
   and a word, never a colour — the family's own signature is the round glyph, which no other inline
   mark family in this product uses. */
.gx-mark[data-mark='overlap'] { color: var(--text); font-weight: 600; }
.gx-mark[data-mark='overlap']::before { border-radius: 2px; border: 1.5px solid var(--text-2); background: var(--panel); }
.gx-mark[data-mark='overlap'][data-form='block']::before { background: var(--text-2); border-color: var(--text-2); }
.gx-mark[data-mark='overlap'][data-form='text']::before { border: none; background: transparent; }
.gx-mark[data-mark='overlap'][data-edge='underline']::before { border: none; border-bottom: 2.5px solid var(--text-2); height: 9px; }
.gx-mark[data-mark='overlap'][data-glyph='disc']::before { box-shadow: inset 0 0 0 1.5px var(--panel), inset 0 0 0 4px var(--text); }
.gx-mark[data-mark='overlap'][data-glyph='ring']::before { box-shadow: inset 0 0 0 1.5px var(--panel), inset 0 0 0 3px var(--text-2); }
.gx-mark[data-mark='overlap'][data-glyph='dot']::before { box-shadow: inset 0 0 0 2.5px var(--panel), inset 0 0 0 4px var(--text-2); }
.gx-mark[data-mark='overlap'][data-rank='4'] { color: var(--st-failed); }
.gx-mark[data-mark='overlap'][data-rank='4']::before { background: var(--st-failed); border-color: var(--st-failed); }
.gx-badge {
  display: inline-flex; align-items: center;
  padding: 0 6px;
  font-size: var(--fs-1); line-height: 1.5;
  color: var(--text-2);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.gx-badge[data-alarm='urgent'] { color: var(--st-failed); border-color: var(--st-failed-line); font-weight: 700; }
.gx-badge[data-alarm='raised'] { color: var(--st-failed); border-color: var(--st-failed-line); }
`
