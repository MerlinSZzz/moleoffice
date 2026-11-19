// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COLOUR ROLE REGISTER: ONE ROW PER THING A READER CAN CONCLUDE FROM AN INK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS, AND WHY IT IS A MODULE RATHER THAN A TABLE IN A DESIGN DOCUMENT
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/settings-and-governance.md` §2.3 publishes this register as a table and
 * §2.6 says in its own words that the test reads *"the role register (a module, not a document)"*.
 * A table in a document drifts from the stylesheet the day somebody edits one of them; a module the
 * build reads cannot. So the table lives here, and `docs/UX-CONTRACT.md` points at it.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR RULES, AND THE FIRST ONE IS ABOUT MEANINGS AND NOT ABOUT ROWS
 * ---------------------------------------------------------------------------------------
 *
 * §2.2 states them, and the first version of the design got rule 1 wrong by writing "one role, one
 * token" over a table in which `--accent` sat on four rows. The rule that is true:
 *
 *   1. NO STATE TOKEN CARRIES TWO MEANINGS. `--st-*` and `--ask*` are the state namespace, and
 *      §2.2's own words are that each *"names one meaning across the whole product"*. That is why
 *      `meaning` is a field here and the test groups by token and compares meanings, rather than
 *      counting rows. Two rows may share a token when they are the same conclusion drawn on two
 *      surfaces — role 11 and role 24 are both *waiting on a person*, one on the governance queue
 *      and one on an agent that is writing its report — and that is not the defect rule 1 exists to
 *      catch. The defect is `--st-inferred` saying *Mole Office worked this out* on one line of
 *      `DetailSays.tsx` and *this browser refused to save your setting* eight lines below it.
 *   2. THE ACCENT APPEARS ONLY IN ITS TWO LICENSED JOBS: a bar whose length is a quantity, and the
 *      chosen segment of a control. `docs/UX-CONTRACT.md:191` and `:198`.
 *   3. NEUTRAL INKS ARE RANKS, NOT ROLES. `--text`, `--text-2`, `--text-3` say how loud, never
 *      what. A role drawn in a neutral carries its meaning in a word, a glyph or a shape, so those
 *      three are allowed on many rows and the test does not group them.
 *   4. EVERY ROLE DECLARES AT LEAST ONE CHANNEL THAT IS NOT COLOUR.
 *
 * ---------------------------------------------------------------------------------------
 * THE SCOPE OF THE STYLESHEET SWEEP IS STATED HERE, NOT IMPLIED
 * ---------------------------------------------------------------------------------------
 *
 * §2.2: *"The register test covers the four surfaces this design owns — Settings, the composer, the
 * governance queue and decision card, and the Schedule. Everywhere else is work not done."*
 * `var(--accent)` appears over a hundred times under `src/web` and `--st-inferred` in thirteen
 * files, including `Chart.tsx`, where five state tokens are chart series colours with no state
 * meaning at all and the file says why in its own comment. A test that claimed the tree and read
 * six files would pass the defect it claims to detect.
 *
 * `OWNED_STYLESHEETS` below is the list, and it is six files rather than four because those four
 * surfaces are drawn by six: Settings is a page plus its detail matrix, and the Schedule is a page
 * plus `Planning.tsx`. The scope is the four surfaces; the file count is what drawing them takes.
 *
 * ---------------------------------------------------------------------------------------
 * `ACCENT_OUTSIDE_ITS_JOBS` IS A DEBT WRITTEN DOWN BY NAME, NOT A LOOPHOLE
 * ---------------------------------------------------------------------------------------
 *
 * Four selectors in the owned files spend `--accent` on something that is neither a quantity bar nor
 * the chosen segment of a control. Repairing them is a redrawing of four controls this wave does
 * not own, so they are listed the way `tests/machine-word-allowlist.json` lists its sites: the test
 * asserts the set found equals this set EXACTLY, in both directions, so a seventh fails the build
 * and removing one without taking it off the list fails too. The list shrinking is the repair.
 *
 * THE TWO REVIEW ACCENTS COLLIDE WITH TWO STATE INKS ON PURPOSE, AND THE CENSUS SAYS SO. Measured
 * by `node tools/colour-role-census.mjs` on 26 August 2026: `--review-local` is the palette's own
 * blue, which is also `--accent` and `--st-doing`, in all seven palettes, and `--review-global` is
 * its own amber, which is also `--st-inferred`, in all seven. That is recorded rather than
 * repaired, for the reason §2.5 records `--st-failed` = `--st-overdue` in all seven: the colour is
 * not what carries the distinction. A local mark draws one edge; a global mark draws a doubled
 * edge, which says the same thing with the colour taken away. Moving the hex two per cent would
 * leave a reader looking at the same colour and let a census claim they were apart.
 *
 * The register names 31 tokens, of which 29 are hues and 2 are role 9's non-colour channels. The
 * build plan said 24. That number was never one this corpus held.
 *
 * The one that came OFF this list in wave 14 is `Today`. §2.3 role 16 says it comes off the accent —
 * today is not a quantity and it is not the segment you picked — so `.px-pl-bday[data-today='yes']`
 * now draws a `--border-strong` rule, a heavier numeral and the word, which is three channels and
 * no hue.
 */

import { ALL_REVIEW_MARKS, REVIEW_MARK_STATES } from './reviewmarks.ts'

/** The accent's two licensed jobs. Any other value on a row spending `--accent` fails the build. */
export type AccentLicence = 'quantity' | 'chosen'

export interface ColourRole {
  /** §2.3's row number, or a `review.` / `work.` key for the rows later addenda added. */
  id: string
  /** What a reader concludes from this drawing. The role, in a reader's words. */
  role: string
  /**
   * The ink, or null where the role is drawn without hue. Rule 1 groups the state namespace by
   * this; `--text*` and the surface tokens are ranks and grounds and are not grouped.
   */
  token: string | null
  /**
   * The one conclusion this token stands for across the whole product. Two rows sharing a token
   * must share this. A token with two meanings is the defect rule 1 exists to catch.
   */
  meaning: string
  /** Set only on a row spending `--accent`, and only ever one of the two licensed jobs. */
  licence: AccentLicence | null
  /** At least one, and none of them is a colour. Rule 4. */
  channels: readonly string[]
  /** Where in the product this role is drawn, in a reader's words. */
  where: string
  /**
   * CSS selectors in `OWNED_STYLESHEETS`, or in `drawnIn` when a row gives one, that draw this role.
   * The sweep requires every selector in the owned files naming a state token or the accent to be
   * claimed by exactly one row, and the token it names to be one this row declares. It also reads
   * the other way: every selector written here must be a rule in those files that names one of this
   * row's tokens, so a row cannot describe a drawing that is not there.
   */
  drawnBy: readonly string[]
  /**
   * The one file that holds this row's rules, when it is not one of `OWNED_STYLESHEETS`. Only the
   * check from row to rule reads it; the sweep from rule to row stays on the owned files.
   */
  drawnIn?: string
  /** Extra tokens this row's `drawnBy` selectors are allowed to name — the tint and rail of an ink. */
  alsoDraws?: readonly string[]
}

/**
 * WHICH HUE EACH OF THE EIGHT REVIEW MARKS IS ALLOWED TO DRAW, WRITTEN OUT BY HAND.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS MAP EXISTS RATHER THAN `token: mark.hue`
 * ---------------------------------------------------------------------------------------
 *
 * The eight `review.mark.*` rows are generated from `REVIEW_MARK_STATES`, which is right for their
 * words and their channels: those ARE the mark, restated in the register would be two declarations
 * of one fact. The HUE is the opposite case. The register's whole job is to be the second opinion
 * about a hue — the plan's first proof is *"the colour register covers every hue a mark draws"* —
 * and a row that copies the hue off the mark agrees with it by construction.
 *
 * Measured: with `token: mark.hue`, `row.token === hue` was true for all eight whatever either said,
 * so both failure branches of the register's own assertion were unreachable and the proof was a
 * tautology over the eight states it names. It fired only for the two alarm marks, which get no
 * generated row. Today every mark carries `hue: null`, so nothing was wrong on the screen; the day
 * somebody gives a mark a hue, the register would have agreed with it whatever it was.
 *
 * SO THE HUE IS WRITTEN DOWN TWICE ON PURPOSE. A test compared the two until it was deleted on 12 November 2026
 * with the other house-rule tests.
 *
 * ALL EIGHT KEYS ARE PRESENT, including the nulls. A missing key would read as null and a new mark
 * state would slip in with no hue declared and nothing said about it; the register test holds the
 * key set against `REVIEW_MARK_STATES`.
 */
const REVIEW_MARK_HUES: Readonly<Record<string, string | null>> = {
  draft: null,
  collected: null,
  organised: null,
  ready: null,
  queued: null,
  delivered: null,
  pickedUp: null,
  handled: null,
}

/**
 * The register. §2.3 rows 1-20, then wave 14's ten review rows, then the addendum's four work-state
 * rows, then the three Placeholder rows §2.3 declined to invent before `placeholder.md` named the
 * severities.
 */
export const COLOUR_ROLES: readonly ColourRole[] = [
  // ------------------------------------------------------------------ the detail matrix, §2.3 1-5
  {
    id: '1',
    role: 'This level is set on this row',
    token: '--accent',
    meaning: 'the segment of this control you picked',
    licence: 'chosen',
    channels: ['filled dot ● inside a 1px ring', 'accessible name "set here"'],
    where: 'The detail matrix in Settings',
    drawnBy: ['.dsay-cell[data-mark="here"]'],
  },
  {
    id: '2',
    role: 'This row inherits its level from the band above',
    token: '--text-2',
    meaning: 'rank: one step quieter than body text',
    licence: null,
    channels: ['hollow ring ◦', 'no border'],
    where: 'The detail matrix in Settings',
    drawnBy: [],
  },
  {
    id: '3',
    role: 'Nothing is set at this position',
    token: '--text-3',
    meaning: 'rank: two steps quieter than body text',
    licence: null,
    channels: ['hairline dot ·'],
    where: 'The detail matrix in Settings',
    drawnBy: [],
  },
  {
    id: '4',
    role: 'This position says the same as an earlier one, for the record being previewed',
    token: null,
    meaning: 'no hue',
    licence: null,
    channels: ["a hairline strike through the cell's mark"],
    where: 'The detail matrix in Settings',
    drawnBy: [],
  },
  {
    id: '5',
    role: 'This is the global row the others inherit from',
    token: null,
    meaning: 'no hue',
    licence: null,
    channels: [
      'a full-width band on a --panel-3 ground',
      'a solid --border-strong rule under it',
      'marks drawn as bars ▮ rather than dots',
    ],
    where: 'The detail matrix in Settings, and any future band',
    drawnBy: [],
  },
  // ------------------------------------------------------------------- the supply row, §2.3 6-8
  {
    id: '6',
    role: 'Every record has text here',
    token: '--text',
    meaning: 'rank: body text',
    licence: null,
    channels: ['✓ glyph beside a full bar'],
    where: "The supply row under the detail matrix",
    drawnBy: [],
  },
  {
    id: '7',
    role: 'No record has text here',
    token: '--text-3',
    meaning: 'rank: two steps quieter than body text',
    licence: null,
    channels: ['the word "none" beside an empty bar'],
    where: 'The supply row under the detail matrix',
    drawnBy: [],
  },
  {
    id: '8',
    role: 'Some records have text here, and this is how many',
    token: '--accent',
    meaning: 'how much: the length of this bar is the quantity',
    licence: 'quantity',
    channels: ["the bar's length is the quantity", 'the numbers are printed beside it'],
    where: "The supply row under the detail matrix, and the Schedule's hours bars",
    drawnBy: ['.px-pl-fill', '.px-pl-read strong.px-pl-free'],
  },
  // -------------------------------------------------------------------- the two Settings faults
  {
    id: '9',
    role: 'Mole Office cannot keep your settings in this browser',
    token: '--st-failed',
    meaning: 'this did not work',
    licence: null,
    channels: ['the word "Not saved"', 'glyph ✕', 'weight 700', '3px left rail'],
    where: 'The appearance bar and the detail matrix — one treatment, both places',
    drawnBy: ['.dsay-fault', '.dsay-fault::before'],
    alsoDraws: [
      '--st-failed-line',
      '--st-failed-row',
      '--st-failed-bg',
      '--st-failed-weight',
      '--st-failed-glyph',
    ],
  },
  {
    id: '10',
    role: 'Mole Office worked this out; nobody asserted it',
    token: '--st-inferred',
    meaning: 'worked out, not asserted',
    licence: null,
    channels: ['dashed border', 'glyph ◌'],
    where: "The detail preview's walked chip. Only this.",
    drawnBy: ['.dsay-preview-walked'],
    alsoDraws: ['--st-inferred-line', '--st-inferred-row', '--st-inferred-bg'],
  },
  // ------------------------------------------------------------------ governance, §2.3 11-14
  {
    id: '11',
    role: 'Waiting on a person; nothing moves until they act',
    token: '--ask',
    meaning: 'waiting on a person',
    licence: null,
    channels: ['the word "Decisions"', 'weight 600', '3px left rail'],
    where:
      'The governance queue, a proposal row, and the panel around an unsettled fork including its Decide it button',
    drawnBy: [
      '.px-gov-act',
      '.px-gov-act .px-btn[data-variant="primary"]',
      '.px-gov-act .px-btn[data-variant="primary"]:hover, .px-gov-act .px-btn[data-variant="primary"][data-force="hover"]',
      // `.px-gov-radio` came off this list on 6 September 2026 with the radio itself. An option is
      // pressed now, and the card is the button — criterion M57.
    ],
    alsoDraws: ['--ask-line', '--ask-row', '--ask-bg'],
  },
  {
    id: '12',
    role: 'The choice you are considering, not yet committed',
    token: '--ask-line',
    meaning: 'waiting on a person',
    licence: null,
    channels: [
      'a 2px border where the others are 1px',
      'aria-busy on the card while its press is being written',
      'the other cards at .55 opacity while it stays at full',
    ],
    where:
      'The option card being written, and the card that takes none of them while the person types their own answer',
    drawnBy: ['.px-gov-opt[data-chosen="1"]', '.px-gov-opt[data-chosen="1"] .px-gov-opt-inner'],
    alsoDraws: ['--ask-row'],
  },
  {
    id: '13',
    role: 'This reached its end — a decision that was committed, work that is finished',
    token: '--st-done',
    meaning: 'this reached its end',
    licence: null,
    channels: [
      'the word "taken" beside the option, and "Decided" with ✓ at weight 700 on the panel',
      'a 2px --st-done-line border and a 3px left rail',
      "on the Schedule, the words \"the work is done\" and the stored state word",
    ],
    where: "The option a decision took, and the Schedule's finished work",
    // `.px-gov-opt[data-decided="1"]` STOOD HERE AND WAS DRAWN BY NOTHING. The register said the
    // option a decision took was --st-done from the day it was written; the stylesheet drew it in
    // --text, the ink of body copy, so the one card in the list that had been chosen was the one
    // card with no colour on it. The sweep in the colour role register's test, since deleted, read
    // stylesheet to register and not the other way, so nothing failed. The selector is now the one
    // the card really carries, and it really draws the ink. Criterion M57, 6 September 2026.
    drawnBy: [
      '.px-gov-opt[data-taken="1"]',
      '.px-gov-opt[data-taken="1"] .px-gov-opt-inner',
      '.px-gov-opt[data-taken="1"] button.px-gov-opt-inner:hover:not(:disabled)',
      '.px-gov-taken',
      '.px-pl-out-done',
      '.px-pl-bdone',
      '.px-pl-isdone',
    ],
    alsoDraws: ['--st-done-line', '--st-done-row', '--st-done-bg'],
  },
  {
    id: '14',
    role: 'An option that was not taken',
    token: '--text-3',
    meaning: 'rank: two steps quieter than body text',
    licence: null,
    channels: [
      'the word "Not taken"',
      "the option's own sentence clamped to one line at draw time",
      'a ▾ that opens the whole sentence',
    ],
    where: 'The decision card, after it is committed',
    drawnBy: [],
  },
  // ------------------------------------------------------------------------ the Schedule, §2.3 15-20
  {
    id: '15',
    role: 'This is an example and none of it is yours',
    token: null,
    meaning: 'no hue',
    licence: null,
    channels: [
      'a 3px hatched --border-strong border',
      'a capitalised EXAMPLE strip',
      'the word "Example" on every card',
      'nothing inside it is tabbable',
    ],
    where: 'The Schedule only',
    drawnBy: [],
  },
  {
    id: '16',
    role: 'Today',
    token: null,
    meaning: 'no hue',
    licence: null,
    channels: ['a 2px --border-strong top rule', 'the day number at weight 700', 'the word "today"'],
    where: 'The Schedule',
    drawnBy: [],
  },
  {
    id: '17',
    role: 'The day you are working in',
    token: '--sel',
    meaning: 'the one you are on',
    licence: null,
    channels: ['aria-current="date"'],
    where: 'The Schedule',
    drawnBy: [],
  },
  {
    id: '18',
    role: 'An agreed date that has passed or is close',
    token: '--st-overdue',
    meaning: 'an agreed date has passed or is close',
    licence: null,
    channels: ['the word "Due"', 'glyph ◷'],
    where: 'The Schedule day header, the hours panel, and the drawing',
    drawnBy: [],
  },
  {
    id: '19',
    role: 'This work has no period yet',
    token: '--text-3',
    meaning: 'rank: two steps quieter than body text',
    licence: null,
    channels: ['a hollow bar the same height as a filled one', 'the words "Needs a day"'],
    where: 'The Schedule',
    drawnBy: [],
  },
  {
    id: '20',
    role: 'Nobody has said how big this period is',
    token: '--text-3',
    meaning: 'rank: two steps quieter than body text',
    licence: null,
    channels: [
      'a hollow chip with a solid --border-strong edge',
      'the words "nobody has said"',
      'a + Set hours control beside it',
    ],
    where: 'The Schedule',
    drawnBy: [],
  },
  // -------------------------------------------------------- wave 14: the ten review rows, review.md §8.2
  ...Object.entries(REVIEW_MARK_STATES).map(([key, mark]): ColourRole => ({
    id: `review.mark.${key}`,
    role: `A set of comments that is ${mark.word.toLowerCase()}`,
    // THE HUE IS DECLARED HERE, BY HAND, AND NOT COPIED OFF THE MARK. See REVIEW_MARK_HUES above.
    token: REVIEW_MARK_HUES[key] ?? null,
    meaning: `review mark: ${mark.word.toLowerCase()}`,
    licence: null,
    channels: [`a ${mark.glyph} glyph drawn ${mark.fill}`, `the word "${mark.word}"`],
    where: "The review marker, wherever a set of comments is drawn on the thing it is about",
    drawnBy: [],
  })),
  {
    id: 'review.local',
    role: 'A comment about this one thing, in review',
    token: '--review-local',
    meaning: 'review: about this one thing',
    licence: null,
    channels: ['a single edge on the left of the marked run'],
    where: 'The review pane and the marks it draws on the reading',
    drawnBy: [],
  },
  {
    id: 'review.global',
    role: 'A comment about the whole thing, in review',
    token: '--review-global',
    meaning: 'review: about the whole thing',
    licence: null,
    channels: ['a doubled edge, which says the same thing with the colour taken away'],
    where: 'The review pane and the marks it draws on the reading',
    drawnBy: [],
  },
  // ---------------------------------------- wave 14 step 14: the work states, addendum two §S2.3
  {
    id: 'work.working',
    role: 'This agent is working on something now',
    token: '--st-doing',
    meaning: 'somebody is working on this now',
    licence: null,
    channels: ['the word "Working"', 'the half-filled glyph ◐ the active family already draws'],
    where: 'The recipient picker, the agent surface, and the drawing',
    drawnBy: [],
  },
  {
    id: 'work.reporting',
    role: 'This agent has finished and is waiting for a person to read it',
    token: '--ask',
    meaning: 'waiting on a person',
    licence: null,
    channels: [
      'the word "Reporting"',
      'weight 600 and nothing else: no edge, no fill, no glyph',
      'no urgency channel of any kind: time passing does not change it',
    ],
    where: 'The recipient picker, the agent surface, and the drawing',
    drawnBy: [],
  },
  {
    id: 'work.standingBy',
    role: 'This agent is available and nothing is asked of it',
    token: '--text-2',
    meaning: 'rank: one step quieter than body text',
    licence: null,
    channels: ['the word "Standing by"', 'no rail, no glyph, no tint — it reads as calm'],
    where: 'The recipient picker, the agent surface, and the drawing',
    drawnBy: [],
  },
  {
    id: 'work.blocked',
    role: 'This agent cannot go on until something changes',
    token: '--st-blocked',
    meaning: 'this cannot go on until something changes',
    licence: null,
    channels: ['the word "Blocked"', 'a 3px left rail', 'at most one of these on a row'],
    // The only work state that may carry urgency, and the only one carrying a left rail.
    where: 'The recipient picker, the agent surface, and the drawing',
    drawnBy: [
      '.px-delta-open',
      '.px-delta-op-open .px-delta-kind',
      '.px-pl-unknown .px-pl-n',
      ".px-pl-inside[data-conflict='yes']",
    ],
    alsoDraws: ['--st-blocked-line', '--st-blocked-row', '--st-blocked-bg'],
  },
  // ------------- the Schedule's own two, which are role 9's meaning and role 1's job elsewhere
  {
    id: 'schedule.failed',
    role: 'This did not work — a run that failed, a record that is gone, an hour Mole Office refused',
    token: '--st-failed',
    meaning: 'this did not work',
    licence: null,
    channels: ['the sentence saying what failed', 'weight 600 on the word', 'never more than one on a row'],
    where: 'The Schedule: over-capacity, refused hours, stopped work and deleted records',
    drawnBy: [
      '.px-pl-over .px-pl-n',
      '.px-pl-overfill',
      '.px-pl-overword',
      '.px-pl-gone',
      '.px-pl-failed',
      '.px-pl-stopped',
      '.px-pl-hin[aria-invalid="true"]',
      '.px-pl-hwrap-refused',
      '.px-pl-badh',
      '.px-pl-refused',
    ],
    alsoDraws: ['--st-failed-line', '--st-failed-row', '--st-failed-bg'],
  },
  {
    id: 'control.chosen',
    role: 'The segment of this control you picked',
    token: '--accent',
    meaning: 'the segment of this control you picked',
    licence: 'chosen',
    channels: ['aria-pressed on the button', 'weight 700', 'position in the group'],
    where: "The Schedule's state filter, and every segmented control drawn like it",
    drawnBy: ['.px-pl-state[aria-pressed="true"]', '.px-plan-h-now'],
  },
  // ------------------------ wave 14 step 3: the three Placeholder rows, placeholder.md's severities
  {
    id: 'placeholder.stops_final',
    role: 'A deliberate unresolved slot that stops anything resting on it being called final',
    token: '--text',
    meaning: 'rank: body text',
    licence: null,
    channels: [
      'the words "Stops this being called final"',
      'a solid left rail in the margin, barred',
      'never hatched — hatching means example',
      'never dashed — dashed means worked out',
    ],
    where: 'The left margin of any record carrying a placeholder',
    drawnBy: [],
  },
  {
    id: 'placeholder.limits_claims',
    role: 'A deliberate unresolved slot that limits what this record can prove',
    token: '--text-2',
    meaning: 'rank: one step quieter than body text',
    licence: null,
    channels: [
      'the words "Limits what this can prove"',
      'a doubled left rail in the margin',
      'never hatched',
      'never dashed',
    ],
    where: 'The left margin of any record carrying a placeholder',
    drawnBy: [],
  },
  {
    id: 'placeholder.harmless',
    role: 'A deliberate unresolved slot whose author said nothing rests on it',
    token: '--text-3',
    meaning: 'rank: two steps quieter than body text',
    licence: null,
    channels: ['the words "Nothing rests on it"', 'no rail at all', 'never hatched', 'never dashed'],
    where: 'The left margin of any record carrying a placeholder',
    drawnBy: [],
  },
  // ------------------------------------------ P5: an agent's window beside the person's hours
  {
    id: 'plan.agent-window',
    role: "This window was placed by an agent, not by the person whose hours the schedule is",
    token: '--plan-agent',
    meaning: "an agent's window, which is in no total and is not the person's own time",
    licence: null,
    channels: [
      "the agent's own name in the same ink",
      'a rail down the leading edge of the block',
      'the same window is in no hours total and no capacity bar',
    ],
    where: "The Schedule's week board, beside the person's own windows",
    drawnBy: [".px-pl-block[data-owner='agent']", ".px-pl-open[data-owner='agent']", '.px-pl-bowner'],
  },
  // ------------------------------------- P1: a goal is what the work below it is for
  {
    id: 'plan.goal',
    role: 'This is a goal: what the work drawn under it is for',
    token: '--plan-goal',
    meaning: 'the aim the work below it serves',
    licence: null,
    // The WORD is the channel that survives greyscale, a photograph and the mono theme; the rail is
    // a second shape channel, and the hue is the third.
    channels: ['the word "goal" on the card, from the same table the key reads', 'a left rail in the goal ink'],
    where: "The plan drawing's goal card and its key entry",
    // The plan drawing is not one of the owned stylesheets, so the row says which file draws it.
    drawnIn: 'src/web/components/graph/PlanGraph.tsx',
    drawnBy: [".pg-cc[data-plan-role='goal']", ".pg-card[data-role='goal']", ".pg-key[data-role='goal']"],
  },
]

/**
 * The stylesheets that draw the four surfaces §2.2 gives this test. Paths are from the repository
 * root. Two of the four surfaces take two files each; the scope is the surfaces.
 */
export const OWNED_STYLESHEETS: readonly string[] = [
  'src/web/pages/SettingsPage.tsx',
  'src/web/components/DetailSays.tsx',
  'src/web/components/agent/TalkBox.tsx',
  'src/web/components/Governance.tsx',
  'src/web/pages/PlanPage.tsx',
  'src/web/components/Planning.tsx',
]

/**
 * Selectors in `OWNED_STYLESHEETS` that spend `--accent` outside its two licensed jobs, each with
 * the reason it is still there. The test asserts the set found equals this set exactly, so a new
 * one fails the build. See the note at the head of this file: this list shrinking is the repair.
 */
export const ACCENT_OUTSIDE_ITS_JOBS: Readonly<Record<string, string>> = {
  '.px-gov-settled-list a': 'A link ink. Links are their own job and this register has no row for one.',
  '.px-pl-sub::before': 'The rail down the left of a sub-plan. It says nesting, which is neither job.',
  '.px-pl-block[data-open=\'yes\']':
    'An opened block on the Schedule. Open is closer to "the one you are on", which is --sel.',
  '.px-pl-wentto':
    'The box saying where a moved block went. It is a fact about a move, which is neither of the two jobs.',
}

/** Every token the register names, foreground, tint or rail — what the census reads. */
export function tokensTheRegisterNames(): string[] {
  const out = new Set<string>()
  for (const role of COLOUR_ROLES) {
    if (role.token !== null) out.add(role.token)
    for (const extra of role.alsoDraws ?? []) out.add(extra)
  }
  return [...out].sort()
}

/** The rows that declare a hue for a review mark, keyed by the mark's own key. */
export function reviewMarkRows(): Map<string, ColourRole> {
  const out = new Map<string, ColourRole>()
  for (const role of COLOUR_ROLES) {
    if (role.id.startsWith('review.mark.')) out.set(role.id.slice('review.mark.'.length), role)
  }
  return out
}

/** Every mark a review can draw whose hue is not null. The register must declare each one. */
export function reviewMarksDrawingAHue(): { key: string; hue: string }[] {
  const out: { key: string; hue: string }[] = []
  for (const [key, mark] of Object.entries(ALL_REVIEW_MARKS)) {
    if (mark.hue !== null) out.push({ key, hue: mark.hue })
  }
  return out
}
