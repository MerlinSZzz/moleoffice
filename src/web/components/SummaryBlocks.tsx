// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SummaryBlocks -- the curated summary of a module.
 *
 * This is the part of a record a human wrote on purpose: the handful of things worth knowing
 * without opening the full report. Everything else in Mole Office is generated, listed or linked;
 * this is the one place someone chose what matters, so it is the one place that gets prose, a
 * plot, an equation and a quote.
 *
 * THE ARCHIVE IS NEVER COPIED. An image block holds a PATH, not a file. Mole Office does not move it,
 * thumbnail it or cache it. That is the whole architecture in one component: reports and data stay
 * where they are, and the tracking layer only points at them. So an image or path block always
 * shows its path and always makes it copyable, whether or not the picture itself can be drawn.
 *
 * ---------------------------------------------------------------------------------------
 * THE PICTURE NOW RENDERS, AND WHAT CHANGED IS NOT THIS FILE'S MIND
 * ---------------------------------------------------------------------------------------
 *
 * This component used to draw a grey box and a path for every image block, and the page contained
 * no `<img>` element at all. That refusal was CORRECT and it is documented three times in src/web:
 * a page fetched over http cannot open a `file:///...` address, so an `<img src>` pointing at one
 * would have been a permanently broken icon suggesting the file was missing when it was sitting on
 * the disk. The argument was against FAKING the picture. It was never against serving the bytes.
 *
 * `GET /api/file` now serves them, under a confinement rule stated in full in
 * src/server/api/files.ts: a LIVE record must already store that exact path, the file must be on
 * this machine, and it must sit inside a directory named in MOLE_OFFICE_PREVIEW_ROOTS both as written
 * and after every symlink is resolved. Being listed in the roots is not enough on its own. So this
 * component asks that endpoint, and draws whatever comes back.
 *
 * WHAT IT STILL WILL NOT DO. Nothing stands in for the picture. There is no placeholder graphic,
 * no thumbnail, no `file://`, and no `<img>` element on the page unless real bytes arrived for it.
 * When the picture cannot be drawn the page says WHY, in words, and the five reasons are kept
 * apart because they are five different facts with five different repairs — see PREVIEW_STANDS.
 * "Nobody has asked yet", "Mole Office refused", "the file is not there" and "the bytes arrived and are
 * not a picture" must never be drawn as one another.
 *
 * ---------------------------------------------------------------------------------------
 * THE INSIDE OF A LINE IS NOT READ HERE, AND THE BLOCKS ARE
 * ---------------------------------------------------------------------------------------
 *
 * What two asterisks, a back tick, a bracket pair and a dollar sign mean is answered in
 * src/shared/inline.ts, once, for every surface in this product. It used to be answered here as
 * well, so a plan printed its dollar signs while a record beside it drew the equation. Import
 * renderInline; do not write a second reading of a marker in this file.
 *
 * WHICH LINES ARE HEADINGS, LISTS AND QUOTES IS STILL ANSWERED HERE, and separately again in
 * src/shared/plandoc.ts for a plan. That is deliberate and it is not the drift above.
 *
 * A plan's block reader must be byte exact and line addressable: every line of a plan is a stored
 * row somebody can file as work, give hours to and point at a record, so it hands back every
 * character it was given, in the same lines, with the same ids. A record's summary has no stored
 * lines and no addresses. renderMarkdown below reflows a paragraph, joins wrapped lines and drops
 * blank ones, which a plan may never do. Merging the two would either make a plan quietly rewrite
 * what somebody typed, or give a summary a line model nothing uses.
 *
 * ---------------------------------------------------------------------------------------
 * THERE IS ONE DECLARATION OF WHAT A BLOCK IS, AND IT IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * `SummaryBlock` in src/shared/types.ts is the shape, `src/server/lib/summary.ts` is the same shape
 * as the rules a write is checked against, and this file draws it. This component used to declare
 * its own twelve block types beside those, and the three did not agree: it read `md` where the
 * store said `text`, `headers` where the store said `columns`, and a bare array where the store said
 * a row is an object with `cells`. Every one of those spellings was drawn here and REFUSED by the
 * write path, so a person could see something on screen that they could never store.
 *
 * MEASURED BEFORE DELETING THEM, on a copy of the owner's corpus, 18 August 2026: of the 54 blocks
 * in it, none used `md`, none used `headers`, none wrote a row as a bare array, none wrote a column
 * as a plain string and none was missing an id. Every one used the stored spelling. So the tolerance
 * was drawing shapes nothing had ever written, and the loose readers are gone.
 *
 * WHAT IS KEPT IS THE TOLERANCE THAT MATTERS: a block whose type this build has never heard of, or
 * a table whose rows do not match its header, becomes a VISIBLE box naming the problem, never a gap
 * in the page. Refusing a bad block is the server's job and it does it at write time.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY RUN OF TEXT SAYS WHERE IT CAME FROM, AND WHY THAT IS THE POINT OF THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * What is drawn is rendered Markdown. What is stored is Markdown source. They are not the same
 * characters, so a quote taken off the screen cannot be found in the source, and round seven
 * refused to quote a report at all rather than guess. The refusal was honest and it is why a report
 * could not be commented on.
 *
 * So this file now says, on the element itself, WHICH STORED STRING a run of drawn text came from
 * and WHERE IN IT the run starts. `src/shared/targets.ts` holds the contract for the three
 * attributes. A selection then becomes a range of the source by arithmetic, and nothing searches.
 *
 * THE ONE RULE THAT MAKES THE ARITHMETIC TRUE: an element carrying an offset holds EXACTLY the
 * stored characters that offset names. So the attributes go on the leaf runs and never on a
 * container — a paragraph holding a bold run holds four asterisks fewer than its source, and an
 * offset on it would report words nobody had touched as changed. `saidToBe` below is the one place
 * an offset is written, and it checks the stored string before writing one. When it cannot check,
 * nothing is written, and a comment on that run is a comment on the block instead. Absent is a real
 * answer; a wrong offset is a sentence Mole Office would say later that is not true.
 */

import {
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { hiddenFromReader, readerSees, type Reader } from '@shared/audience.ts'
import { count, t, wordLanguage, type WordKey } from '@shared/i18n.ts'
import { theChineseOfATextBlock } from '@shared/office-rules.ts'
// Every number a composition uses lives in one shared module, and the stylesheet below interpolates
// the floors from it rather than writing them a second time.
import { LEAST_REM, equalColumns, measureMaxWidth, roomFor, type PartRoom } from '@shared/beside.ts'
import { byId } from '@shared/fielddiff.ts'
// The one reading and the one drawing of the inside of a line, shared with the plan document.
// INLINE_CSS carries the rules for what it draws; a caller that omits it gets unstyled code spans
// and links, which is why it is emitted beside this file's own stylesheet in SummaryStyle below.
import { INLINE_CSS, renderInline, type TextOrigin } from '@shared/inline.ts'
import { blocksFieldOf } from '@shared/kinds.ts'
import { countDisagreementIn } from '@shared/waitingclaims.ts'
import { TEXT_LINES_ATTRIBUTE, drawnFrom, selectorForKind, targetAttributes, textAttributes, type Target } from '@shared/targets.ts'
// WHAT THIS DRAWING SAYS ABOUT ITSELF: the reading length it drew, written onto the element it drew.
// The attribute's name, the words it may carry and the one reader of them are declared together, so
// this component, the stylesheet below and the reader that files a comment cannot come to different
// answers about which drawing somebody was looking at.
import { READING_LENGTH_ATTRIBUTE, drawnAtLength } from '../lib/drawnat.ts'
// WHERE THIS DRAWING LEAVES THE REGIONS IT DERIVED, so the layer that draws a stored comment can
// ask how that comment draws at the length a reader is at, without deriving the tree a second time.
import { forgetReportDrawn, noteReportDrawn } from '../lib/drawnreport.ts'
import {
  carriesTarget,
  fitOf,
  flatten,
  leastNeededBy,
  leastNeededByBlocks,
  partRegionId,
  regionOfDrawnLine,
  regionsOf,
  recordRegionsOf,
  ROLE_OF_BLOCK,
  widthNeededBy,
  type Fit,
  type Least,
  type RecordRegionSource,
  type Region,
  type RegionRole,
  type WidthNeeded,
} from '@shared/regions.ts'
import { RegionsControl, REGIONS_CSS } from './RegionOverlay.tsx'
// THE ONE FUNCTION THAT WRITES A REGION TARGET ONTO A LINE that is not a component taking `declares`.
import { theRegion } from './sections.ts'
import { DRAWS_THE_NAME, nameAttributes, partOfMoleOffice } from './agent/pointing.ts'
import type {
  BesidePart,
  CalloutTone,
  FileBlock,
  ImageBlock,
  PathBlock,
  ItemState,
  SummaryBlock,
  SummaryBlockType,
  TableBlock,
  TableRow,
  TabsBlock,
  WorldBlock,
} from '@shared/types.ts'
// HOW MANY BYTES A FILE IS, IN THE WORDS A READER USES. Criterion R3. A file block shows its size
// and this is where the words for it come from.
import { sizeSaid } from '@shared/fileblocks.ts'
import { MAX_PREVIEW_BYTES } from '@shared/preview-limit.ts'
// The one reader of a table written with pipes, written for a plan and used here as well. Reading
// the pipes in this file would be a SECOND reader of what a pipe table is, which is the defect this
// repository keeps finding; calling the one that exists is not.
import { blocksOf as planBlocksOf, whyNotRead } from '@shared/plandoc.ts'
import { openAbout, withoutAPointer } from './agent/open.ts'
import { api, moleOfficeHeaders, theProjectARequestNames } from '../api.ts'
import { whereRequestsGo } from '../lib/visiting.ts'
import { aRequestSettled, aRequestStarted } from '../lib/ready.ts'
import { Chart } from './Chart.tsx'
import { InReach, InReachMark, reachBox, useReach } from './InReach.tsx'
import { MathText } from './MathText.tsx'
import { Player, ReportAudio, ReportVideo } from './ReportMedia.tsx'
import { OpensLarge } from './PictureLarge.tsx'
import { SIGNED_TYPES } from '@shared/file-signatures.ts'
import { theShownFileKind } from '@shared/shown-file.ts'
// THE QUESTIONS A REPORT ASKS THE PERSON. Their words are
// drawn here, as every block's words are; their controls and their submits are drawn there.
import { ButtonQuestion, ChoiceQuestion, FillInQuestion, QuestionBox } from './ReportQuestions.tsx'
// A summary REPORTS a state, it never changes one, so every state here is a StateChip with no
// onChange -- the label form. Re-implementing the chip would give the same state two
// appearances in one page, which is exactly what the shared component library is for.
import {
  FLOORED_SURFACE,
  OFFERED_TO_A_READER,
  RUNGS,
  isReaderRung,
  nearestOffered,
  readerFloorApplies,
  readerRungsFor,
  stepWithin,
  type Chosen,
  type DetailSource,
  type Rung,
} from '@shared/detail.ts'
// THE NAME OF THIS PART OF THE SCREEN, and there are two of them here: the level control is drawn
// above the report and again below it, and each place is its own region of the page.
import type { SurfaceId } from '@shared/surfaces.ts'
import { type Pictures } from '@shared/pictures.ts'
// WHETHER MEDIA A RECORD POINTS AT ARE LOADED, criterion U5. NOT `messagepictures.ts`: that is the
// picture inside a chat message, and this is the picture or video in a report.
import {
  MEDIA_LOAD_BY_DEFAULT,
  MEDIA_LOAD_PRESS,
  MEDIA_LOAD_SIZE_NOT_KNOWN,
  mediaLoadSays,
  type MediaLoadChoice,
} from '@shared/mediaload.ts'
import { formsWrittenIn, reportAt, type DrawnPart, type ReportLine, type ReportSummary } from '@shared/reportrungs.ts'
import {
  machineryRevealedHere,
  setDetailHere,
  setMachineryRevealedHere,
  setPicturesHere,
  useDetail,
  usePictures,
} from '../lib/detailchoice.ts'
import { useMediaLoad, useMediaLoadWasRead } from '../lib/mediaload.ts'
import { useInspect, useReader } from '../lib/mode.ts'
import { NO_LONG_VERSION } from '../lib/words.ts'
import { Absence, Hint, Select, StateChip } from './ui.tsx'

export type { SummaryBlock } from '@shared/types.ts'

// ---------------------------------------------------------------------------- the component

/**
 * The one wording for "nobody has written the long version of this", re-exported because the module
 * page needs the same sentence for the case this component never sees: a module with a one-paragraph
 * summary and no blocks renders no `SummaryBlocks` at all.
 *
 * IT IS DECLARED IN `src/web/lib/words.ts`, with this product's other shared words, and that file
 * says why at length. Both uses hand it to `Absence`, which is what chooses how much weight an
 * emptiness gets.
 */
export const NO_SUMMARY = NO_LONG_VERSION

/**
 * Everything this component draws needs rules for: its own blocks, and the code spans, links and
 * image notes that src/shared/inline.ts draws inside a line. One component so the two stylesheets
 * cannot get out of step with each other, and so the empty state and the full one cannot either.
 */
export function SummaryStyle() {
  return (
    <style href="mole-office-summary" precedence="default">
      {INLINE_CSS + SUMMARY_CSS + REGIONS_CSS}
    </style>
  )
}

/**
 * HOW THESE BLOCKS ARE SET: THE PROFILES, DECLARED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * A PROFILE IS A SET OF TOKEN VALUES AND IT IS NEVER A SECOND RENDERER
 * ---------------------------------------------------------------------------------------
 *
 * There is one drawing of a block in this file, and choosing a profile does not reach it. What a
 * profile changes is a handful of custom properties declared on the outermost element — how far
 * apart the blocks sit, how wide a line of text runs, the four heading sizes, how heavy the line
 * under a heading is, how tight a table's rows are, how round a box is, and how far a table or a
 * picture may run past the reading column. Every rule in SUMMARY_CSS reads those properties; each
 * profile below is one CSS block that declares them and nothing else.
 *
 * That is the whole architecture in one sentence: many presentations, one
 * renderer. tests/blocks-profiles.test.ts holds it to that — a profile whose CSS block contains any
 * declaration that is not a custom property is red, and so is a profile with no CSS block at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `ownsWidth` IS HERE AND IS NOT A TOKEN
 * ---------------------------------------------------------------------------------------
 *
 * It is whether the element takes a maximum width of its own. `panel` is a module's curated
 * summary: a run of blocks inside a panel that already has a width. `page` is a report, where the
 * blocks ARE the page under the record's title. No custom property can say this, so it is a flag
 * on the declaration rather than a branch anybody writes.
 *
 * `chosenBy` USED TO SIT BESIDE IT AND IS GONE. It said who picks a profile: a reader, from a
 * control, or the container drawing the blocks. Both profiles left are picked by the container, so
 * the field had one value everywhere and said nothing. What a reader picks now is how much a
 * report says, whether its pictures are drawn, and how large the type is — three dimensions with
 * their own vocabularies, none of them a profile.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PROFILE IS NOT: IT IS NOT A POSITION ON THE DETAIL AXIS
 * ---------------------------------------------------------------------------------------
 *
 * A profile says whether these blocks are a page or are inside a panel. The detail axis
 * (`src/shared/detail.ts`) says how much of the writing there IS. They are two axes and they must
 * stay separable: changing one may not change the other. `tests/blocks-profiles.test.ts` holds one
 * assertion for this — no profile id and no profile name may be a word on the detail axis — which
 * is what stops `Compact`, `Brief` or `Full` arriving here again and fusing the two.
 */
export interface BlocksProfile {
  /** The word stored, written into `data-profile`, and used as the CSS selector. */
  id: string
  /** What it is called where somebody names it. */
  name: string
  /** True where these blocks are the whole page and take a maximum width of their own. */
  ownsWidth: boolean
}

/**
 * THE TWO PROFILES, AND BOTH ARE CHOSEN BY THE CONTAINER.
 *
 * There were six: `panel`, `editorial`, `technical`, `data`, `presentation` and `review`. Four of
 * them were reading styles a reader picked, and measured on the owner's own report all four drew an
 * identical tree of 240 elements with the same 1,836 words. What they differed in was type size,
 * reading measure, spacing and corner radius — which is a text size, and text size is now its own
 * dimension in `src/shared/textsize.ts`. `review` had no call site anywhere in the repository.
 *
 * `editorial` is renamed `page`, because that is what it was: a report drawn as the page. Its
 * stylesheet block does not come with it — every declaration in it was a lane width, a heading
 * size, a line height or a gap, and those are exactly what the text size and Density own now.
 *
 * A browser that still holds one of the eight old words is not migrated any more: the migration
 * (`src/web/lib/readingstyle.ts`) had had no caller since a759e7941 and was deleted, so an old word
 * is simply not one of these profiles.
 */
/**
 * `what` IS GONE FROM THIS TABLE, PROVEN NEVER DRAWN (wave 13k round 14, w13k-cx-rp-checks).
 *
 * `BlocksProfile` used to carry a one-line `what` beside `id` and `name` — "A report, where the
 * writing under the record's title is the page." and "A module's curated summary, inside a panel
 * that already has a title." Neither string has a reader in the repository. `profileNamed` reads
 * only `.id`, the report reader checks whether its result owns width, and the two profile tests read
 * `.id` and `.name`. The sweep `rg -n 'BlocksProfile|BLOCKS_PROFILES|profileNamed|\.what\\b' src/web tests`
 * finds no access from a profile to `what`; its other `.what` matches are unrelated values. So this
 * line was written for a picker that was never built and never drawn, and it is removed rather than
 * given a key.
 */
export const BLOCKS_PROFILES = [
  {
    id: 'page',
    name: 'Page',
    ownsWidth: true,
  },
  {
    id: 'panel',
    name: 'Panel',
    ownsWidth: false,
  },
] as const satisfies readonly BlocksProfile[]

/**
 * WHICH PROFILE. The type is derived from the list above, so a word nothing declares does not
 * compile and a profile added to the list is immediately something a caller can ask for.
 */
export type BlocksLayout = (typeof BLOCKS_PROFILES)[number]['id']

/**
 * ---------------------------------------------------------------------------------------
 * `fit` — WHAT A BLOCK IS WORTH IN WIDTH, AND `data-needs` — HOW MUCH WIDTH IT ACTUALLY NEEDS
 * ---------------------------------------------------------------------------------------
 *
 * A REPORT HAS ONE COLUMN AND IT IS THE WHOLE WIDTH. That was settled on 29 August 2026: a
 * Semantic Region owns all of its space, and columns exist only where a composition has siblings
 * to put in them. So no block chooses between columns any more. The three fits are still declared
 * in `src/shared/regions.ts`:
 *
 *   read      one column of text. A sentence has one right width
 *   measured  as wide as the browser measures the content, up to the parent's box
 *   spanning  the whole box it is given, because it lays its own children out or draws to its box
 *
 * ONLY `measured` STILL CHANGES ANYTHING IN CSS, and it is honest to say so here rather than leave
 * a reader hunting for the other two. `read` and `spanning` had one rule each, and both rules said
 * "take this column" in a grid that now has one column and gives that answer for free. The words
 * are still written into the markup by `fitAttribute` below, so what a block is worth can still be
 * read off the page, and whether they should still be written is a question for whoever next opens
 * `src/shared/regions.ts` — the same open question `data-needs` already has.
 *
 * NEITHER THE WORDS NOR THE MAP LIVE HERE ANY MORE, AND THAT IS THE POINT. This file used to
 * declare four fits and a map from every block type to one of them, while `regions.ts` declared
 * three fits and a map from every region role to one of those. Two answers to one question, and on
 * 27 August 2026 they disagreed about nine of the twenty block types with nothing failing — a chart
 * was `measured` in one file and `fill` in the other, a bullet list was `spanning` in one and `read`
 * in the other. The region tree is where a report's meaning is worked out, so that is where the
 * answer is, and this file asks for it.
 *
 * WHAT THIS REPLACED, AND WHY IT IS THE OWNER'S COMPLAINT. There were four lanes worked out from
 * two tokens: prose at 34rem, wide at 34rem + 8rem, full, and a sidebar with no consumer. So a
 * table stood in a 672px lane inside an 1164px report while 492px of the page sat empty beside it,
 * and a table typed into a paragraph stood in the 544px prose lane while 620px sat empty.
 *
 * THE FOUR LANES BECAME TWO COLUMNS AND THE TWO COLUMNS BECAME ONE, and the second step is theirs:
 * "I do not want a fixed 22% margin, or any latent empty second track, to remain as a structural
 * rule" (design/problem-01/OWNER-ANSWER-COMPOSITION.md). Their complaint was
 * "selecting the empty right-hand side shows a Semantic Region box with nothing in it", and the
 * answer is that there is no right-hand side: a block takes the whole width of the region it is
 * in. A reading measure still exists, as a preference an Agent may state on a prose part, and it
 * narrows the writing inside a part and never the part.
 */

/**
 * The attribute that says what a block is worth in width: `data-fit`, read from the one role map.
 *
 * Written onto the element that already carries `data-target`, so no new element appears between a
 * block and the thing a person can point at.
 *
 * A TYPE THIS BUILD HAS NEVER HEARD OF CLAIMS NOTHING. Blocks arrive as JSON from the database, so
 * a row written by a newer version can carry a type that is in no map. It gets no attribute and is
 * drawn as prose, which is where the refusal sentence belongs.
 */
export function fitAttribute(type: SummaryBlockType): { 'data-fit': Fit } | Record<string, never> {
  const role = ROLE_OF_BLOCK[type]
  if (role === undefined) return {}
  return { 'data-fit': fitOf(role) }
}

/**
 * The profile with this id, or nothing.
 *
 * NOTHING IS A REAL ANSWER. A caller passing a word no profile answers gets no width of its own
 * rather than a guessed one, which is what a module panel already wanted.
 */
export function profileNamed(id: string): BlocksProfile | undefined {
  return BLOCKS_PROFILES.find((p) => p.id === id)
}

/**
 * WHICH RECORD THESE BLOCKS BELONG TO, so what is drawn can say what it is and where it is stored.
 *
 * A caller that leaves it out gets exactly the drawing without any of the provenance attributes:
 * nothing on screen claims to be part of a record, and a comment on a run of text has nowhere to
 * point. That is the honest state for a preview and for a test rendering blocks that are not stored
 * anywhere. Both real call sites — a report page and a module page — pass one.
 */
export interface BlocksInRecord {
  recordId: string
  /** The record's kind. WHICH FIELD holds its blocks is read from the one declaration in kinds.ts. */
  kind: string
  /**
   * EVERYTHING THE RECORD HOLDS, SO THE TREE THIS DRAWING ANNOUNCES IS THE TREE THE WRITE DOOR
   * VALIDATES AGAINST AND NOT A SHORTER ONE.
   *
   * ---------------------------------------------------------------------------------------
   * THE DEFECT THIS FIELD EXISTS TO END, MEASURED 1 SEPTEMBER 2026
   * ---------------------------------------------------------------------------------------
   *
   * This component derived `regionsOf`, whose root is `data.blocks` — the report body and nothing
   * above it — and announced THAT as the tree of the page. The write door validates against
   * `recordRegionsOf`, whose root is `data` and which holds the record's declared sections with the
   * body as one of them. Two trees for one fact, free to disagree, and they did: every part above
   * `data.blocks` was missing from the announced tree, so `nearestDrawn` and `firstDrawnInside`
   * were blind above it and answered null. Hand-pressed on the owner's own report OOOt4Kouc5dT:
   * `data` (23 drawn descendants) and `section.summary` (12 drawn descendants) both printed *"is
   * not drawn on this page, nothing on this page holds it and this page draws no part of it, so
   * there is nowhere here to go to"* while the page had 30,297 characters of exactly that part on
   * the screen. Every "nowhere" sentence the report could print was false.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THE DRAWING WIDENS AND `recordRegionsOf` DOES NOT SHRINK
   * ---------------------------------------------------------------------------------------
   *
   * `regionsOf` is load-bearing on its own: `leastNeededByBlocks` is called with a bare array of
   * blocks — no record, no kind — twice in src/server/lib/summary.ts, once in src/server/lib/
   * layout.ts and once in this file. None of those four has a record to give, so `RegionSource`
   * cannot be widened to want one. `recordRegionsOf` already sits ABOVE `regionsOf` and re-parents
   * its output by copying the root, which is why every id under the body is the same string in both
   * trees. So the fix is that the drawing announces the taller tree, not that the door accepts a
   * shorter one.
   *
   * ---------------------------------------------------------------------------------------
   * NULL IS A REAL ANSWER AND IS NOT A SHORTER TREE
   * ---------------------------------------------------------------------------------------
   *
   * A surface that has not read the record's links cannot derive its relation sections, and
   * announcing a tree that is MISSING some of the door's parts is the fault above wearing smaller
   * clothes. So such a surface says null and announces NO tree, which `src/web/lib/drawnreport.ts`
   * already documents as a real answer: the readers then fall back on the sentences they print for
   * a page that is not drawing the record, which are true.
   */
  wholeRecord: RecordRegionSource | null
  /**
   * THE RECORD'S OTHER STORED WORDS, SO A READER WHO ASKED FOR LESS THAN THE WHOLE THING GETS
   * SOMETHING SOMEBODY WROTE INSTEAD OF A CUT.
   *
   * `Report content` is one of the ten surfaces a person can set on the settings grid. Setting it
   * to the third position means "the conclusion where one is written", and the conclusion is the
   * record's own summary column — which this component cannot see from a list of blocks. So the
   * caller passes it.
   *
   * LEFT OUT MEANS THE AXIS DOES NOT GOVERN THESE BLOCKS AND EVERY BLOCK IS DRAWN. That is right
   * for a preview and for a test rendering blocks that are stored nowhere. It is NOT right for a
   * page drawing a record's own content, and `tests/how-much-each-thing-says.test.ts` holds the
   * call sites that still leave it out, by name, so the gap is a line in a file rather than a
   * surface that silently ignores a setting.
   */
  stored?: DetailSource
  /**
   * HOW MANY OF THE THINGS THIS RECORD LINKS TO ARE WAITING ON THE PERSON, out of the one reading.
   *
   * WAVE 5 STEP 16 — the count guard's drawn half, which wave 2 could not prove. A person may write
   * "Nineteen things are waiting on you" into a report body and the write succeeds; an agent is
   * refused. What was missing is the other side of that bargain: beside the block Mole Office draws the
   * live count, and when the two disagree it says so. Three layers — what they wrote, what Mole Office
   * made of it, what is canonical — and none replaces another.
   *
   * IT IS HANDED IN, NEVER FETCHED HERE, and that is the whole of "computed from the same reading
   * as the band". `GET /api/waiting` is the one source of any number about what waits on the person;
   * `App.tsx` reads it once per navigation for the rail's badge, and the record page counts this
   * record's own links against that same reply. A fetch inside this component would be a second
   * moment of one reading, which is the defect the one reading was built to end.
   *
   * UNDEFINED IS "NOBODY COUNTED", AND IT DRAWS NOTHING. It is not zero. A surface that has not read
   * what waits — a preview, a test rendering blocks stored nowhere, a module panel — must not draw a
   * disagreement mark against a count it did not take, because zero would contradict every stated
   * number there has ever been.
   */
  waitingHere?: number
}


/**
 * THE REGION TREE OF THE REPORT BEING DRAWN, HELD WHERE EVERY PART OF THE DRAWING CAN REACH IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE RENDERER LOOKS IDS UP AND NEVER MAKES THEM
 * ---------------------------------------------------------------------------------------
 *
 * `regionsOf` in src/shared/regions.ts is the one walk over a report's stored text. This file has a
 * SECOND walk over the same text — `renderMarkdown` below — because drawing and deriving are two
 * jobs and neither can be the other. If this one also spelled region ids, the two walks would each
 * be working out where a paragraph starts, free to disagree, with nothing failing: the browser
 * would hand the server an id no region has, and the server would answer that the paragraph is
 * gone.
 *
 * So the drawing asks. Every emit site below hands over the stored field, the offset it is drawing
 * from and what it thinks it is drawing, and gets back the region `regionsOf` derived there — or
 * nothing. NOTHING IS THE HONEST ANSWER when the two walks disagree, and it costs one un-pointable
 * element rather than one wrong address.
 */
interface RegionMarks {
  recordId: string
  /** Every region of this report, by the offset it starts at inside its stored field. */
  byStart: Map<string, Region[]>
  /**
   * HOW MUCH WIDTH EACH PART OF THIS REPORT NEEDS, by the stored path of the part.
   *
   * The same one walk that spells the ids answers this, because how much width a part needs is
   * decided by what the part HOLDS, and only the tree knows that. A block whose path is not in here
   * — a preview, or a record whose blocks carry no ids — gets no answer and no attribute, and the
   * layout falls back to giving it the whole width. NOBODY LOOKED is not the same as NOTHING THERE.
   */
  needAt: Map<string, WidthNeeded>
  /**
   * HOW NARROW EACH PART OF THIS REPORT MAY BE DRAWN, by its stored path. The same one walk answers
   * this, for the same reason it answers `needAt`: only the tree knows what a part holds.
   *
   * IT IS READ FOR TWO DIFFERENT THINGS AND BOTH COME FROM THIS ONE ANSWER. A part of a composition
   * reads it as its floor, which is what stops a picture being drawn at 40px. A block inside such a
   * part reads it to know whether it is writing, which is what decides whether a stated reading
   * measure applies to it — and that is the SAME question the write door asked before it let the
   * measure be stored at all, so the drawing and the refusal cannot come to different answers.
   */
  leastAt: Map<string, Least>
  /**
   * EVERY REGION BY ITS OWN ID. A part of a composition is a region with no characters of its own,
   * so `regionStartingAt` — which finds a region by where its text starts — cannot find one. This
   * is how an element that draws a named slot rather than a run of text asks for its region.
   */
  byId: Map<string, Region>
}

const RegionsHere = createContext<RegionMarks | null>(null)

/**
 * The whole tree of one record's blocks, indexed by where each region starts.
 *
 * THE TREE IS DERIVED ONCE, ABOVE THIS, AND HANDED IN. It used to be derived here, and the outline
 * of the report needs the same tree — deriving it twice would be two walks that can disagree about
 * one report, which is the defect at the top of CLAUDE.md.
 */
function regionMarksFor(site: Site | null, root: Region | null): RegionMarks | null {
  if (site === null || !site.addressable || root === null) return null
  const byStart = new Map<string, Region[]>()
  const needAt = new Map<string, WidthNeeded>()
  const leastAt = new Map<string, Least>()
  const byRegionId = new Map<string, Region>()
  for (const region of flatten(root)) {
    needAt.set(region.id, widthNeededBy(region))
    leastAt.set(region.id, leastNeededBy(region))
    byRegionId.set(region.id, region)
    if (region.field === null || region.range === null) continue
    const key = `${region.field}@${String(region.range.from)}`
    const held = byStart.get(key)
    if (held === undefined) byStart.set(key, [region])
    else held.push(region)
  }
  return { recordId: site.recordId, byStart, needAt, leastAt, byId: byRegionId }
}

/**
 * THE SAME INDEX FOR A RECORD'S WHOLE TREE, for a drawing of one record's words that is not a report
 * body. The chat hands it to `renderMarkdown` so each paragraph of a message says which part of that
 * message it is (problem DowO7yEioWp0). It is `regionMarksFor` and not a second copy of it.
 */
export function regionMarksOfRecord(recordId: string, root: Region): RegionMarks | null {
  return regionMarksFor({ recordId, arrayPath: root.id, addressable: true }, root)
}

/**
 * HOW MUCH WIDTH THIS BLOCK NEEDS, or nothing when nobody worked it out.
 *
 * The path a block is stored at is the id of its region, so the answer is one lookup. NOTHING IS A
 * REAL ANSWER: a settings preview holds blocks stored in no record, and a report whose blocks carry
 * no stored ids is addressed by position while the region tree addresses by id, so the two spell
 * different paths. Either way no attribute is written and the block keeps the whole width, which is
 * what it had before any of this existed.
 */
function needsAttribute(marks: RegionMarks | null, place: Place | null): Record<string, string> {
  if (marks === null || place === null) return {}
  const need = marks.needAt.get(place.path)
  return need === undefined ? {} : { 'data-needs': need }
}

/**
 * WHAT THIS BLOCK HOLDS — writing, evidence with words in it, or a picture — or nothing when nobody
 * worked it out. The same lookup as `needsAttribute` above and the same rule about nothing.
 *
 * IT IS ON EVERY BLOCK AND NOT ONLY ON THE ONES INSIDE A COMPOSITION, because it is a fact about
 * the block rather than about where the block sits, and because a rule that had to be told where it
 * was would need the renderer to pass that down through four containers. The stylesheet reads it
 * only inside a part, which is the one place it currently changes anything.
 */
function leastAttribute(marks: RegionMarks | null, place: Place | null): Record<string, string> {
  if (marks === null || place === null) return {}
  const least = marks.leastAt.get(place.path)
  return least === undefined ? {} : { 'data-least': least }
}

/**
 * THE MARK ON AN ELEMENT THAT HOLDS ONE RUN OF WORDS AND NOTHING ELSE. It is the only thing a
 * stated reading measure is ever applied to.
 *
 * WHY IT EXISTS. A measure is a statement about writing, and the writing is not the same box as
 * the thing that holds it. A `text` block holds paragraphs; a `section` block holds other blocks,
 * and one of those may be a table. Until 29 August 2026 the maximum was put on the BLOCK, so a
 * block that stated a measure shrank — the region shrinking to fit its writing, which is what the
 * owner asked for this layer not to do — and anything inside it that cannot be narrowed was drawn
 * outside it. Measured in Chromium at 1440 that day: a section stating `narrow` drew at 416px in
 * an 1164px region while its stored table drew 1164px wide, 748px of it outside the section's box.
 *
 * WHERE IT GOES: on a paragraph, a heading, a bullet, a quoted line, a caption, an attribution —
 * an element whose whole content is words. NEVER on a box that lays other boxes out: not on a
 * block that holds blocks, not on a part of a composition, not on a `text` block whose prose holds
 * a table. Those keep the whole of their width, and the words inside them narrow instead.
 *
 * IT IS DECIDED HERE, BY THE RENDERER, and that is deliberate: the renderer is what knows it has
 * just drawn one run of words into one element. The WRITE DOOR asks a different question — whether
 * there is any writing inside a block at all, which is `leastNeededByBlocks` in
 * src/shared/regions.ts — and the two must agree, or a measure could be accepted and then narrow
 * nothing. Nothing makes them agree by construction, so a test does:
 * `tests/a-measure-never-shrinks-the-block.test.ts` states a measure on every block type the write
 * door accepts one on and reads what the browser drew narrower.
 */
const WRITING = { 'data-writing': '' } as const

/**
 * HOW WIDE THE WRITING INSIDE THIS BLOCK WAS ASKED TO READ. Layer 4, on a block of its own.
 *
 * THE OWNER'S SENTENCE THIS SERVES: "For a single prose part, however, the Agent authoring the
 * Report may optionally express a prose-width / whitespace preference. This preference affects only
 * the prose measure inside its full-width column." Most reports hold no composition at all, so this
 * is the ordinary way that preference is written, and a part of a composition is the other way.
 *
 * IT SETS A CUSTOM PROPERTY AND NEVER A WIDTH. The one rule in SUMMARY_CSS turns it into a
 * `max-width` on the writing. Nothing here narrows the box the block stands in, which is the one
 * mistake this must not make.
 *
 * WHAT `full` WRITES, AND WHY IT WRITES ANYTHING. `full` asks for no maximum, and a block that asks
 * for none inside a part that asked for `narrow` has to say so rather than inherit its part's
 * answer. `none` is the same word the stylesheet declares for a block nobody asked anything of.
 *
 * ANSWERED BY `measureMaxWidth` IN src/shared/beside.ts AND BY NOTHING HERE. That is the one place
 * a measure becomes something a stylesheet can use, and it answers the same for a part.
 */
function measureMark(block: SummaryBlock): { 'data-measure'?: string; style?: CSSProperties } {
  if (block.measure === undefined) return {}
  return {
    'data-measure': String(block.measure),
    style: { '--sb-measure': measureMaxWidth(block.measure) ?? 'none' } as CSSProperties,
  }
}

/**
 * THE REGION THAT STARTS AT THIS OFFSET AND IS ONE OF THESE THINGS, or null.
 *
 * The roles are given by the caller because the drawing knows what it is drawing. A bullet group
 * and its first bullet start at the same character, so an offset alone does not say which of the
 * two an element is; `ul` asks for the group and `li` asks for the bullet, and each gets its own.
 *
 * A ROLE THE CALLER DID NOT ASK FOR ANSWERS NULL RATHER THAN THE NEAREST THING. If the derivation
 * calls something a paragraph and the drawing calls it a heading, the two disagree about what is on
 * the screen, and the useful answer to a press is then the block that holds it.
 */
function regionStartingAt(
  marks: RegionMarks | null,
  field: string | undefined,
  from: number,
  roles: readonly RegionRole[],
): Region | null {
  if (marks === null || field === undefined) return null
  const held = marks.byStart.get(`${field}@${String(from)}`)
  if (held === undefined) return null
  return held.find((region) => roles.includes(region.role)) ?? null
}

/**
 * WHAT AN ELEMENT DRAWING A REGION CARRIES: ONE `data-target`, OR NOTHING.
 *
 * `carriesTarget` is the rule and it lives in src/shared/regions.ts — a meaningful role holding
 * something. It is asked here and asked again by the developer overlay, so the overlay cannot draw
 * a box round something a press would walk straight past.
 *
 * NOTHING IS EMITTED ON A BLOCK, AND THAT IS THE PLAN'S OWN INSTRUCTION. A block's element already
 * carries `reportBlock`, and an element carries one `data-target`. That word stays until the stored
 * comments written against it are converted, which is `contexts-to-regions` and window B; dropping
 * it here would take the marker off the one comment on the owner's loudest report for two waves. It
 * loses nothing by staying: `regionIdOfLegacyTarget` in src/shared/regions.ts converts between the
 * two spellings and the server resolves both to the same part of the report.
 */
function regionMark(marks: RegionMarks | null, region: Region | null): Record<string, string | number> {
  if (marks === null || region === null || !carriesTarget(region)) return {}
  return {
    ...targetAttributes({ kind: 'region', recordId: marks.recordId, regionId: region.id }),
    // THE ROVING HALF OF THE KEYBOARD ROUTE. Every region a person can point at is REACHABLE from
    // the keyboard and none of them is a tab stop: `-1` means "focus can be moved here in code,
    // and Tab walks past it". Exactly one element inside the report body carries `0` at a time and
    // `useRegionWalk` below is what moves it. Without this line the walk would add 276 tab stops
    // on the owner's own report and 1,098 across the eight, and a keyboard user would rather have
    // the report than the regions.
    tabIndex: -1,
  }
}

// ------------------------------------------------------------ the report body from a keyboard

/**
 * STEPPING THROUGH A REPORT'S PARTS WITHOUT A POINTER, AT A COST OF ONE TAB STOP.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THERE WAS BEFORE THIS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * No path at all. Everything focusable inside a report body was a control — a table's column sort
 * buttons, its search box, the control under the writing, and the scroll box on a table with more
 * to see. No paragraph, heading, bullet, quote or table could be focused, and `Shift+F10` opens
 * the composer about `document.activeElement`, so a keyboard user could not point at a paragraph.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLAIM, AND IT IS NOT THE ONE THAT SOUNDS BETTER
 * ---------------------------------------------------------------------------------------
 *
 * THE REGION WALK IS ONE TAB STOP, WHATEVER THE REPORT HOLDS. It is not "the report body is one
 * tab stop" — it never was, and this removes none of the controls above. Measured on the owner's
 * own report at 1440 there were six focusable elements inside the writing and there are seven now.
 *
 * The one is real because of where it moves: the body carries `tabindex="0"` while nobody is in
 * the walk, and hands it to whichever region is current the moment somebody steps into it. Exactly
 * one of the two is a tab stop at any time.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TAB INDEX IS MOVED IN THE DOM RATHER THAN HELD IN STATE
 * ---------------------------------------------------------------------------------------
 *
 * A key press would otherwise re-render every block of the report, and the region tree is derived
 * on each render. Moving one attribute on two elements is the whole of what a key press changes,
 * so it is what the key press does. The one thing that IS state is whether anybody is in the walk
 * at all, because that is what decides where Tab lands, and it changes twice a visit rather than
 * once a keystroke.
 */
const REGIONS_IN_ORDER = selectorForKind('region')

function useRegionWalk(): {
  ref: React.RefObject<HTMLDivElement | null>
  bodyProps: { tabIndex: number; role: string; 'aria-label': string; onKeyDown: (e: ReactKeyboardEvent) => void }
} {
  const body = useRef<HTMLDivElement>(null)
  const [inTheWalk, setInTheWalk] = useState(false)

  /** Every region of this report, in the order they are drawn. The DOM is the one that knows. */
  const regions = (): HTMLElement[] =>
    body.current === null ? [] : [...body.current.querySelectorAll<HTMLElement>(REGIONS_IN_ORDER)]

  /** The region carrying the tab stop, or null while the body has it. */
  const standingOn = (): HTMLElement | null =>
    regions().find((el) => el.tabIndex === 0) ?? null

  /** Move the one tab stop to this region and focus it. Null puts it back on the report body. */
  const standOn = (next: HTMLElement | null): void => {
    for (const el of regions()) el.tabIndex = -1
    if (next === null) {
      setInTheWalk(false)
      body.current?.focus()
      return
    }
    next.tabIndex = 0
    setInTheWalk(true)
    next.focus()
  }

  /**
   * THE REGION A KEY ASKED FOR. `depth` is how deep the element sits among the regions, so a
   * sibling is the next element at the same depth or shallower, and a child is the next one
   * deeper. That reads the drawn tree rather than a second copy of the region tree, which is what
   * stops the two disagreeing about what is beside what.
   */
  const depthOf = (el: HTMLElement): number => {
    let deep = 0
    let up = el.parentElement
    while (up !== null && up !== body.current) {
      if (up.matches(REGIONS_IN_ORDER)) deep += 1
      up = up.parentElement
    }
    return deep
  }

  const onKeyDown = (event: ReactKeyboardEvent): void => {
    // A KEY PRESSED INSIDE A CONTROL BELONGS TO THE CONTROL. A table's search box holds arrow keys
    // for moving the caret, and a walk that took them would make the box unusable.
    const from = event.target
    if (from instanceof HTMLElement && from.closest('input, textarea, select, button, a[href]') !== null) return
    const all = regions()
    if (all.length === 0) return
    const here = standingOn()
    const at = here === null ? -1 : all.indexOf(here)
    const deep = here === null ? -1 : depthOf(here)

    const siblingsFrom = (step: number): HTMLElement | null => {
      for (let i = at + step; i >= 0 && i < all.length; i += step) {
        const el = all[i]
        if (el === undefined) continue
        const d = depthOf(el)
        if (d === deep) return el
        if (d < deep) return null
      }
      return null
    }

    switch (event.key) {
      case 'ArrowDown':
        standOn(here === null ? (all[0] ?? null) : (siblingsFrom(1) ?? here))
        break
      case 'ArrowUp':
        standOn(here === null ? (all[0] ?? null) : (siblingsFrom(-1) ?? here))
        break
      case 'ArrowRight': {
        if (here === null) return standOn(all[0] ?? null)
        const next = all[at + 1]
        standOn(next !== undefined && depthOf(next) > deep ? next : here)
        break
      }
      case 'ArrowLeft': {
        if (here === null) return
        for (let i = at - 1; i >= 0; i -= 1) {
          const el = all[i]
          if (el !== undefined && depthOf(el) < deep) return standOn(el)
        }
        return
      }
      case 'Home':
        standOn(all[0] ?? null)
        break
      case 'End':
        standOn(all[all.length - 1] ?? null)
        break
      case 'Escape':
        if (here === null) return
        standOn(null)
        break
      case 'Enter': {
        // THE SAME DOOR `Shift+F10` GOES THROUGH, and not a second one. `Enter` on a div with a
        // group role synthesises no click, so without this there is no way in from the keyboard
        // that does not need a menu key the machine may not have.
        if (here === null) return
        openAbout(here, withoutAPointer(here, null))
        break
      }
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  return {
    ref: body,
    bodyProps: {
      // THE ONE TAB STOP, IN THE ONE PLACE IT IS AT THE TIME. While nobody is in the walk it is
      // here; the moment somebody steps in, the region they are standing on has it and this does
      // not, so Tab still costs one press either way.
      tabIndex: inTheWalk ? -1 : 0,
      role: 'region',
      'aria-label': 'Report body',
      onKeyDown,
    },
  }
}

/** Where a run of blocks lives inside one record. Null everywhere the blocks are not stored. */
interface Site {
  recordId: string
  /** The path of the array these blocks are in, e.g. `data.blocks`. */
  arrayPath: string
  /**
   * Whether a block in this array can be pointed at on its own.
   *
   * TRUE ONLY FOR THE RECORD'S OWN LIST. `reportBlock` is looked up by searching that list, so a
   * block inside a section or a column has no address of its own yet and must not claim one — a
   * target Mole Office cannot resolve reads back as "this is gone", which is a false sentence about
   * somebody's writing. Its WORDS are still addressable: the field path below runs all the way
   * down, and the server's reader walks every string a block holds, however deep.
   */
  addressable: boolean
}

export function SummaryBlocks({
  blocks,
  layout = 'panel',
  inRecord,
  drawAt,
}: {
  blocks: SummaryBlock[]
  layout?: BlocksLayout
  inRecord?: BlocksInRecord
  /**
   * DRAW AT THIS POSITION RATHER THAN THE ONE THE READER CHOSE. Only the preview on the settings
   * grid passes it, because that box exists to show what one position looks like before anybody
   * picks it. Everywhere else the reader's own choice decides and this is left out.
   */
  drawAt?: Rung
}) {
  // WHAT KIND OF RECORD THESE BLOCKS BELONG TO, or null where this drawing is of no record at all —
  // a demonstration page, or a run of blocks handed to this component on its own. It is read once,
  // here, and asked three times below: the reader floor is for a report and for nothing else, so a
  // module's curated summary keeps all seven positions. `readerFloorApplies` in shared/detail.ts is
  // the one place that decides. Criterion A19.
  const kindHere = inRecord?.kind ?? null
  // HOW MUCH THIS SURFACE SAYS. `Report content` is the row on the settings grid. The surface's own
  // default is reading level 2, by their act 3a of 15 September 2026. A
  // REPORT opens at the whole thing again since their act of 16 September 2026, applied in `rungFor`:
  // a reader who wants less lowers the level by hand and the choice is kept.
  // A module is not floored and still opens at its own level-2 line.
  // (The line used to say the default was the whole thing, then the summary.)
  const says = useDetail('reportContent', kindHere)
  const rung = drawAt ?? says.rung
  // THE SECOND DIMENSION OF A VIEW: whether the pictures are drawn. Read here, once, above the
  // three drawings below, because the same answer has to reach the writing and the control that
  // changes it. HOW LARGE THE TYPE IS IS NOT READ HERE. It is an axis on the appearance bar, it
  // scales the root, and the reading measure is in rem, so it follows without being asked.
  const pictures = usePictures()
  // THE KEYBOARD ROUTE INTO THE WRITING. One tab stop, whatever the report holds.
  const walk = useRegionWalk()
  const stored = inRecord?.stored
  // THE POSITIONS A READER OF THIS RECORD MAY STAND ON, worked out once, here, and handed to both
  // level controls. THREE THINGS NARROW THE SEVEN and `readerRungsFor` asks all three: what this
  // record HAS — a record whose own words are already as short as a level has no levels above that
  // one, which is their rule of 5 September 2026; WHICH LEVELS THIS RECORD HAS WORDS FOR — their act of
  // 15 September 2026, criterion A14a as amended, so a position nobody wrote is not advertised; and
  // how low a PERSON reads a report, which is criterion A19 and applies to reports only.
  //
  // `formsWrittenIn` is read here because the resolver half cannot read it: it lives in
  // @shared/reportrungs.ts, which imports the resolver, so the one list of which lengths a record
  // has words for crosses the line as an argument rather than as a second computation.
  //
  // WHERE THESE BLOCKS BELONG TO NO RECORD there is nothing to measure, and the seven stand: a
  // settings preview is a run of blocks with no record behind it.
  const writtenHere = stored === undefined ? null : new Set(formsWrittenIn(stored).map((one) => one.rung))
  const readableRungs =
    writtenHere === null || stored === undefined
      ? RUNGS.filter((one) => !readerFloorApplies(FLOORED_SURFACE, kindHere) || isReaderRung(one))
      : readerRungsFor(stored, FLOORED_SURFACE, kindHere, writtenHere)
  // WHAT THE LEVEL CONTROL OFFERS: on a report, THE THREE OF THEIR ACT OF 16 SEPTEMBER 2026 THAT THIS
  // REPORT HAS — Conclusion, Level 6, Full, cut down by what the report has
  // words for, because a level nobody wrote is not advertised and a press
  // offering it back would stand the reader at an empty level. Every other rung stays in the ladder,
  // storable and reachable through the API and for agents; only what this control offers changes.
  // On any other kind — a module's curated summary — nothing changes: the control offers the
  // positions the record has, as it always did.
  const flooredReport = readerFloorApplies(FLOORED_SURFACE, kindHere)
  const offeredRungs = flooredReport
    ? OFFERED_TO_A_READER.filter((one) => readableRungs.includes(one))
    : readableRungs
  // WHAT THE LABEL READS when the reader's kept choice is no longer offered: the nearest offered
  // position, WITHOUT the stored choice being touched, on a report and on nothing else. The body
  // below still draws the kept choice; the title on the label says what was stored.
  const shownRung = flooredReport ? nearestOffered(rung) : rung
  // WHETHER THESE BLOCKS ARE THE PAGE IS READ OFF THE DECLARATION, never worked out here. A profile
  // added to the list therefore arrives as a document without this line being touched.
  const cls = profileNamed(layout)?.ownsWidth === true ? 'sb sb-doc sb-reads' : 'sb sb-reads'
  // Which record this is, so every block and every run of text in it can say where it is stored.
  // Worked out once, above the three drawings below, because a second copy of it is the defect this
  // repository keeps finding.
  const field = inRecord === undefined ? null : blocksFieldOf(inRecord.kind)
  const site: Site | null =
    inRecord === undefined || field === null
      ? null
      : { recordId: inRecord.recordId, arrayPath: `data.${field}`, addressable: true }
  // WHICH OF THE THREE READERS IS READING THESE BLOCKS, worked out ONCE, here, because this is the
  // only place that holds the record id the per-visit reveal is keyed by. `readsAs` is what the
  // blocks are filtered by; `reader` is what the PAGE is, and the count below is of what the page's
  // reader would not be shown. They differ for exactly one person: a normal reader who has pressed
  // the reveal on this record, who reads the blocks as a developer for this visit and nothing else.
  const reader = useReader()
  const revealed = machineryRevealedHere(inRecord?.recordId)
  const readsAs: Reader = reader === 'normal' && revealed ? 'developer' : reader
  // EVERY REGION OF THIS REPORT, DERIVED ONCE FOR THIS DRAWING. Two things read it: the index that
  // gives each drawn element its target, and the outline that says what a short reading length
  // shows. One walk, so the two cannot come to different answers about one report.
  const root = field === null ? null : regionsOf({ field, blocks: Array.isArray(blocks) ? blocks : [] })
  const marks = regionMarksFor(site, root)
  /**
   * THE WHOLE RECORD'S TREE, LEFT WHERE THE MARK LAYER AND *View original* CAN ASK ABOUT IT.
   *
   * A comment written at one reading length is often about a part this length does not draw on its
   * own, and the layer that puts marks on the page has to be able to say which — drawn inside
   * something larger, held by something that contains it, or genuinely not in this version of the
   * report. That question needs a tree, and this is the one place the browser derives one.
   *
   * IT IS `recordRegionsOf` AND NOT THE `root` ABOVE, AND THAT IS THE WHOLE POINT. `root` is the
   * report BODY, whose top is `data.blocks`; the write door validates against the whole RECORD,
   * whose top is `data`. Announcing the body meant both walks were blind above `data.blocks` and
   * answered null for every part above it — see `BlocksInRecord.wholeRecord` for what that printed
   * on the owner's own report. `recordRegionsOf` calls `regionsOf` on this same stored array and
   * re-parents its root by copying it, so every id under the body is the same string in both and
   * the two cannot disagree about the part of the tree they share.
   *
   * NULL FOR A DRAWING THAT CANNOT SAY WHAT THE WHOLE RECORD HOLDS, which is the settings preview,
   * a demonstration page, and any surface that has not read the record's links. Nothing is
   * announced for those, so the layer is told nobody derived a tree here — which is a real answer
   * and not a shorter tree.
   */
  const whole = inRecord?.wholeRecord ?? null
  // WHAT THIS LENGTH DRAWS, ASKED ONCE FOR THE WHOLE COMPONENT. The body below draws from it and
  // the announcement above hands the parts to the composer. It is only asked where this drawing is
  // of a record's own stored words, which is the same condition the body below is drawn under.
  const drawing =
    inRecord !== undefined && stored !== undefined && Array.isArray(blocks) && blocks.length > 0
      ? reportAt(stored, blocks, rung, pictures.value)
      : null
  const partsHere = drawing?.parts ?? null
  const drawnHere =
    root === null || marks === null || marks.recordId === '' || field === null || whole === null
      ? null
      : {
          recordId: marks.recordId,
          root: recordRegionsOf(whole),
          blocksField: field,
          // THE KIND OFF THE SAME SOURCE THE TREE IS DERIVED FROM, so what a reader names the parts
          // with and what the tree was built out of cannot be about two different records.
          kind: whole.kind,
          // THE RECORD'S OWN TITLE, WHERE THIS SURFACE WAS HANDED THE RECORD'S STORED WORDS. It is
          // read off `stored` rather than asked for again beside it, because that is the record's
          // words and a second title prop would be the one fact in two places. A surface that draws
          // blocks without the record — the module panel — announces no title, which
          // `ReportDrawn.title` says is an answer and not an empty one.
          title: inRecord?.stored?.title ?? null,
          // WHAT THIS DRAWING IS AT AND WHAT IT DREW THERE, so the composer can name a part a
          // person pressed without deciding for itself what was on the screen. `partsHere` is the
          // same answer `reportAt` gives the body below; it is worked out once, above, because a
          // second call would be a second opinion about one drawing.
          rung,
          parts: partsHere,
          // THE FORM THIS LENGTH DREW, AND THE REGION IT IS. At lengths 2 and 3 that region is one
          // of the record's own columns, which the header of another kind of page draws for a
          // different purpose — so the composer is told what THIS drawing drew rather than reading
          // the meaning off the id. `reportAt` chose the line; nothing is decided here.
          form: (() => {
            const line = drawing?.lines[0]
            if (line === undefined || marks.recordId === '') return null
            const region = regionOfDrawnLine(line.field)
            return region === null ? null : { regionId: region, rung: line.rung }
          })(),
        }
  useEffect(() => {
    if (drawnHere === null) return
    noteReportDrawn(drawnHere)
    return () => {
      forgetReportDrawn(drawnHere)
    }
  })

  if (inRecord !== undefined && stored !== undefined && Array.isArray(blocks) && blocks.length > 0 && drawing !== null) {
    // THE ONE FUNCTION THAT SAYS WHAT THIS POSITION DRAWS is `reportAt`, asked once above this
    // return. The preview on the settings grid reaches it through this same component, so the box
    // and the page cannot disagree about a position.
    return (
      <div className="sb-fit">
        <div className={cls} data-profile={layout} {...drawnAtLength(rung)} ref={walk.ref} {...walk.bodyProps}>
          <SummaryStyle />
          {/* THE CONTROL SITS ABOVE THE WRITING, where somebody deciding how to read this can see
              it before they start reading rather than after. The same control is drawn again at the
              foot, so a reader who has read to the end does not scroll back up to change the level. */}
          <LevelControl
            rung={rung}
            shown={shownRung}
            rungs={offeredRungs}
            pictures={pictures}
            declares={{ surface: 'report.readas' }}
          />
          <ReportOpening lines={drawing.lines} summary={drawing.summary} recordId={inRecord.recordId === '' ? null : inRecord.recordId} />
          {/* THE PLACE THIS LENGTH'S FORM WOULD HAVE BEEN, AND THE LINE SAYING NOBODY WROTE ONE.
              It is here because that is where the form would be drawn, and the
              absence is said in the place the form would have been rather than in a panel below
              the report. It draws nothing where the form was written: the form itself is the
              answer. */}
          <WhatStandsAtThisLength summary={drawing.summary} />
          {/* THE REPORT'S PARTS, AT THE THREE LENGTHS THAT ARE WRITTEN BY PART. Null at every other
              length, and null at these three where nobody has written them — the body then draws
              the one line above saying this level has not been written. The blocks under this draw
              nothing at these lengths, because `reportAt` chose none of them: the media a part
              covers is drawn by the part. */}
          {drawing.parts === null ? null : (
            <RegionsHere.Provider value={marks}>
              <ReportParts
                parts={drawing.parts}
                blocks={blocks}
                site={site}
                readsAs={readsAs}
                recordId={inRecord.recordId === '' ? null : inRecord.recordId}
              />
            </RegionsHere.Provider>
          )}
          {/* THE WHOLE TREE, DERIVED ONCE FOR THE WHOLE REPORT, and from the stored blocks rather
              than the drawn ones. The server answers about what EXISTS and never about what one
              reader is currently seeing, so the two have to be derived from the same list or a
              comment left at Full detail would read as gone to somebody reading at Gist. */}
          <RegionsHere.Provider value={marks}>
          <BlockList
            blocks={blocks}
            site={site}
            keyPrefix="b"
            readsAs={readsAs}
            only={new Set(drawing.blocks)}
            {...(inRecord.waitingHere === undefined ? {} : { waitingHere: inRecord.waitingHere })}
          />
          </RegionsHere.Provider>
          <div className="sb-foot">
            {/* THE SAME CONTROL AS ABOVE THE WRITING, WITH ITS OWN NAME FOR THIS PLACE ON THE PAGE.
                One stored value, two regions. */}
            <LevelControl
              rung={rung}
              shown={shownRung}
              rungs={offeredRungs}
              pictures={pictures}
              declares={{ surface: 'report.readas.foot' }}
            />
            {/* THE COUNT THAT MAKES THE MECHANISM SAFE. It is its own element and never a clause of
                the level control, so nothing inside that control decides whether the reader is told
                anything. §8.1(a): at the default reading length `notDrawn` is 0, so a marked block
                would otherwise be gone with no number anywhere. */}
            <ForDevelopers
              count={hiddenFromReader(blocks, new Set(drawing.blocks), reader)}
              revealed={revealed}
              {...(inRecord.recordId === '' ? {} : { onReveal: (on: boolean) => setMachineryRevealedHere(inRecord.recordId, on) })}
            />
            {/* ONLY WHERE THERE ARE REGIONS TO SHOW. The blocks of a settings preview are stored in
                no record, carry no targets, and the control would draw nothing and say nothing. */}
            {site === null ? null : <RegionsControl />}
          </div>
        </div>
      </div>
    )
  }
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return (
      <div className="sb-fit">
      <div className={cls} data-profile={layout}>
        <SummaryStyle />
        {/* THROUGH `Absence`, so the weight is chosen rather than inherited from whatever a
            paragraph happens to look like. Nobody has to act on a module having no long version —
            it is the ordinary tier, which draws a mark and carries the sentence for a reader who
            asks. This used to be a plain paragraph and the guard in tests/absence-weight.test.ts
            named it the moment the sentence changed. */}
        <p className="sb-empty">
          <Absence tier="ordinary" word={NO_SUMMARY} />
        </p>
      </div>
      </div>
    )
  }

  return (
    // THE ONE BOX THE LANES ARE MEASURED FROM. An element cannot query itself, so the lane widths
    // — which are all `min(a token, 100cqi)` — need a container ABOVE the grid that reads them.
    // It is here, inside the shared component, rather than on the record page and the module panel,
    // because two opt-in call sites is the same defect this component was built to end: every
    // surface that draws blocks gets lanes without asking for them.
    <div className="sb-fit">
      <div className={cls} data-profile={layout}>
        <SummaryStyle />
        {/* A MODULE'S CURATED SUMMARY GETS THE SAME TREE. It is written in blocks, it is stored in a
            record, and `blocksFieldOf` above already found the field it is stored in — so a
            paragraph of one is as pointable as a paragraph of a report. */}
        <RegionsHere.Provider value={marks}>
          <BlockList
            blocks={blocks}
            site={site}
            keyPrefix="b"
            readsAs={readsAs}
            {...(inRecord?.waitingHere === undefined ? {} : { waitingHere: inRecord.waitingHere })}
          />
        </RegionsHere.Provider>
        {/* THE SAME COUNT ON THE OTHER BRANCH, and this is the branch the module page uses.
            `rungDraws` is null here because this branch draws every block it is given. */}
        <div className="sb-foot">
          <ForDevelopers
            count={hiddenFromReader(blocks, null, reader)}
            revealed={revealed}
            {...(inRecord === undefined || inRecord.recordId === ''
              ? {}
              : { onReveal: (on: boolean) => setMachineryRevealedHere(inRecord.recordId, on) })}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * THE FORM WRITTEN FOR THE LENGTH BEING READ, WHICH IS WHAT THAT LENGTH SAYS.
 *
 * `reportAt` hands over one line: the form somebody wrote for the length asked for, or none at all.
 * `lineAt` in src/shared/reportrungs.ts is where that is decided and why.
 *
 * IT USED TO DRAW THE TRAIL OF EVERY SHORTER FORM ABOVE IT, and this component is a list rather
 * than one paragraph because of that history. The list stays because the answer is still a list of
 * nought or one, and a component that took one optional line would have to answer the empty case
 * twice.
 *
 * EVERY LINE SAYS WHERE IT CAME FROM. `data-drawn-from` carries the stored path, so a test can read
 * the set of paths this page drew rather than counting its characters, and a shorter sentence
 * cannot pass for a shorter page.
 */
function ReportOpening({
  lines,
  summary,
  recordId,
}: {
  lines: readonly ReportLine[]
  summary: ReportSummary
  /**
   * The record these lines were read out of, or null when this component is drawn with no record —
   * the demonstration pages. Null means no line carries a target, because a region id names a
   * record and there is no honest one to write.
   */
  recordId: string | null
}) {
  if (lines.length === 0) return null
  return (
    <div className="sb-open">
      {lines.map((line) => {
        // WHETHER THIS LINE IS THE FORM WRITTEN FOR THIS LENGTH. It always is, since 3 September
        // 2026: a length draws the form written for it or draws no line at all. It is read rather
        // than assumed, because the mark is a claim about who wrote what and this component is not
        // the place that decides it.
        const isTheSummary = summary.standing === 'written' && line.field === summary.field
        // THE LINE IS THE SHORT FORM IT WAS READ OUT OF, AND IT SAYS SO.
        //
        // Measured on report `OOOt4Kouc5dT` on 30 August 2026: all five of these lines resolved six
        // levels up to the whole record, and at reading length 1 the ONE line that IS the whole
        // projection resolved to the record. Their problem 4 sentence — *"A summary projection must
        // not become an unrelated new object simply because it is rendered differently"* — is what
        // makes the id the STORED short form's own region rather than a new name for the drawing:
        // the same id the *Shorter forms* panel carries and the same id the region tree holds.
        //
        // THE SAME REGION IS ON TWO ELEMENTS OF A RECORD PAGE, and that is a fact about the page
        // rather than a defect. The panel draws the stored line and the body draws it again at the
        // top of the report; both ARE that region. `lightTheWords` and the walk in MarkLayer both
        // take every element carrying the key, so a mark is painted on both.
        //
        // AND A LINE DRAWN FROM `title` OR `summary` IS A REGION TOO, SINCE 3 SEPTEMBER 2026. Both
        // answered null until then and the press walked past them to the report. Reading lengths 2
        // and 3 are the record's own columns now (criterion A14b), so `regionOfDrawnLine` answers
        // `section.titleLine` and `section.summaryLine` — the two declared sections that carry
        // those characters — and a press on either names the length a person is reading.
        const region = recordId === null ? null : regionOfDrawnLine(line.field)
        // WHERE IT CAME FROM AND WHAT IT IS, built together, because they are two readings of one
        // stored path and a line may not carry one without the other.
        const marks = {
          ...drawnFrom(line.field),
          ...(region === null || recordId === null ? {} : theRegion(recordId, region)),
        }
        return (
          <p
            key={line.field}
            className="sb-open-line"
            {...drawnAtLength(line.rung)}
            data-summary={isTheSummary ? 'written' : undefined}
            {...marks}
          >
            {/* THE WORDS ARE THE NAME OF THIS LINE, and the mark under them is not. Without this
                the composer's chip read *Written for this length Round ten: half built, checked* —
                Mole Office's own mark glued to the front of somebody's sentence. `DRAWS_THE_NAME`
                is the same attribute a row and a panel heading use. */}
            {/* THE WORDS AND NOTHING ELSE. A mark under them used to read *Written for this length
                by claude-code/short-form-writer*. That mark is not
                for a person, and it left
                the page. Who wrote a form and when is in the composer, on right-click, which is
                criterion A9 of design/pointing-reopened/ACCEPTANCE.md. */}
            <span {...DRAWS_THE_NAME}>{line.text}</span>
          </p>
        )
      })}
    </div>
  )
}

/**
 * THE LINE THAT SAYS THIS LEVEL HAS NOT BEEN WRITTEN, IN THE PLACE ITS FORM WOULD HAVE BEEN.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * Where a report has no form at a level, that level is not shown; the line says that it
 * does not exist. Criterion A14a of design/pointing-reopened/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT STILL REACHES THIS LINE, NOW THAT A LEVEL NOBODY WROTE IS NOT ADVERTISED
 * ---------------------------------------------------------------------------------------
 *
 * Their act of 15 September 2026 (criterion A14a as amended) took the levels nobody wrote off the
 * reader's control, so the ordinary path — press the control through the positions it offers — no
 * longer arrives here. Two paths through the
 * drawing still do, and neither is the control offering the position:
 *
 *   A STORED CHOICE FROM BEFORE. A level 4, 5 or 6 chosen before this act, or set for everything
 *   and inherited here, still resolves through `rungFor` and is deliberately not raised to a level
 *   that is still offered — a reader standing on a position the control no longer lists steps out
 *   of it with the buttons, which `stepWithin` answers from the nearest rung below.
 *
 *   A POSITION ANOTHER RULE ADVERTISES AND SOMEBODY LEFT EMPTY. Level 3 is the record's own summary
 *   (criterion A14b) and is never narrowed away, so a report with no summary opens at the
 *   conclusion and this line says so. That is the one place the amended criterion leaves it.
 *
 * The settings grid's preview reaches it too, through `drawAt`: a preview draws a position so a
 * person can see what it looks like, and the grid deliberately offers all seven columns. The
 * component and its sentence stay: an absence that is genuinely reachable is still the honest
 * answer.
 *
 * So there are two things a length below Full can draw and no third: the form somebody wrote for
 * it, or this line. Nothing stands in — not a form written for another length, not the record's
 * own title column, not a selection of the report's lines.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS REPLACED, AND WHY THE THREE OLD SENTENCES WENT
 * ---------------------------------------------------------------------------------------
 *
 * Three sentences left the product with the fallback that made them true:
 *
 *   *No summary of this length was written for this report.* said the absence but not which level,
 *   and it was drawn at a length where a form written for a shorter one was on the screen above it.
 *
 *   *Nobody wrote a short form of this report at this length, so its title stands here instead.*
 *   described the title column standing in. The column no longer counts as a level, so nothing
 *   stands there and there is nothing to describe.
 *
 *   *The summary standing at this length is drawn above this report, and is not repeated here.*
 *   was for a form the page's own heading or lede had already drawn. Only the title and summary
 *   columns were ever drawn twice, and neither is a form any more.
 *
 * ---------------------------------------------------------------------------------------
 * IT NAMES THE LEVEL IN THE CONTROL'S OWN WORDS
 * ---------------------------------------------------------------------------------------
 *
 * `rungWord` reads the page-language word for this rung, and the level control draws the same
 * function's answer. A reader who pressed the control to reach this length reads back the words
 * that are on the control. A second wording here would be one fact in two places, which is the
 * defect this repository keeps finding.
 *
 * FULL NEVER REACHES THIS. Full is the report itself, so it is never missing, and `summaryAt` in
 * src/shared/reportrungs.ts answers `written` for it.
 */
const RUNG_WORD_KEYS: Readonly<Record<Rung, WordKey>> = {
  label: 'sb.rung.label',
  title: 'sb.rung.title',
  gist: 'sb.rung.gist',
  outline: 'sb.rung.outline',
  sketch: 'sb.rung.sketch',
  digest: 'sb.rung.digest',
  full: 'sb.rung.full',
}

function rungWord(rung: Rung): string {
  return t(RUNG_WORD_KEYS[rung])
}

function WhatStandsAtThisLength({ summary }: { summary: ReportSummary }) {
  if (summary.standing !== 'missing') return null
  return (
    <div className="sb-nosummary" data-summary="missing" {...drawnAtLength(summary.rung)}>
      <Absence tier="must-act-on" sentence={t('sb.notWrittenAtLength', { level: rungWord(summary.rung) })} />
    </div>
  )
}

/**
 * THE REPORT'S PARTS, DRAWN AT ONE OF THE THREE LENGTHS THAT ARE WRITTEN BY PART.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * One line per part at level 4 — the heading, which is that part of the report in one sentence,
 * set a little larger than the writing so a list of them reads as a list. At level 5 the same
 * heading with the part's 30-word text under it, at level 6 with its 120-word text. The heading is
 * the same sentence at all three, which is what lets a reader move up and down the ladder and meet
 * the same parts. `reportAt` in @shared/reportrungs.ts chooses all of that; nothing is decided here.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY PART IS A PLACE A PERSON CAN POINT AT
 * ---------------------------------------------------------------------------------------
 *
 * Each carries one `data-target` naming its own region, built by `partRegionId` from the part's
 * stored id, so the same part pressed at level 4 and at level 6 opens the composer on ONE thing.
 * The composer says which part it is, of how many, at which length, and which blocks of the report
 * it stands for.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHAT IS DRAWN UNDER A PART
 * ---------------------------------------------------------------------------------------
 *
 * The pictures and charts it covers, at levels 5 and 6, when the reader has the pictures on. Level
 * 4 draws none. A table is words rather than media: it is summarised in the part's text and drawn
 * only at Full. `reportAt` has already applied all three rules, so `part.media` is the answer and
 * this draws what it is given.
 */
function ReportParts({
  parts,
  blocks,
  site,
  readsAs,
  recordId,
}: {
  parts: readonly DrawnPart[]
  blocks: SummaryBlock[]
  site: Site | null
  readsAs: Reader
  recordId: string | null
}) {
  return (
    <div className="sb-parts">
      {parts.map((part) => (
        <div
          key={part.id}
          className="sb-part"
          {...(recordId === null ? {} : theRegion(recordId, partRegionId(part.id)))}
          {...(recordId === null ? {} : { tabIndex: -1 })}
        >
          <p className="sb-part-heading" {...drawnFrom(part.headingField)}>
            <span {...DRAWS_THE_NAME}>{part.heading}</span>
          </p>
          {part.text === null ? null : (
            <p className="sb-part-text" {...(part.field === null ? {} : drawnFrom(part.field))}>
              {part.text}
            </p>
          )}
          {part.media.length === 0 ? null : (
            <BlockList blocks={blocks} site={site} keyPrefix="b" readsAs={readsAs} only={new Set(part.media)} />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * HOW MANY BLOCKS OF THIS RECORD THIS READER IS NOT BEING SHOWN, AND THE WAY IN.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE SAFETY OF THE WHOLE PROJECTION MECHANISM, NOT A CONVENIENCE
 * ---------------------------------------------------------------------------------------
 *
 * `projections.md` §8: **on every surface that draws blocks, hiding one block changes a number the
 * reader can see.** Hiding nobody is told about is classifying away somebody's words, which the
 * owner's brief forbids by name. Hiding that moves a number on the same page is a fold.
 *
 * IT IS NOT `HowMuchThisSays` AND IT COULD NOT HAVE BEEN, measured in §8.1. That count is not
 * rendered at all at the default reading length, because `reportAt` returns `notDrawn = 0` there
 * and the whole element sits behind `notDrawn > 0`; it counts only the top level, so a marked block
 * inside a section or a tab moves nothing; the module page never draws it; and the two counts are
 * over overlapping sets, so adding them would tell a reader 51 blocks were missing when 50 is true.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SAYS, IN THREE STATES
 * ---------------------------------------------------------------------------------------
 *
 *   count is 0                nothing at all. Absence gets no weight.
 *   not revealed              a button reading `1 for developers`, which shows them for this visit.
 *   revealed                  `1 for developers · shown`, which puts them away again.
 *
 * IN THIS RECORD, NOT ON THIS PAGE, and the accessible name says so: the count is over the
 * record's block tree, and one of the blocks it counts may be behind a closed tab.
 *
 * WITH NO WAY TO PRESS IT, THE SENTENCE CARRIES THE WAY OUT rather than becoming silence. A surface
 * drawing blocks that are stored in no record has no per-record key to write, so there is no
 * reveal; it then reads `1 for developers — turn on Developer mode to read it`, which is a sentence
 * a reader can act on and needs no control. §12.3 withholds a control that cannot work; it never
 * withholds the route to the content.
 */
function ForDevelopers({
  count,
  revealed,
  onReveal,
}: {
  count: number
  revealed: boolean
  onReveal?: (on: boolean) => void
}) {
  if (count <= 0) return null
  const word = t('sb.forDevelopersWord', { n: count })
  // THE ACCESSIBLE NAME, BUILT ABOVE THE ELEMENT AND NOT INSIDE THE ATTRIBUTE. The sentence gate,
  // a test deleted on 12 November 2026, exempted a string written directly into `aria-label={...}`
  // and read the 120 characters before it to know that was where it was. A ternary in the
  // attribute put two sentences where it could not tell them from a paragraph. One name, one place.
  const name = t(revealed ? 'sb.forDevelopersRevealed' : 'sb.forDevelopersNotRevealed', { n: count })
  if (onReveal === undefined) {
    return (
      <p className="sb-fordev sb-fordev-said" data-count={count}>
        <span className="sb-fordev-word">{word}</span>
        <span className="sb-fordev-how"> {t('sb.turnOnDeveloperMode')}</span>
      </p>
    )
  }
  return (
    <button
      type="button"
      className="sb-fordev"
      data-count={count}
      data-revealed={revealed ? '1' : undefined}
      aria-expanded={revealed}
      aria-label={name}
      onClick={() => onReveal(!revealed)}
    >
      <span className="sb-fordev-word">{word}</span>
      <span className="sb-fordev-state">{revealed ? ` · ${t('sb.shown')}` : ''}</span>
      <span className="sb-fordev-arrow" aria-hidden="true">{revealed ? '\u25BE' : '\u25B8'}</span>
    </button>
  )
}

/**
 * THE MARK A BLOCK WEARS WHEN IT IS ONLY ON THE PAGE BECAUSE OF WHO IS READING.
 *
 * One word, beside the block, in the lane the block's own mark uses. A developer reading a report
 * has to be able to tell which paragraphs a normal reader is not getting, or Developer mode is a
 * different report rather than the same one with more of it shown.
 */
function MachineryMark() {
  return (
    <p className="sb-machinery" data-fit="read">
      <span className="sb-machinery-word">{t('pageWords.SummaryBlocks.001')}</span>
      <span className="sb-machinery-say">{t('pageWords.SummaryBlocks.002')}</span>
    </p>
  )
}

/**
 * ONE CONTROL FOR HOW MUCH OF THE REPORT IS DRAWN, AND IT IS DRAWN TWICE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REPLACED, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A report used to carry two controls over one value. Above the writing were four presets — All of
 * it, The argument, Words only, The conclusion — each setting a length and a pictures choice at
 * once. Below the writing was a second control drawing the numerals 1 to 6 and Full, a shortcut to
 * Full, the count of the blocks not drawn whole, and a way back to the length chosen on the
 * settings page.
 *
 * THE PRESETS WERE HARD TO READ: it was not clear what each one meant, or how they related
 * to Level 1 and Full. Two controls over one value, named in two vocabularies, is one fact
 * worked out in two places. There is one control instead, drawn in both places: a minus and a
 * plus on either side of the level, above the report and below it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * A minus, a label, a plus, and the pictures button. Minus moves one level shorter, plus one level
 * longer, and each is disabled at its end of the ladder — which is how a reader finds the ends
 * without a sentence saying where they are. The label reads Full, Conclusion, or Level n, and
 * `rungWord` is the one place that supplies those page-language words.
 *
 * A READER'S SHORT END IS THE CONCLUSION, NOT THE LABEL. Levels 1 and 2 are there for
 * debugging: a person reading a finished report goes down only as far as the conclusion (level 3).
 * And the offer a reader of a report sees SHRANK LATER
 * the control offers exactly Conclusion, Level 6 and Full, and the other
 * rungs stay in the ladder, storable and reachable through the API and for agents, without being
 * offered here. The disabled button is how a reader finds the end, exactly as it is at Full.
 *
 * ON A REPORT, AND ON NOTHING ELSE. The limit holds only for a report, the one thing a
 * reader steps through level by level. The same component draws a module's curated
 * summary, and there this control runs all seven and minus stops at Level 1. `kind` below is what
 * it asks with.
 *
 * THE PICTURES BUTTON LOST ITS WORDS AND KEPT ITS PLACE. It drew *Pictures drawn* or *Pictures left
 * out*, which is two words changing under the reader's hand for a state the button already shows.
 * No words are needed: a button that turns blue when pressed is clear enough. It is now an
 * icon that turns blue, and the words moved to the accessible name, where a screen reader still
 * reads them.
 *
 * NOTHING ON THE PAGE CHANGES SIZE WHEN THE LEVEL CHANGES: the middle of the control keeps
 * room enough for any label. The label is given a fixed width in the stylesheet,
 * wide enough for the longest of the seven labels, so no button beside it moves.
 *
 * ---------------------------------------------------------------------------------------
 * TWO INSTANCES, ONE STORED VALUE, TWO DECLARED REGIONS
 * ---------------------------------------------------------------------------------------
 *
 * Both instances write the same two stored choices through the same two setters, so there is no
 * second store and the two can never disagree about what the reader chose.
 *
 * THEY ARE STILL TWO REGIONS OF THE PAGE, and the caller says which. A record page is checked as a
 * tree of declared sections in which one key names one element, and two elements answering to one
 * key was a defect fixed in this cluster, so the second instance is declared in
 * src/shared/surfaces.ts rather than borrowing the first one's name.
 */
function LevelControl({
  rung,
  shown,
  rungs,
  pictures,
  declares,
}: {
  rung: Rung
  /**
   * WHAT THE LABEL READS. It is the rung the reader stands on, or — on a report whose kept choice
   * is no longer one of the three the control offers — the nearest offered position, worked out by
   * the caller, with the stored choice untouched and a title on the label naming what was stored.
   */
  shown: Rung
  /**
   * THE RUNGS THIS RECORD ACTUALLY HAS, and that a reader of it may stand on — worked out by the
   * caller with `readerRungsFor`, which asks all three of the rules that narrow the seven: what this
   * record has, which levels it has words for, and how low a person reads a report.
   *
   * IT USED TO BE THE KIND, and this control chose between `stepFrom` and `readerStepFrom` from it.
   * That was one of the two rules; the other — a record whose own words are already as short as a
   * level has no levels above that one — needs the record and not just its kind, so both are asked
   * in one place now and the control walks whatever list it is handed.
   */
  rungs: readonly Rung[]
  pictures: Chosen<Pictures>
  /**
   * WHICH OF THE TWO PLACES ON THE PAGE THIS INSTANCE IS. The names are in src/shared/surfaces.ts.
   *
   * IT IS THE WHOLE `declares` OBJECT AND NOT THE ID ALONE, which looks like a longer way of
   * writing the same thing and is not. A test read every name
   * in this product from the source, by `surface: '…'`, and could not see an id passed as a bare
   * string. That test was deleted on 12 November 2026.
   */
  declares: { surface: SurfaceId }
}) {
  // THE CONTROL WALKS THE LIST IT IS HANDED AND CARRIES NO RULE OF ITS OWN ABOUT WHERE THE LADDER
  // STOPS, AND IT STEPS FROM WHERE ITS LABEL READS, so the buttons and the words on the control
  // never disagree about where the reader is standing. On a report that list is THE THREE POSITIONS
  // the decision of 16 September 2026 offers — Conclusion, Level 6, Full — so minus answers null at
  // Conclusion and the button is disabled there (criterion A19, unchanged) and plus at Full. A
  // report whose kept choice is Level 4 stands displayed at Conclusion, so minus is disabled there
  // and plus moves into the offered three, and the stored choice is replaced the moment the reader
  // presses, which is what a press is. On a record whose own words are already as short as one of
  // the levels the list stops there too, so plus is disabled rather than offering a length with
  // nothing left to say in it.
  const shorter = stepWithin(rungs, shown, -1)
  const longer = stepWithin(rungs, shown, 1)
  // `partOfMoleOffice` AND NOT `declaredAttributes`, SO THE COMPOSER SAYS WHICH OF THE TWO CONTROLS
  // WAS PRESSED. Both spread the target; only this one also writes the declared name, which is what
  // the chip above the composer reads. With the target alone, `nameOnScreen` fell through to its
  // last resort — the words the element happens to draw — and both controls draw the same label, so
  // right-clicking either one opened a composer reading *Part of Mole Office's own screen / Full*,
  // which changed with the reading length and never said which control it was. The two names were
  // declared for exactly this and never reached a reader. Problem `abpBwHbn-00o`.
  return (
    <div className="sb-level" {...partOfMoleOffice(declares)}>
      <button
        type="button"
        className="sb-level-step"
        aria-label={t('sb.level.shorter')}
        disabled={shorter === null}
        onClick={() => {
          if (shorter !== null) setDetailHere('reportContent', shorter)
        }}
      >
        <span aria-hidden="true">−</span>
      </button>
      {/* THE ONLY WORDS ON THE CONTROL, AND THE ONE THING THAT CHANGES WHEN THE LEVEL DOES. Its
          width is fixed in the stylesheet, so the change is the word and never the layout.
          THE TITLE SAYS SO where the shown position is not the one the reader stands on: the kept
          choice stands, the control shows the nearest offered position, and a reader is told the
          two are different in a title. */}
      <span
        className="sb-level-label"
        title={shown === rung ? undefined : t('sb.level.storedShown', { stored: rungWord(rung), shown: rungWord(shown) })}
      >
        {rungWord(shown)}
      </span>
      <button
        type="button"
        className="sb-level-step"
        aria-label={t('sb.level.longer')}
        disabled={longer === null}
        onClick={() => {
          if (longer !== null) setDetailHere('reportContent', longer)
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
      {/* THE SECOND THING A READER DECIDES ABOUT A REPORT, and it is not a point on the length
          ladder. A reader who turns the pictures off has not asked for a shorter report. */}
      <button
        type="button"
        className="sb-pictures"
        aria-pressed={pictures.value === 'drawn'}
        aria-label={t(pictures.value === 'drawn' ? 'sb.level.picturesDrawn' : 'sb.level.picturesLeftOut')}
        onClick={() => setPicturesHere(pictures.value === 'drawn' ? 'left out' : 'drawn')}
      >
        {/* DRAWN HERE AND NOT LOADED, so the button has no second file to fetch and takes the
            colour of the text around it. `currentColor` is what makes it turn blue with the
            border when the pictures are on. */}
        <svg className="sb-pictures-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="5.4" cy="6.2" r="1.3" fill="currentColor" />
          <path d="M2.6 12.4 L6.4 8.2 L9.2 11.2 L11 9.4 L13.4 12.4 Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  )
}

/** One run of blocks, drawn in order. The record's own list, a section's, or a column's. */
function BlockList({
  blocks,
  site,
  keyPrefix,
  only,
  readsAs,
  waitingHere,
}: {
  blocks: readonly SummaryBlock[]
  site: Site | null
  keyPrefix: string
  /**
   * THE READER THIS LIST DECIDES AUDIENCE BY. Worked out once, in `SummaryBlocks`, and passed down.
   *
   * IT IS NOT NECESSARILY THE READER THE PAGE IS. A normal reader who has pressed `for developers`
   * reads BLOCKS as a developer for this visit and nothing else on the page changes: every
   * `<Machinery>` diagnostic inside those blocks still asks `useReader()` and still draws nothing.
   * Do not wire this prop into `<Machinery>`.
   *
   * IT IS ON `BlockList` AND NOT ON THE CALLER because this is the recursion point for `section`,
   * `columns`, `grid` and `tabs`, so one line covers nesting and no container has to know the rule.
   */
  readsAs: Reader
  /** See `waitingHere` on `BlocksInRecord`. Left out means nobody counted, and no mark is drawn. */
  waitingHere?: number
  /**
   * WHICH OF THEM TO DRAW, by their place in this list. Left out, every one is drawn.
   *
   * THE WHOLE LIST IS STILL WALKED, and that is what makes a reduced report safe: a block's stored
   * path is worked out from where it sits in the record, so filtering the array before this point
   * would renumber every block after the first one left out and every path would name the wrong
   * thing. Only the drawing is skipped.
   */
  only?: ReadonlySet<number>
}) {
  // Addressed by id when every block in the array has one and by position otherwise. That is
  // `byId`'s rule, which is also how the change log spells a path and how the server's reader
  // spells one, so the three cannot disagree about what a field is called.
  const byTheirIds = byId(blocks as unknown[]) !== null
  return (
    <>
      {blocks.map((block, index) =>
        // TWO REASONS A BLOCK IS NOT DRAWN, AND THEY ARE DIFFERENT REASONS. `only` is how much of
        // the report the reader asked for; `readerSees` is who the block was written for. Both skip
        // the drawing and NEITHER filters the array, because a block's stored path is worked out
        // from where it sits in the record and renumbering would make every stored path name the
        // wrong thing.
        (only !== undefined && !only.has(index)) || !readerSees(block.audience, readsAs) ? null : (
          // A FRAGMENT AND NOT A WRAPPER ELEMENT. The grid these blocks sit in places each child in
          // a lane by itself; a div around a block and its mark would put the two in one lane and
          // change the width of every report that has no mark at all.
          <Fragment key={block.id}>
            <Block
              block={block}
              index={index}
              keyPrefix={`${keyPrefix}${index}`}
              readsAs={readsAs}
              place={placeOf(site, block, index, byTheirIds)}
            />
            {/* A BLOCK THAT IS ONLY HERE BECAUSE OF WHO IS READING SAYS SO. Without this a
                developer and a normal reader who pressed the reveal would both see a paragraph
                with nothing to tell them it is not on everybody's page. */}
            {block.audience === 'developers' ? <MachineryMark /> : null}
            {waitingHere === undefined ? null : <CountMark block={block} live={waitingHere} />}
          </Fragment>
        ),
      )}
    </>
  )
}

/**
 * THE COUNT GUARD'S DRAWN HALF: what this block says, beside what the one reading says.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS AND WHY IT IS HERE
 * ---------------------------------------------------------------------------------------
 *
 * Report `NHtlTgnKAG8h`, block `b-6`, reads *"Nineteen things are waiting on you"*. That number was
 * true on the day it was typed, it is a claim about the corpus, and nothing recomputes it. Wave 2
 * built the half that refuses an AGENT writing one. A person is not refused — a human-facing box is
 * not where rules are enforced by refusal, and their wording is preserved exactly as typed — so the
 * stale number stays on the page with nothing beside it. This is the other half, and until this
 * wave it belonged to nobody: the block is left alone and Mole Office says, beside it, what it makes of
 * the claim.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS DRAWN, NEVER PRESSED, AND IT IS NOT AN ERROR
 * ---------------------------------------------------------------------------------------
 *
 * A stale count is not a fault in the writing; it is writing that has been overtaken. So the mark
 * is a note in the reader's own words, not a warning, and it carries no action: what to do about it
 * is the reader's, and the live number is one press away on the rail where it always was.
 *
 * ONE READING FINDS IT AND ONE READING COUNTS IT. `countDisagreementIn` is the same function the
 * write door asks — moved to `src/shared/waitingclaims.ts` for exactly this — so the mark cannot
 * appear beside a sentence the guard would let through, nor stay away from one it would catch. The
 * live number is `waitingHere`, handed down from the record page out of the same
 * `GET /api/waiting` reply the rail's badge draws.
 *
 * WHEN THE TWO AGREE, NOTHING IS DRAWN. A mark that appeared beside every counted sentence to say
 * "and this one is right" would be noise on the page in the ordinary case, and the ordinary case is
 * a report somebody wrote this morning.
 */
function CountMark({ block, live }: { block: SummaryBlock; live: number }) {
  // ONE BLOCK'S OWN PROSE, not the body's. The mark goes beside the block that makes the claim, so
  // the question asked is about this block and nothing above or below it.
  const found = countDisagreementIn([block], live)
  if (found === null) return null
  return (
    <p className="sb-countmark" data-stated={found.stated} data-live={String(found.live)}>
      {found.sentence}
    </p>
  )
}

/** Where one block is, and what it is. */
interface Place {
  /** The path of this block's stored object inside the record, e.g. `data.blocks[#b3]`. */
  path: string
  /** What this block IS, for `data-target`. Null for a block inside a section or a column. */
  target: Extract<Target, { kind: 'reportBlock' }> | null
  /** The record it is in, for the row and cell targets a table draws. Null when it has no address. */
  recordId: string | null
}

function placeOf(site: Site | null, block: SummaryBlock, index: number, byTheirIds: boolean): Place | null {
  if (site === null) return null
  const path = byTheirIds ? `${site.arrayPath}[#${block.id}]` : `${site.arrayPath}[${String(index)}]`
  if (!site.addressable) return { path, target: null, recordId: null }
  return {
    path,
    target: { kind: 'reportBlock', recordId: site.recordId, blockId: block.id },
    recordId: site.recordId,
  }
}

/** The site of the blocks a container holds. They are never separately addressable. */
function inside(place: Place | null, key: string): Site | null {
  return place === null ? null : { recordId: '', arrayPath: `${place.path}.${key}`, addressable: false }
}

/**
 * THE TWO THINGS A BLOCK'S ELEMENT SAYS ABOUT ITSELF: where it is stored, and what it is.
 *
 * `data-drawn-from` is on every block that sits inside a record, including the ones inside a
 * section or a column that have no address of their own. It is where the block IS, and it is what
 * lets a test read the set of stored paths a page drew rather than counting characters.
 *
 * `data-target` is what a person can point at, and it is on the record's own top-level blocks only.
 * A block inside a container is looked up by searching that top-level list, so it has no address of
 * its own yet and must not claim one.
 */
function blockMark(place: Place | null): Record<string, string> {
  if (place === null) return {}
  return { ...drawnFrom(place.path), ...(place.target === null ? {} : targetAttributes(place.target)) }
}

/**
 * A BLOCK INSIDE ANOTHER BLOCK SAYS WHICH REGION IT IS, so an anchor made at a short reading length
 * still lands on that block when the reader asks for more.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT THIS REMOVES, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * At "The conclusion" the outline draws one line per part and each line carries the region of the
 * whole block it stands for. At "All of it" that block is drawn as a block, and until this line its
 * element carried `data-drawn-from` and no target at all: only the paragraphs INSIDE it were
 * pointable. So an anchor filed on the gist line found, at Full, nothing but its own children.
 * Measured on report OOOt4Kouc5dT at commit 3bf359f: of forty region targets drawn at gist,
 * twenty-three resolved at Full only to a DESCENDANT of themselves.
 * `design/problem-03/baseline/ancestry.json` holds the rows. Their problem 4 asks for the opposite —
 * an anchor lands on itself or on something that CONTAINS it — and an anchor that silently becomes
 * narrower than what the person pointed at is the fault their sentence names.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY WHERE THE ELEMENT CARRIES NOTHING ELSE, AND THAT IS THE WHOLE RULE
 * ---------------------------------------------------------------------------------------
 *
 * An element carries one `data-target`. A block of the record's own top-level list already carries
 * `reportBlock`, which the server resolves to the same part of the report through
 * `regionIdOfLegacyTarget`, and taking that word away would take the marker off comments already
 * written against it. So this answers only for a block whose site is not addressable — a block
 * inside a section, a column or a part — which is exactly the set that carried no target.
 *
 * IT DECLARES NO NEW REGION. The id is the path the block is already stored at, which is the id
 * `regionsOf` derived for it; `carriesTarget` inside `regionMark` is still what decides whether it
 * is pointable, so a wrapper the derivation refused stays unpointable and the walk passes through.
 */
function blockRegionMark(marks: RegionMarks | null, place: Place | null): Record<string, string | number> {
  if (marks === null || place === null || place.target !== null) return {}
  return regionMark(marks, regionAtPath(marks, place.path))
}

/**
 * THE REGION STORED AT THIS EXACT PATH, or null.
 *
 * The other lookup — `regionStartingAt` — finds a region by where its characters START, which is
 * what a run of prose needs, because a paragraph is a slice of one long field. THIS one is for the
 * parts of a report that are stored as their own value: a checklist item, a figure's caption, the
 * source under a quotation, a block inside a section. Each of those is one path, the derivation
 * gives it that path as its id, and the drawing knows the path because it built it to read the
 * value out.
 *
 * A PATH WITH NO REGION ANSWERS NULL AND THE ELEMENT CARRIES NOTHING. That is the honest answer for
 * a value the derivation did not make a region of, and `regionMark` then emits no target, so the
 * press walks up to whatever does carry one instead of landing on a name the server cannot resolve.
 */
function regionAtPath(marks: RegionMarks | null, path: string | null): Region | null {
  if (marks === null || path === null) return null
  return marks.byId.get(path) ?? null
}

/**
 * WHAT A FIGURE'S CAPTION CARRIES, IN ONE PLACE FOR ALL SIX OF THEM.
 *
 * A caption is stored at `<the block>.caption` on an image, a table, a chart, a code listing, a
 * piece of mathematics and a quotation's source, and every one of those was drawn with the text
 * attributes and no target at all. Measured on 30 August 2026 over the eighteen reports in the
 * corpus: eleven captions were drawn at a shorter reading length carrying their region and drawn at
 * "All of it" carrying nothing, so an anchor made on one at the shorter length had nowhere to land
 * in the longer drawing.
 */
function captionRegionMark(marks: RegionMarks | null, place: Place | null): Record<string, string | number> {
  return regionMark(marks, regionAtPath(marks, place === null ? null : `${place.path}.caption`))
}

/**
 * EVERYTHING ONE BLOCK'S OWN ELEMENT CARRIES, BUILT IN ONE PLACE: where it is stored, what a person
 * may point at, which lane it stands in, what it holds, and how wide the writing inside it was asked
 * to read.
 *
 * IT IS A FUNCTION SO THAT ITS TYPE HAS A NAME. Three of the twenty-one blocks are drawn by
 * components of their own, and each of those takes this object as a prop. Written inline, the
 * object's type was `Record<string, string>` copied into three prop declarations, and the day a
 * measure put an inline style in it all three were wrong. `BlockMark` below is that type, read off
 * this function rather than written again.
 */
function blockAttributes(block: SummaryBlock, marks: RegionMarks | null, place: Place | null) {
  return {
    ...fitAttribute(block.type),
    ...needsAttribute(marks, place),
    ...leastAttribute(marks, place),
    ...blockMark(place),
    ...blockRegionMark(marks, place),
    ...measureMark(block),
  }
}

export type BlockMark = ReturnType<typeof blockAttributes>

/**
 * THE WORD A FENCE SAYS IT HOLDS, lowercased, or the empty string when it says nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT A LINE INSIDE THE FENCE ARM
 * ---------------------------------------------------------------------------------------
 *
 * The line that opens a fence may carry more than the word — CommonMark calls the whole of it the
 * info string, and `mermaid title="x"` is a legal one. Only the first word decides what a fence is,
 * so the rest is dropped here rather than being matched into the arm's condition.
 *
 * IT READS ANY NUMBER OF BACKTICKS. `renderMarkdown` opens a fence on three, and a writer who used
 * four gets the same answer. `~~~` is not a fence in this renderer and is not made into one here:
 * widening what opens a fence would change which characters are drawn as code, and this pass adds a
 * picture rather than changing that.
 */
export function fenceWordOf(line: string): string {
  const info = line.replace(/^`+/, '').trim()
  return (info.split(/\s+/)[0] ?? '').toLowerCase()
}

/**
 * A BLOCK OF CODE THAT SAYS WHEN A LINE RUNS OFF ITS EDGE.
 *
 * The block still scrolls rather than wrapping, and that is the decision: a line of code is as long
 * as its author wrote it, and folding it changes which characters are on which line — for a log, a
 * path or a shell command that is a different thing from what was stored. So this box is announced
 * rather than fixed, and the mark is what announces it.
 *
 * The code is the shape, because a `pre` can gain a longer line without its own box changing size,
 * and a size that did not change is a measurement that would not be taken again.
 *
 * `word` IS WHAT THE FENCE SAID IT HELD, and it is drawn as an attribute rather than as a label:
 * this pass reads the info string and puts it where a test and the developer overlay can see it,
 * and nothing about the box changes. A fence that said nothing carries no attribute at all, which
 * is how "the writer said nothing" is told from "the writer said nothing useful".
 */
function CodeBox({ code, word, children }: { code: string; word?: string; children: ReactNode }) {
  const reach = useReach(code)
  return (
    <InReachMark reach={reach}>
      <pre
        className="sb-code"
        data-fence={word === undefined || word === '' ? undefined : word}
        {...reachBox(reach, 'Block of code')}
      >
        {children}
      </pre>
    </InReachMark>
  )
}

// ---------------------------------------------------------------------------- a diagram fence

/** The word a fence says it holds when what it holds is a diagram. */
const DIAGRAM_FENCE = 'mermaid'

/**
 * WHICH TOKENS A DIAGRAM IS DRAWN OUT OF, and the mermaid variable each one answers.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TOKENS ARE READ AND NOT HANDED OVER
 * ---------------------------------------------------------------------------------------
 *
 * Mermaid takes its colours as JavaScript values at render time and derives more colours from them
 * — a border from a fill, a label's colour from its background. It never reads a CSS custom
 * property, so `var(--panel)` handed to it is a string it would try to darken. So the computed
 * value of each token is read off the root element and handed over as a colour, and the diagram is
 * drawn again whenever any of those values changes.
 *
 * THIS IS WHY `mono` WORKS AND IS NOT A SECOND CODE PATH. Every colour below comes from the
 * palette, so in a palette whose tokens are all grey every colour in the diagram is grey, and
 * nothing in it can be carrying meaning in a hue. `tests/a-diagram-survives-every-palette.test.ts`
 * checks that rather than trusting it.
 */
const DIAGRAM_TOKENS: readonly (readonly [string, readonly string[]])[] = [
  // The paper the diagram is drawn on.
  ['--panel', ['background', 'tertiaryColor', 'edgeLabelBackground', 'noteBkgColor']],
  // A node, and a note.
  ['--panel-2', ['primaryColor', 'mainBkg']],
  // A second node, and the box round a group of them.
  ['--panel-3', ['secondaryColor', 'clusterBkg']],
  // Every line: an edge, a node's own border, a group's border.
  ['--border-strong', ['primaryBorderColor', 'nodeBorder', 'noteBorderColor', 'secondaryBorderColor', 'tertiaryBorderColor']],
  ['--text-3', ['lineColor']],
  ['--border', ['clusterBorder']],
  // Every word.
  ['--text', ['textColor', 'primaryTextColor', 'secondaryTextColor', 'tertiaryTextColor', 'titleColor', 'noteTextColor', 'nodeTextColor']],
]

/** What the diagram box is doing right now. */
type Drawing =
  | { state: 'reading' }
  | { state: 'drawn'; svg: string }
  | { state: 'refused'; said: string }

/** The computed value of every token a diagram is drawn out of, as one string. */
function paletteReading(): string {
  if (typeof document === 'undefined') return ''
  const style = getComputedStyle(document.documentElement)
  return [...DIAGRAM_TOKENS.map(([token]) => token), '--font-sans', '--fs-2']
    .map((token) => `${token}:${style.getPropertyValue(token).trim()}`)
    .join(';')
}

/**
 * THE PALETTE AS A STRING, READ AGAIN WHENEVER IT CHANGES.
 *
 * It watches the token VALUES rather than the `data-theme` attribute, because the attribute is not
 * the only thing that moves them: `auto` is the absence of the attribute and follows the system,
 * and the appearance bar also changes the font and the text size. One reading covers all of it.
 */
function usePalette(): string {
  // READ ON THE FIRST RENDER, not on the first effect. Starting at the empty string and setting the
  // real reading afterwards would draw every diagram on the page twice on every load.
  const [reading, setReading] = useState(paletteReading)
  useEffect(() => {
    const read = () => setReading((was) => (was === paletteReading() ? was : paletteReading()))
    read()
    const watch = new MutationObserver(read)
    watch.observe(document.documentElement, { attributes: true })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', read)
    return () => {
      watch.disconnect()
      media.removeEventListener('change', read)
    }
  }, [])
  return reading
}

/**
 * DRAW ONE DIAGRAM, WITH THE LIBRARY LOADED ONLY WHEN THERE IS ONE TO DRAW.
 *
 * ---------------------------------------------------------------------------------------
 * THE IMPORT IS INSIDE THE EFFECT ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * `import('mermaid')` here is what makes the library its own chunk and what keeps it off a page
 * with no diagram on it. It is a bundled chunk and never a network fetch: the office runs on a
 * machine that may have no internet, and a page that needed one would draw nothing there.
 * `tests/a-diagram-is-drawn-with-no-network.test.ts` holds both halves of that.
 *
 * ---------------------------------------------------------------------------------------
 * A FENCE THE PARSER CANNOT READ IS NOT A BLANK BOX
 * ---------------------------------------------------------------------------------------
 *
 * `suppressErrorRendering` stops mermaid drawing its own error graphic into the page, so the
 * message comes back here as a thrown error and this component decides what a reader sees: the
 * characters the writer wrote, with the parser's own words beside them. Invariant 2 — the requested
 * method did not run, so it says so rather than quietly drawing prose.
 */
/**
 * ONE DIAGRAM IS DRAWN AT A TIME, AND THIS IS WHY.
 *
 * Mermaid holds ONE configuration and ONE temporary element while it works: `initialize` sets a
 * module-level config, and `render` puts the diagram in a hidden element it finds by id, measures
 * the text in it, and takes it away again. Two of those running at once take each other's.
 *
 * MEASURED, on their report at 1440 on 8 September 2026: eight diagrams started together, all eight
 * components ended in the drawn state, and TWO pictures were on the page. The other six were handed
 * an empty string and drew a box with nothing in it — no error anywhere, which is the shape this
 * fault always has. With this queue, eight of eight.
 */
let theQueue: Promise<unknown> = Promise.resolve()
function inTurn<T>(what: () => Promise<T>): Promise<T> {
  const mine = theQueue.then(what, what)
  theQueue = mine.then(
    () => undefined,
    () => undefined,
  )
  return mine
}

/**
 * A NAME NO DIAGRAM ON THE PAGE ALREADY HAS.
 *
 * Mermaid puts the name it is given on the `<svg>` it hands back, AND it deletes any element on the
 * page already carrying that name before it starts. So drawing the same diagram twice under one
 * name — which is what a change of palette asks for — deletes the picture that is on the screen,
 * and React then writes nothing back because the string it holds has not changed.
 *
 * MEASURED, on their report at 1440 on 8 September 2026: three of the eight boxes ended empty with
 * every component reporting itself drawn. A counter costs one number and the fault cannot happen.
 */
let drawnSoFar = 0

/**
 * THE DRAWING AT ITS OWN SIZE, so that a box too narrow for it SCROLLS rather than shrinking it.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FIXES, MEASURED ON THE PICTURES
 * ---------------------------------------------------------------------------------------
 *
 * Mermaid hands back an `<svg>` carrying `width="100%"` and a viewBox, so a browser fits it to
 * whatever box it is in and the whole drawing — its words with it — is scaled down. Measured on their
 * report on 8 September 2026: one diagram whose natural width is 545px drew at 545px at 1440 and at
 * 340px at 390, which is 62 per cent, so its 16px labels reached the screen at about 10px. This
 * product holds every page to a 13px floor and there is no floor inside a picture.
 *
 * So the width is written as the viewBox's own, and the box round it is the thing that scrolls —
 * with `InReachMark` saying which edge the drawing carries on past. That is the answer a table, an
 * equation and a block of code already get here, and it is the one the diagram's own box gives.
 */
function atItsOwnSize(svg: string): string {
  const box = /<svg[^>]*\sviewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg)
  const ends = svg.indexOf('>')
  if (box === null || ends === -1 || !svg.startsWith('<svg')) return svg
  const wide = String(Math.ceil(Number(box[1])))
  const tall = String(Math.ceil(Number(box[2])))
  const rest = svg
    .slice(4, ends)
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
  return `<svg width="${wide}px" height="${tall}px"${rest}${svg.slice(ends)}`
}

function useDiagram(code: string): Drawing {
  const palette = usePalette()
  const own = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [drawing, setDrawing] = useState<Drawing>({ state: 'reading' })
  useEffect(() => {
    let stale = false
    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        const style = getComputedStyle(document.documentElement)
        const variables: Record<string, string> = {}
        for (const [token, names] of DIAGRAM_TOKENS) {
          const value = style.getPropertyValue(token).trim()
          if (value === '') continue
          for (const name of names) variables[name] = value
        }
        const { svg } = await inTurn(async () => {
          mermaid.initialize({
            startOnLoad: false,
            // `strict` is mermaid's own sanitiser on the labels inside a diagram. A report is
            // written by agents, and what they write is drawn on the owner's own origin.
            securityLevel: 'strict',
            suppressErrorRendering: true,
            theme: 'base',
            themeVariables: variables,
            fontFamily: style.getPropertyValue('--font-sans').trim(),
          })
          drawnSoFar += 1
          return mermaid.render(`sb-diagram-${own}-${String(drawnSoFar)}`, code)
        })
        // AN EMPTY ANSWER IS NOT A PICTURE. Mermaid can hand back a string with no drawing in it,
        // and drawing an empty box would be this component reporting a success it did not have.
        if (!svg.includes('<svg')) throw new Error(`mermaid answered with no drawing in it`)
        if (!stale) setDrawing({ state: 'drawn', svg: atItsOwnSize(svg) })
      } catch (trouble) {
        // The parser's own words, whatever shape they arrived in. Never a sentence written here:
        // a message this file made up would be this file's guess at what is wrong with their text.
        const said = trouble instanceof Error ? trouble.message : String(trouble)
        if (!stale) setDrawing({ state: 'refused', said })
      }
    })()
    return () => {
      stale = true
    }
  }, [code, palette, own])
  return drawing
}

/**
 * A FENCE THAT SAID `mermaid`: THE PICTURE, AND THE TEXT KEPT WHERE A COMMENT CAN LAND.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ADDED AND WHAT IS NOT TAKEN AWAY
 * ---------------------------------------------------------------------------------------
 *
 * `children` is the `<code>` element the fence arm made: the same characters, the same `saidToBe`
 * offsets, the same region mark. It is drawn on the page in every state this component has. A
 * picture drawn INSTEAD of it would delete eight anchors in the report this was built for, and a
 * comment already filed against one of them would have nowhere to land (criticism objection 3).
 *
 * THE FOLD CLOSES ONLY ONCE THERE IS A PICTURE. Before the library has loaded, and when the parser
 * refuses the text, the box is exactly the block of code this product drew before — so a reader
 * with no JavaScript, a reader on a slow load and a reader looking at a broken fence all get the
 * characters rather than an empty frame.
 *
 * BOTH BOXES SAY WHEN SOMETHING IS OFF THEIR EDGE. `CodeBox` already did; the picture box does it
 * here. A mermaid drawing is regularly wider than 390px, and it SCROLLS rather than being scaled
 * down: scaling puts the diagram's own words below the 13px floor this product holds every page to,
 * and every other wide thing in a report — a table, an equation, a block of code — scrolls and says
 * so. One rule, not a second one for pictures.
 */
function ThePicture({ svg }: { svg: string }) {
  // THE DRAWING ITSELF IS THE SHAPE. `useReach` takes what the caller has that would change the
  // measurement, and for this box that is the drawing in it — nothing else about the page moves it.
  const reach = useReach(svg)
  return (
    <InReachMark reach={reach}>
      <div
        className="sb-diagram"
        {...reachBox(reach, 'Diagram')}
        /* Mermaid's own output, sanitised by mermaid under `securityLevel: 'strict'`. There is no
           other way to put an SVG a library built onto the page. */
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </InReachMark>
  )
}

function Diagram({ code, children }: { code: string; children: ReactNode }) {
  const drawing = useDiagram(code)
  if (drawing.state === 'drawn') {
    return (
      <figure className="sb-block sb-diagram-fig" data-fence={DIAGRAM_FENCE}>
        <ThePicture svg={drawing.svg} />
        <details className="sb-diagram-text">
          <summary>{t('pageWords.SummaryBlocks.003')}</summary>
          <CodeBox code={code} word={DIAGRAM_FENCE}>
            {children}
          </CodeBox>
        </details>
      </figure>
    )
  }
  return (
    <figure className="sb-block sb-diagram-fig" data-fence={DIAGRAM_FENCE} data-diagram={drawing.state}>
      {drawing.state === 'refused' ? (
        <p className="sb-diagram-refused" role="note">
          <span className="sb-diagram-refused-what">{t('pageWords.SummaryBlocks.004')}</span>{' '}
          <span className="sb-diagram-refused-said">{drawing.said}</span>
        </p>
      ) : null}
      <CodeBox code={code} word={DIAGRAM_FENCE}>
        {children}
      </CodeBox>
    </figure>
  )
}

function Block({
  block,
  index,
  keyPrefix,
  readsAs,
  place,
}: {
  block: SummaryBlock
  index: number
  keyPrefix: string
  /** Handed straight down to the four nested lists. See `readsAs` on `BlockList`. */
  readsAs: Reader
  place: Place | null
}) {
  const key = keyPrefix
  // Both facts about this block's element in one object: where it is stored, and which lane it
  // stands in. The lane is written even where the block has no address of its own — a block inside
  // a section is not separately addressable and is still laid out.
  //
  // A TYPE THIS BUILD HAS NEVER HEARD OF CLAIMS NO LANE. Blocks arrive as JSON from the database, so
  // a row written by a newer version can carry a type that is in no map here. It is drawn by the
  // refusal at the foot of this switch, which is a sentence, and the default track is prose, which
  // is where a sentence belongs. Reading the lane map for it would have thrown and taken the whole
  // report with it — the one thing the refusal exists to prevent.
  // THE REGION TREE OF THE REPORT THIS BLOCK IS IN, so the prose drawn below can say which part of
  // it each paragraph, bullet and heading is, and so this block can say how much width it needs.
  // Null in a settings preview and anywhere the blocks are not stored in a record, where nothing
  // can be pointed at and nothing claims to be.
  const marks = useContext(RegionsHere)
  // WHAT THE WRITING INSIDE THIS BLOCK WAS ASKED TO READ AT, kept out of `mark` as well as in it.
  // `mark` is spread onto every block element below, which is how a measure reaches all twenty-one
  // of them from one place; the two container arms that write a style of their own read it from
  // here and merge it, so neither of them can quietly drop it.
  const measured = measureMark(block)
  const mark = blockAttributes(block, marks, place)

  switch (block.type) {
    case 'text': {
      // Blocks arrive as JSON out of the database, so a row written before this shape existed can
      // still be missing the one field the block is made of. A visible box beats a blank page.
      if (typeof block.text !== 'string') {
        return <Refused index={index} what={t('sb.refused.textBlock.what')} why={t('sb.refused.textBlock.why')} />
      }
      // IN THE PAGE'S LANGUAGE WHERE THE BLOCK HOLDS IT. On a Chinese page a block whose Chinese was
      // written from this English is drawn in Chinese, its offsets pointing into `zh`, which is where those
      // characters are stored. Otherwise it is drawn in its English, a Chinese written from an older English
      // included. Nothing under a block says which languages it holds, in either mode: such a line looked
      // strange and told a reader nothing they could use, and under every paragraph it took up much of a report.
      const chinese = wordLanguage() === 'zh' ? theChineseOfATextBlock(block) : null
      const inChinese = chinese?.state === 'current' ? chinese : null
      const headingText = inChinese === null ? block.heading : inChinese.heading
      const bodyText = inChinese === null ? block.text : inChinese.text
      const heading = fieldIn(place, inChinese === null ? 'heading' : 'zh.heading', headingText)
      const body = fieldIn(place, inChinese === null ? 'text' : 'zh.text', bodyText)
      return (
        <div className={block.tone === 'quiet' ? 'sb-block sb-text sb-quiet' : 'sb-block sb-text'} {...mark}>
          {headingText ? (
            // A BLOCK'S OWN HEADING IS A REGION OF ITS OWN, cut from the `heading` field rather than
            // from the prose, so it is looked up at character 0 of that field.
            <h4
              className="sb-h"
              {...WRITING}
              {...regionMark(marks, regionStartingAt(marks, heading?.field, 0, ['heading']))}
            >
              {renderInline(headingText, key + 'h', wholeOf(heading, headingText))}
            </h4>
          ) : null}
          {renderMarkdown(bodyText, key, body, marks)}
        </div>
      )
    }

    case 'heading': {
      // Levels start at 3 in the markup: the record title owns h1 and the panel owns h2.
      const Tag = block.level === 3 ? 'h4' : 'h3'
      const from = fieldIn(place, 'text', block.text)
      return (
        // A HEADING BLOCK IS ITS OWN WRITING. There is nothing inside it but words, so the
        // maximum lands on the block itself here and on a child everywhere else. This is the one
        // block whose region and whose writing are the same box.
        <Tag className="sb-block sb-h" {...WRITING} {...mark}>
          {renderInline(block.text, key, wholeOf(from, block.text))}
        </Tag>
      )
    }

    case 'finding': {
      const from = fieldIn(place, 'text', block.text)
      const detail = fieldIn(place, 'detail', block.detail)
      return (
        <div className="sb-block sb-finding" data-state={block.state} {...mark}>
          {block.state ? <StateChip state={block.state} /> : null}
          <p className="sb-finding-text" {...WRITING}>
            {renderInline(block.text, key, wholeOf(from, block.text))}
          </p>
          {block.detail ? (
            <div className="sb-finding-detail">{renderMarkdown(block.detail, key + 'd', detail, marks)}</div>
          ) : null}
        </div>
      )
    }

    case 'callout': {
      const title = fieldIn(place, 'title', block.title)
      const body = fieldIn(place, 'text', block.text)
      return (
        <aside className="sb-block sb-callout" data-tone={block.tone} {...mark}>
          <p className="sb-callout-head" {...WRITING}>
            {/* THE WORD, ALWAYS, AND NOT ONLY THE COLOUR. A warning that is only a yellow edge is
                not a warning in the mono theme, in greyscale, or to a reader who cannot tell the
                two edges apart. Same rule as StateChip: meaning never lives in a colour alone. */}
            <span className="sb-callout-word">{t(CALLOUT_WORDS[block.tone])}</span>
            {block.title ? (
              // A CALLOUT'S TITLE IS A REGION OF ITS OWN, cut from the `title` field, and it is
              // looked up at character 0 of that field exactly as a text block's heading is. It
              // carried nothing until 30 August 2026, so the two callout titles the outline draws
              // at "The conclusion" on report OOOt4Kouc5dT had no landing place at all at "All of
              // it" — the two `gone` rows in design/problem-03/baseline/ancestry.json.
              <span
                className="sb-callout-title"
                {...regionMark(marks, regionStartingAt(marks, title?.field, 0, ['heading']))}
              >
                {renderInline(block.title, key + 't', wholeOf(title, block.title))}
              </span>
            ) : null}
          </p>
          <div className="sb-callout-body">{renderMarkdown(block.text, key, body, marks)}</div>
        </aside>
      )
    }

    case 'metrics': {
      const byTheirIds = byId(block.items as unknown[]) !== null
      return (
        <dl className="sb-block sb-metrics" {...mark}>
          {block.items.map((m, i) => {
            const at = place === null ? null : `${place.path}.items${byTheirIds ? `[#${m.id}]` : `[${String(i)}]`}`
            const label = at === null ? null : { field: `${at}.label`, stored: m.label }
            const note = at === null || m.note === undefined ? null : { field: `${at}.note`, stored: m.note }
            return (
              <div key={m.id} className="sb-metric" data-state={m.state}>
                <dt>{renderInline(m.label, `${key}m${i}l`, wholeOf(label, m.label))}</dt>
                <dd>
                  <span className="sb-metric-value">{m.value}</span>
                  {m.unit ? <span className="sb-metric-unit">{m.unit}</span> : null}
                </dd>
                {m.state ? <StateChip state={m.state} /> : null}
                {m.note ? (
                  <p className="sb-metric-note">{renderInline(m.note, `${key}m${i}`, wholeOf(note, m.note))}</p>
                ) : null}
              </div>
            )
          })}
        </dl>
      )
    }

    case 'keyvalue': {
      const byTheirIds = byId(block.items as unknown[]) !== null
      return (
        <dl className="sb-block sb-kv" {...mark}>
          {block.items.map((item, i) => {
            const at = place === null ? null : `${place.path}.items${byTheirIds ? `[#${item.id}]` : `[${String(i)}]`}`
            const label = at === null ? null : { field: `${at}.label`, stored: item.label }
            const value = at === null ? null : { field: `${at}.value`, stored: item.value }
            return (
              <div key={item.id} className="sb-kv-row">
                <dt>{renderInline(item.label, `${key}k${i}l`, wholeOf(label, item.label))}</dt>
                <dd>{renderInline(item.value, `${key}k${i}v`, wholeOf(value, item.value))}</dd>
              </div>
            )
          })}
        </dl>
      )
    }

    case 'checklist': {
      const byTheirIds = byId(block.items as unknown[]) !== null
      return (
        <ul className="sb-block sb-checklist" {...mark}>
          {block.items.map((item, i) => {
            const at = place === null ? null : `${place.path}.items${byTheirIds ? `[#${item.id}]` : `[${String(i)}]`}`
            const from = at === null ? null : { field: `${at}.text`, stored: item.text }
            const note = at === null || item.note === undefined ? null : { field: `${at}.note`, stored: item.note }
            return (
              // ONE ITEM OF A CHECKLIST IS A REGION AT ITS OWN PATH, and the outline draws one line
              // per item at the shorter reading lengths. It carried no target here until 30 August
              // 2026: ninety-six checklist items across the corpus were pointable at "The
              // conclusion" and unpointable at "All of it".
              <li
                key={item.id}
                className="sb-check"
                data-state={item.state}
                {...regionMark(marks, regionAtPath(marks, at))}
              >
                {/* The state as the chip the whole app draws it as: the word, the shape and the
                    colour together, so it reads the same here as on a checklist in a module. */}
                <StateChip state={item.state} />
                <span className="sb-check-text">
                  {renderInline(item.text, `${key}c${i}`, wholeOf(from, item.text))}
                </span>
                {item.note ? (
                  <p className="sb-check-note">
                    {renderInline(item.note, `${key}c${i}n`, wholeOf(note, item.note))}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )
    }

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag className="sb-block sb-list" {...mark}>
          {block.items.map((t, i) => {
            const from = place === null ? null : { field: `${place.path}.items[${String(i)}]`, stored: t }
            return (
              <li key={i} {...WRITING}>
                {renderInline(t, `${key}l${i}`, wholeOf(from, t))}
              </li>
            )
          })}
        </Tag>
      )
    }

    case 'code': {
      const from = fieldIn(place, 'code', block.code)
      const caption = fieldIn(place, 'caption', block.caption)
      return (
        <figure className="sb-block sb-code-fig" {...mark}>
          {block.language ? <span className="sb-code-lang">{block.language}</span> : null}
          <CodeBox code={block.code}>
            {/* The code element holds the stored characters and nothing else, so it says where
                they are: a line of a pasted log is quotable straight off the screen. */}
            <code {...saidToBe(from, block.code, 0)}>{block.code}</code>
          </CodeBox>
          {block.caption ? (
            <figcaption {...WRITING} {...captionRegionMark(marks, place)}>
              {renderInline(block.caption, key + 'c', wholeOf(caption, block.caption))}
            </figcaption>
          ) : null}
        </figure>
      )
    }

    case 'chart': {
      const caption = fieldIn(place, 'caption', block.caption)
      return (
        <figure className="sb-block sb-chart" {...mark}>
          <Chart spec={block.spec} />
          {block.caption ? (
            <figcaption {...WRITING} {...captionRegionMark(marks, place)}>
              {renderInline(block.caption, key + 'c', wholeOf(caption, block.caption))}
            </figcaption>
          ) : null}
        </figure>
      )
    }

    case 'math': {
      const caption = fieldIn(place, 'caption', block.caption)
      return (
        <figure className="sb-block sb-math" {...mark}>
          <MathText tex={block.tex} display />
          {block.caption ? (
            <figcaption {...WRITING} {...captionRegionMark(marks, place)}>
              {renderInline(block.caption, key + 'c', wholeOf(caption, block.caption))}
            </figcaption>
          ) : null}
        </figure>
      )
    }

    case 'timeline': {
      const byTheirIds = byId(block.items as unknown[]) !== null
      return (
        // AN ORDERED LIST, because the order is the meaning. Read aloud it is "one, two, three"
        // rather than a heap of bullets, which is what a timeline is.
        <ol className="sb-block sb-timeline" {...mark}>
          {block.items.map((item, i) => {
            const at = place === null ? null : `${place.path}.items${byTheirIds ? `[#${item.id}]` : `[${String(i)}]`}`
            const when = at === null ? null : { field: `${at}.when`, stored: item.when }
            const from = at === null ? null : { field: `${at}.text`, stored: item.text }
            const detail = at === null || item.detail === undefined ? null : { field: `${at}.detail`, stored: item.detail }
            return (
              <li key={item.id} className="sb-event" data-state={item.state}>
                <span className="sb-when">{renderInline(item.when, `${key}t${i}w`, wholeOf(when, item.when))}</span>
                <div className="sb-event-body">
                  <p className="sb-event-text">
                    {renderInline(item.text, `${key}t${i}`, wholeOf(from, item.text))}
                    {item.state ? <StateChip state={item.state} /> : null}
                  </p>
                  {item.detail ? (
                    <div className="sb-event-detail">{renderMarkdown(item.detail, `${key}t${i}d`, detail, marks)}</div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      )
    }

    case 'image':
      return <ImageFigure block={block} index={index} keyPrefix={key} place={place} mark={mark} />

    case 'file':
      return <FileFigure block={block} keyPrefix={key} place={place} mark={mark} />

    case 'audio':
      return (
        <ReportAudio block={block} mark={mark} useChoice={useMediaChoice} Held={MediaNotLoaded} record={marks?.recordId} caption={block.caption ? (
          <figcaption {...WRITING} {...captionRegionMark(marks, place)}>
            {renderInline(block.caption, `${key}c`, wholeOf(fieldIn(place, 'caption', block.caption), block.caption))}
          </figcaption>
        ) : null} />
      )

    case 'video':
      return (
        <ReportVideo block={block} mark={mark} useChoice={useMediaChoice} Held={MediaNotLoaded} record={marks?.recordId} caption={block.caption ? (
          <figcaption {...WRITING} {...captionRegionMark(marks, place)}>
            {renderInline(block.caption, `${key}c`, wholeOf(fieldIn(place, 'caption', block.caption), block.caption))}
          </figcaption>
        ) : null} />
      )

    case 'table':
      return <TableFigure block={block} index={index} keyPrefix={key} place={place} mark={mark} />

    case 'quote': {
      const from = fieldIn(place, 'text', block.text)
      return (
        <figure className="sb-block sb-quote" {...mark}>
          {/* THE QUOTED WORDS AND WHO SAID THEM ARE TWO REGIONS, and both were drawn with no target
              until 30 August 2026 — ten of them across the corpus, pointable at a shorter reading
              length and not at "All of it". */}
          <blockquote {...WRITING} {...regionMark(marks, regionStartingAt(marks, from?.field, 0, ['quote', 'paragraph']))}>
            {renderInline(block.text, key + 'q', wholeOf(from, block.text))}
          </blockquote>
          {block.source ? (
            <figcaption {...WRITING} {...regionMark(marks, regionAtPath(marks, place === null ? null : `${place.path}.source`))}>
              <span className="sb-quote-dash" aria-hidden="true">—</span> {block.source}
            </figcaption>
          ) : null}
        </figure>
      )
    }

    case 'path':
      return (
        <div className="sb-block sb-pathblock" {...mark}>
          <div className="sb-path-head">
            <span className="sb-path-label">{block.label}</span>
            {block.kind ? <span className="sb-path-kind">{block.kind}</span> : null}
            {block.machine ? <span className="sb-path-machine">{t('sb.path.onMachine', { machine: block.machine })}</span> : null}
          </div>
          {block.kind === 'video' && !isBrowserLoadable(block.path) ? <PathVideo block={block} /> : null}
          <PathLine path={block.path} id={`path-${key}`} />
        </div>
      )

    case 'world':
      return <WorldHere block={block} mark={mark} />

    case 'section': {
      const title = fieldIn(place, 'title', block.title)
      return (
        <section className="sb-block sb-section sb-reads" {...mark}>
          {/* A SECTION IS A LANE GRID OF ITS OWN, and it is exactly as wide as the container,
              because it stands in the full lane. So `100cqi` inside it means the same box it
              means outside it, and a paragraph inside a section is the same width as a paragraph
              beside it — which is what makes the nesting invisible. The title keeps the wide lane
              so its rule is exactly as long as it is today; the body takes the whole width so a
              table inside a section can still grow. */}
          {block.title ? (
            // A SECTION'S TITLE IS A REGION OF ITS OWN, exactly as a text block's heading is, and it
            // carried nothing until 30 August 2026. Measured over the eighteen reports in the
            // corpus: thirty-four section titles were pointable at "The short version" and at "The
            // conclusion" — where the outline draws one line per section — and unpointable at "All
            // of it", so an anchor made on a section heading at a shorter length landed on the whole
            // section, four to six levels of markup wider than what the reader pointed at.
            <h3
              className="sb-h sb-section-title"
              data-fit="read"
              {...WRITING}
              {...regionMark(marks, regionStartingAt(marks, title?.field, 0, ['heading']))}
            >
              {renderInline(block.title, key + 't', wholeOf(title, block.title))}
            </h3>
          ) : null}
          <div className="sb-section-body sb-reads" data-fit="spanning">
            <BlockList blocks={block.blocks} site={inside(place, 'blocks')} keyPrefix={`${key}s`} readsAs={readsAs} />
          </div>
        </section>
      )
    }

    case 'columns': {
      /*
       * A COMPARISON, DRAWN BY THE SAME MECHANISM AS A COMPOSITION AND NOT BY A SECOND ONE.
       *
       * WHAT A COLUMNS BLOCK IS, BESIDE A `beside` BLOCK: a row whose columns are all worth the
       * same. A `beside` block is a row whose parts may be worth different amounts because an Agent
       * said so. Everything else about the two is identical, so the stylesheet has one set of rules
       * and this arm emits the same three things the `beside` arm emits: the width below which the
       * row stops fitting, and one word per column saying how narrow that column may be drawn.
       *
       * EQUAL IS THE DEFAULT AND IS NEVER WRITTEN HERE. `--share: 1` is declared on .sb-column in
       * SUMMARY_CSS and this arm does not override it, which is the whole of "the columns of a
       * comparison are equal". A `columns` block has nowhere to store a share — its columns are a
       * bare array of arrays with no id and no object to hang one on — so there is nothing an Agent
       * could have asked for here to honour or refuse.
       *
       * `equalColumns` IS THE PLAN, AND IT IS THE ONE THE LAYOUT ROUTE READS TOO. It gives every
       * column a share of 1, which is what the stylesheet draws, and it adds the floors up into the
       * width below which the row stacks. This arm called `roomFor` until 29 August 2026 and threw
       * its shares away: `roomFor` answers "nobody said, so read what each column holds", which
       * gives writing three and a picture two, and CSS drew ones. The numbers were unused here and
       * therefore harmless here, but GET /api/records/:id/layout now reports on comparisons as well
       * as compositions, and reporting those shares would have described a row nobody draws.
       *
       * WHAT THIS REPLACED, MEASURED. Until 29 August 2026 a columns block was a grid that switched
       * to two, three or four tracks at a fixed 30rem, 45rem or 60rem, whatever the columns held.
       * On report ulbs6FHMndo2 at 1440 that drew two columns of prose at 277.5px each inside a
       * 573px part of a composition. It now stacks there, because two columns of writing need
       * 20rem each.
       */
      const laid = block.columns.map((blocks) => ({ blocks, least: leastNeededByBlocks(blocks) }))
      const plan = equalColumns(
        place?.path ?? '',
        laid.map((column, c) => ({ id: String(c), least: column.least })),
      )
      return (
        <div
          className="sb-block sb-columns"
          data-columns={block.columns.length}
          // THE WIDTH BELOW WHICH THESE COLUMNS STOP FITTING BESIDE EACH OTHER, in rem plus the
          // gaps — the same style the `beside` arm below writes, for the same reason. The rem come
          // from the shared module through `equalColumns`; the gap stays a token, because it is 6,
          // 10, 12, 16 or 18 pixels depending on the reader's density and this component cannot
          // know which.
          {...mark}
          style={
            {
              ...measured.style,
              '--row-least': `calc(${String(plan.stackBelowRem)}rem + ${String(plan.gaps)} * var(--sb-gut))`,
            } as CSSProperties
          }
        >
          {laid.map((column, c) => (
            <div key={c} className="sb-column" data-least={column.least}>
              <BlockList
                blocks={column.blocks}
                site={inside(place, `columns[${String(c)}]`)}
                keyPrefix={`${key}c${c}`}
                readsAs={readsAs}
              />
            </div>
          ))}
        </div>
      )
    }

    case 'beside': {
      /*
       * PARTS OF ONE THING, DRAWN BESIDE EACH OTHER. Four layers, and this arm owns two of them.
       *
       * THE PART OWNS ITS COLUMN AND THE COLUMN IS NEVER NARROWED TO SUIT THE WRITING IN IT. That
       * is the trap this whole feature is most likely to fall into, so it is written here as well
       * as in src/shared/beside.ts: a stated reading measure sets --sb-measure on the part and the
       * stylesheet applies it to the BLOCKS inside, as a maximum. Nothing here writes a width, a
       * percentage or an fr onto a part. What a part gets is a share, which is a number compared
       * with its siblings, and a floor, which is a word.
       *
       * THE ARRANGEMENT IS THE BROWSER'S AND NOT A SCRIPT'S. There is no measurement in this
       * component and no listener on a resize. Three declarations in SUMMARY_CSS do all of it, and
       * `drawnAt` in src/shared/beside.ts states the same arithmetic again so that the same answer
       * can be given in words with no screen anywhere. Those two are reconciled by a test that runs
       * both at eleven widths on the same report, not by a comment asking for care.
       */
      // ONLY THE PARTS THIS READER WILL SEE. A part whose blocks are every one of them written for
      // developers draws nothing, and a weighted column with nothing in it is a hole somebody has
      // to explain. Fewer than two parts left is not a composition, so what is left is drawn
      // straight into the report rather than as one lonely column with a share.
      const shown = block.parts.filter((part) => part.blocks.some((b) => readerSees(b.audience, readsAs)))
      if (shown.length < 2) {
        const only = shown[0]
        return (
          <BlockList
            blocks={only?.blocks ?? []}
            site={inside(place, only === undefined ? 'parts' : `parts[#${only.id}].blocks`)}
            keyPrefix={`${key}p`}
            readsAs={readsAs}
          />
        )
      }

      // THE REGION ID OF ONE PART, COMPOSED TO LOOK IT UP AND FOR NO OTHER PURPOSE. The renderer
      // never spells an id it then hands out: `regionsOf` is the one walk that names regions, and
      // an id that is not in its answer gets no attribute at all. Null wherever the blocks are not
      // stored in a record, which is a settings preview.
      const idOfPart = (part: BesidePart): string | null =>
        place === null ? null : `${place.path}.parts[#${part.id}]`

      // WHAT EACH PART IS WORTH, ANSWERED BY THE SHARED MODULE AND NOT HERE. A part whose content
      // nobody classified asks for the widest floor, exactly as the stylesheet's own default does,
      // so the two cannot disagree about a preview.
      const plan = roomFor(
        place?.path ?? '',
        shown.map((part) => ({
          id: part.id,
          least: (idOfPart(part) === null ? undefined : marks?.leastAt.get(idOfPart(part) ?? '')) ?? 'sentence',
          ...(part.share === undefined ? {} : { share: part.share }),
          ...(part.measure === undefined ? {} : { measure: part.measure }),
        })),
      )

      // THE PLAN PUT BACK BESIDE THE BLOCKS IT IS ABOUT. `roomFor` answers about ids, so the two are
      // joined by id rather than by position. A part id missing from the answer is unreachable — the
      // write door refuses two parts with one name — and if a record written by another version has
      // one, the reader gets Mole Office's own refusal rather than a row drawn at shares that are
      // not the ones the layout route reports.
      const rooms = new Map<string, PartRoom>(plan.parts.map((room) => [room.id, room]))
      const laid: { part: BesidePart; room: PartRoom }[] = []
      for (const part of shown) {
        const room = rooms.get(part.id)
        if (room !== undefined) laid.push({ part, room })
      }
      if (laid.length !== shown.length) {
        return (
          <Refused
            index={index}
            what={t('sb.refused.partsBeside.what')}
            why={t('sb.refused.partsBeside.why')}
          />
        )
      }

      return (
        <div
          className="sb-block sb-beside"
          data-parts={String(laid.length)}
          // WHO CHOSE THE PROPORTIONS, on the element, because a reader of the markup and a
          // screenshot both have to be able to tell an agent's intent from Mole Office's reading.
          data-share-by={plan.chosenBy}
          // THE WIDTH BELOW WHICH THESE PARTS STOP FITTING BESIDE EACH OTHER, in rem plus the gaps.
          // The rem come from the shared module through `roomFor`; the gap stays a token, because it
          // is 6, 10, 12, 16 or 18 pixels depending on the reader's density and this component
          // cannot know which.
          {...mark}
          style={
            {
              ...measured.style,
              '--row-least': `calc(${String(plan.stackBelowRem)}rem + ${String(plan.gaps)} * var(--sb-gut))`,
            } as CSSProperties
          }
        >
          {laid.map(({ part, room }, i) => {
            const id = idOfPart(part)
            const least = id === null ? undefined : marks?.leastAt.get(id)
            const measure = part.measure === undefined ? null : measureMaxWidth(part.measure)
            return (
              <div
                key={part.id}
                className="sb-beside-part"
                {...(id === null ? {} : drawnFrom(id))}
                {...(least === undefined ? {} : { 'data-least': least })}
                // WHAT THE REPORT ASKED FOR, AND WHAT MOLE OFFICE MADE OF IT, side by side and never
                // one instead of the other. `data-asked` is absent when nobody asked, which is how
                // "Mole Office chose this" is READ off the markup rather than guessed from the
                // numbers coming out equal.
                {...(part.share === undefined ? {} : { 'data-asked': String(part.share) })}
                data-share={String(room.share)}
                {...(part.measure === undefined ? {} : { 'data-measure': String(part.measure) })}
                style={
                  {
                    '--share': String(room.share),
                    ...(measure === null ? {} : { '--sb-measure': measure }),
                  } as CSSProperties
                }
                {...regionMark(marks, id === null ? null : (marks?.byId.get(id) ?? null))}
              >
                <BlockList
                  blocks={part.blocks}
                  site={inside(place, `parts[#${part.id}].blocks`)}
                  keyPrefix={`${key}p${String(i)}`}
                  readsAs={readsAs}
                />
              </div>
            )
          })}
        </div>
      )
    }

    case 'grid':
      return (
        // THE SAME BLOCK RENDERER, one level down. A grid is an arrangement of blocks and not a
        // kind of content, so there is no drawing code here at all beyond where they go.
        <div
          className="sb-block sb-grid"
          data-across={block.across === undefined ? 'fit' : String(block.across)}
          {...mark}
        >
          <BlockList blocks={block.blocks} site={inside(place, 'blocks')} keyPrefix={`${key}g`} readsAs={readsAs} />
        </div>
      )

    case 'tabs':
      return <TabsFigure block={block} keyPrefix={key} place={place} readsAs={readsAs} mark={mark} />

    // THE QUESTIONS A REPORT ASKS THE PERSON. The words are drawn here with their provenance, so a
    // reader can point at a question as at a paragraph; ReportQuestions.tsx draws the controls.
    case 'choice': {
      const byTheirIds = byId(block.options as unknown[]) !== null
      return (
        <ChoiceQuestion
          block={block}
          mark={mark}
          question={
            <p className="rq-question" {...WRITING}>
              {renderInline(block.question, `${key}q`, wholeOf(fieldIn(place, 'question', block.question), block.question))}
            </p>
          }
          labels={block.options.map((option, at) => {
            const field = `options${byTheirIds ? `[#${option.id}]` : `[${String(at)}]`}.label`
            return renderInline(option.label, `${key}o${String(at)}`, wholeOf(fieldIn(place, field, option.label), option.label))
          })}
        />
      )
    }

    case 'fillin':
      return (
        <FillInQuestion
          block={block}
          mark={mark}
          asks={
            <span className="rq-asks-words" {...WRITING}>
              {renderInline(block.asks, `${key}a`, wholeOf(fieldIn(place, 'asks', block.asks), block.asks))}
            </span>
          }
        />
      )

    case 'button':
      return <ButtonQuestion block={block} mark={mark} />

    case 'box': {
      // A BOX IS A SECTION WITH A FRAME: its title is a region as a section's is, and its blocks are drawn
      // by the same list, so pointing and comments inside it work as they do in a section. It sends
      // nothing on its own; the whole report's one submit sends its answers.
      const title = fieldIn(place, 'title', block.title)
      return (
        <QuestionBox
          block={block}
          mark={mark}
          title={
            block.title ? (
              <h3
                className="sb-h sb-section-title"
                data-fit="read"
                {...WRITING}
                {...regionMark(marks, regionStartingAt(marks, title?.field, 0, ['heading']))}
              >
                {renderInline(block.title, key + 't', wholeOf(title, block.title))}
              </h3>
            ) : null
          }
        >
          <BlockList blocks={block.blocks} site={inside(place, 'blocks')} keyPrefix={`${key}x`} readsAs={readsAs} />
        </QuestionBox>
      )
    }

    default: {
      // The union is closed in TypeScript, but blocks arrive as JSON from the database, so a
      // record written by a newer version can carry a type this build has never heard of.
      // Dropping it silently would delete something a human chose to say.
      const unknown = block as { type?: unknown }
      return (
        <Refused
          index={index}
          what={t('sb.refused.unknownType.what', { type: JSON.stringify(String(unknown.type)) })}
          why={t('sb.refused.unknownType.why')}
        />
      )
    }
  }
}

/**
 * A TEST WORLD IN A HANDBACK: the press that opens it, and whether it is still up. Criterion C31.
 *
 * A world is a natural test ground: for a new feature, an agent can call the person into a
 * test world to look at it, and the person then decides whether it needs changing.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT ASKS THE LEDGER RATHER THAN TRUSTING THE BLOCK
 * ---------------------------------------------------------------------------------------
 *
 * A world is a running process, and a handback outlives it. A block that said *the world is at this
 * address* and nothing more would go on saying it for weeks after the world was stopped, and the
 * person would follow a dead link and read the silence as the feature being broken. So the block
 * carries the LEDGER ROW and this reads that row when the page is drawn: up, gone, or nobody could
 * look. The third is a real answer and is drawn as one.
 *
 * THE PRESS THAT STOPS IT IS NOT HERE, and that is deliberate. `POST /api/resources/<id>/release`
 * already stops a registered process, with a confirmation phrase naming exactly what it would end,
 * and `SessionPanel.tsx` already draws that press. A second stop button with its own idea of what
 * it was killing is the second-place defect this repository keeps finding. This says where the
 * press is.
 */
function WorldHere({ block, mark }: { block: WorldBlock; mark: Record<string, unknown> }) {
  const [from, setFrom] = useState<'this machine' | 'another machine' | null>(null)
  useEffect(() => {
    let stopped = false
    void api.access().then((said) => { if (!stopped) setFrom(said.caller.from) }).catch(() => { if (!stopped) setFrom(null) })
    return () => { stopped = true }
  }, [])
  const opens = from === null ? undefined : from === 'another machine' ? block.webForOtherMachines : block.web
  const apiAddress = from === 'another machine' ? block.apiForOtherMachines : block.api
  const [up, setUp] = useState<'looking' | 'up' | 'gone' | 'cannot-tell'>('looking')

  useEffect(() => {
    if (block.ledgerRow === undefined) {
      setUp('cannot-tell')
      return
    }
    let stopped = false
    void (async () => {
      try {
        const res = await fetch(whereRequestsGo('/api/resources'), { headers: moleOfficeHeaders(), credentials: 'include' })
        if (!res.ok) throw new Error(String(res.status))
        const said = (await res.json()) as { resources?: { id: string }[] }
        if (stopped) return
        setUp((said.resources ?? []).some((one) => one.id === block.ledgerRow) ? 'up' : 'gone')
      } catch {
        if (!stopped) setUp('cannot-tell')
      }
    })()
    return () => {
      stopped = true
    }
  }, [block.ledgerRow])

  return (
    <div className="sb-block sb-world" {...mark}>
      <div className="sb-world-head">
        <span className="sb-world-label">{block.label}</span>
        <span className="sb-world-state" data-up={up}>
          {t(
            up === 'looking'
              ? 'sb.world.asking'
              : up === 'up'
                ? 'sb.world.isUp'
                : up === 'gone'
                  ? 'sb.world.stopped'
                  : block.ledgerRow === undefined
                    ? 'sb.world.notRegistered'
                    : 'sb.world.ledgerUnreadable',
          )}
        </span>
      </div>
      {block.because === undefined ? null : <p className="sb-world-why">{block.because}</p>}
      <p className="sb-world-act">
        {opens === undefined ? <span>{t(from === null ? 'sb.world.addressUnknown' : 'sb.world.unavailableFromHere')}</span> : (
          <>
            <a className="sb-world-open" href={opens} target="_blank" rel="noreferrer">{t('sb.world.openTheWorld')}</a>
            <span className="sb-world-where">{opens}</span>
          </>
        )}
      </p>
      {apiAddress === undefined ? null : <p className="sb-world-api">{t('sb.world.apiIsAt', { apiAddress })}</p>}
      <dl className="sb-world-addresses">
        <div><dt>{t('sb.world.thisMachine')}</dt><dd>{block.web}</dd></div>
        {block.webForOtherMachines === undefined ? null : <div><dt>{t('sb.world.otherMachines')}</dt><dd>{block.webForOtherMachines}</dd></div>}
      </dl>
      {block.webForOtherMachines === undefined ? <p className="sb-world-why">{t('sb.world.reachableHereOnly')}</p> : null}
      {block.ledgerRow === undefined ? (
        <p className="sb-world-why">{t('sb.world.notInLedger')}</p>
      ) : (
        <p className="sb-world-why">{t('sb.world.holdsLedgerRow', { row: block.ledgerRow })}</p>
      )}
    </div>
  )
}

/**
 * THE WORD DRAWN ON A CALLOUT, for each tone there is.
 *
 * A total map over `CALLOUT_TONES`, so a third tone added to the vocabulary stops this file
 * compiling rather than drawing an aside with no word on it. The word is not decoration: it is the
 * only channel that survives the mono theme, greyscale and a reader who cannot tell two edges apart.
 */
/**
 * A TABLE CELL OR HEADING THAT IS ONE SHORT WORD: no space in it and at most 12 characters, such as
 * "1923-B", 测了什么 or 什么算广告，什么算启事. It is kept on one line, and the table scrolls if it must. A longer
 * text still wraps, so one long sentence cannot set the whole table's width.
 */
export function oneShortWord(text: string): boolean {
  return text.length > 0 && [...text].length <= 12 && !/\s/.test(text)
}

const CALLOUT_WORDS: Record<CalloutTone, WordKey> = {
  note: 'summaryBlocks.callout.note',
  warning: 'summaryBlocks.callout.warning',
}

/**
 * ONE THING SHOWN AND THE REST PUT AWAY.
 *
 * Its own component because it is the one block that remembers something — which tab is open — and
 * a hook cannot live inside the switch that draws every other block.
 *
 * WHAT IS UNDER AN UNOPENED TAB IS NOT DRAWN AT ALL, rather than drawn and hidden. Hidden markup is
 * still markup: a comment could be anchored to a paragraph nobody can see, and this page would then
 * claim a person had pointed at something on their screen. Not drawing it is the honest half of
 * what a tab is, and the labels say what else is there.
 */
function TabsFigure({
  block,
  keyPrefix,
  place,
  readsAs,
  mark,
}: {
  block: TabsBlock
  keyPrefix: string
  place: Place | null
  readsAs: Reader
  /** Which track this block takes and how much width it needs, worked out once by `Block`. */
  mark: BlockMark
}) {
  const [open, setOpen] = useState(0)
  const shown = block.tabs[open] ?? block.tabs[0]
  if (shown === undefined) {
    return <Refused index={0} what={t('sb.refused.tabs.what')} why={t('sb.refused.tabs.why')} />
  }
  const byTheirIds = byId(block.tabs as unknown[]) !== null
  const at = byTheirIds ? `tabs[#${shown.id}].blocks` : `tabs[${String(block.tabs.indexOf(shown))}].blocks`
  return (
    <div className="sb-block sb-tabs sb-reads" {...mark}>
      <div className="sb-tablist" role="tablist" data-fit="read">
        {block.tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${keyPrefix}-tab-${tab.id}`}
            aria-selected={i === open}
            aria-controls={`${keyPrefix}-panel-${shown.id}`}
            className="sb-tab"
            onClick={() => setOpen(i)}
          >
            {tab.label}
            {/* PRESSING THE REVEAL MUST CHANGE SOMETHING VISIBLE, AND THIS TAB IS WHY IT CAN.
                A tabs block draws the OPEN tab only, so a marked block behind a closed tab is not
                in the DOM: flipping `readsAs` on its own would be a press that appeared to do
                nothing. The count in §8.2 is over the record's block tree and includes it, so the
                tab that holds it carries the mark and the reader has somewhere to press. */}
            {readsAs !== 'normal' && tab.blocks.some((b) => b.audience === 'developers') ? (
              <span className="sb-machinery sb-machinery-tab">{t('pageWords.SummaryBlocks.005')}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        className="sb-tabpanel sb-reads"
        role="tabpanel"
        data-fit="spanning"
        id={`${keyPrefix}-panel-${shown.id}`}
        aria-labelledby={`${keyPrefix}-tab-${shown.id}`}
      >
        <BlockList
          blocks={shown.blocks}
          site={inside(place, at)}
          keyPrefix={`${keyPrefix}p${String(open)}`}
          readsAs={readsAs}
        />
      </div>
    </div>
  )
}

/** The visible failure. Every refusal on this page goes through here, so none can be quiet. */
function Refused({ index, what, why }: { index: number; what: ReactNode; why: ReactNode }) {
  return (
    <p className="sb-block sb-fail" role="alert">
      <strong>{t('sb.blockNotShown', { index })}</strong> {what} {t('sb.couldNotBeRendered')} {why}
    </p>
  )
}

// ------------------------------------------------------------------- where the words are stored

/**
 * ONE STORED STRING, AND WHAT IT IS CALLED.
 *
 * `field` is the path from the record down, spelled the way `stringsIn` on the server spells one
 * and the way the change log spells one. `stored` is the string itself, kept so that nothing here
 * has to be believed: every offset is checked against it before it is written onto an element.
 */
interface Origin {
  field: string
  stored: string
}

/** One field of a block, or nothing when these blocks are not stored anywhere. */
function fieldIn(place: Place | null, key: string, stored: string | undefined): Origin | null {
  if (place === null || stored === undefined) return null
  return { field: `${place.path}.${key}`, stored }
}

/**
 * THE TWO PROVENANCE ATTRIBUTES, OR NONE — AND THE CHECK THAT MAKES THEM TRUE.
 *
 * An element carrying an offset promises that the stored string holds exactly these characters at
 * exactly that position. This is the one place that promise is made, and it reads the stored string
 * and confirms it first. When it cannot, nothing is written: a run of text with no offset is a run
 * a comment cannot be pinned to, which is a smaller loss than Mole Office later telling somebody their
 * untouched paragraph has changed.
 */
function saidToBe(origin: Origin | null, drawn: string, at: number): Record<string, string> {
  if (origin === null || at < 0) return {}
  if (origin.stored.slice(at, at + drawn.length) !== drawn) return {}
  return textAttributes(origin.field, at)
}

/** One stretch of drawn text that really is one stretch of stored text. */
interface Stretch {
  /** Where it starts in the string being drawn. */
  from: number
  /** Where it ends in the string being drawn. */
  to: number
  /** Where the same characters start in the stored string. */
  at: number
}

/**
 * What `renderInline` should say about each run it draws.
 *
 * A run that crosses the join between two stretches gets no offset, and that is the case this exists
 * for: a sentence written across two lines is drawn as one line with a space where the newline was,
 * so the drawn characters are not the stored characters and no offset would be true of both.
 *
 * A RUN ACROSS A LINE BREAK IS THE ONE EXCEPTION, and it gets a different attribute. With the chat's
 * `lineBreaks` switch on, every join is a `LINE_BREAK`, drawn as a `br` and not as a character, so each
 * line of the run is still a stretch of the stored string. `linesOf` gives each line its own place.
 */
function originOf(origin: Origin | null, drawn: string, stretches: readonly Stretch[]): TextOrigin | undefined {
  if (origin === null) return undefined
  return (from, length) => {
    const stretch = stretches.find((s) => from >= s.from && from + length <= s.to)
    if (stretch === undefined) return linesOf(origin, drawn, stretches, from, length)
    const marks = saidToBe(origin, drawn.slice(from, from + length), stretch.at + (from - stretch.from))
    return Object.keys(marks).length === 0 ? null : marks
  }
}

/**
 * WHERE EACH LINE OF A RUN DRAWN ACROSS LINE BREAKS IS STORED, on an attribute of its own.
 *
 * Its value is the field and one `[at, length]` for each line, in the order the lines are drawn, a
 * `br` between each two. It is not the two provenance attributes: an offset promises one stretch of
 * stored characters, and this run is several. So the readers of those two, a selection and a comment,
 * see nothing here, as before. The chat reads it to paint a marked part on each line.
 *
 * EVERY LINE IS CHECKED AGAINST THE STORED STRING, as `saidToBe` checks a run, or nothing is written.
 * A run with no line break in it gets nothing, which keeps every drawing with the switch off as it was.
 */
function linesOf(origin: Origin, drawn: string, stretches: readonly Stretch[], from: number, length: number): Record<string, string> | null {
  const run = drawn.slice(from, from + length)
  if (!run.includes(LINE_BREAK)) return null
  const lines: [number, number][] = []
  let at = from
  for (const line of run.split(LINE_BREAK)) {
    const stretch = stretches.find((s) => at >= s.from && at + line.length <= s.to)
    if (stretch === undefined) return null
    const stored = stretch.at + (at - stretch.from)
    if (origin.stored.slice(stored, stored + line.length) !== line) return null
    lines.push([stored, line.length])
    at += line.length + LINE_BREAK.length
  }
  return { [TEXT_LINES_ATTRIBUTE]: JSON.stringify({ field: origin.field, lines }) }
}

/**
 * The field and the stored place of each line, read back from the attribute `linesOf` wrote, or null
 * when the value is not one it writes.
 */
export function linesOfARun(value: unknown): { field: string; lines: readonly (readonly [number, number])[] } | null {
  if (typeof value !== 'string') return null
  let read: unknown
  try {
    read = JSON.parse(value)
  } catch {
    return null
  }
  if (typeof read !== 'object' || read === null) return null
  const { field, lines } = read as { field?: unknown; lines?: unknown }
  if (typeof field !== 'string' || !Array.isArray(lines) || lines.length < 2) return null
  const places = lines.filter((one): one is [number, number] => Array.isArray(one) && one.length === 2 && one.every((n) => Number.isInteger(n) && (n as number) >= 0))
  return places.length === lines.length ? { field, lines: places } : null
}

/** The ordinary case: the whole drawn string is one stretch of the stored string, starting at `at`. */
function wholeOf(origin: Origin | null, drawn: string, at = 0): TextOrigin | undefined {
  return originOf(origin, drawn, [{ from: 0, to: drawn.length, at }])
}

// ---------------------------------------------------------------------------- image block

/**
 * Whether a browser stands any chance of loading this path.
 *
 * A page served over http cannot open file:///... -- the browser blocks it, with no
 * error the page can catch. So paths like that are never put in an <img>: a permanently broken
 * image icon would suggest the file is missing when it is sitting right there on disk.
 *
 * A LEADING SLASH COUNTS AS A FILESYSTEM PATH, NOT A URL. "/srv/project/x/overlay.png"
 * and "/static/overlay.png" are indistinguishable as strings, and Mole Office has to choose. It
 * chooses filesystem, because Mole Office never copies media and therefore never serves any: an
 * absolute path in a record is a path on a machine. Something the app itself serves is written
 * as an http(s) URL or as ./relative.
 */
export function isBrowserLoadable(path: string): boolean {
  return /^(https?:\/\/|data:|\.{1,2}\/)/.test(path.trim())
}

/**
 * Where the bytes of one recorded path are asked for.
 *
 * The path is sent as written, encoded once. `GET /api/file` refuses a `..` segment rather than
 * normalising it away and does not decode a second time, so a path is compared against what the
 * record stores segment for segment — which only works if this end does not rewrite it either.
 */
export function previewUrl(path: string, record?: string): string {
  return `/api/file?path=${encodeURIComponent(path)}` + (record ? `&record=${encodeURIComponent(record)}` : '')
}

/**
 * THE ADDRESS A VIDEO'S PLAYER, OR A LINK THAT SAVES A FILE, ASKS FOR IT AT.
 *
 * Both fetch the file themselves and neither can send a header, so the project goes into the
 * address: `GET /api/file` reads `workspace` exactly as it reads x-mole-office-workspace, and
 * refuses the two disagreeing, as the owner's message says. The key
 * travels as the cookie it already is.
 */
export function addressForTheBrowser(path: string, project: string | null, saved: boolean, record?: string): string {
  return (
    previewUrl(path, record) +
    (project === null ? '' : `&workspace=${encodeURIComponent(project)}`) +
    (saved ? '&download=1' : '')
  )
}

/**
 * WHERE A LINK IN A REPORT OPENS OR SAVES A STORED FILE: a video's, a picture's or a file block's.
 *
 * ONE FUNCTION FOR ALL THREE, because two of them used to differ from the video's (problem
 * YnVxZz0Md_G4, 4 October 2026). On another machine only a report's videos could be saved. A file
 * block's link was the bare `previewUrl`: it named no project, so the door read it in `default` and
 * refused a report from any other project, and it was a path on the page's own server, which in
 * development is not the API. A picture had no link at all. A link cannot send a header, so it
 * needs the project in its address and the API's own origin, as the video's save link had.
 */
export function whereALinkFetches(path: string, saved: boolean, inProject?: string, record?: string): string {
  return whereRequestsGo(addressForTheBrowser(path, theProjectARequestNames(inProject), saved, record))
}

/**
 * IS WHAT ARRIVED A VIDEO? Criterion M54: a picture or a video is transferred and shown.
 *
 * IT READS THE RESPONSE'S OWN CONTENT TYPE AND NOT THE FILE'S NAME. `GET /api/file` declares the
 * type from the extension in one place and sends `x-content-type-options: nosniff` with it, so the
 * door has already answered "what are these bytes". Asking the file name again here would be a
 * second answer to that question, free to disagree with the door's.
 *
 * A REPLY THAT SAID NOTHING ABOUT ITSELF IS NOT A VIDEO. Null means nobody said; drawing a video
 * player over bytes nothing described would be a guess, and an `<img>` that cannot draw them says
 * so honestly through `undecodable`.
 */
export function isAVideo(type: string | null): boolean {
  return type !== null && type.trim().toLowerCase().startsWith('video/')
}

/**
 * IS A FILE BLOCK'S FILE A PICTURE A SMALL ONE CAN BE DRAWN FOR? Problem T3yQblhc2A28.
 *
 * The same reading as `isAVideo`: the door's own content type, not the file's name. The pictures are
 * the image types Mole Office recognises by their first bytes (`SIGNED_TYPES`): PNG, JPEG, WebP and
 * GIF. An SVG or an AVIF file stays a file, as every other file does.
 */
export function isAPictureFile(type: string | null): boolean {
  if (type === null) return false
  const said = type.split(';')[0]?.trim().toLowerCase() ?? ''
  return said.startsWith('image/') && said in SIGNED_TYPES
}

/**
 * IS A FILE BLOCK'S FILE AN HTML PAGE THAT CAN BE DRAWN IN THIS PAGE?
 *
 * The same reading as `isAVideo`: the door's own content type, not the file's name. The door serves
 * both extensions it knows as text/html, so this is the one answer for a file called .html or .htm.
 * A file of any other type keeps today's drawing.
 */
export function isAnHtmlPage(type: string | null): boolean {
  if (type === null) return false
  return (type.split(';')[0]?.trim().toLowerCase() ?? '') === 'text/html'
}

/**
 * IS A FILE BLOCK'S FILE A PDF THE REPORT CAN READ IN PLACE?
 *
 * The same reading as `isAnHtmlPage`: the door's own content type. The frame for a PDF carries no
 * sandbox attribute, because Chromium's reader refuses to draw inside a sandboxed frame at all; the
 * PDF policy on the report's open=1&shown=1 answer is what holds the document instead.
 */
export function isAPdf(type: string | null): boolean {
  if (type === null) return false
  return (type.split(';')[0]?.trim().toLowerCase() ?? '') === 'application/pdf'
}

/** Which of the file kinds the report draws in a frame, or null when the file keeps today's drawing. */
export type FileShownKind = 'html' | 'pdf' | 'word' | 'text'

/**
 * EVERY KIND THE REPORT DRAWS IN A FRAME, READ FROM THE DOOR'S OWN TYPE.
 *
 * HTML and PDF are read here; a Word document and a text file are named by the shared list, because
 * the file door builds their page and the page must ask for exactly the types the door answers.
 * The kind is what decides the frame's sandbox and the sentence on it, never the file's name.
 */
export function theKindOfShownFile(type: string | null): FileShownKind | null {
  if (isAnHtmlPage(type)) return 'html'
  if (isAPdf(type)) return 'pdf'
  return theShownFileKind(type)
}

/**
 * WHAT IS KNOWN ABOUT ONE PICTURE. EIGHT ANSWERS, AND NO TWO OF THEM MAY BE DRAWN THE SAME.
 *
 * The three the whole design turns on are `not-asked`, `refused` and `missing`, because they are
 * the three a reader would act on differently and the three that a single grey box used to merge:
 *
 *   not-asked   nobody has looked. Nothing was requested, so nothing was refused and nothing was
 *               found missing. This is what a page shows before its effects run.
 *   refused     Mole Office considered the request and said no, and the endpoint's own sentence says
 *               which clause of the confinement rule it was — no record points at it, only a
 *               deleted one does, the record says the file is on another machine, it is outside
 *               every preview root, it is a directory, it is unreadable, it is too big.
 *   missing     the endpoint looked and there is no file there. The record's pointer is stale.
 *
 * `unreachable` is a fourth and is not `refused`: nobody answered at all, which is a fact about
 * the server rather than about the file. `undecodable` is a fifth: the bytes are real, they
 * arrived, and they are not a picture this browser can draw — the file exists and is readable, so
 * calling that "missing" would be false about the one thing it is not.
 */
export type PreviewOutcome =
  | { phase: 'not-asked' }
  | { phase: 'asking' }
  /**
   * Real bytes, from a real response. `src` is never the raw filesystem path.
   *
   * `type` and `bytes` are what the response said about itself, kept because they are the two
   * facts that make the `undecodable` sentence below say something useful rather than "it did not
   * work". They are null on a source the browser loaded itself, where this page never saw either.
   * `saveAt` is where a video is saved whole from, present for a video the door streams.
   */
  | { phase: 'shown'; src: string; type: string | null; bytes: number | null; saveAt?: string }
  /**
   * `why` IS WHAT THE BOX SAYS AND `detail` IS THE WHOLE OF IT, criterion M54.
   *
   * The door writes both, in one statement, from the same facts — a short sentence for the screen
   * and the full account behind it. A page that shortened the long one itself would be a second
   * answer to *why was this refused*, free to say something the door never said. `detail` is null
   * when the door sent only one sentence, which is most refusals: there is nothing to put behind
   * a message that is already short.
   */
  | { phase: 'omitted' }
  | { phase: 'missing'; why: string; detail: string | null }
  | { phase: 'refused'; status: number; why: string; detail: string | null }
  | { phase: 'unreachable'; why: string }
  | { phase: 'undecodable'; type: string | null; bytes: number | null }
  /** A path the browser was asked to load itself — an http URL or a relative one — and could not. */
  | { phase: 'browser-refused'; src: string }

/** Every outcome in which there is no picture. The type is what makes the table below total. */
export type PreviewFailure = Exclude<PreviewOutcome, { phase: 'shown' }>

/** The label and the sentence for every outcome that is not a picture. One table, one wording. */
export interface PreviewStand {
  /** The small uppercase word. It is what tells the failures apart at a glance. */
  tag: string
  said: string
  /**
   * The door's whole account, when it sent a short sentence as well. Null when `said` IS the whole
   * of what was said, so a reader is never offered a fold with nothing new behind it.
   */
  detail: string | null
}

/**
 * What to say when there is no picture.
 *
 * PURE, AND SEPARATE FROM THE COMPONENT, so every branch can be read and tested without a DOM, a
 * network or a browser. It takes `PreviewFailure` rather than `PreviewOutcome` so that the switch
 * is exhaustive with no default arm and no null return: a new outcome added to the union stops
 * this file compiling instead of quietly rendering an empty box where a sentence belongs.
 *
 * THE DOOR'S SHORT SENTENCE IS WHAT THE BOX SAYS, AND ITS WHOLE ACCOUNT SITS BEHIND IT. `/api/file`
 * writes both. Nothing here shortens anything: this page draws whichever of the two the door
 * marked for the screen, and the other is one press away. Criterion M54 — the owner read the whole
 * confinement contract over an alt text where a picture should have been. Where the door sent only
 * one sentence, that one is drawn and there is nothing behind it.
 */
export function previewStand(outcome: PreviewFailure): PreviewStand {
  switch (outcome.phase) {
    case 'not-asked':
      return { tag: t('sb.stand.tag.notFetched'), said: t('sb.file.notAskedYet'), detail: null }
    case 'asking':
      return { tag: t('sb.stand.tag.fetching'), said: t('sb.file.asking'), detail: null }
    case 'omitted':
      return { tag: t('storageDestinations.omitted'), said: t('storageDestinations.mediaOmitted'), detail: null }
    case 'missing':
      return { tag: t('sb.stand.tag.missing'), said: outcome.why, detail: outcome.detail }
    case 'refused':
      // The page's own sentence, then the door's reason as the door wrote it (a server sentence).
      return { tag: t('sb.stand.tag.refused'), said: t('sb.stand.refused', { status: outcome.status, why: outcome.why }), detail: outcome.detail }
    case 'unreachable':
      return { tag: t('sb.stand.tag.noAnswer'), said: t('sb.stand.unreachable', { why: outcome.why }), detail: null }
    case 'undecodable':
      return {
        tag: t('sb.stand.tag.undecodable'),
        said:
          outcome.bytes === null
            ? t('sb.stand.undecodable')
            : outcome.type === null
              ? t('sb.stand.undecodableBytes', { n: outcome.bytes, bytes: count(outcome.bytes) })
              : t('sb.stand.undecodableBytesType', { n: outcome.bytes, bytes: count(outcome.bytes), type: outcome.type }),
        detail: null,
      }
    case 'browser-refused':
      return { tag: t('sb.stand.tag.browserRefused'), said: t('sb.stand.browserRefused', { src: outcome.src }), detail: null }
  }
}
/**
 * What one non-200 answer from `GET /api/file` MEANS, as an outcome.
 *
 * ONE FUNCTION, read by the component and by the tests, so a test cannot pass by agreeing with a
 * second copy of this rule. 404 is the only status that is about the FILE — a record points at it
 * and it is not there. Every other refusal is Mole Office declining to read it, and the two are drawn
 * differently because a stale pointer is fixed by editing the record and a refusal is not.
 */
export function previewRefusal(status: number, body: string): PreviewFailure {
  try { if (status === 404 && JSON.parse(body).code === 'storageMediaOmitted') return { phase: 'omitted' } } catch { /* Other replies keep their original failure. */ }
  const full = readPreviewError(status, body)
  // THE SHORT ONE IF THE DOOR WROTE ONE, and the long one behind it. `reason` is what every refusal
  // in this product carries for a box on a screen; where there is none, the whole message is
  // already one sentence and there is nothing to fold away.
  const short = readPreviewReason(body)
  const why = short ?? full
  const detail = short === null ? null : full
  return status === 404 ? { phase: 'missing', why, detail } : { phase: 'refused', status, why, detail }
}

/**
 * THE DOOR'S SHORT SENTENCE FOR THE SCREEN, or null because it sent none.
 *
 * `reason` is written by the door beside `error`, from the same facts, and lib/records.ts says why
 * the door writes it rather than the page working one out. A body that is not JSON, or that carries
 * no `reason`, answers null — which is what "there is no short one" is, and is different from an
 * empty sentence.
 */
export function readPreviewReason(body: string): string | null {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  const said = (parsed as { reason?: unknown } | null)?.reason
  return typeof said === 'string' && said.trim() !== '' ? said : null
}

/** The server's refusal, in the server's own words, or an honest account of why there are none. */
export function readPreviewError(status: number, body: string): string {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(body)
  } catch {
    return body.trim() === ''
      ? t('sb.httpEmptyBody', { status })
      : t('sb.httpNotJson', { status, body: body.slice(0, 300) })
  }
  const message = (parsed as { error?: unknown } | null)?.error
  return typeof message === 'string' && message.trim() !== ''
    ? message
    : t('sb.httpNoMessage', { status })
}

/**
 * The picture, or the reason there is not one.
 *
 * PURE. It renders an `<img>` for exactly one outcome — `shown`, which only a real response can
 * produce — and the honest grey box for every other. There is no branch here that can draw a
 * placeholder graphic, because there is no graphic in this file to draw.
 */
export function ImagePreview({ block, outcome, onFailed }: {
  block: ImageBlock
  outcome: PreviewOutcome
  onFailed?: () => void
}) {
  if (outcome.phase === 'shown') {
    // A VIDEO IS PLAYED AND A PICTURE IS DRAWN, criterion M54: picture or video, it is
    // transferred and shown. The bytes came
    // through the same door either way; what decides is what the door said they ARE, which is the
    // response's own content type. Guessing from the file's name would be a second answer to that
    // question, free to disagree with the door.
    //
    // WHY `<video>` RATHER THAN AN `<img>` THAT FAILS: an `<img>` given a video draws the broken
    // frame, which reads as "the file is missing" for a file that arrived whole.
    if (isAVideo(outcome.type)) {
      return (
        <>
          <video src={outcome.src} controls preload="metadata" aria-label={block.alt} />
          {outcome.saveAt === undefined ? null : (
            <a className="sb-video-save" href={outcome.saveAt} download>
              {t('sb.saveWholeVideo')}
            </a>
          )}
        </>
      )
    }
    return (
      <img
        src={outcome.src}
        alt={block.alt}
        loading="lazy"
        {...(onFailed === undefined ? {} : { onError: onFailed })}
      />
    )
  }
  const stand = previewStand(outcome)
  return (
    <div className="sb-image-stand" data-preview={outcome.phase}>
      <span className="sb-image-tag">{stand.tag}</span>
      <p>{stand.said}</p>
      {stand.detail === null ? null : (
        <details className="sb-image-more">
          <summary>{t('sb.stand.why')}</summary>
          <p>{stand.detail}</p>
        </details>
      )}
      {/* The alt text is the only description of the picture for anyone who cannot see it, and
          here nobody can see it, so it is shown rather than hidden in an attribute. */}
      {block.alt ? <p className="sb-image-alt">{block.alt}</p> : null}
    </div>
  )
}

/**
 * Ask for one picture's bytes and hand the answer to `ImagePreview`.
 *
 * A BLOB URL, NOT A SECOND REQUEST. The `<img>` is pointed at the bytes this component already
 * holds rather than at `/api/file` again. Two requests would be two answers — the endpoint
 * re-checks the reference set, the roots and the filesystem on every call, deliberately — and the
 * picture on screen has to be the one whose refusal or success this page reported.
 *
 * A PATH THE BROWSER CAN LOAD ITSELF IS LEFT TO THE BROWSER. An `http(s)://`, `data:` or `./`
 * source is a web address, not a path on this machine, and `/api/file` would refuse it for the
 * honest but useless reason that it is not absolute. Those go straight into the `<img>`, and a
 * failure there says plainly that Mole Office did not fetch it and cannot say why it failed.
 */
/**
 * ASK FOR ONE PICTURE'S BYTES AND HAND BACK WHAT CAME OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A HOOK AND NOT THE INSIDE OF `ImageFigure`
 * ---------------------------------------------------------------------------------------
 *
 * Two things draw a stored picture now: a report's image block, below, and a picture inside a chat
 * message (criterion M64). Everything careful about getting the bytes is the same for both — the
 * blob url rather than a second request, the headers, which origin the request goes to, counting
 * the request so nothing photographs an empty frame, and telling a refusal apart from a server that
 * never answered. A second copy of that in the chat would be this repository's own named defect:
 * one fact worked out in two places, with the older copy on somebody's screen.
 *
 * ---------------------------------------------------------------------------------------
 * `wanted` IS WHAT MAKES "SHOWN ON A PRESS" REAL RATHER THAN COSMETIC
 * ---------------------------------------------------------------------------------------
 *
 * A reader who has asked for a picture to appear only when pressed has asked for the bytes not to
 * be fetched. So `wanted: false` asks for nothing and stays at `not-asked`, and nothing is
 * requested until it turns true. Fetching every picture and then hiding it would be a setting that
 * changes what is drawn and not what is done, which is not what was asked for.
 */
export function usePictureBytes(
  path: string,
  wanted = true,
  inProject?: string,
  /** File blocks read the type without loading the body. The player requests its own bytes. */
  headersOnly = false,
  /** Ask for cacheable metadata without loading the file. */
  cacheMetadata = false,
  record?: string,
  /**
   * A REPORT'S TYPE READ FOR A FILE OVER THE PAGE CAP. The plain HEAD is refused 413, and with it
   * the type the report needs to know which drawing the block gets. A HEAD asked as a save is the
   * door's existing no-cap answer: the type and no bytes. It is a HEAD, so no file is saved.
   */
  askAsSave = false,
): { outcome: PreviewOutcome; direct: boolean; itWouldNotDraw: () => void } {
  const direct = isBrowserLoadable(path)
  const [outcome, setOutcome] = useState<PreviewOutcome>(
    direct && wanted ? { phase: 'shown', src: path.trim(), type: null, bytes: null } : { phase: 'not-asked' },
  )

  // A PATH THE BROWSER LOADS ITSELF STILL WAITS TO BE WANTED. Its outcome is worked out without a
  // request at all, so it is set here rather than in the fetching effect below.
  useEffect(() => {
    if (!direct) return
    setOutcome(wanted ? { phase: 'shown', src: path.trim(), type: null, bytes: null } : { phase: 'not-asked' })
  }, [direct, wanted, path])

  useEffect(() => {
    if (direct) return
    if (!wanted) {
      setOutcome({ phase: 'not-asked' })
      return
    }
    let live = true
    let objectUrl: string | null = null
    setOutcome({ phase: 'asking' })

    // AND THIS ONE IS COUNTED TOO. It is the one request in the app that does not go through the
    // transport in api.ts, because it reads bytes rather than JSON, and a photograph taken before
    // a picture arrived would show the empty frame. See src/web/lib/ready.ts.
    aRequestStarted(`preview ${path}`)
    void (async () => {
      try {
        // THE BROWSER KEEPS WHAT THE DOOR SAYS IT MAY KEEP, and asks again when the door says so.
        // No cache mode is set here, so the door's answer is the one rule.
        // THE HEADERS EVERY REQUEST IN THIS APP CARRIES, from the one place that builds them.
        // This fetch is by hand because it reads bytes rather than JSON, which is precisely the
        // shape of request that gets left behind: it sent no identity and no project at all.
        // What a preview is allowed to read is decided from the records that point at the file,
        // and which records those are is a per-project question.
        // WHERE THIS PAGE'S REQUESTS GO, the same function the one transport uses: a preview read
        // from the page's own origin while the page is visiting another world would be a file from
        // the wrong world, drawn beside that world's records.
        // AND WHICH PROJECT TO ASK ABOUT, when the caller has named one. A preview is served on the
        // authority of a record in the project being asked about, and a caller that already knows
        // which project holds the record naming this file says so. `moleOfficeHeaders` keeps a
        // project a caller has named; the decision desk is the other caller that does this, and the
        // argument is written there. Here it is criterion M64: the chat is the person's in every
        // project, so a message from another one is drawn beside this one's — and its picture must
        // be asked for where its message lives, not where the reader happens to be standing.
        const headers = moleOfficeHeaders(
          inProject === undefined ? {} : { headers: { 'x-mole-office-workspace': inProject } },
        )
        const stop = new AbortController()
        const isHead = headersOnly && !cacheMetadata
        const asked = cacheMetadata && headersOnly ? `${previewUrl(path, record)}&metadata=1` : previewUrl(path, record)
        const typeAsked = askAsSave && isHead ? `${asked}&download=1` : asked
        const res = await fetch(whereRequestsGo(typeAsked), {
          method: isHead ? 'HEAD' : 'GET', headers, signal: stop.signal, credentials: 'include',
        })
        if (!live) return
        if (!res.ok) {
          // A HEAD'S REFUSAL CARRIES NO BODY, so it cannot say why. Before 30 September 2026 a refused
          // player drew "the server did not say why" (problem Od74zEnc5kU9). The door refuses a GET
          // exactly as it refused the HEAD, so a GET is asked for the door's sentence. If that GET is
          // answered with the file instead, it is stopped unread and the HEAD's refusal is drawn.
          let status = res.status
          let body = isHead ? '' : await res.text()
          if (isHead && !askAsSave) {
            const again = await fetch(whereRequestsGo(asked), {
              method: 'GET', cache: 'no-store', headers, signal: stop.signal, credentials: 'include',
            })
            if (again.ok) stop.abort()
            else [status, body] = [again.status, await again.text()]
          }
          const refusal = previewRefusal(status, body)
          if (!live) return
          setOutcome(refusal)
          return
        }
        const facts = cacheMetadata && headersOnly ? await res.json() as { type: string; size: number } : null
        if (!live) return
        const type = facts?.type ?? res.headers.get('content-type')
        // A VIDEO IS PLAYED FROM THE DOOR, NOT FROM A COPY OF IT IN THIS PAGE, as the owner's message
        // says. Reading it whole into a blob meant a long recording arrived in
        // full before its first frame, and the door refused one over 25 MB outright. The door has
        // said what these bytes are, so the player is handed the address to ask for one stretch at a
        // time, beside a link that saves it whole.
        // A file block needs the type before choosing a player, without downloading an archive or recording.
        if (headersOnly || isAVideo(type)) {
          stop.abort()
          // THE PROJECT THIS REQUEST WAS ASKED IN goes into the address, by the rule its headers were set by
          // (whereALinkFetches), never read back off the headers: tests/a-page-on-another-origin.test.ts holds every
          // header the page reads to one a page on another origin could read, and a scan of the source cannot tell a
          // request's headers from a reply's.
          // A REPLY THAT DOES NOT SAY ITS LENGTH HAS AN UNKNOWN ONE, not a length of 0 (the inspector's note on the
          // video's release): Number(null) is 0, which is a safe integer.
          const said = facts === null ? res.headers.get('content-length') : String(facts.size)
          const length = said === null ? Number.NaN : Number(said)
          setOutcome({
            phase: 'shown',
            src: whereALinkFetches(path, false, inProject, record),
            type,
            bytes: Number.isSafeInteger(length) ? length : null,
            saveAt: whereALinkFetches(path, true, inProject, record),
          })
          return
        }
        const blob = await res.blob()
        if (!live) return
        objectUrl = URL.createObjectURL(blob)
        setOutcome({ phase: 'shown', src: objectUrl, type, bytes: blob.size })
      } catch (err) {
        if (!live) return
        // The server being down, or the request never leaving. NOT a refusal: nothing considered
        // this request, so nothing has been said about the file at all.
        setOutcome({ phase: 'unreachable', why: err instanceof Error ? err.message : String(err) })
      } finally {
        aRequestSettled(`preview ${path}`)
      }
    })()

    return () => {
      live = false
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [path, direct, wanted, inProject, headersOnly, cacheMetadata, record])

  return {
    outcome,
    direct,
    itWouldNotDraw: () =>
      setOutcome((prev) =>
        // Bytes THIS page fetched, which then would not draw, is a different fact from a web address
        // the browser was left to load on its own and failed at: in the first case the file is known
        // to exist and to be readable, in the second nothing is known.
        direct || prev.phase !== 'shown'
          ? { phase: 'browser-refused', src: path.trim() }
          : { phase: 'undecodable', type: prev.type, bytes: prev.bytes },
      ),
  }
}

/** The person's media preference and whether they have pressed to load this figure. */
function useMediaChoice() {
  /**
   * THIS IS THE ONE PLACE THE PERSON'S MEDIA-LOAD CHOICE IS APPLIED. Criterion U5.
   *
   * `usePictureBytes` takes `wanted`, and `false` means it requests nothing at all rather than
   * fetching and hiding: a person who asked for media never to load has asked for the bytes not to
   * be fetched. That machinery already exists for the chat; what is new is that a person's own
   * choice, read from their registry row, is what decides it here.
   *
   * NOTHING LOADS UNTIL THE ROW HAS BEEN READ, and that is not caution. The choice arrives with the
   * registry read, and if a figure fetched while that was still on its way, a person who chose
   * `never` would have their picture fetched once during the gap. So `wanted` is false until the
   * row has been read, and the figure says so honestly instead of guessing.
   */
  const mediaLoad = useMediaLoad()
  const rowWasRead = useMediaLoadWasRead()
  // WHAT IS IN FORCE once the row has been read: the word on the row, or the default because the
  // row was read and holds no choice. The two are kept apart by `rowWasRead`.
  const inForce: MediaLoadChoice = mediaLoad ?? MEDIA_LOAD_BY_DEFAULT
  const [pressed, setPressed] = useState(false)
  const wanted = rowWasRead && (inForce === 'with-page' || (inForce === 'on-press' && pressed))
  return { inForce, rowWasRead, wanted, onPress: () => setPressed(true) }
}

function ImageFigure({
  block,
  index,
  keyPrefix,
  place,
  mark,
}: {
  block: ImageBlock
  index: number
  keyPrefix: string
  place: Place | null
  /** Which track this block takes and how much width it needs, worked out once by `Block`. */
  mark: BlockMark
}) {
  const { inForce, rowWasRead, wanted, onPress } = useMediaChoice()
  // THE REGION TREE OF THE REPORT THIS PICTURE IS IN: the caption under a
  // picture is a region and drew no target until 30 August 2026. `Block` reads the same context for
  // the same purpose; this component is drawn by `Block` and is not handed it.
  // The region context also names the record whose picture this is.
  const marks = useContext(RegionsHere)
  const { outcome, direct, itWouldNotDraw } = usePictureBytes(block.path, wanted, undefined, false, false, marks?.recordId)

  const caption = fieldIn(place, 'caption', block.caption)
  // THE FILE'S PATH ON THIS MACHINE IS FOR A DEVELOPER (wave 13s round 12): a person reading a report
  // gets nothing from /home/…/report-files/BV8jPVSFAJDM.png. Developer mode draws it, as it draws a
  // lead's address (problem 30fVQwjGa3Qb). A WEB ADDRESS IS STILL DRAWN FOR A PERSON: it is somewhere
  // the person can go, and criterion U5 names it where the person's choice holds the picture back.
  const developer = useInspect()
  const pathLine = developer || /^https?:\/\//.test(block.path.trim())
  return (
    // A PICTURE IS CALLED BY WHAT IT SHOWS. The talk box names what it is opened about from the words
    // the thing states, and with the path gone from a person's view the only words left were the
    // mark's "Show this picture large". The alt text is the picture's own description.
    <figure className="sb-block sb-image" {...mark} {...nameAttributes(block.alt)}>
      {wanted && outcome.phase === 'shown' && !isAVideo(outcome.type) ? (
        // A PRESS ON THE PICTURE SHOWS IT LARGE (problem T3yQblhc2A28). See PictureLarge.tsx.
        <OpensLarge src={outcome.src} alt={block.alt}>
          <ImagePreview block={block} outcome={outcome} onFailed={itWouldNotDraw} />
        </OpensLarge>
      ) : wanted ? (
        <ImagePreview block={block} outcome={outcome} onFailed={itWouldNotDraw} />
      ) : (
        <MediaNotLoaded
          block={block}
          choice={inForce}
          rowWasRead={rowWasRead}
          onPress={onPress}
        />
      )}
      {/* A PICTURE IS SAVED FROM THE DOOR, AS A VIDEO IS (problem YnVxZz0Md_G4): the picture on screen is a
          copy in this page, and saving that copy gives a file named after nothing. A picture at a web
          address is the browser's own to save, so it gets no link. */}
      {wanted && outcome.phase === 'shown' && !isAVideo(outcome.type) && !direct ? (
        <a className="sb-picture-save" href={whereALinkFetches(block.path, true, undefined, marks?.recordId)} download>
          {t('sb.picture.save')}
        </a>
      ) : null}
      {pathLine ? <PathLine path={block.path} id={`img-${keyPrefix}-${String(index)}`} machine={block.machine} /> : null}
      {block.caption ? (
        <figcaption {...WRITING} {...captionRegionMark(marks, place)}>
          {renderInline(block.caption, `${keyPrefix}c`, wholeOf(caption, block.caption))}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * WHAT A REPORT DRAWS WHERE THE PERSON'S CHOICE MEANS A PICTURE OR VIDEO IS NOT LOADED. Criterion U5.
 *
 * IT SHOWS WHAT THE PAGE CAN HONESTLY SAY WITHOUT THE BYTES: the picture or file's name, its stored
 * size when it has one, and — for `on-press` — the one press that loads it. It is not drawn to look like
 * a broken picture: it is a state a reader can act on, and it says which state it is.
 *
 * An image block carries no size, so the line says the size is not known until it is loaded.
 * A file block carries the size the store measured, which can be shown before loading it.
 *
 * `rowWasRead` IS WHAT STOPS A GUESS. Before the registry row has been read, neither which choice is
 * in force nor that it is `on-press` is known, so the figure says only that nothing has been fetched
 * and offers no press. Once the row is read, the press is drawn for `on-press` and never for
 * `never`, which has no way to turn loading on.
 */
function MediaNotLoaded({
  block,
  choice,
  rowWasRead,
  onPress,
}: {
  block: Pick<ImageBlock, 'alt'> & { size?: number }
  choice: MediaLoadChoice
  rowWasRead: boolean
  onPress: () => void
}) {
  return (
    <div
      className="sb-image-stand sb-image-held"
      data-preview="held"
      data-media-load={rowWasRead ? choice : 'not-read'}
    >
      <span className="sb-image-tag">{rowWasRead ? t('sb.stand.tag.notLoaded') : t('sb.stand.tag.notFetched')}</span>
      {/*
        WHILE THE ROW IS STILL ON ITS WAY THIS SAYS NOTHING, and that is the answer rather than a
        gap in the drawing. The tag above already reads "not fetched", which is the whole of what is
        true in that moment, and the moment is one round trip long. A sentence explaining it would
        be the contract's own failed fix — solving a confusing screen by adding an instruction. Once the row has been read the line
        says which choice is in force, which is what criterion U5 asks for in those words.
      */}
      {rowWasRead ? <p className="sb-image-held-said">{mediaLoadSays(choice)}</p> : null}
      <p className="sb-image-size">{block.size === undefined ? MEDIA_LOAD_SIZE_NOT_KNOWN : sizeSaid(block.size)}</p>
      {/* THE NAME. `alt` is required on an image block, so this is the only description that exists,
          and a reader deciding whether to press has to be told what they are pressing for. */}
      {block.alt ? <p className="sb-image-alt">{block.alt}</p> : null}
      {rowWasRead && choice === 'on-press' ? (
        <button type="button" className="sb-image-press" onClick={onPress}>
          {MEDIA_LOAD_PRESS}
        </button>
      ) : null}
    </div>
  )
}

/**
 * A PATH BLOCK WHOSE KIND IS VIDEO PLAYS IT, on the player a `video` block uses. Problem Od74zEnc5kU9.
 *
 * Reports carry demo videos this way, and until 30 September 2026 the block drew only its label, kind
 * and path. The bytes come from the file door as every report video's do: it serves a path a live
 * record stores under a `path` key, on this machine, inside a preview root. When the door refuses, the
 * refusal is drawn where the player would be, and the path line stays under it.
 *
 * A web address is not asked for. The door serves files on this machine only, and the browser's own
 * answer would carry no type to choose a player by, so the block is drawn as it was.
 *
 * A path block carries no size and no hash, so the name, size and hash a `video` block shows are not
 * drawn; nothing stands in for them. The label is the player's accessible name.
 */
function PathVideo({ block }: { block: PathBlock }) {
  const { inForce, rowWasRead, wanted, onPress } = useMediaChoice()
  const marks = useContext(RegionsHere)
  const { outcome } = usePictureBytes(block.path, wanted, undefined, true, false, marks?.recordId)
  return wanted ? (
    <Player block={{ id: block.id, type: 'video', path: block.path, alt: block.label }} outcome={outcome} />
  ) : (
    <MediaNotLoaded block={{ alt: block.label }} choice={inForce} rowWasRead={rowWasRead} onPress={onPress} />
  )
}

/** The path itself, selectable and copyable, because that is what you came for. */
function PathLine({ path, id, machine }: { path: string; id: string; machine?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = () => {
    const done = (next: 'copied' | 'failed') => {
      setState(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2000)
    }
    // navigator.clipboard is undefined on a page served over plain http from another host.
    // Saying so out loud beats a button that appears to do nothing.
    if (!navigator.clipboard) {
      done('failed')
      return
    }
    navigator.clipboard.writeText(path).then(
      () => done('copied'),
      () => done('failed'),
    )
  }

  return (
    <div className="sb-path">
      <code id={id}>{path}</code>
      {machine ? <span className="sb-path-machine">{t('sb.path.onMachine', { machine })}</span> : null}
      <button type="button" className="sb-copy" onClick={copy} aria-describedby={id}>
        {state === 'copied' ? `✓ ${t('sb.path.copied')}` : state === 'failed' ? `✕ ${t('sb.path.copyBlocked')}` : t('sb.path.copyPath')}
      </button>
      {state === 'failed' ? (
        <span className="sb-copy-note" role="status">
          {t('sb.path.clipboardRefused')}
        </span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------- file block

/**
 * A FILE A REPORT CARRIES, DRAWN AS A FILE AND NOT CUT INTO PROSE, by criterion R3 and a
 * decision.
 *
 * ---------------------------------------------------------------------------------------
 * ONE DRAWING, AND THE MEDIA CHOICE DOES NOT CHANGE IT
 * ---------------------------------------------------------------------------------------
 *
 * A file block that is neither a picture nor a video is drawn by `FileToFetch`: its name, its size,
 * and the press that opens it and the press that saves it. A source file such as a .md or a .json
 * does not have its text copied into the report, whatever the viewer's media choice is, and the
 * presses lead to the whole file.
 *
 * A HEAD request reads the door's content type without fetching the bytes. The type decides whether
 * to show a player, and the same type decides whether to show a small picture beside the name.
 *
 * ---------------------------------------------------------------------------------------
 * THE NAME AND THE SIZE ARE THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * The name, the size in bytes, and the short sha256 the store worked out for a developer, are the
 * whole point of carrying a file as a block, by a decision and criterion R3: a reader can see what
 * the page names and how big it is, and can tell the file the report names from another one with a
 * different body.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING OF THE FILE IS COPIED, SO NOTHING IS CUT
 * ---------------------------------------------------------------------------------------
 *
 * The page holds the file's name, its size and the way to it, and the whole of the file is behind
 * the presses. Nothing of the file's body is drawn, so no drawing of it can be cut short; the file
 * door still refuses a file larger than its own cap rather than serving a piece of it.
 */
export function FileFigure({
  block,
  keyPrefix,
  place,
  mark,
}: {
  block: FileBlock
  keyPrefix: string
  place: Place | null
  mark: BlockMark
}) {
  const marks = useContext(RegionsHere)
  const caption = fieldIn(place, 'caption', block.caption)
  const { inForce, rowWasRead, wanted, onPress } = useMediaChoice()
  const readType = rowWasRead && inForce !== 'never'
  // OVER THE PAGE CAP THE TYPE IS READ WITH A HEAD ASKED AS A SAVE: the plain HEAD is refused,
  // and a report block with no type has no press at all. Still a HEAD, so no byte of the file comes.
  const overCap = block.size > MAX_PREVIEW_BYTES
  const { outcome } = usePictureBytes(block.path, readType, undefined, true, false, marks?.recordId, overCap)
  const video = readType && outcome.phase === 'shown' && isAVideo(outcome.type)
  // A FILE THE DOOR SERVES AS A PICTURE shows a small one beside its name (problem T3yQblhc2A28). The
  // door's own type decides, as it does for a video. Its bytes are asked for only when the person's
  // media choice lets the page load them.
  const picture = wanted && outcome.phase === 'shown' && isAPictureFile(outcome.type)
  // AN HTML FILE OR A PDF IS DRAWN IN A FRAME OF ITS OWN ON ONE PRESS, under the recorded engineering
  // decisions that a stricter header can undo. The type is read the same way a video's is, and the
  // frame is not created until the reader asks for it.
  const inPage = readType && outcome.phase === 'shown' ? theKindOfShownFile(outcome.type) : null
  // THE PATH AND THE HASH ARE FOR A DEVELOPER; a person sees the file's name and size. See ImageFigure.
  const developer = useInspect()
  const small = usePictureBytes(block.path, picture, undefined, false, false, marks?.recordId)
  return (
    <figure className="sb-block sb-file" {...mark}>
      {picture ? (
        <div className="sb-file-beside">
          <div className="sb-file-preview sb-image">
            {small.outcome.phase === 'shown' ? (
              <OpensLarge src={small.outcome.src} alt={block.name}>
                <ImagePreview block={{ ...block, type: 'image', alt: block.name }} outcome={small.outcome} onFailed={small.itWouldNotDraw} />
              </OpensLarge>
            ) : (
              <ImagePreview block={{ ...block, type: 'image', alt: block.name }} outcome={small.outcome} onFailed={small.itWouldNotDraw} />
            )}
          </div>
          <FileToFetch block={block} developer={developer} record={marks?.recordId} />
        </div>
      ) : outcome.phase === 'omitted' ? (
        // A FILE A BACKUP LEFT OUT is told by the same read of the type, so a reader who chose never is asked nothing.
        <ImagePreview block={{ id: block.id, type: 'image', path: block.path, alt: block.name }} outcome={outcome} />
      ) : inPage !== null ? (
        <FileShownHere block={block} kind={inPage} developer={developer} record={marks?.recordId} />
      ) : (
        <FileToFetch block={block} developer={developer} record={marks?.recordId} />
      )}
      {video ? (
        wanted ? <ImagePreview block={{ ...block, type: 'image', alt: block.name }} outcome={outcome} /> : (
          <MediaNotLoaded block={{ alt: block.name, size: block.size }} choice={inForce}
            rowWasRead={rowWasRead} onPress={onPress} />
        )
      ) : null}
      {block.caption ? (
        <figcaption {...WRITING} {...captionRegionMark(marks, place)}>
          {renderInline(block.caption, `${keyPrefix}c`, wholeOf(caption, block.caption))}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * THE FILE'S OWN FACTS — its name, its size, and the short sha256 a developer sees — in one drawing
 * used wherever a file block's facts are shown.
 *
 * EXPORTED so a test can assert the same facts are readable without a server and without a browser.
 */
export function FileFacts({ block, developer = false }: { block: FileBlock; developer?: boolean }) {
  return (
    <dl className="sb-file-facts">
      <div>
        <dt>{t('sb.fileFacts.name')}</dt>
        <dd className="sb-file-name">{block.name}</dd>
      </div>
      <div>
        <dt>{t('sb.fileFacts.size')}</dt>
        <dd className="sb-file-size">{sizeSaid(block.size)}</dd>
      </div>
      {developer ? (
        <div>
          <dt>{t('sb.fileFacts.hash')}</dt>
          <dd>
            <code className="sb-file-hash">{block.hash}</code>
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

/**
 * A FILE DRAWN AS A THING TO FETCH BY ITS ADDRESS, by criterion R3 and a
 * decision.
 *
 * The address is a press that opens the file door on this path, and the path itself is shown and
 * selectable, as a `path` block already shows one. Nothing here fetches or draws the bytes. The page
 * carries the file's name, its size and the way to the whole file, and a source file's text is never
 * copied into the report.
 *
 * THIS IS THE DRAWING FOR EVERY FILE THAT IS NEITHER A PICTURE NOR A VIDEO, whatever its name says
 * and whatever the viewer's media choice is.
 */
export function FileToFetch({ block, developer = false, record }: { block: FileBlock; developer?: boolean; record?: string }) {
  return (
    <div className="sb-file-fetch">
      <FileFacts block={block} developer={developer} />
      <p className="sb-file-address">
        <a className="sb-file-open" href={whereALinkFetches(block.path, false, undefined, record)} target="_blank" rel="noreferrer">
          {t('sb.file.open')}
        </a>
        {/* SAVED WHOLE, OF ANY SIZE (problem YnVxZz0Md_G4). Opening a file over the preview limit is
            refused, and an archive or a slide deck is something to take away rather than to look at. */}
        <a className="sb-file-save" href={whereALinkFetches(block.path, true, undefined, record)} download>
          {t('sb.file.save')}
        </a>
        {developer ? <code className="sb-file-path">{block.path}</code> : null}
      </p>
    </div>
  )
}

/**
 * THE PDF VIEWER'S OWN REQUEST TO FIT THE PAGE TO THE FRAME'S WIDTH.
 *
 * Chromium reads `view=FitH` from the fragment when it opens a PDF, and draws the page at the width
 * of the page area. The fragment that reads like the same request, `zoom=page-width`, is ignored:
 * measured in full Chromium on 18 November 2026, at 1440 the document opened at 100 per cent with
 * `zoom=page-width` and at 138 per cent with `view=FitH`, and the same was true inside the report's
 * frame and under the PDF door's `default-src 'none'; sandbox` policy. Firefox and Safari have their
 * own readers and nobody in this office has looked at this frame in either of them.
 *
 * The reader opens its thumbnail panel beside the page, and `view=FitH` fits the page to what is
 * left after the panel, not to the frame. `navpanes=0` asks for the panel closed, so the page area
 * is the whole frame; the viewer keeps its toolbar and its other controls. Measured in full
 * Chromium and in an Electron BrowserWindow on 18 November 2026: with the panel open the page was
 * 73 per cent of the frame at 1440 and 67 per cent at 990, and with this fragment it was 97 to 98
 * per cent at 1440, 990, 660 and 390.
 *
 * This is the viewer's grammar, not a word the office shows, so it is not in the word list.
 */
export const THE_PDF_FIT_WIDTH_VIEW = '#view=FitH&navpanes=0'

/**
 * AN HTML FILE OR A PDF DRAWN INSIDE THE REPORT ON ONE PRESS, under the recorded engineering
 * decisions that a stricter header can undo.
 *
 * Until the press, the drawing is the file's own facts and the press to save it. One press inserts
 * the frame: the file door's open=1&shown=1 answer, under the policy that holds that kind of file.
 *
 * AN HTML FILE'S frame sandbox is exactly allow-scripts. Its reply allows its own inline script and
 * style and nothing else, so the file's drawing runs and nothing it does can reach the office.
 *
 * A PDF'S FRAME HAS NO SANDBOX ATTRIBUTE. Chromium's PDF reader refuses to draw in a sandboxed
 * frame; the reply's `default-src 'none'; sandbox` is what holds the document, and the frame is
 * still only created by the press.
 *
 * A WORD DOCUMENT'S AND A TEXT FILE'S FRAME HAS AN EMPTY SANDBOX: no script, no form, no navigation
 * and no same-origin reading, even though the reply carries the generated page policy as well. The
 * page is all the file's own words, escaped before it reaches the browser.
 *
 * The press is the only way the file's bytes are fetched for drawing. Reading the type with a HEAD
 * is not reading the file's contents, and the page does that before the press to know which drawing
 * a file block gets.
 */
export function FileShownHere({ block, kind, developer = false, record }: {
  block: FileBlock
  kind: FileShownKind
  developer?: boolean
  record?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="sb-file-fetch">
      <FileFacts block={block} developer={developer} />
      <p className="sb-file-address">
        {shown ? null : (
          <button type="button" className="sb-file-show" onClick={() => setShown(true)}>
            {t('sb.file.show')}
          </button>
        )}
        <a className="sb-file-save" href={whereALinkFetches(block.path, true, undefined, record)} download>
          {t('sb.file.save')}
        </a>
        {developer ? <code className="sb-file-path">{block.path}</code> : null}
      </p>
      {shown ? (
        <iframe
          className="sb-file-frame"
          // HTML: THE ONLY PERMISSION THE FRAME HAS. No allow-same-origin, so it can never be this
          // page; no forms, pop-ups or top navigation. The reply's policy is the rest of the promise.
          // PDF: NO SANDBOX ATTRIBUTE AT ALL, because Chromium's reader will not draw in one; the
          // reply's own policy is the promise there. WORD AND TEXT: THE EMPTY SANDBOX, the strictest
          // a frame has, and the reply's generated page policy beside it.
          sandbox={kind === 'html' ? 'allow-scripts' : kind === 'pdf' ? undefined : ''}
          title={t('sb.file.frame', { name: block.name })}
          // THE PDF ASKS FOR THE VIEWER'S FIT-WIDTH VIEW, because its own default is 100 per cent
          // and that is wider than a telephone's frame. The other kinds have no such fragment, and
          // an HTML page or a generated word page that received one would only gain a dead hash.
          src={`${whereALinkFetches(block.path, false, undefined, record)}&open=1&shown=1${
            kind === 'pdf' ? THE_PDF_FIT_WIDTH_VIEW : ''
          }`}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------- table block

type TableCell = string | number

interface NormTable {
  headers: string[]
  align: Array<'left' | 'right'>
  rows: Array<{ cells: TableCell[]; state?: ItemState }>
  anyState: boolean
}

/**
 * Read a table into the one shape the drawing works from, or say what is wrong with it.
 *
 * PURE AND EXPORTED, and it is the one place a table becomes a table. A `table` block goes through
 * it and so does a table somebody typed into their prose with pipes, so the two draw as one thing
 * rather than as two things that resemble each other.
 */
export function normalizeTable(block: TableBlock): { ok: true; table: NormTable } | { ok: false; reason: string } {
  const columns = block.columns
  if (!Array.isArray(columns) || columns.length === 0) return { ok: false, reason: 'it has no `columns`' }
  const headers = columns.map((c) => c.label)

  if (!Array.isArray(block.rows)) return { ok: false, reason: '`rows` is not an array' }
  const rows = block.rows.map((r) => ({ cells: r.cells, ...(r.state ? { state: r.state } : {}) }))

  // A row that is one cell short renders as a table with a hole in it, which reads as missing
  // data rather than as a malformed write.
  const ragged = rows.map((r, i) => (r.cells.length === headers.length ? -1 : i)).filter((i) => i >= 0)
  if (ragged.length > 0) {
    return {
      ok: false,
      reason:
        `row${ragged.length === 1 ? '' : 's'} ${ragged.slice(0, 5).join(', ')}` +
        `${ragged.length > 5 ? ', …' : ''} ${ragged.length === 1 ? 'does' : 'do'} not have ` +
        `${headers.length} cells to match the columns`,
    }
  }

  // Right-align a column only when every cell in it is a number: measurements line up on the
  // decimal point, names do not get dragged to the right. A column that says which way it wants to
  // go gets what it asked for.
  const align = headers.map((_, c): 'left' | 'right' => {
    const declared = columns[c]?.align
    if (declared) return declared
    return isNumericColumn(rows, c) ? 'right' : 'left'
  })

  return { ok: true, table: { headers, align, rows, anyState: rows.some((r) => r.state !== undefined) } }
}

/** Whether every cell in one column is a number. Empty cells count as not a number. */
function isNumericColumn(rows: readonly { cells: TableCell[] }[], c: number): boolean {
  return (
    rows.length > 0 &&
    rows.every((r) => {
      const cell = r.cells[c]
      return cell !== undefined && cell !== '' && Number.isFinite(Number(cell))
    })
  )
}

/**
 * WHAT A TABLE'S HEADERS, ROWS AND CELLS SAY ABOUT THEMSELVES.
 *
 * Two things are being said and they are different. A cell's TEXT attributes say which stored string
 * the words are in and where, so a person can quote three words out of one cell. A row's and a
 * cell's TARGET attributes say "this is row 2, column 3 of this table", which is what makes
 * `tableRow` and `tableCell` real things a comment can point at rather than declared ones.
 *
 * `row` and `cell` are always asked about the STORED position, counted from 0 here and written into
 * the target counted from 1. Sorting the table on screen does not renumber anything: row 2 is the
 * second row as stored, wherever it currently sits, because that is what the server will look up.
 */
interface TableAddress {
  /** What this row IS. Nothing when the table is not a stored block. */
  row: (row: number) => Record<string, string>
  /** What this cell IS. */
  cell: (row: number, column: number) => Record<string, string>
  /** Where a heading's words are stored, for the run of text inside the heading. */
  headWords: (column: number) => TextOrigin | undefined
  /** Where a cell's words are stored. */
  cellWords: (row: number, column: number) => TextOrigin | undefined
}

/** Nothing is known about where this table is. Used when the blocks are not stored anywhere. */
const NOWHERE: TableAddress = {
  row: () => ({}),
  cell: () => ({}),
  headWords: () => undefined,
  cellWords: () => undefined,
}

/**
 * WHAT PAINTS THE WORDS OF A TABLE TYPED INTO A MESSAGE, or null, which leaves them as they are drawn.
 *
 * A table is drawn by a component, so its cells are drawn after the walk over the message has
 * finished, and that walk cannot reach them. The chat puts its painter here instead, and the table
 * hands it each heading's words, each cell's words and the code of a table it could not read.
 */
export const PaintTheWords = createContext<((drawn: ReactNode) => ReactNode) | null>(null)

/** The words of one heading, as a table draws them. */
function headWordsOf(header: string, column: number, keyPrefix: string, address: TableAddress): ReactNode[] {
  return renderInline(header, `${keyPrefix}h${column}`, address.headWords(column))
}

/** The words of one cell, as a table draws them. */
function cellWordsOf(cell: TableCell, row: number, column: number, keyPrefix: string, address: TableAddress): ReactNode[] {
  return renderInline(String(cell), `${keyPrefix}r${row}c${column}`, address.cellWords(row, column))
}

/**
 * A stored `table` block: its columns, rows and cells are all stored objects with paths.
 *
 * THE TARGET AND THE TEXT SIT ON DIFFERENT ELEMENTS, and they have to. A cell is drawn as a `td`
 * holding the cell's markdown as rendered runs, so the `td` holds four characters fewer than the
 * stored cell whenever there is a bold in it. The `td` says WHAT IT IS; the runs inside it say
 * where their own characters are.
 */
function addressOfStoredTable(place: Place | null, block: TableBlock): TableAddress {
  if (place === null) return NOWHERE
  const { path, target, recordId } = place
  const canPoint = target !== null && recordId !== null
  return {
    row: (r) =>
      canPoint
        ? targetAttributes({ kind: 'tableRow', recordId, blockId: target.blockId, rowKey: String(r + 1) })
        : {},
    cell: (r, c) =>
      canPoint
        ? targetAttributes({
            kind: 'tableCell',
            recordId,
            blockId: target.blockId,
            rowKey: String(r + 1),
            columnKey: String(c + 1),
          })
        : {},
    headWords: (c) => {
      const label = block.columns[c]?.label
      return label === undefined ? undefined : wholeOf({ field: `${path}.columns[${String(c)}].label`, stored: label }, label)
    },
    cellWords: (r, c) => {
      const stored = block.rows[r]?.cells[c]
      // ONLY A STRING CELL CAN SAY WHERE ITS WORDS ARE. A number is stored as a number, so there is
      // no stored string holding the characters "15" and an offset into one would be invented.
      return typeof stored === 'string'
        ? wholeOf({ field: `${path}.rows[${String(r)}].cells[${String(c)}]`, stored }, stored)
        : undefined
    },
  }
}

/**
 * THE WORDS A DRAWN CELL ACTUALLY SHOWS, read back off the drawing itself.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * "Find in this table" searched the STORED cell. A cell stored as two asterisks, "Done.", two
 * asterisks, an asterisk, "Where it stands", an asterisk is drawn as "Done. Where it stands", so
 * searching for the sentence a person can read answered "0 of 9 rows" and then said, in plain
 * words, that no row in the table had it. The other way round was worse: the stored spelling with
 * its asterisks matched, and those characters are on nobody's screen. Observed on the owner's own
 * report CnnEp_jlEnAt on 18 August 2026.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS THE DRAWING, IT DOES NOT READ THE MARKDOWN AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * A second reader of what an asterisk means would be the defect CLAUDE.md names as this
 * repository's own: two readings of one fact, free to disagree, with nothing failing when they do.
 * So this takes what `renderInline` BUILT and walks it. Change what a bold word draws and the
 * search follows on its own, because there is only one answer to "what does this draw".
 *
 * WHAT IT CANNOT SEE, SAID RATHER THAN GUESSED AT. A piece drawn by a component — mathematics and
 * a record id are the two — has not been drawn yet at this point, so its letters are not in the tree.
 * Its own source is taken instead: the formula `MathText` is set from, and the id as typed, which is
 * what a record link draws until its name is known. Anything else a component draws contributes
 * nothing rather than a guess at it.
 */
export function wordsDrawnBy(nodes: readonly ReactNode[]): string {
  let out = ''
  const walk = (node: ReactNode): void => {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (typeof node === 'string' || typeof node === 'number') {
      out += String(node)
      return
    }
    if (Array.isArray(node)) {
      for (const one of node) walk(one as ReactNode)
      return
    }
    const element = node as { props?: Record<string, unknown> }
    const props = element.props
    if (props === undefined) return
    // The source a formula is drawn from. Nothing else a component holds is words on a screen.
    if (typeof props['tex'] === 'string') {
      out += props['tex']
      return
    }
    // A record id, as typed. Its name is read later, so the id is what this can say it draws.
    if (typeof props['recordId'] === 'string') {
      out += props['recordId']
      return
    }
    walk((props['children'] ?? null) as ReactNode)
  }
  walk(nodes as ReactNode)
  return out
}

/**
 * ONE ROW OF A TABLE, AS THE WORDS IT PUTS ON THE SCREEN.
 *
 * The find box looks in these. Exported because a test can then state a cell exactly as it is
 * stored and check what a reader would see, which is the half of "Find in this table" that has no
 * DOM to press in this runner.
 */
export function wordsOfCells(cells: readonly TableCell[], keyPrefix: string): string[] {
  return cells.map((cell, c) => wordsDrawnBy(renderInline(String(cell), `${keyPrefix}c${String(c)}`)))
}

/**
 * The one drawing of a table, and everything a person can do to one.
 *
 * SORTING DOES NOT RENUMBER ANYTHING. Every row keeps the position it has in the store and carries
 * it in its own address, so a comment made on the third row after sorting by force is a comment on
 * the row the server will find at that position. Losing that would make a comment point at whatever
 * happened to be under the pointer at the time.
 *
 * THE FIND BOX ONLY APPEARS WHEN THERE IS SOMETHING TO FIND. A box above a four-row table is
 * furniture: it fails the density test, because nobody makes a worse decision without it. The
 * threshold is a number rather than a judgement so that it is the same on every table in the
 * product, and it is small — a table you cannot take in at a glance is one you want to search.
 */
const ROWS_WORTH_SEARCHING = 8

function DataTable({
  table,
  caption,
  captionOrigin,
  captionMark,
  address,
  keyPrefix,
  mark,
}: {
  table: NormTable
  caption?: string
  captionOrigin: Origin | null
  /**
   * WHAT THE CAPTION IS, when it is a stored caption somebody can point at.
   *
   * A markdown table inside a paragraph has none — its caption is not a stored field of its own —
   * and it passes an empty object, which draws no target. The caller works it out because the
   * caller is the one that knows the block's path; a second walk to that path from in here would be
   * the same fact worked out twice.
   */
  captionMark: Record<string, string | number>
  address: TableAddress
  keyPrefix: string
  /** What this table IS, when it is a stored block somebody can point at. */
  mark: BlockMark
}) {
  const { headers, align, rows, anyState } = table
  const paint = useContext(PaintTheWords)
  const painted = (drawn: ReactNode): ReactNode => (paint === null ? drawn : paint(drawn))
  const [sort, setSort] = useState<{ column: number; up: boolean } | null>(null)
  const [find, setFind] = useState('')
  const [widths, setWidths] = useState<Record<number, number>>({})
  const headRefs = useRef<Array<HTMLTableCellElement | null>>([])

  /**
   * Every row with the position it has in the store, and the words it draws.
   *
   * THE WORDS ARE WHAT THE FIND BOX LOOKS IN, and they are the ones on the screen rather than the
   * markdown they were drawn from. See `wordsDrawnBy` for what went wrong and why this reads the
   * drawing rather than reading the asterisks a second time.
   */
  const stored = useMemo(
    () =>
      rows.map((row, at) => ({
        ...row,
        at,
        drawn: wordsOfCells(row.cells, `find${String(at)}`),
      })),
    [rows],
  )

  const shown = useMemo(() => {
    const needle = find.trim().toLowerCase()
    const kept =
      needle === ''
        ? stored
        : stored.filter((row) => row.drawn.some((words) => words.toLowerCase().includes(needle)))
    if (sort === null) return kept
    const numeric = align[sort.column] === 'right'
    const order = [...kept].sort((a, b) => {
      const x = a.cells[sort.column] ?? ''
      const y = b.cells[sort.column] ?? ''
      if (numeric) return Number(x) - Number(y)
      return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })
    })
    return sort.up ? order : order.reverse()
  }, [stored, find, sort, align])

  const press = (column: number) => {
    setSort((was) => (was === null || was.column !== column ? { column, up: true } : was.up ? { column, up: false } : null))
  }

  /**
   * Drag a column edge. The width is taken from the header as it stands, so the first drag starts
   * from where the column already is rather than jumping to a number this file invented.
   */
  const grab = (column: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    const from = event.clientX
    const start = widths[column] ?? headRefs.current[column]?.getBoundingClientRect().width ?? 120
    const move = (e: PointerEvent) => setWidths((w) => ({ ...w, [column]: Math.max(48, start + (e.clientX - from)) }))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const searchable = rows.length >= ROWS_WORTH_SEARCHING
  const findId = `find-${keyPrefix}`

  return (
    <figure className="sb-block sb-table" {...mark}>
      {searchable ? (
        <div className="sb-table-tools">
          <label className="sb-find" htmlFor={findId}>
            <span>{t('sb.table.findInTable')}</span>
            <input
              id={findId}
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder={t('sb.table.anyWord')}
            />
          </label>
          <span className="sb-table-count num" role="status">
            {find.trim() === '' ? t('sb.table.rowCount', { n: rows.length }) : t('sb.table.rowCountOf', { shown: shown.length, total: rows.length })}
          </span>
        </div>
      ) : null}
      <InReach box="sb-scroll" name="Table" shape={`${headers.join("|")}#${String(shown.length)}`}>
        <table>
          {caption ? (
            <caption {...captionMark}>{renderInline(caption, `${keyPrefix}c`, wholeOf(captionOrigin, caption))}</caption>
          ) : null}
          <thead>
            <tr>
              {/* A row state gets its own column rather than only a tint, so the state is
                  readable as a word and not only as a colour. */}
              {anyState ? <th scope="col" className="sb-head-plain">{t('sb.table.state')}</th> : null}
              {headers.map((h, c) => (
                <th
                  key={c}
                  scope="col"
                  ref={(el) => {
                    headRefs.current[c] = el
                  }}
                  style={{ textAlign: align[c], ...(widths[c] === undefined ? {} : { width: widths[c] }) }}
                  aria-sort={sort?.column === c ? (sort.up ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    className="sb-sort"
                    onClick={() => press(c)}
                    title={t('sb.table.sortBy', { column: h })}
                  >
                    <span className={oneShortWord(h) ? 'sb-whole' : undefined}>{painted(headWordsOf(h, c, keyPrefix, address))}</span>
                    {/* Drawn at rest on every sortable column, not on hover: a control nobody can
                        see is a control nobody knows is there. */}
                    <span className="sb-sort-mark" aria-hidden="true" data-dir={sort?.column === c ? (sort.up ? 'up' : 'down') : 'none'}>
                      {sort?.column === c ? (sort.up ? '▲' : '▼') : '⇅'}
                    </span>
                  </button>
                  <span
                    className="sb-grab"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t('sb.table.changeWidthOf', { column: h })}
                    onPointerDown={grab(c)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.at} data-state={row.state} {...address.row(row.at)}>
                {anyState ? <td>{row.state ? <StateChip state={row.state} /> : null}</td> : null}
                {row.cells.map((cell, c) => (
                  <td
                    key={c}
                    className={align[c] === 'right' ? 'sb-num' : oneShortWord(String(cell)) ? 'sb-whole' : undefined}
                    style={{ textAlign: align[c] }}
                    {...address.cell(row.at, c)}
                  >
                    {painted(cellWordsOf(cell, row.at, c, keyPrefix, address))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </InReach>
      {searchable && shown.length === 0 ? (
        <p className="sb-table-none">{t('sb.table.noRowHas', { find: find.trim() })}</p>
      ) : null}
    </figure>
  )
}

function TableFigure({
  block,
  index,
  keyPrefix,
  place,
  mark,
}: {
  block: TableBlock
  index: number
  keyPrefix: string
  place: Place | null
  /** Which track this block takes and how much width it needs, worked out once by `Block`. */
  mark: BlockMark
}) {
  // THE REGION TREE, for the caption above the table. `Block` reads the same context and this
  // component is drawn by `Block` without being handed it. Read before the refusal below, because a
  // hook may not be reached conditionally.
  const marks = useContext(RegionsHere)
  const norm = normalizeTable(block)
  // `norm.reason` IS COMPOSED FROM THIS BLOCK'S OWN ROWS (which ones are ragged, how many), so it
  // is not a fixed sentence a lookup table can translate without reimplementing `normalizeTable`
  // itself; it stays English this round (the report says so), marked `sb-server` like the other
  // composed sentences this file does not re-derive.
  if (!norm.ok) return <Refused index={index} what={t('sb.refused.table.what')} why={<span className="sb-server">{norm.reason}.</span>} />
  return (
    <DataTable
      table={norm.table}
      {...(block.caption === undefined ? {} : { caption: block.caption })}
      captionOrigin={fieldIn(place, 'caption', block.caption)}
      captionMark={captionRegionMark(marks, place)}
      address={addressOfStoredTable(place, block)}
      keyPrefix={keyPrefix}
      mark={mark}
    />
  )
}

// ---------------------------------------------------------------------------- markdown subset

/**
 * WHAT A NEWLINE IN A STORED PARAGRAPH IS, DECIDED IN ONE PLACE.
 *
 * A blank line is a paragraph break. What a single newline inside a paragraph is depends on the
 * `lineBreaks` switch of `renderMarkdown`:
 *
 *   - off, which is the default and what every report uses: it is whitespace. The author's editor
 *     wrapped, or a shell heredoc did, and the width they wrapped at is not this app's column.
 *   - on, which only the chat uses: it is a line break, drawn as a `br`, as in every chat product.
 *     This is a decision, on proposal kG2sFXVKNgkt.
 *
 * `paragraphsOf` below always reads it as whitespace. Both rules are here, and `paragraphsOf` and
 * `renderMarkdown` are the only two readers, so nothing can grow a second opinion about what a
 * paragraph is.
 */
const isBlankLine = (line: string): boolean => line.trim() === ''

/**
 * A character that sets full-width and needs no space beside its neighbour: CJK ideographs, kana,
 * hangul, and the CJK/fullwidth punctuation that travels with them.
 *
 * Used for ONE decision -- whether a soft-wrap newline becomes a space -- and never for choosing a
 * break position, which is the browser's job under `line-break: strict`.
 */
const CJK =
  /[\u1100-\u11FF\u2E80-\u303F\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/

/**
 * Wrapped lines of ONE paragraph, joined back into the sentence that was written.
 *
 * A SPACE, EXCEPT BETWEEN TWO CJK CHARACTERS. '视觉\n组' is one word and joining it with a space
 * would insert a gap its author never typed; 'the overhead\ncamera' is two words and joining it with
 * nothing would fuse them. The rule reads the character on each side of the newline as stored:
 * both CJK means no space, anything else -- including either side of a script boundary -- means
 * one. A trailing space the author did type is still there, and the browser collapses the run.
 */
export function joinWrapped(lines: string[]): string {
  let joined = ''
  for (const line of lines) {
    if (joined === '') {
      joined = line
      continue
    }
    joined += separatorBetween(joined, line) + line
  }
  return joined
}

/** What goes between two wrapped lines. One rule, read by `joinWrapped` and by `joinSource`. */
function separatorBetween(before: string, after: string): string {
  return CJK.test(before.charAt(before.length - 1)) && CJK.test(after.charAt(0)) ? '' : ' '
}

/**
 * WHERE A LINE BREAK GOES WHEN THE `lineBreaks` SWITCH IS ON: a carriage return, which no line can
 * hold. `sourceLines` splits on every carriage return, so one found in joined text is always a join.
 *
 * The inline reader treats it the way it treats the space it replaces. Its markers may run across
 * it, so bold written over two lines is still bold. A link address stops at it, as it stops at a
 * space. `breakLines` then draws each one as a `br`.
 */
const LINE_BREAK = '\r'

/**
 * The drawing of one joined block, with every `LINE_BREAK` in its text drawn as a `br`.
 *
 * It walks what `renderInline` drew instead of drawing each line alone, so an inline marker that
 * spans two lines is read once, whole. Every string is split at the joins, inside an element as
 * well: a bold run over two lines becomes one `strong` with a `br` in it. A formula is not broken.
 * Its source is a prop, and MathText would draw a carriage return as a character. So each join in
 * it becomes what `separatorBetween` puts there in a report.
 */
function breakLines(node: ReactNode, key: string): ReactNode {
  if (typeof node === 'string') {
    if (!node.includes(LINE_BREAK)) return node
    return node.split(LINE_BREAK).flatMap((line, n) => (n === 0 ? [line] : [<br key={`${key}-br${n}`} />, line]))
  }
  if (Array.isArray(node)) return (node as ReactNode[]).map((one, n) => breakLines(one, `${key}.${n}`))
  if (isValidElement(node)) {
    if (node.type === MathText) {
      const tex = (node.props as { tex: string }).tex
      const lines = tex.split(LINE_BREAK)
      if (lines.length === 1) return node
      return cloneElement(node as ReactElement<{ tex: string }>, { tex: joinWrapped(lines) })
    }
    const held = (node.props as { children?: ReactNode }).children
    if (held === undefined) return node
    const element = node as ReactElement<{ children?: ReactNode }>
    // Children given one by one are handed back one by one, so React does not ask them for keys.
    if (Array.isArray(held)) {
      return cloneElement(element, undefined, ...(held as ReactNode[]).map((one, n) => breakLines(one, `${key}c${n}`)))
    }
    return cloneElement(element, undefined, breakLines(held, `${key}c`))
  }
  return node
}

/** What the switches of `renderMarkdown` are. Every one is off unless a caller turns it on. */
export interface MarkdownOptions {
  /**
   * Draw a single newline inside a paragraph, a quote or a list item as a line break. Off, it is
   * whitespace. The chat turns it on and the reports leave it off.
   */
  lineBreaks?: boolean
  /**
   * Draw each item of a numbered list with the number its writer typed, so a reply that starts
   * "3." reads 3 and a list written 2 then 5 reads 2 and 5. Off, the browser counts from 1, as the
   * reports have always been drawn. The chat turns it on (wave 13y round 137): people answer a
   * message by number.
   */
  typedNumbers?: boolean
}

/**
 * ONE LINE OF A STORED STRING, AND WHERE IT STARTS IN IT.
 *
 * The offset is what everything below hangs on. Once a line knows where it is, so does every run of
 * text inside it, and a selection becomes a range of the source by arithmetic.
 */
interface SourceLine {
  text: string
  /** Where `text` starts in the stored string, counted in characters from 0. */
  at: number
}

/**
 * A stored string split into its lines, each one knowing where it starts.
 *
 * IT DOES NOT NORMALISE THE LINE ENDINGS FIRST, and that is the difference from the string this
 * reader used to work on. Replacing every carriage return and newline with a newline makes a string
 * that is one character shorter per Windows line ending, so every offset after the first one would
 * be a claim about the wrong characters. Here the line ending is measured rather than rewritten.
 */
function sourceLines(md: string): SourceLine[] {
  const out: SourceLine[] = []
  const ending = /\r\n|\n|\r/g
  let start = 0
  for (;;) {
    const found = ending.exec(md)
    if (found === null) break
    out.push({ text: md.slice(start, found.index), at: start })
    start = found.index + found[0].length
  }
  out.push({ text: md.slice(start), at: start })
  return out
}

/**
 * Wrapped lines joined into the sentence that was written, and where each one came from.
 *
 * With `lineBreaks` off, `text` is exactly what `joinWrapped` produces from the same lines — both
 * use the one separator rule above. With it on, every join is `LINE_BREAK` instead, whatever the
 * script on either side. `stretches` says which parts of that sentence are stretches of stored
 * text. The joins between them are not: the drawn character there is a space, nothing, or a line
 * break, and the stored one is a newline, so a run that crosses a join gets no offset and no
 * comment can be pinned to it.
 */
function joinSource(parts: readonly SourceLine[], lineBreaks = false): { text: string; stretches: Stretch[] } {
  let text = ''
  const stretches: Stretch[] = []
  for (const part of parts) {
    if (text !== '') text += lineBreaks ? LINE_BREAK : separatorBetween(text, part.text)
    stretches.push({ from: text.length, to: text.length + part.text.length, at: part.at })
    text += part.text
  }
  return { text, stretches }
}

/** Where the tail of a line starts in the stored string. Used wherever a marker is taken off. */
function tailAt(line: SourceLine, tail: string): number {
  return line.at + line.text.length - tail.length
}

/**
 * Stored text as the paragraphs it was written in.
 *
 * For prose that is NOT markdown -- a stored field shown as it is held. `renderMarkdown` is the
 * other reader of the same two rules; this one exists because a raw field value must not gain
 * headings and lists it never asked for, and must still not lose the blank lines it has.
 */
export function paragraphsOf(text: string): string[] {
  const out: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length > 0) out.push(joinWrapped(para))
    para = []
  }
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (isBlankLine(line)) flush()
    else para.push(line)
  }
  flush()
  return out
}

/** A quoted line. Also a paragraph terminator, or a quote after a sentence is swallowed by it. */
const QUOTE_LINE = /^\s*>\s?/

/** One to six hashes and a space. Six, because a long report really does go that deep. */
const HEADING_LINE = /^(#{1,6})\s+(.*)$/

/**
 * A line that is a break between sections: three or more dashes, stars or underscores, alone.
 *
 * It used to be read as a paragraph, so the round-four owner review printed the characters `---`
 * six times in the middle of the page. A break somebody typed is structure, and structure printed
 * as its own punctuation is the same silent loss as a quote printed with its angle bracket.
 */
const RULE_LINE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/

const BULLET_LINE = /^(\s*)[-*+]\s+(.*)$/
/** `1.` and `1)` both, because both are written here. The number as typed is kept: see `drawList`. */
const NUMBERED_LINE = /^(\s*)(\d+[.)])\s+(.*)$/

const isTableLine = (line: string): boolean => line.trimStart().startsWith('|')

/** Whether this line begins something of its own, and so ends whatever was being read. */
function startsSomethingElse(line: string): boolean {
  return (
    isBlankLine(line) ||
    line.startsWith('```') ||
    HEADING_LINE.test(line) ||
    RULE_LINE.test(line) ||
    QUOTE_LINE.test(line) ||
    isTableLine(line) ||
    BULLET_LINE.test(line) ||
    NUMBERED_LINE.test(line)
  )
}

/**
 * ONE ITEM OF A LIST, AND THE LINES THAT BELONG TO IT.
 *
 * `text` is a list of lines rather than a string because an item is written wrapped, in an editor
 * or a heredoc, and the lines under the first one are the same sentence. They are joined at the end
 * by `joinWrapped`, which is the same rule a paragraph uses.
 */
interface ListItem {
  text: SourceLine[]
  /**
   * WHAT THE ITEM HOLDS UNDER ITS OWN LINE, IN THE ORDER IT WAS WRITTEN: lists inside it, and
   * paragraphs written after a blank line and indented under it (problem wcvJmktc4VAL). A paragraph
   * is a run of lines like the item's own `text`, joined the same way.
   */
  children: (ListNode | ItemParagraph)[]
  /**
   * WHERE THE ITEM'S LINE STARTS, marker and indent included.
   *
   * `text[0].at` is where its WORDS start, after the dash, which is what a comment on three words
   * of a bullet needs. The region derivation names a bullet by where its LINE starts, so the two
   * are different numbers and both are needed. Reconstructing one from the other here would be
   * this file working out where a bullet begins for a second time.
   */
  lineAt: number
  /** The number as it was typed, with its full stop or bracket, or null on a bulleted item. */
  typed: string | null
}

/** One list. `indent` is how far its items were written in, which is what nesting is read from. */
interface ListNode {
  ordered: boolean
  indent: number
  items: ListItem[]
}

/** A paragraph written inside a list item: after a blank line, indented under the item. */
interface ItemParagraph {
  paragraph: SourceLine[]
}

const isItemParagraph = (held: ListNode | ItemParagraph): held is ItemParagraph => 'paragraph' in held

/** How much deeper a line has to be written to count as a list inside a list. */
const NEST_SPACES = 2

/**
 * What one line is, if it opens a list item. A tab counts as four spaces and nothing else does.
 *
 * `at` is where the item's WORDS start in the stored string — after the indent and the marker — so
 * a comment on three words of a bullet points at those three words and not at the dash.
 */
function itemOf(line: SourceLine): { indent: number; ordered: boolean; text: string; at: number; typed: string | null } | null {
  const bullet = BULLET_LINE.exec(line.text)
  if (bullet !== null) {
    const text = bullet[2]!
    return { indent: bullet[1]!.replace(/\t/g, '    ').length, ordered: false, text, at: tailAt(line, text), typed: null }
  }
  const numbered = NUMBERED_LINE.exec(line.text)
  if (numbered !== null) {
    const text = numbered[3]!
    return { indent: numbered[1]!.replace(/\t/g, '    ').length, ordered: true, text, at: tailAt(line, text), typed: numbered[2]! }
  }
  return null
}

/**
 * A WHOLE LIST, WITH ITS NESTING AND ITS WRAPPED LINES, READ AS ONE THING.
 *
 * THIS IS THE HALF THAT WAS WRONG, AND IT WAS MEASURED ON A REAL DOCUMENT. Before this, a list was
 * read one line at a time: a line that did not itself start with a dash ended the list, so every
 * item written across two lines became a one-item list followed by a paragraph carrying the rest of
 * its own sentence. Counted on the round-four owner review: its 17 list items were drawn as 15
 * separate lists and 15 of its paragraphs were the second halves of those items. They are now 3
 * lists — the three the author wrote — and 15 fewer paragraphs. A numbered list had it worse still:
 * every item became its own `ol`, and a browser starts an `ol` at one, so five steps were drawn as
 * five step ones.
 *
 * Three rules, and nothing else is read here:
 *
 *   - a line written at least two spaces deeper than the item above it opens a list inside that
 *     item, instead of being flattened to a sibling — which was structure deleted in silence.
 *   - a line that starts nothing of its own belongs to the item above it, however it is indented.
 *     That is what a wrapped sentence looks like.
 *   - a blank line inside a list does not end it, as long as another item follows, or a line written
 *     at least two spaces deeper than the list's own items. That deeper line is a paragraph inside
 *     the item above it, as CommonMark reads it, and the list goes on after it: problem wcvJmktc4VAL,
 *     where an indented paragraph under item 2 ended the list and item 3 was drawn as 1. The list
 *     ends when the next thing after a blank line is neither.
 */
function readList(lines: readonly SourceLine[], start: number): { node: ListNode; next: number } {
  const first = itemOf(lines[start]!)!
  const root: ListNode = { ordered: first.ordered, indent: first.indent, items: [] }
  const stack: ListNode[] = [root]
  let i = start

  const lastItem = (): ListItem | undefined => stack[stack.length - 1]!.items[stack[stack.length - 1]!.items.length - 1]
  const blank = (n: number): boolean => isBlankLine(lines[n]?.text ?? '')
  const indentOf = (text: string): number => (/^\s*/.exec(text)?.[0] ?? '').replace(/\t/g, '    ').length
  // The paragraph inside an item that wrapped lines are being added to, until a blank line or an item.
  let paragraph: ItemParagraph | null = null

  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) break

    if (isBlankLine(line.text)) {
      let j = i
      while (j < lines.length && blank(j)) j++
      const nextLine = j < lines.length ? lines[j]! : null
      const after = nextLine === null ? null : itemOf(nextLine)
      paragraph = null
      if (nextLine !== null && after === null && !startsSomethingElse(nextLine.text)) {
        // A PARAGRAPH INDENTED UNDER AN ITEM belongs to the deepest open item it is written under,
        // and the list goes on after it.
        const deep = indentOf(nextLine.text)
        while (stack.length > 1 && deep < stack[stack.length - 1]!.indent + NEST_SPACES) stack.pop()
        const holding = lastItem()
        if (deep >= stack[stack.length - 1]!.indent + NEST_SPACES && holding !== undefined) {
          const trimmed = nextLine.text.trim()
          paragraph = { paragraph: [{ text: trimmed, at: nextLine.at + (nextLine.text.length - nextLine.text.trimStart().length) }] }
          holding.children.push(paragraph)
          i = j + 1
          continue
        }
        break
      }
      // A blank line then anything that is not another item of this list is the end of the list.
      if (after === null || after.indent < root.indent) break
      i = j
      continue
    }

    const item = itemOf(line)
    if (item !== null) {
      paragraph = null
      while (stack.length > 1 && item.indent < stack[stack.length - 1]!.indent) stack.pop()
      const top = stack[stack.length - 1]!
      if (item.indent >= top.indent + NEST_SPACES && lastItem() !== undefined) {
        const child: ListNode = { ordered: item.ordered, indent: item.indent, items: [] }
        lastItem()!.children.push(child)
        stack.push(child)
      } else if (stack.length === 1 && item.ordered !== root.ordered) {
        // A numbered list starting where a bulleted one was running is a second list, not a row of
        // this one. Ending the run here draws two lists, which is what was written.
        break
      }
      stack[stack.length - 1]!.items.push({ text: [{ text: item.text, at: item.at }], children: [], lineAt: line.at, typed: item.typed })
      i++
      continue
    }

    if (startsSomethingElse(line.text)) break

    // A wrapped line. It belongs to the item above it, with the indentation the author's editor
    // put there taken off — an indent is how the line was wrapped, not a word of the sentence.
    const holding = lastItem()
    if (holding === undefined) break
    const trimmed = line.text.trim()
    const wrapped = { text: trimmed, at: line.at + (line.text.length - line.text.trimStart().length) }
    if (paragraph !== null) paragraph.paragraph.push(wrapped)
    else holding.text.push(wrapped)
    i++
  }

  return { node: root, next: i }
}

/**
 * One list, drawn. A list inside an item is drawn inside that item's `li`, where it belongs.
 *
 * WITH `typedNumbers`, A NUMBERED ITEM CARRIES ITS TYPED NUMBER and `.sb-list-typed` draws it where
 * the browser's own number would be. The browser's `value` attribute was not used: Chromium draws
 * `value="007"` as 7 and counts from 1 again past 2147483647, so it would still change some numbers.
 */
function drawList(
  node: ListNode,
  keyPrefix: string,
  origin: Origin | null,
  marks: RegionMarks | null = null,
  lineBreaks = false,
  typedNumbers = false,
): ReactNode {
  const Tag = node.ordered ? 'ol' : 'ul'
  const typed = node.ordered && typedNumbers
  const field = origin?.field
  const first = node.items[0]
  // A LIST INSIDE A LIST FINDS NO GROUP, AND THAT IS THE DERIVATION SPEAKING. The markdown walk in
  // src/shared/regions.ts opens one bullet group per run of marker lines whatever their indent, so
  // there is no region starting where a nested list starts and this asks for one and gets nothing.
  // The items inside it are still bullets and still carry their own targets.
  const group = first === undefined ? null : regionStartingAt(marks, field, first.lineAt, ['bulletGroup'])
  return (
    <Tag key={keyPrefix} className={typed ? 'sb-list sb-list-typed' : 'sb-list'} {...regionMark(marks, group)}>
      {node.items.map((item, n) => {
        const joined = joinSource(item.text, lineBreaks)
        const words = renderInline(joined.text, `${keyPrefix}-${n}`, originOf(origin, joined.text, joined.stretches))
        return (
          <li key={n} {...WRITING} {...regionMark(marks, regionStartingAt(marks, field, item.lineAt, ['bullet']))} data-typed={typed ? (item.typed ?? undefined) : undefined}>
            {lineBreaks ? breakLines(words, `${keyPrefix}-${n}`) : words}
            {item.children.map((child, c) => {
              if (!isItemParagraph(child)) return drawList(child, `${keyPrefix}-${n}-${c}`, origin, marks, lineBreaks, typedNumbers)
              const said = joinSource(child.paragraph, lineBreaks)
              const inner = renderInline(said.text, `${keyPrefix}-${n}-${c}`, originOf(origin, said.text, said.stretches))
              return (
                <p key={`${keyPrefix}-${n}-${c}`} className="sb-li-p" {...WRITING}>
                  {lineBreaks ? breakLines(inner, `${keyPrefix}-${n}-${c}`) : inner}
                </p>
              )
            })}
          </li>
        )
      })}
    </Tag>
  )
}

/**
 * WHICH LINES OF A RECORD'S PROSE ARE HEADINGS, LISTS, CODE AND QUOTES.
 *
 * A deliberately small markdown: headings, paragraphs, bullet and numbered lists, fenced code and
 * blockquotes. The inside of each line is handed to renderInline from src/shared/inline.ts, which
 * is the only place in this product that knows what a marker means. Nothing here reads one.
 *
 * THIS READS BLOCKS THE WAY A REPORT NEEDS THEM, NOT THE WAY A PLAN DOES. It joins a wrapped
 * paragraph into one line and drops blank ones, so what comes out is not the characters that went
 * in. src/shared/plandoc.ts may never do that: a plan's lines are stored rows a person files as
 * work, so it hands every line back unchanged, with its id. Two block readers, two jobs, and
 * merging them would break one of the two. The inside of a line had neither problem, which is why
 * that half is shared and this half is not.
 *
 * ONE THING IS LEFT OUT ON PURPOSE, AND ONE THING NO LONGER IS.
 *
 * Underscore italics are not read, because max_width and ~/my_file appear in this app
 * constantly and turning half of them into italics would corrupt real values.
 *
 * A TABLE WRITTEN WITH PIPES IS NOW A REAL TABLE. It used to print its characters under a note
 * telling the author to use a table block, and the reason given was that reading the pipes here
 * would be a SECOND reader of pipe-table syntax. The reason was right and the conclusion was wrong:
 * `src/shared/plandoc.ts` already has THE reader, written for a plan, and it is called below. The
 * cells it hands back go to `normalizeTable`, so a typed table block and a table typed into prose
 * draw through one path and are the same thing on screen. Measured on the owner's corpus: six
 * tables in their own reports were printed as pipe characters, four of them in one report.
 *
 * An image written with markdown is still not drawn: an image block carries the copyable path and
 * the text alternative that the markdown spelling has nowhere to put. `src/shared/inline.ts` says
 * so in place, where the image was written.
 *
 * Everything is built as React elements, never as an HTML string, so there is no path by which
 * text in a record can become markup.
 *
 * `origin` says which stored string `md` is, so every run of text it draws can say where it came
 * from. Left out, it draws the same thing and claims nothing.
 *
 * `options.lineBreaks` draws a single newline inside a paragraph, a quote or a list item as a line
 * break; see `MarkdownOptions`. Left out, a single newline there is whitespace.
 * `options.typedNumbers` draws a numbered list with the numbers as typed; left out, from 1.
 */
export function renderMarkdown(
  md: string,
  keyPrefix: string,
  origin: Origin | null = null,
  marks: RegionMarks | null = null,
  options: MarkdownOptions = {},
): ReactNode[] {
  const lineBreaks = options.lineBreaks === true
  const typedNumbers = options.typedNumbers === true
  // WHICH STORED STRING THIS RUN OF MARKDOWN IS, so every region id below is looked up in the one
  // tree rather than spelled here. Without an origin nothing is stored anywhere and no part of it
  // can be pointed at, which is the settings preview and the module panel's own case.
  const field = origin?.field
  const out: ReactNode[] = []
  const lines = sourceLines(md)
  let i = 0
  let k = 0
  const key = () => `${keyPrefix}-${k++}`

  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) break

    if (isBlankLine(line.text)) {
      i++
      continue
    }

    if (line.text.startsWith('```')) {
      const body: SourceLine[] = []
      // WHERE THE FENCE IS, not where the code is: the derivation names a code region by the line
      // that opens it, so that is the offset the lookup is made with.
      const fenceAt = line.at
      // WHAT THE WRITER PUT AFTER THE BACKTICKS. Until 8 September 2026 this arm matched the three
      // backticks and threw the rest of the line away, so a writer saying what a fence held was
      // saying it to nothing.
      const word = fenceWordOf(line.text)
      i++
      while (i < lines.length) {
        const l = lines[i]
        if (l === undefined || l.text.startsWith('```')) break
        body.push(l)
        i++
      }
      i++ // the closing fence
      const code = body.map((l) => l.text).join('\n')
      // The whole run is one stretch of the source when the source used plain newlines. When it did
      // not, the drawn characters are not the stored ones and `saidToBe` writes nothing.
      const at = body[0]?.at ?? 0
      // THE ONE `code` ELEMENT, MADE ONCE, DRAWN BY WHICHEVER BOX TAKES IT. It carries the two
      // provenance offsets and the region mark, which is what a comment anchors to. A diagram hands
      // this same element to the fold under its picture, so nothing that could be pointed at stops
      // being pointable.
      const characters = (
        <code {...saidToBe(origin, code, at)} {...regionMark(marks, regionStartingAt(marks, field, fenceAt, ['code']))}>
          {code}
        </code>
      )
      out.push(
        word === DIAGRAM_FENCE ? (
          <Diagram key={key()} code={code}>
            {characters}
          </Diagram>
        ) : (
          <CodeBox key={key()} code={code} word={word}>
            {characters}
          </CodeBox>
        ),
      )
      continue
    }

    const heading = HEADING_LINE.exec(line.text)
    if (heading && heading[1] && heading[2] !== undefined) {
      const level = heading[1].length
      const words = heading[2]
      const text = renderInline(words, key(), wholeOf(origin, words, tailAt(line, words)))
      // Starts at h3: a summary lives inside a panel that already owns h2. Below the fourth hash
      // everything is h6, because a document with six live heading levels needs six sizes and this
      // component has four; drawing a fifth level as a fourth is honest, inventing a size is not.
      // The derivation names a heading by the line that opens it, hashes included, so the lookup
      // uses the line's own start and not where the words begin.
      const head = { ...WRITING, ...regionMark(marks, regionStartingAt(marks, field, line.at, ['heading'])) }
      out.push(
        level === 1 ? (
          <h3 key={key()} className="sb-h" {...head}>{text}</h3>
        ) : level === 2 ? (
          <h4 key={key()} className="sb-h" {...head}>{text}</h4>
        ) : level === 3 ? (
          <h5 key={key()} className="sb-h" {...head}>{text}</h5>
        ) : (
          <h6 key={key()} className="sb-h" {...head}>{text}</h6>
        ),
      )
      i++
      continue
    }

    // A break between sections. Written as three dashes, three stars or three underscores.
    if (RULE_LINE.test(line.text)) {
      out.push(<hr key={key()} className="sb-rule" />)
      i++
      continue
    }

    if (isTableLine(line.text)) {
      const run: SourceLine[] = []
      while (i < lines.length && isTableLine(lines[i]?.text ?? '')) {
        run.push(lines[i]!)
        i++
      }
      out.push(<TypedTable key={key()} run={run} origin={origin} keyPrefix={key()} marks={marks} />)
      continue
    }

    // A quote. It used to fall through to the paragraph arm, which printed the `>` as a literal
    // character and lost the fact that the words were somebody else's -- structure deleted in
    // silence, which is the one thing this renderer may not do.
    if (QUOTE_LINE.test(line.text)) {
      const quoteAt = line.at
      const quoted: SourceLine[] = []
      while (i < lines.length) {
        const l = lines[i]
        if (l === undefined || !QUOTE_LINE.test(l.text)) break
        const words = l.text.replace(QUOTE_LINE, '')
        quoted.push({ text: words, at: tailAt(l, words) })
        i++
      }
      const joined = joinSource(quoted, lineBreaks)
      const blockKey = key()
      const quoteKey = key()
      const words = renderInline(joined.text, quoteKey, originOf(origin, joined.text, joined.stretches))
      // A `>` LINE IS DERIVED AS A PARAGRAPH AND DRAWN AS A QUOTE, and that gap is real. The
      // markdown walk in src/shared/regions.ts has no arm for a quote line, so the region covering
      // these characters carries the role `paragraph`. The RUN OF CHARACTERS is the same run either
      // way, so the address is true and only the word for it is wrong. Asking for `quote` as well
      // means the day the derivation grows that arm, this keeps working and says the better word.
      out.push(
        <blockquote
          key={blockKey}
          className="sb-quoted"
          {...WRITING}
          {...regionMark(marks, regionStartingAt(marks, field, quoteAt, ['quote', 'paragraph']))}
        >
          {lineBreaks ? breakLines(words, quoteKey) : words}
        </blockquote>,
      )
      continue
    }

    if (itemOf(line) !== null) {
      const list = readList(lines, i)
      out.push(drawList(list.node, key(), origin, marks, lineBreaks, typedNumbers))
      i = list.next
      continue
    }

    /**
     * A paragraph runs until a blank line. A single newline inside it is wrapping, or a line
     * break when `lineBreaks` is on.
     *
     * THE FIRST LINE IS TAKEN WITHOUT ASKING, AND THAT IS WHAT MAKES THIS LOOP SAFE. Every arm
     * above consumes at least one line, and this one has to as well: a line that `startsSomethingElse`
     * claims but no arm above handles would otherwise be looked at forever, and the page would hang
     * rather than draw something wrong. That is not hypothetical — it happened here while proving
     * this file's tests, when one arm was removed and the reader spun until the process ran out of
     * memory. Reaching this point already means the line starts nothing else.
     */
    const para: SourceLine[] = [line]
    i++
    while (i < lines.length) {
      const l = lines[i]
      if (l === undefined || startsSomethingElse(l.text)) break
      para.push(l)
      i++
    }
    const joined = joinSource(para, lineBreaks)
    const blockKey = key()
    const paraKey = key()
    const words = renderInline(joined.text, paraKey, originOf(origin, joined.text, joined.stretches))
    out.push(
      <p
        key={blockKey}
        className="sb-p"
        {...WRITING}
        {...regionMark(marks, regionStartingAt(marks, field, line.at, ['paragraph']))}
      >
        {lineBreaks ? breakLines(words, paraKey) : words}
      </p>,
    )
  }

  return out
}

/**
 * A TABLE SOMEBODY TYPED INTO THEIR PROSE, DRAWN AS A TABLE.
 *
 * The pipes are read by `blocksOf` in src/shared/plandoc.ts, which is the one reader of pipe-table
 * syntax in this product. It is given the lines with their source offsets carried as line ids —
 * that file promises to hand every line back with the id it was given — so this end can say where
 * each cell's words are stored without reading a pipe itself.
 *
 * WHEN THE PIPES DO NOT MAKE A TABLE, plandoc says so in its own words and the lines are printed
 * exactly as they were typed. That sentence is written for a person and it is the same sentence a
 * plan shows, which is one wording rather than two.
 *
 * A ROW OF ONE OF THESE IS NOT A STORED ROW, so it carries no row or cell address. `tableRow` is
 * looked up in a stored `table` block's `rows`, and a table typed into a paragraph has none — a
 * comment against one would read back as "that block is not a table", which is true and useless.
 * Its WORDS are addressable, in the paragraph's own field, which is what a person wanted anyway.
 */
function TypedTable({
  run,
  origin,
  keyPrefix,
  marks = null,
}: {
  run: readonly SourceLine[]
  origin: Origin | null
  keyPrefix: string
  marks?: RegionMarks | null
}) {
  const paint = useContext(PaintTheWords)
  const plan = planOfATypedTable(run, origin, keyPrefix)

  if (plan.drawn === 'typed') {
    const code = <code {...saidToBe(origin, plan.typed, run[0]?.at ?? 0)}>{plan.typed}</code>
    return (
      <div className="sb-astyped">
        {plan.why}
        <CodeBox code={plan.typed}>{paint === null ? code : paint(code)}</CodeBox>
      </div>
    )
  }

  // THE WHOLE TABLE CARRIES A TARGET AND ITS ROWS AND CELLS DO NOT, YET. The derivation makes a
  // region for each. `DataTable` draws rows and cells for a stored table and for a typed one through
  // the same component, and its row and cell elements take their address from the stored table's
  // `tableRow` and `tableCell` targets. Giving a typed table's rows region targets means teaching
  // that component two kinds of address, which is its own change. Until then a press inside a typed
  // table resolves to the table — one rung coarser than the design asks for, and a true answer.
  return (
    <DataTable
      table={plan.table}
      captionOrigin={null}
      captionMark={{}}
      address={plan.address}
      keyPrefix={keyPrefix}
      mark={regionMark(marks, regionStartingAt(marks, origin?.field, run[0]?.at ?? -1, ['table']))}
    />
  )
}

/**
 * WHAT A TYPED TABLE DRAWS: a table with the address of each cell's words, or the lines as they were
 * typed with the sentence that says why. `TypedTable` draws it and `wordsOfATypedTable` reads it, so
 * the chat's count of marked parts is made from the same cells the table draws.
 */
function planOfATypedTable(
  run: readonly SourceLine[],
  origin: Origin | null,
  keyPrefix: string,
): { drawn: 'typed'; why: ReactNode; typed: string } | { drawn: 'table'; table: NormTable; address: TableAddress } {
  const read = planBlocksOf(run.map((line) => ({ id: String(line.at), text: line.text })))[0]
  const typed = run.map((line) => line.text).join('\n')

  if (read === undefined || read.kind !== 'table') {
    // THE REASON IS `@shared/plandoc.ts`'S, said in the page's language: `whyNotRead` turns
    // plandoc's reason code into its sentence with the `t` it is given, so a plan and a summary say
    // one sentence for one reason.
    const why =
      read !== undefined && read.kind === 'notUnderstood'
        ? { text: whyNotRead(read.because, t), server: false }
        : { text: t('sb.typedTable.notReadable'), server: false }
    return {
      drawn: 'typed',
      why: (
        <p className={why.server ? 'sb-note sb-server' : 'sb-note'} role="note">
          {why.text}
        </p>
      ),
      typed,
    }
  }

  const norm = normalizeTable({
    id: keyPrefix,
    type: 'table',
    columns: read.heading.map((label) => ({ label })),
    rows: read.rows.map((cells) => ({ cells: [...cells] })),
  })
  if (!norm.ok) {
    // plandoc has already refused a run whose rows disagree, so there is nothing left for
    // normalizeTable to object to. Saying it out loud beats drawing nothing if that ever changes.
    return {
      drawn: 'typed',
      why: (
        <p className="sb-note" role="note">
          {/* `norm.reason` IS COMPOSED FROM THIS BLOCK'S OWN ROWS, the same reason it stays English
              at the other `normalizeTable` call site above; marked `sb-server` there too. */}
          {t('sb.typedTable.couldNotBeDrawn')} <span className="sb-server">{norm.reason}</span>. {t('sb.typedTable.printedAsTyped')}
        </p>
      ),
      typed,
    }
  }

  return { drawn: 'table', table: norm.table, address: addressOfTypedTable(origin, read.lines, read.heading, read.rows) }
}

/**
 * THE WORDS A TYPED TABLE DRAWS, as it draws them: each heading's and each cell's words, or the code
 * of the lines as they were typed. Null when the node is not a typed table.
 *
 * The chat counts the marked parts that cannot be painted, and a table's cells are drawn by a
 * component it cannot walk into. So it reads them here, and it paints them through `PaintTheWords`.
 */
export function wordsOfATypedTable(node: ReactNode): ReactNode[] | null {
  if (!isValidElement(node) || node.type !== TypedTable) return null
  const { run, origin, keyPrefix } = node.props as { run: readonly SourceLine[]; origin: Origin | null; keyPrefix: string }
  const plan = planOfATypedTable(run, origin, keyPrefix)
  if (plan.drawn === 'typed') return [<code key="typed" {...saidToBe(origin, plan.typed, run[0]?.at ?? 0)}>{plan.typed}</code>]
  const address = plan.address
  return [
    ...plan.table.headers.map((h, c) => headWordsOf(h, c, keyPrefix, address)),
    ...plan.table.rows.flatMap((row, r) => row.cells.map((cell, c) => cellWordsOf(cell, r, c, keyPrefix, address))),
  ]
}

/**
 * WHERE EACH CELL OF A TYPED TABLE'S WORDS ARE, in the paragraph they were typed into.
 *
 * The cells of one row are found in the order they were written, each search starting where the
 * last one ended. That is not a search for the words: it is walking the same line in the same order
 * the cells came out of it, so two cells holding the same word land on their own copy. `saidToBe`
 * then checks every answer against the stored string before it is written onto an element, so a
 * wrong one is dropped rather than drawn.
 */
function addressOfTypedTable(
  origin: Origin | null,
  lines: readonly { id: string; text: string }[],
  heading: readonly string[],
  rows: readonly (readonly string[])[],
): TableAddress {
  if (origin === null) return NOWHERE

  const offsetsIn = (line: { id: string; text: string } | undefined, cells: readonly string[]): number[] => {
    if (line === undefined) return cells.map(() => -1)
    const at = Number(line.id)
    if (!Number.isFinite(at)) return cells.map(() => -1)
    let cursor = 0
    return cells.map((cell) => {
      const found = line.text.indexOf(cell, cursor)
      if (found === -1) return -1
      cursor = found + cell.length
      return at + found
    })
  }

  const headOffsets = offsetsIn(lines[0], heading)
  // The heading is the first line and the row of dashes is the second, so the rows start at the
  // third. That is plandoc's shape and it is the only thing read from it here.
  const rowOffsets = rows.map((cells, r) => offsetsIn(lines[r + 2], cells))

  return {
    row: () => ({}),
    cell: () => ({}),
    headWords: (c) => wholeOf(origin, heading[c] ?? '', headOffsets[c] ?? -1),
    cellWords: (r, c) => wholeOf(origin, rows[r]?.[c] ?? '', rowOffsets[r]?.[c] ?? -1),
  }
}

// ---------------------------------------------------------------------------- styles

/**
 * This component's own stylesheet, exported the way `UI_CSS` is: tests/viz.test.ts asserts that the
 * reading measure in here is the shared token and never a character count, and it can only do that
 * if it can read the rules rather than the file they are written in.
 */
export const SUMMARY_CSS = `
/* ----------------------------------------------------------------------------------------------
   THE TOKENS A PRESENTATION PROFILE MOVES, DECLARED ONCE, WITH THE DEFAULTS THAT ARE "PANEL".

   Every rule below reads these rather than a size of its own, and a profile further down is one
   block that sets them and nothing else. That is what stops a profile becoming a second renderer:
   there is nowhere for one to put a rule about how a block is BUILT, only about how it is set.

   --measure is deliberately NOT in this list even though a profile changes it. It is the app-wide
   reading-width token from tokens.css, and redeclaring it here rather than adding a second name is
   the whole reason one panel has one column. See the note over .sb-doc.
   ---------------------------------------------------------------------------------------------- */
.sb {
  /* THE FOUR HEADING SIZES, named after the elements they are on. A profile writes a ladder by
     setting these four; nothing else in this file states a heading size. */
  --sb-h3: var(--fs-4);
  --sb-h4: var(--fs-3);
  --sb-h5: var(--fs-2);
  --sb-h6: var(--fs-2);
  /* DENSITY. The air between blocks, the gap across a row of them, and the height of a table row. */
  --sb-gap: var(--pad-lg);
  --sb-gut: var(--gut);
  --sb-cell-y: 6px;
  /* THE READING SIZE and how far apart its lines sit. */
  --sb-read: var(--fs-3);
  --sb-lh: var(--lh-read);
  /* THE LINE UNDER A SECTION HEADING. Zero is no line, which is what a panel wants. */
  --sb-rule: 0px;
  /* HOW ROUND A BOX IS. */
  --sb-box: var(--radius);
  /* THE READING WIDTH NOBODY ASKED FOR. "none" is no maximum, which is what "full" means and what
     every block in the corpus gets until an Agent writes a measure on one. It is declared here, at
     the top, because the one rule that applies a measure now applies to every block that holds
     writing and not only to a block inside a composition. */
  --sb-measure: none;
  /* THE READING MEASURE IS DECLARED IN tokens.css AND IS NOT DECLARED HERE. --read is the length
     one reading-measure preset resolves to, declared exactly once, in the file every other width in this
     product is declared in. A TEXT SIZE below sets it, which is what a size is: a set of values.
     This component never declares a default of its own, because a default in two places is how
     the seven redeclarations of --measure started. */
  font-family: var(--font-ui); color: var(--text); }
.sb-block { margin:0; }

/* ----------------------------------------------------------------------------------------------
   THE READING GRID: ONE COLUMN, AND IT IS THE WHOLE OF THE BOX.

   A Semantic Region owns its space, all of it. A report body, a section's body, a tab's panel and
   every box that holds a run of markdown therefore lay their blocks out in ONE column, which is
   the whole of that box. Nothing here says which column a block takes, because there is only one
   answer and the browser gives it.

   THIS RULE SET DECLARED TWO COLUMNS UNTIL 29 AUGUST 2026, and this is what it said:

     grid-template-columns: [read-start] var(--read-w) [read-end] minmax(0, 1fr) [edge-end]

   read-start to read-end was meant to be a reading column, and read-end to edge-end the band
   beside it. NOTHING WAS EVER PUT IN THAT BAND: the pair of names "read-end / edge-end" appears
   nowhere in src/web, in any commit. And once commit 78bcf18 made --reading-in-container 100cqi,
   the first column was already the whole box, so the second was 0px wide.

   MEASURED BEFORE REMOVING IT. Chromium at 1440 on 29 August 2026, one report inside
   an 1164px report body: 74 elements drew the two columns and every one of them had a second
   column of exactly 0px — 23 findings and 23 finding details at [1145px, 0px], 17 text blocks at
   [1164px, 0px], 2 callout bodies at [1133px, 0px], 9 reading grids at [1164px, 0px].

   ZERO WIDTH IS NOT ABSENCE, AND THE RULE SINCE 28 AUGUST 2026 IS ABSENCE: no fixed 22% margin and
   no latent empty second track remains as a structural rule, and there are several columns only
   when the composition has several sibling regions.

   THREE PLACEMENT RULES WENT WITH THE COLUMN, because each of them existed only to say "take both
   columns" and there are no longer two: one for a spanning block, one for the four blocks that
   draw something in front of their text, and one for a part that needs only a reading line. Each
   also carried min-width:0 and box-sizing:border-box, and both of those are already given — the
   first by the rule below that applies to every child, the second by the reset in styles.css.
   None of the three changed any width when it was removed; the measurement is in the commit.

   --read IS DECLARED ONCE, IN tokens.css. It used to be --lane-prose, declared six times: once in
   tokens.css and once inside each of the six reading profiles, so the report's reading column was
   whichever of six numbers the reader's stored profile happened to name. The six profiles are
   gone; the one declaration is what moves, and the text-size row is what moves it. --read is now
   the value of ONE reading-measure preset an Agent may ask for on a prose part, and not a floor
   under every box in the product.

   WHAT --read-w IS NOW, SAID PLAINLY BECAUSE ITS NAME NO LONGER SAYS IT. It is
   var(--reading-in-container) here and var(--reading-in-box) inside a nested box, and both of
   those are the whole width of that box — 100cqi and 100%. It is not a reading measure and it
   rules no writing. SINCE 29 AUGUST 2026 NOTHING READS IT AT ALL. The last two readers were the
   min-widths on a stored table and on a table typed into markdown, and both of those now take
   their floor from what the block holds instead. The declarations were left standing because a
   test required the stylesheet to declare --read-w somewhere. That test has since been deleted, so
   deleting a variable nothing reads is now its own small change, and not part of a change about
   how wide a table is drawn.

   THE ONE DETAIL THAT IS STILL LOAD-BEARING: min-width:0 on every child. A grid item is
   min-width:auto, so a block would refuse to shrink under its own min-content and would overflow
   its column instead of scrolling inside its own box.

   NESTING NEEDS NO SECOND CONTAINER, and that is worth saying because it looks as though it
   should. A nested reading grid — a section's body, a tab's panel — is the width of the grid it
   sits in, which is 100cqi, so a paragraph in a section lines up with a paragraph beside it.
   Blocks inside .sb-columns and .sb-grid are a different case: those genuinely have siblings, they
   are not reading grids, and their children take their cell. */
.sb-fit { display:block; min-width:0; container-type: inline-size; container-name: blocks; }
.sb-reads {
  --read-w: var(--reading-in-container);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: var(--sb-gap);
  align-content: start;
}
.sb-reads > * { min-width: 0; }

/* A TABLE OR A PICTURE IS THE WHOLE WIDTH OF THE BOX, AND THIS RULE IS WHY.
   -----------------------------------------------------------------------------------------------
   A TABLE IS AS WIDE AS ITS OWN CONTENT, UP TO THE REGION, AND NO WIDER. width: fit-content asks
   the browser what the block's content measures; max-width holds it to the box; min-width is the
   narrowest this block may be drawn at, which is a fact the region tree already knows.

   THE MIN-WIDTH SAID var(--read-w) UNTIL 29 AUGUST 2026, AND THAT FORCED EVERY ONE OF THESE BLOCKS
   TO FULL WIDTH. --read-w is var(--reading-in-container), which has been 100cqi since commit
   78bcf18, and max-width is 100cqi as well. A number clamped between the box and the box is the
   box, so fit-content never bound and the block was the whole region whatever it held.

   WHAT THAT COST, MEASURED IN CHROMIUM AT 1440 ON 29 AUGUST 2026, in an 1164px report body. On a
   named acceptance fixture the one stored table drew at 1164px and its content wants
   463.86px: 700px, sixty per cent of the region, was empty INSIDE the table — a two-column table
   of labels and numbers with the numbers pushed to the far right. On another report three of five
   tables were held wider than their content, at 932.05, 959.38 and 807.58 against 1164.

   THE FLOOR IS WHAT THE BLOCK HOLDS, AND IT IS NOT A NUMBER THIS FILE CHOSE. LEAST_REM in
   src/shared/beside.ts is the one place that says how narrow a thing may be drawn by what is in
   it — one number for writing, one for a table or a block of code, one for a picture, and the
   numbers themselves are there and not repeated here. This comment listed all three until 29
   August 2026 and the picture's went stale the moment that number moved. data-least is the region
   tree's answer for this block, written by leastNeededBy. The rules for a part of a composition
   further down this file read exactly the same two things in exactly the same shape,
   min(var(--least), 100%), so there is one answer to "how narrow" and not two.

   THIS KEEPS THE REASON THE MIN-WIDTH WAS THERE. Its original comment, from 20 August 2026, said
   it held a small table at the reading measure so a three-column table did not shrink to a stripe.
   That reason is real and it survives: a table whose content measures less than its floor is still
   drawn at its floor. What is gone is the part that was never a reason — 544px, and later the whole
   region, applied to tables that had asked for neither.

   NOBODY LOOKED IS NOT NOTHING THERE. A block with no data-least — a settings preview, a record
   whose blocks carry no stored ids — takes the WIDEST floor, so it is drawn too wide rather than
   too narrow. The composition rules answer the same case the same way. */
.sb-reads > [data-fit="measured"] {
  --least: ${String(LEAST_REM.sentence)}rem;
  width: fit-content;
  min-width: min(var(--least), 100%);
  max-width: 100cqi;
}
.sb-reads > [data-fit="measured"][data-least="panel"]  { --least: ${String(LEAST_REM.panel)}rem; }
.sb-reads > [data-fit="measured"][data-least="figure"] { --least: ${String(LEAST_REM.figure)}rem; }

/* THE RULE THAT USED TO LET ONE OF THOSE FOUR OUT OF THE CAP IS GONE, because the cap is gone.
   -----------------------------------------------------------------------------------------------
   It said: a list, a quote, a callout or a finding carrying data-needs="wide" takes width auto
   instead of the reading measure. It existed because the rule above capped all four whatever they
   held. Two rules, one asking a question and the other undoing the answer, were the same fact
   worked out twice — the region tree already knew what the block held. Neither is needed once the
   block simply takes the width it is given. */
/* A BOX THAT HOLDS A RUN OF MARKDOWN LAYS ITS OWN CHILDREN OUT, and this is the rest of the
   owner's complaint. The nine-row table on the owner's report is typed as markdown INSIDE a text block, so
   it inherited that block's old reading column and was drawn at 542px while wanting 1414px. Such a
   block is a grid now, of one column that is the whole of the box, so a paragraph and a table
   inside it both get the whole of it.

   FOUR PLACES DRAW A RUN OF MARKDOWN AND ALL FOUR ARE NAMED HERE — a text block, the body of a
   callout, the detail under a finding, the detail under one event on a timeline. They all call the
   same renderer, so they all receive the same paragraphs, lists, quoted lines and tables, and there
   is no reason for one of them to lay those out differently from another. The last three were flex
   columns with no columns of their own at all, which was invisible until a callout was allowed to
   take the whole width: its sentences then ran the whole 1164px, because nothing inside it was
   ruling them.

   WHY A GRID AND NOT A FLEX COLUMN, now that there is one column and not two: a grid column of
   minmax(0, 1fr) is a definite width, so a table inside it can scroll inside its own box instead
   of stretching the page. The rules further down that give a table min-width:0 depend on it. */
.sb-text, .sb-callout-body, .sb-finding-detail, .sb-event-detail {
  /* A BOX INSIDE THE REPORT MEASURES ITSELF AND NOT THE REPORT. .sb-reads reads
     --reading-in-container, which is 100cqi, and 100cqi is the width of the whole report body —
     right for the report body, wrong for a box nested inside one. Measured at 390 in Chromium: the
     detail under a finding is about 335px wide inside a 366px report, so a track asking for 100cqi
     came out at 366px and pushed the page 7px wider than the phone. What still reads --read-w here
     is the table rule below. */
  --read-w: var(--reading-in-box);
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: var(--pad);
  align-content: start;
}
.sb-text > *, .sb-callout-body > *, .sb-finding-detail > *, .sb-event-detail > *,
.sb-list > *, .sb-quote > *, .sb-finding > * {
  min-width: 0;
}
/* THE STATE CHIP HUGS ITS OWN WORD AND THE WRITING FILLS THE COLUMN. justify-items: start on the
   box is what the flex align-items: flex-start used to say, and it is right for the chip: a
   two-word tag stretched to the whole width is a wide empty pill. It is wrong for the two children
   that hold writing, and those say so here. */
.sb-finding > .sb-finding-text, .sb-finding > .sb-finding-detail { justify-self: stretch; }
/* A TABLE TYPED INTO A RUN OF MARKDOWN GETS THE SAME ANSWER AS A STORED ONE, and until 29 August
   2026 it got the same fault instead. The min-width said min(var(--read-w), 100%); --read-w is
   var(--reading-in-box), which is 100%, so the min-width and the max-width were both the box and
   fit-content never bound. Measured in Chromium at 1440 on 29 August 2026 on one report:
   six tables typed into text blocks, all six drawn at 1164px, and one of them wants 896.48px.

   THE FLOOR IS THE FLOOR OF A TABLE, WRITTEN HERE AND NOT LOOKED UP, because the selector has
   already said this is a table. A table typed into markdown is not a stored block, so it carries
   no data-least for the rule further up to read. LEAST_REM.panel is still the one place the number
   comes from.

   THE TWO KINDS OF TABLE MUST NOT DIVERGE. tests/the-band-beside-the-writing.test.ts is named for
   that: a stored table and a typed one are drawn by one answer. Fixing only the stored rule would
   have given them two. */
.sb-text > .sb-table, .sb-callout-body > .sb-table,
.sb-finding-detail > .sb-table, .sb-event-detail > .sb-table {
  width: fit-content; min-width: min(${String(LEAST_REM.panel)}rem, 100%); max-width: 100%;
}
/* AND IT SCROLLS INSIDE ITS OWN BOX RATHER THAN PUSHING THE PAGE SIDEWAYS. A grid item is
   min-width:auto, so the scrolling box inside a table would refuse to go under the table's
   min-content and the whole page would scroll instead. Measured at 390: a table wanting 396px in a
   366px column took the page to 473px of scroll width without this line. */
.sb-text > .sb-table > *, .sb-callout-body > .sb-table > *,
.sb-finding-detail > .sb-table > *, .sb-event-detail > .sb-table > * { min-width: 0; }

.sb-quiet { color: var(--text-2); }
/* WHERE A PARAGRAPH'S WIDTH IS DECIDED, AND WHY IT IS NOT ON THIS RULE ANY MORE.
   -----------------------------------------------------------------------------------------------
   A PARAGRAPH IS AS WIDE AS THE BOX IT SITS IN. Every box that holds a run of markdown lays its
   children out in one column that is the whole of that box — see the .sb-text rule above — so a
   paragraph's width is already decided before this rule is read. An Agent that wants a narrower
   measure asks for one on the part, and that arrives as --sb-measure further down.

   THIS RULE USED TO SAY max-width: var(--read-w) AS WELL, and that was a second answer to the same
   question. The two can disagree, which is this repository's recurring defect and is not a
   hypothetical here: the moment a callout was allowed to take the whole page, the box said one
   thing, the cap said another, and which one a reader saw depended on which box the paragraph
   happened to be in. Section 11 of the round eleven brief states the rule: a readable prose
   measure must not be one hard cap inside a component, the same everywhere, that leaves half the
   semantic region empty for good.

   WHAT IS LEFT HERE IS ABOUT TYPE AND NOT ABOUT WIDTH. line-break: strict for the same reason the
   rest of the app sets it — a Chinese line may not break before 。， 、 ) 」 or after ( 「 — and
   break-word so a 60-character path in a summary breaks instead of pushing the panel sideways at
   390. Neither is a measure; both are what happens when the measure is reached. */
.sb-p { margin:0; font-family: var(--font-read); font-size: var(--sb-read);
  line-height: var(--sb-lh); color: inherit;
  overflow-wrap: break-word; word-break: normal; line-break: strict; }
/* A HEADING IS CONTENT, SO IT IS NOT SET IN CAPITALS. The third-level heading here was uppercase
   at 14px, which is smaller than the 16px prose under it and against the type rule that capitals
   mark the furniture and never the thing you came to read. Measured on the round-four owner
   review, whose section headings are all at that level: every one of them was drawn shouting and
   smaller than its own paragraphs. */
.sb-h { margin:0; font-size: var(--sb-h3); line-height: var(--lh-tight); font-weight:650;
  color: var(--text); }
h4.sb-h { font-size: var(--sb-h4); }
h5.sb-h { font-size: var(--sb-h5); font-weight:700; color: var(--text-2); }
h6.sb-h { font-size: var(--sb-h6); font-weight:600; color: var(--text-3); }
/* A break between sections. It is the section change drawn as a line, so it is quiet and full
   width rather than ruled to the reading measure — a rule that stops mid-paragraph reads as a
   mistake. */
.sb-rule { margin:0; border:0; border-top: var(--border-w) solid var(--border); }
.sb-astyped { display:flex; flex-direction:column; gap:4px; }
/* A BULLET HAS A BULLET AND A NUMBERED ITEM HAS ITS NUMBER, WHICH IS NOT WHAT WAS ON THE SCREEN.
   styles.css turns the list marker off for every ul and ol in the app — right for the navigation
   and the rows that are lists only in the markup — and nothing here put it back, so a list
   somebody wrote in a record drew as indented paragraphs. On a numbered list that is content lost
   rather than decoration: the number is the only thing that says which step you are reading.
   Measured on the round-four owner review, whose "The rest of the list" drew seven bullets with no
   bullet. The marker sits in the gutter the measure is already widened by, so nothing moves. */
/* --lane-lead IS DECLARED HERE AND READ TWICE: by the padding on the next line, and by the rule
   that places a block with a lead. It used to be read by a max-width on this rule as well, and that
   cap is gone — a rule about lists cannot know whether the block it is in was given the whole page,
   so on a list inside a wide callout it was ruling the text to a measure nobody had asked for. */
.sb-list { --lane-lead: 1.35em;
  --read-w: var(--reading-in-box);
  margin:0; padding-left: var(--lane-lead);
  display:grid; grid-template-columns: minmax(0, 1fr);
  row-gap:2px; align-content:start;
  font-family: var(--font-read); font-size: var(--sb-read); line-height: var(--sb-lh);
  overflow-wrap: break-word;
  word-break: normal; line-break: strict; }
ul.sb-list { list-style: disc outside; }
ol.sb-list { list-style: decimal outside; }
/* A NUMBER AS ITS WRITER TYPED IT, hung in the gutter where the browser draws its own: see drawList. */
ol.sb-list-typed { list-style: none; }
ol.sb-list-typed > li { position: relative; }
ol.sb-list-typed > li::before { content: attr(data-typed); position: absolute; inset-inline-end: 100%;
  padding-inline-end: .35em; white-space: nowrap; }
/* A list inside a list, so the two levels are told apart by their markers as well as by the
   indent — an indent alone disappears the moment an item wraps. */
ul.sb-list ul.sb-list { list-style: circle outside; }
.sb-list .sb-list { margin-top:2px; }
/* A paragraph written inside a list item, after a blank line: a gap above it, as between paragraphs. */
.sb-li-p { margin: .5em 0 0; }
.sb-code { margin:0; padding: var(--pad); background: var(--panel-2);
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  overflow-x:auto; font-family: var(--font-mono); font-size: var(--fs-2);
  line-height: var(--lh-body); color: var(--text); }
/* THE CODE INSIDE THE BOX IS THE SIZE THE BOX WAS SET TO, WHICH IT WAS NOT. A code element with no
   size of its own falls back to the browser's fixed-width default rather than to the size on its
   parent, so the box was set to 14px and drew at 12.96 — under the 13px floor this project measures
   and holds every page to. Measured on a report at 1440 and at 390: one block of 188 words, all of
   it below the floor. It is inherit rather than a number so the token stays the one place a size is
   decided. */
.sb-code code, .sb-note code { font-size: inherit; }
.sb-code-fig { display:flex; flex-direction:column; gap:4px; }
/* ---------------------------------------------------------------------------------------
   A DIAGRAM FENCE: THE PICTURE, THEN THE FOLD HOLDING ITS OWN TEXT.
   The picture SCROLLS inside its box and says so: InReachMark draws the edge. It is not
   scaled down: a mermaid drawing carries its own words, and scaling puts them under the 13px floor
   this product holds every page to.
   --------------------------------------------------------------------------------------- */
.sb-diagram-fig { display:flex; flex-direction:column; gap:6px; margin:0; }
.sb-diagram { padding: var(--pad); background: var(--panel);
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  overflow: auto; }
/* The SVG is as wide as the drawing needs and the box is what holds it in. The width in pixels is
   written onto the element by atItsOwnSize in this file, because mermaid hands back width="100%"
   and a browser then fits the whole drawing — its words with it — into whatever box it is in. */
.sb-diagram svg { display:block; }
.sb-diagram-text > summary { font-size: var(--fs-1); color: var(--text-3); cursor:pointer;
  padding: 2px 0; }
.sb-diagram-text > summary:focus-visible { outline: var(--border-w) solid var(--focus);
  outline-offset: 2px; }
.sb-diagram-text[open] > summary { margin-bottom: 4px; }
/* The parser's own words when it refused the text. The box beneath still holds the characters. */
.sb-diagram-refused { margin:0; display:flex; flex-wrap:wrap; gap:6px; align-items:baseline;
  padding: var(--pad); border: var(--border-w) solid var(--st-failed-line);
  border-radius: var(--radius-sm); background: var(--st-failed-bg); color: var(--st-failed); }
.sb-diagram-refused-what { font-weight:600; }
.sb-diagram-refused-said { font-family: var(--font-mono); font-size: var(--fs-2);
  color: var(--text); }
.sb-code-lang { font-size: var(--fs-1); font-family: var(--font-mono); color: var(--text-3);
  text-transform:uppercase; letter-spacing:.05em; }
/* Inline code, a link, a link that is not a web address and the note where an image is not
   are drawn by src/shared/inline.ts, and their rules come from INLINE_CSS beside this string.
   Four rules used to be repeated here under sb- names with identical declarations. */

/* --lane-lead IS WHAT THE BOX DRAWS IN FRONT OF AND BEHIND THE TEXT, so the sentence inside a
   finding is the same length as the sentence in the paragraph above it. It was not declared here
   before, and the finding was therefore one reading measure wide INCLUDING its padding, which made
   its lines shorter than every other line on the page. */
.sb-finding { --lane-lead: calc(var(--rail) + var(--pad) * 2);
  --read-w: var(--reading-in-box);
  display:grid; grid-template-columns: minmax(0, 1fr);
  row-gap:6px; align-content:start; justify-items:start;
  padding: var(--pad); border-radius: var(--sb-box); background: var(--panel-2);
  border-left: var(--rail) solid var(--border-strong); }
.sb-finding[data-state="failed"], .sb-finding[data-state="blocked"] {
  background: var(--st-failed-row); border-left-color: var(--st-failed-line); }
.sb-finding[data-state="done"] { background: var(--st-done-row);
  border-left-color: var(--st-done-line); }
.sb-finding-text { margin:0; font-family: var(--font-read); font-size: var(--fs-4);
  line-height: var(--lh-body); color: var(--text); }
.sb-finding-detail { font-size: var(--fs-2); color: var(--text-2); }

.sb-metrics { display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--sb-gut); margin:0; }
.sb-metric { display:flex; flex-direction:column; gap:2px; align-items:flex-start;
  padding: var(--pad); background: var(--panel-2); border: var(--border-w) solid var(--border);
  border-radius: var(--sb-box); }
.sb-metric dt { font-size: var(--fs-1); color: var(--text-3); }
.sb-metric dd { margin:0; display:flex; align-items:baseline; gap:4px; }
.sb-metric-value { font-family: var(--font-mono); font-size: var(--fs-5); font-weight:600;
  color: var(--text); font-variant-numeric: tabular-nums; }
.sb-metric-unit { font-size: var(--fs-2); color: var(--text-2); }
.sb-metric-note { margin:0; font-size: var(--fs-1); color: var(--text-3);
  line-height: var(--lh-body); }

.sb-chart { display:flex; flex-direction:column; gap:6px; background: var(--panel);
  border: var(--border-w) solid var(--border); border-radius: var(--sb-box); padding: var(--pad); }

.sb-math { display:flex; flex-direction:column; gap:2px; }
/* A MATHS BLOCK SITS CENTRED IN ITS COLUMN, as a display inside a paragraph does. It was as wide
   as its formula and started at the left, so one formula sat in two places on one page by how it
   was written. It keeps the width the measured rule above gives it, its least width and its scroll
   across; only its place in the column moves. tests/a-plans-words-draw-their-maths.test.ts holds
   the two centres together at 1440 and 390. */
.sb-reads > .sb-math[data-fit="measured"] { justify-self: center; }
/* A caption belongs to the figure above it, so it takes the figure's width. Capping it at the
   reading measure made a 512px ribbon under a 773px plot, which is the "hard-wrapped" look. */
.sb-math figcaption, .sb-image figcaption, .sb-quote figcaption, .sb-code-fig figcaption,
.sb-chart figcaption { font-size: var(--fs-1); color: var(--text-3);
  line-height: var(--lh-body); }

.sb-image { display:flex; flex-direction:column; gap:6px; }
.sb-image img { display:block; max-width:100%; height:auto; border-radius: var(--radius);
  border: var(--border-w) solid var(--border); background: var(--panel-2); }
.sb-image-stand { display:flex; flex-direction:column; gap:4px; padding: var(--pad-lg);
  background: var(--panel-2); border: var(--border-w) dashed var(--border-strong);
  border-radius: var(--radius); color: var(--text-2); font-size: var(--fs-2);
  line-height: var(--lh-body); }
/* The reason there is no picture: Mole Office talking, inside a box that is already its own component.
   It fills the stand rather than ruling a narrower column inside it. */
/* A REFUSAL NAMES A PATH AND AN ENVIRONMENT VARIABLE, AND NEITHER OF THOSE HAS A SPACE IN IT.
   Measured on 29 August 2026: the sentence Mole Office says when a preview root does not cover a
   file wanted 292px on one line in a 130px box, because overflow-wrap was normal here while it is
   break-word on every other paragraph in a report. It is anywhere rather than break-word for the
   same reason .sb-path code below is: it also lowers the smallest width the box will admit to
   wanting, which is what a flex part asks it. A composition is the first thing in this product that
   makes a box this narrow, so this rule is where the fault first showed; it was reachable before,
   in a three-across grid cell, and nobody had put a path in one. */
.sb-image-stand p { margin:0; overflow-wrap: anywhere; }
.sb-image-alt { color: var(--text-3); font-style: italic; }
/* A PICTURE THE PERSON'S OWN CHOICE HAS NOT LOADED. Criterion U5. The edge is solid because nothing
   is uncertain about this state: which choice is in force is known and the file is not being fetched.
   The press is the one thing on it to act on, so it is drawn at the row's touch height. */
.sb-image-held { border-style: solid; }
.sb-image-held .sb-image-size { color: var(--text-3); }
.sb-image-press { align-self:flex-start; min-height: var(--row-h); padding:3px 10px;
  font-family: var(--font-ui); font-size: var(--fs-1); color: var(--text);
  background: var(--panel); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); cursor:pointer; }
.sb-image-press:hover { background: var(--hover); }
.sb-image-press:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
/* The non-text channel between "nobody has looked yet" and "here is the answer". The stand is
   dashed while nothing has been established and closes to a solid edge once something definite
   is known, whichever way it went. This is local to a picture that is not there: it is not the
   app-wide dashed-means-inferred rule, which lives on chips in ui.tsx and is not spent here. */
.sb-image-stand[data-preview="missing"], .sb-image-stand[data-preview="refused"],
.sb-image-stand[data-preview="unreachable"], .sb-image-stand[data-preview="undecodable"],
.sb-image-stand[data-preview="browser-refused"] { border-style: solid; }
.sb-image-tag { font-size: var(--fs-1); font-weight:700; text-transform:uppercase;
  letter-spacing:.05em; color: var(--text-3); }

.sb-path { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.sb-path code { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-2);
  background: var(--panel-2); border:1px solid var(--border); border-radius: var(--radius-sm);
  padding:2px 5px; overflow-wrap:anywhere; user-select:all; }
/* min-height is --row-h rather than a number, because tokens.css raises --row-h to 44px below
   480px. Sized that way the button meets the touch-target floor on a phone without this file
   owning a second opinion about what a phone is. */
.sb-copy { font-family: var(--font-ui); font-size: var(--fs-1); color: var(--text-2);
  background: var(--panel); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); padding:3px 10px; min-height: var(--row-h);
  cursor:pointer; }
.sb-copy:hover { color: var(--text); border-color: var(--text-3); }
.sb-copy:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
.sb-copy-note { font-size: var(--fs-1); color: var(--st-failed); }
.sb-pathblock { display:flex; flex-direction:column; gap:4px; }
.sb-pathblock video { display:block; max-width:100%; height:auto; border-radius: var(--radius); }

/* A FILE A REPORT CARRIES. Criterion R3. It is drawn with the weight of something a reader has to
   notice: the name and the size are the proof that the whole file is here, and the address is what
   they came for. */
.sb-file { display:flex; flex-direction:column; gap:6px; }
.sb-file figcaption { font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-body); }
.sb-file-facts { margin:0; display:flex; flex-wrap:wrap; gap: 4px 18px; }
.sb-file-facts > div { display:flex; gap:6px; align-items:baseline; min-width:0; }
.sb-file-facts dt { font-size: var(--fs-1); color: var(--text-3); text-transform:uppercase;
  letter-spacing:.05em; }
.sb-file-facts dd { margin:0; font-size: var(--fs-2); color: var(--text); overflow-wrap:anywhere;
  user-select:text; }
.sb-file-hash { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-2); }
/* A picture file's small picture, beside its name and its open press. Under
   a narrow column the two stack, picture first. */
.sb-file-beside { display:flex; flex-wrap:wrap; gap: var(--pad) 18px; align-items:flex-start; }
.sb-file-beside > .sb-file-fetch { flex: 1 1 240px; min-width:0; }
.sb-file-preview { flex: 0 0 auto; width: 160px; max-width:100%; }
.sb-file-preview img { width:100%; max-height:160px; object-fit:contain; }
.sb-file-path { font-family: var(--font-mono); font-size: var(--fs-1);
  color: var(--text-2); overflow-wrap:anywhere; user-select:all; }
.sb-file-fetch { display:flex; flex-direction:column; gap:6px; padding: var(--pad-lg);
  background: var(--panel-2); border: var(--border-w) solid var(--border); border-radius: var(--sb-box); }
.sb-file-address { margin:0; display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.sb-file-open, .sb-file-save, .sb-file-show, .sb-video-save, .sb-picture-save { font-size: var(--fs-1); font-weight:600; color: var(--link, var(--text));
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  padding: 3px 10px; min-height: var(--row-h); display:inline-flex; align-items:center;
  text-decoration:none; }
.sb-file-show { font-family: inherit; background: var(--panel-2); cursor: pointer; }
.sb-file-open:hover, .sb-file-save:hover, .sb-file-show:hover, .sb-video-save:hover, .sb-picture-save:hover { background: var(--hover); }
.sb-file-open:focus-visible, .sb-file-save:focus-visible, .sb-file-show:focus-visible, .sb-video-save:focus-visible, .sb-picture-save:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
.sb-video-save, .sb-picture-save { align-self:flex-start; }
/* THE FRAME AN ATTACHED HTML FILE IS DRAWN IN. It is as wide as the report's reading column, and
   on a telephone it takes the page's own padding too, so a page fills the window. It is as tall as
   a reader can use on a desk and keeps a workable height on a telephone. */
.sb-reads > .sb-file[data-fit="measured"]:has(.sb-file-frame) { width: 100%; }
.sb-file-frame { display:block; width:auto; height:clamp(420px, 70vh, 860px);
  margin-inline: calc(-1 * (var(--pad-lg) + var(--border-w)));
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--surface-1); }
@media (max-width: 480px) {
  .sb-file-frame { margin-inline: calc(-1 * (var(--pad-lg) + var(--border-w) + var(--pad))); }
}

/* A TEST WORLD IN A HANDBACK. Criterion C31. It is drawn with weight because it is the one block
   that asks the reader to get up and do something: open it and decide whether what is in it is
   what they asked for. Chapter 6's sixth rule. */
.sb-world {
  display:flex; flex-direction:column; gap:6px;
  border:1px solid var(--border); border-radius: var(--radius);
  padding: var(--pad-lg); background: var(--surface-1);
}
.sb-world-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; }
.sb-world-addresses { margin: 0.5rem 0; }
.sb-world-addresses div { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.sb-world-addresses dt { font-weight: 600; }
.sb-world-addresses dd { margin: 0; overflow-wrap: anywhere; }
.sb-world-label { font-size: var(--fs-2); font-weight:600; color: var(--text); }
.sb-world-state { font-size: var(--fs-1); color: var(--text-2); }
.sb-world-state[data-up='up'] { color: var(--ok-text, var(--text)); font-weight:600; }
.sb-world-state[data-up='gone'] { color: var(--text-2); }
.sb-world-why, .sb-world-api { margin:0; font-size: var(--fs-1); color: var(--text-2); line-height:1.5; }
.sb-world-act { margin:0; display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; }
.sb-world-open {
  font-size: var(--fs-1); font-weight:600; color: var(--link, var(--text));
  border:1px solid var(--border-strong); border-radius: var(--radius); padding: 4px 10px; text-decoration:none;
}
.sb-world-where { font-size: var(--fs-1); color: var(--text-2); word-break: break-all; }
.sb-path-head { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.sb-path-label { font-size: var(--fs-2); font-weight:600; color: var(--text); }
.sb-path-kind { font-size: var(--fs-1); font-family: var(--font-mono); color: var(--text-3);
  border:1px solid var(--border); border-radius: var(--radius-sm); padding:0 5px; }
.sb-path-machine { font-size: var(--fs-1); color: var(--text-3); }

.sb-table { display:flex; flex-direction:column; gap:6px; }
.sb-scroll { overflow-x:auto; border: var(--border-w) solid var(--border);
  border-radius: var(--sb-box); }
.sb-table table { border-collapse: collapse; width:100%; font-size: var(--fs-2);
  line-height: var(--lh-body); }
.sb-table caption { caption-side: bottom; text-align:left; padding:6px var(--pad);
  font-size: var(--fs-1); color: var(--text-3); }
.sb-table th, .sb-table td { text-align:left; padding: var(--sb-cell-y) var(--pad); height: var(--row-h);
  border-bottom:1px solid var(--border); vertical-align: top; }
/* A cell is something to read and to quote, so the words in it stay selectable however the row
   behaves. A table a person cannot select three words out of is a picture of a table. */
.sb-table th, .sb-table td { user-select: text; }
/* A COLUMN TITLE WRAPS. It was white-space: nowrap, and a title that cannot wrap sets the whole
   table's minimum width: every table in the owner's round-eight report needed 89px more than it was
   given, and every one of them scrolled by exactly 89px whatever the screen was. Nothing said so,
   because the box that scrolled had no scrollbar to speak of and no words at all. The titles wrap
   now, so a table's minimum is what its CONTENT needs rather than what its longest heading is. */
.sb-table thead th { background: var(--panel-2); color: var(--text-2); font-weight:600;
  position:relative; padding:0; }
.sb-table tbody tr:last-child td { border-bottom:0; }
.sb-table tbody tr[data-state="failed"] td, .sb-table tbody tr[data-state="blocked"] td {
  background: var(--st-failed-row); }
.sb-table .sb-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  white-space:nowrap; }
/* A heading with no button in it (the state column's) takes the padding the button gives the others. */
.sb-table thead th.sb-head-plain { padding: 6px var(--pad); }
/* ONE SHORT WORD IS NOT CUT. At 390 a cell broke "1923-B" after its hyphen and a two-character
   Chinese word between its two characters. See oneShortWord. */
.sb-table .sb-whole { white-space:nowrap; }

/* SORTING IS A CONTROL AND IT LOOKS LIKE ONE AT REST. The two-headed arrow is drawn on every
   sortable heading whether or not anybody is pointing at it, because a control that only appears
   on hover is invisible to the person deciding whether this product does the thing they want. It
   is quiet ink rather than the accent: which column you sorted by is not a quantity and not a
   fault, and the accent has two jobs and this is neither. */
.sb-sort { display:flex; align-items:center; justify-content:inherit; gap:6px; width:100%;
  min-height: var(--row-h); padding:6px var(--pad); background:none; border:0;
  font: inherit; color: inherit; text-align: inherit; cursor:pointer; }
.sb-sort:hover { color: var(--text); background: var(--panel); }
.sb-sort:focus-visible { outline:2px solid var(--focus); outline-offset:-2px; }
.sb-sort-mark { font-size: var(--fs-1); color: var(--text-3); }
.sb-sort-mark[data-dir="up"], .sb-sort-mark[data-dir="down"] { color: var(--text); }
/* The grabber for a column edge. It sits on the border that is already drawn there, so at rest it
   is the line a reader already sees rather than one more piece of furniture. */
/* THE GRABBER SAT 3px OUTSIDE THE LAST CELL, so every table in the product reported a scroll width
   3px larger than its client width — every table said it had something off screen, and what it had
   was this handle. It sits inside the cell now, with its right edge on the line it drags. The press
   area is still 7px wide; it moved 3px left, and it no longer sticks out of the table. */
.sb-grab { position:absolute; top:0; right:0; width:7px; height:100%; cursor: col-resize;
  touch-action:none; }
.sb-grab:hover { background: var(--border-strong); }

/* THE FIND BOX ONLY APPEARS ON A TABLE BIG ENOUGH TO NEED IT — see ROWS_WORTH_SEARCHING. It wraps
   at a narrow width rather than pushing the table sideways. */
.sb-table-tools { display:flex; flex-wrap:wrap; align-items:center; gap: var(--gut); }
.sb-find { display:flex; align-items:center; gap:6px; font-size: var(--fs-1);
  color: var(--text-3); }
.sb-find input { font-family: var(--font-ui); font-size: var(--fs-2); color: var(--text);
  background: var(--panel); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); padding:3px 8px; min-height: var(--row-h); min-width:0;
  max-width: 14rem; }
.sb-find input:focus-visible { outline:2px solid var(--focus); outline-offset:1px; }
.sb-table-count { font-size: var(--fs-1); color: var(--text-3); }
.sb-table-none { margin:0; font-size: var(--fs-2); color: var(--text-2); }

/* A section is a run of blocks with a name on it. The rail says where it starts and stops without
   a box, which would nest a second border inside the panel the report already sits in. */
.sb-section { display:flex; flex-direction:column; gap: var(--pad); }
/* THE LINE UNDER A SECTION HEADING IS A TOKEN, AND IT IS ZERO BY DEFAULT. A profile that wants a
   ruled document raises it; nothing else in this file draws a rule under a heading. At 0px the
   border draws nothing at all, so the default costs a reader no ink. */
.sb-section-title { margin:0; padding-bottom: calc(var(--sb-rule) * 3);
  border-bottom: var(--sb-rule) solid var(--border); }
/* A SECTION'S BODY IS A READING GRID AND IT WAS NOT ONE. This rule said display:flex, it comes
   after .sb-reads in this stylesheet and carries the same weight, so it won — and every block inside
   every section on every report was laid out by a flex column that has no tracks at all. Measured on
   one report at 1440 on 27 August 2026: 24 findings inside sections drew at 1164px each
   while carrying the attribute that asks for the reading column. The grid is what sets the gap now,
   through row-gap, so there is nothing left here to say. */
.sb-section-body { row-gap: var(--sb-gap); }

/* THE COLUMNS OF A COMPARISON ARE DRAWN BY THE COMPOSITION RULES BELOW, AND THERE IS NOTHING LEFT
   TO SAY HERE.
   -----------------------------------------------------------------------------------------------
   THIS USED TO BE A SECOND MECHANISM FOR THE SAME THING, and one of the two was kept on 28 August 2026.
   It was a grid of equal tracks that switched from one track to two, three or four when its box
   passed 30, 45 or 60rem, with those same three widths written a second time as a custom property
   so the block could take the width it was about to ask for. Both sets of three are gone.

   WHY, MEASURED RATHER THAN ARGUED. The threshold did not ask what a column HELD, so two columns
   of writing went across whenever their box passed 30rem, which is 480px — two 231px columns of
   prose, and the rule's own comment said two 180px columns are not a comparison. On report
   ulbs6FHMndo2 at 1440 on 29 August 2026, a two-column block inside a 573px part of a composition
   drew columns of 277.5px each. Under the composition rules below it stacks there, because two
   columns of writing need 20rem each and 40rem plus a gutter does not fit in 573px.

   WHAT REPLACES BOTH: .sb-columns is a .sb-beside row whose parts are equal, and .sb-column is a
   .sb-beside-part. The floor of each column is what the column holds, answered by leastNeededBy
   in src/shared/regions.ts, which is the same question a composition's parts are asked. Three
   pictures still go across at 1440 — measured, 376px each — because three picture floors and the
   two gutters between them fit inside an 1164px report body. The floor itself is in LEAST_REM
   and is not written here; this sentence named it as 10rem until 29 August 2026, when it moved.

   .sb-grid IS NOT FOLDED IN. A wrapping gallery is a different arrangement and
   repeat(auto-fit, minmax(...)) is the right tool for it.

   INSIDE A GRID CELL THE READING MEASURE IS THE CELL, NOT THE PAGE. A 34rem measure in a
   half-width cell would rule the text to a width the cell does not have. A column gets the same
   declaration from the composition rules below, so it is not named here twice. */
.sb-grid > * { --read-w: var(--reading-in-box); }

/* PARTS OF ONE THING, SEEN BESIDE EACH OTHER, AND HOW MUCH ROOM EACH ONE GETS.
   -----------------------------------------------------------------------------------------------
   THIS IS THE ONLY WAY THIS PRODUCT PUTS BLOCKS SIDE BY SIDE. A "beside" block is a row whose parts
   may each be worth a different amount; a "columns" block is a row whose columns are all worth the
   same. That is the whole difference between them, so they are one set of rules and not two. The
   selectors read .sb-beside / .sb-beside-part for the first and .sb-columns / .sb-column for the
   second, and every declaration below applies to both.

   THREE DECLARATIONS DO ALL FOUR JOBS THE LAYOUT HAS, and not one of them writes a
   number this file decided:

     flex-grow: var(--share)      divides the row at exactly the ratio that was asked for.
     min-width: min(var(--least), 100%)
                                  the smallest this part may be drawn at. When a part's share would
                                  put it under this, the browser freezes it here and its siblings
                                  absorb the rest IN PROPORTION — that is the ratio being adapted,
                                  continuously, at every pixel, by the flexbox algorithm rather than
                                  by a script that would have to measure something. The min() is so
                                  a floor can never come out wider than the box it is in.
     flex-basis: calc((var(--row-least) - 100%) * 999)
                                  --row-least is the width below which the floors plus the gaps stop
                                  fitting. Above it the subtraction is negative, an out-of-range
                                  calc clamps to the property's minimum, every basis is 0, and grow
                                  divides the whole row. Below it every basis exceeds the line AT THE
                                  SAME WIDTH, because it is the SAME expression on every part, so the
                                  parts go one under another together rather than two across and one
                                  below.

   100% IS THIS COMPOSITION'S OWN BOX. There is no container query here, so a composition inside a
   section, inside another composition, inside a grid cell measures itself and nothing else.

   THE THRESHOLD IS NOT WRITTEN TWICE. The rem come from LEAST_REM in src/shared/beside.ts, which
   this file interpolates, and the gutter never leaves CSS — it is var(--sb-gut), which is 6, 10, 12,
   16 or 18 pixels depending on density and profile, so any number worked out from it elsewhere would
   be wrong somewhere. The renderer emits the WORD for what a part holds and never a length.

   EVERY CUSTOM PROPERTY THESE RULES READ IS ALSO DECLARED IN THEM. Custom properties inherit, so a
   composition inside a part would otherwise silently take its parent's threshold, its parent's
   floor and its parent's share.

   --read-w IS THE EXCEPTION AND IT NOW FEEDS NOTHING. It is declared on a part to stop an inner
   part inheriting an outer one's, and since 29 August 2026 no rule that could apply inside a part
   reads it: the only two readers are min-widths on a table, and both of those tables are children
   of a box that declares --read-w itself. It is left here rather than removed because removing it
   is a change to these rules, and the change that emptied it was about the reading grid. */
:is(.sb-beside, .sb-columns) {
  --row-least: calc(${String(LEAST_REM.sentence * 2)}rem + 1 * var(--sb-gut));
  display: flex; flex-wrap: wrap; gap: var(--sb-gap) var(--sb-gut); align-items: start;
}
/* NOBODY LOOKED IS NOT THE SAME AS NOTHING THERE. A part whose content was never classified — a
   settings preview, a record whose blocks carry no stored ids — asks for the WIDEST floor, so it
   stacks early rather than being drawn too narrow to read. The renderer answers the same way for
   the same case, so the two cannot disagree.

   --share IS 1 HERE AND THE COLUMNS RENDERER NEVER OVERRIDES IT. That is what makes the columns of
   a comparison equal: equal is the default, and only a "beside" part writes a share of its own.
   --sb-measure IS "none" HERE FOR THE SAME REASON IT IS RESET ON A NESTED PART: a columns block
   inside a part whose writing was asked to read narrow must not inherit that maximum, because the
   maximum was stated about that part's own writing and not about a comparison drawn inside it. */
:is(.sb-beside-part, .sb-column) {
  --least: ${String(LEAST_REM.sentence)}rem;
  --share: 1;
  --sb-measure: none;
  --read-w: var(--reading-in-box);
  flex-grow: var(--share); flex-shrink: 1;
  flex-basis: calc((var(--row-least) - 100%) * 999);
  min-width: min(var(--least), 100%);
  display: flex; flex-direction: column; gap: var(--sb-gap);
  container-type: inline-size; container-name: blocks;
}
:is(.sb-beside-part, .sb-column)[data-least="panel"]  { --least: ${String(LEAST_REM.panel)}rem; }
:is(.sb-beside-part, .sb-column)[data-least="figure"] { --least: ${String(LEAST_REM.figure)}rem; }
/* THE READING MEASURE AN AGENT ASKED FOR, AND THE ONE PLACE IT IS APPLIED.
   -----------------------------------------------------------------------------------------------
   IT IS ON THE WRITING AND NEVER ON A BOX THAT HOLDS THE WRITING. data-writing is written by the
   renderer on an element whose whole content is words — a paragraph, a heading, a bullet, a quoted
   line, a caption, an attribution. See the comment on WRITING further up this file for the list
   and for why the renderer is what decides it. Everything else keeps the whole of its width: the
   part of a composition, the block, and any block inside that block.

   WHY IT MAY NOT BE PUT ON THE BOX, IN ONE MEASUREMENT. This rule read
   ".sb-block[data-least=sentence]" until 29 August 2026, so a stated measure narrowed the block
   itself. data-least is the region tree's answer to how NARROW a block may be drawn, and
   "sentence" means the block holds writing SOMEWHERE — not that everything in it is writing. So a
   section block that stated a measure was drawn at 416px inside its 1164px region, and the table
   stored inside it was drawn 1164px wide, 748px of it outside the section's own box. The same rule
   did the same thing to a text block whose prose holds a table. The owner's sentence is that a
   measure "does not reduce the parent Semantic Region's ownership", and
   design/problem-01/COMPOSITION-DESIGN-AMENDMENT.md section 3 prints the same rule in bold: a
   preset must never be implemented by shrinking the part.

   ONE RULE FOR A BLOCK AND FOR A PART OF A COMPOSITION, WHICH IS WHY THE SELECTOR NAMES NEITHER.
   A part sets --sb-measure for everything inside it; a block sets it for everything inside itself;
   a heading block, whose region and whose writing are the same box, sets it on itself and is
   marked as writing. Each of those is the same sentence — the writing under this box reads no
   wider than this — and there is one implementation of it.

   WHAT --sb-measure HOLDS is the answer measureMaxWidth in src/shared/beside.ts gives, which is
   either a preset's length or the stored ratio of the column the writing stands in. It is "none"
   on .sb at the top of this file, so writing nobody stated a measure on is bounded by nothing; it
   is "none" again on a part, so that a part starts again rather than inheriting an outer part's.
   The nearest statement wins, because a block's own inline value beats the one it inherits from
   its part. */
[data-writing] { max-width: var(--sb-measure); }
/* A QUOTED LINE IS MEASURED ON ITS WORDS AND NOT ON ITS RAIL. Its box holds a rail and a lead in
   front of the words, so the rule above left its words one lead and one rail narrower than the
   paragraph beside it: two column widths in one block, which the lane-lead rule exists to stop.
   The measure is widened here by exactly what the box draws in front of the
   words, and never past the column. Where no measure is stated --sb-measure is none, the sum is not
   a length, and the browser treats max-width as unset, which is none: the line keeps the whole of
   its column as before. */
.sb-quoted[data-writing] { max-width: min(100%, calc(var(--sb-measure) + var(--lane-lead) + var(--rail))); }

.sb-quote { --lane-lead: var(--pad-lg);
  --read-w: var(--reading-in-box);
  display:grid; grid-template-columns: minmax(0, 1fr);
  row-gap:4px; align-content:start; padding-left: var(--lane-lead);
  border-left: var(--rail) solid var(--border-strong); }
.sb-quote blockquote { margin:0; font-family: var(--font-read); font-size: var(--fs-4);
  line-height: var(--lh-read); color: var(--text); }
.sb-quote-dash { color: var(--text-3); }
/* A quoted line inside prose -- one written with a leading angle bracket. The same rail and the
   same reading face as the quote BLOCK, one step quieter, because a quote block also carries who
   said it and this one cannot. */
.sb-quoted { --lane-lead: var(--pad-lg);
  margin:0; padding-left: var(--lane-lead); font-family: var(--font-read);
  font-size: var(--sb-read); line-height: var(--sb-lh); color: var(--text-2);
  border-left: var(--rail) solid var(--border-strong); }

/* AN ASIDE THAT SAYS WHY IT IS SET APART. The word is drawn at all times; the colour and the rail
   are the second and third channels, never the only one. A warning takes the failed rail because a
   reader has already learnt in this product that that edge means "this one will cost you", and
   spending a new colour on it would be a fourth thing to learn. */
.sb-callout { --lane-lead: var(--pad-lg);
  display:flex; flex-direction:column; gap:4px; padding: var(--pad) var(--lane-lead);
  background: var(--panel-2); border-radius: var(--sb-box);
  border-left: var(--rail) solid var(--border-strong); }
.sb-callout[data-tone="warning"] { background: var(--st-failed-row);
  border-left-color: var(--st-failed-line); }
.sb-callout-head { margin:0; display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; }
.sb-callout-word { font-size: var(--fs-1); font-weight:700; text-transform:uppercase;
  letter-spacing:.05em; color: var(--text-3); }
.sb-callout[data-tone="warning"] .sb-callout-word { color: var(--st-failed); }
.sb-callout-title { font-size: var(--sb-read); font-weight:650; color: var(--text); }
/* The gap and the layout are the reading grid's, up beside .sb-text, because this box holds the
   same run of markdown a text block does. It was a flex column with no tracks. */

/* NAMED VALUES. Two columns that stay two columns until the name and the value stop fitting side
   by side, at which point the value drops under its name rather than being cut. The name is quiet
   and the value is the ink, because the value is what somebody came to look up. */
/* THE HIDDEN OVERFLOW IS GONE, AND WHAT IT WAS DOING IS SAID RATHER THAN LEFT IN A SCREENSHOT.
   overflow: hidden was here to round the last row's corners against the box's own border. It also
   silently cut anything wider than the box, which is the quiet half of the same defect as a box
   that scrolls without saying so — no scrollbar, no announcement, nothing on the screen at all. The
   radius moved onto the last row, which is what it was for. */
.sb-kv { margin:0; display:flex; flex-direction:column; gap:0;
  border: var(--border-w) solid var(--border); border-radius: var(--sb-box); }
.sb-kv-row { display:grid; grid-template-columns: minmax(8rem, 14rem) 1fr; gap: var(--pad);
  padding: var(--sb-cell-y) var(--pad); border-bottom:1px solid var(--border); }
.sb-kv-row:last-child { border-bottom:0;
  border-end-start-radius: var(--sb-box); border-end-end-radius: var(--sb-box); }
.sb-kv dt { font-size: var(--fs-2); color: var(--text-3); }
.sb-kv dd { margin:0; font-size: var(--fs-2); color: var(--text); overflow-wrap:break-word; }
@container blocks (max-width: 32rem) {
  .sb-kv-row { grid-template-columns: 1fr; gap:0; }
}

/* A LIST WHERE EVERY ITEM SAYS WHERE IT STANDS. The state is the chip the rest of the app draws,
   so a checklist in a report reads the same as one in a module. No bullet: the chip is the marker,
   and two markers on one line is one too many. */
.sb-checklist { margin:0; padding:0; list-style:none; display:flex; flex-direction:column;
  gap: var(--pad); }
/* THE STATE SITS IN A GUTTER OF ITS OWN WIDTH, so every item's words start at the same place. Sized
   to the chip rather than to the content: with an automatic column each item is its own grid, so
   the five state words gave one checklist four different left edges — measured at 341, 341, 362 and
   339 in Chromium before this line. 6rem holds the widest of them (BLOCKED, 92px) and the list of
   states is closed, so no longer one can arrive. */
.sb-check { display:grid; grid-template-columns: 6rem 1fr; gap:8px; align-items:baseline; }
/* The state keeps its own width inside that gutter rather than being stretched across it: a chip
   pulled out to 96px reads as a button. Only the first child — the words take the rest of the row
   and have to be free to wrap in it. */
.sb-check > :first-child { justify-self:start; }
.sb-check-text { font-family: var(--font-read); font-size: var(--sb-read);
  line-height: var(--sb-lh); color: var(--text); }
.sb-check[data-state="done"] .sb-check-text { color: var(--text-2); }
.sb-check-note { grid-column:2; margin:0; font-size: var(--fs-1); color: var(--text-3);
  line-height: var(--lh-body); }

/* WHAT HAPPENED, IN ORDER. The rail is the passing of time and the marker is one event on it. The
   "when" is set in the fixed-width face and never wraps mid-word, because a date broken across two
   lines stops reading as a date. */
.sb-timeline { margin:0; padding:0; list-style:none; display:flex; flex-direction:column;
  gap: var(--pad); }
.sb-event { display:grid; grid-template-columns: minmax(6rem, 10rem) 1fr; gap: var(--pad);
  padding-left: var(--pad); border-left: var(--rail) solid var(--border); position:relative; }
.sb-event::before { content:""; position:absolute; left: calc(var(--rail) * -1 - 3px); top:.45em;
  width:9px; height:9px; border-radius: var(--radius-pill); background: var(--border-strong); }
.sb-event[data-state="failed"]::before, .sb-event[data-state="blocked"]::before {
  background: var(--st-failed-line); }
.sb-event[data-state="done"]::before { background: var(--st-done-line); }
.sb-when { font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-3);
  overflow-wrap:break-word; }
.sb-event-body { display:flex; flex-direction:column; gap:4px; min-width:0; }
.sb-event-text { margin:0; display:flex; flex-wrap:wrap; align-items:baseline; gap:8px;
  font-family: var(--font-read); font-size: var(--sb-read); line-height: var(--sb-lh);
  color: var(--text); }
.sb-event-detail { font-size: var(--fs-2); color: var(--text-2); }
@container blocks (max-width: 32rem) {
  .sb-event { grid-template-columns: 1fr; gap:2px; }
}

/* MANY OF THE SAME KIND OF THING, ACROSS AND THEN DOWN. auto-fit with a floor rather than a fixed
   count, so a narrow screen puts fewer on a row instead of shrinking every one of them past
   readable. data-across caps how many go on a row where the writer asked for a cap. */
.sb-grid { display:grid; gap: var(--sb-gut);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); }
.sb-grid[data-across="2"] { grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
.sb-grid[data-across="3"] { grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); }
.sb-grid[data-across="4"] { grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); }
/* Inside a cell of a grid, --read-w is the cell and not the report, said by moving --read-w, up
   beside the same statement for a column. SINCE 29 AUGUST 2026 NOTHING READS IT HERE: --read-w is
   read by exactly two rules, both a min-width on a table, and both of those tables are children of
   a box that declares --read-w itself. This declaration and the matching one on a composition part
   now feed nothing. They are left in place rather than removed because removing them is a change to
   the composition rules, which this change does not touch; it is owed work and it is written down
   rather than done quietly. The three elements below carry a max-width of their own instead. */
.sb-grid .sb-h, .sb-grid .sb-finding-text, .sb-grid .sb-quote blockquote { max-width:100%; }
/* A grid item may be a block of code or a table, which are as wide as what is in them. Without this
   one of those makes its own cell wider than its share and pushes the row sideways; with it the
   cell keeps its share and the code scrolls inside its own box, which is what that box is for. */
.sb-grid > * { min-width:0; }

/* ONE SHOWN AND THE REST PUT AWAY. The tabs look like controls at rest — a row of them under a
   line, with the open one carrying the ink — because a control nobody can see is a control nobody
   knows is there, and what is behind these is not on the page until somebody presses one. */
.sb-tabs { display:flex; flex-direction:column; gap: var(--pad); }
.sb-tablist { display:flex; flex-wrap:wrap; gap:2px; border-bottom:1px solid var(--border); }
.sb-tab { font-family: var(--font-ui); font-size: var(--fs-2); color: var(--text-2);
  background:none; border:0; border-bottom: var(--rail) solid transparent; padding:6px var(--pad);
  min-height: var(--row-h); cursor:pointer; }
.sb-tab:hover { color: var(--text); }
.sb-tab[aria-selected="true"] { color: var(--text); font-weight:650;
  border-bottom-color: var(--text); }
.sb-tab:focus-visible { outline:2px solid var(--focus); outline-offset:-2px; }
/* THE SAME FAULT AS .sb-section-body, in the same stylesheet, on the panel under a tab. */
.sb-tabpanel { row-gap: var(--sb-gap); }

/* THE CONTROL A PERSON CHANGES THE READING STYLE WITH: a label, a select, and a question mark.
   NOTHING HERE DRAWS A SENTENCE AT REST. The span that used to sit beside the select held one of
   seven sentences at all times on every report page; the same words are now on the select's own
   title and inside the question mark, where all four can be compared in one press. */
.sb-style { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
/* A dropdown in this app is a form control and takes the width of the box it is in. This one is not
   in a box: it sits in a row beside its label and the sentence saying what it does, so it is sized
   to its own words. Left at full width it drew as a 1,000px bar across the top of the report and
   pushed both of those onto lines of their own. */
.sb-style .px-select { width:auto; min-width: 11rem; font-size: var(--fs-2); }
.sb-style-label { font-size: var(--fs-1); color: var(--text-3); }
.sb-style-select { display:inline-flex; min-width:0; }
/* The four styles side by side, behind the question mark. A table because it is a comparison:
   four names against four descriptions is exactly what a reader picking between them is doing. */
.sb-style-table { border-collapse: collapse; font-size: var(--fs-1); line-height: var(--lh-body);
  color: var(--text-2); }
.sb-style-table th { text-align:left; vertical-align:top; padding: 2px var(--pad) 2px 0;
  color: var(--text); font-weight:600; white-space:nowrap; }
.sb-style-table td { vertical-align:top; padding: 2px 0; }
/* The one a reader is on. A ring rather than a tint, so it survives the monochrome theme. */
.sb-style-table tr[data-chosen="yes"] th { box-shadow: inset 2px 0 0 var(--accent); padding-left: 6px; }
.sb-style-fault { flex-basis:100%; margin:0; font-size: var(--fs-1); color: var(--st-inferred);
  background: var(--st-inferred-row); border-left: var(--rail) solid var(--st-inferred-line);
  border-radius: var(--radius-sm); padding: 4px var(--pad); }

/* THE FORM WRITTEN FOR THE LENGTH BEING READ. One line, and it is the level's content. */
.sb-open { display:flex; flex-direction:column; gap: 6px; margin: 0 0 var(--pad-lg); }
/* THE COUNT GUARD'S MARK. A quiet note under the block it is about, not a warning: no colour from
   the alert family, no icon, and no border box. It is a child of the same grid as that block, so it
   takes the same column and the same width, and it is drawn and never pressed. */
.sb-countmark {
  margin: calc(var(--pad) * -0.5) 0 0;
  font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2);
  border-left: 2px solid var(--border); padding-left: var(--pad);
  user-select: none;
}

/* THE FORM IS THE LEVEL'S CONTENT, SO IT IS SET AS BODY TEXT AND NEVER AS A CAPTION.

   WHAT WAS WRONG, MEASURED AT READING LENGTH 1 ON 2 SEPTEMBER 2026. This line was the only writing
   on the page at that length, and it was drawn at the caption size, in the third text colour, in
   capitals, with a caption above it in the same size and colour -- while a box of 115 words of the
   report's own prose sat underneath it in full-size black type. A reader took the substrate for the
   content, which is exactly what the page had told them by its typography.

   SO NO READING LENGTH DRAWS THIS LINE AS A CAPTION. There is no uppercase and no third text colour
   in any rule here; the base rule below sets the reading colour and the reading line height, and the
   only thing a length changes is size and weight. A label is the report's NAME, so it takes the same
   lede as the title. Proved as text by tests/the-abstract-is-the-content.test.ts, which reads these
   rules out of SUMMARY_CSS -- there is no layout engine in the runner. */
.sb-open-line { margin:0; color: var(--text);
  font-size: var(--fs-2); line-height: var(--lh-body); }
.sb-open-line[${READING_LENGTH_ATTRIBUTE}="label"],
.sb-open-line[${READING_LENGTH_ATTRIBUTE}="title"] { font-size: var(--fs-4); font-weight:600; line-height: var(--lh-tight); }
.sb-open-line[${READING_LENGTH_ATTRIBUTE}="gist"] { font-size: var(--fs-3); line-height: var(--lh-body); }

/* THE REPORT'S PARTS, AT THE THREE READING LENGTHS THAT ARE WRITTEN BY PART.

   THE HEADING IS SET A LITTLE LARGER THAN THE WRITING AND NOTHING ELSE MARKS IT. That has been the
   rule since 2 September 2026: only rendered slightly larger.
   It is the same size at levels 4, 5 and 6, because it is the same sentence: a heading that changed
   size as the reader moved up the ladder would read as a different thing each time.

   AT LEVEL 4 THE PART IS THE HEADING ALONE, so the gap between parts is what separates them and
   there is no rule here that draws a line, a bullet or a number. A list of one-sentence summaries
   is a list because of the air around each one.

   THE PART IS THE BOX A PRESS LANDS ON, so it takes the reading measure of the column it is in and
   nothing narrows it. The dashed frame the mark layer draws is drawn round this element. */
.sb-parts { display:flex; flex-direction:column; gap: var(--pad-lg); margin: 0 0 var(--pad-lg); }
.sb-part { display:flex; flex-direction:column; gap: 6px; }
.sb-part-heading { margin:0; color: var(--text); font-size: var(--fs-3); font-weight:600;
  line-height: var(--lh-tight); }
.sb-part-text { margin:0; color: var(--text); font-size: var(--fs-2); line-height: var(--lh-body); }

/* NOBODY WROTE A SUMMARY OF THIS LENGTH, SAID IN THE PLACE THE SUMMARY WOULD HAVE BEEN.
   It is the loud tier of the one absence component, so the box, the colour and the weight are
   chosen there and not here. What is here is where it sits: in the reading column, with the same
   air under it that an opening line has. The same box carries the length whose title stands in for
   a summary nobody recorded the writing of. */
.sb-nosummary { margin: 0 0 var(--pad-lg); }

/* A REPORT BELOW FULL IS ONE WRITTEN FORM AND ITS FURNITURE, so the space in it closes up. The
   two rules that shrank a heading here went with the blocks on 2 September 2026: no block of the
   report is drawn below Full, so there is no heading here to shrink. */
.sb[${READING_LENGTH_ATTRIBUTE}]:not([${READING_LENGTH_ATTRIBUTE}="full"]) { --sb-gap: var(--pad); }

/* THE FOOT OF THE WRITING: how much it says, and whether the boxes are shown. Two controls about
   the same report, in one row, wrapping to two on a narrow screen rather than running off it. */
.sb-foot { display:flex; align-items:flex-end; justify-content:space-between; gap: var(--pad); flex-wrap:wrap;
  margin-top: var(--pad-lg); }
.sb-foot > .sb-level { flex: 0 0 auto; }
/* THE REGIONS BUTTON KEEPS OUT OF THE CORNER CHAT BUTTON'S COLUMN. The chat button is fixed to the
   window's bottom-right corner (.px-chat-circle in Chat.tsx), and this button sits at the right end of
   the foot, so at some scroll position the chat button covered it at every width (round 38, a
   review, point 4). This margin is that review's choice for this one button, not the general rule.
   The general rule is that no space needs to be left, covering is fine, because a person who cannot see something scrolls. It makes
   no exception for a button.
   --fab-room is the chat button's width and an inset either side (tokens.css), so the two never meet. */
.sb-foot > .sb-regions { margin-right: var(--fab-room); }

/* HOW MANY BLOCKS THIS READER IS NOT BEING SHOWN. It sits in the foot beside the length control,
   and on the plain branch it is the only thing in the foot. It is drawn as a quiet control rather
   than a warning: a marked block is a fold, not a fault, and the number is the whole safety of the
   mechanism — see the ForDevelopers component. min-height matches the length control so the two sit level. */
.sb-fordev {
  flex: 0 0 auto; display:inline-flex; align-items:center; gap: calc(var(--pad) / 2);
  min-height: 26px; padding: 0 var(--pad);
  border: var(--border-w) dashed var(--border-strong);
  border-radius: var(--radius-sm); background: transparent; color: var(--muted);
  font: inherit; font-size: var(--sb-small, 0.86em); cursor: pointer;
}
.sb-fordev:hover, .sb-fordev:focus-visible { color: var(--text); border-style: solid; }
.sb-fordev[data-revealed="1"] { color: var(--text); border-style: solid; }
.sb-fordev-said { cursor: default; }
.sb-fordev-arrow { font-size: 0.9em; }

/* THE MARK BESIDE A BLOCK THAT IS ONLY DRAWN BECAUSE OF WHO IS READING. Its own lane, like every
   other block mark, so it never changes the width of a report that has none. */
.sb-machinery {
  margin: 0; display:flex; align-items:baseline; gap: calc(var(--pad) / 2);
  color: var(--muted); font-size: var(--sb-small, 0.86em);
}
.sb-machinery-word {
  border: var(--border-w) dashed var(--border-strong); border-radius: var(--radius-sm);
  padding: 0 calc(var(--pad) / 2); white-space: nowrap;
}
.sb-machinery-tab { margin-inline-start: calc(var(--pad) / 2); font-size: 0.8em; }
/* ----------------------------------------------------------------------------------------------
   THE LEVEL CONTROL: a minus, a label, a plus, and the pictures button. Drawn above the writing
   and again at its foot, and the same in both places.

   ABOVE THE WRITING IT TAKES THE WHOLE GRID ROW, because the writing sits in a grid of lanes and a
   control in one lane would sit under the report's widest block rather than over the report.
   At the foot it takes only its own width, because the foot is a row with the developer count at
   its other end. */
.sb-level { display:inline-flex; align-items:center; gap: 6px; }
.sb-doc > .sb-level { grid-column: 1 / -1; padding-bottom: var(--pad); }
.sb-level-step, .sb-pictures {
  min-height: 26px; min-width: 26px; padding: 0 var(--pad);
  display:inline-flex; align-items:center; justify-content:center;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); background: var(--panel); color: var(--text);
  font-size: var(--fs-1); font-weight:600; cursor:pointer;
}
.sb-level-step:hover:enabled, .sb-pictures:hover { background: var(--hover); }
/* THE END OF THE LADDER, SAID BY THE BUTTON AND NOT BY A SENTENCE. It keeps its size when it is
   disabled, so reaching Full or Level 1 moves nothing on the page. */
.sb-level-step:disabled { color: var(--text-3); border-style: dashed; cursor: default; }
/* A FINGER'S SIZE ON A NARROW SCREEN (wave 13k round 30). The minus and the plus were 26px, which a
   finger misses on a phone, so below 40rem each press is at least 44px tall and wide, the floor
   tokens.css sets for a row. The pictures button and the developer count stand in the same row, so
   they take the same height and the row stays level. Nothing about what a press does changes. */
@media (max-width: 40rem) {
  .sb-level-step, .sb-pictures { min-height: 44px; min-width: 44px; }
  .sb-fordev { min-height: 44px; }
}
/* THE FIXED WIDTH: the middle of the control keeps room enough that changing the level never makes
   the control longer or shorter.
   7rem holds "Conclusion", the longest of the seven labels, at this font size with room to spare,
   so the plus button sits in the same place at every level and nothing below the control moves.
   A width and not a min-width, because a min-width would still grow if a longer label were added
   and the growth would be invisible until somebody photographed it. */
.sb-level-label {
  display:inline-block; width: 7rem; text-align:center; white-space:nowrap; overflow:hidden;
  font-size: var(--fs-1); font-weight:600; color: var(--text);
}
/* PICTURES ON IS BLUE, which is the whole of what the button says now that it has no words:
   turning blue when pressed is plain enough. The accent carries the border, the icon and a quiet fill, so it reads
   as on in the monochrome theme as well, where the accent is still the one colour there is. */
.sb-pictures[aria-pressed="true"] {
  border-color: var(--accent); color: var(--accent); background: var(--accent-soft);
}
.sb-pictures-icon { display:block; }

/* An empty state is a box, not a paragraph: a reading measure on it left a 512px box with centred
   text sitting in the left two thirds of the panel. */
.sb-empty { margin:0; padding: var(--pad-lg); text-align:center; color: var(--text-3);
  font-size: var(--fs-2); line-height: var(--lh-body); background: var(--panel-2);
  border: var(--border-w) dashed var(--border); border-radius: var(--radius); }

.sb-fail { margin:0; padding: var(--pad); font-size: var(--fs-2); line-height: var(--lh-body);
  color: var(--st-failed); background: var(--st-failed-row);
  border: var(--border-w) solid var(--st-failed-line);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm); }
.sb-fail code { font-family: var(--font-mono); }
.sb-note { margin:0; padding: 4px var(--pad); font-size: var(--fs-1);
  line-height: var(--lh-body); color: var(--st-inferred); background: var(--st-inferred-row);
  border-left: var(--rail) solid var(--st-inferred-line); border-radius: var(--radius-sm); }
.sb-note code { font-family: var(--font-mono); overflow-wrap:anywhere; }

/* --------------------------------------------------------------------------------------------
   THESE BLOCKS AS A PAGE: A REPORT, WHERE THE WRITING IS THE PAGE.

   ONE THING CHANGES AND NOTHING ELSE DOES: how big a heading is. In a panel the blocks sit under
   the panel's own h2, so they stay small. In a report the record's title is the h1 and these
   headings are the only structure on the page, so they get a ladder a reader can see: 24, 19, 16
   bold, 16 quiet. Measured on the round-four owner review, whose three heading levels came out at
   19px, 16px and 14px-in-capitals — one step of hierarchy and then two levels drawn no larger than
   the paragraphs they head.

   THE WIDTH IS NOT HERE ANY MORE AND THAT IS THE POINT. It is --read, declared once in
   tokens.css and moved by the text-size row below. This block used to be one of six, each setting
   its own --lane-prose, so the report's reading column was whichever of six numbers a stored
   profile named.

   The air above a heading is what separates one section from the next; the gap below it is the
   block gap, so a heading sits with the words it belongs to rather than floating between them. */
.sb-doc .sb-h { margin-top: var(--sb-gap); }
.sb-doc h5.sb-h { color: var(--text); }
.sb-doc h6.sb-h { color: var(--text-2); }
.sb-doc .sb-h:first-child { margin-top:0; }
.sb-doc .sb-text { row-gap: var(--sb-gap); }
/* An item of a page's list is a sentence or three, not a word, so the items need telling apart. At
   2px the seven bullets of the review's own list ran together into one grey block. */
.sb-doc .sb-list { gap: var(--pad); }
.sb-doc {
  --sb-h3: var(--fs-6); --sb-h4: var(--fs-5); --sb-h5: var(--fs-4); --sb-h6: var(--fs-3);
  --sb-lh: 1.72; --sb-gap: var(--pad-lg); --sb-gut: 18px;
}

`
