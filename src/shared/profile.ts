// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PARTICIPANT'S OWN PAGE: what it holds, and the words on it.
 *
 * Criterion M51 of design/messages/ACCEPTANCE.md section 18: pressing a participant's picture in the
 * chat opens a profile page of its own, where the picture, the name and the other facts can be changed,
 * rather than Everything / Reports and notes.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE HOLDS THE FACTS AND NOT THE REGISTRY ROW
 * ---------------------------------------------------------------------------------------
 *
 * The registry row and the presence reading are each already declared twice — once on the server and
 * once in src/web/api.ts — and a test holds those two pairs together. Declaring either a third time
 * here would be a third copy of one fact. So this file declares only what neither side has yet, and
 * each side composes its own reply type from this plus the two shapes it already knows.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING IS INVENTED WHERE NOTHING IS KNOWN
 * ---------------------------------------------------------------------------------------
 *
 * Every field below is nullable or empty where the answer is not known, and each one that can be
 * absent for more than one reason carries a sentence saying which reason it was. "Nobody could look"
 * and "there is nothing there" are different facts and the page says which it is drawing.
 */

import type { Visit } from './worlds.ts'
import type { WhoIsAnswering } from './handles.ts'
import type { ParticipantRef, ProposedName } from './participants.ts'
import type { ActUnderThePeriod, ElevationHeld, ElevationRule, WhoChoseTheCard, WhoRegisteredTheWorkArea } from './roles.ts'
import type { NotebookOnACard } from './notebook.ts'
import type { ReceiptUsage, UsageReceipt } from './usage-receipts.ts'
import type { DevSaying } from './dev-sayings.ts'
import type { Say } from './i18n.ts'
import type { LoginsWeek } from './logins-week.ts'

/**
 * ONE MACHINE THIS PARTICIPANT WAS SEEN FROM, and how lately.
 *
 * `address` is the network address the request arrived from, which is the only value the call log
 * records that names a machine. It is not a name somebody gave the computer; there is no such name
 * stored anywhere, and putting a friendly one here would be inventing it.
 */
export interface MachineSeenFrom {
  address: string
  /** When the newest request from that address arrived. Local wall clock. */
  lastSeen: string
  /** How many requests this participant made from it. */
  calls: number
}

/** The world whose roll this participant is on, as the office knows it. */
export interface CitizenOf {
  /** The database identity, which is what a world's identity IS. */
  databaseIdentity: string
  /** The name a person reads for that world, or null because the office holds no row for it. */
  name: string | null
  /** home, agent-made, test or remote — or null because the office holds no row for it. */
  kind: string | null
}

/**
 * THE CARD AN AGENT HOLDS, AND WHETHER IT IS ACTING FOR THE PERSON. Criterion P64.
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH FACTS ARE ONE FIELD
 * ---------------------------------------------------------------------------------------
 *
 * Appointing a role, and choosing for how long, belong on the role profile in the Embassy. They are
 * two acts and one panel, and the second is only offered on the card the first can give: a page that
 * read them from two fields would have to work out for itself which card can act for the person, which is
 * the declaration's answer and not a screen's.
 *
 * It is null on a person's page. A person is not appointed, holds their own card, and acts for
 * nobody, so there is nothing to say rather than nothing to show.
 */
export interface TheCardTheyHold {
  /** The word written on the row, or null because nobody wrote one. Never the word it is read as. */
  role: string | null
  /** The word every refusal reads the row as, which for a row with no card is the worker card. */
  readAs: string
  /** What a screen says where nobody wrote one. Null where somebody did. */
  says: string | null
  /**
   * WHO CHOSE THAT CARD, or null because nobody recorded it. Criterion P75.
   *
   * A registration writes this from 8 September 2026: the rule chose the card, or a starter did, or
   * the owner did when they confirmed a credential. NULL IS NOT EITHER ANSWER — it is every row
   * written before that, whose word may have been a choice and may have been the reading, with no
   * way to tell now. `whoChoseTheCardSays` in @shared/roles.ts turns it into the sentence a page
   * draws, so the page and this reply say the same thing.
   */
  chosenBy: WhoChoseTheCard | null
  /**
   * THE HANDLE ON THE CHOOSER'S ROW, for the sentence a page draws (wave rule 5), or null where a
   * person or the rule chose it, where nobody recorded who did, or where no single agent row answers.
   */
  chosenByHandle: string | null
  /** Every card an agent may be given here, in the declaration's order. */
  cardsOnOffer: readonly string[]
  /**
   * THE CARD ITSELF, DRAWN. Criterion P71: on a citizen's page in the Embassy, the Card part shows the
   * role card and its description.
   *
   * The picture and the duties come from the DECLARATION, read by the card's name, so this page and
   * the Role cards page draw one card from one place. It is the card's picture and not the agent's:
   * an agent may have chosen another picture for itself, and that is its face rather than its card.
   *
   * It is null where the declaration holds no card by that name — a row carrying a word the tree has
   * since dropped, `investigator` being the one that has happened. The screen says the card cannot
   * be found rather than drawing an empty frame that reads as a card with nothing on it.
   */
  card: TheCardDrawn | null
  /**
   * The elevation rule and what this agent holds under it, or null because its card cannot hold one.
   *
   * `holding` is null while it holds none, which is the ordinary answer. Null for the whole field is
   * a different fact: this card is not the one the declaration lets act for the person at all.
   */
  elevation: {
    rule: ElevationRule
    holding: ElevationHeld | null
    /**
     * THE OFFICE'S TIME ZONE, by name, such as `Europe/London`, from answer 5 of a decision.
     *
     * A raise's end is a stamp on the office's wall clock with no zone on it, and the page works that stamp out. A
     * browser on another machine may stand in another zone, and a stamp worked out on its clock would end the raise
     * hours early or late with nothing saying so. So the page reads the office's zone here, works the end out on it,
     * and names it under the choice.
     */
    officeTimeZone: string
    /**
     * THE PERIOD THIS PANEL IS ABOUT, AND THE ACTS MADE UNDER IT. Criterion P19.
     *
     * `grant` is `holding` while one holds, and otherwise the last grant the person made and ended — so the
     * acts a period allowed are still readable after it ends. `holds` says which of the two it is.
     * `acts` is newest first, and empty means nothing has been done under that period yet. Null when
     * they have never made one to this agent.
     */
    period: {
      grant: ElevationHeld
      holds: boolean
      acts: ActUnderThePeriod[]
    } | null
  } | null
  /**
   * THE NOTEBOOK KEPT UNDER THIS AGENT'S NAME, with its numbers. Criterion N3: the role card shows
   * the notebook's numbers.
   *
   * NULL ON EVERY CARD BUT ONE, exactly as `elevation` above is null on every card but one, and for
   * the same reason: a notebook is kept for the agent holding the card the declaration lets act for
   * the person, and no other card has one. `isThere` false inside it is the different fact that
   * this agent could have one and nobody has written it.
   */
  notebook: NotebookOnACard | null
}

/**
 * THE PARTS OF A ROLE CARD A CITIZEN'S PAGE DRAWS. Criterion P71.
 *
 * It is the card's name, its picture, its duties and its rung — what the card IS. It is not the
 * whole card: what it must read, who appoints it and what ends it are on the card's own page, and a
 * profile drawing all of them would be the card page drawn twice, which is what criterion P48
 * already refused for the block on the Role cards page.
 */
export interface TheCardDrawn {
  /** The card's name in the declaration, which is the name the reader sees. */
  name: string
  /** What the role is responsible for, in the declaration's own words. Criterion P56. */
  duties: string
  /**
   * The person's own words for the one flow that belongs to this role, or null where the card has none —
   * a real answer, not a gap. Words, never a gate: F11-F13 of design/flows/ACCEPTANCE.md.
   *
   * NO PAGE DRAWS IT SINCE WAVE 13K ROUND 17. The profile's How it works is the card's `howItWorks`
   * text, read from GET /api/roles. This stays in the reply because an
   * agent's restore read carries this same card shape and may read it.
   */
  flow: string | null
  /** Where the card's picture is served, from the card's own set. */
  portrait: string
  /** The rung the card sits on, or null on a card the tree does not carry. */
  rung: number | null
  /** How many steps the power tree has, so the card can say where its rung stands among them (wave 13q's round 33). */
  steps: number
}

/** One record this participant filed, as a list draws it. */
export interface FiledLately {
  id: string
  kind: string
  title: string
  /** When it was filed. Local wall clock. */
  when: string
}

/**
 * EVERYTHING A PROFILE PAGE DRAWS EXCEPT THE REGISTRY ROW AND THE PRESENCE READING.
 *
 * The four agent-only fields are `null` on a person's page, which is different from empty: a person
 * has no handle to hold, no runtime and no proposed name, so there is nothing to say rather than
 * nothing to show.
 */
export interface ProfileFacts {
  /** Which project this reply was answered about. The registries are the installation's; this is not. */
  workspaceId: string
  /**
   * The contact group this participant sits in for the person reading, or null.
   *
   * Null means this participant is not on the reader's contacts list at all — the reader themselves,
   * and Mole Office, which writes system lines and reads no reply.
   *
   * `made` says whether somebody made the group. The page reads a declared group's heading from the
   * word lists and draws a made one as it was written (`groupHeading` in src/shared/contacts.ts), and
   * it cannot tell the two apart from the name alone.
   */
  group: { key: string; name: string; made: boolean } | null
  /** The world this world's roll says they are a citizen of, or null because nothing said. */
  citizenOf: CitizenOf | null
  /** One plain sentence about that: which world, or why there is none. */
  citizenshipSays: string
  /** A world note with values, in the page language; absent on older replies. */
  citizenshipSaid?: import('./dev-sayings.ts').DevSaying | null
  /** Every trip this participant made that this world holds a row for, newest first. */
  visits: Visit[]
  /** One plain sentence about those: how complete this world's view of them is. */
  visitsSay: string
  /** The machines this participant was seen from, newest first. Empty means none was recorded. */
  seenFrom: MachineSeenFrom[]
  /** One plain sentence about those: what was counted, or why nothing was. */
  seenFromSays: string
  /** Whether a session holds this agent's handle now. Null on a person, who holds no handle. */
  answering: WhoIsAnswering | null
  /** What this agent filed in this project lately. Null on a person: nothing answers that for one. */
  filedLately: FiledLately[] | null
  /** One plain sentence about that list, or null where the list is. */
  filedLatelySays: string | null
  /** The short name proposed for this agent, or null because none is or it is already its name. */
  proposedName: ProposedName | null
  /**
   * The card this agent holds and what it may be given. Null on a person, who is appointed by nobody,
   * and on the office's own sender row, which is the office itself and holds no card.
   */
  theCardTheyHold: TheCardTheyHold | null
  /**
   * WHO REGISTERED THIS AGENT'S WORK AREA AND WHEN, criterion P85, or null because nobody recorded
   * it. It is the last change only, read from the agent record's `extra.workAreaChange`; the
   * record's revisions hold the history and nothing here builds a second account of it. Null on a
   * person, who works nowhere, and on an agent whose project record this installation does not hold.
   */
  workAreaChange: WhoRegisteredTheWorkArea | null
  /**
   * THE SENTENCE SAYING THIS AGENT'S WORK AREA PREDATES THE WORK-AREA RULE, or null.
   *
   * The secretary's ruling of 12 September 2026: the door refuses registrations and widenings made
   * after the rule was merged, and every area already stored is left exactly as it is and never
   * refused after the fact. This is the display half: where the area was last written before the
   * rule, the page says so, names the ruling's date, and says the next change is judged by the rule.
   * Null on a person, on an agent with no area, and on every area the new door wrote.
   */
  workAreaBeforeTheRule: string | null
  /**
   * THE SENTENCE SAYING THIS AGENT'S AREA OVERLAPS ANOTHER'S AND A GROUP WAS OPENED, or null.
   *
   * Criterion P95: when a registration or widening overlaps the area of another agent at work, the
   * office opens a group with both agents and their supervisors (the secretary where there is none)
   * and says so on both citizen pages. The mark is the last overlap only, and the group is the
   * durable record; nothing is refused by the overlap.
   */
  workAreaOverlap: string | null
  /**
   * WHETHER AGENTS MAY INJECT, and where that is set. Criteria M84 and M91. Null on a person, who
   * may inject without limit. It is one setting for every agent, so every agent's page carries the
   * same answer, and none of them carries a press.
   */
  mayInject: MayInject | null
  /**
   * WHO HAS INJECTED MESSAGES TO THIS PERSON, counted per sender, most first. Null on an agent.
   *
   * Criterion M84: *the recipient's page counts them per sender*. An empty list means nobody has
   * injected anything to them, which is what most pages will say.
   */
  injectedToThem: InjectedByOne[] | null
  /**
   * WHETHER WHOEVER IS READING MAY RETIRE THIS ROW, AND WHY NOT. Criterion P82.
   *
   * Null on a person, who is not started by anybody and is retired by nobody.
   *
   * IT IS ANSWERED ON THE SERVER AND NEVER WORKED OUT IN THE BROWSER. The rule reads the power tree
   * in design/permissions/roles.json and the row's own starter, and the page has neither. A page
   * that worked the rank out itself would be a second copy of a permission rule, drifting from the
   * door the moment either changed — the ninth invariant broken in the worst place for it.
   */
  mayRetire: MayRetire | null
  /**
   * THE SENTENCE A ROW ADMITTED BEFORE P88 CARRIES, or null because this is not one. Criterion P88.
   *
   * The secretary's ruling of 12 September 2026: the rows already registered when the gate was built
   * are neither retired nor refused. On the citizen's page this says so, with the runtime as the row
   * reads it and the date it was registered, so an old registration is never confused with one the
   * new gate governs. Null on a person and on every row P88 does not govern.
   */
  admittedBeforeP88: string | null
  /**
   * EVERY RUN THIS AGENT WORKED AS IN THIS PROJECT, AND THE TOTALS OVER THEM. Criterion P91.
   *
   * NULL ON A PERSON, who starts no runs. On an agent it is always present, including when the
   * answer is that no run is bound to it: the page has to say which of "no runs" and "nobody could
   * look" it is drawing, and a null here would leave a reader to guess.
   */
  agentRuns: TheAgentsRuns | null
  /**
   * THIS AGENT'S CURRENT HANDOVER IN THIS PROJECT, for this reader. Wave 13k round 46. Null on a person, who writes
   * none. The same reading GET /api/agents/:id/handover answers, with its read rule.
   */
  handover: TheHandoverPart | null
  /**
   * A CARD THIS AGENT ASKED THE PERSON FOR AND THEY HAVE NOT ANSWERED, or null. F15 point 2, criterion
   * P65. It is the display half of the ask the role door now records instead of refusing with a 409,
   * and it is what draws the press on the agent's own page.
   */
  cardAsk: WaitingCardAsk | null
  /**
   * EACH MODEL LOGIN'S WEEK, on a secretary's page only (wave 13p round 29; src/server/lib/logins-week.ts). The page
   * draws it in Developer mode. Absent on everyone else, because the secretaries are the ones told at 50% and 80%.
   */
  loginsWeek?: LoginsWeek
}

/** A card ask waiting on the person, with the press that answers it. */
export interface WaitingCardAsk {
  /** The `role_request` record that holds the ask. */
  requestId: string
  /** The handle that asked, as it is stored. The press and the record keep this reference. */
  handle: string
  /**
   * THE NAME EVERY ASK SENTENCE READS: the office name the stored-reference reader finds for the asker, or its
   * handle when no one registry row answers that reference or the row's office name is blank. Every ask receives
   * it, not only a waiting registration, and the stored handle stays in `handle`.
   */
  name: string
  /** The card it asked for. */
  asking: string
  /**
   * True when answering this ask also admits the agent: a session that registered itself while the
   * one-version window was closed is one press for the agent and the card, not two. F15 point 2.
   */
  admitsAnAgent: boolean
  /**
   * WHICH of three things the press does: gives the card asked for, admits a waiting registration and
   * gives its card, or revokes an agent's keys so it may ask once for a new one. The page names its
   * button by this.
   */
  press: WhatAPressOnAnAskDoes
  /** What the press does, in one sentence a person reads. */
  says: string
  /**
   * WHY A WAITING REGISTRATION WAITS, AND WHAT ADMITTING IT ALSO RECORDS, so a page says what the press does in its own
   * language with `whatAdmittingSays`, where `says` is the server's English. Present only when the press admits an agent.
   */
  admits?: WhatAdmitting
  /**
   * WHO MAY PRESS, said to the reader, on an ask that waits for the person: `you` to the
   * person and `you-under-his-raise` to a secretary they raised. Nobody else is sent the press. Absent where nobody said,
   * as on a new-key ask.
   */
  whoMayPress?: WhoMayPressAnAsk
}

/** Who may press an ask that waits for the person, as said to the one reading it. */
export type WhoMayPressAnAsk = 'you' | 'you-under-his-raise'

/** Why a waiting registration waits for the person, and what admitting it also records. */
export interface WhatAdmitting {
  /** Nothing proved who sent the registration, or it came while the one-version window was closed. */
  waits: 'nothing-proved-who-asked' | 'the-window-is-closed'
  /** What admitting it also records, in the server's English, or null because it records nothing more. */
  alsoRecords: string | null
}

/**
 * THE NAME A WAITING SELF-REGISTRATION IS READ BY: the office name its session gave, or the handle when that name is
 * blank. One reader for the Home row, the waiting list, the ask's own page and the server's sentence, so no surface
 * can call one registration by two names. The handle stays stored in the record and in the waiting reply.
 */
export function theNameASelfRegistrationIsReadBy(selfRegistration: { name: string; handle: string }): string {
  const name = selfRegistration.name.trim()
  return name === '' ? selfRegistration.handle : name
}

/**
 * WHAT THE PRESS THAT ADMITS A WAITING REGISTRATION DOES, in one reader's words: `t` on a page and `sayInEnglish` on
 * the server, so the waiting list and the ask's page cannot come to say it differently. `name` is the name the
 * sentence reads: `theNameASelfRegistrationIsReadBy` on a waiting registration. The word key's `{handle}` slot is
 * where the sentence puts that name; the stored handle is not passed here. `card` is the card's word as that reader
 * says it.
 */
export function whatAdmittingSays(say: Say, name: string, card: string, admitting: WhatAdmitting): string {
  const why = say(admitting.waits === 'nothing-proved-who-asked' ? 'cardAsk.admit.unproved' : 'cardAsk.admit.windowClosed', { handle: name, card })
  return admitting.alsoRecords === null ? why : `${why} ${admitting.alsoRecords}`
}

/**
 * WHAT A KEY ASK'S PAGE AND ITS LINE ON THE WAITING LIST SHOW ABOUT IT. Finding 83, mend b2.
 * Both sentences are written on the server, by src/server/lib/where-an-ask-came-from.ts.
 */
export interface WhatAnAskShows {
  /** Whether the ask proved anybody, the address its connection showed, and the session it named. */
  cameFrom: string
  /** When the agent's current key was last used, or why that cannot be said. */
  keyLastUsed: string
  /**
   * WHICH COMPUTER THE ASK CAME FROM, as the listener stamped it, read from the same stored facts as
   * `cameFrom`. A page in normal mode says this in its own words, because `cameFrom` holds the
   * connection's address and the session, which normal mode does not show.
   * 'inside the office' is an ask no listener carried; 'not recorded' is an ask filed before the
   * office stored these facts.
   */
  fromWhere: 'this computer' | 'another computer' | 'inside the office' | 'not recorded'
}

/**
 * A GRANTED NEW-KEY ASK NOBODY COLLECTED, AND THE PRESS THAT WITHDRAWS THE GRANT. The ask's own page
 * draws it for the person only, at point 9 of a decision.
 */
export interface AGrantToWithdraw {
  /** The `role_request` record that holds the grant. */
  requestId: string
  /** The handle of the agent the grant was for. */
  handle: string
  /** What withdrawing does, in one sentence a person reads. */
  says: string
}

/** What one press on a waiting `role_request` does. */
export type WhatAPressOnAnAskDoes = 'card' | 'admit' | 'new-key'

/**
 * ONE COMPACTION A RUNTIME REPORTED, with the time it reported.
 *
 * THE SESSION HOOK REPORTS CLAUDE CODE'S, since wave 13k round 46: on SessionStart source `compact`
 * tools/session-hook.mjs appends one to the run's `data.compactions`, at the office's clock. No other
 * runtime reports one, and a run with none says so.
 */
export interface AReportedCompaction {
  /** Local wall clock the runtime said it compacted at. */
  at: string
  /** The runtime's own word for it, where it gave one. Null means it gave a time and no word. */
  what: string | null
}

/**
 * ONE HANDOVER, as the handover doors, the read after a compaction and the agent's page answer it. Wave 13k round 46.
 * A row of the `handovers` table (migration 0232); rows are only inserted, so an earlier one never changes.
 */
export interface AHandover {
  id: string
  agentId: string
  workspaceId: string
  text: string
  /** The office's local wall clock when the row was written. */
  writtenAt: string
  writtenByKind: 'agent' | 'person'
  writtenById: string
  /** The run the request's session header named: its record id when it resolved to one, otherwise as it was sent. */
  sessionId: string | null
}

/**
 * AN AGENT'S CURRENT HANDOVER FOR ONE READER. `read` is false when this reader may not read it, and then `current` is
 * null because it was not read, not because none was written; `says` tells the two apart.
 */
export interface TheHandoverPart {
  read: boolean
  current: AHandover | null
  earlier: number
  says: string
}

/**
 * ONE RUN OF AN AGENT, as the citizen's page draws it. Criterion P91.
 *
 * THE MODEL AND THE EFFORT ARE WHAT THE RUN DECLARED, and null means the run did not say — never a
 * default. THE RECEIPT IS THE RUNTIME'S OWN, and null means none was recorded, which the page says
 * in words rather than drawing zero tokens.
 */
export interface OneOfItsRuns {
  /** The run's own record id. */
  id: string
  /** The run's title, as a list row draws it. */
  title: string
  /** When the run was filed, local wall clock. */
  when: string
  /** The state word written on the run: running, idle, finished, crashed or orphaned. */
  state: string
  /**
   * The next try of a running run waiting more than an hour on a usage limit, which the page draws in place of the
   * state word (src/config/a-long-wait.mjs). Absent when the run holds no such wait.
   */
  waitsLongUntil?: string
  /** The model this run declared, or null because the run did not say. */
  model: string | null
  /**
   * WHAT THE RUNTIME SAID ANSWERED, the run's `served` as stored (the Served shape), or null because the runner wrote
   * none. Read only through `theModelThatAnsweredSentence` in src/shared/session-page.ts, the run page's one reading.
   */
  served: Record<string, unknown> | null
  /** The effort this run declared, or null because the run did not say. */
  effort: string | null
  /** The runtime word stored on the run, or null because nobody recorded one. */
  runtime: string | null
  /** The receipt the runtime supplied, or null because none was recorded. */
  usageReceipt: UsageReceipt | null
  /** The compactions recorded on the run, oldest first. Empty means none is recorded, not that none happened. */
  compactions: AReportedCompaction[]
  /** One sentence saying what the receipt is, or why there is none. */
  receiptSays: string
  /** One sentence for the compactions place. */
  compactionsSay: string
}

/**
 * THE COMPACTIONS SUMMED ON AN AGENT, AND WHICH OF ITS RUNS THE COUNT CAN SEE. Criterion P91, wave 13k round 52.
 *
 * Only the session hook records a compaction, and only on a Claude Code run whose hook was set up. So the count is
 * over the Claude Code runs alone, and says how many runs that is and how many it cannot see. Where none of the runs
 * is a Claude Code run there is nothing to count, and `recorded` is null rather than a zero.
 */
export interface TheAgentsCompactions {
  /** The compactions recorded on its Claude Code runs, or null because none of its runs is one. */
  recorded: number | null
  /** How many of its runs said Claude Code as their runtime. */
  claudeCodeRuns: number
  /** How many said another runtime, whose compactions nothing records. */
  otherRuntimeRuns: number
  /** How many said no runtime. */
  noRuntimeRuns: number
  /** The sentences as codes, so a page draws them in its own language. Empty where there is no run. */
  said: DevSaying[]
  /** The same sentences in English, for an agent or a log. Empty where there is no run. */
  says: string
}

/** ONE MODEL AND EFFORT AN AGENT'S RUNS DECLARED, and how many of its runs declared exactly that pair. */
export interface ADeclaredPair {
  /** The model the runs declared, or null because they declared an effort and no model. */
  model: string | null
  /** The effort the runs declared, or null because they declared a model and no effort. */
  effort: string | null
  runs: number
}

/** THE MODELS AND EFFORTS AN AGENT'S RUNS DECLARED, summed. Criterion P91; see 8d3uCCxwD_1j. */
export interface TheAgentsDeclarations {
  /** Each pair, most runs first. Pairs with as many runs keep the order of the newest run that declared them. */
  pairs: ADeclaredPair[]
  /** How many runs declared neither a model nor an effort. */
  neither: number
}

/**
 * EVERY RUN BOUND TO ONE AGENT IN ONE PROJECT, AND THE TOTALS OVER THEM. Criterion P91.
 *
 * THE RUNS ARE READ THROUGH `ranAs`, the run's own statement of which durable agent it worked as,
 * so the list is this agent's and not a global list filtered afterwards by luck. The totals are the
 * product's one summation, the same function `GET /api/usage/agents` draws through `ReceiptTotals`;
 * a second sum on this page would be one fact worked out in two places.
 */
export interface TheAgentsRuns {
  /** The runs, newest first. */
  runs: OneOfItsRuns[]
  /** The shared summation over exactly these runs. Reuse `ReceiptTotals` to draw it. */
  totals: ReceiptUsage
  /** The compactions recorded over these runs, and which of them the count can see. */
  compactionsCounted: TheAgentsCompactions
  /** The models and efforts these runs declared. */
  declared: TheAgentsDeclarations
  /** One sentence saying what was counted and how the runs were found. */
  runsSay: string
  /** The sentence where the step timeline would be. Criterion P91, F8 withdrawn 11 September 2026. */
  timelineSays: string
  /**
   * WHETHER THIS PROJECT HOLDS AN AGENT RECORD TO LOOK RUNS UP BY. False is a real answer — an
   * agent registered in another project has no record here — and the sentence says so rather than
   * drawing an empty list that reads as "this agent never ran".
   */
  looked: boolean
}

/**
 * WHETHER THIS READER MAY RETIRE ONE AGENT'S ROW. Criterion P82.
 *
 * `whyNot` is a sentence a person reads, saying who may instead, and it is null exactly when `may`
 * is true. The page draws the press only where `may` is true and draws `whyNot` where it is not, so
 * a reader who cannot close a row is told who can rather than meeting a control that is refused.
 */
export interface MayRetire {
  may: boolean
  whyNot: string | null
}

/**
 * WHETHER AGENTS MAY INJECT, as the one setting reads. Criterion M91: one switch for every agent, on the
 * Settings page.
 *
 * The profile and the Settings page both draw this shape, and both are handed it by the one reader
 * in src/server/lib/inject-setting.ts, which the message door asks too.
 */
export interface MayInject {
  /** True unless the switch is off. Nobody having chosen reads as true. */
  may: boolean
  /** True when nobody has chosen, so the answer is not somebody's choice. */
  nobodyChose: boolean
  /** One sentence saying the state and whether anybody chose it. */
  says: string
  /** One sentence saying where the switch is and that it is one for every agent. */
  whereItIsSet: string
}

/** How many messages one sender has injected to a person, and how many are still unread. */
export interface InjectedByOne {
  from: ParticipantRef
  count: number
  unread: number
}

/**
 * EVERY WORD THE PROFILE PAGE DRAWS, in one place, so a screen and a test read the same words.
 *
 * They are the words a reader would use, not the words the store uses. "Seen from" rather than
 * "client address"; "Filed lately" rather than "recent creates".
 */
export const INJECT_WORDS = {
  /** What the switch on the Settings page is called, and its name for a screen reader. The profile's
   *  panel only reads the switch, and is called by its own surface label, 'profile.inject'. */
  agentsMayInject: 'Agents may inject',
  /** The answer on an agent's profile when agents may inject. */
  yes: 'Yes',
  /** The answer on an agent's profile when the switch is off. */
  no: 'No',
  /** The words beside the toggle when it is on. */
  on: 'On',
  /** The words beside the toggle when it is off. */
  off: 'Off',
  /** The state when nobody has chosen. */
  nobodyChose: 'On for every agent, the default.',
  /** The state when the switch is on and somebody chose it. */
  switchedOn: 'Every agent may inject. The switch is on.',
  /** The state when the switch is off. */
  switchedOff: 'No agent may inject. The switch is off.',
  /** Where the switch is. The profile says it, and so does the refusal an agent is given. */
  whereItIsSet: 'This is one switch for every agent, on the Settings page.',
  /** What injecting is, in one sentence, beside the switch. */
  whatItIs:
    'An injected message goes before every other waiting message. Even with the switch on, an agent may not inject a ' +
    'second one to a person until they have read the last.',
  /** What the count on a person's own page is called. */
  injectedToYou: 'Injected to you',
  /** One row of that count. */
  countFrom: (count: number, unread: number): string =>
    `${String(count)} injected, ${String(unread)} still unread`,
  /** What the count says when nobody has injected anything. */
  nobodyHas: 'Nobody has injected a message to you.',
} as const

/**
 * THE SENTENCE BESIDE AN AGENT'S TRIPS, one of two, written once (wave 13k round 35). The server picks one
 * (src/server/api/participants.ts, theTrips) and a page draws the same one in its own language, by the word
 * whose English is this very string.
 */
export const VISITS_SAY = {
  /** This world is the office, so the list is every trip registered there. */
  everyTrip: 'Every trip registered at the office.',
  /** Another world, which may not have reported all of its own trips yet. */
  thisWorldsTrips: 'The trips this world holds. The office holds the whole list and this world may not have reported all of its own yet.',
} as const

/**
 * EVERY WORD THE CITIZEN'S PAGE DRAWS FOR ITS RUNS. Criterion P91.
 *
 * A RUN'S COMPACTION SENTENCE FOLLOWS ITS RUNTIME (wave 13k round 52). Only the session hook records a compaction,
 * and only on a Claude Code run whose hook was set up, so "not reported by this runtime" is the criterion's sentence
 * for every other runtime and no longer for Claude Code. A zero would be a measurement nobody made. The timeline
 * sentence names the day the step log was withdrawn, because a reader is owed the reason nothing is drawn where the
 * timeline would be.
 */
export const AGENT_RUNS_WORDS = {
  /** The panel's title. */
  title: 'Its runs',
  /** What the list counts, and how the runs were found. */
  runsSay:
    'Every run bound to this agent in this project, newest first, by the agent each run said it worked as. A run with ' +
    'no usage receipt is said so and is not counted as zero tokens.',
  /** Where this project holds no agent record to look runs up by. */
  noRecordHere: 'This project holds no agent record for it, so its runs cannot be listed here.',
  /** Where a record exists and no run names it. */
  noRunsBound: 'No run in this project is bound to this agent.',
  /** The label beside the model a run declared. */
  model: 'Model',
  /** The label beside the effort a run declared. */
  effort: 'Effort',
  /** The label beside the runtime a run ran in. */
  runtime: 'Runtime',
  /** What is drawn where the run declared nothing. It is not a default. */
  didNotSay: 'the run did not say',
  /** Said where a run has no receipt at all. */
  noReceipt: 'No usage receipt was recorded for this run.',
  /** The criterion's own sentence for a run on a runtime whose compactions nothing records. */
  notReportedByThisRuntime: 'not reported by this runtime',
  /** The sentence beside a run's compactions when there are some: who reported them. */
  reportedByTheSessionHook: 'reported by the session hook when Claude Code compacted this run',
  /**
   * A CLAUDE CODE RUN WITH NONE RECORDED. The hook may not have been set up for it, and nothing records whether it
   * was, so this says none is recorded and not that none happened.
   */
  noneRecordedOnClaudeCode:
    'None recorded. The session hook records each compaction that Claude Code reports, if the hook was set up for ' +
    'the run. Nothing records whether it was set up for this run.',
  /** A run that did not say its runtime, so nobody can say whether its compactions would be recorded. */
  runtimeNotSaid: 'Not known. The run did not say its runtime, and only a Claude Code run has its compactions recorded.',
  /** The label over the compactions place. */
  compactions: 'Compactions',
  /** The label over the compactions summed on the agent. */
  compactionsSummed: 'Compactions over all its runs',
  /** The label over the models and efforts its runs declared. */
  declaredTitle: 'Models and efforts its runs declared',
  /** Drawn in a declared pair where the runs declared a model and no effort, or an effort and no model. */
  notSaid: 'not said',
  /**
   * WHERE THE TIMELINE WOULD BE. Criterion P91, amended 12 September 2026: the step timeline is out
   * until F8 comes back, because a timeline of steps is read from the step log and the person withdrew the
   * step log on 11 September 2026. Nothing smaller is drawn here under the timeline's name.
   */
  timeline:
    'The step timeline is not built. A timeline of steps is read from the step log, and the step log was withdrawn on ' +
    '11 September 2026, so there is no log to read and nothing is drawn here.',
} as const

/**
 * THE SHORT WORD FOR A FIELD NOBODY HAS SET. The profile page draws it quieter than a value (the
 * `Fact` rows in src/web/pages/ProfilePage.tsx), and design/ROUND-FOUR.md's "Ordinary emptiness"
 * row allows a dimmed short word and never a sentence. Written once here because the status line
 * and every part of how somebody wishes to be addressed draw the same word.
 */
const NOT_SET = 'not set'

export const PROFILE_WORDS = {
  /** What the page is, said above the name for a reader who arrived on the address cold. */
  person: 'Person',
  agent: 'Agent',
  /** The labels down the page. Each is a label with a value, never a sentence. */
  name: 'Name',
  status: 'Status',
  presence: 'Here now',
  handle: 'Handle',
  runtime: 'Runtime',
  group: 'Contact group',
  world: 'World',
  answering: 'Answering now',
  seenFrom: 'Seen from',
  visits: 'Trips',
  filedLately: 'Filed lately',
  registered: 'Registered',
  /**
   * THE CREDENTIAL THE OFFICE LET THIS AGENT IN ON. Criterion P74's last clause, criterion P69.
   *
   * The Embassy is one list since P74, and what was a section of credentials is a mark on a row —
   * so this is where the credential itself is named, on the page that row opens.
   */
  credential: 'Let in on',
  /** The values that mean nobody has said, one per field that can be empty. */
  noStatus: NOT_SET,
  noHandle: 'none',
  noRuntime: 'nobody declared one',
  noGroup: 'not on your contacts list',
  noWorld: 'nobody could identify one',
  /**
   * SAID WHERE AN AGENT NAMES NO CREDENTIAL, which is the ordinary answer.
   *
   * It is not a gap. Registration from another machine is refused without a credential the owner confirmed,
   * so a row that names none was registered here — by a person, or by an agent on this machine.
   */
  noCredential: 'registered on this machine, so it needed none',
  /** Said beside a credential that is named, so a reader knows there is more to read about it. */
  credentialSays: 'its own page at the Embassy holds what it has done',
  /**
   * RETIRING THIS AGENT. Problem zyCcJYCLsAe7: an agent that was only used for testing and is already
   * closed can be taken off the list.
   *
   * THE WORD IS `RETIRE` AND NOT `DELETE`, because nothing is deleted: the row is kept, it reads
   * retired and the Embassy folds it away. A press called Delete would promise something the door
   * does not do. The handle is free again afterwards, at criterion I3: a later
   * registration under it makes a different agent with an id of its own, a legacy agent's handle
   * included.
   */
  retire: 'Retire this agent',
  retiring: 'Retiring',
  retireWhy: 'Why you are retiring it',
  retireKeep: 'Leave it',
  retireSays:
    'The row is kept and reads retired. The Embassy folds it away, and nothing new is given to it. Its handle is ' +
    'free again: a later registration under it makes a different agent, with an id of its own.',
  /** Said on a row that is already retired, with what was recorded about it. */
  retired: 'Retired',
  retiredBy: 'by',
  /** Said on the disabled press while the reason box is empty. Criterion E4: never a silent stop. */
  retireNeedsWhy: 'Write why first. The reason is what tells a closed agent from a live one.',
  retiredNothingSaid: 'nobody recorded why',
  noMachines: 'no request from this one has been recorded',
  /** Said, and read out by a screen reader, under Trips when this world holds none (wave 13q's round 32). */
  noVisits: 'No trip has been recorded',
  nothingFiled: 'nothing in this project',
  /** The presses that change what a person may change about themselves. */
  changeName: 'Rename',
  changeStatus: 'Change',
  changePicture: 'Change the picture',
  keep: 'Keep it',
  leave: 'Leave it',
  /** The line saying a reader may not change what they are looking at. */
  notYours: 'A name and a status line are the person’s own to set.',
  /** What the picture is pressed for, for somebody who cannot see it. */
  pressThePicture: (name: string): string => `Change ${name}’s picture`,
  /** How a trip reads on one row. */
  visitRow: (from: string, since: string): string => `from ${from}, since ${since}`,
  /**
   * The address is quoted back when nobody answers to it.
   *
   * `word` IS ALREADY THE READER'S WORD — "person" or "agent" out of `participantWord` — and not a
   * stored kind. The parameter is named for what it holds so nobody passes the stored one.
   */
  nobodyHere: (word: string, id: string): string => `No ${word} in this installation answers to "${id}".`,
  /**
   * THE CARD THIS AGENT HOLDS, AND THE TWO PRESSES. Criterion P64.
   *
   * The words of the elevation press itself are not here: they are in @shared/elevation.ts, because
   * the refusal an un-elevated secretary gets names the press and the two have to say the same thing.
   */
  card: 'Card',
  whichCard: 'Which card it holds',
  appoint: 'Give it a card',
  appointing: 'Saving',
  keepTheCard: 'Leave it',
  /** What is drawn where the row names no card. It is not the word the row is READ as. */
  cardReadAs: 'read as',
  /**
   * THE CARD, DRAWN ON THE CITIZEN'S PAGE. Criterion P71.
   *
   * `cardDuties` heads the description. It is the same word the Role cards page heads it with, so a
   * reader who has seen one recognises the other.
   */
  cardDuties: 'Duties',
  /** The heading over the card's How it works, its handbook text, where it has one. Same word every drawing place uses. */
  cardFlow: 'How it works',
  /**
   * WHERE THE CARD STANDS ON THE POWER TREE, said as a step of that tree, and the words for a card the tree does not
   * carry. Until wave 13q's round 32 it read "rung 3" / 层级 3, a bare number; a step says what the number counts, and
   * the two lines now read as a pair. The tree itself is on the role cards page.
   */
  cardRung: 'step {n} of {steps} on the power tree',
  /**
   * WHAT THE STEP MEANS TO A PERSON, beside its number (the review of wave 13q's round 32): each step holds every
   * power of the steps below it and adds its own, so where a card stands says what it may do against the others.
   */
  cardStepTop: 'The highest step: it may do everything the cards below it may do, and more.',
  cardStepBottom: 'The lowest step: every card above it may do everything it may do, and more.',
  cardStepMiddle: 'It may do everything the cards below it may do, and less than the cards above it.',
  cardStepOnly: 'The only step on the tree.',
  cardSeeTree: 'See the power tree',
  cardNoRung: 'not on the power tree',
  /** The way to the card's own page, where the whole card is. */
  cardOpenAll: 'All the role cards',
  /** THE WAY INTO THIS SECRETARY'S NOTEBOOK, criteria N1 to N4. A name, and one sentence beside it. */
  notebookOpen: 'Secretary notes',
  notebookSays: 'How this person works, and who this agent is at work.',
  /**
   * SAID WHERE THE DECLARATION HOLDS NO CARD BY THE NAME ON THE ROW.
   *
   * It has happened once: the investigator rung left the tree on 6 September 2026, and
   * a row written while it existed still names it. The state is that the card is gone, not that the
   * agent has none, and the two read differently to somebody deciding what to do.
   */
  cardNotDeclared: 'no card of this name is declared any more',
  cardNotDeclaredSays:
    'The row names a card, and the declaration this installation runs on holds none by that name. A card ' +
    'can leave the tree — the investigator did, on 6 September 2026 — and a row written while ' +
    'it existed still carries the word. Every refusal reads such a row as the card named beside it.',
  /** The heading over the elevation, on the one card that can hold one. */
  actingForYou: 'Acting for you',
  granting: 'Saying so',
  ending: 'Ending it',
  /** The box a time goes in, and the box a record id goes in. */
  aTime: '2026-09-08 18:00',
  aRecord: 'the record of the work',
  /**
   * THE PERIOD'S OWN PAGE. Criteria P19 and P20.
   *
   * `periodActs` is a heading over the list, not a sentence. `periodEnded` says the period the acts
   * below were made under has ended, so a reader does not take them for live. `periodNothingYet` is
   * the absence said plainly: nobody has done anything under this period, which is different from
   * nobody having looked. The last words, the limit on what a permission on an unprovable identity
   * can prove, are not here: criterion P16 keeps that sentence in @shared/person.ts and it is drawn
   * from there so there is never a second copy.
   */
  periodActs: 'What this period did',
  periodEnded: 'This period has ended. What it did still stands, and each act can be undone on its own.',
  periodNothingYet: 'Nothing has been done under this period yet.',
} as const

/**
 * THE PATH OF ONE PARTICIPANT'S PAGE, from the shared file both ends read.
 *
 * The router builds the address from this and the chat presses it, so the two cannot spell one
 * address differently. It is here rather than in the router because the server's own sentences name
 * the page too, and the server may not import the browser.
 */
export const PROFILE_SEGMENT = 'who'

/**
 * What the "seen from" list is counted from, in one sentence, and it differs by who is being read.
 * Shared by the server and the page language reader. Wave 13k round 36.
 */
export const SEEN_FROM_SAYS = {
  person:
    'The network addresses this person’s requests arrived from, counted from the call log. It names a machine ' +
    'and nothing gave that machine a name, so the address is what there is.',
  agent:
    'The network addresses requests carrying this agent’s own id arrived from. It is usually empty and that is ' +
    'not a fault: a tool sends an actor id of its own choosing, which answers to no registry row.',
} as const

/** What "filed lately" counts, in one sentence, so the page never has to guess what it is drawing. */
export const FILED_LATELY_SAYS =
  'Records this agent created in this project, newest first. A record it edited but did not create is not here.'

export const CITIZENSHIP_SAYS = {
  unrecorded: 'Nothing recorded which world this registration belongs to. That is every row written before the ' +
    'registries carried a world, and any row in a database whose own identity could not be read.',
  here: 'This is the roll of the database this server holds. Another world keeps its own, and nothing here reads it.',
  named: 'This is the roll of the database this server holds. The name of that world comes from the office’s list. Another world keeps its own roll, and nothing here reads it.',
  officeHasNoRow: 'The office holds no row for that world, so there is a database identity here and no name for it.',
} as const
