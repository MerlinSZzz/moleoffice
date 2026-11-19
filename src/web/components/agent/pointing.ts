// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS UNDER THE POINTER, READ OFF THE PAGE ITSELF.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Round seven made a thing addressable by calling a hook on it. A caller had to spread
 * `targetProps` AND render a `handle`, and quoting the text inside it needed a third mark. Five
 * places did it, so five things could be talked about and everything else on screen could not. The
 * owner's sentence for that was *"some React components know how to open an Agent menu"*.
 *
 * Now an element is addressable because it CARRIES AN ATTRIBUTE, and this file is the one reader of
 * it. Nothing calls a hook, nothing renders a handle, and there is no half-wired state to detect:
 * `data-target` is either on an element and complete or it is not there.
 *
 * The three attributes and their exact spelling are declared once, in src/shared/targets.ts. This
 * file never types one out.
 *
 * A FOURTH ONE IS DECLARED HERE AND SHOULD NOT STAY HERE. `NAME_ATTRIBUTE` says what a thing is
 * CALLED, and it is below rather than beside the other three because src/shared/targets.ts belongs
 * to another pass this round. It is browser-only — no server route reads it — and it carries no
 * promise about where any characters are stored, which is what keeps it out of the span arithmetic.
 * It belongs in that file all the same: one declaration of what an element may say about itself.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRIORITY RULE IS THE DOCUMENT TREE
 * ---------------------------------------------------------------------------------------
 *
 * The order wanted is the selected text, then the block or cell or row it is in, then the object
 * that contains that, then the page. That is exactly what walking up from the pointer finds, so
 * nothing here maintains a ranking. `closest` finds the nearest addressable element; the words
 * inside it narrow the answer; and a press with nothing addressable under it is a press on the page.
 *
 * ---------------------------------------------------------------------------------------
 * A SPAN IS ARITHMETIC, AND IT REFUSES RATHER THAN GUESSING
 * ---------------------------------------------------------------------------------------
 *
 * Rendered Markdown is not the string it was rendered from. So an element that draws stored text
 * carries WHICH stored string it came from and WHERE its first character sits in it, and a
 * selection becomes a range of the source by adding. Nothing is searched for, because searching for
 * a quote is guessing whenever the same words appear twice.
 *
 * A selection that starts in one run of stored text and ends in another gets NO SPAN, and the
 * comment is about the block instead. Between two runs sit characters that were never drawn — the
 * asterisks around a bold word, the newline between two lines of one paragraph — so a quote taken
 * across the join is not the stored text between those two offsets. The server would then read the
 * comment back and report that untouched words had changed. Absence beats a guess; this is that
 * rule in about ten lines.
 */

import {
  DRAWN_FROM_ATTRIBUTE,
  TARGET_ATTRIBUTE,
  TEXT_FIELD_ATTRIBUTE,
  TEXT_OFFSET_ATTRIBUTE,
  seenRuleFor,
  spanOf,
  targetAttributeValue,
  targetFromAttributeValue,
  targetSpec,
  type Place,
  type Seen,
  type DrawnIn,
  type DrawnOn,
  type Span,
  type Target,
  type TargetKind,
  type View,
} from '@shared/targets.ts'
// WHAT A DRAWING SAYS ABOUT ITSELF, AND THE ONE READER OF IT. `theViewThisWasWrittenIn` below is
// the caller: it walks up from the thing a comment is filed against and asks what reading length
// that part of the page was drawn at. The attribute's name, the list of words it may carry and the
// reader are all in that one file, so a graph card's own ladder cannot be read as a reading length.
import { readingLengthAbove, theDrawingAbove } from '../../lib/drawnat.ts'
import { AN_IMAGE_BLOCK, thePictureIn } from '../../lib/drawnhere.ts'
import { surfaceLabel, type SurfaceId } from '@shared/surfaces.ts'
import { identityOf, offsetOf } from '@shared/regions.ts'
import { declaredAttributes } from '../declares.ts'
import { shortenToWords, type MessageContext } from './context.ts'
// `askToTalkAbout` at the end of this file calls the dispatch, and the dispatch reads this file.
// Neither module touches the other while it is being loaded — both calls happen inside functions —
// so the two importing each other is safe, and it is the price of one entry path living beside its
// only caller in src/web/pages/AgentsPage.tsx.
import { openAbout } from './open.ts'

/** What one press or one selection turned out to be pointing at. */
export interface Pointed {
  /** The element that IS the thing. The composer opens beside it when there is no pointer. */
  element: HTMLElement
  /** What to send: the thing, and the words inside it when the words could be placed exactly. */
  context: MessageContext
  /** What the page already calls this thing, for the chip above the composer. */
  about: string
  /**
   * WHERE THE PERSON WAS INSIDE THE THING. One of five answers, and one of them is always true.
   *
   * It replaces `wordsNotPlaced`, a boolean that was `false` in three situations meaning three
   * different things: no selection at all, a selection that ran across a block boundary and was
   * thrown away, and a selection that was placed exactly. The middle one is the owner's defect —
   * they selected a paragraph of a 61-block report, wrote a word, and Mole Office filed the comment
   * against the whole report with nothing on screen saying it had done that.
   *
   * `context.span` is DERIVED from this by `spanOf` and is never worked out separately. See
   * `placeOf` for the six rules that produce it.
   */
  place: Place
  /**
   * THE RANGE THE PERSON HAD SELECTED, CLONED WHILE IT WAS STILL ALIVE. Null when there was none.
   *
   * Focus moving into the composer's box DESTROYS the document selection — measured in Chromium,
   * Firefox and WebKit alike, claim `wKR0jkvl_7sz`. A `Range` cloned BEFORE focus moved still
   * returns its rectangles afterwards, in all three. That one fact is what the source paint is
   * built on, and this is where the clone is kept between reading the gesture and drawing it.
   *
   * IT IS A CLONE AND NOT THE LIVE RANGE. `Selection.getRangeAt` hands back a range the browser
   * goes on editing as the selection changes, so keeping that one would be keeping a value that
   * changes under the paint.
   */
  kept: Range | null
  /**
   * Every `data-target` this walk had to skip because it could not be read.
   *
   * A malformed attribute names a different thing from the one the element meant, so the walk
   * carries on past it rather than opening a composer pointed at a block id read as a record id.
   * It is reported so a screen can say so instead of the mark silently not appearing.
   */
  problems: string[]
}

// ============================================================================ walking the tree

/** The element for a node, whether the node is an element or a piece of text inside one. */
function elementOf(node: Node | null): Element | null {
  if (node === null) return null
  return node instanceof Element ? node : node.parentElement
}

/** The picture inside an image block is the `.path` region below the block path. */
function pictureRegionAt(node: Node | null): { element: HTMLElement; target: Target; problems: string[] } | null {
  const picture = elementOf(node)?.closest('img') ?? null
  const block = picture?.closest(`${AN_IMAGE_BLOCK}[${DRAWN_FROM_ATTRIBUTE}]`) ?? null
  if (!(block instanceof HTMLElement)) return null

  const regionId = thePictureIn(block)
  if (regionId === null) return null

  // The figure is not a target. The nearest addressable parent still identifies its report.
  const above = addressableAt(block.parentElement)
  if (above === null) return null
  const recordId =
    above.target.kind === 'record' || above.target.kind === 'region' || above.target.kind === 'reportBlock'
      ? above.target.recordId
      : null
  if (recordId === null) return null

  return {
    element: block,
    target: { kind: 'region', recordId, regionId },
    problems: above.problems,
  }
}

/**
 * The nearest element that says what it is, walking up, skipping any that cannot be read.
 *
 * Exported because the mark layer walks the same tree for the same reason, and two walks would be
 * two answers to "what is this element" free to disagree.
 */
export function addressableAt(node: Node | null): { element: HTMLElement; target: Target; problems: string[] } | null {
  const picture = pictureRegionAt(node)
  if (picture !== null) return picture

  const problems: string[] = []
  let at = elementOf(node)?.closest(`[${TARGET_ATTRIBUTE}]`) ?? null
  while (at !== null) {
    const read = targetFromAttributeValue(at.getAttribute(TARGET_ATTRIBUTE) ?? '')
    if ('target' in read && at instanceof HTMLElement) return { element: at, target: read.target, problems }
    if ('problem' in read) problems.push(read.problem)
    at = at.parentElement?.closest(`[${TARGET_ATTRIBUTE}]`) ?? null
  }
  return null
}

// ============================================================================ the page's own tree

/**
 * THE PAGE'S OWN TREE, WHICH IS `#main` AND NOTHING ELSE.
 *
 * The frame — the rail, the top bar, the review column, the host every popup is drawn in — is not
 * part of what a page holds. Until step 16 no part of the frame said what it was, so "everything
 * addressable in the document" and "everything addressable on this page" were the same set and
 * nothing had to tell them apart. Sixteen rail rows now say what they are on every route, so they
 * are not the same set any more, and three readers that meant the second one were asking the first.
 *
 * Null when the shell has not rendered. Nothing is claimed in that case; the callers say what they
 * do about it, and none of them guesses.
 */
export function thePagesOwnTree(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.getElementById('main')
}

/**
 * EVERYTHING ON THIS PAGE THAT SAYS WHAT IT IS, in document order.
 *
 * This is the set point mode marks and the set a press in point mode may choose from. The frame is
 * left out on purpose: pressing a rail row in point mode navigates, which is what it does at every
 * other moment, and the mode is over the page rather than over the window.
 */
export function pointableInThePage(): HTMLElement[] {
  const page = thePagesOwnTree()
  if (page === null) return []
  return [...page.querySelectorAll<HTMLElement>(`[${TARGET_ATTRIBUTE}]`)]
}

/** Whether this element is one of the page's own, asked of the tree rather than of a class name. */
export function isInThePage(element: HTMLElement): boolean {
  const page = thePagesOwnTree()
  return page !== null && page !== element && page.contains(element)
}

/**
 * THE ELEMENT THE PAGE ITSELF IS DRAWN ON, when one is there.
 *
 * `App.tsx` puts `page/<route>` on the shell and gives it the page's name, so a right-click on the
 * gutter answers the page and the chip reads what the top bar reads. This finds that same element
 * by the key it carries — through `targetAttributeValue`, the one function that spells a key — so
 * that a press with nothing under it at all can be given the same name rather than a second one
 * worked out from the page's first heading.
 */
function theFloor(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLElement>(`[${TARGET_ATTRIBUTE}="${targetAttributeValue(thePage())}"]`)
}

// ============================================================================ where words came from

/** One run of drawn text that really is one run of stored text. */
interface Run {
  element: HTMLElement
  /** The stored string it came out of, as a field path from the record down. */
  field: string
  /** Where this element's first character sits in that string, counted from 0. */
  offset: number
}

/** The run a node sits in, or null when nothing said where this text came from. */
function runAt(node: Node | null, within: HTMLElement): Run | null {
  const element = elementOf(node)?.closest(`[${TEXT_OFFSET_ATTRIBUTE}]`) ?? null
  if (element === null || !(element instanceof HTMLElement) || !within.contains(element)) return null
  const field = element.getAttribute(TEXT_FIELD_ATTRIBUTE)
  const offset = Number(element.getAttribute(TEXT_OFFSET_ATTRIBUTE))
  // A run saying where it starts but not which string it is in is half an answer, and half an
  // answer here becomes a quote the server looks for in every field it can find.
  if (field === null || field === '') return null
  if (!Number.isInteger(offset) || offset < 0) return null
  return { element, field, offset }
}

/** How many characters of this run come before a point inside it. */
function charactersBefore(run: Run, container: Node, offsetInContainer: number): number {
  const before = document.createRange()
  before.selectNodeContents(run.element)
  before.setEnd(container, offsetInContainer)
  return before.toString().length
}

/**
 * The exact stored characters a selection covers, or null when it cannot be said exactly.
 *
 * Both ends have to be in the SAME run, for the reason in this file's header. The trimming is done
 * on both the quote and the numbers together, so the words stored and the range stored are the same
 * words: selecting a line by triple-click takes the trailing newline with it, and a quote with a
 * newline on the end is not the quote the person can see.
 */
export function spanOfSelection(range: Range, within: HTMLElement): Span | null {
  const drawn = range.toString()
  if (drawn.trim() === '') return null
  const start = runAt(range.startContainer, within)
  if (start === null) return null
  const end = runAt(range.endContainer, within)
  if (end === null || end.element !== start.element) return null

  const lead = drawn.length - drawn.trimStart().length
  const trail = drawn.length - drawn.trimEnd().length
  const from = start.offset + charactersBefore(start, range.startContainer, range.startOffset) + lead
  const to = end.offset + charactersBefore(end, range.endContainer, range.endOffset) - trail
  if (to <= from) return null
  return { quote: drawn.trim(), from, to, field: start.field }
}

// ============================================================================ words inside a box

/**
 * WORDS SELECTED INSIDE A BOX SOMEBODY TYPES IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS READ SEPARATELY FROM EVERY OTHER SELECTION
 * ---------------------------------------------------------------------------------------
 *
 * A textarea and a text input hold their own selection. `window.getSelection()` does not report it:
 * measured in Chromium on 18 August 2026, selecting the whole of a plan line's box gave the box
 * `selectionStart 0, selectionEnd 6` and the document a collapsed selection with no words in it. So
 * every reader in this file that starts from the document selection sees nothing, and the offer to
 * talk about the words never appeared — the owner measured exactly that.
 *
 * The numbers below are positions in the box's VALUE. Turning them into positions in a stored string
 * is `spanFromTyped`, and it refuses unless the box says which stored string it draws.
 */
export interface Typed {
  box: HTMLInputElement | HTMLTextAreaElement
  /** Where the selection starts in the box's value, counted from 0. */
  from: number
  /** Where it ends. */
  to: number
  /** The characters between those two, as the person can see them. */
  quote: string
}

/**
 * The kinds of box that have a selection to read.
 *
 * A checkbox, a range or a colour has no `selectionStart`, and asking a number or an email input for
 * one throws in Chromium rather than answering null. So the types are named rather than probed. A
 * password is deliberately not here: quoting somebody's password into a comment is not a capability.
 */
const BOXES_WITH_WORDS: ReadonlySet<string> = new Set(['text', 'search', 'url', 'tel'])

/** The box a node is inside, or null. A `<select>` and a checkbox are not boxes with words in them. */
function boxOf(node: Node | null): HTMLInputElement | HTMLTextAreaElement | null {
  const element = elementOf(node)?.closest('input, textarea') ?? null
  if (element instanceof HTMLTextAreaElement) return element
  if (element instanceof HTMLInputElement && BOXES_WITH_WORDS.has(element.type)) return element
  return null
}

/** What is selected inside one box, or null when nothing in it is selected. */
function selectionIn(box: HTMLInputElement | HTMLTextAreaElement): Typed | null {
  const from = box.selectionStart
  const to = box.selectionEnd
  if (from === null || to === null || to <= from) return null
  const quote = box.value.slice(from, to)
  if (quote.trim() === '') return null
  return { box, from, to, quote }
}

/** The words selected inside the box this node is in, or null. */
export function typedSelection(node: Node | null): Typed | null {
  const box = boxOf(node)
  return box === null ? null : selectionIn(box)
}

/**
 * WHERE THE WORDS SELECTED IN A BOX SIT IN WHAT IS STORED — or null, which is the usual answer.
 *
 * `run` is what the box itself says: which stored string it draws and where its first character sits
 * in it, from the two attributes in src/shared/targets.ts. A box that says neither gets null, the
 * comment is then about the whole thing, and the offer says so before it is pressed. That is the
 * fifth engineering rule: the numbers a box's own selection gives are positions in what is DRAWN,
 * and storing them as positions in what is STORED would be a guess wearing exact arithmetic.
 *
 * IT IS ARITHMETIC OVER PLAIN VALUES, with no box and no document, so it can be proved without a
 * browser. The trimming is done to the quote and the numbers together, for the reason
 * `spanOfSelection` gives above.
 */
export function spanFromTyped(run: { field: string; offset: number } | null, typed: Typed): Span | null {
  if (run === null) return null
  const lead = typed.quote.length - typed.quote.trimStart().length
  const trail = typed.quote.length - typed.quote.trimEnd().length
  const from = run.offset + typed.from + lead
  const to = run.offset + typed.to - trail
  if (to <= from) return null
  return { quote: typed.quote.trim(), from, to, field: run.field }
}

// ============================================================================ what to call it

/** Whitespace as a person reads it: one space, no line breaks. */
function collapsed(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Which parts of a thing are not what the thing is CALLED.
 *
 * A row holds its title and it also holds the controls for acting on it — a button that tracks the
 * line as work, a glyph drawn for the eye alone. Neither is the row's name, and a chip that reads
 * them back names controls the person did not point at.
 *
 * A LINK IS NOT ON THIS LIST, and that is measured rather than chosen. A row's title is usually the
 * link that opens it: dropping links from the work list's rows left the chip reading
 * "done step Made-up example", with the title gone and only the marks around it left.
 */
const NOT_THE_NAME = 'button, [role="button"], [aria-hidden="true"]'

/**
 * The words drawn inside an element, as a person reads them: separated, and without the controls.
 *
 * `textContent` is the wrong reader for this and it fails in two ways at once. It runs the last
 * word of one element into the first word of the next, because there is no whitespace between them
 * in the markup — measured on the work list on 18 August 2026, a row came back as
 * "done把 1923 年缺的 12 期列成清单stepMade-up example" (a made-up title), which is a state word, a title,
 * a kind and a provenance mark with no gaps. And it reads out every button and link inside the thing.
 */
export function wordsInside(element: HTMLElement): string {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const parts: { words: string; control: boolean }[] = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const words = collapsed(node.textContent ?? '')
    if (words === '') continue
    // A control INSIDE the thing is not its name. A control the thing itself sits inside is a
    // different fact — a whole row drawn as one button — and dropping those words would leave the
    // chip with nothing to say.
    const control = node.parentElement?.closest(NOT_THE_NAME) ?? null
    parts.push({ words, control: control !== null && control !== element && element.contains(control) })
  }
  return nameFromParts(parts)
}

/**
 * The two rules, without a document, so a test can put them without a browser.
 *
 * A SPACE BETWEEN THE PIECES, because they are separate elements on the screen and a reader sees a
 * gap. A CONTROL'S WORDS ARE NOT THE NAME, unless the controls are everything there is — then they
 * are all the thing has to be called by, and saying nothing would be worse.
 */
export function nameFromParts(parts: readonly { words: string; control: boolean }[]): string {
  const said = parts.filter((part) => !part.control).map((part) => part.words)
  if (said.length === 0) return parts.map((part) => part.words).join(' ')
  return said.join(' ')
}

/**
 * WHAT AN ELEMENT IS CALLED, WRITTEN ON IT FROM WHAT IS STORED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A NAME IS SAID RATHER THAN SCRAPED
 * ---------------------------------------------------------------------------------------
 *
 * A row draws more than the thing's name: a state word, a count, a summary, a press. Reading the
 * words off the row therefore names all of them. Measured in Chromium at 1440 on 18 August 2026,
 * the chip above the composer read `Record — 1 / 3 checked Mole Office — attention, the change window
 * and the` on a module row, and `Line of a plan — level 2 round1 todo Open the record for "round1"
 * task` on a line of a plan. Neither is what the person pointed at.
 *
 * So an element that says what it IS may also say what it is CALLED, and the words come from the
 * value Mole Office holds — a record's title, a plan line's characters — not from the row's rendering.
 *
 * IT CARRIES NO PROMISE ABOUT WHERE THOSE CHARACTERS ARE STORED, which is why it is not one of the
 * two text attributes. A name is drawn on a chip; a quote is looked up in a stored string, and a
 * wrong offset would make the server report untouched words as changed. Getting a name wrong costs
 * a wrong chip and nothing else.
 */
export const NAME_ATTRIBUTE = 'data-name'

/**
 * `{ 'data-name': 'Tray clamp controller' }` — the words, on the element that IS the thing.
 *
 * Use this where the component has the stored value in its hand: a plan row has the line, so it
 * says the line.
 */
export function nameAttributes(name: string): Record<string, string> {
  return { [NAME_ATTRIBUTE]: name }
}

/**
 * `{ 'data-name': '' }` — spread on the element that DRAWS the name, when the name is a drawn node.
 *
 * A row's title is often not a string: `Row` and `ScanRow` both take a React node, so half the
 * lists in this product hand down a title with a mark or a count beside it. There is nothing to
 * write into an attribute, but there IS one element whose words are the name, and the row already
 * renders it. So it points at that element instead of quoting it.
 */
export const DRAWS_THE_NAME: Readonly<Record<string, string>> = { [NAME_ATTRIBUTE]: '' }

/**
 * `{ 'data-target': 'uiSurface/composer.intent', 'data-name': 'Kind of ask' }` — a part of Mole Office's
 * own screen, saying what it is and what it is called in one spread.
 *
 * WHY BOTH COME FROM ONE CALL. A part of Mole Office's own screen holds no stored text, so its name IS
 * the label in src/shared/surfaces.ts. Written separately, the element could carry one name and the
 * review row that later lists the comment could carry another, with nothing failing. Both are read
 * from `surfaceLabel` here, so there is one string and no way to write a second.
 *
 * WITHOUT THE NAME the chip above the composer falls back to `nameOnScreen`'s last resorts — an
 * `aria-label` written for a screen reader, or the words the region happens to draw. Measured on
 * 20 August 2026: the composer's intents row would have been called `What you mean by this` and its
 * action row `Send Save without sending`, neither of which is the name in the registry.
 *
 * THE ARGUMENT IS THE SAME SHAPE `Panel` AND `Explain` TAKE, so every declaration in src/web reads
 * alike.
 */
export function partOfMoleOffice(declares: { surface: SurfaceId }): Record<string, string> {
  return { ...declaredAttributes(declares), ...nameAttributes(surfaceLabel(declares.surface)) }
}

/** The name an element states, either as the words themselves or by pointing at what draws them. */
function nameSaidBy(element: HTMLElement): string | null {
  const own = element.getAttribute(NAME_ATTRIBUTE)
  if (own !== null && own.trim() !== '') return collapsed(own)
  const inside = element.querySelector(`[${NAME_ATTRIBUTE}]`)
  // A name inside a SMALLER addressable thing belongs to that thing and not to this one. Without
  // this a report would be named after the first block drawn inside it.
  if (inside === null || inside.closest(`[${TARGET_ATTRIBUTE}]`) !== element) return null
  const said = inside.getAttribute(NAME_ATTRIBUTE)
  if (said !== null && said.trim() !== '') return collapsed(said)
  // `wordsInside` AND NOT `textContent`, for the reason that function's own note gives: two
  // elements side by side have no whitespace between them in the markup, so a kind drawn in front
  // of a title came back as "ProblemThe Plan table hides the three columns".
  if (!(inside instanceof HTMLElement)) return null
  const drawn = wordsInside(inside)
  return drawn === '' ? null : drawn
}

/**
 * WHAT THE PAGE ALREADY CALLS THIS THING, taken off the page rather than passed in.
 *
 * Round seven's callers passed a title down. Nothing passes anything now, so this reads what the
 * element says, in the order a person would read it: the name the element states, then the label it
 * gives assistive readers, then its own heading, then the first stored string inside it, and only
 * then the words it happens to draw.
 *
 * THE LAST STEP IS A LAST RESORT AND IT IS THE ONE THAT GOES WRONG. It is kept because an element
 * that states nothing has to be called something, and a chip saying only "Record" would name no
 * record at all. Every row component in this product states its name; what falls through here is
 * whatever has not been given one yet.
 */
export function nameOnScreen(element: HTMLElement): string {
  const said = nameSaidBy(element)
  if (said !== null) return said
  const label = element.getAttribute('aria-label')
  if (label !== null && label.trim() !== '') return collapsed(label)
  const heading = element.querySelector('h1, h2, h3, h4')
  if (heading !== null && collapsed(heading.textContent ?? '') !== '') return collapsed(heading.textContent ?? '')
  const stored = element.querySelector(`[${TEXT_FIELD_ATTRIBUTE}]`)
  if (stored !== null && collapsed(stored.textContent ?? '') !== '') return collapsed(stored.textContent ?? '')
  return wordsInside(element)
}

// ============================================================================ the smallest piece

/**
 * IS THIS ELEMENT DRAWN AS A PIECE OF ITS OWN, or does it run on with the words beside it?
 *
 * The browser has already decided this, so it is asked rather than worked out again here. An
 * element laid out inline is part of the sentence around it and is not a piece anybody points at
 * separately. Anything else — a paragraph, a cell, a card, a row of a list — is drawn as its own
 * box on the screen. `contents` draws no box at all, so it is not a piece either.
 */
function standsOnItsOwn(element: HTMLElement): boolean {
  const drawn = element.ownerDocument.defaultView?.getComputedStyle(element).display ?? 'inline'
  return drawn !== 'inline' && drawn !== 'contents'
}

/**
 * DO THESE WORDS SAY ANYTHING THE THING'S NAME DOES NOT?
 *
 * False in the two ways a piece can be where the thing is named rather than a piece of its own. A
 * panel's heading holds part of the panel's name. A rail row is drawn out of its name and nothing
 * else. Neither is a separate thing to talk about, so both keep answering the whole.
 */
function addsToTheName(words: string, name: string): boolean {
  const said = words.toLowerCase()
  const called = name.toLowerCase()
  if (said === '') return false
  if (called === '') return true
  return !said.includes(called) && !called.includes(said)
}

/**
 * WAS THIS ELEMENT PRESSED IN A GAP BETWEEN ITS PIECES, rather than on any words?
 *
 * True when the element holds pieces drawn as their own boxes and no words of its own, so the press
 * landed on its background: the space between two closed folds of Settings is `DIV.sf-cat-panels`,
 * and that container quoted the whole text of every fold in it (message b2Qgh4uamL2A). Nothing
 * smaller than the thing is under the pointer there, so nothing is quoted. A paragraph pressed beside
 * its words still has words of its own and still answers.
 */
function pressedBetweenItsPieces(element: HTMLElement): boolean {
  let pieces = false
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && collapsed(child.textContent ?? '') !== '') return false
    if (child instanceof HTMLElement && standsOnItsOwn(child)) pieces = true
  }
  return pieces
}

/**
 * THE SMALLEST PIECE OF THIS THING UNDER THE POINTER THAT DRAWS WORDS OF ITS OWN, or null.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The walk up the tree stops at the nearest element that says what it IS, and a sentence Mole Office
 * wrote about itself says nothing, so the panel around it answered. Measured at 1440 on 21 August
 * 2026: `Find work below and choose a day for it.` answered `When work happens this week`, a panel
 * holding 2,309 characters; `This week holds 40 hours and at least 0 hours are planned` answered
 * `Today and this week`, a panel holding 1,083; and a card of the pipeline graph answered `The
 * project structure`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT A LIST OF PLACES
 * ---------------------------------------------------------------------------------------
 *
 * The obvious repair is a name for each piece somebody complained about, and a registry that grows
 * one entry per complaint never catches up with the screen. This is a rule instead, and it reads
 * two things the page already knows: how the browser drew the element, and what the thing around it
 * is called. Nothing has to be declared for it to work, so it reaches parts nobody has got to yet.
 *
 * THE QUOTE IS `innerText` AND THE NAME IS COMPARED AGAINST `textContent`, and those are two
 * different questions asked of the same element. A quote is evidence of what was drawn, so it is
 * read the way the browser rendered it: `textContent` runs the last word of one element into the
 * first of the next, and a cell drawn as `18h` came back as `18 h`. Whether this piece is merely
 * where the thing is named has to see everything the element holds, including what a box or a
 * collapsed control draws, and `innerText` leaves those out.
 */
function ownWordsUnder(node: Node | null, within: HTMLElement): string | null {
  if (node instanceof HTMLElement && node !== within && pressedBetweenItsPieces(node)) return null
  let at: Element | null = elementOf(node)
  while (at !== null && at !== within && within.contains(at)) {
    if (at instanceof HTMLElement && standsOnItsOwn(at)) {
      if (!addsToTheName(collapsed(at.textContent ?? ''), nameOnScreen(within))) return null
      const words = collapsed(at.innerText)
      return words === '' ? null : words
    }
    at = at.parentElement
  }
  return null
}

// ============================================================================ the two readings

/** The page itself, which is what a press with nothing addressable under it points at. */
export function thePage(): Extract<Target, { kind: 'page' }> {
  const hash = typeof window === 'undefined' ? '' : window.location.hash
  const route = hash.startsWith('#') ? hash.slice(1) : hash
  return { kind: 'page', route: route === '' ? '/' : route }
}

/** What the whole page is called, for the chip: the page's own heading, or its address. */
function pageName(): string {
  const heading = typeof document === 'undefined' ? null : document.querySelector('main h1, main h2')
  const words = collapsed(heading?.textContent ?? '')
  return words === '' ? thePage().route : words
}

/**
 * WHAT WAS ON THE SCREEN WHEN THIS PRESS HAPPENED — or nothing, where the thing holds its own words.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS MEASURED HERE AND NOWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * The left rail, a badge, a control's label: Mole Office draws those words from a .tsx file, and nothing
 * can read them back afterwards. `Seen.route` has been declared in src/shared/targets.ts and
 * `checkSeen` has been ready to validate one since round nine, and NOTHING IN THE BROWSER WROTE
 * ONE. Measured on the corpus copy this session: three of the owner's comments point at a
 * `uiSurface` and not one of them carries a `seen`, so the review pane can only tell them the thing
 * they pointed at *"is part of every page, so there is no one page to open"*. What was wanted is the
 * opposite: enough of the route and the target to return to the meaningful source. This function is
 * the half that was missing.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH KINDS GET ONE IS NOT DECIDED HERE
 * ---------------------------------------------------------------------------------------
 *
 * `seenRuleFor` is the one rule and it is read off `holdsText`, so this file cannot come to
 * disagree with the server that refuses the other kinds. A block of a report holds its own words in
 * the corpus and a copy taken now would start drifting at the next edit; that is a refusal on the
 * server (`checkSeen`) and it is an absence here, from one reading of one declaration.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND WHAT IS NOT INVENTED
 * ---------------------------------------------------------------------------------------
 *
 * The ROUTE comes from `thePage()`, which is the one reading of where the browser is standing, so
 * a `seen` and a comment left on the page itself cannot name two different addresses.
 *
 * The QUOTE is the words the element drew, through `wordsInside` — the same reader the chip uses,
 * not `textContent`, which runs the last word of one element into the first of the next. It is
 * shortened by `shortenToWords`, whose bound is `SHOWN_CHARACTERS`, the number this product already
 * uses for how much of a quoted thing a screen shows. NO NEW BOUND IS DECLARED: a character limit
 * declared privately by one module is how this repository ended up with ten of them, and `Seen.cut`
 * says as much in its own comment.
 *
 * The BUILD is `unknown`, and that is a real answer rather than a gap. Nothing in this build hands
 * the client a commit — `vite.config.ts` says none of what it reads is passed to `define` — so a
 * number here would be one this file made up. The day a build stamp exists, this is the line that
 * reads it.
 */
export function theScreenThisWasSeenOn(element: HTMLElement, target: Target): Seen | undefined {
  if (seenRuleFor(target.kind) === 'refused') return undefined
  // AN ELEMENT THAT IS IN NO DOCUMENT DREW NOTHING, and that is a fact about the screen rather than
  // a failure to read one: nothing outside a document is on a screen at all. `wordsInside` walks
  // `element.ownerDocument`, so it is asked only where there is one. The ROUTE is measured all the
  // same, off the address rather than off the element, and it is the half a person navigates by.
  const drew = element.ownerDocument === null || element.ownerDocument === undefined
    ? null
    : shortenToWords(wordsInside(element))
  return {
    route: thePage().route,
    // ABSENT RATHER THAN BLANK where the screen drew no words. The write door refuses every blank
    // string Mole Office takes, in those words, so an empty quote is a value this could not store.
    ...(drew === null || drew.words === '' ? {} : { quote: drew.words }),
    ...(drew !== null && drew.shortened ? { cut: true as const } : {}),
    build: 'unknown',
  }
}


/**
 * WHICH DRAWING OF A RECORD THE WRITER WAS LOOKING AT, READ OFF THE DRAWING ITSELF.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS READ FROM THE DOM AND NOT FROM THE SETTING, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `detailFor('reportContent')` in src/web/lib/detailchoice.ts answers what a reader has ASKED FOR,
 * and that is not the same number as what was DRAWN: a record carries its own recommendation, the
 * precedence ladder weighs it against three stored settings, and the answer differs per record. A
 * view read off the setting would be right about the reader and wrong about the report — evidence
 * about a screen, taken from something that is not the screen.
 *
 * `SummaryBlocks` writes the rung it drew onto the element it drew — `data-rung` on `.sb` — so the
 * measurement is the same fact the pixels came from. This walks up from the thing the comment is
 * being filed against and reads the nearest one. That is the drawing the writer's words are about.
 *
 * ---------------------------------------------------------------------------------------
 * UNDEFINED IS A REAL ANSWER AND IT IS THE COMMON ONE
 * ---------------------------------------------------------------------------------------
 *
 * Nothing above a row of the rail, a plan line, a block on the week or the page itself was drawn at
 * a rung, because none of them is a record's own writing. There is no view to record for those and
 * inventing one would be the third engineering rule broken in the one field whose whole purpose is
 * not to break it. The reading a person is then shown is *nobody recorded which view this was
 * written in*, which is true.
 *
 * ---------------------------------------------------------------------------------------
 * TWO OF THE THREE FIELDS ARE LEFT OUT, AND THE REASON IS AN ORDERING RULE
 * ---------------------------------------------------------------------------------------
 *
 * `View.pictures` and `View.size` are declared and optional. There is no control that turns
 * pictures off and none that sets the writing larger — both arrive with the reading presets — so no
 * reader has ever chosen a value and this has nothing to measure. Writing `'drawn'` and `'default'`
 * would be filing a setting nobody has. When those controls land, they are drawn onto the same
 * element and read on the same walk, and the shape does not change.
 */
export function theViewThisWasWrittenIn(element: HTMLElement): View | undefined {
  const read = readingLengthAbove(element)
  // NOTHING ABOVE THIS WAS DRAWN AT A READING LENGTH, which is the common answer and a true one.
  if (read === null) return undefined
  // A WORD THIS BROWSER CANNOT PLACE IS A DEFECT IN WHATEVER WROTE IT, AND IT IS SAID OUT LOUD.
  //
  // It used to be folded into the line above: the reader accepted the six reading words and
  // answered `undefined` for anything else, so twenty right-clickable cards on the pipeline —
  // which wrote the nine-position card ladder into the same attribute — stored comments with no
  // view and nothing said so. The attribute is split now, so this can only be reached by a
  // component writing a word that is not on the ladder, and that is worth a person's attention
  // rather than a silent gap in somebody's stored evidence. `console.warn` is how this browser
  // already says an unreadable stored value was refused — see `src/web/api.ts` and
  // `src/web/lib/attention.ts`, the two other places that say it.
  if ('problem' in read) {
    console.warn(`Mole Office: ${read.problem}`)
    return undefined
  }
  return { detail: read.length }
}

/**
 * `view` when there is one, and no key at all when there is not. The same rule as `withSeen`.
 *
 * `{ view: undefined }` IS NOT THE SAME AS NO KEY: `JSON.stringify` drops it, so the wire is right,
 * but every reader in the browser asking `'view' in context` is told yes and reads `undefined`.
 * Absence is how this shape says nobody measured it.
 */
function withView(view: View | undefined): { view?: View } {
  return view === undefined ? {} : { view }
}

/**
 * WHICH REGION OF SOMEBODY ELSE'S PAGE THIS THING WAS DRAWN IN, or nothing at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE CASE IT ANSWERS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A link row on a report draws another record's title and, from 30 August 2026, declares that
 * record. So the walk stops on the row and the comment is about the linked record, the linked
 * semantic object. What is then lost is how the writer got there: the row was one of
 * eighteen under *subject of* on a report. That is the region the row sits inside, and this reads
 * it off the page rather than working it out from anything.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES TO RECORD WHAT THE REGION TREE ALREADY HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * A paragraph of a report is drawn inside a section of that same report, and the section is that
 * paragraph's ancestor in the derived tree — one lookup away, on the server, from the id itself. A
 * `drawnIn` there would be one fact in two fields, free to disagree at the next edit. So this
 * answers only when the enclosing region belongs to a DIFFERENT record from the one the target
 * names, which is exactly the ancestry nothing can derive.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SAME WALK, NOT A SECOND ONE
 * ---------------------------------------------------------------------------------------
 *
 * `addressableAt` is what the composer and the mark layer both use, and it is what is called here,
 * starting one element ABOVE the thing that answered. A second walk written for this would be a
 * second reading of what an element says it is.
 */
export function theRegionThisWasDrawnIn(element: HTMLElement, target: Target): DrawnIn | undefined {
  const above = addressableAt(element.parentElement)
  if (above === null || above.target.kind !== 'region') return undefined
  // THE RECORD THIS COMMENT IS ABOUT, when the target names one at all. A target with no record —
  // a page, a part of Mole Office's own screen — is never the same record as the region above it,
  // so it always records where it was drawn.
  const about = targetSpec(target.kind).recordIdentifier
  const aboutRecord = about === null ? null : ((target as unknown as Record<string, string>)[about] ?? null)
  if (aboutRecord !== null && aboutRecord === above.target.recordId) return undefined
  return { recordId: above.target.recordId, regionId: above.target.regionId }
}

/** `drawnIn` when there is one, and no key at all when there is not. The rule of `withSeen`. */
function withDrawnIn(drawnIn: DrawnIn | undefined): { drawnIn?: DrawnIn } {
  return drawnIn === undefined ? {} : { drawnIn }
}

/**
 * WHICH DRAWING THIS WAS ON, READ OFF THE DRAWING ITSELF, or nothing at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE ANCESTOR CHAIN SECTION 4 ASKS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A right-click anchor keeps the exact visible place when it can, the current projection, the
 * underlying stable semantic region, and the ancestor chain.
 *
 * A comment on a card stored the record and the level and nothing above them, so a comment on a
 * module written on the module drawing and one written inside a pipeline's read identically. This
 * is the part nothing else carries, and it is what takes a reader back to the card.
 *
 * ---------------------------------------------------------------------------------------
 * UNDEFINED IS A REAL ANSWER AND IT IS THE COMMON ONE
 * ---------------------------------------------------------------------------------------
 *
 * Most presses are not on a drawing. A record page, a row of the rail, a plan line and the page
 * itself have no drawing above them, and inventing one would be a claim about a screen nobody was
 * looking at. It is the same rule as `theViewThisWasWrittenIn` above and it is read on the same
 * walk, off the same element, for the same reason: the evidence has to be about the thing the
 * comment is filed against.
 */
export function theDrawingThisWasOn(element: HTMLElement): DrawnOn | undefined {
  const read = theDrawingAbove(element)
  // NOTHING ABOVE THIS IS A DRAWING, which is the common answer and a true one.
  if (read === null) return undefined
  // A WORD THIS BROWSER CANNOT PLACE IS A DEFECT IN WHATEVER WROTE IT, AND IT IS SAID OUT LOUD.
  // The same rule as the reading length above it, and the same reason: a silent gap in somebody's
  // stored evidence is worse than a line in the console.
  if ('problem' in read) {
    console.warn(`Mole Office: ${read.problem}`)
    return undefined
  }
  return read.drawnOn
}

/** `drawnOn` when there is one, and no key at all when there is not. The rule of `withSeen`. */
function withDrawnOn(drawnOn: DrawnOn | undefined): { drawnOn?: DrawnOn } {
  return drawnOn === undefined ? {} : { drawnOn }
}

/**
 * WHAT THE REGION A THING WAS DRAWN IN IS CALLED, read off the page rather than off the id.
 *
 * A region id is a key — `section.subject of`, `section.openAround` — and half of those keys are
 * words a reader recognises and half are not. The element carrying the region says what it is
 * called, through the same `data-name` mark every other name on this screen is read from, so the
 * chip reads *What is still open around this* rather than `openAround`.
 *
 * NULL WHEN THE REGION IS NOT ON THIS PAGE, which is honest and is the ordinary case for a comment
 * read back somewhere else. The caller says nothing rather than naming a key.
 */
export function theNameOfWhereItWasDrawn(drawnIn: DrawnIn): string | null {
  const key = targetAttributeValue({ kind: 'region', recordId: drawnIn.recordId, regionId: drawnIn.regionId })
  // THE ELEMENTS ARE COMPARED RATHER THAN SELECTED FOR. A region key holds whatever a section is
  // keyed by — `section.subject of` has a space in it — and a selector would have to escape it,
  // which is a second spelling of the key living in this file. `pointableInThePage` is the set the
  // walk already reads.
  const at = pointableInThePage().find((one) => one.getAttribute(TARGET_ATTRIBUTE) === key)
  if (at === undefined) return null
  const name = nameOnScreen(at)
  return name === '' ? null : name
}

// ============================================================================ the six-rule capture table

/**
 * The selection, when it is real and covers the node that was pressed.
 *
 * IT NO LONGER ASKS WHETHER THE SELECTION STARTED INSIDE THE PRESSED ELEMENT, and that one line is
 * the owner's defect. It used to read `if (!element.contains(range.startContainer)) return null`,
 * so a drag that began in the paragraph above the pointer answered "there was no selection" — the
 * same answer as a bare right-click on empty space. One test, two facts. The selection that ran
 * across a boundary was thrown away and nothing on screen said so.
 *
 * WHAT IT STILL ASKS IS THE ONE THING THAT MATTERS: does this selection cover the thing the person
 * pressed on? That is what stops a right-click on the far side of the page turning into a comment
 * about words somebody selected a minute ago and has stopped looking at.
 */
function selectionCovering(selection: Selection | null, node: Node | null): Range | null {
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (node === null) return null
  // `containsNode` with `true` counts a node the selection only partly covers, which is the
  // ordinary case: the pointer is on a text node the selection runs through.
  if (selection.containsNode(node, true)) return range
  // A press on the ELEMENT itself — the gap between two words, the padding of a block — reports a
  // node the selection does not contain even though the selection is inside it.
  return range.intersectsNode(node) ? range : null
}

/**
 * WHETHER THE WHOLE SELECTION IS INSIDE ONE THING, which decides what the comment is about.
 *
 * IT IS NOW THE ONLY WALK, which is what step 7 kept it alive for. Its one caller used to be the
 * offer beside a finished selection, which is deleted; the capture table below is the caller now.
 *
 * A drag from one paragraph into the next used to become a comment on the paragraph it STARTED in,
 * because only the start of the range was ever read. Measured on a report at 1440 on 18 August
 * 2026: 1,041 characters selected across two blocks, and the composer said "Block of a report" and
 * named the first block's heading — which was not even in the selection. The rest was dropped with
 * no word about it.
 *
 * A selection that leaves the thing it started in is a selection about something bigger, so the
 * walk starts from what holds both ends. That is this file's priority rule doing its work: the
 * words, then the block they are in, then the object that holds the blocks.
 */
function startsAndEndsInOneThing(range: Range, started: HTMLElement): boolean {
  const ended = addressableAt(range.endContainer)
  return ended !== null && ended.element === started
}

/**
 * The nearest thing that says what it is and holds BOTH ends of this selection.
 *
 * THE QUESTION IS ASKED OF THE START, NEVER OF THE THING UNDER THE POINTER, and that is measured
 * rather than chosen. `startsAndEndsInOneThing` compares the range's END against whatever it is
 * given, so giving it the pressed element asks "does this selection end where the pointer is" — and
 * a drag from one paragraph into the next, right-clicked inside the part in the second one, answers
 * yes. Reproduced in Chromium at 1440 on 20 August 2026: the composer read `Block of a report` and
 * named the second block, which is the owner's defect surviving its own repair.
 *
 * Falls back to the thing that was pressed, which holds at least one end, so this never widens to
 * nothing. It never widens past the nearest declaration either: the walk is the same
 * nearest-ancestor walk every other reading in this file uses.
 */
function holdingBothEnds(range: Range, pressed: { element: HTMLElement; target: Target }): {
  element: HTMLElement
  target: Target
} {
  const started = addressableAt(range.startContainer)
  if (started !== null && startsAndEndsInOneThing(range, started.element)) {
    return { element: started.element, target: started.target }
  }
  const both = addressableAt(range.commonAncestorContainer)
  return both === null ? pressed : { element: both.element, target: both.target }
}

/**
 * THE PLURAL OF WHAT ONE OF THESE IS CALLED, or `parts` where this cannot say.
 *
 * `across` draws a count and a noun — `2 blocks`, `3 rows` — and the noun has to be true. There is
 * no plural on the target declaration, so this reads the singular noun that is there and pluralises
 * it only in the two shapes it can do safely: one bare word (`record`, `page`), or `X of a Y` and
 * its siblings, where `X` is the noun and the rest says what it is part of.
 *
 * EVERYTHING ELSE ANSWERS `parts`, which is always true. `proposed action` and `note somebody left
 * on something` are the two that land there today. Guessing a plural for those would be the fifth
 * engineering rule broken for a word nobody needed: `2 parts` is exact, and `2 proposed actions`
 * arrived at by rule would be a guess that happened to be right this time.
 *
 * Exported so tests/where-a-comment-was-made.test.ts can put the question of all fourteen kinds.
 */
export function partWordFor(kind: TargetKind): string {
  const noun = targetSpec(kind).noun
  const one = /^([a-z]+)$/.exec(noun) ?? /^([a-z]+) (?:of|on|in|from) (?:a|an|the) /.exec(noun)
  const word = one?.[1]
  if (word === undefined) return 'parts'
  return /(?:s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`
}

/** One run of drawn text that the selection reaches, with the declared thing it belongs to. */
interface Part {
  run: HTMLElement
  holder: { element: HTMLElement; target: Target } | null
}

/**
 * Every run of drawn text inside `within` that this selection reaches, in document order.
 *
 * It is what the count in `2 blocks` is counted from, and it counts drawings rather than stored
 * characters on purpose: the person chose what they could see.
 */
function partsUnder(range: Range, within: HTMLElement): Part[] {
  const parts: Part[] = []
  for (const run of within.querySelectorAll<HTMLElement>(`[${TEXT_OFFSET_ATTRIBUTE}]`)) {
    if (!range.intersectsNode(run)) continue
    const holder = addressableAt(run)
    parts.push({ run, holder: holder === null ? null : { element: holder.element, target: holder.target } })
  }
  return parts
}

/**
 * HOW MANY THINGS THE SELECTION LAY ACROSS, AND WHAT TO CALL THEM. Both are measured here, in the
 * browser, because nothing on the server can see what was drawn between two runs on somebody's
 * screen.
 *
 * TWO ANSWERS, AND THE SECOND ONE IS NOT A CONSOLATION. When the runs belong to two or more
 * declared things — two paragraphs of a report, three rows of a table — the count is of those and
 * the word is theirs. When they all belong to ONE declared thing, the selection ran across two runs
 * of one paragraph: a bold word, a link, a line break inside one stored string. The count is then
 * of the runs and the word is `parts`, which is the true statement about that gesture. Both are at
 * least two, because a selection whose ends are in different runs reaches at least two of them.
 */
function acrossCount(parts: readonly Part[]): { parts: number; partWord: string } | null {
  const things: HTMLElement[] = []
  const kinds = new Set<TargetKind>()
  for (const part of parts) {
    if (part.holder === null) continue
    if (things.includes(part.holder.element)) continue
    things.push(part.holder.element)
    kinds.add(part.holder.target.kind)
  }
  if (things.length >= 2) {
    const only = kinds.size === 1 ? [...kinds][0] : undefined
    return { parts: things.length, partWord: only === undefined ? 'parts' : partWordFor(only) }
  }
  if (parts.length >= 2) return { parts: parts.length, partWord: 'parts' }
  return null
}

/**
 * A range from the start of this selection to the end of the run that start is in.
 *
 * The end is put at the last position INSIDE the run rather than after the run itself, so the run
 * still holds both ends of what comes back and `spanOfSelection` can place it.
 */
function toTheEndOfTheRun(range: Range, run: HTMLElement): Range {
  const first = range.cloneRange()
  first.setEnd(run, run.childNodes.length)
  return first
}

/** A range from the first position inside the run this selection ends in, to the selection's end. */
function fromTheStartOfTheRun(range: Range, run: HTMLElement): Range {
  const last = range.cloneRange()
  last.setStart(run, 0)
  return last
}

/**
 * A SELECTION WHOSE TWO ENDS ARE IN TWO DIFFERENT RUNS, kept as two exact ends.
 *
 * Null when either end cannot be placed exactly, and then the caller keeps the words verbatim
 * instead. It never joins the two ends into one span: the characters between two runs were never
 * drawn — the asterisks around a bold word, the newline between two lines of a paragraph — so a
 * quote taken across the join is not the stored text between those two offsets, and the server
 * would read the comment back and report that untouched words had changed.
 */
function acrossPlace(range: Range, within: HTMLElement): Place | null {
  const start = runAt(range.startContainer, within)
  const end = runAt(range.endContainer, within)
  if (start === null || end === null || start.element === end.element) return null
  // DOCUMENT ORDER, ASKED RATHER THAN ASSUMED. A `Range` puts its own ends in order, and the runs
  // holding them are then in order too — but a run can contain another, and the reading below
  // treats them as two separate pieces of one string. Two ends in the same order as their runs is
  // what makes `from` and `to` mean first and last.
  const after = start.element.compareDocumentPosition(end.element)
  if ((after & Node.DOCUMENT_POSITION_FOLLOWING) === 0) return null
  const from = spanOfSelection(toTheEndOfTheRun(range, start.element), within)
  const to = spanOfSelection(fromTheStartOfTheRun(range, end.element), within)
  if (from === null || to === null) return null
  const counted = acrossCount(partsUnder(range, within))
  if (counted === null) return null
  return { at: 'across', from, to, parts: counted.parts, partWord: counted.partWord }
}

/**
 * WHERE THE PERSON WAS, AS SEVEN RULES IN ORDER. The first that holds, wins.
 *
 * ---------------------------------------------------------------------------------------
 * THE TABLE, AND WHAT EACH ROW IS FOR
 * ---------------------------------------------------------------------------------------
 *
 *   1  the node is inside a text box holding a       -> `words`, or `quote` when the box does not
 *      selection                                        say which stored string it draws
 *   2  a selection covers the pressed node and both  -> `words`
 *      ends are in ONE run
 *   3  ...both ends in runs, different runs          -> `across`, and the thing widens to whatever
 *                                                       holds both ends
 *   4  ...a selection covers the node and 2 and 3    -> `quote`, holding the words verbatim
 *      both fail
 *   5  no selection, and a run is under the pointer  -> `run`, named by where that run starts
 *   6  ...the thing stores no text, and a piece of   -> `quote`, holding that piece's words
 *      it under the pointer draws words of its own
 *   7  otherwise                                     -> `surface`
 *
 * RULE 6 IS WHAT KEEPS A PRESS ON MOLE OFFICE'S OWN WORDS FROM ANSWERING THE WHOLE PANEL, and it is the
 * same shape as rule 5 one step out: rule 5 asks whether the pointer is inside a run of stored
 * text, and rule 6 asks whether it is inside a piece of the screen that says something of its own.
 * `ownWordsUnder` above is the rule and says what it reads.
 *
 * RULE 6 RUNS ONLY WHERE NOTHING IS STORED, and that is a line the round-eight acceptance drew. A
 * record's row draws its title, a state word, a count and a press, and all of those are facts ABOUT
 * the record rather than things of their own: a right-click anywhere across that row names the
 * record, which tests/seven-surfaces.test.ts measures at three points across its width. A part of
 * Mole Office's own screen is the opposite case. Its words live in a .tsx file and in no record, so
 * there is no stored string to name a position in, and a quote is the only way to record where
 * somebody was standing at all.
 *
 * RULE 7 IS WHY THIS IS TOTAL. Before it, a place was recorded ONLY when there was a text
 * selection, so a right-click on a paragraph with nothing selected recorded nothing about where the
 * person was — and two of the owner's own comments are stored that way, against a whole 61-block
 * report. `surface` is the honest floor: it says no place finer than the thing was recorded, which
 * is a real answer rather than an absence.
 *
 * RULE 5 STORES THE RUN'S OWN START OFFSET, never the character under the pointer.
 * `caretRangeFromPoint` would give a sharper number in Chromium and nothing in the other two
 * engines, so one shape would carry two precisions with nothing saying which — and the drawing is
 * the run either way. The answer it needs was already computed at `runAt` and was thrown away.
 *
 * Exported so a test can put the six rules without opening the composer.
 */
export function placeOf(
  node: Node | null,
  selection: Selection | null,
  pressed: { element: HTMLElement; target: Target },
): { place: Place; on: { element: HTMLElement; target: Target }; kept: Range | null } {
  const here = (place: Place, kept: Range | null = null) => ({ place, on: pressed, kept })
  // A page and a part of Mole Office's own screen hold no stored string, so a position inside one would
  // name characters nothing keeps. The server refuses it; this never sends it.
  const quotable = targetSpec(pressed.target.kind).holdsText

  // 1. WORDS SELECTED INSIDE A BOX SOMEBODY TYPES IN, which no document selection reports. It is
  // asked first because a box holding a selection is where the person's words are, and the
  // document's selection at that moment is somewhere else or is nothing at all.
  const typed = typedSelection(node)
  if (typed !== null) {
    const span = quotable ? spanFromTyped(runAt(typed.box, pressed.element), typed) : null
    if (span !== null) return here(boundedPlace({ at: 'words', span }))
    // THE WORDS ARE KEPT EVEN THOUGH THEY CANNOT BE PLACED. They used to be dropped and the box
    // said so in a sentence; keeping them is what `quote` is for.
    return here(boundedPlace({ at: 'quote', words: typed.quote.trim() }))
  }

  const range = selectionCovering(selection, node)
  if (range === null) {
    // 5. NO SELECTION, AND A RUN UNDER THE POINTER.
    const run = quotable ? runAt(node, pressed.element) : null
    // THE REGION IS ALREADY THE ANSWER WHEN THE RUN STARTS WHERE THE REGION DOES. A region deeper
    // than a block is named by where its characters start, so `…text@530` and a run at character 530
    // of `text` are the same fact written twice, in two fields of one context, free to disagree.
    // `checkPlace` on the server refuses that pair; this is the half that stops it being sent.
    if (run !== null && !runRepeatsTheRegion(pressed.target, run)) {
      return here({ at: 'run', field: run.field, offset: run.offset })
    }
    if (run !== null) return here({ at: 'surface' })
    // 6. NO SELECTION, AND A PIECE OF MOLE OFFICE'S OWN SCREEN UNDER THE POINTER DRAWS ITS OWN WORDS.
    const own = quotable ? null : ownWordsUnder(node, pressed.element)
    if (own !== null) return here(boundedPlace({ at: 'quote', words: own }))
    // 7. NOTHING FINER THAN THE THING ITSELF.
    return here({ at: 'surface' })
  }

  const kept = range.cloneRange()

  // 2. BOTH ENDS IN ONE RUN OF THE THING THAT WAS PRESSED.
  const span = quotable ? spanOfSelection(range, pressed.element) : null
  if (span !== null) return { place: boundedPlace({ at: 'words', span }), on: pressed, kept }

  // 3. BOTH ENDS IN RUNS, DIFFERENT RUNS. The thing widens to whatever holds both of them, which
  // is what stops the comment being filed against the block the pointer happened to be in.
  const wider = holdingBothEnds(range, pressed)
  if (targetSpec(wider.target.kind).holdsText) {
    const across = acrossPlace(range, wider.element)
    if (across !== null) return { place: boundedPlace(across), on: wider, kept }
    // A selection whose ends are in ONE run of the wider thing, pressed on something smaller.
    const inside = spanOfSelection(range, wider.element)
    if (inside !== null) return { place: boundedPlace({ at: 'words', span: inside }), on: wider, kept }
  }

  // 4. THE WORDS ARE ON SCREEN AND NO STORED STRING CAN BE SHOWN TO HOLD THEM. They are kept
  // verbatim, which is what makes a comment on a part of Mole Office's own screen possible at all.
  const words = range.toString().trim()
  if (words === '') return { place: { at: 'surface' }, on: wider, kept: null }
  return { place: boundedPlace({ at: 'quote', words }), on: wider, kept }
}

/**
 * NO NEW BOUND IS DECLARED: a character limit declared privately by one module is how this repository ended up
 * with ten of them. `shortenToWords` uses the shared `SHOWN_CHARACTERS`; `cut: true` says this is only the opening.
 * The selected range stays whole so the server can still find where the comment points.
 */
function boundedPlace(place: Place): Place {
  if (place.at === 'words') {
    const shortened = shortenToWords(place.span.quote)
    return shortened.shortened
      ? { ...place, span: { ...place.span, quote: shortened.words }, cut: true }
      : place
  }
  if (place.at === 'across') {
    const from = shortenToWords(place.from.quote)
    const to = shortenToWords(place.to.quote)
    return from.shortened || to.shortened
      ? {
          ...place,
          from: from.shortened ? { ...place.from, quote: from.words } : place.from,
          to: to.shortened ? { ...place.to, quote: to.words } : place.to,
          cut: true,
        }
      : place
  }
  if (place.at === 'quote') {
    const shortened = shortenToWords(place.words)
    return shortened.shortened ? { ...place, words: shortened.words, cut: true } : place
  }
  return place
}

/**
 * Whether a run of text says exactly what the region target already says.
 *
 * True only for a region target whose id carries an offset, when the run names that region's own
 * field and starts at that same character. A bold phrase further into the paragraph is a different
 * offset and survives; a whole paragraph is the region and needs no second name.
 */
function runRepeatsTheRegion(target: Target, run: { field: string; offset: number }): boolean {
  if (target.kind !== 'region') return false
  const at = offsetOf(target.regionId)
  return at !== null && at === run.offset && run.field === identityOf(target.regionId)
}

/**
 * What a press at this node is pointing at. Never null: a press on nothing is a press on the page.
 *
 * A SELECTION INSIDE THE THING NARROWS IT, and a selection that RUNS OUT OF IT WIDENS IT. Both are
 * the priority rule doing its work: the words, then the run they are in, then the thing that holds
 * the runs. `placeOf` above is the whole of it.
 *
 * `context.span` IS DERIVED AND NEVER WORKED OUT SEPARATELY. `spanOf` is the one function that
 * turns a place into a span, so the two cannot name different words. Nothing on the wire changes in
 * this step: a place that is `words` sends the same span the old reading sent, and every other
 * place sends none, exactly as before. The place itself reaches the server in step 20, which is the
 * step that opens both doors to it.
 *
 * `context.seen` IS MEASURED HERE AND NOWHERE ELSE, on both branches, because both can answer with
 * a thing that holds no words of its own — the second branch when the press lands on a part of the
 * rail, the first when it lands on nothing at all and the answer is the page. A press on anything
 * that holds stored text gets none, and `seenRuleFor` is the one place that is decided.
 */
export function pointedAt(node: Node | null, selection: Selection | null): Pointed {
  const found = addressableAt(node)
  if (found === null) {
    // THE PAGE IS NAMED ONCE. The shell draws the page's own name beside the page's key, so when
    // the answer is the page the name comes off that element rather than being worked out again
    // here. Two readings drifted while both were live: the shell says `Needs you` on `#/` and
    // `pageName` says `Mole Office home — what needs your attention`, so the same press gave two
    // different chips depending on which branch it came down. `pageName` is the last resort and it
    // is now reached only where no shell has rendered — a test, or the first frame of a load.
    const floor = theFloor()
    const page = thePage()
    const element = floor ?? document.body
    return {
      element,
      context: { target: page, ...withSeen(theScreenThisWasSeenOn(element, page)) },
      about: floor === null ? pageName() : nameOnScreen(floor),
      place: { at: 'surface' },
      kept: null,
      problems: [],
    }
  }
  const { element, target, problems } = found
  const { place, on, kept } = placeOf(node, selection, { element, target })
  return {
    element: on.element,
    about: nameOnScreen(on.element),
    problems,
    // THE PLACE IS WHAT IS SENT, AND THE SPAN IS NOT SENT BESIDE IT. `checkPlace` on the server
    // refuses a context carrying both, because one fact in two fields is free to name two different
    // sets of words. Every reader that wants a span calls `spanOf(context.place)`.
    //
    // THE `seen` IS MEASURED OFF THE THING THAT ANSWERED, `on.element`, and not off the element the
    // pointer was over. A selection that ran out of a bullet widens the answer to the section, and
    // the evidence has to be about the thing the comment is filed against or it is evidence about
    // something else.
    //
    // THE `view` IS MEASURED OFF THE SAME ELEMENT, for the same reason and with the same rule: the
    // evidence has to be about the thing the comment is filed against. A press on anything that is
    // not inside a record's own writing gets none, and that is the common case.
    context: {
      target: on.target,
      place,
      ...withSeen(theScreenThisWasSeenOn(on.element, on.target)),
      ...withView(theViewThisWasWrittenIn(on.element)),
      // WHERE THE WRITER MET THIS, when they met it on another record's page. It is measured off
      // the same element as the two above, for the same reason: the evidence has to be about the
      // thing the comment is filed against.
      ...withDrawnIn(theRegionThisWasDrawnIn(on.element, on.target)),
      // AND WHICH DRAWING IT WAS ON, when it was on one. Measured off the same element as the
      // three above, for the same reason.
      ...withDrawnOn(theDrawingThisWasOn(on.element)),
    },
    place,
    kept,
  }
}

/**
 * `seen` when there is one, and no key at all when there is not.
 *
 * `{ seen: undefined }` IS NOT THE SAME AS NO KEY. `JSON.stringify` drops it, so the wire would be
 * right, but every reader in the browser that asks `'seen' in context` would be told yes and read
 * `undefined`. Absence is the answer this shape uses for "nobody measured this", and it is written
 * once here rather than at each of the two call sites above.
 */
function withSeen(seen: Seen | undefined): { seen?: Seen } {
  return seen === undefined ? {} : { seen }
}

// ============================================================================ what must not be taken

/**
 * NOTHING IS EXEMPT ANY MORE, AND THAT IS THE CHANGE ROUND EIGHT MADE.
 *
 * Two exemptions used to live here: a link, and a box somebody types in. Between them they covered
 * almost every pixel of a row. Measured in Chromium at 1440 on 18 August 2026, a right-click on a
 * module row 1146px wide opened nothing at 20%, 50% or 80% of its width, because one link lay over
 * all of it; and a right-click inside a plan line's box opened nothing either. What was left working
 * was the 8px gutter and the gaps between controls — which design/UX-CONTRACT.md names by hand as a
 * failure: *somebody discovers it only by experimenting with blank space*.
 *
 * THE LINK EXEMPTION IS GONE FOR GOOD. Mole Office takes the menu wherever something under the pointer
 * says what it is, and a link is not a reason to refuse. Shift and a right-click reaches the
 * browser's own menu anywhere at all. See the listener in open.ts, which is where that rule is
 * written and applied once.
 *
 * THE BOX EXEMPTION CAME BACK, AND IT IS A DIFFERENT RULE FROM THE ONE THAT LEFT. The old one named
 * a component and refused a whole row with it. The new one asks what the thing under the pointer
 * CAN DO: a box a person types in belongs to the browser, because paste, spell-check and look-up
 * live there and were unreachable in every box in the product until 21 August 2026. Contract 5.5,
 * and `design/round-nine/caf8-the-browsers-own-menu.md` holds the measurement.
 *
 * THE COMPOSER'S OWN BOX IS THE ONE MOLE OFFICE STILL TAKES, and it is the point rather than an
 * oversight. An instruction nobody has sent is one of the thirteen things a person can point at, so
 * the box it is written in says what it is like everything else, and a phrase inside it is read by
 * `typedSelection` and placed by `spanFromTyped` exactly as a selection in a plan line's box is.
 * This file needed no change at all for that, which was the owner's test of whether the target
 * model is right.
 */

// ============================================================================ asking for the box

/**
 * ASK FOR THE BOX ON THIS ELEMENT, from a control that is not the pointer.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SAME DISPATCH, NOT A SECOND WAY IN
 * ---------------------------------------------------------------------------------------
 *
 * A page whose whole job is starting conversations wants a press on each row, and a press has to
 * end up exactly where a right-click ends up. So this opens nothing of its own: it calls the one
 * function every gesture calls. There is no second path into the composer to keep in step with the
 * first, which is the defect this repository keeps finding.
 *
 * IT USED TO FAKE A RIGHT-CLICK, and the fake said something untrue. It built a `contextmenu` event
 * and dispatched it on the element, so the document listener would answer. A `MouseEvent` made that
 * way reports `button: 0` — the left button — for a gesture where no button was pressed at all. The
 * listener now reads `button` to tell a menu raised from the keyboard from one raised by a pointer,
 * so that number had gone from unused to load-bearing. Calling the function directly says what
 * actually happened: a control asked for the box on this element, with no pointer anywhere.
 *
 * The box hangs under the element, which is where every gesture with no pointer puts it.
 */
export function askToTalkAbout(element: HTMLElement | null): void {
  if (element === null) return
  openAbout(element, { at: 'element', element })
}

/** The nearest element that says what it is, as an element. Used by a control asking for the box. */
export function addressableElement(from: Element | null): HTMLElement | null {
  return addressableAt(from)?.element ?? null
}
