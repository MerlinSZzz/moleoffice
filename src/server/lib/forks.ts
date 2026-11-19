// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FORKS WAITING ON A PERSON, READ ONCE, ACROSS EVERY PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS AND WHY IT IS A PROJECTION RATHER THAN A RECORD READ
 * ---------------------------------------------------------------------------------------
 *
 * A fork is a `proposal`: a choice an agent filed and may not make. Settling one is refused to
 * every agent, so a fork sits until a person answers it — and it goes on sitting whichever project
 * that person happens to be reading today. That is why this reading spans projects.
 *
 * `GET /api/records/:id` does NOT span them. It is workspace-scoped and refuses a cross-project id
 * with a 404 that names the other project, and that refusal is correct and unchanged. This file is
 * the different answer to the different question: not *give me this record*, but *what is waiting
 * on me, anywhere*. `design/DECISIONS-PENDING.md` §39 settles that the second question is answered
 * by a person-level projection and never by putting a hole in the first.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIMIT, WHICH IS THE SAME LIMIT PLANNING KEEPS
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/lib/planning.ts` states it for allocations: *an allocation must never grant access to
 * unrelated records in another workspace*. The same sentence governs here, and it is kept the same
 * way — by what this file is able to ask, not by a check somebody has to remember:
 *
 *   - Every record read starts from a query by kind and by liveness, and there are two of them:
 *     `kind = proposal AND deleted_at IS NULL`, and `kind = decision AND deleted_at IS NULL`. There
 *     is no workspace clause, and there is no caller-supplied filter, id, search or page reaching
 *     any query in this file. The routes above it take no parameters at all, so there is nothing
 *     for a caller to aim. The second kind is the decisions a person has already made — see
 *     `DecidedRecord` for why a history of them belongs to the person rather than to a project.
 *   - The only other records that appear are the ones a fork itself points at with a `blocks` link.
 *     That is the fork saying what it is holding up, which is the whole reason a reader needs to
 *     know it exists — the same argument planning makes for the record an allocation names.
 *
 * So learning that a fork is open in `greenhouse` is not a way to read `greenhouse`, and there is no
 * shape of request that turns this into one.
 *
 * ---------------------------------------------------------------------------------------
 * SETTLING IS NOT HERE, AND MUST NOT COME HERE
 * ---------------------------------------------------------------------------------------
 *
 * This file only reads. A fork is settled by `POST /api/records/<the fork>/promote`, in the
 * fork's own project, which is the one route that writes a `decision` and the one place the
 * human-only guard is asked. A second way to settle a fork would be a second answer to the only
 * access control in the product.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READING, TWO SURFACES
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/needs-you` and `GET /api/forks` both answer out of `readForks()` below. They are
 * different surfaces — one is the short list an agent reads to find out what it may not do, the
 * other carries enough of each fork to settle it — and if each worked out for itself which forks
 * are open, the two could disagree about what is waiting on a person. That is the defect this
 * repository keeps finding, so there is one reading and both call it.
 */

import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { db } from '../db/client.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { links, records } from '../db/schema.ts'
import {
  LINKS_THAT_REPLACE_A_FORK,
  PROPOSAL_KIND,
  RESOLVES_PROPOSAL,
  anAgentGaveThisForkItsClassification,
  everyLinkThatSaysSomethingReplacedThisFork,
  forkIsSettled,
  getRecord,
  humanMadeThisLink,
  linkSettlesThisFork,
  newestOf,
  proposalResolution,
  whoSettlesThisFork,
  type ReplacingLink,
} from './records.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { optionCards, pickedOption } from '@shared/proposal.ts'
import { isSafety, readConsequence } from '@shared/work.ts'
import { THE_OWNER, type ForkSettler } from '@shared/kinds.ts'
import { parseStoredStamp } from '@shared/time.ts'
import type { ActorType, RecordKind } from '@shared/types.ts'
import { standsOnTheirWordsForEach, type ActOnTheirWords } from './warrants.ts'
// WHICH DECISIONS A LATER ONE REPLACED: the one reading. Problem ZSWftCSVUP2r.
import { readTheReplacements, replacedDecisionIds } from './replaced-decisions.ts'
import { decisionsNotOnThePersonsOwnWords } from './the-persons-own-words.ts'
import type { NotOnThePersonsOwnWords } from '@shared/the-persons-own-words.ts'
// A RESIDENCY PROPOSAL IS NOT A GENERIC FORK. Opens nothing.
import { isAResidencyProposal } from '@shared/residents.ts'

/**
 * WHY A FORK LEFT THE QUEUE WITHOUT BEING ANSWERED, taken from the declaration of the two exits.
 *
 * Written as one word each rather than as the link type, because the link type is machinery and
 * this is what a person is told. Derived rather than typed out again: the two words and the two
 * link types are one fact, and `LINKS_THAT_REPLACE_A_FORK` in lib/records/fork-settled.ts is where it is kept.
 */
type WhyItLeftTheQueue = (typeof LINKS_THAT_REPLACE_A_FORK)[number]['why']

/** The record at the far end of a `blocks` link, so a deleted one can be told apart from live work. */
const recordsAtEnd = alias(records, 'blocked_record')

/**
 * THE LIVE WORK ONE FORK HOLDS UP, and every link at either end of one record. Each is asked once for each fork on the
 * waiting list, so each is prepared once and kept (src/server/db/kept-statement.ts).
 */
const theLiveWorkAForkBlocks = keptStatement(() =>
  db
    .select({ id: recordsAtEnd.id, title: recordsAtEnd.title, kind: recordsAtEnd.kind })
    .from(links)
    .innerJoin(recordsAtEnd, eq(links.toId, recordsAtEnd.id))
    .where(and(eq(links.fromId, sql.placeholder('fork')), eq(links.type, 'blocks'), isNull(recordsAtEnd.deletedAt)))
    .prepare(),
)
const theLinksAtEitherEnd = keptStatement(() =>
  db
    .select({ from: links.fromId, to: links.toId })
    .from(links)
    .where(or(eq(links.fromId, sql.placeholder('record')), eq(links.toId, sql.placeholder('record'))))
    .prepare(),
)

/**
 * THE FACTS ABOUT WHETHER A FORK IS ON THE QUEUE ARE READ FROM lib/records/fork-settling.ts, NOT
 * WORKED OUT HERE.
 *
 * Six of them used to live in this file: whether a human made a link, whether a fork is the owner's,
 * whether one link takes a fork off the queue, whether a decision's link settles it, whether the fork
 * is settled, and which link took it off. The four guards in lib/records/fork-settling.ts have to ask
 * exactly those questions at the write door, and while the answers lived here they could not — so the guards asked
 * their own versions and the two drifted. An agent deleted a fork the owner had settled one request
 * earlier because the delete guard asked `proposalResolution` while the queue asked `forkIsSettled`.
 * The same fact worked out in two places is this repository's named recurring defect, and this was it
 * standing in front of the owner's queue.
 *
 * They moved to lib/records.ts on 27 August 2026, and to lib/records/fork-settling.ts on
 * 17 November 2026, beside `whoSettlesThisFork`. This file still writes every sentence a person reads;
 * it no longer works out any of the facts underneath them. `humanLinked` below stays here because it
 * is a name for one call, not a fact of its own.
 *
 * THREE ARE RE-EXPORTED because api/needs-you.ts and the tests already name this file as where they
 * live, and moving a definition is not a reason to make every caller chase it.
 */
export { forkIsSettled, humanMadeThisLink, linkSettlesThisFork }

/**
 * Did a HUMAN make the link that settles this fork? The settling link, read through the reader above.
 *
 * Kept as its own name because a settling link runs from the DECISION to the proposal, which is the
 * opposite way round from how anybody says it out loud, and callers that ask this question already
 * hold the pair rather than the link.
 */
export function humanLinked(proposalId: string, decisionId: string): boolean {
  return humanMadeThisLink(decisionId, RESOLVES_PROPOSAL, proposalId)
}

/**
 * A FORK THAT HAS BEEN SETTLED, so that settling one does not make it vanish.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS READ HERE AND NOT WORKED OUT IN THE BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * A settled fork used to be impossible to find again: it left the queue, which is
 * correct, and nothing on Home said where it went. A settled fork is not a new thing to store — it
 * is a decision record linked back to its proposal, and both already exist. What was missing was a
 * way to read the pair.
 *
 * It is answered HERE because the loop below already asks the question. `forkIsSettled` is the one
 * definition of "settled", and the queue skips a proposal precisely when it says yes. A browser that
 * re-derived the same fact from change rows would be a second answer to a governance question with
 * nothing making the two agree — this repository's recurring defect, wearing the worst possible hat.
 *
 * IT IS A READ AND NOTHING ELSE. No new write path, no new field on a proposal, no `resolved` flag:
 * the link is still the whole act, exactly as `proposalResolution` says.
 */
export interface SettledFork {
  /** The fork. Opening this is how a person re-reads what was decided and why. */
  proposalId: string
  proposalTitle: string
  /** Which project the pair lives in. Reported, never used to filter — this reading spans projects. */
  workspaceId: string
  /** The decision that settles it. The answer, as opposed to the question. */
  decisionId: string
  decisionTitle: string
  /** Who made the settling link, and when. Both are stored on the link itself. */
  settledBy: string
  /** Whether `settledBy` is a person, an agent or the office. Null when the link never recorded it. */
  settledByType: ActorType | null
  settledAt: string
  /**
   * THE ACT ON THE OWNER'S OWN WORDS THAT SETTLED IT, when that is what settled it. Null otherwise.
   *
   * An agent may settle a fork when it can quote them saying so — `design/messages/ACCEPTANCE.md` W1
   * — and W2 asks that every place saying who did the act says it was done on their words, with the
   * words. This is that half on the desk: a settled fork whose decision was filed on a warrant
   * carries it here, so the row can draw their sentence rather than only an agent's name.
   *
   * NULL IS THE ORDINARY ANSWER and it means the person settled this themselves. It is not "the warrant
   * could not be read": a settled fork the agent had no warrant for could not have been settled.
   *
   * A REVOKED ACT IS NOT HERE, because a revoked promotion retracts its decision and the fork is not
   * settled any more — it is back on the queue, and this branch is not reached for it at all.
   */
  onThePersonsWords: ActOnTheirWords | null
}

/**
 * ONE PIECE OF WORK A FORK IS HOLDING UP.
 *
 * The fork says this itself, with a `blocks` link out of it. Nothing here searches the other
 * project for work that might be related — a link is the fork naming its own consequence, and
 * naming it is the reason anybody can tell whether this fork matters today.
 */
export interface ForkBlocked {
  recordId: string
  title: string
  kind: RecordKind
}

/**
 * WHY A FORK IS WHERE IT IS IN THE QUEUE. SEVERAL FACTS, EACH SEPARATELY VISIBLE AND CHECKABLE.
 *
 * ---------------------------------------------------------------------------------------
 * NOT ONE OPAQUE NUMBER
 * ---------------------------------------------------------------------------------------
 *
 * The owner's brief: *"Do not rely on one opaque numeric weight alone."* So there is no score here.
 * Every field below is a fact somebody can check against the record, the ordering is a run of sort
 * keys over those facts, and `because` says in plain language which of them put this fork where it
 * is. A reader who disagrees with the order can see exactly which fact to argue with.
 *
 * FIVE OF THE SIX ARE COUNTED FROM THE CORPUS. Only `pinned` is stated, and only the owner may
 * state it — `assertMayPinAFork` in src/server/lib/records/the-persons-own-acts.ts.
 */
export interface ForkPriority {
  /** The owner pinned it. Their own act; `assertMayPinAFork` refuses it to everything else. */
  pinned: boolean
  /** Somebody could be physically hurt if the work this fork holds up stays undone. */
  safety: boolean
  /** How many live pieces of work this fork is holding up, from its own `blocks` links. */
  blocking: number
  /** How many other records depend on that work — one hop out from each thing it blocks. */
  reaches: number
  /**
   * The fork says only the owner may settle it: `who_settles_it` reads "the owner".
   *
   * Read through `whoSettlesThisFork` in lib/records/fork-settling.ts, which is the same reader
   * `assertMaySettleFork` asks. It is false for a fork nobody has classified, which is deliberate:
   * an unclassified fork is refused to agents but the corpus does not SAY it is a governance
   * question, and the ordering may not claim a fact nobody recorded.
   */
  governance: boolean
  /** How many days it has been waiting, from `createdAt`. */
  waitingDays: number
  /** Mole Office can tell which option to press, so this one can be settled without reading it whole. */
  namesAnOption: boolean
  /** Which of the facts above put this fork where it is, in plain words. */
  because: string
}

/** A fork waiting on a person, with enough on it to settle without asking for anything else. */
export interface OpenFork {
  recordId: string
  title: string
  /** The one line the record carries, when it has one. What the fork is about, in the author's words. */
  summary: string | null
  /** Which project the record belongs to. Reported, never used to filter this list. */
  workspaceId: string
  /** What that project is called. Null when no workspace of that id is registered. */
  workspaceTitle: string | null
  /** The question, when the record states one, so a row can be read without opening it. */
  question: string | null
  /**
   * How many options a person can actually read on this fork.
   *
   * It is the number of options stored AS TEXT, not the length of the stored list. Those are the
   * same number on every fork in this corpus and they are not the same question: a list holding
   * something that is not text would otherwise be counted as a choice on the queue and be missing
   * from the fork when somebody opened it. Where they differ, `unreadable` below says so.
   */
  options: number
  /**
   * DID SOMEBODY WRITE A RECOMMENDATION AT ALL. A non-empty `recommendation` field, and no more.
   *
   * This is the fact that tells the owner somebody THOUGHT about their fork. It says nothing about
   * whether the sentence points at one of the options, which is the other fact below.
   */
  recommendationWritten: boolean
  /**
   * CAN MOLE OFFICE TELL WHICH OPTION THE RECOMMENDATION POINTS AT. Not whether one was written.
   *
   * These are two facts and one field used to carry both, under the name `hasRecommendation`, which
   * said the first while meaning the second. Measured on the live corpus on 27 August 2026: 26 of
   * the 27 forks in the owner's queue carry a written recommendation and 2 passed this test, so 25
   * of 27 read on screen as though nobody had a view.
   *
   * BOTH FACTS ARE DRAWN AND NEITHER PRETENDS TO BE THE OTHER. This one is the one that can offer a
   * one-press settle, because it knows which option to press. `recommendationWritten` is the one
   * that tells them somebody thought about it.
   *
   * THE DISTINCTION IS KEPT, and it is worth keeping. `acsi4ZoHx6ZB` stores `recommendation: "No
   * recommendation. All three are defensible…"`, an agent explicitly declining to choose, and Home
   * badged it "a recommendation" — the one record whose agent refused to pick was the one the queue
   * made look most decided. `pickedOption` in src/shared/proposal.ts is the reading, shared with the
   * page that draws the options, because two surfaces answering this differently is how the wrong
   * badge got there. Its own argument is at src/shared/proposal.ts:49 and it stands.
   */
  namesAnOption: boolean
  /**
   * The work waiting on this fork, one entry each, named.
   *
   * THE ONE FACT THAT SAYS WHETHER THIS MATTERS TODAY, and it is counted rather than judged: a fork
   * holding nothing up is quiet, and a fork holding three things up says so. Work that has been
   * deleted is not in here — `shared/attention.ts` takes the same view, that a link whose other end
   * is deleted is a fact about the archive rather than a piece of work.
   */
  blocks: ForkBlocked[]
  /**
   * The fork's own stored fields, exactly as its author wrote them.
   *
   * This is what makes the fork settleable without a second request: the panel that settles one
   * reads the question, the options, the reasoning, what it rests on and what would reopen it out
   * of these fields, and it is handed the same object on Home that it is handed on the record page.
   * The readings above — the question, the count, whether one is picked — are worked out FROM these
   * fields, here, so that a queue row and the panel beside it cannot disagree about the same fork.
   */
  fields: Record<string, unknown>
  createdAt: string
  /**
   * Who may settle this fork and why, in words, because the reason is the point.
   *
   * It is per fork, from the fork's own `who_settles_it`. Until 27 August 2026 it was one sentence
   * on every row saying settling was refused to every agent, and that sentence became false the day
   * a fork could say an agent settles it. `whoMaySettleThisFork` below holds all five answers.
   */
  because: string
  /**
   * WHAT COULD NOT BE READ ON THIS FORK, in plain sentences. Empty when everything read.
   *
   * A projection that quietly dropped what it could not read would hand back a shorter fork that
   * looks complete, which is this repository's first rule broken in the least visible way. Anything
   * in here is drawn where the fork is drawn.
   */
  unreadable: string[]
  /**
   * SOMETHING SAYS THIS FORK WAS REPLACED AND IT IS STILL HERE. Null when nothing does.
   *
   * A `supersedes` or `duplicate_of` link an AGENT made does not take the owner's fork off their
   * queue, and that refusal is right: an agent that could would be settling the fork by another
   * door. But the link is stored, and until 3 September 2026 no surface said so. Proposal
   * `h6O_RMpeYBTD` carried one from 24 August, sat on their list for ten days, and was asked of them
   * twice — once tangled and once separated — while `leftTheQueue` stayed empty and this reading's
   * own description promised that a superseded fork stops waiting on anybody. Problem
   * `lgcrmxPcWG9h`.
   *
   * IT IS A REPORT, NOT AN EXIT. The fork is still open, still on this list and still theirs. What is
   * new is that the row says what somebody claimed and what would make it true.
   */
  replacedButStillHere: ReplacedButStillHere | null
  /**
   * AN ACT ON THE OWNER'S OWN WORDS THAT STILL STANDS ON THIS FORK, or null, which is almost always.
   *
   * An agent may classify a fork away from them, or settle one, when it can quote them saying so. The
   * row carries the act so the desk can draw their sentence beside the change rather than only the
   * agent's name — `design/messages/ACCEPTANCE.md` W2 — and so the press that takes it back is one
   * click away on the record.
   *
   * A REVOKED ACT IS NOT HERE. `standsOnTheirWords` answers only with an act nobody has taken back,
   * because a row saying *on the owner's words* about something they already undid would be worse
   * than saying nothing.
   */
  onThePersonsWords: ActOnTheirWords | null
  /** Why this fork is where it is in the queue. Several facts, never one number. See ForkPriority. */
  priority: ForkPriority
}

/** A claim that something replaced this fork, which did not take it off the queue, with why. */
export interface ReplacedButStillHere {
  /** `superseded` — something says it replaced this. `duplicate` — something says it is a repeat. */
  why: WhyItLeftTheQueue
  /** The record the claim names. */
  insteadId: string
  insteadTitle: string
  /** Who made the link, and when. Both stored on the link. */
  linkedBy: string
  /** Whether `linkedBy` is a person, an agent or the office. Null when the link never recorded it. */
  linkedByType: ActorType | null
  linkedAt: string
  /** The one sentence a person reads: what was claimed, why it did not count, what would. */
  sentence: string
}

/**
 * A DECISION A PERSON HAS MADE, in any project.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SECOND KIND IS HERE, AND WHY IT IS NOT A WIDER HOLE
 * ---------------------------------------------------------------------------------------
 *
 * `SettledFork` above answers "which fork did a person settle". This answers a different and larger
 * question: "what have I decided". They are not the same list. Five of the eight decisions in the
 * live corpus were never filed against a proposal at all — including *"Never change the GPU driver
 * on the workstation"* — so the fork reading cannot see them, and until this they appeared on no
 * Home surface.
 *
 * §39 settled the shape: *support a cross-project human governance desk through a dedicated
 * person-level projection*. A history of what you decided is the other half of that desk, and it is
 * a fact about a PERSON rather than about a project — a decision you made does not stop being yours
 * because you are reading a different project today. That is the same argument the fork list already
 * makes, applied to the same governance act after it has happened rather than before.
 *
 * THE LIMIT IS KEPT THE SAME WAY, structurally rather than by a check somebody has to remember: one
 * query, by kind and by liveness, with no caller-supplied filter, id, search or page reaching it.
 * `GET /api/records/:id` is unchanged and still refuses a cross-project id.
 */
export interface DecidedRecord {
  recordId: string
  /** What the decision is called. Mole Office writes it from the option taken when a person settles a fork. */
  title: string
  /** Which project it lives in. Reported, never used to filter — this reading spans projects. */
  workspaceId: string
  /** What that project is called. Null when no workspace of that id is registered. */
  workspaceTitle: string | null
  /** The words of what was taken, as the decision stores them. Null when it records none. */
  optionTaken: string | null
  /**
   * WHICH of the fork's options that was, counted from 0. Null when the person wrote their own.
   *
   * Null and a filled `optionTaken` together mean "none of the recorded options" — a real stored
   * answer rather than a gap. Both null mean the decision says nothing about which option it took.
   */
  optionIndex: number | null
  /** The fork this answers, when it answers one. Null for a decision nobody filed a proposal for. */
  proposalId: string | null
  /** The fork's question, when there is a fork and it states one. What the decision was about. */
  question: string | null
  /**
   * The date the person says the choice was made — the record's own `decided_on`. Null when it
   * states none, which is not the same as the day it was filed. `createdAt` is that day.
   */
  decidedOn: string | null
  createdAt: string
  /**
   * THE MARK, when this decision is in the person's name and its reference is not the person's own record; null when it
   * carries none. The Decisions page lists the marked ones; Home's card does not
   * read it. Worked out by `decisionsNotOnThePersonsOwnWords`, which a decision's own page asks too. The office always
   * sends it; a row built by hand, as a test builds one, may leave it out.
   */
  notOnThePersonsOwnWords?: NotOnThePersonsOwnWords | null
}

/**
 * A FORK THAT LEFT THE QUEUE WITHOUT ANYBODY ANSWERING IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE ARE TWO WAYS OUT BESIDE BEING SETTLED, AND WHY NEITHER MAY BE SILENT
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 27 August 2026: `MSi_zPJGt4Yh supersedes h6O_RMpeYBTD` was stored in the live corpus,
 * and `h6O_RMpeYBTD` was still item 1 of the owner's 27, because nothing in this file read a
 * `supersedes` link. Three more forks asked one question about repositories and there was no link
 * type that could say so. Both are now exits.
 *
 * A ROW THAT VANISHES IS WORSE THAN A ROW THAT STAYS. A fork the owner has looked at twice and that
 * then disappears with no account is the failure this whole projection exists to prevent, so a fork
 * that leaves this way is reported here with WHY it left and WHICH fork replaced it. Nothing is
 * deleted and nothing is stored twice: both facts are links that already exist.
 *
 * THIS IS NOT "SETTLED" AND IT IS NOT COUNTED AS ONE. Nobody decided anything. `settled` above is a
 * decision a person linked back to a fork; this is a question that stopped being asked.
 */
export interface ForkThatLeftTheQueue {
  proposalId: string
  proposalTitle: string
  /** Which project the pair lives in. Reported, never used to filter — this reading spans projects. */
  workspaceId: string
  /** `superseded` — something replaced it. `duplicate` — the same question is already being asked. */
  why: WhyItLeftTheQueue
  /** The one sentence a person reads. Plain, and it names the other record. */
  sentence: string
  /** The record that replaced it, or the one this is a duplicate of. */
  insteadId: string
  insteadTitle: string
  /** Who made the link that took it off the queue, and when. Both are stored on the link. */
  linkedBy: string
  /** Whether `linkedBy` is a person, an agent or the office. Null when the link never recorded it. */
  linkedByType: ActorType | null
  linkedAt: string
}

export interface ForksRead {
  /** Every fork still waiting on a person, in every project. */
  open: OpenFork[]
  /** The forks a person has settled, newest first. Not capped — what to show is the surface's call. */
  settled: SettledFork[]
  /**
   * Every decision a person has made, in every project, newest first. Not capped, same reason. A decision a later one
   * replaced is left out (problem ZSWftCSVUP2r); `decisionsReplaced` counts them, and each one's own page keeps it.
   */
  decisions: DecidedRecord[]
  /** How many live decisions were left out of `decisions` because a later decision replaced them. */
  decisionsReplaced: number
  /**
   * The forks that left the queue without being answered, each with why and what replaced it.
   *
   * A fork appears here OR in `open` OR in `settled`, never in two of them, and the three together
   * are every live proposal in this installation.
   */
  leftTheQueue: ForkThatLeftTheQueue[]
}

/**
 * WHO MAY SETTLE THIS FORK, IN PLAIN WORDS. ONE SENTENCE PER ANSWER, AND THE FORK PICKS ITS OWN.
 *
 * ---------------------------------------------------------------------------------------
 * IT USED TO BE ONE SENTENCE ON EVERY ROW, AND ON 27 AUGUST 2026 THAT SENTENCE BECAME FALSE
 * ---------------------------------------------------------------------------------------
 *
 * The constant it replaces was called `WHY_A_PERSON` and it read: *"Settling a fork is a governance
 * act, so Mole Office refuses it to every agent: pointing a decision at a proposal, promoting a proposal
 * into one, and deleting, restoring or moving a decision. Nobody else can do this."* It was drawn
 * on every fork in the queue.
 *
 * That is no longer what the server does, and it was wrong in two ways at once. A fork marked `an
 * agent`, `the parent` or `a measurement` is not refused to an agent at all, so the sentence was
 * simply untrue on those rows. And on the owner's own forks it gave the wrong REASON: settling is
 * not refused because it is a governance act, it is refused because THIS fork says they settle it,
 * or because nobody has said and an unclassified fork is treated as theirs.
 *
 * So the reason is now read per fork, from the same field `assertMaySettleFork` reads. One fact,
 * one reader, five sentences. Nothing here decides anything — it says what the guard will do.
 *
 * WHAT IS STILL TRUE OF EVERY FORK, and is therefore said on the rows it applies to rather than on
 * all of them: promoting a proposal into a decision is refused to every agent but the secretary
 * carrying the person's authorization, whatever the fork says, because `promoteProposal` writes the
 * decision without asking what it stands on. The secretary may settle a fork the owner reserved, and
 * one nobody has classified, on their quoted words or their press — a decision of 15 September
 * 2026 — and these sentences say so.
 *
 * ---------------------------------------------------------------------------------------
 * THE SIXTH ANSWER, ADDED 3 SEPTEMBER 2026: AN AGENT WROTE THE CLASSIFICATION ONTO IT
 * ---------------------------------------------------------------------------------------
 *
 * The field is not the whole question. `assertMaySettleFork` refuses an agent on a fork that says
 * "an agent" when an agent wrote that value onto the fork after it was filed, because a fork nobody
 * had classified was theirs and an agent cannot change that by writing the field. This function read
 * the field alone, so it said "This fork is not yours to settle" about forks the guard was still
 * treating as the owner's.
 *
 * MEASURED ON 3 SEPTEMBER 2026: twelve of the forks on the owner's list. An agent classified them that
 * morning, the fork desk then described all twelve as somebody else's, and the guard went on
 * refusing every one of them. Two readings of one fact, disagreeing, which is this repository's
 * named recurring defect standing in front of the owner's queue. Problem `VpL3AJ9C6ogP`.
 *
 * `anAgentWroteIt` is `anAgentGaveThisForkItsClassification`, read once by the caller and handed
 * over — a parameter and not a second reading, for the reason `priorityOf` gives below.
 */
export function whoMaySettleThisFork(settles: ForkSettler | null, anAgentWroteIt: boolean): string {
  if (settles !== null && settles !== THE_OWNER && anAgentWroteIt) {
    return (
      `This fork says "${settles}" settles it, and an agent wrote that onto it after it was filed. Until then ` +
      'nobody had classified it, and a fork nobody has classified is yours — so Mole Office still reads this one as ' +
      'yours and still refuses the settling link to every agent except the secretary carrying your authorization. ' +
      'An agent that could write the field that decides whether an agent may close a fork would be granting ' +
      'itself the authority.\n\n' +
      'WHAT CLEARS IT, AND IT IS ONE FIELD. If you agree with the agent, write the same value yourself: ' +
      'PATCH /api/records/<this fork> {"dataPatch":{"who_settles_it":"' +
      `${settles}"}}. A classification YOU wrote is authority, and the fork leaves your list at once.`
    )
  }
  if (settles === THE_OWNER) {
    return (
      'Only you may settle this fork, or the secretary carrying your authorization. It says so itself: its ' +
      '`who_settles_it` field reads "the owner". Mole Office refuses the settling link to every agent except the ' +
      'secretary carrying your authorization while it does — pointing a decision at this proposal IS the act, and ' +
      'there is no stored flag beside it. Promoting it into a decision is refused to every other agent too, and so ' +
      'is deleting, restoring or moving the decision afterwards. An agent may argue for a different classification ' +
      'on the record; it may not write one, because taking a fork off you is the same act as settling it.'
    )
  }
  if (settles === null) {
    return (
      'Nobody has said who settles this fork, so Mole Office treats it as yours. Its `who_settles_it` field is ' +
      'empty, and an empty field is not permission — the rule is that a fork nobody is sure about is yours. ' +
      'The settling link is refused to every agent except the secretary carrying your authorization while the ' +
      'field is empty. An agent may fill it in, which ' +
      'is how the queue gets sorted, and once it reads "the owner" no agent may change it back.'
    )
  }
  if (settles === 'an agent') {
    return (
      'This fork is not yours to settle. It says an agent settles it, so whoever picks it up may close it — ' +
      'with a decision that says what it stands on, which is the `authority` field. It is still on this list ' +
      'because nobody has closed it yet, not because it is waiting on you.'
    )
  }
  if (settles === 'the parent') {
    return (
      'This fork is not yours to settle. It goes up one level, to the agent that spawned the one that filed ' +
      'it, and that agent closes it with a decision that says what it stands on. It is still on this list ' +
      'because nobody has closed it yet, not because it is waiting on you.'
    )
  }
  return (
    'This fork is not yours to settle. It says a measurement answers it, so nobody has to judge it: whoever ' +
    'runs the named experiment closes it with a decision that says what the measurement was. It is still on ' +
    'this list because nobody has closed it yet, not because it is waiting on you.'
  )
}

/**
 * WHY A FORK IS WHERE IT IS, COUNTED FROM THE CORPUS.
 *
 * Every fact but the pin is read off records and links here. Nothing reads a title, and there is no
 * score: the caller gets the facts and the ordering below applies them as sort keys, so a reader
 * can check the order against the facts on the row.
 */
function priorityOf(
  proposal: { id: string; data: unknown; createdAt: string },
  blocks: readonly ForkBlocked[],
  namesAnOption: boolean,
  /**
   * WHO THE FORK SAYS MAY SETTLE IT, read once by the caller and handed over.
   *
   * IT IS A PARAMETER AND NOT A SECOND READING OF THE FIELD. This function used to work the answer
   * out itself — `fields['who_settles_it'] === THE_OWNER` — while `whoSettlesThisFork` in
   * lib/records/fork-settling.ts was the reader `assertMaySettleFork` asks. One fact in two places, with nothing
   * making them agree: change what counts as a valid settler and the guard would move while the
   * queue's ordering stayed where it was, with no type error and no failing test. There is one
   * reader now and this is its answer.
   */
  settles: ForkSettler | null,
  now: number,
): ForkPriority {
  const fields = (proposal.data ?? {}) as Record<string, unknown>
  const pinned = fields['pinned'] === true
  const governance = settles === THE_OWNER

  // SAFETY COMES FROM THE WORK, NOT FROM THE FORK. A `proposal` declares no `consequence` and that
  // is deliberate — the kind's own note says what is urgent about a fork is the WORK waiting on it.
  // So this asks each blocked record for its own stored consequence, through the one reader.
  let safety = false
  for (const held of blocks) {
    const record = getRecord(held.recordId)
    if (record !== null && isSafety(readConsequence(record.data))) safety = true
  }

  // HOW FAR IT REACHES: the live records joined to the work this fork holds up, one hop out, counted
  // once each. The fork itself and the blocked work are not counted — a fork does not reach itself.
  const reached = new Set<string>()
  for (const held of blocks) {
    const near = theLinksAtEitherEnd().all({ record: held.recordId })
    for (const link of near) {
      for (const end of [link.from, link.to]) {
        if (end === held.recordId || end === proposal.id) continue
        if (blocks.some((one) => one.recordId === end)) continue
        const other = getRecord(end)
        if (other !== null && other.deletedAt === null) reached.add(end)
      }
    }
  }

  const filed = parseStoredStamp(proposal.createdAt)
  const waitingDays = filed === null ? 0 : Math.max(0, Math.floor((now - filed) / 86_400_000))

  // THE SENTENCE NAMES THE FACTS THAT ARE TRUE OF THIS FORK, in the order they are applied. A fork
  // with none of them says so, because "nothing about this makes it urgent" is a real answer and is
  // more use than an empty string.
  const said: string[] = []
  if (pinned) said.push('you pinned it')
  if (safety) said.push('somebody could be hurt if the work it holds up stays undone')
  if (blocks.length > 0) {
    said.push(`it is holding up ${String(blocks.length)} piece${blocks.length === 1 ? '' : 's'} of work`)
  }
  if (reached.size > 0) {
    said.push(`${String(reached.size)} other record${reached.size === 1 ? '' : 's'} depend on that work`)
  }
  if (governance) said.push('it says only you may settle it')
  if (waitingDays > 0) said.push(`it has waited ${String(waitingDays)} day${waitingDays === 1 ? '' : 's'}`)
  if (namesAnOption) said.push('its recommendation names an option, so it can be settled in one press')

  return {
    pinned,
    safety,
    blocking: blocks.length,
    reaches: reached.size,
    governance,
    waitingDays,
    namesAnOption,
    because:
      said.length === 0
        ? 'Nothing recorded about this fork makes it urgent: it holds no work up, nobody has pinned it, and it ' +
          'was filed today. That is a real answer and it is why it is low in the list.'
        : `Ordered by: ${said.join('; ')}.`,
  }
}

/**
 * DID SOMETHING REPLACE THIS FORK, OR IS IT THE SAME QUESTION ASKED TWICE?
 *
 * `everyLinkThatSaysSomethingReplacedThisFork` in lib/records/fork-settling.ts is the whole answer,
 * and this file
 * no longer works it out. It used to, under the name `leftTheQueueBecause`, and that was the problem:
 * `assertMayRemoveAFork` could not ask it, so it told an agent a fork was "still open, still in
 * GET /api/needs-you" about a fork that had already been superseded. The reader and the guard now
 * ask one function.
 *
 * WHAT STAYS HERE IS THE SENTENCE. `whyItLeft` below turns the answer into words a person reads,
 * which is this file's job.
 */

/**
 * The one sentence a person reads about a fork that left this way. Plain, and it names the other.
 * Exported so that a test reads the words here rather than writing them out (round 130).
 */
export function whyItLeft(why: WhyItLeftTheQueue, insteadTitle: string, insteadId: string): string {
  return why === 'superseded'
    ? `This needs no answer: "${insteadTitle}" (${insteadId}) replaced it. It left the queue because it was ` +
        'replaced, not because it was decided.'
    : `This needs no second answer: it is the same question as "${insteadTitle}" (${insteadId}), which is ` +
        'the one to answer. The link that joins them records why.'
}

/**
 * THE SENTENCE FOR A CLAIM THAT DID NOT COUNT. What was said, why it did not, and what would.
 *
 * The last part is the point. A fork with an ignored `supersedes` link on it is a row the owner can
 * clear in one request, and the request is written out here so they do not have to work it out.
 */
function saidToBeReplaced(link: ReplacingLink, forkId: string): string {
  const claim =
    link.why === 'superseded'
      ? `"${link.insteadTitle}" (${link.insteadId}) replaces this fork`
      : `this fork is the same question as "${link.insteadTitle}" (${link.insteadId})`
  const theLink =
    link.why === 'superseded'
      ? `POST /api/links {"fromId":"${link.insteadId}","toId":"${forkId}","type":"supersedes"}`
      : `POST /api/links {"fromId":"${forkId}","toId":"${link.insteadId}","type":"duplicate_of"}`
  return (
    `${link.linkedBy} said on ${link.linkedAt} that ${claim}. That did not take it off your queue, and this ` +
    'fork is still open and still yours. Only a link YOU make takes one of your forks off, because an agent ' +
    'that could take a question away from you would be settling it by another door.\n\n' +
    `IF YOU AGREE, IT IS ONE REQUEST: ${theLink}. The fork leaves your list at once and is named under ` +
    '`leftTheQueue` with the record that replaced it, so it can still be gone back to.'
  )
}

/**
 * THE NEWEST CLAIM THAT DID NOT COUNT, turned into a row a person can read. Null when there is none.
 *
 * The newest, and not all of them, for the reason the exit above gives: several records claiming to
 * replace one fork is a real state, the row has to name one of them, and the rest are on the fork's
 * own page. Nothing is hidden by naming the most recent.
 */
function theClaimThatDidNotCount(replacing: readonly ReplacingLink[], forkId: string): ReplacedButStillHere | null {
  const claim = newestOf(replacing.filter((link) => !link.counted))
  if (claim === null) return null
  return {
    why: claim.why,
    insteadId: claim.insteadId,
    insteadTitle: claim.insteadTitle,
    linkedBy: claim.linkedBy,
    linkedByType: claim.linkedByType,
    linkedAt: claim.linkedAt,
    sentence: saidToBeReplaced(claim, forkId),
  }
}

/**
 * EVERY FORK IN THIS INSTALLATION, open and settled, read once.
 *
 * The order of `open` is the server's: the ones holding work up first, then the oldest. Neither is
 * a judgement about importance — both are facts about the record, which is how the rest of this
 * product ranks. A surface may re-sort it, and the one that does says so out loud.
 */
export function readForks(): ForksRead {
  // ONE CLOCK FOR THE WHOLE READING. Every fork's age is measured from the same instant, so two
  // forks filed in the same second cannot land on different day counts because the loop took a
  // millisecond. Local wall-clock, like every stamp in this product.
  const now = Date.now()

  // BY KIND, ACROSS PROJECTS, LIVE ONLY. No caller-supplied filter reaches this query — see the
  // header for why that is the boundary rather than a workspace clause.
  const proposals = db
    .select()
    .from(records)
    .where(and(eq(records.kind, PROPOSAL_KIND), isNull(records.deletedAt)))
    .all()

  const open: OpenFork[] = []
  const settled: SettledFork[] = []
  const leftTheQueue: ForkThatLeftTheQueue[] = []
  // One reading of each project's name per project, not per fork.
  const projectTitles = new Map<string, string | null>()
  /**
   * Which fork each decision came out of, collected while the forks are being read.
   *
   * It is built here rather than by a second query from the decision's end, so the pair a reader
   * sees on the decisions page is the same pair this reading already knows about. Every live
   * `derived_from` link counts, whoever made it: this says what the decision is ABOUT, which is a
   * fact about the two records, not the governance question of whether a person settled the fork.
   * That question is `forkIsSettled` and it is asked separately, above.
   */
  const cameFrom = new Map<string, { proposalId: string; question: string | null }>()

  // WHICH DECISIONS REPLACED WHICH, read once for every fork and not once for each decision that settles one.
  const replacements = readTheReplacements()

  for (const proposal of proposals) {
    const resolution = proposalResolution({ ...proposal, kind: proposal.kind as RecordKind }, replacements)
    if (resolution === null) continue

    const fields = (proposal.data ?? {}) as Record<string, unknown>
    const question = typeof fields['question'] === 'string' ? fields['question'] : null
    // The fork every live decision on it came out of, whether or not this fork counts as settled.
    for (const decision of resolution.by) {
      if (decision.deleted) continue
      cameFrom.set(decision.id, { proposalId: proposal.id, question })
    }
    // SETTLED BY WHOEVER MAY SETTLE IT, not merely resolved, and not always by a human.
    //
    // For a fork that is the person's — it says `the owner`, or nobody has said — only a link a
    // HUMAN made counts, and that has not changed. Writing a decision is refused to agents without
    // an authority and that guard holds; the LINK was not guarded at all when this was written, so
    // an agent could point an existing, unrelated human decision at a fork with `derived_from` and
    // the fork vanished from this queue without anybody having decided anything — and could delete
    // the link of a genuinely settled fork to put it back. Found by an independent reviewer, both
    // directions executed. `assertMaySettleFork` refuses that write now, but rows older than the
    // gate are in the corpus and an archive can bring more, so the reader still defends itself.
    //
    // For a fork the corpus says somebody else settles, a human link is not what settles it, and
    // demanding one made the whole classification a no-op. `linkSettlesThisFork` above holds both
    // halves and says why the second needs no legacy defence.
    //
    // `proposalResolution` already carries who made each link, and says why that is a separate
    // fact: "the difference between 'the owner settled this' and 'something pointed an existing
    // decision at it'". The record page still shows every resolution and who linked it, so nothing
    // is hidden — it is counted differently, here, for this question.
    if (forkIsSettled(proposal.id, resolution)) {
      // SETTLED, AND THEREFORE STILL REPORTED. It leaves the queue — nothing is waiting on
      // anybody — and it is named on the way out, with the decision that answers it, because a
      // fork that disappears the moment it is settled is a fork nobody can go back to.
      //
      // ONLY THE LINKS THAT SETTLE IT, and only to live decisions, which is the same reading the
      // `continue` above is built on: `forkIsSettled` is what took this off the queue, so
      // anything else here would name a fork as settled that the queue does not agree is settled.
      for (const decision of resolution.by) {
        if (decision.deleted) continue
        if (!linkSettlesThisFork(proposal.id, decision.id)) continue
        settled.push({
          proposalId: proposal.id,
          proposalTitle: proposal.title,
          workspaceId: proposal.workspaceId,
          decisionId: decision.id,
          decisionTitle: decision.title,
          settledBy: decision.linkedBy,
          settledByType: decision.linkedByType,
          settledAt: decision.linkedAt,
          // ASKED OF THE DECISION AND NOT OF THE FORK, because the promotion wrote the decision and
          // nothing at all to the proposal — so the warrant is on the decision's first version.
          // Filled in below, for the whole list at once (problem 9dYnSFapwm5x).
          onThePersonsWords: null,
        })
      }
      continue
    }

    // AND THE TWO OTHER WAYS OUT, asked after `forkIsSettled` because being answered outranks
    // being replaced: a fork a person settled is settled, whatever else points at it.
    //
    // READ WHOLE, COUNTED AND UNCOUNTED, out of one query. The ones that count take the fork off the
    // queue below. The ones that do not are put on the row further down rather than dropped: a
    // stored claim that a fork was replaced, which no surface mentions, is what left `h6O_RMpeYBTD`
    // on the owner's list for ten days with the answer sitting beside it. See `replacedButStillHere`.
    const replacing = everyLinkThatSaysSomethingReplacedThisFork(proposal.id)
    const left = newestOf(replacing.filter((link) => link.counted))
    if (left !== null) {
      if (!projectTitles.has(proposal.workspaceId)) {
        projectTitles.set(proposal.workspaceId, getWorkspace(proposal.workspaceId)?.title ?? null)
      }
      leftTheQueue.push({
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        workspaceId: proposal.workspaceId,
        why: left.why,
        sentence: whyItLeft(left.why, left.insteadTitle, left.insteadId),
        insteadId: left.insteadId,
        insteadTitle: left.insteadTitle,
        linkedBy: left.linkedBy,
        linkedByType: left.linkedByType,
        linkedAt: left.linkedAt,
      })
      continue
    }

    // A RESIDENCY PROPOSAL IS LEFT OFF THE OPEN FORKS. Only its own two presses settle it,
    // and the residents' rows draw it, from GET /api/residents; a generic fork band would offer a press that cannot.
    // It still counts as settled above once Confirm or Not now has answered it, and its decision is still paired.
    if (isAResidencyProposal(fields)) continue

    const unreadable: string[] = []

    // THE OPTIONS, READ ONCE. The stored list is what the author wrote; `written` is the part of it
    // that is text and can therefore be shown to anybody. Where the two differ the difference is
    // reported rather than absorbed: a count of choices that includes one nobody can read is a
    // count a reader would act on and then not find.
    const stored = Array.isArray(fields['options']) ? (fields['options'] as unknown[]) : []
    const written = stored.filter((option): option is string => typeof option === 'string')
    if (written.length !== stored.length) {
      const lost = stored.length - written.length
      unreadable.push(
        `${lost} of the ${stored.length} options on this fork ${lost === 1 ? 'is' : 'are'} not text, so ` +
          `${lost === 1 ? 'it is' : 'they are'} neither counted nor shown here.`,
      )
    }

    // WORK THAT STILL EXISTS. This used to count every `blocks` link, so a fork went on reporting
    // "holding up 1 thing" after that thing was deleted — while `shared/attention.ts` takes the
    // opposite view on purpose: "A link whose other end has been deleted is a broken link. It is
    // a fact about the archive and not a piece of work." Two places computing how much work waits
    // on something, disagreeing, which is the defect this repository keeps finding.
    const blocks = theLiveWorkAForkBlocks().all({ fork: proposal.id })

    if (!projectTitles.has(proposal.workspaceId)) {
      projectTitles.set(proposal.workspaceId, getWorkspace(proposal.workspaceId)?.title ?? null)
    }

    const blocked = blocks.map((row) => ({ recordId: row.id, title: row.title, kind: row.kind as RecordKind }))
    const namesAnOption =
      pickedOption(
        typeof fields['recommendation'] === 'string' ? fields['recommendation'] : null,
        optionCards(written),
      ) !== null

    // WHO THE FORK SAYS MAY SETTLE IT, READ ONCE FOR THIS ROW, through the same reader
    // `assertMaySettleFork` asks. Two things below need it — the sentence a person reads and the
    // ordering fact — and reading it twice would be one fact worked out in two places again.
    const settles = whoSettlesThisFork(proposal.id)
    // AND WHETHER AN AGENT WROTE THAT VALUE ONTO THE FORK AFTER IT WAS FILED, which is the other
    // half of the guard's answer. Read here, once, and handed to the sentence below for the same
    // reason: the desk and the guard have to give the owner one account of who settles their fork.
    const anAgentWroteIt = anAgentGaveThisForkItsClassification(proposal.id)

    open.push({
      recordId: proposal.id,
      title: proposal.title,
      summary: proposal.summary,
      workspaceId: proposal.workspaceId,
      workspaceTitle: projectTitles.get(proposal.workspaceId) ?? null,
      question,
      options: written.length,
      // TWO FACTS, READ SEPARATELY FROM THE SAME FIELD. Written at all, and points at an option.
      recommendationWritten:
        typeof fields['recommendation'] === 'string' && fields['recommendation'].trim() !== '',
      namesAnOption,
      blocks: blocked,
      fields,
      createdAt: proposal.createdAt,
      // WHO MAY SETTLE THIS ONE, in words, from the fork's own field and not from a sentence that
      // claims to be true of all of them. `settles` was read once at the top of this iteration.
      because: whoMaySettleThisFork(settles, anAgentWroteIt),
      unreadable,
      // WHAT SOMEBODY CLAIMED AND WHAT CAME OF IT. Null when nothing claimed anything, which is the
      // ordinary case; the newest claim when several did, the same rule the exit above uses.
      replacedButStillHere: theClaimThatDidNotCount(replacing, proposal.id),
      // WHETHER ANYTHING ON THIS FORK STANDS ON THE OWNER'S OWN WORDS. Null almost always. It is
      // here so the desk can say *on the owner's words* wherever it says who did something —
      // `design/messages/ACCEPTANCE.md` W2 — with the words themselves rather than only a name.
      // Filled in below, for the whole list at once (problem 9dYnSFapwm5x).
      onThePersonsWords: null,
      priority: priorityOf(proposal, blocked, namesAnOption, settles, now),
    })
  }

  // EVERY DECISION A PERSON HAS MADE, in every project. One query, by kind and by liveness, with
  // nothing a caller can aim — the same limit the fork query keeps, and for the same reason.
  // A DECISION A LATER ONE REPLACED LEAVES THIS LIST (problem ZSWftCSVUP2r), counted rather than dropped silently.
  // `replacedDecisionIds` in lib/replaced-decisions.ts is the one reading of which are replaced.
  const replaced = replacedDecisionIds()
  const everyDecided = db
    .select()
    .from(records)
    .where(and(eq(records.kind, DECISION_KIND), isNull(records.deletedAt)))
    .all()
  const decided = everyDecided.filter((decision) => !replaced.has(decision.id))
  const decisionsReplaced = everyDecided.length - decided.length

  const marks = decisionsNotOnThePersonsOwnWords(decided)
  const decisions: DecidedRecord[] = decided.map((decision) => {
    const fields = (decision.data ?? {}) as Record<string, unknown>
    const from = cameFrom.get(decision.id)
    if (!projectTitles.has(decision.workspaceId)) {
      projectTitles.set(decision.workspaceId, getWorkspace(decision.workspaceId)?.title ?? null)
    }
    return {
      recordId: decision.id,
      title: decision.title,
      workspaceId: decision.workspaceId,
      workspaceTitle: projectTitles.get(decision.workspaceId) ?? null,
      optionTaken: typeof fields['option_taken'] === 'string' ? fields['option_taken'] : null,
      // A stored value that is not a number says nothing about which option was taken, and is
      // reported as nothing rather than coerced into a position.
      optionIndex: typeof fields['option_index'] === 'number' ? fields['option_index'] : null,
      proposalId: from?.proposalId ?? null,
      question: from?.question ?? null,
      decidedOn: typeof fields['decided_on'] === 'string' ? fields['decided_on'] : null,
      createdAt: decision.createdAt,
      notOnThePersonsOwnWords: marks.get(decision.id) ?? null,
    }
  })

  // WHAT STANDS ON THEIR WORDS, ASKED OF THE LEDGER ONCE FOR EVERY ROW. Problem 9dYnSFapwm5x: asked
  // row by row it was two queries a fork. A settled row asks of the DECISION and not of the fork,
  // because the promotion wrote the decision and nothing at all to the proposal.
  const stands = standsOnTheirWordsForEach([...open.map((fork) => fork.recordId), ...settled.map((fork) => fork.decisionId)])
  for (const fork of open) fork.onThePersonsWords = stands.get(fork.recordId) ?? null
  for (const fork of settled) fork.onThePersonsWords = stands.get(fork.decisionId) ?? null

  // ------------------------------------------------------------------ the most consequential first
  //
  // SEVERAL FACTS APPLIED AS SORT KEYS, NEVER ONE SCORE. No single opaque numeric weight decides the
  // order, and by default the most consequential items come
  // first. Each key below is a field on `priority`, drawn on the row, so a reader can check the
  // order against the facts rather than being told a number.
  //
  // THE ORDER OF THE KEYS IS THE DESIGN AND IT IS ARGUED. Their pin first, because it is the one fact
  // that is their own statement and it exists to override the counted ones. Then somebody being hurt,
  // which no amount of anything else outweighs — the same rule `shared/attention.ts` already
  // applies. Then how much work is stuck, then how far that reaches, which are consequence measured
  // two ways. Then whether it is theirs to settle at all, then how long it has waited, then whether it
  // can be settled in one press — that last is convenience rather than consequence, so it is last.
  //
  // THIS USED TO BE "the ones holding work up first, then the oldest", which is two of these seven.
  //
  // THE NEWEST OF EQUALS IS FIRST, AND THAT LINE USED TO READ THE OTHER WAY. Two forks equal on all
  // seven keys are equal on `waitingDays` too, so they were filed on the same day and neither has
  // waited longer than the other in any sense a person can see. Between those, the one filed most
  // recently goes first. The settled list once put the newest decision at the bottom. That list was put right
  // by `newestFirst` in web/components/home/decisions.ts; this queue had the same rule and the same
  // fault. Problem `Dzq7hMCIFAA6`.
  //
  // THIS IS THE ONE PLACE THE DEFAULT ORDER IS WORKED OUT. The governance page lets a person ask for
  // three other orders and never recomputes this one: what it draws by default is the order it was
  // sent. See `src/web/lib/queueorder.ts`.
  open.sort(
    (a, b) =>
      Number(b.priority.pinned) - Number(a.priority.pinned) ||
      Number(b.priority.safety) - Number(a.priority.safety) ||
      b.priority.blocking - a.priority.blocking ||
      b.priority.reaches - a.priority.reaches ||
      Number(b.priority.governance) - Number(a.priority.governance) ||
      b.priority.waitingDays - a.priority.waitingDays ||
      Number(b.priority.namesAnOption) - Number(a.priority.namesAnOption) ||
      b.createdAt.localeCompare(a.createdAt) ||
      // The id last, so two forks filed in the same second cannot swap places between two reads.
      a.recordId.localeCompare(b.recordId),
  )
  // Newest first, and the id last so two settled in the same second cannot swap between two reads.
  settled.sort((a, b) => b.settledAt.localeCompare(a.settledAt) || a.decisionId.localeCompare(b.decisionId))
  // NEWEST FIRST BY WHEN IT WAS FILED, not by the date the person says the choice was made.
  // `decided_on` is optional and is often a day or two before the filing, so half a list sorted by
  // it would be sorted by a different fact from the other half. The filing stamp is on every
  // record, and the surface draws `decided_on` where it exists, so nothing is hidden by this.
  decisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.recordId.localeCompare(b.recordId))
  // Newest first by when it left, and the id last so two that left in the same second cannot swap.
  leftTheQueue.sort((a, b) => b.linkedAt.localeCompare(a.linkedAt) || a.proposalId.localeCompare(b.proposalId))

  return { open, settled, decisions, decisionsReplaced, leftTheQueue }
}
