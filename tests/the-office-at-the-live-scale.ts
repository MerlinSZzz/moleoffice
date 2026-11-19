// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A THROWAWAY OFFICE AT THE LIVE OFFICE'S SCALE, FOR THE READS THAT STAYED SLOW. Made-up rows only.
 *
 * Round 14 of wave 13y: the office itself must not waste resources. Round 13's
 * office of the slowest reads (tests/the-office-of-the-slowest-reads.ts) was far smaller than the live one, and five
 * reads stayed slow on the live office after it landed. On 9 October 2026 the secretary exported the live office's counts and
 * sizes, with no content, to briefs/live-scale-2026-10-09.json in the wave's sandbox. `THE_LIVE_SCALE` below is those
 * numbers, and this file builds an office of them.
 *
 * WHAT IS THE FILE'S AND WHAT IS A GUESS.
 *   - The file's: records of each kind; rows of `api_calls`, `message_delivery`, `agents`, `hourly_calls` and
 *     `header_only_calls`; the average and the largest size of a message's `data`.
 *   - Asked for afterwards, because the first office was not slow (the second export,
 *     briefs/live-counts-2-2026-10-09.txt): the runs still open; the runs that name their agent; the rows of
 *     `agent_records`; the calls that name a run and how many runs they name; the comments; the rows of
 *     `conversation_reads` and `session_resources`. `THE_LIVE_COUNTS` below. Then the groups, their members and their
 *     messages, and the reads by reader (messages O4Vwg4IzUfej and pPBE2d7O-SlU): `THE_LIVE_COUNTS_OF_GROUPS`
 *     and `THE_READS_BY_READER`.
 *   - A guess, because no count says: how the other messages split between the person's conversations, agents and
 *     the office; how the requests fall across the runs that are named; which runs name their agent and which agent;
 *     when each read was made. The split keeps round 13's mix. The runs that name an agent are the newest, each of an
 *     agent still working. The reads fall evenly over five days, each reader's in turn across its conversations.
 *   - Not made at all: `changes` (294,561 rows live), `revisions` (158,153), `links` beyond the chat office's,
 *     `file_observations` (17,018) and `visitor_requests` (13,090). No read measured here asks any of them, which
 *     the statements each read ran show, so they would change only the size of the file. This office is smaller on
 *     disk than the live one, and the measurement says by how much.
 *
 * EVERY ROW HAS A FIXED ID, and the requests in `api_calls` are counted back from `now`, so a server started on the
 * real clock sees its open runs asking a few minutes ago, as the live office's do.
 *
 * ANY SCALE, since round 40 of wave 13y. The copies of the live office's database are gone, and a slow read is measured
 * on an office this file builds. `AScale` holds every count a build is made to, and `buildTheOfficeAtAScale` builds an
 * office at any of them. `buildTheOfficeAtTheLiveScale` is that builder at the live office of 9 October.
 * `THE_COPY_OF_5_OCTOBER` is the copy round 39 measured the queue on. tools/build-a-made-up-office.ts builds it into a
 * file of its own, and tests/a-made-up-office-has-its-counts.test.ts holds what a small build of it makes. At the live
 * scale a build makes 523,073 reads of a conversation, the live count. Before round 40 it made each reader's rows as
 * the table of readers below writes them, which add up to 523,326.
 *
 * ONE ROW FOR EACH CONVERSATION A READER READ, since round 64 of wave 13s.
 * `conversation_reads` keeps only the newest read of each reader in each conversation in each project, so a build
 * writes the row each conversation's last read leaves and not every read. At the live scale that is 365 rows for the
 * 523,073 reads. `theReadPointsAt` below says how many.
 */
import { readFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import type { ClosedHow } from '../src/shared/lifecycle.ts'
import { MOLE_OFFICE_HANDLE } from '../src/shared/participants.ts'
import type { Shape } from './the-chat-office-of-the-live-shape.ts'
import { buildTheOfficeOfTheSlowestReads, THE_MEASURED_NOW, type TheExtras } from './the-office-of-the-slowest-reads.ts'
import type { TheChatOffice } from './the-chat-office-of-the-live-shape.ts'

/** The secretary card's name, read from the declaration, which names it as the one card that may hold elevation. */
export function theSecretaryCard(): string {
  return (JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation.onlyThisCardCanHoldIt
}

/** The live office's counts and sizes on 9 October 2026, from briefs/live-scale-2026-10-09.json. */
export const THE_LIVE_SCALE = {
  databaseBytes: 2_693_791_744,
  apiCalls: 1_632_655,
  messageDelivery: 45_806,
  agents: 981,
  hourlyCalls: 2_012,
  headerOnlyCalls: 1_087,
  messageDataAverageBytes: 1_333,
  messageDataLargestBytes: 1_331_276,
  /** Records of each kind. */
  records: {
    message: 30_829, session: 9_424, sealed_tip: 2_706, report: 2_675, flow_run: 1_751, problem: 1_414, agent: 997,
    decision: 901, merge_entry: 802, note: 756, task: 469, proposal: 199, claim: 148, block: 113, annotation: 89,
    module: 88, planned_state: 44, idea: 37, flow: 26, tool: 24, direction: 21, role_request: 20, pipeline: 18,
    obligation: 14, wanna_try: 10, trajectory: 8, incident: 6, notebook: 6, role_card: 6, tool_category: 6, counter: 5,
    purchase: 5, stopping_point: 3, context_bundle: 2, goal: 1, regulation: 1,
  } as Readonly<Record<string, number>>,
} as const

/** What was counted on the live office on 9 October 2026 when the first office was not slow, with no content. */
export const THE_LIVE_COUNTS = {
  /** Runs whose `closedAt` is not written, in every project. */
  openRuns: 8_734,
  /** Runs whose `ranAs` names the agent they ran as. */
  runsThatNameTheirAgent: 3_239,
  /** Rows of `agent_records`, and the agents they map. */
  agentRecords: 999,
  agentsWithARecord: 980,
  /** Calls in `api_calls` that name a run, and how many runs they name. */
  callsThatNameARun: 1_408_356,
  runsNamedByACall: 3_192,
  /** Messages that point at something, which are comments. */
  comments: 84,
  /**
   * Rows of `conversation_reads` that day, one for every read. Since a decision it keeps the newest of
   * each.
   */
  conversationReads: 523_073,
  sessionResources: 19_739,
} as const

/** The groups counted on the live office the same day, and the agent in the most groups but one. */
export const THE_LIVE_COUNTS_OF_GROUPS = {
  groups: 762,
  /** Memberships nobody has left. */
  memberships: 2_511,
  /** Messages sent to a group. */
  messages: 3_688,
} as const

/**
 * THE AGENTS HOLDING THE SECRETARY CARD AND NOT RETIRED, in the live office on 20 October 2026: the agents GET /api/roles
 * names as able to hold elevation, counted with no names. Nobody counted them on 9 October or on 5 October, so both
 * offices below take this count (round 43 of wave 13u). Until then a build made no secretary, so a read of the
 * secretaries read no row on it, which no office with a secretary does.
 */
export const THE_LIVE_SECRETARIES = 5

/**
 * EVERY READ OF A CONVERSATION OR A GROUP, by reader, as they were counted: how many rows each reader made and of how
 * many conversations. The first is the agent in 253 groups, whose waiter reads its read point in each of them every
 * time it wakes; this office's measured agent is in one group in three, 254 of them, and stands for it. The person
 * read 25 conversations between two agents and no group.
 */
const THE_READS_BY_READER = [
  { reader: 'the measured agent', rows: 487_372, of: 253 },
  { reader: 'agent 1', rows: 24_628, of: 54 },
  { reader: 'agent 2', rows: 11_004, of: 21 },
  { reader: 'agent 3', rows: 96, of: 4 },
  { reader: 'agent 4', rows: 95, of: 4 },
  { reader: 'agent 5', rows: 95, of: 4 },
  { reader: 'the person', rows: 36, of: 25 },
] as const

/**
 * EVERY COUNT AN OFFICE IS BUILT TO, in one object, so one builder makes an office at any of them (round 40 of wave 13y).
 * Each count is a number of rows the build makes, exactly, unless its line says otherwise.
 */
export interface AScale {
  /** Records of each kind. */
  records: Readonly<Record<string, number>>
  /** Rows of `agents`, the office's own row among them. */
  agents: number
  /** Of those, the agents holding the secretary card, none of them retired. */
  secretaries: number
  apiCalls: number
  /** Of those, the calls that name a run, and how many of the newest runs they name. Not exact: each call draws. */
  callsThatNameARun: number
  runsNamedByACall: number
  /** Runs left open, and of those the newest that name the agent they ran as. */
  openRuns: number
  runsThatNameTheirAgent: number
  /** Runs still running with a running process, and how many of those asked a few minutes ago (round 13's extras). */
  runningRuns: number
  runsWithARecentRequest: number
  /** Messages that point at something, which are comments, and messages sent to a group. */
  comments: number
  groupMessages: number
  groups: number
  /** The reads of a conversation made. The table keeps one row for each conversation a reader read: `theReadPointsAt`. */
  conversationReads: number
  sessionResources: number
  /** Of those, the resources still held. */
  liveResources: number
  hourlyCalls: number
  headerOnlyCalls: number
  /** A message's `data`: its average size and the largest. Bytes, not rows; a build comes within a few bytes. */
  messageDataAverageBytes: number
  messageDataLargestBytes: number
  /** Round 63 of wave 13y: optional shape; absent leaves the older builds unchanged. */
  projects?: number
  messageSenders?: number
  officeMessages?: number
  messageDelivery?: number
  secretaryDeliveries?: number
  withdrawnMessages?: number
  longTailRuns?: boolean
  /** Round 133 of wave 13y: optional shape; absent leaves the older builds unchanged. Of `agents`, the retired ones. */
  retiredAgents?: number
  /** The first secretary started `theSecretary` agents, and the first `supervisors` of those started `theirTeams` more. */
  startedBy?: { theSecretary: number; supervisors: number; theirTeams: number }
  /** The runs, and the records that are neither a run, a message nor an agent, that the first project holds. */
  theFirstProject?: { runs: number; otherRecords: number }
  /** Rows of `changes` and of `links` in all, the ones the build makes anyway among them. */
  changes?: number
  links?: number
  /**
   * THE LINKS THE HORIZONS AND EDIT PAGES READ, when the scale names them. Counted on the live office on
   * 17 November: 8 `serves` to a goal and 522 `implements` to a block, 65 of those to a deleted block. This
   * office has no deleted block, so its 522 `implements` links all point at a live one. The live office held no
   * `realises` or `instead_of` link to a planned state at all, so a few of each are made to measure that path.
   * These links are made on top of `links`, so the office holds `links` and these together.
   * All four run from a module to the kind the type names; see the links step in `buildTheOfficeAtAScale`.
   */
  servesToGoals?: number
  realisesToPlannedStates?: number
  insteadOfToPlannedStates?: number
  implementsToBlocks?: number
  /** How the runs that ended were closed. Absent writes `made-up`, which the session kind refuses, as the older builds do. */
  closedHow?: ClosedHow
}

/** The live office of 9 October 2026, from the four counts above, as this file has built it since round 14. */
export const THE_LIVE_OFFICE_ON_9_OCTOBER: AScale = {
  records: THE_LIVE_SCALE.records,
  agents: THE_LIVE_SCALE.agents,
  secretaries: THE_LIVE_SECRETARIES,
  apiCalls: THE_LIVE_SCALE.apiCalls,
  callsThatNameARun: THE_LIVE_COUNTS.callsThatNameARun,
  runsNamedByACall: THE_LIVE_COUNTS.runsNamedByACall,
  openRuns: THE_LIVE_COUNTS.openRuns,
  runsThatNameTheirAgent: THE_LIVE_COUNTS.runsThatNameTheirAgent,
  runningRuns: 1_500,
  runsWithARecentRequest: 36,
  comments: THE_LIVE_COUNTS.comments,
  groupMessages: THE_LIVE_COUNTS_OF_GROUPS.messages,
  groups: THE_LIVE_COUNTS_OF_GROUPS.groups,
  conversationReads: THE_LIVE_COUNTS.conversationReads,
  sessionResources: THE_LIVE_COUNTS.sessionResources,
  liveResources: 76,
  hourlyCalls: THE_LIVE_SCALE.hourlyCalls,
  headerOnlyCalls: THE_LIVE_SCALE.headerOnlyCalls,
  messageDataAverageBytes: THE_LIVE_SCALE.messageDataAverageBytes,
  messageDataLargestBytes: THE_LIVE_SCALE.messageDataLargestBytes,
}

/**
 * THE COPY OF 5 OCTOBER 2026 THAT ROUND 39 MEASURED THE QUEUE ON, the office tools/build-a-made-up-office.ts builds.
 * The copies are gone since round 40, and round 39's notes kept the copy's rows per table, with no content
 * (in a file under that round's out folder, in the wave's sandbox). Those are the numbers written out below.
 *
 * WHAT THOSE NOTES DO NOT SAY is guessed from the live office of 9 October, in proportion: the records of each kind
 * share the copy's 43,987 records as the live office's shared its own, after the copy's 990 agent records, one for each
 * row of `agent_records`; a count of runs is the live office's share of its runs; a count of calls its share of its
 * calls; a count of messages its share of its messages. The sizes of a message are the live office's. So is the number
 * of secretaries, not in proportion: the person appoints each one, so it does not grow with the number of agents.
 */
export const THE_COPY_OF_5_OCTOBER: AScale = (() => {
  const live = THE_LIVE_OFFICE_ON_9_OCTOBER
  const AGENT_RECORDS = 990
  const records: Record<string, number> = { ...inProportion(Object.fromEntries(Object.entries(live.records).filter(([kind]) => kind !== 'agent')), 43_987 - AGENT_RECORDS), agent: AGENT_RECORDS }
  const API_CALLS = 1_849_621
  const ofRuns = (n: number): number => Math.round((n * records.session!) / live.records.session!)
  const ofMessages = (n: number): number => Math.round((n * records.message!) / live.records.message!)
  return {
    records,
    agents: 972,
    secretaries: live.secretaries,
    apiCalls: API_CALLS,
    callsThatNameARun: Math.round((live.callsThatNameARun * API_CALLS) / live.apiCalls),
    runsNamedByACall: ofRuns(live.runsNamedByACall),
    openRuns: ofRuns(live.openRuns),
    runsThatNameTheirAgent: ofRuns(live.runsThatNameTheirAgent),
    runningRuns: ofRuns(live.runningRuns),
    runsWithARecentRequest: live.runsWithARecentRequest,
    comments: ofMessages(live.comments),
    groupMessages: ofMessages(live.groupMessages),
    groups: 712,
    conversationReads: 149_861,
    sessionResources: 15_844,
    liveResources: live.liveResources,
    hourlyCalls: 2_301,
    headerOnlyCalls: 1_003,
    messageDataAverageBytes: live.messageDataAverageBytes,
    messageDataLargestBytes: live.messageDataLargestBytes,
  }
})()

/**
 * THE OFFICE ON 22 OCTOBER 2026, from counts without content, in round 63 of wave 13y.
 *
 * WHAT IS THE FILE'S AND WHAT IS A GUESS.
 * - Counted: 94,344 records; the eleven named kinds below; 1,308 records of other kinds; 74,565 deliveries;
 *   11 projects; 952 senders; a median of about two messages; 22,431 notices from the office; 17,034 deliveries
 *   to one secretary. Revisions: 269,785, NOT BUILT. Check the measured statements before claiming no read asks them.
 * - The unnamed kinds share their 1,308 in the proportions of the 9 October office's other kinds.
 * - Agents: one row per agent record, plus the office's row, because no registry count was supplied. Secretaries:
 *   the five counted on 20 October, unchanged; the first one receives the stated deliveries, and none of them is
 *   of a message the person sent or was sent.
 * - Calls, calls naming runs, hourly calls and header-only calls: the 9 October counts in proportion to runs.
 *   Calls naming runs keep their share of calls. Runs named by calls, open runs, runs naming agents, running runs,
 *   recent requests, resources and live resources: the 9 October counts in proportion to runs.
 * - Comments, group messages, groups and conversation reads: the 9 October counts in proportion to messages.
 *   Message sizes stay the 9 October sizes. After the stated notices, the other conversation categories keep
 *   round 14's proportions. Three group members, retired agents and read points keep the existing builder's mix.
 * - Senders: keep person messages, and every message the measured agent sends, its conversation with the person
 *   among them; give half the other senders two messages each, and the rest a long tail with weight
 *   1 / rank^1.5. Group membership is extended to include a reassigned sender. Nobody counted that mix. The
 *   deliveries added to reach the count are of messages the person neither sent nor was sent, so each message the
 *   person sent or was sent keeps the recipients it was written to. Until round 167 the measured agent's lines went
 *   to other senders, and the secretary's deliveries and the added ones took the first messages, which are its
 *   conversation, so the person had no conversation with any agent beyond about a dozen messages.
 * - Runs: every agent gets one where possible; the remainder has weight 1 / rank^1.2, starting with the secretary.
 *   Projects share each kind in turn; comments follow their target. The present builder has no messages outside
 *   a project view or through aboutProject alone, so that zero mix is retained as a guess.
 * - Withdrawals: 40, a small invented sample, with real delete change rows; they remain in the record totals.
 */
export const THE_LIVE_OFFICE_ON_22_OCTOBER: AScale = (() => {
  const live = THE_LIVE_OFFICE_ON_9_OCTOBER
  const known = { message: 55_765, session: 14_585, flow_run: 6_918, report: 4_459, sealed_tip: 4_413,
    problem: 1_593, agent: 1_459, merge_entry: 1_337, decision: 1_166, note: 871, task: 470 }
  const ofRuns = (n: number): number => Math.round(n * known.session / live.records.session!)
  const ofMessages = (n: number): number => Math.round(n * known.message / live.records.message!)
  return {
    records: { ...inProportion(Object.fromEntries(Object.entries(live.records).filter(([kind]) => !(kind in known))), 1_308), ...known },
    agents: known.agent + 1, secretaries: live.secretaries,
    apiCalls: ofRuns(live.apiCalls), callsThatNameARun: ofRuns(live.callsThatNameARun),
    runsNamedByACall: ofRuns(live.runsNamedByACall), openRuns: ofRuns(live.openRuns),
    runsThatNameTheirAgent: ofRuns(live.runsThatNameTheirAgent), runningRuns: ofRuns(live.runningRuns),
    runsWithARecentRequest: ofRuns(live.runsWithARecentRequest), comments: ofMessages(live.comments),
    groupMessages: ofMessages(live.groupMessages), groups: ofMessages(live.groups),
    conversationReads: ofMessages(live.conversationReads), sessionResources: ofRuns(live.sessionResources),
    liveResources: ofRuns(live.liveResources), hourlyCalls: ofRuns(live.hourlyCalls), headerOnlyCalls: ofRuns(live.headerOnlyCalls),
    messageDataAverageBytes: live.messageDataAverageBytes, messageDataLargestBytes: live.messageDataLargestBytes,
    projects: 11, messageSenders: 952, officeMessages: 22_431, messageDelivery: 74_565,
    secretaryDeliveries: 17_034, withdrawnMessages: 40, longTailRuns: true,
  }
})()

/**
 * THE OFFICE ON 4 NOVEMBER 2026, in round 133 of wave 13y, for the three reads of the page about who is working.
 *
 * WHAT IS COUNTED AND WHAT IS A GUESS.
 * - Counted on the copy of the live office made at 02:35 that day, with no content: the thirteen named kinds below and
 *   136,236 live records in all; 18,968 runs, 761 of them with `closedAt` and 66 running; 195 messages withdrawn;
 *   706,049 rows of `changes`, 51,831 of `links` and 1,891,637 of `api_calls`; 11 projects, the first holding 17,545
 *   runs and 45,718 live records.
 * - Counted on the live office that day: 1,826 agents on the roster, 721 of them retired; one secretary started 591
 *   agents, and 61 supervisors started 893 between them.
 * - A guess. The other kinds share their 1,155 records as the 9 October office's other kinds did. Every agent record
 *   is in the first project, so the first project's other records are its 45,718 less its runs and the 1,844 agent
 *   records. The office's own row is not on the roster, so there are 1,827 rows. The supervisors are among the
 *   secretary's 591, and the person started the rest. The call counts that name a run keep the 9 October share, and the
 *   other counts of runs follow the runs as the 22 October office's did. The counts of messages follow the messages
 *   in the same way, and the 22 October office's notices and deliveries grow with them.
 *   Each run writes its share of `changes` to its own record, one write in four a change of state, and each project
 *   holds a share of `links` as it holds records. The 761 runs that ended say their agent closed them.
 * - Not made: `revisions`, `file_observations` and `visitor_requests`, as for the older offices.
 */
export const THE_LIVE_OFFICE_ON_4_NOVEMBER: AScale = (() => {
  const live = THE_LIVE_OFFICE_ON_9_OCTOBER
  const before = THE_LIVE_OFFICE_ON_22_OCTOBER
  const known = { message: 84_109, session: 18_968, flow_run: 11_399, report: 5_944, sealed_tip: 5_804, problem: 2_032,
    merge_entry: 1_874, agent: 1_844, decision: 1_311, note: 912, task: 473, block: 402, annotation: 9 }
  const others = 136_236 - Object.values(known).reduce((sum, n) => sum + n, 0)
  const ofRuns = (n: number): number => Math.round(n * known.session / live.records.session!)
  const ofMessages = (n: number): number => Math.round(n * known.message / live.records.message!)
  const asMessagesGrew = (n: number): number => Math.round(n * known.message / before.records.message!)
  const apiCalls = 1_891_637
  return {
    records: { ...inProportion(Object.fromEntries(Object.entries(live.records).filter(([kind]) => !(kind in known))), others), ...known },
    agents: 1_827, secretaries: live.secretaries,
    apiCalls, callsThatNameARun: Math.round(live.callsThatNameARun * apiCalls / live.apiCalls),
    runsNamedByACall: ofRuns(live.runsNamedByACall), openRuns: known.session - 761,
    runsThatNameTheirAgent: ofRuns(live.runsThatNameTheirAgent), runningRuns: 66,
    runsWithARecentRequest: live.runsWithARecentRequest, comments: ofMessages(live.comments),
    groupMessages: ofMessages(live.groupMessages), groups: ofMessages(live.groups),
    conversationReads: ofMessages(live.conversationReads), sessionResources: ofRuns(live.sessionResources),
    liveResources: ofRuns(live.liveResources), hourlyCalls: ofRuns(live.hourlyCalls), headerOnlyCalls: ofRuns(live.headerOnlyCalls),
    messageDataAverageBytes: live.messageDataAverageBytes, messageDataLargestBytes: live.messageDataLargestBytes,
    projects: 11, messageSenders: before.messageSenders, officeMessages: asMessagesGrew(before.officeMessages!),
    messageDelivery: asMessagesGrew(before.messageDelivery!), secretaryDeliveries: asMessagesGrew(before.secretaryDeliveries!),
    withdrawnMessages: 195, longTailRuns: true,
    retiredAgents: 721, startedBy: { theSecretary: 591, supervisors: 61, theirTeams: 893 },
    theFirstProject: { runs: 17_545, otherRecords: 45_718 - 17_545 - known.agent }, changes: 706_049, links: 51_831, closedHow: 'agent-said',
  }
})()

/**
 * THE OFFICE ON 13 NOVEMBER 2026, in round 216 of wave 13u, for the project board (package BV: the speed is
 * measured at today's live size).
 *
 * WHAT IS COUNTED AND WHAT IS A GUESS.
 * - Counted on the live office that day: 196,852 records and 73,549 links.
 * - A guess. Every other count is the 4 November office's, grown as the records grew, by 196,852 / 136,236, and each
 *   kind keeps its 4 November share of the records. The five secretaries and the 11 projects stay as they were.
 */
export const THE_LIVE_OFFICE_ON_13_NOVEMBER: AScale = (() => {
  const before = THE_LIVE_OFFICE_ON_4_NOVEMBER
  return { ...oneIn(before, 136_236 / 196_852), records: inProportion(before.records, 196_852), secretaries: before.secretaries, links: 73_549,
    servesToGoals: 8, realisesToPlannedStates: 5, insteadOfToPlannedStates: 5, implementsToBlocks: 522 }
})()

/**
 * `scale` with every count of rows divided by `oneIn` and rounded, none of them below one where it was above nought,
 * for a small build that a test can make in seconds. The sizes of a message stay as they are.
 * Only the optional projects field retains its count: round 63 keeps eleven project views in the small office.
 * This exception changes no existing scale, neither of which names that field. The counts inside `startedBy` and
 * `theFirstProject` are divided as the others are.
 */
export function oneIn(scale: AScale, oneIn: number): AScale {
  const less = (n: number): number => (n === 0 ? 0 : Math.max(1, Math.round(n / oneIn)))
  const counts = Object.fromEntries(Object.entries(scale).map(([name, value]) => [name, typeof value === 'number' ? less(value) : value])) as unknown as AScale
  return {
    ...counts,
    records: Object.fromEntries(Object.entries(scale.records).map(([kind, n]) => [kind, less(n)])),
    messageDataAverageBytes: scale.messageDataAverageBytes,
    messageDataLargestBytes: scale.messageDataLargestBytes,
    ...(scale.projects === undefined ? {} : { projects: scale.projects }),
    ...(scale.startedBy === undefined ? {} : { startedBy: { theSecretary: less(scale.startedBy.theSecretary), supervisors: less(scale.startedBy.supervisors), theirTeams: less(scale.startedBy.theirTeams) } }),
    ...(scale.theFirstProject === undefined ? {} : { theFirstProject: { runs: less(scale.theFirstProject.runs), otherRecords: less(scale.theFirstProject.otherRecords) } }),
  }
}

/** Every link the office holds: the four kinds counted in `links`, and the four the Horizons and Edit reads ask for. */
export function linksInAll(scale: AScale): number {
  return (scale.links ?? 0) + (scale.servesToGoals ?? 0) + (scale.realisesToPlannedStates ?? 0) + (scale.insteadOfToPlannedStates ?? 0) + (scale.implementsToBlocks ?? 0)
}

/** How many reads each reader makes at this scale: its share of the scale's reads, as they were counted by reader. */
function theReadsByReaderAt(scale: AScale): Record<string, number> {
  return inProportion(Object.fromEntries(THE_READS_BY_READER.map((one) => [one.reader, one.rows])), scale.conversationReads)
}

/**
 * HOW MANY ROWS OF `conversation_reads` A BUILD AT THIS SCALE LEAVES: one for each conversation each reader read.
 *
 * A reader reads its conversations in turn, so it read as many of them as it made reads, up to the number it is counted
 * as reading. An agent reads groups, so it reads no more than the scale has. The person reads conversations between
 * two agents, and the build refuses to go on when it has fewer of those than the person reads.
 */
export function theReadPointsAt(scale: AScale): number {
  const reads = theReadsByReaderAt(scale)
  return theReadersAt(scale).reduce(
    (sum, one) => sum + Math.min(reads[one.reader]!, one.of, one.reader === 'the person' ? Infinity : scale.groups),
    0,
  )
}

/**
 * THE READERS A BUILD AT THIS SCALE HOLDS, of the readers counted (round 138 of wave 13y). The person and the
 * measured agent are in every build. Agent k is the build's agent still working that comes k places after the measured
 * agent, so it is held only while the build has more than k agents still working. A reader the build does not hold
 * makes no reads, and its share is not given to another reader: `conversation_reads` keeps one row for each reader and
 * conversation, so a second reader's rows would be counted as that reader's. At one in a hundred the 22 October scale
 * has three agents still working, so agents 3 to 5 make none. Until round 138 the build gave them reads with no agent,
 * and stopped on the NOT NULL rule of `conversation_reads.reader_id`.
 */
function theReadersAt(scale: AScale): (typeof THE_READS_BY_READER)[number][] {
  const working = theWorkingAgentsAt(scale)
  return THE_READS_BY_READER.filter((one, r) => one.reader === 'the person' || r < working)
}

/** How many agents a build at this scale has still working, the measured agent with them and the office's own row not. */
function theWorkingAgentsAt(scale: AScale): number {
  const shape = theShapeAt(scale)
  return shape.agents - shape.retired
}

/** `counts` scaled to add up to `total`: each rounded down, then one more to the largest remainders, ties by name. */
function inProportion(counts: Readonly<Record<string, number>>, total: number): Record<string, number> {
  const whole = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const exact = Object.entries(counts).map(([name, n]) => ({ name, n: (n * total) / whole }))
  const out = Object.fromEntries(exact.map((one) => [one.name, Math.floor(one.n)]))
  let left = total - Object.values(out).reduce((sum, n) => sum + n, 0)
  for (const one of [...exact].sort((a, b) => b.n - Math.floor(b.n) - (a.n - Math.floor(a.n)) || a.name.localeCompare(b.name))) {
    if (left === 0) break
    out[one.name] = out[one.name]! + 1
    left -= 1
  }
  return out
}

/** The live office's messages other than its group messages and comments, split as this file split them in round 14. */
const THE_SPLIT_OF_OTHER_MESSAGES = { theConversation: 7_700, otherPersonMessages: 3_806, officeLines: 1_289, betweenAgents: 14_262 } as const

/**
 * THE CHAT AND THE PROJECT AT A SCALE. The agents beside the office's own row make `agents`. The messages other than
 * the group messages and the comments are split between the person's conversation, the person's other contacts, the
 * office's lines and messages between agents as round 14 split the live office's 27,057; three in four agents are
 * retired, as there. Three members to a group: at the live scale that made 2,286 memberships against the live 2,511,
 * and the measured agent is in one group in three. Each group message is delivered to two members and every other
 * message once, which at the live scale made about 11,400 deliveries fewer than the live office's 45,806.
 */
export function theShapeAt(scale: AScale): Shape {
  const agents = scale.agents - 1
  const rest = scale.records.message! - scale.groupMessages - scale.comments
  const split = inProportion(THE_SPLIT_OF_OTHER_MESSAGES, rest)
  if (scale.officeMessages !== undefined) {
    Object.assign(split, inProportion({ theConversation: THE_SPLIT_OF_OTHER_MESSAGES.theConversation,
      otherPersonMessages: THE_SPLIT_OF_OTHER_MESSAGES.otherPersonMessages, betweenAgents: THE_SPLIT_OF_OTHER_MESSAGES.betweenAgents }, rest - scale.officeMessages))
    split.officeLines = scale.officeMessages
  }
  return {
    agents,
    retired: scale.retiredAgents ?? Math.round((agents * 740) / 980),
    theConversation: split.theConversation!,
    otherContacts: 150,
    otherPersonMessages: split.otherPersonMessages!,
    betweenAgents: split.betweenAgents!,
    groups: scale.groups,
    groupsWithThePerson: 15,
    membersPerGroup: 3,
    groupMessages: scale.groupMessages,
    officeLines: split.officeLines!,
    sessions: scale.records.session!,
    otherRecords: 0,
    project: {
      problems: scale.records.problem!,
      tasks: scale.records.task!,
      decisions: scale.records.decision!,
      proposals: scale.records.proposal!,
      modules: scale.records.module!,
      reports: scale.records.report!,
      openShare: 0.25,
    },
  }
}

/** The extras at a scale. The call log is made by this file, not by the extras. */
export function theExtrasAt(scale: AScale): TheExtras {
  return {
    openRuns: scale.runningRuns,
    runsWithARecentRequest: scale.runsWithARecentRequest,
    oldApiCalls: 0,
    comments: scale.comments,
    liveResources: scale.liveResources,
    releasedResources: scale.sessionResources - scale.liveResources,
  }
}

export const THE_LIVE_SCALE_SHAPE: Shape = theShapeAt(THE_LIVE_OFFICE_ON_9_OCTOBER)
export const THE_LIVE_SCALE_EXTRAS: TheExtras = theExtrasAt(THE_LIVE_OFFICE_ON_9_OCTOBER)

/** The kinds the chat office and its project do not make. */
const MADE_BY_THE_CHAT_OFFICE = ['message', 'session', 'report', 'problem', 'decision', 'task', 'proposal', 'module']

/** How many days of requests `api_calls` holds. The office's start prunes a row that names no trace after seven. */
const DAYS_OF_REQUESTS = 6.5

/** Made-up operations and routes, one per request in turn. */
const OPERATIONS = [
  ['records.read', '/api/records/:id', 'GET', 'read'],
  ['records.list', '/api/records', 'GET', 'read'],
  ['messages.waiting', '/api/messages', 'GET', 'read'],
  ['messages.mark', '/api/messages/:id/mark', 'POST', 'write'],
  ['records.update', '/api/records/:id', 'PATCH', 'write'],
  ['presence.read', '/api/presence', 'GET', 'read'],
  ['records.create', '/api/records', 'POST', 'write'],
  ['groups.list', '/api/groups', 'GET', 'read'],
] as const

/** A fixed sequence of numbers, so two builds make the same rows. */
function numbersFrom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

/** The local wall-clock hour `YYYY-MM-DD HH`, as the office keys a counted hour. */
function aLocalHour(at: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${String(at.getFullYear())}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}`
}

/**
 * The UTC hour `YYYY-MM-DD HH`, which names each made-up counted hour. The office keys a real counted hour by the local
 * clock, but on the day the clocks go back the local hour from 01:00 comes twice, and a build whose hours ran back across
 * both wrote the same hour twice and failed (wave 13y round 78, on 25 October 2026). No UTC hour comes twice. The hours
 * are made up and spread evenly, so in summer time they sit an hour away from the local names and nothing reads the
 * difference.
 */
function aUtcHour(at: Date): string {
  return at.toISOString().slice(0, 13).replace('T', ' ')
}

/** The local wall-clock stamp `YYYY-MM-DD HH:MM:SS`, as the office stores a moment. */
function aLocalStamp(at: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0')
  return `${aLocalHour(at)}:${two(at.getMinutes())}:${two(at.getSeconds())}`
}

/** Builds the office at the live scale in the database `sqlite` holds. Requests in `api_calls` end at `now`. */
export function buildTheOfficeAtTheLiveScale(sqlite: Database.Database, person: string, now: Date = THE_MEASURED_NOW): TheChatOffice {
  return buildTheOfficeAtAScale(sqlite, person, THE_LIVE_OFFICE_ON_9_OCTOBER, now)
}

/** Builds an office at `scale` in the database `sqlite` holds. Requests in `api_calls` end at `now`. */
export function buildTheOfficeAtAScale(sqlite: Database.Database, person: string, scale: AScale, now: Date = THE_MEASURED_NOW): TheChatOffice {
  const office = buildTheOfficeOfTheSlowestReads(sqlite, person, theShapeAt(scale), theExtrasAt(scale))
  const random = numbersFrom(20_261_009)
  const SENTENCE = 'These words were made up for a measurement and say nothing. '

  sqlite.transaction(() => {
    // A RUN HOLDS NO `data.agent`. The chat office writes the agent there, and the office's own start refuses a run
    // holding that old key beside `runtime`, so a server could not be started on this office with it.
    sqlite.prepare(`update records set data = json_remove(data, '$.agent') where kind = 'session'`).run()

    // THE OTHER KINDS, each with a short made-up body and nothing else, so no word of a kind's own is made up. An agent
    // record's body is replaced below by its row's handle and state.
    const addRecord = sqlite.prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, 'default', 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', ?, ?, null, ?, null, 'fixture')`,
    )
    for (const [kind, count] of Object.entries(scale.records).filter(([one]) => !MADE_BY_THE_CHAT_OFFICE.includes(one))) {
      for (let i = 0; i < count; i++) {
        addRecord.run(`scale-${kind}-${String(i).padStart(5, '0')}`, kind, `made-up ${kind} ${String(i)}`, JSON.stringify({ body: SENTENCE.repeat(8) }))
      }
    }

    // THE OFFICE'S OWN ROW, found by its handle. Its id is read from that row and never taken to be the handle.
    const theOfficesRow = sqlite.prepare(`select id from agents where handle = ? and retired = 0`).get(MOLE_OFFICE_HANDLE) as { id: string } | undefined
    if (theOfficesRow === undefined) throw new Error(`This database holds no live agent row with the handle ${MOLE_OFFICE_HANDLE}, so the build cannot leave the office's own row out.`)
    const theOfficesId = theOfficesRow.id

    // EACH AGENT'S RECORD, mapped to its row as `agent_records` maps it. One record for each agent but the office's
    // own, and the records left over a second record of the first agents, as an agent filed twice has.
    const agentRows = (sqlite.prepare(`select id from agents where id <> ? order by id`).all(theOfficesId) as { id: string }[]).map((one) => one.id)
    const agentRecords = (sqlite.prepare(`select id from records where kind = 'agent' order by id`).all() as { id: string }[]).map((one) => one.id)
    const mapRecord = sqlite.prepare(`insert into agent_records (record_id, agent_id) values (?, ?)`)
    agentRecords.forEach((record, i) => mapRecord.run(record, agentRows[i % agentRows.length]!))
    const recordOfAgent = new Map(agentRecords.slice(0, agentRows.length).map((record, i) => [agentRows[i]!, record]))

    // THE SECRETARIES: as many as the scale says, the first agents by id that the person started and that are not
    // retired, after the measured agent. The person appoints a secretary, and the measured agent stays a worker, so
    // what is measured on it is still a worker's. The secretariat group and each secretary's broadcast schedule are not
    // made here: a server's start makes both, as it does in every office (src/server/index.ts).
    const secretaries = sqlite.prepare(
      `update agents set role = ? where id in (select id from agents where retired = 0 and id <> ? and id <> ? and started_by_kind = 'person' order by id limit ?)`,
    ).run(theSecretaryCard(), theOfficesId, office.theAgent, scale.secretaries).changes
    if (secretaries !== scale.secretaries) {
      throw new Error(`The scale holds ${String(scale.secretaries)} secretaries, and this build has ${String(secretaries)} agents the person started, not retired, beside the measured agent.`)
    }

    // WHO STARTED EACH AGENT, when the scale counts it. Leaving out the measured agent and the secretaries, the first
    // secretary started the first agents by id, and the first of those are the supervisors. Each of the next agents was
    // started by the next supervisor in turn. The person started every other agent.
    if (scale.startedBy !== undefined) {
      const { theSecretary, supervisors, theirTeams } = scale.startedBy
      const theFirstSecretary = (sqlite.prepare(`select id from agents where role = ? order by id limit 1`).get(theSecretaryCard()) as { id: string }).id
      const started = (sqlite.prepare(`select id from agents where id <> ? and id <> ? and role <> ? order by id`).all(theOfficesId, office.theAgent, theSecretaryCard()) as { id: string }[]).map((one) => one.id)
      if (supervisors > theSecretary || started.length < theSecretary + theirTeams) {
        throw new Error(`The scale has the secretary start ${String(theSecretary)} agents, ${String(supervisors)} of them supervisors who start ${String(theirTeams)} more, and this build has ${String(started.length)} agents to start.`)
      }
      const startedBy = sqlite.prepare(`update agents set started_by_kind = ?, started_by_id = ? where id = ?`)
      started.forEach((id, i) => {
        if (i < theSecretary) startedBy.run('agent', theFirstSecretary, id)
        else if (i < theSecretary + theirTeams) startedBy.run('agent', started[(i - theSecretary) % supervisors]!, id)
        else startedBy.run('person', person, id)
      })
    }

    // AN AGENT RECORD HOLDS ITS ROW'S HANDLE AND STATE, the two fields the agent kind requires, and no body. A change to
    // a record checks all of its data, and the agent kind has no field `body`, so the first change to one was refused.
    // An office started on this file also left every agent record unmapped, because none carried a handle. A second
    // record of an agent holds the same handle and is retired, because only a retired record gives its handle up.
    const ofItsRow = sqlite.prepare(
      `update records set data = (select json_object('handle', handle, 'state', case when retired = 0 and ? = 0 then 'active' else 'retired' end) from agents where id = ?) where id = ?`,
    )
    agentRecords.forEach((record, i) => ofItsRow.run(i < agentRows.length ? 0 : 1, agentRows[i % agentRows.length]!, record))

    // THE RUNS THAT ENDED, the oldest, so the rest are open as the live office's are. And THE RUNS THAT NAME THE AGENT
    // THEY RAN AS, the newest, each of an agent still working.
    const runsOldestFirst = (sqlite.prepare(`select id from records where kind = 'session' order by id`).all() as { id: string }[]).map((one) => one.id)
    const close = sqlite.prepare(`update records set data = json_set(data, '$.closedAt', created_at, '$.closedBecause', 'made up for a measurement', '$.closedHow', ?) where id = ?`)
    for (const id of runsOldestFirst.slice(0, runsOldestFirst.length - scale.openRuns)) close.run(scale.closedHow ?? 'made-up', id)
    const working = (sqlite.prepare(`select id from agents where retired = 0 and id <> ? order by id`).all(theOfficesId) as { id: string }[]).map((one) => one.id)
    const ranAs = sqlite.prepare(`update records set data = json_set(data, '$.ranAs', json(?)) where id = ?`)
    for (const id of runsOldestFirst.slice(-scale.runsThatNameTheirAgent)) {
      const agent = working[Math.floor(random() * working.length)]!
      ranAs.run(JSON.stringify([{ workspaceId: 'default', agentId: recordOfAgent.get(agent)! }]), id)
    }

    // THE MESSAGES' SIZES. Every body is lengthened by the same filler until the average `data` is the file's, and the
    // newest message between two agents is made the file's largest.
    const messages = sqlite.prepare(`select count(*) as n, sum(length(data)) as bytes from records where kind = 'message'`).get() as { n: number; bytes: number }
    const short = scale.messageDataAverageBytes * messages.n - messages.bytes - scale.messageDataLargestBytes
    const largest = sqlite.prepare(`select id, length(data) as bytes from records where kind = 'message' and title = 'between two agents' order by id desc limit 1`).get() as { id: string; bytes: number }
    const each = Math.max(0, Math.floor((short + largest.bytes) / (messages.n - 1)))
    sqlite.prepare(`update records set data = json_set(data, '$.body', json_extract(data, '$.body') || ?) where kind = 'message' and id <> ?`).run(SENTENCE.repeat(Math.ceil(each / SENTENCE.length)).slice(0, each), largest.id)
    const grow = scale.messageDataLargestBytes - largest.bytes
    sqlite.prepare(`update records set data = json_set(data, '$.body', json_extract(data, '$.body') || ?) where id = ?`).run(SENTENCE.repeat(Math.ceil(grow / SENTENCE.length)).slice(0, grow), largest.id)

    // THE CALL LOG. Requests fall evenly over the last six and a half days, so a server's start prunes none of them. The
    // file's share of them name a run, among the file's number of the newest runs, and the run is the one whose turn it
    // was then, so the newest runs, the open ones among them, asked last.
    const runs = runsOldestFirst.slice(-scale.runsNamedByACall)
    const handles = (sqlite.prepare(`select handle from agents where retired = 0 order by id`).all() as { handle: string }[]).map((one) => one.handle)
    const already = (sqlite.prepare(`select count(*) as n from api_calls`).get() as { n: number }).n
    const calls = scale.apiCalls - already
    const call = sqlite.prepare(
      `insert into api_calls (id, at_ms, operation, effect, route, method, waits, status, ms, bytes, list_len, workspace_id, workspace_stated, actor_type, actor_id, session_id, identity_source, trace_id, purpose, target_id, target_kind, client_addr, client_origin)
       values (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'default', 1, ?, ?, ?, ?, ?, null, ?, ?, '127.0.0.1', 'local')`,
    )
    const span = DAYS_OF_REQUESTS * 24 * 3_600_000
    const end = now.getTime()
    for (let i = 0; i < calls; i++) {
      const share = i / calls
      const atMs = Math.round(end - span + share * span)
      const [operation, route, method, effect] = OPERATIONS[i % OPERATIONS.length]!
      const namesARun = random() < scale.callsThatNameARun / scale.apiCalls
      const at = Math.min(runs.length - 1, Math.max(0, Math.floor(share * runs.length + (random() - 0.5) * 40)))
      const human = !namesARun && random() < 0.5
      call.run(
        `scale-call-${i.toString(36).padStart(8, '0')}`,
        atMs,
        operation,
        effect,
        route,
        method,
        random() < 0.97 ? 200 : 404,
        1 + random() * 40,
        200 + Math.floor(random() * 20_000),
        route.endsWith(':id') ? null : Math.floor(random() * 50),
        human ? 'human' : 'agent',
        human ? person : handles[Math.floor(random() * handles.length)]!,
        namesARun ? runs[at]! : null,
        human ? 'header' : 'key',
        random() < 0.1 ? `scale-trace-${String(Math.floor(i / 50))}` : null,
        route.endsWith(':id') ? runs[at]! : null,
        route.endsWith(':id') ? 'record' : null,
      )
    }

    // THE TWO SUMMARIES OF THE CALL LOG: one row an hour per operation and listener, inside the same days, and one row a
    // day per caller with no key.
    const hourly = sqlite.prepare(`insert into hourly_calls (id, hour, operation, workspace_id, listener, calls) values (?, ?, ?, 'default', ?, ?)`)
    const perHour = OPERATIONS.length * 2
    for (let i = 0; i < scale.hourlyCalls; i++) {
      const hour = new Date(end - Math.floor(i / perHour) * 3_600_000)
      hourly.run(`scale-hour-${String(i).padStart(5, '0')}`, aUtcHour(hour), OPERATIONS[i % OPERATIONS.length]![0], i % perHour < OPERATIONS.length ? 'local' : 'remote', 1 + Math.floor(random() * 500))
    }
    // THE READS OF A CONVERSATION AND OF A GROUP, by reader as they were counted, over the last five days. An agent's
    // reads are of groups it is in, and the person's of conversations between two agents, read as neither of them.
    // The table keeps the newest read of each conversation, so each conversation's last read is
    // the one row written for it.
    // Each conversation once: a message from b to a is in the same conversation as one from a to b.
    const pairs = [...new Set((sqlite.prepare(
      `select distinct json_extract(data, '$.sentBy.id') as a, json_extract(data, '$.to[0].id') as b from records
       where kind = 'message' and title = 'between two agents' order by 1, 2`,
    ).all() as { a: string; b: string }[]).map((one) => [one.a, one.b].sort().join('~')))]
    const groupsOf = sqlite.prepare(`select group_id as id from group_members where member_kind = 'agent' and member_id = ? and left_at is null order by group_id`)
    const someGroups = (sqlite.prepare(`select id from groups order by id`).all() as { id: string }[]).map((one) => one.id)
    const read = sqlite.prepare(`insert into conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) values (?, 'default', ?, ?, ?, ?, ?)`)
    let made = 0
    // AT ANOTHER SCALE each reader keeps its share of the reads, and the reads add up to the scale's count. A reader
    // this build does not hold makes none (`theReadersAt`), and the agents still working must be as many as it says.
    const readsOf = theReadsByReaderAt(scale)
    if (working.length !== theWorkingAgentsAt(scale)) {
      throw new Error(`This build has ${String(working.length)} agents still working, and the scale's shape says ${String(theWorkingAgentsAt(scale))}, so the readers of its reads cannot be told.`)
    }
    const readers = theReadersAt(scale)
    THE_READS_BY_READER.forEach((one, r) => {
      if (!readers.includes(one)) return
      const isPerson = one.reader === 'the person'
      const readerId = isPerson ? person : one.reader === 'the measured agent' ? office.theAgent : working[r]!
      const theirGroups = isPerson ? [] : (groupsOf.all(readerId) as { id: string }[]).map((g) => g.id)
      const conversations = isPerson
        ? pairs.slice(0, one.of)
        : [...theirGroups, ...someGroups.filter((g) => !theirGroups.includes(g))].slice(0, one.of)
      const reads = readsOf[one.reader]!
      if (isPerson && conversations.length < Math.min(reads, one.of)) {
        throw new Error(`The person reads ${String(Math.min(reads, one.of))} conversations between two agents and this build made ${String(conversations.length)}.`)
      }
      // Read i is of conversation i modulo their number, so the last read of conversation c is the last such i.
      const n = conversations.length
      for (let c = 0; c < Math.min(n, reads); c++) {
        const i = c + n * Math.floor((reads - 1 - c) / n)
        const at = new Date(end - 5 * 86_400_000 + Math.floor((i / reads) * 5 * 86_400_000))
        read.run(
          `scale-read-${(made++).toString(36).padStart(6, '0')}`,
          isPerson ? 'person' : 'agent',
          readerId,
          conversations[c]!,
          isPerson ? '~neither' : readerId,
          aLocalStamp(at),
        )
      }
    })

    const headerOnly = sqlite.prepare(
      `insert into header_only_calls (id, day, actor_type, actor_id, client_addr, client_origin, first_seen, last_seen, calls) values (?, ?, 'agent', ?, '127.0.0.1', 'local', ?, ?, ?)`,
    )
    for (let i = 0; i < scale.headerOnlyCalls; i++) {
      const day = new Date(end - (i % 60) * 86_400_000)
      headerOnly.run(`scale-header-${String(i).padStart(5, '0')}`, day.toISOString().slice(0, 10), `made-up-caller-${String(Math.floor(i / 60))}`, day.getTime(), day.getTime(), 1 + Math.floor(random() * 100))
    }
  })()
  if (scale.messageSenders !== undefined) buildTheUnevenHistory(sqlite, person, office.theAgent, scale)
  return office
}

/** The optional uneven history. Older scales never enter this transaction. All words remain explicitly made up. */
function buildTheUnevenHistory(sqlite: Database.Database, person: string, theAgent: string, scale: AScale): void {
  sqlite.transaction(() => {
    const agents = sqlite.prepare(`select id from agents where handle <> ? order by id`).all(MOLE_OFFICE_HANDLE) as { id: string }[]
    const office = (sqlite.prepare(`select id from agents where handle = ?`).get(MOLE_OFFICE_HANDLE) as { id: string }).id
    const secretary = (sqlite.prepare(`select id from agents where role = ? order by id limit 1`).get(theSecretaryCard()) as { id: string }).id
    const recordsOf = new Map((sqlite.prepare(`select agent_id, record_id from agent_records`).all() as { agent_id: string; record_id: string }[]).map(r => [r.agent_id, r.record_id]))
    type Message = { id: string; created_at: string; data: string }
    const messages = sqlite.prepare(`select id, created_at, data from records where kind = 'message' order by id`).all() as Message[]
    const bodies = new Map(messages.map(m => [m.id, JSON.parse(m.data) as Record<string, any>]))
    const fromAgents = messages.filter(m => bodies.get(m.id)!.sentBy.kind === 'agent' && bodies.get(m.id)!.sentBy.id !== office && bodies.get(m.id)!.sentBy.id !== theAgent)
    const senders = agents.filter(a => a.id !== theAgent).slice(0, scale.messageSenders! - 3)
    const heavy = Math.max(1, Math.floor(senders.length / 2) - 2)
    const tail = inProportion(Object.fromEntries(senders.slice(0, heavy).map((a, i) => [a.id, 1 / (i + 1) ** 1.5])), fromAgents.length - 2 * senders.length)
    let next = 0
    const membership = sqlite.prepare(`insert or ignore into group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at) values (?, ?, 'agent', ?, ?, 'made up for a measurement', null)`)
    senders.forEach(a => {
      for (let i = 0; i < 2 + (tail[a.id] ?? 0); i++) {
        const m = fromAgents[next++]!
        const d = bodies.get(m.id)!
        d.sentBy = { kind: 'agent', id: a.id }
        if (typeof d.toGroup === 'string') {
          const held = sqlite.prepare(`select 1 from group_members where group_id = ? and member_kind = 'agent' and member_id = ?`).get(d.toGroup, a.id)
          if (!held) membership.run(`made-up-sender-member-${String(next)}`, d.toGroup, a.id, m.created_at)
        }
      }
    })

    // Keep the existing deliveries and their marks. Replace some recipients with the secretary, then add the gap.
    // Neither step takes a message the person sent or was sent, so the person's conversations keep who they are with.
    const deliveries = sqlite.prepare(`select id, message_id, recipient_kind, recipient_id, mark, at from message_delivery order by id`).all() as { id: string; message_id: string; recipient_kind: string; recipient_id: string; mark: string; at: string }[]
    const held = new Set(deliveries.filter(d => d.recipient_kind === 'agent' && d.recipient_id === secretary).map(d => d.message_id))
    const thePersons = new Set([...messages.filter(m => bodies.get(m.id)!.sentBy.kind === 'person').map(m => m.id), ...deliveries.filter(d => d.recipient_kind === 'person').map(d => d.message_id)])
    const replace = sqlite.prepare(`update message_delivery set recipient_kind = 'agent', recipient_id = ? where id = ?`)
    for (const d of deliveries) {
      if (held.size >= scale.secretaryDeliveries!) break
      if (held.has(d.message_id) || thePersons.has(d.message_id) || bodies.get(d.message_id)!.sentBy.id === secretary) continue
      replace.run(secretary, d.id)
      d.recipient_kind = 'agent'
      d.recipient_id = secretary
      held.add(d.message_id)
    }
    if (held.size !== scale.secretaryDeliveries) throw new Error('The made-up secretary delivery count could not be built.')
    const recipients = new Map<string, { kind: string; id: string }[]>()
    for (const d of deliveries) recipients.set(d.message_id, [...(recipients.get(d.message_id) ?? []), { kind: d.recipient_kind, id: d.recipient_id }])
    const add = sqlite.prepare(`insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)`)
    const notThePersons = messages.filter(m => !thePersons.has(m.id))
    for (let i = deliveries.length; i < scale.messageDelivery!; i++) {
      const m = notThePersons[(i - deliveries.length) % notThePersons.length]!
      const to = recipients.get(m.id) ?? []
      const recipient = agents.find(a => a.id !== secretary && a.id !== bodies.get(m.id)!.sentBy.id && !to.some(p => p.kind === 'agent' && p.id === a.id))!
      add.run(`made-up-extra-delivery-${String(i)}`, m.id, recipient.id, m.created_at)
      to.push({ kind: 'agent', id: recipient.id })
      recipients.set(m.id, to)
    }
    // Group deliveries must name members too. Direct messages carry the recipients their deliveries now name.
    for (const m of messages) {
      const d = bodies.get(m.id)!
      const to = recipients.get(m.id) ?? []
      if (typeof d.toGroup !== 'string') d.to = to
      else for (const p of to.filter(p => p.kind === 'agent')) {
        const found = sqlite.prepare(`select 1 from group_members where group_id = ? and member_kind = 'agent' and member_id = ?`).get(d.toGroup, p.id)
        if (!found) membership.run(`made-up-delivery-member-${m.id}-${p.id}`, d.toGroup, p.id, m.created_at)
      }
    }

    if (scale.longTailRuns) {
      const ranked = [secretary, ...agents.map(a => a.id).filter(id => id !== secretary)]
      const runs = sqlite.prepare(`select id, data from records where kind = 'session' order by id`).all() as { id: string; data: string }[]
      const spare = Math.max(0, runs.length - ranked.length)
      const tail = inProportion(Object.fromEntries(ranked.map((id, i) => [id, 1 / (i + 1) ** 1.2])), spare)
      const update = sqlite.prepare(`update records set data = ? where id = ?`)
      let nextRun = 0
      for (const id of ranked) for (let i = 0; i < 1 + tail[id]! && nextRun < runs.length; i++) {
        const r = runs[nextRun++]!
        const d = JSON.parse(r.data) as Record<string, unknown>
        d.servingAgentId = id
        if (d.ranAs !== undefined) d.ranAs = [{ workspaceId: 'default', agentId: recordsOf.get(id)! }]
        update.run(JSON.stringify(d), r.id)
      }
    }

    if (scale.projects !== undefined) {
      const projects = ['default', ...Array.from({ length: scale.projects - 1 }, (_, i) => `made-up-project-${String(i + 1)}`)]
      const addProject = sqlite.prepare(`insert or ignore into workspaces (id, title, note, created_at, updated_at) values (?, ?, 'Made up for a measurement', '2026-08-01 08:00:00', '2026-08-01 08:00:00')`)
      for (const id of projects) addProject.run(id, `Made-up project ${id}`)
      // The sealed-tip guard also guards its workspace. Put it back in the same transaction, as the tool does.
      const guard = (sqlite.prepare(`select sql from sqlite_master where type = 'trigger' and name = 'sealed_tip_no_update'`).get() as { sql: string }).sql
      sqlite.prepare(`drop trigger sealed_tip_no_update`).run()
      const rows = sqlite.prepare(`select id, kind from records where kind <> 'message' order by kind, id`).all() as { id: string; kind: string }[]
      // EACH KIND IN TURN ACROSS THE PROJECTS. When the scale says what the first project holds, it holds that many runs,
      // every agent record and its share of every other kind, spread evenly through each kind, and the rest go in turn.
      const howMany = new Map<string, number>()
      for (const r of rows) howMany.set(r.kind, (howMany.get(r.kind) ?? 0) + 1)
      const first = scale.theFirstProject
      const otherRecords = [...howMany].filter(([kind]) => kind !== 'session' && kind !== 'agent').reduce((sum, [, n]) => sum + n, 0)
      howMany.set('message', messages.length)
      const elsewhere = new Map<string, number>()
      const projectOf = (kind: string, i: number, n: number = howMany.get(kind)!): string => {
        if (first === undefined) return projects[i % projects.length]!
        const held = kind === 'session' ? first.runs : kind === 'agent' ? n : Math.round((n * first.otherRecords) / otherRecords)
        if (Math.floor(((i + 1) * held) / n) > Math.floor((i * held) / n)) return projects[0]!
        const j = elsewhere.get(kind) ?? 0
        elsewhere.set(kind, j + 1)
        return projects[1 + (j % (projects.length - 1))]!
      }
      const place = new Map<string, string>()
      const perKind = new Map<string, number>()
      const move = sqlite.prepare(`update records set workspace_id = ? where id = ?`)
      for (const r of rows) {
        const i = perKind.get(r.kind) ?? 0
        const project = projectOf(r.kind, i)
        perKind.set(r.kind, i + 1)
        place.set(r.id, project)
        move.run(project, r.id)
      }
      sqlite.prepare(guard).run()
      messages.forEach((m, i) => {
        const d = bodies.get(m.id)!
        const target = d.target?.target as { recordId?: string; workspaceId?: string } | undefined
        const project = (target?.recordId === undefined ? undefined : place.get(target.recordId)) ?? projectOf('message', i)
        d.writtenIn = { project }
        if (target) target.workspaceId = project
      })
      const groups = sqlite.prepare(`select id from groups order by id`).all() as { id: string }[]
      const moveGroup = sqlite.prepare(`update groups set workspace_id = ? where id = ?`)
      groups.forEach((g, i) => moveGroup.run(projectOf('group', i, groups.length), g.id))
      sqlite.prepare(`update links set workspace_id = (select workspace_id from records where id = links.from_id)`).run()
      sqlite.prepare(`update session_resources set workspace_id = (select workspace_id from records where id = session_resources.session_record_id)`).run()
      const bindings = sqlite.prepare(`select id, data from records where kind = 'session' and json_type(data, '$.ranAs') is not null`).all() as { id: string; data: string }[]
      const bind = sqlite.prepare(`update records set data = ? where id = ?`)
      for (const r of bindings) {
        const d = JSON.parse(r.data) as { ranAs: { workspaceId: string; agentId: string }[] }
        for (const a of d.ranAs) a.workspaceId = place.get(a.agentId)!
        bind.run(JSON.stringify(d), r.id)
      }
    }

    const updateMessage = sqlite.prepare(`update records set data = ? where id = ?`)
    for (const m of messages) updateMessage.run(JSON.stringify(bodies.get(m.id)), m.id)
    const withdraw = sqlite.prepare(`update records set deleted_at = '2026-10-22 10:00:00' where id = ?`)
    const change = sqlite.prepare(`insert into changes (id, record_id, op, actor_type, actor_id, at, workspace_id) values (?, ?, 'delete', 'agent', ?, '2026-10-22 10:00:00', 'message-centre')`)
    for (const m of messages.slice(0, scale.withdrawnMessages)) {
      withdraw.run(m.id)
      change.run(`made-up-withdrawal-${m.id}`, m.id, office)
    }

    // THE CHANGE LOG, when the scale counts it, up to its count in all. Each run writes its share to its own record, a
    // minute apart from its start, as the agent it names, and one write in four changes its state. One write in
    // 6,419 is by a writer no agent row names, 110 of them at the 4 November count. That share is a guess: nobody
    // counted the live office's writers that no agent row names for this build.
    if (scale.changes !== undefined) {
      const runs = sqlite.prepare(`select id, workspace_id as project, created_at as at, coalesce(json_extract(data, '$.servingAgentId'), json_extract(data, '$.agent')) as agent from records where kind = 'session' order by created_at, id`).all() as { id: string; project: string; at: string; agent: string | null }[]
      const toMake = scale.changes - (sqlite.prepare(`select count(*) as n from changes`).get() as { n: number }).n
      const write = sqlite.prepare(
        `insert into changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at) values (?, ?, ?, 'update', 'agent', ?, ?, ?, ?, ?, ?)`,
      )
      const STATES = ['running', 'idle', 'finished']
      for (let i = 0; i < toMake; i++) {
        const r = Math.floor((i * runs.length) / toMake)
        const run = runs[r]!
        const minute = i - Math.ceil((r * toMake) / runs.length)
        const at = aLocalStamp(new Date(new Date(run.at.replace(' ', 'T')).getTime() + minute * 60_000))
        const writer = i % 6_419 === 6_418 ? `made-up-unregistered-writer-${String(Math.floor(i / 6_419))}` : run.agent ?? agents[0]!.id
        const state = i % 4 === 3
        write.run(`made-up-change-${i.toString(36).padStart(8, '0')}`, run.id, run.project, writer, run.id, state ? 'data.state' : null,
          state ? STATES[(i >> 2) % STATES.length]! : null, state ? STATES[((i >> 2) + 1) % STATES.length]! : null, at)
      }
    }

    // THE LINKS, when the scale counts them, up to their count in all: each project's share by its records, each link
    // from one of its records to another, of four kinds that build no tree, in turn. When the scale also names them,
    // the links the Horizons and Edit pages read follow: a module serves a goal, makes a planned state real or answers
    // it another way, and carries a block. They follow the four, so the four keep their counts and their order.
    if (scale.links !== undefined) {
      const already = (sqlite.prepare(`select count(*) as n from links`).get() as { n: number }).n
      const ofEach = new Map<string, { id: string; at: string }[]>()
      for (const r of sqlite.prepare(`select id, workspace_id as project, created_at as at from records where kind <> 'message' order by id`).all() as { id: string; project: string; at: string }[]) {
        const held = ofEach.get(r.project)
        if (held === undefined) ofEach.set(r.project, [r])
        else held.push(r)
      }
      const shares = inProportion(Object.fromEntries([...ofEach].map(([project, held]) => [project, held.length])), scale.links - already)
      const link = sqlite.prepare(
        `insert or ignore into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
         values (?, ?, 'owner', ?, ?, ?, 0, 'made-up', 'agent', ?, ?)`,
      )
      const TYPES = ['relates_to', 'about', 'discusses', 'measures']
      let made = 0
      for (const [project, held] of ofEach) {
        const n = held.length
        if (shares[project]! > n * (n - 1)) throw new Error(`The made-up project ${project} has too few records for its ${String(shares[project])} links.`)
        for (let j = 0, here = 0; here < shares[project]!; j++) {
          const from = held[j % n]!
          const to = held[(j % n + 1 + (Math.floor(j / n) % (n - 1))) % n]!
          const added = link.run(`made-up-link-${String(made)}`, project, from.id, to.id, TYPES[j % TYPES.length]!, from.at, from.at).changes
          here += added
          made += added
        }
      }

      // THE LINKS THE HORIZONS AND EDIT PAGES READ, after the four above so those keep their counts and their order.
      // Each runs FROM a module: a module serves a goal, makes a planned state real, answers a planned state another
      // way, or carries a block. No new link ends at a module, so no record that receives one can lead back to the
      // module that wrote it. The live office has no `realises` or `instead_of` link to a planned state at all, and
      // the scale names a few so that path through the read is measured. It has no deleted block, so every
      // `implements` link here points at a live block.
      const theReadLinks = [
        { type: 'serves', to: 'goal', count: scale.servesToGoals ?? 0, offset: 0 },
        { type: 'realises', to: 'planned_state', count: scale.realisesToPlannedStates ?? 0, offset: 0 },
        { type: 'instead_of', to: 'planned_state', count: scale.insteadOfToPlannedStates ?? 0, offset: 5 },
        { type: 'implements', to: 'block', count: scale.implementsToBlocks ?? 0, offset: 0 },
      ] as const
      if (theReadLinks.some((one) => one.count > 0)) {
        type LinkEnd = { id: string; project: string; at: string }
        const endsOfKind = (kind: string): LinkEnd[] =>
          sqlite.prepare(`select id, workspace_id as project, created_at as at from records where kind = ? and deleted_at is null order by id`).all(kind) as LinkEnd[]
        const modules = endsOfKind('module')
        const insert = sqlite.prepare(
          `insert into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
           values (?, ?, 'owner', ?, ?, ?, 0, 'made-up', 'agent', ?, ?)`,
        )
        for (const one of theReadLinks) {
          if (one.count === 0) continue
          const tos = endsOfKind(one.to)
          if (modules.length === 0 || tos.length === 0) {
            throw new Error(`The scale names ${String(one.count)} \`${one.type}\` links, and the made-up office has ${String(modules.length)} modules and ${String(tos.length)} ${one.to} records to make them from and to.`)
          }
          const held = new Map<string, { modules: LinkEnd[]; tos: LinkEnd[] }>()
          const inProject = (project: string): { modules: LinkEnd[]; tos: LinkEnd[] } => {
            const found = held.get(project) ?? { modules: [], tos: [] }
            held.set(project, found)
            return found
          }
          for (const module of modules) inProject(module.project).modules.push(module)
          for (const to of tos) inProject(to.project).tos.push(to)
          const projects = [...held.values()].filter((project) => project.modules.length > 0 && project.tos.length > 0)
          const pairs: { from: LinkEnd; to: LinkEnd }[] = []
          finding: for (let round = 0; ; round++) {
            let added = false
            for (const project of projects) {
              if (round >= project.modules.length * project.tos.length) continue
              // THE WALK: r turns the modules, q moves one place every M rounds, and the target adds both, so every
              // one of the M x T pairs is reached before the limit stops the walk, even when M and T share a factor.
              const r = round % project.modules.length
              const q = Math.floor(round / project.modules.length)
              pairs.push({
                from: project.modules[(r + one.offset) % project.modules.length]!,
                to: project.tos[(r + q) % project.tos.length]!,
              })
              added = true
              if (pairs.length >= one.count) break finding
            }
            if (!added) break
          }
          if (pairs.length < one.count) {
            throw new Error(`The scale names ${String(one.count)} \`${one.type}\` links, and the made-up office has ${String(pairs.length)} pairs of a module and a ${one.to} in one project.`)
          }
          for (let i = 0; i < one.count; i++) {
            const { from, to } = pairs[i]!
            insert.run(`made-up-read-link-${one.type}-${String(i)}`, to.project, from.id, to.id, one.type, from.at, from.at)
          }
        }

        // NO RECORD SERVES, REALISES OR REPLACES A RECORD THAT LEADS BACK TO IT. A path of these three types that
        // came back to its start would mean one thing answered itself.
        const answering = sqlite.prepare(`select from_id as "from", to_id as "to" from links where type in ('serves', 'realises', 'instead_of')`).all() as { from: string; to: string }[]
        const nextOf = new Map<string, string[]>()
        for (const link of answering) nextOf.set(link.from, [...(nextOf.get(link.from) ?? []), link.to])
        const seen = new Map<string, boolean>()
        const walk = (id: string): void => {
          if (seen.get(id) === true) throw new Error(`A serves, realises or instead_of path leads back to the record ${id}.`)
          if (seen.get(id) === false) return
          seen.set(id, true)
          for (const next of nextOf.get(id) ?? []) walk(next)
          seen.set(id, false)
        }
        for (const id of nextOf.keys()) walk(id)
      }
    }
  })()
}
