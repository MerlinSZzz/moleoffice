// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE PLACE MOLE OFFICE ASSEMBLES A READING OF ITSELF FOR SOMEBODY WHO WAS NOT HERE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------------
 *
 * A person or an agent asks for named PARTS of this project — the plan, the schedule, what is
 * waiting on a person, what is still open — at a subject and a size. This file calls the reader
 * that already answers each part, fits the answers into the size, and says what it left out.
 *
 * IT INVENTS NO SECOND STORE AND NO SECOND READING. Every part below names what answers it, in
 * `READERS`, and carries nothing when nothing can answer it rather than being filled in from a rule
 * written here — a rule written here would be the same fact worked out in two places, which is this
 * repository's recurring defect.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY IT EXISTS, AND WHY BOTH ITS CALLERS SAID SO IN THEIR OWN COMMENTS FIRST
 * ---------------------------------------------------------------------------------------------
 *
 * Round ten's plan named `src/server/lib/continuation.ts` twice — wave 3 step 8 and wave 9a step 6
 * — and it was never written either time. Both of the things that were supposed to call it went in
 * without it and said so:
 *
 *   · `src/server/lib/bundle.ts` — *"THE PLAN NAMES A FILE THAT DOES NOT EXIST … So this file calls
 *     the readers that DO exist, one per slot."*
 *   · `src/server/api/bootstrap.ts` — *"`work_domains`, `placeholders` and `checkpoint` belong to
 *     the shared continuation assembler, and THAT ASSEMBLER DOES NOT EXIST … So the slot is ABSENT
 *     and named."*
 *
 * So the same project was read three ways: the bundle's six readers, the bootstrap's own queries,
 * and nothing at all for the parts neither reached. This is the one reading, and those two are its
 * consumers.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FOUR RULES IT KEEPS
 * ---------------------------------------------------------------------------------------------
 *
 * RULE 1 — A LIMIT RIDES WITH THE VALUE IT LIMITS. Every placeholder and every substituted method
 * reaching a record this reading carries is printed inside that record's own entry, at every
 * length, and is never dropped to save room. Which record a limit reaches is answered by
 * `restrictionsReaching`, which returns that mapping — it is not guessed here. `bundle.ts` used to
 * guess it: *if the restriction record is itself carried attach it to itself, otherwise to the
 * anchor, otherwise to whichever record happens to be first*, which on a project scope put every
 * limit beside the first open loop whatever it actually reached.
 *
 * RULE 2 — SEMANTIC ZOOM, NOT A DUMP. Each part gets a share of the size. A part that does not fit
 * its share draws its members SHORT instead of whole; if the short form still does not fit it
 * carries fewer members and NAMES THE ONES IT DROPPED BY ID. What it carried and what it left out
 * are said in one sentence, under that part's own heading, in the text itself.
 *
 * RULE 3 — ASKING FOR SOMETHING MOLE OFFICE CANNOT GIVE IS REFUSED, NOT QUIETLY NARROWED. An unknown
 * part name is a refusal — see `whyTheseSlotsCannotBeUsed` in `src/shared/bundles.ts`, which is
 * where that refusal is decided. A part that Mole Office HAS but cannot answer here — because nothing
 * computes it, because it is about one record and a whole project was asked about, or because it
 * needs an agent and none was named — is ANSWERED, with the reason, in the text. Those are two
 * different failures and they are never given the same shape.
 *
 * RULE 4 — NO SHARE IS LENT. A part that does not use its share does not hand it on. Lending makes
 * what one part drops depend on data that has nothing to do with it, so the same question would get
 * different answers as unrelated records changed. `agent-coordination.md` §6.3 sets the same rule
 * for the agent envelope and this is the same arithmetic.
 */
import {
  BUNDLE_RUNGS,
  BUNDLE_RUNG_WHEN_NOBODY_SAYS,
  rungsMoved,
  SCOPES,
  slotsOf,
  type BundleSpec,
  type ScopeName,
} from '@shared/bundles.ts'
import { levelLabel, positionOf, rungsFor, type DetailSource, type Rung } from '@shared/detail.ts'
import { GRAINS, loadOf, periodKey } from '@shared/planning.ts'
import { referenceLine, type Reference } from '@shared/reference.ts'
import { restrictionDrawing } from '@shared/restriction.ts'
import { actorTypeWord, changeVerb, kindWord, readerWord, relationWord } from '@shared/words.ts'
import { KIND_FAMILIES, stateOfWork } from '@shared/work.ts'
import { AUTHORITY_SAYS } from '@shared/implementation.ts'
import type { BlockLinkRow } from '@shared/blocks.ts'
import type { PanelRecord } from '@shared/types.ts'

import { blockLinkRowsIn, readOnePipelinesBlocks } from './blocks.ts'
import { childrenOf, type AChild } from './children.ts'
import { contradictionsFor } from './contradictions.ts'
import { readForks } from './forks.ts'
import { agentByHandle, inboxOf } from './inbox.ts'
import { openLoopsFor, type OpenLoops } from './openloops.ts'
import { rankOpenWork } from './openwork.ts'
import type { ReadOnTheThread } from './attention-thread-worker.ts'
import { allocationsIn, capacityOf, hoursCountedTwiceIn, withWork } from './planning.ts'
import { listPlans } from './plans.ts'
import { linesOf } from '../db/lines-of.ts'
import { getRecord, listChanges, listRecords, resolveLinks } from './records.ts'
import { PanelError } from './panel-error.ts'
import { everyMessageHiddenFrom, type AMessageReader } from './messages.ts'
import { mayReadTheInboxOf, onlyItsOwnInbox } from './agents.ts'
import { referenceTo } from './references.ts'
import { listRevisions } from './revisions.ts'
import {
  restrictionsInScope,
  restrictionsInThisProject,
  restrictionsReaching,
  type RestrictionReading,
} from './restrictions.ts'
import { statedFor } from '../db/stated-for.ts'
import { openDomainsIn } from './workdomain.ts'
import { readWorkList, MAX_WORK_ROWS } from './worklist.ts'

// ============================================================================ what a caller asks

/**
 * SOMETHING CONSIDERED AND NOT CARRIED. A count and WHAT it was, never a bare number.
 *
 * A bare count is the defect this repository has nine of: *"12 left out"* tells a reader a number
 * and not what they are missing. Every group here carries a sentence naming the kind of thing.
 */
export interface BundleLeftOut {
  bucket: string
  count: number
  says: string
  /**
   * THE RECORDS THIS GROUP IS ABOUT, BY ID, when the reader knows them. Absent when it does not.
   *
   * IT IS NEVER PRINTED BARE. The renderer turns each one into a reference — kind, id, title and
   * what it means here — for as many as the room allows, and says how many it could not name. The
   * ids used to be appended to `says` with nothing beside them, which was almost the whole of
   * problem `F2NxzxAnRkb2`: 898 ids and half the text of a small copy. Criterion B13 of
   * design/bundle/ACCEPTANCE.md; the shape the renderer uses is criterion B18's, declared once in
   * `src/shared/reference.ts` and built once in `src/server/lib/references.ts`.
   */
  ids?: readonly string[]
  /**
   * WHAT EVERY RECORD IN THIS GROUP MEANS HERE — the reader's own reason for leaving it out.
   *
   * It is one string for the group rather than one per record because the reason IS the group: `its
   * own state word says the work reached its end` is true of every record in that bucket. The
   * renderer puts it on each reference it prints.
   */
  meansHere?: string
}

/** What one assembly is about. The same union a bundle's scope is, and for the same reason. */
export type ContinuationSubject = { kind: 'project' } | { kind: 'record'; recordId: string }

export interface ContinuationAsk {
  workspaceId: string
  subject: ContinuationSubject
  /** The parts wanted, by name. An unknown name is refused before this is called. */
  parts: readonly ScopeName[]
  /** The ceiling for everything the parts carry, in bytes. */
  budgetBytes: number
  /**
   * HOW MUCH OF THAT EACH PART GETS, by name. Missing means the parts share it equally.
   *
   * It is handed in rather than worked out here because the preset declares it, and working it out
   * a second time here is how the size a reply reports and the size a part was held to come apart.
   */
  shares?: ReadonlyMap<ScopeName, number>
  /** How far from the subject to reach, in links. Only meaningful for a record subject. */
  reach?: 1 | 2 | 3
  /**
   * WHICH MODULES AND PIPELINES THE `structure` PART CARRIES, by id. Absent means all of them.
   *
   * The ids are checked before this is called — `resolveBundle` refuses one that names no module or
   * pipeline in this project — so a reader here may take them as real. Criterion B6.
   */
  modulesAndPipelines?: readonly string[]
  /** The agent whose inbox the `messages` part is about, by handle. Nothing is guessed from absence. */
  agentHandle?: string
  /**
   * WHO IS READING. A message this reader may not read is in no part: not linked
   * to the subject, not in the recent changes, and not counted by the open loops; another agent's inbox is
   * refused. Left out by a caller that answers no request, which reads every message.
   */
  reader?: AMessageReader
  /**
   * THE RECORDS SOMEBODY NAMED BY HAND, by id, for the part of their own they are carried under.
   *
   * The ids are checked before this is called — `resolveBundle` refuses one that names no live
   * record in this project — so a reader here may take them as real. Criterion B8.
   */
  additionalRecords?: readonly string[]
  /**
   * THE ATTENTION RULE'S READING THE `openLoops` PART IS ORDERED BY, worked out on its own thread by the
   * caller before this is called (`theReadingOpenWorkIsRankedBy` in openwork.ts, problem CtH8CGBkE5Bz).
   * This assembler is one synchronous step, and working the rule out inside it held the whole office.
   * Asking for `openLoops` without it is refused, never answered unranked.
   */
  ranking?: ReadOnTheThread
  /**
   * WHICH POSITION OF THE LADDER EVERY ENTRY IS DRAWN AT. Absent means `full`, which is what every
   * copy did before this existed.
   *
   * The five a copy offers are `BUNDLE_RUNGS`. A rung outside them is refused at the door rather
   * than quietly rounded, because rounding would answer a question nobody asked.
   *
   * PRESENT MEANS SOMEBODY PICKED IT, AND A PICKED POSITION IS HONOURED. The part budgets shape the
   * position only when this is absent — when nobody said, and the copy is choosing for itself.
   * Criterion B25 of `design/bundle/ACCEPTANCE.md` comes from what a first try of the page measured:
   * the Conclusion was asked for, and 101 of the copy's 132 entries came
   * back as titles, because the part called *What is still open* was given 7,281 bytes and a line
   * each is more than that. The copy said so in a line that went unnoticed. So a position they
   * pick now takes the room it needs and the copy says how much that was.
   */
  detail?: Rung
  /**
   * HOW FAR THE PERSON MOVED EVERY PART FROM THE LEVEL ITS OWN SHARE CHOSE. Criterion B31.
   *
   * Negative is less and positive is more, one rung a press. Absent and zero are the same thing:
   * nobody moved anything, and every part is drawn at the level its share of the size gives it.
   *
   * IT IS NOT `detail` AND CANNOT BE WRITTEN AS ONE. `detail` names one level for the whole copy,
   * which is a different question and now has no control on the page — it stays because bundles
   * filed before B31 carry it and must still resolve to what they meant. This one is an offset from
   * a base the copy works out per part, so the same offset means a different level in each part,
   * which is exactly what decision `JPDu6lJcizw0` settles: the size shapes the base, the offset
   * is the person's. Sending both is refused at the door rather than silently ranked.
   */
  shift?: number
}

// ============================================================================ what it answers

/**
 * WHY A PART CARRIES NOTHING. FOUR WORDS, AND THEY ARE NOT FOUR SPELLINGS OF ONE.
 *
 * `nothing-computes-it`  no reader is coming, because there is nothing to compute it from.
 * `about-one-record`     this part only means something about one record, and a whole project was
 *                        asked about. The question was not answered; it did not apply.
 * `no-agent-named`       this part is about one agent's mail and nobody said which agent.
 * `none-in-scope`        the reader RAN and found nothing. This is a real answer and good news.
 */
export type WhyNothing = 'nothing-computes-it' | 'about-one-record' | 'no-agent-named' | 'none-in-scope'

/**
 * ONE ENTRY A PART CARRIES, WRITTEN AT EACH POSITION OF THE LADDER IT HAS.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS TWO LENGTHS CALLED `whole` AND `short`, AND THAT WAS A SECOND DETAIL VOCABULARY
 * ---------------------------------------------------------------------------------------
 *
 * The product has one ladder of seven positions, declared in `src/shared/detail.ts`, and a bundle
 * had a ladder of two beside it. `design/PROBLEM-CLUSTERS.md:106` forbids exactly that by name, and
 * criterion B16 of `design/bundle/ACCEPTANCE.md` is where it goes. The keys of this map are rungs of
 * the one ladder and there is no other word for a length anywhere in this file.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH POSITIONS AN ENTRY HAS, AND WHO FILLS THEM
 * ---------------------------------------------------------------------------------------
 *
 * A part's reader writes ONE of them: `title`, the one line that identifies the entry. Beside it,
 * and not a rung at all, it writes `wrote` — what this part has to say about this record. `anEntry`
 * below is the only way to make either, so no reader can write a rung by hand.
 *
 * The assembly fills the rungs above the title, because they are facts about the RECORD rather than
 * about the part: `gist` is the record's own summary column, `outline` and `sketch` are its
 * children, and `digest` is its parts at a hundred and twenty words each. See `fillTheLadder`.
 *
 * WHAT THE PART WROTE IS NOT A RUNG, AND CRITERION B32 IS WHY. It used to be stored as `full`, so
 * the copy called a part's own annotation *the record itself* — a rung nobody wrote, dressed as the
 * highest level there is. It measured shorter than the Conclusion on their corpus (4,577 bytes
 * against 6,088), which is problem `AQZm6esnQqCr`. It now rides with every rung above the title,
 * so each rung says everything the one below it says and more.
 *
 * A RUNG THAT IS ABSENT IS ONE THIS ENTRY HAS NOT GOT, and a copy asked for it draws the nearest
 * shorter one it has and counts that. A detail level that was not chosen falls back to the level
 * above it.
 */
export interface PartMember {
  /** The record this entry is about, or null when the entry is not about a record. */
  recordId: string | null
  /** What this entry says at each position it has. `title` is always present. */
  atRung: Partial<Record<Rung, string[]>>
  /**
   * WHAT THIS PART HAS TO SAY ABOUT THIS RECORD, head line first, and it is not a rung.
   *
   * The reader writes it: how far through a pipeline is, why an open loop ranks where it does, what
   * a stopping point said. It is drawn at every rung above the title, so nothing a reader wrote is
   * lost by asking for a shorter level of the RECORD. Criterion B32.
   */
  wrote: string[]
  /**
   * THE FOUR WORDS THIS ENTRY'S HEAD LINE WAS BUILT FROM, kept so a caller that wants to name this
   * record does not have to read the line back or look the record up again.
   *
   * Absent when the entry is not about a record. `src/server/api/bootstrap.ts` is what wants it:
   * its sections used to hand an arriving agent a list of bare ids and a sentence. Criterion B18.
   */
  reference?: Reference
  /**
   * THE LIMIT LINES THAT RIDE INSIDE THIS ENTRY, kept so a position filled AFTER rule 1 ran still
   * carries them. A copy at the shortest level must still say that what it carries rests on a
   * temporary value. Absent means none reaches this record.
   */
  limits?: string[]
}

/**
 * ONE ENTRY, from the one rung a part's reader writes and the lines it writes beside it.
 *
 * `atTitle` is rung 2 — the one line that still identifies this entry, never empty. `wrote` is
 * everything this part has to say about it, head line first, and it is not a rung of any ladder.
 * Every reader in this file goes through here.
 */
function anEntry(recordId: string | null, atTitle: string[], wrote: string[]): PartMember {
  // WHAT THE PART WROTE UNDER THE IDENTIFYING LINE. Every reader in this file passes the identifying
  // line first and then what it has to say, so the lines under it are what is left when the
  // identifying line is taken off the front. A reader that passed something else keeps all of it,
  // which is the safe direction: a line kept twice is a line a person can read, and a line dropped
  // is one nobody can.
  const under =
    wrote.length >= atTitle.length && atTitle.every((line, i) => wrote[i] === line)
      ? wrote.slice(atTitle.length)
      : wrote
  return { recordId, atRung: { title: atTitle }, wrote: under }
}


/**
 * ONE ENTRY ABOUT A RECORD, WHOSE HEAD LINE IS A REFERENCE IN THEIR FOUR WORDS.
 *
 * `kind, id, compact title and relevant meaning` — register section 7, criterion B18. Every reader
 * below that names a record goes through here, so no reader can print a title with no id beside it
 * and none can print an id with nothing beside it. `rest` is what that reader has to say underneath,
 * and it is drawn at every rung above the title.
 *
 * `meansHere` IS WHAT THIS RECORD IS TO THIS PART, and a reader with nothing part-specific to say
 * passes `stateMeaning(record)` rather than an empty string. See `src/shared/reference.ts`.
 */
function aRecordEntry(
  record: { id: string; kind: string; title: string },
  meansHere: string,
  rest: readonly string[] = [],
): PartMember {
  const reference: Reference = {
    recordId: record.id,
    kind: record.kind,
    title: record.title,
    meansHere,
  }
  const head = referenceLine(reference)
  return { ...anEntry(record.id, [head], [head, ...rest]), reference }
}

/**
 * THE COPY'S OWN WORDS THAT ARE READ IN MORE THAN ONE PLACE, held once. A copy is handed to agents,
 * so these stay English whatever the page's language, and a test reads them here rather than
 * writing them out (round 130). `noState` is what four parts print for a record with no state.
 */
export const COPY_SAYS = {
  noState: 'no state recorded',
  noSteps: 'no steps written down yet',
  recommended: (said: string): string => `recommended: ${said}`,
  addedByName: 'added to the copy by name',
} as const

/**
 * WHAT A RECORD MEANS WHEN THE PART HAS NOTHING OF ITS OWN TO SAY: ITS STATE WORD, READ.
 *
 * A COPY NEVER PRINTS A BLANK WHERE A MEANING BELONGS. *no state recorded* and an
 * empty clause are different facts about a record and a reader cannot tell them apart unless the
 * first one is written. The word is read through `readerWord` with the record's own kind, which is
 * the same reading every screen draws, so a copy and a page cannot disagree about a state.
 */
function stateMeaning(record: { kind: string; data: unknown }): string {
  const state = stateOf(record)
  return state === null
    ? COPY_SAYS.noState
    : readerWord(state, 'normal', record.kind).text
}

/**
 * WHICH OF THE FIVE THIS ENTRY IS ACTUALLY DRAWN AT, walking down from the one asked for.
 *
 * `title` is on every entry, so this always answers. An entry asked for a position it has not got
 * lands on the nearest SHORTER one it has, which is their rule; it never reaches for a longer one,
 * because a longer one would say more than somebody asked for.
 */
export function drawnAt(entry: PartMember, asked: Rung): Rung {
  const at = BUNDLE_RUNGS.indexOf(asked)
  const from = at === -1 ? BUNDLE_RUNGS.length - 1 : at
  for (let i = from; i >= 0; i--) {
    const rung = BUNDLE_RUNGS[i] as Rung
    if (entry.atRung[rung] !== undefined) return rung
  }
  return 'title'
}

export interface AssembledPart {
  name: ScopeName
  /** What this part is to a reader. From the one declaration, never a second string. */
  label: string
  /**
   * WHAT ANSWERED THIS PART, in the words this copy gives its reader. Implementation details stay
   * out of the normal reading. `null` when nothing was called, and then
   * `why` says which nothing it was.
   */
  reader: string | null
  /** True when a reader ran, whatever it found. False means nothing could answer this here. */
  answered: boolean
  /** Present when this part carries nothing. Absent when it carries something. */
  why?: WhyNothing
  /** The lines under this part's heading, its own sentence first. */
  lines: string[]
  /**
   * ONE SENTENCE SAYING WHAT IT CARRIED AND WHAT IT LEFT OUT. Never a bare count, and never two
   * numbers with nothing joining them.
   */
  says: string
  /** How many entries the reader found, before any cut. */
  considered: number
  /** How many entries this text carries. */
  carried: number
  /** Every record the reader found, by id, before any cut. Uncapped and cheap. */
  allRecordIds: string[]
  /**
   * THE SAME RECORDS AS REFERENCES — kind, id, title and what they mean here — for a caller that
   * has to NAME them rather than count them.
   *
   * `GET /api/project/bootstrap` is that caller: its five assembled sections announced a count, a
   * reader and a list of bare ids, and an arriving agent could not tell one id from another without
   * asking Mole Office about each. Criterion B18. It is uncapped for the same reason `allRecordIds`
   * is: a section that dropped one silently would be a count that is not a count.
   */
  allReferences: Reference[]
  /** The records whose own words this text carries. What an export records as carried. */
  recordIds: string[]
  /** The share of the budget this part was given, and what it spent. */
  share: number
  bytes: number
  /**
   * TRUE WHEN THIS PART SPENT MORE THAN ITS SHARE BECAUSE A PERSON PICKED THE POSITION.
   *
   * A part shortens itself to fit its share, and that is right when nobody said how detailed the
   * copy should be. When somebody picked a position, the position wins and the room follows it —
   * criterion B25 — and this is the part saying that is what happened, so the copy can say it in
   * its own text rather than the reader working it out from two numbers.
   */
  tookMoreRoom: boolean
  /**
   * WHICH POSITION OF THE LADDER THE ENTRIES WERE DRAWN AT, or null when the part carries none.
   *
   * IT WAS `'whole' | 'short' | 'none'`, WHICH WAS A SECOND DETAIL VOCABULARY. See `PartMember`.
   * When entries landed on different positions — one had the rung asked for and another did not —
   * this is the longest any of them reached, and `drawnShorter` below counts the rest.
   */
  drew: Rung | null
  /** How many of this part's entries were drawn shorter than asked, and at which position each landed. */
  drawnShorter: { count: number; at: Partial<Record<Rung, number>> }
  /** Numbers this part measured that a JSON consumer needs. Never printed as a bare count. */
  figures: Record<string, number>
  /** What the reader subtracted before the budget saw it, in the reader's own words. */
  leftOut: BundleLeftOut[]
  /**
   * WHICH LEVEL THIS PART GOT AND WHY, as four facts rather than as a sentence. Criteria B30, B31.
   *
   * `automatic` is the longest level whose lines fit this part's share of the size, worked out per
   * part and not for the copy: that is the base, and it is what B30 says the page must show. `shift`
   * is how far the person moved it with less and more, and `level` is where that landed. `fits`
   * says whether what was drawn is inside the share, because a level the person moved up to takes
   * the room it needs and the page has to be able to say so.
   *
   * ABSENT ON THE THREE PARTS THAT DO NOT CHOOSE: a part with no members, the validity limits, which
   * are drawn whole at every size, and a copy where somebody named one absolute level. Absent means
   * this part chose nothing, and the page draws that as its own answer rather than as a level.
   */
  chose?: { level: Rung; automatic: Rung; shift: number; fits: boolean }
  /**
   * THE HIGHEST RUNG ANY ENTRY OF THIS PART REALLY HAS. Criterion B32.
   *
   * It is where *more* stops for this part, and it is a fact about the RECORDS rather than about the
   * size: the digest where somebody wrote one, else the sketch, else the outline, else the
   * Conclusion, else the title alone. A copy asked for a longer position than this draws this one
   * and counts the entry in `drawnShorter`, because a rung nobody wrote is never the one below
   * dressed as a higher level.
   *
   * NULL WHEN THE PART CARRIES NO ENTRIES, which is a different answer from *the title alone*.
   */
  top: Rung | null
}

export interface Continuation {
  subject: ContinuationSubject
  /** The subject record, when the subject is one and it exists. */
  anchor: PanelRecord | null
  parts: AssembledPart[]
  /** Every limit reaching anything this reading carries, once each, worst first. */
  restrictions: RestrictionReading[]
  /** Which records each of those limits reaches, from the reader that answers that question. */
  byRecord: Map<string, RestrictionReading[]>
  /** Records in scope the limit walk could not go through. Empty is normal; an export refuses on it. */
  couldNotCheckInScope: { what: string; because: string }[]
  /** Gaps true of every call, disclosed rather than refused. */
  standingGaps: { what: string; because: string }[]
  /**
   * EVERY RECORD THE TEXT ACTUALLY NAMES, once each, AFTER the budget has had its cut.
   *
   * NOT THE RECORDS THE READERS FOUND. An export records this list as what was handed over, and a
   * record the budget dropped was not handed over. Reporting the pre-cut list would be an export
   * claiming it carried something the text does not mention.
   *
   * SO IT IS NARROWER THAN THE SET THE LIMITS WERE READ OVER, on purpose. The limits above are read
   * over everything the readers found, before the cut, so a limit reaching a record the budget then
   * dropped is still printed whole at the top. That is the safe direction: more limits than the
   * text strictly needs, never fewer. Each part's own pre-cut set is on `allRecordIds`.
   */
  carried: string[]
  budgetBytes: number
  /**
   * THE READINGS THIS COPY WAS ASSEMBLED FROM, each taken once, with every part that drew on it.
   *
   * It rests on a decision on problem 7 and on criterion B20. It is recorded by the
   * thunks in `assembleContinuation` rather than declared here, so a part that went round a shared
   * reading would be missing from the list it appears in — the claim is checkable rather than
   * asserted.
   */
  assembledFrom: AssembledFrom[]
  /** The position every entry was ASKED to be drawn at. Never null: absence has a declared answer. */
  detail: Rung
  /**
   * HOW MANY ENTRIES WERE DRAWN SHORTER THAN ASKED, AND WHERE THEY LANDED.
   *
   * It is what the copy says at the top, on their rule of 6 September 2026: a level nobody wrote falls
   * back to the shorter one, and the reader is told how much of what they are reading is that. A
   * copy where nothing fell back says so, and the two never read the same.
   */
  drawnShorter: { count: number; ofEntries: number; at: Partial<Record<Rung, number>> }
  /**
   * THE HIGHEST RUNG ANY ENTRY OF THIS COPY REALLY HAS. Criterion B32.
   *
   * It is the longest of the parts' own tops, and it is where *more* stops for the whole copy. The
   * page draws it and disables the press there, so a person is never offered a level that nothing
   * in front of them is written at. Null when the copy carries no entries at all.
   */
  top: Rung | null
}

// ============================================================================ the readers

/**
 * WHAT ANSWERS EACH PART. ONE ENTRY PER PART, AND THE TYPE MAKES IT TOTAL.
 *
 * `satisfies Readonly<Record<ScopeName, PartReader>>` is what stops this list and the declaration
 * in `src/shared/bundles.ts` drifting apart: a part added there with no entry here does not
 * compile, and an entry here for a part that does not exist does not compile either. That is the
 * repository's own rule for one fact in two places — make a failure, not a comment saying "keep
 * these in sync".
 */
/**
 * THE FAST READINGS THIS ASSEMBLY IS MADE OF, EACH TAKEN ONCE AND HANDED TO EVERY PART THAT WANTS IT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THEY ARE HERE AND NOT IN THE PARTS
 * ---------------------------------------------------------------------------------------------
 *
 * The copy uses the routes that give context fast, as a decision on problem 7 settled.
 * Criterion B20 of `design/bundle/ACCEPTANCE.md`: the copy is assembled FROM the readings the
 * fast context routes answer out of, not from a second walk of the corpus.
 *
 * Only the open-loop reading was shared before this. Measured on 7 September 2026 over a
 * `recover_project` copy of their own corpus: `readForks` ran twice — once for what is waiting on a
 * person and once for what has been decided — `contradictionsFor` ran twice, once for the unfixed
 * problems and once for the checks, and the pipeline list was read twice, once by the subject and
 * once by the campaign. Six readings for three questions.
 *
 * IT IS NOT ONLY A SAVING. Two calls to one reader can disagree if anything is written between
 * them, and then one copy says a fork is waiting and says on the next line that it was decided.
 *
 * EACH THUNK RECORDS WHICH PARTS ASKED IT, and the copy says so in its own text. A part that went
 * round the shared reading would not appear in that list, so the claim the copy makes about how it
 * was assembled is checkable rather than asserted.
 */
interface PartContext {
  ask: ContinuationAsk
  anchor: PanelRecord | null
  /** The messages the reader may not read, from `everyMessageHiddenFrom`. Empty for a reader who reads all. */
  hidden: ReadonlySet<string>
  /**
   * THE OPEN-LOOP READING, TAKEN ONCE PER ASSEMBLY.
   *
   * Two parts are two projections of this one reading — what is still open, and what has already
   * been tried — and calling the reader twice would walk the whole link graph twice for one
   * question. It would also let the two disagree if anything were written between the calls.
   */
  loops: (forPart: ScopeName) => OpenLoops
  /** THE FORK READING, TAKEN ONCE. What is waiting on a person and what has been decided. */
  forks: (forPart: ScopeName) => ReturnType<typeof readForks>
  /** THE PROJECT-AGAINST-ITSELF READING, TAKEN ONCE. The unfixed problems and the checks. */
  contradictions: (forPart: ScopeName) => ReturnType<typeof contradictionsFor>
  /** THE PIPELINES OF THIS PROJECT, READ ONCE. The subject counts them; the campaign draws them. */
  pipelines: (forPart: ScopeName) => PanelRecord[]
}

/** One reading this assembly took, and every part that drew on it. */
export interface AssembledFrom {
  /** The function called, spelled as a person would go and find it. */
  reader: string
  /** The parts that asked for it. A reader with one part is not shared and says so by its length. */
  forParts: ScopeName[]
}

/** What one part's reader hands back before anything is fitted to a size. */
interface Reading {
  /** What this part says answered it, as shown in the copy. */
  reader: string | null
  members: PartMember[]
  /** How many the reader found, when that is not the number of members. */
  considered?: number
  /** The part's own sentence about what it found. The cut clause is added after fitting. */
  says: string
  why?: WhyNothing
  figures?: Record<string, number>
  /** Members whose lines are about a record but do not carry that record's own words. */
  namesOnly?: boolean
  /**
   * WHAT THE READER ITSELF SUBTRACTED, in the reader's own sentences.
   *
   * This is not the same thing as what the BUDGET cut, which `says` reports. `openLoopsFor` decides
   * that a finished task, a settled fork or a record beyond the reach is not an open loop, and it
   * writes the sentence for each. A bundle that re-worded those would be a second account of one
   * subtraction.
   */
  leftOut?: BundleLeftOut[]
}

type PartReader = (context: PartContext) => Reading

const READERS = {
  // ------------------------------------------------------------------ what this is about
  objective: ({ anchor, pipelines }) => {
    if (anchor !== null) {
      const rest = anchor.summary === null || anchor.summary === '' ? [] : [`    ${anchor.summary}`]
      return {
        reader: 'getRecord (src/server/lib/records/reading.ts)',
        members: [aRecordEntry(anchor, `the record this copy is about, ${stateMeaning(anchor)}`, rest)],
        says: 'This copy is about one record, and it is the record above.',
      }
    }
    const all = pipelines('objective')
    return {
      reader: 'listRecords (src/server/lib/records/reading.ts)',
      members: [],
      considered: all.length,
      says:
        'This copy is about the whole project, not one record. ' +
        `The project holds ${String(all.length)} sequence(s) of work; the part below called “` +
        SCOPES.campaign.label + '” shows what it is working through now.',
      why: 'none-in-scope',
    }
  },

  // ------------------------------------------------------------------ the campaign
  //
  // HOW MANY STEPS A PIPELINE HAS IS READ OFF THE PIPELINE, and it used to be counted through
  // links of kind `block`. There are no such links: a pipeline's steps are the ids in its own
  // `data.blockIds`, so the count was always nought and every bundle printed "0 of 0 step(s) done"
  // for every pipeline — measured on 6 September 2026 against two pipelines holding 16 and 6
  // blocks. Problem `xxpYGbmxEDiW`. `readOnePipelinesBlocks` is the reader the pipeline page uses,
  // through `readPipelineBlocks` in shared/blocks.ts, so this part and that page cannot disagree
  // about how far a pipeline has got.
  //
  // A COPY ABOUT ONE PIPELINE IS ABOUT THAT PIPELINE. Asked about a whole project this part carries
  // every sequence of work; asked about one pipeline it carries that one, so the number in a scoped
  // copy, the number in a whole-project copy and the number the cold-start reading gives are one
  // number about one pipeline. Criterion B4 of design/bundle/ACCEPTANCE.md.
  campaign: ({ ask, anchor, pipelines }) => {
    const all = anchor !== null && anchor.kind === 'pipeline' ? [anchor] : pipelines('campaign')
    // Every link in the project, once, and then one reading per pipeline off the same rows.
    const rows = all.length === 0 ? [] : blockLinkRowsIn(ask.workspaceId)
    const members = all.map((one) => {
      const reading = readOnePipelinesBlocks(one, ask.workspaceId, rows)
      const done = reading.blocks.filter((step) => step.state === 'done').length
      // A PIPELINE NOBODY HAS BROKEN DOWN IS NOT A PIPELINE WITH NOUGHT STEPS DONE. "0 of 0" claims
      // somebody wrote the steps down and finished none of them. The home panel already draws that
      // distinction — see `readPipelines` in src/web/lib/attention.ts — and it makes no difference
      // there whether the pipeline stores an empty order or no order at all, so it makes none here.
      const meansHere =
        reading.storedIds === 0
          ? COPY_SAYS.noSteps
          : reading.blocks.length === 0
            ? `none of the ${String(reading.storedIds)} step(s) it lists could be read`
            : `${String(done)} of ${String(reading.blocks.length)} step(s) done`
      const whole: string[] = []
      // WHAT THE READING COULD NOT READ, rather than a total that quietly excludes it. An id in the
      // stored order naming nothing, a deleted block or a record that is not a block is a fact
      // about the archive, and a count that leaves it out without saying so is a shorter pipeline.
      if (reading.problems.length > 0 && reading.blocks.length > 0) {
        whole.push(
          `    ${String(reading.problems.length)} of the ${String(reading.storedIds)} steps this pipeline lists ` +
            'could not be read, so they are not in the count above. The pipeline\'s own page says what is wrong ' +
            'with each.',
        )
      }
      if (one.summary !== null && one.summary !== '') whole.push(`    ${one.summary}`)
      return aRecordEntry(one, meansHere, whole)
    })
    return {
      reader: 'listRecords (src/server/lib/records/reading.ts) and readOnePipelinesBlocks (src/server/lib/blocks.ts)',
      members,
      says:
        members.length === 0
          ? 'No sequence of work is filed in this project, so nothing here says what it is working through.'
          : anchor !== null && anchor.kind === 'pipeline'
            ? 'This copy is about one sequence of work, and this is how far through it is.'
            : `${String(members.length)} sequence(s) of work are filed here, each with how far through it is.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ where the work stopped
  howItStands: ({ ask }) => {
    const stops = listRecords({ workspaceId: ask.workspaceId, kind: 'stopping_point' })
    stops.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    const members = stops.map((one) => {
      const data = one.data as Record<string, unknown>
      const whole: string[] = []
      for (const key of ['doing', 'failed', 'remains', 'next'] as const) {
        const said = data[key]
        if (typeof said === 'string' && said !== '') whole.push(`    ${WHAT_A_STOP_SAYS[key]}: ${said}`)
      }
      return aRecordEntry(one, `last written ${one.updatedAt}`, whole)
    })
    return {
      reader: 'listRecords (src/server/lib/records/reading.ts)',
      members,
      says:
        members.length === 0
          ? 'No account of where work stopped is written down in this project. Mole Office looked, so this is an absence in the records, not a failed check.'
          : `${String(members.length)} account(s) of where work stopped, newest first.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ what is still open
  openLoops: ({ ask, loops: read }) => {
    const loops = read('openLoops')
    // THE ORDER THE BRIEF PUTS THEM IN, from the reader the brief is made of. Criterion B20 and a
    // decision both hold that the copy uses the readings the fast context routes are made of.
    // Until this, `GET /api/brief` and a copy of the same project put the same open work in two
    // different orders — the attention rule's, and last-changed first — and neither said which.
    // Membership and trimming are still `openLoopsFor`'s; this only reorders what it carried.
    if (ask.ranking === undefined) {
      throw new Error(
        'The open loops were asked for with no attention reading to order them by. The caller works it out ' +
          'first, with theReadingOpenWorkIsRankedBy, and hands it in as `ranking`.',
      )
    }
    const ranked = rankOpenWork(loops, ask.ranking)
    const members = ranked.map((loop) => {
      // THE STATE AND WHOSE MOVE IT IS ARE WHAT THIS LOOP MEANS HERE, and they used to sit two lines
      // below the head — which is rung 7, so a copy at any shorter position lost both. Criterion
      // B18: a reference carries what it means here at the position it identifies the thing.
      const meansHere =
        (loop.state === null ? COPY_SAYS.noState : readerWord(loop.state, 'normal', loop.kind).text) +
        (loop.whoseMove === null ? '' : `, next move by: ${loop.whoseMove}`) +
        (loop.onlyAPersonCanSettle === true ? ', only a person can settle this' : '')
      const whole: string[] = []
      // THE TWO MARKS THE READER ALREADY COMPUTED AND THE OLD RENDERER THREW AWAY. Fifteen of the
      // owner's thirty-eight open loops are marked *only a person can settle this* and an outside
      // agent handed the old text could not tell which fifteen.
      if (loop.modules.length > 0) whole.push(`    linked to: ${loop.modules.join(', ')}`)
      whole.push(`    last changed ${loop.lastChanged}`)
      // WHY IT IS WHERE IT IS IN THE LIST, in the ranking reader's own sentence. A list in an order
      // nobody explains is a list a reader has to guess at.
      whole.push(`    ${loop.ranking}`)
      return aRecordEntry({ id: loop.id, kind: loop.kind, title: loop.says }, meansHere, whole)
    })
    return {
      reader: 'openLoopsFor (src/server/lib/openloops.ts)',
      members,
      considered: loops.counts.candidates,
      leftOut: leftOutOf(loops),
      figures: {
        candidates: loops.counts.candidates,
        onlyAPersonCanSettle: loops.loops.filter((l) => l.onlyAPersonCanSettle === true).length,
        theAttentionRulePicked: ranked.filter((one) => one.rank !== null).length,
      },
      says:
        members.length === 0
          ? 'Nothing is open in this scope. Mole Office looked; this is not an unanswered question.'
          : `${String(members.length)} of ${String(loops.counts.candidates)} unfinished thing(s) in this scope, ` +
            `${String(loops.loops.filter((l) => l.onlyAPersonCanSettle === true).length)} of which only a person can settle. ` +
            `They are in the order the attention rule puts them in, which is the order ` +
            `an arriving agent is given; ${String(ranked.filter((one) => one.rank !== null).length)} of them ` +
            'were picked by that rule and the rest keep the order they were last changed in. ' +
            'What is under “' + SCOPES.nextActions.label + '” and what was subtracted are said in their own places.',
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ what was already tried
  //
  // ONE READING, TWO PROJECTIONS, AND THAT IS THE WHOLE OF WHY THIS IS NOT A SECOND READER.
  // `openLoopsFor` reads `problem.attempts[].do_not_repeat` and hands the lines back on every loop.
  // The part above prints what is OPEN; this one prints what has already been TRIED. Until today
  // they were the same branch of the renderer, so asking for one printed the other.
  whatWasTried: ({ loops: read }) => {
    const loops = read('whatWasTried')
    const withAttempts = loops.loops.filter((loop) => (loop.attempts ?? 0) > 0 || (loop.doNotRepeat ?? []).length > 0)
    const members = withAttempts.map((loop) => {
      const whole: string[] = []
      for (const dont of loop.doNotRepeat ?? []) whole.push(`    do not repeat: ${dont}`)
      return aRecordEntry(
        { id: loop.id, kind: loop.kind, title: loop.says },
        `${String(loop.attempts ?? 0)} attempt(s) recorded, ` +
          `${String((loop.doNotRepeat ?? []).length)} of them says what must not be repeated`,
        whole,
      )
    })
    return {
      reader: 'openLoopsFor (src/server/lib/openloops.ts)',
      members,
      considered: loops.loops.length,
      says:
        members.length === 0
          ? 'No attempt is recorded against anything open in this scope. This says what is written down, not what was done.'
          : `${String(members.length)} of ${String(loops.loops.length)} open thing(s) carry a record of what was already tried.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ what is linked to this
  importantContext: ({ anchor, hidden }) => {
    if (anchor === null) {
      return {
        reader: null,
        members: [],
        says:
          'This part is about what is linked to one record, and this copy is about the whole project. ' +
          'Mole Office did not answer it here rather than answering a different question.',
        why: 'about-one-record',
      }
    }
    const seen = new Set<string>()
    const members: PartMember[] = []
    for (const link of resolveLinks(anchor.id)) {
      const other = link.other
      if (other.id === anchor.id || seen.has(other.id) || hidden.has(other.id)) continue
      seen.add(other.id)
      const full = getRecord(other.id)
      if (full === null) continue
      const whole: string[] = []
      if (full.summary !== null && full.summary !== '') whole.push(`    ${full.summary}`)
      // WHAT THE LINK SAYS IS WHAT THIS RECORD MEANS HERE. The part is *what is linked to this*, so
      // the relationship is the meaning, and it was not printed at all before. Criterion B18.
      members.push(aRecordEntry(full, `${relationWord(link.type).text}, ${stateMeaning(full)}`, whole))
    }
    return {
      reader: 'resolveLinks (src/server/lib/records/link-readers.ts)',
      members,
      says:
        members.length === 0
          ? 'Nothing is linked to this record. Mole Office looked.'
          : `${String(members.length)} record(s) are one link from this one.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ the plan
  plan: () => {
    const plans = listPlans({ state: 'open' })
    const members = plans.map((summary) => {
      const head = `${summary.plan.title} — ${String(summary.lines)} line(s), ${String(summary.filedAsWork)} filed as work`
      const whole = [head]
      for (const line of linesOf(summary.plan.id)) {
        const text = line.text.trim()
        if (text === '') continue
        whole.push(`    ${text}${line.recordId === null ? '' : ` [filed as ${line.recordId}]`}`)
      }
      return anEntry(null, [head], whole)
    })
    return {
      reader: 'listPlans (src/server/lib/plans.ts) and linesOf (src/server/db/lines-of.ts)',
      members,
      figures: { plans: plans.length, lines: plans.reduce((sum, one) => sum + one.lines, 0) },
      says:
        members.length === 0
          ? 'No plan is open. Mole Office looked at every plan; none of them is open.'
          : `${String(members.length)} open plan(s), ${String(plans.reduce((sum, one) => sum + one.lines, 0))} line(s) between them. ` +
            'A plan belongs to the person and not to a project, so these are every open plan.',
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ the work to do
  work: ({ ask }) => {
    const list = readWorkList(MAX_WORK_ROWS)
    const mine = list.rows.filter((row) => row.workspaceId === ask.workspaceId)
    const members = mine.map((row) => {
      const above = row.above.map((step) => step.title).join(' › ')
      const whole: string[] = []
      if (row.summary !== null && row.summary !== '') whole.push(`    ${row.summary}`)
      const meansHere =
        (row.state === null ? COPY_SAYS.noState : readerWord(row.state, 'normal', row.kind).text) +
        (above === '' ? ', part of nothing above it' : `, part of ${above}`)
      return aRecordEntry({ id: row.id, kind: row.kind, title: row.name }, meansHere, whole)
    })
    return {
      reader: 'readWorkList (src/server/lib/worklist.ts)',
      members,
      figures: { inThisProject: mine.length, everywhere: list.counted },
      says:
        members.length === 0
          ? 'No work is filed in this project. That is an answer rather than an empty list.'
          : `${String(mine.length)} piece(s) of work in this project, of ${String(list.counted)} in every project.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ the schedule
  // EACH PERIOD'S HOURS ARE THE PLANNING PAGE'S OWN NUMBER, and the three are never added together
  // (problem RaTua9l60bM3). A period's total is `loadOf` with the period's containment reading, the
  // same call GET /api/planning/<horizon>/<period> makes, so a piece of work and a part of it planned
  // in one week cost the week once. The hours of today are also inside this week and this month, so
  // a sum across the three counted one hour up to three times.
  schedule: () => {
    const when = new Date()
    const members: PartMember[] = []
    const figures: Record<string, number> = {}
    for (const horizon of GRAINS) {
      const period = periodKey(horizon, when)
      const rows = allocationsIn(horizon, period)
      const entries = withWork(rows)
      const capacity = capacityOf(horizon, period)
      const load = loadOf(horizon, period, rows, hoursCountedTwiceIn(horizon, period))
      figures[`hoursPlanned.${horizon}`] = load.plannedHours
      const unstated = load.allocations - load.stated
      const head =
        `${WHEN[horizon]}, ${period} — ${String(entries.length)} thing(s), ${String(load.plannedHours)} hour(s) planned` +
        (unstated === 0 ? '' : ` (${String(unstated)} of them do not say how long)`) +
        (load.plannedHours === load.rowHours
          ? ''
          : ` (the rows add up to ${String(load.rowHours)}, because a piece of work planned together with its parts costs the period once)`) +
        (capacity === null ? ', and the hours available are not set' : `, of ${String(capacity.hours)} available`)
      const whole = [head]
      for (const entry of entries) {
        const hours = entry.allocation.plannedHours
        whole.push(
          `    ${entry.work?.name ?? entry.allocation.recordId} — ` +
            (hours === null ? 'no number of hours given' : `${String(hours)} hour(s)`),
        )
      }
      members.push(anEntry(null, [head], whole))
    }
    return {
      reader: 'the planned hours for today, this week and this month',
      members,
      figures,
      says:
        'Today, this week and this month, each with its own hours. They are not added together, because ' +
        "today's hours are also inside this week and this month.",
    }
  },

  // ------------------------------------------------------------------ what is waiting on a person
  //
  // THE PART THE OWNER'S BRIEF IS ABOUT. Everything their §13 lists is here: the id, the short title,
  // the question, the options, the recommendation, what it is holding up, the evidence already
  // written on it, and whether something has replaced it or asked it twice.
  waitingOnYou: ({ ask, forks: read }) => {
    const forks = read('waitingOnYou')
    // BOTH LISTS ARE NARROWED TO THIS PROJECT. `readForks` says in its own comment that it reads by
    // kind ACROSS PROJECTS, so a count taken off it whole would be about other people's work.
    const here = forks.open.filter((fork) => fork.workspaceId === ask.workspaceId)
    const left = forks.leftTheQueue.filter((one) => one.workspaceId === ask.workspaceId)
    const holdingWorkUp = here.filter((fork) => fork.blocks.length > 0).length
    const members = here.map((fork) => {
      // THE HEAD LINE USED TO BE `<id> — <title>`, WHICH IS TWO OF THEIR FOUR WORDS. It carried no
      // kind and nothing saying what the fork means, and the id came first, so a reader scanning
      // the list read twelve characters of nothing before every title. Criterion B18.
      const whole: string[] = []
      if (fork.question !== null) whole.push(`    it asks: ${fork.question}`)
      for (const option of optionsOf(fork.fields)) whole.push(`    one answer: ${option}`)
      const said = textOf(fork.fields['recommendation'])
      whole.push(said === null ? '    no recommendation written' : `    ${COPY_SAYS.recommended(said)}`)
      const used = textOf(fork.fields['resultWillBeUsedTo'])
      if (used !== null) whole.push(`    the answer will be used to: ${used}`)
      if (fork.blocks.length === 0) whole.push('    it is holding nothing up')
      else for (const one of fork.blocks) whole.push(`    it is holding up: ${one.title} (${readerWord(one.kind).text})`)
      const evidence = listOf(fork.fields['evidence'])
      if (evidence.length === 0) whole.push('    nothing observed was written down beside it')
      else for (const one of evidence) whole.push(`    already observed: ${one}`)
      for (const unreadable of fork.unreadable) whole.push(`    could not be read: ${unreadable}`)
      return aRecordEntry(
        { id: fork.recordId, kind: 'proposal', title: fork.title },
        fork.blocks.length === 0
          ? 'only you can settle it, and it is holding nothing up'
          : `only you can settle it, and it is holding up ${String(fork.blocks.length)} thing(s)`,
        whole,
      )
    })
    return {
      reader: 'readForks (src/server/lib/forks.ts)',
      members,
      figures: { holdingWorkUp, leftTheQueue: left.length },
      says: waitingSentence(here.length, holdingWorkUp),
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
      // ---- WHETHER SOMETHING HAS REPLACED A FORK OR ASKED IT TWICE, which their brief asks for.
      //
      // IT IS NOT A FIELD ON THE ITEMS ABOVE, and the reader is why. `readForks` takes a fork that
      // something supersedes, or that is a duplicate of another, OUT of `open` and puts it in
      // `leftTheQueue` — `src/server/lib/forks.ts:609-626`. So no item in the list above can carry
      // that state; the state is the reason an item is not in the list. Asking each open fork for it
      // would be a branch that can never run, which is what this used to be.
      //
      // So the ones that left are named here, with the sentence `readForks` wrote for each. They are
      // not members: they are not waiting on anybody, and counting them among what is waiting is the
      // number this part exists to keep honest.
      ...(left.length === 0
        ? {}
        : {
            leftOut: [
              {
                bucket: 'left_the_queue',
                count: left.length,
                says:
                  // THE COUNT IS NOT RESTATED HERE. Both places that draw a left-out group print
                  // the count beside the sentence — `- 3: …` in the text, a bold number on the
                  // page — so a sentence that opened with it read "3: 3 questions left…".
                  'question(s) left this queue without being answered, because something replaced them or ' +
                  'asked the same thing twice: ' +
                  left.map((one) => `${one.proposalId} — ${one.proposalTitle}: ${one.sentence}`).join(' | '),
              },
            ],
          }),
    }
  },

  // ------------------------------------------------------------------ what has been decided
  decisions: ({ ask, forks: read }) => {
    const decided = read('decisions').decisions.filter((one) => one.workspaceId === ask.workspaceId)
    const members = decided.map((one) => {
      const whole: string[] = []
      if (one.question !== null) whole.push(`    it answered: ${one.question}`)
      if (one.optionTaken !== null) whole.push(`    what was taken: ${one.optionTaken}`)
      return aRecordEntry(
        { id: one.recordId, kind: 'decision', title: one.title },
        one.decidedOn === null ? 'nobody recorded the day it was decided' : `decided ${one.decidedOn}`,
        whole,
      )
    })
    return {
      reader: 'readForks (src/server/lib/forks.ts)',
      members,
      says:
        members.length === 0
          ? 'Nothing has been decided in this project yet. Mole Office looked; the list is empty rather than unread.'
          : `${String(members.length)} decision(s) a person has made here, newest first.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ problems that are not fixed
  problems: ({ contradictions: read }) => {
    const reading = read('problems')
    const members = reading.problems.map((one) =>
      aRecordEntry(
        { id: one.id, kind: 'problem', title: one.title },
        one.state === null ? COPY_SAYS.noState : readerWord(one.state, 'normal', 'problem').text,
      ),
    )
    return {
      reader: 'contradictionsFor (src/server/lib/contradictions.ts)',
      members,
      figures: { ofProblems: reading.ofProblems },
      says:
        members.length === 0
          ? 'No problem here is unfixed. Mole Office read every problem in this project and every one of them is fixed.'
          : `${String(members.length)} of ${String(reading.ofProblems)} problem(s) filed here are not fixed, with each state read from the record.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ findings
  findings: ({ ask }) => {
    const kinds = KIND_FAMILIES.findings.kinds
    const found: PanelRecord[] = []
    for (const kind of kinds) found.push(...listRecords({ workspaceId: ask.workspaceId, kind }))
    found.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    const members = found.map((one) => {
      const whole: string[] = []
      if (one.summary !== null && one.summary !== '') whole.push(`    ${one.summary}`)
      return aRecordEntry(one, `${stateMeaning(one)}, last written ${one.updatedAt}`, whole)
    })
    return {
      reader: 'listRecords (src/server/lib/records/reading.ts)',
      members,
      says:
        members.length === 0
          ? 'Nothing has been filed here as a finding. Mole Office looked at every kind the product calls one.'
          : `${String(members.length)} finding(s), newest first.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ reports
  reports: ({ ask }) => {
    const found = listRecords({ workspaceId: ask.workspaceId, kind: 'report' })
    found.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    const members = found.map((one) => aRecordEntry(one, `last written ${one.updatedAt}`))
    return {
      reader: 'listRecords (src/server/lib/records/reading.ts)',
      members,
      says:
        members.length === 0
          ? 'No report has been filed here. Mole Office looked.'
          : `${String(members.length)} report(s), newest first, by name — the writing itself is in the records.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ who is working on what
  workDomains: ({ ask }) => {
    const open = openDomainsIn(ask.workspaceId)
    const members = open.map((one) => {
      const whole: string[] = []
      if (one.objective !== '') whole.push(`    it is for: ${one.objective}`)
      whole.push(
        `    last sign of work: ${one.lastSign.at === null ? 'none, and it is still open' : `${one.lastSign.at}, from ${one.lastSign.from}`}`,
      )
      return aRecordEntry(
        { id: one.id, kind: 'work_domain', title: one.title },
        one.agentId === '' ? 'claimed, with no agent named' : `claimed by ${one.agentId}`,
        whole,
      )
    })
    return {
      reader: 'openDomainsIn (src/server/lib/workdomain.ts)',
      members,
      says:
        members.length === 0
          ? 'No piece of this project is claimed. Mole Office looked; no work domain here is open.'
          : `${String(members.length)} piece(s) of this project are claimed, each with the agent named on it and its last sign of work.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ an agent's mail
  messages: ({ ask, anchor }) => {
    const handle = ask.agentHandle ?? (anchor !== null && anchor.kind === 'agent' ? handleOf(anchor) : null)
    if (handle === null || handle === '') {
      return {
        reader: null,
        members: [],
        says:
          'This part is one agent’s mail, and the request named no agent. Mole Office did not pick one, ' +
          'since the wrong agent’s inbox would be handed over as this one’s.',
        why: 'no-agent-named',
      }
    }
    const who = agentByHandle(handle, ask.workspaceId)
    if (who === null) {
      return {
        reader: 'agentByHandle (src/server/lib/inbox.ts)',
        members: [],
        says: `No agent in this project has ever answered to “${handle}”, so there is no inbox to read.`,
        why: 'none-in-scope',
      }
    }
    // ANOTHER AGENT'S INBOX IS REFUSED, and the copy with it, in the inbox door's words.
    if (ask.reader !== undefined && !mayReadTheInboxOf(ask.reader, who.id)) throw new PanelError(onlyItsOwnInbox(handle), 403)
    const reading = inboxOf(who, ask.workspaceId)
    const members = reading.messages.map((one) => {
      const head = `${one.threadTitle} — ${one.wroteAt}, from ${one.wroteBy}`
      return anEntry(null, [head], [head, `    ${one.body}`])
    })
    return {
      reader: 'inboxOf (src/server/lib/inbox.ts)',
      members,
      says: reading.says,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ the limits
  //
  // THE ONE PART THE BUDGET MAY NOT CUT. Its members are drawn whole at every size, and if that
  // puts the whole reading over the ceiling the reading says it did not fit rather than dropping a
  // limit to make the number come out right.
  validityLimits: () => ({
    reader: 'restrictionsInScope (src/server/lib/restrictions.ts)',
    members: [],
    says: 'placeholder; the limits are read once over everything the other parts carried',
  }),

  // ------------------------------------------------------------------ everything unresolved here
  //
  // NOT A NARROWER READING OF `validityLimits`. That part asks what limits reach the things this
  // copy carries; this one asks what is unresolved in the project at all, which is what somebody
  // picking the project up needs and which no copy's scope can answer. Two questions, two readers.
  placeholders: ({ ask }) => {
    const reply = restrictionsInThisProject(ask.workspaceId)
    const members = reply.found.map((one) => {
      // THE KIND IS READ FROM THE ONE TABLE, not decided here. This line used to hold its own
      // two-word table — "a placeholder" for one kind and "a method that ran instead" for anything
      // else — which is the same fact worked out in two places: KIND_WORDS already says what each
      // of these is called, and a change there would have left this line saying the old word with
      // nothing failing. The ternary was also a fall-through, so a third restriction kind would
      // have been drawn as the second one.
      const whole: string[] = []
      for (const claim of one.disallowedClaims) whole.push(`    it may not support: ${claim}`)
      for (const target of one.about) whole.push(`    it is about: ${target.title}`)
      return aRecordEntry(
        { id: one.restrictionId, kind: one.kind, title: one.title },
        `${one.answered ? 'answered' : 'nothing has answered it'}, reaching ${String(one.reaches)} record(s)`,
        whole,
      )
    })
    return {
      reader: 'restrictionsInThisProject (src/server/lib/restrictions.ts)',
      members,
      // NAMES AND NOT CONTENT: the limit itself is printed, and the records it reaches are named
      // rather than carried, so an export does not claim it handed over what it only pointed at.
      namesOnly: true,
      figures: { unanswered: reply.found.filter((one) => !one.answered).length },
      says:
        members.length === 0
          ? 'Nothing in this project is unresolved on purpose. Mole Office read every placeholder and every substituted method filed here; there are none.'
          : `${String(members.length)} thing(s) in this project stand unresolved on purpose, ` +
            `${String(reply.found.filter((one) => !one.answered).length)} of which nothing has answered.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ what changed
  recentChanges: ({ ask, hidden }) => {
    const rows = listChanges({ workspaceId: ask.workspaceId, limit: RECENT_CHANGES, hidden: [...hidden] })
    const members = rows.map((row) => {
      // WHAT THE WRITE WAS AND WHO MADE IT, both read rather than printed out of the columns.
      // This line said `unlink on record …, by human:owner` — two stored words in one sentence a
      // person reads on the bundles page before they hand the text over. `changeVerb` is the
      // browser's own reading of a change row and now lives in src/shared/words.ts so this can
      // call it; a copy of it here would be the drift it was moved to prevent.
      //
      // AND IT PRINTED THE RECORD'S ID WITH NOTHING BESIDE IT — `created on record KcJeflFV0Yot` —
      // eighteen times in a copy of their own project, measured 6 September 2026. That is their own
      // counter-example, `93 records finished (id1, id2, id3...)`, in a part criterion B13 did not
      // reach. The row names a record, so it is a reference and carries all four. Criterion B18.
      const record = getRecord(row.recordId)
      const meansHere = `${changeVerb(row)} ${row.at}, by ${actorTypeWord(row.actorType).text} ${row.actorId}`
      const head =
        record === null
          ? referenceLine({
              recordId: row.recordId,
              kind: null,
              // A RECORD THAT IS GONE IS NAMED AS GONE. Printing its id alone would be the bare id
              // again; claiming a title nobody can read would be worse.
              title: `a record that is no longer here, id ${row.recordId}`,
              meansHere,
            })
          : referenceLine({ recordId: record.id, kind: record.kind, title: record.title, meansHere })
      return anEntry(null, [head], [head])
    })
    return {
      reader: 'listChanges (src/server/lib/records/change-log.ts)',
      members,
      // NAMES AND NOT CONTENT. A change row says a record was written; it does not carry what the
      // record says. Counting these as carried records would let an export claim it handed over
      // content it never printed.
      namesOnly: true,
      says:
        members.length === 0
          ? 'Nothing has been written in this project. The change log is empty rather than unread.'
          : `The newest ${String(members.length)} row(s) of the change log, each naming what was written and which person or agent wrote it.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ how this record was rewritten
  revisions: ({ anchor }) => {
    if (anchor === null) {
      return {
        reader: null,
        members: [],
        says:
          'This part is the history of one record, and this copy is about the whole project. What changed across ' +
          'the project is the part called “' + SCOPES.recentChanges.label + '”.',
        why: 'about-one-record',
      }
    }
    const listing = listRevisions(anchor.id)
    const members = listing.revisions.map((one) => {
      // Read, for the same reason the change rows above are: `by human:owner` is the stored word.
      const head =
        `version ${String(one.seq)} — ${one.at}, by ${actorTypeWord(one.who.actorType).text} ${one.who.actorId}`
      return anEntry(null, [head], [head])
    })
    return {
      reader: 'listRevisions (src/server/lib/revisions.ts)',
      members,
      namesOnly: true,
      says:
        members.length === 0
          ? 'This record has no stored history. Mole Office looked in the revision ledger and found none.'
          : `${String(members.length)} version(s) of this record, newest first.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ modules and pipelines
  //
  // A PERSON MAY NAME WHICH ONES. This part carried every module and every pipeline and there was
  // no way to say *these two*, which is the thirteenth name on their own list in register section 9
  // and the one that was not built. Criterion B6 of design/bundle/ACCEPTANCE.md.
  //
  // WHAT IS LEFT OUT IS SAID, AND BY KIND. A part that carried two of eighteen and said nothing
  // would read to a stranger as a project with two subsystems.
  structure: ({ ask, pipelines }) => {
    const all = [...listRecords({ workspaceId: ask.workspaceId, kind: 'module' }), ...pipelines('structure')]
    const chosen = ask.modulesAndPipelines
    const found = chosen === undefined ? all : all.filter((one) => chosen.includes(one.id))
    const members = found.map((one) => {
      const whole: string[] = []
      if (one.summary !== null && one.summary !== '') whole.push(`    ${one.summary}`)
      return aRecordEntry(one, `${stateMeaning(one)}, last written ${one.updatedAt}`, whole)
    })
    const droppedModules = all.filter((one) => one.kind === 'module' && !found.includes(one)).length
    const droppedPipelines = all.filter((one) => one.kind === 'pipeline' && !found.includes(one)).length
    return {
      reader: 'listRecords (src/server/lib/records/reading.ts)',
      members,
      considered: all.length,
      // WHAT THE READER ITSELF SUBTRACTED, in its own sentence, which is not the budget's cut. Rule
      // B14: one account of one cut, and each account says which of the two made it.
      ...(droppedModules + droppedPipelines === 0
        ? {}
        : {
            leftOut: [
              {
                bucket: 'not_chosen',
                count: droppedModules + droppedPipelines,
                says:
                  `module(s) and pipeline(s) of this project are not in this copy because the request named which ones ` +
                  `to carry: ${String(droppedModules)} module(s) and ${String(droppedPipelines)} pipeline(s) were ` +
                  'left out. The size of the copy had nothing to do with it.',
              },
            ],
          }),
      says:
        members.length === 0 && all.length === 0
          ? 'This project has no modules and no pipelines. Mole Office looked.'
          : chosen === undefined
            ? `${String(members.length)} module(s) and pipeline(s) this project is made of.`
            : `${String(members.length)} of this project's ${String(all.length)} module(s) and pipeline(s), ` +
              'the ones the request named.',
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ the code it is said to live in
  implementationMap: ({ ask, anchor }) => {
    if (anchor === null) {
      return {
        reader: null,
        members: [],
        says:
          'This part is the code stated for one record, and this copy is about the whole project. Mole Office left ' +
          'it empty rather than answer a wider question that was not asked.',
        why: 'about-one-record',
      }
    }
    const stated = statedFor(anchor.id, ask.workspaceId)
    const members = stated.map((one) => {
      const head = `${one.repositoryId} ${one.pattern} — ${relationWord(one.relation).text}, ${AUTHORITY_SAYS[one.authority].word}`
      const whole = [head]
      if (one.note !== null && one.note !== '') whole.push(`    ${one.note}`)
      return anEntry(null, [head], whole)
    })
    return {
      reader: 'statedFor (src/server/db/stated-for.ts)',
      members,
      namesOnly: true,
      says:
        members.length === 0
          ? 'No code is stated for this record. Mole Office looked in the map; the record is not in it.'
          : `${String(members.length)} place(s) in the code stated to be this record.`,
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ where Mole Office contradicts itself
  contradictions: ({ contradictions: read }) => {
    const checks = read('contradictions').checks
    const members = checks.map((check) => {
      const verdict =
        check.passed === null
          ? `could not be run — ${check.couldNotRun ?? 'no reason was recorded'}`
          : check.passed
            ? 'agreed'
            : `disagreed: ${String(check.leftN)} against ${String(check.rightN)}`
      return anEntry(null, [`${check.says} — ${verdict}`], [`${check.says} — ${verdict}`])
    })
    const failed = checks.filter((c) => c.passed === false).length
    const unrun = checks.filter((c) => c.passed === null).length
    return {
      reader: 'contradictionsFor (src/server/lib/contradictions.ts)',
      members,
      namesOnly: true,
      figures: { failed, couldNotRun: unrun },
      says:
        `${String(checks.length)} check(s) of this project against itself: ${String(failed)} disagreed and ` +
        `${String(unrun)} could not be run, which is not the same as passing.`,
    }
  },

  // ------------------------------------------------------------------ the records somebody named
  //
  // HOW DETAILED A COPY IS AND WHAT IT CONTAINS ARE TWO QUESTIONS. By a decision, the detail ladder
  // does not replace choosing the content. A copy's subject was the whole
  // project or exactly one record, so a person who wanted the project AND two particular records
  // could not ask for it. Criterion B8 of design/bundle/ACCEPTANCE.md.
  //
  // THE IDS ARE CHECKED BEFORE THIS RUNS, in `resolveBundle`, which refuses a name that answers to
  // nothing in this project — so a reader here may take them as real, the same way `structure` may.
  additionalRecords: ({ ask }) => {
    const chosen = ask.additionalRecords ?? []
    const found = chosen.map((id) => getRecord(id)).filter((one): one is PanelRecord => one !== null)
    const members = found.map((one) => {
      const whole: string[] = []
      if (one.summary !== null && one.summary !== '') whole.push(`    ${one.summary}`)
      return aRecordEntry(one, `${COPY_SAYS.addedByName}, ${stateMeaning(one)}`, whole)
    })
    return {
      reader: 'getRecord (src/server/lib/records/reading.ts)',
      members,
      considered: chosen.length,
      says:
        members.length === 0
          ? 'No record was named to add to this copy. This part carries only the records a request names, so ' +
            'empty means none was named, not that nothing was found.'
          : `${String(members.length)} record(s) named by hand, on top of what the subject of this copy ` +
            'already carries. They were chosen, not found by a reader.',
      ...(members.length === 0 ? { why: 'none-in-scope' as const } : {}),
    }
  },

  // ------------------------------------------------------------------ what to do next
  //
  // NOTHING IN MOLE OFFICE COMPUTES THIS, and this part exists so that asking for it gets that answer
  // instead of a plausible list somebody would act on. `src/server/api/bootstrap.ts` reached the
  // same conclusion about its own `next` section and gave it the same word.
  nextActions: () => ({
    reader: null,
    members: [],
    says:
      'Nothing in Mole Office works out what to do next, and no next action is written down. It would be worked ' +
      'out from three parts, each available on its own: what is open, what is waiting on a person and what is ' +
      'scheduled.',
    why: 'nothing-computes-it' as const,
  }),
} as const satisfies Readonly<Record<ScopeName, PartReader>>

/**
 * WHAT THE OPEN-LOOP READER SUBTRACTED, WITH WHAT IT WAS.
 *
 * The sentence and the ids are the reader's own. The last group is the one this file adds, because
 * `openLoopsFor` counts records outside its population and does not write a sentence for them.
 */
function leftOutOf(loops: OpenLoops): BundleLeftOut[] {
  const out: BundleLeftOut[] = loops.leftOut.map((group) => ({
    bucket: group.bucket,
    count: group.count,
    // THE SENTENCE IS THE READER'S OWN AND IS NOT REWORDED. The ids used to be appended to it in
    // brackets, with nothing beside them; they go on their own field now and the renderer names
    // them. Problem `F2NxzxAnRkb2`, criterion B13. The reader hands over REFERENCES rather than ids
    // now, so nothing downstream has to look a title up to print one — criterion B18.
    says: group.sentence,
    ...(group.ids.length === 0 ? {} : { ids: group.ids, meansHere: group.sentence }),
  }))
  if (loops.counts.outsideThePopulation > 0) {
    out.push({
      bucket: 'not_an_open_loop',
      count: loops.counts.outsideThePopulation,
      says:
        'records in this project are of kinds that are not open loops at all — modules, reports, sessions and ' +
        'the rest. They were never candidates for this list.',
    })
  }
  return out
}

/** The three horizons in a person's words. Plain, because 'day' on a line is not a date. */
const WHEN: Record<(typeof GRAINS)[number], string> = { month: 'This month', week: 'This week', day: 'Today' }

/** What each field of a stopping point is, in words a stranger reads. */
const WHAT_A_STOP_SAYS = {
  doing: 'what they were doing',
  failed: 'what failed',
  remains: 'what remains',
  next: 'what they would do next',
} as const

/** How many rows of the change log one reading carries. Declared once, and the reply says it. */
export const RECENT_CHANGES = 20

// ============================================================================ the assembly

/**
 * Assemble a reading. IT WRITES NOTHING.
 *
 * The parts are asked in the order given, each gets an equal share of the budget, and the limits
 * are read once at the end over everything the parts carried.
 */
export function assembleContinuation(ask: ContinuationAsk): Continuation {
  const anchor = ask.subject.kind === 'record' ? getRecord(ask.subject.recordId) : null

  // ---- 0. THE FAST READINGS, EACH TAKEN AT MOST ONCE, WITH WHO ASKED FOR EACH ONE RECORDED.
  //
  // Criterion B20. See `PartContext` above for what was measured before this existed.
  const assembledFrom: AssembledFrom[] = []
  const once = <T>(reader: string, read: () => T): ((forPart: ScopeName) => T) => {
    let held: { value: T } | null = null
    return (forPart) => {
      const already = assembledFrom.find((one) => one.reader === reader)
      if (already === undefined) assembledFrom.push({ reader, forParts: [forPart] })
      else if (!already.forParts.includes(forPart)) already.forParts.push(forPart)
      held ??= { value: read() }
      return held.value
    }
  }
  const context: PartContext = {
    ask,
    anchor,
    hidden: new Set(ask.reader === undefined ? [] : everyMessageHiddenFrom(ask.reader, ask.workspaceId)),
    loops: once('openLoopsFor (src/server/lib/openloops.ts)', () =>
      openLoopsFor({
        workspaceId: ask.workspaceId,
        anchorId: ask.subject.kind === 'record' ? ask.subject.recordId : null,
        ...(ask.reach === undefined ? {} : { reach: ask.reach }),
        budgetBytes: ask.budgetBytes,
        ...(ask.reader === undefined ? {} : { reader: ask.reader }),
      }),
    ),
    forks: once('readForks (src/server/lib/forks.ts)', () => readForks()),
    contradictions: once('contradictionsFor (src/server/lib/contradictions.ts)', () =>
      contradictionsFor(ask.workspaceId),
    ),
    pipelines: once('listRecords (src/server/lib/records/reading.ts)', () =>
      listRecords({ workspaceId: ask.workspaceId, kind: 'pipeline' }),
    ),
  }

  // ---- 1. every part's reader runs, at full length, before anything is fitted.
  const readings = ask.parts.map((name) => ({ name, reading: (READERS[name] as PartReader)(context) }))

  // ---- 2. every record the readers FOUND, in the order the parts found them, before any cut.
  //
  // IT IS NOT WHAT THE TEXT ENDS UP NAMING and the name says so. The limits below are read over
  // this wider set, so a limit reaching a record the budget later drops is still printed. What the
  // text names is worked out after the cut, at step 7, and that is what an export records.
  const found: string[] = []
  for (const { reading } of readings) {
    if (reading.namesOnly === true) continue
    for (const member of reading.members) {
      if (member.recordId !== null && !found.includes(member.recordId)) found.push(member.recordId)
    }
  }

  // ---- 3. the limits, read once, over everything the readers found.
  //
  // TWO CALLS TO THE SAME READER, AND EACH ANSWERS A DIFFERENT QUESTION. `restrictionsInScope`
  // answers *which limits are in this scope* — for a record subject it also walks everything the
  // subject contains, which is more than this text carries. `restrictionsReaching` answers *which
  // record does each limit reach*, and it is the only reader that answers that; the flattened one
  // discards the mapping, which is why `bundle.ts` used to guess it back.
  const reading =
    found.length === 0 && ask.subject.kind === 'project'
      ? { found: [] as RestrictionReading[], couldNotCheck: restrictionsReaching([], ask.workspaceId).couldNotCheck }
      : restrictionsInScope({
          workspaceId: ask.workspaceId,
          ...(ask.subject.kind === 'record' ? { scopeRecordId: ask.subject.recordId } : {}),
          recordIds: found,
        })
  const inScope = new Set(found)
  const couldNotCheckInScope = reading.couldNotCheck.filter((one) => [...inScope].some((id) => one.what.includes(id)))
  const standingGaps = reading.couldNotCheck.filter((one) => !couldNotCheckInScope.includes(one))
  const byRecord =
    found.length === 0 ? new Map<string, RestrictionReading[]>() : restrictionsReaching(found, ask.workspaceId).found
  for (const id of found) if (!byRecord.has(id)) byRecord.set(id, [])

  // ---- 4. rule 1: a limit rides inside the entry of the record it reaches, at every position.
  //
  // EVERY POSITION, WHICH IS WHAT MAKES IT A RULE RATHER THAN A HABIT. A copy asked for the
  // shortest level must still say that what it is carrying rests on a temporary value, so the lines
  // go on whatever rungs this entry has and on every rung filled after this.
  for (const { reading: one } of readings) {
    for (const member of one.members) {
      if (member.recordId === null) continue
      const lines = inlineLimits(byRecord.get(member.recordId) ?? [])
      if (lines.length === 0) continue
      for (const rung of BUNDLE_RUNGS) {
        const held = member.atRung[rung]
        if (held !== undefined) member.atRung[rung] = [...held, ...lines]
      }
      member.limits = lines
    }
  }

  // ---- 4b. THE POSITIONS THE READERS COULD NOT WRITE, filled from the record itself.
  //
  // A reader writes rung 2 and, beside it and not as a rung, what this part has to say. Rung 3 is
  // the record's own summary column, rungs 4 and 5 are its children and rung 6 is its children at a
  // hundred and twenty words — all facts about the RECORD rather than about the part, so they are
  // filled once, here, and every part gets them the same way.
  fillTheLadder(readings, ask)

  // ---- 5. the limits part is filled from the same read, once, and is never cut.
  for (const { name, reading: one } of readings) {
    if (name !== 'validityLimits') continue
    const distinct = distinctLimits(reading.found)
    one.members = distinct.map((limit) => anEntry(null, limitBlock(limit), limitBlock(limit)))
    one.namesOnly = true
    one.says =
      distinct.length === 0
        ? 'Nothing here is limited by a placeholder and nothing here ran a different method from the one it names. ' +
          'Mole Office looked and found neither in this scope. That is a checked absence, not an unchecked one.'
        : `${String(distinct.length)} limit(s) reach what this text carries, and every one of them is printed whole ` +
          'here and again beside the record it is about. None of them may be dropped to save room.'
    if (standingGaps.length > 0) {
      const gaps = [
        '',
        'WHAT WAS NOT LOOKED AT, said so that a clean answer above is not read as more than it is:',
        ...standingGaps.map((gap) => `  - ${gap.what}: ${gap.because}`),
      ]
      one.members.push(anEntry(null, gaps, gaps))
    }
  }

  // ---- 6. rule 2 and rule 4: a declared share each, spent by the part that was given it.
  const detail = ask.detail ?? BUNDLE_RUNG_WHEN_NOBODY_SAYS
  const equal = ask.parts.length === 0 ? 0 : Math.floor(ask.budgetBytes / ask.parts.length)
  // A POSITION SOMEBODY PICKED IS HONOURED; a position nobody picked is shaped by the shares.
  // Criterion B25. `ask.detail` is absent exactly when nobody said, which is why the flag is read
  // off the ask rather than passed beside it: two ways of saying one thing would drift.
  const picked = ask.detail !== undefined
  const parts = readings.map(({ name, reading: one }) =>
    fitOnePart(name, one, ask.shares?.get(name) ?? equal, detail, picked, ask.shift ?? 0),
  )

  // ---- 7. what the text names, after the cut. This is what an export may claim it handed over.
  const inTheText: string[] = []
  for (const part of parts) {
    for (const id of part.recordIds) if (!inTheText.includes(id)) inTheText.push(id)
  }

  // ---- 8. HOW MANY ENTRIES WERE DRAWN SHORTER THAN ASKED, counted over the whole copy.
  //
  // It is the sentence at the top of the text. A reader who asked for each record's children and
  // got a title has to be told that, and told how often, or the copy quietly answers a question
  // nobody asked. That is their rule of 6 September 2026.
  const shorterAt: Partial<Record<Rung, number>> = {}
  let shorter = 0
  let entries = 0
  for (const part of parts) {
    entries += part.carried
    shorter += part.drawnShorter.count
    for (const [rung, n] of Object.entries(part.drawnShorter.at)) {
      shorterAt[rung as Rung] = (shorterAt[rung as Rung] ?? 0) + n
    }
  }

  return {
    subject: ask.subject,
    anchor,
    parts,
    restrictions: distinctLimits(reading.found),
    byRecord,
    couldNotCheckInScope,
    standingGaps,
    carried: inTheText,
    budgetBytes: ask.budgetBytes,
    assembledFrom,
    detail,
    drawnShorter: { count: shorter, ofEntries: entries, at: shorterAt },
    // WHERE THE LADDER STOPS FOR THIS COPY: the longest top any part has. Criterion B32.
    top: longestOf(parts.map((part) => part.top).filter((rung): rung is Rung => rung !== null)),
  }
}

/**
 * FILL THE POSITIONS A PART'S READER COULD NOT WRITE, from the record each entry is about.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN EACH READER
 * ---------------------------------------------------------------------------------------
 *
 * Rung 3 is the record's own summary column, rungs 4 and 5 are the record's children, and rung 6 is
 * its children at a hundred and twenty words each. All four are facts about the RECORD, and there
 * are twenty-four readers. Written per reader they would be twenty-four chances to disagree about
 * what a record's conclusion is; written here they are one.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY RUNG CARRIES WHAT THE ONE BELOW IT CARRIES. CRITERION B32.
 * ---------------------------------------------------------------------------------------
 *
 * Each rung above the title is built from the rung below it, so a longer position can never say
 * less than a shorter one. It could before, and problem `AQZm6esnQqCr` is the measurement: on their
 * corpus one part came to 3,398 bytes at Level 2, 6,088 at the Conclusion and 4,577 at Full, so one
 * press of *less* took the whole copy from 14,382 characters to 15,954. Two separate faults made
 * that number, and both are fixed here:
 *
 *   1. THE CONCLUSION WAS PRINTED TWICE where the identifying line already carried it. The open-loop
 *      reader names a problem by its own summary, so the head line WAS the summary and rung 3 wrote
 *      it again underneath. Rung 7 had a guard against exactly this and rung 3 had none. There is
 *      one guard now and both directions read it.
 *   2. RUNG 7 WAS WHAT THE PART'S READER WROTE, which is not the record and is not a rung. It is
 *      `wrote` on the entry now, it is drawn from rung 3 up, and the copy no longer goes to rung 7
 *      at all. That is criterion B32.
 *
 * ---------------------------------------------------------------------------------------
 * THE CHILDREN ARE READ ONLY WHEN SOMEBODY ASKED FOR THEM
 * ---------------------------------------------------------------------------------------
 *
 * Rungs 4, 5 and 6 cost a link walk or a pipeline reading per entry. A copy asked for Level 2 or
 * the Conclusion can never fall back on to any of them, so they are not read at all. That is an
 * honest saving rather than a guess: nothing about the answer changes.
 */
function fillTheLadder(
  readings: readonly { name: ScopeName; reading: Reading }[],
  ask: ContinuationAsk,
): void {
  const asked = ask.detail ?? BUNDLE_RUNG_WHEN_NOBODY_SAYS
  // THE THREE POSITIONS THAT COST A WALK, and the two that can never fall back on to one.
  const wantsChildren = asked === 'outline' || asked === 'sketch' || asked === 'digest'
  // ONE READ OF THE PROJECT'S BLOCK LINKS FOR THE LOT, rather than one per pipeline entry.
  let blockLinks: readonly BlockLinkRow[] | null = null
  for (const { name, reading: one } of readings) {
    if (one.namesOnly === true) continue
    for (const member of one.members) {
      const identifies = member.atRung.title ?? []
      const limits = member.limits ?? []
      const record = member.recordId === null ? null : getRecord(member.recordId)
      // Rung 3: the record's own summary column, which IS the third position of the ladder.
      // `rungsFor` is what says whether this record has one, so this file holds no second opinion.
      //
      // THE ONE GUARD. A reader may name a record by its own summary — the open-loop reader does —
      // and then the identifying line already IS the Conclusion. Printing it again underneath made
      // rung 3 longer than rung 7, and is half of problem `AQZm6esnQqCr`.
      const conclusion =
        record !== null &&
        rungsFor(sourceOf(record)).includes('gist') &&
        record.summary !== null &&
        record.summary !== ''
          ? record.summary
          : null
      const alreadySaid =
        conclusion !== null && [...identifies, ...member.wrote].some((line) => line.includes(conclusion))
      // RUNG 3 EXISTS WHEN THERE IS ANYTHING TO SAY ABOVE THE IDENTIFYING LINE, and what the part
      // wrote counts. Criterion B32.
      //
      // MEASURED 8 September 2026: the governance part's forks, the ranking sentence on every open
      // loop and a stopping point's four lines are all written by the PART about records that have
      // no summary of their own. Keying rung 3 on the summary alone left those entries with a title
      // and nothing else, so a copy at its own top rung carried less than the same copy did
      // yesterday at Full. Level 2 is still a line each, which is what the shortest position means.
      if (conclusion !== null || member.wrote.length > 0) {
        member.atRung.gist = [
          ...identifies,
          ...member.wrote,
          ...(conclusion === null || alreadySaid ? [] : [`    ${conclusion}`]),
          ...limits,
        ]
      }
      if (!wantsChildren || record === null) continue
      blockLinks ??= blockLinkRowsIn(ask.workspaceId)
      // A CHOICE ABOUT WHICH RECORDS GO IN REACHES THE CHILDREN TOO.
      //
      // Criterion B6 lets a person name which modules and pipelines a copy carries, and a module
      // that is `part_of` a chosen one would otherwise arrive under it as a child — so the copy
      // would carry, by name, a module somebody had taken out. Measured 7 September 2026 on
      // `tests/the-bundles-page-offers-the-three-choices.test.ts`, which unticks one and reads the
      // copy at its top rung. `structure` is the only part with a choice of its own; every other
      // part's children are its members' children and nobody excluded any of them.
      const chosen = ask.modulesAndPipelines
      const children = childrenOf(record, ask.workspaceId, blockLinks).filter(
        (child) =>
          name !== 'structure' ||
          chosen === undefined ||
          child.recordId === null ||
          chosen.includes(child.recordId),
      )
      // AN ATOMIC RECORD GETS NONE OF THEM: it has no level 4 to 6. Nothing is written and the
      // entry falls back to the shorter position it does have.
      if (children.length === 0) continue
      // A CHILD IS A REFERENCE TOO. Rung 4 is one line per child, rung 5 is that line with the
      // child's conclusion under it, and all of them used to print the child's title alone — so a
      // copy at either position named records a reader could not go and find. Criterion B18. A child
      // that is not a record — a part of a report — carries no id and says nothing where one would be.
      const childLine = (child: AChild): string =>
        `    ${referenceLine({
          recordId: child.recordId,
          kind: child.kind,
          title: child.title,
          meansHere: null,
        })}`
      /** A child's line with one of its own texts under it, or the sentence saying nobody wrote one. */
      const childAnd = (child: AChild, text: string | null): string[] => [
        childLine(child),
        text === null ? '        not written at that length' : `        ${text}`,
      ]
      // EVERY RUNG STARTS FROM THE ONE BELOW IT. Criterion B32: a longer position can never say less
      // than a shorter one.
      const above = member.atRung.gist ?? [...identifies, ...limits]
      member.atRung.outline = [...above, ...children.map(childLine)]
      member.atRung.sketch = [...above, ...children.flatMap((child) => childAnd(child, child.conclusion))]
      // RUNG 6 EXISTS ONLY WHERE SOMEBODY WROTE THE CHILDREN AT THAT LENGTH, which today is a
      // report's own parts and nothing else. `atLength` is null for a module's child and for a
      // pipeline's block, so those records have no rung 6 and a copy of them stops at rung 5. That
      // is criterion B32's own sentence: a rung nobody wrote is not the one below dressed as a
      // higher level.
      if (children.some((child) => child.atLength !== null)) {
        member.atRung.digest = [...above, ...children.flatMap((child) => childAnd(child, child.atLength))]
      }
    }
  }
}

/**
 * WHAT `rungsFor` NEEDS TO KNOW ABOUT A RECORD, from the record.
 *
 * `ownWords` IS LEFT OUT ON PURPOSE, and its own declaration says what that means: nobody counted,
 * so no rung is taken away for length. A bundle entry is not the record's own page and does not
 * measure the record's body.
 */
function sourceOf(record: PanelRecord): DetailSource {
  return {
    title: record.title,
    summary: record.summary,
    shortForms: (record.data as { shortForms?: unknown } | null)?.shortForms,
    declaresShortForms: false,
  }
}

/**
 * FIT ONE PART INTO ITS SHARE, AND SAY IN ONE SENTENCE WHAT THAT COST.
 *
 * ---------------------------------------------------------------------------------------
 * ONE ACCOUNT OF ONE CUT, AND IT SAYS WHICH OF THE TWO MADE IT
 * ---------------------------------------------------------------------------------------
 *
 * Two things shorten a part and they are different facts. The READER decides that a finished task
 * or a module nobody chose is not in this list, and writes its own sentence for each — that is
 * `leftOut`, and this function never rewords it. The SIZE decides that what is left will not fit,
 * and this sentence is that account. Criterion B14 of `design/bundle/ACCEPTANCE.md`.
 *
 * ---------------------------------------------------------------------------------------
 * THE LADDER IS WALKED DOWN, AND A DROPPED RECORD IS NAMED
 * ---------------------------------------------------------------------------------------
 *
 * The part is drawn at the position asked for. If that does not fit, every entry steps down one
 * position and it is tried again, down to Level 2, which is a title each. Only when a title each
 * does not fit are entries dropped, and then the ones dropped are NAMED — their title, with their
 * id beside it, for as many as the room allows, and a count for the rest.
 *
 * IT USED TO PRINT A BARE ID FOR EVERY DROPPED RECORD, and that is problem `F2NxzxAnRkb2`: a copy
 * at 4,096 characters was 21,702 characters long and 49.7% of it was record ids naming records the
 * reader had nothing else about. Register section 7 names the same failure: a count followed by bare
 * ids, as in `93 records finished (id1, id2, id3...)`. Criterion B13.
 */
function fitOnePart(
  name: ScopeName,
  reading: Reading,
  share: number,
  asked: Rung,
  picked: boolean,
  shift: number,
): AssembledPart {
  const spec = SCOPES[name]
  const allRecordIds = reading.members.map((m) => m.recordId).filter((id): id is string => id !== null)
  const allReferences = reading.members
    .map((m) => m.reference)
    .filter((one): one is Reference => one !== undefined)
  const ids = reading.namesOnly === true ? [] : allRecordIds
  // THE HIGHEST RUNG ANY ENTRY OF THIS PART REALLY HAS, worked out from the entries and from
  // nothing else. Criterion B32: this is where *more* stops, and it is asked of the top of the
  // ladder rather than of the position somebody wanted, so the answer does not move when they press.
  const topOfTheLadder = BUNDLE_RUNGS[BUNDLE_RUNGS.length - 1] as Rung
  const top =
    reading.members.length === 0
      ? null
      : (longestOf(reading.members.map((m) => drawnAt(m, topOfTheLadder))) ?? topOfTheLadder)
  const base: Omit<
    AssembledPart,
    'lines' | 'says' | 'carried' | 'recordIds' | 'bytes' | 'drew' | 'drawnShorter' | 'tookMoreRoom'
  > = {
    name,
    label: spec.label,
    reader: reading.reader,
    answered: reading.reader !== null,
    ...(reading.why === undefined ? {} : { why: reading.why }),
    considered: reading.considered ?? reading.members.length,
    allRecordIds,
    allReferences,
    share,
    figures: reading.figures ?? {},
    leftOut: reading.leftOut ?? [],
    top,
  }
  const nothingFellBack = { count: 0, at: {} as Partial<Record<Rung, number>> }

  if (reading.members.length === 0) {
    return {
      ...base,
      lines: [reading.says],
      says: reading.says,
      carried: 0,
      recordIds: [],
      bytes: sizeOf([reading.says]),
      drew: null,
      drawnShorter: nothingFellBack,
      tookMoreRoom: false,
    }
  }

  // THE LIMITS ARE EXEMPT, and the exemption is here rather than in a caller so that nothing can
  // reach this function and cut them by asking differently. They are drawn whole at every position,
  // because a limit shortened is a limit a reader can miss.
  //
  // A LIMIT'S ENTRY IS ONE BLOCK AND THAT BLOCK IS ITS RUNG 2. `anEntry` is called with the same
  // lines for the identifying rung and for what the part wrote, so drawing it whole IS drawing it
  // at rung 2, and that is the rung this says. It used to say Full, which is no longer a position a
  // copy has at all. Criterion B32.
  if (name === 'validityLimits') {
    const lines = [reading.says, ...reading.members.flatMap((m) => m.atRung.title ?? [])]
    return {
      ...base,
      lines,
      says: reading.says,
      carried: reading.members.length,
      recordIds: ids,
      bytes: sizeOf(lines),
      drew: 'title',
      drawnShorter: nothingFellBack,
      tookMoreRoom: sizeOf(lines) > share,
    }
  }

  // ---- THE POSITION EVERY ENTRY LANDS ON, before the size is consulted at all.
  //
  // An entry asked for a position it has not got lands on the nearest shorter one it has. That is
  // their rule and it is not the budget's doing, so it is counted separately from what the size cuts.
  //
  // IT IS COUNTED OVER THE ENTRIES THIS PART ACTUALLY CARRIES, which is what makes the count and
  // the total at the top of the copy about the same set. Counting it over what the reader found
  // and reporting it beside a total of what was carried gave `99 of 108` on the owner's own copy —
  // two numbers about two different populations in one sentence. Criterion B11.
  const drawnShorter = fellBackAmong(reading.members, asked)

  // ---- A POSITION SOMEBODY PICKED TAKES THE ROOM IT NEEDS, AND THE PART SAYS HOW MUCH.
  //
  // Criterion B25, on what a first try of the page measured.
  // The ladder walk below is what shortens a part to fit its share, and it is right when nobody
  // said how detailed the copy should be. When somebody picked a position, the position is the
  // answer and the share is not: shortening it answers a question they did not ask, and the
  // sentence saying so is one line in a copy of twenty-five thousand characters.
  //
  // NOTHING IS DROPPED EITHER. A part that drops entries to fit a share it was told to ignore would
  // be the same substitution in a different place.
  if (picked) {
    const lines = [reading.says, ...reading.members.flatMap((m) => m.atRung[drawnAt(m, asked)] ?? [])]
    const spentHere = sizeOf(lines)
    const over =
      spentHere <= share
        ? reading.says
        : `${reading.says} Drawn at ${levelLabel(asked)}, which is what was asked for. It needs ` +
          `${String(spentHere)} bytes and this part's share of the size is ${String(share)}, so the copy is ` +
          'that much larger. Nothing was left out to make it fit.'
    return {
      ...base,
      lines: [over, ...lines.slice(1)],
      says: over,
      carried: reading.members.length,
      recordIds: ids,
      bytes: sizeOf([over, ...lines.slice(1)]),
      drew: longestOf(reading.members.map((m) => drawnAt(m, asked))),
      drawnShorter,
      tookMoreRoom: spentHere > share,
    }
  }

  // ---- WALK DOWN THE LADDER UNTIL IT FITS. THIS IS THE AUTOMATIC LEVEL, AND IT IS PER PART.
  //
  // Criterion B30: the copy's automatic default already chooses a level for each part, from the
  // share of the size that part was given. `asked` first, then one position shorter, and so on to
  // Level 2. An entry already below the position being tried stays where it is: stepping it further
  // would be shortening it twice.
  //
  // WHAT THIS LOOP NOW DOES IS FIND A LEVEL, and drawing at it happens after. Before criterion B31
  // it returned from inside the loop, which is the same thing when nobody moves the level; a person
  // pressing less or more moves it, and then the level has to exist as a value before it is drawn.
  const from = BUNDLE_RUNGS.indexOf(asked)
  const startAt = from === -1 ? BUNDLE_RUNGS.length - 1 : from
  const drawnAtCeiling = (member: PartMember, ceiling: Rung): Rung => {
    const own = drawnAt(member, asked)
    return positionOf(own) <= positionOf(ceiling) ? own : drawnAt(member, ceiling)
  }
  const linesAt = (ceiling: Rung, says: string): string[] => [
    says,
    ...reading.members.flatMap((m) => m.atRung[drawnAtCeiling(m, ceiling)] ?? []),
  ]
  /** The longest level whose lines fit this part's share, or null when even a title each is over. */
  let automatic: Rung | null = null
  for (let i = startAt; i >= 0; i--) {
    const ceiling = BUNDLE_RUNGS[i] as Rung
    if (sizeOf(linesAt(ceiling, reading.says)) <= share) {
      automatic = ceiling
      break
    }
  }

  // ---- AND THEN THE PERSON'S OFFSET, WHICH IS THE ONLY LEVEL CONTROL THERE IS.
  //
  // Criterion B31, settling decision `JPDu6lJcizw0`: the size asked for shapes the automatic
  // base, and the offset is the person's. `shift` is how many rungs from that base, negative for
  // less and positive for more, and it is clamped to the ladder rather than refused: a person
  // pressing less on a part already at Level 2 has asked for something that does not exist, and the
  // honest answer is the shortest there is rather than an error about a part they did not name.
  //
  // A PART OVER ITS SHARE TAKES THE ROOM AND SAYS SO, which is criterion B25's rule reaching the
  // case B31 makes ordinary: a level the person moved to is a level they asked for.
  if (automatic !== null || shift > 0) {
    const ceiling = automatic ?? (BUNDLE_RUNGS[0] as Rung)
    // WHAT THE ENTRIES ACTUALLY LANDED ON AT THE AUTOMATIC BASE. An entry with nothing written at a
    // level is drawn at the longest shorter one it has, so the ceiling and the level are two
    // different facts.
    const drawnAutomatically = longestOf(reading.members.map((m) => drawnAtCeiling(m, ceiling)))
    // ---- AND A PRESS MOVES FROM WHERE THE ENTRIES ARE, NOT FROM THE CEILING. Criterion B32.
    //
    // MEASURED 8 September 2026, after the copy's ladder was topped out at level 6: the automatic
    // ceiling on the twelve-problem corpus is level 6 while the entries are all at their Conclusion,
    // because almost nothing in this product is written at levels 4 to 6. Stepping from the ceiling
    // meant the first three presses of *less* moved nothing at all — a control that is there, is
    // pressed, and does nothing. Stepping from where the entries are is one press, one rung.
    const start = drawnAutomatically ?? ceiling
    const wanted = stepBy(start, shift)
    const drawnHere = longestOf(reading.members.map((m) => drawnAtCeiling(m, wanted)))
    // THE SHARE SHORTENED THIS PART when the entries landed below the highest rung they really have.
    // It is asked of the ENTRIES and not of the ceiling: the ceiling is usually two or three rungs
    // above anything anybody wrote, so comparing ceilings said a part had been shortened when every
    // one of its entries was at its own top. Criterion B32.
    const shortenedByTheShare =
      shift === 0 && drawnAutomatically !== null && top !== null && drawnAutomatically !== top
    // A PART SAYS IT MOVED ONLY WHEN ITS ENTRIES REALLY MOVED, and the ceiling is not the entries.
    //
    // MEASURED 8 September 2026 on the twelve-problem corpus: every entry of the open-work part was
    // already at its top rung, so a press of less lowered the CEILING and moved nothing — and the
    // part still wrote *Drawn at Level 4, one level below what its share allows*. That sentence
    // across the parts took the copy from 14,682 characters to 14,740: it grew when it was asked to
    // shrink, which is problem `AQZm6esnQqCr` in its smallest form. `chose.shift` below already
    // reported the real move; this sentence did not, and now both read one rule.
    const moved = drawnHere !== null && drawnAutomatically !== null && drawnHere !== drawnAutomatically
    const plain = shortenedByTheShare
      ? `${reading.says} Drawn at ${levelLabel(drawnAutomatically as Rung)} rather than ` +
        `${levelLabel(top as Rung)} to fit the ${String(share)} bytes this part was given. All ` +
        `${String(reading.members.length)} are still here.`
      : // WHERE THIS PART LANDED, IN ONE CLAUSE, AND NOT THE WHOLE ACCOUNT AGAIN.
        //
        // MEASURED, 7 September 2026: the first version of this sentence named the level, the level
        // the share would have chosen, the share in bytes and the count of members, in every part.
        // On a copy of 14,264 characters, pressing less made it 15,902 — the copy grew by 1,638
        // when it was asked to shrink, and about 1,540 of that was this sentence repeated across
        // eleven parts. Why the levels moved is one fact about the whole copy and the head line
        // already says it once; what belongs here is which level THIS part got.
        moved
        ? `${reading.says} Drawn at ${levelLabel(drawnHere as Rung)}, ` +
          `${rungsMoved(rungsBetween(drawnAutomatically as Rung, drawnHere as Rung))} the level its share allows.`
        : reading.says
    const lines = linesAt(wanted, plain)
    const spentHere = sizeOf(lines)
    const says =
      spentHere <= share
        ? plain
        : `${plain} It needs ${String(spentHere)} bytes and this part's share of the size is ` +
          `${String(share)}, so the copy is that much larger. Nothing was left out to make it fit.`
    return {
      ...base,
      lines: [says, ...lines.slice(1)],
      says,
      carried: reading.members.length,
      recordIds: ids,
      bytes: sizeOf([says, ...lines.slice(1)]),
      drew: longestOf(reading.members.map((m) => drawnAtCeiling(m, wanted))),
      drawnShorter,
      tookMoreRoom: spentHere > share,
      // THE MOVE THAT HAPPENED, NOT THE ONE THAT WAS ASKED FOR. `stepBy` clamps at both ends of
      // the ladder, so a person pressing less on a part already at Level 2 asked for a rung that
      // does not exist. Recording what they asked for would have the page say a part moved when it
      // did not; recording the difference says what is true of this part.
      // THE LEVEL THE ENTRIES WERE REALLY DRAWN AT, never the ceiling that was asked for.
      //
      // MEASURED, 7 September 2026: with nobody naming a level, `fillTheLadder` writes rungs 4 and
      // 5 for no entry at all — it writes them only when somebody named one — so a copy moved one
      // level below Full lands every entry on the Conclusion and a cell reading Level 5 would name
      // a level nothing on the page was drawn at. What each part got is what its entries got.
      chose: {
        level: drawnHere ?? wanted,
        automatic: drawnAutomatically ?? start,
        shift: rungsBetween(drawnAutomatically ?? start, drawnHere ?? wanted),
        fits: spentHere <= share,
      },
    }
  }

  // ---- A TITLE EACH IS STILL TOO MUCH, so some entries go, and the ones that go are NAMED.
  //
  // THE ROOM FOR THE NAMES IS RESERVED BEFORE THE ENTRIES ARE FILLED IN, and it has to be, because
  // filling first leaves nothing. Measured 7 September 2026: a part given 1,024 bytes over forty
  // problems kept nine, spent 1,015 of its 1,024, and handed `nameTheDropped` nine bytes — less
  // than one name, every time, by construction. So the branch criterion B13 built to name a dropped
  // record could never run: every part over its share printed *none of the N left out is named
  // here*. Problem `tOODHtWe78qg`.
  //
  // A THIRD, AND THE NUMBER IS THE ARGUMENT `WHAT_IS_NOT_HERE_GETS` ALREADY MAKES in
  // `src/server/lib/bundle.ts`: a part that cannot carry everything says three things — its own
  // sentence, what it kept, and what it left out — and the third one is a thing to read like the
  // others. Nothing is reserved when nothing is dropped, so a part that fits is not made shorter to
  // hold room for an account of a cut that did not happen.
  const fill = (room: number): PartMember[] => {
    const kept: PartMember[] = []
    let spent = 0
    for (const member of reading.members) {
      const cost = sizeOf(member.atRung.title ?? [])
      if (spent + cost > room) break
      kept.push(member)
      spent += cost
    }
    return kept
  }
  const wholeShare = fill(share)
  const kept = wholeShare.length === reading.members.length ? wholeShare : fill(share - Math.floor(share / NAMES_GET))
  const spent = kept.reduce((sum, member) => sum + sizeOf(member.atRung.title ?? []), 0)
  const dropped = reading.members.slice(kept.length)

  // NOTHING CAN BE DROPPED, SO NOTHING IS SAID ABOUT DROPPING. A part whose own sentence plus one
  // line is already over its share cannot be made to fit by cutting anything, and a sentence
  // apologising for a cut that did not happen makes the copy LARGER than the one nobody asked to
  // shorten. The opening says the copy did not fit and by how much; that is the account, once.
  if (dropped.length === 0) {
    const lines = [reading.says, ...reading.members.flatMap((m) => m.atRung.title ?? [])]
    return {
      ...base,
      lines,
      says: reading.says,
      carried: reading.members.length,
      recordIds: ids,
      bytes: sizeOf(lines),
      drew: 'title',
      drawnShorter,
      tookMoreRoom: sizeOf(lines) > share,
      // A TITLE EACH IS THE SHORTEST THERE IS, so that is the level this part chose, and it is
      // still over its share. Saying it chose nothing would leave the page with a dash beside the
      // one part a reader most needs to understand. Criterion B30.
      chose: { level: 'title', automatic: 'title', shift: 0, fits: sizeOf(lines) <= share },
    }
  }

  const named = nameTheDropped(dropped, Math.max(0, share - spent))
  const cutSays =
    `${reading.says} This text carries ${String(kept.length)} of them at ${levelLabel('title')} and leaves out ` +
    `${String(dropped.length)}: a line each is more than the ${String(share)} bytes this part was given. ` +
    `${named.says}`
  const lines = [cutSays, ...kept.flatMap((m) => m.atRung.title ?? []), ...named.lines]
  const keptIds = reading.namesOnly === true ? [] : kept.map((m) => m.recordId).filter((id): id is string => id !== null)
  return {
    ...base,
    lines,
    says: cutSays,
    carried: kept.length,
    recordIds: keptIds,
    bytes: sizeOf(lines),
    drew: 'title',
    // OVER WHAT THIS PART KEPT. The entries the size dropped are accounted for by `cutSays`, and
    // counting them here as well would say twice that one record is not in the copy.
    drawnShorter: fellBackAmong(kept, asked),
    tookMoreRoom: false,
    // A TITLE EACH AND SOME LEFT OUT: the shortest level there is, and it fits BECAUSE entries
    // were left out. What could not be done is carrying them all, and the part's own sentence says
    // that in the middle column; `fits` is about the room and not about the cut. Criterion B30.
    chose: { level: 'title', automatic: 'title', shift: 0, fits: sizeOf(lines) <= share },
  }
}

/**
 * HOW MANY OF THESE ENTRIES LAND SHORTER THAN THE POSITION ASKED FOR, AND WHERE EACH LANDS.
 *
 * It is asked of a LIST rather than of a part, so the same arithmetic answers for what a part found
 * and for what it kept, and the copy's total is over the entries the copy carries.
 */
function fellBackAmong(
  members: readonly PartMember[],
  asked: Rung,
): { count: number; at: Partial<Record<Rung, number>> } {
  const fellBack = members.map((member) => drawnAt(member, asked)).filter((at) => at !== asked)
  return {
    count: fellBack.length,
    at: fellBack.reduce<Partial<Record<Rung, number>>>((acc, at) => {
      acc[at] = (acc[at] ?? 0) + 1
      return acc
    }, {}),
  }
}

/**
 * WHAT SHARE OF A PART'S ROOM THE NAMES OF WHAT IT DROPPED MAY SPEND, as a divisor of the whole.
 *
 * ONE THIRD, and it is the same argument `WHAT_IS_NOT_HERE_GETS` makes in
 * `src/server/lib/bundle.ts` about the copy: a shortened part says three things and the account of
 * the cut is one of them. It is reserved only when the part actually drops something.
 */
const NAMES_GET = 3

/** The longest position anything in this part reached, or null when it carries nothing. */
function longestOf(rungs: readonly Rung[]): Rung | null {
  let best: Rung | null = null
  for (const rung of rungs) if (best === null || positionOf(rung) > positionOf(best)) best = rung
  return best
}

/**
 * ONE LEVEL MOVED BY A NUMBER OF RUNGS, ALONG THE FIVE A COPY OFFERS. Criterion B31.
 *
 * CLAMPED AND NOT WRAPPED, AND NOT REFUSED EITHER. Pressing less on a copy already at its shortest
 * is a person asking for something the ladder does not have; the shortest there is is the honest
 * answer, and the page says which level each part actually got, so nobody is told a press did
 * something it did not. Wrapping would turn the shortest into the longest, which is the opposite of
 * what the press says it does.
 */
/**
 * HOW MANY RUNGS OF THE FIVE A COPY OFFERS LIE BETWEEN TWO LEVELS. Criterion B31.
 *
 * IN THE COPY'S OWN LADDER AND NOT THE PRODUCT'S SEVEN. A press is one rung of the five, so the
 * answer a person reads has to be counted in the same five, or one press would report itself as
 * four levels because two of the seven are not offered here.
 */
function rungsBetween(from: Rung, to: Rung): number {
  return BUNDLE_RUNGS.indexOf(to) - BUNDLE_RUNGS.indexOf(from)
}

function stepBy(from: Rung, shift: number): Rung {
  const at = BUNDLE_RUNGS.indexOf(from)
  const start = at === -1 ? BUNDLE_RUNGS.length - 1 : at
  const moved = Math.min(BUNDLE_RUNGS.length - 1, Math.max(0, start + shift))
  return BUNDLE_RUNGS[moved] as Rung
}



/**
 * NAME THE RECORDS THE SIZE DROPPED, NEVER BY ID ALONE. Problem `F2NxzxAnRkb2`, criterion B13.
 *
 * A record's title and its id together are a reference somebody can use. An id on its own is a name
 * for a thing the reader has nothing about, and a copy under budget used to be half of them. So the
 * names are printed for as many as the room left over allows, and the rest is a count with what
 * kind of thing they are — which is a fact, where a list of ids is not.
 */
function nameTheDropped(dropped: readonly PartMember[], room: number): { lines: string[]; says: string } {
  if (dropped.length === 0) return { lines: [], says: '' }
  const lines: string[] = []
  let spent = 0
  let named = 0
  for (const member of dropped) {
    if (member.recordId === null) continue
    const record = getRecord(member.recordId)
    if (record === null) continue
    // THE ONE SHAPE, from `src/shared/reference.ts`. `namesOf` in src/server/lib/bundle.ts wrote the
    // same line out of its own template until criterion B18; both read this now.
    const line = `    ${referenceLine(
      referenceTo(record.id, 'left out because a line each was more than this part was given'),
    )}`
    const cost = sizeOf([line])
    if (spent + cost > room) break
    lines.push(line)
    spent += cost
    named += 1
  }
  const rest = dropped.length - named
  if (named === 0) {
    return {
      lines: [],
      says:
        `None of the ${String(dropped.length)} left out is named here: there is no room even for their names. ` +
        'They are not named by id either, because an id with nothing beside it is a name for a thing you have ' +
        'nothing about.',
    }
  }
  return {
    lines: ['  What was left out, by name:', ...lines],
    says:
      rest === 0
        ? `All ${String(named)} of them are named below.`
        : `${String(named)} of them are named below and ${String(rest)} are not, because there is no room for ` +
          'more names. They are not named by id either: an id with nothing beside it is a name for a thing you ' +
          'have nothing about.',
  }
}

// ============================================================================ small readings

/**
 * THE SENTENCE ABOUT THE GOVERNANCE QUEUE, WRITTEN ONCE, FOR EVERY SURFACE THAT SAYS IT.
 *
 * ---------------------------------------------------------------------------------------
 * IT USED TO END BY TELLING THE READER TO MAKE A REQUEST
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/needs-you carries each one whole, with its question and its options.` A copy goes to a
 * window Mole Office does not run: no API, no repository, no earlier conversation. That reader cannot
 * follow the sentence, and it was not even true of the copy — the part carries each fork whole,
 * with its question, its options, what somebody would do and what it is holding up. Criterion B19
 * of `design/bundle/ACCEPTANCE.md`.
 *
 * WHAT IT SAYS NOW IS TRUE OF BOTH SURFACES THAT SAY IT. A copy names every one of them under this
 * sentence and the bootstrap reply names every one of them in `owner_waiting.references`. Where the
 * size makes a copy draw them shorter, the part's own sentence says so — `fitOnePart` writes that
 * clause — so nothing here has to guess at it.
 */
export function waitingSentence(open: number, holdingWorkUp: number): string {
  // NO FORK OPEN IS NOT NOTHING WAITING. A record whose move is the person's, an unread message or
  // a set-aside item waits on them without being a fork, so this sentence says it counts forks only.
  // IT NAMES NO REQUEST: a copy carries it to a reader with no API (criterion B19). The bootstrap
  // reply, whose reader has one, adds where the rest is.
  if (open === 0) {
    return 'No fork is open in this project. This counts forks only, not everything waiting on the person.'
  }
  return (
    `${String(open)} thing${open === 1 ? '' : 's'} only a person can do. ` +
    (holdingWorkUp === 0
      ? 'None of them is holding any work up, so none is late — they are waiting. '
      : `${String(holdingWorkUp)} of them ${holdingWorkUp === 1 ? 'is' : 'are'} holding work up. `) +
    'Every one of them is named below.'
  )
}

/** The options a fork stores, as text, in the author's own words. */
function optionsOf(fields: Record<string, unknown>): string[] {
  return listOf(fields['options'])
}

function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((one): one is string => typeof one === 'string' && one.trim() !== '')
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** The shared state reading, adapted to the word this copy prints. */
function stateOf(record: { data: unknown }): string | null {
  const state = stateOfWork(record.data)
  return typeof state === 'string' ? state : null
}

/** An agent record's handle, as stored. */
function handleOf(record: PanelRecord): string | null {
  const data = record.data as Record<string, unknown>
  return typeof data['handle'] === 'string' ? data['handle'] : null
}

function distinctLimits(found: readonly RestrictionReading[]): RestrictionReading[] {
  const seen = new Set<string>()
  const out: RestrictionReading[] = []
  for (const one of found) {
    if (seen.has(one.restrictionId)) continue
    seen.add(one.restrictionId)
    out.push(one)
  }
  return out
}

function sizeOf(lines: readonly string[]): number {
  return Buffer.byteLength(lines.join('\n'), 'utf8')
}

// ============================================================================ printing a limit

/**
 * ONE LIMIT, WHOLE, WITH ITS KIND AS A PRINTED WORD.
 *
 * THE TWO KINDS HAVE TWO SHAPES AND NEITHER BORROWS THE OTHER'S SENTENCE. A reader handed one
 * heading, one severity vocabulary and no word separating a placeholder from a method that ran
 * instead learns neither, and the placeholder's sentence printed over a substituted method would
 * be a false sentence about what happened.
 */
export function limitBlock(one: RestrictionReading): string[] {
  const lines: string[] = []
  const head = one.kind === 'placeholder' ? 'A PLACEHOLDER' : 'A METHOD THAT RAN INSTEAD'
  lines.push('')
  const standing = one.standing.state === 'resolved-unchecked' ? 'resolved-unchecked' : one.standing.state
  const resolvedAt = one.standing.state === 'active' ? null : one.standing.resolvedAt
  const drawn = drawingOf(one.severity, standing, resolvedAt)
  lines.push(`${head} — ${one.title}`)
  lines.push(`  ${drawn === null ? 'Mole Office has no reading for how bad this is; the stored words are on the record.' : drawn}`)
  if (one.kind === 'placeholder') {
    lines.push('  Nothing has been decided for this yet. What stands here is temporary.')
  } else {
    lines.push(
      '  This step did not run the method it declares. A run of the second is not evidence about the first: ' +
        'whatever this produced, it was not produced by the declared method.',
    )
    lines.push('  The method this step declares is on the block in Mole Office and is not in this text.')
  }
  if (one.holdsField !== null) lines.push(`  The temporary value is stored at: ${one.holdsField}`)
  for (const use of one.allowedUses) lines.push(`  It may be used for:    ${use}`)
  for (const claim of one.disallowedClaims) lines.push(`  It may not support:    ${claim}`)
  lines.push(`  id ${one.restrictionId}`)
  return lines
}

/**
 * THE SAME LIMIT, INLINE, BESIDE THE RECORD IT REACHES. Rule 1's second placing.
 *
 * Read once, placed twice. A reader who skips the block at the top still meets the limit at the
 * point they meet the value: a limit that arrives as a footnote is not a limit.
 */
export function inlineLimits(found: readonly RestrictionReading[]): string[] {
  return distinctLimits(found).map((one) =>
    one.kind === 'placeholder'
      ? `    LIMIT — ${one.title} is a placeholder; ${one.disallowedClaims[0] ?? 'see VALIDITY LIMITS above'} (id ${one.restrictionId})`
      : `    LIMIT — this did not run the method it declares; ${one.disallowedClaims[0] ?? 'see VALIDITY LIMITS above'} (id ${one.restrictionId})`,
  )
}

/** How bad it is and where it stands, in one sentence from the product's own table. */
function drawingOf(severity: Parameters<typeof restrictionDrawing>[0], standing: Parameters<typeof restrictionDrawing>[1], resolvedAt: string | null): string | null {
  const drawn = restrictionDrawing(severity, standing, resolvedAt)
  return drawn === null ? null : drawn.word
}

/** The parts a spec asks for, refusing rather than narrowing. One door for both callers. */
export function partsOf(spec: BundleSpec): readonly ScopeName[] {
  return slotsOf(spec)
}
