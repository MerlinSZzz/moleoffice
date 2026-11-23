// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD PAGE IS MADE OF, DECLARED IN ONE PLACE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A person right-clicks a paragraph on a record page to write a comment about it, and the browser
 * walks UP from what they pressed until it finds something that says what it is. On 29 August 2026
 * that walk was measured on the five records the owner named, and on four of the five it found one
 * answer and one only: the record itself. Twenty-one headings on module `cegP4HnIk9nd`, twenty-one
 * targets, all of them `record/cegP4HnIk9nd/panelx`. Nine of nine on a block, six of six on a
 * decision, nine of nine on a problem. `design/problem-03/ACCEPTANCE.md` §B1 holds the counts.
 *
 * The mechanical cause is that 24 of the 26 kinds derive no region tree at all — `blocksFieldOf`
 * finds a block field on `report` and `module` only — so there was nothing between a pressed
 * paragraph and the whole record for the walk to stop at.
 *
 * THIS FILE IS THE THING BETWEEN THEM. It declares, per kind, the sections a record page has: the
 * places a reader would name if you asked them what they were looking at. A later step derives a
 * region for each one; this step only says what they are, and makes the drawn body read the same
 * declaration, so the body a reader sees and the tree a press walks cannot disagree.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHY IT IS A RULE RATHER THAN A LIST
 * ---------------------------------------------------------------------------------------
 *
 * A kind's body sections are its declared fields minus `NOT_BODY` minus that kind's `IN_HEADLINE`
 * minus the two fields the reading matter already holds. Nothing is written out per kind, so a
 * renamed field cannot leave a section behind pointing at a key nobody stores. Running the rule is
 * also how the one collision below was found; reading it would not have found it.
 *
 * `SECTIONS_OF` is nonetheless written out kind by kind and typed total over `RecordKind` with no
 * index signature. That is deliberate ceremony: the twenty-seventh kind stops the build and gets
 * looked at by a person, rather than silently getting a page with no sections.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE ANY OF IT WAS DECLARED, 30 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Every non-deleted record in `data/panelx.db` (866 records, 19 of the 26 kinds have one) was read,
 * and every declared field counted for how many records of its kind carry anything in it. Three
 * things came out of that and all three are in the shapes below.
 *
 *   THE MODULE COLLISION IS REAL AND IT IS LIVE. A module declares a prose field `summary` AND a
 *   block field `summaryBlocks`, so the rule above would have produced a body section keyed
 *   `summary` at the same moment `section.summary` was claimed for the reading matter: two
 *   different regions with one id. 10 of 27 modules store the paragraph and 2 store the blocks, so
 *   this is not a case that only exists on paper. It is settled here by folding both fields into
 *   the one reading-matter section, and the rule is written as a rule — a declared field named
 *   `summary` is drawn INSIDE the reading matter and gets no body section of its own — rather than
 *   as an exception for `module`, so a second kind declaring both cannot re-open it.
 *
 *   A MODULE'S BODY SECTIONS ARE NOT DRAWN BY THE FOLD STACK. `RecordDetail` draws `ModuleView` for
 *   a module and `ReportBody` for a report, and hands the fold stack neither. So `bodySections`
 *   has been computing a list for every module and throwing it away: `context` and `summary` on the
 *   eight modules that have both. The section keys are still right — `ModuleView` draws Context,
 *   Parts and Paths as panels of their own — so the declaration below is what is on the module
 *   page, and only the reader that turns them into folds is the stack's.
 *
 *   TWO OF THE FOUR SECTIONS THE DESIGN SAYS EVERY KIND DECLARES ARE NOT ON EVERY KIND.
 *   `shortForms` is declared by `module` and `report` and by no other kind, and the panel that
 *   draws it is behind `kindDeclares(kind, SHORT_FORMS_FIELD)` — so declaring `section.shortForms`
 *   on the other 24 would declare a place that is not on their page. `consequence` is the same:
 *   10 kinds declare it. Both are declared here only where the field is, and this is the one place
 *   this file departs from `design/problem-03/ACCEPTANCE.md` §C2.2, which says "four sections every
 *   kind declares". History and *what is still open around this* really are on every kind:
 *   `RecordRail` is drawn unconditionally, and `StillOpenHere` on every kind whenever something is
 *   open around the record or the reading failed. When nothing is open it draws nothing, in either
 *   mode (decision 8SkQQo1x69IV, revision 3), and the section is still declared, because the
 *   next reading can find something open.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT A SECTION YET, SAID OUT LOUD
 * ---------------------------------------------------------------------------------------
 *
 * ONE SECTION PER LINK RELATION IS NOT IN `SECTIONS_OF`, AND IT IS IN THIS FILE. Which relations a
 * record has links of is a fact about the RECORD and not about its kind — a report is joined to
 * whatever somebody joined it to — so it cannot be written in a table keyed by kind. It is built
 * from the record's own links by `relationSectionsOf` below, which makes the same `SectionSpec`
 * every other section is, so the tree, the panels and the parser all read one shape.
 *
 * A HEADLINE FIELD IS A SECTION WHEN A PANEL REALLY DRAWS IT, AND ONLY THEN. `IN_HEADLINE` says a
 * field is left out of the body; it does not say the field is anywhere. For most of them a panel
 * does draw it and that is measured — `tests/record-body.test.ts` renders a Normal page per kind
 * and fails when a claimed field reaches no screen — but that same test carries six standing
 * exceptions: `block.measured`, `session.workspace`, `purchase.currency`, `purchase.url`,
 * `purchase.vendor` and `obligation.fulfilledNote` are claimed by the headline and drawn by
 * nothing, and `decision.decided_on` is a seventh that the test cannot see. So the fields a panel
 * draws are named in `DRAWN_BY_THE_HEADLINE` below, one table, and nothing is swept in from
 * `IN_HEADLINE` — a section derived for a claimed-but-undrawn field would be a target resolving to
 * nothing on the screen, which is the silent falsehood this cluster exists to remove.
 *
 * WHAT IS STILL NOT DECLARED, COUNTED RATHER THAN GUESSED AT. `DRAWN_BY_THE_HEADLINE` HOLDS TWO
 * KINDS, and this paragraph said "one kind today" until 31 August 2026, when the table already held
 * `proposal` and `problem`. `proposal` came in at step D1, which was asked for the fork in the
 * owner's second dogfood screenshot and for the kinds in its family; `problem` came in at step F2,
 * with the dead ends its own panel draws. `KindLead` in RecordPage.tsx draws a panel for ten more
 * kinds — claim, problem, task, block, session, idea, direction, note, message and annotation — and
 * one more for every kind it has no case for. Every one of those panels still declares
 * `{ surface: null }`. A note IS its body and a press on a note's own words still answers the note.
 * That is the next kind of this same repair and it is written here rather than left to be found.
 *
 * NESTED SHAPES INSIDE A SECTION ARE NOT SECTIONS. A module's `parts` is one section, not one per
 * part; a problem's `attempts` is drawn by its own panel and is not here at all.
 */

import {
  DRAWN_IN_THE_GOVERNS_SECTION,
  GOVERNS_FIELD,
  theGovernedPartsNameSomething,
  theGovernedPlaces,
  theGovernsSectionIsFilled,
} from './governs.ts'
import { KIND_SPECS, blocksFieldOf, declaredTypeOf } from './kinds.ts'
// THE KEY THE PATH OF A QUESTION IS STORED UNDER. Criterion P55.
import { CONFIRMED_BY } from './confirming.ts'
import { LINK_TYPES, type RecordKind, type PanelRecord } from './types.ts'
import { SHORT_FORMS_FIELD } from './zoom.ts'
import { FLOORED_KIND } from './detail.ts'
// WHAT A KIND IS CALLED IN A SENTENCE, for the two section titles that name the record's kind.
// `kindWord` is the one table of those words; a `report` spelled out here would be a second one.
import { kindWord } from './words.ts'

// ============================================================================ the three tables

/**
 * The stored key for an estimate, written once and read by both the panel and the table below.
 *
 * It is a `const` rather than the string typed twice, so the guard in tests/sections.test.ts —
 * which fails when `IN_HEADLINE` names a key no kind declares — covers the panel's lookup as well.
 */
export const EFFORT_KEY = 'effort_hours'

/**
 * WHAT THE ANSWER WILL BE USED TO DO — a field on a proposal, named as it was asked for.
 *
 * It is up here, above `IN_HEADLINE`, because both tables below name it and a `const` cannot be
 * read before it is declared. The other three keys a fork's panel draws are declared under
 * `DRAWN_BY_THE_HEADLINE` with a note of their own; this one is apart from them for that reason
 * and no other.
 *
 * IT MOVED HERE FROM src/web/components/Governance.tsx on 31 August 2026, where it was declared as
 * `RESULT_WILL_BE_USED_TO`, so that the tables and the panel read one spelling and
 * `tests/sections.test.ts` checks it against the field the kind really declares. Governance.tsx
 * re-exports it under the old name for the composer, which imports it from there.
 */
export const RESULT_WILL_BE_USED_TO_KEY = 'resultWillBeUsedTo'

/**
 * The fields each kind's HEADLINE already answers, so the body does not print them again.
 *
 * The keys are field names and can go stale, which is the same exposure `WRITTEN_ELSEWHERE` has and
 * it is closed the same way: tests/sections.test.ts fails if any key here is not a declared field
 * of that kind. A rename becomes a red test rather than a fact that quietly appears twice.
 */
export const IN_HEADLINE: Partial<Record<RecordKind, readonly string[]>> = {
  claim: ['numbers', 'measured_on', 'confidence', 'state', 'retracted_because'],
  obligation: ['due', 'owedTo', 'what_proves_it_done', 'state', 'done', 'fulfilledAt', 'fulfilledNote'],
  problem: ['symptom', 'state', 'attempts'],
  // `effort_hours` is drawn by `WhereThisSits`, with the box that changes it. Naming it here is
  // what stops the body printing the number again under a heading with no way to write it.
  task: ['state', EFFORT_KEY],
  block: ['state', 'measured', EFFORT_KEY],
  session: ['state', 'doing', 'runtime', 'lastOutputAt', 'workspace', 'usageReceipt'],
  idea: ['state', 'would_need'],
  direction: ['question', 'depth', 'depth_reason'],
  // `resultWillBeUsedTo` IS HERE BECAUSE THE PANEL DRAWS IT, AND IT WAS NOT, AND THAT WAS THE BUG.
  // Left off this list, the fold stack printed the sentence a second time under a heading of its
  // own, and the two copies gave a reader two different answers: the fold's copy answered
  // `section.resultWillBeUsedTo`, the panel's copy answered the whole proposal. Measured on all 9
  // of the 33 proposals that write the field, 31 August 2026. See `DRAWN_BY_THE_HEADLINE` below.
  proposal: [
    'question',
    'options',
    'recommendation',
    RESULT_WILL_BE_USED_TO_KEY,
    'because',
    'evidence',
    'revisit_when',
    'extra',
  ],
  purchase: ['state', 'cost', 'currency', 'vendor', 'url', 'needed_by'],
  decision: ['decided_on'],
  message: ['body', 'from', 'read'],
  note: ['body', 'date'],
  // A COMMENT IS ITS WORDS AND WHAT IT WAS LEFT ON, and `CommentSource` prints both.
  //
  // NAMING `body` HERE IS ALSO WHAT TAKES A SECOND BOX OFF THE PAGE. The fold stack draws a
  // "Change body" button beside every body section it prints, and that button writes `data.body`
  // and nothing else — while a comment's TITLE is the first words of its body, written from it by
  // `annotationTitle`. So a person who used it got a comment whose name said one thing and whose
  // words said another. One box writes both, and it is the one in `CommentSource`.
  // `interpretation` IS ON THIS LIST BECAUSE `CommentSource` DRAWS IT BESIDE THE WORDS. Left off,
  // the fold stack drew it a second time, below the body, behind a collapsed disclosure headed
  // with the stored field name — the mechanism rather than the thing — and with no way to change
  // it or take it away.
  annotation: ['body', 'context', 'interpretation'],
  // A report IS these six things. The document prints all of them, so nothing about a report is
  // left to the fold stack — see `ReportBody`. `chaptersRead` is on the byline beside who it is for
  // and which day it is about: criterion C16 says a report says which chapters of the code of law
  // the run read, and a list of numbers under a stored field name in the fold stack would be the
  // mechanism rather than the thing. `answers` is drawn under each question it answers, by the
  // question blocks in ReportBody, so it is not a section of its own either.
  report: ['blocks', 'for', 'date', 'read', 'chaptersRead', 'answers'],
}

/**
 * Three of the four stored keys a fork's own panel draws, written once and read by the panel and
 * the table. The fourth is `RESULT_WILL_BE_USED_TO_KEY`, declared above `IN_HEADLINE` because that
 * table names it too.
 *
 * They are `const`s rather than the strings typed twice, for the reason `EFFORT_KEY` above is one:
 * `tests/sections.test.ts` fails when a key here is not a declared field of that kind, and the
 * guard only covers the panel's lookup as well if the panel reads the same constant.
 */
export const QUESTION_KEY = 'question'
export const OPTIONS_KEY = 'options'
export const RECOMMENDATION_KEY = 'recommendation'

/**
 * THE OTHER THREE STORED KEYS THE FORK'S OWN PANEL DRAWS: why it came up, what it is based on, and
 * when to revisit it.
 *
 * They were headlined and not declared, which is one of the two ways this page can go wrong and the
 * quieter one: `IN_HEADLINE` stopped the fold stack printing them, and nothing put a section under
 * the panel that does print them. Measured on the two proposals the re-gate reads, 31 August 2026:
 * on `0YUEycqbpimi` eleven presses inside *Waiting on you* answered the whole proposal and on
 * `h6O_RMpeYBTD` fourteen did. Among them each of the three evidence lines — the person's own words about
 * what the fork rests on — and the sentence saying when it should be looked at again.
 */
export const BECAUSE_KEY = 'because'
export const EVIDENCE_KEY = 'evidence'
export const REVISIT_WHEN_KEY = 'revisit_when'

/**
 * The stored key *What has already been tried* draws, written once and read by the panel and the
 * table below, for the reason `EFFORT_KEY` is a const: the guard in tests/sections.test.ts only
 * covers the panel's lookup as well if the panel reads this.
 */
export const ATTEMPTS_KEY = 'attempts'

/**
 * THE STORED KEY *What breaks* DRAWS: the sentence somebody wrote about what goes wrong.
 *
 * It is a problem's primary authored text — the thing the kind exists to hold — and it is a const
 * for the reason `ATTEMPTS_KEY` is one: `KindLead` in RecordPage.tsx reads this, so the guard in
 * tests/the-summary-and-the-options-are-parts-of-the-record.test.ts covers the panel's lookup as
 * well as the table's.
 */
export const SYMPTOM_KEY = 'symptom'

/**
 * THE HEADLINE FIELDS A PANEL REALLY DRAWS, WHICH ARE THEREFORE PLACES ON THE PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SECOND TABLE AND NOT A LINE IN `IN_HEADLINE`
 * ---------------------------------------------------------------------------------------
 *
 * `IN_HEADLINE` answers one question: does the FOLD STACK print this field? A field named there is
 * left out of the body, and that is all it says. It does not say the field is anywhere at all —
 * `tests/record-body.test.ts` carries six standing exceptions of fields claimed there and drawn by
 * nothing, and a seventh was measured on 30 August 2026 and is written below.
 *
 * This says the other thing: a panel above the body draws these characters, so a reader can point
 * at them and the region tree must hold a place for them. A field here is in `IN_HEADLINE` too —
 * the two tables are not alternatives — and `tests/sections.test.ts` fails when it is not.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHICH KINDS ARE HERE: A PROPOSAL, 30 AUGUST 2026, AND A PROBLEM, 31 AUGUST
 * ---------------------------------------------------------------------------------------
 *
 * TWO KINDS CLAIM FIELDS HERE, AND THIS HEADING USED TO SAY ONLY ONE DID — *why only a proposal is
 * here today* — after `problem` had been added below it. Everything from here to the end of this
 * comment is the proposal's account; the problem's two fields carry theirs beside them in the
 * table, because that is where a reader looking at `problem: [...]` will be.
 *
 * THE OWNER'S SECOND DOGFOOD SCREENSHOT IS A PROPOSAL. Right-clicking *3 options* on
 * `h6O_RMpeYBTD` answered the whole proposal; so did the question, the recommendation, *Result will
 * be used to*, *Why this came up* and *What this is based on*. Six presses, one answer, measured in
 * a real Chromium before a line of this was written. All six are drawn by `ProposalGovernance`,
 * which declared `{ surface: null }`, so the walk ran past it to the record.
 *
 * The first three below are the three the owner's picture names. `because` and `evidence` are the fourth
 * and fifth, added at step F2, and THIS PARAGRAPH USED TO SAY THEY DID NOT BELONG HERE — *both are
 * inside `<details>` folds that a reader has to open, and a shut fold is not a place on the screen
 * … when those folds open by default they belong here*. The folds still do not open by default,
 * and the sentence was wrong anyway, because it confused the fold with what is behind it.
 *
 * WHAT A SHUT FOLD PUTS ON THE SCREEN IS ITS SUMMARY LINE, and that is where the region is.
 * `ProposalGovernance` puts the section's target on the `<details>` element, so *Why this came up*
 * and *What this is based on (3)* are drawn, are pressable, and are one level under the region.
 * Measured on `0YUEycqbpimi` on 31 August 2026 with the page as it loads and nothing opened: both
 * summaries answer `region/0YUEycqbpimi/section.because` and `…/section.evidence`, one level up,
 * with `checkVisibility` saying they are on the screen and `parentOpen` false.
 *
 * WHAT IS BEHIND THE FOLD IS THE PARAGRAPH AND THE EVIDENCE LINES, and those carry regions of their
 * own — `data.because@0`, `data.evidence[0]` — which a reader reaches by opening it. That is the
 * reading `every-length-pair.mts` made of four paragraphs inside shut tabs, and it is a reading
 * about the CONTENTS. It never said the tab's own handle was nowhere.
 *
 * ---------------------------------------------------------------------------------------
 * `resultWillBeUsedTo` IS THE FOURTH, ADDED 31 AUGUST 2026, AND IT IS A CORRECTION
 * ---------------------------------------------------------------------------------------
 *
 * IT USED TO BE IN NEITHER TABLE, and this paragraph used to give the reason: it was "already a
 * body section of its own". That was true and it was not the whole truth. `ProposalGovernance`
 * draws the sentence as well, in `.px-gov-for`, so the string was on the page TWICE — once in the
 * panel above the body and once in a fold below it. The two copies answered different things: the
 * fold's copy answered `region/<id>/section.resultWillBeUsedTo` one level up, the panel's copy
 * declared nothing and the walk ran past it to `record/<id>/panelx`, four levels up. Two comments
 * on one sentence landed in two different places depending on which copy the reader pressed.
 * Measured in a real Chromium on 31 August 2026 on all 9 of the 33 proposals that write the field:
 * 9 of 9 drew it twice and 9 of 9 disagreed.
 *
 * WHY THE PANEL OWNS IT AND THE FOLD GIVES IT UP. Three reasons, in order of weight.
 *
 *   1. THE PANEL IS WHERE IT WAS ASKED FOR. A proposal should make the person answer, explicitly
 *      or structurally, what the result will be used to do, and the answer has to
 *      be in front of the person deciding, not behind a fold under the options. The panel draws it
 *      directly under the question and draws the blank when nobody filled it in, which is the whole
 *      point of the field. Taking it off the panel would remove the feature.
 *   2. IT MEETS THIS TABLE'S OWN TEST, which the paragraph above sets for `because` and `evidence`
 *      and which they fail: drawn open, above the body, with no fold to press first.
 *   3. THE FOLD WAS THE SECOND COPY, not the first. A fold headed with the field's own name, below
 *      the options, printing a sentence already on screen a few inches up.
 *
 * THE OPTION NOT TAKEN, SAID PLAINLY: letting the panel declare the section AND leaving the fold in
 * place. Both presses would then answer `section.resultWillBeUsedTo` and agree — but one region id
 * would be on two live elements, and `MarkLayer` finds a comment's element with
 * `document.querySelector`, which takes the FIRST match. Somebody's comment would be painted on the
 * copy they were not reading. That is the same hazard group 4 of src/web/components/sections.ts
 * describes, and it is why "declare both" is not the cheap fix it looks like.
 *
 * `SettledPanel` DRAWS IT TOO, AND HAD TO BE MADE TO. A settled proposal is drawn by that panel
 * INSTEAD of this one, and it did not print this field. Claiming the field in `IN_HEADLINE` without
 * that change would have made the sentence vanish from the page the moment somebody settled the
 * fork — a section declared on a place that is on no screen, which is the exact silent falsehood
 * this table exists to refuse. No proposal in the corpus is settled today, so nothing measured
 * would have caught it; it was found by reading and is fixed in the same commit.
 *
 * THE OTHER KIND IN THE SAME FAMILY IS A `decision`, AND IT GETS NOTHING. `KIND_FAMILIES.decisions`
 * holds `proposal` and `decision`. A decision claims exactly one field in its headline —
 * `decided_on` — and every other field it declares is already a body section with a fold of its
 * own. `decided_on` was looked for on a real decision page: `1TgnZ_NZnLlT` stores `2026-07-31`, and
 * that string is nowhere in the rendered page. So it is a SEVENTH standing exception of the kind
 * `tests/record-body.test.ts` lists, not a section — declaring one would put a region on a place
 * that is on no screen. That file does not catch it because a date is drawn reformatted and is
 * excluded from its value search by `NOT_CHECKED_BY_VALUE`.
 */
export const DRAWN_BY_THE_HEADLINE: Partial<Record<RecordKind, readonly string[]>> = {
  proposal: [
    QUESTION_KEY,
    OPTIONS_KEY,
    RECOMMENDATION_KEY,
    RESULT_WILL_BE_USED_TO_KEY,
    BECAUSE_KEY,
    EVIDENCE_KEY,
    REVISIT_WHEN_KEY,
  ],
  // A PROBLEM'S DEAD ENDS, ADDED 31 AUGUST 2026 BY THE SAME MEASUREMENT AND NOT BY THE SAME
  // ARGUMENT. `WhatWasTried` in RecordPage.tsx draws a panel of its own for `attempts`, open, above
  // the body — the two conditions the paragraph above sets — and on `a62SOh9fsPe5` fourteen presses
  // inside it answered the whole problem: the *What was seen* headings, the sentences under them,
  // the *Do not repeat* chips and the lines beside them. That is somebody's writing about what they
  // tried, which is the reading matter this kind exists for.
  //
  // WHAT BREAKS IS THE SECOND, ADDED 31 AUGUST 2026, AND THE EXCEPTION THAT KEPT IT OUT WAS WRONG.
  // The line here read: *`symptom` is drawn as the problem's own lede line by `KindLead`, which is
  // one of the ten panels the paragraph above already names as the next repair of this kind, not
  // this one.* Both halves of that are true and the conclusion does not follow. `data.symptom` is
  // the primary authored text of a problem — the sentence the kind exists to hold — and the panel
  // that draws it, *What breaks*, is drawn open and above the body, which is exactly the test this
  // table sets. Being drawn by a component that also draws nine other kinds is a fact about the
  // component, not about whether this string is a place on the page.
  //
  // MEASURED ON `a62SOh9fsPe5`, 31 August 2026, before the change: two presses inside *What breaks*
  // answered the whole problem — the panel's own heading, and the paragraph under it, which is
  // 1,535 characters of somebody's own writing about what goes wrong. `KindLead` already puts
  // `data-text-field="data.symptom"` on that paragraph, so a person selecting words inside it
  // stored the exact characters — and the thing those characters were said to be part of was the
  // whole problem, because nothing between the paragraph and the page said anything at all.
  //
  // ITS OTHER HEADLINE FIELD IS STILL NOT HERE. `state` is machinery — `NOT_BODY` names it — and
  // the word is drawn with the control that changes it, which is Mole Office rather than the record.
  problem: [ATTEMPTS_KEY, SYMPTOM_KEY],
  // A MESSAGE'S OWN WORDS, ADDED 28 SEPTEMBER 2026 FOR PROBLEM DowO7yEioWp0. The message's page draws
  // them open, above everything else, and the chat draws them in every bubble. Without this line
  // the body was in no region, so a right-click on one sentence of a message could only take the
  // whole message.
  message: ['body'],
}

/**
 * THE HEADLINE FIELDS A PANEL DRAWS BUT GIVES NOBODY A BOX TO WRITE, so the *Add:* row still
 * offers them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TABLE HAD TO EXIST
 * ---------------------------------------------------------------------------------------
 *
 * `AddRow` in src/web/pages/RecordPage.tsx offers every declared field a record has not filled in,
 * minus the ones that already have a control somewhere else on the page. It decided "already has a
 * control" by asking `IN_HEADLINE`, and it said so in as many words: *a field the kind's headline
 * offers already has one there*.
 *
 * THAT WAS A GUESS THAT HAPPENED TO BE RIGHT, AND ON 31 AUGUST 2026 IT STOPPED BEING RIGHT.
 * `IN_HEADLINE` says the fold stack does not print a field. It does not say anybody can write it.
 * Every other headlined field does have a box — `effort_hours` in `WhereThisSits`, an obligation's
 * `state` in its own panel, a `direction`'s `depth` beside the question — so the guess held.
 *
 * `resultWillBeUsedTo` is the first that does not. `ProposalGovernance` draws it read-only, and
 * naming it in `IN_HEADLINE` took away the two ways it could be written on a record page at once:
 * the fold stack's *Change* button, because there is no longer a fold, and this row, because the
 * row skipped headlined fields. Measured on `h6O_RMpeYBTD`, which stores no answer: the words
 * *result will be used to* left the *Add:* row entirely. `completenessOf` does not ask for the
 * field either — it is optional, as decided — so nothing else would have offered it.
 * A person could then read the panel saying *nobody said* and have no way to say.
 *
 * SO THE PREMISE IS WRITTEN DOWN INSTEAD OF ASSUMED. A key here is one whose panel draws it and
 * does not write it, and `AddRow` goes on offering it.
 * `tests/one-stored-string-has-one-answer.test.ts` fails when a key here is not headlined by that
 * kind, because a key that is not headlined was never being skipped and does not belong here.
 *
 * THE OTHER FIX, NOT TAKEN TODAY, SAID PLAINLY: put a box in the governance panel beside the
 * *nobody said* chip, which is where the field is drawn and where the rule this repository follows
 * for `effort_hours` would put it. That is the better home and it is a piece of work of its own —
 * `Governance.tsx` writes nothing today but a promote and an apply, and `FieldWriter` lives in
 * `RecordPage.tsx`, which imports `Governance.tsx`, so reaching it is a cycle rather than an
 * import. Keeping the row honest is the smaller change and it loses nobody the field.
 */
export const DRAWN_BUT_NOT_WRITTEN_BY_A_PANEL: Partial<Record<RecordKind, readonly string[]>> = {
  proposal: [RESULT_WILL_BE_USED_TO_KEY],
}

/**
 * Fields that belong to the machinery rather than to the record's reading matter.
 *
 * `state`, `paused` and `consequence` are what "What this record's own state says" is built from and
 * that panel is one switch away; `source` and `extra` are provenance and an open bag. None of them
 * is a paragraph somebody wrote about the subject, which is what the body is.
 *
 * WHAT THIS LIST MEANS CHANGED ON 30 AUGUST 2026, for one of its six entries. It used to mean "not
 * reading matter, and therefore nowhere in the region tree". `consequence` is drawn by a panel of
 * its own — *What happens if this is left alone* — which is one of the five sections the owner's
 * own test right-clicks, so it is a section here while staying out of the body. The other five are
 * still nowhere: `state`, `paused`, `source` and `extra` are drawn as machinery behind the Inspect
 * switch or as one provenance line, and `whose_move` was the fifth of them.
 *
 * `whose_move` LEFT THAT FIVE ON 31 AUGUST 2026, AND THE SENTENCE THAT HELD IT THERE IS
 * QUOTED RATHER THAN DELETED: it said *a question about the work rather than a place on the page*.
 * The field is still not a body section and this list is unchanged. What changed is that the PANEL
 * drawing it — *Who made this, and whose move it is* — is a place on the page, and its other row is
 * who filed the record, which is provenance and has nothing to do with this field. `WHOSE_MOVE_KEY`
 * below is that section, and it is derived from the panel and not from the stored value, which is
 * why nothing in this list had to move: the same split `consequence` already carries.
 */
export const NOT_BODY: readonly string[] = [
  'source',
  'extra',
  'paused',
  'consequence',
  'state',
  // The repair flow reads this machine state; it is not text for the problem body.
  'mainSuiteFix',
  // Merge-entry repair and take-out references are machinery, not body text.
  'fixRound',
  'takesOut',
  'whose_move',
  // THE CHINESE HALF OF A CHAPTER OR A REGULATION. It is the translation of the
  // title, the summary and the label, which are drawn where they always were, and the office
  // regulations page draws it in Chinese. A body section of its own would print the same words twice
  // under a heading named after the field.
  'zh',
  // A CHAPTER'S NEUTRAL WORDS AND ITS RULES MARKED ONLY FOR THIS OFFICE. Both
  // are read by the regulations page and by tools/rules-chapters.mjs, which writes the default regulations from them;
  // a body section of their own would print a field's stored shape under a heading named after the field.
  'neutral',
  'onlyThisOffice',
  // WHO PASSED THIS QUESTION UP, criterion P55. It belongs beside `whose_move` for the reason
  // `whose_move` is here at all: it is a question about the work rather than a place on the page,
  // and the panel `WHOSE_MOVE_KEY` names is where a reader meets it. A fold of its own in the body
  // would print a list of names and stamps under a heading, which is machinery.
  CONFIRMED_BY,
  // WHO CRITICISED WHAT, AND WHEN, ON A CRITICISM. It names the critic and the work's author and the
  // moment the independent step filed it — a record of the step, not reading matter. The five facts
  // are the criticism's body; the mark is returned by the criticism read, where a caller asks for it.
  'independent',
  // THE SCRUBBED CONVERSATION COPY ON A RUN (wave 13s round 242). It is the run's own transcript, up to the size the
  // sync allows, with the sync's own metadata beside it. A body section would print a whole conversation under a
  // heading named after the field, and the sync's own read is where a person asks for it a page at a time. The field
  // is the record of a step, not reading matter, for the same reason as `independent`.
  'conversationSync',
  // A MESSAGE'S QUOTE POSITIONS. Each number places a quote among the message's words, and the words
  // draw the quotes where they stand, so a section of its own would print bare numbers under a
  // heading. The field stays declared: Developer detail's fold of declared fields lists every field
  // a kind declares, and keeping the field out of the body must not take it off the kind.
  'quotePositions',
]

/**
 * THE FIELDS WHOSE STRINGS ARE RECORD IDS, WRITTEN DOWN BECAUSE NOTHING IN THE DECLARATION SAYS SO.
 *
 * A declared `string[]` is a list of strings whether it holds sentences or ids, so the fold stack
 * drew a trajectory's `plannedStateIds` as `qBTosjpbnqra` and `6qzTxKAgVs1m` — its required field,
 * the whole point of the kind, unreadable. This is the same exposure `RECORD_REF_KEY` has and it is
 * closed the same way: tests/sections.test.ts fails when a key here is not a declared field of that
 * kind, so a rename becomes a red test.
 *
 * IT IS NOT READ OUT OF THE FIELD'S DESCRIPTION. `plannedStateIds` says *THE IDS OF THE PLANNED
 * STATES* and `blockIds` says *the ids of the block records*, so a rule reading the prose would
 * work today — and it is a rule a description can fool, which is the argument `consequence` already
 * carries in src/shared/kinds.ts.
 */
export const RECORD_ID_LISTS: Partial<Record<RecordKind, readonly string[]>> = {
  pipeline: ['blockIds'],
  trajectory: ['plannedStateIds'],
  // ONE ID, NOT A LIST: the run a flow run records and the flow a run named (wave 13p round 25). Drawn raw, the
  // run's id was a machine word on every flow run's page. `BodyValue` draws one id as a list of one.
  // ONE ID: the module whose plan a planning flow run records, at wave 13j round 49.
  flow_run: ['run', 'flow', 'module'],
  session: ['flow'],
  // ONE ID: the record a decision's authority is written down in (wave 13k round 39). Drawn raw, it was a nanoid under
  // "Source of authority" on every decision an agent recorded on the person's words.
  // A LIST OF IDS: the records a decision was based on, at wave 13q round 43. Each is
  // drawn as the record's title, linked to it.
  decision: ['authority_reference', 'basis'],
  // A LIST OF IDS: the person's decisions a secretary's duties rest on (item 2 of wave 13s's requirements).
  secretary_duties: ['restsOn'],
  // ONE ID: the merge entry a backlog item landed in (item 38 of wave 13s's requirements).
  backlog_item: ['landedIn'],
  // ONE ID: the next day's obligation of a daily one, written by the office (item 38 of wave 13s's requirements).
  obligation: ['nextDay'],
  // ONE ID: the design a design review reviews (the design-first build of wave 13s's requirements).
  design_review: ['design'],
  // ONE ID EACH, AND A LIST: the department above, the one it was merged into, and the person's decisions it rests on
  // (step 1 of departments and posts).
  department: ['parent', 'mergedInto', 'restsOn'],
  // A LIST: the packages a key item counts its progress from (point HD-2c of home as a data dashboard).
  key_item: ['packages'],
}

/** True when this field of this kind holds record ids rather than words somebody wrote. */
export function namesRecords(kind: RecordKind, key: string): boolean {
  return (RECORD_ID_LISTS[kind] ?? []).includes(key)
}

/**
 * THE FIELDS THAT HOLD WHO WROTE A RECORD DOWN, stored as the writer's kind and id with one space between,
 * "human <id>" or "agent <handle>". `whoRecordedIt` in src/server/lib/records/who-recorded-it.ts writes it, and
 * tests/a-decisions-fold-names-who-recorded-it.test.ts holds `writerIn` to it. A page draws the writer's name
 * from it, as it draws the writer of a change; developer mode draws what is stored (wave 13k round 39).
 */
export const WRITER_FIELDS: Partial<Record<RecordKind, readonly string[]>> = {
  decision: ['recorded_by'],
}

/** True when this field of this kind holds who wrote the record down, rather than words somebody wrote. */
export function namesAWriter(kind: RecordKind, key: string): boolean {
  return (WRITER_FIELDS[kind] ?? []).includes(key)
}

/** The writer's kind and id out of a stored writer field, or null when what is stored is not that shape. */
export function writerIn(stored: unknown): { actorType: string; actorId: string } | null {
  if (typeof stored !== 'string') return null
  const space = stored.indexOf(' ')
  if (space <= 0 || space === stored.length - 1) return null
  return { actorType: stored.slice(0, space), actorId: stored.slice(space + 1) }
}

/**
 * THE FIELDS THAT HOLD A PARTICIPANT, stored as `{kind, id}` rather than as a writer's one string: the record page
 * draws the name the registries give that participant, and developer mode draws the stored reference. A participant
 * is an object, so without this table the body left the secretary out as a stored shape (wave 13s round 97).
 *
 * It is a table by kind for the same reason `WRITER_FIELDS` and `RECORD_ID_LISTS` are: a key renamed in the schema
 * leaves a stale entry that nothing but tests/sections.test.ts's declared-field check can see.
 *
 * A WRITE ASKS THE SAME TABLE (wave 13s round 142): a value one of these fields is given must name somebody a registry
 * row answers to, because the page draws that row's name. src/server/lib/participant-fields.ts is the check.
 */
export const PARTICIPANT_FIELDS: Partial<Record<RecordKind, readonly string[]>> = {
  secretary_duties: ['secretary'],
  // A department's one supervisor (step 1 of departments and posts).
  department: ['supervisor'],
  // Who set a key item's progress, and who made its estimate (point HD-2c of home as a data dashboard).
  key_item: ['progressSetBy', 'estimatedBy'],
  watch: ['holder'],
  backlog_item: ['placedBy'],
  task: ['holder'],
  // Who asked for a design, and who reviewed one (the design-first build of wave 13s's requirements).
  design: ['assignedBy'],
  design_review: ['reviewer'],
}

/** True when this field of this kind holds a participant reference rather than words somebody wrote. */
export function namesAParticipant(kind: RecordKind, key: string): boolean {
  return (PARTICIPANT_FIELDS[kind] ?? []).includes(key)
}

/**
 * The participant's kind and id out of a stored participant reference, or null when what is stored is not that shape.
 * A stored participant says `person`, where a stored writer says `human`; `writerNamed` is the one reader of both,
 * so the one difference is mapped here and nowhere else.
 */
export function participantIn(stored: unknown): { actorType: string; actorId: string } | null {
  if (typeof stored !== 'object' || stored === null) return null
  const reference = stored as Record<string, unknown>
  const kind = reference['kind']
  const id = reference['id']
  if (typeof kind !== 'string' || typeof id !== 'string' || id === '') return null
  return { actorType: kind === 'person' ? 'human' : kind, actorId: id }
}

/**
 * THE FIELDS THAT HOLD DOORS: ids from the list of what the grant carries. The record page draws each one by the
 * words `whatThisDoorDoes` gives it, and developer mode draws the stored id. A door the list does not name has no
 * words, so the page draws its id and says the list does not name it rather than asking for words that throw.
 */
export const DOOR_LISTS: Partial<Record<RecordKind, readonly string[]>> = {
  secretary_duties: ['doors'],
}

/** True when this field of this kind holds door ids rather than words somebody wrote. */
export function holdsDoors(kind: RecordKind, key: string): boolean {
  return (DOOR_LISTS[kind] ?? []).includes(key)
}

/**
 * THE FIELDS THAT HOLD A LIST OF DATED WORDS, each entry `{at, words}`: words somebody wrote, and when. A decision's
 * `words_since` is the one there is. `drawableAsWords` passed a list only when its first entry was not an object, so
 * "Words added later" had no fold on the record page while the decision's own box listed it (the review of wave
 * 13q's round 35 pictures). `datedWordsIn` is the one reader of the list, for the fold, the region tree and the
 * decision band in src/web/components/Governance.tsx (wave 13k round 39).
 */
export const DATED_WORDS_LISTS: Partial<Record<RecordKind, readonly string[]>> = {
  decision: ['words_since'],
}

/** True when this field of this kind holds a list of dated words. */
export function holdsDatedWords(kind: RecordKind, key: string): boolean {
  return (DATED_WORDS_LISTS[kind] ?? []).includes(key)
}

/**
 * TRUE WHEN THIS FIELD IS A DECISION'S `governs`. Its entries are objects, so without this the
 * body would leave it out as a stored shape; the record page draws each entry as the record's name or the path, read by
 * `theGovernedPlaces` in src/shared/governs.ts.
 */
export function holdsGovernedPlaces(kind: RecordKind, key: string): boolean {
  return kind === 'decision' && key === GOVERNS_FIELD
}

/**
 * WHETHER A DECISION'S GOVERNS SECTION, OR A FIELD IT DRAWS INSIDE IT, IS ON THIS RECORD'S PAGE; null for any other field.
 *
 * The Governs section draws the records part, the files part and what no page fits together. So it is there when any of
 * the three holds something, and the other two are never sections of their own. The body's list (`filledBodySections`)
 * and the region tree (`sectionsOnThisRecord` in src/shared/regions.ts) both ask this, so they agree.
 */
export function theGovernsSectionDecides(kind: RecordKind, key: string, data: Readonly<Record<string, unknown>>): boolean | null {
  if (holdsGovernedPlaces(kind, key)) return theGovernsSectionIsFilled(data)
  if (holdsGovernedPlaces(kind, GOVERNS_FIELD) && DRAWN_IN_THE_GOVERNS_SECTION.includes(key)) return false
  return null
}

/** One entry of a list of dated words, with its place in the stored list, which is the path a quote of it names. */
export interface DatedWords {
  at: string
  words: string
  index: number
}

/** The entries of a stored list of dated words that hold words, read defensively. Anything else is left out. */
export function datedWordsIn(stored: unknown): DatedWords[] {
  if (!Array.isArray(stored)) return []
  return stored.flatMap((one: unknown, index): DatedWords[] => {
    if (typeof one !== 'object' || one === null) return []
    const entry = one as Record<string, unknown>
    const words = String(entry['words'] ?? '')
    return words.trim() === '' ? [] : [{ at: String(entry['at'] ?? ''), words, index }]
  })
}

/**
 * Is anything at all written here? The same reading `completenessOf` makes, for one field.
 *
 * It lives beside the sections because deciding whether a section is FILLED is the question it was
 * written to answer; the record page imports it rather than keeping a second copy, which is what it
 * had until this file existed.
 */
export function isWritten(stored: unknown): boolean {
  if (stored === undefined || stored === null) return false
  return typeof stored === 'string' ? stored.trim() !== '' : true
}

// ============================================================================ what a section is

/**
 * THE KEY THE RECORD'S READING MATTER IS UNDER, on every kind.
 *
 * On a report it holds the report; on a module the curated paragraph and the blocks under it; on
 * the other 24 kinds it holds that kind's body sections and draws no box of its own. It is one word
 * because the owner's test names it — *right-click five different sections — Summary, Consequence,
 * Sources and history, Context, Implementation*.
 */
export const READING_MATTER_KEY = 'summary'

/**
 * THE KEY THE RECORD'S ONE-LINE SUMMARY SITS UNDER — the paragraph in the header, on every kind.
 *
 * IT IS NOT `READING_MATTER_KEY` AND THE TWO MUST NOT MERGE. They are two different stored strings
 * and on a module both are on one page. The envelope `summary` is the column beside `title`: the
 * single line drawn wherever the record is referenced, and drawn again under the title of its own
 * page. `data.summary` is a module's curated paragraph, which `READING_MATTER_KEY` holds. The field
 * declaration in src/shared/kinds.ts says so in its own words — *NOT the same field as the record's
 * envelope `summary`* — and one key for both would be two regions with one id.
 *
 * WHY IT IS A SECTION AT ALL. It is the first item on the owner's own list of the meaningful
 * sections of a page — *Summary; Consequence; Sources & history; Context; Implementation* — and
 * measured on 30 August 2026 it carried no target on any surface: a right-click on the summary of a
 * module, a report, a problem and a note answered the whole record, four presses out of four.
 */
export const SUMMARY_LINE_KEY = 'summaryLine'

/**
 * THE PATH THE ENVELOPE SUMMARY'S CHARACTERS ARE STORED UNDER, which is the bare field name.
 *
 * `stringsOfRecord` on the server names a record's own strings `title`, `summary` and then
 * `data.…`, and the header's `data-text-field` names the same string. So a quote taken from the
 * summary is looked for under the one path all three write, and this constant is that path spelled
 * once. It is deliberately NOT a region id — `data` and `section` are the only two root words a
 * region id may start with, so the section below carries these characters itself rather than
 * hanging a `summary@0` under itself, which `parseRegionId` would refuse.
 */
export const SUMMARY_LINE_FIELD = 'summary'

/**
 * THE KEY THE RECORD'S OWN TITLE SITS UNDER when it is drawn as a reading length.
 *
 * WHY IT EXISTS. Since 3 September 2026 reading length 2 IS the record's `title` column — the
 * owner's decision, criterion A14b of design/pointing-reopened/ACCEPTANCE.md — so a person reading
 * a report at length 2 is reading the title and right-clicking it has to name the title. A region
 * id is what makes that possible, and a region id has to be in the record's own tree or the server
 * answers that the part is not there.
 *
 * IT IS DECLARED ON A REPORT AND ON NO OTHER KIND, and that is deliberate. A page that never draws
 * the title as a length has no such place, and a section for it would be a place nobody can reach:
 * the server would take a comment on it and no page would ever show that comment. A report is the
 * one kind whose own page is read at a length the reader chooses (`FLOORED_KIND` in
 * src/shared/detail.ts carries that ruling), so it is the one kind whose body draws its title as
 * reading length 2.
 *
 * A MODULE HOLDS BLOCKS AND STILL HAS NO SUCH PLACE. Its panel draws the blocks without the
 * record's stored words, so it never draws the opening lines where the title would be a length.
 * This asked whether a kind holds blocks until 30 September 2026, which declared a module's title
 * as a place and left it unreachable (problem 41hWb2rbLJSU). A module panel that starts drawing its
 * title as a length has to declare the section here in the same change.
 * tests/a-record-page-is-a-tree-of-declared-sections.test.ts says a module declares none today, so
 * that change cannot be made without a test being changed in the open.
 */
export const TITLE_LINE_KEY = 'titleLine'

/**
 * THE PATH THE TITLE'S CHARACTERS ARE STORED UNDER, which is the bare field name.
 *
 * The same rule `SUMMARY_LINE_FIELD` above follows and for the same reason: `stringsOfRecord` on
 * the server names a record's own strings `title`, `summary` and then `data.…`, and the heading's
 * `data-text-field` names the same string.
 */
export const TITLE_LINE_FIELD = 'title'

/**
 * THE KEY THE VERSIONS SIT UNDER: what this record HELD BEFORE, and how to put a version back.
 *
 * IT IS ONE OF TWO PROVENANCE SECTIONS AND IT USED TO BE THE ONLY ONE. See `CHANGES_KEY` below for
 * the decision that split them and for why this one keeps the word *history*.
 */
export const HISTORY_KEY = 'history'

/**
 * THE KEY THE CHANGE LOG SITS UNDER: who touched which field, when, in which session.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECISION THIS KEY IS, AND WHY IT WENT THIS WAY
 * ---------------------------------------------------------------------------------------
 *
 * A record page draws TWO provenance panels in two different places: `RecordHistory`, under the
 * header, which is what the record HELD and can put a version back; and the change log at the foot
 * of the rail, which is WHO WROTE WHICH FIELD. Until now the model had one section for both, so
 * only one of them could carry it — one region may only be on one live element, because
 * `MarkLayer` finds a stored comment's element with `document.querySelector` and would paint a
 * comment written on one of them onto the other. The change log carried nothing, and every press
 * inside it walked past eight to fifteen silent elements to the whole record.
 *
 * WHICH OF THE TWO OWNS `section.history` WAS THE QUESTION, AND THE ANSWER IS NEITHER-BY-CONTEST.
 * The page already decided which panel is called History, in words a reader sees:
 * `RecordPage.tsx` moved the word off the change-log fold on purpose, because a person looking for
 * what a record used to say pressed it, got a list of field names and had no reason to think there
 * was anything else. A region id that said `section.history` on the fold whose summary reads *see
 * which fields changed* would be a comment filed under a name the screen gives to the other panel.
 * So the versions keep `history`, and the change log gets a key of its own.
 *
 * IT IS A STATEMENT ABOUT WHAT THE PAGE IS MADE OF, and it is that the page has two provenance
 * parts and not one. The model was a key short; it is not short any more.
 */
export const CHANGES_KEY = 'changes'

/**
 * THE KEY *What was spent on this* SITS UNDER: what the runs that changed this record spent on it.
 *
 * It is the fold under the change log, criterion T2, and it is a place of its own because it says
 * something the change log does not: tokens and time, summed over the runs the log names. It had no
 * key, so a press on it walked up past the rail and answered the whole record, and a comment about
 * the spend was filed as a comment about the record (problem kkxhj88hCHEj).
 *
 * A SECTION AND NOT A SURFACE, for the reason the six derived panels below are sections: it is drawn
 * on one record's page and says something about that record. A surface carries no record.
 */
export const SPENT_KEY = 'spent'

/** The key *What is still open around this* sits under. */
export const OPEN_AROUND_KEY = 'openAround'

/**
 * The key *Decisions about this* sits under: what has already been settled here.
 *
 * Criterion P37 of design/permissions/ACCEPTANCE.md: an agent that joins later is reminded of the
 * decisions already made about the project. It is a SECOND panel beside
 * *What is still open around this* and not a part of it: that one draws the six open-loop kinds,
 * whose own declaration says a decision is not among them because what happened is not something
 * anybody has to finish.
 */
export const DECIDED_HERE_KEY = 'decidedHere'

/**
 * The key *Checklists about this …* sits under: the checklists with an item linked to this record or to a part of it,
 * read by the related door (GET /api/records/:id/related) as the decisions and the reports beside it are.
 */
export const CHECKLISTS_ABOUT_KEY = 'checklistsAbout'

/** The key *Where this lives* sits under: the files this record's work is in. */
export const WHERE_IT_LIVES_KEY = 'whereItLives'

/** The key *What this was made of* sits under: what this record's membership was built from. */
export const MADE_OF_KEY = 'madeOf'

/**
 * The key *Tool uses* sits under on a run's page: the run's rows in `tool_uses`. It is the key the stored field
 * `data.toolUses` had until migration 0231 moved those lines into the table (wave 13s round 33), so a comment left
 * on that section before the move still finds it.
 */
export const TOOL_USES_KEY = 'toolUses'

/**
 * THE SIX PANELS MOLE OFFICE WORKS OUT ABOUT A RECORD, AND THE KEYS THEY SIT UNDER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THEY ARE SECTIONS AND NOT SURFACES, WHICH WAS THE QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * Each of these panels is drawn on ONE record's page and says something about THAT record. A
 * `uiSurface` target carries no record — see `TARGET_SPECS.uiSurface` in src/shared/targets.ts —
 * so a comment left on one of these panels under a surface name would be a comment about a box
 * that appears on every module page, not about this module. That is a worse answer than the
 * record root, because the record root at least names the right subject.
 *
 * So they are sections, and the argument is the one already written out for `WHERE_IT_LIVES_KEY`
 * above: *the rows inside it name OTHER records and files, and those rows declare what they name.
 * This section is the PLACE on this record's page — the panel a reader is looking at and the thing
 * they mean when they press its heading.* That sentence is true, word for word, of all six.
 *
 * ---------------------------------------------------------------------------------------
 * THEY ARE ALWAYS HERE, WHICH IS THE `whereItLives` RULE AND NOT AN EXCEPTION TO IT
 * ---------------------------------------------------------------------------------------
 *
 * None of them is a stored field, so none of them is filtered by `sectionsOnThisRecord`. Each
 * panel draws its own empty state rather than disappearing — *nobody has written one*, *No
 * direction is linked to this module*, *nothing joined yet* — and an empty box a reader is looking
 * at is still a place on the page. That is exactly how *Where this lives* and *What this was made
 * of* already behave.
 *
 * WHAT DOES NOT CHANGE: A PANEL DRAWN OVER AN UNWRITTEN STORED FIELD STILL DECLARES NOTHING. The
 * Paths panel of a module with no paths is the standing example and it is untouched. `paths` is a
 * declared field of `module`, so its section exists exactly when somebody has written it, and
 * `sectionsOnThisRecord` is where that is decided. Measured on `cegP4HnIk9nd`, 31 August 2026:
 * four presses inside its Paths panel answer the whole module, and all four are on the panel's own
 * furniture and its "none linked" — the empty-field rule working, not a hole in this list.
 */

/** The key *Links* sits under: everything joined to this record, in both directions. */
export const LINKS_KEY = 'links'

/**
 * SECTIONS THAT ARE IN THE TREE AND ON NO PAGE, so nothing may be pointed at them (problem
 * zIdb10n9vao2).
 *
 * `shortForms` is the one. Its panel was taken off the record page on 2 September 2026,
 * because it repeated what was shown above it and was not to be part of the normal UI, and a
 * comment left on it cannot be found or answered. The section stays declared because the written
 * short forms and the parts of the by-part summary are regions under it, and those are drawn: a
 * part is drawn on a drawing's card and in a report body at reading levels 4 to 6 (criterion M16).
 * `checkTarget` in src/server/lib/targets.ts refuses a target naming one of these sections itself.
 */
export const SECTIONS_NO_PAGE_DRAWS: readonly string[] = [SHORT_FORMS_FIELD]

/** The key *Where this module stands* sits under: the word somebody chose, and the counted condition. */
export const STANDING_KEY = 'standing'

/** The key *Claimed source* sits under: what the implementation map says this record's code is. */
export const CLAIMED_SOURCE_KEY = 'claimedSource'

/** The key *How this subsystem may evolve* sits under: the directions opened against this record. */
export const MAY_EVOLVE_KEY = 'mayEvolve'

/** The key *Reports about this …* sits under: what has been written about this record. */
export const REPORTS_ABOUT_KEY = 'reportsAbout'

/** The key *Where this work sits, and how big it is* sits under: what holds it, and the estimate. */
export const WHERE_IT_SITS_KEY = 'whereItSits'

/**
 * THE KEY *Who made this, and whose move it is* SITS UNDER: who filed the record, and who acts next.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A SECTION AT ALL, WHICH THIS FILE SAID TWICE THAT IT WAS NOT
 * ---------------------------------------------------------------------------------------
 *
 * `NOT_BODY` named `whose_move` as *a question about the work rather than a place on the page*, and
 * src/web/components/sections.ts filed the panel under *machinery, not reading matter — a comment
 * about a control is about Mole Office*. Both sentences are about the FIELD and the panel is not
 * only that field. Its first row is who filed the record, read off the change ledger, which is
 * provenance — and criterion 8 of design/problem-03/ACCEPTANCE.md names provenance by name:
 * *derived sections, relationship and link projections, shorter forms, and provenance/history each
 * carry their own target*.
 *
 * Measured on `a62SOh9fsPe5`, 31 August 2026, before this: five presses inside it answered the
 * whole problem — the panel's heading, *Filed by an agent*, the actor's own name
 * `claude-round-ten`, *Needs an agent*, and the sentence saying what that means. The name of the
 * agent that filed a record is not a control; it is the answer to *who made this*.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE KEY IS SPELLED FOR THE FIELD WHEN THE PANEL SAYS TWO THINGS
 * ---------------------------------------------------------------------------------------
 *
 * `RecordDetail` draws this panel exactly when `kindDeclares(kind, 'whose_move')` — on `problem`,
 * `task`, `idea` and `direction` and on nothing else — so the section exists exactly where that
 * field is declared, and it disappears with it. The key is the camel spelling of that gate, and
 * `sectionsDeclaredBy` below asks the same question the page asks rather than keeping a second
 * list of kinds, which is the rule `KINDS_WITH_CODE` already sets.
 *
 * IT IS ONE REGION ON ONE PANEL AND NOT TWO, and that is a limit rather than a preference. A
 * comment on *Filed by an agent* and a comment on *Needs an agent* are both filed under
 * `section.whoseMove`. Splitting them would put two regions on one panel and mean deciding which
 * of the two the panel's heading belongs to; `MarkLayer` finds a stored comment's element with
 * `document.querySelector` and one id may only be on one live element, which is the same limit
 * `CHANGES_KEY` above is written out for.
 */
export const WHOSE_MOVE_KEY = 'whoseMove'

/**
 * THE KINDS WHOSE PAGE DRAWS THE FOUR PANELS OF A MODULE'S OWN VIEW.
 *
 * `ModuleBody` in src/web/pages/RecordPage.tsx mounts `ModuleView` and `Evolution` for one kind and
 * for no other, and those two components hold all four panels. The list is here for the reason
 * `KINDS_WITH_CODE` is: a kind cannot gain the panels without gaining the sections a press on them
 * lands on, and a second list would let the panel be on the page while the region was not in the
 * tree.
 */
export const KINDS_WITH_A_MODULE_VIEW: readonly string[] = ['module']

/**
 * THE KINDS WHOSE PAGE DRAWS *WHERE THIS WORK SITS, AND HOW BIG IT IS*.
 *
 * `RecordDetail`'s kind switch draws `WhereThisSits` for these two and for nothing else.
 */
export const KINDS_WITH_A_PLACE_IN_THE_WORK: readonly string[] = ['task', 'block']

/**
 * THE KINDS WHOSE PAGE DRAWS *WHERE THIS LIVES*, AND THE ONE PLACE THAT LIST IS WRITTEN.
 *
 * `RecordPage` asks it before drawing the panel and this file asks it before declaring the section,
 * so a kind cannot gain the panel without gaining the section a press on it lands on. A second list
 * would be silent: the panel would be on the page and the region would not be in the tree, and the
 * press would walk past it to the whole record — which is the exact fault measured on 30 August
 * 2026 and written up under `sectionsDeclaredBy` below.
 */
export const KINDS_WITH_CODE: readonly string[] = ['module', 'block', 'pipeline']

/**
 * THE KINDS WHOSE PAGE DRAWS *WHAT THIS WAS MADE OF*, for the same reason and in the same way.
 *
 * These are the two kinds whose membership has a stored answer: a pipeline keeps its block order, a
 * module keeps its `implements` links. `src/server/api/composition.ts` refuses any other kind by
 * name and reads this list to say so, so the route, the panel and the section are one fact.
 */
export const KINDS_WITH_COMPOSITION = ['pipeline', 'module'] as const

/**
 * WHERE ONE SECTION'S CONTENT COMES FROM.
 *
 * A closed union, not a string: a section that draws from something new has to be added here, and
 * every reader that switches on it stops compiling until it says what to do with it. Four of the
 * eight name no stored field at all, because four of the sections the owner's test right-clicks are
 * not stored in `data` — they are what Mole Office knows about the record from its links, its
 * ledger, and the repository on disk.
 */
export type SectionFrom =
  /** One declared field of this kind, drawn as the words somebody wrote in it. */
  | { readonly holds: 'field'; readonly field: string }
  /**
   * ONE DECLARED FIELD DRAWN BY THE KIND'S OWN PANEL ABOVE THE BODY, from `DRAWN_BY_THE_HEADLINE`.
   *
   * It holds the same thing a `field` section holds — one stored string or list — and it is a
   * separate arm for one reason: `bodySectionsDeclaredBy` reads `holds === 'field'` to decide what
   * the FOLD STACK prints, and a headline field printed there would be on the page twice. Widening
   * that reader with a second condition would have made the same fact — is this drawn by the stack
   * or by the panel — readable two ways. The arm says it once.
   */
  | { readonly holds: 'headlineField'; readonly field: string }
  /**
   * THE RECORD'S ONE-LINE SUMMARY: the envelope column beside `title`, drawn under it in the header.
   *
   * It names no key of `data` and that is why it is its own arm. On a module `data.summary` is a
   * different string held by the reading matter; see `SUMMARY_LINE_KEY`.
   */
  | { readonly holds: 'summaryLine' }
  /**
   * THE RECORD'S OWN TITLE: the envelope column, which is reading length 2 of a record that has a
   * reading ladder.
   *
   * IT IS A PLACE ON THE PAGE ONLY WHERE THE LADDER DRAWS IT, which is the body of a report or a
   * module panel at length 2. The heading at the top of a record page draws the title too and does
   * NOT declare this section: one region id on two elements is the fault the pointing cluster
   * exists to remove, and the heading is the page naming the record rather than the record's
   * reading ladder drawing a length. Criterion B3.
   */
  | { readonly holds: 'titleLine' }
  /**
   * The record's reading matter. `blocks` names the stored list of curated blocks when the kind has
   * one — `regionsOf` already derives every region inside it, and a later step re-parents that tree
   * here rather than walking the text a second time. `prose` names the paragraph drawn above them.
   * Both are null on a kind that stores neither, and then this section is the parent of the body
   * sections and nothing else.
   */
  | { readonly holds: 'readingMatter'; readonly prose: string | null; readonly blocks: string | null }
  /** The authored short forms, one line each, from the field that stores them. */
  | { readonly holds: 'shortForms'; readonly field: string }
  /** What happens if this record is left alone. Drawn by its own panel, above the body. */
  | { readonly holds: 'consequence'; readonly field: string }
  /** What this record held before, and what happened to it. Not stored in `data`. */
  | { readonly holds: 'history' }
  /**
   * WHO WROTE WHICH FIELD, WHEN, AND IN WHICH SESSION: the change log. Not stored in `data`.
   *
   * A SECOND ARM RATHER THAN A SECOND KEY ON THE FIRST ONE, because `SectionFrom` is what says
   * where a section's content comes from, and these two come from two different tables — the
   * revision ledger and the change ledger. See `CHANGES_KEY` for the decision.
   */
  | { readonly holds: 'changeLog' }
  /** What the runs that changed this record spent on it, read off the change log. Not in `data`. */
  | { readonly holds: 'spent' }
  /** What is still open around this record. Not stored in `data`. */
  | { readonly holds: 'openAround' }
  /** The decisions about this record: linked to it, or settling a fork that is. Not in `data`. */
  | { readonly holds: 'decidedHere' }
  /** The checklists with an item linked to this record or to a part of it. Not in `data`. */
  | { readonly holds: 'checklistsAbout' }
  /**
   * THE FILES THIS RECORD'S WORK LIVES IN, read from the repository index rather than from `data`.
   *
   * The rows inside it name OTHER records and files, and those rows declare what they name. This
   * section is the PLACE on this record's page — the panel a reader is looking at and the thing
   * they mean when they press its heading. The owner's own list of meaningful sections on a module
   * names it: *Summary; Consequence; Sources & history; Context; Implementation; Problems*.
   */
  | { readonly holds: 'whereItLives' }
  /**
   * WHAT THIS RECORD'S MEMBERSHIP WAS MADE OF: its revisions, its links and the change log, read
   * together. Not stored in `data`, and the same argument as *Where this lives* above — the rows
   * name other records, and the panel is a place on this page.
   */
  | { readonly holds: 'madeOf' }
  /**
   * A RUN'S USES OF TOOLS, read from the `tool_uses` table rather than from `data`. Each row is one use, written by
   * the use door against this run. The panel is always declared on a run and says so when no use was written.
   */
  | { readonly holds: 'toolUses' }
  /**
   * EVERYTHING JOINED TO THIS RECORD, IN BOTH DIRECTIONS: the *Links* panel a reader presses.
   *
   * It is the panel, and the relation sections below are the lists of rows inside it. That is why
   * `relationSectionsOf` names this key as the section they sit in: on the screen a *subject of*
   * list is inside the Links panel, and the region tree says the same thing.
   */
  | { readonly holds: 'links' }
  /**
   * WHERE A MODULE STANDS: the state word somebody chose, and the condition counted off its parts.
   *
   * Both readings are drawn by one panel and neither is a body field — `state` is named by
   * `NOT_BODY` and the condition is arithmetic over `data.parts`. The panel is still the place a
   * reader means when they press *Where this module stands*.
   */
  | { readonly holds: 'standing' }
  /** What the implementation map says this record's code is, plus any claim still on the record. */
  | { readonly holds: 'claimedSource' }
  /** The directions opened against this record and the branches off them, worked out from links. */
  | { readonly holds: 'mayEvolve' }
  /** The reports written about this record, read on this record's own page. */
  | { readonly holds: 'reportsAbout' }
  /** What holds this record, and how big somebody said the work is. */
  | { readonly holds: 'whereItSits' }
  /**
   * WHO FILED THIS RECORD, AND WHOSE MOVE IT IS. Two readings, one panel, one place on the page.
   *
   * It names no key of `data` and that is why it is its own arm rather than a `field` on
   * `whose_move`. Half of what the panel draws is not in `data` at all: who filed the record is
   * read off the change ledger by the server, and `NOT_BODY` names `whose_move` so the fold stack
   * never prints it. See `WHOSE_MOVE_KEY`.
   */
  | { readonly holds: 'whoseMove' }
  /**
   * THE RECORDS JOINED TO THIS ONE BY ONE RELATION — the *about* rows, the *subject of* rows.
   *
   * `relation` is the phrase `LINK_TYPES` declares for that link type READ FROM THIS RECORD'S END,
   * which is the same string the server puts on `ResolvedLink.label` and the same words the rows
   * are printed under. It is not stored in `data` and it is not a fact about the kind: it is a
   * fact about which links somebody wrote, so it comes in on the source rather than out of the
   * table below.
   */
  | { readonly holds: 'relation'; readonly relation: string }

/** One section of a record page: what it is called, where its content comes from, what holds it. */
export interface SectionSpec {
  /** Its name. The region id is `section.<key>`, and nothing else may use the same key on a kind. */
  readonly key: string
  /**
   * WHAT THIS SECTION IS CALLED, IN THE WORDS A READER SEES. Written here and nowhere else.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT IS ON THE DECLARATION
   * ---------------------------------------------------------------------------------------
   *
   * A comment left on a declared section has to read back as that section — *the section "What is
   * still open around this"* — and the sentence is built on the server, which has no page to read a
   * heading off. Measured through the running API on 1 September 2026: a paragraph, a table, a
   * headed block, three different declared sections and two stored short forms all read back in the
   * review pane as *the part of the report "…"*, character for character. Eight places, one
   * sentence.
   *
   * Naming a section needs its title, and until this field existed the only place a title was
   * written was a `title=` prop on a panel — one JSX literal per panel, in six components. So the
   * title is declared here, once, and the panels read it. A renamed section then reads the new name
   * in the pane and on the page together, or not at all.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS A NAME, NOT A HEADING WITH FURNITURE
   * ---------------------------------------------------------------------------------------
   *
   * `Panel` draws a `kind` beside its title — *why this exists*, *progress* — and that is a note
   * about the panel rather than the section's name. Those stay on the panels. What is here is what
   * a person would call the place if you asked them where they had left a remark.
   */
  readonly title: string
  readonly from: SectionFrom
  /**
   * The key of the section this one sits inside, or null for a section the record root holds.
   *
   * Only the body sections use it, and they all say `summary`: the fold stack is the record's
   * reading matter drawn a field at a time, so a press inside one has the reading matter as its
   * ancestor at every reading length. That is the ancestry the owner's second act checks.
   */
  readonly inside: string | null
}

// ============================================================================ the three title tables

/**
 * THE HEADLINE FIELDS WHOSE PANEL CALLS THEM SOMETHING A DE-SNAKED KEY CANNOT SAY.
 *
 * `bodyHeading` names every other field on every kind, and it names most of the headline's too:
 * `question` is *Question* and `revisit_when` is *Revisit when*, which is what a reader sees,
 * because those sit inside the fork's own panel with no heading of their own.
 *
 * TWO FIELDS ARE DRAWN BY A PANEL WITH A HEADING, and the heading is not the field's name.
 * *What breaks* is `data.symptom` and *What has already been tried* is `data.attempts`, both on a
 * problem. A reader who left a remark in one of those panels would say they left it on *What
 * breaks*, so that is what the pane has to call it. The panels read these two entries, so there is
 * still one spelling of each.
 */
const HEADLINE_TITLES: Readonly<Record<string, string>> = {
  [SYMPTOM_KEY]: 'What breaks',
  [ATTEMPTS_KEY]: 'What has already been tried',
}

/**
 * THE BODY FIELDS WHOSE KEY DOES NOT SAY WHAT THE FIELD HOLDS, named per kind for what they hold.
 *
 * `bodyHeading` makes a title from the key, and for most fields that is the name a reader needs. On
 * a decision, three keys say how the field is stored rather than what is in it: `option_index` is
 * the option picked in the question, beside *Option taken*, which is the words; `words_since` is the
 * words added after the decision; `authority_reference` is where the authority is written down.
 * The title is the one name of the field: the record page, the decision band, the review pane and
 * the right-click box all read it (wave 13q's round 34, the review of round 33). On a context bundle,
 * `shift` is how many levels the Less and More presses moved every part, which *Shift* does not say.
 */
const FIELD_TITLES: Partial<Record<RecordKind, Readonly<Record<string, string>>>> = {
  merge_entry: { repairOf: 'Hand-back repair', takeBackOf: 'Taken back change', waitsForAFixRound: 'Waits for a fix round' },
  // A criticism's four prose facts are sentences to a reader, and the de-snaked keys ("Tried",
  // "Got in the way", "Did instead", "Wants changed") read as notes rather than questions. The
  // words are in this line's word file and must say exactly these, or the section-title gate fails.
  criticism: {
    tried: 'What was tried',
    got_in_the_way: 'Where the product got in the way',
    did_instead: 'What the agent did instead',
    wants_changed: 'What it wants changed',
  },
  // A push's keys are short for what they hold (wave 13u round 82).
  emergency_push: { root: 'Checkout', mainBefore: 'Main before the push', message: 'Chat message', switch: 'Emergency switch', by: 'Pushed by', line: 'Line the fix came from' },
  notice_rules: {
    mutedKinds: 'Muted notices',
  },
  decision: {
    option_index: 'Option picked in the question',
    words_since: 'Words added later',
    authority_reference: 'Source of authority',
    basis: 'What it was based on',
  },
  context_bundle: {
    shift: 'Detail moved by',
  },
  // On a booking, `gib` is a unit and not a name, and seven keys are shortened past reading.
  booking: {
    gib: 'Card memory in GiB',
    startAsked: 'Start asked for',
    goFirst: 'Request to go first',
    cutIn: 'Going first over a running booking',
    repeat: 'Repeats',
    repeatOf: 'First day of the series',
    overRunTold: 'Told it runs over',
    unbookedTold: 'Jobs with no booking, told',
    unbookedJobsTold: 'Jobs told during this booking',
    use: 'The use, as the GPU tool recorded it',
  },
  flow: {
    step_changes: 'Changes to the steps',
    applies_to: 'Whom it is for',
    retired: 'Retired',
  },
  // On a host job, five keys are short for what they hold, and `sha256` would read "Sha256".
  host_job: {
    sha256: "The program's sha256",
    signal: 'The signal that ended it',
    undeclaredFiles: 'Files it did not declare',
    logTail: 'The end of the log',
    masked: 'What was masked',
  },
  // On a role card's words, four keys name the card's part and not what a reader finds in it, and the
  // two handbook parts are each kept in two languages.
  role_card_words: {
    reportsTo: 'Who it reports to',
    standing: 'Where the person stands',
    workAreaSays: 'What a refused work area says',
    howItWorks: 'How it works, in English',
    howItWorksZh: 'How it works, in Chinese',
    inPractice: 'In practice, in English',
    inPracticeZh: 'In practice, in Chinese',
  },
  // On a run, `stopCause` is why a closed run stopped, and `waitingOnALimit` would read "Waiting on alimit" from its key.
  session: {
    stopCause: 'Why it stopped',
    waitingOnALimit: 'Waiting on a usage limit',
    // `theModelsSteps` would read "The models steps" from its key, with no apostrophe (wave 13n round AK).
    theModelsSteps: "The model's steps",
    // `waitedForASeatSeconds` would read "Waited for aseat seconds" from its key.
    waitedForASeatSeconds: 'Seconds waited for a test seat',
    // `methodWork` holds the run's mark, which says method work or the go for a pilot (wave 13s round 228).
    methodWork: 'Marked as method work or as the go for a pilot',
  },
  // On a secretary's duties, three keys say less than they mean when read on their own.
  // On a department, the names and what it does are each in one language, and its parent is the department above it.
  department: {
    nameEn: 'Name in English',
    nameZh: 'Name in Chinese',
    doesEn: 'What it does, in English',
    doesZh: 'What it does, in Chinese',
    parent: 'The department above it',
    restsOn: "The person's decisions it rests on",
  },
  // On a key item, its place is its place in the order, and its hours left are an estimate, which the title says.
  key_item: {
    place: 'Place in the order',
    hoursLeft: 'Estimated hours left',
  },
  secretary_duties: {
    lines: 'Lines of work',
    doors: "The person's doors it presses",
    restsOn: "The person's decisions it rests on",
  },
  // On a watch, two keys read as one word each, and a reader needs the question they answer.
  watch: {
    wakes: 'Whom it wakes, and when',
    dailyRestart: 'How it starts again each day',
  },
  // On a backlog item, three keys read as one word each, and a reader needs the question they answer.
  backlog_item: {
    number: 'Its number in the line',
    placedAt: 'When it was placed',
    order: 'Its place in the line',
  },
  // On a handbook, two keys read as words that are not a question, and a reader needs the question they answer. Its
  // `for` keeps the title a report's has, since both hold whom the record is written for.
  handbook: {
    hangs_on: 'Where it hangs',
    text_changes: 'Why its text changed',
  },
  // On an obligation, `repeat` is said as a booking's is.
  obligation: {
    repeat: 'Repeats',
  },
  // On a design and a design review, keys a reader would read as one bare word, said as the question they answer.
  design: {
    candidatesAsked: 'How many candidates were asked for',
    candidatesWhy: 'Why that many',
    chosen: 'The candidate chosen',
  },
  design_review: {
    design: 'The design reviewed',
    designRevision: 'The revision reviewed',
    rulesRevision: 'The rules revision it was read under',
    words: 'What the reviewer says',
  },
  // On a design reminder, keys a reader would read as one bare word, said as what each holds (wave 13s round 228).
  design_reminder: {
    work: 'What the run was marked as',
    was: 'A reminder or a miss',
    named: 'What the reminder named',
    reminderLine: 'The office’s line that gave the reminder',
    afterSeal: 'The seal before the reminder',
    missWords: 'What the judge says of the miss',
  },
}

/**
 * WHAT THE READING-MATTER SECTION IS CALLED ON THE TWO KINDS THAT DRAW IT AS A PLACE.
 *
 * `READING_MATTER_KEY` is the string `summary`, and `englishHeading` would make it *Summary* — the
 * name `SUMMARY_LINE_KEY` already has. Two sections of one record reading alike is exactly what a
 * reader cannot act on, so this is named per kind rather than off the key.
 *
 * A KIND THAT IS NOT HERE FALLS TO *What this record says*, which is true of every kind and is a
 * name rather than a shrug. It is not a silent default: the section exists, it is drawn, and this
 * is what it is called until somebody gives that kind's reading matter a better name.
 */
const READING_MATTER_TITLES: Partial<Record<RecordKind, string>> = {
  module: 'Curated summary',
  report: 'The report',
}

// ============================================================================ what a place is called

/**
 * A STORED KEY AS A HEADING: `what_would_prove_it_wrong` -> `What would prove it wrong`.
 *
 * IT MOVED HERE FROM src/web/pages/RecordPage.tsx ON 1 SEPTEMBER 2026, unchanged, because the
 * server names a section now and the rule may not be a browser's. RecordPage re-exports it under
 * the same name; the guards in tests/record-tiers.test.ts and tests/kind-change-and-plain-replies.ts
 * still read it from there and still read the same function.
 *
 * A TABLE MAPPING `what_would_prove_it_wrong` TO ITS HEADING IS WHAT THIS AVOIDS. Rename the field
 * and a table goes on printing the old question, silently, with no type error and no failing test.
 * Every declared key in KIND_SPECS reads as English when it is de-snaked, and
 * tests/record-tiers.test.ts checks that against the whole schema rather than trusting it.
 */
export function englishHeading(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
  return words === '' ? key : `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

/**
 * A BODY SECTION'S HEADING.
 *
 * DERIVED, LIKE EVERY OTHER HEADING ON A RECORD PAGE, with one rule added. A list drawn as names is
 * not a list of ids any more, so `Planned state ids` over two record titles is a heading that
 * describes the storage rather than the screen. The rule is: drop the `Ids` the key ends in and say
 * the plural. It applies only to keys in `RECORD_ID_LISTS`, and there are two.
 */
export function bodyHeading(kind: RecordKind, key: string): string {
  if (!namesRecords(kind, key) || !key.endsWith('Ids')) return englishHeading(key)
  return `${englishHeading(key.slice(0, -'Ids'.length))}s`
}

/**
 * WHAT ONE SECTION OF ONE KIND IS CALLED, or null when that kind declares no such section.
 *
 * NULL IS AN ANSWER AND ITS CALLERS MAY NOT INVENT PAST IT. A relation section — `section.about`,
 * `section.subject of` — is not declared by a kind at all: it exists because somebody wrote a link,
 * and its key IS the phrase a reader sees it under, which `relationSectionsOf` puts on its title.
 * So this answers for the declared sections and the caller that also holds a record's relations
 * asks `sectionsOnThisRecord` instead, which covers both.
 */
export function titleOfSection(kind: RecordKind, key: string): string | null {
  const declared = (SECTIONS_OF as Partial<Record<RecordKind, readonly SectionSpec[]>>)[kind] ?? []
  return declared.find((section) => section.key === key)?.title ?? null
}

// ============================================================================ the declaration

/** The fields the reading-matter section already holds, so the body never draws them again. */
function readingMatterFields(kind: RecordKind): { prose: string | null; blocks: string | null } {
  const spec = KIND_SPECS[kind]
  const prose = spec.fields.some((f) => f.key === READING_MATTER_KEY) ? READING_MATTER_KEY : null
  return { prose, blocks: blocksFieldOf(kind) }
}

/**
 * Every section one kind declares, in the order the page draws them.
 *
 * The consequence panel is above the body, the short forms and the rail are under it, and *what is
 * still open around this* is at the foot — so this order is the page's order, and a reader stepping
 * through the sections steps down the screen.
 */
function sectionsDeclaredBy(kind: RecordKind): readonly SectionSpec[] {
  const spec = KIND_SPECS[kind]
  const declares = (key: string): boolean => spec.fields.some((f) => f.key === key)
  const held = readingMatterFields(kind)
  const out: SectionSpec[] = []

  // THE ONE-LINE SUMMARY, FIRST, BECAUSE IT IS THE FIRST THING UNDER THE TITLE. Every kind has the
  // column, so every kind declares the section; whether a given record HAS one is `isWritten` of
  // its own summary, asked once by `sectionsOnThisRecord`.
  out.push({ key: SUMMARY_LINE_KEY, title: 'Summary', from: { holds: 'summaryLine' }, inside: null })

  // THE RECORD'S OWN TITLE, ON THE ONE KIND WHOSE PAGE DRAWS ITS CONTENT AT A LENGTH: A REPORT.
  // It is reading length 2 there, so the report's body draws it and a reader can point at it. On
  // every other kind nothing draws the title as a length and there is no such place. See
  // `TITLE_LINE_KEY`, which says why a module is not one of them although it holds blocks.
  if (kind === FLOORED_KIND) {
    out.push({ key: TITLE_LINE_KEY, title: 'Title', from: { holds: 'titleLine' }, inside: null })
  }

  // WHO MADE THIS, AND WHOSE MOVE IT IS. `RecordPage` draws it under the header and above
  // everything the record itself says, and it asks `kindDeclares(kind, 'whose_move')` before
  // drawing it — so this asks the same question of the same declaration rather than keeping a
  // second list of kinds beside the page's. See `WHOSE_MOVE_KEY`.
  if (declares('whose_move')) {
    out.push({ key: WHOSE_MOVE_KEY, title: 'Who made this, and whose move it is', from: { holds: 'whoseMove' }, inside: null })
  }

  // THE KIND'S OWN PANEL, ABOVE THE CONSEQUENCE BANNER, WHICH IS WHERE `KindHeadline` DRAWS IT: it
  // renders the kind's lead and then the consequence under it.
  for (const key of DRAWN_BY_THE_HEADLINE[kind] ?? []) {
    // THE HEADLINE'S OWN FIELDS ARE NAMED THE WAY EVERY OTHER FIELD IS, except where the panel
    // drawing one calls it something a de-snaked key cannot say. `HEADLINE_TITLES` holds those and
    // nothing else, so a field added to the headline is named without anybody editing a table.
    out.push({ key, title: HEADLINE_TITLES[key] ?? bodyHeading(kind, key), from: { holds: 'headlineField', field: key }, inside: null })
  }

  // WHERE THIS WORK SITS, which `RecordDetail`'s kind switch draws in place of the kind's lead —
  // so it is here, where a lead panel would be, and above the consequence banner.
  if (KINDS_WITH_A_PLACE_IN_THE_WORK.includes(kind)) {
    out.push({ key: WHERE_IT_SITS_KEY, title: 'Where this work sits, and how big it is', from: { holds: 'whereItSits' }, inside: null })
  }

  if (declares('consequence')) {
    out.push({ key: 'consequence', title: 'What happens if this is left alone', from: { holds: 'consequence', field: 'consequence' }, inside: null })
  }

  // WHAT THIS WAS MADE OF, ABOVE THE RECORD'S OWN BODY, WHICH IS WHERE `RecordDetail` DRAWS IT.
  if ((KINDS_WITH_COMPOSITION as readonly string[]).includes(kind)) {
    out.push({ key: MADE_OF_KEY, title: 'What this was made of', from: { holds: 'madeOf' }, inside: null })
  }

  // THE TWO PANELS `ModuleView` DRAWS ABOVE THE CURATED SUMMARY, in the order it draws them.
  if (KINDS_WITH_A_MODULE_VIEW.includes(kind)) {
    out.push({ key: STANDING_KEY, title: 'Where this module stands', from: { holds: 'standing' }, inside: null })
    out.push({
      key: REPORTS_ABOUT_KEY,
      title: `Reports about this ${kindWord(kind).text}`,
      from: { holds: 'reportsAbout' },
      inside: null,
    })
    // WHAT WAS ALREADY SETTLED HERE. Criterion P37 asks for it on a module, and it is declared where
    // the module's own panels are declared rather than on every kind: a panel saying "no decision is
    // linked to this" on all 2,485 records would be furniture, and furniture stops being read.
    out.push({
      key: DECIDED_HERE_KEY,
      title: `Decisions about this ${kindWord(kind).text}`,
      from: { holds: 'decidedHere' },
      inside: null,
    })
    // THE CHECKLISTS ABOUT IT, read by the one door the reports and the decisions above are read by.
    out.push({
      key: CHECKLISTS_ABOUT_KEY,
      title: `Checklists about this ${kindWord(kind).text}`,
      from: { holds: 'checklistsAbout' },
      inside: null,
    })
  }

  out.push({
    key: READING_MATTER_KEY,
    // THE READING MATTER IS A DIFFERENT PLACE ON EVERY KIND THAT HAS ONE, so it is named per kind
    // rather than by the key. A module's is a paragraph somebody curated; a report's is the report.
    // `Summary` is NOT available here: `SUMMARY_LINE_KEY` above already carries that name, and two
    // sections of one record reading alike is the defect this whole field exists to end.
    title: READING_MATTER_TITLES[kind] ?? 'What this record says',
    from: { holds: 'readingMatter', prose: held.prose, blocks: held.blocks },
    inside: null,
  })

  const headlined = IN_HEADLINE[kind] ?? []
  for (const field of spec.fields) {
    if (NOT_BODY.includes(field.key)) continue
    if (headlined.includes(field.key)) continue
    // The two the reading matter holds. A module declares both, which is the collision this rule
    // settles; see the head of this file.
    if (field.key === held.prose || field.key === held.blocks) continue
    // The short forms have a section and a panel of their own, below the body.
    if (field.key === SHORT_FORMS_FIELD) continue
    out.push({ key: field.key, title: FIELD_TITLES[kind]?.[field.key] ?? bodyHeading(kind, field.key), from: { holds: 'field', field: field.key }, inside: READING_MATTER_KEY })
  }

  // THE TWO PANELS `ModuleView` AND `Evolution` DRAW UNDER THE MODULE'S OWN BODY.
  if (KINDS_WITH_A_MODULE_VIEW.includes(kind)) {
    out.push({ key: CLAIMED_SOURCE_KEY, title: 'Claimed source', from: { holds: 'claimedSource' }, inside: null })
    out.push({ key: MAY_EVOLVE_KEY, title: 'How this subsystem may evolve', from: { holds: 'mayEvolve' }, inside: null })
  }

  // WHERE THIS LIVES, UNDER THE RECORD'S OWN BODY AND ABOVE THE SHORT FORMS, which is where
  // `RecordDetail` draws it.
  if (KINDS_WITH_CODE.includes(kind)) {
    out.push({ key: WHERE_IT_LIVES_KEY, title: 'Where this lives', from: { holds: 'whereItLives' }, inside: null })
  }

  // A RUN'S TOOL USES, under its own body, which is where `RecordDetail` draws them.
  if (kind === 'session') {
    out.push({ key: TOOL_USES_KEY, title: 'Tool uses', from: { holds: 'toolUses' }, inside: null })
  }

  if (declares(SHORT_FORMS_FIELD)) {
    out.push({
      key: SHORT_FORMS_FIELD,
      title: `Shorter forms of this ${kindWord(kind).text}`,
      from: { holds: 'shortForms', field: SHORT_FORMS_FIELD },
      inside: null,
    })
  }
  out.push({ key: HISTORY_KEY, title: 'How this record got here', from: { holds: 'history' }, inside: null })
  // THE LINKS PANEL, in the rail, above the change log. Every record page draws it — measured on
  // all eight pages the re-gate reads, 31 August 2026 — so every kind declares it, exactly as the
  // two provenance sections are declared. The relation lists inside it say they are inside it; see
  // `relationSectionsOf`.
  out.push({ key: LINKS_KEY, title: 'Links', from: { holds: 'links' }, inside: null })
  // THE CHANGE LOG, at the foot of the rail, under the links. It is drawn on every kind exactly as
  // the versions are, so it is declared on every kind exactly as they are.
  out.push({ key: CHANGES_KEY, title: 'Recent changes', from: { holds: 'changeLog' }, inside: null })
  // WHAT WAS SPENT, the fold under the change log. It is drawn on every record page, so it is
  // declared on every kind exactly as the change log is.
  out.push({ key: SPENT_KEY, title: 'What was spent on this', from: { holds: 'spent' }, inside: null })
  out.push({ key: OPEN_AROUND_KEY, title: 'What is still open around this', from: { holds: 'openAround' }, inside: null })
  return out
}

/**
 * THE SECTIONS OF EVERY KIND, TOTAL OVER `RecordKind` WITH NO INDEX SIGNATURE.
 *
 * Written out one kind at a time on purpose. Every line reads the same rule, so nothing here is a
 * second statement of what a kind declares — but a twenty-seventh kind is a missing property and a
 * build that stops, which is a person deciding whether the rule suits it rather than a page that
 * quietly has no sections.
 */
export const SECTIONS_OF: { readonly [K in RecordKind]: readonly SectionSpec[] } = {
  knowledge_entry: sectionsDeclaredBy('knowledge_entry'),
  knowledge_category: sectionsDeclaredBy('knowledge_category'),
  knowledge_bookmark: sectionsDeclaredBy('knowledge_bookmark'),
  knowledge_change: sectionsDeclaredBy('knowledge_change'),
  knowledge_query: sectionsDeclaredBy('knowledge_query'),
  knowledge_rating: sectionsDeclaredBy('knowledge_rating'),
  whole_suite_receipt: sectionsDeclaredBy('whole_suite_receipt'),
  sealed_tip: sectionsDeclaredBy('sealed_tip'),
  merge_entry: sectionsDeclaredBy('merge_entry'),
  emergency_push: sectionsDeclaredBy('emergency_push'),
  module: sectionsDeclaredBy('module'),
  pipeline: sectionsDeclaredBy('pipeline'),
  block: sectionsDeclaredBy('block'),
  session: sectionsDeclaredBy('session'),
  problem: sectionsDeclaredBy('problem'),
  task: sectionsDeclaredBy('task'),
  purchase: sectionsDeclaredBy('purchase'),
  obligation: sectionsDeclaredBy('obligation'),
  claim: sectionsDeclaredBy('claim'),
  proposal: sectionsDeclaredBy('proposal'),
  decision: sectionsDeclaredBy('decision'),
  idea: sectionsDeclaredBy('idea'),
  // The five facts a reader came for: tried, got_in_the_way, did_instead, wants_changed and evidence.
  criticism: sectionsDeclaredBy('criticism'),
  direction: sectionsDeclaredBy('direction'),
  wanna_try: sectionsDeclaredBy('wanna_try'),
  message: sectionsDeclaredBy('message'),
  note: sectionsDeclaredBy('note'),
  report: sectionsDeclaredBy('report'),
  draft: sectionsDeclaredBy('draft'),
  annotation: sectionsDeclaredBy('annotation'),
  agent: sectionsDeclaredBy('agent'),
  stopping_point: sectionsDeclaredBy('stopping_point'),
  placeholder: sectionsDeclaredBy('placeholder'),
  ran_instead: sectionsDeclaredBy('ran_instead'),
  work_domain: sectionsDeclaredBy('work_domain'),
  trajectory: sectionsDeclaredBy('trajectory'),
  planned_state: sectionsDeclaredBy('planned_state'),
  context_bundle: sectionsDeclaredBy('context_bundle'),
  role_card: sectionsDeclaredBy('role_card'),
  role_card_words: sectionsDeclaredBy('role_card_words'),
  role_request: sectionsDeclaredBy('role_request'),
  notebook: sectionsDeclaredBy('notebook'),
  incident: sectionsDeclaredBy('incident'),
  regulation: sectionsDeclaredBy('regulation'),
  goal: sectionsDeclaredBy('goal'),
  flow: sectionsDeclaredBy('flow'),
  flow_run: sectionsDeclaredBy('flow_run'),
  host_job: sectionsDeclaredBy('host_job'),
  pack: sectionsDeclaredBy('pack'),
  notice_rules: sectionsDeclaredBy('notice_rules'),
  quick_note: sectionsDeclaredBy('quick_note'),
  counter: sectionsDeclaredBy('counter'),
  tool_category: sectionsDeclaredBy('tool_category'),
  tool: sectionsDeclaredBy('tool'),
  checklist: sectionsDeclaredBy('checklist'),
  booking: sectionsDeclaredBy('booking'),
  secretary_duties: sectionsDeclaredBy('secretary_duties'),
  department: sectionsDeclaredBy('department'),
  key_item: sectionsDeclaredBy('key_item'),
  watch: sectionsDeclaredBy('watch'),
  backlog_item: sectionsDeclaredBy('backlog_item'),
  handbook: sectionsDeclaredBy('handbook'),
  project_chapter: sectionsDeclaredBy('project_chapter'),
  design: sectionsDeclaredBy('design'),
  design_review: sectionsDeclaredBy('design_review'),
  design_reminder: sectionsDeclaredBy('design_reminder'),
}

// ============================================================================ the link relations

/**
 * EVERY PHRASE A LINK ROW CAN BE PRINTED UNDER, both ends of every declared link type.
 *
 * It is derived from `LINK_TYPES` rather than listed, so a fourteenth link type is a relation
 * section without anybody editing this file — and `tests/sections.test.ts` reads it to prove that
 * no kind declares a section whose key is one of these words. That collision would be two different
 * regions with one id, which is the exact fault `section.summary` was settled to avoid on `module`.
 * Measured on 30 August 2026: 33 phrases, 0 of them a section key of any of the 26 kinds.
 */
export const LINK_RELATION_PHRASES: ReadonlySet<string> = new Set(
  Object.values(LINK_TYPES).flatMap((def) => [def.forward, def.reverse]),
)

/**
 * ONE SECTION PER RELATION THIS RECORD HAS LINKS OF, in the order the phrases were handed over.
 *
 * WHY THE KEY IS THE PHRASE AND NOT THE STORED LINK TYPE. `about` read from the other end is
 * *subject of*, and a record's page draws the two as two different lists of rows under two
 * different words. Keying by `about` would give one region for both, so a comment left under
 * *subject of* would be filed under the region the *about* rows are drawn in. The phrase is what a
 * reader sees and it is what `LINK_TYPES` declares; nothing here invents a word.
 *
 * A PHRASE WITH A SPACE IN IT IS A LEGAL REGION ID and that was checked rather than assumed:
 * `parseRegionId` reads a name step as everything up to the next `.`, `[` or `@`, so
 * `section.subject of` parses and spells back character for character.
 *
 * THE SAME PHRASE TWICE GIVES ONE SECTION. Eighteen *subject of* rows are eighteen rows of one
 * list, and one region may only be on one live element.
 */
export function relationSectionsOf(relations: readonly string[]): readonly SectionSpec[] {
  const out: SectionSpec[] = []
  const seen = new Set<string>()
  for (const relation of relations) {
    if (relation === '' || seen.has(relation)) continue
    seen.add(relation)
    // INSIDE THE LINKS PANEL, WHICH IS WHERE THE ROWS ARE DRAWN. `LINKS_KEY` is declared on every
    // kind by `sectionsDeclaredBy` above, so this parent is always in the tree; nothing here has to
    // ask whether it is. Before 31 August 2026 these sat directly under the record root, which said
    // the relation lists were beside the panel that holds them rather than in it.
    // THE PHRASE IS THE KEY AND IT IS ALSO THE NAME. A reader sees these rows under the words
    // `LINK_TYPES` declares for this end of the link, and that is what the list is called; there is
    // nothing else it could be called and nothing here invents a word.
    out.push({ key: relation, title: relation, from: { holds: 'relation', relation }, inside: LINKS_KEY })
  }
  return out
}

/** One relation's rows: the phrase they are read under, the rows a short list drew, the rest. */
export interface RelationGroup<Link> {
  /** `ResolvedLink.label` — the phrase from this record's end. It is the section's key. */
  relation: string
  rows: readonly Link[]
  /** How many links of this relation the rail did not draw. */
  more: number
}

/**
 * A RECORD'S LINKS, GROUPED BY THE RELATION THEY ARE READ UNDER, EVERY RELATION PRESENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE GROUPING EXISTS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * The dogfood review asks that a link row carry the relation as well as the record, with enough
 * context for a recipient or an agent's suggestion. A region may be on one live element only, so the
 * relation cannot be a region on each of eighteen rows; it is a region on the ONE list they are
 * drawn in, and that list needs to exist as an element. This is that list.
 *
 * It also takes a repetition off the screen. The rail used to print the phrase on every row —
 * *subject of X*, *subject of Y*, *subject of Z* — and now prints it once above them.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY RELATION GETS A ROW, AND THAT IS THE CHANGE TO WHAT IS DRAWN
 * ---------------------------------------------------------------------------------------
 *
 * The rail used to take the first `RAIL_LINKS` links off the front of one list, so a record whose
 * first five links were all *subject of* drew nothing at all about what it is *about*. The budget
 * is the same number of rows; it is now handed round the relations one at a time, so the shortest
 * possible answer still says which kinds of neighbour this record has.
 *
 * THAT IS ALSO WHAT KEEPS THE REGION TREE HONEST. `regionTreeOf` on the server derives one section
 * per relation from ALL of a record's links, and it cannot know how many rows a rail drew. If a
 * relation could be missing from the rail, the server would hold a region for a heading that is on
 * no screen — the silent falsehood this cluster exists to remove. Every relation drawing a group is
 * what makes the two agree.
 */
export function relationGroups<Link extends { label: string }>(
  links: readonly Link[],
  budget: number,
): readonly RelationGroup<Link>[] {
  const byRelation = groupedByRelation(links)
  const taken = new Map<string, number>()
  // ONE ROW EACH, ROUND AND ROUND, until the budget is spent or every link is drawn. A relation
  // with one link is finished on the first pass and stops taking from the budget.
  let left = Math.max(budget, byRelation.size)
  let gave = true
  while (left > 0 && gave) {
    gave = false
    for (const [relation, all] of byRelation) {
      if (left === 0) break
      const already = taken.get(relation) ?? 0
      if (already >= all.length) continue
      taken.set(relation, already + 1)
      left -= 1
      gave = true
    }
  }
  return [...byRelation].map(([relation, all]) => {
    const shown = taken.get(relation) ?? 0
    return { relation, rows: all.slice(0, shown), more: all.length - shown }
  })
}

/** The links, in a map keyed by relation, each relation keeping the order they arrived in. */
function groupedByRelation<Link extends { label: string }>(links: readonly Link[]): Map<string, Link[]> {
  const byRelation = new Map<string, Link[]>()
  for (const link of links) {
    const held = byRelation.get(link.label)
    if (held === undefined) byRelation.set(link.label, [link])
    else held.push(link)
  }
  return byRelation
}

/**
 * THE SAME GROUPS WITH NO BUDGET: every link drawn, `more` zero on every one of them.
 *
 * The rail draws five rows and says how many it left out. The panel the rail's fold opens is the
 * whole list — twenty rows on the report in the screenshot — and it needs the same grouping for
 * the same reason: the relation is a region, a region is declared on the LIST its rows are drawn in
 * and never on each row, so the rows of one relation have to be inside one element before a press on
 * one of them can say which relation it was pointed at from.
 *
 * IT IS A SECOND ENTRY POINT AND NOT A SECOND GROUPING. Both read `groupedByRelation`, so the two
 * lists cannot come to different ideas of which relations a record has or what order they go in.
 * Calling `relationGroups(links, links.length)` would have been the same answer by arithmetic that
 * has to be checked; this one cannot drop a row.
 */
export function everyRelationGroup<Link extends { label: string }>(
  links: readonly Link[],
): readonly RelationGroup<Link>[] {
  return [...groupedByRelation(links)].map(([relation, all]) => ({ relation, rows: all, more: 0 }))
}

// ============================================================================ reading it back

/**
 * Every section of a kind that the FOLD STACK prints, in the page's order.
 *
 * It reads `holds === 'field'` and nothing else, which is the whole of the distinction between the
 * two field-holding arms: a `headlineField` is drawn by the kind's own panel above the body, and
 * printing it here too would put one stored string on the page twice under two headings.
 *
 * `SECTIONS_OF` is total over the kinds Mole Office knows, and a record whose stored kind is not one
 * of them can still reach a reader — so the lookup is checked rather than trusted, and an unknown
 * kind gets no body rather than a thrown page.
 */
export function bodySectionsDeclaredBy(kind: RecordKind): readonly SectionSpec[] {
  const declared = SECTIONS_OF[kind] as readonly SectionSpec[] | undefined
  if (declared === undefined) return []
  return declared.filter((section) => section.from.holds === 'field')
}

/**
 * CAN THIS STORED VALUE BE DRAWN AS READING MATTER, OR IS IT A SHAPE THE FOLD STACK CANNOT PRINT?
 *
 * Prose and lists of prose only, and the lists of dated words `DATED_WORDS_LISTS` names. A nested
 * object drawn in the body would be the JSON dump that tier exists to replace, and it is whole and
 * reachable in Inspect. This is the reading `bodySections` has always made, moved here so that the
 * body and the sections agree by construction
 * rather than by two functions asking the same question in two ways.
 *
 * A PARTICIPANT AND A LIST OF DOORS ARE DRAWN BY THEIR OWN READERS, not as their stored shape: the participant as the
 * registry's name, and each door as what it does. Their tables say which fields they are, so the body draws them and
 * a renamed key fails the declared-field check rather than leaving the field out silently.
 *
 * IT IS EXPORTED BECAUSE THE REGION TREE ASKS THE SAME QUESTION FOR A DIFFERENT REASON.
 * `recordRegionsOf` in src/shared/regions.ts cuts regions out of a section's stored value only when
 * the value is words somebody reads; a module's `parts` is a shape ModuleView draws as a panel of
 * its own, and "[object Object]" is not a paragraph anybody wrote. One export rather than a second
 * copy of the rule.
 */
export function drawableAsWords(kind: RecordKind, key: string, value: unknown): boolean {
  const field = KIND_SPECS[kind]?.fields.find((f) => f.key === key)
  if (field === undefined) return false
  const node = declaredTypeOf(field)
  return (
    (node.kind === 'scalar' && node.name !== 'boolean') ||
    node.kind === 'literals' ||
    (node.kind === 'array' && typeof (value as unknown[])[0] !== 'object') ||
    // A PARTICIPANT IS AN OBJECT DRAWN BY ITS REGISTRY NAME, not as a stored shape.
    (namesAParticipant(kind, key) && participantIn(value) !== null) ||
    // EACH DOOR IS DRAWN BY WHAT IT DOES, not by its stored id.
    (holdsDoors(kind, key) && Array.isArray(value)) ||
    // A LIST OF DATED WORDS IS WORDS, drawn by the one reader of its entries rather than as "[object Object]".
    (holdsDatedWords(kind, key) && datedWordsIn(value).length > 0) ||
    // WHAT A DECISION GOVERNS IS NAMES, THE WHOLE PROJECT AND OLD PATHS, drawn by the one reader of its entries, which
    // also names an entry it could not read.
    (holdsGovernedPlaces(kind, key) && theGovernedPartsNameSomething(theGovernedPlaces(value)))
  )
}

/**
 * The body sections THIS record fills, in the order its kind declares its fields.
 *
 * DECLARATION ORDER IS THE ONLY ORDER THAT CANNOT DRIFT. A hand-picked order per kind would be a
 * third place that has to agree with the schema; the schema already puts the fields somebody
 * thought were important first, and it is the order `GET /api/kinds` serves.
 *
 * A SECTION A RECORD HAS NOT FILLED IS NOT DRAWN, and that is not the same as the kind not
 * declaring it: the first is a field nobody has written yet and the "Add:" row at the foot of the
 * body offers it by name.
 *
 * IT ASKS FOR THE KIND AND THE DATA RATHER THAN FOR A WHOLE `PanelRecord`, because those are the
 * two things it reads. `recordRegionsOf` in src/shared/regions.ts derives the region tree from the
 * same two and calls this so that the sections a press walks and the folds a reader opens are one
 * list. A `PanelRecord` still satisfies it, so the record page's call is unchanged.
 */
export function filledBodySections(record: { kind: RecordKind; data: PanelRecord['data'] }): readonly SectionSpec[] {
  return bodySectionsDeclaredBy(record.kind).filter((section) => {
    const governed = theGovernsSectionDecides(record.kind, section.key, record.data)
    if (governed !== null) return governed
    const value = record.data[section.key]
    return isWritten(value) && drawableAsWords(record.kind, section.key, value)
  })
}
