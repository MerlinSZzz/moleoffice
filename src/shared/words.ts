// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS A PERSON READS FOR THE WORDS MOLE OFFICE STORES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office prints its own vocabulary at the reader. A record tagged "wanna_try", a link row saying
 * "part_of", a change row saying "human": every one of those is a column value that a program
 * chose, showing on a screen a person reads. The standard is that a person can use the
 * product without needing to understand Mole Office's internal record model or read a manual.
 *
 * So every stored word passes through here on its way to a screen, and the same stored word comes
 * out as the same reader's word everywhere. That is the point: the Tag component printed the stored
 * kind straight through in more than a dozen places while Home hid the same tag, which is one fact
 * drawn two ways.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "EVERY STORED WORD" MEANT UNTIL 25 AUGUST 2026, AND WHAT IT MEANS NOW
 * ---------------------------------------------------------------------------------------
 *
 * THE SENTENCE ABOVE WAS WIDER THAN THIS FILE FOR A WHILE, AND SAYING SO IS PART OF THE FIX. The
 * wave that moved this file down to src/shared covered SIX words end to end — the six a comment to
 * an agent can be in — and the commit message said "one table of readings, in the layer the browser
 * and the server both reach". The verifier checked it and found two lists: changing `handled` here
 * moved the review pane, and changing `worked_around` one line further down moved nothing at all,
 * because the state chip read a five-word table in src/web/components/ui.tsx instead of this one.
 *
 * IT IS TRUE OF THE WHOLE VOCABULARY NOW, and that is what the sentence means:
 *
 *   every record kind      KIND_WORDS below, which `Record<RecordKind, string>` makes exhaustive
 *   38 state words         STATE_WORDS below, plus STATE_WORDS_BY_KIND for the one that reads
 *                          differently on one kind
 *   3 actor types          ACTOR_WORDS below
 *   13 link types          read from LINK_TYPES, both ends
 *   7 progress words       read from DISPLAY_WORDS through `displayWord`
 *
 * `readerWord` at the foot of this file answers for a value from ANY of those five, which is what a
 * caller holding a `state` column needs, because a `state` column is not always a state word. The
 * three tables that used to answer beside it are gone: STATE_SHOWN_AS and STATE_SHOWN_AS_BY_KIND in
 * ui.tsx, and a table also called STATE_WORDS there that gave Title-Case readings for seven of the
 * same stored words and said `todo` reads "Todo" where this one says "to do".
 *
 * WHAT KEEPS IT TRUE IS NOT THIS PARAGRAPH. `tests/the-machine-word-gate.test.ts` fails when a
 * stored word reaches a screen unread, when a reading holds an underscore, and when any of these
 * functions hands back the word it was given. `tests/machine-words.ts` is its scanner and prints
 * the count. Five waves fixed sites one at a time with no gate, and a verifier found more each time.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS IN src/shared BECAUSE THE SERVER WRITES SENTENCES A PERSON READS TOO
 * ---------------------------------------------------------------------------------------
 *
 * THIS FILE WAS `src/web/lib/words.ts` UNTIL 25 AUGUST 2026, AND THAT WAS THE DEFECT RATHER THAN
 * THE FIX. The review pane's rows were given this table on 25 August; two days of verification
 * later the SAME machine word was found two lines below the row it had just been taken out of —
 * `src/server/lib/reviews.ts` printed *Mole Office has it stamped "handled"* into the sentence under the
 * comment, because the server could not reach a file in `src/web`. The row said "Dealt with" and
 * the sentence under it said "handled": one fact, one screen, two words.
 *
 * A SECOND TABLE ON THE SERVER WOULD HAVE BEEN THE SAME DEFECT AGAIN. It is this repository's named
 * and recurring one — two declarations of one fact, agreeing on the day they are written and
 * drifting after — and it had by then been found three times in one campaign. So the table came
 * down a layer instead, to the one place both sides can import, and `src/web/lib/words.ts` is now a
 * re-export of THIS object: the browser and the server hold the same `STATE_WORDS`, not two copies
 * that match.
 *
 * WHAT KEEPS IT ONE. `tests/one-table-of-readings.test.ts` holds the browser's word and the
 * server's word for one state to the same literal, asserts the two modules export the SAME OBJECT
 * rather than equal ones, and scans `src/` for a second table keyed by the same stored words. A
 * change to a reading here turns the browser's test and the server's test red together; two lists
 * that agree today would turn only one.
 *
 * ANYTHING IN HERE MAY BE PRINTED BY THE SERVER, so nothing in this file may import from `src/web`,
 * read `window`, or touch the database. Its table entries are read in the page language in a browser and in English under Node.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR RULES THESE WORDS FOLLOW
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE STORED WORD NEVER CHANGES. Renaming a value in the database would cost a migration, the
 *    API schema and every agent's skill file. The two are separated instead: the database keeps its
 *    spelling, and this says what to print.
 *
 * 2. WHERE THE STORED WORD IS ALREADY PLAIN ENGLISH, THE READER'S WORD IS THE SAME WORD. Most of
 *    the tables below are the stored word repeated, and that is the correct answer rather than a
 *    missing one. Paraphrasing "problem" into "something wrong" would make the product harder to
 *    talk about, not easier. Most of the kinds are unchanged for that reason, and so is every state
 *    word but one. (This said "thirteen of the sixteen" while there were twenty kinds. A count in a
 *    comment is a promise nothing checks, and this one had been wrong for two waves.)
 *
 * 3. A WORD WE DO NOT HAVE IS NOT A BLANK. A value no table below knows comes back as
 *    "unknown kind: wibble", with `standing` set to `unknown`, in BOTH modes. Never an empty
 *    string, and never the raw stored value on its own — a screen that silently prints the raw
 *    value is how a missing word survives for months.
 *
 * 4. NOTHING IS STORED IS A THIRD ANSWER. An empty or missing value comes back with `standing` set
 *    to `absent` and the text "not recorded", which is different from a value we have no word for.
 *    A caller that wants its own sentence for that reads `standing` and writes its own.
 *
 * ---------------------------------------------------------------------------------------
 * NORMAL AND DEVELOPER ARE ONE CALL, NOT A BRANCH IN EVERY CALLER
 * ---------------------------------------------------------------------------------------
 *
 * The developer's word IS the stored one — that is what the Developer switch is for. So every
 * function here takes the mode and answers with the right word for it, and the returned object
 * carries `stored` as well, for a caller that wants to show both. No caller writes
 * `mode === 'inspect' ? kind : kindWord(kind)`, because that expression written in nine components
 * is nine places one fact can be got wrong.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY DOES NOT RESTATE
 * ---------------------------------------------------------------------------------------
 *
 * LINK LABELS. `LINK_TYPES` in src/shared/types.ts already declares both readings of every link —
 * "part of" forward and "has part" back — in plain English, in one place. `linkWord` reads that
 * declaration. A table here would be a second copy of it.
 *
 * FAMILY LABELS. `KIND_FAMILIES` in src/shared/work.ts already carries a label per family.
 * `familyWord` reads it.
 *
 * PROGRESS WORDS. `DISPLAY_WORDS` in src/shared/work.ts already says what the seven progress words
 * read as. `progressWord` reads it through `displayWord`.
 *
 * WHAT A PROJECT IS CALLED. `projectName` in src/web/components/projects.tsx is the only function
 * in the browser that names a project and it stays that way — call it directly. It is NOT
 * re-exported from here, and the reason WAS mechanical: that file imports src/web/api.ts, which
 * imports src/web/lib/workspace.ts, whose module scope calls loadWorkspace, which reads
 * window.localStorage. Importing projects.tsx from here was tried and it failed with "window is not
 * defined" before a single test ran.
 *
 * SINCE THIS FILE MOVED TO src/shared THAT REASON IS NO LONGER THE BINDING ONE, and the honest
 * statement is stronger: a shared module MAY NOT import src/web at all, whatever that module reads.
 * The fix is unchanged in shape — `projectName` moves into a React-free module, and under the new
 * layering that module has to be in src/shared for this file to re-export it. Reported, not worked
 * around: there is no second project-naming function here.
 *
 * ---------------------------------------------------------------------------------------
 * ONE TABLE, AND A TEST THAT KEEPS IT COMPLETE
 * ---------------------------------------------------------------------------------------
 *
 * A record kind, a state word or an actor type in the shared declarations has a word here, and a
 * word here names a value the declarations still have. The test that failed on either was deleted on 12 November 2026,
 * so adding a kind means adding its word by hand.
 *
 * It also fails when two vocabularies read one stored word differently. Four stored words are in
 * two vocabularies at once — `agent` is a kind and an actor type, `finished`, `paused` and
 * `unknown` are a state and a progress word — and `readerWord` searches them in a fixed order, so a
 * fifth that disagreed would make its answer depend on the order of five lines in one function.
 *
 * It also fails when a word here disagrees with `DISPLAY_WORDS` in src/shared/work.ts, which is the
 * older and smaller table of the same idea. Two tables saying different things about "wanna_try" is
 * this repository's recurring defect; the test is what stops it while both exist. `displayWord`
 * should end up private to this file.
 */

import { PROVENANCE, RELATIONS, type Provenance, type Relation } from './implementation.ts'
import { PRODUCT_NAME } from './product.ts'
import { WANTED, wantedNamed, type Purpose, type Verdict } from './ops.ts'
import { LINK_TYPES, type ActorType, type ChangeOp, type LinkType, type RecordKind } from './types.ts'
import { KIND_FAMILIES, PROGRESS, displayWord, fieldWords, type KindFamily } from './work.ts'
import { TOOL_USE_APPENDED_FIELD, TOOL_USES_FIELD } from './toolset.ts'
// The words a person reads for a world. The table is in JavaScript because two tools print it and
// neither can read TypeScript; its own header says so in full.
import { WORLD_KIND_WORDS as WORLD_KIND_ENGLISH, WORLD_STANDING_WORDS as WORLD_STANDING_ENGLISH } from '../config/world-words.mjs'
// TYPE ONLY, and erased before this module runs. The two words are declared in src/shared/mode.ts
// rather than beside the switch in src/web/lib/mode.ts, which imports React, so that this file can
// take a mode without the server importing a browser module. See that file for why it is split.
import type { Mode } from './mode.ts'
// The two package vocabularies. Type and value both, because the tables below are keyed by the same
// words the schema validates against — one declaration, read by the write door and by this table.
import { PACKAGE_STATES, PACKAGE_SUITS, RETURN_FORMS, type PackageState, type PackageSuit, type ReturnForm } from './delegation.ts'
// TYPE ONLY, and erased before this module runs, exactly like the `Mode` import above. The two names are
// the closed set of severities and of check names for criterion F16 point 6's screen. They are declared
// in a shared file that imports nothing, so this file reads them without importing the server's screen.
import type { ScreenCheckName, ScreenSeverity } from './screen-closed-set.ts'

import { readStoredWord, type WordKey } from './i18n.ts'

/** English stays here. The lists ask for it only when a word is read, after all modules have loaded. */
const englishReadings = new Map<string, string>()

export function englishWord(key: string): string {
  const word = englishReadings.get(key)
  if (word === undefined) throw new Error(`No English reading was declared for ${key}`)
  return word
}

/** A table keeps its identity. Reading an entry uses the page language, or English on the server. */
function wordTable<T extends Readonly<Record<string, string>>>(prefix: string, source: T): T {
  return Object.defineProperties({}, Object.fromEntries(Object.entries(source).map(([name, word]) => {
    const key = `${prefix}.${name}`
    englishReadings.set(key, word)
    return [name, { enumerable: true, get: () => readStoredWord(key as WordKey) }]
  }))) as T
}

// ============================================================================ what comes back

/**
 * Whether we have a word for what was stored.
 *
 *   known   — there is a word, and `text` is it.
 *   unknown — nothing here has a word for this stored value. `text` says so, and names the value.
 *   absent  — nothing was stored at all. `text` is "not recorded".
 *
 * `unknown` and `absent` are kept apart because they call for different fixes: an unknown word is a
 * missing entry in this file, and an absent one is a record nobody filled in.
 */
export type WordStanding = 'known' | 'unknown' | 'absent'

/** A stored value and the word to print for it. */
export interface Word {
  /** What to print. NEVER an empty string, in any mode, for any input. */
  text: string
  /** The value as Mole Office stores it, trimmed. An empty string when nothing was stored. */
  stored: string
  /** Whether there is a word for it. See WordStanding. */
  standing: WordStanding
}

/** What a caller sees when nothing is stored. Absence is an answer, so it is written out. */
export const NOT_RECORDED = 'not recorded'

englishReadings.set('word.notRecorded', NOT_RECORDED)

/**
 * The tool a run is listed under when no adapter answers to the tool its record declares. The server stores it
 * (src/server/lib/sessions.ts) and the Sessions page draws a word for it in place of it (wave 13y round 142).
 */
export const NO_ADAPTED_TOOL = 'unrecorded'

const absent = (): Word => ({ text: readStoredWord('word.notRecorded'), stored: '', standing: 'absent' })

/**
 * The word for a value nothing here knows.
 *
 * THE SAME IN BOTH MODES, on purpose. Developer mode shows the stored word because a developer
 * asked for it; but there is no reader's word here to hide, and printing the bare value would make
 * a missing entry invisible on the one screen most likely to be looked at by somebody who could fix
 * it. The text carries the value, so nothing is lost by saying it loudly.
 */
const unknown = (vocabulary: string, stored: string): Word => ({
  text: readStoredWord(`word.unknown.${vocabulary}` as WordKey, { stored }),
  stored,
  standing: 'unknown',
})

const known = (text: string, stored: string, mode: Mode): Word => ({
  text: mode === 'inspect' ? stored : text,
  stored,
  standing: 'known',
})

/** Trim, and answer null when there is nothing there. One reader for the absent case. */
const trimmed = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const word = value.trim()
  return word === '' ? null : word
}

// ============================================================================ record kinds

/**
 * The word for each record kind. The type makes this table exhaustive, so there is no count here:
 * it said "sixteen" while there were twenty, which is a sentence a reader would have trusted.
 *
 * MOST OF THEM ARE THE STORED WORD, UNCHANGED, and that is rule 2 above rather than an unfinished
 * job. "module", "problem", "task", "claim", "direction", "session" and the rest are what the owner
 * already calls these things out loud; a paraphrase would make them translate.
 *
 * The ones that differ, each with its reason written beside it below. Two are DISPLAY_WORDS'
 * decisions rather than new ones:
 *   block      -> "step". A pipeline is drawn as a row of steps and "block" is the schema's word.
 *   wanna_try  -> "worth a try". Nobody says "wanna try" out loud, and it holds an underscore.
 *
 * THREE MORE WORDS WERE WRITTEN HERE AND TAKEN BACK OUT. Two of them invented a meaning the record
 * does not carry: "measured claim" for `claim` is false of every claim in state `proposed`, which is
 * a claim with nothing measured yet, and "line of work" for `direction` says somebody is on it,
 * which a direction that was merely `noticed` has nobody doing. The third, "agent session" for
 * `session`, invented nothing and was still wrong to add: "session" is already an English word, so
 * expanding it is the paraphrasing rule 2 forbids, and it would have put a second spelling on screen
 * beside the kind menu in RecordsPage, which prints displayWord("session").
 *
 * `block` and `wanna_try` also appear in DISPLAY_WORDS in src/shared/work.ts and the words here
 * match it exactly. The test fails if they ever stop matching.
 */
export const KIND_WORDS: Readonly<Record<RecordKind, string>> = wordTable('kind', {
  whole_suite_receipt: 'whole suite receipt',
  sealed_tip: 'submitted tip',
  // TWO WORDS, THE STORED ONES WITHOUT THE UNDERSCORE: one entry in the merge queue. Sandbox v1, P6.
  merge_entry: 'merge entry',
  // THE STORED WORDS WITHOUT THE UNDERSCORE: one push to main past the queue (wave 13u round 82).
  emergency_push: 'emergency push',
  // Two short words, the ones the addendum uses. `displayWord`
  // answers the same thing by stripping the underscore.
  work_domain: 'work domain',
  // TWO WORDS, AND NEITHER OF THEM IS "bundle" ON ITS OWN. A person reading a row called "bundle"
  // has to guess what is bundled; "context bundle" says it. `displayWord` answers the same thing by
  // stripping the underscore.
  context_bundle: 'context bundle',
  // TWO WORDS, AND THE KIND IS `role_card` RATHER THAN `role` FOR THAT REASON. A row called "role"
  // reads as the word on a registry row; this record is the card about it, and the word has to say so.
  role_card: 'role card',
  // THREE WORDS, AND THE LAST IS `text` RATHER THAN `words`: the record holds a role card's words, and a
  // plural noun reads wrong in every sentence that names a kind as one thing ("What this … still needs").
  role_card_words: 'role card text',
  // TWO WORDS, and the second is `request` rather than `ask`: an ask in this product is a question
  // on a record, and this is a request for a rung that one press grants or refuses.
  role_request: 'role request',
  module: 'module',
  pipeline: 'pipeline',
  block: 'step',
  session: 'session',
  problem: 'problem',
  task: 'task',
  purchase: 'purchase',
  obligation: 'obligation',
  claim: 'claim',
  proposal: 'proposal',
  decision: 'decision',
  idea: 'idea',
  criticism: 'criticism',
  direction: 'direction',
  wanna_try: 'worth a try',
  message: 'message',
  note: 'note',
  report: 'report',
  // One word, as stored: writing kept in the office that is not sent yet.
  draft: 'draft',
  // NOT "annotation" — that is the stored word, and what a person says is comment.
  //
  // IT WAS "note left on something" AND THAT WAS TOO LONG TO BE A TAG. Measured at 1440 on Reports
  // and notes: the tag ran 175px from x=279 to x=454 while the row's own title starts at x=441, so
  // it was drawn across the words of every comment row on the page. A kind word is a tag; a tag is
  // read at a glance beside a title, and a five-word phrase is a sentence in a place with room for
  // a word.
  //
  // "comment" is also what the server, the composer and the review pane now all call it — three
  // words for one thing was itself a defect this round found — and it does not collide with the
  // `note` kind above, which is free writing about nothing in particular.
  annotation: 'comment',
  agent: 'agent',
  // NOT "stopping point" spelt from the stored word by the underscore rule, and not "handover".
  // "Handover" was the first word for this and it names a moment between two people, which is not
  // what most of these are: an agent writing one at the end of an afternoon is handing over to
  // itself tomorrow. "Where work stopped" is what it is to a reader, and it fits a tag.
  stopping_point: 'where work stopped',
  // The word is kept. The collision is with the `placeholder=` attribute on an input,
  // which is a name in the markup and never a word a reader meets, so nothing on screen says
  // "placeholder" twice meaning two things. The rule for anybody writing code after this: no new
  // code names input hint text a placeholder.
  placeholder: 'placeholder',
  // NOT "fallback", and the stored word is not "fallback" either. The Agent Usage surface says
  // *went outside Mole Office* about a different thing that used to be called a fallback; two
  // record-level concepts named Fallback on two screens of one product is the collision this
  // campaign is about. The word Fallback survives where an agent reads a kind's meaning — the first
  // sentence of KIND_SPECS.ran_instead.purpose says this IS the owner's Fallback.
  ran_instead: 'ran instead',
  // THE OWNER'S FORK, ANSWERED PROVISIONALLY: what a planned future is CALLED on screen.
  //
  // Not "trajectory", which is the stored word and is a physics word for a path through space. Not
  // "plan", which is already spent: `plans` and `plan_lines` are the schedule, with dates and
  // hours, and a reader seeing "plan" beside those would reasonably expect one.
  trajectory: 'planned future',
  // And one state inside it. The underscore rule would spell this the same way, and it is written
  // out rather than left to the rule because the rule is not what makes it right.
  planned_state: 'planned state',
  // SINCE A DECISION, "SECRETARY NOTES" IS THE WORD A READER MEETS. Until that decision a reader met
  // "notebook", on the reasoning that which secretary it belongs to is on the record rather than in its
  // kind word. That decision made the secretary's notes a kind of their own, and the reader's word now
  // says whose kind it is, as item 1 of that decision says. The stored word stays
  // `notebook`: every existing record keeps its kind, its id and its history, and the doors keep their
  // addresses. Only an agent holding the secretary card has one (`checkTheNotebook`), so the word names
  // nothing it does not cover.
  notebook: 'secretary notes',
  // THE WORD OF CRITERIA I1 TO I7: several defects acting together caused a large loss. Not "problem" —
  // a problem is one thing wrong, and this is the scene, the causes and the responsibility around it.
  incident: 'incident',
  // ONE WORD, AND IT IS G1's: the code of law and a person's own constraint share this name now,
  // because everybody has rules of their own to keep: it is not that a person has regulations and an
  // agent has laws.
  regulation: 'regulation',
  // ONE WORD: a goal. The stored word and the reader's word are the same, the
  // way `notebook` and `incident` are, because there is no underscore to spell out and no second
  // sense of "goal" in the product that this one could be confused with: an obligation is what is
  // owed and a planned state is what a future holds, and neither is called a goal.
  goal: 'goal',
  // ONE WORD, AND IT IS THE PROPOSAL'S: 一条办公室流程的记录 — a flow. The stored word and the
  // reader's word are the same, like `notebook`, `incident` and `goal`, because there is no
  // second sense of "flow" in the product that this one could be confused with: the office's own
  // procedures had no name in the product until this kind arrived (proposal 1LaCQBRYRjls).
  flow: 'flow',
  // TWO WORDS, THE SPEC'S OWN: a flow run is one run's pass through a flow, step by step. Wave 1 of the
  // office flow, M1. The underscore is spelled out the way `merge_entry` is.
  flow_run: 'flow run',
  // TWO WORDS, THE STORED ONES WITHOUT THE UNDERSCORE: one ask for a registered host tool.
  host_job: 'host job',
  // ONE WORD, AND THE STORED ONE. A counter counts things, which is what the English word already
  // says, and there is no underscore to spell out. Criterion CT1 states it.
  counter: 'counter',
  notice_rules: 'notice wake rules',
  quick_note: 'quick note',
  // THE CATALOGUE'S TWO KINDS, in the words the draft uses: a category of tools, and a tool.
  tool_category: 'tool category',
  tool: 'tool',
  // ONE WORD: a checklist.
  checklist: 'checklist',
  // A BOOKING OF THE HOST GPU: the word comes from a message and its
  // decision.
  booking: 'booking',
  // TWO WORDS, THE STORED ONES WITHOUT THE UNDERSCORE: what one secretary does (item 2 of wave 13s's requirements).
  secretary_duties: 'secretary duties',
  // ONE WORD: one watch or timer an agent keeps running (item 38 of wave 13s's requirements).
  watch: 'watch',
  // TWO WORDS, THE STORED ONES WITHOUT THE UNDERSCORE: one item of a line's backlog (item 38 of wave 13s's requirements).
  backlog_item: 'backlog item',
  // ONE WORD: guidance for whoever starts a flow or takes a role card.
  handbook: 'handbook',
  // TWO WORDS, THE STORED ONES WITHOUT THE UNDERSCORE: one project's own rules (the design-first build of wave 13s's
  // requirements).
  project_chapter: 'project chapter',
  // ONE WORD: the candidates for one piece of method work and the one chosen (the design-first build).
  design: 'design',
  // TWO WORDS, THE STORED ONES WITHOUT THE UNDERSCORE: one review of one revision of a design (the design-first build).
  design_review: 'design review',
  // TWO WORDS, THE STORED ONES WITHOUT THE UNDERSCORE: one reminder of a missing reviewed design, or one miss (part 6 of
  // the design-first build).
  design_reminder: 'design reminder',
})

/** What to call a record of this kind. */
export function kindWord(kind: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(kind)
  if (stored === null) return absent()
  const word = KIND_WORDS[stored as RecordKind]
  if (word === undefined) return unknown('kind', stored)
  return known(word, stored, mode)
}

// ============================================================================ kind families

/**
 * What to call one of the six families a kind belongs to.
 *
 * The label is read from KIND_FAMILIES in src/shared/work.ts, which is where the six were named and
 * argued over. THESE ARE CAPITALISED and the kind words above are not, because a family label is a
 * heading on a page and a kind word sits inside a sentence or on a tag.
 */
export function familyWord(family: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(family)
  if (stored === null) return absent()
  const found = KIND_FAMILIES[stored as KindFamily]
  if (found === undefined) return unknown('family', stored)
  return known(FAMILY_WORDS[stored as KindFamily], stored, mode)
}

// ============================================================================ links

/**
 * Which end of a link you are standing on.
 *
 * A link is stored once, in one direction, and the other reading is shown rather than stored — so
 * "part of" and "has part" are one row read two ways, not two rows.
 */
export type LinkDirection = 'forward' | 'reverse'

/**
 * What this link says, read from the end the caller is standing on.
 *
 * BOTH READINGS COME FROM LINK_TYPES, which declares them. Nothing is invented here.
 *
 * IN DEVELOPER MODE THE REVERSE READING SAYS SO. The stored row is `part_of` whichever end you read
 * it from, so printing the bare stored word for the reverse would drop the one fact Developer mode
 * promises to add — see MODE_NOTES in mode.ts, which says Developer shows link direction. A
 * symmetric link has no reverse to mark, so `relates_to` is printed plain at both ends.
 */
export function linkWord(type: unknown, direction: LinkDirection, mode: Mode = 'normal'): Word {
  const stored = trimmed(type)
  if (stored === null) return absent()
  const found = LINK_TYPES[stored as LinkType]
  if (found === undefined) return unknown('link', stored)
  if (mode === 'inspect') {
    const suffix = direction === 'reverse' && !found.symmetric ? ' (reverse)' : ''
    return { text: stored + suffix, stored, standing: 'known' }
  }
  return { text: (direction === 'reverse' ? LINK_REVERSE_WORDS : LINK_FORWARD_WORDS)[stored as LinkType], stored, standing: 'known' }
}

// ============================================================================ state words

/**
 * The word for every state word Mole Office understands.
 *
 * THE LIST IS STATE_MEANING'S, in src/shared/work.ts, which is the flat table of every state word
 * in the product and the reason one word cannot mean two things. Every key of it has an entry here
 * and the test fails in both directions: a new state word with no reader's word, and a word here
 * for a state that no longer exists.
 *
 * ONLY ONE OF THEM READS DIFFERENTLY FROM THE STORED WORD. "todo" is not a word in English;
 * everything else in this vocabulary already is one, so it is repeated unchanged, and `worked_around`
 * only loses its underscore. Listing all of them anyway is what makes the completeness test
 * possible, and it is the review step that stops the next state word arriving unread.
 */
export const STATE_WORDS: Readonly<Record<string, string>> = wordTable('state', {
  // checklist items, tasks and blocks
  todo: 'to do',
  doing: 'doing',
  done: 'done',
  failed: 'failed',
  blocked: 'blocked',

  // agent sessions
  running: 'running',
  // NOT "idle", WHICH IS THE HIGHEST-VALUE RENAME IN THE PRODUCT. An idle session is an agent that
  // stopped and needs an answer from a person; "idle" reads as "nothing is happening here, leave
  // it". This word and the next one lived in a second table in src/web/components/ui.tsx until 25
  // August 2026 and the chip read that table instead of this one — which is how `worked_around`,
  // held here with a reading since the day this file was written, was still drawn raw on #/records.
  idle: 'waiting for you',
  finished: 'finished',
  crashed: 'crashed',
  // A run nobody owns that is still going. "Orphaned" is the mechanism's word for it.
  orphaned: 'left running',
  unknown: 'unknown',

  // problems
  open: 'open',
  closed: 'closed',
  fixed: 'fixed',
  worked_around: 'worked around',
  accepted: 'accepted',

  // obligations
  fulfilled: 'fulfilled',
  cancelled: 'cancelled',

  // goals (GOAL_STATES). `open` and `dropped` are already above and print as they are stored; `met`
  // is the one new word, added with the goal kind (criterion P1). It reads as it is stored, the way
  // every word here does, because there is no shorter honest reading of "what the goal said became
  // true".
  met: 'met',

  // THE INCIDENT LADDER, added by the incident kind (criterion I2 and I7). All three are already
  // English words and are printed as they are stored, like everything else here; they are listed
  // because every word STATE_MEANING classifies has an entry, and the completeness test fails both
  // ways round. `verified` reads as it is stored, which is the point: the fix has been shown to hold.
  investigating: 'investigating',
  corrected: 'corrected',
  verified: 'verified',

  // put down on purpose, on any kind
  paused: 'paused',
  deferred: 'deferred',

  // claims
  proposed: 'proposed',
  measured: 'measured',
  retracted: 'retracted',

  // purchases
  wanted: 'wanted',
  ordered: 'ordered',
  arrived: 'arrived',

  // ideas
  new: 'new',
  active: 'active',
  parked: 'parked',
  dropped: 'dropped',

  // modules
  stable: 'stable',
  retired: 'retired',

  // WHERE A COMMENT TO AN AGENT HAS GOT TO. Six stored words; see src/server/lib/dispatch.ts.
  //
  // "waiting" rather than "queued": a queue is the mechanism and waiting is what a person sees.
  // "delivered", "sent" and "failed" are already English and are printed as they are stored, which
  // the rule above this table asks for. The two that are not:
  //
  //   picked_up — "picked up". The underscore rule would give the same words; it is written out
  //     because a state word that reaches a screen through a lookup should not depend on a rule
  //     about punctuation to be readable.
  //   handled — "dealt with". "Handled" is a word about a process rather than about the work: what
  //     a person wants to know is that somebody did something about their comment.
  queued: 'waiting',
  sent: 'sent',
  delivered: 'delivered',
  picked_up: 'picked up',
  handled: 'dealt with',
  // `failed` is already in this table under checklist items and means the same thing here.
  //
  // `answered` STAYS, and it is no longer one of the six. A comment record still declares it in
  // `ANNOTATION_STATES`, and records written before this change hold it. A reader meeting the word
  // must not be told Mole Office has never heard of it.
  answered: 'answered',

  // THE MERGE QUEUE (MERGE_STATES in ./merge-queue.ts), sandbox v1 piece P6. Every one is already an
  // English word and is printed as it is stored; they are listed because every word STATE_MEANING
  // classifies has an entry here.
  submitted: 'submitted',
  pinned: 'pinned',
  judged: 'judged',
  integrating: 'integrating',
  resolving: 'resolving',
  reinspecting: 'reinspecting',
  testing: 'testing',
  landing: 'landing',
  merged: 'merged',
  bounced: 'bounced',
  withdrawn: 'withdrawn',
  superseded: 'superseded',

  // THE TOOLSET CATALOGUE (TOOL_STATES in ./toolset.ts). Both are already what a person says, and are
  // listed because every word STATE_MEANING classifies has an entry here.
  built: 'built',
  'not built yet': 'not built yet',

  // A CHECKLIST ITEM'S TWO STATES THAT NO OTHER KIND HAS (CHECKLIST_ITEM_STATES in ./checklists.ts), stored
  // as the words a person says.
  'in progress': 'in progress',
  'waiting on the owner': 'waiting on the owner',

  // A GPU BOOKING AND ITS REQUEST TO GO FIRST (BOOKING_STATES and GO_FIRST_STATES in ./bookings.ts), wave 13s
  // round 29. Each is already what a person says and is printed as it is stored; `running` and `cancelled` are
  // above. They are listed because every word STATE_MEANING classifies has an entry here.
  waiting: 'waiting',
  ended: 'ended',
  asked: 'asked',
  granted: 'granted',
  refused: 'refused',
  lapsed: 'lapsed',

  // AN ASK THE OFFICE KEEPS ON A RUN: a next round and a worker run (src/shared/next-round.ts and
  // src/shared/worker-runs.ts), wave 13j. Each is already what a person says; `wanted` and `failed` are above.
  starting: 'starting',
  started: 'started',
  planned: 'planned',
  attempted: 'verification attempted',
  complete: 'verification complete',
  unavailable: 'verification unavailable',

  // HOW A FIRST HANDOFF TO THE STABLE CHECKOUT ENDED (StableBootstrapOutcome in src/shared/stable-bootstrap-notices.ts),
  // wave 13q. `refused` is above. `not-restored` says what is known: nobody verified the restoration, which is
  // not the same as knowing it failed.
  'handed-off': 'handed off',
  'failed-restored': 'failed and restored',
  'not-restored': 'restoration not verified',

  // HOW A MOVE OF THE DATA FOLDER ENDED (DataFolderMoveOutcome in src/shared/stable-bootstrap-notices.ts), wave 13q.
  // `refused` and `not-restored` are above. `restored` alone would read as a success; what happened is that the move
  // failed and the original folder was put back and verified, which is what a first handoff's `failed-restored` says.
  moved: 'moved',
  restored: 'failed and restored',

  // AN EMERGENCY PUSH TO MAIN (EMERGENCY_PUSH_STATES in ./emergency-push.ts), wave 13u round 82. Each is already what a
  // person says. `stopped` says main stayed where it was, so nothing was pushed.
  pushing: 'pushing',
  pushed: 'pushed',
  stopped: 'stopped',

  // HOW A HOST JOB ENDED (HOST_JOB_STATES in ./host-jobs.ts). `asked`, `running` and `finished` are above. Each is
  // already what a person says.
  'ended at its time limit': 'ended at its time limit',
  'could not start': 'could not start',
  lost: 'lost',

  // A HANDBOOK'S STATES (HANDBOOK_STATES in ./handbooks.ts). `retired` is above, on the module line, and means the
  // same there. Both new words are already what a person says, so each is printed as it is stored.
  draft: 'draft',
  'in use': 'in use',
})

/**
 * ONE STATE WORD READS DIFFERENTLY ON ONE KIND, AND THIS IS THE ONLY SUCH ENTRY.
 *
 * A claim in state `proposed` is believed with no numbers behind it. Drawn as an ordinary to-do,
 * people quote it as if it had been checked. On every other kind `proposed` means what it says.
 *
 * IT WAS IN src/web/components/ui.tsx UNTIL 25 AUGUST 2026, beside the five-word table above, and
 * it comes down here for the same reason that one did: the server writes sentences about claims
 * too, and it could not reach a file in src/web.
 */
export const STATE_WORDS_BY_KIND: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  claim: wordTable('state.claim', { proposed: 'not measured' }),
}

/**
 * What to print for a record's state.
 *
 * THE LOOKUP IS LOWERCASED, exactly as `progressOf` in src/shared/work.ts lowercases before reading
 * STATE_MEANING. If this were stricter, a stored "Open" would be classified by one and called
 * unknown by the other, and the row would carry a meaning beside a word saying there is none.
 * `stored` keeps the record's own spelling, because that is what Developer mode is for.
 *
 * `kind` is the record's kind where the caller knows it, and it is only ever read for the one
 * per-kind entry above. A caller that does not know the kind gets the ordinary word, which is
 * honest rather than wrong.
 */
export function stateWord(state: unknown, mode: Mode = 'normal', kind?: string): Word {
  const stored = trimmed(state)
  if (stored === null) return absent()
  const lower = stored.toLowerCase()
  const onThisKind = kind === undefined ? undefined : STATE_WORDS_BY_KIND[kind]?.[lower]
  const word = onThisKind ?? STATE_WORDS[lower]
  if (word === undefined) return unknown('state', stored)
  return known(word, stored, mode)
}

// ============================================================================ a package's own words

/**
 * WHAT KIND OF OUTSIDE WORK A PACKAGE SUITS, as a person reads it. Criterion F16 point 1.
 *
 * THE STORED WORDS HOLD UNDERSCORES AND NONE OF THESE DOES. They are the packager's own three kinds
 * of work, and the reading says the kind of work rather than repeating the token, because
 * `own_module` and `from_pictures` are not words anybody says out loud.
 */
export const PACKAGE_SUIT_WORDS: Readonly<Record<PackageSuit, string>> = wordTable('word.packageSuit', {
  own_module: 'a module built on its own',
  desk_work: 'planning, ideas, style variants and finding things out',
  from_pictures: 'building from pictures, for a chat that can read them',
})

/**
 * What to print for one of the three kinds of outside work a package suits.
 *
 * A value no table knows is named out loud rather than handed back, for the reason every reading in
 * this file follows: a fall-through is how a stored token reaches a screen wearing the table's
 * clothes. The vocabulary is read from `./delegation.ts`, so this table cannot fall behind it.
 */
export function packageSuitWord(suit: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(suit)
  if (stored === null) return absent()
  const word = PACKAGE_SUIT_WORDS[stored as PackageSuit]
  if (word === undefined) return unknown('kind of outside work', stored)
  return known(word, stored, mode)
}

/**
 * WHERE A PACKAGE HAS GOT TO, as a person reads it. Criterion F16 point 7.
 *
 * The six states are a reading of the package's own acts, the task's own fields and the live claims on it.
 * "returned to the taker" says more than the token: it is the maker sending points back, and not
 * something that came back from outside, which is "handed back".
 */
export const PACKAGE_STATE_WORDS: Readonly<Record<PackageState, string>> = wordTable('word.packageState', {
  to_do: 'to do',
  taken: 'taken',
  aligned: 'aligned',
  handed_back: 'handed back',
  done: 'done',
  returned: 'returned to the taker',
})

/** What to print for a package's state word. Names a value no table knows rather than passing it on. */
export function packageStateWord(state: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(state)
  if (stored === null) return absent()
  const word = PACKAGE_STATE_WORDS[stored as PackageState]
  if (word === undefined) return unknown('package state', stored)
  return known(word, stored, mode)
}

/**
 * HOW ONE THING BROUGHT BACK FROM OUTSIDE ARRIVED, as a person reads it. Criterion F16 point 5.
 *
 * The three stored words are ordinary English and hold no underscore, so this is a reading for the
 * screen rather than for the machine-word gate: it says what the form IS to somebody reading the
 * return, and it is read from `RETURN_FORMS` so a fourth form declared there has no word here until
 * this table says one.
 */
export const PACKAGE_RETURN_FORM_WORDS: Readonly<Record<ReturnForm, string>> = wordTable('word.returnForm', {
  text: 'words',
  pictures: 'pictures',
  zip: 'a zip',
})

/** What to print for the form an outside return came in. Names a value no table knows. */
export function packageReturnFormWord(form: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(form)
  if (stored === null) return absent()
  const word = PACKAGE_RETURN_FORM_WORDS[stored as ReturnForm]
  if (word === undefined) return unknown('return form', stored)
  return known(word, stored, mode)
}

/** True when a value is one of the three forms an outside return may come in. */
export function isOneOfTheReturnForms(value: unknown): value is ReturnForm {
  return (RETURN_FORMS as readonly string[]).includes(String(value))
}

/** Which of the three a package suits is one the product declares. Read from the declaration. */
export function isOneOfThePackageSuits(value: unknown): value is PackageSuit {
  return (PACKAGE_SUITS as readonly string[]).includes(String(value))
}

/** Which of the six a package state is one the product declares. Read from the declaration. */
export function isOneOfThePackageStates(value: unknown): value is PackageState {
  return (PACKAGE_STATES as readonly string[]).includes(String(value))
}

// ============================================================================ the screen's own words

/**
 * THE TWO SEVERITIES A FINDING OF THE EXPORT SCREEN CAN CARRY, as a person reads them. Criterion
 * F16 point 6.
 *
 * BOTH ARE ALREADY PLAIN WORDS OR CLOSE TO IT — rule 2 at the head of this file — so `refused`
 * keeps its own spelling and `look_before_you_paste` only loses its underscores. The closed set
 * itself is `SCREEN_SEVERITIES` in `src/shared/screen-closed-set.ts`; nothing is restated here beyond
 * the reading, and a third severity added there has no word here until this table says one.
 */
export const SCREEN_SEVERITY_WORDS: Readonly<Record<ScreenSeverity, string>> = wordTable('word.screenSeverity', {
  refused: 'refused',
  look_before_you_paste: 'look before you paste',
})

/** What to call one of the export screen's two severities. */
export function screenSeverityWord(severity: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(severity)
  if (stored === null) return absent()
  const word = SCREEN_SEVERITY_WORDS[stored as ScreenSeverity]
  if (word === undefined) return unknown('screening severity', stored)
  return known(word, stored, mode)
}

/**
 * WHAT EACH OF THE EXPORT SCREEN'S CHECKS IS, as a short phrase a person reads beside a finding.
 *
 * THE LIST IS `SCREEN_CHECK_NAMES`'S, in `src/shared/screen-closed-set.ts`, which is the closed set
 * `SCREEN_CHECKS` in `src/server/lib/screening.ts` answers a severity and a longer sentence for. This table is the short
 * reading of the same six names — the noun a person reads on a finding, not the sentence explaining
 * it — and a check added there has no word here until this table is given one.
 */
export const SCREEN_CHECK_WORDS: Readonly<Record<ScreenCheckName, string>> = wordTable('word.screenCheck', {
  key_in_text: 'a key',
  home_directory_path: 'a path under the home directory',
  email_address: 'an email address',
  registered_person_name: "the registered person's name",
  other_peoples_names: "other people's names",
  check_incomplete: 'a check that could not finish',
})

/** What to call one of the export screen's checks. */
export function screenCheckWord(check: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(check)
  if (stored === null) return absent()
  const word = SCREEN_CHECK_WORDS[stored as ScreenCheckName]
  if (word === undefined) return unknown('screening check', stored)
  return known(word, stored, mode)
}

// ============================================================================ progress

/**
 * What to print for one of the seven progress words — what a state word SAYS about whether the work
 * stopped short.
 *
 * NO TABLE HERE. DISPLAY_WORDS in src/shared/work.ts already carries these four words ("not
 * started", "under way", "did not finish", "nobody has said") and the other three are plain
 * already, so this reads that declaration through `displayWord` rather than copying it.
 */
export function progressWord(progress: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(progress)
  if (stored === null) return absent()
  if (!(PROGRESS as readonly string[]).includes(stored)) return unknown('progress', stored)
  return known(PROGRESS_READING_WORDS[stored]!, stored, mode)
}

// ============================================================================ who wrote it

/**
 * What to call each of the three kinds of author.
 *
 *   human  -> "person". "Human" is a column value; a change row saying "person" beside a name reads.
 *   agent  -> "agent". The plain word for what writes most of these records.
 *   system -> the product's own name. A system write is this product itself — a hook, a migration,
 *             the session record filed at startup. The name comes from src/shared/product.ts so
 *             that it cannot fall behind the name on the rail.
 *
 * The stored actor id for a system write comes from the office's live row.
 * Earlier writes stored "mole-office", and before 1 October 2026 "panelx", the product's earlier
 * name. Those stamps stay as written. Arriving old product names are normalised by http.ts through
 * `SYSTEM_ACTOR_IDS_RENAMED` and the live row. An id is not a word anybody reads — this table is.
 */
export const ACTOR_WORDS: Readonly<Record<ActorType, string>> = wordTable('actor', {
  human: 'person',
  agent: 'agent',
  system: PRODUCT_NAME,
})

/** What to call whoever made this change or wrote this record. */
export function actorTypeWord(type: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(type)
  if (stored === null) return absent()
  const word = ACTOR_WORDS[stored as ActorType]
  if (word === undefined) return unknown('actor', stored)
  return known(word, stored, mode)
}

// ============================================================================ any stored word

/**
 * THE READER'S WORD FOR A STORED VALUE WHEN THE CALLER DOES NOT KNOW WHICH VOCABULARY IT IS FROM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A CALLER WOULD NOT KNOW
 * ---------------------------------------------------------------------------------------
 *
 * The state chip is handed a record's `state` column, and a `state` column is not always a state
 * word. A claim carries `proposed`, a session carries `idle`, and the same chip is asked to draw a
 * progress word — `in_flight`, `stopped_short` — where a page has classified a row rather than read
 * one. Three vocabularies, one column, one drawing.
 *
 * `shownState` in src/web/components/ui.tsx was that function, and it was a SECOND TABLE: five
 * words of its own and the STORED TOKEN for everything else. That is why `worked_around` was drawn
 * on #/records at first paint in normal mode at 1440 and at 390, with `worked_around: 'worked
 * around'` sitting in STATE_WORDS above, unread, since the day this file was written. Five waves
 * fixed sites one at a time and a sixth verifier found more, because a fall-through does not have
 * a site: it has a function.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER, AND WHY IT COSTS NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * State, then kind, then progress, then link, then actor. FOUR WORDS ARE IN TWO VOCABULARIES AT
 * ONCE — `agent` is a kind and an actor type, `finished`, `paused` and `unknown` are a state and a
 * progress word — AND ALL FOUR READ THE SAME EITHER WAY, so the order picks the same answer
 * whichever end it starts from. Two vocabularies that ever
 * disagreed about one stored word would make this function's answer depend on its own line order.
 * The test that held them together was deleted on 12 November 2026.
 *
 * ---------------------------------------------------------------------------------------
 * A WORD NO VOCABULARY HAS IS NAMED OUT LOUD
 * ---------------------------------------------------------------------------------------
 *
 * "unknown word: chasing", in both modes, never the bare value. That is rule 3 at the top of this
 * file, and it is the whole change: the stored token has no way back onto a screen through here.
 */
export function readerWord(stored: unknown, mode: Mode = 'normal', kind?: string): Word {
  const word = trimmed(stored)
  if (word === null) return absent()
  const lower = word.toLowerCase()
  const onThisKind = kind === undefined ? undefined : STATE_WORDS_BY_KIND[kind]?.[lower]
  if (onThisKind !== undefined) return stateWord(word, mode, kind)
  if (STATE_WORDS[lower] !== undefined) return stateWord(word, mode, kind)
  if (KIND_WORDS[word as RecordKind] !== undefined) return kindWord(word, mode)
  if ((PROGRESS as readonly string[]).includes(word)) return progressWord(word, mode)
  if (LINK_TYPES[word as LinkType] !== undefined) return linkWord(word, 'forward', mode)
  if (ACTOR_WORDS[word as ActorType] !== undefined) return actorTypeWord(word, mode)
  return unknown('word', word)
}

// ============================================================================ the implementation map

/**
 * WHAT A PERSON READS FOR ONE OF THE NINE SOURCES AN IMPLEMENTATION RELATIONSHIP CAME FROM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE READING IS NOT DECLARED HERE
 * ---------------------------------------------------------------------------------------
 *
 * The nine sources, their tables, their tiers and their producers are declared once, in
 * `src/shared/implementation.ts`, because that is where a resolver landing has to edit them. A
 * second table of nine readings in this file would be two lists free to disagree, which is the
 * defect the head of this file names. So the reading rides on the row, and this function is the
 * reading RULE — the same rule the eight above follow, applied to a vocabulary declared elsewhere.
 *
 * A SOURCE NOTHING HERE KNOWS IS NAMED OUT LOUD, in both modes, never handed back bare. Rows of
 * `implementation_map` arrive through an import as well as through a write on this machine, so a
 * provenance this build has never heard of is a value that can really reach a screen.
 *
 * DEVELOPER MODE GETS THE STORED TOKEN, through `known`, exactly as a kind and a state do. That is
 * not a leak: a developer asked for the machinery, and `observed_write` is what the column holds.
 */
export function provenanceWord(provenance: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(provenance)
  if (stored === null) return absent()
  const entry = PROVENANCE[stored as Provenance]
  if (entry === undefined) return unknown('source', stored)
  return known(PROVENANCE_WORDS[stored]!, stored, mode)
}

/**
 * What one relationship SAYS: implements, tests, configures.
 *
 * ALL THREE READINGS ARE THE STORED WORD, and that is rule 2 at the head of this file rather than
 * an unfinished table: they are already the words a person says out loud about code, none of them
 * holds an underscore, and a paraphrase would make the owner translate their own vocabulary.
 *
 * IT IS STILL A READING CALL AND NOT A BARE INTERPOLATION. `relation` crosses the wire as a plain
 * string — `StatedOut.relation` is typed `string`, because a row written on another machine and
 * imported here carries whatever that machine wrote — so a fourth word really can arrive, and
 * `unknown relation: depends_on` on the screen is what tells a reader that Mole Office did not
 * understand the row rather than that the row says something new.
 */
export function relationWord(relation: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(relation)
  if (stored === null) return absent()
  if (!(RELATIONS as readonly string[]).includes(stored)) return unknown('relation', stored)
  return known(RELATION_WORDS[stored]!, stored, mode)
}

// ============================================================================ the usage vocabulary

/**
 * WHY A CALLER SAID IT WAS CALLING, in the words a person would use for it.
 *
 * The stored words are the eight in `PURPOSES` and every one of them is a token a program chose:
 * `cold-recovery` is not a phrase anybody says. The Usage page draws these on a Normal-mode screen,
 * so they pass through here on the way, like every other stored word in this product.
 */
export const PURPOSE_WORDS: Readonly<Record<Purpose, string>> = wordTable('word.purpose', {
  'cold-recovery': 'starting from nothing',
  'task-resume': 'picking its own work back up',
  handover: 'taking over from another agent',
  'module-work': 'working on a module',
  'pipeline-work': 'working on a pipeline',
  'review-handling': 'handling a review',
  'message-handling': 'handling a message',
  normal: 'ordinary work',
})

/** What to call the reason a caller gave for a piece of work. */
export function purposeWord(purpose: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(purpose)
  if (stored === null) return absent()
  const word = PURPOSE_WORDS[stored as Purpose]
  if (word === undefined) return unknown('purpose', stored)
  return known(word, stored, mode)
}

/**
 * WHAT AN AGENT JUDGED ABOUT ITS OWN TRIP OUTSIDE MOLE OFFICE.
 *
 * Every one of the three readings says whose judgement it is, because the whole point of the table
 * these words draw is that Mole Office did not decide any of them.
 */
export const VERDICT_WORDS: Readonly<Record<Verdict, string>> = wordTable('word.verdict', {
  boundary: 'belongs outside Mole Office',
  gap: 'Mole Office should have had it',
  unsure: 'the agent did not know',
})

/** What to call an agent's own judgement about why it went outside. */
export function verdictWord(verdict: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(verdict)
  if (stored === null) return absent()
  const word = VERDICT_WORDS[stored as Verdict]
  if (word === undefined) return unknown('verdict', stored)
  return known(word, stored, mode)
}

/**
 * THE QUESTION AN AGENT HAD, drawn as the question rather than as its key.
 *
 * The reading is the `question` field of `WANTED` itself, so there is one place the words live and
 * a key cannot end up drawn with another key's question. `other` is the one entry whose stored
 * sentence is about the field rather than about a question, so it has its own reading here.
 */
export function wantedWord(wanted: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(wanted)
  if (stored === null) return absent()
  const entry = wantedNamed(stored)
  if (entry === undefined) return unknown('question', stored)
  return known(WANTED_WORDS[stored]!, stored, mode)
}

/**
 * WHY A STRETCH OF WORK STOPPED, which is always drawn beside its duration.
 *
 * A duration with no end reason beside it invites the reader to average a number that is still
 * growing, which is why these three words exist at all.
 */
export const ENDED_BECAUSE_WORDS: Readonly<Record<string, string>> = wordTable('word.endedBecause', {
  'purpose-changed': 'the next call said it was doing something else',
  'went-quiet': 'nothing else arrived',
  'still-open': 'still going',
})

/**
 * WHAT KIND OF WORLD, in the words a person reads. Criterion C2's four kinds.
 *
 * THE TABLE ITSELF IS IN src/config/world-words.mjs, and that is not a second home for it. Two tools
 * print these words and neither can read TypeScript, so the table is in JavaScript and this file
 * reads it — the same arrangement src/config/world-header.mjs has for the same reason. The reading
 * function stays here, where every reading in this product is.
 */

/** What to call one kind of world. */
export function worldKindWord(kind: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(kind)
  if (stored === null) return absent()
  const word = WORLD_KIND_WORDS[stored]
  if (word === undefined) return unknown('kind of world', stored)
  return known(word, stored, mode)
}

/** What to call a world's standing. The table is in src/config/world-words.mjs, for the reason above. */
export function worldStandingWord(standing: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(standing)
  if (stored === null) return absent()
  const word = WORLD_STANDING_WORDS[stored]
  if (word === undefined) return unknown('standing', stored)
  return known(word, stored, mode)
}

/** What to call the reason a stretch ended. */
export function endedBecauseWord(reason: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(reason)
  if (stored === null) return absent()
  const word = ENDED_BECAUSE_WORDS[stored]
  if (word === undefined) return unknown('end reason', stored)
  return known(word, stored, mode)
}

/**
 * WHETHER THE SESSION THAT RAN A STRETCH WENT ON TO WRITE ANYTHING.
 *
 * THREE, BECAUSE TWO WOULD LIE. Without `cannot-tell`, an agent that recovered, worked and wrote
 * three records without sending a session header would be drawn as an agent that recovered and did
 * nothing — an absent header drawn as absent work.
 */
export const THEN_WROTE_WORDS: Readonly<Record<string, string>> = wordTable('word.thenWrote', {
  wrote: 'went on to write something',
  'did-not-write': 'wrote nothing afterwards',
  'cannot-tell': 'no way to tell — it never said which run it was',
})

/** What to call whether a stretch's session went on to write. */
export function thenWroteWord(value: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(value)
  if (stored === null) return absent()
  const word = THEN_WROTE_WORDS[stored]
  if (word === undefined) return unknown('outcome', stored)
  return known(word, stored, mode)
}

// ============================================================================ what a write was

/**
 * WHAT ONE ROW OF THE CHANGE LOG DID, in the word a person reads.
 *
 * The five stored ops are verbs in the present tense and a change row is always about something
 * that already happened, so every reading here is the past tense of the same verb.
 *
 * IT IS A TABLE AND NOT A SUFFIX RULE. This used to be written as the stored token plus "d" or
 * "ed", inside `changeVerb` below, which is the stored word reaching a person's screen with only a
 * spelling accident between them: it works because these five English verbs happen to inflect
 * regularly, and a sixth op spelt any other way would have been drawn wrong with nothing failing.
 * A word an op has no entry for is now named out loud, like every other unknown word in this file.
 */
export const CHANGE_OP_WORDS: Readonly<Record<ChangeOp, string>> = wordTable('word.changeOp', {
  create: 'created',
  update: 'changed',
  delete: 'deleted',
  link: 'linked',
  unlink: 'unlinked',
})

/** What to call what one change row did. */
export function changeOpWord(op: unknown, mode: Mode = 'normal'): Word {
  const stored = trimmed(op)
  if (stored === null) return absent()
  const word = CHANGE_OP_WORDS[stored as ChangeOp]
  if (word === undefined) return unknown('operation', stored)
  return known(word, stored, mode)
}

/**
 * ONE CHANGE ROW AS A SENTENCE: what happened, and to which field.
 *
 * THIS WAS IN `src/web/components/ChangeLog.tsx` UNTIL 28 AUGUST 2026, and it moved here for the
 * reason `src/web/lib/words.ts` gives for the table above it: the server composes text a person
 * reads too, and a file under `src/web` is not reachable from `src/server`. The continuation
 * assembler in `src/server/lib/continuation.ts` prints a line per change row into the text a person
 * previews on the bundles page, and it was writing that line out of the stored columns —
 * `2026-08-27 12:44 — unlink on record …` — while this function three directories away read the
 * same row as *unlinked (part of)*. Two sentences for one row is this repository's recurring
 * defect; a second copy on the server would have been the fourth time.
 *
 * `ChangeLog.tsx` re-exports it under its old name, so every caller in the browser is unmoved and
 * there is still exactly one of it.
 *
 * THE VERB IS THE SAME IN BOTH MODES, and only the field or the link type changes with the mode.
 * A developer asked to see the machinery gets `changed lastOutputAt` and `linked (derived_from)`;
 * the tense of the verb is not machinery, and `link (derived_from)` would just be worse English.
 */
export function changeVerb(change: { op: string; field: string | null }, mode: Mode = 'normal'): string {
  const verb = changeOpWord(change.op).text
  // An update with no field is a change to the record's own row rather than to a named field.
  // "updated" on its own left the reader with nothing to look at; this says what moved.
  if (change.op === 'update') {
    // ONE LINE ADDED TO A RUN'S TOOL USES: the row holds only that line (TOOL_USE_APPENDED_FIELD), so it says so.
    if (change.field === TOOL_USE_APPENDED_FIELD && mode !== 'inspect') {
      return readStoredWord('word.appendedTo', { field: fieldWords(`data.${TOOL_USES_FIELD}`) })
    }
    return change.field ? `${verb} ${mode === 'inspect' ? change.field : fieldWords(change.field)}` : readStoredWord('word.changeRecord', { verb })
  }
  if (change.op === 'link' || change.op === 'unlink') {
    const type = change.field ? linkWord(change.field, 'forward', mode) : null
    return `${verb}${type === null ? '' : ` (${type.text})`}`
  }
  return verb
}


// Readings declared elsewhere keep that source; the lists never copy their English.
export const FAMILY_WORDS = wordTable('word.family', Object.fromEntries(
  Object.entries(KIND_FAMILIES).map(([key, value]) => [key, value.label]),
) as Record<KindFamily, string>)
export const LINK_FORWARD_WORDS = wordTable('word.link.forward', Object.fromEntries(
  Object.entries(LINK_TYPES).map(([key, value]) => [key, value.forward]),
) as Record<LinkType, string>)
export const LINK_REVERSE_WORDS = wordTable('word.link.reverse', Object.fromEntries(
  Object.entries(LINK_TYPES).map(([key, value]) => [key, value.reverse]),
) as Record<LinkType, string>)
export const PROGRESS_READING_WORDS = wordTable('word.progress', Object.fromEntries(PROGRESS.map(key => [key, displayWord(key)])))
export const PROVENANCE_WORDS = wordTable('word.provenance', Object.fromEntries(
  Object.entries(PROVENANCE).map(([key, value]) => [key, value.reading]),
))
export const RELATION_WORDS = wordTable('word.relation', Object.fromEntries(RELATIONS.map(key => [key, key])))
export const WANTED_WORDS = wordTable('word.wanted', Object.fromEntries(
  WANTED.map(entry => [entry.name, entry.name === 'other' ? 'something with no word yet' : entry.question]),
))
export const WORLD_KIND_WORDS = wordTable('word.worldKind', WORLD_KIND_ENGLISH)
export const WORLD_STANDING_WORDS = wordTable('word.worldStanding', WORLD_STANDING_ENGLISH)

// These three states are computed by the page, rather than stored on a record.
export const COMPUTED_STATE_WORDS = wordTable('ui.computedState', {
  broken: 'broken',
  inferred: 'inferred',
  overdue: 'overdue',
})
export const PROGRESS_DETAIL_WORDS = wordTable('ui.progress', {
  not_started: 'the work has not begun',
  in_flight: 'the work is under way',
  stopped_short: 'the work began and did not finish',
  finished: 'the work reached its end',
  paused: 'it was put down on purpose, with a reason',
  unknown: 'it is recorded as genuinely undetermined',
  unclassified: 'the meaning of this word is not recorded',
})

for (const vocabulary of [
  'kind', 'family', 'link', 'state', 'kind of outside work', 'package state', 'return form',
  'screening severity', 'screening check', 'progress', 'actor', 'word', 'source', 'relation',
  'purpose', 'verdict', 'question', 'kind of world', 'standing', 'end reason', 'outcome', 'operation',
]) englishReadings.set(`word.unknown.${vocabulary}`, `unknown ${vocabulary}: {stored}`)
englishReadings.set('word.changeRecord', '{verb} the record itself')
