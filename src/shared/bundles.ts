// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readStoredWord as t } from './i18n.ts'
import { RUNGS, type Rung } from './detail.ts'

/**
 * WHAT SOMEBODY WANTED A COPY OF, DECLARED ONCE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT A BUNDLE IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/context-bundle.md` §2.1. A bundle is a SCOPE and a PRESET. It holds no
 * project content, no rendered text and no snapshot of a record. The text is resolved on demand
 * from the records the scope names, every time, so a bundle read a week later is a reading of the
 * project as it is a week later rather than a copy of how it was.
 *
 * ONE OBJECT IS BOTH THE RECIPE AND THE SNAPSHOT. On EXPORT — the moment text actually leaves the
 * building — the bundle also stores the record ids it carried with the `contentHash` each held at
 * that moment. That is not a second copy of the content: `contentHash` is already a revision's
 * identity and already the compare-and-set token every write uses, so the pairs cannot drift from
 * the ledger. What was handed over is answerable exactly; what it SAID is answerable by reading the
 * revision the hash names.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE IS IN src/shared
 * ---------------------------------------------------------------------------------------------
 *
 * The chooser on the bundles page offers these presets and these parts, and the server validates a
 * spec against the same lists. Two lists would be one fact declared twice, which is this
 * repository's own named defect.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT CHANGED ON 27 AUGUST 2026, AND WHAT IT FIXES
 * ---------------------------------------------------------------------------------------------
 *
 * A bundle used to declare SIX parts and print FOUR sections, because two pairs were aliases:
 * `whatWasTried` and `openLoops` were the same branch of the renderer, and `howItStands` and
 * `importantContext` were the same branch. Asking for one of a pair got the other's content. All
 * six are now distinct parts with distinct content, and the sixteen below them are new.
 *
 * WHAT ANSWERS EACH PART IS DECLARED IN `src/server/lib/continuation.ts`, ONE ENTRY PER PART, as a
 * total map over `SCOPE_NAMES`. A part added here without a reader named there does not compile.
 * That is what stops this list and the assembler drifting apart.
 */

/**
 * THE PARTS A COPY CAN BE MADE OF, EACH WITH THE WORDS A PERSON READS WHEN THEY CHOOSE IT.
 *
 * `label` IS WHAT THE PART IS TO A READER, never what produces it. `says` is one sentence about
 * what that part carries, and it is what the chooser puts under the label.
 *
 * A LABEL IS A NAME AND NOT A SENTENCE, and the heading is that name in capitals. Criterion B24:
 * a label names the thing, and a full sentence is not required. The
 * two are written out separately rather than derived, and they say the same words, because the text
 * points at a part by its label — "the part below called X" — and a label and a heading that
 * disagreed would send a reader looking for a heading that is not there.
 *
 * `aboutOneRecord` MARKS A PART THAT ONLY MEANS ANYTHING ABOUT ONE RECORD. Asked about a whole
 * project it is not dropped and not silently skipped: the assembler answers it, in the text, with
 * the sentence saying the question was about the project and this part is about a record.
 */
export const SCOPES = {
  // ---- the six that existed before, now six different things
  objective: {
    get label() { return t('g7a.bundles.scope.objective.label') },
    get heading() { return t('g7a.bundles.scope.objective.heading') },
    get says() { return t('g7a.bundles.scope.objective.says') },
    aboutOneRecord: false,
  },
  openLoops: {
    get label() { return t('g7a.bundles.scope.openLoops.label') },
    get heading() { return t('g7a.bundles.scope.openLoops.heading') },
    get says() { return t('g7a.bundles.scope.openLoops.says') },
    aboutOneRecord: false,
  },
  howItStands: {
    get label() { return t('g7a.bundles.scope.howItStands.label') },
    get heading() { return t('g7a.bundles.scope.howItStands.heading') },
    get says() { return t('g7a.bundles.scope.howItStands.says') },
    aboutOneRecord: false,
  },
  importantContext: {
    get label() { return t('g7a.bundles.scope.importantContext.label') },
    get heading() { return t('g7a.bundles.scope.importantContext.heading') },
    get says() { return t('g7a.bundles.scope.importantContext.says') },
    aboutOneRecord: true,
  },
  whatWasTried: {
    get label() { return t('g7a.bundles.scope.whatWasTried.label') },
    get heading() { return t('g7a.bundles.scope.whatWasTried.heading') },
    get says() { return t('g7a.bundles.scope.whatWasTried.says') },
    aboutOneRecord: false,
  },
  /**
   * TWO PARTS ABOUT LIMITS, AND THEY ANSWER TWO DIFFERENT QUESTIONS.
   *
   * `validityLimits` asks *what limits reach the things THIS COPY carries*, which is what protects a
   * stranger who is handed the copy. `placeholders` asks *what is unresolved in this project at
   * all*, which is what a person picking the project up needs and which no copy's scope can answer.
   * Neither is a narrower reading of the other and each names its own reader.
   */
  validityLimits: {
    get label() { return t('g7a.bundles.scope.validityLimits.label') },
    get heading() { return t('g7a.bundles.scope.validityLimits.heading') },
    get says() { return t('g7a.bundles.scope.validityLimits.says') },
    aboutOneRecord: false,
  },

  // ---- the parts the owner's brief of 27 August 2026 named and no bundle could carry
  placeholders: {
    get label() { return t('g7a.bundles.scope.placeholders.label') },
    get heading() { return t('g7a.bundles.scope.placeholders.heading') },
    get says() { return t('g7a.bundles.scope.placeholders.says') },
    aboutOneRecord: false,
  },
  campaign: {
    get label() { return t('g7a.bundles.scope.campaign.label') },
    get heading() { return t('g7a.bundles.scope.campaign.heading') },
    get says() { return t('g7a.bundles.scope.campaign.says') },
    aboutOneRecord: false,
  },
  plan: {
    get label() { return t('g7a.bundles.scope.plan.label') },
    get heading() { return t('g7a.bundles.scope.plan.heading') },
    get says() { return t('g7a.bundles.scope.plan.says') },
    aboutOneRecord: false,
  },
  work: {
    get label() { return t('g7a.bundles.scope.work.label') },
    get heading() { return t('g7a.bundles.scope.work.heading') },
    get says() { return t('g7a.bundles.scope.work.says') },
    aboutOneRecord: false,
  },
  schedule: {
    get label() { return t('g7a.bundles.scope.schedule.label') },
    get heading() { return t('g7a.bundles.scope.schedule.heading') },
    get says() { return t('g7a.bundles.scope.schedule.says') },
    aboutOneRecord: false,
  },
  waitingOnYou: {
    get label() { return t('g7a.bundles.scope.waitingOnYou.label') },
    get heading() { return t('g7a.bundles.scope.waitingOnYou.heading') },
    get says() { return t('g7a.bundles.scope.waitingOnYou.says') },
    aboutOneRecord: false,
  },
  decisions: {
    get label() { return t('g7a.bundles.scope.decisions.label') },
    get heading() { return t('g7a.bundles.scope.decisions.heading') },
    get says() { return t('g7a.bundles.scope.decisions.says') },
    aboutOneRecord: false,
  },
  problems: {
    get label() { return t('g7a.bundles.scope.problems.label') },
    get heading() { return t('g7a.bundles.scope.problems.heading') },
    get says() { return t('g7a.bundles.scope.problems.says') },
    aboutOneRecord: false,
  },
  findings: {
    get label() { return t('g7a.bundles.scope.findings.label') },
    get heading() { return t('g7a.bundles.scope.findings.heading') },
    get says() { return t('g7a.bundles.scope.findings.says') },
    aboutOneRecord: false,
  },
  reports: {
    get label() { return t('g7a.bundles.scope.reports.label') },
    get heading() { return t('g7a.bundles.scope.reports.heading') },
    get says() { return t('g7a.bundles.scope.reports.says') },
    aboutOneRecord: false,
  },
  workDomains: {
    get label() { return t('g7a.bundles.scope.workDomains.label') },
    get heading() { return t('g7a.bundles.scope.workDomains.heading') },
    get says() { return t('g7a.bundles.scope.workDomains.says') },
    aboutOneRecord: false,
  },
  messages: {
    get label() { return t('g7a.bundles.scope.messages.label') },
    get heading() { return t('g7a.bundles.scope.messages.heading') },
    get says() { return t('g7a.bundles.scope.messages.says') },
    aboutOneRecord: true,
  },
  recentChanges: {
    get label() { return t('g7a.bundles.scope.recentChanges.label') },
    get heading() { return t('g7a.bundles.scope.recentChanges.heading') },
    get says() { return t('g7a.bundles.scope.recentChanges.says') },
    aboutOneRecord: false,
  },
  revisions: {
    get label() { return t('g7a.bundles.scope.revisions.label') },
    get heading() { return t('g7a.bundles.scope.revisions.heading') },
    get says() { return t('g7a.bundles.scope.revisions.says') },
    aboutOneRecord: true,
  },
  structure: {
    get label() { return t('g7a.bundles.scope.structure.label') },
    get heading() { return t('g7a.bundles.scope.structure.heading') },
    get says() { return t('g7a.bundles.scope.structure.says') },
    aboutOneRecord: false,
  },
  implementationMap: {
    get label() { return t('g7a.bundles.scope.implementationMap.label') },
    get heading() { return t('g7a.bundles.scope.implementationMap.heading') },
    get says() { return t('g7a.bundles.scope.implementationMap.says') },
    aboutOneRecord: true,
  },
  contradictions: {
    get label() { return t('g7a.bundles.scope.contradictions.label') },
    get heading() { return t('g7a.bundles.scope.contradictions.heading') },
    get says() { return t('g7a.bundles.scope.contradictions.says') },
    aboutOneRecord: false,
  },
  /**
   * THE RECORDS SOMEBODY NAMED BY HAND, on top of whatever the copy's subject already carries.
   *
   * By option C of a decision, how detailed a copy is and what it contains are two questions, and the ladder does not
   * answer the second one. Criterion B8 of `design/bundle/ACCEPTANCE.md`.
   *
   * IT IS WHERE THE SEARCH FOR ONE RECORD LIVES NOW. Searching was the only way to say what a copy
   * was about — a copy's subject was the whole project or exactly one record — so a person who
   * wanted the project AND two particular records could not ask for it. Searching adds a record to
   * a copy here; it is not how a copy is composed.
   */
  additionalRecords: {
    get label() { return t('g7a.bundles.scope.additionalRecords.label') },
    get heading() { return t('g7a.bundles.scope.additionalRecords.heading') },
    get says() { return t('g7a.bundles.scope.additionalRecords.says') },
    aboutOneRecord: false,
  },
  nextActions: {
    get label() { return t('g7a.bundles.scope.nextActions.label') },
    get heading() { return t('g7a.bundles.scope.nextActions.heading') },
    get says() { return t('g7a.bundles.scope.nextActions.says') },
    aboutOneRecord: false,
  },
} as const satisfies Readonly<Record<string, ScopeSpec>>

/** What one part declares. `label` and `says` are the only two strings a person ever reads. */
export interface ScopeSpec {
  label: string
  /**
   * THE HEADING THIS PART IS PRINTED UNDER IN THE TEXT THAT LEAVES THE BUILDING.
   *
   * It is not the label upper-cased, and the difference is deliberate. A label is chosen for
   * somebody standing in front of a list of parts to pick from; a heading is read by a stranger
   * with no context at all, in a wall of plain text, and has to carry its own instruction. Both
   * are declared here, once each, so neither can be re-typed somewhere else.
   */
  heading: string
  says: string
  aboutOneRecord: boolean
}

export type ScopeName = keyof typeof SCOPES
export const SCOPE_NAMES = Object.keys(SCOPES) as ScopeName[]

/**
 * THE OLD NAME FOR A PART, KEPT AS AN ALIAS OF THE NEW TYPE AND NOTHING ELSE.
 *
 * `slots` is the field name on a stored bundle and on the query string, so the word survives on the
 * wire. Nothing in this file has two meanings for it.
 */
export type SlotName = ScopeName

/**
 * THE PRESETS, DECLARED AS A TOTAL MAP so an eighth cannot be added without saying what it is for
 * and which scopes it is offered on. Same shape as `KIND_SPECS`, and for the same reason: the tests
 * iterate the declaration rather than a hand-written list.
 */
export const BUNDLE_PRESETS = {
  continue: {
    get word() { return t('g7a.bundles.preset.continue.word') },
    /** `'*'` means every record kind, and the project too. */
    offeredOn: '*',
    get forWhat() { return t('g7a.bundles.preset.continue.forWhat') },
    slots: ['objective', 'howItStands', 'openLoops', 'whatWasTried', 'importantContext', 'validityLimits'],
    budgetBytes: 16 * 1024,
  },
  critique_module: {
    get word() { return t('g7a.bundles.preset.critique_module.word') },
    offeredOn: ['module'],
    get forWhat() { return t('g7a.bundles.preset.critique_module.forWhat') },
    slots: ['objective', 'howItStands', 'importantContext', 'whatWasTried', 'implementationMap', 'validityLimits'],
    budgetBytes: 16 * 1024,
  },
  investigate_problem: {
    get word() { return t('g7a.bundles.preset.investigate_problem.word') },
    offeredOn: ['problem'],
    get forWhat() { return t('g7a.bundles.preset.investigate_problem.forWhat') },
    slots: ['objective', 'whatWasTried', 'importantContext', 'revisions', 'validityLimits'],
    budgetBytes: 16 * 1024,
  },
  /**
   * `campaign` IS HOW FAR THROUGH THE PIPELINE IS, and this preset said *where it stands* in its own
   * sentence while carrying no part that answered it. A copy about one pipeline now carries the same
   * step count the pipeline's own page draws and the same one the cold-start reading gives, because
   * all three go through `readOnePipelinesBlocks`. Criterion B4 of design/bundle/ACCEPTANCE.md.
   */
  understand_pipeline: {
    get word() { return t('g7a.bundles.preset.understand_pipeline.word') },
    offeredOn: ['pipeline'],
    get forWhat() { return t('g7a.bundles.preset.understand_pipeline.forWhat') },
    slots: ['objective', 'campaign', 'howItStands', 'importantContext', 'structure', 'validityLimits'],
    budgetBytes: 16 * 1024,
  },
  recover_project: {
    get word() { return t('g7a.bundles.preset.recover_project.word') },
    offeredOn: 'project',
    get forWhat() { return t('g7a.bundles.preset.recover_project.forWhat') },
    slots: [
      'objective',
      'campaign',
      'howItStands',
      'plan',
      'openLoops',
      'schedule',
      'waitingOnYou',
      'problems',
      'workDomains',
      'recentChanges',
      'placeholders',
      'validityLimits',
      'nextActions',
    ],
    budgetBytes: 32 * 1024,
    weights: { openLoops: 4, plan: 2, problems: 2 },
  },
  /**
   * THE OWNER'S GOVERNANCE PACK, and the sentence it exists to answer is their own: they should not
   * have to open the waiting-on-you items one at a time and copy them to another agent by hand.
   *
   * Its parts are the ones their brief of 27 August 2026 §13 lists: the queue itself carries each
   * item's id, its short title, its question, its options, its recommendation, what it is holding
   * up, the evidence already on it and whether something has replaced it or asked it twice. The
   * decisions already made are here because the first thing anybody settling a fork needs is what
   * has already been settled, and the plan and the schedule are here because their list names them
   * as the context a fork is answered against.
   */
  owner_governance: {
    get word() { return t('g7a.bundles.preset.owner_governance.word') },
    offeredOn: '*',
    get forWhat() { return t('g7a.bundles.preset.owner_governance.forWhat') },
    slots: ['waitingOnYou', 'decisions', 'plan', 'schedule', 'validityLimits'],
    /**
     * NINETY-SIX KILOBYTES, AND THE NUMBER IS MEASURED RATHER THAN CHOSEN.
     *
     * The owner's queue on 27 August 2026 held 26 forks. Written whole — id, title, question, every
     * option, the recommendation, what each is holding up, the evidence already on it and its
     * duplicate or supersession state — they came to 47,773 bytes. At 16,384 the part could carry
     * only one line each, which is not enough: a list of titles is what
     * the queue on screen already gives them. Twelve eighteenths of 98,304 is 65,536, which carries
     * all 26 whole with room as the queue grows.
     */
    budgetBytes: 96 * 1024,
    weights: { waitingOnYou: 12, decisions: 2, plan: 2 },
  },
  /**
   * NAMED FOR WHAT PRESSING IT DOES, not for the category it belongs to. `Custom` is a category
   * name; chapter 6 rule 4 of the office regulations says to name a thing by what it is to the
   * reader, not by the mechanism that produced it.
   */
  custom: {
    get word() { return t('g7a.bundles.preset.custom.word') },
    offeredOn: '*',
    // NO LINE UNDER THIS ONE, and that is criterion B24 rather than an omission. It said "You pick
    // the parts, one by one.", and picking this preset draws the boxes to tick directly underneath:
    // the sentence described what the reader could already see, and it was one of the three dropped.
    slots: SCOPE_NAMES,
    budgetBytes: 32 * 1024,
  },
} as const satisfies Readonly<Record<string, BundlePresetSpec>>

export interface BundlePresetSpec {
  word: string
  /** `'*'` — every kind and the project. `'project'` — the project only. Otherwise the kinds. */
  offeredOn: '*' | 'project' | readonly string[]
  /**
   * ONE LINE UNDER THE MENU SAYING WHAT THIS PRESET IS FOR, or nothing at all.
   *
   * ABSENT MEANS THE PRESET NEEDS NO LINE, which is a real answer rather than a gap: `custom` draws
   * the boxes to tick right underneath it, so a sentence there described what the reader could
   * already see. Criterion B24. The page draws nothing where this is absent.
   */
  forWhat?: string
  slots: readonly ScopeName[]
  /**
   * THE SIZE THIS PRESET IS ASSEMBLED UNDER WHEN NOBODY SAYS OTHERWISE, in bytes.
   *
   * It is a property of what the preset is FOR. 16,384 is what an agent can read at the start of a
   * run without the corpus arriving with it, and it is right for five of these. It is wrong for the
   * governance pack, which is measured below.
   */
  budgetBytes: number
  /**
   * HOW THE SIZE IS SHARED OUT, by part, when the shares are not equal. Missing means one.
   *
   * A WEIGHT IS DECLARED AND NEVER DERIVED FROM THE DATA, which is what keeps rule 4 in
   * `src/server/lib/continuation.ts`: what one part drops must not depend on how much another part
   * happened to find, or the same question gets different answers as unrelated records change.
   */
  weights?: Readonly<Partial<Record<ScopeName, number>>>
}

export type BundlePreset = keyof typeof BUNDLE_PRESETS
export const BUNDLE_PRESET_NAMES = Object.keys(BUNDLE_PRESETS) as BundlePreset[]

/**
 * THE PARTS A BUNDLE CAN BE MADE OF, as a flat list, for a caller that wants to check a name.
 *
 * `validityLimits` IS ON EVERY PRESET AND IT IS NOT A PART THE BUDGET CAN DROP. What actually
 * protects it is that each restriction also rides INSIDE the entry of the record it reaches, which
 * a budget cannot squeeze out. See `src/server/lib/continuation.ts`, rule 1.
 */
export const SLOT_NAMES: readonly ScopeName[] = SCOPE_NAMES

/**
 * THE FIVE POSITIONS A COPY OFFERS, shortest first. The design is in a decision, corrected once, and topped out by
 * criterion B32.
 *
 * They are five of the seven in `src/shared/detail.ts` and no new word is minted for any of them.
 *
 *   `title`    Level 2      the entry's one identifying line
 *   `gist`     Conclusion   that line, what the part's reader wrote about it, and the record's summary
 *   `outline`  Level 4      the Conclusion and one line per child: the child's title
 *   `sketch`   Level 5      the Conclusion and each child's title and conclusion
 *   `digest`   Level 6      the Conclusion and each part of the record in 120 words
 *
 * THE RECORD ITSELF IS NOT ON THIS LIST, AND THAT IS CRITERION B32. Rung 7 is the record's own
 * content and a copy never goes there: the full content may be somebody's raw words, and it may be
 * incomplete (problem `AQZm6esnQqCr`). So the top of a copy is the
 * highest rung really written on that record: the digest where somebody wrote one, else the sketch,
 * else the outline, else the Conclusion.
 *
 * LEVEL 1 IS NOT HERE AND IS NOT RENAMED. A label is written for 195 of this project's 3,457 live
 * records, measured 8 September 2026, so offering it would draw an absence sentence nine times in
 * ten.
 */
export const BUNDLE_RUNGS: readonly Rung[] = RUNGS.filter((rung) => rung !== 'label' && rung !== 'full')

/**
 * THE POSITION A COPY IS DRAWN AT WHEN NOBODY SAYS: the top of the ladder a copy has.
 *
 * IT IS A CEILING RATHER THAN A PROMISE. An entry with no digest written is drawn at the highest
 * rung it really has, and the copy counts that at the top — criterion B11: a level that is not
 * written gives way to the one below it. So asking for the top is how every entry lands on its
 * own top, which is what criterion B32 asks for.
 */
export const BUNDLE_RUNG_WHEN_NOBODY_SAYS: Rung = 'digest'

/** True when this word is one of the five a copy may be asked for. */
export function isBundleRung(word: unknown): word is Rung {
  return typeof word === 'string' && (BUNDLE_RUNGS as readonly string[]).includes(word)
}

/**
 * HOW FAR LESS OR MORE MAY MOVE A COPY'S LEVELS: one press fewer than the rungs a copy offers, four
 * today, because anything past that is the same answer as that. Worked out from `BUNDLE_RUNGS`, as
 * the page's own presses are (src/web/components/BundlePanel.tsx, where a press is held to the
 * ladder), so the two cannot disagree. The preview door's query, the write of a bundle and the
 * assembling of its copy all read it here. Problem -gdJAlC4S0ob.
 */
export const BUNDLE_SHIFT_LIMIT = BUNDLE_RUNGS.length - 1

/** True when this value is a move a copy can make: a whole number from -4 to 4. */
export function isBundleShift(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= BUNDLE_SHIFT_LIMIT
}

/**
 * HOW FAR THE LEVELS WERE MOVED, IN WORDS. Criterion B31.
 *
 * ONE PLACE, BECAUSE FOUR THINGS SAY IT: the control on the page says where the levels stand, the
 * copy's own head line says it, each part's sentence in the text says it, and a test reads it back.
 * Four spellings of one fact is the drift the ninth invariant is about.
 *
 * NEVER CALLED WITH ZERO. A copy nobody moved says so in its own words rather than saying it was
 * moved by nothing, and the callers that can be handed a zero say the other sentence instead.
 */
export function rungsMoved(shift: number): string {
  const n = Math.abs(shift)
  return t(shift < 0 ? 'g7a.bundles.below' : 'g7a.bundles.above', { n })
}

/**
 * WHERE THE LEVELS STAND NOW, as the phrase the page draws beside less and more. Criterion B31.
 *
 * It takes a zero, because the page always has an answer to draw: at zero every part is at the
 * longest level its own share of the size fits, which is criterion B30's base.
 */
export function howFarFromTheAutomaticLevel(shift: number): string {
  return shift === 0
    ? t('g7a.bundles.automatic')
    : t('g7a.bundles.shift', { moved: rungsMoved(shift) })
}

/**
 * THE SIZE OF A READING, IN THE WORDS BOTH PLACES THAT DRAW IT USE. Criterion B34.
 *
 * THE PAGE DRAWS THIS NUMBER TWICE: once in the scale beside Less and More, and once in the
 * paragraph under the copy. Two spellings of the same size is the drift the ninth invariant is
 * about, and the owner's own test is that the two must match to the digit, so the string is
 * written once here and read by both.
 *
 * NO GROUPING SEPARATOR, deliberately. The paragraph has always drawn the plain digits, and a
 * scale that grouped them would read as a different number beside the same number.
 */
export function sizeInWords(size: { characters: number; bytes: number }): string {
  return t('g7a.bundles.size', { characters: size.characters, bytes: size.bytes })
}

/**
 * HOW MANY PARTS ARE AT THE HIGHEST LEVEL THEY REALLY HAVE, AND HOW MANY ARE BELOW IT. Criterion B34.
 *
 * THE NUMBERS BESIDE LESS AND MORE, from the same two fields `whatLevelThisPartGot` draws each
 * part's level and top from. A part that chose no level and a part carrying no entries have no top
 * to be at or below, so neither is counted: counting them would put a number on something nobody
 * measured.
 */
export function partsAtTheirTop(
  parts: readonly { chose?: { level: Rung }; top: Rung | null }[],
): { atTop: number; below: number } {
  let atTop = 0
  let below = 0
  for (const part of parts) {
    if (part.chose === undefined || part.top === null) continue
    if (part.chose.level === part.top) atTop += 1
    else below += 1
  }
  return { atTop, below }
}

/** What the bundle is about. A project has no record id, and that is why this is a union. */
export type BundleScope = { kind: 'project' } | { kind: 'record'; recordId: string }

/** The recipe. Everything a resolution needs and nothing about any particular resolution. */
export interface BundleSpec {
  scope: BundleScope
  preset: BundlePreset
  /** Only when `preset` is `custom`. The chosen parts. */
  slots?: readonly ScopeName[]
  /** How far from the scope record to reach, in links. Absent for a project scope. */
  reach?: 1 | 2 | 3
  /**
   * WHICH MODULES AND PIPELINES GO IN, by id. ABSENT MEANS ALL OF THEM, which is what a copy did
   * before this existed and is still the answer when nobody says otherwise.
   *
   * It is the thirteenth name on the owner's own list in register section 9 — *selected Modules and
   * Pipelines* — and the one that was not built. `structure` carried every module and every pipeline
   * and there was no way to name a few. Criterion B6 of design/bundle/ACCEPTANCE.md.
   *
   * AN EMPTY ARRAY IS NOT "ALL OF THEM". It is somebody naming none, and it is refused with the
   * sentence below rather than read as absence, for the same reason an empty `slots` is.
   */
  modulesAndPipelines?: readonly string[]
  /**
   * HOW DETAILED EACH ENTRY IS, as one position of the seven-level ladder in `src/shared/detail.ts`.
   *
   * Absent means the longest position, which is what every copy did before this existed. The person's design of
   * 6 September 2026, corrected the same afternoon, is that a copy offers five of the seven, and which five is
   * `BUNDLE_RUNGS` below.
   *
   * IT IS NOT THE SIZE. `budgetBytes` is a ceiling on the whole text; this is how much each record
   * says. The person's own sentence about the two axes is on a decision: what a copy contains and how detailed it is
   * are different questions, and so are how detailed and how big.
   */
  detail?: string
  /**
   * HOW FAR THE PERSON MOVED EVERY PART FROM THE LEVEL ITS OWN SHARE CHOSE. Criterion B31.
   *
   * Negative is less and positive is more, one rung of `BUNDLE_RUNGS` a press. Absent and zero are
   * the same thing: nobody moved anything, and every part is drawn at the level its share of the
   * size gives it, which is what every copy did before this existed.
   *
   * IT IS NOT `detail` AND CANNOT BE WRITTEN AS ONE. `detail` names one absolute level for the
   * whole copy; this is an offset from a base worked out per part, so one offset means a different
   * level in each part. Decision `JPDu6lJcizw0`: the size asked for
   * shapes the automatic base, and the offset is the person's. The page offers only this one.
   */
  shift?: number
  /**
   * THE RECORDS SOMEBODY NAMED BY HAND, by id, on top of what the subject carries. Absent means none.
   *
   * A copy's subject is the whole project or exactly one record. This is the third thing one of the person's
   * decisions asks for: a set of records somebody chose, carried under a part of their own.
   * Criterion B8.
   *
   * NAMING RECORDS PUTS THE PART IN. `slotsOf` adds `additionalRecords` to whatever preset this is
   * sent with, so a person does not have to choose a preset that happens to declare it, and a copy
   * that carries none of them does not print an empty heading. AN EMPTY ARRAY IS NOT ABSENCE: it is
   * somebody naming none, and it is refused with the sentence that says so.
   */
  additionalRecords?: readonly string[]
  /** The ceiling for the whole text, in bytes. */
  budgetBytes: number
}

/**
 * WHY A CHOSEN SET OF ADDITIONAL RECORDS CANNOT BE USED, IN A SENTENCE, OR NULL WHEN IT CAN.
 *
 * ONLY THE SHAPE IS DECIDED HERE, for the reason `whyTheseModulesAndPipelinesCannotBeUsed` says:
 * whether each id names a live record of this project is a question about records, and this file
 * cannot read records. `resolveBundle` asks it and refuses there, naming every id it could not use.
 */
export function whyTheseAdditionalRecordsCannotBeUsed(chosen: readonly string[] | undefined): string | null {
  if (chosen === undefined) return null
  if (chosen.length === 0) {
    return (
      `“${SCOPES.additionalRecords.label}” was asked for and no record was named, so there is nothing to put ` +
      'under it. Name at least one record, or leave the list out and the copy carries what its subject carries.'
    )
  }
  const blank = chosen.filter((one) => one.trim() === '')
  if (blank.length > 0) {
    return (
      `${String(blank.length)} of the ${String(chosen.length)} record(s) named is blank. A blank is not a record ` +
      'and it is not an absence either. Nothing was assembled.'
    )
  }
  return null
}

/**
 * WHY A CHOSEN SET OF MODULES AND PIPELINES CANNOT BE USED, IN A SENTENCE, OR NULL WHEN IT CAN.
 *
 * ONLY THE SHAPE IS DECIDED HERE. Whether each id names a module or a pipeline that exists is a
 * question about records, and this file cannot read records; `resolveBundle` asks it and refuses
 * there, naming every id it could not use.
 *
 * IT REFUSES A LIST SENT TO A COPY WITH NO `structure` PART for the reason `whyTheseSlotsCannotBeUsed`
 * refuses a list of parts sent beside the wrong preset: the request would be answered, the reply
 * would echo the list back, and nothing in the answer would say the list had been ignored.
 */
export function whyTheseModulesAndPipelinesCannotBeUsed(
  parts: readonly ScopeName[],
  chosen: readonly string[] | undefined,
): string | null {
  if (chosen === undefined) return null
  if (!parts.includes('structure')) {
    return (
      `This names ${String(chosen.length)} module(s) or pipeline(s) to put in the copy, and this copy has no ` +
      `“${SCOPES.structure.label}” part to put them in. Nothing was assembled. Add that part, or send the copy ` +
      'without the list.'
    )
  }
  if (chosen.length === 0) {
    return (
      `“${SCOPES.structure.label}” was asked for and no module or pipeline was named, so there is nothing to put ` +
      'under it. Name at least one, or leave the list out altogether and the copy carries all of them.'
    )
  }
  const blank = chosen.filter((one) => one.trim() === '')
  if (blank.length > 0) {
    return (
      `${String(blank.length)} of the ${String(chosen.length)} module(s) or pipeline(s) named is blank. A blank is ` +
      'not a record and it is not an absence either. Nothing was assembled.'
    )
  }
  return null
}

/**
 * HOW MUCH OF THE SIZE EACH PART OF A SPEC GETS, in bytes, by name.
 *
 * ONE FUNCTION, so the size the reply reports and the size each part was actually held to cannot
 * come apart. Remainder bytes from the division are not handed to anybody — see rule 4.
 */
export function sharesOf(spec: BundleSpec): Map<ScopeName, number> {
  const parts = slotsOf(spec)
  const weights = (BUNDLE_PRESETS[spec.preset] as BundlePresetSpec).weights
  const total = parts.reduce((sum, name) => sum + (weights?.[name] ?? 1), 0)
  const out = new Map<ScopeName, number>()
  for (const name of parts) {
    out.set(name, total === 0 ? 0 : Math.floor((spec.budgetBytes * (weights?.[name] ?? 1)) / total))
  }
  return out
}

/** Which presets a record of this kind is offered, or the project's own list. */
export function presetsFor(kind: string | null): BundlePreset[] {
  return BUNDLE_PRESET_NAMES.filter((name) => {
    const on = BUNDLE_PRESETS[name].offeredOn
    if (kind === null) return on === '*' || on === 'project'
    if (on === 'project') return false
    if (on === '*') return true
    return (on as readonly string[]).includes(kind)
  })
}

/**
 * WHY A CHOSEN LIST OF PARTS CANNOT BE USED, IN A SENTENCE, OR NULL WHEN IT CAN.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS IS THE REFUSAL THAT USED TO BE A SILENT NARROWING
 * ---------------------------------------------------------------------------------------------
 *
 * Measured on 27 August 2026: `GET /api/bundles/preview?preset=continue&slots=plan,schedule,waiting`
 * was answered 200. The three names were filtered out of the array, the array then went empty and
 * the key was dropped, and the caller was handed the `continue` reading with nothing anywhere in
 * the reply saying its request had been narrowed. A caller that asked for the Plan was told yes and
 * given something else.
 *
 * AND `slots` WAS IGNORED ALTOGETHER UNLESS THE PRESET WAS `custom`, WHILE THE REPLY ECHOED IT
 * BACK ON EVERY PRESET. The same list produced 10,968 bytes on `continue` and 4,357 on `custom`,
 * and both replies claimed `slots: ["objective"]`. One list, two answers, and the reply asserted
 * the list either way.
 *
 * Both are refusals now, and this function is the one place either is decided, so the query door
 * and the stored-bundle door cannot come to different views about the same spec.
 */
export function whyTheseSlotsCannotBeUsed(preset: BundlePreset, slots: readonly string[] | undefined): string | null {
  if (slots === undefined) return null
  if (preset !== 'custom') {
    return (
      `This asks for ${String(slots.length)} named part(s) with the preset "${BUNDLE_PRESETS[preset].word}", and ` +
      `only "${BUNDLE_PRESETS.custom.word}" takes a list of parts. Every other preset IS its list, so a list sent ` +
      'beside one would be ignored and the reply would still claim it. Send the parts with the "custom" preset, or ' +
      'send the preset on its own.'
    )
  }
  // NO LIST OF PART NAMES IN THIS ONE, AND THE SEVENTH RULE IS WHY. This is the only refusal a
  // person can reach by pressing a button — the chooser on `#/bundles` can only produce valid
  // names, so the unknown-name refusal below is for callers that are not on the page. Printing
  // `objective, openLoops, howItStands, …` here put twenty-four machine words on the screen of
  // somebody who had just been reading those same parts under their plain names.
  if (slots.length === 0) {
    return t('g7a.bundles.choosePart', { preset: BUNDLE_PRESETS.custom.word })
  }
  const unknown = slots.filter((one) => !(SCOPE_NAMES as readonly string[]).includes(one))
  if (unknown.length > 0) {
    return (
      `Mole Office has no part called ${unknown.map((one) => `"${one}"`).join(', ')}, so nothing was assembled. ` +
      `Nothing was quietly left out either: the parts a copy can be made of are ${SCOPE_NAMES.join(', ')}.`
    )
  }
  return null
}

/**
 * The parts one spec actually asks for.
 *
 * IT REFUSES RATHER THAN NARROWING. A spec whose list cannot be used throws, with the sentence
 * `whyTheseSlotsCannotBeUsed` wrote, because the alternative is the silent substitution above.
 */
export function slotsOf(spec: BundleSpec): readonly ScopeName[] {
  const why = whyTheseSlotsCannotBeUsed(spec.preset, spec.slots)
  if (why !== null) throw new Error(why)
  const cannotAdd = whyTheseAdditionalRecordsCannotBeUsed(spec.additionalRecords)
  if (cannotAdd !== null) throw new Error(cannotAdd)
  const asked = spec.preset === 'custom' && spec.slots !== undefined ? spec.slots : BUNDLE_PRESETS[spec.preset].slots
  // NAMING RECORDS PUTS THE PART IN, WHATEVER THE PRESET IS. Criterion B8. A preset IS its list of
  // parts, and adding records is not choosing a part: it is the second axis a decision keeps, what goes in, asked of
  // a copy that has already chosen what it is for.
  // Refusing the list because the preset does not declare the part would make the only way to carry
  // a named record the preset that carries every part.
  if (spec.additionalRecords === undefined || asked.includes('additionalRecords')) return asked
  return [...asked, 'additionalRecords']
}
