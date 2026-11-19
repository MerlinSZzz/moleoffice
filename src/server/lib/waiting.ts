// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS WAITING ON THE PERSON — ONE READING, THREE SOURCES, ONE STATED SCOPE.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * Home told the owner four different numbers about the same idea — `1 waiting`,
 * `8 waiting to be read`, `48 need you · 7 shown`, and a rail badge reading `Needs you 48` — plus a
 * fifth on the Schedule. Four surfaces each worked out for themselves what "waiting on you" means,
 * so the four could not agree and nothing made them. That is the defect CLAUDE.md names as this
 * codebase's own, standing on the page a person reads first.
 *
 * This file is the one reading. Every band, badge and panel that says a number about what waits on
 * the owner takes it from here, and a component that cannot fetch this cannot draw a number.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE SOURCES, AND WHY THEY ARE THREE
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/settings-and-governance.md` §8.2 and §8.4 settle them:
 *
 *   1. A REFUSED ACT — tier `settle`. The act that would settle this is refused to every agent
 *      except the secretary carrying the person's authorization, so it waits for a person or that
 *      secretary. Membership is DERIVED BY ASKING THE GUARDS (below), never from
 *      a list of acts somebody keeps by hand.
 *   2. AN AGENT ASKED — tier `asked`. A live record carries `whose_move: person`, its own state
 *      does not say it has ended, and the revision ledger says who asked and when.
 *   3. SET ASIDE BY THE OWNER — tier `set-aside`. The owner pushed an item away with a date or a
 *      condition. It is still counted, still reachable, and it KEEPS THE REASON IT QUALIFIED.
 *
 * Set-aside is a state the owner puts an item into, not a fourth way of qualifying. An item reaches
 * tier 3 only by having qualified under tier 1 or tier 2 first, and the row carries where it came
 * from in `setAsideFrom`. See `TIER_ORDER` for the dedup rule and why its order is what it is.
 *
 * ---------------------------------------------------------------------------------------
 * TIER 1 IS ASKED OF THE GUARDS, NOT COPIED FROM THEM
 * ---------------------------------------------------------------------------------------
 *
 * The first version of this design wrote a table called `HUMAN_ONLY_ACTS` naming each act, its
 * route and its query by hand. That is a second place saying what is refused to an agent, free to
 * disagree with the guards that actually refuse it — and a governance queue is the worst possible
 * place for that.
 *
 * So `PENDING_ACTS` below does not say what is refused. It names the DOORS an agent could come
 * through, holds a reference to the guard function standing at each one, and `refusedToEveryAgent`
 * CALLS them with a probe agent and reads what happens. If a guard stops refusing agents, the rows
 * it was holding leave this queue on the next read, with nothing to remember and nothing to update.
 *
 * The probe is the most privileged agent that can exist — it states its identity and it is at this
 * machine — so a refusal of the probe is a refusal of every agent. See `PROBE`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * IT READS. Nothing here writes a record, a link, a revision or a change row. The acts it reports
 * are performed at the routes it names, where the guards are asked for real.
 *
 * NO TIER READS LINKS. Every tier's membership is a fact about the record itself — a refused act, a
 * `whose_move` value, a set-aside field. So an agent deleting a link changes what a report's panel
 * draws and leaves the owner's queue untouched. `blocking` counts links, but it is drawn beside a
 * row rather than deciding whether the row is there.
 *
 * AND A LINK MAY BE REPORTED BESIDE A ROW WITHOUT DECIDING IT. Problem lXf2ecxwr3sk: a fork the fork
 * desk says somebody claimed was replaced, by a link that did not count, carries that claim on its
 * row here too (`replacedButStillHere`), and its `why` says so. The claim is the fork desk's own
 * reading, taken whole from `readForks`; nothing here reads the link, and the row stays or goes on
 * the same facts as before.
 *
 * A REPORT IS NOT A SOURCE. A report draws the intersection of its own links with this reading and
 * adds nothing to it, which is §8.4's repair for a count that could be moved by deleting a link.
 */

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { db, sqlite } from '../db/client.ts'
import { agentRuns, links, records, STORED_FIELDS } from '../db/schema.ts'
import { readForks, type ForksRead, type ReplacedButStillHere } from './forks.ts'
import { assertMayConfirmAGoal } from './goals.ts'
import {
  ACROSS_WORKSPACES,
  GOVERNANCE_GUARDS,
  assertMayAcceptAGuess,
  PROPOSAL_KIND,
  RESOLVES_PROPOSAL,
  listRecords,
  assertMayCommitAnIntent,
  assertMayRemoveAFork,
  assertMaySettleFork,
  assertMayWrite,
  forkIsTheOwnersToSettle,
  forkWasHandedOverOnTheOwnersWords,
  getRecord,
  type Actor,
  type GovernanceGuard,
} from './records.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { PanelError } from './panel-error.ts'
// THE FOUR AUTHORITIES AN AGENT MAY CLAIM FOR ITSELF. Read here so the hypothetical decision this
// reading probes the settling guard with is one an agent is actually allowed to write.
import { AGENT_AUTHORITIES } from '@shared/kinds.ts'
import { onlyTheMessagesThisReaderMayRead, type AMessageReader } from './messages.ts'
// THE KEPT WORDS ABOUT TIME, READ WHERE THEY LIVE. `listIntents` and `getIntent` are the planning
// layer's own readers; asking the table directly here would be a second reading of what an intent is.
import { getIntent, listIntents } from './planning.ts'
// WHO WROTE THE VALUE A RECORD HOLDS NOW. One reading of the revision ledger, and the guard that
// refuses an agent to withdraw anybody else's question — the owner's or another agent's — asks the
// same one. Two functions answering that would let the door and the queue disagree about whose
// request is on a record, which is exactly what the row's own sentence has to get right.
import { whoWroteRecords } from '../db/who-wrote-records.ts'
import { whoWroteTheValue } from '../db/who-wrote-the-value.ts'
import { readWhoseMove } from './openloops.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
// THE TWO THINGS PROBLEM qpq63k1PiBNb ADDS TO THIS LIST: a visiting agent asking to come in, and a
// message addressed to the person that they have not read. Neither is a record with a `whose_move`, and neither was
// on any list the person read. `messagesWaitingFor` is READ here and its file is not touched.
import { everyCredential } from './visitors.ts'
import { messagesWaitingFor, unreadAmong } from './messages.ts'
import { isABroughtBackLine, isABroughtBackLineTheSecretarySet } from '@shared/office-lines.ts'
// THE ONE READING OF WHETHER A PENDING CREDENTIAL IS A PERSON'S DEVICE. Criterion D2. The Embassy
// reads the same predicate off the same marker, so the row here and the card there cannot disagree.
import { credentialNeedsOwnerAction, isAPersonsDeviceCredential } from '@shared/visitors.ts'
import { THE_PERSON } from '@shared/person.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { GOAL_KIND } from '@shared/goal.ts'
import { goalFiledBy, goalIsConfirmed, goalNeedsConfirmation } from '@shared/horizons.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { settings } from '../../config/settings.mjs'
// A BARE DATE IS THE END OF THAT DAY, and this is where Mole Office already says so. "Set aside until
// the 25th" that expired at one minute past midnight on the 25th would come back on the morning of
// the day the owner pushed it to. `parseDueStamp` is the one reading of a date used as a deadline;
// a second one here would be the same fact worked out twice, free to disagree by a day.
import { guessesNobodyHasAnswered } from './implementation.ts'
import { parseDueStamp } from '@shared/due-stamps.ts'
import { theWorkHasEnded } from '@shared/work.ts'
import type { PanelRecord } from '@shared/types.ts'
import { standsOnTheirWordsForEach, type ActOnTheirWords } from './warrants.ts'
// WHERE A QUESTION AN AGENT ASKED IS: with the agent's starter, or with the person. Criterion P55.
// The same reading `assertMayRemoveAnAsk` asks, so a question cannot be the starter's at the write
// door and the person's on this list.
import { whereTheQuestionIs } from './confirming.ts'
import { theAgentAStoredReferenceNamesIn } from './the-agent-a-stored-reference-names-in.ts'
import { listParticipants } from '../db/list-participants.ts'
// A CARD ASK WAITING ON THE PERSON, and whether it is also a session that registered itself. F15 point 2.
// The reading of the waiting marker is the self-registration library's, never a second copy.
import { thePressOnThisAsk, whatAPressOnThisAskDoes, whatThisKeyAskShows } from './newkey.ts'
import { aWaitingSelfRegistration } from './selfregistration.ts'
import type { WaitingCardAsk, WhatAnAskShows } from '@shared/profile.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { theNameAPersonReads } from './inspection.ts'
import { A_WITHDRAWAL_IS_LISTED_FOR_DAYS, theWithdrawalOf, type WithdrawnAs } from './withdraw-a-request.ts'
import { parseStoredStamp } from '@shared/time.ts'
import type { PassedItOn } from '@shared/confirming.ts'
// WHO MAY CONFIRM A PACKAGE'S TASK FINISHED, AND WHICH TASKS ARE WAITING FOR IT. Criterion F16
// point 5. Both live in lib/delegation.ts beside the package they are about: the guard is the one
// `GOVERNANCE_GUARDS` registers, and `packagedTasksWaitingToBeConfirmed` is the same file's reading
// of a package returned from outside and not yet confirmed, which `packageStateOf` draws as
// `handed_back`, so this queue cannot come to a different conclusion about a task than the column does.
import { assertMayConfirmPackage, packagedTasksWaitingToBeConfirmed } from './delegation.ts'
// THE OPEN RESIDENCY PROPOSALS, read where the residents' doors read them. Source 6 below.
import { openResidencyProposals, residentsToBeNamed } from './residents.ts'
import { RESIDENCY_PROPOSAL, RESIDENT_TO_BE_NAMED } from '@shared/residents.ts'
import { theRequestsThatWait, type KnownActName } from './one-press.ts'
import { ONE_PRESS_REQUEST } from '@shared/one-press.ts'
import { theChecklistsWaitingFor } from './readiness.ts'
import { READINESS_CHECKLIST } from '@shared/readiness-checklists.ts'
import { SIGNING_PACKAGE } from '@shared/signing-packages.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { theNewestPackages, type ASigningPackage } from './signing-packages.ts'

// ============================================================================ what a row is

/** Which of the three a row is in. The words the band draws are built from these, not stored. */
export type WaitingTier = 'settle' | 'asked' | 'set-aside'

/**
 * The verb the person performs, named on the row.
 *
 * EVERY WORD HERE IS FILLED BY A SOURCE THAT EXISTS. There is no `approve` and no `run`: a branch
 * nothing fills is a branch nobody tests, and the second version of this design shipped two of them.
 * A verb joins this union when a guard with a queue behind it is registered, which is what
 * `tests/waiting-queue.test.ts` makes unavoidable — `schedule` arrived exactly that way, from
 * `assertMayCommitAnIntent`.
 */
export type WaitingAct =
  | 'settle'
  | 'answer'
  | 'schedule'
  | 'accept'
  | 'confirm'
  | 'read'
  | 'give-card'
  // A SESSION THAT REGISTERED ITSELF WAITS FOR ONE PRESS THAT ADMITS IT AND GIVES IT THE CARD. Its own verb, because
  // the ask's own page names that press for the admission, and the row says the same word.
  | 'admit-agent'
  // AN AGENT ASKED FOR A NEW KEY. Its own verb, because the press gives no card. Problem x8ktQfHS5yGr.
  | 'give-new-key'
  // A VERB OF ITS OWN, because `confirm` above is taken: there it means "let this agent in, or refuse
  // it", and a task waiting for its responsible one to say it is finished is a different act. The
  // name is the one this file and src/web/lib/waiting.ts share, so the chip and the clause cannot
  // disagree about which act a row is.
  | 'confirm-return'
  // A goal has its own Confirm press. `confirm` above lets in a visitor.
  | 'confirm-goal'
  // A SECRETARY PROPOSES AN AGENT AS A PERMANENT RESIDENT. Its own verb, because only its two
  // presses answer it, Confirm and Not now, and a generic settle is refused (`assertMaySettleFork`).
  | 'confirm-resident'
  // THE PICTURE AND THE NAME OF A NEW PERMANENT RESIDENT. Its own verb, because unlike every
  // other press here the resident itself may also settle it, with its own key.
  | 'name-resident'

/**
 * The act as a person would say it, for the sentence on the row.
 *
 * One place, so the queue, the band and any screen drawn from this reading use the same words for
 * the same act. `answer` never appears in a refused-act sentence — nothing is refused about it, an
 * agent asked — but it is here because the type is closed and a missing key would be a hole.
 */
const ACT_IN_WORDS: Readonly<Record<WaitingAct, string>> = {
  settle: 'settle this',
  answer: 'answer this',
  schedule: 'put this time on your calendar',
  accept: 'accept what a machine worked out about which code this owns',
  // THE TWO PROBLEM qpq63k1PiBNb ADDS. Each names the press, not the mechanism behind it: a person
  // reading this row decides what to do from the verb.
  confirm: 'let this agent in, or refuse it',
  read: 'read',
  // F15 point 2. An agent asked the person for a card.
  'give-card': 'give this agent the card it asked for',
  // A session that registered itself while the window was closed is waiting for one press that admits it and gives
  // it the card.
  'admit-agent': 'admit this agent and give it the card it asked for',
  // Problem x8ktQfHS5yGr. The press revokes the agent's keys and lets it ask once for a new one.
  'give-new-key': 'let this agent be answered a new key',
  // F16 point 5. A packaged task has something back from outside and no confirmation, so the person
  // (or the one responsible) says it is finished. No underscore, because this is what a person reads.
  'confirm-return': 'confirm a returned task is finished',
  'confirm-goal': 'confirm this goal',
  'confirm-resident': 'confirm this agent as a permanent resident, or say not now',
  'name-resident': 'choose a picture and a name for this resident',
}

/**
 * ONE DOOR AN AGENT COULD HAVE COME THROUGH, AND THE GUARD THAT REFUSED IT.
 *
 * `what` is the door in plain words, because "assertMaySettleFork" is a fact about this repository
 * and not something a person reading their own queue should have to know.
 */
export interface RefusedDoor {
  /** The exported guard function that was asked. It was CALLED; this is not a description of it. */
  guard: string
  /** The route that performs the act. Where the same guard is asked for real. */
  route: string
  /** What coming through this door would do, in words. */
  what: string
}

/**
 * WHY A ROW IS HERE, AS FACTS. Never a sentence — `whyInWords` builds the sentence from these.
 *
 * A reason is a fact. `GET /api/needs-you` returns a 55-word English paragraph in `because` and the
 * browser prints it verbatim, so the words are the only thing anybody has and no reader can act on
 * the parts. These are the parts.
 */
export type Because =
  | {
      rule: 'refused-act'
      /**
       * Every door that was asked, and refused, just now.
       *
       * The design typed this as one `guard` and one `route`. Settling a fork has THREE doors and
       * naming one of them would be a reason that is a third true — so the list is the list. The
       * row is in this tier only when every door in it refused.
       */
      doors: readonly RefusedDoor[]
    }
  | {
      rule: 'whose-move'
      /** Who wrote the `whose_move` value the record holds now. Null when the ledger cannot say. */
      writtenBy: string | null
      /**
       * Whether that writer was a person or an agent, as the revision ledger stored it.
       *
       * Typed as a string rather than as the three-word union, because `revisions.actor_type` is a
       * free text column and a narrower type here would be a claim the database does not enforce.
       */
      actorType: string | null
      /** When they wrote it. Null for the same reason `writtenBy` is null. */
      at: string | null
    }
  | {
      /**
       * A THING ONLY THE PERSON MAY PRESS, THAT IS NOT A RECORD. Problem qpq63k1PiBNb.
       *
       * A visitor credential waiting for the person's confirmation, and a message addressed to them that they have not
       * read. Neither is a record with a `whose_move` and neither is a fork, so neither was on this
       * list at all — and the person read one page to know what waited on them while both sat elsewhere.
       */
      rule: 'the-persons-press'
      /** What is waiting, in the words a person would use. */
      what: string
      /** Who it came from, or null because nobody recorded one. */
      from: string | null
      /** When it started waiting. Null when nothing recorded it. */
      at: string | null
    }
  | {
      rule: 'set-aside'
      /** Who set it aside, from the ledger. Null when the ledger cannot say. */
      by: string | null
      /** The date the owner wrote, exactly as they wrote it. Null when they wrote a condition. */
      until: string | null
      /** The condition in the owner's own words, kept as written and never parsed away. */
      condition: string | null
      /**
       * FALSE WHEN MOLE OFFICE COULD NOT READ THE DATE, and the item stays set aside.
       *
       * A date it cannot read is a date it cannot tell has passed, so returning the item to its old
       * tier would be Mole Office deciding something it does not know. It stays where the owner put it
       * and the row says the date could not be read.
       */
      untilRead: boolean
    }

/**
 * ONE THING WAITING ON THE PERSON. Computed at read time, so it cannot be stale.
 *
 * It is a projection row and not a thing of its own: `id` is the stable id of the object the act is
 * pending on and is never minted here, so opening a row opens that object and two readings of one
 * corpus name the same ids.
 */
export interface WaitingItem {
  /**
   * THE OBJECT'S OWN STABLE ID. Never minted here.
   *
   * A record's id on every row but one: a `schedule` row names a PLANNING INTENT, which lives in its
   * own table, so `GET /api/records/<that id>` is a 404 and the row opens the planning screen
   * instead. `kind` is what tells the two apart — it reads `planning intent` on those rows.
   *
   * A second exception, added on 2 October 2026 (problem f1Q1eivN_jSa): a row of kind `visiting
   * agent` or `visiting device` names a CREDENTIAL, so its id is not a record's either and
   * `GET /api/records/<that id>` is a 404 too. `aWaitingRowIsARecord` in src/web/lib/waiting.ts is
   * the browser's one reading of which rows are records.
   *
   * A third, added in wave 13k round 46: a row of kind `resident to be named` names an AGENT by its registry id, and
   * the page sends it to that agent's own page.
   */
  id: string
  tier: WaitingTier
  /** The verb, named, so a row can be read without opening it. */
  act: WaitingAct
  /** Why this qualified, as facts. */
  because: Because
  /**
   * THE SAME FACTS IN PLAIN WORDS, built by `whyInWords` from `because` and from nothing else.
   *
   * The design leaves the words to the browser, and the browser is wave 2 step 6. Until that lands
   * — and afterwards, for every agent that reads this route — a row that cannot say why it is here
   * is a number nobody can check, which is the whole failure this queue exists to end. The sentence
   * is DERIVED from `because` in one function, so the two cannot come to disagree.
   *
   * THE BROWSER DRAWS THIS FIELD AND DOES NOT REBUILD IT. `whyInWords` lives in a server library
   * that reaches the database client, so a component importing it would pull the database into the
   * browser bundle. The words are on the wire on every row for that reason; writing a second copy of
   * these sentences in a component is the one thing that would make the queue and the screen able to
   * disagree about why something is waiting.
   */
  why: string
  /**
   * WHERE A SET-ASIDE ROW CAME FROM. Present only on tier `set-aside`.
   *
   * Pushing something away never loses why it was there: the tier it would be in, the reason it
   * qualified, and that reason in words are all kept.
   */
  setAsideFrom?: { tier: 'settle' | 'asked'; act: WaitingAct; because: Because; why: string }
  /** Which project it lives in. Reported, never used to filter — this reading spans projects. */
  workspaceId: string
  /** What that project is called, so a cross-project row is never a silent 404. */
  workspaceTitle: string | null
  kind: string
  title: string
  /**
   * THE PERSON'S OWN WORDS ABOUT TIME, on the one kind of row that is a planning intent, and null
   * on every other. Problem 1LfS2wzuJerO: an intent's row used to be TITLED with these words, so
   * the person's card read "around 1.5 maybe more" and told them nothing. The row's title is the work the
   * time is for; these words are the estimate beside it, kept exactly as written — the eighth rule
   * lets none of it be parsed, and the interface draws them with a label, not as a mystery.
   */
  said: string | null
  /** How many live things this is holding up, counted from `blocks` links out of it. */
  blocking: number
  /**
   * When it started waiting.
   *
   * Null when nothing recorded it — a `whose_move` value with no revision behind it is the case,
   * and the honest answer is that nobody wrote down when. The design typed this as always present;
   * substituting the record's filing date would be a guess wearing a fact's clothes.
   */
  since: string | null
  /**
   * AN ACT ON THE OWNER'S OWN WORDS THAT STILL STANDS ON THIS ROW'S RECORD, or null, which is the
   * ordinary answer.
   *
   * WHEN IT IS NOT NULL, AND IT IS WORTH SAYING BECAUSE IT LOOKS LIKE A CONTRADICTION. An act on the person's
   * words usually takes something OFF this list — a closed problem is not asking the person anything any
   * more. What is left on the list with one is the case where an agent changed something on the person's
   * words and the row is still waiting for a different reason: a fork it reclassified that is still
   * open, or a record it wrote on that still asks the person something else. Those are exactly the rows
   * where the person most needs to see whose words were used, so the row carries the act.
   * `design/messages/ACCEPTANCE.md` W2.
   */
  onThePersonsWords: ActOnTheirWords | null
  /**
   * A CLAIM THAT THIS FORK WAS REPLACED, WHICH DID NOT TAKE IT OFF THE LIST, or null, which is the
   * ordinary answer and the only answer on a row that is not a fork. Problem lXf2ecxwr3sk.
   *
   * It is the fork desk's own `replacedButStillHere` for the same fork, from `readForks`, so the two
   * lists cannot give the owner two accounts of one link. Its sentence is the last sentence of `why`.
   * It is reported beside the row and decides nothing: the row is here for the reason `because` gives.
   */
  replacedButStillHere: ReplacedButStillHere | null
  /**
   * WHO PASSED THIS QUESTION ON TO THE PERSON, or null because nobody had to. Criterion P55.
   *
   * A question an agent with a starter asks is with that starter until it is passed on, so a row
   * that IS on this list either came up through the chain — and this names the last one to hand it
   * over — or came from an agent nobody recorded a starter for, which is null. `whyInWords` does not
   * rebuild it; it is a name, and the queue is where the name is known.
   */
  passedOnBy: PassedItOn | null
  /**
   * WHERE A KEY ASK CAME FROM, AND WHEN THE AGENT'S KEY WAS LAST USED. Present only on a new-key ask
   * and a waiting registration; finding 83, mend b2. The words are the ones the ask's own page
   * shows, written by src/server/lib/where-an-ask-came-from.ts.
   */
  theAsk?: WhatAnAskShows
  /**
   * THE PERSON'S PRESS ON A WAITING ASK: who asks, the card, and what the press does. Present only on a
   * waiting card ask, new-key ask or self-registration (problem NXEhOBumu5ZZ). It is the same reading the
   * ask's own page draws its press from, `thePressOnThisAsk` in src/server/lib/newkey.ts, so Home, the
   * Embassy and that page draw one press the same way. The press itself is still asked for real at
   * POST /api/roles/requests/<id>/grant or /refuse, which only the person may press here.
   */
  thePress?: WaitingCardAsk
  /**
   * WHO ASKS FOR WHICH CARD, on a waiting card ask and on no other row. The Decisions page and
   * Home write the row in the page's words from it, because the stored title names the asker by a registry id nobody
   * chose. The stored title is left as it is. `theAskerAndCardOn` works it out.
   */
  askerAndCard?: AskerAndCard
  /**
   * THE NAME A SESSION THAT REGISTERED ITSELF GAVE, on a waiting self-registration and on no other row.
   *
   * Its stored title is "<handle> registers itself", which names an agent by the handle it typed where the
   * person looks for the name they gave it. This carries the display name the registration sent, so Home and
   * the Decisions page can name the agent as its own row does. The stored title is left as it is.
   */
  selfRegistration?: { name: string; handle: string }
  /**
   * A REQUEST FOR ONE PRESS, on a row of kind `request for one press` and on no other. The
   * sentence the office wrote, the agent's own words, and who asked. The popup and Home draw the row from this, so the
   * two read one list. The press itself is POST /api/one-press/<id>/agree or /refuse.
   */
  theOnePress?: { act: KnownActName; shows: string; because: string | null; askedBy: string; askedByHandle: string | null }
  /**
   * A READINESS CHECKLIST THAT WAITS FOR THE PERSON'S SIGNATURE, on a row of kind `readiness checklist` and on no other
   * . The sentence its signers read, when its time runs out, and who else has
   * not signed. The press is on the checklist's own page, #/readiness/<id>.
   */
  theReadiness?: { shows: string; endsAt: string; notSigned: string[] }
  /** The package's task and agents, on its own page rather than the record door. */
  theSigningPackage?: Pick<ASigningPackage, 'task' | 'forAgent' | 'broughtBy'>
  /**
   * THE REGISTERED AGENT THIS ROW CAME FROM, or why there is none. Round 31b of wave 13k.
   *
   * Home's Agents at work marks a group, and an agent in it, as needing the person from this field and from nothing
   * else, so the mark and the Needs you box are one reading and cannot disagree (the round's review found groups
   * marked from the agents' work states beside a box that said nothing waited). It is worked out once, here, by
   * `theAgentEachRowCameFrom` below:
   *   - a question an agent asked (tier `asked`, rule `whose-move`): the one who wrote `whose_move`, the same
   *     writer `because.writtenBy` names;
   *   - every other row whose id is a record (a fork, a message, a card ask, a residency proposal, a goal, a
   *     packaged task): whoever filed the record, the first revision of the ledger (`whoWroteRecords`);
   *   - a planning intent: whoever wrote it, its own `createdBy`;
   *   - a visitor at the door: `not-an-agent`, because it is not let in and no roster holds it.
   * A writer that is a person or Mole Office itself is `not-an-agent`. A writer nobody recorded, or an agent id that
   * names no registered agent or more than one, is `cannot-tell`, which is not the same as no agent.
   */
  fromAgent: TheAgentItCameFrom
}

/** Which registered agent a waiting row came from: its registry id, or which of the two kinds of none it is. */
export type TheAgentItCameFrom =
  | { answer: 'an-agent'; agentId: string }
  | { answer: 'not-an-agent' }
  | { answer: 'cannot-tell' }

// ============================================================================ what is not counted

/**
 * WHY SOMETHING THE OWNER MIGHT EXPECT TO SEE IS NOT A ROW.
 *
 * One key per bucket, and every key is something THIS READING can work out from the corpus. A
 * reason that lives only in a document is not one of these, because a reading that cannot see the
 * document cannot count it.
 */
export type ExcludedReason =
  | 'waiting-on-a-worker'
  | 'record-deleted'
  | 'somebody-else-settles-it'
  | 'done-on-your-words'
  | 'with-a-starter'
  | 'withdrawn-by-its-asker'

/**
 * One sentence per bucket, written once, phrased as a fact a person can check.
 *
 * The same shape `LEFT_OUT_SENTENCES` in openloops.ts uses: the key is on the wire, the words are
 * built from the key in one place, and no sentence is stored beside a count.
 */
export const EXCLUDED_SENTENCES: Readonly<Record<ExcludedReason, string>> = {
  'waiting-on-a-worker':
    'it is a queued agent run that nobody has picked up. Nothing is listening for it, which is being stuck ' +
    'rather than a choice anybody has to make',
  'record-deleted':
    'the record is deleted and something that is still here links to it, so it would have been on this list and ' +
    'there is nothing left to open',
  'somebody-else-settles-it':
    'the fork says somebody other than you settles it — an agent, the agent that spawned the one that filed it, ' +
    'or a measurement — so an agent may close it and it is not waiting on you. It is still an open fork on GET ' +
    '/api/forks, because nobody has closed it yet',
  'done-on-your-words':
    'an agent already acted on it, quoting words of yours: it either settled the fork with a decision or handed ' +
    'the fork to an agent. Your sentence is on the act, on that record, and one press there takes it back',
  'with-a-starter':
    'an agent said it needs you and that agent has a starter, so the question is with the starter first. They ' +
    'pass it on, close it, or take the question off the record. It reaches this list when somebody passes it on',
  'withdrawn-by-its-asker':
    'an agent asked you for a card and then withdrew the request before you answered it. The request is kept, and ' +
    `it is listed here for ${A_WITHDRAWAL_IS_LISTED_FOR_DAYS} days after the withdrawal, with who withdrew it and when`,
}

/**
 * A REQUEST TO THE PERSON THAT ITS ASKER WITHDREW, listed under what is not counted for 7 days after the withdrawal
 * (decision tFl1YWLH3eCl). After that it is on its own record and in search, and is never gone.
 */
export interface WithdrawnRequest {
  /** The request's record id. */
  id: string
  title: string
  workspaceId: string
  workspaceTitle: string | null
  /** When it was withdrawn, as the request stores it. */
  at: string
  /**
   * The registry id of the agent that withdrew it, or the stored id where no one agent answers it; and that agent named
   * as the asker is, by `theAgentAsItsMessageNamesIt`, so one line names one agent one way.
   */
  byId: string
  by: string
  /** Whether that agent was the asker or the asker's registered starter. */
  as: WithdrawnAs
  /** Who asked for which card, on a withdrawn card ask, worked out as on a waiting one. */
  askerAndCard?: AskerAndCard
}

/** Who asks for a card, named as the message from it names it, and the card it asks for. */
export interface AskerAndCard {
  asker: string
  card: string
}

/**
 * WHO ASKS FOR WHICH CARD, or undefined because the record is not a card ask: a new-key ask and a waiting
 * self-registration are not, and neither is a request that stores no card or no asker. The ask is read as it stood
 * before any answer, so a withdrawn ask is told apart by the same reading as a waiting one. The asker is named by
 * `theAgentAsItsMessageNamesIt`.
 */
function theAskerAndCardOn(record: PanelRecord): AskerAndCard | undefined {
  if (whatAPressOnThisAskDoes({ ...record, data: { ...record.data, answer: null } })?.press !== 'card') return undefined
  const card = record.data['asking']
  const askerData = record.data['asker'] as { id?: unknown } | undefined
  if (typeof card !== 'string' || card === '' || typeof askerData?.id !== 'string' || askerData.id === '') return undefined
  return { asker: theAgentAsItsMessageNamesIt(askerData.id), card }
}

/**
 * AN AGENT NAMED AS THE UNREAD MESSAGE FROM IT NAMES IT: its name, or its handle when the
 * registry holds no name for it, or the stored string as it is where no one agent answers it. The asker of a card ask
 * and whoever withdrew an ask are both named here, so one line names one agent one way.
 */
function theAgentAsItsMessageNamesIt(stored: string): string {
  const one = theOneAgentAStringNames(sqlite, stored)
  return one === null ? stored : one.name.trim() !== '' ? one.name.trim() : one.handle
}

/** One bucket, with how many are in it. Never a stored number. */
export interface ExcludedGroup {
  reason: ExcludedReason
  count: number
  /** On `withdrawn-by-its-asker` only: the requests themselves, newest withdrawal first. */
  withdrawn?: WithdrawnRequest[]
}

/** The whole reading: the rows, the three counts, and what could not be listed. */
export interface WaitingReading {
  items: WaitingItem[]
  counts: { settle: number; asked: number; setAside: number }
  excluded: ExcludedGroup[]
}

// ============================================================================ the stated scope

/**
 * WHAT THIS READING COVERS, AND WHAT IT DELIBERATELY DOES NOT CARRY.
 *
 * The first version of this design never said what scope it had, while the two things it unions
 * have opposite ones: `readForks()` is cross-project on purpose and `GET /api/whose-move` is
 * scoped to one project. Three parts of one band cannot sum unless they have one scope, so the
 * scope is stated here, once, and both halves take it.
 */
export const WAITING_SCOPE =
  'Everything waiting on the person, in every project at once. A fork waiting on you does not stop waiting ' +
  'because you are reading a different project today, and the owner settled that in DECISIONS-PENDING §39: a ' +
  'cross-project governance desk through a person-level projection, without weakening workspace-scoped record ' +
  'access. GET /api/records/:id is unchanged and still refuses a cross-project id. THE WIDENING IS BOUNDED BY ' +
  'WHAT A ROW CARRIES: an id, a project and its name, a kind, a title, the act, why it qualified, how many ' +
  'live things it is holding up and when it started waiting — and, on the one row that is a planning intent, ' +
  'the words the person wrote about time. No body, no summary, no field values, with one exception: a waiting ' +
  'card ask or self-registration also carries where the ask came from and the press that answers it, which ' +
  'names who asks, the card and what the press does. Every row also says which registered agent it came from, ' +
  'by its registry id, or that it came from no agent or cannot say. The route ' +
  'takes no path parameter, no query string and no body, so there is no shape of request a caller can aim at a ' +
  'record it would not otherwise be shown.'

// ============================================================================ small readers

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const dataOf = (record: { data?: unknown }): Record<string, unknown> => (isObj(record.data) ? record.data : {})

/**
 * WHETHER THIS RECORD'S OWN STATE WORD SAYS THE WORK HAS ENDED. `theWorkHasEnded` in shared/work.ts is
 * the one answer: the open-loops reader and the side card on a record page ask it too, so the card
 * cannot say a closed record still needs a person while this list leaves it out.
 */
function hasEnded(record: { data?: unknown }): boolean {
  return theWorkHasEnded(record.data)
}

/**
 * The two fields the owner's set-aside is stored in, named once.
 *
 * Exported so that the kind declaration which makes them writable reads the key from here rather
 * than spelling it a second time. They are read off `records.data`, which is a JSON column, so
 * nothing about this needs a database migration.
 */
export const SET_ASIDE_UNTIL = 'set_aside_until'
export const SET_ASIDE_BECAUSE = 'set_aside_because'

const stringField = (record: { data?: unknown }, key: string): string | null => {
  const value = dataOf(record)[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

// ============================================================================ who wrote a value

/**
 * WHO ASKED — the answer this queue needs, read where the guard beside it reads it.
 *
 * `whoWroteTheValue` in lib/revisions.ts is the one reading of who put the value a field holds now
 * there, off the revision ledger, and `assertMayRemoveAnAsk` asks it before refusing an agent that
 * tries to withdraw somebody else's question. This queue asks the same function about the same field,
 * so the door and the list cannot come to disagree about whose request is on a record. Null means the
 * ledger cannot say, and it is neither "a person" nor "an agent" — the row says nobody recorded who.
 *
 * THE `actorId` IS WHY THE ROW CAN NAME THE ASKER. The guard compares it — an agent may withdraw its
 * own request and no other agent's — so `whyInWords` has the same id to put in the sentence, and the
 * promise the row makes to the owner is the promise the door keeps.
 */
function whoAsked(record: Pick<PanelRecord, 'id' | 'data'>): { actorType: string; actorId: string; at: string } | null {
  return whoWroteTheValue(record.id, 'whose_move', dataOf(record)['whose_move'])
}

// ============================================================================ asking the guards

/**
 * THE AGENT THIS READING ASKS THE GUARDS ABOUT, AND WHY IT IS THE MOST PRIVILEGED ONE POSSIBLE.
 *
 * Tier 1's rule is "the act is refused to EVERY agent". Testing it with a weak caller would prove
 * something smaller: an agent that sent no headers is refused by a clause about headers, and one
 * arriving from another machine is refused by a clause about machines, and neither says anything
 * about agents. So the probe states its identity and is at this machine — every clause that could
 * refuse it for a reason other than being an agent is already satisfied. If this one is refused,
 * they all are.
 *
 * IT IS NEVER PASSED TO ANYTHING THAT WRITES. It goes to `assertMay*` functions and nowhere else,
 * and those write nothing; the whole point of the probe is to be turned away.
 */
const PROBE: Actor = {
  type: 'agent',
  id: 'mole-office-asking-what-is-refused',
  stated: true,
  from: 'this machine',
}

/**
 * DID THE GUARD REFUSE? Asked by calling it, never by reading a table about it.
 *
 * ONLY A 403 COUNTS AS A REFUSAL, and anything else is rethrown. A guard that threw a `TypeError`
 * because this file handed it the wrong shape would otherwise be read as "refused to agents", and
 * the queue would fill up with rows built on a bug. That is invariant 4 of USER.md: catch only what
 * you can honestly handle. This can honestly handle a refusal and nothing else.
 */
function refusedTheProbe(ask: () => void): boolean {
  try {
    ask()
    return false
  } catch (error) {
    if (error instanceof PanelError && error.status === 403) return true
    throw error
  }
}

/** One object an act is pending on, with the facts a row needs beside it. */
export interface PendingObject {
  id: string
  workspaceId: string
  /**
   * What the object is: a record's kind, or `planning intent` for the one act pending on those.
   *
   * A string rather than a `RecordKind`, because not every object a person-only act is pending on
   * is a record. Each act's own query knows which it produces and hands its guards the right shape.
   */
  kind: string
  title: string
  blocking: number
  /** When it started waiting: for a fork, the day it was filed. */
  since: string
  /**
   * THE PERSON'S OWN WORDS ABOUT TIME, on the one object that is a planning intent, and absent on
   * every other. Problem 1LfS2wzuJerO: an intent's row used to be titled with these words — "around
   * 1.5 maybe more", the estimate itself — so the card said nothing else a person could read. The
   * row's title is now the WORK the time is for, and the words travel beside it so the interface
   * can draw them as what they are: an estimate, awaiting one press.
   */
  said?: string
}

/** One door, with the guard standing at it. `ask` CALLS the guard; it does not describe it. */
export interface ActDoor extends RefusedDoor {
  ask: (object: PendingObject, actor: Actor) => void
}

/**
 * AN ACT THAT IS PENDING ON SOMETHING, AND EVERY DOOR AN AGENT COULD PERFORM IT THROUGH.
 *
 * `pending` is the query that finds the objects the act is pending on. A guard can refuse an act
 * without there being any queue of objects — deleting a fork is one — and such a guard can never
 * put a row in a queue, so it is not one of these.
 */
export interface PendingAct {
  act: WaitingAct
  doors: readonly ActDoor[]
  /**
   * The objects the act is pending on. It is handed the fork desk this reading already read, so an act
   * that asks about forks reads the same desk and does not read every fork of the office again.
   */
  pending: (forks: ForksRead) => PendingObject[]
}

/**
 * HOW THIS READING ASKS ONE REGISTERED GUARD ABOUT ONE CANDIDATE.
 *
 * `guard` is the FUNCTION, matched by identity against `GOVERNANCE_GUARDS`. Nothing here writes a
 * guard's name or its route as a string: both are read off the registry entry, so an entry cannot
 * name a guard that does not exist and renaming one cannot leave a stale name on a row.
 *
 * What this file DOES supply is the argument list, because the guards take different ones — each is
 * handed what its own act is about — and a registry entry cannot know what a caller would pass.
 */
interface AskOneGuard {
  guard: GovernanceGuard['guard']
  /** What coming through this door would do, in words a person reading their queue can use. */
  what: string
  ask: (object: PendingObject, actor: Actor) => void
}

/**
 * THE THREE DOORS ONTO A FORK, in the order somebody would meet them.
 *
 * `GOVERNANCE_GUARDS` registers the first two as standing in front of the same queue — a live
 * proposal with no decision a person linked to it — because settling is one act with two halves:
 * the decision, and the link that points it at the fork.
 *
 * THE THIRD IS ASKED TOO, AND THAT IS A CHOICE WORTH STATING. The registry gives
 * `assertMayRemoveAFork` no queue of its own, correctly: nothing is waiting to be deleted. But tier
 * 1 is "yours to settle", and a queue an agent can empty is not yours. So a fork is a row here only
 * while all three refuse — the two that stop an agent answering it, and the one that stops an agent
 * taking the question away. If any of the three stopped refusing, the row leaves rather than going
 * on promising something the product no longer does.
 */
/**
 * THE PROBE'S DECISION SAYS WHAT IT STANDS ON, AND UNTIL 3 SEPTEMBER 2026 IT DID NOT.
 *
 * `assertMaySettleFork` asks two things of an agent, in order: does the fork say somebody other
 * than the owner settles it, and does the decision being pointed at it carry an `authority`. The
 * probe used to hand over `{ kind, title }` with no fields at all, so the second question failed on
 * every fork and the first was never reached. The guard's answer was therefore the same on every
 * row — "a decision that does not say what it stands on settles nothing" — and this reading could
 * not see `who_settles_it` at all, however a fork was classified.
 *
 * WHAT IT COST. `GET /api/forks` read the field and `GET /api/waiting` did not, so on 3 September
 * 2026 twelve forks were described one way on the fork desk and the opposite way on the owner's own
 * list, and that list filled with engineering choices that were not the owner's to make.
 * Problem `VpL3AJ9C6ogP` has the measurement.
 *
 * WHY A WORD HERE IS NOT A FABRICATED FACT. The probe already asks about a decision that does not
 * exist, which is what makes it a probe. `assertMaySettleFork` checks only that the authority is one
 * of the five declared words, so which word this is says nothing about anything: it stands for "a
 * decision an agent is allowed to write". `AGENT_AUTHORITIES` is the list an agent may claim for
 * itself, and this reading takes the first of them rather than naming one, so a change to that list
 * cannot leave a word here that an agent may no longer use.
 *
 * NO REFUSAL MOVED. The three answers that keep a fork on the owner's list are exactly as they were: the
 * fork says the owner settles it, nobody has classified it, or an agent wrote the classification
 * onto it after it was filed. An agent still cannot take a fork off the owner's list by classifying it.
 */
const A_DECISION_AN_AGENT_MAY_WRITE = AGENT_AUTHORITIES[0]

const SETTLING_A_FORK: readonly AskOneGuard[] = [
  {
    guard: assertMayWrite,
    what: 'write the decision that settles it',
    ask: (object, actor) => {
      assertMayWrite(DECISION_KIND, 'promote', actor, object.id)
    },
  },
  {
    guard: assertMaySettleFork,
    what: 'point an existing decision at it, which is what settling is',
    ask: (object, actor) => {
      // PROPOSAL_KIND, NOT `object.kind`. This act's query below returns forks and nothing else, so
      // the kind is a fact about the query rather than something to be carried on every object.
      assertMaySettleFork(
        { kind: DECISION_KIND, title: 'a decision', data: { authority: A_DECISION_AN_AGENT_MAY_WRITE } },
        { id: object.id, kind: PROPOSAL_KIND, title: object.title },
        RESOLVES_PROPOSAL,
        actor,
      )
    },
  },
  {
    guard: assertMayRemoveAFork,
    what: 'delete the question instead of answering it',
    ask: (object, actor) => {
      assertMayRemoveAFork({ id: object.id, kind: PROPOSAL_KIND, title: object.title }, actor)
    },
  },
]

/**
 * THE ONE DOOR ONTO SCHEDULING WORDS ABOUT TIME.
 *
 * `assertMayCommitAnIntent` is the fifth registered guard and the second with a queue behind it:
 * every set of words Mole Office read a period out of, that nobody has committed, is sitting on the
 * planning screen waiting for one press only a person may make. The design said this would happen —
 * *"the second refused act that gets built lands in the queue when its guard is registered"* — and
 * `tests/waiting-queue.test.ts` is what would have failed had this reading ignored it.
 */
const SCHEDULING_KEPT_WORDS: readonly AskOneGuard[] = [
  {
    guard: assertMayCommitAnIntent,
    what: 'turn your words about time into hours on your calendar',
    ask: (object, actor) => {
      const intent = getIntent(object.id)
      // The guard is asked about the intent itself, so a refusal is about the real thing rather
      // than about a shape this file made up. An intent that vanished between the query and here is
      // not refused to anybody and is not a row.
      if (intent === null) return
      assertMayCommitAnIntent(intent, actor)
    },
  },
]

/**
 * The registry entry for a guard, or a loud failure.
 *
 * A guard this reading asks that nobody registered would be a second list of governance guards
 * growing here, which is the thing `GOVERNANCE_GUARDS` exists to prevent. It throws rather than
 * skipping, because skipping would quietly shorten the owner's queue — and it throws at module load,
 * so it is the first test run that fails and never a request.
 */
function registryEntryFor(guard: GovernanceGuard['guard']): GovernanceGuard {
  const entry = GOVERNANCE_GUARDS.find((registered) => registered.guard === guard)
  if (entry === undefined) {
    throw new Error(
      `GET /api/waiting asks the guard "${guard.name}" about what is waiting on the person, and ` +
        `GOVERNANCE_GUARDS in lib/records/governance-guards.ts has no entry for it. Register it there, beside the others, or ` +
        `stop asking it here — this reading may not keep a second list of what is refused.`,
    )
  }
  return entry
}

/** One act, with its doors' names and routes read off the registry rather than written here. */
function actOn(act: WaitingAct, doors: readonly AskOneGuard[], pending: (forks: ForksRead) => PendingObject[]): PendingAct {
  return {
    act,
    doors: doors.map((door) => {
      const entry = registryEntryFor(door.guard)
      return { guard: door.guard.name, route: entry.route, what: door.what, ask: door.ask }
    }),
    pending,
  }
}

/** What a row calls a planning intent, which is the one object here that is not a record. */
export const PLANNING_INTENT = 'planning intent'

/**
 * A PLANNING INTENT NOBODY HAS COMMITTED, that Mole Office read a period out of, and that names a piece
 * of work — the registry's own three conditions, and the same three `commitIntent` checks before it
 * does anything.
 *
 * IT NAMES A LIVE RECORD OR IT IS NOT A ROW. An intent whose work has been deleted has nothing left
 * to schedule time against; it is counted in `excluded` under `record-deleted` rather than dropped,
 * so the owner is told it is somewhere else instead of being left one short.
 */
function intentsWaitingForOnePress(): { pending: PendingObject[]; workIsGone: number } {
  const pending: PendingObject[] = []
  let workIsGone = 0
  for (const intent of listIntents()) {
    if (intent.state === 'committed') continue
    if (intent.period === null) continue
    if (intent.recordId === null) continue
    const work = getRecord(intent.recordId)
    if (work === null || work.deletedAt !== null) {
      workIsGone += 1
      continue
    }
    pending.push({
      id: intent.id,
      workspaceId: work.workspaceId,
      kind: PLANNING_INTENT,
      // THE ROW IS THE WORK THE TIME IS FOR, NOT THE TIME ITSELF. Problem 1LfS2wzuJerO: the row
      // used to be titled `intent.said` — for this corpus, three cards on the owner's own queue
      // reading "around 1.5 maybe more" and nothing else. The words are the estimate, kept whole
      // in `said` beside the title, and the interface draws them as what they are.
      title: work.title,
      // An intent holds nothing up by a `blocks` link, because it has none. Zero is the count.
      blocking: 0,
      since: intent.createdAt,
      // THE PERSON'S OWN WORDS, exactly as they wrote them. The eighth rule keeps them unparsed
      // wherever they are shown, and the interface shows a label and the words, never a parse.
      said: intent.said,
    })
  }
  return { pending, workIsGone }
}

/**
 * THE ONE DOOR ONTO A MACHINE'S GUESS ABOUT WHICH CODE A RECORD OWNS.
 *
 * `assertMayAcceptAGuess` is the sixth registered guard and the third with a queue behind it: every
 * un-accepted `llm` row of `implementation_map` is sitting in the "proposed" list of some record's
 * page, saying that an agent worked out this module owns this code and nobody has answered. Only a
 * person may turn that into ownership, because an agent accepting its own inference is the product
 * answering its own governance question — so it belongs in the queue that lists what is the
 * person's alone.
 *
 * THE ROW OPENS THE RECORD AND NOT THE RELATIONSHIP, which is why `PendingObject.id` below is the
 * RECORD's id. A relationship has no page; the panel that draws it is on the record's page, which
 * is where the press is.
 */
const ACCEPTING_A_GUESS: readonly AskOneGuard[] = [
  {
    guard: assertMayAcceptAGuess,
    what: 'accept a relationship a machine guessed, which is what turns it into ownership',
    ask: (object, actor) => {
      assertMayAcceptAGuess(
        { id: object.id, recordId: object.id, pattern: object.title, provenance: 'llm' },
        actor,
      )
    },
  },
]

/**
 * THE ONE DOOR ONTO SAYING A PACKAGE'S TASK IS FINISHED. Criterion F16 point 5.
 *
 * `assertMayConfirmPackage` is the seventh registered guard and the fourth with a queue behind it:
 * every packaged task that has something back from outside and no confirmation is waiting for the
 * responsible one, or for the person, to say it is finished. The guard is asked about each such task
 * here; it refuses the probe, because the probe is an agent that is not that task's responsible one,
 * so the task reaches the person's list without this file deciding anything the guard does not.
 */
const CONFIRMING_A_RETURN: readonly AskOneGuard[] = [
  {
    guard: assertMayConfirmPackage,
    what: 'confirm the task is finished',
    ask: (object, actor) => {
      // THE TASK ITSELF, so the guard asks `responsibleFor` about the real record rather than about
      // a shape this file made up. The id is what it needs; the title is for a sentence that names
      // the task, and it is the object's own title.
      assertMayConfirmPackage({ id: object.id, title: object.title }, actor)
    },
  },
]

/** The person's Confirm press for an agent-filed goal. Criterion P1. */
const CONFIRMING_A_GOAL: readonly AskOneGuard[] = [
  {
    guard: assertMayConfirmAGoal,
    what: 'confirm an agent-filed goal, which clears the mark that says it is the agent’s',
    ask: (object, actor) => {
      // The guard checks the field the Goals page sends through the record write door.
      assertMayConfirmAGoal({
        kind: object.kind,
        arriving: { confirmed_by: { by: THE_PERSON, at: '2026-01-01' } },
        actor,
      })
    },
  },
]

/**
 * THE ACTS THAT PUT A ROW IN TIER 1.
 *
 * FIVE ACTS, WHICH IS THE HONEST STATE OF THE PRODUCT TODAY. Each one has a queue of objects pending
 * on it: settling a fork, putting kept words about time on the calendar, accepting a machine's
 * relationship guess, confirming a returned task and confirming an agent-filed goal. The registry
 * says which guards have pending objects, and `tests/waiting-queue.test.ts` fails if one is missing
 * from this list.
 *
 * WHAT IS DERIVED AND WHAT IS SUPPLIED. What is REFUSED is derived: every door holds the guard
 * function and the reading calls it, so a guard that stopped refusing agents empties its part of this
 * tier on the next read with nothing to remember. What is supplied here is the argument list each
 * guard takes and the query that finds the objects its act is pending on, because neither of those is
 * something a guard or a registry entry can know.
 */
export const PENDING_ACTS: readonly PendingAct[] = [
  actOn('settle', SETTLING_A_FORK, (forks) =>
    /**
     * THE FORKS NOBODY HAS SETTLED, out of the one reading that decides what "settled" means.
     *
     * `readForks()` is where "a person settled this" is defined, and the queue and the forks desk
     * have to mean the same thing by it. Asking the same question a second way here is how two
     * surfaces come to disagree about whether the owner has answered something. The reading is the
     * one `readWaiting` read at its start, so one answer is worked out from one fork desk.
     */
    forks.open.map((fork) => ({
      id: fork.recordId,
      workspaceId: fork.workspaceId,
      kind: PROPOSAL_KIND,
      title: fork.title,
      blocking: fork.blocks.length,
      since: fork.createdAt,
    })),
  ),
  actOn('schedule', SCHEDULING_KEPT_WORDS, () => intentsWaitingForOnePress().pending),
  actOn('accept', ACCEPTING_A_GUESS, () => {
    // ONE ROW PER RECORD, NOT ONE PER GUESS. A module with eight proposed relationships is one
    // thing to sit down with, not eight rows of a queue that is meant to be short — and every one
    // of them is accepted on the same panel of the same page. The count is on the row, so nothing
    // is hidden by the fold.
    const byRecord = new Map<string, { workspaceId: string; count: number; since: string }>()
    for (const guess of guessesNobodyHasAnswered()) {
      const held = byRecord.get(guess.recordId)
      if (held === undefined) {
        byRecord.set(guess.recordId, { workspaceId: guess.workspaceId, count: 1, since: guess.statedAt })
        continue
      }
      held.count += 1
      if (guess.statedAt < held.since) held.since = guess.statedAt
    }
    const pending: PendingObject[] = []
    for (const [recordId, held] of byRecord) {
      const record = getRecord(recordId)
      if (record === null || record.deletedAt !== null) continue
      pending.push({
        id: recordId,
        workspaceId: held.workspaceId,
        kind: record.kind,
        title: record.title,
        // A proposed relationship holds nothing up by a `blocks` link, because it has none.
        blocking: 0,
        since: held.since,
      })
    }
    return pending
  }),
  actOn('confirm-return', CONFIRMING_A_RETURN, () =>
    // THE ONE READING of "a packaged task with something back and no confirmation", in
    // lib/delegation.ts, which is the same file the column reads its `returned` state from. A task
    // that has been confirmed is not here, because the reader leaves it out; a task with no return
    // is not here either, because there is nothing yet to confirm.
    packagedTasksWaitingToBeConfirmed().map((task) => ({
      id: task.id,
      workspaceId: task.workspaceId,
      kind: 'task',
      title: task.title,
      // A return holds nothing up through a `blocks` link, so nought is the honest count until
      // somebody states one. The front of the list is what is waiting, not what it blocks.
      blocking: 0,
      since: task.since,
    })),
  ),
  actOn('confirm-goal', CONFIRMING_A_GOAL, () => {
    const blockingCount = blockingCounter()
    return listRecords({ workspaceId: ACROSS_WORKSPACES, kind: GOAL_KIND })
      .filter((goal) =>
        goalNeedsConfirmation({ filedBy: goalFiledBy(goal), confirmed: goalIsConfirmed(goal) }),
      )
      .map((goal) => ({
        id: goal.id,
        workspaceId: goal.workspaceId,
        kind: GOAL_KIND,
        title: goal.title,
        blocking: blockingCount(goal.id),
        since: goal.createdAt,
      }))
  }),
]

/** Every door refused the probe, so this act is the person's. Asked object by object. */
function refusedToEveryAgent(act: PendingAct, object: PendingObject): boolean {
  return act.doors.every((door) => refusedTheProbe(() => door.ask(object, PROBE)))
}

// ============================================================================ the words

const aList = (parts: readonly string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`

/**
 * WHY A ROW IS HERE, IN PLAIN WORDS, BUILT FROM `because` AND FROM NOTHING ELSE.
 *
 * One function, so every surface that says why an item is waiting says the same thing. It reads the
 * structured reason and nothing about the record, which is what stops the words and the facts
 * drifting apart: change a fact and the sentence changes with it.
 */
export function whyInWords(because: Because, kind: string, act: WaitingAct): string {
  if (because.rule === 'refused-act') {
    const doors = aList(because.doors.map((door) => door.what))
    // ONE DOOR AND SEVERAL READ DIFFERENTLY, and a sentence that says "every one of them" about a
    // single door is the sort of small wrongness that makes a reader stop believing the rest of it.
    const refused = because.doors.length === 1 ? 'and refused' : 'and refused every one of them'
    // A SECRETARY MAY CONFIRM A GOAL ON THE PERSON'S WORD, naming the evidence, as a decision
    // says, so "only you" and "nothing an agent writes can take it away" are not true of it. The
    // probe names no evidence, and that is what was refused.
    if (act === 'confirm-goal') {
      return (
        `You can ${ACT_IN_WORDS[act]}, or a secretary can on your word, naming the evidence. Mole Office was ` +
        `asked, just now, whether an agent naming no evidence could ${doors} — ${refused}.`
      )
    }
    return (
      `Only you can ${ACT_IN_WORDS[act]}. Mole Office was asked, just now, whether an agent could ${doors} — ` +
      `${refused}. Nothing an agent writes can put this here or take it away.`
    )
  }
  if (because.rule === 'the-persons-press') {
    if (kind === SIGNING_PACKAGE) return sayInEnglish('signingPackages.rowWhy', { what: because.what })
    const from = because.from === null ? 'Nobody recorded who it came from.' : `It came from ${because.from}.`
    // THE ONE PRESS THE AGENT IT IS ABOUT MAY ALSO MAKE: a resident may say its own picture and name are chosen.
    if (act === 'name-resident') {
      return `${because.what} ${from} It leaves this list when you or the resident itself say the picture and the name are chosen.`
    }
    return (
      `${because.what} ${from} Only you can ${ACT_IN_WORDS[act]}, and nothing an agent does takes it off this ` +
      `list.`
    )
  }
  if (because.rule === 'whose-move') {
    if (because.writtenBy === null) {
      return (
        `This ${kind} says the next move is a person's. Nobody recorded who wrote that or when, so Mole Office ` +
        `cannot say who is asking — only that somebody did.`
      )
    }
    const aPersonAsked = because.actorType === 'human'
    const who = aPersonAsked ? `${because.writtenBy}, a person,` : `${because.writtenBy}, an agent,`
    // WHAT AN AGENT CAN DO ABOUT THIS ROW DEPENDS ON WHO ASKED, SO THE SENTENCE DOES TOO.
    // `assertMayRemoveAnAsk` lets an agent withdraw only its OWN request — matching actor type and
    // matching actor id — and refuses the close and the delete to every agent. This sentence used to
    // read "an agent may withdraw its own request" on every row of this tier, which said nothing
    // about WHICH agent and was read as any of them. It named a permission nobody has on a row the
    // person asked, and it was true of one agent only on a row an agent asked. Naming the asker is
    // what makes it one sentence a reader can act on.
    const whatAnAgentCanDo = aPersonAsked
      ? `No agent can withdraw it, close this ${kind} or delete it.`
      : `Only ${because.writtenBy} can withdraw its own question. No other agent can, and no agent can ` +
        `close this ${kind} or delete it while the question stands.`
    return (
      `${who} wrote on ${because.at ?? 'a date nobody recorded'} that the next move on this ${kind} is a ` +
      `person's. Answering it is yours. ${whatAnAgentCanDo}`
    )
  }
  const who = because.by === null ? 'Somebody' : because.by
  if (because.condition !== null) {
    return (
      `${who} set this aside until: "${because.condition}". Those are your own words and Mole Office never decides ` +
      `that a condition has been met, so it stays set aside until you clear it. It is still counted here.`
    )
  }
  if (because.until !== null && !because.untilRead) {
    return (
      `${who} set this aside until "${because.until}", and Mole Office could not read that as a date. It stays set ` +
      `aside rather than coming back on a day nobody can work out. It is still counted here.`
    )
  }
  return (
    `${who} set this aside until ${because.until ?? 'no date at all'}. It comes back on its own when that day ` +
    `passes; nothing is written and nobody has to remember. It is still counted here.`
  )
}

// ============================================================================ the dedup rule

/**
 * ONE OBJECT, ONE ROW — AND WHICH TIER WINS WHEN AN OBJECT QUALIFIES TWICE.
 *
 * STRONGEST LAST: a source later in this list replaces an earlier one for the same record id.
 *
 *   - `settle` beats `asked`, because a refused act is a stronger statement than a request. An
 *     agent writing `whose_move: person` on a fork cannot demote it out of the tier the guards put
 *     it in.
 *   - `set-aside` beats BOTH, because setting aside is the owner's own act and is the newest thing
 *     on record about the item. The reason it originally qualified is kept on the row.
 *
 * THIS ORDER IS THE WHOLE FIX FOR A MEASURED DEFECT. The second version of this design had it the
 * other way round — `settle` over `asked` over `set-aside` — which made tier 3 unreachable: every
 * item the owner set aside was promoted straight back into the tier it came from, the band read
 * `0 set aside` for ever, and the `Set aside` control wrote two fields and changed nothing anybody
 * could see. `tests/waiting-queue.test.ts` turns red when this order is put back.
 *
 * AND THE DEDUP IS ON THE UNDERLYING OBJECT ID, ACROSS EVERY SOURCE — not tier 1 against tier 2
 * alone, which is where the first version left a hole its own migration walked into.
 */
export const TIER_ORDER: readonly WaitingTier[] = ['asked', 'settle', 'set-aside']

const strength = (tier: WaitingTier): number => TIER_ORDER.indexOf(tier)

// ============================================================================ the reading

/** The record at the far end of a link, so a live one can be told from a deleted one. */
const otherEnd = alias(records, 'waiting_other_end')

/**
 * HOW MANY LIVE THINGS A RECORD IS HOLDING UP, by its own `blocks` links: a counter for one pass of a reading. Its first
 * question counts the links of every record in one grouped read, and every later question in the pass reads that count.
 * It asked once per row before: 106 statements for one `GET /api/waiting` on an office of the live size, which every
 * sidebar page asks (wave 13x round 13). A counter is made per pass and dropped with it, so no count outlives the
 * reading that made it.
 */
function blockingCounter(): (recordId: string) => number {
  let counts: Map<string, number> | null = null
  return (recordId) => {
    counts ??= new Map(
      db
        .select({ from: links.fromId, n: sql<number>`count(*)` })
        .from(links)
        .innerJoin(otherEnd, eq(links.toId, otherEnd.id))
        .where(and(eq(links.type, 'blocks'), isNull(otherEnd.deletedAt)))
        .groupBy(links.fromId)
        .all()
        .map((row) => [row.from, Number(row.n)] as const),
    )
    return counts.get(recordId) ?? 0
  }
}

/**
 * THE RECORDS THAT SAY THE NEXT MOVE IS A PERSON'S, in every project.
 *
 * The SQL narrows to records that carry the field at all; `readWhoseMove` decides what the value
 * means. That split is deliberate: the meaning of the field is written once, in the reader
 * `GET /api/whose-move` already uses, and this file does not get a second opinion about it.
 *
 * The field is asked in the words of `records_whose_move_idx` (migration 0266), so SQLite reads only the records that
 * carry it. Asked in other words, it read the data of every record: 74 ms for the live ones and 27 ms for the deleted
 * ones, on a copy of the office at scale (wave 13y round 27).
 */
function recordsWhereSomebodyAsked(deleted: boolean): PanelRecord[] {
  const carriesTheField = sql`${STORED_FIELDS.whoseMove(records.data)} IS NOT NULL`
  const rows = db
    .select()
    .from(records)
    .where(and(deleted ? isNotNull(records.deletedAt) : isNull(records.deletedAt), carriesTheField))
    .all()
  return rows.filter((row) => readWhoseMove(row as PanelRecord).move === 'person') as PanelRecord[]
}

/** The owner's set-aside on a record, when there is a live one. Null when there is not. */
function liveSetAside(record: PanelRecord, nowMs: number): Extract<Because, { rule: 'set-aside' }> | null {
  const until = stringField(record, SET_ASIDE_UNTIL)
  const condition = stringField(record, SET_ASIDE_BECAUSE)
  if (until === null && condition === null) return null

  // A CONDITION STAYS LIVE UNTIL A PERSON CLEARS IT. Mole Office never decides that somebody's own words
  // have come true — that is an interpretation it cannot defend, and the eighth rule stops at
  // keeping what was written.
  if (condition !== null) {
    const wrote = whoWroteTheValue(record.id, SET_ASIDE_BECAUSE, condition)
    return { rule: 'set-aside', by: wrote?.actorId ?? null, until, condition, untilRead: until === null }
  }

  const when = until === null ? null : parseDueStamp(until)
  if (when === null) {
    // UNREADABLE IS NOT EXPIRED. It stays set aside and the row says the date could not be read.
    const wrote = whoWroteTheValue(record.id, SET_ASIDE_UNTIL, until)
    return { rule: 'set-aside', by: wrote?.actorId ?? null, until, condition: null, untilRead: false }
  }
  // A DATE THAT HAS PASSED IS NOT LIVE. The item returns to the tier it came from on the next read:
  // nothing is written and nobody has to remember.
  if (when < nowMs) return null
  const wrote = whoWroteTheValue(record.id, SET_ASIDE_UNTIL, until)
  return { rule: 'set-aside', by: wrote?.actorId ?? null, until, condition: null, untilRead: true }
}

/**
 * EVERYTHING WAITING ON THE PERSON, READ ONCE.
 *
 * `acts` is the list of acts tier 1 is derived from. It is a parameter with a default so that a
 * test can hand in an act whose guard does not refuse and watch the rows disappear — which is what
 * proves the membership is asked of the guards rather than copied from them. Nothing in the product
 * passes it.
 */
export function readWaiting(
  acts: readonly PendingAct[] = PENDING_ACTS,
  now: Date = new Date(),
  // WHO IS READING. A message row this reader may not read is left out before
  // anything is counted. Left out by a caller that answers no request, which reads every message.
  reader?: AMessageReader,
): WaitingReading {
  const nowMs = now.getTime()
  const blockingCount = blockingCounter()
  // THE FORK DESK, READ ONCE FOR THE WHOLE LIST. It says which forks were claimed replaced by a link
  // that did not count (problem lXf2ecxwr3sk), and which settled forks stand on the person's words, for the
  // count of what is not here. One reading for both, so neither is worked out a second time.
  const forks = readForks()
  const claimedReplaced = new Map(forks.open.map((fork) => [fork.recordId, fork.replacedButStillHere] as const))
  const projectTitles = new Map<string, string | null>()
  const titleOf = (workspaceId: string): string | null => {
    if (!projectTitles.has(workspaceId)) projectTitles.set(workspaceId, getWorkspace(workspaceId)?.title ?? null)
    return projectTitles.get(workspaceId) ?? null
  }

  /** One row per underlying object. A stronger tier replaces a weaker one; see `TIER_ORDER`. */
  const byId = new Map<string, WaitingItem>()
  const keep = (item: WaitingItem): void => {
    const standing = byId.get(item.id)
    if (standing !== undefined && strength(standing.tier) > strength(item.tier)) return
    byId.set(item.id, item)
  }

  /** The set-aside a record carries, worked out once per record and reused by both sources. */
  const setAsideOf = new Map<string, Extract<Because, { rule: 'set-aside' }> | null>()
  const asideFor = (record: PanelRecord): Extract<Because, { rule: 'set-aside' }> | null => {
    if (!setAsideOf.has(record.id)) setAsideOf.set(record.id, liveSetAside(record, nowMs))
    return setAsideOf.get(record.id) ?? null
  }

  /**
   * Offer one row, in its own tier, and — when the owner has set the object aside — the tier 3 row
   * beside it. BOTH GO THROUGH `keep`, AND `TIER_ORDER` DECIDES.
   *
   * THAT IS THE POINT, AND IT IS WHY THIS DOES NOT SIMPLY RETURN THE SET-ASIDE ROW. Making tier 3
   * win by the shape of the code would leave `TIER_ORDER` as a second statement of the same rule,
   * true only because nothing contradicted it — and a rule nothing can contradict is a rule no test
   * can prove. Written this way, reversing `TIER_ORDER` really does put the item back in the tier it
   * came from, which is the defect being guarded against, and the test that names it goes red.
   *
   * SOURCE 3 IS APPLIED HERE, ONCE, so neither of the other two sources has its own opinion about
   * what a set-aside does. Both say "unless set aside" by coming through this function.
   */
  /**
   * THE ROWS THAT ASK THE LEDGER whether anything on their record stands on the person's words: the rows of
   * sources 1 and 2, and the set-aside row made from one. Answered at the end, for all of them at once.
   */
  const asksTheLedger = new WeakSet<WaitingItem>()
  const admit = (
    row: Omit<WaitingItem, 'tier' | 'why' | 'replacedButStillHere' | 'fromAgent'> & { tier: 'settle' | 'asked' },
    aside: Extract<Because, { rule: 'set-aside' }> | null,
    asksAboutTheirWords = false,
  ): void => {
    // A CLAIM THAT THE FORK WAS REPLACED IS SAID AFTER THE REASON, on this row and on its set-aside
    // row, because it is a fact about the record and not about the tier.
    const claim = claimedReplaced.get(row.id) ?? null
    const withTheClaim = (why: string): string => (claim === null ? why : `${why} ${claim.sentence}`)
    // `fromAgent` is answered at the end, for every row at once, by `theAgentEachRowCameFrom`.
    const own: WaitingItem = { ...row, replacedButStillHere: claim, why: withTheClaim(whyInWords(row.because, row.kind, row.act)), fromAgent: { answer: 'cannot-tell' } }
    if (asksAboutTheirWords) asksTheLedger.add(own)
    keep(own)
    if (aside === null) return
    const setAside: WaitingItem = {
      ...own,
      tier: 'set-aside',
      because: aside,
      why: withTheClaim(whyInWords(aside, row.kind, row.act)),
      setAsideFrom: { tier: row.tier, act: row.act, because: row.because, why: own.why },
    }
    if (asksAboutTheirWords) asksTheLedger.add(setAside)
    keep(setAside)
  }

  /**
   * THE FORKS THAT ARE NOT THE OWNER'S, COUNTED WHILE THEY LEAVE.
   *
   * A row that is simply absent is a shorter list that looks complete, so the ones that leave for a
   * reason the owner would recognise are counted here and reported in `excluded`. The reason is read
   * from `forkIsTheOwnersToSettle`, the same function the guard that let the row go asks, so the
   * count and the guard cannot come to different conclusions about the same fork.
   */
  let somebodyElseSettlesIt = 0

  /**
   * AND THE ONES THAT LEFT BECAUSE THE OWNER SAID SO, COUNTED SEPARATELY FROM THOSE.
   *
   * A fork handed to an agent on the person's own quoted words left this list for a reason they can act on —
   * they can read the act on the record and take it back in one press — and "the fork says somebody
   * else settles it" does not say that. The mechanism is meant to
   * shorten the owner's list, so the list says out loud how much of the shortening was the owner's own doing.
   */
  let onTheirOwnWords = 0

  /**
   * AND THE QUESTIONS THAT ARE WITH A STARTER RATHER THAN WITH THE PERSON. Criterion P55.
   *
   * Counted as they leave, for the same reason the two above are: a list short by three and a
   * complete list read the same unless the list says so. It is a different bucket from the two
   * because it is a different fact — nobody has decided anything about these, somebody above the
   * asker has simply not looked yet — and the sentence for the bucket says who that is.
   */
  let stillWithAStarter = 0

  // ---------------------------------------------------------------- source 1: a refused act
  for (const act of acts) {
    for (const object of act.pending(forks)) {
      if (!refusedToEveryAgent(act, object)) {
        // ONLY THE FORK ACT, because only a fork carries `who_settles_it` and only that act's query
        // returns forks. Another act's object leaving for its own reason is not this bucket.
        if (act.act === 'settle' && !forkIsTheOwnersToSettle(object.id)) {
          // WHICH BUCKET, asked of `forkWasHandedOverOnTheOwnersWords` — the same reading that let
          // the row go, so the count and the guard cannot disagree about one fork.
          if (forkWasHandedOverOnTheOwnersWords(object.id)) onTheirOwnWords += 1
          else somebodyElseSettlesIt += 1
        }
        continue
      }
      const record = getRecord(object.id)
      admit(
        {
          id: object.id,
          tier: 'settle',
          act: act.act,
          because: { rule: 'refused-act', doors: act.doors.map(({ guard, route, what }) => ({ guard, route, what })) },
          workspaceId: object.workspaceId,
          workspaceTitle: titleOf(object.workspaceId),
          kind: object.kind,
          title: object.title,
          said: object.said ?? null,
          blocking: object.blocking,
          since: object.since,
          // Asked below, for the whole list at once (problem 9dYnSFapwm5x).
          onThePersonsWords: null,
          // A REFUSED ACT IS NOT A QUESTION SOMEBODY ASKED, so nobody passed it on. Criterion P55
          // is about `whose_move`, and tier 1 does not read that field at all.
          passedOnBy: null,
        },
        record === null ? null : asideFor(record),
        true,
      )
    }
  }

  // ---------------------------------------------------------------- source 2: an agent asked
  //
  // THE REGISTRY, READ ONCE FOR THE WHOLE LOOP. Criterion P55 walks the chain of starters above the
  // agent that asked, and a query per rung per record would be one read of the table per row.
  const theAgentThisNames = theAgentAStoredReferenceNamesIn(listParticipants().agents)
  for (const record of recordsWhereSomebodyAsked(false)) {
    // A CLOSED RECORD IS NOT ASKING ANYTHING. The field is not cleared when a record ends — a stale
    // `whose_move` on a closed record is a record of what was once asked, which is history — so
    // membership is derived and the item leaves by derivation the moment the record closes.
    if (hasEnded(record)) continue
    // AND A QUESTION THAT IS STILL WITH A STARTER IS NOT THE PERSON'S YET. Criterion P55: the starter started
    // that agent, and it reviews the question first and decides whether it is for the person or can be closed. It is counted as
    // it leaves, like every other row that goes, so the list is never quietly one shorter.
    // `whereTheQuestionIs` is the same reading the closing gate asks, so a question cannot be the
    // starter's at the door and the person's on this list.
    const question = whereTheQuestionIs(record, theAgentThisNames)
    if (!question.reachedThePerson) {
      stillWithAStarter += 1
      continue
    }
    const asked = whoAsked(record)
    admit(
      {
        id: record.id,
        tier: 'asked',
        act: 'answer',
        because: {
          rule: 'whose-move',
          writtenBy: asked?.actorId ?? null,
          actorType: asked?.actorType ?? null,
          at: asked?.at ?? null,
        },
        workspaceId: record.workspaceId,
        workspaceTitle: titleOf(record.workspaceId),
        kind: record.kind,
        title: record.title,
        said: null,
        blocking: blockingCount(record.id),
        since: asked?.at ?? null,
        // Asked below, for the whole list at once (problem 9dYnSFapwm5x).
        onThePersonsWords: null,
        passedOnBy: question.confirmedBy[question.confirmedBy.length - 1] ?? null,
      },
      asideFor(record),
      true,
    )
  }

  /**
   * SOURCE 3: A VISITING AGENT ASKING TO COME IN. Problem qpq63k1PiBNb.
   *
 * The case: AQZm6esnQqCr needed the person and was not on Waiting on you. That is the one page the person
 * reads to know what waits on them, and it said nothing while things did.
   *
   * A PENDING CREDENTIAL IS NOT A RECORD. It lives in its own table, it carries no `whose_move`, and
   * confirming one is refused to every agent — so it was waiting on the person, only the person, and on no list they
   * read. `id` is the credential's own id; opening the row opens its page at the Embassy, and its
   * two presses are on the row in the one Embassy list since criterion P74.
   *
   * IT IS NOT NARROWED TO A PROJECT. Credentials belong to the installation, like the registries, and
   * this reading already spans projects.
   */
  for (const credential of everyCredential()) {
    if (!credentialNeedsOwnerAction(credential)) continue
    // A DEVICE IS NOT AN AGENT HERE EITHER. Criterion D2 and the ruling on it: the row and its kind
    // name what is waiting, and the fact is worked out once, from the shared predicate.
    const itIsAPersonsDevice = isAPersonsDeviceCredential(credential)
    admit(
      {
        id: credential.id,
        tier: 'settle',
        act: 'confirm',
        because: {
          rule: 'the-persons-press',
          what: `The ${itIsAPersonsDevice ? 'device' : 'agent'} "${credential.handle}" is asking to come in, and nothing it sends is stored under its handle until you say.`,
          from: credential.machine,
          at: credential.issuedAt,
        },
        // THE PROJECT THE OFFICE ITSELF IS IN. A credential belongs to the installation and to no
        // project, and every row on this list carries one, so it is reported as the project this
        // server is set to rather than left blank or invented.
        workspaceId: settings().workspace,
        workspaceTitle: titleOf(settings().workspace),
        kind: itIsAPersonsDevice ? 'visiting device' : 'visiting agent',
        title: credential.name,
        said: null,
        // A CREDENTIAL HOLDS NOTHING UP THROUGH A LINK. It holds up the agent that asked, which is
        // not a record and is not counted here; nought is the honest number rather than a guess.
        blocking: 0,
        since: credential.issuedAt,
        onThePersonsWords: null,
        passedOnBy: null,
      },
      null,
    )
  }

  /**
   * SOURCE 4: A MESSAGE ADDRESSED TO THE PERSON THAT THEY HAVE NOT READ. Problem qpq63k1PiBNb.
   *
   * The criterion names "questions in messages". A message declares no field saying it asks
   * something — its fields are body, to, target, lead, from, read and urgent, measured 7 September
   * 2026 — so what is knowable is that one is addressed to the person and they have not read it. That is a
   * thing waiting on them and it has one press: open it. Reading it takes it off the list.
   *
   * NOTHING IS GUESSED ABOUT WHICH ONES ARE QUESTIONS. A rule that read the body for a question mark
   * would be Mole Office deciding what an agent meant, which is the second invariant.
   */
  const them: ParticipantRef = { kind: 'person', id: THE_PERSON }
  // THE MESSAGE CENTRE, READ ONCE: every message is kept there and belongs to no project, so a
  // loop over the projects' views would meet a message written in one project and about another twice. The row names the
  // project it was written in, where there is one, and the message centre where there is none.
  //
  // ONLY THE MESSAGES WITH A DELIVERY TO THE PERSON THAT DOES NOT SAY SEEN ARE READ (`messagesWaitingFor`). A message without
  // one cannot pass `unreadAmong` below, so these are every message that could be a row. Reading the whole pool built
  // every message of the office to keep a few: about a sixth of this reading on an office of the live shape (round 35
  // of wave 13n). The tests below still ask every question they asked of the whole pool.
  {
    for (const entry of messagesWaitingFor(MESSAGE_CENTRE, them)) {
      const workspaceId = entry.writtenIn?.project ?? MESSAGE_CENTRE
      if (entry.entry !== 'message') continue
      if (!entry.to.some((who) => who.kind === 'person' && who.id === THE_PERSON)) continue
      if (entry.sentBy !== null && entry.sentBy.kind === 'person' && entry.sentBy.id === THE_PERSON) continue
      // WHETHER THE PERSON HAS READ IT IS `unreadAmong`, THE ONE READER OF THAT FACT, asked about one entry.
      // The rule underneath it — which delivery row counts as seen, and that a line Mole Office wrote
      // itself is not a message waiting on anybody — is private to src/server/lib/messages.ts, and
      // that file belongs to another builder tonight. Copying the rule here would be the ninth
      // invariant broken in the place a person counts what is waiting on them.
      //
      // A LINE THAT BROUGHT A MESSAGE BACK IS THE ONE OFFICE LINE THAT WAITS ON THE PERSON: they pressed Remind me later
      // and asked for it. `messagesWaitingFor` has already kept only what they have not read.
      const broughtBack = isABroughtBackLine(entry)
      if (!broughtBack && unreadAmong([entry], them) === 0) continue
      admit(
        {
          id: entry.id,
          tier: 'asked',
          act: 'read',
          because: {
            rule: 'the-persons-press',
            what: broughtBack
              ? isABroughtBackLineTheSecretarySet(entry)
                ? 'The secretary set this reminder for you under your grant, and the time has come.'
                : 'You pressed Remind me later on a message, and the time you chose has come.'
              : 'A message is addressed to you and you have not read it.',
            from: entry.sentBy === null ? null : entry.sentBy.id,
            at: entry.sentAt,
          },
          workspaceId,
          workspaceTitle: titleOf(workspaceId),
          kind: 'message',
          title: entry.title,
          said: null,
          blocking: blockingCount(entry.id),
          since: entry.sentAt,
          onThePersonsWords: null,
          passedOnBy: null,
        },
        null,
      )
    }
  }

  /**
   * SOURCE 5: AN AGENT ASKING THE PERSON FOR A CARD, OR A SESSION THAT REGISTERED ITSELF AND WAITS. F15
   * point 2; criterion P65. The ask used to be a 409 to an agent whose starter is the person, so it
   * never reached a screen. One press on this row answers it, and where the ask is also a waiting
   * self-registration the same press admits the agent, so a new agent costs one press and not two.
   *
   * IT IS NOT NARROWED TO A PROJECT. A card ask belongs to the project it was made in, and this
   * reading already spans projects; the row carries its project so opening it switches there first.
   */
  const withdrawn: WithdrawnRequest[] = []
  for (const record of listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'role_request' })) {
    const answersTo = record.data['answersTo'] as { kind?: unknown } | undefined
    if (answersTo?.kind !== 'person') continue
    const answered = record.data['answer']
    // A WITHDRAWN REQUEST LEAVES THE ROWS AND IS LISTED UNDER WHAT IS NOT COUNTED, for 7 days after the withdrawal
    // (decision tFl1YWLH3eCl). A withdrawal time that cannot be read is listed, since nobody can tell it has passed.
    const withdrawal = theWithdrawalOf(record)
    const askerAndCard = theAskerAndCardOn(record)
    const selfRegistration = aWaitingSelfRegistration(record)
    if (withdrawal !== null) {
      const at = parseStoredStamp(withdrawal.at)
      if (at === null || Date.now() - at < A_WITHDRAWAL_IS_LISTED_FOR_DAYS * 24 * 60 * 60 * 1000) {
        withdrawn.push({
          ...(askerAndCard === undefined ? {} : { askerAndCard }),
          id: record.id,
          title: record.title,
          workspaceId: record.workspaceId,
          workspaceTitle: titleOf(record.workspaceId),
          at: withdrawal.at,
          byId: withdrawal.by,
          by: theAgentAsItsMessageNamesIt(withdrawal.by),
          as: withdrawal.as,
        })
      }
      continue
    }
    if (typeof answered === 'string' && answered !== '') continue
    const asking = typeof record.data['asking'] === 'string' ? record.data['asking'] : ''
    const askerData = record.data['asker'] as { id?: unknown } | undefined
    const asker = typeof askerData?.id === 'string' ? askerData.id : ''
    // THE ASKER IS NAMED BY ITS OFFICE NAME in the sentence, and kept as stored in `from`. Since
    // the mint (criterion I1) a stored registry id is not a name anybody chose; where no single
    // registry row answers the stored string, the sentence says the unregistered-agent word.
    const askerNamed = theNameAPersonReads({ kind: 'agent', id: asker })
    // WHAT THE PERSON'S PRESS DOES, from the one reading every surface asks (src/server/lib/newkey.ts). A waiting
    // self-registration's words carry the start folder the person's press would also record (problem
    // xHp5rKVKkXRP), and a new-key ask has a verb of its own. A card ask keeps its own words here.
    const press = whatAPressOnThisAskDoes(record)
    const shows = whatThisKeyAskShows(record)
    const thePress = thePressOnThisAsk(record)
    admit(
      {
        ...(shows === null ? {} : { theAsk: shows }),
        ...(thePress === null ? {} : { thePress }),
        ...(askerAndCard === undefined ? {} : { askerAndCard }),
        ...(selfRegistration === null ? {} : { selfRegistration: { name: selfRegistration.name, handle: selfRegistration.handle } }),
        id: record.id,
        tier: 'asked',
        act: press?.press === 'new-key' ? 'give-new-key' : press?.press === 'admit' ? 'admit-agent' : 'give-card',
        because: {
          rule: 'the-persons-press',
          what:
            press === null || press.press === 'card'
              ? `The agent "${askerNamed}" asks you for the ${asking} card. Only you can give it.`
              : press.says,
          from: asker,
          at: record.createdAt,
        },
        workspaceId: record.workspaceId,
        workspaceTitle: titleOf(record.workspaceId),
        kind: 'role request',
        title: record.title,
        said: null,
        blocking: blockingCount(record.id),
        since: record.createdAt,
        onThePersonsWords: null,
        passedOnBy: null,
      },
      null,
    )
  }

  /**
   * SOURCE 6: A SECRETARY PROPOSES AN AGENT AS A PERMANENT RESIDENT, AND ONLY THE PERSON'S PRESS ANSWERS
   * IT.
   * The proposal is left off the open forks (readForks), because a generic settle cannot make the
   * agent's space and is refused. It waits on the person all the same, so it is counted here, as its own kind with its own
   * verb, from `openResidencyProposals`, the reading the residents' doors and pages read. Every count of what waits
   * on the person is the length of this list, so Needs you, the project cards and the rail's badge count it from here.
   */
  for (const proposal of openResidencyProposals()) {
    const agent = proposal.name ?? proposal.handle ?? proposal.agentId
    admit(
      {
        id: proposal.id,
        tier: 'settle',
        act: 'confirm-resident',
        because: {
          rule: 'the-persons-press',
          what: `A secretary proposes that ${agent} become a permanent resident. Only you can confirm it or say not now.`,
          from: proposal.proposedBy,
          at: proposal.proposedAt,
        },
        workspaceId: proposal.workspaceId,
        workspaceTitle: titleOf(proposal.workspaceId),
        kind: RESIDENCY_PROPOSAL,
        title: proposal.title,
        said: null,
        blocking: blockingCount(proposal.id),
        since: proposal.proposedAt,
        onThePersonsWords: null,
        passedOnBy: null,
      },
      null,
    )
  }

  /**
   * SOURCE 6b: A NEW PERMANENT RESIDENT WAITS FOR A PICTURE AND A NAME. A decision: when the
   * person approves a promotion, the office reminds that a picture and a name be chosen. The confirm press writes when
   * it asked (`resident_naming_asked_at`, in the same transaction as the residency), and the row stays until POST
   * /api/residents/:agentId/named records who said they are chosen. A resident confirmed before migration 0233 was
   * never asked, so it has no row. THE ROW'S ID IS THE AGENT'S REGISTRY ID, not a record's, and the page sends it to the
   * agent's own page, where the picture and the name are changed. It is in the project the residency decision is in.
   */
  for (const resident of residentsToBeNamed()) {
    const decision = getRecord(resident.decisionId)
    const workspaceId = decision?.workspaceId ?? 'default'
    admit(
      {
        id: resident.agentId,
        tier: 'asked',
        act: 'name-resident',
        because: {
          rule: 'the-persons-press',
          what: `Choose a picture and a name for ${resident.name}, now a permanent resident.`,
          from: 'Mole Office, when the residency was confirmed',
          at: resident.naming.askedAt,
        },
        workspaceId,
        workspaceTitle: titleOf(workspaceId),
        kind: RESIDENT_TO_BE_NAMED,
        title: `Choose a picture and a name for ${resident.name}, now a permanent resident`,
        said: null,
        blocking: 0,
        since: resident.naming.askedAt,
        onThePersonsWords: null,
        passedOnBy: null,
      },
      null,
    )
  }

  /**
   * SOURCE 7: AN AGENT ASKS THE PERSON TO AGREE TO ONE KNOWN ACT, wave 13n round 45. The
   * requests are read from `theRequestsThatWait` in src/server/lib/one-press.ts, and the popup draws the rows of this
   * kind from this same list, so the popup and Home cannot disagree about what waits.
   */
  for (const request of theRequestsThatWait()) {
    admit(
      {
        theOnePress: { act: request.act, shows: request.shows, because: request.because, askedBy: request.askedBy, askedByHandle: request.askedByHandle },
        id: request.id,
        tier: 'asked',
        act: 'answer',
        because: {
          rule: 'the-persons-press',
          what: `An agent asks you to agree to one act: ${request.shows} Only you can agree or refuse.`,
          from: request.askedBy,
          at: request.askedAt,
        },
        workspaceId: request.workspaceId,
        workspaceTitle: titleOf(request.workspaceId),
        kind: ONE_PRESS_REQUEST,
        title: request.shows,
        said: null,
        blocking: 0,
        since: request.askedAt,
        onThePersonsWords: null,
        passedOnBy: null,
      },
      null,
    )
  }

  /**
   * SOURCE 8: AN OPERATION THAT WAITS FOR THE PERSON'S SIGNATURE. Two
   * decisions, wave 13u
   * round 13. The checklists are read from `theChecklistsWaitingFor` in src/server/lib/readiness.ts, the same reading
   * the readiness page draws its first list from.
   */
  for (const checklist of theChecklistsWaitingFor({ kind: 'person', id: THE_PERSON })) {
    const notSigned = checklist.notSigned.map((one) => one.name ?? one.id)
    admit(
      {
        theReadiness: { shows: checklist.shows, endsAt: checklist.endsAt, notSigned },
        id: checklist.id,
        tier: 'asked',
        act: 'answer',
        because: {
          rule: 'the-persons-press',
          what: `An operation waits for your signature before it runs: ${checklist.shows} It runs when everyone named has signed, and not after ${checklist.endsAt}.`,
          from: checklist.raisedBy.id,
          at: checklist.raisedAt,
        },
        workspaceId: checklist.workspaceId,
        workspaceTitle: titleOf(checklist.workspaceId),
        kind: READINESS_CHECKLIST,
        title: checklist.shows,
        said: checklist.because,
        blocking: 0,
        since: checklist.raisedAt,
        onThePersonsWords: null,
        passedOnBy: null,
      },
      null,
    )
  }

  // SOURCE 9: a secretary's package waiting for the person's signature, in every project.
  for (const pack of theNewestPackages(Number.MAX_SAFE_INTEGER, 'waiting')) {
    admit({
      id: pack.id, tier: 'asked', act: 'answer', kind: SIGNING_PACKAGE,
      theSigningPackage: { task: pack.task, forAgent: pack.forAgent, broughtBy: pack.broughtBy },
      because: { rule: 'the-persons-press', what: sayInEnglish('signingPackages.rowWhat', { secretary: pack.broughtBy.handle ?? pack.broughtBy.id, task: pack.task }), from: pack.broughtBy.id, at: pack.broughtAt },
      workspaceId: pack.workspaceId, workspaceTitle: titleOf(pack.workspaceId),
      title: pack.task, said: null, blocking: 0, since: pack.broughtAt,
      onThePersonsWords: null, passedOnBy: null,
    }, null)
  }

  // WHAT STANDS ON THE PERSON'S WORDS, ASKED OF THE LEDGER ONCE FOR EVERY ROW THAT ASKS IT. Problem
  // 9dYnSFapwm5x: asked row by row it was two queries a row. Each id keeps one row in `byId`, and a
  // set-aside row is the same record, so the answer is set on whichever row won.
  const asking = [...byId.values()].filter((item) => asksTheLedger.has(item))
  const stands = standsOnTheirWordsForEach(asking.map((item) => item.id))
  for (const item of asking) item.onThePersonsWords = stands.get(item.id) ?? null
  theAgentEachRowCameFrom([...byId.values()])

  const items = reader === undefined ? [...byId.values()] : onlyTheMessagesThisReaderMayRead(reader, [...byId.values()])
  // THE ONES HOLDING WORK UP FIRST, THEN THE ONES WAITING LONGEST, THEN BY ID so that two reads of
  // one corpus cannot swap two rows. None of the three is a judgement about importance: all three
  // are facts about the record, which is how the rest of this product ranks. A row with no `since`
  // sorts after the ones that have one, because nobody wrote down when it started.
  items.sort(
    (a, b) =>
      b.blocking - a.blocking ||
      (a.since ?? '9999').localeCompare(b.since ?? '9999') ||
      a.id.localeCompare(b.id),
  )

  return {
    items,
    counts: {
      settle: items.filter((item) => item.tier === 'settle').length,
      asked: items.filter((item) => item.tier === 'asked').length,
      setAside: items.filter((item) => item.tier === 'set-aside').length,
    },
    excluded: [
      ...whatIsNotCounted(forks, somebodyElseSettlesIt, onTheirOwnWords, stillWithAStarter),
      ...(withdrawn.length === 0
        ? []
        : [{
            reason: 'withdrawn-by-its-asker' as const,
            count: withdrawn.length,
            withdrawn: withdrawn.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)),
          }]),
    ],
  }
}

/**
 * WHICH REGISTERED AGENT EACH ROW CAME FROM, set on the rows in place. `WaitingItem.fromAgent` says the rule.
 *
 * The ledger is asked once for every record row (`whoWroteRecords`), as `standsOnTheirWordsForEach` is above, so the
 * list costs one more query and not one per row. A stamp is the ledger's `<type>:<id>`; an agent's id is resolved
 * by `theOneAgentAStringNames`, the one reading of which agent an arriving string names, so an id stored before the
 * registry minted ids and a handle are both read as the agent they name, and a string naming no agent or two is
 * `cannot-tell` rather than a guess.
 */
function theAgentEachRowCameFrom(items: readonly WaitingItem[]): void {
  const fromAWriter = (type: string | null, id: string | null): TheAgentItCameFrom => {
    if (type === 'human' || type === 'system') return { answer: 'not-an-agent' }
    if (type !== 'agent' || id === null || id === '') return { answer: 'cannot-tell' }
    const agent = theOneAgentAStringNames(sqlite, id)
    return agent === null ? { answer: 'cannot-tell' } : { answer: 'an-agent', agentId: agent.id }
  }
  // A LEDGER STAMP IS `<type>:<id>`, split at its first colon; no stamp is nobody recorded.
  const fromAStamp = (stamp: string | null): TheAgentItCameFrom => {
    const colon = stamp === null ? -1 : stamp.indexOf(':')
    return stamp === null || colon < 0 ? { answer: 'cannot-tell' } : fromAWriter(stamp.slice(0, colon), stamp.slice(colon + 1))
  }
  const askedBy = (item: WaitingItem): Extract<Because, { rule: 'whose-move' }> | null =>
    item.because.rule === 'whose-move' ? item.because : item.setAsideFrom?.because.rule === 'whose-move' ? item.setAsideFrom.because : null
  const filed = whoWroteRecords(items.filter((item) => askedBy(item) === null && item.kind !== PLANNING_INTENT && item.kind !== 'visiting agent' && item.kind !== 'visiting device' && item.kind !== ONE_PRESS_REQUEST && item.kind !== READINESS_CHECKLIST && item.kind !== SIGNING_PACKAGE).map((item) => item.id))
  for (const item of items) {
    const asked = askedBy(item)
    if (asked !== null) item.fromAgent = fromAWriter(asked.actorType, asked.writtenBy)
    else if (item.kind === 'visiting agent' || item.kind === 'visiting device') item.fromAgent = { answer: 'not-an-agent' }
    else if (item.kind === PLANNING_INTENT) item.fromAgent = fromAStamp(getIntent(item.id)?.createdBy ?? null)
    // A REQUEST FOR ONE PRESS names the agent whose key filed it.
    else if (item.kind === ONE_PRESS_REQUEST) item.fromAgent = fromAWriter('agent', item.theOnePress?.askedBy ?? null)
    // A READINESS CHECKLIST is raised by the person or by an agent proved by its own key; its own page names which.
    else if (item.kind === READINESS_CHECKLIST) item.fromAgent = { answer: 'not-an-agent' }
    else if (item.kind === SIGNING_PACKAGE) item.fromAgent = fromAWriter('agent', item.theSigningPackage?.broughtBy.id ?? null)
    else item.fromAgent = fromAStamp(filed.get(item.id) ?? null)
  }
}

/**
 * WHAT THE OWNER MIGHT EXPECT ON THIS LIST AND WILL NOT FIND, WITH A COUNT FOR EACH.
 *
 * A number told to the owner is the length of a list of ids plus a visible count of what could not
 * be listed. A count that silently excludes things is the defect round nine shipped; a bucket with
 * a zero count is not carried, because "nothing was left out" is said by the absence of a bucket.
 *
 * `somebodyElseSettlesIt` is counted by the reading itself rather than worked out again here, because
 * it is the reason a row LEFT and only the pass that let it go knows that. Re-deriving it from the
 * corpus would be the same fact worked out in two places, free to disagree with the list it belongs
 * to.
 */
function whatIsNotCounted(
  forks: ForksRead,
  somebodyElseSettlesIt: number,
  handedOverOnTheirWords: number,
  stillWithAStarter: number,
): ExcludedGroup[] {
  const out: ExcludedGroup[] = []

  // QUESTIONS THAT ARE WITH THE ASKER'S STARTER AND NOT WITH THE PERSON. Criterion P55. First, because it
  // is the bucket this reading most often has something in and the one whose count the person can act on:
  // it names how much their secretary has not looked at yet.
  if (stillWithAStarter > 0) out.push({ reason: 'with-a-starter', count: stillWithAStarter })

  // FORKS THE CORPUS SAYS SOMEBODY ELSE SETTLES. Counted first because it is the bucket the owner
  // asked for: the engineering choices that should never have been on the owner's list.
  if (somebodyElseSettlesIt > 0) out.push({ reason: 'somebody-else-settles-it', count: somebodyElseSettlesIt })

  // AND THE ONES THAT LEFT ON THE PERSON'S OWN WORDS. Two ways in, and both are one act an agent made while
  // quoting the person: a fork settled by a decision it filed, and a fork it handed to an agent.
  //
  // THE SETTLED HALF IS READ FROM THE FORK DESK'S OWN ANSWER rather than worked out again here. A
  // settled fork never reaches the loop above — it is not an open fork, so it is not in the queue
  // the guards are asked about — and `readForks().settled` is where "settled, and on whose words"
  // is already decided. Asking a second way is how the desk and this list would come to disagree
  // about the same fork, which is the defect this whole reading exists to avoid.
  //
  // ONE ROW PER FORK, because a fork with two settling links is one thing that left the list.
  const settledOnTheirWords = new Set(
    forks.settled
      .filter((fork) => fork.onThePersonsWords !== null)
      .map((fork) => fork.proposalId),
  ).size
  const onThePersonsWords = handedOverOnTheirWords + settledOnTheirWords
  if (onThePersonsWords > 0) out.push({ reason: 'done-on-your-words', count: onThePersonsWords })

  // A QUEUED RUN NOBODY HAS PICKED UP. It is waiting for a worker to poll, not for a person to
  // judge, so it is stuck rather than governance — and the owner is told where it went rather than
  // being left to wonder why it is not here.
  const queued = db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.state, 'queued'), isNull(agentRuns.claimedBy)))
    .all().length
  if (queued > 0) out.push({ reason: 'waiting-on-a-worker', count: queued })

  // A RECORD THAT WOULD HAVE BEEN A ROW AND IS GONE, with something still pointing at it. The link
  // is what makes it something the owner could meet and expect to open; without one, a deleted
  // record is simply not here and nothing is owed about it.
  const gone = recordsWhereSomebodyAsked(true).filter((record) => {
    if (hasEnded(record)) return false
    const pointing = db
      .select({ id: links.id })
      .from(links)
      .innerJoin(otherEnd, eq(links.fromId, otherEnd.id))
      .where(and(eq(links.toId, record.id), isNull(otherEnd.deletedAt)))
      .all()
    return pointing.length > 0
  }).length

  // AND THE SAME THING FROM THE OTHER TABLE: kept words about time that name a piece of work which
  // has since been deleted. There is nothing left to schedule hours against, and the words are still
  // on the planning screen, so this is one the owner could meet and not find here.
  const orphanedIntents = intentsWaitingForOnePress().workIsGone

  if (gone + orphanedIntents > 0) out.push({ reason: 'record-deleted', count: gone + orphanedIntents })

  return out
}
