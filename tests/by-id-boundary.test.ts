// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old route inventory predates lease IDs. The three holder-only lease mutations are now explicitly classified as workspace-scoped resource-ledger IDs, retaining exhaustive router coverage. */
/**
 * EVERY ROUTE WITH AN ID IN ITS PATH ANSWERS ABOUT ONE PROJECT — walked, not listed by hand.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ONE TEST THAT WALKS THE ROUTES AND NOT ONE TEST PER ROUTE
 * ---------------------------------------------------------------------------------------
 *
 * A record id is unique across the whole database, so an id on its own reaches into any project.
 * `recordInWorkspace` in lib/records.ts is the one function that turns an id into "the record with
 * this id IN THIS PROJECT", and several routes computed the workspace and then never used it.
 *
 * MEASURED ON THE RUNNING SERVER before the repair: `GET /api/records/<a panelx record>` sent with
 * `x-mole-office-workspace: robotics` answered 404 and named the project the record was really in, and
 * `DELETE` on the SAME id with the SAME header answered 200 and really deleted it — its own reply
 * carrying `"workspaceId":"panelx"` while the request had said robotics. One route said "that id is
 * not yours" and the one beside it acted on it.
 *
 * A test per route would have been satisfied by fixing the routes one at a time, and it would say
 * nothing about the route somebody adds next year. So this READS THE ROUTER — `listApiRoutes()`,
 * the same list `GET /api` is built from — takes every route with a parameter in its path, and
 * requires each one to be in exactly one of the two tables below:
 *
 *   `REFUSES`        exercised: the same request is sent with an id from another project, and the
 *                    route has to answer 404 and write nothing.
 *   `NOT A RECORD`   listed on purpose, each with the reason beside it: the parameter is not a
 *                    record id, or the route reads across projects because the product decided it
 *                    should.
 *
 * A route in neither table FAILS THIS FILE, with its name printed. That is the point: a new by-id
 * route is covered by a test nobody has to remember to write, and leaving one unscoped has to be a
 * decision somebody wrote down rather than a line nobody noticed.
 *
 * ---------------------------------------------------------------------------------------
 * EACH PROBE ASKS THREE THINGS, AND THE THIRD IS WHY THE FIRST TWO MEAN ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE REFUSAL. The request, working in `panelx`, naming a `robotics` id: 404.
 * 2. NOTHING WAS WRITTEN. Every table's row count and every record row, before and after. This is
 *    the half the measured defect failed: the delete answered 404-worthy and deleted the record.
 * 3. THE CONTROL. The same request, working in `robotics`, must NOT be 404. Without it a route that
 *    404s everything — a typo in the URL, a fixture that never got made — would pass step 1 while
 *    proving nothing. What the control answers otherwise does not matter here: 200, 201, 400 and
 *    409 all mean the route found the record and got on with its own business.
 */

import { randomBytes } from 'node:crypto'
import { PRIVATE_LOGIN_ROUTES } from '../src/shared/private-sandbox-login.ts'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'
import type { VerifiedNativeAdapter } from '../src/holder/private-sandbox-login.mjs'

/** Where every probe below says it is working. */
const PANELX = 'panelx'
/** Where every record below really is. */
const ROBOTICS = 'robotics'

/** A stated human, so a probe is never refused for being an agent before the project is looked at. */
const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

const inWorkspace = (id: string): Record<string, string> => ({ ...HUMAN, 'x-mole-office-workspace': id })
const officeKey = randomBytes(32).toString('hex')
let workerIdentity: { type: string; id: string }
const probeHeaders = (id: string, worker: boolean | undefined): Record<string, string> => worker ? {
  'x-mole-office-workspace': id, 'x-mole-office-actor-type': workerIdentity.type, 'x-mole-office-actor-id': workerIdentity.id, 'x-mole-office-key': officeKey,
} : inWorkspace(id)

/** The robotics records every probe is aimed at. */
interface Fixture {
  module: string
  pipeline: string
  block: string
  obligation: string
  proposal: string
  note: string
  /** A flow in the robotics project, which the Flows page's doors are aimed at (wave 13p round 33). */
  flow: string
  session: string
  link: string
  /** A conversation with an agent about robotics work, and one comment waiting in it. */
  thread: string
  message: string
  /** A message in the robotics pool, addressed to the owner. Not the comment above: that is a row of a conversation. */
  pooled: string
  /** A reading of somebody else's folder, filed in the robotics project, and one piece of it. */
  folderReading: string
  folderReadingPiece: string
  /** A review of robotics work, and one remark filed in that project. */
  review: string
  annotation: string
  /** A work domain in the robotics project, with the durable agent and the run that filed it. */
  workDomain: string
  /** The durable agent in the robotics project, which the lifecycle probes are aimed at. */
  agent: string
  /** A run of that agent, filed in robotics: its newest, so the five agent terminal doors answer about it. */
  agentsRun: string
  /** A group in the robotics project, with the owner and that agent in it. */
  group: string
  /** A work claim in the robotics project, filed by that agent for that project's session. */
  claim: string
  /** A rung the robotics agent asked its starter for, filed in the robotics project. Criterion P65. */
  roleRequest: string
  /** A robotics run carrying a conversation copy with no words, which the two conversation doors are aimed at. */
  conversedRun: string
}

interface Probe {
  /** `METHOD /api/path/:pattern`, exactly as the router holds it. Checked against the router. */
  route: string
  /** What is being reached for, in one line. */
  what: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  url: (f: Fixture) => string
  payload?: (f: Fixture) => Record<string, unknown>
  asWorker?: boolean
}

// ============================================================================ the exercised routes

const REFUSES: Probe[] = [
  // THE MESSAGE POOL. Both read the message through `readMessage`, which refuses one filed in
  // another project by name rather than answering about it.
  // THE TWO INCIDENT DOORS, criteria I3 and I4's own shape. Both read the incident through
  // `recordInWorkspace`, which refuses one filed in another project by name, and both WRITE: an
  // appended moment lands on the incident's timeline and a closing writes its state, so answering
  // about somebody else's project would write into an incident nobody here can see.
  {
    route: 'POST /api/records/:id/timeline',
    what: 'one incident, one moment appended',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/timeline`,
    payload: () => ({ at: 'now', who: 'the boundary', what: 'A moment from across the project line.', evidence: 'ev-placeholder' }),
  },
  {
    route: 'POST /api/records/:id/close-incident',
    what: 'one incident, closed with one line',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/close-incident`,
    payload: () => ({ note: 'Done from across the project line.' }),
  },
  // THE THREE GROUP ROUTES ARE NOT HERE ANY MORE. They are in `NOT_A_RECORD_BY_ID` below, with
  // the decision that moved them.
  {
    route: 'GET /api/claims/on/:recordId',
    what: 'who is working on one record',
    method: 'GET',
    url: (f) => `/api/claims/on/${f.module}`,
  },
  // THE PRESS THAT LETS A RUN START FOR ONE MESSAGE. Criterion M78. It reads the message through
  // `readMessage`, which refuses one filed in another project by name, and it WRITES: it puts the owner's
  // press on the message and says so on the delivery row, so answering about somebody else's
  // project would start a run nobody in this project can see.
  // WORK CLAIMS. Both read the claim through `theClaimOrARefusal`, which refuses one filed in
  // another project by name rather than answering about it. Both write: a renewal stamps the row and
  // a release ends it, so answering about somebody else's project would change a claim nobody in
  // this project can see.
  {
    route: 'POST /api/claims/:id/renew',
    what: 'saying the run is still working on it',
    method: 'POST',
    url: (f) => `/api/claims/${f.claim}/renew`,
  },
  {
    route: 'POST /api/claims/:id/release',
    what: 'saying you have finished with a claim',
    method: 'POST',
    url: (f) => `/api/claims/${f.claim}/release`,
    payload: () => ({ because: 'A probe from another project.' }),
  },
  // THE MESSAGE WORKER'S FIVE. Four name a message by its record id and read it through the same
  // `readMessage`, so a message filed in another project is refused by name rather than answered
  // about. That matters more here than on the routes above: these move a delivery mark and file a
  // reply, so answering about somebody else's project would write into it. The fifth names a RUN by
  // its session record id and is refused the same way, because the runs it looks through are read
  // one project at a time.
  {
    route: 'POST /api/worker/waits/:session/over',
    what: 'saying a run waited for the next message and none came',
    method: 'POST',
    url: (f) => `/api/worker/waits/${f.session}/over`,
    payload: () => ({}),
  },
  // A RESOLVING MERGE ENTRY, named by its record id. The door reads it with `theMergeEntry`, which is
  // `recordInWorkspace` first, so an entry filed in another project is refused by name rather than answered
  // about. It WRITES: the bounce goes on the entry and a notice to whoever is told, so answering about
  // somebody else's project would end an entry nobody here can see.
  { route: 'POST /api/worker/merges/hand-backs/:problem/a-person-must-look', what: 'acting on a hand-back problem', method: 'POST', url: (f) => `/api/worker/merges/hand-backs/${f.session}/a-person-must-look`, payload: () => ({}) },
  { route: 'POST /api/worker/merges/hand-backs/:problem/take-back', what: 'acting on a hand-back problem', method: 'POST', url: (f) => `/api/worker/merges/hand-backs/${f.session}/take-back`, payload: () => ({}) },
  { route: 'POST /api/worker/merges/hand-backs/:problem/fixed-on-main', what: 'acting on a hand-back problem', method: 'POST', url: (f) => `/api/worker/merges/hand-backs/${f.session}/fixed-on-main`, payload: () => ({}) },
  {
    route: 'POST /api/worker/merges/:entry/hour-over',
    what: "saying a resolving merge entry's hour is over",
    method: 'POST',
    url: (f) => `/api/worker/merges/${f.session}/hour-over`,
    payload: () => ({}),
  },
  // THE INTERRUPTED RUNS' TWO, criterion W7. Each names a run by its session record id and reads it
  // with `recordInWorkspace`, so a run filed in another project is refused by name before the person's
  // ask or the worker's answer is written.
  {
    route: 'POST /api/office/interrupted-runs/:session/resume',
    what: "the person's press to resume an interrupted run",
    method: 'POST',
    url: (f) => `/api/office/interrupted-runs/${f.session}/resume`,
    payload: () => ({}),
  },
  {
    route: 'POST /api/worker/runs/:session/resumed',
    what: 'the worker saying what became of an asked resume',
    method: 'POST',
    url: (f) => `/api/worker/runs/${f.session}/resumed`,
    payload: () => ({ failed: 'A probe from another project.' }),
  },
  {
    route: 'POST /api/worker/runs/:session/cut-off',
    what: 'ending a run a restart cut off',
    method: 'POST',
    url: (f) => `/api/worker/runs/${f.session}/cut-off`,
    payload: () => ({}),
  },
  // THE STOP DOOR OF A RUN, wave 13s round 62, item 3, src/server/api/runtime.ts. It reads the run with `getRecord` and
  // refuses one filed in another project with 404 before it asks who the caller is, so nothing is revoked or signalled.
  // The control, in the run's own project, is refused 403 because a stated human is not an agent proved by its key.
  {
    route: 'POST /api/runtime/runs/:id/stop',
    what: 'stopping a run through its own door',
    method: 'POST',
    url: (f) => `/api/runtime/runs/${f.session}/stop`,
    payload: () => ({ why: 'A probe from another project.' }),
  },
  {
    route: 'GET /api/runs/:run/process-ended',
    what: 'whether a run process has ended',
    method: 'GET',
    url: (f) => `/api/runs/${f.session}/process-ended`,
  },
  {
    route: 'POST /api/runs/:run/closed-after-its-end',
    what: 'closing a run after its command ended',
    method: 'POST',
    url: (f) => `/api/runs/${f.session}/closed-after-its-end`,
    payload: () => ({ why: 'A probe from another project.' }),
  },
  // THE NEXT ROUND'S TWO WORKER DOORS, wave 13j round loop-2, src/server/api/next-round.ts. Each names the run whose
  // next round is being started by its session record id, and reads it with `recordInWorkspace` BEFORE it asks
  // whether the caller is the message worker, so a run filed in another project is refused by name. The control
  // here is a person, so in the run's own project it is refused 403 for not being the worker: not 404.
  {
    route: 'POST /api/worker/rounds/:run/held',
    asWorker: true,
    what: "the message worker recording why a next round is held",
    method: 'POST',
    url: (f) => `/api/worker/rounds/${f.session}/held`,
    payload: () => ({ because: 'A made-up hold.' }),
  },
  {
    route: 'POST /api/worker/rounds/:run/starting',
    what: "the message worker saying it is starting a run's next round",
    method: 'POST',
    url: (f) => `/api/worker/rounds/${f.session}/starting`,
    payload: () => ({ wrapper: 'a-probe-from-another-project' }),
  },
  {
    route: 'POST /api/worker/rounds/:run/ended',
    what: "the message worker saying how a next round's launcher ended",
    method: 'POST',
    url: (f) => `/api/worker/rounds/${f.session}/ended`,
    payload: () => ({ wrapper: 'a-probe-from-another-project', ok: false, says: 'A probe from another project.' }),
  },
  // THE IMPLEMENTATION MAP'S ONE RECORD-BY-ID ROUTE. `GET /api/implementation/record/:id` answers
  // "what code is this record implemented by", and it reads the record with `getRecord` and then
  // refuses one from another project by name. The four other parameterised routes in that group
  // take a repository id or a relationship id and are in NOT_A_RECORD_BY_ID with their reasons.
  {
    route: 'GET /api/implementation/record/:id',
    what: 'what code a record is implemented by',
    method: 'GET',
    url: (f) => `/api/implementation/record/${f.module}`,
  },
  // The two composition routes, added with them (step 45). Both read their subject through
  // `recordInWorkspace`, so an id from another project is refused by name rather than answered
  // about a pipeline the caller cannot see.
  {
    route: 'GET /api/composition/:id',
    what: 'what a pipeline was made of',
    method: 'GET',
    url: (f) => `/api/composition/${f.pipeline}`,
  },
  {
    route: 'GET /api/composition/:id/change',
    what: 'what changed between two times',
    method: 'GET',
    url: (f) => `/api/composition/${f.pipeline}/change?from=2026-01-01 00:00:00`,
  },
  // The subject in the path is what this probe crosses the project boundary with. `other` is read
  // through the same `recordInWorkspace`, so both ends are held to the same rule.
  {
    route: 'GET /api/composition/:id/against',
    what: 'what is in one pipeline and not the other',
    method: 'GET',
    url: (f) => `/api/composition/${f.pipeline}/against?other=${f.pipeline}`,
  },
  // THE FOUR WORK DOMAIN ROUTES. Every one of them reads its subject through `recordInWorkspace`,
  // so an id from another project is refused by name rather than answered about a declared scope
  // the caller cannot see. That matters more here than on most reads: a work domain says what an
  // agent is about to change and where it collides with somebody else, and answering across a
  // project boundary would hand one project's collisions to another's agents.
  {
    route: 'GET /api/work-domains/:id',
    what: 'read one work domain and its scope diff',
    method: 'GET',
    url: (f) => `/api/work-domains/${f.workDomain}`,
  },
  {
    route: 'POST /api/work-domains/:id/resolve',
    what: 'resolve a declared scope against the file index',
    method: 'POST',
    url: (f) => `/api/work-domains/${f.workDomain}/resolve`,
    payload: () => ({}),
  },
  {
    route: 'POST /api/work-domains/:id/accept',
    what: 'accept a work domain after answering its differences',
    method: 'POST',
    url: (f) => `/api/work-domains/${f.workDomain}/accept`,
    payload: () => ({ responses: [], accepted: { writes: ['perception/calibration/wrist.py'] } }),
  },
  {
    route: 'POST /api/work-domains/:id/observe',
    what: 'rebuild the index and say what drifted from an accepted domain',
    method: 'POST',
    url: (f) => `/api/work-domains/${f.workDomain}/observe`,
    payload: () => ({}),
  },
  {
    route: 'POST /api/work-domains/:id/acknowledge',
    what: 'acknowledge an overlap with another agent',
    method: 'POST',
    url: (f) => `/api/work-domains/${f.workDomain}/acknowledge`,
    payload: () => ({ key: 'a|b|src/shared/time.ts', stance: 'continuing' }),
  },
  {
    route: 'GET /api/records/:id',
    what: 'read one record',
    method: 'GET',
    url: (f) => `/api/records/${f.module}`,
  },
  {
    route: 'PATCH /api/records/:id',
    what: 'change a record',
    method: 'PATCH',
    url: (f) => `/api/records/${f.module}`,
    payload: () => ({ summary: 'rewritten from another project' }),
  },
  {
    route: 'DELETE /api/records/:id',
    what: 'soft delete a record',
    method: 'DELETE',
    url: (f) => `/api/records/${f.module}`,
  },
  {
    route: 'POST /api/records/:id/restore',
    what: 'undo a soft delete',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/restore`,
  },
  {
    route: 'POST /api/records/:id/checklist',
    what: "add a line to a module's checklist",
    method: 'POST',
    url: (f) => `/api/records/${f.module}/checklist`,
    payload: () => ({ partId: 'mount', id: 'mount-2', text: 'filed from another project', state: 'todo' }),
  },
  {
    route: 'PATCH /api/records/:id/checklist/:itemId',
    what: 'tick a checklist line off',
    method: 'PATCH',
    url: (f) => `/api/records/${f.module}/checklist/mount-1`,
    payload: () => ({ state: 'done' }),
  },
  {
    route: 'POST /api/records/:id/parts',
    what: 'add a part to a module',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/parts`,
    payload: () => ({ id: 'from-another-project', name: 'filed from another project' }),
  },
  {
    route: 'POST /api/records/:id/requirements',
    what: 'update a module’s requirements',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/requirements`,
    payload: () => ({ items: [{ id: 'made-up-line', text: 'A made-up requirement.', state: 'todo' }] }),
  },
  {
    route: 'POST /api/records/:id/fulfil',
    what: 'record that a promise was kept',
    method: 'POST',
    url: (f) => `/api/records/${f.obligation}/fulfil`,
    payload: () => ({ note: 'discharged from another project' }),
  },
  // A RECORD MARKED DONE IN ONE CALL, wave 13s round 142. It writes the record's state, so answering about another
  // project would close a record nobody here can see.
  {
    route: 'POST /api/records/:id/done',
    what: 'mark a record done in one call',
    method: 'POST',
    url: (f) => `/api/records/${f.obligation}/done`,
    payload: () => ({ note: 'marked done from another project' }),
  },
  {
    route: 'POST /api/records/:id/ran-instead',
    what: "file what ran instead of a step's canonical method",
    method: 'POST',
    url: (f) => `/api/records/${f.block}/ran-instead`,
    payload: () => ({
      ran: 'something else',
      because: 'filed from another project',
      since: '2026-08-30',
      allowed_uses: ['plumbing'],
      disallowed_claims: ['that the canonical method works'],
      severity: 'limits_claims',
    }),
  },
  {
    // PASSING A QUESTION UP, criterion P55. The id in the path is a record, and a record belongs to
    // one project, so this is refused exactly like every other write against a record from another
    // project — `recordInWorkspace` is the reading that refuses it, before the guard is ever asked.
    route: 'POST /api/records/:id/pass-the-question-on',
    what: 'pass a question up to the person, on behalf of an agent that was started',
    method: 'POST',
    // ANY RECORD FROM THE OTHER PROJECT WILL DO: the boundary is held by `recordInWorkspace`,
    // which reads the record and refuses it before anything about a question is asked.
    url: (f) => `/api/records/${f.note}/pass-the-question-on`,
    // IT TAKES NO BODY. `takesNoInput` refuses one, and the boundary is held before that anyway.
    payload: () => ({}),
  },
  {
    route: 'PUT /api/revalidations/:restrictionId/:recordId',
    what: 'record that somebody re-checked a piece of work after a restriction was resolved',
    method: 'PUT',
    // BOTH PARAMETERS ARE RECORD IDS AND THE FIRST IS THE ONE PROBED. `recordJudgement` reads the
    // restriction and the record and refuses either from another project, so the boundary is held
    // on both ends by the same rule.
    url: (f) => `/api/revalidations/${f.module}/${f.module}`,
    payload: () => ({ state: 'checked' }),
  },
  {
    route: 'POST /api/records/:id/blocks',
    what: 'add a block to a pipeline',
    method: 'POST',
    url: (f) => `/api/records/${f.pipeline}/blocks`,
    payload: () => ({ name: 'Filed from another project', state: 'todo' }),
  },
  {
    route: 'PUT /api/records/:id/blocks',
    what: "put a pipeline's blocks in a new order",
    method: 'PUT',
    url: (f) => `/api/records/${f.pipeline}/blocks`,
    payload: (f) => ({ blockIds: [f.block] }),
  },
  {
    route: 'PUT /api/records/:id/check-also',
    what: "give a run's reminder before its seal the items to name",
    method: 'PUT',
    url: (f) => `/api/records/${f.module}/check-also`,
    payload: () => ({ items: ['written from another project'] }),
  },
  // WAVE 13J ROUND LOOP-1. A held check, released, asks the office for the check, so an answer about another project's run
  // would start a check nobody here can see. The control's record is a module, so it answers 409 (not a run) and not 404.
  // MUTATION, RUN ON 12 OCTOBER 2026: the route's `recordInWorkspace` swapped for `getRecord`, and this probe went red;
  // restored, green.
  {
    route: 'POST /api/records/:id/release-the-held-check',
    what: "release a sealed round's held check",
    method: 'POST',
    url: (f) => `/api/records/${f.module}/release-the-held-check`,
    payload: () => ({ because: 'Released from another project.' }),
  },
  {
    route: 'PATCH /api/records/:id/blocks/:blockId',
    what: 'change one block of one pipeline',
    method: 'PATCH',
    url: (f) => `/api/records/${f.pipeline}/blocks/${f.block}`,
    payload: () => ({ state: 'doing' }),
  },
  {
    route: 'DELETE /api/records/:id/blocks/:blockId',
    what: 'take a block out of its pipeline and delete it',
    method: 'DELETE',
    url: (f) => `/api/records/${f.pipeline}/blocks/${f.block}`,
  },
  // ---------------------------------------------------------------------------------------
  // THE REVISION LEDGER. Four routes, and all four take a record id, so all four are exercised.
  // ---------------------------------------------------------------------------------------
  //
  // A revision holds the CONTENT the record used to have — its title, its summary, its whole `data`
  // — so a read of one from the wrong project is a read of another project's work, not a leak of a
  // number. The restore is a write, and one that puts old content back.
  //
  // `seq` IS 1 IN EVERY PROBE BELOW, and that is not a guess about the fixture: every record gets a
  // revision on the write that files it, so revision 1 exists for anything the fixture created. The
  // refusal must come from the PROJECT rather than from a missing revision, which is what the
  // control in each probe proves — working in robotics, none of these may answer 404.
  {
    route: 'GET /api/records/:id/revisions',
    what: 'read what a record used to hold, one entry per write',
    method: 'GET',
    url: (f) => `/api/records/${f.module}/revisions`,
  },
  {
    // A MODULE'S HISTORY REACHES PAST THE MODULE. Its subject set is the module and every block it
    // has ever carried, so answering across a project boundary would hand back rows about records
    // in another project — and an empty answer would read as "nothing has happened to it", which is
    // a statement about somebody else's work.
    route: 'GET /api/records/:id/history',
    what: 'read what happened to a record and to the work it carries',
    method: 'GET',
    url: (f) => `/api/records/${f.module}/history`,
  },
  {
    // IT READS ONE PROJECT AND NAMES IDS OUT OF IT, so a caller working in one project must not be
    // able to stand in another one's record and be handed that project's open work.
    route: 'GET /api/records/:id/context',
    what: 'read what is still open around a record',
    method: 'GET',
    url: (f) => `/api/records/${f.module}/context`,
  },
  {
    // THE RECORDS AND LINKS A RECORD PAGE DRAWS, read out of one project. A caller standing in one
    // project must not be handed another project's records by naming one of them.
    route: 'GET /api/records/:id/around',
    what: 'read the records and links a record page draws',
    method: 'GET',
    url: (f) => `/api/records/${f.module}/around`,
  },
  {
    // WHAT A RECORD WOULD LOOK LIKE ON A SCREEN OF A STATED WIDTH. It reads the record's stored
    // blocks and hands back every part of every composition by name, so a caller standing in one
    // project must not be able to read the shape of another project's report through it.
    route: 'GET /api/records/:id/layout',
    what: 'read what the layout would do with the proportions a report asked for',
    method: 'GET',
    url: (f) => `/api/records/${f.module}/layout?width=1164&gutter=18&rem=16&read=544&reader=agent`,
  },
  {
    route: 'GET /api/records/:id/revisions/:seq',
    what: 'read one revision of a record, whole',
    method: 'GET',
    url: (f) => `/api/records/${f.module}/revisions/1`,
  },
  {
    route: 'GET /api/records/:id/revisions/:seq/compare/:otherSeq',
    what: 'read what changed between two revisions of a record',
    method: 'GET',
    url: (f) => `/api/records/${f.module}/revisions/1/compare/1`,
  },
  {
    route: 'POST /api/records/:id/revisions/:seq/restore',
    what: 'put back what a record held at one revision',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/revisions/1/restore`,
    payload: () => ({ note: 'put back from another project' }),
  },
  {
    // TAKING BACK AN ACT AN AGENT MADE ON THE OWNER'S OWN WORDS. It names a record and a version of
    // it, exactly as the restore above does, so it is scoped exactly as that one is: a version of a
    // record in another project is a 404 here.
    route: 'POST /api/records/:id/revisions/:seq/revoke',
    what: 'take back an act an agent made on the owner’s own quoted words',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/revisions/1/revoke`,
  },
  // ---------------------------------------------------------------------------------------
  // THE SHORTER FORMS OF A RECORD. Both take a record id, so both are exercised.
  // ---------------------------------------------------------------------------------------
  //
  // A short form is somebody's writing about the record, held inside it, so reading one from the
  // wrong project reads another project's work. The write is an ordinary record edit underneath.
  //
  // THE WRITE'S CONTROL ANSWERS 400 ON PURPOSE. `madeFrom` names revision 1, which every record has,
  // with a content hash that is not revision 1's — so working in robotics the route finds the record
  // and refuses the PAIR, which is the route getting on with its own business rather than a project
  // refusal. Sending a real pair would need the fixture's hash, and sending a broken body would be
  // refused by the shape check before the project was ever looked at, which would prove nothing.
  {
    route: 'GET /api/records/:id/short-forms',
    what: 'read the five shorter forms of a record and whether each still holds',
    method: 'GET',
    url: (f) => `/api/records/${f.module}/short-forms`,
  },
  {
    route: 'POST /api/records/:id/short-forms',
    what: 'write a shorter form of a record',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/short-forms`,
    payload: () => ({
      madeFrom: { seq: 1, contentHash: 'aaaaaaaaaaaaaaaa' },
      forms: { label: 'Filed from another project' },
    }),
  },
  {
    // ONLY ASKS WHETHER THAT WRITE WOULD BE ACCEPTED, by running the write's own function and taking it back
    // (lib/only-a-check.ts), so the record is read the same way and refused from another project the same way.
    route: 'POST /api/records/:id/short-forms/check',
    what: 'ask whether a shorter form of a record would be accepted',
    method: 'POST',
    url: (f) => `/api/records/${f.module}/short-forms/check`,
    payload: () => ({
      madeFrom: { seq: 1, contentHash: 'aaaaaaaaaaaaaaaa' },
      forms: { label: 'Filed from another project' },
    }),
  },
  {
    // THE PERSON FILES A PREPARED NOTE'S WORDS AS THEIR OWN. It reads the note
    // through `recordInWorkspace` and WRITES a note of the person's own, so a note from another project is refused by
    // name. In its own project an ordinary note is refused as not prepared, with 409, which the control accepts.
    route: 'POST /api/records/:id/file-as-my-words',
    what: 'file a prepared note\'s words as the person\'s own note',
    method: 'POST',
    url: (f) => `/api/records/${f.note}/file-as-my-words`,
  },
  {
    // THE PERSON SAYS A PREPARED NOTE IS NOT WHAT THEY SAID. It reads the note
    // through `recordInWorkspace` and WRITES a mark on it, so a note from another project is refused by name. In its
    // own project an ordinary note is refused as not prepared, with 409, which the control accepts.
    route: 'POST /api/records/:id/not-what-i-said',
    what: 'say a prepared note is not what the person said',
    method: 'POST',
    url: (f) => `/api/records/${f.note}/not-what-i-said`,
  },
  {
    route: 'POST /api/records/:id/promote',
    what: 'settle a fork by filing the decision it was filed for',
    method: 'POST',
    url: (f) => `/api/records/${f.proposal}/promote`,
    payload: () => ({ title: 'Settled from another project' }),
  },
  {
    route: 'POST /api/records/:id/workspace',
    what: 'move a record into another project',
    method: 'POST',
    // `dryRun`, so the control reports the whole consequence and writes nothing. The refusal being
    // tested is about the record's CURRENT project, which is the header, not `to`.
    url: (f) => `/api/records/${f.note}/workspace`,
    payload: () => ({ to: PANELX, dryRun: true }),
  },
  {
    route: 'DELETE /api/links/:id',
    what: 'delete a link',
    method: 'DELETE',
    url: (f) => `/api/links/${f.link}`,
  },
  {
    route: 'GET /api/sessions/:id',
    what: 'read one run, addressed by the id of its record',
    method: 'GET',
    url: (f) => `/api/sessions/${f.session}`,
  },
  // ONE RUN'S CALLS, IN TIME ORDER. The id is a session reference and `sessionTimeline` resolves it
  // through `resolveSessionRef`, which answers `elsewhere` and a 404 naming the project the session
  // record is really filed in when this project does not hold it. So it is exercised like the run
  // read above, and the control is the same run read from its own project.
  {
    route: 'GET /api/sessions/:id/timeline',
    what: "read one run's calls in time order, with its polls folded",
    method: 'GET',
    url: (f) => `/api/sessions/${f.session}/timeline`,
  },
  // ONE RUN'S FLOW RUN, AND A STEP ADDED TO IT BY HAND. Wave 1 of the office flow, M1. Both read the run through
  // `recordInWorkspace`, which refuses a run filed in another project by name; the POST writes a step onto the run's
  // flow run, so answering about another project's run would write into a record nobody here can see.
  {
    route: 'GET /api/sessions/:id/flow-run',
    what: "read one run's flow run, its flow and its steps",
    method: 'GET',
    url: (f) => `/api/sessions/${f.session}/flow-run`,
  },
  {
    route: 'POST /api/sessions/:id/flow-run/steps',
    what: "add one step to a run's flow run",
    method: 'POST',
    url: (f) => `/api/sessions/${f.session}/flow-run/steps`,
    payload: () => ({ does: 'A step from across the project line.', how: 'by an agent', outcome: 'done' }),
  },
  // THE HONOUR BOARD'S TWO RECORD-SIDE DOORS, criteria HB1, HB2 and HB4. Both read the run through
  // `recordInWorkspace`, which refuses a run filed in another project by name; the POST writes the
  // reading onto the session record, so answering about another project's run would write into a
  // record nobody here can see. The control, in the run's own project, is a 200 for the read and a
  // 201 for the write, which is the route getting on with its own business.
  {
    route: 'GET /api/honour-board/runs/:run',
    what: "one run's five honour signals, read now, from records only",
    method: 'GET',
    url: (f) => `/api/honour-board/runs/${f.session}`,
  },
  {
    route: 'POST /api/honour-board/runs/:run/read',
    what: "one run's honour reading, stored on its session record",
    method: 'POST',
    url: (f) => `/api/honour-board/runs/${f.session}/read`,
    payload: () => ({}),
  },
  {
    route: 'POST /api/sessions/:id/link',
    what: 'link a run to a record it worked on',
    method: 'POST',
    url: (f) => `/api/sessions/${f.session}/link`,
    payload: (f) => ({ toId: f.module, type: 'relates_to' }),
  },
  {
    route: 'GET /api/presentation/:scope',
    what: "read one pipeline's stored arrangement",
    method: 'GET',
    url: (f) => `/api/presentation/pipeline:${f.pipeline}`,
  },
  {
    route: 'PUT /api/presentation/:scope',
    what: "replace one pipeline's whole arrangement",
    method: 'PUT',
    url: (f) => `/api/presentation/pipeline:${f.pipeline}`,
    payload: () => ({ intent: { direction: 'down' } }),
  },
  {
    route: 'DELETE /api/presentation/:scope',
    what: "forget one pipeline's arrangement",
    method: 'DELETE',
    url: (f) => `/api/presentation/pipeline:${f.pipeline}`,
  },
  {
    route: 'PUT /api/presentation/:scope/direction',
    what: 'set which way one pipeline runs',
    method: 'PUT',
    url: (f) => `/api/presentation/pipeline:${f.pipeline}/direction`,
    payload: () => ({ intent: { direction: 'down' } }),
  },
  {
    route: 'DELETE /api/presentation/:scope/direction',
    what: 'forget which way one pipeline runs',
    method: 'DELETE',
    url: (f) => `/api/presentation/pipeline:${f.pipeline}/direction`,
  },
  {
    route: 'PUT /api/presentation/:scope/nodes/:target',
    what: 'arrange one node of one pipeline',
    method: 'PUT',
    url: (f) => `/api/presentation/pipeline:${f.pipeline}/nodes/${f.block}`,
    payload: () => ({ intent: { lane: 'the arm' } }),
  },
  {
    route: 'DELETE /api/presentation/:scope/nodes/:target',
    what: "forget one node's arrangement",
    method: 'DELETE',
    url: (f) => `/api/presentation/pipeline:${f.pipeline}/nodes/${f.block}`,
  },
  // THE AGENT CONVERSATIONS. A thread is workspace-owned like every other authored row outside
  // planning, and a message and a run are scoped THROUGH it: neither carries a `workspace_id`,
  // because a copy on every message would be the same fact in two places. So every route here that
  // takes a thread id or a message id resolves the project through the thread and refuses an id
  // whose thread is somewhere else, naming where it is. The three RUN routes are person-level and
  // are listed with their reason below, not here.
  {
    route: 'GET /api/agent/threads/:id',
    what: 'read one conversation, its comments and its runs',
    method: 'GET',
    url: (f) => `/api/agent/threads/${f.thread}`,
  },
  {
    route: 'PATCH /api/agent/threads/:id',
    what: 'rename a conversation',
    method: 'PATCH',
    url: (f) => `/api/agent/threads/${f.thread}`,
    payload: () => ({ title: 'renamed from another project' }),
  },
  {
    route: 'POST /api/agent/threads/:id/messages',
    what: 'say something in a conversation',
    method: 'POST',
    url: (f) => `/api/agent/threads/${f.thread}/messages`,
    payload: () => ({ intent: 'ask', body: 'written from another project' }),
  },
  {
    route: 'POST /api/agent/threads/:id/dispatch',
    what: 'send a review to an agent',
    // The control answers 409 — the one comment in the fixture says who it is for — and that is a
    // pass here: what the control has to prove is that the route FOUND the conversation and got on
    // with its own business, which a 409 naming the unrouted comment does.
    method: 'POST',
    url: (f) => `/api/agent/threads/${f.thread}/dispatch`,
  },
  {
    route: 'PATCH /api/agent/messages/:id',
    what: 'change a comment that is still waiting',
    method: 'PATCH',
    url: (f) => `/api/agent/messages/${f.message}`,
    payload: () => ({ body: 'rewritten from another project' }),
  },
  {
    route: 'DELETE /api/agent/messages/:id',
    what: 'take a comment out of a review',
    method: 'DELETE',
    url: (f) => `/api/agent/messages/${f.message}`,
  },
  {
    route: 'GET /api/reviews/:id',
    what: 'read one review',
    method: 'GET',
    url: (f) => `/api/reviews/${f.review}`,
  },
  {
    route: 'POST /api/reviews/:id/finish-collecting',
    what: "write down a review's membership",
    method: 'POST',
    url: (f) => `/api/reviews/${f.review}/finish-collecting`,
  },
  // THE COMMENTS A REVIEW DID NOT TAKE, AND THE WAY OUT OF ONE. Both take a review id and both are
  // exercised here for the same reason the two above are: the GET hands out every comment in the
  // PROJECT that is not in the review — the words somebody wrote, what each was left on, and when —
  // so answering it about another project's review would hand that project's writing to whoever
  // knew an id; and the POST ends a review, which is a write on somebody else's collection.
  {
    route: 'GET /api/reviews/:id/not-in-it',
    what: 'read the comments a review did not take',
    method: 'GET',
    url: (f) => `/api/reviews/${f.review}/not-in-it`,
  },
  {
    route: 'POST /api/reviews/:id/abandon',
    what: 'end a review without sending anything',
    method: 'POST',
    url: (f) => `/api/reviews/${f.review}/abandon`,
  },
  // ---------------------------------------------------------------------------------------
  // WHAT PANELX MADE OF A REVIEW'S COMMENTS. Two routes, both taking a review id, both exercised.
  // ---------------------------------------------------------------------------------------
  //
  // The GET hands out every comment in the review IN FULL — the words somebody selected, what each
  // one was left on, and who they said it was for — so answering it about another project's review
  // would hand that project's writing to whoever knew an id. The POST writes: it stores a sentence
  // beside each of those comments, in `annotation.interpretation`.
  //
  // BOTH CONTROLS ANSWER 409, AND THAT IS A PASS HERE. The fixture's review is still collecting, and
  // both routes refuse that state by name — what is in a review can still change, so a reading of it
  // would be a reading of a different set. What a control has to prove is that the route FOUND the
  // review and got on with its own business, which a 409 about that review does. Finishing collecting
  // in the fixture instead would change the state every other review probe is aimed at.
  {
    route: 'GET /api/reviews/:id/organise',
    what: 'read every comment in a review, to hand to something that can read them',
    method: 'GET',
    url: (f) => `/api/reviews/${f.review}/organise`,
  },
  // ---------------------------------------------------------------------------------------
  // SENDING A REVIEW. Two routes, and the one that matters is the second: it hands somebody's
  // comments to an agent. A crossing request here would hand ONE PROJECT'S WRITING TO ANOTHER
  // PROJECT'S AGENTS, which is the worst thing any route in this product could be talked into.
  //
  // The GET writes nothing and says where each comment would go — it is the line a person reads
  // before pressing, so it has to be about the same review the press would act on.
  //
  // BOTH CONTROLS ANSWER 409 AND THAT IS A PASS, for the same reason the organise probes give: the
  // fixture's review is still collecting and both routes refuse that state by name, having found the
  // review first. What a control proves is that the route reached its own business.
  // ---------------------------------------------------------------------------------------
  {
    route: 'GET /api/reviews/:id/send',
    what: 'say where every comment in a review would go, before anybody presses anything',
    method: 'GET',
    url: (f) => `/api/reviews/${f.review}/send`,
  },
  {
    route: 'POST /api/reviews/:id/send',
    what: "hand a review's comments to the agents they are addressed to",
    method: 'POST',
    url: (f) => `/api/reviews/${f.review}/send`,
    // Sent empty on purpose. `to` is optional — a review whose comments already carry their
    // recipients needs no body at all — so an empty object is the shape a real caller sends most
    // often, and it cannot be refused for its shape before the project is looked at.
    payload: () => ({}),
  },
  {
    route: 'POST /api/reviews/:id/take-out',
    // The control answers 409, and that is a pass for the reason the send probes give: the fixture's review is still
    // collecting, and a collecting review has nothing to take a comment out of. The body has a usable shape, so the
    // crossing request cannot be refused for its shape before the project is looked at.
    what: 'take a comment out of what a review waits for',
    method: 'POST',
    url: (f) => `/api/reviews/${f.review}/take-out`,
    payload: () => ({ comment: 'not-a-comment-in-it', because: 'the-person-answers-it' }),
  },
  {
    route: 'POST /api/reviews/:id/organise',
    what: 'store a reading beside the words of a review',
    method: 'POST',
    url: (f) => `/api/reviews/${f.review}/organise`,
    // THE BODY IS NEVER REACHED BY EITHER REQUEST. `keepOrganised` asks which comments are in the
    // review before it looks at what came back, so the crossing request is refused for the project
    // and the control is refused for the state. A shape-correct reading naming no comments is sent
    // anyway, because a body that could not be read at all would be refused before the project was
    // ever looked at, which would prove nothing.
    payload: () => ({ comments: [], groups: [] }),
  },
  {
    route: 'PATCH /api/reviews/:id',
    // The control answers 409 — this route refuses every state word there is and says which piece
    // of Mole Office does not exist — and that is a pass here: what the control has to prove is that the
    // route FOUND the review and got on with its own business, which a 409 about the review does.
    what: 'reach for a state word on a review',
    method: 'PATCH',
    url: (f) => `/api/reviews/${f.review}`,
    payload: () => ({ state: 'sent' }),
  },
  {
    route: 'GET /api/annotations/:id',
    what: 'read one remark somebody left on something',
    method: 'GET',
    url: (f) => `/api/annotations/${f.annotation}`,
  },
  // THE AGENT LIFECYCLE ROUTES. Every one of the five takes a record id — an `agent` for the first
  // three, an attachment for the last two — and every one refuses an id from another project by
  // name.
  //
  // THE TWO WORK-STATE ROUTES CHECK THE AGENT BEFORE THEY CHECK THEIR STORE, and that order is the
  // reason they are in this table rather than answering 503 to everything. The transition tables
  // are created by a migration that is written, proved and deliberately NOT registered until the
  // one announced window, so on this database they do not exist — and a route that checked the
  // store first would answer a caller in the wrong project that the only thing wrong was a
  // migration. The control is then answered 503, which is not a 404 and is all a control asks.
  {
    route: 'GET /api/agents/:id/presence',
    what: 'whether an agent can be reached now',
    method: 'GET',
    url: (f) => `/api/agents/${f.agent}/presence`,
  },
  {
    route: 'GET /api/agents/:id/work-state',
    what: 'what an agent is supposed to be doing',
    method: 'GET',
    url: (f) => `/api/agents/${f.agent}/work-state`,
  },
  {
    route: 'POST /api/agents/:id/work-state',
    what: 'move what an agent is supposed to be doing',
    method: 'POST',
    url: (f) => `/api/agents/${f.agent}/work-state`,
    payload: () => ({ to: 'working', because: 'Moved from another project entirely.' }),
  },
  // THE TWO WAKE ROUTES, for the same reason and in the same order: each checks that the id names a
  // live agent of THIS project before it checks whether the wake table exists, so a caller in the
  // wrong project is told that, not told about a held migration. Neither of them wakes anything.
  {
    route: 'GET /api/agents/:id/wakes',
    what: 'the wakes somebody has wanted for an agent',
    method: 'GET',
    url: (f) => `/api/agents/${f.agent}/wakes`,
  },
  {
    route: 'POST /api/agents/:id/wakes',
    what: 'write down that a wake is wanted',
    method: 'POST',
    url: (f) => `/api/agents/${f.agent}/wakes`,
    payload: () => ({ because: 'Wanted from another project entirely.', policy: 'owner-press' }),
  },
  // THE FIVE AGENT TERMINAL DOORS, wave 13u round 10, src/server/api/terminal-agents.ts. The path names an agent, which
  // belongs to no project, but each door answers about the agent's newest run, and that run is a record filed in one
  // project. The way back would start a new run here continuing a run filed elsewhere; the pane and the steps would
  // show another project's run. So each refuses a newest run filed in another project, naming where it is
  // (theNewestRunOfTheAgent in lib/session-origins.ts). Their controls answer 200 or 409: the run has no way back, no
  // process and no sandbox, so nothing on this machine is started.
  {
    route: 'GET /api/terminals/agents/:agent/way-back',
    what: "the command that brings an agent's newest run back",
    method: 'GET',
    url: () => '/api/terminals/agents/robotics-cal/way-back',
  },
  {
    route: 'POST /api/terminals/agents/:agent/way-back',
    what: "bring one of an agent's runs back in a terminal",
    method: 'POST',
    url: () => '/api/terminals/agents/robotics-cal/way-back',
    payload: (f) => ({ session: f.agentsRun }),
  },
  {
    route: 'GET /api/terminals/agents/:agent/pane',
    what: "where an agent's newest run's tmux pane is",
    method: 'GET',
    url: () => '/api/terminals/agents/robotics-cal/pane',
  },
  {
    route: 'POST /api/terminals/agents/:agent/pane',
    what: "show an agent's newest run's tmux pane in a terminal",
    method: 'POST',
    url: () => '/api/terminals/agents/robotics-cal/pane',
    payload: () => ({}),
  },
  {
    route: 'GET /api/terminals/agents/:agent/steps',
    what: "the steps of an agent's newest run in a sandbox",
    method: 'GET',
    url: () => '/api/terminals/agents/robotics-cal/steps',
  },
  {
    route: 'POST /api/attachments/:id/close',
    what: 'end a period of participation',
    method: 'POST',
    url: (f) => `/api/attachments/${f.session}/close`,
    payload: () => ({ how: 'person-said', because: 'Closed from another project entirely.' }),
  },
  {
    route: 'GET /api/attachments/:id/children',
    what: 'the child runs one attachment started',
    method: 'GET',
    url: (f) => `/api/attachments/${f.session}/children`,
  },
  // WHAT AN AGENT READ IN A FOLDER. Both read the reading through a query narrowed to the project
  // the header names, so a reading filed in another project is answered 404 by name rather than
  // handed over. The second one is refused to every agent before it ever looks the id up; a person
  // sending another project's id meets the same 404.
  {
    route: 'GET /api/import/drafts/:id',
    what: 'one reading of somebody else\'s folder',
    method: 'GET',
    url: (f) => `/api/import/drafts/${f.folderReading}`,
  },
  {
    route: 'POST /api/import/drafts/:id/pieces/:pieceId',
    what: 'accepting one piece of a reading',
    method: 'POST',
    url: (f) => `/api/import/drafts/${f.folderReading}/pieces/${f.folderReadingPiece}`,
    payload: () => ({ press: 'accept' }),
  },
  // THE CHECK THAT ENDS A SUBAGENT'S RUN. These read the run through `theRun`, which refuses a
  // run filed in another project by name rather than answering about it. The id in the path is a
  // session record, and a session belongs to a project like every other record. Two of them write:
  // the release, where answering about another project would be a release written where nobody
  // asking could see it, and the assembly, where it would be a measurement kept on a run in a
  // project the caller was not asking about.
  {
    route: 'GET /api/checks/:run',
    what: 'what a check reads about one run',
    method: 'GET',
    url: (f) => `/api/checks/${f.session}`,
  },
  {
    route: 'GET /api/checks/:run/how-it-would-settle',
    what: 'how an owed run would be settled',
    method: 'GET',
    url: (f) => `/api/checks/${f.session}/how-it-would-settle`,
  },
  {
    route: 'GET /api/checks/:run/eligibility',
    what: 'whether one run may be checked',
    method: 'GET',
    url: (f) => `/api/checks/${f.session}/eligibility`,
  },
  {
    route: 'POST /api/checks/:run/prompt',
    what: 'the prompt an inspector run is given',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/prompt`,
    payload: () => ({ changes: [] }),
  },
  {
    route: 'POST /api/checks/:run/assembled',
    what: 'keeping what one assembly of the check prompt measured',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/assembled`,
    payload: () => ({ changes: [] }),
  },
  {
    route: 'POST /api/checks/:run/tool-started',
    what: 'recording the office tool start for one run',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/tool-started`,
    payload: (f) => ({ session: f.session, log: '/synthetic-check.log', model: 'fixture', minutes: 40 }),
  },
  {
    route: 'POST /api/checks/:run/tool-ended',
    what: 'recording the office tool ending for one run',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/tool-ended`,
    payload: (f) => ({ session: f.session, reason: 'Synthetic boundary probe.' }),
  },
  {
    route: 'POST /api/checks/:run/ask-again',
    what: 'asking for another check of one run',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/ask-again`,
    payload: () => ({}),
  },
  {
    route: 'POST /api/checks/:run',
    what: 'releasing or refusing a run',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}`,
    payload: () => ({ verdict: 'released', check: 'Checked from another project entirely.' }),
  },
  {
    route: 'POST /api/checks/:run/standard',
    what: 'releasing a run as a standard change, with no inspector (wave 13r round F)',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/standard`,
    payload: () => ({}),
  },
  // CLOSING A RUN AS OVERTAKEN BY A LATER RUN. It
  // reads the run through `theRun`, which refuses a run filed in another project by name rather
  // than answering about it, and it WRITES: one field on the run's `theCheck`. Answering about
  // another project's run would close a run nobody here can see.
  //
  // THE CONTROL ANSWERS 409, AND THAT IS A PASS. The body names the run itself as the later run,
  // which the door refuses by name — what the control proves is that the route FOUND the run and
  // got on with its own business, which a 409 about that run does. The crossing request is refused
  // on the run in the path, before the body's later run is ever resolved.
  {
    route: 'POST /api/checks/:run/superseded',
    what: 'closing a run because a later run finished the work',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/superseded`,
    payload: (f) => ({ by: f.session, because: 'A probe from another project.' }),
  },
  {
    route: 'POST /api/checks/:run/landed-by-hand',
    what: 'recording that a released run\'s content reached main by hand (wave 13k round 5)',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/landed-by-hand`,
    payload: () => ({ commit: 'abcdef1234567', because: 'A probe from another project.' }),
  },
  {
    route: 'POST /api/checks/:run/closed-unchecked',
    what: 'closing a run unchecked with its reason recorded',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/closed-unchecked`,
    payload: () => ({ because: 'A probe from another project.' }),
  },
  // THE MERGE QUEUE'S DOORS BY ENTRY. Sandbox v1, piece P6. An entry is a record and belongs to one
  // project, so each door reads it through `theMergeEntry`, which is `recordInWorkspace` first: an id
  // from another project is a 404 before anything else is asked. Four of the five write — a
  // withdrawal, a step, a tool's start and its end — so answering about another project's entry would
  // move or annotate an entry nobody here can see.
  //
  // THE CONTROL IS AIMED AT THE SESSION FIXTURE AND ANSWERS 409 OR 403, AND THAT IS A PASS. Making a
  // real entry needs a sealed run, which needs a git tree; the session is a record of this project that
  // is not an entry, which the doors refuse by name with 409 (and the worker's doors refuse the person
  // with 403 before that). Either proves the door FOUND the record in its project and got on with its
  // own business. tests/merge-queue-doors.test.ts drives every door against real entries.
  {
    route: 'GET /api/merge-queue/:id',
    what: 'one merge entry and what it waits on',
    method: 'GET',
    url: (f) => `/api/merge-queue/${f.session}`,
  },
  {
    route: 'GET /api/merge-queue/:id/reads',
    what: "the record of what the suite reads, on the main an entry was integrated on",
    method: 'GET',
    url: (f) => `/api/merge-queue/${f.session}/reads`,
  },
  {
    route: 'POST /api/merge-queue/:id/withdraw',
    what: 'withdrawing a merge entry',
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/withdraw`,
    payload: () => ({ because: 'Withdrawn from another project entirely.' }),
  },
  {
    route: 'POST /api/merge-queue/:id/step',
    what: 'the merge tool reporting a step',
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/step`,
    payload: () => ({ step: 'pinned', facts: {} }),
  },
  {
    route: 'POST /api/merge-queue/:id/tool-started',
    what: 'recording the merge tool start for one entry',
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/tool-started`,
    payload: (f) => ({ session: f.session, log: '/synthetic-merge.log' }),
  },
  {
    route: 'POST /api/merge-queue/:id/tool-ended',
    what: 'recording the merge tool ending for one entry',
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/tool-ended`,
    payload: (f) => ({ session: f.session, reason: 'Synthetic boundary probe.' }),
  },
  {
    route: 'POST /api/merge-queue/:id/confirm-deletes',
    what: "the secretary confirming a files entry's deletes",
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/confirm-deletes`,
    payload: () => ({ because: 'Confirmed from another project entirely.' }),
  },
  {
    route: 'POST /api/merge-queue/:id/land-again',
    what: 'the secretary asking a stalled landing again',
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/land-again`,
    payload: () => ({ because: 'Asked again from another project entirely.' }),
  },
  {
    route: 'POST /api/merge-queue/:id/first',
    what: 'moving a merge entry to the front of its lane',
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/first`,
    payload: () => ({ because: 'Moved from another project entirely.' }),
  },
  {
    route: 'POST /api/merge-queue/:id/press-to-land',
    what: 'pressing a merge entry that touches a sensitive path to land',
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/press-to-land`,
    payload: () => ({ because: 'Pressed from another project entirely.' }),
  },
  {
    route: 'POST /api/merge-queue/:id/resolution',
    what: "handing over the resolution of a merge entry's conflict",
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/resolution`,
    payload: () => ({ workingDirectory: '/synthetic-clean-copy' }),
  },
  {
    route: 'POST /api/merge-queue/:id/nobody-started',
    what: "recording that nobody started a merge entry's resolve brief",
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/nobody-started`,
    payload: () => ({ status: 409, said: 'Refused in another project entirely.' }),
  },
  {
    route: 'POST /api/merge-queue/:id/hand-back-from-the-main-suite',
    what: "handing a landed entry's proved main-suite reds back to its line",
    method: 'POST',
    url: (f) => `/api/merge-queue/${f.session}/hand-back-from-the-main-suite`,
    payload: () => ({}),
  },
  // THE END OF AN EMERGENCY PUSH, wave 13u round 82 (item 16). It reads the push through `recordInWorkspace` first and
  // WRITES its end, so answering about another project's push would end a push nobody here can see. The control is aimed
  // at the session fixture and answers 409, because a session is not a push; that is a pass, since the door found the
  // record in its own project. tests/an-emergency-push-to-main.test.ts drives the door against real pushes.
  {
    route: 'POST /api/merge-queue/emergency-pushes/:id/end',
    what: 'ending an emergency push to main',
    method: 'POST',
    url: (f) => `/api/merge-queue/emergency-pushes/${f.session}/end`,
    payload: () => ({ says: 'Ended from another project entirely.', onward: null }),
  },
  // ONE EMERGENCY PUSH, READ ON ITS OWN DOOR. It reads the push through `recordInWorkspace` first, so answering about
  // another project's push would show a push nobody here can see. It writes nothing. The control is aimed at the session
  // fixture and answers 409, because a session is not a push; that is a pass, since the door found the record in its own
  // project. tests/an-emergency-push-to-main.test.ts drives the door against real pushes.
  {
    route: 'GET /api/merge-queue/emergency-pushes/:id',
    what: 'one emergency push to main, read',
    method: 'GET',
    url: (f) => `/api/merge-queue/emergency-pushes/${f.session}`,
  },
  // THE COUNTERS' DOORS BY COUNTER. Criteria CT1 to CT7. A counter is a record and belongs to one
  // project, so every door reads it through `theCounter`, which is `recordInWorkspace` first: an id
  // from another project is a 404 before anything else is asked. Five of the six write — an
  // addition, a change, a pause, a resume and a job runner's answer — so answering about another
  // project's counter would count something into a counter nobody here can see.
  //
  // THE CONTROL IS AIMED AT THE NOTE FIXTURE AND ANSWERS 409, AND THAT IS A PASS: the note is a
  // record of this project that is not a counter, which every door refuses by name. Either way the
  // door FOUND the record in its project and got on with its own business.
  // tests/counter-doors.test.ts drives every door against real counters.
  // THE DRAFT SEND DOOR. It reads the draft through `recordInWorkspace` before
  // anything else is asked, and it WRITES: a message, a link and the draft's sentAs, so answering about
  // another project would send somebody else's draft. The control is aimed at the note fixture and
  // answers 400, because a note is not a draft; that is a pass, since the door found the record in its
  // own project. tests/only-its-writer-sends-a-draft.test.ts drives the door against real drafts.
  {
    route: 'POST /api/drafts/:id/send',
    what: 'sending a draft',
    method: 'POST',
    url: (f) => `/api/drafts/${f.note}/send`,
  },
  // THE ANSWER DOOR reads the report through `recordInWorkspace` before anything else is asked of it, so an id from another
  // project is a 404 here too. The control answers 400, because the note is not a report.
  {
    route: 'PUT /api/records/:id/answers/:blockId',
    what: 'keeping an answer to a question in a report',
    method: 'PUT',
    url: (f) => `/api/records/${f.note}/answers/q-boundary`,
    payload: () => ({ answer: { words: 'An answer from across the project line.' } }),
  },
  {
    route: 'POST /api/records/:id/answers/send',
    what: 'sending the answers to a report',
    method: 'POST',
    url: (f) => `/api/records/${f.note}/answers/send`,
    payload: () => ({ press: { scope: 'report' } }),
  },
  // THE BOOKING DOORS. Each reads the booking through `recordInWorkspace` before it
  // writes, and each writes: a program, a cancellation, a request, an answer, a cut-in step, a use, a progress
  // report, an extension.
  {
    route: 'POST /api/bookings/:id/program',
    what: "naming a booking's program",
    method: 'POST',
    url: (f) => `/api/bookings/${f.note}/program`,
    payload: () => ({ pid: 4242 }),
  },
  {
    route: 'POST /api/bookings/:id/cancel',
    what: 'cancelling a booking',
    method: 'POST',
    url: (f) => `/api/bookings/${f.note}/cancel`,
  },
  {
    route: 'POST /api/bookings/:id/go-first',
    what: 'asking for a booking to go first',
    method: 'POST',
    url: (f) => `/api/bookings/${f.note}/go-first`,
    payload: (f) => ({ ahead: f.session }),
  },
  {
    route: 'POST /api/bookings/:id/go-first/answer',
    what: 'granting a request to go first',
    method: 'POST',
    url: (f) => `/api/bookings/${f.note}/go-first/answer`,
    payload: () => ({ grant: true }),
  },
  {
    route: 'POST /api/bookings/:id/cut-in/step',
    what: 'recording a cut-in step',
    method: 'POST',
    url: (f) => `/api/bookings/${f.note}/cut-in/step`,
    payload: () => ({ sandbox: 'from-another-project', did: 'down' }),
  },
  {
    route: 'POST /api/bookings/:id/use',
    what: "recording a booking's use",
    method: 'POST',
    url: (f) => `/api/bookings/${f.note}/use`,
    payload: () => ({ startedAt: '2026-10-08 16:03:12', endedAt: '2026-10-08 16:51:40', peakMiB: 9120, peakSays: 'Read every 5 seconds.', ended: 'exit 0' }),
  },
  {
    route: 'POST /api/bookings/:id/progress',
    what: "reporting how far a booking's program is",
    method: 'POST',
    url: (f) => `/api/bookings/${f.note}/progress`,
    payload: () => ({ done: 17, of: 42 }),
  },
  {
    route: 'POST /api/bookings/:id/extend',
    what: 'extending a booking',
    method: 'POST',
    url: (f) => `/api/bookings/${f.note}/extend`,
    payload: () => ({ until: '2026-10-08 21:30', because: 'Test: 25 of 42 cases are left' }),
  },
  // THE CHECKLIST DOORS. Each reads the checklist through `recordInWorkspace` first.
  {
    route: 'GET /api/checklists/:id',
    what: 'one checklist',
    method: 'GET',
    url: (f) => `/api/checklists/${f.note}`,
  },
  {
    route: 'PATCH /api/checklists/:id',
    what: "changing a checklist's title",
    method: 'PATCH',
    url: (f) => `/api/checklists/${f.note}`,
    payload: () => ({ title: 'Renamed from another project entirely' }),
  },
  {
    route: 'POST /api/checklists/:id/items',
    what: 'adding an item to a checklist',
    method: 'POST',
    url: (f) => `/api/checklists/${f.note}/items`,
    payload: () => ({ words: 'An item from another project entirely.' }),
  },
  {
    route: 'PATCH /api/checklists/:id/items/:item',
    what: 'changing an item of a checklist',
    method: 'PATCH',
    url: (f) => `/api/checklists/${f.note}/items/i-1`,
    payload: () => ({ state: 'in progress' }),
  },
  // THE TWO PLANNING DOORS, wave 13j round 49. Both read the module through `recordInWorkspace`
  // before anything else, so a module filed in another project is refused by name and nothing is written.
  // CONTROL: passed. MUTATION: the module read with `getRecord` first, ignoring its project; both probes red. RESTORE: passed.
  {
    route: 'POST /api/modules/:id/plan-step-done',
    what: "saying a module's plan step is done",
    method: 'POST',
    url: (f) => `/api/modules/${f.module}/plan-step-done`,
    payload: (f) => ({ pipeline: f.pipeline }),
  },
  {
    route: 'POST /api/modules/:id/plan',
    what: "submitting a module's questioned plan",
    method: 'POST',
    url: (f) => `/api/modules/${f.module}/plan`,
    payload: () => ({ answers: { againstHisDecisions: 'No.', alreadyDone: 'No.', localFix: 'No.', leastSure: 'Step 1.' } }),
  },
  // ENTERING A FLOW, wave 13j round 52. The door reads the flow through `recordInWorkspace` before
  // anything else, so a record filed in another project is refused by name and nothing is written. In its own project
  // the note is refused as not a flow, with 409, which the control accepts.
  {
    route: 'POST /api/flows/:id/enter',
    what: 'entering a flow',
    method: 'POST',
    url: (f) => `/api/flows/${f.note}/enter`,
    payload: (f) => ({ about: f.note }),
  },
  {
    route: 'PUT /api/checklists/:id/items/:item/reminder',
    what: "switching a checklist item's reminder",
    method: 'PUT',
    url: (f) => `/api/checklists/${f.note}/items/i-1/reminder`,
    payload: () => ({ on: false }),
  },
  {
    route: 'GET /api/flows/:id',
    what: 'one flow and its latest runs',
    method: 'GET',
    url: (f) => `/api/flows/${f.flow}`,
  },
  {
    route: 'GET /api/flows/:id/runs',
    what: "a page of one flow's runs",
    method: 'GET',
    url: (f) => `/api/flows/${f.flow}/runs`,
  },
  // THE FLOWS PAGE'S FOUR STAGE WRITES (wave 13p round 34). Each finds its flow in the header's project before it reads the
  // version, so the control, sent with a version that is not the flow's, is refused 409 and writes nothing.
  {
    route: 'POST /api/flows/:id/stages',
    what: 'a stage added to one flow',
    method: 'POST',
    url: (f) => `/api/flows/${f.flow}/stages`,
    payload: () => ({ ifVersion: 'test-boundary', at: 1, does: 'A test stage.', why: 'A test reason.', sources: [], cause: 'test' }),
  },
  {
    route: 'PATCH /api/flows/:id/stages/:n',
    what: 'one stage of one flow changed',
    method: 'PATCH',
    url: (f) => `/api/flows/${f.flow}/stages/1`,
    payload: () => ({ ifVersion: 'test-boundary', why: 'A test reason.', sources: [], cause: 'test' }),
  },
  {
    route: 'POST /api/flows/:id/stages/:n/move',
    what: 'one stage of one flow moved',
    method: 'POST',
    url: (f) => `/api/flows/${f.flow}/stages/1/move`,
    payload: () => ({ ifVersion: 'test-boundary', to: 1, why: 'A test reason.', cause: 'test' }),
  },
  {
    route: 'DELETE /api/flows/:id/stages/:n',
    what: 'one stage of one flow removed',
    method: 'DELETE',
    url: (f) => `/api/flows/${f.flow}/stages/1`,
    payload: () => ({ ifVersion: 'test-boundary', why: 'A test reason.', cause: 'test' }),
  },
  // A FLOW'S TRIGGER, WHO RUNS IT AND WHOM IT IS FOR (wave 13p round 40). Without ?projects= it finds the flow in the
  // header's project, as the stage writes do, so a flow of another project is refused before the version is read.
  {
    route: 'PATCH /api/flows/:id',
    what: "one flow's trigger, who runs it and whom it is for",
    method: 'PATCH',
    url: (f) => `/api/flows/${f.flow}`,
    payload: () => ({ ifVersion: 'test-boundary', trigger: 'A test trigger.' }),
  },
  {
    route: 'GET /api/counters/:id',
    what: 'one counter, its rows and the changes made to it',
    method: 'GET',
    url: (f) => `/api/counters/${f.note}`,
  },
  {
    route: 'POST /api/counters/:id/add',
    what: 'adding to a counter',
    method: 'POST',
    url: (f) => `/api/counters/${f.note}/add`,
    payload: () => ({ by: 1, because: 'An addition from another project entirely.' }),
  },
  {
    route: 'PATCH /api/counters/:id',
    what: 'changing what a counter does',
    method: 'PATCH',
    url: (f) => `/api/counters/${f.note}`,
    payload: () => ({ atMostOnceEvery: 60, because: 'A change from another project entirely.' }),
  },
  {
    route: 'POST /api/counters/:id/pause',
    what: 'pausing a counter',
    method: 'POST',
    url: (f) => `/api/counters/${f.note}/pause`,
    payload: () => ({ because: 'Paused from another project entirely.' }),
  },
  {
    route: 'POST /api/counters/:id/resume',
    what: 'resuming a paused counter',
    method: 'POST',
    url: (f) => `/api/counters/${f.note}/resume`,
    payload: () => ({ because: 'Resumed from another project entirely.' }),
  },
  {
    route: 'POST /api/toolset/categories/:id/confirm',
    what: 'confirming a tool category',
    method: 'POST',
    url: (f) => `/api/toolset/categories/${f.note}/confirm`,
    payload: () => ({ why: 'Confirmed from another project entirely.' }),
  },
  // ONE RUN'S USES OF TOOLS, added in wave 13s round 33. The run is read through `recordInWorkspace`.
  {
    route: 'GET /api/toolset/runs/:run/uses',
    what: "reading one run's uses of tools",
    method: 'GET',
    url: (f) => `/api/toolset/runs/${f.session}/uses`,
  },
  {
    route: 'POST /api/counters/:id/firings/:seq/answer',
    what: 'a job runner answering one firing of a counter',
    method: 'POST',
    url: (f) => `/api/counters/${f.note}/firings/1/answer`,
    payload: () => ({ says: 'Answered from another project entirely.' }),
  },
  // A HOST JOB BY ITS ID: reading one, and the host runner answering one. Both read the job through
  // `recordInWorkspace` before anything else, so a job of another project is a 404 before the key is asked about.
  {
    route: 'GET /api/host-jobs/:id',
    what: 'one host job',
    method: 'GET',
    url: (f) => `/api/host-jobs/${f.note}`,
  },
  {
    route: 'POST /api/host-jobs/:id/answer',
    what: 'the host runner saying how a host job ended',
    method: 'POST',
    url: (f) => `/api/host-jobs/${f.note}/answer`,
    payload: () => ({ state: 'lost', why: 'Answered from another project entirely.' }),
  },
  // CONFIRMING THE REPORT A RELEASED RUN MADE, which is what closes the run. Criterion C29. It is a
  // record by id like the release beside it: a run belongs to one project, and a supervisor in
  // another project may not close it.
  {
    route: 'POST /api/checks/:run/confirm',
    what: 'confirming the report a released run made, which closes it',
    method: 'POST',
    url: (f) => `/api/checks/${f.session}/confirm`,
    payload: () => ({ because: 'Confirmed from another project entirely.' }),
  },
  // ANSWERING A ROLE REQUEST. Criterion P65: a role request is a record and belongs to one project,
  // so a starter in one project may not settle a rung asked for in another.
  {
    route: 'POST /api/roles/requests/:id/grant',
    what: 'granting a rung an agent asked its starter for',
    method: 'POST',
    url: (f) => `/api/roles/requests/${f.roleRequest}/grant`,
  },
  {
    route: 'POST /api/roles/requests/:id/refuse',
    what: 'refusing a rung an agent asked its starter for',
    method: 'POST',
    url: (f) => `/api/roles/requests/${f.roleRequest}/refuse`,
  },
  // WITHDRAWING A NEW-KEY GRANT NOBODY COLLECTED, point 9 of a decision. The same
  // record and the same project rule as the two answers above. The control is refused for not being a
  // new-key ask, which is not a 404.
  {
    route: 'POST /api/roles/requests/:id/withdraw',
    what: 'withdrawing a new-key grant nobody collected',
    method: 'POST',
    url: (f) => `/api/roles/requests/${f.roleRequest}/withdraw`,
  },
  // MAKING A TASK INTO A PACKAGE, criterion F16 point 1. The id is a task and a task belongs to one
  // project, so `recordInWorkspace` refuses one from another project by name before the body is
  // read, and nothing is written. The body is valid on purpose so the refusal is about the project
  // and not the shape; the control, in the record's own project, is refused for being a module and
  // not a task, which is not a 404.
  {
    route: 'POST /api/delegation/:recordId/package',
    what: 'make a task into a package',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/package`,
    payload: () => ({
      forTheOutside: 'Build it on its own and return a zip holding the source.',
      suits: 'own_module',
      acceptance: 'The module runs on its own and its tests pass.',
      acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
    }),
  },
  // A PERSON TAKES A PACKAGE OUTSIDE THE OFFICE, criterion F16 points 3 and 4. Same shape as the
  // packaging door above: the id is a task and a task belongs to one project, so
  // `recordInWorkspace` refuses a cross-project id by name before the body is read, and nothing is
  // written. The control, in the record's own project, is refused for being a module and not a
  // task, which is not a 404.
  {
    route: 'POST /api/delegation/:recordId/take',
    what: 'a person takes a package outside the office',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/take`,
    payload: () => ({
      who: 'ChatGPT (my own account)',
      comesBack: 'A zip holding the module and a one-page note.',
      byWhen: '2026-09-20',
    }),
  },
  // A PERSON PUTS SOMETHING BACK FROM OUTSIDE, criterion F16 point 5. Same shape as the two doors
  // above: the id is a task and a task belongs to one project, so `recordInWorkspace` refuses a
  // cross-project id by name before the body is read, and nothing is written. The control, in the
  // record's own project, is refused for being a module and not a task, which is not a 404.
  {
    route: 'POST /api/delegation/:recordId/return',
    what: 'a person puts something back from outside',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/return`,
    payload: () => ({
      fromOutside: 'ChatGPT (my own account)',
      words: 'A note from across the project line.',
    }),
  },
  // THE ONE RESPONSIBLE, OR THE PERSON, CONFIRMS A TASK FINISHED, criterion F16 point 5. It takes
  // no body; the id is still a task that belongs to one project, so `recordInWorkspace` refuses a
  // cross-project id by name and nothing is written. The control is refused for being a module.
  {
    route: 'POST /api/delegation/:recordId/confirm',
    what: 'the responsible one or the person confirms a task finished',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/confirm`,
  },
  // MAKING THE TEXT A PERSON CARRIES TO AN OUTSIDE CHAT, criterion F16 points 1 and 6. The id is a
  // task and a task belongs to one project, so `recordInWorkspace` refuses one from another project
  // by name before the package is read and before anything is recorded on the bundle. The door
  // takes no body, so the crossing request is refused for the project rather than for its shape; the
  // control, in the record's own project, is refused for being a module and not a task, which is not
  // a 404.
  {
    route: 'POST /api/delegation/:recordId/export-outside',
    what: 'make the text a person copies into an outside chat',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/export-outside`,
  },
  // THE INSIDE BRIEF'S SIX STEPS. Wave 13s, the delegation package taken inside the office. Each id is a task and a
  // task belongs to one project, so `recordInWorkspace` refuses one from another project by name before the body is
  // read, and nothing is written. Each body is valid in shape so the refusal is about the project. Each control, in
  // the record's own project, is refused with 400 for being a module that holds no inside package, which is not a 404.
  {
    route: 'POST /api/delegation/:recordId/take-inside',
    what: "take a task's package inside the office",
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/take-inside`,
  },
  {
    route: 'POST /api/delegation/:recordId/align',
    what: 'restate an inside package and its plan',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/align`,
    payload: () => ({ restated: 'Restated from across the project line.', plan: 'A plan from across the project line.' }),
  },
  {
    route: 'POST /api/delegation/:recordId/align-answer',
    what: 'answer the restatement of an inside package',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/align-answer`,
    payload: () => ({ answer: 'aligned', words: 'Answered from across the project line.' }),
  },
  {
    route: 'POST /api/delegation/:recordId/hand-back',
    what: 'hand an inside package back',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/hand-back`,
    payload: () => ({ points: [] }),
  },
  {
    route: 'POST /api/delegation/:recordId/check',
    what: 'check the hand-back of an inside package',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/check`,
    payload: () => ({ answer: 'holds', words: 'Checked from across the project line.' }),
  },
  {
    route: 'POST /api/delegation/:recordId/accept',
    what: 'accept or return the points of an inside package',
    method: 'POST',
    url: (f) => `/api/delegation/${f.module}/accept`,
    payload: () => ({ points: [{ pointId: 'a-point-from-across-the-project-line', answer: 'accepted' }] }),
  },
  // A PACKAGE'S WORKERS, read by the task's id. The id is a task and a task belongs to one project, so
  // `recordInWorkspace` refuses one from another project by name and nothing is read. The door writes
  // nothing. The control, in the record's own project, is refused for being a module and not a task,
  // which is not a 404.
  {
    route: 'GET /api/delegation/:recordId/workers',
    what: 'the workers one package was given',
    method: 'GET',
    url: (f) => `/api/delegation/${f.module}/workers`,
  },
  // A CRITICISM OF ONE RECORD, FILED AND READ. Wave 13s, the criticism record. Both read the work through
  // `recordInWorkspace`, which refuses a record from another project by name, so a criticism is never filed about, and
  // never read from, a record nobody here can see. The filing body is valid in shape so the refusal is about the
  // project. The filing control, in the note's own project, is refused 403 because the person filed the note and may
  // not criticise it independently; the reading control answers 200.
  {
    route: 'POST /api/records/:id/criticisms',
    what: 'file a criticism of one record',
    method: 'POST',
    url: (f) => `/api/records/${f.note}/criticisms`,
    payload: () => ({
      title: 'A criticism from across the project line',
      data: { tried: 'File the result.', got_in_the_way: 'The door hid the field.', did_instead: 'Kept a note.', wants_changed: 'Show the field.' },
    }),
  },
  {
    route: 'GET /api/records/:id/criticisms',
    what: 'read the criticisms of one record',
    method: 'GET',
    url: (f) => `/api/records/${f.note}/criticisms`,
  },
  // ONE RUN'S CONVERSATION COPY, READ AND PUT BACK. Wave 13s round 242, the conversation sync. Both read the run with
  // `readOneConversation`, which refuses a run from another project by name before anything is read or written. The
  // run is `conversedRun`, which carries a copy, because a run with no copy answers 404 in its own project too and
  // would leave the control proving nothing. The reading control answers 200. The copy holds no words, so the restore
  // control is refused with 409 before anything is installed on this machine.
  {
    route: 'GET /api/conversations/:run',
    what: "read one run's conversation copy",
    method: 'GET',
    url: (f) => `/api/conversations/${f.conversedRun}`,
  },
  {
    route: 'POST /api/conversations/:run/restore',
    what: "put one run's conversation copy back on this machine",
    method: 'POST',
    url: (f) => `/api/conversations/${f.conversedRun}/restore`,
    payload: () => ({}),
  },
  // ONE REVIEW OF ONE DESIGN. Wave 13s round 226, the design-first build. The id is a design, and a design belongs to one
  // project, so `recordInWorkspace` refuses one from another project by name before anything is written. The control,
  // in the record's own project, is refused for being a note and not a design, which is not a 404.
  {
    route: 'POST /api/designs/:id/reviews',
    what: 'review one design at its current revision',
    method: 'POST',
    url: (f) => `/api/designs/${f.note}/reviews`,
    payload: () => ({ designRevision: 1, verdict: 'approved', words: 'Reviewed from across the project line.' }),
  },
  // A RUN'S METHOD MARK, A DESIGN REMINDER'S JUDGEMENT AND A MISSED REMINDER. Wave 13s round 228, part 6. Each id is a
  // run or a design reminder, which belongs to one project, so `recordInWorkspace` refuses one from another project by
  // name before anything is written. Each control, in the note's own project, is refused with 400 for being a note.
  {
    route: 'POST /api/runs/:id/method-work',
    what: 'mark a run as method work',
    method: 'POST',
    url: (f) => `/api/runs/${f.note}/method-work`,
    payload: () => ({ work: 'method-work', because: 'Marked from across the project line.' }),
  },
  {
    route: 'POST /api/design-reminders/:id/judgement',
    what: 'judge one design reminder',
    method: 'POST',
    url: (f) => `/api/design-reminders/${f.note}/judgement`,
    payload: () => ({ verdict: 'right', words: 'Judged from across the project line.' }),
  },
  {
    route: 'POST /api/runs/:id/missed-design-reminder',
    what: 'file a missed design reminder for a run',
    method: 'POST',
    url: (f) => `/api/runs/${f.note}/missed-design-reminder`,
    payload: () => ({ words: 'Missed from across the project line.' }),
  },
  // WHO A REVIEW GOES TO, AND DISCARDING WHAT IT HOLDS. Wave 13r round 15. Both take a review id and both write: one
  // says where somebody else's review sends its comments, the other deletes them. The recipient control names no
  // agent record and is refused with 400. DISCARD IS LAST IN THIS TABLE ON PURPOSE: its control, in the review's own
  // project, really deletes the fixture's comments, and every probe above reads them.
  {
    route: 'POST /api/reviews/:id/recipient',
    what: 'say who a review goes to',
    method: 'POST',
    url: (f) => `/api/reviews/${f.review}/recipient`,
    payload: () => ({ recipient: { kind: 'agent', agentId: 'not-an-agent-record' } }),
  },
  {
    route: 'POST /api/reviews/:id/discard',
    what: 'delete the comments a collecting review holds',
    method: 'POST',
    url: (f) => `/api/reviews/${f.review}/discard`,
  },
]

// ============================================================================ the rest, with reasons

/**
 * Every other route with a parameter in its path, and why a cross-project id cannot be sent to it.
 *
 * NOTHING IS HERE TO GET IT OUT OF THE WAY. Two of these read a record by id from any project on
 * purpose, and "fixing" them would break the thing they were built for.
 */
/** Why a resident's doors take an agent, not a record, in their path. */
const RESIDENT_WHY =
  "The segment is an agent's id or handle, resolved by the one resolver in lib/participants.ts, not a record id. A resident and its personal space belong to the whole installation, as an agent does, so the same resident answers whichever project the header names."

/** Why a terminal's doors take the holder's name for a terminal, not a record, in their path. */
const TERMINAL_WHY =
  "The segment is the terminal holder's own name for one terminal on this machine, not a record id. The office's terminals belong to the machine and to the person, not to one project: GET /api/terminals lists every one with its project beside it, and only the person, proved, may use any of these doors (src/server/api/terminals.ts, WHO MAY DO WHAT). So the same terminal answers whichever project the header names."

/** Why a readiness checklist is reached by its id from any project, wave 13u round 13. */
const READINESS_WHY =
  'A readiness checklist waits for signers the office worked out, and they sign it from whichever project they stand in: ' +
  'the list of what waits for one signer reads every waiting checklist, whatever project it was raised in ' +
  '(theChecklistsWaitingFor in src/server/lib/readiness.ts). The header decides nothing here: the checklist keeps the ' +
  'project it was raised in, and its operation runs in that project. Who may press is checked by the door: only a signer ' +
  'signs or takes back its own signature, only the person, proved, signs as the person, and only the person or whoever ' +
  'raised it cancels. tests/an-operation-that-reaches-others-waits-for-their-signatures.test.ts, case 9, reads a checklist ' +
  'raised in default with the header naming another project and the person signs it there: both answer 200, and the ' +
  'world of default is the one stopped. An id nothing holds is answered 404 whichever project the header names.'

/** Why a request for one press is reached by its id from any project, round 45d. */
const ONE_PRESS_WHY =
  'A request for one press is put to the person, and the person answers it from any project. The popup on every page ' +
  'and Home\'s Needs you read every waiting request, whatever project it was filed in (theRequestsThatWait in ' +
  'src/server/lib/one-press.ts, read by src/server/lib/waiting.ts), so the doors that read and answer one take its id ' +
  'whichever project the header names. The header decides nothing here: the request keeps the project it was filed in, ' +
  'and an agreed act runs in that project. Who may press is checked by the door: only the person, proved, agrees or ' +
  'refuses, and only the agent that asked, by its own key, withdraws. Round 45d sent each of these doors a request filed ' +
  'in robotics with the header naming panelx: each answered 200, and the agreed act ran in robotics. An id nothing holds ' +
  'is answered 404 whichever project the header names.'

const NOT_A_RECORD_BY_ID: { route: string; why: string }[] = [
  { route: 'POST /api/agents/:id/owner', why: 'The id names an installation-wide agent registry row, not a project record.' },
  ...PRIVATE_LOGIN_ROUTES.filter(({ path }) => path.includes('/:attempt/')).map(({ method, path }) => ({
    route: `${method} /api${path}`,
    why: 'The holder creates a private per-attempt identifier in memory, bound to the proved owner, device, ' +
      'browser session and server generation. It is not a project record. The real-route probes below ' +
      'change the project without changing that binding, and refuse another device, session or generation.',
  })),

  {route: 'POST /api/office/gates/:id/met', why: 'the id names a declared office gate, whose daily counts apply across projects, rather than a record'},
  // A PLUGIN'S SWITCH (wave 13x round 14), src/server/api/plugins.ts. The id is a folder's name under plugins/, not a
  // record, and an unknown one is a 404 that names it.
  {
    route: 'POST /api/plugins/:id/switch',
    why: "the id is the name of a plugin's folder under plugins/, not a record id",
  },
  // ONE FILE OF A SWITCHED-ON PLUGIN'S BUILT PAGES (wave 13x round 15), the same file. The id is the same folder's
  // name, and the rest of the path is a file under its dist/ folder. An unknown plugin is a 404 that names it.
  {
    route: 'GET /api/plugins/:id/files/*',
    why: "the id is the name of a plugin's folder under plugins/, and the rest is a file in its dist/ folder, not a record id",
  },
  // PERMANENT RESIDENTS AND THEIR SPACES, src/server/api/residents.ts.
  {
    route: 'GET /api/residents/:agentId',
    why: RESIDENT_WHY,
  },
  {
    route: 'GET /api/residents/:agentId/space',
    why: RESIDENT_WHY,
  },
  {
    route: 'GET /api/residents/:agentId/space/file',
    why: RESIDENT_WHY,
  },
  {
    route: 'PUT /api/residents/:agentId/space/file',
    why: RESIDENT_WHY,
  },
  {
    route: 'POST /api/residents/:agentId/space/void',
    why: RESIDENT_WHY,
  },
  {
    route: 'POST /api/residents/:agentId/grants',
    why: RESIDENT_WHY,
  },
  {
    route: 'POST /api/residents/:agentId/successor',
    why: RESIDENT_WHY,
  },
  {
    route: 'POST /api/residents/:agentId/sleep',
    why: RESIDENT_WHY,
  },
  {
    route: 'POST /api/residents/:agentId/wake',
    why: RESIDENT_WHY,
  },
  {
    route: 'POST /api/residents/:agentId/sleep/postpone',
    why: RESIDENT_WHY,
  },
  {
    route: 'PUT /api/residents/:agentId/sleep-time',
    why: RESIDENT_WHY,
  },
  {
    route: 'POST /api/residents/:agentId/named',
    why: RESIDENT_WHY,
  },
  {
    route: 'POST /api/residents/:agentId/grants/:grantId/end',
    why: RESIDENT_WHY + " The second segment is a grant's own id in resident_read_grants, which is checked to be that resident's.",
  },
  {
    route: 'POST /api/residents/proposals/:id/confirm',
    why:
      'The segment is a residency proposal, read in the project it was filed in, and the decision that settles it is ' +
      'filed in that same project. A residency belongs to the whole installation, so the person answers a proposal ' +
      'from whichever project the owner\'s page is in; a proposal of another kind, or none, is refused by name.',
  },
  {
    route: 'POST /api/residents/proposals/:id/decline',
    why:
      'The segment is a residency proposal, read in the project it was filed in, and the decision that settles it is ' +
      'filed in that same project. A residency belongs to the whole installation, so the person answers a proposal ' +
      'from whichever project the owner\'s page is in; a proposal of another kind, or none, is refused by name.',
  },
  // THE CASTING TABLE. The segment is a role card's name, and the table belongs to the
  // whole installation; a project is named in ?project= or in the body, never read from the header.
  {
    route: 'GET /api/casting/for/:role',
    why:
      "The segment is a role card's name from src/config/roles.json, not a record id. The Casting table " +
      'belongs to the whole installation, and a project row is chosen by ?project=, so the answer is the same ' +
      'whichever project the header names.',
  },
  {
    route: 'GET /api/casting/:role/history',
    why: "The segment is a role card's name, for the same reason: the history is the Casting table's, whichever project the header names.",
  },
  {
    route: 'POST /api/casting/:role',
    why: "The segment is a role card's name, for the same reason. Adding a casting is the person's act on the installation's one table.",
  },
  // SEVERAL CASTINGS FOR EACH ROLE. The id is a casting row's own number in the installation's
  // one table, never a record id, and no project header decides which row it names.
  {
    route: 'PATCH /api/casting/rows/:id',
    why:
      "The segment is a casting's own id, a whole number in the casting_rows table, not a record id. The Casting table " +
      'belongs to the whole installation, so the same casting answers whichever project the header names.',
  },
  {
    route: 'DELETE /api/casting/rows/:id',
    why: "The segment is a casting's own id, for the same reason: removing a casting is the person's act on the installation's one table.",
  },
  {
    route: 'POST /api/casting/rows/:id/mark',
    why: "The segment is a casting's own id, for the same reason: moving the mark is the person's act on the installation's one table.",
  },
  { route: 'GET /api/casting/rows/:id/selection', why: 'The id names an installation-wide Casting row. Its content revision binds the native selection; it is not a record id.' },
  { route: 'POST /api/casting/rows/:id/hold', why: 'The id names an installation-wide Casting row. The refusal additionally binds a run in the request project and its selected row revision.' },
  // THE PROVIDER TABLE beside the Casting table. The id is a provider's own id, given by its writer, never a record id.
  {
    route: 'GET /api/casting/providers/:id',
    why:
      "The segment is a provider's own id, lowercase letters, digits and dashes in the providers table, not a record " +
      'id. The provider table belongs to the whole installation, so the same provider answers whichever project the header names.',
  },
  {
    route: 'PATCH /api/casting/providers/:id',
    why: "The segment is a provider's own id, for the same reason: changing a provider is a write to the installation's one table.",
  },
  {
    route: 'DELETE /api/casting/providers/:id',
    why: "The segment is a provider's own id, for the same reason: removing a provider is a write to the installation's one table.",
  },
  // THE CASTING LABELS. The id is a label's own number in the casting_labels table, never a record id. The labels are one
  // list for the whole installation, as the Casting table is.
  {
    route: 'PATCH /api/casting/labels/:id',
    why:
      "The segment is a Casting label's own id, a whole number in the casting_labels table, not a record id. The labels " +
      'belong to the whole installation, so the same label answers whichever project the header names.',
  },
  {
    route: 'DELETE /api/casting/labels/:id',
    why: "The segment is a Casting label's own id, for the same reason: removing a label is a write to the installation's one list.",
  },
  {
    route: 'GET /api/casting/labels/:id/history',
    why: "The segment is a Casting label's own id, for the same reason: a label's history is the installation's, whichever project the header names.",
  },
  {
    route: 'GET /api/toolset/:slug',
    why:
      "The parameter is a tool's SLUG, the short name in its manual page's address, and not a record id. It is " +
      'looked up only among the live tool records of the project the header names (readOneManualPage in ' +
      "src/server/lib/toolset.ts), so another project's tool is a 404 that names the slug, and no row of any other " +
      'project is reached.',
  },
  { route: 'GET /api/office-regulations/chapters/:n/history', why: 'The parameter is a shipped chapter number, not a record id. Regulations are office-wide across every project.' },
  {
    route: 'GET /api/families/:name',
    why:
      'The parameter is a FAMILY NAME derived from the first path segment, not a record id: the answer is ' +
      "read out of the live route table — GET /api/families over the doors' own paths — and no row of any " +
      'project is reached. A name that is not a family is answered 404 whichever project the header names, ' +
      'and it carries the list of families that do exist. The owner\'s decision: families are derived ' +
      'from the path and never declared.',
  },
  {
    route: 'POST /api/agents/:id/start-a-new-agent',
    why:
      'The id in the path is a durable agent by its REGISTRY ROW, not a record: an agent belongs to no project, ' +
      'because the same agent is in every project on this machine. And what it acts on is deliberately ' +
      'cross-project, for the reason GET /api/handles/:handle/waiting below is: the chat is the owner\'s across every ' +
      'project and draws messages from all of them, so a press made while the owner is looking at a conversation must ' +
      'reach whatever is waiting for that agent wherever it was filed. Standing in one project and being told ' +
      'nothing is waiting, while looking at the message that is, would be the project switcher deciding what the owner ' +
      'can answer. Criteria M78 and M80. Each message it moves is filed in the project its own was filed in, and ' +
      'an id no registry holds is answered 404 whichever project the header names.',
  },
  {
    route: 'GET /api/agents/:id/start-a-new-agent',
    why:
      'The read the chat makes before it offers the press above: whether that press would carry anything for this ' +
      'agent. It reads exactly what the press reads, so it is cross-project for the same reason, and its id is the ' +
      'same registry row. An id no registry holds is answered 404 whichever project the header names. Problem ' +
      'hqbovBMnTu-z.',
  },
  {
    route: 'POST /api/agents/:agent/next-round',
    why:
      'The segment names a durable agent by its REGISTRY ROW, by id or handle, not a record: an agent belongs to no ' +
      'project, like the start-a-new-agent door above. What the door then reads is one project only: the run it ' +
      'continues is the agent\'s last sandbox run IN THE PROJECT THE HEADER NAMES (theLastSandboxRunOf in ' +
      'src/server/lib/next-round.ts), and with none there it refuses 409 and writes nothing. An agent no registry ' +
      'holds is answered 404 whichever project the header names. Wave 13j round loop-2, plan 4uSoJQ5RySTw part ' +
      '"doors", D1.',
  },
  {
    route: 'POST /api/agents/:agent/hand-run',
    why:
      'The agent is a global registry reference, as at the worker-run door; askedBy is a run in the body and the shared live-run check requires this workspace. The hand-start criterion sends an asking run from another workspace and proves refusal without a write.',
  },
  {
    route: 'POST /api/agents/:agent/worker-run',
    why:
      'The segment names a durable agent, the worker, by its REGISTRY ROW, by id or handle, not a record: an agent ' +
      'belongs to no project, like the next-round door above. What the door then reads is one project only: the ' +
      "supervisor's run named in x-mole-office-session must be a running run of the supervisor IN THE PROJECT THE " +
      'HEADER NAMES (theSupervisorsRun in src/server/lib/worker-runs.ts), and otherwise it refuses 409 and writes ' +
      'nothing. An agent no registry holds is answered 404 whichever project the header names. Wave 13j round loop-3.',
  },
  // THE WORKER RUN'S TWO WORKER DOORS, wave 13j round loop-3, src/server/api/worker-runs.ts. They were in REFUSES until
  // wave 13n round BZ, when the message worker came to serve every project on the office's list.
  ...['POST /api/worker/worker-runs/:run/starting', 'POST /api/worker/worker-runs/:run/ended'].map((route) => ({
    route,
    why:
      "The message worker serves every project on the office's list, so this door takes a supervisor's run of any of " +
      "them, whatever project the header names. The office's key is checked first, before the run is read: any other " +
      'caller gets one 403, the same for a run in another project, a run off the list and an id nothing holds, so it ' +
      'learns nothing about the run. For the message worker the run is read in the project it is filed in, and the door ' +
      "works there. A run filed in a project that is not on the office's list is refused 409 in words, and an id nothing " +
      'holds is answered 404. A refusal writes nothing. tests/a-worker-run-asked-in-another-project-is-started.test.ts ' +
      'proves each of these. This route was in REFUSES until that round.',
  })),
  // AN AGENT'S HANDOVER, wave 13k round 46, src/server/api/handovers.ts.
  ...['GET /api/agents/:id/handover', 'PUT /api/agents/:id/handover'].map((route) => ({
    route,
    why:
      'The id in the path is a durable agent by its REGISTRY ROW or its handle, not a record: an agent belongs to no ' +
      'project. The handovers themselves are kept per project, and both doors read and write only the rows of the ' +
      'project the header names, so another project\'s handover is never reached. An id no registry holds is ' +
      'answered 404 whichever project the header names.',
  })),
  // AN AGENT MOVED TO ANOTHER PROJECT, wave 13u round 184, src/server/api/agent-move.ts.
  ...['GET /api/agents/:id/project-move', 'POST /api/agents/:id/project-move'].map((route) => ({
    route,
    why:
      'The id in the path is a durable agent by its REGISTRY ROW or its handle, not a record: an agent belongs to no ' +
      "project. Both doors read and move only the agent's records in the project the header names, its record there " +
      'and its runs filed there, to the project the body or query names. Where nothing of the agent\'s in the header\'s ' +
      'project can move, a preview answers with nothing moving and names the projects its record is in, and a press ' +
      "is refused 404; nothing is written. An id no registry holds is answered 404 whichever project the header " +
      'names.',
  })),
  // WHO ANSWERS FOR AN AGENT, wave 13u round 186, src/server/api/agent-move.ts.
  ...['GET /api/agents/:id/starter', 'GET /api/agents/:id/starter-preview', 'POST /api/agents/:id/starter'].map((route) => ({
    route,
    why:
      'The id in the path is a durable agent by its REGISTRY ROW or its handle, not a record: an agent belongs to no ' +
      "project. The doors read and change the starter on the agent's registry row, and the press writes the same " +
      "starter onto the agent's record in every project, since the row and the records name one starter. An id no " +
      "registry holds is answered 404 whichever project the header names, and a refusal writes nothing. The owner's " +
      'decision zuHll_ClLFe5.',
  })),
  ...[
    'GET /api/agents/:handle/notebook',
    'POST /api/agents/:handle/notebook/entries',
    'PATCH /api/agents/:handle/notebook/entries/:entryId',
    'DELETE /api/agents/:handle/notebook/entries/:entryId',
  ].map((route) => ({
    route,
    why:
      'The id in the path is a durable agent by its HANDLE, not a record: an agent belongs to no project, ' +
      'because the same agent is in every project on this machine. What these four read and write IS one ' +
      "project's record — the notebook is chosen by `theNotebookFor(workspaceOf(req), handle)`, exactly as " +
      'POST /api/records chooses a project by the same header — so there is no cross-project record id to send ' +
      'them: sending another project\'s notebook id would not reach them, because they take no record id at ' +
      'all. A handle nothing is registered as is answered 404 whichever project the header names, and an entry ' +
      'id this project\'s notebook does not hold is answered 404 naming what it does hold. Criteria N1 to N4.',
  })),
  {
    route: 'GET /api/handles/:handle/waiting',
    why:
      'The id in the path is a durable agent by its HANDLE, not a record: an agent belongs to no ' +
      'project, because the same agent is in every project on this machine. And what it answers is ' +
      'deliberately cross-project, criteria M74 and M76: a session holding a handle answers for an ' +
      'agent the whole chat writes to, and the chat is the owner\'s across every project, so a message to ' +
      'that agent filed anywhere is a message that session has to be given. It is not the message ' +
      'worker queue, which IS one project\'s by design. There is no cross-project id to send it: a ' +
      'handle nothing is registered as is answered 404 whichever project the header names.',
  },
  {
    route: 'GET /api/messages/:id',
    why:
      'A MESSAGE BELONGS TO NO PROJECT, since the owner\'s decision of 29 September 2026. Every message is kept ' +
      'in the office\'s message centre, whatever project it was written in, and keeps that project as a mark. So a message ' +
      'is reached from any project, and there is no message in another project to refuse. Who may read or act on it is ' +
      'the reader rule, which tests/who-reads-a-message-in-the-message-centre.test.ts proves. ' +
      'This route was in REFUSES until then.',
  },
  {
    route: 'POST /api/messages/:id/start-an-agent',
    why:
      'A MESSAGE BELONGS TO NO PROJECT, since the owner\'s decision of 29 September 2026. Every message is kept ' +
      'in the office\'s message centre, whatever project it was written in, and keeps that project as a mark. So a message ' +
      'is reached from any project, and there is no message in another project to refuse. Who may read or act on it is ' +
      'the reader rule, which tests/who-reads-a-message-in-the-message-centre.test.ts proves. ' +
      'This route was in REFUSES until then.',
  },
  {
    route: 'POST /api/worker/messages/:id/taken',
    why:
      'A MESSAGE BELONGS TO NO PROJECT, since the owner\'s decision of 29 September 2026. Every message is kept ' +
      'in the office\'s message centre, whatever project it was written in, and keeps that project as a mark. So a message ' +
      'is reached from any project, and there is no message in another project to refuse. Who may read or act on it is ' +
      'the reader rule, which tests/who-reads-a-message-in-the-message-centre.test.ts proves. ' +
      'This route was in REFUSES until then.',
  },
  {
    route: 'POST /api/worker/messages/:id/needs-no-run',
    why:
      'A MESSAGE BELONGS TO NO PROJECT, since the owner\'s decision of 29 September 2026. Every message is kept ' +
      'in the office\'s message centre, whatever project it was written in, and keeps that project as a mark. So a message ' +
      'is reached from any project, and there is no message in another project to refuse. Who may read or act on it is ' +
      'the reader rule, which tests/who-reads-a-message-in-the-message-centre.test.ts proves. ' +
      'This route was in REFUSES until then.',
  },
  {
    route: 'POST /api/worker/messages/:id/held',
    why:
      'A MESSAGE BELONGS TO NO PROJECT, since the owner\'s decision of 29 September 2026. Every message is kept ' +
      'in the office\'s message centre, whatever project it was written in, and keeps that project as a mark. So a message ' +
      'is reached from any project, and there is no message in another project to refuse. Who may read or act on it is ' +
      'the reader rule, which tests/who-reads-a-message-in-the-message-centre.test.ts proves. ' +
      'This route was in REFUSES until then.',
  },
  {
    route: 'POST /api/worker/messages/:id/answered',
    why:
      'A MESSAGE BELONGS TO NO PROJECT, since the owner\'s decision of 29 September 2026. Every message is kept ' +
      'in the office\'s message centre, whatever project it was written in, and keeps that project as a mark. So a message ' +
      'is reached from any project, and there is no message in another project to refuse. Who may read or act on it is ' +
      'the reader rule, which tests/who-reads-a-message-in-the-message-centre.test.ts proves. ' +
      'This route was in REFUSES until then.',
  },
  {
    route: 'POST /api/messages/:id/mark',
    why:
      'THIS ROUTE DELIBERATELY CROSSES, since criterion M76 and the owner\'s finding of 7 September 2026. It was in ' +
      'REFUSES above until then. A delivery mark is about one message and one recipient: `message_delivery` has ' +
      'no workspace column and never has. The chat is the owner\'s across every project and draws messages from all of ' +
      'them, so standing in Mole Office the owner could not mark read a message filed in Robotics and it stayed unread ' +
      'after the owner had read it. The project the reader stands in is not part of the fact being written. ' +
      'Every message belongs to no project, so GET /api/messages/:id crosses too. Criterion M76.',
  },
  {
    route: 'POST /api/messages/:id/not-now',
    why:
      'THIS ROUTE CROSSES FOR THE REASON THE MARK DOOR ABOVE CROSSES. Not now on a lead offer writes one moment on one ' +
      'recipient\'s `message_delivery` row, which has no workspace column. Every message ' +
      'belongs to no project, so there is no message in another project to refuse. Who may press it is the reader rule ' +
      'and a person who has a delivery of the message, which ' +
      'tests/not-now-keeps-a-lead-unread-and-the-offer-comes-back.test.ts proves.',
  },
  {
    route: 'POST /api/messages/:id/remind-me-later',
    why:
      'THIS ROUTE CROSSES FOR THE REASON NOT NOW ABOVE CROSSES. Remind me later writes one time on one recipient\'s ' +
      '`message_delivery` row, which has no workspace column. Every message belongs to no ' +
      'project, so there is no message in another project to refuse. Only the person, proved, may press it, the reader ' +
      'rule is asked first, and a person with no delivery of the message is refused 404. Round ' +
      '45d pressed it with the header naming panelx on a message filed in robotics: it answered 200 and wrote the time.',
  },
  {
    route: 'POST /api/messages/:id/mark-broken',
    why:
      'THIS ROUTE CROSSES FOR THE REASON REMIND ME LATER ABOVE CROSSES. "Mark broken" is pressed on an agent\'s reply ' +
      'to a message the person marked, and every message belongs ' +
      'to no project, so there is no message in another project to refuse. Only the person, proved, may press it, and ' +
      'the reader rule is asked of both messages first. The problem it files goes in the ' +
      'project the person stands in: tests/the-intent-mark-reaches-the-agent-and-only-the-person-sets-it.test.ts ' +
      'presses it with the header naming a second project and reads the problem there.',
  },
  // SIGNING PACKAGES: one receipt, reached from whichever project the person stands in.
  { route: 'GET /api/signing-packages/:id', why: 'A signing package is addressed to the person across projects; it keeps the project its secretary brought it in and runs each act there. Only the proved person signs or refuses, and only its proved secretary withdraws; an unknown id answers 404. Case 1 in tests/a-signing-package-is-carried-out-only-on-the-persons-signature.test.ts reads and signs from another project.' },
  { route: 'POST /api/signing-packages/:id/sign', why: 'A signing package is addressed to the person across projects; it keeps the project its secretary brought it in and runs each act there. Only the proved person signs or refuses, and only its proved secretary withdraws; an unknown id answers 404. Case 1 in tests/a-signing-package-is-carried-out-only-on-the-persons-signature.test.ts reads and signs from another project.' },
  { route: 'POST /api/signing-packages/:id/refuse', why: 'A signing package is addressed to the person across projects; it keeps the project its secretary brought it in and runs each act there. Only the proved person signs or refuses, and only its proved secretary withdraws; an unknown id answers 404. Case 1 in tests/a-signing-package-is-carried-out-only-on-the-persons-signature.test.ts reads and signs from another project.' },
  { route: 'POST /api/signing-packages/:id/withdraw', why: 'A signing package is addressed to the person across projects; it keeps the project its secretary brought it in and runs each act there. Only the proved person signs or refuses, and only its proved secretary withdraws; an unknown id answers 404. Case 1 in tests/a-signing-package-is-carried-out-only-on-the-persons-signature.test.ts reads and signs from another project.' },
  { route: 'POST /api/signing-packages/:id/items/:itemId/carry-out', why: 'A held item belongs to the signing package and runs in the project the package names, whichever project the caller stands in. Only the named agent, proved by its own key or its run’s key, carries it out; an unknown package id answers 404. Case 5 in tests/a-held-signing-package-item-is-carried-out-once-by-the-named-agent.test.ts presses from another project and checks the unknown id.' },
  { route: 'POST /api/signing-packages/:id/take-back', why: 'A package’s remaining hold belongs to its signature across projects. Only the proved person takes it back, whichever project the caller stands in; an unknown package id answers 404. Case 8 in tests/a-held-signing-package-item-is-carried-out-once-by-the-named-agent.test.ts presses from another project and checks the unknown id.' },
  { route: 'POST /api/signing-packages/:id/give-back', why: 'A package’s remaining hold belongs to its named agent across projects. Only that agent, proved by its own key or its run’s key, gives it back, whichever project the caller stands in; an unknown package id answers 404. Case 8 in tests/a-held-signing-package-item-is-carried-out-once-by-the-named-agent.test.ts presses from another project and checks the unknown id.' },
  // A READINESS CHECKLIST, src/server/api/readiness.ts.
  {
    route: 'GET /api/readiness/:id',
    why: READINESS_WHY,
  },
  {
    route: 'POST /api/readiness/:id/sign',
    why: READINESS_WHY,
  },
  {
    route: 'POST /api/readiness/:id/sign-as-the-person',
    why: READINESS_WHY,
  },
  {
    route: 'POST /api/readiness/:id/withdraw',
    why: READINESS_WHY,
  },
  {
    route: 'POST /api/readiness/:id/cancel',
    why: READINESS_WHY,
  },
  // A REQUEST FOR ONE PRESS, src/server/api/one-press.ts.
  {
    route: 'GET /api/one-press/:id',
    why: ONE_PRESS_WHY,
  },
  {
    route: 'POST /api/one-press/:id/agree',
    why: ONE_PRESS_WHY,
  },
  {
    route: 'POST /api/one-press/:id/refuse',
    why: ONE_PRESS_WHY,
  },
  {
    route: 'POST /api/one-press/:id/withdraw',
    why: ONE_PRESS_WHY,
  },
  {
    route: 'GET /api/office/visitors/:id',
    why:
      'The id in the path is a visiting agent\'s CREDENTIAL, not a record. A credential is held against the ' +
      'installation rather than against one project — an agent on another machine does not visit one project — ' +
      'and it lives in `visitor_credentials`, which carries no workspace column. There is no cross-project id to ' +
      'send it: an id nothing here holds is answered 404 whichever project the header names. Criterion P24.',
  },
  {
    route: 'POST /api/office/trusted-machines/:id/remove',
    why:
      'A machine this office trusts belongs to the INSTALLATION and to no project, like the credentials below ' +
      'it: a machine is not trusted for one project\'s work and refused for another. The header names no ' +
      'project this act reads, and the row is found by its own id whichever one is sent. Criterion P73.',
  },
  {
    route: 'POST /api/office/held-keys/:id/revoke',
    why:
      'The id in the path is a `held_keys` row id, not a record id. A key belongs to the INSTALLATION and to no ' +
      'project — `held_keys` carries no workspace column, for the same reason `trusted_machines` above and ' +
      '`visitor_credentials` do not — so there is no cross-project record id to send it. MEASURED on 13 September ' +
      '2026: a real held-key id registered for a robotics agent answered 200 and the key really was revoked while ' +
      'the header said panelx, and a record id answered 404 saying no live key has that id and naming no project, ' +
      'so it does not have the shape REFUSES requires. The act is the owner\'s own press at the Embassy and ' +
      '`onlyThePersonMay` refuses every agent before the id is looked up. Criterion D3.',
  },
  {
    route: 'POST /api/office/held-keys/:id/revoke/undo',
    why:
      'The id names an office-wide held_keys row, not a record in one project. Undo requires the same ' +
      'owner-only proof as revoke and checks the Embassy revocation and its time limit before changing the key.',
  },
  {
    route: 'POST /api/participants/agent/:id/work-area',
    why:
      'The path names an installation-wide agent handle, not a record id. The work-area door selects that ' +
      'agent’s record inside the requested project and refuses when no such record exists; it cannot name ' +
      'or update an agent record from another project through this handle.',
  },
  {
    route: 'POST /api/participants/agent/:id/files-area',
    why:
      'The path names an installation-wide agent handle, not a record id, as the work-area door beside it does. ' +
      'The files-area door keeps the area on that agent’s record inside the requested project and refuses when ' +
      'no such record exists, so it cannot name or change an agent record in another project through this ' +
      'handle. Acceptance finding 52.',
  },
  {
    route: 'POST /api/participants/agent/:id/start-folder',
    why:
      'The path names an installation-wide agent handle or its registry id, not a record id, as the work-area ' +
      'and files-area doors above it do. `changeStartFolder` resolves the arriving reference the one way, then ' +
      'writes the folder on that agent’s record inside the requested project through `recordForAgentIn`, and ' +
      'refuses in words when the agent has no record there, so it cannot name or change an agent record in ' +
      'another project through this path. Wave 10, the start-folder piece: this entry is the wave’s own, ' +
      'because the route and this file came from two different workers.',
  },
  {
    route: 'POST /api/participants/agent/:id/broadcast-times',
    why:
      'The path names an installation-wide agent handle or its registry id, not a record id. A secretary has one ' +
      'broadcast schedule for the whole installation, held on its first-filed live agent record whatever project that is in ' +
      '(`theAgentRecordOf` in lib/broadcast.ts), so the door writes there on purpose and not in the requested ' +
      'project. It changes only the times on that schedule. Wave 13p round 27.',
  },
  // WHO MAY SKIP A SECRETARY'S NEXT BROADCAST, as the owner decided.
  {
    route: 'POST /api/participants/agent/:id/broadcast-skip',
    why:
      'The path names an installation-wide agent handle or its registry id, not a record id, as the broadcast-times ' +
      'door above it does. It reads that secretary’s one installation-wide schedule to check the slot, changes ' +
      'nothing on any agent record, and files its message in the requested project. Only the secretary itself or ' +
      'the person may use it. Wave 13p round 29, by the owner’s decision.',
  },
  {
    route: 'GET /api/participants/agent/:id/broadcast-settings',
    why:
      'The path names an installation-wide agent handle or its registry id, not a record id, as the broadcast-times ' +
      'door above it does. It reads that secretary’s one installation-wide schedule, wherever its agent record is ' +
      'filed, and answers its four settings; it reads no record of the requested project by id. Wave 14d, package BR.',
  },
  {
    route: 'POST /api/participants/agent/:id/broadcast-settings',
    why:
      'The path names an installation-wide agent handle or its registry id, not a record id, as the broadcast-times ' +
      'door above it does. It writes whether the secretary broadcasts, its reminder’s lead and its reminder’s words ' +
      'on that secretary’s one installation-wide schedule (`theAgentRecordOf` in lib/broadcast.ts), so it writes ' +
      'there on purpose and not in the requested project. It changes nothing else on that record. Wave 14d, package BR.',
  },
  {
    route: 'POST /api/participants/agent/:id/new-key',
    why:
      'A registry row and its keys belong to the installation, like the retire door beside it: an agent is not ' +
      'registered in one project, and a key proves the agent in every project. The header names only the project ' +
      'the record of the re-key is filed in. Problem x8ktQfHS5yGr.',
  },
  {
    route: 'POST /api/participants/agent/:id/retire',
    why:
      'A registry row belongs to the installation, like every other participant route beside it: an agent is ' +
      'not registered in one project. The header names no project this act reads. Problem zyCcJYCLsAe7.',
  },
  {
    route: 'GET /api/participants/agent/:id/reads-releases-from-the-check',
    why:
      'The path names an agent by its registry id or handle, not a record id. Whether an agent reads releases ' +
      'from the check is a column on its registry row, which belongs to the installation like the retire door ' +
      'beside it. The header names no project this read reaches. Wave 13y round 9, option B of message HeBxwj6QRGjS.',
  },
  {
    route: 'POST /api/participants/agent/:id/reads-releases-from-the-check',
    why:
      'The same registry row as the read above. The door writes only that column, and only for the owner or the ' +
      'agent itself by its own key, so no record of any project is named or changed through this id.',
  },
  // AN AGENT'S NEW NAME, item 42 of wave 13s, src/server/api/agent-renames.ts. A rename is of an agent, and the agent
  // registry is shared by every project, so a row of agent_renames belongs to no project (its `noProjectBecause`).
  {
    route: 'POST /api/participants/agent/:id/renames',
    why:
      'The path names an agent by its registry id or handle, not a record id, as the other participant doors ' +
      'beside it do. The door writes one row of agent_renames, which belongs to no project, and files the line ' +
      'that tells the approver in the requested project. No record of another project is named or changed.',
  },
  {
    route: 'GET /api/participants/agent/:id/renames',
    why:
      'The same agent, named the same way. The read answers that agent’s rows of agent_renames, which belong to ' +
      'no project, with each participant’s name. It names the line that told the approver by its id only, and ' +
      'reads nothing of what that line says.',
  },
  {
    route: 'POST /api/renames/:id/approve',
    why:
      'The id names a row of agent_renames, not a record: a rename is of an agent, and the agent registry is ' +
      'shared by every project. The door changes that row and the name on the agent’s registry row, and marks ' +
      'read the one line that told the person of this rename, in whatever project that line was filed in, ' +
      'because the line asks about this rename and nothing else. An id nothing answers to is refused 404 ' +
      'whichever project the header names.',
  },
  {
    route: 'POST /api/renames/:id/refuse',
    why:
      'The same row as the approve door above, named the same way. The door changes only that row, leaves the ' +
      'name as it is, and marks read the line that told the person, as the approve door does.',
  },
  {
    route: 'GET /api/restore/:handle',
    why:
      'The path names a durable agent by its handle, not a record: an agent belongs to the installation, because ' +
      'the same agent is in every project on this machine. The project the reply answers about comes from the ' +
      'workspace header or from a working directory the caller gave, and no row of another project is reached by ' +
      'the handle itself. A handle nothing is registered as is answered 404 whichever project the header names. ' +
      'F15 point 4.',
  },
  {
    route: 'POST /api/records/:id/choose-again',
    why:
      'It writes the new decision where the OLD one is, which is what `recordInWorkspace` in the route asks ' +
      'first: a decision that landed in whichever project the reader happened to stand in would separate a fork ' +
      'from its answer. So a cross-project id is refused there, in the same words a promotion is refused in, ' +
      'and this route adds no second rule. Criterion M83.',
  },
  {
    route: 'POST /api/office/visitors/:id/confirm',
    why:
      'The same credential, and the same reason. The act is the owner\'s own press at the Embassy and it is ' +
      'refused to every agent by the route itself; which project the header names decides nothing about it. ' +
      'Criterion P25.',
  },
  {
    route: 'POST /api/office/visitors/:id/end',
    why: 'The same credential and the same reason as the confirm above. Criterion P29.',
  },
  {
    route: 'POST /api/roles/elevation/:handle',
    why:
      'The id in the path is a durable agent by its handle, not a record: an agent belongs to no project, because ' +
      'the same agent is in every project on this machine, and the grant it writes is on the installation\'s ' +
      'registry row for exactly that reason. There is no cross-project id to send it. A handle nothing is ' +
      'registered as is answered 404 with where the registries are, whichever project the header names. ' +
      'Criterion P59.',
  },
  {
    route: 'DELETE /api/roles/elevation/:handle',
    why:
      'The same handle, and the same reason: it ends what the route above granted, and what it ends is on the ' +
      'agent\'s registry row rather than in any one project.',
  },
  {
    route: 'POST /api/roles/raises/:id/end',
    why:
      'The id in the path is a raise, not a record: a grant held on an agent\'s registry row, which belongs to no ' +
      'project, for the reason the two routes above give. The raised agent ends its own raise here, ' +
      'whichever project the header names. An id no raise has is answered 404.',
  },
  {
    route: 'POST /api/roles/card/:handle',
    why:
      'The same handle again: the id in the path is a durable agent, which belongs to no project, and the card ' +
      'it writes lands on that agent\'s own record and on the installation\'s registry row. There is no ' +
      'cross-project id to send it. Criterion P64.',
  },
  {
    route: 'GET /api/portraits/:set/:of',
    why:
      'The two segments name a FOLDER of pictures on this machine, not a record: a role\'s three live in ' +
      'public/portraits/<role>/ and a person\'s own in data/portraits/custom/<who>/, and neither belongs to a ' +
      'project because the same folders serve every project on this machine. There is no cross-project id to ' +
      'send it. A folder with nothing in it answers with an empty list and a sentence saying so, whichever ' +
      'project the header names. Criterion P52.',
  },
  {
    route: 'PATCH /api/workspaces/:id',
    why:
      'The id in the path IS a project, not a record in one, so "an id from another project" is what this route ' +
      'is for: the workspace header says which project the request is working in and the address says which ' +
      'project is being renamed, and the two are different questions. Renaming a project the caller is not ' +
      'reading is a legitimate request and tests/workspace-rename.test.ts carries it out. An id naming no ' +
      'workspace is answered 404 with the ones that exist, whichever project the header names.',
  },
  {
    route: 'POST /api/office/module-reminder-secretaries/:project',
    why:
      'The id in the path IS a project, not a record in one, as with renaming a project above. Who is reminded about ' +
      'a project\'s modules is an office setting kept on each project\'s row, and the Settings page sets it for every ' +
      'project from whichever project is open, so a project other than the one the header names is what this route ' +
      'is for. A project id naming no project is answered 404 with a coded refusal, whichever project the header ' +
      'names (wave 13p round 29, tests/a-projects-module-reminder-secretary-is-set-here-or-by-the-env-line.test.ts).',
  },
  {
    route: 'GET /api/projects/:project/master-pipeline',
    why:
      'The id in the path IS a project, not a record in one, as with the module reminder secretaries above. Which ' +
      'pipeline is a project\'s master is kept on the project\'s row, and an agent may read it for any project. A ' +
      'project id naming no project is answered 404 with a coded refusal, whichever project the header names ' +
      '(wave 13u round 216, tests/a-project-names-its-master-pipeline.test.ts).',
  },
  {
    route: 'PUT /api/projects/:project/master-pipeline',
    why:
      'The id in the path IS a project, as in the read above. A secretary or the owner marks a project\'s master ' +
      'from whichever project is open, and the pipeline must be in the project the path names, which the writer ' +
      'checks and refuses with a coded 400 (wave 13u round 216, tests/a-project-names-its-master-pipeline.test.ts).',
  },
  {
    route: 'GET /api/projects/:project/board',
    why:
      'The id in the path IS a project, as in the two above. The board is read from the project\'s own master ' +
      'pipeline, and a project id naming no project is answered 404 with the master reader\'s coded refusal, ' +
      'whichever project the header names (wave 13u round 216, tests/the-project-board-counts-only-runs-that-act.test.ts).',
  },
  {
    route: 'GET /api/messages/between/:pair',
    why:
      'The id in the path is two durable agents, not a record: an agent belongs to no project, because the same ' +
      'agent is in every project on this machine. There is no cross-project id to send it. It answers about the ' +
      'messages of the project the request names, so an id from another project would be answered with nothing ' +
      'said rather than with somebody else\'s conversation.',
  },
  {
    route: 'GET /api/presence/:kind/:id',
    why:
      'The two ids in the path are a participant, not a record: a person and a durable agent belong to no project, ' +
      'because the same person and the same agent are in every project on this machine. There is no cross-project ' +
      'id to send it. A kind and id nothing answers to is not refused either — it is the red answer, which is ' +
      'exactly what "there is nobody by that name" means.',
  },
  // --------------------------------------------------------- WHO IS ANSWERING AS A DURABLE AGENT
  //
  // THE HANDLE IN THE PATH IS AN AGENT, NOT A RECORD. A durable agent belongs to no project, because
  // the same agent is in every project on this machine — `WORKSPACE_COLUMN` in the schema answers
  // null for `agents` and for `handle_holds`, which is this same fact said where the schema says it.
  // So there is no cross-project handle to send any of the four: a handle nothing answers to is
  // refused 404 whichever project the caller names, and one that answers means the same agent to
  // every project. Criteria H1 to H4 of design/messages/ACCEPTANCE.md section 10.
  {
    route: 'GET /api/handles/:handle',
    why:
      'The handle in the path is a durable agent, not a record. The same agent is in every project on this ' +
      'machine, so there is no cross-project handle to send; one nothing answers to is refused by name.',
  },
  // THE MODEL AN AGENT'S RUNS GET, criterion U2. The segment is a durable agent, resolved as an arriving
  // reference, for the reason the handle routes around this say: the same agent is in every project.
  {
    route: 'GET /api/office/run-models/agent/:agent',
    why:
      'The segment in the path is a durable agent, not a record. Its model is kept beside its runtime on its ' +
      'own record, read the one way the registry reads its runtime, so it is the same in every project.',
  },
  {
    route: 'POST /api/office/run-models/agent/:agent',
    why:
      'The segment in the path is a durable agent, for the same reason. Setting its model is the person\'s ' +
      'act and says the same thing whichever project the caller names.',
  },
  {
    route: 'GET /api/office/run-models/for/:agent',
    why:
      'The segment in the path is a durable agent, for the same reason. Which model one of its runs gets is ' +
      'read from the installation\'s one store and the agent\'s own record, whichever project the caller names.',
  },
  {
    route: 'POST /api/handles/:handle/hold',
    why:
      'The handle in the path is a durable agent, for the same reason as the route above. Which session is ' +
      'answering as it is a fact about the agent and the machine rather than about any project.',
  },
  {
    route: 'POST /api/handles/:handle/beat',
    why:
      'The handle in the path is a durable agent, for the same reason. A session saying it is still there says ' +
      'the same thing whichever project the caller names.',
  },
  {
    route: 'GET /api/handles/:handle/knows',
    why:
      'The handle in the path is a durable agent, for the same reason. What it knows is its notes, which are a ' +
      'folder on this machine, and the records it wrote in the project the request names — so the project ' +
      'boundary is on the records inside the answer, not on the handle.',
  },
  {
    route: 'GET /api/handles/:handle/running-workers',
    why:
      'The handle in the path is a durable agent, for the same reason. Which agents it started is read from the ' +
      'registry, which belongs to no project, and which of them have a run going is read from the runs of the ' +
      'project the request names. So the project boundary is on the runs inside the answer, not on the handle. ' +
      'The session in the QUERY is read with the refusal the children door uses, so a session filed in another ' +
      'project is refused 404 there rather than here.',
  },
  {
    route: 'POST /api/handles/:handle/took',
    why:
      'The handle in the path is a durable agent, for the same reason. The message id in the BODY is checked ' +
      'against the project the request names, as every message read is, so a message from another project is ' +
      'refused there rather than here.',
  },
  {
    route: 'POST /api/handles/:handle/process',
    why:
      'The handle in the path is a durable agent, for the same reason. The session record id is in the BODY ' +
      'and is read with `recordInWorkspace`, so a record from another project is refused there rather than ' +
      'here — and the route is kept on this machine anyway, which tests/local-only-routes.test.ts drives.',
  },
  {
    route: 'POST /api/handles/:handle/release',
    why:
      'The handle in the path is a durable agent, for the same reason. A session letting go of a handle lets go ' +
      'of it everywhere, because the agent is the same agent everywhere.',
  },
  // ----------------------------------------------------------------------------- THE OFFICE
  //
  // A WORLD AND A VISIT BELONG TO NO PROJECT, and there is nothing here for a project boundary to
  // hold. A world holds every project it has, and a visit is about two worlds rather than about any
  // project inside either — `WORKSPACE_COLUMN` in the schema answers null for both tables, which is
  // the same fact this list is about, said where the schema says it.
  //
  // SO THERE IS NO CROSS-PROJECT ID TO SEND ANY OF THE THREE. An id nothing answers to is refused
  // 404 whichever project the caller names, and an id that answers means the same thing to every
  // project on this machine. Criterion C2 of design/messages/ACCEPTANCE.md section 8.
  {
    route: 'PATCH /api/office/worlds/:id',
    why:
      'The id in the path is a world, not a record. A world holds every project it has, so there is no ' +
      'cross-project id to send: renaming it means the same thing whichever project the caller says it is in, ' +
      'and an id no world answers to is refused by name.',
  },
  {
    route: 'POST /api/office/worlds/:id/close',
    why:
      'The id in the path is a world, for the same reason as the route above. A world ending is a fact about the ' +
      'installation rather than about any project in it.',
  },
  {
    route: 'POST /api/office/worlds/:id/stop',
    why:
      'The id in the path is a world, for the same reason as the two routes above. Criterion C32 gives the owner a press ' +
      'that stops a world the owner was asked to look at, and a world runs beside the projects rather than inside one, so ' +
      'the press is about the installation and not about any project in it.',
  },
  {
    route: 'POST /api/office/visits/:id/end',
    why:
      'The id in the path is a visit, which is a citizen of one world working in another. It names two worlds ' +
      'and no project, so there is no cross-project id to refuse.',
  },
  {
    route: 'GET /api/usage/traces/:id',
    why:
      'the parameter is a trace name — a string a caller minted for one piece of work — and not a record id. It ' +
      'names no row that belongs to a project, so there is no cross-project id to refuse: a trace name that ' +
      'nothing was recorded under answers 404 whichever project the caller says it is in, and one that was ' +
      'recorded answers with the calls made under it. The rows themselves carry a workspace, and what the ' +
      'measurement layer scopes by project is every AGGREGATE read over them; this one route opens a named ' +
      'stretch for a developer and is the one place that scope would be a lie, because a piece of work that ' +
      'crossed two projects really did cross two projects.',
  },
  {
    route: 'PATCH /api/implementation/repositories/:id',
    why:
      'the parameter is a repository id, not a record id. `repositoryById(id, workspaceId)` in lib/repositories.ts ' +
      'answers null for a repository in another project, and the route turns that into a 404.',
  },
  {
    route: 'DELETE /api/implementation/repositories/:id',
    why: 'the parameter is a repository id, read through the same `repositoryById(id, workspaceId)`.',
  },
  {
    route: 'POST /api/implementation/:id/accept',
    why:
      'the parameter is an implementation_map row id, not a record id. `statedById(id, workspaceId)` scopes it, and ' +
      'a findings id sent here is answered with what it is rather than with "no such row".',
  },
  {
    route: 'DELETE /api/implementation/:id',
    why: 'the parameter is an implementation_map row id, read through the same `statedById(id, workspaceId)`.',
  },
  {
    route: 'GET /api/kinds/:kind',
    why: 'the parameter is a kind name — module, decision, obligation. The schema is the same in every project.',
  },
  {
    route: 'GET /api/kinds/:kind/compact',
    why:
      'the parameter is the same kind name again, on the cheap form of the same field spec. It is generated ' +
      'from KIND_SPECS, which is the same in every project, so there is no project for the name to be in.',
  },
  {
    route: 'GET /api/participants/:kind/:id',
    why:
      'the parameters are a participant kind and a registry id, not a record id. The two registries are ' +
      'installation-level: the same person and the same durable agent are in every project on this machine, so ' +
      'there is no project for an id to be in and no cross-project id to refuse. The route reads no workspace ' +
      'header at all, which is what makes that true rather than merely stated.',
  },
  {
    route: 'GET /api/participants/:kind/:id/profile',
    why:
      'the same two parameters again, on the read that answers one participant\'s whole page. It DOES read the ' +
      'workspace header, unlike the three routes around it, and that is not a boundary on the parameters: the ' +
      'header decides which project the contact groups and the "filed lately" list are read for, while the ' +
      'participant itself is still the installation\'s. A wrong workspace answers about the wrong project and ' +
      'never about the wrong participant.',
  },
  {
    route: 'PATCH /api/participants/:kind/:id',
    why: 'the same two parameters, read the same way, on the door that changes a name or a state.',
  },
  {
    route: 'POST /api/participants/:kind/:id/avatar',
    why: 'the same two parameters again, on the door that takes a picture somebody sent.',
  },
  {
    route: 'PUT /api/participants/:kind/:id/address-as',
    why: 'the same two parameters again, on the door where a person or an agent says how it wishes to be addressed.',
  },
  {
    route: 'GET /api/participants/person/:id/look',
    why: 'a person\'s registry id, read the same way, on the door that gives one person their look and own themes.',
  },
  {
    route: 'PUT /api/participants/person/:id/look',
    why: 'the same registry id, on the door where that person, or a secretary holding the person\'s grant, sets their look.',
  },
  {
    route: 'GET /api/office/appearance/:agentId',
    why:
      'the parameter is an agent registry id, not a record id. A chosen pixel appearance belongs to the ' +
      'installation and stays the same in every project. The workspace header is validated but does not scope this identity.',
  },
  {
    route: 'PUT /api/office/appearance/:agentId',
    why:
      'the parameter is the same installation-wide agent registry id. The write checks who may change this ' +
      'agent\'s appearance; changing the workspace does not grant that permission or choose another appearance.',
  },
  {
    route: 'GET /api/assets/:id',
    why:
      'the parameter is an `assets` row id, not a record id. A picture belongs to the installation and not to a ' +
      'project — the participant it is drawn for belongs to none either — so there is no project boundary here ' +
      'to cross.',
  },
  // ------------------------------------------------- THE THREE ROUTES OF A GROUP, WHICH MOVED HERE
  //
  // THEY USED TO REFUSE AN ID FROM ANOTHER PROJECT AND NOW THEY ANSWER IT, and that is a decision
  // and not a hole. `t5DlN5-uTZoT`, 6 September 2026: a group follows the conversations. Criterion
  // M55 had already made a private conversation the person's — read across every project, whichever
  // one is open — and a group that stayed one project's made the number on the chat circle add
  // unread messages counted across every project to unread groups counted in one. Two counts about
  // different things in one number. Problem `m1ea9ihnnu9e` has the measurement.
  //
  // THE WRITES MOVED WITH THE READS, on purpose. A group somebody can see from another project and
  // cannot write in is worse than one they cannot see at all, and that was written down as the
  // option rejected when the decision was taken.
  //
  // WHAT STILL BOUNDS THEM. The group row keeps the project it was opened in and a screen draws it;
  // membership is what decides who may write, and `whyReadingSomebodyElsesIsRefused` is what decides
  // who may read one they are not in. Those checks did not move. What went is the project boundary,
  // which was never the thing protecting a group.
  {
    route: 'GET /api/groups/:id',
    why:
      'the id is a group, and a group is the person’s rather than one project’s — decision `t5DlN5-uTZoT`, the ' +
      'same rule criterion M55 gave a private conversation. So there is no cross-project id to refuse: a group ' +
      'opened anywhere is read from anywhere, and an id nothing answers to is refused 404 whichever project the ' +
      'caller names. Who may read a group they are not in is decided by ' +
      '`whyReadingSomebodyElsesIsRefused`, which did not change.',
  },
  {
    route: 'POST /api/groups/:id/members',
    why:
      'the same id and the same decision. The writes go with the reads: a group somebody can see and cannot ' +
      'write in is worse than one they cannot see, which is the option the decision rejected. Who may add ' +
      'somebody is still criterion M11 — any participant may — and the line saying so is filed in the group’s ' +
      'own project rather than in the one the writer had open.',
  },
  {
    route: 'POST /api/groups/:id/members/remove',
    why:
      'the same id and the same decision. Who may take somebody out is still `whyTheRemovalIsRefused`: anybody ' +
      'may leave, a person may take an agent out, and an agent may take nobody else out. That check is about ' +
      'the two participants and never about a project.',
  },
  {
    route: 'PATCH /api/messages/contact-groups/:key',
    why:
      'the parameter is the key of one of this reader’s contact groups — `human`, `agent`, `special`, or the id of ' +
      'one they made — and not a record id. The arrangement belongs to a person and to the installation, not to a ' +
      'project: the registries it arranges are installation-level, so there is no project boundary to cross. The ' +
      'route reads the actor headers to know whose arrangement it is, and a key belonging to somebody else’s ' +
      'arrangement is simply not found.',
  },
  {
    route: 'GET /api/avatars/:set/:name',
    why:
      'the parameters are a set name and a file name, not a record id. These pictures are files in this ' +
      'checkout, offered to every project alike, so there is nothing here that belongs to one project and no ' +
      'cross-project id to refuse. The name is checked against a shape that cannot spell a path, which is what ' +
      'confines it — see `offeredAvatarBytes` in src/server/lib/avatars.ts.',
  },
  {
    route: 'GET /api/portraits/:set/:of/:name',
    why:
      'the three parameters are a set word, a folder and a file name, and none of them is a record id. A role ' +
      'card portrait is a file in this checkout under public/portraits/<role>/, offered to every project alike, ' +
      'and a picture somebody keeps for themselves is under data/portraits/custom/<who>/ on this machine. ' +
      'Neither belongs to one project, so there is no cross-project id to refuse. Each name is checked against a ' +
      'shape that cannot spell a path — see `isAPlainPortraitName` in src/shared/portraits.ts — which is what ' +
      'confines it, and the set word is one of exactly two.',
  },
  {
    route: 'GET /api/chat-circle/:name',
    why:
      'the parameter is the name of one of the four pictures the round chat button may carry, not a record id. ' +
      'Criterion M38: these are files in this checkout and belong to the product rather than to a project or to ' +
      'anybody, so there is no cross-project id to refuse. The name is looked up in the declaration — ' +
      '`CIRCLE_PICTURES` in src/shared/messages.ts — and the FILE comes from there, so nothing a caller types ' +
      'ever reaches a path.',
  },
  {
    route: 'POST /api/resources/:id/release',
    why:
      'the parameter is a ledger row id, not a record id. The row is read by `readRow(id, workspaceId)` in ' +
      'lib/resources.ts, which answers 404 for a row in another project.',
  },
  {
    route: 'POST /api/resources/:id/withdraw',
    why:
      'a ledger row id, as above, and read by the same `readRow(id, workspaceId)`. A row in another project is a ' +
      '404 before anything else is asked.',
  },
  {
    route: 'POST /api/slots/:id/release',
    why:
      'a slot is a ledger row, so the id is a ledger row id, and it is read by `liveRowById(id, workspaceId)` in ' +
      'lib/resources.ts, which answers nothing for a row in another project, so the door answers 404.',
  },
  // THE FOUR DRAFT ROUTES THAT TOOK AN ID ARE GONE. Migration 0196 moved every rough draft into a plan
  // (problem k5FNfdgfxbt2), and a draft is read now as the plan it became, through the plan routes below.
  // THE PLANS. Every one of these takes a plan id or a line id, and neither is a record id. A plan
  // is writing, it belongs to the person rather than to a project, and its tables have no
  // `workspace_id` — so there is no project for one of these routes to be about. See the header of
  // api/plans.ts. The two that reach the project are named separately below.
  { route: 'GET /api/plans/:id', why: 'the parameter is a plan id. A plan belongs to the person and to no project.' },
  { route: 'GET /api/plans/:id/blocks', why: 'a plan id, as above. It reads the plan and decides how its lines are drawn.' },
  { route: 'GET /api/plans/:id/since-read', why: 'a plan id, as above.' },
  {
    route: 'GET /api/plans/:id/context',
    why:
      'a plan id. It is the facts an agent needs to review this plan and it READS ACROSS PROJECTS ON ' +
      'PURPOSE, which is the one thing here worth stating rather than assuming. The projects it reads are ' +
      'the ones the plan itself names — through the records its own lines point at — plus any the caller ' +
      'asks for by name in ?projects=, and `calculated.projectsRead` says which and why for each. That is ' +
      'the same rule the rest of the planning layer follows: a plan spans projects, so it belongs to none, ' +
      'and the only ones read are the ones it already names by id. A project nobody has is REFUSED by ' +
      '`requireWorkspace` rather than read as one holding nothing.',
  },
  {
    route: 'GET /api/plans/:id/reviews',
    why:
      'a plan id. It lists the proposals about this plan, from every project, because a plan belongs to ' +
      'none and an agent files its advice in whichever project it was working in. Answering about one ' +
      'project would hide advice depending on which switch the reader last touched. It writes nothing.',
  },
  { route: 'PATCH /api/plans/:id', why: 'a plan id, as above. It changes the plan and no record.' },
  { route: 'POST /api/plans/:id/read', why: 'a plan id, as above. It stores one moment on the plan.' },
  { route: 'DELETE /api/plans/:id', why: 'a plan id, as above. Records that lines were filed as are untouched.' },
  { route: 'PUT /api/plans/:id/lines', why: 'a plan id, as above. The lines are the plan, not records.' },
  {
    route: 'PUT /api/plans/:id/body',
    why:
      'a plan id, as above. It stores the whole document as text and matches the stored rows to it by their ' +
      'exact characters. It reads no record in any project: the only records it names are the ones the ' +
      'removed lines already pointed at, read by primary key so the reply can say which bindings are gone.',
  },
  { route: 'POST /api/plans/:id/lines', why: 'a plan id, as above.' },
  { route: 'PATCH /api/plans/:id/lines/:lineId', why: 'a plan id and a line id. Neither is a record id.' },
  { route: 'DELETE /api/plans/:id/lines/:lineId', why: 'a plan id and a line id, as above.' },
  {
    route: 'GET /api/plans/:id/lines/:lineId/revisions',
    why:
      'a plan id and a line id. It reads the reasons a line was added, reordered or dropped, which belong ' +
      'to the person and to no project — `plan_line_revisions` carries no `workspace_id` and its `line_id` ' +
      'is deliberately not a foreign key, so a dropped line keeps its reasons. It writes nothing.',
  },
  {
    route: 'POST /api/plans/:id/lines/:lineId/file-as-work',
    why:
      'a plan id and a line id. It CREATES a record, in the project its own body names — the same way ' +
      'POST /api/records does — and it reads no record in any project. A plan spans projects, so which ' +
      'project the new record goes in has to be said rather than assumed.',
  },
  {
    route: 'POST /api/plans/:id/lines/:lineId/give-time',
    why:
      'a plan id and a line id. It writes one allocation naming the record the line was already filed as, ' +
      'which is the same person-level overlay POST /api/planning/allocations writes and is checked by the ' +
      'same rules there.',
  },
  { route: 'PATCH /api/planning/allocations/:id', why: 'the parameter is an allocation id — a slice of time, not a record.' },
  { route: 'DELETE /api/planning/allocations/:id', why: 'the parameter is an allocation id, as above.' },
  {
    route: 'PATCH /api/planning/windows/:id',
    why:
      'the parameter is a window id — the days somebody means to work on something across — and not a record id. ' +
      'A window is person-level for the same reason an allocation is: one person’s week holds work from every ' +
      'project, so the table carries no project column and nothing here can be scoped to one.',
  },
  { route: 'DELETE /api/planning/windows/:id', why: 'the parameter is a window id, as above.' },
  {
    route: 'GET /api/planning/intents/:id',
    why:
      'the parameter is an intent id — the words somebody wrote about time — and not a record id. MEASURED ' +
      'rather than assumed: sent a record id from another project it answers 404 saying no intent has that ' +
      'id, which is "there is no such row" and not "that row is not yours", so it does not belong in REFUSES ' +
      'and its message rightly names no project. Sent a real intent id it answers 200 whatever the project ' +
      'header says, because the whole planning layer takes no project header: a plan is a person-level ' +
      'overlay across work that stays in its own project. See the header of api/planning.ts. It writes nothing.',
  },
  {
    route: 'DELETE /api/planning/intents/:id',
    why:
      'an intent id, as above, and this one REMOVES the words — the way out that has to exist beside the way ' +
      'in, because a line holds one answer about time and a person has to be able to take it off. MEASURED in ' +
      'tests/plan-line-intent.test.ts: sent a record id from another project it answers 404 saying no intent ' +
      'has that id, which is "there is no such row" rather than "that row is not yours", and its message names ' +
      'no project. Sent a real intent id it answers 200 with no project header at all, because the whole ' +
      'planning layer takes none. It removes one row of `planning_intents` and nothing else: words that were ' +
      'never committed were never in any total, so no allocation, no capacity and no record is touched. A ' +
      'COMMITTED one is refused with 409 and told to remove the hours instead, because it is where an ' +
      'allocation came from.',
  },
  {
    route: 'POST /api/planning/intents/:id/commit',
    why:
      'an intent id, as above, and this one WRITES — one ordinary allocation naming the record the intent was ' +
      'already about. MEASURED: it makes that allocation for a record in another project while the header ' +
      'says this one, and it does exactly the same with no header at all, because an allocation belongs to no ' +
      'project. That is the same person-level write POST /api/planning/allocations makes, through the same ' +
      'function — `createAllocation`, with the same kind check, the same period check, the same hours check ' +
      'and the same one-allocation-per-record-per-period rule. There is deliberately no second door into ' +
      '`allocations`. A record id sent here answers 404 for not being an intent, the same as the route above.',
  },
  { route: 'GET /api/planning/:horizon/:period', why: 'the parameters are a horizon and a period — 2026-W36 — and neither is an id.' },
  { route: 'GET /api/planning/review/:horizon/:period', why: 'a horizon and a period, as above.' },
  { route: 'PUT /api/planning/capacity/:horizon/:period', why: 'a horizon and a period, as above.' },
  { route: 'DELETE /api/planning/capacity/:horizon/:period', why: 'a horizon and a period, as above.' },
  { route: 'GET /api/plan-graph/:horizon/:period', why: 'a horizon and a period, as above.' },
  {
    route: 'GET /api/planning/deadline/:id',
    why:
      'READS A RECORD FROM ANY PROJECT, ON PURPOSE. A plan is a person-level overlay across work that stays in ' +
      'its own project — one week holds robotics work, Mole Office work and a dentist appointment — so the whole ' +
      'planning layer takes no workspace header, and asking this route which project it is about would be asking ' +
      'a question it has no answer to. See the header of api/planning.ts. It reads and writes nothing, and every ' +
      "row it answers with says which project owns it.",
  },
  {
    route: 'POST /api/agent/runs/:id/claim',
    why:
      'the parameter is a RUN id, not a record id, and this route is person-level like /api/work and the whole ' +
      'planning layer — it takes no project header at all. A run is claimed by a WORKER, which serves a machine ' +
      'rather than a project: it has no way of knowing which projects exist and cannot poll one queue per project, ' +
      'and a queue answered about whichever project a header happened to name would silently show it nothing. ' +
      'Nothing is being got out of the way. The route reads no record, offers no filter and no search by project, ' +
      'and every run it answers with says which project its conversation is about. Sent a record id it answers 404 ' +
      'for not being a run, which is "there is no such row" rather than "that row is not yours", so its message ' +
      'rightly names no project.',
  },
  {
    route: 'POST /api/agent/runs/:id/result',
    why:
      'a run id, as above, and posted by the same worker that claimed it — `tools/agent-worker.mjs` sends no ' +
      'project header on any of its four requests. It writes the run row and moves the comments that run carried ' +
      'to answered; it touches no record in any project, because a run writes its own work through the ordinary ' +
      'record routes with agent headers, where the change log names it and the human-only gate applies to it.',
  },
  {
    route: 'POST /api/planning/proposals/:id/apply',
    why:
      'READS A RECORD FROM ANY PROJECT, ON PURPOSE, for the same reason: an approved change set may span projects, ' +
      'because a plan does. Every operation inside it names its own project and is checked against that one — see ' +
      'the header of lib/apply.ts — and a delta may never move a record between projects or link across the ' +
      'boundary. Writing to another project is refused there, one operation at a time, rather than here.',
  },
  {
    route: 'GET /api/bundles/:id/as-text',
    why:
      'ANSWERS ABOUT THE PROJECT THE BUNDLE IS IN, ON PURPOSE, because the caller cannot name one. This address ' +
      'is a link a person opens in a browser tab — criterion B29 — and a tab sends none of this app\'s headers, ' +
      'so there is no `x-mole-office-workspace` to read. The alternatives are both worse: falling back to the ' +
      'default project would hand somebody a copy of the wrong project that looked exactly like the right one, ' +
      'and refusing an id from another project would refuse every link to a bundle outside `default`. So the ' +
      'route reads the bundle record, takes the project off the record, and resolves in that one — which is ' +
      'stricter than trusting the address, and cannot answer about a project by accident. It writes nothing.',
  },
  // THE OFFICE'S OWN TERMINALS, wave 13u, src/server/api/terminals.ts.
  {
    route: 'GET /api/terminals/:id/stream',
    why: TERMINAL_WHY,
  },
  {
    route: 'POST /api/terminals/:id/input',
    why: TERMINAL_WHY,
  },
  {
    route: 'POST /api/terminals/:id/resize',
    why: TERMINAL_WHY,
  },
  {
    route: 'POST /api/terminals/:id/close',
    why: TERMINAL_WHY,
  },
  {
    route: 'GET /api/terminals/:id/last-line',
    why: TERMINAL_WHY,
  },
  {
    route: 'POST /api/terminals/:id/keep-my-line',
    why: TERMINAL_WHY,
  },
  {
    route: 'GET /api/terminals/:id/keeping',
    why: TERMINAL_WHY,
  },
  {
    route: 'PUT /api/terminals/:id/keeping',
    why: TERMINAL_WHY,
  },
  // A SECRETARY'S DUTIES, wave 13s round 92, src/server/api/secretary-duties.ts.
  ...['GET /api/secretaries/:agent/duties', 'PUT /api/secretaries/:agent/duties'].map((route) => ({
    route,
    why:
      'The path names an agent by its registry id, which belongs to the installation, not a record id. The duties ' +
      'record is read and written only inside the requested project (`theDutiesRecords` asks for that project), ' +
      'so another project\'s record is neither shown nor changed. The door answers and the one-job settings it ' +
      'shows beside the record are the installation\'s own, and are read live.',
  })),
]

// ============================================================================ the harness

let t: TestDb
let app: FastifyInstance
let listApiRoutes: () => readonly ApiRoute[]
let fixture: Fixture
let seeded: Database.Database

// THE INDEX THE WORK-DOMAIN PROBES REBUILD IS A ONE-FILE TREE, not this checkout (problem _z4u9k08AIJA).
// The observe probe's control request rebuilds the source index, and with nothing set that walks the
// whole checkout: 4,265 files, read, stripped of comments and searched for imports. That took 0.9 s
// of the probe's 1.6 s on a quiet machine on 6 October 2026, and the probe ran 3.8 to 4.6 s under
// load against vitest's 5 s. The control only has to show the route is served in the record's own
// project, and a tree holding the one file the accept probe names does that.
let indexRoot: string
const indexRootBefore = process.env.MOLE_OFFICE_REPO_ROOT

beforeAll(() => {
  indexRoot = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-by-id-boundary-')))
  mkdirSync(join(indexRoot, 'perception/calibration'), { recursive: true })
  writeFileSync(join(indexRoot, 'perception/calibration/wrist.py'), 'def calibrate():\n    pass\n')
  process.env.MOLE_OFFICE_REPO_ROOT = indexRoot
})

// Build and seed one office. Keep a complete database copy in its test folder, including the request log,
// rowids, sequences and triggers. SQLite's backup restores every page in one transaction into the
// same file, so the server keeps its connection and the fixture keeps its own ids. Copying rows
// with DELETE/INSERT would also have to work around the schema's immutable-row triggers.
beforeAll(async () => {
  t = await freshDb()
  workerIdentity = (await import('../src/shared/the-worker-actor.ts')).THE_WORKER
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: officeKey, providers: {} }), { mode: 0o600 })
  const built = await apiApp()
  app = built.app
  listApiRoutes = built.listApiRoutes
  await app.ready()
  for (const [id, title] of [
    [PANELX, 'Mole Office'],
    [ROBOTICS, 'Robotics'],
  ]) {
    const res = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
    expect(res.statusCode, res.body).toBe(201)
  }
  fixture = await seedRobotics()
  const copy = join(dirname(t.file), 'seeded.db')
  await t.client.sqlite.backup(copy)
  seeded = new Database(copy, { readonly: true })
}, 60_000)

beforeEach(async () => {
  await seeded.backup(t.file)
})

afterAll(async () => {
  await app?.close()
  seeded?.close()
  t?.close()
  if (indexRootBefore === undefined) delete process.env.MOLE_OFFICE_REPO_ROOT
  else process.env.MOLE_OFFICE_REPO_ROOT = indexRootBefore
  rmSync(indexRoot, { recursive: true, force: true })
})

/** File a record in robotics, through the route, and hand back its id. */
async function file(kind: string, title: string, data: unknown = {}): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: inWorkspace(ROBOTICS),
    payload: { kind, title, data },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function seedRobotics(): Promise<Fixture> {
  const module = await file('module', 'The wrist camera', {
    context: 'the hand leaves the frame below 300 mm',
    parts: [{ id: 'mount', name: 'Mount and rigid transform', items: [{ id: 'mount-1', text: 'Print the bracket', state: 'todo' }] }],
  })
  const pipeline = await file('pipeline', 'Handover v3', { blockIds: [] })
  const added = await app.inject({
    method: 'POST',
    url: `/api/records/${pipeline}/blocks`,
    headers: inWorkspace(ROBOTICS),
    payload: { name: 'Sense the pot', state: 'todo' },
  })
  expect(added.statusCode, added.body).toBe(201)
  const block = (added.json() as { record: { id: string } }).record.id

  const obligation = await file('obligation', 'Send the calibration write-up')
  const proposal = await file('proposal', 'Position control or force control')
  const note = await file('note', 'A robotics note', { body: 'x' })
  const flow = await file('flow', 'A robotics flow', {
    declared_in: 'tools/test-robotics.mjs', runs: 'the office itself', trigger: 'A test trigger.', leaves_behind: 'a test record',
    stages: [{ n: 1, does: 'A test stage.', why: 'A test reason.', sources: [note] }],
  })
  const session = await file('session', 'A robotics run')
  const conversedRun = await file('session', 'A robotics run with a conversation copy', {
    conversationSync: { state: 'synced', runtime: 'claude-code', providerSession: 'made-up-boundary' },
  })

  const linked = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers: inWorkspace(ROBOTICS),
    payload: { fromId: note, toId: module, type: 'relates_to' },
  })
  expect(linked.statusCode, linked.body).toBe(201)
  const link = (linked.json() as { id: string }).id

  // A conversation about robotics work, with one comment waiting in it. The comment points at the
  // robotics module, so a probe sent with the panelx header is asking about a conversation, a
  // comment AND a context that are all in the other project.
  const started = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: inWorkspace(ROBOTICS),
    payload: { title: 'The wrist camera write-up', mode: 'review' },
  })
  expect(started.statusCode, started.body).toBe(201)
  const thread = (started.json() as { thread: { id: string } }).thread.id

  const said = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: inWorkspace(ROBOTICS),
    payload: {
      intent: 'review',
      body: 'The mount tolerance is not stated anywhere.',
      context: { target: { kind: 'record', recordId: module, workspaceId: ROBOTICS } },
    },
  })
  expect(said.statusCode, said.body).toBe(201)
  const message = (said.json() as { message: { id: string } }).message.id

  // A review of robotics work, started from the robotics module, and one remark left on that same
  // module. Both are in the other project, so a probe sent with the panelx header is asking about a
  // review and a note that belong to somebody else's project.
  const collecting = await app.inject({
    method: 'POST',
    url: '/api/reviews',
    headers: inWorkspace(ROBOTICS),
    payload: { entry: { target: { kind: 'record', recordId: module, workspaceId: ROBOTICS } } },
  })
  expect(collecting.statusCode, collecting.body).toBe(201)
  const review = (collecting.json() as { review: { id: string } }).review.id

  // A work domain in the robotics project. Its two ids are records in that project too, so a probe
  // sent with the panelx header is asking about a declared scope, an agent and a run that all
  // belong to somebody else's project.
  const durableAgent = await file('agent', 'The robotics agent', { handle: 'robotics-cal', state: 'active', workArea: ['src'] })
  const agentsRun = await file('session', 'A run of the robotics agent', { servingAgent: 'robotics-cal' })
  const workDomain = await file('work_domain', 'Wrist camera intrinsics', {
    objective: 'Re-fit the wrist camera and prove the projection error on real frames.',
    agent: durableAgent,
    session,
    writes: ['perception/calibration/wrist.py'],
  })

  // A MESSAGE IN THE ROBOTICS POOL, addressed to the owner, so the two message routes have a
  // cross-project id to be sent.
  const pooled = await file('message', 'A message about the wrist camera', {
    body: 'The wrist camera fit is holding.',
    to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }],
  })

  // A READING OF SOMEBODY ELSE'S FOLDER IN THE ROBOTICS PROJECT, so the two folder-reading routes
  // have a cross-project id to be sent. A reading belongs to one project: the pieces a person
  // accepts become records in it.
  const folderLib = await import('../src/server/lib/folderreading.ts')
  const theReading = folderLib.fileAFolderReading({
    workspaceId: ROBOTICS,
    actorId: 'claude-code/the-reader',
    actorKind: 'agent',
    folder: '/somewhere/a-folder-the-robotics-work-uses',
    pieces: [
      {
        kind: 'note',
        title: 'The folder holds a calibration script',
        data: {},
        from: ['README.md'],
        quote: 'This folder holds the wrist calibration script.',
      },
    ],
  })
  const folderReading = theReading.id
  const folderReadingPiece = (theReading.pieces as { id: string }[])[0]?.id ?? ''

  const annotation = await file('annotation', 'A remark on the wrist camera', {
    body: 'The mount tolerance is not stated anywhere.',
    context: { target: { kind: 'record', recordId: module, workspaceId: ROBOTICS } },
  })

  // A GROUP IN THE ROBOTICS PROJECT, with the owner and the robotics agent in it, so the three group
  // routes have a cross-project id to be sent.
  const opened = await app.inject({
    method: 'POST',
    url: '/api/groups',
    headers: inWorkspace(ROBOTICS),
    payload: {
      name: 'The wrist camera',
      because: 'Two of us are on the wrist camera and this is where it is talked about.',
      members: [
        { who: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, because: 'The owner opened it.' },
        { who: { kind: 'agent', id: 'robotics-cal' }, because: 'It is doing the fit.' },
      ],
    },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  const group = (opened.json() as { group: { id: string } }).group.id

  // A WORK CLAIM IN THE ROBOTICS PROJECT, so the two claim routes with an id have a cross-project id
  // to be sent. It names the robotics module, which is where the record page draws it.
  const claimed = await app.inject({
    method: 'POST',
    url: '/api/claims',
    headers: { ...inWorkspace(ROBOTICS), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'robotics-cal' },
    payload: { run: session, things: [{ what: 'record', id: module }] },
  })
  expect(claimed.statusCode, claimed.body).toBe(201)
  const claim = (claimed.json() as { claim: { id: string } }).claim.id

  // A ROLE REQUEST IN THE ROBOTICS PROJECT, so the two routes that answer one have a cross-project
  // id to be sent. Criterion P65: the asker is the caller and the ANSWERER IS READ FROM THE
  // REGISTRY, so the asker must be an agent an agent started. Three steps, and none of them is
  // decoration: the person says they started the robotics agent, so that agent's chain reaches the person;
  // the robotics agent registers one of its own; and that one asks.
  const owned = await app.inject({
    method: 'PATCH',
    url: '/api/participants/agent/robotics-cal',
    headers: inWorkspace(ROBOTICS),
    payload: { startedBy: 'me' },
  })
  expect(owned.statusCode, owned.body).toBe(200)
  const asAgentOfRobotics = {
    ...inWorkspace(ROBOTICS),
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'robotics-cal',
  }
  const junior = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgentOfRobotics,
    payload: { handle: 'robotics-junior', name: 'The robotics junior' },
  })
  expect(junior.statusCode, junior.body).toBe(201)
  const askedForARung = await app.inject({
    method: 'POST',
    url: '/api/roles/requests',
    headers: {
      ...inWorkspace(ROBOTICS),
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'robotics-junior',
    },
    payload: { asking: 'supervisor', because: 'The wrist camera needs more than one worker.' },
  })
  expect(askedForARung.statusCode, askedForARung.body).toBe(201)
  const roleRequest = (askedForARung.json() as { request: string }).request

  return {
    module,
    pipeline,
    block,
    obligation,
    proposal,
    note,
    flow,
    session,
    link,
    thread,
    message,
    pooled,
    folderReading,
    folderReadingPiece,
    review,
    annotation,
    workDomain,
    agent: durableAgent,
    agentsRun,
    group,
    claim,
    roleRequest,
    conversedRun,
  }
}

/**
 * The whole database, as a string: one row count per table, plus every record row in full.
 *
 * The counts catch a row appearing anywhere — a block, a link, a change, an arrangement. The record
 * rows catch a write that changes a row without making a new one, which is what the measured defect
 * did: `DELETE` set `deleted_at` on a record in another project and answered 200.
 */
/**
 * EVERY TABLE'S ROW COUNT AND EVERY RECORD, AS ONE STRING, EXCEPT THE REQUEST LOG.
 *
 * The request log is TWO TABLES SINCE CRITERION U6 and both are left out, which is not a hole. A
 * request writes one `api_calls` row, or — at a folded long-poll operation — one counted row in
 * `hourly_calls` instead, INCLUDING a refused request, on purpose: a call that was turned away is
 * the evidence the measurement layer exists to keep, not a gap in it. Counting either here would
 * make "the refused request wrote to the database" true of every refusal in this file and say
 * nothing about the boundary. The test below asserts the request log's own row separately, over
 * both tables, so nothing goes unwatched.
 */
function databaseNow(): string {
  const tables = (
    t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string
    }[]
  )
    .map((row) => row.name)
    .filter((name) => name !== 'api_calls' && name !== 'hourly_calls')
  // This authored child table is watched too, even though no read door addresses its rows yet.
  expect(tables).toContain('test_file_runs')
  const counts = tables.map((name) => {
    const { n } = t.client.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }
    return `${name}=${n}`
  })
  const rows = t.client.sqlite.prepare('SELECT * FROM records ORDER BY id').all()
  return `${counts.join(' ')}\n${JSON.stringify(rows)}`
}

/** How many requests this server has recorded, in either half of the request log. */
function requestLogRows(): number {
  const calls = t.client.sqlite.prepare('SELECT count(*) AS n FROM api_calls').get() as { n: number }
  const counted = t.client.sqlite.prepare('SELECT count(*) AS n FROM hourly_calls').get() as { n: number }
  return calls.n + counted.n
}

describe('private attempt identifiers belong to a proved browser, not a project', () => {
  it('leaves production unavailable until the host prerequisites are verified', async () => {
    const { createPrivateLogin } = await import('../src/holder/private-sandbox-login.mjs')
    const service = createPrivateLogin()
    expect(service.capability().available).toBe(false)
    const { settings, originsAPageMayBeOn } = await import('../src/config/settings.mjs')
    const headers = { ...inWorkspace(PANELX), origin: originsAPageMayBeOn(settings())[0]!, 'x-private-login-binding': 'a'.repeat(32) }
    const cap = await app.inject({ method: 'GET', url: '/api/office/sandbox-logins/claude/capability', headers })
    expect(cap.statusCode, cap.body).toBe(200)
    expect(cap.json().available).toBe(false)
    const start = await app.inject({ method: 'POST', url: '/api/office/sandbox-logins/claude/attempts', headers: { ...headers, 'x-private-login-generation': cap.json().generation }, payload: { nonce: 'b'.repeat(32) } })
    expect(start.statusCode, start.body).toBe(503)
    service.close()
  })

  it.each(PRIVATE_LOGIN_ROUTES.filter(({ path }) => path.includes('/:attempt/')))(
    '$action uses the private binding across projects and refuses a different owner, device, session or generation',
    async ({ method, path, action }) => {
      const { createPrivateLogin } = await import('../src/holder/private-sandbox-login.mjs')
      const { privateLoginDoors } = await import('../src/server/lib/sandbox-login-addition/attempts.ts')
      const { settings, originsAPageMayBeOn } = await import('../src/config/settings.mjs')
      const terminals = await import('../src/server/lib/terminals.ts')
      const origin = originsAPageMayBeOn(settings())[0]!
      const keys: string[] = []
      // The real pairing doors prove two different devices; no key or permission is invented in the registry.
      for (const device of ['Invented attempt browser', 'Invented other browser']) {
        const paired = await app.inject({ method: 'POST', url: '/api/office/visitors', headers: inWorkspace(PANELX), payload: { device } })
        expect(paired.statusCode, paired.body).toBe(201)
        const confirmed = await app.inject({ method: 'POST', url: `/api/office/visitors/${paired.json().credential.id}/confirm`, headers: inWorkspace(PANELX), payload: {} })
        expect(confirmed.statusCode, confirmed.body).toBe(200)
        keys.push(paired.json().token)
      }
      let native!: Parameters<VerifiedNativeAdapter['start']>[0]
      const child = { pgid: 987654, identity: 'invented-attempt-process', matchesIdentity: () => true, signalGroup: vi.fn(), disposeScratch: vi.fn(), clear: vi.fn(), writeCode: vi.fn() }
      const adapter: VerifiedNativeAdapter = {
        version: 1, executable: '/invented/private-helper', args: [], allowedSignInOrigins: ['https://signin.invalid'],
        verified: { protocol: true, callback: true, code: true, storageIsolation: true, dumpPrevention: true, ownerWatch: true },
        createParser: () => ({ feed: (_channel, bytes) => [JSON.parse(Buffer.from(bytes).toString())], clear: () => {} }),
        start: vi.fn((callbacks) => { native = callbacks; return child }),
      }
      const pool = { available: () => true, add: vi.fn(async () => ({ letter: 'E', sha12: 'a'.repeat(12) })) }
      const service = createPrivateLogin({ adapter, pool })
      const transport = vi.spyOn(terminals, 'askPrivateLoginHolder').mockImplementation(request => service.handle(request))
      try {
        const headers = {
          ...inWorkspace(PANELX), origin, 'x-mole-office-key': keys[0]!,
          'x-mole-office-session': 'invented-attempt-session', 'x-private-login-binding': 'c'.repeat(32),
        }
        const before = databaseNow()
        const cap = await app.inject({ method: 'GET', url: '/api/office/sandbox-logins/claude/capability', headers })
        expect(cap.statusCode, cap.body).toBe(200)
        expect(cap.json().available).toBe(true)
        const bound = { ...headers, 'x-private-login-generation': cap.json().generation as string }
        const started = await app.inject({ method: 'POST', url: '/api/office/sandbox-logins/claude/attempts', headers: bound, payload: { nonce: 'd'.repeat(32) } })
        expect(started.statusCode, started.body).toBe(200)
        const attempt = started.json().attempt as string
        expect(attempt).toMatch(/^[a-f0-9]{32}$/)
        expect(t.client.sqlite.prepare('SELECT id FROM records WHERE id = ?').get(attempt)).toBeUndefined()
        native.output('stdout', Buffer.from(JSON.stringify({ type: 'sign-in', url: 'https://signin.invalid/authorize' })))
        native.output('stdout', Buffer.from(JSON.stringify({ type: 'code' })))
        const url = `/api${path.replace(':attempt', attempt)}`
        const payload = method === 'GET' ? {} : { payload: action === 'code' ? { code: 'invented-private-code' } : {} }
        for (const changed of [
          { 'x-mole-office-key': keys[1]! }, { 'x-mole-office-session': 'invented-other-session' },
          { 'x-private-login-generation': '0'.repeat(32) }, { 'x-private-login-binding': '0'.repeat(32) },
          { origin: 'https://other.invalid' },
        ]) {
          const denied = await app.inject({ method, url, headers: { ...bound, ...changed }, ...payload })
          expect(denied.statusCode, denied.body).toBe(409)
          expect(denied.json().code, Object.keys(changed).join(',') + ': ' + denied.body).toBe('privateLoginBinding')
        }
        expect(child.writeCode).not.toHaveBeenCalled()
        expect(child.signalGroup).not.toHaveBeenCalled()
        // A project change keeps this same proved browser and attempt; it must still reach the job.
        const own = await app.inject({ method, url, headers: { ...bound, 'x-mole-office-workspace': ROBOTICS }, ...payload })
        expect(own.statusCode, own.body).toBe(200)
        expect(own.headers['cache-control']).toBe('no-store')
        expect(own.json()).toMatchObject(action === 'sign-in' ? { url: 'https://signin.invalid/authorize' } : action === 'disconnect' ? { disconnected: true } : { attempt })
        expect(pool.add).not.toHaveBeenCalled()
        expect(adapter.start).toHaveBeenCalledTimes(1)
        expect(databaseNow(), 'private attempts must not create or change project records').toBe(before)
        // Change only the owner in an otherwise identical invented context, through the production door service.
        const ownerService = createPrivateLogin({ adapter, pool })
        try {
          const door = privateLoginDoors({ transport: request => ownerService.handle(request), generation: bound['x-private-login-generation'], allowedOrigins: [origin] })
          const context = { person: true, permittedReach: true, owner: 'invented-owner', device: 'invented-device', session: 'invented-session' }
          const state = await door.act('start', context, bound, { nonce: 'e'.repeat(32) })
          expect(await door.act('status', context, bound, {}, state.attempt)).toMatchObject({ attempt: state.attempt })
          await expect(door.act('status', { ...context, owner: 'invented-other-owner' }, bound, {}, state.attempt)).rejects.toMatchObject({ reason: 'Binding' })
        } finally { ownerService.close() }

      } finally {
        transport.mockRestore()
        service.close()
      }
    },
  )
})

// ============================================================================ the walk

describe('every route with an id in its path is classified', () => {
  it('leaves no route unaccounted for, and names nothing the router does not serve', () => {
    const withParameters = listApiRoutes()
      .filter((route) => route.path.includes(':'))
      .map((route) => `${route.method} ${route.path}`)

    const classified = new Set([...REFUSES.map((p) => p.route), ...NOT_A_RECORD_BY_ID.map((r) => r.route)])

    // THE HALF THAT COVERS NEXT YEAR'S ROUTE. A route with an id in its path that nobody has said
    // anything about fails here, by name, rather than shipping unscoped in silence.
    const unclassified = withParameters.filter((route) => !classified.has(route))
    expect(
      unclassified,
      'these routes take an id in the path and are in neither table. Send each one a cross-project id: ' +
        'if it must refuse, add it to REFUSES; if it reads across projects on purpose, add it to ' +
        'NOT_A_RECORD_BY_ID with the reason.',
    ).toEqual([])

    // And the other half: a table entry naming a route the router does not serve is a stale test
    // that has stopped covering anything — a renamed path would otherwise leave a green line behind.
    const served = new Set(withParameters)
    expect([...classified].filter((route) => !served.has(route)).sort()).toEqual([])
  })

  it('exercises every route it claims to, exactly once', () => {
    // Two entries for one route would make the count above pass while one of them silently did the
    // work of both. Each probe here stands for one route.
    const seen = REFUSES.map((p) => p.route)
    expect([...new Set(seen)].length).toBe(seen.length)
  })
})

/**
 * THE ROUTES WHOSE PROBE RAN TO ITS LAST ASSERTION, read by the case at the end of this file. On 17 October 2026 the
 * file ran out of memory after 162 of its 171 tests. Eight probes and one other test never ran. Vitest exited 1, but
 * its own JSON report of that run said it had succeeded, with no test failed and none pending.
 */
const probesThatRanToTheEnd = new Set<string>()

describe('a route with an id in its path refuses an id from another project', () => {
  it.each(REFUSES.map((probe) => [`${probe.route} — ${probe.what}`, probe] as const))(
    '%s',
    async (_name, probe) => {
      const before = databaseNow()
      const logBefore = requestLogRows()

      const crossing = await app.inject({
        method: probe.method,
        url: probe.url(fixture),
        headers: probeHeaders(PANELX, probe.asWorker),
        ...(probe.payload === undefined ? {} : { payload: probe.payload(fixture) }),
      })

      expect(crossing.statusCode, `answered ${crossing.statusCode}: ${crossing.body}`).toBe(404)
      // THE REFUSAL SAYS WHERE THE RECORD IS. Nothing is being hidden — there is no access model
      // here, and the same caller gets the record by sending one header — so a refusal that did not
      // name the project would send a reader hunting for a record that is right there.
      expect(crossing.body, 'the refusal does not say which project the id is really in').toContain(ROBOTICS)
      expect(databaseNow(), 'the refused request wrote to the database').toBe(before)
      // THE ONE TABLE THE REFUSAL DOES MOVE, asserted rather than excluded and forgotten. A refused
      // call is one row in the request log, carrying the 404 it got.
      expect(requestLogRows() - logBefore, 'the refused request was not recorded').toBe(1)

      // THE CONTROL. Without it, a probe aimed at a URL the router does not serve would 404 and
      // read as the boundary working.
      const own = await app.inject({
        method: probe.method,
        url: probe.url(fixture),
        headers: probeHeaders(ROBOTICS, probe.asWorker),
        ...(probe.payload === undefined ? {} : { payload: probe.payload(fixture) }),
      })
      expect(own.statusCode, `the same request in the record's own project answered 404: ${own.body}`).not.toBe(404)
      probesThatRanToTheEnd.add(probe.route)
    },
  )
})


// EVERY PROBE RAN TO ITS END, counted, and this is the file's last test. Vitest runs a file's tests in order, so it
// comes after every probe. A probe left out of the run, taken out by a filter or ended early by a return makes it fail
// by the route's name. A file that dies before here never shows this test passed.
describe('every probe in REFUSES', () => {
  it('ran to its last assertion, one probe for each route', () => {
    expect(
      REFUSES.map((probe) => probe.route).filter((route) => !probesThatRanToTheEnd.has(route)),
      'these routes are in REFUSES, and their probe did not run to its end in this run of the file',
    ).toEqual([])
  })
})
