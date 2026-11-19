// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT DRAWS THE COMPOSER, AND THE CONTROL THAT SAYS POINTING EXISTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT REPLACED WHAT
 * ---------------------------------------------------------------------------------------
 *
 * Round seven gave each surface its own wiring: a hook call, a set of props to spread and a button
 * to render, per component. Five components did it. This is one component, mounted once by the
 * shell — and every element that says what it is, anywhere in the product, is addressable through
 * it. See components/agent/pointing.ts for the reading, and src/shared/targets.ts for the three
 * attributes an element carries.
 *
 * THIS FILE HOLDS NO STATE AND READS NO GESTURE. Both moved to components/agent/open.ts, which is
 * where the listeners are attached and where `openAbout` decides what a gesture means. This file
 * subscribes to what that decided and draws it. The two used to be one file and the composer's four
 * opening lines were written twice inside it; open.ts says what that cost.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO WAYS IN, AND WHY EACH ONE IS THERE
 * ---------------------------------------------------------------------------------------
 *
 * **Selecting words is not one of them, and that is the rule rather than a gap.** Until somebody
 * invokes, a selection draws nothing at all: no button beside the words, no chip, no cursor
 * change, no attribute, no announcement. An offer used to appear at the end of every finished
 * selection and it is gone — see the note at the end of this file. Selection alone adds nothing;
 * invoking may keep the selected words visible.
 *
 * **Right-click anything.** The fast way once somebody has learnt it.
 * Inside Mole Office it always opens the composer about something: the nearest thing under
 * the pointer that says what it is, and the page itself where nothing smaller does. It used to be
 * refused wherever nothing said what it was, which was nearly every pixel; step 16 gave the screen
 * its names and step 17 deleted the refusal. Shift and a right-click reaches the browser's own menu
 * on any pixel of any page, which is where paste, spelling, open-in-a-new-tab and the developer's
 * own menu still live.
 *
 * A LINK USED TO BE EXEMPT AND IS NOT ANY MORE. A link covered nearly every pixel of a row, which
 * left the gesture working only in blank space. An ordinary press on a link still navigates:
 * nothing here touches a press, only the menu.
 *
 * A BOX A PERSON TYPES IN IS EXEMPT, AND ON PURPOSE. The browser's own menu is where paste,
 * spell-check and look-up are, and until 21 August 2026 they were unreachable in every box in the
 * product. Contract 5.5, built in open.ts. The composer's own instruction box is the one exception,
 * because pointing at a phrase of what you are writing is how you revise it.
 *
 * **Press "Ask agent" in the frame.** The answer to "how would anybody know". It is a
 * control at rest on every page at every width, and pressing it does not open an empty box: the
 * page marks everything IT holds that can be talked about, and the next press on one of them is the
 * subject. It teaches by showing rather than by a sentence saying that right-clicking works. The
 * frame keeps its own presses throughout: the rail navigates, the Reviews switch opens the column,
 * and a second press of this control ends the mode. On a page holding nothing smaller than itself it
 * opens the box on the page instead, because marking nothing and waiting for a press is a dead end —
 * see `whatThePressDoes`, and `design/round-nine/step17-18-the-gate.md` §7.2 for the measurement
 * saying no route is in that state any more.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MUST NOT BREAK, AND HOW THAT IS KEPT
 * ---------------------------------------------------------------------------------------
 *
 * Selecting text still selects text and Mole Office draws nothing while it happens: nothing in this file
 * or in open.ts listens for a selection, calls preventDefault on a press, a drag or a key, or
 * changes an attribute while words are being chosen. Copy is untouched. A link still navigates on an
 * ordinary press. The browser's own menu is one Shift away everywhere, and a long-press on a touch
 * or pen pointer is not taken at all, so selecting a word on a screen without a mouse still works
 * the way the platform makes it work.
 *
 * ---------------------------------------------------------------------------------------
 * THE COMPOSER'S OWN BOX IS ADDRESSABLE NOW, AND THAT IS PHASE 7
 * ---------------------------------------------------------------------------------------
 *
 * An instruction nobody has sent is one of the fourteen things a person can point at, so the box it
 * is written in carries a `data-target` like anything else. Pointing at a phrase inside your own
 * unsent instruction is therefore read by the same listener, resolved by the same walk up the tree
 * and placed by the same span arithmetic as pointing at a paragraph of a report. Nothing here knew
 * that it was going to have to work, and it did.
 *
 * WHAT IS DIFFERENT IS ONLY WHERE THE ANSWER GOES. A draft is handed back to the composer that is
 * already open, as a request to change the instruction in it, rather than opening a second composer
 * on top of the first. The composer is never replaced, so what it was about and who it was for are
 * never let go of — see `askedChange` in open.ts and `ChangeAsked` in TalkBox.tsx.
 *
 * WHAT IT COSTS is paste-by-right-click inside that one box. Ctrl and V still work and Shift with a
 * right-click still reaches the browser's own menu, which is the same trade this layer already made
 * for every row in the product.
 */

import { createRef, useEffect } from 'react'
import { t } from '@shared/i18n.ts'
import { AGENT_CSS } from './agent-css.ts'
import { lookupKey } from './context.ts'
import { TalkBox, type SelectedWords } from './TalkBox.tsx'
import { pointableInThePage, type Pointed } from './pointing.ts'
import {
  closeTheComposer,
  openAbout,
  showWhatCanBeTalkedAbout,
  startDispatch,
  stopChanging,
  stopShowing,
  useComposer,
  useShowingWhatCanBeTalkedAbout,
} from './open.ts'

/**
 * WHERE `askedChange` WENT AND WHY IT IS STILL NAMED HERE.
 *
 * It is dispatch — it decides which of two things a gesture opens — so it lives in open.ts beside
 * `openAbout`, the only caller. tests/an-unsent-instruction.test.ts reads it through this file, and
 * that test belongs to another step, so the name stays reachable from here until the test moves.
 * One definition, one behaviour: this is a re-export and not a second copy.
 */
export { askedChange } from './open.ts'

// ============================================================================ "show me what I can talk about"

/**
 * Whether anything on this page says what it is, asked of the page at the moment of the press.
 *
 * IT IS ASKED WHEN IT IS NEEDED AND NOT KEPT. A page fetches after it mounts, so a count kept in
 * state would read zero for the first frames of every visit and the control's own words would flip
 * under the reader's eye. One question at the press is the same answer with nothing to go stale.
 *
 * IT USED TO ASK THE WHOLE DOCUMENT, AND EMISSION MADE THAT ANSWER YES FOR EVER. Step 16 gave every
 * rail row a name, so from that commit there was a declared element on every route whatever the
 * page held, the third branch of `whatThePressDoes` became unreachable, and the control marked the
 * frame on a page with nothing of its own to point at — the dead end its own note says it never
 * walks into. `tests/a-review-starts-where-you-are-standing.test.ts` went red on that and stayed
 * red across two steps, because the two steps that broke it were told not to edit this file.
 */
export function somethingToPointAt(): boolean {
  return pointableInThePage().length > 0
}

/**
 * WHAT PRESSING THE CONTROL DOES, given what it is showing and what the page holds.
 *
 * Three answers, and the third is the one that was missing. `mark` marks everything addressable and
 * takes the next press as the subject. `stop` puts that away. `thePage` is what a page with nothing
 * smaller than itself has to offer, and it is answered by opening the box rather than by marking
 * nothing and waiting for a press that will be answered with the page anyway.
 */
export function whatThePressDoes(showing: boolean, anythingToPointAt: boolean): 'stop' | 'mark' | 'thePage' {
  if (showing) return 'stop'
  return anythingToPointAt ? 'mark' : 'thePage'
}

/**
 * THE CONTROL'S OWN WORDS, in one place because a test reads them and a browser draws them. They
 * come from the word lists, so they follow the page's language.
 *
 * The name says what the next press does, and the description says what happens on a page that has
 * nothing smaller than itself to point at — which is the case the control used to walk into. It
 * marked nothing, changed its name to "Press what you mean", and turned the next press into a
 * comment about the whole page. Nothing on the screen said any of that had happened.
 */
export function pointingControlWords(showing: boolean): { name: string; description: string } {
  if (showing) return { name: t('homeWords.ask.choosing'), description: t('homeWords.ask.choosingDescription') }
  return { name: t('homeWords.ask.name'), description: t('homeWords.ask.description') }
}

/**
 * THE RIGHT-CLICK SHORTCUT IS TAUGHT BESIDE THE CONTROL ONLY ON ITS TOOLTIP, AND NOWHERE ELSE ON
 * SCREEN.
 *
 * The control used to draw a line at rest — "or right-click anything" — beside the button. The
 * owner asked for that line to go (16 September 2026); the gesture itself is still taught on
 * the control's own description on hover and in the README. Nothing in the markup teaches the gesture
 * at rest any more, which is the removal this criterion asks for. (The earlier argument for drawing
 * it at rest is on the record above.)
 */
/**
 * THE CONTROL AT REST THAT SAYS THIS IS POSSIBLE AT ALL.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS ONE OF THESE AND NOT A BUTTON PER OBJECT
 * ---------------------------------------------------------------------------------------
 *
 * Round seven put a button beside each thing that could be talked about. Two problems. It does not
 * reach: a table has hundreds of cells and a button in each is furniture, so the cells stayed
 * unaddressable. And it answers the wrong question — a button on a row says THIS row can be talked
 * about, and the question a person has is whether anything can.
 *
 * So there is one control, in the frame, on every page at every width. Pressing it marks everything
 * addressable on the page and takes the next press as the subject. The page answers "what can I
 * point at" by showing it, which is what design/UX-CONTRACT.md asks for: change the interaction, do
 * not add a sentence explaining the interaction.
 *
 * IT IS NOT A MODE. It ends at the first press, at Escape, or at a second press of the control.
 * Nothing is remembered between visits.
 *
 * IT NEVER MARKS NOTHING AND WAITS. A page can hold nothing smaller than itself — the Schedule
 * board did on 18 August 2026 — and there the control used to change its name, outline nothing, and
 * swallow the next press into a comment about the whole page. So the page is asked first: with
 * something to mark it marks it, and with nothing to mark it opens the box on the page at once,
 * which is the one honest thing that page has to offer.
 *
 * ---------------------------------------------------------------------------------------
 * THE FRAME IS ASKED TO GET OUT OF THE WAY, BECAUSE ON A PHONE IT IS COVERING THE PAGE
 * ---------------------------------------------------------------------------------------
 *
 * Below 1024px the sidebar is a drawer, so the only way to reach this control is to open the menu
 * — and the menu then covers the page this control has just asked somebody to press. Measured in
 * Chromium at 390 on 19 August 2026: after pressing it, the drawer was still 300px wide over a
 * 390px window, the scrim was still there, and `document.elementFromPoint(200, 300)` was the
 * navigation. Every press then landed on the menu, found nothing addressable, and Mole Office fell back
 * to a comment about the whole page — so the same gesture gave "Record" and a ranked agent at 1440
 * and "Page" and no agent at all at 390.
 *
 * `getOutOfTheWay` is how the frame is told. The frame decides what that means, because whether
 * anything is covering the page is a fact about the frame and not about this button: above 1024px
 * the sidebar is in the flow, nothing is covering anything, and closing a drawer that is not open
 * does nothing.
 */
/**
 * THE CONTROL'S OWN ELEMENT, HELD OUTSIDE REACT SO THE COMPOSER COUNTS A PRESS OF IT AS ITS OWN.
 *
 * The composer closes on a press that lands in none of the elements it names as inside, and this
 * control is drawn in the frame rather than in the composer, so pressing it while a box is open
 * used to throw that box away. The deleted offer button had the same problem and the same fix; it
 * was the only user of `alsoInside`, and the control is the user now.
 *
 * It is a module value rather than state because there is one of these in the product, mounted by
 * the sidebar. React sets it back to null when that unmounts, so a stale element cannot be handed
 * to the composer.
 */
const pointingControl = createRef<HTMLButtonElement>()

/**
 * WHAT POINT MODE DRAWS IS DECIDED IN ONE FILE, AND IT IS NOT THIS ONE.
 *
 * It is `agent-css.ts`, under the comment beginning "WHAT CAN BE TALKED ABOUT". That file holds the
 * emit rule — the outline follows the pointer and the focus, not the whole page — and the two
 * channels it draws with: solid for the thing a press lands on, dashed for everything holding it.
 *
 * THIS FILE USED TO HOLD A SECOND COPY OF THOSE RULES AND A RULE CANCELLING THE FIRST. Round nine
 * could not edit `agent-css.ts`, so it wrote `POINT_MODE_CSS` here, cancelled the older un-scoped
 * rule by concatenation order, and handed the deletion over as
 * `design/round-nine/step18-agent-css.patch`. That patch is applied now, so the second copy is
 * deleted with it: which of the two won depended on the order two sheets were concatenated in, and
 * that is exactly the defect this repository keeps finding.
 */
/** One sheet, and it is the one every other part of this layer already draws with. */
const LAYER_CSS = AGENT_CSS

export function TalkAboutSomething({ getOutOfTheWay }: { getOutOfTheWay?: () => void } = {}) {
  const showing = useShowingWhatCanBeTalkedAbout()
  const words = pointingControlWords(showing)
  return (
    <>
      <style href="mole-office-agent" precedence="default">
        {LAYER_CSS}
      </style>
      <button
        type="button"
        ref={pointingControl}
        className="px-point-switch"
        aria-pressed={showing}
        onClick={(e) => {
          const does = whatThePressDoes(showing, somethingToPointAt())
          // The point is read BEFORE the frame is asked to get out of the way, because closing a
          // drawer takes this button off the screen and a rectangle read after that is nothing.
          const box = e.currentTarget.getBoundingClientRect()
          getOutOfTheWay?.()
          if (does === 'stop') stopShowing()
          else if (does === 'mark') showWhatCanBeTalkedAbout()
          // THE PAGE ITSELF, OPENED BY THE SAME FUNCTION EVERY OTHER WAY IN CALLS. It passes a point
          // rather than this button, because the point was read a moment ago and the button may
          // already be off the screen behind a closed drawer.
          else openAbout(null, { at: 'pointer', x: box.right + 6, y: box.top })
        }}
        title={words.description}
      >
        {/* ITS ICON IS DRAWN AS THE SIDEBAR'S ICONS ARE, at their size: two quotation marks, about 17 units across
            as the sidebar's glyphs are. At 13 they read smaller than every icon under them. */}
        <svg className="shell-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4.85 6.95H10.05V12.15H6.8V16.05H3.55V10.85ZM15.25 6.95H20.45V12.15H17.2V16.05H13.95V10.85Z" />
        </svg>
        <span className="px-point-switch-words">{words.name}</span>
      </button>
    </>
  )
}

// ============================================================================ the layer

/**
 * WHAT BECAME OF THE WORDS SOMEBODY SELECTED, as the composer's box is able to say it today.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOW READ OFF THE PLACE, AND THAT IS THE WHOLE CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * It used to read the document — did anything inside the pressed element say which stored string
 * it draws — because the only fact it was handed was a boolean saying the words could not be
 * placed. `pointedAt` now answers with one of five places, so the question is already decided by
 * the time this is asked and there is nothing here to work out a second time.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THREE OF THE FIVE ANSWER `placed`, WHICH DRAWS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * The box has three words and there are five places, so this map is not one-to-one and the two
 * that fall together are named here rather than left to be discovered.
 *
 *   `words`   -> `placed`. The exact characters are stored. Nothing to say.
 *   `run`     -> `placed`. Nobody selected anything. Nothing to say, and saying "this comment is
 *                about the whole thing" to somebody who chose nothing names a loss that did not
 *                happen.
 *   `surface` -> `placed`. The same, one step coarser.
 *   `across`  -> `across`. The selection ran across more than one piece of stored text. Both of
 *                its ends are now kept exactly, and selecting inside one paragraph is still the
 *                thing that gets a single quote, so the box's sentence is true.
 *   `quote`   -> `placed`. THE WORDS ARE KEPT. The box's other word, `nowhere`, draws a sentence
 *                saying they cannot be quoted, and since this step keeps them verbatim that
 *                sentence is false. Saying nothing is not a loss: the page now draws a dashed
 *                frame and a doubled quote glyph on the thing, which is this place's own mark in
 *                the state vocabulary, and it is drawn before anything is sent.
 *
 * THE MISSING WORD IS OWED AND IT IS WRITTEN DOWN. The composer's own row wants the place word —
 * `2 blocks`, `words only`, `this line`, `whole thing` — beside the chip, drawn from `PLACE_STATES`
 * like every other state in the product. That row is in TalkBox.tsx, which this step does not own,
 * and the change is handed over in design/round-nine/step19-composer-place-row.patch.
 */
export function whatBecameOfTheWords(pointed: Pointed): SelectedWords {
  return pointed.place.at === 'across' ? 'across' : 'placed'
}

/**
 * THE LAYER, WHICH IS A RENDERER AND NOTHING ELSE.
 *
 * It subscribes to what the composer is about, attaches the product's listeners once, and draws the
 * box. Every decision about what a gesture means is in open.ts, so there is no state here to fall
 * out of step with the state there.
 */
export function PointingLayer() {
  const { opened, changing } = useComposer()
  useEffect(() => startDispatch(), [])

  return (
    <>
      <style href="mole-office-agent" precedence="default">
        {LAYER_CSS}
      </style>
      {opened === null ? null : (
        <TalkBox
          /**
           * A FRESH BOX WHEN THE SUBJECT CHANGES, and the same one while it does not.
           *
           * Right-clicking a second thing while the composer is open REPLACES what the box is
           * about without unmounting it, so the words in it, the id they are kept under and the
           * intent all stayed from the first thing. Measured in Chromium at 1440 on 19 August 2026:
           * with "WORDS ABOUT THE FIRST THING" typed against a block of a report, a right-click on
           * the report itself left the chip reading the report's title, the box still holding those
           * words, and the next keystroke about to file them under the report — taking them off the
           * block they were written about, because this browser keeps one instruction per thing.
           *
           * A key is the whole fix: React makes a new box, and the new box reads what is kept for
           * the new subject. Pointing at the same thing twice keeps the same key and the same box,
           * so nothing is thrown away by re-opening.
           */
          key={lookupKey(opened.pointed.context)}
          context={opened.pointed.context}
          about={opened.pointed.about}
          at={{ ...opened.at, underAnElement: opened.underAnElement }}
          selectedWords={whatBecameOfTheWords(opened.pointed)}
          alsoInside={pointingControl}
          changing={changing}
          onDoneChanging={stopChanging}
          onClose={closeTheComposer}
        />
      )}
    </>
  )
}

/**
 * WHAT WAS HERE, AND WHY IT IS NOT.
 *
 * ---------------------------------------------------------------------------------------
 * THE OFFER BESIDE A SELECTION IS DELETED, AND A SMALLER ONE IS NOT A REPLACEMENT
 * ---------------------------------------------------------------------------------------
 *
 * Two components stood here: one that drew a button at the end of whatever was selected, and the
 * button itself, which named the words it was about and said which of two things pressing it would
 * do. A listener on `pointerup`, `keyup` and `selectionchange` raised it whenever a selection
 * finished, anywhere in the product. Neither the components nor their labels are named here, so a
 * search for either of them over src/web comes back empty and stays that way.
 *
 * THE RULE IT BROKE IS THE OWNER'S AND IT HAS TWO HALVES. Before somebody invokes, selecting words
 * adds nothing: no button, no bubble, no chip, no cursor change, no attribute, no announcement —
 * the browser's own selection and nothing else. After a right-click, the selected words stay
 * visible while the composer is open, and Mole Office may paint them itself because taking focus removes
 * the browser's own appearance. Said once: selection alone adds nothing; invoking may keep the
 * selected context visible.
 *
 * SO THIS IS NOT A THING TO MAKE SMALLER OR QUIETER. A one-pixel handle, a hover-revealed control
 * and a delayed bubble are all the same refusal broken more carefully. The ways in are the two the
 * header names: right-click anything that says what it is, and the control in the frame.
 *
 * WHAT WENT WITH IT. `pointedAtSelection`, `selectionCorner` and `somethingIsSelected` in
 * pointing.ts had no other caller. `startsAndEndsInOneThing` did not go: it is the one correct
 * reading of a selection that runs from one thing into another, and it belongs in `pointedAt`.
 *
 * WHAT IT COSTS, MEASURED RATHER THAN GUESSED. Until the selected words are painted when the
 * composer opens, somebody who selects a phrase and right-clicks it cannot see which phrase the
 * composer is about — taking focus collapses the browser's own highlight. That is a real hole and
 * it is the next thing built, not a thing to live with.
 */
