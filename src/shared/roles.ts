// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A ROLE CARD IS, WHAT A POWER IS, AND HOW A REFUSAL IS WORKED OUT. The shape only.
 *
 * ---------------------------------------------------------------------------------------
 * DUTIES AND POWERS ARE TWO THINGS, AND THE CARD IS ABOUT DUTIES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P56: powers and duties are decoupled, and the core of a role card is its duties, not its powers.
 * A card is a name, its duties — what the role is responsible for, and what it does in which
 * situation — and its powers, named. Two roles may hold the same powers and be responsible for
 * entirely different work, so powers can never be what tells two roles apart. The secretary and the
 * supervisor hold almost the same powers in this declaration — the secretary's step adds three, `The
 * dead letters`, `Calling the person in` and `The Casting table` — and their duties are nothing alike.
 *
 * ---------------------------------------------------------------------------------------
 * THERE IS NO MAY LIST AND NO MAY-NOT LIST, ANYWHERE. Criterion P57
 * ---------------------------------------------------------------------------------------
 *
 * The cards used to carry both, and the May-not list was the complement of the May list written out
 * by hand. That is why it was long, why a refusal like *delete a decision that never existed* would
 * have fitted on it, and why the secretary could not write a decision: the person's acts sat on the
 * administrator card only, and no rung ever reached them.
 *
 * Now the file declares NAMED POWERS, each holding the acts under it, and a TREE of rungs, each rung
 * adding powers to the rung below. A holder's acts are the acts under the powers it holds.
 * **Everything else is refused, and the refusal is worked out here rather than written down.**
 * `actsRefusedTo` is that subtraction. Nothing in this repository writes a complement list.
 *
 * ---------------------------------------------------------------------------------------
 * `The person's own acts` IS A POWER, WHICH IS WHAT MAKES ELEVATION ONE MECHANISM
 * ---------------------------------------------------------------------------------------
 *
 * The acts that are the person's — decide, settle a fork, and the rest — are a power like any other.
 * No rung of the tree holds it; the person's card does. Elevation (criterion P59) is the
 * person handing that one power to the secretary for a while, so it is not a second kind of rule:
 * `actsRefusedTo(decl, 'secretary', ['The person's own acts'])` is the whole of it, and the same
 * subtraction answers before and after.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS IN `shared` AND READS NO FILE
 * ---------------------------------------------------------------------------------------
 *
 * The browser draws a role's words and the server enforces them. The browser may not import from
 * `src/server`, so the shape and the reading live here and both sides import them. Opening the file
 * is `src/server/lib/roles.ts`, which is the only thing that touches a disk.
 */

import type { HandbookRead } from './handbooks.ts'
import type { Language, Say } from './i18n.ts'
/** How much of a chapter a role has to read. The three words, and there is no fourth. */
import type { NotebookOnACard } from './notebook.ts'
import { drawnStamp } from './time.ts'
import { aTimeHasCome } from './typed-time.mjs'

export const READING_LEVELS = ['full', 'conclusion', 'label-and-title'] as const

export type ReadingLevel = (typeof READING_LEVELS)[number]

/** One act, named by the key Mole Office publishes for it, with the words a person reads. */
export interface RoleAct {
  /**
   * The act's key. Either an operation name from `src/shared/ops.ts` or the `actKey` of a
   * governance guard. Both are published, and a key outside both is refused when the server starts.
   */
  act: string
  /** The act in a person's words, as the start of a sentence. This is what a refusal says. */
  inWords: string
}

/**
 * ONE NAMED POWER: a short name a person reads, and the acts Mole Office refuses without it.
 *
 * The name is what a card carries and what a person sees. The acts are what the refusal is computed
 * from. An act belongs to exactly one power, so "who may do this" has one answer.
 */
export interface NamedPower {
  /** The name on a card. A name, not a sentence. */
  name: string
  /** What the power is, in one sentence, for somebody reading the file rather than a card. */
  whatItIs: string
  acts: RoleAct[]
}

/** One step of the power tree: which role stands on it, and which powers that step adds. */
export interface TreeStep {
  rung: number
  /** The card that stands on this step. */
  role: string
  /** The powers this step adds to everything the step below already holds. May be empty. */
  adds: string[]
  /**
   * WHAT THE CARD ABOVE THIS STEP MAY DO TO THE CARD ON THIS STEP. Criterion P79.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT IS DECLARED HERE AND NOT WORKED OUT IN THE DRAWING
   * ---------------------------------------------------------------------------------------
   *
   * Criterion P79: the power tree was not drawn at all; the page only wrote its parts out as
   * text, not as a graph of levels. The half with no code was what an upper card may do to a lower
   * one, which the design states as three acts: give it its card, retire it, start it. Nothing in the
   * declaration said those three acts as a set. Writing them into the page would have been a second
   * reading of the tree, which is this repository's recurring defect, so they are declared here and
   * read from the same reply the cards are drawn from.
   *
   * IT IS THE CHILD STEP THAT CARRIES IT, so the person at the top of the drawing needs no card of
   * its own here: the topmost step's line says what a person holding the administrator card may do to
   * it. An empty list is the bottom rung, which nothing on the tree stands above.
   *
   * IT IS A DRAWING OF WHAT IS ALREADY DECIDED ELSEWHERE, not a new rule. Who may give a card is
   * `appoints` on the card and `agent.dispatch` under Groups and dispatch; who may retire whom is the
   * rank rule in src/server/api/participants.ts. This field says those facts on the line a reader
   * meets, in the words a reader reads.
   */
  whatTheCardAboveMayDoToThis: string[]
}

/** One chapter of the code of law, and how much of it this role has to read. */
export interface ChapterToRead {
  chapter: number
  level: ReadingLevel
}

export interface MustRead {
  chapters: ChapterToRead[]
  /** What the starter names on top, or null where the card names everything itself. */
  andWhatItsStarterNames: string | null
}

/** One chapter of the code of law, by number and name. */
/**
 * ONE CHAPTER A CARD MAY POINT AT, by its number only. Its name is not held here: the chapter records are the
 * regulations' only authority, and every reader takes a chapter's name from the chapter records of the office it is
 * in, the records GET /api/office-regulations shows (invariant 9: a name typed in two places drifts).
 */
export interface Chapter {
  number: number
}

/** A chapter as a reader is handed it: its number, and its name as the chapter export gives it. */
export interface NamedChapter {
  number: number
  /** Its name as the chapter export gives it. */
  name: string
  /** Its Chinese name, from the chapter record's current Chinese (`theNameOfAChapter`), or null where none is written. */
  zh: string | null
}

/** Who may give this card out. Two answers, and the sentence a person reads is built from them. */
export const APPOINTED_BY = ['the person', 'the tree'] as const
export type AppointedBy = (typeof APPOINTED_BY)[number]

/** Whom a holder of this card may appoint. Criterion P58. */
export const APPOINTS = ['nobody', 'at or below its own rung', 'every role'] as const
export type Appoints = (typeof APPOINTS)[number]

/**
 * WHAT ONE ROLE MAY REGISTER AS THE PLACE IT WORKS — CRITERION P92.
 *
 * The role decides the permissions, and each role names a different place.
 * So the grain is not one rule for everybody: a worker names
 * folders under the work directory, a supervisor names the one directory its cluster works in, a
 * secretary names nothing and is limited by none, and an inspector names the check worktree.
 *
 * THE WORDS OF THE REFUSAL COME FROM THE FILE. `says` is the sentence a caller reads when the door
 * refuses, and `design/permissions/roles.json` is where it is written, so the rule and the words a
 * person reads cannot drift. A card with no `workArea` block is refused by the door rather than
 * waved through: the door has no rule to apply, and guessing one would be a rule nobody wrote.
 *
 * `most` is an upper bound on how many paths may be registered, or null for no cap. It is the only
 * number here; nothing enforces a lower bound, because an agent that registers an empty area has
 * honestly said there is none, and P93 is what stops it starting work on that.
 */
export const WORK_AREA_GRAINS = ['folders', 'a directory', 'nothing', 'the check worktree'] as const

export type WorkAreaGrain = (typeof WORK_AREA_GRAINS)[number]

/** One card's rule for the work area its holder may register. Criterion P92. */
export interface WorkAreaRule {
  /** The grain: folders, one directory, nothing, or the check worktree. */
  grain: WorkAreaGrain
  /**
   * How many paths may be registered at most, or the words "no limit".
   *
   * NOT NULL, AND THE REASON IS NOT STYLE. This file is copied into a record by POST
   * /api/roles/mirror, and that copy is written with `dataPatch`, where a null REMOVES the key and
   * is never stored (src/server/lib/records.ts). A card whose rule said `most: null` was therefore
   * copied without the key at all, and the copy compared itself to the declaration and reported
   * itself out of date for ever — measured on the worker card, 13 September 2026, which was the one
   * card with no limit. A word survives the copy and reads plainly to a person, which is what this
   * file is for.
   */
  most: number | 'no limit'
  /**
   * WHETHER THIS CARD LETS A FILE BE NAMED AT THE REPOSITORY ROOT, and the only value that says yes
   * is the words "by name". A work area may list a
   * specific file under the repository root beside its folders (README.md, bridge.py), while the
   * root itself and a file with a path in it stay refused. The field is absent
   * on every card that does not permit one, so a card that never carried it keeps today's behaviour exactly.
   *
   * WHY A WORD AND NOT A BOOLEAN. A word says what the permission is — the files are named one at a
   * time — and leaves room for a second answer later without a `false` that could be mistaken for
   * "the key is missing". An unknown word is refused when the cards are read, never read as true.
   */
  rootFiles?: 'by name'
  /** The sentence a refused caller reads. Written on the card, never retyped in the code. */
  says: string
}

/** Whether a value read off disk is a work-area rule. Loose in, strict here. */
export function isAWorkAreaRule(value: unknown): value is WorkAreaRule {
  if (typeof value !== 'object' || value === null) return false
  const one = value as Record<string, unknown>
  if (typeof one['grain'] !== 'string' || !(WORK_AREA_GRAINS as readonly string[]).includes(one['grain'])) return false
  const most = one['most']
  // A NUMBER OR THE WORDS "no limit", AND NEVER NULL. A null cannot survive being copied into a
  // record — see the field's own note above — so it is not a value this rule may take.
  if (most !== 'no limit' && (typeof most !== 'number' || !Number.isInteger(most) || most < 0)) return false
  // `rootFiles` IS ABSENT OR THE WORDS "by name". A card carrying anything else is refused when the
  // cards are read, so an unknown word is never quietly read as a permission the card does not hold.
  const rootFiles = one['rootFiles']
  if (rootFiles !== undefined && rootFiles !== 'by name') return false
  return isPlainSentence(one['says'])
}

/**
 * WHETHER A PATH NAMES A FILE RATHER THAN A FOLDER, from its spelling alone.
 *
 * The door never touches the disk: a worker registers a folder it has not created yet, and the
 * office has no checkout to resolve a path against. So a file is a path whose last segment carries
 * an extension — `src/server/lib/roles.ts` is a file, `src/server/lib` is a folder. A leading dot
 * is not an extension, so `.github` and `.gitignore` read as folders; that is the one place this
 * rule can be wrong, and it is wrong toward letting a folder through rather than refusing one.
 */
export function looksLikeAFile(path: string): boolean {
  const last = path.split('/').pop() ?? ''
  return last.length > 0 && last.includes('.', 1)
}

/** The sentence a door gives when a card carries no work-area rule. Criterion P92. */
export function whyACardHasNoWorkAreaRule(role: string): string {
  return (
    `The "${role}" card has no workArea block, so the door has no rule to apply and a guess would be nobody's ` +
    'rule. Add one to src/config/roles.json. Nothing was written.'
  )
}

/**
 * WHETHER THE CARD'S OWN FIELD LETS A FILE BE NAMED AT THE REPOSITORY ROOT.
 *
 * The field is `rootFiles`, the only value that permits one is the words "by name", and the code
 * names neither a role nor a constant: the card read at boot is what answers. A card with no field
 * permits none, which is how every card but the worker keeps today's behaviour.
 */
function theCardPermitsARootFile(rule: WorkAreaRule): boolean {
  return rule.rootFiles === 'by name'
}

/**
 * WHETHER THIS PATH NAMES A FILE THE CARD'S RULE REFUSES.
 *
 * A file at the repository root is one whose whole entry has no `/` in it — `bridge.py`, never
 * `src/server/lib/roles.ts`. `.` and `..` never reach here, because `validateWorkArea` refuses them
 * before the card is asked at all.
 */
function aFileThisRuleRefuses(path: string, rule: WorkAreaRule): boolean {
  if (!looksLikeAFile(path)) return false
  return !(theCardPermitsARootFile(rule) && !path.includes('/'))
}

/**
 * WHY A NORMALISED AREA BREAKS THE CARD'S OWN RULE, or null when it keeps it. Criterion P92.
 *
 * THE CARD'S `says` IS THE REFUSAL, word for word and never rewritten here. `paths` are already
 * normalised by `validateWorkArea`, so this is only the grain and the cap.
 *
 * A FILE AT THE REPOSITORY ROOT IS THE ONE FILE A FOLDERS CARD MAY NAME, and only where the card's
 * own `rootFiles` field permits it. A file with a path in it stays refused, so the rule is not "a
 * worker may register files" but "a worker may name the files that have nowhere else to go".
 */
export function whyTheAreaBreaksTheCardsRule(paths: readonly string[], card: RoleCard | null): string | null {
  if (card === null) {
    return 'No card answers to that role, so the door has no work-area rule to apply. Nothing was written.'
  }
  const rule = card.workArea
  if (rule === undefined) return whyACardHasNoWorkAreaRule(card.name)
  if (rule.grain === 'folders' && paths.some((path) => aFileThisRuleRefuses(path, rule))) return rule.says
  if ((rule.grain === 'a directory' || rule.grain === 'the check worktree') && paths.some(looksLikeAFile)) {
    return rule.says
  }
  if ((rule.grain === 'a directory' || rule.grain === 'the check worktree') && paths.length > 1) return rule.says
  if (rule.grain === 'nothing' && paths.length > 0) return rule.says
  if (rule.most !== 'no limit' && paths.length > rule.most) return rule.says
  return null
}

/**
 * WHETHER A CARD OF THIS ROLE REQUIRES A REGISTERED WORK AREA. Problem XivYfQN8RLQz.
 *
 * THE ONE PLACE THIS FACT IS WORKED OUT. Two doors used to read it apart: the claims door refused
 * every registered agent that had no area, and the work-area door refused a secretary the very area
 * the claims door demanded, so no value of the area let a secretary claim. The card itself says
 * which it is — a card whose work-area grain is `nothing` registers nothing and is limited by
 * nothing, so its holder needs no area to claim, and every other card does need one.
 *
 * A ROLE WORD NO CARD DECLARES, AND A CARD WITH NO WORK-AREA BLOCK, BOTH COUNT AS NEEDING ONE.
 * Neither is the declared grain `nothing`, so neither is a licence to claim unregistered. The
 * work-area door refuses to register an area for such a card at all, and the claims door refuses
 * its holder with the same sentence a worker meets. `cardFor` reads a null role as
 * `A_ROW_WITH_NO_ROLE_READS_AS`, so a row nobody gave a card still needs one, exactly as a worker.
 */
export function aRoleNeedsARegisteredWorkArea(decl: RolesDeclaration, role: string | null): boolean {
  const card = cardFor(decl, role)
  return card?.workArea?.grain !== 'nothing'
}

/**
 * WHEN THE WORK-AREA RULE BEGINS — P92 to P95.
 *
 * The secretary's ruling of 12 September 2026, read into the design: the door refuses registrations
 * and widenings made AFTER the rule was merged, and every area already stored is left exactly as it
 * is and never refused after the fact. So this is the day the gate was built and merged, and an
 * area whose last write is earlier than it predates the rule. The comparison is lexicographic on
 * the local wall-clock stamp, the way P88's own date is compared.
 */
export const P92_REFUSES_FROM = '2026-09-13'

/** The day the secretary's ruling is dated, named in the sentence a citizen's page draws. */
export const THE_WORK_AREA_RULE_DATE = '12 September 2026'

/**
 * WHETHER AN AREA WAS REGISTERED BEFORE THE RULE. The later of the two moments wins: a widening
 * after the rule re-validates the whole area and moves it out of the old grain, so the mark's
 * moment is what decides when there is one, and the registration moment decides otherwise.
 */
export function aWorkAreaBeforeTheRule(registeredAt: string, changedAt: string | null): boolean {
  const last = changedAt ?? registeredAt
  return last < P92_REFUSES_FROM
}

/**
 * THE SENTENCE A CITIZEN'S PAGE DRAWS UNDER AN AREA THAT PREDATES THE RULE.
 *
 * It names the ruling date and says the two things the ruling decided: the stored area keeps
 * working, and the next change to it will be judged by the rule. A page that said only "old" would
 * leave the reader unsure whether the area still stands; one that said only "keeps working" would
 * hide that the rule reaches it on the next touch.
 */
export function aWorkAreaBeforeTheRuleSays(registeredAt: string): string {
  return (
    `This work area was registered before the rule that a work area is by role, on ${registeredAt}. The ` +
    `secretary's ruling of ${THE_WORK_AREA_RULE_DATE} leaves it exactly as it is, and the rule judges the ` +
    'whole area again the next time somebody changes it.'
  )
}

/**
 * ONE ROLE CARD: a name, its duties, its powers, and the four lines that place it in the Office.
 *
 * `rung` is a step of the tree, or null for a card off it. A card ON the tree sends `powers: null`
 * and takes its powers from its rung — writing them again on the card would be the same fact in two
 * places, and the two would drift the first time a step changed. A card OFF the tree names its own.
 */
export interface RoleCard {
  name: string
  rung: number | null
  /**
   * What the role is responsible for, and what it does in which situation. There is no limit on its
   * length: the owner took the word limit off.
   */
  duties: string
  /**
   * THE PERSON'S OWN WORDS FOR THE ONE FLOW THAT BELONGS TO THIS ROLE: a duty's one course, not the whole of
   * the role (design/flows/ACCEPTANCE.md). Optional, and absence is a real answer — a role whose
   * work does not run through the office's own agent-flow mechanisms carries none. It has no limit
   * on its length, and neither has `duties`. `roles.json`'s own `whatFlowIs`
   * carries the fuller account.
   */
  flow?: string
  /** The powers of a card off the tree, or null on a card that takes them from its rung. */
  powers: string[] | null
  /**
   * THIS CARD MAY DO WHAT ITS POWERS HOLD AND NOTHING ELSE. The mail
   * tool holds a key of its own, which may do one thing, read the summonses, and is refused everything
   * else. Every
   * other card is refused only the acts under powers it lacks, and may do every act no power names; a card with this
   * part is refused those too (src/server/lib/rolegate.ts). Only a card off the tree carries it, since a card on the
   * tree takes its powers from its rung, and it is a tool's card, never the one that checks (`theCardOffTheTree`).
   * NO CARD CARRIES IT SINCE 1 OCTOBER 2026: the mailer card left the file. The rule is
   * still read, so a tool's card written later is held to it.
   */
  refusedEverythingElse?: true
  appointedBy: AppointedBy
  appoints: Appoints
  mustRead: MustRead
  reportsTo: string
  whatEndsIt: string
  /**
   * WHAT THIS ROLE MAY REGISTER AS ITS WORK AREA. Criterion P92. Optional on the type because the
   * person cards share the shape and because a declaration without one is a real file to read — and
   * the DOOR refuses a registration whose card has no block, so absence is never waved through.
   */
  workArea?: WorkAreaRule
  /**
   * HOW THE ROLE WORKS IN THIS OFFICE TODAY, in every language the pages
   * speak. It is the first part of the card's handbook (`theHandbookOf`). Optional: a card
   * with none has no handbook, and the card message says so instead of sending one.
   */
  howItWorks?: TextInEveryLanguage
  /**
   * THE PRACTICAL PART OF THE HANDBOOK: how to do this job day to day, in every
   * language. It follows `howItWorks` in the handbook. Optional, and only the secretary's card
   * carries one so far.
   */
  inPractice?: TextInEveryLanguage
}

/**
 * THE LANGUAGES A HANDBOOK IS WRITTEN IN: English and Chinese today.
 *
 * The list is written here and not imported, because `src/shared/i18n.ts` imports the word lists and
 * the word lists import this file. The check below makes the compiler refuse a handbook language that
 * is not a page language. The page languages grew by five in the first language round; the handbooks
 * did not, because a handbook is the secretary's own writing and each new one waits for its round.
 */
export const HANDBOOK_LANGUAGES = ['en', 'zh'] as const satisfies readonly Language[]
export type HandbookLanguage = (typeof HANDBOOK_LANGUAGES)[number]
type EveryHandbookLanguageIsAPageLanguage = Exclude<HandbookLanguage, Language> extends never ? true : never
const EVERY_HANDBOOK_LANGUAGE_IS_A_PAGE_LANGUAGE: EveryHandbookLanguageIsAPageLanguage = true
void EVERY_HANDBOOK_LANGUAGE_IS_A_PAGE_LANGUAGE

/** One text, written once in each language. A card that carries a text carries every language of it. */
export type TextInEveryLanguage = Readonly<Record<HandbookLanguage, string>>

/** Whether a value is one text in each language and nothing else. */
export function isOneTextInEachLanguage(value: unknown): value is TextInEveryLanguage {
  if (typeof value !== 'object' || value === null) return false
  const held = value as Record<string, unknown>
  return Object.keys(held).length === HANDBOOK_LANGUAGES.length && HANDBOOK_LANGUAGES.every((language) => isPlainSentence(held[language]))
}

/** The parts a handbook is made of, in the order it is sent. */
export const THE_PARTS_OF_A_HANDBOOK = ['howItWorks', 'inPractice'] as const

/**
 * THE CARD'S HANDBOOK IN ONE LANGUAGE, or null because the card carries none.
 *
 * When an agent is given a card, the office sends it that card's working
 * handbook. The handbook is the card's How it works, then its practical part
 * where it has one, each
 * in the one language asked for. This is the one place the parts are joined, so the message and any
 * page that draws a handbook say the same thing.
 */
export function theHandbookOf(card: RoleCard, language: HandbookLanguage): string | null {
  const parts = THE_PARTS_OF_A_HANDBOOK.map((part) => card[part]?.[language]).filter(
    (text): text is string => text !== undefined,
  )
  return parts.length === 0 ? null : parts.join('\n\n')
}

/**
 * A CARD'S HOW IT WORKS IN ONE LANGUAGE, or null because the card carries none.
 *
 * A card's How it works is its `howItWorks` text, in the page's language.
 * Every page that draws a card's How it works asks this, so the three of them (the list at #/roles,
 * a card's own record page, and an agent's profile) read the one field the handbook is made from.
 * It takes an unknown value because a card's record copy is stored as one unknown object; a copy
 * that holds no such text, or holds it in a shape this build does not read, is null.
 */
export function theHowItWorksOf(card: unknown, language: Language): string | null {
  if (typeof card !== 'object' || card === null) return null
  const text: unknown = (card as { howItWorks?: unknown }).howItWorks
  if (typeof text !== 'object' || text === null) return null
  const said: unknown = (text as Record<string, unknown>)[language]
  return typeof said === 'string' && said.trim() !== '' ? said : null
}

/**
 * THE WORDS OF A ROLE CARD, AS THE FIELDS OF THE OFFICE'S RECORD THAT HOLDS THEM.
 *
 * A card is two things. Its powers, and what decides them (the rung, what it appoints, who appoints
 * it, what it must read, the grain and size of its work area), are the declaration in
 * src/config/roles.json, read once when the server starts. Its words are the office's: one `role_card_words` record per
 * card, which the person may change on the record's page like any other record. The office files
 * that record from the declaration at its first start (src/server/lib/card-words.ts).
 *
 * THESE ARE THE ONLY PARTS A RECORD CAN CHANGE. `theCardInTheseWords` copies these fields onto the
 * card and nothing else, and every field here is a piece of text. So no write to the record can
 * give a card a power, a rung or a reader it did not have.
 *
 * Two texts are read as more than words. `whereTheFirstTaskIs` in src/server/lib/cardmessage.ts reads
 * the `flow` of the card the holder has: the declared `flow` on a card the office ships, and the words
 * record's `flow` on a card a person added. `whoTheCardReportsTo` below reads the `reportsTo` of the
 * card the holder has: the declared word on a card the office ships, and the words record's word on a
 * card a person added. Each of those turns words into something the office does. So on a shipped card
 * the record's words are what a reader is shown, and on an added card they also decide which first
 * task the card message names and who is added above its holder when two work areas overlap.
 */
export const THE_WORDS_OF_A_CARD = [
  'duties',
  'reportsTo',
  'whatEndsIt',
  'standing',
  'flow',
  'workAreaSays',
  'howItWorks',
  'howItWorksZh',
  'inPractice',
  'inPracticeZh',
] as const

/** One field of a card's words record. */
export type ACardWord = (typeof THE_WORDS_OF_A_CARD)[number]

/** Which field holds each handbook part in each language. A new language fails to compile here. */
const THE_HANDBOOK_FIELDS = {
  howItWorks: { en: 'howItWorks', zh: 'howItWorksZh' },
  inPractice: { en: 'inPractice', zh: 'inPracticeZh' },
} as const satisfies Record<(typeof THE_PARTS_OF_A_HANDBOOK)[number], Record<HandbookLanguage, ACardWord>>

/** A card's words, as the fields its record is filed with. Only the parts the card carries are here. */
export function theWordsOf(card: RoleCard): Partial<Record<ACardWord, string>> {
  const words: Partial<Record<ACardWord, string>> = {
    duties: card.duties,
    reportsTo: card.reportsTo,
    whatEndsIt: card.whatEndsIt,
  }
  const standing: unknown = (card as Partial<PersonCard>).standing
  if (typeof standing === 'string') words.standing = standing
  if (card.flow !== undefined) words.flow = card.flow
  if (card.workArea !== undefined) words.workAreaSays = card.workArea.says
  for (const part of THE_PARTS_OF_A_HANDBOOK) {
    const text = card[part]
    if (text === undefined) continue
    for (const language of HANDBOOK_LANGUAGES) words[THE_HANDBOOK_FIELDS[part][language]] = text[language]
  }
  return words
}

/**
 * THE CARD IN THE WORDS A RECORD HOLDS, with every other part exactly as declared.
 *
 * A field the record does not hold, or holds empty, leaves the declared text in place, and
 * `theWordsTheRecordDoesNotHold` names those parts so a reply can say where each one came from.
 * A handbook part is taken only when the record holds it in every language, because a card carries a
 * handbook text in every language or not at all. A card without a work area, or without a standing,
 * takes no `workAreaSays` or `standing`: those words belong to a part the card does not have.
 */
export function theCardInTheseWords<T extends RoleCard>(card: T, held: Readonly<Record<string, unknown>> | null): T {
  if (held === null) return card
  const said = (field: ACardWord): string | undefined => (theRecordGives(held, field) ? (held[field] as string) : undefined)
  const out: T = { ...card }
  out.duties = said('duties') ?? card.duties
  out.reportsTo = said('reportsTo') ?? card.reportsTo
  out.whatEndsIt = said('whatEndsIt') ?? card.whatEndsIt
  const flow = said('flow')
  if (flow !== undefined) out.flow = flow
  const standing = said('standing')
  if (standing !== undefined && typeof (card as Partial<PersonCard>).standing === 'string') {
    ;(out as T & { standing: string }).standing = standing
  }
  const says = said('workAreaSays')
  if (says !== undefined && card.workArea !== undefined) out.workArea = { ...card.workArea, says }
  for (const part of THE_PARTS_OF_A_HANDBOOK) {
    const fields = THE_HANDBOOK_FIELDS[part]
    if (!theRecordGives(held, fields.en)) continue
    out[part] = Object.fromEntries(HANDBOOK_LANGUAGES.map((language) => [language, held[fields[language]]])) as TextInEveryLanguage
  }
  return out
}

/**
 * WHETHER THE RECORD GIVES THIS WORD: a text that is not empty, and for a handbook part, a text in
 * every language of it. The one rule `theCardInTheseWords` and `theWordsTheRecordDoesNotHold` share.
 */
function theRecordGives(held: Readonly<Record<string, unknown>>, field: ACardWord): boolean {
  const isText = (one: ACardWord): boolean => typeof held[one] === 'string' && (held[one] as string).trim() !== ''
  const part = THE_PARTS_OF_A_HANDBOOK.find((one) => Object.values(THE_HANDBOOK_FIELDS[one]).includes(field as never))
  if (part === undefined) return isText(field)
  return HANDBOOK_LANGUAGES.every((language) => isText(THE_HANDBOOK_FIELDS[part][language]))
}

/**
 * THE PART OF A CARD EACH WORD IS: a part of its own, or the work area's `says`. A new word fails to
 * compile here until it is placed, so `theCardWithoutItsWords` cannot keep a word by mistake.
 */
const THE_PART_EACH_WORD_IS = {
  duties: 'duties',
  reportsTo: 'reportsTo',
  whatEndsIt: 'whatEndsIt',
  standing: 'standing',
  flow: 'flow',
  workAreaSays: 'workArea.says',
  howItWorks: 'howItWorks',
  howItWorksZh: 'howItWorks',
  inPractice: 'inPractice',
  inPracticeZh: 'inPractice',
} as const satisfies Record<ACardWord, string>

/**
 * A CARD WITHOUT ITS WORDS: its powers and what decides them, and nothing a words record holds. This is
 * what the stored row of a card added on the Roles page keeps (src/server/lib/added-roles.ts), and
 * `theCardInTheseWords` puts the words back from the card's record.
 */
export function theCardWithoutItsWords(card: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...card }
  for (const part of new Set(Object.values(THE_PART_EACH_WORD_IS))) {
    if (part !== 'workArea.says') delete out[part]
    else if (typeof out['workArea'] === 'object' && out['workArea'] !== null && !Array.isArray(out['workArea'])) {
      const { says: _says, ...area } = out['workArea'] as Record<string, unknown>
      out['workArea'] = area
    }
  }
  return out
}

/** The word parts a card carries that the record does not give, so they are still the declaration's. */
export function theWordsTheRecordDoesNotHold(card: RoleCard, held: Readonly<Record<string, unknown>> | null): ACardWord[] {
  const carried = Object.keys(theWordsOf(card)) as ACardWord[]
  return held === null ? carried : carried.filter((field) => !theRecordGives(held, field))
}

/**
 * ONE PERSON'S ROLE CARD. The same parts as an agent's, plus the line saying where they stand here.
 *
 * Criterion P45: a person has a role card too, naming their occupation and that they administer the Office.
 * Anybody else reads, by default, as their name and then the administrator of the Office.
 *
 * WHY IT IS A SECOND LIST AND NOT A SIXTH CARD. `isARole` and `whyThisRoleMayNotBeGiven` read
 * `cards`, and those are what the agent registration route asks before giving a role. A person's
 * role in that list would be a role an agent could be registered as, which is not what a person's
 * card is. So they are two lists, and nothing reads across.
 *
 * `rung` IS ALWAYS NULL. The tree is the agent roles; a person is not above or below any of them,
 * and a rung here would put a person on a tree that decides what an agent may do. So a person's card
 * names its own powers, the way the inspector's does.
 *
 * WHAT IS ON THE CARD AND WHAT IS ON THE PERSON. The standing is the card's — every administrator is
 * an administrator of the Office. The occupation is the person's own and is not written here: their
 * words make one person an engineer and say nothing about anybody else, so it is a fact about a
 * person and it lives on that person's row.
 */
export interface PersonCard extends RoleCard {
  /** Where a person holding this card stands in the Office, in the card's own words. */
  standing: string
}

/** One of the three ways elevation ends. Criterion P59: any of the three may end it. */
export interface HowElevationEnds {
  /** The stable word for this kind of end. */
  kind: string
  /** What the press says, in the words a person chooses from. */
  inWords: string
}

/** One act elevation deliberately does not carry. Criterion P60. */
export interface NotCarriedByElevation {
  name: string
  why: string
}

/**
 * THE ELEVATION RULE, as the declaration states it. Criterion P59.
 *
 * It says which card can hold it, who may grant it, which power it hands over, the three ways it
 * ends, and the acts it does not carry. Everything that enforces elevation reads this; nothing
 * repeats it.
 */
export interface ElevationRule {
  /**
   * What acting for the person is, in each language: the roles page draws it in the page's language,
   * and a refusal, which the server says in English, reads its English.
   */
  whatItIs: TextInEveryLanguage
  onlyThisCardCanHoldIt: string
  onlyThisMayGrantIt: string
  /** The name of the power elevation hands over, which is a power in `powers`. */
  givesThePower: string
  howItEnds: HowElevationEnds[]
  onlyThePersonEndsItEarly: string
  doesNotCarry: NotCarriedByElevation[]
  /**
   * THE DOORS THE GRANT NEVER PRESSES FOR THE PERSON, by the operation each door's route declares in
   * src/shared/ops-list.ts. `mayPressForThePerson` in src/server/lib/records/own-words.ts refuses them to a secretary
   * that holds the grant, and the role gate does not hand the grant's power over for them. A door is named by its
   * operation, by the write its check is gated as, or by a name beside the doors
   * (src/shared/what-the-grant-carries.ts), and roles.ts on the server checks each name is one of those at start. THIS
   * IS THE DEFAULT: each office's person may change the answer about any door, and the office's answer stands over the
   * card's.
   */
  neverPresses: string[]
  /**
   * THE DOORS A SECRETARY ASKS THE PERSON ABOUT BEFORE PRESSING THEM UNDER THE GRANT, named the same way. Nothing
   * records the person's answer about one press yet, so `mayPressForThePerson` refuses them. A door that takes the
   * person's words for one change lets a secretary bringing those words through before it asks the check, so the
   * person's answer reaches it that way. The default too.
   */
  askFirst: string[]
  /**
   * THE DOORS THE GRANT NEVER PRESSES ON SOMETHING THE SAME SECRETARY FILED, by operation: agreeing to its own request
   * would be the secretary approving itself. Asked whatever the office's list says about the door, and only by a door
   * that tells the check who filed what it answers.
   */
  neverOnItsOwnFiling: string[]
}

export interface RolesDeclaration {
  whatThisFileIs: string
  howToAddARole: string
  /** What the tree means, in words. The tree itself is `tree`. */
  theTree: string
  aRowWithNoRole: string
  anUnregisteredCaller: string
  readingLevels: { level: ReadingLevel; meaning: string }[]
  chapters: Chapter[]
  /** Every named power, with the acts under each. The only place an act key is written. */
  powers: NamedPower[]
  /** The steps of the tree, lowest first. Criterion P57. */
  tree: TreeStep[]
  cards: RoleCard[]
  howToAddAPersonRole: string
  /** The cards a PERSON holds. Criterion P45. Never given to an agent; see `PersonCard`. */
  personCards: PersonCard[]
  elevation: ElevationRule
}

/**
 * WHAT ONE CARD'S COPY IN ONE PROJECT LOOKS LIKE FROM OUTSIDE.
 *
 * `state` is the whole point of it: a copy filed as a record can fall behind the declaration it was
 * copied from, and `differsIn` names the fields that no longer match. The declaration is what is
 * enforced either way, so a stale copy is a stale reading and not a stale rule.
 */
export interface RoleCardCopy {
  role: string
  /** Whether the card is one an agent holds or one a person holds. Criterion P45. */
  heldBy: 'agent' | 'person'
  /** The record holding the copy, or null because nobody has copied this card into this project. */
  record: string | null
  state: 'current' | 'out of date' | 'not copied yet'
  differsIn: string[]
  copiedAt: string | null
}

/**
 * A CARD SOMEBODY WROTE IN MOLE OFFICE, rather than one copied from the declaration. Criterion P51.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING ENFORCES ONE, AND THE READING SAYS SO RATHER THAN LEAVING IT TO BE ASSUMED
 * ---------------------------------------------------------------------------------------
 *
 * A card written here now names a rung, so its POWERS are readable: `powersFor` computes them off
 * the tree the same way it computes a declared card's. That is not the same as being enforced.
 * `readTheRoleCards` opens `design/permissions/roles.json` once, when the server starts, and every
 * refusal in the product is built from what it read. `isARole`, `actsRefusedTo` and
 * `whyThisRoleMayNotBeGiven` all read that declaration, and none of them has ever seen a record. An
 * agent cannot even be registered under a name written here, because the registration asks the same
 * declaration. So `nothingEnforcesIt` carries that sentence to every screen that draws one.
 */
export interface RoleCardMadeHere {
  /** The record holding it. */
  record: string
  /** The word on the card, which is what an agent would be registered as if anything read it. */
  role: string
  /** The card itself, in the same shape as a declared one. */
  card: RoleCard
  /** The address of the picture on it, or null because nobody has chosen one. */
  portrait: string | null
  /** When it was written, in local wall clock. */
  madeAt: string | null
}

/**
 * ONE GRANT OF ELEVATION, as it is stored on the secretary's agent record and on its registry row.
 *
 * Criterion P59. It is stored whole and read whole; no reader asks for a part of it, so it is one
 * object rather than six fields.
 *
 * `endedAt` IS SET RATHER THAN THE GRANT BEING REMOVED. When it ended, and which of the three ends
 * did it, is a fact about the writes made while it held, and the ledger rows those writes carry
 * name this grant by its id.
 */
export interface Elevation {
  /** This grant's id. Every write made under it names it, on the change row and on the revision. */
  id: string
  /** Which of the three ends it has: one of the `kind` words in the declaration's `howItEnds`. */
  endsWhen: string
  /**
   * WHAT IT ENDS AT, and what that means depends on `endsWhen`:
   *   · `at a time` — the local wall-clock stamp it ends at;
   *   · `when a piece of work ends` — the id of the record the person picked;
   *   · `when you say` — null, because nothing is named and only the person's press ends it.
   */
  until: string | null
  /** When the person granted it, in local wall clock. */
  grantedAt: string
  /** Who granted it. The person, always: nothing else can write one. */
  grantedBy: string
  /** When it ended, or null while it still holds. */
  endedAt: string | null
  /** What ended it, in a sentence, or null while it still holds. */
  endedBecause: string | null
  /** Why the person raised it, in their own words, or null on a grant made before the press asked. */
  reason: string | null
  /** The session record of the run the secretary was in when the person pressed, or null on a grant made before. */
  run: string | null
}

/** One secretary acting for the person right now, as a screen reads it. Criterion P59. */
export interface ElevationHeld extends Elevation {
  /** The agent handle acting for the person. */
  agent: string
  /**
   * THE END, IN THE WORDS THAT FOLLOW "until" ON THE CARD.
   *
   * A stamp for a time, the work's own title for a piece of work, and "you say so" for the person's word. It
   * carries no connective of its own: the card writes `Acting for <name> until <this>`, and a value
   * that started with "until" made the card read *until until a time you name*, which is what the
   * first version of this field did and what a picture of it showed.
   */
  untilInWords: string
  /** The person this agent is acting for, by the name the Office holds for them. */
  actingFor: string
}

/**
 * ONE ACT MADE WHILE AN ELEVATION HELD. Criterion P19.
 *
 * A write under a period is a ledger row: `changes.elevation` and `revisions.elevation` both name
 * the grant, and `src/server/lib/elevation.ts` reads them back by its id. This is that row as a
 * screen draws it. `seq` is the revision's own number, which is what names an act the person can
 * still undo on its own; it is null for a link act, which writes no revision.
 */
export interface ActUnderThePeriod {
  /** The record the act was made on, or null for a press under the grant that wrote no change row (`door` names it). */
  recordId: string | null
  /** The record's title at the time, so a record deleted since is still named. */
  title: string
  /** The record's kind at the time. */
  kind: string
  /**
   * create, update, delete, restore, link or unlink — what kind of write it was; `press` for a press under the grant that
   * wrote no change row.
   */
  op: string
  /** What the write did, from `WHAT_THE_PERIOD_DID`. */
  what: string
  /** The revision to undo this act on its own, or null for a link act. */
  seq: number | null
  /**
   * THE LATER REVISION THAT TOOK THIS ACT BACK, or null while it stands and for an act with no revision. Read by
   * `revocationOf` in src/server/lib/warrants.ts, the one rule the list of acts on the person's words reads too, so a page can
   * say the act was taken back rather than offer a press the door would refuse (wave 13q round 19).
   */
  revoked: { at: string; actorType: string; actorId: string } | null
  /**
   * THE WORD-LIST KEY THAT SAYS WHAT THE ACT DID, from `whatThePeriodDidKey`, or null for an `op` the lists do not
   * name, where a page draws `what` as the server wrote it. The page reads this and never the `op`, so the operation is
   * read in one place (wave 13q round 19; tests/changes.test.ts holds that no second page reads a change row's `op`).
   */
  whatKey: WhatThePeriodDidKey | null
  /** The agent that made it, by handle. */
  actorId: string
  /** When it was made, local wall clock. */
  at: string
  /**
   * THE DOOR PRESSED, for a press under the grant that wrote no change row, so no record names it (wave 13s round 2a).
   * Null for every act on a record, which the record's title names.
   */
  door: TheDoorOfAPress | null
  /** THE REASON THE PRESS GAVE, or why there is none to show (wave 13s round 2a). */
  reason: TheReasonOfAnAct
}

/**
 * A DOOR AS THE PAGE NAMES IT. `words` are the list's words in both languages (src/shared/what-the-grant-carries-words.ts)
 * where it has them; otherwise what the door's routes say they do, in English only (`zh` null), where every route that
 * declares the operation says the same; otherwise null, and the page says Mole Office has no words for this door.
 */
export interface TheDoorOfAPress {
  words: { en: string; zh: string | null } | null
  /** The operation the door's routes declare, which the page puts in a title and never in its text. */
  operation: string
}

/**
 * THE REASON OF ONE ACT UNDER A PERIOD. `written` is the reason its press row holds. Where there is none: `none written`
 * when no press row is found for the act, or the row holds no reason (a read needs none); `cannot tell` when the act is a
 * revision and two presses match it (`actsUnderThePeriod` in src/server/lib/elevation.ts says how a revision is matched).
 */
export type TheReasonOfAnAct = { written: string } | { written: null; because: 'none written' | 'cannot tell' }

/**
 * WHAT EACH KIND OF LEDGER ROW DID, in the fewest words that are still true.
 *
 * ONE HOME, so the reader in `src/server/lib/elevation.ts` and the screen that draws the list
 * cannot say the same row did two different things. The keys are the `op` values `logChange` and
 * `saveRevision` write.
 */
/** The operations the word lists say in a page's language, each `r19card.period.did.<op>` (src/shared/words). */
export const SAID_PERIOD_OPS = ['create', 'update', 'delete', 'restore', 'link', 'unlink'] as const
type SaidPeriodOp = (typeof SAID_PERIOD_OPS)[number]

/**
 * THE ENGLISH, ONE ENTRY FOR EACH OPERATION THE PAGE CAN SAY, held to that list by the compiler: an operation without
 * its words does not compile, so neither the server's reply nor the word lists' English can fall back to the bare
 * operation name (the scoped re-check 1HDiEz_wWdFx noted that fall-back in wave 13q round 19).
 */
const WHAT_EACH_OPERATION_DID = {
  create: 'filed it',
  update: 'changed it',
  delete: 'deleted it',
  restore: 'restored it',
  link: 'linked it',
  unlink: 'unlinked it',
} as const satisfies Readonly<Record<SaidPeriodOp, string>>

export const WHAT_THE_PERIOD_DID: Readonly<Record<string, string>> = WHAT_EACH_OPERATION_DID

/** What one operation the page can say did, in English. The word lists' English reads this. */
export function whatThePeriodDidInEnglish(op: SaidPeriodOp): string {
  return WHAT_EACH_OPERATION_DID[op]
}

/** The word-list key for what an act under a period did. */
export type WhatThePeriodDidKey = `r19card.period.did.${SaidPeriodOp}`

/** The key that says what one act did, by its `op`, or null for an `op` the lists do not name. */
export function whatThePeriodDidKey(op: string): WhatThePeriodDidKey | null {
  return (SAID_PERIOD_OPS as readonly string[]).includes(op) ? (`r19card.period.did.${op}` as WhatThePeriodDidKey) : null
}

/** What `GET /api/roles` answers: the declaration, and where each card is copied in this project. */
export interface WhatTheRolesSay {
  declaredIn: string
  cards: (RoleCard & { source?: 'built-in' | 'added' })[]
  removedAddedRoles?: string[]
  leftOut?: { name: string; card: unknown; version: string; problems: string[] }[]
  /** The cards a person holds. Criterion P45. Never given to an agent. */
  personCards: PersonCard[]
  /**
   * WHERE EACH CARD'S WORDS CAME FROM. The cards above are in the words of the office's words record
   * of each card, `record`, where it holds them; `fromTheDeclaration` names the parts still read from
   * `declaredIn`. A card with no record has `record: null` and every part from the declaration.
   */
  words: { role: string; record: string | null; fromTheDeclaration: ACardWord[] }[]
  /** Every named power with its acts, so a screen can draw a card's powers without a second list. */
  powers: NamedPower[]
  /** The tree, so a screen computes a card's powers with `powersFor` rather than its own rule. */
  tree: TreeStep[]
  /** The chapters a card may point at, each with its name as the chapter export gives it, never as this file did. */
  chapters: NamedChapter[]
  readingLevels: { level: ReadingLevel; meaning: string }[]
  /**
   * EVERY LIVE HANDBOOK HUNG ON EACH CARD, in any state, by the card's word. A card none hangs on is not a key. The door
   * always answers it; an answer a test builds to draw the page without a server may leave it out.
   */
  handbooks?: Readonly<Record<string, HandbookRead[]>>
  /**
   * THE ELEVATION RULE, whoever is acting for the person right now, and who could be. Criterion P59.
   *
   * `couldHoldIt` is the handles of the registered agents holding the card the rule names. The press
   * is on a card and it acts on an AGENT, so a screen drawing the press has to know which agent the
   * card is on; working it out in the browser would mean a second reading of the registry.
   */
  /**
   * The elevation rule, everybody acting for the person right now, and every agent that could.
   *
   * `holding` IS A LIST. Criterion P67: there may be more than one secretary. It was one
   * or null, on the reading that the product had one secretary; several is a state the person can make, and
   * a screen handed one of them would say that agent held the person's acts while another one also did.
   */
  elevation: { rule: ElevationRule; holding: ElevationHeld[]; couldHoldIt: string[] }
  /**
   * ONE NOTEBOOK PER AGENT HOLDING THE CARD THAT CAN ACT FOR THE PERSON, with its numbers.
   * Criterion N3: the role card shows the notebook's numbers.
   *
   * A LIST, FOR THE SAME REASON `elevation.holding` IS ONE: there may be more than one
   * secretary. A card handed one notebook while two agents held the card would be a card
   * showing one relationship and saying nothing about the other. Empty means nobody holds the card.
   *
   * The numbers inside are counted from the notebook record on this read and are stored nowhere.
   */
  notebooks: NotebookOnACard[]
  mirror: RoleCardCopy[]
  mirrorSays: string
  theCopyGrantsNothing: string
  /**
   * THE CARDS SOMEBODY WROTE IN MOLE OFFICE, criterion P51. Empty is the ordinary answer.
   *
   * They are a separate list from `cards` and `personCards` for the reason those two are separate
   * from each other: nothing reads across. A word here is not a role an agent can be registered as,
   * because the registration asks the declaration and the declaration is a file.
   */
  madeHere: RoleCardMadeHere[]
  /**
   * The sentence saying what a card made here is worth, in the door's words: it names the Role cards page,
   * because a caller of the door is not on it. The page draws its own words key, which says "above".
   */
  nothingEnforcesACardMadeHere: string
  /**
   * THE HIGHEST CARD A VISITOR MAY HOLD. Criterion P86.
   *
   * The Settings page draws this beside the other office settings. `ceiling` is the card name the
   * setting holds, or `defaultCeiling` because nobody set one; `raised` says the setting lifted it
   * above the default; `says` is the one plain sentence the panel prints. When the setting names a
   * card this declaration does not hold, `ceiling` is that unusable word, `raised` is false and
   * `says` names the problem rather than falling back to the default.
   */
  visitorCardCeiling: {
    setting: string
    ceiling: string
    defaultCeiling: string
    raised: boolean
    says: string
  }
}

/**
 * THE ADDRESS OF THE STATISTICS PAGE, under #/roles. Criterion P72.
 *
 * One spelling, read by the router, the page and the press that opens it. A second copy would be the
 * defect chapter 9's ninth invariant names: two ways to spell an address, drifting the first time
 * somebody changes one.
 */
export const ROLE_CENSUS_SEGMENT = 'who-holds-them'

// ============================================================================ who chose the card

/**
 * WHO CHOSE THE CARD ON A ROW: the rule, a starter, or the owner confirming a credential.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS STORED AND NOT WORKED OUT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P75: a registration that names no card gets the worker card by default.
 * A registration that named no card used to write NOTHING on the row,
 * and every reader worked the word `worker` out again for itself. Two facts were derived from one
 * absent value: which card the row holds, and whether anybody chose it.
 *
 * MEASURED ON 8 SEPTEMBER 2026, before this: registering with no card left `role` NULL on the
 * registry row and no `role` key on the record at all; the Embassy drew `worker` with
 * `choseRole: false`, both worked out from that null in src/server/api/office.ts.
 *
 * Now the card is written and this says who wrote it. Two facts, two stored values, so no screen has
 * to read a choice out of an absence.
 *
 * ---------------------------------------------------------------------------------------
 * ABSENT IS "NOBODY RECORDED THIS", AND IT IS A REAL ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * Every row registered before this existed carries no mark, and nothing invents one for them: the
 * card on such a row may have been a starter's choice or may be the word the row was read as, and
 * there is no way to tell now. `NOBODY_RECORDED_WHO_CHOSE_THE_CARD` is what a screen says there.
 */
export const HOW_A_CARD_WAS_CHOSEN = ['the-rule', 'a-starter', 'a-credential'] as const

export type HowACardWasChosen = (typeof HOW_A_CARD_WAS_CHOSEN)[number]

/** The stored mark itself. `who` is null exactly when the rule chose it, because nobody did. */
export interface WhoChoseTheCard {
  /**
   * `the-rule` — nobody named a card, so the rule wrote the worker card. Nobody chose it.
   * `a-starter` — whoever registered this agent named the card. `who` is them.
   * `a-credential` — the agent asked for this card in its credential and the owner confirmed it.
   *                  `who` is the confirmer, because the confirmation is what gave the card.
   */
  how: HowACardWasChosen
  /** Who chose it, or null because the rule did and no person or agent was involved. */
  who: { kind: 'person' | 'agent'; id: string } | null
}

/** What a screen says on a row written before the mark existed. Criterion P75. */
export const NOBODY_RECORDED_WHO_CHOSE_THE_CARD = 'nobody recorded who chose this card'

/**
 * THE WORDS OF THE SENTENCE BELOW, IN ENGLISH, IN ONE PLACE. The server says them as they are; a page reads them
 * through the word lists, whose English entries are these (src/shared/words/en.ts, section R19b), so the Chinese page
 * says the same sentence in Chinese (wave 13q round 19). They live here and not in the word lists because this file is
 * one the word lists import, and a sentence the server writes must not wait on them.
 */
export const WHO_CHOSE_THE_CARD_WORDS = {
  nobodyRecorded: NOBODY_RECORDED_WHO_CHOSE_THE_CARD,
  theRule: 'nobody chose this card: no card was named at registration, so the rule wrote {card}',
  somebody: 'somebody nobody recorded',
  aStarter: 'chosen by {who}, which registered this agent',
  aPersonStarter: 'chosen by {who}, who registered this agent',
  aCredential: "asked for in this agent's credential and given by {who} at the Embassy",
} as const

/** One of the sentence's words, by name. */
export type WhoChoseTheCardWord = keyof typeof WHO_CHOSE_THE_CARD_WORDS

/** How a caller says one of them: the server in English, a page through its `t`. */
export type SayWhoChoseTheCard = (word: WhoChoseTheCardWord, values?: Readonly<Record<string, string>>) => string

/** The server's way: the English above, with its values put in. */
const inEnglish: SayWhoChoseTheCard = (word, values = {}) =>
  WHO_CHOSE_THE_CARD_WORDS[word].replace(/\{(\w+)\}/g, (all, name: string) => values[name] ?? all)

/**
 * One sentence per mark, for a screen. Null is the row nobody recorded, said by the line above.
 *
 * `chooserName` IS THE HANDLE ON THE CHOOSER'S ROW, which a caller that can read the registry passes
 * (wave rule 5): the mark stores a registry id, and a new agent's id is not a name a person knows.
 * This file cannot read a row. Without a name, the stored id is drawn as it is.
 *
 * `say` IS THE LANGUAGE. The server leaves it out and writes English; a page passes the word lists' reader, so the
 * sentence is the page's language (wave 13q round 19). The `{card}` of the rule's sentence is the card's own name,
 * `A_ROW_WITH_NO_ROLE_READS_AS`, which a page's reader puts in its own words.
 */
export function whoChoseTheCardSays(
  mark: WhoChoseTheCard | null,
  chooserName: string | null = null,
  say: SayWhoChoseTheCard = inEnglish,
): string {
  if (mark === null) return say('nobodyRecorded')
  if (mark.how === 'the-rule') return say('theRule', { card: A_ROW_WITH_NO_ROLE_READS_AS })
  const who = mark.who === null ? say('somebody') : (chooserName ?? mark.who.id)
  // A PERSON IS "WHO" AND AN AGENT "WHICH" (the recorded review of wave 13q round 19).
  if (mark.how === 'a-starter') return mark.who?.kind === 'person' ? say('aPersonStarter', { who }) : say('aStarter', { who })
  return say('aCredential', { who })
}

/**
 * THE SAME FACT IN A FEW WORDS, for a row in a list. Criterion P75.
 *
 * MEASURED ON MY OWN PICTURE, 8 September 2026. The Embassy drew the sentence above on every row,
 * and forty-six rows each carrying "nobody recorded who chose this card" is a wall of one sentence
 * repeated — the reader stops seeing the card, which is the thing the line is beside. A list has
 * room for a value and the citizen's page has room for the sentence, so there are two forms of one
 * fact rather than one form drawn in a place it does not fit.
 */
export function whoChoseTheCardInAWord(mark: WhoChoseTheCard | null, chooserName: string | null = null): string {
  if (mark === null) return 'not recorded'
  if (mark.how === 'the-rule') return 'the rule'
  // `chooserName` is the handle on the chooser's row, as in `whoChoseTheCardSays` above.
  return mark.who === null ? 'not recorded' : (chooserName ?? mark.who.id)
}

/**
 * READ A STORED MARK BACK, or null because there is none and none is invented.
 *
 * It is loose input on the way in — a column of JSON, a record's own field, a body — and strict
 * here: anything that is not one of the three words with a matching `who` is nobody having
 * recorded, which is the honest reading of a value nothing can make sense of.
 */
export function theMarkSaying(said: unknown): WhoChoseTheCard | null {
  if (typeof said !== 'object' || said === null) return null
  const how = (said as { how?: unknown }).how
  if (typeof how !== 'string' || !(HOW_A_CARD_WAS_CHOSEN as readonly string[]).includes(how)) return null
  const who = (said as { who?: unknown }).who
  if (who === null || who === undefined) return { how: how as HowACardWasChosen, who: null }
  if (typeof who !== 'object') return null
  const kind = (who as { kind?: unknown }).kind
  const id = (who as { id?: unknown }).id
  if ((kind !== 'person' && kind !== 'agent') || typeof id !== 'string' || id === '') return null
  return { how: how as HowACardWasChosen, who: { kind, id } }
}

/**
 * WHO REGISTERED AN AGENT'S WORK AREA, AND WHEN — CRITERION P85.
 *
 * ---------------------------------------------------------------------------------------
 * THE SAME SHAPE AS THE CARD'S MARK, BESIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * The owner, the agent that started a worker, or a holder of the secretary card may change a work
 * area, and the door writes which of the three did it beside the actor and the moment on the agent
 * record's `extra.workAreaChange`. This is the display half: one sentence drawn under the work
 * area, worked out here so the page never restates the words. It is deliberately the same shape as
 * `WhoChoseTheCard` above, and it lives in this file for the same reason — one fact, one place.
 *
 * `extra.workAreaChange` KEEPS ONLY THE LAST CHANGE. The criterion asks for the last one and no
 * history: the record's revisions hold every change, and building a history here would be a second
 * account of a fact the revisions already keep. Nothing here reads them.
 *
 * ABSENT IS "NOBODY RECORDED THIS", AND IT IS A REAL ANSWER. Every row whose area was registered
 * before the mark existed carries none, and so does a row whose area nobody has changed since it
 * registered. `NOBODY_RECORDED_WHO_REGISTERED_THE_WORK_AREA` is what a screen says there, which is
 * the honest answer and not a gap to hide.
 */
export const HOW_A_WORK_AREA_WAS_REGISTERED = ['the-owner', 'a-starter', 'a-secretary', 'the-seal', 'a-failed-start', 'a-crashed-run'] as const

export type HowAWorkAreaWasRegistered = (typeof HOW_A_WORK_AREA_WAS_REGISTERED)[number]

/** The stored mark itself, read strictly and never invented. */
export interface WhoRegisteredTheWorkArea {
  /**
   * `the-owner` — the person changed it. `a-starter` — the agent that started this one changed it.
   * `a-secretary` — the caller held the secretary card, which acts for the person. `the-seal` — Mole Office
   * emptied it when it sealed the run the area was set for, because nobody had changed it since.
   * `a-failed-start` — Mole Office emptied it when the start it was set for failed, for the same reason.
   * `a-crashed-run` — Mole Office emptied it when the run it was set for ended crashed, for the same reason.
   */
  how: HowAWorkAreaWasRegistered
  /** Who did it, or null because the mark named nobody that could be read. */
  by: { kind: 'person' | 'agent'; id: string } | null
  /** When it happened, in the writer's wall-clock words, or null because the mark named none. */
  at: string | null
}

/** What a screen says on a work area nobody recorded a change for. Criterion P85. */
export const NOBODY_RECORDED_WHO_REGISTERED_THE_WORK_AREA = 'nobody recorded who registered this work area'

/**
 * One sentence for a citizen's page, in the words of the mark, read with `say`: the page's `t` (wave 13k round
 * 35, where it was English on a Chinese page). Null is the row nobody recorded. The English is the English word
 * list's, whose "nobody recorded" word is `NOBODY_RECORDED_WHO_REGISTERED_THE_WORK_AREA` itself.
 */
export function whoRegisteredTheWorkAreaSays(mark: WhoRegisteredTheWorkArea | null, say: Say): string {
  if (mark === null) return say('g6b.workArea.nobodyRecorded')
  const when = mark.at === null ? say('g6b.workArea.noTime') : drawnStamp(mark.at)
  if (mark.how === 'the-owner') return say('g6b.workArea.byOwner', { when })
  if (mark.how === 'the-seal') return say('g6b.workArea.bySeal', { when })
  if (mark.how === 'a-failed-start') return say('g6b.workArea.byFailedStart', { when })
  if (mark.how === 'a-crashed-run') return say('g6b.workArea.byCrashedRun', { when })
  const who = mark.by === null ? say('g6b.workArea.nobodyWho') : mark.by.id
  return mark.how === 'a-starter' ? say('g6b.workArea.byStarter', { who, when }) : say('g6b.workArea.bySecretary', { who, when })
}

/**
 * READ A STORED WORK-AREA MARK BACK, or null because there is none and none is invented.
 *
 * Loose input on the way in — the record's `extra` is a bag of JSON — and strict here: anything
 * that is not one of the six words, or that names an actor kind this build cannot read, is
 * nobody having recorded. The stored actor is `human` or `agent`; this reads it as the
 * `person`/`agent` the rest of this file uses. The time is kept as the writer's own words and is
 * only drawn by `drawnStamp`, so an unreadable moment is shown as itself rather than guessed at.
 */
export function theWorkAreaMarkSaying(said: unknown): WhoRegisteredTheWorkArea | null {
  if (typeof said !== 'object' || said === null) return null
  const how = (said as { how?: unknown }).how
  if (typeof how !== 'string' || !(HOW_A_WORK_AREA_WAS_REGISTERED as readonly string[]).includes(how)) return null
  const by = (said as { by?: unknown }).by
  let readBy: { kind: 'person' | 'agent'; id: string } | null = null
  if (by !== null && by !== undefined) {
    if (typeof by !== 'object') return null
    const type = (by as { type?: unknown }).type
    const id = (by as { id?: unknown }).id
    const kind = type === 'human' ? 'person' : type === 'agent' ? 'agent' : null
    if (kind === null || typeof id !== 'string' || id === '') return null
    readBy = { kind, id }
  }
  const at = (said as { at?: unknown }).at
  return {
    how: how as HowAWorkAreaWasRegistered,
    by: readBy,
    at: typeof at === 'string' && at !== '' ? at : null,
  }
}

/**
 * THE MARK SAYING THIS AGENT'S AREA OVERLAPS ANOTHER'S AND A GROUP WAS OPENED — CRITERION P95.
 *
 * The door writes one mark on each of the two agents' records when a registration or widening
 * overlaps the area of another agent at work. It is read strictly: a value this build cannot make
 * sense of is nobody having recorded, and the page draws nothing rather than a guessed sentence.
 * It is the last overlap only, for the same reason the P85 mark is the last change: the group the
 * office opened is the durable record of it, and a second history here would be a second account.
 */
export interface WhoTheWorkAreaOverlaps {
  /** The other agent's handle. */
  with: string
  /** The group opened to settle it. */
  group: string
  /** The path both areas cover, or null because the mark named none. */
  path: string | null
  /** When the office opened the group, in its wall-clock words, or null. */
  at: string | null
}

/** Read a stored overlap mark back, or null because there is none and none is invented. */
export function theWorkAreaOverlapSaying(said: unknown): WhoTheWorkAreaOverlaps | null {
  if (typeof said !== 'object' || said === null) return null
  const one = said as Record<string, unknown>
  if (typeof one['with'] !== 'string' || one['with'] === '') return null
  if (typeof one['group'] !== 'string' || one['group'] === '') return null
  return {
    with: one['with'],
    group: one['group'],
    path: typeof one['path'] === 'string' && one['path'] !== '' ? one['path'] : null,
    at: typeof one['at'] === 'string' && one['at'] !== '' ? one['at'] : null,
  }
}

/** The sentence a citizen's page draws under an overlapping area, or null for no mark. */
export function theWorkAreaOverlapSays(mark: WhoTheWorkAreaOverlaps | null): string | null {
  if (mark === null) return null
  const where = mark.path === null ? 'the same path' : `"${mark.path}"`
  return (
    `This work area overlaps ${mark.with}'s on ${where}, and the office opened a group to settle it. ` +
    'Nothing is refused for the overlap.'
  )
}

/**
 * WHO HOLDS EACH CARD — CRITERION P72, A LOOKUP BOTH WAYS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE COUNT IS TWO NUMBERS AND NOT ONE
 * ---------------------------------------------------------------------------------------
 *
 * A registry row with no card written on it is READ AS the worker card by every refusal in this
 * product, and there are many such rows: every agent registered before 6 September 2026. A single
 * count would either drop them, which understates who the worker card governs, or fold them in,
 * which says somebody chose that card for them. So the count is `holds` — how many the card is read
 * on, which is what the card governs — and `chose`, how many of those have the word written on the
 * row. The page draws the bar as `holds` and says how many of them nobody carded.
 */
export interface WhoHoldsTheCards {
  /** One entry per declared card, agent cards first, in the declaration's order. */
  cards: CardHolders[]
  /** Cards no declaration holds that a row names anyway. Empty is the ordinary answer. */
  cardsNoLongerDeclared: CardHolders[]
  /** What was counted and what was not, said by the server so no screen has to guess. */
  says: string
  /** Which project this was answered about. The registries are the installation's; this is not. */
  workspaceId: string
}

/** One card and the citizens it is read on. Criterion P72. */
export interface CardHolders {
  /** The card's name in the declaration, or the word on the row for a card nobody declares. */
  card: string
  /** Which list the card is on. An agent's cards and a person's are two lists that never cross. */
  forWhom: 'agent' | 'person'
  /** Where the card's picture is served, from the card's own set. */
  portrait: string
  /** How many citizens this card is read on, which is how many it governs. */
  holds: number
  /** How many of those have the word written on the row. Never more than `holds`. */
  chose: number
  /** The citizens themselves, name order, each one a way to its own page. */
  holders: CardHolder[]
}

/** One citizen holding a card, as the statistics page draws them. Criterion P72. */
export interface CardHolder {
  /** Which registry: an agent or a person. Both are needed to address the citizen's page. */
  kind: 'agent' | 'person'
  id: string
  name: string
  /** The citizen's own picture, or null because nothing was recorded and none is invented. */
  avatarUrl: string | null
  /** True where nobody wrote this card on the row and every refusal reads it as this one. */
  readNotChosen: boolean
}

/** THE WORKER, by the name its card holds. The word a row with no role reads as, below. */
export const THE_WORKER = 'worker'
/**
 * THE ROLE A MESSAGE THE OFFICE ITSELF SENDS SAYS IT HAS: the office. This follows problem UJSKqVr6GK96 and
 * item 6 of a decision. It is not a card anybody holds: the office's own sender row has no card,
 * and without this the rule that a row with no card reads as the worker card called the office's reminders a
 * worker's.
 */
export const THE_OFFICE_ROLE = 'office'

/**
 * WHAT A REGISTRY ROW WITH NO ROLE IS READ AS.
 *
 * Every agent registered before 6 September 2026 has no role, and the design's own sentence is that
 * such a row reads as a worker. This is the one place that says so.
 */
export const A_ROW_WITH_NO_ROLE_READS_AS = THE_WORKER

/**
 * THE ROLE THAT CHECKS A STARTED AGENT'S WORK, by the name its card holds.
 *
 * It is off the tree of rungs and names its own powers, because it reads more than a worker and
 * writes less than a supervisor. It is spelled here once because two rules ask for it by name: the
 * cap on how much agents may say without a person does not count what an inspector wrote, nor
 * anything said inside the group one of its refusals opened (criterion M82).
 */
export const THE_INSPECTOR = 'inspector'

/**
 * THE SECRETARY AND THE SUPERVISOR, by the names their cards hold, spelled once here.
 *
 * This is the one file the role-name sweep permits to name a role: it is the shared shape the
 * declaration is read against, and it already names the inspector and the worker. A caller that
 * needs one of these words imports it rather than retyping it — a flow's open `runs` vocabulary
 * and a refusal sentence that has no card to read are the two that do.
 */
export const THE_SECRETARY = 'secretary'
export const THE_SUPERVISOR = 'supervisor'

/** What a screen says where a row names no role. It is not the word above: nobody chose that word. */
export const NO_ROLE_SET = 'no role set'

/**
 * THE PARTS OF THE TEMPLATE, by the key each has on a card. Criterion P56.
 *
 * It was `THE_SEVEN_PARTS` and it named `may` and `mayNot`. Those two are gone from every card, and
 * `whatItIsFor` is `duties`: what a role is FOR was one sentence, and what a role is RESPONSIBLE FOR
 * is what the card carries.
 */
export const THE_PARTS_OF_A_CARD = [
  'name',
  'duties',
  'powers',
  'appointedBy',
  'appoints',
  'mustRead',
  'reportsTo',
  'whatEndsIt',
] as const

function isPlainSentence(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isReadingLevel(value: unknown): value is ReadingLevel {
  return typeof value === 'string' && (READING_LEVELS as readonly string[]).includes(value)
}

/**
 * How many named powers one card may carry. Criterion P56.
 *
 * IT IS FOUR MORE THAN THE FILE USED TO DECLARE, because the secretary's step gained three powers of
 * its own — `The dead letters`, whose act is `dead-letters.claim`, `Calling the person in`, whose
 * act is `office.summon`, and `The Casting table`, whose acts are the
 * four Casting table writes — and the mailer card one, `Reading the
 * summonses`, whose act is `office.read-summonses`, and the person
 * holds every power there is. The cap is what a
 * card may carry, not a fixed count of the file: a
 * card is refused when it names MORE powers than this, and `a-role-card-has-all-its-parts` holds it.
 * ONE LESS SINCE 1 OCTOBER 2026: `Reading the summonses` left the file with the mailer card, because the
 * mail tool is the person's own tool, not an agent or a role
 * card, so the person's card, which
 * holds every power there is, holds nine.
 */
export const MOST_POWERS_ON_A_CARD = 9

function actProblems(where: string, value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return [`${where} is not an act: an act is {"act":…,"inWords":…}.`]
  const one = value as Record<string, unknown>
  const said: string[] = []
  if (!isPlainSentence(one['act'])) said.push(`${where} has no act key.`)
  if (!isPlainSentence(one['inWords'])) said.push(`${where} does not say what the act is in a person's words.`)
  return said
}

/**
 * EVERYTHING WRONG WITH A ROLE DECLARATION, as sentences, or an empty list when it is usable.
 *
 * It checks the shape, the powers and the tree. It does NOT check that an act key is one Mole Office
 * publishes: that needs the route table and the guard registry, neither of which the browser has, so
 * `checkTheActsAreReal` below takes them as an argument and the server calls it at boot.
 */
export function problemsWithTheRoleDeclaration(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['The role declaration is not an object.']
  const decl = value as Record<string, unknown>
  const said: string[] = []

  for (const key of ['whatThisFileIs', 'howToAddARole', 'theTree', 'aRowWithNoRole', 'anUnregisteredCaller']) {
    if (!isPlainSentence(decl[key])) said.push(`The declaration has no ${key}.`)
  }

  const chapters = decl['chapters']
  const numbers = new Set<number>()
  if (!Array.isArray(chapters) || chapters.length === 0) {
    said.push('The declaration lists no chapters, so no card can name one.')
  } else {
    for (const [at, one] of chapters.entries()) {
      const row = one as Record<string, unknown>
      if (typeof row?.['number'] !== 'number') {
        said.push(`Chapter ${String(at + 1)} in the list is not {"number":…}.`)
        continue
      }
      // A CHAPTER'S NAME IS THE CHAPTER RECORD'S, NEVER THIS FILE'S: a name typed here is a second copy of one fact,
      // and a second copy drifts from the chapter records.
      if ('name' in row) {
        said.push(
          `Chapter ${String(row['number'])} in the list carries a name. A chapter is named by its number only; its name is ` +
            'read from the chapter records of the office it is in, which GET /api/office-regulations shows.',
        )
        continue
      }
      numbers.add(row['number'] as number)
    }
  }

  const levels = decl['readingLevels']
  if (!Array.isArray(levels) || levels.length !== READING_LEVELS.length) {
    said.push(`The declaration lists ${String(READING_LEVELS.length)} reading levels, one for each of ${READING_LEVELS.join(', ')}.`)
  }

  // THE POWERS, WHICH EVERYTHING ELSE IS CHECKED AGAINST. A card naming a power nothing declares is
  // a card whose refusals cannot be worked out, so the powers are read before any card is.
  const powerNames = new Set<string>()
  const actsSeen = new Map<string, string>()
  const powers = decl['powers']
  if (!Array.isArray(powers) || powers.length === 0) {
    said.push('The declaration holds no powers, so no card can name one and no refusal can be worked out.')
  } else {
    for (const [at, one] of powers.entries()) {
      const row = one as Record<string, unknown>
      const name = row?.['name']
      const where = isPlainSentence(name) ? `The power "${String(name)}"` : `Power ${String(at + 1)} in the list`
      if (!isPlainSentence(name)) {
        said.push(`${where} has no name.`)
      } else if (powerNames.has(name as string)) {
        said.push(`Two powers are called "${String(name)}". A power's name is what a card carries, so it is not repeated.`)
      } else {
        powerNames.add(name as string)
      }
      if (!isPlainSentence(row?.['whatItIs'])) said.push(`${where} does not say what it is.`)
      if (!Array.isArray(row?.['acts']) || (row['acts'] as unknown[]).length === 0) {
        said.push(`${where} holds no acts. A power with no acts refuses nothing and grants nothing.`)
        continue
      }
      for (const [n, act] of (row['acts'] as unknown[]).entries()) {
        said.push(...actProblems(`${where}: act ${String(n + 1)}`, act))
        const key = (act as Record<string, unknown> | null)?.['act']
        if (typeof key !== 'string') continue
        // ONE ACT BELONGS TO ONE POWER. Two powers holding the same act would make "who may do this"
        // two questions with two answers, and the subtraction in `actsRefusedTo` would be decided by
        // whichever power a holder happened to have.
        const already = actsSeen.get(key)
        if (already !== undefined && isPlainSentence(name)) {
          said.push(
            `The act "${key}" is under two powers, "${already}" and "${String(name)}". An act belongs to one power, ` +
              'so that who may perform it has one answer.',
          )
        } else if (isPlainSentence(name)) {
          actsSeen.set(key, name as string)
        }
      }
    }
  }

  const cards = decl['cards']
  if (!Array.isArray(cards) || cards.length === 0) {
    said.push('The declaration holds no cards.')
    return said
  }

  const names = new Set<string>()
  const byRung = new Map<number, RoleCard>()

  for (const one of cards) {
    said.push(...oneCardsProblems(one, numbers, names, byRung, powerNames))
  }

  said.push(...treeProblems(decl['tree'], byRung, powerNames))

  // THE PERSON CARDS, criterion P45. The same parts, checked the same way, in their own list — a
  // person's role is never one an agent can be registered as, and `isARole` reads only `cards`.
  const personCards = decl['personCards']
  if (!Array.isArray(personCards) || personCards.length === 0) {
    said.push('The declaration holds no person cards. A person has a role card too, and there is at least one.')
  } else {
    const personNames = new Set<string>()
    for (const one of personCards) {
      const card = one as Record<string, unknown>
      // THE RUNGS ARE NOT SHARED. A person card is off the agent tree, so it is checked against a
      // map of its own that nothing else reads, and `treeProblems` never sees it.
      said.push(...oneCardsProblems(one, numbers, personNames, new Map<number, RoleCard>(), powerNames))
      const name = card['name']
      const where = isPlainSentence(name) ? `The ${String(name)} person card` : 'A person card with no name'
      if (!isPlainSentence(card['standing'])) {
        said.push(`${where} does not say where a person holding it stands in the Office.`)
      }
      if (card['rung'] !== null) {
        said.push(`${where} has a rung. The tree is the agent roles, and a person is not on it: send null.`)
      }
      if (isPlainSentence(name) && names.has(name as string)) {
        said.push(
          `"${String(name)}" is both an agent role and a person role. One word means one thing here, and a ` +
            'registration naming it could not say which was meant.',
        )
      }
    }
  }

  said.push(...elevationProblems(decl['elevation'], names, powerNames))
  return said
}

/**
 * EVERYTHING WRONG WITH THE ELEVATION RULE. Criterion P59.
 *
 * The rule is data, so the checks are the ones any other declaration gets: the card it names is a
 * card, the power it hands over is a power, and it says at least one way of ending. A rule naming a
 * card or a power that is not there is a rule nothing could enforce.
 */
function elevationProblems(value: unknown, cardNames: ReadonlySet<string>, powerNames: ReadonlySet<string>): string[] {
  if (typeof value !== 'object' || value === null) {
    return ['The declaration has no elevation rule, which is what says how a secretary may act for the person.']
  }
  const rule = value as Record<string, unknown>
  const said: string[] = []
  if (!isOneTextInEachLanguage(rule['whatItIs'])) {
    said.push(`The elevation rule's whatItIs is not one text in each of ${HANDBOOK_LANGUAGES.join(', ')} and nothing else.`)
  }
  for (const key of ['onlyThisCardCanHoldIt', 'onlyThisMayGrantIt', 'givesThePower', 'onlyThePersonEndsItEarly']) {
    if (!isPlainSentence(rule[key])) said.push(`The elevation rule has no ${key}.`)
  }
  const card = rule['onlyThisCardCanHoldIt']
  if (isPlainSentence(card) && !cardNames.has(card as string)) {
    said.push(`Elevation names the card "${String(card)}", which no card in this declaration is called.`)
  }
  const power = rule['givesThePower']
  if (isPlainSentence(power) && !powerNames.has(power as string)) {
    said.push(`Elevation hands over the power "${String(power)}", which no power in this declaration is called.`)
  }
  const ends = rule['howItEnds']
  if (!Array.isArray(ends) || ends.length === 0) {
    said.push('The elevation rule says no way of ending. There is at least one, and the press asks which.')
  } else {
    for (const [at, one] of ends.entries()) {
      const row = one as Record<string, unknown>
      if (!isPlainSentence(row?.['kind']) || !isPlainSentence(row?.['inWords'])) {
        said.push(`Way ${String(at + 1)} of ending elevation is not {"kind":…,"inWords":…}.`)
      }
    }
  }
  const not = rule['doesNotCarry']
  if (!Array.isArray(not)) {
    said.push('The elevation rule has no doesNotCarry list. Send an empty list where it carries everything.')
  } else {
    for (const [at, one] of not.entries()) {
      const row = one as Record<string, unknown>
      if (!isPlainSentence(row?.['name']) || !isPlainSentence(row?.['why'])) {
        said.push(`Entry ${String(at + 1)} of doesNotCarry is not {"name":…,"why":…}.`)
      }
    }
  }
  // THE TWO LISTS OF DOORS, as names. Whether each name is an operation is asked on the server, which holds the list of
  // operations (`checkTheDoorsAreReal` in src/server/lib/roles.ts); here only their shape, so the page can read them too.
  const lists = { neverPresses: rule['neverPresses'], askFirst: rule['askFirst'], neverOnItsOwnFiling: rule['neverOnItsOwnFiling'] }
  for (const [key, list] of Object.entries(lists)) {
    if (!Array.isArray(list) || !list.every((door) => isPlainSentence(door))) {
      said.push(`The elevation rule's ${key} is not a list of operation names. Send an empty list where it names no door.`)
      continue
    }
    const twice = list.filter((door, at) => list.indexOf(door) !== at)
    if (twice.length > 0) said.push(`The elevation rule's ${key} names ${[...new Set(twice)].join(', ')} more than once.`)
  }
  if (Array.isArray(lists.neverPresses) && Array.isArray(lists.askFirst)) {
    const asked = new Set<unknown>(lists.askFirst)
    const both = lists.neverPresses.filter((door) => asked.has(door))
    if (both.length > 0) {
      said.push(
        `The elevation rule names ${both.join(', ')} both in neverPresses and in askFirst. A door is kept, or asked ` +
          'about first, not both.',
      )
    }
  }
  return said
}

/**
 * EVERYTHING WRONG WITH A CARD SOMEBODY WROTE IN MOLE OFFICE, as sentences, or an empty list.
 *
 * Criterion P51. It is the SAME reading a declared card gets — `oneCardsProblems`, the one function
 * both lists already share — so a card made in the product is held to the parts the template names
 * and not to a second, looser standard written beside it.
 *
 * IT IS GIVEN ITS OWN NAME SET AND ITS OWN RUNG MAP, so a card made here neither collides with a
 * declared name inside this check nor is read as a step of the agent tree. The caller checks the
 * name against the declaration separately, because "that word already means something" is a
 * different answer from "this card is not filled in".
 */
export function problemsWithACardMadeHere(card: unknown, decl: RolesDeclaration): string[] {
  const chapterNumbers = new Set(decl.chapters.map((one) => one.number))
  const powerNames = new Set(decl.powers.map((one) => one.name))
  return oneCardsProblems(card, chapterNumbers, new Set<string>(), new Map<number, RoleCard>(), powerNames)
}

/**
 * EVERYTHING WRONG WITH ONE CARD, whoever holds it. The parts, the powers, and the chapters.
 *
 * IT IS ONE FUNCTION FOR THE TWO LISTS on purpose. A person's card and an agent's have the same
 * parts — that is what the template means — so checking them twice in two places is how the two
 * would come to be checked differently.
 *
 * `seen` and `byRung` are the caller's, so each list's names are unique within itself and only the
 * agent list is read as a tree.
 */
function oneCardsProblems(
  one: unknown,
  chapterNumbers: ReadonlySet<number>,
  seen: Set<string>,
  byRung: Map<number, RoleCard>,
  powerNames: ReadonlySet<string>,
): string[] {
  const said: string[] = []
  const card = one as Record<string, unknown>
  const name = card['name']
  const where = isPlainSentence(name) ? `The ${String(name)} card` : 'A card with no name'
  for (const part of THE_PARTS_OF_A_CARD) {
    // `powers` IS THE ONE PART THAT MAY BE NULL, and null there means something: this card takes its
    // powers from its rung. So it is checked below rather than here.
    if (part === 'powers') continue
    if (card[part] === undefined || card[part] === null) {
      said.push(`${where} has no ${part}. Every card has all ${String(THE_PARTS_OF_A_CARD.length)} parts.`)
    }
  }
  if (isPlainSentence(name)) {
    if (seen.has(name as string)) said.push(`Two cards are called ${String(name)}. A role name is one word and it is not repeated.`)
    seen.add(name as string)
    if (/\s/.test(name as string)) said.push(`${where} has a name with a space in it. A role name is one word.`)
  }
  if (!isPlainSentence(card['reportsTo'])) said.push(`${where} does not say who it reports to.`)
  if (!isPlainSentence(card['whatEndsIt'])) said.push(`${where} does not say what ends it.`)

  // THE DUTIES. They must be there and be text. Their length is not checked: the word limit was
  // taken off.
  const duties = card['duties']
  if (!isPlainSentence(duties)) {
    said.push(`${where} does not say what its duties are.`)
  }

  // THE FLOW. Optional — absence is a real answer, not a missing part — and its length is not checked,
  // as the duties' length is not: it carries the person's own words for one duty's one course.
  // `roles.json`'s `whatFlowIs` is the fuller account of what the flow is for.
  const flow = card['flow']
  if (flow !== undefined && !isPlainSentence(flow)) {
    said.push(`${where} has a flow that is not a plain sentence.`)
  }

  if (!isPlainSentence(card['appointedBy']) || !(APPOINTED_BY as readonly string[]).includes(card['appointedBy'] as string)) {
    said.push(`${where} does not say who appoints it. Send one of: ${APPOINTED_BY.join(', ')}.`)
  }
  if (!isPlainSentence(card['appoints']) || !(APPOINTS as readonly string[]).includes(card['appoints'] as string)) {
    said.push(`${where} does not say whom it may appoint. Send one of: ${APPOINTS.join(', ')}.`)
  }

  const rung = card['rung']
  if (rung !== null && typeof rung !== 'number') said.push(`${where} has a rung that is neither a number nor null.`)

  // THE POWERS. A card on the tree takes them from its rung and sends null; a card off the tree
  // names its own. Doing both would be the same fact in two places, so both are refused.
  const powers = card['powers']
  if (typeof rung === 'number') {
    if (powers !== null && powers !== undefined) {
      said.push(
        `${where} is on the tree at rung ${String(rung)} and also names its own powers. A card on the tree takes ` +
          'its powers from its rung: send powers: null.',
      )
    }
  } else if (!Array.isArray(powers)) {
    said.push(`${where} is off the tree, so it names its own powers. Send a list of power names.`)
  } else {
    if (powers.length > MOST_POWERS_ON_A_CARD) {
      said.push(
        `${where} names ${String(powers.length)} powers, and a card carries at most ` +
          `${String(MOST_POWERS_ON_A_CARD)}.`,
      )
    }
    for (const held of powers) {
      if (typeof held !== 'string' || !powerNames.has(held)) {
        said.push(`${where} names the power ${JSON.stringify(held)}, which this declaration does not hold.`)
      }
    }
  }

  // REFUSED EVERYTHING ELSE: true or absent, on a card off the tree that holds a power.
  const refusedEverythingElse = card['refusedEverythingElse']
  if (refusedEverythingElse !== undefined) {
    if (refusedEverythingElse !== true) {
      said.push(`${where} has refusedEverythingElse set to something other than true. Send true, or leave it out.`)
    } else if (typeof rung === 'number') {
      said.push(
        `${where} is on the tree at rung ${String(rung)} and is also refused everything else. Only a card off the tree ` +
          'names its own powers, so only such a card may be kept to them.',
      )
    } else if (!Array.isArray(powers) || powers.length === 0) {
      said.push(`${where} is refused everything else and holds no power, so it could do nothing at all.`)
    }
  }

  // THE WORK-AREA RULE, criterion P92. IT IS OPTIONAL ON THE CARD: a declaration with none is a
  // real file to read, and the DOOR refuses a registration whose card has no block. What is checked
  // here is that a block that IS present is usable, because a rule the door cannot apply is a rule
  // nobody can enforce and the server would serve refusals built from whatever survived the parse.
  const workArea = card['workArea']
  if (workArea !== undefined && !isAWorkAreaRule(workArea)) {
    said.push(
      `${where} has a workArea block that is not {grain, most, says, rootFiles}. Grain is one of ` +
        `${WORK_AREA_GRAINS.join(', ')}; most is a whole number of paths or null; says is the sentence a refusal gives; ` +
        'rootFiles is the words "by name" where the card permits a named file under the repository root, and is left ' +
        'out otherwise.',
    )
  }

  // THE HANDBOOK'S PARTS. Each is optional. A part that is present holds one
  // text for every language and nothing else, so no language is ever sent another language's text.
  for (const part of THE_PARTS_OF_A_HANDBOOK) {
    const text = card[part]
    if (text === undefined) continue
    if (!isOneTextInEachLanguage(text)) {
      said.push(
        `${where} has a ${part} that is not one text in each of ${HANDBOOK_LANGUAGES.join(', ')} and nothing else. ` +
          'A part of the handbook is written in every language, or it is left out.',
      )
    }
  }

  const mustRead = card['mustRead'] as Record<string, unknown> | undefined
  if (mustRead === undefined || !Array.isArray(mustRead['chapters'])) {
    said.push(`${where} does not say which chapters it must read.`)
  } else {
    if (mustRead['andWhatItsStarterNames'] !== null && !isPlainSentence(mustRead['andWhatItsStarterNames'])) {
      said.push(`${where}: andWhatItsStarterNames is a sentence, or null where the card names everything itself.`)
    }
    for (const entry of mustRead['chapters'] as unknown[]) {
      const row = entry as Record<string, unknown>
      if (typeof row?.['chapter'] !== 'number' || !isReadingLevel(row?.['level'])) {
        said.push(`${where}: a must-read entry is not {"chapter":…,"level":one of ${READING_LEVELS.join(', ')}}.`)
        continue
      }
      if (!chapterNumbers.has(row['chapter'] as number)) {
        said.push(
          `${where} must read chapter ${String(row['chapter'])}, which the chapter list does not hold. ` +
            "The chapters are the ones in this file's list, the same list as the default regulations, " +
            'src/config/rules/default-regulations.json.',
        )
      }
    }
  }

  if (typeof rung === 'number') {
    if (byRung.has(rung)) said.push(`Two cards claim rung ${String(rung)}. A rung holds one role.`)
    byRung.set(rung, card as unknown as RoleCard)
  }
  return said
}

/**
 * WHAT THE TREE MEANS, CHECKED. Criterion P57.
 *
 * ONE. Every step names a card that exists and stands at that step's rung, so `powersFor` can start
 * from a card and walk down.
 *
 * TWO. The rungs are 1, 2, 3 … with nothing missing. A gap would make "the step below" ambiguous.
 *
 * THREE. Every power a step adds is a declared power, and no power is added twice anywhere on the
 * tree — a power added at two steps would be one fact in two places, and taking it off one of them
 * would leave a rung holding it for a reason nobody wrote down.
 *
 * FOUR. Every card with a rung has a step, and every step has a card. A card on no step would take
 * its powers from nowhere.
 *
 * WHAT IS NOT CHECKED, DELIBERATELY: that a step adds anything at all. A step may add no power and
 * still be a real step — what makes a role that role is its duties, and powers do not tell two roles
 * apart. (The secretary's step happens to add `The dead letters`, and that is not required either.)
 */
function treeProblems(value: unknown, byRung: ReadonlyMap<number, RoleCard>, powerNames: ReadonlySet<string>): string[] {
  const said: string[] = []
  if (!Array.isArray(value) || value.length === 0) {
    return ['The declaration holds no tree, so no card on it has any powers.']
  }
  const steps = [...(value as unknown[])].map((one) => one as Record<string, unknown>)
  const seenRungs = new Set<number>()
  const addedBy = new Map<string, string>()
  for (const [at, step] of steps.entries()) {
    const rung = step['rung']
    const role = step['role']
    const where = isPlainSentence(role) ? `The ${String(role)} step of the tree` : `Step ${String(at + 1)} of the tree`
    if (typeof rung !== 'number') {
      said.push(`${where} has no rung.`)
      continue
    }
    if (seenRungs.has(rung)) said.push(`Two steps of the tree claim rung ${String(rung)}. A rung is one step.`)
    seenRungs.add(rung)
    if (!isPlainSentence(role)) {
      said.push(`${where} does not say which card stands on it.`)
    } else {
      const card = byRung.get(rung)
      if (card === undefined) {
        said.push(`${where} is at rung ${String(rung)} and no card claims that rung.`)
      } else if (card.name !== role) {
        said.push(
          `${where} says the ${String(role)} card stands at rung ${String(rung)}, and the card at that rung is ` +
            `${card.name}. The tree and the cards have to name the same role for one rung.`,
        )
      }
    }
    // WHAT THE CARD ABOVE MAY DO TO THIS ONE. Criterion P79. Every step says it, and the bottom
    // step says an empty list because nothing on the tree stands above it.
    const above = step['whatTheCardAboveMayDoToThis']
    if (!Array.isArray(above)) {
      said.push(`${where} does not say what the card above may do to it. Send a list, empty at the bottom of the tree.`)
    } else {
      for (const [at, act] of above.entries()) {
        if (typeof act !== 'string' || act.trim() === '') {
          said.push(`${where} says nothing for act ${String(at + 1)} that the card above may do to it.`)
        }
      }
    }
    const adds = step['adds']
    if (!Array.isArray(adds)) {
      said.push(`${where} has no adds list. Send an empty list where a step adds no power.`)
      continue
    }
    for (const power of adds) {
      if (typeof power !== 'string' || !powerNames.has(power)) {
        said.push(`${where} adds the power ${JSON.stringify(power)}, which this declaration does not hold.`)
        continue
      }
      const already = addedBy.get(power)
      if (already !== undefined) {
        said.push(
          `The power "${power}" is added twice on the tree, at ${already} and at ${where.toLowerCase()}. A step ` +
            'already holds every power of the step below it, so adding one again says nothing and hides where it ' +
            'came from.',
        )
      } else {
        addedBy.set(power, where.toLowerCase())
      }
    }
  }
  const rungs = [...seenRungs].sort((a, b) => a - b)
  for (const [at, rung] of rungs.entries()) {
    if (rung !== at + 1) {
      said.push(
        `The tree's rungs are ${rungs.join(', ')}, and they are 1, 2, 3 and so on with nothing missing. A gap ` +
          'leaves "the step below" with no answer.',
      )
      break
    }
  }
  for (const [rung, card] of byRung) {
    if (!seenRungs.has(rung)) {
      said.push(`The ${card.name} card is at rung ${String(rung)} and the tree has no step there, so it holds no power.`)
    }
  }
  return said
}

/**
 * WHICH ACT KEYS ARE REAL, given what this installation publishes.
 *
 * Called at boot with the operation names and the governance guards' act keys. A power naming an act
 * nothing publishes is a permission nothing can enforce, and the server does not start.
 */
export function checkTheActsAreReal(decl: RolesDeclaration, published: ReadonlySet<string>): string[] {
  const said: string[] = []
  for (const power of decl.powers) {
    for (const one of power.acts) {
      if (!published.has(one.act)) {
        said.push(
          `The power "${power.name}" names the act "${one.act}", which Mole Office does not publish. The acts a ` +
            'power may name are the operation names in src/shared/ops.ts and the act keys on the governance guards.',
        )
      }
    }
  }
  return said
}

/** The card with this name, or null. A name nothing holds is a real answer and never a default. */
export function cardFor(decl: RolesDeclaration, role: string | null): RoleCard | null {
  const name = role ?? A_ROW_WITH_NO_ROLE_READS_AS
  return decl.cards.find((one) => one.name === name) ?? null
}

/**
 * WHO A CARD SAYS ITS HOLDER REPORTS TO, as the office can act on it. Criterion P100 (A).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS READ FROM THE CARD'S OWN SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * On the overlap-group noise: where the office adds "the one above" a member, it reads who the member reports to NOW,
 * from the card it holds, and never from the historical starter chain beyond what the card
 * says. The old reading followed `startedBy` for ever, so an agent that once started another
 * stayed above it after the other had been made a secretary — which is how eight groups in one hour put the starting
 * agent above the new secretary.
 *
 * `reportsTo` IS PROSE, WRITTEN FOR A PERSON, and this is the one place the office turns it into
 * something it can act on. The declaration's own cards say exactly four things: a worker's starter,
 * the secretary (or the person where there is no secretary), the person, and — for the inspector —
 * the starter of the agent it checked and the person. The inspector's checked agent is not on the
 * inspector's own row, so that sentence resolves to nobody the office can name rather than to a
 * guess; the fifth invariant settles that.
 *
 * A SENTENCE NOTHING HERE RECOGNISES RESOLVES TO NOBODY, and that is the honest answer: the office
 * can name no agent above the holder, so it adds none. It never falls back to the starter chain,
 * because that is the reading this criterion removes.
 */
export type WhoTheCardReportsTo = 'its starter' | 'the secretary' | 'the person' | 'nobody the office can name'

export function whoTheCardReportsTo(card: RoleCard | null): WhoTheCardReportsTo {
  if (card === null) return 'nobody the office can name'
  const said = card.reportsTo.trim().toLowerCase()
  // THE HOLDER'S OWN STARTER, AND NOT "the starter of the agent it checked": a card about somebody
  // else's starter is not this card's holder answering to its own.
  if (/\bits starter\b/.test(said)) return 'its starter'
  if (/\bthe secretary\b/.test(said)) return 'the secretary'
  if (/\bthe person\b/.test(said) || /\bnobody\b/.test(said)) return 'the person'
  return 'nobody the office can name'
}

/**
 * THE ONE SENTENCE SAID WHERE AN ADDED CARD'S reports-to WORDS NAME NOBODY THE OFFICE KNOWS.
 *
 * It is kept beside the reading it describes, so the preview's reminders
 * (src/server/lib/added-roles.ts) and the Roles page's block (src/web/pages/RolesPage.tsx) say the
 * same thing. The page reads it through the word `addedRoles.reportsToNamesNobody`, which returns
 * this constant, so neither place holds a second copy of the sentence.
 */
export const THE_REPORTS_TO_NAMES_NOBODY =
  'Who this card reports to names nobody the office knows, so nobody is added above its holder when two work areas overlap.'

/** Every role name this installation holds, in the order the file lists them. */
export function roleNames(decl: RolesDeclaration): string[] {
  return decl.cards.map((one) => one.name)
}

/**
 * THE WORD ON A REGISTRY ROW THAT NO CARD HOLDS, or null because the word is one of the declared
 * roles — or because the row holds no word at all, which is a different thing again.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT THE SAME AS HAVING NO ROLE, AND WHY THAT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * A row with no role reads as `A_ROW_WITH_NO_ROLE_READS_AS` — worker — and that is a reading of an
 * absence somebody decided and wrote down. A row holding "investigator" after that card left the
 * tree, or holding a typo, is not an absence: it is a word this installation cannot interpret. The
 * fifth invariant is exactly this distinction — *nothing is there* and *somebody wrote something
 * nobody can read* are different answers and must not collapse into one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY IT IS DANGEROUS
 * ---------------------------------------------------------------------------------------
 *
 * Note `c5W3ZBatgdpG`, 6 September 2026, measured on a copy of the corpus: a registry row holding a
 * role word no card holds was refused NOTHING — `cardFor` answered null and `actsRefusedTo` answered
 * an empty map, so the row was unrestricted and nothing said so. No row held `investigator` when
 * that card was removed on 7 September, so nothing happened; had one held it, that agent would have
 * become unrestricted silently. `checkAgentRole` refuses such a word on the way in, but only when a
 * process has read the cards, and it cannot refuse a word that was legal when it was written and
 * stopped being legal when a card was removed.
 */
export function roleWordNobodyDeclares(decl: RolesDeclaration, role: string | null): string | null {
  if (role === null) return null
  return decl.cards.some((one) => one.name === role) ? null : role
}

// ================================================================ the powers, and the subtraction

/**
 * THE NAMES OF THE POWERS ONE CARD HOLDS, folding the tree.
 *
 * A card on the tree holds its own step's powers and every step below it. A card off the tree holds
 * the powers it names. Nothing else is a source, so a card cannot come to hold a power for a reason
 * that is not written in this declaration.
 *
 * IT TAKES A CARD RATHER THAN A NAME, so a card written in Mole Office — which is in no list —
 * can be drawn with the same powers a declared card of that rung would have. Criterion P51.
 */
export function powerNamesOn(decl: Pick<RolesDeclaration, 'tree'>, card: RoleCard): string[] {
  if (card.rung === null) return [...(card.powers ?? [])]
  const held: string[] = []
  for (const step of [...decl.tree].sort((a, b) => a.rung - b.rung)) {
    if (step.rung <= card.rung) held.push(...step.adds)
  }
  return held
}

/** The powers one card holds, with their acts. The names are `powerNamesOn`, in the file's order. */
export function powersOn(decl: Pick<RolesDeclaration, 'powers' | 'tree'>, card: RoleCard): NamedPower[] {
  const names = new Set(powerNamesOn(decl, card))
  return decl.powers.filter((one) => names.has(one.name))
}

/**
 * ONE CARD AS A READER GETS IT: the declared card with its powers filled in from the tree.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SERVED CARD IS NOT THE DECLARED CARD, AND WHY THAT IS NOT TWO PLACES
 * ---------------------------------------------------------------------------------------
 *
 * In `design/permissions/roles.json` a card on the tree carries `powers: null` and takes its powers
 * from its rung: that is one fact in one place, and it is what stops a card and a step of the tree
 * drifting apart. But `powers: null` is not something anybody can read, and it is not something that
 * can be COPIED either: `PATCH /api/records` deletes a key whose value is null, so a copy of the
 * declared card loses the field and reports itself out of date for ever.
 *
 * So the card is resolved here, once, at the edge — served, copied and drawn with the names filled
 * in. The declaration stays the authority and this stays a reading of it, computed on every request
 * from `powerNamesOn`. What it buys, besides a card a person can read: a power moved from one step
 * to another now makes every affected copy say it is out of date, which is exactly what the copy is
 * for and what a null could never show.
 */
export function cardAsRead<T extends RoleCard>(decl: Pick<RolesDeclaration, 'powers' | 'tree'>, card: T): T {
  // IN THE FILE'S OWN ORDER, not the order the steps happen to add them in. Which step a power is
  // added at is a fact about the tree; which order a card lists them in is not a fact about anything,
  // and letting it follow the tree would make every copy report itself out of date the day somebody
  // moved a power between two steps that both end up holding it.
  return { ...card, powers: powersOn(decl, card).map((one) => one.name) }
}

/** The powers of a role by name, or an empty list where no card holds that word. */
export function powersFor(decl: RolesDeclaration, role: string | null): NamedPower[] {
  const card = cardFor(decl, role)
  return card === null ? [] : powersOn(decl, card)
}

/** Every act this declaration names, as a map from the act key to the words a person reads. */
export function everyActNamed(decl: RolesDeclaration): Map<string, string> {
  const acts = new Map<string, string>()
  for (const power of decl.powers) for (const one of power.acts) acts.set(one.act, one.inWords)
  return acts
}

/**
 * THE ACTS REFUSED TO ONE ROLE, as a map from the act key to the words a refusal says.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A SUBTRACTION, AND NOTHING WRITES THE ANSWER DOWN. Criterion P57
 * ---------------------------------------------------------------------------------------
 *
 * Every act this declaration names, minus every act under a power this role holds. So there is no
 * May-not list to keep in step with a May list, and a power added to a rung takes effect on every
 * refusal at once.
 *
 * A WORD NO CARD HOLDS IS REFUSED EVERYTHING, and that is the opposite of what it used to be.
 * Until 7 September 2026 such a row was refused nothing, measured in note `c5W3ZBatgdpG`, and that
 * is not the rule about unregistered callers — an unregistered caller never reaches this function,
 * because `theRoleOfTheCaller` answers null for one and the gate leaves before asking. This is a
 * REGISTERED row whose word this installation cannot interpret, and there are only two readings of
 * it: call it a worker, or refuse it. Calling it a worker is a guess — nobody granted that row
 * worker's powers, and a card removed from the declaration would hand its holders a rung by
 * accident. The fifth invariant settles it: absence beats a guess, and an act nobody can say you may
 * perform is one you may not. The refusal names the word, so the fix is one edit away and is never
 * mistaken for a fault in the caller's request.
 *
 * `alsoHolding` IS HOW ELEVATION IS FOLDED IN, and it is the only door for it. A secretary the person
 * has said may act for them holds one more power — `The person's own acts` — for as long as that
 * lasts. Passing it here means the refusal before and the refusal after are the same subtraction,
 * rather than a second rule written beside the first.
 */
export function actsRefusedTo(
  decl: RolesDeclaration,
  role: string | null,
  alsoHolding: readonly string[] = [],
): Map<string, string> {
  const card = cardFor(decl, role)
  const refused = new Map<string, string>()
  if (card === null) {
    // EVERY ACT THIS DECLARATION NAMES, because nothing here can say which of them this word allows.
    // `alsoHolding` is deliberately not folded in: elevation is granted to a card, and a word that
    // is not a card cannot be the one the person pressed the button on.
    for (const power of decl.powers) for (const one of power.acts) refused.set(one.act, one.inWords)
    return refused
  }
  const held = new Set([...powerNamesOn(decl, card), ...alsoHolding])
  for (const power of decl.powers) {
    if (held.has(power.name)) continue
    for (const one of power.acts) refused.set(one.act, one.inWords)
  }
  return refused
}

/**
 * THE CARD THAT IS NOT A STEP OF THE TREE.
 *
 * The tree is the rungs of power — worker, supervisor, secretary — and one card sits off it: the one
 * whose job is to check rather than to work, so that a check the checked party can overrule is not
 * what happens. It is read here rather than named, because the role words live in
 * design/permissions/roles.json and in no source file.
 *
 * NULL WHEN THERE IS NOT EXACTLY ONE, which is a real answer and not a default. A declaration with
 * two cards off the tree has two answers to "who checks", and picking the first would be this file
 * deciding something the declaration did not.
 *
 * A TOOL'S CARD IS NOT COUNTED. A card refused everything else is off the tree because it names its own
 * powers, and it may do nothing but what they
 * hold, so it neither works nor checks. The mailer was the first. The mailer card
 * left the file on 1 October 2026, so today the inspector is the one card off the
 * tree.
 */
export function theCardOffTheTree(decl: Pick<RolesDeclaration, 'cards'> & { shippedCards?: readonly RoleCard[] }): RoleCard | null {
  // Added settings are off the tree too. Who checks remains the shipped declaration's choice.
  const off = (decl.shippedCards ?? decl.cards).filter((one) => one.rung === null && one.refusedEverythingElse !== true)
  return off.length === 1 ? (off[0] ?? null) : null
}

/**
 * THE ACTS A CARD REFUSED EVERYTHING ELSE MAY DO: the acts under its own powers, and no other. Null for
 * every other card, and for a word no card holds, which `actsRefusedTo` already refuses every named act.
 * src/server/lib/rolegate.ts refuses such a card every act outside this set,
 * named or not.
 */
export function theActsACardIsKeptTo(decl: RolesDeclaration, role: string | null): ReadonlySet<string> | null {
  const card = cardFor(decl, role)
  if (card === null || card.refusedEverythingElse !== true) return null
  const held = new Set(powerNamesOn(decl, card))
  const acts = new Set<string>()
  for (const power of decl.powers) {
    if (!held.has(power.name)) continue
    for (const one of power.acts) acts.add(one.act)
  }
  return acts
}

/** Is this a role name this installation holds? A word outside the file is refused, never stored. */
export function isARole(decl: RolesDeclaration, value: unknown): boolean {
  return typeof value === 'string' && decl.cards.some((one) => one.name === value)
}

// ================================================================ the cards a person holds

/**
 * WHAT A PERSON'S ROW WITH NO ROLE IS READ AS. Criterion P45: anybody
 * else reads, by default, as their name and then the administrator of the Office.
 *
 * It is the same device as `A_ROW_WITH_NO_ROLE_READS_AS` for an agent, and it says the same thing:
 * a row nobody has written a role on is read as this, and the screen says no role set rather than
 * drawing a word nobody chose.
 */
export const A_PERSON_WITH_NO_ROLE_READS_AS = 'administrator'

/** The person card with this name, or null. A name nothing holds is a real answer, never a default. */
export function personCardFor(decl: RolesDeclaration, role: string | null): PersonCard | null {
  const name = role ?? A_PERSON_WITH_NO_ROLE_READS_AS
  return decl.personCards.find((one) => one.name === name) ?? null
}

/** Every person role this installation holds, in the order the file lists them. */
export function personRoleNames(decl: RolesDeclaration): string[] {
  return decl.personCards.map((one) => one.name)
}

/** Is this a role a PERSON may hold? Never asked of an agent, and never answered from `cards`. */
export function isAPersonRole(decl: RolesDeclaration, value: unknown): boolean {
  return typeof value === 'string' && decl.personCards.some((one) => one.name === value)
}

/**
 * WHERE ONE PERSON STANDS IN THE OFFICE, in one line: their name, then their card's standing.
 *
 * Criterion P45 settles the shape: the name, and then what they are
 * here. One place builds it, so the profile, the card and anything else that says it cannot come to
 * say it differently.
 *
 * IT IS NOT THE OCCUPATION. What somebody does for a living is theirs to write and is stored on
 * their own row; this is what the Office says about them, and every holder of one card gets the same
 * words. A person can be an engineer AND the administrator of Mole Office, which is two facts.
 */
export function theStandingLineFor(name: string, card: PersonCard): string {
  return `${name}, ${card.standing}`
}

/** The role names in a sentence, for a refusal that has to name them: `worker, supervisor or …`. */
export function theRoleWordsSaid(decl: RolesDeclaration): string {
  const words = roleNames(decl)
  const last = words.pop() ?? ''
  return words.length === 0 ? last : `${words.join(', ')} or ${last}`
}

// ============================================================ the visitor card ceiling. P86

/**
 * THE CARD A VISITOR MAY HOLD WHEN NOBODY HAS SAID OTHERWISE. Criterion P86: by
 * default a visitor's card is at most the supervisor card, and never the inspector or the secretary card.
 */
export const DEFAULT_VISITOR_CARD_CEILING = THE_SUPERVISOR

/**
 * HOW HIGH A CARD SITS, for the one question the visitor ceiling asks: is this card above that one.
 *
 * A CARD ON THE TREE USES ITS RUNG. A card off the tree has no rung, and giving it one would be this
 * file inventing a step the declaration did not write. It sits above every rung instead, so the
 * inspector — the one card off the tree today — is above the secretary, and raising the ceiling to
 * the inspector raises it over every card there is. That is a reading of the ceiling and not of the
 * card's power: the inspector reads more than a worker and writes less than a supervisor, and P86
 * still refuses it by default because the person appointed it with their own press.
 */
export function heightOfACard(decl: Pick<RolesDeclaration, 'tree'>, card: RoleCard): number {
  return card.rung ?? decl.tree.length + 1
}

/** Whether one card sits above a ceiling card. Null for either card is not above anything. */
export function cardIsAboveTheCeiling(
  decl: Pick<RolesDeclaration, 'tree'>,
  card: RoleCard | null,
  ceiling: RoleCard | null,
): boolean {
  if (card === null || ceiling === null) return false
  return heightOfACard(decl, card) > heightOfACard(decl, ceiling)
}

/**
 * WHETHER THE CEILING HAS BEEN RAISED ABOVE ITS DEFAULT, for a row that has to say so.
 *
 * It is true exactly when the setting names a card higher than the supervisor card. A setting that
 * names the supervisor, or the worker, is not a raising; it is the default or a lowering.
 */
export function theVisitorCeilingWasRaised(decl: Pick<RolesDeclaration, 'tree' | 'cards'>, ceilingWord: string): boolean {
  const ceiling = cardFor(decl as RolesDeclaration, ceilingWord)
  const fallback = cardFor(decl as RolesDeclaration, DEFAULT_VISITOR_CARD_CEILING)
  return cardIsAboveTheCeiling(decl, ceiling, fallback)
}

// ================================================================ appointment. Criterion P58

/**
 * WHO MAY GIVE THIS CARD OUT, in the words a person reads. Built from `appointedBy`, never stored.
 *
 * The card used to carry a sentence AND the rule, which is the same fact in two places: change the
 * rule and the sentence goes on saying the old one, with nothing failing.
 */
export function whoAppointsIt(card: RoleCard): string {
  return card.appointedBy === 'the person'
    ? 'Only the person.'
    : 'Its starter, which may be any agent at or above this rung.'
}

/**
 * A ROLE NAME WITH ITS ARTICLE. `a worker`, `an inspector`.
 *
 * A refusal is a sentence a person reads, and "A inspector appoints nobody" is the sort of thing
 * that makes a reader stop trusting the rest of the message. Role names are the declaration's, so
 * this cannot be a lookup table: it is the vowel rule, which is right for every word in the file
 * today and wrong only for words like `hour` that no role is called.
 */
export function aOrAn(word: string): string {
  return `${'aeiou'.includes(word.slice(0, 1).toLowerCase()) ? 'an' : 'a'} ${word}`
}

/** The same phrase at the start of a sentence. */
function capitalise(said: string): string {
  return said.slice(0, 1).toUpperCase() + said.slice(1)
}

/**
 * WHETHER ONE ROLE MAY GIVE ANOTHER, and the sentence saying which rule refused. Criterion P58.
 *
 * ---------------------------------------------------------------------------------------
 * THREE RULES, AND EACH REFUSAL NAMES THE ONE IT BROKE
 * ---------------------------------------------------------------------------------------
 *
 * Only the person may appoint a secretary. Below that, the power structure decides: a supervisor may appoint a
 * supervisor, and a worker may not.
 *
 *   1. A card whose `appointedBy` is the person is the person's to give, and no agent may.
 *   2. A starter whose card `appoints` nobody gives no role at all.
 *   3. Otherwise a starter gives a role AT OR BELOW its own rung, which is the change from what was
 *      built before: a supervisor may now make a supervisor.
 *
 * A card off the tree has no rung, so rule 3 has nothing to compare and rule 2 is what answers: the
 * inspector's card says it appoints nobody.
 */
export function whyThisRoleMayNotBeGiven(decl: RolesDeclaration, starter: string | null, giving: string): string | null {
  const wanted = cardFor(decl, giving)
  if (wanted === null) return `"${giving}" is not a role here. The roles are ${theRoleWordsSaid(decl)}.`
  if (wanted.appointedBy === 'the person') {
    return `Only the person appoints ${aOrAn(wanted.name)}. That is the ${wanted.name} card's own line: appointed by the person.`
  }
  const mine = cardFor(decl, starter)
  if (mine === null) return 'Nothing says what role the starter holds, so it cannot give one.'
  if (mine.appoints === 'nobody') {
    return `${capitalise(aOrAn(mine.name))} appoints nobody. That is the ${mine.name} card's own line, so it may give no role at all.`
  }
  if (mine.rung === null) {
    return `${capitalise(aOrAn(mine.name))} is off the tree, so there is no rung to compare and it may give no role.`
  }
  if (wanted.rung === null) {
    return `${capitalise(aOrAn(wanted.name))} is off the tree, so no rung is at or below a starter's and only the person appoints one.`
  }
  if (wanted.rung > mine.rung) {
    return (
      `${capitalise(aOrAn(mine.name))} may not make ${aOrAn(wanted.name)}. A starter gives a role at or below its own rung, ` +
      `and ${wanted.name} is rung ${String(wanted.rung)} while ${mine.name} is rung ${String(mine.rung)}.`
    )
  }
  return null
}

// ================================================================ elevation. Criteria P59 and P60

/**
 * WHETHER THIS ROLE MAY BE ELEVATED AT ALL, from the declaration's own rule.
 *
 * One card can hold it, and the file says which. Asking here rather than writing `secretary` into a
 * route is what keeps the rule in one place: change the card the file names and every refusal moves.
 */
export function mayBeElevated(decl: RolesDeclaration, role: string | null): boolean {
  return role !== null && role === decl.elevation.onlyThisCardCanHoldIt
}

/** The stable words for the three ways elevation ends, from the declaration. */
export function howElevationCanEnd(decl: RolesDeclaration): string[] {
  return decl.elevation.howItEnds.map((one) => one.kind)
}

/** Is this one of the ways the declaration says elevation may end? */
export function isAWayElevationEnds(decl: RolesDeclaration, value: unknown): boolean {
  return typeof value === 'string' && howElevationCanEnd(decl).includes(value)
}

/** The words for one way of ending, from the declaration, or the stored word where it holds none. */
export function howThisOneEnds(decl: RolesDeclaration, endsWhen: string): string {
  return decl.elevation.howItEnds.find((one) => one.kind === endsWhen)?.inWords ?? endsWhen
}

/**
 * WHETHER A STORED GRANT STILL HOLDS, given the clock. Criterion P59.
 *
 * Two of the three ends need nobody to press anything, and they are answered differently. A grant
 * with an end TIME is compared to the clock here, so it stops holding the moment the time passes
 * with nothing having run. A grant that ends WHEN A PIECE OF WORK ENDS cannot be answered from the
 * grant alone — somebody has to release the work — so it holds until `endedAt` is written, and the
 * release is what writes it. A grant that ends WHEN THE PERSON SAYS holds until their press.
 *
 * IT TAKES THE CLOCK AS AN ARGUMENT so that a caller passes the product's own wall clock and this
 * file reads no clock of its own; the browser and the server then answer alike.
 */
export function elevationStillHolds(one: Elevation, now: string): boolean {
  if (one.endedAt !== null) return false
  if (one.endsWhen === 'at a time') return one.until !== null && !aRaisesEndHasCome(one.until, now)
  return true
}

/**
 * WHETHER A RAISE'S END TIME HAS COME, given the clock. Problem OpT-wLSCwlZ-. The one place a raise's end is compared
 * with now: `elevationStillHolds` asks it, and so does the raise door before it grants a time.
 *
 * IT COMPARES TIMES, NOT TEXT. Both are read with `readATypedTime` and compared as moments. Compared as text, the end
 * `2026-09-30 7:00` sorted after `2026-09-30 07:13:00`, because "7" sorts after "0", so a raise meant to end at 07:00
 * held until midnight.
 *
 * AN END THAT DOES NOT READ HAS COME. A stored end this reader cannot read is not a time anything could wait for, and a
 * raise that held because of a reading failure would hand the person's acts on for no reason they gave. So it holds nothing.
 */
export function aRaisesEndHasCome(until: string, now: string): boolean {
  return aTimeHasCome(until, now)
}

/** The same field changes are shown in preview and history. Missing values read as null. */
export function differenceBetweenRoleCards(before: unknown, after: unknown): { field: string; before: unknown; after: unknown }[] {
  const fields = new Set([...Object.keys(typeof before === 'object' && before !== null ? before : {}), ...Object.keys(typeof after === 'object' && after !== null ? after : {})])
  const value = (card: unknown, field: string): unknown => typeof card === 'object' && card !== null ? (card as Record<string, unknown>)[field] ?? null : null
  return [...fields].sort().filter(field => JSON.stringify(value(before, field)) !== JSON.stringify(value(after, field))).map(field => ({ field, before: value(before, field), after: value(after, field) }))
}
