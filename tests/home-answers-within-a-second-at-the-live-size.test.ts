// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, package HD, point HD-2e): the checklists door is timed at the address Home's
// first view asks for it, read from Home's own checklist read rather than written here, both for every project and
// for the project the page opens on; only the projects part of the address differs between the two asks.
// Before, the checklists door was asked at GET /api/checklists?projects=all, an ask Home's first view stopped making
// when it began to ask only the open items while the checklists window is closed, so the read of every item now waits
// for the window.
// Criterion change (wave 13y round 175, as decided): the people and packages door is one of Home's doors, after the
// backlog progress, with the same limits: under a second, 200 statements and 400 MB.
// Home's progress card reads it for its table of lines. The case that its warm ask hands the server no outside row
// allows the two packaged tasks by name, which thePackagesCounted states by packageStateOf. The door also reads the
// runs that theRunsActingNow chooses within idleReminderHours(), and no outside run is among them here.
// Before, Home asked no people door, and nothing here held its time, its statements, its bytes or its outside rows.
// Criterion change (wave 13s round 281, decision 7LNTYnmK_O1W, widened in message zsRUeGl2Scdq): the residents door's
// case that its warm ask hands the server no row outside the answer also allows, by name, the retired agent record
// outside-retired-agent-a. readParticipant reads it for the runtime of the settled proposal's agent: the agent's newest
// record, wherever it is, one row for each proposal.
// Before, the residents case allowed only the settled residency proposal and the decision that settles it.
// Criterion change (wave 13s round 281, decisions 7LNTYnmK_O1W and c9zpvbEXKAmg): the residents door runs as many
// statements that read records directly with two live residency proposals as with one. A direct read names records
// after `from`. A read that reaches records only through a join is not counted.
// Before, the door was held by its time, its bytes, its 200 statements and its rows outside the answer, and nothing
// held what a further proposal costs it.
// Criterion change (wave 13s round 281, decision 7LNTYnmK_O1W): the case that a door's warm ask hands the server no
// row outside the answer allows, under two doors, the outside rows the door's one-place rule must read, named beside
// the door. Under the backlog progress these are the two packaged tasks, whose state packageStateOf works out. Under
// the residents they are the settled residency proposal and the decision that settles it, which the settled rule
// reads. Any other outside row still turns the case red, and every other door allows none.
// Before, no door's warm ask could hand the server any outside row.
// Criterion change (wave 13s round 281, decisions OQR0WDVq0FkP and srwXywF1oYIs): an open run of each retired agent
// is a row outside the answer.
// The roster draws no run of an agent that is not active, so the setup writes one open run for each retired agent, and
// the roster's case that it hands the server no outside row holds those runs too. The first run names its agent in its
// one entry, and the second in its entry for this project, which is its second.
// Before, the retired agents had no run here, so no case saw the roster read the runs of agents that are not active.
// Criterion change (wave 13s round 281, decisions OQR0WDVq0FkP and M1ngfatGQcwn, F2): Home asks
// no doing read, so it is no door of Home's own here.
// Home reads the run serving each agent from the roster's rows. So the doing read's door goes, with the case that held
// the roster to more agents than that read asks at once. The roster's answer already hands the server each active
// agent's open runs, and a second read of the same runs is more rows for the same answer.
// Before, this file asked the doing read for the first slice of the roster's agents, and held it as one of Home's doors.
// Criterion change (wave 13s round 281, decision OQR0WDVq0FkP, F5 and H6 of decision zuYDJZ36Z-5A): the checklists
// door asked for every project runs as many statements that read records as for the one project the page opens on.
// Before, the door was held by its time, its bytes, its 200 statements and its rows outside the answer, and nothing
// held what every project costs it against one project.
// Criterion change (wave 13s round 281, decision OQR0WDVq0FkP): Late or stuck asks one door
// for the pipelines that stand still.
// The pipelines and the blocks, two doors that each read a whole kind of the project, become one door,
// GET /api/pipelines/standing-still, with one limit of 200 statements. The made-up rows gain more still pipelines, so
// as many stand still inside the answer as Late or stuck draws, and one more still pipeline past them, outside it,
// because Home only counts it.
// Before, the pipelines and the blocks were two doors, each with its own limit of 200, and one still pipeline was
// written, so a door that handed every still pipeline over was not told apart from one that handed the drawn ones.
// Criterion change (wave 13s round 281, decision OQR0WDVq0FkP): Home's doors
// hand the server no row outside the answer it draws.
// Each door had a plan case. It read SQLite's plan for every statement of the door's warm ask, and held that no step
// walked all of records, or every record of one kind or of one project. Two cases take its place. The first counts the
// rows the warm ask's statements hand the server, and holds that none is outside the answer Home draws. The second
// holds that the reply carries none. The decision allows a walk inside the database that hands back only what Home
// draws, so the plan is no longer the test, and the rows handed back are.
// Before, no plan step of a door's warm ask could walk all of records, or every record of one kind or of one project.
/**
 * HOME'S OWN READS ANSWER WITHIN A SECOND AT THE LIVE SIZE, IN THE TIMING GROUP. Wave 13s round 281, package HD, point
 * HD-2e: Home never freezes.
 *
 * WHAT THIS FILE HOLDS. Every read Home's first view asks of its own, with every project shown, is asked here once as a
 * warm ask and then five times, as the person, with the page's query. The asking of a door stops at its first ask over
 * the second. Each door is held by the medians of its asks: it answers in less than ANSWERS_WITHIN_MS, it reads less
 * than READS_WITHIN_BYTES from the database's files, and it runs fewer statements than its own limit, as its
 * Server-Timing header counts them. The warm ask is counted too, by tests/the-rows-a-read-hands-the-server.ts. No row its
 * statements hand the server may be outside the answer Home draws, but the rows the door's own rule must read, which
 * DOORS names beside the door. Its reply may carry none. The helper is installed
 * before the app is made, so a statement prepared after the install is counted, kept or not. The rows outside are this
 * file's own, and WHICH ROWS LIE OUTSIDE THE ANSWER below names them.
 *
 * ONE PROJECT OR EVERY ONE. The checklists door is asked once more for every project and once for the project the page
 * opens on, and both asks carry Home's own query; only the projects part of the address differs. The statements of
 * each ask that read the records table are counted. Every project may run no more of them than the one project: a
 * door that reads each project in turn runs one or more for each.
 *
 * ONE RESIDENCY PROPOSAL OR TWO. The residents door is asked once more with the one settled proposal, and once with a
 * second live proposal beside it: a copy of the first, which nothing settles, removed after the ask. The statements of
 * each ask that read the records table directly, naming it after `from`, are counted, and two proposals may run no
 * more of them than one (decision c9zpvbEXKAmg). A door that reads each proposal again by its id runs one more for
 * each. Three reads still run for each proposal, and each reaches records only through a join, so none is counted:
 * the settling links (src/server/lib/records/fork-settled.ts:185-192), the replacements of a settling decision
 * (src/server/lib/replaced-decisions.ts:119) and the agent's runtime through readParticipant
 * (src/server/db/read-participant.ts:67 and :252).
 *
 * WHICH READS ARE HOME'S OWN. These are the doors the page itself asks, with every project shown. The frame, the
 * sidebar and the chat panel ask their own reads on every page, Home among them; those are not timed here. The doors,
 * in the order they are asked:
 *   - GET /api/workspaces, the projects.
 *   - GET /api/pipelines/standing-still, the pipelines of the project that stand still.
 *   - GET /api/home-layout.
 *   - GET /api/key-items?projects=every, the checklists door at the address Home's own read asks (read from
 *     src/web/lib/my-checklists.ts, not written here), and GET /api/figures/my-decisions?projects=all.
 *   - GET /api/attention?machine=omit&shape=other-projects.
 *   - GET /api/working?shape=home, the roster, which the page asks once for each project.
 *     Its rows name the run serving each agent, and Home reads that run from them, so it asks no doing read
 *     (GET /api/working?shape=home&doing=...).
 *   - GET /api/planning/today, and GET /api/planning/day/<day>, which the page asks for seven days from the day today's
 *     reply names. Here it is asked for that first day.
 *   - GET /api/backlog/progress and GET /api/projects/<project>/people-and-packages, the progress card's two reads,
 *     then GET /api/office/pause and GET /api/residents.
 *   - GET /api/records/<id>, which a Needs you row asks for its record. Here it is asked for the first row of GET
 *     /api/waiting whose id is a record's, as Home tells. The second ask of the same record with `secondLevel=show`, which
 *     the page makes only when the reply holds something back, is not asked here.
 *
 * WHICH PROJECT. A browser that has never chosen a project asks GET /api/workspaces under the default project, and opens
 * on the listed project holding the most records, ties by id (`theProjectToOpenOn` in src/web/lib/workspace.ts). So
 * every door is asked under that project. A door the page asks once for each project is asked here for that project
 * alone. The test asks GET /api/workspaces as the page does and takes the project by the same rule, written again here
 * because the page's is not exported and reads the browser's storage. The list leaves out the message centre and counts
 * no flow run (`readWorkspaces` in src/server/lib/workspaces.ts). This file's own count of the records table counted
 * both, so it chose the message centre, and its setup stopped before any door was asked.
 *
 * THE OFFICE IS MADE UP at the counts of 13 November 2026: THE_LIVE_OFFICE_ON_13_NOVEMBER in
 * tests/the-office-at-the-live-scale.ts, with the guesses named beside it. Every name and word is made up. Read from that
 * build and from each door's code, and not from a run:
 *   - THESE DOORS FIND ROWS THERE. The projects; the other projects' attention; the roster, every agent record being in
 *     the first project, with the run serving each agent; the record of a Needs you row.
 *   - THE NEEDS YOU ROW COMES FROM THE BUILD. The first project, the one the page opens on, holds about five in six of
 *     every kind but runs and agents, so most of the build's problems. A quarter of the problems are open and half say
 *     it is the person's move. Their asker is named by no revision, as they were written by SQL, so each goes to the
 *     person (`whereTheQuestionIs` in src/server/lib/confirming.ts) and is a row of GET /api/waiting. The setup takes
 *     the first row of that project whose id is a record's. If there is none, the setup stops and says so.
 *   - THESE DOORS FIND NONE IN THE BUILD, AND THIS FILE'S ROWS ARE ALL THEY FIND. GET /api/pipelines/standing-still:
 *     the build's pipelines and blocks hold a made-up body alone, so no pipeline names a step. GET /api/home-layout: no
 *     layout is kept, so it answers A. GET /api/key-items: one key item, closed. GET /api/checklists, at the address
 *     Home's own first-view read asks (read from Home's read, not written here): one checklist, a build agent's. GET
 *     /api/figures/my-decisions: one link of a decision settling a proposal, made on 1 September
 *     2026, before the figure's span; the build's links are of other types. GET /api/planning/today and GET
 *     /api/planning/day/<day>: no allocation and no routine. GET /api/backlog/progress: two backlog points and two
 *     packaged tasks. GET /api/office/pause: no pause is kept. GET /api/residents: no resident, and one residency
 *     proposal, settled.
 *   - THE PEOPLE AND PACKAGES FINDS ROWS OF BOTH KINDS. Its acting runs are the runs a request of the build's call log
 *     named within the last hour, and the build's requests name only the build's own runs. The packaged tasks it
 *     counts include this file's two.
 *   A door that finds none is still asked, because how it looks for its rows can cost what finding them would.
 *
 * WHICH ROWS LIE OUTSIDE THE ANSWER. Decision OQR0WDVq0FkP says: "no read Home makes hands the server more rows than the
 * answer it draws is made of; a whole kind or project is never pulled into the server to be filtered or counted there.
 * A scan inside the database that answers within the one-second bar of j__ITYdBoRY2 and hands back only the rows or the
 * count Home draws is allowed, including a scan through a covering index (Q1: yes, allowed) and a walk that stops at a
 * LIMIT (Q3 falls away)." This file reads it so:
 *   - A record Home draws as a row is inside the answer.
 *   - A record Home only counts is outside it. The count is what Home draws, so a read hands back the count and not the
 *     rows.
 *   - A record of a kind Home draws, in a state or with an owner Home does not draw, is outside it.
 * The setup writes these rows into the project the page opens on, after the build and before the helper and the app. If
 * the page opens on another project, the setup stops and says so. Each outside row's title holds its own marker, and
 * every marker begins with OUTSIDE_MARKS:
 *   - Three pipelines of two steps each: one moving, one finished and one standing still. The moving and the finished
 *     ones and all six steps are outside.
 *   - More pipelines on the still one's two steps, at its time, until as many stand still as Late or stuck draws rows
 *     (HOME_ALARMS_SHOWN, its LATE_SHOWN). These are inside, and their titles hold no marker.
 *   - One more still pipeline on the same steps, older than those. It is outside: it is past the rows Late or stuck
 *     draws, so Home only counts it.
 *   - A closed key item, a checklist a build agent owns, and two retired agents.
 *   - An open run of each retired agent.
 *   - Two backlog points and two packaged tasks, each pair in two states.
 *   - A settled residency proposal, and the decision that settles it.
 * Each row's comment in `theRowsOutsideTheAnswer` says why it is outside. The premise case holds each as a live record
 * of its kind in that project, and no other record's title with a marker.
 *
 * THREE DOORS MAY READ SOME OF THEM. Decision 7LNTYnmK_O1W allows a door the rows its one-place rule must read, and
 * names them: under the backlog progress, the project's inside packaged tasks; under the residents, the live residency
 * proposals and the decisions that settle or replace them. Message zsRUeGl2Scdq adds one row for each proposal under
 * the residents: the newest record of the proposal's agent, which readParticipant reads for the agent's runtime. The
 * people and packages reads the same packaged tasks by the same rule (as decided). Each allowed row is named once,
 * beside its door in DOORS, with the rule that reads it. The case that a door hands the server no record outside the
 * answer allows those and no other outside row.
 *
 * WHAT IT COSTS TO RUN. The hook builds the office tests/the-project-graph-answers-within-a-second-at-the-live-size.test.ts
 * builds, without that file's revision rows. That file says its build takes about three and a half minutes on a quiet
 * machine, with a database of about 3.2 GB in the test's own folder, removed when the file ends. Then each door is asked
 * at most six times, and an ask over the second stops its door's asking, so a red door does not wait for four more.
 *
 * IT RUNS ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine, as
 * tests/the-timing-tests.ts says.
 *
 * NO RUN OF IT IS CITED AS PROOF. No figure here was measured. The timing group runs this file.
 *
 * WHAT THIS FILE DOES NOT CATCH.
 *   - A read that is slow only when its pages are not in memory can stay under the second here.
 *   - A walk inside the database that hands back only what Home draws. The decision allows it, and only its time, its
 *     bytes and its statements are held here.
 *   - The other projects' attention is worked out on a worker thread with its own connection
 *     (src/server/lib/attention-thread.ts:162-168). That door's statements, rows and bytes here are only this thread's,
 *     and only its time is held whole.
 *   - A statement that hands back an outside row's other columns without its id or its title.
 *   - A door that pulls in a whole kind of which this office holds no outside row. The layout, the plans, the office's
 *     pause and a Needs you row's record read kinds of which this file writes none. The decisions figure's one outside
 *     link is older than its span, so a figure that pulls in every link of its span is not caught.
 *   - Late or stuck draws the project's alarms first, and still pipelines only in the rows left. The alarms come from
 *     another door, so here every still pipeline up to HOME_ALARMS_SHOWN is held inside, whatever the alarms take.
 *   - The build's own rows outside the answer are not in the list. Only this file's rows are looked for.
 *   - A statement run on this connection outside the warm ask. As the code was read, no timer of the app reads a record
 *     between two asks, and the usage rows of each answer (src/server/lib/usage.ts) are written inside its ask.
 *   - A statement kept on this connection before the install, which the helper never wraps. As the code was read, the
 *     migration in freshDb and the build reach no reader that keeps a statement of records: not keptStatement, getRecord,
 *     agentByHandle or the kept statements of src/server/lib/records/reading.ts:54-63. The migration's modules do keep
 *     statements of agents, aliases and storage (src/server/db/agent-references.ts:105-117,
 *     src/server/db/registry-aliases/index.ts:111-127, src/server/db/storage/inventory.ts:53-84). Their rows hold no
 *     record, so none is an outside row. If one of them is kept before the install, the rows it hands a door later are
 *     left out of the row count.
 *   - The frame's reads, six of the seven days, the second level of a record, and every read after the first view.
 *   - How many reads the page asks.
 *   - A statement that reads records without naming the table after `from` or `join`. The count of statements that
 *     read records does not count it.
 *   - Which columns of an allowed row are handed back. Decision 7LNTYnmK_O1W says the packaged tasks come with only the
 *     fields packageStateOf reads. The helper answers only which outside rows were handed back, so a read of a task's
 *     whole record is not told apart from the narrowed read.
 *   - A packaged task for outside work. This file writes none, so a progress read that hands the server one is not
 *     caught.
 *   - A read the residents door runs for each proposal that reaches records only through a join. The residents
 *     statements case counts the direct reads alone.
 *   - The read of every item, which the checklists window asks while it is open. It is not Home's first view, so it
 *     is not timed here.
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { EVERY_PROJECT, PROJECTS_QUERY, projectsQuery } from '../src/shared/across-projects.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WorkspacesReply } from '../src/server/api/workspaces.ts'
import type { ChecklistsAcrossReply } from '../src/web/api.ts'
import type { WaitingItem } from '../src/server/lib/waiting.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheOfficeAtAScale, THE_LIVE_OFFICE_ON_13_NOVEMBER } from './the-office-at-the-live-scale.ts'
import { theRowsAReadHandsTheServer } from './the-rows-a-read-hands-the-server.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

/** HD-2e: every read Home makes answers within a second. */
const ANSWERS_WITHIN_MS = 1_000
/** HD-2e: the most bytes one ask may read from the database's files, the same bar as every door here. */
const READS_WITHIN_BYTES = 400 * 2 ** 20

/*
 * THE MOST STATEMENTS ONE ASK OF EACH DOOR MAY RUN, as its Server-Timing header counts them. No door's count was
 * measured: a worker measures nothing. So each limit is 200, the limit the timing group already holds
 * GET /api/project-graph to. Each one's reason says what it catches at this size, or that it only bounds a door that
 * finds a few rows or none here.
 */
/** The projects: it counts the records of each project, so one statement for each record counted is over it. */
const WORKSPACES_RUNS_WITHIN_STATEMENTS = 200
/**
 * The pipelines standing still: about 36 pipelines and 489 blocks in the project asked, so six statements or more for
 * each pipeline, or one for each block, are over it.
 */
const STANDING_STILL_RUNS_WITHIN_STATEMENTS = 200
/** The layout: none is kept here, so the limit only bounds the door's reading when it finds nothing. */
const HOME_LAYOUT_RUNS_WITHIN_STATEMENTS = 200
/** The key items: one here, and closed, so the limit only bounds the door's reading when it finds none open. */
const KEY_ITEMS_RUNS_WITHIN_STATEMENTS = 200
/** The checklists: one here, a build agent's, so the limit only bounds the door's reading of a few rows. */
const CHECKLISTS_RUNS_WITHIN_STATEMENTS = 200
/** The decisions figure: one settling link here, older than its span, so the limit only bounds a reading of none. */
const MY_DECISIONS_RUNS_WITHIN_STATEMENTS = 200
/** The other projects' attention: ten other projects or more, so twenty statements for each project are over it. */
const OTHER_PROJECTS_RUNS_WITHIN_STATEMENTS = 200
/** The roster: about 1,600 active agents in the project asked, so one statement for each agent is over it. */
const ROSTER_RUNS_WITHIN_STATEMENTS = 200
/** Today's plan: no allocation here, so the limit only bounds the door's reading when it finds nothing. */
const TODAY_RUNS_WITHIN_STATEMENTS = 200
/** One day's plan: no allocation here, so the limit only bounds the door's reading when it finds nothing. */
const DAY_RUNS_WITHIN_STATEMENTS = 200
/** The backlog progress: two points and two packaged tasks here, so the limit only bounds a reading of a few rows. */
const PROGRESS_RUNS_WITHIN_STATEMENTS = 200
/**
 * The people and packages: the build's runs acting within the hour and this file's two packaged tasks here, so the
 * limit bounds a reading of each acting run's agent, one by one.
 */
const PEOPLE_RUNS_WITHIN_STATEMENTS = 200
/** The office's pause: none is kept here, so the limit only bounds the door's reading when it finds nothing. */
const PAUSE_RUNS_WITHIN_STATEMENTS = 200
/** The residents: no resident and one settled proposal here, so the limit only bounds a reading of a few rows. */
const RESIDENTS_RUNS_WITHIN_STATEMENTS = 200
/** One record: one statement for each of its links or revisions, past 200 of them, is over it. */
const RECORD_RUNS_WITHIN_STATEMENTS = 200

/** Every outside row's marker begins with this, and no record's id holds it. */
const OUTSIDE_MARKS = 'OUTSIDE-THE-ANSWER-'

/** A row this file writes outside the answer Home draws: its kind and state, for a failure, and the marker in its title. */
interface AnOutsideRow { id: string; kind: string; state: string; marker: string }

const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

/**
 * What a door's address is made from: each is read from the office, from an earlier door's answer, or from Home's
 * own read.
 */
interface TheAsking {
  /** The day today's plan names. */
  today: string
  /** The record of the first Needs you row whose id is a record's. */
  needsYou: string
  /** The address Home's own checklist read asks. */
  checklists: string
}

/** One of Home's own doors. */
interface ADoor {
  /** The door as Home asks it, for the results. */
  name: string
  url: (asking: TheAsking) => string
  /** Its limit above. */
  runsWithinStatements: number
  /**
   * The outside rows, by id, that the door's one-place rule must read, with that rule beside them (decision
   * 7LNTYnmK_O1W). The case that the door hands the server no record outside the answer allows these and no other. A
   * door that names none allows none.
   */
  readsByItsRule?: readonly string[]
}

/** Today's plan, whose answer names the first of the seven days. */
const TODAYS_PLAN: ADoor = { name: "today's plan", url: () => '/api/planning/today', runsWithinStatements: TODAY_RUNS_WITHIN_STATEMENTS }

const DOORS: readonly ADoor[] = [
  { name: 'the projects', url: () => '/api/workspaces', runsWithinStatements: WORKSPACES_RUNS_WITHIN_STATEMENTS },
  { name: 'the pipelines standing still', url: () => '/api/pipelines/standing-still', runsWithinStatements: STANDING_STILL_RUNS_WITHIN_STATEMENTS },
  { name: 'the layout', url: () => '/api/home-layout', runsWithinStatements: HOME_LAYOUT_RUNS_WITHIN_STATEMENTS },
  { name: 'the key items', url: () => '/api/key-items?projects=every', runsWithinStatements: KEY_ITEMS_RUNS_WITHIN_STATEMENTS },
  { name: 'the checklists', url: (asking) => asking.checklists, runsWithinStatements: CHECKLISTS_RUNS_WITHIN_STATEMENTS },
  { name: 'the decisions figure', url: () => `/api/figures/my-decisions?${projectsQuery(EVERY_PROJECT)}`, runsWithinStatements: MY_DECISIONS_RUNS_WITHIN_STATEMENTS },
  { name: "the other projects' attention", url: () => '/api/attention?machine=omit&shape=other-projects', runsWithinStatements: OTHER_PROJECTS_RUNS_WITHIN_STATEMENTS },
  { name: 'the roster', url: () => '/api/working?shape=home', runsWithinStatements: ROSTER_RUNS_WITHIN_STATEMENTS },
  TODAYS_PLAN,
  { name: "the first day's plan", url: (asking) => `/api/planning/day/${asking.today}`, runsWithinStatements: DAY_RUNS_WITHIN_STATEMENTS },
  {
    name: 'the backlog progress', url: () => '/api/backlog/progress', runsWithinStatements: PROGRESS_RUNS_WITHIN_STATEMENTS,
    // The two packaged tasks, inside packages of this project. The progress counts each by its state, which
    // packageStateOf works out from the task's own lists (src/shared/delegation.ts:175-203), so the server reads each
    // task (decision 7LNTYnmK_O1W).
    readsByItsRule: ['outside-waiting-brief', 'outside-done-brief'],
  },
  {
    name: 'the people and packages', url: () => `/api/projects/${encodeURIComponent(theProject)}/people-and-packages`,
    runsWithinStatements: PEOPLE_RUNS_WITHIN_STATEMENTS,
    // The two packaged tasks, inside packages of this project. The door counts each package of each line by its state,
    // which thePackagesCounted reads by packageStateOf from the task's own lists (src/server/lib/delegation.ts and
    // src/shared/delegation.ts), so the server reads each task (as decided). The door also reads the runs that
    // theRunsActingNow chooses within idleReminderHours() (src/server/lib/project-board.ts), and the agent each one
    // serves. No outside run is chosen, because no request names one. The newest build runs serve the agents last by
    // id (tests/the-office-at-the-live-scale.ts, longTailRuns), and the retired agent records are the first two
    // agents' by id, so no acting run's agent reads them.
    readsByItsRule: ['outside-waiting-brief', 'outside-done-brief'],
  },
  { name: "the office's pause", url: () => '/api/office/pause', runsWithinStatements: PAUSE_RUNS_WITHIN_STATEMENTS },
  {
    name: 'the residents', url: () => '/api/residents', runsWithinStatements: RESIDENTS_RUNS_WITHIN_STATEMENTS,
    // The settled residency proposal and the decision that settles it. Whether a proposal is open is worked out on every
    // read from the decisions linked to settle it and the decisions that replace those (proposalResolution in
    // src/server/lib/records/fork-settled.ts:107-130, readTheReplacements in src/server/lib/replaced-decisions.ts:119-127),
    // so the server reads both (decision 7LNTYnmK_O1W). And the record of the proposal's agent: for each proposal,
    // readParticipant reads the agent's runtime from the agent's newest record, found by the agent's id, wherever that
    // record is, because an agent belongs to the office and not to one project
    // (src/server/db/the-model-on-the-agent-record.ts:65-71). It is one row for each proposal (decision 7LNTYnmK_O1W,
    // widened in message zsRUeGl2Scdq).
    readsByItsRule: ['outside-settled-proposal', 'outside-settling-decision', 'outside-retired-agent-a'],
  },
  { name: "a Needs you row's record", url: (asking) => `/api/records/${encodeURIComponent(asking.needsYou)}`, runsWithinStatements: RECORD_RUNS_WITHIN_STATEMENTS },
]

let t: TestDb
let app: FastifyInstance
/** What each door's address is made from, once the office and Home's own read have answered. */
let asking: TheAsking
/** The project a browser that has never chosen one opens on, which every door is asked under. */
let theProject = ''
let asPerson: Record<string, string> = {}
/** The rows outside the answer, written into the project the page opens on. */
let outside: AnOutsideRow[] = []
/** What each warm ask's statements hand the server, counted from before the app is made. */
let handed: ReturnType<typeof theRowsAReadHandsTheServer>

/** A statement's own method, as the statements' prototype holds it. */
type AStatementMethod = (this: { source: string }, ...params: unknown[]) => unknown
/** The statements' prototype, once its methods are wrapped, and the methods as they were, put back after the file. */
let statements: Record<string, AStatementMethod> | null = null
const theMethodsAsTheyWere = new Map<string, AStatementMethod>()
/** The statements run whose text the pattern matches, counted while this is set. */
let readsOfRecords: { pattern: RegExp; count: number } | null = null
/** A statement reads the records table when it names it after `from` or `join`. agent_records is another table. */
const READS_RECORDS = /\b(?:from|join)\s+["`]?records["`]?(?!\w)/i
/** A statement reads the records table directly when it names it after `from`. One that names it only after `join` does not. */
const READS_RECORDS_DIRECTLY = /\bfrom\s+["`]?records["`]?(?!\w)/i

interface AnAsk { holdMs: number; statements: number; bytes: number; ms: number }

/** What each door's asks found, by its name. */
const found = new Map<string, { asks: AnAsk[]; overTheLimit: { ask: number; ms: number } | null; outsideIds: string[]; rows: number; reply: string }>()

/** The bytes this thread has read from files so far, as the kernel counts them; the database's pages are read on it. */
function theBytesReadSoFar(): number {
  const counted = /^rchar: (\d+)$/mu.exec(readFileSync('/proc/thread-self/io', 'utf8'))
  if (counted === null) throw new Error('/proc/thread-self/io says no rchar, so the bytes an ask reads cannot be counted.')
  return Number(counted[1])
}

/** One ask as the person: how long it took, how long it kept this thread, its statements and the bytes it read. */
async function oneAsk(url: string): Promise<AnAsk & { status: number; body: string }> {
  const held = monitorEventLoopDelay({ resolution: 1 })
  held.enable()
  const before = theBytesReadSoFar()
  const started = performance.now()
  const reply = await app.inject({ method: 'GET', url, headers: asPerson })
  const ms = performance.now() - started
  const bytes = theBytesReadSoFar() - before
  // The monitor records a kept thread only at its next timer turn, so one is let in before it is read.
  await new Promise((resolve) => setTimeout(resolve, 3))
  held.disable()
  const counted = /desc="(\d+) statements"/.exec(String(reply.headers['server-timing']))
  return { holdMs: held.max / 1e6, statements: counted === null ? Number.NaN : Number(counted[1]), bytes, ms, status: reply.statusCode, body: reply.body }
}

/** The warm ask, with the outside rows its statements hand the server, by id, and how many rows they hand it. */
async function theWarmAsk(url: string): Promise<{ status: number; body: string; outsideIds: string[]; rows: number }> {
  handed.start()
  let reply
  let counted = { outsideIds: [] as string[], rows: 0 }
  try {
    reply = await app.inject({ method: 'GET', url, headers: asPerson })
  } finally {
    counted = handed.stop()
  }
  return { status: reply.statusCode, body: reply.body, outsideIds: counted.outsideIds, rows: counted.rows }
}

/** How many statements one ask of `url` as the person runs that read the records table, as `pattern` tells them. */
async function theStatementsThatReadRecords(url: string, pattern: RegExp = READS_RECORDS): Promise<number> {
  readsOfRecords = { pattern, count: 0 }
  let reply
  let counted = 0
  try {
    reply = await app.inject({ method: 'GET', url, headers: asPerson })
  } finally {
    counted = readsOfRecords?.count ?? 0
    readsOfRecords = null
  }
  expect(reply.statusCode, `${url}: ${reply.body.slice(0, 400)}`).toBe(200)
  return counted
}

/** A warm ask of `url`, then five asks, stopping at the first over the second. Returns the warm ask's body. */
async function askTheDoor(door: ADoor, asking: TheAsking): Promise<string> {
  const url = door.url(asking)
  const warm = await theWarmAsk(url)
  expect(warm.status, `${door.name}, ${url}: ${warm.body.slice(0, 400)}`).toBe(200)
  const asks: AnAsk[] = []
  let overTheLimit: { ask: number; ms: number } | null = null
  for (let i = 0; i < 5; i++) {
    const one = await oneAsk(url)
    expect(one.status, `${door.name}, ${url}: ${one.body.slice(0, 400)}`).toBe(200)
    asks.push({ holdMs: one.holdMs, statements: one.statements, bytes: one.bytes, ms: one.ms })
    if (one.ms >= ANSWERS_WITHIN_MS) {
      overTheLimit = { ask: i + 1, ms: one.ms }
      break
    }
  }
  found.set(door.name, { asks, overTheLimit, outsideIds: warm.outsideIds, rows: warm.rows, reply: warm.body })
  return warm.body
}

/**
 * THE ROWS OUTSIDE THE ANSWER, written into `project` in the build's forms (tests/the-office-at-the-live-scale.ts:591-593
 * and :1001-1004), each in the shape its reader reads. Each title is its row's marker alone. A step's title so holds no
 * pipeline's marker, and the reader takes it as the step's whole name (src/shared/blocks.ts:128-131).
 */
async function theRowsOutsideTheAnswer(sqlite: TestDb['client']['sqlite'], project: string): Promise<AnOutsideRow[]> {
  const { BLOCK_KIND } = await import('../src/shared/blocks.ts')
  const { KEY_ITEM_KIND } = await import('../src/shared/key-items.ts')
  const { CHECKLIST_KIND } = await import('../src/shared/checklists.ts')
  const { BACKLOG_ITEM_KIND } = await import('../src/shared/backlog.ts')
  const { DECISION_KIND } = await import('../src/shared/decision-kind.ts')
  const { RESOLVES_PROPOSAL } = await import('../src/shared/types.ts')
  const { RESIDENCY_EXTRA_KEY } = await import('../src/shared/residents.ts')
  const { AGENT_KIND } = await import('../src/server/lib/inbox.ts')
  const { PROPOSAL_KIND, TASK_KIND } = await import('../src/server/lib/records/fork-settled.ts')
  const { HOME_ALARMS_SHOWN } = await import('../src/shared/attention-first-page.ts')
  const at = '2026-09-01 09:00:00'
  const addRecord = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, ?, 'owner', ?, ?, ?, ?, null, ?, null, 'fixture')`,
  )
  const rows: AnOutsideRow[] = []
  const add = (name: string, kind: string, state: string, data: unknown, when = at): string => {
    const one = { id: `outside-${name}`, kind, state, marker: `${OUTSIDE_MARKS}${name}` }
    addRecord.run(one.id, project, when, when, kind, one.marker, JSON.stringify(data))
    rows.push(one)
    return one.id
  }
  // TWO AGENTS OF THE BUILD, each with a record. The first owns the checklist and is the residency proposal's agent.
  const agents = sqlite
    .prepare(`select distinct a.id, a.handle from agents a join agent_records m on m.agent_id = a.id order by a.id limit 2`)
    .all() as { id: string; handle: string }[]
  const [owner] = agents
  if (owner === undefined || agents.length < 2) throw new Error('The build mapped fewer than two agents to a record, so the outside rows cannot name two build agents.')
  const aPause = { since: at, why: 'made up for this file' }

  // A STEP, done, unfinished or paused: Home draws none, and only counts a still pipeline's unfinished steps, in the
  // sentence `homeWords.pipelineStill`.
  const moving = [add('moving-done-step', BLOCK_KIND, 'done', { state: 'done' }), add('moving-open-step', BLOCK_KIND, 'unfinished, not paused', { state: 'doing' })]
  const finished = [add('finished-first-step', BLOCK_KIND, 'done', { state: 'done' }), add('finished-second-step', BLOCK_KIND, 'done', { state: 'done' })]
  const still = [add('still-done-step', BLOCK_KIND, 'done', { state: 'done' }), add('still-paused-step', BLOCK_KIND, 'paused', { state: 'doing', paused: aPause })]
  // A MOVING OR A FINISHED PIPELINE: Late or stuck draws only one that stands still.
  add('moving-pipeline', 'pipeline', 'moving', { blockIds: moving })
  add('finished-pipeline', 'pipeline', 'finished', { blockIds: finished })
  // THE PIPELINES THAT STAND STILL, as many as Late or stuck draws rows (HOME_ALARMS_SHOWN, its LATE_SHOWN in
  // src/web/components/home/HomeSections.tsx), are inside: it draws each one's title. They share the still steps.
  for (let i = 0; i < HOME_ALARMS_SHOWN; i++) {
    addRecord.run(i === 0 ? 'inside-still-pipeline' : `inside-still-pipeline-${String(i + 1)}`, project, at, at, 'pipeline', 'A pipeline that stands still', JSON.stringify({ blockIds: still }))
  }
  // A STILL PIPELINE PAST THE ROWS LATE OR STUCK DRAWS, older than every one above, so last in the records list's
  // order: Home only counts it, in the section's one number.
  add('past-the-shown-pipeline', 'pipeline', 'standing still, past the rows drawn', { blockIds: still }, '2026-08-31 09:00:00')
  // A CLOSED KEY ITEM: Home draws each open one (src/web/components/home/HomeKeyItems.tsx:64-67).
  add('closed-key-item', KEY_ITEM_KIND, 'closed', { state: 'closed' })
  // A BUILD AGENT'S CHECKLIST: Home counts the person's own alone (src/web/components/home/HomeFigures.tsx:30).
  add('agents-checklist', CHECKLIST_KIND, "a build agent's", { owner: { kind: 'agent', id: owner.id }, items: [{ id: 'i-1', words: 'made up for this file', state: 'open' }] })
  // A RETIRED AGENT, a build agent's second record as the build files one
  // (tests/the-office-at-the-live-scale.ts:647-650).
  // The roster draws active agents alone (src/server/lib/working.ts reads only agents whose state is active;
  // src/web/components/home/HomeAgentBars.tsx:87).
  const mapRecord = sqlite.prepare(`insert into agent_records (record_id, agent_id) values (?, ?)`)
  const retired = agents.map((agent, i) => add(`retired-agent-${'ab'[i]!}`, AGENT_KIND, 'retired', { handle: agent.handle, state: 'retired' }))
  agents.forEach((agent, i) => mapRecord.run(retired[i]!, agent.id))
  // AN OPEN RUN OF EACH RETIRED AGENT: the roster draws no run of an agent that is not active (decision srwXywF1oYIs).
  // The second run's entry for this project is its second, so the open runs read finds it only by the half of
  // `theRunsThatCouldNameAnAgent` in src/server/lib/attachments.ts that holds a list of more than one entry.
  add('retired-agents-run', 'session', 'open, its one entry naming a retired agent', { ranAs: [{ workspaceId: project, agentId: retired[0] }] })
  add('retired-agents-second-entry-run', 'session', 'open, its second entry naming a retired agent', {
    ranAs: [{ workspaceId: 'made-up-other-project' }, { workspaceId: project, agentId: retired[1] }],
  })
  // A BACKLOG POINT, to do or done: Home only counts points (src/web/components/ProgressCard.tsx:64-69).
  add('todo-point', BACKLOG_ITEM_KIND, 'todo', { state: 'todo' })
  add('done-point', BACKLOG_ITEM_KIND, 'done', { state: 'done' })
  // A PACKAGED TASK, to do or done: Home only counts them (src/web/components/ProgressCard.tsx:64-69). Its bundle and
  // parent name no record, as the count reads only the state (src/server/lib/delegation.ts:584-607).
  const by = { actorType: 'human', actorId: THE_PERSON }
  const aPackage = {
    bundleId: 'no-bundle', forTheOutside: 'made up for this file', acceptance: 'made up for this file', at, by,
    parent: { kind: 'task', id: 'no-parent' }, lines: ['made-up'], pointIds: ['outside-todo-point'],
  }
  add('waiting-brief', TASK_KIND, 'to do', { package: aPackage })
  add('done-brief', TASK_KIND, 'done', { package: aPackage, completed: { at, by } })
  // A SETTLED RESIDENCY PROPOSAL: Home draws the open ones (src/web/components/ResidentProposals.tsx:92).
  const facts = { measuredAt: at, citizenSince: null, daysSinceCitizen: null, daysWithARun: 0, runs: 0, recordsWritten: 0, retired: false, homeWorld: null }
  const proposal = add('settled-proposal', PROPOSAL_KIND, 'settled', { extra: { [RESIDENCY_EXTRA_KEY]: { agentId: owner.id, facts } } })
  // THE DECISION THAT SETTLES IT: Home draws only the open proposals (src/web/components/ResidentProposals.tsx:92).
  const decision = add('settling-decision', DECISION_KIND, 'settling a proposal', {})
  sqlite.prepare(
    `insert into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
     values (?, ?, 'owner', ?, ?, ?, 0, 'made-up', 'agent', ?, ?)`,
  ).run('outside-settles', project, decision, proposal, RESOLVES_PROPOSAL, at, at)
  return rows
}

/** An outside row by its id, kind and state, for a failure. */
function named(id: string): string {
  const row = outside.find((one) => one.id === id)
  return row === undefined ? id : `${id}: ${row.kind}, ${row.state}`
}

/**
 * The outside rows a reply carries: an object whose `id` is an outside row's, and a text that holds a marker. A list
 * of ids inside a record is not counted.
 */
function theOutsideRowsIn(reply: unknown): string[] {
  const ids = new Set(outside.map((one) => one.id))
  const carried = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.includes(OUTSIDE_MARKS)) for (const one of outside) if (value.includes(one.marker)) carried.add(one.id)
      return
    }
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const one of value) walk(one)
      return
    }
    const id = (value as Record<string, unknown>)['id']
    if (typeof id === 'string' && ids.has(id)) carried.add(id)
    for (const one of Object.values(value)) walk(one)
  }
  walk(reply)
  return [...carried].sort()
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  t = await freshDb()
  // HOME'S OWN CHECKLIST ADDRESS, read from its own read with the window closed, which is the module's state at its
  // start: one call, with fetch replaced for that call alone and put back at once in a finally.
  const { readMyChecklistsOnce } = await import('../src/web/lib/my-checklists.ts')
  const askedAt: string[] = []
  const fetchAsItWas = globalThis.fetch
  try {
    globalThis.fetch = (async (address: string | URL | Request) => {
      askedAt.push(String(address))
      const nothing: ChecklistsAcrossReply = { projects: [], checklists: [], says: 'No checklists.' }
      return new Response(JSON.stringify(nothing), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    await readMyChecklistsOnce()
  } finally {
    globalThis.fetch = fetchAsItWas
  }
  if (askedAt.length !== 1) throw new Error(`Home's checklist read asked ${String(askedAt.length)} addresses, and this file needs the one it asks.`)
  const askedAddress = new URL(askedAt[0]!, 'http://localhost')
  if (askedAddress.pathname !== '/api/checklists') {
    throw new Error(`Home's checklist read asked ${askedAddress.pathname}, and this file times its checklists door.`)
  }
  const checklists = `${askedAddress.pathname}${askedAddress.search}`
  const sqlite = t.client.sqlite
  buildTheOfficeAtAScale(sqlite, THE_TEST_OFFICES_OWNER.id, THE_LIVE_OFFICE_ON_13_NOVEMBER, new Date())
  const { aWaitingRowIsARecord } = await import('../src/web/lib/waiting.ts')
  const stated = (await import('../src/shared/workspaces.ts')).DEFAULT_WORKSPACE
  outside = await theRowsOutsideTheAnswer(sqlite, stated)
  // THE STATEMENTS THAT READ RECORDS are counted on the statements' prototype, as
  // tests/a-progress-read-reads-live-claims-once.test.ts counts its claim reads. This goes in before the helper below,
  // which copies a statement's all, get and iterate when the statement is made, so a later wrap would not be reached.
  // Each wrap hands back what the method answers, and reads only the statement's text.
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, AStatementMethod>
  statements = prototype
  for (const method of ['all', 'get', 'iterate']) {
    const call = prototype[method]!
    theMethodsAsTheyWere.set(method, call)
    prototype[method] = function (...params: unknown[]) {
      if (readsOfRecords !== null && readsOfRecords.pattern.test(this.source)) readsOfRecords.count += 1
      return call.apply(this, params)
    }
  }
  // Installed before the app is made, so a statement prepared after this is counted, kept or not.
  handed = theRowsAReadHandsTheServer(t, new Map(outside.map((one) => [one.id, one.marker])))

  app = (await apiApp()).app
  await app.ready()
  // THE PROJECT THE PAGE OPENS ON. The list is asked under the default project, as a browser with nothing kept asks it,
  // and the listed project holding the most records is taken, ties by id. When the fullest holds none, the page stays
  // on the default. Asked once, to find the project, and not timed.
  const asThePersonIn = (project: string): Record<string, string> => ({ 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON })
  const listed = await app.inject({ method: 'GET', url: '/api/workspaces', headers: asThePersonIn(stated) })
  expect(listed.statusCode, listed.body.slice(0, 400)).toBe(200)
  const fullest = [...(listed.json() as WorkspacesReply).workspaces].sort((a, b) => b.records - a.records || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]
  theProject = fullest === undefined || fullest.records === 0 ? stated : fullest.id
  if (theProject !== stated) throw new Error(`The page opens on ${theProject}, and the rows outside the answer are in ${stated}, so no door here asks for them.`)
  asPerson = asThePersonIn(theProject)
  // THE NEEDS YOU ROW, from the frame's read Home draws it from. It is asked once, to find the record, and not timed.
  const waiting = await app.inject({ method: 'GET', url: '/api/waiting', headers: asPerson })
  expect(waiting.statusCode, waiting.body.slice(0, 400)).toBe(200)
  const row = (waiting.json() as { items: WaitingItem[] }).items.find((one) => aWaitingRowIsARecord(one) && one.workspaceId === theProject)
  if (row === undefined) throw new Error(`GET /api/waiting names no record of ${theProject} on this office, so the record a Needs you row reads cannot be asked.`)
  asking = { today: '', needsYou: row.id, checklists }
  for (const door of DOORS) {
    const body = await askTheDoor(door, asking)
    if (door === TODAYS_PLAN) asking.today = (JSON.parse(body) as { day: string }).day
  }
}, 1_800_000)

afterAll(async () => {
  if (statements !== null) for (const [method, call] of theMethodsAsTheyWere) statements[method] = call
  await app?.close()
  t?.close()
})

/** The median of the asks made. */
function median(asks: readonly AnAsk[], of: (one: AnAsk) => number): number {
  return [...asks.map(of)].sort((a, b) => a - b)[Math.floor(asks.length / 2)]!
}

function said(what: string): void {
  console.log(what)
  if (OUT !== '') appendFileSync(`${OUT}.home-reads.log`, `${what}\n`)
}

describe("Home's first view at the live office size", () => {
  it('holds each outside row as a live record of its kind in the project the page opens on, and no other title with a marker', () => {
    const ids = JSON.stringify(outside.map((one) => one.id))
    const held = t.client.sqlite
      .prepare(`select id, kind, workspace_id as project, title from records where id in (select value from json_each(?)) and deleted_at is null order by id`)
      .all(ids)
    const written = outside.map((one) => ({ id: one.id, kind: one.kind, project: theProject, title: one.marker })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    expect(held, 'the outside rows, as the records table holds them').toEqual(written)
    const others = t.client.sqlite.prepare(`select id from records where instr(title, ?) > 0 and id not in (select value from json_each(?)) order by id`).all(OUTSIDE_MARKS, ids)
    expect(others, 'the other records whose title holds a marker').toEqual([])
  })

  it('the checklists door runs as many statements that read records for every project as for the one project the page opens on', async () => {
    const oneProject = new URL(asking.checklists, 'http://localhost')
    oneProject.searchParams.set(PROJECTS_QUERY, theProject)
    const every = await theStatementsThatReadRecords(asking.checklists)
    const one = await theStatementsThatReadRecords(`${oneProject.pathname}${oneProject.search}`)
    said(`[home timing] the checklists statements that read records: ${String(every)} for every project, ${String(one)} for ${theProject}`)
    expect(every, `the statements that read records for every project, against ${String(one)} for ${theProject}`).toBe(one)
  })

  it('the residents door runs as many statements that read records directly with two live residency proposals as with one', async () => {
    const one = await theStatementsThatReadRecords('/api/residents', READS_RECORDS_DIRECTLY)
    // THE SECOND PROPOSAL is a copy of the settled one under its own id, with no link that settles it, so it is live and
    // open. Its title holds no marker.
    const sqlite = t.client.sqlite
    sqlite.prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       select 'a-second-residency-proposal', workspace_id, owner_id, created_at, updated_at, kind, 'A second residency proposal', null, data, null, origin
       from records where id = 'outside-settled-proposal'`,
    ).run()
    let two = 0
    try {
      two = await theStatementsThatReadRecords('/api/residents', READS_RECORDS_DIRECTLY)
    } finally {
      sqlite.prepare(`delete from records where id = 'a-second-residency-proposal'`).run()
    }
    said(`[home timing] the residents statements that read records directly: ${String(two)} with two live residency proposals, ${String(one)} with one`)
    expect(two, `the statements that read records directly with two live residency proposals, against ${String(one)} with one`).toBe(one)
  })
})

for (const door of DOORS) {
  describe(`${door.name}, as Home asks it`, () => {
    const of = (): NonNullable<ReturnType<typeof found.get>> => {
      const held = found.get(door.name)
      if (held === undefined) throw new Error(`${door.name} was not asked.`)
      return held
    }

    it(`answers in less than ${String(ANSWERS_WITHIN_MS)} ms`, () => {
      const { asks, overTheLimit } = of()
      said(`[home timing] ${door.name} answered: ${asks.map((one) => one.ms.toFixed(1)).join(', ')} ms; held the thread ${asks.map((one) => one.holdMs.toFixed(1)).join(', ')} ms`)
      expect(overTheLimit, `ask ${String(overTheLimit?.ask)} took ${String(overTheLimit?.ms.toFixed(1))} ms, and the asking stopped there`).toBeNull()
      expect(median(asks, (one) => one.ms), 'the median time one ask took to answer').toBeLessThan(ANSWERS_WITHIN_MS)
    })

    it(`runs fewer than ${String(door.runsWithinStatements)} statements in one ask`, () => {
      const { asks } = of()
      const statements = median(asks, (one) => one.statements)
      said(`[home timing] ${door.name} statements: median ${String(statements)} of ${asks.map((one) => String(one.statements)).join(', ')}`)
      expect(statements, "the median of the statements one ask's Server-Timing header counts").toBeLessThan(door.runsWithinStatements)
    })

    it(`reads fewer than ${String(READS_WITHIN_BYTES / 2 ** 20)} MB from the database's files in one ask`, () => {
      const { asks } = of()
      const bytes = median(asks, (one) => one.bytes)
      said(`[home timing] ${door.name} bytes read: median ${String(bytes)} of ${asks.map((one) => String(one.bytes)).join(', ')}`)
      expect(bytes, 'the median of the bytes one ask read').toBeLessThan(READS_WITHIN_BYTES)
    })

    it('hands the server no record outside the answer Home draws', () => {
      const { outsideIds, rows } = of()
      const allowed = door.readsByItsRule ?? []
      const others = outsideIds.filter((id) => !allowed.includes(id))
      said(`[home timing] ${door.name} rows handed the server on the warm ask: ${String(rows)}`)
      expect(others, `the outside rows the warm ask's statements handed the server, past those its rule reads (${allowed.join(', ') || 'none'}): ${others.map(named).join('; ')}`).toEqual([])
    })

    it('answers with no record outside the answer Home draws', () => {
      const carried = theOutsideRowsIn(JSON.parse(of().reply))
      expect(carried, `the outside rows the warm ask's reply carries: ${carried.map(named).join('; ')}`).toEqual([])
    })
  })
}
