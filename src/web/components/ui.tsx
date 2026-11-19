// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../lib/pagechoice.ts'
/**
 * The Mole Office component library.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE LOOKS THE WAY IT DOES
 * ---------------------------------------------------------------------------------------
 *
 * A twelve-way interface exploration concluded that the twelve directions were twelve opinions
 * about six numbers: they already agreed on state semantics, on showing broken links rather
 * than hiding them, on the affordance ladder, on spacing and on type. They differed only in row
 * height, corner radius, rail width, gutter, column count, elevation and font role.
 *
 * So this is ONE component tree driven by tokens, not twelve skins. Every colour and every size
 * below is a `var(--token)` defined in src/web/tokens.css. Swapping `data-theme`, `data-density`,
 * `data-radius` or `data-font` on <html> re-skins the whole app without a line of this file
 * changing. That is the entire point: a preset must never need a component to cooperate.
 *
 * THE AFFORDANCE GRAMMAR, taken from the brutalist-structural direction because the critics
 * rated it the clearest answer to "what is interactive":
 *
 *     enclosed in a box   = it writes or changes something          (Btn, TextInput, StateChip)
 *     underlined at rest  = it navigates                            (Row title with an href)
 *     bare text           = inert, read only                        (Row title without one)
 *
 * "At rest" is load-bearing. Phones have no hover, so an affordance that only appears on hover
 * does not exist for half the users. Nothing here reveals itself on hover; hover only
 * *strengthens* what is already visible.
 *
 * SEVERITY IS A FIXED COLUMN. Every Row reserves the same left column for its state chip,
 * whether or not it has one. Stuck work therefore stacks into a literal vertical line down the
 * page, which is the fastest possible answer to "is anything wrong", and it survives sorting.
 *
 * COLOUR IS NEVER THE ONLY CHANNEL. Every state carries a word, a distinct glyph silhouette and
 * a weight in addition to its colour, so the page still ranks in greyscale and for a
 * red-green-blind reader. Blue is reserved for focus and is never a state colour.
 *
 * The visual treatment (radius spent on shells, tinted rows with a spine, pill controls) is the
 * soft-rounded direction, which scored highest on usability and was the only one that kept two
 * columns at 960px.
 */

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useForegroundWait, useLoadingLight } from '../lib/waiting-light.ts'
import { useNavigationRead } from '../lib/navigation-wait.tsx'
import {
  DIRECTION_DEPTHS,
  ITEM_STATES,
  RECORD_KINDS,
  RECORD_ORIGINS,
  readOrigin,
  type DirectionDepth,
  type ItemState,
  type RecordKind,
  type RecordOrigin,
} from '@shared/types.ts'
import { parseAnyStamp } from '@shared/time.ts'
import { dueCount, type DueForm } from '@shared/deadlines.ts'
import { gapBetween, wordWithSpacedValues } from '@shared/spacing.ts'
import { content, createI18n, dayInThePageLanguage, t, type WordKey } from '@shared/i18n.ts'
import { en } from '@shared/words/en.ts'
import { COMPUTED_STATE_WORDS, PROGRESS_DETAIL_WORDS } from '@shared/words.ts'
// WHAT A ROW IS, SAID ON THE ROW. One attribute, declared once, read by the one listener in
// components/agent/pointing.ts. A list that does not say what its rows are is a list nobody can
// talk to an agent about, and that was every list in the product except two.
import { targetAttributes, type Target } from '@shared/targets.ts'
// WHAT A STATE IS: a word, a mark with no colour in it, and the whole sentence on demand. The one
// declaration that stops a component meeting an honest state and reaching for a paragraph.
import type { DrawnState, MarkEdge, MarkGlyph, StateMark } from '@shared/states.ts'
// And which element inside a row holds what the thing is CALLED. It is not one of those three: a
// name carries no promise about where the characters are stored. See agent/pointing.ts.
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import { RecordId } from './RecordId.tsx'
// A CYCLE, SAFE AT LOAD: Planning.tsx imports this file, and neither reads the other at module level.
import { hoursNotSaid } from './Planning.tsx'
import { declaredAttributes, declaresSomething, type Declares } from './declares.ts'
import { useInspect, useMode, type Mode } from '../lib/mode.ts'
import { useRecordTitles } from '../lib/titles.ts'
import { titleReadFailed } from '../lib/titles.ts'
import { isARecordId, LEADING } from '@shared/messages.ts'
import { settingsPath } from '@shared/addresses.ts'
import { navigate, pathFor, recordPath } from './router.tsx'
// The one place a stored word becomes a word a person reads. The Tag below prints a record kind,
// and printing the stored spelling was the leak this layer exists to close: a tag saying
// "wanna_try" is a column value on a screen. Normal mode gets the reader's word and Developer mode
// gets the stored one, and the choice is made inside `kindWord` rather than in this file.
import { familyWord, kindWord, linkWord, readerWord, stateWord, type LinkDirection } from '../lib/words.ts'
// The component sheet at the bottom of this file switches the same five axes the preset bar
// does, so it reads that file's lists rather than keeping a second copy of them. PresetBar's
// import-time restore is guarded on `document`, so this import is safe in a Node test.
import { DENSITY_CHOICES, FONT_CHOICES, RADIUS_CHOICES, SIZE_CHOICES, THEME_CHOICES } from './PresetBar.tsx'
// Type only: the shape of one unfilled field, as `completenessOf` computes it. Importing the
// type rather than the module keeps this file free of KIND_SPECS, which it has no use for.
import type { Incompleteness } from '@shared/kinds.ts'
// The new semantics. These come from the shared contract rather than being restated here, which
// is the whole reason the marks below can be trusted: `unclassifiedNote` and `gateLabel` are the
// one place each of those sentences is written, and `KIND_FAMILIES` is the one place the six
// reading families are named. A second copy in this file would drift within a week.
import {
  KIND_FAMILIES,
  KINDS_READ_ON_THEIR_OWN_PAGE,
  familyOf,
  type Consequence,
  type ConsequenceBearer,
  type Gate,
  type KindFamily,
  type Pause,
  type Progress,
} from '@shared/work.ts'
// The rank factors and the two thresholds the alarm scale reads. FACTOR_MAX is imported so the
// bar in a factor breakdown is drawn against the REAL maximum: a bar scaled to a number this file
// invented would be a picture of an argument nobody made.
import {
  DAY_MS,
  DUE_SOON_HOURS,
  FACTOR_MAX,
  HOUR_MS,
  type RankFactor,
} from '@shared/attention.ts'
import { errorMessage, faultOf, type Fault } from '../api.ts'
/** Naming the project a record is really in, for the one screen that has to. See `WrongTurn`. */
import { nameOfProject, useProjects } from '../lib/projectlist.ts'
// A PRESS THAT STOPS SAYS SO WHERE IT STANDS. Criterion E4, the press half; the boundary that
// catches a fault while a page is being drawn is in the same file.
import { FAULT_WORDS, TheFault, nameOfPress, notePress, usePageName, usePressFault } from './TheFault.tsx'
import { currentWorkspace } from '../lib/workspace.ts'
import { followChanges, type Follows } from '../lib/record-changes.ts'
import { keepAnswerAt, keptAnswer, placeOf } from '../lib/pagecache.ts'

// ============================================================================ the product mark

/**
 * THE MOLE OFFICE WORDMARK. One mark, drawn in one place, wherever the product names itself.
 *
 * IT IS A COMPONENT BECAUSE IT HAD ALREADY DRIFTED. The mark was written out by hand in the
 * sidebar and a second, forgotten copy of the same two rules sat in styles.css for a top bar
 * nothing renders any more. The sidebar's copy had a descendant selector one level too wide, so it
 * painted the wrapper as well as the letter and the whole word came out one uniform accent — the
 * distinction the mark is made of, gone, with nothing failing. Two places that must agree with
 * nothing making them agree is this repository's recurring defect; a mark is the cheapest instance
 * of it to delete.
 *
 * WHAT THE MARK MEANS, WHICH IS WHY IT IS DRAWN THIS WAY:
 *
 *   Mole    what goes and finds. It digs, it connects one burrow to another, and it works out of
 *           sight — which is what an agent doing your work while you are away is. It carries the
 *           accent, a heavier weight and 6% more size, on the same baseline.
 *   Office  where what it found is filed and kept. The theme's own text colour, at the semibold
 *           this interface sets a heading in. It competes with nothing.
 *
 * IT USED TO BE PANEL AND X, and the two halves were "the structure" and "the crossing point".
 * The product was renamed on 28 August 2026 and the new name has no X to lean on, so the split
 * moved from inside one word to between two. The rules are otherwise unchanged, and deliberately:
 * a rename is not a licence to redraw everything at once.
 *
 * THREE CHANNELS, AND IT STILL READS WHEN TWO ARE GONE. Colour is the first to go and the least
 * reliable: the `mono` theme sets --accent to the text colour deliberately, and greyscale takes it
 * everywhere. Weight and size are what survive that. A two-weight typeface under `data-font="mono"`
 * can fold 600 and 800 onto one bold face as well, and then the size is the whole distinction.
 *
 * THE SIZE IS 6% AND IT WAS 12%, and the reason is that the highlighted half is now a word rather
 * than a letter. A single letter set 12% larger reads as a mark. A four-letter word set 12% larger
 * than the word beside it reads as a mistake — the eye takes it for two different type sizes on one
 * line rather than for one name with an emphasis in it. 6% is enough to see and small enough to
 * read as deliberate.
 *
 * NO FONT IS IMPORTED FOR IT. The mark is set in --font-ui, the same role the rest of the interface
 * uses, so a font preset re-sets the mark with everything else instead of leaving it behind.
 *
 * THE CLASS NAMES STILL BEGIN `px-`, WHICH ARE THE INITIALS OF THE OLD NAME. That is 633 class
 * names across this interface and it is deliberately retained: nobody reads a class name, and a
 * partial rename of a stylesheet prefix shows up as an unstyled element rather than as an error.
 * `px-wordmark-x` DID change, to `px-wordmark-lead`, because it was named after the letter X and
 * there is no X any more.
 */
export interface WordmarkProps {
  /**
   * `short` is the two initials, for a place where the whole name does not fit -- it is about
   * 60 to 72 pixels wide, depending on the density preset, since it is 3rem plus twice the padding
   * and both of those follow the reader's own text size. The same
   * mark under the same rules and not a second logo: the M is still what goes and finds, the O is
   * still where it is filed, and they keep the colours and weights of the words they stand for.
   *
   * `icon` is the mark alone, no letters. The collapsed rail draws this form, on the owner's
   * words of 16 September 2026: when the rail is narrowed only the icon shows at the top, no "MO"
   * text.
   *
   * THE WORD "OFFICE" ALONE ALSO FITS, and it names the least distinctive half of the name.
   *
   * THE MOLE-IN-THE-M PICTURE IS BESIDE EVERY FORM, at the top left beside the name, and it is the
   * owner's own PNG logo in place of the drawing traced from it. `MoleOfficeMark` below says how it is shown.
   */
  form?: 'full' | 'short' | 'icon'
}

/**
 * THE OWNER'S LOGO, from their own PNG: a mole looking out of the arch cut into an M.
 *
 * THE PICTURES ARE SMALL COPIES OF assets/mole-office.png, in src/web/logo, made from that file by
 * resizing it and never redrawn. The mark is drawn at the height of the word, so there is one copy
 * at that height and one at twice it for double-density screens; the browser picks between them.
 * In the build Vite writes the larger copy out under a hashed name, and puts the smaller one, which
 * is under its 4 kB limit, into the script itself as data. The PNG replaced the drawing
 * the hand-traced drawing that was here had plain, pale
 * eyes, and the owner's logo has dark eyes with small white highlights.
 *
 * IT HOLDS ITS PLACE WHILE IT LOADS. The width and height below give the browser the picture's
 * shape before a byte of it arrives, and the stylesheet sets its size in em, so the word beside it
 * does not move when the picture appears.
 *
 * IT IS NAMED RATHER THAN HIDDEN, and that is a trade made on purpose. An icon beside its
 * own name is usually marked decorative so a screen reader does not say the name twice, and with
 * the sidebar open this one is read before the word, which is a small redundancy. The other way
 * round is worse: an unnamed picture is a thing a reader is told nothing about, and the picture
 * has to carry a description. In the collapsed rail neither reaches a screen reader --
 * the wrapper around that form is aria-hidden -- and the link is named by its title there.
 *
 * tests/the-brand-carries-the-owners-logo.test.ts checks that each copy is really a copy of the owner's PNG, at
 * the size named here.
 */
const MARK_AT_1X = new URL('../logo/mole-office-mark-20.png', import.meta.url).href
const MARK_AT_2X = new URL('../logo/mole-office-mark-40.png', import.meta.url).href

function MoleOfficeMark() {
  return (
    <img
      className="px-wordmark-icon"
      src={MARK_AT_1X}
      srcSet={`${MARK_AT_1X} 1x, ${MARK_AT_2X} 2x`}
      width={23}
      height={20}
      alt={t('pageWords.ui.001')}
    />
  )
}

export function Wordmark({ form = 'full' }: WordmarkProps) {
  // THE COLLAPSED RAIL'S FORM is the mark alone: no letters beside it, so the narrow rail cannot
  // say "MO" where only an icon belongs.
  if (form === 'icon')
    return (
      <span className="px-wordmark">
        <MoleOfficeMark />
      </span>
    )
  return (
    <span className="px-wordmark">
      <MoleOfficeMark />
      <span className="px-wordmark-lead">{form === 'short' ? 'M' : t('pageWords.ui.expression01')}</span>
      {form === 'short' ? 'O' : t('pageWords.ui.expression02')}
    </span>
  )
}

// ============================================================================ the state vocabulary

/**
 * Every state Mole Office can show, not just the five a checklist item can be in.
 *
 * `ITEM_STATES` is what a human sets. The other five are computed truths about a record --
 * a link whose target was deleted is `broken`, a link Mole Office worked out itself is `inferred`,
 * an obligation past its date is `overdue`, an agent session is `running` or `crashed`. They
 * share the chip because they share the job: they are the answer to "what is the matter with
 * this line", and they must all read at a glance in the same column.
 */
export const PANEL_STATES = [
  'todo',
  'doing',
  'done',
  'failed',
  'blocked',
  'broken',
  'inferred',
  'overdue',
  'running',
  'crashed',
] as const

export type PanelState = (typeof PANEL_STATES)[number]

/**
 * THE THREE OF THE TEN THAT MOLE OFFICE DOES NOT STORE.
 *
 * `broken`, `inferred` and `overdue` are worked out by the interface — a link whose target was
 * deleted, a link Mole Office inferred, an obligation past its date. No record carries any of them, so
 * they are in none of the five vocabularies in src/shared/words.ts and that file is the wrong place
 * for them. All three are already the word a reader would use.
 *
 * The other seven ARE stored words and their readings come from the one table below.
 */

/**
 * The reader's word for one of the ten states this interface draws.
 *
 * THIS USED TO BE A TABLE OF ITS OWN, and it was a second set of readings for stored words: it said
 * `todo` reads "Todo" where src/shared/words.ts says "to do", so which word a person saw depended
 * on which chip they met it on. "Todo" is not a word in English, which is why the one table has an
 * entry for it. The wave-5 verifier named the collision and ui.tsx already carried a comment
 * acknowledging it.
 */
export function panelStateWord(state: PanelState): string {
  return COMPUTED_STATE_WORDS[state as 'broken' | 'inferred' | 'overdue'] ?? readerWord(state).text
}

/**
 * The word shown in the chip, capitalised. A state without a word would be colour-only, which is
 * banned.
 *
 * A CHIP WORD STARTS WITH A CAPITAL and the same word inside a sentence does not, which is the only
 * thing this adds to `panelStateWord`. Both are one reading with two places to stand, not two
 * readings.
 */
export const STATE_WORDS: Readonly<Record<PanelState, string>> = Object.defineProperties({}, Object.fromEntries(
  PANEL_STATES.map((state) => [state, { enumerable: true, get: () => {
    const word = panelStateWord(state)
    return word.charAt(0).toUpperCase() + word.slice(1)
  } }]),
)) as Record<PanelState, string>

/**
 * States that mean "this needs a human". These get the left spine, a full-strength edge and a
 * heavier font weight, so they are the vertical line the eye follows down the page.
 *
 * THEY NO LONGER GET THE ROW TINT. Filling a row is the loudest thing this library can do to it,
 * and it is spent on one fact — a person could be hurt. A row that is severe says so with its
 * spine, its word and its weight, which is what a page of them can be read at all.
 *
 * `doing` is deliberately NOT here. Work in progress is not a problem; treating it as one
 * teaches people to ignore the spine, and then a real failure is invisible.
 */
export const SEVERE_STATES: readonly PanelState[] = ['failed', 'blocked', 'broken', 'overdue', 'crashed']

export function isSevere(state: PanelState): boolean {
  return SEVERE_STATES.includes(state)
}

export function isItemState(state: string): state is ItemState {
  return (ITEM_STATES as readonly string[]).includes(state)
}

/**
 * The non-colour half of a state: ten distinct silhouettes at 13px.
 *
 * They are deliberately different SHAPES, not the same shape in different colours -- square,
 * half-disc, tick, cross, barred circle, severed link, dashed diamond, clock, triangle, burst.
 * Print the page in greyscale and the ranking survives.
 */
const STATE_GLYPHS: Record<PanelState, React.ReactNode> = {
  todo: <rect x="3" y="3" width="10" height="10" rx="2.5" fill="none" strokeWidth="1.8" />,
  doing: (
    <>
      <circle cx="8" cy="8" r="5.2" fill="none" strokeWidth="1.8" />
      <path d="M8 2.8a5.2 5.2 0 0 1 0 10.4z" fill="currentColor" stroke="none" />
    </>
  ),
  done: <path d="M3 8.4l3.3 3.3L13 4.6" fill="none" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />,
  failed: <path d="M4 4l8 8M12 4l-8 8" fill="none" strokeWidth="2.1" strokeLinecap="round" />,
  blocked: (
    <>
      <circle cx="8" cy="8" r="5.4" fill="none" strokeWidth="1.8" />
      <path d="M4.2 11.8L11.8 4.2" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  broken: (
    <>
      <path d="M6.6 3.6H5a3.4 3.4 0 0 0 0 6.8h1.6" fill="none" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.4 3.6H11a3.4 3.4 0 0 1 0 6.8H9.4" fill="none" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 12.4V14" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  inferred: (
    <path d="M8 2.4L13.6 8 8 13.6 2.4 8z" fill="none" strokeWidth="1.8" strokeDasharray="2.6 2.2" strokeLinejoin="round" />
  ),
  overdue: (
    <>
      <circle cx="8" cy="8" r="5.6" fill="none" strokeWidth="1.7" />
      <path d="M8 4.8v3.4l2.4 1.5" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  running: <path d="M4.4 3.2l8 4.8-8 4.8z" fill="currentColor" stroke="none" />,
  crashed: <path d="M9.2 1.8L3.6 9h3.6l-.8 5.2L12.4 7H8.6z" fill="currentColor" stroke="none" />,
}

/** The glyph on its own, for anywhere a chip would be too heavy. */
export function StateGlyph({ state }: { state: PanelState }) {
  return (
    <svg className="px-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false" stroke="currentColor">
      {STATE_GLYPHS[state]}
    </svg>
  )
}

/**
 * Point one element's tone variables at the semantic tokens for one state.
 *
 * Meaning lives in `--st-failed`, never in `--red`. A theme is allowed to make "failed" orange;
 * it is not allowed to change what failed MEANS, and a component that reached for `--red`
 * directly would silently break that promise on the day someone swaps colour systems.
 *
 * Two tints, not one: `-bg` is mixed for a 20px chip, and painting that same tint across a
 * 900px panel is a shout. `-row` is the weak version for filling a whole row or panel. Both
 * exist so that neither has to be compromised.
 *
 * `-weight` and `-border-style` are the non-colour channels, and they come from tokens.css too,
 * so a theme cannot end up with a state that is distinguishable by colour alone.
 */
/**
 * `ask` is not a state a record can be in — it is the one thing a PERSON can be in, and it is why
 * it sits beside the state words rather than inside them.
 *
 * A fork nobody has settled is not failed, not blocked and not running; it is waiting on somebody.
 * The product had no colour for that, so the decision queue borrowed the alarm's red on one surface
 * and the link blue on another, and neither is true — one says something is wrong, the other says
 * something is clickable. `--ask` is defined in all eight palettes. See docs/UX-CONTRACT.md for
 * where it may be spent, which is a short list on purpose.
 */
export type PanelTone = PanelState | 'ask'

function toneVars(tone: PanelTone): React.CSSProperties {
  // `ask` has no `-weight` or `-border-style` of its own: it is not a state word, so it never
  // dresses a chip, and the two variables exist for chips. Falling back to the todo values keeps a
  // panel's spine drawn in the ordinary way rather than leaving two custom properties undefined.
  const base = tone === 'ask' ? 'ask' : tone
  return {
    '--px-tone': `var(--${base === 'ask' ? 'ask' : `st-${base}`})`,
    '--px-tone-bg': `var(--${base === 'ask' ? 'ask-bg' : `st-${base}-bg`})`,
    '--px-tone-row': `var(--${base === 'ask' ? 'ask-row' : `st-${base}-row`})`,
    '--px-tone-line': `var(--${base === 'ask' ? 'ask-line' : `st-${base}-line`})`,
    '--px-tone-weight': `var(--st-${tone === 'ask' ? 'todo' : base}-weight)`,
    '--px-tone-border-style': `var(--st-${tone === 'ask' ? 'todo' : base}-border-style)`,
  } as unknown as React.CSSProperties
}

/** Used by the component sheet to photograph hover and focus, which a screenshot cannot press. */
export type ForceState = 'hover' | 'focus'

// ============================================================================ panels

/**
 * A TONE IS ONLY DRAWN ON A RANK-0 PANEL, AND ASKING FOR ONE WITHOUT SAYING SO NOW THROWS.
 *
 * It used to be accepted and ignored. Four panels in this product asked for a tone and got nothing,
 * including the two that matter most: "This is a fork, and settling it is yours" asked for
 * `blocked` and was drawn with exactly the same chrome as "Stored fields" — so the one page in
 * Mole Office where a person is REQUIRED looked like a database inspector. An independent audit found it
 * by measuring rendered pixels, because nothing else could: the prop was taken, dropped, and never
 * complained.
 *
 * The check is at runtime rather than in the type because `rank={broken ? 0 : 1}` with a tone is
 * correct and common — tinted when something is wrong, plain when it is not — and a type that
 * forbade it would push six honest call sites into casts. What is a mistake is passing a tone and
 * NO rank, which is why the two are told apart by `undefined` rather than by value.
 */
export interface PanelProps {
  /**
   * WHAT THIS PANEL IS, so a person can point at it and talk about it. Required, and there is no
   * default: a panel that answered nothing was a panel the walk ran straight past, which is what
   * made a right-click anywhere on a page answer "the page" and nothing better. The three answers
   * and when each is right are in components/declares.ts.
   */
  declares: Declares
  title: string
  /** A page label takes the look's capitals. Content keeps the case its writer chose. */
  titleIs?: 'label'
  /** A short word above the title, e.g. the record kind this panel is about. */
  kind?: string
  /** Buttons for the panel itself. They sit at the right of the header and never scroll away. */
  actions?: React.ReactNode
  /** 0 = alarm: tinted and spined. 1 = normal. 2 = quiet: no fill, no elevation. Default 1. */
  rank?: 0 | 1 | 2
  /**
   * What an alarm panel's tint MEANS. Only read at rank 0. Defaults to `failed`, because rank 0 has
   * until now meant owed, broken or stuck work. `ask` is the exception and the reason `PanelTone`
   * exists: a fork waiting on a person is not a fault, and drawing it in the alarm colour said so.
   */
  tone?: PanelTone
  id?: string
  children: React.ReactNode
}

export function Panel({ declares, title, titleIs, kind, actions, rank, tone, id, children }: PanelProps) {
  if (tone !== undefined && rank === undefined) {
    throw new Error(
      `Panel "${title}" was given tone="${tone}" and no rank. A tone is only drawn at rank 0, so this ` +
        `panel would have been tinted in the caller's head and plain on the screen. Pass rank={0} to ` +
        `mean it, or drop the tone.`,
    )
  }
  const level = rank ?? 1
  return (
    <section
      className="px-panel"
      data-rank={level}
      id={id}
      style={level === 0 ? toneVars(tone ?? 'failed') : undefined}
      {...declaredAttributes(declares)}
    >
      <header className="px-panel-head">
        <div className="px-panel-ident">
          {kind ? <span className="px-panel-kind">{kind}</span> : null}
          {/* WHAT THIS PANEL IS CALLED, marked only when the panel declares. `nameSaidBy` takes the
              first marked descendant, so a see-through panel marking its heading would name the
              record page around it after this panel's words. Same mark and same reason as `Row`. */}
          {/* The caller marks a label explicitly. Content keeps its writer's case in every look. */}
          <h2
            className="px-panel-title"
            {...(titleIs === 'label' ? { 'data-title-is': 'its-label' } : {})}
            {...(declaresSomething(declares) ? DRAWS_THE_NAME : {})}
          >
            {title}
          </h2>
        </div>
        {actions ? <div className="px-panel-actions">{actions}</div> : null}
      </header>
      <div className="px-panel-body">{children}</div>
    </section>
  )
}

/**
 * A SMALL ROUND `?`, for the explanation that genuinely has to exist.
 *
 * ---------------------------------------------------------------------------------------------
 * THE RULE THIS COMPONENT ENFORCES BY BEING INCONVENIENT
 * ---------------------------------------------------------------------------------------------
 *
 * The owner, reading the redesigned product: *"these descriptions or explanations of UIs are
 * literally not needed if we design our UI or UX good."* They are right, and the first answer to
 * every one of them is DELETION. A caption under a button saying what the button does is a design
 * that did not work, patched with prose — and it costs twice, because it pushes the thing that
 * matters further down and it dilutes the text that is really content.
 *
 * What survives deletion is the small set where the concept itself is genuinely novel and no
 * arrangement of pixels can carry it: what `--ask` means, why settling is refused to agents, what
 * a provenance mark is. Those get this, and it is deliberately a bit awkward to reach — a mark you
 * press, never a sentence you read past.
 *
 * A `details` rather than a tooltip on purpose: it works on a phone, it works from the keyboard
 * with no handler, and it survives find-in-page. Nothing here is hidden from a screen reader.
 *
 * `under` draws the opened words in the page's flow, under the line the mark ends, as wide as the box
 * around it, so they push what follows down instead of lying over it. For a mark near the left edge
 * above a list of presses (the missing-details box, wave 13k round 40): floating, its words grew off the
 * page's left edge and lay over the presses below.
 */
export function Hint({ label = t('ui.hintLabel'), under = false, children }: { label?: string; under?: boolean; children: React.ReactNode }) {
  return (
    <details className="px-hint-mark" data-opens={under ? 'under' : undefined}>
      <summary aria-label={label} title={label}>
        <span aria-hidden="true">?</span>
      </summary>
      <div className="px-hint-body">{children}</div>
    </details>
  )
}

// ============================================================================ rows

export interface RowProps {
  /**
   * The grid template, e.g. `'var(--px-col-sev) minmax(0,1fr) 72px'`. Whatever you pass, keep a
   * fixed first column: it is what makes severity line up down the page.
   */
  cols?: string
  /**
   * A small marker at the head of the title cell -- a kind Tag, an index, a drag grip. It flows
   * with the title on purpose. The fixed left column belongs to severity and nothing else,
   * because a column that sometimes holds a tag and sometimes a state is a column you cannot
   * scan.
   */
  leading?: React.ReactNode
  /** Renders the chip in the severity column and, when severe, spines the row. */
  state?: PanelState
  /**
   * HOW LOUDLY to draw the row, from the alarm scale. See ALARM_LEVELS.
   *
   * Given, it REPLACES the severe-or-not treatment: `urgent` draws the spine in the alarm colour,
   * `raised` draws it in the neutral one, and the two quiet levels have none. That is the whole of
   * decision 2 — old failures recede rather than competing with today's overdue promise at one
   * strength. The filled ground is not on this scale at all: it belongs to `safety`.
   *
   * Left out, a row behaves exactly as it always has, so every existing list is untouched.
   */
  alarm?: AlarmLevel
  /**
   * What goes in the fixed severity column INSTEAD of a StateChip — a `StoredState` carrying a
   * word this interface's own ten-word vocabulary does not contain, or one of the marks.
   *
   * It must be chip-shaped. The column is the reason stuck work reads as a vertical line down the
   * page, and a column that sometimes holds a chip and sometimes a paragraph is a column nobody
   * can scan. Passing both this and `state` is a programming mistake and says so.
   */
  sev?: React.ReactNode
  /** Supply this and the severity chip becomes a control. Only the five item states are settable. */
  onStateChange?: (next: ItemState) => void
  title: React.ReactNode
  /** One quiet line under the title: a summary, a timestamp, the reason it failed. */
  meta?: React.ReactNode
  /** The right-hand cell: hours, a timestamp, a small button. */
  right?: React.ReactNode
  /** Makes the whole row navigate. Preferred over onClick: middle-click and copy-link keep working. */
  href?: string
  onClick?: () => void
  /** Marks the row the page is currently about. Drawn with a spine, not with colour alone. */
  current?: boolean
  force?: ForceState
  /**
   * WHAT THIS ROW IS, so a person can point at it and talk to an agent about it.
   *
   * One optional value on the component every list in this product already uses. Give it and the
   * row carries `data-target`; leave it out and the row is exactly what it was. It is not a hook
   * call and there is no second thing to render, so a row cannot be half-wired.
   *
   * A LIST WHOSE ROWS DO NOT SAY WHAT THEY ARE CANNOT BE TALKED ABOUT. Counted in a browser on 18
   * August 2026: Home 0 addressable elements, Work to do 0, Modules 0, Findings 0, Decisions 0,
   * the Schedule 0 — while the same records on Everything carried one each. That is the contract's
   * "the value works in one view and disappears from the other", and this prop is where it stops.
   *
   * GIVE IT ONE AND THE ROW ALSO SAYS WHICH OF ITS PARTS IS THE NAME: the title element is
   * marked, whether the title is a string or something drawn. See `DRAWS_THE_NAME` in
   * components/agent/pointing.ts. Without that mark the composer's chip reads the whole row back,
   * severity cell and summary and all — measured at 1440 on 18 August 2026 as
   * "Record — 1 / 3 checked Mole Office — attention, the change window and the" on a module row.
   */
  target?: Target
}

export function Row({
  cols,
  leading,
  state,
  alarm,
  sev,
  onStateChange,
  title,
  meta,
  right,
  href,
  onClick,
  current,
  force,
  target,
}: RowProps) {
  const inspect = useInspect()
  if (sev !== undefined && state !== undefined) {
    throw new Error('Row takes `state` or `sev`, not both. Two things in the severity column is a column you cannot scan.')
  }
  // An alarm level is a deliberate statement about loudness, so it wins over the older
  // severe-or-not reading of the state word. The two are never both applied: a row drawn at
  // `faded` that also carried the severe spine would be the loud version this scale exists to end.
  const severe = alarm === undefined && state !== undefined && isSevere(state)
  const navigates = href !== undefined
  const activates = onClick !== undefined

  const style: React.CSSProperties = {
    // An alarm row with no `state` still needs a colour to spine with, and the colour of
    // the alarm scale IS this app's alarm colour — which is what `--st-failed` names. Not a hard
    // -coded red: in the mono theme it is near-black and in `hc` it is an outline, and both are
    // right, because the scale means "this needs a person" in every theme.
    ...(state !== undefined ? toneVars(state) : alarm !== undefined ? toneVars('failed') : {}),
    ...(cols !== undefined ? ({ '--cols': cols } as unknown as React.CSSProperties) : {}),
  }

  const titleClass = navigates || activates ? 'px-row-title px-nav' : 'px-row-title'

  // A record id is drawn only in developer mode (plan 7FEOshq3mBGG).
  // Other targets have no record id to draw.
  const recordIdHere = target !== undefined && target.kind === 'record' ? target.recordId : null

  return (
    <div
      className="px-row"
      style={style}
      data-severe={severe ? '1' : undefined}
      data-alarm={alarm}
      data-act={navigates || activates ? '1' : undefined}
      data-current={current ? '1' : undefined}
      data-force={force}
      {...(target === undefined ? {} : targetAttributes(target))}
      // A row that only has an onClick still has to be reachable by keyboard. A row with an href
      // does not: the anchor inside it is the tab stop, and adding a second one would make every
      // list twice as long to tab through.
      role={activates && !navigates ? 'button' : undefined}
      tabIndex={activates && !navigates ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        activates && !navigates
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <div className="px-row-sev">
        {/* THE LEVEL GOES TO THE CHIP TOO. A row drawn `faded` whose own chip was still at full
            alarm strength was one row saying two different things about how urgent it is, and it
            was on three pages before anybody photographed it. */}
        {state !== undefined ? (
          <StateChip state={state} onChange={onStateChange} {...(alarm === undefined ? {} : { alarm })} />
        ) : (
          sev ?? null
        )}
      </div>
      <div className="px-row-main">
        <div className="px-row-line">
          {leading ? <span className="px-row-lead">{leading}</span> : null}
          {/* THE TITLE IS WHAT THIS ROW IS CALLED, and it says so, so the composer's chip names the
              thing rather than reading the row back. See DRAWS_THE_NAME in agent/pointing.ts: the
              chip used to read "Record — 1 / 3 checked Mole Office — attention, the change window and
              the", which is the severity cell, the title and the summary run together. */}
          {navigates ? (
            <a className={titleClass} href={href} {...(target === undefined ? {} : DRAWS_THE_NAME)}>
              {title}
            </a>
          ) : (
            <span className={titleClass} {...(target === undefined ? {} : DRAWS_THE_NAME)}>
              {title}
            </span>
          )}
        </div>
        {meta ? <div className="px-row-meta">{meta}</div> : null}
      </div>
      <div className="px-row-right">
        {right}
        {/* LAST IN THE RIGHT-HAND CELL, so it is the same corner on every list in the product.
            RecordId decides how it looks and where it sits; this row passes an id and nothing else,
            which is what stops twenty lists drifting into twenty placements. */}
        {inspect && recordIdHere !== null ? <RecordId id={recordIdHere} where="card" /> : null}
      </div>
    </div>
  )
}

// ============================================================================ the overlay host

/**
 * ONE PLACE EVERY FLOATING THING IS DRAWN, AND IT IS THE LAST CHILD OF THE SHELL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Every popup in this app used to be drawn where it was used — inside the row, the cell or the
 * panel that opened it. A popup drawn inside a table cell belongs to that cell's stacking context,
 * and then no z-index of its own can lift it out: it is ranked against the page by the CELL's
 * number, not by its own. The plan table's Task column is a frozen column, which means every one
 * of its cells is a stacking context at z-index 2 — so the composer opened from row 3 was painted
 * UNDER the cells of rows 4 downwards. The owner reported it as a composer clipped underneath a
 * table, and that is exactly what it was.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * One element, mounted once by the shell, at the top of the document rather than inside any page.
 * `Overlay` moves its children into it with a React portal, so a component still WRITES its popup
 * where it is used — the props, the state and the close handler all stay where they were — and the
 * browser DRAWS it at the top of the page. Nothing inside a page can be above it, because nothing
 * inside a page is at its layer: it sits at --z-overlay, over the drawer and over the phone's bar.
 *
 * REACT EVENTS STILL BUBBLE THROUGH THE COMPONENT THAT WROTE IT, not through the element it is
 * drawn in. That is what makes this a move rather than a rewrite: a key press inside a portalled
 * menu reaches the keydown handler on the wrapper that rendered it.
 *
 * THE ELEMENT IS MADE ONCE, BY THIS MODULE, AND THE SHELL ADOPTS IT. The other way round — the
 * shell renders the element and a popup looks it up — has an ordering hazard: a page renders
 * before the shell's own children have their elements, so the first popup of a session could find
 * nothing and draw nowhere. Making it here removes the question.
 */
let overlayHost: HTMLDivElement | null = null

/** The host element, made the first time anything asks for it. Null where there is no document. */
function theOverlayHost(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null
  if (overlayHost === null) {
    overlayHost = document.createElement('div')
    overlayHost.className = 'px-overlays'
  }
  return overlayHost
}

/**
 * Where every floating thing is drawn. Mounted ONCE, as the last child of the shell.
 *
 * It draws a wrapper that takes no space and puts the host inside it, so React owns a node in the
 * tree and the host itself is never re-created by a re-render.
 */
export function OverlayHost() {
  const hold = useCallback((el: HTMLDivElement | null) => {
    const host = theOverlayHost()
    if (el === null || host === null) return
    if (host.parentElement !== el) el.appendChild(host)
  }, [])
  return <div className="px-overlay-root" ref={hold} />
}

/**
 * Draw these children at the top of the page instead of here.
 *
 * NOTHING IS DRAWN WHERE THERE IS NO DOCUMENT, and that is not a silence to worry about: a popup is
 * opened by a press, and there are no presses when a component is rendered to markup on a server.
 *
 * WHETHER THE SHELL REALLY MOUNTED THE HOST IS PROVED IN A BROWSER, by tests/overlay-host.test.ts,
 * which opens the composer and asks whether the host contains it. It is NOT checked here, and that
 * is a deliberate correction: a version of this threw when the host was not yet in the document,
 * which is also true for one commit if anything ever opens a popup as a page first mounts — so a
 * check meant to catch a wiring mistake could blank a page instead. The mistake it guarded against
 * is one line in the shell and the browser test goes red the moment it is made.
 */
export function Overlay({ children }: { children: React.ReactNode }) {
  const host = theOverlayHost()
  if (host === null) return null
  return createPortal(children, host)
}

// ============================================================================ menu

/** One line of a menu: what it says, what it does, and whether it is the choice in force. */
export interface MenuChoice {
  key: string
  /** The words on the line. */
  label: React.ReactNode
  /** A glyph before the words, when the line has one. */
  mark?: React.ReactNode
  /** A key that also chooses it, drawn at the right end. The opener handles the key press. */
  accelerator?: string
  /**
   * Present = this menu is a set of choices and this says whether this is the one in force.
   * Absent = the line is an action, and nothing claims one of them is current.
   */
  chosen?: boolean
  onChoose: () => void
}

export interface MenuProps {
  /** What the menu is for, read out by a screen reader. */
  label: string
  choices: readonly MenuChoice[]
  /** Close it. The menu never holds its own open flag; whoever opened it owns that. */
  onClose: () => void
  /**
   * A point in the window to open at, which is what a right-click wants: the pointer is where the
   * person is looking, and a menu that jumps to the corner of the row loses them.
   *
   * Left out, the menu hangs under `under`, which is what a chip and a button want.
   */
  at?: { x: number; y: number }
  /** Which line takes focus when it opens. The first, unless the opener says otherwise. */
  focusIndex?: number
  /**
   * The control this menu belongs to: it hangs under this when no point is given, and pressing it
   * does NOT count as pressing outside — so pressing the chip that opened the menu closes it,
   * rather than closing it and reopening it in the same gesture.
   *
   * One of `at` and `under` has to be there, and a menu with neither says so rather than drawing
   * itself in the top corner of the window.
   */
  under?: React.RefObject<HTMLElement | null>
  /**
   * Open ABOVE the control rather than beneath it, for a control that sits on the floor of the
   * window. The composer's Send is the one that needs it: the owner's reference picture of 7 September 2026
   * shows the choices opening upward off the send control. It is a preference — a menu with no room
   * above it opens below, because half a menu is worse than a menu on the other side.
   */
  above?: boolean
  /** Called after Escape, so the opener can take focus back to the control that opened it. */
  onEscape?: () => void
}

/** How far a popup placed against the window stays from its edge. */
const POPUP_EDGE = 8

/**
 * Put a popup where the person is looking, and never off the edge of the window.
 *
 * ONE IMPLEMENTATION, for every popup that opens somewhere other than under its own trigger: the
 * context menu at a pointer, and the box for talking to an agent. Both had this arithmetic written
 * out separately for an afternoon, which is the defect this repository names — two copies of one
 * rule, free to disagree, with nothing failing when they do.
 *
 * The element must already be positioned against the window (fixed), because the object that was
 * pressed can sit inside a list that scrolls or a panel that clips, and a popup positioned inside
 * one of those is cut off by it.
 *
 * `above` MEANS THE POINT IS THE TOP OF THE CONTROL AND THE POPUP GOES OVER IT, which is what a
 * control at the bottom of the window needs: the composer's Send sits on the floor of the chat
 * panel, and a menu that hung under it would be off the screen or pulled back over the control it
 * belongs to. It is a preference and not a promise — a popup that would not fit above is put below,
 * because half a menu is worse than a menu on the other side.
 */
export function placePopup(el: HTMLElement, at: { x: number; y: number }, above = false): void {
  if (typeof window === 'undefined') return
  const box = el.getBoundingClientRect()
  const left = Math.max(POPUP_EDGE, Math.min(at.x, window.innerWidth - box.width - POPUP_EDGE))
  // Above the point when asked for and there is room for it; below the point when there is room;
  // and pulled inside the window when there is not.
  const top =
    above && at.y - box.height >= POPUP_EDGE
      ? at.y - box.height
      : at.y + box.height > window.innerHeight - POPUP_EDGE
        ? Math.max(POPUP_EDGE, window.innerHeight - box.height - POPUP_EDGE)
        : at.y
  el.style.left = `${String(Math.round(left))}px`
  el.style.top = `${String(Math.round(top))}px`
}

/**
 * Press anywhere else and this popup closes.
 *
 * ONE COPY, for every popup in the app. Focus is deliberately left where the pointer went: dragging
 * it back would fight the person for the thing they just pressed.
 *
 * `inside` is what counts as NOT outside, and it may be more than one element. It used to be one,
 * because a popup was always drawn inside the control that opened it, so naming the control named
 * both. A popup is now drawn in the overlay host, which is nowhere near its control — so a popup
 * that named only its control would close the moment you pressed the popup itself, and one that
 * named only itself would close and instantly reopen when you pressed the control that toggles it.
 * Both are inside. That is why this takes a list.
 */
export function useCloseOnOutsidePress(
  inside: React.RefObject<HTMLElement | null> | readonly React.RefObject<HTMLElement | null>[],
  onClose: () => void,
): void {
  useEffect(() => {
    const boxes = 'current' in inside ? [inside] : inside
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return
      // Nothing to compare against at all means nothing is inside yet, and closing on the first
      // press anywhere would shut a popup before it had drawn. Wait for an element.
      const known = boxes.map((box) => box.current).filter((el) => el !== null)
      if (known.length === 0) return
      if (!known.some((el) => el.contains(e.target as Node))) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [inside, onClose])
}

/**
 * A popup list of choices, with the keyboard rules in one place.
 *
 * IT WAS INSIDE `StateChip` AND IS NOT ANY MORE. The chip was the only popup menu in the product,
 * so a second menu meant a second copy of arrow-key roving, Escape, focus-on-open and press-outside
 * — which is the defect CLAUDE.md names: one fact worked out in two places, free to disagree, with
 * nothing failing when it does. The chip now renders this, so there is one set of rules.
 *
 * IT OPENS IN TWO PLACES because it is asked to do two jobs. Under the control that opened it, for
 * a chip. At the pointer, for a right-click. Both are now the same arithmetic: a point in the
 * window, measured against the window and pulled back inside if it would hang off the edge. It used
 * to hang under its control by being a DOM child of it, which is what a menu cannot do any more —
 * it is drawn in the overlay host, where its old parent is not.
 */
export function Menu({ label, choices, onClose, at, focusIndex, under, above, onEscape }: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Focus the line the opener names, so Up and Down start from where the person is.
  useEffect(() => {
    itemRefs.current[Math.max(0, focusIndex ?? 0)]?.focus()
  }, [focusIndex])

  // BOTH THE MENU AND THE CONTROL COUNT AS INSIDE. See `useCloseOnOutsidePress`.
  useCloseOnOutsidePress(under === undefined ? menuRef : [menuRef, under], onClose)

  // WHERE IT SITS. A point from the opener, or under the control it belongs to, and then pulled
  // back inside the window — a menu opened near the right edge would otherwise be half off the
  // screen, and this app's rule is that nothing scrolls sideways. It runs before the browser
  // paints, so the menu is never seen at the corner it starts at.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (el === null) return
    const control = under?.current ?? null
    if (at === undefined && control === null) {
      throw new Error(`Menu "${label}": pass at (a point) or under (the control it hangs beneath).`)
    }
    const box = control?.getBoundingClientRect()
    // ABOVE MEASURES FROM THE CONTROL'S TOP, below from its bottom. Four pixels of air either way.
    const point =
      at ?? (above === true ? { x: box?.left ?? 0, y: (box?.top ?? 0) - 4 } : { x: box?.left ?? 0, y: (box?.bottom ?? 0) + 4 })
    placePopup(el, point, above === true)
  })

  return (
    <Overlay>
      <div
        className="px-menu"
        ref={menuRef}
        role="menu"
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
            onEscape?.()
            return
          }
          const last = choices.length - 1
          const here = itemRefs.current.findIndex((el) => el === document.activeElement)
          const go = (index: number) => {
            e.preventDefault()
            itemRefs.current[Math.min(last, Math.max(0, index))]?.focus()
          }
          if (e.key === 'ArrowDown') go(here + 1 > last ? 0 : here + 1)
          if (e.key === 'ArrowUp') go(here - 1 < 0 ? last : here - 1)
          if (e.key === 'Home') go(0)
          if (e.key === 'End') go(last)
        }}
      >
        {choices.map((choice, index) => (
          <button
            key={choice.key}
            type="button"
            role={choice.chosen === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={choice.chosen}
            className="px-menu-item"
            ref={(el) => {
              itemRefs.current[index] = el
            }}
            onClick={choice.onChoose}
          >
            {choice.mark}
            {choice.label}
            {choice.accelerator === undefined ? null : <kbd className="px-menu-key">{choice.accelerator}</kbd>}
          </button>
        ))}
      </div>
    </Overlay>
  )
}

// ============================================================================ state chip

export interface StateChipProps {
  state: PanelState
  /** Present = the chip writes. Absent = the chip is a label. */
  onChange?: (next: ItemState) => void
  /** Force the label form even where a change handler exists, e.g. while a save is in flight. */
  readOnly?: boolean
  /** Replaces the word, for states that carry a number: "Overdue 4d", "2 stuck". */
  label?: string
  /**
   * HOW LOUDLY to draw it, from the alarm scale. Same meaning and same four steps as on
   * `StoredState` and on `Row` -- see ALARM_LEVELS.
   *
   * WHY THIS CHIP NEEDS IT TOO. `StoredState` draws a word off a record and takes a level;
   * `StateChip` draws one of this interface's own ten words and, until now, could not. So the same
   * `crashed` session was drawn faded on the ranked list and at full alarm strength on the sessions
   * page, from two components that had no way to agree. Left out, a chip draws at its own tone,
   * which is what a checklist item wants.
   */
  alarm?: AlarmLevel
  force?: ForceState
}

/**
 * A state, as a word plus a shape plus a colour -- and, when it can be changed, as a menu.
 *
 * The keyboard rules exist because this is the single most-used control in the app: focus it and
 * press 1-5 to set the state without ever opening the menu. Opening it and pressing Escape puts
 * focus back on the chip, so keyboard users never lose their place in a long checklist.
 */
export function StateChip({ state, onChange, readOnly, label, alarm, force }: StateChipProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const editable = onChange !== undefined && !readOnly

  // A computed state such as `broken` cannot be set by hand -- there is no honest menu to show.
  // Wiring one up is a programming mistake, so it says so rather than rendering a menu that
  // would write a nonsense value.
  if (onChange !== undefined && !isItemState(state)) {
    throw new Error(
      `StateChip: "${state}" is a computed state and cannot be edited. Drop onChange, or pass one of: ${ITEM_STATES.join(', ')}.`,
    )
  }

  // FOCUS ON OPEN, PRESS OUTSIDE TO CLOSE AND THE ARROW KEYS ARE ALL `Menu`'S NOW. They used to be
  // written out here, and they were the only copy in the product, so the second menu would have
  // been a second copy of them.
  const word = label ?? STATE_WORDS[state]
  const title = label ? t('sheet.state.label', { state: STATE_WORDS[state], label }) : STATE_WORDS[state]
  const chipBody = (
    <>
      <StateGlyph state={state} />
      <span className="px-chip-word">{word}</span>
    </>
  )

  if (!editable) {
    return (
      <span
        className="px-chip"
        data-state={state}
        // WHAT KIND OF FACT THIS STATE IS -- see STATE_FAMILY. Emitted on every chip, drawn on by
        // analytical surfaces only, and never a substitute for the state itself: the family is a
        // grouping OF the ten states, not a tenth-and-a-half one.
        data-state-family={STATE_FAMILY[state]}
        // A level is a deliberate statement about loudness and wins over the older severe-or-not
        // reading, exactly as it does on Row: a chip drawn `faded` that also carried the severe
        // weight would be the loud version the scale exists to end.
        data-severe={alarm === undefined && isSevere(state) ? '1' : undefined}
        data-alarm={alarm}
        style={toneVars(state)}
        title={
          alarm === undefined ? title : t('sheet.state.alarm', { state: title, alarm: ALARM_NOTES[alarm] })
        }
      >
        {chipBody}
      </span>
    )
  }

  const choose = (next: ItemState) => {
    setOpen(false)
    buttonRef.current?.focus()
    onChange(next)
  }

  return (
    <div
      className="px-chip-wrap"
      ref={wrapRef}
      onKeyDown={(e) => {
        // Escape is `Menu`'s, and it is only reachable while the menu is open, because that is when
        // focus is inside it. 1-5 stay here, because they work with the menu SHUT as well.
        //
        // 1-5 set the state straight from the chip, with or without the menu open. This is the
        // accelerator that makes updating twenty checklist items bearable.
        const digit = Number(e.key)
        if (Number.isInteger(digit) && digit >= 1 && digit <= ITEM_STATES.length) {
          const next = ITEM_STATES[digit - 1]
          if (next !== undefined) {
            e.preventDefault()
            choose(next)
          }
        }
      }}
    >
      <button
        type="button"
        ref={buttonRef}
        className="px-chip px-chip-btn"
        data-state={state}
        data-state-family={STATE_FAMILY[state]}
        data-severe={alarm === undefined && isSevere(state) ? '1' : undefined}
        data-alarm={alarm}
        data-force={force}
        style={toneVars(state)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('sheet.state.change', { word })}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {chipBody}
        <svg className="px-caret" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
          <path d="M1 2.6L4 5.6L7 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <Menu
          label={t('sheet.state.choose') }
          under={wrapRef}
          focusIndex={Math.max(0, ITEM_STATES.indexOf(state as ItemState))}
          onClose={() => setOpen(false)}
          onEscape={() => buttonRef.current?.focus()}
          choices={ITEM_STATES.map((option, index) => ({
            key: option,
            label: STATE_WORDS[option],
            mark: (
              <span className="px-menu-mark" style={toneVars(option)}>
                <StateGlyph state={option} />
              </span>
            ),
            accelerator: String(index + 1),
            chosen: option === state,
            onChoose: () => choose(option),
          }))}
        />
      ) : null}
    </div>
  )
}

// ============================================================================ tags

/**
 * WHAT KIND OF THING THIS IS, DRAWN BY FAMILY.
 *
 * ---------------------------------------------------------------------------------------
 * SIXTEEN KINDS WERE ONE GREY PILL, AND THE COUNT IS WHY THAT HAD TO CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * Measured across fourteen live pages at 1440 in Chromium on 14 August 2026: 8 of 607 visible chips
 * carried any hue at all, and all eight were the same red. State was already drawn well — eight
 * shapes, each with a glyph, a fill, an edge and a weight. Kind was one grey pill for all sixteen
 * kinds, so the second most useful fact on a row said nothing until it was read.
 *
 * THE CHANNEL IS THE FAMILY, NOT THE KIND. Six families is a number a person learns; sixteen kinds
 * is not, and a reader who has to tell `wanna_try` from `idea` by colour has been given a puzzle
 * rather than a channel. `KIND_FAMILIES` in src/shared/work.ts is the one place the six are named
 * and `familyOf` is the one place a kind is mapped to one; nothing here restates either.
 *
 * TWO CHANNELS, AND THE GLYPH IS THE ONE THAT ALWAYS WORKS. Each family gets a silhouette and a
 * rail colour. The glyph carries the family on its own — in greyscale, in the monochrome theme
 * where the rails are deliberately all one neutral, and for a reader who cannot separate the hues.
 * The rail is the second, redundant channel, which is what makes it safe to draw it quietly.
 *
 * THE HUES CARRY NO URGENCY, AND THAT IS CHECKED RATHER THAN JUDGED BY EYE. The accent means "act
 * on this", `--ask` means "a person is waiting", red means "alarm". A kind is never any of those,
 * so every family rail is low-chroma, is a measured distance away from all three in its own
 * palette, and is drawn on a 3px rail rather than as a fill or an ink. tests/ui.test.ts measures
 * all of that, in every palette tokens.css declares, before a page is ever photographed.
 *
 * WHERE THE COLOURS ARE DECLARED, AND WHERE THEY BELONG. They are `--family-*` tokens in this
 * file's own stylesheet, under "the six family rails" below. They BELONG in src/web/tokens.css
 * beside every other palette value and should be moved there; they are here because this pass owns
 * this file and not that one. The test reads tokens.css for the list of palettes and fails when one
 * of them has no rails here, so the two cannot drift apart in silence.
 */
const FAMILY_GLYPHS: Readonly<Record<KindFamily, React.ReactNode>> = {
  // A job on a board: one solid block. The state glyphs are outlines, so a filled silhouette
  // separates "what kind of thing" from "what state it is in" before either is read.
  work: <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" stroke="none" />,
  // Parts that fit together: four blocks in a grid. A module, a pipeline and a step are the three
  // kinds here and all three are assemblies.
  structure: (
    <path
      d="M3 3h4.2v4.2H3zM8.8 3H13v4.2H8.8zM3 8.8h4.2V13H3zM8.8 8.8H13V13H8.8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  // A fork: one path arriving, two leaving. A proposal is the fork and a decision is the arm taken.
  decisions: (
    <path
      d="M8 13.6V8.2M8 8.2L4.3 4M8 8.2L11.7 4"
      fill="none"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // A flag planted: this is what we found out and where. Claims and directions.
  findings: (
    <>
      <path d="M4.4 14V2.6" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4.4 3.2h7.6l-2 2.8 2 2.8H4.4z" fill="currentColor" stroke="none" />
    </>
  ),
  // A spark. Ideas and the things worth a try.
  ideas: (
    <path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6z" fill="currentColor" stroke="none" />
  ),
  // Written lines. Sessions, messages and notes are all somebody writing down what happened.
  notes: <path d="M3.2 6h9.6M3.2 10.4h6" strokeWidth="1.9" strokeLinecap="round" />,
}

/** The family silhouette on its own, for anywhere a whole tag would be too heavy. */
export function FamilyGlyph({ family }: { family: KindFamily }) {
  return (
    <svg className="px-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false" stroke="currentColor">
      {FAMILY_GLYPHS[family]}
    </svg>
  )
}

/**
 * The tones a tag can take.
 *
 * `alarm` and `ask` are the two the graph badge and the decision-queue chip were drawn with by
 * hand. They are here so there is one object rather than three: see the note on `Tag` below.
 */
export type TagTone = 'neutral' | 'accent' | 'quiet' | 'warn' | 'alarm' | 'ask'

export interface TagProps {
  /** A record kind. Unknown kinds are drawn as a warning rather than passed off as normal. */
  kind?: string
  tone?: TagTone
  title?: string
  children?: React.ReactNode
}

/**
 * A small inert label. It has no pointer, so it can never read as a control.
 *
 * GIVEN A `kind` AND NOTHING ELSE, IT PRINTS THE WORD A PERSON READS, not the word Mole Office stores.
 * `kindWord` makes that choice, and in Developer mode it hands back the stored spelling — which is
 * what the Developer switch is for. A caller that passes children is printing its own text and this
 * component leaves it alone.
 *
 * THREE OBJECTS BECAME ONE. `.gx-badge` on a graph card and `.dq-chip` on a decision tile were the
 * same thing drawn three ways: a short word, sometimes in the alarm colour, sometimes in `--ask`.
 * Both are now tones on this component. Those two files still carry their own copies and cannot be
 * edited by this pass; see the result note.
 */
export function Tag({ kind, tone, title, children }: TagProps) {
  const mode = useMode()
  if (kind === undefined && children === undefined) {
    throw new Error('Tag needs a `kind` or children. An empty tag is a hole in the page.')
  }
  // ONE READING OF "DO WE KNOW THIS KIND", NOT TWO. This used to ask RECORD_KINDS itself and print
  // the raw stored word when the answer was no. `kindWord` answers the same question — its tables
  // are keyed on RecordKind — and it also supplies the word, so asking it twice could not disagree with itself.
  const word = kind === undefined ? null : kindWord(kind, mode)
  const known = word === null || word.standing === 'known'
  const effective: TagTone = known ? (tone ?? 'neutral') : 'warn'
  // A family is only resolved for a kind this product knows. An unrecognised kind gets the warning
  // drawing and no family: guessing which of the six it belongs to is exactly the substitution the
  // fifth invariant forbids.
  const family = known && kind !== undefined ? familyOf(kind) : null
  return (
    <span
      className="px-tag"
      data-tone={effective}
      {...(family === null ? {} : { 'data-family': family })}
      title={title ?? (known ? undefined : t('sheet.tag.unknown', { kind: kind ?? '' }))}
    >
      {family === null ? null : <FamilyGlyph family={family} />}
      {children ?? word?.text}
    </span>
  )
}

/**
 * The kind label the pages already use. Kept as its own name so the existing pages keep working;
 * it is a Tag underneath, so the whole app picks up the token colours at once.
 */
export function KindBadge({ kind }: { kind: string }) {
  return <Tag kind={kind} />
}

// ============================================================================ how much is done

/**
 * HOW MUCH OF A THING IS DONE: one strip, and the exact count beside it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE NUMBERS ARE PART OF THE COMPONENT AND NOT A CALLER'S JOB
 * ---------------------------------------------------------------------------------------
 *
 * A bar on its own is a feeling. "About two thirds" is what a reader takes from a strip, and two
 * thirds of six parts and two thirds of sixty parts are different situations. So the count is drawn
 * beside the strip by this component and cannot be left off: a caller that forgets it would ship a
 * picture with no fact in it, and that has already happened on other surfaces in this product.
 *
 * WHY THE SHAPE IS WORTH DRAWING AT ALL, GIVEN THE COUNT IS THERE. "3 of 5 done" is exact and says
 * nothing about WHERE the run stopped: whether the three done are the first three or the first and
 * the last two, whether the stop is one part from the end, and whether eight pipelines are all
 * stuck in the same place. That is what a column of these answers at a glance, and it is in the
 * stored part states already.
 *
 * EVERY STRIP IS THE SAME WIDTH whatever the part count, so a five-part run and a twelve-part run
 * can be compared straight down a column.
 *
 * THE STATE IS CARRIED BY HEIGHT AND PATTERN AS WELL AS COLOUR — a hairline for not started, half
 * height for under way, full height for done, and full height with a hatch for the two that
 * stopped. Print the page in greyscale and the strip still reads, which is the same rule the state
 * glyphs follow.
 *
 * THE TWO STOPPED STATES ARE HATCHED, NOT RED. A column of these under a ranked list would
 * otherwise put a column of alarm-coloured segments beside it, all of it about work that stopped at
 * some point rather than about anything owed today. The hatch angle separates failed from blocked
 * in greyscale, so no channel is lost by giving the red up.
 *
 * THIS IS THE ONE COMPLETION PRIMITIVE. It was `StepStrip` inside src/web/pages/HomePage.tsx, which
 * is the only page in the product that drew one, and the strip plus its count was wanted on Work,
 * Plans, Everything and the family pages. Two independent drawings of one thing is this
 * repository's recurring defect, so HomePage's copy is to be deleted and replaced by this; that
 * file could not be edited by this pass and the swap is reported rather than done.
 */
export interface CompletionPart {
  /** Stable key for the segment. A record id where there is one. */
  key: string
  /** What this part is called, for the segment's own title. */
  name: string
  state: ItemState
}

export interface CompletionProps {
  /** Every part, in the order they are worked. */
  parts: readonly CompletionPart[]
  /** What one part is called, for the words. "step", "item", "piece of work". */
  what?: string
}

/**
 * The whole sentence a completion strip stands for.
 *
 * Exported because the strip is drawn small and a caller may want the same words in a row's own
 * text. Written once here so the two can never say different things about one set of parts.
 */
export function completionSentence(parts: readonly CompletionPart[], what = t('sheet.completion.step'), mode: Mode = 'normal'): string {
  const named = ITEM_STATES.map((state) => ({ state, n: parts.filter((part) => part.state === state).length }))
    .filter((entry) => entry.n > 0)
    // The state word comes from the vocabulary layer, not from this file's own STATE_WORDS, which
    // spells the stored value back at the reader: "todo" is not a word in English and "to do" is.
    .map((entry) => `${entry.n} ${stateWord(entry.state, mode).text}`)
  const head = t('sheet.completion.total', { n: parts.length, what })
  return `${head}: ${named.join(', ')}.`
}

/** How many of these parts are done. The one arithmetic behind both the strip and its count. */
export function completionCount(parts: readonly CompletionPart[]): { done: number; total: number } {
  return { done: parts.filter((part) => part.state === 'done').length, total: parts.length }
}

export function Completion({ parts, what = t('sheet.completion.step') }: CompletionProps) {
  const mode = useMode()
  if (parts.length === 0) {
    // An empty strip would draw as a full-width blank and read as "nothing is done yet", which is a
    // claim. "Nobody has broken this down into parts" is a different fact and the caller has to say
    // it in its own words.
    throw new Error('Completion needs at least one part. A strip of nothing is a picture of a claim nobody made.')
  }
  const { done, total } = completionCount(parts)
  const sentence = completionSentence(parts, what, mode)
  return (
    <span className="px-done" title={sentence}>
      <span className="px-done-bar" role="img" aria-label={sentence}>
        {parts.map((part, index) => (
          <span
            key={part.key}
            className="px-done-seg"
            data-state={part.state}
            // Every segment names itself, so the picture is never the only place a part's state is
            // written. The whole strip's sentence is on the strip; this is the one part.
            title={t('sheet.completion.part', { what, index: index + 1, total, name: part.name, state: stateWord(part.state, mode).text })}
          />
        ))}
      </span>
      <span className="px-done-count num">
        {t('sheet.completion.done', { done, total })}
      </span>
    </span>
  )
}

// ============================================================================ buttons

export type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ask'

export interface BtnProps {
  variant?: BtnVariant
  size?: 'sm' | 'md'
  /**
   * What the press does. A throw is a failure. When it returns a promise, or anything else with a `then` method, the
   * button waits for it as it waits for `pending`, and a rejection is a failure, said beside the press like a throw.
   * A promise that resolves proves nothing, because many actions catch their own refusal and resolve anyway: say a
   * success with `pendingSucceeded`.
   */
  onClick?: () => void
  /**
   * Disabled buttons stay in the tab order (`aria-disabled`, not `disabled`) and say why when
   * you press them. A greyed-out control that will not explain itself is a dead end, and dead
   * ends are how people conclude the app is broken.
   */
  disabled?: boolean
  /**
   * Why it is off, said under it when it is pressed. Give one with every `disabled`, because "why is this off"
   * is the only question that matters. A press that is off with none is still drawn off, with a line under it
   * saying that the page does not say why.
   */
  reason?: string
  /** Shows the write is in flight without moving anything, so the button cannot be double-fired. */
  pending?: boolean
  /** The answer to the just-finished wait failed, so its light fades without a flash. */
  pendingFailed?: boolean
  /**
   * The answer to the just-finished wait is known to have succeeded, so its light draws the whole frame once. Without
   * it the light ends plainly, because a wait that merely ended is not a success. A failure wins over it.
   */
  pendingSucceeded?: boolean
  type?: 'button' | 'submit'
  title?: string
  force?: ForceState
  /**
   * THE KEYS THAT DO WHAT THIS PRESS DOES, from somewhere else on the page: `shortcuts` as `aria-keyshortcuts` writes
   * them, and a small `mark` drawn after the words, so a reader sees which press the key does.
   */
  keys?: { shortcuts: string; mark: string }
  /** WHETHER WHAT THIS PRESS OPENS IS OPEN, as `aria-expanded` (wave 13y round 146). Left out on a press that opens nothing. */
  expanded?: boolean
  children: React.ReactNode
}

export function Btn({
  variant = 'secondary',
  size = 'md',
  onClick,
  disabled,
  reason,
  pending,
  pendingFailed,
  pendingSucceeded,
  type = 'button',
  title,
  force,
  keys,
  expanded,
  children,
}: BtnProps) {
  const [why, setWhy] = useState<string | null>(null)
  const lightTarget = useRef<HTMLButtonElement>(null)
  // WHAT THE ACTION ITSELF SAID: its promise is still running, or it threw or rejected. null when it said neither.
  const [action, setAction] = useState<'running' | 'failed' | null>(null)
  const waiting = pending === true || action === 'running'
  useForegroundWait(waiting)
  // ONLY A PROVEN SUCCESS FLASHES. An answer nobody proved ends plainly.
  useLoadingLight(lightTarget, waiting ? 'loading' : pendingFailed === true || action === 'failed' ? 'error' : pendingSucceeded === true ? 'ready' : 'unknown', 2)
  // A failure belongs to the wait it ended, so the next wait starts with nothing said.
  useEffect(() => {
    if (!waiting && action === 'failed') setAction(null)
  }, [waiting, action])
  /**
   * WHAT THIS PRESS DID WHEN IT STOPPED. Criterion E4, the press half.
   *
   * A React boundary catches a fault thrown while something is being DRAWN and catches nothing
   * thrown inside an event handler. So every press in the product is wrapped here, once, rather
   * than every page remembering to wrap its own: a fault while sending is drawn beside the press it
   * came from, in the same words the boundary uses, and the rest of the page stands.
   */
  const [sending, runThePress] = usePressFault()
  const page = usePageName()

  return (
    <>
      <button
        ref={lightTarget}
        type={type}
        className="px-btn"
        data-variant={variant}
        data-size={size}
        data-pending={waiting ? '1' : undefined}
        data-force={force}
        data-key-mark={keys?.mark}
        aria-keyshortcuts={keys?.shortcuts}
        aria-expanded={expanded}
        aria-disabled={disabled ? true : undefined}
        title={title}
        onClick={() => {
          if (disabled) {
            setWhy(reason ?? null)
            return
          }
          if (waiting) return
          // WHICH PRESS LED TO WHATEVER HAPPENS NEXT. Written before the handler runs, because a
          // handler that starts a re-render which then fails is exactly the case this names.
          notePress(nameOfPress(children))
          const pressed: { finished?: true; answer?: unknown; then?: unknown } = {}
          runThePress(() => {
            pressed.answer = onClick?.()
            // A PROMISE IS ANYTHING WITH A then METHOD, as await reads it, so a thenable and a promise made in another
            // window are waited for too. Its then is read inside the press, because a then that throws when it is
            // read is a failure like any throw.
            pressed.then = (pressed.answer as { then?: unknown } | null | undefined)?.then
            pressed.finished = true
          })
          if (pressed.finished !== true) {
            setAction('failed')
            return
          }
          if (typeof pressed.then !== 'function') return
          setAction('running')
          // Promise.resolve follows a promise of any kind, and so no rejection goes unseen.
          void Promise.resolve(pressed.answer as PromiseLike<unknown>).then(
            () => setAction(null),
            (error: unknown) => {
              setAction('failed')
              runThePress(() => {
                throw error
              })
            },
          )
        }}
      >
        {children}
        {waiting ? <span className="px-sr">{t('sheet.button.saving')}</span> : null}
      </button>
      {/* AND WHAT THE PRESS DID WHEN IT STOPPED, beside the press, in the boundary's own words.
          Criterion E4: never a blank page and never a press that stops with nothing said. */}
      {sending === null ? null : (
        <TheFault said={{ message: sending, page, press: nameOfPress(children) }} what={FAULT_WORDS.whileSending} />
      )}
      {/* THE REASON GOES WHEN THE BUTTON COMES BACK. It is a claim about why this control is off,
          so it may not outlive being off: press a disabled button, then do the thing that enables
          it, and the sentence saying it cannot be done was still sitting under a working button. */}
      {disabled && why ? (
        <span className="px-why" role="status">
          {why}
        </span>
      ) : null}
      {/* A PRESS THAT IS OFF WITH NO REASON IS DRAWN OFF, AND SAYS SO WITHOUT BEING PRESSED. Until November
          2026 it threw while drawing, and a throw while drawing stops the whole page: a press that was off only
          while its own answer was awaited stopped its page at the moment it was pressed. */}
      {disabled && reason === undefined ? (
        <span className="px-why" role="status">
          {t('sheet.button.offWithNoReason')}
        </span>
      ) : null}
    </>
  )
}

// ============================================================================ fields and inputs

interface FieldWiring {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

/**
 * Field passes the ids its control needs down through context, rather than making every caller
 * remember to wire `htmlFor`, `aria-describedby` and `aria-invalid` by hand. Wiring you have to
 * remember is wiring that is missing on the page nobody checked.
 */
const FieldContext = createContext<FieldWiring | null>(null)

export interface FieldProps {
  label: string
  /**
   * What this field means, said BEFORE the mistake happens and drawn BEHIND THE MARK.
   *
   * It is not deleted and it is not shortened; it moves behind the small round question mark this
   * file already owns, so a reader who knows the field is not made to read it again. See the block
   * comment above this component for the count that decided it.
   */
  hint?: string
  /** Said after it happens, in the server's words. */
  error?: string
  /**
   * TRUE MEANS THIS ANSWER MAY BE LEFT OUT, and it draws the quiet word "optional" beside the label.
   *
   * Most fields are required, so it is the minority that is marked and there is no "required" mark
   * at all. Say it here rather than typing "(optional)" into the label or into the hint: the hint
   * now folds, and a fact hidden behind a press is a fact the reader has to press to find out they
   * did not have to answer.
   */
  optional?: boolean
  children: React.ReactNode
}

/**
 * A LABEL, A CONTROL, AND THE HELP THAT USED TO SIT UNDER IT AS A PERMANENT SENTENCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HINT FOLDS, AND WHY THAT IS ONE CHANGE RATHER THAN THIRTY-FOUR
 * ---------------------------------------------------------------------------------------
 *
 * An audit on 15 August 2026 counted 62 pieces of helper text in the product and 34 of them were
 * this one prop, drawn as a permanently visible sentence under the box. That is the whole graph
 * edit drawer and the whole new-record form. The owner's test for how loudly to draw something a
 * reader does not have to act on is in `design/ROUND-FOUR.md`, and an explanation of a field the
 * reader has filled in twenty times fails it.
 *
 * So the sentence moves behind the mark and nothing is deleted. `Hint` already exists, it already
 * works on a phone and from the keyboard, and it already survives find-in-page, so there is no new
 * mechanism here — the Field simply uses the one the product has.
 *
 * THE MARK SITS AT THE RIGHT END OF THE LABEL ROW ON PURPOSE. Its panel is anchored to its own
 * right edge and opens leftward, which is what stops it widening the document; put the mark at the
 * left and the same panel opens off the left of the screen instead.
 *
 * THE HINT IS STILL READ OUT. `aria-describedby` still names the hint text, which is now inside the
 * closed disclosure — a node named directly by `aria-describedby` is part of the description whether
 * or not it is on screen, so a screen reader hears the same sentence it heard before.
 */
export function Field({ label, hint, error, optional, children }: FieldProps) {
  const base = useId()
  const id = `${base}-c`
  const hintId = `${base}-h`
  const errorId = `${base}-e`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter((x) => x !== null).join(' ')

  return (
    <FieldContext.Provider value={{ id, describedBy: describedBy || undefined, invalid: error !== undefined }}>
      <div className="px-field" data-invalid={error ? '1' : undefined}>
        <div className="px-field-label">
          <label className="px-label" htmlFor={id}>
            {label}
          </label>
          {optional ? <span className="px-field-optional">{t('sheet.fieldOptional')}</span> : null}
          {hint ? (
            <Hint label={t('sheet.field.meaning', { label })}>
              <span id={hintId}>{hint}</span>
            </Hint>
          ) : null}
        </div>
        {children}
        {error ? (
          <span className="px-fielderr" id={errorId}>
            <StateGlyph state="failed" />
            {error}
          </span>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}

export interface TextInputProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  /** Path-like and id-like values are easier to check character by character in the mono face. */
  mono?: boolean
  autoFocus?: boolean
  force?: ForceState
  /** Only needed outside a Field, which supplies the id itself. */
  id?: string
  'aria-label'?: string
  /**
   * A box the reader may see and may not write in, such as a question in a report read by somebody
   * who is not the person. The sentence saying why is the caller's to draw beside it.
   */
  disabled?: boolean
}

export function TextInput({ value, onChange, placeholder, mono, autoFocus, force, id, disabled, ...rest }: TextInputProps) {
  const field = useContext(FieldContext)
  return (
    <input
      className="px-input"
      type="text"
      data-mono={mono ? '1' : undefined}
      data-force={force}
      id={id ?? field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid ? true : undefined}
      aria-label={rest['aria-label']}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export interface TextAreaProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  /** How tall it starts. It still grows by dragging; nothing here caps what can be typed. */
  rows?: number
  autoFocus?: boolean
  /** Only needed outside a Field, which supplies the id itself. */
  id?: string
  /**
   * How tall it may grow before it starts scrolling inside itself, in lines. Default 16.
   * Set it smaller where a box sits inside a dense row and taller where somebody writes at length.
   */
  growTo?: number
  'aria-label'?: string
  /**
   * A keydown in the box, forwarded straight to the textarea. The shared send key rule is the only
   * caller that needs it: a message, comment or review box answers Enter there rather than here.
   */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  /** A box the reader may see and may not write in. See `disabled` on `TextInputProps`. */
  disabled?: boolean
  /**
   * A box its form may not be sent without: the browser refuses an empty one and says why. Round 38 turned
   * two required one-line reasons on an agent's page into this box, which did not pass the mark on, so an
   * empty reason could be sent (the inspector's round 39 note, report p7q9ShPXqu4l).
   */
  required?: boolean
}

/** How many lines a growing box may reach before it scrolls inside itself. */
const GROW_TO_LINES = 16

/**
 * The same box as `TextInput`, for a value that is a PARAGRAPH rather than a line.
 *
 * More than half the string fields Mole Office declares are prose — a module's `context`, a proposal's
 * `because`, a message's `body`, a problem's `why_it_hurts` — and a one-line input for them is a
 * control that says "keep it short" about a field whose own description asks for a few sentences.
 * It shares `.px-input`, so the border, the focus ring and the invalid state are the same object as
 * every other box in the app rather than a second look-alike.
 *
 * IT GROWS WITH WHAT IS IN IT. The owner set this on 17 August 2026 as a rule about every multiline
 * box a person writes in, not a fix to one page: "pressing Enter should visibly increase the editor
 * height up to a sensible limit before internal scrolling begins. A three-line note should not look
 * like one cramped line." It is done here, on the one component, so that a note, a review comment,
 * a decision's reason and an instruction to an agent all behave the same way without anybody
 * remembering to ask.
 *
 * `rows` is now where it STARTS. `growTo` is where it stops growing and starts scrolling. Dragging
 * the corner still works and still wins: once a person has set a height by hand, this stops
 * measuring, because a box that springs back to its own idea of the right size is a box fighting the
 * person using it.
 */
export function TextArea({ value, onChange, placeholder, rows = 3, autoFocus, id, growTo, onKeyDown, disabled, required, ...rest }: TextAreaProps) {
  const field = useContext(FieldContext)
  const box = useRef<HTMLTextAreaElement | null>(null)
  const draggedByHand = useRef(false)

  const measure = useCallback(() => {
    const el = box.current
    if (el === null || draggedByHand.current) return
    const style = window.getComputedStyle(el)
    const line = Number.parseFloat(style.lineHeight)
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
    const border = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
    // Measure from nothing, or the box can only ever get taller.
    el.style.height = 'auto'
    const wanted = el.scrollHeight + border
    // A line height of "normal" reads back as NaN. Then there is no ceiling this can honestly
    // compute, so it grows to fit rather than guessing a number of pixels.
    const ceiling = Number.isFinite(line) ? line * (growTo ?? GROW_TO_LINES) + padding + border : null
    const tall = ceiling === null ? wanted : Math.min(wanted, ceiling)
    el.style.height = String(tall) + 'px'
    el.style.overflowY = ceiling !== null && wanted > ceiling ? 'auto' : 'hidden'
  }, [growTo])

  useLayoutEffect(measure, [value, rows, measure])

  // The same words wrap onto more lines in a narrower box. Without measuring again, a box filled in a
  // wide window and then narrowed keeps its old height and cuts off its last lines, which it does not
  // scroll to (round 39 saw this at 390 on eleven screens). Only a change of width measures again,
  // because the height is what `measure` sets.
  useEffect(() => {
    const el = box.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const watcher = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      measure()
    })
    watcher.observe(el)
    return () => watcher.disconnect()
  }, [measure])

  return (
    <textarea
      ref={box}
      className="px-input px-textarea"
      id={id ?? field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid ? true : undefined}
      aria-label={rest['aria-label']}
      rows={rows}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      required={required}
      onPointerUp={(e) => {
        // Dragging the resize corner changes the height without changing the value, so nothing
        // else would notice. After that the person owns the height.
        const el = e.currentTarget
        if (el.style.height !== '' && el.offsetHeight !== Math.round(Number.parseFloat(el.style.height))) {
          draggedByHand.current = true
        }
      }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

export interface SelectProps<T extends string> {
  value: T
  onChange: (next: T) => void
  options: readonly { value: T; label: string }[]
  force?: ForceState
  id?: string
  'aria-label'?: string
}

export function Select<T extends string>({ value, onChange, options, force, id, ...rest }: SelectProps<T>) {
  const field = useContext(FieldContext)
  return (
    <select
      className="px-select"
      data-force={force}
      id={id ?? field?.id}
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid ? true : undefined}
      aria-label={rest['aria-label']}
      value={value}
      onChange={(e) => {
        const next = options.find((o) => o.value === e.target.value)
        // A value the list does not contain means the options and the state have fallen out of
        // step. Saying so beats writing a value the rest of the app does not believe in.
        if (!next) throw new Error(`Select: no option with value "${e.target.value}".`)
        onChange(next.value)
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// ============================================================================ absence

/**
 * WHICH KIND OF ABSENCE THIS IS. The caller says; the component decides how loud it is drawn.
 *
 * The three are `design/ROUND-FOUR.md`'s, and one test sorts them: **does the reader have to do
 * something about this absence?**
 *
 *   must-act-on  The number they came for is missing, and that IS the finding. A sentence.
 *                "Nobody has sized any of this work, so there is no size column" earns its place.
 *   told-apart   "Nobody looked" against "there are none". Quiet, and it must survive: a short
 *                mark, a word, a dimmed value. It does not have to shout.
 *   ordinary     An unset optional field, an empty list that is normally empty. Almost nothing:
 *                a dimmed dash or a short word. NEVER a sentence.
 *
 * WHY THE PRODUCT NEEDED THIS. Mole Office stated an absence as a full sentence in 211 places across 41
 * files on 15 August 2026, and most of them were ordinary emptiness nobody acts on. The owner's
 * words: "Nothing is scheduled for this week." and "Nobody has said how many hours today holds."
 * carried full sentence weight for facts a reader does nothing about.
 *
 * **THE DISTINCTION STAYS AND THE WEIGHT GOES.** Quietening is not deleting. A blank that reads as
 * "there is none" when the truth is "nobody looked" is the exact defect the fifth invariant exists
 * to prevent, so no tier here draws nothing at all, and the sentence a tier drops is put on the
 * mark's tooltip rather than thrown away.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROPS EACH TIER TAKES, AND THEY ARE DELIBERATELY NOT THE SAME SET
 * ---------------------------------------------------------------------------------------
 *
 * THE THREE NAMES ARE WRITTEN ONCE, HERE. A separate `AbsenceTier` union naming them a second time
 * was the first thing this file grew and the first thing deleted from it: a fourth tier added to
 * one and not the other is this repository's own recurring defect, in the component built to fix a
 * different one.
 *
 * A UNION RATHER THAN ONE OPTIONAL-EVERYTHING SHAPE, because the type checker is then what stops
 * the two mistakes this component exists to prevent: an ordinary emptiness cannot be handed a
 * sentence, and a told-apart absence cannot be drawn without saying which of the two answers it is.
 * Neither of those is a runtime check somebody can be tempted to soften.
 */
export type AbsenceProps =
  | {
      /** Left out is ordinary emptiness, which is the quietest drawing. That is on purpose. */
      tier?: 'ordinary'
      /** A short word instead of the dash: "not set", "no pipelines", "not recorded". Not a sentence. */
      word?: string
      /** The whole sentence, on the tooltip, for a reader who wants it. */
      title?: string
      /**
       * DRAW THE SENTENCE ITSELF, small and quiet, in place of the dash (decision WdlQ2ADlhZUu, wave 13k
       * round 41). For a part of a page whose emptiness a reader needs told, on a phone where a tooltip
       * cannot be seen. The sentence is `title`, drawn once, so a screen reader reads it once. With no
       * title there is no sentence to draw, and the dash is drawn as before.
       */
      say?: boolean
    }
  | {
      tier: 'told-apart'
      /**
       * FALSE MEANS NOBODY LOOKED. TRUE MEANS SOMEBODY LOOKED AND THERE IS NONE.
       *
       * There is no third answer and there is no default: a caller that cannot say which of the two
       * this is does not know what it is drawing, and the fifth invariant is exactly about not
       * guessing between them.
       */
      looked: boolean
      /** Overrides the default word where the reader's word is a better one: "not set", "not said". */
      word?: string
      /** REQUIRED. The sentence has to survive the quietening, and this is where it survives. */
      title: string
    }
  | {
      tier: 'must-act-on'
      /** The finding, in a sentence. This is the one tier that pays sentence weight. */
      sentence: React.ReactNode
      /** The way out. An absence a reader must act on with no way forward is a dead end. */
      action?: React.ReactNode
    }

/**
 * ONE WAY TO DRAW AN ABSENCE, AT THREE WEIGHTS.
 *
 * ---------------------------------------------------------------------------------------
 * HOW "NOBODY LOOKED" AND "THERE ARE NONE" READ APART, AND WHY IT IS THIS WAY
 * ---------------------------------------------------------------------------------------
 *
 * **The channel is SHAPE, and the word says it too.** A gap somebody can go and close is enclosed
 * in a DASHED edge. An answer that needs nothing is enclosed in NOTHING at all, and takes a plain
 * dash glyph rather than the question glyph.
 *
 * Three reasons it is shape and not colour or wording alone. It is the pair this product already
 * draws correctly — `NoStateMark` below separates "nobody wrote a state" from "this kind has no
 * state field" in exactly these two channels, and the dashed edge is what `docs/UX-CONTRACT.md`
 * already assigns to "nobody can say". It survives the monochrome theme and a reader who cannot
 * separate hues. And an enclosure is a thing a reader learns to press or to go and fix, so the
 * shape is carrying the same meaning the word is.
 *
 * **DO NOT COLLAPSE THE TWO INTO ONE DRAWING.** The next hand through here will be tempted, because
 * one quiet mark looks tidier than two. "Nobody looked" drawn as "there are none" is a clean bill of
 * health nobody established, and it is the single failure the fifth invariant was written for. If
 * the two ever need to look more alike, make the WORDS shorter, never the shapes fewer.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE QUIET ONE IS THE DEFAULT
 * ---------------------------------------------------------------------------------------
 *
 * Most absence is ordinary, so the drawing a hurried caller reaches for has to be the quiet one.
 * Loud is the tier you have to ask for by name, and asking for it by name is a claim that a reader
 * has to act on this — which is a claim somebody can check.
 */
export function Absence(props: AbsenceProps) {
  if (props.tier === 'must-act-on') {
    return <AbsenceLine loud sentence={props.sentence} action={props.action} />
  }
  if (props.tier === 'told-apart') {
    // Through `Mark`, which is this file's one drawing rule for a shape plus a word, so a
    // told-apart absence cannot drift into a different size from the named marks beside it.
    return (
      <Mark
        glyph={props.looked ? NO_FIELD_GLYPH : PROGRESS_GLYPHS.none}
        word={props.word ?? (props.looked ? t('absence.none') : t('absence.notLooked'))}
        explainOnFocus
        tone="todo"
        mark={inlineMark(props.looked ? 'none' : 'hollow', props.looked ? 'none' : 'dashed')}
        detail={props.title}
      />
    )
  }
  // Ordinary, said: the sentence in place of the dash, in the same quiet type.
  if (props.say === true && props.title !== undefined) return <span className="px-absent px-absent-said">{props.title}</span>
  // Ordinary. A dimmed dash, or the short word the caller gave, and nothing else. The em dash is
  // the same plain mark `NoStateMark` uses for "this is an answer, and there is nothing to do".
  //
  // THE SENTENCE IS READ OUT EVEN THOUGH IT IS NOT DRAWN. A dash announces as nothing at all, so a
  // reader using a screen reader would meet a heading and then silence — which is the blank this
  // whole component exists to avoid, arriving through the one channel nobody photographs. It is the
  // SAME string as the tooltip, not a second wording of it.
  return (
    <span className="px-absent" title={props.title}>
      {props.word ?? t('absence.mark')}
      {props.title === undefined ? null : <span className="px-sr">{props.title}</span>}
    </span>
  )
}

// ============================================================================ empty, error, loading

export interface EmptyProps {
  /** What is not here, and why. Never "No results". */
  message?: React.ReactNode
  /** The way out. An empty state with no way forward is a dead end. */
  action?: React.ReactNode
  children?: React.ReactNode
}

/**
 * AN ABSENCE WHOSE CALLER HAS NOT SAID WHICH KIND IT IS, drawn quietly for that reason.
 *
 * THIS IS `Absence` UNDER ITS OLD NAME AND IT IS ON ITS WAY OUT. It is called in 47 places, and an
 * audit of the running product on 15 August 2026 hand-read them: most are ordinary emptiness, a few
 * are findings a reader must act on, and the component could not tell which because nobody had ever
 * been asked. **A caller that says nothing gets the quiet drawing**, so this one does: the sentence
 * stays, whole, and the dashed box, the second background and the extra padding are gone. That box
 * was measured as the loudest object in a column with nine of them down one page.
 *
 * NOT ONE WORD IS DROPPED HERE, deliberately. Shortening a sentence needs somebody to have decided
 * which tier it is, and this component's callers have not. Moving a call site to `Absence` with a
 * tier is how that decision gets made, one screen at a time, by whoever owns the screen.
 */
export function Empty({ message, action, children }: EmptyProps) {
  const body = message ?? children
  if (body === undefined) {
    throw new Error('Empty needs a message. A blank region tells the reader nothing.')
  }
  return <AbsenceLine sentence={body} action={action} />
}

/**
 * A whole sentence about what is not here, at one of two weights. ONE SKELETON.
 *
 * `Absence` at the must-act-on tier and `Empty` draw the same thing and are allowed to differ in
 * exactly one way: the loud one asks for the box by setting `data-tier`. Writing that markup twice
 * would be two places free to part on a class name, which is the defect this repository names as
 * its own — in the file that argues against it.
 */
function AbsenceLine({
  loud,
  sentence,
  action,
}: {
  loud?: boolean
  sentence: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="px-empty" data-tier={loud === true ? 'must-act-on' : undefined}>
      <span className="px-empty-text">{sentence}</span>
      {action ? <span className="px-empty-act">{action}</span> : null}
    </div>
  )
}

export interface ErrorNoteProps {
  /**
   * The failure in the server's own words. Never replaced with a friendlier lie.
   *
   * WHERE THE FAULT CARRIES A SHORT `reason`, THIS GOES BEHIND A FOLD rather than being dropped:
   * the box draws the one short sentence the door wrote and this is one press away, whole.
   */
  message: string
  /**
   * The word in bold before the message. "Failed." is right for a request that did not work and
   * wrong for the two cases that are not failures of anything — a mistyped address, and a record
   * that cannot be read because of what is stored on it. The 404 page read "Failed. There is no
   * page at /no-such-page", which says the app broke when the reader made a typo.
   */
  label?: string
  /**
   * WHAT SORT OF FAILURE THIS IS, when the caller has it. `AsyncState` carries it; hand it over.
   *
   * Without it this draws exactly what it always drew, which is right for the thirty-odd callers
   * that report a refused WRITE — those already write their own label and their own sentence. With
   * it, the three situations that are not failures of anything get their own drawing. See below.
   */
  fault?: Fault | null
  retry?: () => void
  children?: React.ReactNode
}

/**
 * EVERY STATE A PERSON REACHES BY BEING WRONG, DRAWN IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG WITH FOUR PLACES
 * ---------------------------------------------------------------------------------------
 *
 * The language audit of 19 August 2026 walked four of these and found four different treatments:
 *
 *   a stopped server      **Failed.** HTTP 502 from /api/changes?limit=40  `Retry`
 *   a record in another   **✕ Failed.** a paragraph naming two workspace ids and telling the
 *   project              reader in words to switch, with a `Retry` that cannot ever succeed
 *   a record that is not  **Failed.** No record with id NOPEnothere99  `Retry`
 *   there
 *   a page that is not    Not found. There is no page at "/recordz".  Today · All records
 *   there
 *
 * The fourth is the right one and the audit says so: quiet, short, two ways out, no `Retry`. The
 * other three are the same reader in the same situation, drawn as an alarm.
 *
 * Three of them are not failures. A mistyped link did not break anything; a record in another
 * project did not break anything; only the stopped server did. Drawing **Failed.** at a person who
 * pasted a stale link tells them the product broke when they made a typo, and offering `Retry`
 * offers a button whose only possible outcome is the identical answer.
 *
 * ---------------------------------------------------------------------------------------
 * SO THE FAULT DECIDES THE DRAWING, AND IT IS DECIDED HERE
 * ---------------------------------------------------------------------------------------
 *
 * `Fault.kind` comes off the wire in src/web/api.ts, from the status and the reply body, once.
 * Nothing else in the browser classifies a failure, and no page writes an alarm panel of its own.
 * Adding a page does not add a fifth treatment: a page hands over the fault it was given and gets
 * whichever of these is right.
 *
 *   `not-here`    quiet, the sentence, the ways out the caller passed, and NO retry.
 *   `elsewhere`   quiet, names the record and both projects, and OPENS IT rather than saying to.
 *   `unreachable` an alarm, because the server really is down, saying so in the page's language.
 *                 The route is in Developer mode, where an id belongs.
 *   `broken`      the same alarm, in the page's sentence. The server's text is in Developer mode.
 *   `refused`     with a code, the code's words in the page's language, and the server's sentence in
 *                 Developer mode. With no code, the server's own sentence as it wrote it, first,
 *                 and after it a mark that says these are the office's own words, in every mode.
 *
 * ---------------------------------------------------------------------------------------
 * ONE RULE FOR A SERVER'S OWN WORDS (decision z_A0xVMbWOzh, wave 13k round 41)
 * ---------------------------------------------------------------------------------------
 *
 * A person reads a sentence in their own language. The server's words are in Developer mode, still
 * there and never hidden from it. The one exception is a refusal with no code: its sentence is the
 * only reason the person can act on, so it stays visible, marked as the office's words. It is the
 * first line under "Error", with no general sentence in front of it, and the mark comes after it
 * (decision urY1I-insR_8, which reads point (4) under the owner's criterion M43). The marked
 * English on a Chinese page is the visible cost until that door gets a code.
 *
 * A caller that passes a message and no fault is drawn as it was: ErrorNote cannot tell from a bare
 * string whether the server wrote it.
 */
/**
 * WHAT A REFUSAL SAYS IN THE PAGE'S LANGUAGE: the words of its code when the server gave one, its own sentence
 * when it did not. ErrorNote draws this, and so does any page that shows a refusal in a line of its own.
 */
export function theRefusalInWords(message: string, fault: Pick<Fault, 'code' | 'values'> | null | undefined): string {
  return fault?.code === undefined ? message : t(`server.${fault.code}`, fault.values)
}

export function ErrorNote({ message, label: ownLabel, fault = null, retry, children }: ErrorNoteProps) {
  const inspect = useInspect()
  const label = ownLabel ?? t('error.failed')
  const translated = theRefusalInWords(message, fault)
  if (fault !== null && (fault.kind === 'not-here' || fault.kind === 'elsewhere')) {
    return <WrongTurn fault={fault.code === undefined ? fault : { ...fault, message: translated }}>{children}</WrongTurn>
  }
  const unreachable = fault !== null && fault.kind === 'unreachable'
  // AN ACT'S OWN LABEL STAYS ITS HEADING when the office cannot be reached (13r's message WSfu7efYpNLS): a caller
  // that names what did not happen ("Not sent") reads that, and the cannot-reach sentence under it. Only a note
  // with no label of its own is a page that could not be read, and only it says the page is blank.
  const pageUnread = unreachable && ownLabel === undefined
  const coded = fault?.code !== undefined
  // A REFUSAL WITH NO CODE keeps the server's sentence in front of the person, first, marked as its own after it.
  const ownWords = fault !== null && fault.kind === 'refused' && !coded
  // THE SHORT REASON THE DOOR WROTE, when it wrote one. Nothing is shortened here: a refusal with no
  // short sentence draws the whole message, and the whole one is a press away when there is one.
  const short = ownWords ? (fault.reason ?? null) : null
  // WHAT THE PERSON READS FIRST, in the page's language. A broken answer whose server said nothing
  // readable already carries the page's own explanation in `message`.
  // A refusal with no code reads its own sentence and nothing in front of it (decision urY1I-insR_8).
  const quoted = ownWords ? (short ?? fault.message) : null
  const sentence =
    fault === null ? message
    : pageUnread ? t('error.blank')
    : unreachable ? fault.message
    : coded ? translated
    : quoted !== null ? quoted
    : fault.said === null ? fault.message
    : t('error.brokenSays')
  // THE SERVER'S OWN SENTENCE, IN DEVELOPER MODE, for every kind that does not already show it.
  // `said` is read with `?? null`: a fault built by hand outside api.ts may not carry it.
  const serverSaid = inspect && fault !== null && !ownWords && !unreachable ? (fault.said ?? null) : null
  // A refusal can already say what the heading says. Keep that sentence once, in the refusal. The
  // words compared are the ones drawn below, so a coded refusal is compared in the page's language.
  const heading = pageUnread ? fault.message : sentence.includes(label) ? null : label
  // AN ACT KEPT ON THE OFFICE'S COMPUTER, ASKED FROM ANOTHER ONE: one plain sentence, which is the code's, and one
  // press, by point 3 of a decision. The press opens the Settings section that says what
  // another computer may do.
  const keptThere = fault?.code === 'keptOnTheOfficesComputer'
  // THE PERSON IS NEVER A VISITOR, by point 1 of the same decision. This press opens
  // pairing for the person's key, not visits; point 3 says the page gets one press when it shows this refusal.
  const refusalPress: { href: string; word: 'keptHere.press' | 'notPairedHere.press' } | null =
    keptThere
      ? { href: '#' + settingsPath('settings.access'), word: 'keptHere.press' }
      : fault?.code === 'fromAnotherWorldWithNoVisit'
        ? { href: '#' + pathFor('pairing'), word: 'notPairedHere.press' }
        : null
  return (
    <div className="px-error" role="alert">
      <span className="px-error-mark">
        <StateGlyph state="failed" />
        {heading === null ? null : <strong>{heading}</strong>}
      </span>
      <span className="px-error-msg">
        {quoted === null ? sentence : <span className="px-error-said" lang="en">{quoted}</span>}
        {quoted === null ? null : (
          <span className="px-error-own">
            <span className="px-error-own-mark">{t('error.ownWords')}</span>
          </span>
        )}
        {/* AND THE WHOLE REFUSAL, ONE PRESS AWAY. Nothing is deleted by being shortened: the door's
            own paragraph says what was not written and what to do instead, and a reader who wants
            it opens it. It is a native fold, so it is keyboard-reachable and survives find-in-page.
            The summary names what is behind it, which is the rule `Explain` enforces for folds. */}
        {short === null ? null : (
          <details className="px-error-more">
            <summary className="px-error-sum">{t('error.wholeRefusal')}</summary>
            <span className="px-error-long" lang="en">{translated}</span>
          </details>
        )}
        {serverSaid === null ? null : <code className="px-server-said">{serverSaid}</code>}
        <FaultWire fault={fault} />
      </span>
      {retry || children || refusalPress !== null ? (
        <span className="px-error-act">
          {refusalPress !== null ? (
            <a className="px-btn" data-size="sm" href={refusalPress.href}>
              {t(refusalPress.word)}
            </a>
          ) : null}
          {retry && refusalPress === null ? (
            <Btn size="sm" onClick={retry}>
              {/* "Retry" is what a program does. A person tries again. */}
              {unreachable ? t('error.tryAgain') : t('error.retry')}
            </Btn>
          ) : null}
          {children}
        </span>
      ) : null}
    </div>
  )
}

/**
 * A PERSON WHO IS IN THE WRONG PLACE, TOLD SO QUIETLY.
 *
 * No `role="alert"`, no failed glyph, no alarm colour and no `Retry`: nothing failed, so nothing
 * announces itself as broken. It is drawn as the loud tier of `Absence`, which is the drawing this
 * product already has for "there is nothing here and you have to do something about it".
 *
 * WHY THE WAY OUT IS A BUTTON AND NOT A SENTENCE. The old screen said *"Switch to greenhouse and open
 * it there"*, which is the interface asking the reader to do a thing the interface could do. The
 * contract's words: only naturally discoverable is a pass, and an empty state that answers with
 * instructions is a screen that failed and was patched with a sentence.
 */
/**
 * THE ONE DRAWING FOR "YOU ARE IN THE WRONG PLACE, AND NOTHING IS BROKEN".
 *
 * Exported so the router's own not-found page uses it too. That page is the treatment the language
 * audit named as the model — quiet, short, two ways out, no `Retry` — and it was ALSO drawn as an
 * alarm: the same `ErrorNote` chrome, a red spine, a red tint and the failed glyph, because it had
 * no way to say it was not a failure. It said the right words inside the wrong box. All four of the
 * states a person reaches by being wrong now come through here.
 */
export function NotHere({ sentence, children }: { sentence: React.ReactNode; children?: React.ReactNode }) {
  return <Absence tier="must-act-on" sentence={sentence} action={children} />
}

function WrongTurn({ fault, children }: { fault: Fault; children?: React.ReactNode }) {
  const projects = useProjects()
  const where = fault.elsewhere
  const there = where === null ? null : nameOfProject(projects, where.workspaceId)
  const here = nameOfProject(projects, currentWorkspace())

  /**
   * A LINK PRESSED ACROSS PROJECTS SWITCHES DIRECTLY. Criterion M60: a link into another project needs
   * no second press to switch; it goes straight there.
   *
   * THE PRESS ON THE LINK IS THE CONSENT, AND ASKING AGAIN IS ASKING TWICE. Somebody who presses a
   * link to a record has said where they want to be. Mole Office knowing that the record is one
   * project sideways is not a new question for them to answer — it is an answer Mole Office has and
   * they do not.
   *
   * WHAT IS STILL TRUE AFTERWARDS. The sidebar names the project on every screen, so the move is
   * visible where the reader already looks for it, and the sentence below says what is happening
   * for the frame before the page changes. Nothing is guessed: `elsewhere` is the SERVER saying
   * which project really holds the record.
   *
   * ONLY `elsewhere`, AND ONLY ONCE. A `not-here` fault names no project and moves nobody.
   * `setWorkspace` returns without doing anything when it is already that project, so a re-render
   * cannot loop.
   */
  const goingTo = where === null ? null : where.workspaceId
  const recordThere = where === null ? null : where.recordId
  const stillHere = useMemo(() => recordThere === null ? () => false : stillOnThisPage(recordThere), [goingTo, recordThere])
  useEffect(() => {
    if (goingTo === null || recordThere === null || !stillHere()) return
    navigate(recordPath(recordThere), goingTo)
  }, [goingTo, recordThere, stillHere])

  // THE SERVER'S OWN SENTENCE WITH NO CODE, BY ERRORNOTE'S ONE RULE (decision urY1I-insR_8): its short reason
  // first, marked as the office's words after it, and the whole of it a press away. A sentence the page wrote
  // itself (`said` null) and a coded one, which ErrorNote has already put in the page's language, are drawn as given.
  const ownWords = where === null && fault.code === undefined && (fault.said ?? null) !== null
  const quoted = ownWords ? (fault.reason ?? fault.message) : null
  return (
    <NotHere
      sentence={
        <>
          <strong>
            {/* THE PROJECT'S NAME IS SPACED BY gapBetween (src/shared/spacing.ts): one space beside a name in
                Latin letters ("在 Default 项目中"), none beside a Chinese one. The title is filled by `t` itself,
                outside wordWithSpacedValues, because it stands inside curly quotation marks and takes no space there. */}
            {where !== null ? wordWithSpacedValues((key, values) => t(key, { ...values, title: where.title }), 'error.elsewhere', { project: there! })
              : quoted === null ? fault.message
              : <span className="px-error-said" lang="en">{quoted}</span>}
          </strong>
          {quoted === null ? null : (
            <span className="px-error-own">
              <span className="px-error-own-mark">{t('error.ownWords')}</span>
            </span>
          )}
          {quoted === null || fault.reason === null || fault.reason === undefined ? null : (
            <details className="px-error-more">
              <summary className="px-error-sum">{t('error.wholeRefusal')}</summary>
              <span className="px-error-long" lang="en">{fault.message}</span>
            </details>
          )}
          {where === null ? null : t('error.openingThere')}
          <FaultWire fault={fault} />
        </>
      }
    >
      <>
          {where === null ? null : (
            <Btn
              size="sm"
              variant="primary"
              onClick={() => {
                // THE SAME MOVE THE EFFECT ABOVE MAKES, kept as a press for the reader whose browser
                // ran the effect and whose page did not change — a storage failure in `setWorkspace`
                // is the case, and it says so in its own answer rather than throwing.
                navigate(recordPath(where.recordId), where.workspaceId)
              }}
            >
              {wordWithSpacedValues(t, 'error.openThere', { project: there! })}
            </Btn>
          )}
          {children}
      </>
    </NotHere>
  )
}

/**
 * THE ROUTE, THE STATUS AND THE SERVER'S OWN DETAIL — in Developer mode and nowhere else.
 *
 * `docs/UX-CONTRACT.md` lists record ids, raw stored field names and the API's own note strings
 * among the things that live in Inspect. A route and an HTTP status are the same sort of thing, and
 * they were on every failure in the product in Normal mode. Nothing is lost: this is one press away
 * on every page, and it is rendered conditionally rather than hidden with CSS, so a screen reader
 * on a Normal page is not read a route either.
 */
function FaultWire({ fault }: { fault: Fault | null }) {
  const inspect = useInspect()
  if (fault === null || !inspect) return null
  return (
    <span className="px-error-wire">
      {t('error.wire', { status: fault.status === 0 ? t('error.noAnswer') : t('error.http', { status: fault.status }), path: fault.path })}
      {fault.detail === null ? null : t('error.detail', { detail: fault.detail })}
    </span>
  )
}

/**
 * A PARAGRAPH THE SERVER WROTE FOR A CALLER READING JSON, kept and shown only in Developer mode.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS COMPONENT EXISTS RATHER THAN A RULE SAYING NOT TO PRINT NOTES
 * ---------------------------------------------------------------------------------------
 *
 * Several Mole Office routes send a `note`: a whole paragraph explaining what the numbers beside it mean
 * and what to send next. They are written for an agent, they are good, and they name routes, tables
 * and fields because that is what an agent needs. `docs/UX-CONTRACT.md` lists them among the
 * things that belong in Inspect, by name — *the API's own note strings where the numbers beside
 * them already say it*.
 *
 * They were not there. Home printed *"PUT /api/anchor marks the point you have read to"* twenty
 * pixels above the button that does it, and the Schedule printed *"Anything listed under
 * `recurring` comes round today"* — the field's name, spoken to a person.
 *
 * A pass that rewrote those two paragraphs would have fixed those two paragraphs. **This makes it
 * structural instead**: a `note` goes through here or it does not reach a screen. In Normal mode
 * this renders nothing at all, so a new page written next month cannot leak one by default — it has
 * to write its own sentence, which is the only way the reader gets one in their own words.
 *
 * NOTHING IS DELETED AND NOTHING BECOMES UNREACHABLE, which is Inspect's whole bargain. The
 * paragraph is one press away, whole, unedited, and it is still exactly what `GET` hands an agent.
 */
export function ServerNote({ text }: { text: string | null | undefined }) {
  const inspect = useInspect()
  if (!inspect || text === null || text === undefined || text.trim() === '') return null
  return <p className="px-server-note">{text}</p>
}

export interface LoadingProps {
  /** What is being loaded, e.g. "records". */
  label?: string
  /** The older name for the same thing, still used by pages that have not been rewritten yet. */
  what?: string
  /** How many placeholder rows to hold open. Match the list you are about to show. */
  rows?: number
  /** Keep the component across an answer when its containing list can name the outcome. */
  status?: 'loading' | 'ready' | 'error'
  /** The surrounding part carries this same wait's light. */
  light?: boolean
}

/**
 * Loading is drawn in the final geometry -- same row height, same columns -- so nothing moves
 * when the data lands. A centred spinner would tell you the app is alive and nothing else, and
 * it makes every list jump the moment it is replaced.
 */
export function Loading({ label, what, rows = 3, status = 'loading', light = true }: LoadingProps) {
  const name = label ?? what
  const lightTarget = useRef<HTMLDivElement>(null)
  useLoadingLight(lightTarget, light ? status : 'ready', 6, true)
  if (status !== 'loading') return null
  return (
    <div className="px-loading" role="status" aria-live="polite">
      <span className="px-loading-line">{name ? t('sheet.loading.named', { name }) : t('sheet.loading')}</span>
      <div ref={lightTarget} className="px-loading-rows">
        {Array.from({ length: rows }, (_, i) => (
          <div className="px-row px-skel" key={i} aria-hidden="true">
            <div className="px-row-sev">
              <span className="px-skel-bar" />
            </div>
            <div className="px-row-main">
              <span className="px-skel-bar" style={{ width: `${70 - i * 12}%` }} />
            </div>
            <div className="px-row-right">
              <span className="px-skel-bar" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================ incompleteness

/**
 * A record that is missing content. NOT a record that is wrong.
 *
 * Mole Office stores a record with fields still absent on purpose: a module can be filed the minute
 * work starts and its context written a week later. A record like that is a STUB, and a stub is
 * only an acceptable thing to keep if you can SEE that it is one. That is this component's whole
 * job, and it is the half of the rule that makes the other half safe.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A READER TELLS THIS FROM A DATA PROBLEM, AT A GLANCE, WITHOUT READING A WORD
 * ---------------------------------------------------------------------------------------
 * ModuleView's ProblemPanel and ErrorNote are the WRONG treatment. They carry an alarm colour,
 * a filled tint, a left spine, weight 700, and the word "Failed" or "Broken". They mean:
 * something IS in the record and it is not what it claims to be. Until it is fixed you cannot
 * trust the page around it.
 *
 * This is the UNFINISHED treatment: the `todo` tone, no spine, no alarm fill, weight 500, and
 * the words "not filled in". It means: everything present is fine, there is simply less of it
 * than a finished record carries. Nothing is at risk and nothing needs undoing.
 *
 * That is four independent channels apart — colour, structure (spine or no spine), weight, and
 * word — plus a different silhouette, so the distinction survives greyscale, the mono theme,
 * and a reader who is not reading. `role="alert"` is deliberately absent too, so a screen
 * reader is not interrupted for something that is not an emergency.
 *
 * THE TONE IS BORROWED ON PURPOSE, NOT INVENTED. `todo` is already this app's word for "nobody
 * has done this yet", which is exactly what an unfilled field is, and it is the one tone in the
 * system that is neither an alarm nor a success. `inferred` was the other candidate and is
 * refused: dashed-and-amber means "Mole Office worked this out itself, a human did not assert it"
 * everywhere else in the app, and spending that signal here would cost a meaning already in use.
 */
function incompleteToneVars(): React.CSSProperties {
  return toneVars('todo')
}

/**
 * A bar that is not full: the silhouette of unfinished.
 *
 * Deliberately not another closed figure from the state alphabet. All ten state glyphs are
 * closed shapes or arrows; incompleteness is not a state a person sets, it is a statement about
 * how much of the record exists, so it takes its shape from a different family and cannot be
 * misread as a state at 13px. It is the same picture as the module page's progress meter, which
 * already means "how much of this is done".
 *
 * SQUARE-ISH CORNERS, not a pill, and the fill flush to the left with the same inset all round.
 * Drawn as a pill with a floating fill it read as a toggle switch in the off position, which is
 * a control — and by this file's own affordance grammar nothing inert may look like one.
 */
export function IncompleteGlyph() {
  return (
    <svg className="px-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false" stroke="currentColor">
      <rect x="1.7" y="4.9" width="12.6" height="6.2" rx="1.6" fill="none" strokeWidth="1.3" />
      <rect x="3.3" y="6.5" width="4.4" height="3" rx="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** How many unfilled fields, as a phrase that says what to do about them rather than a number. */
function fillPhrase(count: number): string {
  return t('sheet.incomplete.count', { n: count })
}

export interface IncompleteMarkProps {
  /** How many fields are not filled in. */
  count: number
  /** The kind, so the tooltip can name the thing: "module", "claim". */
  what?: string
}

/**
 * The small marker a list row or a link carries, so an unfinished record can be spotted BEFORE
 * it is opened.
 *
 * A complete record renders nothing at all. That is the design: the marker is the exception, so
 * a page full of finished work stays quiet, and the eye is drawn only to the stubs. It is inert
 * — no box that suggests it writes, no pointer — because the thing to do about it is on the
 * record's own page, not here.
 */
export function IncompleteMark({ count, what = t('sheet.record') }: IncompleteMarkProps) {
  // AN ABSENT COUNT IS NOT ZERO, AND IT IS NOT A NUMBER TO PRINT. Without this line a row whose
  // record lacked the count drew the words "undefined to fill in" (problem vAGzVnazwE2p). The server
  // always sends the count, so an absent one is a broken assumption, and it fails here, where the
  // page's fault boundary says so, rather than drawing a word nobody wrote.
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`The mark for unfilled fields was given ${String(count)} as its count. It needs a whole number, so the record's count of unfilled fields is missing or wrong.`)
  }
  if (count < 1) return null
  return (
    <span
      className="px-inc-mark"
      style={incompleteToneVars()}
      title={t('sheet.incomplete.detail', { n: count, what })}
    >
      <IncompleteGlyph />
      <span className="px-inc-mark-word">{fillPhrase(count)}</span>
    </span>
  )
}

export interface IncompleteProps {
  /** Straight from `completenessOf(record.kind, record.data)`. Empty means complete. */
  items: readonly Incompleteness[]
  /** The kind, so the heading names what is unfinished. */
  what?: string
  /**
   * The control that FILLS ONE IN, drawn under the sentence that reports the absence.
   *
   * Optional, and null for a line it cannot serve, because two of the paths `completenessOf`
   * returns are `data` and `kind` rather than a field — and because some declared shapes have no
   * single honest box. A line with no control still reads exactly as it did: the sentence already
   * names the field and the request that supplies it.
   *
   * WHY IT IS A CALLBACK RATHER THAN SOMETHING THIS COMPONENT BUILDS. This file knows nothing
   * about kinds, fields or writing, and must not learn: it draws a list of sentences. What can be
   * written, and how, is the record page's business, and it is derived there from the same
   * declaration that refuses a bad write.
   */
  control?: (item: Incompleteness) => React.ReactNode
}

/**
 * Everything one record still needs, each line saying what the field is FOR.
 *
 * The whole of `message` is rendered, never a shortened version of it. That sentence is written
 * in the voice of the field's own description — what to write, why it matters, and a real
 * example — which is the difference between a list that can be acted on and a list that says
 * "context is required" and leaves the author to guess what good looks like.
 *
 * `path` is shown as the small mono label because it is literally the key of the PATCH that
 * fixes the line, and it is what the id on each item anchors to. It is never parsed or stripped
 * here: two of the paths completenessOf can return are `data` and `kind` rather than
 * `data.<field>`, and a component that assumed the prefix would mangle exactly the two records
 * that are in the worst shape.
 */
export function Incomplete({ items, what = t('sheet.record'), control }: IncompleteProps) {
  const inspect = useInspect()
  const headingId = useId()
  if (items.length === 0) return null

  return (
    <section className="px-inc" style={incompleteToneVars()} aria-labelledby={headingId}>
      <header className="px-inc-head">
        {/* THE ONE PLACE A RECORD PAGE SAYS THE COUNT (round 38, review AEczCyDHb-Xu). The
            heading beside it names what is missing without the number, so a screen reader reads
            this chip and hears the count once. The mark's own markup rather than <IncompleteMark>,
            because that one's hover words say "open it", and here it is already open. The tone
            variables come from the section, so it is the same mark, drawn by the same rule. */}
        <span className="px-inc-mark">
          <IncompleteGlyph />
          <span className="px-inc-mark-word">{fillPhrase(items.length)}</span>
        </span>
        <h2 className="px-inc-title" id={headingId}>
          {t('sheet.incomplete.heading', { what })}
        </h2>
      </header>
      {/* THREE SENTENCES BECAME A MARK. Two of them described the list they sat above — "each line
          says what the field is for and shows a real example" — which the reader can see by looking
          at the list. The first is worth keeping, because "this record is incomplete" reads as a
          fault and it is not one, and no arrangement of pixels says so. It is behind the mark. */}
      {/* A div rather than a p, because Hint renders a details element and a details may not sit
          inside a paragraph. This is not a lint nicety: the browser CLOSES the paragraph early when
          it meets one, so the markup the server renders and the markup the browser builds are
          different shapes, and React reported exactly that on every theme of the component sheet.
          The rule above sets its own margin, so nothing about the drawing depends on the tag. */}
      <div className="px-inc-lede">
        {t('sheet.incomplete.notWrong')}
        <Hint label={t('sheet.incomplete.why')} under>
          {t('sheet.incomplete.reason')}
        </Hint>
      </div>
      <ul className="px-inc-list">
        {items.map((item) => {
          const box = control?.(item)
          return (
            <li className="px-inc-item" key={item.path} id={`incomplete-${item.path}`}>
              {/* THE STORED PATH IS A PATH, and it was in first-glance space on every incomplete
                  record: "data.depth" beside a sentence that already says, in words, what is
                  missing and what it is for. The sentence is the answer; the path is how to write
                  it over HTTP, which is an agent's question and not a reader's. */}
              {inspect ? <code className="px-inc-path">{item.path}</code> : null}
              <span className="px-inc-msg">{item.message}</span>
              {/* Under the sentence that reports the absence, not on another screen and not
                  behind a copyable PATCH: the field this line is about is the field this box
                  writes. Nothing is drawn when the caller has no control for the line. */}
              {box === null || box === undefined || box === false ? null : (
                <div className="px-inc-write">{box}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ============================================================================ the alarm scale

/**
 * HOW LOUDLY A ROW IS DRAWN. Four steps, and only the top one gets the full alarm colour.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SCALE AT ALL, WHEN THERE IS ALREADY A STATE COLOUR
 * ---------------------------------------------------------------------------------------
 *
 * Before this, every severe state was drawn at one strength: a checklist item that failed
 * thirteen days ago and an obligation five days past a date somebody agreed were the same red,
 * the same weight, the same spine. So a page of old failures shouted exactly as loudly as the one
 * row that had to be dealt with today, and the reader learned to stop looking. That is the failure
 * this scale exists to remove, and it is the second approved decision: strong red is reserved for
 * genuinely urgent and overdue, and an old failure must RECEDE rather than compete.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE TOP STEP IS ALLOWED TO PAINT — THE RED BUDGET
 * ---------------------------------------------------------------------------------------
 *
 * A level reached every object on its row at once, so an urgent row printed its state word, its
 * age, its rail, its tint and its borders all in the alarm colour, and six such rows said nothing
 * about which of them was worst. So `urgent` still means the same thing; what it PAINTS is now a
 * budget, spent on what a reader cannot infer:
 *
 *   the rail                 which ranks the row, on every urgent row;
 *   a mark                   a person who could be hurt, a recorded consequence — `.px-mark`;
 *   a missed date            the number, and only when it is lateness — `data-count="late"`;
 *   an error                 `.px-error`, which is not on this scale at all.
 *
 * Everything else the row carries — the stored word, how old it is, its kind, its rank — is
 * descriptive metadata, and metadata is drawn in text colour at every step. The filled ground goes
 * to safety alone. The rule of thumb is ONE STRONG-RED OBJECT PER ROW: a row's presence in the
 * list, and its position in it, have already said that it matters.
 *
 * RED HAS NO HEADROOM ABOVE RED. There is nothing louder to escalate to, so escalation is carried
 * by the NUMBER inside the mark and not by the colour: "2 days late", "5 days late", "18 days
 * late" are all `urgent` and all the same red, and the number is what grows. Trying to make the
 * eighteen-day one louder than the two-day one would mean either inventing a colour above red,
 * which does not exist, or quietening the two-day one, which is a lie about a broken promise.
 *
 * THE LEVEL IS NOT A SECOND STATE VOCABULARY. It says how loud, never what is wrong. What is
 * wrong is the stored state word beside it, and why the row is on the screen at all is the reason
 * sentence under it. A reader never has to learn these four names; they are a drawing instruction.
 */
export const ALARM_LEVELS = ['urgent', 'raised', 'plain', 'faded'] as const
export type AlarmLevel = (typeof ALARM_LEVELS)[number]

/**
 * One sentence per level, saying what earns it.
 *
 * Shown on the component sheet and carried as the mark's tooltip, so a reader who wonders why one
 * row is red and its neighbour is grey can find out without reading this file.
 */
export const ALARM_NOTES: Readonly<Record<AlarmLevel, string>> = {
  get urgent() { return t('sheet.alarm.urgent') },
  get raised() { return t('sheet.alarm.raised') },
  get plain() { return t('sheet.alarm.plain') },
  get faded() { return t('sheet.alarm.faded') },
}

/** How fresh a stop has to be to still count as news. Two days: a stop from yesterday is news. */
export const ALARM_FRESH_DAYS = 2
/** How long a stop has to sit before it recedes. A week: past that it is a fact, not an event. */
export const ALARM_FADE_DAYS = 7

/**
 * What the server already worked out, in the three numbers the scale needs.
 *
 * EVERY FIELD IS COPIED FROM AN ATTENTION ROW. Nothing here re-reads a record, re-classifies a
 * state word or re-applies the rule — the rule lives on the server and the row carries its answer.
 * This function only decides how loudly to draw a row the server already selected.
 */
export interface AlarmInput {
  /** `row.safety`. The server's separate sort key: a stored consequence of `person`. */
  safety: boolean
  /**
   * `row.reason.owed?.lateMs`. Milliseconds past the agreed date; negative while it is still
   * ahead. Null when nobody agreed a date, or when nobody outside is waiting at all — and null is
   * not "on time", so it earns no level of its own.
   */
  lateMs: number | null
  /**
   * Whole days since anything was recorded about it, from `reason.stoppedShort.since`. Null when
   * the row cannot be dated, which the server also reports and which is not the same as new.
   */
  satDays: number | null
}

/**
 * Which of the four levels to draw a row at.
 *
 * Read top to bottom; the first answer wins. Safety is first for the same reason it is a separate
 * sort key on the server: nothing out-adds a person being hurt, and a safety row filed one minute
 * ago must not be quieter than a stale one.
 */
export function alarmFor(input: AlarmInput): AlarmLevel {
  if (input.safety) return 'urgent'
  if (input.lateMs !== null && input.lateMs > 0) return 'urgent'
  if (input.lateMs !== null && -input.lateMs <= DUE_SOON_HOURS * HOUR_MS) return 'raised'
  // An undatable row is drawn at `plain`, never at `faded`. "Mole Office cannot tell how long this has
  // sat" is not evidence that it has sat a long time, and quietening it on a guess is the silent
  // default this product forbids.
  if (input.satDays === null) return 'plain'
  if (input.satDays < ALARM_FRESH_DAYS) return 'raised'
  if (input.satDays < ALARM_FADE_DAYS) return 'plain'
  return 'faded'
}

/**
 * How loudly to draw a state word on a surface that has NO attention data — age, and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS, AND WHY IT IS ONE FUNCTION RATHER THAN ONE PER PAGE
 * ---------------------------------------------------------------------------------------
 *
 * The home page draws its rows from GET /api/attention, so it knows whether a person could be hurt
 * and how far past its date a promise is, and `alarmFor` uses all three inputs. The records list
 * and the sessions list have neither of those facts: they hold a record and a stamp. Left with no
 * level at all they drew every stopped word at FULL alarm strength, so a session that crashed
 * forty-nine days ago shouted exactly as loudly as an emergency stop filed this morning — which is
 * the half of approved decision 2 about old failures receding, failed on two pages out of four.
 *
 * So both pages ask this, and this asks `alarmFor`. One statement of the fallback, in the same file
 * as the scale it feeds: two pages with their own copy is how this codebase's recurring defect gets
 * made.
 *
 * TWO THINGS IT DELIBERATELY WILL NOT DO. It never returns `urgent`, because it cannot see a
 * consequence or a date and inventing one to shout with is the silent default this product bans;
 * the loudest it can say is "this stopped recently". And it returns nothing at all for work that
 * has not stopped short — an alarm scale that paints running, finished and not-yet-started rows has
 * stopped being a scale.
 */
export function ageAlarm(progress: Progress | null, since: string | null, now: number): AlarmLevel | undefined {
  if (progress !== 'stopped_short') return undefined
  return alarmFor({ safety: false, lateMs: null, satDays: daysSince(since, now) })
}

/**
 * Whole days between a stored stamp and now, or null when the stamp cannot be read.
 *
 * Null rather than 0. A stamp nobody can parse is not a stamp from today, and the difference
 * decides whether a row is drawn `raised` or `plain`.
 */
export function daysSince(stamp: string | null, now: number = Date.now()): number | null {
  if (stamp === null) return null
  const date = parseStamp(stamp)
  if (date === null) return null
  return Math.max(0, Math.floor((now - date.getTime()) / DAY_MS))
}

/** "13 days", "1 day", "under a day". The number that grows when the colour cannot. */
export function dayPhrase(ms: number): string {
  const days = Math.floor(Math.abs(ms) / DAY_MS)
  if (days === 0) return 'under a day'
  return `${days} day${days === 1 ? '' : 's'}`
}

/**
 * How late something is, in words AND in which of the two answers it is, or null when nobody
 * agreed a date.
 *
 * Null is returned rather than a phrase, so a caller has to say "no date was ever agreed" in its
 * own words instead of printing something that looks like a schedule.
 *
 * IT RETURNS THE KIND BECAUSE IT IS THE ONE PLACE THE THRESHOLD IS APPLIED. A caller that wanted
 * to draw a missed date differently from a date still ahead would otherwise have to count the days
 * again, or read the words back — two places deciding one thing, which is how this codebase's
 * recurring defect gets made. The day the date falls on is `late`: it is the last moment the
 * promise can be kept, and it is the pair the red budget spends its colour on.
 *
 * THE DAYS ARE CALENDAR DAYS, counted by `dueCount` in src/shared/deadlines.ts in the person's time
 * zone, so a clock change in the span moves nothing (problem R74WVeH6LZPU). `dueMs` is the moment it
 * is due and `due` whether a date or a moment was stored, as `readDueStamp` in web/lib/attention.ts reads a
 * stored stamp; `zone` is the person's by default.
 */
export function latePhrase(dueMs: number | null, now: number, zone?: string, due: DueForm = 'a date'): { kind: CountKind; text: string } | null {
  if (dueMs === null) return null
  // ONE KEY PER SENTENCE, WITH THE COUNT AS A VALUE, because Chinese puts the number in another
  // place and says a plural another way. Plan 7FEOshq3mBGG, row F1.
  const count = dueCount(dueMs, now, zone, due)
  if (count.kind === 'late') {
    return { kind: 'late', text: count.days === 0 ? t('unlistedWords.late.underADay') : t('unlistedWords.late.days', { n: count.days }) }
  }
  if (count.kind === 'due-today') return { kind: 'late', text: t('unlistedWords.due.today') }
  return { kind: 'due', text: t('unlistedWords.due.inDays', { n: count.days }) }
}

// ============================================================================ surface emphasis

/**
 * THE SAME SEMANTIC FACT, DIFFERENT SURFACE EMPHASIS.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, IN ONE PARAGRAPH
 * ---------------------------------------------------------------------------------------
 *
 * A state word means one thing everywhere in Mole Office. `crashed` is `crashed` on every page and no
 * surface is allowed to change that. What a surface MAY change is how loudly it draws the fact,
 * and there are exactly two answers, because there are exactly two questions a page here can be
 * asking.
 *
 *   PERCEPTUAL — "what needs me?" Home, and only Home. The reader is scanning, not comparing, so
 *                colour is spent on the alarm scale and taken off everything else. Two rows in the
 *                same state SHOULD look alike here: the thing being distinguished is urgency, not
 *                state. This is the drawing every surface gets when it declares nothing, so Home
 *                declares nothing and is unchanged by any of this.
 *
 *   ANALYTICAL — "which state is this?" Sessions, Records and Queries. The reader is comparing,
 *                so states must be told apart without reading the word. Colour goes back to the
 *                state; the alarm level is left with the weight, and the ROW keeps the whole
 *                ladder — rail, tint, faded title — so an old row still recedes.
 *
 *                TWO FAMILIES GET SOMETHING OTHER THAN THEIR OWN TONE, and each rule in UI_CSS
 *                carries the measurement that says why: `danger` takes the hue on its ink and edge
 *                but NOT the filled ground, which is spent on marks and means a person is in the
 *                row, and `warning` has no tone of its own to take. Read them there rather than
 *                here — one of the two places would otherwise go stale.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY THE FIX IS A SURFACE SWITCH RATHER THAN A SECOND SCALE
 * ---------------------------------------------------------------------------------------
 *
 * The red budget was right and it was applied in the wrong place: through the shared chip rules,
 * so it reached every surface. On Home that is exactly what was wanted. On the sessions list it
 * meant that `idle`, `crashed` and `orphaned` all carried an age-derived level, all lost their
 * hue to it, and came out as three grey chips differing only in a word and a 16px shape. A list
 * whose whole job is telling six session states apart had four of them drawn the same.
 *
 * The fix is NOT a second colour scale. There is one alarm scale, one set of --st-* state tones,
 * and one meaning per word. What the emphasis decides is which of those two already-existing
 * things owns the chip's colour on this surface.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO APPLY IT — one line, once, at the top of a surface
 * ---------------------------------------------------------------------------------------
 *
 *   <div className="stack" {...surfaceEmphasis('analytical')}>
 *
 * ONE EMPHASIS PER SURFACE. The stylesheet reads it with descendant selectors, so a perceptual
 * island nested inside an analytical page would still be drawn analytically. Declare it once, on
 * the element the whole page hangs off, and nowhere else.
 *
 * NO PRODUCT SURFACE HAS DECLARED ONE YET. This file, the stylesheet and the component sheet carry
 * the mechanism; the pages named above are where it gets applied, and until one of them does, every
 * page in Mole Office is drawn perceptually and nothing has moved. That is deliberate rather than
 * unfinished: the shared primitives land on their own so that a page can be changed and looked at
 * one at a time.
 */
export const SURFACE_EMPHASES = ['perceptual', 'analytical'] as const
export type SurfaceEmphasis = (typeof SURFACE_EMPHASES)[number]

/** One sentence per emphasis: what the surface is for, and what that buys its chips. */
export const EMPHASIS_NOTES: Readonly<Record<SurfaceEmphasis, string>> = {
  get perceptual() { return t('sheet.emphasis.perceptual') },
  get analytical() { return t('sheet.emphasis.analytical') },
}

/**
 * The props that declare a surface's emphasis. Spread onto the element the page hangs off.
 *
 * A function rather than a bare attribute so the name is typed in one place: six surfaces spelling
 * `data-px-emphasis` by hand is six chances to spell it wrong, and a misspelt attribute is a page
 * that silently draws at the other emphasis with nothing failing.
 */
export function surfaceEmphasis(emphasis: SurfaceEmphasis): { 'data-px-emphasis': SurfaceEmphasis } {
  return { 'data-px-emphasis': emphasis }
}

// ---------------------------------------------------------------------------- state families

/**
 * WHAT KIND OF FACT A STATE IS. Six answers, and they are the same on every surface.
 *
 * NOT THE RECORD FAMILIES. `KIND_FAMILIES` groups the sixteen record KINDS into six reading
 * groups — work to do, modules and pipelines, decisions, findings, ideas, notes and messages — and
 * is drawn by `FamilyTag` in monochrome. This groups the ten STATES, it is spelt `data-state-family` in the markup, and
 * the two never meet. The names are kept apart on purpose: one file with two things called
 * "family" is a file the next reader gets wrong.
 *
 * This is a GLOBAL semantic, not a surface's opinion: `crashed` is a fault wherever it is drawn.
 * The families exist so that the emphasis above has something to be specific about, and so that a
 * surface choosing which chip to borrow for a word of its own (`orphaned`, `unmet`) can pick by
 * what the word MEANS rather than by which colour looked right that afternoon.
 *
 * FIVE OF THE SIX ARE INKED BY THE STATE'S OWN --st-* TONE, which already exists and which every
 * theme has been tuned against. `warning` is the sixth and it has no tone of its own; the reason
 * is written on the family below, because it is the one thing here that is not obvious.
 */
export const STATE_FAMILIES = ['neutral', 'active', 'success', 'warning', 'danger', 'unknown'] as const
export type StateFamily = (typeof STATE_FAMILIES)[number]

/** One sentence per family, for the component sheet and for anybody choosing one. */
export const STATE_FAMILY_MEANINGS: Readonly<Record<StateFamily, string>> = {
  get neutral() { return t('sheet.stateFamily.neutral') },
  get active() { return t('sheet.stateFamily.active') },
  get success() { return t('sheet.stateFamily.success') },
  get warning() { return t('sheet.stateFamily.warning') },
  get danger() { return t('sheet.stateFamily.danger') },
  get unknown() { return t('sheet.stateFamily.unknown') },
}

/**
 * Which family each of the ten chip states belongs to.
 *
 * `overdue` IS `warning` AND NOT `danger`, WHICH IS THE ONE ENTRY WORTH ARGUING ABOUT. A date that
 * has passed is a promise that needs keeping; nothing is broken. Home still prints lateness in the
 * alarm colour, because on Home the red is on the NUMBER — `.px-chip-count[data-count="late"]`,
 * drawn from --st-overdue — and nothing here touches that. This is the principle at the top of
 * this block working as intended: one fact, two emphases, no second meaning.
 */
export const STATE_FAMILY: Readonly<Record<PanelState, StateFamily>> = {
  todo: 'neutral',
  doing: 'active',
  running: 'active',
  done: 'success',
  failed: 'danger',
  blocked: 'danger',
  broken: 'danger',
  crashed: 'danger',
  overdue: 'warning',
  inferred: 'unknown',
}

/**
 * Which family each classification of a STORED word belongs to.
 *
 * `stopped_short` is `warning`, and that is what stops a catalogue reading as an alarm. A problem
 * in state `open`, a session that is `idle` and a purchase that is `chasing` are all stopped short
 * and all completely ordinary; they borrow the `failed` tone because PROGRESS_TONE has nothing
 * else to give them, and drawing a whole records page in that tone is the exact reading the red
 * budget removed. The family is what lets the analytical surfaces keep the hue off it while
 * handing every other family its colour back.
 */
export const PROGRESS_FAMILY: Readonly<Record<Progress, StateFamily>> = {
  not_started: 'neutral',
  in_flight: 'active',
  finished: 'success',
  stopped_short: 'warning',
  paused: 'neutral',
  unknown: 'unknown',
  unclassified: 'unknown',
}

// ============================================================================ stored state words

/**
 * A state word EXACTLY AS STORED, drawn by what the server says it means.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE StateChip
 * ---------------------------------------------------------------------------------------
 *
 * `StateChip` knows ten words, and they are the ten this interface computes for itself. The
 * records do not use those ten. A problem is `open`, a session is `idle`, a purchase is `chasing`,
 * and none of them can be drawn by a component whose vocabulary is a fixed list. Until now such a
 * word had nowhere to go, which is how a purchase in a state nobody had thought about was passed
 * over silently.
 *
 * So: THE WORD COMES FROM THE RECORD AND THE DRAWING COMES FROM THE CLASSIFICATION. The colour and
 * the shape are chosen by `progress`, which the server computed with `progressOf`; the word is
 * printed as it was written. Nothing here maps a word to a picture, so a word this product has
 * never seen still draws correctly — as a question, which is what it is.
 *
 * THIS IS THE APPROVED ANSWER TO `idle`. Decision 4: keep the stored name, show the reason beside
 * it. `idle` prints as `idle` and classifies as stopped short, so it is drawn as work that stopped
 * short and the reason line beneath says why. Nothing infers "waiting on you" from free text.
 */

/** What each classification means, in one short phrase, for a tooltip and for the sheet. */
export const PROGRESS_WORDS: Readonly<Record<Progress, string>> = PROGRESS_DETAIL_WORDS

/**
 * Which state token family inks each classification.
 *
 * FOUR OF THE SEVEN ARE DELIBERATELY THE SAME NEUTRAL. `paused`, `unknown`, `unclassified` and
 * `not_started` all take the `todo` tone, and they are told apart by their word and their shape.
 * That is not a shortage of colours; it is the rule that colour in this product is spent on
 * whether work is in trouble and on nothing else. A pause is a decision, an unclassified word is a
 * question and an undetermined state is an admission — none of the three is bad news, and giving
 * each its own hue would put three more colours next to the one that means somebody must act.
 */
const PROGRESS_TONE: Readonly<Record<Progress, PanelState>> = {
  not_started: 'todo',
  in_flight: 'doing',
  stopped_short: 'failed',
  finished: 'done',
  paused: 'todo',
  unknown: 'todo',
  unclassified: 'todo',
}

/**
 * Eight silhouettes: the seven classifications plus "no state at all".
 *
 * THESE ARE THE MARKS' GLYPHS AND NOT THE STATE CHIP'S. A state chip takes its shape from the WORD
 * on the record, through DRAWING_GLYPHS below, because the classification is exactly what collapsed
 * five different situations into one picture. What is left here is used by the marks that really
 * are about a classification and nothing else: the pause mark, the unclassified mark, and the two
 * marks that mean no word was written.
 *
 * Three of them borrow from the state alphabet on purpose — `not_started` is the todo square,
 * `in_flight` the half-disc, `finished` the tick — because they mean the same thing and drawing a
 * second shape for the same idea would be a second thing to learn. The other five are new and are
 * all different from each other and from the ten state glyphs.
 */
const PROGRESS_GLYPHS: Readonly<Record<Progress | 'none', React.ReactNode>> = {
  not_started: STATE_GLYPHS.todo,
  in_flight: STATE_GLYPHS.doing,
  finished: STATE_GLYPHS.done,
  /** A line that runs into a wall and stops: the picture of work that began and did not finish. */
  stopped_short: (
    <>
      <path d="M2 8h6.4M6.2 5.8L8.6 8l-2.4 2.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.4 2.6v10.8" strokeWidth="2.1" strokeLinecap="round" />
    </>
  ),
  /** Two bars. Put down on purpose, and the one mark in the set that means somebody decided. */
  paused: (
    <>
      <rect x="4.4" y="3.4" width="2.4" height="9.2" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="9.2" y="3.4" width="2.4" height="9.2" rx="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  /** A closed circle with a bar through it: looked at, and genuinely could not be determined. */
  unknown: (
    <>
      <circle cx="8" cy="8" r="5.4" fill="none" strokeWidth="1.7" />
      <path d="M5.2 8h5.6" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  /** A question. Not a verdict: nobody has said what the word means, which is a thing to answer. */
  unclassified: (
    <>
      <circle cx="8" cy="8" r="5.4" fill="none" strokeWidth="1.7" />
      <path d="M6.2 6.3a1.85 1.85 0 1 1 1.9 2.2v1" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.05" cy="11.1" r="0.85" fill="currentColor" stroke="none" />
    </>
  ),
  /**
   * Two brackets with nothing between them: a slot where a word was expected and none was written.
   *
   * NOT a dashed outline, even though an empty dashed box is the obvious drawing. Dashed means
   * "Mole Office worked this out" everywhere in this app and is spent on exactly that.
   */
  none: (
    <path
      d="M6.4 3.2H3.2v9.6h3.2M9.6 3.2h3.2v9.6H9.6"
      fill="none"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
}

// ---------------------------------------------------------------------------- the state drawing

/**
 * HOW A STORED STATE WORD IS DRAWN. EIGHT DRAWINGS, CHOSEN BY THE WORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The drawing used to be chosen by what a word CLASSIFIES as, so 32 stored words came out as four
 * grounds and seven shapes. Measured in Chromium on the live corpus on 13 August: every one of
 * Home's 20 state chips was the identical filled black block — ground, ink, edge colour and edge
 * style all equal — and between them they carried five different words: `open`, `blocked`,
 * `orphaned`, `idle`, `crashed`. Those are five different jobs for a person: work you can pick up,
 * work you cannot pick up, a dead run holding a port, an agent waiting for your answer, and
 * something that broke. Drawing them alike hid all five differences.
 *
 * So the drawing is keyed by the word. The classification is still true and is still what the
 * attention rule runs on; it is simply not what a reader needs from the shape.
 *
 * ---------------------------------------------------------------------------------------
 * THE ALPHABET, AND WHY IT IS FIVE SHAPES AND NOT FOUR
 * ---------------------------------------------------------------------------------------
 *
 * docs/UX-CONTRACT.md set four: filled block, outline, plain text, dashed outline. Four cannot
 * separate "you can start this now" from "you cannot start this at all", and those are the two most
 * different situations on the page. The fifth is the barred outline, and two more variants ride
 * inside existing shapes rather than adding a shape: the broken glyph inside the outline, and the
 * struck glyph inside plain text.
 *
 *   filled block          somebody is waiting on you right now
 *   outline, hollow       nobody has started it
 *   outline, filled       somebody is on it right now
 *   outline, barred       stopped, and not by you — clear something else first
 *   outline, broken       it was tried and it broke — read the reason
 *   plain text, tick      it reached its end and nothing is owed
 *   plain text, struck    it ended without delivering — do not build on it
 *   dashed outline        nobody can say
 *
 * NOTHING IS STATED BY COLOUR. Every drawing here is a ground, an edge, a weight and a shape, and
 * every chip carries its word as well. The green that used to ink the ended states is gone: it sat
 * on a withdrawn measurement, an abandoned promise and a retired subsystem, and a green tick reads
 * as "good, trust this".
 *
 * THE FILLED BLOCK IS THE SCARCE ONE. It is the heaviest object on a row, so it is spent on the two
 * situations where the wait is the point and the fix takes seconds — an agent waiting for your
 * answer, and a dead run still holding a port or a GPU — plus anything past a date somebody agreed.
 * On Home that is about five rows instead of twenty.
 */
export const STATE_DRAWINGS = [
  'waiting-on-you',
  'not-started',
  'under-way',
  'held-up',
  'broke',
  'ended',
  'ended-empty',
  'nobody-can-say',
] as const
export type StateDrawing = (typeof STATE_DRAWINGS)[number]

/** What each drawing tells a reader to do. One sentence, for the component sheet and for tooltips. */
export const STATE_DRAWING_MEANINGS: Readonly<Record<StateDrawing, string>> = {
  get 'waiting-on-you'() { return t('sheet.drawing.waiting-on-you') },
  get 'not-started'() { return t('sheet.drawing.not-started') },
  get 'under-way'() { return t('sheet.drawing.under-way') },
  get 'held-up'() { return t('sheet.drawing.held-up') },
  get broke() { return t('sheet.drawing.broke') },
  get ended() { return t('sheet.drawing.ended') },
  get 'ended-empty'() { return t('sheet.drawing.ended-empty') },
  get 'nobody-can-say'() { return t('sheet.drawing.nobody-can-say') },
}

/**
 * WHICH DRAWING EACH STORED WORD TAKES.
 *
 * Keyed by the word, and that is the whole point of the table. Two entries deliberately disagree
 * with what the word classifies as, and they are the two the measurement was about: `open`
 * classifies as stopped short and is drawn as work somebody is on, because a problem in state
 * `open` is work you can pick up; `ordered` classifies as in flight and is drawn as not started,
 * because nobody has begun anything until the thing arrives.
 *
 * NINE PAIRS SHARE A DRAWING ON PURPOSE: failed/crashed, done/finished, done/fixed, finished/fixed,
 * todo/new, active/doing, paused/parked, paused/deferred, parked/deferred. They mean the same thing
 * to a person, and splitting all 32 words apart would put a new alphabet in front of somebody who
 * has not learned the first one.
 *
 * EVERY WORD IN `STATE_MEANING` MUST BE HERE, and tests/state-drawing.test.ts fails the suite when
 * one is not. Without that test this table and that one are the same fact worked out in two places:
 * a word could be classified and have no drawing, and it would quietly come out as "nobody can
 * say", which is a lie about a word somebody has classified.
 *
 * A DIRECTION'S DEPTH RUNGS ARE NOT HERE. `integrated` and `defended` are rungs on the direction
 * ladder, not state words — src/shared/work.ts says why they are kept out of `STATE_MEANING` — so a
 * drawing for them would be a drawing nothing can ever reach.
 */
export const STATE_DRAWING_BY_WORD: Readonly<Record<string, StateDrawing>> = {
  // An agent stopped and needs an answer; a dead run is holding a port or a GPU. Both take seconds.
  idle: 'waiting-on-you',
  orphaned: 'waiting-on-you',

  todo: 'not-started',
  new: 'not-started',
  wanted: 'not-started',
  proposed: 'not-started',
  ordered: 'not-started',
  // A note somebody left on something, or a comment to an agent, that has not gone anywhere. It is
  // drawn as not started for the same reason `wanted` is: nothing has begun, and the writer can
  // still change it.
  queued: 'not-started',

  doing: 'under-way',
  running: 'under-way',
  active: 'under-way',
  open: 'under-way',
  // It has gone to somebody and nothing has come back. Under way, and NOT waiting-on-you: the
  // person waiting is whoever it was sent to, and the filled block is scarce on purpose.
  sent: 'under-way',
  // TWO MORE STEPS OF THE SAME JOURNEY, AND THEY DRAW THE SAME. `delivered` is a listener having
  // been handed it; `picked_up` is the agent saying by id that it has it. Both are further along
  // than `sent` and neither is a different answer to "has anything come back" — the drawing says
  // where the work stands and the word beside it says how far along. Giving either its own drawing
  // would put four marks on one journey and make a reader learn which of them meant trouble.
  delivered: 'under-way',
  picked_up: 'under-way',

  blocked: 'held-up',
  parked: 'held-up',
  paused: 'held-up',
  deferred: 'held-up',
  // NOT `chasing`, WHICH THE LIVE CORPUS CARRIES. Nothing has ever classified it -- it is not in
  // STATE_MEANING -- so giving it a drawing here would be this file answering a question the
  // product is asking. It draws as "nobody can say" until somebody says what it means.

  failed: 'broke',
  crashed: 'broke',

  // THE INCIDENT LADDER, classified in STATE_MEANING (criterion I2 and I7). `investigating` and
  // `corrected` are in_flight, so they draw under way: causes are being worked out, and the
  // correction exists while its verification does not. `verified` is finished, because what remains
  // is the closing line, which is a record-keeping act and not work. Keyed on the word like every
  // other row here, so the three cannot come out as "nobody can say" while a word beside them says
  // what they mean.
  investigating: 'under-way',
  corrected: 'under-way',
  verified: 'ended',

  done: 'ended',
  finished: 'ended',
  // A GOAL THAT IS MET. Criterion P1, 15 September 2026. It is an ending like `done` and not like
  // `dropped`: what the work was for is now true, so it draws the full block rather than the empty
  // one. A goal somebody gave up carries `dropped`, which is already below with the other endings
  // that left nothing behind.
  met: 'ended',
  fixed: 'ended',
  fulfilled: 'ended',
  closed: 'ended',
  stable: 'ended',
  arrived: 'ended',
  measured: 'ended',
  // Somebody dealt with it. It reached its end and nothing is owed, and the note stays exactly as
  // readable as it was — being answered hides nothing.
  answered: 'ended',
  // The same event under the word that replaced it in MESSAGE_STATES. It draws the same because it
  // means the same, and both words are here because records written before the change hold the old
  // one and a reader meeting it must not be told Mole Office has never heard of it.
  handled: 'ended',

  cancelled: 'ended-empty',
  dropped: 'ended-empty',
  retracted: 'ended-empty',
  retired: 'ended-empty',
  worked_around: 'ended-empty',
  accepted: 'ended-empty',

  // THE MERGE QUEUE'S TWELVE WORDS (sandbox v1, src/shared/merge-queue.ts), drawn as STATE_MEANING
  // classifies them. The eight the office is carrying the entry through are under way. `merged` is an
  // ending with its work in the main world. `bounced` was tried and sent back for a reason its
  // submitter reads and fixes, so it draws as broke. `withdrawn` and `superseded` ended without
  // delivering, and nothing is built on them.
  submitted: 'under-way',
  pinned: 'under-way',
  judged: 'under-way',
  integrating: 'under-way',
  resolving: 'under-way',
  reinspecting: 'under-way',
  testing: 'under-way',
  landing: 'under-way',
  merged: 'ended',
  bounced: 'broke',
  withdrawn: 'ended-empty',
  superseded: 'ended-empty',

  // AN EMERGENCY PUSH TO MAIN'S THREE WORDS (src/shared/emergency-push.ts), drawn as STATE_MEANING classifies them.
  // A push holding main is under way. A push that moved main is an ending with its work done. A stopped push was
  // tried and left main where it was, so it draws as broke, as a bounced entry does.
  pushing: 'under-way',
  pushed: 'ended',
  stopped: 'broke',

  // THE TOOLSET CATALOGUE'S TWO WORDS (src/shared/toolset.ts), drawn as STATE_MEANING classifies them.
  // A built tool is an ending with its work done; a tool not built yet has not begun.
  built: 'ended',
  'not built yet': 'not-started',

  // A CHECKLIST ITEM'S TWO OWN WORDS (src/shared/checklists.ts). An item in progress is work somebody is
  // on. An item waiting on the owner is held up until the owner answers. The filled block stays with the
  // two states where a run is waiting now (tests/state-drawing.test.ts).
  'in progress': 'under-way',
  'waiting on the owner': 'held-up',

  // A GPU BOOKING AND ITS REQUEST TO GO FIRST (src/shared/bookings.ts), drawn as STATE_MEANING classifies them.
  // A booking waiting for its time, and a request nobody has answered, have not begun. A booking that ended with its
  // program, and a request granted, are endings with their work done. A request refused, or overtaken by the
  // applicant's own turn, ended without delivering. `running` and `cancelled` are above.
  waiting: 'not-started',
  asked: 'not-started',
  ended: 'ended',
  granted: 'ended',
  refused: 'ended-empty',
  lapsed: 'ended-empty',

  // AN ASK THE OFFICE KEEPS ON A RUN, a next round or a worker run (src/shared/next-round.ts and
  // src/shared/worker-runs.ts), drawn as STATE_MEANING classifies them. An ask whose launcher is going is
  // under way. An ask whose run was filed is an ending with its work done. `wanted` and `failed` are above.
  starting: 'under-way',
  started: 'ended',

  // Verification stages: complete means the verification answered, not that it succeeded.
  planned: 'not-started',
  attempted: 'under-way',
  complete: 'ended',
  unavailable: 'held-up',

  // How a first handoff to the stable checkout ended, as STATE_MEANING classifies it. `refused` is above.
  // Both failures broke: the handoff was tried and did not happen, and the reason says whether the
  // development office's restoration was verified.
  'handed-off': 'ended',
  'failed-restored': 'broke',
  'not-restored': 'broke',

  // How a move of the data folder ended. `refused` and `not-restored` are above. A move that failed and was put back
  // broke, as a failed and restored handoff does.
  moved: 'ended',
  restored: 'broke',

  // How a host job ended when its tool did not do what was asked (HOST_JOB_STATES in src/shared/host-jobs.ts). `asked`,
  // `running` and `finished` are above. Each of the three is stopped_short in STATE_MEANING, so each broke, as `failed`
  // does: the runner ended the tool at its time limit, the tool could not start, or the job was lost with no result.
  'ended at its time limit': 'broke',
  'could not start': 'broke',
  lost: 'broke',

  // A HANDBOOK'S STATES (src/shared/handbooks.ts), drawn as STATE_MEANING classifies them. A draft has not begun: it is
  // sent to nobody. A handbook in use is an ending with its work done, as a stable module is. `retired` is above.
  draft: 'not-started',
  'in use': 'ended',

  unknown: 'nobody-can-say',
}

/**
 * The drawing for one stored word.
 *
 * `pastDate` is the caller's own finding that a date somebody agreed has arrived or passed. It wins
 * over the word, because a promise that is late is a person waiting on you whatever the work says
 * about itself. Nothing here reads a date or parses a phrase: the caller already decided it.
 *
 * A word this build has never seen comes back as "nobody can say", which is what it is.
 */
export function stateDrawing(word: string | null, pastDate = false): StateDrawing {
  const own = word === null ? 'nobody-can-say' : STATE_DRAWING_BY_WORD[word.trim().toLowerCase()] ?? 'nobody-can-say'
  // A DATE THAT HAS PASSED DOES NOT OUTRANK AN ENDING, and this was measured rather than reasoned:
  // the first version of this rule drew a `fulfilled` obligation whose agreed date had gone by as
  // the filled block, so a promise that was KEPT, late, read as a person still waiting on you. Work
  // that reached its end is owed nothing, whatever its date says.
  if (pastDate && own !== 'ended' && own !== 'ended-empty') return 'waiting-on-you'
  return own
}

/**
 * The shape for each drawing. Eight, all different from each other.
 *
 * Three borrow from the state alphabet because they mean the same thing there — the hollow square
 * for not started, the half-filled disc for under way, the tick for ended. The barred circle, the
 * broken ring, the struck tick and the empty block are the ones this alphabet adds.
 */
const DRAWING_GLYPHS: Readonly<Record<StateDrawing, React.ReactNode>> = {
  /** An arrow running into a wall: it stopped here, and it is waiting for you to move the wall. */
  'waiting-on-you': (
    <>
      <path d="M2 8h6.4M6.2 5.8L8.6 8l-2.4 2.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.4 2.6v10.8" strokeWidth="2.1" strokeLinecap="round" />
    </>
  ),
  'not-started': STATE_GLYPHS.todo,
  'under-way': STATE_GLYPHS.doing,
  /** A circle with a bar laid across it: held shut by something outside this row. */
  'held-up': (
    <>
      <circle cx="8" cy="8" r="5.4" fill="none" strokeWidth="1.8" />
      <path d="M2.6 8h10.8" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  /** A ring with a piece missing and the piece fallen away: it was tried and it broke. */
  broke: (
    <>
      <path d="M11.2 4a5.2 5.2 0 1 0 1.1 2.4" fill="none" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 2.6L12.4 5 9.8 8.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  ended: STATE_GLYPHS.done,
  /** The same tick, struck through: it ended, and it delivered nothing to build on. */
  'ended-empty': (
    <>
      <path d="M3 8.4l3.3 3.3L13 4.6" fill="none" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.4 13.6L13.6 2.4" strokeWidth="1.7" strokeLinecap="round" />
    </>
  ),
  'nobody-can-say': (
    <>
      <circle cx="8" cy="8" r="5.4" fill="none" strokeWidth="1.7" />
      <path d="M6.2 6.3a1.85 1.85 0 1 1 1.9 2.2v1" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.05" cy="11.1" r="0.85" fill="currentColor" stroke="none" />
    </>
  ),
}

/**
 * THE NEUTRAL INK A DRAWING TAKES WHERE A CHIP AND ITS GLYPH CANNOT FIT.
 *
 * There is one such place: a proportion bar 8px tall, where the only channel left is ink. Four
 * steps, from full text colour to a hairline grey, in the order the drawings ask for a person. Two
 * drawings share a step, which is honest — the bar says how much of a list is loud, and the exact
 * words are on the strip's own label and on every row beneath it.
 *
 * NO HUE, WHICH IS THE WHOLE REASON THIS EXISTS. The bar used to take the session chips' borrowed
 * blue, grey, red, amber and green, and those tints are what made one state word read five
 * different ways across three pages.
 */
export const STATE_DRAWING_INK: Readonly<Record<StateDrawing, string>> = {
  'waiting-on-you': 'var(--text)',
  broke: 'var(--text)',
  'under-way': 'var(--text-2)',
  'not-started': 'var(--text-3)',
  'held-up': 'var(--text-3)',
  ended: 'var(--border-strong)',
  'ended-empty': 'var(--border-strong)',
  'nobody-can-say': 'var(--border-strong)',
}

/** One drawing's shape on its own, for anywhere a whole chip would be too heavy. */
export function StateDrawingGlyph({ drawing }: { drawing: StateDrawing }) {
  return (
    <svg className="px-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false" stroke="currentColor">
      {DRAWING_GLYPHS[drawing]}
    </svg>
  )
}

/**
 * The word to print for a stored state, given the kind of record it is on.
 *
 * THIS USED TO BE A TABLE. It held five words — `idle`, `orphaned`, `stopped_short`, `in_flight`,
 * `wanna_try` — and returned THE STORED TOKEN for every other word in the product. That is how the
 * chip `worked_around` was drawn on #/records at first paint, in normal mode, at 1440 and at 390,
 * while `src/shared/words.ts` held `worked_around: 'worked around'` and was never asked. It is also
 * how one stored word came to read two ways: this table said `idle` reads "waiting for you" and the
 * shared one said it reads "idle", so which word a person saw depended on which surface they met it
 * on. Five waves fixed sites one at a time; the fall-through is what kept making new ones.
 *
 * The five words moved into src/shared/words.ts — two into STATE_WORDS, and the other three were
 * already answered there by `progressWord` and `kindWord`. `readerWord` answers for all five
 * vocabularies, and a word none of them has comes back named out loud rather than raw.
 */
export function shownState(word: string, kind?: string): string {
  return readerWord(word, 'normal', kind).text
}

/**
 * WHICH NUMBER a stored word is carrying beside it. Four answers, and they are not one thing.
 *
 *   late        a date somebody agreed, now arrived or past: "5 days late", "due today".
 *   due         a date somebody agreed that is still ahead: "due in 3 days".
 *   pause-past  a decision that has run out: "3 days past its resume date".
 *   age         how long the row has sat: "under a day", "13 days".
 *
 * ONLY `late` BUYS STRONG RED. That is the whole reason this type exists: all four used to arrive
 * at the chip as one string, so nothing could colour a missed date and leave an age alone, and an
 * ordinary "under a day" was drawn in the alarm colour merely because its row was on the list.
 * Declared here, beside the chip that draws it, so the component and the callers that decide it
 * cannot end up with two spellings of one vocabulary.
 */
export type CountKind = 'late' | 'due' | 'pause-past' | 'age'

export interface StoredStateProps {
  /** The state word. The source says whether it was stored or derived; null means no word. */
  state: string | null
  /** Absent for existing callers that read literal storage; work projections carry their source. */
  source?: import('@shared/work.ts').WorkStateSource | null
  /** What the server said it means, with `progressOf`. Null when there is no word to classify. */
  progress: Progress | null
  /** How loudly to draw it. Absent draws it at its own tone, which is what a plain list wants. */
  alarm?: AlarmLevel
  /**
   * A number beside the word: "13 days", "5 days late". This is what grows when the colour is
   * already at the top of its range, so it is the only escalation an `urgent` row has left.
   */
  count?: string
  /**
   * WHICH OF THE THREE NUMBERS `count` IS, so the one that is a missed date can be drawn as one.
   *
   * "5 days late" is a date somebody agreed and did not meet. "3 days past its resume date" is a
   * decision that has run out. "under a day" is how long the row has sat. They used to arrive here
   * as one undifferentiated string, so the only way to colour lateness and leave age alone would
   * have been to read the words back — a second opinion about a fact the caller already had.
   *
   * The caller passes what it decided; nothing here parses `count`.
   */
  countKind?: CountKind
  /**
   * The record's kind, where the caller has it. One word is shown differently on one kind — see
   * STATE_SHOWN_AS_BY_KIND — and without this the chip prints the stored word, which is honest.
   */
  kind?: string
  /**
   * The caller's own finding that a date somebody agreed has arrived or passed.
   *
   * Its own prop rather than something read off `countKind`, because the count is about the NUMBER
   * printed beside the word and this is about the SHAPE the word is drawn in. Reading one from the
   * other made an overdue obligation draw two ways depending on which page you met it on.
   *
   * Left out means "this caller does not know", which draws the ordinary shape. That is honest.
   * `tests/state-drawing.test.ts` holds what the chip draws when it is told. Nothing checks that a
   * page which knows a date has passed tells it.
   */
  pastDate?: boolean
  /**
   * The words a list draws in place of the shown word, when a fact the caller holds beside the stored
   * word changes what the word says now: a running run whose next try on a usage limit is days away
   * is drawn as waiting until then (src/config/a-long-wait.mjs). The stored word still chooses the
   * drawing and the meaning, and the developer view still says what was stored.
   */
  shownAs?: string
}

/**
 * The state word and its source, its classification's drawing, and the number carrying escalation.
 *
 * A record with no state at all renders the word "no state" and the empty-slot shape, rather than
 * rendering nothing — an absent chip and a chip saying nothing is missing look identical, and one
 * of them is a record nobody has finished filling in.
 */
export function StoredState({ state, source, progress, alarm, count, countKind, kind, pastDate = false, shownAs }: StoredStateProps) {
  const inspect = useInspect()
  const stored = state === null ? null : state.trim().toLowerCase()
  // A DATE SOMEBODY AGREED THAT HAS ARRIVED OR PASSED, AND WHY IT IS ITS OWN PROP.
  //
  // This used to read `countKind === 'late'`, which is a prop about what NUMBER to print beside the
  // word. Only one page in the product passed it, so the same overdue obligation drew as the filled
  // block on the work page and as an outline on Home and on the catalogue — one word, two drawings,
  // which is the one rule the state alphabet exists to keep. Measured on "Trial report: clamp
  // holding-force section", 8 days late, on 13 August.
  //
  // TWO WAYS OF STATING ONE FACT, AND EITHER WILL DO. `countKind === 'late'` can only be true when a
  // date has passed, so it is a sufficient signal; it was never a necessary one, and treating it as
  // necessary is what broke Home. A page that prints the number says it that way, a page that wants
  // the word without the number says it with `pastDate`, and neither is asked to know about the
  // other. This is not a fallback between two meanings — it is one fact with two spellings.
  const datePassed = pastDate || countKind === 'late'
  const drawing = stateDrawing(stored, datePassed)
  const word = state === null ? t('sheet.state.none') : shownAs ?? shownState(stored ?? state, kind)
  const tone: PanelState = progress === null ? 'todo' : PROGRESS_TONE[progress]
  const meaning =
    progress === null
      ? t('sheet.state.noneMeaning')
      : progress === 'unclassified'
        ? // THE STORED SPELLING, NOT THE SHOWN WORD. The sentence is *nobody has said what the state
          // "chasing" means*, and it is the same sentence the server writes; naming the shown word
          // there would quote something nobody stored. It used to be handed `word`, which was the
          // stored token anyway while `shownState` fell through to it.
          t('sheet.unclassified.detail', { state: stored ?? state ?? '' })
        : PROGRESS_WORDS[progress]
  const renamed = state !== null && word !== state
  const qualifier = inspect && state !== null && (renamed || source === 'derived from mainSuiteFix')
    ? t(source === 'derived from mainSuiteFix' ? 'w13q.state.derivedFrom' : 'sheet.state.storedAs', { state })
    : null
  const chip = (
    <span
      className="px-chip px-chip-stored"
      data-progress={progress ?? 'none'}
      // WHAT THE READER SHOULD DO ABOUT THIS WORD. The stylesheet draws from this and from nothing
      // else, so one word is one drawing on every page in the product.
      data-drawing={drawing}
      // A record with no state word at all is `unknown`: nobody has said, which is the same kind
      // of fact as a word nobody has classified. It is not `neutral` -- neutral means somebody
      // looked and there is nothing to report.
      data-state-family={progress === null ? 'unknown' : PROGRESS_FAMILY[progress]}
      data-alarm={alarm}
      style={toneVars(tone)}
      // THE TITLE NAMES THE SOURCE ONLY WHEN THE CALLER NAMED IT. An omitted source is not the same
      // as an explicit 'stored': a generic chip that does not say where its word came from keeps the
      // bare word, and only a caller that says 'stored' or 'derived from mainSuiteFix' draws
      // "Stored state:" or "Derived state:".
      title={
        inspect
          ? (state === null ? t('sheet.state.noneStored') : source === 'derived from mainSuiteFix' ? t('w13q.state.derivedWord', { state }) : t('sheet.state.stored', { state })) +
            (renamed ? t('sheet.state.shown', { word }) : '') +
            t('sheet.state.explanation', { meaning, drawing: STATE_DRAWING_MEANINGS[drawing] })
          : state === null
            ? word
            : source === 'derived from mainSuiteFix'
              ? t('w13q.state.derivedTitle', { word })
              : source === 'stored'
                ? t('w13q.state.storedTitle', { word })
                : word
      }
    >
      <StateDrawingGlyph drawing={drawing} />
      <span className="px-chip-word">{word}</span>
      {count === undefined ? null : (
        <span className="px-chip-count num" data-count={countKind}>
          {count}
        </span>
      )}
    </span>
  )
  return qualifier === null ? chip : (
    <span className="px-state-with-source">
      {chip}
      <span className="px-chip-stored-word">{qualifier}</span>
    </span>
  )
}

// ============================================================================ marks

/**
 * THE MARK EVERY INLINE CHIP IN THIS FILE DRAWS: a glyph and a word, in the row it belongs to.
 *
 * Four channels and not one of them is a colour, which is what `StateMark` is for. The helper
 * exists so that thirteen call sites cannot each spell the same four channels differently — the
 * defect this repository names most often is one fact worked out in two places.
 *
 * `edge` is the one channel these thirteen actually vary, and it varies for one reason: a mark that
 * is one of a pair must not be told apart by its word alone.
 *
 *   solid    the ordinary enclosure every mark has.
 *   dashed   nobody can say. The same broken edge the state chip uses for an unclassified word,
 *            and the same reason: it is a question, and it has to be tellable from an answer.
 *   none     a fact about the KIND, not about this record. Nothing to do, so nothing enclosed —
 *            and with nothing enclosing it, the form is bare text rather than an outline.
 */
export function inlineMark(glyph: MarkGlyph, edge: MarkEdge = 'solid'): StateMark {
  return { form: edge === 'none' ? 'text' : 'outline', glyph, edge, where: 'inline' }
}

/**
 * The one drawing rule every new mark below shares.
 *
 * They are all the same object — a shape, a word, an optional number, one tone, one loudness —
 * because they all answer the same question in a row: what else is true about this line. Sharing a
 * primitive is what stops a safety mark and a gate mark drifting into two different sizes on two
 * different pages, which is how this component sheet earns its keep.
 *
 * ---------------------------------------------------------------------------------------
 * IT TAKES `DrawnState`: A WORD, A MARK AND A SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * `word`, `mark` and `detail` are the shared state type from `@shared/states.ts`, so a mark cannot
 * be drawn without all three. That is the point of the type: the failure it exists for is a
 * component meeting an honest state, having no word and no shape to hand, and writing a paragraph.
 *
 * `mark` says what this looks like WITH HUE REMOVED. `glyph` beside it is the SVG that draws
 * `mark.glyph` — the shape, not the description of the shape. Only `mark.edge` reaches the DOM in
 * this pass, and only for the two values that have a rule, so the markup is unchanged.
 *
 * ---------------------------------------------------------------------------------------
 * A told-apart Absence makes its reason reachable by focus. Its short mark stays in the row;
 * the reason is announced as its accessible name and drawn beside it while focused. Other marks
 * remain plain text. The reason is mounted on focus, so reading the unfocused page's text does
 * not count it as visible prose. See design/round-nine/step10-state-type.md and the five cases in
 * absence-weight, plan-table, plan-surfaces-say-what-is-true and organising-is-reachable.
 */
export interface MarkProps extends Omit<DrawnState, 'word'> {
  /** Absence's reason is available on focus, including a tap that focuses the mark. */
  explainOnFocus?: boolean
  /**
   * The SVG that draws `mark.glyph`.
   *
   * Two properties are involved and they are not the same thing. `mark.glyph` says what the glyph
   * looks like once the colour is gone — filled, hollow, broken, struck. This is the picture.
   */
  glyph: React.ReactNode
  /** The word. Never omitted: a mark that is only a shape is a shape nobody can name out loud. */
  word: string
  /** A number, where the mark carries one. */
  count?: string
  /** Which state token family inks it. */
  tone: PanelState
  /**
   * How loudly, from the alarm scale — and only where a mark genuinely sits on that scale.
   *
   * MOST MARKS DO NOT. A gate, a pause, an unclassified word and a link are facts about a record,
   * not statements about how urgent it is, so they are drawn at their own tone and left alone. If
   * every mark took a level, the scale would stop meaning "how much does this need me today" and
   * start meaning "how big is this component", which is how a severity scale dies.
   */
  alarm?: AlarmLevel
  /**
   * A dashed edge. RESERVED: it means Mole Office worked this out and a person did not assert it, and
   * exactly one mark in this file is allowed to set it.
   */
  inferred?: boolean
}

export function Mark({ glyph, word, count, tone, alarm, inferred, mark, detail, explainOnFocus }: MarkProps) {
  const [reasonAt, setReasonAt] = useState<{ left: number; top: number } | null>(null)
  const reason = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (reasonAt === null || reason.current === null) return
    const box = reason.current.getBoundingClientRect()
    if (box.bottom > window.innerHeight - 16) {
      const top = Math.max(16, window.innerHeight - box.height - 16)
      if (top !== reasonAt.top) setReasonAt({ ...reasonAt, top })
    }
  }, [reasonAt])
  // ONLY THE TWO VALUES THAT HAVE A RULE REACH THE DOM. `dashed` and `none` are the two the
  // stylesheet reads; `solid` is what a mark looks like with no attribute at all, and emitting
  // `data-edge="solid"` would put a new attribute on the page for no drawing.
  const edge = mark.edge === 'dashed' || mark.edge === 'none' ? mark.edge : undefined
  return (
    <>
    <span
      className="px-chip px-mark"
      data-alarm={alarm}
      data-edge={edge}
      data-inferred={inferred ? '1' : undefined}
      style={toneVars(tone)}
      title={detail}
      tabIndex={explainOnFocus ? 0 : undefined}
      role={explainOnFocus ? 'note' : undefined}
      aria-label={explainOnFocus ? `${word}: ${detail}` : undefined}
      onFocus={explainOnFocus ? (event) => {
        const box = event.currentTarget.getBoundingClientRect()
        setReasonAt({
          left: Math.max(16, Math.min(box.left, window.innerWidth - 400)),
          top: box.bottom + 6,
        })
      } : undefined}
      onBlur={explainOnFocus ? () => setReasonAt(null) : undefined}
      onKeyDown={explainOnFocus ? (event) => {
        if (event.key === 'Escape') setReasonAt(null)
      } : undefined}
    >
      <svg className="px-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false" stroke="currentColor">
        {glyph}
      </svg>
      <span className="px-chip-word">{word}</span>
      {count === undefined ? null : <span className="px-chip-count num">{count}</span>}
    </span>
    {reasonAt === null ? null : createPortal(
      <span ref={reason} className="px-hint-body" role="tooltip" style={{ position: 'fixed', right: 'auto', overflowWrap: 'anywhere', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', ...reasonAt }}>
        {detail}
      </span>, document.body,
    )}
    </>
  )
}

/**
 * A mark with the sentence that belongs to it, or the mark on its own.
 *
 * Every mark below takes an optional `note`, and every note this product has is written by the
 * server — `unclassifiedNote`, the pause note, the no-state note, `gateLabel`. So the sentence is
 * passed in rather than composed here, and where a component supplies one itself it calls the
 * shared function rather than writing a second copy of the words.
 */
function withNote(mark: React.ReactNode, note: string | undefined): React.ReactElement {
  if (note === undefined) return <>{mark}</>
  return (
    <span className="px-noteline">
      {mark}
      <span className="px-noteline-text">{note}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------- consequence

/** The chip word for each stored bearer. Short, because it sits in a row. */
const BEARER_WORDS: Readonly<Record<ConsequenceBearer, string>> = {
  get person() { return t('sheet.consequence.person') },
  get outside() { return t('sheet.consequence.outside') },
  get property() { return t('sheet.consequence.property') },
  get dependent() { return t('sheet.consequence.dependent') },
  get owner() { return t('sheet.consequence.owner') },
  get none() { return t('sheet.consequence.none') },
}

/** What each bearer means, in a full sentence, for the tooltip and for the sheet. */
export const BEARER_MEANINGS: Readonly<Record<ConsequenceBearer, string>> = {
  get person() { return t('sheet.consequenceMeaning.person') },
  get outside() { return t('sheet.consequenceMeaning.outside') },
  get property() { return t('sheet.consequenceMeaning.property') },
  get dependent() { return t('sheet.consequenceMeaning.dependent') },
  get owner() { return t('sheet.consequenceMeaning.owner') },
  get none() { return t('sheet.consequenceMeaning.none') },
}

/**
 * A warning triangle: the only mark in this file allowed to mean a person could be hurt.
 *
 * A triangle and not a variation on the alarm cross, because safety is not a worse failure — it is
 * a different fact, and it is the one fact that outranks everything on the list whatever the row's
 * score. It is drawn at `urgent` always, and it does NOT get a colour above red, because there is
 * none: what marks it out from an overdue promise is the word and the shape.
 */
const SAFETY_GLYPH = (
  <>
    <path d="M8 2.2L14.6 13.4H1.4z" fill="none" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M8 6.2v3.3" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="8" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
  </>
)

export interface ConsequenceMarkProps {
  /** Exactly as stored. Null means nobody has recorded one, which is said rather than assumed. */
  consequence: Consequence | null
  /** Print the author's own sentence beside the mark. */
  withSentence?: boolean
}

/**
 * WHAT MOLE OFFICE SAYS WHEN NOBODY RECORDED WHO IS HURT — written once, read twice.
 *
 * It was written twice: the mark's tooltip said "Nobody has RECORDED who is hurt if this is left
 * alone" and the sentence beside the mark said "Nobody has SAID who is hurt if this is left alone".
 * One fact, two wordings, in one component, free to part further. This is the sentence; the tooltip
 * adds the clause a tooltip has room for.
 */


/**
 * Who is hurt if this is left alone, as stored.
 *
 * NULL IS DRAWN, NOT SKIPPED. "Nobody has recorded who is hurt" is a gap somebody can close, and
 * it is the difference between a row that scored zero for harm because it is harmless and a row
 * that scored zero because nobody looked. A blank would make those two identical.
 */
export function ConsequenceMark({ consequence, withSentence }: ConsequenceMarkProps) {
  if (consequence === null) {
    return withNote(
      <Mark
        glyph={PROGRESS_GLYPHS.none}
        word={t('sheet.consequence.unrecorded')}
        tone="todo"
        mark={inlineMark('hollow')}
        detail={t('sheet.consequence.gap', { sentence: t('sheet.consequence.unrecordedSentence') })}
      />,
      withSentence === true ? t('sheet.consequence.unrecordedSentence') : undefined,
    )
  }
  const safety = consequence.bearer === 'person'
  return withNote(
    // ONE GLYPH FOR ALL SIX BEARERS, because they are one fact — who is hurt if this is left —
    // and only the answer differs. What separates safety from the other five is the word, the
    // alarm colour and the top of the list, not a second picture nobody has learned.
    <Mark
      glyph={SAFETY_GLYPH}
      word={BEARER_WORDS[consequence.bearer]}
      tone={safety ? 'failed' : 'todo'}
      alarm={safety ? 'urgent' : 'plain'}
      mark={inlineMark('filled')}
      detail={t('sheet.consequence.recorded', { meaning: BEARER_MEANINGS[consequence.bearer], what: consequence.what })}
    />,
    withSentence === true ? consequence.what : undefined,
  )
}

/**
 * The safety mark, drawn on its own.
 *
 * Separate from ConsequenceMark because it says something about the RANKING rather than about the
 * record: this row sits above everything that is not safety, whatever either side scores. It takes
 * no sentence, because it invents none — the stored consequence is what carries the words, and it
 * is drawn by ConsequenceMark beside this.
 *
 * THE WORD IS "Safety", NOT "Safety floor". "Floor" meant a safety rule here and a lower bound on
 * the plan page eleven lines from a reader's eye, and one word doing two jobs is one job too many.
 * Nothing about the rule changed and the title below still states it in full: this row ranks above
 * everything that is not safety. The component keeps its name, because "floor" is the right word
 * for the mechanism and the wrong word on a screen.
 */
export function SafetyFloorMark() {
  return (
    <Mark
      glyph={SAFETY_GLYPH}
      word={t('sheet.consequence.person')}
      tone="failed"
      alarm="urgent"
      mark={inlineMark('filled')}
      detail={t('sheet.safety.detail')}
    />
  )
}

// ---------------------------------------------------------------------------- pause

/**
 * A clause from the shared tables, capitalised so it can open a sentence of its own.
 *
 * The clauses are written lower-case because most of them are joined onto something else. A screen
 * that shows one alone has to raise the first letter, and doing that here means the words on screen
 * are still the rule's own words rather than a retyped copy that can drift from them.
 */
function leadWith(clause: string): string {
  return clause.charAt(0).toUpperCase() + clause.slice(1)
}

export interface PauseMarkProps {
  /** As stored. Null when the state word says paused and no `paused` block was written. */
  pause: Pause | null
  /** The server's answer: true, false, or null when it genuinely cannot tell. Null is not "no". */
  dueToResume?: boolean | null
  /** The server's sentence for this pause. Shown whole, never shortened. */
  note?: string
}

/**
 * Put down on purpose, with the reason and whatever should bring it back.
 *
 * A pause is NOT bad news and is not drawn as any: it is the mechanism that lets the attention
 * list stay short honestly, because a paused thing has not stopped short. The one case that is
 * lifted a step louder is a pause whose date has passed — that is a decision that has quietly
 * expired, and it needs somebody to either restart it or say it is still paused.
 */
export function PauseMark({ pause, dueToResume, note }: PauseMarkProps) {
  const expired = dueToResume === true
  const openEnded = pause !== null && pause.until === undefined
  return withNote(
    <Mark
      glyph={PROGRESS_GLYPHS.paused}
      word={pause === null ? t('sheet.pause.noReason') : t('sheet.pause.word')}
      count={expired ? t('sheet.pause.due') : openEnded ? t('sheet.pause.openEnded') : undefined}
      tone="todo"
      alarm={expired ? 'raised' : 'plain'}
      mark={inlineMark('barred')}
      detail={
        pause === null
          ? // The rule's own sentence, not a second copy of it. There were four copies of this one
            // — here, the record page, and twice in shared/attention.ts — and all four said no
            // REASON had been recorded. That became false the day `parked` was classified as
            // paused, because a parked idea keeps its reason in `parked_because`. One statement,
            // one place, is the only arrangement in which correcting it once is enough.
            t('sheet.pause.noReasonDetail', { sentence: leadWith(t('sheet.pause.noReasonMeaning')) })
          : t('sheet.pause.detail', { since: pause.since, why: pause.why })
      }
    />,
    note,
  )
}

// ---------------------------------------------------------------------------- unclassified

export interface UnclassifiedMarkProps {
  /** The word, exactly as stored. */
  state: string
  /**
   * A supplied note is content. Without one, the lists provide the shared explanation
   * in the page language; its English comes from the shared rule.
   */
  note?: string
  /** Print the sentence beside the mark rather than only in the tooltip. */
  withSentence?: boolean
}

/**
 * A state word nobody has classified. A QUESTION, and drawn as one.
 *
 * Not an alarm and not a failure: Mole Office has not decided this record is in trouble, it has
 * discovered that it cannot tell. Giving it the alarm colour would answer a question the product
 * is asking, which is the one thing this whole vocabulary exists to stop.
 */
export function UnclassifiedMark({ state, note, withSentence }: UnclassifiedMarkProps) {
  const sentence = note ?? t('sheet.unclassified.detail', { state })
  return withNote(
    <Mark
      glyph={PROGRESS_GLYPHS.unclassified}
      word={t('sheet.unclassified.word')}
      count={state}
      tone="todo"
      mark={inlineMark('hollow')}
      detail={sentence}
    />,
    withSentence === true ? sentence : undefined,
  )
}

// ---------------------------------------------------------------------------- no state at all

export interface NoStateMarkProps {
  /**
   * True when the kind declares a `state` field, so a word was expected and never written. False
   * when the kind has no state field at all. Null when Mole Office does not know the kind.
   *
   * THREE ANSWERS, THREE WORDS. They read differently because they are different: one is a record
   * somebody left half-written, one is a kind that never had a state, and one is Mole Office admitting
   * it cannot say which.
   */
  expected: boolean | null
  note?: string
}

/**
 * TWO OF THE THREE ARE DRAWN DIFFERENTLY, AND THAT IS THE POINT OF THIS COMPONENT.
 *
 * "Nobody wrote a state here" and "this kind has no state field" used to be identical in every
 * measured channel and differed by one noun. One is a record somebody should go and finish; the
 * other is a fact about the kind and needs nothing at all. So the first two take the dashed edge
 * that means nobody can say, and the third is a plain grey dash with no enclosure — nothing to
 * open, nothing to fix.
 */
export function NoStateMark({ expected, note }: NoStateMarkProps) {
  const word = expected === null ? t('sheet.noState.kindUnknown') : expected ? t('sheet.noState.unwritten') : t('sheet.noState.noField')
  const title =
    expected === null
      ? t('sheet.noState.unknownDetail')
      : expected
        ? t('sheet.noState.unwrittenDetail')
        : t('sheet.noState.noFieldDetail')
  return withNote(
    <Mark
      glyph={expected === false ? NO_FIELD_GLYPH : PROGRESS_GLYPHS.none}
      word={word}
      tone="todo"
      mark={inlineMark(expected === false ? 'none' : 'hollow', expected === false ? 'none' : 'dashed')}
      detail={title}
    />,
    note,
  )
}

/** A plain dash: this kind has no state field, so there is no word and nothing to go and write. */
const NO_FIELD_GLYPH = <path d="M3.4 8h9.2" strokeWidth="1.8" strokeLinecap="round" />

/**
 * WHAT A GATE SAYS, IN THE READER'S OWN LANGUAGE.
 *
 * `gateLabel()` in src/shared/work.ts writes the words in English for an agent reading raw text,
 * so it cannot follow the page's language. This drawing reads the same two keys the gate mark in
 * ui.tsx reads. The English of those keys is `gateLabel()` itself (src/shared/words/en.ts), so the
 * record page and this drawing still say the same thing in English. Report dbPgS8ooliII, block b-6,
 * found "only as far as … until this finishes" on this drawing in Chinese. The pipeline flow reads it too
 * (wave 13k round 41), where `gateLabel()`'s English was the last English on a Chinese flow.
 *
 * A CALLER THAT KNOWS WHAT THE STAGE IS PASSES ITS WORDS (wave 13y round 83). `upTo` is stored as a step's id, a
 * checklist item's id or words, and this function cannot tell an id from words, so without `stage` it draws `upTo` as
 * it is stored. The pipeline drawing's wall passes the step's number and title, because drawn as stored the wall said
 * "only as far as" and the id of the step's block.
 */
export function gateWordsForReader(gate: Gate, stage?: string): string {
  if (gate.kind === 'hard') return t('sheet.gate.hardDetail')
  return t('sheet.gate.partialDetail', { stage: stage ?? gate.upTo ?? t('sheet.gate.unstated') })
}

// ---------------------------------------------------------------------------- a direction's depth

/**
 * HOW FAR A LINE OF EXPLORATION HAS BEEN TAKEN, IN WORDS.
 *
 * A `direction` has no state field. It has its own six-rung ladder — noticed, read, ran, measured,
 * integrated, defended — which is required and validated, and which was drawn in exactly one place
 * in the product: as the bare fraction "2/6" inside one graph. Eleven records carry it and a reader
 * browsing a list never saw it; they saw a grey "no state" mark, which reads as a record somebody
 * left half-written when it is nothing of the kind.
 *
 * THE FRACTION STAYS AND THE WORDS ARE ADDED. "2/6" says how far along without saying of what, and
 * the rung's own word is the thing a person can act on.
 *
 * NOTHING IS INFERRED. A direction with no depth recorded says so, in the same shape as every other
 * absence in this file: the question glyph and the dashed edge.
 */
export const DEPTH_WORD_KEYS: Readonly<Record<DirectionDepth, WordKey>> = {
  noticed: 'sheet.depth.word.noticed',
  read: 'sheet.depth.word.read',
  ran: 'sheet.depth.word.ran',
  measured: 'sheet.depth.word.measured',
  integrated: 'sheet.depth.word.integrated',
  defended: 'sheet.depth.word.defended',
}
export const DEPTH_MEANING_KEYS: Readonly<Record<DirectionDepth, WordKey>> = {
  noticed: 'sheet.depth.meaning.noticed',
  read: 'sheet.depth.meaning.read',
  ran: 'sheet.depth.meaning.ran',
  measured: 'sheet.depth.meaning.measured',
  integrated: 'sheet.depth.meaning.integrated',
  defended: 'sheet.depth.meaning.defended',
}

export function DepthLadder({ depth, note }: { depth: string | null; note?: string }) {
  const rung = depth === null ? -1 : (DIRECTION_DEPTHS as readonly string[]).indexOf(depth.trim())
  if (rung < 0) {
    // A word the ladder does not hold is PRINTED, never swallowed. "nobody wrote one" and "somebody
    // wrote a word this build has never heard of" are two facts and only one of them is a gap.
    return withNote(
      <Mark
        glyph={PROGRESS_GLYPHS.unclassified}
        word={depth === null ? t('sheet.depth.none') : t('sheet.depth.unknown')}
        {...(depth === null ? {} : { count: depth })}
        tone="todo"
        mark={inlineMark('hollow', 'dashed')}
        detail={
          depth === null
            ? t('sheet.depth.noneDetail')
            : t('sheet.depth.unknownDetail', { depths: DIRECTION_DEPTHS.map(depth => t(DEPTH_WORD_KEYS[depth])).join(', ') })
        }
      />,
      note,
    )
  }
  const word = DIRECTION_DEPTHS[rung] as DirectionDepth
  return withNote(
    <Mark
      glyph={DRAWING_GLYPHS['under-way']}
      word={t(DEPTH_WORD_KEYS[word])}
      count={`${rung + 1}/${DIRECTION_DEPTHS.length}`}
      tone="todo"
      mark={inlineMark('filled')}
      detail={t('sheet.depth.detail', { meaning: t(DEPTH_MEANING_KEYS[word]) })}
    />,
    note,
  )
}

// ---------------------------------------------------------------------------- how a record got here

/**
 * WHAT THIS BROWSER CAN SAY ABOUT ONE RECORD'S ORIGIN. THREE READINGS, AND THEY ARE NOT THE SAME FACT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Measured on the working database: 385 records, 290 of them written by the generated fixture, and
 * until decision 17 nothing marked which was which. Two agents read this project's own development
 * record and greenhouse-study content written to exercise a layout as equally true, because there was
 * nothing on any screen that told them apart. USER.md invariant 3 is the rule that was being broken:
 * "where a placeholder, approximation, simulated result or unfinished implementation is visible at
 * all, it is labelled, prominently, in the place it appears". IN THE PLACE IT APPEARS — so this
 * mark goes on the row, not only on the page you have to open.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD READING IS THE ONE NOBODY EXPECTS, AND IT IS THE ONE THAT IS TRUE TODAY
 * ---------------------------------------------------------------------------------------
 *
 *   stamped     the record carries `authored` or `fixture`. Somebody recorded how it got here.
 *   unreadable  the record carries an `origin` and Mole Office cannot read a vocabulary word out of it.
 *               `null` is "nobody has recorded it"; any other value is a word this build has never
 *               heard of, and the value itself is PRINTED rather than swallowed.
 *   unserved    the record has no `origin` field at all. THE SERVER DID NOT SEND ONE. That is a
 *               fact about this page's request, not about the record, and saying "nobody has
 *               recorded how this record entered the corpus" for it would be a straight lie about
 *               290 rows that are stamped `fixture` in the database this minute.
 *
 * `readOrigin` in shared/types.ts collapses all three of the non-stamped cases to null, correctly:
 * it reads a VALUE, and null-is-not-authored is the only thing it has to guarantee. This reads the
 * FIELD, which is a different question, and it is built on `readOrigin` rather than restating the
 * vocabulary so the two cannot disagree about what the words are.
 */
export type OriginReading =
  /** `authored` or `fixture`, read through the shared vocabulary. */
  | { at: 'stamped'; origin: RecordOrigin }
  /**
   * An `origin` arrived and is not a vocabulary word. `stored` is null for "nobody recorded one",
   * and the value itself for a word this build does not know — two different facts, one shape.
   */
  | { at: 'unreadable'; stored: string | null }
  /** No `origin` field on the record at all: nothing was sent, so nothing can be said. */
  | { at: 'unserved' }

/**
 * Read the FIELD, not the value.
 *
 * Takes `{ origin?: unknown }` rather than PanelRecord on purpose: what arrives here is JSON off
 * the wire, the column is a bare `text` with no CHECK behind it, and `src/server/lib/import.ts`
 * already counts and reports rows whose origin "is not one of authored or fixture". Typing the
 * argument as the vocabulary would be this file claiming a guarantee nothing enforces.
 */
export function originReading(record: { origin?: unknown }): OriginReading {
  if (!('origin' in record) || record.origin === undefined) return { at: 'unserved' }
  const origin = readOrigin(record.origin)
  if (origin !== null) return { at: 'stamped', origin }
  if (record.origin === null) return { at: 'unreadable', stored: null }
  const stored = typeof record.origin === 'string' ? record.origin : JSON.stringify(record.origin)
  // A blank string stores nothing anybody can read, so it is the same answer as null — which is
  // also what `readOrigin` says about '' and '   ', and the two must not disagree.
  return { at: 'unreadable', stored: stored.trim() === '' ? null : stored }
}

/** The word on the chip, the number beside it, and the whole sentence behind it. */
export interface OriginSaid {
  /** Which of the five drawings this is. It is the `data-origin` attribute and the glyph key. */
  key: 'fixture' | 'authored' | 'unrecorded' | 'unknown-word' | 'unserved'
  word: string
  /** The stored value, where there is one this vocabulary cannot read. Printed, never swallowed. */
  count?: string
  /** One sentence, in the shared contract's own words wherever the contract has them. */
  sentence: string
}

/** A clause raised to a sentence, so the shared wording is used rather than retyped. */
function asSentence(clause: string): string {
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`
}

/**
 * ONE TABLE, so no surface can word this differently.
 *
 * The two stamped sentences are `ORIGIN_MEANINGS` from the shared contract and the unrecorded one
 * is `unstampedOriginNote()` — the same sentence the importer prints and the same one the server
 * would print. Only the `unserved` sentence is written here, because it is about this browser's
 * request and no shared reader has an opinion about that.
 */
export function originSaid(reading: OriginReading): OriginSaid {
  if (reading.at === 'stamped') {
    // "Made-up example", NOT "Fixture". `fixture` is the stored word and it does not change — it is
    // in the database, in the API and in every agent's skill file. On screen it was a word only a
    // programmer decodes, on the grey badge that sits on 290 of this workspace's 385 rows, and a
    // mark nobody reads is a mark that is not doing rule 3's job.
    //
    // THE MARK DID NOT GET QUIETER. Same chip, same glyph, same `data-origin="fixture"`, same place
    // on every row, same loud reading on the record's own page. Only the word changed, and it
    // changed to one that says what the badge means without a table beside it.
    return reading.origin === 'fixture'
      ? { key: 'fixture', word: t('sheet.origin.fixture'), sentence: t('sheet.origin.stamped', { word: t('sheet.origin.fixture'), meaning: t('sheet.origin.fixtureMeaning') }) }
      : { key: 'authored', word: t('sheet.origin.authored'), sentence: t('sheet.origin.stamped', { word: t('sheet.origin.authored'), meaning: t('sheet.origin.authoredMeaning') }) }
  }
  if (reading.at === 'unserved') {
    return {
      key: 'unserved',
      word: t('sheet.origin.unserved'),
      sentence: t('sheet.origin.unservedDetail'),
    }
  }
  if (reading.stored === null) {
    return { key: 'unrecorded', word: t('sheet.origin.unrecorded'), sentence: asSentence(t('sheet.origin.unrecordedMeaning')) }
  }
  return {
    key: 'unknown-word',
    word: t('sheet.origin.unknown'),
    count: reading.stored,
    sentence: t('sheet.origin.unknownDetail', { stored: reading.stored, known: RECORD_ORIGINS.join(t('sheet.or')) }),
  }
}

/** A decision removes the unmarked-row sentence and its hover everywhere.
 * Developer lists can still say what the other visible origin marks mean.
 */
export function UnmarkedRowsNote({
  what = t('sheet.row'),
  full = false,
}: {
  what?: string
  /** True on a record's own page, which has no list of other marks. */
  full?: boolean
}) {
  const inspect = useInspect()
  return inspect && !full ? <p className="px-note px-origin-note">{t('sheet.origin.otherMarks', { what })}</p> : null
}

/**
 * Five silhouettes, none of them borrowed from a state or a progress classification.
 *
 * The question circle IS shared between the two unreadable cases and that is deliberate: both are
 * Mole Office saying it cannot tell, which is one idea, and the second channel that separates them is
 * stronger than a silhouette — the unknown-word chip prints the stored value beside the word.
 */
const ORIGIN_GLYPHS: Readonly<Record<OriginSaid['key'], React.ReactNode>> = {
  /** A hatched panel: a made thing, filled in by something other than the work. */
  fixture: (
    <>
      <rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.5" fill="none" strokeWidth="1.6" />
      <path d="M5.4 12.2l3.1-8.2M9.1 12.2l3.1-8.2" strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
  /** A nib on a baseline: somebody wrote it. */
  authored: (
    <>
      <path d="M3.6 11.4l.9-2.6 5.6-5.6 1.7 1.7-5.6 5.6z" fill="none" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2.6 13.6h10.8" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  /** The question, the same shape an unclassified state word gets: a thing to answer, not a verdict. */
  unrecorded: PROGRESS_GLYPHS.unclassified,
  'unknown-word': PROGRESS_GLYPHS.unclassified,
  /** A line that did not come across. Nothing arrived, so there is nothing to read. */
  unserved: <path d="M2.4 8h2.2M6.9 8h2.2M11.4 8h2.2" strokeWidth="1.8" strokeLinecap="round" />,
}

export interface OriginMarkProps {
  /**
   * The record AS IT ARRIVED, not its origin value.
   *
   * The whole object, because the absence of the field is half of what this mark reads, and a
   * caller that pulled `record.origin` out first would have thrown that half away before getting
   * here — `undefined` and `null` would then be one answer, and they are two.
   */
  record: { origin?: unknown }
  /**
   * `every` — draw whatever the reading says, including `authored`. The record page and anywhere a
   * reader is looking at ONE thing.
   *
   * `exceptions` — draw nothing when the record is plainly `authored`, and draw every other reading.
   * For lists, where the same word on every row stops being read. Other origins remain explicit;
   * the owner removed the explanatory unmarked-row sentence everywhere.
   */
  only?: 'every' | 'exceptions'
}

/**
 * How this record got here, on the row it is on.
 *
 * IT IS DRAWN FOR EVERY RECORD, INCLUDING AN AUTHORED ONE. Every other mark in this file renders
 * nothing for its good case, deliberately, so that a page of finished work stays quiet. This one
 * does the opposite and that is the point: silence about provenance is the exact defect decision 17
 * was raised to end, and a rule of the form "draw it except when…" is a rule that gets forgotten on
 * the next surface somebody builds. One rule, no exception: every record says how it got here.
 *
 * IT IS NOT ON THE STATE COLOUR SCALE AND TAKES NO ALARM LEVEL. Origin is not a severity, and
 * `fixture` is not a failure — the shared meaning says so in as many words, "not about whether its
 * content is true". Borrowing `broken` for it would contradict the vocabulary it is drawing, and
 * borrowing an alarm step would spend a scale that means "how much does this need me today" on
 * something that never needs anybody today. So it has its own neutral ink, and `fixture` is told
 * from the rest by a filled ground, full-strength edge, heavier weight, its own silhouette and its
 * own word: five channels, all of which survive greyscale.
 */
export function OriginMark({ record, only = 'every' }: OriginMarkProps) {
  const said = originSaid(originReading(record))
  // THE QUIET CASE, and it exists because the owner looked at a photograph and said so.
  //
  // Wave 4A put this mark on every derived row, which the invariant requires: a row carrying NO mark
  // is not `authored`, it is a row nobody has said anything about, and reading an absence as a
  // judgement is what makes generated content read as real. The consequence, measured on the real
  // corpus, was about twenty-two AUTHORED chips on one screen and one or two FIXTURE ones — the
  // common case repeated until it stops being read, which is the weakest case the standing rule
  // "default-visible text must earn its space" has.
  //
  // The owner's direction, 2026-08-12: ordinary authored provenance need not repeat on every list
  // row, PROVIDED THE DEFAULT IS UNAMBIGUOUS; exceptional provenance must stay explicit; and the
  // truth stays available in detail, disclosure and the API. So `only="exceptions"` draws nothing
  // for `authored` and draws every other reading exactly as before — including `unrecorded` and
  // `unserved`, which are NOT authored and must never be mistaken for it.
  //
  // The owner removed the separate unmarked-row explanation. Exceptional origins remain marked.
  if (only === 'exceptions' && said.key === 'authored') return null
  return (
    <span className="px-chip px-mark px-origin" data-origin={said.key} title={said.sentence}>
      <svg className="px-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false" stroke="currentColor">
        {ORIGIN_GLYPHS[said.key]}
      </svg>
      <span className="px-chip-word">{said.word}</span>
      {said.count === undefined ? null : <span className="px-chip-count num">{said.count}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------- gates

/** A line that stops dead against a full-height bar. B cannot proceed at all. */
const GATE_HARD_GLYPH = (
  <>
    <path d="M1.6 8h5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.4 2v12" strokeWidth="2.4" strokeLinecap="round" />
  </>
)

/** The same bar with a gap in it, and the line passes through. B may proceed, but only so far. */
const GATE_PARTIAL_GLYPH = (
  <>
    <path d="M1.6 8h12.8" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.4 2v3.4M9.4 10.6V14" strokeWidth="2.4" strokeLinecap="round" />
  </>
)

export interface GateMarkProps {
  /** As stored on the `blocks` link, or on a pipeline step's `needs`. */
  gate: Gate
  /** The server's `gateProblem`, when the stored pair cannot be read. Drawn, never swallowed. */
  problem?: string
}

/**
 * How much something blocks: all the way, or only as far as a named stage.
 *
 * The words come from `gateLabel` in the shared contract, so the pipeline drawing, the record page
 * and this mark cannot end up saying three different things about the same stored pair.
 *
 * A PARTIAL GATE IS NOT A WEAKER ALARM. It is a different fact — most of the work is doable and
 * there is a wall at the end of it — and drawing it as a faint version of a hard gate would lose
 * exactly the distinction it was added for.
 */
export function GateMark({ gate, problem }: GateMarkProps) {
  const inspect = useInspect()
  const stage = useStageName(gate.kind === 'partial' ? gate.upTo : undefined)
  if (problem !== undefined) {
    return withNote(
      <Mark
        glyph={STATE_GLYPHS.broken}
        word={t('sheet.gate.unreadable')}
        tone="broken"
        alarm="raised"
        mark={inlineMark('broken')}
        detail={problem}
      />,
      problem,
    )
  }
  const hard = gate.kind === 'hard'
  return (
    <Mark
      glyph={hard ? GATE_HARD_GLYPH : GATE_PARTIAL_GLYPH}
      word={hard ? t('sheet.gate.hard') : t('sheet.gate.partial')}
      count={hard ? undefined : inspect ? gate.upTo : stage.name}
      tone={hard ? 'blocked' : 'todo'}
      alarm={hard ? 'raised' : 'plain'}
      mark={inlineMark(hard ? 'filled' : 'hollow')}
      detail={hard ? t('sheet.gate.hardDetail')
        : stage.reading ? t('unlistedWords.gate.stageReading')
          : t('sheet.gate.partialDetail', { stage: stage.name ?? t('sheet.gate.unstated') })}
    />
  )
}

/**
 * WHAT TO CALL THE STAGE A PARTIAL GATE STOPS AT, in normal mode.
 *
 * A stage is stored as text, and the text is one of three things (Gate.upTo in src/shared/work.ts):
 * a block record's id, a checklist item's id, or a stage in words. A record id is looked up and its
 * title drawn; the title is the record's own words, so it is content and never translated. When no
 * record answers to it (this project does not hold it, or the read failed), the mark says the step
 * could not be named, and developer mode shows what is stored. Anything else is drawn as written,
 * because a stage in words is its author's words. `name` is undefined when the gate names no stage,
 * and while the title is still being read, which `reading` says.
 */
function useStageName(upTo: string | undefined): { name: string | undefined; reading: boolean } {
  const asId = upTo !== undefined && isARecordId(upTo) ? upTo : null
  const titles = useRecordTitles(asId === null ? [] : [asId])
  if (upTo === undefined) return { name: undefined, reading: false }
  if (asId === null) return { name: content(upTo), reading: false }
  // A READ THAT FAILED names no step: titles.ts hands the record word for it, which is not the stage's name.
  if (titleReadFailed(asId)) return { name: t('unlistedWords.gate.stageUnnamed'), reading: false }
  const title = titles[asId]
  if (title === undefined) return { name: undefined, reading: true }
  // titles.ts answers LEADING.somewhereUnknown for a record this project does not hold, or one with a blank title.
  const name = title === LEADING.somewhereUnknown ? t('unlistedWords.gate.stageUnnamed') : content(title)
  return { name, reading: false }
}

// ---------------------------------------------------------------------------- links

/** An arrow with a solid shaft: a person wrote this link down. */
const LINK_CONFIRMED_GLYPH = (
  <>
    <path d="M1.8 8h9" fill="none" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9.6 5.2L12.6 8l-3 2.8" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </>
)

/**
 * The same arrow with a broken shaft: Mole Office worked this out.
 *
 * The dash is the reserved signal and this is one of the two places in the app allowed to spend
 * it — the other is the `inferred` state chip, which means the same thing about a state.
 */
const LINK_INFERRED_GLYPH = (
  <>
    <path d="M1.8 8h9" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2.4 2.2" />
    <path d="M9.6 5.2L12.6 8l-3 2.8" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </>
)

export interface LinkMarkProps {
  /**
   * The link type, as stored: `consumes`, `blocks`, `contradicts`… Never a word already made from it.
   * The mark makes the reader's word itself, once, from this and `direction` (problem gaYJ80izWMXa:
   * the links panel handed it "blocked by", the mark read that as a stored type, and every link row
   * on a record page said "unknown link").
   */
  type: string
  /** Which end the reader stands on. A backlink reads the reverse word ("blocked by"). */
  direction?: LinkDirection
  /** True when Mole Office worked the link out rather than a person asserting it. */
  inferred?: boolean
  /** True when the record at the other end has been deleted. Kept and shown, never hidden. */
  broken?: boolean
}

/**
 * One typed link, and whether anybody actually said it.
 *
 * FOUR CHANNELS SEPARATE INFERRED FROM CONFIRMED, so the distinction survives greyscale, the mono
 * theme and a reader who is not reading: a broken arrow shaft, a dashed border, a different
 * colour, and the word "inferred" printed in the mark. The dashed border is the convention this
 * app already had and it is not spent on anything else.
 */
export function LinkMark({ type, direction = 'forward', inferred, broken }: LinkMarkProps) {
  // THE WORD IS MADE HERE AND NOWHERE ELSE for a link mark (invariant 9). A caller passes the stored
  // type and the end it stands on; a caller that passed a made word would get the unknown-link word.
  const word = linkWord(type, direction).text
  if (broken === true) {
    return (
      <Mark
        glyph={STATE_GLYPHS.broken}
        word={word}
        count={t('sheet.link.broken')}
        tone="broken"
        alarm="raised"
        mark={inlineMark('broken')}
        detail={t('sheet.link.brokenDetail', { type: word })}
      />
    )
  }
  const worked = inferred === true
  return (
    <Mark
      glyph={worked ? LINK_INFERRED_GLYPH : LINK_CONFIRMED_GLYPH}
      word={word}
      count={worked ? t('sheet.link.inferred') : undefined}
      tone={worked ? 'inferred' : 'todo'}
      inferred={worked}
      mark={inlineMark(worked ? 'hollow' : 'filled')}
      detail={
        worked
          ? t('sheet.link.inferredDetail', { type: word })
          : t('sheet.link.confirmedDetail', { type: word })
      }
    />
  )
}

// ============================================================================ families

/**
 * One of the six reading families from KIND_FAMILIES.
 *
 * FOR HEADINGS AND NAVIGATION. A family is a place to read, never a state and never a filter.
 *
 * IT USED TO BE MONOCHROME AND IT IS NOT ANY MORE. The rule written here was that colour in this
 * product is fully spent on state, so a family had no hue and no attribute naming which family it
 * was, so that no stylesheet could grow a rule colouring one. That was measured wrong on 14 August
 * 2026: 8 of 607 visible chips across fourteen live pages carried any hue at all, so the budget the
 * restriction was protecting was not being spent, and sixteen kinds were one grey pill. The six
 * families now have a glyph and a low-chroma rail — see FAMILY_GLYPHS above, which is where the
 * drawing is decided for both this and `Tag`, so a family heading and a kind tag beneath it cannot
 * be drawn differently.
 *
 * There are too many kinds to tell apart in a list. Six families is not too many, and that is the
 * whole value being claimed here. The number of kinds is not written down in this file: it is
 * `RECORD_KINDS.length`, and a count typed into a sentence is a second copy of it with nothing
 * keeping the two the same.
 */
export interface FamilyTagProps {
  /** The family, when the caller already knows it. */
  family?: KindFamily
  /** A record kind, when it does not. Resolved with `familyOf`, the one place that mapping lives. */
  kind?: string
  /** How many records are in it, for a heading. */
  count?: number
}

export function FamilyTag({ family, kind, count }: FamilyTagProps) {
  if (family === undefined && kind === undefined) {
    throw new Error('FamilyTag needs a `family` or a `kind`. An unnamed family is a heading with no words in it.')
  }
  const resolved = family ?? (kind === undefined ? null : familyOf(kind))
  // A KIND READ ON A PAGE OF ITS OWN HAS NO FAMILY ON PURPOSE, and that is not the finding below.
  // A role card is one since 1 October 2026, by item 3 of a decision: its record page's crumb
  // already names the Role cards page, so nothing is drawn here rather than a false
  // warning.
  if (resolved === null && kind !== undefined && KINDS_READ_ON_THEIR_OWN_PAGE.has(kind)) return null
  if (resolved === null) {
    // Not silently dropped and not drawn as one of the six. A kind no family covers is a real
    // finding — the attention rule has a `stopped:no-family` group for exactly this — and the
    // reader is told rather than shown a heading that quietly leaves records out.
    return (
      <span className="px-family" data-unknown="1" title={t('sheet.readingFamily.unknownDetail', { kind: kind ?? '' })}>
        {t('sheet.readingFamily.unknown', { kind: kind ?? '' })}
      </span>
    )
  }
  return (
    <span
      className="px-family"
      data-family={resolved}
      title={t('sheet.readingFamily.detail')}
    >
      <FamilyGlyph family={resolved} />
      {familyWord(resolved).text}
      {count === undefined ? null : <span className="px-family-count num">{count}</span>}
    </span>
  )
}

// ============================================================================ why a row is here

/**
 * THE REASON LINE — why this row is on this screen, in the server's own sentence.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SENTENCE ON EVERY ROW, WHEN THAT IS THE EXPENSIVE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * This is the first approved decision and it was argued both ways. Against: forty sentences is a
 * wall of text, and tracking exhausts the person. For, and what won:
 * a ranked list produced by a rule the reader cannot see is the silent behaviour this project bans
 * everywhere else, several titles are the name of a record rather than a description of a problem,
 * and the reason line is the only place an unknown gets said out loud.
 *
 * SO THE SENTENCE IS ALWAYS VISIBLE AND THE ARITHMETIC IS ONE PRESS AWAY. `because` is a sentence
 * a person can disagree with; the factor breakdown is the number that sentence came from, and it
 * is behind a disclosure because it is a check, not a read. Neither is ever hidden by a hover: a
 * phone has no hover, and this is a phone screen as much as a desk one.
 *
 * NOTHING HERE COMPOSES A REASON. `because` and `factors` arrive from GET /api/attention exactly
 * as the shared rule wrote them. This component chooses a layout and nothing else — if it built
 * its own sentence there would be two statements of the rule, and the screen's would be the one
 * people read and the wrong one.
 */

/**
 * Reading words for the five factor names.
 *
 * The names themselves (`harm`, `owed`, `late`, `standing`, `sat`) are the machine-readable keys
 * the server ranks by, and `sat` on its own is not English. These add the words and nothing else;
 * the sentence explaining each factor's value is `factor.why`, which is written on the server.
 * Typed against FactorName, so a sixth factor added there stops this file compiling.
 */
export const FACTOR_LABELS: Readonly<Record<keyof typeof FACTOR_MAX, string>> = {
  get harm() { return t('sheet.factor.harm') },
  get owed() { return t('sheet.factor.owed') },
  get late() { return t('sheet.factor.late') },
  get standing() { return t('sheet.factor.standing') },
  get sat() { return t('sheet.factor.sat') },
}

export interface FactorBreakdownProps {
  /** `row.reason.factors`, every one of them. */
  factors: readonly RankFactor[]
  /** `row.score`. Shown as the total, so the arithmetic on screen visibly adds up. */
  score?: number
}

/**
 * Every factor that was considered, with what it contributed and why.
 *
 * ZEROES ARE SHOWN. A factor worth nothing still says why it is worth nothing — "nobody has
 * recorded who is hurt if this is left alone" is the most useful line on some rows, because it
 * names a field somebody can go and fill in. Dropping the zeroes would turn the breakdown into a
 * list of reasons the row won, which is an advert rather than a check.
 *
 * The bar is drawn against FACTOR_MAX from the shared rule, so its length means "this factor gave
 * most of what it could give" rather than "this bar is longer than that bar".
 */
export function FactorBreakdown({ factors, score }: FactorBreakdownProps) {
  if (factors.length === 0) {
    throw new Error('FactorBreakdown needs the factors. An empty breakdown says the row was ranked by nothing.')
  }
  const total = factors.reduce((sum, factor) => sum + factor.points, 0)
  return (
    <div className="px-factors">
      <ul className="px-factor-list">
        {factors.map((factor) => {
          const max = FACTOR_MAX[factor.name]
          const share = max === 0 ? 0 : Math.round((factor.points / max) * 100)
          return (
            <li className="px-factor" key={factor.name} data-zero={factor.points === 0 ? '1' : undefined}>
              <span className="px-factor-name">{FACTOR_LABELS[factor.name]}</span>
              <span className="px-factor-points num">
                {factor.points}
                <span className="px-factor-of">{t('sheet.factor.of', { max })}</span>
              </span>
              <span className="px-factor-track" aria-hidden="true">
                <span className="px-factor-fill" style={{ width: `${share}%` }} />
              </span>
              <span className="px-factor-why">{factor.why}</span>
            </li>
          )
        })}
      </ul>
      <p className="px-factor-total">
        <span className="num">{score ?? total}</span> {t('sheet.factor.total', { n: factors.length })}
        {score !== undefined && score !== total ? (
          <span className="px-factor-disagree">
            {' '}
            {t('sheet.factor.disagrees', { score, total })}
          </span>
        ) : null}
      </p>
    </div>
  )
}

export interface ReasonLineProps {
  /** `row.reason.because`, whole. Never shortened and never re-worded. */
  because: string
  /** `row.reason.factors`. Leave it out where the row was not ranked. */
  factors?: readonly RankFactor[]
  /** `row.score`. */
  score?: number
  /** True when the safety floor put this row above everything that is not safety. */
  safetyFloor?: boolean
  /** Open the breakdown at rest. The component sheet uses it so a screenshot can show it. */
  open?: boolean
}

export function ReasonLine({ because, factors, score, safetyFloor, open }: ReasonLineProps) {
  if (because.trim() === '') {
    throw new Error('ReasonLine needs the reason. A row on this list with no reason is a bug worth seeing.')
  }
  return (
    <div className="px-reason">
      <p className="px-reason-because">
        <span className="px-reason-lead">{t('sheet.reason.lead')}</span>
        {because}
      </p>
      {safetyFloor === true ? (
        <p className="px-reason-floor">
          <SafetyFloorMark />
          <span className="px-reason-floor-text">
{t('sheet.reason.safety')}
          </span>
        </p>
      ) : null}
      {factors === undefined ? null : (
        <details className="px-reason-more" open={open}>
          <summary className="px-reason-sum">
            {score === undefined ? t('sheet.reason.ranked') : t('sheet.reason.score', { score })}
          </summary>
          <FactorBreakdown factors={factors} score={score} />
        </details>
      )}
    </div>
  )
}

// ============================================================================ hidden count

/**
 * "12 of 66 shown", what the other 54 are, and the way to all of them.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE RULE THAT LETS ANYTHING BE FOLDED AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * The problem is not to be solved by avoiding the information. So
 * the archive stays whole and the reading layer gets small — and the only thing that makes those
 * two compatible is that every shortened list says exactly how much it is not showing, names what
 * is in the part it is not showing, and offers a way to the whole thing. That is approved decision
 * 7 and this component is where it is enforced rather than remembered.
 *
 * NEVER THE BARE WORD "MORE". "54 more" is the sentence that turns a complete archive into a
 * feeling that something is missing. It is a count with no content, and it cannot be acted on.
 *
 * THE ARITHMETIC IS CHECKED, NOT TRUSTED. If the named groups do not add up to the number hidden,
 * this throws instead of drawing a line that does not balance. A component that will happily print
 * "the other 54 are: 3 sessions" is one that lets a list quietly lose fifty-one rows, and every
 * caller here has an exact breakdown available — the server computes `remainderByGroup` precisely
 * so this can be exact.
 */
export interface HiddenGroup {
  /** What these are, as a plural noun phrase: "checklist items that stopped short". */
  label: string
  count: number
  /** Where this group alone can be read, when there is such a place. */
  href?: string
}

export interface HiddenCountProps {
  /** How many are on the screen. */
  shown: number
  /** How many there are in total. `total - shown` is what is hidden, and it is stated exactly. */
  total: number
  /** What the hidden ones are. Required whenever anything is hidden, and must add up. */
  groups?: readonly HiddenGroup[]
  /** The route to the complete list. Required: a fold with no way out is a hidden list. */
  href: string
  /** What these things are — "rows", "records", "sessions". Named, never left to a default. */
  what: string
  /** The link's words. Defaults to naming the total, which is what a reader is looking for. */
  linkText?: string
  /** An extra sentence from the server, e.g. `remainderNote` or which cap moved these. */
  note?: string
}

export function HiddenCount({ shown, total, groups, href, what, linkText, note }: HiddenCountProps) {
  if (!Number.isInteger(shown) || !Number.isInteger(total) || shown < 0 || total < shown) {
    throw new Error(`HiddenCount: ${shown} of ${total} is not a count. Pass whole numbers with shown <= total.`)
  }
  if (href.trim() === '') {
    throw new Error('HiddenCount needs a route to the complete list. A fold with no way out is a hidden list.')
  }
  const hidden = total - shown
  const named = groups ?? []
  if (hidden > 0 && named.length === 0) {
    throw new Error(
      `HiddenCount: ${hidden} of ${total} ${what} are not shown and nothing says what they are. Pass the named groups; never the bare word "more".`,
    )
  }
  const summed = named.reduce((sum, group) => sum + group.count, 0)
  if (hidden > 0 && summed !== hidden) {
    throw new Error(
      `HiddenCount: ${hidden} ${what} are hidden but the named groups add up to ${summed}. The line would not balance, so ${Math.abs(hidden - summed)} would be lost with nothing saying so.`,
    )
  }

  return (
    <div className="px-hidden">
      <p className="px-hidden-head">
        <strong className="px-hidden-count num">
          {t('sheet.hidden.count', { shown, total, what })}
        </strong>
        {hidden > 0 ? <span className="px-hidden-said">{t('sheet.hidden.others', { n: hidden })}</span> : <span className="px-hidden-said">{t('sheet.hidden.none')}</span>}
      </p>
      {hidden > 0 ? (
        <ul className="px-hidden-groups">
          {named.map((group) => (
            <li className="px-hidden-group" key={group.label}>
              <span className="px-hidden-n num">{group.count}</span>
              {group.href === undefined ? (
                <span className="px-hidden-label">{group.label}</span>
              ) : (
                <a className="px-hidden-label px-nav" href={group.href}>
                  {group.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {note === undefined ? null : <p className="px-hidden-note">{note}</p>}
      <a className="px-hidden-route px-nav" href={href}>
        {linkText ?? (hidden > 0 ? t('sheet.hidden.all', { total, what }) : t('sheet.hidden.full', { what }))}
      </a>
    </div>
  )
}

// ============================================================================ what every fold owes

/**
 * SCAN FIRST, EXPLAIN ON DEMAND — and the price of being allowed to fold anything at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, WHICH IS THE SAME ONE `HiddenCount` ENFORCES FOR LISTS
 * ---------------------------------------------------------------------------------------
 *
 * The problem is not to be solved by avoiding the information. So
 * nothing in this product is ever deleted from a screen — it is put one press away — and a fold is
 * only honest when it says three things: how much is behind it, what those things ARE, and how to
 * get to them. `HiddenCount` says that for a shortened LIST. The three components below say it for
 * a ROW, for a BLOCK OF PROSE and for a STRIP OF COUNTS, and they share these two guards so that
 * all four cannot drift into four different standards.
 *
 * NEVER THE BARE WORD "MORE". "5 more" is a count with no content. It cannot be acted on, it names
 * nothing, and it turns a complete archive into a feeling that something has gone missing. Every
 * fold in this file takes an `opens` string, it is required, and the guard below rejects the word
 * itself as well as the empty string — because a component that merely ASKS for a name still gets
 * "more" typed into it on a Friday afternoon.
 */

/**
 * The words a fold is not allowed to be labelled with.
 *
 * Written as a pattern rather than a list of forbidden strings because the failure has a shape:
 * an optional count, an optional verb, and then the word that says nothing. "more", "5 more",
 * "show more", "See more…" are all the same defect. A label that CONTAINS the word is fine —
 * "3 more sessions than yesterday" names what it holds and is a legitimate sentence.
 */
const BARE_MORE = /^(?:\d+\s+)?(?:show|see|read|view|open)?\s*more\s*(?:…|\.\.\.)?$/i

/**
 * A fold must name what is behind it. Throws rather than rendering a disclosure that cannot say.
 *
 * Throwing is deliberate and is this library's habit: a component that quietly draws the wrong
 * thing is how a screen starts lying, and the loud version is caught the first time it is rendered
 * rather than the first time somebody reads the page carefully.
 */
function namesWhatOpens(opens: string, component: string): void {
  const words = opens.trim()
  if (words === '') {
    throw new Error(
      `${component} needs \`opens\` to name what is behind the fold. A disclosure that cannot say what it holds is the word "more".`,
    )
  }
  if (BARE_MORE.test(words)) {
    throw new Error(
      `${component} was given "${opens}" as the words on its fold. Name what is behind the fold: "more" is a count with no content and cannot be acted on.`,
    )
  }
}

/**
 * How much is behind a fold, where a count is meaningful.
 *
 * OPTIONAL ON PURPOSE, and that is not a loophole. A count is meaningful for five rank factors and
 * for twenty-one records; it is not meaningful for one paragraph of prose, and "1 explanation" on
 * a fold is noise pretending to be arithmetic. What is NEVER optional is `opens`, so a fold with
 * no count still names what it holds.
 */
export interface FoldHolds {
  /** How many things are behind the fold. Exact. Zero is a real answer and is printed as one. */
  count: number
  /** What they are, as a plural noun phrase: "rank factors", "records with no state word". */
  what: string
}

/** "5 rank factors", or null when the fold carries no count. Checked, never trusted. */
function holdsPhrase(holds: FoldHolds | undefined, component: string): string | null {
  if (holds === undefined) return null
  if (!Number.isInteger(holds.count) || holds.count < 0) {
    throw new Error(`${component}: ${holds.count} is not a count of what is behind the fold. Pass a whole number.`)
  }
  const what = holds.what.trim()
  if (what === '') {
    throw new Error(
      `${component}: "${holds.count}" with no noun after it is the bare word "more" with a number in front. Say what the ${holds.count} are.`,
    )
  }
  return `${holds.count} ${what}`
}

// ============================================================================ standing explanation

/**
 * The width at which this app stops being a desk and starts being a phone.
 *
 * 480px is not a new number: it is the breakpoint styles.css, tokens.css, App.tsx, ui.tsx and
 * three components already use. It is written down once here so a component that has to make the
 * same decision in JavaScript cannot drift away from the one the stylesheets make.
 */
export const NARROW_QUERY = '(max-width: 480px)'

/** What the media query says right now, or `false` where there is no window to ask. */
function readNarrow(query: string): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

/**
 * True while the viewport is a phone, and kept true or false as the window is resized.
 *
 * IT FAILS TO `false`, WHICH IS THE WIDE ANSWER, and that is the whole reason it is written this
 * way. Every caller uses it to decide whether prose is folded away; a runtime with no matchMedia
 * — the test runner, an old browser — then shows all of it. A fold is the failure this product
 * cannot take silently, so the uncertain answer is the one that hides nothing.
 */
export function useNarrow(query: string = NARROW_QUERY): boolean {
  const [narrow, setNarrow] = useState(() => readNarrow(query))
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const read = () => setNarrow(mq.matches)
    // Read once on the way in as well: the first render answered before this effect ran, and
    // between the two the window may already have been a different size.
    read()
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [query])
  return narrow
}

export interface StandingNoteProps {
  /**
   * The one line that stands in for the prose on a phone: the counts it was making, or the single
   * fact it was about. It has to be readable in a fraction of the space the paragraphs took, or
   * this is the same defect at a smaller size.
   */
  summary: React.ReactNode
  /** What opens, named. Never the word "more": a fold that cannot say what is in it is a hidden list. */
  opens: string
  children: React.ReactNode
}

/**
 * A standing explanation: prose on a desk, a line of counts and a disclosure on a phone.
 *
 * WHY THIS EXISTS. The original audit of the old interface named one defect above all the others:
 * "the product explains itself in permanent prose at the point of use". The prose is good and is
 * genuinely useful the first few times — what is wrong is that at 390px it is permanent furniture
 * standing in the most valuable space on the smallest screen. On Home it ran to roughly 800px of
 * an 844px viewport, so the software emergency stop, which is the single most important row in
 * this product, opened below the fold.
 *
 * NOTHING IS DELETED AND NOTHING IS REWRITTEN. The children are the same elements at both widths.
 * On a wide screen this component renders them and nothing else — not a wrapper, not a details, no
 * DOM at all — so the desk layout is byte-for-byte what it was before this component existed. On a
 * phone the same children go inside a native `<details>`, which survives find-in-page, needs no
 * JavaScript to open, and cannot get out of step with a copy of "is it open" that nobody keeps.
 *
 * That is approved decision 9 — one information model, one set of components, composed by width —
 * rather than a second page written for the phone.
 */
export function StandingNote({ summary, opens, children }: StandingNoteProps) {
  const narrow = useNarrow()
  namesWhatOpens(opens, 'StandingNote')
  if (!narrow) return <>{children}</>
  return (
    <details className="px-standing">
      <summary className="px-standing-sum">
        <span className="px-standing-counts">{summary}</span>
        <span className="px-standing-open">{opens}</span>
      </summary>
      <div className="px-standing-body">{children}</div>
    </details>
  )
}

// ============================================================================ a row that expands

/**
 * ONE ROW, SCANNABLE CLOSED AND COMPLETE OPEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHY THIS IS NOT A SECOND `Row`
 * ---------------------------------------------------------------------------------------
 *
 * `Row` draws everything it is given, every time. That is right for a list of ten checklist items
 * and wrong for the attention list, the sessions page and the query results, where each row also
 * carries a reason sentence, a rank breakdown, a machine note or a list of links. Seven of those
 * rows is a page a reader cannot scan: the eye has nowhere to run, because every line is four
 * lines. Photographed at 390px it is worse — the whole viewport holds two rows.
 *
 * So this is `Row`'s shape with a fold in it. Closed it shows the four things a scan needs and
 * nothing else: WHAT it is (the title), WHAT IS WRONG (the state chip in the fixed severity
 * column), HOW LOUD (the alarm level), and HOW OLD (one short phrase on the right). Open, it shows
 * everything the caller passed as children, which is the same elements `Row` would have drawn in
 * its `meta` slot. Nothing is deleted; it is one press away, and the press is on the row itself.
 *
 * ---------------------------------------------------------------------------------------
 * THREE SHAPES, SO THE SCANNABLE PART IS PROPS AND THE DETAIL IS CHILDREN
 * ---------------------------------------------------------------------------------------
 *
 * An attention item, a session and a query result are three different things and their detail has
 * nothing in common: a reason line and five rank factors, a command line and a process id, a list
 * of records with a broken link between them. Baking any one of those into this component would
 * have made the other two pass it something shaped wrong. What the three DO share is the scan
 * line, and that is exactly the part that is props here.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TITLE IS NOT A LINK, WHICH IS THE ONE THING GIVEN UP
 * ---------------------------------------------------------------------------------------
 *
 * `<summary>` is the toggle. An anchor inside it is pressed by the same click that opens the fold,
 * so the row would both navigate and expand from one press and the reader would never be sure
 * which they were about to get. The route to the record is therefore the FIRST line of the body,
 * as an ordinary underlined link, and it is reached by the same press that opens everything else.
 * That costs one press and it is the honest trade; a control that does two things is worse.
 *
 * NATIVE `<details>` AND NOTHING ELSE. It is keyboard-reachable and screen-reader-correct for
 * free, it survives find-in-page, it needs no JavaScript, and there is no second copy of "is this
 * open" for anything to get out of step with. This repository's test runner has no DOM, so
 * behaviour the platform provides is behaviour that cannot silently break here.
 */
export interface ScanRowProps {
  /**
   * The one line a reader scans. Bare text, not a link — see the note above about `<summary>`.
   * It may hold any script: nothing here uppercases, letter-spaces or truncates it.
   */
  title: React.ReactNode
  /** Renders the chip in the fixed severity column, at the row's alarm level. */
  state?: PanelState
  /**
   * What goes in the fixed severity column INSTEAD of a StateChip — a `StoredState` carrying a
   * word this interface's ten-word vocabulary does not contain, or one of the marks. Chip-shaped,
   * for the same reason `Row` says so: a column that sometimes holds a paragraph cannot be
   * scanned. Passing both this and `state` is a programming mistake and says so.
   *
   * PASS THE ROW'S ALARM LEVEL TO WHATEVER YOU PUT HERE. A row drawn `faded` whose own chip is at
   * full alarm strength is one line saying two different things about how urgent it is, and that
   * defect was on four pages at once before a photograph found it. `state` does it for you.
   */
  sev?: React.ReactNode
  /** How loudly to draw the row, from the alarm scale. See ALARM_LEVELS. */
  alarm?: AlarmLevel
  /**
   * This row says a person could be hurt — `row.safety`, the server's own separate sort key.
   *
   * IT IS NOT A SECOND LEVEL. `alarm` still says how loudly; this says which ONE fact bought the
   * loudest step, and it is the only thing on the ladder that fills a row's ground. Strong red is
   * a budget: a row past its date keeps the rail and the number, and the filled ground is spent
   * on the fact a reader cannot work out from the order of the list.
   */
  safety?: boolean
  /** A small inert marker at the head of the title: a kind Tag, a FamilyTag, an index. */
  leading?: React.ReactNode
  /** The right-hand cell: how old, or how late. One short phrase — "6 days late", "47m". */
  age?: React.ReactNode
  /** What opens, NAMED. Required, and the word "more" is rejected. */
  opens: string
  /** How much is behind the fold, where a count means something. */
  holds?: FoldHolds
  /** The route to the whole record. Drawn as the first line of the body. */
  href?: string
  /** The link's words. Defaults to naming the route rather than the row, which is what it is. */
  linkText?: string
  /** Open at rest. The component sheet uses it so a screenshot can show the open state. */
  open?: boolean
  /** What this row IS, so a person can point at it. Same value and same reason as `Row.target`. */
  target?: Target
  /** Everything that is not scannable: the reason line, the factors, the links, the command. */
  children: React.ReactNode
}

export function ScanRow({
  title,
  state,
  sev,
  alarm,
  safety,
  leading,
  age,
  opens,
  holds,
  href,
  linkText,
  open,
  target,
  children,
}: ScanRowProps) {
  if (sev !== undefined && state !== undefined) {
    throw new Error('ScanRow takes `state` or `sev`, not both. Two things in the severity column is a column you cannot scan.')
  }
  namesWhatOpens(opens, 'ScanRow')
  const behind = holdsPhrase(holds, 'ScanRow')

  // An alarm row with no `state` still needs a colour to spine with, and the colour of the alarm
  // scale is what `--st-failed` names in every theme. The same line `Row` carries, for the same
  // reason: not a hard-coded red, because in the mono theme it is near-black and that is correct.
  const style: React.CSSProperties =
    state !== undefined ? toneVars(state) : alarm !== undefined ? toneVars('failed') : {}

  return (
    <details
      className="px-scan"
      style={style}
      data-alarm={alarm}
      data-safety={safety ? '1' : undefined}
      open={open}
      {...(target === undefined ? {} : targetAttributes(target))}
    >
      <summary className="px-scan-sum">
        <span className="px-scan-sev">
          {state !== undefined ? <StateChip state={state} {...(alarm === undefined ? {} : { alarm })} /> : (sev ?? null)}
        </span>
        <span className="px-scan-main">
          {leading ? <span className="px-scan-lead">{leading}</span> : null}
          {/* WHAT IT IS CALLED, for the composer's chip. Same mark and same reason as Row above. */}
          <span className="px-scan-title" {...(target === undefined ? {} : DRAWS_THE_NAME)}>
            {title}
          </span>
        </span>
        <span className="px-scan-age">{age ?? null}</span>
        <span className="px-scan-open">
          <span className="px-scan-opens">{opens}</span>
          {behind === null ? null : <span className="px-scan-holds num">{behind}</span>}
        </span>
      </summary>
      <div className="px-scan-body">
        {href === undefined ? null : (
          <a className="px-scan-route px-nav" href={href}>
            {linkText ?? t('sheet.scan.open')}
          </a>
        )}
        {children}
      </div>
    </details>
  )
}

// ============================================================================ prose on demand

/**
 * A BLOCK OF PROSE THAT IS VALUABLE ONCE AND FURNITURE AFTERWARDS.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THIS DIFFERS FROM `StandingNote`, WHICH IS THE QUESTION TO ASK BEFORE PICKING ONE
 * ---------------------------------------------------------------------------------------
 *
 *   `StandingNote` folds BY WIDTH. Above 480px it renders its children and no wrapper at all, so
 *                  the desk layout is untouched. Use it where the prose genuinely earns its space
 *                  on a wide screen and only the phone cannot afford it.
 *
 *   `Explain`      folds AT EVERY WIDTH. Use it where the prose is read carefully once and then
 *                  skipped for the next two hundred visits — the rule behind a ranking, what a
 *                  panel does not cover, why a query is worth running. On a 1440px screen those
 *                  paragraphs are still the thing standing between a reader and the rows.
 *
 * ONE LINE OF MEANING STAYS VISIBLE, and it is a line of MEANING rather than a label. "The rule"
 * is a filing card; "Something needs you when it is owed outside, or when it stopped short" is the
 * sentence itself, shortened. If the visible line does not say anything on its own, this component
 * has hidden the content and left the furniture, which is the defect upside down.
 */
export interface ExplainProps {
  /**
   * WHAT THIS FOLD IS, so a person can point at it. Required, for the reason `Panel.declares` is:
   * a fold nobody can point at is a paragraph a reader can disagree with and not say so.
   */
  declares: Declares
  /**
   * The one line that stays visible. Phrasing content: it renders inside a `<summary>`, so a `<p>`
   * here is invalid markup. A `<span>`, a `<strong>` or plain text.
   */
  meaning: React.ReactNode
  /** What opens, NAMED. Required, and the word "more" is rejected. */
  opens: string
  /** How much is behind the fold, where a count means something. Prose usually has no such count. */
  holds?: FoldHolds
  /** Open at rest. The component sheet uses it so a screenshot can show the open state. */
  open?: boolean
  children: React.ReactNode
}

export function Explain({ declares, meaning, opens, holds, open, children }: ExplainProps) {
  namesWhatOpens(opens, 'Explain')
  const behind = holdsPhrase(holds, 'Explain')
  return (
    <details className="px-explain" open={open} {...declaredAttributes(declares)}>
      <summary className="px-explain-sum">
        {/* The visible line IS what this fold is called. Marked only when the fold declares, for
            the reason on `Panel`'s heading above. */}
        <span className="px-explain-meaning" {...(declaresSomething(declares) ? DRAWS_THE_NAME : {})}>
          {meaning}
        </span>
        <span className="px-explain-open">
          <span className="px-explain-opens">{opens}</span>
          {behind === null ? null : <span className="px-explain-holds num">{behind}</span>}
        </span>
      </summary>
      <div className="px-explain-body">{children}</div>
    </details>
  )
}

// ============================================================================ data health

/**
 * THE COUNTS THAT ARE QUESTIONS RATHER THAN WORK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Three groups come back from GET /api/attention that are NOT on the attention list and must not
 * be, because none of them is a verdict about the work:
 *
 *   `unclassified` — nobody has said what this record's state word means. A question for a person.
 *   `noState`      — the record carries no state word at all, which is a different question again.
 *   `paused`       — somebody deliberately put it down, with a reason. A decision, not a failure.
 *
 * On the current seed that is 21, 97 and 6 records. Drawn as three open lists they take half of the
 * home page and push the rows that need a person below the fold — so the page answers "what is
 * untidy about my database" before it answers "what will go wrong today", which is backwards.
 *
 * THEY ARE NOT DELETED AND THEY ARE NOT SHRUNK. Each count is exact, each group is named in words,
 * and each opens IN PLACE to the whole list behind it. This is the same bargain `HiddenCount`
 * makes; the difference is that these are counts of questions rather than a shortened list, so the
 * detail lives behind the number itself instead of behind a link to another page.
 *
 * A GROUP WITH NOTHING IN IT IS STILL PRINTED, and it does not open. "0 records with no state
 * word" is a real answer and a good one; a disclosure that opens onto nothing is a dead end, so a
 * zero group is drawn as its count and its name, and nothing else. Its sentence is still required
 * of it — it is read on the day the group has members and opens onto them.
 */
export interface HealthGroup {
  /** What these are, as a plural noun phrase: "state words nobody has classified". */
  label: string
  /** How many. Exact, and zero is printed rather than dropped. */
  count: number
  /** One sentence saying why this is a question and not work. Always shown when the group opens. */
  note: string
  /** The whole list, opened in place by pressing the count. */
  detail?: React.ReactNode
  /** Where this group alone can be read, when there is such a place. */
  href?: string
  /** The link's words. Defaults to naming the count and the group. */
  linkText?: string
  /** Open at rest. The component sheet uses it so a screenshot can show the open state. */
  open?: boolean
}

/**
 * The sentence this strip says about itself, in one place so every surface says the same thing.
 *
 * Exported because a page may want to quote it in a heading rather than print it twice.
 */
export const DATA_HEALTH_LEAD = en['sheet.health.lead']

export interface DataHealthProps {
  groups: readonly HealthGroup[]
  /**
   * What these are counts OF, as a plural noun: "records", "sessions". Named, never defaulted —
   * the three groups on Today count records and a sessions page counting runs would be a different
   * noun, and printing the wrong one is the sort of quiet mistake this product exists to remove.
   */
  what: string
  /**
   * The page has already said what this strip is, in its own heading, so the strip does not say it
   * again. Pass it ONLY where that heading carries the same meaning — Home's is "Not on that list,
   * and not a verdict", forty pixels above, and printing `DATA_HEALTH_LEAD` under it was one thought
   * twice on one screen. Left out, the strip speaks for itself, which is what a page with a plain
   * heading needs.
   */
  leadSaidAbove?: boolean
}

export function DataHealth({ groups, what, leadSaidAbove }: DataHealthProps) {
  if (groups.length === 0) {
    throw new Error('DataHealth needs its groups. An empty strip says nothing, including whether anything was looked at.')
  }
  if (what.trim() === '') {
    throw new Error('DataHealth needs `what` these are counts of. A number with no noun cannot be read.')
  }
  for (const group of groups) {
    if (group.label.trim() === '') {
      throw new Error('DataHealth: a group with no label is a number nobody can act on.')
    }
    if (!Number.isInteger(group.count) || group.count < 0) {
      throw new Error(`DataHealth: "${group.label}" has count ${group.count}, which is not a count.`)
    }
    if (group.note.trim() === '') {
      throw new Error(`DataHealth: "${group.label}" has no sentence saying why it is a question rather than work.`)
    }
    // A count with no way to the records behind it is exactly the fold this product forbids: it
    // reports a number and offers nothing to do about it.
    if (group.count > 0 && group.detail === undefined && group.href === undefined) {
      throw new Error(
        `DataHealth: "${group.label}" says there are ${group.count} and gives no way to see them. Pass \`detail\`, or \`href\`, or both.`,
      )
    }
  }
  const total = groups.reduce((sum, group) => sum + group.count, 0)
  const noun = what.trim()

  return (
    <section className="px-health">
      <p className="px-health-head">
        <strong className="px-health-total num">{total}</strong> {t('sheet.health.heading', { n: total, what: noun, groups: t('sheet.health.groups', { n: groups.length }) })}
      </p>
      <div className="px-health-strip">
        {groups.map((group) =>
          group.count === 0 ? (
            // THE COUNT AND THE NAME, AND NOTHING ELSE. A zero group used to print its whole note
            // inline and uncollapsed -- on Home that was about forty-five words under a "0",
            // explaining a group with nothing in it to explain. The note is good writing and it is
            // still required of every group; it is read where the group has members and opens onto
            // them. What a reader needs here is that the count is zero and what it counted.
            <p className="px-health-none" key={group.label}>
              <span className="px-health-n num">0</span>
              <span className="px-health-label">{group.label}</span>
            </p>
          ) : (
            <HealthGroupFold group={group} key={group.label} />
          ),
        )}
      </div>
      {leadSaidAbove ? null : <p className="px-health-lead">{t('sheet.health.lead')}</p>}
    </section>
  )
}

/**
 * ONE GROUP OF THE STRIP, WITH ITS LIST MOUNTED ONLY WHILE IT IS OPEN.
 *
 * A closed `<details>` still lays its content out in Chrome. On Home in Developer mode, measured on
 * 9 October 2026 on an office of the owner's size, the three question groups held about 30,000 rows
 * nobody had opened: they were built on load, and one of them, carrying a comment, stretched the page
 * millions of pixels below its content. So `detail` is drawn while the group is open and not before.
 */
function HealthGroupFold({ group }: { group: HealthGroup }) {
  const [open, setOpen] = useState(group.open === true)
  return (
    <details className="px-health-group" open={group.open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="px-health-sum">
        <span className="px-health-n num">{group.count}</span>
        <span className="px-health-label">{group.label}</span>
      </summary>
      <div className="px-health-body">
        <p className="px-health-note">{group.note}</p>
        {open ? group.detail : null}
        {group.href === undefined ? null : (
          <a className="px-health-route px-nav" href={group.href}>
            {group.linkText ?? t('sheet.health.open', { n: group.count, group: group.label })}
          </a>
        )}
      </div>
    </details>
  )
}

// ============================================================================ loading data

/**
 * ARM A "still mounted" FLAG. Call it in an effect with no dependencies; it returns the cleanup.
 *
 * WHY THIS EXISTS AS A NAMED FUNCTION RATHER THAN AN INLINE CLEANUP. The sessions reader's
 * `useMachineReading` in SessionPanel.tsx needs this flag and once used the same wrong cleanup:
 *
 *     useEffect(() => () => { live.current = false }, [])      // a cleanup and nothing else
 *
 * That reads as obviously correct and it made the sessions panel load for ever. React StrictMode
 * mounts, unmounts and remounts every component in development, and REUSES its refs across the
 * cycle — a ref is not state, so nothing reinitialises `useRef(true)` on the second mount. The
 * first cleanup therefore set the flag false permanently, and every reply afterwards was discarded
 * as one that had arrived after the reader navigated away. Nobody had navigated anywhere.
 *
 * So the flag has to be ARMED on mount, not only disarmed on unmount. No reader in src/ calls it
 * now; tests/mounted-flag.test.ts exercises the contract without a DOM.
 *
 * It takes the ref rather than creating it, so it is an ordinary function and can be tested by
 * simulating React's mount / unmount / mount order without a DOM — which is what
 * tests/mounted-flag.test.ts does, and what nothing in this repository could do before.
 */
export function armMounted(flag: { current: boolean }): () => void {
  flag.current = true
  return () => {
    flag.current = false
  }
}

export type AsyncState<T> =
  | { status: 'loading' }
  /**
   * `message` is what a person reads; `fault` is what sort of failure it was.
   *
   * `fault` is null when whatever was thrown was not a failed request — a bug in a component, say.
   * A caller hands it straight to `ErrorNote`, which is the one place that turns it into a drawing.
   * It is a second field rather than a replacement for `message` so that the forty callers that
   * only ever wanted the sentence did not have to change.
   */
  | { status: 'error'; message: string; fault?: Fault | null }
  | {
      status: 'ready'
      value: T
      /**
       * TRUE WHILE A RE-READ OF THIS SAME QUESTION IS IN FLIGHT, for a page that asked `useAsync` for it
       * with `saysRefreshing`. The `value` on screen is the PREVIOUS answer, and the strip at the foot of
       * the page says the page is refreshing whether or not the page asked for this flag.
       */
      refreshing?: boolean
      /**
       * SET WHEN A RE-READ FAILED. The `value` is still the previous answer — a failed re-read must
       * not discard what is on screen — and this is why the newer answer is not there. The strip at
       * the foot of the page draws it as well, so the failure is said even by a page that never
       * reads this field.
       */
      reReadError?: { message: string; fault?: Fault | null }
    }

// ---------------------------------------------------------------------------- the re-read marks
//
// WHAT THE PAGE SAYS WHILE ONE OF ITS READS IS TAKING A NEWER ANSWER, and after one of them failed.
//
// Criterion E5: a page that re-reads keeps what it has until the new answer arrives, and it must SAY
// so — stale content with no mark is worse than a blank, because the reader cannot tell old from
// new. The hook knows when it is keeping; the strip that draws it is one component drawn once in the
// shell (ReReadStrip.tsx), because 129 call sites cannot each remember to draw a mark. The hook
// writes; the strip reads. A read that failed clears when its next read succeeds, when its component
// unmounts (a fault clears when the reader leaves the page), or when the whole page is left.

/** What one live `useAsync` is saying to the strip right now. */
interface OneReReadMark {
  refreshing: boolean
  error: { message: string; fault?: Fault | null } | null
}

/** What the strip draws, as one snapshot. */
export interface ReReadMarks {
  /** How many live reads are taking a newer answer while their previous answer is on screen. */
  refreshing: number
  /** One entry per live read whose newer answer failed. */
  errors: { message: string; fault?: Fault | null }[]
  /** How many re-reads were answered since the page loaded. It only rises, so the light round the disc compares it. */
  answered: number
  /** How many re-reads were refused since the page loaded. It only rises, as answered does. */
  refused: number
  /** How many live reads in the page draw an answer read for another project than the one chosen. */
  anotherProject: number
}

const theReReadSlot = new Map<number, OneReReadMark>()
let theNextReReadSlotId = 1
let theReReadSnapshot: ReReadMarks = { refreshing: 0, errors: [], answered: 0, refused: 0, anotherProject: 0 }
let theReReadsAnswered = 0
let theReReadsRefused = 0
const theReReadListeners = new Set<() => void>()
/**
 * THE LIVE READS IN THE PAGE WHOSE ANSWER ON SCREEN WAS READ FOR ANOTHER PROJECT. One key per hook,
 * put in and taken out by `useAsync` in the commit that draws that answer and the commit that
 * replaces it.
 */
const theReadsShowingAnotherProject = new Set<object>()

function theReReadsChanged(): void {
  let refreshing = 0
  const errors: { message: string; fault?: Fault | null }[] = []
  for (const one of theReReadSlot.values()) {
    if (one.refreshing) refreshing += 1
    if (one.error !== null) errors.push(one.error)
  }
  theReReadSnapshot = { refreshing, errors, answered: theReReadsAnswered, refused: theReReadsRefused, anotherProject: theReadsShowingAnotherProject.size }
  for (const listener of theReReadListeners) listener()
}

/** Subscribe to the marks. The strip, and the disc and menu press that draw the ring, read this. */
export function subscribeReReadMarks(listener: () => void): () => void {
  theReReadListeners.add(listener)
  return () => {
    theReReadListeners.delete(listener)
  }
}

/** The current marks, as one stable snapshot between changes. */
export function theReReadMarks(): ReReadMarks {
  return theReReadSnapshot
}

/**
 * THE READ THIS HOOK ALREADY HAS OUT, and the dependencies it was started for.
 *
 * Only ever one per hook instance. A second effect run for the same dependencies reuses this
 * promise instead of starting the read again.
 */
export interface ReadInFlight<T> {
  deps: React.DependencyList
  promise: Promise<T>
}

/** True when two effect dependency lists name the same read, compared the way React compares them. */
export function sameReadDeps(a: React.DependencyList, b: React.DependencyList): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false
  return true
}

/**
 * THE ONE READ FOR THIS RUN OF THE EFFECT, AND THE REASON THE DEV BUILD STOPS PAYING TWICE.
 *
 * React StrictMode — src/web/main.tsx — runs every effect, cleans it up and runs it again on mount,
 * on purpose, so that a missing cleanup shows itself. `useAsync` started its fetch in the effect and
 * kept no record of it, so the second run made a second identical request and threw the first
 * reply away. On the home page that was `/api/records?shape=light` and `/api/attention` fetched
 * twice, which is 2.3 MB and 3.7 MB paid for and discarded on every visit (problem dfi72F0VtyK5).
 *
 * The ref is reused across StrictMode's mount, unmount and remount — a ref is not state, so the
 * second run sees the first run's promise — and the effect's dependencies decide whether that
 * promise is still the read this run wants. A changed dependency (a reload press, another project)
 * is a different read and starts one.
 *
 * IT IS NOT AN UNMOUNT GUARD. The `live` flag in the effect still decides who may write to the
 * screen; this only decides who may ask the server.
 */
export function readOnce<T>(
  held: { current: ReadInFlight<T> | null },
  deps: React.DependencyList,
  load: () => Promise<T>,
): Promise<T> {
  const already = held.current
  if (already !== null && sameReadDeps(already.deps, deps)) return already.promise
  const promise = load()
  held.current = { deps, promise }
  return promise
}

/** What `useAsync` and `useProjectAsync` take besides the load and its dependencies; each is described in `useAsync`. */
export interface UseAsyncOptions<T> {
  keep?: string
  saysRefreshing?: boolean
  startFrom?: { value: T }
  follows?: Follows
  /** The project the answer is read for. Only `useProjectAsync` and `useSharedRead` set it. */
  project?: string
}

/**
 * Run an async load and expose its three states, plus a `reload` to run it again after a write.
 *
 * `load` is intentionally NOT part of the dependency list: it is a new closure on every render,
 * so including it would re-fetch forever. The caller states its real dependencies in `deps`.
 *
 * ---------------------------------------------------------------------------------------
 * A CHANGE OF PROJECT IS NOT ONE OF ITS DEPENDENCIES
 * ---------------------------------------------------------------------------------------
 *
 * This hook reads again only when `deps` change, when `reload` is called, or when what `follows`
 * names changes. A reading the server answers about one project goes through `useProjectAsync`
 * (src/web/lib/project-async.ts), which adds the chosen project to `deps` and names it in
 * `project`. A reading the server answers the same in every project stays here, and a switch of
 * project leaves it alone: it does not draw loading, it does not ask again, and the page around it
 * keeps its open sections and its place. Until round 170 of wave 13y this hook put every reading
 * back to `loading` in the render that first saw the new project, office readings too, so Settings
 * emptied at every switch.
 *
 * WHAT A SWITCH SHOWS ON A PROJECT READING, until the new project's answer replaces it, is the new
 * project's own answer from the page cache when `keep` names one there, and otherwise the previous
 * project's answer. Either is marked as being read again. That is the keep every re-read already
 * has (criterion E5). If the new read fails, the previous project's answer goes, and the page says
 * the failure as a failed first read does: those rows are not about the project now chosen, and no
 * answer is coming to replace them. The rule that still holds: no row read for the previous project
 * is on screen under the new project's name without the re-read mark, not even for one frame. The
 * layout effect below says how. Because that mark is a status only a screen reader hears, a reading
 * in the page column also raises a sign a person sees for as long as it draws the previous project's
 * answer: the page column is dimmed and the strip at its foot names the project being read
 * (ReReadStrip.tsx), from the frame the new name comes to the frame the new rows come.
 * `tests/a-switch-of-project-reads-again-only-what-belongs-to-a-project.test.ts` samples every
 * frame of a real switch and is what holds the rule, and
 * `tests/the-old-projects-rows-say-the-new-project-is-being-read.test.ts` measures in every frame
 * that the sign is seen at four widths in both looks; criterion M61, that a switch does not rebuild
 * the app or the chat, is held by `tests/workspace-switch.test.ts`.
 */
export function useAsync<T>(load: () => Promise<T>, deps: React.DependencyList, options: UseAsyncOptions<T> = {}): [AsyncState<T>, () => void] {
  const [tick, setTick] = useState(0)
  /**
   * `keep` NAMES THE ANSWER IN THE PAGE CACHE (src/web/lib/pagecache.ts). Round 17 of wave 13w, a
   * decision: with a name, a page opened again draws what it showed last time at once, as a
   * previous answer being read again ("Refreshing…" on the re-read strip below), and the read replaces
   * it. Nothing is drawn from it as if it had just been read, and it is always
   * read again: these doors announce no event that could say the kept answer is still current.
   *
   * `startFrom` IS AN ANSWER THIS PAGE LOAD ALREADY HOLDS, such as a OneRead slot's (`useSharedRead`), and
   * it is drawn at once. It is not a previous answer: nothing in it comes from an earlier page load, and
   * the first run's `load` answers from the same place without asking the server. So that run is not
   * marked refreshing, and a failure of it is still said on the strip (round 55 of wave 13y).
   */
  const keep = options.keep
  const saysRefreshing = options.saysRefreshing === true
  const startFrom = options.startFrom
  const keptState = (): AsyncState<T> => {
    if (startFrom !== undefined) return { status: 'ready', value: startFrom.value }
    const held = keep === undefined ? undefined : keptAnswer<T>(keep)
    return held === undefined ? { status: 'loading' } : { status: 'ready', value: held.value }
  }
  const [state, setState] = useState<AsyncState<T>>(keptState)
  /** The name the state was last seeded for, so a page moved to another name starts from that one's. */
  const [keptFor, setKeptFor] = useState(keep)
  /**
   * THE PROJECT THE ANSWER ON SCREEN WAS READ FOR, and the project the state was last seeded for.
   * Only a reading about one project names one; for any other reading both stay undefined, and
   * nothing below acts on them.
   */
  const project = options.project
  const [readFor, setReadFor] = useState(project)
  const [seededFor, setSeededFor] = useState(project)
  /** This hook's own slot on the re-read marks the strip draws, made when it first has one to make. */
  const markRef = useRef<{ id: number; mark: OneReReadMark } | null>(null)
  /** The read already in flight for this run's dependencies, so StrictMode's second run reuses it. */
  const readInFlight = useRef<ReadInFlight<T> | null>(null)

  // A SWITCH OF PROJECT SEEDS FROM THE NEW PROJECT'S KEPT ANSWER, in the render that first sees the
  // new project, when the page cache holds one. That answer is about the project whose name is
  // drawn, and it is marked as being read again like any kept answer. With none kept, the previous
  // project's answer stays, marked, and `readFor` still names that project.
  if (keptFor !== keep || seededFor !== project) {
    setKeptFor(keep)
    setSeededFor(project)
    const seeded = keptState()
    if (seeded.status === 'ready') {
      setState(seeded)
      setReadFor(project)
    }
  }

  // WHAT IS ON SCREEN NOW, which is what the effects below decide from. Refs are how an effect
  // reads the state of the render that scheduled it without adding that state to the effect's
  // dependency list. It is assigned on every render, from the value this hook hands back.
  useNavigationRead(state.status)
  const onScreenRef = useRef(state)
  onScreenRef.current = state

  // THE DEPENDENCIES OF THIS RUN, worked out once and used for both effects and the in-flight
  // read, so the read that is reused and the run that reuses it cannot be about different things.
  const effectDeps = [...deps, tick]
  /** The dependencies of the run whose answer `startFrom` already is; null when the hook started loading. */
  const startedFor = useRef<React.DependencyList | null>(startFrom === undefined ? null : effectDeps)

  // E5, THE KEEP, AND ITS MARK. A read that starts while a previous answer is on screen leaves that
  // answer exactly where it is and marks it refreshing; only a read with nothing to show yet — the
  // first read, a read trying again after a first-read failure — draws loading. What the reader was
  // reading does not vanish under them.
  //
  // THE MARK IS SET IN A LAYOUT EFFECT, AND A SWITCH OF PROJECT IS WHY. When the project changes, a
  // reading of `useProjectAsync` goes on drawing an answer read earlier, the previous project's or
  // the new project's kept one, while the shell already draws the new project's name. Those rows
  // must carry the mark in the first frame drawn under that name. React runs a layout effect, and
  // draws again what it changes, before the browser paints. A passive effect runs after React has
  // committed, and React does not always run it before the paint: for a switch started inside an
  // effect, such as `Leading`'s follow path (criterion M60), it does not, and a mark set there would
  // leave one frame of the old rows unmarked under the new name. The read itself starts in the
  // passive effect below.
  //
  // THE MARK GOES IN THIS EFFECT'S CLEANUP TOO, and not in the passive one's. A passive cleanup of
  // the previous run runs after this run's layout effect, so it would take away the mark just set.
  useLayoutEffect(() => {
    const was = onScreenRef.current
    const fromStart = startedFor.current !== null && sameReadDeps(startedFor.current, effectDeps)
    if (was.status === 'ready' && !fromStart) {
      // THE PAGE IS NOT DRAWN AGAIN TO SAY IT IS REFRESHING. Round 18 of wave 13w:
      // a state set here drew the whole page holding the read, once as the read started and once as it
      // ended, for every read of Home's minute and every kept answer at a page's open. The strip says
      // refreshing from the mark below; a page that draws its own mark asks with `saysRefreshing`.
      if (saysRefreshing) setState({ status: 'ready', value: was.value, refreshing: true })
      const id = theNextReReadSlotId
      theNextReReadSlotId += 1
      markRef.current = { id, mark: { refreshing: true, error: null } }
      theReReadSlot.set(id, markRef.current.mark)
      theReReadsChanged()
    }
    return () => {
      // The reader left the page, or a newer read starts: this read's marks go with it, so the strip
      // never says a thing about a page nobody is looking at.
      if (markRef.current !== null) {
        theReReadSlot.delete(markRef.current.id)
        markRef.current = null
        theReReadsChanged()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, effectDeps)

  // THE PAGE SAYS SO, ON THE PAGE ITSELF, WHILE IT DRAWS ROWS OF THE PROJECT JUST LEFT. The mark above
  // is a status for screen readers, which nobody looking at the page sees, and the title already
  // names the new project. So while a reading in the page draws an answer read for another project,
  // the strip dims the page and names the project being read (ReReadStrip.tsx). It is worked out from
  // what this render draws, and the layout effect writes it before the paint, so the sign comes in the
  // frame the new name comes and goes in the frame the new rows come. A failed read under the new
  // project draws its error instead, and the sign goes in that frame too. Only a reading inside the
  // page column counts: the shell's own readings, such as the sidebar's counts, are not the page.
  const inThePage = usePageName() !== null
  const showsAnotherProject = inThePage && state.status === 'ready' && project !== undefined && readFor !== project
  const anotherProjectKey = useRef<object>({})
  useLayoutEffect(() => {
    if (!showsAnotherProject) return
    const key = anotherProjectKey.current
    theReadsShowingAnotherProject.add(key)
    theReReadsChanged()
    return () => {
      theReadsShowingAnotherProject.delete(key)
      theReReadsChanged()
    }
  }, [showsAnotherProject])

  useEffect(() => {
    // `live` guards against a slow reply from a page you have already navigated away from
    // overwriting the state of the page you are now looking at.
    let live = true
    const was = onScreenRef.current
    const keeping = was.status === 'ready'
    // WHETHER WHAT IS ON SCREEN WAS READ FOR THE PROJECT THIS RUN READS FOR. It is not after a switch
    // that found no kept answer of the new project.
    const runFor = project
    const ownProject = readFor === runFor
    if (!keeping) setState({ status: 'loading' })
    const settle = (error: { message: string; fault?: Fault | null } | null, ended: 'answered' | 'refused'): void => {
      // HOW A RE-READ ENDED is counted, and only for a mark that was refreshing: a first read kept nothing on screen.
      if (markRef.current?.mark.refreshing === true) {
        if (ended === 'answered') theReReadsAnswered += 1
        else theReReadsRefused += 1
      }
      if (markRef.current === null) {
        if (error === null) return
        // A FAILED RUN FROM `startFrom` has no mark yet, and its failure is said all the same.
        const id = theNextReReadSlotId
        theNextReReadSlotId += 1
        markRef.current = { id, mark: { refreshing: false, error: null } }
        theReReadSlot.set(id, markRef.current.mark)
      }
      markRef.current.mark.refreshing = false
      markRef.current.mark.error = error
      theReReadsChanged()
    }
    // WHERE THE ANSWER IS KEPT, worked out as the read starts: who asked and in which project.
    const place = keep === undefined ? null : placeOf(keep)
    readOnce(readInFlight, effectDeps, load).then(
      (value) => {
        if (place !== null && keep !== undefined) keepAnswerAt(place, keep, value)
        if (!live) return
        // AN ANSWER THE SAME AS THE ONE ON SCREEN LEAVES THE STATE AS IT IS, so nothing is drawn again.
        // The state handed back is the very object React holds, and React then renders nothing.
        setState((now) => now.status === 'ready' && now.refreshing !== true && now.reReadError === undefined && theSameAnswer(now.value, value) ? now : { status: 'ready', value })
        if (!ownProject) setReadFor(runFor)
        settle(null, 'answered')
      },
      (err: unknown) => {
        if (!live) return
        const message = errorMessage(err)
        const fault = faultOf(err)
        // E5, THE SECOND HALF. A failed re-read does not discard what is on screen: the previous
        // answer stays, and the failure is said beside it, here and on the strip. A failed FIRST
        // read has nothing to keep, so it says the error the way it always did. Nor has a read after
        // a switch that kept the previous project's answer: those rows are not about the project now
        // chosen, so they go, and the failure is said the same way. E4's rule holds either way: the
        // page fails loud, with words.
        if (keeping && ownProject) {
          setState({ status: 'ready', value: was.value, reReadError: { message, fault } })
          settle({ message, fault }, 'refused')
        } else {
          setState({ status: 'error', message, fault })
          settle(null, 'refused')
        }
      },
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, effectDeps)

  // `follows` NAMES WHAT THIS READ SHOWS, and a change to it reads it again, keeping the answer on screen as
  // every re-read does (src/web/lib/record-changes.ts, item 87 of wave 13y). It is followed by what it says,
  // so a page that writes a new object each render is not followed afresh each time.
  const follows = options.follows
  const followsRef = useRef(follows)
  followsRef.current = follows
  const followsKey = follows === undefined ? null : JSON.stringify(follows)
  useEffect(() => {
    const now = followsRef.current
    if (now === undefined) return
    return followChanges(now, () => setTick((t) => t + 1))
  }, [followsKey])

  return [state, () => setTick((t) => t + 1)]
}

/**
 * WHETHER TWO ANSWERS ARE THE SAME, field by field, for answers made of what JSON carries.
 *
 * Anything else — a Map, a Set, a Date, a function, an object made by a class — is never the same as
 * anything but itself, so an answer this cannot read is drawn again, as every answer was before.
 *
 * AND IT LOOKS AT NO MORE THAN `SAME_ANSWER_VALUES` VALUES. Past that it answers "not the same", and the
 * answer is drawn again, as every answer was before this existed. On 9 October 2026 Home in Developer mode
 * held an 11.7 MB attention answer, and comparing it with the one before walked all of it on the main
 * thread each minute (round 19 of wave 13w). "Not the same" is never wrong here: it costs a drawing.
 */
export function theSameAnswer(a: unknown, b: unknown): boolean {
  const budget = { left: SAME_ANSWER_VALUES }
  return sameWithin(a, b, budget)
}

/** How many values `theSameAnswer` looks at before it stops and answers "not the same". */
export const SAME_ANSWER_VALUES = 50_000

function sameWithin(a: unknown, b: unknown, budget: { left: number }): boolean {
  budget.left -= 1
  if (budget.left < 0) return false
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) if (!sameWithin(a[i], b[i], budget)) return false
    return true
  }
  if (Array.isArray(b)) return false
  const plain = (o: object): boolean => {
    const proto = Object.getPrototypeOf(o) as unknown
    return proto === Object.prototype || proto === null
  }
  if (!plain(a) || !plain(b)) return false
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!sameWithin((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], budget)) return false
  }
  return true
}

// ============================================================================ time

/*
 * `kindHue` AND `hueStyle` WERE DELETED HERE, AND WHAT THEY DID IS WORTH RECORDING.
 *
 * They gave every record kind a hue by dividing 360 degrees by the number of kinds, in JavaScript,
 * as an inline style. Their own note said they were "kept only because two pages still group
 * records by hue" — and on 14 August 2026 nothing in src/ or tests/ referenced either of them, or
 * the --hue custom property they wrote. So the note was false and the code was dead.
 *
 * They are gone rather than left alone because kind now HAS a colour: the six family rails at the
 * top of the stylesheet. A second, older mechanism for the same fact, computed a different way and
 * reachable by an import, is this repository's recurring defect waiting to be picked up by the next
 * person who wants a coloured kind. A hue computed in JavaScript also cannot follow a theme swap,
 * which is why it never worked.
 */

/**
 * The server writes timestamps as "YYYY-MM-DD HH:MM:SS" in UTC, with no timezone marker.
 * JavaScript reads that shape as LOCAL time, which would put every timestamp out by the
 * timezone offset, so the marker is added back before parsing.
 */
/**
 * Read a stored stamp. Delegates to `@shared/time.ts`, which is the only place that knows how.
 *
 * THIS USED TO BE WRONG, and it is worth keeping the record of how. It read:
 *
 *     const utc = PATTERN.test(stamp) ? `${stamp.replace(' ', 'T')}Z` : stamp
 *
 * The `Z` says "this string is UTC". Mole Office stamps are local — `localStamp` writes them with
 * `getHours()` on purpose, so that a day means the operator's day. So every stamp in the browser
 * was read as though the operator lived in Greenwich, and every age below was out by the machine's
 * offset. On a machine one hour ahead, anything less than an hour old came out as a NEGATIVE age
 * and fell through the `seconds < 45` branch as "just now" — including a session that had been
 * idle for fifty minutes waiting for an answer, which is precisely the thing this product exists
 * to stop looking like a session that is busy.
 *
 * Nothing failed. No test, no type error, and on a machine running in UTC no symptom at all.
 */
export function parseStamp(stamp: string): Date | null {
  return parseAnyStamp(stamp)
}

export function relativeTime(stamp: string): string {
  const date = parseStamp(stamp)
  if (!date) return stamp
  const seconds = (Date.now() - date.getTime()) / 1000
  if (seconds < 45) return t('sheet.stamp.now')
  if (seconds < 3600) return t('sheet.stamp.minutes', { n: Math.round(seconds / 60) })
  if (seconds < 86400) return t('sheet.stamp.hours', { n: Math.round(seconds / 3600) })
  if (seconds < 86400 * 7) return t('sheet.stamp.days', { n: Math.round(seconds / 86400) })
  // NOT the browser's toLocaleDateString with no options, which on this machine renders 1 August 2026 as "8/1/2026" -- a date
  // a European reader will read as 8 January and an American as 1 August, in a product whose whole
  // discipline about time is that nothing is ambiguous. The month as a word costs two characters
  // and can only be read one way, in any locale, beside a corpus that already mixes languages.
  return drawnDay(date)
}

/**
 * One day as a reader reads it, "25 Sept 2026" or "2026 年 9 月 25 日", with the month as a word for the
 * reason above. Written by the office's one day formatter, `dayInThePageLanguage` in src/shared/i18n.ts.
 */
export function drawnDay(date: Date): string {
  return dayInThePageLanguage(date, true)
}

/**
 * The mail tool's key line needs a day and a moment in the same day form. Keep the last use
 * to the minute, like drawnStamp, but draw its day with drawnDay so the two dates agree.
 */
export function drawnDayWithTime(stamp: string): string {
  const date = parseStamp(stamp)
  if (date === null) return stamp
  return t('sheet.stamp.full', {
    date: drawnDay(date),
    time: [date.getHours(), date.getMinutes()].map(n => String(n).padStart(2, '0')).join(':'),
  })
}


export function Stamp({ at }: { at: string }) {
  const date = parseStamp(at)
  return (
    <time className="px-stamp" dateTime={at} title={date ? t('sheet.stamp.full', {
      date: drawnDay(date),
      time: [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'),
    }) : at}>
      {relativeTime(at)}
    </time>
  )
}

/** Where the number goes in a part's word while it is read, so the number can be drawn on its own. A control character, which no word holds. */
const NUMBER_MARK = '\u0000'

/**
 * A WORD WITH ITS NUMBER DRAWN AS A NUMBER: "<b>1</b> 项待决定", "<b>4</b> 项紧急". The Decisions page's count line and the
 * top bar's count read it (wave 13q's rounds 31 and 32). The word is read once with a
 * mark where the number goes, so the measure word and the order are the word list's and the number keeps its own type.
 */
export function NumberInItsWord({ word, n }: { word: (n: number | string) => string; n: number }) {
  const said = word(NUMBER_MARK)
  const pieces = said.split(NUMBER_MARK)
  if (pieces.length !== 2) throw new Error(`The word "${said}" has ${String(pieces.length - 1)} {n} places, and needs exactly one.`)
  return <>{pieces[0]}<b className="num">{n}</b>{pieces[1]}</>
}

/**
 * A LABEL AND A DRAWN STAMP, joined by the office's one spacing rule: "created 1m ago", "创建于刚刚", "创建于 1 分钟前".
 * A typed space put one between two Chinese words, "创建于 刚刚" (wave 13q's round 32).
 */
export function StampAfter({ label, at }: { label: string; at: string }) {
  return (
    <>
      {label}
      {gapBetween(label, relativeTime(at))}
      <Stamp at={at} />
    </>
  )
}

/** The mark put in a word's {when} place, so the word can be split around a drawn stamp. */
const WHEN_MARK = '\u0000'

/**
 * A SENTENCE WITH A DRAWN STAMP WHERE ITS WORD PUTS {when}. English says "Closed by Quill just now";
 * Chinese says "刚刚由 Quill 关闭". The word list holds each order, so this never tests the language.
 * `words` is the caller's own `t(...)` call with `when` passed through. A word with no {when} place
 * is a broken word list, and this throws rather than guess where the time goes.
 */
export function WordsAroundAStamp({ words, at }: { words: (when: string) => string; at: string }) {
  const said = words(WHEN_MARK)
  const parts = said.split(WHEN_MARK)
  if (parts.length !== 2) throw new Error(`The word "${said}" has ${String(parts.length - 1)} {when} places, and needs exactly one.`)
  return (
    <>
      {parts[0]}
      <Stamp at={at} />
      {parts[1]}
    </>
  )
}

// ============================================================================ the stylesheet
/**
 * The component stylesheet lives here, next to the components it dresses, and is injected once
 * when this module is first imported.
 *
 * WHY NOT a .css file: this file is the only one this agent owns, and more usefully, a component
 * and its geometry going out of step is the classic way a library rots. Keeping them in one file
 * makes that impossible to do by accident.
 *
 * THE RULE, enforced by a test: every value below is either a token from tokens.css or a
 * component-local `--px-*` variable. There is not one hex colour and not one hard-coded type
 * size in here, so a preset swap on <html> re-skins all of it.
 */
export const UI_CSS = `
/* ---------------------------------------------------------------------- the six family rails

   WHAT THESE ARE. One colour per reading family, drawn as a 3px rail and a glyph on a kind tag and
   on a family heading. Sixteen kinds were one grey pill; six families is a number a person learns.
   Which kinds are in which family is KIND_FAMILIES in src/shared/work.ts and is not restated here.

   THEY BELONG IN src/web/tokens.css and should be moved there, beside every other palette value.
   They are in this file because the pass that added them owned this file and not that one. Nothing
   silently depends on that staying true: tests/ui.test.ts reads tokens.css for the list of
   palettes and fails when a palette declared there has no rails declared here.

   THE HUES CARRY NO URGENCY, AND EVERY WORD OF THAT IS MEASURED RATHER THAN ASSERTED. The accent
   means "act on this", --ask means "a person is waiting", red means "alarm". So each rail here is
   held to three numbers, in every palette, by the test named above: it is at least 3:1 against the
   surface it sits on, its colour spread is no wider than the accent's in the same palette, and it
   is a measured distance away from the accent, from --ask and from the alarm colour. A hue that
   looks fine and measures 2.4:1 is a defect, and so is a family rail somebody would read as red.

   NO COLOUR IS WRITTEN TWICE. The dark-surface values are declared once, on :root, and the dark
   palettes point at them. Two palettes select for a dark surface -- an explicit data-theme and the
   system preference with no data-theme at all -- and a hex repeated across that media boundary is
   this repository's recurring defect wearing a stylesheet. */
:root {
  /* the dark-surface set, declared here so the two dark selectors below can share it */
  --family-dark-work: #78ada8;
  --family-dark-structure: #93a6cc;
  --family-dark-decisions: #b79ac4;
  --family-dark-findings: #a8b884;
  --family-dark-ideas: #c5a87f;
  --family-dark-notes: #c4959e;

  /* the light-surface set, used by light */
  --family-work: #33605e;
  --family-structure: #3d5478;
  --family-decisions: #6a4278;
  --family-findings: #5a6b3c;
  --family-ideas: #6f5c3d;
  --family-notes: #75454f;
}
:root[data-theme='dark'] {
  --family-work: var(--family-dark-work);
  --family-structure: var(--family-dark-structure);
  --family-decisions: var(--family-dark-decisions);
  --family-findings: var(--family-dark-findings);
  --family-ideas: var(--family-dark-ideas);
  --family-notes: var(--family-dark-notes);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --family-work: var(--family-dark-work);
    --family-structure: var(--family-dark-structure);
    --family-decisions: var(--family-dark-decisions);
    --family-findings: var(--family-dark-findings);
    --family-ideas: var(--family-dark-ideas);
    --family-notes: var(--family-dark-notes);
  }
}

/* Component-local geometry. These are not theme tokens: they are this library's own constants,
   and a preset has no business changing them. The severity column is sized to the longest state
   word plus its glyph ("Inferred" with a caret), so a chip never overruns the title beside it. */
.px-panel, .px-row, .px-loading, .px-empty, .px-error, .px-field, .px-btn, .px-chip, .px-tag,
.px-menu, .px-inc, .px-inc-mark, .px-family, .px-reason, .px-hidden, .px-noteline,
.px-scan, .px-explain, .px-health {
  --px-col-sev: 112px;
  --px-glyph: 13px;
}

/* This library brings its own box model rather than assuming the page has a reset. Without it a
   full-width input is its container's width PLUS its padding and border, which pushes the whole
   page sideways by a few pixels on a phone -- the one width where that is least forgivable. */
.px-panel, .px-panel-head, .px-panel-body, .px-row, .px-row-sev, .px-row-main, .px-row-right,
.px-btn, .px-chip, .px-chip-wrap, .px-tag, .px-menu, .px-menu-item, .px-field, .px-input,
.px-select, .px-empty, .px-error, .px-loading, .px-skel-bar, .px-sheet, .px-inc, .px-inc-mark,
.px-family, .px-reason, .px-reason-sum, .px-hidden, .px-noteline, .px-factor, .px-factor-track,
.px-scan, .px-scan-sum, .px-scan-body, .px-explain, .px-explain-sum, .px-explain-body,
.px-health, .px-health-group, .px-health-sum, .px-health-body {
  box-sizing: border-box;
}

/* Focus is an accessibility guarantee, not a style. Its width and offset are tokens
   (--focus-w / --focus-offset) that no preset rewrites, so no component -- including this one --
   can quietly shrink the ring. It is never set to none anywhere in this file. */
.px-btn:focus-visible, .px-chip-btn:focus-visible, .px-menu-item:focus-visible,
.px-row:focus-visible, .px-row-title:focus-visible, .px-tag:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
  position: relative;
  z-index: 4;
}
.px-input:focus-visible, .px-select:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: 1px;
  border-color: var(--focus);
}
.px-row:focus-visible { outline-offset: -2px; }
.px-btn[data-force="focus"], .px-chip-btn[data-force="focus"], .px-input[data-force="focus"],
.px-select[data-force="focus"], .px-row[data-force="focus"] {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
}

.px-sr {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}

/* ---------------------------------------------------------------------- the product mark */
/* "Panel" is the structure and takes the theme's text colour at the interface's own semibold; "X"
   is the crossing point and takes the accent, a heavier weight and 12% more size on the same
   baseline. Three channels, because colour is the one that disappears: the mono theme sets
   --accent to the text colour on purpose, and greyscale takes it everywhere. No size is set here
   -- the mark is drawn at whatever size the thing holding it is set in. */
.px-wordmark {
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
/* The logo, set at the height of the word beside it. Sized in em rather than pixels so it follows
   whatever the thing holding the mark is set in -- the sidebar sets the mark at --fs-3 and the
   collapsed rail sets nothing, and neither has to know this rule exists. The width is the height
   times the shape of the owner's picture, 477 by 406. The nudge on the baseline is what puts the
   middle of the picture on the middle of the word rather than on its baseline. */
.px-wordmark-icon {
  width: 1.47em;
  height: 1.25em;
  vertical-align: -0.24em;
  margin-right: 0.34em;
  flex: none;
}
.px-wordmark-lead {
  font-weight: 800;
  font-size: 1.06em;
  color: var(--accent);
  /* The taller glyphs would otherwise open the line box around them and push whatever sits beside
     the mark off centre. It changes the box, not the baseline. */
  line-height: 1;
}

/* ---------------------------------------------------------------------- panel */
.px-panel {
  position: relative;
  min-width: 0;
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--elev-1);
  padding: var(--pad);
  font-family: var(--font-ui);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text);
  container-type: inline-size;
  /* THE NAME EVERY PANEL-WIDTH QUERY ASKS FOR. A query with no name in it asks whichever container
     happens to be nearest, so one container added above the app would hand it a different box and
     nothing would fail: no type error, no failing test, and a layout somebody has to notice. */
  container-name: panel;
}
/* rank 0 -- alarm. Tinted AND spined AND heavier: three channels, so the alarm survives
   greyscale printing and a colour-blind reader. The weak -row tint, not the chip -bg:
   a chip tint painted across a whole panel is a shout that stops meaning anything. */
/* AND ITS TEXT STARTS WHERE EVERY OTHER PANEL'S TEXT STARTS. It used to add the rail's width to
   the left padding, which put an alarm panel's contents 3px right of an ordinary panel's -- the
   whole of the 441-against-444 split measured down the Reports and notes column and down Work to
   do. The step was removed rather than kept, and here is the reasoning, because a step that is
   deleted for no stated reason comes back.

   3px is too small to read as an indent and big enough to break the left edge of a column of
   panels. It also carries nothing new: the alarm is already said four other ways -- the tint, the
   border colour, the raised shadow and the heavier title -- on top of the rail itself. And the
   rail does not need the room. It is drawn inside the panel's own padding, 3px wide against 8px of
   padding, so there is clear ground between the spine and the first letter without paying for it.

   A ROW IS A DIFFERENT DECISION AND KEEPS ITS STEP. See "the alarm ladder" further down: rows sit
   in a list, all the loud ones step together, and the step there is a ladder a reader scans. */
.px-panel[data-rank="0"] {
  background: var(--px-tone-row);
  border-color: var(--px-tone-line);
  box-shadow: var(--elev-2);
}
.px-panel[data-rank="0"]::before {
  content: "";
  position: absolute; left: 0; top: 0; bottom: 0;
  width: var(--rail);
  background: var(--px-tone);
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
}
.px-panel[data-rank="0"] .px-panel-title { font-weight: var(--heading-weight); }
.px-panel[data-rank="0"] .px-panel-kind { color: var(--px-tone); }
/* rank 2 -- quiet. No fill and no elevation, so it recedes behind the panels that matter. */
.px-panel[data-rank="2"] {
  background: transparent;
  box-shadow: none;
}
.px-panel[data-rank="2"] .px-panel-title { font-size: min(var(--fs-3), var(--panel-title-size)); color: var(--text-2); }

.px-panel-head {
  display: flex; align-items: center; gap: var(--gut);
  min-height: var(--row-h);
  flex-wrap: wrap; row-gap: 4px;
  border-bottom: var(--section-rule);
  padding-bottom: var(--section-pad);
}
.px-panel-ident { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
/* THE EYEBROW ABOVE A PANEL TITLE. Also no longer capitals: 28 of them, and several were the
   internal ontology said out loud — TIME AGAINST WORK, SCHEDULED AGAINST UNSCHEDULED, OFFERED NOT
   WRITTEN, THINKING NOT PROJECT TRUTH. Whether a given eyebrow earns its place at all is the
   surface owner's judgement; whether it shouts is not, and this is where that was decided. */
.px-panel-kind {
  font-size: var(--fs-1); font-weight: 600;
  color: var(--text-3); line-height: var(--lh-tight);
}
.px-panel-title {
  margin: 0;
  font-size: var(--panel-title-size); font-weight: var(--section-weight); line-height: var(--lh-tight);
  font-family: var(--section-font);
  border: 0; padding: 0;
  color: var(--panel-head-ink, var(--text));
  overflow-wrap: break-word;
}
.px-panel-title[data-title-is='its-label'] { text-transform: var(--section-case); letter-spacing: var(--section-space); }
.px-panel-actions {
  margin-left: auto;
  display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap;
}
.px-panel-body { padding-top: var(--gut); min-width: 0; }

/* ---------------------------------------------------------------------- row */
.px-row {
  position: relative;
  display: grid;
  grid-template-columns: var(--cols, var(--px-col-sev) minmax(0, 1fr) fit-content(40%));
  align-items: center;
  column-gap: var(--gut);
  row-gap: 2px;
  min-height: var(--row-h);
  padding: 4px var(--pad);
  border-radius: var(--radius);
  font-family: var(--font-ui);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text);
}
.px-row > * { min-width: 0; }
/* A ROW WITH A COMMENT WAITING ON IT IS THE SAME SHAPE AS THE ROWS AROUND IT, AND NOTHING HERE
   MAKES THAT TRUE ANY MORE.

   Two rules used to live here, pulling the mark layer's ::before out of the flow on .px-row and
   .px-scan. The mark was generated content on the element carrying the target, and on a row that
   element is a GRID, so the pseudo became a fourth grid item: it took the first cell, pushed the
   right-hand cell onto a second grid line, and made the row taller. Measured on Reports and notes
   at 1440 on 18 August 2026 -- one marked row 90.9px against 70.0px for its unmarked neighbours.

   The mark layer draws no generated content at all now: a comment is a circle beside the block, in
   components/agent/CommentCircle.tsx, positioned in the document rather than laid out by the row.
   So there is no pseudo-element on a row to pull out of anything, and rules kept for a shape
   nothing draws are rules a reader has to work out are dead. Interaction contract 8.3 says
   so. */
/* One hairline between rows, drawn inside the box so a tinted row keeps its full colour. The one
   exception is a row that IS tinted, and the tint now means safety and only safety -- see the
   alarm ladder near the foot of this stylesheet, which is where every rule about a severe or
   alarmed row lives. data-severe="1" is drawn there too, as the same picture as the raised step. */
.px-row + .px-row { box-shadow: inset 0 1px 0 var(--border); }
/* The row you are looking at: a spine in the accent, plus a selected surface and more weight.
   Three channels again, because "which row am I on" must survive a mono theme. */
.px-row[data-current="1"] { background: var(--sel); font-weight: 600; }
.px-row[data-current="1"]::after {
  content: "";
  position: absolute; left: 0; top: 1px; bottom: 1px;
  width: var(--rail);
  background: var(--accent);
  border-radius: var(--radius-sm);
}
.px-row[data-act="1"] { cursor: pointer; }
.px-row[data-act="1"]:hover, .px-row[data-force="hover"] { background: var(--hover); }

/* A ZERO MINIMUM WIDTH, SO A LONG WORD CANNOT DRAW ACROSS THE ROW'S OWN TITLE.
   This cell sits in the row's first grid column, which is a fixed width, and it is painted above
   its neighbour.
   Without this a tag wider than the column overflowed it and was painted ON TOP of the title beside
   it — measured at 1440, a 175px tag crossing the title's start by 13px on every comment row.
   Shortening the word fixed that instance; this makes the next long word a wrap rather than a
   collision, because the word is data and the layout should not depend on how long it happens to be. */
.px-row-sev { position: relative; z-index: 2; display: flex; min-width: 0; }
.px-row-main { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.px-row-line { display: flex; align-items: baseline; gap: var(--gut); min-width: 0; flex-wrap: wrap; }
.px-row-lead { flex: none; }
/* THE RIGHT-HAND CELL, WHICH NOW ALSO HOLDS THE ROW'S RECORD ID.

   IT WRAPS. The cell used to hold one small thing — a timestamp, a count, a button — and never
   needed to. It holds two now, and at 390 a stamp and a twelve-character id side by side took the
   title's column away from it. Wrapping puts the id on its own line under the stamp, still at the
   right, which is the corner section 9 of the round eleven brief asks for.

   AND IT STAYS ABOVE THE ROW'S OWN LINK. z-index 2 is what puts this cell over the anchor that
   covers the whole row, so the id is text a person can select and the browser can find rather than
   twelve characters under a click target. */
.px-row-right {
  position: relative; z-index: 2;
  display: flex; align-items: center; gap: var(--gut); justify-content: flex-end;
  flex-wrap: wrap; row-gap: 2px;
  font-size: var(--fs-1); color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.px-row-title {
  min-width: 0;
  font-size: var(--fs-3);
  color: var(--text);
  overflow-wrap: break-word;
}
.px-row-meta {
  font-size: var(--fs-1);
  color: var(--text-3);
  line-height: var(--lh-tight);
  overflow-wrap: break-word;
}
/* Underlined AT REST, not on hover. A theme swap or a phone must never be able to hide the
   fact that a title goes somewhere. Hover only thickens what is already there. */
.px-nav {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: .16em;
  text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);
  color: inherit;
}
.px-row:hover .px-nav, .px-nav:hover, .px-row[data-force="hover"] .px-nav {
  text-decoration-thickness: 2px;
  text-decoration-color: currentColor;
}
/* The anchor covers the whole row so the row is one big target, while staying a real link that
   middle-click and "copy link address" still understand. */
a.px-row-title::after { content: ""; position: absolute; inset: 0; z-index: 1; }

/* ---------------------------------------------------------------------- state chip */
.px-glyph { width: var(--px-glyph); height: var(--px-glyph); flex: none; fill: none; }
.px-chip-wrap { position: relative; min-width: 0; display: flex; }
.px-chip {
  display: inline-flex; align-items: center; gap: 5px;
  min-height: 22px; padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--px-tone-bg);
  color: var(--px-tone);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  /* Weight and border style are the non-colour channels, and both are theme tokens: a state
     that demands action is heavier in every theme, and DASHED MEANS INFERRED everywhere and
     means nothing else. Neither is decided here, so no theme can drop a channel. */
  font-weight: var(--px-tone-weight);
  border-style: var(--px-tone-border-style);
  letter-spacing: .05em;
  line-height: var(--lh-tight);
  white-space: nowrap;
  max-width: 100%;
}
.px-chip-word { overflow: hidden; text-overflow: ellipsis; }
/* The edge has to be visible for the dashed style to say anything, so every chip carries one.
   Quiet states get the state's line pulled back towards the neutral edge colour; a severe state
   gets the full-strength neutral edge so it holds its own against the row it sits on -- in the
   NEUTRAL border tone, not in the state's, because an edge is not one of the things strong red is
   spent on.

   IT IS PULLED TOWARDS --border-strong, NOT TOWARDS TRANSPARENT, AND THAT IS A CONTRAST FIX RATHER
   THAN A PREFERENCE. Mixed with transparent, the edge composited over the chip's own tint and came
   out fainter than an ordinary border: measured by tools/legibility.mjs on 14 August 2026, the
   chips for "doing" and "running" drew a boundary of 2.89:1 on white against a fill of 1.18:1 --
   both under the 3:1 floor, on Home, on the work page and on the records page at once. "todo"
   measured 2.59:1 and "inferred" 2.60:1 the same way. Mixed with --border-strong the
   edge can never be fainter than the plain border the theme already draws everywhere, because that
   colour is one end of the mix, and the state's own hue still reads at the other end.

   IT IS A VARIABLE AND border-color IS WRITTEN ONCE. Four rules have an opinion about this edge --
   the default, severe, the button and its hover -- and the surface-emphasis block further down
   needs to restore it after an alarm level has painted over it. Written as four border-colors,
   restoring it would have meant a fifth copy of the same color-mix(), and a fifth copy is this
   repository's recurring defect: change one and the other four go on drawing the old edge with
   no type error and no failing test. So each rule re-points --px-edge and nothing else. */
.px-chip {
  --px-edge: color-mix(in srgb, var(--px-tone-line) 55%, var(--border-strong));
  border-color: var(--px-edge);
}
.px-chip[data-severe="1"] { --px-edge: var(--border-strong); }
.px-chip-btn {
  cursor: pointer;
  width: 100%;
  justify-content: flex-start;
  --px-edge: var(--px-tone-line);
}
.px-chip-btn:hover, .px-chip-btn[data-force="hover"] { --px-edge: currentColor; }
.px-caret { width: 8px; height: 8px; flex: none; margin-left: auto; opacity: .7; }

/* THE OVERLAY HOST, and everything drawn in it.
   It takes no space and has no ground of its own: it is a layer, and the popups inside it are each
   placed against the window. It sits above the page, above the phone's bar and above the drawer, so
   nothing a page draws can be on top of a menu. See the OverlayHost component. */
.px-overlay-root { display: contents; }
.px-overlays {
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  z-index: var(--z-overlay);
}

/* FIXED TO THE WINDOW, NOT TO THE CONTROL. The menu is drawn in the host above, so it has no
   useful parent to hang off; the component measures the control and places it. It carries no
   z-index of its own — the host is the layer, and a number here would be a second opinion about
   how high a menu sits. */
.px-menu {
  position: fixed; top: 0; left: 0;
  min-width: 168px;
  max-width: min(22rem, calc(100vw - 2rem));
  display: flex; flex-direction: column; gap: 2px;
  padding: 4px;
  background: var(--panel-3);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--elev-2);
}
.px-menu-item {
  display: flex; align-items: center; gap: var(--gut);
  width: 100%; min-height: var(--row-h);
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  text-align: left;
  cursor: pointer;
}
/* A SECOND RULE FOR A MENU OPENED AT THE POINTER USED TO SIT HERE, saying fixed and top left. Both
   openings are the same arithmetic now and the rule above says it once, so the menu no longer marks
   which of the two it is and nothing needs to know. */
.px-menu-item:hover { background: var(--hover); }
.px-menu-item[aria-checked="true"] { background: var(--sel); font-weight: 700; }
.px-menu-mark { display: flex; color: var(--px-tone); }
.px-menu-key {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  color: var(--text-3);
}

/* ---------------------------------------------------------------------- tag
   NO LONGER UPPERCASE, and it is the single largest piece of shouting this redesign removed: 990
   tags across the product, every one of them SET IN CAPITALS AT 13px. Capitals cost about 15% of
   reading speed at that size and they were spent on the least decisive thing on a row — the record
   kind, which the reader mostly already knows from the page they are on. A tag's job is to be
   available when looked for, not to be the loudest object in the row.

   Uppercase now survives on CHROME only -- field labels, the appearance controls, the sidebar's
   family headings -- where it separates the furniture from the content. Never on content. That is
   the rule in docs/UX-CONTRACT.md.
   NO BACKTICKS: this string is a template literal and one would close it. */
.px-tag {
  display: inline-flex; align-items: center; gap: 4px;
  min-height: 20px; padding: 1px 8px;
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text-3);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  font-weight: 600;
  line-height: var(--lh-tight);
  white-space: nowrap;
  cursor: default;
}
.px-tag[data-tone="accent"] { background: var(--accent); color: var(--accent-text); }
.px-tag[data-tone="quiet"] { background: transparent; color: var(--text-3); padding-left: 0; padding-right: 0; }
.px-tag[data-tone="warn"] {
  background: var(--st-broken-bg);
  color: var(--st-broken);
  border: 1px dashed var(--st-broken-line);
}
/* THE TWO TONES THAT FOLDED THREE DRAWINGS INTO ONE. A short word on a graph card was drawn by
   hand, in the alarm colour when it was urgent; a short word on a decision tile was drawn by hand
   again, in --ask when somebody had already suggested an answer. Same object, three drawings, two
   stylesheets. Both are tones here now.

   THEY ARE THE TWO THAT CARRY AN ENCLOSURE, and the rest of the tags do not. A tag is normally the
   quietest thing on a row and needs no box; these two are the ones that have to hold their own
   against a card or a tile, and the box is what the two hand-drawn versions were both reaching for.
   Neither states anything by colour alone -- the word inside says it, in both cases. */
.px-tag[data-tone="alarm"] {
  background: transparent;
  color: var(--st-failed);
  border: var(--border-w) solid var(--st-failed-line);
  font-weight: 700;
}
.px-tag[data-tone="ask"] {
  background: var(--ask-bg);
  color: var(--ask);
  border: var(--border-w) solid var(--ask-line);
}

/* ---- the identity rail and the family glyph.
   docs/UX-CONTRACT.md gives identity its own channel: a 3px left rail plus a sentence-case word,
   never a fill and never an ink, so it can never be mistaken for the urgency channel beside it. The
   rail was written into that contract and never built; this is it. Its width is --rail, so the
   high-contrast theme's doubled rail reaches it like every other rail in the product.

   THE GLYPH TAKES THE HUE AND THE WORD DOES NOT. A family word inked in a family colour would be
   six text colours on a page and every one of them would owe 4.5:1. The rail and the glyph are
   graphics, they owe 3:1, and the word stays in the quiet text colour it already had. */
.px-tag[data-family] {
  border-left: var(--rail) solid var(--px-family);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  padding-left: 6px;
}
.px-tag[data-family] .px-glyph { color: var(--px-family); }
.px-tag[data-tone="quiet"][data-family] { padding-left: 6px; }
.px-tag[data-family="work"], .px-family[data-family="work"] { --px-family: var(--family-work); }
.px-tag[data-family="structure"], .px-family[data-family="structure"] { --px-family: var(--family-structure); }
.px-tag[data-family="decisions"], .px-family[data-family="decisions"] { --px-family: var(--family-decisions); }
.px-tag[data-family="findings"], .px-family[data-family="findings"] { --px-family: var(--family-findings); }
.px-tag[data-family="ideas"], .px-family[data-family="ideas"] { --px-family: var(--family-ideas); }
.px-tag[data-family="notes"], .px-family[data-family="notes"] { --px-family: var(--family-notes); }

/* ---------------------------------------------------------------------- how much is done
   THE STRIP AND ITS COUNT SIT TOGETHER AND NEITHER REPLACES THE OTHER. The strip says what shape
   the run is in and the number says exactly how much of it is finished. See the note on the
   Completion component for why a bar without its numbers is a feeling rather than a fact.

   FIXED WIDTH, whatever the part count, so two runs of different lengths can be compared straight
   down a column. The segments share the width between them. */
.px-done { display: inline-flex; align-items: center; gap: var(--pad); min-width: 0; }
.px-done-bar { display: flex; align-items: flex-end; gap: 2px; width: 84px; height: 12px; flex: none; }
.px-done-seg { flex: 1 1 0; min-width: 2px; border-radius: 1px; }
/* HEIGHT AND PATTERN CARRY THE STATE AS WELL AS COLOUR. Print this in greyscale and the five part
   states are still four silhouettes and two hatch angles. */
.px-done-seg[data-state="todo"] { height: 3px; background: var(--st-todo-line); }
.px-done-seg[data-state="doing"] { height: 7px; background: var(--st-doing); }
.px-done-seg[data-state="done"] { height: 12px; background: var(--st-done); }
.px-done-seg[data-state="failed"] {
  height: 12px;
  background: repeating-linear-gradient(135deg, var(--text-2) 0 2px, var(--panel-3) 2px 4px);
}
.px-done-seg[data-state="blocked"] {
  height: 12px;
  background: repeating-linear-gradient(0deg, var(--text-2) 0 2px, var(--panel-3) 2px 4px);
}
.px-done-count {
  color: var(--text-2);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* The strip is the half a narrow column gives back first. The exact count stays, because it is the
   fact; what is lost is the shape of the run, and the whole sentence is still on the element. */
@media (max-width: 480px) {
  .px-done-bar { display: none; }
}

/* ---------------------------------------------------------------------- button */
.px-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  position: relative;
  min-height: var(--row-h);
  padding: 0 14px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  font-weight: var(--button-weight);
  line-height: var(--lh-tight);
  white-space: nowrap;
  cursor: pointer;
  box-shadow: var(--button-shadow);
  /* ONLY THE LIFT MOVES. A colour is never animated: when the look changes, or the browser's scheme
     does, a button whose ink had already turned while its fill was still on its way was drawn for a
     moment at 1 to 1 (tests/a-drawing-control-is-read-not-guessed.test.ts measured it). */
  transition: transform .08s, box-shadow .08s;
}
.px-btn:hover, .px-btn[data-force="hover"] {
  background: var(--hover); border-color: var(--control-hover-border);
  transform: var(--button-lift); box-shadow: var(--button-hover-shadow);
}
.px-btn:active {
  background: var(--press); transform: var(--button-press); box-shadow: var(--button-press-shadow);
}
.px-btn[data-size="sm"] { min-height: 26px; padding: 0 10px; font-size: var(--fs-1); }
.px-btn[data-variant="primary"] {
  background: var(--button-primary-bg); border-color: var(--button-primary-border); color: var(--button-primary-ink);
}
.px-btn[data-variant="primary"]:hover, .px-btn[data-variant="primary"][data-force="hover"] {
  background: var(--button-primary-hover);
}
.px-btn[data-variant="danger"] {
  background: var(--st-failed-bg); border-color: var(--st-failed); color: var(--st-failed);
}
.px-btn[data-variant="danger"]:hover, .px-btn[data-variant="danger"][data-force="hover"] {
  background: var(--st-failed-bg); border-color: var(--st-failed); filter: brightness(.94);
}
/* THE ONE ACT NO AGENT MAY TAKE. It takes the same relationship to its own tokens that the danger
   variant takes to the failed ones, so it is a variant rather than a special case: settling a fork
   is neither an alarm nor an ordinary primary, and before this it was the palest control on the
   page while Delete sat beside it in red. The ask tokens are measured in all eight palettes; see
   docs/UX-CONTRACT.md for the short list of places they may be spent.
   NO BACKTICKS: this string is a template literal and one would close it. */
.px-btn[data-variant="ask"] {
  background: var(--ask); border-color: var(--ask); color: var(--accent-text);
}
.px-btn[data-variant="ask"]:hover, .px-btn[data-variant="ask"][data-force="hover"] {
  background: var(--ask); border-color: var(--ask); filter: brightness(1.08);
}
/* Ghost still carries a 1px enclosure at rest. A button that only becomes a button on hover is
   invisible on a phone. */
/* --border-strong, NOT --border. A ghost button has a transparent fill, so its edge is the only
   thing that says where it is — and the decorative hairline measured 1.26:1 light and 1.33:1 dark
   against the panel, where the floor for a control's boundary is 3:1. Measured across all seven
   themes by an independent review; tests/legibility.test.ts now recomputes the ratio from the
   tokens rather than pinning a hex, and asserts this rule takes the strong one. */
.px-btn[data-variant="ghost"] { background: transparent; border-color: var(--border-strong); color: var(--text-2); }
.px-btn[data-variant="ghost"]:hover, .px-btn[data-variant="ghost"][data-force="hover"] {
  background: var(--hover); color: var(--text);
}
/* NOT --text-dis, even though that is the token for an unavailable control. A disabled button
   here stays in the tab order and answers back when you press it, so its label is something a
   reader still has to be able to read: measured on --panel-2 it is 3.3:1 at --text-dis and 5.2:1
   at --text-3, and the floor for this project is 4.5:1. Unavailability is carried by the flat
   surface, the cursor and aria-disabled instead. */
.px-btn[aria-disabled="true"] {
  /* Same reason as the ghost above, and the same measurement: 1.16-1.45:1 before. The comment
     under this rule already argues that a disabled button here is a real control — it stays in the
     tab order and answers back when pressed — so its boundary is held to a control's floor. */
  background: var(--panel-2); border-color: var(--border-strong); color: var(--text-3);
  cursor: not-allowed; filter: none; transform: none; box-shadow: none;
}
/* THE SURFACE AND THE TEXT ARE ONE PAIR, AND THIS RULE HOLDS THEM TOGETHER.
   Measured on 6 September 2026 on the pipeline drawing at 390, in both themes: the Graph control,
   which is primary and aria-disabled at the same time because you are already looking at the
   drawing, drew --text-3 on --accent. 1.11 to 1 in light — a control a reader cannot see at all.
   The two rules above each did half of it: the primary rule set the accent surface and the
   disabled rule set the disabled text, and which of them won which property came out of the order
   the stylesheets happened to be hoisted in. That is the defect this repository keeps finding, one
   fact worked out in two places, wearing a cascade. One rule for both halves, at a specificity
   neither of the two can beat. A reviewer's note in a report is where it was first seen. */
.px-btn[data-variant="primary"][aria-disabled="true"],
.px-btn[data-variant="danger"][aria-disabled="true"] {
  background: var(--panel-2); border-color: var(--border-strong); color: var(--text-3); filter: none;
}
/* THE KEY'S MARK, after the words. Its spoken text is empty: aria-keyshortcuts already names the keys. */
.px-btn[data-key-mark]::before {
  content: attr(data-key-mark) / "";
  order: 1;
  font-size: var(--fs-1); font-weight: 400;
}
.px-why {
  font-size: var(--fs-1); color: var(--st-blocked); font-weight: 600;
  font-family: var(--font-ui);
}

/* ---------------------------------------------------------------------- field, inputs */
.px-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-family: var(--font-ui); }
/* NOT CAPITALS. The rule this pass settled is that uppercase marks the FRAME — the rail's family
   headings and the appearance controls — and never anything inside the page. A field label looked
   like chrome until a record page grew state choosers, and "WHERE IT STANDS" over a control that
   writes to the record is content shouting. The label keeps its size, weight and colour, which is
   what made it findable; only the shouting goes. */
.px-label {
  font-size: var(--fs-1); font-weight: 600;
  color: var(--text-3); line-height: var(--lh-tight);
}
/* THE LABEL ROW: the name of the field, whether it may be left out, and the mark that opens what
   the field means. The mark is pushed to the right end because its panel is anchored to its own
   right edge; at the left end the same panel would open off the left of the screen. */
.px-field-label { display: flex; align-items: center; gap: var(--gut); min-width: 0; }
.px-field-label > .px-label { min-width: 0; overflow-wrap: break-word; }
.px-field-label > .px-hint-mark { margin-left: auto; flex: none; }
/* MAY BE LEFT OUT. Quiet, because a reader who is filling the field in does not need it and a
   reader who is skipping it only needs the word. Never a sentence saying the box is optional. */
.px-field-optional {
  font-size: var(--fs-1); font-weight: 400; color: var(--text-3); line-height: var(--lh-tight);
  flex: none;
}
/* A HINT DRAWN AS A PERMANENT SENTENCE. Field no longer does this -- its hint folds behind the
   mark above -- and the rule stays because src/web/components/LinkPanel.tsx still draws one. */
.px-hint { font-size: var(--fs-1); color: var(--text-3); line-height: var(--lh-body); }

/* The mark itself: a 16px circle that reads as punctuation rather than as a control competing with
   the real ones beside it. It is inline, so it sits at the end of the thing it is about. */
.px-hint-mark { display: inline-block; vertical-align: baseline; position: relative; }
.px-hint-mark > summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 18px and 13px, not 16 and 11. The mark was the only node under 13px on two pages. It is a
     glyph rather than a sentence, so it broke no measured claim, but the rule in the contract says
     no text below 13px and a mark that has to argue for an exception is not worth the exception. */
  width: 18px;
  height: 18px;
  margin-left: 5px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-pill);
  color: var(--text-3);
  font-size: var(--fs-1);
  font-weight: 700;
  line-height: 1;
  cursor: help;
  list-style: none;
}
.px-hint-mark > summary::-webkit-details-marker { display: none; }
.px-hint-mark > summary:hover { background: var(--hover); color: var(--text); }
.px-hint-mark[open] > summary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
/* IT OPENS LEFTWARD, AND THAT IS A BUG FIX RATHER THAN A PREFERENCE. Opening rightward from a mark
   near the right edge of a panel took the document from 1440px wide to 1780px, and from 390px to
   728px — measured in Chromium. A page that scrolls sideways is a thing this product checks for on
   every screen, and the component added to remove prose was breaking it. Anchored to its right edge
   it can only grow into the page, and the width is capped against the viewport as well as in rems,
   so the narrow case cannot overflow either. */
.px-hint-body {
  position: absolute;
  z-index: var(--z-popover);
  top: calc(100% + 6px);
  left: auto;
  right: 0;
  width: max-content;
  max-width: min(24rem, calc(100vw - 4rem));
  padding: var(--pad);
  background: var(--panel);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--elev-2);
  font-size: var(--fs-1);
  font-weight: 400;
  line-height: var(--lh-body);
  color: var(--text-2);
  white-space: normal;
}
/* A HINT THAT OPENS UNDER ITS LINE. The mark stays inline; its words become a block in the page's
   flow, which a browser lays out under the line the mark ends and as wide as the box the line sits
   in. So the words can neither leave the page nor lie over a press below: what follows moves down. */
.px-hint-mark[data-opens="under"] { display: inline; position: static; }
.px-hint-mark[data-opens="under"] > .px-hint-body {
  position: static;
  display: block;
  width: auto;
  max-width: none;
  margin-top: 6px;
  box-shadow: none;
}
.px-fielderr {
  display: flex; align-items: center; gap: 5px;
  font-size: var(--fs-1); font-weight: 600; color: var(--st-failed); line-height: var(--lh-body);
}
.px-input, .px-select {
  width: 100%;
  min-height: var(--row-h);
  padding: 4px 12px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
}
/* A paragraph box. It inherits everything from .px-input above, so there is one border, one focus
   ring and one invalid state in the app rather than a second one that looks nearly the same. */
.px-textarea {
  min-height: calc(var(--row-h) * 2.5);
  padding: var(--pad) 12px;
  resize: vertical;
}
.px-input[data-mono="1"] { font-family: var(--font-mono); }
.px-input::placeholder { color: var(--text-3); }
.px-input:disabled { color: var(--text-2); background: var(--panel-2); cursor: not-allowed; }
.px-input:hover, .px-select:hover, .px-input[data-force="hover"] { border-color: var(--control-hover-border); }
.px-input::selection { background: var(--sel); }
.px-input[aria-invalid="true"] { border-color: var(--st-failed); background: var(--st-failed-bg); }

/* ---------------------------------------------------------------------- absence

   THE QUIET DRAWING. An absence nobody has to act on: a dimmed dash, or one short word, sitting on
   the panel's own ground with nothing around it.

   IT IS DIMMED AND IT IS NOT INVISIBLE. --text-2 is the same ink the empty line below uses and it
   passes contrast in all eight palettes; --text-3 is the placeholder ink and would put an absence
   below the words beside it, which is how quietening turns into hiding. */
.px-absent {
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  white-space: nowrap;
}
/* A said absence is a sentence, so it wraps like one. */
.px-absent-said { white-space: normal; overflow-wrap: break-word; }

/* ---------------------------------------------------------------------- empty, error, loading

   AN ABSENCE WHOSE CALLER HAS NOT SAID WHICH KIND IT IS. The sentence, quietly, on the panel's own
   ground. It used to be a dashed box at --pad-lg on a second background, which measured as the
   loudest object in a column that had nine of them; the words are unchanged and the box is gone. */
.px-empty {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--gut); flex-wrap: wrap;
  padding: var(--pad) 0;
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
}
/* THE ONE TIER THAT IS ALLOWED TO SHOUT: an absence that is itself the finding. Full ink, the
   dashed edge that means nobody can say, and the room a sentence needs. Reached only by asking for
   it by name, because asking is a claim that a reader has to do something about this. */
.px-empty[data-tier="must-act-on"] {
  padding: var(--pad-lg) var(--pad);
  border: var(--border-w) dashed var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel-2);
  color: var(--text);
}
.px-empty-text { min-width: 0; }
/* THE WAY OUT MAY SHRINK, AND UNTIL 26 AUGUST 2026 IT COULD NOT. It was flex none, which sizes to the
   longest line the words make and never gives any of it back. That is right for the short links most
   callers pass and it is a clip for a sentence. Photographed at 390 on the bundles page: "Type part
   of a record's name above, and press the one you mean" ran out through the right edge of its own
   dashed box and stopped mid-word. Shrinking to auto, with a zero minimum width, lets it wrap
   instead. Nothing that fits today changes, because shrinking is only ever reached by something that
   did not fit. */
.px-empty-act { flex: 0 1 auto; min-width: 0; }

.px-error {
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
  padding: var(--pad);
  border: var(--border-w) solid var(--st-failed-line);
  border-left: var(--rail) solid var(--st-failed);
  border-radius: var(--radius);
  background: var(--st-failed-bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
}
/* The heading shrinks and wraps in a narrow box rather than running out of it: "Mole Office cannot write the
   question for this review" was cut at the edge of the review column at 1440 (round 32 review). Its last line
   keeps more than one word ("review." sat alone at 1440 and 990). */
.px-error-mark { display: inline-flex; align-items: center; gap: 5px; color: var(--st-failed); flex: 0 1 auto; min-width: 0; overflow-wrap: break-word; text-wrap: pretty; }
.px-error-msg { min-width: 0; overflow-wrap: break-word; }
.px-error-act { margin-left: auto; display: flex; gap: var(--gut); align-items: center; }
/* The whole refusal, behind a fold, when the door also wrote a short reason. */
.px-error-more { margin-top: 4px; }
.px-error-sum { cursor: pointer; color: var(--text-2); font-size: var(--fs-1); }
.px-error-long { display: block; margin-top: 4px; max-width: var(--measure-in-box); color: var(--text-2); }
/* A refusal with no code: the server's own sentence, under the page's, marked as the office's words. */
.px-error-own { display: block; margin-top: 4px; max-width: var(--measure-in-box); }
.px-error-own-mark { color: var(--text-2); font-size: var(--fs-1); }
/* The route, the status and the server's own detail. Developer mode only — it is rendered by
   FaultWire, which draws nothing at all in Normal, so this styles a thing a reader asked for. */
.px-error-wire, .px-server-note, .px-error .px-server-said {
  display: block;
  margin-top: 6px;
  max-width: var(--measure-in-box);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  overflow-wrap: anywhere;
}

/* ---------------------------------------------------------------------- incomplete
   Read this next to .px-error above: the two are on the page for opposite reasons and are
   drawn so that no channel they share carries the same value.

   .px-error   --st-failed, the CHIP-strength tint, a 3px spine down its left edge, the word
               "Failed", role="alert".
   .px-inc     --st-todo, the ROW-strength tint (the weak one meant for filling a whole block),
               no spine at all, the words "not filled in", no role.

   Alarm colour vs the neutral one, a spine vs no spine, 700 vs 500. Nothing is unfinished and
   broken-looking at the same time, and nothing is broken and quiet.

   POSITIONED, SO A SHADOW ABOVE IT FALLS UNDER IT. A rank-0 panel is positioned and casts --elev-2; a block
   that is not positioned is painted before it, so in dark mode the decision band's shadow lay over this panel
   and drew its chip at about 4.2:1 (a review of wave 13q's round 33 pictures). */
.px-inc {
  position: relative;
  display: block;
  padding: var(--pad-lg);
  border: var(--border-w) solid var(--px-tone-line);
  border-radius: var(--radius-lg);
  background: var(--px-tone-row);
  color: var(--text);
  font-family: var(--font-ui);
  min-width: 0;
}
.px-inc-head { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; }
.px-inc-title {
  margin: 0;
  font-size: var(--fs-3);
  /* The weight of the todo state, which is the lightest in the system. A heading that announced
     a stub at 700 would be shouting a fact that does not need shouting. */
  font-weight: var(--px-tone-weight);
  line-height: var(--lh-tight);
  color: var(--text);
  min-width: 0;
  overflow-wrap: break-word;
}
.px-inc-lede {
  margin: 6px 0 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text-2);
}
/* Each line is capped at a reading measure, so on a wide page the list runs in columns rather
   than as one narrow ribbon down the left of an otherwise empty block. Order still reads
   left-to-right then down, which is the order KIND_SPECS declares the fields in and the order
   the page itself puts them in. */
.px-inc-list {
  list-style: none; margin: var(--gut) 0 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(26rem, 100%), 1fr));
  column-gap: var(--pad-lg);
}
.px-inc-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--pad) 0;
  border-top: var(--border-w) solid var(--border);
  min-width: 0;
}
/* The PATCH key that fixes this line. Mono, because it is a string to be copied exactly. */
.px-inc-path {
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--px-tone);
  overflow-wrap: anywhere;
}
.px-inc-msg {
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text-2);
  /* The sentence ends in a real JSON example, which is one long unbreakable token. It has to
     break inside itself rather than push the page sideways. */
  overflow-wrap: anywhere;
}

/* The box that fills one of these in, under the sentence that reports it missing. It takes the
   reading measure like the sentence above it, so the control and the words about it are one
   column rather than a narrow paragraph over a page-wide input. */
.px-inc-write {
  max-width: var(--measure-in-box);
  margin-top: var(--pad);
  min-width: 0;
}

/* The marker, in a list or beside a title. Same tone and same glyph as the block, so the thing
   you spotted in a list is recognisably the thing the record's own page then explains.
   No border and default cursor: by this file's affordance grammar that makes it decoration,
   which is what it is -- there is nothing to press here. */
.px-inc-mark {
  display: inline-flex; align-items: center; gap: 5px;
  min-height: 20px; padding: 1px 8px;
  border-radius: var(--radius-sm);
  background: var(--px-tone-bg);
  color: var(--px-tone);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  font-weight: var(--px-tone-weight);
  letter-spacing: .06em;
  line-height: var(--lh-tight);
  white-space: nowrap;
  cursor: default;
  flex: none;
}
.px-inc-mark-word { overflow: hidden; text-overflow: ellipsis; }

.px-loading { display: flex; flex-direction: column; gap: 2px; font-family: var(--font-ui); }
.px-loading-rows { display: flex; flex-direction: column; gap: 2px; }
.px-loading-line {
  font-size: var(--fs-1); color: var(--text-3); letter-spacing: .06em; text-transform: uppercase;
  padding: 0 var(--pad) 2px;
}
/* --panel-3, not --panel-2: a skeleton has to be visible on a quiet panel, which is itself
   drawn on --bg, and --panel-2 is too close to it to read as anything at all. */
.px-skel-bar {
  display: block; width: 100%; height: 10px;
  border-radius: var(--radius-sm);
  background: var(--panel-3);
}
/* The right-hand column is sized to its content, so a 100%-wide placeholder in it is 0 wide and
   the column silently vanishes -- exactly the shift the skeleton exists to prevent. */
.px-skel .px-row-right .px-skel-bar { width: 44px; }

.px-stamp { font-variant-numeric: tabular-nums; color: var(--text-3); white-space: nowrap; }

/* ---------------------------------------------------------------------- the alarm scale
   Four steps, and ONE STRONG-RED OBJECT PER ROW. Read them top to bottom: the fill goes first,
   then the weight comes down.

   WHERE THE HUE WENT. A level used to reach every object on its row, so the state word, the age,
   the rail, the tint and the border were all the alarm colour at once and six rows of red said
   nothing about which of them was worst. Strong red is a budget now, and it is spent on what a
   reader cannot infer: a MARK (a person who could be hurt, a recorded consequence), a date that
   has passed (.px-chip-count[data-count="late"] below), a real error, and the rail that ranks the
   row. A stored word like "open" and an age like "under a day" are descriptive metadata: they are
   drawn in text colour at every step, because a row's presence and its rank already said it
   matters.

   So the split below is between a MARK, which is a statement about the row, and every other chip,
   which is a fact printed on it. "faded" has no hue for either and is carried by its word, its
   shape and the number printed beside it.

   NOTHING ESCALATES ABOVE "urgent". That is the point rather than an omission -- there is no
   colour louder than the alarm colour, so a row that gets worse says so with a bigger number
   in the same mark. See .px-chip-count below. */
.px-mark[data-alarm="urgent"] {
  /* THE FALLBACK IS THE DEFAULT, AND IT IS LOAD-BEARING. The state's own chip tint is the fill in
     six of the seven themes; --alarm-urgent-fill exists so the high-contrast theme, which sets
     every state tint to white and would otherwise draw the top two steps identically, can override
     it. The default is written HERE rather than in tokens.css because --px-tone-bg is set by
     toneVars() on this chip: :root cannot see it, and when the token was declared up there as
     var(--px-tone-bg) the whole declaration was invalid at computed-value time and this background
     measured transparent in every theme but hc. See the note on the token in tokens.css. */
  background: var(--alarm-urgent-fill, var(--px-tone-bg));
  color: var(--px-tone);
  border-color: var(--px-tone-line);
  font-weight: var(--alarm-urgent-weight);
}
/* THE ONE RULE THAT STOPS THE WORD "open" BEING RED. Everything that is not a mark keeps the
   weight -- the top step is still the heaviest -- and gives up the hue. */
.px-chip[data-alarm="urgent"]:not(.px-mark) {
  background: transparent;
  color: var(--alarm-urgent-ink);
  border-color: var(--alarm-urgent-line);
  font-weight: var(--alarm-urgent-weight);
}
.px-chip[data-alarm="raised"] {
  background: transparent;
  color: var(--alarm-raised-ink);
  border-color: var(--alarm-raised-line);
  font-weight: var(--alarm-raised-weight);
}
.px-chip[data-alarm="plain"] {
  background: transparent;
  color: var(--alarm-plain-ink);
  border-color: var(--alarm-plain-line);
  font-weight: var(--alarm-plain-weight);
}
.px-chip[data-alarm="faded"] {
  background: transparent;
  color: var(--alarm-faded-ink);
  border-color: var(--alarm-faded-line);
  font-weight: var(--alarm-faded-weight);
}

/* ------------------------------------------------------------------- surface emphasis
   THE SAME SEMANTIC FACT, DRAWN AT THE EMPHASIS THE SURFACE ASKED FOR. The rule, the two names
   and the six families are documented in this file beside the alarm scale -- search for THE SAME
   SEMANTIC FACT. A surface declares its emphasis once, with surfaceEmphasis().

   NOTHING HERE CHANGES WHAT A STATE MEANS. The four rules above take the state hue off a chip so
   that Home's colour is spent on urgency. That is right for Home, which is being scanned, and
   wrong for the sessions list, which is being compared: it drew "idle", "crashed" and "orphaned"
   as three grey chips telling six states apart with a word and a 16px shape. So an analytical
   surface hands the hue back to the state and leaves the level with the weight. The ROW ladder is
   untouched at either emphasis -- rail, safety tint, faded title -- so an old row still recedes.

   HOME SETS NO EMPHASIS ATTRIBUTE, SO NO RULE IN THIS BLOCK REACHES IT. Every selector here is
   gated on [data-px-emphasis], which only Sessions, Records and Queries declare, and there is a
   test that fails if an ungated family rule appears. That gate is the whole promise this block can
   make, and it is deliberately narrower than the one that used to be written here ("HOME DECLARES
   NOTHING AND IS UNCHANGED"): the same wave that added this block also fixed --alarm-urgent-fill,
   which is not gated on anything, and Home's seven safety marks went from a transparent ground to
   a filled one in six of the seven themes. Home did move. What is true is that nothing BELOW can
   move it.

   THIS IS NOT A NEW PICTURE. Nothing below invents a colour, a fill or an edge that the state did
   not already have: every value is a --px-tone-* the chip is already carrying, a text token, or a
   border token. Two families get less than the general rule hands out, each for a reason written
   on its own rule, and neither of those reasons is taste.

   IT NO LONGER TOUCHES THE STORED WORD, WHICH IS WHY EVERY SELECTOR HERE SAYS not px-chip-stored.
   There are two different objects wearing the .px-chip class. One is a word THIS INTERFACE chose,
   out of the ten in PANEL_STATES -- Running, Crashed, Idle, Orphaned -- and it is what this block
   is for: a page being compared needs its six families told apart at a glance. The other is a word
   somebody WROTE ON A RECORD, drawn by StoredState, and that one now has a single drawing
   everywhere in the product; see "one stored word, one drawing" below. Before this exclusion the
   same stored word came out three ways: measured in Chromium in "light", "open" was ink 69,75,85
   on nothing on Home, ink 22,24,28 on nothing here, and white on a filled 22,24,28 block on
   #/work. Three drawings, one stored fact.

   THE BLOCK IS NOT REDUNDANT AND WAS NOT DELETED. Counted in Chromium on #/records and #/sessions
   in the live corpus: 63 chips that are NOT stored words carry a family here, across all six
   families -- 4 active, 2 danger, 2 neutral, 18 success, 1 unknown, 36 warning. The danger rule in
   particular still has work to do, because "Crashed" on #/sessions is a danger chip and PROGRESS
   FAMILY has no danger in it at all, so the stored ladder could never have covered it. */
[data-px-emphasis="analytical"]
  .px-chip:not(.px-mark):not(.px-chip-stored):not([data-state-family="warning"]):not([data-state-family="danger"]) {
  background: var(--px-tone-bg);
  color: var(--px-tone);
  border-color: var(--px-edge);
}
/* THE FAMILY THAT GETS ITS HUE AND NOT ITS FILL, AND WHY THE FILL IS THE HALF THAT IS REFUSED.
   The filled ground of the top alarm step is the state's own chip tint, and tokens.css spends it
   on exactly two objects -- a safety mark and a recorded consequence -- so that a filled red
   ground means A PERSON IS IN THIS ROW. The general rule above handed that same ground back to
   "danger" with everything else: measured in Chromium on #/sessions in "light", a "crashed" chip
   at the raised level computed ink 179,67,53 on fill 247,234,233, BYTE-IDENTICAL to the
   urgent safety mark on the same page, which differed only in a font weight and the alpha on its
   edge. A filled red ground then meant either "a person could be hurt" or "a background process
   died" -- one drawing, two meanings, which is the silent substitution this repository's second
   rule forbids.

   So the hue comes back on the INK and the EDGE and the ground stays empty. That is enough to keep
   the reason the emphasis exists: on the same page, "crashed" is the only red thing among grey,
   blue, green and amber chips, and it no longer has to be told from "idle" and "orphaned" by a
   word and a 16px shape.

   THE EDGE IS AT FULL STRENGTH -- --px-tone-line -- rather than the 55% mix the general rule
   restores, and it is what replaces the mass the fill was carrying. Both were drawn and measured:
   with the mix, the fault is the only one of the three states in this list with neither a fill nor
   a full-opacity edge, because "idle" beside it keeps its filled ground and "orphaned" keeps a
   full-opacity --border-strong edge. --px-tone-line invents nothing: it is the state's own line
   token, already drawn at full strength on every editable chip and on the urgent mark's own
   border. Fill, not edge, is what the mark keeps to itself.

   IT REACHES AN UNLEVELLED DANGER CHIP TOO, and that is deliberate rather than overreach: the base
   .px-chip rule fills one from --px-tone-bg, so a "broken" chip with no level was drawing the same
   byte-identical red ground as the mark on this same page. On an analytical surface, one drawing
   means one thing. (On Home that base fill is untouched and still reaches an unlevelled danger
   chip -- it is older than this block, it is not gated on anything here, and changing it is a
   change to Home.) */
[data-px-emphasis="analytical"] .px-chip[data-state-family="danger"]:not(.px-mark):not(.px-chip-stored) {
  background: transparent;
  color: var(--px-tone);
  border-color: var(--px-tone-line);
}
/* THE ONE FAMILY WITH NO HUE TO HAND BACK, AND WHAT IT IS GIVEN INSTEAD.
   "warning" means abnormal and not a fault: work that stopped short, a date that has passed with
   nothing broken. Its states borrow the "failed" tone because Mole Office has four state colours and an
   amber already spent on "inferred", and there is no fifth. Handing that tone back would print
   "open", "idle" and "chasing" in the alarm colour across a whole catalogue, which is the exact
   reading the red budget removed. So this family is drawn in full text colour on an empty ground
   with a structural edge: no hue, and told from the neutral family's filled grey by ink, by
   fill-against-outline and by its own glyph, without claiming an alarm the row has not earned.

   IT USED TO STOP AT :not([data-alarm]), AND THAT LEFT THE MOST COMMON STATE ON THE PAGE HUELESS
   AND SHAPELESS. A levelled warning chip fell through to the alarm scale, which draws it in the
   scale's greys -- the same greys the neutral family's ink is mixed from. Measured on #/sessions in
   "light": "orphaned" at the faded level computed ink 92,99,110 on a transparent ground and
   "idle" computed the SAME ink, 92,99,110, on fill 237,238,239 -- 18/255 of luminance
   between the two, and no other separation at all. In "dark" both were 152,160,175. 21 of the
   38 orphaned rows on that page are drawn at the faded level, so the single most common state on
   the page was the one a reader could not name without reading it.

   WHAT IT COSTS, SAID OUT LOUD. A levelled warning chip no longer recedes by INK on the three
   analytical pages; it recedes by weight, and the ROW ladder underneath it -- rail, tint, faded
   title -- is untouched, so an old row still recedes as a row. That is not a new trade: it is the
   one every other family here already made, because handing back --px-tone flattens the level's
   four inks into one for all of them. "plain" and "faded" share a weight, so those two levels are
   drawn alike on these pages, for every family and not only this one.

   IT SETS colour, NOT THE TONE VARIABLES, and that is not a style preference. toneVars() writes
   --px-tone and --px-tone-bg as an INLINE style on the chip, and an inline declaration beats every
   stylesheet rule there is. Re-pointing the variables from here was measured in Chromium doing
   nothing at all: the chip still came out in the borrowed alarm colour, on its red tint. */
[data-px-emphasis="analytical"] .px-chip[data-state-family="warning"]:not(.px-mark):not(.px-chip-stored) {
  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);
}

/* ------------------------------------------------- one stored word, one drawing, everywhere
   THE OWNER'S FINDING: "the tags like open, under a day, property ... they need different color
   (text or block or outline)". This is the answer, and it is stated here, once, for the whole
   product. It used to live on the six family pages only, so the same stored word came out three
   different ways depending on which page a reader was on.

   EIGHT TREATMENTS, KEYED ON WHAT THE READER SHOULD DO ABOUT THE WORD, and the key is the WORD
   rather than what it classifies as. That one change is what makes the shape channel work: keyed on
   the classification, five different situations -- open, blocked, orphaned, idle, crashed -- all
   came out as the identical filled black block, measured in Chromium on Home on 13 August, on all
   twenty chips.

     filled block         somebody is waiting on you right now -- idle, orphaned, anything past its date
     outline, hollow      nobody has started it -- todo, new, wanted, proposed, ordered
     outline, filled      somebody is on it right now -- doing, running, active, open
     outline, barred      stopped, and not by you -- blocked, parked, paused, deferred, chasing
     outline, broken      it was tried and it broke -- failed, crashed
     plain text, tick     it reached its end -- done, finished, fixed, fulfilled, measured, arrived
     plain text, struck   it ended without delivering -- cancelled, dropped, retracted, retired
     dashed outline       nobody can say -- unknown, a word nothing has classified, or no word

   THREE OF THE EIGHT ARE TOLD APART BY THEIR GLYPH AND NOT BY THEIR GROUND, and that is the design
   rather than a shortage: barred and broken are variants inside the outline, struck is a variant
   inside plain text. Adding a ground for each would be five ground treatments to learn where three
   plus a shape says the same thing.

   NOT A NEW COLOUR, BECAUSE THERE IS NOT ONE TO SPEND. docs/UX-CONTRACT.md forbids a hue on
   the ordinary states by name -- todo, new, proposed, parked, idle, open -- so the separation is
   WEIGHT: a fill, an edge, nothing, and a broken edge. Each chip still carries its word and its
   glyph, so no state here is carried by colour alone.

   THE GREEN CAME OFF THE ENDED STATES. It used to ink them from --st-done, and it sat on a
   withdrawn measurement, an abandoned promise, a problem whose cause is still there and a retired
   subsystem. A green tick reads as "good, trust this", which is a claim about fourteen words that
   only say the work stopped happening. Ended states are ordinary quiet ink now, and the tick and
   the struck tick are what separate an end that delivered from one that did not.

   THE FILL IS --text ON --panel AND NOT THE STATE'S OWN TINT, which is the one value here that
   looks arbitrary and is not. The block above refuses the danger family its filled ground on
   analytical surfaces because a filled RED ground is spent on exactly two objects in tokens.css
   and means "a person could be hurt"; measured in Chromium, a levelled crashed chip came out
   byte-identical to the urgent safety mark. A neutral inverted block cannot be confused with
   either, it invents no colour, and --text against --panel is the primary text pair in all eight
   palettes, so it passes contrast everywhere by construction rather than by luck. Measured again
   after this move: no stored chip on Home, on #/records, on #/sessions, on #/work or on #/decisions
   shares a ground and an ink with the urgent safety mark, in either theme.

   IT IS DELIBERATELY GATED ON NOTHING, WHICH IS THE POINT OF MOVING IT. Every other family rule in
   this file is gated on [data-px-emphasis] so that it cannot reach Home. These four are not,
   because a stored word is a fact about a record rather than an opinion of the page it is on, and
   Home reading "open" one way while #/work reads it another is the same fact drawn twice. What the
   gate was protecting is the red budget, and that is protected here by the values instead: not one
   of these four rules names a --st-* fill, a --px-tone-bg or any hue at all, except the --st-done
   ink that "finished" already had.

   IT OUT-WEIGHS THE ALARM SCALE ON PURPOSE, AND LEAVES THE LEVEL THE WEIGHT. .px-chip[data-alarm]
   is three class-level pieces and these are four, so a levelled stored chip takes its family's
   drawing and keeps only the alarm's font-weight. That is not new: the six family pages have drawn
   it that way since the ladder was written, and 13 of the 13 stored chips on #/work carry a level.
   What it changes is Home, where 20 stored chips previously took their ink from the alarm scale.
   The ROW ladder underneath them is untouched -- rail, safety tint, faded title -- so an old row
   still recedes as a row, and the lateness pill below still buys the only strong red on the word.

   WHY .px-chip IS WRITTEN AS WELL AS .px-chip-stored, AND WHY THAT WAS MEASURED. This has to beat
   the alarm scale, which is .px-chip plus an attribute plus a :not. Written without the leading
   .px-chip it TIES with the alarm rules and wins only by sitting later in the file, which is a
   promise nobody can see when they move a block. It used to be written .fam.fam.fam for the same
   reason, and that triple was found by reading getComputedStyle out of Chromium after a two-class
   version had been READ as winning: "todo" still computed its filled grey ground.

   IT IS KEYED ON data-drawing, WHICH IS WRITTEN BY ONE TABLE. StoredState computes it with the
   function stateDrawing, from STATE_DRAWING_BY_WORD, and tests/state-drawing.test.ts fails when a
   word that has a meaning has no drawing. Keying the stylesheet on the classification instead is
   what produced the collapse this block exists to undo. */
.px-chip.px-chip-stored[data-drawing="waiting-on-you"]:not(.px-mark) {
  background: var(--text);
  border-color: var(--text);
  color: var(--panel);
  font-weight: 600;
}
/* The three outline drawings. They share a ground and an edge and are told apart by the glyph and
   by the ink: hollow square in quiet ink for work nobody has begun, half-filled disc in full ink
   for work somebody is on, barred circle in quiet ink for work held shut by something else. */
.px-chip.px-chip-stored[data-drawing="not-started"]:not(.px-mark),
.px-chip.px-chip-stored[data-drawing="held-up"]:not(.px-mark) {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--text-2);
  font-weight: 500;
}
.px-chip.px-chip-stored[data-drawing="under-way"]:not(.px-mark) {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--text);
  font-weight: 600;
}
/* IT WAS TRIED AND IT BROKE, at full ink on a full-strength edge and on no ground. The edge is what
   replaces the mass a fill would carry, and a fill is refused for the reason the analytical block
   above refuses it: a filled ground on a chip about a failure was measured byte-identical to the
   safety mark, and a filled ground means a person is in the row. */
.px-chip.px-chip-stored[data-drawing="broke"]:not(.px-mark) {
  background: transparent;
  border-color: var(--text);
  color: var(--text);
  font-weight: 600;
}
.px-chip.px-chip-stored[data-drawing="ended"]:not(.px-mark),
.px-chip.px-chip-stored[data-drawing="ended-empty"]:not(.px-mark) {
  background: transparent;
  border-color: transparent;
  color: var(--text-2);
  font-weight: 500;
  padding-left: 0;
}
/* Dashed is this product's word for "Mole Office worked it out and nobody asserted it" -- see
   .px-chip[data-inferred] below -- and an unclassified word is the same kind of fact. Absence beats
   a guess: this has to stay tellable from every asserted drawing, and it is, by the broken
   edge that none of them has. */
.px-chip.px-chip-stored[data-drawing="nobody-can-say"]:not(.px-mark) {
  background: transparent;
  border-color: var(--border-strong);
  border-style: dashed;
  color: var(--text-2);
  font-weight: 500;
}
/* The lateness pill keeps its own ground inside the filled block, which is what its rule below
   already gives it; this only stops the inverted ink leaking onto the ordinary counts. */
.px-chip.px-chip-stored[data-drawing="waiting-on-you"] .px-chip-count:not([data-count="late"]) {
  color: inherit;
}
/* Developer provenance has its own line beneath the primary state word. */
.px-state-with-source {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  vertical-align: top;
}
.px-chip-stored-word {
  display: block;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  color: var(--text-3);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
}
/* THE TWO MARKS THAT SAY NO WORD WAS WRITTEN, drawn apart. "Nobody wrote a state here" is a record
   somebody should go and finish, and takes the broken edge that means nobody can say. "This kind
   has no state field" is a fact about the kind, needs nothing, and is drawn as a plain dash with no
   enclosure at all. They used to be identical in every measured channel and differ by one noun. */
.px-mark[data-edge="dashed"] { border-style: dashed; }
.px-mark[data-edge="none"] {
  background: transparent;
  border-color: transparent;
  color: var(--text-3);
  padding-left: 0;
}

/* The number that grows when the colour cannot: "13 days", "5 days late", "open-ended". Hairline
   separated rather than in brackets, so it reads as a second field and not as an afterthought.

   NEITHER UPPERCASED NOR LETTER-SPACED, unlike every other chip in this file, and the reason is
   that this field holds text somebody else wrote -- a stage name on a partial gate, which is as
   likely to be Chinese as it is to be English. Letter-spacing pushes CJK
   characters apart into something that reads as broken typesetting, and uppercase does nothing to
   them at all, so a label styled for Latin quietly stops working for half the corpus. */
.px-chip-count {
  padding-left: 6px;
  border-left: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  font-variant-numeric: tabular-nums;
  text-transform: none;
  letter-spacing: normal;
  min-width: 0;
}
/* THE AGE IS NOT THE ALARM. On the stored word this number is one of three things -- how late a
   promise is, how far past its resume date a pause is, or simply how long the row has sat -- and
   only the first of them is a date somebody agreed and missed. So the number is neutral by
   default and lateness is what buys the colour: "under a day" beside "open" stops being red
   merely because the row is on the list. Which of the three it is comes from the one function
   that decides it (escalationOf in AttentionPanel.tsx), never from re-reading the words here.
   That function went in wave 13k's round 22 with the only row that drew it; a caller that passes
   a count now says which of the three it is through countKind, and this rule still reads only that.
   Scoped to the stored word: a mark's own count is part of the mark and keeps its ink. */
.px-chip-stored .px-chip-count { color: var(--text-3); font-weight: 500; }
.px-chip-stored .px-chip-count[data-count="late"] {
  color: var(--st-overdue);
  font-weight: var(--st-overdue-weight);
  /* AND ITS OWN GROUND, which is the fix rather than the decoration. This ink is drawn inside a
     chip tinted for whatever state the ROW is in, so on a doing-blue chip the red count measured
     4.45:1 against the blue behind it -- under the 4.5 floor, and only on the rows where a state
     and a missed date disagree, which is exactly where the number matters most. Giving it the
     overdue tint makes its ground the same everywhere it appears: measured 4.75:1 in light and
     4.81:1 in dark, in every palette. It also stops two states sharing one fill, which is the
     semantic version of the same defect. */
  background: var(--st-overdue-bg);
  border-radius: var(--radius-sm);
  padding-right: 5px;
  margin-left: 2px;
}

/* A stored word and a mark WRAP rather than truncate. Every other chip in this file holds one of
   ten words this interface chose, and clipping one loses nothing; these hold a word somebody
   wrote on a record, and "blocke…" is the silent shortening this product bans everywhere else. */
.px-chip-stored, .px-mark {
  white-space: normal;
  align-items: flex-start;
  padding-top: 3px;
  padding-bottom: 3px;
  text-align: left;
}
.px-chip-stored .px-chip-word, .px-mark .px-chip-word {
  overflow: visible;
  text-overflow: clip;
  /* break-word, NOT anywhere: "anywhere" split "open" across two lines inside a narrow severity
     column, which is a stored word rendered as two words. This only breaks where a word cannot
     fit on a line of its own. */
  overflow-wrap: break-word;
}
/* A STATE WORD IN THE SEVERITY COLUMN WRAPS RATHER THAN BEING CUT. The column is a fixed 112
   pixels, and the longer translated words do not fit it: Greek "Μπλοκαρισμένο" needs 116 and
   Italian "Non riuscito" 88. A stored word already wraps here and keeps its whole text; an
   interface word now does the same, so no state a row is in ends in an ellipsis. */
.px-row-sev .px-chip-word { white-space: normal; overflow-wrap: break-word; }
/* The stored word is printed as it was written -- see the CJK note on .px-chip-count above, and
   because "print the stored word" reads oddly next to a word this stylesheet has recased. */
.px-chip-stored .px-chip-word { text-transform: none; letter-spacing: normal; }
.px-chip-stored .px-glyph, .px-mark .px-glyph { margin-top: 2px; }

/* IN THE SEVERITY COLUMN the number goes on its own line under the word, because the column is
   150px and a word plus a number does not fit across it. The work page's state column too. Only there: in a strip of marks there is
   room for one line and the hairline rule between the two fields reads better. */
/* THE WORK PAGE'S STATE COLUMN IS AS NARROW (9.5rem), so its stored chip draws the same way. Sharing one line, the
   word and the count shrank into each other and broke mid-phrase: "due in 23 / days", and the Chinese
   phrases for due and for open split the same way (the secretary's review of round 27's pictures). On a line each, both fit whole.
   tests/a-deadline-chip-keeps-its-phrase-whole.test.ts holds it. */
.px-row-sev .px-chip-stored, .px-row-sev .px-mark, .wk-state .px-chip-stored { flex-wrap: wrap; }
.px-row-sev .px-chip-count, .wk-state .px-chip-stored .px-chip-count {
  flex-basis: 100%;
  margin-left: calc(var(--px-glyph) + 5px);
  padding-left: 0;
  border-left: 0;
}
/* A LATE COUNT ON ITS OWN LINE HAS ITS OWN RED GROUND, so it takes the same inner room on the left as on the right. With
   no padding the words touched the box's left edge, "1 day late" and its Chinese (a review of round 31's pictures; wave
   13q's round 32). tests/a-late-count-sits-inside-its-red-ground.test.ts measures it. */
.px-row-sev .px-chip-count[data-count="late"], .wk-state .px-chip-stored .px-chip-count[data-count="late"] { padding-left: 5px; }
/* Dashed means Mole Office worked it out, and only that. Stated a second time here as an attribute so
   the meaning survives a caller that passes an unexpected tone. */
.px-chip[data-inferred="1"] { border-style: dashed; }

/* ------------------------------------------------------------------- how a record got here

   DELIBERATELY OFF THE STATE COLOUR SCALE. Every other chip in this file inks itself from
   --px-tone-*, which is pointed at one of the ten states; origin is not a state, not a severity
   and not an alarm, and "fixture" is explicitly NOT a claim that the content is wrong. So this
   one carries neutral surface and text tokens and sets every property .px-chip took from a tone,
   which is why the selector is doubled: it must win wherever it sits in the sheet.

   FIXTURE IS THE LOUD ONE, and it is loud in three channels that all survive greyscale, a mono
   theme and a printout: a filled ground where the others have none, heavier weight, and its own
   silhouette and word. No hue is spent, so nothing a theme does to the state colours can quieten
   it.

   THE EDGE USED TO BE A FOURTH CHANNEL AND IS NOT ONE ANY MORE, because it never was one on
   screen. The rule below drew every other origin mark with --border, the decorative hairline, and
   tools/legibility.mjs measured that boundary at 1.16:1 in light and 1.45:1 in dark on 15 August
   2026, over a transparent fill. Three marks were drawn that way and all three are the cases where
   Mole Office cannot say how a record got here: origin not recorded, origin word not understood, origin
   not served. The box is the thing that makes those read as a question rather than an answer -- the
   comment below says so in as many words -- and a box a person cannot see is not a box. So the rule
   now takes --border-strong, which is the token for a line that IS the object, and fixture keeps
   its distance on fill, weight, silhouette and word instead of on four.

   ROUNDED ALL THE WAY, SO IT IS NOT READ AS A SECOND STATE CHIP. On a #/work tile this mark sits
   beside the record's state word, and both were the same object: a 22px box with the same corner,
   the same 1px edge, a glyph and a word. A reader scanning the tile saw two states. A state chip
   is square-cornered in every theme; this is the one enclosed mark that is not, and --radius-pill
   is the token .dp-from on the record page already uses to say the same thing in its own comment,
   "it is a mark and not a state".

   THE SHAPE IS WHAT CHANGED AND THE LOUDNESS IS NOT, deliberately. The channels above are
   untouched: same fill, same 700 weight, same glyph and word, same size and same type. Quietening
   the ordinary answer is what makes fixture exceptional, so making fixture itself quieter would
   close the gap this whole block exists to open. The tile reads better because the two objects now
   have different silhouettes, not because one of them faded. */
.px-chip.px-origin {
  background: transparent;
  color: var(--text-3);
  border-color: var(--border-strong);
  border-style: solid;
  border-radius: var(--radius-pill);
  font-weight: 500;
}
/* AUTHORED LOSES ITS BOX AND KEEPS EVERYTHING ELSE.
   Every record on a list carries an origin mark and almost every record is "authored", so the
   normal case was an enclosed, uppercase, letter-spaced badge repeated down the whole page --
   arguing at chip strength for the one answer a reader never has to act on. It keeps its word, its
   nib silhouette and its own ink, which is three channels and all a reader needs to see that the
   question WAS answered. What it gives up is the enclosure, which was the only thing making it
   compete with the state chip beside it.
   THIS IS WHAT MAKES FIXTURE EXCEPTIONAL RATHER THAN MERELY DIFFERENT. Fixture is unchanged and is
   now the only origin on an ordinary page drawn inside a box, so the difference between the normal
   answer and the one that must never be quoted as an observation is wider than it was, not
   narrower. The three cases where Mole Office cannot say keep their boxes too: they are questions, and
   a question is not the normal case either. */
.px-chip.px-origin[data-origin="authored"] {
  color: var(--text-2);
  border-color: transparent;
  padding-left: 0;
  padding-right: 0;
}
/* LOUD, AND IT STAYS LOUD. The 2026-08-13 UX pass came for this one — it IS the heaviest object in
   a row whose state is "orphaned", which looks wrong beside every other density judgement in that
   pass -- and the test below refused it. Rightly. Quietening the authored mark is what makes the
   fixture one exceptional rather than merely different, so that gap is the whole mechanism, and
   halving it to tidy one row would put back the condition where a reader quotes generated content
   as a project record. Getting this wrong in either direction has already cost two agents.
   The row imbalance is real and is not this chip's fault: on Home's ranked list an old row's state
   chip is drawn at the faded alarm weight ON PURPOSE, so what stands out beside it is a chip at
   full strength doing its job. */
.px-chip.px-origin[data-origin="fixture"] {
  background: var(--panel-3);
  color: var(--text);
  border-color: var(--border-strong);
  font-weight: 700;
}

/* THE SENTENCE THAT LETS A LIST DROP THE AUTHORED MARK ALTOGETHER.
   Quieter than the chip it replaces and drawn once per surface rather than once per row, which is
   the whole trade. It is not behind a disclosure: hiding the explanation as well would hide the
   thing that makes hiding the mark legitimate. */
/* SET IN A TOKEN, AND IN THE ONE FOR BODY TEXT. It read 0.78rem, which is a size this product's
   scale does not have -- between --fs-1 (12px, "labels, meta, chips") and --fs-2 (13px, "UI body,
   row text"). It is neither a label nor a chip: it is a SENTENCE, and it is the sentence that gives
   every unmarked row on the page its meaning, so it is the last thing that should be set below the
   size the rows themselves are set in. Measured on 2026-08-12 it was the only prose left under 13px
   on Home and on Queries after both were fixed. */
.px-note.px-origin-note {
  margin: 0;
  color: var(--text-3);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
}

/* THE HOVER HALF OF THE SAME NOTE, on the lists of the 16 September change in this file. A small
   info glyph that carries the sentence on its title; it sits inline with whatever follows it, so
   it is the small-screen quiet of the note rather than its text. */
.px-origin-note-hover {
  color: var(--text-3);
  font-size: var(--fs-2);
  cursor: help;
  display: inline-flex;
  align-items: center;
}

/* The row at each level is drawn ONCE, for both row shapes, at the foot of this stylesheet --
   search for "the alarm ladder". It used to be written here for .px-row, again for .px-scan and a
   third time for the ungated data-severe path, and changing one left the other two drawing the
   old picture with no type error, no failing test and no symptom on the page being looked at. */
/* A stored word plus its number needs more room than "Inferred" did. Widened only for rows on the
   alarm scale, so no existing list moves.

   TOP-ALIGNED, for the same narrow reason: a row carrying a reason line is four or five lines
   tall, and a state chip floating in the middle of that is no longer part of the vertical edge
   the eye runs down. Ordinary rows stay centred. */
.px-row[data-alarm] { --px-col-sev: 150px; align-items: start; }

/* ---------------------------------------------------------------------- marks with a sentence */
.px-noteline {
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
  min-width: 0;
  font-family: var(--font-ui);
}
.px-noteline-text {
  min-width: 0; max-width: var(--measure-in-box);
  font-size: var(--fs-2); line-height: var(--lh-read); color: var(--text-2);
  overflow-wrap: break-word;
}

/* ---------------------------------------------------------------------- family tags
   THE SAME RAIL AND THE SAME GLYPH AS A KIND TAG, from the same table. A heading saying "Findings"
   and a tag saying "claim" underneath it are the same family, and drawing them differently would be
   one fact drawn two ways. This block used to say the opposite -- monochrome, no attribute naming
   the family, nothing for a selector to catch -- and the note above FamilyTag says what was
   measured that reversed it. No uppercase and no letter-spacing either: a heading that may one day
   hold Chinese must not be given Latin typographic tricks that CJK does not take. */
.px-family {
  display: inline-flex; align-items: baseline; gap: 6px;
  min-height: 20px; padding: 2px 8px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-family: var(--font-ui);
  font-size: var(--fs-1);
  font-weight: 600;
  line-height: var(--lh-tight);
  cursor: default;
  min-width: 0;
}
.px-family[data-family] {
  border-left: var(--rail) solid var(--px-family);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  padding-left: 6px;
}
.px-family[data-family] .px-glyph { color: var(--px-family); align-self: center; }
.px-family-count {
  padding-left: 6px;
  border-left: 1px solid var(--border);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
/* A kind no family covers. Drawn as the finding it is, in the colour this app already uses for a
   link that points at nothing -- it is the same class of problem, not a sixth family. */
.px-family[data-unknown="1"] { color: var(--st-broken); border-color: var(--st-broken-line); }

/* ---------------------------------------------------------------------- the reason line
   The sentence is always visible and never behind a hover, because half of this product's
   readers are holding a phone. What IS behind a press is the arithmetic, which is a check
   rather than a read. */
/* ABOVE THE ROW'S LINK OVERLAY. A row with an href covers itself with a transparent layer so the
   whole row is one target, and anything below that layer cannot be pressed -- which would have
   made the disclosure below unreachable on exactly the rows that have one. The severity and
   right-hand columns already do this for the same reason. */
.px-reason {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; gap: 4px; min-width: 0; font-family: var(--font-ui);
}
.px-reason-because {
  margin: 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text-2);
  overflow-wrap: break-word;
}
.px-reason-lead {
  margin-right: 8px;
  font-size: var(--fs-1); font-weight: 600; letter-spacing: .06em;
   color: var(--text-3);
  white-space: nowrap;
}
.px-reason-floor { margin: 0; display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; min-width: 0; }
.px-reason-floor-text {
  min-width: 0; max-width: var(--measure-in-box);
  font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2);
}
.px-reason-more { min-width: 0; }
/* An enclosed control, by this file's own affordance grammar: it changes what is on the screen.
   The native disclosure triangle is replaced because it sits outside the box and reads as a
   bullet rather than as part of the control. */
.px-reason-sum {
  display: inline-flex; align-items: center; gap: 8px;
  width: fit-content; max-width: 100%;
  min-height: var(--row-h);
  padding: 0 10px;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text-2);
  font-family: var(--font-ui); font-size: var(--fs-1); font-weight: 600;
  line-height: var(--lh-tight);
  cursor: pointer;
  list-style: none;
}
.px-reason-sum::-webkit-details-marker { display: none; }
.px-reason-sum::after { content: "▾"; color: var(--text-3); }
.px-reason-more[open] > .px-reason-sum::after { content: "▴"; }
.px-reason-sum:hover { background: var(--hover); border-color: var(--text-3); color: var(--text); }
.px-reason-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
}

/* ---------------------------------------------------------------------- factor breakdown
   One line per factor, INCLUDING the ones worth nothing. A zero still says why it is zero, and
   "nobody has recorded who is hurt if this is left alone" is often the most useful line here,
   because it names a field somebody can go and fill in. */
.px-factors { margin-top: var(--gut); min-width: 0; }
.px-factor-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.px-factor {
  display: grid;
  grid-template-columns: minmax(7rem, 11rem) minmax(0, auto) minmax(3rem, 5rem) minmax(0, 1fr);
  align-items: baseline;
  column-gap: var(--gut); row-gap: 3px;
  padding: 5px 0;
  border-top: var(--border-w) solid var(--border);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  min-width: 0;
}
.px-factor > * { min-width: 0; }
.px-factor-name { color: var(--text); font-weight: 600; overflow-wrap: break-word; }
.px-factor-points { color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.px-factor-of { color: var(--text-3); font-weight: 400; }
/* The bar is drawn against the factor's real maximum from the shared rule, so its length means
   "this gave most of what it could give" and not "this bar is longer than that one". */
.px-factor-track {
  display: block; height: 6px; align-self: center;
  border-radius: var(--radius-sm);
  background: var(--panel-3);
  overflow: hidden;
}
.px-factor-fill { display: block; height: 100%; background: var(--text-2); border-radius: var(--radius-sm); }
.px-factor-why { color: var(--text-2); overflow-wrap: break-word; }
/* A factor worth nothing is quiet but present. Removing it would turn the breakdown into a list
   of reasons the row won, which is an advert and not a check. */
.px-factor[data-zero="1"] .px-factor-name,
.px-factor[data-zero="1"] .px-factor-points,
.px-factor[data-zero="1"] .px-factor-why { color: var(--text-3); }
.px-factor-total {
  margin: var(--gut) 0 0;
  font-size: var(--fs-1); color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.px-factor-disagree { color: var(--st-failed); font-weight: var(--st-failed-weight); }

/* ---------------------------------------------------------------------- hidden count
   The one component that makes folding a list honest: an exact count, the named groups behind
   it, and a route to all of it. There is no code path here that can print the word "more". */
.px-hidden {
  display: flex; flex-direction: column; gap: 6px;
  padding: var(--pad) var(--pad-lg);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  min-width: 0;
}
.px-hidden-head { margin: 0; overflow-wrap: break-word; }
.px-hidden-count { color: var(--text); font-variant-numeric: tabular-nums; }
.px-hidden-groups {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-wrap: wrap; gap: 3px var(--pad-lg);
  min-width: 0;
}
.px-hidden-group { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.px-hidden-n {
  min-width: 2em; text-align: right;
  color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums;
}
.px-hidden-label { color: var(--text-2); min-width: 0; overflow-wrap: break-word; }
.px-hidden-note { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-1); color: var(--text-3); }
.px-hidden-route { align-self: flex-start; color: var(--text); font-weight: 600; }

/* ---------------------------------------------------------------------- standing explanation
   Only the phone case is styled. On a wide screen StandingNote renders its children and no
   wrapper at all, so there is nothing here for the desk to get wrong. */
.px-standing {
  margin-bottom: var(--gut);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  min-width: 0;
}
.px-standing-sum {
  display: flex; flex-direction: column; gap: 2px;
  justify-content: center;
  min-height: 44px;
  /* var(--pad) both ways, which is the inset the prose inside the fold already carries, so the
     line of counts and the paragraph it stands for start on the same edge. */
  padding: var(--pad);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  /* 1.72 on anything that can hold Chinese -- docs/CATALOGUE.md §14. */
  line-height: 1.72;
  color: var(--text-2);
  cursor: pointer;
  list-style: none;
}
.px-standing-sum::-webkit-details-marker { display: none; }
.px-standing-sum:hover { background: var(--hover); border-radius: var(--radius); }
.px-standing-sum:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.px-standing-counts { color: var(--text); min-width: 0; overflow-wrap: break-word; }
.px-standing-counts b, .px-standing-counts .num { font-variant-numeric: tabular-nums; }
/* The control names what it opens and carries the same caret every other fold in this app uses.
   Not uppercase and not letter-spaced: §14 again, and this line sits beside record titles. */
.px-standing-open { color: var(--accent); font-size: var(--fs-1); font-weight: 600; }
.px-standing-open::after { content: " ▾"; }
.px-standing[open] > .px-standing-sum > .px-standing-open::after { content: " ▴"; }
.px-standing-body { padding: 0 0 var(--gut); }

/* ---------------------------------------------------------------------- a row that expands
   Closed, this has to read as one line in a list of rows -- so it borrows the row's geometry
   exactly: the same fixed severity column, the same gutter, and the same spine at each step of the
   alarm scale, drawn by the same rules -- see the alarm ladder below. A reader must not be able to
   tell that one row in a list folds and another does not until they look for the control.

   THE WHOLE SUMMARY IS THE CONTROL. Not a small caret at the end: on a phone a 12px triangle is a
   target nobody can hit, and the row is already the thing you want to press. */
.px-scan {
  position: relative;
  min-width: 0;
  --px-col-sev: 150px;
  font-family: var(--font-ui);
  font-size: var(--fs-3);
  line-height: var(--lh-body);
  color: var(--text);
  border-radius: var(--radius);
}
/* One hairline between rows, drawn inside the box so a tinted row keeps its full colour. Same
   rule and same exception as .px-row, so a list may mix the two without a seam moving; the
   exception itself is in the alarm ladder below, with the tint it exists for. */
.px-scan + .px-scan, .px-scan + .px-row, .px-row + .px-scan { box-shadow: inset 0 1px 0 var(--border); }

.px-scan-sum {
  display: grid;
  grid-template-columns: var(--px-col-sev) minmax(0, 1fr) fit-content(40%);
  align-items: start;
  column-gap: var(--gut);
  row-gap: 2px;
  min-height: var(--row-h);
  padding: 5px var(--pad);
  border-radius: var(--radius);
  cursor: pointer;
  /* The native triangle sits outside the box and reads as a bullet rather than as part of the
     control, and this row has its own caret in the column that names what opens. */
  list-style: none;
}
.px-scan-sum::-webkit-details-marker { display: none; }
.px-scan-sum > * { min-width: 0; }
.px-scan-sum:hover { background: var(--hover); }
.px-scan-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
  position: relative;
  z-index: 4;
}
.px-scan-sev { display: flex; }
.px-scan-main { display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap; min-width: 0; }
/* THE LEAD MAY SHRINK, AND THAT IS WHAT STOPS THE PAGE SCROLLING SIDEWAYS. It refused to shrink,
   so a lead made of a kind tag plus an origin mark stayed at its full 236px inside a 190px column
   and pushed the document to 421px at a 390px viewport -- measured on Agent runs, in both themes,
   on 15 August 2026. The chip inside already knows how to give way: it is capped at 100% of this
   box and ellipsises its word. Capped against a box that never shrinks, that cap could never bite.
   Shrinking only happens when the lead alone is wider than the line, because the row wraps first. */
.px-scan-lead { flex: 0 1 auto; min-width: 0; }
/* Bare text, and that is the affordance grammar telling the truth: this title does not navigate.
   The route to the record is the first line of the body. */
.px-scan-title { min-width: 0; font-size: var(--fs-3); color: var(--text); overflow-wrap: break-word; }
.px-scan-age {
  grid-column: 3;
  font-size: var(--fs-1); color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}
/* WHAT OPENS, IN WORDS, ON EVERY ROW. It is quiet -- fs-1 in the third text colour -- because
   seven copies of it must not compete with seven titles; it is never absent, because a fold that
   cannot say what it holds is the word "more". It sits under the age on the same right edge. */
.px-scan-open {
  grid-column: 3;
  display: flex; align-items: baseline; justify-content: flex-end; gap: 6px; flex-wrap: wrap;
  font-size: var(--fs-1); color: var(--text-3);
  min-width: 0;
}
.px-scan-opens { min-width: 0; overflow-wrap: break-word; text-align: right; }
.px-scan-opens::after { content: " ▾"; }
.px-scan[open] > .px-scan-sum .px-scan-opens::after { content: " ▴"; }
.px-scan-holds {
  padding-left: 6px;
  border-left: 1px solid var(--border);
  color: var(--text-2); font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.px-scan-sum:hover .px-scan-opens, .px-scan-sum:hover .px-scan-holds { color: var(--text); }
/* The body starts at the title's edge on a desk, so an open row reads as one block rather than as
   a paragraph that lost its row. Reset at the width where the severity column stops being fixed. */
.px-scan-body {
  padding: var(--gut) var(--pad) var(--pad) calc(var(--px-col-sev) + var(--gut) + var(--pad));
  display: flex; flex-direction: column; gap: var(--gut);
  min-width: 0;
}
.px-scan-route { align-self: flex-start; color: var(--text); font-weight: 600; font-size: var(--fs-2); }

/* ---------------------------------------------------------------------- the alarm ladder
   HOW LOUDLY A ROW IS DRAWN, WRITTEN ONCE, FOR BOTH ROW SHAPES.

   NO BACKTICKS IN THIS BLOCK -- it is a template literal, and one closes the string.

   It used to be written three times: here for .px-scan, again above for .px-row, and a third time
   for the older ungated data-severe="1" path, which drew the same picture with no level gate at
   all. Three copies of one ladder is this repository's recurring defect -- change one and there is
   no type error, no failing test and no symptom on the page you were looking at. So the selector
   lists below name both shapes, and data-severe is drawn as what it is: the same picture as the
   raised step. The only asymmetry left is structural rather than stylistic -- a .px-row paints its
   own box, while a .px-scan is a <details> whose summary is the box -- so the tint and the
   left padding land on the .px-scan-sum child and the spine on the element itself.

   THE TINT MEANS SAFETY AND ONLY SAFETY. Every row past its date used to be tinted as well as
   railed, which on the live corpus was four of the top six rows sitting at maximum beside the two
   rows about a person being hurt. The rail still ranks every urgent row; the filled ground is
   spent on the one fact a reader cannot infer from the order.

   The quietest step steps its title down a notch, so an old failure stops competing for the eye. */
.px-row[data-alarm="urgent"], .px-row[data-alarm="raised"], .px-row[data-severe="1"],
.px-scan[data-alarm="urgent"] > .px-scan-sum, .px-scan[data-alarm="raised"] > .px-scan-sum {
  padding-left: calc(var(--pad) + var(--rail));
}
.px-row[data-alarm="urgent"][data-safety="1"],
.px-scan[data-alarm="urgent"][data-safety="1"] > .px-scan-sum {
  background: var(--px-tone-row);
}
/* The hairline between rows follows the tint it was suppressed for: a tinted row would otherwise
   have a line cut across the top of its colour, and an untinted one needs its separator. */
.px-row[data-alarm="urgent"][data-safety="1"] + .px-row,
.px-row + .px-row[data-alarm="urgent"][data-safety="1"],
.px-scan[data-alarm="urgent"][data-safety="1"] + .px-scan,
.px-scan + .px-scan[data-alarm="urgent"][data-safety="1"] {
  box-shadow: none;
}
/* The spine. One shape for every step that has one; the colour is the line below it. */
.px-row[data-alarm="urgent"]::before, .px-row[data-alarm="raised"]::before, .px-row[data-severe="1"]::before,
.px-scan[data-alarm="urgent"]::before, .px-scan[data-alarm="raised"]::before {
  content: "";
  position: absolute; left: 0; top: 1px; bottom: 1px;
  width: var(--rail);
  background: var(--alarm-raised-rail);
  border-radius: var(--radius-sm);
}
/* THE ONE OBJECT ON AN URGENT ROW THAT KEEPS THE ALARM COLOUR, whatever else the row carries. */
.px-row[data-alarm="urgent"]::before, .px-scan[data-alarm="urgent"]::before { background: var(--px-tone); }
.px-row[data-alarm="faded"] .px-row-title, .px-scan[data-alarm="faded"] .px-scan-title { color: var(--text-2); }

/* ---------------------------------------------------------------------- prose on demand
   One line of meaning, and the paragraphs behind a control that says what it opens. Folded at
   EVERY width, which is the whole difference from .px-standing above. */
.px-explain {
  min-width: 0;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  font-family: var(--font-ui);
}
.px-explain-sum {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--gut); flex-wrap: wrap;
  min-height: var(--row-h);
  padding: var(--pad) var(--pad-lg);
  font-size: var(--fs-2);
  /* 1.72 on anything that can hold Chinese -- docs/CATALOGUE.md §14. */
  line-height: 1.72;
  color: var(--text-2);
  cursor: pointer;
  list-style: none;
}
.px-explain-sum::-webkit-details-marker { display: none; }
.px-explain-sum:hover { background: var(--hover); border-radius: var(--radius); }
.px-explain-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius);
}
/* The visible line is a sentence, not a filing card, so it is set at a reading measure and in the
   strong text colour -- it is content, and the control beside it is the furniture. */
.px-explain-meaning { min-width: 0; max-width: var(--measure-in-box); color: var(--text); overflow-wrap: break-word; }
.px-explain-open {
  display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
  min-width: 0;
  color: var(--accent); font-size: var(--fs-1); font-weight: 600;
}
.px-explain-opens::after { content: " ▾"; }
.px-explain[open] > .px-explain-sum .px-explain-opens::after { content: " ▴"; }
.px-explain-holds {
  padding-left: 6px;
  border-left: 1px solid var(--border-strong);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.px-explain-body {
  padding: 0 var(--pad-lg) var(--pad-lg);
  display: flex; flex-direction: column; gap: var(--gut);
  min-width: 0;
}

/* ---------------------------------------------------------------------- data health
   Counts of things that are QUESTIONS rather than work. Compact closed, and each count opens onto
   the whole list behind it -- in place, because these are not a shortened list with a page of
   their own, they are the complete answer to a question nobody has answered yet. */
.px-health {
  display: flex; flex-direction: column; gap: 6px;
  padding: var(--pad) var(--pad-lg);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--panel-2);
  color: var(--text-2);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  min-width: 0;
}
.px-health-head { margin: 0; overflow-wrap: break-word; }
.px-health-total { color: var(--text); font-variant-numeric: tabular-nums; }
/* Content-sized counts that wrap, so closed the whole strip is one line on a desk and three on a
   phone with no breakpoint of its own. An OPEN group takes the full width, which is what stops a
   list of records trying to read inside a third of a column. */
.px-health-strip {
  display: flex; flex-wrap: wrap;
  gap: 6px var(--gut);
  align-items: flex-start;
  min-width: 0;
}
.px-health-group { min-width: 0; max-width: 100%; }
.px-health-group[open] { flex: 1 0 100%; }
.px-health-sum {
  display: flex; align-items: baseline; gap: 8px;
  min-height: var(--row-h);
  padding: 4px var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text-2);
  cursor: pointer;
  list-style: none;
  min-width: 0;
}
.px-health-sum::-webkit-details-marker { display: none; }
.px-health-sum:hover { background: var(--hover); border-color: var(--text-3); color: var(--text); }
.px-health-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
}
.px-health-n {
  flex: none;
  color: var(--text); font-weight: 700; font-size: var(--fs-3);
  font-variant-numeric: tabular-nums;
}
/* No uppercase and no letter-spacing: these labels are sentences about records and may hold
   Chinese -- docs/CATALOGUE.md §14. */
.px-health-label { min-width: 0; overflow-wrap: break-word; }
.px-health-sum .px-health-label::after { content: " ▾"; color: var(--text-3); }
.px-health-group[open] > .px-health-sum .px-health-label::after { content: " ▴"; }
.px-health-body {
  padding: var(--gut) var(--pad) 0;
  display: flex; flex-direction: column; gap: var(--gut);
  min-width: 0;
}
.px-health-note { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-1); color: var(--text-3); }
.px-health-route { align-self: flex-start; color: var(--text); font-weight: 600; font-size: var(--fs-2); }
/* A group with nothing in it. Printed, and drawn as a fact rather than as a control, because a
   disclosure that opens onto nothing is a dead end. It is the count and the name: the zero and the
   missing caret say the rest, and the group's sentence is read where the group has members. */
.px-health-none {
  margin: 0;
  flex: 1 0 100%;
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  padding: 4px var(--pad);
  min-width: 0;
  color: var(--text-3);
}
.px-health-none .px-health-n { color: var(--text-3); font-weight: 600; }
.px-health-lead { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-1); color: var(--text-3); }

/* Narrow: the factor grid stops pretending to be a table and stacks, and a row on the alarm
   scale gives its severity column back to the title. Alignment is worth a lot and it is never
   worth clipping a stored state word to buy. */
@media (max-width: 700px) {
  .px-factor { grid-template-columns: minmax(0, 1fr) auto; }
  .px-factor-track, .px-factor-why { grid-column: 1 / -1; }
}
@container panel (max-width: 400px) {
  .px-row[data-alarm] { grid-template-columns: minmax(0, 1fr); }
  .px-row[data-alarm] .px-row-right { justify-content: flex-start; }
}
@media (max-width: 480px) {
  .px-row[data-alarm] { --px-col-sev: auto; }
  .px-reason-sum { min-height: 44px; }
  /* The severity column stops being fixed, so the body has nothing to line up under and goes back
     to the row's own inset. Alignment is worth a lot and never worth clipping a title to buy. */
  .px-scan-sum { grid-template-columns: minmax(0, 1fr) auto; }
  .px-scan-sev { grid-column: 1 / -1; }
  .px-scan-main { grid-column: 1 / -1; }
  .px-scan-age { grid-column: 1; text-align: left; }
  .px-scan-open { grid-column: 2; }
  .px-scan-body { padding-left: var(--pad); }
  /* The hairline between "what opens" and "how much" is a divider only while the two are on one
     line. At this width they wrap, and a divider at the START of a wrapped line reads as a stray
     mark rather than as a separator, so it comes off and the weight carries the difference. */
  .px-scan-holds, .px-explain-holds { border-left: 0; padding-left: 0; }
}

/* Motion is decoration. Somebody who has asked the operating system to stop it gets a static
   page, not a slower version of the same movement. */
@media (prefers-reduced-motion: reduce) {
  .px-btn, .px-btn:hover, .px-btn:active, .px-btn[data-force="hover"] {
    transform: none; transition: none; box-shadow: var(--button-shadow);
  }
}

/* Phones: every target reaches 44px, and inputs reach the size below which mobile browsers
   zoom the page on focus. Nothing is hover-only, so nothing is lost with no pointer. */
@media (max-width: 480px) {
  .px-btn, .px-input, .px-select, .px-chip-btn, .px-menu-item { min-height: 44px; }
  .px-btn[data-size="sm"] { min-height: 44px; }
  .px-input, .px-select { font-size: var(--fs-4); }
  .px-row { row-gap: 4px; }
  /* Every disclosure is a real target, and a summary is a target with no button inside it to
     inherit a size from, so each one is given the 44px floor by name. */
  .px-scan-sum, .px-explain-sum, .px-health-sum { min-height: 44px; }
}
/* Below the two-column breakpoint the severity column stops being fixed: alignment is worth a
   lot, but never worth clipping a title to buy it. */
@container panel (max-width: 340px) {
  .px-row { grid-template-columns: minmax(0, 1fr); }
  .px-row-right { justify-content: flex-start; }
  /* The chip fills its column so that a stack of them has one edge. With the column gone there
     is no edge to hold, and a full-width chip would read as a bar rather than a label. */
  .px-chip-btn { width: auto; }
}
`

const STYLE_ID = 'mole-office-ui-css'

/**
 * Inject the stylesheet once, on first import.
 *
 * The document check is not a fallback: it is how the same module is imported by the test
 * runner, which has no DOM and needs none, since the tests read the CSS text directly.
 */
function installUIStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = UI_CSS
  document.head.append(el)
}

installUIStyles()

/**
 * True when tokens.css has actually loaded. Used by the component sheet to say so loudly rather
 * than render an unreadable page that looks like a component bug.
 */
export function tokensLoaded(): boolean {
  if (typeof window === 'undefined') return false
  return getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() !== ''
}

// ============================================================================ the component sheet

/**
 * The five axes the sheet can switch, as the attribute values <html> really takes.
 *
 * DERIVED FROM PresetBar, which owns the vocabulary the real app writes. Every list here was
 * typed out here as a second copy, so an eighth palette added to tokens.css and to the preset
 * bar would have been missing from the one page whose whole job is showing every component under
 * every palette — and nothing would have said so.
 *
 * The theme list keeps Light and Dark only, and drops two kinds of choice the bar has. `auto` is the
 * ABSENCE of a data-theme attribute, not a value it can hold, so it is a choice in the bar and not a
 * setting on this sheet. The six themes the office ships are dropped too, because SHEET_PRESET_VALUES
 * has no words for them. A person's own themes are not in THEME_CHOICES at all.
 */
const PRESETS = {
  'data-theme': THEME_CHOICES.filter((t) => t === 'light' || t === 'dark'),
  'data-density': DENSITY_CHOICES,
  'data-radius': RADIUS_CHOICES,
  'data-font': FONT_CHOICES,
  // `default` is kept here although the real app writes it as the ABSENCE of the attribute,
  // because data-size="default" matches neither text-size rule and so leaves the root at the
  // browser's own base size — the same result, by the same stylesheet. Theme's `auto` is not
  // like that: it would match no palette block and strand the sheet on the light palette.
  'data-size': SIZE_CHOICES,
} satisfies Record<string, readonly string[]>

type PresetKey = keyof typeof PRESETS

const SHEET_PRESET_NAMES = {
  "data-theme": "sheet.preset.theme",
  "data-density": "sheet.preset.density",
  "data-radius": "sheet.preset.radius",
  "data-font": "sheet.preset.font",
  "data-size": "sheet.preset.size"
} as const satisfies Record<PresetKey, WordKey>
const SHEET_PRESET_VALUES = {
  "light": "sheet.preset.light",
  "dark": "sheet.preset.dark",
  "compact": "sheet.preset.compact",
  "default": "sheet.preset.default",
  "comfortable": "sheet.preset.comfortable",
  "sharp": "sheet.preset.sharp",
  "soft": "sheet.preset.soft",
  "ui": "sheet.preset.ui",
  "mono": "sheet.preset.mono",
  "read": "sheet.preset.read",
  "small": "sheet.preset.small",
  "large": "sheet.preset.large"
} as const satisfies Record<(typeof PRESETS)[PresetKey][number], WordKey>

function PresetBar() {
  const [, force] = useState(0)
  // A list that came back empty would mean the vocabulary above is empty, which is a bug worth
  // seeing rather than a blank control: `?? ''` here would draw a select with nothing chosen.
  const first = (key: PresetKey): string => {
    const value = PRESETS[key][0]
    if (value === undefined) throw new Error(`the component sheet has no values for ${key}`)
    return value
  }
  const read = (key: PresetKey): string => document.documentElement.getAttribute(key) ?? first(key)
  const set = (key: PresetKey, value: string) => {
    document.documentElement.setAttribute(key, value)
    force((n) => n + 1)
  }
  return (
    <div className="px-sheet-bar">
      {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
        <Field key={key} label={t(SHEET_PRESET_NAMES[key])}>
          <Select
            value={read(key)}
            options={PRESETS[key].map((v) => ({ value: v as string, label: t(SHEET_PRESET_VALUES[v]) }))}
            onChange={(v) => set(key, v)}
          />
        </Field>
      ))}
    </div>
  )
}

function Sec({ n, title, note, children }: { n: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="px-sheet-sec">
      <h3 className="px-sheet-h">
        <span className="px-sheet-n">{n}</span> {title}
      </h3>
      <p className="px-sheet-note">{note}</p>
      <div className="px-sheet-body">{children}</div>
    </section>
  )
}

function Bar({ children }: { children: React.ReactNode }) {
  return <div className="px-sheet-strip">{children}</div>
}

/** Made-up records show long sentences, mixed scripts and several shapes of detail. */
/**
 * Every component in every state, on one page, so it can be screenshotted and looked at.
 *
 * The `force` props are the reason this exists as a component rather than a folder of stories:
 * a screenshot cannot press a button or hold a hover, so hover and focus are rendered as
 * declared states beside their resting versions. What you see here is what the CSS says, not
 * what the photographer managed to catch.
 */
export function ComponentSheet() {
  const chinese = createI18n('zh').t
  const ESTOP_BECAUSE =
    t('sheet.itsStateWordIsOpenWhichMeansTheWork')

  const ESTOP_FACTORS: RankFactor[] = [
    {
      name: 'harm',
      points: 40,
      why: t('sheet.aPersonCouldBeHurtTheScannerArmKeeps'),
    },
    { name: 'standing', points: 5, why: t('sheet.1LiveRecordStandsBehindItImplementTheScanner') },
    {
      name: 'sat',
      points: 15,
      why: t('sheet.theLastThingRecordedAboutItWas202607'),
    },
  ]

  const REPORT_BECAUSE =
    t('sheet.theArchiveReviewIsWaitingForThisAndThe')

  const REPORT_FACTORS: RankFactor[] = [
    { name: 'harm', points: 30, why: t('sheet.outsideIsHurtIfThisIsLeftTheReview') },
    { name: 'owed', points: 35, why: t('sheet.theArchiveReviewIsWaitingForThis') },
    { name: 'late', points: 25, why: t('sheet.theDateAgreedWas20260803AndIt') },
    {
      name: 'standing',
      points: 10,
      why: t('sheet.2LiveRecordsStandBehindIt4132'),
    },
    { name: 'sat', points: 3, why: t('sheet.theLastThingRecordedAboutItWas202608') },
  ]

  const CJK_BECAUSE =
    t('sheet.rinSGroupIsWaitingForThisAndThe')

  const CJK_FACTORS: RankFactor[] = [
    { name: 'harm', points: 30, why: t('sheet.outsideIsHurtIfThisIsLeft') },
    { name: 'owed', points: 35, why: t('sheet.rinSGroupIsWaitingForThis') },
    { name: 'late', points: 16, why: t('sheet.theDateAgreedWas20260806AndIt') },
    { name: 'standing', points: 0, why: t('sheet.nothingRecordedStandsBehindIt') },
    {
      name: 'sat',
      points: 15,
      why: t('sheet.theLastThingRecordedAboutItWas2026072'),
    },
  ]

  /**
   * One row per alarm level, so the four can be compared side by side at the same size.
   *
   * The kind of number matters as much as the level: only the top one here is a date somebody agreed
   * and missed, and it is the only number in the strip drawn in the overdue colour.
   */
  const ALARM_DEMO: Readonly<Record<AlarmLevel, { word: string; count: string; countKind: CountKind }>> = {
    urgent: { word: 'open', count: t('sheet.6DaysLate'), countKind: 'late' },
    raised: { word: 'failed', count: t('sheet.underADay'), countKind: 'age' },
    plain: { word: 'blocked', count: t('sheet.4Days'), countKind: 'age' },
    faded: { word: 'failed', count: t('sheet.13Days'), countKind: 'age' },
  }

  /**
   * Six of the ten words THIS INTERFACE computes, each carrying a level.
   *
   * This is the list the surface-emphasis rule was written for: an analytical surface has six of
   * these arriving at once, several carrying an age-derived level, and at the perceptual emphasis
   * they come out as the same grey.
   *
   * IT USED TO CARRY THE SIX SESSION WORDS, borrowed onto these chips through a map in
   * SessionPanel.tsx. That map is deleted: a session state is a word on a record, and a word on a
   * record is drawn by StoredState now, on every page, with no page's own drawing in front of it.
   * The emphasis rule is untouched and still applies to every chip that is NOT a stored word, which
   * is what these six are.
   */
  const EMPHASIS_DEMO: readonly { state: PanelState; alarm: AlarmLevel }[] = [
    { state: 'running', alarm: 'plain' },
    { state: 'todo', alarm: 'raised' },
    { state: 'done', alarm: 'faded' },
    { state: 'crashed', alarm: 'raised' },
    { state: 'overdue', alarm: 'plain' },
    { state: 'inferred', alarm: 'faded' },
  ]

  /**
   * Four stored words off the records list, and the case the `warning` family exists to protect.
   *
   * None of these is a fault. Three of them stopped short, which is ordinary for a problem, a session
   * and a purchase, and drawing a catalogue of them in the alarm colour is the reading the red budget
   * removed. The last one carries no level at all, which is the one row an analytical surface changes.
   */
  const WARNING_DEMO: readonly { word: string; progress: Progress; alarm?: AlarmLevel }[] = [
    { word: 'open', progress: 'stopped_short', alarm: 'raised' },
    { word: 'chasing', progress: 'stopped_short', alarm: 'plain' },
    { word: 'idle', progress: 'stopped_short', alarm: 'faded' },
    { word: 'active', progress: 'in_flight' },
    { word: 'arrived', progress: 'finished' },
    { word: 'open', progress: 'stopped_short' },
  ]

  /**
   * One word per drawing, in the order the alphabet is written in.
   *
   * The progress beside each is what the server really classifies that word as, so the sheet shows
   * the two channels disagreeing where they genuinely do: `open` classifies as stopped short and is
   * drawn as work somebody is on, because that is what a person does about a problem in state `open`.
   */
  const ALPHABET_DEMO: readonly { state: string; progress: Progress }[] = [
    { state: 'idle', progress: 'stopped_short' },
    { state: 'todo', progress: 'not_started' },
    { state: 'open', progress: 'stopped_short' },
    { state: 'blocked', progress: 'stopped_short' },
    { state: 'crashed', progress: 'stopped_short' },
    { state: 'done', progress: 'finished' },
    { state: 'dropped', progress: 'finished' },
    { state: 'gnawing', progress: 'unclassified' },
  ]

  /** Eleven words the records really carry, including the three no fixed vocabulary could hold. */
  const STORED_DEMO: readonly { state: string | null; progress: Progress | null; title: string; right: string }[] = [
    { state: 'idle', progress: 'stopped_short', title: t('sheet.archiveScanAndCatalogueAskedAQuestion47Minutes'), right: t('sheet.47m') },
    { state: 'open', progress: 'stopped_short', title: t('sheet.theArchiveSearchStillMissesLabelsWrittenInPencil'), right: t('sheet.4d') },
    { state: 'crashed', progress: 'stopped_short', title: t('sheet.catalogueLabelReadingRun'), right: t('sheet.12m') },
    { state: 'ran', progress: 'in_flight', title: t('sheet.archiveLookupDepthLadderAtRan'), right: t('sheet.2d') },
    { state: 'todo', progress: 'not_started', title: t('sheet.writeUpTheReadingResults'), right: '—' },
    { state: 'done', progress: 'finished', title: t('sheet.shelfNumberMismatch'), right: t('sheet.6h') },
    { state: 'paused', progress: 'paused', title: t('sheet.returnTheBorrowedScannerPutDownOn202608'), right: t('sheet.8d') },
    { state: 'unknown', progress: 'unknown', title: t('sheet.runA17TheReaderLookedAndCouldNotTell'), right: t('sheet.3d') },
    { state: 'fixed', progress: 'unclassified', title: t('sheet.theArchivePrinterAddressChangedAfterTheSwitchSwap'), right: t('sheet.9d') },
    { state: '重印中', progress: 'unclassified', title: t('sheet.41320Cm'), right: t('sheet.1d') },
    { state: null, progress: null, title: t('sheet.catalogueCheck'), right: t('sheet.2h') },
  ]


  const [itemState, setItemState] = useState<ItemState>('doing')
  const [text, setText] = useState(t('sheet.shelf12ReadingReport'))
  const [bad, setBad] = useState(t('sheet.shelf12ReadingRepor'))
  const [kind, setKind] = useState<string>('module')
  const [saved, setSaved] = useState(0)

  return (
    <div className="px-sheet">
      <header className="px-sheet-head">
        <h1 className="px-sheet-title">{t('nav.sheet')}</h1>
        <p className="px-sheet-lead">{t('sheet.oneComponentTreeDrivenByTokensEnclosedItWrites')}</p>
        {/*
          THE RULE THE EMPTY, INCOMPLETE, UNCLASSIFIED AND NO-STATE MARKS ALL COME OUT OF.
          It sits in the header, beside the affordance rules, because it is the same class of
          statement — one line that governs how every mark further down is read — and because a
          reader meets it before the first mark rather than beside only one of them. It names no
          section number on purpose: a numbered cross-reference would be a second copy of the
          section order, kept in step by hand, and renumbering a section would quietly make this
          sentence wrong.
        */}
        <p className="px-sheet-rule">{t('sheet.moleOfficeShowsUnknownOrIncompleteWhenItCannot')}</p>
        <PresetBar />
        {tokensLoaded() ? null : (
          <ErrorNote message={t('sheet.tokensCssHasNotLoadedPanelIsUndefinedOn')} />
        )}
      </header>

      <Sec
        n="1"
        title={t('sheet.threeClassesOfPixel')}
        note={t('sheet.theAffordanceLadderNothingBelowRevealsItselfOnHover')}
      >
        <Bar>
          <span>{t('sheet.inertTextNoBoxNoUnderlineNoPointer')}</span>
        </Bar>
        <Bar>
          <a className="px-nav" href="#/">{t('sheet.navigational')}</a>
          <span className="px-sheet-said">{t('sheet.1pxUnderlineAtRest2pxOnHover')}</span>
        </Bar>
        <Bar>
          <Btn onClick={() => setSaved((n) => n + 1)}>{t('sheet.actionable')}</Btn>
          <span className="px-sheet-said">{t('sheet.press.count', { n: saved })}</span>
        </Bar>
        <Bar>
          <Tag kind="module" />
          <StateChip state="done" />
          <span className="px-sheet-said">{t('sheet.decorationNoEnclosureDefaultCursor')}</span>
        </Bar>
      </Sec>

      <Sec n="2" title={t('sheet.panelsThreeRanks')} note={t('sheet.rank0AlarmRank1NormalRank2Quiet')}>
        <div className="px-sheet-cols">
          <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.owedAndBroken')} kind={t('sheet.panel.alarm')} rank={0} actions={<Btn size="sm">{t('sheet.openAll')}</Btn>}>
            <Row state="overdue" title={t('sheet.returnTheBorrowedDeskLamp')} meta={t('sheet.due4DaysAgo')} right={t('sheet.4d')} href="#/" />
            <Row state="broken" title={t('sheet.runTheArchiveIndexWizard')} meta={t('sheet.consumesAClaimThatWasDeleted')} href="#/" />
            <Row state="failed" title={t('sheet.reprintTheLabelAtSize15')} meta={t('sheet.jammedThePrinter')} href="#/" />
          </Panel>
          <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.inFlight')} kind={kindWord('session').text} rank={1} actions={<Btn size="sm" variant="ghost">{t('sheet.hide')}</Btn>}>
            <Row state="running" title={t('sheet.archiveScanAndCatalogue')} meta={t('sheet.streamConnected3sAgo')} href="#/" />
            <Row state="doing" title={t('sheet.fitThePagereaderMiniIntoTheDeskStand')} right={t('sheet.1h')} href="#/" />
            <Row state="todo" title={t('sheet.writeTheCatalogueNote')} right="—" href="#/" />
          </Panel>
          <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.recentlySettled')} kind={t('sheet.panel.log')} rank={2}>
            <Row state="done" title={t('sheet.shelfNumberMismatch')} meta={t('sheet.axis374354')} href="#/" />
            <Row state="inferred" title={t('sheet.deskCameraReadsCatalogueLabels')} meta={t('sheet.workedOutFromThePipelineUnreviewed')} href="#/" />
          </Panel>
        </div>
      </Sec>

      <Sec
        n="3"
        title={t('sheet.severityIsAFixedColumn')}
        note={t('sheet.everyRowReservesTheSameLeftColumnWhetherOr')}
      >
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.rowsWithMixedStates')} rank={1}>
          <Row state="done" title={t('sheet.scannerStandPrintedAndFitted')} right={t('sheet.6h')} href="#/" />
          <Row state="failed" title={t('sheet.size15JammedThePrinterNeedsAReprint')} meta={t('sheet.failed2DaysAgo')} right={t('sheet.3h')} href="#/" />
          <Row state="doing" title={t('sheet.deskStandForThePagereaderMini')} right={t('sheet.1h')} href="#/" />
          <Row state="blocked" title={t('sheet.calibrateThePageScanner')} meta={t('sheet.blockedByTheMountIsNotPrinted')} right="—" href="#/" />
          <Row state="todo" title={t('sheet.writeUpTheReadingResults')} right="—" href="#/" />
          <Row state="crashed" title={t('sheet.catalogueLabelReadingRun')} meta={t('sheet.exited137OutOfMemory')} right={t('sheet.12m')} href="#/" />
          <Row state="done" title={t('sheet.archivePrinterAddressFix')} right={t('sheet.2h')} href="#/" />
          <Row state="overdue" title={t('sheet.orderTheSecondPagereaderMini')} meta={t('sheet.promised6DaysAgo')} right="—" href="#/" />
          <Row title={t('sheet.aRowWithNoStateAtAllTheColumn')} right="—" href="#/" />
          <Row state="broken" title={t('sheet.labelReadingClaimDeletedRecord')} meta={t('sheet.theLinkIsKeptAndShownNeverHidden')} right="—" href="#/" />
        </Panel>
      </Sec>

      <Sec
        n="4"
        title={t('sheet.statesWordShapeColour')}
        note={t('sheet.tenSilhouettesAllDifferentSwitchDataThemeToMono')}
      >
        <Bar>
          {PANEL_STATES.map((s) => (
            <StateChip key={s} state={s} />
          ))}
        </Bar>
        <Bar>
          <StateChip state="overdue" label={t('sheet.overdue4d')} />
          <StateChip state="failed" label={t('sheet.2Stuck')} />
          <StateChip state="inferred" label={t('sheet.unreviewed')} />
          <span className="px-sheet-said">{t('sheet.aStateMayCarryANumberInsteadOfIts')}</span>
        </Bar>
      </Sec>

      <Sec
        n="5"
        title={t('sheet.stateChipTheMenuAnd15')}
        note={t('sheet.focusTheChipAndPress1ToDo2')}
      >
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.part1ScannerStand')} rank={1}>
          <Row
            state={itemState}
            onStateChange={setItemState}
            title={t('sheet.reprintPage3AtSize12')}
            meta={t('sheet.currentState', { state: stateWord(itemState).text })}
            right={t('sheet.1h')}
          />
          <Row state="todo" onStateChange={() => undefined} title={t('sheet.fitTheScannerStandScrews')} right="—" />
        </Panel>
        <Bar>
          <StateChip state="doing" onChange={() => undefined} force="hover" />
          <span className="px-sheet-said">{t('sheet.hover')}</span>
          <StateChip state="failed" onChange={() => undefined} force="focus" />
          <span className="px-sheet-said">{t('sheet.focus')}</span>
          <StateChip state="done" onChange={() => undefined} readOnly />
          <span className="px-sheet-said">{t('sheet.readOnlyALabelNotAControl')}</span>
        </Bar>
      </Sec>

      <Sec n="6" title={t('sheet.buttonsEveryState')} note={t('sheet.disabledStaysFocusableAndStatesItsReasonWhenPressed')}>
        <Bar>
          <Btn variant="primary">{t('sheet.primary')}</Btn>
          <Btn variant="secondary">{t('sheet.secondary')}</Btn>
          <Btn variant="danger">{t('sheet.unlink')}</Btn>
          <Btn variant="ghost">{t('sheet.ghost')}</Btn>
        </Bar>
        <Bar>
          <Btn variant="primary" force="hover">{t('sheet.primaryHover')}</Btn>
          <Btn force="hover">{t('sheet.hover2')}</Btn>
          <Btn force="focus">{t('sheet.focus2')}</Btn>
          <Btn pending>{t('sheet.saving')}</Btn>
          <Btn disabled reason={t('sheet.addLinkNeedsATitleFirst')}>{t('sheet.disabledPressMe')}</Btn>
        </Bar>
        <Bar>
          <Btn size="sm" variant="primary">{t('sheet.smallPrimary')}</Btn>
          <Btn size="sm">{t('sheet.small')}</Btn>
          <Btn size="sm" variant="danger">{t('sheet.smallDanger')}</Btn>
          <Btn size="sm" variant="ghost">{t('sheet.smallGhost')}</Btn>
        </Bar>
      </Sec>

      <Sec
        n="7"
        title={t('sheet.tags')}
        note={t('sheet.whatKindOfThingThisIsDrawnByFamily')}
      >
        <Bar>
          <Tag kind="task" />
          <Tag kind="module" />
          <Tag kind="decision" />
          <Tag kind="claim" />
          <Tag kind="wanna_try" />
          <Tag kind="session" />
          <Tag kind="mystery" />
        </Bar>
        <Bar>
          {(Object.keys(KIND_FAMILIES) as KindFamily[]).map((family) => (
            <FamilyTag key={family} family={family} />
          ))}
        </Bar>
        <Bar>
          <Tag tone="accent">{t('sheet.selected')}</Tag>
          <Tag tone="quiet">{t('sheet.12Links')}</Tag>
          <Tag tone="alarm">{t('sheet.2Blocked')}</Tag>
          <Tag tone="ask">{t('sheet.3OptionsOneSuggested')}</Tag>
        </Bar>
      </Sec>

      <Sec
        n="7b"
        title={t('sheet.howMuchIsDone')}
        note={t('sheet.oneStripAndTheExactCountEveryStripIs')}
      >
        <Bar>
          <Completion
            parts={[
              { key: 'a', name: t('sheet.calibrateTheScanner'), state: 'done' },
              { key: 'b', name: t('sheet.recordThePageCollection'), state: 'done' },
              { key: 'c', name: t('sheet.checkTheReadingRules'), state: 'doing' },
              { key: 'd', name: t('sheet.measureAtTheDesk'), state: 'todo' },
              { key: 'e', name: t('sheet.writeItUp'), state: 'todo' },
            ]}
          />
          <Completion
            parts={[
              { key: 'a', name: t('sheet.mountTheScanner'), state: 'done' },
              { key: 'b', name: t('sheet.readTheSerialPort'), state: 'failed' },
              { key: 'c', name: t('sheet.publishTheFrames'), state: 'blocked' },
            ]}
          />
        </Bar>
      </Sec>

      <Sec
        n="8"
        title={t('sheet.fieldsAndInputs')}
        note={t('sheet.labelHintAndErrorAreWiredToTheControl')}
      >
        <div className="px-sheet-cols">
          <Field label={t('sheet.title')} hint={t('sheet.typingATitleIsHowYouLink')}>
            <TextInput value={text} onChange={setText} />
          </Field>
          <Field label={t('sheet.title')} error={t('sheet.noRecordTitled', { title: bad })}>
            <TextInput value={bad} onChange={setBad} />
          </Field>
          <Field label={t('sheet.kind')}>
            <Select
              value={kind}
              onChange={setKind}
              options={RECORD_KINDS.map((k) => ({ value: k as string, label: kindWord(k).text }))}
            />
          </Field>
          <Field label={t('sheet.reportPath')} hint={t('sheet.staysInTheProjectDirectoryMoleOfficeOnlyPoints')} optional>
            <TextInput value={t('sheet.exampleLanternArchiveReportMd')} onChange={() => undefined} mono />
          </Field>
        </div>
        <Bar>
          <TextInput value={t('sheet.hover')} onChange={() => undefined} force="hover" />
          <TextInput value={t('sheet.focus')} onChange={() => undefined} force="focus" />
        </Bar>
      </Sec>

      <Sec
        n="9"
        title={t('sheet.absenceAtThreeWeights')}
        note={t('sheet.oneTestDecidesTheWeightDoesTheReaderHave')}
      >
        <Bar>
          <span className="px-sheet-note">{t('sheet.ordinaryNoWordGiven')}</span>
          <Absence title={t('sheet.nobodyHasGivenThisWorkAnEstimate')} />
          <span className="px-sheet-note">{t('sheet.ordinaryWithAWord')}</span>
          <Absence word={t('sheet.absence.notSized')} title={t('sheet.nobodyHasSaidHowLongThisTakes')} />
        </Bar>
        <Bar>
          <span className="px-sheet-note">{t('sheet.nobodyLooked')}</span>
          <Absence tier="told-apart" looked={false} title={t('sheet.nobodyHasLookedForProcessesThatNoAgentRun')} />
          <span className="px-sheet-note">{t('sheet.thereAreNone')}</span>
          <Absence tier="told-apart" looked title={t('sheet.theSweepRanAndFoundNoProcessThatNo')} />
          <span className="px-sheet-note">{t('sheet.theReaderSOwnWord')}</span>
          <Absence tier="told-apart" looked={false} word={t('sheet.absence.notSet')} title={t('sheet.notTheSameAsNoHours', { absence: hoursNotSaid(t('schedule.todayLower')) })} />
        </Bar>
        <Absence
          tier="must-act-on"
          sentence={t('sheet.nobodyHasSizedAnyOfThisWorkSoThere')}
          action={<Btn size="sm">{t('sheet.giveOneAnEstimate')}</Btn>}
        />
      </Sec>

      <Sec
        n="9b"
        title={t('sheet.emptyErrorLoading')}
        note={t('sheet.fourDifferentEmptyMessagesNeverOneNoResultsEmpty')}
      >
        <Empty message={t('sheet.noRecordsYetCreateOneToStart')} action={<Btn variant="primary" size="sm">{t('sheet.newRecord')}</Btn>} />
        <Empty message={t('sheet.noRecordMatchesPageReader42Loaded')} action={<Btn size="sm">{t('sheet.clearFilter')}</Btn>} />
        <Empty message={t('sheet.2FailedItemsAreHiddenByThisFilter')} action={<Btn size="sm">{t('sheet.showThem')}</Btn>} />
        <ErrorNote message={t('sheet.cannotReachTheMoleOfficeServer')} retry={() => undefined} />
        <ErrorNote message={t('sheet.recordAbc123HasBeenDeleted')} />
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.loadingAList')} rank={2}>
          <Loading label={t('sheet.records')} />
        </Panel>
      </Sec>

      <Sec
        n="10"
        title={t('sheet.incompleteIsNotBroken')}
        note={t('sheet.bothAreOnThisPageAtOnceSoThey')}
      >
        <ErrorNote message={t('sheet.partsIsPresentButIsNotAListPart')} />
        <Incomplete
          what={kindWord('module').text}
          items={[
            {
              path: 'data.context',
              message: t('sheet.dataContextIsNotFilledInSoThisModule'),
            },
            {
              path: 'data.parts',
              message:
                t('sheet.dataPartsIsNotFilledInSoThisModule'),
            },
          ]}
        />
        <Bar>
          <IncompleteMark count={2} what={kindWord('module').text} />
          <span className="px-sheet-said">{t('sheet.theMarkerAListRowOrALinkCarries')}</span>
          <IncompleteMark count={1} what={kindWord('claim').text} />
          <StateChip state="failed" />
          <span className="px-sheet-said">{t('sheet.aFailureForComparisonHeavierAlarmColoured')}</span>
        </Bar>
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.aListWithOneStubInIt')} kind={t('sheet.records')} rank={1}>
          <Row leading={<Tag kind="module" />} title={t('sheet.catalogueCheck')} right={t('sheet.2h')} href="#/" />
          <Row
            leading={
              <span className="px-sheet-strip">
                <Tag kind="module" />
                <IncompleteMark count={2} what={kindWord('module').text} />
              </span>
            }
            title={t('sheet.pageScannerStand')}
            meta={t('sheet.filedWhenTheWorkStartedContextAndPartsStill')}
            right="—"
            href="#/"
          />
          <Row leading={<Tag kind="claim" />} title={t('sheet.printedLabelsReadMoreClearlyThanPencilPast20')} right={t('sheet.1d')} href="#/" />
        </Panel>
      </Sec>

      <Sec
        n="11"
        title={t('sheet.mixedScriptAndLongText')}
        note={t('sheet.andEnglishMustSitOnOneLineAtThe')}
      >
        <Panel declares={{ surface: null }} title={t('sheet.catalogueCheck')} kind={kindWord('module').text} rank={1}>
          <Row state="doing" title={t('sheet.atShelf12CataloguePageCheck')} right={t('sheet.2h')} href="#/" />
          <Row
            state="failed"
            title={t('sheet.aTitleLongEnoughToProveThatWrappingWorks')}
            meta={t('sheet.theRowGrowsThePageNeverScrollsSideways')}
            right="—"
            href="#/"
          />
          <Row leading={<Tag kind="claim" />} title={t('sheet.printedLabelsReadMoreClearlyThanPencilPast20')} meta={t('sheet.noEvidenceLinked')} right="—" href="#/" />
        </Panel>
      </Sec>
      <Sec
        n="12"
        title={t('sheet.rankByImportanceAndSayWhy')}
        note={t('sheet.everyRowOnTheAttentionListCarriesItsOwn')}
      >
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.whatNeedsMeToday')} kind={t('sheet.panel.shown')} rank={0} tone="failed">
          <Row
            sev={<StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.21Days')} />}
            alarm="urgent"
            title={t('sheet.theStopButtonInTheScannerDemoDoesNothing')}
            leading={<Tag kind="problem" />}
            right={t('sheet.rank1')}
            href="#/"
            meta={
              <ReasonLine
                safetyFloor
                score={60}
                because={ESTOP_BECAUSE}
                factors={ESTOP_FACTORS}
              />
            }
          />
          <Row
            sev={<StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.6DaysLate')} countKind="late" />}
            alarm="urgent"
            title={t('sheet.archiveReportScannerReadingSection')}
            leading={<Tag kind="obligation" />}
            right={t('sheet.rank3')}
            href="#/"
            meta={<ReasonLine score={103} because={REPORT_BECAUSE} factors={REPORT_FACTORS} open />}
          />
          <Row
            sev={<StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.3DaysLate')} countKind="late" />}
            alarm="urgent"
            title={t('sheet.pagereaderMini')}
            leading={<Tag kind="obligation" />}
            right={t('sheet.rank4')}
            href="#/"
            meta={<ReasonLine score={96} because={CJK_BECAUSE} factors={CJK_FACTORS} />}
          />
        </Panel>
        <Bar>
          <span className="px-sheet-said">{t('sheet.aSafetyRowSitsAboveARowScoring103')}</span>
        </Bar>
      </Sec>

      <Sec
        n="13"
        title={t('sheet.anAlarmScaleWithRoomInIt')}
        note={t('sheet.fourLevelsAndAtMostOneStrongRedObject')}
      >
        <Bar>
          {ALARM_LEVELS.map((level) => (
            <StoredState
              key={level}
              state={ALARM_DEMO[level].word}
              progress="stopped_short"
              alarm={level}
              count={ALARM_DEMO[level].count}
              countKind={ALARM_DEMO[level].countKind}
            />
          ))}
        </Bar>
        <ul className="px-sheet-defs">
          {ALARM_LEVELS.map((level) => (
            <li key={level}>
              <code>{t(({ 'urgent': 'sheet.alarmCode.urgent', 'raised': 'sheet.alarmCode.raised', 'plain': 'sheet.alarmCode.plain', 'faded': 'sheet.alarmCode.faded' } satisfies Record<AlarmLevel, WordKey>)[level])}</code> {ALARM_NOTES[level]}
            </li>
          ))}
        </ul>
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.theSameListAtFourWeights')} rank={1}>
          <Row
            sev={<StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.6DaysLate')} countKind="late" />}
            alarm="urgent"
            title={t('sheet.archiveReportScannerReadingSection')}
            meta={t('sheet.aDateSomebodyAgreedHasPassed')}
            right="103"
            href="#/"
          />
          <Row
            sev={<StoredState state="failed" progress="stopped_short" alarm="raised" count={t('sheet.underADay')} />}
            alarm="raised"
            title={t('sheet.runThePagereaderAndTheShelfcamOnTheSame')}
            meta={t('sheet.itStoppedShortThisMorningSoItIsStill')}
            right="15"
            href="#/"
          />
          <Row
            sev={<StoredState state="open" progress="stopped_short" alarm="plain" count={t('sheet.4Days')} />}
            alarm="plain"
            title={t('sheet.theArchiveSearchStillMissesLabelsWrittenInPencil')}
            meta={t('sheet.stoppedShortNoDateInvolvedNeitherFreshNorOld')}
            right="43"
            href="#/"
          />
          <Row
            sev={<StoredState state="failed" progress="stopped_short" alarm="faded" count={t('sheet.13Days')} />}
            alarm="faded"
            title={t('sheet.41320CmJammedThePrinter')}
            meta={t('sheet.thirteenDaysOldAndUnchangedQuieterOnPurposeAnd')}
            right="13"
            href="#/"
          />
        </Panel>
        <Bar>
          <StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.2DaysLate')} countKind="late" />
          <StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.5DaysLate')} countKind="late" />
          <StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.18DaysLate')} countKind="late" />
          <span className="px-sheet-said">{t('sheet.oneColourThreeNumbersEscalationAboveTheTopOf')}</span>
        </Bar>
        <Bar>
          <SafetyFloorMark />
          <span className="px-sheet-said">{t('sheet.safetySitsAtTheTopStepAndGetsNo')}</span>
        </Bar>
      </Sec>

      <Sec
        n="14"
        title={t('sheet.howMuchIsHiddenExactly')}
        note={t('sheet.usedByEveryShortenedListInTheProductIt')}
      >
        <HiddenCount
          shown={7}
          total={61}
          what={t('sheet.rows')}
          href="#/records"
          note={t('sheet.threeOfTheseWereHeldBackByTheGroup')}
          groups={[
            { label: t('sheet.thingsThatHappenedAndStoppedShort'), count: 19, href: '#/sessions' },
            { label: t('sheet.checklistItemsThatStoppedShort'), count: 14 },
            { label: t('sheet.pipelineStepsThatStoppedShort'), count: 8 },
            { label: t('sheet.owedToSomebodyOutside'), count: 7 },
            { label: t('sheet.workThatStoppedShort'), count: 6 },
          ]}
        />
        <HiddenCount
          shown={4}
          total={26}
          what={t('sheet.thingsTheMachineIsHolding')}
          href="#/sessions"
          linkText={t('sheet.openTheMachineSweep')}
          groups={[
            { label: t('sheet.processesNoRecordedSessionClaims'), count: 11 },
            { label: t('sheet.portsHeld'), count: 7 },
            { label: t('sheet.containers'), count: 3 },
            { label: t('sheet.aGpuHeldByASimulator'), count: 1 },
          ]}
        />
        <HiddenCount shown={6} total={6} what={t('sheet.pausedRecords')} href="#/records" />
        <Bar>
          <span className="px-sheet-said">{t('sheet.nothingHiddenIsStillAnAnswerAndItIs')}</span>
        </Bar>
      </Sec>

      <Sec
        n="15"
        title={t('sheet.marksForTheNewSemantics')}
        note={t('sheet.sevenFactsARowCanCarryBeyondItsState')}
      >
        <p className="px-sheet-sub">{t('sheet.whoIsHurtAsStoredNeverReadOffA')}</p>
        <Bar>
          <ConsequenceMark consequence={{ bearer: 'person', what: t('sheet.theScannerArmKeepsMovingAfterTheStopButton') }} />
          <ConsequenceMark consequence={{ bearer: 'outside', what: t('sheet.theReviewHasNothingToAssess') }} />
          <ConsequenceMark consequence={{ bearer: 'property', what: t('sheet.theScannerDeskIsTiedUp') }} />
          <ConsequenceMark consequence={{ bearer: 'dependent', what: t('sheet.fourArchiveTasksWaitOnThisScan') }} />
          <ConsequenceMark consequence={{ bearer: 'owner', what: t('sheet.onlyMyOwnPlansSlip') }} />
          <ConsequenceMark consequence={{ bearer: 'none', what: t('sheet.nothingFollowsFromLeavingIt') }} />
          <ConsequenceMark consequence={null} />
        </Bar>
        <ConsequenceMark
          withSentence
          consequence={{
            bearer: 'person',
            what: t('sheet.theScannerArmKeepsMovingAfterTheStopButton2'),
          }}
        />
        <ConsequenceMark withSentence consequence={null} />

        <p className="px-sheet-sub">{t('sheet.putDownOnPurposeWithTheReasonAndWhat')}</p>
        <PauseMark
          pause={{ since: '2026-08-01', why: t('sheet.theScannerWentBackToTheLanternArchive'), until: { date: '2026-09-01' } }}
          dueToResume={false}
          note={t('sheet.putDownOn20260801TheScannerWent')}
        />
        <PauseMark
          pause={{ since: '2026-07-14', why: t('sheet.mixedScript'), until: { condition: t('sheet.theReplacementScannerIsOnTheDesk') } }}
          dueToResume={null}
          note={t('sheet.putDownOn20260714ItResumesWhen')}
        />
        <PauseMark
          pause={{ since: '2026-06-02', why: t('sheet.waitingForTheArchiveGroupToFinishWithThe') }}
          dueToResume={null}
          note={t('sheet.putDownOn20260602WaitingForThe')}
        />
        <PauseMark
          pause={{ since: '2026-05-20', why: t('sheet.deferredToNextTerm'), until: { date: '2026-08-01' } }}
          dueToResume
          note={t('sheet.putDownOn20260520DeferredToNext')}
        />
        <PauseMark pause={null} note={t('sheet.pause.noReasonMeaning')} />

        <p className="px-sheet-sub">{t('sheet.aWordNobodyHasClassifiedAQuestionNotA')}</p>
        {/*
          EVERY WORD ON THIS ROW USED TO BE ONE THE SCHEMA PUBLISHED, and that is why they are not
          any more. The sheet showed `fixed`, `retracted` and `parked` as examples of a word nobody
          had classified — three of the twelve the kinds handed out and STATE_MEANING could not
          read. All twelve are classified now, so an example that used one would be drawing a
          screen the product can no longer produce. What is left is what the group is really for: a
          word from a vocabulary that has moved, or one somebody typed by hand into an old record.
        */}
        <UnclassifiedMark state="chasing" withSentence />
        <Bar>
          <UnclassifiedMark state="gnawing" />
          <UnclassifiedMark state="半成品" />
          <UnclassifiedMark state="on hold?" />
          <span className="px-sheet-said">{t('sheet.noRecordWrittenThroughTheApiCanLandHere')}</span>
        </Bar>

        <p className="px-sheet-sub">{t('sheet.noStateAtAllThreeDifferentAnswersThreeDifferent')}</p>
        <NoStateMark
          expected
          note={t('sheet.recordsOfKindSessionCarryAStateAndNone')}
        />
        <NoStateMark expected={false} note={t('sheet.recordsOfKindNoteHaveNoStateFieldSo')} />
        <NoStateMark expected={null} note={t('sheet.moleOfficeDoesNotKnowTheKindTelemetrySo')} />

        <p className="px-sheet-sub">{t('sheet.howARecordGotHereAndTheTwoWays')}</p>
        <Bar>
          <OriginMark record={{ origin: 'fixture' }} />
          <OriginMark record={{ origin: 'authored' }} />
          <OriginMark record={{ origin: null }} />
          <OriginMark record={{ origin: 'seeded' }} />
          <OriginMark record={{}} />
        </Bar>
        <Bar>
          <span className="px-sheet-said">{t('sheet.theLoudOneIsTheOnlyOneThatIs')}</span>
        </Bar>

        <p className="px-sheet-sub">{t('sheet.gatesHowMuchSomethingBlocks')}</p>
        <Bar>
          <GateMark gate={{ kind: 'hard' }} />
          <GateMark gate={{ kind: 'partial', upTo: t('sheet.gate.deskStage') }} />
          <GateMark gate={{ kind: 'partial', upTo: t('sheet.gate.catalogueStage') }} />
          <GateMark gate={{ kind: 'hard' }} problem={t('sheet.theStoredGateSaysPartialAndNoStageWas')} />
        </Bar>
        <Bar>
          <span className="px-sheet-said">{t('sheet.aPartialGateIsNotAWeakerHardGate')}</span>
        </Bar>

        <p className="px-sheet-sub">{t('sheet.linksWhatAPersonAssertedAndWhatMoleOffice')}</p>
        <Bar>
          <LinkMark type="consumes" />
          <LinkMark type="blocks" />
          <LinkMark type="measures" inferred />
          {/* derived_from in its general sense: the legend draws the link type itself. */}
          <LinkMark type="derived_from" inferred />
          <LinkMark type="produces" broken />
          <span className="px-sheet-said">{t('sheet.fourChannelsApartABrokenArrowShaftADashed')}</span>
        </Bar>
      </Sec>

      <Sec
        n="16"
        title={t('sheet.aStateWordThisInterfaceDidNotChoose')}
        note={t('sheet.theTenStatesAboveAreWordsMoleOfficeComputes')}
      >
        <p className="px-sheet-sub">{t('sheet.theEightDrawingsAndWhatEachOneTellsYou')}</p>
        <Bar>
          {ALPHABET_DEMO.map((demo) => (
            <StoredState key={demo.state} state={demo.state} progress={demo.progress} />
          ))}
        </Bar>
        <Bar>
          <span className="px-sheet-said">{t('sheet.nothingHereIsStatedByColourTheFilledBlock')}</span>
        </Bar>

        <p className="px-sheet-sub">{t('sheet.howFarADirectionHasBeenTakenItsOwn')}</p>
        <Bar>
          <DepthLadder depth="ran" />
          <DepthLadder depth="defended" />
          <DepthLadder depth={null} />
          <span className="px-sheet-said">{t('sheet.aDirectionHasNoStateFieldAndIsNot')}</span>
        </Bar>

        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.elevenStoredWordsDrawnByWhatTheyMean')} rank={1}>
          {STORED_DEMO.map((demo) => (
            <Row
              key={demo.title}
              sev={<StoredState state={demo.state} progress={demo.progress} />}
              title={demo.title}
              meta={demo.progress === null ? t('sheet.state.noneMeaning') : PROGRESS_WORDS[demo.progress]}
              right={demo.right}
              href="#/"
            />
          ))}
        </Panel>
        <Bar>
          <StoredState state="idle" progress="stopped_short" alarm="raised" count={t('sheet.47Minutes')} />
          <span className="px-sheet-said">{t('sheet.theSameWordOnTheAttentionListWhereIt')}</span>
        </Bar>
      </Sec>

      <Sec
        n="17"
        title={t('sheet.familiesForReadingOnly')}
        note={t('sheet.families.note', { n: RECORD_KINDS.length })}
      >
        <Bar>
          <FamilyTag family="work" count={31} />
          <FamilyTag family="structure" count={18} />
          <FamilyTag family="decisions" count={7} />
          <FamilyTag family="findings" count={24} />
          <FamilyTag family="ideas" count={11} />
          <FamilyTag family="notes" count={142} />
        </Bar>
        <Bar>
          <FamilyTag kind="obligation" />
          <FamilyTag kind="session" />
          <FamilyTag kind="telemetry" />
          <span className="px-sheet-said">{t('sheet.resolvedFromTheKindAndAKindNoFamily')}</span>
        </Bar>
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.aListGroupedByFamily')} kind={t('sheet.records')} rank={1}>
          <Row leading={<FamilyTag family="work" />} sev={<StoredState state="open" progress="stopped_short" />} title={t('sheet.returnTheBorrowedScanner')} right={t('sheet.2h')} href="#/" />
          <Row leading={<FamilyTag family="findings" />} sev={<StoredState state="proposed" progress="unclassified" />} title={t('sheet.printedLabelsReadMoreClearlyThanPencilPast20')} right={t('sheet.1d')} href="#/" />
          <Row leading={<FamilyTag family="notes" />} sev={<StoredState state="crashed" progress="stopped_short" />} title={t('sheet.catalogueLabelReadingRun')} right={t('sheet.12m')} href="#/" />
          <Row leading={<FamilyTag family="structure" />} sev={<StoredState state={null} progress={null} />} title={t('sheet.catalogueCheck')} right={t('sheet.2h')} href="#/" />
        </Panel>
      </Sec>

      <Sec
        n="18"
        title={t('sheet.aRowThatScansClosedAndIsCompleteOpen')}
        note={t('sheet.scanFirstExplainOnDemandClosedARowShows')}
      >
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.whatNeedsMeToday')} kind={t('sheet.panel.shown')} rank={0} tone="failed">
          <ScanRow
            sev={<StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.21Days')} countKind="age" />}
            alarm="urgent"
            // The one row in this list whose ground is filled. Two rows below it are urgent as
            // well; what the fill says is that a person could be hurt, which is not inferable
            // from the order, and it is why the rest of the list gives the colour back.
            safety
            leading={<><SafetyFloorMark /><Tag kind="problem" /></>}
            title={t('sheet.theStopButtonInTheScannerDemoDoesNothing')}
            age={t('sheet.rank1')}
            opens={t('sheet.whyItIsHere')}
            holds={{ count: 3, what: t('sheet.rankFactors') }}
            href="#/"
          >
            <ReasonLine safetyFloor score={60} because={ESTOP_BECAUSE} factors={ESTOP_FACTORS} />
          </ScanRow>
          <ScanRow
            open
            sev={<StoredState state="open" progress="stopped_short" alarm="urgent" count={t('sheet.6DaysLate')} countKind="late" />}
            alarm="urgent"
            leading={<Tag kind="obligation" />}
            title={t('sheet.archiveReportScannerReadingSection')}
            age={t('sheet.rank3')}
            opens={t('sheet.whyItIsHere')}
            holds={{ count: 5, what: t('sheet.rankFactors') }}
            href="#/"
          >
            <ReasonLine score={103} because={REPORT_BECAUSE} factors={REPORT_FACTORS} />
          </ScanRow>
          <ScanRow
            sev={<StoredState state="open" progress="stopped_short" alarm="raised" count={t('sheet.3DaysLate')} countKind="late" />}
            alarm="raised"
            leading={<Tag kind="obligation" />}
            title={chinese('sheet.pagereaderMini')}
            age={t('sheet.rank4')}
            opens={t('sheet.whyItIsHere')}
            holds={{ count: 5, what: t('sheet.rankFactors') }}
            href="#/"
          >
            <ReasonLine score={96} because={CJK_BECAUSE} factors={CJK_FACTORS} />
          </ScanRow>
          <ScanRow
            sev={<StoredState state="failed" progress="stopped_short" alarm="faded" count={t('sheet.13Days')} />}
            alarm="faded"
            leading={<Tag kind="problem" />}
            title={chinese('sheet.41320CmJammedThePrinter')}
            age={t('sheet.13d')}
            opens={t('sheet.whyItIsHere')}
            holds={{ count: 5, what: t('sheet.rankFactors') }}
            href="#/"
          >
            <ReasonLine
              score={13}
              because={t('sheet.itsStateWordIsFailedWhichMeansTheWork')}
              factors={[
                { name: 'harm', points: 0, why: t('sheet.nobodyHasRecordedWhoIsHurtIfThisIs') },
                { name: 'standing', points: 0, why: t('sheet.nothingRecordedStandsBehindIt') },
                { name: 'sat', points: 13, why: t('sheet.theLastThingRecordedAboutItWas2026073') },
              ]}
            />
          </ScanRow>
        </Panel>
        <Bar>
          <span className="px-sheet-said">{t('sheet.rowTwoIsDrawnOpenSoAPhotographCan')}</span>
        </Bar>

        <p className="px-sheet-sub">{t('sheet.theSameComponentASessionADifferentShapeOf')}</p>
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.sessions')} kind={t('sheet.panel.happened')} rank={1}>
          <ScanRow
            state="crashed"
            alarm="raised"
            title={t('sheet.catalogueLabelReadingRun')}
            age={t('sheet.44h')}
            opens={t('sheet.whatItLeftBehind')}
            holds={{ count: 2, what: t('sheet.thingsStillHeld') }}
            href="#/sessions"
          >
            <p className="px-sheet-said">{t('sheet.exited137TheKernelKilledItWhichOnThis')}</p>
            <Row sev={<StoredState state="orphaned" progress="stopped_short" />} title={t('sheet.pid41822PythonMArchiveScan44hOld')} right={t('sheet.19Gb')} />
            <Row sev={<StoredState state="orphaned" progress="stopped_short" />} title={t('sheet.port8091HeldNothingRecordedClaimsIt')} right={t('sheet.44h')} />
          </ScanRow>
          <ScanRow
            sev={<StoredState state="idle" progress="stopped_short" alarm="raised" count={t('sheet.47Minutes')} />}
            alarm="raised"
            title={t('sheet.archiveScanAndCatalogue')}
            age={t('sheet.47m')}
            opens={t('sheet.whatItIsWaitingOn')}
            href="#/sessions"
          >
            <p className="px-sheet-said">{t('sheet.itAskedShouldIKeepTheOldLabelReader')}</p>
          </ScanRow>
          <ScanRow
            sev={<StoredState state="orphaned" progress="stopped_short" alarm="plain" count={t('sheet.4Days')} />}
            alarm="plain"
            title={t('sheet.previewLanternArchiveEndedWithoutSayingSo')}
            age={t('sheet.4d')}
            opens={t('sheet.whatItIsStillHolding')}
            holds={{ count: 1, what: t('sheet.gpu') }}
            href="#/sessions"
          >
            <p className="px-sheet-said">{t('sheet.theMiddleStepOfTheScaleItStoppedShort')}</p>
            <Row sev={<Tag tone="quiet">{t('sheet.gpu2')}</Tag>} title={t('sheet.pid9104Holding71GbOnDevice0')} right={t('sheet.4d')} />
          </ScanRow>
          <ScanRow state="running" title={t('sheet.cataloguePagetraceAtTheDesk')} age={t('sheet.3s')} opens={t('sheet.whereItIsWriting')}>
            <p className="px-sheet-said">{t('sheet.aRunningSessionIsNotAskedToExplainItself')}</p>
            <Row sev={<Tag tone="quiet">{t('sheet.path')}</Tag>} title={t('sheet.exampleLanternArchiveRuns20260809t0914')} right={t('sheet.writing')} />
          </ScanRow>
        </Panel>

        <p className="px-sheet-sub">{t('sheet.andAQueryResultNoStateNoAgeAnd')}</p>
        <Panel declares={{ surface: null }} titleIs="label" title={t('sheet.whatConsumesSomethingThatIsNotThere')} kind={t('sheet.panel.queries')} rank={1}>
          <ScanRow
            sev={<StoredState state={null} progress={null} />}
            leading={<Tag kind="pipeline" />}
            title={t('sheet.catalogueCheck')}
            opens={t('sheet.whatIsMissingAndWhoWantedIt')}
            holds={{ count: 2, what: t('sheet.brokenConsumesLinks') }}
            href="#/"
            linkText={t('sheet.openThePipeline')}
          >
            <Bar>
              <LinkMark type="consumes" broken />
              <span className="px-sheet-said">{t('sheet.readingAccuracyAtShelf12Is91PercentA')}</span>
            </Bar>
            <Bar>
              <LinkMark type="consumes" broken />
              <span className="px-sheet-said">{t('sheet.record8f2c1aWhichIsNotInThisWorkspace')}</span>
            </Bar>
          </ScanRow>
        </Panel>
      </Sec>

      <Sec
        n="19"
        title={t('sheet.proseThatIsWorthReadingOnce')}
        note={t('sheet.aRuleACaveatADescriptionOfWhatA')}
      >
        <Explain declares={{ surface: null }}
          meaning={t('sheet.somethingNeedsYouWhenItIsOwedToSomebody')}
          opens={t('sheet.theWholeRuleAndWhatItDeliberatelyLeavesOut')}
        >
          <p className="px-sheet-note">{t('sheet.bothHalvesAndNothingElseAPromiseRecordedAs')}</p>
          <p className="px-sheet-note">{t('sheet.aStateWordNobodyHasClassifiedIsNotQuietly')}</p>
        </Explain>
        <Explain declares={{ surface: null }}
          open
          meaning={t('sheet.thisPanelFindsWorkThatConsumesAResultWhich')}
          opens={t('sheet.whatThisQueryDoesNotCover')}
          holds={{ count: 3, what: t('sheet.knownGaps') }}
        >
          <ul className="px-sheet-defs">
            <li>{t('sheet.aDependencyNobodyRecordedAsALinkIsInvisible')}</li>
            <li>{t('sheet.aRecordDeletedAndReplacedUnderANewTitle')}</li>
            <li>{t('sheet.inferredLinksAreIncludedAndAreMarkedAsInferred')}</li>
          </ul>
        </Explain>
        <Explain declares={{ surface: null }}
          meaning={t('sheet.47RecordsWereWrittenByAnAgentAnd12')}
          opens={t('sheet.howMoleOfficeTellsTheTwoApart')}
        >
          <p className="px-sheet-note">{t('sheet.everyWriteRecordsWhoDidItAsANamed')}</p>
        </Explain>
        <Bar>
          <span className="px-sheet-said">{t('sheet.theSecondOneIsDrawnOpenForThePhotograph')}</span>
        </Bar>

        <p className="px-sheet-sub">{t('sheet.theOtherHalfOfThePairProseThatFolds')}</p>
        <StandingNote
          summary={t('sheet.standing.summary')}
          opens={t('sheet.whyThisOrderAndTheRuleBehindIt')}
        >
          <p className="px-sheet-note">{t('sheet.somethingNeedsYouWhenItIsOwedToSomebody2')}</p>
          <p className="px-sheet-note">{t('sheet.theOrderIsASumOfFiveFactorsWho')}</p>
        </StandingNote>
        <Bar>
          <span className="px-sheet-said">{t('sheet.thisIsTheOneComponentInTheLibraryThat')}</span>
        </Bar>
      </Sec>

      <Sec
        n="20"
        title={t('sheet.countsThatAreQuestionsNotWork')}
        note={t('sheet.threeGroupsComeBackFromTheAttentionRuleThat')}
      >
        <DataHealth
          what={t('sheet.records')}
          groups={[
            {
              label: t('sheet.stateWordsNobodyHasClassified'),
              count: 21,
              note: t('sheet.moleOfficeCannotTellWhetherTheseStoppedShortBecause'),
              href: '#/records',
              detail: (
                <>
                  <Bar>
                    <UnclassifiedMark state="fixed" />
                    <span className="px-sheet-said">{t('sheet.7Problems')}</span>
                    <UnclassifiedMark state="proposed" />
                    <span className="px-sheet-said">{t('sheet.9Ideas')}</span>
                    <UnclassifiedMark state="chasing" />
                    <span className="px-sheet-said">{t('sheet.3Purchases')}</span>
                    <UnclassifiedMark state="重印中" />
                    <span className="px-sheet-said">{t('sheet.2Tasks')}</span>
                  </Bar>
                  <Row
                    sev={<StoredState state="fixed" progress="unclassified" />}
                    title={t('sheet.theArchivePrinterAddressChangedAfterTheSwitchSwap')}
                    right={t('sheet.9d')}
                    href="#/"
                  />
                  <Row
                    sev={<StoredState state="重印中" progress="unclassified" />}
                    title={t('sheet.41320Cm')}
                    right={t('sheet.1d')}
                    href="#/"
                  />
                </>
              ),
            },
            {
              label: t('sheet.recordsWithNoStateWord'),
              count: 97,
              open: true,
              note: t('sheet.threeDifferentAnswersKeptApartAKindThatCarries'),
              href: '#/records',
              detail: (
                <>
                  <NoStateMark
                    expected
                    note={t('sheet.recordsOfKindSessionCarryAStateAndNone2')}
                  />
                  <NoStateMark
                    expected={false}
                    note={t('sheet.recordsOfKindNoteHaveNoStateFieldSo2')}
                  />
                  <NoStateMark
                    expected={null}
                    note={t('sheet.moleOfficeDoesNotKnowTheKindTelemetrySo2')}
                  />
                </>
              ),
            },
            {
              label: t('sheet.putDownOnPurpose'),
              count: 6,
              note: t('sheet.aPauseIsADecisionNotAFailureSo'),
              href: '#/records',
              linkText: t('sheet.openPausedRecords'),
              detail: (
                <>
                  <PauseMark
                    pause={{ since: '2026-08-01', why: t('sheet.theScannerWentBackToTheLanternArchive'), until: { date: '2026-09-01' } }}
                    dueToResume={false}
                    note={t('sheet.putDownOn20260801TheScannerWent')}
                  />
                  <PauseMark
                    pause={{ since: '2026-05-20', why: t('sheet.deferredToNextTerm'), until: { date: '2026-08-01' } }}
                    dueToResume
                    note={t('sheet.putDownOn20260520DeferredToNext')}
                  />
                  <PauseMark
                    pause={{ since: '2026-06-02', why: t('sheet.waitingForTheArchiveGroupToFinishWithThe') }}
                    dueToResume={null}
                    note={t('sheet.putDownOn20260602WaitingForThe')}
                  />
                </>
              ),
            },
            {
              label: t('sheet.recordsOfAKindMoleOfficeDoesNotKnow'),
              count: 0,
              note: t('sheet.unknownKind.note', { n: RECORD_KINDS.length }),
            },
          ]}
        />
        <Bar>
          <span className="px-sheet-said">{t('sheet.124RecordsThreeQuestionsAndOneAnswerOfNone')}</span>
        </Bar>
      </Sec>

      <Sec
        n="21"
        title={t('sheet.theSameFactAtTheEmphasisTheSurfaceAsked')}
        note={t('sheet.aStateWordMeansOneThingEverywhereHowLoudly')}
      >
        <ul className="px-sheet-defs">
          {SURFACE_EMPHASES.map((e) => (
            <li key={e}>
              <code>{t(({ 'perceptual': 'sheet.emphasisCode.perceptual', 'analytical': 'sheet.emphasisCode.analytical' } satisfies Record<SurfaceEmphasis, WordKey>)[e])}</code> {EMPHASIS_NOTES[e]}
            </li>
          ))}
        </ul>

        <p className="px-sheet-said">{t('sheet.sixWordsThisInterfaceComputesEveryOneCarryingA')}</p>
        <Bar>
          {EMPHASIS_DEMO.map((d) => (
            <StateChip key={d.state} state={d.state} alarm={d.alarm} />
          ))}
        </Bar>
        <p className="px-sheet-said">{t('sheet.theSameSixOnASurfaceThatDeclared')}{' '}<code>{t('sheet.analytical')}</code>{t('sheet.noStateHasChangedMeaningAndNoColourHas')}{' '}<code>{t('sheet.danger')}</code>{' '}{t('sheet.takesTheHueOnItsInkAndItsEdge')}{' '}<code>{t('sheet.warning')}</code>{' '}{t('sheet.hasNoHueOfItsOwnToTakeSo')}</p>
        <div {...surfaceEmphasis('analytical')}>
          <Bar>
            {EMPHASIS_DEMO.map((d) => (
              <StateChip key={d.state} state={d.state} alarm={d.alarm} />
            ))}
          </Bar>
        </div>

        <ul className="px-sheet-defs">
          {STATE_FAMILIES.map((f) => (
            <li key={f}>
              <code>{t(({ 'neutral': 'sheet.familyCode.neutral', 'active': 'sheet.familyCode.active', 'success': 'sheet.familyCode.success', 'warning': 'sheet.familyCode.warning', 'danger': 'sheet.familyCode.danger', 'unknown': 'sheet.familyCode.unknown' } satisfies Record<StateFamily, WordKey>)[f])}</code> {STATE_FAMILY_MEANINGS[f]}
            </li>
          ))}
        </ul>
        <Bar>
          <span className="px-sheet-said">{t('sheet.theFamiliesGroupTheTenStatesTheyAreNot')}{' '}<code>{t('sheet.crashed')}</code>{' '}{t('sheet.andWithholdItFrom')}{' '}<code>{t('sheet.open')}</code>{t('sheet.whichIsTheDifferenceBetweenACatalogueAndAn')}</span>
        </Bar>

        <p className="px-sheet-said">{t('sheet.aRecordsListIsTheCaseThatMustNot')}{' '}<code>{t('sheet.idle')}</code>{' '}{t('sheet.andASessionThatIsIdleCameOutAs')}{' '}<code>{t('sheet.raised')}</code>{' '}{t('sheet.oneIsStillTheHeavierStrokeAndTheLast')}</p>
        <Bar>
          {WARNING_DEMO.map((d) => (
            <StoredState
              key={`${d.word}-${d.alarm ?? 'none'}`}
              state={d.word}
              progress={d.progress}
              {...(d.alarm ? { alarm: d.alarm } : {})}
            />
          ))}
        </Bar>
        <div {...surfaceEmphasis('analytical')}>
          <Bar>
            {WARNING_DEMO.map((d) => (
              <StoredState
                key={`${d.word}-${d.alarm ?? 'none'}`}
                state={d.word}
                progress={d.progress}
                {...(d.alarm ? { alarm: d.alarm } : {})}
              />
            ))}
          </Bar>
        </div>
      </Sec>

    </div>
  )
}

/** Styling for the sheet itself. Separate from UI_CSS: no product page ships this. */
const SHEET_CSS = `
.px-sheet {
  max-width: 1180px; margin: 0 auto; padding: var(--pad-lg);
  font-family: var(--font-ui); color: var(--text); background: var(--bg);
  font-size: var(--fs-3); line-height: var(--lh-body);
}
.px-sheet-head { display: flex; flex-direction: column; gap: var(--gut); margin-bottom: var(--pad-lg); }
.px-sheet-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); }
.px-sheet-lead { margin: 0; max-width: var(--measure-in-box); color: var(--text-2); font-size: var(--fs-3); line-height: var(--lh-read); }
/* The one standing rule in the header. A 2px rule and nothing else: no panel, no colour of its
   own, so it reads as a quieter line than the lead above it and survives data-theme=mono. */
.px-sheet-rule {
  margin: 0; max-width: var(--measure-in-box);
  padding-left: var(--gut); border-left: 2px solid var(--border);
  color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-read);
}
.px-sheet-bar {
  display: flex; gap: var(--gut); flex-wrap: wrap;
  padding: var(--pad); border: var(--border-w) solid var(--border);
  border-radius: var(--radius); background: var(--panel);
}
.px-sheet-bar .px-field { min-width: 140px; }
.px-sheet-sec { margin-top: var(--pad-lg); }
.px-sheet-h { margin: 0; font-size: var(--fs-5); font-weight: 600; line-height: var(--lh-tight); }
.px-sheet-n { color: var(--text-3); font-family: var(--font-mono); font-size: var(--fs-3); }
.px-sheet-note { margin: 4px 0 var(--gut); max-width: 80ch; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-read); }
.px-sheet-body { display: flex; flex-direction: column; gap: var(--gut); }
.px-sheet-strip { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; }
.px-sheet-said { color: var(--text-3); font-size: var(--fs-1); }
.px-sheet-cols { display: grid; gap: var(--gut); grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); align-items: start; }
/* A heading inside a section, for a section that shows several unrelated marks. */
.px-sheet-sub {
  margin: var(--gut) 0 0;
  font-size: var(--fs-1); font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  color: var(--text-3);
}
/* The four alarm levels with a sentence each. A definition list without the markup argument. */
.px-sheet-defs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.px-sheet-defs li { max-width: 90ch; font-size: var(--fs-2); line-height: var(--lh-read); color: var(--text-2); }
.px-sheet-defs code { color: var(--text); font-weight: 700; }
`

if (typeof document !== 'undefined' && !document.getElementById('mole-office-sheet-css')) {
  const el = document.createElement('style')
  el.id = 'mole-office-sheet-css'
  el.textContent = SHEET_CSS
  document.head.append(el)
}
